/**
 * AWS Cognito Google Federated Authentication Service
 * Maneja Google Sign-In con AWS Cognito como backend
 */

import { Auth } from 'aws-amplify';
import { CognitoHostedUIIdentityProvider } from '@aws-amplify/auth';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Import Google Sign-In conditionally
let GoogleSignin: any = null;
let statusCodes: any = null;

try {
  const googleSignInModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = googleSignInModule.GoogleSignin;
  statusCodes = googleSignInModule.statusCodes;
  console.log('✅ Google Sign-In SDK loaded for AWS Cognito federation');
} catch (error) {
  console.warn('⚠️ Google Sign-In SDK not available:', error);
}

export interface CognitoGoogleUser {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  attributes: any;
  signInUserSession: any;
}

export interface CognitoGoogleSignInResult {
  success: boolean;
  user?: CognitoGoogleUser;
  error?: string;
  canRetry?: boolean;
}

class AWSCognitoGoogleService {
  private isConfigured = false;

  /**
   * Configure Google Sign-In for AWS Cognito federation
   */
  async configure(): Promise<boolean> {
    if (this.isConfigured) {
      return true;
    }

    try {
      if (!GoogleSignin) {
        console.log('❌ Google Sign-In SDK not available');
        return false;
      }

      const config = Constants.expoConfig?.extra;
      const webClientId = config?.googleWebClientId;

      if (!webClientId) {
        console.log('❌ Google Web Client ID not configured');
        return false;
      }

      console.log('🔧 Configuring Google Sign-In for AWS Cognito...');
      console.log('- Web Client ID:', webClientId);

      GoogleSignin.configure({
        webClientId: webClientId,
        offlineAccess: true,
        forceCodeForRefreshToken: true,
      });

      this.isConfigured = true;
      console.log('✅ Google Sign-In configured for AWS Cognito federation');
      return true;

    } catch (error) {
      console.error('❌ Error configuring Google Sign-In for Cognito:', error);
      return false;
    }
  }

  /**
   * Sign in with Google and federate to AWS Cognito
   */
  async signInWithGoogle(): Promise<CognitoGoogleSignInResult> {
    try {
      console.log('🔍 Starting Google federated sign-in to AWS Cognito...');

      // Configure if needed
      const configured = await this.configure();
      if (!configured) {
        return {
          success: false,
          error: 'No se pudo configurar Google Sign-In',
          canRetry: false,
        };
      }

      // Check Play Services (Android only)
      if (Platform.OS === 'android') {
        try {
          await GoogleSignin.hasPlayServices();
          console.log('✅ Google Play Services available');
        } catch (playServicesError: any) {
          console.error('❌ Google Play Services error:', playServicesError);
          return {
            success: false,
            error: 'Google Play Services no está disponible',
            canRetry: true,
          };
        }
      }

      // Step 1: Get Google ID Token
      console.log('🔐 Step 1: Getting Google ID Token...');
      let googleUser;
      try {
        googleUser = await GoogleSignin.signIn();
        console.log('✅ Google Sign-In successful');
      } catch (googleError: any) {
        console.error('❌ Google Sign-In error:', googleError);
        
        if (googleError.message && googleError.message.includes('DEVELOPER_ERROR')) {
          return {
            success: false,
            error: 'DEVELOPER_ERROR: Configuración de Google incorrecta. Revisa SHA-1 fingerprint.',
            canRetry: false,
          };
        }

        if (statusCodes && googleError.code === statusCodes.SIGN_IN_CANCELLED) {
          return {
            success: false,
            error: 'Inicio de sesión cancelado',
            canRetry: true,
          };
        }

        return {
          success: false,
          error: googleError.message || 'Error en Google Sign-In',
          canRetry: true,
        };
      }

      if (!googleUser?.data?.idToken) {
        throw new Error('No se pudo obtener ID Token de Google');
      }

      const googleIdToken = googleUser.data.idToken;
      console.log('✅ Google ID Token obtained');

      // Step 2: Federate to AWS Cognito
      console.log('🔐 Step 2: Federating to AWS Cognito...');
      
      try {
        // Use AWS Amplify Auth.federatedSignIn with Google token
        const cognitoUser = await Auth.federatedSignIn(
          'google',
          { token: googleIdToken },
          googleUser.data.user
        );

        console.log('✅ AWS Cognito federated sign-in successful');
        console.log('- Cognito User ID:', cognitoUser.attributes?.sub);
        console.log('- Email:', cognitoUser.attributes?.email);

        return {
          success: true,
          user: {
            userId: cognitoUser.attributes?.sub || cognitoUser.username,
            email: cognitoUser.attributes?.email,
            name: cognitoUser.attributes?.name || cognitoUser.attributes?.email,
            picture: cognitoUser.attributes?.picture,
            attributes: cognitoUser.attributes,
            signInUserSession: cognitoUser.signInUserSession,
          },
        };

      } catch (cognitoError: any) {
        console.error('❌ AWS Cognito federation error:', cognitoError);
        
        // Handle specific Cognito errors
        if (cognitoError.code === 'UserNotConfirmedException') {
          return {
            success: false,
            error: 'Usuario no confirmado en Cognito',
            canRetry: false,
          };
        }

        if (cognitoError.code === 'NotAuthorizedException') {
          return {
            success: false,
            error: 'No autorizado para federated sign-in',
            canRetry: false,
          };
        }

        return {
          success: false,
          error: `Error de Cognito: ${cognitoError.message}`,
          canRetry: true,
        };
      }

    } catch (error: any) {
      console.error('❌ Federated sign-in error:', error);
      return {
        success: false,
        error: error.message || 'Error desconocido en federated sign-in',
        canRetry: true,
      };
    }
  }

