/**
 * Google Authentication Service
 * Handles Google Sign-In integration with AWS Cognito
 * Uses simplified Google Sign-In for better APK compatibility
 */

import { getAWSConfig } from '../config/aws-config';
import { loggingService } from './loggingService';
import { simpleGoogleSignInService, SimpleGoogleUser } from './simpleGoogleSignIn';
import { environmentDetectionService } from './environmentDetectionService';

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  givenName?: string;
  familyName?: string;
  photo?: string;
}

export interface GoogleAuthResult {
  user: GoogleUser;
  idToken: string;
  accessToken: string;
}

class GoogleAuthService {
  private config = getAWSConfig();

  constructor() {
    loggingService.info('GoogleAuthService', 'Google Auth service initialized');
  }

  /**
   * Check if user is already signed in to Google
   */
  async isSignedIn(): Promise<boolean> {
    try {
      return await simpleGoogleSignInService.isSignedIn();
    } catch (error) {
      console.error('Error checking Google sign-in status:', error);
      return false;
    }
  }

  /**
   * Get current Google user if signed in
   */
  async getCurrentUser(): Promise<GoogleUser | null> {
    try {
      const user = await simpleGoogleSignInService.getCurrentUser();
      if (!user) return null;

      return this.mapSimpleUserToGoogleUser(user);
    } catch (error) {
      console.error('Error getting current Google user:', error);
      loggingService.error('GoogleAuthService', 'Failed to get current user', { error });
      return null;
    }
  }

  /**
   * Sign in with Google
   */
  async signIn(): Promise<{ success: boolean; data?: GoogleAuthResult; error?: string }> {
    try {
      loggingService.logAuth('google_signin_attempt', {});

      // Check environment first
      const env = environmentDetectionService.detectEnvironment();
      console.log('🔍 Google Sign-In environment:', env.runtime);

      // Use simplified Google Sign-In service
      const result = await simpleGoogleSignInService.signIn();
      
      if (!result.success) {
        console.log('❌ Google Sign-In failed:', result.error);
        
        // Show user-friendly error if needed
        if (result.error && !result.canRetry) {
          simpleGoogleSignInService.showErrorMessage(result.error);
        }
        
        return {
          success: false,
          error: result.error || 'Error durante Google Sign-In',
        };
      }

      if (!result.user) {
        throw new Error('No user data received from Google');
      }

      const authResult: GoogleAuthResult = {
        user: this.mapSimpleUserToGoogleUser(result.user),
        idToken: result.user.idToken,
        accessToken: result.user.accessToken || '',
      };

      loggingService.logAuth('google_signin_success', {
        userId: result.user.id,
        email: result.user.email,
      });

      return {
        success: true,
        data: authResult,
      };

    } catch (error: any) {
      console.error('Google Sign-In error:', error);
      
      loggingService.logAuth('google_signin_error', {
        errorMessage: error.message,
      });

      let errorMessage = 'Error al iniciar sesión con Google';

      if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Sign out from Google
   */
  async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      await simpleGoogleSignInService.signOut();
      
      loggingService.logAuth('google_signout', { success: true });
      
      return { success: true };
    } catch (error: any) {
      console.error('Google Sign-Out error:', error);
      
      loggingService.logAuth('google_signout_error', {
        errorMessage: error.message,
      });
      
      return {
        success: false,
        error: error.message || 'Error al cerrar sesión de Google',
      };
    }
  }

  /**
   * Revoke Google access (complete sign out)
   */
  async revokeAccess(): Promise<{ success: boolean; error?: string }> {
    try {
      // For simplified service, just sign out
      await simpleGoogleSignInService.signOut();
      
      loggingService.logAuth('google_revoke_access', { success: true });
      
      return { success: true };
    } catch (error: any) {
      console.error('Google revoke access error:', error);
      
      loggingService.logAuth('google_revoke_access_error', {
        errorMessage: error.message,
      });
      
      return {
        success: false,
        error: error.message || 'Error al revocar acceso de Google',
      };
    }
  }

  /**
   * Map SimpleGoogleUser to GoogleUser interface
   */
  private mapSimpleUserToGoogleUser(simpleUser: SimpleGoogleUser): GoogleUser {
    const nameParts = simpleUser.name.split(' ');
    
    return {
      id: simpleUser.id,
      email: simpleUser.email,
      name: simpleUser.name,
      givenName: nameParts[0] || simpleUser.name,
      familyName: nameParts.slice(1).join(' ') || undefined,
      photo: simpleUser.photo,
    };
  }

  /**
   * Check if Google Sign-In is available
   */
  async isAvailable(): Promise<boolean> {
    return await simpleGoogleSignInService.isAvailable();
  }

  /**
   * Get environment-specific status message
   */
  getStatusMessage(): string {
    return simpleGoogleSignInService.getStatusMessage();
  }

  /**
   * Get detailed diagnostics for debugging
   */
  async getDiagnostics(): Promise<any> {
    const env = environmentDetectionService.detectEnvironment();
    const available = await this.isAvailable();
    const statusMessage = this.getStatusMessage();
    
    return {
      environment: env,
      available,
      statusMessage,
      currentUser: await this.getCurrentUser(),
      isSignedIn: await this.isSignedIn(),
    };
  }
}

export const googleAuthService = new GoogleAuthService();
export type { GoogleUser, GoogleAuthResult };