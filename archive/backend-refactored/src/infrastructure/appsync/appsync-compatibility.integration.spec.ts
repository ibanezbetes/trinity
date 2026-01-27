import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AppSyncCompatibilityService } from './appsync-compatibility.service';
import { AppSyncCompatibilityController } from './appsync-compatibility.controller';

/**
 * Integration Tests for AppSync Compatibility
 * 
 * Verifica que el servicio y controlador de compatibilidad funcionen correctamente
 * y que la integración con AppSync esté configurada apropiadamente.
 */
describe('AppSync Compatibility Integration', () => {
  let service: AppSyncCompatibilityService;
  let controller: AppSyncCompatibilityController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      controllers: [AppSyncCompatibilityController],
      providers: [AppSyncCompatibilityService],
    }).compile();

    service = module.get<AppSyncCompatibilityService>(AppSyncCompatibilityService);
    controller = module.get<AppSyncCompatibilityController>(AppSyncCompatibilityController);
  });

  describe('Service Integration', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should validate AppSync configuration', () => {
      const validation = service.validateAppSyncConfiguration();
      expect(validation).toBeDefined();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should provide compatibility stats', () => {
      const stats = service.getCompatibilityStats();
      expect(stats).toBeDefined();
      expect(stats.totalOperations).toBeGreaterThan(0);
      expect(stats.supportedOperations).toBeGreaterThan(0);
      expect(stats.compatibilityPercentage).toBeGreaterThan(0);
      expect(stats.awsRegion).toBe('eu-west-1');
      expect(stats.userPoolId).toBe('eu-west-1_6UxioIj4z');
    });

    it('should correctly identify supported operations', () => {
      expect(service.isOperationSupported('query', 'getUserRooms')).toBe(true);
      expect(service.isOperationSupported('mutation', 'createRoom')).toBe(true);
      expect(service.isOperationSupported('subscription', 'onVoteUpdate')).toBe(true);
      expect(service.isOperationSupported('query', 'nonExistentOperation')).toBe(false);
    });

    it('should correctly identify deprecated operations', () => {
      expect(service.isOperationDeprecated('mutation', 'createRoomDebug')).toBe(true);
      expect(service.isOperationDeprecated('mutation', 'createRoomSimple')).toBe(true);
      expect(service.isOperationDeprecated('mutation', 'createRoom')).toBe(false);
    });

    it('should provide correct replacements for deprecated operations', () => {
      expect(service.getOperationReplacement('mutation', 'createRoomDebug')).toBe('createRoom');
      expect(service.getOperationReplacement('mutation', 'createRoomSimple')).toBe('createRoom');
      expect(service.getOperationReplacement('mutation', 'createRoom')).toBeNull();
    });
  });

  describe('Controller Integration', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should return compatibility stats', () => {
      const stats = controller.getCompatibilityStats();
      expect(stats).toBeDefined();
      expect(stats.totalOperations).toBeGreaterThan(0);
      expect(stats.compatibilityPercentage).toBeGreaterThan(0);
    });

    it('should validate configuration', () => {
      const validation = controller.validateConfiguration();
      expect(validation).toBeDefined();
      expect(validation.isValid).toBe(true);
    });

    it('should check operation support', () => {
      const result = controller.checkOperationSupport('mutation', 'createRoom');
      expect(result).toBeDefined();
      expect(result.isSupported).toBe(true);
      expect(result.isDeprecated).toBe(false);
      expect(result.transformations).toContain('remove_genre_preferences');
    });

    it('should check deprecated operation support', () => {
      const result = controller.checkOperationSupport('mutation', 'createRoomDebug');
      expect(result).toBeDefined();
      expect(result.isSupported).toBe(false);
      expect(result.isDeprecated).toBe(true);
      expect(result.replacement).toBe('createRoom');
    });

    it('should provide health check', () => {
      const health = controller.healthCheck();
      expect(health).toBeDefined();
      expect(health.status).toBe('healthy');
      expect(health.version).toBe('2.0.0');
      expect(health.compatibility).toBeDefined();
      expect(health.validation).toBeDefined();
    });
  });

  describe('Transformation Integration', () => {
    it('should transform createRoom input correctly', () => {
      const input = {
        name: 'Test Room',
        description: 'Test Description',
        genrePreferences: ['action', 'comedy'],
        isPrivate: false
      };

      const result = controller.testCreateRoomTransformation(input);
      expect(result).toBeDefined();
      expect(result.transformed.genrePreferences).toBeUndefined();
      expect(result.transformed.name).toBe('Test Room');
      expect(result.transformed.description).toBe('Test Description');
      expect(result.genrePreferencesRemoved).toBe(true);
    });

    it('should transform deprecated operations correctly', () => {
      const variables = {
        input: { name: 'Debug Room Test' }
      };

      const result = controller.testDeprecatedTransformation('createRoomDebug', variables);
      expect(result).toBeDefined();
      expect(result.transformed.input.name).toBe('Debug Room Test');
      expect(result.transformed.input.description).toContain('Debug room');
      expect(result.transformed.input.isPrivate).toBe(false);
      expect(result.transformed.input.maxMembers).toBe(10);
    });

    it('should add pagination correctly', () => {
      const variables = { genre: 'action' };

      const result = controller.testPaginationTransformation(variables);
      expect(result).toBeDefined();
      expect(result.transformed.page).toBe(1);
      expect(result.transformed.limit).toBe(20);
      expect(result.transformed.genre).toBe('action');
      expect(result.paginationAdded).toBe(true);
    });

    it('should enhance AI context correctly', () => {
      const variables = { text: 'Recommend movies' };

      const result = controller.testAIContextTransformation(variables);
      expect(result).toBeDefined();
      expect(result.transformed.text).toBe('Recommend movies');
      expect(result.transformed.includeGenreAnalysis).toBe(true);
      expect(result.transformed.maxRecommendations).toBe(10);
      expect(result.contextEnhanced).toBe(true);
    });

    it('should transform createRoom response correctly', () => {
      const response = {
        data: {
          createRoom: {
            id: 'room-123',
            name: 'Test Room',
            inviteCode: 'ABC123'
          }
        }
      };

      const result = controller.testCreateRoomResponseTransformation(response);
      expect(result).toBeDefined();
      expect(result.transformed.data.createRoom.genrePreferences).toEqual([]);
      expect(result.transformed.data.createRoom.inviteUrl).toContain('ABC123');
      expect(result.fieldsAdded).toBe(true);
    });

    it('should transform vote events correctly', () => {
      const event = {
        roomId: 'room-123',
        userId: 'user-456',
        movieId: 'movie-789',
        voteType: 'LIKE'
      };

      const result = controller.testVoteEventTransformation(event);
      expect(result).toBeDefined();
      expect(result.transformed.eventType).toBe('VOTE_UPDATE');
      expect(result.transformed.roomId).toBe('room-123');
      expect(result.transformed.userId).toBe('user-456');
      expect(result.transformed.mediaId).toBe('movie-789');
      expect(result.transformed.progress).toBeDefined();
    });

    it('should transform match events correctly', () => {
      const event = {
        roomId: 'room-123',
        movieInfo: {
          id: 'movie-789',
          title: 'Test Movie',
          poster: 'poster.jpg'
        }
      };

      const result = controller.testMatchEventTransformation(event);
      expect(result).toBeDefined();
      expect(result.transformed.eventType).toBe('MATCH_FOUND');
      expect(result.transformed.roomId).toBe('room-123');
      expect(result.transformed.movieInfo.id).toBe('movie-789');
      expect(result.transformed.movieInfo.title).toBe('Test Movie');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid deprecated operation gracefully', () => {
      const result = controller.testDeprecatedTransformation('invalidOperation', {});
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
      expect(result.supportedOperations).toContain('createRoomDebug');
      expect(result.supportedOperations).toContain('createRoomSimple');
    });

    it('should handle empty inputs gracefully', () => {
      const createRoomResult = controller.testCreateRoomTransformation({});
      expect(createRoomResult).toBeDefined();
      expect(createRoomResult.genrePreferencesRemoved).toBe(false);

      const paginationResult = controller.testPaginationTransformation({});
      expect(paginationResult).toBeDefined();
      expect(paginationResult.paginationAdded).toBe(true);
    });
  });
});