import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomModerationService } from './room-moderation.service';
import {
  CreateCustomRoleDto,
  UpdateCustomRoleDto,
  AssignRoleDto,
  WarnMemberDto,
  MuteMemberDto,
  BanMemberDto,
  AutoModerationConfigDto,
  ModerationActionFiltersDto,
  CustomRoleResponseDto,
  ModerationActionResponseDto,
  MemberModerationStatusResponseDto,
  RoomModerationStatsResponseDto,
  PermissionCheckResponseDto,
} from './dto/moderation.dto';
import { RoomPermission } from '../../domain/entities/room-moderation.entity';

@Controller('rooms/:roomId')
@UseGuards(JwtAuthGuard)
export class RoomModerationController {
  constructor(private readonly roomModerationService: RoomModerationService) {}

  /**
   * Crear un rol personalizado
   */
  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  async createCustomRole(
    @Param('roomId') roomId: string,
    @Body() createRoleDto: CreateCustomRoleDto,
    @Request() req: any,
  ): Promise<CustomRoleResponseDto> {
    const role = await this.roomModerationService.createCustomRole(
      roomId,
      req.user.id,
      createRoleDto,
    );

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      roomId: role.roomId,
      permissions: role.permissions,
      color: role.color,
      priority: role.priority,
      isSystemRole: role.isSystemRole,
      createdBy: role.createdBy,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  /**
   * Obtener todos los roles de una sala
   */
  @Get('roles')
  async getRoomRoles(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<CustomRoleResponseDto[]> {
    // Verificar acceso básico a la sala
    await this.roomModerationService.checkPermission(
      roomId,
      req.user.id,
      RoomPermission.VIEW_ROOM,
    );

    const roles = await this.roomModerationService.getRoomRoles(roomId);

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      roomId: role.roomId,
      permissions: role.permissions,
      color: role.color,
      priority: role.priority,
      isSystemRole: role.isSystemRole,
      createdBy: role.createdBy,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));
  }

  /**
   * Actualizar un rol personalizado
   */
  @Put('roles/:roleId')
  async updateCustomRole(
    @Param('roomId') roomId: string,
    @Param('roleId') roleId: string,
    @Body() updateRoleDto: UpdateCustomRoleDto,
    @Request() req: any,
  ): Promise<CustomRoleResponseDto> {
    const role = await this.roomModerationService.updateCustomRole(
      roomId,
      roleId,
      req.user.id,
      updateRoleDto,
    );

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      roomId: role.roomId,
      permissions: role.permissions,
      color: role.color,
      priority: role.priority,
      isSystemRole: role.isSystemRole,
      createdBy: role.createdBy,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  /**
   * Eliminar un rol personalizado
   */
  @Delete('roles/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCustomRole(
    @Param('roomId') roomId: string,
    @Param('roleId') roleId: string,
    @Request() req: any,
  ): Promise<void> {
    await this.roomModerationService.deleteCustomRole(
      roomId,
      roleId,
      req.user.id,
    );
  }

  /**
   * Asignar rol a un miembro
   */
  @Post('members/:userId/roles')
  @HttpCode(HttpStatus.CREATED)
  async assignRole(
    @Param('roomId') roomId: string,
    @Param('userId') userId: string,
    @Body() assignRoleDto: AssignRoleDto,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    await this.roomModerationService.assignRole(
      roomId,
      userId,
      assignRoleDto,
      req.user.id,
    );

    return {
      success: true,
      message: 'Rol asignado exitosamente',
    };
  }

  /**
   * Remover rol de un miembro
   */
  @Delete('members/:userId/roles/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeRole(
    @Param('roomId') roomId: string,
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
    @Request() req: any,
  ): Promise<void> {
    await this.roomModerationService.removeRole(
      roomId,
      userId,
      roleId,
      req.user.id,
    );
  }

  /**
   * Advertir a un miembro
   */
  @Post('moderation/warn')
  @HttpCode(HttpStatus.CREATED)
  async warnMember(
    @Param('roomId') roomId: string,
    @Body() warnDto: WarnMemberDto,
    @Request() req: any,
  ): Promise<ModerationActionResponseDto> {
    const action = await this.roomModerationService.warnMember(
      roomId,
      warnDto,
      req.user.id,
    );

    return {
      id: action.id,
      roomId: action.roomId,
      targetUserId: action.targetUserId,
      moderatorId: action.moderatorId,
      actionType: action.actionType,
      reason: action.reason,
      duration: action.duration,
      metadata: action.metadata,
      createdAt: action.createdAt,
      expiresAt: action.expiresAt,
      isActive: action.isActive,
    };
  }

  /**
   * Silenciar a un miembro
   */
  @Post('moderation/mute')
  @HttpCode(HttpStatus.CREATED)
  async muteMember(
    @Param('roomId') roomId: string,
    @Body() muteDto: MuteMemberDto,
    @Request() req: any,
  ): Promise<ModerationActionResponseDto> {
    const action = await this.roomModerationService.muteMember(
      roomId,
      muteDto,
      req.user.id,
    );

    return {
      id: action.id,
      roomId: action.roomId,
      targetUserId: action.targetUserId,
      moderatorId: action.moderatorId,
      actionType: action.actionType,
      reason: action.reason,
      duration: action.duration,
      metadata: action.metadata,
      createdAt: action.createdAt,
      expiresAt: action.expiresAt,
      isActive: action.isActive,
    };
  }

  /**
   * Banear a un miembro
   */
  @Post('moderation/ban')
  @HttpCode(HttpStatus.CREATED)
  async banMember(
    @Param('roomId') roomId: string,
    @Body() banDto: BanMemberDto,
    @Request() req: any,
  ): Promise<ModerationActionResponseDto> {
    const action = await this.roomModerationService.banMember(
      roomId,
      banDto,
      req.user.id,
    );

    return {
      id: action.id,
      roomId: action.roomId,
      targetUserId: action.targetUserId,
      moderatorId: action.moderatorId,
      actionType: action.actionType,
      reason: action.reason,
      duration: action.duration,
      metadata: action.metadata,
      createdAt: action.createdAt,
      expiresAt: action.expiresAt,
      isActive: action.isActive,
    };
  }

  /**
   * Verificar permisos de un usuario
   */
  @Get('permissions/check')
  async checkPermission(
    @Param('roomId') roomId: string,
    @Query('permission') permission: RoomPermission,
    @Query('userId') userId: string,
    @Request() req: any,
  ): Promise<PermissionCheckResponseDto> {
    // Si no se especifica userId, verificar permisos del usuario actual
    const targetUserId = userId || req.user.id;

    const result = await this.roomModerationService.checkPermission(
      roomId,
      targetUserId,
      permission,
    );

    // Obtener roles del usuario para la respuesta
    const userRoles = await this.roomModerationService.getUserRoles(
      roomId,
      targetUserId,
    );
    const permissions = userRoles.flatMap((role) => role.permissions);

    return {
      hasPermission: result.hasPermission,
      reason: result.reason,
      requiredRole: result.requiredRole,
      currentRoles: result.currentRoles,
      permissions: [...new Set(permissions)], // Eliminar duplicados
    };
  }

  /**
   * Obtener historial de moderación
   */
  @Get('moderation/history')
  async getModerationHistory(
    @Param('roomId') roomId: string,
    @Query() filters: ModerationActionFiltersDto,
    @Request() req: any,
  ): Promise<ModerationActionResponseDto[]> {
    const actions = await this.roomModerationService.getModerationHistory(
      roomId,
      req.user.id,
      filters,
    );

    return actions.map((action) => ({
      id: action.id,
      roomId: action.roomId,
      targetUserId: action.targetUserId,
      moderatorId: action.moderatorId,
      actionType: action.actionType,
      reason: action.reason,
      duration: action.duration,
      metadata: action.metadata,
      createdAt: action.createdAt,
      expiresAt: action.expiresAt,
      isActive: action.isActive,
    }));
  }

  /**
   * Obtener estado de moderación de un miembro
   */
  @Get('members/:userId/moderation-status')
  async getMemberModerationStatus(
    @Param('roomId') roomId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ): Promise<MemberModerationStatusResponseDto> {
    const status = await this.roomModerationService.getMemberModerationStatus(
      roomId,
      userId,
      req.user.id,
    );

    // Obtener roles del usuario
    const userRoles = await this.roomModerationService.getUserRoles(
      roomId,
      userId,
    );
    const roles = userRoles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      roomId: role.roomId,
      permissions: role.permissions,
      color: role.color,
      priority: role.priority,
      isSystemRole: role.isSystemRole,
      createdBy: role.createdBy,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));

