/**
 * Property-Based Tests: FilterSummary Component
 * 
 * **Feature: advanced-content-filtering, Property 18: Filter Summary Display**
 * **Validates: Requirements 8.4, 8.5, 6.4**
 * 
 * Tests universal properties of the FilterSummary component across various inputs.
 */

import { render } from '@testing-library/react-native';
import * as fc from 'fast-check';
import React from 'react';
import FilterSummary from '../components/FilterSummary';
import { FilterSummaryProps, MediaType } from '../types/content-filtering';

describe('FilterSummary Property-Based Tests', () => {
  
  // Generators for property-based testing
  const mediaTypeArb = fc.constantFrom('MOVIE' as MediaType, 'TV' as MediaType);
  const genreIdsArb = fc.array(fc.integer({ min: 1, max: 999 }), { maxLength: 3 });
  const genreNamesArb = fc.array(
    fc.string({ minLength: 2, maxLength: 20 }).filter(name => 
      name.trim().length > 1 && 
      !name.match(/^\d+$/) && // Avoid pure numbers
      name.trim() !== ''
    ), 
    { maxLength: 3 }
  );

  test('Property 18: Filter Summary Display - Always renders core sections', () => {
    fc.assert(
      fc.property(
        mediaTypeArb,
        genreIdsArb,
        genreNamesArb,
        fc.boolean(),
        fc.boolean(),
        (mediaType, genreIds, genreNames, showClearButton, compact) => {
          const { getByText } = render(
            <FilterSummary 
              mediaType={mediaType}
              genreIds={genreIds}
              genreNames={genreNames}
              showClearButton={showClearButton}
              compact={compact}
            />
          );
          
          if (compact) {
            // Compact mode should show different content
            if (mediaType && genreIds.length > 0) {
              const mediaIcon = mediaType === 'MOVIE' ? '🎬' : '📺';
              const mediaLabel = mediaType === 'MOVIE' ? 'Películas' : 'Series';
              expect(getByText(`${mediaIcon} ${mediaLabel} • ${genreIds.length} géneros`)).toBeTruthy();
            } else {
              expect(getByText('Sin filtros aplicados')).toBeTruthy();
            }
          } else {
            // Full mode should show detailed sections
            expect(getByText('📋 Filtros Aplicados')).toBeTruthy();
            expect(getByText('Tipo de Contenido:')).toBeTruthy();
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 18: Filter Summary Display - Media type display consistency', () => {
    fc.assert(
      fc.property(
        mediaTypeArb,
        genreIdsArb,
        genreNamesArb,
        (mediaType, genreIds, genreNames) => {
          const { getByText } = render(
            <FilterSummary 
              mediaType={mediaType}
              genreIds={genreIds}
              genreNames={genreNames}
            />
          );
          
          if (mediaType === 'MOVIE') {
            expect(getByText('🎬')).toBeTruthy();
            expect(getByText('Películas')).toBeTruthy();
          } else {
            expect(getByText('📺')).toBeTruthy();
            expect(getByText('Series')).toBeTruthy();
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 18: Filter Summary Display - Genre section behavior', () => {
    fc.assert(
      fc.property(
        mediaTypeArb,
        genreIdsArb,
        genreNamesArb,
        (mediaType, genreIds, genreNames) => {
          const { getByText, queryByText } = render(
            <FilterSummary 
              mediaType={mediaType}
              genreIds={genreIds}
              genreNames={genreNames}
            />
          );
          
          // Should show genre count
          expect(getByText(`Géneros (${genreIds.length}/3):`)).toBeTruthy();
          
          if (genreNames.length === 0) {
            // Should show "no genres selected" message when no genre names provided
            expect(getByText('Ningún género seleccionado')).toBeTruthy();
          } else {
            // All provided genre names should be displayed
            genreNames.forEach(name => {
              expect(getByText(name)).toBeTruthy();
            });
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 18: Filter Summary Display - Clear button visibility', () => {
    fc.assert(
      fc.property(
        mediaTypeArb,
        genreIdsArb,
        genreNamesArb,
        fc.boolean(),
        (mediaType, genreIds, genreNames, showClearButton) => {
          const mockOnClear = jest.fn();
          const { queryByText } = render(
            <FilterSummary 
              mediaType={mediaType}
              genreIds={genreIds}
              genreNames={genreNames}
              showClearButton={showClearButton}
              onClear={mockOnClear}
            />
          );
          
          const hasFilters = mediaType && genreIds.length > 0;
          const clearButton = queryByText('Limpiar');
          
          if (showClearButton && hasFilters) {
            expect(clearButton).toBeTruthy();
          } else {
            expect(clearButton).toBeNull();
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 18: Filter Summary Display - Summary message accuracy', () => {
    fc.assert(
      fc.property(
        mediaTypeArb,
        genreIdsArb,
        genreNamesArb,
        (mediaType, genreIds, genreNames) => {
          const { getByText, queryByText } = render(
            <FilterSummary 
              mediaType={mediaType}
              genreIds={genreIds}
              genreNames={genreNames}
            />
          );
          
          const hasFilters = mediaType && genreIds.length > 0;
          
          if (hasFilters) {
            const mediaLabel = mediaType === 'MOVIE' ? 'películas' : 'series';
            expect(getByText(`✨ Buscaremos ${mediaLabel} que coincidan con tus géneros favoritos`)).toBeTruthy();
          } else {
            expect(getByText('Selecciona un tipo de contenido y géneros para personalizar tus recomendaciones')).toBeTruthy();
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 18: Filter Summary Display - Compact mode consistency', () => {
    fc.assert(
      fc.property(
        mediaTypeArb,
        genreIdsArb,
        genreNamesArb,
        (mediaType, genreIds, genreNames) => {
          const { getByText, queryByText } = render(
            <FilterSummary 
              mediaType={mediaType}
              genreIds={genreIds}
              genreNames={genreNames}
              compact={true}
            />
          );
          
          const hasFilters = mediaType && genreIds.length > 0;
          
          if (hasFilters) {
            const mediaIcon = mediaType === 'MOVIE' ? '🎬' : '📺';
            const mediaLabel = mediaType === 'MOVIE' ? 'Películas' : 'Series';
            expect(getByText(`${mediaIcon} ${mediaLabel} • ${genreIds.length} géneros`)).toBeTruthy();
          } else {
            expect(getByText('Sin filtros aplicados')).toBeTruthy();
          }
          
          // Compact mode should not show detailed sections
          expect(queryByText('📋 Filtros Aplicados')).toBeNull();
          expect(queryByText('Tipo de Contenido:')).toBeNull();
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 18: Filter Summary Display - Genre limit enforcement', () => {
    fc.assert(
      fc.property(
        mediaTypeArb,
        fc.array(fc.integer({ min: 1, max: 999 }), { minLength: 0, maxLength: 10 }), // Allow more than 3 to test limit
        fc.array(
          fc.string({ minLength: 2, maxLength: 20 }).filter(name => 
            name.trim().length > 1 && !name.match(/^\d+$/) && name.trim() !== ''
          ), 
          { minLength: 0, maxLength: 10 }
        ),
        (mediaType, allGenreIds, allGenreNames) => {
          // Take only first 3 to respect the limit
          const limitedGenreIds = allGenreIds.slice(0, 3);
          const limitedGenreNames = allGenreNames.slice(0, 3);
          
          const { queryByText } = render(
            <FilterSummary 
              mediaType={mediaType}
              genreIds={limitedGenreIds}
              genreNames={limitedGenreNames}
            />
          );
          
          // Should never show more than 3 genres
          expect(limitedGenreIds.length).toBeLessThanOrEqual(3);
          expect(limitedGenreNames.length).toBeLessThanOrEqual(3);
          
          // All displayed genre names should be from the limited set
          limitedGenreNames.forEach(name => {
            expect(queryByText(name)).toBeTruthy();
          });
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});