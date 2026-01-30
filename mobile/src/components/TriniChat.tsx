import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { aiService, TriniResponse } from '../services/aiService';

interface Message {
  id: string;
  text: string;
  isTrini: boolean;
  genres?: string[];
  movies?: Array<{
    id: number;
    title: string;
    overview: string;
    poster_path: string;
    vote_average: number;
    release_date: string;
  }>;
  timestamp: Date;
}

interface TriniChatProps {
  visible: boolean;
  onClose: () => void;
  onRecommendationsReceived?: (recommendations: MovieRecommendation[]) => void;
  sessionId?: string | null;
  onSessionIdChange?: (sessionId: string) => void;
}

interface MovieRecommendation {
  movie: {
    id: number;
    title: string;
    overview: string;
    poster_path: string;
    vote_average: number;
    release_date: string;
  };
  relevanceScore: number;
  reasoning?: string;
}

// Saludo inicial hardcodeado de Trini
const TRINI_GREETING = "Hola, soy Trini. ¿Qué te apetece ver hoy?";

export default function TriniChat({ 
  visible, 
  onClose, 
  onRecommendationsReceived,
  sessionId,
  onSessionIdChange
}: TriniChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(100)).current;

  // Inicializar con el saludo de Trini
  useEffect(() => {
    if (visible && messages.length === 0) {
      setMessages([{
        id: 'greeting',
        text: TRINI_GREETING,
        isTrini: true,
        timestamp: new Date(),
      }]);
    }
  }, [visible]);

  // Animación de entrada
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(100);
    }
  }, [visible]);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim(),
      isTrini: false,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const response: TriniResponse = await aiService.getChatRecommendations(userMessage.text);
      
      const triniMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.chatResponse,
        isTrini: true,
        genres: response.recommendedGenres,
        movies: response.recommendedMovies,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, triniMessage]);

      // Update session ID if provided
      if (response.sessionId && onSessionIdChange) {
        onSessionIdChange(response.sessionId);
      }

      // Transform and notify about recommendations
      if (response.recommendedMovies && response.recommendedMovies.length > 0 && onRecommendationsReceived) {
        const recommendations: MovieRecommendation[] = response.recommendedMovies.map(movie => ({
          movie: {
            id: movie.id,
            title: movie.title,
            overview: movie.overview,
            poster_path: movie.poster_path,
            vote_average: movie.vote_average,
            release_date: movie.release_date
          },
          relevanceScore: 0.8, // Default relevance score
          reasoning: response.reasoning || `Recomendada por Trini basada en tu consulta`
        }));
        
        console.log('✅ Trini recommendations received successfully:', recommendations.length, 'movies');
        onRecommendationsReceived(recommendations);
      } else if (response.recommendedMovies && response.recommendedMovies.length === 0) {
        console.log('ℹ️ Trini response received but no movie recommendations (likely asking for clarification)');
      }

      // Legacy support for genre selection
      if (response.recommendedGenres && response.recommendedGenres.length > 0) {
        // onGenresSelected is no longer used, but keeping for compatibility
      }
    } catch (error) {
      console.error('Error getting Trini response:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: 'Ups, algo salió mal. ¿Puedes intentarlo de nuevo?',
        isTrini: true,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setMessages([]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="none" transparent statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
            {/* Header */}
            <LinearGradient colors={[colors.primary, '#6366F1']} style={styles.header}>
              <View style={styles.headerContent}>
                <View style={styles.triniAvatar}>
                  <Text style={styles.triniEmoji}>🎬</Text>
                </View>
                <View style={styles.headerText}>
                  <Text style={styles.headerTitle}>Trini</Text>
                  <Text style={styles.headerSubtitle}>Tu asistente de cine</Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </LinearGradient>

            {/* Messages */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.messagesContainer}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && (
                <View style={styles.loadingContainer}>
                  <View style={styles.loadingBubble}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.loadingText}>Trini está pensando...</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Input */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Cuéntame cómo te sientes..."
                placeholderTextColor={colors.textMuted}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
                editable={!isLoading}
              />
              <TouchableOpacity 
                onPress={handleSend} 
                disabled={!inputText.trim() || isLoading}
                style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
              >
                <LinearGradient 
                  colors={inputText.trim() && !isLoading ? [colors.primary, '#6366F1'] : [colors.surface, colors.surface]} 
                  style={styles.sendButtonGradient}
                >
                  <Ionicons name="send" size={20} color={inputText.trim() && !isLoading ? '#fff' : colors.textMuted} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}


function MessageBubble({ message }: { message: Message }) {
  return (
    <View style={[styles.messageBubbleContainer, message.isTrini ? styles.triniMessage : styles.userMessage]}>
      {message.isTrini && (
        <View style={styles.messageAvatar}>
          <Text style={styles.avatarEmoji}>🎬</Text>
        </View>
      )}
      <View style={[styles.messageBubble, message.isTrini ? styles.triniBubble : styles.userBubble]}>
        <Text style={[styles.messageText, message.isTrini ? styles.triniText : styles.userText]}>
          {message.text}
        </Text>
        
        {/* Mostrar películas recomendadas */}
        {message.movies && message.movies.length > 0 && (
          <View style={styles.moviesContainer}>
            <Text style={styles.moviesTitle}>🎬 Películas recomendadas:</Text>
            {message.movies.map((movie, index) => (
              <View key={movie.id} style={styles.movieCard}>
                <Text style={styles.movieTitle}>{movie.title}</Text>
                <Text style={styles.movieOverview} numberOfLines={2}>
                  {movie.overview}
                </Text>
                <View style={styles.movieMeta}>
                  <Text style={styles.movieRating}>⭐ {movie.vote_average.toFixed(1)}</Text>
                  <Text style={styles.movieYear}>
                    {movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
        
        {/* Mostrar géneros */}
        {message.genres && message.genres.length > 0 && (
          <View style={styles.genresContainer}>
            {message.genres.map((genre, index) => (
              <View key={index} style={styles.genreTag}>
                <Text style={styles.genreText}>{genre}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    minHeight: '60%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  triniAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  triniEmoji: {
    fontSize: 24,
  },
  headerText: {
    gap: 2,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  messageBubbleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  triniMessage: {
    justifyContent: 'flex-start',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEmoji: {
    fontSize: 16,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  triniBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  triniText: {
    color: colors.textPrimary,
  },
  userText: {
    color: '#fff',
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  genreTag: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  genreText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
  },
  moviesContainer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  moviesTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  movieCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  movieTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  movieOverview: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    lineHeight: 16,
    marginBottom: spacing.xs,
  },
  movieMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  movieRating: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
  },
  movieYear: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  loadingContainer: {
    alignItems: 'flex-start',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    maxHeight: 100,
    minHeight: 44,
  },
  sendButton: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonGradient: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
