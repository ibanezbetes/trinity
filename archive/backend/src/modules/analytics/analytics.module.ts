import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { RoomAnalyticsService } from './room-analytics.service';
import { RoomAnalyticsController } from './room-analytics.controller';
import { EventTracker } from './event-tracker.service';
import { MetricsCollector } from './metrics-collector.service';
import { InsightEngine } from './insight-engine.service';
import { PerformanceMonitor } from './performance-monitor.service';
import { DatabaseModule } from '../../infrastructure/database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [
    AnalyticsService,
    RoomAnalyticsService,
    EventTracker,
    MetricsCollector,
    InsightEngine,
    PerformanceMonitor,
  ],
  controllers: [AnalyticsController, RoomAnalyticsController],
  exports: [
    AnalyticsService,
    RoomAnalyticsService,
    EventTracker,
    MetricsCollector,
    InsightEngine,
    PerformanceMonitor,
  ],
})
export class AnalyticsModule {}
