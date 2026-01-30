import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const CARD_WIDTH = screenWidth * 0.85;
const CARD_HEIGHT = screenHeight * 0.65;

interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  vote_average: number;
  release_date: string;
}

interface MovieRecommendation {
  movie: Movie;
  relevanceScore: number;
  reasoning?: string;
}

interface MovieCardsSwiperProps {
  recommendations: MovieRecommendation[];
  onCardSwipe: (direction: 'left' | 'right', movie: Movie) => void;
  onAddToRoom?: (movie: Movie) => void;
  showAddToRoom?: boolean;
}

export default function MovieCardsSwiper({
  recommendations,
  onCardSwipe,
  onAddToRoom,
  showAddToRoom = false
}: MovieCardsSwiperProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cards, setCards] = useState(recommendations);
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  // Update cards when recommendations change
  useEffect(() => {
    setCards(recommendations);
    setCurrentIndex(0);
    resetCardPosition();
  }, [recommendations]);

  const resetCardPosition = () => {
    translateX.setValue(0);
    translateY.setValue(0);
    rotate.setValue(0);
    opacity.setValue(1);
  };

  const animateCardOut = (direction: 'left' | 'right', callback?: () => void) => {
    const toValue = direction === 'left' ? -screenWidth : screenWidth;
    
    Animated.parallel([
      Animated.timing(translateX, {
        toValue,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(rotate, {
        toValue: direction === 'left' ? -30 : 30,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (callback) callback();
      resetCardPosition();
    });
  };

  const handleSwipe = (direction: 'left' | 'right') => {
    if (currentIndex >= cards.length) return;

    const currentMovie = cards[currentIndex].movie;
    
    animateCardOut(direction, () => {
      onCardSwipe(direction, currentMovie);
      setCurrentIndex(prev => prev + 1);
    });
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      resetCardPosition();
    }
  };

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(prev => prev + 1);
      resetCardPosition();
    }
  };

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX, translationY: translateY } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      const { translationX, velocityX } = event.nativeEvent;
      
      // Determine swipe direction based on translation and velocity
      if (Math.abs(translationX) > 100 || Math.abs(velocityX) > 500) {
        const direction = translationX > 0 ? 'right' : 'left';
        handleSwipe(direction);
      } else {
        // Snap back to center
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    }
  };

  // Update rotation based on translation
  useEffect(() => {
    const listener = translateX.addListener(({ value }) => {
      const rotation = (value / screenWidth) * 30; // Max 30 degrees rotation
      rotate.setValue(rotation);
    });

    return () => translateX.removeListener(listener);
  }, []);

  if (cards.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="film-outline" size={64} color={colors.textMuted} />
        <Text style={styles.emptyText}>No hay recomendaciones disponibles</Text>
        <Text style={styles.emptySubtext}>Intenta hacer una nueva consulta a Trini</Text>
      </View>
    );
  }

  if (currentIndex >= cards.length) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="checkmark-circle-outline" size={64} color={colors.primary} />
        <Text style={styles.emptyText}>¡Has visto todas las recomendaciones!</Text>
        <Text style={styles.emptySubtext}>Pregúntale a Trini por más películas</Text>
      </View>
    );
  }

  const currentCard = cards[currentIndex];
  const nextCard = cards[currentIndex + 1];

  return (
    <View style={styles.container}>
      {/* Progress indicator */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          {currentIndex + 1} de {cards.length}
        </Text>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { width: `${((currentIndex + 1) / cards.length) * 100}%` }
            ]} 
          />
        </View>
      </View>

      {/* Cards Stack */}
      <View style={styles.cardsContainer}>
        {/* Next card (background) */}
        {nextCard && (
          <View style={[styles.card, styles.nextCard]}>
            <MovieCard recommendation={nextCard} />
          </View>
        )}

        {/* Current card (foreground) */}
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View
            style={[
              styles.card,
              styles.currentCard,
              {
                transform: [
                  { translateX },
                  { translateY },
                  { rotate: rotate.interpolate({
                    inputRange: [-1, 1],
                    outputRange: ['-1deg', '1deg']
                  }) }
                ],
                opacity
              }
            ]}
          >
            <MovieCard 
              recommendation={currentCard} 
              onAddToRoom={onAddToRoom}
              showAddToRoom={showAddToRoom}
            />
          </Animated.View>
        </PanGestureHandler>
      </View>

      {/* Navigation Controls */}
      <View style={styles.controls}>
        <TouchableOpacity 
          style={[styles.controlButton, currentIndex === 0 && styles.controlButtonDisabled]}
          onPress={handlePrevious}
          disabled={currentIndex === 0}
        >
          <Ionicons 
            name="chevron-back" 
            size={24} 
            color={currentIndex === 0 ? colors.textMuted : colors.primary} 
          />
        </TouchableOpacity>

        <View style={styles.swipeButtons}>
          <TouchableOpacity 
            style={[styles.swipeButton, styles.dislikeButton]}
            onPress={() => handleSwipe('left')}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.swipeButton, styles.likeButton]}
            onPress={() => handleSwipe('right')}
          >
            <Ionicons name="heart" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.controlButton, currentIndex >= cards.length - 1 && styles.controlButtonDisabled]}
          onPress={handleNext}
          disabled={currentIndex >= cards.length - 1}
        >
          <Ionicons 
            name="chevron-forward" 
            size={24} 
            color={currentIndex >= cards.length - 1 ? colors.textMuted : colors.primary} 
          />
        </TouchableOpacity>
      </View>

      {/* Swipe indicators */}
      <View style={styles.swipeIndicators}>
        <View style={styles.swipeIndicator}>
          <Ionicons name="arrow-back" size={20} color={colors.textMuted} />
          <Text style={styles.swipeIndicatorText}>No me gusta</Text>
        </View>
        <View style={styles.swipeIndicator}>
          <Text style={styles.swipeIndicatorText}>Me gusta</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.textMuted} />
        </View>
      </View>
    </View>
  );
}

