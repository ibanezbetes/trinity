import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggingService } from './structured-logging.service';

export interface ErrorDetails {
  id: string;
  timestamp: Date;
  name: string;
  message: string;
  stack?: string;
  code?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'application' | 'database' | 'network' | 'security' | 'validation' | 'system';
  context: {
    userId?: string;
    sessionId?: string;
    requestId?: string;
    roomId?: string;
    endpoint?: string;
    method?: string;
    userAgent?: string;
    ip?: string;
    metadata?: Record<string, any>;
  };
  environment: string;
  service: string;
  version: string;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;
  occurrences: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  affectedUsers: Set<string>;
  relatedErrors: string[];
}

export interface ErrorPattern {
  id: string;
  pattern: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  occurrences: number;
  firstSeen: Date;
  lastSeen: Date;
  isActive: boolean;
  threshold: number;
  alertSent: boolean;
}

export interface ErrorAlert {
  id: string;
  timestamp: Date;
  type: 'threshold_exceeded' | 'new_error_pattern' | 'critical_error' | 'error_spike';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  errorId?: string;
  patternId?: string;
  count: number;
  timeWindow: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface ErrorTrackingMetrics {
  totalErrors: number;
  errorRate: number;
  errorsByCategory: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  topErrors: Array<{ errorId: string; count: number; message: string }>;
  errorTrends: Array<{ timestamp: Date; count: number }>;
  meanTimeToResolution: number;
  activeAlerts: number;
  resolvedErrors: number;
  affectedUsers: number;
}

@Injectable()
export class ErrorTrackingService {
  private readonly logger = new Logger(ErrorTrackingService.name);
  private readonly errors = new Map<string, ErrorDetails>();
  private readonly patterns = new Map<string, ErrorPattern>();
  private readonly alerts = new Map<string, ErrorAlert>();
  private readonly errorHistory: Array<{ timestamp: Date; errorId: string }> = [];
  
  private readonly config = {
    enabled: true,
    maxErrors: 10000,
    retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
    alertThresholds: {
      errorRate: 10, // errors per minute
      criticalErrors: 1, // immediate alert
      errorSpike: 5, // 5x normal rate
    },
    patternDetection: {
      enabled: true,
      minOccurrences: 3,
      timeWindow: 300000, // 5 minutes
    },
    notifications: {
      enabled: true,
      channels: ['email', 'slack', 'webhook'],
      criticalOnly: false,
    },
  };

  private cleanupTimer: NodeJS.Timeout;
  private patternDetectionTimer: NodeJS.Timeout;
  private alertCheckTimer: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggingService: StructuredLoggingService,
  ) {
    this.initializeErrorTracking();
  }

