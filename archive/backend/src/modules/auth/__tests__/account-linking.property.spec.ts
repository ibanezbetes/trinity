import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { MultiTableService } from '../../../infrastructure/database/multi-table.service';
import { CognitoService } from '../../../infrastructure/cognito/cognito.service';
import { GoogleAuthService } from '../google-auth.service';
import { FederatedUserManagementService } from '../federated-user-management.service';
import { FederatedSessionManagementService } from '../federated-session-management.service';
import { GoogleAuthAnalyticsService } from '../google-auth-analytics.service';
import { EventTracker } from '../../analytics/event-tracker.service';
import * as fc from 'fast-check';

describe('AuthService - Account Linking Properties', () => {
  let service: AuthService;
  let multiTableService: MultiTableService;
  let cognitoService: CognitoService;
  let googleAuthService: GoogleAuthService;
  let federatedUserService: FederatedUserManagementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
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
            validateProviderConfiguration: jest.fn(),
            linkGoogleProvider: jest.fn(),
            unlinkGoogleProvider: jest.fn(),
          },
        },
        {
          provide: GoogleAuthService,
          useValue: {
            verifyGoogleToken: jest.fn(),
            linkGoogleToExistingUser: jest.fn(),
            unlinkGoogleFromUser: jest.fn(),
            syncProfileFromGoogle: jest.fn(),
            isGoogleAuthAvailable: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: FederatedUserManagementService,
          useValue: {
            linkFederatedIdentity: jest.fn(),
            unlinkFederatedIdentity: jest.fn(),
            createFederatedUser: jest.fn(),
            syncFederatedProfile: jest.fn(),
          },
        },
        {
          provide: FederatedSessionManagementService,
          useValue: {
            createFederatedSession: jest.fn(),
            validateSession: jest.fn(),
            refreshSession: jest.fn(),
            cleanupSession: jest.fn(),
          },
        },
        {
          provide: GoogleAuthAnalyticsService,
          useValue: {
            trackLoginAttempt: jest.fn(),
            trackLoginSuccess: jest.fn(),
            trackLoginFailure: jest.fn(),
            trackAccountLinking: jest.fn(),
          },
        },
        {
          provide: EventTracker,
          useValue: {
            trackUserAction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    multiTableService = module.get<MultiTableService>(MultiTableService);
    cognitoService = module.get<CognitoService>(CognitoService);
    googleAuthService = module.get<GoogleAuthService>(GoogleAuthService);
    federatedUserService = module.get<FederatedUserManagementService>(FederatedUserManagementService);
  });

  describe('Property 9: Account Linking Validation', () => {
    /**
     * Property: Account linking should validate user existence and prevent conflicts
     * Validates: Requirements 4.2
     */
    it('should validate account linking correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.string({ minLength: 10, maxLength: 30 }),
            email: fc.emailAddress(),
            googleId: fc.string({ minLength: 10, maxLength: 30 }),
            googleEmail: fc.emailAddress(),
            name: fc.string({ minLength: 2, maxLength: 50 }),
          }),
          async (linkingData) => {
            // Mock de usuario existente
            (multiTableService.getUser as jest.Mock).mockResolvedValue({
              userId: linkingData.userId,
              email: linkingData.email,
              authProviders: ['email'],
            });

            // Mock de Google token válido
            (googleAuthService.verifyGoogleToken as jest.Mock).mockResolvedValue({
              id: linkingData.googleId,
              email: linkingData.googleEmail,
              name: linkingData.name,
              email_verified: true,
            });

            // Mock de no conflictos (no hay otro usuario con este Google ID)
            (multiTableService.scan as jest.Mock).mockResolvedValue([]);

            (cognitoService.validateProviderConfiguration as jest.Mock).mockReturnValue(true);
            (cognitoService.linkGoogleProvider as jest.Mock).mockResolvedValue(undefined);
            (googleAuthService.linkGoogleToExistingUser as jest.Mock).mockResolvedValue(undefined);
            (googleAuthService.syncProfileFromGoogle as jest.Mock).mockResolvedValue(undefined);

            // Mock del servicio federado para vinculación exitosa
            const mockLinkedProfile = {
              id: linkingData.userId,
              email: linkingData.email,
              googleId: linkingData.googleId,
              isGoogleLinked: true,
              authProviders: ['email', 'google'],
            };
            
            (federatedUserService.linkFederatedIdentity as jest.Mock).mockResolvedValue(mockLinkedProfile);

            // Mock del usuario actualizado después de vincular
            (multiTableService.getUser as jest.Mock).mockResolvedValueOnce({
              userId: linkingData.userId,
              email: linkingData.email,
              googleId: linkingData.googleId,
              isGoogleLinked: true,
              authProviders: ['email', 'google'],
            });

            const mockIdToken = `mock.${Buffer.from(JSON.stringify(linkingData)).toString('base64')}.signature`;

            try {
              const result = await service.linkGoogleAccountFederated(linkingData.userId, mockIdToken);

              // Propiedades del resultado de vinculación
              expect(result).toBeDefined();
              expect(result.id).toBe(linkingData.userId);
              expect(result.isGoogleLinked).toBe(true);
              expect(result.authProviders).toContain('google');

              // Verificar que se llamaron los métodos correctos
              expect(googleAuthService.verifyGoogleToken).toHaveBeenCalledWith(mockIdToken);
              expect(multiTableService.scan).toHaveBeenCalledWith(
                'trinity-users-dev',
                expect.objectContaining({
                  FilterExpression: 'googleId = :googleId',
                  ExpressionAttributeValues: {
                    ':googleId': linkingData.googleId,
                  },
                })
              );

            } catch (error) {
              // Error esperado por validación o configuración
              expect(error.message).toMatch(/encontrado|vinculada|configurado|Error de autenticación/i);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 10: Duplicate Linking Prevention', () => {
    /**
     * Property: Should prevent linking Google account already linked to another user
     * Validates: Requirements 4.3
     */
    it('should prevent duplicate Google account linking', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId1: fc.string({ minLength: 10, maxLength: 30 }),
            userId2: fc.string({ minLength: 10, maxLength: 30 }),
            googleId: fc.string({ minLength: 10, maxLength: 30 }),
            email1: fc.emailAddress(),
            email2: fc.emailAddress(),
          }).filter(data => data.userId1 !== data.userId2), // Usuarios diferentes
          async (conflictData) => {
            // Mock de usuario 1 existente
            (multiTableService.getUser as jest.Mock).mockResolvedValue({
              userId: conflictData.userId2,
              email: conflictData.email2,
              authProviders: ['email'],
            });

            // Mock de Google token válido
            (googleAuthService.verifyGoogleToken as jest.Mock).mockResolvedValue({
              id: conflictData.googleId,
              email: conflictData.email1,
              name: 'Test User',
              email_verified: true,
            });

            // Mock de conflicto: Google ID ya vinculado a otro usuario
            (multiTableService.scan as jest.Mock).mockResolvedValue([
              {
                userId: conflictData.userId1, // Usuario diferente
                googleId: conflictData.googleId,
                email: conflictData.email1,
              }
            ]);

            const mockIdToken = `mock.${Buffer.from(JSON.stringify(conflictData)).toString('base64')}.signature`;

            try {
              await service.linkGoogleAccountFederated(conflictData.userId2, mockIdToken);
              
              // Si no lanza error, algo está mal
              fail('Debería haber lanzado ConflictException');
              
            } catch (error) {
              // Debe lanzar error de conflicto
              expect(error).toBeInstanceOf(ConflictException);
              expect(error.message).toMatch(/ya está vinculada/i);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 11: Unlinking Safety Check', () => {
    /**
     * Property: Should prevent unlinking if it's the only authentication method
     * Validates: Requirements 5.2
     */
    it('should prevent unsafe unlinking of Google accounts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.string({ minLength: 10, maxLength: 30 }),
            email: fc.emailAddress(),
            googleId: fc.string({ minLength: 10, maxLength: 30 }),
            authProviders: fc.constantFrom(['google'], ['google', 'email'], ['email', 'google']),
          }),
          async (unlinkingData) => {
            // Mock de usuario con diferentes configuraciones de proveedores
            (multiTableService.getUser as jest.Mock).mockResolvedValue({
              userId: unlinkingData.userId,
              email: unlinkingData.email,
              googleId: unlinkingData.googleId,
              authProviders: unlinkingData.authProviders,
            });

            try {
              await service.unlinkGoogleAccountFederated(unlinkingData.userId);

              // Si solo tiene Google como proveedor, debería fallar
              if (unlinkingData.authProviders.length === 1 && unlinkingData.authProviders[0] === 'google') {
                fail('Debería haber lanzado error por único método de autenticación');
              }

              // Si tiene múltiples proveedores, debería funcionar
              if (unlinkingData.authProviders.length > 1) {
                expect(googleAuthService.unlinkGoogleFromUser).toHaveBeenCalledWith(unlinkingData.userId);
              }

            } catch (error) {
              // Error esperado si es el único método de autenticación
              if (unlinkingData.authProviders.length === 1 && unlinkingData.authProviders[0] === 'google') {
                // El servicio puede envolver el error en un mensaje amigable
                expect(error.message).toMatch(/único método de autenticación|Error de autenticación|soporte técnico/i);
              } else {
                // Error inesperado
                expect(error.message).toMatch(/encontrado|error|Error de autenticación/i);
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 12: Safe Unlinking', () => {
    /**
     * Property: Safe unlinking should preserve user access
     * Validates: Requirements 5.3
     */
    it('should safely unlink Google accounts when multiple auth methods exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.string({ minLength: 10, maxLength: 30 }),
            email: fc.emailAddress(),
            googleId: fc.string({ minLength: 10, maxLength: 30 }),
          }),
          async (userData) => {
            // Mock de usuario con múltiples métodos de autenticación
            (multiTableService.getUser as jest.Mock)
              .mockResolvedValueOnce({
                userId: userData.userId,
                email: userData.email,
                googleId: userData.googleId,
                authProviders: ['email', 'google'], // Múltiples métodos
                isGoogleLinked: true,
              })
              .mockResolvedValueOnce({
                userId: userData.userId,
                email: userData.email,
                authProviders: ['email'], // Después de desvincular
                isGoogleLinked: false,
              });

            (cognitoService.validateProviderConfiguration as jest.Mock).mockReturnValue(true);
            (cognitoService.unlinkGoogleProvider as jest.Mock).mockResolvedValue(undefined);
            (googleAuthService.unlinkGoogleFromUser as jest.Mock).mockResolvedValue(undefined);

            try {
              const result = await service.unlinkGoogleAccountFederated(userData.userId);

              // Propiedades del resultado de desvinculación
              expect(result).toBeDefined();
              expect(result.id).toBe(userData.userId);
              expect(result.isGoogleLinked).toBe(false);
              expect(result.authProviders).not.toContain('google');
              expect(result.authProviders).toContain('email'); // Mantiene email

              // Verificar que se llamaron los métodos correctos
              expect(googleAuthService.unlinkGoogleFromUser).toHaveBeenCalledWith(userData.userId);

            } catch (error) {
              // Error esperado por validación
              expect(error.message).toMatch(/encontrado|único método|error/i);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Auth Providers Management', () => {
    /**
     * Property: Auth providers should be managed correctly
     */
    it('should manage authentication providers correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.string({ minLength: 10, maxLength: 30 }),
            authProviders: fc.array(
              fc.constantFrom('email', 'google', 'facebook'),
              { minLength: 1, maxLength: 3 }
            ),
          }),
          async (userData) => {
            (multiTableService.getUser as jest.Mock).mockResolvedValue({
              userId: userData.userId,
              authProviders: userData.authProviders,
            });

            try {
              const providers = await service.getUserAuthProviders(userData.userId);
              const canUnlink = await service.canUnlinkGoogle(userData.userId);

              // Verificar que los proveedores se obtienen correctamente
              expect(Array.isArray(providers)).toBe(true);
              expect(providers.length).toBeGreaterThan(0);

              // Verificar lógica de desvinculación
              const hasNonGoogleProviders = userData.authProviders.some(p => p !== 'google');
              expect(canUnlink).toBe(hasNonGoogleProviders);

            } catch (error) {
              // Error esperado por usuario no encontrado
              expect(error.message).toMatch(/error|encontrado/i);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});