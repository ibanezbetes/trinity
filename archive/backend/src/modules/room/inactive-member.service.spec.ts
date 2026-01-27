import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fc from 'fast-check';
import {
  InactiveMemberService,
  ActivityLevel,
  InactivityConfig,
} from './inactive-member.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { MemberService } from './member.service';
import { InteractionService } from '../interaction/interaction.service';
import {
  Member,
  MemberRole,
  MemberStatus,
} from '../../domain/entities/room.entity';

describe('InactiveMemberService', () => {
  let service: InactiveMemberService;
  let dynamoDBService: jest.Mocked<DynamoDBService>;
  let memberService: jest.Mocked<MemberService>;
  let interactionService: jest.Mocked<InteractionService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockDynamoDBService = {
      putItem: jest.fn(),
      getItem: jest.fn(),
      query: jest.fn(),
      conditionalUpdate: jest.fn(),
      batchWrite: jest.fn(),
      deleteItem: jest.fn(),
    };

    const mockMemberService = {
      getRoomMembers: jest.fn(),
      getMember: jest.fn(),
      updateMemberActivity: jest.fn(),
      markMemberInactive: jest.fn(),
    };

    const mockInteractionService = {
      checkUnanimousVote: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue: any) => {
        const config = {
          INACTIVE_WARNING_MINUTES: 15,
          INACTIVE_THRESHOLD_MINUTES: 30,
          INACTIVE_EXCLUSION_MINUTES: 60,
          ENABLE_INACTIVE_CLEANUP: true,
          ENABLE_INACTIVE_NOTIFICATIONS: true,
        };
        return config[key] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InactiveMemberService,
        { provide: DynamoDBService, useValue: mockDynamoDBService },
        { provide: MemberService, useValue: mockMemberService },
        { provide: InteractionService, useValue: mockInteractionService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<InactiveMemberService>(InactiveMemberService);
    dynamoDBService = module.get(DynamoDBService);
    memberService = module.get(MemberService);
    interactionService = module.get(InteractionService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Property-Based Tests', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    /**
     * **Feature: trinity-mvp, Property 6: Manejo de miembros inactivos**
     * **Valida: Requisitos 3.4**
     *
     * Para cualquier sala con miembros inactivos, sus votos deben excluirse de los
     * cálculos de match después del período de timeout configurado
     */
    it('should exclude inactive members from voting calculations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 3,
            maxLength: 8,
          }), // userIds
          fc.array(fc.integer({ min: 0, max: 120 }), {
            minLength: 3,
            maxLength: 8,
          }), // minutesInactive
          async (roomId, userIds, minutesInactive) => {
            // Reset mocks for this iteration
            jest.clearAllMocks();

            const numUsers = Math.min(userIds.length, minutesInactive.length);
            const testUserIds = userIds.slice(0, numUsers);
            const testMinutesInactive = minutesInactive.slice(0, numUsers);

            // Arrange: Create members with different activity levels
            const now = new Date();
            const mockMembers: Member[] = testUserIds.map((userId, index) => {
              const minutesAgo = testMinutesInactive[index];
              const lastActivityAt = new Date(
                now.getTime() - minutesAgo * 60 * 1000,
              );

              return {
                userId,
                roomId,
                role: index === 0 ? MemberRole.CREATOR : MemberRole.MEMBER,
                status: MemberStatus.ACTIVE,
                shuffledList: ['media1', 'media2', 'media3'],
                currentIndex: 0,
                lastActivityAt,
                joinedAt: new Date(),
              };
            });

            memberService.getRoomMembers.mockResolvedValue(mockMembers);

            // Act: Get active members for voting
            const activeMembersForVoting =
              await service.getActiveMembersForVoting(roomId);

            // Assert: Verify inactive member exclusion logic
            const expectedActiveMembers = mockMembers.filter(
              (member, index) => {
                const minutesAgo = testMinutesInactive[index];
                // Members inactive for more than 30 minutes should be excluded
                return minutesAgo < 30;
              },
            );

            expect(activeMembersForVoting).toHaveLength(
              expectedActiveMembers.length,
            );

            // Verify that all returned members are actually active
            activeMembersForVoting.forEach((activeMember) => {
              const originalMember = mockMembers.find(
                (m) => m.userId === activeMember.userId,
              );
              expect(originalMember).toBeDefined();

              const memberIndex = testUserIds.indexOf(activeMember.userId);
              const memberMinutesInactive = testMinutesInactive[memberIndex];

              // Should not be excluded from voting (less than 30 minutes inactive)
              expect(memberMinutesInactive).toBeLessThan(30);
            });

            // Verify excluded members are actually inactive
            const excludedUserIds = testUserIds.filter(
              (userId) =>
                !activeMembersForVoting.some(
                  (active) => active.userId === userId,
                ),
            );

            excludedUserIds.forEach((excludedUserId) => {
              const memberIndex = testUserIds.indexOf(excludedUserId);
              const memberMinutesInactive = testMinutesInactive[memberIndex];

              // Should be excluded from voting (30+ minutes inactive)
              expect(memberMinutesInactive).toBeGreaterThanOrEqual(30);
            });
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should correctly classify member activity levels', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 20 }), // userId
          fc.integer({ min: 0, max: 180 }), // minutesInactive
          async (roomId, userId, minutesInactive) => {
            // Reset mocks for this iteration
            jest.clearAllMocks();

            // Arrange: Create member with specific inactivity time
            const now = new Date();
            const lastActivityAt = new Date(
              now.getTime() - minutesInactive * 60 * 1000,
            );

            const mockMember: Member = {
              userId,
              roomId,
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
              shuffledList: ['media1', 'media2'],
              currentIndex: 0,
              lastActivityAt,
              joinedAt: new Date(),
            };

            memberService.getMember.mockResolvedValue(mockMember);

            // Act: Get member activity status
            const activityStatus = await service.getMemberActivityStatus(
              roomId,
              userId,
            );

            // Assert: Verify correct activity level classification
            expect(activityStatus).toBeDefined();
            expect(activityStatus!.userId).toBe(userId);
            expect(activityStatus!.minutesSinceActivity).toBe(minutesInactive);

            // Verify activity level based on thresholds
            if (minutesInactive >= 60) {
              expect(activityStatus!.activityLevel).toBe(
                ActivityLevel.EXCLUDED,
              );
              expect(activityStatus!.shouldExcludeFromVoting).toBe(true);
              expect(activityStatus!.status).toBe(MemberStatus.INACTIVE);
            } else if (minutesInactive >= 30) {
              expect(activityStatus!.activityLevel).toBe(
                ActivityLevel.INACTIVE,
              );
              expect(activityStatus!.shouldExcludeFromVoting).toBe(true);
              expect(activityStatus!.status).toBe(MemberStatus.INACTIVE);
            } else if (minutesInactive >= 15) {
              expect(activityStatus!.activityLevel).toBe(ActivityLevel.WARNING);
              expect(activityStatus!.shouldExcludeFromVoting).toBe(false);
              expect(activityStatus!.status).toBe(MemberStatus.ACTIVE);
            } else {
              expect(activityStatus!.activityLevel).toBe(ActivityLevel.ACTIVE);
              expect(activityStatus!.shouldExcludeFromVoting).toBe(false);
              expect(activityStatus!.status).toBe(MemberStatus.ACTIVE);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain consistency in activity reporting across multiple checks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 2,
            maxLength: 6,
          }), // userIds
          fc.array(fc.integer({ min: 0, max: 90 }), {
            minLength: 2,
            maxLength: 6,
          }), // minutesInactive
          async (roomId, userIds, minutesInactive) => {
            // Reset mocks for this iteration
            jest.clearAllMocks();

            const numUsers = Math.min(userIds.length, minutesInactive.length);
            const testUserIds = userIds.slice(0, numUsers);
            const testMinutesInactive = minutesInactive.slice(0, numUsers);

            // Arrange: Create members with different activity levels
            const now = new Date();
            const mockMembers: Member[] = testUserIds.map((userId, index) => {
              const minutesAgo = testMinutesInactive[index];
              const lastActivityAt = new Date(
                now.getTime() - minutesAgo * 60 * 1000,
              );

              return {
                userId,
                roomId,
                role: index === 0 ? MemberRole.CREATOR : MemberRole.MEMBER,
                status: MemberStatus.ACTIVE,
                shuffledList: ['media1', 'media2'],
                currentIndex: 0,
                lastActivityAt,
                joinedAt: new Date(),
              };
            });

            memberService.getRoomMembers.mockResolvedValue(mockMembers);
            memberService.updateMemberActivity.mockResolvedValue();
            memberService.markMemberInactive.mockResolvedValue();

            // Act: Check room member activity multiple times
            const report1 = await service.checkRoomMemberActivity(roomId);
            const report2 = await service.checkRoomMemberActivity(roomId);

            // Assert: Reports should be consistent
            expect(report1.roomId).toBe(report2.roomId);
            expect(report1.totalMembers).toBe(report2.totalMembers);
            expect(report1.totalMembers).toBe(numUsers);

            // Verify member counts are logical
            const totalCounted =
              report1.activeMembers +
              report1.warningMembers +
              report1.inactiveMembers +
              report1.excludedMembers;
            expect(totalCounted).toBe(report1.totalMembers);

            // Verify activity levels match expected thresholds
            let expectedActive = 0;
            let expectedWarning = 0;
            let expectedInactive = 0;
            let expectedExcluded = 0;

            testMinutesInactive.forEach((minutes) => {
              if (minutes >= 60) {
                expectedExcluded++;
              } else if (minutes >= 30) {
                expectedInactive++;
              } else if (minutes >= 15) {
                expectedWarning++;
              } else {
                expectedActive++;
              }
            });

            expect(report1.activeMembers).toBe(expectedActive);
            expect(report1.warningMembers).toBe(expectedWarning);
            expect(report1.inactiveMembers).toBe(expectedInactive);
            expect(report1.excludedMembers).toBe(expectedExcluded);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should handle member reactivation correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.string({ minLength: 1, maxLength: 20 }), // userId
          fc.integer({ min: 30, max: 120 }), // initialMinutesInactive (inactive member)
          async (roomId, userId, initialMinutesInactive) => {
            // Reset mocks for this iteration
            jest.clearAllMocks();

            // Arrange: Create inactive member
            const now = new Date();
            const lastActivityAt = new Date(
              now.getTime() - initialMinutesInactive * 60 * 1000,
            );

            const mockMember: Member = {
              userId,
              roomId,
              role: MemberRole.MEMBER,
              status: MemberStatus.INACTIVE,
              shuffledList: ['media1'],
              currentIndex: 0,
              lastActivityAt,
              joinedAt: new Date(),
            };

            memberService.getMember.mockResolvedValue(mockMember);
            memberService.updateMemberActivity.mockResolvedValue();

            // Act: Reactivate member
            await service.reactivateMember(roomId, userId);

            // Assert: Member should be reactivated
            expect(memberService.getMember).toHaveBeenCalledWith(
              roomId,
              userId,
            );
            expect(memberService.updateMemberActivity).toHaveBeenCalledWith(
              roomId,
              userId,
            );

            // Verify it was called at least once (could be more due to internal logic)
            const callCount =
              memberService.updateMemberActivity.mock.calls.length;
            expect(callCount).toBeGreaterThanOrEqual(1);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should calculate room activity statistics correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 1,
            maxLength: 10,
          }), // userIds
          fc.array(fc.integer({ min: 0, max: 180 }), {
            minLength: 1,
            maxLength: 10,
          }), // minutesInactive
          async (roomId, userIds, minutesInactive) => {
            // Reset mocks for this iteration
            jest.clearAllMocks();

            const numUsers = Math.min(userIds.length, minutesInactive.length);
            const testUserIds = userIds.slice(0, numUsers);
            const testMinutesInactive = minutesInactive.slice(0, numUsers);

            // Arrange: Create members with different activity levels
            const now = new Date();
            const mockMembers: Member[] = testUserIds.map((userId, index) => {
              const minutesAgo = testMinutesInactive[index];
              const lastActivityAt = new Date(
                now.getTime() - minutesAgo * 60 * 1000,
              );

              return {
                userId,
                roomId,
                role: MemberRole.MEMBER,
                status: MemberStatus.ACTIVE,
                shuffledList: ['media1'],
                currentIndex: 0,
                lastActivityAt,
                joinedAt: new Date(),
              };
            });

            memberService.getRoomMembers.mockResolvedValue(mockMembers);

            // Act: Get room activity stats
            const stats = await service.getRoomActivityStats(roomId);

            // Assert: Verify statistics are calculated correctly
            expect(stats.totalMembers).toBe(numUsers);

            // Calculate expected values
            const activeMembers = testMinutesInactive.filter(
              (minutes) => minutes < 15,
            ).length;
            const inactiveMembers = testMinutesInactive.filter(
              (minutes) => minutes >= 15,
            ).length;

            expect(stats.activeMembers).toBe(activeMembers);
            expect(stats.inactiveMembers).toBe(inactiveMembers);

            // Verify total adds up
            expect(stats.activeMembers + stats.inactiveMembers).toBe(
              stats.totalMembers,
            );

            // Verify most inactive member calculation
            if (inactiveMembers > 0) {
              const maxInactiveMinutes = Math.max(
                ...testMinutesInactive.filter((m) => m >= 15),
              );
              expect(stats.mostInactiveMember).toBeDefined();
              expect(stats.mostInactiveMember!.minutesInactive).toBe(
                maxInactiveMinutes,
              );
            } else {
              expect(stats.mostInactiveMember).toBeNull();
            }

            // Verify average calculation
            if (inactiveMembers > 0) {
              const inactiveMinutesArray = testMinutesInactive.filter(
                (m) => m >= 15,
              );
              const expectedAverage = Math.round(
                inactiveMinutesArray.reduce((sum, m) => sum + m, 0) /
                  inactiveMinutesArray.length,
              );
              expect(stats.averageInactivityMinutes).toBe(expectedAverage);
            } else {
              expect(stats.averageInactivityMinutes).toBe(0);
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Unit Tests', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should get inactivity configuration', () => {
      // Act
      const config = service.getInactivityConfig();

      // Assert
      expect(config).toBeDefined();
      expect(config.warningThresholdMinutes).toBe(15);
      expect(config.inactiveThresholdMinutes).toBe(30);
      expect(config.exclusionThresholdMinutes).toBe(60);
      expect(config.enableAutomaticCleanup).toBe(true);
      expect(config.notificationEnabled).toBe(true);
    });

    it('should update inactivity configuration', () => {
      // Arrange
      const newConfig = {
        warningThresholdMinutes: 20,
        inactiveThresholdMinutes: 45,
      };

      // Act
      service.updateInactivityConfig(newConfig);
      const updatedConfig = service.getInactivityConfig();

      // Assert
      expect(updatedConfig.warningThresholdMinutes).toBe(20);
      expect(updatedConfig.inactiveThresholdMinutes).toBe(45);
      expect(updatedConfig.exclusionThresholdMinutes).toBe(60); // Should remain unchanged
    });

    it('should handle member not found', async () => {
      // Arrange
      const roomId = 'test-room';
      const userId = 'non-existent-user';

      memberService.getMember.mockResolvedValue(null);

      // Act
      const result = await service.getMemberActivityStatus(roomId, userId);

      // Assert
      expect(result).toBeNull();
    });

    it('should mark member as active', async () => {
      // Arrange
      const roomId = 'test-room';
      const userId = 'test-user';

      memberService.updateMemberActivity.mockResolvedValue();

      // Act
      await service.markMemberActive(roomId, userId);

      // Assert
      expect(memberService.updateMemberActivity).toHaveBeenCalledWith(
        roomId,
        userId,
      );
    });
  });
});
