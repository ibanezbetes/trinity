import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
    CognitoTokens,
    ConfirmSignUpDto,
    CreateUserDto,
    FederatedAuthResult,
    ForgotPasswordDto,
    LoginUserDto,
    ResendConfirmationDto,
    ResetPasswordDto,
    User,
    UserProfile,
} from '../../domain/entities/user.entity';
import { CognitoService } from '../../infrastructure/cognito/cognito.service';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import { EventTracker } from '../analytics/event-tracker.service';
import { FederatedSessionManagementService } from './federated-session-management.service';
import { FederatedUserManagementService } from './federated-user-management.service';
import { GoogleAuthAnalyticsService } from './google-auth-analytics.service';
import { GoogleAuthService } from './google-auth.service';
import { AuthStatusCodeService } from './services/auth-status-code.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private multiTableService: MultiTableService,
    private cognitoService: CognitoService,
    private googleAuthService: GoogleAuthService,
    private federatedUserService: FederatedUserManagementService,
    private federatedSessionService: FederatedSessionManagementService,
    private googleAnalyticsService: GoogleAuthAnalyticsService,
    private authStatusCodeService: AuthStatusCodeService,
    private eventTracker: EventTracker,
  ) {}

  /**
   * Registrar un nuevo usuario
   */
  async register(
    createUserDto: CreateUserDto,
  ): Promise<{ user: UserProfile; requiresConfirmation: boolean }> {
    const { email, username, password, phoneNumber, displayName } = createUserDto;

    // Registrar en Cognito
    const { userSub } = await this.cognitoService.signUp(
      email,
      username,
      password,
      phoneNumber,
    );

    // Crear perfil de usuario en DynamoDB
    const user: User = {
      id: userSub,
      email,
      username,
      emailVerified: false, // Se verificará con Cognito
      createdAt: new Date(),
      updatedAt: new Date(),
      phoneNumber,
      displayName,
    };

    // Guardar en DynamoDB
    await this.multiTableService.createUser({
      userId: userSub,
      email,
      username,
      emailVerified: false,
      phoneNumber,
      displayName,
    });

    const userProfile = this.toUserProfile(user);

    // 📝 Track user registration event
    // await this.eventTracker.trackUserAction(
    //   userSub,
    //   EventType.USER_REGISTER,
    //   {
    //     email,
    //     username,
    //     hasPhoneNumber: !!phoneNumber,
    //     registrationMethod: 'email',
    //   },
    //   {
    //     source: 'auth_service',
    //     userAgent: 'backend',
    //   },
    // );

    this.logger.log(`Usuario registrado: ${email}`);
    return {
      user: userProfile,
      requiresConfirmation: true, // Cognito requiere confirmación por email
    };
  }

  /**
   * Confirmar registro de usuario
   */
  async confirmSignUp(
    confirmSignUpDto: ConfirmSignUpDto,
  ): Promise<{ message: string }> {
    const { email, confirmationCode } = confirmSignUpDto;

    await this.cognitoService.confirmSignUp(email, confirmationCode);

    // Actualizar estado en DynamoDB
    const user = await this.findUserByEmail(email);
    if (user) {
      await this.multiTableService.update('trinity-users-dev', { userId: user.id }, {
        UpdateExpression: 'SET emailVerified = :emailVerified',
        ExpressionAttributeValues: {
          ':emailVerified': true,
        },
      });
    }

    this.logger.log(`Usuario confirmado: ${email}`);
    return { message: 'Usuario confirmado exitosamente' };
  }

  /**
   * Reenviar código de confirmación
   */
  async resendConfirmation(
    resendDto: ResendConfirmationDto,
  ): Promise<{ message: string }> {
    await this.cognitoService.resendConfirmationCode(resendDto.email);

    this.logger.log(`Código reenviado: ${resendDto.email}`);
    return { message: 'Código de confirmación reenviado' };
  }

  /**
   * Iniciar sesión
   */
  async login(
    loginUserDto: LoginUserDto,
  ): Promise<{ user: UserProfile; tokens: CognitoTokens }> {
    const { email, password } = loginUserDto;

    // Autenticar con Cognito
    const authResult = await this.cognitoService.signIn(email, password);

    // Obtener o crear perfil en DynamoDB
    let user = await this.findUserByEmail(email);

    if (!user) {
      // Crear perfil si no existe (usuario creado directamente en Cognito)
      user = {
        id: authResult.user.sub,
        email: authResult.user.email,
        username: authResult.user.username,
        emailVerified: authResult.user.email_verified,
        createdAt: new Date(),
        updatedAt: new Date(),
        phoneNumber: authResult.user.phone_number,
      };

      await this.multiTableService.createUser({
        userId: user.id,
        email: user.email,
        username: user.username,
        emailVerified: user.emailVerified,
        phoneNumber: user.phoneNumber,
      });
    } else {
      // Actualizar información desde Cognito
      await this.multiTableService.update('trinity-users-dev', { userId: user.id }, {
        UpdateExpression: 'SET emailVerified = :emailVerified',
        ExpressionAttributeValues: {
          ':emailVerified': authResult.user.email_verified,
        },
      });
      user.emailVerified = authResult.user.email_verified;
    }

    const userProfile = this.toUserProfile(user);
    const tokens: CognitoTokens = {
      accessToken: authResult.accessToken,
      idToken: authResult.idToken,
      refreshToken: authResult.refreshToken,
    };

    // 📝 Track user login event
    // await this.eventTracker.trackUserAction(
    //   user.id,
    //   EventType.USER_LOGIN,
    //   {
    //     email,
    //     loginMethod: 'email_password',
    //     emailVerified: user.emailVerified,
    //   },
    //   {
    //     source: 'auth_service',
    //     userAgent: 'backend',
    //   },
    // );

    this.logger.log(`Usuario autenticado: ${email}`);
    return { user: userProfile, tokens };
  }

  /**
   * Validar usuario por token de Cognito (usado por JWT strategy)
   */
  async validateUserByToken(accessToken: string): Promise<UserProfile | null> {
    try {
      const cognitoUser =
        await this.cognitoService.validateAccessToken(accessToken);

      if (!cognitoUser) {
        return null;
      }

      // Obtener perfil completo desde DynamoDB
      const user = await this.getUserById(cognitoUser.sub);

      if (!user) {
        // Crear perfil si no existe
        const newUser: User = {
          id: cognitoUser.sub,
          email: cognitoUser.email,
          username: cognitoUser.username,
          emailVerified: cognitoUser.email_verified,
          createdAt: new Date(),
          updatedAt: new Date(),
          phoneNumber: cognitoUser.phone_number,
        };

        await this.multiTableService.createUser({
          userId: newUser.id,
          email: newUser.email,
          username: newUser.username,
          emailVerified: newUser.emailVerified,
          phoneNumber: newUser.phoneNumber,
        });

        return this.toUserProfile(newUser);
      }

      return this.toUserProfile(user);
    } catch (error) {
      this.logger.error(`Error validating user by token: ${error.message}`);
      return null;
    }
  }

  /**
   * Iniciar recuperación de contraseña
   */
  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.cognitoService.forgotPassword(forgotPasswordDto.email);

    this.logger.log(`Recuperación iniciada: ${forgotPasswordDto.email}`);
    return { message: 'Código de recuperación enviado al email' };
  }

  /**
   * Confirmar nueva contraseña
   */
  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const { email, confirmationCode, newPassword } = resetPasswordDto;

    await this.cognitoService.confirmForgotPassword(
      email,
      confirmationCode,
      newPassword,
    );

    this.logger.log(`Contraseña restablecida: ${email}`);
    return { message: 'Contraseña restablecida exitosamente' };
  }

  /**
   * Obtener usuario por ID
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const item = await this.multiTableService.getUser(userId);
      if (!item) return null;
      
      return {
        id: item.userId,
        email: item.email,
        username: item.username,
        emailVerified: item.emailVerified,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
        phoneNumber: item.phoneNumber,
        displayName: item.displayName,
        avatarUrl: item.avatarUrl,
      };
    } catch (error) {
      this.logger.error(`Error getting user ${userId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Buscar usuario por email
   */
  private async findUserByEmail(email: string): Promise<User | null> {
    try {
      // Scan para buscar por email (no óptimo pero funcional para MVP)
      const items = await this.multiTableService.scan('trinity-users-dev', {
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email,
        },
      });

      if (items.length === 0) return null;
      
      const item = items[0];
      return {
        id: item.userId,
        email: item.email,
        username: item.username,
        emailVerified: item.emailVerified,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
        phoneNumber: item.phoneNumber,
        displayName: item.displayName,
        avatarUrl: item.avatarUrl,
      };
    } catch (error) {
      this.logger.error(
        `Error finding user by email ${email}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Cerrar sesión
   */
  async logout(userId: string): Promise<{ message: string }> {
    try {
      // 📝 Track user logout event
      // await this.eventTracker.trackUserAction(
      //   userId,
      //   EventType.USER_LOGOUT,
      //   {
      //     logoutMethod: 'manual',
      //   },
      //   {
      //     source: 'auth_service',
      //     userAgent: 'backend',
      //   },
      // );

      this.logger.log(`Usuario cerró sesión: ${userId}`);
      return { message: 'Sesión cerrada exitosamente' };
    } catch (error) {
      this.logger.error(
        `Error during logout for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Convertir User a UserProfile (sin datos sensibles)
   */
  private toUserProfile(user: User): UserProfile {
    return {
      id: user.id,
      sub: user.id, // Alias para compatibilidad con JWT/Cognito
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      // Campos de Google Auth
      googleId: (user as any).googleId,
      isGoogleLinked: (user as any).isGoogleLinked || false,
      authProviders: (user as any).authProviders || ['email'],
    };
  }

  /**
   * Actualizar perfil de usuario
   */
  async updateProfile(
    userId: string,
    updateData: { displayName?: string; avatarUrl?: string; phoneNumber?: string },
  ): Promise<UserProfile> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Construir la expresión de actualización sin updatedAt (se agrega automáticamente)
    const updateExpressions: string[] = [];
    const expressionValues: Record<string, any> = {};

    if (updateData.displayName !== undefined) {
      updateExpressions.push('displayName = :displayName');
      expressionValues[':displayName'] = updateData.displayName;
    }

    if (updateData.avatarUrl !== undefined) {
      updateExpressions.push('avatarUrl = :avatarUrl');
      expressionValues[':avatarUrl'] = updateData.avatarUrl;
    }

    if (updateData.phoneNumber !== undefined) {
      updateExpressions.push('phoneNumber = :phoneNumber');
      expressionValues[':phoneNumber'] = updateData.phoneNumber;
    }

    // Si no hay nada que actualizar, solo actualizar updatedAt
    const updateExpression = updateExpressions.length > 0 
      ? `SET ${updateExpressions.join(', ')}`
      : 'SET #dummy = #dummy'; // Expresión dummy para que funcione el auto-updatedAt

    try {
      await this.multiTableService.update('trinity-users-dev', { userId }, {
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionValues,
        ...(updateExpressions.length === 0 && {
          ExpressionAttributeNames: { '#dummy': 'updatedAt' }
        })
      });

      this.logger.log(`Perfil actualizado: ${userId}`);

      // Retornar perfil actualizado
      const updatedUser = await this.getUserById(userId);
      return this.toUserProfile(updatedUser!);
    } catch (error) {
      this.logger.error(`Error actualizando perfil ${userId}: ${error.message}`);
      throw new Error(`No se pudo actualizar el perfil: ${error.message}`);
    }
  }

  // ==================== MÉTODOS DE GOOGLE AUTH FEDERADA ====================

  /**
   * Autenticar con Google usando Cognito Identity Pool (Federado)
   */
  async loginWithGoogleFederated(idToken: string): Promise<FederatedAuthResult> {
    const startTime = Date.now();
    
    try {
      // Track intento de login
      await this.googleAnalyticsService.trackLoginAttempt(undefined, 'federated', startTime);
      
      // Usar el nuevo método de autenticación federada
      const federatedResult = await this.googleAuthService.authenticateWithGoogleFederated(idToken);
      
      // Crear o actualizar sesión federada
      const sessionInfo = await this.federatedSessionService.createFederatedSession(
        federatedResult.user.userId,
        federatedResult.cognitoTokens,
        'google',
        federatedResult.user.cognitoIdentityId
      );

      // Sincronizar perfil con base de datos local si es necesario
      if (!federatedResult.isNewUser) {
        await this.syncFederatedUserProfile(federatedResult.user.userId, federatedResult.user);
      }

      // Track login exitoso
      await this.googleAnalyticsService.trackLoginSuccess(
        federatedResult.user.userId,
        'federated',
        startTime,
        {
          isNewUser: federatedResult.isNewUser,
          cognitoIdentityId: federatedResult.user.cognitoIdentityId,
          sessionId: sessionInfo.cognitoIdentityId,
        }
      );

      this.logger.log(`Usuario autenticado con Google federado: ${federatedResult.user.email}`);
      
      return {
        user: this.toUserProfile(federatedResult.user),
        cognitoTokens: federatedResult.cognitoTokens,
        isNewUser: federatedResult.isNewUser,
        federatedIdentity: federatedResult.user.federatedIdentities?.[0] || {
          provider: 'google',
          providerId: federatedResult.user.googleId || '',
          linkedAt: new Date(),
          isActive: true,
        },
      };
      
    } catch (error) {
      // Track login fallido
      await this.googleAnalyticsService.trackLoginFailure(
        undefined,
        'federated',
        startTime,
        error.code || 'FEDERATED_AUTH_ERROR',
        error.message,
        {
          originalError: error.name,
        }
      );
      
      this.logger.error(`Error en login federado con Google: ${error.message}`);
      throw error;
    }
  }

  /**
   * Autenticar con Google usando ID Token (método legacy mantenido para compatibilidad)
   */
  async loginWithGoogle(idToken: string): Promise<{ user: UserProfile; tokens: CognitoTokens }> {
    try {
      // Verificar si la autenticación federada está disponible
      if (this.cognitoService.validateProviderConfiguration()) {
        // Usar autenticación federada si está configurada
        this.logger.log('🔄 Intentando autenticación federada...');
        const federatedResult = await this.loginWithGoogleFederated(idToken);
        return { 
          user: federatedResult.user, 
          tokens: federatedResult.cognitoTokens 
        };
      }

      // Fallback al método legacy con manejo de errores mejorado
      this.logger.log('🔄 Usando método legacy de Google Auth...');
      return await this.loginWithGoogleLegacy(idToken);
      
    } catch (error) {
      return this.handleGoogleLoginError(error, idToken);
    }
  }

  /**
   * Manejar errores de login con Google con fallbacks automáticos
   */
  private async handleGoogleLoginError(error: any, idToken: string): Promise<{ user: UserProfile; tokens: CognitoTokens }> {
    this.logger.error(`❌ Error en login con Google: ${error.message}`);
    
    // Si es un error estructurado con opciones de fallback
    if (error instanceof UnauthorizedException && error.message && typeof error.message === 'object') {
      const structuredError = error.message as any;
      
      // Intentar fallbacks automáticos según las opciones disponibles
      if (structuredError.fallbackOptions?.includes('legacy_google_auth') && 
          !structuredError.context?.includes('legacy')) {
        this.logger.warn('⚠️ Intentando fallback a método legacy de Google Auth...');
        try {
          return await this.loginWithGoogleLegacy(idToken);
        } catch (fallbackError) {
          this.logger.error(`❌ Fallback legacy también falló: ${fallbackError.message}`);
          // Continuar con el error original estructurado
        }
      }

      // Si el error es retryable y es el primer intento, intentar una vez más
      if (structuredError.retryable && !structuredError.retryAttempted) {
        this.logger.warn('⚠️ Error retryable detectado, intentando nuevamente...');
        
        // Marcar como reintentado para evitar loops infinitos
        const retryError = {
          ...structuredError,
          retryAttempted: true,
        };
        
        // Esperar el delay si está especificado
        if (structuredError.retryDelay) {
          await new Promise(resolve => setTimeout(resolve, structuredError.retryDelay));
        }
        
        try {
          // Reintentar la operación original
          if (structuredError.context === 'federated_auth') {
            const federatedResult = await this.loginWithGoogleFederated(idToken);
            return { user: federatedResult.user, tokens: federatedResult.cognitoTokens };
          } else {
            return await this.loginWithGoogleLegacy(idToken);
          }
        } catch (retryError) {
          this.logger.error(`❌ Reintento también falló: ${retryError.message}`);
          // Continuar con el error original
        }
      }

      // Re-lanzar el error estructurado para que el cliente pueda manejarlo
      throw new UnauthorizedException(structuredError);
    }
    
    // Para errores no estructurados, intentar fallback si es de configuración
    if (this.isConfigurationError(error)) {
      this.logger.warn('⚠️ Error de configuración detectado, intentando fallback...');
      try {
        return await this.loginWithGoogleLegacy(idToken);
      } catch (fallbackError) {
        this.logger.error(`❌ Fallback también falló: ${fallbackError.message}`);
        throw this.createUserFriendlyError(fallbackError);
      }
    }
    
    throw this.createUserFriendlyError(error);
  }

  /**
   * Método legacy de autenticación con Google (fallback)
   */
  private async loginWithGoogleLegacy(idToken: string): Promise<{ user: UserProfile; tokens: CognitoTokens }> {
    try {
      const googleUser = await this.googleAuthService.verifyGoogleToken(idToken);
      
      // Verificar si hay conflictos de email antes de proceder
      await this.validateEmailConflicts(googleUser.email, googleUser.id);
      
      const userProfile = await this.googleAuthService.createOrUpdateUserFromGoogle(googleUser);
      
      // Generar tokens mock para compatibilidad
      const tokens: CognitoTokens = {
        accessToken: `google_access_${userProfile.id}_${Date.now()}`,
        idToken: `google_id_${userProfile.id}_${Date.now()}`,
        refreshToken: `google_refresh_${userProfile.id}_${Date.now()}`,
        expiresIn: 3600,
      };

      this.logger.log(`✅ Usuario autenticado con Google (legacy): ${googleUser.email}`);
      
      return { 
        user: this.toUserProfile(userProfile), 
        tokens 
      };
      
    } catch (error) {
      this.logger.error(`❌ Error en método legacy: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validar conflictos de email antes de la autenticación
   */
  private async validateEmailConflicts(email: string, googleId: string): Promise<void> {
    try {
      // Buscar usuarios existentes con este email
      const existingUsersByEmail = await this.multiTableService.scan('trinity-users-dev', {
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email,
        },
      });

      // Buscar usuarios existentes con este Google ID
      const existingUsersByGoogleId = await this.multiTableService.scan('trinity-users-dev', {
        FilterExpression: 'googleId = :googleId',
        ExpressionAttributeValues: {
          ':googleId': googleId,
        },
      });

      // Verificar conflictos
      if (existingUsersByEmail.length > 0 && existingUsersByGoogleId.length > 0) {
        const emailUser = existingUsersByEmail[0];
        const googleUser = existingUsersByGoogleId[0];
        
        if (emailUser.userId !== googleUser.userId) {
          throw new ConflictException(
            'Conflicto de identidad: Este email y Google ID pertenecen a usuarios diferentes. ' +
            'Contacta al soporte para resolver este conflicto.'
          );
        }
      }

      // Verificar si el Google ID ya está vinculado a otro email
      if (existingUsersByGoogleId.length > 0) {
        const existingUser = existingUsersByGoogleId[0];
        if (existingUser.email !== email) {
          throw new ConflictException(
            `Esta cuenta de Google ya está vinculada al email: ${existingUser.email}. ` +
            'Si necesitas cambiar el email, contacta al soporte.'
          );
        }
      }

    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      
      // Log del error pero no bloquear el flujo por errores de validación
      this.logger.warn(`⚠️ Error validando conflictos de email: ${error.message}`);
    }
  }

  /**
   * Determinar si un error es de configuración
   */
  private isConfigurationError(error: any): boolean {
    const configErrorMessages = [
      'not configured',
      'configuration missing',
      'invalid credentials',
      'identity pool',
      'provider configuration',
    ];
    
    return configErrorMessages.some(msg => 
      error.message?.toLowerCase().includes(msg.toLowerCase())
    );
  }

  /**
   * Crear error amigable para el usuario
   */
  private createUserFriendlyError(error: any): Error {
    // Mapear errores técnicos a mensajes amigables
    if (error instanceof UnauthorizedException) {
      return error; // Ya es amigable
    }
    
    if (error instanceof ConflictException) {
      return error; // Ya es amigable
    }
    
    if (error.message?.includes('network') || error.message?.includes('timeout')) {
      return new Error(
        'Error de conexión. Verifica tu conexión a internet e intenta nuevamente.'
      );
    }
    
    if (error.message?.includes('service unavailable') || error.message?.includes('temporarily down')) {
      return new Error(
        'El servicio de autenticación no está disponible temporalmente. Intenta nuevamente en unos minutos.'
      );
    }
    
    if (error.message?.includes('rate limit') || error.message?.includes('too many')) {
      return new Error(
        'Demasiados intentos de autenticación. Espera unos minutos antes de intentar nuevamente.'
      );
    }
    
    // Error genérico para casos no manejados específicamente
    this.logger.error(`🔒 Error no manejado específicamente: ${error.message}`);
    return new Error(
      'Error de autenticación. Si el problema persiste, contacta al soporte técnico.'
    );
  }

  /**
   * Intercambiar token de Google por tokens de Cognito
   */
  async exchangeGoogleTokenForCognito(googleToken: string): Promise<CognitoTokens> {
    try {
      if (!this.cognitoService.validateProviderConfiguration()) {
        throw new Error('Cognito federated authentication not configured');
      }

      return await this.cognitoService.exchangeGoogleTokenForCognito(googleToken);
      
    } catch (error) {
      this.logger.error(`Error intercambiando token de Google: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sincronizar perfil de usuario federado
   */
  async syncFederatedUserProfile(userId: string, federatedUserData: any): Promise<UserProfile> {
    try {
      const updateData = {
        displayName: federatedUserData.displayName,
        avatarUrl: federatedUserData.avatarUrl,
        emailVerified: federatedUserData.emailVerified,
      };

      // Actualizar perfil local
      const updatedProfile = await this.updateProfile(userId, updateData);

      // Actualizar metadatos de federación
      await this.multiTableService.update('trinity-users-dev', { userId }, {
        UpdateExpression: `
          SET lastGoogleSync = :lastGoogleSync,
              federatedIdentity = :federatedIdentity
        `,
        ExpressionAttributeValues: {
          ':lastGoogleSync': new Date().toISOString(),
          ':federatedIdentity': federatedUserData.federatedIdentity || {
            provider: 'google',
            providerId: federatedUserData.googleId,
            lastSync: new Date().toISOString(),
          },
        },
      });

      this.logger.log(`Perfil federado sincronizado: ${userId}`);
      return updatedProfile;
      
    } catch (error) {
      this.logger.error(`Error sincronizando perfil federado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Vincular cuenta de Google a usuario existente (versión federada)
   */
  async linkGoogleAccountFederated(userId: string, idToken: string): Promise<UserProfile> {
    try {
      this.logger.log(`🔗 Iniciando vinculación federada para usuario: ${userId}`);
      
      // Verificar token de Google con manejo de errores
      const googleUser = await this.verifyGoogleTokenSafely(idToken);
      
      // Validar que se puede vincular la cuenta con validaciones completas
      await this.validateAccountLinkingComprehensive(userId, googleUser.id, googleUser.email);
      
      // Usar el nuevo servicio de gestión de usuarios federados
      const linkedProfile = await this.federatedUserService.linkFederatedIdentity({
        userId,
        provider: 'google',
        providerId: googleUser.id,
        providerData: {
          email: googleUser.email,
          name: googleUser.name,
          picture: googleUser.picture,
          locale: googleUser.locale,
          hd: googleUser.hd,
          metadata: {
            email_verified: googleUser.email_verified,
            given_name: googleUser.given_name,
            family_name: googleUser.family_name,
          },
        },
      });

      // Vincular en Cognito si está configurado (con manejo de errores)
      if (this.cognitoService.validateProviderConfiguration()) {
        try {
          await this.cognitoService.linkGoogleProvider(userId, idToken);
          this.logger.log(`✅ Google vinculado en Cognito para usuario: ${userId}`);
        } catch (cognitoError) {
          this.logger.warn(`⚠️ Error vinculando en Cognito (continuando): ${cognitoError.message}`);
          // No bloquear el flujo por errores de Cognito
        }
      }

      // Track vinculación exitosa
      await this.googleAnalyticsService.trackAccountLinking(
        userId,
        true,
        undefined,
        {
          googleId: googleUser.id,
          googleEmail: googleUser.email,
        }
      );
      
      this.logger.log(`✅ Cuenta de Google vinculada exitosamente (federado): ${userId}`);
      
      return linkedProfile;
      
    } catch (error) {
      // Track vinculación fallida
      await this.googleAnalyticsService.trackAccountLinking(
        userId,
        false,
        error.message,
        {
          errorType: error.constructor.name,
        }
      );
      
      this.logger.error(`❌ Error vinculando cuenta de Google (federado): ${error.message}`);
      throw this.createUserFriendlyError(error);
    }
  }

  /**
   * Desvincular cuenta de Google de usuario (versión federada)
   */
  async unlinkGoogleAccountFederated(userId: string): Promise<UserProfile> {
    try {
      this.logger.log(`🔓 Iniciando desvinculación federada para usuario: ${userId}`);
      
      // Validar que se puede desvincular la cuenta con validaciones completas
      await this.validateAccountUnlinkingComprehensive(userId);
      
      // Desvincular en Cognito si está configurado (con manejo de errores)
      if (this.cognitoService.validateProviderConfiguration()) {
        try {
          await this.cognitoService.unlinkGoogleProvider(userId);
          this.logger.log(`✅ Google desvinculado en Cognito para usuario: ${userId}`);
        } catch (cognitoError) {
          this.logger.warn(`⚠️ Error desvinculando en Cognito (continuando): ${cognitoError.message}`);
          // No bloquear el flujo por errores de Cognito
        }
      }
      
      // Desvincular Google del usuario con reintentos
      await this.unlinkGoogleWithRetry(userId);
      
      // Retornar perfil actualizado
      const updatedUser = await this.getUserById(userId);
      if (!updatedUser) {
        throw new Error('Error obteniendo usuario actualizado después de desvinculación');
      }
      
      this.logger.log(`✅ Cuenta de Google desvinculada exitosamente (federado): ${userId}`);
      
      return this.toUserProfile(updatedUser);
      
    } catch (error) {
      this.logger.error(`❌ Error desvinculando cuenta de Google (federado): ${error.message}`);
      throw this.createUserFriendlyError(error);
    }
  }

  /**
   * Verificar token de Google de forma segura con manejo de errores
   */
  private async verifyGoogleTokenSafely(idToken: string): Promise<any> {
    try {
      return await this.googleAuthService.verifyGoogleToken(idToken);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(
          'Token de Google inválido o expirado. Intenta iniciar sesión nuevamente en Google.'
        );
      }
      
      if (error.message?.includes('network') || error.message?.includes('timeout')) {
        throw new Error(
          'Error de conexión al verificar token de Google. Verifica tu conexión e intenta nuevamente.'
        );
      }
      
      throw new Error('Error verificando token de Google. Intenta nuevamente.');
    }
  }

  /**
   * Validar vinculación de cuenta de forma comprehensiva
   */
  private async validateAccountLinkingComprehensive(userId: string, googleId: string, googleEmail: string): Promise<void> {
    try {
      // Validación básica
      await this.validateAccountLinking(userId, googleId, googleEmail);
      
      // Validaciones adicionales de seguridad
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Verificar que el usuario no tenga demasiados proveedores vinculados
      const authProviders = await this.getUserAuthProviders(userId);
      const maxProviders = 5; // Límite de seguridad
      
      if (authProviders.length >= maxProviders) {
        throw new Error(
          `No se pueden vincular más proveedores. Límite máximo: ${maxProviders}`
        );
      }

      // Verificar que no haya intentos de vinculación recientes fallidos
      await this.checkRecentLinkingAttempts(userId);
      
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new Error(`Error validando vinculación: ${error.message}`);
    }
  }

  /**
   * Validar desvinculación de cuenta de forma comprehensiva
   */
  private async validateAccountUnlinkingComprehensive(userId: string): Promise<void> {
    try {
      // Validación básica
      await this.validateAccountUnlinking(userId);
      
      // Validaciones adicionales
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Verificar que el usuario tenga acceso alternativo
      const authProviders = await this.getUserAuthProviders(userId);
      const nonGoogleProviders = authProviders.filter(provider => provider !== 'google');
      
      if (nonGoogleProviders.length === 0) {
        throw new Error(
          'No se puede desvincular Google: es el único método de autenticación. ' +
          'Configura una contraseña primero desde tu perfil.'
        );
      }

      // Si solo tiene email, verificar que tenga contraseña configurada
      if (nonGoogleProviders.length === 1 && nonGoogleProviders[0] === 'email') {
        // En el futuro, verificar que tiene contraseña en Cognito
        this.logger.warn(`⚠️ Usuario ${userId} desvinculando Google con solo email como alternativa`);
      }
      
    } catch (error) {
      throw new Error(`Error validando desvinculación: ${error.message}`);
    }
  }

  /**
   * Vincular Google con reintentos
   */
  private async linkGoogleWithRetry(userId: string, googleUser: any, maxRetries: number = 3): Promise<void> {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.googleAuthService.linkGoogleToExistingUser(userId, googleUser);
        return; // Éxito
      } catch (error) {
        lastError = error;
        this.logger.warn(`⚠️ Intento ${attempt}/${maxRetries} de vinculación falló: ${error.message}`);
        
        if (attempt < maxRetries) {
          // Esperar antes del siguiente intento
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    throw new Error(`Error vinculando Google después de ${maxRetries} intentos: ${lastError?.message}`);
  }

  /**
   * Desvincular Google con reintentos
   */
  private async unlinkGoogleWithRetry(userId: string, maxRetries: number = 3): Promise<void> {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.googleAuthService.unlinkGoogleFromUser(userId);
        return; // Éxito
      } catch (error) {
        lastError = error;
        this.logger.warn(`⚠️ Intento ${attempt}/${maxRetries} de desvinculación falló: ${error.message}`);
        
        if (attempt < maxRetries) {
          // Esperar antes del siguiente intento
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    throw new Error(`Error desvinculando Google después de ${maxRetries} intentos: ${lastError?.message}`);
  }

  /**
   * Sincronizar perfil de forma segura
   */
  private async syncProfileSafely(userId: string, googleUser: any): Promise<void> {
    try {
      await this.googleAuthService.syncProfileFromGoogle(userId, googleUser);
    } catch (error) {
      // Log del error pero no bloquear el flujo
      this.logger.warn(`⚠️ Error sincronizando perfil desde Google: ${error.message}`);
    }
  }

  /**
   * Verificar intentos de vinculación recientes
   */
  private async checkRecentLinkingAttempts(userId: string): Promise<void> {
    // Implementación básica - en producción usar Redis o similar
    // Por ahora, solo log de la verificación
    this.logger.log(`🔐 Verificando intentos de vinculación recientes para: ${userId}`);
    
    // TODO: Implementar verificación real de rate limiting
    // const recentAttempts = await redis.get(`link_attempts_${userId}`);
    // if (recentAttempts && parseInt(recentAttempts) > 5) {
    //   throw new Error('Demasiados intentos de vinculación recientes');
    // }
  }

  /**
   * Validar que se puede vincular una cuenta de Google
   */
  private async validateAccountLinking(userId: string, googleId: string, googleEmail: string): Promise<void> {
    // Verificar que el usuario existe
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Verificar que no hay otro usuario con este Google ID
    const existingGoogleUsers = await this.multiTableService.scan('trinity-users-dev', {
      FilterExpression: 'googleId = :googleId',
      ExpressionAttributeValues: {
        ':googleId': googleId,
      },
    });

    if (existingGoogleUsers.length > 0 && existingGoogleUsers[0].userId !== userId) {
      throw new ConflictException('Esta cuenta de Google ya está vinculada a otro usuario');
    }

    // Verificar que el email coincide o que el usuario permite múltiples emails
    if (user.email !== googleEmail) {
      this.logger.warn(`Email diferente en vinculación: usuario=${user.email}, google=${googleEmail}`);
      // En el futuro, aquí se podría implementar lógica para manejar múltiples emails
    }
  }

  /**
   * Validar que se puede desvincular una cuenta de Google
   */
  private async validateAccountUnlinking(userId: string): Promise<void> {
    // Verificar que el usuario existe
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Verificar que el usuario tiene otros métodos de autenticación
    const userData = await this.multiTableService.getUser(userId);
    const authProviders = userData?.authProviders || [];
    const nonGoogleProviders = authProviders.filter(provider => provider !== 'google');
    
    if (nonGoogleProviders.length === 0) {
      throw new Error('No se puede desvincular Google: es el único método de autenticación');
    }

    // Verificar que el usuario tiene contraseña configurada si solo tiene email como alternativa
    if (nonGoogleProviders.length === 1 && nonGoogleProviders[0] === 'email') {
      // En el futuro, verificar que tiene contraseña en Cognito
      this.logger.warn(`Usuario ${userId} desvinculando Google con solo email como alternativa`);
    }
  }

  /**
   * Obtener proveedores de autenticación del usuario
   */
  async getUserAuthProviders(userId: string): Promise<string[]> {
    try {
      const userData = await this.multiTableService.getUser(userId);
      return userData?.authProviders || ['email'];
    } catch (error) {
      this.logger.error(`Error obteniendo proveedores de auth: ${error.message}`);
      return ['email'];
    }
  }

  /**
   * Vincular cuenta de Google a usuario existente (método legacy para compatibilidad)
   */
  async linkGoogleAccount(userId: string, idToken: string): Promise<UserProfile> {
    try {
      // Verificar token de Google
      const googleUser = await this.googleAuthService.verifyGoogleToken(idToken);
      
      // Vincular Google al usuario existente
      await this.googleAuthService.linkGoogleToExistingUser(userId, googleUser);
      
      // Sincronizar información de perfil desde Google
      await this.googleAuthService.syncProfileFromGoogle(userId, googleUser);
      
      // Retornar perfil actualizado
      const updatedUser = await this.getUserById(userId);
      
      this.logger.log(`Cuenta de Google vinculada al usuario (legacy): ${userId}`);
      
      return this.toUserProfile(updatedUser!);
      
    } catch (error) {
      this.logger.error(`Error vinculando cuenta de Google (legacy): ${error.message}`);
      throw error;
    }
  }

  /**
   * Desvincular cuenta de Google de usuario (método legacy para compatibilidad)
   */
  async unlinkGoogleAccount(userId: string): Promise<UserProfile> {
    try {
      // Desvincular Google del usuario
      await this.googleAuthService.unlinkGoogleFromUser(userId);
      
      // Retornar perfil actualizado
      const updatedUser = await this.getUserById(userId);
      
      this.logger.log(`Cuenta de Google desvinculada del usuario (legacy): ${userId}`);
      
      return this.toUserProfile(updatedUser!);
      
    } catch (error) {
      this.logger.error(`Error desvinculando cuenta de Google (legacy): ${error.message}`);
      throw error;
    }
  }

  /**
   * Verificar si el usuario puede desvincular Google
   */
  async canUnlinkGoogle(userId: string): Promise<boolean> {
    try {
      const authProviders = await this.getUserAuthProviders(userId);
      const nonGoogleProviders = authProviders.filter(provider => provider !== 'google');
      return nonGoogleProviders.length > 0;
    } catch (error) {
      this.logger.error(`Error verificando si puede desvincular Google: ${error.message}`);
      return false;
    }
  }

  /**
   * Verificar si Google Auth está disponible
   */
  isGoogleAuthAvailable(): boolean {
    return this.googleAuthService.isGoogleAuthAvailable();
  }

  /**
   * Refrescar tokens automáticamente
   */
  async refreshTokens(refreshToken: string): Promise<CognitoTokens> {
    try {
      // Intentar refresh con Cognito estándar primero
      return await this.cognitoService.refreshTokens(refreshToken);
    } catch (error) {
      this.logger.error(`Error refrescando tokens estándar: ${error.message}`);
      
      // Si falla el refresh estándar, intentar con tokens federados
      if (this.isFederatedToken(refreshToken)) {
        this.logger.log('Intentando refresh de tokens federados...');
        try {
          return await this.cognitoService.refreshFederatedTokens(refreshToken);
        } catch (federatedError) {
          this.logger.error(`Error refrescando tokens federados: ${federatedError.message}`);
          // Use proper status code handling
          this.authStatusCodeService.handleAuthError(federatedError, 'token_refresh');
        }
      }
      
      // Use proper status code handling for standard refresh failures
      this.authStatusCodeService.handleAuthError(error, 'token_refresh');
    }
  }

  /**
   * Validar y refrescar token automáticamente si es necesario
   */
  async validateAndRefreshToken(accessToken: string, refreshToken?: string): Promise<{
    user: UserProfile | null;
    newTokens?: CognitoTokens;
    tokenRefreshed: boolean;
  }> {
    try {
      // Intentar validar el token actual
      const user = await this.validateUserByToken(accessToken);
      
      if (user) {
        return {
          user,
          tokenRefreshed: false,
        };
      }
      
      // Si el token no es válido y tenemos refresh token, intentar refrescar
      if (refreshToken) {
        this.logger.log('Token de acceso inválido, intentando refresh automático...');
        
        try {
          const newTokens = await this.refreshTokens(refreshToken);
          
          // Validar el nuevo token de acceso
          const refreshedUser = await this.validateUserByToken(newTokens.accessToken);
          
          if (refreshedUser) {
            this.logger.log(`✅ Token refrescado exitosamente para usuario: ${refreshedUser.id}`);
            return {
              user: refreshedUser,
              newTokens,
              tokenRefreshed: true,
            };
          }
        } catch (refreshError) {
          this.logger.error(`❌ Error en refresh automático: ${refreshError.message}`);
        }
      }
      
      return {
        user: null,
        tokenRefreshed: false,
      };
      
    } catch (error) {
      this.logger.error(`Error en validación y refresh de token: ${error.message}`);
      return {
        user: null,
        tokenRefreshed: false,
      };
    }
  }

  /**
   * Determinar si un token es federado
   */
  private isFederatedToken(token: string): boolean {
    // Trim whitespace and check for federated token patterns
    const trimmedToken = token.trim();
    return trimmedToken.includes('cognito_federated_') || 
           trimmedToken.includes('cognito_refresh_') ||
           trimmedToken.includes('google_refresh_');
  }

  /**
   * Obtener estado de salud de la configuración de autenticación
   */
  async getConfigurationHealthStatus(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    issues: string[];
    recommendations: string[];
    cognito: {
      configured: boolean;
      userPoolId: string;
      clientId: string;
      region: string;
      jwtVerifierReady: boolean;
      federationEnabled: boolean;
    };
    google: {
      configured: boolean;
      clientId: string;
      federationReady: boolean;
    };
    overall: {
      ready: boolean;
      message: string;
    };
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Verificar configuración de Cognito
    const cognitoConfig = {
      configured: false,
      userPoolId: 'NOT_CONFIGURED',
      clientId: 'NOT_CONFIGURED',
      region: 'NOT_CONFIGURED',
      jwtVerifierReady: false,
      federationEnabled: false,
    };

    try {
      // Verificar configuración básica de Cognito
      const userPoolId = this.cognitoService['userPoolId'];
      const clientId = this.cognitoService['clientId'];
      const region = this.cognitoService['configService'].get('COGNITO_REGION', 'eu-west-1');
      const jwtVerifier = this.cognitoService['jwtVerifier'];

      cognitoConfig.userPoolId = userPoolId || 'NOT_CONFIGURED';
      cognitoConfig.clientId = clientId || 'NOT_CONFIGURED';
      cognitoConfig.region = region;
      cognitoConfig.jwtVerifierReady = !!jwtVerifier;

      // Verificar que las credenciales son las correctas
      if (userPoolId === 'eu-west-1_6UxioIj4z' && clientId === '59dpqsm580j14ulkcha19shl64') {
        cognitoConfig.configured = true;
      } else {
        issues.push('Cognito credentials do not match expected values');
        recommendations.push('Update COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID to correct values');
        score -= 30;
      }

      // Verificar JWT Verifier
      if (!jwtVerifier) {
        issues.push('JWT Verifier is not configured');
        recommendations.push('Ensure Cognito User Pool ID is valid and accessible');
        score -= 20;
      }

      // Verificar configuración de federación
      const federationEnabled = this.cognitoService.validateProviderConfiguration();
      cognitoConfig.federationEnabled = federationEnabled;

      if (!federationEnabled) {
        issues.push('Cognito federated authentication is not configured');
        recommendations.push('Configure COGNITO_IDENTITY_POOL_ID for Google Sign-In support');
        score -= 15;
      }

    } catch (error) {
      issues.push(`Cognito configuration error: ${error.message}`);
      recommendations.push('Check Cognito service configuration and AWS credentials');
      score -= 40;
    }

    // Verificar configuración de Google
    const googleConfig = {
      configured: false,
      clientId: 'NOT_CONFIGURED',
      federationReady: false,
    };

    try {
      const googleClientId = this.cognitoService['configService'].get('GOOGLE_WEB_CLIENT_ID');
      googleConfig.clientId = googleClientId || 'NOT_CONFIGURED';

      // Verificar que el Google Client ID es el correcto
      if (googleClientId === '230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com') {
        googleConfig.configured = true;
      } else {
        issues.push('Google Client ID does not match expected value');
        recommendations.push('Update GOOGLE_WEB_CLIENT_ID to correct value');
        score -= 20;
      }

      // Verificar si Google Auth está disponible
      const googleAuthAvailable = this.isGoogleAuthAvailable();
      googleConfig.federationReady = googleAuthAvailable && cognitoConfig.federationEnabled;

      if (!googleAuthAvailable) {
        issues.push('Google Auth service is not available');
        recommendations.push('Check Google Auth service configuration');
        score -= 15;
      }

    } catch (error) {
      issues.push(`Google configuration error: ${error.message}`);
      recommendations.push('Check Google OAuth configuration');
      score -= 25;
    }

    // Determinar estado general
    let status: 'healthy' | 'warning' | 'critical';
    let overallReady = false;
    let overallMessage = '';

    if (score >= 80) {
      status = 'healthy';
      overallReady = true;
      overallMessage = 'Authentication system is properly configured and ready';
    } else if (score >= 60) {
      status = 'warning';
      overallReady = true;
      overallMessage = 'Authentication system is functional but has configuration issues';
    } else {
      status = 'critical';
      overallReady = false;
      overallMessage = 'Authentication system has critical configuration issues';
    }

    // Agregar recomendaciones generales
    if (issues.length === 0) {
      recommendations.push('Configuration is healthy - no actions needed');
    } else {
      recommendations.push('Review and fix the identified configuration issues');
      recommendations.push('Test authentication flows after making changes');
    }

    return {
      status,
      score,
      issues,
      recommendations,
      cognito: cognitoConfig,
      google: googleConfig,
      overall: {
        ready: overallReady,
        message: overallMessage,
      },
    };
  }
}
