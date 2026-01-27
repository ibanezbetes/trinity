import { Platform } from 'react-native';
import Constants from 'expo-constants';
import EnvironmentService, { ValidationResult } from './environmentService';

export interface GoogleServicesConfig {
  android?: {
    projectId?: string;
    clientId?: string;
    apiKey?: string;
    appId?: string;
  };
  ios?: {
    projectId?: string;
    clientId?: string;
    apiKey?: string;
    appId?: string;
  };
  web?: {
    clientId?: string;
    apiKey?: string;
  };
}

export interface ConfigurationReport {
  overall: ValidationResult;
  androidConfig: ValidationResult;
  iosConfig: ValidationResult;
  webConfig: ValidationResult;
  appJsonConfig: ValidationResult;
  recommendations: string[];
  nextSteps: string[];
}

class ConfigurationValidator {
  private static instance: ConfigurationValidator;
  private environmentService: EnvironmentService;

  constructor() {
    this.environmentService = EnvironmentService.getInstance();
  }

  static getInstance(): ConfigurationValidator {
    if (!ConfigurationValidator.instance) {
      ConfigurationValidator.instance = new ConfigurationValidator();
    }
    return ConfigurationValidator.instance;
  }

  validateGoogleServicesJson(): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    if (Platform.OS !== 'android') {
      result.warnings.push('Validación de google-services.json solo aplica para Android');
      return result;
    }

    try {
      // Check if google-services.json configuration is available
      const hasAndroidConfig = this.checkAndroidConfiguration();
      
      if (!hasAndroidConfig) {
        result.isValid = false;
        result.errors.push('google-services.json no encontrado o mal configurado');
        result.suggestions.push('1. Descarga google-services.json desde Firebase Console');
        result.suggestions.push('2. Coloca el archivo en la carpeta raíz del proyecto mobile/');
        result.suggestions.push('3. Configura el plugin en app.json');
        result.suggestions.push('4. Reconstruye la aplicación con EAS Build');
      } else {
        result.suggestions.push('Configuración de Android parece correcta');
      }

      // Additional validations
      if (this.environmentService.isExpoGo()) {
        result.warnings.push('google-services.json no se usa en Expo Go');
        result.suggestions.push('Crea un Development Build para usar Google Services');
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Error validando google-services.json: ${error}`);
    }

    return result;
  }

  validateGoogleServicesPlist(): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    if (Platform.OS !== 'ios') {
      result.warnings.push('Validación de GoogleService-Info.plist solo aplica para iOS');
      return result;
    }

    try {
      // Check if GoogleService-Info.plist configuration is available
      const hasIosConfig = this.checkIosConfiguration();
      
      if (!hasIosConfig) {
        result.isValid = false;
        result.errors.push('GoogleService-Info.plist no encontrado o mal configurado');
        result.suggestions.push('1. Descarga GoogleService-Info.plist desde Firebase Console');
        result.suggestions.push('2. Coloca el archivo en la carpeta raíz del proyecto mobile/');
        result.suggestions.push('3. Configura el plugin en app.json');
        result.suggestions.push('4. Reconstruye la aplicación con EAS Build');
      } else {
        result.suggestions.push('Configuración de iOS parece correcta');
      }

      // Additional validations
      if (this.environmentService.isExpoGo()) {
        result.warnings.push('GoogleService-Info.plist no se usa en Expo Go');
        result.suggestions.push('Crea un Development Build para usar Google Services');
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Error validando GoogleService-Info.plist: ${error}`);
    }

