/**
 * Dual Authentication Flow Service
 * Coordinates email/password and Google Sign-In authentication flows
 * Ensures both methods work seamlessly with Cognito
 */

import { cognitoAuthService, CognitoUser, CognitoTokens } from './cognitoAuthService';
import { federatedAuthService } from './federatedAuthService';
import { googleSignInService } from './googleSignInService';
import { sessionCleanupService } from './sessionCleanupService';
import { loggingService } from './loggingService';
import { networkService } from './networkService';

export interface AuthenticationResult {
  success: boolean;
  user?: CognitoUser;
  tokens?: CognitoTokens;
  method: 'email' | 'google' | 'none';
  error?: string;
  requiresAction?: 'email_verification' | 'password_reset' | 'account_linking';
}

export interface AuthenticationOptions {
  preferredMethod?: 'email' | 'google' | 'auto';
  allowFallback?: boolean;
  skipNetworkCheck?: boolean;
}

class DualAuthFlowService {
  
  constructor() {
    loggingService.info('DualAuthFlowService', 'Dual authentication flow service initialized');
  }

  /**
   * Authenticate user with email and password
   */
  async authenticateWithEmail(
    email: string, 
    password: string,
    options: AuthenticationOptions = {}
  ): Promise<AuthenticationResult> {
    try {
      loggingService.logAuth('dual_auth_email_attempt', { email, hasOptions: !!options });

      // Check network connectivity if not skipped
      if (!options.skipNetworkCheck && !networkService.isConnected()) {
        return {
          success: false,
          method: 'none',
          error: 'Sin conexión a internet. Verifica tu conexión e inténtalo de nuevo.',
        };
      }

      // Validate input
      if (!email || !password) {
        return {
          success: false,
          method: 'email',
          error: 'Email y contraseña son requeridos',
        };
      }

      if (!this.isValidEmail(email)) {
        return {
          success: false,
          method: 'email',
          error: 'Formato de email inválido',
        };
      }

      // Attempt Cognito login
      const loginResult = await cognitoAuthService.login(email, password);

      if (loginResult.success && loginResult.data) {
        loggingService.logAuth('dual_auth_email_success', {
          userId: loginResult.data.user.sub,
          email: loginResult.data.user.email,
        });

        return {
          success: true,
          user: loginResult.data.user,
          tokens: loginResult.data.tokens,
          method: 'email',
        };
      }

      // Handle specific error cases
      const errorResult = this.handleEmailAuthError(loginResult.error || 'Error desconocido');
      
      loggingService.logAuth('dual_auth_email_error', {
        email,
        error: loginResult.error,
        requiresAction: errorResult.requiresAction,
      });

      return errorResult;

    } catch (error: any) {
      console.error('Email authentication error:', error);
      
      loggingService.logAuth('dual_auth_email_exception', {
        email,
        errorMessage: error.message,
      });

      return {
        success: false,
        method: 'email',
        error: this.getNetworkFriendlyError(error.message || 'Error de conexión'),
      };
    }
  }

  /**
   * Authenticate user with Google Sign-In
   */
  async authenticateWithGoogle(
    options: AuthenticationOptions = {}
  ): Promise<AuthenticationResult> {
    try {
      loggingService.logAuth('dual_auth_google_attempt', { hasOptions: !!options });

      // Check network connectivity if not skipped
      if (!options.skipNetworkCheck && !networkService.isConnected()) {
        return {
          success: false,
          method: 'none',
          error: 'Sin conexión a internet. Verifica tu conexión e inténtalo de nuevo.',
        };
      }

      // Check Google Sign-In availability
      const availability = await googleSignInService.getAvailabilityStatus();
      
      if (!availability.canSignIn) {
        const fallbackMessage = options.allowFallback 
          ? ' Puedes usar email y contraseña como alternativa.'
          : '';
        
        return {
          success: false,
          method: 'google',
          error: availability.message + fallbackMessage,
        };
      }

      // Attempt Google Sign-In with Cognito integration
      const googleResult = await federatedAuthService.signInWithGoogle();

      if (googleResult.success && googleResult.data) {
        loggingService.logAuth('dual_auth_google_success', {
          userId: googleResult.data.user.sub,
          email: googleResult.data.user.email,
          provider: googleResult.data.provider,
        });

        return {
          success: true,
          user: googleResult.data.user,
          tokens: googleResult.data.tokens,
          method: 'google',
        };
      }

      // Handle Google authentication errors
      const errorResult = this.handleGoogleAuthError(googleResult.error || 'Error desconocido', options.allowFallback);
      
      loggingService.logAuth('dual_auth_google_error', {
        error: googleResult.error,
        requiresAction: errorResult.requiresAction,
      });

      return errorResult;

    } catch (error: any) {
      console.error('Google authentication error:', error);
      
      loggingService.logAuth('dual_auth_google_exception', {
        errorMessage: error.message,
      });

      const fallbackMessage = options.allowFallback 
        ? ' Puedes usar email y contraseña como alternativa.'
        : '';

      return {
        success: false,
        method: 'google',
        error: this.getNetworkFriendlyError(error.message || 'Error de conexión con Google') + fallbackMessage,
      };
    }
  }

