import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { GoogleUserInfo as CognitoGoogleUserInfo, CognitoService, CognitoTokens } from '../../infrastructure/cognito/cognito.service';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
  given_name?: string;
  family_name?: string;
  locale?: string;
  hd?: string;
}

export interface GoogleTokenInfo {
  idToken: string;
  accessToken?: string;
}

export interface FederatedAuthResult {
  user: any;
  cognitoTokens: CognitoTokens;
  isNewUser: boolean;
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly googleClient: OAuth2Client | null;
  private readonly googleClientId: string | undefined;

  constructor(
    private configService: ConfigService,
    private multiTableService: MultiTableService,
    private cognitoService: CognitoService,
  ) {
    // Use GOOGLE_WEB_CLIENT_ID to match backend .env configuration
    this.googleClientId = this.configService.get('GOOGLE_WEB_CLIENT_ID', '230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com');
    
    if (!this.googleClientId || this.googleClientId === 'your_google_web_client_id_here') {
      this.logger.warn('⚠️ Google Client ID no configurado - Google Auth deshabilitado');
      this.googleClient = null;
    } else {
      this.googleClient = new OAuth2Client(this.googleClientId);
      this.logger.log(`✅ Google OAuth Client inicializado con Client ID: ${this.googleClientId}`);
    }
  }

