/**
 * Property Test: Session Cleanup on Sign Out
 * 
 * This test validates that session cleanup works correctly on sign out,
 * clearing all authentication data and notifying components.
 * 
 * Validates Requirements: 4.5
 */

import { sessionCleanupService, CleanupResult, CleanupOptions } from '../services/sessionCleanupService';
import { cognitoAuthService } from '../services/cognitoAuthService';
import { federatedAuthService } from '../services/federatedAuthService';
import { secureTokenStorage } from '../services/secureTokenStorage';
import { backgroundTokenRefreshService } from '../services/backgroundTokenRefreshService';
import fc from 'fast-check';

// Mock services
jest.mock('../services/cognitoAuthService');
jest.mock('../services/federatedAuthService');
jest.mock('../services/secureTokenStorage');
jest.mock('../services/backgroundTokenRefreshService');
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

describe('Property Test: Session Cleanup on Sign Out', () => {
  const mockCognitoService = cognitoAuthService as jest.Mocked<typeof cognitoAuthService>;
  const mockFederatedService = federatedAuthService as jest.Mocked<typeof federatedAuthService>;
  const mockSecureStorage = secureTokenStorage as jest.Mocked<typeof secureTokenStorage>;
  const mockBackgroundRefresh = backgroundTokenRefreshService as jest.Mocked<typeof backgroundTokenRefreshService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset global state
    delete global.currentAuthState;
  });

  // Generators for test data
  const validTokensArbitrary = fc.record({
    accessToken: fc.string({ minLength: 100, maxLength: 2000 }),
    idToken: fc.string({ minLength: 100, maxLength: 2000 }),
    refreshToken: fc.string({ minLength: 50, maxLength: 500 }),
  });

  const cleanupOptionsArbitrary = fc.record({
    revokeTokens: fc.boolean(),
    clearSecureStorage: fc.boolean(),
    stopBackgroundServices: fc.boolean(),
    notifyComponents: fc.boolean(),
    forceCleanup: fc.boolean(),
  });

  const serviceErrorArbitrary = fc.constantFrom(
    'Network error',
    'Service unavailable',
    'Token already revoked',
    'Storage access denied',
    'Unknown error'
  );

  /**
   * Property: Successful cleanup should complete all requested steps
   */
  test('Property: Successful cleanup should complete all requested steps', async () => {
    await fc.assert(
      fc.asyncProperty(
        cleanupOptionsArbitrary,
        validTokensArbitrary,
        async (options, tokens) => {
          // Setup: Mock successful operations
          mockSecureStorage.retrieveTokens.mockResolvedValue(tokens);
          mockCognitoService.signOut.mockResolvedValue({ success: true });
          mockFederatedService.signOut.mockResolvedValue({ success: true });
          mockSecureStorage.clearTokens.mockResolvedValue(undefined);
          mockCognitoService.clearTokens.mockResolvedValue(undefined);
          mockSecureStorage.hasStoredTokens.mockResolvedValue(true);
          mockBackgroundRefresh.stop.mockReturnValue(undefined);
          mockBackgroundRefresh.resetStats.mockReturnValue(undefined);

          // Execute: Perform cleanup
          const result = await sessionCleanupService.performSignOutCleanup(options);

          // Verify: Should succeed
          expect(result.success).toBe(true);
          expect(result.errors).toHaveLength(0);

          // Verify expected steps were completed based on options
          if (options.stopBackgroundServices !== false) {
            expect(result.completedSteps).toContain('stop_background_services');
            expect(mockBackgroundRefresh.stop).toHaveBeenCalled();
          }

          if (options.revokeTokens !== false) {
            expect(result.completedSteps).toContain('revoke_tokens');
            expect(mockCognitoService.signOut).toHaveBeenCalledWith(tokens.accessToken);
            expect(mockFederatedService.signOut).toHaveBeenCalledWith(tokens.accessToken);
          }

          if (options.clearSecureStorage !== false) {
            expect(result.completedSteps).toContain('clear_secure_storage');
            expect(mockSecureStorage.clearTokens).toHaveBeenCalled();
            expect(mockCognitoService.clearTokens).toHaveBeenCalled();
          }

          if (options.notifyComponents !== false) {
            expect(result.completedSteps).toContain('notify_components');
          }

          expect(result.completedSteps).toContain('clear_application_cache');
          expect(result.completedSteps).toContain('reset_service_states');
        }
      ),
      { numRuns: 30, timeout: 10000 }
    );
  });

  /**
   * Property: Failed steps should be handled according to forceCleanup option
   */
  test('Property: Failed steps should be handled according to forceCleanup option', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        serviceErrorArbitrary,
        validTokensArbitrary,
        async (forceCleanup, errorMessage, tokens) => {
          // Setup: Mock one failing operation
          mockSecureStorage.retrieveTokens.mockResolvedValue(tokens);
          mockCognitoService.signOut.mockRejectedValue(new Error(errorMessage));
          mockFederatedService.signOut.mockResolvedValue({ success: true });
          mockSecureStorage.clearTokens.mockResolvedValue(undefined);
          mockCognitoService.clearTokens.mockResolvedValue(undefined);
          mockBackgroundRefresh.stop.mockReturnValue(undefined);
          mockBackgroundRefresh.resetStats.mockReturnValue(undefined);

          // Execute: Perform cleanup with forceCleanup option
          const result = await sessionCleanupService.performSignOutCleanup({
            revokeTokens: true,
            forceCleanup,
          });

          // Verify: Result should depend on forceCleanup option
          if (forceCleanup) {
            expect(result.success).toBe(true);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain(errorMessage);
            // Should continue with other steps
            expect(result.completedSteps.length).toBeGreaterThan(0);
          } else {
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain(errorMessage);
          }
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Emergency cleanup should always attempt all critical steps
   */
  test('Property: Emergency cleanup should always attempt all critical steps', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(serviceErrorArbitrary, { minLength: 0, maxLength: 3 }),
        async (errors) => {
          // Setup: Mock various failures
          if (errors.includes('Network error')) {
            mockCognitoService.signOut.mockRejectedValue(new Error('Network error'));
          }
          if (errors.includes('Storage access denied')) {
            mockSecureStorage.clearTokens.mockRejectedValue(new Error('Storage access denied'));
          }
          if (errors.includes('Service unavailable')) {
            mockFederatedService.signOut.mockRejectedValue(new Error('Service unavailable'));
          }

          // Mock successful operations for non-error cases
          if (!errors.includes('Network error')) {
            mockCognitoService.signOut.mockResolvedValue({ success: true });
          }
          if (!errors.includes('Storage access denied')) {
            mockSecureStorage.clearTokens.mockResolvedValue(undefined);
            mockCognitoService.clearTokens.mockResolvedValue(undefined);
          }
          if (!errors.includes('Service unavailable')) {
            mockFederatedService.signOut.mockResolvedValue({ success: true });
          }

          mockSecureStorage.retrieveTokens.mockResolvedValue(null);
          mockBackgroundRefresh.stop.mockReturnValue(undefined);
          mockBackgroundRefresh.resetStats.mockReturnValue(undefined);

          // Execute: Emergency cleanup
          const result = await sessionCleanupService.emergencyCleanup();

          // Verify: Should always complete with force cleanup
          expect(result.success).toBe(true);
          
          // Should attempt critical steps
          expect(result.completedSteps).toContain('clear_secure_storage');
          expect(result.completedSteps).toContain('stop_background_services');
          expect(result.completedSteps).toContain('notify_components');
          
          // Should skip token revocation in emergency
          expect(result.skippedSteps).toContain('revoke_tokens');
          
          // Errors should be recorded but not prevent completion
          expect(result.errors.length).toBe(errors.length);
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Cleanup listeners should be notified
   */
  test('Property: Cleanup listeners should be notified during cleanup', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constant(jest.fn()), { minLength: 1, maxLength: 5 }),
        async (listeners) => {
          // Setup: Add listeners
          listeners.forEach(listener => {
            sessionCleanupService.addCleanupListener(listener);
          });

          // Mock successful operations
          mockSecureStorage.retrieveTokens.mockResolvedValue(null);
          mockSecureStorage.clearTokens.mockResolvedValue(undefined);
          mockCognitoService.clearTokens.mockResolvedValue(undefined);
          mockBackgroundRefresh.stop.mockReturnValue(undefined);
          mockBackgroundRefresh.resetStats.mockReturnValue(undefined);

          // Execute: Perform cleanup
          const result = await sessionCleanupService.performSignOutCleanup({
            notifyComponents: true,
          });

          // Verify: All listeners should be called
          expect(result.success).toBe(true);
          expect(result.completedSteps).toContain('notify_components');
          
          listeners.forEach(listener => {
            expect(listener).toHaveBeenCalled();
          });

          // Cleanup: Remove listeners
          listeners.forEach(listener => {
            sessionCleanupService.removeCleanupListener(listener);
          });
        }
      ),
      { numRuns: 15, timeout: 10000 }
    );
  });

  /**
   * Property: Cleanup should handle listener errors gracefully
   */
  test('Property: Cleanup should handle listener errors gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
        async (listenerSuccessFlags) => {
          // Setup: Create listeners that may fail
          const listeners = listenerSuccessFlags.map(shouldSucceed => {
            const listener = jest.fn();
            if (shouldSucceed) {
              listener.mockResolvedValue(undefined);
            } else {
              listener.mockRejectedValue(new Error('Listener error'));
            }
            return listener;
          });

          listeners.forEach(listener => {
            sessionCleanupService.addCleanupListener(listener);
          });

          // Mock successful operations
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

          // Verify: Should succeed despite listener errors
          expect(result.success).toBe(true);
          expect(result.completedSteps).toContain('notify_components');
          
          // All listeners should have been called
          listeners.forEach(listener => {
            expect(listener).toHaveBeenCalled();
          });

          // Cleanup: Remove listeners
          listeners.forEach(listener => {
            sessionCleanupService.removeCleanupListener(listener);
          });
        }
      ),
      { numRuns: 15, timeout: 10000 }
    );
  });

  /**
   * Property: Cleanup need detection should work correctly
   */
  test('Property: Cleanup need detection should identify stale sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 0, max: 60 * 24 * 60 * 60 * 1000 }), // 0 to 60 days in ms
        fc.integer({ min: 0, max: 10 }),
        async (hasTokens, tokensExpired, tokenAge, errorCount) => {
          // Setup: Mock storage and service states
          mockSecureStorage.hasStoredTokens.mockResolvedValue(hasTokens);
          
          if (hasTokens) {
            const tokenPayload = {
              sub: 'test-user',
              exp: tokensExpired 
                ? Math.floor((Date.now() - 3600000) / 1000) // Expired 1 hour ago
                : Math.floor((Date.now() + 3600000) / 1000), // Expires in 1 hour
            };
            
            const mockToken = createMockJWT(tokenPayload);
            mockSecureStorage.retrieveTokens.mockResolvedValue({
              accessToken: mockToken,
              idToken: 'mock-id-token',
              refreshToken: 'mock-refresh-token',
            });

            mockSecureStorage.getStorageInfo.mockResolvedValue({
              hasTokens: true,
              method: 'keychain',
              encrypted: true,
              age: tokenAge,
              storageCapabilities: {
                keychain: true,
                encryptedStorage: true,
                plainStorage: true,
              },
            });
          } else {
            mockSecureStorage.retrieveTokens.mockResolvedValue(null);
            mockSecureStorage.getStorageInfo.mockResolvedValue({
              hasTokens: false,
              storageCapabilities: {
                keychain: true,
                encryptedStorage: true,
                plainStorage: true,
              },
            });
          }

          mockBackgroundRefresh.getStatus.mockReturnValue({
            isActive: true,
            refreshCount: 5,
            errorCount,
            lastRefreshTime: Date.now() - 60000,
          });

          // Execute: Check cleanup needs
          const cleanupCheck = await sessionCleanupService.isCleanupNeeded();

          // Verify: Should correctly identify cleanup needs
          const shouldNeedCleanup = 
            (hasTokens && tokensExpired) || 
            (tokenAge > 30 * 24 * 60 * 60 * 1000) || 
            (errorCount > 5);

          expect(cleanupCheck.needed).toBe(shouldNeedCleanup);
          
          if (shouldNeedCleanup) {
            expect(cleanupCheck.reasons.length).toBeGreaterThan(0);
            expect(cleanupCheck.recommendations.length).toBeGreaterThan(0);
          }

          if (hasTokens && tokensExpired) {
            expect(cleanupCheck.reasons).toContain('Access token is expired');
          }

          if (tokenAge > 30 * 24 * 60 * 60 * 1000) {
            expect(cleanupCheck.reasons).toContain('Stored tokens are very old (>30 days)');
          }

          if (errorCount > 5) {
            expect(cleanupCheck.reasons).toContain('Background refresh service has too many errors');
          }
        }
      ),
      { numRuns: 30, timeout: 10000 }
    );
  });

  /**
   * Property: Concurrent cleanup operations should be handled safely
   */
  test('Property: Concurrent cleanup operations should be handled safely', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (concurrentOperations) => {
          // Setup: Mock operations with delays to simulate concurrency
          mockSecureStorage.retrieveTokens.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return null;
          });
          mockSecureStorage.clearTokens.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });
          mockCognitoService.clearTokens.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });
          mockBackgroundRefresh.stop.mockReturnValue(undefined);
          mockBackgroundRefresh.resetStats.mockReturnValue(undefined);

          // Execute: Multiple concurrent cleanup operations
          const cleanupPromises = Array(concurrentOperations).fill(null).map(() =>
            sessionCleanupService.performSignOutCleanup({
              revokeTokens: false, // Skip to avoid token conflicts
              forceCleanup: true,
            })
          );

          const results = await Promise.all(cleanupPromises);

          // Verify: All operations should complete successfully
          results.forEach(result => {
            expect(result.success).toBe(true);
            expect(result.completedSteps.length).toBeGreaterThan(0);
          });

          // Verify cleanup operations were called
          expect(mockSecureStorage.clearTokens).toHaveBeenCalled();
          expect(mockCognitoService.clearTokens).toHaveBeenCalled();
        }
      ),
      { numRuns: 10, timeout: 15000 }
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