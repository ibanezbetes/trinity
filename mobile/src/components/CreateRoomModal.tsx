import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppSync } from '../services/apiClient';
import { cognitoAuthService } from '../services/cognitoAuthService';
import { useGenres } from '../hooks/useGenres';
import { MediaType, Genre } from '../types/content-filtering';
import { borderRadius, colors, fontSize, shadows, spacing } from '../utils/theme';

const { width, height } = Dimensions.get('window');

// Posters para el fondo animado
const MOVIE_POSTERS = [
  'https://image.tmdb.org/t/p/w200/qNBAXBIQlnOThrVvA6mA2B5ber9.jpg',
  'https://image.tmdb.org/t/p/w200/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
  'https://image.tmdb.org/t/p/w200/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
  'https://image.tmdb.org/t/p/w200/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg',
  'https://image.tmdb.org/t/p/w200/velWPhVMQeQKcxggNEU8YmIo52R.jpg',
  'https://image.tmdb.org/t/p/w200/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
];

type Step = 'initial' | 'preferences' | 'participants' | 'share';

interface CreateRoomModalProps {
  visible: boolean;
  onClose: () => void;
  onGoToRooms: () => void;
  onRoomCreated?: (room: any) => void; // Using any for GraphQL response
}

// Iconos por defecto para géneros (fallback si no se especifica)
const DEFAULT_GENRE_ICONS: { [key: string]: string } = {
  // Movie genres
  'Action': '💥',
  'Adventure': '🗺️',
  'Animation': '🎨',
  'Comedy': '😂',
  'Crime': '🔍',
  'Documentary': '📹',
  'Drama': '🎭',
  'Family': '👨‍👩‍👧‍👦',
  'Fantasy': '🧙',
  'History': '📜',
  'Horror': '👻',
  'Music': '🎵',
  'Mystery': '🔍',
  'Romance': '💕',
  'Science Fiction': '🚀',
  'TV Movie': '📺',
  'Thriller': '😱',
  'War': '⚔️',
  'Western': '🤠',
  // TV genres
  'Action & Adventure': '🗺️',
  'Kids': '👶',
  'News': '📰',
  'Reality': '📺',
  'Sci-Fi & Fantasy': '🚀',
  'Soap': '🧼',
  'Talk': '💬',
  'War & Politics': '🏛️',
  // Spanish translations
  'Acción': '💥',
  'Aventura': '🗺️',
  'Animación': '🎨',
  'Comedia': '😂',
  'Crimen': '🔍',
  'Documental': '📹',
  'Drama': '🎭',
  'Fantasía': '🧙',
  'Terror': '👻',
  'Romance': '💕',
  'Ciencia Ficción': '🚀',
  'Thriller': '😱',
  'Misterio': '🔍',
  'Historia': '📜',
  'Familia': '👨‍👩‍👧‍👦',
  'Música': '🎵',
  'Guerra': '⚔️',
  'Western': '🤠',
};

