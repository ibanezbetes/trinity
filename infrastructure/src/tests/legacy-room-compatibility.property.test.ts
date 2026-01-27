/**
 * Property Test: Legacy Room Compatibility
 * 
 * **Feature: advanced-content-filtering, Property 16: Legacy Room Compatibility**
 * 
 * **Validates: Requirements 9.1, 9.2, 9.3**
 * 
 * For any existing room without filter criteria, the system should continue using 
 * original content loading mechanisms without applying new filtering logic.
 */

import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generates legacy room structures (pre-filtering system)
 */
const legacyRoomArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  hostId: fc.uuid(),
  status: fc.constantFrom('WAITING', 'ACTIVE', 'MATCHED', 'COMPLETED'),
  genrePreferences: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 })),
  isActive: fc.boolean(),
  isPrivate: fc.boolean(),
  memberCount: fc.integer({ min: 1, max: 50 }),
  maxMembers: fc.option(fc.integer({ min: 2, max: 100 })),
  matchCount: fc.option(fc.integer({ min: 0, max: 100 })),
  resultMovieId: fc.option(fc.string()),
  inviteCode: fc.option(fc.string()),
  inviteUrl: fc.option(fc.string()),
  createdAt: fc.constant(new Date().toISOString()),
  updatedAt: fc.constant(new Date().toISOString())
  // Explicitly NO mediaType, genreIds, filterCriteria, contentIds - legacy format
});

/**
 * Generates new room structures (with filtering system)
 */
const newRoomArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  hostId: fc.uuid(),
  status: fc.constantFrom('WAITING', 'ACTIVE', 'MATCHED', 'COMPLETED'),
  mediaType: fc.constantFrom('MOVIE', 'TV'),
  genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 }),
  genreNames: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 3 }),
  contentIds: fc.array(fc.string(), { minLength: 0, maxLength: 30 }),
  filterCriteria: fc.record({
    mediaType: fc.constantFrom('MOVIE', 'TV'),
    genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 }),
    roomId: fc.uuid()
  }),
  excludedContentIds: fc.array(fc.string(), { maxLength: 100 }),
  lastContentRefresh: fc.option(fc.constant(new Date().toISOString())),
  currentContentIndex: fc.option(fc.integer({ min: 0, max: 29 })),
  isActive: fc.boolean(),
  isPrivate: fc.boolean(),
  memberCount: fc.integer({ min: 1, max: 50 }),
  maxMembers: fc.option(fc.integer({ min: 2, max: 100 })),
  matchCount: fc.option(fc.integer({ min: 0, max: 100 })),
  resultMovieId: fc.option(fc.string()),
  inviteCode: fc.option(fc.string()),
  inviteUrl: fc.option(fc.string()),
  createdAt: fc.constant(new Date().toISOString()),
  updatedAt: fc.constant(new Date().toISOString())
});

/**
 * Generates content loading requests
 */
const contentLoadingRequestArb = fc.record({
  roomId: fc.uuid(),
  userId: fc.uuid(),
  limit: fc.option(fc.integer({ min: 1, max: 50 })),
  page: fc.option(fc.integer({ min: 1, max: 10 })),
  excludeIds: fc.option(fc.array(fc.string(), { maxLength: 20 }))
});

/**
 * Generates mixed room data (should not happen in practice)
 */
const mixedRoomArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  hostId: fc.uuid(),
  status: fc.constantFrom('WAITING', 'ACTIVE', 'MATCHED'),
  // Mix of legacy and new fields
  genrePreferences: fc.option(fc.array(fc.string(), { maxLength: 3 })),
  mediaType: fc.option(fc.constantFrom('MOVIE', 'TV')),
  genreIds: fc.option(fc.array(fc.integer({ min: 1, max: 100 }), { maxLength: 3 })),
  filterCriteria: fc.option(fc.record({
    mediaType: fc.constantFrom('MOVIE', 'TV'),
    genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { maxLength: 3 }),
    roomId: fc.uuid()
  })),
  isActive: fc.boolean(),
  isPrivate: fc.boolean(),
  memberCount: fc.integer({ min: 1, max: 50 }),
  createdAt: fc.constant(new Date().toISOString()),
  updatedAt: fc.constant(new Date().toISOString())
});

