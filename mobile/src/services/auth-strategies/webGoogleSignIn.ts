import { Platform } from 'react-native';
import {
  AuthResult,
  AuthenticationStrategy,
  GoogleSignInConfig,
  GoogleSignInError,
  GoogleUser,
} from '../../types/googleSignIn';

export class WebGoogleSignIn implements AuthenticationStrategy {
  name = 'Web Google Sign-In';
  private config: GoogleSignInConfig;
  private gapi: any = null;
  private auth2: any = null;

  constructor(config: GoogleSignInConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    // Web Google Sign-In is only available in web environment
    if (Platform.OS === 'web') {
      return true;
    }

    // For Expo Go and other non-web platforms, this strategy is not available
    // The fallback strategy should be used instead
    return false;
  }

  async configure(): Promise<void> {
    if (Platform.OS === 'web') {
      await this.configureWebGoogleSignIn();
    } else {
      // For non-web platforms, we'll use a different approach
      console.log('✅ Web Google Sign-In configured for non-web platform (will use browser)');
    }
  }

  private async configureWebGoogleSignIn(): Promise<void> {
    try {
      // Load Google API script
      await this.loadGoogleAPI();
      
      // Initialize Google API
      await new Promise((resolve, reject) => {
        this.gapi.load('auth2', {
          callback: resolve,
          onerror: reject,
        });
      });

      // Initialize auth2
      this.auth2 = await this.gapi.auth2.init({
        client_id: this.config.webClientId,
        scope: this.config.scopes.join(' '),
        hosted_domain: this.config.hostedDomain,
      });

      console.log('✅ Web Google Sign-In configured successfully');
      
    } catch (error) {
      console.error('❌ Failed to configure Web Google Sign-In:', error);
      throw error;
    }
  }

