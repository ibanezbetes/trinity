/**
 * FINAL Google + AWS Cognito Authentication Service
 * Implementación nativa segura que cumple con los requisitos de Google
 */

import { Auth } from 'aws-amplify';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface CognitoUser {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  provider: 'google';
  attributes: any;
}

export interface AuthResult {
  success: boolean;
  user?: CognitoUser;
  error?: string;
  canRetry?: boolean;
}

class FinalGoogleCognitoAuth {
  private isConfigured = false;

  /**
   * Configurar Google Sign-In con Web Client ID
   * IMPORTANTE: Usar Web Client ID, NO Android Client ID
   */
  async configure(): Promise<boolean> {
    if (this.isConfigured) {
      return true;
    }

    try {
      const config = Constants.expoConfig?.extra;
      
      // USAR WEB CLIENT ID (no Android Client ID)
      const webClientId = config?.googleWebClientId;
      
      if (!webClientId) {
        console.error('❌ Web Client ID no configurado');
        return false;
      }

      console.log('🔧 Configurando Google Sign-In...');
      console.log('- Web Client ID:', webClientId);
      console.log('- Platform:', Platform.OS);

      GoogleSignin.configure({
        webClientId: webClientId, // Web Client ID: 320120465080-4lf6l426q4ct2jn4mpgte9m5mbmlss7j.apps.googleusercontent.com
        offlineAccess: true,
        forceCodeForRefreshToken: true,
        accountName: '',
        iosClientId: config?.googleIosClientId,
        hostedDomain: '',
        loginHint: '',
        includeServerAuthCode: false,
        serverClientId: '',
        scopes: ['email', 'profile'],
        profileImageSize: 120,
      });

      this.isConfigured = true;
      console.log('✅ Google Sign-In configurado correctamente');
      return true;

    } catch (error) {
      console.error('❌ Error configurando Google Sign-In:', error);
      return false;
    }
  }

  /**
   * Sign-In completo: Google nativo → AWS Cognito
   */
  async signInWithGoogle(): Promise<AuthResult> {
    try {
      console.log('🚀 Iniciando Google Sign-In nativo...');

      // 1. Configurar si es necesario
      const configured = await this.configure();
      if (!configured) {
        return {
          success: false,
          error: 'No se pudo configurar Google Sign-In',
          canRetry: false,
        };
      }

      // 2. Verificar Google Play Services (Android)
      if (Platform.OS === 'android') {
        try {
          await GoogleSignin.hasPlayServices();
          console.log('✅ Google Play Services disponible');
        } catch (playServicesError: any) {
          console.error('❌ Google Play Services error:', playServicesError);
          return {
            success: false,
            error: 'Google Play Services no disponible',
            canRetry: true,
          };
        }
      }

      // 3. Realizar Google Sign-In nativo
      console.log('🔐 Ejecutando GoogleSignin.signIn()...');
      let googleUser;
      
      try {
        googleUser = await GoogleSignin.signIn();
        console.log('✅ Google Sign-In nativo exitoso');
        console.log('- Email:', googleUser.user.email);
        console.log('- Name:', googleUser.user.name);
      } catch (googleError: any) {
        console.error('❌ Google Sign-In error:', googleError);
        
        // Manejar DEVELOPER_ERROR específicamente
        if (googleError.message && googleError.message.includes('DEVELOPER_ERROR')) {
          return {
            success: false,
            error: 'DEVELOPER_ERROR: Configuración incorrecta. Verifica SHA-1 y Client IDs.',
            canRetry: false,
          };
        }

        // Manejar cancelación
        if (googleError.code === statusCodes.SIGN_IN_CANCELLED) {
          return {
            success: false,
            error: 'Inicio de sesión cancelado',
            canRetry: true,
          };
        }

        // Otros errores
        return {
          success: false,
          error: googleError.message || 'Error en Google Sign-In',
          canRetry: true,
        };
      }

      // 4. Validar que tenemos idToken
      if (!googleUser.idToken) {
        throw new Error('No se obtuvo idToken de Google');
      }

      console.log('🔑 ID Token obtenido de Google');

      // 5. Federar a AWS Cognito
      console.log('🔄 Federando a AWS Cognito...');
      
      try {
        // Usar Auth.federatedSignIn con el idToken de Google
        const cognitoUser = await Auth.federatedSignIn(
          'google', // Provider name
          { 
            token: googleUser.idToken,
            expires_at: Date.now() + 3600000 // 1 hora
          },
          {
            email: googleUser.user.email,
            name: googleUser.user.name,
            picture: googleUser.user.photo,
          }
        );

        console.log('✅ AWS Cognito federation exitosa');
        console.log('- Cognito User ID:', cognitoUser.attributes?.sub);
        console.log('- Email:', cognitoUser.attributes?.email);

        return {
          success: true,
          user: {
            userId: cognitoUser.attributes?.sub || cognitoUser.username,
            email: cognitoUser.attributes?.email || googleUser.user.email,
            name: cognitoUser.attributes?.name || googleUser.user.name,
            picture: cognitoUser.attributes?.picture || googleUser.user.photo,
            provider: 'google',
            attributes: cognitoUser.attributes,
          },
        };

      } catch (cognitoError: any) {
        console.error('❌ AWS Cognito federation error:', cognitoError);
        
        // Manejar errores específicos de Cognito
        if (cognitoError.code === 'NotAuthorizedException') {
          return {
            success: false,
            error: 'No autorizado para federated sign-in en Cognito',
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
      console.error('❌ Error general en signInWithGoogle:', error);
      return {
        success: false,
        error: error.message || 'Error desconocido',
        canRetry: true,
      };
    }
  }

  /**
   * Sign out completo
   */
  async signOut(): Promise<void> {
    try {
      console.log('🚪 Cerrando sesión...');

      // 1. Sign out de AWS Cognito
      await Auth.signOut();
      console.log('✅ AWS Cognito sign-out exitoso');

      // 2. Sign out de Google
      if (this.isConfigured) {
        await GoogleSignin.signOut();
        console.log('✅ Google sign-out exitoso');
      }

    } catch (error) {
      console.error('❌ Error en sign-out:', error);
      // No lanzar error - sign out debe siempre funcionar localmente
    }
  }

  /**
   * Obtener usuario actual de AWS Cognito
   */
  async getCurrentUser(): Promise<CognitoUser | null> {
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
        provider: 'google',
        attributes: cognitoUser.attributes,
      };

    } catch (error) {
      console.error('❌ Error obteniendo usuario actual:', error);
      return null;
    }
  }

  /**
   * Verificar si hay sesión activa
   */
  async isSignedIn(): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      return user !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtener información de configuración para debugging
   */
  getConfigInfo(): any {
    const config = Constants.expoConfig?.extra;
    return {
      webClientId: config?.googleWebClientId,
      androidClientId: config?.googleAndroidClientId,
      iosClientId: config?.googleIosClientId,
      cognitoUserPoolId: config?.cognitoUserPoolId,
      cognitoClientId: config?.cognitoClientId,
      cognitoRegion: config?.cognitoRegion,
    };
  }
}

// Export singleton
export const finalGoogleCognitoAuth = new FinalGoogleCognitoAuth();