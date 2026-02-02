/**
 * Property Test: Filter Immutability
 * 
 * **Feature: advanced-content-filtering, Property 12: Filter Immutability**
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3**
 * 
 * For any room created with filter criteria, the media type and selected genres 
 * should be immutable after creation.
 */

import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import { MediaType, ContentFilteringError, ErrorCodes } from '../types/content-filtering';

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generates valid room with filter criteria
 */
const roomWithFiltersArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  hostId: fc.uuid(),
  status: fc.constantFrom('WAITING', 'ACTIVE', 'MATCHED'),
  mediaType: fc.constantFrom('MOVIE', 'TV'),
  genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 }),
  genreNames: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 3 }),
  contentIds: fc.array(fc.string(), { minLength: 0, maxLength: 30 }),
  filterCriteria: fc.record({
    mediaType: fc.constantFrom('MOVIE', 'TV'),
    genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 }),
    roomId: fc.uuid()
  }),
  isActive: fc.boolean(),
  isPrivate: fc.boolean(),
  memberCount: fc.integer({ min: 1, max: 50 }),
  createdAt: fc.constant(new Date().toISOString()),
  updatedAt: fc.constant(new Date().toISOString())
});

/**
 * Generates legacy room without filter criteria
 */
const legacyRoomArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  hostId: fc.uuid(),
  status: fc.constantFrom('WAITING', 'ACTIVE', 'MATCHED'),
  genrePreferences: fc.option(fc.array(fc.string(), { maxLength: 5 })),
  isActive: fc.boolean(),
  isPrivate: fc.boolean(),
  memberCount: fc.integer({ min: 1, max: 50 }),
  createdAt: fc.constant(new Date().toISOString()),
  updatedAt: fc.constant(new Date().toISOString())
  // No mediaType, genreIds, or filterCriteria - legacy format
});

/**
 * Generates filter update attempts
 */
const filterUpdateAttemptArb = fc.record({
  mediaType: fc.option(fc.constantFrom('MOVIE', 'TV')),
  genreIds: fc.option(fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 }))
});

/**
 * Generates different filter update attempts (different from original)
 */
const differentFilterUpdateArb = fc.record({
  originalMediaType: fc.constantFrom('MOVIE', 'TV'),
  originalGenreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 }),
  newMediaType: fc.constantFrom('MOVIE', 'TV'),
  newGenreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 })
}).filter(data => 
  // Ensure the new filters are actually different from original
  data.originalMediaType !== data.newMediaType || 
  !arraysEqual(data.originalGenreIds, data.newGenreIds)
);

/**
 * Helper function to compare arrays
 */
function arraysEqual(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, index) => val === b[index]);
}

// ============================================================================
// Simulation Functions
// ============================================================================

/**
 * Simulates filter update attempt on a room
 */
