import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import {
  CustomRole,
  MemberRoleAssignment,
  ModerationAction,
  MemberModerationStatus,
  AutoModerationConfig,
  RoomPermission,
  ModerationActionType,
  SystemRole,
  PermissionCheckResult,
  RoomModerationStats,
  ModerationActionFilters,
  RoleTemplate,
  RoleTemplateCategory,
} from '../../domain/entities/room-moderation.entity';
import {
  CreateCustomRoleDto,
  UpdateCustomRoleDto,
  AssignRoleDto,
  ModerationActionDto,
  WarnMemberDto,
  MuteMemberDto,
  BanMemberDto,
  AutoModerationConfigDto,
  ModerationActionFiltersDto,
  CreateRoleTemplateDto,
} from './dto/moderation.dto';
import { RoomService } from '../room/room.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Roles del sistema con sus permisos predefinidos
 */
const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, RoomPermission[]> = {
  [SystemRole.OWNER]: Object.values(RoomPermission), // Todos los permisos
  [SystemRole.ADMIN]: [
    RoomPermission.VIEW_ROOM,
    RoomPermission.VOTE,
    RoomPermission.CHAT,
    RoomPermission.REACT,
    RoomPermission.SUGGEST_CONTENT,
    RoomPermission.INJECT_CONTENT,
    RoomPermission.REMOVE_CONTENT,
    RoomPermission.INVITE_MEMBERS,
    RoomPermission.REMOVE_MEMBERS,
    RoomPermission.MANAGE_ROLES,
    RoomPermission.MODIFY_SETTINGS,
    RoomPermission.MUTE_MEMBERS,
    RoomPermission.WARN_MEMBERS,
    RoomPermission.BAN_MEMBERS,
    RoomPermission.VIEW_MODERATION_LOG,
    RoomPermission.MANAGE_TEMPLATES,
  ],
  [SystemRole.MODERATOR]: [
    RoomPermission.VIEW_ROOM,
    RoomPermission.VOTE,
    RoomPermission.CHAT,
    RoomPermission.REACT,
    RoomPermission.SUGGEST_CONTENT,
    RoomPermission.INJECT_CONTENT,
    RoomPermission.REMOVE_CONTENT,
    RoomPermission.INVITE_MEMBERS,
    RoomPermission.MUTE_MEMBERS,
    RoomPermission.WARN_MEMBERS,
    RoomPermission.VIEW_MODERATION_LOG,
  ],
  [SystemRole.MEMBER]: [
    RoomPermission.VIEW_ROOM,
    RoomPermission.VOTE,
    RoomPermission.CHAT,
    RoomPermission.REACT,
    RoomPermission.SUGGEST_CONTENT,
  ],
  [SystemRole.GUEST]: [
    RoomPermission.VIEW_ROOM,
    RoomPermission.VOTE,
    RoomPermission.REACT,
  ],
};

@Injectable()
export class RoomModerationService {
  private readonly logger = new Logger(RoomModerationService.name);

  constructor(
    private dynamoDBService: DynamoDBService,
    private roomService: RoomService,
    private realtimeService: RealtimeCompatibilityService,
  ) {}

  /**
   * Crear un rol personalizado
   */
  async createCustomRole(
    roomId: string,
    userId: string,
    createRoleDto: CreateCustomRoleDto,
  ): Promise<CustomRole> {
    // Verificar permisos
    await this.checkPermission(roomId, userId, RoomPermission.MANAGE_ROLES);

    // Validar que el nombre del rol no exista
    const existingRoles = await this.getRoomRoles(roomId);
    const nameExists = existingRoles.some(
      (role) => role.name.toLowerCase() === createRoleDto.name.toLowerCase(),
    );

    if (nameExists) {
      throw new ConflictException('Ya existe un rol con ese nombre');
    }

    // Validar permisos
    await this.validateRolePermissions(
      createRoleDto.permissions,
      roomId,
      userId,
    );

    const roleId = uuidv4();
    const now = new Date();

    const customRole: CustomRole = {
      id: roleId,
      name: createRoleDto.name,
      description: createRoleDto.description,
      roomId,
      permissions: createRoleDto.permissions,
      color: createRoleDto.color || '#6B7280',
      priority: createRoleDto.priority || 10,
      isSystemRole: false,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: `ROLE#${roleId}`,
        GSI1PK: `ROLE#${roleId}`,
        GSI1SK: `ROOM#${roomId}`,
        ...customRole,
      });