  /**
   * Alternative: Use Cognito Hosted UI for Google Sign-In
   */
  async signInWithCognitoHostedUI(): Promise<CognitoGoogleSignInResult> {
    try {
      console.log('🔍 Starting Cognito Hosted UI Google Sign-In...');

      const cognitoUser = await Auth.federatedSignIn({
        provider: CognitoHostedUIIdentityProvider.Google,
      });

      console.log('✅ Cognito Hosted UI sign-in successful');

      return {
        success: true,
        user: {
          userId: cognitoUser.attributes?.sub || cognitoUser.username,
          email: cognitoUser.attributes?.email,
          name: cognitoUser.attributes?.name || cognitoUser.attributes?.email,
          picture: cognitoUser.attributes?.picture,
          attributes: cognitoUser.attributes,
          signInUserSession: cognitoUser.signInUserSession,
        },
      };

    } catch (error: any) {
      console.error('❌ Cognito Hosted UI error:', error);
      return {
        success: false,
        error: error.message || 'Error en Cognito Hosted UI',
        canRetry: true,
      };
    }
  }

  /**
   * Sign out from both Google and AWS Cognito
   */
  async signOut(): Promise<void> {
    try {
      // Sign out from AWS Cognito
      await Auth.signOut();
      console.log('✅ AWS Cognito sign-out successful');

      // Sign out from Google
      if (GoogleSignin && this.isConfigured) {
        await GoogleSignin.signOut();
        console.log('✅ Google sign-out successful');
      }

    } catch (error) {
      console.error('❌ Sign-out error:', error);
      // Don't throw - sign out should always succeed locally
    }
  }

  /**
   * Get current AWS Cognito user
   */
  async getCurrentUser(): Promise<CognitoGoogleUser | null> {
    try {
      const cognitoUser = await Auth.currentAuthenticatedUser();
      
      if (!cognitoUser) {
        return null;
      }

      return {
        userId: cognitoUser.attributes?.sub || cognitoUser.username,
        email: cognitoUser.attributes?.email,
        name: cognitoUser.attributes?.name || cognitoUser.attributes?.email,
        picture: cognitoUser.attributes?.picture,
        attributes: cognitoUser.attributes,
        signInUserSession: cognitoUser.signInUserSession,
      };

    } catch (error) {
      console.error('❌ Error getting current Cognito user:', error);
      return null;
    }
  }

  /**
   * Check if user is signed in to AWS Cognito
   */
  async isSignedIn(): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      return user !== null;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const awsCognitoGoogleService = new AWSCognitoGoogleService();