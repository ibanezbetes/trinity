/**
 * Property Test 22: Authentication State Broadcasting
 * Validates Requirements 8.1: Authentication state broadcasting to all app components
 * 
 * This property test ensures that:
 * - Authentication state changes broadcast to all app components
 * - State management ensures consistency across components
 * - Proper event handling for authentication state changes
 * - Listeners receive state updates in correct order and format
 */

import fc from 'fast-check';
import { authStateBroadcastService, AuthState, AuthStateListener } from '../services/authStateBroadcastService';

describe('Property Test 22: Authentication State Broadcasting', () => {
  beforeEach(() => {
    // Reset service state
    authStateBroadcastService.reset();
    
    // Clear all listeners
    const listeners = authStateBroadcastService.getListeners();
    listeners.forEach(listener => {
      authStateBroadcastService.removeListener(listener.id);
    });
    
    // Configure for testing
    authStateBroadcastService.updateConfig({
      enableEventHistory: true,
      maxEventHistory: 100,
      enableDebugLogging: false, // Disable debug logging during tests
      enablePerformanceMetrics: true,
      batchUpdates: false,
      batchDelayMs: 50,
    });
  });

  afterEach(() => {
    // Clean up listeners
    const listeners = authStateBroadcastService.getListeners();
    listeners.forEach(listener => {
      authStateBroadcastService.removeListener(listener.id);
    });
    
    authStateBroadcastService.clearEventHistory();
  });

  /**
   * Property: All registered listeners receive state updates
   */
  it('should notify all registered listeners when state changes', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 20 }),
          component: fc.string({ minLength: 1, maxLength: 15 }),
          priority: fc.integer({ min: 0, max: 10 }),
        }),
        { minLength: 1, maxLength: 10 }
      ),
      fc.record({
        isAuthenticated: fc.boolean(),
        userId: fc.string({ minLength: 1, maxLength: 20 }),
        email: fc.emailAddress(),
        name: fc.string({ minLength: 1, maxLength: 30 }),
      }),
      (listenerConfigs, userInfo) => {
        const receivedStates: Map<string, AuthState[]> = new Map();

        // Register listeners
        const listeners: AuthStateListener[] = listenerConfigs.map(config => ({
          id: config.id,
          component: config.component,
          priority: config.priority,
          callback: (state: AuthState) => {
            if (!receivedStates.has(config.id)) {
              receivedStates.set(config.id, []);
            }
            receivedStates.get(config.id)!.push({ ...state });
          },
        }));

        // Add all listeners
        listeners.forEach(listener => {
          authStateBroadcastService.addListener(listener);
        });

        // Verify initial state received
        expect(receivedStates.size).toBe(listeners.length);
        receivedStates.forEach((states, listenerId) => {
          expect(states).toHaveLength(1); // Initial state
          expect(states[0].isAuthenticated).toBe(false);
        });

        // Clear received states for the actual test
        receivedStates.clear();

        // Update authentication state
        const newState: Partial<AuthState> = {
          isAuthenticated: userInfo.isAuthenticated,
          user: userInfo.isAuthenticated ? {
            id: userInfo.userId,
            email: userInfo.email,
            name: userInfo.name,
          } : undefined,
          tokens: userInfo.isAuthenticated ? {
            accessToken: 'test-access-token',
            idToken: 'test-id-token',
            refreshToken: 'test-refresh-token',
            expiresAt: Date.now() + 3600000, // 1 hour from now
          } : undefined,
        };

        authStateBroadcastService.updateAuthState(newState, 'login');

        // Verify all listeners received the update
        expect(receivedStates.size).toBe(listeners.length);
        
        receivedStates.forEach((states, listenerId) => {
          expect(states).toHaveLength(1); // One update
          const receivedState = states[0];
          
          expect(receivedState.isAuthenticated).toBe(userInfo.isAuthenticated);
          expect(receivedState.source).toBe('login');
          expect(receivedState.lastUpdated).toBeDefined();
          expect(receivedState.sessionId).toBeDefined();
          
          if (userInfo.isAuthenticated) {
            expect(receivedState.user).toBeDefined();
            expect(receivedState.user!.id).toBe(userInfo.userId);
            expect(receivedState.user!.email).toBe(userInfo.email);
            expect(receivedState.user!.name).toBe(userInfo.name);
            expect(receivedState.tokens).toBeDefined();
          } else {
            expect(receivedState.user).toBeUndefined();
            expect(receivedState.tokens).toBeUndefined();
          }
        });
      }
    ), { numRuns: 30 });
  });

  /**
   * Property: Listeners are called in priority order
   */
  it('should call listeners in priority order (highest first)', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 15 }),
          priority: fc.integer({ min: 0, max: 100 }),
        }),
        { minLength: 2, maxLength: 8 }
      ),
      (listenerConfigs) => {
        const callOrder: string[] = [];

        // Register listeners with different priorities
        const listeners: AuthStateListener[] = listenerConfigs.map(config => ({
          id: config.id,
          priority: config.priority,
          callback: (state: AuthState) => {
            callOrder.push(config.id);
          },
        }));

        listeners.forEach(listener => {
          authStateBroadcastService.addListener(listener);
        });

        // Clear initial call order (from registration)
        callOrder.length = 0;

        // Trigger state update
        authStateBroadcastService.updateAuthState({
          isAuthenticated: true,
          user: {
            id: 'test-user',
            email: 'test@example.com',
          },
          tokens: {
            accessToken: 'token',
            idToken: 'id-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 3600000,
          },
        }, 'login');

        // Verify call order matches priority order
        expect(callOrder).toHaveLength(listeners.length);

        // Sort expected order by priority (highest first)
        const expectedOrder = listenerConfigs
          .sort((a, b) => (b.priority || 0) - (a.priority || 0))
          .map(config => config.id);

        expect(callOrder).toEqual(expectedOrder);
      }
    ), { numRuns: 25 });
  });

  /**
   * Property: State consistency is maintained across all listeners
   */
  it('should maintain state consistency across all listeners', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 15 }),
          component: fc.string({ minLength: 1, maxLength: 10 }),
        }),
        { minLength: 1, maxLength: 6 }
      ),
      fc.array(
        fc.record({
          isAuthenticated: fc.boolean(),
          userId: fc.string({ minLength: 1, maxLength: 15 }),
          email: fc.emailAddress(),
          source: fc.constantFrom('login', 'refresh', 'restore'),
        }),
        { minLength: 1, maxLength: 5 }
      ),
      (listenerConfigs, stateUpdates) => {
        const allReceivedStates: Map<string, AuthState[]> = new Map();

        // Register listeners
        listenerConfigs.forEach(config => {
          allReceivedStates.set(config.id, []);
          
          authStateBroadcastService.addListener({
            id: config.id,
            component: config.component,
            callback: (state: AuthState) => {
              allReceivedStates.get(config.id)!.push({ ...state });
            },
          });
        });

        // Clear initial states
        allReceivedStates.forEach(states => states.length = 0);

        // Apply all state updates
        stateUpdates.forEach((update, index) => {
          const newState: Partial<AuthState> = {
            isAuthenticated: update.isAuthenticated,
            user: update.isAuthenticated ? {
              id: update.userId,
              email: update.email,
            } : undefined,
            tokens: update.isAuthenticated ? {
              accessToken: `token-${index}`,
              idToken: `id-token-${index}`,
              refreshToken: `refresh-token-${index}`,
              expiresAt: Date.now() + 3600000,
            } : undefined,
          };

          authStateBroadcastService.updateAuthState(newState, update.source);
        });

        // Verify all listeners received the same number of updates
        const updateCounts = Array.from(allReceivedStates.values()).map(states => states.length);
        const expectedCount = stateUpdates.length;
        
        updateCounts.forEach(count => {
          expect(count).toBe(expectedCount);
        });

        // Verify state consistency across listeners for each update
        for (let updateIndex = 0; updateIndex < stateUpdates.length; updateIndex++) {
          const statesForUpdate = Array.from(allReceivedStates.values()).map(
            states => states[updateIndex]
          );

          // All listeners should have received the same state
          const firstState = statesForUpdate[0];
          statesForUpdate.forEach(state => {
            expect(state.isAuthenticated).toBe(firstState.isAuthenticated);
            expect(state.sessionId).toBe(firstState.sessionId);
            expect(state.source).toBe(firstState.source);
            expect(state.lastUpdated).toBe(firstState.lastUpdated);
            
            if (state.user && firstState.user) {
              expect(state.user.id).toBe(firstState.user.id);
              expect(state.user.email).toBe(firstState.user.email);
            } else {
              expect(state.user).toBe(firstState.user);
            }
          });
        }
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Event history is maintained correctly
   */
  it('should maintain accurate event history', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          isAuthenticated: fc.boolean(),
          userId: fc.string({ minLength: 1, maxLength: 15 }),
          email: fc.emailAddress(),
          source: fc.constantFrom('login', 'logout', 'refresh', 'restore'),
        }),
        { minLength: 1, maxLength: 10 }
      ),
      (stateUpdates) => {
        // Clear event history
        authStateBroadcastService.clearEventHistory();

        // Apply state updates
        stateUpdates.forEach((update, index) => {
          const newState: Partial<AuthState> = {
            isAuthenticated: update.isAuthenticated,
            user: update.isAuthenticated ? {
              id: update.userId,
              email: update.email,
            } : undefined,
            tokens: update.isAuthenticated ? {
              accessToken: `token-${index}`,
              idToken: `id-token-${index}`,
              refreshToken: `refresh-token-${index}`,
              expiresAt: Date.now() + 3600000,
            } : undefined,
          };

          authStateBroadcastService.updateAuthState(newState, update.source);
        });

        // Get event history
        const eventHistory = authStateBroadcastService.getEventHistory();

        // Verify event count matches updates
        expect(eventHistory).toHaveLength(stateUpdates.length);

        // Verify event details
        eventHistory.forEach((event, index) => {
          expect(event.source).toBe(stateUpdates[index].source);
          expect(event.timestamp).toBeDefined();
          expect(event.currentState).toBeDefined();
          expect(event.type).toBeDefined();
          
          // Verify current state matches expected
          expect(event.currentState.isAuthenticated).toBe(stateUpdates[index].isAuthenticated);
          
          if (stateUpdates[index].isAuthenticated) {
            expect(event.currentState.user).toBeDefined();
            expect(event.currentState.user!.id).toBe(stateUpdates[index].userId);
            expect(event.currentState.user!.email).toBe(stateUpdates[index].email);
          }
        });
      }
    ), { numRuns: 25 });
  });

  /**
   * Property: Listener management works correctly
   */
  it('should handle listener registration and removal correctly', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 15 }),
          component: fc.string({ minLength: 1, maxLength: 10 }),
          shouldRemove: fc.boolean(),
        }),
        { minLength: 1, maxLength: 8 }
      ),
      (listenerConfigs) => {
        const receivedStates: Map<string, number> = new Map();

        // Register all listeners
        listenerConfigs.forEach(config => {
          receivedStates.set(config.id, 0);
          
          authStateBroadcastService.addListener({
            id: config.id,
            component: config.component,
            callback: (state: AuthState) => {
              receivedStates.set(config.id, receivedStates.get(config.id)! + 1);
            },
          });
        });

        // Verify all listeners are registered
        expect(authStateBroadcastService.getListeners()).toHaveLength(listenerConfigs.length);

        // Remove some listeners
        const listenersToRemove = listenerConfigs.filter(config => config.shouldRemove);
        listenersToRemove.forEach(config => {
          const removed = authStateBroadcastService.removeListener(config.id);
          expect(removed).toBe(true);
        });

        // Verify correct number of listeners remain
        const expectedRemainingCount = listenerConfigs.length - listenersToRemove.length;
        expect(authStateBroadcastService.getListeners()).toHaveLength(expectedRemainingCount);

        // Reset counters (excluding initial state notification)
        receivedStates.forEach((_, id) => receivedStates.set(id, 0));

        // Trigger state update
        authStateBroadcastService.updateAuthState({
          isAuthenticated: true,
          user: {
            id: 'test-user',
            email: 'test@example.com',
          },
          tokens: {
            accessToken: 'token',
            idToken: 'id-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 3600000,
          },
        }, 'login');

        // Verify only remaining listeners received the update
        listenerConfigs.forEach(config => {
          const receivedCount = receivedStates.get(config.id)!;
          
          if (config.shouldRemove) {
            expect(receivedCount).toBe(0); // Should not have received update
          } else {
            expect(receivedCount).toBe(1); // Should have received update
          }
        });
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Component listener removal works correctly
   */
  it('should remove all listeners for a component correctly', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 15 }),
          component: fc.string({ minLength: 1, maxLength: 8 }),
        }),
        { minLength: 2, maxLength: 10 }
      ),
      fc.string({ minLength: 1, maxLength: 8 }),
      (listenerConfigs, componentToRemove) => {
        // Register all listeners
        listenerConfigs.forEach(config => {
          authStateBroadcastService.addListener({
            id: config.id,
            component: config.component,
            callback: (state: AuthState) => {
              // Callback implementation
            },
          });
        });

        const initialCount = authStateBroadcastService.getListeners().length;
        expect(initialCount).toBe(listenerConfigs.length);

        // Remove listeners for specific component
        const removedCount = authStateBroadcastService.removeComponentListeners(componentToRemove);

        // Verify correct number removed
        const expectedRemovedCount = listenerConfigs.filter(
          config => config.component === componentToRemove
        ).length;
        expect(removedCount).toBe(expectedRemovedCount);

        // Verify correct number remain
        const remainingCount = authStateBroadcastService.getListeners().length;
        const expectedRemainingCount = listenerConfigs.filter(
          config => config.component !== componentToRemove
        ).length;
        expect(remainingCount).toBe(expectedRemainingCount);

        // Verify remaining listeners are correct
        const remainingListeners = authStateBroadcastService.getListeners();
        remainingListeners.forEach(listener => {
          expect(listener.component).not.toBe(componentToRemove);
        });
      }
    ), { numRuns: 25 });
  });

  /**
   * Property: Statistics are accurate
   */
  it('should provide accurate broadcasting statistics', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 15 }),
          component: fc.string({ minLength: 1, maxLength: 10 }),
        }),
        { minLength: 0, maxLength: 8 }
      ),
      fc.array(
        fc.record({
          isAuthenticated: fc.boolean(),
          source: fc.constantFrom('login', 'logout', 'refresh'),
        }),
        { minLength: 0, maxLength: 5 }
      ),
      (listenerConfigs, stateUpdates) => {
        // Clear state
        authStateBroadcastService.clearEventHistory();
        
        // Register listeners
        listenerConfigs.forEach(config => {
          authStateBroadcastService.addListener({
            id: config.id,
            component: config.component,
            callback: (state: AuthState) => {
              // Callback implementation
            },
          });
        });

        // Apply state updates
        stateUpdates.forEach((update, index) => {
          authStateBroadcastService.updateAuthState({
            isAuthenticated: update.isAuthenticated,
            user: update.isAuthenticated ? {
              id: `user-${index}`,
              email: `user${index}@example.com`,
            } : undefined,
            tokens: update.isAuthenticated ? {
              accessToken: `token-${index}`,
              idToken: `id-token-${index}`,
              refreshToken: `refresh-token-${index}`,
              expiresAt: Date.now() + 3600000,
            } : undefined,
          }, update.source);
        });

        // Get statistics
        const stats = authStateBroadcastService.getStats();

        // Verify statistics accuracy
        expect(stats.listenersCount).toBe(listenerConfigs.length);
        expect(stats.eventHistoryCount).toBe(stateUpdates.length);
        expect(stats.currentState).toBeDefined();
        expect(stats.sessionId).toBeDefined();

        if (stateUpdates.length > 0) {
          expect(stats.lastEventTime).toBeDefined();
          expect(stats.lastEventTime).toBeGreaterThan(0);
        }
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Force broadcast notifies all listeners
   */
  it('should notify all listeners during force broadcast', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 15 }),
          component: fc.string({ minLength: 1, maxLength: 10 }),
        }),
        { minLength: 1, maxLength: 6 }
      ),
      (listenerConfigs) => {
        const broadcastCounts: Map<string, number> = new Map();

        // Register listeners
        listenerConfigs.forEach(config => {
          broadcastCounts.set(config.id, 0);
          
          authStateBroadcastService.addListener({
            id: config.id,
            component: config.component,
            callback: (state: AuthState) => {
              broadcastCounts.set(config.id, broadcastCounts.get(config.id)! + 1);
            },
          });
        });

        // Reset counters (ignore initial notification)
        broadcastCounts.forEach((_, id) => broadcastCounts.set(id, 0));

        // Force broadcast
        authStateBroadcastService.forceBroadcast();

        // Verify all listeners received the broadcast
        broadcastCounts.forEach((count, listenerId) => {
          expect(count).toBe(1);
        });
      }
    ), { numRuns: 25 });
  });
});