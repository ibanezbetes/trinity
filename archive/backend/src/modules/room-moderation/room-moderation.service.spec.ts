import { Test, TestingModule } from '@nestjs/testing';
import { RoomModerationService } from './room-moderation.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { RoomService } from '../room/room.service';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as fc from 'fast-check';
import {
  RoomPermission,
  SystemRole,
  ModerationActionType,
  CustomRole,
  ModerationAction,
  MemberModerationStatus,
} from '../../domain/entities/room-moderation.entity';
import {
  CreateCustomRoleDto,
  UpdateCustomRoleDto,
  WarnMemberDto,
  MuteMemberDto,
  BanMemberDto,
} from './dto/moderation.dto';

describe('RoomModerationService', () => {
  let service: RoomModerationService;
  let dynamoDBService: jest.Mocked<DynamoDBService>;
  let roomService: jest.Mocked<RoomService>;
  let realtimeService: jest.Mocked<RealtimeCompatibilityService>;

  // Generadores de datos para property-based testing
  const roomIdArb = fc.string({ minLength: 1, maxLength: 50 });
  const userIdArb = fc.string({ minLength: 1, maxLength: 50 });
  const roleIdArb = fc.string({ minLength: 1, maxLength: 50 });

  const permissionArb = fc.constantFrom(...Object.values(RoomPermission));
  const permissionsArb = fc
    .array(permissionArb, { minLength: 1, maxLength: 10 })
    .map((perms) => [...new Set(perms)]);

  const systemRoleArb = fc.constantFrom(...Object.values(SystemRole));
  const moderationActionTypeArb = fc.constantFrom(
    ...Object.values(ModerationActionType),
  );

  const colorArb = fc
    .hexaString({ minLength: 6, maxLength: 6 })
    .map((hex) => `#${hex}`);
  const priorityArb = fc.integer({ min: 1, max: 100 });

  const createRoleDtoArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.string({ minLength: 1, maxLength: 200 }),
    permissions: permissionsArb,
    color: fc.option(colorArb, { nil: undefined }),
    priority: fc.option(priorityArb, { nil: undefined }),
  });

  const updateRoleDtoArb = fc.record({
    name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
      nil: undefined,
    }),
    description: fc.option(fc.string({ minLength: 1, maxLength: 200 }), {
      nil: undefined,
    }),
    permissions: fc.option(permissionsArb, { nil: undefined }),
    color: fc.option(colorArb, { nil: undefined }),
    priority: fc.option(priorityArb, { nil: undefined }),
  });

  beforeEach(async () => {
    const mockDynamoDBService = {
      putItem: jest.fn(),
      getItem: jest.fn(),
      query: jest.fn(),
      deleteItem: jest.fn(),
    };

    const mockRoomService = {
      getRoom: jest.fn(),
    };

    const mockRealtimeService = {
      notifyRoleAssigned: jest.fn(),
      notifyModerationAction: jest.fn(),
      notifyRoomStateChange: jest.fn(),
      notifyMemberStatusChange: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomModerationService,
        {
          provide: DynamoDBService,
          useValue: mockDynamoDBService,
        },
        {
          provide: RoomService,
          useValue: mockRoomService,
        },
        {
          provide: RealtimeCompatibilityService,
          useValue: mockRealtimeService,
        },
      ],
    }).compile();

    service = module.get<RoomModerationService>(RoomModerationService);
    dynamoDBService = module.get(DynamoDBService);
    roomService = module.get(RoomService);
    realtimeService = module.get(RealtimeCompatibilityService);
  });

  describe('System Role Properties', () => {
    /**
     * Propiedad 1: Los roles del sistema siempre tienen permisos consistentes
     */
    it('should return consistent system roles with proper permissions', async () => {
      await fc.assert(
        fc.asyncProperty(roomIdArb, async (roomId) => {
          // Setup mocks
          dynamoDBService.query.mockResolvedValue({ Items: [] });

          // Execute
          const roles = await service.getRoomRoles(roomId);

          // Verify system roles are present
          const systemRoles = roles.filter((role) => role.isSystemRole);
          expect(systemRoles).toHaveLength(5); // Owner, Admin, Moderator, Member, Guest

          // Verify role hierarchy
          const priorities = systemRoles.map((role) => role.priority);
          expect(priorities).toEqual(priorities.sort((a, b) => b - a)); // Descending order

          // Verify owner has all permissions
          const ownerRole = systemRoles.find(
            (role) => role.id === SystemRole.OWNER,
          );
          expect(ownerRole?.permissions).toEqual(Object.values(RoomPermission));

          // Verify guest has minimal permissions
          const guestRole = systemRoles.find(
            (role) => role.id === SystemRole.GUEST,
          );
          expect(guestRole?.permissions).toContain(RoomPermission.VIEW_ROOM);
          expect(guestRole?.permissions).not.toContain(
            RoomPermission.DELETE_ROOM,
          );
        }),
        { numRuns: 50 },
      );
    });

    /**
     * Propiedad 2: Jerarquía de roles es consistente
     */
    it('should maintain consistent role hierarchy', async () => {
      await fc.assert(
        fc.asyncProperty(roomIdArb, async (roomId) => {
          dynamoDBService.query.mockResolvedValue({ Items: [] });
          const roles = await service.getRoomRoles(roomId);
          const systemRoles = roles.filter((role) => role.isSystemRole);

          // Verificar que Owner tiene la prioridad más alta
          const ownerRole = systemRoles.find(
            (role) => role.id === SystemRole.OWNER,
          );
          const otherRoles = systemRoles.filter(
            (role) => role.id !== SystemRole.OWNER,
          );

          expect(ownerRole?.priority).toBeGreaterThan(
            Math.max(...otherRoles.map((r) => r.priority)),
          );

          // Verificar que Guest tiene la prioridad más baja
          const guestRole = systemRoles.find(
            (role) => role.id === SystemRole.GUEST,
          );
          const nonGuestRoles = systemRoles.filter(
            (role) => role.id !== SystemRole.GUEST,
          );

          expect(guestRole?.priority).toBeLessThan(
            Math.min(...nonGuestRoles.map((r) => r.priority)),
          );
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Custom Role Management', () => {
    /**
     * Propiedad 3: Crear rol personalizado genera estructura válida
     */
    it('should create custom roles with valid structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArb,
          userIdArb,
          createRoleDtoArb,
          async (roomId, userId, createRoleDto) => {
            // Mock successful creation (bypass permission checks for this test)
            dynamoDBService.query.mockResolvedValue({ Items: [] });
            dynamoDBService.putItem.mockResolvedValue({} as any);

            // Mock room service to return room with user as owner
            roomService.getRoom.mockResolvedValue({
              id: roomId,
              creatorId: userId,
              members: [{ userId, role: 'owner' }],
            } as any);

            // Spy on checkPermission to bypass it
            const checkPermissionSpy = jest.spyOn(
              service,
              'checkPermission' as any,
            );
            checkPermissionSpy.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['owner'],
            });

            try {
              const result = await service.createCustomRole(
                roomId,
                userId,
                createRoleDto,
              );

              // Verify structure
              expect(result.id).toBeDefined();
              expect(typeof result.id).toBe('string');
              expect(result.name).toBe(createRoleDto.name);
              expect(result.description).toBe(createRoleDto.description);
              expect(result.roomId).toBe(roomId);
              expect(result.permissions).toEqual(createRoleDto.permissions);
              expect(result.isSystemRole).toBe(false);
              expect(result.createdBy).toBe(userId);
              expect(result.createdAt).toBeInstanceOf(Date);
              expect(result.updatedAt).toBeInstanceOf(Date);

              // Verify defaults
              expect(result.color).toBe(createRoleDto.color || '#6B7280');
              expect(result.priority).toBe(createRoleDto.priority || 10);
            } finally {
              checkPermissionSpy.mockRestore();
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Propiedad 4: Actualizar rol preserva ID y metadatos inmutables
     */
    it('should preserve immutable properties when updating roles', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArb,
          roleIdArb,
          userIdArb,
          createRoleDtoArb,
          updateRoleDtoArb,
          async (roomId, roleId, userId, originalRole, updateDto) => {
            const existingRole: CustomRole = {
              id: roleId,
              name: originalRole.name,
              description: originalRole.description,
              roomId,
              permissions: originalRole.permissions,
              color: originalRole.color || '#6B7280',
              priority: originalRole.priority || 10,
              isSystemRole: false,
              createdBy: userId,
              createdAt: new Date('2023-01-01'),
              updatedAt: new Date('2023-01-01'),
            };

            roomService.getRoom.mockResolvedValue({
              id: roomId,
              creatorId: userId,
              members: [{ userId, role: 'owner' }],
            } as any);

            dynamoDBService.getItem.mockResolvedValue(existingRole);
            dynamoDBService.putItem.mockResolvedValue({} as any);

            // Bypass permission checks
            const checkPermissionSpy = jest.spyOn(
              service,
              'checkPermission' as any,
            );
            checkPermissionSpy.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['owner'],
            });

            try {
              const result = await service.updateCustomRole(
                roomId,
                roleId,
                userId,
                updateDto,
              );

              // Verify immutable properties
              expect(result.id).toBe(roleId);
              expect(result.roomId).toBe(roomId);
              expect(result.isSystemRole).toBe(false);
              expect(result.createdBy).toBe(userId);
              expect(result.createdAt).toEqual(existingRole.createdAt);

              // Verify updatedAt changed
              expect(result.updatedAt.getTime()).toBeGreaterThan(
                existingRole.updatedAt.getTime(),
              );
            } finally {
              checkPermissionSpy.mockRestore();
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Moderation Actions', () => {
    /**
     * Propiedad 5: Acciones de moderación tienen timestamps válidos
     */
    it('should create moderation actions with valid timestamps', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArb,
          userIdArb,
          userIdArb,
          fc.string({ minLength: 1, maxLength: 500 }),
          async (roomId, moderatorId, targetUserId, reason) => {
            roomService.getRoom.mockResolvedValue({
              id: roomId,
              members: [
                { userId: moderatorId, role: 'admin' },
                { userId: targetUserId, role: 'member' },
              ],
            } as any);

            dynamoDBService.putItem.mockResolvedValue({} as any);

            // Bypass permission checks
            const checkPermissionSpy = jest.spyOn(
              service,
              'checkPermission' as any,
            );
            checkPermissionSpy.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['admin'],
            });

            const beforeAction = new Date();

            try {
              const result = await service.warnMember(
                roomId,
                { targetUserId, reason },
                moderatorId,
              );

              const afterAction = new Date();

              // Verify timestamps
              expect(result.createdAt).toBeInstanceOf(Date);
              expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(
                beforeAction.getTime(),
              );
              expect(result.createdAt.getTime()).toBeLessThanOrEqual(
                afterAction.getTime(),
              );
              expect(result.isActive).toBe(true);
              expect(result.actionType).toBe(ModerationActionType.WARN);
              expect(result.targetUserId).toBe(targetUserId);
              expect(result.moderatorId).toBe(moderatorId);
              expect(result.reason).toBe(reason);
            } finally {
              checkPermissionSpy.mockRestore();
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Propiedad 6: Mute calcula expiración correctamente
     */
    it('should calculate correct expiration for mute actions', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArb,
          userIdArb,
          userIdArb,
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.integer({ min: 1, max: 1440 }), // 1 minuto a 24 horas
          async (roomId, moderatorId, targetUserId, reason, duration) => {
            roomService.getRoom.mockResolvedValue({
              id: roomId,
              members: [
                { userId: moderatorId, role: 'admin' },
                { userId: targetUserId, role: 'member' },
              ],
            } as any);

            dynamoDBService.putItem.mockResolvedValue({} as any);

            // Bypass permission checks
            const checkPermissionSpy = jest.spyOn(
              service,
              'checkPermission' as any,
            );
            checkPermissionSpy.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['admin'],
            });

            try {
              const result = await service.muteMember(
                roomId,
                { targetUserId, reason, duration },
                moderatorId,
              );

              // Verify expiration calculation
              expect(result.duration).toBe(duration);
              expect(result.expiresAt).toBeInstanceOf(Date);

              if (result.expiresAt) {
                const expectedExpiration = new Date(
                  result.createdAt.getTime() + duration * 60 * 1000,
                );
                const timeDiff = Math.abs(
                  result.expiresAt.getTime() - expectedExpiration.getTime(),
                );
                expect(timeDiff).toBeLessThan(1000); // Menos de 1 segundo de diferencia
              }
            } finally {
              checkPermissionSpy.mockRestore();
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Propiedad 7: Ban permanente vs temporal
     */
    it('should handle permanent vs temporary bans correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArb,
          userIdArb,
          userIdArb,
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.integer({ min: 0, max: 10080 }), // 0 a 7 días
          async (roomId, moderatorId, targetUserId, reason, duration) => {
            roomService.getRoom.mockResolvedValue({
              id: roomId,
              members: [
                { userId: moderatorId, role: 'admin' },
                { userId: targetUserId, role: 'member' },
              ],
            } as any);

            dynamoDBService.putItem.mockResolvedValue({} as any);

            // Bypass permission checks
            const checkPermissionSpy = jest.spyOn(
              service,
              'checkPermission' as any,
            );
            checkPermissionSpy.mockResolvedValue({
              hasPermission: true,
              currentRoles: ['admin'],
            });

            try {
              const result = await service.banMember(
                roomId,
                { targetUserId, reason, duration },
                moderatorId,
              );

              // Verify ban type
              if (duration === 0) {
                expect(result.actionType).toBe(
                  ModerationActionType.PERMANENT_BAN,
                );
                expect(result.expiresAt).toBeUndefined();
              } else {
                expect(result.actionType).toBe(
                  ModerationActionType.TEMPORARY_BAN,
                );
                expect(result.expiresAt).toBeInstanceOf(Date);
              }

              expect(result.duration).toBe(duration);
              expect(result.reason).toBe(reason);
            } finally {
              checkPermissionSpy.mockRestore();
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty permission arrays', async () => {
      const createRoleDto: CreateCustomRoleDto = {
        name: 'Test Role',
        description: 'Test Description',
        permissions: [],
      };

      await expect(
        service.createCustomRole('room1', 'user1', createRoleDto),
      ).rejects.toThrow();
    });

    it('should prevent system role modification', async () => {
      const updateDto: UpdateCustomRoleDto = {
        name: 'Modified Owner',
      };

      roomService.getRoom.mockResolvedValue({
        id: 'room1',
        creatorId: 'user1',
        members: [{ userId: 'user1', role: 'admin' }],
      } as any);

      // Bypass permission checks but should still fail for system role
      const checkPermissionSpy = jest.spyOn(service, 'checkPermission' as any);
      checkPermissionSpy.mockResolvedValue({
        hasPermission: true,
        currentRoles: ['admin'],
      });

      try {
        await expect(
          service.updateCustomRole(
            'room1',
            SystemRole.OWNER,
            'user1',
            updateDto,
          ),
        ).rejects.toThrow(ForbiddenException);
      } finally {
        checkPermissionSpy.mockRestore();
      }
    });

    it('should validate role data integrity', async () => {
      await fc.assert(
        fc.asyncProperty(createRoleDtoArb, async (createRoleDto) => {
          // Verificar que los permisos son válidos
          const validPermissions = Object.values(RoomPermission);
          const hasValidPermissions = createRoleDto.permissions.every((p) =>
            validPermissions.includes(p),
          );
          expect(hasValidPermissions).toBe(true);

          // Verificar que el color es válido si está presente
          if (createRoleDto.color) {
            expect(createRoleDto.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
          }

          // Verificar que la prioridad está en rango válido si está presente
          if (createRoleDto.priority !== undefined) {
            expect(createRoleDto.priority).toBeGreaterThanOrEqual(1);
            expect(createRoleDto.priority).toBeLessThanOrEqual(100);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