  /**
   * Automatic authentication - tries preferred method first, then fallback
   */
  async authenticateAuto(
    credentials: { email?: string; password?: string } = {},
    options: AuthenticationOptions = {}
  ): Promise<AuthenticationResult> {
    try {
      loggingService.logAuth('dual_auth_auto_attempt', { 
        hasEmail: !!credentials.email,
        hasPassword: !!credentials.password,
        preferredMethod: options.preferredMethod,
      });

      // Determine preferred method
      const preferredMethod = options.preferredMethod || 'email';
      const allowFallback = options.allowFallback !== false; // Default to true

      let primaryResult: AuthenticationResult;
      let fallbackResult: AuthenticationResult | null = null;

      // Try primary method
      if (preferredMethod === 'google') {
        primaryResult = await this.authenticateWithGoogle({ ...options, allowFallback: false });
        
        // Try email fallback if Google fails and we have credentials
        if (!primaryResult.success && allowFallback && credentials.email && credentials.password) {
          console.log('🔄 Google auth failed, trying email fallback...');
          fallbackResult = await this.authenticateWithEmail(credentials.email, credentials.password, options);
        }
      } else {
        // Email is preferred or default
        if (credentials.email && credentials.password) {
          primaryResult = await this.authenticateWithEmail(credentials.email, credentials.password, { ...options, allowFallback: false });
          
          // Try Google fallback if email fails
          if (!primaryResult.success && allowFallback) {
            console.log('🔄 Email auth failed, trying Google fallback...');
            fallbackResult = await this.authenticateWithGoogle({ ...options, allowFallback: false });
          }
        } else {
          // No email credentials, try Google
          primaryResult = await this.authenticateWithGoogle(options);
        }
      }

      // Return successful result (primary or fallback)
      const finalResult = fallbackResult?.success ? fallbackResult : primaryResult;
      
      loggingService.logAuth('dual_auth_auto_result', {
        success: finalResult.success,
        method: finalResult.method,
        usedFallback: !!fallbackResult?.success,
      });

      return finalResult;

    } catch (error: any) {
      console.error('Auto authentication error:', error);
      
      loggingService.logAuth('dual_auth_auto_exception', {
        errorMessage: error.message,
      });

      return {
        success: false,
        method: 'none',
        error: 'Error en autenticación automática: ' + (error.message || 'Error desconocido'),
      };
    }
  }

