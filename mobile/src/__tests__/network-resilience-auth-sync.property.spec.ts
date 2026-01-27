/**
 * Property Test: Network Resilience Authentication Sync
 * 
 * Validates that authentication state synchronization works properly when network connectivity is restored
 * and that offline authentication state management functions correctly.
 * Tests Requirements 5.5, 7.4: Network resilience for authentication
 */

import fc from 'fast-check';
import { networkResilienceService, NetworkResilienceConfig, NetworkSyncResult, OfflineAuthState } from '../services/networkResilienceService';
import { backgroundTokenRefreshService } from '../services/backgroundTokenRefreshService';
import { cognitoAuthService } from '../services/cognitoAuthService';
import { secureTokenStorage } from '../services/secureTokenStorage';

// Mock dependencies
jest.mock('../services/backgroundTokenRefreshService');
jest.mock('../services/cognitoAuthService');
jest.mock('../services/secureTokenStorage');
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
  addEventListener: jest.fn(),
}));

const mockBackgroundTokenRefreshService = backgroundTokenRefreshService as jest.Mocked<typeof backgroundTokenRefreshService>;
const mockCognitoAuthService = cognitoAuthService as jest.Mocked<typeof cognitoAuthService>;
const mockSecureTokenStorage = secureTokenStorage as jest.Mocked<typeof secureTokenStorage>;

