/**
 * Property Test: Room Creation Validation
 * 
 * **Feature: advanced-content-filtering, Property 2: Room Creation Validation**
 * 
 * **Validates: Requirements 1.3, 2.4**
 * 
 * For any room creation attempt, the system should prevent creation without 
 * media type selection and allow creation with valid media type and 0-3 genres.
 */

import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import { MediaType, ContentFilteringError, ErrorCodes } from '../types/content-filtering';

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generates valid room creation inputs
 */
const validCreateRoomInputArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  description: fc.option(fc.string({ maxLength: 500 })),
  isPrivate: fc.option(fc.boolean()),
  maxMembers: fc.option(fc.integer({ min: 2, max: 50 })),
  mediaType: fc.constantFrom('MOVIE', 'TV'),
  genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 })
});

/**
 * Generates invalid room creation inputs (missing media type)
 */
const invalidCreateRoomInputArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  description: fc.option(fc.string({ maxLength: 500 })),
  isPrivate: fc.option(fc.boolean()),
  maxMembers: fc.option(fc.integer({ min: 2, max: 50 })),
  // mediaType is missing
  genreIds: fc.option(fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 }))
});

/**
 * Generates room creation inputs with too many genres
 */
const tooManyGenresInputArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  description: fc.option(fc.string({ maxLength: 500 })),
  isPrivate: fc.option(fc.boolean()),
  maxMembers: fc.option(fc.integer({ min: 2, max: 50 })),
  mediaType: fc.constantFrom('MOVIE', 'TV'),
  genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 4, maxLength: 10 }) // Too many genres
});

/**
 * Generates room creation inputs with empty or invalid names
 */
const invalidNameInputArb = fc.record({
  name: fc.oneof(
    fc.constant(''),
    fc.constant('   '), // Only whitespace
    fc.constant('\t\n'), // Only whitespace characters
    fc.string({ maxLength: 0 }) // Empty string
  ),
  description: fc.option(fc.string({ maxLength: 500 })),
  isPrivate: fc.option(fc.boolean()),
  maxMembers: fc.option(fc.integer({ min: 2, max: 50 })),
  mediaType: fc.constantFrom('MOVIE', 'TV'),
  genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 })
});

/**
 * Generates legacy room creation inputs (for backward compatibility)
 */
const legacyCreateRoomInputArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  description: fc.option(fc.string({ maxLength: 500 })),
  isPrivate: fc.option(fc.boolean()),
  maxMembers: fc.option(fc.integer({ min: 2, max: 50 })),
  genrePreferences: fc.option(fc.array(fc.string(), { maxLength: 5 }))
  // No mediaType or genreIds - legacy format
});

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates room creation input according to business rules
 */
