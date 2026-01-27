import { Test, TestingModule } from '@nestjs/testing';
import { ContentSuggestionService } from './content-suggestion.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import { PermissionService } from '../permission/permission.service';
import {
  ContentSuggestion,
  ContentSuggestionType,
  ContentSuggestionStatus,
  RoomSuggestionConfig,
} from '../../domain/entities/content-suggestion.entity';
import { RoomPermission } from '../../domain/entities/room-moderation.entity';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import * as fc from 'fast-check';

describe('ContentSuggestionService', () => {
  let service: ContentSuggestionService;
  let dynamoDBService: jest.Mocked<DynamoDBService>;
  let realtimeService: jest.Mocked<RealtimeCompatibilityService>;
  let permissionService: jest.Mocked<PermissionService>;

  beforeEach(async () => {
    const mockDynamoDBService = {
      putItem: jest.fn(),
      getItem: jest.fn(),
      query: jest.fn(),
      deleteItem: jest.fn(),
    };

    const mockRealtimeService = {
      notifyContentSuggestion: jest.fn(),
    };

    const mockPermissionService = {
      checkPermission: jest.fn(),
      hasPermission: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentSuggestionService,
        { provide: DynamoDBService, useValue: mockDynamoDBService },
        { provide: RealtimeCompatibilityService, useValue: mockRealtimeService },
        { provide: PermissionService, useValue: mockPermissionService },
      ],
    }).compile();

    service = module.get<ContentSuggestionService>(ContentSuggestionService);
    dynamoDBService = module.get(DynamoDBService);
    realtimeService = module.get(RealtimeCompatibilityService);
    permissionService = module.get(PermissionService);
  });

  describe('createSuggestion', () => {
    it('should create suggestion successfully with valid data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.constantFrom(...Object.values(ContentSuggestionType)),
          async (roomId, userId, username, title, type) => {
            // Arrange
            const mockConfig: RoomSuggestionConfig = {
              roomId,
              isEnabled: true,
              requireApproval: true,
              allowVoting: true,
              allowComments: true,
              minVotesToApprove: 3,
              minScoreToApprove: 2,
              maxSuggestionsPerUser: 5,
              maxPendingSuggestions: 20,
              autoImplementHighScored: false,
              autoImplementThreshold: 5,
              allowedTypes: Object.values(ContentSuggestionType),
              requireReason: false,
              moderationEnabled: true,
              createdBy: 'system',
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            permissionService.checkPermission.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['member'],
            });
            dynamoDBService.getItem.mockResolvedValue(mockConfig);
            dynamoDBService.query
              .mockResolvedValueOnce({ Items: [] }) // User suggestions today
              .mockResolvedValueOnce({ Items: [] }); // Pending suggestions
            dynamoDBService.putItem.mockResolvedValue(undefined);
            realtimeService.notifyContentSuggestion.mockResolvedValue(
              undefined,
            );

            const createSuggestionDto = {
              title,
              type,
              description: 'Test description',
              priority: 3,
            };

            // Act
            const result = await service.createSuggestion(
              roomId,
              userId,
              username,
              createSuggestionDto,
            );

            // Assert
            expect(result).toBeDefined();
            expect(result.title).toBe(title);
            expect(result.type).toBe(type);
            expect(result.suggestedBy).toBe(userId);
            expect(result.suggestedByUsername).toBe(username);
            expect(result.roomId).toBe(roomId);
            expect(result.status).toBe(ContentSuggestionStatus.PENDING);
            expect(result.votes).toEqual([]);
            expect(result.totalVotes).toBe(0);
            expect(result.voteScore).toBe(0);
            expect(permissionService.checkPermission).toHaveBeenCalledWith(
              roomId,
              userId,
              RoomPermission.SUGGEST_CONTENT,
            );
            expect(dynamoDBService.putItem).toHaveBeenCalled();
            expect(realtimeService.notifyContentSuggestion).toHaveBeenCalled();
          },
        ),
        { numRuns: 30 },
      );
    });

    it('should reject suggestion when suggestions are disabled', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.constantFrom(...Object.values(ContentSuggestionType)),
          async (roomId, userId, username, title, type) => {
            // Arrange
            const mockConfig: RoomSuggestionConfig = {
              roomId,
              isEnabled: false, // Suggestions disabled
              requireApproval: true,
              allowVoting: true,
              allowComments: true,
              minVotesToApprove: 3,
              minScoreToApprove: 2,
              maxSuggestionsPerUser: 5,
              maxPendingSuggestions: 20,
              autoImplementHighScored: false,
              autoImplementThreshold: 5,
              allowedTypes: Object.values(ContentSuggestionType),
              requireReason: false,
              moderationEnabled: true,
              createdBy: 'system',
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            permissionService.checkPermission.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['member'],
            });
            dynamoDBService.getItem.mockResolvedValue(mockConfig);

            const createSuggestionDto = {
              title,
              type,
              description: 'Test description',
            };

            // Act & Assert
            await expect(
              service.createSuggestion(
                roomId,
                userId,
                username,
                createSuggestionDto,
              ),
            ).rejects.toThrow(ForbiddenException);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe('configureSuggestionConfig', () => {
    it('should create suggestion configuration successfully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.boolean(),
          fc.boolean(),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 20 }),
          async (
            roomId,
            userId,
            isEnabled,
            requireApproval,
            minVotesToApprove,
            maxSuggestionsPerUser,
          ) => {
            // Arrange
            permissionService.checkPermission.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['admin'],
            });
            dynamoDBService.putItem.mockResolvedValue(undefined);

            const configDto = {
              isEnabled,
              requireApproval,
              minVotesToApprove,
              maxSuggestionsPerUser,
            };

            // Act
            const result = await service.configureSuggestionConfig(
              roomId,
              userId,
              configDto,
            );

            // Assert
            expect(result).toBeDefined();
            expect(result.roomId).toBe(roomId);
            expect(result.isEnabled).toBe(isEnabled);
            expect(result.requireApproval).toBe(requireApproval);
            expect(result.minVotesToApprove).toBe(minVotesToApprove);
            expect(result.maxSuggestionsPerUser).toBe(maxSuggestionsPerUser);
            expect(result.createdBy).toBe(userId);
            expect(dynamoDBService.putItem).toHaveBeenCalled();
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe('getSuggestionConfig', () => {
    it('should return existing configuration', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1 }), async (roomId) => {
          // Arrange
          const mockConfig: RoomSuggestionConfig = {
            roomId,
            isEnabled: true,
            requireApproval: true,
            allowVoting: true,
            allowComments: true,
            minVotesToApprove: 3,
            minScoreToApprove: 2,
            maxSuggestionsPerUser: 5,
            maxPendingSuggestions: 20,
            autoImplementHighScored: false,
            autoImplementThreshold: 5,
            allowedTypes: Object.values(ContentSuggestionType),
            requireReason: false,
            moderationEnabled: true,
            createdBy: 'system',
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          dynamoDBService.getItem.mockResolvedValue(mockConfig);

          // Act
          const result = await service.getSuggestionConfig(roomId);

          // Assert
          expect(result).toBeDefined();
          expect(result.roomId).toBe(roomId);
          expect(result.isEnabled).toBe(true);
          expect(result.requireApproval).toBe(true);
        }),
        { numRuns: 30 },
      );
    });

    it('should return default configuration when none exists', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1 }), async (roomId) => {
          // Arrange
          dynamoDBService.getItem.mockResolvedValue(null);

          // Act
          const result = await service.getSuggestionConfig(roomId);

          // Assert
          expect(result).toBeDefined();
          expect(result.roomId).toBe(roomId);
          expect(result.isEnabled).toBe(true); // Default value
          expect(result.requireApproval).toBe(true); // Default value
          expect(result.createdBy).toBe('system');
        }),
        { numRuns: 20 },
      );
    });
  });

  describe('getSuggestions', () => {
    it('should retrieve suggestions successfully with filters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.integer({ min: 1, max: 100 }),
          async (roomId, userId, limit) => {
            // Arrange
            const mockSuggestions: ContentSuggestion[] = Array.from(
              { length: Math.min(limit, 10) },
              (_, i) => ({
                id: `suggestion-${i}`,
                roomId,
                suggestedBy: `user-${i}`,
                suggestedByUsername: `user${i}`,
                type: ContentSuggestionType.MOVIE,
                status: ContentSuggestionStatus.PENDING,
                title: `Movie ${i}`,
                votes: [],
                totalVotes: 0,
                positiveVotes: 0,
                negativeVotes: 0,
                voteScore: 0,
                comments: [],
                commentCount: 0,
                priority: 3,
                createdAt: new Date(Date.now() - i * 1000),
                updatedAt: new Date(Date.now() - i * 1000),
              }),
            );

            permissionService.checkPermission.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['member'],
            });
            dynamoDBService.query.mockResolvedValue({
              Items: mockSuggestions,
              LastEvaluatedKey: undefined,
            });

            const filters = { limit };

            // Act
            const result = await service.getSuggestions(
              roomId,
              userId,
              filters,
            );

            // Assert
            expect(result).toBeDefined();
            expect(result.suggestions).toHaveLength(mockSuggestions.length);
            expect(result.totalCount).toBe(mockSuggestions.length);
            expect(result.hasMore).toBe(false);
            expect(permissionService.checkPermission).toHaveBeenCalledWith(
              roomId,
              userId,
              RoomPermission.VIEW_ROOM,
            );
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});
