/**
 * Analysis Engine Property-Based Tests
 * Property tests for the Analysis Engine core functionality
 */

import { Test, TestingModule } from '@nestjs/testing';
import * as fc from 'fast-check';
import { AnalysisEngineService } from './analysis-engine.service';
import {
  RepositoryAnalysis,
  InfrastructureAnalysis,
  SystemAnalysis,
  ObsoleteComponents,
} from './analysis-engine.interface';

// Shared arbitraries for property tests
const repositoryAnalysisArb = fc.record({
  modules: fc.array(fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    path: fc.string({ minLength: 1, maxLength: 50 }),
    type: fc.constantFrom('nestjs', 'react-native', 'config', 'infrastructure'),
    dependencies: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
    exports: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
    size: fc.integer({ min: 1, max: 10000 }),
    lastModified: fc.date(),
  }), { maxLength: 10 }),
  dependencies: fc.record({
    nodes: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
    edges: fc.array(fc.record({
      from: fc.string({ minLength: 1, maxLength: 20 }),
      to: fc.string({ minLength: 1, maxLength: 20 }),
      type: fc.string({ minLength: 1, maxLength: 10 }),
    }), { maxLength: 10 }),
    cycles: fc.array(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }), { maxLength: 2 }),
    unusedDependencies: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  }),
  configurations: fc.array(fc.record({
    path: fc.string({ minLength: 1, maxLength: 50 }),
    type: fc.constantFrom('package.json', 'tsconfig', 'env', 'docker', 'cdk', 'jest', 'eslint', 'prettier', 'babel', 'metro', 'eas', 'expo', 'other'),
    content: fc.anything(),
    isObsolete: fc.boolean(),
  }), { maxLength: 5 }),
  testCoverage: fc.record({
    totalLines: fc.integer({ min: 0, max: 10000 }),
    coveredLines: fc.integer({ min: 0, max: 10000 }),
    percentage: fc.float({ min: 0, max: 100 }),
    uncoveredFiles: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 5 }),
  }),
  codeMetrics: fc.record({
    totalLines: fc.integer({ min: 0, max: 10000 }),
    totalFiles: fc.integer({ min: 0, max: 100 }),
    averageComplexity: fc.float({ min: 0, max: 100 }),
    duplicatedCode: fc.array(fc.anything(), { maxLength: 3 }),
    technicalDebt: fc.array(fc.anything(), { maxLength: 3 }),
    maintainabilityIndex: fc.float({ min: 0, max: 100 }),
  }),
  securityIssues: fc.array(fc.anything(), { maxLength: 3 }),
  performanceIssues: fc.array(fc.anything(), { maxLength: 3 }),
  qualityIssues: fc.array(fc.anything(), { maxLength: 3 }),
});

const infrastructureAnalysisArb = fc.record({
  cdkStacks: fc.array(fc.anything(), { maxLength: 3 }),
  awsResources: fc.array(fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    type: fc.constantFrom('lambda', 'dynamodb', 'appsync', 'cognito', 's3', 'cloudfront'),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    dependencies: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
    lastUsed: fc.option(fc.date()),
  }), { maxLength: 5 }),
  costEstimate: fc.anything(),
  securityAnalysis: fc.array(fc.anything(), { maxLength: 3 }),
  performanceAnalysis: fc.anything(),
  complianceAnalysis: fc.anything(),
});

const systemAnalysisArb = fc.record({
  repository: repositoryAnalysisArb,
  infrastructure: infrastructureAnalysisArb,
  features: fc.anything(),
  dependencies: fc.anything(),
  obsoleteComponents: fc.array(fc.anything(), { maxLength: 5 }),
  recommendations: fc.array(fc.anything(), { maxLength: 5 }),
  migrationPlan: fc.array(fc.anything(), { maxLength: 5 }),
});

