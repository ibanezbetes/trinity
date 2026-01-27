import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthCheckController } from './controllers/health-check.controller';
import { MonitoringController } from './controllers/monitoring.controller';
import { PublicMonitoringController } from './controllers/public-monitoring.controller';
import { StructuredLoggingService } from './services/structured-logging.service';
import { MetricsCollectionService } from './services/metrics-collection.service';
import { ErrorTrackingService } from './services/error-tracking.service';
import { PerformanceMonitoringService } from './services/performance-monitoring.service';

@Module({
  imports: [ConfigModule],
  controllers: [HealthCheckController, MonitoringController, PublicMonitoringController],
  providers: [
    StructuredLoggingService,
    MetricsCollectionService,
    ErrorTrackingService,
    PerformanceMonitoringService,
  ],
  exports: [
    StructuredLoggingService,
    MetricsCollectionService,
    ErrorTrackingService,
    PerformanceMonitoringService,
  ],
})
export class MonitoringModule {
  constructor(
    private readonly loggingService: StructuredLoggingService,
    private readonly metricsService: MetricsCollectionService,
    private readonly errorTrackingService: ErrorTrackingService,
    private readonly performanceService: PerformanceMonitoringService,
  ) {
    this.loggingService.log('MonitoringModule initialized', {
      metadata: {
        services: [
          'StructuredLoggingService',
          'MetricsCollectionService', 
          'ErrorTrackingService',
          'PerformanceMonitoringService',
        ],
        controllers: ['HealthCheckController', 'MonitoringController', 'PublicMonitoringController'],
      },
    });
  }
}