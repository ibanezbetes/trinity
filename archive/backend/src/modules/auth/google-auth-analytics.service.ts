import { Injectable, Logger } from '@nestjs/common';
import { EventTracker } from '../analytics/event-tracker.service';
import { EventType } from '../analytics/interfaces/analytics.interfaces';

export interface GoogleAuthMetrics {
  totalAttempts: number;
  successfulLogins: number;
  failedLogins: number;
  federatedLogins: number;
  legacyLogins: number;
  accountLinkings: number;
  accountUnlinkings: number;
  tokenRefreshes: number;
  averageResponseTime: number;
  errorRate: number;
}

export interface GoogleAuthEvent {
  eventType: 'login_attempt' | 'login_success' | 'login_failure' | 'account_linked' | 'account_unlinked' | 'token_refreshed' | 'configuration_error';
  userId?: string;
  provider: string;
  method: 'federated' | 'legacy';
  timestamp: Date;
  duration?: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class GoogleAuthAnalyticsService {
  private readonly logger = new Logger(GoogleAuthAnalyticsService.name);
  private readonly metrics: GoogleAuthMetrics = {
    totalAttempts: 0,
    successfulLogins: 0,
    failedLogins: 0,
    federatedLogins: 0,
    legacyLogins: 0,
    accountLinkings: 0,
    accountUnlinkings: 0,
    tokenRefreshes: 0,
    averageResponseTime: 0,
    errorRate: 0,
  };

  private readonly responseTimes: number[] = [];
  private readonly maxResponseTimeHistory = 100;

  constructor(
    private eventTracker: EventTracker,
  ) {}

  /**
   * Registrar intento de login con Google
   */
  async trackLoginAttempt(
    userId: string | undefined,
    method: 'federated' | 'legacy',
    startTime: number
  ): Promise<void> {
    try {
      const duration = Date.now() - startTime;
      
      // Actualizar métricas
      this.metrics.totalAttempts++;
      this.updateResponseTime(duration);

      this.logger.log(`📊 Login attempt tracked: ${method} (${duration}ms)`);
      
    } catch (error) {
      this.logger.error(`❌ Error tracking login attempt: ${error.message}`);
    }
  }

  /**
   * Registrar login exitoso
   */
  async trackLoginSuccess(
    userId: string,
    method: 'federated' | 'legacy',
    startTime: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const duration = Date.now() - startTime;
      
      // Actualizar métricas
      this.metrics.successfulLogins++;
      if (method === 'federated') {
        this.metrics.federatedLogins++;
      } else {
        this.metrics.legacyLogins++;
      }
      this.updateErrorRate();

      // Event tracking
      await this.eventTracker.trackUserAction(
        userId,
        EventType.USER_LOGIN,
        {
          loginMethod: `google_${method}`,
          provider: 'google',
          duration,
          success: true,
        },
        {
          source: 'google_auth_analytics',
          userAgent: 'backend',
        }
      );

      this.logger.log(`✅ Login success tracked: ${userId} via ${method} (${duration}ms)`);
      
    } catch (error) {
      this.logger.error(`❌ Error tracking login success: ${error.message}`);
    }
  }

