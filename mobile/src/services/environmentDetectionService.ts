import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface EnvironmentInfo {
  platform: 'ios' | 'android' | 'web';
  runtime: 'expo-go' | 'development-build' | 'production' | 'web';
  googleSignInAvailable: boolean;
  hasGoogleServicesFile: boolean;
  isDebugMode: boolean;
  appVersion: string;
  expoVersion?: string;
}

export interface GoogleSignInCapabilities {
  nativeAvailable: boolean;
  webFallbackAvailable: boolean;
  recommendedMethod: 'native' | 'web' | 'disabled';
  limitations: string[];
}

class EnvironmentDetectionService {
  private environmentInfo: EnvironmentInfo | null = null;

  /**
   * Detecta el entorno de ejecución actual
   */
  detectEnvironment(): EnvironmentInfo {
    if (this.environmentInfo) {
      return this.environmentInfo;
    }

    const platform = this.detectPlatform();
    const runtime = this.detectRuntime();
    const googleSignInAvailable = this.checkGoogleSignInAvailability();
    const hasGoogleServicesFile = this.checkGoogleServicesFile();

    this.environmentInfo = {
      platform,
      runtime,
      googleSignInAvailable,
      hasGoogleServicesFile,
      isDebugMode: __DEV__,
      appVersion: Constants.expoConfig?.version || '1.0.0',
      expoVersion: Constants.expoVersion,
    };

    // Log environment info for debugging
    this.logEnvironmentInfo(this.environmentInfo);

    return this.environmentInfo;
  }

  /**
   * Detecta la plataforma actual
   */
  private detectPlatform(): 'ios' | 'android' | 'web' {
    if (Platform.OS === 'web') return 'web';
    if (Platform.OS === 'ios') return 'ios';
    if (Platform.OS === 'android') return 'android';
    
    // Fallback
    return 'web';
  }

  /**
   * Detecta el runtime actual (Expo Go, Development Build, Production, Web)
   */
  private detectRuntime(): 'expo-go' | 'development-build' | 'production' | 'web' {
    if (Platform.OS === 'web') {
      return 'web';
    }

    // Verificar si estamos en Expo Go
    if (this.isExpoGo()) {
      return 'expo-go';
    }

    // Verificar si es un development build
    if (this.isDevelopmentBuild()) {
      return 'development-build';
    }

    // Si no es Expo Go ni development build, asumimos producción
    return 'production';
  }

  /**
   * Verifica si estamos ejecutando en Expo Go
   */
  isExpoGo(): boolean {
    // Expo Go tiene ciertas características específicas
    return (
      Constants.appOwnership === 'expo' ||
      Constants.executionEnvironment === 'storeClient' ||
      (Constants.expoVersion !== undefined && !Constants.expoConfig?.extra?.isStandalone)
    );
  }

  /**
   * Verifica si estamos en un development build
   */
  isDevelopmentBuild(): boolean {
    return (
      __DEV__ &&
      !this.isExpoGo() &&
      Constants.appOwnership !== 'standalone'
    );
  }

  /**
   * Verifica si estamos en entorno web
   */
  isWebEnvironment(): boolean {
    return Platform.OS === 'web';
  }

  /**
   * Verifica si podemos usar Google Sign-In nativo
   */
  canUseNativeGoogleSignIn(): boolean {
    const env = this.detectEnvironment();
    
    // Google Sign-In nativo solo funciona en development builds y producción
    return (
      env.runtime === 'development-build' || 
      env.runtime === 'production'
    ) && env.hasGoogleServicesFile;
  }

