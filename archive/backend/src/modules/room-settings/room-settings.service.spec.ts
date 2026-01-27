import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as fc from 'fast-check';
import { RoomSettingsService } from './room-settings.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { RoomService } from '../room/room.service';
import {
  AdvancedRoomSettings,
  ConsensusType,
  RoomPrivacy,
} from '../../domain/entities/room-template.entity';
import { UpdateRoomSettingsDto } from './dto/room-settings.dto';

describe('RoomSettingsService Property Tests', () => {
  let service: RoomSettingsService;
  let dynamoDBService: jest.Mocked<DynamoDBService>;
  let roomService: jest.Mocked<RoomService>;

  beforeEach(async () => {
    const mockDynamoDBService = {
      getItem: jest.fn(),
      putItem: jest.fn(),
      query: jest.fn(),
      deleteItem: jest.fn(),
      conditionalUpdate: jest.fn(),
    };

    const mockRoomService = {
      getRoom: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomSettingsService,
        { provide: DynamoDBService, useValue: mockDynamoDBService },
        { provide: RoomService, useValue: mockRoomService },
      ],
    }).compile();

    service = module.get<RoomSettingsService>(RoomSettingsService);
    dynamoDBService = module.get(DynamoDBService);
    roomService = module.get(RoomService);
  });

  // Generadores para property-based testing
  const consensusTypeArb = fc.constantFrom(...Object.values(ConsensusType));
  const roomPrivacyArb = fc.constantFrom(...Object.values(RoomPrivacy));

  const advancedRoomSettingsArb = fc
    .record({
      votingTimeout: fc.option(fc.integer({ min: 30, max: 300 })),
      sessionTimeout: fc.option(fc.integer({ min: 15, max: 480 })),
      consensusThreshold: consensusTypeArb,
      customThreshold: fc.option(fc.integer({ min: 50, max: 100 })),
      privacy: roomPrivacyArb,
      maxMembers: fc.option(fc.integer({ min: 2, max: 50 })),
      requireApproval: fc.boolean(),
      allowGuestVoting: fc.boolean(),
      contentInjectionEnabled: fc.boolean(),
      injectionFrequency: fc.option(fc.integer({ min: 5, max: 50 })),
      allowMemberSuggestions: fc.boolean(),
      autoProgressEnabled: fc.boolean(),
      chatEnabled: fc.boolean(),
      anonymousVoting: fc.boolean(),
      showVotingProgress: fc.boolean(),
      enableReactions: fc.boolean(),
      autoInactiveHandling: fc.boolean(),
      smartOptimization: fc.boolean(),
      predictiveMatching: fc.boolean(),
    })
    .map((settings) => {
      // Asegurar que customThreshold esté presente cuando consensusThreshold es CUSTOM
      if (
        settings.consensusThreshold === ConsensusType.CUSTOM &&
        !settings.customThreshold
      ) {
        return { ...settings, customThreshold: 75 };
      }
      // Asegurar que injectionFrequency esté presente cuando contentInjectionEnabled es true
      if (settings.contentInjectionEnabled && !settings.injectionFrequency) {
        return { ...settings, injectionFrequency: 10 };
      }
      return settings;
    });

  const updateRoomSettingsDtoArb = fc
    .record({
      votingTimeout: fc.option(fc.integer({ min: 30, max: 300 })),
      sessionTimeout: fc.option(fc.integer({ min: 15, max: 480 })),
      consensusThreshold: fc.option(consensusTypeArb),
      customThreshold: fc.option(fc.integer({ min: 50, max: 100 })),
      privacy: fc.option(roomPrivacyArb),
      maxMembers: fc.option(fc.integer({ min: 2, max: 50 })),
      requireApproval: fc.option(fc.boolean()),
      allowGuestVoting: fc.option(fc.boolean()),
      contentInjectionEnabled: fc.option(fc.boolean()),
      injectionFrequency: fc.option(fc.integer({ min: 5, max: 50 })),
      allowMemberSuggestions: fc.option(fc.boolean()),
      autoProgressEnabled: fc.option(fc.boolean()),
      chatEnabled: fc.option(fc.boolean()),
      anonymousVoting: fc.option(fc.boolean()),
      showVotingProgress: fc.option(fc.boolean()),
      enableReactions: fc.option(fc.boolean()),
      autoInactiveHandling: fc.option(fc.boolean()),
      smartOptimization: fc.option(fc.boolean()),
      predictiveMatching: fc.option(fc.boolean()),
    })
    .filter((settings) => {
      // Filtrar combinaciones inválidas
      if (
        settings.anonymousVoting === true &&
        settings.showVotingProgress === true
      ) {
        return false;
      }
      if (
        settings.consensusThreshold === ConsensusType.CUSTOM &&
        !settings.customThreshold
      ) {
        return false;
      }
      if (
        settings.contentInjectionEnabled === true &&
        !settings.injectionFrequency
      ) {
        return false;
      }
      return true;
    });

  const roomArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 3, maxLength: 50 }),
    creatorId: fc.uuid(),
    members: fc.array(
      fc.record({
        userId: fc.uuid(),
        role: fc.constantFrom('admin', 'moderator', 'member'),
        joinedAt: fc.date(),
      }),
      { minLength: 1, maxLength: 20 },
    ),
    isActive: fc.boolean(),
    createdAt: fc.date(),
    updatedAt: fc.date(),
  });

  describe('Property 1: Settings retrieval returns valid configurations', () => {
    it('should return valid settings for any room and user combination', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // roomId
          fc.uuid(), // userId
          advancedRoomSettingsArb,
          async (roomId, userId, mockSettings) => {
            // Arrange
            const mockRoom = {
              id: roomId,
              creatorId: userId,
              members: [{ userId, role: 'admin', joinedAt: new Date() }],
            };

            roomService.getRoom.mockResolvedValue(mockRoom as any);
            dynamoDBService.getItem.mockResolvedValue({
              roomId,
              settings: mockSettings,
              updatedAt: new Date(),
              updatedBy: userId,
              version: 1,
            });

            // Act
            const result = await service.getRoomSettings(roomId, userId);

            // Assert
            expect(result).toBeDefined();
            expect(
              result.votingTimeout === null ||
                typeof result.votingTimeout === 'number',
            ).toBe(true);
            expect(
              result.sessionTimeout === null ||
                typeof result.sessionTimeout === 'number',
            ).toBe(true);
            expect(Object.values(ConsensusType)).toContain(
              result.consensusThreshold,
            );
            expect(Object.values(RoomPrivacy)).toContain(result.privacy);
            expect(typeof result.requireApproval).toBe('boolean');
            expect(typeof result.allowGuestVoting).toBe('boolean');
            expect(typeof result.contentInjectionEnabled).toBe('boolean');
            expect(typeof result.chatEnabled).toBe('boolean');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 2: Settings updates preserve valid configurations', () => {
    it('should preserve valid settings when updating', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // roomId
          fc.uuid(), // userId
          advancedRoomSettingsArb, // currentSettings
          updateRoomSettingsDtoArb, // updates
          async (roomId, userId, currentSettings, updates) => {
            // Arrange
            const mockRoom = {
              id: roomId,
              creatorId: userId,
              members: [{ userId, role: 'admin', joinedAt: new Date() }],
            };

            roomService.getRoom.mockResolvedValue(mockRoom as any);
            dynamoDBService.getItem.mockResolvedValue({
              roomId,
              settings: currentSettings,
              updatedAt: new Date(),
              updatedBy: userId,
              version: 1,
            });
            dynamoDBService.putItem.mockResolvedValue(undefined);

            // Act
            const result = await service.updateRoomSettings(
              roomId,
              userId,
              updates,
            );

            // Assert
            // Verificar que las configuraciones actualizadas mantienen valores válidos
            if (updates.votingTimeout !== undefined) {
              expect(result.votingTimeout).toBe(updates.votingTimeout);
            } else {
              expect(result.votingTimeout).toBe(currentSettings.votingTimeout);
            }

            if (updates.consensusThreshold !== undefined) {
              expect(result.consensusThreshold).toBe(
                updates.consensusThreshold,
              );
            } else {
              expect(result.consensusThreshold).toBe(
                currentSettings.consensusThreshold,
              );
            }

            if (updates.privacy !== undefined) {
              expect(result.privacy).toBe(updates.privacy);
            } else {
              expect(result.privacy).toBe(currentSettings.privacy);
            }

            // Verificar que se llamó a putItem para guardar
            expect(dynamoDBService.putItem).toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 3: Settings validation correctly identifies invalid configurations', () => {
    it('should reject invalid settings combinations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // roomId
          fc.uuid(), // userId
          fc.record({
            consensusThreshold: fc.constant(ConsensusType.CUSTOM),
            customThreshold: fc.constant(undefined), // Invalid: missing customThreshold
            votingTimeout: fc.option(
              fc.oneof(
                fc.integer({ max: 29 }), // Too low
                fc.integer({ min: 301 }), // Too high
              ),
            ),
            sessionTimeout: fc.option(
              fc.oneof(
                fc.integer({ max: 14 }), // Too low
                fc.integer({ min: 481 }), // Too high
              ),
            ),
            maxMembers: fc.option(
              fc.oneof(
                fc.integer({ max: 1 }), // Too low
                fc.integer({ min: 51 }), // Too high
              ),
            ),
            anonymousVoting: fc.constant(true),
            showVotingProgress: fc.constant(true), // Invalid combination
          }),
          async (roomId, userId, invalidSettings) => {
            // Arrange
            const mockRoom = {
              id: roomId,
              creatorId: userId,
              members: [{ userId, role: 'admin', joinedAt: new Date() }],
            };

            roomService.getRoom.mockResolvedValue(mockRoom as any);

            // Act & Assert
            await expect(
              service.updateRoomSettings(roomId, userId, invalidSettings),
            ).rejects.toThrow(BadRequestException);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Property 4: Access control is enforced correctly', () => {
    it('should enforce proper access control for settings operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // roomId
          fc.uuid(), // adminUserId
          fc.uuid(), // regularUserId
          updateRoomSettingsDtoArb,
          async (roomId, adminUserId, regularUserId, updates) => {
            // Arrange
            const mockRoom = {
              id: roomId,
              creatorId: adminUserId,
              members: [
                { userId: adminUserId, role: 'admin', joinedAt: new Date() },
                { userId: regularUserId, role: 'member', joinedAt: new Date() },
              ],
            };

            roomService.getRoom.mockResolvedValue(mockRoom as any);

            // Act & Assert - Admin should be able to update
            dynamoDBService.getItem.mockResolvedValue({
              roomId,
              settings: service.getDefaultSettings(),
              updatedAt: new Date(),
              updatedBy: adminUserId,
              version: 1,
            });
            dynamoDBService.putItem.mockResolvedValue(undefined);

            await expect(
              service.updateRoomSettings(roomId, adminUserId, updates),
            ).resolves.toBeDefined();

            // Act & Assert - Regular user should be rejected
            if (regularUserId !== adminUserId) {
              await expect(
                service.updateRoomSettings(roomId, regularUserId, updates),
              ).rejects.toThrow(ForbiddenException);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 5: Default settings are always valid', () => {
    it('should always return valid default settings', async () => {
      await fc.assert(
        fc.property(
          fc.constant(null), // No input needed
          () => {
            // Act
            const defaultSettings = service.getDefaultSettings();

            // Assert
            expect(defaultSettings).toBeDefined();
            expect(typeof defaultSettings.votingTimeout).toBe('number');
            expect(defaultSettings.votingTimeout).toBeGreaterThanOrEqual(30);
            expect(defaultSettings.votingTimeout).toBeLessThanOrEqual(300);

            expect(typeof defaultSettings.sessionTimeout).toBe('number');
            expect(defaultSettings.sessionTimeout).toBeGreaterThanOrEqual(15);
            expect(defaultSettings.sessionTimeout).toBeLessThanOrEqual(480);

            expect(Object.values(ConsensusType)).toContain(
              defaultSettings.consensusThreshold,
            );
            expect(Object.values(RoomPrivacy)).toContain(
              defaultSettings.privacy,
            );

            if (defaultSettings.maxMembers) {
              expect(defaultSettings.maxMembers).toBeGreaterThanOrEqual(2);
              expect(defaultSettings.maxMembers).toBeLessThanOrEqual(50);
            }

            expect(typeof defaultSettings.requireApproval).toBe('boolean');
            expect(typeof defaultSettings.allowGuestVoting).toBe('boolean');
            expect(typeof defaultSettings.contentInjectionEnabled).toBe(
              'boolean',
            );
            expect(typeof defaultSettings.chatEnabled).toBe('boolean');
            expect(typeof defaultSettings.anonymousVoting).toBe('boolean');
            expect(typeof defaultSettings.showVotingProgress).toBe('boolean');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 6: Settings reset restores default values', () => {
    it('should reset settings to default values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // roomId
          fc.uuid(), // userId
          async (roomId, userId) => {
            // Arrange
            const mockRoom = {
              id: roomId,
              creatorId: userId,
              members: [{ userId, role: 'admin', joinedAt: new Date() }],
            };

            roomService.getRoom.mockResolvedValue(mockRoom as any);
            dynamoDBService.putItem.mockResolvedValue(undefined);

            // Act
            const result = await service.resetRoomSettings(roomId, userId);
            const defaultSettings = service.getDefaultSettings();

            // Assert
            expect(result).toEqual(defaultSettings);
            expect(dynamoDBService.putItem).toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 7: Recommendations are contextually appropriate', () => {
    it('should generate appropriate recommendations based on room context', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomArb,
          advancedRoomSettingsArb,
          async (room, currentSettings) => {
            // Arrange
            const userId = room.members[0].userId;
            roomService.getRoom.mockResolvedValue(room as any);
            dynamoDBService.getItem.mockResolvedValue({
              roomId: room.id,
              settings: currentSettings,
              updatedAt: new Date(),
              updatedBy: userId,
              version: 1,
            });

            // Act
            const result = await service.getSettingsRecommendations(
              room.id,
              userId,
            );

            // Assert
            expect(result).toBeDefined();
            expect(result.roomId).toBe(room.id);
            expect(Array.isArray(result.recommendations)).toBe(true);
            expect(typeof result.currentOptimizationScore).toBe('number');
            expect(result.currentOptimizationScore).toBeGreaterThanOrEqual(0);
            expect(result.currentOptimizationScore).toBeLessThanOrEqual(100);
            expect(typeof result.potentialScore).toBe('number');
            expect(result.potentialScore).toBeGreaterThanOrEqual(0);
            expect(result.potentialScore).toBeLessThanOrEqual(100);

            // Verificar que las recomendaciones tienen la estructura correcta
            result.recommendations.forEach((rec) => {
              expect(typeof rec.setting).toBe('string');
              expect(rec.recommendedValue).toBeDefined();
              expect(typeof rec.reason).toBe('string');
              expect(typeof rec.priority).toBe('number');
              expect(rec.priority).toBeGreaterThanOrEqual(1);
              expect(rec.priority).toBeLessThanOrEqual(5);
              expect(typeof rec.expectedImpact).toBe('string');
            });
          },
        ),
        { numRuns: 50 },
      ); // Menos iteraciones para operaciones complejas
    });
  });

  describe('Property 8: Settings persistence maintains data integrity', () => {
    it('should maintain data integrity across save and load operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // roomId
          fc.uuid(), // userId
          fc.record({
            votingTimeout: fc.option(fc.integer({ min: 30, max: 300 })),
            sessionTimeout: fc.option(fc.integer({ min: 15, max: 480 })),
            consensusThreshold: fc.option(
              fc.constantFrom(
                ConsensusType.UNANIMOUS,
                ConsensusType.MAJORITY,
                ConsensusType.SUPER_MAJORITY,
              ),
            ), // Evitar CUSTOM
            privacy: fc.option(roomPrivacyArb),
            maxMembers: fc.option(fc.integer({ min: 2, max: 50 })),
            requireApproval: fc.option(fc.boolean()),
            allowGuestVoting: fc.option(fc.boolean()),
            contentInjectionEnabled: fc.option(fc.boolean()),
            chatEnabled: fc.option(fc.boolean()),
            // Evitar combinaciones problemáticas
            anonymousVoting: fc.constant(false),
            showVotingProgress: fc.option(fc.boolean()),
          }),
          async (roomId, userId, originalSettings) => {
            // Arrange
            const mockRoom = {
              id: roomId,
              creatorId: userId,
              members: [{ userId, role: 'admin', joinedAt: new Date() }],
            };

            roomService.getRoom.mockResolvedValue(mockRoom as any);

            // Mock save operation
            let savedSettings: any = null;
            dynamoDBService.putItem.mockImplementation(async (item) => {
              savedSettings = item.settings;
              return undefined;
            });

            // Mock load operation
            dynamoDBService.getItem.mockImplementation(async () => {
              return savedSettings
                ? {
                    roomId,
                    settings: savedSettings,
                    updatedAt: new Date(),
                    updatedBy: userId,
                    version: 1,
                  }
                : null;
            });

            // Act - Save settings
            await service.updateRoomSettings(roomId, userId, originalSettings);

            // Act - Load settings
            const loadedSettings = await service.getRoomSettings(
              roomId,
              userId,
            );

            // Assert - Data integrity maintained
            if (originalSettings.votingTimeout !== undefined) {
              expect(loadedSettings.votingTimeout).toBe(
                originalSettings.votingTimeout,
              );
            }
            if (originalSettings.sessionTimeout !== undefined) {
              expect(loadedSettings.sessionTimeout).toBe(
                originalSettings.sessionTimeout,
              );
            }
            if (originalSettings.consensusThreshold !== undefined) {
              expect(loadedSettings.consensusThreshold).toBe(
                originalSettings.consensusThreshold,
              );
            }
            if (originalSettings.privacy !== undefined) {
              expect(loadedSettings.privacy).toBe(originalSettings.privacy);
            }
            if (originalSettings.requireApproval !== undefined) {
              expect(loadedSettings.requireApproval).toBe(
                originalSettings.requireApproval,
              );
            }
            if (originalSettings.allowGuestVoting !== undefined) {
              expect(loadedSettings.allowGuestVoting).toBe(
                originalSettings.allowGuestVoting,
              );
            }
            if (originalSettings.contentInjectionEnabled !== undefined) {
              expect(loadedSettings.contentInjectionEnabled).toBe(
                originalSettings.contentInjectionEnabled,
              );
            }
            if (originalSettings.chatEnabled !== undefined) {
              expect(loadedSettings.chatEnabled).toBe(
                originalSettings.chatEnabled,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