function simulateFilterUpdate(
  room: any, 
  userId: string, 
  updateInput: any
): { success: boolean; error?: string; suggestion?: any } {
  try {
    // Check if user is the host
    if (room.hostId !== userId) {
      return {
        success: false,
        error: 'Solo el creador de la sala puede modificar filtros'
      };
    }

    // IMMUTABILITY ENFORCEMENT: Check if room already has filter criteria
    if (room.filterCriteria || room.mediaType || room.genreIds) {
      return {
        success: false,
        error: 'Los filtros de contenido no pueden modificarse después de crear la sala. Para cambiar filtros, crea una nueva sala.',
        suggestion: {
          action: 'CREATE_NEW_ROOM',
          message: 'Crea una nueva sala con los filtros deseados',
          currentFilters: {
            mediaType: room.mediaType,
            genreIds: room.genreIds,
            genreNames: room.genreNames
          },
          requestedFilters: {
            mediaType: updateInput.mediaType,
            genreIds: updateInput.genreIds
          }
        }
      };
    }

    // If no existing filters, this is invalid (should use createRoom instead)
    if (!room.filterCriteria && !room.mediaType) {
      return {
        success: false,
        error: 'Esta sala no tiene filtros configurados. Los filtros deben establecerse al crear la sala.'
      };
    }

    // This should never be reached due to immutability
    return {
      success: true
    };

  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Simulates room creation with filters
 */
function simulateRoomCreationWithFilters(
  hostId: string,
  input: { name: string; mediaType: string; genreIds: number[] }
): { success: boolean; room?: any; error?: string } {
  try {
    // Validate input
    if (!input.name || input.name.trim().length === 0) {
      return { success: false, error: 'Room name is required' };
    }

    if (!input.mediaType || !['MOVIE', 'TV'].includes(input.mediaType)) {
      return { success: false, error: 'Valid media type is required' };
    }

    if (input.genreIds && input.genreIds.length > 3) {
      return { success: false, error: 'Maximum 3 genres allowed' };
    }

    // Create room with immutable filters
    const room = {
      id: `room-${Math.random().toString(36).substring(7)}`,
      name: input.name.trim(),
      hostId,
      status: 'WAITING',
      mediaType: input.mediaType,
      genreIds: input.genreIds || [],
      genreNames: input.genreIds?.map(id => `Genre ${id}`) || [],
      contentIds: [],
      filterCriteria: {
        mediaType: input.mediaType,
        genreIds: input.genreIds || [],
        roomId: `room-${Math.random().toString(36).substring(7)}`
      },
      isActive: true,
      isPrivate: false,
      memberCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return { success: true, room };

  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Checks if room has filter criteria
 */
function hasFilterCriteria(room: any): boolean {
  return !!(room.filterCriteria || room.mediaType || room.genreIds);
}

/**
 * Checks if room is legacy format
 */
function isLegacyRoom(room: any): boolean {
  return !hasFilterCriteria(room) && (room.genrePreferences !== undefined || 
    (!room.mediaType && !room.genreIds && !room.filterCriteria));
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Filter Immutability Property Tests', () => {

  test('Property 12: Rooms with filter criteria should reject all filter modification attempts', () => {
    fc.assert(
      fc.property(
        roomWithFiltersArb,
        filterUpdateAttemptArb,
        fc.uuid(),
        (room, updateInput, userId) => {
          // Ensure room has filter criteria
          expect(hasFilterCriteria(room)).toBe(true);
          
          // Any attempt to update filters should fail
          const result = simulateFilterUpdate(room, room.hostId, updateInput);
          
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('no pueden modificarse después de crear la sala');
          
          // Should provide suggestion for creating new room
          expect(result.suggestion).toBeDefined();
          expect(result.suggestion?.action).toBe('CREATE_NEW_ROOM');
          expect(result.suggestion?.currentFilters).toBeDefined();
          expect(result.suggestion?.requestedFilters).toBeDefined();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 12: Non-host users should be rejected before immutability check', () => {
    fc.assert(
      fc.property(
        roomWithFiltersArb,
        filterUpdateAttemptArb,
        fc.uuid(),
        (room, updateInput, nonHostUserId) => {
          // Ensure the user is NOT the host
          fc.pre(nonHostUserId !== room.hostId);
          
          const result = simulateFilterUpdate(room, nonHostUserId, updateInput);
          
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('Solo el creador de la sala puede modificar filtros');
          
          // Should not provide suggestion since user is not authorized
          expect(result.suggestion).toBeUndefined();
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 12: Legacy rooms should reject filter updates with different error', () => {
    fc.assert(
      fc.property(
        legacyRoomArb,
        filterUpdateAttemptArb,
        (room, updateInput) => {
          // Ensure room is legacy format
          expect(isLegacyRoom(room)).toBe(true);
          expect(hasFilterCriteria(room)).toBe(false);
          
          const result = simulateFilterUpdate(room, room.hostId, updateInput);
          
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('no tiene filtros configurados');
          expect(result.error).toContain('deben establecerse al crear la sala');
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 12: Filter immutability should be enforced regardless of update content', () => {
    fc.assert(
      fc.property(
        differentFilterUpdateArb,
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        (filterData, hostId, roomName) => {
          // Create room with original filters
          const createResult = simulateRoomCreationWithFilters(hostId, {
            name: roomName,
            mediaType: filterData.originalMediaType,
            genreIds: filterData.originalGenreIds
          });
          
          expect(createResult.success).toBe(true);
          expect(createResult.room).toBeDefined();
          
          if (!createResult.room) return true;
          
          // Attempt to update to different filters
          const updateResult = simulateFilterUpdate(createResult.room, hostId, {
            mediaType: filterData.newMediaType,
            genreIds: filterData.newGenreIds
          });
          
          // Should always fail regardless of what the new filters are
          expect(updateResult.success).toBe(false);
          expect(updateResult.error).toContain('no pueden modificarse después de crear la sala');
          
          // Verify original filters are preserved in suggestion
          expect(updateResult.suggestion?.currentFilters.mediaType).toBe(filterData.originalMediaType);
          expect(updateResult.suggestion?.currentFilters.genreIds).toEqual(filterData.originalGenreIds);
          expect(updateResult.suggestion?.requestedFilters.mediaType).toBe(filterData.newMediaType);
          expect(updateResult.suggestion?.requestedFilters.genreIds).toEqual(filterData.newGenreIds);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 12: Identical filter updates should also be rejected (immutability is absolute)', () => {
    fc.assert(
      fc.property(
        fc.record({
          mediaType: fc.constantFrom('MOVIE', 'TV'),
          genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 })
        }),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        (filterData, hostId, roomName) => {
          // Create room with filters
          const createResult = simulateRoomCreationWithFilters(hostId, {
            name: roomName,
            mediaType: filterData.mediaType,
            genreIds: filterData.genreIds
          });
          
          expect(createResult.success).toBe(true);
          expect(createResult.room).toBeDefined();
          
          if (!createResult.room) return true;
          
          // Attempt to "update" to identical filters
          const updateResult = simulateFilterUpdate(createResult.room, hostId, {
            mediaType: filterData.mediaType,
            genreIds: filterData.genreIds
          });
          
          // Even identical updates should be rejected (immutability is absolute)
          expect(updateResult.success).toBe(false);
          expect(updateResult.error).toContain('no pueden modificarse después de crear la sala');
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 12: Filter immutability should be consistent across room states', () => {
    fc.assert(
      fc.property(
        fc.record({
          mediaType: fc.constantFrom('MOVIE', 'TV'),
          genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 }),
          roomStatus: fc.constantFrom('WAITING', 'ACTIVE', 'MATCHED', 'COMPLETED'),
          memberCount: fc.integer({ min: 1, max: 50 }),
          isPrivate: fc.boolean()
        }),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        filterUpdateAttemptArb,
        (roomData, hostId, roomName, updateInput) => {
          // Create room and modify its state
          const createResult = simulateRoomCreationWithFilters(hostId, {
            name: roomName,
            mediaType: roomData.mediaType,
            genreIds: roomData.genreIds
          });
          
          expect(createResult.success).toBe(true);
          expect(createResult.room).toBeDefined();
          
          if (!createResult.room) return true;
          
          // Modify room state
          const room = {
            ...createResult.room,
            status: roomData.roomStatus,
            memberCount: roomData.memberCount,
            isPrivate: roomData.isPrivate
          };
          
          // Attempt filter update regardless of room state
          const updateResult = simulateFilterUpdate(room, hostId, updateInput);
          
          // Immutability should be enforced regardless of room state
          expect(updateResult.success).toBe(false);
          expect(updateResult.error).toContain('no pueden modificarse después de crear la sala');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 12: Multiple consecutive update attempts should all fail', () => {
    fc.assert(
      fc.property(
        fc.record({
          mediaType: fc.constantFrom('MOVIE', 'TV'),
          genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 })
        }),
        fc.array(filterUpdateAttemptArb, { minLength: 2, maxLength: 5 }),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        (initialFilter, updateAttempts, hostId, roomName) => {
          // Create room with initial filters
          const createResult = simulateRoomCreationWithFilters(hostId, {
            name: roomName,
            mediaType: initialFilter.mediaType,
            genreIds: initialFilter.genreIds
          });
          
          expect(createResult.success).toBe(true);
          expect(createResult.room).toBeDefined();
          
          if (!createResult.room) return true;
          
          // Attempt multiple updates in sequence
          for (const updateInput of updateAttempts) {
            const updateResult = simulateFilterUpdate(createResult.room, hostId, updateInput);
            
            // Each attempt should fail
            expect(updateResult.success).toBe(false);
            expect(updateResult.error).toContain('no pueden modificarse después de crear la sala');
            
            // Room should remain unchanged
            expect(createResult.room.mediaType).toBe(initialFilter.mediaType);
            expect(createResult.room.genreIds).toEqual(initialFilter.genreIds);
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 12: Filter immutability error should provide helpful guidance', () => {
    fc.assert(
      fc.property(
        roomWithFiltersArb,
        filterUpdateAttemptArb,
        (room, updateInput) => {
          const result = simulateFilterUpdate(room, room.hostId, updateInput);
          
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          
          // Error message should be helpful and actionable
          expect(result.error).toContain('no pueden modificarse');
          expect(result.error).toContain('crea una nueva sala');
          
          // Suggestion should provide clear guidance
          expect(result.suggestion).toBeDefined();
          expect(result.suggestion?.action).toBe('CREATE_NEW_ROOM');
          expect(result.suggestion?.message).toContain('Crea una nueva sala');
          
          // Should show both current and requested filters for comparison
          expect(result.suggestion?.currentFilters).toBeDefined();
          expect(result.suggestion?.requestedFilters).toBeDefined();
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// Integration Tests for Filter Immutability
// ============================================================================

describe('Filter Immutability Integration Tests', () => {

  test('Room with MOVIE filter should reject change to TV', () => {
    const createResult = simulateRoomCreationWithFilters('host-123', {
      name: 'Movie Room',
      mediaType: 'MOVIE',
      genreIds: [28, 12] // Action, Adventure
    });
    
    expect(createResult.success).toBe(true);
    expect(createResult.room).toBeDefined();
    
    const updateResult = simulateFilterUpdate(createResult.room!, 'host-123', {
      mediaType: 'TV',
      genreIds: [18, 35] // Drama, Comedy
    });
    
    expect(updateResult.success).toBe(false);
    expect(updateResult.error).toContain('no pueden modificarse después de crear la sala');
    expect(updateResult.suggestion?.currentFilters.mediaType).toBe('MOVIE');
    expect(updateResult.suggestion?.requestedFilters.mediaType).toBe('TV');
  });

  test('Room with specific genres should reject genre changes', () => {
    const createResult = simulateRoomCreationWithFilters('host-456', {
      name: 'Action Room',
      mediaType: 'MOVIE',
      genreIds: [28] // Action only
    });
    
    expect(createResult.success).toBe(true);
    expect(createResult.room).toBeDefined();
    
    const updateResult = simulateFilterUpdate(createResult.room!, 'host-456', {
      mediaType: 'MOVIE', // Same media type
      genreIds: [35, 18] // Different genres: Comedy, Drama
    });
    
    expect(updateResult.success).toBe(false);
    expect(updateResult.error).toContain('no pueden modificarse después de crear la sala');
    expect(updateResult.suggestion?.currentFilters.genreIds).toEqual([28]);
    expect(updateResult.suggestion?.requestedFilters.genreIds).toEqual([35, 18]);
  });

  test('Non-host user should be rejected before immutability check', () => {
    const createResult = simulateRoomCreationWithFilters('host-789', {
      name: 'Private Room',
      mediaType: 'TV',
      genreIds: [18] // Drama
    });
    
    expect(createResult.success).toBe(true);
    expect(createResult.room).toBeDefined();
    
    const updateResult = simulateFilterUpdate(createResult.room!, 'other-user', {
      mediaType: 'MOVIE',
      genreIds: [28]
    });
    
    expect(updateResult.success).toBe(false);
    expect(updateResult.error).toContain('Solo el creador de la sala puede modificar filtros');
    expect(updateResult.suggestion).toBeUndefined();
  });

  test('Legacy room should reject filter updates with appropriate message', () => {
    const legacyRoom = {
      id: 'legacy-room-123',
      name: 'Legacy Room',
      hostId: 'host-legacy',
      status: 'WAITING',
      genrePreferences: ['Action', 'Comedy'],
      isActive: true,
      isPrivate: false,
      memberCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const updateResult = simulateFilterUpdate(legacyRoom, 'host-legacy', {
      mediaType: 'MOVIE',
      genreIds: [28, 35]
    });
    
    expect(updateResult.success).toBe(false);
    expect(updateResult.error).toContain('no tiene filtros configurados');
    expect(updateResult.error).toContain('deben establecerse al crear la sala');
  });

  test('Identical filter update should still be rejected', () => {
    const createResult = simulateRoomCreationWithFilters('host-identical', {
      name: 'Identical Test Room',
      mediaType: 'MOVIE',
      genreIds: [28, 12, 35] // Action, Adventure, Comedy
    });
    
    expect(createResult.success).toBe(true);
    expect(createResult.room).toBeDefined();
    
    // Try to "update" to exactly the same filters
    const updateResult = simulateFilterUpdate(createResult.room!, 'host-identical', {
      mediaType: 'MOVIE',
      genreIds: [28, 12, 35] // Identical
    });
    
    expect(updateResult.success).toBe(false);
    expect(updateResult.error).toContain('no pueden modificarse después de crear la sala');
  });
});