// Feature: trinity-complete-refactoring, Property 1: Comprehensive Code Analysis
describe('Property: Comprehensive Code Analysis', () => {
  let service: AnalysisEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalysisEngineService],
    }).compile();

    service = module.get<AnalysisEngineService>(AnalysisEngineService);
  });

  it('Property: Repository analysis should always return complete analysis structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        async (path) => {
          // Execute
          const result = await service.scanRepository(path);

          // Verify structure
          expect(result).toBeDefined();
          expect(result.modules).toBeDefined();
          expect(Array.isArray(result.modules)).toBe(true);
          expect(result.dependencies).toBeDefined();
          expect(result.configurations).toBeDefined();
          expect(Array.isArray(result.configurations)).toBe(true);
          expect(result.testCoverage).toBeDefined();
          expect(result.codeMetrics).toBeDefined();
          expect(result.securityIssues).toBeDefined();
          expect(Array.isArray(result.securityIssues)).toBe(true);
          expect(result.performanceIssues).toBeDefined();
          expect(Array.isArray(result.performanceIssues)).toBe(true);
          expect(result.qualityIssues).toBeDefined();
          expect(Array.isArray(result.qualityIssues)).toBe(true);

          // Verify data types
          expect(typeof result.codeMetrics.totalFiles).toBe('number');
          expect(typeof result.codeMetrics.averageComplexity).toBe('number');
          expect(result.codeMetrics.averageComplexity).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 5 }
    );
  });

  it('Property: Analysis should handle empty repositories gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        async (path) => {
          // Execute
          const result = await service.scanRepository(path);

          // Verify graceful handling
          expect(result).toBeDefined();
          expect(result.modules).toEqual([]);
          expect(result.dependencies.nodes).toEqual([]);
          expect(result.dependencies.edges).toEqual([]);
          expect(result.codeMetrics.totalFiles).toBe(0);
          expect(result.codeMetrics.averageComplexity).toBe(0);
        }
      ),
      { numRuns: 3 }
    );
  });

  it('Property: Infrastructure analysis should return valid structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        async (cdkPath) => {
          // Execute
          const result = await service.analyzeInfrastructure(cdkPath);

          // Verify structure
          expect(result).toBeDefined();
          expect(result.cdkStacks).toBeDefined();
          expect(Array.isArray(result.cdkStacks)).toBe(true);
          expect(result.awsResources).toBeDefined();
          expect(Array.isArray(result.awsResources)).toBe(true);
          expect(result.costEstimate).toBeDefined();
          expect(result.securityAnalysis).toBeDefined();
          expect(Array.isArray(result.securityAnalysis)).toBe(true);
          expect(result.performanceAnalysis).toBeDefined();
          expect(result.complianceAnalysis).toBeDefined();
        }
      ),
      { numRuns: 3 }
    );
  });

  it('Property: System analysis should integrate all components', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        async (rootPath) => {
          // Execute
          const result = await service.analyzeSystem(rootPath);

          // Verify structure
          expect(result).toBeDefined();
          expect(result.repository).toBeDefined();
          expect(result.infrastructure).toBeDefined();
          expect(result.features).toBeDefined();
          expect(result.dependencies).toBeDefined();
          expect(result.obsoleteComponents).toBeDefined();
          expect(Array.isArray(result.obsoleteComponents)).toBe(true);
          expect(result.recommendations).toBeDefined();
          expect(Array.isArray(result.recommendations)).toBe(true);
          expect(result.migrationPlan).toBeDefined();
          expect(Array.isArray(result.migrationPlan)).toBe(true);
        }
      ),
      { numRuns: 3 }
    );
  });
});