  /**
   * Verifica la disponibilidad de Google Sign-In
   */
  private checkGoogleSignInAvailability(): boolean {
    try {
      // Intentar importar el módulo de Google Sign-In
      require('@react-native-google-signin/google-signin');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verifica si los archivos de Google Services están presentes
   */
  private checkGoogleServicesFile(): boolean {
    const config = Constants.expoConfig;
    
    if (!config) return false;

    // Verificar configuración de Google en app.json
    const hasWebClientId = config.extra?.googleWebClientId && 
                          config.extra.googleWebClientId !== 'your_google_web_client_id_here' &&
                          config.extra.googleWebClientId !== 'YOUR_GOOGLE_WEB_CLIENT_ID';
    
    // En web, solo necesitamos el web client ID
    if (Platform.OS === 'web') {
      return hasWebClientId;
    }

    // En móvil, verificar que tenemos las credenciales necesarias
    // Para builds compilados (APK/IPA), los archivos están embebidos
    const hasAndroidClientId = Platform.OS === 'android' && 
                              config.extra?.googleAndroidClientId &&
                              config.extra.googleAndroidClientId !== 'YOUR_GOOGLE_ANDROID_CLIENT_ID';
    
    const hasIosClientId = Platform.OS === 'ios' && 
                          config.extra?.googleIosClientId &&
                          config.extra.googleIosClientId !== 'YOUR_GOOGLE_IOS_CLIENT_ID';

    return hasWebClientId && (hasAndroidClientId || hasIosClientId);
  }

  /**
   * Obtiene las capacidades de Google Sign-In para el entorno actual
   */
  getGoogleSignInCapabilities(): GoogleSignInCapabilities {
    const env = this.detectEnvironment();
    const limitations: string[] = [];
    
    let nativeAvailable = false;
    let webFallbackAvailable = false;
    let recommendedMethod: 'native' | 'web' | 'disabled' = 'disabled';

    if (env.runtime === 'web') {
      webFallbackAvailable = env.hasGoogleServicesFile;
      recommendedMethod = webFallbackAvailable ? 'web' : 'disabled';
      if (!webFallbackAvailable) {
        limitations.push('Google Web Client ID not configured');
      }
    } else if (env.runtime === 'expo-go') {
      webFallbackAvailable = env.hasGoogleServicesFile;
      recommendedMethod = webFallbackAvailable ? 'web' : 'disabled';
      limitations.push('Native Google Sign-In not available in Expo Go');
      limitations.push('Use Development Build for native functionality');
      if (!webFallbackAvailable) {
        limitations.push('Google Web Client ID not configured');
      }
    } else if (env.runtime === 'development-build' || env.runtime === 'production') {
      nativeAvailable = env.googleSignInAvailable && env.hasGoogleServicesFile;
      webFallbackAvailable = env.hasGoogleServicesFile;
      
      if (nativeAvailable) {
        recommendedMethod = 'native';
      } else if (webFallbackAvailable) {
        recommendedMethod = 'web';
        limitations.push('Native Google Sign-In SDK not available, using web fallback');
      } else {
        recommendedMethod = 'disabled';
        limitations.push('Google Services files not configured');
      }

      if (!env.hasGoogleServicesFile) {
        limitations.push('Google Services files missing (google-services.json/GoogleService-Info.plist)');
      }
    }

    return {
      nativeAvailable,
      webFallbackAvailable,
      recommendedMethod,
      limitations,
    };
  }

  /**
   * Obtiene información detallada del entorno para debugging
   */
  getDetailedEnvironmentInfo(): Record<string, any> {
    const env = this.detectEnvironment();
    const capabilities = this.getGoogleSignInCapabilities();

    return {
      environment: env,
      capabilities,
      constants: {
        appOwnership: Constants.appOwnership,
        executionEnvironment: Constants.executionEnvironment,
        expoVersion: Constants.expoVersion,
        platform: Platform.OS,
        isDebug: __DEV__,
      },
      configuration: {
        hasExpoConfig: !!Constants.expoConfig,
        hasGoogleWebClientId: !!(Constants.expoConfig?.extra?.googleWebClientId),
        hasAndroidGoogleServices: !!(Constants.expoConfig?.android?.googleServicesFile),
        hasIosGoogleServices: !!(Constants.expoConfig?.ios?.googleServicesFile),
      },
    };
  }

  /**
   * Registra información del entorno para debugging
   */
  private logEnvironmentInfo(env: EnvironmentInfo): void {
    if (!__DEV__) return;

    console.log('🔍 Environment Detection Results:');
    console.log(`  Platform: ${env.platform}`);
    console.log(`  Runtime: ${env.runtime}`);
    console.log(`  Google Sign-In Available: ${env.googleSignInAvailable}`);
    console.log(`  Google Services File: ${env.hasGoogleServicesFile}`);
    console.log(`  App Version: ${env.appVersion}`);
    
    if (env.expoVersion) {
      console.log(`  Expo Version: ${env.expoVersion}`);
    }

    const capabilities = this.getGoogleSignInCapabilities();
    console.log(`  Recommended Auth Method: ${capabilities.recommendedMethod}`);
    
    if (capabilities.limitations.length > 0) {
      console.log('  Limitations:');
      capabilities.limitations.forEach(limitation => {
        console.log(`    - ${limitation}`);
      });
    }
  }

  /**
   * Resetea la información del entorno (útil para testing)
   */
  reset(): void {
    this.environmentInfo = null;
  }
}

// Exportar instancia singleton
export const environmentDetectionService = new EnvironmentDetectionService();