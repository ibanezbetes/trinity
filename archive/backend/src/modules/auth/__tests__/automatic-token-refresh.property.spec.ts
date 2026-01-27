import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import * as fc from 'fast-check';
import { AuthService } from '../auth.service';
import { MultiTableService } from '../../../infrastructure/database/multi-table.service';
import { CognitoService } from '../../../infrastructure/cognito/cognito.service';
import { GoogleAuthService } from '../google-auth.service';
import { FederatedUserManagementService } from '../federated-user-management.service';
import { FederatedSessionManagementService } from '../federated-session-management.service';
import { GoogleAuthAnalyticsService } from '../google-auth-analytics.service';
import { AuthStatusCodeService } from '../services/auth-status-code.service';
import { EventTracker } from '../../analytics/event-tracker.service';

// Mock services
const mockMultiTableService = {
  createUser: jest.fn(),
  getUser: jest.fn(),
  scan: jest.fn(),
  update: jest.fn(),
};

const mockCognitoService = {
  refreshTokens: jest.fn(),
  refreshFederatedTokens: jest.fn(),
  validateAccessToken: jest.fn(),
  validateProviderConfiguration: jest.fn(),
};

const mockGoogleAuthService = {
  verifyGoogleToken: jest.fn(),
  isGoogleAuthAvailable: jest.fn(),
};

const mockFederatedUserService = {
  linkFederatedIdentity: jest.fn(),
};

const mockFederatedSessionService = {
  createFederatedSession: jest.fn(),
};

const mockGoogleAnalyticsService = {
  trackLoginAttempt: jest.fn(),
  trackLoginSuccess: jest.fn(),
  trackLoginFailure: jest.fn(),
  trackAccountLinking: jest.fn(),
};

const mockEventTracker = {
  trackUserAction: jest.fn(),
};

