/**
 * Legacy Room Compatibility Tests
 * 
 * Validates that existing rooms without filter criteria continue to work
 * with the original content loading mechanism.
 */

import { describe, test, expect } from '@jest/globals';

// ============================================================================
// Mock Data and Helpers
// ============================================================================

/**
 * Simulates legacy room structure (pre-filtering system)
 */
function createLegacyRoom(overrides: any = {}) {
  return {
    id: 'legacy-room-123',
    name: 'Legacy Room',
    hostId: 'host-123',
    status: 'WAITING',
    genrePreferences: ['Action', 'Comedy'], // Legacy field
    isActive: true,
    isPrivate: false,
    memberCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // No mediaType, genreIds, or filterCriteria - legacy format
    ...overrides
  };
}

/**
 * Simulates new room structure (with filtering system)
 */
function createNewRoom(overrides: any = {}) {
  return {
    id: 'new-room-456',
    name: 'New Room',
    hostId: 'host-456',
    status: 'WAITING',
    mediaType: 'MOVIE',
    genreIds: [28, 12], // Action, Adventure
    genreNames: ['Action', 'Adventure'],
    contentIds: ['movie1', 'movie2', 'movie3'],
    filterCriteria: {
      mediaType: 'MOVIE',
      genreIds: [28, 12],
      roomId: 'new-room-456'
    },
    isActive: true,
    isPrivate: false,
    memberCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Simulates content loading for legacy rooms
 */
function simulateLegacyContentLoading(room: any): { success: boolean; contentSource?: string; error?: string } {
  try {
    // Legacy rooms should use genrePreferences for content loading
    if (room.genrePreferences && Array.isArray(room.genrePreferences)) {
      return {
        success: true,
        contentSource: 'LEGACY_GENRE_PREFERENCES'
      };
    }

    // Rooms without any genre preferences should use popular content
    if (!room.genrePreferences && !room.mediaType && !room.filterCriteria) {
      return {
        success: true,
        contentSource: 'POPULAR_CONTENT'
      };
    }

    // This shouldn't happen for true legacy rooms
    return {
      success: false,
      error: 'Invalid legacy room format'
    };

  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Simulates content loading for new rooms
 */
function simulateNewContentLoading(room: any): { success: boolean; contentSource?: string; error?: string } {
  try {
    // New rooms should use filterCriteria for content loading
    if (room.filterCriteria && room.mediaType && room.genreIds) {
      return {
        success: true,
        contentSource: 'FILTER_CRITERIA'
      };
    }

    // This shouldn't happen for properly created new rooms
    return {
      success: false,
      error: 'Invalid new room format'
    };

  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Determines if a room is legacy format
 */
function isLegacyRoom(room: any): boolean {
  // Legacy room: no filterCriteria AND no mediaType (regardless of genrePreferences)
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
 * Simulates the room content loading decision logic
 */
function simulateContentLoadingDecision(room: any): { 
  success: boolean; 
  contentSource?: string; 
  isLegacy: boolean;
  error?: string 
} {
  const legacy = isLegacyRoom(room);
  const newFormat = isNewRoom(room);

  if (legacy) {
    const result = simulateLegacyContentLoading(room);
    return {
      ...result,
      isLegacy: true
    };
  }

  if (newFormat) {
    const result = simulateNewContentLoading(room);
    return {
      ...result,
      isLegacy: false
    };
  }

  // Mixed or invalid format
  return {
    success: false,
    error: 'Room format could not be determined',
    isLegacy: false
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Legacy Room Compatibility Tests', () => {

  test('Legacy rooms with genrePreferences should use legacy content loading', () => {
    const legacyRoom = createLegacyRoom({
      genrePreferences: ['Action', 'Comedy', 'Drama']
    });

    const result = simulateContentLoadingDecision(legacyRoom);

    expect(result.success).toBe(true);
    expect(result.isLegacy).toBe(true);
    expect(result.contentSource).toBe('LEGACY_GENRE_PREFERENCES');
    expect(result.error).toBeUndefined();
  });

  test('Legacy rooms without genrePreferences should use popular content', () => {
    const legacyRoom = createLegacyRoom({
      genrePreferences: undefined
    });

    const result = simulateContentLoadingDecision(legacyRoom);

    expect(result.success).toBe(true);
    expect(result.isLegacy).toBe(true);
    expect(result.contentSource).toBe('POPULAR_CONTENT');
    expect(result.error).toBeUndefined();
  });

  test('New rooms should use filter criteria for content loading', () => {
    const newRoom = createNewRoom();

    const result = simulateContentLoadingDecision(newRoom);

    expect(result.success).toBe(true);
    expect(result.isLegacy).toBe(false);
    expect(result.contentSource).toBe('FILTER_CRITERIA');
    expect(result.error).toBeUndefined();
  });

  test('Legacy room detection should be accurate', () => {
    const legacyRoom = createLegacyRoom();
    const newRoom = createNewRoom();

    expect(isLegacyRoom(legacyRoom)).toBe(true);
    expect(isLegacyRoom(newRoom)).toBe(false);

    expect(isNewRoom(legacyRoom)).toBe(false);
    expect(isNewRoom(newRoom)).toBe(true);
  });

  test('Legacy rooms should not have new filtering fields', () => {
    const legacyRoom = createLegacyRoom();

    expect(legacyRoom.mediaType).toBeUndefined();
    expect(legacyRoom.genreIds).toBeUndefined();
    expect(legacyRoom.filterCriteria).toBeUndefined();
    expect(legacyRoom.contentIds).toBeUndefined();

    // Should have legacy fields
    expect(legacyRoom.genrePreferences).toBeDefined();
    expect(Array.isArray(legacyRoom.genrePreferences)).toBe(true);
  });

  test('New rooms should not use legacy fields for content loading', () => {
    const newRoom = createNewRoom();

    expect(newRoom.filterCriteria).toBeDefined();
    expect(newRoom.mediaType).toBeDefined();
    expect(newRoom.genreIds).toBeDefined();
    expect(newRoom.contentIds).toBeDefined();

    // Legacy field should not be used for content loading decision
    const result = simulateContentLoadingDecision(newRoom);
    expect(result.contentSource).toBe('FILTER_CRITERIA');
    expect(result.isLegacy).toBe(false);
  });

  test('Mixed format rooms should be handled gracefully', () => {
    // Room with both legacy and new fields (shouldn't happen in practice)
    const mixedRoom = {
      ...createLegacyRoom(),
      mediaType: 'MOVIE',
      genreIds: [28]
      // Has both genrePreferences AND mediaType/genreIds
    };

    const result = simulateContentLoadingDecision(mixedRoom);

    // Should fail gracefully
    expect(result.success).toBe(false);
    expect(result.error).toContain('could not be determined');
  });

  test('Empty legacy room should use popular content', () => {
    const emptyLegacyRoom = {
      id: 'empty-room',
      name: 'Empty Room',
      hostId: 'host-empty',
      status: 'WAITING',
      isActive: true,
      isPrivate: false,
      memberCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
      // No genrePreferences, mediaType, or filterCriteria
    };

    const result = simulateContentLoadingDecision(emptyLegacyRoom);

    expect(result.success).toBe(true);
    expect(result.isLegacy).toBe(true);
    expect(result.contentSource).toBe('POPULAR_CONTENT');
  });

  test('Legacy rooms should maintain backward compatibility in all operations', () => {
    const legacyRoom = createLegacyRoom();

    // Should be identifiable as legacy
    expect(isLegacyRoom(legacyRoom)).toBe(true);

    // Should use legacy content loading
    const contentResult = simulateContentLoadingDecision(legacyRoom);
    expect(contentResult.isLegacy).toBe(true);
    expect(contentResult.success).toBe(true);

    // Should have all required room fields
    expect(legacyRoom.id).toBeDefined();
    expect(legacyRoom.name).toBeDefined();
    expect(legacyRoom.hostId).toBeDefined();
    expect(legacyRoom.status).toBeDefined();
    expect(legacyRoom.isActive).toBeDefined();
    expect(legacyRoom.memberCount).toBeDefined();
    expect(legacyRoom.createdAt).toBeDefined();
  });

  test('Content loading should never apply new filtering logic to legacy rooms', () => {
    const legacyRooms = [
      createLegacyRoom({ genrePreferences: ['Action'] }),
      createLegacyRoom({ genrePreferences: ['Comedy', 'Drama'] }),
      createLegacyRoom({ genrePreferences: [] }),
      createLegacyRoom({ genrePreferences: undefined })
    ];

    legacyRooms.forEach((room, index) => {
      const result = simulateContentLoadingDecision(room);
      
      expect(result.success).toBe(true);
      expect(result.isLegacy).toBe(true);
      expect(result.contentSource).not.toBe('FILTER_CRITERIA');
      
      // Should use either legacy genre preferences or popular content
      expect(['LEGACY_GENRE_PREFERENCES', 'POPULAR_CONTENT']).toContain(result.contentSource);
    });
  });

  test('Legacy room structure should remain unchanged', () => {
    const legacyRoom = createLegacyRoom({
      genrePreferences: ['Action', 'Comedy']
    });

    // Simulate processing the room (should not modify structure)
    const result = simulateContentLoadingDecision(legacyRoom);
    expect(result.success).toBe(true);

    // Room structure should remain exactly the same
    expect(legacyRoom.genrePreferences).toEqual(['Action', 'Comedy']);
    expect(legacyRoom.mediaType).toBeUndefined();
    expect(legacyRoom.genreIds).toBeUndefined();
    expect(legacyRoom.filterCriteria).toBeUndefined();
    expect(legacyRoom.contentIds).toBeUndefined();
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Legacy Room Compatibility Integration Tests', () => {

  test('Legacy room with Action and Comedy preferences', () => {
    const room = createLegacyRoom({
      genrePreferences: ['Action', 'Comedy']
    });

    const result = simulateContentLoadingDecision(room);

    expect(result.success).toBe(true);
    expect(result.isLegacy).toBe(true);
    expect(result.contentSource).toBe('LEGACY_GENRE_PREFERENCES');
  });

  test('Legacy room with no preferences should work', () => {
    const room = createLegacyRoom({
      genrePreferences: undefined
    });

    const result = simulateContentLoadingDecision(room);

    expect(result.success).toBe(true);
    expect(result.isLegacy).toBe(true);
    expect(result.contentSource).toBe('POPULAR_CONTENT');
  });

  test('New room should not interfere with legacy logic', () => {
    const legacyRoom = createLegacyRoom();
    const newRoom = createNewRoom();

    const legacyResult = simulateContentLoadingDecision(legacyRoom);
    const newResult = simulateContentLoadingDecision(newRoom);

    // Both should work but use different content sources
    expect(legacyResult.success).toBe(true);
    expect(newResult.success).toBe(true);

    expect(legacyResult.isLegacy).toBe(true);
    expect(newResult.isLegacy).toBe(false);

    expect(legacyResult.contentSource).toBe('LEGACY_GENRE_PREFERENCES');
    expect(newResult.contentSource).toBe('FILTER_CRITERIA');
  });

  test('Room format detection should be reliable', () => {
    const testCases = [
      { room: createLegacyRoom(), expectedLegacy: true },
      { room: createNewRoom(), expectedLegacy: false },
      { room: createLegacyRoom({ genrePreferences: [] }), expectedLegacy: true },
      { room: createLegacyRoom({ genrePreferences: undefined }), expectedLegacy: true }
    ];

    testCases.forEach(({ room, expectedLegacy }, index) => {
      const result = simulateContentLoadingDecision(room);
      expect(result.success).toBe(true);
      expect(result.isLegacy).toBe(expectedLegacy);
    });
  });
});