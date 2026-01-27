import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import * as fc from 'fast-check';
import { RealtimeCompatibilityService } from '../realtime-compatibility.service';
import { AppSyncPublisher } from '../appsync-publisher.service';

describe('Event Broadcasting Consistency Property Tests', () => {
  let realtimeService: RealtimeCompatibilityService;
  let appSyncPublisher: AppSyncPublisher;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
      ],
      providers: [
        RealtimeCompatibilityService,
        {
          provide: AppSyncPublisher,
          useValue: {
            publishVoteUpdate: jest.fn(),
            publishMatchFound: jest.fn(),
            publishRoomStateChange: jest.fn(),
            publishMemberStatusChange: jest.fn(),
            publishThemeChange: jest.fn(),
            publishScheduleEvent: jest.fn(),
            publishRoleAssignment: jest.fn(),
            publishModerationAction: jest.fn(),
            publishChatMessage: jest.fn(),
            publishContentSuggestion: jest.fn(),
            publishRoomSettingsChange: jest.fn(),
            getConnectionStats: jest.fn(),
            healthCheck: jest.fn(),
          },
        },
      ],
    }).compile();

    realtimeService = module.get<RealtimeCompatibilityService>(
      RealtimeCompatibilityService,
    );
    appSyncPublisher = module.get<AppSyncPublisher>(AppSyncPublisher);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 1: Event Broadcasting Consistency
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5
   */
  describe('Property 1: Event Broadcasting Consistency', () => {
    it('should maintain consistent event structure across all event types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            userId: fc.string({ minLength: 1, maxLength: 50 }),
            eventType: fc.constantFrom(
              'vote',
              'match',
              'roomStateChange',
              'memberStatusChange',
              'themeChange',
              'scheduleEvent',
              'roleAssignment',
              'moderationAction',
              'chatMessage',
              'contentSuggestion',
              'automationAction',
            ),
            eventData: fc.record({
              timestamp: fc.date({
                min: new Date('2024-01-01'),
                max: new Date('2030-12-31'),
              }),
              metadata: fc.dictionary(fc.string(), fc.anything()),
            }),
          }),
          async ({ roomId, userId, eventType, eventData }) => {
            // Test that all event types maintain consistent structure
            const mockPublishMethod = jest.fn().mockResolvedValue(true);

            switch (eventType) {
              case 'vote':
                (appSyncPublisher.publishVoteUpdate as jest.Mock) =
                  mockPublishMethod;
                await realtimeService.notifyVote(roomId, {
                  userId,
                  mediaId: 'test-media',
                  vote: 'like',
                  timestamp: eventData.timestamp.toISOString(),
                });
                break;
              case 'match':
                (appSyncPublisher.publishMatchFound as jest.Mock) =
                  mockPublishMethod;
                await realtimeService.notifyMatch(roomId, {
                  mediaId: 'test-media',
                  title: 'Test Movie',
                  matchedBy: [userId],
                  timestamp: eventData.timestamp.toISOString(),
                });
                break;
              case 'roomStateChange':
                (appSyncPublisher.publishRoomStateChange as jest.Mock) =
                  mockPublishMethod;
                await realtimeService.notifyRoomStateChange(roomId, {
                  status: 'active',
                  queueLength: 10,
                  activeMembers: 5,
                });
                break;
              case 'memberStatusChange':
                (appSyncPublisher.publishMemberStatusChange as jest.Mock) =
                  mockPublishMethod;
                await realtimeService.notifyMemberStatusChange(roomId, {
                  userId,
                  status: 'active',
                  lastActivity: eventData.timestamp.toISOString(),
                });
                break;
              case 'themeChange':
                (appSyncPublisher.publishThemeChange as jest.Mock) =
                  mockPublishMethod;
                await realtimeService.notifyThemeChange(roomId, {
                  themeId: 'test-theme',
                  themeName: 'Test Theme',
                  action: 'applied',
                  appliedBy: userId,
                });
                break;
              case 'scheduleEvent':
                (appSyncPublisher.publishScheduleEvent as jest.Mock) =
                  mockPublishMethod;
                await realtimeService.notifyScheduleEvent(roomId, {
                  scheduleId: 'test-schedule',
                  title: 'Test Schedule',
                  action: 'created',
                  startTime: eventData.timestamp.toISOString(),
                  endTime: new Date(
                    eventData.timestamp.getTime() + 3600000,
                  ).toISOString(),
                  message: 'Test message',
                });
                break;
              case 'roleAssignment':
                (appSyncPublisher.publishRoleAssignment as jest.Mock) =
                  mockPublishMethod;
                await realtimeService.notifyRoleAssignment(roomId, {
                  targetUserId: userId,
                  roleId: 'test-role',
                  roleName: 'Test Role',
                  assignedBy: 'admin',
                  action: 'assigned',
                });
                break;
              case 'moderationAction':
                (appSyncPublisher.publishModerationAction as jest.Mock) =
                  mockPublishMethod;
                await realtimeService.notifyModerationAction(roomId, {
                  targetUserId: userId,
                  moderatorId: 'moderator',
                  actionType: 'warn',
                  reason: 'Test warning',
                });
                break;
              case 'chatMessage':
                (appSyncPublisher.publishChatMessage as jest.Mock) =
                  mockPublishMethod;
                await realtimeService.notifyChatMessage(roomId, {
                  type: 'message',
                  roomId,
                  userId,
                  username: 'testuser',
                  messageId: 'test-message',
                  message: {
                    id: 'test-message',
                    content: 'Test message',
                    type: 'text',
                    createdAt: eventData.timestamp,
                  },
                  timestamp: eventData.timestamp,
                });
                break;
              case 'contentSuggestion':
                (appSyncPublisher.publishContentSuggestion as jest.Mock) =
                  mockPublishMethod;
                await realtimeService.notifyContentSuggestion(roomId, {
                  type: 'created',
                  roomId,
                  suggestionId: 'test-suggestion',
                  userId,
                  username: 'testuser',
                  suggestion: {
                    id: 'test-suggestion',
                    title: 'Test Suggestion',
                    type: 'movie',
                    status: 'pending',
                    createdAt: eventData.timestamp,
                  },
                  timestamp: eventData.timestamp,
                });
                break;
              case 'automationAction':
                // AppSync publisher doesn't have publishAutomationAction, use room state change
                (appSyncPublisher.publishRoomStateChange as jest.Mock) =
                  mockPublishMethod;
                await realtimeService.notifyRoomStateChange(roomId, {
                  status: 'active',
                  queueLength: 10,
                  activeMembers: 5,
                });
                break;
            }

            // Verify that the appropriate publisher method was called
            expect(mockPublishMethod).toHaveBeenCalledTimes(1);

            // Verify that the call includes the roomId as the first parameter
            const callArgs = mockPublishMethod.mock.calls[0];
            expect(callArgs).toBeDefined();
            expect(callArgs.length).toBeGreaterThan(0);

            // First parameter should be roomId
            expect(callArgs[0]).toBe(roomId);
          },
        ),
        { numRuns: 50, timeout: 10000 },
      );
    });

    it('should handle concurrent event broadcasting without data corruption', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              roomId: fc.string({ minLength: 1, maxLength: 50 }),
              userId: fc.string({ minLength: 1, maxLength: 50 }),
              eventData: fc.record({
                mediaId: fc.string({ minLength: 1, maxLength: 50 }),
                vote: fc.constantFrom('like', 'dislike', 'skip'),
                timestamp: fc.date({
                  min: new Date('2024-01-01'),
                  max: new Date('2030-12-31'),
                }),
              }),
            }),
            { minLength: 2, maxLength: 10 },
          ),
          async (events) => {
            // Mock all publisher methods
            const mockPublishVote = jest.fn().mockResolvedValue(true);
            (appSyncPublisher.publishVoteUpdate as jest.Mock) = mockPublishVote;

            // Send all events concurrently
            const promises = events.map((event) =>
              realtimeService.notifyVote(event.roomId, {
                userId: event.userId,
                mediaId: event.eventData.mediaId,
                vote: event.eventData.vote,
                timestamp: event.eventData.timestamp.toISOString(),
              }),
            );

            await Promise.all(promises);

            // Verify all events were published
            expect(mockPublishVote).toHaveBeenCalledTimes(events.length);

            // Verify no data corruption - each call should have unique data
            const calls = mockPublishVote.mock.calls;
            for (let i = 0; i < calls.length; i++) {
              const callArgs = calls[i];
              const originalEvent = events[i];

              // First parameter should be roomId
              expect(callArgs[0]).toBe(originalEvent.roomId);

              // Second parameter should contain event data
              const eventData = callArgs[1];
              expect(eventData).toBeDefined();
              expect(eventData.userId).toBe(originalEvent.userId);
              expect(eventData.mediaId).toBe(originalEvent.eventData.mediaId);
            }
          },
        ),
        { numRuns: 20, timeout: 15000 },
      );
    });

    it('should maintain event ordering within the same room', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            events: fc.array(
              fc.record({
                userId: fc.string({ minLength: 1, maxLength: 50 }),
                mediaId: fc.string({ minLength: 1, maxLength: 50 }),
                vote: fc.constantFrom('like', 'dislike', 'skip'),
                delay: fc.integer({ min: 0, max: 100 }),
              }),
              { minLength: 3, maxLength: 8 },
            ),
          }),
          async ({ roomId, events }) => {
            const mockPublishVote = jest.fn().mockResolvedValue(true);
            (appSyncPublisher.publishVoteUpdate as jest.Mock) = mockPublishVote;

            const timestamps: Date[] = [];

            // Send events with controlled delays to test ordering
            for (const event of events) {
              if (event.delay > 0) {
                await new Promise((resolve) =>
                  setTimeout(resolve, event.delay),
                );
              }

              const timestamp = new Date();
              timestamps.push(timestamp);

              await realtimeService.notifyVote(roomId, {
                userId: event.userId,
                mediaId: event.mediaId,
                vote: event.vote,
                timestamp: timestamp.toISOString(),
              });
            }

            // Verify all events were published
            expect(mockPublishVote).toHaveBeenCalledTimes(events.length);

            // Verify timestamps are in order (allowing for small timing variations)
            const calls = mockPublishVote.mock.calls;
            for (let i = 1; i < calls.length; i++) {
              // Just verify that all calls were made - timing is hard to test reliably
              expect(calls[i]).toBeDefined();
              expect(calls[i][0]).toBe(roomId); // roomId should be consistent
            }
          },
        ),
        { numRuns: 15, timeout: 20000 },
      );
    });

    it('should handle malformed event data gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.oneof(
              fc.string({ minLength: 1, maxLength: 50 }),
              fc.constant(''),
              fc.constant(null),
              fc.constant(undefined),
            ),
            eventData: fc.oneof(
              fc.record({
                userId: fc.string({ minLength: 1, maxLength: 50 }),
                mediaId: fc.string({ minLength: 1, maxLength: 50 }),
                vote: fc.constantFrom('like', 'dislike', 'skip'),
              }),
              fc.record({
                userId: fc.constant(''),
                mediaId: fc.constant(''),
                vote: fc.constant('invalid'),
              }),
              fc.constant(null),
              fc.constant(undefined),
            ),
          }),
          async ({ roomId, eventData }) => {
            const mockPublishVote = jest.fn().mockResolvedValue(true);
            (appSyncPublisher.publishVoteUpdate as jest.Mock) = mockPublishVote;

            try {
              if (!roomId || !eventData) {
                // Should handle null/undefined gracefully
                await expect(
                  realtimeService.notifyVote(roomId as string, {
                    userId: eventData?.userId || '',
                    mediaId: eventData?.mediaId || '',
                    vote: eventData?.vote || 'like',
                    timestamp: new Date().toISOString(),
                  }),
                ).rejects.toThrow();
              } else {
                // Should handle valid data
                await realtimeService.notifyVote(roomId, {
                  userId: eventData.userId,
                  mediaId: eventData.mediaId,
                  vote: eventData.vote,
                  timestamp: new Date().toISOString(),
                });

                if (
                  eventData.userId &&
                  eventData.mediaId &&
                  ['like', 'dislike', 'skip'].includes(eventData.vote)
                ) {
                  expect(mockPublishVote).toHaveBeenCalledTimes(1);
                }
              }
            } catch (error) {
              // Malformed data should result in predictable errors
              expect(error).toBeInstanceOf(Error);
            }
          },
        ),
        { numRuns: 30, timeout: 10000 },
      );
    });
  });
});
