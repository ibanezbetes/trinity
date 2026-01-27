import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import { RoomModerationService } from '../room-moderation/room-moderation.service';
import {
  RoomPermission,
  SystemRole,
  PermissionCheckResult,
  CustomRole,
  PermissionCache,
  PermissionConflict,
  PermissionInheritance,
} from '../../domain/entities/room-moderation.entity';
import { PermissionAuditLog } from '../../common/middleware/permission-audit.middleware';

export interface PermissionCheckOptions {
  useCache?: boolean;
  includeInherited?: boolean;
  auditAccess?: boolean;
}

export interface BulkPermissionCheck {
  userId: string;
  roomId: string;
  permissions: RoomPermission[];
}

export interface PermissionSummary {
  userId: string;
  roomId: string;
  roles: string[];
  permissions: RoomPermission[];
  inheritedPermissions: RoomPermission[];
  conflicts: PermissionConflict[];
  lastUpdated: Date;
}

/**
 * Servicio especializado para gestión avanzada de permisos
 * Proporciona caché, herencia, verificación en lote y resolución de conflictos
 */
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);
  private readonly permissionCache = new Map<string, PermissionCache>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  constructor(
    private dynamoDBService: DynamoDBService,
    private roomModerationService: RoomModerationService,
  ) {}

  /**
   * Verificar múltiples permisos de forma eficiente
   */
  async checkPermissions(
    roomId: string,
    userId: string,
    permissions: RoomPermission[],
    options: PermissionCheckOptions = {},
  ): Promise<PermissionCheckResult[]> {
    const results: PermissionCheckResult[] = [];

    for (const permission of permissions) {
      try {
        const result = await this.checkSinglePermission(
          roomId,
          userId,
          permission,
          options,
        );
        results.push(result);
      } catch (error) {
        results.push({
          hasPermission: false,
          currentRoles: [],
          reason: error.message,
          requiredRole: this.getMinimumRoleForPermission(permission),
        });
      }
    }

    return results;
  }

  /**
   * Verificar un solo permiso (método de compatibilidad)
   */
  async checkPermission(
    roomId: string,
    userId: string,
    permission: RoomPermission,
    options: PermissionCheckOptions = {},
  ): Promise<PermissionCheckResult> {
    const results = await this.checkPermissions(roomId, userId, [permission], options);
    return results[0];
  }

  /**
   * Verificar si un usuario tiene un permiso específico (método de compatibilidad)
   */
  async hasPermission(
    roomId: string,
    userId: string,
    permission: RoomPermission,
    options: PermissionCheckOptions = {},
  ): Promise<boolean> {
    const result = await this.checkPermission(roomId, userId, permission, options);
    return result.hasPermission;
  }

  /**
   * Verificar permisos en lote para múltiples usuarios
   */
  async bulkCheckPermissions(
    checks: BulkPermissionCheck[],
  ): Promise<Map<string, PermissionCheckResult[]>> {
    const results = new Map<string, PermissionCheckResult[]>();

    for (const check of checks) {
      const key = `${check.userId}:${check.roomId}`;
      const checkResults = await this.checkPermissions(
        check.roomId,
        check.userId,
        check.permissions,
        { useCache: true },
      );
      results.set(key, checkResults);
    }

    return results;
  }

  /**
   * Obtener resumen completo de permisos de un usuario
   */
  async getPermissionSummary(
    roomId: string,
    userId: string,
  ): Promise<PermissionSummary> {
    const userRoles = await this.roomModerationService.getUserRoles(
      roomId,
      userId,
    );
    const directPermissions = this.extractDirectPermissions(userRoles);
    const inheritedPermissions = await this.getInheritedPermissions(
      roomId,
      userId,
    );
    const conflicts = await this.detectPermissionConflicts(roomId, userId);

    return {
      userId,
      roomId,
      roles: userRoles.map((role) => role.id),
      permissions: directPermissions,
      inheritedPermissions,
      conflicts,
      lastUpdated: new Date(),
    };
  }

  /**
   * Detectar conflictos de permisos
   */
  async detectPermissionConflicts(
    roomId: string,
    userId: string,
  ): Promise<PermissionConflict[]> {
    const userRoles = await this.roomModerationService.getUserRoles(
      roomId,
      userId,
    );
    const conflicts: PermissionConflict[] = [];

    // Verificar conflictos de jerarquía
    for (let i = 0; i < userRoles.length; i++) {
      for (let j = i + 1; j < userRoles.length; j++) {
        const role1 = userRoles[i];
        const role2 = userRoles[j];

        if (this.hasHierarchyConflict(role1, role2)) {
          conflicts.push({
            type: 'hierarchy',
            description: `Conflicto de jerarquía entre ${role1.name} y ${role2.name}`,
            roles: [role1.id, role2.id],
            severity: 'high',
            recommendation: `Remover el rol de menor jerarquía: ${role1.priority < role2.priority ? role1.name : role2.name}`,
          });
        }
      }
    }

    // Verificar permisos contradictorios
    const allPermissions = userRoles.flatMap((role) => role.permissions);
    const contradictoryPairs = this.getContradictoryPermissions();

    for (const [perm1, perm2] of contradictoryPairs) {
      if (allPermissions.includes(perm1) && allPermissions.includes(perm2)) {
        conflicts.push({
          type: 'contradictory',
          description: `Permisos contradictorios: ${perm1} y ${perm2}`,
          permissions: [perm1, perm2],
          severity: 'medium',
          recommendation:
            'Revisar roles asignados y remover permisos contradictorios',
        });
      }
    }

    return conflicts;
  }

  /**
   * Resolver conflictos de permisos automáticamente
   */
  async resolvePermissionConflicts(
    roomId: string,
    userId: string,
    moderatorId: string,
  ): Promise<{ resolved: number; remaining: PermissionConflict[] }> {
    const conflicts = await this.detectPermissionConflicts(roomId, userId);
    let resolved = 0;

    for (const conflict of conflicts) {
      try {
        if (conflict.type === 'hierarchy' && conflict.roles) {
          // Resolver conflictos de jerarquía removiendo el rol de menor prioridad
          const userRoles = await this.roomModerationService.getUserRoles(
            roomId,
            userId,
          );
          const conflictRoles = userRoles.filter((role) =>
            conflict.roles!.includes(role.id),
          );

          if (conflictRoles.length === 2) {
            const lowerRole =
              conflictRoles[0].priority < conflictRoles[1].priority
                ? conflictRoles[0]
                : conflictRoles[1];

            await this.roomModerationService.removeRole(
              roomId,
              userId,
              lowerRole.id,
              moderatorId,
            );
            resolved++;
          }
        }
      } catch (error) {
        this.logger.warn(
          `No se pudo resolver conflicto automáticamente: ${error.message}`,
        );
      }
    }

    const remainingConflicts = await this.detectPermissionConflicts(
      roomId,
      userId,
    );
    return { resolved, remaining: remainingConflicts };
  }

  /**
   * Invalidar caché de permisos
   */
  invalidatePermissionCache(roomId: string, userId?: string): void {
    if (userId) {
      const cacheKey = `${roomId}:${userId}`;
      this.permissionCache.delete(cacheKey);
    } else {
      // Invalidar todo el caché de la sala
      for (const key of this.permissionCache.keys()) {
        if (key.startsWith(`${roomId}:`)) {
          this.permissionCache.delete(key);
        }
      }
    }

    this.logger.debug(
      `Caché de permisos invalidado para sala ${roomId}${userId ? ` y usuario ${userId}` : ''}`,
    );
  }

  /**
   * Obtener estadísticas de caché de permisos
   */
  getPermissionCacheStats(): {
    size: number;
    hitRate: number;
    entries: Array<{ key: string; lastAccessed: Date; ttl: number }>;
  } {
    const entries = Array.from(this.permissionCache.entries()).map(
      ([key, cache]) => ({
        key,
        lastAccessed: cache.lastAccessed,
        ttl: cache.expiresAt.getTime() - Date.now(),
      }),
    );

    return {
      size: this.permissionCache.size,
      hitRate: this.calculateCacheHitRate(),
      entries,
    };
  }

  // Métodos privados

  private async checkSinglePermission(
    roomId: string,
    userId: string,
    permission: RoomPermission,
    options: PermissionCheckOptions,
  ): Promise<PermissionCheckResult> {
    // Verificar caché si está habilitado
    if (options.useCache) {
      const cached = this.getFromCache(roomId, userId, permission);
      if (cached) {
        return cached;
      }
    }

    // Verificar permiso usando el servicio de moderación
    const result = await this.roomModerationService.checkPermission(
      roomId,
      userId,
      permission,
    );

    // Guardar en caché si está habilitado
    if (options.useCache) {
      this.saveToCache(roomId, userId, permission, result);
    }

    return result;
  }

  private getFromCache(
    roomId: string,
    userId: string,
    permission: RoomPermission,
  ): PermissionCheckResult | null {
    const cacheKey = `${roomId}:${userId}`;
    const cache = this.permissionCache.get(cacheKey);

    if (!cache || cache.expiresAt < new Date()) {
      return null;
    }

    const result = cache.permissions.get(permission);
    if (result) {
      cache.lastAccessed = new Date();
      cache.hits++;
    }

    return result || null;
  }

  private saveToCache(
    roomId: string,
    userId: string,
    permission: RoomPermission,
    result: PermissionCheckResult,
  ): void {
    const cacheKey = `${roomId}:${userId}`;
    let cache = this.permissionCache.get(cacheKey);

    if (!cache) {
      cache = {
        permissions: new Map(),
        expiresAt: new Date(Date.now() + this.CACHE_TTL),
        lastAccessed: new Date(),
        hits: 0,
        misses: 0,
      };
      this.permissionCache.set(cacheKey, cache);
    }

    cache.permissions.set(permission, result);
    cache.misses++;
  }

  private extractDirectPermissions(roles: CustomRole[]): RoomPermission[] {
    const permissions = new Set<RoomPermission>();
    roles.forEach((role) => {
      role.permissions.forEach((permission) => permissions.add(permission));
    });
    return Array.from(permissions);
  }

  private async getInheritedPermissions(
    roomId: string,
    userId: string,
  ): Promise<RoomPermission[]> {
    // Por ahora, no hay herencia compleja implementada
    // En el futuro se podría implementar herencia de grupos, organizaciones, etc.
    return [];
  }

  private hasHierarchyConflict(role1: CustomRole, role2: CustomRole): boolean {
    // Verificar si hay conflicto de jerarquía
    // Por ejemplo, si un usuario tiene tanto rol de Guest como Owner
    const systemRoles = [
      SystemRole.OWNER,
      SystemRole.ADMIN,
      SystemRole.MODERATOR,
      SystemRole.MEMBER,
      SystemRole.GUEST,
    ];

    const role1IsSystem = systemRoles.includes(role1.id as SystemRole);
    const role2IsSystem = systemRoles.includes(role2.id as SystemRole);

    if (role1IsSystem && role2IsSystem) {
      const priority1 = role1.priority;
      const priority2 = role2.priority;

      // Conflicto si la diferencia de prioridad es muy grande (ej: Owner y Guest)
      return Math.abs(priority1 - priority2) > 60;
    }

    return false;
  }

  private getContradictoryPermissions(): Array<
    [RoomPermission, RoomPermission]
  > {
    // Definir pares de permisos que son contradictorios
    return [
      // Por ahora no hay permisos directamente contradictorios
      // En el futuro se podrían agregar, por ejemplo:
      // [RoomPermission.ALLOW_CONTENT, RoomPermission.BLOCK_CONTENT]
    ];
  }

  private getMinimumRoleForPermission(permission: RoomPermission): string {
    // Mapeo de permisos a roles mínimos requeridos
    const permissionRoleMap: Record<RoomPermission, SystemRole> = {
      [RoomPermission.VIEW_ROOM]: SystemRole.GUEST,
      [RoomPermission.VOTE]: SystemRole.GUEST,
      [RoomPermission.REACT]: SystemRole.GUEST,
      [RoomPermission.CHAT]: SystemRole.MEMBER,
      [RoomPermission.SUGGEST_CONTENT]: SystemRole.MEMBER,
      [RoomPermission.INJECT_CONTENT]: SystemRole.MODERATOR,
      [RoomPermission.REMOVE_CONTENT]: SystemRole.MODERATOR,
      [RoomPermission.INVITE_MEMBERS]: SystemRole.MODERATOR,
      [RoomPermission.REMOVE_MEMBERS]: SystemRole.ADMIN,
      [RoomPermission.MUTE_MEMBERS]: SystemRole.MODERATOR,
      [RoomPermission.WARN_MEMBERS]: SystemRole.MODERATOR,
      [RoomPermission.BAN_MEMBERS]: SystemRole.ADMIN,
      [RoomPermission.MANAGE_ROLES]: SystemRole.ADMIN,
      [RoomPermission.MODIFY_SETTINGS]: SystemRole.ADMIN,
      [RoomPermission.VIEW_MODERATION_LOG]: SystemRole.MODERATOR,
      [RoomPermission.MANAGE_TEMPLATES]: SystemRole.ADMIN,
      [RoomPermission.MANAGE_THEMES]: SystemRole.ADMIN,
      [RoomPermission.MANAGE_SCHEDULES]: SystemRole.ADMIN,
      [RoomPermission.VIEW_ANALYTICS]: SystemRole.ADMIN,
      [RoomPermission.EXPORT_DATA]: SystemRole.OWNER,
      [RoomPermission.DELETE_ROOM]: SystemRole.OWNER,
      [RoomPermission.TRANSFER_OWNERSHIP]: SystemRole.OWNER,
      [RoomPermission.MANAGE_INTEGRATIONS]: SystemRole.ADMIN,
      [RoomPermission.VIEW_AUDIT_LOG]: SystemRole.ADMIN,
    };

    return permissionRoleMap[permission] || SystemRole.OWNER;
  }

  private calculateCacheHitRate(): number {
    let totalHits = 0;
    let totalRequests = 0;

    for (const cache of this.permissionCache.values()) {
      totalHits += cache.hits;
      totalRequests += cache.hits + cache.misses;
    }

    return totalRequests > 0 ? totalHits / totalRequests : 0;
  }
}
