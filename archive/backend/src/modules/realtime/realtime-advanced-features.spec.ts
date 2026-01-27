import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeService } from './realtime.service';
import { RealtimeGateway } from './realtime.gateway';
import * as fc from 'fast-check';

describe('RealtimeService - Advanced Features Integration', () => {
  let service: RealtimeService;
  let gateway: RealtimeGateway;

  beforeEach(async () => {
    const mockGateway = {
      notifyRoleAssignment: jest.fn(),
      notifyModerationAction: jest.fn(),
      notifyScheduleEvent: jest.fn(),
      notifyThemeChange: jest.fn(),
      notifyRoomSettingsChange: jest.fn(),
    };

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

  describe('Property-Based Tests for Advanced Features', () => {
    /**
     * Property 1: Role Assignment Notifications
     * For any valid role assignment data, the notification should be sent without errors
     */
    it('should handle role assignment notifications for all valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // roomId
          fc.string({ minLength: 1 }), // targetUserId
          fc.string({ minLength: 1 }), // roleId
          fc.string({ minLength: 1 }), // roleName
          fc.string({ minLength: 1 }), // assignedBy
          fc.constantFrom('assigned', 'removed'), // action
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
              action: action as 'assigned' | 'removed',
            };

            await expect(
              service.notifyRoleAssignment(roomId, roleData),
            ).resolves.not.toThrow();

            expect(gateway.notifyRoleAssignment).toHaveBeenCalledWith(
              roomId,
              expect.objectContaining({
                type: 'roleAssignment',
                targetUserId,
                roleId,
                roleName,
                assignedBy,
                action,
              }),
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Property 2: Moderation Action Notifications
     * For any valid moderation action, the notification should be sent correctly
     */
    it('should handle moderation action notifications for all valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // roomId
          fc.string({ minLength: 1 }), // targetUserId
          fc.string({ minLength: 1 }), // moderatorId
          fc.constantFrom('WARN', 'MUTE', 'TEMPORARY_BAN', 'PERMANENT_BAN'), // actionType
          fc.string({ minLength: 1 }), // reason
          fc.option(fc.integer({ min: 1, max: 10080 })), // duration (minutes)
          async (
            roomId,
            targetUserId,
            moderatorId,
            actionType,
            reason,
            duration,
          ) => {
            const expiresAt = duration
              ? new Date(Date.now() + duration * 60 * 1000).toISOString()
              : undefined;

            const moderationData = {
              targetUserId,
              moderatorId,
              actionType,
              reason,
              duration,
              expiresAt,
            };

            await expect(
              service.notifyModerationAction(roomId, moderationData),
            ).resolves.not.toThrow();

            expect(gateway.notifyModerationAction).toHaveBeenCalledWith(
              roomId,
              expect.objectContaining({
                type: 'moderationAction',
                targetUserId,
                moderatorId,
                actionType,
                reason,
                duration,
                expiresAt,
              }),
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Property 3: Schedule Event Notifications
     * For any valid schedule event, the notification should be sent correctly
     */
    it('should handle schedule event notifications for all valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // roomId
          fc.string({ minLength: 1 }), // scheduleId
          fc.string({ minLength: 1 }), // title
          fc.constantFrom('created', 'updated', 'cancelled', 'reminder'), // action
          fc.date({ min: new Date('2024-01-01'), max: new Date('2030-12-31') }), // startTime
          fc.option(fc.string({ minLength: 1 })), // message
          async (roomId, scheduleId, title, action, startTime, message) => {
            const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour later

            const scheduleData = {
              scheduleId,
              title,
              action: action as
                | 'created'
                | 'updated'
                | 'cancelled'
                | 'reminder',
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              message,
            };

            await expect(
              service.notifyScheduleEvent(roomId, scheduleData),
            ).resolves.not.toThrow();

            expect(gateway.notifyScheduleEvent).toHaveBeenCalledWith(
              roomId,
              expect.objectContaining({
                type: 'scheduleEvent',
                scheduleId,
                title,
                action,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                message,
              }),
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Property 4: Theme Change Notifications
     * For any valid theme change, the notification should be sent correctly
     */
    it('should handle theme change notifications for all valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // roomId
          fc.option(fc.string({ minLength: 1 })), // themeId
          fc.option(fc.string({ minLength: 1 })), // themeName
          fc.constantFrom('applied', 'removed', 'updated'), // action
          fc.string({ minLength: 1 }), // appliedBy
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
              action: action as 'applied' | 'removed' | 'updated',
              appliedBy,
              customizations,
            };

            await expect(
              service.notifyThemeChange(roomId, themeData),
            ).resolves.not.toThrow();

            expect(gateway.notifyThemeChange).toHaveBeenCalledWith(
              roomId,
              expect.objectContaining({
                type: 'themeChange',
                themeId,
                themeName,
                action,
                appliedBy,
                customizations,
              }),
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Property 5: Room Settings Change Notifications
     * For any valid room settings change, the notification should be sent correctly
     */
    it('should handle room settings change notifications for all valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // roomId
          fc.string({ minLength: 1 }), // settingKey
          fc.anything(), // oldValue
          fc.anything(), // newValue
          fc.string({ minLength: 1 }), // changedBy
          fc.constantFrom(
            'privacy',
            'consensus',
            'capacity',
            'timeout',
            'other',
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
              category: category as
                | 'privacy'
                | 'consensus'
                | 'capacity'
                | 'timeout'
                | 'other',
            };

            await expect(
              service.notifyRoomSettingsChange(roomId, settingsData),
            ).resolves.not.toThrow();

            expect(gateway.notifyRoomSettingsChange).toHaveBeenCalledWith(
              roomId,
              expect.objectContaining({
                type: 'roomSettingsChange',
                settingKey,
                oldValue,
                newValue,
                changedBy,
                category,
              }),
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Property 6: Error Handling Resilience
     * Real-time notifications should not throw errors even when gateway fails
     */
    it('should handle gateway errors gracefully without throwing', async () => {
      const failingGateway = {
        notifyRoleAssignment: jest.fn().mockImplementation(() => {
          throw new Error('Gateway error');
        }),
        notifyModerationAction: jest.fn().mockImplementation(() => {
          throw new Error('Gateway error');
        }),
        notifyScheduleEvent: jest.fn().mockImplementation(() => {
          throw new Error('Gateway error');
        }),
        notifyThemeChange: jest.fn().mockImplementation(() => {
          throw new Error('Gateway error');
        }),
        notifyRoomSettingsChange: jest.fn().mockImplementation(() => {
          throw new Error('Gateway error');
        }),
      };

      const failingService = new RealtimeService(failingGateway as any);

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // roomId
          async (roomId) => {
            // Test all notification methods don't throw even when gateway fails
            await expect(
              failingService.notifyRoleAssignment(roomId, {
                targetUserId: 'user1',
                roleId: 'role1',
                roleName: 'Test Role',
                assignedBy: 'admin1',
                action: 'assigned',
              }),
            ).resolves.not.toThrow();

            await expect(
              failingService.notifyModerationAction(roomId, {
                targetUserId: 'user1',
                moderatorId: 'mod1',
                actionType: 'WARN',
                reason: 'Test warning',
              }),
            ).resolves.not.toThrow();

            await expect(
              failingService.notifyScheduleEvent(roomId, {
                scheduleId: 'schedule1',
                title: 'Test Schedule',
                action: 'created',
                startTime: new Date().toISOString(),
                endTime: new Date(Date.now() + 3600000).toISOString(),
              }),
            ).resolves.not.toThrow();

            await expect(
              failingService.notifyThemeChange(roomId, {
                themeId: 'theme1',
                themeName: 'Test Theme',
                action: 'applied',
                appliedBy: 'user1',
              }),
            ).resolves.not.toThrow();

            await expect(
              failingService.notifyRoomSettingsChange(roomId, {
                settingKey: 'maxMembers',
                oldValue: 10,
                newValue: 20,
                changedBy: 'admin1',
                category: 'capacity',
              }),
            ).resolves.not.toThrow();
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe('Integration Tests', () => {
    it('should maintain consistent notification format across all advanced features', async () => {
      const roomId = 'test-room-123';

      // Test role assignment format
      await service.notifyRoleAssignment(roomId, {
        targetUserId: 'user1',
        roleId: 'role1',
        roleName: 'Test Role',
        assignedBy: 'admin1',
        action: 'assigned',
      });

      expect(gateway.notifyRoleAssignment).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({
          type: 'roleAssignment',
          targetUserId: 'user1',
          roleId: 'role1',
          roleName: 'Test Role',
          assignedBy: 'admin1',
          action: 'assigned',
        }),
      );
    });

    it('should handle concurrent notifications without interference', async () => {
      const roomId = 'test-room-concurrent';

      // Send multiple notifications concurrently
      const promises = [
        service.notifyRoleAssignment(roomId, {
          targetUserId: 'user1',
          roleId: 'role1',
          roleName: 'Role 1',
          assignedBy: 'admin1',
          action: 'assigned',
        }),
        service.notifyModerationAction(roomId, {
          targetUserId: 'user2',
          moderatorId: 'mod1',
          actionType: 'WARN',
          reason: 'Warning',
        }),
        service.notifyThemeChange(roomId, {
          themeId: 'theme1',
          themeName: 'Theme 1',
          action: 'applied',
          appliedBy: 'user3',
        }),
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();

      // All notifications should have been sent
      expect(gateway.notifyRoleAssignment).toHaveBeenCalledTimes(1);
      expect(gateway.notifyModerationAction).toHaveBeenCalledTimes(1);
      expect(gateway.notifyThemeChange).toHaveBeenCalledTimes(1);
    });
  });
});