interface MovieCardProps {
  recommendation: MovieRecommendation;
  onAddToRoom?: (movie: Movie) => void;
  showAddToRoom?: boolean;
}

function MovieCard({ recommendation, onAddToRoom, showAddToRoom }: MovieCardProps) {
  const { movie, relevanceScore, reasoning } = recommendation;
  const posterUrl = movie.poster_path 
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : null;

  const releaseYear = movie.release_date 
    ? new Date(movie.release_date).getFullYear()
    : 'N/A';

  return (
    <View style={styles.movieCard}>
      {/* Movie Poster */}
      <View style={styles.posterContainer}>
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={styles.poster} />
        ) : (
          <View style={styles.posterPlaceholder}>
            <Ionicons name="film-outline" size={64} color={colors.textMuted} />
          </View>
        )}
        
        {/* Rating Badge */}
        <View style={styles.ratingBadge}>
          <Ionicons name="star" size={16} color="#FFD700" />
          <Text style={styles.ratingText}>{movie.vote_average.toFixed(1)}</Text>
        </View>

        {/* Relevance Score */}
        <View style={styles.relevanceBadge}>
          <Text style={styles.relevanceText}>
            {Math.round(relevanceScore * 100)}% match
          </Text>
        </View>
      </View>

      {/* Movie Info */}
      <View style={styles.movieInfo}>
        <Text style={styles.movieTitle} numberOfLines={2}>
          {movie.title}
        </Text>
        
        <Text style={styles.movieYear}>{releaseYear}</Text>
        
        <Text style={styles.movieOverview} numberOfLines={4}>
          {movie.overview}
        </Text>

        {reasoning && (
          <View style={styles.reasoningContainer}>
            <Text style={styles.reasoningLabel}>¿Por qué te puede gustar?</Text>
            <Text style={styles.reasoningText} numberOfLines={2}>
              {reasoning}
            </Text>
          </View>
        )}

        {/* Add to Room Button */}
        {showAddToRoom && onAddToRoom && (
          <TouchableOpacity 
            style={styles.addToRoomButton}
            onPress={() => onAddToRoom(movie)}
          >
            <LinearGradient 
              colors={[colors.primary, '#6366F1']} 
              style={styles.addToRoomGradient}
            >
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.addToRoomText}>Agregar a sala</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  progressText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  progressBar: {
    width: '60%',
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  cardsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    position: 'absolute',
  },
  currentCard: {
    zIndex: 2,
  },
  nextCard: {
    zIndex: 1,
    opacity: 0.5,
    transform: [{ scale: 0.95 }],
  },
  movieCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  posterContainer: {
    flex: 1,
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  posterPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  ratingText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  relevanceBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  relevanceText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  movieInfo: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  movieTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  movieYear: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  movieOverview: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  reasoningContainer: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    marginBottom: spacing.md,
  },
  reasoningLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 4,
  },
  reasoningText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  addToRoomButton: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  addToRoomGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  addToRoomText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  controlButtonDisabled: {
    opacity: 0.5,
  },
  swipeButtons: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  swipeButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  dislikeButton: {
    backgroundColor: '#EF4444',
  },
  likeButton: {
    backgroundColor: '#10B981',
  },
  swipeIndicators: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  swipeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  swipeIndicatorText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});