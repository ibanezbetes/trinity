import {
  Controller,
  Get,
  Query,
  UseGuards,
  Logger,
  ParseDatePipe,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomAnalyticsService } from './room-analytics.service';
import { AnalyticsService } from './analytics.service';
import {
  AdvancedRoomAnalytics,
  TemplateAnalytics,
  ThemeAnalytics,
  ScheduleAnalytics,
  ModerationAnalytics,
  SettingsAnalytics,
  MemberEngagementAnalytics,
  RoomPerformanceScoring,
  TimeRange,
} from './interfaces/analytics.interfaces';

@Controller('analytics/rooms')
@UseGuards(JwtAuthGuard)
export class RoomAnalyticsController {
  private readonly logger = new Logger(RoomAnalyticsController.name);

  constructor(
    private readonly roomAnalyticsService: RoomAnalyticsService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  /**
   * 📊 Get comprehensive advanced room analytics
   * GET /analytics/rooms/advanced
   */
  @Get('advanced')
  async getAdvancedRoomAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<AdvancedRoomAnalytics> {
    try {
      this.logger.log('📊 Getting advanced room analytics...');

      const timeRange = this.parseTimeRange(startDate, endDate);
      const analytics =
        await this.roomAnalyticsService.getAdvancedRoomAnalytics(timeRange);

      this.logger.log('📊 Advanced room analytics retrieved successfully');
      return analytics;
    } catch (error) {
      this.logger.error('❌ Error getting advanced room analytics:', error);
      throw new BadRequestException('Failed to get advanced room analytics');
    }
  }

  /**
   * 📋 Get template analytics
   * GET /analytics/rooms/templates
   */
  @Get('templates')
  async getTemplateAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<TemplateAnalytics> {
    try {
      this.logger.log('📋 Getting template analytics...');

      const timeRange = this.parseTimeRange(startDate, endDate);
      const analytics = await this.roomAnalyticsService.getTemplateAnalytics(
        timeRange?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        timeRange?.endDate || new Date(),
      );

      this.logger.log('📋 Template analytics retrieved successfully');
      return analytics;
    } catch (error) {
      this.logger.error('❌ Error getting template analytics:', error);
      throw new BadRequestException('Failed to get template analytics');
    }
  }

  /**
   * 🎨 Get theme analytics
   * GET /analytics/rooms/themes
   */
  @Get('themes')
  async getThemeAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ThemeAnalytics> {
    try {
      this.logger.log('🎨 Getting theme analytics...');

      const timeRange = this.parseTimeRange(startDate, endDate);
      const analytics = await this.roomAnalyticsService.getThemeAnalytics(
        timeRange?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        timeRange?.endDate || new Date(),
      );

      this.logger.log('🎨 Theme analytics retrieved successfully');
      return analytics;
    } catch (error) {
      this.logger.error('❌ Error getting theme analytics:', error);
      throw new BadRequestException('Failed to get theme analytics');
    }
  }

  /**
   * 📅 Get schedule analytics
   * GET /analytics/rooms/schedules
   */
  @Get('schedules')
  async getScheduleAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ScheduleAnalytics> {
    try {
      this.logger.log('📅 Getting schedule analytics...');

      const timeRange = this.parseTimeRange(startDate, endDate);
      const analytics = await this.roomAnalyticsService.getScheduleAnalytics(
        timeRange?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        timeRange?.endDate || new Date(),
      );

      this.logger.log('📅 Schedule analytics retrieved successfully');
      return analytics;
    } catch (error) {
      this.logger.error('❌ Error getting schedule analytics:', error);
      throw new BadRequestException('Failed to get schedule analytics');
    }
  }

  /**
   * 🛡️ Get moderation analytics
   * GET /analytics/rooms/moderation
   */
  @Get('moderation')
  async getModerationAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ModerationAnalytics> {
    try {
      this.logger.log('🛡️ Getting moderation analytics...');

      const timeRange = this.parseTimeRange(startDate, endDate);
      const analytics = await this.roomAnalyticsService.getModerationAnalytics(
        timeRange?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        timeRange?.endDate || new Date(),
      );

      this.logger.log('🛡️ Moderation analytics retrieved successfully');
      return analytics;
    } catch (error) {
      this.logger.error('❌ Error getting moderation analytics:', error);
      throw new BadRequestException('Failed to get moderation analytics');
    }
  }

  /**
   * ⚙️ Get settings analytics
   * GET /analytics/rooms/settings
   */
  @Get('settings')
  async getSettingsAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<SettingsAnalytics> {
    try {
      this.logger.log('⚙️ Getting settings analytics...');

      const timeRange = this.parseTimeRange(startDate, endDate);
      const analytics = await this.roomAnalyticsService.getSettingsAnalytics(
        timeRange?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        timeRange?.endDate || new Date(),
      );

      this.logger.log('⚙️ Settings analytics retrieved successfully');
      return analytics;
    } catch (error) {
      this.logger.error('❌ Error getting settings analytics:', error);
      throw new BadRequestException('Failed to get settings analytics');
    }
  }

  /**
   * 👥 Get member engagement analytics
   * GET /analytics/rooms/engagement
   */
  @Get('engagement')
  async getMemberEngagementAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<MemberEngagementAnalytics> {
    try {
      this.logger.log('👥 Getting member engagement analytics...');

      const timeRange = this.parseTimeRange(startDate, endDate);
      const analytics =
        await this.roomAnalyticsService.getMemberEngagementAnalytics(
          timeRange?.startDate ||
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          timeRange?.endDate || new Date(),
        );

      this.logger.log('👥 Member engagement analytics retrieved successfully');
      return analytics;
    } catch (error) {
      this.logger.error('❌ Error getting member engagement analytics:', error);
      throw new BadRequestException(
        'Failed to get member engagement analytics',
      );
    }
  }

  /**
   * 🏆 Get room performance scoring
   * GET /analytics/rooms/performance
   */
  @Get('performance')
  async getRoomPerformanceScoring(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<RoomPerformanceScoring> {
    try {
      this.logger.log('🏆 Getting room performance scoring...');

      const timeRange = this.parseTimeRange(startDate, endDate);
      const scoring = await this.roomAnalyticsService.getRoomPerformanceScoring(
        timeRange?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        timeRange?.endDate || new Date(),
      );

      this.logger.log('🏆 Room performance scoring retrieved successfully');
      return scoring;
    } catch (error) {
      this.logger.error('❌ Error getting room performance scoring:', error);
      throw new BadRequestException('Failed to get room performance scoring');
    }
  }

  /**
   * 📈 Get comprehensive room performance dashboard
   * GET /analytics/rooms/dashboard
   */
  @Get('dashboard')
  async getRoomPerformanceDashboard(
    @Query('roomId') roomId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<any> {
    try {
      this.logger.log(
        `📈 Getting room performance dashboard${roomId ? ` for room ${roomId}` : ''}...`,
      );

      const timeRange = this.parseTimeRange(startDate, endDate);
      const dashboard = await this.analyticsService.getRoomPerformanceDashboard(
        roomId,
        timeRange,
      );

      this.logger.log('📈 Room performance dashboard retrieved successfully');
      return dashboard;
    } catch (error) {
      this.logger.error('❌ Error getting room performance dashboard:', error);
      throw new BadRequestException('Failed to get room performance dashboard');
    }
  }

  /**
   * 📊 Get analytics summary for specific room
   * GET /analytics/rooms/:roomId/summary
   */
  @Get(':roomId/summary')
  async getRoomAnalyticsSummary(
    @Query('roomId') roomId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<any> {
    try {
      this.logger.log(`📊 Getting analytics summary for room ${roomId}...`);

      const timeRange = this.parseTimeRange(startDate, endDate);

      // Get room-specific analytics
      const [advancedAnalytics, performanceScoring] = await Promise.all([
        this.roomAnalyticsService.getAdvancedRoomAnalytics(timeRange),
        this.roomAnalyticsService.getRoomPerformanceScoring(
          timeRange?.startDate ||
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          timeRange?.endDate || new Date(),
        ),
      ]);

      const summary = {
        roomId,
        timeRange: {
          startDate:
            timeRange?.startDate ||
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endDate: timeRange?.endDate || new Date(),
        },
        performanceScore: performanceScoring.overallScore,
        keyMetrics: {
          templateUsage:
            advancedAnalytics.templateAnalytics.templateUsageStats.totalUsages,
          themeApplications:
            advancedAnalytics.themeAnalytics.themeUsageStats.totalApplications,
          scheduledSessions:
            advancedAnalytics.scheduleAnalytics.scheduleAttendanceStats
              .totalScheduledSessions,
          moderationActions:
            advancedAnalytics.moderationAnalytics.moderationActionStats
              .totalActions,
        },
        recommendations: performanceScoring.improvementRecommendations.slice(
          0,
          3,
        ),
      };

      this.logger.log(
        `📊 Analytics summary for room ${roomId} retrieved successfully`,
      );
      return summary;
    } catch (error) {
      this.logger.error(
        `❌ Error getting analytics summary for room ${roomId}:`,
        error,
      );
      throw new BadRequestException('Failed to get room analytics summary');
    }
  }

  /**
   * Parse time range from query parameters
   */
  private parseTimeRange(
    startDate?: string,
    endDate?: string,
  ): TimeRange | undefined {
    if (!startDate && !endDate) {
      return undefined;
    }

    try {
      const range: TimeRange = {
        startDate: startDate
          ? new Date(startDate)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: endDate ? new Date(endDate) : new Date(),
      };

      // Validate dates
      if (isNaN(range.startDate.getTime()) || isNaN(range.endDate.getTime())) {
        throw new Error('Invalid date format');
      }

      if (range.startDate >= range.endDate) {
        throw new Error('Start date must be before end date');
      }

      return range;
    } catch (error) {
      this.logger.error('Error parsing time range:', error);
      throw new BadRequestException(
        'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)',
      );
    }
  }
}
