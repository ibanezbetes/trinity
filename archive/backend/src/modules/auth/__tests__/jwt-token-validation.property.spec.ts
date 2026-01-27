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

describe('AuthService - Property 6: JWT Token Validation', () => {
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
   * **Property 6: JWT Token Validation**
   * **Validates: Requirements 3.1**
   *
   * For any JWT token validation request, the system must:
   * 1. Validate tokens against the correct Cognito User Pool configuration
   * 2. Extract proper user context from valid JWT tokens
   * 3. Return null for invalid tokens without exposing sensitive information
   * 4. Handle token validation errors gracefully
   * 5. Ensure consistent user profile structure for valid tokens
   */
  describe('Property 6: JWT Token Validation', () => {
    it('should validate JWT tokens against correct Cognito User Pool configuration', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accessToken: fc.string({ minLength: 20, maxLength: 500 }),
            userId: fc.uuid(),
            email: fc.emailAddress(),
            username: fc.string({ minLength: 3, maxLength: 30 }),
            emailVerified: fc.boolean(),
            phoneNumber: fc.option(fc.string({ minLength: 10, maxLength: 15 })),
            displayName: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          }),
          async (tokenData) => {
            // Mock valid Cognito token validation
            mockCognitoService.validateAccessToken.mockResolvedValue({
              sub: tokenData.userId,
              email: tokenData.email,
              username: tokenData.username,
              email_verified: tokenData.emailVerified,
              phone_number: tokenData.phoneNumber,
            });

            // Mock user data from database
            mockMultiTableService.getUser.mockResolvedValue({
              userId: tokenData.userId,
              email: tokenData.email,
              username: tokenData.username,
              emailVerified: tokenData.emailVerified,
              phoneNumber: tokenData.phoneNumber,
              displayName: tokenData.displayName,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });

            // Test JWT token validation
            const result = await service.validateUserByToken(tokenData.accessToken);

            // Verify Cognito validation is called with correct token
            expect(mockCognitoService.validateAccessToken).toHaveBeenCalledWith(
              tokenData.accessToken
            );

            // Verify user profile is returned with correct structure
            expect(result).toEqual(
              expect.objectContaining({
                id: tokenData.userId,
                sub: tokenData.userId, // Alias for JWT/Cognito compatibility
                email: tokenData.email,
                username: tokenData.username,
                emailVerified: tokenData.emailVerified,
                phoneNumber: tokenData.phoneNumber,
                displayName: tokenData.displayName,
              })
            );

            // Verify user context is properly extracted from JWT
            expect(result.id).toBe(tokenData.userId);
            expect(result.email).toBe(tokenData.email);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return null for invalid JWT tokens without exposing sensitive information', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 10 }), // Too short
            fc.string({ minLength: 1000, maxLength: 2000 }), // Too long
            fc.constant(''), // Empty string
            fc.constant('invalid.jwt.token'), // Invalid format
            fc.constant('Bearer invalid-token'), // With Bearer prefix
            fc.string().filter(s => !s.includes('.')), // No JWT structure
          ),
          async (invalidToken) => {
            // Mock Cognito rejection for invalid token
            mockCognitoService.validateAccessToken.mockResolvedValue(null);

            // Test invalid token validation
            const result = await service.validateUserByToken(invalidToken);

            // Verify invalid tokens return null
            expect(result).toBeNull();

            // Verify Cognito validation is attempted
            expect(mockCognitoService.validateAccessToken).toHaveBeenCalledWith(
              invalidToken
            );

            // Verify no user data is retrieved for invalid tokens
            expect(mockMultiTableService.getUser).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle token validation errors gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accessToken: fc.string({ minLength: 20, maxLength: 200 }),
            errorType: fc.oneof(
              fc.constant('TokenExpiredError'),
              fc.constant('JsonWebTokenError'),
              fc.constant('NotBeforeError'),
              fc.constant('NetworkError'),
              fc.constant('ServiceUnavailableError'),
            ),
          }),
          async (testData) => {
            // Mock Cognito validation error
            const error = new Error(`${testData.errorType}: Token validation failed`);
            mockCognitoService.validateAccessToken.mockRejectedValue(error);

            // Test error handling
            const result = await service.validateUserByToken(testData.accessToken);

            // Verify errors are handled gracefully (return null instead of throwing)
            expect(result).toBeNull();

            // Verify Cognito validation was attempted
            expect(mockCognitoService.validateAccessToken).toHaveBeenCalledWith(
              testData.accessToken
            );

            // Verify no user data is retrieved when validation fails
            expect(mockMultiTableService.getUser).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 25 }
      );
    });

    it('should create user profile if not exists for valid Cognito tokens', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accessToken: fc.string({ minLength: 20, maxLength: 300 }),
            userId: fc.uuid(),
            email: fc.emailAddress(),
            username: fc.string({ minLength: 3, maxLength: 25 }),
            emailVerified: fc.boolean(),
            phoneNumber: fc.option(fc.string({ minLength: 10, maxLength: 15 })),
          }),
          async (tokenData) => {
            // Mock valid Cognito token validation
            mockCognitoService.validateAccessToken.mockResolvedValue({
              sub: tokenData.userId,
              email: tokenData.email,
              username: tokenData.username,
              email_verified: tokenData.emailVerified,
              phone_number: tokenData.phoneNumber,
            });

            // Mock user not found in database (first time login)
            mockMultiTableService.getUser.mockResolvedValue(null);
            mockMultiTableService.createUser.mockResolvedValue(undefined);

            // Test JWT token validation for new user
            const result = await service.validateUserByToken(tokenData.accessToken);

            // Verify Cognito validation is called
            expect(mockCognitoService.validateAccessToken).toHaveBeenCalledWith(
              tokenData.accessToken
            );

            // Verify user is created in database
            expect(mockMultiTableService.createUser).toHaveBeenCalledWith({
              userId: tokenData.userId,
              email: tokenData.email,
              username: tokenData.username,
              emailVerified: tokenData.emailVerified,
              phoneNumber: tokenData.phoneNumber,
            });

            // Verify user profile is returned
            expect(result).toEqual(
              expect.objectContaining({
                id: tokenData.userId,
                sub: tokenData.userId,
                email: tokenData.email,
                username: tokenData.username,
                emailVerified: tokenData.emailVerified,
                phoneNumber: tokenData.phoneNumber,
              })
            );
          }
        ),
        { numRuns: 40 }
      );
    });

    it('should maintain consistent user profile structure across all validation scenarios', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accessToken: fc.string({ minLength: 20, maxLength: 400 }),
            userId: fc.uuid(),
            email: fc.emailAddress(),
            username: fc.string({ minLength: 3, maxLength: 20 }),
            emailVerified: fc.boolean(),
            phoneNumber: fc.option(fc.string({ minLength: 10, maxLength: 15 })),
            displayName: fc.option(fc.string({ minLength: 1, maxLength: 40 })),
            avatarUrl: fc.option(fc.webUrl()),
            userExists: fc.boolean(),
          }),
          async (testData) => {
            // Mock valid Cognito token validation
            mockCognitoService.validateAccessToken.mockResolvedValue({
              sub: testData.userId,
              email: testData.email,
              username: testData.username,
              email_verified: testData.emailVerified,
              phone_number: testData.phoneNumber,
            });

            if (testData.userExists) {
              // Mock existing user in database
              mockMultiTableService.getUser.mockResolvedValue({
                userId: testData.userId,
                email: testData.email,
                username: testData.username,
                emailVerified: testData.emailVerified,
                phoneNumber: testData.phoneNumber,
                displayName: testData.displayName,
                avatarUrl: testData.avatarUrl,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            } else {
              // Mock user not found (will be created)
              mockMultiTableService.getUser.mockResolvedValue(null);
              mockMultiTableService.createUser.mockResolvedValue(undefined);
            }

            // Test JWT token validation
            const result = await service.validateUserByToken(testData.accessToken);

            // Verify consistent profile structure
            expect(result).toEqual(
              expect.objectContaining({
                id: expect.any(String),
                sub: expect.any(String), // JWT/Cognito compatibility alias
                email: expect.any(String),
                username: expect.any(String),
                emailVerified: expect.any(Boolean),
              })
            );

            // Verify required fields are always present
            expect(result.id).toBe(testData.userId);
            expect(result.sub).toBe(testData.userId);
            expect(result.email).toBe(testData.email);
            expect(result.username).toBe(testData.username);
            expect(result.emailVerified).toBe(testData.emailVerified);

            // Verify optional fields maintain consistency
            if (testData.phoneNumber) {
              expect(result.phoneNumber).toBe(testData.phoneNumber);
            }

            if (testData.userExists && testData.displayName) {
              expect(result.displayName).toBe(testData.displayName);
            }

            if (testData.userExists && testData.avatarUrl) {
              expect(result.avatarUrl).toBe(testData.avatarUrl);
            }

            // Verify Google Auth fields are properly initialized
            expect(result).toHaveProperty('isGoogleLinked');
            expect(result).toHaveProperty('authProviders');
            expect(Array.isArray(result.authProviders)).toBe(true);
          }
        ),
        { numRuns: 60 }
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});