export default function CreateRoomModal({ visible, onClose, onGoToRooms, onRoomCreated }: CreateRoomModalProps) {
  const appSync = useAppSync();
  const [step, setStep] = useState<Step>('initial');
  const [aiPrompt, setAiPrompt] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('MOVIE'); // Tipo de contenido
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]); // Cambiar a number[] para IDs
  const [participants, setParticipants] = useState(2);
  const [roomCode, setRoomCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [movieCount, setMovieCount] = useState(0);
  const [creatingStatus, setCreatingStatus] = useState('');

  // Hook para cargar géneros dinámicamente según el tipo de media
  const { genres, loading: genresLoading, error: genresError, refetch: refetchGenres } = useGenres(mediaType);

  // Animaciones
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const posterScrollAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
      scaleAnim.setValue(0.9);

      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 65, friction: 10, useNativeDriver: true }),
      ]).start();

      // Animación continua de posters
      Animated.loop(
        Animated.timing(posterScrollAnim, { toValue: 1, duration: 20000, useNativeDriver: true })
      ).start();
    }
  }, [visible]);

  const resetAndClose = () => {
    setStep('initial');
    setAiPrompt('');
    setMediaType('MOVIE'); // Reset mediaType
    setSelectedGenres([]); // Reset géneros seleccionados
    setParticipants(2);
    setRoomCode('');
    setRoomName('');
    setIsCreating(false);
    onClose();
  };

  // Función para cambiar el tipo de media y resetear géneros
  const handleMediaTypeChange = (newMediaType: MediaType) => {
    console.log(`🎬 Changing media type from ${mediaType} to ${newMediaType}`);
    setMediaType(newMediaType);
    setSelectedGenres([]); // Limpiar géneros seleccionados al cambiar tipo de media
  };

  // Función para obtener el icono de un género
  const getGenreIcon = (genreName: string): string => {
    return DEFAULT_GENRE_ICONS[genreName] || '🎬';
  };

  const toggleGenre = (id: number) => {
    setSelectedGenres(prev => {
      // Limitar a máximo 3 géneros
      if (prev.includes(id)) {
        return prev.filter(g => g !== id);
      } else if (prev.length >= 3) {
        Alert.alert('Límite alcanzado', 'Puedes seleccionar máximo 3 géneros');
        return prev;
      } else {
        return [...prev, id];
      }
    });
  };

  const createRoom = async () => {
    setIsCreating(true);
    setCreatingStatus('Verificando autenticación...');

    // Check Cognito authentication using proper service
    try {
      const authResult = await cognitoAuthService.checkStoredAuth();
      if (!authResult.isAuthenticated) {
        Alert.alert('Sesión expirada', 'Por favor, inicia sesión de nuevo.');
        setIsCreating(false);
        setCreatingStatus('');
        return;
      }
    } catch (error) {
      console.error('❌ Auth check failed:', error);
      Alert.alert('Error de autenticación', 'No se pudo verificar tu sesión. Inicia sesión de nuevo.');
      setIsCreating(false);
      setCreatingStatus('');
      return;
    }

    setCreatingStatus('Preparando sala...');

    const name = aiPrompt
      ? aiPrompt.substring(0, 30)
      : selectedGenres.length > 0
        ? `Búsqueda: ${genres.find(g => g.id === selectedGenres[0])?.name}`
        : 'Nueva sala';

    try {
      setCreatingStatus('Creando sala con GraphQL...');

      console.log('🚨🚨🚨 CreateRoomModal - About to call createRoom with:', {
        name,
        mediaType,
        genreIds: selectedGenres.map(id => parseInt(id)),
        maxMembers: participants
      });

      // Use AppSync GraphQL with new content filtering parameters
      const response = await appSync.createRoom({
        name,
        mediaType, // Tipo de contenido (MOVIE o TV)
        genreIds: selectedGenres, // IDs de géneros como números
        maxMembers: participants,
        isPrivate: false,
        genrePreferences: selectedGenres.map(id => id.toString()), // DEPRECATED: Mantener por compatibilidad
      });

      console.log('✅ CreateRoomModal - Room created via AppSync:', response);

      // Extract room data from GraphQL response
      const room = response.createRoom;

      setCreatingStatus('¡Sala creada exitosamente!');
      setRoomCode(room.inviteCode);
      setRoomName(room.name);
      setRoomId(room.id);
      setMovieCount(0); // GraphQL response doesn't include masterList count yet
      setStep('share');

      if (onRoomCreated) onRoomCreated(room);

    } catch (error: any) {
      console.error('❌❌❌ CreateRoomModal - Error creating room via AppSync:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });

      let errorMessage = 'No se pudo crear la sala. Inténtalo de nuevo.';

      // Handle GraphQL errors
      if (error.message) {
        if (error.message.includes('Unauthorized') || error.message.includes('401')) {
          errorMessage = 'Tu sesión ha expirado. Por favor, inicia sesión de nuevo.';
        } else if (error.message.includes('ValidationException')) {
          errorMessage = 'Datos de entrada inválidos. Verifica la información.';
        } else {
          errorMessage = error.message;
        }
      }

      Alert.alert('Error', errorMessage);
    } finally {
      setIsCreating(false);
      setCreatingStatus('');
    }
  };

  const shareViaWhatsApp = () => {
    const url = `https://trinity.app/room/${roomCode}`;
    const message = `¡Únete a mi sala en Trinity! ${url}`;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`);
  };

  const copyLink = async () => {
    const url = `https://trinity.app/room/${roomCode}`;
    await Share.share({ message: url });
  };

  const renderInitialStep = () => {
    const translateX = posterScrollAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -width * 0.5],
    });

    return (
      <View style={styles.initialContainer}>
        {/* Fondo de posters animado */}
        <View style={styles.posterBg}>
          <Animated.View style={[styles.posterRow, { transform: [{ translateX }] }]}>
            {[...MOVIE_POSTERS, ...MOVIE_POSTERS].map((poster, i) => (
              <Image key={i} source={{ uri: poster }} style={styles.posterThumb} blurRadius={2} />
            ))}
          </Animated.View>
          <LinearGradient
            colors={['rgba(21, 21, 32, 0.4)', 'rgba(21, 21, 32, 0.95)', colors.surface]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Círculos decorativos */}
        <View style={styles.glowPurple} />
        <View style={styles.glowCyan} />

        {/* Logo Trinity animado */}
        <Animated.View style={[styles.logoCircle, { transform: [{ scale: scaleAnim }] }]}>
          <LinearGradient
            colors={['rgba(139, 92, 246, 0.3)', 'rgba(6, 182, 212, 0.2)']}
            style={styles.logoGlow}
          />
          <View style={styles.logoInner}>
            <LinearGradient colors={[colors.secondary, colors.secondaryLight]} style={[styles.logoBar, styles.logoBarBlue]} />
            <LinearGradient colors={[colors.primary, colors.primaryLight]} style={[styles.logoBar, styles.logoBarPurple]} />
            <LinearGradient colors={[colors.accent, colors.accentLight]} style={[styles.logoBar, styles.logoBarRed]} />
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Text style={styles.initialTitle}>¿Qué deseas hacer?</Text>
          <Text style={styles.initialSubtitle}>Crea una nueva sala o revisa tus salas activas</Text>
        </Animated.View>

        <Animated.View style={[styles.optionsContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity
            style={styles.primaryOption}
            onPress={() => setStep('preferences')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[colors.primary, '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryOptionGradient}
            >
              <View style={styles.optionIcon}>
                <Ionicons name="add" size={24} color="#FFF" />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Crear nueva sala</Text>
                <Text style={styles.optionSubtitle}>Configura filtros y empieza</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryOption}
            onPress={() => { resetAndClose(); onGoToRooms(); }}
            activeOpacity={0.8}
          >
            <View style={styles.secondaryIcon}>
              <Ionicons name="list" size={20} color={colors.secondary} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.secondaryTitle}>Ir a mis salas</Text>
              <Text style={styles.secondarySubtitle}>Revisa tus salas activas</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity onPress={resetAndClose}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderPreferencesStep = () => (
    <View style={styles.stepContainer}>
      {/* Círculos decorativos */}
      <View style={styles.stepGlowPurple} />
      <View style={styles.stepGlowCyan} />

      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={() => setStep('initial')} style={styles.backButton}>
          <LinearGradient
            colors={['rgba(139, 92, 246, 0.2)', 'rgba(6, 182, 212, 0.1)']}
            style={styles.backButtonGradient}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.stepTitle}>Nueva Sala</Text>
        <TouchableOpacity onPress={resetAndClose} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
        {/* Asistente IA */}
        <View style={styles.aiSection}>
          <LinearGradient
            colors={['rgba(139, 92, 246, 0.15)', 'rgba(6, 182, 212, 0.08)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.aiGradient}
          />
          <View style={styles.aiHeader}>
            <View style={styles.aiIconBg}>
              <Ionicons name="sparkles" size={16} color={colors.primary} />
            </View>
            <Text style={styles.aiTitle}>Asistente IA</Text>
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>BETA</Text>
            </View>
          </View>
          <Text style={styles.aiDescription}>Describe qué tema te interesa</Text>
          <TextInput
            style={styles.aiInput}
            placeholder="Ej: Películas sobre superación..."
            placeholderTextColor={colors.textMuted}
            value={aiPrompt}
            onChangeText={setAiPrompt}
            multiline
          />
        </View>

        {/* Tipo de Contenido */}
        <Text style={styles.filterTitle}>🎬 Tipo de Contenido</Text>
        <View style={styles.mediaTypeContainer}>
          <TouchableOpacity
            style={[styles.mediaTypeButton, mediaType === 'MOVIE' && styles.mediaTypeButtonSelected]}
            onPress={() => handleMediaTypeChange('MOVIE')}
            activeOpacity={0.7}
          >
            {mediaType === 'MOVIE' && (
              <LinearGradient
                colors={['rgba(139, 92, 246, 0.3)', 'rgba(139, 92, 246, 0.1)']}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Text style={styles.mediaTypeIcon}>🎬</Text>
            <Text style={[styles.mediaTypeText, mediaType === 'MOVIE' && styles.mediaTypeTextSelected]}>
              Películas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mediaTypeButton, mediaType === 'TV' && styles.mediaTypeButtonSelected]}
            onPress={() => handleMediaTypeChange('TV')}
            activeOpacity={0.7}
          >
            {mediaType === 'TV' && (
              <LinearGradient
                colors={['rgba(6, 182, 212, 0.3)', 'rgba(6, 182, 212, 0.1)']}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Text style={styles.mediaTypeIcon}>📺</Text>
            <Text style={[styles.mediaTypeText, mediaType === 'TV' && styles.mediaTypeTextSelected]}>
              Series
            </Text>
          </TouchableOpacity>
        </View>

        {/* Géneros Dinámicos */}
        <Text style={styles.filterTitle}>🎭 Géneros {selectedGenres.length > 0 && `(${selectedGenres.length}/3)`}</Text>
        
        {genresLoading ? (
          <View style={styles.genresLoadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.genresLoadingText}>Cargando géneros de {mediaType === 'MOVIE' ? 'películas' : 'series'}...</Text>
          </View>
        ) : genresError ? (
          <View style={styles.genresErrorContainer}>
            <Text style={styles.genresErrorText}>Error al cargar géneros</Text>
            <TouchableOpacity onPress={refetchGenres} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.filterGrid}>
            {genres.map((genre, index) => {
              const isSelected = selectedGenres.includes(genre.id);
              const colorIndex = index % 3;
              const gradientColors = colorIndex === 0
                ? ['rgba(6, 182, 212, 0.2)', 'rgba(6, 182, 212, 0.05)']
                : colorIndex === 1
                  ? ['rgba(139, 92, 246, 0.2)', 'rgba(139, 92, 246, 0.05)']
                  : ['rgba(239, 68, 68, 0.2)', 'rgba(239, 68, 68, 0.05)'];

              return (
                <TouchableOpacity
                  key={genre.id}
                  style={[styles.filterChip, isSelected && styles.filterChipSelected]}
                  onPress={() => toggleGenre(genre.id)}
                  activeOpacity={0.7}
                >
                  {isSelected && (
                    <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFill} />
                  )}
                  <Text style={styles.genreIcon}>{getGenreIcon(genre.name)}</Text>
                  <Text style={[styles.filterChipText, isSelected && styles.filterChipTextSelected]}>
                    {genre.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={styles.stepFooter}>
        <TouchableOpacity style={styles.continueButtonWrapper} onPress={() => setStep('participants')}>
          <LinearGradient
            colors={[colors.secondary, '#3B82F6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.continueButton}
          >
            <Text style={styles.continueButtonText}>Continuar</Text>
            <Ionicons name="chevron-forward" size={20} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderParticipantsStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepGlowPurple} />
      <View style={styles.stepGlowRed} />

      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={() => setStep('preferences')} style={styles.backButton}>
          <LinearGradient
            colors={['rgba(139, 92, 246, 0.2)', 'rgba(6, 182, 212, 0.1)']}
            style={styles.backButtonGradient}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.stepTitle}>Participantes</Text>
        <TouchableOpacity onPress={resetAndClose} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.participantsContent}>
        <View style={styles.participantsIconBg}>
          <Ionicons name="people" size={32} color={colors.primary} />
        </View>
        <Text style={styles.participantsDescription}>
          ¿Cuántas personas deben estar de acuerdo para hacer match?
        </Text>

        <View style={styles.participantsGrid}>
          {[2, 3, 4, 5, 6].map((num, index) => {
            const isSelected = participants === num;
            const gradientColors = index % 3 === 0
              ? [colors.secondary, '#3B82F6']
              : index % 3 === 1
                ? [colors.primary, '#6366F1']
                : [colors.accent, '#EC4899'];

            return (
              <TouchableOpacity
                key={num}
                style={[styles.participantCard, isSelected && styles.participantCardSelected]}
                onPress={() => setParticipants(num)}
                activeOpacity={0.8}
              >
                {isSelected && (
                  <LinearGradient
                    colors={gradientColors}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                )}
                <Text style={[styles.participantNumber, isSelected && styles.participantNumberSelected]}>
                  {num}
                </Text>
                <Text style={[styles.participantLabel, isSelected && styles.participantLabelSelected]}>
                  personas
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.stepFooter}>
        <TouchableOpacity
          style={[styles.continueButtonWrapper, isCreating && styles.buttonDisabled]}
          onPress={createRoom}
          disabled={isCreating}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[colors.primary, '#6366F1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.continueButton}
          >
            {isCreating ? (
              <View style={styles.creatingContainer}>
                <ActivityIndicator size="small" color="#FFF" />
                {creatingStatus ? (
                  <Text style={styles.creatingStatusText}>{creatingStatus}</Text>
                ) : null}
              </View>
            ) : (
              <>
                <Ionicons name="rocket" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.continueButtonText}>Crear sala</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderShareStep = () => (
    <View style={styles.shareContainer}>
      {/* Círculos decorativos */}
      <View style={styles.shareGlowGreen} />
      <View style={styles.shareGlowPurple} />

      <View style={styles.shareHeader}>
        <View style={styles.successIconBg}>
          <Ionicons name="checkmark" size={28} color="#FFF" />
        </View>
        <Text style={styles.shareTitle}>¡Sala creada!</Text>
        <TouchableOpacity onPress={resetAndClose} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.roomInfoCard}>
        <LinearGradient
          colors={['rgba(139, 92, 246, 0.15)', 'rgba(6, 182, 212, 0.08)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.roomInfoIcon}>
          <Ionicons name="film" size={20} color={colors.primary} />
        </View>
        <View style={styles.roomInfoText}>
          <Text style={styles.roomNameText}>{roomName}</Text>
          <Text style={styles.roomWaiting}>Esperando {participants} personas</Text>
          {movieCount > 0 && (
            <Text style={styles.movieCountText}>🎬 {movieCount} películas listas</Text>
          )}
        </View>
      </View>

      <TouchableOpacity style={styles.whatsappButton} onPress={shareViaWhatsApp} activeOpacity={0.85}>
        <LinearGradient
          colors={['#25D366', '#128C7E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.whatsappGradient}
        >
          <Ionicons name="logo-whatsapp" size={22} color="#FFF" />
          <Text style={styles.whatsappButtonText}>Compartir por WhatsApp</Text>
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.orText}>O copia el enlace</Text>

      <View style={styles.linkContainer}>
        <Text style={styles.linkText} numberOfLines={1}>trinity.app/room/{roomCode}</Text>
        <TouchableOpacity style={styles.copyButton} onPress={copyLink} activeOpacity={0.7}>
          <LinearGradient
            colors={['rgba(6, 182, 212, 0.2)', 'rgba(139, 92, 246, 0.1)']}
            style={styles.copyButtonGradient}
          >
            <Ionicons name="copy-outline" size={18} color={colors.secondary} />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.startButtonWrapper}
        onPress={() => {
          if (roomId) {
            resetAndClose();
            // Navigate to the room details screen first
            router.push(`/room/${roomId}/details`);
          } else {
            resetAndClose();
          }
        }}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={[colors.primary, '#6366F1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.startButton}
        >
          <Text style={styles.startButtonText}>Empezar a hacer swipe</Text>
          <Ionicons name="play" size={18} color="#FFF" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={resetAndClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, step === 'initial' && styles.modalInitial]}>
          {step === 'initial' && renderInitialStep()}
          {step === 'preferences' && renderPreferencesStep()}
          {step === 'participants' && renderParticipantsStep()}
          {step === 'share' && renderShareStep()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: height * 0.9, overflow: 'hidden' },
  modalInitial: { paddingBottom: spacing.xl },

  // Fondo de posters
  posterBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 120, overflow: 'hidden' },
  posterRow: { flexDirection: 'row', height: 100 },
  posterThumb: { width: 70, height: 100, marginHorizontal: 3, borderRadius: 8, opacity: 0.6 },

  // Círculos decorativos
  glowPurple: { position: 'absolute', top: 60, left: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(139, 92, 246, 0.2)' },
  glowCyan: { position: 'absolute', top: 40, right: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(6, 182, 212, 0.15)' },
  stepGlowPurple: { position: 'absolute', top: -50, right: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(139, 92, 246, 0.12)' },
  stepGlowCyan: { position: 'absolute', bottom: 100, left: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(6, 182, 212, 0.08)' },
  stepGlowRed: { position: 'absolute', bottom: 150, right: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  shareGlowGreen: { position: 'absolute', top: -30, left: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  shareGlowPurple: { position: 'absolute', bottom: 50, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(139, 92, 246, 0.1)' },

  // Initial
  initialContainer: { padding: spacing.xl, paddingTop: 140, alignItems: 'center', position: 'relative' },
  logoCircle: {
    width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', position: 'relative',
  },
  logoGlow: { position: 'absolute', width: 110, height: 110, borderRadius: 55, opacity: 0.8 },
  logoInner: { flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  logoBar: { width: 10, borderRadius: 5 },
  logoBarBlue: { height: 18 },
  logoBarPurple: { height: 26 },
  logoBarRed: { height: 14 },
  initialTitle: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs, textAlign: 'center' },
  initialSubtitle: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
  optionsContainer: { width: '100%' },
  primaryOption: { borderRadius: borderRadius.lg, overflow: 'hidden', marginBottom: spacing.md, ...shadows.glow },
  primaryOptionGradient: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  optionIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
  },
  optionText: { flex: 1 },
  optionTitle: { fontSize: fontSize.md, fontWeight: '600', color: '#FFF' },
  optionSubtitle: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.7)' },
  secondaryOption: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  secondaryIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(6, 182, 212, 0.15)',
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
  },
  secondaryTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  secondarySubtitle: { fontSize: fontSize.sm, color: colors.textMuted },
  cancelText: { fontSize: fontSize.md, color: colors.textMuted, paddingVertical: spacing.sm },

  // Step
  stepContainer: { height: height * 0.85, position: 'relative', overflow: 'hidden' },
  stepHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  backButton: { borderRadius: 20, overflow: 'hidden' },
  backButtonGradient: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  closeButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  stepTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  stepContent: { flex: 1, padding: spacing.lg },
  stepFooter: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.06)' },
  continueButtonWrapper: { borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.glow },
  continueButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md + 2 },
  continueButtonText: { fontSize: fontSize.md, fontWeight: '600', color: '#FFF', marginRight: spacing.xs },

  // AI
  aiSection: {
    borderRadius: borderRadius.xl, padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.2)', overflow: 'hidden', position: 'relative',
  },
  aiGradient: { ...StyleSheet.absoluteFillObject },
  aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  aiIconBg: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(139, 92, 246, 0.2)', justifyContent: 'center', alignItems: 'center' },
  aiTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary, marginLeft: spacing.sm, flex: 1 },
  aiBadge: { backgroundColor: 'rgba(6, 182, 212, 0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  aiBadgeText: { fontSize: 10, fontWeight: '700', color: colors.secondary },
  aiDescription: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md },
  aiInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: borderRadius.md, padding: spacing.md,
    fontSize: fontSize.sm, color: colors.textPrimary, maxHeight: 70,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)',
  },

  // Filter
  filterTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.md },
  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: borderRadius.full, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', gap: 6, overflow: 'hidden',
  },
  filterChipSelected: { borderColor: 'rgba(139, 92, 246, 0.4)' },
  genreIcon: { fontSize: 14 },
  filterChipText: { fontSize: fontSize.sm, color: colors.textMuted },
  filterChipTextSelected: { color: colors.textPrimary, fontWeight: '500' },

  // Participants
  participantsContent: { flex: 1, padding: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  participantsIconBg: {
    width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg,
  },
  participantsDescription: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 22 },
  participantsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md },
  participantCard: {
    width: 75, height: 85, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: borderRadius.lg,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden',
  },
  participantCardSelected: { borderColor: 'transparent' },
  participantNumber: { fontSize: 26, fontWeight: '700', color: colors.textPrimary },
  participantNumberSelected: { color: '#FFF' },
  participantLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  participantLabelSelected: { color: 'rgba(255, 255, 255, 0.8)' },

  // Share
  shareContainer: { padding: spacing.xl, position: 'relative', overflow: 'hidden' },
  shareHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  successIconBg: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.success,
    justifyContent: 'center', alignItems: 'center',
  },
  shareTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary, flex: 1, marginLeft: spacing.md },
  roomInfoCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: borderRadius.lg, padding: spacing.md,
    marginBottom: spacing.lg, borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.2)', overflow: 'hidden',
  },
  roomInfoIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(139, 92, 246, 0.2)',
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
  },
  roomInfoText: { flex: 1 },
  roomNameText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  roomWaiting: { fontSize: fontSize.sm, color: colors.textMuted },
  whatsappButton: { borderRadius: borderRadius.lg, overflow: 'hidden', marginBottom: spacing.md },
  whatsappGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, gap: spacing.sm },
  whatsappButtonText: { fontSize: fontSize.md, fontWeight: '600', color: '#FFF' },
  orText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  linkContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  linkText: { flex: 1, fontSize: fontSize.sm, color: colors.textMuted },
  copyButton: { borderRadius: 18, overflow: 'hidden' },
  copyButtonGradient: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  startButtonWrapper: { borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.glow },
  startButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, gap: spacing.sm },
  startButtonText: { fontSize: fontSize.md, fontWeight: '600', color: '#FFF' },
  buttonDisabled: { opacity: 0.6 },
  creatingContainer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  creatingStatusText: { fontSize: fontSize.sm, color: '#FFF', marginLeft: spacing.xs },
  movieCountText: { fontSize: fontSize.xs, color: colors.secondary, marginTop: 4 },

  // Media Type Selector
  mediaTypeContainer: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  mediaTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: spacing.sm,
    overflow: 'hidden',
  },
  mediaTypeButtonSelected: {
    borderColor: 'rgba(139, 92, 246, 0.4)',
    backgroundColor: 'transparent',
  },
  mediaTypeIcon: { fontSize: 20 },
  mediaTypeText: { fontSize: fontSize.md, color: colors.textMuted, fontWeight: '500' },
  mediaTypeTextSelected: { color: colors.textPrimary, fontWeight: '600' },

  // Géneros dinámicos - Estados de carga y error
  genresLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  genresLoadingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  genresErrorContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  genresErrorText: {
    fontSize: fontSize.sm,
    color: colors.accent,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
});