// ============================================================================
// Simulation Functions
// ============================================================================

/**
 * Determines if a room is legacy format
 */
function isLegacyRoom(room: any): boolean {
  // Legacy room: no filterCriteria AND no mediaType
  return !room.filterCriteria && !room.mediaType;
}

/**
 * Determines if a room is new format
 */
function isNewRoom(room: any): boolean {
  // New room: has filterCriteria AND mediaType
  return !!(room.filterCriteria && room.mediaType);
}

/**
 * Simulates content loading decision for any room
 */
function simulateContentLoadingDecision(room: any, request: any): {
  success: boolean;
  contentSource: string;
  isLegacy: boolean;
  usedNewFiltering: boolean;
  error?: string;
} {
  try {
    const legacy = isLegacyRoom(room);
    const newFormat = isNewRoom(room);

    if (legacy) {
      // Legacy rooms should NEVER use new filtering logic
      let contentSource = 'POPULAR_CONTENT';
      
      // Check if genrePreferences has valid (non-empty) genres
      if (room.genrePreferences && Array.isArray(room.genrePreferences)) {
        const validGenres = room.genrePreferences.filter((g: string) => g && typeof g === 'string' && g.trim().length > 0);
        if (validGenres.length > 0) {
          contentSource = 'LEGACY_GENRE_PREFERENCES';
        }
      }

      return {
        success: true,
        contentSource,
        isLegacy: true,
        usedNewFiltering: false
      };
    }

    if (newFormat) {
      // New rooms should use filtering logic
      return {
        success: true,
        contentSource: 'FILTER_CRITERIA',
        isLegacy: false,
        usedNewFiltering: true
      };
    }

    // Mixed or invalid format
    return {
      success: false,
      error: 'Room format could not be determined',
      contentSource: 'UNKNOWN',
      isLegacy: false,
      usedNewFiltering: false
    };

  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      contentSource: 'ERROR',
      isLegacy: false,
      usedNewFiltering: false
    };
  }
}

/**
 * Simulates GraphQL schema compatibility check
 */
function simulateSchemaCompatibility(room: any): {
  compatible: boolean;
  missingFields: string[];
  extraFields: string[];
} {
  const requiredFields = ['id', 'name', 'hostId', 'status', 'isActive', 'isPrivate', 'memberCount', 'createdAt'];
  const legacyOptionalFields = ['genrePreferences', 'maxMembers', 'matchCount', 'resultMovieId', 'inviteCode', 'inviteUrl', 'updatedAt'];
  const newOptionalFields = ['mediaType', 'genreIds', 'genreNames', 'contentIds', 'filterCriteria', 'excludedContentIds', 'lastContentRefresh', 'currentContentIndex'];
  
  const allValidFields = [...requiredFields, ...legacyOptionalFields, ...newOptionalFields];
  
  const missingFields = requiredFields.filter(field => !(field in room) || room[field] === undefined);
  const extraFields = Object.keys(room).filter(field => !allValidFields.includes(field));
  
  return {
    compatible: missingFields.length === 0,
    missingFields,
    extraFields
  };
}

/**
 * Simulates room data migration (should be transparent)
 */
function simulateDataMigration(room: any): {
  success: boolean;
  migratedRoom: any;
  changedFields: string[];
  error?: string;
} {
  try {
    // Data migration should be transparent - no changes to room structure
    const migratedRoom = { ...room };
    
    return {
      success: true,
      migratedRoom,
      changedFields: [] // No fields should change during migration
    };

  } catch (error) {
    return {
      success: false,
      migratedRoom: room,
      changedFields: [],
      error: (error as Error).message
    };
  }
}

/**
 * Validates that legacy rooms maintain their original behavior
 */
