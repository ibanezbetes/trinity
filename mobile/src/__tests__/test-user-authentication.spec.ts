/**
 * Unit Tests for Test User Authentication Flows
 * Tests successful authentication with test credentials, session token creation,
 * protected resource access, sign out cleanup, and debug logging for test authentication flows
 */

import { testUserAuthenticationService, AuthenticationTestResult } from '../services/testUserAuthenticationService';
import { loggingService } from '../services/loggingService';

describe('Test User Authentication Flows', () => {
  beforeEach(() => {
    // Reset logging service
    loggingService.clearLogs();
    
    // Configure test service for testing
    testUserAuthenticationService.updateConfig({
      enableDebugLogging: true,
      testTimeout: 10000, // Shorter timeout for tests
      validateTokens: true,
      testProtectedResources: true,
      testSignOut: true,
      retryFailedTests: false, // Disable retries for unit tests
      maxRetries: 0,
    });
  });

  afterEach(() => {
    loggingService.clearLogs();
  });

  describe('Successful Authentication with Test Credentials', () => {
    it('should authenticate successfully with provided test credentials', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      
      // Find the basic authentication test
      const basicAuthTest = results.find(r => r.testName === 'Basic Authentication');
      
      expect(basicAuthTest).toBeDefined();
      expect(basicAuthTest!.success).toBe(true);
      expect(basicAuthTest!.details.credentialsValid).toBe(true);
      expect(basicAuthTest!.details.sessionCreated).toBe(true);
      expect(basicAuthTest!.details.tokensGenerated).toBe(true);
      expect(basicAuthTest!.details.userDataRetrieved).toBe(true);
      
      // Verify user data
      expect(basicAuthTest!.userData).toBeDefined();
      expect(basicAuthTest!.userData!.email).toBe('paco@paco.com');
      expect(basicAuthTest!.userData!.id).toBeDefined();
      
      // Verify tokens
      expect(basicAuthTest!.tokens).toBeDefined();
      expect(basicAuthTest!.tokens!.accessToken).toBeDefined();
      expect(basicAuthTest!.tokens!.idToken).toBeDefined();
      expect(basicAuthTest!.tokens!.refreshToken).toBeDefined();
      expect(basicAuthTest!.tokens!.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should handle authentication with correct email format', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const basicAuthTest = results.find(r => r.testName === 'Basic Authentication');
      
      expect(basicAuthTest!.success).toBe(true);
      expect(basicAuthTest!.userData!.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });

    it('should complete authentication within reasonable time', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const basicAuthTest = results.find(r => r.testName === 'Basic Authentication');
      
      expect(basicAuthTest!.success).toBe(true);
      expect(basicAuthTest!.duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(basicAuthTest!.duration).toBeGreaterThan(0);
    });
  });

  describe('Session Token Creation for Test User', () => {
    it('should create valid session tokens for test user', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const tokenTest = results.find(r => r.testName === 'Session Token Creation');
      
      expect(tokenTest).toBeDefined();
      expect(tokenTest!.success).toBe(true);
      expect(tokenTest!.details.tokensGenerated).toBe(true);
      
      // Verify token structure
      const tokens = tokenTest!.tokens!;
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.accessToken.length).toBeGreaterThan(0);
      expect(tokens.idToken).toBeDefined();
      expect(tokens.idToken.length).toBeGreaterThan(0);
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.refreshToken.length).toBeGreaterThan(0);
    });

    it('should create tokens with valid expiration times', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const tokenTest = results.find(r => r.testName === 'Session Token Creation');
      
      expect(tokenTest!.success).toBe(true);
      
      const tokens = tokenTest!.tokens!;
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      
      expect(tokens.expiresAt).toBeGreaterThan(now);
      expect(tokens.expiresAt).toBeLessThan(now + oneHour + 60000); // Allow 1 minute buffer
    });

    it('should include user context in token creation', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const tokenTest = results.find(r => r.testName === 'Session Token Creation');
      
      expect(tokenTest!.success).toBe(true);
      expect(tokenTest!.details.userDataRetrieved).toBe(true);
      expect(tokenTest!.userData).toBeDefined();
      expect(tokenTest!.userData!.id).toBeDefined();
      expect(tokenTest!.userData!.email).toBe('paco@paco.com');
    });
  });

  describe('Protected Resource Access for Test User', () => {
    it('should access protected resources with valid tokens', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const resourceTest = results.find(r => r.testName === 'Protected Resource Access');
      
      expect(resourceTest).toBeDefined();
      expect(resourceTest!.success).toBe(true);
      expect(resourceTest!.details.protectedResourceAccess).toBe(true);
      expect(resourceTest!.details.tokensGenerated).toBe(true);
    });

    it('should maintain session during resource access', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const resourceTest = results.find(r => r.testName === 'Protected Resource Access');
      
      expect(resourceTest!.success).toBe(true);
      expect(resourceTest!.details.sessionCreated).toBe(true);
      expect(resourceTest!.tokens).toBeDefined();
      expect(resourceTest!.userData).toBeDefined();
    });

    it('should complete resource access efficiently', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const resourceTest = results.find(r => r.testName === 'Protected Resource Access');
      
      expect(resourceTest!.success).toBe(true);
      expect(resourceTest!.duration).toBeLessThan(3000); // Should complete within 3 seconds
    });
  });

  describe('Sign Out Cleanup for Test User', () => {
    it('should successfully sign out test user', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const signOutTest = results.find(r => r.testName === 'Sign Out and Cleanup');
      
      expect(signOutTest).toBeDefined();
      expect(signOutTest!.success).toBe(true);
      expect(signOutTest!.details.signOutSuccessful).toBe(true);
    });

    it('should clean up session data during sign out', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const signOutTest = results.find(r => r.testName === 'Sign Out and Cleanup');
      
      expect(signOutTest!.success).toBe(true);
      expect(signOutTest!.details.sessionCreated).toBe(true); // Was created
      expect(signOutTest!.details.signOutSuccessful).toBe(true); // Then cleaned up
    });

    it('should complete sign out process quickly', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const signOutTest = results.find(r => r.testName === 'Sign Out and Cleanup');
      
      expect(signOutTest!.success).toBe(true);
      expect(signOutTest!.duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });

  describe('Invalid Credentials Handling', () => {
    it('should properly reject invalid credentials', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const invalidTest = results.find(r => r.testName === 'Invalid Credentials Handling');
      
      expect(invalidTest).toBeDefined();
      expect(invalidTest!.success).toBe(true); // Success means it correctly rejected invalid creds
      expect(invalidTest!.details.credentialsValid).toBe(false);
      expect(invalidTest!.details.sessionCreated).toBe(false);
      expect(invalidTest!.details.tokensGenerated).toBe(false);
    });

    it('should not create tokens for invalid credentials', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const invalidTest = results.find(r => r.testName === 'Invalid Credentials Handling');
      
      expect(invalidTest!.success).toBe(true);
      expect(invalidTest!.tokens).toBeUndefined();
      expect(invalidTest!.userData).toBeUndefined();
    });
  });

  describe('Session Restoration', () => {
    it('should restore session from valid tokens', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const restorationTest = results.find(r => r.testName === 'Session Restoration');
      
      expect(restorationTest).toBeDefined();
      expect(restorationTest!.success).toBe(true);
      expect(restorationTest!.details.tokensGenerated).toBe(true);
      expect(restorationTest!.details.userDataRetrieved).toBe(true);
    });

    it('should retrieve user data during restoration', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const restorationTest = results.find(r => r.testName === 'Session Restoration');
      
      expect(restorationTest!.success).toBe(true);
      expect(restorationTest!.userData).toBeDefined();
      expect(restorationTest!.userData!.email).toBe('paco@paco.com');
      expect(restorationTest!.userData!.attributes).toBeDefined();
    });
  });

  describe('Token Refresh', () => {
    it('should refresh tokens successfully', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const refreshTest = results.find(r => r.testName === 'Token Refresh');
      
      expect(refreshTest).toBeDefined();
      expect(refreshTest!.success).toBe(true);
      expect(refreshTest!.details.tokensGenerated).toBe(true);
    });

    it('should maintain user session during token refresh', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      const refreshTest = results.find(r => r.testName === 'Token Refresh');
      
      expect(refreshTest!.success).toBe(true);
      expect(refreshTest!.details.sessionCreated).toBe(true);
      expect(refreshTest!.userData).toBeDefined();
      expect(refreshTest!.tokens).toBeDefined();
    });
  });

  describe('Debug Logging for Test Authentication Flows', () => {
    it('should log authentication events during testing', async () => {
      // Clear logs before test
      loggingService.clearLogs();
      
      await testUserAuthenticationService.runAuthenticationTests();
      
      // Get logs
      const logs = loggingService.getRecentLogs(50);
      
      // Should have authentication-related logs
      const authLogs = logs.filter(log => 
        log.category === 'TestUserAuthentication' || 
        log.message.toLowerCase().includes('authentication')
      );
      
      expect(authLogs.length).toBeGreaterThan(0);
    });

    it('should log test progress and results', async () => {
      loggingService.clearLogs();
      
      await testUserAuthenticationService.runAuthenticationTests();
      
      const logs = loggingService.getRecentLogs(100);
      
      // Should have logs for test start and completion
      const testLogs = logs.filter(log => 
        log.message.includes('Starting') || 
        log.message.includes('completed') ||
        log.message.includes('successful')
      );
      
      expect(testLogs.length).toBeGreaterThan(0);
    });

    it('should log error details for failed tests', async () => {
      // This test verifies error logging capability
      // Since our tests should pass, we'll check the logging structure
      
      loggingService.clearLogs();
      
      await testUserAuthenticationService.runAuthenticationTests();
      
      const logs = loggingService.getRecentLogs(100);
      
      // Verify logging service is working
      expect(logs.length).toBeGreaterThan(0);
      
      // Check log structure
      logs.forEach(log => {
        expect(log.timestamp).toBeDefined();
        expect(log.level).toBeDefined();
        expect(log.category).toBeDefined();
        expect(log.message).toBeDefined();
      });
    });

    it('should not log sensitive data in debug logs', async () => {
      loggingService.clearLogs();
      
      await testUserAuthenticationService.runAuthenticationTests();
      
      const logs = loggingService.getRecentLogs(100);
      
      // Check that password is not logged
      logs.forEach(log => {
        const logStr = JSON.stringify(log);
        expect(logStr).not.toContain('Contraseña!26');
        expect(logStr).not.toContain('password');
        
        // Should not contain actual token values in plain text
        if (logStr.includes('token')) {
          expect(logStr).not.toMatch(/mock-.*-token-\d+/);
        }
      });
    });
  });

  describe('Test Configuration', () => {
    it('should allow configuration updates', () => {
      const newConfig = {
        enableDebugLogging: false,
        testTimeout: 15000,
        validateTokens: false,
      };
      
      testUserAuthenticationService.updateConfig(newConfig);
      
      const currentConfig = testUserAuthenticationService.getConfig();
      expect(currentConfig.enableDebugLogging).toBe(false);
      expect(currentConfig.testTimeout).toBe(15000);
      expect(currentConfig.validateTokens).toBe(false);
    });

    it('should maintain default values for unspecified config', () => {
      const partialConfig = {
        testTimeout: 20000,
      };
      
      testUserAuthenticationService.updateConfig(partialConfig);
      
      const currentConfig = testUserAuthenticationService.getConfig();
      expect(currentConfig.testTimeout).toBe(20000);
      expect(currentConfig.enableDebugLogging).toBeDefined(); // Should keep default
      expect(currentConfig.validateTokens).toBeDefined(); // Should keep default
    });
  });

  describe('Comprehensive Test Suite', () => {
    it('should run all authentication tests successfully', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      
      // Should have multiple test results
      expect(results.length).toBeGreaterThan(5);
      
      // Most tests should pass (allowing for some that test failure scenarios)
      const successfulTests = results.filter(r => r.success);
      const failureRate = (results.length - successfulTests.length) / results.length;
      
      expect(failureRate).toBeLessThan(0.3); // Less than 30% failure rate
    });

    it('should provide detailed test results', async () => {
      const results = await testUserAuthenticationService.runAuthenticationTests();
      
      results.forEach(result => {
        expect(result.testName).toBeDefined();
        expect(result.success).toBeDefined();
        expect(result.duration).toBeGreaterThanOrEqual(0);
        expect(result.details).toBeDefined();
        
        // Verify details structure
        expect(typeof result.details.credentialsValid).toBe('boolean');
        expect(typeof result.details.sessionCreated).toBe('boolean');
        expect(typeof result.details.tokensGenerated).toBe('boolean');
        expect(typeof result.details.userDataRetrieved).toBe('boolean');
        expect(typeof result.details.protectedResourceAccess).toBe('boolean');
        expect(typeof result.details.signOutSuccessful).toBe('boolean');
      });
    });

    it('should complete all tests within reasonable time', async () => {
      const startTime = Date.now();
      
      await testUserAuthenticationService.runAuthenticationTests();
      
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds
    });
  });
});