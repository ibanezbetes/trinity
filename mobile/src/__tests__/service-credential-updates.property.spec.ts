/**
 * Property Test: Service Credential Updates
 * 
 * This test validates that all services are properly updated with new
 * credentials after token refresh operations.
 * 
 * Validates Requirements: 8.2
 */

import { backgroundTokenRefreshService, TokenRefreshResult } from '../services/backgroundTokenRefreshService';
import { cognitoAuthService, CognitoTokens } from '../services/cognitoAuthService';
import { secureTokenStorage } from '../services/secureTokenStorage';
import { AppState } from 'react-native';
import fc from 'fast-check';

// Mock services
jest.mock('../services/cognitoAuthService');
jest.mock('../services/secureTokenStorage');
jest.mock('../services/networkService', () => ({
  networkService: {
    isConnected: jest.fn(() => true),
  },
}));
jest.mock('../services/loggingService', () => ({
  loggingService: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    logAuth: jest.fn(),
  },
}));

// Mock React Native AppState
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(),
    currentState: 'active',
  },
}));

describe('Property Test: Service Credential Updates', () => {
  const mockCognitoService = cognitoAuthService as jest.Mocked<typeof cognitoAuthService>;
  const mockSecureStorage = secureTokenStorage as jest.Mocked<typeof secureTokenStorage>;
  const mockAppState = AppState as jest.Mocked<typeof AppState>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Reset service state
    backgroundTokenRefreshService.stop();
  });

  afterEach(() => {
    backgroundTokenRefreshService.stop();
    jest.useRealTimers();
  });

  // Generators for test data
  const validTokensArbitrary = fc.record({
    accessToken: fc.string({ minLength: 100, maxLength: 2000 }),
    idToken: fc.string({ minLength: 100, maxLength: 2000 }),
    refreshToken: fc.string({ minLength: 50, maxLength: 500 }),
  });

  const expiredTokenPayloadArbitrary = fc.record({
    sub: fc.uuid(),
    email: fc.emailAddress(),
    exp: fc.integer({ min: Math.floor(Date.now() / 1000) - 3600, max: Math.floor(Date.now() / 1000) - 60 }), // Expired 1 hour to 1 minute ago
    iat: fc.integer({ min: 1000000000, max: Math.floor(Date.now() / 1000) - 7200 }),
  });

  const validTokenPayloadArbitrary = fc.record({
    sub: fc.uuid(),
    email: fc.emailAddress(),
    exp: fc.integer({ min: Math.floor(Date.now() / 1000) + 300, max: Math.floor(Date.now() / 1000) + 3600 }), // Valid for 5 minutes to 1 hour
    iat: fc.integer({ min: Math.floor(Date.now() / 1000) - 3600, max: Math.floor(Date.now() / 1000) }),
  });

  const refreshConfigArbitrary = fc.record({
    refreshThresholdMinutes: fc.integer({ min: 5, max: 30 }),
    backgroundRefreshIntervalMinutes: fc.integer({ min: 1, max: 10 }),
    maxRetryAttempts: fc.integer({ min: 1, max: 5 }),
    retryDelaySeconds: fc.integer({ min: 5, max: 60 }),
    enableBackgroundRefresh: fc.boolean(),
  });

  /**
   * Property: Token refresh should update stored credentials
   */
  test('Property: Successful token refresh should update stored credentials', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTokensArbitrary,
        validTokensArbitrary,
        expiredTokenPayloadArbitrary,
        async (oldTokens, newTokens, expiredPayload) => {
          // Setup: Mock expired tokens in storage
          const expiredAccessToken = createMockJWT(expiredPayload);
          const storedTokens = { ...oldTokens, accessToken: expiredAccessToken };
          
          mockSecureStorage.retrieveTokens.mockResolvedValue(storedTokens);
          mockCognitoService.refreshToken.mockResolvedValue({
            success: true,
            tokens: newTokens,
          });
          mockSecureStorage.storeTokens.mockResolvedValue(undefined);

          // Execute: Trigger manual refresh
          const result = await backgroundTokenRefreshService.refreshNow();

          // Verify: Should succeed and update storage
          expect(result.success).toBe(true);
          expect(result.refreshed).toBe(true);
          expect(result.newTokens).toEqual(newTokens);

          // Verify storage was updated with new tokens
          expect(mockSecureStorage.storeTokens).toHaveBeenCalledWith(newTokens);
          
          // Verify refresh was attempted with old refresh token
          expect(mockCognitoService.refreshToken).toHaveBeenCalledWith(storedTokens.refreshToken);
        }
      ),
      { numRuns: 30, timeout: 10000 }
    );
  });

  /**
   * Property: Background refresh should work with different intervals
   */
  test('Property: Background refresh should respect configured intervals', async () => {
    await fc.assert(
      fc.asyncProperty(
        refreshConfigArbitrary.filter(config => config.enableBackgroundRefresh),
        validTokensArbitrary,
        expiredTokenPayloadArbitrary,
        async (config, tokens, expiredPayload) => {
          // Setup: Mock tokens that need refresh
          const expiredAccessToken = createMockJWT(expiredPayload);
          const storedTokens = { ...tokens, accessToken: expiredAccessToken };
          
          mockSecureStorage.retrieveTokens.mockResolvedValue(storedTokens);
          mockCognitoService.refreshToken.mockResolvedValue({
            success: true,
            tokens,
          });
          mockSecureStorage.storeTokens.mockResolvedValue(undefined);

          // Execute: Start background refresh with config
          backgroundTokenRefreshService.start(config);

          // Fast-forward time to trigger refresh
          const intervalMs = config.backgroundRefreshIntervalMinutes * 60 * 1000;
          jest.advanceTimersByTime(intervalMs + 1000);

          // Allow async operations to complete
          await new Promise(resolve => setTimeout(resolve, 0));

          // Verify: Refresh should have been attempted
          expect(mockSecureStorage.retrieveTokens).toHaveBeenCalled();
          
          // Verify service is active
          const status = backgroundTokenRefreshService.getStatus();
          expect(status.isActive).toBe(true);
        }
      ),
      { numRuns: 20, timeout: 15000 }
    );
  });

  /**
   * Property: Refresh listeners should be notified of credential updates
   */
  test('Property: Refresh listeners should receive credential updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTokensArbitrary,
        validTokensArbitrary,
        expiredTokenPayloadArbitrary,
        async (oldTokens, newTokens, expiredPayload) => {
          // Setup: Mock successful refresh
          const expiredAccessToken = createMockJWT(expiredPayload);
          const storedTokens = { ...oldTokens, accessToken: expiredAccessToken };
          
          mockSecureStorage.retrieveTokens.mockResolvedValue(storedTokens);
          mockCognitoService.refreshToken.mockResolvedValue({
            success: true,
            tokens: newTokens,
          });
          mockSecureStorage.storeTokens.mockResolvedValue(undefined);

          // Setup: Add refresh listener
          const refreshListener = jest.fn();
          backgroundTokenRefreshService.addRefreshListener(refreshListener);

          // Execute: Trigger refresh
          const result = await backgroundTokenRefreshService.refreshNow();

          // Verify: Listener should be called with new tokens
          expect(result.success).toBe(true);
          expect(refreshListener).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true,
              refreshed: true,
              newTokens,
            })
          );

          // Cleanup
          backgroundTokenRefreshService.removeRefreshListener(refreshListener);
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Failed refresh should not update credentials
   */
  test('Property: Failed token refresh should not update stored credentials', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTokensArbitrary,
        expiredTokenPayloadArbitrary,
        fc.constantFrom(
          'NotAuthorizedException',
          'Network error',
          'Invalid refresh token',
          'Service unavailable'
        ),
        async (tokens, expiredPayload, errorMessage) => {
          // Setup: Mock failed refresh
          const expiredAccessToken = createMockJWT(expiredPayload);
          const storedTokens = { ...tokens, accessToken: expiredAccessToken };
          
          mockSecureStorage.retrieveTokens.mockResolvedValue(storedTokens);
          mockCognitoService.refreshToken.mockResolvedValue({
            success: false,
            error: errorMessage,
          });

          // Execute: Trigger refresh
          const result = await backgroundTokenRefreshService.refreshNow();

          // Verify: Should fail and not update storage
          expect(result.success).toBe(false);
          expect(result.refreshed).toBe(false);
          expect(result.error).toContain(errorMessage);

          // Verify storage was not updated
          expect(mockSecureStorage.storeTokens).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Retry logic should work correctly for transient failures
   */
  test('Property: Retry logic should eventually succeed after transient failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTokensArbitrary,
        validTokensArbitrary,
        expiredTokenPayloadArbitrary,
        fc.integer({ min: 1, max: 3 }),
        async (oldTokens, newTokens, expiredPayload, failureCount) => {
          // Setup: Mock tokens and partial failures
          const expiredAccessToken = createMockJWT(expiredPayload);
          const storedTokens = { ...oldTokens, accessToken: expiredAccessToken };
          
          mockSecureStorage.retrieveTokens.mockResolvedValue(storedTokens);
          mockSecureStorage.storeTokens.mockResolvedValue(undefined);

          // Mock failures followed by success
          const refreshCalls = [];
          for (let i = 0; i < failureCount; i++) {
            refreshCalls.push({
              success: false,
              error: 'Temporary network error',
            });
          }
          refreshCalls.push({
            success: true,
            tokens: newTokens,
          });

          mockCognitoService.refreshToken
            .mockResolvedValueOnce(refreshCalls[0])
            .mockResolvedValueOnce(refreshCalls[1] || refreshCalls[0])
            .mockResolvedValueOnce(refreshCalls[2] || refreshCalls[1] || refreshCalls[0])
            .mockResolvedValue(refreshCalls[refreshCalls.length - 1]);

          // Execute: Trigger refresh with retry config
          backgroundTokenRefreshService.start({
            maxRetryAttempts: failureCount + 1,
            retryDelaySeconds: 1, // Short delay for testing
            enableBackgroundRefresh: false, // Manual trigger only
          });

          const result = await backgroundTokenRefreshService.refreshNow();

          // Verify: Should eventually succeed
          expect(result.success).toBe(true);
          expect(result.refreshed).toBe(true);
          expect(result.newTokens).toEqual(newTokens);

          // Verify storage was updated
          expect(mockSecureStorage.storeTokens).toHaveBeenCalledWith(newTokens);
          
          // Verify retry attempts were made
          expect(mockCognitoService.refreshToken).toHaveBeenCalledTimes(failureCount + 1);
        }
      ),
      { numRuns: 15, timeout: 20000 }
    );
  });

  /**
   * Property: App state changes should trigger refresh checks
   */
  test('Property: App foreground should trigger credential refresh check', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTokensArbitrary,
        expiredTokenPayloadArbitrary,
        async (tokens, expiredPayload) => {
          // Setup: Mock app state listener
          let appStateListener: ((state: string) => void) | null = null;
          mockAppState.addEventListener.mockImplementation((event, listener) => {
            if (event === 'change') {
              appStateListener = listener;
            }
            return { remove: jest.fn() };
          });

          // Setup: Mock tokens that need refresh
          const expiredAccessToken = createMockJWT(expiredPayload);
          const storedTokens = { ...tokens, accessToken: expiredAccessToken };
          
          mockSecureStorage.retrieveTokens.mockResolvedValue(storedTokens);
          mockCognitoService.refreshToken.mockResolvedValue({
            success: true,
            tokens,
          });
          mockSecureStorage.storeTokens.mockResolvedValue(undefined);

          // Execute: Start service and simulate app foreground
          backgroundTokenRefreshService.start({ enableBackgroundRefresh: true });
          
          // Clear initial calls
          jest.clearAllMocks();
          
          // Simulate app coming to foreground
          if (appStateListener) {
            appStateListener('active');
            
            // Fast-forward to allow async operations
            jest.advanceTimersByTime(1000);
            await new Promise(resolve => setTimeout(resolve, 0));
          }

          // Verify: Refresh check should have been triggered
          expect(mockSecureStorage.retrieveTokens).toHaveBeenCalled();
        }
      ),
      { numRuns: 15, timeout: 15000 }
    );
  });

  /**
   * Property: Service statistics should be updated correctly
   */
  test('Property: Service statistics should reflect refresh operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(validTokensArbitrary, { minLength: 1, maxLength: 5 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
        async (tokenSets, successFlags) => {
          // Ensure arrays have same length
          const operations = tokenSets.slice(0, Math.min(tokenSets.length, successFlags.length));
          const results = successFlags.slice(0, operations.length);

          // Setup: Mock storage
          mockSecureStorage.retrieveTokens.mockResolvedValue(operations[0]);
          mockSecureStorage.storeTokens.mockResolvedValue(undefined);

          // Reset statistics
          backgroundTokenRefreshService.resetStats();
          let initialStatus = backgroundTokenRefreshService.getStatus();
          expect(initialStatus.refreshCount).toBe(0);
          expect(initialStatus.errorCount).toBe(0);

          // Execute: Perform multiple refresh operations
          for (let i = 0; i < operations.length; i++) {
            const shouldSucceed = results[i];
            
            if (shouldSucceed) {
              mockCognitoService.refreshToken.mockResolvedValueOnce({
                success: true,
                tokens: operations[i],
              });
            } else {
              mockCognitoService.refreshToken.mockResolvedValueOnce({
                success: false,
                error: `Error ${i}`,
              });
            }

            await backgroundTokenRefreshService.refreshNow();
          }

          // Verify: Statistics should match operations
          const finalStatus = backgroundTokenRefreshService.getStatus();
          const expectedSuccesses = results.filter(Boolean).length;
          const expectedErrors = results.filter(r => !r).length;

          expect(finalStatus.refreshCount).toBe(expectedSuccesses);
          expect(finalStatus.errorCount).toBe(expectedErrors);
          
          if (expectedErrors > 0) {
            expect(finalStatus.lastError).toBeDefined();
          }
          
          if (expectedSuccesses > 0) {
            expect(finalStatus.lastRefreshTime).toBeDefined();
          }
        }
      ),
      { numRuns: 20, timeout: 15000 }
    );
  });

  /**
   * Property: Multiple listeners should all receive updates
   */
  test('Property: Multiple listeners should all receive credential updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constant(jest.fn()), { minLength: 1, maxLength: 5 }),
        validTokensArbitrary,
        validTokensArbitrary,
        expiredTokenPayloadArbitrary,
        async (listeners, oldTokens, newTokens, expiredPayload) => {
          // Setup: Mock successful refresh
          const expiredAccessToken = createMockJWT(expiredPayload);
          const storedTokens = { ...oldTokens, accessToken: expiredAccessToken };
          
          mockSecureStorage.retrieveTokens.mockResolvedValue(storedTokens);
          mockCognitoService.refreshToken.mockResolvedValue({
            success: true,
            tokens: newTokens,
          });
          mockSecureStorage.storeTokens.mockResolvedValue(undefined);

          // Setup: Add all listeners
          listeners.forEach(listener => {
            backgroundTokenRefreshService.addRefreshListener(listener);
          });

          // Execute: Trigger refresh
          await backgroundTokenRefreshService.refreshNow();

          // Verify: All listeners should be called
          listeners.forEach(listener => {
            expect(listener).toHaveBeenCalledWith(
              expect.objectContaining({
                success: true,
                refreshed: true,
                newTokens,
              })
            );
          });

          // Cleanup: Remove all listeners
          listeners.forEach(listener => {
            backgroundTokenRefreshService.removeRefreshListener(listener);
          });
        }
      ),
      { numRuns: 15, timeout: 10000 }
    );
  });

  /**
   * Helper function to create mock JWT tokens
   */
  function createMockJWT(payload: any): string {
    const header = { alg: 'RS256', typ: 'JWT' };
    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(payload));
    const signature = 'mock-signature';
    
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }
});