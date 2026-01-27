/**
 * Property Test: Sign Out State Propagation
 * 
 * This test validates that sign out state changes are properly
 * propagated to all app components and services.
 * 
 * Validates Requirements: 8.3
 */

import { sessionCleanupService } from '../services/sessionCleanupService';
import { backgroundTokenRefreshService } from '../services/backgroundTokenRefreshService';
import { cognitoAuthService } from '../services/cognitoAuthService';
import { secureTokenStorage } from '../services/secureTokenStorage';
import fc from 'fast-check';

// Mock services
jest.mock('../services/cognitoAuthService');
jest.mock('../services/secureTokenStorage');
jest.mock('../services/backgroundTokenRefreshService');
jest.mock('../services/federatedAuthService');
jest.mock('../services/loggingService', () => ({
  loggingService: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    logAuth: jest.fn(),
    clearUserId: jest.fn(),
  },
}));

describe('Property Test: Sign Out State Propagation', () => {
  const mockCognitoService = cognitoAuthService as jest.Mocked<typeof cognitoAuthService>;
  const mockSecureStorage = secureTokenStorage as jest.Mocked<typeof secureTokenStorage>;
  const mockBackgroundRefresh = backgroundTokenRefreshService as jest.Mocked<typeof backgroundTokenRefreshService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset global state
    delete global.currentAuthState;
  });

  // Generators for test data
  const componentListenerArbitrary = fc.array(
    fc.record({
      id: fc.string({ minLength: 5, maxLength: 20 }),
      shouldSucceed: fc.boolean(),
      responseDelay: fc.integer({ min: 0, max: 100 }),
    }),
    { minLength: 1, maxLength: 10 }
  );

  const authStateArbitrary = fc.record({
    isAuthenticated: fc.boolean(),
    user: fc.option(fc.record({
      sub: fc.uuid(),
      email: fc.emailAddress(),
      name: fc.string({ minLength: 2, maxLength: 50 }),
    })),
  });

  /**
   * Property: Sign out should propagate to all registered listeners
   */
  test('Property: Sign out should notify all registered component listeners', async () => {
    await fc.assert(
      fc.asyncProperty(
        componentListenerArbitrary,
        async (listenerConfigs) => {
          // Setup: Create mock listeners based on configs
          const listeners = listenerConfigs.map(config => {
            const listener = jest.fn();
            
            if (config.shouldSucceed) {
              listener.mockImplementation(async () => {
                if (config.responseDelay > 0) {
                  await new Promise(resolve => setTimeout(resolve, config.responseDelay));
                }
                return Promise.resolve();
              });
            } else {
              listener.mockRejectedValue(new Error(`Listener ${config.id} failed`));
            }
            
            return { ...config, listener };
          });

          // Register all listeners
          listeners.forEach(({ listener }) => {
            sessionCleanupService.addCleanupListener(listener);
          });

          // Mock successful service operations
          mockSecureStorage.retrieveTokens.mockResolvedValue(null);
          mockSecureStorage.clearTokens.mockResolvedValue(undefined);
          mockCognitoService.clearTokens.mockResolvedValue(undefined);
          mockBackgroundRefresh.stop.mockReturnValue(undefined);
          mockBackgroundRefresh.resetStats.mockReturnValue(undefined);

          // Execute: Perform sign out cleanup
          const result = await sessionCleanupService.performSignOutCleanup({
            notifyComponents: true,
            forceCleanup: true,
          });

          // Verify: All listeners should have been called
          expect(result.success).toBe(true);
          expect(result.completedSteps).toContain('notify_components');

          listeners.forEach(({ listener, id }) => {
            expect(listener).toHaveBeenCalled();
          });

          // Verify: Global auth state should be cleared
          expect(global.currentAuthState).toEqual({ isAuthenticated: false, user: null });

          // Cleanup: Remove all listeners
          listeners.forEach(({ listener }) => {
            sessionCleanupService.removeCleanupListener(listener);
          });
        }
      ),
      { numRuns: 20, timeout: 15000 }
    );
  });

  /**
   * Property: State propagation should handle listener failures gracefully
   */
  test('Property: State propagation should continue despite individual listener failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 3, maxLength: 8 }),
        async (listenerSuccessFlags) => {
          // Setup: Create listeners with mixed success/failure
          const listeners = listenerSuccessFlags.map((shouldSucceed, index) => {
            const listener = jest.fn();
            
            if (shouldSucceed) {
              listener.mockResolvedValue(undefined);
            } else {
              listener.mockRejectedValue(new Error(`Listener ${index} error`));
            }
            
            return { listener, shouldSucceed, index };
          });

          // Register all listeners
          listeners.forEach(({ listener }) => {
            sessionCleanupService.addCleanupListener(listener);
          });

          // Mock successful service operations
          mockSecureStorage.retrieveTokens.mockResolvedValue(null);
          mockSecureStorage.clearTokens.mockResolvedValue(undefined);
          mockCognitoService.clearTokens.mockResolvedValue(undefined);
          mockBackgroundRefresh.stop.mockReturnValue(undefined);
          mockBackgroundRefresh.resetStats.mockReturnValue(undefined);

          // Execute: Perform sign out cleanup
          const result = await sessionCleanupService.performSignOutCleanup({
            notifyComponents: true,
            forceCleanup: true,
          });

          // Verify: Should succeed despite listener failures
          expect(result.success).toBe(true);
          expect(result.completedSteps).toContain('notify_components');

          // All listeners should have been called
          listeners.forEach(({ listener }) => {
            expect(listener).toHaveBeenCalled();
          });

          // Global state should still be updated
          expect(global.currentAuthState).toEqual({ isAuthenticated: false, user: null });

          // Cleanup: Remove all listeners
          listeners.forEach(({ listener }) => {
            sessionCleanupService.removeCleanupListener(listener);
          });
        }
      ),
      { numRuns: 15, timeout: 10000 }
    );
  });

  /**
   * Property: State propagation should work with concurrent sign out operations
   */
  test('Property: Concurrent sign out operations should propagate state consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        fc.array(fc.constant(jest.fn()), { minLength: 2, maxLength: 6 }),
        async (concurrentOperations, listeners) => {
          // Setup: Register listeners
          listeners.forEach(listener => {
            listener.mockResolvedValue(undefined);
            sessionCleanupService.addCleanupListener(listener);
          });

          // Mock service operations with small delays
          mockSecureStorage.retrieveTokens.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 5));
            return null;
          });
          mockSecureStorage.clearTokens.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 5));
          });
          mockCognitoService.clearTokens.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 5));
          });
          mockBackgroundRefresh.stop.mockReturnValue(undefined);
          mockBackgroundRefresh.resetStats.mockReturnValue(undefined);

          // Execute: Multiple concurrent sign out operations
          const signOutPromises = Array(concurrentOperations).fill(null).map(() =>
            sessionCleanupService.performSignOutCleanup({
              notifyComponents: true,
              revokeTokens: false, // Skip to avoid conflicts
              forceCleanup: true,
            })
          );

          const results = await Promise.all(signOutPromises);

          // Verify: All operations should succeed
          results.forEach(result => {
            expect(result.success).toBe(true);
            expect(result.completedSteps).toContain('notify_components');
          });

          // All listeners should have been called (at least once)
          listeners.forEach(listener => {
            expect(listener).toHaveBeenCalled();
          });

          // Final state should be consistent
          expect(global.currentAuthState).toEqual({ isAuthenticated: false, user: null });

          // Cleanup: Remove all listeners
          listeners.forEach(listener => {
            sessionCleanupService.removeCleanupListener(listener);
          });
        }
      ),
      { numRuns: 10, timeout: 15000 }
    );
  });

  /**
   * Property: State propagation should handle different listener response times
   */
  test('Property: State propagation should handle listeners with different response times', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            delay: fc.integer({ min: 0, max: 200 }),
            shouldSucceed: fc.boolean(),
          }),
          { minLength: 2, maxLength: 6 }
        ),
        async (listenerConfigs) => {
          // Setup: Create listeners with different response times
          const listeners = listenerConfigs.map((config, index) => {
            const listener = jest.fn();
            
            listener.mockImplementation(async () => {
              await new Promise(resolve => setTimeout(resolve, config.delay));
              
              if (!config.shouldSucceed) {
                throw new Error(`Listener ${index} failed after ${config.delay}ms`);
              }
            });
            
            return { listener, config, index };
          });

          // Register all listeners
          listeners.forEach(({ listener }) => {
            sessionCleanupService.addCleanupListener(listener);
          });

          // Mock service operations
          mockSecureStorage.retrieveTokens.mockResolvedValue(null);
          mockSecureStorage.clearTokens.mockResolvedValue(undefined);
          mockCognitoService.clearTokens.mockResolvedValue(undefined);
          mockBackgroundRefresh.stop.mockReturnValue(undefined);
          mockBackgroundRefresh.resetStats.mockReturnValue(undefined);

          // Execute: Perform sign out cleanup
          const startTime = Date.now();
          const result = await sessionCleanupService.performSignOutCleanup({
            notifyComponents: true,
            forceCleanup: true,
          });
          const endTime = Date.now();

          // Verify: Should complete successfully
          expect(result.success).toBe(true);
          expect(result.completedSteps).toContain('notify_components');

          // All listeners should have been called
          listeners.forEach(({ listener }) => {
            expect(listener).toHaveBeenCalled();
          });

          // Should wait for all listeners (including slow ones)
          const maxDelay = Math.max(...listenerConfigs.map(c => c.delay));
          const executionTime = endTime - startTime;
          expect(executionTime).toBeGreaterThanOrEqual(maxDelay - 50); // Allow some tolerance

          // Global state should be updated
          expect(global.currentAuthState).toEqual({ isAuthenticated: false, user: null });

          // Cleanup: Remove all listeners
          listeners.forEach(({ listener }) => {
            sessionCleanupService.removeCleanupListener(listener);
          });
        }
      ),
      { numRuns: 15, timeout: 20000 }
    );
  });

  /**
   * Property: State propagation should maintain consistency across service restarts
   */
  test('Property: State propagation should work correctly after service restarts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constant(jest.fn()), { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 1, max: 3 }),
        async (listeners, restartCount) => {
          // Setup: Mock successful operations
          mockSecureStorage.retrieveTokens.mockResolvedValue(null);
          mockSecureStorage.clearTokens.mockResolvedValue(undefined);
          mockCognitoService.clearTokens.mockResolvedValue(undefined);
          mockBackgroundRefresh.stop.mockReturnValue(undefined);
          mockBackgroundRefresh.resetStats.mockReturnValue(undefined);

          // Perform multiple cycles of listener registration and cleanup
          for (let i = 0; i < restartCount; i++) {
            // Register listeners
            listeners.forEach(listener => {
              listener.mockClear();
              listener.mockResolvedValue(undefined);
              sessionCleanupService.addCleanupListener(listener);
            });

            // Perform cleanup
            const result = await sessionCleanupService.performSignOutCleanup({
              notifyComponents: true,
              forceCleanup: true,
            });

            // Verify this iteration
            expect(result.success).toBe(true);
            expect(result.completedSteps).toContain('notify_components');

            listeners.forEach(listener => {
              expect(listener).toHaveBeenCalled();
            });

            // Remove listeners for next iteration
            listeners.forEach(listener => {
              sessionCleanupService.removeCleanupListener(listener);
            });
          }

          // Final state should be consistent
          expect(global.currentAuthState).toEqual({ isAuthenticated: false, user: null });
        }
      ),
      { numRuns: 10, timeout: 15000 }
    );
  });

  /**
   * Property: State propagation should handle listener addition/removal during cleanup
   */
  test('Property: State propagation should handle dynamic listener changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constant(jest.fn()), { minLength: 3, maxLength: 6 }),
        fc.integer({ min: 1, max: 3 }),
        async (initialListeners, listenersToRemove) => {
          const actualRemoveCount = Math.min(listenersToRemove, initialListeners.length - 1);
          
          // Setup: Register initial listeners
          initialListeners.forEach(listener => {
            listener.mockImplementation(async () => {
              // Simulate some listeners being removed during cleanup
              if (initialListeners.indexOf(listener) < actualRemoveCount) {
                sessionCleanupService.removeCleanupListener(listener);
              }
            });
            sessionCleanupService.addCleanupListener(listener);
          });

          // Mock service operations
          mockSecureStorage.retrieveTokens.mockResolvedValue(null);
          mockSecureStorage.clearTokens.mockResolvedValue(undefined);
          mockCognitoService.clearTokens.mockResolvedValue(undefined);
          mockBackgroundRefresh.stop.mockReturnValue(undefined);
          mockBackgroundRefresh.resetStats.mockReturnValue(undefined);

          // Execute: Perform cleanup with dynamic listener changes
          const result = await sessionCleanupService.performSignOutCleanup({
            notifyComponents: true,
            forceCleanup: true,
          });

          // Verify: Should complete successfully despite dynamic changes
          expect(result.success).toBe(true);
          expect(result.completedSteps).toContain('notify_components');

          // At least some listeners should have been called
          const calledListeners = initialListeners.filter(listener => listener.mock.calls.length > 0);
          expect(calledListeners.length).toBeGreaterThan(0);

          // Global state should be updated
          expect(global.currentAuthState).toEqual({ isAuthenticated: false, user: null });

          // Cleanup: Remove any remaining listeners
          initialListeners.forEach(listener => {
            try {
              sessionCleanupService.removeCleanupListener(listener);
            } catch (error) {
              // Ignore errors for already removed listeners
            }
          });
        }
      ),
      { numRuns: 10, timeout: 10000 }
    );
  });

  /**
   * Property: State propagation should preserve listener order when possible
   */
  test('Property: State propagation should call listeners in registration order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 3, maxLength: 8 }),
        async (listenerIds) => {
          const callOrder: number[] = [];
          
          // Setup: Create listeners that record call order
          const listeners = listenerIds.map(id => {
            const listener = jest.fn().mockImplementation(async () => {
              callOrder.push(id);
            });
            return { id, listener };
          });

          // Register listeners in order
          listeners.forEach(({ listener }) => {
            sessionCleanupService.addCleanupListener(listener);
          });

          // Mock service operations
          mockSecureStorage.retrieveTokens.mockResolvedValue(null);
          mockSecureStorage.clearTokens.mockResolvedValue(undefined);
          mockCognitoService.clearTokens.mockResolvedValue(undefined);
          mockBackgroundRefresh.stop.mockReturnValue(undefined);
          mockBackgroundRefresh.resetStats.mockReturnValue(undefined);

          // Execute: Perform cleanup
          const result = await sessionCleanupService.performSignOutCleanup({
            notifyComponents: true,
            forceCleanup: true,
          });

          // Verify: Should complete successfully
          expect(result.success).toBe(true);
          expect(result.completedSteps).toContain('notify_components');

          // All listeners should have been called
          expect(callOrder).toHaveLength(listenerIds.length);

          // Call order should match registration order
          expect(callOrder).toEqual(listenerIds);

          // Cleanup: Remove all listeners
          listeners.forEach(({ listener }) => {
            sessionCleanupService.removeCleanupListener(listener);
          });
        }
      ),
      { numRuns: 15, timeout: 10000 }
    );
  });
});