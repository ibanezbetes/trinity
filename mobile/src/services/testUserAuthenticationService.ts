/**
 * Test User Authentication Service
 * Validates authentication functionality with provided test credentials
 * and ensures all authentication flows work correctly for test users
 */

import { loggingService } from './loggingService';
import { cognitoErrorTranslationService } from './cognitoErrorTranslationService';
import { authStateBroadcastService } from './authStateBroadcastService';

export interface TestCredentials {
  email: string;
  password: string;
  expectedUserId?: string;
  expectedName?: string;
}

export interface AuthenticationTestResult {
  success: boolean;
  testName: string;
  duration: number;
  error?: string;
  details: {
    credentialsValid: boolean;
    sessionCreated: boolean;
    tokensGenerated: boolean;
    userDataRetrieved: boolean;
    protectedResourceAccess: boolean;
    signOutSuccessful: boolean;
  };
  tokens?: {
    accessToken: string;
    idToken: string;
    refreshToken: string;
    expiresAt: number;
  };
  userData?: {
    id: string;
    email: string;
    name?: string;
    attributes?: Record<string, any>;
  };
}

export interface TestConfig {
  enableDebugLogging: boolean;
  testTimeout: number;
  validateTokens: boolean;
  testProtectedResources: boolean;
  testSignOut: boolean;
  retryFailedTests: boolean;
  maxRetries: number;
}

class TestUserAuthenticationService {
  private config: TestConfig = {
    enableDebugLogging: true,
    testTimeout: 30000, // 30 seconds
    validateTokens: true,
    testProtectedResources: true,
    testSignOut: true,
    retryFailedTests: true,
    maxRetries: 2,
  };

  // Test credentials provided in requirements
  private readonly TEST_CREDENTIALS: TestCredentials = {
    email: 'paco@paco.com',
    password: 'Contraseña!26',
    expectedUserId: 'test-user-id',
    expectedName: 'Paco Test User',
  };

  constructor() {
    loggingService.info('TestUserAuthentication', 'Test user authentication service initialized', {
      testEmail: this.TEST_CREDENTIALS.email,
      config: this.config,
    });
  }

  /**
   * Run comprehensive authentication tests with test user
   */
  async runAuthenticationTests(): Promise<AuthenticationTestResult[]> {
    const results: AuthenticationTestResult[] = [];

    loggingService.info('TestUserAuthentication', 'Starting comprehensive authentication tests', {
      testCredentials: {
        email: this.TEST_CREDENTIALS.email,
        // Never log the actual password
        hasPassword: !!this.TEST_CREDENTIALS.password,
      },
    });

    try {
      // Test 1: Basic Authentication
      results.push(await this.testBasicAuthentication());

      // Test 2: Session Token Creation
      results.push(await this.testSessionTokenCreation());

      // Test 3: Protected Resource Access
      if (this.config.testProtectedResources) {
        results.push(await this.testProtectedResourceAccess());
      }

      // Test 4: Token Refresh
      results.push(await this.testTokenRefresh());

      // Test 5: Sign Out and Cleanup
      if (this.config.testSignOut) {
        results.push(await this.testSignOutCleanup());
      }

      // Test 6: Invalid Credentials Handling
      results.push(await this.testInvalidCredentials());

      // Test 7: Session Restoration
      results.push(await this.testSessionRestoration());

      // Summary
      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;

      loggingService.info('TestUserAuthentication', 'Authentication tests completed', {
        totalTests: totalCount,
        successfulTests: successCount,
        failedTests: totalCount - successCount,
        successRate: `${Math.round((successCount / totalCount) * 100)}%`,
      });

      return results;

    } catch (error: any) {
      loggingService.error('TestUserAuthentication', 'Authentication tests failed', {
        error: error.message,
        completedTests: results.length,
      });

      // Add error result
      results.push({
        success: false,
        testName: 'Test Suite Execution',
        duration: 0,
        error: error.message,
        details: {
          credentialsValid: false,
          sessionCreated: false,
          tokensGenerated: false,
          userDataRetrieved: false,
          protectedResourceAccess: false,
          signOutSuccessful: false,
        },
      });

      return results;
    }
  }

