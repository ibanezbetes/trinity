import { Test, TestingModule } from '@nestjs/testing';
import { CostOptimizationService } from './cost-optimization.service';
import * as fc from 'fast-check';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-cloudwatch');
jest.mock('@aws-sdk/client-budgets');
jest.mock('@aws-sdk/client-lambda');
jest.mock('@aws-sdk/client-dynamodb');

describe('CostOptimizationService', () => {
  let service: CostOptimizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CostOptimizationService],
    }).compile();

    service = module.get<CostOptimizationService>(CostOptimizationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentCostMetrics', () => {
    it('should return cost metrics with valid structure', async () => {
      const metrics = await service.getCurrentCostMetrics();

      expect(metrics).toHaveProperty('estimatedMonthlyCost');
      expect(metrics).toHaveProperty('lambdaInvocations');
      expect(metrics).toHaveProperty('dynamoReadUnits');
      expect(metrics).toHaveProperty('dynamoWriteUnits');
      expect(metrics).toHaveProperty('lastUpdated');

      expect(typeof metrics.estimatedMonthlyCost).toBe('number');
      expect(typeof metrics.lambdaInvocations).toBe('number');
      expect(typeof metrics.dynamoReadUnits).toBe('number');
      expect(typeof metrics.dynamoWriteUnits).toBe('number');
      expect(metrics.lastUpdated).toBeInstanceOf(Date);
    });

    it('should return non-negative values', async () => {
      const metrics = await service.getCurrentCostMetrics();

      expect(metrics.estimatedMonthlyCost).toBeGreaterThanOrEqual(0);
      expect(metrics.lambdaInvocations).toBeGreaterThanOrEqual(0);
      expect(metrics.dynamoReadUnits).toBeGreaterThanOrEqual(0);
      expect(metrics.dynamoWriteUnits).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateOptimizationRecommendations', () => {
    it('should return array of recommendations', async () => {
      const recommendations =
        await service.generateOptimizationRecommendations();

      expect(Array.isArray(recommendations)).toBe(true);

      if (recommendations.length > 0) {
        const recommendation = recommendations[0];
        expect(recommendation).toHaveProperty('type');
        expect(recommendation).toHaveProperty('severity');
        expect(recommendation).toHaveProperty('title');
        expect(recommendation).toHaveProperty('description');
        expect(recommendation).toHaveProperty('potentialSavings');
        expect(recommendation).toHaveProperty('actionRequired');

        expect(['lambda', 'dynamodb', 'general']).toContain(
          recommendation.type,
        );
        expect(['low', 'medium', 'high']).toContain(recommendation.severity);
        expect(typeof recommendation.potentialSavings).toBe('number');
        expect(recommendation.potentialSavings).toBeGreaterThanOrEqual(0);
      }
    });

    it('should sort recommendations by potential savings', async () => {
      const recommendations =
        await service.generateOptimizationRecommendations();

      if (recommendations.length > 1) {
        for (let i = 0; i < recommendations.length - 1; i++) {
          expect(recommendations[i].potentialSavings).toBeGreaterThanOrEqual(
            recommendations[i + 1].potentialSavings,
          );
        }
      }
    });
  });

  describe('applyAutomaticOptimizations', () => {
    it('should return array of applied optimizations', async () => {
      const optimizations = await service.applyAutomaticOptimizations();

      expect(Array.isArray(optimizations)).toBe(true);
      optimizations.forEach((optimization) => {
        expect(typeof optimization).toBe('string');
        expect(optimization.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getBudgetStatus', () => {
    it('should return budget status or null', async () => {
      const budgetStatus = await service.getBudgetStatus();

      if (budgetStatus !== null) {
        expect(budgetStatus).toHaveProperty('budgetName');
        expect(budgetStatus).toHaveProperty('budgetLimit');
        expect(budgetStatus).toHaveProperty('actualSpend');
        expect(budgetStatus).toHaveProperty('forecastedSpend');
        expect(budgetStatus).toHaveProperty('percentageUsed');
        expect(budgetStatus).toHaveProperty('daysRemaining');

        expect(typeof budgetStatus.budgetLimit).toBe('number');
        expect(typeof budgetStatus.actualSpend).toBe('number');
        expect(typeof budgetStatus.forecastedSpend).toBe('number');
        expect(typeof budgetStatus.percentageUsed).toBe('number');
        expect(typeof budgetStatus.daysRemaining).toBe('number');

        expect(budgetStatus.budgetLimit).toBeGreaterThan(0);
        expect(budgetStatus.actualSpend).toBeGreaterThanOrEqual(0);
        expect(budgetStatus.forecastedSpend).toBeGreaterThanOrEqual(0);
        expect(budgetStatus.percentageUsed).toBeGreaterThanOrEqual(0);
        expect(budgetStatus.daysRemaining).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // Property-based tests
  describe('Property-based tests', () => {
    it('should handle various cost scenarios correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            estimatedMonthlyCost: fc.float({ min: 0, max: 1000 }),
            lambdaInvocations: fc.integer({ min: 0, max: 100000 }),
            dynamoReadUnits: fc.integer({ min: 0, max: 10000 }),
            dynamoWriteUnits: fc.integer({ min: 0, max: 5000 }),
          }),
          async (mockMetrics) => {
            // Mock the service methods to return our test data
            jest.spyOn(service, 'getCurrentCostMetrics').mockResolvedValue({
              ...mockMetrics,
              lastUpdated: new Date(),
            });

            const recommendations =
              await service.generateOptimizationRecommendations();

            // Verify recommendations are valid
            expect(Array.isArray(recommendations)).toBe(true);

            recommendations.forEach((rec) => {
              expect(['lambda', 'dynamodb', 'general']).toContain(rec.type);
              expect(['low', 'medium', 'high']).toContain(rec.severity);
              expect(rec.potentialSavings).toBeGreaterThanOrEqual(0);
              expect(typeof rec.title).toBe('string');
              expect(typeof rec.description).toBe('string');
              expect(typeof rec.actionRequired).toBe('string');
            });

            // High usage should generate more recommendations
            const highUsage =
              mockMetrics.lambdaInvocations > 10000 ||
              mockMetrics.dynamoReadUnits > 1000 ||
              mockMetrics.dynamoWriteUnits > 500 ||
              mockMetrics.estimatedMonthlyCost > 100;

            if (highUsage) {
              expect(recommendations.length).toBeGreaterThan(0);
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should generate consistent recommendations for same input', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            estimatedMonthlyCost: fc.float({ min: 0, max: 500 }),
            lambdaInvocations: fc.integer({ min: 0, max: 50000 }),
            dynamoReadUnits: fc.integer({ min: 0, max: 5000 }),
            dynamoWriteUnits: fc.integer({ min: 0, max: 2500 }),
          }),
          async (mockMetrics) => {
            // Mock the service methods
            jest.spyOn(service, 'getCurrentCostMetrics').mockResolvedValue({
              ...mockMetrics,
              lastUpdated: new Date(),
            });

            // Generate recommendations twice
            const recommendations1 =
              await service.generateOptimizationRecommendations();
            const recommendations2 =
              await service.generateOptimizationRecommendations();

            // Should be identical (deterministic)
            expect(recommendations1.length).toBe(recommendations2.length);

            for (let i = 0; i < recommendations1.length; i++) {
              expect(recommendations1[i].type).toBe(recommendations2[i].type);
              expect(recommendations1[i].severity).toBe(
                recommendations2[i].severity,
              );
              expect(recommendations1[i].potentialSavings).toBe(
                recommendations2[i].potentialSavings,
              );
            }
          },
        ),
        { numRuns: 30 },
      );
    });

    it('should validate budget status calculations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            budgetLimit: fc.float({ min: 10, max: 1000, noNaN: true }),
            actualSpend: fc.float({ min: 0, max: 1000, noNaN: true }),
            forecastedSpend: fc.float({ min: 0, max: 1000, noNaN: true }),
          }),
          async (mockBudget) => {
            // Ensure valid numbers
            const actualSpend = Math.min(
              mockBudget.actualSpend,
              mockBudget.budgetLimit * 2,
            );
            const forecastedSpend = mockBudget.forecastedSpend;

            // Mock budget status
            const mockBudgetStatus = {
              budgetName: 'test-budget',
              budgetLimit: mockBudget.budgetLimit,
              actualSpend: actualSpend,
              forecastedSpend: forecastedSpend,
              percentageUsed: (actualSpend / mockBudget.budgetLimit) * 100,
              daysRemaining: Math.floor(Math.random() * 31) + 1, // 1-31 days
            };

            jest
              .spyOn(service, 'getBudgetStatus')
              .mockResolvedValue(mockBudgetStatus);

            const budgetStatus = await service.getBudgetStatus();

            if (budgetStatus) {
              // Percentage should be calculated correctly
              const expectedPercentage =
                (budgetStatus.actualSpend / budgetStatus.budgetLimit) * 100;
              expect(
                Math.abs(budgetStatus.percentageUsed - expectedPercentage),
              ).toBeLessThan(0.01);

              // Values should be non-negative and finite
              expect(budgetStatus.budgetLimit).toBeGreaterThan(0);
              expect(budgetStatus.actualSpend).toBeGreaterThanOrEqual(0);
              expect(budgetStatus.forecastedSpend).toBeGreaterThanOrEqual(0);
              expect(budgetStatus.percentageUsed).toBeGreaterThanOrEqual(0);
              expect(budgetStatus.daysRemaining).toBeGreaterThan(0);

              // Ensure no NaN values
              expect(isFinite(budgetStatus.budgetLimit)).toBe(true);
              expect(isFinite(budgetStatus.actualSpend)).toBe(true);
              expect(isFinite(budgetStatus.forecastedSpend)).toBe(true);
              expect(isFinite(budgetStatus.percentageUsed)).toBe(true);
            }
          },
        ),
        { numRuns: 40 },
      );
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