      this.logger.log(
        `Rol personalizado creado: ${roleId} en sala ${roomId} por usuario ${userId}`,
      );
      return customRole;
    } catch (error) {
      this.logger.error(`Error creando rol personalizado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener todos los roles de una sala
   */
  async getRoomRoles(roomId: string): Promise<CustomRole[]> {
    try {
      const result = await this.dynamoDBService.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': DynamoDBKeys.roomPK(roomId),
          ':sk': 'ROLE#',
        },
      });

      const customRoles = (result as any).Items?.map((item: any) => item as CustomRole) || [];

      // Agregar roles del sistema
      const systemRoles: CustomRole[] = Object.entries(
        SYSTEM_ROLE_PERMISSIONS,
      ).map(([role, permissions]) => ({
        id: role,
        name: this.getSystemRoleName(role as SystemRole),
        description: this.getSystemRoleDescription(role as SystemRole),
        roomId,
        permissions,
        color: this.getSystemRoleColor(role as SystemRole),
        priority: this.getSystemRolePriority(role as SystemRole),
        isSystemRole: true,
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      return [...systemRoles, ...customRoles].sort(
        (a, b) => b.priority - a.priority,
      );
    } catch (error) {
      this.logger.error(
        `Error obteniendo roles de sala ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Actualizar un rol personalizado
   */
  async updateCustomRole(
    roomId: string,
    roleId: string,
    userId: string,
    updateRoleDto: UpdateCustomRoleDto,
  ): Promise<CustomRole> {
    // Verificar permisos
    await this.checkPermission(roomId, userId, RoomPermission.MANAGE_ROLES);

    // Verificar que el rol existe y no es del sistema
    const role = await this.getCustomRole(roomId, roleId);
    if (role.isSystemRole) {
      throw new ForbiddenException('No se pueden modificar roles del sistema');
    }

    // Validar permisos si se están actualizando
    if (updateRoleDto.permissions) {
      await this.validateRolePermissions(
        updateRoleDto.permissions,
        roomId,
        userId,
      );
    }

    const updatedRole: CustomRole = {
      ...role,
      ...updateRoleDto,
      updatedAt: new Date(),
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: `ROLE#${roleId}`,
        GSI1PK: `ROLE#${roleId}`,
        GSI1SK: `ROOM#${roomId}`,
        ...updatedRole,
      });

      this.logger.log(
        `Rol actualizado: ${roleId} en sala ${roomId} por usuario ${userId}`,
      );
      return updatedRole;
    } catch (error) {
      this.logger.error(`Error actualizando rol: ${error.message}`);
      throw error;
    }
  }

  /**
   * Eliminar un rol personalizado
   */
  async deleteCustomRole(
    roomId: string,
    roleId: string,
    userId: string,
  ): Promise<void> {
    // Verificar permisos
    await this.checkPermission(roomId, userId, RoomPermission.MANAGE_ROLES);

    // Verificar que el rol existe y no es del sistema
    const role = await this.getCustomRole(roomId, roleId);
    if (role.isSystemRole) {
      throw new ForbiddenException('No se pueden eliminar roles del sistema');
    }

    // Verificar que no hay miembros con este rol
    const membersWithRole = await this.getMembersWithRole(roomId, roleId);
    if (membersWithRole.length > 0) {
      throw new ConflictException(
        'No se puede eliminar un rol que está asignado a miembros',
      );
    }

    try {
      await this.dynamoDBService.deleteItem(
        DynamoDBKeys.roomPK(roomId),
        `ROLE#${roleId}`,
      );

      this.logger.log(
        `Rol eliminado: ${roleId} de sala ${roomId} por usuario ${userId}`,
      );
    } catch (error) {
      this.logger.error(`Error eliminando rol: ${error.message}`);
      throw error;
    }
  }

  /**
   * Asignar rol a un miembro
   */
  async assignRole(
    roomId: string,
    targetUserId: string,
    assignRoleDto: AssignRoleDto,
    moderatorId: string,
  ): Promise<MemberRoleAssignment> {
    // Verificar permisos
    await this.checkPermission(
      roomId,
      moderatorId,
      RoomPermission.MANAGE_ROLES,
    );

    // Verificar que el usuario objetivo es miembro de la sala
    await this.verifyRoomMembership(roomId, targetUserId);

    // Verificar que el rol existe
    const role = await this.getCustomRole(roomId, assignRoleDto.roleId);

    // Verificar jerarquía de roles
    await this.validateRoleHierarchy(roomId, moderatorId, assignRoleDto.roleId);

    const assignmentId = uuidv4();
    const now = new Date();
    const expiresAt = assignRoleDto.expiresAt
      ? new Date(assignRoleDto.expiresAt)
      : undefined;

    const assignment: MemberRoleAssignment = {
      userId: targetUserId,
      roomId,
      roleId: assignRoleDto.roleId,
      assignedBy: moderatorId,
      assignedAt: now,
      expiresAt,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: `MEMBER_ROLE#${targetUserId}#${assignRoleDto.roleId}`,
        GSI1PK: `USER#${targetUserId}`,
        GSI1SK: `ROOM_ROLE#${roomId}#${assignRoleDto.roleId}`,
        id: assignmentId,
        ...assignment,
      });

      // Registrar acción de moderación
      await this.createModerationAction({
        roomId,
        targetUserId,
        moderatorId,
        actionType: ModerationActionType.ROLE_CHANGE,
        reason: `Rol asignado: ${role.name}`,
        metadata: { roleId: assignRoleDto.roleId, roleName: role.name },
      });

      // 🔔 Notificar asignación de rol en tiempo real
      await this.realtimeService.notifyRoleAssignment(roomId, {
        targetUserId,
        roleId: assignRoleDto.roleId,
        roleName: role.name,
        assignedBy: moderatorId,
        action: 'assigned',
      });

      this.logger.log(
        `Rol ${assignRoleDto.roleId} asignado a usuario ${targetUserId} en sala ${roomId}`,
      );
      return assignment;
    } catch (error) {
      this.logger.error(`Error asignando rol: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remover rol de un miembro
   */
  async removeRole(
    roomId: string,
    targetUserId: string,
    roleId: string,
    moderatorId: string,
  ): Promise<void> {
    // Verificar permisos
    await this.checkPermission(
      roomId,
      moderatorId,
      RoomPermission.MANAGE_ROLES,
    );

    // Verificar jerarquía de roles
    await this.validateRoleHierarchy(roomId, moderatorId, roleId);

    try {
      await this.dynamoDBService.deleteItem(
        DynamoDBKeys.roomPK(roomId),
        `MEMBER_ROLE#${targetUserId}#${roleId}`,
      );

      // Registrar acción de moderación
      const role = await this.getCustomRole(roomId, roleId);
      await this.createModerationAction({
        roomId,
        targetUserId,
        moderatorId,
        actionType: ModerationActionType.ROLE_CHANGE,
        reason: `Rol removido: ${role.name}`,
        metadata: { roleId, roleName: role.name, action: 'removed' },
      });

      // 🔔 Notificar remoción de rol en tiempo real
      await this.realtimeService.notifyRoleAssignment(roomId, {
        targetUserId,
        roleId,
        roleName: role.name,
        assignedBy: moderatorId,
        action: 'removed',
      });

      this.logger.log(
        `Rol ${roleId} removido de usuario ${targetUserId} en sala ${roomId}`,
      );
    } catch (error) {
      this.logger.error(`Error removiendo rol: ${error.message}`);
      throw error;
    }
  }

  /**
   * Advertir a un miembro
   */
  async warnMember(
    roomId: string,
    warnDto: WarnMemberDto,
    moderatorId: string,
  ): Promise<ModerationAction> {
    // Verificar permisos
    await this.checkPermission(
      roomId,
      moderatorId,
      RoomPermission.WARN_MEMBERS,
    );

    // Verificar que el usuario objetivo es miembro
    await this.verifyRoomMembership(roomId, warnDto.targetUserId);

    return this.createModerationAction({
      roomId,
      targetUserId: warnDto.targetUserId,
      moderatorId,
      actionType: ModerationActionType.WARN,
      reason: warnDto.reason,
      metadata: warnDto.metadata,
    });
  }

  /**
   * Silenciar a un miembro
   */
  async muteMember(
    roomId: string,
    muteDto: MuteMemberDto,
    moderatorId: string,
  ): Promise<ModerationAction> {
    // Verificar permisos
    await this.checkPermission(
      roomId,
      moderatorId,
      RoomPermission.MUTE_MEMBERS,
    );

    // Verificar que el usuario objetivo es miembro
    await this.verifyRoomMembership(roomId, muteDto.targetUserId);

    const duration = muteDto.duration || 60; // Por defecto 1 hora
    const expiresAt = new Date(Date.now() + duration * 60 * 1000);

    return this.createModerationAction({
      roomId,
      targetUserId: muteDto.targetUserId,
      moderatorId,
      actionType: ModerationActionType.MUTE,
      reason: muteDto.reason,
      duration,
      expiresAt,
      metadata: muteDto.metadata,
    });
  }

  /**
   * Banear a un miembro
   */
  async banMember(
    roomId: string,
    banDto: BanMemberDto,
    moderatorId: string,
  ): Promise<ModerationAction> {
    // Verificar permisos
    await this.checkPermission(roomId, moderatorId, RoomPermission.BAN_MEMBERS);

    // Verificar que el usuario objetivo es miembro
    await this.verifyRoomMembership(roomId, banDto.targetUserId);

    const actionType =
      banDto.duration === 0
        ? ModerationActionType.PERMANENT_BAN
        : ModerationActionType.TEMPORARY_BAN;

    const expiresAt =
      banDto.duration && banDto.duration > 0
        ? new Date(Date.now() + banDto.duration * 60 * 1000)
        : undefined;

    return this.createModerationAction({
      roomId,
      targetUserId: banDto.targetUserId,
      moderatorId,
      actionType,
      reason: banDto.reason,
      duration: banDto.duration,
      expiresAt,
      metadata: banDto.metadata,
    });
  }

  /**
   * Verificar si un usuario tiene un permiso específico
   */
  async checkPermission(
    roomId: string,
    userId: string,
    permission: RoomPermission,
  ): Promise<PermissionCheckResult> {
    try {
      // Obtener roles del usuario
      const userRoles = await this.getUserRolesInternal(roomId, userId);

      // Verificar si algún rol tiene el permiso
      const hasPermission = userRoles.some((role) =>
        role.permissions.includes(permission),
      );

      const result: PermissionCheckResult = {
        hasPermission,
        currentRoles: userRoles.map((role) => role.id),
      };

      if (!hasPermission) {
        result.reason = `Permiso requerido: ${permission}`;
        result.requiredRole = this.getMinimumRoleForPermission(permission);
      }

      if (!hasPermission) {
        throw new ForbiddenException(
          `No tienes permisos para realizar esta acción: ${permission}`,
        );
      }

      return result;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`Error verificando permisos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener historial de moderación
   */
  async getModerationHistory(
    roomId: string,
    userId: string,
    filters: ModerationActionFiltersDto,
  ): Promise<ModerationAction[]> {
    // Verificar permisos
    await this.checkPermission(
      roomId,
      userId,
      RoomPermission.VIEW_MODERATION_LOG,
    );

    try {
      const queryParams: any = {
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': DynamoDBKeys.roomPK(roomId),
          ':sk': 'MODERATION#',
        },
        ScanIndexForward: false, // Más recientes primero
        Limit: filters.limit || 20,
      };

      // Aplicar filtros adicionales
      if (
        filters.actionType ||
        filters.targetUserId ||
        filters.moderatorId ||
        filters.isActive !== undefined
      ) {
        const filterExpressions: string[] = [];

        if (filters.actionType) {
          queryParams.ExpressionAttributeValues[':actionType'] =
            filters.actionType;
          filterExpressions.push('actionType = :actionType');
        }

        if (filters.targetUserId) {
          queryParams.ExpressionAttributeValues[':targetUserId'] =
            filters.targetUserId;
          filterExpressions.push('targetUserId = :targetUserId');
        }

        if (filters.moderatorId) {
          queryParams.ExpressionAttributeValues[':moderatorId'] =
            filters.moderatorId;
          filterExpressions.push('moderatorId = :moderatorId');
        }

        if (filters.isActive !== undefined) {
          queryParams.ExpressionAttributeValues[':isActive'] = filters.isActive;
          filterExpressions.push('isActive = :isActive');
        }

        if (filterExpressions.length > 0) {
          queryParams.FilterExpression = filterExpressions.join(' AND ');
        }
      }

      const result = await this.dynamoDBService.query(queryParams);
      return (result as any).Items?.map((item: any) => item as ModerationAction) || [];
    } catch (error) {
      this.logger.error(
        `Error obteniendo historial de moderación: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener estado de moderación de un miembro
   */
  async getMemberModerationStatus(
    roomId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<MemberModerationStatus> {
    // Verificar permisos
    await this.checkPermission(
      roomId,
      requesterId,
      RoomPermission.VIEW_MODERATION_LOG,
    );

    try {
      // Obtener acciones activas de moderación
      const activeActions = await this.getActiveModerationActions(
        roomId,
        targetUserId,
      );

      // Calcular estado
      const muteAction = activeActions.find(
        (action) => action.actionType === ModerationActionType.MUTE,
      );
      const banAction = activeActions.find(
        (action) =>
          action.actionType === ModerationActionType.TEMPORARY_BAN ||
          action.actionType === ModerationActionType.PERMANENT_BAN,
      );

      const warnings = await this.getUserWarnings(roomId, targetUserId);

      const status: MemberModerationStatus = {
        userId: targetUserId,
        roomId,
        isMuted: !!muteAction,
        isBanned: !!banAction,
        muteExpiresAt: muteAction?.expiresAt,
        banExpiresAt: banAction?.expiresAt,
        warningCount: warnings.length,
        lastWarningAt: warnings[0]?.createdAt,
        totalModerationActions: activeActions.length,
      };

      return status;
    } catch (error) {
      this.logger.error(
        `Error obteniendo estado de moderación: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener roles de un usuario (método público para el controlador)
   */
  async getUserRoles(roomId: string, userId: string): Promise<CustomRole[]> {
    return this.getUserRolesInternal(roomId, userId);
  }

  // Métodos auxiliares privados

  private async getCustomRole(
    roomId: string,
    roleId: string,
  ): Promise<CustomRole> {
    // Verificar si es un rol del sistema
    if (Object.values(SystemRole).includes(roleId as SystemRole)) {
      const systemRole = roleId as SystemRole;
      return {
        id: roleId,
        name: this.getSystemRoleName(systemRole),
        description: this.getSystemRoleDescription(systemRole),
        roomId,
        permissions: SYSTEM_ROLE_PERMISSIONS[systemRole],
        color: this.getSystemRoleColor(systemRole),
        priority: this.getSystemRolePriority(systemRole),
        isSystemRole: true,
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    const result = await this.dynamoDBService.getItem(
      DynamoDBKeys.roomPK(roomId),
      `ROLE#${roleId}`,
    );

    if (!result) {
      throw new NotFoundException('Rol no encontrado');
    }

    return result as unknown as CustomRole;
  }

  private async getUserRolesInternal(
    roomId: string,
    userId: string,
  ): Promise<CustomRole[]> {
    try {
      // Obtener asignaciones de roles del usuario
      const result = await this.dynamoDBService.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': DynamoDBKeys.roomPK(roomId),
          ':sk': `MEMBER_ROLE#${userId}#`,
        },
      });

      const assignments =
        (result as any).Items?.map((item: any) => item as MemberRoleAssignment) || [];

      // Filtrar asignaciones expiradas
      const activeAssignments = assignments.filter(
        (assignment) =>
          !assignment.expiresAt || assignment.expiresAt > new Date(),
      );

      // Obtener información de los roles
      const roles: CustomRole[] = [];
      for (const assignment of activeAssignments) {
        try {
          const role = await this.getCustomRole(roomId, assignment.roleId);
          roles.push(role);
        } catch (error) {
          this.logger.warn(`Rol no encontrado: ${assignment.roleId}`);
        }
      }

      // Si no tiene roles asignados, asignar rol de miembro por defecto
      if (roles.length === 0) {
        const memberRole = await this.getCustomRole(roomId, SystemRole.MEMBER);
        roles.push(memberRole);
      }

      return roles.sort((a, b) => b.priority - a.priority);
    } catch (error) {
      this.logger.error(`Error obteniendo roles de usuario: ${error.message}`);
      throw error;
    }
  }

  private async createModerationAction(params: {
    roomId: string;
    targetUserId: string;
    moderatorId: string;
    actionType: ModerationActionType;
    reason: string;
    duration?: number;
    expiresAt?: Date;
    metadata?: Record<string, any>;
  }): Promise<ModerationAction> {
    const actionId = uuidv4();
    const now = new Date();

    const action: ModerationAction = {
      id: actionId,
      roomId: params.roomId,
      targetUserId: params.targetUserId,
      moderatorId: params.moderatorId,
      actionType: params.actionType,
      reason: params.reason,
      duration: params.duration,
      metadata: params.metadata,
      createdAt: now,
      expiresAt: params.expiresAt,
      isActive: true,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(params.roomId),
        SK: `MODERATION#${actionId}`,
        GSI1PK: `USER#${params.targetUserId}`,
        GSI1SK: `MODERATION#${now.toISOString()}`,
        ...action,
      });

      // 🔔 Notificar acción de moderación en tiempo real
      await this.realtimeService.notifyModerationAction(params.roomId, {
        targetUserId: params.targetUserId,
        moderatorId: params.moderatorId,
        actionType: params.actionType,
        reason: params.reason,
        duration: params.duration,
        expiresAt: params.expiresAt?.toISOString(),
      });

      this.logger.log(
        `Acción de moderación creada: ${actionId} - ${params.actionType}`,
      );
      return action;
    } catch (error) {
      this.logger.error(`Error creando acción de moderación: ${error.message}`);
      throw error;
    }
  }

  private async validateRolePermissions(
    permissions: RoomPermission[],
    roomId: string,
    userId: string,
  ): Promise<void> {
    // Verificar que el usuario tiene todos los permisos que está intentando asignar
    for (const permission of permissions) {
      await this.checkPermission(roomId, userId, permission);
    }
  }

  private async validateRoleHierarchy(
    roomId: string,
    moderatorId: string,
    targetRoleId: string,
  ): Promise<void> {
    const moderatorRoles = await this.getUserRolesInternal(roomId, moderatorId);
    const targetRole = await this.getCustomRole(roomId, targetRoleId);

    const maxModeratorPriority = Math.max(
      ...moderatorRoles.map((role) => role.priority),
    );

    if (targetRole.priority >= maxModeratorPriority) {
      throw new ForbiddenException(
        'No puedes asignar un rol de igual o mayor jerarquía',
      );
    }
  }

  private async verifyRoomMembership(
    roomId: string,
    userId: string,
  ): Promise<void> {
    try {
      const room = await this.roomService.getRoom(roomId);
      const isMember = room && (room as any).members?.some((member: any) => member.userId === userId);

      if (!isMember) {
        throw new ForbiddenException('El usuario no es miembro de la sala');
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Sala no encontrada');
      }
      throw error;
    }
  }

  private async getMembersWithRole(
    roomId: string,
    roleId: string,
  ): Promise<MemberRoleAssignment[]> {
    const result = await this.dynamoDBService.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: 'roleId = :roleId',
      ExpressionAttributeValues: {
        ':pk': DynamoDBKeys.roomPK(roomId),
        ':sk': 'MEMBER_ROLE#',
        ':roleId': roleId,
      },
    });

    return (result as any).Items?.map((item: any) => item as MemberRoleAssignment) || [];
  }

  private async getActiveModerationActions(
    roomId: string,
    userId: string,
  ): Promise<ModerationAction[]> {
    const result = await this.dynamoDBService.query({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
      FilterExpression:
        'roomId = :roomId AND isActive = :isActive AND (attribute_not_exists(expiresAt) OR expiresAt > :now)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'MODERATION#',
        ':roomId': roomId,
        ':isActive': true,
        ':now': new Date().toISOString(),
      },
    });

    return (result as any).Items?.map((item: any) => item as ModerationAction) || [];
  }

  private async getUserWarnings(
    roomId: string,
    userId: string,
  ): Promise<ModerationAction[]> {
    const result = await this.dynamoDBService.query({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
      FilterExpression: 'roomId = :roomId AND actionType = :actionType',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'MODERATION#',
        ':roomId': roomId,
        ':actionType': ModerationActionType.WARN,
      },
      ScanIndexForward: false,
    });

    return (result as any).Items?.map((item: any) => item as ModerationAction) || [];
  }

  private getSystemRoleName(role: SystemRole): string {
    const names = {
      [SystemRole.OWNER]: 'Propietario',
      [SystemRole.ADMIN]: 'Administrador',
      [SystemRole.MODERATOR]: 'Moderador',
      [SystemRole.MEMBER]: 'Miembro',
      [SystemRole.GUEST]: 'Invitado',
    };
    return names[role];
  }

  private getSystemRoleDescription(role: SystemRole): string {
    const descriptions = {
      [SystemRole.OWNER]: 'Propietario de la sala con todos los permisos',
      [SystemRole.ADMIN]: 'Administrador con permisos de gestión completos',
      [SystemRole.MODERATOR]:
        'Moderador con permisos de moderación y contenido',
      [SystemRole.MEMBER]: 'Miembro regular con permisos básicos',
      [SystemRole.GUEST]: 'Invitado con permisos limitados',
    };
    return descriptions[role];
  }

  private getSystemRoleColor(role: SystemRole): string {
    const colors = {
      [SystemRole.OWNER]: '#DC2626',
      [SystemRole.ADMIN]: '#EA580C',
      [SystemRole.MODERATOR]: '#D97706',
      [SystemRole.MEMBER]: '#059669',
      [SystemRole.GUEST]: '#6B7280',
    };
    return colors[role];
  }

  private getSystemRolePriority(role: SystemRole): number {
    const priorities = {
      [SystemRole.OWNER]: 100,
      [SystemRole.ADMIN]: 80,
      [SystemRole.MODERATOR]: 60,
      [SystemRole.MEMBER]: 40,
      [SystemRole.GUEST]: 20,
    };
    return priorities[role];
  }

  private getMinimumRoleForPermission(permission: RoomPermission): string {
    // Encontrar el rol mínimo que tiene este permiso
    for (const [role, permissions] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
      if (permissions.includes(permission)) {
        return role;
      }
    }
    return SystemRole.OWNER;
  }
}
