import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeService } from './realtime.service';
import { RealtimeGateway } from './realtime.gateway';
import * as fc from 'fast-check';

describe('RealtimeService', () => {
  let service: RealtimeService;
  let gateway: RealtimeGateway;

  const mockGateway = {
    notifyVote: jest.fn(),
    notifyMatch: jest.fn(),
    notifyRoomStateChange: jest.fn(),
    notifyMemberStatusChange: jest.fn(),
    getConnectedMembers: jest.fn(),
    isUserConnected: jest.fn(),
    getConnectionStats: jest.fn(),
    server: {
      emit: jest.fn(),
    },
    connectedUsers: new Map(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeService,
        {
          provide: RealtimeGateway,
          useValue: mockGateway,
        },
      ],
    }).compile();

    service = module.get<RealtimeService>(RealtimeService);
    gateway = module.get<RealtimeGateway>(RealtimeGateway);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Property Tests - Vote Notifications', () => {
    it('should handle vote notifications with valid data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 50 }), // userId
          fc.string({ minLength: 1, maxLength: 50 }), // mediaId
          fc.constantFrom('like', 'dislike'), // voteType
          fc.integer({ min: 0, max: 100 }), // totalVotes
          fc.integer({ min: 1, max: 100 }), // requiredVotes
          async (
            roomId,
            userId,
            mediaId,
            voteType,
            totalVotes,
            requiredVotes,
          ) => {
            const voteData = {
              userId,
              mediaId,
              voteType: voteType as 'like' | 'dislike',
              progress: {
                totalVotes,
                requiredVotes: Math.max(requiredVotes, totalVotes),
                percentage: Math.min(
                  100,
                  Math.round(
                    (totalVotes / Math.max(requiredVotes, totalVotes)) * 100,
                  ),
                ),
              },
            };

            await service.notifyVote(roomId, voteData);

            expect(mockGateway.notifyVote).toHaveBeenCalledWith(roomId, {
              type: 'vote',
              userId,
              mediaId,
              voteType,
              progress: voteData.progress,
            });
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should calculate progress percentage correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 1, max: 50 }),
          async (roomId, totalVotes, requiredVotes) => {
            const adjustedRequired = Math.max(requiredVotes, totalVotes);
            const expectedPercentage = Math.min(
              100,
              Math.round((totalVotes / adjustedRequired) * 100),
            );

            const voteData = {
              userId: 'test-user',
              mediaId: 'test-media',
              voteType: 'like' as const,
              progress: {
                totalVotes,
                requiredVotes: adjustedRequired,
                percentage: expectedPercentage,
              },
            };

            await service.notifyVote(roomId, voteData);

            const callArgs =
              mockGateway.notifyVote.mock.calls[
                mockGateway.notifyVote.mock.calls.length - 1
              ][1];
            expect(callArgs.progress.percentage).toBe(expectedPercentage);
            expect(callArgs.progress.percentage).toBeGreaterThanOrEqual(0);
            expect(callArgs.progress.percentage).toBeLessThanOrEqual(100);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property Tests - Match Notifications', () => {
    it('should handle match notifications with valid data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 50 }), // mediaId
          fc.string({ minLength: 1, maxLength: 100 }), // mediaTitle
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
            minLength: 1,
            maxLength: 10,
          }), // participants
          fc.constantFrom('unanimous', 'majority'), // matchType
          async (roomId, mediaId, mediaTitle, participants, matchType) => {
            const matchData = {
              mediaId,
              mediaTitle,
              participants,
              matchType: matchType as 'unanimous' | 'majority',
            };

            await service.notifyMatch(roomId, matchData);

            expect(mockGateway.notifyMatch).toHaveBeenCalledWith(roomId, {
              type: 'match',
              mediaId,
              mediaTitle,
              participants,
              matchType,
            });
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should handle empty participants array gracefully', async () => {
      const roomId = 'test-room';
      const matchData = {
        mediaId: 'test-media',
        mediaTitle: 'Test Movie',
        participants: [],
        matchType: 'unanimous' as const,
      };

      await service.notifyMatch(roomId, matchData);

      expect(mockGateway.notifyMatch).toHaveBeenCalledWith(roomId, {
        type: 'match',
        mediaId: matchData.mediaId,
        mediaTitle: matchData.mediaTitle,
        participants: [],
        matchType: 'unanimous',
      });
    });
  });

  describe('Property Tests - Room State Notifications', () => {
    it('should handle room state changes with valid data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.constantFrom('active', 'paused', 'finished'), // status
          fc.integer({ min: 0, max: 1000 }), // queueLength
          fc.integer({ min: 0, max: 50 }), // activeMembers
          fc.option(fc.string({ minLength: 1, maxLength: 50 })), // currentMediaId
          async (
            roomId,
            status,
            queueLength,
            activeMembers,
            currentMediaId,
          ) => {
            const stateData = {
              status: status as 'active' | 'paused' | 'finished',
              currentMediaId: currentMediaId || undefined,
              queueLength,
              activeMembers,
            };

            await service.notifyRoomStateChange(roomId, stateData);

            expect(mockGateway.notifyRoomStateChange).toHaveBeenCalledWith(
              roomId,
              {
                type: 'roomState',
                status,
                currentMediaId: currentMediaId || undefined,
                queueLength,
                activeMembers,
              },
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should handle queue progress notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 1, max: 100 }),
          fc.string({ minLength: 1 }),
          async (roomId, currentPosition, totalItems, currentMediaId) => {
            const adjustedTotal = Math.max(totalItems, currentPosition + 1);
            const expectedPercentage = Math.round(
              (currentPosition / adjustedTotal) * 100,
            );

            const progressData = {
              currentPosition,
              totalItems: adjustedTotal,
              currentMediaId,
              nextMediaId: 'next-media',
            };

            await service.notifyQueueProgress(roomId, progressData);

            const callArgs =
              mockGateway.notifyRoomStateChange.mock.calls[
                mockGateway.notifyRoomStateChange.mock.calls.length - 1
              ][1];
            expect(callArgs.type).toBe('queueProgress');
            expect(callArgs.percentage).toBe(expectedPercentage);
            expect(callArgs.percentage).toBeGreaterThanOrEqual(0);
            expect(callArgs.percentage).toBeLessThanOrEqual(100);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property Tests - Member Status Notifications', () => {
    it('should handle member status changes with valid data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 50 }), // userId
          fc.constantFrom('active', 'inactive', 'left'), // status
          fc.option(fc.date()), // lastActivity
          async (roomId, userId, status, lastActivity) => {
            const memberData = {
              userId,
              status: status as 'active' | 'inactive' | 'left',
              lastActivity: lastActivity?.toISOString(),
            };

            await service.notifyMemberStatusChange(roomId, memberData);

            expect(mockGateway.notifyMemberStatusChange).toHaveBeenCalledWith(
              roomId,
              {
                type: 'memberStatus',
                userId,
                status,
                lastActivity: lastActivity?.toISOString(),
              },
            );
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Property Tests - AI Recommendations', () => {
    it('should handle AI recommendation notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.array(fc.string({ minLength: 1 }), {
            minLength: 1,
            maxLength: 10,
          }),
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.float({ min: 0, max: 1 }),
          async (roomId, mediaIds, reasoning, emotionalState, confidence) => {
            const recommendationData = {
              mediaIds,
              reasoning,
              emotionalState,
              confidence,
            };

            await service.notifyAIRecommendation(roomId, recommendationData);

            expect(mockGateway.notifyRoomStateChange).toHaveBeenCalledWith(
              roomId,
              {
                type: 'aiRecommendation',
                mediaIds,
                reasoning,
                emotionalState,
                confidence,
              },
            );
          },
        ),
        { numRuns: 30 },
      );
    });

    it('should handle confidence values correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.float({ min: 0, max: 1 }),
          async (roomId, confidence) => {
            const recommendationData = {
              mediaIds: ['test-media'],
              reasoning: 'Test reasoning',
              emotionalState: 'happy',
              confidence,
            };

            await service.notifyAIRecommendation(roomId, recommendationData);

            const callArgs =
              mockGateway.notifyRoomStateChange.mock.calls[
                mockGateway.notifyRoomStateChange.mock.calls.length - 1
              ][1];
            expect(callArgs.confidence).toBeCloseTo(confidence, 5);
            expect(callArgs.confidence).toBeGreaterThanOrEqual(0);
            expect(callArgs.confidence).toBeLessThanOrEqual(1);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Connection Management', () => {
    it('should return connected members for a room', () => {
      const roomId = 'test-room';
      const expectedMembers = ['user1', 'user2', 'user3'];
      mockGateway.getConnectedMembers.mockReturnValue(expectedMembers);

      const result = service.getConnectedMembers(roomId);

      expect(result).toEqual(expectedMembers);
      expect(mockGateway.getConnectedMembers).toHaveBeenCalledWith(roomId);
    });

    it('should check if user is connected', () => {
      const userId = 'test-user';
      mockGateway.isUserConnected.mockReturnValue(true);

      const result = service.isUserConnected(userId);

      expect(result).toBe(true);
      expect(mockGateway.isUserConnected).toHaveBeenCalledWith(userId);
    });

    it('should return realtime stats with timestamp and uptime', () => {
      const mockStats = {
        totalConnections: 5,
        activeRooms: 2,
        roomStats: [
          {
            roomId: 'room1',
            memberCount: 3,
            members: ['user1', 'user2', 'user3'],
          },
          { roomId: 'room2', memberCount: 2, members: ['user4', 'user5'] },
        ],
      };
      mockGateway.getConnectionStats.mockReturnValue(mockStats);

      const result = service.getRealtimeStats();

      expect(result).toMatchObject(mockStats);
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeDefined();
      expect(typeof result.uptime).toBe('number');
    });
  });

  describe('System Messages', () => {
    it('should broadcast system messages', async () => {
      const message = 'System maintenance in 5 minutes';
      const type = 'warning';

      await service.broadcastSystemMessage(message, type);

      expect(mockGateway.server.emit).toHaveBeenCalledWith('systemMessage', {
        type,
        message,
        timestamp: expect.any(String),
      });
    });

    it('should send private messages to connected users', async () => {
      const userId = 'test-user';
      const message = { content: 'Private message' };
      const mockSocket = { emit: jest.fn() };
      mockGateway.connectedUsers.set(userId, mockSocket);

      const result = await service.sendPrivateMessage(userId, message);

      expect(result).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('privateMessage', {
        ...message,
        timestamp: expect.any(String),
      });
    });

    it('should return false for private messages to disconnected users', async () => {
      const userId = 'disconnected-user';
      const message = { content: 'Private message' };

      const result = await service.sendPrivateMessage(userId, message);

      expect(result).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle gateway errors gracefully', async () => {
      mockGateway.notifyVote.mockImplementation(() => {
        throw new Error('Gateway error');
      });

      const voteData = {
        userId: 'test-user',
        mediaId: 'test-media',
        voteType: 'like' as const,
        progress: { totalVotes: 1, requiredVotes: 2, percentage: 50 },
      };

      // Should not throw error - service should handle it gracefully
      await expect(
        service.notifyVote('test-room', voteData),
      ).resolves.toBeUndefined();
    });

    it('should handle missing gateway methods gracefully', async () => {
      const incompleteGateway = {
        getConnectionStats: () => ({
          totalConnections: 0,
          activeRooms: 0,
          roomStats: [],
        }),
      };
      const serviceWithIncompleteGateway = new RealtimeService(
        incompleteGateway as any,
      );

      // Should not throw error
      const stats = serviceWithIncompleteGateway.getRealtimeStats();
      expect(stats).toBeDefined();
      expect(stats.totalConnections).toBe(0);
    });
  });
});
