import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { environmentDetectionService, EnvironmentInfo, GoogleSignInCapabilities } from './environmentDetectionService';

// Importar Google Sign-In de forma condicional
let GoogleSignin: any = null;
let statusCodes: any = null;

try {
  const googleSignInModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = googleSignInModule.GoogleSignin;
  statusCodes = googleSignInModule.statusCodes;
} catch (error) {
  console.warn('⚠️ Google Sign-In SDK no está disponible en este entorno');
}

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  photo?: string;
  idToken: string;
  accessToken?: string;
}

export interface GoogleSignInConfig {
  webClientId: string;
  iosClientId?: string;
  androidClientId?: string;
}

export enum GoogleSignInStatus {
  NATIVE_AVAILABLE = 'native_available',
  WEB_FALLBACK = 'web_fallback',
  NOT_AVAILABLE = 'not_available',
  CONFIGURATION_ERROR = 'configuration_error'
}

export interface GoogleSignInAvailability {
  status: GoogleSignInStatus;
  canSignIn: boolean;
  method: 'native' | 'web' | 'none';
  message: string;
  environment: EnvironmentInfo;
  capabilities: GoogleSignInCapabilities;
}

class GoogleSignInService {
  private isConfigured = false;
  private environment: EnvironmentInfo | null = null;
  private capabilities: GoogleSignInCapabilities | null = null;

  /**
   * Inicializar el servicio detectando el entorno
   */
  private async initialize(): Promise<void> {
    if (!this.environment) {
      this.environment = environmentDetectionService.detectEnvironment();
      this.capabilities = environmentDetectionService.getGoogleSignInCapabilities();
      
      console.log('🔍 Google Sign-In Service initialized:');
      console.log(`  Environment: ${this.environment.runtime}`);
      console.log(`  Recommended method: ${this.capabilities.recommendedMethod}`);
      
      if (this.capabilities.limitations.length > 0) {
        console.log('  Limitations:');
        this.capabilities.limitations.forEach(limitation => {
          console.log(`    - ${limitation}`);
        });
      }
    }
  }

  /**
   * Obtener el estado de disponibilidad de Google Sign-In
   */
  async getAvailabilityStatus(): Promise<GoogleSignInAvailability> {
    await this.initialize();
    
    if (!this.environment || !this.capabilities) {
      return {
        status: GoogleSignInStatus.CONFIGURATION_ERROR,
        canSignIn: false,
        method: 'none',
        message: 'Error al detectar el entorno de ejecución',
        environment: this.environment!,
        capabilities: this.capabilities!,
      };
    }

    const config = Constants.expoConfig?.extra as any;
    const hasWebClientId = config?.googleWebClientId && 
                          config.googleWebClientId !== 'your_google_web_client_id_here';

    // Determinar disponibilidad basada en el entorno
    switch (this.capabilities.recommendedMethod) {
      case 'native':
        if (GoogleSignin && hasWebClientId) {
          return {
            status: GoogleSignInStatus.NATIVE_AVAILABLE,
            canSignIn: true,
            method: 'native',
            message: 'Google Sign-In nativo disponible',
            environment: this.environment,
            capabilities: this.capabilities,
          };
        } else {
          return {
            status: GoogleSignInStatus.CONFIGURATION_ERROR,
            canSignIn: false,
            method: 'none',
            message: 'Configuración de Google Sign-In incompleta',
            environment: this.environment,
            capabilities: this.capabilities,
          };
        }

      case 'web':
        if (hasWebClientId) {
          return {
            status: GoogleSignInStatus.WEB_FALLBACK,
            canSignIn: true,
            method: 'web',
            message: this.environment.runtime === 'expo-go' 
              ? 'Usando autenticación web (Expo Go no soporta nativo)'
              : 'Usando autenticación web como fallback',
            environment: this.environment,
            capabilities: this.capabilities,
          };
        } else {
          return {
            status: GoogleSignInStatus.CONFIGURATION_ERROR,
            canSignIn: false,
            method: 'none',
            message: 'Google Web Client ID no configurado',
            environment: this.environment,
            capabilities: this.capabilities,
          };
        }

      case 'disabled':
      default:
        return {
          status: GoogleSignInStatus.NOT_AVAILABLE,
          canSignIn: false,
          method: 'none',
          message: 'Google Sign-In no está disponible en este entorno',
          environment: this.environment,
          capabilities: this.capabilities,
        };
    }
  }

