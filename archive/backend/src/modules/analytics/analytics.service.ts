import { Injectable, Logger } from '@nestjs/common';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import { RoomAnalyticsService } from './room-analytics.service';
import {
  AnalyticsEvent,
  UserBehaviorAnalytics,
  RoomPerformanceAnalytics,
  ContentPreferenceAnalytics,
  SystemMetrics,
  DashboardOverview,
  PredictiveInsights,
  TimeRange,
  UserMetrics,
  RoomMetrics,
  ContentMetrics,
  AdvancedRoomAnalytics,
} from './interfaces/analytics.interfaces';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly multiTableService: MultiTableService,
    private readonly roomAnalyticsService: RoomAnalyticsService,
  ) {}

  /**
   * 📊 Get comprehensive dashboard overview
   */
  async getDashboardOverview(
    timeRange?: TimeRange,
  ): Promise<DashboardOverview> {
    try {
      this.logger.log('📊 Generating dashboard overview...');

      const endDate = timeRange?.endDate || new Date();
      const startDate =
        timeRange?.startDate || new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24h

      const [activeUsers, roomMetrics, contentMetrics, systemHealth] =
        await Promise.all([
          this.getActiveUsersMetrics(startDate, endDate),
          this.getRoomOverviewMetrics(startDate, endDate),
          this.getContentOverviewMetrics(startDate, endDate),
          this.getSystemHealthMetrics(),
        ]);

      const overview: DashboardOverview = {
        activeUsers,
        roomMetrics,
        contentMetrics,
        systemHealth,
      };

      this.logger.log(
        `📊 Dashboard overview generated: ${activeUsers.daily} daily active users`,
      );
      return overview;
    } catch (error) {
      this.logger.error('❌ Error generating dashboard overview:', error);
      throw new Error('Failed to generate dashboard overview');
    }
  }

  /**
   * 👥 Get user behavior analytics
   */
  async getUserBehaviorAnalytics(
    userId?: string,
    timeRange?: TimeRange,
  ): Promise<UserBehaviorAnalytics> {
    try {
      this.logger.log(
        `👥 Analyzing user behavior${userId ? ` for user ${userId}` : ''}...`,
      );

      const endDate = timeRange?.endDate || new Date();
      const startDate =
        timeRange?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days

      // Get user metrics from analytics table
      const userMetrics = await this.getUserMetricsInRange(
        startDate,
        endDate,
        userId,
      );

      const analytics: UserBehaviorAnalytics = {
        totalUsers: await this.getTotalUsersCount(),
        activeUsers: await this.getActiveUsersMetrics(startDate, endDate),
        sessionMetrics: await this.calculateSessionMetrics(userMetrics),
        engagementMetrics: await this.calculateEngagementMetrics(userMetrics),
        retentionMetrics: await this.calculateRetentionMetrics(
          startDate,
          endDate,
        ),
      };

      this.logger.log(
        `👥 User behavior analytics completed: ${analytics.totalUsers} total users`,
      );
      return analytics;
    } catch (error) {
      this.logger.error('❌ Error analyzing user behavior:', error);
      throw new Error('Failed to analyze user behavior');
    }
  }

  /**
   * 🏠 Get room performance analytics
   */
  async getRoomPerformanceAnalytics(
    roomId?: string,
    timeRange?: TimeRange,
  ): Promise<RoomPerformanceAnalytics> {
    try {
      this.logger.log(
        `🏠 Analyzing room performance${roomId ? ` for room ${roomId}` : ''}...`,
      );

      const endDate = timeRange?.endDate || new Date();
      const startDate =
        timeRange?.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

      const roomMetrics = await this.getRoomMetricsInRange(
        startDate,
        endDate,
        roomId,
      );

      const analytics: RoomPerformanceAnalytics = {
        totalRooms: roomMetrics.length,
        completionRate: await this.calculateRoomCompletionRate(roomMetrics),
        averageMetrics: await this.calculateAverageRoomMetrics(roomMetrics),
        performanceDistribution:
          await this.calculatePerformanceDistribution(roomMetrics),
        optimizationInsights:
          await this.generateRoomOptimizationInsights(roomMetrics),
      };

      this.logger.log(
        `🏠 Room performance analytics completed: ${analytics.totalRooms} rooms analyzed`,
      );
      return analytics;
    } catch (error) {
      this.logger.error('❌ Error analyzing room performance:', error);
      throw new Error('Failed to analyze room performance');
    }
  }

  /**
   * 🎬 Get content preference analytics
   */
  async getContentPreferenceAnalytics(
    userId?: string,
    timeRange?: TimeRange,
  ): Promise<ContentPreferenceAnalytics> {
    try {
      this.logger.log(
        `🎬 Analyzing content preferences${userId ? ` for user ${userId}` : ''}...`,
      );

      const endDate = timeRange?.endDate || new Date();
      const startDate =
        timeRange?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days

      const contentMetrics = await this.getContentMetricsInRange(
        startDate,
        endDate,
        userId,
      );

      const analytics: ContentPreferenceAnalytics = {
        genrePreferences: await this.calculateGenrePreferences(contentMetrics),
        contentPerformance:
          await this.calculateContentPerformance(contentMetrics),
        aiRecommendationMetrics: await this.calculateAIRecommendationMetrics(
          startDate,
          endDate,
        ),
        trendingContent: await this.identifyTrendingContent(contentMetrics),
      };

      this.logger.log(
        `🎬 Content preference analytics completed: ${Object.keys(analytics.genrePreferences).length} genres analyzed`,
      );
      return analytics;
    } catch (error) {
      this.logger.error('❌ Error analyzing content preferences:', error);
      throw new Error('Failed to analyze content preferences');
    }
  }

  /**
   * 🔮 Generate predictive insights
   */
  async generatePredictiveInsights(
    timeRange?: TimeRange,
  ): Promise<PredictiveInsights> {
    try {
      this.logger.log('🔮 Generating predictive insights...');

      const endDate = timeRange?.endDate || new Date();
      const startDate =
        timeRange?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days

      const insights: PredictiveInsights = {
        userChurnPrediction: await this.predictUserChurn(startDate, endDate),
        roomSuccessPrediction: await this.predictRoomSuccess(
          startDate,
          endDate,
        ),
        contentTrends: await this.predictContentTrends(startDate, endDate),
      };

      this.logger.log(
        `🔮 Predictive insights generated: ${insights.userChurnPrediction.length} churn predictions`,
      );
      return insights;
    } catch (error) {
      this.logger.error('❌ Error generating predictive insights:', error);
      throw new Error('Failed to generate predictive insights');
    }
  }

  /**
   * 🏠 Get advanced room analytics
   */
  async getAdvancedRoomAnalytics(
    timeRange?: TimeRange,
  ): Promise<AdvancedRoomAnalytics> {
    try {
      this.logger.log('🏠 Getting advanced room analytics...');
      return await this.roomAnalyticsService.getAdvancedRoomAnalytics(
        timeRange,
      );
    } catch (error) {
      this.logger.error('❌ Error getting advanced room analytics:', error);
      throw new Error('Failed to get advanced room analytics');
    }
  }

  /**
   * 📊 Track advanced room feature events
   */
  async trackAdvancedRoomEvent(event: AnalyticsEvent): Promise<void> {
    try {
      this.logger.log(`📊 Tracking advanced room event: ${event.eventType}`);

      // Store the event in analytics table
      await this.storeAnalyticsEvent(event);

      // Process event for real-time metrics if needed
      await this.processRealTimeEvent(event);

      this.logger.log(`📊 Advanced room event tracked: ${event.eventId}`);
    } catch (error) {
      this.logger.error('❌ Error tracking advanced room event:', error);
      throw new Error('Failed to track advanced room event');
    }
  }

  /**
   * 📈 Get room performance dashboard
   */
  async getRoomPerformanceDashboard(
    roomId?: string,
    timeRange?: TimeRange,
  ): Promise<any> {
    try {
      this.logger.log(
        `📈 Getting room performance dashboard${roomId ? ` for room ${roomId}` : ''}...`,
      );

      const endDate = timeRange?.endDate || new Date();
      const startDate =
        timeRange?.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

      const [basicAnalytics, advancedAnalytics, performanceScoring] =
        await Promise.all([
          this.getRoomPerformanceAnalytics(roomId, timeRange),
          this.roomAnalyticsService.getAdvancedRoomAnalytics(timeRange),
          this.roomAnalyticsService.getRoomPerformanceScoring(
            startDate,
            endDate,
          ),
        ]);

      const dashboard = {
        basicAnalytics,
        advancedFeatures: {
          templateAnalytics: advancedAnalytics.templateAnalytics,
          themeAnalytics: advancedAnalytics.themeAnalytics,
          scheduleAnalytics: advancedAnalytics.scheduleAnalytics,
          moderationAnalytics: advancedAnalytics.moderationAnalytics,
        },
        performanceScoring,
        memberEngagement: advancedAnalytics.memberEngagementAnalytics,
      };

      this.logger.log(`📈 Room performance dashboard generated`);
      return dashboard;
    } catch (error) {
      this.logger.error(
        '❌ Error generating room performance dashboard:',
        error,
      );
      throw new Error('Failed to generate room performance dashboard');
    }
  }

  // Private helper methods

  private async getActiveUsersMetrics(startDate: Date, endDate: Date) {
    // Mock implementation - in real scenario, query analytics tables
    return {
      current: 45,
      daily: 120,
      weekly: 450,
      monthly: 1200,
    };
  }

  private async getRoomOverviewMetrics(startDate: Date, endDate: Date) {
    // Mock implementation - in real scenario, query room analytics
    return {
      activeRooms: 8,
      totalRoomsToday: 25,
      averageConsensusRate: 0.78,
      averageRoomDuration: 1800, // 30 minutes in seconds
    };
  }

  private async getContentOverviewMetrics(startDate: Date, endDate: Date) {
    // Mock implementation - in real scenario, query content analytics
    return {
      totalVotesToday: 340,
      matchesFoundToday: 28,
      topGenres: [
        { genre: 'Action', count: 45 },
        { genre: 'Comedy', count: 38 },
        { genre: 'Drama', count: 32 },
      ],
    };
  }

  private async getSystemHealthMetrics() {
    // Mock implementation - in real scenario, query system metrics
    return {
      apiResponseTime: 185, // milliseconds
      errorRate: 0.02, // 2%
      uptime: 0.999, // 99.9%
    };
  }

  private async getTotalUsersCount(): Promise<number> {
    // Mock implementation
    return 2500;
  }

  private async getUserMetricsInRange(
    startDate: Date,
    endDate: Date,
    userId?: string,
  ): Promise<UserMetrics[]> {
    // Mock implementation - in real scenario, query user analytics table
    return [];
  }

  private async getRoomMetricsInRange(
    startDate: Date,
    endDate: Date,
    roomId?: string,
  ): Promise<RoomMetrics[]> {
    // Mock implementation - in real scenario, query room analytics table
    return [];
  }

  private async getContentMetricsInRange(
    startDate: Date,
    endDate: Date,
    userId?: string,
  ): Promise<ContentMetrics[]> {
    // Mock implementation - in real scenario, query content analytics table
    return [];
  }

  private async calculateSessionMetrics(userMetrics: UserMetrics[]) {
    // Mock implementation
    return {
      averageDuration: 1200, // 20 minutes
      actionsPerSession: 15,
      bounceRate: 0.25, // 25%
    };
  }

  private async calculateEngagementMetrics(userMetrics: UserMetrics[]) {
    // Mock implementation
    return {
      votesPerUser: 8.5,
      roomsJoinedPerUser: 2.3,
      matchesFoundPerUser: 1.8,
    };
  }

  private async calculateRetentionMetrics(startDate: Date, endDate: Date) {
    // Mock implementation
    return {
      day1: 0.85, // 85%
      day7: 0.65, // 65%
      day30: 0.45, // 45%
    };
  }

  private async calculateRoomCompletionRate(
    roomMetrics: RoomMetrics[],
  ): Promise<number> {
    // Mock implementation
    return 0.82; // 82%
  }

  private async calculateAverageRoomMetrics(roomMetrics: RoomMetrics[]) {
    // Mock implementation
    return {
      duration: 1800, // 30 minutes
      memberCount: 4.2,
      votesPerMatch: 12.5,
      timeToConsensus: 900, // 15 minutes
    };
  }

  private async calculatePerformanceDistribution(roomMetrics: RoomMetrics[]) {
    // Mock implementation
    return {
      highPerforming: 0.35, // 35%
      mediumPerforming: 0.45, // 45%
      lowPerforming: 0.2, // 20%
    };
  }

  private async generateRoomOptimizationInsights(roomMetrics: RoomMetrics[]) {
    // Mock implementation
    return [
      {
        insight: 'Rooms with 4-6 members have 23% higher consensus rates',
        impact: 'high' as const,
        recommendation: 'Suggest optimal member count during room creation',
      },
      {
        insight: 'Evening sessions (7-9 PM) show better engagement',
        impact: 'medium' as const,
        recommendation: 'Promote evening room scheduling',
      },
    ];
  }

  private async calculateGenrePreferences(contentMetrics: ContentMetrics[]) {
    // Mock implementation
    return {
      Action: 0.28,
      Comedy: 0.22,
      Drama: 0.18,
      'Sci-Fi': 0.15,
      Horror: 0.1,
      Romance: 0.07,
    };
  }

  private async calculateContentPerformance(contentMetrics: ContentMetrics[]) {
    // Mock implementation
    return {
      topRated: [
        { contentId: '12345', rating: 4.8 },
        { contentId: '67890', rating: 4.7 },
      ],
      mostVoted: [
        { contentId: '11111', votes: 156 },
        { contentId: '22222', votes: 142 },
      ],
      highestConsensus: [
        { contentId: '33333', consensusRate: 0.95 },
        { contentId: '44444', consensusRate: 0.92 },
      ],
    };
  }

  private async calculateAIRecommendationMetrics(
    startDate: Date,
    endDate: Date,
  ) {
    // Mock implementation
    return {
      totalRecommendations: 450,
      acceptanceRate: 0.68, // 68%
      effectivenessScore: 0.75, // 75%
    };
  }

  private async identifyTrendingContent(contentMetrics: ContentMetrics[]) {
    // Mock implementation
    return [
      {
        contentId: '55555',
        trendScore: 0.92,
        category: 'Action',
      },
      {
        contentId: '66666',
        trendScore: 0.88,
        category: 'Comedy',
      },
    ];
  }

  private async predictUserChurn(startDate: Date, endDate: Date) {
    // Mock implementation
    return [
      {
        userId: 'user123',
        churnProbability: 0.75,
        riskFactors: ['Low engagement', 'No recent room joins'],
        recommendations: [
          'Send personalized content recommendations',
          'Invite to popular rooms',
        ],
      },
    ];
  }

  private async predictRoomSuccess(startDate: Date, endDate: Date) {
    // Mock implementation
    return [
      {
        roomId: 'room456',
        successProbability: 0.85,
        optimizationSuggestions: [
          'Add more diverse content',
          'Invite active members',
        ],
      },
    ];
  }

  private async predictContentTrends(startDate: Date, endDate: Date) {
    // Mock implementation
    return [
      {
        genre: 'Sci-Fi',
        trendDirection: 'up' as const,
        confidence: 0.82,
        timeframe: 'next 30 days',
      },
      {
        genre: 'Horror',
        trendDirection: 'down' as const,
        confidence: 0.71,
        timeframe: 'next 30 days',
      },
    ];
  }

  /**
   * Store analytics event in database
   */
  private async storeAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
    try {
      // In a real implementation, this would store the event in DynamoDB
      // For now, we'll just log it
      this.logger.debug(
        `Storing analytics event: ${event.eventType} - ${event.eventId}`,
      );
    } catch (error) {
      this.logger.error('Error storing analytics event:', error);
      throw error;
    }
  }

  /**
   * Process real-time event for immediate metrics updates
   */
  private async processRealTimeEvent(event: AnalyticsEvent): Promise<void> {
    try {
      // In a real implementation, this would update real-time metrics
      // For now, we'll just log it
      this.logger.debug(`Processing real-time event: ${event.eventType}`);
    } catch (error) {
      this.logger.error('Error processing real-time event:', error);
      // Don't throw here as this is not critical
    }
  }
}