  private initializeErrorTracking(): void {
    // Configurar limpieza periódica
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldErrors();
    }, 3600000); // Cada hora

    // Configurar detección de patrones
    if (this.config.patternDetection.enabled) {
      this.patternDetectionTimer = setInterval(() => {
        this.detectErrorPatterns();
      }, this.config.patternDetection.timeWindow);
    }

    // Configurar verificación de alertas
    this.alertCheckTimer = setInterval(() => {
      this.checkAlertConditions();
    }, 60000); // Cada minuto

    this.loggingService.log('ErrorTrackingService initialized', {
      metadata: { config: this.config },
    });
  }

  public trackError(
    error: Error,
    context: ErrorDetails['context'] = {},
    severity: ErrorDetails['severity'] = 'medium',
    category: ErrorDetails['category'] = 'application',
  ): string {
    const errorId = this.generateErrorId(error, context);
    const now = new Date();

    let errorDetails = this.errors.get(errorId);

    if (errorDetails) {
      // Error existente, actualizar
      errorDetails.occurrences++;
      errorDetails.lastOccurrence = now;
      if (context.userId) {
        errorDetails.affectedUsers.add(context.userId);
      }
    } else {
      // Nuevo error
      errorDetails = {
        id: errorId,
        timestamp: now,
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
        severity,
        category,
        context,
        environment: this.configService.get<string>('NODE_ENV', 'development'),
        service: 'trinity-backend',
        version: this.configService.get<string>('APP_VERSION', '1.0.0'),
        resolved: false,
        occurrences: 1,
        firstOccurrence: now,
        lastOccurrence: now,
        affectedUsers: new Set(context.userId ? [context.userId] : []),
        relatedErrors: [],
      };

      this.errors.set(errorId, errorDetails);
    }

    // Agregar al historial
    this.errorHistory.push({ timestamp: now, errorId });

    // Log estructurado
    this.loggingService.error(
      `Error tracked: ${error.message}`,
      error,
      {
        ...context,
        metadata: { 
          ...context.metadata,
          errorId,
          severity,
          category,
          occurrences: errorDetails.occurrences,
        },
      },
    );

    // Verificar si necesita alerta inmediata
    if (severity === 'critical') {
      this.createAlert({
        type: 'critical_error',
        severity: 'critical',
        title: 'Critical Error Detected',
        description: `Critical error: ${error.message}`,
        errorId,
        count: 1,
        timeWindow: 0,
      });
    }

    return errorId;
  }

  private generateErrorId(error: Error, context: ErrorDetails['context']): string {
    // Generar ID único basado en el error y contexto
    const key = `${error.name}:${error.message}:${context.endpoint || 'unknown'}`;
    return Buffer.from(key).toString('base64').substring(0, 16);
  }

  public resolveError(errorId: string, resolvedBy: string, resolution: string): boolean {
    const error = this.errors.get(errorId);
    if (!error) return false;

    error.resolved = true;
    error.resolvedAt = new Date();
    error.resolvedBy = resolvedBy;
    error.resolution = resolution;

    this.loggingService.log('Error resolved', {
      metadata: {
        errorId,
        resolvedBy,
        resolution,
        occurrences: error.occurrences,
        duration: error.resolvedAt.getTime() - error.firstOccurrence.getTime(),
      },
    });

    return true;
  }

  public getError(errorId: string): ErrorDetails | undefined {
    return this.errors.get(errorId);
  }

  public getErrors(filters: {
    category?: string;
    severity?: string;
    resolved?: boolean;
    limit?: number;
    since?: Date;
  } = {}): ErrorDetails[] {
    let errors = Array.from(this.errors.values());

    // Aplicar filtros
    if (filters.category) {
      errors = errors.filter(e => e.category === filters.category);
    }
    if (filters.severity) {
      errors = errors.filter(e => e.severity === filters.severity);
    }
    if (filters.resolved !== undefined) {
      errors = errors.filter(e => e.resolved === filters.resolved);
    }
    if (filters.since) {
      errors = errors.filter(e => e.lastOccurrence >= filters.since!);
    }

    // Ordenar por última ocurrencia
    errors.sort((a, b) => b.lastOccurrence.getTime() - a.lastOccurrence.getTime());

    // Limitar resultados
    if (filters.limit) {
      errors = errors.slice(0, filters.limit);
    }

    return errors;
  }

  public getErrorMetrics(timeRange: number = 3600000): ErrorTrackingMetrics {
    const now = Date.now();
    const cutoffTime = now - timeRange;
    
    // Filtrar errores recientes
    const recentErrors = Array.from(this.errors.values()).filter(
      error => error.lastOccurrence.getTime() > cutoffTime
    );

    const recentHistory = this.errorHistory.filter(
      entry => entry.timestamp.getTime() > cutoffTime
    );

    // Calcular métricas
    const totalErrors = recentHistory.length;
    const errorRate = (totalErrors / (timeRange / 60000)); // errors per minute

    const errorsByCategory: Record<string, number> = {};
    const errorsBySeverity: Record<string, number> = {};
    let totalAffectedUsers = 0;

    recentErrors.forEach(error => {
      errorsByCategory[error.category] = (errorsByCategory[error.category] || 0) + error.occurrences;
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + error.occurrences;
      totalAffectedUsers += error.affectedUsers.size;
    });

    // Top errores
    const topErrors = recentErrors
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 10)
      .map(error => ({
        errorId: error.id,
        count: error.occurrences,
        message: error.message,
      }));

    // Tendencias (por hora)
    const errorTrends: Array<{ timestamp: Date; count: number }> = [];
    const hourlyBuckets = Math.ceil(timeRange / 3600000);
    
    for (let i = 0; i < hourlyBuckets; i++) {
      const bucketStart = now - ((i + 1) * 3600000);
      const bucketEnd = now - (i * 3600000);
      const bucketErrors = recentHistory.filter(
        entry => entry.timestamp.getTime() >= bucketStart && entry.timestamp.getTime() < bucketEnd
      );
      
      errorTrends.unshift({
        timestamp: new Date(bucketStart),
        count: bucketErrors.length,
      });
    }

    // MTTR (Mean Time To Resolution)
    const resolvedErrors = recentErrors.filter(error => error.resolved && error.resolvedAt);
    const mttr = resolvedErrors.length > 0
      ? resolvedErrors.reduce((sum, error) => {
          const resolutionTime = error.resolvedAt!.getTime() - error.firstOccurrence.getTime();
          return sum + resolutionTime;
        }, 0) / resolvedErrors.length
      : 0;

    return {
      totalErrors,
      errorRate,
      errorsByCategory,
      errorsBySeverity,
      topErrors,
      errorTrends,
      meanTimeToResolution: mttr,
      activeAlerts: Array.from(this.alerts.values()).filter(alert => !alert.acknowledged).length,
      resolvedErrors: resolvedErrors.length,
      affectedUsers: totalAffectedUsers,
    };
  }

  private detectErrorPatterns(): void {
    const now = Date.now();
    const timeWindow = this.config.patternDetection.timeWindow;
    const recentErrors = this.errorHistory.filter(
      entry => entry.timestamp.getTime() > (now - timeWindow)
    );

    // Agrupar errores por tipo
    const errorGroups: Record<string, number> = {};
    recentErrors.forEach(entry => {
      const error = this.errors.get(entry.errorId);
      if (error) {
        const key = `${error.name}:${error.category}`;
        errorGroups[key] = (errorGroups[key] || 0) + 1;
      }
    });

    // Detectar patrones
    Object.entries(errorGroups).forEach(([key, count]) => {
      if (count >= this.config.patternDetection.minOccurrences) {
        const patternId = Buffer.from(key).toString('base64').substring(0, 12);
        
        let pattern = this.patterns.get(patternId);
        if (!pattern) {
          pattern = {
            id: patternId,
            pattern: key,
            category: key.split(':')[1] || 'unknown',
            severity: count >= 10 ? 'high' : count >= 5 ? 'medium' : 'low',
            description: `Recurring error pattern: ${key}`,
            occurrences: count,
            firstSeen: new Date(),
            lastSeen: new Date(),
            isActive: true,
            threshold: this.config.patternDetection.minOccurrences,
            alertSent: false,
          };
          
          this.patterns.set(patternId, pattern);
          
          // Crear alerta para nuevo patrón
          this.createAlert({
            type: 'new_error_pattern',
            severity: pattern.severity,
            title: 'New Error Pattern Detected',
            description: `New error pattern detected: ${key} (${count} occurrences)`,
            patternId,
            count,
            timeWindow,
          });
        } else {
          pattern.occurrences += count;
          pattern.lastSeen = new Date();
        }
      }
    });
  }

  private checkAlertConditions(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Verificar rate de errores
    const recentErrors = this.errorHistory.filter(
      entry => entry.timestamp.getTime() > oneMinuteAgo
    );
    
    if (recentErrors.length > this.config.alertThresholds.errorRate) {
      this.createAlert({
        type: 'threshold_exceeded',
        severity: 'high',
        title: 'Error Rate Threshold Exceeded',
        description: `Error rate exceeded threshold: ${recentErrors.length} errors in the last minute`,
        count: recentErrors.length,
        timeWindow: 60000,
      });
    }

    // Verificar spikes de errores
    const fiveMinutesAgo = now - 300000;
    const recentErrorsExtended = this.errorHistory.filter(
      entry => entry.timestamp.getTime() > fiveMinutesAgo
    );
    
    const normalRate = recentErrorsExtended.length / 5; // errors per minute
    const currentRate = recentErrors.length;
    
    if (currentRate > (normalRate * this.config.alertThresholds.errorSpike)) {
      this.createAlert({
        type: 'error_spike',
        severity: 'high',
        title: 'Error Spike Detected',
        description: `Error spike detected: ${currentRate} errors/min vs ${normalRate.toFixed(1)} normal rate`,
        count: currentRate,
        timeWindow: 60000,
      });
    }
  }

  private createAlert(alertData: Omit<ErrorAlert, 'id' | 'timestamp' | 'acknowledged'>): void {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: ErrorAlert = {
      id: alertId,
      timestamp: new Date(),
      acknowledged: false,
      ...alertData,
    };

    this.alerts.set(alertId, alert);

    this.loggingService.warn('Error alert created', {
      metadata: {
        alertId,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        count: alert.count,
      },
    });

    // Enviar notificación si está habilitado
    if (this.config.notifications.enabled) {
      this.sendNotification(alert);
    }
  }

  private async sendNotification(alert: ErrorAlert): Promise<void> {
    // Implementar envío de notificaciones (email, Slack, webhook, etc.)
    // Por ahora solo log
    this.loggingService.log('Alert notification sent', {
      metadata: {
        alertId: alert.id,
        channels: this.config.notifications.channels,
        severity: alert.severity,
      },
    });
  }

  public acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    this.loggingService.log('Alert acknowledged', {
      metadata: {
        alertId,
        acknowledgedBy,
        acknowledgedAt: alert.acknowledgedAt,
      },
    });

    return true;
  }

  public getAlerts(filters: {
    acknowledged?: boolean;
    severity?: string;
    type?: string;
    limit?: number;
  } = {}): ErrorAlert[] {
    let alerts = Array.from(this.alerts.values());

    // Aplicar filtros
    if (filters.acknowledged !== undefined) {
      alerts = alerts.filter(a => a.acknowledged === filters.acknowledged);
    }
    if (filters.severity) {
      alerts = alerts.filter(a => a.severity === filters.severity);
    }
    if (filters.type) {
      alerts = alerts.filter(a => a.type === filters.type);
    }

    // Ordenar por timestamp
    alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Limitar resultados
    if (filters.limit) {
      alerts = alerts.slice(0, filters.limit);
    }

    return alerts;
  }

  public getErrorPatterns(): ErrorPattern[] {
    return Array.from(this.patterns.values())
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  }

  private cleanupOldErrors(): void {
    const cutoffTime = Date.now() - this.config.retentionPeriod;

    // Limpiar errores antiguos
    for (const [errorId, error] of this.errors.entries()) {
      if (error.lastOccurrence.getTime() < cutoffTime) {
        this.errors.delete(errorId);
      }
    }

    // Limpiar historial antiguo
    const oldHistoryLength = this.errorHistory.length;
    while (this.errorHistory.length > 0 && this.errorHistory[0].timestamp.getTime() < cutoffTime) {
      this.errorHistory.shift();
    }

    // Limpiar alertas antiguas
    for (const [alertId, alert] of this.alerts.entries()) {
      if (alert.timestamp.getTime() < cutoffTime) {
        this.alerts.delete(alertId);
      }
    }

    this.loggingService.debug('Old errors cleaned up', {
      metadata: {
        cutoffTime: new Date(cutoffTime),
        errorsRemoved: oldHistoryLength - this.errorHistory.length,
        remainingErrors: this.errors.size,
        remainingAlerts: this.alerts.size,
      },
    });
  }

  public async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    if (this.patternDetectionTimer) {
      clearInterval(this.patternDetectionTimer);
    }
    if (this.alertCheckTimer) {
      clearInterval(this.alertCheckTimer);
    }

    this.loggingService.log('ErrorTrackingService shutdown completed');
  }
}