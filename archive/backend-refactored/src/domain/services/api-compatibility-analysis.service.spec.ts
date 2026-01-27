import { Test, TestingModule } from '@nestjs/testing';
import { ApiCompatibilityAnalysisService } from './api-compatibility-analysis.service';
import { 
  GraphQLOperation, 
  RestEndpoint, 
  CompatibilityLevel,
  ApiCompatibilityReport 
} from '../entities/api-compatibility.entity';

describe('ApiCompatibilityAnalysisService', () => {
  let service: ApiCompatibilityAnalysisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiCompatibilityAnalysisService],
    }).compile();

    service = module.get<ApiCompatibilityAnalysisService>(ApiCompatibilityAnalysisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyzeApiCompatibility', () => {
    it('should analyze GraphQL operations and identify compatibility issues', async () => {
      // Arrange
      const existingApiStructure = {
        graphqlOperations: [
          {
            name: 'getUserRooms',
            type: 'query' as const,
            parameters: {},
            responseFields: ['id', 'name', 'description'],
            deprecated: false
          },
          {
            name: 'createRoomDebug',
            type: 'mutation' as const,
            parameters: { input: { name: 'string' } },
            responseFields: ['id', 'name'],
            deprecated: true
          }
        ] as GraphQLOperation[],
        restEndpoints: [] as RestEndpoint[],
        subscriptions: [] as GraphQLOperation[]
      };

      const newBackendServices = ['RoomService', 'VotingService'];

      // Act
      const result = await service.analyzeApiCompatibility(existingApiStructure, newBackendServices);

      // Assert
      expect(result).toBeDefined();
      expect(result.compatibilityGaps).toBeDefined();
      expect(result.migrationRecommendations).toBeDefined();
      expect(result.versionRequirements).toBeDefined();
      expect(result.analysisDetails.totalOperations).toBe(2);
    });

    it('should identify deprecated operations correctly', async () => {
      // Arrange
      const existingApiStructure = {
        graphqlOperations: [
          {
            name: 'createRoomDebug',
            type: 'mutation' as const,
            parameters: { input: { name: 'string' } },
            responseFields: ['id', 'name'],
            deprecated: true
          }
        ] as GraphQLOperation[],
        restEndpoints: [] as RestEndpoint[],
        subscriptions: [] as GraphQLOperation[]
      };

      const newBackendServices = ['RoomService'];

      // Act
      const result = await service.analyzeApiCompatibility(existingApiStructure, newBackendServices);

      // Assert
      const deprecatedGaps = result.compatibilityGaps.filter(gap => 
        gap.operationName === 'createRoomDebug' && gap.severity === 'medium'
      );
      expect(deprecatedGaps.length).toBeGreaterThan(0);

      const migrationRecs = result.migrationRecommendations.filter(rec =>
        rec.operationName === 'createRoomDebug' && rec.recommendationType === 'migrate_to_new_operation'
      );
      expect(migrationRecs.length).toBeGreaterThan(0);
    });

    it('should handle REST endpoints and recommend GraphQL migration', async () => {
      // Arrange
      const existingApiStructure = {
        graphqlOperations: [] as GraphQLOperation[],
        restEndpoints: [
          {
            path: '/api/rooms',
            method: 'GET' as const,
            parameters: {},
            responseFormat: { rooms: 'Room[]' },
            deprecated: true,
            replacementGraphQL: 'getUserRooms'
          }
        ] as RestEndpoint[],
        subscriptions: [] as GraphQLOperation[]
      };

      const newBackendServices = ['RoomService'];

      // Act
      const result = await service.analyzeApiCompatibility(existingApiStructure, newBackendServices);

      // Assert
      const restGaps = result.compatibilityGaps.filter(gap => gap.operationType === 'rest');
      expect(restGaps.length).toBeGreaterThan(0);

      const graphqlMigrationRecs = result.migrationRecommendations.filter(rec =>
        rec.recommendationType === 'migrate_to_graphql'
      );
      expect(graphqlMigrationRecs.length).toBeGreaterThan(0);
    });

    it('should calculate overall compatibility level correctly', async () => {
      // Arrange - All compatible operations
      const compatibleApiStructure = {
        graphqlOperations: [
          {
            name: 'getUserRooms',
            type: 'query' as const,
            parameters: {},
            responseFields: ['id', 'name'],
            deprecated: false
          },
          {
            name: 'joinRoomByInvite',
            type: 'mutation' as const,
            parameters: { inviteCode: 'string' },
            responseFields: ['id', 'name'],
            deprecated: false
          }
        ] as GraphQLOperation[],
        restEndpoints: [] as RestEndpoint[],
        subscriptions: [] as GraphQLOperation[]
      };

      const newBackendServices = ['RoomService'];

      // Act
      const result = await service.analyzeApiCompatibility(compatibleApiStructure, newBackendServices);

      // Assert
      expect(result.overallCompatibility).toBe(CompatibilityLevel.FULLY_COMPATIBLE);
    });

    it('should identify unknown operations as requiring investigation', async () => {
      // Arrange
      const existingApiStructure = {
        graphqlOperations: [
          {
            name: 'unknownOperation',
            type: 'query' as const,
            parameters: {},
            responseFields: ['data'],
            deprecated: false
          }
        ] as GraphQLOperation[],
        restEndpoints: [] as RestEndpoint[],
        subscriptions: [] as GraphQLOperation[]
      };

      const newBackendServices = ['RoomService'];

      // Act
      const result = await service.analyzeApiCompatibility(existingApiStructure, newBackendServices);

      // Assert
      const unknownGaps = result.compatibilityGaps.filter(gap => 
        gap.operationName === 'unknownOperation' && gap.severity === 'medium'
      );
      expect(unknownGaps.length).toBeGreaterThan(0);
      expect(unknownGaps[0].description).toContain('Unknown GraphQL operation');
    });
  });

  describe('createCompatibilityMiddleware', () => {
    it('should create middleware configuration for compatibility gaps', async () => {
      // Arrange
      const compatibilityReport: ApiCompatibilityReport = {
        id: 'test-report',
        timestamp: new Date(),
        overallCompatibility: CompatibilityLevel.REQUIRES_ADAPTATION,
        compatibilityGaps: [
          {
            id: 'gap-1',
            operationType: 'graphql',
            operationName: 'createRoom',
            severity: 'medium',
            description: 'Requires parameter adaptation',
            impact: 'Minor changes needed',
            suggestedFix: 'Remove genrePreferences field'
          }
        ],
        migrationRecommendations: [
          {
            id: 'rec-1',
            operationName: 'createRoom',
            recommendationType: 'adapt_operation',
            description: 'Adapt createRoom operation',
            priority: 'medium',
            estimatedEffort: 'low',
            implementationSteps: ['Remove genrePreferences field']
          }
        ],
        versionRequirements: [],
        analysisDetails: {
          totalOperations: 1,
          compatibleOperations: 0,
          incompatibleOperations: 0,
          requiresAdaptation: 1
        }
      };

      // Act
      const result = await service.createCompatibilityMiddleware(compatibilityReport);

      // Assert
      expect(result.middlewareConfig).toBeDefined();
      expect(result.middlewareConfig.enableCompatibilityLayer).toBe(true);
      expect(result.transformationRules).toBeDefined();
      expect(result.transformationRules.length).toBeGreaterThan(0);
      expect(result.deprecationWarnings).toBeDefined();
    });

    it('should create transformation rules for operations requiring adaptation', async () => {
      // Arrange
      const compatibilityReport: ApiCompatibilityReport = {
        id: 'test-report',
        timestamp: new Date(),
        overallCompatibility: CompatibilityLevel.REQUIRES_ADAPTATION,
        compatibilityGaps: [
          {
            id: 'gap-1',
            operationType: 'graphql',
            operationName: 'createRoom',
            severity: 'medium',
            description: 'Requires parameter adaptation',
            impact: 'Minor changes needed',
            suggestedFix: 'Remove genrePreferences field'
          }
        ],
        migrationRecommendations: [],
        versionRequirements: [],
        analysisDetails: {
          totalOperations: 1,
          compatibleOperations: 0,
          incompatibleOperations: 0,
          requiresAdaptation: 1
        }
      };

      // Act
      const result = await service.createCompatibilityMiddleware(compatibilityReport);

      // Assert
      const createRoomRule = result.transformationRules.find(rule => 
        rule.operationName === 'createRoom'
      );
      expect(createRoomRule).toBeDefined();
      expect(createRoomRule?.transformationType).toBe('parameter_mapping');
      expect(createRoomRule?.rules.inputTransformation).toBeDefined();
    });

    it('should create deprecation warnings for deprecated operations', async () => {
      // Arrange
      const compatibilityReport: ApiCompatibilityReport = {
        id: 'test-report',
        timestamp: new Date(),
        overallCompatibility: CompatibilityLevel.DEPRECATED,
        compatibilityGaps: [],
        migrationRecommendations: [
          {
            id: 'rec-1',
            operationName: 'createRoomDebug',
            recommendationType: 'migrate_to_new_operation',
            description: 'Migrate from deprecated operation',
            priority: 'high',
            estimatedEffort: 'medium',
            implementationSteps: ['Use createRoom instead']
          }
        ],
        versionRequirements: [
          {
            operationName: 'createRoomDebug',
            minimumVersion: '1.0.0',
            recommendedVersion: '2.0.0',
            deprecationDate: new Date(),
            migrationDeadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
          }
        ],
        analysisDetails: {
          totalOperations: 1,
          compatibleOperations: 0,
          incompatibleOperations: 0,
          requiresAdaptation: 1
        }
      };

      // Act
      const result = await service.createCompatibilityMiddleware(compatibilityReport);

      // Assert
      const deprecationWarning = result.deprecationWarnings.find(warning =>
        warning.operationName === 'createRoomDebug'
      );
      expect(deprecationWarning).toBeDefined();
      expect(deprecationWarning?.severity).toBe('warning');
      expect(deprecationWarning?.migrationDeadline).toBeDefined();
    });
  });

  describe('input and output transformations', () => {
    it('should provide correct input transformation for createRoom', async () => {
      // This tests the private method indirectly through createCompatibilityMiddleware
      const compatibilityReport: ApiCompatibilityReport = {
        id: 'test-report',
        timestamp: new Date(),
        overallCompatibility: CompatibilityLevel.REQUIRES_ADAPTATION,
        compatibilityGaps: [
          {
            id: 'gap-1',
            operationType: 'graphql',
            operationName: 'createRoom',
            severity: 'medium',
            description: 'Requires parameter adaptation',
            impact: 'Minor changes needed',
            suggestedFix: 'Remove genrePreferences field'
          }
        ],
        migrationRecommendations: [],
        versionRequirements: [],
        analysisDetails: {
          totalOperations: 1,
          compatibleOperations: 0,
          incompatibleOperations: 0,
          requiresAdaptation: 1
        }
      };

      // Act
      const result = await service.createCompatibilityMiddleware(compatibilityReport);

      // Assert
      const createRoomRule = result.transformationRules.find(rule => 
        rule.operationName === 'createRoom'
      );
      expect(createRoomRule?.rules.inputTransformation?.removeFields).toContain('genrePreferences');
    });

    it('should provide correct input transformation for getMovies', async () => {
      const compatibilityReport: ApiCompatibilityReport = {
        id: 'test-report',
        timestamp: new Date(),
        overallCompatibility: CompatibilityLevel.REQUIRES_ADAPTATION,
        compatibilityGaps: [
          {
            id: 'gap-1',
            operationType: 'graphql',
            operationName: 'getMovies',
            severity: 'medium',
            description: 'Requires pagination parameters',
            impact: 'Minor changes needed',
            suggestedFix: 'Add pagination support'
          }
        ],
        migrationRecommendations: [],
        versionRequirements: [],
        analysisDetails: {
          totalOperations: 1,
          compatibleOperations: 0,
          incompatibleOperations: 0,
          requiresAdaptation: 1
        }
      };

      // Act
      const result = await service.createCompatibilityMiddleware(compatibilityReport);

      // Assert
      const getMoviesRule = result.transformationRules.find(rule => 
        rule.operationName === 'getMovies'
      );
      expect(getMoviesRule?.rules.inputTransformation?.addDefaults).toEqual({
        page: 1,
        limit: 20
      });
    });
  });
});