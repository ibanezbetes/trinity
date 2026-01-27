/**
 * Property Test: Dual Authentication Flow Support
 * 
 * This test validates that both email/password and Google Sign-In
 * authentication flows work seamlessly and can be used interchangeably.
 * 
 * Validates Requirements: 4.2
 */

import { dualAuthFlowService, AuthenticationResult } from '../services/dualAuthFlowService';
import { cognitoAuthService } from '../services/cognitoAuthService';
import { googleSignInService } from '../services/googleSignInService';
import { federatedAuthService } from '../services/federatedAuthService';
import fc from 'fast-check';

// Mock services
jest.mock('../services/cognitoAuthService');
jest.mock('../services/googleSignInService');
jest.mock('../services/federatedAuthService');
jest.mock('../services/networkService', () => ({
  networkService: {
    isConnected: jest.fn(() => true),
    executeWithRetry: jest.fn((fn) => fn()),
  },
}));
jest.mock('../services/loggingService', () => ({
  loggingService: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    logAuth: jest.fn(),
  },
}));

describe('Property Test: Dual Authentication Flow Support', () => {
  const mockCognitoService = cognitoAuthService as jest.Mocked<typeof cognitoAuthService>;
  const mockGoogleSignInService = googleSignInService as jest.Mocked<typeof googleSignInService>;
  const mockFederatedService = federatedAuthService as jest.Mocked<typeof federatedAuthService>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Generators for test data
  const validEmailArbitrary = fc.emailAddress();
  const validPasswordArbitrary = fc.string({ minLength: 8, maxLength: 50 })
    .filter(pwd => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(pwd));
  const validNameArbitrary = fc.string({ minLength: 2, maxLength: 100 });

  const validUserArbitrary = fc.record({
    sub: fc.uuid(),
    email: fc.emailAddress(),
    email_verified: fc.boolean(),
    username: fc.string({ minLength: 3, maxLength: 50 }),
    preferred_username: fc.string({ minLength: 3, maxLength: 50 }),
    name: fc.string({ minLength: 2, maxLength: 100 }),
    picture: fc.webUrl(),
  });

  const validTokensArbitrary = fc.record({
    accessToken: fc.string({ minLength: 100, maxLength: 2000 }),
    idToken: fc.string({ minLength: 100, maxLength: 2000 }),
    refreshToken: fc.string({ minLength: 50, maxLength: 500 }),
  });

  const authErrorArbitrary = fc.constantFrom(
    'Email o contraseña incorrectos',
    'Usuario no encontrado',
    'Cuenta no verificada',
    'Demasiados intentos',
    'Error de conexión'
  );

  /**
   * Property: Email authentication should work consistently
   */
  test('Property: Email authentication should handle valid credentials correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArbitrary,
        validPasswordArbitrary,
        validUserArbitrary,
        validTokensArbitrary,
        async (email, password, user, tokens) => {
          // Setup: Mock successful Cognito login
          mockCognitoService.login.mockResolvedValue({
            success: true,
            data: { user, tokens },
          });

          // Execute: Authenticate with email
          const result = await dualAuthFlowService.authenticateWithEmail(email, password);

          // Verify: Should succeed with correct data
          expect(result.success).toBe(true);
          expect(result.method).toBe('email');
          expect(result.user).toEqual(user);
          expect(result.tokens).toEqual(tokens);
          expect(result.error).toBeUndefined();

          // Verify service was called correctly
          expect(mockCognitoService.login).toHaveBeenCalledWith(email, password);
        }
      ),
      { numRuns: 30, timeout: 10000 }
    );
  });

  /**
   * Property: Email authentication should handle errors gracefully
   */
  test('Property: Email authentication should handle errors gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArbitrary,
        validPasswordArbitrary,
        authErrorArbitrary,
        async (email, password, errorMessage) => {
          // Setup: Mock failed Cognito login
          mockCognitoService.login.mockResolvedValue({
            success: false,
            error: errorMessage,
          });

          // Execute: Authenticate with email
          const result = await dualAuthFlowService.authenticateWithEmail(email, password);

          // Verify: Should fail gracefully
          expect(result.success).toBe(false);
          expect(result.method).toBe('email');
          expect(result.error).toBeDefined();
          expect(result.user).toBeUndefined();
          expect(result.tokens).toBeUndefined();

          // Verify service was called
          expect(mockCognitoService.login).toHaveBeenCalledWith(email, password);
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Google authentication should work when available
   */
  test('Property: Google authentication should work when available', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUserArbitrary,
        validTokensArbitrary,
        async (user, tokens) => {
          // Setup: Mock Google Sign-In availability and success
          mockGoogleSignInService.getAvailabilityStatus.mockResolvedValue({
            status: 'native_available' as any,
            canSignIn: true,
            method: 'native',
            message: 'Google Sign-In available',
            environment: {} as any,
            capabilities: {} as any,
          });

          mockFederatedService.signInWithGoogle.mockResolvedValue({
            success: true,
            data: { user, tokens, provider: 'google' },
          });

          // Execute: Authenticate with Google
          const result = await dualAuthFlowService.authenticateWithGoogle();

          // Verify: Should succeed
          expect(result.success).toBe(true);
          expect(result.method).toBe('google');
          expect(result.user).toEqual(user);
          expect(result.tokens).toEqual(tokens);
          expect(result.error).toBeUndefined();

          // Verify services were called
          expect(mockGoogleSignInService.getAvailabilityStatus).toHaveBeenCalled();
          expect(mockFederatedService.signInWithGoogle).toHaveBeenCalled();
        }
      ),
      { numRuns: 30, timeout: 10000 }
    );
  });

  /**
   * Property: Google authentication should handle unavailability gracefully
   */
  test('Property: Google authentication should handle unavailability gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'Google Sign-In no está disponible',
          'Google Sign-In no está configurado',
          'Entorno no soportado'
        ),
        async (unavailabilityMessage) => {
          // Setup: Mock Google Sign-In unavailability
          mockGoogleSignInService.getAvailabilityStatus.mockResolvedValue({
            status: 'not_available' as any,
            canSignIn: false,
            method: 'none',
            message: unavailabilityMessage,
            environment: {} as any,
            capabilities: {} as any,
          });

          // Execute: Authenticate with Google
          const result = await dualAuthFlowService.authenticateWithGoogle();

          // Verify: Should fail gracefully
          expect(result.success).toBe(false);
          expect(result.method).toBe('google');
          expect(result.error).toContain(unavailabilityMessage);
          expect(result.user).toBeUndefined();
          expect(result.tokens).toBeUndefined();

          // Verify availability was checked
          expect(mockGoogleSignInService.getAvailabilityStatus).toHaveBeenCalled();
          expect(mockFederatedService.signInWithGoogle).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Auto authentication should try preferred method first
   */
  test('Property: Auto authentication should respect preferred method', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('email', 'google'),
        validEmailArbitrary,
        validPasswordArbitrary,
        validUserArbitrary,
        validTokensArbitrary,
        async (preferredMethod, email, password, user, tokens) => {
          // Setup: Mock both methods as successful
          mockCognitoService.login.mockResolvedValue({
            success: true,
            data: { user, tokens },
          });

          mockGoogleSignInService.getAvailabilityStatus.mockResolvedValue({
            status: 'native_available' as any,
            canSignIn: true,
            method: 'native',
            message: 'Available',
            environment: {} as any,
            capabilities: {} as any,
          });

          mockFederatedService.signInWithGoogle.mockResolvedValue({
            success: true,
            data: { user, tokens, provider: 'google' },
          });

          // Execute: Auto authenticate with preferred method
          const result = await dualAuthFlowService.authenticateAuto(
            { email, password },
            { preferredMethod: preferredMethod as any }
          );

          // Verify: Should succeed with preferred method
          expect(result.success).toBe(true);
          expect(result.method).toBe(preferredMethod);
          expect(result.user).toEqual(user);
          expect(result.tokens).toEqual(tokens);

          // Verify correct service was called based on preference
          if (preferredMethod === 'email') {
            expect(mockCognitoService.login).toHaveBeenCalledWith(email, password);
          } else {
            expect(mockGoogleSignInService.getAvailabilityStatus).toHaveBeenCalled();
            expect(mockFederatedService.signInWithGoogle).toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 20, timeout: 15000 }
    );
  });

  /**
   * Property: Auto authentication should fallback when primary method fails
   */
  test('Property: Auto authentication should fallback when primary method fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArbitrary,
        validPasswordArbitrary,
        validUserArbitrary,
        validTokensArbitrary,
        authErrorArbitrary,
        async (email, password, user, tokens, primaryError) => {
          // Setup: Primary method (email) fails, Google succeeds
          mockCognitoService.login.mockResolvedValue({
            success: false,
            error: primaryError,
          });

          mockGoogleSignInService.getAvailabilityStatus.mockResolvedValue({
            status: 'native_available' as any,
            canSignIn: true,
            method: 'native',
            message: 'Available',
            environment: {} as any,
            capabilities: {} as any,
          });

          mockFederatedService.signInWithGoogle.mockResolvedValue({
            success: true,
            data: { user, tokens, provider: 'google' },
          });

          // Execute: Auto authenticate with fallback enabled
          const result = await dualAuthFlowService.authenticateAuto(
            { email, password },
            { preferredMethod: 'email', allowFallback: true }
          );

          // Verify: Should succeed with fallback method
          expect(result.success).toBe(true);
          expect(result.method).toBe('google');
          expect(result.user).toEqual(user);
          expect(result.tokens).toEqual(tokens);

          // Verify both methods were attempted
          expect(mockCognitoService.login).toHaveBeenCalledWith(email, password);
          expect(mockFederatedService.signInWithGoogle).toHaveBeenCalled();
        }
      ),
      { numRuns: 20, timeout: 15000 }
    );
  });

  /**
   * Property: Registration should validate input correctly
   */
  test('Property: Registration should validate input correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Valid inputs
          fc.record({
            email: validEmailArbitrary,
            password: validPasswordArbitrary,
            name: validNameArbitrary,
            shouldSucceed: fc.constant(true),
          }),
          // Invalid email
          fc.record({
            email: fc.string().filter(s => !s.includes('@')),
            password: validPasswordArbitrary,
            name: validNameArbitrary,
            shouldSucceed: fc.constant(false),
          }),
          // Invalid password
          fc.record({
            email: validEmailArbitrary,
            password: fc.string({ maxLength: 7 }),
            name: validNameArbitrary,
            shouldSucceed: fc.constant(false),
          }),
          // Empty name
          fc.record({
            email: validEmailArbitrary,
            password: validPasswordArbitrary,
            name: fc.constant(''),
            shouldSucceed: fc.constant(false),
          })
        ),
        async (testCase) => {
          // Setup: Mock successful registration for valid inputs
          if (testCase.shouldSucceed) {
            mockCognitoService.register.mockResolvedValue({
              success: true,
              message: 'Registration successful',
              userSub: 'test-user-sub',
            });
          }

          // Execute: Register with test inputs
          const result = await dualAuthFlowService.registerWithEmail(
            testCase.email,
            testCase.password,
            testCase.name
          );

          // Verify: Result should match expectation
          if (testCase.shouldSucceed) {
            expect(result.success).toBe(true);
            expect(result.method).toBe('email');
            expect(mockCognitoService.register).toHaveBeenCalledWith(
              testCase.email,
              testCase.password,
              testCase.name
            );
          } else {
            expect(result.success).toBe(false);
            expect(result.method).toBe('email');
            expect(result.error).toBeDefined();
            
            // Should not call service for invalid inputs
            if (!testCase.email.includes('@') || testCase.password.length < 8 || !testCase.name) {
              expect(mockCognitoService.register).not.toHaveBeenCalled();
            }
          }
        }
      ),
      { numRuns: 40, timeout: 10000 }
    );
  });

  /**
   * Property: Available auth methods should be detected correctly
   */
  test('Property: Available auth methods should be detected correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.string(),
        async (googleAvailable, googleMessage) => {
          // Setup: Mock Google availability
          mockGoogleSignInService.getAvailabilityStatus.mockResolvedValue({
            status: googleAvailable ? 'native_available' as any : 'not_available' as any,
            canSignIn: googleAvailable,
            method: googleAvailable ? 'native' : 'none',
            message: googleMessage,
            environment: {} as any,
            capabilities: {} as any,
          });

          // Execute: Get available auth methods
          const methods = await dualAuthFlowService.getAvailableAuthMethods();

          // Verify: Should correctly report availability
          expect(methods.email).toBe(true); // Email is always available
          expect(methods.google).toBe(googleAvailable);
          
          if (!googleAvailable) {
            expect(methods.googleMessage).toBe(googleMessage);
          }

          // Verify service was called
          expect(mockGoogleSignInService.getAvailabilityStatus).toHaveBeenCalled();
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Sign out should clear all authentication state
   */
  test('Property: Sign out should clear all authentication state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        async (hasStoredAuth) => {
          // Setup: Mock stored auth check
          if (hasStoredAuth) {
            mockCognitoService.checkStoredAuth.mockResolvedValue({
              isAuthenticated: true,
              user: {} as any,
              tokens: {} as any,
            });
          } else {
            mockCognitoService.checkStoredAuth.mockResolvedValue({
              isAuthenticated: false,
            });
          }

          // Mock sign out services
          mockFederatedService.signOut.mockResolvedValue({ success: true });
          mockCognitoService.clearTokens.mockResolvedValue();

          // Execute: Sign out
          const result = await dualAuthFlowService.signOutAll();

          // Verify: Should always succeed
          expect(result.success).toBe(true);

          // Verify cleanup was called
          expect(mockCognitoService.clearTokens).toHaveBeenCalled();
          
          // If there was stored auth, federated sign out should be called
          if (hasStoredAuth) {
            expect(mockFederatedService.signOut).toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Network errors should be handled gracefully across all methods
   */
  test('Property: Network errors should be handled gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('email', 'google'),
        validEmailArbitrary,
        validPasswordArbitrary,
        fc.constantFrom(
          'Network request failed',
          'Connection timeout',
          'DNS resolution failed',
          'fetch error'
        ),
        async (method, email, password, networkError) => {
          // Setup: Mock network errors
          const error = new Error(networkError);
          
          if (method === 'email') {
            mockCognitoService.login.mockRejectedValue(error);
          } else {
            mockGoogleSignInService.getAvailabilityStatus.mockResolvedValue({
              status: 'native_available' as any,
              canSignIn: true,
              method: 'native',
              message: 'Available',
              environment: {} as any,
              capabilities: {} as any,
            });
            mockFederatedService.signInWithGoogle.mockRejectedValue(error);
          }

          // Execute: Authenticate with network error
          const result = method === 'email'
            ? await dualAuthFlowService.authenticateWithEmail(email, password)
            : await dualAuthFlowService.authenticateWithGoogle();

          // Verify: Should handle error gracefully
          expect(result.success).toBe(false);
          expect(result.method).toBe(method);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('conexión');
          expect(result.user).toBeUndefined();
          expect(result.tokens).toBeUndefined();
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });
});