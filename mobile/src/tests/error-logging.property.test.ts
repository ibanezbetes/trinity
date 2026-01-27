/**
 * Property-Based Tests for Error Logging Dual Behavior
 * Feature: trinity-voting-fixes, Property 22: Error Logging Dual Behavior
 * Validates: Requirements 9.5
 */

import fc from 'fast-check';
import { errorLoggingService, ErrorContext, UserFriendlyError } from '../services/errorLoggingService';

describe('Error Logging Dual Behavior Property Tests', () => {
  beforeEach(() => {
    // Clear logs before each test
    errorLoggingService.clearLogs();
    
    // Mock console methods to capture detailed logging
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console methods
    jest.restoreAllMocks();
  });

  /**
   * Property 22.1: Dual Logging Behavior
   * For any error and context, the system should log detailed debugging information
   * while generating simple user-friendly messages
   */
  test('Property 22.1: Dual Logging Behavior', async () => {
    await fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 100 }), // String errors
          fc.record({ // Error objects
            name: fc.string({ minLength: 1, maxLength: 20 }),
            message: fc.string({ minLength: 1, maxLength: 100 }),
            stack: fc.option(fc.string({ minLength: 10, maxLength: 200 }))
          })
        ),
        fc.record({
          operation: fc.constantFrom(
            'VOTE_REGISTRATION', 'ROOM_CREATION', 'MEDIA_LOADING', 
            'AUTH_LOGIN', 'STORAGE_SYNC', 'NETWORK_REQUEST'
          ),
          userId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          roomId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          mediaId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          metadata: fc.option(fc.record({
            key1: fc.string(),
            key2: fc.integer(),
            key3: fc.boolean()
          }), { nil: undefined })
        }),
        (errorInput, context) => {
          // Arrange: Create error object
          const error = typeof errorInput === 'string' 
            ? new Error(errorInput)
            : new Error(errorInput.message);
          
          if (typeof errorInput === 'object' && errorInput.stack) {
            error.stack = errorInput.stack;
          }

          // Act: Log the error
          const logEntry = errorLoggingService.logError(error, context);

          // Assert: Detailed logging occurred
          expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('ERROR in'),
            expect.any(Error),
            expect.any(String),
            expect.any(String)
          );

          // Assert: Log entry contains detailed information
          expect(logEntry.id).toBeDefined();
          expect(logEntry.level).toBe('error');
          expect(logEntry.operation).toBe(context.operation);
          expect(logEntry.error).toBe(error);
          expect(logEntry.context).toEqual(expect.objectContaining(context));
          expect(logEntry.timestamp).toBeGreaterThan(0);
          expect(logEntry.stackTrace).toBeDefined();

          // Assert: User-friendly message is simple and actionable
          expect(logEntry.userMessage.message).toBeDefined();
          expect(logEntry.userMessage.message.length).toBeGreaterThan(0);
          expect(logEntry.userMessage.message.length).toBeLessThan(100); // Keep it concise
          expect(typeof logEntry.userMessage.canRetry).toBe('boolean');
          
          // Assert: User message doesn't contain technical details
          expect(logEntry.userMessage.message).not.toContain('Error:');
          expect(logEntry.userMessage.message).not.toContain('stack');
          expect(logEntry.userMessage.message).not.toContain('undefined');
          expect(logEntry.userMessage.message).not.toContain('null');
        }
      ),
      { numRuns: 100, timeout: 5000 }
    );
  });

  /**
   * Property 22.2: Context-Aware User Messages
   * For any operation type, the system should generate contextually appropriate
   * user-friendly messages based on the operation being performed
   */
  test('Property 22.2: Context-Aware User Messages', async () => {
    await fc.assert(
      fc.property(
        fc.constantFrom(
          'VOTE_REGISTRATION', 'ROOM_CREATION', 'ROOM_JOIN', 'MEDIA_LOADING',
          'AUTH_LOGIN', 'STORAGE_SYNC', 'NETWORK_REQUEST'
        ),
        fc.string({ minLength: 1, maxLength: 50 }),
        (operation, errorMessage) => {
          // Arrange: Create context for specific operation
          const context: ErrorContext = {
            operation,
            roomId: 'test-room',
            userId: 'test-user'
          };

          // Act: Log error for this operation
          const logEntry = errorLoggingService.logError(errorMessage, context);

          // Assert: User message is contextually appropriate
          const userMessage = logEntry.userMessage.message.toLowerCase();
          
          if (operation.includes('VOTE')) {
            expect(userMessage).toMatch(/vote|voting|register/);
          } else if (operation.includes('ROOM')) {
            expect(userMessage).toMatch(/room|join|create/);
          } else if (operation.includes('MEDIA')) {
            expect(userMessage).toMatch(/content|loading|movie|trouble/);
          } else if (operation.includes('AUTH')) {
            expect(userMessage).toMatch(/sign|login|auth/);
          } else if (operation.includes('STORAGE')) {
            expect(userMessage).toMatch(/sync|data/);
          } else if (operation.includes('NETWORK')) {
            expect(userMessage).toMatch(/connection|network|queue|something|wrong/);
          } else {
            // Generic fallback should contain "something went wrong" or similar
            expect(userMessage).toMatch(/something|wrong|try|again/);
          }

          // Assert: Action suggestion is provided when appropriate
          if (logEntry.userMessage.canRetry) {
            expect(logEntry.userMessage.action).toBeDefined();
            expect(logEntry.userMessage.action!.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 50, timeout: 5000 }
    );
  });

  /**
   * Property 22.3: Network Error Detection
   * For any error message containing network-related keywords,
   * the system should generate appropriate network error messages
   */
  test('Property 22.3: Network Error Detection', async () => {
    await fc.assert(
      fc.property(
        fc.constantFrom(
          'network error occurred', 'connection timeout', 'fetch failed',
          'no internet connection', 'request failed', 'offline mode',
          'connectivity issue', 'unreachable server'
        ),
        fc.constantFrom('VOTE_REGISTRATION', 'ROOM_CREATION', 'MEDIA_LOADING'),
        (networkErrorMessage, operation) => {
          // Arrange: Create network-related error
          const context: ErrorContext = { operation };

          // Act: Log network error
          const logEntry = errorLoggingService.logError(networkErrorMessage, context);

          // Assert: Network-specific user message generated
          const userMessage = logEntry.userMessage.message.toLowerCase();
          expect(userMessage).toMatch(/connection|network|queue|offline/);
          
          // Assert: Appropriate action suggested
          expect(logEntry.userMessage.action).toContain('connection');
          expect(logEntry.userMessage.canRetry).toBe(true);
        }
      ),
      { numRuns: 30, timeout: 5000 }
    );
  });

  /**
   * Property 22.4: Log Storage and Retrieval
   * For any sequence of logged errors, the system should store them correctly
   * and allow retrieval by various criteria
   */
  test('Property 22.4: Log Storage and Retrieval', async () => {
    await fc.assert(
      fc.property(
        fc.array(
          fc.record({
            error: fc.string({ minLength: 1, maxLength: 50 }),
            operation: fc.constantFrom(
              'VOTE_REGISTRATION', 'ROOM_CREATION', 'MEDIA_LOADING'
            ),
            level: fc.constantFrom('error', 'warning', 'info')
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (logEntries) => {
          // Arrange: Clear existing logs
          errorLoggingService.clearLogs();

          // Act: Log all entries
          const loggedEntries = logEntries.map(entry => {
            const context: ErrorContext = { operation: entry.operation };
            
            switch (entry.level) {
              case 'error':
                return errorLoggingService.logError(entry.error, context);
              case 'warning':
                return errorLoggingService.logWarning(entry.error, context);
              case 'info':
                return errorLoggingService.logInfo(entry.error, context);
              default:
                return errorLoggingService.logError(entry.error, context);
            }
          });

          // Assert: All logs stored correctly
          const recentLogs = errorLoggingService.getRecentLogs(logEntries.length);
          expect(recentLogs).toHaveLength(logEntries.length);

          // Assert: Logs can be retrieved by operation
          const uniqueOperations = [...new Set(logEntries.map(e => e.operation))];
          uniqueOperations.forEach(operation => {
            const operationLogs = errorLoggingService.getLogsByOperation(operation);
            const expectedCount = logEntries.filter(e => e.operation === operation).length;
            expect(operationLogs).toHaveLength(expectedCount);
          });

          // Assert: Error statistics are accurate
          const stats = errorLoggingService.getErrorStats();
          const expectedErrors = logEntries.filter(e => e.level === 'error').length;
          const expectedWarnings = logEntries.filter(e => e.level === 'warning').length;
          const expectedInfo = logEntries.filter(e => e.level === 'info').length;
          
          expect(stats.totalErrors).toBe(expectedErrors);
          expect(stats.totalWarnings).toBe(expectedWarnings);
          expect(stats.totalInfo).toBe(expectedInfo);
        }
      ),
      { numRuns: 30, timeout: 5000 }
    );
  });

  /**
   * Property 22.5: User Message Override Behavior
   * For any error with custom user message override, the system should use
   * the override while still logging detailed technical information
   */
  test('Property 22.5: User Message Override Behavior', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.record({
          operation: fc.constantFrom('VOTE_REGISTRATION', 'ROOM_CREATION'),
        }),
        fc.record({
          message: fc.string({ minLength: 1, maxLength: 100 }),
          action: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          canRetry: fc.boolean()
        }),
        (errorMessage, context, userMessageOverride) => {
          // Act: Log error with user message override
          const logEntry = errorLoggingService.logError(
            errorMessage, 
            context, 
            userMessageOverride
          );

          // Assert: Override message is used
          expect(logEntry.userMessage.message).toBe(userMessageOverride.message);
          expect(logEntry.userMessage.canRetry).toBe(userMessageOverride.canRetry);
          
          if (userMessageOverride.action) {
            expect(logEntry.userMessage.action).toBe(userMessageOverride.action);
          }

          // Assert: Technical details still logged
          expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('ERROR in'),
            expect.any(Error),
            expect.any(String),
            expect.any(String)
          );

          // Assert: Original error preserved in log entry
          expect(logEntry.error).toBeInstanceOf(Error);
          expect((logEntry.error as Error).message).toBe(errorMessage);
        }
      ),
      { numRuns: 50, timeout: 5000 }
    );
  });

  /**
   * Property 22.6: Log Storage Consistency
   * For any number of log entries, the system should store them consistently
   * and maintain proper ordering for retrieval
   */
  test('Property 22.6: Log Storage Consistency', async () => {
    await fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }), // Number of logs to create (more than typical limit)
        (numLogs) => {
          // Arrange: Clear logs and create many entries
          errorLoggingService.clearLogs();
          
          // Act: Create logs
          const loggedEntries = [];
          for (let i = 0; i < numLogs; i++) {
            const entry = errorLoggingService.logError(
              `Test error ${i}`,
              { operation: 'TEST_OPERATION' }
            );
            loggedEntries.push(entry);
          }

          // Assert: Service stores all logs (it has a high limit of 1000)
          const recentLogs = errorLoggingService.getRecentLogs(numLogs);
          expect(recentLogs.length).toBe(numLogs);

          // Assert: Most recent logs are preserved in correct order
          const expectedRecentIds = loggedEntries.map(e => e.id);
          const actualRecentIds = recentLogs.map(e => e.id);
          expect(actualRecentIds).toEqual(expectedRecentIds);
        }
      ),
      { numRuns: 20, timeout: 5000 }
    );
  });

  /**
   * Property 22.7: Error Listener Notification
   * For any error logged, all registered listeners should be notified
   * with the complete log entry information
   */
  test('Property 22.7: Error Listener Notification', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.constantFrom('VOTE_REGISTRATION', 'ROOM_CREATION', 'MEDIA_LOADING'),
        fc.integer({ min: 1, max: 3 }), // Number of listeners
        (errorMessage, operation, numListeners) => {
          // Arrange: Register multiple listeners
          const listeners = Array.from({ length: numListeners }, () => jest.fn());
          const unsubscribeFunctions = listeners.map(listener => 
            errorLoggingService.addErrorListener(listener)
          );

          try {
            // Act: Log an error
            const logEntry = errorLoggingService.logError(
              errorMessage,
              { operation }
            );

            // Assert: All listeners were called
            listeners.forEach(listener => {
              expect(listener).toHaveBeenCalledTimes(1);
              expect(listener).toHaveBeenCalledWith(logEntry);
            });

            // Assert: Listener receives complete log entry
            const receivedEntry = listeners[0].mock.calls[0][0];
            expect(receivedEntry.id).toBe(logEntry.id);
            expect(receivedEntry.level).toBe(logEntry.level);
            expect(receivedEntry.operation).toBe(logEntry.operation);
            expect(receivedEntry.userMessage).toEqual(logEntry.userMessage);

          } finally {
            // Cleanup: Unsubscribe all listeners
            unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
          }
        }
      ),
      { numRuns: 30, timeout: 5000 }
    );
  });
});