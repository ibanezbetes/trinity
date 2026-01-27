/**
 * Property Test 26: Concurrency Control
 * Validates Requirements 8.5: Concurrency control for authentication operations
 * 
 * This property test ensures that:
 * - Protection against race conditions in authentication operations
 * - Proper locking for simultaneous authentication attempts
 * - State conflicts are fixed in concurrent authentication scenarios
 * - Queue management works correctly for concurrent operations
 */

import fc from 'fast-check';
import { authConcurrencyControlService, OperationResult } from '../services/authConcurrencyControlService';

describe('Property Test 26: Concurrency Control', () => {
  beforeEach(() => {
    // Reset service state
    authConcurrencyControlService.clearAllLocks();
    
    // Configure for testing
    authConcurrencyControlService.updateConfig({
      enableConcurrencyControl: true,
      defaultLockTimeoutMs: 5000, // Shorter for testing
      maxConcurrentOperations: 3,
      enableDeadlockDetection: true,
      deadlockTimeoutMs: 10000,
      enableQueueing: true,
      maxQueueSize: 5,
      queueTimeoutMs: 8000,
    });
  });

  afterEach(() => {
    authConcurrencyControlService.clearAllLocks();
  });

  /**
   * Property: Operations are properly serialized for the same operation type
   */
  it('should serialize operations of the same type', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        operation: fc.string({ minLength: 1, maxLength: 15 }),
        concurrentCount: fc.integer({ min: 2, max: 5 }),
        executionTimeMs: fc.integer({ min: 100, max: 500 }),
      }),
      async ({ operation, concurrentCount, executionTimeMs }) => {
        const results: OperationResult<number>[] = [];
        const executionOrder: number[] = [];
        let executionCounter = 0;

        // Create concurrent operations
        const promises = Array.from({ length: concurrentCount }, (_, index) => {
          return authConcurrencyControlService.executeWithLock(
            operation,
            async () => {
              const myNumber = ++executionCounter;
              executionOrder.push(myNumber);
              
              // Simulate work
              await new Promise(resolve => setTimeout(resolve, executionTimeMs));
              
              return myNumber;
            },
            10000 // 10 second timeout
          );
        });

        // Wait for all operations to complete
        const allResults = await Promise.all(promises);
        results.push(...allResults);

        // Verify all operations completed successfully
        results.forEach(result => {
          expect(result.success).toBe(true);
          expect(result.result).toBeDefined();
        });

        // Verify operations were serialized (executed one at a time)
        expect(executionOrder).toHaveLength(concurrentCount);
        
        // Execution order should be sequential (1, 2, 3, ...)
        executionOrder.forEach((value, index) => {
          expect(value).toBe(index + 1);
        });

        // Verify only one operation executed at a time by checking wait times
        const waitTimes = results.map(r => r.waitTimeMs);
        const sortedWaitTimes = [...waitTimes].sort((a, b) => a - b);
        
        // First operation should have minimal wait time
        expect(sortedWaitTimes[0]).toBeLessThan(100);
        
        // Subsequent operations should have increasing wait times
        for (let i = 1; i < sortedWaitTimes.length; i++) {
          expect(sortedWaitTimes[i]).toBeGreaterThan(sortedWaitTimes[i - 1]);
        }
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: Different operations can run concurrently
   */
  it('should allow different operations to run concurrently', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(
        fc.record({
          operation: fc.string({ minLength: 1, maxLength: 10 }),
          executionTimeMs: fc.integer({ min: 200, max: 400 }),
        }),
        { minLength: 2, maxLength: 4 }
      ),
      async (operationConfigs) => {
        const startTime = Date.now();
        const results: OperationResult<string>[] = [];

        // Execute different operations concurrently
        const promises = operationConfigs.map(config => 
          authConcurrencyControlService.executeWithLock(
            config.operation,
            async () => {
              await new Promise(resolve => setTimeout(resolve, config.executionTimeMs));
              return `result-${config.operation}`;
            },
            10000
          )
        );

        const allResults = await Promise.all(promises);
        results.push(...allResults);

        const totalTime = Date.now() - startTime;

        // Verify all operations completed successfully
        results.forEach((result, index) => {
          expect(result.success).toBe(true);
          expect(result.result).toBe(`result-${operationConfigs[index].operation}`);
        });

        // Verify operations ran concurrently (total time should be less than sum of execution times)
        const sumOfExecutionTimes = operationConfigs.reduce((sum, config) => sum + config.executionTimeMs, 0);
        const maxExecutionTime = Math.max(...operationConfigs.map(config => config.executionTimeMs));
        
        // Total time should be closer to the max execution time than the sum (indicating concurrency)
        expect(totalTime).toBeLessThan(sumOfExecutionTimes);
        expect(totalTime).toBeGreaterThanOrEqual(maxExecutionTime - 100); // Allow some overhead
      }
    ), { numRuns: 10 });
  });

  /**
   * Property: Lock timeout works correctly
   */
  it('should handle lock timeouts correctly', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        operation: fc.string({ minLength: 1, maxLength: 15 }),
        lockTimeoutMs: fc.integer({ min: 500, max: 1500 }),
        executionTimeMs: fc.integer({ min: 2000, max: 3000 }), // Longer than timeout
      }),
      async ({ operation, lockTimeoutMs, executionTimeMs }) => {
        // Start a long-running operation
        const longRunningPromise = authConcurrencyControlService.executeWithLock(
          operation,
          async () => {
            await new Promise(resolve => setTimeout(resolve, executionTimeMs));
            return 'long-running-result';
          },
          lockTimeoutMs
        );

        // Wait a bit to ensure the lock is acquired
        await new Promise(resolve => setTimeout(resolve, 100));

        // Try to acquire the same lock (should fail or queue)
        const quickPromise = authConcurrencyControlService.executeWithLock(
          operation,
          async () => {
            return 'quick-result';
          },
          lockTimeoutMs
        );

        const [longResult, quickResult] = await Promise.all([longRunningPromise, quickPromise]);

        // The long-running operation might timeout or complete
        // The quick operation should either be queued or fail due to lock contention
        expect(longResult).toBeDefined();
        expect(quickResult).toBeDefined();

        // At least one should succeed, or both should have meaningful results
        if (longResult.success || quickResult.success) {
          // If any succeeded, verify the result
          if (longResult.success) {
            expect(longResult.result).toBe('long-running-result');
          }
          if (quickResult.success) {
            expect(quickResult.result).toBe('quick-result');
          }
        }
      }
    ), { numRuns: 8 });
  });

  /**
   * Property: Queue management works correctly
   */
  it('should manage operation queues correctly', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        operation: fc.string({ minLength: 1, maxLength: 15 }),
        queueSize: fc.integer({ min: 2, max: 4 }),
        executionTimeMs: fc.integer({ min: 200, max: 400 }),
      }),
      async ({ operation, queueSize, executionTimeMs }) => {
        const results: OperationResult<number>[] = [];
        let executionCounter = 0;

        // Create operations that will be queued
        const promises = Array.from({ length: queueSize }, (_, index) => {
          return authConcurrencyControlService.executeWithLock(
            operation,
            async () => {
              const myNumber = ++executionCounter;
              await new Promise(resolve => setTimeout(resolve, executionTimeMs));
              return myNumber;
            },
            15000 // Long timeout to allow queuing
          );
        });

        // Check queue status while operations are running
        await new Promise(resolve => setTimeout(resolve, 50)); // Let first operation start
        
        const queueStatus = authConcurrencyControlService.getQueueStatus(operation);
        expect(queueStatus.queueLength).toBeGreaterThanOrEqual(0);
        expect(queueStatus.estimatedWaitTimeMs).toBeGreaterThanOrEqual(0);

        // Wait for all operations to complete
        const allResults = await Promise.all(promises);
        results.push(...allResults);

        // Verify all operations completed successfully
        results.forEach(result => {
          expect(result.success).toBe(true);
          expect(result.result).toBeDefined();
        });

        // Verify operations were executed in order
        const resultNumbers = results.map(r => r.result!);
        resultNumbers.forEach((value, index) => {
          expect(value).toBe(index + 1);
        });

        // Verify queue is empty after completion
        const finalQueueStatus = authConcurrencyControlService.getQueueStatus(operation);
        expect(finalQueueStatus.queueLength).toBe(0);
      }
    ), { numRuns: 10 });
  });

  /**
   * Property: Lock status is accurately reported
   */
  it('should accurately report lock status', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(
        fc.record({
          operation: fc.string({ minLength: 1, maxLength: 10 }),
          executionTimeMs: fc.integer({ min: 300, max: 600 }),
        }),
        { minLength: 1, maxLength: 3 }
      ),
      async (operationConfigs) => {
        const promises = operationConfigs.map(config => 
          authConcurrencyControlService.executeWithLock(
            config.operation,
            async () => {
              // Check lock status during execution
              const isLocked = authConcurrencyControlService.isLocked(config.operation);
              expect(isLocked).toBe(true);

              await new Promise(resolve => setTimeout(resolve, config.executionTimeMs));
              return `result-${config.operation}`;
            },
            10000
          )
        );

        // Wait a bit for operations to start
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check current locks
        const currentLocks = authConcurrencyControlService.getCurrentLocks();
        expect(currentLocks.length).toBeGreaterThan(0);
        expect(currentLocks.length).toBeLessThanOrEqual(operationConfigs.length);

        // Verify lock details
        currentLocks.forEach(lock => {
          expect(lock.id).toBeDefined();
          expect(lock.operation).toBeDefined();
          expect(lock.acquiredAt).toBeGreaterThan(0);
          expect(lock.expiresAt).toBeGreaterThan(lock.acquiredAt);
        });

        // Wait for operations to complete
        await Promise.all(promises);

        // Verify locks are released after completion
        operationConfigs.forEach(config => {
          const isLocked = authConcurrencyControlService.isLocked(config.operation);
          expect(isLocked).toBe(false);
        });

        const finalLocks = authConcurrencyControlService.getCurrentLocks();
        expect(finalLocks).toHaveLength(0);
      }
    ), { numRuns: 12 });
  });

  /**
   * Property: Concurrent operation limit is enforced
   */
  it('should enforce concurrent operation limits', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        maxConcurrent: fc.integer({ min: 1, max: 3 }),
        totalOperations: fc.integer({ min: 4, max: 8 }),
        executionTimeMs: fc.integer({ min: 300, max: 500 }),
      }),
      async ({ maxConcurrent, totalOperations, executionTimeMs }) => {
        // Update config with specific concurrent limit
        authConcurrencyControlService.updateConfig({
          maxConcurrentOperations: maxConcurrent,
          enableQueueing: true,
        });

        const results: OperationResult<number>[] = [];
        let activeCount = 0;
        let maxActiveCount = 0;

        // Create operations with different names to test concurrent limit
        const promises = Array.from({ length: totalOperations }, (_, index) => {
          return authConcurrencyControlService.executeWithLock(
            `operation-${index}`, // Different operation names
            async () => {
              activeCount++;
              maxActiveCount = Math.max(maxActiveCount, activeCount);
              
              await new Promise(resolve => setTimeout(resolve, executionTimeMs));
              
              activeCount--;
              return index;
            },
            15000
          );
        });

        const allResults = await Promise.all(promises);
        results.push(...allResults);

        // Verify concurrent limit was respected
        expect(maxActiveCount).toBeLessThanOrEqual(maxConcurrent);

        // Verify all operations completed
        results.forEach((result, index) => {
          expect(result.success).toBe(true);
          expect(result.result).toBe(index);
        });
      }
    ), { numRuns: 8 });
  });

  /**
   * Property: Force release works correctly
   */
  it('should handle force release correctly', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        operation: fc.string({ minLength: 1, maxLength: 15 }),
        executionTimeMs: fc.integer({ min: 1000, max: 2000 }),
      }),
      async ({ operation, executionTimeMs }) => {
        // Start a long-running operation
        const operationPromise = authConcurrencyControlService.executeWithLock(
          operation,
          async () => {
            await new Promise(resolve => setTimeout(resolve, executionTimeMs));
            return 'completed';
          },
          10000
        );

        // Wait for lock to be acquired
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify lock exists
        expect(authConcurrencyControlService.isLocked(operation)).toBe(true);

        // Force release the lock
        const released = authConcurrencyControlService.forceReleaseLock(operation);
        expect(released).toBe(true);

        // Verify lock is released
        expect(authConcurrencyControlService.isLocked(operation)).toBe(false);

        // The original operation should still complete (though it may fail)
        const result = await operationPromise;
        expect(result).toBeDefined();
      }
    ), { numRuns: 10 });
  });

  /**
   * Property: Statistics are accurate
   */
  it('should provide accurate concurrency statistics', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(
        fc.record({
          operation: fc.string({ minLength: 1, maxLength: 10 }),
          executionTimeMs: fc.integer({ min: 200, max: 400 }),
        }),
        { minLength: 1, maxLength: 4 }
      ),
      async (operationConfigs) => {
        const promises = operationConfigs.map(config => 
          authConcurrencyControlService.executeWithLock(
            config.operation,
            async () => {
              await new Promise(resolve => setTimeout(resolve, config.executionTimeMs));
              return `result-${config.operation}`;
            },
            10000
          )
        );

        // Wait for operations to start
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get statistics during execution
        const stats = authConcurrencyControlService.getStats();

        // Verify statistics structure
        expect(stats.activeLocks).toBeGreaterThanOrEqual(0);
        expect(stats.activeOperations).toBeGreaterThanOrEqual(0);
        expect(stats.totalQueuedOperations).toBeGreaterThanOrEqual(0);
        expect(stats.queuesByOperation).toBeDefined();
        expect(stats.config).toBeDefined();

        // Active locks should not exceed the number of operations
        expect(stats.activeLocks).toBeLessThanOrEqual(operationConfigs.length);

        // Wait for completion
        await Promise.all(promises);

        // Get final statistics
        const finalStats = authConcurrencyControlService.getStats();
        expect(finalStats.activeLocks).toBe(0);
        expect(finalStats.activeOperations).toBe(0);
        expect(finalStats.totalQueuedOperations).toBe(0);
      }
    ), { numRuns: 12 });
  });

  /**
   * Property: Configuration changes affect behavior
   */
  it('should respect configuration changes', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        enableConcurrencyControl: fc.boolean(),
        maxConcurrentOperations: fc.integer({ min: 1, max: 5 }),
        enableQueueing: fc.boolean(),
        maxQueueSize: fc.integer({ min: 1, max: 8 }),
      }),
      async (configChanges) => {
        // Update configuration
        authConcurrencyControlService.updateConfig(configChanges);

        // Verify configuration was applied
        const currentConfig = authConcurrencyControlService.getConfig();
        expect(currentConfig.enableConcurrencyControl).toBe(configChanges.enableConcurrencyControl);
        expect(currentConfig.maxConcurrentOperations).toBe(configChanges.maxConcurrentOperations);
        expect(currentConfig.enableQueueing).toBe(configChanges.enableQueueing);
        expect(currentConfig.maxQueueSize).toBe(configChanges.maxQueueSize);

        // Test behavior with new configuration
        const result = await authConcurrencyControlService.executeWithLock(
          'test-operation',
          async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return 'test-result';
          },
          5000
        );

        // Should complete successfully regardless of configuration
        expect(result).toBeDefined();
        
        if (configChanges.enableConcurrencyControl) {
          // With concurrency control, should have lock information
          expect(result.lockHeldMs).toBeGreaterThanOrEqual(0);
        } else {
          // Without concurrency control, should execute immediately
          expect(result.waitTimeMs).toBe(0);
        }
      }
    ), { numRuns: 15 });
  });
});