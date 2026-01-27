import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggingService } from './structured-logging.service';
import { MetricsCollectionService } from './metrics-collection.service';

export interface PerformanceThreshold {
  metric: string;
  warning: number;
  critical: number;
  unit: string;
  description: string;
}

export interface PerformanceAlert {
  id: string;
  timestamp: Date;
  metric: string;
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
  description: string;
  context: Record<string, any>;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface PerformanceReport {
  timestamp: Date;
  period: string;
  summary: {
    overallHealth: 'excellent' | 'good' | 'degraded' | 'critical';
    score: number;
    alertsCount: number;
    thresholdViolations: number;
  };
  metrics: {
    responseTime: {
      average: number;
      p50: number;
      p95: number;
      p99: number;
      trend: 'improving' | 'stable' | 'degrading';
    };
    throughput: {
      requestsPerSecond: number;
      requestsPerMinute: number;
      trend: 'increasing' | 'stable' | 'decreasing';
    };
    resources: {
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
      networkIO: number;
    };
    database: {
      queryTime: number;
      connections: number;
      slowQueries: number;
      errorRate: number;
    };
    cache: {
      hitRate: number;
      missRate: number;
      evictionRate: number;
      responseTime: number;
    };
  };
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    description: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
  }>;
}

export interface RealTimeMetrics {
  timestamp: Date;
  responseTime: number;
  throughput: number;
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
  errorRate: number;
  cacheHitRate: number;
}

@Injectable()
export class PerformanceMonitoringService {
  private readonly logger = new Logger(PerformanceMonitoringService.name);
  private readonly alerts = new Map<string, PerformanceAlert>();
  private readonly realtimeMetrics: RealTimeMetrics[] = [];
  private readonly performanceHistory: PerformanceReport[] = [];
  
  private readonly thresholds: PerformanceThreshold[] = [
    {
      metric: 'response_time_avg',
      warning: 300,
      critical: 1000,
      unit: 'ms',
      description: 'Average API response time',
    },
    {
      metric: 'response_time_p95',
      warning: 500,
      critical: 2000,
      unit: 'ms',
      description: '95th percentile response time',
    },
    {
      metric: 'cpu_usage',
      warning: 70,
      critical: 90,
      unit: '%',
      description: 'CPU usage percentage',
    },
    {
      metric: 'memory_usage',
      warning: 75,
      critical: 90,
      unit: '%',
      description: 'Memory usage percentage',
    },
    {
      metric: 'disk_usage',
      warning: 80,
      critical: 95,
      unit: '%',
      description: 'Disk usage percentage',
    },
    {
      metric: 'error_rate',
      warning: 1,
      critical: 5,
      unit: '%',
      description: 'Error rate percentage',
    },
    {
      metric: 'database_query_time',
      warning: 100,
      critical: 500,
      unit: 'ms',
      description: 'Average database query time',
    },
    {
      metric: 'cache_hit_rate',
      warning: 70,
      critical: 50,
      unit: '%',
      description: 'Cache hit rate (lower is worse)',
    },
  ];

  private monitoringTimer: NodeJS.Timeout;
  private reportTimer: NodeJS.Timeout;
  private cleanupTimer: NodeJS.Timeout;

  private readonly config = {
    enabled: true,
    monitoringInterval: 10000, // 10 seconds
    reportInterval: 300000, // 5 minutes
    retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
    maxRealtimeMetrics: 8640, // 24 hours at 10s intervals
    maxReports: 288, // 24 hours at 5min intervals
    alertCooldown: 300000, // 5 minutes
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly loggingService: StructuredLoggingService,
    private readonly metricsService: MetricsCollectionService,
  ) {
    this.initializeMonitoring();
  }

