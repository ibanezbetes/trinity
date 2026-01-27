import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

export interface EnvironmentInfo {
  platform: 'ios' | 'android' | 'web';
  runtime: 'expo-go' | 'development-build' | 'production' | 'web';
  googleSignInAvailable: boolean;
  hasGoogleServicesFile: boolean;
  deviceInfo: {
    isDevice: boolean;
    deviceName?: string;
    osVersion?: string;
  };
  buildInfo: {
    appVersion: string;
    buildVersion: string;
    expoVersion?: string;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

class EnvironmentService {
  private static instance: EnvironmentService;
  private environmentInfo: EnvironmentInfo | null = null;

  static getInstance(): EnvironmentService {
    if (!EnvironmentService.instance) {
      EnvironmentService.instance = new EnvironmentService();
    }
    return EnvironmentService.instance;
  }

  async detectEnvironment(): Promise<EnvironmentInfo> {
    if (this.environmentInfo) {
      return this.environmentInfo;
    }

    const platform = this.getPlatform();
    const runtime = this.detectRuntime();
    const googleSignInAvailable = await this.checkGoogleSignInAvailability();
    const hasGoogleServicesFile = await this.checkGoogleServicesFile();

    this.environmentInfo = {
      platform,
      runtime,
      googleSignInAvailable,
      hasGoogleServicesFile,
      deviceInfo: {
        isDevice: Device.isDevice,
        deviceName: Device.deviceName || undefined,
        osVersion: Device.osVersion || undefined,
      },
      buildInfo: {
        appVersion: Constants.expoConfig?.version || '1.0.0',
        buildVersion: Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode?.toString() || '1',
        expoVersion: Constants.expoConfig?.sdkVersion,
      },
    };

    return this.environmentInfo;
  }

  private getPlatform(): 'ios' | 'android' | 'web' {
    if (Platform.OS === 'web') return 'web';
    if (Platform.OS === 'ios') return 'ios';
    if (Platform.OS === 'android') return 'android';
    return 'android'; // fallback
  }

  private detectRuntime(): 'expo-go' | 'development-build' | 'production' | 'web' {
    if (Platform.OS === 'web') {
      return 'web';
    }

    // Check if running in Expo Go
    if (Constants.appOwnership === 'expo') {
      return 'expo-go';
    }

    // Check if it's a development build
    if (__DEV__ && Constants.appOwnership === 'standalone') {
      return 'development-build';
    }

    // Check if it's production
    if (!__DEV__ && Constants.appOwnership === 'standalone') {
      return 'production';
    }

    // Fallback detection based on other indicators
    if (Constants.executionEnvironment === 'storeClient') {
      return 'expo-go';
    }

    if (Constants.executionEnvironment === 'standalone') {
      return __DEV__ ? 'development-build' : 'production';
    }

    // Default fallback
    return 'expo-go';
  }

  private async checkGoogleSignInAvailability(): Promise<boolean> {
    try {
      // Try to import Google Sign-In module
      const GoogleSignIn = await import('@react-native-google-signin/google-signin');
      
      // Check if GoogleSignin is available
      if (GoogleSignIn && GoogleSignIn.GoogleSignin) {
        // Try to check if it's configured (this will throw if not available)
        try {
          await GoogleSignIn.GoogleSignin.hasPlayServices();
          return true;
        } catch (error) {
          // Play Services not available or not configured
          return false;
        }
      }
      return false;
    } catch (error) {
      // Module not available (likely in Expo Go)
      return false;
    }
  }

  private async checkGoogleServicesFile(): Promise<boolean> {
    try {
      const platform = this.getPlatform();
      
      if (platform === 'web') {
        // For web, we don't need Google Services files
        return true;
      }

      // For native platforms, we need to check if the configuration is available
      // This is a simplified check - in a real implementation, you might want to
      // check for specific configuration values
      const hasConfig = Constants.expoConfig?.plugins?.some((plugin: any) => {
        if (typeof plugin === 'string') {
          return plugin.includes('google-signin');
        }
        if (Array.isArray(plugin) && plugin[0]) {
          return plugin[0].includes('google-signin');
        }
        return false;
      });

      return hasConfig || false;
    } catch (error) {
      return false;
    }
  }

  isExpoGo(): boolean {
    return this.detectRuntime() === 'expo-go';
  }

  isDevelopmentBuild(): boolean {
    return this.detectRuntime() === 'development-build';
  }

  isProduction(): boolean {
    return this.detectRuntime() === 'production';
  }

  isWeb(): boolean {
    return this.detectRuntime() === 'web';
  }

  async validateGoogleServicesConfiguration(): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    const envInfo = await this.detectEnvironment();

    // Check runtime environment
    if (envInfo.runtime === 'expo-go') {
      result.warnings.push('Ejecutándose en Expo Go - Google Sign-In nativo no está disponible');
      result.suggestions.push('Usa un Development Build para probar Google Sign-In nativo');
      result.suggestions.push('Como alternativa, usa autenticación email/password');
    }

    // Check Google Services file
    if (!envInfo.hasGoogleServicesFile && envInfo.runtime !== 'expo-go' && envInfo.runtime !== 'web') {
      result.isValid = false;
      result.errors.push('Archivos de configuración de Google Services no encontrados');
      result.suggestions.push('Descarga google-services.json desde Firebase Console para Android');
      result.suggestions.push('Descarga GoogleService-Info.plist desde Firebase Console para iOS');
      result.suggestions.push('Configura los plugins en app.json correctamente');
    }

    // Check Google Sign-In availability
    if (!envInfo.googleSignInAvailable && envInfo.runtime !== 'expo-go') {
      result.isValid = false;
      result.errors.push('Google Sign-In SDK no está disponible');
      result.suggestions.push('Instala @react-native-google-signin/google-signin');
      result.suggestions.push('Configura EAS Build para incluir dependencias nativas');
      result.suggestions.push('Crea un Development Build para testing');
    }

    // Platform-specific checks
    if (envInfo.platform === 'android' && !envInfo.deviceInfo.isDevice) {
      result.warnings.push('Google Sign-In puede no funcionar correctamente en emuladores Android');
      result.suggestions.push('Prueba en un dispositivo Android real para mejores resultados');
    }

    return result;
  }

  getEnvironmentSummary(): string {
    if (!this.environmentInfo) {
      return 'Información de entorno no disponible - ejecuta detectEnvironment() primero';
    }

    const { platform, runtime, googleSignInAvailable, hasGoogleServicesFile } = this.environmentInfo;
    
    let summary = `Plataforma: ${platform.toUpperCase()}\n`;
    summary += `Entorno: ${runtime.replace('-', ' ').toUpperCase()}\n`;
    summary += `Google Sign-In disponible: ${googleSignInAvailable ? 'SÍ' : 'NO'}\n`;
    summary += `Archivos de configuración: ${hasGoogleServicesFile ? 'SÍ' : 'NO'}\n`;

    if (runtime === 'expo-go') {
      summary += '\n⚠️  LIMITACIÓN: Expo Go no soporta Google Sign-In nativo\n';
      summary += '💡 SOLUCIÓN: Usa un Development Build o autenticación email/password\n';
    }

    return summary;
  }

  // Method to log environment info for debugging
  logEnvironmentInfo(): void {
    if (!this.environmentInfo) {
      console.log('🔍 Environment info not available - run detectEnvironment() first');
      return;
    }

    console.log('🔍 Environment Detection Results:');
    console.log('================================');
    console.log(`Platform: ${this.environmentInfo.platform}`);
    console.log(`Runtime: ${this.environmentInfo.runtime}`);
    console.log(`Google Sign-In Available: ${this.environmentInfo.googleSignInAvailable}`);
    console.log(`Google Services File: ${this.environmentInfo.hasGoogleServicesFile}`);
    console.log(`Device: ${this.environmentInfo.deviceInfo.isDevice ? 'Physical' : 'Simulator/Emulator'}`);
    console.log(`App Version: ${this.environmentInfo.buildInfo.appVersion}`);
    
    if (this.environmentInfo.runtime === 'expo-go') {
      console.log('⚠️  WARNING: Running in Expo Go - Native Google Sign-In not available');
    }
  }

  // Reset cached environment info (useful for testing)
  resetCache(): void {
    this.environmentInfo = null;
  }
}

export default EnvironmentService;