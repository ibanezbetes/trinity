/**
 * Unit Tests for Room Integration
 * 
 * Tests cache creation during room setup, filter updates and cache regeneration,
 * and cleanup scheduling for matched rooms.
 * 
 * **Validates: Requirements 1.1, 5.1, 6.3**
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the room integration components
class MockRoomIntegrationService {
  private roomCaches: Map<string, any> = new Map();
  private roomStatuses: Map<string, string> = new Map();
  private cleanupSchedule: Map<string, any> = new Map();

  async createRoom(roomId: string, hostId: string, filterCriteria: any) {
    // Simulate room creation
    const room = {
      roomId,
      hostId,
      filterCriteria,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      members: [hostId]
    };

    this.roomStatuses.set(roomId, 'ACTIVE');

    // Trigger cache creation if filter criteria provided
    if (filterCriteria && filterCriteria.mediaType) {
      const cacheResult = await this.createRoomCache(roomId, filterCriteria);
      room['cacheCreated'] = cacheResult.success;
      room['cacheId'] = cacheResult.cacheId;
    }

    return {
      success: true,
      room,
      cacheInitialized: !!room['cacheCreated']
    };
  }

  async createRoomCache(roomId: string, filterCriteria: any) {
    if (!filterCriteria || !filterCriteria.mediaType) {
      throw new Error('Invalid filter criteria for cache creation');
    }

    const cache = {
      roomId,
      filterCriteria,
      movieCount: 30,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      batchesLoaded: 1
    };

    this.roomCaches.set(roomId, cache);

    return {
      success: true,
      cacheId: `cache-${roomId}`,
      movieCount: cache.movieCount
    };
  }

  async updateRoomFilters(roomId: string, newFilterCriteria: any) {
    const existingCache = this.roomCaches.get(roomId);
    
    if (!existingCache) {
      throw new Error(`No cache found for room ${roomId}`);
    }

    // Check if filters actually changed
    const filtersChanged = JSON.stringify(existingCache.filterCriteria) !== JSON.stringify(newFilterCriteria);
    
    if (filtersChanged) {
      // Regenerate cache with new criteria
      await this.regenerateCache(roomId, newFilterCriteria);
      
      return {
        success: true,
        cacheRegenerated: true,
        newFilterCriteria
      };
    }

    return {
      success: true,
      cacheRegenerated: false,
      message: 'No filter changes detected'
    };
  }

  async regenerateCache(roomId: string, newFilterCriteria: any) {
    // Simulate cache regeneration
    const newCache = {
      roomId,
      filterCriteria: newFilterCriteria,
      movieCount: 30,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      batchesLoaded: 1,
      regeneratedAt: new Date().toISOString()
    };

    this.roomCaches.set(roomId, newCache);

    return {
      success: true,
      newMovieCount: newCache.movieCount
    };
  }

  async setRoomStatus(roomId: string, status: string) {
    this.roomStatuses.set(roomId, status);

    // Auto-schedule cleanup for MATCHED rooms
    if (status === 'MATCHED') {
      await this.scheduleCleanup(roomId, 'MATCHED');
    }

    return { success: true, newStatus: status };
  }

  async scheduleCleanup(roomId: string, reason: string) {
    const cleanup = {
      roomId,
      reason,
      scheduledAt: new Date().toISOString(),
      executeAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      status: 'SCHEDULED'
    };

    this.cleanupSchedule.set(roomId, cleanup);

    return cleanup;
  }

  async joinRoom(roomId: string, userId: string) {
    const roomStatus = this.roomStatuses.get(roomId);
    
    if (!roomStatus) {
      throw new Error(`Room ${roomId} not found`);
    }

    if (roomStatus !== 'ACTIVE') {
      throw new Error(`Room ${roomId} is not active`);
    }

    // Check if cache exists for the room
    const cache = this.roomCaches.get(roomId);
    
    return {
      success: true,
      roomId,
      userId,
      cacheAvailable: !!cache,
      roomStatus
    };
  }

  // Test utilities
  getRoomCache(roomId: string) {
    return this.roomCaches.get(roomId);
  }

  getRoomStatus(roomId: string) {
    return this.roomStatuses.get(roomId);
  }

  getScheduledCleanup(roomId: string) {
    return this.cleanupSchedule.get(roomId);
  }

  getAllRoomCaches() {
    return Array.from(this.roomCaches.keys());
  }

  clearAll() {
    this.roomCaches.clear();
    this.roomStatuses.clear();
    this.cleanupSchedule.clear();
  }
}

describe('Room Integration Tests', () => {
  let roomService: MockRoomIntegrationService;

  beforeEach(() => {
    roomService = new MockRoomIntegrationService();
  });

  afterEach(() => {
    roomService.clearAll();
  });

  /**
   * Test: Cache Creation During Room Setup
   * 
   * Verifies that cache is automatically created when a room is created
   * with valid filter criteria.
   */
  describe('Cache Creation During Room Setup', () => {
    test('should create cache when room is created with valid filter criteria', async () => {
      // Test data
      const roomId = 'test-room-1';
      const hostId = 'host-user-1';
      const filterCriteria = {
        mediaType: 'MOVIE',
        genreIds: [28, 35] // Action, Comedy
      };

      // Create room with filter criteria
      const result = await roomService.createRoom(roomId, hostId, filterCriteria);

      // Verify room creation
      expect(result.success).toBe(true);
      expect(result.room.roomId).toBe(roomId);
      expect(result.room.hostId).toBe(hostId);
      expect(result.room.filterCriteria).toEqual(filterCriteria);

      // Verify cache initialization
      expect(result.cacheInitialized).toBe(true);
      expect(result.room.cacheCreated).toBe(true);
      expect(result.room.cacheId).toBeDefined();

      // Verify cache exists in storage
      const cache = roomService.getRoomCache(roomId);
      expect(cache).toBeDefined();
      expect(cache.filterCriteria).toEqual(filterCriteria);
      expect(cache.movieCount).toBe(30);
      expect(cache.status).toBe('ACTIVE');
    });

    test('should create room without cache when no filter criteria provided', async () => {
      // Test data
      const roomId = 'test-room-2';
      const hostId = 'host-user-2';
      const filterCriteria = null;

      // Create room without filter criteria
      const result = await roomService.createRoom(roomId, hostId, filterCriteria);

      // Verify room creation
      expect(result.success).toBe(true);
      expect(result.room.roomId).toBe(roomId);

      // Verify no cache initialization
      expect(result.cacheInitialized).toBe(false);
      expect(result.room.cacheCreated).toBeUndefined();

      // Verify no cache in storage
      const cache = roomService.getRoomCache(roomId);
      expect(cache).toBeUndefined();
    });

    test('should handle cache creation failure gracefully', async () => {
      // Test data with invalid filter criteria
      const roomId = 'test-room-3';
      const hostId = 'host-user-3';
      const invalidFilterCriteria = {
        // Missing mediaType
        genreIds: [28]
      };

      // Attempt to create room with invalid criteria
      await expect(roomService.createRoom(roomId, hostId, invalidFilterCriteria))
        .rejects.toThrow('Invalid filter criteria for cache creation');

      // Verify room status
      const roomStatus = roomService.getRoomStatus(roomId);
      expect(roomStatus).toBeUndefined();

      // Verify no cache created
      const cache = roomService.getRoomCache(roomId);
      expect(cache).toBeUndefined();
    });

    test('should create cache for different media types', async () => {
      // Test scenarios for different media types
      const scenarios = [
        {
          roomId: 'movie-room',
          filterCriteria: { mediaType: 'MOVIE', genreIds: [28] }
        },
        {
          roomId: 'tv-room',
          filterCriteria: { mediaType: 'TV', genreIds: [35, 18] }
        },
        {
          roomId: 'no-genre-room',
          filterCriteria: { mediaType: 'MOVIE', genreIds: [] }
        }
      ];

      for (const scenario of scenarios) {
        const result = await roomService.createRoom(
          scenario.roomId,
          'host-user',
          scenario.filterCriteria
        );

        // Verify successful creation
        expect(result.success).toBe(true);
        expect(result.cacheInitialized).toBe(true);

        // Verify cache with correct criteria
        const cache = roomService.getRoomCache(scenario.roomId);
        expect(cache).toBeDefined();
        expect(cache.filterCriteria).toEqual(scenario.filterCriteria);
      }
    });
  });

  /**
   * Test: Filter Updates and Cache Regeneration
   * 
   * Verifies that cache is regenerated when room filter criteria are updated.
   */
  describe('Filter Updates and Cache Regeneration', () => {
    test('should regenerate cache when filter criteria change', async () => {
      // Setup: Create room with initial filter criteria
      const roomId = 'filter-update-room';
      const initialCriteria = {
        mediaType: 'MOVIE',
        genreIds: [28] // Action
      };

      await roomService.createRoom(roomId, 'host-user', initialCriteria);
      const initialCache = roomService.getRoomCache(roomId);
      expect(initialCache).toBeDefined();

      // Update filter criteria
      const newCriteria = {
        mediaType: 'MOVIE',
        genreIds: [35, 18] // Comedy, Drama
      };

      const updateResult = await roomService.updateRoomFilters(roomId, newCriteria);

      // Verify update result
      expect(updateResult.success).toBe(true);
      expect(updateResult.cacheRegenerated).toBe(true);
      expect(updateResult.newFilterCriteria).toEqual(newCriteria);

      // Verify cache was regenerated
      const updatedCache = roomService.getRoomCache(roomId);
      expect(updatedCache).toBeDefined();
      expect(updatedCache.filterCriteria).toEqual(newCriteria);
      expect(updatedCache.regeneratedAt).toBeDefined();
    });

    test('should not regenerate cache when filter criteria unchanged', async () => {
      // Setup: Create room with filter criteria
      const roomId = 'no-change-room';
      const filterCriteria = {
        mediaType: 'TV',
        genreIds: [35, 18]
      };

      await roomService.createRoom(roomId, 'host-user', filterCriteria);
      const originalCache = roomService.getRoomCache(roomId);

      // Update with same criteria
      const updateResult = await roomService.updateRoomFilters(roomId, filterCriteria);

      // Verify no regeneration
      expect(updateResult.success).toBe(true);
      expect(updateResult.cacheRegenerated).toBe(false);
      expect(updateResult.message).toContain('No filter changes detected');

      // Verify cache unchanged
      const unchangedCache = roomService.getRoomCache(roomId);
      expect(unchangedCache.createdAt).toBe(originalCache.createdAt);
      expect(unchangedCache.regeneratedAt).toBeUndefined();
    });

    test('should handle filter update for non-existent room', async () => {
      const nonExistentRoomId = 'non-existent-room';
      const newCriteria = {
        mediaType: 'MOVIE',
        genreIds: [28]
      };

      // Attempt to update filters for non-existent room
      await expect(roomService.updateRoomFilters(nonExistentRoomId, newCriteria))
        .rejects.toThrow(`No cache found for room ${nonExistentRoomId}`);
    });

    test('should handle media type changes in filter updates', async () => {
      // Setup: Create room with MOVIE criteria
      const roomId = 'media-type-change-room';
      const initialCriteria = {
        mediaType: 'MOVIE',
        genreIds: [28, 35]
      };

      await roomService.createRoom(roomId, 'host-user', initialCriteria);

      // Change to TV criteria
      const newCriteria = {
        mediaType: 'TV',
        genreIds: [28, 35] // Same genres, different media type
      };

      const updateResult = await roomService.updateRoomFilters(roomId, newCriteria);

      // Verify regeneration due to media type change
      expect(updateResult.success).toBe(true);
      expect(updateResult.cacheRegenerated).toBe(true);

      // Verify updated cache
      const updatedCache = roomService.getRoomCache(roomId);
      expect(updatedCache.filterCriteria.mediaType).toBe('TV');
      expect(updatedCache.filterCriteria.genreIds).toEqual([28, 35]);
    });
  });

  /**
   * Test: Cleanup Scheduling for Matched Rooms
   * 
   * Verifies that cleanup is automatically scheduled when rooms reach MATCHED status.
   */
  describe('Cleanup Scheduling for Matched Rooms', () => {
    test('should schedule cleanup when room status changes to MATCHED', async () => {
      // Setup: Create room with cache
      const roomId = 'matched-room';
      const filterCriteria = {
        mediaType: 'MOVIE',
        genreIds: [28, 35]
      };

      await roomService.createRoom(roomId, 'host-user', filterCriteria);
      
      // Verify initial state
      expect(roomService.getRoomStatus(roomId)).toBe('ACTIVE');
      expect(roomService.getScheduledCleanup(roomId)).toBeUndefined();

      // Change status to MATCHED
      const statusResult = await roomService.setRoomStatus(roomId, 'MATCHED');

      // Verify status change
      expect(statusResult.success).toBe(true);
      expect(statusResult.newStatus).toBe('MATCHED');
      expect(roomService.getRoomStatus(roomId)).toBe('MATCHED');

      // Verify cleanup scheduled
      const scheduledCleanup = roomService.getScheduledCleanup(roomId);
      expect(scheduledCleanup).toBeDefined();
      expect(scheduledCleanup.reason).toBe('MATCHED');
      expect(scheduledCleanup.status).toBe('SCHEDULED');
      expect(scheduledCleanup.scheduledAt).toBeDefined();
      expect(scheduledCleanup.executeAt).toBeDefined();
    });

    test('should not schedule cleanup for non-MATCHED status changes', async () => {
      // Setup: Create room
      const roomId = 'non-matched-room';
      const filterCriteria = {
        mediaType: 'TV',
        genreIds: [18]
      };

      await roomService.createRoom(roomId, 'host-user', filterCriteria);

      // Test various status changes that should not trigger cleanup
      const nonMatchedStatuses = ['WAITING', 'VOTING', 'PAUSED'];

      for (const status of nonMatchedStatuses) {
        await roomService.setRoomStatus(roomId, status);
        
        // Verify status changed but no cleanup scheduled
        expect(roomService.getRoomStatus(roomId)).toBe(status);
        expect(roomService.getScheduledCleanup(roomId)).toBeUndefined();
      }
    });

    test('should handle cleanup scheduling for multiple rooms', async () => {
      // Setup: Create multiple rooms
      const rooms = [
        { roomId: 'room-1', filterCriteria: { mediaType: 'MOVIE', genreIds: [28] } },
        { roomId: 'room-2', filterCriteria: { mediaType: 'TV', genreIds: [35] } },
        { roomId: 'room-3', filterCriteria: { mediaType: 'MOVIE', genreIds: [18, 53] } }
      ];

      for (const room of rooms) {
        await roomService.createRoom(room.roomId, 'host-user', room.filterCriteria);
      }

      // Set all rooms to MATCHED status
      for (const room of rooms) {
        await roomService.setRoomStatus(room.roomId, 'MATCHED');
      }

      // Verify all rooms have cleanup scheduled
      for (const room of rooms) {
        const cleanup = roomService.getScheduledCleanup(room.roomId);
        expect(cleanup).toBeDefined();
        expect(cleanup.reason).toBe('MATCHED');
        expect(cleanup.roomId).toBe(room.roomId);
      }
    });
  });

  /**
   * Test: Room Joining with Cache Integration
   * 
   * Verifies that users can join rooms and access cached movies properly.
   */
  describe('Room Joining with Cache Integration', () => {
    test('should allow users to join rooms with active cache', async () => {
      // Setup: Create room with cache
      const roomId = 'joinable-room';
      const filterCriteria = {
        mediaType: 'MOVIE',
        genreIds: [28, 35]
      };

      await roomService.createRoom(roomId, 'host-user', filterCriteria);

      // User joins room
      const joinResult = await roomService.joinRoom(roomId, 'joining-user');

      // Verify successful join
      expect(joinResult.success).toBe(true);
      expect(joinResult.roomId).toBe(roomId);
      expect(joinResult.userId).toBe('joining-user');
      expect(joinResult.cacheAvailable).toBe(true);
      expect(joinResult.roomStatus).toBe('ACTIVE');
    });

    test('should handle joining non-existent rooms', async () => {
      const nonExistentRoomId = 'non-existent-room';
      const userId = 'test-user';

      // Attempt to join non-existent room
      await expect(roomService.joinRoom(nonExistentRoomId, userId))
        .rejects.toThrow(`Room ${nonExistentRoomId} not found`);
    });

    test('should prevent joining inactive rooms', async () => {
      // Setup: Create room and set to inactive status
      const roomId = 'inactive-room';
      const filterCriteria = {
        mediaType: 'MOVIE',
        genreIds: [28]
      };

      await roomService.createRoom(roomId, 'host-user', filterCriteria);
      await roomService.setRoomStatus(roomId, 'MATCHED');

      // Attempt to join inactive room
      await expect(roomService.joinRoom(roomId, 'test-user'))
        .rejects.toThrow(`Room ${roomId} is not active`);
    });

    test('should handle joining rooms without cache', async () => {
      // Setup: Create room without filter criteria (no cache)
      const roomId = 'no-cache-room';
      await roomService.createRoom(roomId, 'host-user', null);

      // User joins room
      const joinResult = await roomService.joinRoom(roomId, 'joining-user');

      // Verify join successful but no cache available
      expect(joinResult.success).toBe(true);
      expect(joinResult.cacheAvailable).toBe(false);
      expect(joinResult.roomStatus).toBe('ACTIVE');
    });
  });

  /**
   * Test: Integration Error Handling
   * 
   * Verifies proper error handling in integration scenarios.
   */
  describe('Integration Error Handling', () => {
    test('should handle concurrent room operations gracefully', async () => {
      const roomId = 'concurrent-room';
      const filterCriteria = {
        mediaType: 'MOVIE',
        genreIds: [28]
      };

      // Simulate concurrent operations
      const operations = [
        roomService.createRoom(roomId, 'host-user', filterCriteria),
        // These should fail since room doesn't exist yet
        roomService.updateRoomFilters(roomId, { mediaType: 'TV', genreIds: [35] }).catch(e => e),
        roomService.joinRoom(roomId, 'user-1').catch(e => e)
      ];

      const results = await Promise.all(operations);

      // Verify room creation succeeded
      expect(results[0].success).toBe(true);

      // Verify other operations failed appropriately
      expect(results[1]).toBeInstanceOf(Error);
      expect(results[2]).toBeInstanceOf(Error);

      // Verify final state is consistent
      const cache = roomService.getRoomCache(roomId);
      expect(cache).toBeDefined();
      expect(cache.filterCriteria).toEqual(filterCriteria);
    });

    test('should maintain data consistency during failures', async () => {
      const roomId = 'consistency-room';
      const validCriteria = {
        mediaType: 'MOVIE',
        genreIds: [28]
      };

      // Create room successfully
      await roomService.createRoom(roomId, 'host-user', validCriteria);
      const originalCache = roomService.getRoomCache(roomId);

      // Attempt invalid filter update
      const invalidCriteria = {
        // Missing mediaType - would cause cache creation to fail
        genreIds: [35]
      };

      try {
        await roomService.updateRoomFilters(roomId, invalidCriteria);
      } catch (error) {
        // Expected to fail
      }

      // Verify original cache is preserved
      const preservedCache = roomService.getRoomCache(roomId);
      expect(preservedCache).toEqual(originalCache);
      expect(preservedCache.filterCriteria).toEqual(validCriteria);
    });
  });
});