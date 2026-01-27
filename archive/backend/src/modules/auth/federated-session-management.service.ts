import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CognitoService, CognitoTokens } from '../../infrastructure/cognito/cognito.service';
import { FederatedUserManagementService } from './federated-user-management.service';
import { 
  UserProfile, 
  FederatedTokenMetadata, 
  AccountLinkingEvent 
} from '../../domain/entities/user.entity';

export interface SessionInfo {
  userId: string;
  cognitoIdentityId?: string;
  tokens: CognitoTokens;
  expiresAt: Date;
  refreshedAt: Date;
  provider: string;
  isValid: boolean;
}

export interface RefreshTokenResult {
  tokens: CognitoTokens;
  sessionInfo: SessionInfo;
  refreshed: boolean;
}

@Injectable()
export class FederatedSessionManagementService {
  private readonly logger = new Logger(FederatedSessionManagementService.name);
  private readonly sessionCache = new Map<string, SessionInfo>();
  private readonly refreshInProgress = new Set<string>();

  constructor(
    private configService: ConfigService,
    private cognitoService: CognitoService,
    private federatedUserService: FederatedUserManagementService,
  ) {}

  /**
   * Crear nueva sesión federada
   */
  async createFederatedSession(
    userId: string, 
    cognitoTokens: CognitoTokens, 
    provider: string,
    cognitoIdentityId?: string
  ): Promise<SessionInfo> {
    try {
      const expiresAt = new Date(Date.now() + (cognitoTokens.expiresIn || 3600) * 1000);
      
      const sessionInfo: SessionInfo = {
        userId,
        cognitoIdentityId,
        tokens: cognitoTokens,
        expiresAt,
        refreshedAt: new Date(),
        provider,
        isValid: true,
      };

      // Cachear sesión
      const sessionKey = this.getSessionKey(userId, provider);
      this.sessionCache.set(sessionKey, sessionInfo);

      // Actualizar metadatos de tokens en el usuario
      await this.updateUserTokenMetadata(userId, cognitoIdentityId, cognitoTokens);

      this.logger.log(`✅ Sesión federada creada: ${userId} (${provider})`);
      
      return sessionInfo;
      
    } catch (error) {
      this.logger.error(`❌ Error creando sesión federada: ${error.message}`);
      throw error;
    }
  }

  /**
   * Refrescar tokens de sesión federada
   */
  async refreshFederatedTokens(userId: string, provider: string = 'google'): Promise<RefreshTokenResult> {
    try {
      const sessionKey = this.getSessionKey(userId, provider);
      
      // Evitar múltiples refreshes simultáneos
      if (this.refreshInProgress.has(sessionKey)) {
        this.logger.log(`⏳ Refresh ya en progreso para: ${sessionKey}`);
        await this.waitForRefreshCompletion(sessionKey);
      }

      this.refreshInProgress.add(sessionKey);

      try {
        // Obtener sesión actual
        let sessionInfo = this.sessionCache.get(sessionKey);
        
        if (!sessionInfo) {
          // Intentar recuperar desde base de datos
          const loadedSession = await this.loadSessionFromDatabase(userId, provider);
          if (loadedSession) {
            sessionInfo = loadedSession;
          }
        }

        if (!sessionInfo) {
          throw new UnauthorizedException('Sesión no encontrada');
        }

        // Verificar si necesita refresh
        const needsRefresh = this.needsTokenRefresh(sessionInfo);
        
        if (!needsRefresh) {
          this.logger.log(`✅ Tokens aún válidos para: ${userId}`);
          return {
            tokens: sessionInfo.tokens,
            sessionInfo,
            refreshed: false,
          };
        }

        // Refrescar tokens
        this.logger.log(`🔄 Refrescando tokens para: ${userId} (${provider})`);
        
        const newTokens = await this.performTokenRefresh(sessionInfo);
        
        // Actualizar sesión
        const updatedSession: SessionInfo = {
          ...sessionInfo,
          tokens: newTokens,
          expiresAt: new Date(Date.now() + (newTokens.expiresIn || 3600) * 1000),
          refreshedAt: new Date(),
          isValid: true,
        };

        // Actualizar cache
        this.sessionCache.set(sessionKey, updatedSession);

        // Actualizar base de datos
        await this.updateUserTokenMetadata(userId, sessionInfo.cognitoIdentityId, newTokens);

        // Registrar evento de refresh
        await this.recordTokenRefreshEvent(userId, provider, true);

        this.logger.log(`✅ Tokens refrescados exitosamente: ${userId}`);
        
        return {
          tokens: newTokens,
          sessionInfo: updatedSession,
          refreshed: true,
        };
        
      } finally {
        this.refreshInProgress.delete(sessionKey);
      }
      
    } catch (error) {
      this.logger.error(`❌ Error refrescando tokens: ${error.message}`);
      
      // Registrar evento de error
      await this.recordTokenRefreshEvent(userId, provider, false, error.message);
      
      throw new UnauthorizedException('Error refrescando tokens de sesión');
    }
  }

