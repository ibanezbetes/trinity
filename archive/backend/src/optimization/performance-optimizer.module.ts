import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { PerformanceOptimizerController } from './performance-optimizer.controller';
import { DatabaseOptimizerService } from './database-optimizer.service';
import { APIOptimizerService } from './api-optimizer.service';
import { RealtimeOptimizerService } from './realtime-optimizer.service';
import { ConnectionPoolService } from './services/connection-pool.service';
import { CacheOptimizationService } from './services/cache-optimization.service';
import { MemoryManagerService } from './services/memory-manager.service';
import { StaticAssetOptimizationService } from './services/static-asset-optimization.service';
import { CompressionMiddleware } from './middleware/compression.middleware';
import { DatabaseModule } from '../infrastructure/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [PerformanceOptimizerController],
  providers: [
    // Existing optimization services
    DatabaseOptimizerService,
    APIOptimizerService,
    RealtimeOptimizerService,
    
    // New Phase 2 optimization services
    ConnectionPoolService,
    CacheOptimizationService,
    MemoryManagerService,
    StaticAssetOptimizationService,
    
    // Middleware
    CompressionMiddleware,
  ],
  exports: [
    // Existing services
    DatabaseOptimizerService,
    APIOptimizerService,
    RealtimeOptimizerService,
    
    // New services
    ConnectionPoolService,
    CacheOptimizationService,
    MemoryManagerService,
    StaticAssetOptimizationService,
    
    // Middleware
    CompressionMiddleware,
  ],
})
export class PerformanceOptimizerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply compression middleware to all routes
    consumer.apply(CompressionMiddleware).forRoutes('*');
  }
}
