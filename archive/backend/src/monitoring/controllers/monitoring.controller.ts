import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { StructuredLoggingService } from '../services/structured-logging.service';
import { MetricsCollectionService } from '../services/metrics-collection.service';
import { ErrorTrackingService } from '../services/error-tracking.service';
import { PerformanceMonitoringService } from '../services/performance-monitoring.service';
import type { LoggingMetrics } from '../services/structured-logging.service';
import type { MetricsSnapshot } from '../services/metrics-collection.service';
import type { ErrorTrackingMetrics, ErrorDetails, ErrorAlert } from '../services/error-tracking.service';
import type { PerformanceReport, RealTimeMetrics, PerformanceAlert } from '../services/performance-monitoring.service';

@ApiTags('Monitoring & Metrics')
@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly loggingService: StructuredLoggingService,
    private readonly metricsService: MetricsCollectionService,
    private readonly errorTrackingService: ErrorTrackingService,
    private readonly performanceService: PerformanceMonitoringService,
  ) {}

  // === LOGGING ENDPOINTS ===

  @Get('logs/metrics')
  @ApiOperation({
    summary: 'Get logging metrics',
    description: 'Returns comprehensive logging system metrics',
  })
  @ApiResponse({
    status: 200,
    description: 'Logging metrics retrieved successfully',
    type: Object,
  })
  getLoggingMetrics(): LoggingMetrics {
    return this.loggingService.getMetrics();
  }

  @Get('logs')
  @ApiOperation({
    summary: 'Get recent logs',
    description: 'Returns recent log entries with optional filtering',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of logs to return' })
  @ApiQuery({ name: 'level', required: false, type: String, description: 'Filter by log level' })
  @ApiResponse({
    status: 200,
    description: 'Logs retrieved successfully',
    type: Array,
  })
  getLogs(
    @Query('limit') limit?: number,
    @Query('level') level?: string,
  ) {
    return this.loggingService.getLogs(limit, level as any);
  }

  @Get('logs/search')
  @ApiOperation({
    summary: 'Search logs',
    description: 'Search through log entries by query string',
  })
  @ApiQuery({ name: 'q', required: true, type: String, description: 'Search query' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of results' })
  @ApiResponse({
    status: 200,
    description: 'Log search completed',
    type: Array,
  })
  searchLogs(
    @Query('q') query: string,
    @Query('limit') limit?: number,
  ) {
    return this.loggingService.searchLogs(query, limit);
  }

  @Post('logs/flush')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Flush log buffer',
    description: 'Manually flush the log buffer to output destinations',
  })
  @ApiResponse({
    status: 200,
    description: 'Log buffer flushed successfully',
  })
  async flushLogs(): Promise<{ message: string; timestamp: Date }> {
    await this.loggingService.flushLogs();
    return {
      message: 'Log buffer flushed successfully',
      timestamp: new Date(),
    };
  }

  // === METRICS ENDPOINTS ===

  @Get('metrics/current')
  @ApiOperation({
    summary: 'Get current metrics snapshot',
    description: 'Returns the most recent metrics snapshot',
  })
  @ApiResponse({
    status: 200,
    description: 'Current metrics retrieved successfully',
    type: Object,
  })
  getCurrentMetrics(): MetricsSnapshot | null {
    return this.metricsService.getCurrentMetrics();
  }

  @Get('metrics/history')
  @ApiOperation({
    summary: 'Get metrics history',
    description: 'Returns historical metrics data',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of snapshots to return' })
  @ApiResponse({
    status: 200,
    description: 'Metrics history retrieved successfully',
    type: Array,
  })
  getMetricsHistory(@Query('limit') limit?: number): MetricsSnapshot[] {
    return this.metricsService.getMetricsHistory(limit);
  }

  @Get('metrics/trend/:metric')
  @ApiOperation({
    summary: 'Get metric trend',
    description: 'Returns trend data for a specific metric over time',
  })
  @ApiParam({ name: 'metric', description: 'Metric path (e.g., system.cpu.usage)' })
  @ApiQuery({ name: 'timeRange', required: false, type: Number, description: 'Time range in milliseconds' })
  @ApiResponse({
    status: 200,
    description: 'Metric trend retrieved successfully',
    type: Array,
  })
  getMetricTrend(
    @Param('metric') metric: string,
    @Query('timeRange') timeRange?: number,
  ) {
    return this.metricsService.getMetricsTrend(metric, timeRange);
  }

  @Get('metrics/aggregated')
  @ApiOperation({
    summary: 'Get aggregated metrics',
    description: 'Returns aggregated metrics over a specified time range',
  })
  @ApiQuery({ name: 'timeRange', required: false, type: Number, description: 'Time range in milliseconds' })
  @ApiResponse({
    status: 200,
    description: 'Aggregated metrics retrieved successfully',
    type: Object,
  })
  getAggregatedMetrics(@Query('timeRange') timeRange?: number) {
    return this.metricsService.getAggregatedMetrics(timeRange);
  }

  // === ERROR TRACKING ENDPOINTS ===

  @Get('errors/metrics')
  @ApiOperation({
    summary: 'Get error tracking metrics',
    description: 'Returns comprehensive error tracking metrics',
  })
  @ApiQuery({ name: 'timeRange', required: false, type: Number, description: 'Time range in milliseconds' })
  @ApiResponse({
    status: 200,
    description: 'Error metrics retrieved successfully',
    type: Object,
  })
  getErrorMetrics(@Query('timeRange') timeRange?: number): ErrorTrackingMetrics {
    return this.errorTrackingService.getErrorMetrics(timeRange);
  }

  @Get('errors')
  @ApiOperation({
    summary: 'Get errors',
    description: 'Returns error list with optional filtering',
  })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Filter by error category' })
  @ApiQuery({ name: 'severity', required: false, type: String, description: 'Filter by error severity' })
  @ApiQuery({ name: 'resolved', required: false, type: Boolean, description: 'Filter by resolution status' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of errors to return' })
  @ApiResponse({
    status: 200,
    description: 'Errors retrieved successfully',
    type: Array,
  })
  getErrors(
    @Query('category') category?: string,
    @Query('severity') severity?: string,
    @Query('resolved') resolved?: boolean,
    @Query('limit') limit?: number,
  ): ErrorDetails[] {
    return this.errorTrackingService.getErrors({
      category,
      severity,
      resolved,
      limit,
    });
  }

  @Get('errors/:errorId')
  @ApiOperation({
    summary: 'Get error details',
    description: 'Returns detailed information about a specific error',
  })
  @ApiParam({ name: 'errorId', description: 'Error ID' })
  @ApiResponse({
    status: 200,
    description: 'Error details retrieved successfully',
    type: Object,
  })
  getError(@Param('errorId') errorId: string): ErrorDetails | null {
    const error = this.errorTrackingService.getError(errorId);
    return error || null;
  }

  @Put('errors/:errorId/resolve')
  @ApiOperation({
    summary: 'Resolve error',
    description: 'Mark an error as resolved with resolution details',
  })
  @ApiParam({ name: 'errorId', description: 'Error ID' })
  @ApiResponse({
    status: 200,
    description: 'Error resolved successfully',
    type: Object,
  })
  resolveError(
    @Param('errorId') errorId: string,
    @Body() body: { resolvedBy: string; resolution: string },
  ): { success: boolean; message: string } {
    const success = this.errorTrackingService.resolveError(
      errorId,
      body.resolvedBy,
      body.resolution,
    );

    return {
      success,
      message: success ? 'Error resolved successfully' : 'Error not found',
    };
  }

  @Get('errors/alerts')
  @ApiOperation({
    summary: 'Get error alerts',
    description: 'Returns error alerts with optional filtering',
  })
  @ApiQuery({ name: 'acknowledged', required: false, type: Boolean, description: 'Filter by acknowledgment status' })
  @ApiQuery({ name: 'severity', required: false, type: String, description: 'Filter by alert severity' })
  @ApiQuery({ name: 'type', required: false, type: String, description: 'Filter by alert type' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of alerts to return' })
  @ApiResponse({
    status: 200,
    description: 'Error alerts retrieved successfully',
    type: Array,
  })
  getErrorAlerts(
    @Query('acknowledged') acknowledged?: boolean,
    @Query('severity') severity?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: number,
  ): ErrorAlert[] {
    return this.errorTrackingService.getAlerts({
      acknowledged,
      severity,
      type,
      limit,
    });
  }

  @Put('errors/alerts/:alertId/acknowledge')
  @ApiOperation({
    summary: 'Acknowledge error alert',
    description: 'Mark an error alert as acknowledged',
  })
  @ApiParam({ name: 'alertId', description: 'Alert ID' })
  @ApiResponse({
    status: 200,
    description: 'Alert acknowledged successfully',
    type: Object,
  })
  acknowledgeErrorAlert(
    @Param('alertId') alertId: string,
    @Body() body: { acknowledgedBy: string },
  ): { success: boolean; message: string } {
    const success = this.errorTrackingService.acknowledgeAlert(
      alertId,
      body.acknowledgedBy,
    );

    return {
      success,
      message: success ? 'Alert acknowledged successfully' : 'Alert not found',
    };
  }

  @Get('errors/patterns')
  @ApiOperation({
    summary: 'Get error patterns',
    description: 'Returns detected error patterns',
  })
  @ApiResponse({
    status: 200,
    description: 'Error patterns retrieved successfully',
    type: Array,
  })
  getErrorPatterns() {
    return this.errorTrackingService.getErrorPatterns();
  }

  // === PERFORMANCE MONITORING ENDPOINTS ===

  @Get('performance/current')
  @ApiOperation({
    summary: 'Get current performance metrics',
    description: 'Returns the most recent performance metrics',
  })
  @ApiResponse({
    status: 200,
    description: 'Current performance metrics retrieved successfully',
    type: Object,
  })
  getCurrentPerformanceMetrics(): RealTimeMetrics | null {
    return this.performanceService.getCurrentMetrics();
  }

  @Get('performance/realtime')
  @ApiOperation({
    summary: 'Get realtime performance metrics',
    description: 'Returns recent realtime performance data',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of metrics to return' })
  @ApiResponse({
    status: 200,
    description: 'Realtime metrics retrieved successfully',
    type: Array,
  })
  getRealtimeMetrics(@Query('limit') limit?: number): RealTimeMetrics[] {
    return this.performanceService.getRealtimeMetrics(limit);
  }

  @Get('performance/reports')
  @ApiOperation({
    summary: 'Get performance reports',
    description: 'Returns performance reports history',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of reports to return' })
  @ApiResponse({
    status: 200,
    description: 'Performance reports retrieved successfully',
    type: Array,
  })
  getPerformanceReports(@Query('limit') limit?: number): PerformanceReport[] {
    return this.performanceService.getPerformanceReports(limit);
  }

  @Get('performance/reports/latest')
  @ApiOperation({
    summary: 'Get latest performance report',
    description: 'Returns the most recent performance report',
  })
  @ApiResponse({
    status: 200,
    description: 'Latest performance report retrieved successfully',
    type: Object,
  })
  getLatestPerformanceReport(): PerformanceReport | null {
    return this.performanceService.getLatestReport();
  }

  @Get('performance/alerts')
  @ApiOperation({
    summary: 'Get performance alerts',
    description: 'Returns active performance alerts',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance alerts retrieved successfully',
    type: Array,
  })
  getPerformanceAlerts(): PerformanceAlert[] {
    return this.performanceService.getActiveAlerts();
  }

  @Put('performance/alerts/:alertId/resolve')
  @ApiOperation({
    summary: 'Resolve performance alert',
    description: 'Mark a performance alert as resolved',
  })
  @ApiParam({ name: 'alertId', description: 'Alert ID' })
  @ApiResponse({
    status: 200,
    description: 'Performance alert resolved successfully',
    type: Object,
  })
  resolvePerformanceAlert(
    @Param('alertId') alertId: string,
  ): { success: boolean; message: string } {
    const success = this.performanceService.resolveAlert(alertId);

    return {
      success,
      message: success ? 'Alert resolved successfully' : 'Alert not found',
    };
  }

  @Get('performance/thresholds')
  @ApiOperation({
    summary: 'Get performance thresholds',
    description: 'Returns current performance monitoring thresholds',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance thresholds retrieved successfully',
    type: Array,
  })
  getPerformanceThresholds() {
    return this.performanceService.getThresholds();
  }

  @Put('performance/thresholds/:metric')
  @ApiOperation({
    summary: 'Update performance threshold',
    description: 'Update warning and critical thresholds for a specific metric',
  })
  @ApiParam({ name: 'metric', description: 'Metric name' })
  @ApiResponse({
    status: 200,
    description: 'Performance threshold updated successfully',
    type: Object,
  })
  updatePerformanceThreshold(
    @Param('metric') metric: string,
    @Body() body: { warning: number; critical: number },
  ): { success: boolean; message: string } {
    const success = this.performanceService.updateThreshold(
      metric,
      body.warning,
      body.critical,
    );

    return {
      success,
      message: success ? 'Threshold updated successfully' : 'Metric not found',
    };
  }

  // === DASHBOARD ENDPOINTS ===

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get monitoring dashboard data',
    description: 'Returns comprehensive dashboard data for monitoring overview',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data retrieved successfully',
    type: Object,
  })
  getDashboardData(): {
    timestamp: Date;
    overview: {
      systemHealth: 'healthy' | 'degraded' | 'unhealthy';
      activeAlerts: number;
      errorRate: number;
      responseTime: number;
      throughput: number;
      uptime: number;
    };
    metrics: {
      system: any;
      application: any;
      business: any;
    };
    alerts: {
      performance: PerformanceAlert[];
      errors: ErrorAlert[];
    };
    trends: {
      responseTime: any[];
      errorRate: any[];
      throughput: any[];
    };
  } {
    const currentMetrics = this.metricsService.getCurrentMetrics();
    const performanceMetrics = this.performanceService.getCurrentMetrics();
    const errorMetrics = this.errorTrackingService.getErrorMetrics(3600000); // 1 hour
    const performanceAlerts = this.performanceService.getActiveAlerts();
    const errorAlerts = this.errorTrackingService.getAlerts({ acknowledged: false, limit: 10 });

    // Determinar salud general del sistema
    const criticalAlerts = performanceAlerts.filter(a => a.severity === 'critical').length;
    const systemHealth = criticalAlerts > 0 ? 'unhealthy' : 
                        (performanceAlerts.length > 3 || errorMetrics.errorRate > 2) ? 'degraded' : 'healthy';

    return {
      timestamp: new Date(),
      overview: {
        systemHealth,
        activeAlerts: performanceAlerts.length + errorAlerts.length,
        errorRate: errorMetrics.errorRate,
        responseTime: performanceMetrics?.responseTime || 0,
        throughput: performanceMetrics?.throughput || 0,
        uptime: process.uptime() * 1000, // Convert to milliseconds
      },
      metrics: {
        system: currentMetrics?.system || {},
        application: currentMetrics?.application || {},
        business: currentMetrics?.business || {},
      },
      alerts: {
        performance: performanceAlerts.slice(0, 5), // Top 5 performance alerts
        errors: errorAlerts.slice(0, 5), // Top 5 error alerts
      },
      trends: {
        responseTime: this.metricsService.getMetricsTrend('application.responses.averageTime', 3600000),
        errorRate: this.metricsService.getMetricsTrend('application.requests.errorRate', 3600000),
        throughput: this.metricsService.getMetricsTrend('application.requests.perSecond', 3600000),
      },
    };
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Get monitoring summary',
    description: 'Returns a comprehensive summary of all monitoring systems',
  })
  @ApiResponse({
    status: 200,
    description: 'Monitoring summary retrieved successfully',
    type: Object,
  })
  getMonitoringSummary(): {
    timestamp: Date;
    phase3Status: 'completed' | 'in-progress' | 'pending';
    overallHealth: 'excellent' | 'good' | 'needs-attention' | 'critical';
    services: {
      logging: { status: string; metrics: LoggingMetrics };
      metricsCollection: { status: string; snapshots: number };
      errorTracking: { status: string; metrics: ErrorTrackingMetrics };
      performanceMonitoring: { status: string; alerts: number };
    };
    systemMetrics: {
      uptime: number;
      memoryUsage: number;
      cpuUsage: number;
      activeConnections: number;
    };
    alertsSummary: {
      total: number;
      critical: number;
      warnings: number;
      acknowledged: number;
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
    const acknowledgedAlerts = this.errorTrackingService.getAlerts({ acknowledged: true }).length;

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
      services: {
        logging: {
          status: loggingMetrics.droppedLogs > 100 ? 'degraded' : 'healthy',
          metrics: loggingMetrics,
        },
        metricsCollection: {
          status: currentMetrics ? 'healthy' : 'degraded',
          snapshots: this.metricsService.getMetricsHistory(1).length,
        },
        errorTracking: {
          status: errorMetrics.errorRate > 5 ? 'degraded' : 'healthy',
          metrics: errorMetrics,
        },
        performanceMonitoring: {
          status: criticalAlerts > 0 ? 'degraded' : 'healthy',
          alerts: performanceAlerts.length,
        },
      },
      systemMetrics: {
        uptime: process.uptime() * 1000,
        memoryUsage: currentMetrics?.system.memory.usagePercentage || 0,
        cpuUsage: currentMetrics?.system.cpu.usage || 0,
        activeConnections: currentMetrics?.application.websockets.connections || 0,
      },
      alertsSummary: {
        total: totalAlerts,
        critical: criticalAlerts,
        warnings: totalAlerts - criticalAlerts,
        acknowledged: acknowledgedAlerts,
      },
      recommendations,
    };
  }
}