import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Animated,
  PanResponder,
  Alert,
  Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';
import { roomService, RoomDetails } from '../../src/services/roomService';
import { appSyncService } from '../../src/services/appSyncService';
import { matchService, Match } from '../../src/services/matchService';
import { mediaService, MediaItem, MediaItemDetails } from '../../src/services/mediaService';
import { moviePreloadService } from '../../src/services/moviePreloadService';
import { useConnectionStatus, useRoomSubscriptions } from '../../src/hooks/useConnectionStatus';

const { width, height } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.25;

interface VoteUpdate {
  roomId: string;
  userId: string;
  movieId: string;
  voteType: 'LIKE' | 'DISLIKE' | 'POLLING_UPDATE';
  currentVotes: number;
  totalMembers: number;
  timestamp: string;
}

interface MatchFound {
  roomId: string;
  movieId: string;
  movieTitle: string;
  participants: string[];
  timestamp: string;
}

interface RoomUpdate {
  id: string;
  status: string;
  memberCount: number;
  currentMovieIndex: number;
  totalMovies: number;
}

export default function RoomScreen() {
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null);
  const [currentMedia, setCurrentMedia] = useState<MediaItemDetails | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [voteCount, setVoteCount] = useState(0);
  const [matchFound, setMatchFound] = useState<MatchFound | null>(null);
  const [votingComplete, setVotingComplete] = useState(false);
  const [showMatch, setShowMatch] = useState(false);
  const [matchedMedia, setMatchedMedia] = useState<MediaItemDetails | null>(null);

  // Track voted movies in this session to prevent duplicates
  const votedMovieIds = useRef<string[]>([]);

  // Helper functions for persisting voted movies
  const getVotedMoviesKey = (roomId: string) => `voted_movies_${roomId}`;

  const loadVotedMovies = async (roomId: string) => {
    try {
      const key = getVotedMoviesKey(roomId);
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const votedIds = JSON.parse(stored);
        votedMovieIds.current = votedIds;
        console.log(`📱 Loaded ${votedIds.length} voted movies from storage for room ${roomId}`);
      } else {
        votedMovieIds.current = [];
        console.log(`📱 No voted movies found in storage for room ${roomId}`);
      }
    } catch (error) {
      console.error('Error loading voted movies:', error);
      votedMovieIds.current = [];
    }
  };

  const saveVotedMovies = async (roomId: string, votedIds: string[]) => {
    try {
      const key = getVotedMoviesKey(roomId);
      await AsyncStorage.setItem(key, JSON.stringify(votedIds));
      console.log(`💾 Saved ${votedIds.length} voted movies to storage for room ${roomId}`);
    } catch (error) {
      console.error('Error saving voted movies:', error);
    }
  };

  const addVotedMovie = async (roomId: string, movieId: string) => {
    if (!votedMovieIds.current.includes(movieId)) {
      votedMovieIds.current = [...votedMovieIds.current, movieId];
      await saveVotedMovies(roomId, votedMovieIds.current);
      console.log(`✅ Added movie ${movieId} to voted list (total: ${votedMovieIds.current.length})`);
    }
  };

  // Animation values
  const position = useRef(new Animated.ValueXY()).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const matchAnimation = useRef(new Animated.Value(0)).current;
  const loadingProgress = useRef(new Animated.Value(0)).current;
  const matchOpacity = useRef(new Animated.Value(0)).current;
  const matchScale = useRef(new Animated.Value(0.8)).current;

  // Connection status
  const { connectionInfo, isHealthy, forceReconnect } = useConnectionStatus();
  const { subscribeToRoom, unsubscribeFromRoom } = useRoomSubscriptions();

  // Progress tracking
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    percentage: 0
  });

  const [preloadStatus, setPreloadStatus] = useState({
    isPreloading: false,
    nextMoviesReady: 0,
    totalPreloaded: 0
  });

  // Load room data
  useEffect(() => {
    if (!roomId) return;

    const loadRoomData = async () => {
      try {
        setLoading(true);
        
        // Load voted movies from storage first
        await loadVotedMovies(roomId);
        console.log(`📱 Room ${roomId}: Loaded ${votedMovieIds.current.length} previously voted movies from storage`);
        
        const details = await roomService.getRoomDetails(roomId);
        setRoomDetails(details);
        setMemberCount(details.room.memberCount || 0);

        // Load current media with exclusion list
        const media = await mediaService.getCurrentMedia(roomId, votedMovieIds.current);
        setCurrentMedia(media);

        // Update progress
        setProgress({
          current: details.room.currentMovieIndex || 0,
          total: details.room.totalMovies || 0,
          percentage: Math.round(((details.room.currentMovieIndex || 0) / (details.room.totalMovies || 1)) * 100)
        });

      } catch (error) {
        console.error('Error loading room:', error);
        Alert.alert('Error', 'No se pudo cargar la sala');
      } finally {
        setLoading(false);
      }
    };

    loadRoomData();
  }, [roomId]);

  // Cleanup voted movies when leaving room
  useEffect(() => {
    return () => {
      // Optional: Clear voted movies when component unmounts
      // This can be uncommented if you want to reset voted movies when leaving the room
      // votedMovieIds.current = [];
    };
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!roomId) return;

    const handleVoteUpdate = (update: VoteUpdate) => {
      setVoteCount(update.currentVotes);
      setMemberCount(update.totalMembers);
    };

    const handleMatchFound = (match: MatchFound) => {
      setMatchFound(match);
      // Animate match overlay
      Animated.spring(matchAnimation, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    };

    const handleRoomUpdate = (update: RoomUpdate) => {
      setMemberCount(update.memberCount);
      setProgress({
        current: update.currentMovieIndex,
        total: update.totalMovies,
        percentage: Math.round((update.currentMovieIndex / update.totalMovies) * 100)
      });
    };

    // Subscribe to room updates
    subscribeToRoom(roomId, {
      onVoteUpdate: handleVoteUpdate,
      onMatchFound: handleMatchFound,
      onRoomUpdate: handleRoomUpdate,
    });

    return () => {
      unsubscribeFromRoom(roomId);
    };
  }, [roomId, subscribeToRoom, unsubscribeFromRoom]);

  // Pan responder for swipe gestures
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dx) > 20 || Math.abs(gestureState.dy) > 20;
    },
    onPanResponderMove: (_, gestureState) => {
      position.setValue({ x: gestureState.dx, y: gestureState.dy });

      // Update opacity and scale based on swipe distance
      const swipeProgress = Math.abs(gestureState.dx) / SWIPE_THRESHOLD;
      opacity.setValue(1 - swipeProgress * 0.5);
      scale.setValue(1 - swipeProgress * 0.1);
    },
    onPanResponderRelease: (_, gestureState) => {
      const { dx } = gestureState;

      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        // Complete the swipe
        const direction = dx > 0 ? 'right' : 'left';
        completeSwipe(direction);
      } else {
        // Return to center
        Animated.spring(position, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
        }).start();

        Animated.spring(opacity, {
          toValue: 1,
          useNativeDriver: false,
        }).start();

        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: false,
        }).start();
      }
    },
  });

  const completeSwipe = async (direction: 'left' | 'right') => {
    if (!currentMedia || isVoting) return;

    setIsVoting(true);

    // Animate card out
    Animated.timing(position, {
      toValue: { x: direction === 'right' ? width : -width, y: 0 },
      duration: 300,
      useNativeDriver: false,
    }).start();

    Animated.timing(opacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start();

    try {
      // Submit vote with detailed logging
      console.log('🔍 Room Component - Current Media:', JSON.stringify(currentMedia, null, 2));
      const voteType = direction === 'right' ? 'LIKE' : 'DISLIKE';
      console.log('🗳️ Room Component - Submitting vote:', {
        roomId: roomId,
        movieId: currentMedia.remoteId || currentMedia.tmdbId.toString(),
        voteType: voteType,
        direction: direction
      });

      await appSyncService.vote(roomId!, currentMedia.remoteId || currentMedia.tmdbId.toString());
      console.log('✅ Room Component - Vote submitted successfully');

      // Add to voted list
      if (currentMedia.remoteId) {
        await addVotedMovie(roomId!, currentMedia.remoteId);
        console.log(`✅ Added movie ${currentMedia.remoteId} to persistent voted list`);
      } else if (currentMedia.tmdbId) {
        await addVotedMovie(roomId!, currentMedia.tmdbId.toString());
        console.log(`✅ Added movie ${currentMedia.tmdbId} to persistent voted list`);
      }

      // Load next media with updated exclusion list
      setTimeout(async () => {
        try {
          // Pass updated exclude list
          const nextMedia = await mediaService.getNextMedia(roomId!, votedMovieIds.current);
          setCurrentMedia(nextMedia);

          // Reset animations
          position.setValue({ x: 0, y: 0 });
          opacity.setValue(1);
          scale.setValue(1);

        } catch (error) {
          console.error('Error loading next media:', error);
          setCurrentMedia(null);
        } finally {
          setIsVoting(false);
        }
      }, 300);

    } catch (error: any) {
      console.error('❌ Room Component - Error submitting vote:', {
        error: error,
        errorMessage: error?.message,
        errorName: error?.name,
        errorStack: error?.stack,
        roomId: roomId,
        movieId: currentMedia?.tmdbId,
        voteType: direction === 'right' ? 'LIKE' : 'DISLIKE'
      });

      // Show specific error message based on error type
      let errorMessage = 'No se pudo enviar el voto';

      if (error?.message) {
        // Special handling for "already voted" errors
        if (error.message.includes('already voted') || error.message.includes('Ya has votado')) {
          console.warn('⚠️ Room Component - Already voted for this movie, skipping...');

          // Treat as success - add to voted list and move on
          if (currentMedia && currentMedia.remoteId) {
            await addVotedMovie(roomId!, currentMedia.remoteId);
            console.log(`✅ Added already-voted movie ${currentMedia.remoteId} to persistent exclusion list`);
          } else if (currentMedia && currentMedia.tmdbId) {
            await addVotedMovie(roomId!, currentMedia.tmdbId.toString());
            console.log(`✅ Added already-voted movie ${currentMedia.tmdbId} to persistent exclusion list`);
          }

          // Load next media immediately without alert
          try {
            const nextMedia = await mediaService.getNextMedia(roomId!, votedMovieIds.current);
            setCurrentMedia(nextMedia);

            // Reset animations
            position.setValue({ x: 0, y: 0 });
            opacity.setValue(1);
            scale.setValue(1);
          } catch (loadError) {
            console.error('Error loading next media after skip:', loadError);
            setCurrentMedia(null);
          } finally {
            setIsVoting(false);
          }
          return; // Skip the rest of error handling
        }

        if (error.message.includes('Authentication') || error.message.includes('not authenticated')) {
          errorMessage = 'Tu sesión ha expirado. Cierra y abre la app de nuevo.';
        } else if (error.message.includes('Network') || error.message.includes('fetch') || error.message.includes('timeout')) {
          errorMessage = 'Error de conexión. Verifica tu internet e intenta de nuevo.';
        } else if (error.message.includes('not found') || error.message.includes('no encontrada')) {
          errorMessage = 'La sala no existe o no tienes acceso.';
        } else if (error.message.includes('not member') || error.message.includes('no es miembro')) {
          errorMessage = 'No eres miembro de esta sala.';
        } else if (error.message.includes('not available') || error.message.includes('no está disponible')) {
          errorMessage = 'La sala no está disponible para votar.';
        } else {
          // Include the actual error message for debugging
          errorMessage = `Error: ${error.message}`;
        }
      }

      Alert.alert('Error', errorMessage);

      // Reset position on error
      Animated.spring(position, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
      }).start();

      Animated.spring(opacity, {
        toValue: 1,
        useNativeDriver: false,
      }).start();

      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: false,
      }).start();

      setIsVoting(false);
    }
  };

  const swipeLeft = () => completeSwipe('left');
  const swipeRight = () => completeSwipe('right');

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando sala...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.roomName} numberOfLines={1}>
            {roomDetails?.room.name || 'Sala'}
          </Text>
          <View style={styles.membersRow}>
            <Ionicons name="people" size={14} color={colors.textMuted} />
            <Text style={styles.membersText}>
              {memberCount || 0} participantes
            </Text>
            {voteCount > 0 && (
              <>
                <Text style={styles.separator}>•</Text>
                <Ionicons name="heart" size={12} color={colors.primary} />
                <Text style={styles.voteCountText}>{voteCount} votos</Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.connectionStatus}
            onPress={() => {
              if (!isHealthy) {
                Alert.alert(
                  'Estado de conexión',
                  `Estado: ${connectionInfo.status}\nEn línea: ${connectionInfo.isOnline ? 'Sí' : 'No'}\nIntentos de reconexión: ${connectionInfo.reconnectionAttempts}`,
                  [
                    { text: 'Reconectar', onPress: forceReconnect },
                    { text: 'Cerrar', style: 'cancel' }
                  ]
                );
              }
            }}
          >
            <View style={[
              styles.connectionDot,
              {
                backgroundColor:
                  connectionInfo.status === 'connected' && connectionInfo.isOnline ? '#4ECDC4' :
                    connectionInfo.status === 'connecting' ? '#FFD93D' : '#FF6B6B'
              }
            ]} />
            {connectionInfo.reconnectionAttempts > 0 && (
              <Text style={styles.reconnectionText}>
                {connectionInfo.reconnectionAttempts}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuButton}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <Animated.View style={[
            styles.progressFill,
            {
              width: progressAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              })
            }
          ]} />
        </View>
        <View style={styles.progressInfo}>
          <Text style={styles.progressText}>
            {progress.current}/{progress.total} • {progress.percentage}%
          </Text>
          {preloadStatus.nextMoviesReady > 0 && (
            <Animated.View style={[
              styles.preloadIndicator,
              {
                opacity: loadingProgress.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.7, 1, 0.7],
                })
              }
            ]}>
              <Ionicons name="flash" size={12} color={colors.success} />
              <Text style={styles.preloadText}>
                {preloadStatus.nextMoviesReady} listas
              </Text>
            </Animated.View>
          )}
          {preloadStatus.isPreloading && (
            <View style={styles.preloadIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.preloadText}>Cargando...</Text>
            </View>
          )}
        </View>
      </View>

      {/* Card Area */}
      <View style={styles.cardContainer}>
        {currentMedia ? (
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.card,
              {
                transform: [
                  { translateX: position.x },
                  { translateY: position.y },
                  { scale: scale }
                ],
                opacity: opacity
              }
            ]}
          >
            <Image
              source={{
                uri: currentMedia.mediaPosterPath
                  ? `https://image.tmdb.org/t/p/w500${currentMedia.mediaPosterPath}`
                  : 'https://via.placeholder.com/500x750',
              }}
              style={styles.cardImage}
            />

            {/* Swipe Overlays */}
            <Animated.View style={[
              styles.likeOverlay,
              {
                opacity: position.x.interpolate({
                  inputRange: [0, SWIPE_THRESHOLD],
                  outputRange: [0, 1],
                  extrapolate: 'clamp',
                })
              }
            ]}>
              <Text style={styles.overlayText}>LIKE</Text>
            </Animated.View>

            <Animated.View style={[
              styles.dislikeOverlay,
              {
                opacity: position.x.interpolate({
                  inputRange: [-SWIPE_THRESHOLD, 0],
                  outputRange: [1, 0],
                  extrapolate: 'clamp',
                })
              }
            ]}>
              <Text style={styles.overlayText}>NOPE</Text>
            </Animated.View>

            {/* Card Info */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.8)']}
              style={styles.cardGradient}
            >
              <Text style={styles.cardTitle}>{currentMedia.mediaTitle}</Text>
              <View style={styles.cardMeta}>
                <Text style={styles.cardYear}>{currentMedia.mediaYear}</Text>
                {currentMedia.mediaRating && (
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={12} color="#FFD700" />
                    <Text style={styles.ratingText}>{currentMedia.mediaRating}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardOverview} numberOfLines={3}>
                {currentMedia.mediaOverview}
              </Text>
            </LinearGradient>
          </Animated.View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
            <Text style={styles.emptyTitle}>¡Has terminado!</Text>
            <Text style={styles.emptySubtitle}>
              Has votado todo el contenido de esta sala
            </Text>
            <View style={styles.completionActions}>
              <TouchableOpacity
                style={styles.viewMatchesButton}
                onPress={() => router.push(`/room/${roomId}/matches`)}
              >
                <Ionicons name="heart" size={20} color="#FFF" style={styles.buttonIcon} />
                <Text style={styles.viewMatchesText}>Ver matches</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.returnToRoomsButton}
                onPress={() => router.push('/(tabs)/rooms')}
              >
                <Ionicons name="arrow-back" size={20} color={colors.primary} style={styles.buttonIcon} />
                <Text style={styles.returnToRoomsText}>Volver a salas</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      {currentMedia && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.dislikeButton]}
            onPress={() => swipeLeft()}
            disabled={isVoting}
          >
            <Ionicons name="close" size={32} color="#FF6B6B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.infoButton}
            onPress={() => router.push(`/media/${currentMedia.tmdbId}`)}
          >
            <Ionicons name="information-circle" size={28} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.likeButton]}
            onPress={() => swipeRight()}
            disabled={isVoting}
          >
            <Ionicons name="heart" size={32} color="#4ECDC4" />
          </TouchableOpacity>
        </View>
      )}

      {/* Match Found Overlay */}
      {matchFound && (
        <Animated.View
          style={[
            styles.matchOverlay,
            {
              opacity: matchAnimation,
              transform: [
                {
                  scale: matchAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  })
                }
              ]
            }
          ]}
        >
          <LinearGradient
            colors={['rgba(78, 205, 196, 0.95)', 'rgba(255, 107, 107, 0.95)']}
            style={styles.matchContent}
          >
            <Ionicons name="heart" size={64} color="#FFF" />
            <Text style={styles.matchTitle}>¡Es un Match!</Text>
            <Text style={styles.matchSubtitle}>
              Ambos eligieron: {matchFound.movieTitle}
            </Text>
            <TouchableOpacity
              style={styles.matchButton}
              onPress={() => {
                setMatchFound(null);
                router.push(`/room/${roomId}/matches`);
              }}
            >
              <Text style={styles.matchButtonText}>Ver detalles</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      )}

      {/* Voting Complete Overlay */}
      {votingComplete && (
        <Animated.View
          style={[
            styles.matchOverlay,
            {
              opacity: matchAnimation,
              transform: [
                {
                  scale: matchAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  })
                }
              ]
            }
          ]}
        >
          <LinearGradient
            colors={['rgba(78, 205, 196, 0.95)', 'rgba(255, 217, 61, 0.95)']}
            style={styles.matchContent}
          >
            <Ionicons name="checkmark-circle" size={64} color="#FFF" />
            <Text style={styles.matchTitle}>¡Votación Completa!</Text>
            <Text style={styles.matchSubtitle}>
              Todos han votado. Revisa los resultados.
            </Text>
            <TouchableOpacity
              style={styles.matchButton}
              onPress={() => {
                setVotingComplete(false);
                router.push(`/room/${roomId}/matches`);
              }}
            >
              <Text style={styles.matchButtonText}>Continuar</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  roomName: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  membersText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  separator: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginHorizontal: 4,
  },
  voteCountText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  connectionStatus: {
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF6B6B',
  },
  reconnectionText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
  },
  menuButton: {
    padding: spacing.xs,
  },
  progressContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  progressText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  preloadIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  preloadText: {
    fontSize: fontSize.xs,
    color: colors.success,
    fontWeight: '500',
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: width - spacing.lg * 2,
    height: height * 0.6,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  likeOverlay: {
    position: 'absolute',
    top: 50,
    left: 20,
    padding: spacing.md,
    borderWidth: 4,
    borderColor: '#4ECDC4',
    borderRadius: borderRadius.md,
    transform: [{ rotate: '-20deg' }],
  },
  dislikeOverlay: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: spacing.md,
    borderWidth: 4,
    borderColor: '#FF6B6B',
    borderRadius: borderRadius.md,
    transform: [{ rotate: '20deg' }],
  },
  overlayText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: spacing.xs,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  cardYear: {
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.8)',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  ratingText: {
    fontSize: fontSize.sm,
    color: '#FFF',
    fontWeight: '600',
  },
  cardOverview: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },
  emptyCard: {
    alignItems: 'center',
    padding: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  completionActions: {
    width: '100%',
    gap: spacing.md,
  },
  viewMatchesButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewMatchesText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
  returnToRoomsButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  returnToRoomsText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },
  buttonIcon: {
    marginRight: spacing.sm,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xl,
  },
  actionButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  dislikeButton: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  likeButton: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  infoButton: {
    padding: spacing.sm,
  },
  matchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchContent: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  matchTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: spacing.sm,
  },
  matchSubtitle: {
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: spacing.xl,
  },
  matchButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  matchButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
});