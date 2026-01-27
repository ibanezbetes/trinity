/**
 * GenreSelector Component
 * 
 * Allows users to select up to 3 genres for content filtering
 * with real-time loading from TMDB API.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { MediaType, GenreSelectorProps, Genre, MAX_GENRES } from '../types/content-filtering';
import { useGenres, useGenreValidation } from '../hooks/useGenres';

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
  // Spanish translations (different keys to avoid duplicates)
  'Acción': '💥',
  'Aventura': '🗺️',
  'Animación': '🎨',
  'Comedia': '😂',
  'Crimen': '🔍',
  'Documental': '📹',
  'Drama_ES': '🎭',
  'Fantasía': '🧙',
  'Terror': '👻',
  'Romance_ES': '💕',
  'Ciencia Ficción': '🚀',
  'Thriller_ES': '😱',
};

const GenreSelector: React.FC<GenreSelectorProps> = ({
  mediaType,
  selectedGenreIds,
  onGenreSelectionChange,
  maxGenres = MAX_GENRES,
  disabled = false,
  error
}) => {
  const { genres, loading, error: genreError, refetch } = useGenres(mediaType);
  const { validateGenreSelection } = useGenreValidation(maxGenres);

  const validation = useMemo(() => {
    return validateGenreSelection(selectedGenreIds);
  }, [selectedGenreIds, validateGenreSelection]);

  const handleGenreToggle = (genreId: number) => {
    if (disabled) return;

    const isSelected = selectedGenreIds.includes(genreId);
    let newSelection: number[];

    if (isSelected) {
      // Remove genre
      newSelection = selectedGenreIds.filter(id => id !== genreId);
      console.log('🎭 Genre removed:', genreId);
    } else {
      // Add genre (if under limit)
      if (selectedGenreIds.length >= maxGenres) {
        console.log('⚠️ Maximum genres reached:', maxGenres);
        return; // Don't add if at limit
      }
      newSelection = [...selectedGenreIds, genreId];
      console.log('🎭 Genre added:', genreId);
    }

    onGenreSelectionChange(newSelection);
  };

  const getSelectedGenreNames = (): string[] => {
    return selectedGenreIds
      .map(id => genres.find(g => g.id === id)?.name)
      .filter(Boolean) as string[];
  };
  
  const renderGenreChip = (genre: Genre) => {
    const isSelected = selectedGenreIds.includes(genre.id);
    const isDisabled = disabled || (!isSelected && selectedGenreIds.length >= maxGenres);
    
    const chipStyle = [
      styles.genreChip,
      isSelected && styles.selectedGenreChip,
      isDisabled && styles.disabledGenreChip,
      error && styles.errorGenreChip
    ];
    
    const textStyle = [
      styles.genreChipText,
      isSelected && styles.selectedGenreChipText,
      isDisabled && styles.disabledGenreChipText
    ];

    return (
      <TouchableOpacity
        key={genre.id}
        style={chipStyle}
        onPress={() => handleGenreToggle(genre.id)}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={`${isSelected ? 'Deseleccionar' : 'Seleccionar'} género ${genre.name}`}
        accessibilityState={{ selected: isSelected, disabled: isDisabled }}
      >
        <Text style={textStyle}>{genre.name}</Text>
        {isSelected && (
          <Text style={styles.selectedIcon}>✓</Text>
        )}
      </TouchableOpacity>
    );
  };
  
  const renderContent = () => {
    if (!mediaType) {
      return (
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderText}>
            Primero selecciona un tipo de contenido
          </Text>
        </View>
      );
    }

    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Cargando géneros...</Text>
        </View>
      );
    }

    if (genreError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ {genreError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (genres.length === 0) {
      return (
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderText}>
            No se encontraron géneros para {mediaType === 'MOVIE' ? 'películas' : 'series'}
          </Text>
        </View>
      );
    }

    return (
      <ScrollView 
        style={styles.genresScrollView}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
      >
        <View style={styles.genresContainer}>
          {genres.map(renderGenreChip)}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.label}>
          Géneros {mediaType === 'MOVIE' ? 'de Películas' : 'de Series'}
        </Text>
        <Text style={styles.counter}>
          {selectedGenreIds.length}/{maxGenres}
        </Text>
      </View>
      
      {renderContent()}
      
      {/* Validation Messages */}
      {validation.errors.length > 0 && (
        <View style={styles.validationContainer}>
          {validation.errors.map((errorMsg, index) => (
            <Text key={index} style={styles.validationError}>
              ❌ {errorMsg}
            </Text>
          ))}
        </View>
      )}
      
      {validation.warnings.length > 0 && (
        <View style={styles.validationContainer}>
          {validation.warnings.map((warning, index) => (
            <Text key={index} style={styles.validationWarning}>
              ⚠️ {warning}
            </Text>
          ))}
        </View>
      )}
      
      {/* Selected Genres Summary */}
      {selectedGenreIds.length > 0 && (
        <View style={styles.summaryContainer}>
          <Text style={styles.summaryLabel}>Géneros seleccionados:</Text>
          <Text style={styles.summaryText}>
            {getSelectedGenreNames().join(', ')}
          </Text>
        </View>
      )}
      
      {/* Help Text */}
      {selectedGenreIds.length === 0 && !loading && !genreError && genres.length > 0 && (
        <Text style={styles.helpText}>
          Selecciona hasta {maxGenres} géneros para personalizar tus recomendaciones
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  counter: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  genresScrollView: {
    maxHeight: 200,
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    marginBottom: 4,
  },
  selectedGenreChip: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  disabledGenreChip: {
    opacity: 0.5,
    backgroundColor: '#F9FAFB',
  },
  errorGenreChip: {
    borderColor: '#EF4444',
  },
  genreChipText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  selectedGenreChipText: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  disabledGenreChipText: {
    color: '#9CA3AF',
  },
  selectedIcon: {
    fontSize: 12,
    color: '#3B82F6',
    marginLeft: 4,
    fontWeight: 'bold',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  placeholderContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  placeholderText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  validationContainer: {
    marginTop: 8,
  },
  validationError: {
    fontSize: 12,
    color: '#EF4444',
    marginBottom: 4,
  },
  validationWarning: {
    fontSize: 12,
    color: '#F59E0B',
    marginBottom: 4,
  },
  summaryContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 12,
    color: '#6B7280',
  },
  helpText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default GenreSelector;