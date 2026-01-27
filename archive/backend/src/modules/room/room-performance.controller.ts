import { Controller, Get, Param, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomRefreshService } from './room-refresh.service';
import { MediaService } from '../media/media.service';

@ApiTags('Room Performance')
@ApiBearerAuth()
@Controller('rooms/:roomId/performance')
@UseGuards(JwtAuthGuard)
export class RoomPerformanceController {
  private readonly logger = new Logger(RoomPerformanceController.name);

  constructor(
    private roomRefreshService: RoomRefreshService,
    private mediaService: MediaService,
  ) {}

  @Get('refresh-stats')
  @ApiOperation({ summary: 'Get room refresh statistics' })
  @ApiResponse({
    status: 200,
    description: 'Room refresh statistics retrieved successfully',
  })
  async getRoomRefreshStats(@Param('roomId') roomId: string) {
    return this.roomRefreshService.getRoomRefreshStats(roomId);
  }

  @Get('cache-stats')
  @ApiOperation({ summary: 'Get media cache statistics' })
  @ApiResponse({
    status: 200,
    description: 'Cache statistics retrieved successfully',
  })
  async getCacheStats() {
    return {
      circuitBreaker: this.mediaService.getCircuitBreakerStats(),
      // Cache stats would be added here when MediaCacheService is properly integrated
    };
  }

  @Get('optimization-summary')
  @ApiOperation({ summary: 'Get performance optimization summary' })
  @ApiResponse({
    status: 200,
    description: 'Performance summary retrieved successfully',
  })
  async getOptimizationSummary(@Param('roomId') roomId: string) {
    const refreshStats = await this.roomRefreshService.getRoomRefreshStats(roomId);
    const cacheStats = this.mediaService.getCircuitBreakerStats();

    return {
      roomId,
      refreshStats,
      cacheStats,
      optimizations: {
        prefetchEnabled: true,
        autoRefreshEnabled: refreshStats.autoRefreshEnabled,
        cacheEnabled: true,
      },
      recommendations: this.generateOptimizationRecommendations(refreshStats),
    };
  }

  private generateOptimizationRecommendations(refreshStats: any): string[] {
    const recommendations: string[] = [];

    if (refreshStats.averageProgress > 80) {
      recommendations.push('Consider enabling more aggressive prefetching');
    }

    if (!refreshStats.autoRefreshEnabled) {
      recommendations.push('Enable auto-refresh for better user experience');
    }

    if (refreshStats.needsRefresh) {
      recommendations.push('Room content should be refreshed soon');
    }

    return recommendations;
  }
}