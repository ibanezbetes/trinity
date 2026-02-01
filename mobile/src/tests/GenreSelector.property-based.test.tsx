/**
 * Property-Based Tests: GenreSelector Component
 * 
 * **Feature: advanced-content-filtering, Property 15: UI State Management**
 * **Validates: Requirements 8.2, 8.3**
 * 
 * Tests universal properties of the GenreSelector component using property-based testing.
 */

import { render } from '@testing-library/react-native';
import * as fc from 'fast-check';
import React from 'react';
import GenreSelector from '../components/GenreSelector';
import { Genre, GenreSelectorProps, MAX_GENRES, MediaType } from '../types/content-filtering';

// Mock the useGenres hook
jest.mock('../hooks/useGenres', () => ({
  useGenres: jest.fn(() => ({
    genres: [
      { id: 1, name: 'Action' },
      { id: 2, name: 'Comedy' },
      { id: 3, name: 'Drama' },
      { id: 4, name: 'Horror' },
      { id: 5, name: 'Romance' }
    ],
    loading: false,
    error: null,
    refetch: jest.fn()
  })),
  useGenreValidation: jest.fn(() => ({
    validateGenreSelection: jest.fn(() => ({
      valid: true,
      errors: [],
      warnings: []
    }))
  }))
}));

describe('GenreSelector Property-Based Tests', () => {
  
  const mediaTypeArb = fc.constantFrom('MOVIE' as MediaType, 'TV' as MediaType);
  const genreIdsArb = fc.array(fc.integer({ min: 1, max: 5 }), { maxLength: 2 });
  const maxGenresArb = fc.integer({ min: 1, max: 5 });
  
  test('Property 15: UI State Management - Component renders without crashing', () => {
    fc.assert(
      fc.property(
        mediaTypeArb,
        genreIdsArb,
        maxGenresArb,
        fc.boolean(),
        (mediaType, selectedGenreIds, maxGenres, disabled) => {
          const mockOnSelectionChange = jest.fn();
          
          const { getByText } = render(
            <GenreSelector
              mediaType={mediaType}
              selectedGenreIds={selectedGenreIds}
              onGenreSelectionChange={mockOnSelectionChange}
              maxGenres={maxGenres}
              disabled={disabled}
            />
          );
          
          // Component should render the header
          const expectedHeader = mediaType === 'MOVIE' ? 'Géneros de Películas' : 'Géneros de Series';
          expect(getByText(expectedHeader)).toBeTruthy();
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('Property 15: UI State Management - Selection counter accuracy', () => {
    fc.assert(
      fc.property(
        mediaTypeArb,
        genreIdsArb,
        maxGenresArb,
        (mediaType, selectedGenreIds, maxGenres) => {
          const mockOnSelectionChange = jest.fn();
          
          const { getByText } = render(
            <GenreSelector
              mediaType={mediaType}
              selectedGenreIds={selectedGenreIds}
              onGenreSelectionChange={mockOnSelectionChange}
              maxGenres={maxGenres}
            />
          );
          
          // Should show accurate selection counter
          const counterText = `${selectedGenreIds.length}/${maxGenres}`;
          expect(getByText(counterText)).toBeTruthy();
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('Property 15: UI State Management - Loading state shows appropriate message', () => {
    fc.assert(
      fc.property(
        mediaTypeArb,
        (mediaType) => {
          // Mock loading state
          const useGenres = require('../hooks/useGenres').useGenres;
          useGenres.mockReturnValueOnce({
            genres: [],
            loading: true,
            error: null,
            refetch: jest.fn()
          });
          
          const mockOnSelectionChange = jest.fn();
          
          const { getByText } = render(
            <GenreSelector
              mediaType={mediaType}
              selectedGenreIds={[]}
              onGenreSelectionChange={mockOnSelectionChange}
            />
          );
          
          // Should always show loading message
          expect(getByText('Cargando géneros...')).toBeTruthy();
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
  
  test('Property 15: UI State Management - Empty state shows appropriate message', () => {
    fc.assert(
      fc.property(
        mediaTypeArb,
        (mediaType) => {
          // Mock empty state
          const useGenres = require('../hooks/useGenres').useGenres;
          useGenres.mockReturnValueOnce({
            genres: [],
            loading: false,
            error: null,
            refetch: jest.fn()
          });
          
          const mockOnSelectionChange = jest.fn();
          
          const { getByText } = render(
            <GenreSelector
              mediaType={mediaType}
              selectedGenreIds={[]}
              onGenreSelectionChange={mockOnSelectionChange}
            />
          );
          
          // Should show appropriate empty message based on media type
          const expectedMessage = mediaType === 'MOVIE' 
            ? 'No se encontraron géneros para películas'
            : 'No se encontraron géneros para series';
          
          expect(getByText(expectedMessage)).toBeTruthy();
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
  
  test('Property 15: UI State Management - No media type shows placeholder', () => {
    fc.assert(
      fc.property(
        genreIdsArb,
        (selectedGenreIds) => {
          const mockOnSelectionChange = jest.fn();
          
          const { getByText } = render(
            <GenreSelector
              selectedGenreIds={selectedGenreIds}
              onGenreSelectionChange={mockOnSelectionChange}
            />
          );
          
          // Should show placeholder when no media type is selected
          expect(getByText('Primero selecciona un tipo de contenido')).toBeTruthy();
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });
  
  test('Property 15: UI State Management - Error state shows retry option', () => {
    fc.assert(
      fc.property(
        mediaTypeArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        (mediaType, errorMessage) => {
          // Mock error state
          const useGenres = require('../hooks/useGenres').useGenres;
          useGenres.mockReturnValueOnce({
            genres: [],
            loading: false,
            error: errorMessage,
            refetch: jest.fn()
          });
          
          const mockOnSelectionChange = jest.fn();
          
          const { getByText } = render(
            <GenreSelector
              mediaType={mediaType}
              selectedGenreIds={[]}
              onGenreSelectionChange={mockOnSelectionChange}
            />
          );
          
          // Should show error message and retry button
          expect(getByText(`❌ ${errorMessage}`)).toBeTruthy();
          expect(getByText('Reintentar')).toBeTruthy();
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });
  
  test('Property 15: UI State Management - Help text shows when no genres selected', () => {
    fc.assert(
      fc.property(
        mediaTypeArb,
        maxGenresArb,
        (mediaType, maxGenres) => {
          const mockOnSelectionChange = jest.fn();
          
          const { getByText } = render(
            <GenreSelector
              mediaType={mediaType}
              selectedGenreIds={[]}
              onGenreSelectionChange={mockOnSelectionChange}
              maxGenres={maxGenres}
            />
          );
          
          // Should show help text when no genres are selected
          expect(getByText(`Selecciona hasta ${maxGenres} géneros para personalizar tus recomendaciones`)).toBeTruthy();
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });
});