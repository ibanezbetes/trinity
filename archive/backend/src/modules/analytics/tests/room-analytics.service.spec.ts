import { Test, TestingModule } from '@nestjs/testing';
import { RoomAnalyticsService } from '../room-analytics.service';
import { MultiTableService } from '../../../infrastructure/database/multi-table.service';
import * as fc from 'fast-check';

describe('RoomAnalyticsService', () => {
  let service: RoomAnalyticsService;
  let multiTableService: jest.Mocked<MultiTableService>;

  beforeEach(async () => {
    const mockMultiTableService = {
      query: jest.fn(),
      put: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      batchGet: jest.fn(),
      batchWrite: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomAnalyticsService,
        {
          provide: MultiTableService,
          useValue: mockMultiTableService,
        },
      ],
    }).compile();

    service = module.get<RoomAnalyticsService>(RoomAnalyticsService);
    multiTableService = module.get(MultiTableService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAdvancedRoomAnalytics', () => {
    it('should return comprehensive analytics structure', async () => {
      const result = await service.getAdvancedRoomAnalytics();

      expect(result).toHaveProperty('templateAnalytics');
      expect(result).toHaveProperty('themeAnalytics');
      expect(result).toHaveProperty('scheduleAnalytics');
      expect(result).toHaveProperty('moderationAnalytics');
      expect(result).toHaveProperty('settingsAnalytics');
      expect(result).toHaveProperty('memberEngagementAnalytics');
      expect(result).toHaveProperty('roomPerformanceScoring');
    });

    it('should handle time range parameters correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          async (startDate, endDate) => {
            // Ensure startDate is before endDate
            const [start, end] =
              startDate <= endDate
                ? [startDate, endDate]
                : [endDate, startDate];

            const result = await service.getAdvancedRoomAnalytics({
              startDate: start,
              endDate: end,
            });

            expect(result).toBeDefined();
            expect(result.templateAnalytics).toBeDefined();
            expect(result.themeAnalytics).toBeDefined();
            expect(result.scheduleAnalytics).toBeDefined();
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('getTemplateAnalytics', () => {
    it('should return valid template analytics structure', async () => {
      const startDate = new Date('2024-12-01');
      const endDate = new Date('2024-12-24');

      const result = await service.getTemplateAnalytics(startDate, endDate);

      expect(result).toHaveProperty('totalTemplates');
      expect(result).toHaveProperty('publicTemplates');
      expect(result).toHaveProperty('privateTemplates');
      expect(result).toHaveProperty('templateUsageStats');
      expect(result).toHaveProperty('templateCategoryDistribution');
      expect(result).toHaveProperty('templateEffectiveness');
      expect(result).toHaveProperty('templateCreationTrends');

      expect(typeof result.totalTemplates).toBe('number');
      expect(typeof result.publicTemplates).toBe('number');
      expect(typeof result.privateTemplates).toBe('number');
      expect(result.totalTemplates).toBeGreaterThanOrEqual(0);
      expect(result.publicTemplates).toBeGreaterThanOrEqual(0);
      expect(result.privateTemplates).toBeGreaterThanOrEqual(0);
    });

    it('should maintain consistency between total and split counts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          async (startDate, endDate) => {
            const [start, end] =
              startDate <= endDate
                ? [startDate, endDate]
                : [endDate, startDate];

            const result = await service.getTemplateAnalytics(start, end);

            // Total should equal public + private
            expect(result.totalTemplates).toBe(
              result.publicTemplates + result.privateTemplates,
            );

            // Usage stats should be non-negative
            expect(
              result.templateUsageStats.totalUsages,
            ).toBeGreaterThanOrEqual(0);
            expect(
              result.templateUsageStats.averageUsagesPerTemplate,
            ).toBeGreaterThanOrEqual(0);

            // Most used templates should be sorted by usage count
            const usageCounts = result.templateUsageStats.mostUsedTemplates.map(
              (t) => t.usageCount,
            );
            for (let i = 1; i < usageCounts.length; i++) {
              expect(usageCounts[i]).toBeLessThanOrEqual(usageCounts[i - 1]);
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should validate template effectiveness metrics', async () => {
      const result = await service.getTemplateAnalytics(
        new Date('2024-12-01'),
        new Date('2024-12-24'),
      );

      expect(
        result.templateEffectiveness.averageRoomSuccessRate,
      ).toBeGreaterThanOrEqual(0);
      expect(
        result.templateEffectiveness.averageRoomSuccessRate,
      ).toBeLessThanOrEqual(1);

      const templated =
        result.templateEffectiveness.templatedVsNonTemplatedRooms.templated;
      const nonTemplated =
        result.templateEffectiveness.templatedVsNonTemplatedRooms.nonTemplated;

      expect(templated.successRate).toBeGreaterThanOrEqual(0);
      expect(templated.successRate).toBeLessThanOrEqual(1);
      expect(nonTemplated.successRate).toBeGreaterThanOrEqual(0);
      expect(nonTemplated.successRate).toBeLessThanOrEqual(1);

      expect(templated.averageDuration).toBeGreaterThan(0);
      expect(nonTemplated.averageDuration).toBeGreaterThan(0);
    });
  });

  describe('getThemeAnalytics', () => {
    it('should return valid theme analytics structure', async () => {
      const startDate = new Date('2024-12-01');
      const endDate = new Date('2024-12-24');

      const result = await service.getThemeAnalytics(startDate, endDate);

      expect(result).toHaveProperty('totalThemes');
      expect(result).toHaveProperty('systemThemes');
      expect(result).toHaveProperty('customThemes');
      expect(result).toHaveProperty('themeUsageStats');
      expect(result).toHaveProperty('themeCategoryDistribution');
      expect(result).toHaveProperty('themeImpactOnEngagement');
      expect(result).toHaveProperty('themeRatingDistribution');

      expect(typeof result.totalThemes).toBe('number');
      expect(typeof result.systemThemes).toBe('number');
      expect(typeof result.customThemes).toBe('number');
      expect(result.totalThemes).toBeGreaterThanOrEqual(0);
      expect(result.systemThemes).toBe(5); // We have 5 system themes
      expect(result.customThemes).toBeGreaterThanOrEqual(0);
    });

    it('should validate theme rating distribution', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          async (startDate, endDate) => {
            const [start, end] =
              startDate <= endDate
                ? [startDate, endDate]
                : [endDate, startDate];

            const result = await service.getThemeAnalytics(start, end);

            // Rating distribution should only have ratings 1-5
            const ratings = Object.keys(result.themeRatingDistribution).map(
              Number,
            );
            ratings.forEach((rating) => {
              expect(rating).toBeGreaterThanOrEqual(1);
              expect(rating).toBeLessThanOrEqual(5);
              expect(Number.isInteger(rating)).toBe(true);
            });

            // All counts should be non-negative
            Object.values(result.themeRatingDistribution).forEach((count) => {
              expect(count).toBeGreaterThanOrEqual(0);
            });
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should validate theme impact metrics', async () => {
      const result = await service.getThemeAnalytics(
        new Date('2024-12-01'),
        new Date('2024-12-24'),
      );

      const themedRooms = result.themeImpactOnEngagement.themedRooms;
      const nonThemedRooms = result.themeImpactOnEngagement.nonThemedRooms;

      expect(themedRooms.engagementScore).toBeGreaterThan(0);
      expect(themedRooms.retentionRate).toBeGreaterThanOrEqual(0);
      expect(themedRooms.retentionRate).toBeLessThanOrEqual(1);

      expect(nonThemedRooms.engagementScore).toBeGreaterThan(0);
      expect(nonThemedRooms.retentionRate).toBeGreaterThanOrEqual(0);
      expect(nonThemedRooms.retentionRate).toBeLessThanOrEqual(1);
    });
  });

  describe('getScheduleAnalytics', () => {
    it('should return valid schedule analytics structure', async () => {
      const startDate = new Date('2024-12-01');
      const endDate = new Date('2024-12-24');

      const result = await service.getScheduleAnalytics(startDate, endDate);

      expect(result).toHaveProperty('totalSchedules');
      expect(result).toHaveProperty('activeSchedules');
      expect(result).toHaveProperty('recurringSchedules');
      expect(result).toHaveProperty('scheduleAttendanceStats');
      expect(result).toHaveProperty('recurrencePatternDistribution');
      expect(result).toHaveProperty('scheduleEffectiveness');
      expect(result).toHaveProperty('timeSlotAnalytics');
      expect(result).toHaveProperty('notificationEffectiveness');

      expect(typeof result.totalSchedules).toBe('number');
      expect(typeof result.activeSchedules).toBe('number');
      expect(typeof result.recurringSchedules).toBe('number');
      expect(result.totalSchedules).toBeGreaterThanOrEqual(0);
      expect(result.activeSchedules).toBeGreaterThanOrEqual(0);
      expect(result.recurringSchedules).toBeGreaterThanOrEqual(0);
    });

    it('should validate attendance statistics', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          async (startDate, endDate) => {
            const [start, end] =
              startDate <= endDate
                ? [startDate, endDate]
                : [endDate, startDate];

            const result = await service.getScheduleAnalytics(start, end);

            const stats = result.scheduleAttendanceStats;

            // Attendance rate should be between 0 and 1
            expect(stats.averageAttendanceRate).toBeGreaterThanOrEqual(0);
            expect(stats.averageAttendanceRate).toBeLessThanOrEqual(1);

            // Session counts should be non-negative
            expect(stats.totalScheduledSessions).toBeGreaterThanOrEqual(0);
            expect(stats.completedSessions).toBeGreaterThanOrEqual(0);
            expect(stats.cancelledSessions).toBeGreaterThanOrEqual(0);

            // Completed + cancelled should not exceed total
            expect(
              stats.completedSessions + stats.cancelledSessions,
            ).toBeLessThanOrEqual(stats.totalScheduledSessions);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should validate time slot analytics', async () => {
      const result = await service.getScheduleAnalytics(
        new Date('2024-12-01'),
        new Date('2024-12-24'),
      );

      result.timeSlotAnalytics.forEach((slot) => {
        // Hour should be 0-23
        expect(slot.hour).toBeGreaterThanOrEqual(0);
        expect(slot.hour).toBeLessThanOrEqual(23);

        // Day of week should be 0-6
        expect(slot.dayOfWeek).toBeGreaterThanOrEqual(0);
        expect(slot.dayOfWeek).toBeLessThanOrEqual(6);

        // Schedule count should be non-negative
        expect(slot.scheduleCount).toBeGreaterThanOrEqual(0);

        // Average attendance should be between 0 and 1
        expect(slot.averageAttendance).toBeGreaterThanOrEqual(0);
        expect(slot.averageAttendance).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('getModerationAnalytics', () => {
    it('should return valid moderation analytics structure', async () => {
      const startDate = new Date('2024-12-01');
      const endDate = new Date('2024-12-24');

      const result = await service.getModerationAnalytics(startDate, endDate);

      expect(result).toHaveProperty('totalCustomRoles');
      expect(result).toHaveProperty('averageRolesPerRoom');
      expect(result).toHaveProperty('roleUsageDistribution');
      expect(result).toHaveProperty('moderationActionStats');
      expect(result).toHaveProperty('permissionCheckStats');
      expect(result).toHaveProperty('moderationEffectiveness');

      expect(typeof result.totalCustomRoles).toBe('number');
      expect(typeof result.averageRolesPerRoom).toBe('number');
      expect(result.totalCustomRoles).toBeGreaterThanOrEqual(0);
      expect(result.averageRolesPerRoom).toBeGreaterThanOrEqual(0);
    });

    it('should validate permission check statistics', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          async (startDate, endDate) => {
            const [start, end] =
              startDate <= endDate
                ? [startDate, endDate]
                : [endDate, startDate];

            const result = await service.getModerationAnalytics(start, end);

            const stats = result.permissionCheckStats;

            // Check counts should be non-negative
            expect(stats.totalChecks).toBeGreaterThanOrEqual(0);
            expect(stats.deniedChecks).toBeGreaterThanOrEqual(0);

            // Denied checks should not exceed total
            expect(stats.deniedChecks).toBeLessThanOrEqual(stats.totalChecks);

            // Denial rate should be between 0 and 1
            expect(stats.denialRate).toBeGreaterThanOrEqual(0);
            expect(stats.denialRate).toBeLessThanOrEqual(1);

            // Most checked permissions should have valid data
            stats.mostCheckedPermissions.forEach((perm) => {
              expect(perm.checkCount).toBeGreaterThanOrEqual(0);
              expect(perm.denialRate).toBeGreaterThanOrEqual(0);
              expect(perm.denialRate).toBeLessThanOrEqual(1);
              expect(typeof perm.permission).toBe('string');
            });
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('getRoomPerformanceScoring', () => {
    it('should return valid performance scoring structure', async () => {
      const startDate = new Date('2024-12-01');
      const endDate = new Date('2024-12-24');

      const result = await service.getRoomPerformanceScoring(
        startDate,
        endDate,
      );

      expect(result).toHaveProperty('overallScore');
      expect(result).toHaveProperty('scoreComponents');
      expect(result).toHaveProperty('scoreDistribution');
      expect(result).toHaveProperty('topPerformingRooms');
      expect(result).toHaveProperty('improvementRecommendations');

      expect(typeof result.overallScore).toBe('number');
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.overallScore).toBeLessThanOrEqual(5);
    });

    it('should validate score components', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          async (startDate, endDate) => {
            const [start, end] =
              startDate <= endDate
                ? [startDate, endDate]
                : [endDate, startDate];

            const result = await service.getRoomPerformanceScoring(start, end);

            const components = result.scoreComponents;

            // All score components should be between 0 and 5
            expect(components.memberEngagement).toBeGreaterThan(0);
            expect(components.memberEngagement).toBeLessThanOrEqual(5);
            expect(components.consensusEfficiency).toBeGreaterThan(0);
            expect(components.consensusEfficiency).toBeLessThanOrEqual(5);
            expect(components.featureUtilization).toBeGreaterThan(0);
            expect(components.featureUtilization).toBeLessThanOrEqual(5);
            expect(components.memberSatisfaction).toBeGreaterThan(0);
            expect(components.memberSatisfaction).toBeLessThanOrEqual(5);
            expect(components.technicalPerformance).toBeGreaterThan(0);
            expect(components.technicalPerformance).toBeLessThanOrEqual(5);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should validate improvement recommendations', async () => {
      const result = await service.getRoomPerformanceScoring(
        new Date('2024-12-01'),
        new Date('2024-12-24'),
      );

      result.improvementRecommendations.forEach((rec) => {
        expect(typeof rec.category).toBe('string');
        expect(typeof rec.recommendation).toBe('string');
        expect(typeof rec.potentialImpact).toBe('number');
        expect(rec.potentialImpact).toBeGreaterThanOrEqual(0);
        expect(rec.potentialImpact).toBeLessThanOrEqual(1);
        expect(['low', 'medium', 'high']).toContain(
          rec.implementationDifficulty,
        );
      });
    });
  });

  describe('getMemberEngagementAnalytics', () => {
    it('should return valid engagement analytics structure', async () => {
      const startDate = new Date('2024-12-01');
      const endDate = new Date('2024-12-24');

      const result = await service.getMemberEngagementAnalytics(
        startDate,
        endDate,
      );

      expect(result).toHaveProperty('engagementScoreDistribution');
      expect(result).toHaveProperty('engagementFactors');
      expect(result).toHaveProperty('memberRetentionByFeatureUsage');
      expect(result).toHaveProperty('featureAdoptionFunnel');
    });

    it('should validate engagement factors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          async (startDate, endDate) => {
            const [start, end] =
              startDate <= endDate
                ? [startDate, endDate]
                : [endDate, startDate];

            const result = await service.getMemberEngagementAnalytics(
              start,
              end,
            );

            const factors = result.engagementFactors;

            // All factors should have valid impact and correlation values
            Object.values(factors).forEach((factor) => {
              expect(factor.impact).toBeGreaterThanOrEqual(0);
              expect(factor.impact).toBeLessThanOrEqual(1);
              expect(factor.correlation).toBeGreaterThanOrEqual(0);
              expect(factor.correlation).toBeLessThanOrEqual(1);
            });
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should validate retention metrics', async () => {
      const result = await service.getMemberEngagementAnalytics(
        new Date('2024-12-01'),
        new Date('2024-12-24'),
      );

      const retention = result.memberRetentionByFeatureUsage;

      Object.values(retention).forEach((featureRetention) => {
        expect(featureRetention.day7).toBeGreaterThanOrEqual(0);
        expect(featureRetention.day7).toBeLessThanOrEqual(1);
        expect(featureRetention.day30).toBeGreaterThanOrEqual(0);
        expect(featureRetention.day30).toBeLessThanOrEqual(1);

        // Day 30 retention should be less than or equal to day 7
        expect(featureRetention.day30).toBeLessThanOrEqual(
          featureRetention.day7,
        );
      });
    });

    it('should validate feature adoption funnel', async () => {
      const result = await service.getMemberEngagementAnalytics(
        new Date('2024-12-01'),
        new Date('2024-12-24'),
      );

      const funnel = result.featureAdoptionFunnel;

      // All funnel values should be non-negative
      expect(funnel.basicRoomCreation).toBeGreaterThanOrEqual(0);
      expect(funnel.templateUsage).toBeGreaterThanOrEqual(0);
      expect(funnel.themeApplication).toBeGreaterThanOrEqual(0);
      expect(funnel.scheduleCreation).toBeGreaterThanOrEqual(0);
      expect(funnel.advancedModeration).toBeGreaterThanOrEqual(0);

      // Funnel should generally decrease (though not strictly required)
      expect(funnel.templateUsage).toBeLessThanOrEqual(
        funnel.basicRoomCreation,
      );
      expect(funnel.advancedModeration).toBeLessThanOrEqual(
        funnel.basicRoomCreation,
      );
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock all the individual methods that are called
      jest
        .spyOn(service as any, 'getTemplateMetricsInRange')
        .mockRejectedValue(new Error('Database connection failed'));
      jest
        .spyOn(service as any, 'getTotalTemplateCount')
        .mockRejectedValue(new Error('Database connection failed'));

      await expect(service.getAdvancedRoomAnalytics()).rejects.toThrow(
        'Failed to generate advanced room analytics',
      );
    });

    it('should handle invalid date ranges', async () => {
      const invalidStartDate = new Date('invalid');
      const validEndDate = new Date('2024-12-24');

      // The service should handle this gracefully or the controller should validate
      // For now, we'll test that it doesn't crash
      await expect(
        service.getTemplateAnalytics(invalidStartDate, validEndDate),
      ).resolves.toBeDefined();
    });
  });
});
