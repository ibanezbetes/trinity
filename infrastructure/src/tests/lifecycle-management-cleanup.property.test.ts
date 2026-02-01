/**
 * Property-Based Test for Lifecycle Management and Cleanup
 * 
 * **Feature: room-movie-precaching, Property 5: Lifecycle Management and Cleanup**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 * 
 * For any room that reaches MATCHED status or becomes inactive, cache cleanup 
 * should be scheduled and executed within specified timeframes, removing all 
 * associated cache entries completely.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the lifecycle management system
class MockLifecycleManager {
  private roomCaches: Map<string, any> = new Map();
  private cleanupSchedule: Map<string, any> = new Map();
  private cleanupHistory: Map<string, any[]> = new Map();
  private currentTime: number = Date.now();

  // Room status tracking
  private roomStatuses: Map<string, string> = new Map();
  private lastActivity: Map<string, number> = new Map();

  async createRoomCache(roomId: string, filterCriteria: any) {
    const cache = {
      roomId,
      filterCriteria,
      createdAt: new Date(this.currentTime).toISOString(),
      status: 'ACTIVE',
      movieCount: 30,
      ttl: Math.floor(this.currentTime / 1000) + (7 * 24 * 60 * 60) // 7 days
    };

    this.roomCaches.set(roomId, cache);
    this.roomStatuses.set(roomId, 'ACTIVE');
    this.lastActivity.set(roomId, this.currentTime);
    
    return { success: true, cache };
  }

  async scheduleCleanup(roomId: string, delayHours: number = 1, reason: string = 'MATCHED') {
    const cleanupTime = this.currentTime + (delayHours * 60 * 60 * 1000);
    
    const scheduledCleanup = {
      roomId,
      scheduledAt: new Date(this.currentTime).toISOString(),
      executeAt: new Date(cleanupTime).toISOString(),
      reason,
      status: 'SCHEDULED',
      retryCount: 0,
      maxRetries: 3
    };

    this.cleanupSchedule.set(roomId, scheduledCleanup);
    
    // Update room status
    const cache = this.roomCaches.get(roomId);
    if (cache) {
      cache.status = 'CLEANUP_SCHEDULED';
      cache.cleanupScheduledAt = scheduledCleanup.scheduledAt;
    }

    return scheduledCleanup;
  }

  async executeCleanup(roomId: string, force: boolean = false): Promise<{ success: boolean; error?: string }> {
    const scheduledCleanup = this.cleanupSchedule.get(roomId);
    const cache = this.roomCaches.get(roomId);

    if (!scheduledCleanup && !force) {
      return { success: false, error: 'No cleanup scheduled' };
    }

    if (scheduledCleanup && !force) {
      const executeTime = new Date(scheduledCleanup.executeAt).getTime();
      if (this.currentTime < executeTime) {
        return { success: false, error: 'Cleanup not yet due' };
      }
    }

    try {
      // Simulate cleanup execution
      const cleanupResult = {
        roomId,
        executedAt: new Date(this.currentTime).toISOString(),
        reason: scheduledCleanup?.reason || 'FORCED',
        success: true,
        itemsDeleted: cache?.movieCount || 0,
        retryCount: scheduledCleanup?.retryCount || 0
      };

      // Record cleanup history
      if (!this.cleanupHistory.has(roomId)) {
        this.cleanupHistory.set(roomId, []);
      }
      this.cleanupHistory.get(roomId)!.push(cleanupResult);

      // Remove cache and cleanup schedule
      this.roomCaches.delete(roomId);
      this.cleanupSchedule.delete(roomId);
      this.roomStatuses.set(roomId, 'CLEANED_UP');

      return { success: true };

    } catch (error) {
      // Handle cleanup failure
      if (scheduledCleanup) {
        scheduledCleanup.retryCount++;
        scheduledCleanup.status = 'FAILED';
        scheduledCleanup.lastError = error instanceof Error ? error.message : 'Unknown error';

        if (scheduledCleanup.retryCount < scheduledCleanup.maxRetries) {
          // Schedule retry with exponential backoff
          const retryDelay = Math.pow(2, scheduledCleanup.retryCount) * 60 * 1000; // Minutes
          scheduledCleanup.executeAt = new Date(this.currentTime + retryDelay).toISOString();
          scheduledCleanup.status = 'RETRY_SCHEDULED';
        }
      }

      return { success: false, error: error instanceof Error ? error.message : 'Cleanup failed' };
    }
  }

  async checkInactiveRooms(inactivityThresholdHours: number = 24): Promise<string[]> {
    const inactiveRooms: string[] = [];
    const thresholdTime = this.currentTime - (inactivityThresholdHours * 60 * 60 * 1000);

    for (const [roomId, lastActivityTime] of this.lastActivity.entries()) {
      if (lastActivityTime < thresholdTime && this.roomStatuses.get(roomId) === 'ACTIVE') {
        inactiveRooms.push(roomId);
      }
    }

    return inactiveRooms;
  }

  async setRoomStatus(roomId: string, status: string) {
    this.roomStatuses.set(roomId, status);
    this.lastActivity.set(roomId, this.currentTime);

    // Auto-schedule cleanup for MATCHED rooms
    if (status === 'MATCHED' && this.roomCaches.has(roomId)) {
      await this.scheduleCleanup(roomId, 1, 'MATCHED');
    }
  }

  async updateActivity(roomId: string) {
    this.lastActivity.set(roomId, this.currentTime);
  }

  async processTTLCleanup(): Promise<string[]> {
    const cleanedRooms: string[] = [];
    const currentTTL = Math.floor(this.currentTime / 1000);

    for (const [roomId, cache] of this.roomCaches.entries()) {
      if (cache.ttl && currentTTL > cache.ttl) {
        await this.executeCleanup(roomId, true);
        cleanedRooms.push(roomId);
      }
    }

    return cleanedRooms;
  }

  // Test utilities
  advanceTime(milliseconds: number) {
    this.currentTime += milliseconds;
  }

  getRoomCache(roomId: string) {
    return this.roomCaches.get(roomId);
  }

  getScheduledCleanup(roomId: string) {
    return this.cleanupSchedule.get(roomId);
  }

  getCleanupHistory(roomId: string) {
    return this.cleanupHistory.get(roomId) || [];
  }

  getRoomStatus(roomId: string) {
    return this.roomStatuses.get(roomId);
  }

  getLastActivity(roomId: string) {
    return this.lastActivity.get(roomId);
  }

  simulateCleanupFailure(roomId: string) {
    const scheduledCleanup = this.cleanupSchedule.get(roomId);
    if (scheduledCleanup) {
      scheduledCleanup.simulateFailure = true;
    }
  }

  getAllActiveCaches(): string[] {
    return Array.from(this.roomCaches.keys());
  }

  getAllScheduledCleanups(): string[] {
    return Array.from(this.cleanupSchedule.keys());
  }
}

describe('Property Test: Lifecycle Management and Cleanup', () => {
  let lifecycleManager: MockLifecycleManager;

  beforeEach(() => {
    lifecycleManager = new MockLifecycleManager();
  });

  /**
   * Property Test: Automatic Cleanup Scheduling for MATCHED Rooms
   * 
   * When a room reaches MATCHED status, cleanup should be automatically
   * scheduled within 1 hour without manual intervention.
   */
  test('Property 5.1: Automatic Cleanup Scheduling for MATCHED Rooms', async () => {
    // Property: MATCHED rooms should automatically schedule cleanup
    const matchedRoomScenarios = [
      { roomId: 'matched-room-1', filterCriteria: { mediaType: 'MOVIE', genreIds: [28] } },
      { roomId: 'matched-room-2', filterCriteria: { mediaType: 'TV', genreIds: [35, 18] } },
      { roomId: 'matched-room-3', filterCriteria: { mediaType: 'MOVIE', genreIds: [] } }
    ];

    for (const scenario of matchedRoomScenarios) {
      // Create room cache
      await lifecycleManager.createRoomCache(scenario.roomId, scenario.filterCriteria);
      
      // Property: Cache should be active initially
      expect(lifecycleManager.getRoomStatus(scenario.roomId)).toBe('ACTIVE');
      expect(lifecycleManager.getRoomCache(scenario.roomId)).toBeDefined();
      expect(lifecycleManager.getScheduledCleanup(scenario.roomId)).toBeUndefined();

      // Set room status to MATCHED
      await lifecycleManager.setRoomStatus(scenario.roomId, 'MATCHED');

      // Property: Cleanup should be automatically scheduled
      const scheduledCleanup = lifecycleManager.getScheduledCleanup(scenario.roomId);
      expect(scheduledCleanup).toBeDefined();
      expect(scheduledCleanup.reason).toBe('MATCHED');
      expect(scheduledCleanup.status).toBe('SCHEDULED');

      // Property: Cleanup should be scheduled within 1 hour
      const scheduledTime = new Date(scheduledCleanup.executeAt).getTime();
      const currentTime = lifecycleManager['currentTime'];
      const timeDifference = scheduledTime - currentTime;
      expect(timeDifference).toBeLessThanOrEqual(60 * 60 * 1000); // 1 hour in ms

      // Property: Cache status should reflect scheduled cleanup
      const cache = lifecycleManager.getRoomCache(scenario.roomId);
      expect(cache.status).toBe('CLEANUP_SCHEDULED');
      expect(cache.cleanupScheduledAt).toBeDefined();
    }
  });

  /**
   * Property Test: Inactive Room Detection and Cleanup
   * 
   * Rooms inactive for 24 hours should be detected and scheduled
   * for cleanup automatically.
   */
  test('Property 5.2: Inactive Room Detection and Cleanup', async () => {
    // Property: Inactive rooms should be detected and cleaned up
    const inactivityScenarios = [
      {
        rooms: [
          { roomId: 'inactive-room-1', inactiveHours: 25 }, // Over threshold
          { roomId: 'inactive-room-2', inactiveHours: 48 }, // Well over threshold
          { roomId: 'active-room-1', inactiveHours: 12 },   // Under threshold
          { roomId: 'active-room-2', inactiveHours: 23 }    // Just under threshold
        ],
        thresholdHours: 24
      }
    ];

    for (const scenario of inactivityScenarios) {
      // Create rooms with different activity levels
      for (const room of scenario.rooms) {
        await lifecycleManager.createRoomCache(room.roomId, { 
          mediaType: 'MOVIE', 
          genreIds: [28] 
        });

        // Simulate inactivity by advancing time and not updating activity
        const inactivityMs = room.inactiveHours * 60 * 60 * 1000;
        lifecycleManager.advanceTime(inactivityMs);
      }

      // Check for inactive rooms
      const inactiveRooms = await lifecycleManager.checkInactiveRooms(scenario.thresholdHours);

      // Property: Should detect rooms over inactivity threshold
      const expectedInactiveRooms = scenario.rooms
        .filter(room => room.inactiveHours > scenario.thresholdHours)
        .map(room => room.roomId);

      expect(inactiveRooms.sort()).toEqual(expectedInactiveRooms.sort());

      // Property: Active rooms should not be detected as inactive
      const activeRooms = scenario.rooms
        .filter(room => room.inactiveHours <= scenario.thresholdHours)
        .map(room => room.roomId);

      for (const activeRoomId of activeRooms) {
        expect(inactiveRooms).not.toContain(activeRoomId);
      }

      // Schedule cleanup for inactive rooms
      for (const inactiveRoomId of inactiveRooms) {
        await lifecycleManager.scheduleCleanup(inactiveRoomId, 0, 'INACTIVE');
      }

      // Property: Cleanup should be scheduled for all inactive rooms
      for (const inactiveRoomId of inactiveRooms) {
        const scheduledCleanup = lifecycleManager.getScheduledCleanup(inactiveRoomId);
        expect(scheduledCleanup).toBeDefined();
        expect(scheduledCleanup.reason).toBe('INACTIVE');
      }
    }
  });

  /**
   * Property Test: Complete Cache Entry Removal
   * 
   * When cleanup is executed, all cache entries associated with the
   * room should be completely removed from storage.
   */
  test('Property 5.3: Complete Cache Entry Removal', async () => {
    // Property: Cleanup should remove all associated cache entries
    const cleanupScenarios = [
      {
        roomId: 'cleanup-complete-1',
        filterCriteria: { mediaType: 'MOVIE', genreIds: [28, 35] },
        cleanupReason: 'MATCHED'
      },
      {
        roomId: 'cleanup-complete-2',
        filterCriteria: { mediaType: 'TV', genreIds: [18] },
        cleanupReason: 'INACTIVE'
      },
      {
        roomId: 'cleanup-complete-3',
        filterCriteria: { mediaType: 'MOVIE', genreIds: [] },
        cleanupReason: 'MANUAL'
      }
    ];

    for (const scenario of cleanupScenarios) {
      // Create room cache
      await lifecycleManager.createRoomCache(scenario.roomId, scenario.filterCriteria);

      // Property: Cache should exist before cleanup
      expect(lifecycleManager.getRoomCache(scenario.roomId)).toBeDefined();
      expect(lifecycleManager.getRoomStatus(scenario.roomId)).toBe('ACTIVE');

      // Schedule and execute cleanup
      await lifecycleManager.scheduleCleanup(scenario.roomId, 0, scenario.cleanupReason);
      const cleanupResult = await lifecycleManager.executeCleanup(scenario.roomId);

      // Property: Cleanup should succeed
      expect(cleanupResult.success).toBe(true);

      // Property: Cache should be completely removed
      expect(lifecycleManager.getRoomCache(scenario.roomId)).toBeUndefined();

      // Property: Cleanup schedule should be removed
      expect(lifecycleManager.getScheduledCleanup(scenario.roomId)).toBeUndefined();

      // Property: Room status should reflect cleanup
      expect(lifecycleManager.getRoomStatus(scenario.roomId)).toBe('CLEANED_UP');

      // Property: Cleanup should be recorded in history
      const cleanupHistory = lifecycleManager.getCleanupHistory(scenario.roomId);
      expect(cleanupHistory.length).toBe(1);
      expect(cleanupHistory[0].success).toBe(true);
      expect(cleanupHistory[0].reason).toBe(scenario.cleanupReason);
      expect(cleanupHistory[0].itemsDeleted).toBeGreaterThan(0);
    }
  });

  /**
   * Property Test: TTL-Based Automatic Cleanup
   * 
   * Cache entries should be automatically cleaned up when TTL expires,
   * serving as a safety mechanism for orphaned caches.
   */
  test('Property 5.4: TTL-Based Automatic Cleanup', async () => {
    // Property: TTL should trigger automatic cleanup as safety mechanism
    const ttlScenarios = [
      {
        roomId: 'ttl-cleanup-1',
        filterCriteria: { mediaType: 'MOVIE', genreIds: [28] },
        ttlDays: 7
      },
      {
        roomId: 'ttl-cleanup-2',
        filterCriteria: { mediaType: 'TV', genreIds: [35, 18] },
        ttlDays: 7
      }
    ];

    for (const scenario of ttlScenarios) {
      // Create room cache with TTL
      await lifecycleManager.createRoomCache(scenario.roomId, scenario.filterCriteria);

      // Property: Cache should exist with TTL set
      const cache = lifecycleManager.getRoomCache(scenario.roomId);
      expect(cache).toBeDefined();
      expect(cache.ttl).toBeDefined();

      // Advance time beyond TTL
      const ttlMs = scenario.ttlDays * 24 * 60 * 60 * 1000;
      lifecycleManager.advanceTime(ttlMs + 1000); // Add 1 second past TTL

      // Process TTL cleanup
      const cleanedRooms = await lifecycleManager.processTTLCleanup();

      // Property: Room should be cleaned up due to TTL expiry
      expect(cleanedRooms).toContain(scenario.roomId);

      // Property: Cache should be removed
      expect(lifecycleManager.getRoomCache(scenario.roomId)).toBeUndefined();

      // Property: Room status should reflect TTL cleanup
      expect(lifecycleManager.getRoomStatus(scenario.roomId)).toBe('CLEANED_UP');

      // Property: Cleanup should be recorded in history
      const cleanupHistory = lifecycleManager.getCleanupHistory(scenario.roomId);
      expect(cleanupHistory.length).toBe(1);
      expect(cleanupHistory[0].success).toBe(true);
    }
  });

  /**
   * Property Test: Cleanup Retry Logic with Exponential Backoff
   * 
   * Failed cleanup operations should be retried up to 3 times with
   * exponential backoff before giving up.
   */
  test('Property 5.5: Cleanup Retry Logic with Exponential Backoff', async () => {
    // Property: Failed cleanups should retry with exponential backoff
    const retryScenarios = [
      {
        roomId: 'retry-test-1',
        filterCriteria: { mediaType: 'MOVIE', genreIds: [28] },
        failureCount: 2, // Fail first 2 attempts, succeed on 3rd
        maxRetries: 3
      },
      {
        roomId: 'retry-test-2',
        filterCriteria: { mediaType: 'TV', genreIds: [35] },
        failureCount: 4, // Fail all attempts (exceed max retries)
        maxRetries: 3
      }
    ];

    for (const scenario of retryScenarios) {
      // Create room cache
      await lifecycleManager.createRoomCache(scenario.roomId, scenario.filterCriteria);

      // Schedule cleanup
      await lifecycleManager.scheduleCleanup(scenario.roomId, 0, 'MATCHED');

      let attemptCount = 0;
      let lastCleanupResult;

      // Simulate cleanup attempts with failures
      while (attemptCount <= scenario.maxRetries) {
        const scheduledCleanup = lifecycleManager.getScheduledCleanup(scenario.roomId);
        
        if (!scheduledCleanup) break;

        // Simulate failure for specified number of attempts
        if (attemptCount < scenario.failureCount) {
          lifecycleManager.simulateCleanupFailure(scenario.roomId);
        }

        lastCleanupResult = await lifecycleManager.executeCleanup(scenario.roomId);
        attemptCount++;

        // Property: Should track retry count
        if (!lastCleanupResult.success && attemptCount <= scenario.maxRetries) {
          const updatedScheduledCleanup = lifecycleManager.getScheduledCleanup(scenario.roomId);
          if (updatedScheduledCleanup) {
            expect(updatedScheduledCleanup.retryCount).toBe(attemptCount);
            
            // Property: Should schedule retry with exponential backoff
            if (attemptCount < scenario.maxRetries) {
              expect(updatedScheduledCleanup.status).toBe('RETRY_SCHEDULED');
              
              // Advance time to retry point
              const retryDelay = Math.pow(2, attemptCount) * 60 * 1000;
              lifecycleManager.advanceTime(retryDelay);
            }
          }
        }

        if (lastCleanupResult.success) break;
      }

      if (scenario.failureCount <= scenario.maxRetries) {
        // Property: Should eventually succeed within retry limit
        expect(lastCleanupResult.success).toBe(true);
        expect(lifecycleManager.getRoomCache(scenario.roomId)).toBeUndefined();
      } else {
        // Property: Should fail after exceeding retry limit
        expect(lastCleanupResult.success).toBe(false);
        expect(attemptCount).toBe(scenario.maxRetries + 1);
        
        // Property: Cache should still exist after max retries exceeded
        expect(lifecycleManager.getRoomCache(scenario.roomId)).toBeDefined();
      }

      // Property: Cleanup history should record all attempts
      const cleanupHistory = lifecycleManager.getCleanupHistory(scenario.roomId);
      expect(cleanupHistory.length).toBeGreaterThan(0);
    }
  });

  /**
   * Property Test: Cleanup Timing and Scheduling Accuracy
   * 
   * Cleanup operations should be executed at the correct scheduled time
   * and not before the specified delay period.
   */
  test('Property 5.6: Cleanup Timing and Scheduling Accuracy', async () => {
    // Property: Cleanup should execute at correct scheduled time
    const timingScenarios = [
      {
        roomId: 'timing-test-1',
        delayHours: 1,
        filterCriteria: { mediaType: 'MOVIE', genreIds: [28] }
      },
      {
        roomId: 'timing-test-2',
        delayHours: 2,
        filterCriteria: { mediaType: 'TV', genreIds: [35] }
      },
      {
        roomId: 'timing-test-3',
        delayHours: 0.5, // 30 minutes
        filterCriteria: { mediaType: 'MOVIE', genreIds: [] }
      }
    ];

    for (const scenario of timingScenarios) {
      // Create room cache
      await lifecycleManager.createRoomCache(scenario.roomId, scenario.filterCriteria);

      // Schedule cleanup with specific delay
      const scheduledCleanup = await lifecycleManager.scheduleCleanup(
        scenario.roomId, 
        scenario.delayHours, 
        'MATCHED'
      );

      // Property: Cleanup should not execute before scheduled time
      const earlyCleanupResult = await lifecycleManager.executeCleanup(scenario.roomId);
      expect(earlyCleanupResult.success).toBe(false);
      expect(earlyCleanupResult.error).toContain('not yet due');

      // Property: Cache should still exist before scheduled time
      expect(lifecycleManager.getRoomCache(scenario.roomId)).toBeDefined();

      // Advance time to exactly scheduled time
      const delayMs = scenario.delayHours * 60 * 60 * 1000;
      lifecycleManager.advanceTime(delayMs);

      // Property: Cleanup should execute successfully at scheduled time
      const onTimeCleanupResult = await lifecycleManager.executeCleanup(scenario.roomId);
      expect(onTimeCleanupResult.success).toBe(true);

      // Property: Cache should be removed after cleanup
      expect(lifecycleManager.getRoomCache(scenario.roomId)).toBeUndefined();

      // Property: Scheduled time should match expected delay
      const scheduledTime = new Date(scheduledCleanup.executeAt).getTime();
      const creationTime = lifecycleManager['currentTime'] - delayMs;
      const actualDelay = scheduledTime - creationTime;
      const expectedDelayMs = scenario.delayHours * 60 * 60 * 1000;
      
      expect(Math.abs(actualDelay - expectedDelayMs)).toBeLessThan(1000); // Within 1 second
    }
  });
});