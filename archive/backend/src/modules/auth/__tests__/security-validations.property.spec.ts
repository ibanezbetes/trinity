import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthService } from '../google-auth.service';
import { CognitoService } from '../../../infrastructure/cognito/cognito.service';
import { MultiTableService } from '../../../infrastructure/database/multi-table.service';
import { AuthStatusCodeService } from '../services/auth-status-code.service';
import { FederatedUserManagementService } from '../federated-user-management.service';
import { FederatedSessionManagementService } from '../federated-session-management.service';
import { GoogleAuthAnalyticsService } from '../google-auth-analytics.service';
import { EventTracker } from '../../analytics/event-tracker.service';
import { UnauthorizedException } from '@nestjs/common';
import * as fc from 'fast-check';

describe('Security Validations - Property Tests', () => {
  let googleAuthService: GoogleAuthService;
  let cognitoService: CognitoService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        'GOOGLE_CLIENT_ID': 'test-google-client-id',
        'COGNITO_IDENTITY_POOL_ID': 'eu-west-1:test-identity-pool-id',
        'COGNITO_GOOGLE_PROVIDER_NAME': 'accounts.google.com',
        'COGNITO_FEDERATED_IDENTITY_ENABLED': 'true',
        'COGNITO_USER_POOL_ID': 'eu-west-1_testpool',
        'COGNITO_CLIENT_ID': 'test-cognito-client-id',
        'COGNITO_REGION': 'eu-west-1',
      };
      return config[key];
    }),
  };

  const mockMultiTableService = {
    scan: jest.fn(),
    getUser: jest.fn(),
    createUser: jest.fn(),
    update: jest.fn(),
  };

  const mockCognitoService = {
    validateProviderConfiguration: jest.fn(() => true),
    exchangeGoogleTokenForCognito: jest.fn(),
    createFederatedUser: jest.fn(),
    linkGoogleProvider: jest.fn(),
    unlinkGoogleProvider: jest.fn(),
  };

  const mockEventTracker = {
    trackUserAction: jest.fn().mockResolvedValue(undefined),
  };

  const mockFederatedUserManagementService = {
    createFederatedUser: jest.fn().mockResolvedValue({}),
    linkGoogleProvider: jest.fn().mockResolvedValue({}),
    unlinkGoogleProvider: jest.fn().mockResolvedValue({}),
    getFederatedUserInfo: jest.fn().mockResolvedValue({}),
  };

  const mockFederatedSessionManagementService = {
    createSession: jest.fn().mockResolvedValue({}),
    validateSession: jest.fn().mockResolvedValue({}),
    refreshSession: jest.fn().mockResolvedValue({}),
    terminateSession: jest.fn().mockResolvedValue({}),
  };

  const mockGoogleAuthAnalyticsService = {
    trackAuthEvent: jest.fn().mockResolvedValue(undefined),
    trackUserAction: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuthStatusCodeService = {
    throwUnauthorized: jest.fn(),
    throwForbidden: jest.fn(),
    throwBadRequest: jest.fn(),
    handleAuthError: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAuthService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MultiTableService, useValue: mockMultiTableService },
        { provide: CognitoService, useValue: mockCognitoService },
        { provide: EventTracker, useValue: mockEventTracker },
        { provide: FederatedUserManagementService, useValue: mockFederatedUserManagementService },
        { provide: FederatedSessionManagementService, useValue: mockFederatedSessionManagementService },
        { provide: GoogleAuthAnalyticsService, useValue: mockGoogleAuthAnalyticsService },
        { provide: AuthStatusCodeService, useValue: mockAuthStatusCodeService },
      ],
    }).compile();

    googleAuthService = module.get<GoogleAuthService>(GoogleAuthService);
    cognitoService = module.get<CognitoService>(CognitoService);
    configService = module.get<ConfigService>(ConfigService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Property 15: Invalid Token Rejection', () => {
    it('should reject invalid Google tokens consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            invalidToken: fc.oneof(
              fc.constant(''), // Token vacío
              fc.constant('invalid-token'), // Token inválido
              fc.string({ minLength: 1, maxLength: 50 }), // Token aleatorio corto
              fc.string({ minLength: 100, maxLength: 200 }), // Token aleatorio largo
              fc.constant('eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.invalid'), // JWT malformado
              fc.constant('null'),
              fc.constant('undefined'),
            ),
            audience: fc.string({ minLength: 10, maxLength: 100 }),
          }),
          async ({ invalidToken, audience }) => {
            // Mock Google Client para rechazar tokens inválidos
            const mockVerifyIdToken = jest.fn().mockRejectedValue(
              new Error('Token verification failed')
            );
            
            (googleAuthService as any).googleClient = {
              verifyIdToken: mockVerifyIdToken,
            };

            // Propiedad: Todos los tokens inválidos deben ser rechazados
            await expect(
              googleAuthService.verifyGoogleToken(invalidToken)
            ).rejects.toThrow();

            // Verificar que se intentó verificar el token (solo si no es vacío)
            if (invalidToken && invalidToken.trim() !== '') {
              expect(mockVerifyIdToken).toHaveBeenCalledWith({
                idToken: invalidToken,
                audience: 'test-google-client-id',
              });
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject expired tokens consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            expiredTimestamp: fc.integer({ min: 1000000000, max: Math.floor(Date.now() / 1000) - 3600 }), // Expirado hace al menos 1 hora
            email: fc.emailAddress(),
            sub: fc.string({ minLength: 10, maxLength: 30 }),
          }),
          async ({ expiredTimestamp, email, sub }) => {
            // Mock Google Client para devolver token expirado
            const mockVerifyIdToken = jest.fn().mockResolvedValue({
              getPayload: () => ({
                sub,
                email,
                aud: 'test-google-client-id',
                exp: expiredTimestamp, // Token expirado
                email_verified: true,
                name: 'Test User',
              }),
            });
            
            (googleAuthService as any).googleClient = {
              verifyIdToken: mockVerifyIdToken,
            };

            // Propiedad: Todos los tokens expirados deben ser rechazados
            await expect(
              googleAuthService.verifyGoogleToken('valid-format-token')
            ).rejects.toThrow(UnauthorizedException);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 17: Audience Validation', () => {
    it('should validate audience correctly for all tokens', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tokenAudience: fc.string({ minLength: 10, maxLength: 100 }),
            configuredAudience: fc.string({ minLength: 10, maxLength: 100 }),
            email: fc.emailAddress(),
            sub: fc.string({ minLength: 10, maxLength: 30 }),
          }),
          async ({ tokenAudience, configuredAudience, email, sub }) => {
            // Configurar audience esperada
            mockConfigService.get.mockImplementation((key: string) => {
              const config = {
                'GOOGLE_CLIENT_ID': configuredAudience,
                'COGNITO_IDENTITY_POOL_ID': 'eu-west-1:test-identity-pool-id',
                'COGNITO_GOOGLE_PROVIDER_NAME': 'accounts.google.com',
                'COGNITO_FEDERATED_IDENTITY_ENABLED': 'true',
                'COGNITO_USER_POOL_ID': 'eu-west-1_testpool',
                'COGNITO_CLIENT_ID': 'test-cognito-client-id',
                'COGNITO_REGION': 'eu-west-1',
              };
              return config[key];
            });

            // Mock Google Client
            const mockVerifyIdToken = jest.fn().mockResolvedValue({
              getPayload: () => ({
                sub,
                email,
                aud: tokenAudience,
                exp: Math.floor(Date.now() / 1000) + 3600, // Válido por 1 hora
                email_verified: true,
                name: 'Test User',
              }),
            });
            
            (googleAuthService as any).googleClient = {
              verifyIdToken: mockVerifyIdToken,
            };
            (googleAuthService as any).googleClientId = configuredAudience;

            if (tokenAudience === configuredAudience) {
              // Propiedad: Tokens con audience correcta deben ser aceptados
              const result = await googleAuthService.verifyGoogleToken('valid-token');
              expect(result.email).toBe(email);
              expect(result.id).toBe(sub);
            } else {
              // Propiedad: Tokens con audience incorrecta deben ser rechazados
              await expect(
                googleAuthService.verifyGoogleToken('invalid-audience-token')
              ).rejects.toThrow(UnauthorizedException);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 18: Authentication Event Logging', () => {
    it('should log all authentication events consistently', async () => {
      const logSpy = jest.spyOn((googleAuthService as any).logger, 'log');
      const errorSpy = jest.spyOn((googleAuthService as any).logger, 'error');

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.emailAddress(),
            sub: fc.string({ minLength: 10, maxLength: 30 }),
            isSuccess: fc.boolean(),
          }),
          async ({ email, sub, isSuccess }) => {
            if (isSuccess) {
              // Mock successful verification
              const mockVerifyIdToken = jest.fn().mockResolvedValue({
                getPayload: () => ({
                  sub,
                  email,
                  aud: 'test-google-client-id',
                  exp: Math.floor(Date.now() / 1000) + 3600,
                  email_verified: true,
                  name: 'Test User',
                }),
              });
              
              (googleAuthService as any).googleClient = {
                verifyIdToken: mockVerifyIdToken,
              };

              await googleAuthService.verifyGoogleToken('valid-token');

              // Propiedad: Eventos exitosos deben ser loggeados
              expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining(`Token de Google verificado exitosamente`)
              );
            } else {
              // Mock failed verification
              const mockVerifyIdToken = jest.fn().mockRejectedValue(
                new Error('Token verification failed')
              );
              
              (googleAuthService as any).googleClient = {
                verifyIdToken: mockVerifyIdToken,
              };

              await expect(
                googleAuthService.verifyGoogleToken('invalid-token')
              ).rejects.toThrow();

              // Propiedad: Eventos fallidos deben ser loggeados como errores
              expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Token de Google no tiene formato JWT válido')
              );
            }

            // Reset spies for next iteration
            logSpy.mockClear();
            errorSpy.mockClear();
          }
        ),
        { numRuns: 50 } // Menos iteraciones para tests de logging
      );
    });

    it('should log security events for federated authentication', async () => {
      const logSpy = jest.spyOn((googleAuthService as any).logger, 'log');
      const errorSpy = jest.spyOn((googleAuthService as any).logger, 'error');

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.emailAddress(),
            sub: fc.string({ minLength: 10, maxLength: 30 }),
            federatedSuccess: fc.boolean(),
          }),
          async ({ email, sub, federatedSuccess }) => {
            // Mock Google token verification (always successful)
            const mockVerifyIdToken = jest.fn().mockResolvedValue({
              getPayload: () => ({
                sub,
                email,
                aud: 'test-google-client-id',
                exp: Math.floor(Date.now() / 1000) + 3600,
                email_verified: true,
                name: 'Test User',
              }),
            });
            
            (googleAuthService as any).googleClient = {
              verifyIdToken: mockVerifyIdToken,
            };

            // Mock Cognito service response
            if (federatedSuccess) {
              mockCognitoService.exchangeGoogleTokenForCognito.mockResolvedValue({
                accessToken: 'cognito-access-token',
                idToken: 'cognito-id-token',
                refreshToken: 'cognito-refresh-token',
                expiresIn: 3600,
              });

              mockMultiTableService.scan.mockResolvedValue([]);
              mockMultiTableService.createUser.mockResolvedValue({});

              await googleAuthService.authenticateWithGoogleFederated('valid-token');

              // Propiedad: Autenticación federada exitosa debe ser loggeada
              expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining(`Autenticación federada completada exitosamente`)
              );
            } else {
              mockCognitoService.exchangeGoogleTokenForCognito.mockRejectedValue(
                new Error('Federated authentication failed')
              );

              await expect(
                googleAuthService.authenticateWithGoogleFederated('valid-token')
              ).rejects.toThrow();

              // Propiedad: Fallos de autenticación federada deben ser loggeados como errores
              expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Error en autenticación federada')
              );
            }

            // Reset spies for next iteration
            logSpy.mockClear();
            errorSpy.mockClear();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Security Validation Integration', () => {
    it('should maintain security properties across all validation layers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            token: fc.string({ minLength: 50, maxLength: 200 }),
            email: fc.emailAddress(),
            sub: fc.string({ minLength: 10, maxLength: 30 }),
            isValidToken: fc.boolean(),
            isValidAudience: fc.boolean(),
            isNotExpired: fc.boolean(),
          }),
          async ({ token, email, sub, isValidToken, isValidAudience, isNotExpired }) => {
            const currentTime = Math.floor(Date.now() / 1000);
            const expTime = isNotExpired ? currentTime + 3600 : currentTime - 3600;
            const audience = isValidAudience ? 'test-google-client-id' : 'wrong-audience';

            if (isValidToken) {
              // Mock successful Google verification
              const mockVerifyIdToken = jest.fn().mockResolvedValue({
                getPayload: () => ({
                  sub,
                  email,
                  aud: audience,
                  exp: expTime,
                  email_verified: true,
                  name: 'Test User',
                }),
              });
              
              (googleAuthService as any).googleClient = {
                verifyIdToken: mockVerifyIdToken,
              };
            } else {
              // Mock failed Google verification
              const mockVerifyIdToken = jest.fn().mockRejectedValue(
                new Error('Invalid token')
              );
              
              (googleAuthService as any).googleClient = {
                verifyIdToken: mockVerifyIdToken,
              };
            }

            // Propiedad: Solo tokens válidos, con audience correcta y no expirados deben pasar todas las validaciones
            const shouldSucceed = isValidToken && isValidAudience && isNotExpired && token.trim() !== '';

            if (shouldSucceed) {
              const result = await googleAuthService.verifyGoogleToken(token);
              expect(result.email).toBe(email);
              expect(result.id).toBe(sub);
            } else {
              await expect(
                googleAuthService.verifyGoogleToken(token)
              ).rejects.toThrow();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});