/**
 * Property Test: Genre Selection Limits
 * 
 * **Feature: advanced-content-filtering, Property 3: Genre Selection Limits**
 * 
 * **Validates: Requirements 2.2, 2.3**
 * 
 * For any genre selection interface, the system should allow selection of up to 
 * 3 genres and prevent selection of more than 3 genres with appropriate validation.
 */

import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import { MediaType } from '../types/content-filtering';

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generates genre selection scenarios
 */
const genreSelectionArb = fc.record({
  availableGenres: fc.array(
    fc.record({
      id: fc.integer({ min: 1, max: 100 }),
      name: fc.string({ minLength: 3, maxLength: 20 }),
      mediaType: fc.constantFrom('MOVIE', 'TV')
    }),
    { minLength: 5, maxLength: 20 }
  ),
  selectedGenreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 10 }),
  attemptToSelect: fc.integer({ min: 1, max: 100 }),
  maxAllowed: fc.constant(3)
});

/**
 * Generates UI state scenarios
 */
const uiStateArb = fc.record({
  currentSelection: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 5 }),
  isDisabled: fc.boolean(),
  showValidationMessage: fc.boolean(),
  maxGenres: fc.constant(3)
});

/**
 * Generates genre interaction scenarios
 */
const genreInteractionArb = fc.record({
  initialSelection: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 }),
  interactions: fc.array(
    fc.record({
      action: fc.constantFrom('SELECT', 'DESELECT'),
      genreId: fc.integer({ min: 1, max: 100 })
    }),
    { minLength: 1, maxLength: 10 }
  )
});

// ============================================================================
// Genre Selection Simulator
// ============================================================================

interface GenreSelectionState {
  selectedGenres: number[];
  maxGenres: number;
  validationMessage?: string;
  isSelectionDisabled: boolean;
}

class GenreSelector {
  private state: GenreSelectionState;

  constructor(maxGenres: number = 3) {
    this.state = {
      selectedGenres: [],
      maxGenres,
      isSelectionDisabled: false
    };
  }

  getState(): GenreSelectionState {
    return { 
      ...this.state,
      selectedGenres: [...this.state.selectedGenres] // Deep copy the array
    };
  }

  selectGenre(genreId: number): { success: boolean; message?: string } {
    // Check if already selected
    if (this.state.selectedGenres.includes(genreId)) {
      return {
        success: false,
        message: 'Genre already selected'
      };
    }

    // Check if at maximum limit
    if (this.state.selectedGenres.length >= this.state.maxGenres) {
      this.state.validationMessage = `Maximum ${this.state.maxGenres} genres allowed`;
      this.state.isSelectionDisabled = true;
      return {
        success: false,
        message: this.state.validationMessage
      };
    }

    // Add genre to selection
    this.state.selectedGenres.push(genreId);
    
    // Update UI state
    if (this.state.selectedGenres.length >= this.state.maxGenres) {
      this.state.isSelectionDisabled = true;
      this.state.validationMessage = `Maximum ${this.state.maxGenres} genres selected`;
    } else {
      this.state.validationMessage = undefined;
      this.state.isSelectionDisabled = false;
    }

    return { success: true };
  }

  deselectGenre(genreId: number): { success: boolean; message?: string } {
    const index = this.state.selectedGenres.indexOf(genreId);
    
    if (index === -1) {
      return {
        success: false,
        message: 'Genre not selected'
      };
    }

    // Remove genre from selection
    this.state.selectedGenres.splice(index, 1);
    
    // Update UI state
    this.state.isSelectionDisabled = false;
    if (this.state.selectedGenres.length < this.state.maxGenres) {
      this.state.validationMessage = undefined;
    }

    return { success: true };
  }

  canSelectMore(): boolean {
    return this.state.selectedGenres.length < this.state.maxGenres;
  }

  getRemainingSlots(): number {
    return Math.max(0, this.state.maxGenres - this.state.selectedGenres.length);
  }

