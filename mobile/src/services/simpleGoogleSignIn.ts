/**
 * Simplified Google Sign-In Service
 * Handles Google authentication for compiled APK/IPA builds
 */

import Constants from 'expo-constants';
import { Platform, Alert } from 'react-native';
import { environmentDetectionService } from './environmentDetectionService';
import { GoogleSignInError, GoogleSignInErrorInfo } from '../types/googleSignIn';

// Import Google Sign-In conditionally
let GoogleSignin: any = null;
let statusCodes: any = null;

try {
  const googleSignInModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = googleSignInModule.GoogleSignin;
  statusCodes = googleSignInModule.statusCodes;
  console.log('✅ Google Sign-In SDK loaded successfully');
} catch (error) {
  console.warn('⚠️ Google Sign-In SDK not available:', error);
}

export interface SimpleGoogleUser {
  id: string;
  email: string;
  name: string;
  photo?: string;
  idToken: string;
  accessToken?: string;
}

export interface SimpleGoogleSignInResult {
  success: boolean;
  user?: SimpleGoogleUser;
  error?: string;
  errorInfo?: GoogleSignInErrorInfo;
  canRetry?: boolean;
  fallbackOptions?: string[];
}

class SimpleGoogleSignInService {
  private isConfigured = false;
  private configurationAttempted = false;

