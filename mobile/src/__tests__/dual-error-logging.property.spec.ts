/**
 * Property Test 21: Dual Error Logging
 * Validates Requirements 7.5: Dual error logging system with data sanitization
 * 
 * This property test ensures that:
 * - Detailed error logging works for debugging purposes
 * - Sensitive data (passwords, tokens) is never logged in plain text
 * - User-friendly error messages are separate from debug logs
 * - Dual logging system maintains data integrity and security
 */

import fc from 'fast-check';
import { loggingService } from '../services/loggingService';

describe('Property Test 21: Dual Error Logging', () => {
  beforeEach(() => {
    // Reset logging service state
    loggingService.clearLogs();
    loggingService.clearUserFriendlyLogs();
    
    // Configure for testing
    loggingService.updateConfig({
      enableUserFriendlyMessages: true,
      enableTechnicalLogging: true,
      separateUserLogs: true,
      sanitizeSensitiveData: true,
      logToConsole: false, // Disable console output during tests
      logToStorage: true,
    });
  });

  afterEach(() => {
    loggingService.clearLogs();
    loggingService.clearUserFriendlyLogs();
  });

  /**
   * Property: Sensitive data is always sanitized in logs
   */
  it('should sanitize sensitive data in all log entries', () => {
    fc.assert(fc.property(
      fc.record({
        category: fc.string({ minLength: 1, maxLength: 50 }),
        message: fc.string({ minLength: 1, maxLength: 200 }),
        sensitiveData: fc.oneof(
          fc.constant('password=secret123'),
          fc.constant('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'),
          fc.constant('{"accessToken": "abc123", "refreshToken": "def456"}'),
          fc.constant('Authorization: Bearer token123'),
          fc.constant('user@example.com with password mypassword'),
          fc.constant('{"password": "secret", "email": "test@test.com"}'),
        ),
        userMessage: fc.string({ minLength: 1, maxLength: 100 }),
      }),
      ({ category, message, sensitiveData, userMessage }) => {
        // Log error with sensitive data
        const messageWithSensitive = `${message} ${sensitiveData}`;
        
        loggingService.logDualError(
          category,
          messageWithSensitive,
          { sensitiveField: sensitiveData },
          userMessage
        );

        // Get technical logs
        const technicalLogs = loggingService.getTechnicalLogs(1);
        expect(technicalLogs).toHaveLength(1);

        const logEntry = technicalLogs[0];

        // Verify sensitive data is sanitized in message
        expect(logEntry.message).not.toContain('secret123');
        expect(logEntry.message).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
        expect(logEntry.message).not.toContain('abc123');
        expect(logEntry.message).not.toContain('def456');
        expect(logEntry.message).not.toContain('token123');
        expect(logEntry.message).not.toContain('mypassword');
        expect(logEntry.message).not.toContain('test@test.com');

        // Verify sensitive data is sanitized in technical details
        if (logEntry.technicalDetails) {
          const technicalStr = JSON.stringify(logEntry.technicalDetails);
          expect(technicalStr).not.toContain('secret123');
          expect(technicalStr).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
          expect(technicalStr).not.toContain('abc123');
          expect(technicalStr).not.toContain('def456');
          expect(technicalStr).not.toContain('token123');
          expect(technicalStr).not.toContain('mypassword');
        }

        // Verify sanitization flag is set when sensitive data was present
        expect(logEntry.sanitized).toBe(true);

        // Verify user-friendly message is preserved (should not contain sensitive data)
        expect(logEntry.userFriendlyMessage).toBe(userMessage);
      }
    ), { numRuns: 50 });
  });

  /**
   * Property: Dual logging maintains separate technical and user-friendly logs
   */
  it('should maintain separate technical and user-friendly logs', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          category: fc.string({ minLength: 1, maxLength: 30 }),
          technicalMessage: fc.string({ minLength: 1, maxLength: 100 }),
          userMessage: fc.string({ minLength: 1, maxLength: 50 }),
          level: fc.constantFrom('error', 'warn', 'info'),
        }),
        { minLength: 1, maxLength: 10 }
      ),
      (logEntries) => {
        // Log all entries
        logEntries.forEach(({ category, technicalMessage, userMessage, level }) => {
          if (level === 'error') {
            loggingService.logDualError(category, technicalMessage, {}, userMessage);
          } else if (level === 'warn') {
            loggingService.logDualWarning(category, technicalMessage, {}, userMessage);
          } else {
            loggingService.logDualInfo(category, technicalMessage, {}, userMessage);
          }
        });

        // Get both types of logs
        const technicalLogs = loggingService.getTechnicalLogs(logEntries.length);
        const userFriendlyLogs = loggingService.getUserFriendlyLogs(logEntries.length);

        // Verify counts match
        expect(technicalLogs).toHaveLength(logEntries.length);
        expect(userFriendlyLogs).toHaveLength(logEntries.length);

        // Verify technical logs contain technical details
        technicalLogs.forEach((log, index) => {
          expect(log.message).toBe(logEntries[index].technicalMessage);
          expect(log.userFriendlyMessage).toBe(logEntries[index].userMessage);
          expect(log.category).toBe(logEntries[index].category);
          expect(log.level).toBe(logEntries[index].level);
        });

        // Verify user-friendly logs contain only user messages
        userFriendlyLogs.forEach((log, index) => {
          expect(log.userMessage).toBe(logEntries[index].userMessage);
          expect(log.category).toBe(logEntries[index].category);
          expect(log.level).toBe(logEntries[index].level);
          // Should not contain technical details
          expect(log.userMessage).not.toContain('stack');
          expect(log.userMessage).not.toContain('trace');
        });
      }
    ), { numRuns: 30 });
  });

  /**
   * Property: Log entries always have required metadata
   */
  it('should include required metadata in all log entries', () => {
    fc.assert(fc.property(
      fc.record({
        category: fc.string({ minLength: 1, maxLength: 50 }),
        message: fc.string({ minLength: 1, maxLength: 200 }),
        data: fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.object(),
          fc.string(),
          fc.integer(),
        ),
        userMessage: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
      }),
      ({ category, message, data, userMessage }) => {
        loggingService.logDualError(category, message, data, userMessage);

        const logs = loggingService.getTechnicalLogs(1);
        expect(logs).toHaveLength(1);

        const logEntry = logs[0];

        // Verify required metadata
        expect(logEntry.timestamp).toBeDefined();
        expect(logEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO format
        expect(logEntry.level).toBe('error');
        expect(logEntry.category).toBe(category);
        expect(logEntry.message).toBeDefined();
        expect(logEntry.sessionId).toBeDefined();
        expect(logEntry.sessionId).toMatch(/^[a-z0-9]+-[a-z0-9]+$/); // Session ID format
        expect(logEntry.buildVersion).toBeDefined();
        expect(logEntry.platform).toBeDefined();
        expect(typeof logEntry.sanitized).toBe('boolean');

        // Verify user-friendly message if provided
        if (userMessage) {
          expect(logEntry.userFriendlyMessage).toBe(userMessage);
        }
      }
    ), { numRuns: 50 });
  });

  /**
   * Property: Configuration changes affect logging behavior
   */
  it('should respect configuration changes for dual logging', () => {
    fc.assert(fc.property(
      fc.record({
        enableUserFriendlyMessages: fc.boolean(),
        enableTechnicalLogging: fc.boolean(),
        separateUserLogs: fc.boolean(),
        sanitizeSensitiveData: fc.boolean(),
        category: fc.string({ minLength: 1, maxLength: 30 }),
        message: fc.string({ minLength: 1, maxLength: 100 }),
        userMessage: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      ({ enableUserFriendlyMessages, enableTechnicalLogging, separateUserLogs, sanitizeSensitiveData, category, message, userMessage }) => {
        // Update configuration
        loggingService.updateConfig({
          enableUserFriendlyMessages,
          enableTechnicalLogging,
          separateUserLogs,
          sanitizeSensitiveData,
          logToStorage: true, // Always enable storage for testing
        });

        // Clear logs before test
        loggingService.clearLogs();
        loggingService.clearUserFriendlyLogs();

        // Log with sensitive data
        const sensitiveMessage = `${message} password=secret123`;
        loggingService.logDualError(category, sensitiveMessage, {}, userMessage);

        const technicalLogs = loggingService.getTechnicalLogs(10);
        const userFriendlyLogs = loggingService.getUserFriendlyLogs(10);

        // Verify technical logging behavior
        if (enableTechnicalLogging) {
          expect(technicalLogs.length).toBeGreaterThan(0);
          const logEntry = technicalLogs[technicalLogs.length - 1]; // Get the last entry (our test entry)
          
          if (sanitizeSensitiveData) {
            expect(logEntry.message).not.toContain('secret123');
          } else {
            expect(logEntry.message).toContain('secret123');
          }

          if (enableUserFriendlyMessages) {
            expect(logEntry.userFriendlyMessage).toBe(userMessage);
          }
        }

        // Verify user-friendly logging behavior
        if (enableUserFriendlyMessages && separateUserLogs) {
          expect(userFriendlyLogs.length).toBeGreaterThan(0);
          const userLog = userFriendlyLogs[userFriendlyLogs.length - 1];
          expect(userLog.userMessage).toBe(userMessage);
        }
      }
    ), { numRuns: 30 });
  });

  /**
   * Property: Log truncation works correctly for large messages
   */
  it('should truncate large messages and data appropriately', () => {
    fc.assert(fc.property(
      fc.record({
        category: fc.string({ minLength: 1, maxLength: 30 }),
        longMessage: fc.string({ minLength: 3000, maxLength: 5000 }), // Exceeds MAX_MESSAGE_LENGTH
        longUserMessage: fc.string({ minLength: 300, maxLength: 500 }), // Exceeds maxUserMessageLength
        largeData: fc.object({ maxDepth: 5 }), // Large object
      }),
      ({ category, longMessage, longUserMessage, largeData }) => {
        loggingService.logDualError(category, longMessage, largeData, longUserMessage);

        const technicalLogs = loggingService.getTechnicalLogs(1);
        const userFriendlyLogs = loggingService.getUserFriendlyLogs(1);

        expect(technicalLogs).toHaveLength(1);
        expect(userFriendlyLogs).toHaveLength(1);

        const technicalLog = technicalLogs[0];
        const userLog = userFriendlyLogs[0];

        // Verify message truncation (MAX_MESSAGE_LENGTH = 2000)
        expect(technicalLog.message.length).toBeLessThanOrEqual(2000);
        if (longMessage.length > 2000) {
          expect(technicalLog.message).toContain('[TRUNCATED]');
        }

        // Verify user message truncation (maxUserMessageLength = 200)
        expect(userLog.userMessage.length).toBeLessThanOrEqual(200);
        if (longUserMessage.length > 200) {
          expect(userLog.userMessage).toContain('[MÁS INFO]');
        }

        // Verify technical data is handled (not causing errors)
        expect(technicalLog.technicalDetails).toBeDefined();
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Sanitization patterns work correctly
   */
  it('should correctly identify and sanitize various sensitive data patterns', () => {
    const sensitivePatterns = [
      { input: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', shouldBeSanitized: true },
      { input: '{"accessToken": "abc123def456"}', shouldBeSanitized: true },
      { input: '{"password": "mySecretPassword"}', shouldBeSanitized: true },
      { input: 'Authorization: Bearer token123', shouldBeSanitized: true },
      { input: 'user@example.com', shouldBeSanitized: true },
      { input: '1234-5678-9012-3456', shouldBeSanitized: true },
      { input: 'This is a normal message', shouldBeSanitized: false },
      { input: 'Error in function processData', shouldBeSanitized: false },
    ];

    sensitivePatterns.forEach(({ input, shouldBeSanitized }) => {
      const result = loggingService.testSanitization(input);
      
      if (shouldBeSanitized) {
        expect(result.hadSensitiveData).toBe(true);
        expect(result.sanitized).not.toBe(input);
        expect(result.sanitized).toContain('[REDACTED]');
      } else {
        expect(result.hadSensitiveData).toBe(false);
        expect(result.sanitized).toBe(input);
      }
    });
  });

  /**
   * Property: Dual logging statistics are accurate
   */
  it('should provide accurate dual logging statistics', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          category: fc.string({ minLength: 1, maxLength: 20 }),
          message: fc.string({ minLength: 1, maxLength: 50 }),
          userMessage: fc.string({ minLength: 1, maxLength: 30 }),
        }),
        { minLength: 1, maxLength: 15 }
      ),
      (logEntries) => {
        // Clear logs
        loggingService.clearLogs();
        loggingService.clearUserFriendlyLogs();

        // Log all entries
        logEntries.forEach(({ category, message, userMessage }) => {
          loggingService.logDualError(category, message, {}, userMessage);
        });

        // Get statistics
        const stats = loggingService.getDualLoggingStats();

        // Verify counts
        expect(stats.technicalLogs).toBe(logEntries.length);
        expect(stats.userFriendlyLogs).toBe(logEntries.length);
        expect(stats.sessionId).toBeDefined();
        expect(stats.config).toBeDefined();
        expect(stats.config.enableUserFriendlyMessages).toBe(true);
        expect(stats.config.enableTechnicalLogging).toBe(true);
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Export functionality preserves data integrity
   */
  it('should export dual logs with complete data integrity', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          category: fc.string({ minLength: 1, maxLength: 20 }),
          technicalMessage: fc.string({ minLength: 1, maxLength: 50 }),
          userMessage: fc.string({ minLength: 1, maxLength: 30 }),
        }),
        { minLength: 1, maxLength: 10 }
      ),
      (logEntries) => {
        // Clear and log entries
        loggingService.clearLogs();
        loggingService.clearUserFriendlyLogs();

        logEntries.forEach(({ category, technicalMessage, userMessage }) => {
          loggingService.logDualError(category, technicalMessage, {}, userMessage);
        });

        // Export logs
        const exportData = loggingService.exportDualLogs();

        // Verify export structure
        expect(exportData.sessionId).toBeDefined();
        expect(exportData.exportTime).toBeDefined();
        expect(exportData.technicalLogs).toHaveLength(logEntries.length);
        expect(exportData.userFriendlyLogs).toHaveLength(logEntries.length);
        expect(exportData.config).toBeDefined();

        // Verify data integrity
        exportData.technicalLogs.forEach((log, index) => {
          expect(log.category).toBe(logEntries[index].category);
          expect(log.level).toBe('error');
          expect(log.userFriendlyMessage).toBe(logEntries[index].userMessage);
        });

        exportData.userFriendlyLogs.forEach((log, index) => {
          expect(log.category).toBe(logEntries[index].category);
          expect(log.level).toBe('error');
          expect(log.userMessage).toBe(logEntries[index].userMessage);
        });
      }
    ), { numRuns: 15 });
  });
});