  /**
   * Register new user with email and password
   */
  async registerWithEmail(
    email: string,
    password: string,
    name: string,
    options: AuthenticationOptions = {}
  ): Promise<AuthenticationResult> {
    try {
      loggingService.logAuth('dual_auth_register_attempt', { email, name });

      // Check network connectivity
      if (!options.skipNetworkCheck && !networkService.isConnected()) {
        return {
          success: false,
          method: 'none',
          error: 'Sin conexión a internet. Verifica tu conexión e inténtalo de nuevo.',
        };
      }

      // Validate input
      if (!email || !password || !name) {
        return {
          success: false,
          method: 'email',
          error: 'Email, contraseña y nombre son requeridos',
        };
      }

      if (!this.isValidEmail(email)) {
        return {
          success: false,
          method: 'email',
          error: 'Formato de email inválido',
        };
      }

      if (!this.isValidPassword(password)) {
        return {
          success: false,
          method: 'email',
          error: 'La contraseña debe tener al menos 8 caracteres, incluir mayúsculas, minúsculas y números',
        };
      }

      // Attempt registration
      const registerResult = await cognitoAuthService.register(email, password, name);

      if (registerResult.success) {
        loggingService.logAuth('dual_auth_register_success', {
          email,
          name,
          userSub: registerResult.userSub,
        });

        return {
          success: true,
          method: 'email',
          requiresAction: 'email_verification',
        };
      }

      // Handle registration errors
      const errorResult = this.handleRegistrationError(registerResult.message || 'Error desconocido');
      
      loggingService.logAuth('dual_auth_register_error', {
        email,
        error: registerResult.message,
      });

      return errorResult;

    } catch (error: any) {
      console.error('Registration error:', error);
      
      loggingService.logAuth('dual_auth_register_exception', {
        email,
        errorMessage: error.message,
      });

      return {
        success: false,
        method: 'email',
        error: this.getNetworkFriendlyError(error.message || 'Error de conexión'),
      };
    }
  }

  /**
   * Sign out from all authentication methods
   */
  async signOutAll(): Promise<{ success: boolean; error?: string }> {
    try {
      loggingService.logAuth('dual_auth_signout_all', {});

      // Use session cleanup service for comprehensive sign out
      const cleanupResult = await sessionCleanupService.performSignOutCleanup({
        revokeTokens: true,
        clearSecureStorage: true,
        stopBackgroundServices: true,
        notifyComponents: true,
        forceCleanup: true,
      });

      if (cleanupResult.success) {
        loggingService.logAuth('dual_auth_signout_all_success', {
          completedSteps: cleanupResult.completedSteps,
        });
        
        return { success: true };
      } else {
        loggingService.logAuth('dual_auth_signout_all_partial', {
          errors: cleanupResult.errors,
          completedSteps: cleanupResult.completedSteps,
        });
        
        // Even with errors, consider it successful if force cleanup was used
        return { 
          success: true,
          error: cleanupResult.errors.length > 0 ? cleanupResult.errors.join('; ') : undefined,
        };
      }
      
    } catch (error: any) {
      console.error('Sign out all error:', error);
      
      loggingService.logAuth('dual_auth_signout_all_error', {
        errorMessage: error.message,
      });
      
      // Perform emergency cleanup
      try {
        await sessionCleanupService.emergencyCleanup();
        return { 
          success: true,
          error: 'Sign out completed with emergency cleanup',
        };
      } catch (emergencyError: any) {
        return {
          success: false,
          error: `Sign out failed: ${error.message}`,
        };
      }
    }
  }

  /**
   * Check current authentication status across all methods
   */
  async checkAuthenticationStatus(): Promise<AuthenticationResult> {
    try {
      // Check stored Cognito authentication
      const storedAuth = await cognitoAuthService.checkStoredAuth();
      
      if (storedAuth.isAuthenticated && storedAuth.user && storedAuth.tokens) {
        // Determine authentication method based on user attributes
        const method = this.determineAuthMethod(storedAuth.user);
        
        return {
          success: true,
          user: storedAuth.user,
          tokens: storedAuth.tokens,
          method,
        };
      }

      return {
        success: false,
        method: 'none',
      };

    } catch (error: any) {
      console.error('Check authentication status error:', error);
      
      return {
        success: false,
        method: 'none',
        error: 'Error verificando estado de autenticación',
      };
    }
  }

  /**
   * Get available authentication methods for current environment
   */
  async getAvailableAuthMethods(): Promise<{
    email: boolean;
    google: boolean;
    googleMessage?: string;
  }> {
    try {
      // Email authentication is always available
      const emailAvailable = true;
      
      // Check Google Sign-In availability
      const googleAvailability = await googleSignInService.getAvailabilityStatus();
      
      return {
        email: emailAvailable,
        google: googleAvailability.canSignIn,
        googleMessage: googleAvailability.message,
      };
      
    } catch (error) {
      console.error('Error checking available auth methods:', error);
      
      return {
        email: true,
        google: false,
        googleMessage: 'Error verificando disponibilidad de Google Sign-In',
      };
    }
  }

