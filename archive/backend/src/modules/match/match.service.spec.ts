import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fc from 'fast-check';
import { MatchService } from './match.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { MemberService } from '../room/member.service';
import { MediaService } from '../media/media.service';
import { InteractionService } from '../interaction/interaction.service';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import { EventTracker } from '../analytics/event-tracker.service';
import {
  Match,
  MatchDetectionResult,
  ConsensusType,
  MatchSummary,
} from '../../domain/entities/match.entity';
import { VoteType, Vote } from '../../domain/entities/interaction.entity';
import { MediaItem } from '../../domain/entities/media.entity';
import {
  Member,
  MemberRole,
  MemberStatus,
} from '../../domain/entities/room.entity';

describe('MatchService', () => {
  let service: MatchService;
  let dynamoDBService: jest.Mocked<DynamoDBService>;
  let memberService: jest.Mocked<MemberService>;
  let mediaService: jest.Mocked<MediaService>;
  let interactionService: jest.Mocked<InteractionService>;
  let realtimeService: jest.Mocked<RealtimeCompatibilityService>;
  let eventTracker: jest.Mocked<EventTracker>;

  beforeEach(async () => {
    const mockDynamoDBService = {
      putItem: jest.fn(),
      getItem: jest.fn(),
      query: jest.fn(),
      conditionalUpdate: jest.fn(),
      batchWrite: jest.fn(),
      deleteItem: jest.fn(),
      getRoomState: jest.fn(),
    };

    const mockMemberService = {
      getRoomMembers: jest.fn(),
      getActiveMembers: jest.fn(),
    };

    const mockMediaService = {
      getMediaDetails: jest.fn(),
      getMovieDetails: jest.fn(),
    };

    const mockInteractionService = {
      checkUnanimousVote: jest.fn(),
      getMediaVotes: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockRealtimeService = {
      notifyVote: jest.fn().mockResolvedValue(undefined),
      notifyMatch: jest.fn().mockResolvedValue(undefined),
      notifyRoomStateChange: jest.fn().mockResolvedValue(undefined),
      notifyMemberStatusChange: jest.fn().mockResolvedValue(undefined),
    };

    const mockEventTracker = {
      trackEvent: jest.fn().mockResolvedValue(undefined),
      trackUserAction: jest.fn().mockResolvedValue(undefined),
      trackRoomEvent: jest.fn().mockResolvedValue(undefined),
      trackPerformanceMetric: jest.fn().mockResolvedValue(undefined),
      trackContentInteraction: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchService,
        { provide: DynamoDBService, useValue: mockDynamoDBService },
        { provide: MemberService, useValue: mockMemberService },
        { provide: MediaService, useValue: mockMediaService },
        { provide: InteractionService, useValue: mockInteractionService },
        { provide: RealtimeCompatibilityService, useValue: mockRealtimeService },
        { provide: EventTracker, useValue: mockEventTracker },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MatchService>(MatchService);
    dynamoDBService = module.get(DynamoDBService);
    memberService = module.get(MemberService);
    mediaService = module.get(MediaService);
    interactionService = module.get(InteractionService);
    realtimeService = module.get(RealtimeCompatibilityService);
    eventTracker = module.get(EventTracker);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Property-Based Tests', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    /**
     * **Feature: trinity-mvp, Property 5: Detección y creación de matches**
     * **Valida: Requisitos 3.1, 3.2, 3.3, 3.5**
     *
     * Para cualquier sala donde todos los miembros activos votan positivamente en el mismo
     * elemento multimedia, un match debe crearse, persistirse con metadatos completos,
     * y todos los miembros notificados inmediatamente
     */
    it('should detect and create matches when unanimous consensus is reached', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 20 }), // mediaId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 2,
            maxLength: 6,
          }), // userIds
          async (roomId, mediaId, userIds) => {
            // Reset mocks for this iteration
            jest.clearAllMocks();

            const numUsers = userIds.length;

            // Arrange: Mock unanimous positive votes
            const unanimousVotes: Vote[] = userIds.map((userId) => ({
              userId,
              roomId,
              mediaId,
              voteType: VoteType.LIKE,
              timestamp: new Date(),
            }));

            const mockMediaDetails: MediaItem = {
              tmdbId: mediaId,
              title: `Movie ${mediaId}`,
              overview: `Overview for ${mediaId}`,
              posterPath: `/poster/${mediaId}.jpg`,
              releaseDate: '2023-01-01',
              genres: ['Action', 'Adventure'],
              popularity: Math.random() * 100,
              voteAverage: Math.random() * 10,
              voteCount: Math.floor(Math.random() * 1000),
              adult: false,
              originalLanguage: 'en',
              mediaType: 'movie' as const,
              cachedAt: new Date(),
              isPopular: false,
            };

            // Mock services
            dynamoDBService.getItem.mockResolvedValueOnce(null); // No existing match
            interactionService.checkUnanimousVote.mockResolvedValueOnce({
              isUnanimous: true,
              voteType: VoteType.LIKE,
              totalVotes: numUsers,
              activeMembers: numUsers,
            });
            interactionService.getMediaVotes.mockResolvedValueOnce(
              unanimousVotes,
            );
            mediaService.getMovieDetails.mockResolvedValueOnce(
              mockMediaDetails,
            );
            dynamoDBService.putItem.mockResolvedValueOnce();
            dynamoDBService.conditionalUpdate.mockResolvedValueOnce();

            // Act: Detect match
            const result = await service.detectMatch(roomId, mediaId);

            // Assert: Match should be detected and created
            expect(result.hasMatch).toBe(true);
            expect(result.matchId).toBeDefined();
            expect(result.consensusType).toBe(ConsensusType.UNANIMOUS_LIKE);
            expect(result.participants).toHaveLength(numUsers);
            expect(result.totalVotes).toBe(numUsers);
            expect(result.requiredVotes).toBe(numUsers);

            // Verify all participants are included
            const participantSet = new Set(result.participants);
            userIds.forEach((userId) => {
              expect(participantSet.has(userId)).toBe(true);
            });

            // Verify match was persisted
            expect(dynamoDBService.putItem).toHaveBeenCalledTimes(1);

            // Verify notifications were marked as sent
            expect(dynamoDBService.conditionalUpdate).toHaveBeenCalledWith(
              expect.any(String),
              expect.any(String),
              'SET notificationsSent = :sent',
              'attribute_exists(PK)',
              undefined,
              { ':sent': true },
            );

            // Verify media details were fetched
            expect(mediaService.getMovieDetails).toHaveBeenCalledWith(mediaId);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should not create matches when consensus is not unanimous', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 20 }), // mediaId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 3,
            maxLength: 6,
          }), // userIds
          fc.integer({ min: 1, max: 5 }), // numLikes (less than total users)
          async (roomId, mediaId, userIds, numLikes) => {
            // Reset mocks for this iteration
            jest.clearAllMocks();

            const numUsers = userIds.length;
            const actualLikes = Math.min(numLikes, numUsers - 1); // Ensure not unanimous

            // Arrange: Mock non-unanimous votes
            const mixedVotes: Vote[] = userIds.map((userId, index) => ({
              userId,
              roomId,
              mediaId,
              voteType: index < actualLikes ? VoteType.LIKE : VoteType.DISLIKE,
              timestamp: new Date(),
            }));

            // Mock services
            dynamoDBService.getItem.mockResolvedValueOnce(null); // No existing match
            interactionService.checkUnanimousVote.mockResolvedValueOnce({
              isUnanimous: false,
              voteType: null,
              totalVotes: numUsers,
              activeMembers: numUsers,
            });

            // Act: Detect match
            const result = await service.detectMatch(roomId, mediaId);

            // Assert: No match should be created
            expect(result.hasMatch).toBe(false);
            expect(result.matchId).toBeUndefined();
            expect(result.consensusType).toBeUndefined();
            expect(result.participants).toHaveLength(0);
            expect(result.totalVotes).toBe(numUsers);
            expect(result.requiredVotes).toBe(numUsers);

            // Verify no match was persisted
            expect(dynamoDBService.putItem).not.toHaveBeenCalled();
            expect(mediaService.getMovieDetails).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should return existing match when already created', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 20 }), // mediaId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 2,
            maxLength: 5,
          }), // userIds
          async (roomId, mediaId, userIds) => {
            // Reset mocks for this iteration
            jest.clearAllMocks();

            const matchId = `match-${mediaId}`;
            const existingMatch: Match = {
              id: matchId,
              roomId,
              mediaId,
              participants: userIds,
              createdAt: new Date(),
              mediaDetails: {
                tmdbId: mediaId,
                title: `Movie ${mediaId}`,
                overview: 'Test overview',
                posterPath: '/test.jpg',
                releaseDate: '2023-01-01',
                genres: ['Action'],
                popularity: 50,
                voteAverage: 7.5,
                voteCount: 100,
                adult: false,
                originalLanguage: 'en',
                mediaType: 'movie' as const,
                cachedAt: new Date(),
                isPopular: false,
              },
              consensusType: ConsensusType.UNANIMOUS_LIKE,
              totalVotes: userIds.length,
              notificationsSent: true,
            };

            // Mock existing match
            dynamoDBService.getItem.mockResolvedValueOnce(existingMatch);

            // Act: Detect match
            const result = await service.detectMatch(roomId, mediaId);

            // Assert: Should return existing match
            expect(result.hasMatch).toBe(true);
            expect(result.matchId).toBe(matchId);
            expect(result.consensusType).toBe(ConsensusType.UNANIMOUS_LIKE);
            expect(result.participants).toEqual(userIds);
            expect(result.totalVotes).toBe(userIds.length);

            // Verify no new match was created
            expect(dynamoDBService.putItem).not.toHaveBeenCalled();
            expect(
              interactionService.checkUnanimousVote,
            ).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should maintain match consistency across multiple detections', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 2,
            maxLength: 8,
          }), // mediaIds
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 2,
            maxLength: 5,
          }), // userIds
          async (roomId, mediaIds, userIds) => {
            // Reset mocks for this iteration
            jest.clearAllMocks();

            const numMedia = Math.min(mediaIds.length, 3); // Limit for performance
            const testMediaIds = mediaIds.slice(0, numMedia);
            const detectionResults: MatchDetectionResult[] = [];

            // Act: Detect matches for multiple media items
            for (let i = 0; i < numMedia; i++) {
              const mediaId = testMediaIds[i];

              // Mock unanimous consensus for each media
              dynamoDBService.getItem.mockResolvedValueOnce(null); // No existing match
              interactionService.checkUnanimousVote.mockResolvedValueOnce({
                isUnanimous: true,
                voteType: VoteType.LIKE,
                totalVotes: userIds.length,
                activeMembers: userIds.length,
              });

              const unanimousVotes: Vote[] = userIds.map((userId) => ({
                userId,
                roomId,
                mediaId,
                voteType: VoteType.LIKE,
                timestamp: new Date(),
              }));

              interactionService.getMediaVotes.mockResolvedValueOnce(
                unanimousVotes,
              );
              mediaService.getMovieDetails.mockResolvedValueOnce({
                tmdbId: mediaId,
                title: `Movie ${mediaId}`,
                overview: `Overview for ${mediaId}`,
                posterPath: `/poster/${mediaId}.jpg`,
                releaseDate: '2023-01-01',
                genres: ['Action'],
                popularity: 50,
                voteAverage: 7.5,
                voteCount: 100,
                adult: false,
                originalLanguage: 'en',
                mediaType: 'movie' as const,
                cachedAt: new Date(),
                isPopular: false,
              });

              dynamoDBService.putItem.mockResolvedValueOnce();
              dynamoDBService.conditionalUpdate.mockResolvedValueOnce();

              const result = await service.detectMatch(roomId, mediaId);
              detectionResults.push(result);
            }

            // Assert: All matches should be created consistently
            expect(detectionResults).toHaveLength(numMedia);

            detectionResults.forEach((result, index) => {
              expect(result.hasMatch).toBe(true);
              expect(result.matchId).toBeDefined();
              expect(result.consensusType).toBe(ConsensusType.UNANIMOUS_LIKE);
              expect(result.participants).toEqual(userIds);
              expect(result.totalVotes).toBe(userIds.length);
              expect(result.requiredVotes).toBe(userIds.length);
            });

            // Verify each match was persisted
            expect(dynamoDBService.putItem).toHaveBeenCalledTimes(numMedia);
            expect(dynamoDBService.conditionalUpdate).toHaveBeenCalledTimes(
              numMedia,
            );

            // Verify all match IDs are unique
            const matchIds = detectionResults
              .map((r) => r.matchId)
              .filter(Boolean);
            const uniqueMatchIds = new Set(matchIds);
            expect(uniqueMatchIds.size).toBe(matchIds.length);
          },
        ),
        { numRuns: 25 },
      );
    });
  });

  describe('Unit Tests', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should handle media details not found', async () => {
      // Arrange
      const roomId = 'test-room';
      const mediaId = 'non-existent-media';
      const userIds = ['user1', 'user2'];

      dynamoDBService.getItem.mockResolvedValue(null); // No existing match
      interactionService.checkUnanimousVote.mockResolvedValue({
        isUnanimous: true,
        voteType: VoteType.LIKE,
        totalVotes: 2,
        activeMembers: 2,
      });

      const unanimousVotes: Vote[] = userIds.map((userId) => ({
        userId,
        roomId,
        mediaId,
        voteType: VoteType.LIKE,
        timestamp: new Date(),
      }));

      interactionService.getMediaVotes.mockResolvedValue(unanimousVotes);
      mediaService.getMovieDetails.mockResolvedValue(null); // Media not found

      // Act & Assert
      await expect(service.detectMatch(roomId, mediaId)).rejects.toThrow(
        'Media details not found',
      );
    });

    it('should get room matches correctly', async () => {
      // Arrange
      const roomId = 'test-room';
      const mockMatches = [
        {
          id: 'match1',
          roomId,
          mediaId: 'media1',
          participants: ['user1', 'user2'],
          createdAt: new Date(),
          mediaDetails: {
            title: 'Movie 1',
            posterPath: '/poster1.jpg',
          },
          consensusType: ConsensusType.UNANIMOUS_LIKE,
        },
        {
          id: 'match2',
          roomId,
          mediaId: 'media2',
          participants: ['user1', 'user2', 'user3'],
          createdAt: new Date(),
          mediaDetails: {
            title: 'Movie 2',
            posterPath: '/poster2.jpg',
          },
          consensusType: ConsensusType.UNANIMOUS_LIKE,
        },
      ];

      dynamoDBService.query.mockResolvedValue(mockMatches);

      // Act
      const result = await service.getRoomMatches(roomId, 10);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('match1');
      expect(result[0].mediaTitle).toBe('Movie 1');
      expect(result[0].participantCount).toBe(2);
      expect(result[1].id).toBe('match2');
      expect(result[1].mediaTitle).toBe('Movie 2');
      expect(result[1].participantCount).toBe(3);
    });

    it('should check pending matches correctly', async () => {
      // Arrange
      const roomId = 'test-room';
      const mediaId = 'test-media';

      const mockMatch: Match = {
        id: 'new-match',
        roomId,
        mediaId,
        participants: ['user1', 'user2'],
        createdAt: new Date(),
        mediaDetails: {
          tmdbId: mediaId,
          title: 'Test Movie',
          overview: 'Test overview',
          posterPath: '/test.jpg',
          releaseDate: '2023-01-01',
          genres: ['Action'],
          popularity: 50,
          voteAverage: 7.5,
          voteCount: 100,
          adult: false,
          originalLanguage: 'en',
          mediaType: 'movie' as const,
          cachedAt: new Date(),
          isPopular: false,
        },
        consensusType: ConsensusType.UNANIMOUS_LIKE,
        totalVotes: 2,
        notificationsSent: true,
      };

      // Mock detection result with new match
      dynamoDBService.getItem.mockResolvedValueOnce(null); // No existing match
      interactionService.checkUnanimousVote.mockResolvedValue({
        isUnanimous: true,
        voteType: VoteType.LIKE,
        totalVotes: 2,
        activeMembers: 2,
      });
      interactionService.getMediaVotes.mockResolvedValue([]);
      mediaService.getMovieDetails.mockResolvedValue(mockMatch.mediaDetails);
      dynamoDBService.putItem.mockResolvedValue();
      dynamoDBService.conditionalUpdate.mockResolvedValue();

      // Mock getMatchByMediaId (second call to getItem)
      dynamoDBService.getItem.mockResolvedValueOnce(mockMatch);

      // Act
      const result = await service.checkPendingMatches(roomId, mediaId);

      // Assert
      expect(result).toBeDefined();
      expect(result!.id).toBe('new-match');
      expect(result!.mediaDetails.title).toBe('Test Movie');
    });
  });
});