  /**
   * Validar sesión federada
   */
  async validateFederatedSession(userId: string, provider: string = 'google'): Promise<SessionInfo | null> {
    try {
      const sessionKey = this.getSessionKey(userId, provider);
      let sessionInfo = this.sessionCache.get(sessionKey);
      
      if (!sessionInfo) {
        // Intentar cargar desde base de datos
        const loadedSession = await this.loadSessionFromDatabase(userId, provider);
        if (loadedSession) {
          sessionInfo = loadedSession;
          this.sessionCache.set(sessionKey, sessionInfo);
        }
      }

      if (!sessionInfo) {
        this.logger.warn(`⚠️ Sesión no encontrada: ${userId} (${provider})`);
        return null;
      }

      // Verificar validez
      if (!this.isSessionValid(sessionInfo)) {
        this.logger.warn(`⚠️ Sesión inválida o expirada: ${userId} (${provider})`);
        await this.invalidateSession(userId, provider);
        return null;
      }

      // Auto-refresh si está cerca de expirar
      if (this.needsTokenRefresh(sessionInfo)) {
        this.logger.log(`🔄 Auto-refrescando tokens próximos a expirar: ${userId}`);
        
        try {
          const refreshResult = await this.refreshFederatedTokens(userId, provider);
          return refreshResult.sessionInfo;
        } catch (error) {
          this.logger.error(`❌ Error en auto-refresh: ${error.message}`);
          // Retornar sesión actual aunque esté próxima a expirar
        }
      }

      return sessionInfo;
      
    } catch (error) {
      this.logger.error(`❌ Error validando sesión federada: ${error.message}`);
      return null;
    }
  }

  /**
   * Invalidar sesión federada
   */
  async invalidateSession(userId: string, provider: string = 'google'): Promise<void> {
    try {
      const sessionKey = this.getSessionKey(userId, provider);
      
      // Remover del cache
      this.sessionCache.delete(sessionKey);

      // Limpiar metadatos de tokens en base de datos
      await this.clearUserTokenMetadata(userId);

      this.logger.log(`✅ Sesión invalidada: ${userId} (${provider})`);
      
    } catch (error) {
      this.logger.error(`❌ Error invalidando sesión: ${error.message}`);
    }
  }

  /**
   * Obtener información de sesión
   */
  async getSessionInfo(userId: string, provider: string = 'google'): Promise<SessionInfo | null> {
    return await this.validateFederatedSession(userId, provider);
  }

  /**
   * Limpiar sesiones expiradas (tarea de mantenimiento)
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      let cleanedCount = 0;
      const now = new Date();

      for (const [sessionKey, sessionInfo] of this.sessionCache.entries()) {
        if (sessionInfo.expiresAt < now) {
          this.sessionCache.delete(sessionKey);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        this.logger.log(`🧹 Limpiadas ${cleanedCount} sesiones expiradas del cache`);
      }

      return cleanedCount;
      
    } catch (error) {
      this.logger.error(`❌ Error limpiando sesiones expiradas: ${error.message}`);
      return 0;
    }
  }

  /**
   * Verificar si la sesión necesita refresh de tokens
   */
  private needsTokenRefresh(sessionInfo: SessionInfo): boolean {
    const now = new Date();
    const refreshThreshold = 5 * 60 * 1000; // 5 minutos antes de expirar
    
    return (sessionInfo.expiresAt.getTime() - now.getTime()) < refreshThreshold;
  }

  /**
   * Verificar si la sesión es válida
   */
  private isSessionValid(sessionInfo: SessionInfo): boolean {
    const now = new Date();
    return sessionInfo.isValid && sessionInfo.expiresAt > now;
  }

