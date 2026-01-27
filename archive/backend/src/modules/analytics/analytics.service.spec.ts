import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import { TimeRange } from './interfaces/analytics.interfaces';
import * as fc from 'fast-check';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let multiTableService: jest.Mocked<MultiTableService>;

  beforeEach(async () => {
    const mockMultiTableService = {
      putItem: jest.fn(),
      query: jest.fn(),
      scan: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: MultiTableService,
          useValue: mockMultiTableService,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    multiTableService = module.get(MultiTableService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Property Tests - Analytics Data Consistency', () => {
    /**
     * Property 1: Dashboard Overview Consistency
     * Validates: Requirements 1.7, 5.2, 5.4
     *
     * Property: Dashboard overview should always return consistent structure
     */
    it('should return consistent dashboard overview structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.option(
            fc.record({
              startDate: fc.date({
                min: new Date('2023-01-01'),
                max: new Date(),
              }),
              endDate: fc.date({
                min: new Date('2023-01-01'),
                max: new Date(),
              }),
            }),
          ),
          async (timeRange) => {
            // Ensure endDate is after startDate if both provided
            if (timeRange && timeRange.endDate < timeRange.startDate) {
              [timeRange.startDate, timeRange.endDate] = [
                timeRange.endDate,
                timeRange.startDate,
              ];
            }

            // Act: Get dashboard overview
            const overview = await service.getDashboardOverview(timeRange);

            // Assert: Overview should have consistent structure
            expect(overview).toEqual({
              activeUsers: {
                current: expect.any(Number),
                daily: expect.any(Number),
                weekly: expect.any(Number),
                monthly: expect.any(Number),
              },
              roomMetrics: {
                activeRooms: expect.any(Number),
                totalRoomsToday: expect.any(Number),
                averageConsensusRate: expect.any(Number),
                averageRoomDuration: expect.any(Number),
              },
              contentMetrics: {
                totalVotesToday: expect.any(Number),
                matchesFoundToday: expect.any(Number),
                topGenres: expect.any(Array),
              },
              systemHealth: {
                apiResponseTime: expect.any(Number),
                errorRate: expect.any(Number),
                uptime: expect.any(Number),
              },
            });

            // Property: All numeric values should be non-negative
            expect(overview.activeUsers.current).toBeGreaterThanOrEqual(0);
            expect(overview.activeUsers.daily).toBeGreaterThanOrEqual(0);
            expect(overview.activeUsers.weekly).toBeGreaterThanOrEqual(0);
            expect(overview.activeUsers.monthly).toBeGreaterThanOrEqual(0);

            expect(overview.roomMetrics.activeRooms).toBeGreaterThanOrEqual(0);
            expect(overview.roomMetrics.totalRoomsToday).toBeGreaterThanOrEqual(
              0,
            );
            expect(
              overview.roomMetrics.averageConsensusRate,
            ).toBeGreaterThanOrEqual(0);
            expect(
              overview.roomMetrics.averageConsensusRate,
            ).toBeLessThanOrEqual(1);
            expect(
              overview.roomMetrics.averageRoomDuration,
            ).toBeGreaterThanOrEqual(0);

            expect(
              overview.contentMetrics.totalVotesToday,
            ).toBeGreaterThanOrEqual(0);
            expect(
              overview.contentMetrics.matchesFoundToday,
            ).toBeGreaterThanOrEqual(0);

            expect(
              overview.systemHealth.apiResponseTime,
            ).toBeGreaterThanOrEqual(0);
            expect(overview.systemHealth.errorRate).toBeGreaterThanOrEqual(0);
            expect(overview.systemHealth.errorRate).toBeLessThanOrEqual(1);
            expect(overview.systemHealth.uptime).toBeGreaterThanOrEqual(0);
            expect(overview.systemHealth.uptime).toBeLessThanOrEqual(1);

            // Property: User hierarchy should be logical
            expect(overview.activeUsers.monthly).toBeGreaterThanOrEqual(
              overview.activeUsers.weekly,
            );
            expect(overview.activeUsers.weekly).toBeGreaterThanOrEqual(
              overview.activeUsers.daily,
            );
            expect(overview.activeUsers.daily).toBeGreaterThanOrEqual(
              overview.activeUsers.current,
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Property 2: User Behavior Analytics Consistency
     * Validates: Requirements 1.2, 1.5, 2.4
     *
     * Property: User behavior analytics should maintain data consistency
     */
    it('should return consistent user behavior analytics', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.option(fc.string({ minLength: 1, maxLength: 50 })), // userId
          fc.option(
            fc.record({
              startDate: fc.date({
                min: new Date('2023-01-01'),
                max: new Date(),
              }),
              endDate: fc.date({
                min: new Date('2023-01-01'),
                max: new Date(),
              }),
            }),
          ), // timeRange
          async (userId, timeRange) => {
            // Ensure endDate is after startDate if both provided
            if (timeRange && timeRange.endDate < timeRange.startDate) {
              [timeRange.startDate, timeRange.endDate] = [
                timeRange.endDate,
                timeRange.startDate,
              ];
            }

            // Act: Get user behavior analytics
            const analytics = await service.getUserBehaviorAnalytics(
              userId,
              timeRange,
            );

            // Assert: Analytics should have consistent structure
            expect(analytics).toEqual({
              totalUsers: expect.any(Number),
              activeUsers: {
                current: expect.any(Number),
                daily: expect.any(Number),
                weekly: expect.any(Number),
                monthly: expect.any(Number),
              },
              sessionMetrics: {
                averageDuration: expect.any(Number),
                actionsPerSession: expect.any(Number),
                bounceRate: expect.any(Number),
              },
              engagementMetrics: {
                votesPerUser: expect.any(Number),
                roomsJoinedPerUser: expect.any(Number),
                matchesFoundPerUser: expect.any(Number),
              },
              retentionMetrics: {
                day1: expect.any(Number),
                day7: expect.any(Number),
                day30: expect.any(Number),
              },
            });

            // Property: All metrics should be non-negative
            expect(analytics.totalUsers).toBeGreaterThanOrEqual(0);
            expect(analytics.activeUsers.current).toBeGreaterThanOrEqual(0);
            expect(analytics.activeUsers.daily).toBeGreaterThanOrEqual(0);
            expect(analytics.activeUsers.weekly).toBeGreaterThanOrEqual(0);
            expect(analytics.activeUsers.monthly).toBeGreaterThanOrEqual(0);

            expect(
              analytics.sessionMetrics.averageDuration,
            ).toBeGreaterThanOrEqual(0);
            expect(
              analytics.sessionMetrics.actionsPerSession,
            ).toBeGreaterThanOrEqual(0);
            expect(analytics.sessionMetrics.bounceRate).toBeGreaterThanOrEqual(
              0,
            );
            expect(analytics.sessionMetrics.bounceRate).toBeLessThanOrEqual(1);

            expect(
              analytics.engagementMetrics.votesPerUser,
            ).toBeGreaterThanOrEqual(0);
            expect(
              analytics.engagementMetrics.roomsJoinedPerUser,
            ).toBeGreaterThanOrEqual(0);
            expect(
              analytics.engagementMetrics.matchesFoundPerUser,
            ).toBeGreaterThanOrEqual(0);

            // Property: Retention rates should be between 0 and 1
            expect(analytics.retentionMetrics.day1).toBeGreaterThanOrEqual(0);
            expect(analytics.retentionMetrics.day1).toBeLessThanOrEqual(1);
            expect(analytics.retentionMetrics.day7).toBeGreaterThanOrEqual(0);
            expect(analytics.retentionMetrics.day7).toBeLessThanOrEqual(1);
            expect(analytics.retentionMetrics.day30).toBeGreaterThanOrEqual(0);
            expect(analytics.retentionMetrics.day30).toBeLessThanOrEqual(1);

            // Property: Retention should generally decrease over time
            expect(analytics.retentionMetrics.day1).toBeGreaterThanOrEqual(
              analytics.retentionMetrics.day7,
            );
            expect(analytics.retentionMetrics.day7).toBeGreaterThanOrEqual(
              analytics.retentionMetrics.day30,
            );

            // Property: User hierarchy should be logical
            expect(analytics.activeUsers.monthly).toBeGreaterThanOrEqual(
              analytics.activeUsers.weekly,
            );
            expect(analytics.activeUsers.weekly).toBeGreaterThanOrEqual(
              analytics.activeUsers.daily,
            );
            expect(analytics.activeUsers.daily).toBeGreaterThanOrEqual(
              analytics.activeUsers.current,
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Property 3: Room Performance Analytics Consistency
     * Validates: Requirements 2.1, 2.2, 2.7
     *
     * Property: Room performance analytics should maintain consistency
     */
    it('should return consistent room performance analytics', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.option(fc.string({ minLength: 1, maxLength: 50 })), // roomId
          fc.option(
            fc.record({
              startDate: fc.date({
                min: new Date('2023-01-01'),
                max: new Date(),
              }),
              endDate: fc.date({
                min: new Date('2023-01-01'),
                max: new Date(),
              }),
            }),
          ), // timeRange
          async (roomId, timeRange) => {
            // Ensure endDate is after startDate if both provided
            if (timeRange && timeRange.endDate < timeRange.startDate) {
              [timeRange.startDate, timeRange.endDate] = [
                timeRange.endDate,
                timeRange.startDate,
              ];
            }

            // Act: Get room performance analytics
            const analytics = await service.getRoomPerformanceAnalytics(
              roomId,
              timeRange,
            );

            // Assert: Analytics should have consistent structure
            expect(analytics).toEqual({
              totalRooms: expect.any(Number),
              completionRate: expect.any(Number),
              averageMetrics: {
                duration: expect.any(Number),
                memberCount: expect.any(Number),
                votesPerMatch: expect.any(Number),
                timeToConsensus: expect.any(Number),
              },
              performanceDistribution: {
                highPerforming: expect.any(Number),
                mediumPerforming: expect.any(Number),
                lowPerforming: expect.any(Number),
              },
              optimizationInsights: expect.any(Array),
            });

            // Property: All numeric values should be non-negative
            expect(analytics.totalRooms).toBeGreaterThanOrEqual(0);
            expect(analytics.completionRate).toBeGreaterThanOrEqual(0);
            expect(analytics.completionRate).toBeLessThanOrEqual(1);

            expect(analytics.averageMetrics.duration).toBeGreaterThanOrEqual(0);
            expect(analytics.averageMetrics.memberCount).toBeGreaterThanOrEqual(
              0,
            );
            expect(
              analytics.averageMetrics.votesPerMatch,
            ).toBeGreaterThanOrEqual(0);
            expect(
              analytics.averageMetrics.timeToConsensus,
            ).toBeGreaterThanOrEqual(0);

            // Property: Performance distribution should sum to approximately 1
            const distributionSum =
              analytics.performanceDistribution.highPerforming +
              analytics.performanceDistribution.mediumPerforming +
              analytics.performanceDistribution.lowPerforming;

            expect(distributionSum).toBeCloseTo(1, 2);

            // Property: Each distribution component should be between 0 and 1
            expect(
              analytics.performanceDistribution.highPerforming,
            ).toBeGreaterThanOrEqual(0);
            expect(
              analytics.performanceDistribution.highPerforming,
            ).toBeLessThanOrEqual(1);
            expect(
              analytics.performanceDistribution.mediumPerforming,
            ).toBeGreaterThanOrEqual(0);
            expect(
              analytics.performanceDistribution.mediumPerforming,
            ).toBeLessThanOrEqual(1);
            expect(
              analytics.performanceDistribution.lowPerforming,
            ).toBeGreaterThanOrEqual(0);
            expect(
              analytics.performanceDistribution.lowPerforming,
            ).toBeLessThanOrEqual(1);

            // Property: Optimization insights should have valid structure
            analytics.optimizationInsights.forEach((insight) => {
              expect(insight).toEqual({
                insight: expect.any(String),
                impact: expect.stringMatching(/^(high|medium|low)$/),
                recommendation: expect.any(String),
              });
            });
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Property 4: Content Preference Analytics Consistency
     * Validates: Requirements 3.1, 7.1, 7.2
     *
     * Property: Content preference analytics should maintain consistency
     */
    it('should return consistent content preference analytics', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.option(fc.string({ minLength: 1, maxLength: 50 })), // userId
          fc.option(
            fc.record({
              startDate: fc.date({
                min: new Date('2023-01-01'),
                max: new Date(),
              }),
              endDate: fc.date({
                min: new Date('2023-01-01'),
                max: new Date(),
              }),
            }),
          ), // timeRange
          async (userId, timeRange) => {
            // Ensure endDate is after startDate if both provided
            if (timeRange && timeRange.endDate < timeRange.startDate) {
              [timeRange.startDate, timeRange.endDate] = [
                timeRange.endDate,
                timeRange.startDate,
              ];
            }

            // Act: Get content preference analytics
            const analytics = await service.getContentPreferenceAnalytics(
              userId,
              timeRange,
            );

            // Assert: Analytics should have consistent structure
            expect(analytics).toEqual({
              genrePreferences: expect.any(Object),
              contentPerformance: {
                topRated: expect.any(Array),
                mostVoted: expect.any(Array),
                highestConsensus: expect.any(Array),
              },
              aiRecommendationMetrics: {
                totalRecommendations: expect.any(Number),
                acceptanceRate: expect.any(Number),
                effectivenessScore: expect.any(Number),
              },
              trendingContent: expect.any(Array),
            });

            // Property: Genre preferences should sum to approximately 1
            const genrePreferenceSum = Object.values(
              analytics.genrePreferences,
            ).reduce((sum, value) => sum + value, 0);

            expect(genrePreferenceSum).toBeCloseTo(1, 2);

            // Property: Each genre preference should be between 0 and 1
            Object.values(analytics.genrePreferences).forEach((preference) => {
              expect(preference).toBeGreaterThanOrEqual(0);
              expect(preference).toBeLessThanOrEqual(1);
            });

            // Property: AI recommendation metrics should be valid
            expect(
              analytics.aiRecommendationMetrics.totalRecommendations,
            ).toBeGreaterThanOrEqual(0);
            expect(
              analytics.aiRecommendationMetrics.acceptanceRate,
            ).toBeGreaterThanOrEqual(0);
            expect(
              analytics.aiRecommendationMetrics.acceptanceRate,
            ).toBeLessThanOrEqual(1);
            expect(
              analytics.aiRecommendationMetrics.effectivenessScore,
            ).toBeGreaterThanOrEqual(0);
            expect(
              analytics.aiRecommendationMetrics.effectivenessScore,
            ).toBeLessThanOrEqual(1);

            // Property: Content performance arrays should have valid structure
            analytics.contentPerformance.topRated.forEach((item) => {
              expect(item).toEqual({
                contentId: expect.any(String),
                rating: expect.any(Number),
              });
              expect(item.rating).toBeGreaterThanOrEqual(0);
              expect(item.rating).toBeLessThanOrEqual(5);
            });

            analytics.contentPerformance.mostVoted.forEach((item) => {
              expect(item).toEqual({
                contentId: expect.any(String),
                votes: expect.any(Number),
              });
              expect(item.votes).toBeGreaterThanOrEqual(0);
            });

            analytics.contentPerformance.highestConsensus.forEach((item) => {
              expect(item).toEqual({
                contentId: expect.any(String),
                consensusRate: expect.any(Number),
              });
              expect(item.consensusRate).toBeGreaterThanOrEqual(0);
              expect(item.consensusRate).toBeLessThanOrEqual(1);
            });

            // Property: Trending content should have valid structure
            analytics.trendingContent.forEach((item) => {
              expect(item).toEqual({
                contentId: expect.any(String),
                trendScore: expect.any(Number),
                category: expect.any(String),
              });
              expect(item.trendScore).toBeGreaterThanOrEqual(0);
              expect(item.trendScore).toBeLessThanOrEqual(1);
            });
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Property 5: Predictive Insights Consistency
     * Validates: Requirements 7.1, 7.2, 7.3
     *
     * Property: Predictive insights should maintain consistency
     */
    it('should return consistent predictive insights', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.option(
            fc.record({
              startDate: fc.date({
                min: new Date('2023-01-01'),
                max: new Date(),
              }),
              endDate: fc.date({
                min: new Date('2023-01-01'),
                max: new Date(),
              }),
            }),
          ), // timeRange
          async (timeRange) => {
            // Ensure endDate is after startDate if both provided
            if (timeRange && timeRange.endDate < timeRange.startDate) {
              [timeRange.startDate, timeRange.endDate] = [
                timeRange.endDate,
                timeRange.startDate,
              ];
            }

            // Act: Generate predictive insights
            const insights =
              await service.generatePredictiveInsights(timeRange);

            // Assert: Insights should have consistent structure
            expect(insights).toEqual({
              userChurnPrediction: expect.any(Array),
              roomSuccessPrediction: expect.any(Array),
              contentTrends: expect.any(Array),
            });

            // Property: User churn predictions should have valid structure
            insights.userChurnPrediction.forEach((prediction) => {
              expect(prediction).toEqual({
                userId: expect.any(String),
                churnProbability: expect.any(Number),
                riskFactors: expect.any(Array),
                recommendations: expect.any(Array),
              });
              expect(prediction.churnProbability).toBeGreaterThanOrEqual(0);
              expect(prediction.churnProbability).toBeLessThanOrEqual(1);
              expect(prediction.riskFactors.length).toBeGreaterThanOrEqual(0);
              expect(prediction.recommendations.length).toBeGreaterThanOrEqual(
                0,
              );
            });

            // Property: Room success predictions should have valid structure
            insights.roomSuccessPrediction.forEach((prediction) => {
              expect(prediction).toEqual({
                roomId: expect.any(String),
                successProbability: expect.any(Number),
                optimizationSuggestions: expect.any(Array),
              });
              expect(prediction.successProbability).toBeGreaterThanOrEqual(0);
              expect(prediction.successProbability).toBeLessThanOrEqual(1);
              expect(
                prediction.optimizationSuggestions.length,
              ).toBeGreaterThanOrEqual(0);
            });

            // Property: Content trends should have valid structure
            insights.contentTrends.forEach((trend) => {
              expect(trend).toEqual({
                genre: expect.any(String),
                trendDirection: expect.stringMatching(/^(up|down|stable)$/),
                confidence: expect.any(Number),
                timeframe: expect.any(String),
              });
              expect(trend.confidence).toBeGreaterThanOrEqual(0);
              expect(trend.confidence).toBeLessThanOrEqual(1);
            });
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Unit Tests - Specific Analytics Functions', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should handle dashboard overview with default time range', async () => {
      const overview = await service.getDashboardOverview();

      expect(overview).toBeDefined();
      expect(overview.activeUsers).toBeDefined();
      expect(overview.roomMetrics).toBeDefined();
      expect(overview.contentMetrics).toBeDefined();
      expect(overview.systemHealth).toBeDefined();
    });

    it('should handle user behavior analytics without user ID', async () => {
      const analytics = await service.getUserBehaviorAnalytics();

      expect(analytics).toBeDefined();
      expect(analytics.totalUsers).toBeGreaterThanOrEqual(0);
      expect(analytics.activeUsers).toBeDefined();
      expect(analytics.sessionMetrics).toBeDefined();
      expect(analytics.engagementMetrics).toBeDefined();
      expect(analytics.retentionMetrics).toBeDefined();
    });

    it('should handle room performance analytics without room ID', async () => {
      const analytics = await service.getRoomPerformanceAnalytics();

      expect(analytics).toBeDefined();
      expect(analytics.totalRooms).toBeGreaterThanOrEqual(0);
      expect(analytics.completionRate).toBeGreaterThanOrEqual(0);
      expect(analytics.averageMetrics).toBeDefined();
      expect(analytics.performanceDistribution).toBeDefined();
      expect(analytics.optimizationInsights).toBeDefined();
    });

    it('should handle content preference analytics without user ID', async () => {
      const analytics = await service.getContentPreferenceAnalytics();

      expect(analytics).toBeDefined();
      expect(analytics.genrePreferences).toBeDefined();
      expect(analytics.contentPerformance).toBeDefined();
      expect(analytics.aiRecommendationMetrics).toBeDefined();
      expect(analytics.trendingContent).toBeDefined();
    });

    it('should handle predictive insights generation', async () => {
      const insights = await service.generatePredictiveInsights();

      expect(insights).toBeDefined();
      expect(insights.userChurnPrediction).toBeDefined();
      expect(insights.roomSuccessPrediction).toBeDefined();
      expect(insights.contentTrends).toBeDefined();
    });
  });
});