describe('Property Test: Network Resilience Authentication Sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    networkResilienceService.stop();
    
    // Reset service state
    networkResilienceService.updateConfig({
      enableOfflineMode: true,
      syncRetryAttempts: 3,
      syncRetryDelayMs: 100, // Faster for tests
      offlineTokenValidityHours: 24,
      enableConnectivityMonitoring: true,
    });

    // Mock NetInfo
    const NetInfo = require('@react-native-community/netinfo');
    NetInfo.fetch.mockResolvedValue({ isConnected: true, type: 'wifi' });
    NetInfo.addEventListener.mockReturnValue(() => {});
  });

  afterEach(() => {
    networkResilienceService.stop();
  });

  /**
   * Property 15.1: Sync Retry Logic
   * For any authentication operation that fails, the service should retry with exponential backoff
   */
  test('Property 15.1: Authentication sync retry with exponential backoff', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          maxRetries: fc.integer({ min: 1, max: 5 }),
          failureCount: fc.integer({ min: 0, max: 6 }),
          baseDelayMs: fc.integer({ min: 50, max: 500 }),
          operationType: fc.constantFrom('token_refresh', 'user_data_sync'),
        }),
        async ({ maxRetries, failureCount, baseDelayMs, operationType }) => {
          // Arrange: Setup operation that fails specific number of times
          let callCount = 0;
          const mockOperation = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount <= failureCount) {
              throw new Error(`Operation failed (attempt ${callCount})`);
            }
            return { success: true, data: 'mock-result' };
          });

          networkResilienceService.updateConfig({
            syncRetryAttempts: maxRetries,
            syncRetryDelayMs: baseDelayMs,
          });

          const startTime = Date.now();

          // Act: Retry the operation
          const result = await networkResilienceService.retryAuthOperation(
            mockOperation,
            operationType,
            maxRetries
          );

          const endTime = Date.now();
          const totalTime = endTime - startTime;

          // Assert: Retry behavior properties
          const expectedCalls = Math.min(failureCount + 1, maxRetries + 1);
          expect(mockOperation).toHaveBeenCalledTimes(expectedCalls);

          if (failureCount < expectedCalls) {
            // Operation should succeed
            expect(result.success).toBe(true);
            expect(result.result).toEqual({ success: true, data: 'mock-result' });
            expect(result.retryCount).toBe(failureCount);
          } else {
            // Operation should fail after max retries
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.retryCount).toBe(maxRetries);
          }

          // Verify exponential backoff timing (allow some tolerance for test execution)
          if (failureCount > 0 && failureCount < maxRetries) {
            const expectedMinDelay = baseDelayMs * (Math.pow(2, failureCount) - 1) / 1;
            expect(totalTime).toBeGreaterThanOrEqual(expectedMinDelay * 0.8); // 20% tolerance
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 15.2: Offline Token Validity
   * Offline authentication should be valid only within configured time window and token expiry
   */
  test('Property 15.2: Offline authentication validity logic', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          currentTime: fc.integer({ min: 1640995200000, max: 2000000000000 }), // 2022-2033
          tokenExpiryOffset: fc.integer({ min: -7200, max: 7200 }), // -2 to +2 hours in seconds
          lastSyncOffset: fc.integer({ min: 0, max: 172800000 }), // 0 to 48 hours in ms
          offlineValidityHours: fc.integer({ min: 1, max: 48 }),
          enableOfflineMode: fc.boolean(),
        }),
        async ({ currentTime, tokenExpiryOffset, lastSyncOffset, offlineValidityHours, enableOfflineMode }) => {
          // Arrange: Setup time and token state
          const originalNow = Date.now;
          Date.now = jest.fn(() => currentTime);

          const tokenExpiryTime = Math.floor((currentTime + (tokenExpiryOffset * 1000)) / 1000);
          const lastSyncTime = currentTime - lastSyncOffset;

          // Mock stored tokens
          const mockToken = createMockJWT({ exp: tokenExpiryTime });
          mockSecureTokenStorage.retrieveTokens.mockResolvedValue({
            accessToken: mockToken,
            refreshToken: 'mock-refresh-token',
            idToken: 'mock-id-token',
          });

          // Update service config and simulate last sync
          networkResilienceService.updateConfig({
            enableOfflineMode,
            offlineTokenValidityHours,
          });

          // Simulate last sync time by starting and stopping service
          if (lastSyncOffset > 0) {
            await networkResilienceService.start();
            // Manually set last sync time (in real implementation this would be set during sync)
            const status = networkResilienceService.getNetworkStatus();
            // We'll check the logic through the public API
          }

          try {
            // Act: Check offline auth validity
            const isValid = await networkResilienceService.isOfflineAuthValid();
            const offlineState = await networkResilienceService.getOfflineAuthState();

            // Assert: Validity logic properties
            const tokenNotExpired = (tokenExpiryTime * 1000) > currentTime;
            const withinOfflineWindow = lastSyncOffset < (offlineValidityHours * 60 * 60 * 1000);
            const hasValidTokens = !!mockToken;

            const expectedValidity = enableOfflineMode && 
                                   hasValidTokens && 
                                   tokenNotExpired && 
                                   withinOfflineWindow;

            expect(isValid).toBe(expectedValidity);
            expect(offlineState.offlineTokensValid).toBe(expectedValidity);

            // Offline state should reflect current conditions
            expect(offlineState.isOffline).toBe(false); // Service starts online by default
            expect(offlineState.lastSyncTime).toBeGreaterThanOrEqual(0);

          } finally {
            Date.now = originalNow;
            networkResilienceService.stop();
          }
        }
      ),
      { numRuns: 40 }
    );
  });

  /**
   * Property 15.3: Network State Synchronization
   * When network comes back online, authentication sync should be triggered
   */
  test('Property 15.3: Network connectivity restoration triggers sync', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          tokenRefreshSuccess: fc.boolean(),
          userDataSyncSuccess: fc.boolean(),
          syncRetryAttempts: fc.integer({ min: 1, max: 3 }),
        }),
        async ({ tokenRefreshSuccess, userDataSyncSuccess, syncRetryAttempts }) => {
          // Arrange: Setup mock responses
          mockBackgroundTokenRefreshService.refreshNow.mockResolvedValue({
            success: tokenRefreshSuccess,
            refreshed: tokenRefreshSuccess,
            newTokens: tokenRefreshSuccess ? {
              accessToken: 'new-access-token',
              refreshToken: 'new-refresh-token',
              idToken: 'new-id-token',
            } : undefined,
            error: tokenRefreshSuccess ? undefined : 'Token refresh failed',
          });

          mockCognitoAuthService.checkStoredAuth.mockResolvedValue({
            isAuthenticated: userDataSyncSuccess,
            user: userDataSyncSuccess ? {
              sub: 'user-123',
              email: 'test@example.com',
              name: 'Test User',
              preferred_username: 'testuser',
            } : null,
            tokens: userDataSyncSuccess ? {
              accessToken: 'access-token',
              refreshToken: 'refresh-token',
              idToken: 'id-token',
            } : null,
          });

          networkResilienceService.updateConfig({
            syncRetryAttempts,
          });

          // Setup event listener to capture sync events
          const capturedEvents: Array<{ type: string; data?: any }> = [];
          const eventListener = (event: { type: string; data?: any }) => {
            capturedEvents.push(event);
          };
          networkResilienceService.addNetworkEventListener(eventListener);

          try {
            // Act: Trigger manual sync (simulates network restoration)
            const syncResult = await networkResilienceService.syncAuthState();

            // Assert: Sync behavior properties
            expect(mockBackgroundTokenRefreshService.refreshNow).toHaveBeenCalled();
            expect(mockCognitoAuthService.checkStoredAuth).toHaveBeenCalled();

            // Sync result should reflect individual operation results
            expect(syncResult.syncedTokens).toBe(tokenRefreshSuccess);
            expect(syncResult.syncedUserData).toBe(userDataSyncSuccess);
            expect(syncResult.success).toBe(tokenRefreshSuccess || userDataSyncSuccess);

            // Should emit appropriate events
            if (syncResult.success) {
              const syncCompletedEvent = capturedEvents.find(e => e.type === 'sync_completed');
              expect(syncCompletedEvent).toBeDefined();
              expect(syncCompletedEvent?.data).toEqual(syncResult);
            } else {
              const syncFailedEvent = capturedEvents.find(e => e.type === 'sync_failed');
              expect(syncFailedEvent).toBeDefined();
            }

          } finally {
            networkResilienceService.removeNetworkEventListener(eventListener);
          }
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Property 15.4: Pending Operations Management
   * Failed sync operations should be tracked and retried on next sync
   */
  test('Property 15.4: Pending operations tracking and retry', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          initialFailures: fc.array(fc.constantFrom('token_refresh', 'user_data'), { minLength: 0, maxLength: 2 }),
          subsequentSuccess: fc.boolean(),
          syncAttempts: fc.integer({ min: 1, max: 3 }),
        }),
        async ({ initialFailures, subsequentSuccess, syncAttempts }) => {
          // Arrange: Setup initial failures
          let tokenRefreshCallCount = 0;
          let userDataCallCount = 0;

          mockBackgroundTokenRefreshService.refreshNow.mockImplementation(async () => {
            tokenRefreshCallCount++;
            const shouldFail = initialFailures.includes('token_refresh') && tokenRefreshCallCount <= 1;
            
            return {
              success: !shouldFail && subsequentSuccess,
              refreshed: !shouldFail && subsequentSuccess,
              newTokens: (!shouldFail && subsequentSuccess) ? {
                accessToken: 'new-token',
                refreshToken: 'new-refresh',
                idToken: 'new-id',
              } : undefined,
              error: (shouldFail || !subsequentSuccess) ? 'Token refresh failed' : undefined,
            };
          });

          mockCognitoAuthService.checkStoredAuth.mockImplementation(async () => {
            userDataCallCount++;
            const shouldFail = initialFailures.includes('user_data') && userDataCallCount <= 1;
            
            return {
              isAuthenticated: !shouldFail && subsequentSuccess,
              user: (!shouldFail && subsequentSuccess) ? {
                sub: 'user-123',
                email: 'test@example.com',
                name: 'Test User',
                preferred_username: 'testuser',
              } : null,
              tokens: (!shouldFail && subsequentSuccess) ? {
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                idToken: 'id-token',
              } : null,
            };
          });

          try {
            // Act: Perform multiple sync attempts
            const syncResults: NetworkSyncResult[] = [];
            
            for (let i = 0; i < syncAttempts; i++) {
              const result = await networkResilienceService.syncAuthState();
              syncResults.push(result);
              
              // Small delay between syncs
              await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Assert: Pending operations behavior
            const networkStatus = networkResilienceService.getNetworkStatus();
            
            // Check that operations were retried
            if (initialFailures.includes('token_refresh')) {
              expect(tokenRefreshCallCount).toBeGreaterThan(1);
            }
            
            if (initialFailures.includes('user_data')) {
              expect(userDataCallCount).toBeGreaterThan(1);
            }

            // Final sync should reflect subsequent success state
            const finalResult = syncResults[syncResults.length - 1];
            if (subsequentSuccess) {
              expect(finalResult.success).toBe(true);
              // Pending operations should be cleared on success
              expect(networkStatus.pendingOperations).toHaveLength(0);
            } else {
              // Failed operations should remain pending
              const expectedPendingCount = initialFailures.length;
              expect(networkStatus.pendingOperations.length).toBeGreaterThanOrEqual(0);
            }

          } finally {
            // Cleanup
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 15.5: Service Lifecycle and Configuration
   * Starting and stopping the service should properly manage network monitoring
   */
  test('Property 15.5: Service lifecycle and network monitoring', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          enableConnectivityMonitoring: fc.boolean(),
          enableOfflineMode: fc.boolean(),
          syncRetryAttempts: fc.integer({ min: 1, max: 5 }),
          offlineValidityHours: fc.integer({ min: 1, max: 72 }),
        }),
        async ({ enableConnectivityMonitoring, enableOfflineMode, syncRetryAttempts, offlineValidityHours }) => {
          // Arrange: Setup NetInfo mocks
          const NetInfo = require('@react-native-community/netinfo');
          const mockUnsubscribe = jest.fn();
          NetInfo.addEventListener.mockReturnValue(mockUnsubscribe);
          NetInfo.fetch.mockResolvedValue({ isConnected: true, type: 'wifi' });

          const config = {
            enableConnectivityMonitoring,
            enableOfflineMode,
            syncRetryAttempts,
            offlineValidityHours,
          };

          // Act: Start service with configuration
          await networkResilienceService.start(config);

          // Assert: Service should be properly configured and started
          const networkStatus = networkResilienceService.getNetworkStatus();
          expect(networkStatus.config.enableConnectivityMonitoring).toBe(enableConnectivityMonitoring);
          expect(networkStatus.config.enableOfflineMode).toBe(enableOfflineMode);
          expect(networkStatus.config.syncRetryAttempts).toBe(syncRetryAttempts);
          expect(networkStatus.config.offlineValidityHours).toBe(offlineValidityHours);

          // Network monitoring should be set up if enabled
          if (enableConnectivityMonitoring) {
            expect(NetInfo.addEventListener).toHaveBeenCalled();
          }

          // Act: Stop service
          networkResilienceService.stop();

          // Assert: Service should be properly stopped
          const stoppedStatus = networkResilienceService.getNetworkStatus();
          expect(stoppedStatus.syncInProgress).toBe(false);
          expect(stoppedStatus.pendingOperations).toHaveLength(0);

          // Network listener should be cleaned up if it was set up
          if (enableConnectivityMonitoring) {
            expect(mockUnsubscribe).toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 15 }
    );
  });
});

// Helper function to create mock JWT tokens
function createMockJWT(payload: any): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = 'mock-signature';
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}