import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RoomAnalyticsController } from '../room-analytics.controller';
import { RoomAnalyticsService } from '../room-analytics.service';
import { AnalyticsService } from '../analytics.service';
import * as fc from 'fast-check';

describe('RoomAnalyticsController', () => {
  let controller: RoomAnalyticsController;
  let roomAnalyticsService: jest.Mocked<RoomAnalyticsService>;
  let analyticsService: jest.Mocked<AnalyticsService>;

  beforeEach(async () => {
    const mockRoomAnalyticsService = {
      getAdvancedRoomAnalytics: jest.fn(),
      getTemplateAnalytics: jest.fn(),
      getThemeAnalytics: jest.fn(),
      getScheduleAnalytics: jest.fn(),
      getModerationAnalytics: jest.fn(),
      getSettingsAnalytics: jest.fn(),
      getMemberEngagementAnalytics: jest.fn(),
      getRoomPerformanceScoring: jest.fn(),
    };

    const mockAnalyticsService = {
      getRoomPerformanceDashboard: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomAnalyticsController],
      providers: [
        {
          provide: RoomAnalyticsService,
          useValue: mockRoomAnalyticsService,
        },
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
      ],
    }).compile();

    controller = module.get<RoomAnalyticsController>(RoomAnalyticsController);
    roomAnalyticsService = module.get(RoomAnalyticsService);
    analyticsService = module.get(AnalyticsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAdvancedRoomAnalytics', () => {
    it('should return advanced room analytics', async () => {
      const mockAnalytics = {
        templateAnalytics: { totalTemplates: 45 },
        themeAnalytics: { totalThemes: 32 },
        scheduleAnalytics: { totalSchedules: 18 },
        moderationAnalytics: { totalCustomRoles: 28 },
        settingsAnalytics: { settingsUsageStats: {} },
        memberEngagementAnalytics: { engagementScoreDistribution: {} },
        roomPerformanceScoring: { overallScore: 4.2 },
      };

      roomAnalyticsService.getAdvancedRoomAnalytics.mockResolvedValue(
        mockAnalytics as any,
      );

      const result = await controller.getAdvancedRoomAnalytics();

      expect(result).toEqual(mockAnalytics);
      expect(
        roomAnalyticsService.getAdvancedRoomAnalytics,
      ).toHaveBeenCalledWith(undefined);
    });

    it('should handle date parameters correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          async (startDate, endDate) => {
            const [start, end] =
              startDate <= endDate
                ? [startDate, endDate]
                : [endDate, startDate];

            const mockAnalytics = {
              templateAnalytics: { totalTemplates: 45 },
              themeAnalytics: { totalThemes: 32 },
              scheduleAnalytics: { totalSchedules: 18 },
              moderationAnalytics: { totalCustomRoles: 28 },
              settingsAnalytics: { settingsUsageStats: {} },
              memberEngagementAnalytics: { engagementScoreDistribution: {} },
              roomPerformanceScoring: { overallScore: 4.2 },
            };

            roomAnalyticsService.getAdvancedRoomAnalytics.mockResolvedValue(
              mockAnalytics as any,
            );

            const result = await controller.getAdvancedRoomAnalytics(
              start.toISOString(),
              end.toISOString(),
            );

            expect(result).toEqual(mockAnalytics);
            expect(
              roomAnalyticsService.getAdvancedRoomAnalytics,
            ).toHaveBeenCalledWith({
              startDate: start,
              endDate: end,
            });
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should handle service errors', async () => {
      roomAnalyticsService.getAdvancedRoomAnalytics.mockRejectedValue(
        new Error('Service error'),
      );

      await expect(controller.getAdvancedRoomAnalytics()).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getTemplateAnalytics', () => {
    it('should return template analytics', async () => {
      const mockTemplateAnalytics = {
        totalTemplates: 45,
        publicTemplates: 28,
        privateTemplates: 17,
        templateUsageStats: {
          totalUsages: 150,
          averageUsagesPerTemplate: 3.3,
          mostUsedTemplates: [],
        },
        templateCategoryDistribution: {},
        templateEffectiveness: {
          averageRoomSuccessRate: 0.82,
          templatedVsNonTemplatedRooms: {
            templated: { successRate: 0.82, averageDuration: 1650 },
            nonTemplated: { successRate: 0.68, averageDuration: 2100 },
          },
        },
        templateCreationTrends: [],
      };

      roomAnalyticsService.getTemplateAnalytics.mockResolvedValue(
        mockTemplateAnalytics,
      );

      const result = await controller.getTemplateAnalytics();

      expect(result).toEqual(mockTemplateAnalytics);
      expect(roomAnalyticsService.getTemplateAnalytics).toHaveBeenCalled();
    });

    it('should validate date range parameters', async () => {
      const mockAnalytics = {
        totalTemplates: 45,
        publicTemplates: 28,
        privateTemplates: 17,
        templateUsageStats: {
          totalUsages: 150,
          averageUsagesPerTemplate: 3.3,
          mostUsedTemplates: [],
        },
        templateCategoryDistribution: {},
        templateEffectiveness: {
          averageRoomSuccessRate: 0.82,
          templatedVsNonTemplatedRooms: {
            templated: { successRate: 0.82, averageDuration: 1650 },
            nonTemplated: { successRate: 0.68, averageDuration: 2100 },
          },
        },
        templateCreationTrends: [],
      };

      roomAnalyticsService.getTemplateAnalytics.mockResolvedValue(
        mockAnalytics,
      );

      // Test with valid date range
      const result = await controller.getTemplateAnalytics(
        '2024-12-01',
        '2024-12-24',
      );

      expect(result).toEqual(mockAnalytics);
      expect(roomAnalyticsService.getTemplateAnalytics).toHaveBeenCalled();
    });
  });

  describe('getThemeAnalytics', () => {
    it('should return theme analytics', async () => {
      const mockThemeAnalytics = {
        totalThemes: 32,
        systemThemes: 5,
        customThemes: 27,
        themeUsageStats: {
          totalApplications: 120,
          averageApplicationsPerTheme: 3.75,
          mostPopularThemes: [],
        },
        themeCategoryDistribution: {},
        themeImpactOnEngagement: {
          themedRooms: { engagementScore: 4.2, retentionRate: 0.78 },
          nonThemedRooms: { engagementScore: 3.8, retentionRate: 0.65 },
        },
        themeRatingDistribution: {},
      };

      roomAnalyticsService.getThemeAnalytics.mockResolvedValue(
        mockThemeAnalytics,
      );

      const result = await controller.getThemeAnalytics();

      expect(result).toEqual(mockThemeAnalytics);
      expect(roomAnalyticsService.getThemeAnalytics).toHaveBeenCalled();
    });
  });

  describe('getScheduleAnalytics', () => {
    it('should return schedule analytics', async () => {
      const mockScheduleAnalytics = {
        totalSchedules: 18,
        activeSchedules: 12,
        recurringSchedules: 8,
        scheduleAttendanceStats: {
          averageAttendanceRate: 0.75,
          totalScheduledSessions: 45,
          completedSessions: 38,
          cancelledSessions: 7,
        },
        recurrencePatternDistribution: {},
        scheduleEffectiveness: {
          scheduledVsAdHocRooms: {
            scheduled: { attendanceRate: 0.82, completionRate: 0.89 },
            adHoc: { attendanceRate: 0.65, completionRate: 0.72 },
          },
        },
        timeSlotAnalytics: [],
        notificationEffectiveness: {
          emailNotifications: { sentCount: 156, openRate: 0.68 },
          pushNotifications: { sentCount: 234, clickRate: 0.45 },
        },
      };

      roomAnalyticsService.getScheduleAnalytics.mockResolvedValue(
        mockScheduleAnalytics,
      );

      const result = await controller.getScheduleAnalytics();

      expect(result).toEqual(mockScheduleAnalytics);
      expect(roomAnalyticsService.getScheduleAnalytics).toHaveBeenCalled();
    });
  });

  describe('getModerationAnalytics', () => {
    it('should return moderation analytics', async () => {
      const mockModerationAnalytics = {
        totalCustomRoles: 28,
        averageRolesPerRoom: 2.3,
        roleUsageDistribution: {},
        moderationActionStats: {
          totalActions: 45,
          actionTypeDistribution: {},
          averageActionsPerRoom: 1.2,
        },
        permissionCheckStats: {
          totalChecks: 1250,
          deniedChecks: 85,
          denialRate: 0.068,
          mostCheckedPermissions: [],
        },
        moderationEffectiveness: {
          roomsWithModeration: { incidentRate: 0.05, memberSatisfaction: 4.3 },
          roomsWithoutModeration: {
            incidentRate: 0.18,
            memberSatisfaction: 3.8,
          },
        },
      };

      roomAnalyticsService.getModerationAnalytics.mockResolvedValue(
        mockModerationAnalytics,
      );

      const result = await controller.getModerationAnalytics();

      expect(result).toEqual(mockModerationAnalytics);
      expect(roomAnalyticsService.getModerationAnalytics).toHaveBeenCalled();
    });
  });

  describe('getRoomPerformanceDashboard', () => {
    it('should return comprehensive dashboard', async () => {
      const mockDashboard = {
        basicAnalytics: {},
        advancedFeatures: {
          templateAnalytics: {},
          themeAnalytics: {},
          scheduleAnalytics: {},
          moderationAnalytics: {},
        },
        performanceScoring: {},
        memberEngagement: {},
      };

      analyticsService.getRoomPerformanceDashboard.mockResolvedValue(
        mockDashboard,
      );

      const result = await controller.getRoomPerformanceDashboard();

      expect(result).toEqual(mockDashboard);
      expect(analyticsService.getRoomPerformanceDashboard).toHaveBeenCalledWith(
        undefined,
        undefined,
      );
    });

    it('should handle room-specific dashboard requests', async () => {
      const roomId = 'room-123';
      const mockDashboard = {
        basicAnalytics: {},
        advancedFeatures: {},
        performanceScoring: {},
        memberEngagement: {},
      };

      analyticsService.getRoomPerformanceDashboard.mockResolvedValue(
        mockDashboard,
      );

      const result = await controller.getRoomPerformanceDashboard(roomId);

      expect(result).toEqual(mockDashboard);
      expect(analyticsService.getRoomPerformanceDashboard).toHaveBeenCalledWith(
        roomId,
        undefined,
      );
    });
  });

  describe('getRoomAnalyticsSummary', () => {
    it('should return room-specific analytics summary', async () => {
      const roomId = 'room-123';

      const mockAdvancedAnalytics = {
        templateAnalytics: { templateUsageStats: { totalUsages: 15 } },
        themeAnalytics: { themeUsageStats: { totalApplications: 8 } },
        scheduleAnalytics: {
          scheduleAttendanceStats: { totalScheduledSessions: 5 },
        },
        moderationAnalytics: { moderationActionStats: { totalActions: 3 } },
        settingsAnalytics: {},
        memberEngagementAnalytics: {},
        roomPerformanceScoring: {
          overallScore: 4.2,
          improvementRecommendations: [],
        },
      };

      const mockPerformanceScoring = {
        overallScore: 4.2,
        improvementRecommendations: [
          {
            category: 'Template Usage',
            recommendation: 'Use more templates',
            potentialImpact: 0.15,
            implementationDifficulty: 'low' as const,
          },
        ],
        scoreComponents: {},
        scoreDistribution: {},
        topPerformingRooms: [],
      };

      roomAnalyticsService.getAdvancedRoomAnalytics.mockResolvedValue(
        mockAdvancedAnalytics as any,
      );
      roomAnalyticsService.getRoomPerformanceScoring.mockResolvedValue(
        mockPerformanceScoring,
      );

      const result = await controller.getRoomAnalyticsSummary(roomId);

      expect(result).toHaveProperty('roomId', roomId);
      expect(result).toHaveProperty('performanceScore', 4.2);
      expect(result).toHaveProperty('keyMetrics');
      expect(result).toHaveProperty('recommendations');
      expect(result.keyMetrics).toHaveProperty('templateUsage', 15);
      expect(result.keyMetrics).toHaveProperty('themeApplications', 8);
      expect(result.keyMetrics).toHaveProperty('scheduledSessions', 5);
      expect(result.keyMetrics).toHaveProperty('moderationActions', 3);
    });
  });

  describe('Date parsing', () => {
    it('should handle invalid date formats', async () => {
      await expect(
        controller.getAdvancedRoomAnalytics('invalid-date', '2024-12-24'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle start date after end date', async () => {
      await expect(
        controller.getAdvancedRoomAnalytics('2024-12-24', '2024-12-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle valid ISO date strings', async () => {
      const mockAnalytics = {
        templateAnalytics: { totalTemplates: 45 },
        themeAnalytics: { totalThemes: 32 },
        scheduleAnalytics: { totalSchedules: 18 },
        moderationAnalytics: { totalCustomRoles: 28 },
        settingsAnalytics: { settingsUsageStats: {} },
        memberEngagementAnalytics: { engagementScoreDistribution: {} },
        roomPerformanceScoring: { overallScore: 4.2 },
      };

      roomAnalyticsService.getAdvancedRoomAnalytics.mockResolvedValue(
        mockAnalytics as any,
      );

      const result = await controller.getAdvancedRoomAnalytics(
        '2024-12-01',
        '2024-12-24',
      );

      expect(result).toBeDefined();
      expect(
        roomAnalyticsService.getAdvancedRoomAnalytics,
      ).toHaveBeenCalledWith({
        startDate: new Date('2024-12-01'),
        endDate: new Date('2024-12-24'),
      });
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      roomAnalyticsService.getTemplateAnalytics.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(controller.getTemplateAnalytics()).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle analytics service errors', async () => {
      analyticsService.getRoomPerformanceDashboard.mockRejectedValue(
        new Error('Analytics error'),
      );

      await expect(controller.getRoomPerformanceDashboard()).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