  /**
   * Check if Google Sign-In is available and properly configured
   */
  async isAvailable(): Promise<boolean> {
    try {
      const env = environmentDetectionService.detectEnvironment();
      
      // Check if we have the SDK
      if (!GoogleSignin) {
        console.log('❌ Google Sign-In SDK not available');
        return false;
      }

      // Check if we have configuration
      const config = Constants.expoConfig?.extra;
      const hasWebClientId = config?.googleWebClientId && 
                            config.googleWebClientId !== 'your_google_web_client_id_here' &&
                            config.googleWebClientId !== 'YOUR_GOOGLE_WEB_CLIENT_ID';

      if (!hasWebClientId) {
        console.log('❌ Google Web Client ID not configured');
        return false;
      }

      // For compiled builds, we should have Google Services files
      if (env.runtime === 'production' || env.runtime === 'development-build') {
        if (!env.hasGoogleServicesFile) {
          console.log('❌ Google Services files not detected for compiled build');
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Error checking Google Sign-In availability:', error);
      return false;
    }
  }

  /**
   * Configure Google Sign-In
   */
  async configure(): Promise<boolean> {
    if (this.configurationAttempted) {
      return this.isConfigured;
    }

    this.configurationAttempted = true;

    try {
      if (!GoogleSignin) {
        console.log('❌ Cannot configure - Google Sign-In SDK not available');
        return false;
      }

      const config = Constants.expoConfig?.extra;
      const webClientId = config?.googleWebClientId;

      console.log('🔍 DEBUGGING - Configuration values:');
      console.log('- Web Client ID:', webClientId);
      console.log('- Android Client ID:', config?.googleAndroidClientId);
      console.log('- iOS Client ID:', config?.googleIosClientId);

      if (!webClientId || webClientId === 'your_google_web_client_id_here') {
        console.log('❌ Cannot configure - Google Web Client ID not set');
        return false;
      }

      console.log('🔧 Configuring Google Sign-In with:');
      console.log('- webClientId:', webClientId);
      console.log('- iosClientId:', config?.googleIosClientId);

      GoogleSignin.configure({
        webClientId: webClientId,
        iosClientId: config?.googleIosClientId,
        offlineAccess: true,
        hostedDomain: '',
        forceCodeForRefreshToken: true,
        accountName: '',
        googleServicePlistPath: '',
        openIdRealm: '',
        profileImageSize: 120,
      });

      this.isConfigured = true;
      console.log('✅ Google Sign-In configured successfully');
      
      // Additional debugging info
      console.log('🔍 IMPORTANT: For DEVELOPER_ERROR troubleshooting:');
      console.log('- Ensure google-services.json has correct Client IDs');
      console.log('- Ensure SHA-1 fingerprint is configured in Google Cloud Console');
      console.log('- Package name must be: com.trinity.app');
      
      return true;

    } catch (error) {
      console.error('❌ Error configuring Google Sign-In:', error);
      this.isConfigured = false;
      return false;
    }
  }

  /**
   * Sign in with Google
   */
  async signIn(): Promise<SimpleGoogleSignInResult> {
    try {
      console.log('🔍 SimpleGoogleSignIn: Starting sign-in process...');
      
      // Check availability first
      const available = await this.isAvailable();
      if (!available) {
        return this.createErrorResult(
          GoogleSignInError.CONFIGURATION_ERROR,
          'Google Sign-In no está disponible en este entorno',
          'Google Sign-In no está disponible. Usa email y contraseña para iniciar sesión.',
          ['email_password'],
          false
        );
      }

      // Configure if not already configured
      if (!this.isConfigured) {
        console.log('🔧 Configuring Google Sign-In...');
        const configured = await this.configure();
        if (!configured) {
          return this.createErrorResult(
            GoogleSignInError.CONFIGURATION_ERROR,
            'No se pudo configurar Google Sign-In',
            'Error de configuración. Usa email y contraseña para iniciar sesión.',
            ['email_password'],
            false
          );
        }
      }

      console.log('🔐 Starting Google Sign-In...');
      
      // Log configuration details for debugging
      const config = Constants.expoConfig?.extra;
      console.log('🔍 DEBUGGING - Configuration details:');
      console.log('- Web Client ID:', config?.googleWebClientId);
      console.log('- Android Client ID:', config?.googleAndroidClientId);
      console.log('- Package name should be: com.trinity.app');
      console.log('- Platform:', Platform.OS);

      // Check Play Services (Android only)
      if (Platform.OS === 'android') {
        try {
          console.log('🔍 Checking Google Play Services...');
          await GoogleSignin.hasPlayServices();
          console.log('✅ Google Play Services available');
        } catch (playServicesError: any) {
          console.error('❌ Google Play Services error:', playServicesError);
          return this.createErrorResult(
            GoogleSignInError.PLAY_SERVICES_NOT_AVAILABLE,
            'Google Play Services no está disponible o actualizado',
            'Google Play Services no está disponible. Actualiza Google Play Services o usa email y contraseña.',
            ['email_password'],
            true,
            10000 // 10 seconds retry delay
          );
        }
      }

      // Perform sign-in with enhanced error handling
      console.log('🔍 Calling GoogleSignin.signIn()...');
      
      let userInfo;
      try {
        userInfo = await GoogleSignin.signIn();
        console.log('✅ GoogleSignin.signIn() completed successfully');
      } catch (signInError: any) {
        return this.handleSignInError(signInError);
      }
      
      if (!userInfo?.data?.user || !userInfo?.data?.idToken) {
        return this.createErrorResult(
          GoogleSignInError.UNKNOWN_ERROR,
          'No se pudo obtener información del usuario de Google',
          'Error obteniendo información de tu cuenta. Intenta nuevamente o usa email y contraseña.',
          ['retry_google', 'email_password'],
          true,
          3000
        );
      }

      const user: SimpleGoogleUser = {
        id: userInfo.data.user.id,
        email: userInfo.data.user.email,
        name: userInfo.data.user.name || userInfo.data.user.email,
        photo: userInfo.data.user.photo || undefined,
        idToken: userInfo.data.idToken,
        accessToken: userInfo.data.serverAuthCode || undefined,
      };

      console.log('✅ Google Sign-In successful:', user.email);

      return {
        success: true,
        user,
      };

    } catch (error: any) {
      console.error('❌ Google Sign-In unexpected error:', error);
      return this.createErrorResult(
        GoogleSignInError.UNKNOWN_ERROR,
        error.message || 'Error desconocido durante Google Sign-In',
        'Error inesperado. Intenta nuevamente o usa email y contraseña.',
        ['retry_google', 'email_password'],
        true,
        5000
      );
    }
  }

  /**
   * Handle specific sign-in errors with detailed error information
   */
  private handleSignInError(signInError: any): SimpleGoogleSignInResult {
    console.error('❌ DETAILED SIGN-IN ERROR:');
    console.error('- Error code:', signInError.code);
    console.error('- Error message:', signInError.message);
    console.error('- Error name:', signInError.name);
    console.error('- Full error object:', JSON.stringify(signInError, null, 2));
    
    // Handle DEVELOPER_ERROR specifically
    if (signInError.message && signInError.message.includes('DEVELOPER_ERROR')) {
      console.error('🚨 DEVELOPER_ERROR DETECTED!');
      console.error('🔍 This error means Google Cloud Console configuration is incorrect:');
      console.error('   1. Go to: https://console.cloud.google.com/');
      console.error('   2. Select project: trinity-app-production');
      console.error('   3. Go to APIs & Services > Credentials');
      console.error('   4. Create/Edit OAuth 2.0 Client ID for Android:');
      console.error('      - Application type: Android');
      console.error('      - Package name: com.trinity.app');
      console.error('      - SHA-1 certificate fingerprint: [NEEDS TO BE CONFIGURED]');
      console.error('   5. Download new google-services.json');
      console.error('   6. Replace mobile/google-services.json');
      console.error('   7. Rebuild APK');
      
      return this.createErrorResult(
        GoogleSignInError.DEVELOPER_ERROR,
        'DEVELOPER_ERROR: Configuración de Google incorrecta',
        'Error de configuración de Google. Contacta al soporte técnico o usa email y contraseña.',
        ['email_password'],
        false
      );
    }

    // Handle network errors
    if (signInError.message && (
      signInError.message.includes('network') ||
      signInError.message.includes('timeout') ||
      signInError.message.includes('connection')
    )) {
      return this.createErrorResult(
        GoogleSignInError.NETWORK_ERROR,
        'Error de red durante Google Sign-In',
        'Error de conexión. Verifica tu conexión a internet e intenta nuevamente.',
        ['retry_google', 'email_password'],
        true,
        5000
      );
    }

    // Handle service unavailable
    if (signInError.message && (
      signInError.message.includes('service unavailable') ||
      signInError.message.includes('temporarily down') ||
      signInError.message.includes('server error')
    )) {
      return this.createErrorResult(
        GoogleSignInError.SERVICE_UNAVAILABLE,
        'Servicio de Google temporalmente no disponible',
        'El servicio de Google no está disponible temporalmente. Intenta en unos minutos o usa email y contraseña.',
        ['email_password'],
        true,
        30000 // 30 seconds
      );
    }

    // Handle rate limiting
    if (signInError.message && (
      signInError.message.includes('rate limit') ||
      signInError.message.includes('quota') ||
      signInError.message.includes('too many')
    )) {
      return this.createErrorResult(
        GoogleSignInError.RATE_LIMIT_EXCEEDED,
        'Demasiados intentos de Google Sign-In',
        'Demasiados intentos. Espera unos minutos e intenta nuevamente o usa email y contraseña.',
        ['email_password'],
        true,
        60000 // 1 minute
      );
    }

    // Handle specific status codes
    if (statusCodes && signInError.code) {
      console.log('🔍 Error code detected:', signInError.code);
      switch (signInError.code) {
        case statusCodes.SIGN_IN_CANCELLED:
          return this.createErrorResult(
            GoogleSignInError.SIGN_IN_CANCELLED,
            'Inicio de sesión cancelado por el usuario',
            'Inicio de sesión cancelado. Intenta nuevamente o usa email y contraseña.',
            ['retry_google', 'email_password'],
            true
          );

        case statusCodes.IN_PROGRESS:
          return this.createErrorResult(
            GoogleSignInError.UNKNOWN_ERROR,
            'Ya hay un inicio de sesión en progreso',
            'Ya hay un inicio de sesión en progreso. Espera un momento e intenta nuevamente.',
            ['retry_google', 'email_password'],
            true,
            3000
          );

        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          return this.createErrorResult(
            GoogleSignInError.PLAY_SERVICES_NOT_AVAILABLE,
            'Google Play Services no está disponible',
            'Google Play Services no está disponible. Actualiza Google Play Services o usa email y contraseña.',
            ['email_password'],
            false
          );

        default:
          break;
      }
    }

    // Generic error
    return this.createErrorResult(
      GoogleSignInError.UNKNOWN_ERROR,
      signInError.message || 'Error desconocido durante Google Sign-In',
      'Error durante el inicio de sesión con Google. Intenta nuevamente o usa email y contraseña.',
      ['retry_google', 'email_password'],
      true,
      3000
    );
  }

  /**
   * Create a structured error result
   */
  private createErrorResult(
    code: GoogleSignInError,
    message: string,
    userMessage: string,
    fallbackOptions: string[],
    retryable: boolean,
    retryDelay?: number,
    context?: string
  ): SimpleGoogleSignInResult {
    const errorInfo: GoogleSignInErrorInfo = {
      code,
      message,
      userMessage,
      fallbackOptions,
      retryable,
      retryDelay,
      context,
    };

    return {
      success: false,
      error: userMessage,
      errorInfo,
      canRetry: retryable,
      fallbackOptions,
    };
  }

  /**
   * Sign out from Google
   */
  async signOut(): Promise<void> {
    try {
      if (GoogleSignin && this.isConfigured) {
        await GoogleSignin.signOut();
        console.log('✅ Google Sign-Out successful');
      }
    } catch (error) {
      console.error('❌ Google Sign-Out error:', error);
      // Don't throw - sign out should always succeed locally
    }
  }

  /**
   * Get current Google user
   */
  async getCurrentUser(): Promise<SimpleGoogleUser | null> {
    try {
      if (!GoogleSignin || !this.isConfigured) {
        return null;
      }

      const userInfo = await GoogleSignin.getCurrentUser();
      
      if (!userInfo?.data?.user) {
        return null;
      }

      return {
        id: userInfo.data.user.id,
        email: userInfo.data.user.email,
        name: userInfo.data.user.name || userInfo.data.user.email,
        photo: userInfo.data.user.photo || undefined,
        idToken: userInfo.data.idToken || '',
        accessToken: userInfo.data.serverAuthCode || undefined,
      };

    } catch (error) {
      console.error('❌ Error getting current Google user:', error);
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
      console.error('❌ Error checking Google sign-in status:', error);
      return false;
    }
  }

  /**
   * Show user-friendly error message with fallback options
   */
  showErrorMessage(error: string, errorInfo?: GoogleSignInErrorInfo): void {
    const buttons: any[] = [];

    // Add retry button if retryable
    if (errorInfo?.retryable) {
      buttons.push({
        text: 'Reintentar',
        style: 'default',
        onPress: () => {
          // Caller should handle retry logic
          console.log('User chose to retry Google Sign-In');
        }
      });
    }

    // Add fallback options
    if (errorInfo?.fallbackOptions?.includes('email_password')) {
      buttons.push({
        text: 'Usar Email/Contraseña',
        style: 'default',
        onPress: () => {
          console.log('User chose email/password fallback');
        }
      });
    }

    // Add cancel button
    buttons.push({
      text: 'Cancelar',
      style: 'cancel'
    });

    Alert.alert(
      'Google Sign-In',
      error,
      buttons
    );
  }

  /**
   * Handle error with automatic retry if applicable
   */
  async handleErrorWithRetry(
    errorInfo: GoogleSignInErrorInfo,
    retryFunction: () => Promise<SimpleGoogleSignInResult>
  ): Promise<SimpleGoogleSignInResult> {
    if (!errorInfo.retryable) {
      return {
        success: false,
        error: errorInfo.userMessage,
        errorInfo,
        canRetry: false,
        fallbackOptions: errorInfo.fallbackOptions,
      };
    }

    // Wait for retry delay if specified
    if (errorInfo.retryDelay) {
      console.log(`⏳ Waiting ${errorInfo.retryDelay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, errorInfo.retryDelay));
    }

    try {
      console.log('🔄 Retrying Google Sign-In...');
      return await retryFunction();
    } catch (retryError) {
      console.error('❌ Retry also failed:', retryError);
      return {
        success: false,
        error: errorInfo.userMessage,
        errorInfo: {
          ...errorInfo,
          retryable: false, // Don't retry again
        },
        canRetry: false,
        fallbackOptions: errorInfo.fallbackOptions,
      };
    }
  }

  /**
   * Get user-friendly error message for display
   */
  getDisplayError(result: SimpleGoogleSignInResult): string {
    if (result.errorInfo) {
      return result.errorInfo.userMessage;
    }
    return result.error || 'Error desconocido durante Google Sign-In';
  }

  /**
   * Check if error suggests using email/password fallback
   */
  shouldUseEmailPasswordFallback(result: SimpleGoogleSignInResult): boolean {
    return result.fallbackOptions?.includes('email_password') || false;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(result: SimpleGoogleSignInResult): boolean {
    return result.canRetry || false;
  }

  /**
   * Get status message for debugging
   */
  getStatusMessage(): string {
    const env = environmentDetectionService.detectEnvironment();
    
    if (!GoogleSignin) {
      return 'Google Sign-In SDK no disponible';
    }

    if (env.runtime === 'expo-go') {
      return 'Expo Go - Google Sign-In no soportado';
    }

    if (!this.isConfigured && !this.configurationAttempted) {
      return 'Google Sign-In no configurado';
    }

    if (this.configurationAttempted && !this.isConfigured) {
      return 'Error en configuración de Google Sign-In';
    }

    if (this.isConfigured) {
      return 'Google Sign-In disponible';
    }

    return 'Google Sign-In inicializando...';
  }
}

// Export singleton instance
export const simpleGoogleSignInService = new SimpleGoogleSignInService();