  private initializeMonitoring(): void {
    if (!this.config.enabled) return;

    // Iniciar monitoreo en tiempo real
    this.monitoringTimer = setInterval(() => {
      this.collectRealtimeMetrics();
    }, this.config.monitoringInterval);

    // Iniciar generación de reportes
    this.reportTimer = setInterval(() => {
      this.generatePerformanceReport();
    }, this.config.reportInterval);

    // Iniciar limpieza periódica
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldData();
    }, 3600000); // Cada hora

    this.loggingService.log('PerformanceMonitoringService initialized', {
      metadata: {
        config: this.config,
        thresholds: this.thresholds.length,
      },
    });
  }

  private async collectRealtimeMetrics(): Promise<void> {
    try {
      const currentMetrics = this.metricsService.getCurrentMetrics();
      if (!currentMetrics) return;

      const realtimeData: RealTimeMetrics = {
        timestamp: new Date(),
        responseTime: currentMetrics.application.responses.averageTime,
        throughput: currentMetrics.application.requests.perSecond,
        cpuUsage: currentMetrics.system.cpu.usage,
        memoryUsage: currentMetrics.system.memory.usagePercentage,
        activeConnections: currentMetrics.application.websockets.connections,
        errorRate: this.calculateErrorRate(currentMetrics),
        cacheHitRate: currentMetrics.application.cache.hitRate,
      };

      this.addRealtimeMetrics(realtimeData);
      this.checkThresholds(realtimeData);

      this.loggingService.debug('Realtime metrics collected', {
        metadata: {
          responseTime: realtimeData.responseTime,
          throughput: realtimeData.throughput,
          cpuUsage: realtimeData.cpuUsage,
          memoryUsage: realtimeData.memoryUsage,
        },
      });

    } catch (error) {
      this.loggingService.error('Error collecting realtime metrics', error);
    }
  }

  private calculateErrorRate(metrics: any): number {
    const totalRequests = metrics.application.requests.perMinute;
    const errorRequests = Object.entries(metrics.application.requests.byStatus)
      .filter(([status]) => parseInt(status) >= 400)
      .reduce((sum, [, count]) => sum + (count as number), 0);
    
    return totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;
  }

  private addRealtimeMetrics(metrics: RealTimeMetrics): void {
    this.realtimeMetrics.push(metrics);

    // Mantener solo el número máximo de métricas
    if (this.realtimeMetrics.length > this.config.maxRealtimeMetrics) {
      this.realtimeMetrics.shift();
    }
  }

  private checkThresholds(metrics: RealTimeMetrics): void {
    const metricsMap = {
      response_time_avg: metrics.responseTime,
      response_time_p95: metrics.responseTime * 1.5, // Estimación
      cpu_usage: metrics.cpuUsage,
      memory_usage: metrics.memoryUsage,
      disk_usage: 50, // Simulado
      error_rate: metrics.errorRate,
      database_query_time: 45, // Simulado
      cache_hit_rate: metrics.cacheHitRate,
    };

    this.thresholds.forEach(threshold => {
      const value = metricsMap[threshold.metric];
      if (value === undefined) return;

      let severity: 'warning' | 'critical' | null = null;
      let thresholdValue: number = 0;

      // Para cache hit rate, menor es peor
      if (threshold.metric === 'cache_hit_rate') {
        if (value < threshold.critical) {
          severity = 'critical';
          thresholdValue = threshold.critical;
        } else if (value < threshold.warning) {
          severity = 'warning';
          thresholdValue = threshold.warning;
        }
      } else {
        // Para otras métricas, mayor es peor
        if (value > threshold.critical) {
          severity = 'critical';
          thresholdValue = threshold.critical;
        } else if (value > threshold.warning) {
          severity = 'warning';
          thresholdValue = threshold.warning;
        }
      }

      if (severity) {
        this.createPerformanceAlert(threshold.metric, value, thresholdValue, severity, {
          description: threshold.description,
          unit: threshold.unit,
          timestamp: metrics.timestamp,
        });
      }
    });
  }

  private createPerformanceAlert(
    metric: string,
    value: number,
    threshold: number,
    severity: 'warning' | 'critical',
    context: Record<string, any>,
  ): void {
    const alertId = `${metric}_${Date.now()}`;
    
    // Verificar cooldown para evitar spam de alertas
    const recentAlert = Array.from(this.alerts.values()).find(
      alert => alert.metric === metric && 
      !alert.resolved && 
      (Date.now() - alert.timestamp.getTime()) < this.config.alertCooldown
    );

    if (recentAlert) return;

    const alert: PerformanceAlert = {
      id: alertId,
      timestamp: new Date(),
      metric,
      value,
      threshold,
      severity,
      description: `${context.description} exceeded ${severity} threshold: ${value.toFixed(2)}${context.unit} > ${threshold}${context.unit}`,
      context,
      resolved: false,
    };

    this.alerts.set(alertId, alert);

    this.loggingService.warn('Performance alert created', {
      metadata: {
        alertId,
        metric,
        value,
        threshold,
        severity,
        description: alert.description,
      },
    });
  }

  private async generatePerformanceReport(): Promise<void> {
    try {
      const now = new Date();
      const reportPeriod = this.config.reportInterval;
      const recentMetrics = this.realtimeMetrics.filter(
        m => (now.getTime() - m.timestamp.getTime()) <= reportPeriod
      );

      if (recentMetrics.length === 0) return;

      const report = await this.buildPerformanceReport(recentMetrics, reportPeriod);
      this.addPerformanceReport(report);

      this.loggingService.log('Performance report generated', {
        metadata: {
          period: report.period,
          overallHealth: report.summary.overallHealth,
          score: report.summary.score,
          alertsCount: report.summary.alertsCount,
          recommendations: report.recommendations.length,
        },
      });

    } catch (error) {
      this.loggingService.error('Error generating performance report', error);
    }
  }

  private async buildPerformanceReport(
    metrics: RealTimeMetrics[],
    period: number,
  ): Promise<PerformanceReport> {
    const responseTimes = metrics.map(m => m.responseTime).sort((a, b) => a - b);
    const throughputs = metrics.map(m => m.throughput);
    const cpuUsages = metrics.map(m => m.cpuUsage);
    const memoryUsages = metrics.map(m => m.memoryUsage);

    // Calcular percentiles
    const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)] || 0;
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
    const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;

    // Calcular promedios
    const avgResponseTime = responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length || 0;
    const avgThroughput = throughputs.reduce((sum, tp) => sum + tp, 0) / throughputs.length || 0;
    const avgCpuUsage = cpuUsages.reduce((sum, cpu) => sum + cpu, 0) / cpuUsages.length || 0;
    const avgMemoryUsage = memoryUsages.reduce((sum, mem) => sum + mem, 0) / memoryUsages.length || 0;

    // Calcular tendencias (comparar con período anterior)
    const previousMetrics = this.realtimeMetrics.filter(m => {
      const metricTime = m.timestamp.getTime();
      const periodStart = Date.now() - (period * 2);
      const periodEnd = Date.now() - period;
      return metricTime >= periodStart && metricTime <= periodEnd;
    });

    const responseTimeTrend = this.calculateTrend(
      previousMetrics.map(m => m.responseTime),
      responseTimes
    );
    const throughputTrend = this.calculateThroughputTrend(
      previousMetrics.map(m => m.throughput),
      throughputs
    );

    // Contar alertas activas
    const activeAlerts = Array.from(this.alerts.values()).filter(
      alert => !alert.resolved && 
      (Date.now() - alert.timestamp.getTime()) <= period
    );

    // Calcular score de salud general
    const healthScore = this.calculateHealthScore({
      avgResponseTime,
      avgCpuUsage,
      avgMemoryUsage,
      errorRate: metrics[metrics.length - 1]?.errorRate || 0,
      cacheHitRate: metrics[metrics.length - 1]?.cacheHitRate || 0,
      alertsCount: activeAlerts.length,
    });

    const overallHealth = this.determineOverallHealth(healthScore, activeAlerts.length);

    // Generar recomendaciones
    const recommendations = this.generateRecommendations({
      avgResponseTime,
      avgCpuUsage,
      avgMemoryUsage,
      p95,
      activeAlerts,
      responseTimeTrend,
    });

    return {
      timestamp: new Date(),
      period: `${period / 1000}s`,
      summary: {
        overallHealth,
        score: healthScore,
        alertsCount: activeAlerts.length,
        thresholdViolations: activeAlerts.filter(a => a.severity === 'critical').length,
      },
      metrics: {
        responseTime: {
          average: avgResponseTime,
          p50,
          p95,
          p99,
          trend: responseTimeTrend,
        },
        throughput: {
          requestsPerSecond: avgThroughput,
          requestsPerMinute: avgThroughput * 60,
          trend: throughputTrend,
        },
        resources: {
          cpuUsage: avgCpuUsage,
          memoryUsage: avgMemoryUsage,
          diskUsage: 50, // Simulado
          networkIO: 1024, // Simulado KB/s
        },
        database: {
          queryTime: 45, // Simulado
          connections: 8, // Simulado
          slowQueries: 2, // Simulado
          errorRate: 0.1, // Simulado
        },
        cache: {
          hitRate: metrics[metrics.length - 1]?.cacheHitRate || 85,
          missRate: 100 - (metrics[metrics.length - 1]?.cacheHitRate || 85),
          evictionRate: 2, // Simulado
          responseTime: 5, // Simulado ms
        },
      },
      recommendations,
    };
  }

  private calculateTrend(previous: number[], current: number[]): 'improving' | 'stable' | 'degrading' {
    if (previous.length === 0 || current.length === 0) return 'stable';

    const prevAvg = previous.reduce((sum, val) => sum + val, 0) / previous.length;
    const currAvg = current.reduce((sum, val) => sum + val, 0) / current.length;
    
    const change = ((currAvg - prevAvg) / prevAvg) * 100;

    if (change < -5) return 'improving'; // Menor tiempo de respuesta es mejor
    if (change > 5) return 'degrading';
    return 'stable';
  }

  private calculateThroughputTrend(previous: number[], current: number[]): 'increasing' | 'stable' | 'decreasing' {
    if (previous.length === 0 || current.length === 0) return 'stable';

    const prevAvg = previous.reduce((sum, val) => sum + val, 0) / previous.length;
    const currAvg = current.reduce((sum, val) => sum + val, 0) / current.length;
    
    const change = ((currAvg - prevAvg) / prevAvg) * 100;

    if (change > 5) return 'increasing';
    if (change < -5) return 'decreasing';
    return 'stable';
  }

  private calculateHealthScore(metrics: {
    avgResponseTime: number;
    avgCpuUsage: number;
    avgMemoryUsage: number;
    errorRate: number;
    cacheHitRate: number;
    alertsCount: number;
  }): number {
    let score = 100;

    // Penalizar por tiempo de respuesta alto
    if (metrics.avgResponseTime > 300) score -= 20;
    else if (metrics.avgResponseTime > 200) score -= 10;

    // Penalizar por uso alto de CPU
    if (metrics.avgCpuUsage > 80) score -= 15;
    else if (metrics.avgCpuUsage > 60) score -= 8;

    // Penalizar por uso alto de memoria
    if (metrics.avgMemoryUsage > 85) score -= 15;
    else if (metrics.avgMemoryUsage > 70) score -= 8;

    // Penalizar por tasa de error alta
    if (metrics.errorRate > 2) score -= 25;
    else if (metrics.errorRate > 1) score -= 10;

    // Penalizar por baja tasa de cache hit
    if (metrics.cacheHitRate < 70) score -= 15;
    else if (metrics.cacheHitRate < 80) score -= 8;

    // Penalizar por alertas activas
    score -= metrics.alertsCount * 5;

    return Math.max(0, Math.min(100, score));
  }

  private determineOverallHealth(score: number, alertsCount: number): 'excellent' | 'good' | 'degraded' | 'critical' {
    if (alertsCount > 5 || score < 50) return 'critical';
    if (alertsCount > 2 || score < 70) return 'degraded';
    if (score < 85) return 'good';
    return 'excellent';
  }

  private generateRecommendations(context: {
    avgResponseTime: number;
    avgCpuUsage: number;
    avgMemoryUsage: number;
    p95: number;
    activeAlerts: PerformanceAlert[];
    responseTimeTrend: 'improving' | 'stable' | 'degrading';
  }): PerformanceReport['recommendations'] {
    const recommendations: PerformanceReport['recommendations'] = [];

    // Recomendaciones basadas en tiempo de respuesta
    if (context.avgResponseTime > 500) {
      recommendations.push({
        priority: 'high',
        category: 'performance',
        description: 'Optimize API response times - consider database query optimization and caching',
        impact: 'Reduce average response time by 30-50%',
        effort: 'medium',
      });
    }

    // Recomendaciones basadas en CPU
    if (context.avgCpuUsage > 75) {
      recommendations.push({
        priority: 'high',
        category: 'resources',
        description: 'High CPU usage detected - consider scaling horizontally or optimizing algorithms',
        impact: 'Improve system stability and response times',
        effort: 'high',
      });
    }

    // Recomendaciones basadas en memoria
    if (context.avgMemoryUsage > 80) {
      recommendations.push({
        priority: 'medium',
        category: 'resources',
        description: 'Memory usage is high - implement memory optimization and garbage collection tuning',
        impact: 'Prevent memory leaks and improve stability',
        effort: 'medium',
      });
    }

    // Recomendaciones basadas en P95
    if (context.p95 > 1000) {
      recommendations.push({
        priority: 'medium',
        category: 'performance',
        description: 'High P95 response time indicates performance bottlenecks for some requests',
        impact: 'Improve user experience for slowest requests',
        effort: 'medium',
      });
    }

    // Recomendaciones basadas en tendencias
    if (context.responseTimeTrend === 'degrading') {
      recommendations.push({
        priority: 'medium',
        category: 'monitoring',
        description: 'Response time trend is degrading - investigate recent changes and monitor closely',
        impact: 'Prevent further performance degradation',
        effort: 'low',
      });
    }

    // Recomendaciones basadas en alertas críticas
    const criticalAlerts = context.activeAlerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'alerts',
        description: `${criticalAlerts.length} critical performance alerts require immediate attention`,
        impact: 'Resolve critical performance issues',
        effort: 'high',
      });
    }

    return recommendations;
  }

  private addPerformanceReport(report: PerformanceReport): void {
    this.performanceHistory.push(report);

    // Mantener solo el número máximo de reportes
    if (this.performanceHistory.length > this.config.maxReports) {
      this.performanceHistory.shift();
    }
  }

  private cleanupOldData(): void {
    const cutoffTime = Date.now() - this.config.retentionPeriod;

    // Limpiar métricas en tiempo real antiguas
    const oldMetricsLength = this.realtimeMetrics.length;
    while (this.realtimeMetrics.length > 0 && 
           this.realtimeMetrics[0].timestamp.getTime() < cutoffTime) {
      this.realtimeMetrics.shift();
    }

    // Limpiar alertas antiguas resueltas
    for (const [alertId, alert] of this.alerts.entries()) {
      if (alert.resolved && alert.resolvedAt && alert.resolvedAt.getTime() < cutoffTime) {
        this.alerts.delete(alertId);
      }
    }

    this.loggingService.debug('Performance monitoring data cleaned up', {
      metadata: {
        cutoffTime: new Date(cutoffTime),
        metricsRemoved: oldMetricsLength - this.realtimeMetrics.length,
        remainingMetrics: this.realtimeMetrics.length,
        remainingAlerts: this.alerts.size,
      },
    });
  }

  // Métodos públicos
  public getCurrentMetrics(): RealTimeMetrics | null {
    return this.realtimeMetrics.length > 0 
      ? this.realtimeMetrics[this.realtimeMetrics.length - 1] 
      : null;
  }

  public getRealtimeMetrics(limit: number = 100): RealTimeMetrics[] {
    return this.realtimeMetrics
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  public getPerformanceReports(limit: number = 10): PerformanceReport[] {
    return this.performanceHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  public getLatestReport(): PerformanceReport | null {
    return this.performanceHistory.length > 0 
      ? this.performanceHistory[this.performanceHistory.length - 1] 
      : null;
  }

  public getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.resolved)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.resolved = true;
    alert.resolvedAt = new Date();

    this.loggingService.log('Performance alert resolved', {
      metadata: {
        alertId,
        metric: alert.metric,
        resolvedAt: alert.resolvedAt,
      },
    });

    return true;
  }

  public getThresholds(): PerformanceThreshold[] {
    return [...this.thresholds];
  }

  public updateThreshold(metric: string, warning: number, critical: number): boolean {
    const threshold = this.thresholds.find(t => t.metric === metric);
    if (!threshold) return false;

    threshold.warning = warning;
    threshold.critical = critical;

    this.loggingService.log('Performance threshold updated', {
      metadata: {
        metric,
        warning,
        critical,
      },
    });

    return true;
  }

  public async shutdown(): Promise<void> {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.loggingService.log('PerformanceMonitoringService shutdown completed');
  }
}