  /**
   * Realizar refresh de tokens
   */
  private async performTokenRefresh(sessionInfo: SessionInfo): Promise<CognitoTokens> {
    try {
      if (!sessionInfo.tokens.refreshToken) {
        throw new Error('Refresh token no disponible');
      }

      // Usar el servicio de Cognito para refrescar tokens
      return await this.cognitoService.refreshFederatedTokens(sessionInfo.tokens.refreshToken);
      
    } catch (error) {
      this.logger.error(`❌ Error en refresh de tokens: ${error.message}`);
      throw new UnauthorizedException('No se pudieron refrescar los tokens');
    }
  }

  /**
   * Cargar sesión desde base de datos
   */
  private async loadSessionFromDatabase(userId: string, provider: string): Promise<SessionInfo | null> {
    try {
      // Obtener usuario con metadatos de tokens
      const userProfile = await this.federatedUserService.findUserByFederatedProvider(provider, userId);
      
      if (!userProfile || !userProfile.cognitoIdentityId) {
        return null;
      }

      // Crear sesión básica (tokens necesitarían ser refrescados)
      const sessionInfo: SessionInfo = {
        userId: userProfile.id,
        cognitoIdentityId: userProfile.cognitoIdentityId,
        tokens: {
          accessToken: '', // Será refrescado
          idToken: '',
          refreshToken: '', // Necesitaría ser recuperado de forma segura
          expiresIn: 0,
        },
        expiresAt: new Date(0), // Forzar refresh
        refreshedAt: new Date(),
        provider,
        isValid: true,
      };

      return sessionInfo;
      
    } catch (error) {
      this.logger.error(`❌ Error cargando sesión desde BD: ${error.message}`);
      return null;
    }
  }

  /**
   * Actualizar metadatos de tokens en usuario
   */
  private async updateUserTokenMetadata(
    userId: string, 
    cognitoIdentityId: string | undefined, 
    tokens: CognitoTokens
  ): Promise<void> {
    try {
      const tokenMetadata: FederatedTokenMetadata = {
        cognitoIdentityId,
        lastTokenRefresh: new Date(),
        tokenExpiresAt: new Date(Date.now() + (tokens.expiresIn || 3600) * 1000),
        // No almacenar refresh token por seguridad
      };

      await this.federatedUserService.updateFederatedIdentity({
        userId,
        federatedIdentity: {
          provider: 'google',
          lastSyncAt: new Date(),
        },
        syncData: {
          tokenMetadata,
          refreshedAt: new Date(),
        },
      });
      
    } catch (error) {
      this.logger.error(`❌ Error actualizando metadatos de tokens: ${error.message}`);
    }
  }

  /**
   * Limpiar metadatos de tokens
   */
  private async clearUserTokenMetadata(userId: string): Promise<void> {
    try {
      await this.federatedUserService.updateFederatedIdentity({
        userId,
        federatedIdentity: {
          provider: 'google',
          lastSyncAt: new Date(),
        },
        syncData: {
          tokenMetadata: null,
          clearedAt: new Date(),
        },
      });
      
    } catch (error) {
      this.logger.error(`❌ Error limpiando metadatos de tokens: ${error.message}`);
    }
  }

  /**
   * Registrar evento de refresh de tokens
   */
  private async recordTokenRefreshEvent(
    userId: string, 
    provider: string, 
    success: boolean, 
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.federatedUserService.updateFederatedIdentity({
        userId,
        federatedIdentity: {
          provider,
          lastSyncAt: new Date(),
        },
        syncData: {
          refreshEvent: {
            timestamp: new Date(),
            success,
            errorMessage,
          },
        },
      });
      
    } catch (error) {
      this.logger.error(`❌ Error registrando evento de refresh: ${error.message}`);
    }
  }

  /**
   * Generar clave de sesión
   */
  private getSessionKey(userId: string, provider: string): string {
    return `${provider}:${userId}`;
  }

  /**
   * Esperar a que complete un refresh en progreso
   */
  private async waitForRefreshCompletion(sessionKey: string): Promise<void> {
    const maxWait = 10000; // 10 segundos máximo
    const checkInterval = 100; // Verificar cada 100ms
    let waited = 0;

    while (this.refreshInProgress.has(sessionKey) && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
  }

  /**
   * Inicializar limpieza automática de sesiones
   */
  onModuleInit() {
    // Limpiar sesiones expiradas cada 15 minutos
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 15 * 60 * 1000);

    this.logger.log('✅ Servicio de gestión de sesiones federadas inicializado');
  }
}