/**
 * Unified Authentication Service
 * Handles both email/password and Google federated sign-in with AWS Cognito
 */

import { Auth } from 'aws-amplify';
import { awsCognitoGoogleService } from './awsCognitoGoogleService';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  provider: 'cognito' | 'google';
  attributes: any;
}

export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
  canRetry?: boolean;
}

class AuthService {
  /**
   * Sign in with email and password (Cognito native)
   */
  async signInWithEmail(email: string, password: string): Promise<AuthResult> {
    try {
      console.log('🔐 Signing in with email/password...');
      
      const cognitoUser = await Auth.signIn(email, password);
      
      console.log('✅ Email sign-in successful');
      
      return {
        success: true,
        user: {
          userId: cognitoUser.attributes?.sub || cognitoUser.username,
          email: cognitoUser.attributes?.email || email,
          name: cognitoUser.attributes?.name || email,
          provider: 'cognito',
          attributes: cognitoUser.attributes,
        },
      };
      
    } catch (error: any) {
      console.error('❌ Email sign-in error:', error);
      
      let errorMessage = 'Error de inicio de sesión';
      
      switch (error.code) {
        case 'UserNotConfirmedException':
          errorMessage = 'Usuario no confirmado. Revisa tu email.';
          break;
        case 'NotAuthorizedException':
          errorMessage = 'Email o contraseña incorrectos.';
          break;
        case 'UserNotFoundException':
          errorMessage = 'Usuario no encontrado.';
          break;
        case 'TooManyRequestsException':
          errorMessage = 'Demasiados intentos. Intenta más tarde.';
          break;
        default:
          errorMessage = error.message || 'Error desconocido';
      }
      
      return {
        success: false,
        error: errorMessage,
        canRetry: error.code !== 'UserNotFoundException',
      };
    }
  }

  /**
   * Sign in with Google (federated to Cognito)
   */
  async signInWithGoogle(): Promise<AuthResult> {
    try {
      console.log('🔐 Starting Google federated sign-in...');
      
      const result = await awsCognitoGoogleService.signInWithGoogle();
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          canRetry: result.canRetry,
        };
      }
      
      return {
        success: true,
        user: {
          userId: result.user!.userId,
          email: result.user!.email,
          name: result.user!.name,
          picture: result.user!.picture,
          provider: 'google',
          attributes: result.user!.attributes,
        },
      };
      
    } catch (error: any) {
      console.error('❌ Google federated sign-in error:', error);
      return {
        success: false,
        error: error.message || 'Error en Google Sign-In',
        canRetry: true,
      };
    }
  }

  /**
   * Sign up with email and password
   */
  async signUp(email: string, password: string, name: string): Promise<AuthResult> {
    try {
      console.log('📝 Signing up with email/password...');
      
      const result = await Auth.signUp({
        username: email,
        password: password,
        attributes: {
          email: email,
          name: name,
        },
      });
      
      console.log('✅ Sign-up successful');
      
      return {
        success: true,
        user: {
          userId: result.userSub,
          email: email,
          name: name,
          provider: 'cognito',
          attributes: { email, name },
        },
      };
      
    } catch (error: any) {
      console.error('❌ Sign-up error:', error);
      
      let errorMessage = 'Error de registro';
      
      switch (error.code) {
        case 'UsernameExistsException':
          errorMessage = 'Este email ya está registrado.';
          break;
        case 'InvalidPasswordException':
          errorMessage = 'La contraseña no cumple los requisitos.';
          break;
        case 'InvalidParameterException':
          errorMessage = 'Email inválido.';
          break;
        default:
          errorMessage = error.message || 'Error desconocido';
      }
      
      return {
        success: false,
        error: errorMessage,
        canRetry: true,
      };
    }
  }

  /**
   * Confirm sign up with verification code
   */
  async confirmSignUp(email: string, code: string): Promise<AuthResult> {
    try {
      console.log('✅ Confirming sign-up...');
      
      await Auth.confirmSignUp(email, code);
      
      console.log('✅ Sign-up confirmed');
      
      return {
        success: true,
      };
      
    } catch (error: any) {
      console.error('❌ Confirm sign-up error:', error);
      
      let errorMessage = 'Error de confirmación';
      
      switch (error.code) {
        case 'CodeMismatchException':
          errorMessage = 'Código de verificación incorrecto.';
          break;
        case 'ExpiredCodeException':
          errorMessage = 'Código de verificación expirado.';
          break;
        case 'NotAuthorizedException':
          errorMessage = 'Usuario ya confirmado.';
          break;
        default:
          errorMessage = error.message || 'Error desconocido';
      }
      
      return {
        success: false,
        error: errorMessage,
        canRetry: error.code !== 'NotAuthorizedException',
      };
    }
  }

  /**
   * Sign out from all providers
   */
  async signOut(): Promise<void> {
    try {
      console.log('🚪 Signing out...');
      
      // This will sign out from both Cognito and Google
      await awsCognitoGoogleService.signOut();
      
      console.log('✅ Sign-out successful');
      
    } catch (error) {
      console.error('❌ Sign-out error:', error);
      // Don't throw - sign out should always succeed locally
    }
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      // Try AWS Cognito first (works for both email and Google users)
      const cognitoUser = await Auth.currentAuthenticatedUser();
      
      if (!cognitoUser) {
        return null;
      }

      // Determine provider based on identity provider
      const identityProvider = cognitoUser.attributes?.identities 
        ? JSON.parse(cognitoUser.attributes.identities)[0]?.providerName 
        : 'Cognito';
      
      const provider = identityProvider === 'Google' ? 'google' : 'cognito';
      
      return {
        userId: cognitoUser.attributes?.sub || cognitoUser.username,
        email: cognitoUser.attributes?.email,
        name: cognitoUser.attributes?.name || cognitoUser.attributes?.email,
        picture: cognitoUser.attributes?.picture,
        provider: provider,
        attributes: cognitoUser.attributes,
      };
      
    } catch (error) {
      console.error('❌ Error getting current user:', error);
      return null;
    }
  }

  /**
   * Check if user is signed in
   */
  async isSignedIn(): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      return user !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Resend confirmation code
   */
  async resendConfirmationCode(email: string): Promise<AuthResult> {
    try {
      await Auth.resendSignUp(email);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error reenviando código',
        canRetry: true,
      };
    }
  }

  /**
   * Forgot password
   */
  async forgotPassword(email: string): Promise<AuthResult> {
    try {
      await Auth.forgotPassword(email);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error enviando código de recuperación',
        canRetry: true,
      };
    }
  }

  /**
   * Confirm forgot password
   */
  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<AuthResult> {
    try {
      await Auth.forgotPasswordSubmit(email, code, newPassword);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error cambiando contraseña',
        canRetry: true,
      };
    }
  }
}

// Export singleton instance
export const authService = new AuthService();