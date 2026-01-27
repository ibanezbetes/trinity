import { Platform } from 'react-native';
import {
  AuthResult,
  AuthenticationStrategy,
  GoogleSignInConfig,
  GoogleSignInError,
  GoogleUser,
} from '../../types/googleSignIn';

export class NativeGoogleSignIn implements AuthenticationStrategy {
  name = 'Native Google Sign-In';
  private config: GoogleSignInConfig;
  private GoogleSignin: any = null;

  constructor(config: GoogleSignInConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Try to import the Google Sign-In module
      const GoogleSignInModule = await import('@react-native-google-signin/google-signin');
      this.GoogleSignin = GoogleSignInModule.GoogleSignin;
      
      if (!this.GoogleSignin) {
        return false;
      }

      // Check if Play Services are available (Android only)
      if (Platform.OS === 'android') {
        try {
          await this.GoogleSignin.hasPlayServices();
        } catch (error) {
          console.log('❌ Play Services not available:', error);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.log('❌ Native Google Sign-In not available:', error);
      return false;
    }
  }

  async configure(): Promise<void> {
    if (!this.GoogleSignin) {
      throw new Error('Google Sign-In module not loaded');
    }

    try {
      const configOptions: any = {
        scopes: this.config.scopes,
        offlineAccess: this.config.offlineAccess,
      };

      // Add platform-specific client IDs
      if (Platform.OS === 'ios' && this.config.iosClientId) {
        configOptions.iosClientId = this.config.iosClientId;
      }
      
      if (Platform.OS === 'android' && this.config.androidClientId) {
        configOptions.androidClientId = this.config.androidClientId;
      }

      // Web client ID is required for server-side verification
      if (this.config.webClientId) {
        configOptions.webClientId = this.config.webClientId;
      }

      // Optional configurations
      if (this.config.hostedDomain) {
        configOptions.hostedDomain = this.config.hostedDomain;
      }

      if (this.config.forceCodeForRefreshToken) {
        configOptions.forceCodeForRefreshToken = this.config.forceCodeForRefreshToken;
      }

      await this.GoogleSignin.configure(configOptions);
      console.log('✅ Native Google Sign-In configured successfully');
      
    } catch (error) {
      console.error('❌ Failed to configure Native Google Sign-In:', error);
      throw error;
    }
  }

  async signIn(): Promise<AuthResult> {
    if (!this.GoogleSignin) {
      return {
        success: false,
        error: 'Google Sign-In no está disponible',
        errorCode: GoogleSignInError.CONFIGURATION_ERROR,
      };
    }

    try {
      // Check if user is already signed in
      const isSignedIn = await this.GoogleSignin.isSignedIn();
      if (isSignedIn) {
        console.log('ℹ️  User already signed in, getting current user');
        const userInfo = await this.GoogleSignin.signInSilently();
        return this.formatAuthResult(userInfo, true);
      }

      // Perform sign in
      console.log('🔐 Starting Google Sign-In flow...');
      const userInfo = await this.GoogleSignin.signIn();
      
      return this.formatAuthResult(userInfo, true);
      
    } catch (error: any) {
      console.error('❌ Native Google Sign-In error:', error);
      
      // Handle specific error codes
      let errorCode = GoogleSignInError.UNKNOWN_ERROR;
      let errorMessage = 'Error desconocido durante Google Sign-In';

      if (error.code) {
        switch (error.code) {
          case 'SIGN_IN_CANCELLED':
            errorCode = GoogleSignInError.SIGN_IN_CANCELLED;
            errorMessage = 'Inicio de sesión cancelado por el usuario';
            break;
          case 'SIGN_IN_REQUIRED':
            errorCode = GoogleSignInError.SIGN_IN_REQUIRED;
            errorMessage = 'Se requiere iniciar sesión';
            break;
          case 'NETWORK_ERROR':
            errorCode = GoogleSignInError.NETWORK_ERROR;
            errorMessage = 'Error de conexión de red';
            break;
          case 'PLAY_SERVICES_NOT_AVAILABLE':
            errorCode = GoogleSignInError.PLAY_SERVICES_NOT_AVAILABLE;
            errorMessage = 'Google Play Services no disponible';
            break;
          default:
            errorMessage = error.message || errorMessage;
        }
      }

      return {
        success: false,
        error: errorMessage,
        errorCode,
      };
    }
  }

  async signOut(): Promise<void> {
    if (!this.GoogleSignin) {
      throw new Error('Google Sign-In no está disponible');
    }

    try {
      await this.GoogleSignin.signOut();
      console.log('✅ Native Google Sign-Out successful');
    } catch (error) {
      console.error('❌ Native Google Sign-Out error:', error);
      throw error;
    }
  }

  async getCurrentUser(): Promise<GoogleUser | null> {
    if (!this.GoogleSignin) {
      return null;
    }

    try {
      const isSignedIn = await this.GoogleSignin.isSignedIn();
      if (!isSignedIn) {
        return null;
      }

      const userInfo = await this.GoogleSignin.getCurrentUser();
      return this.formatGoogleUser(userInfo);
      
    } catch (error) {
      console.error('❌ Error getting current user:', error);
      return null;
    }
  }

  private formatAuthResult(userInfo: any, success: boolean): AuthResult {
    if (!success || !userInfo) {
      return {
        success: false,
        error: 'No se pudo obtener información del usuario',
      };
    }

    try {
      const user = this.formatGoogleUser(userInfo);
      
      return {
        success: true,
        user,
        idToken: userInfo.idToken,
        accessToken: userInfo.accessToken,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error procesando información del usuario: ${error}`,
      };
    }
  }

  private formatGoogleUser(userInfo: any): GoogleUser {
    const user = userInfo.user || userInfo;
    
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      photo: user.photo,
      familyName: user.familyName,
      givenName: user.givenName,
    };
  }

  // Method to check if Play Services are available (Android specific)
  async hasPlayServices(): Promise<boolean> {
    if (Platform.OS !== 'android' || !this.GoogleSignin) {
      return true; // Not applicable for iOS or if module not loaded
    }

    try {
      await this.GoogleSignin.hasPlayServices();
      return true;
    } catch (error) {
      console.log('❌ Play Services check failed:', error);
      return false;
    }
  }

  // Method to get tokens for server-side verification
  async getTokens(): Promise<{ idToken?: string; accessToken?: string } | null> {
    if (!this.GoogleSignin) {
      return null;
    }

    try {
      const tokens = await this.GoogleSignin.getTokens();
      return {
        idToken: tokens.idToken,
        accessToken: tokens.accessToken,
      };
    } catch (error) {
      console.error('❌ Error getting tokens:', error);
      return null;
    }
  }

  // Method to refresh tokens
  async refreshTokens(): Promise<{ idToken?: string; accessToken?: string } | null> {
    if (!this.GoogleSignin) {
      return null;
    }

    try {
      const userInfo = await this.GoogleSignin.signInSilently();
      return {
        idToken: userInfo.idToken,
        accessToken: userInfo.accessToken,
      };
    } catch (error) {
      console.error('❌ Error refreshing tokens:', error);
      return null;
    }
  }
}