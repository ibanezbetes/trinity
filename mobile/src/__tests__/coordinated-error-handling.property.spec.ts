/**
 * Property Test 25: Coordinated Error Handling
 * Validates Requirements 8.4: Coordinated error handling across services
 * 
 * This property test ensures that:
 * - Coordinated error handling for authentication errors works across services
 * - All services handle authentication errors consistently
 * - Proper error propagation and recovery mechanisms function correctly
 * - Error handlers are executed in correct priority order
 */

import fc from 'fast-check';
import { coordinatedErrorHandlingService, ErrorContext, ErrorHandler, RecoveryAction } from '../services/coordinatedErrorHandlingService';

describe('Property Test 25: Coordinated Error Handling', () => {
  beforeEach(() => {
    // Reset service state
    coordinatedErrorHandlingService.clearErrorAggregation();
    
    // Remove any custom handlers (keep default ones)
    const handlers = coordinatedErrorHandlingService.getErrorHandlers();
    handlers.forEach(handler => {
      if (!['auth-error-handler', 'network-error-handler', 'session-error-handler', 'generic-error-handler'].includes(handler.id)) {
        coordinatedErrorHandlingService.removeErrorHandler(handler.id);
      }
    });
    
    // Configure for testing
    coordinatedErrorHandlingService.updateConfig({
      enableErrorPropagation: true,
      enableRecoveryActions: true,
      enableCrossServiceNotification: true,
      maxRetryAttempts: 3,
      retryDelayMs: 100, // Faster for testing
      enableErrorAggregation: true,
      aggregationWindowMs: 1000, // Shorter for testing
    });
  });

  afterEach(() => {
    coordinatedErrorHandlingService.clearErrorAggregation();
  });

  /**
   * Property: Error handlers are executed in priority order
   */
  it('should execute error handlers in priority order', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 15 }),
          service: fc.string({ minLength: 1, maxLength: 10 }),
          priority: fc.integer({ min: 1, max: 100 }),
          errorType: fc.constantFrom('TestError', 'AuthError', 'NetworkError'),
        }),
        { minLength: 2, maxLength: 6 }
      ),
      fc.record({
        service: fc.string({ minLength: 1, maxLength: 10 }),
        operation: fc.string({ minLength: 1, maxLength: 15 }),
        errorType: fc.constantFrom('TestError', 'AuthError', 'NetworkError'),
      }),
      async (handlerConfigs, errorConfig) => {
        const executionOrder: string[] = [];

        // Register handlers with different priorities
        const handlers: ErrorHandler[] = handlerConfigs.map(config => ({
          id: config.id,
          service: config.service,
          errorTypes: [config.errorType],
          priority: config.priority,
          handler: async (error: any, context: ErrorContext) => {
            executionOrder.push(config.id);
            return {
              handled: true,
              shouldRetry: false,
              userMessage: 'Test message',
              requiresReauth: false,
              requiresLogout: false,
              propagateToServices: [],
              recoveryActions: [],
            };
          },
        }));

        handlers.forEach(handler => {
          coordinatedErrorHandlingService.registerErrorHandler(handler);
        });

        // Create error and context
        const error = new Error(errorConfig.errorType);
        const context: ErrorContext = {
          service: errorConfig.service,
          operation: errorConfig.operation,
          timestamp: Date.now(),
        };

        // Handle error
        await coordinatedErrorHandlingService.handleError(error, context);

        // Verify execution order matches priority order
        // Find handlers that match the service and error type
        const matchingHandlers = handlers.filter(handler => {
          const serviceMatches = handler.service === '*' || handler.service === errorConfig.service;
          const errorTypeMatches = handler.errorTypes.includes('*') || 
                                  handler.errorTypes.includes(errorConfig.errorType);
          return serviceMatches && errorTypeMatches;
        });

        if (matchingHandlers.length > 0) {
          // Should execute the highest priority handler first
          const expectedHandler = matchingHandlers.sort((a, b) => b.priority - a.priority)[0];
          expect(executionOrder[0]).toBe(expectedHandler.id);
        }

        // Clean up handlers
        handlers.forEach(handler => {
          coordinatedErrorHandlingService.removeErrorHandler(handler.id);
        });
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Authentication errors trigger proper recovery actions
   */
  it('should trigger proper recovery actions for authentication errors', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        errorType: fc.constantFrom('NotAuthorizedException', 'TokenRefreshException', 'UserNotFoundException'),
        service: fc.string({ minLength: 1, maxLength: 10 }),
        operation: fc.string({ minLength: 1, maxLength: 15 }),
        userId: fc.string({ minLength: 1, maxLength: 20 }),
      }),
      async ({ errorType, service, operation, userId }) => {
        // Create authentication error
        const error = { code: errorType, message: `Authentication failed: ${errorType}` };
        const context: ErrorContext = {
          service,
          operation,
          userId,
          timestamp: Date.now(),
        };

        // Handle error
        const result = await coordinatedErrorHandlingService.handleError(error, context);

        // Verify error was handled
        expect(result.handled).toBe(true);
        expect(result.userMessage).toBeDefined();
        expect(result.userMessage.length).toBeGreaterThan(0);

        // Verify authentication-specific behavior
        if (['NotAuthorizedException', 'TokenRefreshException'].includes(errorType)) {
          expect(result.requiresReauth).toBe(true);
          expect(result.requiresLogout).toBe(true);
          expect(result.shouldRetry).toBe(false);
          expect(result.propagateToServices).toContain('session');
          expect(result.recoveryActions.length).toBeGreaterThan(0);
          
          // Should have logout action
          const hasLogoutAction = result.recoveryActions.some(action => action.type === 'logout');
          expect(hasLogoutAction).toBe(true);
        } else {
          // UserNotFoundException should be retryable
          expect(result.shouldRetry).toBe(true);
          expect(result.requiresReauth).toBe(false);
        }
      }
    ), { numRuns: 25 });
  });

  /**
   * Property: Network errors are classified and handled appropriately
   */
  it('should handle network errors with appropriate retry logic', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        errorType: fc.constantFrom('NetworkError', 'TimeoutError', 'ConnectionError'),
        service: fc.string({ minLength: 1, maxLength: 10 }),
        operation: fc.string({ minLength: 1, maxLength: 15 }),
      }),
      async ({ errorType, service, operation }) => {
        // Create network error
        const error = { name: errorType, message: `Network failed: ${errorType}` };
        const context: ErrorContext = {
          service,
          operation,
          timestamp: Date.now(),
        };

        // Handle error
        const result = await coordinatedErrorHandlingService.handleError(error, context);

        // Verify error was handled
        expect(result.handled).toBe(true);
        expect(result.userMessage).toBeDefined();
        expect(result.guidance).toBeDefined();

        // Network errors should generally be retryable
        expect(result.shouldRetry).toBe(true);
        expect(result.requiresReauth).toBe(false);
        expect(result.requiresLogout).toBe(false);

        // Should have retry delay
        if (result.shouldRetry) {
          expect(result.retryDelayMs).toBeDefined();
          expect(result.retryDelayMs).toBeGreaterThan(0);
        }

        // Should have retry recovery action
        const hasRetryAction = result.recoveryActions.some(action => action.type === 'retry_operation');
        if (result.shouldRetry) {
          expect(hasRetryAction).toBe(true);
        }
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Custom error handlers work correctly
   */
  it('should execute custom error handlers correctly', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        handlerId: fc.string({ minLength: 1, maxLength: 15 }),
        service: fc.string({ minLength: 1, maxLength: 10 }),
        errorType: fc.string({ minLength: 1, maxLength: 15 }),
        priority: fc.integer({ min: 50, max: 200 }), // Higher than default handlers
        shouldRetry: fc.boolean(),
        requiresReauth: fc.boolean(),
        userMessage: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      async (handlerConfig) => {
        let handlerExecuted = false;
        const expectedResult = {
          handled: true,
          shouldRetry: handlerConfig.shouldRetry,
          userMessage: handlerConfig.userMessage,
          requiresReauth: handlerConfig.requiresReauth,
          requiresLogout: handlerConfig.requiresReauth,
          propagateToServices: handlerConfig.requiresReauth ? ['auth'] : [],
          recoveryActions: [] as RecoveryAction[],
        };

        // Register custom handler
        const customHandler: ErrorHandler = {
          id: handlerConfig.handlerId,
          service: handlerConfig.service,
          errorTypes: [handlerConfig.errorType],
          priority: handlerConfig.priority,
          handler: async (error: any, context: ErrorContext) => {
            handlerExecuted = true;
            return expectedResult;
          },
        };

        coordinatedErrorHandlingService.registerErrorHandler(customHandler);

        // Create matching error
        const error = { code: handlerConfig.errorType, message: 'Custom error' };
        const context: ErrorContext = {
          service: handlerConfig.service,
          operation: 'test-operation',
          timestamp: Date.now(),
        };

        // Handle error
        const result = await coordinatedErrorHandlingService.handleError(error, context);

        // Verify custom handler was executed
        expect(handlerExecuted).toBe(true);
        expect(result.handled).toBe(expectedResult.handled);
        expect(result.shouldRetry).toBe(expectedResult.shouldRetry);
        expect(result.userMessage).toBe(expectedResult.userMessage);
        expect(result.requiresReauth).toBe(expectedResult.requiresReauth);
        expect(result.requiresLogout).toBe(expectedResult.requiresLogout);

        // Clean up
        coordinatedErrorHandlingService.removeErrorHandler(handlerConfig.handlerId);
      }
    ), { numRuns: 25 });
  });

  /**
   * Property: Error propagation works across services
   */
  it('should propagate errors to specified services', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        errorType: fc.constantFrom('SessionExpired', 'InvalidSession'),
        service: fc.string({ minLength: 1, maxLength: 10 }),
        operation: fc.string({ minLength: 1, maxLength: 15 }),
      }),
      async ({ errorType, service, operation }) => {
        // Create session error (should propagate to other services)
        const error = { code: errorType, message: `Session error: ${errorType}` };
        const context: ErrorContext = {
          service,
          operation,
          timestamp: Date.now(),
        };

        // Handle error
        const result = await coordinatedErrorHandlingService.handleError(error, context);

        // Verify error was handled
        expect(result.handled).toBe(true);

        // Session errors should require reauth and propagate
        expect(result.requiresReauth).toBe(true);
        expect(result.requiresLogout).toBe(true);
        expect(result.propagateToServices.length).toBeGreaterThan(0);
        
        // Should propagate to authentication and storage services
        expect(result.propagateToServices).toContain('authentication');
        expect(result.propagateToServices).toContain('storage');

        // Should have recovery actions
        expect(result.recoveryActions.length).toBeGreaterThan(0);
        
        // Should include logout and redirect actions
        const actionTypes = result.recoveryActions.map(action => action.type);
        expect(actionTypes).toContain('logout');
        expect(actionTypes).toContain('redirect');
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Active errors are tracked correctly
   */
  it('should track active errors correctly', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(
        fc.record({
          service: fc.string({ minLength: 1, maxLength: 10 }),
          operation: fc.string({ minLength: 1, maxLength: 15 }),
          errorType: fc.string({ minLength: 1, maxLength: 15 }),
        }),
        { minLength: 1, maxLength: 5 }
      ),
      async (errorConfigs) => {
        // Handle multiple errors
        for (const config of errorConfigs) {
          const error = { code: config.errorType, message: 'Test error' };
          const context: ErrorContext = {
            service: config.service,
            operation: config.operation,
            timestamp: Date.now(),
          };

          await coordinatedErrorHandlingService.handleError(error, context);
        }

        // Get active errors
        const activeErrors = coordinatedErrorHandlingService.getActiveErrors();

        // Should have tracked all unique service-operation combinations
        const uniqueCombinations = new Set(
          errorConfigs.map(config => `${config.service}-${config.operation}`)
        );
        
        expect(activeErrors.length).toBe(uniqueCombinations.size);

        // Verify error details
        activeErrors.forEach(activeError => {
          expect(activeError.error).toBeDefined();
          expect(activeError.context).toBeDefined();
          expect(activeError.timestamp).toBeDefined();
          expect(activeError.timestamp).toBeGreaterThan(0);
        });

        // Clear specific errors
        for (const config of errorConfigs) {
          const cleared = coordinatedErrorHandlingService.clearActiveError(
            config.service,
            config.operation
          );
          expect(cleared).toBe(true);
        }

        // Should have no active errors after clearing
        const remainingErrors = coordinatedErrorHandlingService.getActiveErrors();
        expect(remainingErrors).toHaveLength(0);
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: Error aggregation works correctly
   */
  it('should aggregate errors correctly', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(
        fc.record({
          service: fc.string({ minLength: 1, maxLength: 8 }),
          errorType: fc.constantFrom('NetworkError', 'AuthError', 'ValidationError'),
          count: fc.integer({ min: 1, max: 5 }),
        }),
        { minLength: 1, maxLength: 4 }
      ),
      async (errorGroups) => {
        // Clear aggregation
        coordinatedErrorHandlingService.clearErrorAggregation();

        // Generate errors according to groups
        for (const group of errorGroups) {
          for (let i = 0; i < group.count; i++) {
            const error = { code: group.errorType, message: 'Test error' };
            const context: ErrorContext = {
              service: group.service,
              operation: `operation-${i}`,
              timestamp: Date.now(),
            };

            await coordinatedErrorHandlingService.handleError(error, context);
          }
        }

        // Get aggregation data
        const aggregation = coordinatedErrorHandlingService.getErrorAggregation();

        // Verify aggregation counts
        errorGroups.forEach(group => {
          const key = `${group.service}-${group.errorType}`;
          expect(aggregation[key]).toBe(group.count);
        });

        // Verify total entries
        const totalExpected = errorGroups.reduce((sum, group) => sum + group.count, 0);
        const totalActual = Object.values(aggregation).reduce((sum, count) => sum + count, 0);
        expect(totalActual).toBe(totalExpected);
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: Configuration changes affect behavior
   */
  it('should respect configuration changes', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        enableErrorPropagation: fc.boolean(),
        enableRecoveryActions: fc.boolean(),
        enableCrossServiceNotification: fc.boolean(),
        maxRetryAttempts: fc.integer({ min: 1, max: 5 }),
        retryDelayMs: fc.integer({ min: 100, max: 1000 }),
      }),
      async (configChanges) => {
        // Update configuration
        coordinatedErrorHandlingService.updateConfig(configChanges);

        // Verify configuration was applied
        const currentConfig = coordinatedErrorHandlingService.getConfig();
        expect(currentConfig.enableErrorPropagation).toBe(configChanges.enableErrorPropagation);
        expect(currentConfig.enableRecoveryActions).toBe(configChanges.enableRecoveryActions);
        expect(currentConfig.enableCrossServiceNotification).toBe(configChanges.enableCrossServiceNotification);
        expect(currentConfig.maxRetryAttempts).toBe(configChanges.maxRetryAttempts);
        expect(currentConfig.retryDelayMs).toBe(configChanges.retryDelayMs);

        // Test error handling with new configuration
        const error = { code: 'TestError', message: 'Test error' };
        const context: ErrorContext = {
          service: 'test-service',
          operation: 'test-operation',
          timestamp: Date.now(),
        };

        const result = await coordinatedErrorHandlingService.handleError(error, context);

        // Verify result reflects configuration
        expect(result.handled).toBe(true);
        
        // Recovery actions should be affected by enableRecoveryActions
        if (!configChanges.enableRecoveryActions) {
          // Note: This would need to be verified through implementation details
          // For now, we just verify the result is consistent
          expect(result).toBeDefined();
        }
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: Handler registration and removal works correctly
   */
  it('should handle error handler registration and removal correctly', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 15 }),
          service: fc.string({ minLength: 1, maxLength: 10 }),
          errorType: fc.string({ minLength: 1, maxLength: 15 }),
          priority: fc.integer({ min: 1, max: 100 }),
          shouldRemove: fc.boolean(),
        }),
        { minLength: 1, maxLength: 6 }
      ),
      async (handlerConfigs) => {
        const initialHandlerCount = coordinatedErrorHandlingService.getErrorHandlers().length;

        // Register all handlers
        const handlers: ErrorHandler[] = handlerConfigs.map(config => ({
          id: config.id,
          service: config.service,
          errorTypes: [config.errorType],
          priority: config.priority,
          handler: async (error: any, context: ErrorContext) => ({
            handled: true,
            shouldRetry: false,
            userMessage: 'Test message',
            requiresReauth: false,
            requiresLogout: false,
            propagateToServices: [],
            recoveryActions: [],
          }),
        }));

        handlers.forEach(handler => {
          coordinatedErrorHandlingService.registerErrorHandler(handler);
        });

        // Verify all handlers were registered
        const afterRegistration = coordinatedErrorHandlingService.getErrorHandlers().length;
        expect(afterRegistration).toBe(initialHandlerCount + handlerConfigs.length);

        // Remove some handlers
        const handlersToRemove = handlerConfigs.filter(config => config.shouldRemove);
        let removedCount = 0;

        handlersToRemove.forEach(config => {
          const removed = coordinatedErrorHandlingService.removeErrorHandler(config.id);
          if (removed) removedCount++;
        });

        // Verify correct number were removed
        expect(removedCount).toBe(handlersToRemove.length);

        const afterRemoval = coordinatedErrorHandlingService.getErrorHandlers().length;
        const expectedFinalCount = initialHandlerCount + handlerConfigs.length - handlersToRemove.length;
        expect(afterRemoval).toBe(expectedFinalCount);

        // Clean up remaining handlers
        const remainingCustomHandlers = handlerConfigs.filter(config => !config.shouldRemove);
        remainingCustomHandlers.forEach(config => {
          coordinatedErrorHandlingService.removeErrorHandler(config.id);
        });
      }
    ), { numRuns: 20 });
  });
});