    return result;
  }

  validateAppJsonConfiguration(): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    try {
      const expoConfig = Constants.expoConfig;
      
      if (!expoConfig) {
        result.isValid = false;
        result.errors.push('Configuración de Expo no encontrada');
        return result;
      }

      // Check for Google Sign-In plugin
      const hasGoogleSignInPlugin = this.checkGoogleSignInPlugin(expoConfig);
      
      if (!hasGoogleSignInPlugin) {
        result.isValid = false;
        result.errors.push('Plugin de Google Sign-In no configurado en app.json');
        result.suggestions.push('Agrega "@react-native-google-signin/google-signin" a plugins en app.json');
      }

      // Check for build properties plugin (needed for Google Services files)
      const hasBuildPropertiesPlugin = this.checkBuildPropertiesPlugin(expoConfig);
      
      if (!hasBuildPropertiesPlugin) {
        result.warnings.push('Plugin expo-build-properties no configurado');
        result.suggestions.push('Considera agregar expo-build-properties para configurar Google Services files');
      }

      // Check scheme configuration
      const hasScheme = expoConfig.scheme;
      if (!hasScheme) {
        result.warnings.push('URL scheme no configurado');
        result.suggestions.push('Configura un scheme único para deep linking');
      }

      // Platform-specific checks
      if (Platform.OS === 'android') {
        const androidConfig = expoConfig.android;
        if (!androidConfig?.package) {
          result.warnings.push('Package name de Android no configurado');
          result.suggestions.push('Configura android.package en app.json');
        }
      }

      if (Platform.OS === 'ios') {
        const iosConfig = expoConfig.ios;
        if (!iosConfig?.bundleIdentifier) {
          result.warnings.push('Bundle identifier de iOS no configurado');
          result.suggestions.push('Configura ios.bundleIdentifier en app.json');
        }
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Error validando app.json: ${error}`);
    }

    return result;
  }

  async generateConfigurationReport(): Promise<ConfigurationReport> {
    const envInfo = await this.environmentService.detectEnvironment();
    
    const androidConfig = this.validateGoogleServicesJson();
    const iosConfig = this.validateGoogleServicesPlist();
    const webConfig = this.validateWebConfiguration();
    const appJsonConfig = this.validateAppJsonConfiguration();

    // Overall validation
    const overall: ValidationResult = {
      isValid: androidConfig.isValid && iosConfig.isValid && webConfig.isValid && appJsonConfig.isValid,
      errors: [
        ...androidConfig.errors,
        ...iosConfig.errors,
        ...webConfig.errors,
        ...appJsonConfig.errors,
      ],
      warnings: [
        ...androidConfig.warnings,
        ...iosConfig.warnings,
        ...webConfig.warnings,
        ...appJsonConfig.warnings,
      ],
      suggestions: [
        ...androidConfig.suggestions,
        ...iosConfig.suggestions,
        ...webConfig.suggestions,
        ...appJsonConfig.suggestions,
      ],
    };

    // Generate recommendations based on environment
    const recommendations: string[] = [];
    const nextSteps: string[] = [];

    if (envInfo.runtime === 'expo-go') {
      recommendations.push('🔄 Migra a Development Build para usar Google Sign-In nativo');
      recommendations.push('📱 Usa autenticación email/password como alternativa en Expo Go');
      nextSteps.push('1. Configura EAS Build');
      nextSteps.push('2. Crea Development Build');
      nextSteps.push('3. Instala en dispositivo para testing');
    } else if (!envInfo.googleSignInAvailable) {
      recommendations.push('📦 Instala dependencias de Google Sign-In');
      recommendations.push('⚙️ Configura archivos de Google Services');
      nextSteps.push('1. npm install @react-native-google-signin/google-signin');
      nextSteps.push('2. Configura Firebase Console');
      nextSteps.push('3. Descarga archivos de configuración');
      nextSteps.push('4. Actualiza app.json');
      nextSteps.push('5. Reconstruye con EAS Build');
    } else if (overall.isValid) {
      recommendations.push('✅ Configuración parece correcta');
      recommendations.push('🧪 Procede con testing de Google Sign-In');
      nextSteps.push('1. Prueba Google Sign-In en dispositivo real');
      nextSteps.push('2. Valida integración con Cognito');
      nextSteps.push('3. Implementa manejo de errores');
    }

    return {
      overall,
      androidConfig,
      iosConfig,
      webConfig,
      appJsonConfig,
      recommendations,
      nextSteps,
    };
  }

  private checkAndroidConfiguration(): boolean {
    try {
      // Check if Android configuration is available in the build
      // This is a simplified check - in a real implementation, you might
      // want to check for specific configuration values
      const expoConfig = Constants.expoConfig;
      
      // Check for build properties plugin with Android config
      const hasBuildProperties = expoConfig?.plugins?.some((plugin: any) => {
        if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') {
          return plugin[1]?.android?.googleServicesFile;
        }
        return false;
      });

      return hasBuildProperties || false;
    } catch (error) {
      return false;
    }
  }

  private checkIosConfiguration(): boolean {
    try {
      // Check if iOS configuration is available in the build
      const expoConfig = Constants.expoConfig;
      
      // Check for build properties plugin with iOS config
      const hasBuildProperties = expoConfig?.plugins?.some((plugin: any) => {
        if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') {
          return plugin[1]?.ios?.googleServicesFile;
        }
        return false;
      });

      return hasBuildProperties || false;
    } catch (error) {
      return false;
    }
  }

  private validateWebConfiguration(): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    if (Platform.OS !== 'web') {
      result.warnings.push('Validación web solo aplica para plataforma web');
      return result;
    }

    // For web, we need different configuration
    result.suggestions.push('Para web, configura Google OAuth en Firebase Console');
    result.suggestions.push('Agrega dominio autorizado en OAuth settings');
    result.suggestions.push('Usa Google Sign-In JavaScript SDK para web');

    return result;
  }

  private checkGoogleSignInPlugin(expoConfig: any): boolean {
    return expoConfig?.plugins?.some((plugin: any) => {
      if (typeof plugin === 'string') {
        return plugin === '@react-native-google-signin/google-signin';
      }
      if (Array.isArray(plugin) && plugin[0]) {
        return plugin[0] === '@react-native-google-signin/google-signin';
      }
      return false;
    }) || false;
  }

  private checkBuildPropertiesPlugin(expoConfig: any): boolean {
    return expoConfig?.plugins?.some((plugin: any) => {
      if (typeof plugin === 'string') {
        return plugin === 'expo-build-properties';
      }
      if (Array.isArray(plugin) && plugin[0]) {
        return plugin[0] === 'expo-build-properties';
      }
      return false;
    }) || false;
  }

  // Utility method to print configuration report
  printConfigurationReport(report: ConfigurationReport): void {
    console.log('📋 Google Sign-In Configuration Report');
    console.log('=====================================');
    
    console.log(`\n🎯 Overall Status: ${report.overall.isValid ? '✅ VALID' : '❌ INVALID'}`);
    
    if (report.overall.errors.length > 0) {
      console.log('\n❌ Errors:');
      report.overall.errors.forEach(error => console.log(`  • ${error}`));
    }
    
    if (report.overall.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      report.overall.warnings.forEach(warning => console.log(`  • ${warning}`));
    }
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => console.log(`  ${rec}`));
    }
    
    if (report.nextSteps.length > 0) {
      console.log('\n📝 Next Steps:');
      report.nextSteps.forEach(step => console.log(`  ${step}`));
    }
  }
}

export default ConfigurationValidator;