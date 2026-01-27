/**
 * FilterSummary Component
 * 
 * Displays selected filter criteria and provides clear action for users.
 * Shows media type, selected genres, and estimated content count.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FilterSummaryProps, MediaType } from '../types/content-filtering';

const FilterSummary: React.FC<FilterSummaryProps> = ({
  mediaType,
  genreIds = [],
  genreNames = [],
  onClear,
  showClearButton = true,
  compact = false
}) => {
  const getMediaTypeLabel = (type?: MediaType): string => {
    if (!type) return 'No seleccionado';
    return type === 'MOVIE' ? 'Películas' : 'Series';
  };

  const getMediaTypeIcon = (type?: MediaType): string => {
    if (!type) return '❓';
    return type === 'MOVIE' ? '🎬' : '📺';
  };

  const hasFilters = mediaType && genreIds.length > 0;

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        {hasFilters ? (
          <View style={styles.compactContent}>
            <Text style={styles.compactText}>
              {getMediaTypeIcon(mediaType)} {getMediaTypeLabel(mediaType)} • {genreIds.length} géneros
            </Text>
            {showClearButton && onClear && (
              <TouchableOpacity onPress={onClear} style={styles.compactClearButton}>
                <Text style={styles.compactClearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={styles.compactEmptyText}>Sin filtros aplicados</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📋 Filtros Aplicados</Text>
        {showClearButton && onClear && hasFilters && (
          <TouchableOpacity onPress={onClear} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Limpiar</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.content}>
        {/* Media Type */}
        <View style={styles.filterItem}>
          <Text style={styles.filterLabel}>Tipo de Contenido:</Text>
          <View style={styles.filterValue}>
            <Text style={styles.filterIcon}>{getMediaTypeIcon(mediaType)}</Text>
            <Text style={styles.filterText}>{getMediaTypeLabel(mediaType)}</Text>
          </View>
        </View>

        {/* Genres */}
        <View style={styles.filterItem}>
          <Text style={styles.filterLabel}>
            Géneros ({genreIds.length}/3):
          </Text>
          {genreNames.length > 0 ? (
            <View style={styles.genresContainer}>
              {genreNames.map((name, index) => (
                <View key={index} style={styles.genreChip}>
                  <Text style={styles.genreText}>{name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>Ningún género seleccionado</Text>
          )}
        </View>

        {/* Summary */}
        {hasFilters && (
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryText}>
              ✨ Buscaremos {getMediaTypeLabel(mediaType).toLowerCase()} que coincidan con tus géneros favoritos
            </Text>
          </View>
        )}

        {/* No filters message */}
        {!hasFilters && (
          <View style={styles.noFiltersContainer}>
            <Text style={styles.noFiltersText}>
              Selecciona un tipo de contenido y géneros para personalizar tus recomendaciones
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginVertical: 16,
    overflow: 'hidden',
  },
  compactContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 8,
    marginVertical: 8,
  },
  compactContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  compactClearButton: {
    padding: 4,
  },
  compactClearText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: 'bold',
  },
  compactEmptyText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EF4444',
    borderRadius: 6,
  },
  clearButtonText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  filterItem: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  filterValue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
  },
  filterIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  filterText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreChip: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  genreText: {
    fontSize: 12,
    color: '#1E40AF',
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  summaryContainer: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  summaryText: {
    fontSize: 12,
    color: '#166534',
    textAlign: 'center',
    fontWeight: '500',
  },
  noFiltersContainer: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FED7AA',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  noFiltersText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default FilterSummary;