// Feature: trinity-complete-refactoring, Property 2: Obsolete Component Detection
describe('Property: Obsolete Component Detection', () => {
  let service: AnalysisEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalysisEngineService],
    }).compile();

    service = module.get<AnalysisEngineService>(AnalysisEngineService);
  });

  it('Property: Obsolete component detection should return consistent results', async () => {
    await fc.assert(
      fc.asyncProperty(
        systemAnalysisArb,
        async (analysis) => {
          // Ensure modules is an array of proper objects
          if (analysis.repository.modules && Array.isArray(analysis.repository.modules)) {
            analysis.repository.modules = analysis.repository.modules.filter(m => 
              m && typeof m === 'object' && typeof m.path === 'string' && typeof m.name === 'string'
            );
          } else {
            analysis.repository.modules = [];
          }

          // Ensure awsResources is properly structured
          if (analysis.infrastructure.awsResources && Array.isArray(analysis.infrastructure.awsResources)) {
            analysis.infrastructure.awsResources = analysis.infrastructure.awsResources.filter(r => 
              r && typeof r === 'object' && typeof r.id === 'string'
            );
          } else {
            analysis.infrastructure.awsResources = [];
          }

          // Execute
          const result = await service.identifyObsoleteComponents(analysis);

          // Verify structure
          expect(result).toBeDefined();
          expect(result.components).toBeDefined();
          expect(Array.isArray(result.components)).toBe(true);
          expect(typeof result.totalSize).toBe('number');
          expect(result.totalSize).toBeGreaterThanOrEqual(0);
          expect(result.potentialSavings).toBeDefined();
          expect(typeof result.potentialSavings.storage).toBe('number');
          expect(typeof result.potentialSavings.cost).toBe('number');
          expect(typeof result.potentialSavings.complexity).toBe('number');

          // Verify component structure only for valid components
          for (const component of result.components) {
            if (component && typeof component === 'object') {
              expect(component.path).toBeDefined();
              expect(typeof component.path).toBe('string');
              expect(component.type).toBeDefined();
              expect(['file', 'directory', 'dependency', 'infrastructure'].includes(component.type)).toBe(true);
              expect(component.reason).toBeDefined();
              expect(typeof component.reason).toBe('string');
              expect(typeof component.safeToRemove).toBe('boolean');
              expect(Array.isArray(component.dependencies)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 3 }
    );
  });

  it('Property: Empty analysis should produce empty obsolete components', async () => {
    const emptyAnalysis: SystemAnalysis = {
      repository: {
        modules: [],
        dependencies: { nodes: [], edges: [], cycles: [], unusedDependencies: [] },
        configurations: [],
        testCoverage: { totalLines: 0, coveredLines: 0, percentage: 0, uncoveredFiles: [] },
        codeMetrics: { totalLines: 0, totalFiles: 0, averageComplexity: 0, duplicatedCode: [], technicalDebt: [], maintainabilityIndex: 0 },
        securityIssues: [],
        performanceIssues: [],
        qualityIssues: [],
      },
      infrastructure: {
        cdkStacks: [],
        awsResources: [],
        costEstimate: {},
        securityAnalysis: [],
        performanceAnalysis: '',
        complianceAnalysis: {},
      },
      features: {},
      dependencies: 0,
      obsoleteComponents: [],
      recommendations: [],
      migrationPlan: [],
    };

    const result = await service.identifyObsoleteComponents(emptyAnalysis);

    expect(result.components).toEqual([]);
    expect(result.totalSize).toBe(0);
    expect(result.potentialSavings.storage).toBe(0);
    expect(result.potentialSavings.cost).toBe(0);
    expect(result.potentialSavings.complexity).toBe(0);
  });
});

// Feature: trinity-complete-refactoring, Property 3: Feature Mapping Accuracy
describe('Property: Feature Mapping Accuracy', () => {
  let service: AnalysisEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalysisEngineService],
    }).compile();

    service = module.get<AnalysisEngineService>(AnalysisEngineService);
  });

  const codebaseArb = fc.record({
    rootPath: fc.string({ minLength: 1, maxLength: 50 }),
    analysis: repositoryAnalysisArb,
    infrastructure: infrastructureAnalysisArb,
  });

  it('Property: Feature extraction should return consistent feature structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        codebaseArb,
        async (codebase) => {
          // Ensure modules is properly structured
          if (codebase.analysis.modules && Array.isArray(codebase.analysis.modules)) {
            codebase.analysis.modules = codebase.analysis.modules.filter(m => 
              m && typeof m === 'object' && typeof m.path === 'string' && typeof m.name === 'string'
            );
          } else {
            codebase.analysis.modules = [];
          }

          // Execute
          const result = await service.extractFeatures(codebase);

          // Verify structure
          expect(result).toBeDefined();
          expect(result.features).toBeDefined();
          expect(Array.isArray(result.features)).toBe(true);
          expect(result.coreFeatures).toBeDefined();
          expect(Array.isArray(result.coreFeatures)).toBe(true);
          expect(result.deprecatedFeatures).toBeDefined();
          expect(Array.isArray(result.deprecatedFeatures)).toBe(true);
          expect(result.missingFeatures).toBeDefined();
          expect(Array.isArray(result.missingFeatures)).toBe(true);

          // Verify feature structure
          for (const feature of result.features) {
            expect(feature.name).toBeDefined();
            expect(typeof feature.name).toBe('string');
            expect(feature.description).toBeDefined();
            expect(typeof feature.description).toBe('string');
            expect(Array.isArray(feature.modules)).toBe(true);
            expect(['low', 'medium', 'high'].includes(feature.complexity)).toBe(true);
            expect(['low', 'medium', 'high'].includes(feature.userImpact)).toBe(true);
            expect(typeof feature.isCore).toBe('boolean');
            expect(typeof feature.isDeprecated).toBe('boolean');
            expect(Array.isArray(feature.dependencies)).toBe(true);
          }

          // Verify core features are subset of all features
          const allFeatureNames = new Set(result.features.map(f => f.name));
          for (const coreFeature of result.coreFeatures) {
            expect(allFeatureNames.has(coreFeature.name)).toBe(true);
            expect(coreFeature.isCore).toBe(true);
          }

          // Verify deprecated features are subset of all features
          for (const deprecatedFeature of result.deprecatedFeatures) {
            expect(allFeatureNames.has(deprecatedFeature.name)).toBe(true);
            expect(deprecatedFeature.isDeprecated).toBe(true);
          }
        }
      ),
      { numRuns: 3 }
    );
  });

  it('Property: Feature mapping should handle empty codebase gracefully', async () => {
    const emptyCodebase = {
      rootPath: '/empty',
      analysis: {
        modules: [],
        dependencies: { nodes: [], edges: [], cycles: [], unusedDependencies: [] },
        configurations: [],
        testCoverage: { totalLines: 0, coveredLines: 0, percentage: 0, uncoveredFiles: [] },
        codeMetrics: { totalLines: 0, totalFiles: 0, averageComplexity: 0, duplicatedCode: [], technicalDebt: [], maintainabilityIndex: 0 },
        securityIssues: [],
        performanceIssues: [],
        qualityIssues: [],
      },
      infrastructure: {
        cdkStacks: [],
        awsResources: [],
        costEstimate: {},
        securityAnalysis: [],
        performanceAnalysis: '',
        complianceAnalysis: {},
      },
    };

    const result = await service.extractFeatures(emptyCodebase);

    expect(result).toBeDefined();
    expect(result.features).toBeDefined();
    expect(Array.isArray(result.features)).toBe(true);
    expect(result.coreFeatures).toEqual([]);
    expect(result.deprecatedFeatures).toEqual([]);
    expect(Array.isArray(result.missingFeatures)).toBe(true);
    expect(result.missingFeatures.length).toBeGreaterThan(0); // Should identify missing features
  });

  it('Property: Feature dependencies should be valid', async () => {
    await fc.assert(
      fc.asyncProperty(
        codebaseArb,
        async (codebase) => {
          // Ensure modules is properly structured
          if (codebase.analysis.modules && Array.isArray(codebase.analysis.modules)) {
            codebase.analysis.modules = codebase.analysis.modules.filter(m => 
              m && typeof m === 'object' && typeof m.path === 'string' && typeof m.name === 'string'
            );
          } else {
            codebase.analysis.modules = [];
          }

          // Execute
          const result = await service.extractFeatures(codebase);

          // Verify dependencies are valid
          const allFeatureNames = new Set(result.features.map(f => f.name));
          
          for (const feature of result.features) {
            for (const dependency of feature.dependencies) {
              expect(typeof dependency).toBe('string');
              // Dependencies should either be known features or external dependencies
              // We don't enforce that all dependencies are known features since they could be external
            }
          }
        }
      ),
      { numRuns: 3 }
    );
  });
});