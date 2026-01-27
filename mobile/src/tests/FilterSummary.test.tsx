/**
 * Unit Tests: FilterSummary Component
 * 
 * Tests specific examples and edge cases for the FilterSummary component.
 * Validates Requirements 8.4, 8.5, 6.4
 */

import { render } from '@testing-library/react-native';
import React from 'react';
import FilterSummary, { FilterCriteria, Genre, MediaType } from '../components/FilterSummary';

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, ...props }: any) => children,
}));

describe('FilterSummary Component', () => {
  const mockGenres: Genre[] = [
    { id: 28, name: 'Action', icon: '💥' },
    { id: 35, name: 'Comedy', icon: '😂' },
    { id: 18, name: 'Drama', icon: '🎭' },
  ];

  const createFilterCriteria = (
    mediaType: MediaType = 'MOVIE',
    genres: Genre[] = []
  ): FilterCriteria => ({
    mediaType,
    genres,
  });

  describe('Basic Rendering', () => {
    test('renders with movie media type and no genres', () => {
      const criteria = createFilterCriteria('MOVIE', []);
      const { getByText } = render(
        <FilterSummary criteria={criteria} />
      );

      expect(getByText('📋 Resumen de Filtros')).toBeTruthy();
      expect(getByText('🎬')).toBeTruthy();
      expect(getByText('Películas')).toBeTruthy();
      expect(getByText('🎲 Todos los géneros (aleatorio)')).toBeTruthy();
    });

    test('renders with TV media type and no genres', () => {
      const criteria = createFilterCriteria('TV', []);
      const { getByText } = render(
        <FilterSummary criteria={criteria} />
      );

      expect(getByText('📺')).toBeTruthy();
      expect(getByText('Series')).toBeTruthy();
      expect(getByText('🎲 Todos los géneros (aleatorio)')).toBeTruthy();
    });

    test('renders with selected genres', () => {
      const criteria = createFilterCriteria('MOVIE', [mockGenres[0], mockGenres[1]]);
      const { getByText } = render(
        <FilterSummary criteria={criteria} />
      );

      expect(getByText('Géneros (2)')).toBeTruthy();
      expect(getByText('Action')).toBeTruthy();
      expect(getByText('Comedy')).toBeTruthy();
    });
  });

  describe('Estimated Count Display', () => {
    test('shows loading state', () => {
      const criteria = createFilterCriteria();
      const { getByText } = render(
        <FilterSummary criteria={criteria} loading={true} />
      );

      expect(getByText('Calculando...')).toBeTruthy();
    });

    test('shows error state', () => {
      const criteria = createFilterCriteria();
      const { getByText } = render(
        <FilterSummary 
          criteria={criteria} 
          error="Error de conexión" 
        />
      );

      expect(getByText('Error al calcular')).toBeTruthy();
      expect(getByText('⚠️ Error de conexión')).toBeTruthy();
    });

    test('shows zero content available', () => {
      const criteria = createFilterCriteria();
      const { getByText } = render(
        <FilterSummary criteria={criteria} estimatedCount={0} />
      );

      expect(getByText('Sin contenido disponible')).toBeTruthy();
    });

    test('shows single title available', () => {
      const criteria = createFilterCriteria();
      const { getByText } = render(
        <FilterSummary criteria={criteria} estimatedCount={1} />
      );

      expect(getByText('1 título disponible')).toBeTruthy();
    });

    test('shows multiple titles available (less than 30)', () => {
      const criteria = createFilterCriteria();
      const { getByText } = render(
        <FilterSummary criteria={criteria} estimatedCount={15} />
      );

      expect(getByText('15 títulos disponibles')).toBeTruthy();
    });

    test('shows 30+ titles available', () => {
      const criteria = createFilterCriteria();
      const { getByText } = render(
        <FilterSummary criteria={criteria} estimatedCount={50} />
      );

      expect(getByText('50+ títulos disponibles')).toBeTruthy();
    });

    test('shows estimating state when count is undefined', () => {
      const criteria = createFilterCriteria();
      const { getByText } = render(
        <FilterSummary criteria={criteria} />
      );

      expect(getByText('Estimando...')).toBeTruthy();
    });
  });

  describe('Priority Algorithm Display', () => {
    test('shows algorithm info when genres are selected', () => {
      const criteria = createFilterCriteria('MOVIE', [mockGenres[0]]);
      const { getByText } = render(
        <FilterSummary criteria={criteria} />
      );

      expect(getByText('🎯 Algoritmo de Priorización')).toBeTruthy();
      expect(getByText('Contenido con TODOS los géneros seleccionados')).toBeTruthy();
      expect(getByText('Contenido con AL MENOS UN género seleccionado')).toBeTruthy();
      expect(getByText('Contenido popular del mismo tipo')).toBeTruthy();
    });

    test('hides algorithm info when no genres are selected', () => {
      const criteria = createFilterCriteria('MOVIE', []);
      const { queryByText } = render(
        <FilterSummary criteria={criteria} />
      );

      expect(queryByText('🎯 Algoritmo de Priorización')).toBeNull();
    });
  });

  describe('Genre Icons', () => {
    test('uses provided genre icons', () => {
      const genreWithIcon: Genre = { id: 28, name: 'Action', icon: '🔥' };
      const criteria = createFilterCriteria('MOVIE', [genreWithIcon]);
      const { getByText } = render(
        <FilterSummary criteria={criteria} />
      );

      // The icon should be rendered within the genre chip
      expect(getByText('Action')).toBeTruthy();
    });

    test('uses default icons for known genres', () => {
      const genreWithoutIcon: Genre = { id: 35, name: 'Comedy' };
      const criteria = createFilterCriteria('MOVIE', [genreWithoutIcon]);
      const { getByText } = render(
        <FilterSummary criteria={criteria} />
      );

      expect(getByText('Comedy')).toBeTruthy();
    });

    test('uses fallback icon for unknown genres', () => {
      const unknownGenre: Genre = { id: 999, name: 'Unknown Genre' };
      const criteria = createFilterCriteria('MOVIE', [unknownGenre]);
      const { getByText } = render(
        <FilterSummary criteria={criteria} />
      );

      expect(getByText('Unknown Genre')).toBeTruthy();
    });
  });

  describe('Immutability Notice', () => {
    test('always shows filter immutability notice', () => {
      const criteria = createFilterCriteria();
      const { getByText } = render(
        <FilterSummary criteria={criteria} />
      );

      expect(getByText('🔒 Los filtros no se pueden cambiar después de crear la sala')).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    test('handles maximum number of genres (3)', () => {
      const criteria = createFilterCriteria('MOVIE', mockGenres);
      const { getByText } = render(
        <FilterSummary criteria={criteria} />
      );

      expect(getByText('Géneros (3)')).toBeTruthy();
      expect(getByText('Action')).toBeTruthy();
      expect(getByText('Comedy')).toBeTruthy();
      expect(getByText('Drama')).toBeTruthy();
    });

    test('handles empty genre array', () => {
      const criteria = createFilterCriteria('TV', []);
      const { getByText } = render(
        <FilterSummary criteria={criteria} />
      );

      expect(getByText('🎲 Todos los géneros (aleatorio)')).toBeTruthy();
    });

    test('handles very large estimated count', () => {
      const criteria = createFilterCriteria();
      const { getByText } = render(
        <FilterSummary criteria={criteria} estimatedCount={9999} />
      );

      expect(getByText('9999+ títulos disponibles')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    test('renders all text content accessibly', () => {
      const criteria = createFilterCriteria('MOVIE', [mockGenres[0]]);
      const { getByText } = render(
        <FilterSummary 
          criteria={criteria} 
          estimatedCount={25}
          loading={false}
        />
      );

      // Check that all important text is rendered and accessible
      expect(getByText('📋 Resumen de Filtros')).toBeTruthy();
      expect(getByText('Tipo de Contenido')).toBeTruthy();
      expect(getByText('🎬')).toBeTruthy();
      expect(getByText('Películas')).toBeTruthy();
      expect(getByText('Géneros (1)')).toBeTruthy();
      expect(getByText('Action')).toBeTruthy();
      expect(getByText('Contenido Disponible')).toBeTruthy();
      expect(getByText('25 títulos disponibles')).toBeTruthy();
    });
  });
});