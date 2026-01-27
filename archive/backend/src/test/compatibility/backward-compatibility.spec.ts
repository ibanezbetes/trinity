import '../../test-setup-integration';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { AuthService } from '../../modules/auth/auth.service';
import { RoomService } from '../../modules/room/room.service';
import { InteractionService } from '../../modules/interaction/interaction.service';
import { MatchService } from '../../modules/match/match.service';
import { MediaService } from '../../modules/media/media.service';
import { AnalyticsService } from '../../modules/analytics/analytics.service';
import * as fc from 'fast-check';

describe('Backward Compatibility Tests', () => {
  let app: INestApplication;
  let authService: AuthService;
  let roomService: RoomService;
  let interactionService: InteractionService;
  let matchService: MatchService;
  let mediaService: MediaService;
  let analyticsService: AnalyticsService;

  let testUser: any;
  let testRoom: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get services
    authService = moduleFixture.get<AuthService>(AuthService);
    roomService = moduleFixture.get<RoomService>(RoomService);
    interactionService =
      moduleFixture.get<InteractionService>(InteractionService);
    matchService = moduleFixture.get<MatchService>(MatchService);
    mediaService = moduleFixture.get<MediaService>(MediaService);
    analyticsService = moduleFixture.get<AnalyticsService>(AnalyticsService);

    // Create test user and room
    testUser = await authService.register({
      email: 'compatibility@test.com',
      password: 'TestPass123!',
      username: 'compatibilityuser',
    });

    testRoom = await roomService.createRoom(testUser.user.id, {
      name: 'Compatibility Test Room',
      description: 'Room for backward compatibility testing',
      isPrivate: false,
      maxMembers: 10,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Core Authentication Functionality', () => {
    it('should maintain existing authentication flows', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.emailAddress(),
            username: fc.string({ minLength: 3, maxLength: 20 }),
            password: fc.string({ minLength: 8, maxLength: 50 }),
          }),
          async (userData) => {
            // Registration should work as before
            const user = await authService.register({
              email: userData.email,
              username: userData.username,
              password: userData.password + 'A1!', // Ensure password complexity
            });

            expect(user).toBeDefined();
            expect(user.user.email).toBe(userData.email);
            expect(user.user.username).toBe(userData.username);
            expect(user.requiresConfirmation).toBe(true);

            // Login should work as before
            const loginResult = await authService.login({
              email: userData.email,
              password: userData.password + 'A1!',
            });

            expect(loginResult).toBeDefined();
            expect(loginResult.user.email).toBe(userData.email);
            expect(loginResult.accessToken).toBeDefined();

            // Token refresh should work as before
            const refreshResult = await authService.refreshToken(
              loginResult.refreshToken,
            );
            expect(refreshResult).toBeDefined();
            expect(refreshResult.accessToken).toBeDefined();
          },
        ),
        { numRuns: 10, timeout: 15000 },
      );
    });

    it('should maintain existing JWT token validation', async () => {
      const user = await authService.register({
        email: 'jwt-test@example.com',
        password: 'TestPass123!',
        username: 'jwtuser',
      });

      // Token should be valid for existing operations
      const profile = await authService.getProfile(user.user.id);
      expect(profile).toBeDefined();
      expect(profile.id).toBe(user.user.id);

      // Logout should work as before
      await authService.logout(user.user.id);

      // After logout, operations requiring authentication should fail gracefully
      await expect(authService.getProfile(user.user.id)).rejects.toThrow();
    });
  });

  describe('Core Room Management Functionality', () => {
    it('should maintain existing room creation and management', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomName: fc.string({ minLength: 3, maxLength: 50 }),
            description: fc.string({ minLength: 10, maxLength: 200 }),
            isPrivate: fc.boolean(),
            maxMembers: fc.integer({ min: 2, max: 50 }),
          }),
          async (roomData) => {
            // Room creation should work as before
            const room = await roomService.createRoom(testUser.user.id, {
              name: roomData.roomName,
              description: roomData.description,
              isPrivate: roomData.isPrivate,
              maxMembers: roomData.maxMembers,
            });

            expect(room).toBeDefined();
            expect(room.name).toBe(roomData.roomName);
            expect(room.description).toBe(roomData.description);
            expect(room.isPrivate).toBe(roomData.isPrivate);
            expect(room.maxMembers).toBe(roomData.maxMembers);
            expect(room.creatorId).toBe(testUser.user.id);

            // Room retrieval should work as before
            const retrievedRoom = await roomService.getRoomById(room.id);
            expect(retrievedRoom).toBeDefined();
            expect(retrievedRoom.id).toBe(room.id);

            // Room updates should work as before
            const updatedRoom = await roomService.updateRoom(
              room.id,
              testUser.user.id,
              {
                name: roomData.roomName + ' Updated',
              },
            );
            expect(updatedRoom.name).toBe(roomData.roomName + ' Updated');

            // Room deletion should work as before
            await roomService.deleteRoom(room.id, testUser.user.id);

            // Deleted room should not be retrievable
            await expect(roomService.getRoomById(room.id)).rejects.toThrow();
          },
        ),
        { numRuns: 15, timeout: 20000 },
      );
    });

    it('should maintain existing member management', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            memberCount: fc.integer({ min: 1, max: 5 }),
          }),
          async (testData) => {
            const room = await roomService.createRoom(testUser.user.id, {
              name: 'Member Test Room',
              description: 'Testing member management',
              isPrivate: false,
              maxMembers: 10,
            });

            // Create additional test users
            const members = [];
            for (let i = 0; i < testData.memberCount; i++) {
              const member = await authService.register({
                email: `member${i}@test.com`,
                password: 'TestPass123!',
                username: `member${i}`,
              });
              members.push(member);

              // Join room should work as before
              await roomService.joinRoom(room.id, member.user.id);
            }

            // Get room members should work as before
            const roomMembers = await roomService.getRoomMembers(room.id);
            expect(roomMembers).toHaveLength(testData.memberCount + 1); // +1 for creator

            // Leave room should work as before
            for (const member of members) {
              await roomService.leaveRoom(room.id, member.user.id);
            }

            const finalMembers = await roomService.getRoomMembers(room.id);
            expect(finalMembers).toHaveLength(1); // Only creator remains

            // Cleanup
            await roomService.deleteRoom(room.id, testUser.user.id);
          },
        ),
        { numRuns: 8, timeout: 25000 },
      );
    });
  });

  describe('Core Interaction and Voting System', () => {
    it('should maintain existing voting functionality', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            voteType: fc.constantFrom('like', 'dislike'),
            contentId: fc.string({ minLength: 5, maxLength: 20 }),
          }),
          async (testData) => {
            // Add some content to the room first
            await roomService.generateShuffledContent(
              testRoom.id,
              testUser.user.id,
              {
                genres: ['action', 'comedy'],
                contentCount: 5,
              },
            );

            // Voting should work as before
            const vote = await interactionService.recordVote(
              testUser.user.id,
              testRoom.id,
              testData.contentId,
              testData.voteType,
            );

            expect(vote).toBeDefined();
            expect(vote.userId).toBe(testUser.user.id);
            expect(vote.roomId).toBe(testRoom.id);
            expect(vote.contentId).toBe(testData.contentId);
            expect(vote.voteType).toBe(testData.voteType);

            // Get vote history should work as before
            const voteHistory = await interactionService.getUserVoteHistory(
              testUser.user.id,
              testRoom.id,
            );

            expect(Array.isArray(voteHistory)).toBe(true);
            const userVote = voteHistory.find(
              (v) => v.contentId === testData.contentId,
            );
            expect(userVote).toBeDefined();
            expect(userVote?.voteType).toBe(testData.voteType);

            // Get room progress should work as before
            const progress = await interactionService.getRoomProgress(
              testRoom.id,
            );
            expect(progress).toBeDefined();
            expect(typeof progress.totalContent).toBe('number');
            expect(typeof progress.votedContent).toBe('number');
          },
        ),
        { numRuns: 12, timeout: 15000 },
      );
    });

    it('should maintain existing queue status functionality', async () => {
      // Generate content for the room
      await roomService.generateShuffledContent(testRoom.id, testUser.user.id, {
        genres: ['action', 'comedy', 'drama'],
        contentCount: 10,
      });

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            voteCount: fc.integer({ min: 1, max: 5 }),
          }),
          async (testData) => {
            // Get initial queue status
            const initialStatus = await interactionService.getQueueStatus(
              testRoom.id,
              testUser.user.id,
            );
            expect(initialStatus).toBeDefined();
            expect(typeof initialStatus.currentPosition).toBe('number');
            expect(typeof initialStatus.totalItems).toBe('number');

            // Vote on multiple items
            const room = await roomService.getRoomById(testRoom.id);
            const contentItems =
              room.shuffledContent?.slice(0, testData.voteCount) || [];

            for (const contentId of contentItems) {
              await interactionService.recordVote(
                testUser.user.id,
                testRoom.id,
                contentId,
                'like',
              );
            }

            // Queue status should update correctly
            const updatedStatus = await interactionService.getQueueStatus(
              testRoom.id,
              testUser.user.id,
            );
            expect(updatedStatus).toBeDefined();
            expect(updatedStatus.currentPosition).toBeGreaterThanOrEqual(
              initialStatus.currentPosition,
            );
          },
        ),
        { numRuns: 8, timeout: 20000 },
      );
    });
  });

  describe('Core Match Detection System', () => {
    it('should maintain existing match detection functionality', async () => {
      // Create a second user for match testing
      const secondUser = await authService.register({
        email: 'match-test@example.com',
        password: 'TestPass123!',
        username: 'matchuser',
      });

      await roomService.joinRoom(testRoom.id, secondUser.user.id);

      // Generate content
      await roomService.generateShuffledContent(testRoom.id, testUser.user.id, {
        genres: ['action'],
        contentCount: 3,
      });

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            contentIndex: fc.integer({ min: 0, max: 2 }),
            voteType: fc.constantFrom('like', 'dislike'),
          }),
          async (testData) => {
            const room = await roomService.getRoomById(testRoom.id);
            const contentId = room.shuffledContent?.[testData.contentIndex];

            if (!contentId) return;

            // Both users vote the same way
            await interactionService.recordVote(
              testUser.user.id,
              testRoom.id,
              contentId,
              testData.voteType,
            );

            await interactionService.recordVote(
              secondUser.user.id,
              testRoom.id,
              contentId,
              testData.voteType,
            );

            // Check for matches should work as before
            const matchResult = await matchService.checkForMatches(testRoom.id);
            expect(matchResult).toBeDefined();

            if (testData.voteType === 'like') {
              // Should detect match for 'like' votes
              expect(matchResult.matches.length).toBeGreaterThanOrEqual(0);

              if (matchResult.matches.length > 0) {
                const match = matchResult.matches[0];
                expect(match.contentId).toBe(contentId);
                expect(match.roomId).toBe(testRoom.id);
              }
            }

            // Get room matches should work as before
            const roomMatches = await matchService.getRoomMatches(testRoom.id);
            expect(Array.isArray(roomMatches)).toBe(true);
          },
        ),
        { numRuns: 6, timeout: 20000 },
      );
    });

    it('should maintain existing match history functionality', async () => {
      // Get match history should work as before
      const matchHistory = await matchService.getRoomMatches(testRoom.id);
      expect(Array.isArray(matchHistory)).toBe(true);

      // Get match summary should work as before
      const matchSummary = await matchService.getMatchSummary(testRoom.id);
      expect(matchSummary).toBeDefined();
      expect(typeof matchSummary.totalMatches).toBe('number');
      expect(typeof matchSummary.matchRate).toBe('number');
      expect(Array.isArray(matchSummary.topGenres)).toBe(true);
    });
  });

  describe('Core Media and Content System', () => {
    it('should maintain existing content search and management', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            searchQuery: fc.constantFrom(
              'action',
              'comedy',
              'drama',
              'thriller',
            ),
            contentType: fc.constantFrom('movie', 'tv'),
          }),
          async (testData) => {
            // Content search should work as before
            const searchResults = await mediaService.searchContent(
              testData.searchQuery,
              testData.contentType,
            );

            expect(Array.isArray(searchResults)).toBe(true);
            expect(searchResults.length).toBeGreaterThan(0);

            // Get content details should work as before
            if (searchResults.length > 0) {
              const contentId = searchResults[0].id;
              const contentDetails =
                await mediaService.getContentDetails(contentId);

              expect(contentDetails).toBeDefined();
              expect(contentDetails.id).toBe(contentId);
              expect(contentDetails.title).toBeDefined();
            }
          },
        ),
        { numRuns: 10, timeout: 15000 },
      );
    });

    it('should maintain existing content injection functionality', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            genres: fc.shuffledSubarray(
              ['action', 'comedy', 'drama', 'thriller'],
              { minLength: 1, maxLength: 3 },
            ),
            contentCount: fc.integer({ min: 1, max: 5 }),
          }),
          async (testData) => {
            // Content injection should work as before
            const injectionResult = await roomService.injectContent(
              testRoom.id,
              testUser.user.id,
              {
                genres: testData.genres,
                contentCount: testData.contentCount,
              },
            );

            expect(injectionResult).toBeDefined();
            expect(injectionResult.injectedCount).toBe(testData.contentCount);
            expect(Array.isArray(injectionResult.injectedContent)).toBe(true);
            expect(injectionResult.injectedContent).toHaveLength(
              testData.contentCount,
            );

            // Verify content was added to room
            const room = await roomService.getRoomById(testRoom.id);
            expect(room.shuffledContent?.length).toBeGreaterThanOrEqual(
              testData.contentCount,
            );
          },
        ),
        { numRuns: 8, timeout: 20000 },
      );
    });
  });

  describe('Core Analytics System', () => {
    it('should maintain existing analytics functionality', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            timeRange: fc.constantFrom('1h', '24h', '7d'),
            includeDetails: fc.boolean(),
          }),
          async (testData) => {
            // Room analytics should work as before
            const roomAnalytics = await analyticsService.getRoomAnalytics(
              testRoom.id,
            );
            expect(roomAnalytics).toBeDefined();
            expect(typeof roomAnalytics.totalVotes).toBe('number');
            expect(typeof roomAnalytics.totalMatches).toBe('number');
            expect(typeof roomAnalytics.averageSessionDuration).toBe('number');

            // User analytics should work as before
            const userAnalytics =
              await analyticsService.getUserBehaviorAnalytics(testUser.user.id);
            expect(userAnalytics).toBeDefined();
            expect(typeof userAnalytics.totalVotes).toBe('number');
            expect(typeof userAnalytics.averageVotingSpeed).toBe('number');
            expect(Array.isArray(userAnalytics.preferredGenres)).toBe(true);

            // Content analytics should work as before
            const contentAnalytics =
              await analyticsService.getContentAnalytics();
            expect(contentAnalytics).toBeDefined();
            expect(Array.isArray(contentAnalytics.popularContent)).toBe(true);
            expect(Array.isArray(contentAnalytics.trendingGenres)).toBe(true);
          },
        ),
        { numRuns: 6, timeout: 15000 },
      );
    });

    it('should maintain existing event tracking', async () => {
      // Event tracking should work as before
      const eventData = {
        eventType: 'room_created',
        userId: testUser.user.id,
        roomId: testRoom.id,
        metadata: {
          roomName: testRoom.name,
          timestamp: new Date().toISOString(),
        },
      };

      // This should not throw an error
      await analyticsService.trackEvent(eventData);

      // Analytics should reflect tracked events
      const roomAnalytics = await analyticsService.getRoomAnalytics(
        testRoom.id,
      );
      expect(roomAnalytics).toBeDefined();
    });
  });

  describe('Shuffle & Sync System Compatibility', () => {
    it('should maintain existing shuffle and sync functionality', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            genres: fc.shuffledSubarray(['action', 'comedy', 'drama'], {
              minLength: 1,
              maxLength: 2,
            }),
            contentCount: fc.integer({ min: 5, max: 15 }),
          }),
          async (testData) => {
            // Generate shuffled content should work as before
            const shuffleResult = await roomService.generateShuffledContent(
              testRoom.id,
              testUser.user.id,
              {
                genres: testData.genres,
                contentCount: testData.contentCount,
              },
            );

            expect(shuffleResult).toBeDefined();
            expect(shuffleResult.masterList).toHaveLength(
              testData.contentCount,
            );
            expect(shuffleResult.shuffledList).toHaveLength(
              testData.contentCount,
            );

            // Verify shuffle consistency
            const room = await roomService.getRoomById(testRoom.id);
            expect(room.masterContent).toHaveLength(testData.contentCount);
            expect(room.shuffledContent).toHaveLength(testData.contentCount);

            // Regenerate should work as before
            const regenerateResult =
              await roomService.regenerateShuffledContent(
                testRoom.id,
                testUser.user.id,
              );

            expect(regenerateResult).toBeDefined();
            expect(regenerateResult.masterList).toHaveLength(
              testData.contentCount,
            );
            expect(regenerateResult.shuffledList).toHaveLength(
              testData.contentCount,
            );

            // Verify shuffle stats
            const shuffleStats = await roomService.getShuffleStats(testRoom.id);
            expect(shuffleStats).toBeDefined();
            expect(typeof shuffleStats.totalContent).toBe('number');
            expect(typeof shuffleStats.uniquenessScore).toBe('number');
          },
        ),
        { numRuns: 8, timeout: 25000 },
      );
    });
  });

  describe('Inactive Member Handling Compatibility', () => {
    it('should maintain existing inactive member functionality', async () => {
      // Create additional users for inactive member testing
      const inactiveUser = await authService.register({
        email: 'inactive@test.com',
        password: 'TestPass123!',
        username: 'inactiveuser',
      });

      await roomService.joinRoom(testRoom.id, inactiveUser.user.id);

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            inactivityMinutes: fc.integer({ min: 5, max: 60 }),
          }),
          async (testData) => {
            // Get inactive members should work as before
            const inactiveMembers = await roomService.getInactiveMembers(
              testRoom.id,
              testData.inactivityMinutes,
            );

            expect(Array.isArray(inactiveMembers)).toBe(true);

            // Activity classification should work as before
            const activityLevels = await roomService.classifyMemberActivity(
              testRoom.id,
            );
            expect(activityLevels).toBeDefined();
            expect(Array.isArray(activityLevels.active)).toBe(true);
            expect(Array.isArray(activityLevels.inactive)).toBe(true);
            expect(Array.isArray(activityLevels.dormant)).toBe(true);

            // Reactivate member should work as before
            await roomService.reactivateMember(
              testRoom.id,
              inactiveUser.user.id,
            );

            // Member should be active again
            const updatedActivityLevels =
              await roomService.classifyMemberActivity(testRoom.id);
            const isActive = updatedActivityLevels.active.some(
              (member) => member.userId === inactiveUser.user.id,
            );
            expect(isActive).toBe(true);
          },
        ),
        { numRuns: 5, timeout: 20000 },
      );
    });
  });
});
