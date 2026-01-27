import { Platform } from 'react-native';
import Constants from 'expo-constants';
import EnvironmentService from './environmentService';
import ConfigurationValidator from './configurationValidator';
import {
  AuthResult,
  AuthenticationStrategy,
  GoogleSignInConfig,
  GoogleSignInCapabilities,
  GoogleSignInError,
  SignInOptions,
  GoogleUser,
} from '../types/googleSignIn';

class GoogleSignInManager {
  private static instance: GoogleSignInManager;
  private environmentService: EnvironmentService;
  private configValidator: ConfigurationValidator;
  private currentStrategy: AuthenticationStrategy | null = null;
  private capabilities: GoogleSignInCapabilities | null = null;
  private config: GoogleSignInConfig;

  constructor() {
    this.environmentService = EnvironmentService.getInstance();
    this.configValidator = ConfigurationValidator.getInstance();
    
    // Default configuration from app.json
    this.config = {
      webClientId: Constants.expoConfig?.extra?.googleWebClientId || '',
      iosClientId: Constants.expoConfig?.extra?.googleIosClientId,
      androidClientId: Constants.expoConfig?.extra?.googleAndroidClientId,
      scopes: ['openid', 'profile', 'email'],
      offlineAccess: true,
    };
  }

  static getInstance(): GoogleSignInManager {
    if (!GoogleSignInManager.instance) {
      GoogleSignInManager.instance = new GoogleSignInManager();
    }
    return GoogleSignInManager.instance;
  }

  async initialize(): Promise<void> {
    try {
      console.log('🔧 Initializing Google Sign-In Manager...');
      
      // Detect environment and capabilities
      await this.detectCapabilities();
      
      // Select appropriate strategy
      await this.selectStrategy();
      
      // Configure the selected strategy
      if (this.currentStrategy && this.currentStrategy.configure) {
        await this.currentStrategy.configure();
      }
      
      console.log(`✅ Google Sign-In Manager initialized with strategy: ${this.currentStrategy?.name || 'none'}`);
      
    } catch (error) {
      console.error('❌ Failed to initialize Google Sign-In Manager:', error);
      throw error;
    }
  }

