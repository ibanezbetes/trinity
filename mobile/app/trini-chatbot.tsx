import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCognitoAuth } from '../src/context/CognitoAuthContext';
import { TriniChat, MovieCardsSwiper } from '../src/components';
import { colors, spacing, fontSize } from '../src/utils/theme';

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

export default function TriniChatbotScreen() {
  const { user } = useCognitoAuth();
  const [showChat, setShowChat] = useState(true);
  const [recommendations, setRecommendations] = useState<MovieRecommendation[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const handleRecommendationsReceived = (newRecommendations: MovieRecommendation[]) => {
    console.log('📱 Received recommendations:', newRecommendations);
    setRecommendations(newRecommendations);
    if (newRecommendations.length > 0) {
      setShowChat(false); // Switch to cards view
    }
  };

  const handleCardSwipe = (direction: 'left' | 'right', movie: any) => {
    console.log(`📱 Card swiped ${direction}:`, movie.title);
    // Here you could track user preferences or send feedback to Trini
  };

  const handleAddToRoom = (movie: any) => {
    console.log('📱 Add to room:', movie.title);
    // TODO: Implement room integration
    // This would call the addTriniRecommendationToRoom GraphQL mutation
  };

  const handleBackToChat = () => {
    setShowChat(true);
  };

  const handleNewChat = () => {
    setRecommendations([]);
    setCurrentSessionId(null);
    setShowChat(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Trini</Text>
          <Text style={styles.headerSubtitle}>Tu asistente de cine con IA</Text>
        </View>

        <View style={styles.headerActions}>
          {!showChat && recommendations.length > 0 && (
            <TouchableOpacity onPress={handleBackToChat} style={styles.headerButton}>
              <Ionicons name="chatbubble-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
          
          <TouchableOpacity onPress={handleNewChat} style={styles.headerButton}>
            <Ionicons name="add" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <KeyboardAvoidingView 
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {showChat ? (
          <TriniChat
            visible={true}
            onClose={() => {}} // Not used in full screen mode
            onRecommendationsReceived={handleRecommendationsReceived}
            sessionId={currentSessionId}
            onSessionIdChange={setCurrentSessionId}
          />
        ) : (
          <View style={styles.cardsContainer}>
            <View style={styles.cardsHeader}>
              <Text style={styles.cardsTitle}>Recomendaciones de Trini</Text>
              <Text style={styles.cardsSubtitle}>
                Desliza las cartas para indicar tus preferencias
              </Text>
            </View>
            
            <MovieCardsSwiper
              recommendations={recommendations}
              onCardSwipe={handleCardSwipe}
              onAddToRoom={handleAddToRoom}
              showAddToRoom={false} // TODO: Enable when room integration is ready
            />
            
            <View style={styles.cardsFooter}>
              <TouchableOpacity 
                style={styles.backToChatButton}
                onPress={handleBackToChat}
              >
                <Ionicons name="chatbubble" size={20} color="#fff" />
                <Text style={styles.backToChatText}>Volver al chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backButton: {
    padding: spacing.sm,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  content: {
    flex: 1,
  },
  cardsContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  cardsHeader: {
    padding: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardsTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  cardsSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  cardsFooter: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backToChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 25,
    gap: spacing.sm,
  },
  backToChatText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});