  /**
   * Registrar login fallido
   */
  async trackLoginFailure(
    userId: string | undefined,
    method: 'federated' | 'legacy',
    startTime: number,
    errorCode: string,
    errorMessage: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const duration = Date.now() - startTime;
      
      // Actualizar métricas
      this.metrics.failedLogins++;
      this.updateErrorRate();

      this.logger.warn(`⚠️ Login failure tracked: ${errorCode} via ${method} (${duration}ms)`);
      
    } catch (error) {
      this.logger.error(`❌ Error tracking login failure: ${error.message}`);
    }
  }

  /**
   * Registrar vinculación de cuenta
   */
  async trackAccountLinking(
    userId: string,
    success: boolean,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      if (success) {
        this.metrics.accountLinkings++;
      }

      this.logger.log(`🔗 Account linking tracked: ${userId} (${success ? 'success' : 'failure'})`);
      
    } catch (error) {
      this.logger.error(`❌ Error tracking account linking: ${error.message}`);
    }
  }

  /**
   * Registrar desvinculación de cuenta
   */
  async trackAccountUnlinking(
    userId: string,
    success: boolean,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      if (success) {
        this.metrics.accountUnlinkings++;
      }

      this.logger.log(`🔓 Account unlinking tracked: ${userId} (${success ? 'success' : 'failure'})`);
      
    } catch (error) {
      this.logger.error(`❌ Error tracking account unlinking: ${error.message}`);
    }
  }

  /**
   * Registrar refresh de tokens
   */
  async trackTokenRefresh(
    userId: string,
    success: boolean,
    duration: number,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      if (success) {
        this.metrics.tokenRefreshes++;
      }

      this.logger.log(`🔄 Token refresh tracked: ${userId} (${success ? 'success' : 'failure'}, ${duration}ms)`);
      
    } catch (error) {
      this.logger.error(`❌ Error tracking token refresh: ${error.message}`);
    }
  }

  /**
   * Registrar error de configuración
   */
  async trackConfigurationError(
    errorCode: string,
    errorMessage: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      this.logger.error(`⚙️ Configuration error tracked: ${errorCode} - ${errorMessage}`);
      
    } catch (error) {
      this.logger.error(`❌ Error tracking configuration error: ${error.message}`);
    }
  }

  /**
   * Obtener métricas actuales
   */
  getMetrics(): GoogleAuthMetrics {
    return { ...this.metrics };
  }

  /**
   * Obtener métricas detalladas para health check
   */
  async getHealthMetrics(): Promise<Record<string, any>> {
    try {
      return {
        googleAuth: {
          ...this.metrics,
          healthScore: this.calculateHealthScore(),
          lastUpdated: new Date(),
        },
        system: {
          uptime: process.uptime(),
        },
      };
      
    } catch (error) {
      this.logger.error(`❌ Error getting health metrics: ${error.message}`);
      return {
        googleAuth: this.metrics,
        error: error.message,
      };
    }
  }

  /**
   * Resetear métricas (para testing o mantenimiento)
   */
  resetMetrics(): void {
    Object.keys(this.metrics).forEach(key => {
      (this.metrics as any)[key] = 0;
    });
    this.responseTimes.length = 0;
    
    this.logger.log('📊 Métricas de Google Auth reseteadas');
  }

  /**
   * Actualizar tiempo de respuesta promedio
   */
  private updateResponseTime(duration: number): void {
    this.responseTimes.push(duration);
    
    // Mantener solo los últimos N tiempos de respuesta
    if (this.responseTimes.length > this.maxResponseTimeHistory) {
      this.responseTimes.shift();
    }
    
    // Calcular promedio
    this.metrics.averageResponseTime = 
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  /**
   * Actualizar tasa de error
   */
  private updateErrorRate(): void {
    const totalAttempts = this.metrics.totalAttempts;
    if (totalAttempts > 0) {
      this.metrics.errorRate = (this.metrics.failedLogins / totalAttempts) * 100;
    }
  }

  /**
   * Calcular puntuación de salud
   */
  private calculateHealthScore(): number {
    const successRate = this.metrics.totalAttempts > 0 
      ? (this.metrics.successfulLogins / this.metrics.totalAttempts) * 100 
      : 100;
    
    const responseTimeScore = this.metrics.averageResponseTime < 1000 ? 100 : 
                             this.metrics.averageResponseTime < 3000 ? 80 : 
                             this.metrics.averageResponseTime < 5000 ? 60 : 40;
    
    const errorRateScore = this.metrics.errorRate < 1 ? 100 :
                          this.metrics.errorRate < 5 ? 80 :
                          this.metrics.errorRate < 10 ? 60 : 40;
    
    return Math.round((successRate * 0.5) + (responseTimeScore * 0.3) + (errorRateScore * 0.2));
  }

  /**
   * Inicializar métricas periódicas
   */
  onModuleInit() {
    this.logger.log('✅ Servicio de analytics de Google Auth inicializado');
  }
}