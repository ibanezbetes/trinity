/**
 * Property-Based Tests for Operation Queuing
 * Feature: trinity-voting-fixes, Property 21: Operation Queuing
 * Validates: Requirements 9.4
 */

import fc from 'fast-check';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { operationQueueService, QueuedOperation } from '../services/operationQueueService';
import { networkService } from '../services/networkService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock network service
jest.mock('../services/networkService', () => ({
  networkService: {
    isConnected: jest.fn(),
    addNetworkListener: jest.fn(() => () => {}),
  },
}));

// Mock API services to avoid actual network calls
jest.mock('../services/voteService', () => ({
  voteService: {
    registerVote: jest.fn(),
  },
}));

jest.mock('../services/roomService', () => ({
  roomService: {
    createRoom: jest.fn(),
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
    updateRoomFilters: jest.fn(),
  },
}));

describe('Operation Queuing Property Tests', () => {
  const mockNetworkService = networkService as jest.Mocked<typeof networkService>;
  const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
    mockNetworkService.isConnected.mockReturnValue(false); // Start offline
  });

  /**
   * Property 21.1: Queue Operations When Offline
   * For any operation type and payload, when network is offline, 
   * the system should queue the operation for later execution
   */
  test('Property 21.1: Queue Operations When Offline', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('VOTE', 'JOIN_ROOM', 'CREATE_ROOM', 'LEAVE_ROOM', 'UPDATE_FILTERS'),
        fc.record({
          mediaId: fc.string({ minLength: 1, maxLength: 20 }),
          voteType: fc.constantFrom('like', 'dislike'),
          roomId: fc.string({ minLength: 1, maxLength: 20 }),
          inviteCode: fc.string({ minLength: 6, maxLength: 6 }),
          filters: fc.record({
            genres: fc.array(fc.string(), { maxLength: 5 }),
          }),
        }),
        fc.constantFrom('HIGH', 'MEDIUM', 'LOW'),
        async (operationType, payload, priority) => {
          // Arrange: Network is offline
          mockNetworkService.isConnected.mockReturnValue(false);

          // Create a fresh service instance for each test
          const queueService = new (operationQueueService.constructor as any)();
          
          // Mock executor that would normally make network call
          const mockExecutor = jest.fn().mockRejectedValue(new Error('Network error'));

          // Act: Execute operation
          const result = await queueService.executeOrQueue(
            operationType,
            payload,
            mockExecutor,
            { priority, maxRetries: 2, expiresInMs: 60000 }
          );

          // Assert: Operation should be queued
          expect(result.success).toBe(false);
          expect(result.data?.queued).toBe(true);
          expect(result.error).toContain('queued');

          // Verify operation was added to queue
          const queuedOps = queueService.getQueuedOperations();
          expect(queuedOps).toHaveLength(1);
          expect(queuedOps[0].type).toBe(operationType);
          expect(queuedOps[0].priority).toBe(priority);
          expect(queuedOps[0].retryCount).toBe(0);
        }
      ),
      { numRuns: 100, timeout: 5000 }
    );
  });

  /**
   * Property 21.2: Execute Immediately When Online
   * For any operation, when network is online and operation succeeds,
   * the system should execute immediately without queuing
   */
  test('Property 21.2: Execute Immediately When Online', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('VOTE', 'JOIN_ROOM', 'CREATE_ROOM'),
        fc.record({
          mediaId: fc.string({ minLength: 1, maxLength: 20 }),
          roomId: fc.string({ minLength: 1, maxLength: 20 }),
          name: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        async (operationType, payload) => {
          // Arrange: Network is online
          mockNetworkService.isConnected.mockReturnValue(true);

          const queueService = new (operationQueueService.constructor as any)();
          const expectedResult = { success: true, data: payload };
          const mockExecutor = jest.fn().mockResolvedValue(expectedResult.data);

          // Act: Execute operation
          const result = await queueService.executeOrQueue(
            operationType,
            payload,
            mockExecutor,
            { priority: 'HIGH' }
          );

          // Assert: Operation should execute immediately
          expect(result.success).toBe(true);
          expect(result.data).toEqual(expectedResult.data);
          expect(result.fromQueue).toBe(false);
          expect(mockExecutor).toHaveBeenCalledTimes(1);

          // Verify no operations were queued
          const queuedOps = queueService.getQueuedOperations();
          expect(queuedOps).toHaveLength(0);
        }
      ),
      { numRuns: 100, timeout: 5000 }
    );
  });

  /**
   * Property 21.3: Priority-Based Queue Ordering
   * For any set of operations with different priorities,
   * HIGH priority operations should be processed before MEDIUM and LOW
   */
  test('Property 21.3: Priority-Based Queue Ordering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            type: fc.constantFrom('VOTE', 'JOIN_ROOM', 'CREATE_ROOM'),
            priority: fc.constantFrom('HIGH', 'MEDIUM', 'LOW'),
            payload: fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 }),
            }),
          }),
          { minLength: 3, maxLength: 10 }
        ),
        async (operations) => {
          // Arrange: Network is offline
          mockNetworkService.isConnected.mockReturnValue(false);

          const queueService = new (operationQueueService.constructor as any)();
          const mockExecutor = jest.fn().mockRejectedValue(new Error('Offline'));

          // Act: Queue all operations
          for (const op of operations) {
            await queueService.executeOrQueue(
              op.type,
              op.payload,
              mockExecutor,
              { priority: op.priority }
            );
          }

          // Assert: Verify priority ordering
          const queuedOps = queueService.getQueuedOperations();
          
          // Check that HIGH priority operations come first
          let foundMediumOrLow = false;
          for (const queuedOp of queuedOps) {
            if (queuedOp.priority === 'MEDIUM' || queuedOp.priority === 'LOW') {
              foundMediumOrLow = true;
            } else if (queuedOp.priority === 'HIGH' && foundMediumOrLow) {
              // Found HIGH priority after MEDIUM/LOW - this violates ordering
              throw new Error('Priority ordering violated: HIGH priority operation found after MEDIUM/LOW');
            }
          }

          // Check that MEDIUM priority operations come before LOW
          let foundLow = false;
          for (const queuedOp of queuedOps) {
            if (queuedOp.priority === 'LOW') {
              foundLow = true;
            } else if (queuedOp.priority === 'MEDIUM' && foundLow) {
              // Found MEDIUM priority after LOW - this violates ordering
              throw new Error('Priority ordering violated: MEDIUM priority operation found after LOW');
            }
          }
        }
      ),
      { numRuns: 50, timeout: 10000 }
    );
  });

  /**
   * Property 21.4: Retry Logic with Exponential Backoff
   * For any failed operation, the system should retry up to maxRetries times
   * and remove from queue when max retries exceeded
   */
  test('Property 21.4: Retry Logic with Exponential Backoff', async () => {
    // Mock the actual services that executeOperation uses
    const mockVoteService = require('../services/voteService');
    const mockRoomService = require('../services/roomService');
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('VOTE', 'CREATE_ROOM'),
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 10 }),
          roomId: fc.string({ minLength: 1, maxLength: 10 }),
        }),
        fc.integer({ min: 1, max: 3 }),
        async (operationType, payload, maxRetries) => {
          // Clear mock calls before each iteration
          jest.clearAllMocks();
          
          // Arrange: Network is offline initially
          mockNetworkService.isConnected.mockReturnValue(false);

          const queueService = new (operationQueueService.constructor as any)();
          
          // Mock the service methods to fail
          if (operationType === 'VOTE') {
            mockVoteService.voteService.registerVote.mockRejectedValue(new Error('Vote failed'));
          } else if (operationType === 'CREATE_ROOM') {
            mockRoomService.roomService.createRoom.mockRejectedValue(new Error('Create room failed'));
          }

          // Queue operation first using queueOperation directly
          await queueService.queueOperation(
            operationType,
            payload,
            { maxRetries, priority: 'HIGH', roomId: payload.roomId }
          );

          // Verify operation was queued
          let queuedOps = queueService.getQueuedOperations();
          expect(queuedOps).toHaveLength(1);
          expect(queuedOps[0].retryCount).toBe(0);

          // Simulate network coming online
          mockNetworkService.isConnected.mockReturnValue(true);

          // Act: Process queue manually (this will retry the failed operation)
          await queueService.forceProcessQueue();

          // Assert: Check retry behavior based on maxRetries
          queuedOps = queueService.getQueuedOperations();
          
          if (maxRetries === 1) {
            // Should be removed after 1 failure (exceeded max retries)
            expect(queuedOps).toHaveLength(0);
          } else {
            // Should still be in queue with retry count incremented
            expect(queuedOps).toHaveLength(1);
            expect(queuedOps[0].retryCount).toBe(1);
            expect(queuedOps[0].retryCount).toBeLessThanOrEqual(maxRetries);
          }

          // Verify the service method was called exactly once per test iteration
          if (operationType === 'VOTE') {
            expect(mockVoteService.voteService.registerVote).toHaveBeenCalledTimes(1);
          } else if (operationType === 'CREATE_ROOM') {
            expect(mockRoomService.roomService.createRoom).toHaveBeenCalledTimes(1);
          }
        }
      ),
      { numRuns: 30, timeout: 8000 }
    );
  });

  /**
   * Property 21.5: Operation Expiration
   * For any operation with expiration time, expired operations should be removed from queue
   */
  test('Property 21.5: Operation Expiration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('VOTE', 'UPDATE_FILTERS'),
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 10 }),
        }),
        fc.integer({ min: 50, max: 200 }), // shorter expiration time
        async (operationType, payload, expirationMs) => {
          // Arrange: Network is offline
          mockNetworkService.isConnected.mockReturnValue(false);

          const queueService = new (operationQueueService.constructor as any)();
          const mockExecutor = jest.fn().mockRejectedValue(new Error('Offline'));

          // Act: Queue operation with short expiration
          await queueService.executeOrQueue(
            operationType,
            payload,
            mockExecutor,
            { expiresInMs: expirationMs, priority: 'MEDIUM' }
          );

          // Verify operation was queued
          let queuedOps = queueService.getQueuedOperations();
          expect(queuedOps).toHaveLength(1);

          // Wait for expiration + buffer
          await new Promise(resolve => setTimeout(resolve, expirationMs + 50));

          // Simulate network coming online and processing queue
          mockNetworkService.isConnected.mockReturnValue(true);
          await queueService.forceProcessQueue();

          // Assert: Expired operation should be removed
          queuedOps = queueService.getQueuedOperations();
          expect(queuedOps).toHaveLength(0);
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  }, 15000);

  /**
   * Property 21.6: Queue Persistence
   * For any queued operations, they should persist across service restarts
   */
  test('Property 21.6: Queue Persistence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            type: fc.constantFrom('VOTE', 'JOIN_ROOM'),
            payload: fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 }),
            }),
            priority: fc.constantFrom('HIGH', 'MEDIUM', 'LOW'),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (operations) => {
          // Arrange: Network is offline, fresh storage
          mockNetworkService.isConnected.mockReturnValue(false);
          mockAsyncStorage.getItem.mockResolvedValue(null); // Start with empty storage

          const queueService1 = new (operationQueueService.constructor as any)();
          const mockExecutor = jest.fn().mockRejectedValue(new Error('Offline'));

          // Wait for initialization
          await new Promise(resolve => setTimeout(resolve, 50));

          // Act: Queue operations
          for (const op of operations) {
            await queueService1.executeOrQueue(
              op.type,
              op.payload,
              mockExecutor,
              { priority: op.priority }
            );
          }

          // Capture what was stored
          const setItemCalls = mockAsyncStorage.setItem.mock.calls;
          expect(setItemCalls.length).toBeGreaterThan(0);

          // Get the last stored queue data
          const lastStoredData = setItemCalls[setItemCalls.length - 1][1];
          
          // Simulate service restart by creating new instance
          mockAsyncStorage.getItem.mockResolvedValue(lastStoredData);
          const queueService2 = new (operationQueueService.constructor as any)();
          
          // Wait for initialization
          await new Promise(resolve => setTimeout(resolve, 100));

          // Assert: Operations should be restored
          const restoredOps = queueService2.getQueuedOperations();
          expect(restoredOps).toHaveLength(operations.length);
          
          // Verify operation types match
          const originalTypes = operations.map(op => op.type).sort();
          const restoredTypes = restoredOps.map((op: QueuedOperation) => op.type).sort();
          expect(restoredTypes).toEqual(originalTypes);
        }
      ),
      { numRuns: 20, timeout: 8000 }
    );
  });

  /**
   * Property 21.7: Queue Size Limits
   * For any number of operations exceeding queue limit,
   * oldest low-priority operations should be removed to maintain size limit
   */
  test('Property 21.7: Queue Size Limits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 15 }), // operations to add (more than typical limit)
        async (numOperations) => {
          // Arrange: Network is offline
          mockNetworkService.isConnected.mockReturnValue(false);

          const queueService = new (operationQueueService.constructor as any)();
          // Set a small queue limit for testing
          queueService.updateConfig({ maxQueueSize: 5 });
          
          const mockExecutor = jest.fn().mockRejectedValue(new Error('Offline'));

          // Act: Add more operations than the limit
          const operations = [];
          for (let i = 0; i < numOperations; i++) {
            const priority = i < 2 ? 'HIGH' : (i < 4 ? 'MEDIUM' : 'LOW');
            operations.push({
              type: 'VOTE',
              payload: { id: `op-${i}` },
              priority
            });
          }

          for (const op of operations) {
            await queueService.executeOrQueue(
              op.type,
              op.payload,
              mockExecutor,
              { priority: op.priority }
            );
          }

          // Assert: Queue should not exceed limit
          const queuedOps = queueService.getQueuedOperations();
          expect(queuedOps.length).toBeLessThanOrEqual(5);

          // High priority operations should be preserved
          const highPriorityOps = queuedOps.filter((op: QueuedOperation) => op.priority === 'HIGH');
          const originalHighPriorityCount = Math.min(2, numOperations);
          expect(highPriorityOps.length).toBe(originalHighPriorityCount);
        }
      ),
      { numRuns: 30, timeout: 8000 }
    );
  });
});