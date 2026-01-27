/**
 * Property Test: Network Error Classification
 * 
 * Validates that network errors are properly classified, retry mechanisms work with exponential backoff,
 * and appropriate error messages are provided based on error type.
 * Tests Requirements 7.3: Network error classification and handling
 */

import fc from 'fast-check';
import { networkErrorClassificationService, NetworkErrorClassification, RetryConfig, RetryResult } from '../services/networkErrorClassificationService';

// Mock dependencies
jest.mock('../services/loggingService', () => ({
  loggingService: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock React Native NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
}));

describe('Property Test: Network Error Classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset service configuration
    networkErrorClassificationService.updateConfig({
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitterEnabled: false, // Disable for predictable testing
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      retryableErrorTypes: ['NETWORK_ERROR', 'TIMEOUT', 'CONNECTION_ERROR'],
    });

    // Mock NetInfo to return connected by default
    const NetInfo = require('@react-native-community/netinfo');
    NetInfo.fetch.mockResolvedValue({ isConnected: true, type: 'wifi' });
  });

  /**
   * Property 19.1: Error Type Classification
   * For any network error, the service should classify it into appropriate categories
   */
  test('Property 19.1: Consistent error type classification', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorScenario: fc.constantFrom(
            { type: 'status_code', value: 500, expectedType: 'service' },
            { type: 'status_code', value: 503, expectedType: 'service' },
            { type: 'status_code', value: 401, expectedType: 'authentication' },
            { type: 'status_code', value: 429, expectedType: 'rate_limit' },
            { type: 'status_code', value: 408, expectedType: 'timeout' },
            { type: 'error_code', value: 'NETWORK_ERROR', expectedType: 'connectivity' },
            { type: 'error_code', value: 'TIMEOUT', expectedType: 'timeout' },
            { type: 'error_code', value: 'SERVER_ERROR', expectedType: 'service' },
            { type: 'message', value: 'network connection failed', expectedType: 'connectivity' },
            { type: 'message', value: 'request timeout', expectedType: 'timeout' },
          ),
          isConnected: fc.boolean(),
        }),
        async ({ errorScenario, isConnected }) => {
          // Arrange: Mock network connectivity
          const NetInfo = require('@react-native-community/netinfo');
          NetInfo.fetch.mockResolvedValue({ isConnected, type: 'wifi' });

          // Create error based on scenario
          let mockError: any;
          switch (errorScenario.type) {
            case 'status_code':
              mockError = { status: errorScenario.value, message: 'HTTP error' };
              break;
            case 'error_code':
              mockError = { code: errorScenario.value, message: 'Network error' };
              break;
            case 'message':
              mockError = { message: errorScenario.value };
              break;
          }

          // Act: Classify error
          const classification = await networkErrorClassificationService.classifyError(mockError);

          // Assert: Classification properties
          expect(classification.type).toBeDefined();
          expect(classification.severity).toMatch(/^(low|medium|high|critical)$/);
          expect(typeof classification.retryable).toBe('boolean');
          expect(classification.retryStrategy).toMatch(/^(immediate|exponential_backoff|linear_backoff|no_retry)$/);
          expect(classification.maxRetries).toBeGreaterThanOrEqual(0);
          expect(classification.baseDelayMs).toBeGreaterThanOrEqual(0);
          expect(classification.userMessage).toBeDefined();
          expect(classification.guidance).toBeDefined();

          // Network connectivity should override other classifications
          if (!isConnected) {
            expect(classification.type).toBe('connectivity');
            expect(classification.retryable).toBe(true);
          } else {
            // When connected, should classify based on error details
            expect(classification.type).toBe(errorScenario.expectedType);
          }

          // Retryable errors should have appropriate retry strategy
          if (classification.retryable) {
            expect(classification.retryStrategy).not.toBe('no_retry');
            expect(classification.maxRetries).toBeGreaterThan(0);
          } else {
            expect(classification.retryStrategy).toBe('no_retry');
            expect(classification.maxRetries).toBe(0);
          }
        }
      ),
      { numRuns: 40 }
    );
  });

  /**
   * Property 19.2: Retry Logic Consistency
   * Retry mechanisms should follow the configured strategy and limits
   */
  test('Property 19.2: Retry logic follows configuration and strategy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          maxRetries: fc.integer({ min: 0, max: 5 }),
          baseDelayMs: fc.integer({ min: 100, max: 2000 }),
          backoffMultiplier: fc.float({ min: 1.5, max: 3.0 }),
          failureCount: fc.integer({ min: 0, max: 8 }),
          errorType: fc.constantFrom('NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR', 'UNAUTHORIZED'),
        }),
        async ({ maxRetries, baseDelayMs, backoffMultiplier, failureCount, errorType }) => {
          // Arrange: Configure service
          networkErrorClassificationService.updateConfig({
            maxRetries,
            baseDelayMs,
            backoffMultiplier,
            jitterEnabled: false, // Disable for predictable testing
          });

          // Create mock operation that fails specific number of times
          let callCount = 0;
          const mockOperation = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount <= failureCount) {
              const error = { code: errorType, message: `Failure ${callCount}` };
              throw error;
            }
            return { success: true, data: `Success after ${callCount} attempts` };
          });

          const startTime = Date.now();

          // Act: Execute operation with retry
          const result = await networkErrorClassificationService.executeWithRetry(
            mockOperation,
            'test_operation'
          );

          const endTime = Date.now();
          const actualDuration = endTime - startTime;

          // Assert: Retry behavior properties
          const classification = result.classification;
          const expectedMaxAttempts = Math.min(failureCount + 1, classification.maxRetries + 1);

          if (failureCount === 0) {
            // Should succeed immediately
            expect(result.success).toBe(true);
            expect(result.attemptCount).toBe(1);
            expect(mockOperation).toHaveBeenCalledTimes(1);

          } else if (classification.retryable && failureCount < classification.maxRetries + 1) {
            // Should succeed after retries
            expect(result.success).toBe(true);
            expect(result.attemptCount).toBe(failureCount + 1);
            expect(mockOperation).toHaveBeenCalledTimes(failureCount + 1);

          } else {
            // Should fail after max retries
            expect(result.success).toBe(false);
            expect(result.attemptCount).toBeLessThanOrEqual(classification.maxRetries + 1);
            expect(result.error).toBeDefined();
          }

          // Verify retry delays were applied (approximate due to execution time)
          if (result.attemptCount > 1 && classification.retryable) {
            expect(result.totalDelayMs).toBeGreaterThan(0);
            
            // For exponential backoff, total delay should increase with attempts
            if (classification.retryStrategy === 'exponential_backoff') {
              const expectedMinDelay = baseDelayMs; // At least one base delay
              expect(result.totalDelayMs).toBeGreaterThanOrEqual(expectedMinDelay * 0.8); // Allow some tolerance
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 19.3: Error Message Quality and Localization
   * Error messages should be user-friendly and provide appropriate guidance
   */
  test('Property 19.3: Error messages are user-friendly and informative', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorType: fc.constantFrom(
            'NETWORK_ERROR',
            'TIMEOUT', 
            'SERVER_ERROR',
            'UNAUTHORIZED',
            'TOO_MANY_REQUESTS',
            'SERVICE_UNAVAILABLE'
          ),
          errorFormat: fc.constantFrom('code', 'status', 'message'),
        }),
        async ({ errorType, errorFormat }) => {
          // Arrange: Create error in different formats
          let mockError: any;
          switch (errorFormat) {
            case 'code':
              mockError = { code: errorType, message: 'Error occurred' };
              break;
            case 'status':
              const statusMap: Record<string, number> = {
                'NETWORK_ERROR': 0,
                'TIMEOUT': 408,
                'SERVER_ERROR': 500,
                'UNAUTHORIZED': 401,
                'TOO_MANY_REQUESTS': 429,
                'SERVICE_UNAVAILABLE': 503,
              };
              mockError = { status: statusMap[errorType], message: 'HTTP error' };
              break;
            case 'message':
              mockError = { message: `${errorType.toLowerCase().replace('_', ' ')} occurred` };
              break;
          }

          // Act: Get error message and classification
          const errorMessage = await networkErrorClassificationService.getErrorMessage(mockError);
          const classification = await networkErrorClassificationService.classifyError(mockError);

          // Assert: Message quality properties
          expect(errorMessage.message).toBeDefined();
          expect(errorMessage.guidance).toBeDefined();
          
          // Messages should be non-empty and reasonable length
          expect(errorMessage.message.length).toBeGreaterThan(5);
          expect(errorMessage.message.length).toBeLessThan(200);
          expect(errorMessage.guidance.length).toBeGreaterThan(10);
          expect(errorMessage.guidance.length).toBeLessThan(300);

          // Should be in Spanish (based on service configuration)
          expect(errorMessage.message).toMatch(/[áéíóúñ]|verifica|intenta|conexión|servidor|sesión/i);
          expect(errorMessage.guidance).toMatch(/[áéíóúñ]|verifica|intenta|espera|revisa/i);

          // Should not contain technical jargon
          expect(errorMessage.message).not.toMatch(/exception|null|undefined|stack|trace|http/i);
          expect(errorMessage.guidance).not.toMatch(/exception|null|undefined|stack|trace|http/i);

          // Should provide actionable guidance
          expect(errorMessage.guidance).toMatch(/verifica|intenta|revisa|espera|contacta|cambia/i);

          // Classification should match message tone
          if (classification.severity === 'critical') {
            expect(errorMessage.message).toMatch(/error|problema|no disponible/i);
          }
          
          if (classification.retryable) {
            expect(errorMessage.guidance).toMatch(/intenta|espera|nuevamente/i);
          }
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Property 19.4: Retry Strategy Effectiveness
   * Different retry strategies should behave according to their mathematical definitions
   */
  test('Property 19.4: Retry strategies follow mathematical definitions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          retryStrategy: fc.constantFrom('immediate', 'linear_backoff', 'exponential_backoff'),
          baseDelayMs: fc.integer({ min: 100, max: 1000 }),
          backoffMultiplier: fc.float({ min: 1.5, max: 3.0 }),
          attemptCount: fc.integer({ min: 1, max: 4 }),
        }),
        async ({ retryStrategy, baseDelayMs, backoffMultiplier, attemptCount }) => {
          // Arrange: Configure service
          networkErrorClassificationService.updateConfig({
            baseDelayMs,
            backoffMultiplier,
            jitterEnabled: false, // Disable for predictable testing
          });

          // Create a custom classification with specific retry strategy
          const mockError = { 
            code: 'TEST_ERROR',
            retryStrategy,
            baseDelayMs,
          };

          // Mock the private method by testing through executeWithRetry
          let actualDelays: number[] = [];
          let callCount = 0;

          const mockOperation = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount <= attemptCount) {
              throw mockError;
            }
            return { success: true };
          });

          // Capture timing to verify delays
          const startTime = Date.now();
          let lastTime = startTime;
          
          // Override setTimeout to capture delays
          const originalSetTimeout = global.setTimeout;
          global.setTimeout = jest.fn().mockImplementation((callback, delay) => {
            const currentTime = Date.now();
            actualDelays.push(currentTime - lastTime);
            lastTime = currentTime + delay;
            return originalSetTimeout(callback, 0); // Execute immediately for testing
          });

          try {
            // Act: Execute with retry
            await networkErrorClassificationService.executeWithRetry(mockOperation, 'test_strategy');

            // Assert: Delay pattern should match strategy
            if (actualDelays.length > 1) {
              switch (retryStrategy) {
                case 'immediate':
                  // All delays should be 0 or very small
                  actualDelays.forEach(delay => {
                    expect(delay).toBeLessThan(50); // Allow for execution time
                  });
                  break;

                case 'linear_backoff':
                  // Delays should increase linearly
                  for (let i = 1; i < actualDelays.length; i++) {
                    const expectedDelay = baseDelayMs * (i + 1);
                    // Allow some tolerance for execution time
                    expect(actualDelays[i]).toBeGreaterThanOrEqual(expectedDelay * 0.8);
                    expect(actualDelays[i]).toBeLessThanOrEqual(expectedDelay * 1.2);
                  }
                  break;

                case 'exponential_backoff':
                  // Delays should increase exponentially
                  for (let i = 1; i < actualDelays.length; i++) {
                    const expectedDelay = baseDelayMs * Math.pow(backoffMultiplier, i);
                    // Allow some tolerance for execution time
                    expect(actualDelays[i]).toBeGreaterThanOrEqual(expectedDelay * 0.8);
                    expect(actualDelays[i]).toBeLessThanOrEqual(expectedDelay * 1.2);
                  }
                  break;
              }
            }

          } finally {
            global.setTimeout = originalSetTimeout;
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 19.5: Configuration Consistency
   * Service configuration changes should be applied consistently across all operations
   */
  test('Property 19.5: Configuration changes applied consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          config: fc.record({
            maxRetries: fc.integer({ min: 0, max: 5 }),
            baseDelayMs: fc.integer({ min: 100, max: 5000 }),
            maxDelayMs: fc.integer({ min: 5000, max: 60000 }),
            backoffMultiplier: fc.float({ min: 1.1, max: 4.0 }),
            jitterEnabled: fc.boolean(),
          }),
          errorType: fc.constantFrom('NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT'),
        }),
        async ({ config, errorType }) => {
          // Arrange: Apply configuration
          networkErrorClassificationService.updateConfig(config);

          // Verify configuration was applied
          const currentConfig = networkErrorClassificationService.getConfig();
          expect(currentConfig.maxRetries).toBe(config.maxRetries);
          expect(currentConfig.baseDelayMs).toBe(config.baseDelayMs);
          expect(currentConfig.maxDelayMs).toBe(config.maxDelayMs);
          expect(currentConfig.backoffMultiplier).toBe(config.backoffMultiplier);
          expect(currentConfig.jitterEnabled).toBe(config.jitterEnabled);

          // Act: Test operations with new configuration
          const mockError = { code: errorType };
          const classification = await networkErrorClassificationService.classifyError(mockError);
          const isRetryable = await networkErrorClassificationService.isRetryableError(mockError);

          // Assert: Configuration effects
          // Max retries should not exceed configured limit
          expect(classification.maxRetries).toBeLessThanOrEqual(config.maxRetries);
          
          // Base delay should be influenced by configuration
          if (classification.retryable) {
            expect(classification.baseDelayMs).toBeGreaterThanOrEqual(config.baseDelayMs * 0.5);
          }

          // Retryable determination should be consistent
          expect(isRetryable).toBe(classification.retryable);

          // Test actual retry execution respects configuration
          let operationCallCount = 0;
          const mockOperation = jest.fn().mockImplementation(async () => {
            operationCallCount++;
            if (operationCallCount <= 2) { // Fail twice
              throw mockError;
            }
            return { success: true };
          });

          const result = await networkErrorClassificationService.executeWithRetry(mockOperation);
          
          // Should not exceed configured max retries
          expect(result.attemptCount).toBeLessThanOrEqual(config.maxRetries + 1);
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property 19.6: Network Connectivity Detection
   * Service should properly detect and handle network connectivity issues
   */
  test('Property 19.6: Network connectivity detection accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          isConnected: fc.boolean(),
          connectionType: fc.constantFrom('wifi', 'cellular', 'ethernet', 'none'),
          errorType: fc.constantFrom('SERVER_ERROR', 'TIMEOUT', 'UNAUTHORIZED'),
        }),
        async ({ isConnected, connectionType, errorType }) => {
          // Arrange: Mock network state
          const NetInfo = require('@react-native-community/netinfo');
          NetInfo.fetch.mockResolvedValue({ 
            isConnected, 
            type: connectionType 
          });

          // Act: Classify error
          const mockError = { code: errorType, message: 'Test error' };
          const classification = await networkErrorClassificationService.classifyError(mockError);

          // Assert: Connectivity detection properties
          if (!isConnected) {
            // Should always classify as connectivity issue when offline
            expect(classification.type).toBe('connectivity');
            expect(classification.retryable).toBe(true);
            expect(classification.userMessage).toMatch(/conexión|internet/i);
            expect(classification.guidance).toMatch(/verifica|wifi|datos/i);

          } else {
            // Should classify based on actual error when online
            expect(classification.type).not.toBe('connectivity');
            
            // Should provide appropriate classification for the error type
            switch (errorType) {
              case 'SERVER_ERROR':
                expect(classification.type).toBe('service');
                break;
              case 'TIMEOUT':
                expect(classification.type).toBe('timeout');
                break;
              case 'UNAUTHORIZED':
                expect(classification.type).toBe('authentication');
                break;
            }
          }

          // Network type should not affect classification when connected
          if (isConnected) {
            const anotherClassification = await networkErrorClassificationService.classifyError(mockError);
            expect(anotherClassification.type).toBe(classification.type);
            expect(anotherClassification.retryable).toBe(classification.retryable);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});