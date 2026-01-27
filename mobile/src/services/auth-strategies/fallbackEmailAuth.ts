import {
  AuthResult,
  AuthenticationStrategy,
  GoogleSignInConfig,
  GoogleSignInError,
  GoogleUser,
} from '../../types/googleSignIn';

export class FallbackEmailAuth implements AuthenticationStrategy {
  name = 'Fallback Email Authentication';
  private config: GoogleSignInConfig;
  private currentUser: GoogleUser | null = null;

  constructor(config: GoogleSignInConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    // Fallback authentication is always available
    return true;
  }

  async configure(): Promise<void> {
    // No configuration needed for fallback
    console.log('✅ Fallback Email Authentication configured (always available)');
  }

  async signIn(): Promise<AuthResult> {
    // This is a fallback strategy that doesn't actually perform Google Sign-In
    // Instead, it provides information about why Google Sign-In isn't available
    // and suggests using email/password authentication
    
    console.log('ℹ️  Fallback authentication triggered - Google Sign-In not available');
    
    return {
      success: false,
      error: 'Google Sign-In no está disponible en este entorno. Usa autenticación con email y contraseña.',
      errorCode: GoogleSignInError.CONFIGURATION_ERROR,
    };
  }

  async signOut(): Promise<void> {
    this.currentUser = null;
    console.log('✅ Fallback authentication signed out');
  }

  async getCurrentUser(): Promise<GoogleUser | null> {
    return this.currentUser;
  }

  // Method to provide helpful information about why Google Sign-In isn't available
  getUnavailabilityReason(): string {
    return 'Google Sign-In requiere un Development Build o Production Build. ' +
           'Actualmente estás ejecutando la aplicación en un entorno que no soporta ' +
           'Google Sign-In nativo. Usa autenticación con email y contraseña como alternativa.';
  }

  // Method to provide instructions for enabling Google Sign-In
  getEnableInstructions(): string[] {
    return [
      '1. Configura Firebase Console y descarga archivos de configuración',
      '2. Instala @react-native-google-signin/google-signin',
      '3. Configura plugins en app.json',
      '4. Crea un Development Build con EAS Build',
      '5. Instala el Development Build en tu dispositivo',
      '6. Prueba Google Sign-In en el Development Build',
    ];
  }

  // Method to check if we're in Expo Go
  isExpoGo(): boolean {
    try {
      const Constants = require('expo-constants');
      return Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
    } catch (error) {
      return false;
    }
  }

  // Method to provide environment-specific guidance
  getEnvironmentGuidance(): string {
    if (this.isExpoGo()) {
      return 'Estás ejecutando la aplicación en Expo Go. Google Sign-In nativo no está ' +
             'disponible en Expo Go debido a limitaciones de dependencias nativas. ' +
             'Para probar Google Sign-In, necesitas crear un Development Build.';
    }

    return 'Google Sign-In no está disponible en este entorno. Verifica que las ' +
           'dependencias estén instaladas correctamente y que los archivos de ' +
           'configuración de Google Services estén presentes.';
  }

  // Method to simulate a "successful" fallback authentication for testing
  async simulateEmailAuth(email: string, name: string): Promise<AuthResult> {
    // This is for testing purposes only - simulates what would happen
    // if the user successfully authenticated with email/password
    
    const user: GoogleUser = {
      id: `email_${Date.now()}`,
      name: name,
      email: email,
      photo: null,
      familyName: null,
      givenName: name.split(' ')[0] || name,
    };

    this.currentUser = user;

    return {
      success: true,
      user,
      // Note: These would normally come from your email/password auth system
      idToken: undefined,
      accessToken: undefined,
    };
  }

  // Method to provide fallback authentication options
  getFallbackOptions(): Array<{
    method: string;
    description: string;
    available: boolean;
  }> {
    return [
      {
        method: 'Email/Password',
        description: 'Autenticación tradicional con email y contraseña',
        available: true,
      },
      {
        method: 'AWS Cognito',
        description: 'Autenticación usando AWS Cognito (ya configurado)',
        available: true,
      },
      {
        method: 'Development Build',
        description: 'Crear Development Build para Google Sign-In nativo',
        available: true,
      },
    ];
  }

  // Method to log fallback usage for analytics
  logFallbackUsage(reason: string): void {
    try {
      console.log('📊 Fallback Authentication Used:', {
        reason,
        timestamp: new Date().toISOString(),
        environment: this.isExpoGo() ? 'expo-go' : 'unknown',
      });
      
      // TODO: Integrate with your analytics service
      // Analytics.track('google_signin_fallback', { reason, environment: ... });
      
    } catch (error) {
      console.error('❌ Error logging fallback usage:', error);
    }
  }

  // Method to provide user-friendly error messages
  getUserFriendlyMessage(): string {
    if (this.isExpoGo()) {
      return '🔄 Google Sign-In no está disponible en Expo Go.\n\n' +
             '💡 Opciones disponibles:\n' +
             '• Usa email y contraseña para iniciar sesión\n' +
             '• Crea un Development Build para probar Google Sign-In\n\n' +
             '📱 Para crear un Development Build:\n' +
             '1. Ejecuta: npx eas build --profile development\n' +
             '2. Instala el build en tu dispositivo\n' +
             '3. Prueba Google Sign-In en el build';
    }

    return '⚠️  Google Sign-In no está configurado correctamente.\n\n' +
           '💡 Verifica:\n' +
           '• Archivos de configuración de Google Services\n' +
           '• Dependencias de Google Sign-In instaladas\n' +
           '• Configuración en app.json\n\n' +
           '🔄 Mientras tanto, puedes usar email y contraseña.';
  }
}