  async signIn(options?: SignInOptions): Promise<AuthResult> {
    try {
      if (!this.currentStrategy) {
        return {
          success: false,
          error: 'Google Sign-In no está disponible en este entorno',
          errorCode: GoogleSignInError.CONFIGURATION_ERROR,
        };
      }

      console.log(`🔐 Attempting sign in with strategy: ${this.currentStrategy.name}`);
      
      const result = await this.currentStrategy.signIn();
      
      if (result.success) {
        console.log('✅ Google Sign-In successful');
        // Log analytics event
        this.logAnalyticsEvent('google_signin_attempt', {
          strategy: this.currentStrategy.name,
          success: true,
          environment: this.capabilities?.environment || 'unknown',
        });
      } else {
        console.log('❌ Google Sign-In failed:', result.error);
        this.logAnalyticsEvent('google_signin_attempt', {
          strategy: this.currentStrategy.name,
          success: false,
          environment: this.capabilities?.environment || 'unknown',
          error: result.error,
        });
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Google Sign-In error:', error);
      return {
        success: false,
        error: `Error durante Google Sign-In: ${error}`,
        errorCode: GoogleSignInError.UNKNOWN_ERROR,
      };
    }
  }

  async signOut(): Promise<void> {
    try {
      if (this.currentStrategy) {
        await this.currentStrategy.signOut();
        console.log('✅ Google Sign-Out successful');
      }
    } catch (error) {
      console.error('❌ Google Sign-Out error:', error);
      throw error;
    }
  }

  async getCurrentUser(): Promise<GoogleUser | null> {
    try {
      if (!this.currentStrategy) {
        return null;
      }
      
      return await this.currentStrategy.getCurrentUser();
    } catch (error) {
      console.error('❌ Error getting current user:', error);
      return null;
    }
  }

  isAvailable(): boolean {
    return this.currentStrategy !== null;
  }

  getStrategy(): AuthenticationStrategy | null {
    return this.currentStrategy;
  }

  getCapabilities(): GoogleSignInCapabilities | null {
    return this.capabilities;
  }

  getConfig(): GoogleSignInConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<GoogleSignInConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  private async detectCapabilities(): Promise<void> {
    const envInfo = await this.environmentService.detectEnvironment();
    
    this.capabilities = {
      nativeSignInAvailable: envInfo.googleSignInAvailable && envInfo.runtime !== 'expo-go',
      webSignInAvailable: envInfo.platform === 'web' || envInfo.runtime === 'expo-go',
      playServicesAvailable: envInfo.platform === 'android' && envInfo.googleSignInAvailable,
      configurationValid: envInfo.hasGoogleServicesFile || envInfo.runtime === 'expo-go' || envInfo.platform === 'web',
      environment: envInfo.runtime,
    };

    console.log('🔍 Google Sign-In Capabilities:', this.capabilities);
  }

  private async selectStrategy(): Promise<void> {
    if (!this.capabilities) {
      throw new Error('Capabilities not detected. Call detectCapabilities() first.');
    }

    try {
      // Try to load strategies dynamically
      const strategies = await this.loadStrategies();
      
      // Select the best available strategy
      for (const strategy of strategies) {
        const isAvailable = await strategy.isAvailable();
        if (isAvailable) {
          this.currentStrategy = strategy;
          console.log(`✅ Selected strategy: ${strategy.name}`);
          return;
        }
      }
      
      console.log('⚠️  No Google Sign-In strategy available');
      this.currentStrategy = null;
      
    } catch (error) {
      console.error('❌ Error selecting strategy:', error);
      this.currentStrategy = null;
    }
  }

  private async loadStrategies(): Promise<AuthenticationStrategy[]> {
    const strategies: AuthenticationStrategy[] = [];
    
    try {
      // Try to load native strategy
      if (this.capabilities?.nativeSignInAvailable) {
        const { NativeGoogleSignIn } = await import('../services/auth-strategies/nativeGoogleSignIn');
        strategies.push(new NativeGoogleSignIn(this.config));
      }
      
      // Try to load web strategy
      if (this.capabilities?.webSignInAvailable) {
        const { WebGoogleSignIn } = await import('../services/auth-strategies/webGoogleSignIn');
        strategies.push(new WebGoogleSignIn(this.config));
      }
      
      // Always load fallback strategy
      const { FallbackEmailAuth } = await import('../services/auth-strategies/fallbackEmailAuth');
      strategies.push(new FallbackEmailAuth(this.config));
      
    } catch (error) {
      console.error('❌ Error loading strategies:', error);
      
      // If all else fails, at least load fallback
      try {
        const { FallbackEmailAuth } = await import('../services/auth-strategies/fallbackEmailAuth');
        strategies.push(new FallbackEmailAuth(this.config));
      } catch (fallbackError) {
        console.error('❌ Even fallback strategy failed to load:', fallbackError);
      }
    }
    
    return strategies;
  }

  // Utility method to get user-friendly status message
  getStatusMessage(): string {
    if (!this.capabilities) {
      return 'Google Sign-In no inicializado';
    }

    if (this.capabilities.environment === 'expo-go') {
      return 'Ejecutándose en Expo Go - Solo autenticación email/password disponible';
    }

    if (!this.capabilities.nativeSignInAvailable && !this.capabilities.webSignInAvailable) {
      return 'Google Sign-In no disponible - Verifica configuración';
    }

    if (this.currentStrategy) {
      return `Google Sign-In disponible (${this.currentStrategy.name})`;
    }

    return 'Google Sign-In configurándose...';
  }

  // Method to validate current configuration
  async validateConfiguration(): Promise<boolean> {
    try {
      const report = await this.configValidator.generateConfigurationReport();
      return report.overall.isValid;
    } catch (error) {
      console.error('❌ Configuration validation error:', error);
      return false;
    }
  }

  // Method to get detailed diagnostics
  async getDiagnostics(): Promise<any> {
    const envInfo = await this.environmentService.detectEnvironment();
    const configReport = await this.configValidator.generateConfigurationReport();
    
    return {
      environment: envInfo,
      capabilities: this.capabilities,
      configuration: configReport,
      currentStrategy: this.currentStrategy?.name || null,
      config: this.config,
      status: this.getStatusMessage(),
    };
  }

  // Analytics logging (placeholder - integrate with your analytics service)
  private logAnalyticsEvent(eventName: string, parameters: any): void {
    try {
      // TODO: Integrate with your analytics service (Firebase Analytics, etc.)
      console.log(`📊 Analytics Event: ${eventName}`, parameters);
    } catch (error) {
      console.error('❌ Analytics logging error:', error);
    }
  }

  // Method to handle fallback scenarios
  async handleFallback(reason: string): Promise<void> {
    console.log(`🔄 Handling fallback: ${reason}`);
    
    this.logAnalyticsEvent('google_signin_fallback', {
      reason,
      environment: this.capabilities?.environment || 'unknown',
      fallback_method: 'email_password',
    });

    // You can add additional fallback logic here
    // For example, showing a message to the user about using email/password
  }
}

export default GoogleSignInManager;