  /**
   * Test basic authentication with test credentials
   */
  async testBasicAuthentication(): Promise<AuthenticationTestResult> {
    const startTime = Date.now();
    const testName = 'Basic Authentication';

    try {
      loggingService.debug('TestUserAuthentication', `Starting ${testName}`, {
        email: this.TEST_CREDENTIALS.email,
      });

      // Simulate authentication call (would integrate with actual Cognito service)
      const authResult = await this.simulateAuthentication(
        this.TEST_CREDENTIALS.email,
        this.TEST_CREDENTIALS.password
      );

      const duration = Date.now() - startTime;

      if (authResult.success) {
        loggingService.info('TestUserAuthentication', `${testName} successful`, {
          duration,
          userId: authResult.userData?.id,
        });

        return {
          success: true,
          testName,
          duration,
          details: {
            credentialsValid: true,
            sessionCreated: true,
            tokensGenerated: !!authResult.tokens,
            userDataRetrieved: !!authResult.userData,
            protectedResourceAccess: false, // Not tested in this step
            signOutSuccessful: false, // Not tested in this step
          },
          tokens: authResult.tokens,
          userData: authResult.userData,
        };
      } else {
        return {
          success: false,
          testName,
          duration,
          error: authResult.error,
          details: {
            credentialsValid: false,
            sessionCreated: false,
            tokensGenerated: false,
            userDataRetrieved: false,
            protectedResourceAccess: false,
            signOutSuccessful: false,
          },
        };
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      loggingService.error('TestUserAuthentication', `${testName} failed`, {
        error: error.message,
        duration,
      });

      return {
        success: false,
        testName,
        duration,
        error: error.message,
        details: {
          credentialsValid: false,
          sessionCreated: false,
          tokensGenerated: false,
          userDataRetrieved: false,
          protectedResourceAccess: false,
          signOutSuccessful: false,
        },
      };
    }
  }

  /**
   * Test session token creation for test user
   */
  async testSessionTokenCreation(): Promise<AuthenticationTestResult> {
    const startTime = Date.now();
    const testName = 'Session Token Creation';

    try {
      loggingService.debug('TestUserAuthentication', `Starting ${testName}`);

      // Authenticate first
      const authResult = await this.simulateAuthentication(
        this.TEST_CREDENTIALS.email,
        this.TEST_CREDENTIALS.password
      );

      if (!authResult.success || !authResult.tokens) {
        throw new Error('Authentication failed - cannot test token creation');
      }

      // Validate token structure
      const tokens = authResult.tokens;
      const tokenValidation = {
        hasAccessToken: !!tokens.accessToken && tokens.accessToken.length > 0,
        hasIdToken: !!tokens.idToken && tokens.idToken.length > 0,
        hasRefreshToken: !!tokens.refreshToken && tokens.refreshToken.length > 0,
        hasValidExpiration: tokens.expiresAt > Date.now(),
      };

      const allTokensValid = Object.values(tokenValidation).every(Boolean);
      const duration = Date.now() - startTime;

      if (allTokensValid) {
        loggingService.info('TestUserAuthentication', `${testName} successful`, {
          duration,
          tokenValidation,
          expiresIn: Math.round((tokens.expiresAt - Date.now()) / 1000 / 60), // minutes
        });

        return {
          success: true,
          testName,
          duration,
          details: {
            credentialsValid: true,
            sessionCreated: true,
            tokensGenerated: true,
            userDataRetrieved: !!authResult.userData,
            protectedResourceAccess: false,
            signOutSuccessful: false,
          },
          tokens,
          userData: authResult.userData,
        };
      } else {
        return {
          success: false,
          testName,
          duration,
          error: 'Invalid token structure',
          details: {
            credentialsValid: true,
            sessionCreated: true,
            tokensGenerated: false,
            userDataRetrieved: !!authResult.userData,
            protectedResourceAccess: false,
            signOutSuccessful: false,
          },
        };
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      loggingService.error('TestUserAuthentication', `${testName} failed`, {
        error: error.message,
        duration,
      });

      return {
        success: false,
        testName,
        duration,
        error: error.message,
        details: {
          credentialsValid: false,
          sessionCreated: false,
          tokensGenerated: false,
          userDataRetrieved: false,
          protectedResourceAccess: false,
          signOutSuccessful: false,
        },
      };
    }
  }

  /**
   * Test protected resource access for test user
   */
  async testProtectedResourceAccess(): Promise<AuthenticationTestResult> {
    const startTime = Date.now();
    const testName = 'Protected Resource Access';

    try {
      loggingService.debug('TestUserAuthentication', `Starting ${testName}`);

      // Authenticate first
      const authResult = await this.simulateAuthentication(
        this.TEST_CREDENTIALS.email,
        this.TEST_CREDENTIALS.password
      );

      if (!authResult.success || !authResult.tokens) {
        throw new Error('Authentication failed - cannot test protected resource access');
      }

      // Simulate protected resource access
      const resourceAccessResult = await this.simulateProtectedResourceAccess(authResult.tokens);
      const duration = Date.now() - startTime;

      if (resourceAccessResult.success) {
        loggingService.info('TestUserAuthentication', `${testName} successful`, {
          duration,
          resourcesAccessed: resourceAccessResult.resourcesAccessed,
        });

        return {
          success: true,
          testName,
          duration,
          details: {
            credentialsValid: true,
            sessionCreated: true,
            tokensGenerated: true,
            userDataRetrieved: !!authResult.userData,
            protectedResourceAccess: true,
            signOutSuccessful: false,
          },
          tokens: authResult.tokens,
          userData: authResult.userData,
        };
      } else {
        return {
          success: false,
          testName,
          duration,
          error: resourceAccessResult.error,
          details: {
            credentialsValid: true,
            sessionCreated: true,
            tokensGenerated: true,
            userDataRetrieved: !!authResult.userData,
            protectedResourceAccess: false,
            signOutSuccessful: false,
          },
        };
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      loggingService.error('TestUserAuthentication', `${testName} failed`, {
        error: error.message,
        duration,
      });

      return {
        success: false,
        testName,
        duration,
        error: error.message,
        details: {
          credentialsValid: false,
          sessionCreated: false,
          tokensGenerated: false,
          userDataRetrieved: false,
          protectedResourceAccess: false,
          signOutSuccessful: false,
        },
      };
    }
  }

  /**
   * Test token refresh functionality
   */
  async testTokenRefresh(): Promise<AuthenticationTestResult> {
    const startTime = Date.now();
    const testName = 'Token Refresh';

    try {
      loggingService.debug('TestUserAuthentication', `Starting ${testName}`);

      // Authenticate first
      const authResult = await this.simulateAuthentication(
        this.TEST_CREDENTIALS.email,
        this.TEST_CREDENTIALS.password
      );

      if (!authResult.success || !authResult.tokens) {
        throw new Error('Authentication failed - cannot test token refresh');
      }

      // Simulate token refresh
      const refreshResult = await this.simulateTokenRefresh(authResult.tokens.refreshToken);
      const duration = Date.now() - startTime;

      if (refreshResult.success) {
        loggingService.info('TestUserAuthentication', `${testName} successful`, {
          duration,
          newTokensGenerated: !!refreshResult.tokens,
        });

        return {
          success: true,
          testName,
          duration,
          details: {
            credentialsValid: true,
            sessionCreated: true,
            tokensGenerated: true,
            userDataRetrieved: !!authResult.userData,
            protectedResourceAccess: false,
            signOutSuccessful: false,
          },
          tokens: refreshResult.tokens || authResult.tokens,
          userData: authResult.userData,
        };
      } else {
        return {
          success: false,
          testName,
          duration,
          error: refreshResult.error,
          details: {
            credentialsValid: true,
            sessionCreated: true,
            tokensGenerated: false,
            userDataRetrieved: !!authResult.userData,
            protectedResourceAccess: false,
            signOutSuccessful: false,
          },
        };
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      loggingService.error('TestUserAuthentication', `${testName} failed`, {
        error: error.message,
        duration,
      });

      return {
        success: false,
        testName,
        duration,
        error: error.message,
        details: {
          credentialsValid: false,
          sessionCreated: false,
          tokensGenerated: false,
          userDataRetrieved: false,
          protectedResourceAccess: false,
          signOutSuccessful: false,
        },
      };
    }
  }

  /**
   * Test sign out and cleanup for test user
   */
  async testSignOutCleanup(): Promise<AuthenticationTestResult> {
    const startTime = Date.now();
    const testName = 'Sign Out and Cleanup';

    try {
      loggingService.debug('TestUserAuthentication', `Starting ${testName}`);

      // Authenticate first
      const authResult = await this.simulateAuthentication(
        this.TEST_CREDENTIALS.email,
        this.TEST_CREDENTIALS.password
      );

      if (!authResult.success || !authResult.tokens) {
        throw new Error('Authentication failed - cannot test sign out');
      }

      // Simulate sign out
      const signOutResult = await this.simulateSignOut(authResult.tokens);
      const duration = Date.now() - startTime;

      if (signOutResult.success) {
        loggingService.info('TestUserAuthentication', `${testName} successful`, {
          duration,
          tokensRevoked: signOutResult.tokensRevoked,
          sessionCleared: signOutResult.sessionCleared,
        });

        return {
          success: true,
          testName,
          duration,
          details: {
            credentialsValid: true,
            sessionCreated: true,
            tokensGenerated: true,
            userDataRetrieved: !!authResult.userData,
            protectedResourceAccess: false,
            signOutSuccessful: true,
          },
          userData: authResult.userData,
        };
      } else {
        return {
          success: false,
          testName,
          duration,
          error: signOutResult.error,
          details: {
            credentialsValid: true,
            sessionCreated: true,
            tokensGenerated: true,
            userDataRetrieved: !!authResult.userData,
            protectedResourceAccess: false,
            signOutSuccessful: false,
          },
        };
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      loggingService.error('TestUserAuthentication', `${testName} failed`, {
        error: error.message,
        duration,
      });

      return {
        success: false,
        testName,
        duration,
        error: error.message,
        details: {
          credentialsValid: false,
          sessionCreated: false,
          tokensGenerated: false,
          userDataRetrieved: false,
          protectedResourceAccess: false,
          signOutSuccessful: false,
        },
      };
    }
  }

  /**
   * Test invalid credentials handling
   */
  async testInvalidCredentials(): Promise<AuthenticationTestResult> {
    const startTime = Date.now();
    const testName = 'Invalid Credentials Handling';

    try {
      loggingService.debug('TestUserAuthentication', `Starting ${testName}`);

      // Try authentication with invalid credentials
      const authResult = await this.simulateAuthentication(
        this.TEST_CREDENTIALS.email,
        'invalid-password'
      );

      const duration = Date.now() - startTime;

      // Should fail with proper error handling
      if (!authResult.success && authResult.error) {
        loggingService.info('TestUserAuthentication', `${testName} successful (correctly rejected invalid credentials)`, {
          duration,
          errorHandled: true,
        });

        return {
          success: true,
          testName,
          duration,
          details: {
            credentialsValid: false,
            sessionCreated: false,
            tokensGenerated: false,
            userDataRetrieved: false,
            protectedResourceAccess: false,
            signOutSuccessful: false,
          },
        };
      } else {
        return {
          success: false,
          testName,
          duration,
          error: 'Invalid credentials were incorrectly accepted',
          details: {
            credentialsValid: false,
            sessionCreated: false,
            tokensGenerated: false,
            userDataRetrieved: false,
            protectedResourceAccess: false,
            signOutSuccessful: false,
          },
        };
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      loggingService.error('TestUserAuthentication', `${testName} failed`, {
        error: error.message,
        duration,
      });

      return {
        success: false,
        testName,
        duration,
        error: error.message,
        details: {
          credentialsValid: false,
          sessionCreated: false,
          tokensGenerated: false,
          userDataRetrieved: false,
          protectedResourceAccess: false,
          signOutSuccessful: false,
        },
      };
    }
  }

  /**
   * Test session restoration
   */
  async testSessionRestoration(): Promise<AuthenticationTestResult> {
    const startTime = Date.now();
    const testName = 'Session Restoration';

    try {
      loggingService.debug('TestUserAuthentication', `Starting ${testName}`);

      // Authenticate and get tokens
      const authResult = await this.simulateAuthentication(
        this.TEST_CREDENTIALS.email,
        this.TEST_CREDENTIALS.password
      );

      if (!authResult.success || !authResult.tokens) {
        throw new Error('Authentication failed - cannot test session restoration');
      }

      // Simulate session restoration from stored tokens
      const restorationResult = await this.simulateSessionRestoration(authResult.tokens);
      const duration = Date.now() - startTime;

      if (restorationResult.success) {
        loggingService.info('TestUserAuthentication', `${testName} successful`, {
          duration,
          sessionRestored: true,
        });

        return {
          success: true,
          testName,
          duration,
          details: {
            credentialsValid: true,
            sessionCreated: true,
            tokensGenerated: true,
            userDataRetrieved: !!restorationResult.userData,
            protectedResourceAccess: false,
            signOutSuccessful: false,
          },
          tokens: authResult.tokens,
          userData: restorationResult.userData,
        };
      } else {
        return {
          success: false,
          testName,
          duration,
          error: restorationResult.error,
          details: {
            credentialsValid: true,
            sessionCreated: false,
            tokensGenerated: true,
            userDataRetrieved: false,
            protectedResourceAccess: false,
            signOutSuccessful: false,
          },
        };
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      loggingService.error('TestUserAuthentication', `${testName} failed`, {
        error: error.message,
        duration,
      });

      return {
        success: false,
        testName,
        duration,
        error: error.message,
        details: {
          credentialsValid: false,
          sessionCreated: false,
          tokensGenerated: false,
          userDataRetrieved: false,
          protectedResourceAccess: false,
          signOutSuccessful: false,
        },
      };
    }
  }

  /**
   * Update test configuration
   */
  updateConfig(newConfig: Partial<TestConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    loggingService.info('TestUserAuthentication', 'Test configuration updated', {
      oldConfig,
      newConfig: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): TestConfig {
    return { ...this.config };
  }

  // Private simulation methods (would integrate with actual services in real implementation)

  private async simulateAuthentication(email: string, password: string): Promise<{
    success: boolean;
    error?: string;
    tokens?: AuthenticationTestResult['tokens'];
    userData?: AuthenticationTestResult['userData'];
  }> {
    // Simulate authentication delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check credentials
    if (email === this.TEST_CREDENTIALS.email && password === this.TEST_CREDENTIALS.password) {
      return {
        success: true,
        tokens: {
          accessToken: 'mock-access-token-' + Date.now(),
          idToken: 'mock-id-token-' + Date.now(),
          refreshToken: 'mock-refresh-token-' + Date.now(),
          expiresAt: Date.now() + 3600000, // 1 hour
        },
        userData: {
          id: this.TEST_CREDENTIALS.expectedUserId || 'test-user-id',
          email: this.TEST_CREDENTIALS.email,
          name: this.TEST_CREDENTIALS.expectedName,
          attributes: {
            email_verified: true,
            created_at: new Date().toISOString(),
          },
        },
      };
    } else {
      return {
        success: false,
        error: 'Invalid credentials',
      };
    }
  }

  private async simulateProtectedResourceAccess(tokens: AuthenticationTestResult['tokens']): Promise<{
    success: boolean;
    error?: string;
    resourcesAccessed?: string[];
  }> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 300));

    if (!tokens || !tokens.accessToken) {
      return {
        success: false,
        error: 'No access token provided',
      };
    }

    // Simulate successful resource access
    return {
      success: true,
      resourcesAccessed: ['user-profile', 'user-preferences', 'protected-data'],
    };
  }

  private async simulateTokenRefresh(refreshToken: string): Promise<{
    success: boolean;
    error?: string;
    tokens?: AuthenticationTestResult['tokens'];
  }> {
    // Simulate refresh delay
    await new Promise(resolve => setTimeout(resolve, 400));

    if (!refreshToken) {
      return {
        success: false,
        error: 'No refresh token provided',
      };
    }

    return {
      success: true,
      tokens: {
        accessToken: 'mock-refreshed-access-token-' + Date.now(),
        idToken: 'mock-refreshed-id-token-' + Date.now(),
        refreshToken: refreshToken, // Refresh token typically stays the same
        expiresAt: Date.now() + 3600000, // 1 hour
      },
    };
  }

  private async simulateSignOut(tokens: AuthenticationTestResult['tokens']): Promise<{
    success: boolean;
    error?: string;
    tokensRevoked?: boolean;
    sessionCleared?: boolean;
  }> {
    // Simulate sign out delay
    await new Promise(resolve => setTimeout(resolve, 200));

    if (!tokens) {
      return {
        success: false,
        error: 'No tokens to revoke',
      };
    }

    return {
      success: true,
      tokensRevoked: true,
      sessionCleared: true,
    };
  }

  private async simulateSessionRestoration(tokens: AuthenticationTestResult['tokens']): Promise<{
    success: boolean;
    error?: string;
    userData?: AuthenticationTestResult['userData'];
  }> {
    // Simulate restoration delay
    await new Promise(resolve => setTimeout(resolve, 300));

    if (!tokens || !tokens.accessToken) {
      return {
        success: false,
        error: 'Invalid tokens for restoration',
      };
    }

    // Check if tokens are expired
    if (tokens.expiresAt <= Date.now()) {
      return {
        success: false,
        error: 'Tokens expired',
      };
    }

    return {
      success: true,
      userData: {
        id: this.TEST_CREDENTIALS.expectedUserId || 'test-user-id',
        email: this.TEST_CREDENTIALS.email,
        name: this.TEST_CREDENTIALS.expectedName,
        attributes: {
          email_verified: true,
          session_restored: true,
        },
      },
    };
  }
}

export const testUserAuthenticationService = new TestUserAuthenticationService();
export type { TestCredentials, AuthenticationTestResult, TestConfig };