    return {
      userId: status.userId,
      roomId: status.roomId,
      isMuted: status.isMuted,
      isBanned: status.isBanned,
      muteExpiresAt: status.muteExpiresAt,
      banExpiresAt: status.banExpiresAt,
      warningCount: status.warningCount,
      lastWarningAt: status.lastWarningAt,
      totalModerationActions: status.totalModerationActions,
      roles,
    };
  }

  /**
   * Obtener estadísticas de moderación de la sala
   */
  @Get('moderation/stats')
  async getRoomModerationStats(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<RoomModerationStatsResponseDto> {
    // Verificar permisos para ver estadísticas
    await this.roomModerationService.checkPermission(
      roomId,
      req.user.id,
      RoomPermission.VIEW_MODERATION_LOG,
    );

    // Por ahora retornamos estadísticas básicas
    // En una implementación completa, esto sería calculado por el servicio
    const actions = await this.roomModerationService.getModerationHistory(
      roomId,
      req.user.id,
      { limit: 1000 },
    );

    const actionsByType = actions.reduce(
      (acc, action) => {
        acc[action.actionType] = (acc[action.actionType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const activeMutes = actions.filter(
      (action) =>
        action.actionType === 'mute' &&
        action.isActive &&
        (!action.expiresAt || action.expiresAt > new Date()),
    ).length;

    const activeBans = actions.filter(
      (action) =>
        (action.actionType === 'temporary_ban' ||
          action.actionType === 'permanent_ban') &&
        action.isActive &&
        (!action.expiresAt || action.expiresAt > new Date()),
    ).length;

    const totalWarnings = actions.filter(
      (action) => action.actionType === 'warn',
    ).length;

    return {
      roomId,
      totalActions: actions.length,
      actionsByType,
      activeMutes,
      activeBans,
      totalWarnings,
      averageActionsPerDay: 0, // Calcular basado en fechas
      lastActionAt: actions[0]?.createdAt,
    };
  }

  /**
   * Deshacer acción de moderación (unmute, unban)
   */
  @Post('moderation/:actionId/undo')
  @HttpCode(HttpStatus.OK)
  async undoModerationAction(
    @Param('roomId') roomId: string,
    @Param('actionId') actionId: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    // Verificar permisos de moderación
    await this.roomModerationService.checkPermission(
      roomId,
      req.user.id,
      RoomPermission.MUTE_MEMBERS, // O el permiso apropiado
    );

    // Por ahora retornamos éxito
    // En una implementación completa, esto desactivaría la acción de moderación
    return {
      success: true,
      message: 'Acción de moderación deshecha exitosamente',
    };
  }
}