  private loadGoogleAPI(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('Window object not available'));
        return;
      }

      // Check if already loaded
      if ((window as any).gapi) {
        this.gapi = (window as any).gapi;
        resolve();
        return;
      }

      // Create script element
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        this.gapi = (window as any).gapi;
        resolve();
      };
      script.onerror = () => {
        reject(new Error('Failed to load Google API script'));
      };

      document.head.appendChild(script);
    });
  }

  async signIn(): Promise<AuthResult> {
    try {
      if (Platform.OS === 'web') {
        return await this.signInWeb();
      } else {
        return await this.signInNonWeb();
      }
    } catch (error: any) {
      console.error('❌ Web Google Sign-In error:', error);
      
      return {
        success: false,
        error: `Error durante Google Sign-In web: ${error.message || error}`,
        errorCode: GoogleSignInError.UNKNOWN_ERROR,
      };
    }
  }

  private async signInWeb(): Promise<AuthResult> {
    if (!this.auth2) {
      return {
        success: false,
        error: 'Google Sign-In no está configurado',
        errorCode: GoogleSignInError.CONFIGURATION_ERROR,
      };
    }

    try {
      const googleUser = await this.auth2.signIn();
      const profile = googleUser.getBasicProfile();
      const authResponse = googleUser.getAuthResponse();

      const user: GoogleUser = {
        id: profile.getId(),
        name: profile.getName(),
        email: profile.getEmail(),
        photo: profile.getImageUrl(),
        familyName: profile.getFamilyName(),
        givenName: profile.getGivenName(),
      };

      return {
        success: true,
        user,
        idToken: authResponse.id_token,
        accessToken: authResponse.access_token,
      };
      
    } catch (error: any) {
      if (error.error === 'popup_closed_by_user') {
        return {
          success: false,
          error: 'Inicio de sesión cancelado por el usuario',
          errorCode: GoogleSignInError.SIGN_IN_CANCELLED,
        };
      }

      return {
        success: false,
        error: `Error en Google Sign-In web: ${error.error || error.message || error}`,
        errorCode: GoogleSignInError.UNKNOWN_ERROR,
      };
    }
  }

  private async signInNonWeb(): Promise<AuthResult> {
    try {
      // For non-web platforms (like Expo Go), we can use WebBrowser to open Google OAuth
      const { WebBrowser } = await import('expo-web-browser');
      const { makeRedirectUri } = await import('expo-auth-session');
      
      const redirectUri = makeRedirectUri({
        useProxy: true,
      });

      // Construct Google OAuth URL
      const authUrl = this.buildGoogleAuthUrl(redirectUri);
      
      console.log('🌐 Opening Google Sign-In in browser...');
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      
      if (result.type === 'success' && result.url) {
        return await this.handleAuthCallback(result.url);
      } else if (result.type === 'cancel') {
        return {
          success: false,
          error: 'Inicio de sesión cancelado por el usuario',
          errorCode: GoogleSignInError.SIGN_IN_CANCELLED,
        };
      } else {
        return {
          success: false,
          error: 'Error durante el proceso de autenticación',
          errorCode: GoogleSignInError.UNKNOWN_ERROR,
        };
      }
      
    } catch (error: any) {
      console.error('❌ Non-web Google Sign-In error:', error);
      return {
        success: false,
        error: `Error en Google Sign-In: ${error.message || error}`,
        errorCode: GoogleSignInError.UNKNOWN_ERROR,
      };
    }
  }

  private buildGoogleAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.config.webClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      access_type: this.config.offlineAccess ? 'offline' : 'online',
    });

    if (this.config.hostedDomain) {
      params.append('hd', this.config.hostedDomain);
    }

    return `https://accounts.google.com/oauth/authorize?${params.toString()}`;
  }

  private async handleAuthCallback(url: string): Promise<AuthResult> {
    try {
      const urlParams = new URL(url);
      const code = urlParams.searchParams.get('code');
      const error = urlParams.searchParams.get('error');

      if (error) {
        return {
          success: false,
          error: `Error de autorización: ${error}`,
          errorCode: GoogleSignInError.UNKNOWN_ERROR,
        };
      }

      if (!code) {
        return {
          success: false,
          error: 'No se recibió código de autorización',
          errorCode: GoogleSignInError.UNKNOWN_ERROR,
        };
      }

      // Exchange code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(code);
      
      if (!tokenResponse.success) {
        return tokenResponse;
      }

      // Get user info
      const userInfo = await this.getUserInfo(tokenResponse.accessToken!);
      
      return {
        success: true,
        user: userInfo,
        idToken: tokenResponse.idToken,
        accessToken: tokenResponse.accessToken,
      };
      
    } catch (error: any) {
      console.error('❌ Error handling auth callback:', error);
      return {
        success: false,
        error: `Error procesando respuesta de autenticación: ${error.message || error}`,
        errorCode: GoogleSignInError.UNKNOWN_ERROR,
      };
    }
  }

  private async exchangeCodeForTokens(code: string): Promise<AuthResult> {
    try {
      // Note: In a production app, this should be done on your backend server
      // for security reasons. This is a simplified implementation.
      console.log('⚠️  Warning: Token exchange should be done on backend server');
      
      return {
        success: false,
        error: 'Intercambio de tokens debe realizarse en el servidor backend',
        errorCode: GoogleSignInError.CONFIGURATION_ERROR,
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: `Error intercambiando código por tokens: ${error.message || error}`,
        errorCode: GoogleSignInError.UNKNOWN_ERROR,
      };
    }
  }

  private async getUserInfo(accessToken: string): Promise<GoogleUser> {
    const response = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`);
    const userInfo = await response.json();
    
    return {
      id: userInfo.id,
      name: userInfo.name,
      email: userInfo.email,
      photo: userInfo.picture,
      familyName: userInfo.family_name,
      givenName: userInfo.given_name,
    };
  }

  async signOut(): Promise<void> {
    try {
      if (Platform.OS === 'web' && this.auth2) {
        await this.auth2.signOut();
        console.log('✅ Web Google Sign-Out successful');
      } else {
        // For non-web platforms, we just clear local state
        console.log('✅ Web Google Sign-Out successful (local state cleared)');
      }
    } catch (error) {
      console.error('❌ Web Google Sign-Out error:', error);
      throw error;
    }
  }

  async getCurrentUser(): Promise<GoogleUser | null> {
    try {
      if (Platform.OS === 'web' && this.auth2) {
        const googleUser = this.auth2.currentUser.get();
        
        if (googleUser.isSignedIn()) {
          const profile = googleUser.getBasicProfile();
          
          return {
            id: profile.getId(),
            name: profile.getName(),
            email: profile.getEmail(),
            photo: profile.getImageUrl(),
            familyName: profile.getFamilyName(),
            givenName: profile.getGivenName(),
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error getting current web user:', error);
      return null;
    }
  }
}