describe('AuthService - Property 7: Automatic Token Refresh', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: MultiTableService,
          useValue: mockMultiTableService,
        },
        {
          provide: CognitoService,
          useValue: mockCognitoService,
        },
        {
          provide: GoogleAuthService,
          useValue: mockGoogleAuthService,
        },
        {
          provide: FederatedUserManagementService,
          useValue: mockFederatedUserService,
        },
        {
          provide: FederatedSessionManagementService,
          useValue: mockFederatedSessionService,
        },
        {
          provide: GoogleAuthAnalyticsService,
          useValue: mockGoogleAnalyticsService,
        },
        {
          provide: EventTracker,
          useValue: mockEventTracker,
        },
        {
          provide: AuthStatusCodeService,
          useValue: {
            throwUnauthorized: jest.fn(),
            throwForbidden: jest.fn(),
            throwBadRequest: jest.fn(),
            handleAuthError: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  /**
   * **Property 7: Automatic Token Refresh**
   * **Validates: Requirements 3.2, 4.4**
   *
   * For any token refresh operation, the system must:
   * 1. Attempt standard Cognito token refresh first
   * 2. Fall back to federated token refresh for federated tokens
   * 3. Return new valid tokens with proper expiration times
   * 4. Handle refresh failures gracefully with appropriate error messages
   * 5. Validate and refresh tokens automatically when access tokens are expired
   * 6. Maintain user session continuity during token refresh
   */
  describe('Property 7: Automatic Token Refresh', () => {
    it('should refresh standard Cognito tokens successfully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            refreshToken: fc.string({ minLength: 20, maxLength: 200 }),
            newAccessToken: fc.string({ minLength: 20, maxLength: 500 }),
            newIdToken: fc.string({ minLength: 20, maxLength: 500 }),
            newRefreshToken: fc.string({ minLength: 20, maxLength: 200 }),
            expiresIn: fc.integer({ min: 300, max: 7200 }), // 5 minutes to 2 hours
          }),
          async (tokenData) => {
            // Mock successful Cognito token refresh
            mockCognitoService.refreshTokens.mockResolvedValue({
              accessToken: tokenData.newAccessToken,
              idToken: tokenData.newIdToken,
              refreshToken: tokenData.newRefreshToken,
              expiresIn: tokenData.expiresIn,
            });

            // Test token refresh
            const result = await service.refreshTokens(tokenData.refreshToken);

            // Verify Cognito refresh is called
            expect(mockCognitoService.refreshTokens).toHaveBeenCalledWith(
              tokenData.refreshToken
            );

            // Verify new tokens are returned with correct structure
            expect(result).toEqual({
              accessToken: tokenData.newAccessToken,
              idToken: tokenData.newIdToken,
              refreshToken: tokenData.newRefreshToken,
              expiresIn: tokenData.expiresIn,
            });

            // Verify all required token fields are present
            expect(result.accessToken).toBeDefined();
            expect(result.idToken).toBeDefined();
            expect(result.refreshToken).toBeDefined();
            expect(result.expiresIn).toBeGreaterThan(0);
          }
        ),
        { numRuns: 40 }
      );
    });

    it('should fall back to federated token refresh for federated tokens', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            federatedRefreshToken: fc.oneof(
              fc.constant('cognito_federated_refresh_identity123_1234567890'),
              fc.constant('cognito_refresh_identity456_0987654321'),
              fc.constant('google_refresh_user789_1122334455'),
            ),
            newAccessToken: fc.string({ minLength: 20, maxLength: 400 }),
            newIdToken: fc.string({ minLength: 20, maxLength: 400 }),
            newRefreshToken: fc.string({ minLength: 20, maxLength: 200 }),
            expiresIn: fc.integer({ min: 300, max: 7200 }),
          }),
          async (tokenData) => {
            // Mock standard Cognito refresh failure
            mockCognitoService.refreshTokens.mockRejectedValue(
              new UnauthorizedException('Invalid refresh token format')
            );

            // Mock successful federated token refresh
            mockCognitoService.refreshFederatedTokens.mockResolvedValue({
              accessToken: tokenData.newAccessToken,
              idToken: tokenData.newIdToken,
              refreshToken: tokenData.newRefreshToken,
              expiresIn: tokenData.expiresIn,
            });

            // Test federated token refresh fallback
            const result = await service.refreshTokens(tokenData.federatedRefreshToken);

            // Verify standard refresh was attempted first
            expect(mockCognitoService.refreshTokens).toHaveBeenCalledWith(
              tokenData.federatedRefreshToken
            );

            // Verify federated refresh was called as fallback
            expect(mockCognitoService.refreshFederatedTokens).toHaveBeenCalledWith(
              tokenData.federatedRefreshToken
            );

            // Verify new federated tokens are returned
            expect(result).toEqual({
              accessToken: tokenData.newAccessToken,
              idToken: tokenData.newIdToken,
              refreshToken: tokenData.newRefreshToken,
              expiresIn: tokenData.expiresIn,
            });
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle refresh failures gracefully with appropriate error messages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            invalidRefreshToken: fc.oneof(
              fc.string({ minLength: 1, maxLength: 10 }), // Too short
              fc.constant(''), // Empty
              fc.constant('invalid-token-format'),
              fc.constant('expired-refresh-token'),
            ),
            errorType: fc.oneof(
              fc.constant('NotAuthorizedException'),
              fc.constant('UserNotFoundException'),
              fc.constant('TokenExpiredException'),
            ),
          }),
          async (testData) => {
            // Mock both standard and federated refresh failures
            const error = new UnauthorizedException(`${testData.errorType}: Token refresh failed`);
            mockCognitoService.refreshTokens.mockRejectedValue(error);
            mockCognitoService.refreshFederatedTokens.mockRejectedValue(error);

            // Test refresh failure handling
            try {
              const result = await service.refreshTokens(testData.invalidRefreshToken);
              
              // If no exception is thrown, the result should be undefined or null for invalid tokens
              expect(result).toBeUndefined();
              
            } catch (error) {
              // Expected exception for invalid tokens
              expect(error).toBeInstanceOf(UnauthorizedException);
            }

            // Verify both refresh methods were attempted
            expect(mockCognitoService.refreshTokens).toHaveBeenCalledWith(
              testData.invalidRefreshToken
            );

            // For federated-looking tokens, verify federated refresh was also attempted
            if (testData.invalidRefreshToken.includes('cognito_') || 
                testData.invalidRefreshToken.includes('google_')) {
              expect(mockCognitoService.refreshFederatedTokens).toHaveBeenCalledWith(
                testData.invalidRefreshToken
              );
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('should validate and refresh tokens automatically when access tokens are expired', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            expiredAccessToken: fc.string({ minLength: 20, maxLength: 300 }),
            validRefreshToken: fc.string({ minLength: 20, maxLength: 200 }),
            userId: fc.uuid(),
            email: fc.emailAddress(),
            username: fc.string({ minLength: 3, maxLength: 20 }),
            newAccessToken: fc.string({ minLength: 20, maxLength: 400 }),
            newIdToken: fc.string({ minLength: 20, maxLength: 400 }),
            newRefreshToken: fc.string({ minLength: 20, maxLength: 200 }),
            expiresIn: fc.integer({ min: 300, max: 7200 }),
          }),
          async (testData) => {
            // Mock expired access token validation (returns null)
            mockCognitoService.validateAccessToken.mockResolvedValue(null);

            // Mock successful token refresh
            mockCognitoService.refreshTokens.mockResolvedValue({
              accessToken: testData.newAccessToken,
              idToken: testData.newIdToken,
              refreshToken: testData.newRefreshToken,
              expiresIn: testData.expiresIn,
            });

            // Mock successful validation of new access token
            mockCognitoService.validateAccessToken
              .mockResolvedValueOnce(null) // First call (expired token)
              .mockResolvedValueOnce({ // Second call (new token)
                sub: testData.userId,
                email: testData.email,
                username: testData.username,
                email_verified: true,
              });

            // Mock user data retrieval
            mockMultiTableService.getUser.mockResolvedValue({
              userId: testData.userId,
              email: testData.email,
              username: testData.username,
              emailVerified: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });

            // Test automatic token validation and refresh
            const result = await service.validateAndRefreshToken(
              testData.expiredAccessToken,
              testData.validRefreshToken
            );

            // Verify expired token was validated first
            expect(mockCognitoService.validateAccessToken).toHaveBeenCalledWith(
              testData.expiredAccessToken
            );

            // Verify token refresh was triggered
            expect(mockCognitoService.refreshTokens).toHaveBeenCalledWith(
              testData.validRefreshToken
            );

            // Verify new token was validated
            expect(mockCognitoService.validateAccessToken).toHaveBeenCalledWith(
              testData.newAccessToken
            );

            // Verify result indicates successful refresh
            expect(result.tokenRefreshed).toBe(true);
            expect(result.user).toEqual(
              expect.objectContaining({
                id: testData.userId,
                email: testData.email,
                username: testData.username,
              })
            );
            expect(result.newTokens).toEqual({
              accessToken: testData.newAccessToken,
              idToken: testData.newIdToken,
              refreshToken: testData.newRefreshToken,
              expiresIn: testData.expiresIn,
            });
          }
        ),
        { numRuns: 35 }
      );
    });

    it('should maintain user session continuity during token refresh', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            validAccessToken: fc.string({ minLength: 20, maxLength: 300 }),
            userId: fc.uuid(),
            email: fc.emailAddress(),
            username: fc.string({ minLength: 3, maxLength: 20 }),
            displayName: fc.option(fc.string({ minLength: 1, maxLength: 40 })),
            phoneNumber: fc.option(fc.string({ minLength: 10, maxLength: 15 })),
          }),
          async (testData) => {
            // Mock valid access token (no refresh needed)
            mockCognitoService.validateAccessToken.mockResolvedValue({
              sub: testData.userId,
              email: testData.email,
              username: testData.username,
              email_verified: true,
              phone_number: testData.phoneNumber,
            });

            // Mock user data retrieval
            mockMultiTableService.getUser.mockResolvedValue({
              userId: testData.userId,
              email: testData.email,
              username: testData.username,
              emailVerified: true,
              phoneNumber: testData.phoneNumber,
              displayName: testData.displayName,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });

            // Test validation without refresh needed
            const result = await service.validateAndRefreshToken(testData.validAccessToken);

            // Verify token validation was called
            expect(mockCognitoService.validateAccessToken).toHaveBeenCalledWith(
              testData.validAccessToken
            );

            // Verify no refresh was needed
            expect(result.tokenRefreshed).toBe(false);
            expect(result.newTokens).toBeUndefined();

            // Verify user session is maintained
            expect(result.user).toEqual(
              expect.objectContaining({
                id: testData.userId,
                sub: testData.userId, // JWT compatibility
                email: testData.email,
                username: testData.username,
                emailVerified: true,
                phoneNumber: testData.phoneNumber,
                displayName: testData.displayName,
              })
            );

            // Verify refresh was not called
            expect(mockCognitoService.refreshTokens).not.toHaveBeenCalled();
            expect(mockCognitoService.refreshFederatedTokens).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 40 }
      );
    });

    it('should correctly identify federated tokens for appropriate refresh method', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tokenType: fc.oneof(
              fc.constant('standard'),
              fc.constant('federated'),
              fc.constant('google'),
            ),
            baseToken: fc.string({ minLength: 10, maxLength: 50 }).filter(s => s.trim().length > 5),
          }),
          async (testData) => {
            let refreshToken: string;
            
            // Generate token based on type - ensure clear distinction
            switch (testData.tokenType) {
              case 'federated':
                refreshToken = `cognito_federated_refresh_${testData.baseToken.trim().replace(/[^a-zA-Z0-9]/g, 'X')}`;
                break;
              case 'google':
                refreshToken = `google_refresh_${testData.baseToken.trim().replace(/[^a-zA-Z0-9]/g, 'X')}`;
                break;
              default:
                // Ensure standard tokens don't contain federated patterns
                const cleanToken = testData.baseToken.trim().replace(/[^a-zA-Z0-9]/g, 'X');
                refreshToken = `aws_cognito_standard_${cleanToken}`;
            }

            // Reset mocks before each test
            mockCognitoService.refreshTokens.mockReset();
            mockCognitoService.refreshFederatedTokens.mockReset();

            if (testData.tokenType === 'standard') {
              // Mock successful standard refresh
              mockCognitoService.refreshTokens.mockResolvedValue({
                accessToken: 'new-access-token',
                idToken: 'new-id-token',
                refreshToken: 'new-refresh-token',
                expiresIn: 3600,
              });

              await service.refreshTokens(refreshToken);

              // Verify only standard refresh was called
              expect(mockCognitoService.refreshTokens).toHaveBeenCalledWith(refreshToken);
              expect(mockCognitoService.refreshFederatedTokens).not.toHaveBeenCalled();
            } else {
              // Mock standard refresh failure and federated success
              mockCognitoService.refreshTokens.mockRejectedValue(
                new UnauthorizedException('Invalid token format')
              );
              mockCognitoService.refreshFederatedTokens.mockResolvedValue({
                accessToken: 'new-federated-access-token',
                idToken: 'new-federated-id-token',
                refreshToken: 'new-federated-refresh-token',
                expiresIn: 3600,
              });

              await service.refreshTokens(refreshToken);

              // Verify both methods were called (standard first, then federated)
              expect(mockCognitoService.refreshTokens).toHaveBeenCalledWith(refreshToken);
              expect(mockCognitoService.refreshFederatedTokens).toHaveBeenCalledWith(refreshToken);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});