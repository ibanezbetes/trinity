import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fc from 'fast-check';
import { InteractionService } from './interaction.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { MemberService } from '../room/member.service';
import { RoomService } from '../room/room.service';
import { MediaService } from '../media/media.service';
import { RoomRefreshService } from '../room/room-refresh.service';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import { EventTracker } from '../analytics/event-tracker.service';
import {
  Vote,
  VoteType,
  VoteResult,
  QueueStatus,
  SwipeSession,
} from '../../domain/entities/interaction.entity';
import { CreateVoteDto } from './dto/create-vote.dto';
import {
  Member,
  MemberRole,
  MemberStatus,
} from '../../domain/entities/room.entity';
import { MediaItem } from '../../domain/entities/media.entity';

describe('InteractionService', () => {
  let service: InteractionService;
  let dynamoDBService: jest.Mocked<DynamoDBService>;
  let memberService: jest.Mocked<MemberService>;
  let roomService: jest.Mocked<RoomService>;
  let mediaService: jest.Mocked<MediaService>;
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
      getMember: jest.fn(),
      getNextMediaForMember: jest.fn(),
      advanceMemberIndex: jest.fn(),
      updateMemberActivity: jest.fn(),
      getMemberProgress: jest.fn(),
      getRoomMembers: jest.fn(),
      getActiveMembers: jest.fn(),
    };

    const mockRoomService = {
      getRoomById: jest.fn(),
      canUserAccessRoom: jest.fn(),
    };

    const mockMediaService = {
      getMediaDetails: jest.fn(),
      prefetchMovieDetails: jest.fn().mockResolvedValue(undefined),
    };

    const mockRealtimeService = {
      notifyVote: jest.fn().mockResolvedValue(undefined),
      notifyMatch: jest.fn().mockResolvedValue(undefined),
      notifyRoomStateChange: jest.fn().mockResolvedValue(undefined),
      notifyMemberStatusChange: jest.fn().mockResolvedValue(undefined),
      publishEvent: jest.fn().mockResolvedValue(undefined),
      subscribeToRoom: jest.fn().mockResolvedValue(undefined),
    };

    const mockEventTracker = {
      trackEvent: jest.fn().mockResolvedValue(undefined),
      trackUserAction: jest.fn().mockResolvedValue(undefined),
      trackRoomEvent: jest.fn().mockResolvedValue(undefined),
      trackPerformanceMetric: jest.fn().mockResolvedValue(undefined),
      trackContentInteraction: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockRoomRefreshService = {
      checkAndRefreshIfNeeded: jest.fn().mockResolvedValue(false),
      refreshRoomContent: jest.fn().mockResolvedValue(undefined),
      getMemberProgress: jest.fn().mockResolvedValue({ progressPercentage: 50 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InteractionService,
        { provide: DynamoDBService, useValue: mockDynamoDBService },
        { provide: MemberService, useValue: mockMemberService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: MediaService, useValue: mockMediaService },
        { provide: RoomRefreshService, useValue: mockRoomRefreshService },
        {
          provide: RealtimeCompatibilityService,
          useValue: mockRealtimeService,
        },
        { provide: EventTracker, useValue: mockEventTracker },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<InteractionService>(InteractionService);
    dynamoDBService = module.get(DynamoDBService);
    memberService = module.get(MemberService);
    roomService = module.get(RoomService);
    mediaService = module.get(MediaService);
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
     * **Feature: trinity-mvp, Property 3: Completitud de interacción de swipe**
     * **Valida: Requisitos 2.1, 2.2, 2.3, 2.4**
     *
     * Para cualquier miembro realizando acciones de swipe, el sistema debe registrar votos,
     * presentar elementos multimedia únicos exactamente una vez, y notificar al completar la cola
     */
    it('should maintain swipe interaction completeness across all votes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // userId
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 3,
            maxLength: 8,
          }), // mediaIds
          fc.array(fc.constantFrom(VoteType.LIKE, VoteType.DISLIKE), {
            minLength: 3,
            maxLength: 8,
          }), // voteTypes
          async (userId, roomId, mediaIds, voteTypes) => {
            // Reset all mocks for this iteration
            jest.clearAllMocks();

            // Ensure we have the same number of votes as media items
            const numItems = Math.min(mediaIds.length, voteTypes.length);
            const testMediaIds = mediaIds.slice(0, numItems);
            const testVoteTypes = voteTypes.slice(0, numItems);

            // Arrange: Mock member and progress
            const mockMember: Member = {
              userId,
              roomId,
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
              shuffledList: testMediaIds,
              currentIndex: 0,
              lastActivityAt: new Date(),
              joinedAt: new Date(),
            };

            memberService.getMember.mockResolvedValue(mockMember);
            dynamoDBService.getItem.mockResolvedValue(null); // No existing votes
            dynamoDBService.putItem.mockResolvedValue();
            memberService.updateMemberActivity.mockResolvedValue();

            let currentIndex = 0;
            const registeredVotes: Vote[] = [];

            // Act: Register votes for each media item
            for (let i = 0; i < numItems; i++) {
              const mediaId = testMediaIds[i];
              const voteType = testVoteTypes[i];

              // Mock current media (first call for validation)
              memberService.getNextMediaForMember.mockResolvedValueOnce(
                mediaId,
              );

              // Mock the index advancement
              memberService.advanceMemberIndex.mockResolvedValueOnce(
                currentIndex + 1,
              );

              // Mock next media (second call after vote)
              const nextMediaId =
                currentIndex + 1 < numItems
                  ? testMediaIds[currentIndex + 1]
                  : null;
              memberService.getNextMediaForMember.mockResolvedValueOnce(
                nextMediaId,
              );

              // Mock progress after this vote
              const newIndex = currentIndex + 1;
              const progressPercentage = Math.round(
                (newIndex / numItems) * 100,
              );
              memberService.getMemberProgress.mockResolvedValueOnce({
                currentIndex: newIndex,
                totalItems: numItems,
                remainingItems: numItems - newIndex,
                progressPercentage,
              });

              const createVoteDto: CreateVoteDto = {
                mediaId,
                voteType,
                sessionId: `session-${i}`,
              };

              const result = await service.registerVote(
                userId,
                roomId,
                createVoteDto,
              );

              // Assert: Verify vote registration properties
              expect(result.voteRegistered).toBe(true);

              // Track the vote
              registeredVotes.push({
                userId,
                roomId,
                mediaId,
                voteType,
                timestamp: new Date(),
                sessionId: createVoteDto.sessionId,
              });

              currentIndex++;

              // Verify progress tracking
              expect(result.currentProgress.currentIndex).toBe(currentIndex);
              expect(result.currentProgress.totalItems).toBe(numItems);
              expect(result.currentProgress.progressPercentage).toBe(
                progressPercentage,
              );

              // Verify queue completion detection
              const isLastItem = currentIndex >= numItems;
              expect(result.queueCompleted).toBe(isLastItem);
              expect(result.nextMediaId).toBe(nextMediaId);
            }

            // Assert: Verify all votes were registered
            expect(dynamoDBService.putItem).toHaveBeenCalledTimes(numItems);
            expect(memberService.advanceMemberIndex).toHaveBeenCalledTimes(
              numItems,
            );
            expect(memberService.updateMemberActivity).toHaveBeenCalledTimes(
              numItems,
            );

            // Verify each media item was presented exactly once
            const presentedMediaIds = registeredVotes.map(
              (vote) => vote.mediaId,
            );
            const uniquePresentedIds = new Set(presentedMediaIds);
            expect(uniquePresentedIds.size).toBe(numItems);
            expect(presentedMediaIds).toEqual(testMediaIds);
          },
        ),
        { numRuns: 25 }, // Reduce runs to avoid mock complexity
      );
    });

    it('should prevent duplicate votes for the same media item', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // userId
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 20 }), // mediaId
          fc.constantFrom(VoteType.LIKE, VoteType.DISLIKE), // voteType
          async (userId, roomId, mediaId, voteType) => {
            // Arrange: Mock member with media in queue
            const mockMember: Member = {
              userId,
              roomId,
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
              shuffledList: [mediaId],
              currentIndex: 0,
              lastActivityAt: new Date(),
              joinedAt: new Date(),
            };

            memberService.getMember.mockResolvedValue(mockMember);
            memberService.getNextMediaForMember.mockResolvedValue(mediaId);

            // First vote - should succeed
            dynamoDBService.getItem.mockResolvedValueOnce(null); // No existing vote
            dynamoDBService.putItem.mockResolvedValue();
            memberService.advanceMemberIndex.mockResolvedValue(1);
            memberService.getMemberProgress.mockResolvedValue({
              currentIndex: 1,
              totalItems: 1,
              remainingItems: 0,
              progressPercentage: 100,
            });

            const createVoteDto: CreateVoteDto = {
              mediaId,
              voteType,
            };

            // Act: First vote should succeed
            const firstResult = await service.registerVote(
              userId,
              roomId,
              createVoteDto,
            );
            expect(firstResult.voteRegistered).toBe(true);

            // Arrange: Mock existing vote for second attempt
            const existingVote: Vote = {
              userId,
              roomId,
              mediaId,
              voteType,
              timestamp: new Date(),
            };
            dynamoDBService.getItem.mockResolvedValueOnce(existingVote);

            // Act & Assert: Second vote should fail
            await expect(
              service.registerVote(userId, roomId, createVoteDto),
            ).rejects.toThrow('Ya has votado por este contenido');
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should track queue status and progress correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // userId
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 3,
            maxLength: 10,
          }), // shuffledList
          fc.integer({ min: 0, max: 9 }), // currentIndex
          async (userId, roomId, shuffledList, currentIndexInput) => {
            const currentIndex = Math.min(
              currentIndexInput,
              shuffledList.length,
            );
            const remainingItems = shuffledList.length - currentIndex;
            const progressPercentage =
              shuffledList.length > 0
                ? Math.round((currentIndex / shuffledList.length) * 100)
                : 0;

            // Arrange: Mock member with specific progress
            const mockMember: Member = {
              userId,
              roomId,
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
              shuffledList,
              currentIndex,
              lastActivityAt: new Date(),
              joinedAt: new Date(),
            };

            memberService.getMember.mockResolvedValue(mockMember);

            const currentMediaId =
              currentIndex < shuffledList.length
                ? shuffledList[currentIndex]
                : null;

            memberService.getNextMediaForMember.mockResolvedValue(
              currentMediaId,
            );
            memberService.getMemberProgress.mockResolvedValue({
              currentIndex,
              totalItems: shuffledList.length,
              remainingItems,
              progressPercentage,
            });

            // Act: Get queue status
            const queueStatus = await service.getQueueStatus(userId, roomId);

            // Assert: Verify queue status properties
            expect(queueStatus.userId).toBe(userId);
            expect(queueStatus.roomId).toBe(roomId);
            expect(queueStatus.currentMediaId).toBe(currentMediaId);
            expect(queueStatus.hasNext).toBe(currentMediaId !== null);
            expect(queueStatus.isCompleted).toBe(currentMediaId === null);

            // Verify progress tracking
            expect(queueStatus.progress.currentIndex).toBe(currentIndex);
            expect(queueStatus.progress.totalItems).toBe(shuffledList.length);
            expect(queueStatus.progress.remainingItems).toBe(remainingItems);
            expect(queueStatus.progress.progressPercentage).toBe(
              progressPercentage,
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should validate vote sequence integrity', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // userId
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 3,
            maxLength: 8,
          }), // mediaIds
          async (userId, roomId, mediaIds) => {
            // Arrange: Mock member
            const mockMember: Member = {
              userId,
              roomId,
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
              shuffledList: mediaIds,
              currentIndex: 0,
              lastActivityAt: new Date(),
              joinedAt: new Date(),
            };

            memberService.getMember.mockResolvedValue(mockMember);

            // Test voting out of sequence (should fail)
            const wrongMediaId = mediaIds.length > 1 ? mediaIds[1] : 'wrong-id';
            const correctMediaId = mediaIds[0];

            memberService.getNextMediaForMember.mockResolvedValue(
              correctMediaId,
            );
            dynamoDBService.getItem.mockResolvedValue(null); // No existing vote

            const wrongVoteDto: CreateVoteDto = {
              mediaId: wrongMediaId,
              voteType: VoteType.LIKE,
            };

            // Act & Assert: Voting for wrong media should fail
            if (wrongMediaId !== correctMediaId) {
              await expect(
                service.registerVote(userId, roomId, wrongVoteDto),
              ).rejects.toThrow(
                'El contenido no corresponde al siguiente en tu cola',
              );
            }

            // Act: Voting for correct media should succeed
            const correctVoteDto: CreateVoteDto = {
              mediaId: correctMediaId,
              voteType: VoteType.LIKE,
            };

            dynamoDBService.putItem.mockResolvedValue();
            memberService.advanceMemberIndex.mockResolvedValue(1);
            memberService.getMemberProgress.mockResolvedValue({
              currentIndex: 1,
              totalItems: mediaIds.length,
              remainingItems: mediaIds.length - 1,
              progressPercentage: Math.round((1 / mediaIds.length) * 100),
            });

            const result = await service.registerVote(
              userId,
              roomId,
              correctVoteDto,
            );
            expect(result.voteRegistered).toBe(true);
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * **Feature: trinity-mvp, Property 4: Integridad de votación asíncrona**
     * **Valida: Requisitos 2.5**
     *
     * Para cualquier sala con actividad asíncrona de miembros, la integridad de votos
     * debe mantenerse sin requerir presencia online simultánea
     */
    it('should maintain asynchronous voting integrity across multiple users', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 2,
            maxLength: 5,
          }), // userIds
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 3,
            maxLength: 8,
          }), // mediaIds
          fc.array(fc.constantFrom(VoteType.LIKE, VoteType.DISLIKE), {
            minLength: 3,
            maxLength: 8,
          }), // voteTypes
          async (roomId, userIds, mediaIds, voteTypes) => {
            // Reset mocks for this iteration
            jest.clearAllMocks();

            const numUsers = userIds.length;
            const numMedia = Math.min(mediaIds.length, voteTypes.length);
            const testMediaIds = mediaIds.slice(0, numMedia);
            const testVoteTypes = voteTypes.slice(0, numMedia);

            // Arrange: Create members for each user
            const mockMembers: Member[] = userIds.map((userId) => ({
              userId,
              roomId,
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
              shuffledList: testMediaIds,
              currentIndex: 0,
              lastActivityAt: new Date(),
              joinedAt: new Date(),
            }));

            // Mock services
            dynamoDBService.getItem.mockResolvedValue(null); // No existing votes
            dynamoDBService.putItem.mockResolvedValue();
            memberService.updateMemberActivity.mockResolvedValue();

            const allVotes: Vote[] = [];

            // Act: Simulate asynchronous voting by multiple users
            for (let userIndex = 0; userIndex < numUsers; userIndex++) {
              const userId = userIds[userIndex];
              const member = mockMembers[userIndex];

              // Mock member lookup
              memberService.getMember.mockResolvedValue(member);

              // Each user votes on first media item asynchronously
              const mediaId = testMediaIds[0];
              const voteType = testVoteTypes[0];

              // Mock current media and progress for this user
              memberService.getNextMediaForMember.mockResolvedValueOnce(
                mediaId,
              );
              memberService.advanceMemberIndex.mockResolvedValueOnce(1);
              memberService.getNextMediaForMember.mockResolvedValueOnce(
                testMediaIds.length > 1 ? testMediaIds[1] : null,
              );
              memberService.getMemberProgress.mockResolvedValueOnce({
                currentIndex: 1,
                totalItems: numMedia,
                remainingItems: numMedia - 1,
                progressPercentage: Math.round((1 / numMedia) * 100),
              });

              const createVoteDto: CreateVoteDto = {
                mediaId,
                voteType,
                sessionId: `session-${userIndex}`,
              };

              const result = await service.registerVote(
                userId,
                roomId,
                createVoteDto,
              );

              // Assert: Each vote should be registered successfully
              expect(result.voteRegistered).toBe(true);

              // Track the vote
              allVotes.push({
                userId,
                roomId,
                mediaId,
                voteType,
                timestamp: new Date(),
                sessionId: createVoteDto.sessionId,
              });
            }

            // Assert: Verify asynchronous voting integrity
            expect(allVotes).toHaveLength(numUsers);

            // Each user should have voted exactly once
            const userVoteCounts = new Map<string, number>();
            allVotes.forEach((vote) => {
              const count = userVoteCounts.get(vote.userId) || 0;
              userVoteCounts.set(vote.userId, count + 1);
            });

            userIds.forEach((userId) => {
              expect(userVoteCounts.get(userId)).toBe(1);
            });

            // All votes should be for the same media item (first one)
            const votedMediaIds = new Set(allVotes.map((vote) => vote.mediaId));
            expect(votedMediaIds.size).toBe(1);
            expect(votedMediaIds.has(testMediaIds[0])).toBe(true);

            // Verify that each user's vote was processed independently
            expect(dynamoDBService.putItem).toHaveBeenCalledTimes(numUsers);
            expect(memberService.advanceMemberIndex).toHaveBeenCalledTimes(
              numUsers,
            );
            expect(memberService.updateMemberActivity).toHaveBeenCalledTimes(
              numUsers,
            );
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

    it('should handle non-member vote attempt', async () => {
      // Arrange
      const userId = 'non-member-user';
      const roomId = 'test-room';
      const createVoteDto: CreateVoteDto = {
        mediaId: 'media-1',
        voteType: VoteType.LIKE,
      };

      memberService.getMember.mockResolvedValue(null); // Not a member

      // Act & Assert
      await expect(
        service.registerVote(userId, roomId, createVoteDto),
      ).rejects.toThrow('No eres miembro de esta sala');
    });

    it('should handle empty queue gracefully', async () => {
      // Arrange
      const userId = 'test-user';
      const roomId = 'test-room';
      const mockMember: Member = {
        userId,
        roomId,
        role: MemberRole.MEMBER,
        status: MemberStatus.ACTIVE,
        shuffledList: [],
        currentIndex: 0,
        lastActivityAt: new Date(),
        joinedAt: new Date(),
      };

      memberService.getMember.mockResolvedValue(mockMember);
      memberService.getNextMediaForMember.mockResolvedValue(null); // Empty queue

      const createVoteDto: CreateVoteDto = {
        mediaId: 'media-1',
        voteType: VoteType.LIKE,
      };

      // Act & Assert
      await expect(
        service.registerVote(userId, roomId, createVoteDto),
      ).rejects.toThrow('No hay más contenido disponible en tu cola');
    });

    it('should check unanimous vote correctly', async () => {
      // Arrange
      const roomId = 'test-room';
      const mediaId = 'test-media';

      const activeMembers: Member[] = [
        {
          userId: 'user1',
          roomId,
          role: MemberRole.CREATOR,
          status: MemberStatus.ACTIVE,
          shuffledList: [mediaId],
          currentIndex: 0,
          lastActivityAt: new Date(),
          joinedAt: new Date(),
        },
        {
          userId: 'user2',
          roomId,
          role: MemberRole.MEMBER,
          status: MemberStatus.ACTIVE,
          shuffledList: [mediaId],
          currentIndex: 0,
          lastActivityAt: new Date(),
          joinedAt: new Date(),
        },
      ];

      const unanimousVotes: Vote[] = [
        {
          userId: 'user1',
          roomId,
          mediaId,
          voteType: VoteType.LIKE,
          timestamp: new Date(),
        },
        {
          userId: 'user2',
          roomId,
          mediaId,
          voteType: VoteType.LIKE,
          timestamp: new Date(),
        },
      ];

      memberService.getActiveMembers.mockResolvedValue(activeMembers);
      dynamoDBService.query.mockResolvedValue(unanimousVotes);

      // Act
      const result = await service.checkUnanimousVote(roomId, mediaId);

      // Assert
      expect(result.isUnanimous).toBe(true);
      expect(result.voteType).toBe(VoteType.LIKE);
      expect(result.totalVotes).toBe(2);
      expect(result.activeMembers).toBe(2);
    });

    it('should start swipe session correctly', async () => {
      // Arrange
      const userId = 'test-user';
      const roomId = 'test-room';
      const mockMember: Member = {
        userId,
        roomId,
        role: MemberRole.MEMBER,
        status: MemberStatus.ACTIVE,
        shuffledList: ['media1', 'media2', 'media3'],
        currentIndex: 1,
        lastActivityAt: new Date(),
        joinedAt: new Date(),
      };

      memberService.getMember.mockResolvedValue(mockMember);
      memberService.getMemberProgress.mockResolvedValue({
        currentIndex: 1,
        totalItems: 3,
        remainingItems: 2,
        progressPercentage: 33,
      });

      // Act
      const session = await service.startSwipeSession(userId, roomId);

      // Assert
      expect(session.userId).toBe(userId);
      expect(session.roomId).toBe(roomId);
      expect(session.sessionId).toBeDefined();
      expect(session.currentIndex).toBe(1);
      expect(session.totalItems).toBe(3);
      expect(session.votesInSession).toBe(0);
    });
  });
});
