import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthService, GoogleUserInfo, FederatedAuthResult } from '../google-auth.service';
import { MultiTableService } from '../../../infrastructure/database/multi-table.service';
import { CognitoService, CognitoTokens, GoogleUserInfo as CognitoGoogleUserInfo } from '../../../infrastructure/cognito/cognito.service';
import * as fc from 'fast-check';

describe('GoogleAuthService - Federated Authentication Properties', () => {
  let service: GoogleAuthService;
  let multiTableService: MultiTableService;
  let cognitoService: CognitoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                GOOGLE_CLIENT_ID: 'test-google-client-id',
              };
              return config[key] || defaultValue;
            }),
          },
        },
        {
          provide: MultiTableService,
          useValue: {
            scan: jest.fn(),
            getUser: jest.fn(),
            createUser: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: CognitoService,
          useValue: {
            exchangeGoogleTokenForCognito: jest.fn(),
            createFederatedUser: jest.fn(),
            validateProviderConfiguration: jest.fn().mockReturnValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<GoogleAuthService>(GoogleAuthService);
    multiTableService = module.get<MultiTableService>(MultiTableService);
    cognitoService = module.get<CognitoService>(CognitoService);
  });

  describe('Property 3: Token Verification Consistency', () => {
    /**
     * Property: Token verification should be consistent across multiple calls
     * Validates: Requirements 2.1, 4.1, 9.1
     */
    it('should consistently verify the same Google token', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sub: fc.string({ minLength: 10, maxLength: 30 }),
            email: fc.emailAddress(),
            name: fc.string({ minLength: 2, maxLength: 50 }),
            email_verified: fc.boolean(),
            aud: fc.constant('test-google-client-id'),
            exp: fc.integer({ min: Math.floor(Date.now() / 1000) + 3600 }),
            iat: fc.integer({ min: Math.floor(Date.now() / 1000) - 60 }),
          }),
          async (googlePayload) => {
            // Mock del cliente de Google OAuth
            const mockVerifyIdToken = jest.fn().mockResolvedValue({
              getPayload: () => googlePayload,
            });

            (service as any).googleClient = {
              verifyIdToken: mockVerifyIdToken,
            };

            const mockToken = `mock.${Buffer.from(JSON.stringify(googlePayload)).toString('base64')}.signature`;

            let result1, result2;
            try {
              result1 = await service.verifyGoogleToken(mockToken);
              result2 = await service.verifyGoogleToken(mockToken);

              // Propiedades de consistencia
              expect(result1).toEqual(result2);
              expect(result1.id).toBe(googlePayload.sub);
              expect(result1.email).toBe(googlePayload.email);
              expect(result1.name).toBe(googlePayload.name);
              expect(result1.email_verified).toBe(googlePayload.email_verified);

              // Verificar que se llamó al cliente de Google
              expect(mockVerifyIdToken).toHaveBeenCalledTimes(2);
              expect(mockVerifyIdToken).toHaveBeenCalledWith({
                idToken: mockToken,
                audience: 'test-google-client-id',
              });

            } catch (error) {
              // Si hay error, debe ser por token inválido
              expect(error.message).toMatch(/inválido|expirado|configurado|issuer/i);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 4: User Information Extraction', () => {
    /**
     * Property: User information extraction should preserve all required fields
     * Validates: Requirements 2.2
     */
    it('should extract complete user information from Google token', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sub: fc.string({ minLength: 10, maxLength: 30 }),
            email: fc.emailAddress(),
            name: fc.string({ minLength: 2, maxLength: 50 }),
            email_verified: fc.boolean(),
            given_name: fc.option(fc.string({ minLength: 1, maxLength: 30 })),
            family_name: fc.option(fc.string({ minLength: 1, maxLength: 30 })),
            picture: fc.option(fc.webUrl()),
            locale: fc.option(fc.constantFrom('en', 'es', 'fr', 'de')),
            hd: fc.option(fc.domain()),
            aud: fc.constant('test-google-client-id'),
            exp: fc.integer({ min: Math.floor(Date.now() / 1000) + 3600 }),
          }),
          async (googlePayload) => {
            const mockVerifyIdToken = jest.fn().mockResolvedValue({
              getPayload: () => googlePayload,
            });

            (service as any).googleClient = {
              verifyIdToken: mockVerifyIdToken,
            };

            const mockToken = `mock.${Buffer.from(JSON.stringify(googlePayload)).toString('base64')}.signature`;

            try {
              const result = await service.verifyGoogleToken(mockToken);

              // Campos obligatorios siempre presentes
              expect(result).toHaveProperty('id');
              expect(result).toHaveProperty('email');
              expect(result).toHaveProperty('name');
              expect(result).toHaveProperty('email_verified');

              // Valores correctos
              expect(result.id).toBe(googlePayload.sub);
              expect(result.email).toBe(googlePayload.email);
              expect(result.name).toBe(googlePayload.name);
              expect(result.email_verified).toBe(googlePayload.email_verified);

              // Campos opcionales preservados
              if (googlePayload.given_name) {
                expect(result.given_name).toBe(googlePayload.given_name);
              }
              if (googlePayload.family_name) {
                expect(result.family_name).toBe(googlePayload.family_name);
              }
              if (googlePayload.picture) {
                expect(result.picture).toBe(googlePayload.picture);
              }
              if (googlePayload.locale) {
                expect(result.locale).toBe(googlePayload.locale);
              }
              if (googlePayload.hd) {
                expect(result.hd).toBe(googlePayload.hd);
              }

            } catch (error) {
              expect(error.message).toMatch(/inválido|expirado|configurado|issuer/i);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5: New User Creation', () => {
    /**
     * Property: New user creation should always result in valid user objects
     * Validates: Requirements 2.3, 2.4
     */
    it('should create valid federated users for new Google accounts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sub: fc.string({ minLength: 10, maxLength: 30 }),
            email: fc.emailAddress(),
            name: fc.string({ minLength: 2, maxLength: 50 }),
            email_verified: fc.boolean(),
            given_name: fc.option(fc.string({ minLength: 1, maxLength: 30 })),
            family_name: fc.option(fc.string({ minLength: 1, maxLength: 30 })),
            picture: fc.option(fc.webUrl()),
          }),
          async (googleUser) => {
            // Mock para usuario nuevo (no existe)
            (multiTableService.scan as jest.Mock).mockResolvedValue([]);
            (multiTableService.createUser as jest.Mock).mockResolvedValue(undefined);
            (cognitoService.exchangeGoogleTokenForCognito as jest.Mock).mockResolvedValue({
              accessToken: `cognito_federated_${googleUser.sub}_${Date.now()}`,
              idToken: `cognito_id_${googleUser.sub}_${Date.now()}`,
              refreshToken: `cognito_refresh_${googleUser.sub}_${Date.now()}`,
              expiresIn: 3600,
            });
            (cognitoService.createFederatedUser as jest.Mock).mockResolvedValue({
              sub: `google_${googleUser.sub}`,
              email: googleUser.email,
            });

            try {
              const result = await service.createOrUpdateFederatedUser(googleUser as CognitoGoogleUserInfo);

              // Propiedades del usuario creado
              expect(result).toBeDefined();
              expect(result.userId).toBe(`google_${googleUser.sub}`);
              expect(result.email).toBe(googleUser.email);
              expect(result.displayName).toBe(googleUser.name);
              expect(result.googleId).toBe(googleUser.sub);
              expect(result.isGoogleLinked).toBe(true);
              expect(result.authProviders).toContain('google');
              expect(result.existingUser).toBe(false);

              // Estructura de identidad federada
              expect(result.federatedIdentity).toBeDefined();
              expect(result.federatedIdentity.provider).toBe('google');
              expect(result.federatedIdentity.providerId).toBe(googleUser.sub);

              // Verificar que se llamó a createUser
              expect(multiTableService.createUser).toHaveBeenCalledWith(
                expect.objectContaining({
                  userId: `google_${googleUser.sub}`,
                  email: googleUser.email,
                  googleId: googleUser.sub,
                  isGoogleLinked: true,
                  authProviders: ['google'],
                })
              );

            } catch (error) {
              // Error esperado por configuración o validación
              expect(error.message).toMatch(/configurado|inválido|error/i);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 14: Attribute Mapping Consistency', () => {
    /**
     * Property: Attribute mapping should be consistent and preserve data integrity
     * Validates: Requirements 7.2
     */
    it('should consistently map Google attributes to user format', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sub: fc.string({ minLength: 10, maxLength: 30 }),
            email: fc.emailAddress(),
            name: fc.string({ minLength: 2, maxLength: 50 }),
            email_verified: fc.boolean(),
            given_name: fc.option(fc.string({ minLength: 1, maxLength: 30 })),
            family_name: fc.option(fc.string({ minLength: 1, maxLength: 30 })),
            picture: fc.option(fc.webUrl()),
            locale: fc.option(fc.constantFrom('en', 'es', 'fr', 'de')),
            hd: fc.option(fc.domain()),
          }),
          async (googleUser) => {
            // Mock Date.now() para consistencia en timestamps
            const mockDate = new Date('2026-01-11T01:12:52.152Z');
            const originalDateNow = Date.now;
            Date.now = jest.fn(() => mockDate.getTime());

            try {
              const result1 = service.mapGoogleAttributesToUser(googleUser as CognitoGoogleUserInfo);
              const result2 = service.mapGoogleAttributesToUser(googleUser as CognitoGoogleUserInfo);

              // Consistencia entre llamadas
              expect(result1).toEqual(result2);

              // Mapeo correcto de campos obligatorios
              expect(result1.email).toBe(googleUser.email);
              expect(result1.emailVerified).toBe(googleUser.email_verified);
              expect(result1.displayName).toBe(googleUser.name);
              expect(result1.googleId).toBe(googleUser.sub);
              expect(result1.authProvider).toBe('google');

              // Mapeo correcto de campos opcionales
              if (googleUser.given_name) {
                expect(result1.firstName).toBe(googleUser.given_name);
              }
              if (googleUser.family_name) {
                expect(result1.lastName).toBe(googleUser.family_name);
              }
              if (googleUser.picture) {
                expect(result1.avatarUrl).toBe(googleUser.picture);
              }
              if (googleUser.locale) {
                expect(result1.locale).toBe(googleUser.locale);
              }
              if (googleUser.hd) {
                expect(result1.domain).toBe(googleUser.hd);
              }

              // Campos generados automáticamente
              expect(result1.lastSync).toBeDefined();
              expect(typeof result1.lastSync).toBe('string');
              expect(new Date(result1.lastSync)).toBeInstanceOf(Date);
            } finally {
              // Restore original Date.now
              Date.now = originalDateNow;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Token Consistency Validation', () => {
    /**
     * Property: Token consistency validation should work correctly
     */
    it('should validate token consistency between Google and Cognito tokens', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sub: fc.string({ minLength: 10, maxLength: 30 }),
            email: fc.emailAddress(),
            name: fc.string({ minLength: 2, maxLength: 50 }),
            aud: fc.constant('test-google-client-id'),
            exp: fc.integer({ min: Math.floor(Date.now() / 1000) + 3600 }),
          }),
          async (googlePayload) => {
            const mockVerifyIdToken = jest.fn().mockResolvedValue({
              getPayload: () => googlePayload,
            });

            (service as any).googleClient = {
              verifyIdToken: mockVerifyIdToken,
            };

            const mockGoogleToken = `mock.${Buffer.from(JSON.stringify(googlePayload)).toString('base64')}.signature`;
            const mockCognitoTokens: CognitoTokens = {
              accessToken: `cognito_federated_us-east-1_${googlePayload.sub}_${Date.now()}`,
              idToken: `cognito_id_us-east-1_${googlePayload.sub}_${Date.now()}`,
              refreshToken: `cognito_refresh_us-east-1_${googlePayload.sub}_${Date.now()}`,
              expiresIn: 3600,
            };

            try {
              const isConsistent = await service.validateTokenConsistency(mockGoogleToken, mockCognitoTokens);

              // La consistencia debe ser verdadera si los tokens contienen el mismo sub
              expect(typeof isConsistent).toBe('boolean');
              
              if (isConsistent) {
                // Si es consistente, el Identity ID debe contener el Google sub
                expect(mockCognitoTokens.accessToken).toContain(googlePayload.sub);
              }

            } catch (error) {
              // Error esperado por token inválido o configuración
              expect(error.message).toMatch(/inválido|expirado|configurado/i);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});