  // Private helper methods

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPassword(password: string): boolean {
    // At least 8 characters, one uppercase, one lowercase, one digit
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return passwordRegex.test(password);
  }

  private handleEmailAuthError(error: string): AuthenticationResult {
    if (error.includes('incorrectos') || error.includes('NotAuthorizedException')) {
      return {
        success: false,
        method: 'email',
        error: 'Email o contraseña incorrectos',
      };
    }
    
    if (error.includes('no confirmado') || error.includes('UserNotConfirmedException')) {
      return {
        success: false,
        method: 'email',
        error: 'Cuenta no verificada. Revisa tu email.',
        requiresAction: 'email_verification',
      };
    }
    
    if (error.includes('no encontrado') || error.includes('UserNotFoundException')) {
      return {
        success: false,
        method: 'email',
        error: 'Usuario no encontrado. ¿Necesitas crear una cuenta?',
      };
    }
    
    if (error.includes('demasiados intentos') || error.includes('TooManyRequestsException')) {
      return {
        success: false,
        method: 'email',
        error: 'Demasiados intentos. Intenta más tarde.',
      };
    }

    return {
      success: false,
      method: 'email',
      error: error || 'Error al iniciar sesión',
    };
  }

  private handleGoogleAuthError(error: string, allowFallback?: boolean): AuthenticationResult {
    const fallbackMessage = allowFallback ? ' Puedes usar email y contraseña.' : '';
    
    if (error.includes('cancelado') || error.includes('cancelled')) {
      return {
        success: false,
        method: 'google',
        error: 'Inicio de sesión cancelado' + fallbackMessage,
      };
    }
    
    if (error.includes('no está disponible') || error.includes('not available')) {
      return {
        success: false,
        method: 'google',
        error: 'Google Sign-In no está disponible en este entorno' + fallbackMessage,
      };
    }
    
    if (error.includes('configurado') || error.includes('configuration')) {
      return {
        success: false,
        method: 'google',
        error: 'Google Sign-In no está configurado correctamente' + fallbackMessage,
      };
    }

    return {
      success: false,
      method: 'google',
      error: error + fallbackMessage,
    };
  }

  private handleRegistrationError(error: string): AuthenticationResult {
    if (error.includes('ya está registrado') || error.includes('UsernameExistsException')) {
      return {
        success: false,
        method: 'email',
        error: 'Este email ya está registrado. ¿Quieres iniciar sesión?',
      };
    }
    
    if (error.includes('contraseña') || error.includes('InvalidPasswordException')) {
      return {
        success: false,
        method: 'email',
        error: 'La contraseña debe tener al menos 8 caracteres, incluir mayúsculas, minúsculas y números',
      };
    }
    
    if (error.includes('inválidos') || error.includes('InvalidParameterException')) {
      return {
        success: false,
        method: 'email',
        error: 'Email o datos inválidos',
      };
    }

    return {
      success: false,
      method: 'email',
      error: error || 'Error al registrarse',
    };
  }

  private getNetworkFriendlyError(error: string): string {
    if (error.includes('network') || error.includes('timeout') || error.includes('fetch')) {
      return 'Error de conexión. Verifica tu internet e inténtalo de nuevo.';
    }
    
    if (error.includes('DNS') || error.includes('resolve')) {
      return 'Error de conectividad. Verifica tu conexión a internet.';
    }
    
    return error;
  }

  private determineAuthMethod(user: CognitoUser): 'email' | 'google' {
    // Simple heuristic: if user has a picture URL, likely from Google
    // In a real implementation, you'd store the auth method in user attributes
    if (user.picture && user.picture.includes('googleusercontent.com')) {
      return 'google';
    }
    
    return 'email';
  }
}

export const dualAuthFlowService = new DualAuthFlowService();
export type { AuthenticationResult, AuthenticationOptions };