  /**
   * Configurar Google Sign-In basado en el entorno detectado
   */
  async configure(): Promise<void> {
    try {
      await this.initialize();
      
      if (!this.environment || !this.capabilities) {
        console.warn('⚠️ No se pudo detectar el entorno para configurar Google Sign-In');
        return;
      }

      // Solo configurar si tenemos el SDK nativo y es recomendado
      if (!GoogleSignin || this.capabilities.recommendedMethod !== 'native') {
        console.log('ℹ️ Configuración nativa de Google Sign-In omitida (no disponible o no recomendada)');
        return;
      }

      const config = Constants.expoConfig?.extra as any;
      
      if (!config?.googleWebClientId || config.googleWebClientId === 'your_google_web_client_id_here') {
        console.warn('⚠️ Google Web Client ID no configurado');
        return;
      }

      GoogleSignin.configure({
        webClientId: config.googleWebClientId,
        iosClientId: config.googleIosClientId,
        offlineAccess: true,
        hostedDomain: '',
        forceCodeForRefreshToken: true,
        accountName: '',
        googleServicePlistPath: '',
        openIdRealm: '',
        profileImageSize: 120,
      });

      this.isConfigured = true;
      console.log('✅ Google Sign-In nativo configurado correctamente');
      
    } catch (error) {
      console.error('❌ Error configurando Google Sign-In:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Verificar si Google Sign-In está disponible
   */
  async isAvailable(): Promise<boolean> {
    const availability = await this.getAvailabilityStatus();
    return availability.canSignIn;
  }

  /**
   * Sign in with Google (nativo o web fallback)
   */
  async signIn(): Promise<GoogleUser> {
    try {
      console.log('🔍 GoogleSignInService.signIn - Starting sign-in process...');
      
      // CRITICAL: Verify base64 functions are available before proceeding
      const hasBtoa = typeof global.btoa === 'function';
      const hasAtob = typeof global.atob === 'function';
      
      console.log('🔍 GoogleSignInService.signIn - Base64 availability:', { hasBtoa, hasAtob });
      
      if (!hasBtoa || !hasAtob) {
        console.error('❌ GoogleSignInService.signIn - Base64 functions not available!');
        throw new Error('Error de configuración de Google. Contacta al soporte técnico o usa email y contraseña.');
      }
      
      // Test base64 functions
      try {
        const testStr = 'Google Sign-In Test';
        const encoded = global.btoa(testStr);
        const decoded = global.atob(encoded);
        
        if (decoded !== testStr) {
          console.error('❌ GoogleSignInService.signIn - Base64 functions not working correctly!');
          throw new Error('Error de configuración de Google. Contacta al soporte técnico o usa email y contraseña.');
        }
        
        console.log('✅ GoogleSignInService.signIn - Base64 functions verified');
      } catch (base64Error) {
        console.error('❌ GoogleSignInService.signIn - Base64 test failed:', base64Error);
        throw new Error('Error de configuración de Google. Contacta al soporte técnico o usa email y contraseña.');
      }
      
      const availability = await this.getAvailabilityStatus();
      
      if (!availability.canSignIn) {
        throw new Error(availability.message);
      }

      // For compiled APK/IPA, try native first, then fallback to simplified approach
      if (availability.method === 'native') {
        try {
          return await this.signInNative();
        } catch (nativeError) {
          console.warn('⚠️ Native Google Sign-In failed, trying fallback:', nativeError);
          // Fall through to web fallback
        }
      }
      
      // Use web fallback or show appropriate message
      if (availability.method === 'web') {
        return await this.signInWithWebFallback();
      }

      throw new Error('Ningún método de Google Sign-In está disponible');
      
    } catch (error: any) {
      console.error('❌ Error en Google Sign-In:', error);
      throw error;
    }
  }

  /**
   * Iniciar sesión con Google nativo
   */
  private async signInNative(): Promise<GoogleUser> {
    console.log('🔍 GoogleSignInService.signInNative - Starting native sign-in...');
    
    if (!GoogleSignin || !statusCodes) {
      console.error('❌ GoogleSignInService.signInNative - SDK not available');
      throw new Error('Google Sign-In SDK no está disponible');
    }

    if (!this.isConfigured) {
      console.log('🔧 GoogleSignInService.signInNative - Not configured, configuring now...');
      await this.configure();
    }

    if (!this.isConfigured) {
      console.error('❌ GoogleSignInService.signInNative - Configuration failed');
      throw new Error('Google Sign-In no está configurado correctamente');
    }

    try {
      console.log('🔍 GoogleSignInService.signInNative - Checking Play Services...');
      // Verificar si Google Play Services está disponible (Android)
      await GoogleSignin.hasPlayServices();
      console.log('✅ GoogleSignInService.signInNative - Play Services available');

      console.log('🔍 GoogleSignInService.signInNative - Performing sign-in...');
      // Realizar sign-in
      const userInfo = await GoogleSignin.signIn();
      console.log('✅ GoogleSignInService.signInNative - Sign-in successful, processing user info...');
      
      if (!userInfo.data?.user || !userInfo.data?.idToken) {
        console.error('❌ GoogleSignInService.signInNative - Invalid user info:', userInfo);
        throw new Error('No se pudo obtener información del usuario');
      }

      const googleUser: GoogleUser = {
        id: userInfo.data.user.id,
        email: userInfo.data.user.email,
        name: userInfo.data.user.name || userInfo.data.user.email,
        photo: userInfo.data.user.photo || undefined,
        idToken: userInfo.data.idToken,
        accessToken: userInfo.data.serverAuthCode || undefined,
      };

      console.log('✅ GoogleSignInService.signInNative - User object created:', {
        id: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        hasIdToken: !!googleUser.idToken,
        hasAccessToken: !!googleUser.accessToken
      });
      
      return googleUser;
      
    } catch (error: any) {
      console.error('❌ GoogleSignInService.signInNative - Error details:', {
        errorName: error.name,
        errorMessage: error.message,
        errorCode: error.code,
        fullError: error
      });
      
      // Manejar errores específicos
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new Error('Inicio de sesión cancelado por el usuario');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        throw new Error('Inicio de sesión en progreso');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services no está disponible');
      } else {
        throw new Error(error.message || 'Error desconocido en Google Sign-In nativo');
      }
    }
  }

  /**
   * Iniciar sesión con Google usando web fallback
   */
  async signInWithWebFallback(): Promise<GoogleUser> {
    try {
      await this.initialize();
      
      if (!this.environment) {
        throw new Error('No se pudo detectar el entorno de ejecución');
      }

      const config = Constants.expoConfig?.extra as any;
      const webClientId = config?.googleWebClientId;
      
      if (!webClientId || webClientId === 'your_google_web_client_id_here') {
        throw new Error('Google Web Client ID no configurado');
      }

      // En entorno web, usar la API web de Google
      if (this.environment.platform === 'web') {
        return await this.signInWeb(webClientId);
      }

      // En móvil (Expo Go), usar WebBrowser para OAuth
      return await this.signInMobileWeb(webClientId);
      
    } catch (error: any) {
      console.error('❌ Error en Google Sign-In web fallback:', error);
      throw new Error(error.message || 'Error en autenticación web de Google');
    }
  }

  /**
   * Iniciar sesión web (navegador)
   */
  private async signInWeb(webClientId: string): Promise<GoogleUser> {
    // Para entorno web, necesitaríamos implementar la API de Google
    // Por ahora, lanzamos un error informativo
    throw new Error('Google Sign-In web no implementado aún. Usa email y contraseña.');
  }

  /**
   * Iniciar sesión móvil web (WebBrowser)
   */
  private async signInMobileWeb(webClientId: string): Promise<GoogleUser> {
    // For compiled APK/IPA, show informative message instead of trying WebBrowser
    if (this.environment?.runtime === 'production' || this.environment?.runtime === 'development-build') {
      throw new Error('Google Sign-In requiere configuración nativa completa en builds compilados. Por favor, usa email y contraseña o contacta al desarrollador.');
    }
    
    // For Expo Go, show appropriate message
    throw new Error('Google Sign-In en Expo Go no implementado aún. Usa un Development Build para funcionalidad completa.');
  }

  /**
   * Cerrar sesión de Google
   */
  async signOut(): Promise<void> {
    try {
      const availability = await this.getAvailabilityStatus();
      
      // Solo hacer sign-out nativo si está disponible y configurado
      if (availability.method === 'native' && GoogleSignin && this.isConfigured) {
        await GoogleSignin.signOut();
        console.log('✅ Google Sign-Out nativo exitoso');
      } else {
        console.log('ℹ️ Google Sign-Out: solo limpieza local (no hay sesión nativa)');
      }
      
    } catch (error) {
      console.error('❌ Error en Google Sign-Out:', error);
      // No lanzar error, ya que el sign-out local puede continuar
    }
  }

  /**
   * Revocar acceso de Google
   */
  async revokeAccess(): Promise<void> {
    try {
      const availability = await this.getAvailabilityStatus();
      
      // Solo revocar acceso nativo si está disponible y configurado
      if (availability.method === 'native' && GoogleSignin && this.isConfigured) {
        await GoogleSignin.revokeAccess();
        console.log('✅ Google Access nativo revocado');
      } else {
        console.log('ℹ️ Google Revoke Access: solo limpieza local (no hay sesión nativa)');
      }
      
    } catch (error) {
      console.error('❌ Error revocando acceso de Google:', error);
      // No lanzar error, ya que la revocación local puede continuar
    }
  }

  /**
   * Obtener usuario actual de Google (si está autenticado)
   */
  async getCurrentUser(): Promise<GoogleUser | null> {
    try {
      const availability = await this.getAvailabilityStatus();
      
      // Solo obtener usuario nativo si está disponible y configurado
      if (availability.method !== 'native' || !GoogleSignin || !this.isConfigured) {
        return null;
      }

      const userInfo = GoogleSignin.getCurrentUser();
      
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
      console.error('❌ Error obteniendo usuario actual de Google:', error);
      return null;
    }
  }

  /**
   * Verificar si el usuario está autenticado con Google
   */
  async isSignedIn(): Promise<boolean> {
    try {
      const availability = await this.getAvailabilityStatus();
      
      if (availability.method !== 'native') {
        return false;
      }

      const currentUser = await this.getCurrentUser();
      return currentUser !== null;
      
    } catch (error) {
      console.error('❌ Error verificando estado de Google Sign-In:', error);
      return false;
    }
  }

  /**
   * Obtener información detallada para debugging
   */
  async getDebugInfo(): Promise<Record<string, any>> {
    await this.initialize();
    const availability = await this.getAvailabilityStatus();
    
    return {
      availability,
      environment: this.environment,
      capabilities: this.capabilities,
      isConfigured: this.isConfigured,
      hasGoogleSigninSDK: !!GoogleSignin,
      hasStatusCodes: !!statusCodes,
      configuration: {
        webClientId: Constants.expoConfig?.extra?.googleWebClientId || 'not_set',
        iosClientId: Constants.expoConfig?.extra?.googleIosClientId || 'not_set',
        androidClientId: Constants.expoConfig?.extra?.googleAndroidClientId || 'not_set',
      },
    };
  }
}

// Exportar instancia singleton
export const googleSignInService = new GoogleSignInService();