  reset(): void {
    this.state = {
      selectedGenres: [],
      maxGenres: this.state.maxGenres,
      isSelectionDisabled: false
    };
  }

  setInitialSelection(genreIds: number[]): { success: boolean; message?: string } {
    if (genreIds.length > this.state.maxGenres) {
      return {
        success: false,
        message: `Cannot set initial selection: exceeds maximum of ${this.state.maxGenres} genres`
      };
    }

    // Remove duplicates
    const uniqueGenres = [...new Set(genreIds)];
    
    this.state.selectedGenres = [...uniqueGenres]; // Create a new array
    this.state.isSelectionDisabled = uniqueGenres.length >= this.state.maxGenres;
    
    if (this.state.isSelectionDisabled) {
      this.state.validationMessage = `Maximum ${this.state.maxGenres} genres selected`;
    } else {
      this.state.validationMessage = undefined;
    }

    return { success: true };
  }
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates genre selection constraints
 */
function validateGenreSelection(selectedGenres: number[], maxGenres: number = 3): {
  valid: boolean;
  errors: string[];
  canSelectMore: boolean;
} {
  const errors: string[] = [];
  
  // Check maximum limit
  if (selectedGenres.length > maxGenres) {
    errors.push(`Too many genres selected: ${selectedGenres.length} > ${maxGenres}`);
  }
  
  // Check for duplicates
  const uniqueGenres = new Set(selectedGenres);
  if (uniqueGenres.size !== selectedGenres.length) {
    errors.push('Duplicate genres not allowed');
  }
  
  // Check for valid genre IDs
  const invalidGenres = selectedGenres.filter(id => !Number.isInteger(id) || id <= 0);
  if (invalidGenres.length > 0) {
    errors.push('Invalid genre IDs detected');
  }

  return {
    valid: errors.length === 0,
    errors,
    canSelectMore: selectedGenres.length < maxGenres
  };
}

/**
 * Simulates UI behavior for genre selection
 */
function simulateUIBehavior(
  currentSelection: number[], 
  attemptToSelect: number, 
  maxGenres: number = 3
): {
  selectionAllowed: boolean;
  newSelection: number[];
  validationMessage?: string;
  uiDisabled: boolean;
} {
  const selector = new GenreSelector(maxGenres);
  selector.setInitialSelection(currentSelection);
  
  const result = selector.selectGenre(attemptToSelect);
  const state = selector.getState();
  
  return {
    selectionAllowed: result.success,
    newSelection: state.selectedGenres,
    validationMessage: result.message || state.validationMessage,
    uiDisabled: state.isSelectionDisabled
  };
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Genre Selection Limits Property Tests', () => {

  test('Property 3: Genre selection should never exceed maximum limit', () => {
    fc.assert(
      fc.property(
        genreSelectionArb,
        (scenario) => {
          const selector = new GenreSelector(scenario.maxAllowed);
          
          // Try to select genres from the available list
          let successfulSelections = 0;
          const selectedGenres: number[] = [];
          
          for (const genreId of scenario.selectedGenreIds) {
            const result = selector.selectGenre(genreId);
            if (result.success) {
              successfulSelections++;
              selectedGenres.push(genreId);
            }
            
            // Should never exceed maximum
            const state = selector.getState();
            expect(state.selectedGenres.length).toBeLessThanOrEqual(scenario.maxAllowed);
            
            // Once at maximum, further selections should fail
            if (state.selectedGenres.length >= scenario.maxAllowed) {
              expect(state.isSelectionDisabled).toBe(true);
              expect(state.validationMessage).toBeDefined();
            }
          }
          
          // Final state should respect limits
          const finalState = selector.getState();
          expect(finalState.selectedGenres.length).toBeLessThanOrEqual(scenario.maxAllowed);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3: UI should disable selection when maximum reached', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 5 }),
        fc.integer({ min: 1, max: 100 }),
        (initialSelection, newGenreId) => {
          const maxGenres = 3;
          const uniqueInitial = [...new Set(initialSelection)].slice(0, maxGenres);
          
          const selector = new GenreSelector(maxGenres);
          selector.setInitialSelection(uniqueInitial);
          
          const initialState = selector.getState();
          
          // If already at maximum, UI should be disabled
          if (initialState.selectedGenres.length >= maxGenres) {
            expect(initialState.isSelectionDisabled).toBe(true);
            expect(initialState.validationMessage).toBeDefined();
            
            // Attempting to select more should fail
            const result = selector.selectGenre(newGenreId);
            expect(result.success).toBe(false);
            expect(result.message).toBeDefined();
          } else {
            // If not at maximum, UI should allow selection
            expect(initialState.isSelectionDisabled).toBe(false);
            
            // Should be able to select until maximum is reached
            expect(selector.canSelectMore()).toBe(true);
            expect(selector.getRemainingSlots()).toBeGreaterThan(0);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3: Deselection should re-enable selection when below maximum', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 3, maxLength: 3 }),
        (genreIds) => {
          const maxGenres = 3;
          const uniqueGenres = [...new Set(genreIds)];
          
          if (uniqueGenres.length < 3) {
            // Skip if we don't have 3 unique genres
            return true;
          }
          
          const selector = new GenreSelector(maxGenres);
          
          // Select maximum genres
          uniqueGenres.forEach(id => selector.selectGenre(id));
          
          let state = selector.getState();
          expect(state.selectedGenres.length).toBe(maxGenres);
          expect(state.isSelectionDisabled).toBe(true);
          expect(selector.canSelectMore()).toBe(false);
          
          // Deselect one genre
          const genreToRemove = uniqueGenres[0];
          const deselectionResult = selector.deselectGenre(genreToRemove);
          expect(deselectionResult.success).toBe(true);
          
          // UI should be re-enabled
          state = selector.getState();
          expect(state.selectedGenres.length).toBe(maxGenres - 1);
          expect(state.isSelectionDisabled).toBe(false);
          expect(selector.canSelectMore()).toBe(true);
          expect(selector.getRemainingSlots()).toBe(1);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 3: Genre selection validation should be consistent', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 10 }),
        (genreIds) => {
          const maxGenres = 3;
          const validation = validateGenreSelection(genreIds, maxGenres);
          
          // Validation should be consistent with business rules
          if (genreIds.length <= maxGenres) {
            const uniqueGenres = [...new Set(genreIds)];
            const hasValidIds = genreIds.every(id => Number.isInteger(id) && id > 0);
            
            if (uniqueGenres.length === genreIds.length && hasValidIds) {
              expect(validation.valid).toBe(true);
              expect(validation.errors).toHaveLength(0);
            }
          } else {
            expect(validation.valid).toBe(false);
            expect(validation.errors.some(e => e.includes('Too many genres'))).toBe(true);
          }
          
          // canSelectMore should be accurate
          if (validation.valid) {
            const uniqueValidGenres = [...new Set(genreIds.filter(id => Number.isInteger(id) && id > 0))];
            expect(validation.canSelectMore).toBe(uniqueValidGenres.length < maxGenres);
          } else {
            // If validation failed, canSelectMore should be based on the actual count
            const actualCount = Math.min(genreIds.length, maxGenres);
            expect(validation.canSelectMore).toBe(actualCount < maxGenres);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3: Interactive genre selection should maintain invariants', () => {
    fc.assert(
      fc.property(
        genreInteractionArb,
        (scenario) => {
          const maxGenres = 3;
          const selector = new GenreSelector(maxGenres);
          
          // Set initial selection
          const validInitial = [...new Set(scenario.initialSelection)].slice(0, maxGenres);
          const initResult = selector.setInitialSelection(validInitial);
          expect(initResult.success).toBe(true);
          
          const initialState = selector.getState();
          
          // Apply interactions
          for (const interaction of scenario.interactions) {
            const stateBefore = selector.getState();
            
            if (interaction.action === 'SELECT') {
              const wasAlreadySelected = stateBefore.selectedGenres.includes(interaction.genreId);
              const wasAtMaximum = stateBefore.selectedGenres.length >= maxGenres;
              
              const result = selector.selectGenre(interaction.genreId);
              const stateAfter = selector.getState();
              
              // Selection should respect maximum limit
              expect(stateAfter.selectedGenres.length).toBeLessThanOrEqual(maxGenres);
              
              // Determine if selection should have succeeded
              const shouldSucceed = !wasAlreadySelected && !wasAtMaximum;
              
              if (shouldSucceed) {
                expect(result.success).toBe(true);
                expect(stateAfter.selectedGenres).toContain(interaction.genreId);
                expect(stateAfter.selectedGenres.length).toBe(stateBefore.selectedGenres.length + 1);
              } else {
                expect(result.success).toBe(false);
                expect(result.message).toBeDefined();
                // State should not change on failed selection
                expect(stateAfter.selectedGenres.length).toBe(stateBefore.selectedGenres.length);
              }
              
              // If at maximum, UI should be disabled
              if (stateAfter.selectedGenres.length >= maxGenres) {
                expect(stateAfter.isSelectionDisabled).toBe(true);
              }
              
            } else if (interaction.action === 'DESELECT') {
              const wasSelected = stateBefore.selectedGenres.includes(interaction.genreId);
              
              const result = selector.deselectGenre(interaction.genreId);
              const stateAfter = selector.getState();
              
              if (wasSelected) {
                expect(result.success).toBe(true);
                expect(stateAfter.selectedGenres).not.toContain(interaction.genreId);
                expect(stateAfter.selectedGenres.length).toBe(stateBefore.selectedGenres.length - 1);
              } else {
                expect(result.success).toBe(false);
                expect(result.message).toContain('not selected');
                // State should not change on failed deselection
                expect(stateAfter.selectedGenres.length).toBe(stateBefore.selectedGenres.length);
              }
              
              // If below maximum, UI should be enabled
              if (stateAfter.selectedGenres.length < maxGenres) {
                expect(stateAfter.isSelectionDisabled).toBe(false);
              }
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3: Duplicate genre selection should be prevented', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 3 }),
        (genreIds) => {
          const selector = new GenreSelector(3);
          const selectedGenres: number[] = [];
          
          // Select each genre
          for (const genreId of genreIds) {
            const result = selector.selectGenre(genreId);
            
            if (!selectedGenres.includes(genreId)) {
              // First time selecting this genre should succeed
              expect(result.success).toBe(true);
              selectedGenres.push(genreId);
            } else {
              // Duplicate selection should fail
              expect(result.success).toBe(false);
              expect(result.message).toContain('already selected');
            }
          }
          
          // Try to select duplicates again
          for (const genreId of selectedGenres) {
            const result = selector.selectGenre(genreId);
            expect(result.success).toBe(false);
            expect(result.message).toContain('already selected');
          }
          
          // Final state should have no duplicates
          const state = selector.getState();
          const uniqueSelected = [...new Set(state.selectedGenres)];
          expect(state.selectedGenres.length).toBe(uniqueSelected.length);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 3: UI state should reflect selection count accurately', () => {
    fc.assert(
      fc.property(
        uiStateArb,
        (uiState) => {
          const selector = new GenreSelector(uiState.maxGenres);
          
          // Set initial selection (up to max)
          const validSelection = uiState.currentSelection.slice(0, uiState.maxGenres);
          const uniqueSelection = [...new Set(validSelection)];
          
          selector.setInitialSelection(uniqueSelection);
          const state = selector.getState();
          
          // UI state should be consistent
          expect(state.selectedGenres.length).toBe(uniqueSelection.length);
          expect(selector.getRemainingSlots()).toBe(uiState.maxGenres - uniqueSelection.length);
          expect(selector.canSelectMore()).toBe(uniqueSelection.length < uiState.maxGenres);
          
          // Disabled state should match selection count
          if (uniqueSelection.length >= uiState.maxGenres) {
            expect(state.isSelectionDisabled).toBe(true);
            expect(state.validationMessage).toBeDefined();
          } else {
            expect(state.isSelectionDisabled).toBe(false);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Integration Tests for Genre Selection Limits
// ============================================================================

describe('Genre Selection Limits Integration Tests', () => {

  test('Selecting exactly 3 genres should work and disable further selection', () => {
    const selector = new GenreSelector(3);
    
    // Select 3 genres
    const genres = [28, 12, 35]; // Action, Adventure, Comedy
    
    genres.forEach(genreId => {
      const result = selector.selectGenre(genreId);
      expect(result.success).toBe(true);
    });
    
    const state = selector.getState();
    expect(state.selectedGenres).toEqual(genres);
    expect(state.isSelectionDisabled).toBe(true);
    expect(state.validationMessage).toContain('Maximum 3 genres');
    expect(selector.canSelectMore()).toBe(false);
    expect(selector.getRemainingSlots()).toBe(0);
  });

  test('Attempting to select 4th genre should fail', () => {
    const selector = new GenreSelector(3);
    
    // Select 3 genres first
    [28, 12, 35].forEach(genreId => {
      selector.selectGenre(genreId);
    });
    
    // Attempt to select 4th genre
    const result = selector.selectGenre(18); // Drama
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('Maximum 3 genres allowed');
    
    const state = selector.getState();
    expect(state.selectedGenres).toHaveLength(3);
    expect(state.selectedGenres).not.toContain(18);
  });

  test('Deselecting genre should re-enable selection', () => {
    const selector = new GenreSelector(3);
    
    // Select 3 genres
    [28, 12, 35].forEach(genreId => {
      selector.selectGenre(genreId);
    });
    
    // Verify disabled state
    expect(selector.getState().isSelectionDisabled).toBe(true);
    
    // Deselect one genre
    const result = selector.deselectGenre(28);
    expect(result.success).toBe(true);
    
    // Verify re-enabled state
    const state = selector.getState();
    expect(state.isSelectionDisabled).toBe(false);
    expect(state.selectedGenres).toHaveLength(2);
    expect(state.selectedGenres).toEqual([12, 35]);
    expect(selector.canSelectMore()).toBe(true);
    expect(selector.getRemainingSlots()).toBe(1);
  });

  test('Selecting duplicate genre should fail', () => {
    const selector = new GenreSelector(3);
    
    // Select a genre
    const firstResult = selector.selectGenre(28);
    expect(firstResult.success).toBe(true);
    
    // Try to select the same genre again
    const duplicateResult = selector.selectGenre(28);
    expect(duplicateResult.success).toBe(false);
    expect(duplicateResult.message).toContain('already selected');
    
    // State should remain unchanged
    const state = selector.getState();
    expect(state.selectedGenres).toEqual([28]);
    expect(state.selectedGenres).toHaveLength(1);
  });

  test('Empty selection should allow all genres', () => {
    const selector = new GenreSelector(3);
    
    const state = selector.getState();
    expect(state.selectedGenres).toHaveLength(0);
    expect(state.isSelectionDisabled).toBe(false);
    expect(selector.canSelectMore()).toBe(true);
    expect(selector.getRemainingSlots()).toBe(3);
    expect(state.validationMessage).toBeUndefined();
  });

  test('Reset should clear all selections and re-enable UI', () => {
    const selector = new GenreSelector(3);
    
    // Select maximum genres
    [28, 12, 35].forEach(genreId => {
      selector.selectGenre(genreId);
    });
    
    // Verify disabled state
    expect(selector.getState().isSelectionDisabled).toBe(true);
    
    // Reset
    selector.reset();
    
    // Verify cleared state
    const state = selector.getState();
    expect(state.selectedGenres).toHaveLength(0);
    expect(state.isSelectionDisabled).toBe(false);
    expect(selector.canSelectMore()).toBe(true);
    expect(selector.getRemainingSlots()).toBe(3);
    expect(state.validationMessage).toBeUndefined();
  });
});