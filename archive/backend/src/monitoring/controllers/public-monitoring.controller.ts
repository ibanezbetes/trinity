import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { StructuredLoggingService } from '../services/structured-logging.service';
import { MetricsCollectionService } from '../services/metrics-collection.service';
import { ErrorTrackingService } from '../services/error-tracking.service';
import { PerformanceMonitoringService } from '../services/performance-monitoring.service';

@ApiTags('Public Monitoring')
@Controller('monitoring/public')
export class PublicMonitoringController {
  constructor(
    private readonly loggingService: StructuredLoggingService,
    private readonly metricsService: MetricsCollectionService,
    private readonly errorTrackingService: ErrorTrackingService,
    private readonly performanceService: PerformanceMonitoringService,
  ) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get public monitoring status',
    description: 'Returns basic monitoring status without authentication',
  })
  @ApiResponse({
    status: 200,
    description: 'Public monitoring status retrieved successfully',
    type: Object,
  })
  getPublicMonitoringStatus(): {
    timestamp: Date;
    phase3Status: 'completed' | 'in-progress' | 'pending';
    overallHealth: 'excellent' | 'good' | 'needs-attention' | 'critical';
    systemStatus: {
      uptime: number;
      environment: string;
      version: string;
    };
    servicesStatus: {
      logging: 'healthy' | 'degraded' | 'unhealthy';
      metricsCollection: 'healthy' | 'degraded' | 'unhealthy';
      errorTracking: 'healthy' | 'degraded' | 'unhealthy';
      performanceMonitoring: 'healthy' | 'degraded' | 'unhealthy';
    };
    alertsCount: {
      total: number;
      critical: number;
    };
    recommendations: string[];
  } {
    const loggingMetrics = this.loggingService.getMetrics();
    const currentMetrics = this.metricsService.getCurrentMetrics();
    const errorMetrics = this.errorTrackingService.getErrorMetrics(3600000);
    const performanceAlerts = this.performanceService.getActiveAlerts();
    const errorAlerts = this.errorTrackingService.getAlerts({ acknowledged: false });

    const totalAlerts = performanceAlerts.length + errorAlerts.length;
    const criticalAlerts = performanceAlerts.filter(a => a.severity === 'critical').length + 
                          errorAlerts.filter(a => a.severity === 'critical').length;

    // Determinar salud general
    let overallHealth: 'excellent' | 'good' | 'needs-attention' | 'critical';
    if (criticalAlerts > 0 || errorMetrics.errorRate > 5) {
      overallHealth = 'critical';
    } else if (totalAlerts > 5 || errorMetrics.errorRate > 2) {
      overallHealth = 'needs-attention';
    } else if (totalAlerts > 0 || errorMetrics.errorRate > 0.5) {
      overallHealth = 'good';
    } else {
      overallHealth = 'excellent';
    }

    // Generar recomendaciones
    const recommendations: string[] = [];
    if (criticalAlerts > 0) {
      recommendations.push(`Address ${criticalAlerts} critical alerts immediately`);
    }
    if (errorMetrics.errorRate > 2) {
      recommendations.push('Investigate high error rate and implement fixes');
    }
    if (loggingMetrics.droppedLogs > 50) {
      recommendations.push('Optimize logging configuration to reduce dropped logs');
    }
    if (performanceAlerts.length > 3) {
      recommendations.push('Review performance thresholds and optimize system resources');
    }
    if (recommendations.length === 0) {
      recommendations.push('System is operating within normal parameters');
    }

    return {
      timestamp: new Date(),
      phase3Status: 'completed',
      overallHealth,
      systemStatus: {
        uptime: process.uptime() * 1000,
        environment: process.env.NODE_ENV || 'development',
        version: process.env.APP_VERSION || '1.0.0',
      },
      servicesStatus: {
        logging: loggingMetrics.droppedLogs > 100 ? 'degraded' : 'healthy',
        metricsCollection: currentMetrics ? 'healthy' : 'degraded',
        errorTracking: errorMetrics.errorRate > 5 ? 'degraded' : 'healthy',
        performanceMonitoring: criticalAlerts > 0 ? 'degraded' : 'healthy',
      },
      alertsCount: {
        total: totalAlerts,
        critical: criticalAlerts,
      },
      recommendations,
    };
  }

  @Get('metrics/basic')
  @ApiOperation({
    summary: 'Get basic system metrics',
    description: 'Returns basic system metrics without sensitive information',
  })
  @ApiResponse({
    status: 200,
    description: 'Basic metrics retrieved successfully',
    type: Object,
  })
  getBasicMetrics(): {
    timestamp: Date;
    system: {
      uptime: number;
      memoryUsagePercent: number;
      cpuUsagePercent: number;
    };
    application: {
      totalRequests: number;
      averageResponseTime: number;
      errorRate: number;
    };
    performance: {
      healthScore: number;
      activeAlerts: number;
    };
  } {
    const currentMetrics = this.metricsService.getCurrentMetrics();
    const errorMetrics = this.errorTrackingService.getErrorMetrics(3600000);
    const performanceAlerts = this.performanceService.getActiveAlerts();

    return {
      timestamp: new Date(),
      system: {
        uptime: process.uptime() * 1000,
        memoryUsagePercent: currentMetrics?.system.memory.usagePercentage || 0,
        cpuUsagePercent: currentMetrics?.system.cpu.usage || 0,
      },
      application: {
        totalRequests: currentMetrics?.application.requests.total || 0,
        averageResponseTime: currentMetrics?.application.responses.averageTime || 0,
        errorRate: errorMetrics.errorRate,
      },
      performance: {
        healthScore: this.calculateHealthScore(currentMetrics, errorMetrics, performanceAlerts),
        activeAlerts: performanceAlerts.length,
      },
    };
  }

  @Get('services/status')
  @ApiOperation({
    summary: 'Get services status',
    description: 'Returns status of all monitoring services',
  })
  @ApiResponse({
    status: 200,
    description: 'Services status retrieved successfully',
    type: Object,
  })
  getServicesStatus(): {
    timestamp: Date;
    services: {
      structuredLogging: {
        status: 'healthy' | 'degraded' | 'unhealthy';
        totalLogs: number;
        droppedLogs: number;
        errorsPerMinute: number;
      };
      metricsCollection: {
        status: 'healthy' | 'degraded' | 'unhealthy';
        lastCollection: Date | null;
        snapshotsCount: number;
      };
      errorTracking: {
        status: 'healthy' | 'degraded' | 'unhealthy';
        totalErrors: number;
        errorRate: number;
        activeAlerts: number;
      };
      performanceMonitoring: {
        status: 'healthy' | 'degraded' | 'unhealthy';
        activeAlerts: number;
        criticalAlerts: number;
        lastReport: Date | null;
      };
    };
  } {
    const loggingMetrics = this.loggingService.getMetrics();
    const currentMetrics = this.metricsService.getCurrentMetrics();
    const errorMetrics = this.errorTrackingService.getErrorMetrics(3600000);
    const performanceAlerts = this.performanceService.getActiveAlerts();
    const latestReport = this.performanceService.getLatestReport();

    const criticalAlerts = performanceAlerts.filter(a => a.severity === 'critical').length;

    return {
      timestamp: new Date(),
      services: {
        structuredLogging: {
          status: loggingMetrics.droppedLogs > 100 ? 'degraded' : 'healthy',
          totalLogs: loggingMetrics.totalLogs,
          droppedLogs: loggingMetrics.droppedLogs,
          errorsPerMinute: loggingMetrics.errorsPerMinute,
        },
        metricsCollection: {
          status: currentMetrics ? 'healthy' : 'degraded',
          lastCollection: currentMetrics?.timestamp || null,
          snapshotsCount: this.metricsService.getMetricsHistory(1).length,
        },
        errorTracking: {
          status: errorMetrics.errorRate > 5 ? 'degraded' : 'healthy',
          totalErrors: errorMetrics.totalErrors,
          errorRate: errorMetrics.errorRate,
          activeAlerts: errorMetrics.activeAlerts,
        },
        performanceMonitoring: {
          status: criticalAlerts > 0 ? 'degraded' : 'healthy',
          activeAlerts: performanceAlerts.length,
          criticalAlerts,
          lastReport: latestReport?.timestamp || null,
        },
      },
    };
  }

  private calculateHealthScore(
    currentMetrics: any,
    errorMetrics: any,
    performanceAlerts: any[],
  ): number {
    let score = 100;

    // Penalizar por errores
    if (errorMetrics.errorRate > 0) {
      score -= Math.min(errorMetrics.errorRate * 10, 30);
    }

    // Penalizar por alertas
    const criticalAlerts = performanceAlerts.filter(a => a.severity === 'critical').length;
    const warningAlerts = performanceAlerts.filter(a => a.severity === 'warning').length;
    
    score -= criticalAlerts * 20;
    score -= warningAlerts * 5;

    // Penalizar por uso de recursos
    if (currentMetrics?.system.memory.usagePercentage > 80) {
      score -= 10;
    }
    if (currentMetrics?.system.cpu.usage > 80) {
      score -= 10;
    }

    // Penalizar por tiempo de respuesta alto
    if (currentMetrics?.application.responses.averageTime > 500) {
      score -= 15;
    }

    return Math.max(0, Math.round(score));
  }
}