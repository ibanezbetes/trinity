import {
  Controller,
  Get,
  Post,
  Query,
  Body,
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import {
  DashboardOverview,
  UserBehaviorAnalytics,
  RoomPerformanceAnalytics,
  ContentPreferenceAnalytics,
  PredictiveInsights,
  TimeRange,
  ExportResponse,
} from './interfaces/analytics.interfaces';
import type { ExportRequest } from './interfaces/analytics.interfaces';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard/overview')
  @ApiOperation({
    summary: 'Get dashboard overview',
    description:
      'Returns comprehensive dashboard metrics including active users, room performance, and system health',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard overview retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        activeUsers: {
          type: 'object',
          properties: {
            current: { type: 'number', example: 45 },
            daily: { type: 'number', example: 120 },
            weekly: { type: 'number', example: 450 },
            monthly: { type: 'number', example: 1200 },
          },
        },
        roomMetrics: {
          type: 'object',
          properties: {
            activeRooms: { type: 'number', example: 8 },
            totalRoomsToday: { type: 'number', example: 25 },
            averageConsensusRate: { type: 'number', example: 0.78 },
            averageRoomDuration: { type: 'number', example: 1800 },
          },
        },
        contentMetrics: {
          type: 'object',
          properties: {
            totalVotesToday: { type: 'number', example: 340 },
            matchesFoundToday: { type: 'number', example: 28 },
            topGenres: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  genre: { type: 'string', example: 'Action' },
                  count: { type: 'number', example: 45 },
                },
              },
            },
          },
        },
        systemHealth: {
          type: 'object',
          properties: {
            apiResponseTime: { type: 'number', example: 185 },
            errorRate: { type: 'number', example: 0.02 },
            uptime: { type: 'number', example: 0.999 },
          },
        },
      },
    },
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date (ISO string)',
  })
  async getDashboardOverview(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<DashboardOverview> {
    const timeRange: TimeRange | undefined =
      startDate && endDate
        ? {
            startDate: new Date(startDate),
            endDate: new Date(endDate),
          }
        : undefined;

    return this.analyticsService.getDashboardOverview(timeRange);
  }

  @Get('users/behavior')
  @ApiOperation({
    summary: 'Get user behavior analytics',
    description:
      'Returns detailed user behavior metrics including engagement, retention, and session data',
  })
  @ApiResponse({
    status: 200,
    description: 'User behavior analytics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalUsers: { type: 'number', example: 2500 },
        activeUsers: {
          type: 'object',
          properties: {
            daily: { type: 'number', example: 120 },
            weekly: { type: 'number', example: 450 },
            monthly: { type: 'number', example: 1200 },
          },
        },
        sessionMetrics: {
          type: 'object',
          properties: {
            averageDuration: { type: 'number', example: 1200 },
            actionsPerSession: { type: 'number', example: 15 },
            bounceRate: { type: 'number', example: 0.25 },
          },
        },
        engagementMetrics: {
          type: 'object',
          properties: {
            votesPerUser: { type: 'number', example: 8.5 },
            roomsJoinedPerUser: { type: 'number', example: 2.3 },
            matchesFoundPerUser: { type: 'number', example: 1.8 },
          },
        },
        retentionMetrics: {
          type: 'object',
          properties: {
            day1: { type: 'number', example: 0.85 },
            day7: { type: 'number', example: 0.65 },
            day30: { type: 'number', example: 0.45 },
          },
        },
      },
    },
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: String,
    description: 'Specific user ID to analyze',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date (ISO string)',
  })
  async getUserBehaviorAnalytics(
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<UserBehaviorAnalytics> {
    const timeRange: TimeRange | undefined =
      startDate && endDate
        ? {
            startDate: new Date(startDate),
            endDate: new Date(endDate),
          }
        : undefined;

    return this.analyticsService.getUserBehaviorAnalytics(userId, timeRange);
  }

  @Get('rooms/performance')
  @ApiOperation({
    summary: 'Get room performance analytics',
    description:
      'Returns room performance metrics including consensus rates, completion rates, and optimization insights',
  })
  @ApiResponse({
    status: 200,
    description: 'Room performance analytics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalRooms: { type: 'number', example: 150 },
        completionRate: { type: 'number', example: 0.82 },
        averageMetrics: {
          type: 'object',
          properties: {
            duration: { type: 'number', example: 1800 },
            memberCount: { type: 'number', example: 4.2 },
            votesPerMatch: { type: 'number', example: 12.5 },
            timeToConsensus: { type: 'number', example: 900 },
          },
        },
        performanceDistribution: {
          type: 'object',
          properties: {
            highPerforming: { type: 'number', example: 0.35 },
            mediumPerforming: { type: 'number', example: 0.45 },
            lowPerforming: { type: 'number', example: 0.2 },
          },
        },
        optimizationInsights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              insight: {
                type: 'string',
                example:
                  'Rooms with 4-6 members have 23% higher consensus rates',
              },
              impact: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                example: 'high',
              },
              recommendation: {
                type: 'string',
                example: 'Suggest optimal member count during room creation',
              },
            },
          },
        },
      },
    },
  })
  @ApiQuery({
    name: 'roomId',
    required: false,
    type: String,
    description: 'Specific room ID to analyze',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date (ISO string)',
  })
  async getRoomPerformanceAnalytics(
    @Query('roomId') roomId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<RoomPerformanceAnalytics> {
    const timeRange: TimeRange | undefined =
      startDate && endDate
        ? {
            startDate: new Date(startDate),
            endDate: new Date(endDate),
          }
        : undefined;

    return this.analyticsService.getRoomPerformanceAnalytics(roomId, timeRange);
  }

  @Get('content/preferences')
  @ApiOperation({
    summary: 'Get content preference analytics',
    description:
      'Returns content preference analysis including genre preferences, trending content, and AI recommendation metrics',
  })
  @ApiResponse({
    status: 200,
    description: 'Content preference analytics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        genrePreferences: {
          type: 'object',
          additionalProperties: { type: 'number' },
          example: { Action: 0.28, Comedy: 0.22, Drama: 0.18 },
        },
        contentPerformance: {
          type: 'object',
          properties: {
            topRated: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  contentId: { type: 'string', example: '12345' },
                  rating: { type: 'number', example: 4.8 },
                },
              },
            },
            mostVoted: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  contentId: { type: 'string', example: '11111' },
                  votes: { type: 'number', example: 156 },
                },
              },
            },
            highestConsensus: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  contentId: { type: 'string', example: '33333' },
                  consensusRate: { type: 'number', example: 0.95 },
                },
              },
            },
          },
        },
        aiRecommendationMetrics: {
          type: 'object',
          properties: {
            totalRecommendations: { type: 'number', example: 450 },
            acceptanceRate: { type: 'number', example: 0.68 },
            effectivenessScore: { type: 'number', example: 0.75 },
          },
        },
        trendingContent: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              contentId: { type: 'string', example: '55555' },
              trendScore: { type: 'number', example: 0.92 },
              category: { type: 'string', example: 'Action' },
            },
          },
        },
      },
    },
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: String,
    description: 'Specific user ID to analyze preferences for',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date (ISO string)',
  })
  async getContentPreferenceAnalytics(
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ContentPreferenceAnalytics> {
    const timeRange: TimeRange | undefined =
      startDate && endDate
        ? {
            startDate: new Date(startDate),
            endDate: new Date(endDate),
          }
        : undefined;

    return this.analyticsService.getContentPreferenceAnalytics(
      userId,
      timeRange,
    );
  }

  @Get('insights/predictions')
  @ApiOperation({
    summary: 'Get predictive analytics insights',
    description:
      'Returns predictive insights including user churn predictions, room success predictions, and content trends',
  })
  @ApiResponse({
    status: 200,
    description: 'Predictive insights retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        userChurnPrediction: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'string', example: 'user123' },
              churnProbability: { type: 'number', example: 0.75 },
              riskFactors: {
                type: 'array',
                items: { type: 'string' },
                example: ['Low engagement', 'No recent room joins'],
              },
              recommendations: {
                type: 'array',
                items: { type: 'string' },
                example: [
                  'Send personalized content recommendations',
                  'Invite to popular rooms',
                ],
              },
            },
          },
        },
        roomSuccessPrediction: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              roomId: { type: 'string', example: 'room456' },
              successProbability: { type: 'number', example: 0.85 },
              optimizationSuggestions: {
                type: 'array',
                items: { type: 'string' },
                example: ['Add more diverse content', 'Invite active members'],
              },
            },
          },
        },
        contentTrends: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              genre: { type: 'string', example: 'Sci-Fi' },
              trendDirection: {
                type: 'string',
                enum: ['up', 'down', 'stable'],
                example: 'up',
              },
              confidence: { type: 'number', example: 0.82 },
              timeframe: { type: 'string', example: 'next 30 days' },
            },
          },
        },
      },
    },
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date (ISO string)',
  })
  async getPredictiveInsights(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<PredictiveInsights> {
    const timeRange: TimeRange | undefined =
      startDate && endDate
        ? {
            startDate: new Date(startDate),
            endDate: new Date(endDate),
          }
        : undefined;

    return this.analyticsService.generatePredictiveInsights(timeRange);
  }

  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Export analytics data',
    description: 'Initiates export of analytics data in specified format',
  })
  @ApiResponse({
    status: 202,
    description: 'Export request accepted and processing',
    schema: {
      type: 'object',
      properties: {
        exportId: { type: 'string', example: 'export_123456789' },
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'completed', 'failed'],
          example: 'pending',
        },
        message: {
          type: 'string',
          example: 'Export request accepted and will be processed',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid export request parameters',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async exportAnalyticsData(
    @Body() exportRequest: ExportRequest,
  ): Promise<{ exportId: string; status: string; message: string }> {
    // Mock implementation - in real scenario, this would queue an export job
    const exportId = `export_${Date.now()}`;

    // Validate export request
    if (
      !exportRequest.dataType ||
      !exportRequest.format ||
      !exportRequest.timeRange
    ) {
      throw new Error('Missing required export parameters');
    }

    return {
      exportId,
      status: 'pending',
      message: 'Export request accepted and will be processed',
    };
  }

  @Get('health')
  @ApiOperation({
    summary: 'Analytics system health check',
    description:
      'Returns the health status of the analytics system and its dependencies',
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics system health status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        services: {
          type: 'object',
          properties: {
            database: { type: 'boolean', example: true },
            eventProcessing: { type: 'boolean', example: true },
            metricsAggregation: { type: 'boolean', example: true },
            insightEngine: { type: 'boolean', example: true },
          },
        },
        timestamp: { type: 'string', format: 'date-time' },
        version: { type: 'string', example: '1.0.0' },
      },
    },
  })
  async getHealthStatus(): Promise<{
    status: string;
    services: Record<string, boolean>;
    timestamp: Date;
    version: string;
  }> {
    // Mock health check - in real scenario, check actual service health
    const services = {
      database: true,
      eventProcessing: true,
      metricsAggregation: true,
      insightEngine: true,
    };

    const allHealthy = Object.values(services).every((service) => service);

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      services,
      timestamp: new Date(),
      version: '1.0.0',
    };
  }
}
