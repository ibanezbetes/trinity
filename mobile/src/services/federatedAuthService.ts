/**
 * Federated Authentication Service
 * Integrates Google Sign-In with AWS Cognito User Pool
 */

import { getAWSConfig } from '../config/aws-config';
import { googleAuthService, GoogleAuthResult } from './googleAuthService';
import { cognitoAuthService, CognitoUser, CognitoTokens } from './cognitoAuthService';
import { loggingService } from './loggingService';
import { CognitoIdentityCredentials } from 'amazon-cognito-identity-js';

export interface FederatedAuthResult {
  user: CognitoUser;
  tokens: CognitoTokens;
  provider: 'google' | 'cognito';
}

class FederatedAuthService {
  private config = getAWSConfig();

  constructor() {
    loggingService.info('FederatedAuthService', 'Service initialized', {
      region: this.config.region,
      userPoolId: this.config.userPoolId,
      identityPoolId: this.config.identityPoolId,
    });
  }

  /**
   * Sign in with Google and authenticate with Cognito
   */
  async signInWithGoogle(): Promise<{ success: boolean; data?: FederatedAuthResult; error?: string }> {
    try {
      console.log('🔍 FederatedAuthService.signInWithGoogle - Starting...');
      
      // CRITICAL: Verify base64 functions are available
      const hasBtoa = typeof global.btoa === 'function';
      const hasAtob = typeof global.atob === 'function';
      
      console.log('🔍 FederatedAuthService - Base64 availability:', { hasBtoa, hasAtob });
      
      if (!hasBtoa || !hasAtob) {
        console.error('❌ FederatedAuthService - Base64 functions not available!');
        return {
          success: false,
          error: 'Error de configuración de Google. Contacta al soporte técnico o usa email y contraseña.',
        };
      }
      
      loggingService.logAuth('federated_google_signin_attempt', {});

      // Check if Google Sign-In is available in current environment
      const googleSignInService = await import('./googleSignInService');
      const availability = await googleSignInService.googleSignInService.getAvailabilityStatus();
      
      if (!availability.canSignIn) {
        console.log('❌ Google Sign-In not available:', availability.message);
        
        // Provide user-friendly error message for APK builds
        const userFriendlyMessage = availability.message.includes('configuración') || 
                                   availability.message.includes('configuration') ?
          'Error de configuración de Google. Contacta al soporte técnico o usa email y contraseña.' :
          'Google Sign-In no está disponible. Usa email y contraseña.';
        
        return {
          success: false,
          error: userFriendlyMessage,
        };
      }

      // Step 1: Sign in with Google
      const googleResult = await googleAuthService.signIn();
      
      if (!googleResult.success || !googleResult.data) {
        return {
          success: false,
          error: googleResult.error || 'Failed to sign in with Google',
        };
      }

      const { user: googleUser, idToken } = googleResult.data;

      // Step 2: Use Cognito Hosted UI for federated authentication
      // Since we can't directly exchange Google tokens with User Pool without Amplify,
      // we'll use the hosted UI approach or implement a custom Lambda function
      
      // For now, we'll create a user in Cognito with Google info if they don't exist
      // This is a simplified approach - in production, you'd want proper federated auth
      
      const cognitoResult = await this.createOrAuthenticateUserWithGoogleInfo(googleUser, idToken);
      
      if (!cognitoResult.success) {
        return {
          success: false,
          error: cognitoResult.error || 'Failed to authenticate with Cognito',
        };
      }

      loggingService.logAuth('federated_google_signin_success', {
        userId: cognitoResult.data!.user.sub,
        email: cognitoResult.data!.user.email,
        provider: 'google',
      });

      return {
        success: true,
        data: {
          ...cognitoResult.data!,
          provider: 'google',
        },
      };

    } catch (error: any) {
      console.error('Federated Google Sign-In error:', error);
      
      // Check if this is the "undefined is not a function" error
      if (error.message && error.message.includes('undefined')) {
        console.error('❌ Detected "undefined is not a function" error - likely base64 issue');
        return {
          success: false,
          error: 'Error de configuración de Google. Contacta al soporte técnico o usa email y contraseña.',
        };
      }
      
      loggingService.logAuth('federated_google_signin_error', {
        errorMessage: error.message,
      });

      return {
        success: false,
        error: error.message || 'Error en autenticación federada con Google',
      };
    }
  }