  /**
   * Verificar token de Google y obtener información del usuario con validaciones de seguridad completas
   */
  async verifyGoogleToken(idToken: string): Promise<GoogleUserInfo> {
    if (!this.googleClient) {
      this.logger.error('🔒 Intento de verificación de token sin Google Client configurado');
      throw new UnauthorizedException({
        code: 'GOOGLE_AUTH_NOT_CONFIGURED',
        message: 'Google Auth no está configurado',
        userMessage: 'El servicio de Google Sign-In no está disponible temporalmente. Intenta con email y contraseña.',
        fallbackOptions: ['email_password'],
        retryable: false,
      });
    }

    // Validaciones de seguridad del token
    if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
      this.logger.error('🔒 Token de Google vacío o inválido recibido');
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_MISSING',
        message: 'Token de Google requerido',
        userMessage: 'No se recibió el token de Google. Intenta iniciar sesión nuevamente.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
      });
    }

    if (idToken === 'null' || idToken === 'undefined') {
      this.logger.error('🔒 Token de Google con valor literal null/undefined');
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_INVALID_FORMAT',
        message: 'Token de Google inválido',
        userMessage: 'El token de Google no es válido. Intenta iniciar sesión nuevamente.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
      });
    }

    // Validar formato básico de JWT
    const tokenParts = idToken.split('.');
    if (tokenParts.length !== 3) {
      this.logger.error('🔒 Token de Google no tiene formato JWT válido');
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_MALFORMED',
        message: 'Formato de token inválido',
        userMessage: 'El token de Google está malformado. Intenta iniciar sesión nuevamente.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
      });
    }

    try {
      // Log del intento de verificación (sin exponer el token completo)
      const tokenPrefix = idToken.substring(0, 20) + '...';
      this.logger.log(`🔐 Verificando token de Google: ${tokenPrefix}`);

      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleClientId!,
      });

      const payload = ticket.getPayload();
      
      if (!payload) {
        this.logger.error('🔒 Payload vacío en token de Google');
        throw new UnauthorizedException({
          code: 'GOOGLE_TOKEN_EMPTY_PAYLOAD',
          message: 'Token de Google inválido - payload vacío',
          userMessage: 'El token de Google no contiene información válida. Intenta iniciar sesión nuevamente.',
          fallbackOptions: ['retry_google', 'email_password'],
          retryable: true,
        });
      }

      // Validaciones de seguridad del payload
      await this.validateTokenPayload(payload);

      // Log de verificación exitosa
      this.logger.log(`✅ Token de Google verificado exitosamente para: ${payload.email}`);

      // Log de evento de seguridad
      this.logSecurityEvent('GOOGLE_TOKEN_VERIFIED', {
        email: payload.email,
        sub: payload.sub,
        audience: payload.aud,
        issuer: payload.iss,
        timestamp: new Date().toISOString(),
      });

      return {
        id: payload.sub!,
        email: payload.email!,
        name: payload.name || payload.email!.split('@')[0],
        picture: payload.picture,
        email_verified: payload.email_verified || false,
        given_name: payload.given_name,
        family_name: payload.family_name,
        locale: payload.locale,
        hd: payload.hd,
      };
    } catch (error) {
      return this.handleGoogleAuthError(error, idToken);
    }
  }

  /**
   * Manejar errores de autenticación de Google con mensajes específicos y opciones de fallback
   */
  private handleGoogleAuthError(error: any, idToken: string): never {
    // Log detallado del error de seguridad
    this.logger.error(`🔒 Error verificando token de Google: ${error.message}`);
    
    // Log de evento de seguridad fallido
    this.logSecurityEvent('GOOGLE_TOKEN_VERIFICATION_FAILED', {
      error: error.message,
      errorCode: error.code || 'UNKNOWN',
      tokenPrefix: idToken.substring(0, 20) + '...',
      timestamp: new Date().toISOString(),
    });

    // Si ya es un error estructurado, re-lanzarlo
    if (error instanceof UnauthorizedException && error.message && typeof error.message === 'object') {
      throw error;
    }

    // Clasificar tipos de errores específicos con mensajes amigables y opciones de fallback
    if (error.message.includes('Token used too late') || error.message.includes('expired')) {
      this.logger.error('🔒 Token de Google expirado detectado');
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_EXPIRED',
        message: 'Token de Google ha expirado',
        userMessage: 'Tu sesión de Google ha expirado. Inicia sesión nuevamente con Google o usa tu email y contraseña.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
        retryDelay: 0,
      });
    }
    
    if (error.message.includes('Wrong recipient') || error.message.includes('audience')) {
      this.logger.error('🔒 Audience inválida en token de Google');
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_WRONG_AUDIENCE',
        message: 'Token de Google no es para esta aplicación',
        userMessage: 'El token de Google no es válido para esta aplicación. Intenta iniciar sesión nuevamente.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
      });
    }

    if (error.message.includes('Invalid token signature') || error.message.includes('signature')) {
      this.logger.error('🔒 Firma de token de Google inválida');
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_INVALID_SIGNATURE',
        message: 'Firma de token de Google inválida',
        userMessage: 'El token de Google no es auténtico. Intenta iniciar sesión nuevamente.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
      });
    }

    if (error.message.includes('network') || error.message.includes('timeout') || error.message.includes('ENOTFOUND')) {
      this.logger.error('🔒 Error de red verificando token de Google');
      throw new UnauthorizedException({
        code: 'GOOGLE_VERIFICATION_NETWORK_ERROR',
        message: 'Error de red verificando token de Google',
        userMessage: 'Error de conexión al verificar con Google. Verifica tu conexión a internet e intenta nuevamente.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
        retryDelay: 3000,
      });
    }

    if (error.message.includes('rate limit') || error.message.includes('quota') || error.message.includes('too many')) {
      this.logger.error('🔒 Rate limit alcanzado en verificación de Google');
      throw new UnauthorizedException({
        code: 'GOOGLE_RATE_LIMIT_EXCEEDED',
        message: 'Rate limit de Google excedido',
        userMessage: 'Demasiados intentos de verificación. Espera unos minutos e intenta nuevamente.',
        fallbackOptions: ['email_password'],
        retryable: true,
        retryDelay: 60000, // 1 minuto
      });
    }

    if (error.message.includes('service unavailable') || error.message.includes('temporarily down')) {
      this.logger.error('🔒 Servicio de Google temporalmente no disponible');
      throw new UnauthorizedException({
        code: 'GOOGLE_SERVICE_UNAVAILABLE',
        message: 'Servicio de Google no disponible',
        userMessage: 'El servicio de Google no está disponible temporalmente. Intenta con email y contraseña o espera unos minutos.',
        fallbackOptions: ['email_password'],
        retryable: true,
        retryDelay: 30000, // 30 segundos
      });
    }

    if (error.message.includes('Invalid issuer') || error.message.includes('iss')) {
      this.logger.error('🔒 Issuer inválido en token de Google');
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_INVALID_ISSUER',
        message: 'Issuer de token de Google inválido',
        userMessage: 'El token de Google no proviene de una fuente válida. Intenta iniciar sesión nuevamente.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
      });
    }

    // Error genérico con opciones de fallback
    this.logger.error('🔒 Error genérico de verificación de Google');
    throw new UnauthorizedException({
      code: 'GOOGLE_TOKEN_VERIFICATION_FAILED',
      message: 'Token de Google inválido',
      userMessage: 'Error verificando tu cuenta de Google. Intenta iniciar sesión nuevamente o usa tu email y contraseña.',
      fallbackOptions: ['retry_google', 'email_password'],
      retryable: true,
      originalError: error.message,
    });
  }

  /**
   * Validar payload del token con verificaciones de seguridad completas
   */
  private async validateTokenPayload(payload: any): Promise<void> {
    // Validar audience (destinatario del token)
    if (payload.aud !== this.googleClientId!) {
      this.logger.error(`🔒 Audience inválida: esperada=${this.googleClientId}, recibida=${payload.aud}`);
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_WRONG_AUDIENCE',
        message: 'Token de Google no es para esta aplicación',
        userMessage: 'El token de Google no es válido para esta aplicación. Intenta iniciar sesión nuevamente.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
      });
    }

    // Validar issuer (emisor del token)
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!validIssuers.includes(payload.iss)) {
      this.logger.error(`🔒 Issuer inválido: ${payload.iss}`);
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_INVALID_ISSUER',
        message: 'Token de Google de issuer no válido',
        userMessage: 'El token de Google no proviene de una fuente válida. Intenta iniciar sesión nuevamente.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
      });
    }

    // Validar expiración con margen de seguridad
    const now = Math.floor(Date.now() / 1000);
    const securityMargin = 60; // 1 minuto de margen
    
    if (payload.exp && payload.exp < (now + securityMargin)) {
      const expirationTime = new Date(payload.exp * 1000).toISOString();
      this.logger.error(`🔒 Token expirado o próximo a expirar: exp=${expirationTime}, now=${new Date().toISOString()}`);
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_EXPIRED',
        message: 'Token de Google ha expirado',
        userMessage: 'Tu sesión de Google ha expirado. Inicia sesión nuevamente con Google o usa tu email y contraseña.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
        retryDelay: 0,
      });
    }

    // Validar issued at (iat) - no debe ser futuro
    if (payload.iat && payload.iat > (now + securityMargin)) {
      this.logger.error(`🔒 Token emitido en el futuro: iat=${payload.iat}, now=${now}`);
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_INVALID_TIMESTAMP',
        message: 'Token de Google con timestamp inválido',
        userMessage: 'El token de Google tiene una fecha inválida. Intenta iniciar sesión nuevamente.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
      });
    }

    // Validar campos requeridos
    if (!payload.sub || !payload.email) {
      this.logger.error('🔒 Token de Google sin campos requeridos (sub, email)');
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_INCOMPLETE',
        message: 'Token de Google incompleto',
        userMessage: 'El token de Google no contiene la información necesaria. Intenta iniciar sesión nuevamente.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
      });
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.email)) {
      this.logger.error(`🔒 Email inválido en token: ${payload.email}`);
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_INVALID_EMAIL',
        message: 'Email inválido en token de Google',
        userMessage: 'El email en tu cuenta de Google no es válido. Verifica tu cuenta de Google.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
      });
    }

    // Validar longitud de campos críticos
    if (payload.sub.length < 10 || payload.sub.length > 50) {
      this.logger.error(`🔒 Google ID (sub) con longitud inválida: ${payload.sub.length}`);
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_INVALID_ID',
        message: 'Google ID inválido',
        userMessage: 'El identificador de Google no es válido. Intenta iniciar sesión nuevamente.',
        fallbackOptions: ['retry_google', 'email_password'],
        retryable: true,
      });
    }

    // Log de validación exitosa
    this.logger.log(`🔐 Payload del token validado exitosamente para: ${payload.email}`);
  }

  /**
   * Registrar eventos de seguridad
   */
  private logSecurityEvent(eventType: string, details: Record<string, any>): void {
    const securityEvent = {
      type: eventType,
      timestamp: new Date().toISOString(),
      service: 'GoogleAuthService',
      details: {
        ...details,
        // No incluir información sensible en logs
        userAgent: 'backend-service',
        source: 'google-auth-verification',
      },
    };

    // Log estructurado para sistemas de monitoreo
    this.logger.log(`🔒 SECURITY_EVENT: ${JSON.stringify(securityEvent)}`);
  }

  /**
   * Crear o actualizar usuario desde información de Google
   */
  async createOrUpdateUserFromGoogle(googleUser: GoogleUserInfo): Promise<any> {
    try {
      // Buscar usuario existente por email
      const existingUsers = await this.multiTableService.scan('trinity-users-dev', {
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': googleUser.email,
        },
      });

      let user;
      
      if (existingUsers.length > 0) {
        // Usuario existe - actualizar información de Google
        user = existingUsers[0];
        
        this.logger.log(`Actualizando usuario existente: ${googleUser.email}`);
        
        await this.multiTableService.update('trinity-users-dev', { userId: user.userId }, {
          UpdateExpression: 'SET googleId = :googleId, isGoogleLinked = :isGoogleLinked, displayName = :displayName, avatarUrl = :avatarUrl, lastGoogleSync = :lastGoogleSync',
          ExpressionAttributeValues: {
            ':googleId': googleUser.id,
            ':isGoogleLinked': true,
            ':displayName': googleUser.name,
            ':avatarUrl': googleUser.picture || user.avatarUrl,
            ':lastGoogleSync': new Date().toISOString(),
          },
        });
        
        // Actualizar authProviders si no incluye 'google'
        const authProviders = user.authProviders || ['email'];
        if (!authProviders.includes('google')) {
          authProviders.push('google');
          
          await this.multiTableService.update('trinity-users-dev', { userId: user.userId }, {
            UpdateExpression: 'SET authProviders = :authProviders',
            ExpressionAttributeValues: {
              ':authProviders': authProviders,
            },
          });
        }
        
      } else {
        // Usuario nuevo - crear desde Google
        const userId = `google_${googleUser.id}`;
        
        this.logger.log(`Creando nuevo usuario desde Google: ${googleUser.email}`);
        
        await this.multiTableService.createUser({
          userId,
          email: googleUser.email,
          username: googleUser.email.split('@')[0],
          displayName: googleUser.name,
          avatarUrl: googleUser.picture,
          emailVerified: googleUser.email_verified,
          googleId: googleUser.id,
          isGoogleLinked: true,
          authProviders: ['google'],
          lastGoogleSync: new Date().toISOString(),
        });
        
        user = {
          userId,
          email: googleUser.email,
          username: googleUser.email.split('@')[0],
          displayName: googleUser.name,
          avatarUrl: googleUser.picture,
          emailVerified: googleUser.email_verified,
          googleId: googleUser.id,
          isGoogleLinked: true,
          authProviders: ['google'],
          lastGoogleSync: new Date().toISOString(),
        };
      }

      return {
        id: user.userId,
        sub: user.userId,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        phoneNumber: user.phoneNumber,
        googleId: user.googleId,
        isGoogleLinked: user.isGoogleLinked,
        authProviders: user.authProviders,
      };
      
    } catch (error) {
      this.logger.error(`Error creando/actualizando usuario desde Google: ${error.message}`);
      throw error;
    }
  }

  /**
   * Vincular cuenta de Google a usuario existente
   */
  async linkGoogleToExistingUser(userId: string, googleUser: GoogleUserInfo): Promise<void> {
    try {
      // Verificar que el usuario existe
      const user = await this.multiTableService.getUser(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Verificar que no hay otro usuario con este Google ID
      const existingGoogleUsers = await this.multiTableService.scan('trinity-users-dev', {
        FilterExpression: 'googleId = :googleId',
        ExpressionAttributeValues: {
          ':googleId': googleUser.id,
        },
      });

      if (existingGoogleUsers.length > 0 && existingGoogleUsers[0].userId !== userId) {
        throw new Error('Esta cuenta de Google ya está vinculada a otro usuario');
      }

      // Vincular Google al usuario
      const authProviders = user.authProviders || ['email'];
      if (!authProviders.includes('google')) {
        authProviders.push('google');
      }

      await this.multiTableService.update('trinity-users-dev', { userId }, {
        UpdateExpression: 'SET googleId = :googleId, isGoogleLinked = :isGoogleLinked, authProviders = :authProviders, lastGoogleSync = :lastGoogleSync',
        ExpressionAttributeValues: {
          ':googleId': googleUser.id,
          ':isGoogleLinked': true,
          ':authProviders': authProviders,
          ':lastGoogleSync': new Date().toISOString(),
        },
      });

      this.logger.log(`Cuenta de Google vinculada al usuario: ${userId}`);
      
    } catch (error) {
      this.logger.error(`Error vinculando Google al usuario ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Desvincular cuenta de Google de usuario
   */
  async unlinkGoogleFromUser(userId: string): Promise<void> {
    try {
      // Verificar que el usuario existe
      const user = await this.multiTableService.getUser(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Verificar que el usuario tiene otros métodos de autenticación
      const authProviders = user.authProviders || [];
      const nonGoogleProviders = authProviders.filter(provider => provider !== 'google');
      
      if (nonGoogleProviders.length === 0) {
        throw new Error('No se puede desvincular Google: es el único método de autenticación');
      }

      // Desvincular Google
      await this.multiTableService.update('trinity-users-dev', { userId }, {
        UpdateExpression: 'REMOVE googleId, lastGoogleSync SET isGoogleLinked = :isGoogleLinked, authProviders = :authProviders',
        ExpressionAttributeValues: {
          ':isGoogleLinked': false,
          ':authProviders': nonGoogleProviders,
        },
      });

      this.logger.log(`Cuenta de Google desvinculada del usuario: ${userId}`);
      
    } catch (error) {
      this.logger.error(`Error desvinculando Google del usuario ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sincronizar información de perfil desde Google
   */
  async syncProfileFromGoogle(userId: string, googleUser: GoogleUserInfo): Promise<void> {
    try {
      await this.multiTableService.update('trinity-users-dev', { userId }, {
        UpdateExpression: 'SET displayName = :displayName, avatarUrl = :avatarUrl, lastGoogleSync = :lastGoogleSync',
        ExpressionAttributeValues: {
          ':displayName': googleUser.name,
          ':avatarUrl': googleUser.picture,
          ':lastGoogleSync': new Date().toISOString(),
        },
      });

      this.logger.log(`Perfil sincronizado desde Google para usuario: ${userId}`);
      
    } catch (error) {
      this.logger.error(`Error sincronizando perfil desde Google: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verificar si Google Auth está disponible
   */
  isGoogleAuthAvailable(): boolean {
    return !!this.googleClient;
  }

  // ==================== MÉTODOS DE AUTENTICACIÓN FEDERADA CON COGNITO ====================

  /**
   * Autenticar con Google usando Cognito Identity Pool con validaciones de seguridad
   */
  async authenticateWithGoogleFederated(idToken: string): Promise<FederatedAuthResult> {
    try {
      // Log del inicio de autenticación federada
      this.logger.log('🔐 Iniciando autenticación federada con Google...');
      
      // Verificar token de Google con validaciones de seguridad completas
      const googleUser = await this.verifyGoogleToken(idToken);
      
      // Validaciones adicionales de seguridad para federación
      await this.validateFederatedAuthSecurity(googleUser, idToken);
      
      // Convertir a formato compatible con Cognito
      const cognitoGoogleUser: CognitoGoogleUserInfo = {
        sub: googleUser.id,
        email: googleUser.email,
        email_verified: googleUser.email_verified,
        name: googleUser.name,
        given_name: googleUser.given_name,
        family_name: googleUser.family_name,
        picture: googleUser.picture,
        locale: googleUser.locale,
        hd: googleUser.hd,
      };

      // Intercambiar token de Google por tokens de Cognito con validación
      const cognitoTokens = await this.exchangeTokenWithValidation(idToken, googleUser);
      
      // Crear o actualizar usuario federado con validaciones
      const federatedUser = await this.createOrUpdateFederatedUserSecure(cognitoGoogleUser);
      
      // Log de evento de seguridad exitoso
      this.logSecurityEvent('FEDERATED_AUTH_SUCCESS', {
        email: googleUser.email,
        sub: googleUser.id,
        isNewUser: !federatedUser.existingUser,
        provider: 'google',
        cognitoTokensGenerated: true,
      });
      
      this.logger.log(`✅ Autenticación federada exitosa para: ${googleUser.email}`);
      
      return {
        user: federatedUser,
        cognitoTokens,
        isNewUser: !federatedUser.existingUser,
      };
      
    } catch (error) {
      return this.handleFederatedAuthError(error, idToken);
    }
  }

  /**
   * Manejar errores de autenticación federada con opciones de fallback
   */
  private handleFederatedAuthError(error: any, idToken: string): never {
    // Log de evento de seguridad fallido
    this.logSecurityEvent('FEDERATED_AUTH_FAILED', {
      error: error.message,
      errorType: error.constructor.name,
      errorCode: error.code || 'UNKNOWN',
      timestamp: new Date().toISOString(),
    });
    
    this.logger.error(`🔒 Error en autenticación federada: ${error.message}`);

    // Si ya es un error estructurado de Google Auth, re-lanzarlo con contexto federado
    if (error instanceof UnauthorizedException && error.message && typeof error.message === 'object') {
      const googleError = error.message as any;
      throw new UnauthorizedException({
        ...googleError,
        context: 'federated_auth',
        fallbackOptions: [...(googleError.fallbackOptions || []), 'legacy_google_auth'],
      });
    }

    // Errores específicos de federación
    if (error.message.includes('Identity Pool') || error.message.includes('IdentityPoolId')) {
      throw new UnauthorizedException({
        code: 'COGNITO_IDENTITY_POOL_ERROR',
        message: 'Error de configuración de Identity Pool',
        userMessage: 'Error de configuración del servicio. Intenta con email y contraseña.',
        fallbackOptions: ['email_password', 'legacy_google_auth'],
        retryable: false,
        context: 'federated_auth',
      });
    }

    if (error.message.includes('Cognito Identity authentication failed')) {
      throw new UnauthorizedException({
        code: 'COGNITO_IDENTITY_AUTH_FAILED',
        message: 'Autenticación con Cognito Identity falló',
        userMessage: 'Error conectando con el servicio de autenticación. Intenta nuevamente o usa email y contraseña.',
        fallbackOptions: ['retry_federated', 'legacy_google_auth', 'email_password'],
        retryable: true,
        retryDelay: 5000,
        context: 'federated_auth',
      });
    }

    if (error.message.includes('AWS credentials')) {
      throw new UnauthorizedException({
        code: 'AWS_CREDENTIALS_ERROR',
        message: 'Error de credenciales AWS',
        userMessage: 'Error de configuración del servicio. Intenta con email y contraseña.',
        fallbackOptions: ['email_password', 'legacy_google_auth'],
        retryable: false,
        context: 'federated_auth',
      });
    }

    if (error.message.includes('ResourceNotFoundException')) {
      throw new UnauthorizedException({
        code: 'COGNITO_RESOURCE_NOT_FOUND',
        message: 'Recurso de Cognito no encontrado',
        userMessage: 'Servicio de autenticación no disponible. Intenta con email y contraseña.',
        fallbackOptions: ['email_password', 'legacy_google_auth'],
        retryable: false,
        context: 'federated_auth',
      });
    }

    // Error genérico de federación
    throw new UnauthorizedException({
      code: 'FEDERATED_AUTH_GENERIC_ERROR',
      message: 'Error en autenticación federada',
      userMessage: 'Error en la autenticación con Google. Intenta nuevamente o usa email y contraseña.',
      fallbackOptions: ['retry_federated', 'legacy_google_auth', 'email_password'],
      retryable: true,
      retryDelay: 3000,
      context: 'federated_auth',
      originalError: error.message,
    });
  }

  /**
   * Validar seguridad específica para autenticación federada
   */
  private async validateFederatedAuthSecurity(googleUser: GoogleUserInfo, idToken: string): Promise<void> {
    // Validar que el email esté verificado por Google
    if (!googleUser.email_verified) {
      this.logger.error(`🔒 Email no verificado en Google para: ${googleUser.email}`);
      throw new UnauthorizedException({
        code: 'GOOGLE_EMAIL_NOT_VERIFIED',
        message: 'Email no verificado por Google',
        userMessage: 'Tu email no está verificado en Google. Verifica tu email en Google e intenta nuevamente.',
        fallbackOptions: ['email_password'],
        retryable: false,
        context: 'federated_auth_security',
      });
    }

    // Validar dominio si está configurado (para organizaciones)
    const allowedDomains = this.configService.get('GOOGLE_ALLOWED_DOMAINS');
    if (allowedDomains) {
      const domains = allowedDomains.split(',').map(d => d.trim());
      const emailDomain = googleUser.email.split('@')[1];
      
      if (!domains.includes(emailDomain)) {
        this.logger.error(`🔒 Dominio no permitido: ${emailDomain}`);
        throw new UnauthorizedException({
          code: 'GOOGLE_DOMAIN_NOT_ALLOWED',
          message: 'Dominio de email no permitido',
          userMessage: `El dominio ${emailDomain} no está permitido. Usa una cuenta de los dominios autorizados o email y contraseña.`,
          fallbackOptions: ['email_password'],
          retryable: false,
          context: 'federated_auth_security',
        });
      }
    }

    // Validar que no sea una cuenta de servicio o bot
    if (googleUser.email.includes('noreply') || googleUser.email.includes('service-account')) {
      this.logger.error(`🔒 Intento de login con cuenta de servicio: ${googleUser.email}`);
      throw new UnauthorizedException({
        code: 'GOOGLE_SERVICE_ACCOUNT_NOT_ALLOWED',
        message: 'Cuentas de servicio no permitidas',
        userMessage: 'Las cuentas de servicio no están permitidas. Usa una cuenta personal de Google o email y contraseña.',
        fallbackOptions: ['email_password'],
        retryable: false,
        context: 'federated_auth_security',
      });
    }

    // Validar límites de rate limiting por usuario
    await this.validateUserRateLimit(googleUser.email);

    this.logger.log(`🔐 Validaciones de seguridad federada completadas para: ${googleUser.email}`);
  }

  /**
   * Intercambiar token con validaciones adicionales
   */
  private async exchangeTokenWithValidation(googleToken: string, googleUser: GoogleUserInfo): Promise<CognitoTokens> {
    try {
      // Validar que Cognito esté configurado correctamente
      if (!this.cognitoService.validateProviderConfiguration()) {
        throw new UnauthorizedException({
          code: 'COGNITO_FEDERATION_NOT_CONFIGURED',
          message: 'Cognito federated authentication not properly configured',
          userMessage: 'El servicio de Google Sign-In no está configurado correctamente. Intenta con email y contraseña.',
          fallbackOptions: ['email_password', 'legacy_google_auth'],
          retryable: false,
          context: 'token_exchange',
        });
      }

      // Intercambiar token
      const cognitoTokens = await this.cognitoService.exchangeGoogleTokenForCognito(googleToken);
      
      // Validar que los tokens de Cognito sean válidos
      if (!cognitoTokens.accessToken || !cognitoTokens.idToken) {
        throw new UnauthorizedException({
          code: 'COGNITO_INVALID_TOKENS_RECEIVED',
          message: 'Invalid Cognito tokens received',
          userMessage: 'Error generando tokens de sesión. Intenta nuevamente.',
          fallbackOptions: ['retry_federated', 'legacy_google_auth', 'email_password'],
          retryable: true,
          retryDelay: 3000,
          context: 'token_exchange',
        });
      }

      // Validar consistencia entre tokens
      const isConsistent = await this.validateTokenConsistency(googleToken, cognitoTokens);
      if (!isConsistent) {
        this.logger.error(`🔒 Inconsistencia detectada entre tokens Google y Cognito para: ${googleUser.email}`);
        throw new UnauthorizedException({
          code: 'TOKEN_CONSISTENCY_VALIDATION_FAILED',
          message: 'Token consistency validation failed',
          userMessage: 'Error de validación de tokens. Intenta iniciar sesión nuevamente.',
          fallbackOptions: ['retry_federated', 'legacy_google_auth', 'email_password'],
          retryable: true,
          retryDelay: 2000,
          context: 'token_exchange',
        });
      }

      this.logger.log(`🔐 Intercambio de tokens validado exitosamente para: ${googleUser.email}`);
      return cognitoTokens;
      
    } catch (error) {
      return this.handleTokenExchangeError(error, googleUser);
    }
  }

  /**
   * Manejar errores específicos del intercambio de tokens
   */
  private handleTokenExchangeError(error: any, googleUser: GoogleUserInfo): never {
    this.logger.error(`🔒 Error en intercambio de tokens: ${error.message}`);

    // Si ya es un error estructurado, re-lanzarlo
    if (error instanceof UnauthorizedException && error.message && typeof error.message === 'object') {
      throw error;
    }

    // Errores específicos de Cognito
    if (error.message.includes('InvalidParameterException')) {
      throw new UnauthorizedException({
        code: 'COGNITO_INVALID_PARAMETER',
        message: 'Parámetro inválido en Cognito',
        userMessage: 'Error de configuración del servicio. Intenta con email y contraseña.',
        fallbackOptions: ['email_password', 'legacy_google_auth'],
        retryable: false,
        context: 'token_exchange',
      });
    }

    if (error.message.includes('NotAuthorizedException')) {
      throw new UnauthorizedException({
        code: 'COGNITO_NOT_AUTHORIZED',
        message: 'No autorizado por Cognito',
        userMessage: 'Tu cuenta de Google no está autorizada para esta aplicación. Contacta al soporte.',
        fallbackOptions: ['email_password'],
        retryable: false,
        context: 'token_exchange',
      });
    }

    if (error.message.includes('network') || error.message.includes('timeout')) {
      throw new UnauthorizedException({
        code: 'COGNITO_NETWORK_ERROR',
        message: 'Error de red con Cognito',
        userMessage: 'Error de conexión con el servicio de autenticación. Verifica tu conexión e intenta nuevamente.',
        fallbackOptions: ['retry_federated', 'email_password'],
        retryable: true,
        retryDelay: 5000,
        context: 'token_exchange',
      });
    }

    // Error genérico de intercambio
    throw new UnauthorizedException({
      code: 'TOKEN_EXCHANGE_FAILED',
      message: 'Error en intercambio de tokens',
      userMessage: 'Error procesando la autenticación con Google. Intenta nuevamente o usa email y contraseña.',
      fallbackOptions: ['retry_federated', 'legacy_google_auth', 'email_password'],
      retryable: true,
      retryDelay: 3000,
      context: 'token_exchange',
      originalError: error.message,
    });
  }

  /**
   * Crear o actualizar usuario federado con validaciones de seguridad
   */
  private async createOrUpdateFederatedUserSecure(googleUser: CognitoGoogleUserInfo): Promise<any> {
    try {
      // Validar datos del usuario antes de procesar
      this.validateUserData(googleUser);
      
      // Buscar usuario existente con validaciones
      const existingUserByEmail = await this.findUserByEmailSecure(googleUser.email);
      const existingUserByGoogleId = await this.findUserByGoogleIdSecure(googleUser.sub);
      
      // Validar conflictos de identidad
      await this.validateIdentityConflicts(existingUserByEmail, existingUserByGoogleId, googleUser);
      
      let user;
      let isExistingUser = false;
      
      if (existingUserByGoogleId) {
        // Usuario existe con este Google ID - actualizar con validaciones
        user = existingUserByGoogleId;
        isExistingUser = true;
        
        this.logger.log(`🔐 Actualizando usuario federado existente: ${googleUser.email}`);
        await this.updateFederatedUserProfileSecure(user.userId, googleUser);
        
      } else if (existingUserByEmail) {
        // Usuario existe con este email pero sin Google ID - vincular con validaciones
        user = existingUserByEmail;
        isExistingUser = true;
        
        this.logger.log(`🔐 Vinculando Google a usuario existente: ${googleUser.email}`);
        await this.linkGoogleToExistingUserFederatedSecure(user.userId, googleUser);
        
      } else {
        // Usuario nuevo - crear con validaciones
        this.logger.log(`🔐 Creando nuevo usuario federado: ${googleUser.email}`);
        user = await this.createNewFederatedUserSecure(googleUser);
        isExistingUser = false;
      }

      // Crear usuario federado en Cognito con manejo de errores
      await this.createCognitoFederatedUserSafe(googleUser);

      return {
        ...user,
        existingUser: isExistingUser,
      };
      
    } catch (error) {
      this.logger.error(`🔒 Error creando/actualizando usuario federado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validar datos del usuario Google
   */
  private validateUserData(googleUser: CognitoGoogleUserInfo): void {
    if (!googleUser.email || !googleUser.sub || !googleUser.name) {
      throw new Error('Datos de usuario Google incompletos');
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(googleUser.email)) {
      throw new Error('Formato de email inválido');
    }

    // Validar longitud de campos
    if (googleUser.name.length > 100 || googleUser.sub.length > 50) {
      throw new Error('Datos de usuario con longitud inválida');
    }
  }

  /**
   * Validar conflictos de identidad
   */
  private async validateIdentityConflicts(
    existingUserByEmail: any,
    existingUserByGoogleId: any,
    googleUser: CognitoGoogleUserInfo
  ): Promise<void> {
    // Si hay usuario con el mismo email pero diferente Google ID
    if (existingUserByEmail && existingUserByGoogleId && 
        existingUserByEmail.userId !== existingUserByGoogleId.userId) {
      this.logger.error(`🔒 Conflicto de identidad detectado para: ${googleUser.email}`);
      throw new ConflictException('Conflicto de identidad: email y Google ID pertenecen a usuarios diferentes');
    }

    // Si hay usuario con el mismo Google ID pero diferente email
    if (existingUserByGoogleId && existingUserByGoogleId.email !== googleUser.email) {
      this.logger.error(`🔒 Google ID vinculado a email diferente: ${existingUserByGoogleId.email} vs ${googleUser.email}`);
      throw new ConflictException('Google ID ya vinculado a email diferente');
    }
  }

  /**
   * Crear usuario federado en Cognito de forma segura
   */
  private async createCognitoFederatedUserSafe(googleUser: CognitoGoogleUserInfo): Promise<void> {
    try {
      await this.cognitoService.createFederatedUser(googleUser);
    } catch (error) {
      // Si ya existe en Cognito, continuar (no es error crítico)
      if (error.message.includes('UsernameExistsException') || 
          error.message.includes('already exists')) {
        this.logger.log(`Usuario federado ya existe en Cognito: ${googleUser.email}`);
      } else {
        this.logger.warn(`🔒 Error creando usuario federado en Cognito: ${error.message}`);
        // No lanzar error aquí para no bloquear el flujo principal
      }
    }
  }

  /**
   * Validar rate limiting por usuario
   */
  private async validateUserRateLimit(email: string): Promise<void> {
    // Implementación básica de rate limiting
    // En producción, esto debería usar Redis o similar
    const rateLimitKey = `google_auth_${email}`;
    const maxAttempts = 10;
    const windowMinutes = 15;
    
    // Por ahora, solo log de la validación
    this.logger.log(`🔐 Validando rate limit para: ${email}`);
    
    // TODO: Implementar rate limiting real con Redis
    // const attempts = await redis.get(rateLimitKey);
    // if (attempts && parseInt(attempts) > maxAttempts) {
    //   throw new UnauthorizedException('Demasiados intentos de autenticación');
    // }
  }

  /**
   * Buscar usuario por email con validaciones de seguridad
   */
  private async findUserByEmailSecure(email: string): Promise<any> {
    try {
      // Validar formato de email antes de buscar
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Formato de email inválido para búsqueda');
      }

      return await this.findUserByEmail(email);
    } catch (error) {
      this.logger.error(`🔒 Error buscando usuario por email: ${error.message}`);
      return null;
    }
  }

  /**
   * Buscar usuario por Google ID con validaciones de seguridad
   */
  private async findUserByGoogleIdSecure(googleId: string): Promise<any> {
    try {
      // Validar formato de Google ID
      if (!googleId || googleId.length < 10 || googleId.length > 50) {
        throw new Error('Google ID inválido para búsqueda');
      }

      return await this.findUserByGoogleId(googleId);
    } catch (error) {
      this.logger.error(`🔒 Error buscando usuario por Google ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Actualizar perfil de usuario federado con validaciones
   */
  private async updateFederatedUserProfileSecure(userId: string, googleUser: CognitoGoogleUserInfo): Promise<void> {
    try {
      // Validar que el usuario existe
      const existingUser = await this.multiTableService.getUser(userId);
      if (!existingUser) {
        throw new Error('Usuario no encontrado para actualización');
      }

      // Validar que los datos no han cambiado de forma sospechosa
      if (existingUser.email !== googleUser.email) {
        this.logger.warn(`🔒 Cambio de email detectado: ${existingUser.email} -> ${googleUser.email}`);
        // En producción, esto podría requerir verificación adicional
      }

      await this.updateFederatedUserProfile(userId, googleUser);
      
      this.logger.log(`🔐 Perfil federado actualizado de forma segura: ${userId}`);
      
    } catch (error) {
      this.logger.error(`🔒 Error actualizando perfil federado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Vincular Google a usuario existente con validaciones de seguridad
   */
  private async linkGoogleToExistingUserFederatedSecure(userId: string, googleUser: CognitoGoogleUserInfo): Promise<void> {
    try {
      // Validaciones adicionales antes de vincular
      const existingUser = await this.multiTableService.getUser(userId);
      if (!existingUser) {
        throw new Error('Usuario no encontrado para vinculación');
      }

      // Verificar que no hay conflictos de email
      if (existingUser.email !== googleUser.email) {
        this.logger.error(`🔒 Conflicto de email en vinculación: ${existingUser.email} vs ${googleUser.email}`);
        throw new ConflictException('Email del usuario no coincide con email de Google');
      }

      await this.linkGoogleToExistingUserFederated(userId, googleUser);
      
      this.logger.log(`🔐 Google vinculado de forma segura al usuario: ${userId}`);
      
    } catch (error) {
      this.logger.error(`🔒 Error vinculando Google de forma segura: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crear nuevo usuario federado con validaciones de seguridad
   */
  private async createNewFederatedUserSecure(googleUser: CognitoGoogleUserInfo): Promise<any> {
    try {
      // Validar que no existe usuario con este email o Google ID
      const existingByEmail = await this.findUserByEmailSecure(googleUser.email);
      const existingByGoogleId = await this.findUserByGoogleIdSecure(googleUser.sub);
      
      if (existingByEmail || existingByGoogleId) {
        throw new ConflictException('Usuario ya existe con este email o Google ID');
      }

      const newUser = await this.createNewFederatedUser(googleUser);
      
      this.logger.log(`🔐 Nuevo usuario federado creado de forma segura: ${googleUser.email}`);
      
      return newUser;
      
    } catch (error) {
      this.logger.error(`🔒 Error creando nuevo usuario federado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crear o actualizar usuario federado en el sistema
   */
  async createOrUpdateFederatedUser(googleUser: CognitoGoogleUserInfo): Promise<any> {
    try {
      // Buscar usuario existente por email o Google ID
      const existingUserByEmail = await this.findUserByEmail(googleUser.email);
      const existingUserByGoogleId = await this.findUserByGoogleId(googleUser.sub);
      
      let user;
      let isExistingUser = false;
      
      if (existingUserByGoogleId) {
        // Usuario existe con este Google ID - actualizar
        user = existingUserByGoogleId;
        isExistingUser = true;
        
        this.logger.log(`Actualizando usuario federado existente: ${googleUser.email}`);
        
        await this.updateFederatedUserProfile(user.userId, googleUser);
        
      } else if (existingUserByEmail) {
        // Usuario existe con este email pero sin Google ID - vincular
        user = existingUserByEmail;
        isExistingUser = true;
        
        this.logger.log(`Vinculando Google a usuario existente: ${googleUser.email}`);
        
        await this.linkGoogleToExistingUserFederated(user.userId, googleUser);
        
      } else {
        // Usuario nuevo - crear
        this.logger.log(`Creando nuevo usuario federado: ${googleUser.email}`);
        
        user = await this.createNewFederatedUser(googleUser);
        isExistingUser = false;
      }

      // Crear usuario federado en Cognito si no existe
      try {
        await this.cognitoService.createFederatedUser(googleUser);
      } catch (error) {
        // Si ya existe en Cognito, continuar
        if (!error.message.includes('UsernameExistsException')) {
          this.logger.warn(`Error creando usuario federado en Cognito: ${error.message}`);
        }
      }

      return {
        ...user,
        existingUser: isExistingUser,
      };
      
    } catch (error) {
      this.logger.error(`Error creando/actualizando usuario federado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crear nuevo usuario federado
   */
  private async createNewFederatedUser(googleUser: CognitoGoogleUserInfo): Promise<any> {
    const userId = `google_${googleUser.sub}`;
    
    const userData = {
      userId,
      email: googleUser.email,
      username: googleUser.email.split('@')[0],
      displayName: googleUser.name,
      avatarUrl: googleUser.picture,
      emailVerified: googleUser.email_verified,
      googleId: googleUser.sub,
      isGoogleLinked: true,
      authProviders: ['google'],
      lastGoogleSync: new Date().toISOString(),
      federatedIdentity: {
        provider: 'google',
        providerId: googleUser.sub,
        attributes: {
          given_name: googleUser.given_name,
          family_name: googleUser.family_name,
          locale: googleUser.locale,
          hd: googleUser.hd,
        },
      },
    };

    await this.multiTableService.createUser(userData);
    
    return userData;
  }

  /**
   * Actualizar perfil de usuario federado
   */
  private async updateFederatedUserProfile(userId: string, googleUser: CognitoGoogleUserInfo): Promise<void> {
    await this.multiTableService.update('trinity-users-dev', { userId }, {
      UpdateExpression: `
        SET displayName = :displayName, 
            avatarUrl = :avatarUrl, 
            lastGoogleSync = :lastGoogleSync,
            emailVerified = :emailVerified,
            federatedIdentity = :federatedIdentity
      `,
      ExpressionAttributeValues: {
        ':displayName': googleUser.name,
        ':avatarUrl': googleUser.picture || null,
        ':lastGoogleSync': new Date().toISOString(),
        ':emailVerified': googleUser.email_verified,
        ':federatedIdentity': {
          provider: 'google',
          providerId: googleUser.sub,
          attributes: {
            given_name: googleUser.given_name,
            family_name: googleUser.family_name,
            locale: googleUser.locale,
            hd: googleUser.hd,
          },
        },
      },
    });
  }

  /**
   * Vincular Google a usuario existente (versión federada)
   */
  private async linkGoogleToExistingUserFederated(userId: string, googleUser: CognitoGoogleUserInfo): Promise<void> {
    // Verificar que no hay otro usuario con este Google ID
    const existingGoogleUser = await this.findUserByGoogleId(googleUser.sub);
    if (existingGoogleUser && existingGoogleUser.userId !== userId) {
      throw new ConflictException('Esta cuenta de Google ya está vinculada a otro usuario');
    }

    // Obtener usuario actual
    const user = await this.multiTableService.getUser(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Actualizar authProviders
    const authProviders = user.authProviders || ['email'];
    if (!authProviders.includes('google')) {
      authProviders.push('google');
    }

    await this.multiTableService.update('trinity-users-dev', { userId }, {
      UpdateExpression: `
        SET googleId = :googleId, 
            isGoogleLinked = :isGoogleLinked, 
            authProviders = :authProviders, 
            lastGoogleSync = :lastGoogleSync,
            federatedIdentity = :federatedIdentity
      `,
      ExpressionAttributeValues: {
        ':googleId': googleUser.sub,
        ':isGoogleLinked': true,
        ':authProviders': authProviders,
        ':lastGoogleSync': new Date().toISOString(),
        ':federatedIdentity': {
          provider: 'google',
          providerId: googleUser.sub,
          attributes: {
            given_name: googleUser.given_name,
            family_name: googleUser.family_name,
            locale: googleUser.locale,
            hd: googleUser.hd,
          },
        },
      },
    });
  }

  /**
   * Mapear atributos de Google a formato del sistema
   */
  mapGoogleAttributesToUser(googleUser: CognitoGoogleUserInfo): Record<string, any> {
    return {
      email: googleUser.email,
      emailVerified: googleUser.email_verified,
      displayName: googleUser.name,
      firstName: googleUser.given_name,
      lastName: googleUser.family_name,
      avatarUrl: googleUser.picture,
      locale: googleUser.locale,
      domain: googleUser.hd, // Google Workspace domain
      googleId: googleUser.sub,
      authProvider: 'google',
      lastSync: new Date().toISOString(),
    };
  }

  /**
   * Buscar usuario por Google ID
   */
  private async findUserByGoogleId(googleId: string): Promise<any> {
    try {
      const users = await this.multiTableService.scan('trinity-users-dev', {
        FilterExpression: 'googleId = :googleId',
        ExpressionAttributeValues: {
          ':googleId': googleId,
        },
      });

      return users.length > 0 ? users[0] : null;
    } catch (error) {
      this.logger.error(`Error buscando usuario por Google ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Buscar usuario por email
   */
  private async findUserByEmail(email: string): Promise<any> {
    try {
      const users = await this.multiTableService.scan('trinity-users-dev', {
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email,
        },
      });

      return users.length > 0 ? users[0] : null;
    } catch (error) {
      this.logger.error(`Error buscando usuario por email: ${error.message}`);
      return null;
    }
  }

  /**
   * Validar consistencia de tokens
   */
  async validateTokenConsistency(googleToken: string, cognitoTokens: CognitoTokens): Promise<boolean> {
    try {
      // Verificar que el token de Google sigue siendo válido
      const googleUser = await this.verifyGoogleToken(googleToken);
      
      // Verificar que los tokens de Cognito contienen información consistente
      const identityId = this.extractIdentityIdFromCognitoToken(cognitoTokens.accessToken);
      
      // La consistencia se valida si el Identity ID contiene el Google sub
      return identityId.includes(googleUser.id);
      
    } catch (error) {
      this.logger.error(`Error validando consistencia de tokens: ${error.message}`);
      return false;
    }
  }

  /**
   * Extraer Identity ID del token de Cognito
   */
  private extractIdentityIdFromCognitoToken(cognitoToken: string): string {
    // Extraer Identity ID del token federado
    const parts = cognitoToken.split('_');
    return parts.length > 2 ? parts.slice(2, -1).join('_') : '';
  }
}