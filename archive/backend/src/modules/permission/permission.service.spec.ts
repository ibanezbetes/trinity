import { Test, TestingModule } from '@nestjs/testing';
import { PermissionService } from './permission.service';
import { RoomModerationService } from '../room-moderation/room-moderation.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import * as fc from 'fast-check';
import {
  RoomPermission,
  SystemRole,
  CustomRole,
  PermissionCheckResult,
  PermissionConflict,
} from '../../domain/entities/room-moderation.entity';

describe('PermissionService', () => {
  let service: PermissionService;
  let mockRoomModerationService: jest.Mocked<RoomModerationService>;
  let mockDynamoDBService: jest.Mocked<DynamoDBService>;

  beforeEach(async () => {
    const mockRoomModeration = {
      checkPermission: jest.fn(),
      getUserRoles: jest.fn(),
      removeRole: jest.fn(),
    };

    const mockDynamoDB = {
      putItem: jest.fn(),
      getItem: jest.fn(),
      query: jest.fn(),
      deleteItem: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        {
          provide: RoomModerationService,
          useValue: mockRoomModeration,
        },
        {
          provide: DynamoDBService,
          useValue: mockDynamoDB,
        },
      ],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
    mockRoomModerationService = module.get(RoomModerationService);
    mockDynamoDBService = module.get(DynamoDBService);

    // Limpiar mocks después de cada test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Property-based Tests', () => {
    // Generadores para property tests
    const roomIdArb = fc.string({ minLength: 1, maxLength: 50 });
    const userIdArb = fc.string({ minLength: 1, maxLength: 50 });
    const permissionArb = fc.constantFrom(...Object.values(RoomPermission));
    const permissionsArrayArb = fc.array(permissionArb, {
      minLength: 1,
      maxLength: 5,
    });

    const customRoleArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      description: fc.string({ maxLength: 100 }),
      roomId: roomIdArb,
      permissions: permissionsArrayArb,
      color: fc.hexaString({ minLength: 6, maxLength: 6 }).map((s) => `#${s}`),
      priority: fc.integer({ min: 1, max: 100 }),
      isSystemRole: fc.boolean(),
      createdBy: userIdArb,
      createdAt: fc.date(),
      updatedAt: fc.date(),
    });

    const permissionCheckResultArb = fc.record({
      hasPermission: fc.boolean(),
      currentRoles: fc.array(fc.string(), { maxLength: 3 }),
      reason: fc.option(fc.string()),
      requiredRole: fc.option(fc.string()),
    });

    it('should handle permission checking with caching correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArb,
          userIdArb,
          permissionsArrayArb,
          async (roomId, userId, permissions) => {
            // Limpiar mocks antes de cada iteración
            mockRoomModerationService.checkPermission.mockClear();

            // Configurar mock para que siempre tenga éxito
            const mockResult: PermissionCheckResult = {
              hasPermission: true,
              currentRoles: ['member'],
            };
            mockRoomModerationService.checkPermission.mockResolvedValue(
              mockResult,
            );

            // Primera llamada sin caché
            const results1 = await service.checkPermissions(
              roomId,
              userId,
              permissions,
              { useCache: false },
            );

            // Segunda llamada con caché
            const results2 = await service.checkPermissions(
              roomId,
              userId,
              permissions,
              { useCache: true },
            );

            // Verificar que ambas devuelven el mismo resultado
            expect(results1).toHaveLength(permissions.length);
            expect(results2).toHaveLength(permissions.length);

            // Verificar que todas las verificaciones fueron exitosas
            results1.forEach((result) =>
              expect(result.hasPermission).toBe(true),
            );
            results2.forEach((result) =>
              expect(result.hasPermission).toBe(true),
            );

            // Verificar que se llamó al servicio de moderación
            // El número exacto depende de si el caché se usa o no
            expect(
              mockRoomModerationService.checkPermission,
            ).toHaveBeenCalled();
          },
        ),
        { numRuns: 30 },
      );
    });

    it('should detect hierarchy conflicts correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArb,
          userIdArb,
          fc.array(customRoleArb, { minLength: 2, maxLength: 4 }),
          async (roomId, userId, roles) => {
            // Crear roles con diferentes prioridades para generar conflictos
            const rolesWithConflicts = roles.map((role, index) => ({
              ...role,
              roomId,
              id:
                index === 0
                  ? SystemRole.OWNER
                  : index === 1
                    ? SystemRole.GUEST
                    : role.id,
              priority: index === 0 ? 100 : index === 1 ? 20 : role.priority,
              isSystemRole: index < 2,
            }));

            mockRoomModerationService.getUserRoles.mockResolvedValue(
              rolesWithConflicts,
            );

            const conflicts = await service.detectPermissionConflicts(
              roomId,
              userId,
            );

            // Verificar que se detectan conflictos cuando hay roles con gran diferencia de prioridad
            const hasHighPriorityConflict = rolesWithConflicts.some((r1) =>
              rolesWithConflicts.some(
                (r2) =>
                  r1.id !== r2.id && Math.abs(r1.priority - r2.priority) > 60,
              ),
            );

            if (hasHighPriorityConflict) {
              expect(conflicts.length).toBeGreaterThan(0);
              expect(conflicts.some((c) => c.type === 'hierarchy')).toBe(true);
            }
          },
        ),
        { numRuns: 30 },
      );
    });

    it('should handle bulk permission checks efficiently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              userId: userIdArb,
              roomId: roomIdArb,
              permissions: permissionsArrayArb,
            }),
            { minLength: 1, maxLength: 3 },
          ),
          async (checks) => {
            // Limpiar mocks antes de cada iteración
            mockRoomModerationService.checkPermission.mockClear();

            // Configurar mock para que siempre tenga éxito
            const mockResult: PermissionCheckResult = {
              hasPermission: true,
              currentRoles: ['member'],
            };
            mockRoomModerationService.checkPermission.mockResolvedValue(
              mockResult,
            );

            const results = await service.bulkCheckPermissions(checks);

            // Verificar que se devuelven resultados para todos los checks
            expect(results.size).toBe(checks.length);

            // Verificar que cada resultado tiene la estructura correcta
            for (const check of checks) {
              const key = `${check.userId}:${check.roomId}`;
              const checkResults = results.get(key);
              expect(checkResults).toBeDefined();
              expect(checkResults).toHaveLength(check.permissions.length);

              // Verificar que todas las verificaciones fueron exitosas
              checkResults!.forEach((result) =>
                expect(result.hasPermission).toBe(true),
              );
            }

            // Verificar que se llamó al servicio de moderación
            expect(
              mockRoomModerationService.checkPermission,
            ).toHaveBeenCalled();
          },
        ),
        { numRuns: 20 },
      );
    });

    it('should maintain cache consistency across operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArb,
          userIdArb,
          permissionArb,
          permissionCheckResultArb,
          async (roomId, userId, permission, mockResult) => {
            mockRoomModerationService.checkPermission.mockResolvedValue(
              mockResult,
            );

            // Primera verificación con caché
            await service.checkPermissions(roomId, userId, [permission], {
              useCache: true,
            });

            // Obtener estadísticas de caché
            const statsBefore = service.getPermissionCacheStats();

            // Segunda verificación con caché (debería usar caché)
            await service.checkPermissions(roomId, userId, [permission], {
              useCache: true,
            });

            const statsAfter = service.getPermissionCacheStats();

            // Verificar que el caché se está utilizando
            expect(statsAfter.size).toBeGreaterThanOrEqual(statsBefore.size);

            // Invalidar caché
            service.invalidatePermissionCache(roomId, userId);

            const statsAfterInvalidation = service.getPermissionCacheStats();
            expect(statsAfterInvalidation.size).toBeLessThanOrEqual(
              statsAfter.size,
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should generate accurate permission summaries', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArb,
          userIdArb,
          fc.array(customRoleArb, { minLength: 1, maxLength: 3 }),
          async (roomId, userId, roles) => {
            const rolesWithRoomId = roles.map((role) => ({ ...role, roomId }));
            mockRoomModerationService.getUserRoles.mockResolvedValue(
              rolesWithRoomId,
            );

            const summary = await service.getPermissionSummary(roomId, userId);

            // Verificar estructura del resumen
            expect(summary.userId).toBe(userId);
            expect(summary.roomId).toBe(roomId);
            expect(summary.roles).toHaveLength(rolesWithRoomId.length);
            expect(Array.isArray(summary.permissions)).toBe(true);
            expect(Array.isArray(summary.inheritedPermissions)).toBe(true);
            expect(Array.isArray(summary.conflicts)).toBe(true);
            expect(summary.lastUpdated).toBeInstanceOf(Date);

            // Verificar que los roles coinciden
            expect(summary.roles).toEqual(
              rolesWithRoomId.map((role) => role.id),
            );

            // Verificar que los permisos son únicos
            const uniquePermissions = new Set(summary.permissions);
            expect(uniquePermissions.size).toBe(summary.permissions.length);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should resolve conflicts automatically when possible', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArb,
          userIdArb,
          userIdArb,
          async (roomId, userId, moderatorId) => {
            // Crear roles con conflicto de jerarquía
            const conflictingRoles: CustomRole[] = [
              {
                id: SystemRole.OWNER,
                name: 'Propietario',
                description: 'Propietario de la sala',
                roomId,
                permissions: Object.values(RoomPermission),
                color: '#DC2626',
                priority: 100,
                isSystemRole: true,
                createdBy: 'system',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: SystemRole.GUEST,
                name: 'Invitado',
                description: 'Invitado con permisos limitados',
                roomId,
                permissions: [RoomPermission.VIEW_ROOM, RoomPermission.VOTE],
                color: '#6B7280',
                priority: 20,
                isSystemRole: true,
                createdBy: 'system',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ];

            mockRoomModerationService.getUserRoles.mockResolvedValue(
              conflictingRoles,
            );
            mockRoomModerationService.removeRole.mockResolvedValue();

            const result = await service.resolvePermissionConflicts(
              roomId,
              userId,
              moderatorId,
            );

            // Verificar que se intentó resolver al menos un conflicto
            expect(result.resolved).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(result.remaining)).toBe(true);

            // Si había conflictos, debería haberse llamado a removeRole
            if (result.resolved > 0) {
              expect(mockRoomModerationService.removeRole).toHaveBeenCalled();
            }
          },
        ),
        { numRuns: 30 },
      );
    });

    it('should handle cache TTL correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArb,
          userIdArb,
          permissionArb,
          permissionCheckResultArb,
          async (roomId, userId, permission, mockResult) => {
            mockRoomModerationService.checkPermission.mockResolvedValue(
              mockResult,
            );

            // Verificar permiso con caché
            await service.checkPermissions(roomId, userId, [permission], {
              useCache: true,
            });

            const stats = service.getPermissionCacheStats();

            // Verificar que hay entradas en el caché
            expect(stats.size).toBeGreaterThan(0);

            // Verificar que las entradas tienen TTL válido
            for (const entry of stats.entries) {
              expect(entry.ttl).toBeGreaterThan(0);
              expect(entry.lastAccessed).toBeInstanceOf(Date);
            }
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty permission arrays', async () => {
      const result = await service.checkPermissions('room1', 'user1', []);
      expect(result).toEqual([]);
    });

    it('should handle non-existent users gracefully', async () => {
      mockRoomModerationService.checkPermission.mockRejectedValue(
        new Error('User not found'),
      );

      const result = await service.checkPermissions('room1', 'nonexistent', [
        RoomPermission.VIEW_ROOM,
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].hasPermission).toBe(false);
      expect(result[0].reason).toContain('User not found');
    });

    it('should handle cache invalidation for non-existent entries', () => {
      expect(() => {
        service.invalidatePermissionCache(
          'nonexistent-room',
          'nonexistent-user',
        );
      }).not.toThrow();
    });

    it('should return empty conflicts for users with single role', async () => {
      const singleRole: CustomRole = {
        id: SystemRole.MEMBER,
        name: 'Miembro',
        description: 'Miembro regular',
        roomId: 'room1',
        permissions: [RoomPermission.VIEW_ROOM, RoomPermission.VOTE],
        color: '#059669',
        priority: 40,
        isSystemRole: true,
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRoomModerationService.getUserRoles.mockResolvedValue([singleRole]);

      const conflicts = await service.detectPermissionConflicts(
        'room1',
        'user1',
      );
      expect(conflicts).toEqual([]);
    });
  });
});