  /**
   * Create or authenticate user with Google information
   * This is a simplified approach - in production, use proper federated auth
   */
  private async createOrAuthenticateUserWithGoogleInfo(
    googleUser: any,
    googleIdToken: string
  ): Promise<{ success: boolean; data?: { user: CognitoUser; tokens: CognitoTokens }; error?: string }> {
    
    const googleEmail = googleUser.email;
    const tempPassword = this.generateTempPassword(googleEmail);
    
    try {
      // First, try to sign in (user might already exist)
      console.log('🔍 Attempting to login existing Google user:', googleEmail);
      const loginResult = await cognitoAuthService.login(googleEmail, tempPassword);
      
      if (loginResult.success && loginResult.data) {
        console.log('✅ Google user logged in successfully');
        return {
          success: true,
          data: loginResult.data,
        };
      }

      console.log('🔍 Login failed, attempting to register new Google user...');
      
      // If login failed, try to register the user
      const registerResult = await cognitoAuthService.register(
        googleEmail,
        tempPassword,
        googleUser.name || googleUser.givenName || 'Google User'
      );

      if (registerResult.success) {
        console.log('✅ Google user registered successfully, attempting login...');
        
        // Wait a moment for registration to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Now try to login with the newly created user
        const newLoginResult = await cognitoAuthService.login(googleEmail, tempPassword);
        
        if (newLoginResult.success && newLoginResult.data) {
          console.log('✅ New Google user logged in successfully');
          return {
            success: true,
            data: newLoginResult.data,
          };
        }
        
        console.log('❌ Failed to login after registration, trying again...');
        
        // Try one more time after a longer wait
        await new Promise(resolve => setTimeout(resolve, 2000));
        const retryLoginResult = await cognitoAuthService.login(googleEmail, tempPassword);
        
        if (retryLoginResult.success && retryLoginResult.data) {
          console.log('✅ Google user logged in successfully on retry');
          return {
            success: true,
            data: retryLoginResult.data,
          };
        }
        
        return {
          success: false,
          error: 'Usuario registrado pero no se pudo iniciar sesión automáticamente. Intenta de nuevo.',
        };
      }

      // Registration failed - user might exist with different auth method
      console.log('❌ Registration failed:', registerResult.message);
      
      // Check if user exists but was created with email/password
      if (registerResult.message && 
          (registerResult.message.includes('ya está registrado') || 
           registerResult.message.includes('UsernameExistsException'))) {
        
        console.log('🔍 User exists with different auth method, attempting password reset approach...');
        
        // Try a different approach: attempt to reset password for this user
        // This is a workaround for the federated auth limitation
        try {
          // First, try to initiate forgot password to see if user exists
          const forgotResult = await cognitoAuthService.forgotPassword(googleEmail);
          
          if (forgotResult.success) {
            // User exists but with different password - they need to use original method
            return {
              success: false,
              error: 'Esta cuenta ya existe con email y contraseña. Por favor, inicia sesión con tu email y contraseña original, o usa "¿Olvidaste tu contraseña?" si no la recuerdas.',
            };
          }
        } catch (forgotError) {
          console.log('Forgot password check failed:', forgotError);
        }
        
        return {
          success: false,
          error: 'Esta cuenta ya existe. Por favor, usa el método de autenticación original.',
        };
      }

      return {
        success: false,
        error: registerResult.message || 'Error al registrar usuario con Google',
      };

    } catch (error: any) {
      console.error('Error creating/authenticating Google user:', error);
      return {
        success: false,
        error: error.message || 'Error en autenticación con información de Google',
      };
    }
  }

  /**
   * Generate a deterministic password for Google users based on their email
   * This ensures the same password is used for the same Google user
   */
  private generateTempPassword(email: string): string {
    // Create a deterministic password based on email
    // This is a simplified approach - in production, use proper federated auth
    
    // Use a hash of the email to create a consistent password
    const CryptoJS = require('react-native-crypto-js');
    const hash = CryptoJS.SHA256(email + 'GOOGLE_AUTH_SALT').toString();
    
    // Create password that meets Cognito requirements: 8+ chars, upper, lower, digit
    let password = 'G' + hash.substring(0, 6) + '1a';
    
    return password;
  }

  /**
   * Sign out from both Google and Cognito
   */
  async signOut(accessToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Sign out from Google
      await googleAuthService.signOut();
      
      // Sign out from Cognito if we have an access token
      if (accessToken) {
        await cognitoAuthService.signOut(accessToken);
      }
      
      // Clear stored tokens
      await cognitoAuthService.clearTokens();
      
      loggingService.logAuth('federated_signout', { success: true });
      
      return { success: true };
      
    } catch (error: any) {
      console.error('Federated sign out error:', error);
      
      loggingService.logAuth('federated_signout_error', {
        errorMessage: error.message,
      });
      
      return {
        success: false,
        error: error.message || 'Error al cerrar sesión',
      };
    }
  }

  /**
   * Check if user is signed in with Google
   */
  async isGoogleSignedIn(): Promise<boolean> {
    return await googleAuthService.isSignedIn();
  }

  /**
   * Get current Google user if signed in
   */
  async getCurrentGoogleUser() {
    return await googleAuthService.getCurrentUser();
  }
}

export const federatedAuthService = new FederatedAuthService();
export type { FederatedAuthResult };