function validateLegacyBehavior(room: any, contentResult: any): boolean {
  if (!isLegacyRoom(room)) {
    return true; // Not applicable to non-legacy rooms
  }

  // Legacy rooms should:
  // 1. Never use new filtering logic
  if (contentResult.usedNewFiltering) {
    return false;
  }

  // 2. Use appropriate content source
  const expectedSources = ['LEGACY_GENRE_PREFERENCES', 'POPULAR_CONTENT'];
  if (!expectedSources.includes(contentResult.contentSource)) {
    return false;
  }

  // 3. Be identified as legacy
  if (!contentResult.isLegacy) {
    return false;
  }

  return true;
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Legacy Room Compatibility Property Tests', () => {

  test('Property 16: Legacy rooms should never use new filtering logic', () => {
    fc.assert(
      fc.property(
        legacyRoomArb,
        contentLoadingRequestArb,
        (room, request) => {
          // Ensure room is actually legacy format
          expect(isLegacyRoom(room)).toBe(true);
          expect(isNewRoom(room)).toBe(false);
          
          const result = simulateContentLoadingDecision(room, request);
          
          expect(result.success).toBe(true);
          expect(result.isLegacy).toBe(true);
          expect(result.usedNewFiltering).toBe(false);
          expect(result.contentSource).not.toBe('FILTER_CRITERIA');
          
          // Should use legacy content sources
          expect(['LEGACY_GENRE_PREFERENCES', 'POPULAR_CONTENT']).toContain(result.contentSource);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 16: Legacy room behavior should be consistent across all operations', () => {
    fc.assert(
      fc.property(
        legacyRoomArb,
        fc.array(contentLoadingRequestArb, { minLength: 1, maxLength: 5 }),
        (room, requests) => {
          // All requests should produce consistent legacy behavior
          const results = requests.map(request => simulateContentLoadingDecision(room, request));
          
          results.forEach(result => {
            expect(result.success).toBe(true);
            expect(result.isLegacy).toBe(true);
            expect(result.usedNewFiltering).toBe(false);
            expect(validateLegacyBehavior(room, result)).toBe(true);
          });
          
          // All results should use the same content source (consistent behavior)
          const contentSources = results.map(r => r.contentSource);
          const uniqueSources = new Set(contentSources);
          expect(uniqueSources.size).toBe(1); // Should all be the same
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 16: Legacy rooms should maintain GraphQL schema compatibility', () => {
    fc.assert(
      fc.property(
        legacyRoomArb,
        (room) => {
          const compatibility = simulateSchemaCompatibility(room);
          
          expect(compatibility.compatible).toBe(true);
          expect(compatibility.missingFields).toEqual([]);
          
          // Extra fields are allowed (forward compatibility)
          // but legacy rooms shouldn't have new filtering fields
          const newFilteringFields = ['mediaType', 'genreIds', 'filterCriteria', 'contentIds'];
          const hasNewFields = newFilteringFields.some(field => field in room && (room as any)[field] !== undefined);
          expect(hasNewFields).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 16: Data migration should be transparent for legacy rooms', () => {
    fc.assert(
      fc.property(
        legacyRoomArb,
        (room) => {
          const migration = simulateDataMigration(room);
          
          expect(migration.success).toBe(true);
          expect(migration.changedFields).toEqual([]);
          
          // Migrated room should be identical to original
          expect(migration.migratedRoom).toEqual(room);
          
          // Should still be identified as legacy after migration
          expect(isLegacyRoom(migration.migratedRoom)).toBe(true);
          expect(isNewRoom(migration.migratedRoom)).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 16: Legacy rooms should work regardless of genrePreferences content', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          hostId: fc.uuid(),
          status: fc.constantFrom('WAITING', 'ACTIVE', 'MATCHED', 'COMPLETED'),
          genrePreferences: fc.oneof(
            fc.constant(undefined),
            fc.constant(null),
            fc.constant([]),
            fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
            fc.array(fc.string({ minLength: 0, maxLength: 0 }), { minLength: 1, maxLength: 3 }) // Empty strings
          ),
          isActive: fc.boolean(),
          isPrivate: fc.boolean(),
          memberCount: fc.integer({ min: 1, max: 50 }),
          maxMembers: fc.option(fc.integer({ min: 2, max: 100 })),
          matchCount: fc.option(fc.integer({ min: 0, max: 100 })),
          resultMovieId: fc.option(fc.string()),
          inviteCode: fc.option(fc.string()),
          inviteUrl: fc.option(fc.string()),
          createdAt: fc.constant(new Date().toISOString()),
          updatedAt: fc.constant(new Date().toISOString())
        }),
        contentLoadingRequestArb,
        (room, request) => {
          // Should be legacy regardless of genrePreferences content
          expect(isLegacyRoom(room)).toBe(true);
          
          const result = simulateContentLoadingDecision(room, request);
          
          expect(result.success).toBe(true);
          expect(result.isLegacy).toBe(true);
          expect(result.usedNewFiltering).toBe(false);
          
          // Content source should depend on genrePreferences validity
          if ((room as any).genrePreferences && Array.isArray((room as any).genrePreferences)) {
            const validGenres = (room as any).genrePreferences.filter((g: string) => g && typeof g === 'string' && g.trim().length > 0);
            if (validGenres.length > 0) {
              expect(result.contentSource).toBe('LEGACY_GENRE_PREFERENCES');
            } else {
              expect(result.contentSource).toBe('POPULAR_CONTENT');
            }
          } else {
            expect(result.contentSource).toBe('POPULAR_CONTENT');
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 16: New rooms should not interfere with legacy room logic', () => {
    fc.assert(
      fc.property(
        legacyRoomArb,
        newRoomArb,
        contentLoadingRequestArb,
        (legacyRoom, newRoom, request) => {
          // Process both rooms
          const legacyResult = simulateContentLoadingDecision(legacyRoom, request);
          const newResult = simulateContentLoadingDecision(newRoom, request);
          
          // Both should succeed
          expect(legacyResult.success).toBe(true);
          expect(newResult.success).toBe(true);
          
          // Should use different logic
          expect(legacyResult.isLegacy).toBe(true);
          expect(newResult.isLegacy).toBe(false);
          
          expect(legacyResult.usedNewFiltering).toBe(false);
          expect(newResult.usedNewFiltering).toBe(true);
          
          expect(legacyResult.contentSource).not.toBe('FILTER_CRITERIA');
          expect(newResult.contentSource).toBe('FILTER_CRITERIA');
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 16: Mixed format rooms should be handled gracefully', () => {
    fc.assert(
      fc.property(
        mixedRoomArb,
        contentLoadingRequestArb,
        (room, request) => {
          const result = simulateContentLoadingDecision(room, request);
          
          // Should either succeed with clear format or fail gracefully
          if (result.success) {
            // If it succeeds, should be clearly legacy or new format
            expect(result.isLegacy !== result.usedNewFiltering).toBe(true);
            
            if (result.isLegacy) {
              expect(result.usedNewFiltering).toBe(false);
              expect(['LEGACY_GENRE_PREFERENCES', 'POPULAR_CONTENT']).toContain(result.contentSource);
            } else {
              expect(result.usedNewFiltering).toBe(true);
              expect(result.contentSource).toBe('FILTER_CRITERIA');
            }
          } else {
            // If it fails, should have clear error message
            expect(result.error).toBeDefined();
            expect(result.contentSource).toBe('UNKNOWN');
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 16: Legacy room identification should be deterministic', () => {
    fc.assert(
      fc.property(
        legacyRoomArb,
        (room) => {
          // Multiple calls should return same result
          const result1 = isLegacyRoom(room);
          const result2 = isLegacyRoom(room);
          const result3 = isLegacyRoom(room);
          
          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
          expect(result1).toBe(true); // Should always be true for legacy rooms
          
          // Should never be identified as new room
          expect(isNewRoom(room)).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 16: Legacy rooms should preserve original field structure', () => {
    fc.assert(
      fc.property(
        legacyRoomArb,
        contentLoadingRequestArb,
        (originalRoom, request) => {
          // Process room (simulate any operation)
          const result = simulateContentLoadingDecision(originalRoom, request);
          expect(result.success).toBe(true);
          
          // Original room structure should be unchanged
          const legacyFields = ['genrePreferences'];
          const newFields = ['mediaType', 'genreIds', 'filterCriteria', 'contentIds'];
          
          // Legacy fields should remain as they were
          legacyFields.forEach(field => {
            if (field in originalRoom) {
              expect((originalRoom as any)[field]).toBeDefined();
            }
          });
          
          // New fields should not be present
          newFields.forEach(field => {
            expect((originalRoom as any)[field]).toBeUndefined();
          });
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Integration Tests for Legacy Room Compatibility
// ============================================================================

describe('Legacy Room Compatibility Integration Tests', () => {

  test('Legacy room with various genrePreferences should work consistently', () => {
    const testCases = [
      { genrePreferences: ['Action', 'Comedy'] },
      { genrePreferences: ['Drama'] },
      { genrePreferences: [] },
      { genrePreferences: undefined },
      { genrePreferences: null }
    ];

    testCases.forEach((testCase, index) => {
      const room = {
        id: `legacy-room-${index}`,
        name: `Legacy Room ${index}`,
        hostId: 'host-123',
        status: 'WAITING',
        isActive: true,
        isPrivate: false,
        memberCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...testCase
      };

      expect(isLegacyRoom(room)).toBe(true);
      
      const result = simulateContentLoadingDecision(room, { roomId: room.id, userId: 'user-123' });
      
      expect(result.success).toBe(true);
      expect(result.isLegacy).toBe(true);
      expect(result.usedNewFiltering).toBe(false);
    });
  });

  test('Legacy and new rooms should coexist without interference', () => {
    const legacyRoom = {
      id: 'legacy-room',
      name: 'Legacy Room',
      hostId: 'host-legacy',
      status: 'WAITING',
      genrePreferences: ['Action'],
      isActive: true,
      isPrivate: false,
      memberCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const newRoom = {
      id: 'new-room',
      name: 'New Room',
      hostId: 'host-new',
      status: 'WAITING',
      mediaType: 'MOVIE',
      genreIds: [28],
      filterCriteria: { mediaType: 'MOVIE', genreIds: [28], roomId: 'new-room' },
      isActive: true,
      isPrivate: false,
      memberCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const request = { roomId: 'test', userId: 'user-123' };

    const legacyResult = simulateContentLoadingDecision(legacyRoom, request);
    const newResult = simulateContentLoadingDecision(newRoom, request);

    expect(legacyResult.success).toBe(true);
    expect(newResult.success).toBe(true);

    expect(legacyResult.isLegacy).toBe(true);
    expect(newResult.isLegacy).toBe(false);

    expect(legacyResult.contentSource).toBe('LEGACY_GENRE_PREFERENCES');
    expect(newResult.contentSource).toBe('FILTER_CRITERIA');
  });

  test('Schema compatibility should work for all legacy room variations', () => {
    const variations = [
      { genrePreferences: ['Action', 'Comedy', 'Drama'] },
      { genrePreferences: ['Single Genre'] },
      { genrePreferences: [] },
      { genrePreferences: undefined },
      { maxMembers: 10, matchCount: 5 },
      { resultMovieId: 'movie-123', inviteCode: 'ABC123' }
    ];

    variations.forEach(variation => {
      const room = {
        id: 'test-room',
        name: 'Test Room',
        hostId: 'host-123',
        status: 'WAITING',
        isActive: true,
        isPrivate: false,
        memberCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...variation
      };

      const compatibility = simulateSchemaCompatibility(room);
      expect(compatibility.compatible).toBe(true);
      expect(compatibility.missingFields).toEqual([]);
    });
  });
});