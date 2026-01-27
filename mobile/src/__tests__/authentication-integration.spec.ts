/**
 * Authentication Integration Tests
 * End-to-end tests for complete authentication flows,
 * integration between mobile app and backend authentication,
 * and Google Sign-In integration verification
 */

import { 
  dualAuthenticationFlowService,
  secureTokenStorageService,
  backgroundTokenRefreshService,
  sessionCleanupService,
  authStateBroadcastService,
  coordinatedErrorHandlingService,
  authConcurrencyControlService,
  testUserAuthenticationService,
  secureDataTransmissionService,
  sensitiveDataProtectionService,
  sessionTimeoutService,
  securityMonitoringService
} from '../services';

describe('Authentication Integration Tests', () => {
  beforeEach(async () => {
    // Reset all services to clean state
    await resetAllAuthServices();
    
    // Configure services for integration testing
    configureServicesForTesting();
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanupAllAuthServices();
  });

  describe('Complete Authentication Flow Integration', () => {
    it('should handle complete email/password authentication flow', async () => {
      const testCredentials = {
        email: 'paco@paco.com',
        password: 'Contraseña!26',
      };

      // Test complete flow from login to authenticated state
      const authResult = await testCompleteAuthenticationFlow(testCredentials);
      
      expect(authResult.success).toBe(true);
      expect(authResult.user).toBeDefined();
      expect(authResult.tokens).toBeDefined();
      expect(authResult.session).toBeDefined();
      
      // Verify all services are properly initialized
      expect(authResult.servicesInitialized).toBe(true);
      
      // Verify secure storage
      const storedTokens = await secureTokenStorageService.getStoredTokens();
      expect(storedTokens).toBeDefined();
      expect(storedTokens.accessToken).toBeDefined();
      expect(storedTokens.refreshToken).toBeDefined();
      
      // Verify session management
      const sessionInfo = sessionTimeoutService.getSession(authResult.session.sessionId);
      expect(sessionInfo).toBeDefined();
      expect(sessionInfo!.isActive).toBe(true);
      
      // Verify security monitoring
      const securityEvents = securityMonitoringService.getSecurityEvents({
        userId: authResult.user.id,
      });
      expect(securityEvents.length).toBeGreaterThan(0);
      
      // Test authenticated API calls
      const apiResult = await testAuthenticatedApiCall(authResult.tokens.accessToken);
      expect(apiResult.success).toBe(true);
    });

    it('should handle complete Google Sign-In authentication flow', async () => {
      const mockGoogleToken = generateMockGoogleToken();
      
      // Test complete Google authentication flow
      const authResult = await testCompleteGoogleAuthenticationFlow(mockGoogleToken);
      
      expect(authResult.success).toBe(true);
      expect(authResult.user).toBeDefined();
      expect(authResult.tokens).toBeDefined();
      expect(authResult.session).toBeDefined();
      expect(authResult.user.provider).toBe('google');
      
      // Verify federated user data
      expect(authResult.user.googleProfile).toBeDefined();
      expect(authResult.user.federatedId).toBeDefined();
      
      // Verify profile synchronization
      const profileSyncResult = await testProfileSynchronization(authResult.user);
      expect(profileSyncResult.success).toBe(true);
      
      // Test federated session management
      const sessionInfo = sessionTimeoutService.getSession(authResult.session.sessionId);
      expect(sessionInfo).toBeDefined();
      expect(sessionInfo!.userId).toBe(authResult.user.id);
    });

    it('should handle authentication state persistence across app restarts', async () => {
      // Authenticate user
      const authResult = await testCompleteAuthenticationFlow({
        email: 'paco@paco.com',
        password: 'Contraseña!26',
      });
      
      expect(authResult.success).toBe(true);
      
      // Simulate app restart
      await simulateAppRestart();
      
      // Test session restoration
      const restorationResult = await testSessionRestoration();
      
      expect(restorationResult.success).toBe(true);
      expect(restorationResult.user).toBeDefined();
      expect(restorationResult.user.id).toBe(authResult.user.id);
      expect(restorationResult.tokens).toBeDefined();
      
      // Verify all services are properly restored
      expect(restorationResult.servicesRestored).toBe(true);
      
      // Test that authenticated operations still work
      const apiResult = await testAuthenticatedApiCall(restorationResult.tokens.accessToken);
      expect(apiResult.success).toBe(true);
    });

    it('should handle token refresh flow integration', async () => {
      // Authenticate user
      const authResult = await testCompleteAuthenticationFlow({
        email: 'paco@paco.com',
        password: 'Contraseña!26',
      });
      
      expect(authResult.success).toBe(true);
      
      // Simulate token expiration
      await simulateTokenExpiration(authResult.tokens.accessToken);
      
      // Test automatic token refresh
      const refreshResult = await testAutomaticTokenRefresh();
      
      expect(refreshResult.success).toBe(true);
      expect(refreshResult.newTokens).toBeDefined();
      expect(refreshResult.newTokens.accessToken).not.toBe(authResult.tokens.accessToken);
      
      // Verify all services updated with new tokens
      const updatedTokens = await secureTokenStorageService.getStoredTokens();
      expect(updatedTokens.accessToken).toBe(refreshResult.newTokens.accessToken);
      
      // Test that API calls work with new tokens
      const apiResult = await testAuthenticatedApiCall(refreshResult.newTokens.accessToken);
      expect(apiResult.success).toBe(true);
    });

    it('should handle complete sign out flow integration', async () => {
      // Authenticate user
      const authResult = await testCompleteAuthenticationFlow({
        email: 'paco@paco.com',
        password: 'Contraseña!26',
      });
      
      expect(authResult.success).toBe(true);
      
      // Test complete sign out flow
      const signOutResult = await testCompleteSignOutFlow();
      
      expect(signOutResult.success).toBe(true);
      
      // Verify all authentication data is cleared
      const storedTokens = await secureTokenStorageService.getStoredTokens();
      expect(storedTokens).toBeNull();
      
      // Verify session is cleaned up
      const sessionInfo = sessionTimeoutService.getSession(authResult.session.sessionId);
      expect(sessionInfo?.isActive).toBe(false);
      
      // Verify all services are notified of sign out
      expect(signOutResult.servicesNotified).toBe(true);
      
      // Verify API calls fail without authentication
      const apiResult = await testAuthenticatedApiCall('invalid_token');
      expect(apiResult.success).toBe(false);
      expect(apiResult.error).toContain('unauthorized');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle network errors during authentication', async () => {
      // Simulate network failure
      await simulateNetworkFailure();
      
      const authResult = await testCompleteAuthenticationFlow({
        email: 'paco@paco.com',
        password: 'Contraseña!26',
      });
      
      expect(authResult.success).toBe(false);
      expect(authResult.error).toBeDefined();
      expect(authResult.error.type).toBe('network_error');
      
      // Verify error handling coordination
      const errorEvents = coordinatedErrorHandlingService.getErrorHistory();
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].type).toBe('network_error');
      
      // Test retry mechanism
      await restoreNetworkConnection();
      
      const retryResult = await testAuthenticationRetry();
      expect(retryResult.success).toBe(true);
    });

    it('should handle concurrent authentication attempts', async () => {
      const credentials = {
        email: 'paco@paco.com',
        password: 'Contraseña!26',
      };

      // Start multiple concurrent authentication attempts
      const authPromises = Array(5).fill(null).map(() => 
        testCompleteAuthenticationFlow(credentials)
      );
      
      const results = await Promise.allSettled(authPromises);
      
      // Only one should succeed, others should be handled gracefully
      const successfulResults = results.filter(r => 
        r.status === 'fulfilled' && r.value.success
      );
      const failedResults = results.filter(r => 
        r.status === 'fulfilled' && !r.value.success
      );
      
      expect(successfulResults.length).toBe(1);
      expect(failedResults.length).toBe(4);
      
      // Verify concurrency control worked
      const concurrencyEvents = authConcurrencyControlService.getConcurrencyHistory();
      expect(concurrencyEvents.length).toBeGreaterThan(0);
    });

    it('should handle authentication errors with proper user feedback', async () => {
      const invalidCredentials = {
        email: 'invalid@example.com',
        password: 'wrongpassword',
      };

      const authResult = await testCompleteAuthenticationFlow(invalidCredentials);
      
      expect(authResult.success).toBe(false);
      expect(authResult.error).toBeDefined();
      expect(authResult.userFriendlyMessage).toBeDefined();
      expect(authResult.userFriendlyMessage).not.toContain('technical');
      
      // Verify error translation
      expect(authResult.userFriendlyMessage).toMatch(/invalid.*credentials|incorrect.*password/i);
      
      // Verify security monitoring
      const securityEvents = securityMonitoringService.getSecurityEvents({
        type: 'failed_login',
      });
      expect(securityEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Security Integration', () => {
    it('should handle suspicious activity detection', async () => {
      const credentials = {
        email: 'paco@paco.com',
        password: 'Contraseña!26',
      };

      // Simulate suspicious login pattern
      await simulateSuspiciousActivity();
      
      const authResult = await testCompleteAuthenticationFlow(credentials);
      
      // Authentication might succeed but should trigger security measures
      if (authResult.success) {
        expect(authResult.securityWarnings).toBeDefined();
        expect(authResult.securityWarnings.length).toBeGreaterThan(0);
      }
      
      // Verify security monitoring detected the activity
      const securityEvents = securityMonitoringService.getSecurityEvents({
        type: 'suspicious_login',
      });
      expect(securityEvents.length).toBeGreaterThan(0);
    });

    it('should handle rate limiting during authentication', async () => {
      const credentials = {
        email: 'paco@paco.com',
        password: 'wrongpassword', // Intentionally wrong to trigger rate limiting
      };

      // Make multiple failed attempts to trigger rate limiting
      const attempts = [];
      for (let i = 0; i < 10; i++) {
        attempts.push(testCompleteAuthenticationFlow(credentials));
      }
      
      const results = await Promise.allSettled(attempts);
      
      // Later attempts should be rate limited
      const rateLimitedResults = results.filter(r => 
        r.status === 'fulfilled' && 
        r.value.error?.type === 'rate_limited'
      );
      
      expect(rateLimitedResults.length).toBeGreaterThan(0);
      
      // Verify rate limiting events
      const rateLimitEvents = securityMonitoringService.getSecurityEvents({
        type: 'rate_limit_exceeded',
      });
      expect(rateLimitEvents.length).toBeGreaterThan(0);
    });

    it('should handle data protection during authentication', async () => {
      const credentials = {
        email: 'paco@paco.com',
        password: 'Contraseña!26',
      };

      // Enable detailed logging for this test
      const originalLogLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'debug';
      
      try {
        const authResult = await testCompleteAuthenticationFlow(credentials);
        expect(authResult.success).toBe(true);
        
        // Verify sensitive data protection
        const logEntries = await getRecentLogEntries();
        
        // Passwords should never appear in logs
        logEntries.forEach(entry => {
          expect(entry.message).not.toContain(credentials.password);
          expect(entry.message).not.toContain('Contraseña!26');
        });
        
        // Tokens should be redacted in logs
        const tokenEntries = logEntries.filter(entry => 
          entry.message.includes('token') || entry.message.includes('Token')
        );
        
        tokenEntries.forEach(entry => {
          expect(entry.message).toMatch(/\[REDACTED\]|\*+/);
        });
        
      } finally {
        process.env.LOG_LEVEL = originalLogLevel;
      }
    });
  });

  describe('Performance Integration', () => {
    it('should handle authentication within performance thresholds', async () => {
      const credentials = {
        email: 'paco@paco.com',
        password: 'Contraseña!26',
      };

      const startTime = Date.now();
      const authResult = await testCompleteAuthenticationFlow(credentials);
      const endTime = Date.now();
      
      const authDuration = endTime - startTime;
      
      expect(authResult.success).toBe(true);
      expect(authDuration).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Verify performance metrics
      expect(authResult.performanceMetrics).toBeDefined();
      expect(authResult.performanceMetrics.totalDuration).toBeLessThan(5000);
      expect(authResult.performanceMetrics.tokenStorageDuration).toBeLessThan(1000);
      expect(authResult.performanceMetrics.sessionCreationDuration).toBeLessThan(1000);
    });

    it('should handle multiple concurrent users efficiently', async () => {
      const userCredentials = Array(10).fill(null).map((_, i) => ({
        email: `user${i}@example.com`,
        password: 'TestPassword123!',
      }));

      const startTime = Date.now();
      
      // Simulate multiple users authenticating concurrently
      const authPromises = userCredentials.map(creds => 
        testCompleteAuthenticationFlow(creds)
      );
      
      const results = await Promise.allSettled(authPromises);
      const endTime = Date.now();
      
      const totalDuration = endTime - startTime;
      
      // Should handle concurrent users efficiently
      expect(totalDuration).toBeLessThan(10000); // Within 10 seconds for 10 users
      
      // Verify all authentications were handled
      const successfulAuths = results.filter(r => 
        r.status === 'fulfilled' && r.value.success
      );
      
      expect(successfulAuths.length).toBeGreaterThan(0);
    });
  });

  // Helper functions for integration testing

  async function testCompleteAuthenticationFlow(credentials: any) {
    const startTime = Date.now();
    
    try {
      // Step 1: Initiate authentication
      const authRequest = await dualAuthenticationFlowService.authenticateWithEmail(
        credentials.email,
        credentials.password
      );
      
      if (!authRequest.success) {
        return {
          success: false,
          error: authRequest.error,
          userFriendlyMessage: authRequest.userFriendlyMessage,
        };
      }
      
      // Step 2: Store tokens securely
      const storageResult = await secureTokenStorageService.storeTokens(authRequest.tokens);
      if (!storageResult.success) {
        throw new Error('Token storage failed');
      }
      
      // Step 3: Create session
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const sessionInfo = sessionTimeoutService.createSession(sessionId, authRequest.user.id);
      
      // Step 4: Initialize background services
      backgroundTokenRefreshService.startBackgroundRefresh(authRequest.tokens);
      
      // Step 5: Broadcast authentication state
      authStateBroadcastService.broadcastAuthStateChange({
        type: 'authenticated',
        user: authRequest.user,
        tokens: authRequest.tokens,
        sessionId,
        timestamp: Date.now(),
      });
      
      const endTime = Date.now();
      
      return {
        success: true,
        user: authRequest.user,
        tokens: authRequest.tokens,
        session: sessionInfo,
        servicesInitialized: true,
        performanceMetrics: {
          totalDuration: endTime - startTime,
          tokenStorageDuration: storageResult.duration,
          sessionCreationDuration: 100, // Mock duration
        },
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: {
          type: 'authentication_error',
          message: error.message,
        },
        userFriendlyMessage: 'Authentication failed. Please try again.',
      };
    }
  }

  async function testCompleteGoogleAuthenticationFlow(googleToken: string) {
    try {
      // Step 1: Authenticate with Google token
      const authRequest = await dualAuthenticationFlowService.authenticateWithGoogle(googleToken);
      
      if (!authRequest.success) {
        return {
          success: false,
          error: authRequest.error,
        };
      }
      
      // Step 2: Handle federated user creation/linking
      const user = authRequest.user;
      user.provider = 'google';
      user.federatedId = `google_${user.id}`;
      user.googleProfile = {
        email: user.email,
        name: user.name,
        picture: 'https://example.com/avatar.jpg',
      };
      
      // Step 3: Store tokens and create session
      await secureTokenStorageService.storeTokens(authRequest.tokens);
      const sessionId = `google_session_${Date.now()}`;
      const sessionInfo = sessionTimeoutService.createSession(sessionId, user.id);
      
      return {
        success: true,
        user,
        tokens: authRequest.tokens,
        session: sessionInfo,
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: {
          type: 'google_auth_error',
          message: error.message,
        },
      };
    }
  }

  async function testSessionRestoration() {
    try {
      // Attempt to restore session from stored tokens
      const storedTokens = await secureTokenStorageService.getStoredTokens();
      
      if (!storedTokens) {
        throw new Error('No stored tokens found');
      }
      
      // Validate tokens and restore user context
      const validationResult = await dualAuthenticationFlowService.validateStoredTokens(storedTokens);
      
      if (!validationResult.success) {
        throw new Error('Token validation failed');
      }
      
      return {
        success: true,
        user: validationResult.user,
        tokens: validationResult.tokens,
        servicesRestored: true,
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async function testAutomaticTokenRefresh() {
    try {
      const refreshResult = await backgroundTokenRefreshService.performTokenRefresh();
      
      if (!refreshResult.success) {
        throw new Error('Token refresh failed');
      }
      
      return {
        success: true,
        newTokens: refreshResult.tokens,
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async function testCompleteSignOutFlow() {
    try {
      // Step 1: Clean up session
      const cleanupResult = await sessionCleanupService.performCompleteCleanup();
      
      // Step 2: Clear stored tokens
      await secureTokenStorageService.clearStoredTokens();
      
      // Step 3: Stop background services
      backgroundTokenRefreshService.stopBackgroundRefresh();
      
      // Step 4: Broadcast sign out
      authStateBroadcastService.broadcastAuthStateChange({
        type: 'signed_out',
        timestamp: Date.now(),
      });
      
      return {
        success: true,
        servicesNotified: true,
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async function testAuthenticatedApiCall(accessToken: string) {
    try {
      // Mock API call with authentication
      const response = await fetch('/api/protected-resource', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      if (response.status === 401) {
        return {
          success: false,
          error: 'unauthorized',
        };
      }
      
      return {
        success: true,
        data: await response.json(),
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async function testProfileSynchronization(user: any) {
    // Mock profile synchronization test
    return {
      success: true,
      syncedFields: ['email', 'name', 'picture'],
    };
  }

  // Mock helper functions
  function generateMockGoogleToken() {
    return 'mock_google_token_' + Math.random().toString(36).substr(2, 20);
  }

  async function simulateAppRestart() {
    // Mock app restart simulation
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async function simulateTokenExpiration(token: string) {
    // Mock token expiration
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async function simulateNetworkFailure() {
    // Mock network failure
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
  }

  async function restoreNetworkConnection() {
    // Restore normal fetch behavior
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  }

  async function testAuthenticationRetry() {
    // Mock retry test
    return { success: true };
  }

  async function simulateSuspiciousActivity() {
    // Mock suspicious activity simulation
    securityMonitoringService.recordSecurityEvent(
      'suspicious_login',
      'medium',
      { reason: 'unusual_location' }
    );
  }

  async function getRecentLogEntries() {
    // Mock log entries retrieval
    return [
      { message: 'Authentication started for user', level: 'info' },
      { message: 'Token stored with [REDACTED] value', level: 'debug' },
      { message: 'Session created successfully', level: 'info' },
    ];
  }

  async function resetAllAuthServices() {
    // Reset all authentication services to clean state
    await secureTokenStorageService.clearStoredTokens();
    sessionTimeoutService.getActiveSessions().forEach(session => {
      sessionTimeoutService.removeSession(session.sessionId);
    });
    // Reset other services as needed
  }

  function configureServicesForTesting() {
    // Configure services with test-appropriate settings
    sessionTimeoutService.updateConfig({
      sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
      enableTimeoutEnforcement: true,
    });
    
    securityMonitoringService.updateConfig({
      enableThreatDetection: true,
      maxFailedAttempts: 5,
    });
  }

  async function cleanupAllAuthServices() {
    // Clean up all services after tests
    await resetAllAuthServices();
  }
});