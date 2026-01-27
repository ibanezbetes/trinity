import '../../test-setup-integration';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { AuthService } from '../../modules/auth/auth.service';
import { RoomService } from '../../modules/room/room.service';
import { RoomAutomationService } from '../../modules/room-automation/room-automation.service';
import { RoomModerationService } from '../../modules/room-moderation/room-moderation.service';
import { RoomThemeService } from '../../modules/room-theme/room-theme.service';
import { RoomScheduleService } from '../../modules/room-schedule/room-schedule.service';
import { PermissionService } from '../../modules/permission/permission.service';
import { RealtimeService } from '../../modules/realtime/realtime.service';
import { AnalyticsService } from '../../modules/analytics/analytics.service';
import * as fc from 'fast-check';

describe('Advanced Features Integration Tests', () => {
  let app: INestApplication;
  let authService: AuthService;
  let roomService: RoomService;
  let automationService: RoomAutomationService;
  let moderationService: RoomModerationService;
  let themeService: RoomThemeService;
  let scheduleService: RoomScheduleService;
  let permissionService: PermissionService;
  let realtimeService: RealtimeService;
  let analyticsService: AnalyticsService;

  let testUser: any;
  let testRoom: any;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get services
    authService = moduleFixture.get<AuthService>(AuthService);
    roomService = moduleFixture.get<RoomService>(RoomService);
    automationService = moduleFixture.get<RoomAutomationService>(
      RoomAutomationService,
    );
    moderationService = moduleFixture.get<RoomModerationService>(
      RoomModerationService,
    );
    themeService = moduleFixture.get<RoomThemeService>(RoomThemeService);
    scheduleService =
      moduleFixture.get<RoomScheduleService>(RoomScheduleService);
    permissionService = moduleFixture.get<PermissionService>(PermissionService);
    realtimeService = moduleFixture.get<RealtimeService>(RealtimeService);
    analyticsService = moduleFixture.get<AnalyticsService>(AnalyticsService);

    // Create test user and room
    testUser = await authService.register({
      email: 'integration@test.com',
      password: 'TestPass123!',
      username: 'integrationuser',
    });

    authToken = testUser.accessToken;

    testRoom = await roomService.createRoom(testUser.user.id, {
      name: 'Integration Test Room',
      description: 'Room for integration testing',
      isPrivate: false,
      maxMembers: 10,
    });
  }, 15000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 15000);

  describe('Complete Room Lifecycle with Advanced Features', () => {
    it('should handle complete room lifecycle with all advanced features', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            automationLevel: fc.constantFrom(
              'basic',
              'intermediate',
              'advanced',
            ),
            themeCategory: fc.constantFrom(
              'movie_genres',
              'seasonal',
              'minimal',
            ),
            scheduleRecurrence: fc.constantFrom('none', 'daily', 'weekly'),
            customRoleName: fc.string({ minLength: 3, maxLength: 20 }),
          }),
          async (testData) => {
            // 1. Configure room automation
            const automationConfig =
              await automationService.createAutomationConfig(
                testRoom.id,
                testUser.user.id,
                {
                  automationLevel: testData.automationLevel as any,
                  isEnabled: true,
                },
              );

            expect(automationConfig).toBeDefined();
            expect(automationConfig.automationLevel).toBe(
              testData.automationLevel,
            );

            // 2. Apply room theme
            const theme = await themeService.createTheme(testUser.user.id, {
              name: `Test Theme ${Date.now()}`,
              category: testData.themeCategory as any,
              isPublic: false,
              colorScheme: {
                primary: '#FF6B6B',
                secondary: '#4ECDC4',
                background: '#45B7D1',
                text: '#FFFFFF',
              },
            });

            await themeService.applyThemeToRoom(
              testRoom.id,
              theme.id,
              testUser.user.id,
            );

            // 3. Create custom role and assign permissions
            const customRole = await moderationService.createCustomRole(
              testRoom.id,
              testUser.user.id,
              {
                name: testData.customRoleName,
                permissions: ['VOTE', 'CHAT', 'SUGGEST_CONTENT'],
                color: '#FF6B6B',
                priority: 5,
              },
            );

            expect(customRole).toBeDefined();
            expect(customRole.name).toBe(testData.customRoleName);

            // 4. Create room schedule
            const schedule = await scheduleService.createSchedule(
              testUser.user.id,
              {
                roomId: testRoom.id,
                title: 'Integration Test Session',
                description: 'Automated test session',
                startTime: new Date(Date.now() + 3600000), // 1 hour from now
                duration: 60,
                recurrence: {
                  type: testData.scheduleRecurrence as any,
                  interval: 1,
                },
                timezone: 'UTC',
              },
            );

            expect(schedule).toBeDefined();
            expect(schedule.recurrence.type).toBe(testData.scheduleRecurrence);

            // 5. Verify permissions work correctly
            const hasPermission = await permissionService.checkPermission(
              testUser.user.id,
              testRoom.id,
              'VOTE',
            );

            expect(hasPermission).toBe(true);

            // 6. Test automation optimization
            const optimizationDecisions = await automationService.optimizeRoom(
              testRoom.id,
            );
            expect(Array.isArray(optimizationDecisions)).toBe(true);

            // 7. Generate smart recommendations
            const recommendations =
              await automationService.generateSmartRecommendations(testRoom.id);
            expect(Array.isArray(recommendations)).toBe(true);

            // 8. Verify analytics tracking
            const roomAnalytics = await analyticsService.getRoomAnalytics(
              testRoom.id,
            );
            expect(roomAnalytics).toBeDefined();

            // 9. Test real-time notifications (mock)
            const notificationSent = await realtimeService.notifyRoom(
              testRoom.id,
              'test',
              {
                message: 'Integration test notification',
              },
            );
            // Should not throw error even if WebSocket fails

            // Cleanup
            await scheduleService.deleteSchedule(schedule.id, testUser.user.id);
            await themeService.removeThemeFromRoom(
              testRoom.id,
              testUser.user.id,
            );
            await moderationService.deleteCustomRole(
              testRoom.id,
              customRole.id,
              testUser.user.id,
            );
          },
        ),
        { numRuns: 10, timeout: 30000 },
      );
    });
  });

  describe('Cross-Feature Integration Tests', () => {
    it('should handle automation with theme changes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            themeColors: fc.record({
              primary: fc
                .hexaString({ minLength: 6, maxLength: 6 })
                .map((s) => `#${s}`),
              secondary: fc
                .hexaString({ minLength: 6, maxLength: 6 })
                .map((s) => `#${s}`),
            }),
            automationEnabled: fc.boolean(),
          }),
          async (testData) => {
            // Enable automation
            await automationService.createAutomationConfig(
              testRoom.id,
              testUser.user.id,
              {
                isEnabled: testData.automationEnabled,
                automationLevel: 'intermediate',
              },
            );

            // Create and apply theme
            const theme = await themeService.createTheme(testUser.user.id, {
              name: `Integration Theme ${Date.now()}`,
              category: 'custom',
              isPublic: false,
              colorScheme: {
                primary: testData.themeColors.primary,
                secondary: testData.themeColors.secondary,
                background: '#000000',
                text: '#FFFFFF',
              },
            });

            await themeService.applyThemeToRoom(
              testRoom.id,
              theme.id,
              testUser.user.id,
            );

            // Verify theme is applied
            const roomTheme = await themeService.getRoomTheme(testRoom.id);
            expect(roomTheme).toBeDefined();
            expect(roomTheme?.colorScheme.primary).toBe(
              testData.themeColors.primary,
            );

            // If automation is enabled, it should still work with theme changes
            if (testData.automationEnabled) {
              const recommendations =
                await automationService.generateSmartRecommendations(
                  testRoom.id,
                );
              expect(Array.isArray(recommendations)).toBe(true);
            }

            // Cleanup
            await themeService.removeThemeFromRoom(
              testRoom.id,
              testUser.user.id,
            );
          },
        ),
        { numRuns: 15, timeout: 20000 },
      );
    });

    it('should handle permission changes with moderation actions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roleName: fc.string({ minLength: 3, maxLength: 15 }),
            permissions: fc.shuffledSubarray(
              ['VOTE', 'CHAT', 'SUGGEST_CONTENT', 'MODERATE'],
              { minLength: 1, maxLength: 3 },
            ),
            moderationAction: fc.constantFrom('warn', 'mute'),
          }),
          async (testData) => {
            // Create custom role
            const role = await moderationService.createCustomRole(
              testRoom.id,
              testUser.user.id,
              {
                name: testData.roleName,
                permissions: testData.permissions as any[],
                color: '#FF0000',
                priority: 3,
              },
            );

            // Verify permissions
            for (const permission of testData.permissions) {
              const hasPermission = await permissionService.checkPermission(
                testUser.user.id,
                testRoom.id,
                permission as any,
              );
              expect(hasPermission).toBe(true);
            }

            // Test moderation action (should work with custom roles)
            if (testData.moderationAction === 'warn') {
              const warning = await moderationService.warnMember(
                testRoom.id,
                testUser.user.id,
                testUser.user.id,
                'Integration test warning',
              );
              expect(warning).toBeDefined();
            } else if (testData.moderationAction === 'mute') {
              const mute = await moderationService.muteMember(
                testRoom.id,
                testUser.user.id,
                testUser.user.id,
                30, // 30 minutes
              );
              expect(mute).toBeDefined();
            }

            // Cleanup
            await moderationService.deleteCustomRole(
              testRoom.id,
              role.id,
              testUser.user.id,
            );
          },
        ),
        { numRuns: 12, timeout: 25000 },
      );
    });

    it('should handle scheduled sessions with automation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sessionDuration: fc.integer({ min: 30, max: 180 }),
            automationLevel: fc.constantFrom(
              'basic',
              'intermediate',
              'advanced',
            ),
            reminderMinutes: fc.constantFrom(5, 15, 30, 60),
          }),
          async (testData) => {
            // Enable automation
            const automationConfig =
              await automationService.createAutomationConfig(
                testRoom.id,
                testUser.user.id,
                {
                  automationLevel: testData.automationLevel as any,
                  isEnabled: true,
                },
              );

            // Create scheduled session
            const schedule = await scheduleService.createSchedule(
              testUser.user.id,
              {
                roomId: testRoom.id,
                title: 'Automated Session Test',
                description: 'Testing automation with scheduling',
                startTime: new Date(Date.now() + 7200000), // 2 hours from now
                duration: testData.sessionDuration,
                recurrence: { type: 'none' },
                timezone: 'UTC',
                reminders: [testData.reminderMinutes],
              },
            );

            expect(schedule).toBeDefined();
            expect(schedule.duration).toBe(testData.sessionDuration);

            // Verify automation still works with scheduled sessions
            const recommendations =
              await automationService.generateSmartRecommendations(testRoom.id);
            expect(Array.isArray(recommendations)).toBe(true);

            // Verify performance metrics are tracked
            const performance =
              await automationService.getAutomationPerformance(testRoom.id);
            expect(performance).toBeDefined();

            // Cleanup
            await scheduleService.deleteSchedule(schedule.id, testUser.user.id);
          },
        ),
        { numRuns: 8, timeout: 20000 },
      );
    });
  });

  describe('Performance Testing with Advanced Features', () => {
    it('should maintain performance with multiple advanced features enabled', async () => {
      const startTime = Date.now();

      // Enable all advanced features
      const automationConfig = await automationService.createAutomationConfig(
        testRoom.id,
        testUser.user.id,
        {
          automationLevel: 'advanced',
          isEnabled: true,
        },
      );

      const theme = await themeService.createTheme(testUser.user.id, {
        name: 'Performance Test Theme',
        category: 'custom',
        isPublic: false,
        colorScheme: {
          primary: '#FF6B6B',
          secondary: '#4ECDC4',
          background: '#45B7D1',
          text: '#FFFFFF',
        },
      });

      await themeService.applyThemeToRoom(
        testRoom.id,
        theme.id,
        testUser.user.id,
      );

      const customRole = await moderationService.createCustomRole(
        testRoom.id,
        testUser.user.id,
        {
          name: 'PerformanceTestRole',
          permissions: ['VOTE', 'CHAT', 'SUGGEST_CONTENT'],
          color: '#00FF00',
          priority: 4,
        },
      );

      const schedule = await scheduleService.createSchedule(testUser.user.id, {
        roomId: testRoom.id,
        title: 'Performance Test Session',
        description: 'Testing performance with all features',
        startTime: new Date(Date.now() + 3600000),
        duration: 90,
        recurrence: { type: 'none' },
        timezone: 'UTC',
      });

      // Measure performance of key operations
      const operationStartTime = Date.now();

      const [
        recommendations,
        roomAnalytics,
        permissionCheck,
        optimizationDecisions,
      ] = await Promise.all([
        automationService.generateSmartRecommendations(testRoom.id),
        analyticsService.getRoomAnalytics(testRoom.id),
        permissionService.checkPermission(
          testUser.user.id,
          testRoom.id,
          'VOTE',
        ),
        automationService.optimizeRoom(testRoom.id),
      ]);

      const operationTime = Date.now() - operationStartTime;
      const totalTime = Date.now() - startTime;

      // Performance assertions
      expect(operationTime).toBeLessThan(5000); // Operations should complete within 5 seconds
      expect(totalTime).toBeLessThan(10000); // Total setup should complete within 10 seconds

      expect(recommendations).toBeDefined();
      expect(roomAnalytics).toBeDefined();
      expect(permissionCheck).toBe(true);
      expect(Array.isArray(optimizationDecisions)).toBe(true);

      // Cleanup
      await Promise.all([
        scheduleService.deleteSchedule(schedule.id, testUser.user.id),
        themeService.removeThemeFromRoom(testRoom.id, testUser.user.id),
        moderationService.deleteCustomRole(
          testRoom.id,
          customRole.id,
          testUser.user.id,
        ),
      ]);
    });

    it('should handle concurrent operations efficiently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 8 }),
          async (concurrentOperations) => {
            const operations = [];

            for (let i = 0; i < concurrentOperations; i++) {
              operations.push(
                automationService.generateSmartRecommendations(testRoom.id),
              );
            }

            const startTime = Date.now();
            const results = await Promise.all(operations);
            const executionTime = Date.now() - startTime;

            // Should handle concurrent operations efficiently
            expect(executionTime).toBeLessThan(3000 * concurrentOperations); // Linear scaling tolerance
            expect(results).toHaveLength(concurrentOperations);

            results.forEach((result) => {
              expect(Array.isArray(result)).toBe(true);
            });
          },
        ),
        { numRuns: 5, timeout: 30000 },
      );
    });
  });

  describe('Backward Compatibility Tests', () => {
    it('should maintain compatibility with existing rooms without advanced features', async () => {
      // Create a basic room without advanced features
      const basicRoom = await roomService.createRoom(testUser.user.id, {
        name: 'Basic Compatibility Room',
        description: 'Testing backward compatibility',
        isPrivate: false,
        maxMembers: 5,
      });

      // Basic room operations should still work
      const roomDetails = await roomService.getRoomById(basicRoom.id);
      expect(roomDetails).toBeDefined();
      expect(roomDetails.name).toBe('Basic Compatibility Room');

      // Advanced features should gracefully handle rooms without configuration
      const automationConfig = await automationService.getAutomationConfig(
        basicRoom.id,
      );
      expect(automationConfig).toBeNull();

      const roomTheme = await themeService.getRoomTheme(basicRoom.id);
      expect(roomTheme).toBeNull();

      // Should be able to add advanced features to existing rooms
      const newAutomationConfig =
        await automationService.createAutomationConfig(
          basicRoom.id,
          testUser.user.id,
          {
            automationLevel: 'basic',
            isEnabled: true,
          },
        );

      expect(newAutomationConfig).toBeDefined();
      expect(newAutomationConfig.roomId).toBe(basicRoom.id);

      // Cleanup
      await roomService.deleteRoom(basicRoom.id, testUser.user.id);
    });

    it('should handle API requests without breaking existing functionality', async () => {
      // Test that new API endpoints don't interfere with existing ones
      const response = await request(app.getHttpServer())
        .get(`/rooms/${testRoom.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.id).toBe(testRoom.id);

      // Test that advanced feature endpoints work alongside basic ones
      const automationResponse = await request(app.getHttpServer())
        .post(`/room-automation/${testRoom.id}/config`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          automationLevel: 'basic',
          isEnabled: true,
        })
        .expect(201);

      expect(automationResponse.body).toBeDefined();
      expect(automationResponse.body.automationLevel).toBe('basic');

      // Original room functionality should still work
      const roomResponse = await request(app.getHttpServer())
        .get(`/rooms/${testRoom.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(roomResponse.body.id).toBe(testRoom.id);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle service failures gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            invalidRoomId: fc.string({ minLength: 10, maxLength: 20 }),
            invalidUserId: fc.string({ minLength: 10, maxLength: 20 }),
          }),
          async (testData) => {
            // Test with invalid room ID
            await expect(
              automationService.getAutomationConfig(testData.invalidRoomId),
            ).resolves.toBeNull();

            await expect(
              themeService.getRoomTheme(testData.invalidRoomId),
            ).resolves.toBeNull();

            // Test with invalid user ID for permission checks
            const hasPermission = await permissionService.checkPermission(
              testData.invalidUserId,
              testRoom.id,
              'VOTE',
            );
            expect(hasPermission).toBe(false);

            // Real-time service should handle failures gracefully
            await expect(
              realtimeService.notifyRoom(testData.invalidRoomId, 'test', {
                message: 'test',
              }),
            ).resolves.not.toThrow();
          },
        ),
        { numRuns: 10, timeout: 15000 },
      );
    });

    it('should maintain data consistency during failures', async () => {
      // Create automation config
      const automationConfig = await automationService.createAutomationConfig(
        testRoom.id,
        testUser.user.id,
        {
          automationLevel: 'intermediate',
          isEnabled: true,
        },
      );

      // Simulate partial failure scenario
      try {
        // This should succeed
        const theme = await themeService.createTheme(testUser.user.id, {
          name: 'Consistency Test Theme',
          category: 'custom',
          isPublic: false,
          colorScheme: {
            primary: '#FF0000',
            secondary: '#00FF00',
            background: '#0000FF',
            text: '#FFFFFF',
          },
        });

        await themeService.applyThemeToRoom(
          testRoom.id,
          theme.id,
          testUser.user.id,
        );

        // Verify both automation and theme are properly configured
        const retrievedConfig = await automationService.getAutomationConfig(
          testRoom.id,
        );
        const retrievedTheme = await themeService.getRoomTheme(testRoom.id);

        expect(retrievedConfig).toBeDefined();
        expect(retrievedConfig?.id).toBe(automationConfig.id);
        expect(retrievedTheme).toBeDefined();
        expect(retrievedTheme?.id).toBe(theme.id);

        // Cleanup
        await themeService.removeThemeFromRoom(testRoom.id, testUser.user.id);
      } catch (error) {
        // Even if theme operations fail, automation should remain intact
        const retrievedConfig = await automationService.getAutomationConfig(
          testRoom.id,
        );
        expect(retrievedConfig).toBeDefined();
        expect(retrievedConfig?.id).toBe(automationConfig.id);
      }
    });
  });
});
