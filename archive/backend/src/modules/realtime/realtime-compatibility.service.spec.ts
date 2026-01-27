import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RealtimeCompatibilityService } from './realtime-compatibility.service';
import { AppSyncPublisher } from './appsync-publisher.service';
import * as fc from 'fast-check';

// Unmock the service for this test file
jest.unmock('./realtime-compatibility.service');

describe('RealtimeCompatibilityService - Property Tests', () => {
  let service: RealtimeCompatibilityService;
  let mockAppSyncPublisher: jest.Mocked<AppSyncPublisher>;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Create a proper mock object for AppSyncPublisher
    mockAppSyncPublisher = {
      publishVoteUpdate: jest.fn().mockResolvedValue(undefined),
      publishMatchFound: jest.fn().mockResolvedValue(undefined),
      publishRoomStateChange: jest.fn().mockResolvedValue(undefined),
      publishMemberStatusChange: jest.fn().mockResolvedValue(undefined),
      publishRoleAssignment: jest.fn().mockResolvedValue(undefined),
      publishModerationAction: jest.fn().mockResolvedValue(undefined),
      publishScheduleEvent: jest.fn().mockResolvedValue(undefined),
      publishThemeChange: jest.fn().mockResolvedValue(undefined),
      publishRoomSettingsChange: jest.fn().mockResolvedValue(undefined),
      publishChatMessage: jest.fn().mockResolvedValue(undefined),
      publishContentSuggestion: jest.fn().mockResolvedValue(undefined),
      getConnectionStats: jest.fn().mockReturnValue({
        type: 'AppSync',
        apiUrl: 'mock-url',
        region: 'us-east-1',
        timestamp: new Date().toISOString(),
        uptime: 100,
        connections: 0,
      }),
      healthCheck: jest.fn().mockResolvedValue(true),
    } as jest.Mocked<AppSyncPublisher>;

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config = {
          APPSYNC_API_URL: 'https://mock-appsync-url.com/graphql',
          APPSYNC_API_KEY: 'mock-api-key',
          AWS_REGION: 'us-east-1',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeCompatibilityService,
        {
          provide: AppSyncPublisher,
          useValue: mockAppSyncPublisher,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RealtimeCompatibilityService>(
      RealtimeCompatibilityService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(mockAppSyncPublisher).toBeDefined();
  });

  it('should call publishVoteUpdate when notifyVote is called', async () => {
    const roomId = 'test-room';
    const voteData = {
      userId: 'test-user',
      mediaId: 'test-media',
      voteType: 'like' as const,
      progress: { totalVotes: 1, requiredVotes: 1, percentage: 100 },
    };
    
    await service.notifyVote(roomId, voteData);

    expect(mockAppSyncPublisher.publishVoteUpdate).toHaveBeenCalledWith(roomId, voteData);
    expect(mockAppSyncPublisher.publishVoteUpdate).toHaveBeenCalledTimes(1);
  });

  /**
   * Property 3: Service Integration Equivalence
   * Feature: appsync-realtime-migration, Property 3: For any notification method call from business services, the AppSync publisher should successfully publish the event
   * Validates: Requirements 5.1, 5.3, 5.4
   */
  describe('Property 3: Service Integration Equivalence', () => {
    it('should maintain functional equivalence for vote notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 50 }), // userId
          fc.string({ minLength: 1, maxLength: 50 }), // mediaId
          fc.oneof(fc.constant('like'), fc.constant('dislike')), // voteType
          fc.record({
            totalVotes: fc.integer({ min: 1, max: 100 }),
            requiredVotes: fc.integer({ min: 1, max: 100 }),
            percentage: fc.float({ min: 0, max: 100 }),
          }), // progress
          async (roomId, userId, mediaId, voteType, progress) => {
            const voteData = {
              userId,
              mediaId,
              voteType,
              progress,
            };

            // Call the compatibility service method
            await service.notifyVote(roomId, voteData);

            // Debug: Check if the service is defined and the method exists
            expect(service).toBeDefined();
            expect(service.notifyVote).toBeDefined();
            expect(mockAppSyncPublisher).toBeDefined();
            expect(mockAppSyncPublisher.publishVoteUpdate).toBeDefined();

            // Verify that the AppSync publisher was called with the same data
            expect(mockAppSyncPublisher.publishVoteUpdate).toHaveBeenCalledWith(
              roomId,
              voteData,
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain functional equivalence for match notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 50 }), // mediaId
          fc.string({ minLength: 1, maxLength: 100 }), // mediaTitle
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
            minLength: 1,
            maxLength: 10,
          }), // participants
          fc.oneof(fc.constant('unanimous'), fc.constant('majority')), // matchType
          async (roomId, mediaId, mediaTitle, participants, matchType) => {
            const matchData = {
              mediaId,
              mediaTitle,
              participants,
              matchType,
            };

            // Call the compatibility service method
            await service.notifyMatch(roomId, matchData);

            // Verify that the AppSync publisher was called with the same data
            expect(mockAppSyncPublisher.publishMatchFound).toHaveBeenCalledWith(
              roomId,
              matchData,
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain functional equivalence for room state change notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.oneof(
            fc.constant('active'),
            fc.constant('paused'),
            fc.constant('finished'),
          ), // status
          fc.option(fc.string({ minLength: 1, maxLength: 50 })), // currentMediaId
          fc.integer({ min: 0, max: 1000 }), // queueLength
          fc.integer({ min: 0, max: 100 }), // activeMembers
          async (
            roomId,
            status,
            currentMediaId,
            queueLength,
            activeMembers,
          ) => {
            const stateData = {
              status,
              currentMediaId,
              queueLength,
              activeMembers,
            };

            // Call the compatibility service method
            await service.notifyRoomStateChange(roomId, stateData);

            // Verify that the AppSync publisher was called with the same data
            expect(
              mockAppSyncPublisher.publishRoomStateChange,
            ).toHaveBeenCalledWith(roomId, stateData);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain functional equivalence for member status change notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 50 }), // userId
          fc.oneof(
            fc.constant('active'),
            fc.constant('inactive'),
            fc.constant('left'),
          ), // status
          fc.option(fc.string()), // lastActivity
          async (roomId, userId, status, lastActivity) => {
            const memberData = {
              userId,
              status,
              lastActivity,
            };

            // Call the compatibility service method
            await service.notifyMemberStatusChange(roomId, memberData);

            // Verify that the AppSync publisher was called with the same data
            expect(
              mockAppSyncPublisher.publishMemberStatusChange,
            ).toHaveBeenCalledWith(roomId, memberData);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain functional equivalence for role assignment notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 50 }), // targetUserId
          fc.string({ minLength: 1, maxLength: 50 }), // roleId
          fc.string({ minLength: 1, maxLength: 50 }), // roleName
          fc.string({ minLength: 1, maxLength: 50 }), // assignedBy
          fc.oneof(fc.constant('assigned'), fc.constant('removed')), // action
          async (
            roomId,
            targetUserId,
            roleId,
            roleName,
            assignedBy,
            action,
          ) => {
            const roleData = {
              targetUserId,
              roleId,
              roleName,
              assignedBy,
              action,
            };

            // Call the compatibility service method
            await service.notifyRoleAssignment(roomId, roleData);

            // Verify that the AppSync publisher was called with the same data
            expect(
              mockAppSyncPublisher.publishRoleAssignment,
            ).toHaveBeenCalledWith(roomId, roleData);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain functional equivalence for moderation action notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 50 }), // targetUserId
          fc.string({ minLength: 1, maxLength: 50 }), // moderatorId
          fc.string({ minLength: 1, maxLength: 50 }), // actionType
          fc.string({ minLength: 1, maxLength: 200 }), // reason
          fc.option(fc.integer({ min: 1, max: 86400 })), // duration
          fc.option(fc.string()), // expiresAt
          async (
            roomId,
            targetUserId,
            moderatorId,
            actionType,
            reason,
            duration,
            expiresAt,
          ) => {
            const moderationData = {
              targetUserId,
              moderatorId,
              actionType,
              reason,
              duration,
              expiresAt,
            };

            // Call the compatibility service method
            await service.notifyModerationAction(roomId, moderationData);

            // Verify that the AppSync publisher was called with the same data
            expect(
              mockAppSyncPublisher.publishModerationAction,
            ).toHaveBeenCalledWith(roomId, moderationData);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain functional equivalence for schedule event notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 50 }), // scheduleId
          fc.string({ minLength: 1, maxLength: 100 }), // title
          fc.oneof(
            fc.constant('created'),
            fc.constant('updated'),
            fc.constant('cancelled'),
            fc.constant('reminder'),
          ), // action
          fc.string(), // startTime
          fc.string(), // endTime
          fc.option(fc.string({ maxLength: 500 })), // message
          async (
            roomId,
            scheduleId,
            title,
            action,
            startTime,
            endTime,
            message,
          ) => {
            const scheduleData = {
              scheduleId,
              title,
              action,
              startTime,
              endTime,
              message,
            };

            // Call the compatibility service method
            await service.notifyScheduleEvent(roomId, scheduleData);

            // Verify that the AppSync publisher was called with the same data
            expect(
              mockAppSyncPublisher.publishScheduleEvent,
            ).toHaveBeenCalledWith(roomId, scheduleData);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain functional equivalence for theme change notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.option(fc.string({ minLength: 1, maxLength: 50 })), // themeId
          fc.option(fc.string({ minLength: 1, maxLength: 100 })), // themeName
          fc.oneof(
            fc.constant('applied'),
            fc.constant('removed'),
            fc.constant('updated'),
          ), // action
          fc.string({ minLength: 1, maxLength: 50 }), // appliedBy
          fc.option(fc.object()), // customizations
          async (
            roomId,
            themeId,
            themeName,
            action,
            appliedBy,
            customizations,
          ) => {
            const themeData = {
              themeId,
              themeName,
              action,
              appliedBy,
              customizations,
            };

            // Call the compatibility service method
            await service.notifyThemeChange(roomId, themeData);

            // Verify that the AppSync publisher was called with the same data
            expect(
              mockAppSyncPublisher.publishThemeChange,
            ).toHaveBeenCalledWith(roomId, themeData);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain functional equivalence for room settings change notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 50 }), // settingKey
          fc.anything(), // oldValue
          fc.anything(), // newValue
          fc.string({ minLength: 1, maxLength: 50 }), // changedBy
          fc.oneof(
            fc.constant('privacy'),
            fc.constant('consensus'),
            fc.constant('capacity'),
            fc.constant('timeout'),
            fc.constant('other'),
          ), // category
          async (
            roomId,
            settingKey,
            oldValue,
            newValue,
            changedBy,
            category,
          ) => {
            const settingsData = {
              settingKey,
              oldValue,
              newValue,
              changedBy,
              category,
            };

            // Call the compatibility service method
            await service.notifyRoomSettingsChange(roomId, settingsData);

            // Verify that the AppSync publisher was called with the same data
            expect(
              mockAppSyncPublisher.publishRoomSettingsChange,
            ).toHaveBeenCalledWith(roomId, settingsData);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain functional equivalence for chat message notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 50 }), // messageId
          fc.string({ minLength: 1, maxLength: 50 }), // userId
          fc.string({ minLength: 1, maxLength: 50 }), // username
          fc.oneof(
            fc.constant('message'),
            fc.constant('edit'),
            fc.constant('delete'),
            fc.constant('reaction'),
          ), // type
          fc.option(fc.object()), // message
          fc.option(fc.object()), // data
          async (roomId, messageId, userId, username, type, message, data) => {
            const chatData = {
              type,
              roomId,
              userId,
              username,
              messageId,
              message,
              data,
              timestamp: new Date(),
            };

            // Call the compatibility service method
            await service.notifyChatMessage(roomId, chatData);

            // Verify that the AppSync publisher was called with the same data
            expect(
              mockAppSyncPublisher.publishChatMessage,
            ).toHaveBeenCalledWith(roomId, chatData);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain functional equivalence for content suggestion notifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 50 }), // suggestionId
          fc.string({ minLength: 1, maxLength: 50 }), // userId
          fc.string({ minLength: 1, maxLength: 50 }), // username
          fc.oneof(
            fc.constant('created'),
            fc.constant('voted'),
            fc.constant('commented'),
            fc.constant('approved'),
            fc.constant('rejected'),
            fc.constant('implemented'),
          ), // type
          fc.option(fc.object()), // suggestion
          fc.option(fc.object()), // vote
          fc.option(fc.object()), // comment
          async (
            roomId,
            suggestionId,
            userId,
            username,
            type,
            suggestion,
            vote,
            comment,
          ) => {
            const suggestionData = {
              type,
              roomId,
              suggestionId,
              userId,
              username,
              suggestion,
              vote,
              comment,
              data: {},
              timestamp: new Date(),
            };

            // Call the compatibility service method
            await service.notifyContentSuggestion(roomId, suggestionData);

            // Verify that the AppSync publisher was called with the same data
            expect(
              mockAppSyncPublisher.publishContentSuggestion,
            ).toHaveBeenCalledWith(roomId, suggestionData);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Legacy Method Compatibility', () => {
    it('should handle queue progress notifications by converting to room state changes', async () => {
      const roomId = 'test-room';
      const progressData = {
        currentPosition: 5,
        totalItems: 10,
        currentMediaId: 'media-123',
        nextMediaId: 'media-456',
      };

      await service.notifyQueueProgress(roomId, progressData);

      expect(mockAppSyncPublisher.publishRoomStateChange).toHaveBeenCalledWith(
        roomId,
        {
          status: 'active',
          currentMediaId: progressData.currentMediaId,
          queueLength: progressData.totalItems,
          activeMembers: 0,
        },
      );
    });

    it('should handle AI recommendation notifications by converting to room state changes', async () => {
      const roomId = 'test-room';
      const recommendationData = {
        mediaIds: ['media-1', 'media-2'],
        reasoning: 'Test reasoning',
        emotionalState: 'happy',
        confidence: 0.85,
      };

      await service.notifyAIRecommendation(roomId, recommendationData);

      expect(mockAppSyncPublisher.publishRoomStateChange).toHaveBeenCalledWith(
        roomId,
        {
          status: 'active',
          queueLength: 0,
          activeMembers: 0,
        },
      );
    });

    it('should provide connection statistics from AppSync publisher', () => {
      const stats = service.getRealtimeStats();

      expect(stats).toHaveProperty('type', 'AppSync');
      expect(stats).toHaveProperty('apiUrl');
      expect(stats).toHaveProperty('region');
      expect(stats).toHaveProperty('timestamp');
      expect(stats).toHaveProperty('uptime');
    });

    it('should handle unsupported methods gracefully', () => {
      // These methods should not throw errors but should log warnings
      expect(() => service.getConnectedMembers('test-room')).not.toThrow();
      expect(() => service.isUserConnected('test-user')).not.toThrow();

      expect(service.getConnectedMembers('test-room')).toEqual([]);
      expect(service.isUserConnected('test-user')).toBe(false);
    });

    it('should handle unsupported async methods gracefully', async () => {
      // These methods should not throw errors but should log warnings
      await expect(
        service.broadcastSystemMessage('test message'),
      ).resolves.not.toThrow();
      await expect(
        service.sendPrivateMessage('user-123', { test: 'message' }),
      ).resolves.not.toThrow();

      const result = await service.sendPrivateMessage('user-123', {
        test: 'message',
      });
      expect(result).toBe(false);
    });

    it('should delegate health check to AppSync publisher', async () => {
      const result = await service.healthCheck();

      expect(mockAppSyncPublisher.healthCheck).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });
});