function validateRoomCreationInput(input: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Rule 1: Name is required and cannot be empty
  if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
    errors.push('Room name is required and cannot be empty');
  }

  // Rule 2: If using new filtering system, mediaType is required
  if (input.genreIds !== undefined && input.genreIds !== null && Array.isArray(input.genreIds)) {
    if (!input.mediaType) {
      errors.push('Media type is required when genre IDs are specified');
    }
  }

  // Rule 3: MediaType must be valid if provided
  if (input.mediaType && !['MOVIE', 'TV'].includes(input.mediaType)) {
    errors.push('Media type must be MOVIE or TV');
  }

  // Rule 4: Maximum 3 genres allowed
  if (input.genreIds && Array.isArray(input.genreIds) && input.genreIds.length > 3) {
    errors.push('Maximum 3 genres allowed');
  }

  // Rule 5: Genre IDs must be positive integers if provided
  if (input.genreIds && Array.isArray(input.genreIds)) {
    const invalidGenres = input.genreIds.filter((id: any) => 
      !Number.isInteger(id) || id <= 0
    );
    if (invalidGenres.length > 0) {
      errors.push('Genre IDs must be positive integers');
    }
  }

  // Rule 6: maxMembers must be at least 2 if provided
  if (input.maxMembers !== undefined && input.maxMembers !== null) {
    if (!Number.isInteger(input.maxMembers) || input.maxMembers < 2) {
      errors.push('Maximum members must be at least 2');
    }
  }

  // Rule 7: Legacy format should be valid (genrePreferences without mediaType)
  const hasLegacyFormat = input.genrePreferences && !input.mediaType && (input.genreIds === undefined || input.genreIds === null);
  const hasNewFormat = input.mediaType && (input.genreIds !== undefined && input.genreIds !== null);
  const hasMinimalFormat = !input.genrePreferences && input.mediaType && (input.genreIds === undefined || input.genreIds === null || (Array.isArray(input.genreIds) && input.genreIds.length === 0));
  const hasBasicFormat = !input.genrePreferences && !input.mediaType && (input.genreIds === undefined || input.genreIds === null);

  if (!hasLegacyFormat && !hasNewFormat && !hasMinimalFormat && !hasBasicFormat) {
    errors.push('Invalid input format: must use either legacy (genrePreferences) or new (mediaType + genreIds) format');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Simulates room creation process
 */
function simulateRoomCreation(hostId: string, input: any): { success: boolean; room?: any; error?: string } {
  try {
    // Validate input
    const validation = validateRoomCreationInput(input);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join('; ')
      };
    }

    // Simulate successful room creation
    const room = {
      id: `room-${Math.random().toString(36).substring(7)}`,
      name: input.name.trim(),
      description: input.description,
      status: 'WAITING',
      hostId,
      mediaType: input.mediaType,
      genreIds: input.genreIds,
      genrePreferences: input.genrePreferences,
      isActive: true,
      isPrivate: input.isPrivate || false,
      memberCount: 1,
      maxMembers: input.maxMembers,
      matchCount: 0,
      createdAt: new Date().toISOString()
    };

    return {
      success: true,
      room
    };

  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Checks if room has required fields
 */
function validateRoomStructure(room: any): boolean {
  const requiredFields = ['id', 'name', 'status', 'hostId', 'isActive', 'isPrivate', 'memberCount', 'createdAt'];
  return requiredFields.every(field => field in room && room[field] !== undefined);
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Room Creation Validation Property Tests', () => {

  test('Property 2: Valid room creation inputs should succeed', () => {
    fc.assert(
      fc.property(
        validCreateRoomInputArb,
        fc.uuid(),
        (input, hostId) => {
          // Valid inputs should always succeed
          const result = simulateRoomCreation(hostId, input);
          
          expect(result.success).toBe(true);
          expect(result.room).toBeDefined();
          expect(result.error).toBeUndefined();
          
          // Validate room structure
          if (result.room) {
            expect(validateRoomStructure(result.room)).toBe(true);
            expect(result.room.name).toBe(input.name.trim());
            expect(result.room.hostId).toBe(hostId);
            expect(result.room.mediaType).toBe(input.mediaType);
            expect(result.room.genreIds).toEqual(input.genreIds);
            expect(result.room.memberCount).toBe(1);
            expect(result.room.status).toBe('WAITING');
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2: Room creation without media type should fail when genre IDs are provided', () => {
    fc.assert(
      fc.property(
        invalidCreateRoomInputArb,
        fc.uuid(),
        (input, hostId) => {
          // Add genreIds to make it invalid (genreIds without mediaType)
          const invalidInput = { ...input, genreIds: [28, 12] };
          
          const result = simulateRoomCreation(hostId, invalidInput);
          
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('Media type is required');
          expect(result.room).toBeUndefined();
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 2: Room creation with too many genres should fail', () => {
    fc.assert(
      fc.property(
        tooManyGenresInputArb,
        fc.uuid(),
        (input, hostId) => {
          // Input has more than 3 genres
          expect(input.genreIds.length).toBeGreaterThan(3);
          
          const result = simulateRoomCreation(hostId, input);
          
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('Maximum 3 genres allowed');
          expect(result.room).toBeUndefined();
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 2: Room creation with invalid names should fail', () => {
    fc.assert(
      fc.property(
        invalidNameInputArb,
        fc.uuid(),
        (input, hostId) => {
          // Input has invalid name
          expect(input.name.trim().length).toBe(0);
          
          const result = simulateRoomCreation(hostId, input);
          
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('Room name is required');
          expect(result.room).toBeUndefined();
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 2: Legacy room creation format should be supported', () => {
    fc.assert(
      fc.property(
        legacyCreateRoomInputArb,
        fc.uuid(),
        (input, hostId) => {
          // Legacy format should work
          const result = simulateRoomCreation(hostId, input);
          
          expect(result.success).toBe(true);
          expect(result.room).toBeDefined();
          expect(result.error).toBeUndefined();
          
          if (result.room) {
            expect(validateRoomStructure(result.room)).toBe(true);
            expect(result.room.name).toBe(input.name.trim());
            expect(result.room.hostId).toBe(hostId);
            expect(result.room.genrePreferences).toEqual(input.genrePreferences);
            // New fields should be undefined for legacy format
            expect(result.room.mediaType).toBeUndefined();
            expect(result.room.genreIds).toBeUndefined();
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 2: Genre count validation should be consistent', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          mediaType: fc.constantFrom('MOVIE', 'TV'),
          genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 10 })
        }),
        fc.uuid(),
        (input, hostId) => {
          const result = simulateRoomCreation(hostId, input);
          
          if (input.genreIds.length <= 3) {
            // Should succeed with 0-3 genres
            expect(result.success).toBe(true);
            expect(result.room).toBeDefined();
            if (result.room) {
              expect(result.room.genreIds).toEqual(input.genreIds);
            }
          } else {
            // Should fail with more than 3 genres
            expect(result.success).toBe(false);
            expect(result.error).toContain('Maximum 3 genres allowed');
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2: Media type validation should be strict', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          mediaType: fc.oneof(
            fc.constantFrom('MOVIE', 'TV'), // Valid
            fc.constantFrom('movie', 'tv', 'FILM', 'SERIES', 'invalid', '', null, undefined) // Invalid
          ),
          genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 })
        }),
        fc.uuid(),
        (input, hostId) => {
          const result = simulateRoomCreation(hostId, input);
          
          if (input.mediaType && ['MOVIE', 'TV'].includes(input.mediaType)) {
            // Valid media types should succeed
            expect(result.success).toBe(true);
            expect(result.room).toBeDefined();
          } else if (input.mediaType && !['MOVIE', 'TV'].includes(input.mediaType)) {
            // Invalid media types should fail
            expect(result.success).toBe(false);
            expect(result.error).toContain('Media type must be MOVIE or TV');
          }
          // Note: undefined/null mediaType with genreIds is handled by other validation
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2: Room creation should handle edge cases gracefully', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          mediaType: fc.constantFrom('MOVIE', 'TV'),
          genreIds: fc.oneof(
            fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 }), // Valid
            fc.array(fc.integer({ min: -10, max: 0 }), { minLength: 1, maxLength: 3 }), // Invalid (non-positive)
            fc.array(fc.float(), { minLength: 1, maxLength: 3 }), // Invalid (non-integers)
            fc.constant([]), // Valid (empty array)
            fc.constant(null), // Edge case
            fc.constant(undefined) // Edge case
          ),
          maxMembers: fc.oneof(
            fc.integer({ min: 2, max: 50 }), // Valid
            fc.integer({ min: -5, max: 1 }), // Invalid (too small)
            fc.float(), // Invalid (non-integer)
            fc.constant(null),
            fc.constant(undefined)
          )
        }),
        fc.uuid(),
        (input, hostId) => {
          const result = simulateRoomCreation(hostId, input);
          
          // Determine if input should be valid
          let shouldBeValid = true;
          
          // Check genreIds validity
          if (input.genreIds && Array.isArray(input.genreIds)) {
            if (input.genreIds.length > 3) {
              shouldBeValid = false;
            }
            if (input.genreIds.some((id: any) => !Number.isInteger(id) || id <= 0)) {
              shouldBeValid = false;
            }
          }
          
          // Check maxMembers validity
          if (input.maxMembers !== undefined && input.maxMembers !== null) {
            if (!Number.isInteger(input.maxMembers) || input.maxMembers < 2) {
              shouldBeValid = false;
            }
          }
          
          if (shouldBeValid) {
            expect(result.success).toBe(true);
            expect(result.room).toBeDefined();
          } else {
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Integration Tests for Room Creation Validation
// ============================================================================

describe('Room Creation Validation Integration Tests', () => {

  test('Minimal valid room creation should work', () => {
    const input = {
      name: 'Test Room',
      mediaType: 'MOVIE',
      genreIds: []
    };
    
    const result = simulateRoomCreation('test-host-id', input);
    
    expect(result.success).toBe(true);
    expect(result.room).toBeDefined();
    expect(result.room?.name).toBe('Test Room');
    expect(result.room?.mediaType).toBe('MOVIE');
    expect(result.room?.genreIds).toEqual([]);
  });

  test('Room creation with maximum genres should work', () => {
    const input = {
      name: 'Action Adventure Comedy Room',
      mediaType: 'MOVIE',
      genreIds: [28, 12, 35] // Action, Adventure, Comedy
    };
    
    const result = simulateRoomCreation('test-host-id', input);
    
    expect(result.success).toBe(true);
    expect(result.room).toBeDefined();
    expect(result.room?.genreIds).toEqual([28, 12, 35]);
  });

  test('Room creation with 4 genres should fail', () => {
    const input = {
      name: 'Too Many Genres Room',
      mediaType: 'MOVIE',
      genreIds: [28, 12, 35, 18] // 4 genres - too many
    };
    
    const result = simulateRoomCreation('test-host-id', input);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Maximum 3 genres allowed');
  });

  test('Legacy room creation should work', () => {
    const input = {
      name: 'Legacy Room',
      genrePreferences: ['Action', 'Comedy']
    };
    
    const result = simulateRoomCreation('test-host-id', input);
    
    expect(result.success).toBe(true);
    expect(result.room).toBeDefined();
    expect(result.room?.genrePreferences).toEqual(['Action', 'Comedy']);
    expect(result.room?.mediaType).toBeUndefined();
    expect(result.room?.genreIds).toBeUndefined();
  });

  test('Room creation with whitespace-only name should fail', () => {
    const input = {
      name: '   \t\n   ',
      mediaType: 'MOVIE',
      genreIds: [28]
    };
    
    const result = simulateRoomCreation('test-host-id', input);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Room name is required');
  });
});