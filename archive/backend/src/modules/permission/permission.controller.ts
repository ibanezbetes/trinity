import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  RequirePermissions,
  RequireAdmin,
} from '../../common/decorators/permissions.decorator';
import {
  PermissionService,
  BulkPermissionCheck,
  PermissionSummary,
} from './permission.service';
import { RoomModerationService } from '../room-moderation/room-moderation.service';
import {
  RoomPermission,
  PermissionCheckResult,
  PermissionConflict,
} from '../../domain/entities/room-moderation.entity';

export class CheckPermissionDto {
  roomId: string;
  permissions: RoomPermission[];
  useCache?: boolean;
  includeInherited?: boolean;
}

export class BulkPermissionCheckDto {
  checks: BulkPermissionCheck[];
}

export class ResolveConflictsDto {
  roomId: string;
  userId: string;
}

/**
 * Controlador para gestión avanzada de permisos
 */
@ApiTags('Permission Management')
@ApiBearerAuth()
@Controller('permissions')
@UseGuards(JwtAuthGuard)
export class PermissionController {
  constructor(
    private permissionService: PermissionService,
    private roomModerationService: RoomModerationService,
  ) {}

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar permisos específicos' })
  @ApiResponse({
    status: 200,
    description: 'Resultado de verificación de permisos',
  })
  async checkPermissions(
    @Body() checkDto: CheckPermissionDto,
    @Request() req: any,
  ): Promise<PermissionCheckResult[]> {
    return this.permissionService.checkPermissions(
      checkDto.roomId,
      req.user.sub,
      checkDto.permissions,
      {
        useCache: checkDto.useCache,
        includeInherited: checkDto.includeInherited,
      },
    );
  }

  @Post('bulk-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar permisos en lote para múltiples usuarios',
  })
  @ApiResponse({
    status: 200,
    description: 'Resultados de verificación en lote',
  })
  @RequirePermissions(RoomPermission.VIEW_MODERATION_LOG)
  @UseGuards(PermissionGuard)
  async bulkCheckPermissions(
    @Body() bulkDto: BulkPermissionCheckDto,
  ): Promise<Record<string, PermissionCheckResult[]>> {
    const results = await this.permissionService.bulkCheckPermissions(
      bulkDto.checks,
    );
    return Object.fromEntries(results);
  }

  @Get('summary/:roomId')
  @ApiOperation({ summary: 'Obtener resumen completo de permisos del usuario' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({ status: 200, description: 'Resumen de permisos del usuario' })
  async getPermissionSummary(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<PermissionSummary> {
    return this.permissionService.getPermissionSummary(roomId, req.user.sub);
  }

  @Get('summary/:roomId/:userId')
  @ApiOperation({
    summary: 'Obtener resumen de permisos de otro usuario (solo moderadores)',
  })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'userId', description: 'ID del usuario objetivo' })
  @ApiResponse({
    status: 200,
    description: 'Resumen de permisos del usuario objetivo',
  })
  @RequirePermissions(RoomPermission.VIEW_MODERATION_LOG)
  @UseGuards(PermissionGuard)
  async getUserPermissionSummary(
    @Param('roomId') roomId: string,
    @Param('userId') userId: string,
  ): Promise<PermissionSummary> {
    return this.permissionService.getPermissionSummary(roomId, userId);
  }

  @Get('conflicts/:roomId')
  @ApiOperation({ summary: 'Detectar conflictos de permisos del usuario' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({ status: 200, description: 'Lista de conflictos de permisos' })
  async detectPermissionConflicts(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<PermissionConflict[]> {
    return this.permissionService.detectPermissionConflicts(
      roomId,
      req.user.sub,
    );
  }

  @Get('conflicts/:roomId/:userId')
  @ApiOperation({
    summary:
      'Detectar conflictos de permisos de otro usuario (solo moderadores)',
  })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'userId', description: 'ID del usuario objetivo' })
  @ApiResponse({
    status: 200,
    description: 'Lista de conflictos de permisos del usuario objetivo',
  })
  @RequirePermissions(RoomPermission.VIEW_MODERATION_LOG)
  @UseGuards(PermissionGuard)
  async detectUserPermissionConflicts(
    @Param('roomId') roomId: string,
    @Param('userId') userId: string,
  ): Promise<PermissionConflict[]> {
    return this.permissionService.detectPermissionConflicts(roomId, userId);
  }

  @Post('resolve-conflicts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolver conflictos de permisos automáticamente' })
  @ApiResponse({
    status: 200,
    description: 'Resultado de resolución de conflictos',
  })
  @RequireAdmin()
  @UseGuards(PermissionGuard)
  async resolvePermissionConflicts(
    @Body() resolveDto: ResolveConflictsDto,
    @Request() req: any,
  ): Promise<{ resolved: number; remaining: PermissionConflict[] }> {
    return this.permissionService.resolvePermissionConflicts(
      resolveDto.roomId,
      resolveDto.userId,
      req.user.sub,
    );
  }

  @Post('cache/invalidate/:roomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Invalidar caché de permisos de una sala' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiQuery({
    name: 'userId',
    description: 'ID del usuario específico (opcional)',
    required: false,
  })
  @ApiResponse({ status: 204, description: 'Caché invalidado exitosamente' })
  @RequireAdmin()
  @UseGuards(PermissionGuard)
  async invalidatePermissionCache(
    @Param('roomId') roomId: string,
    @Query('userId') userId?: string,
  ): Promise<void> {
    this.permissionService.invalidatePermissionCache(roomId, userId);
  }

  @Get('cache/stats')
  @ApiOperation({ summary: 'Obtener estadísticas del caché de permisos' })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas del caché de permisos',
  })
  @RequireAdmin()
  @UseGuards(PermissionGuard)
  async getPermissionCacheStats(): Promise<{
    size: number;
    hitRate: number;
    entries: Array<{ key: string; lastAccessed: Date; ttl: number }>;
  }> {
    return this.permissionService.getPermissionCacheStats();
  }

  @Get('available')
  @ApiOperation({ summary: 'Obtener lista de todos los permisos disponibles' })
  @ApiResponse({ status: 200, description: 'Lista de permisos disponibles' })
  async getAvailablePermissions(): Promise<{
    permissions: Array<{ name: string; description: string; category: string }>;
    categories: string[];
  }> {
    const permissions = Object.values(RoomPermission).map((permission) => ({
      name: permission,
      description: this.getPermissionDescription(permission),
      category: this.getPermissionCategory(permission),
    }));

    const categories = Array.from(new Set(permissions.map((p) => p.category)));

    return { permissions, categories };
  }

  @Get('hierarchy')
  @ApiOperation({ summary: 'Obtener jerarquía de roles y permisos' })
  @ApiResponse({ status: 200, description: 'Jerarquía de roles del sistema' })
  async getPermissionHierarchy(): Promise<{
    systemRoles: Array<{
      id: string;
      name: string;
      priority: number;
      permissions: RoomPermission[];
    }>;
  }> {
    // Esta información podría venir del RoomModerationService
    // Por ahora devolvemos una estructura básica
    return {
      systemRoles: [
        {
          id: 'owner',
          name: 'Propietario',
          priority: 100,
          permissions: Object.values(RoomPermission),
        },
        {
          id: 'admin',
          name: 'Administrador',
          priority: 80,
          permissions: Object.values(RoomPermission).filter(
            (p) =>
              p !== RoomPermission.DELETE_ROOM &&
              p !== RoomPermission.TRANSFER_OWNERSHIP,
          ),
        },
        // ... más roles
      ],
    };
  }

  // Métodos auxiliares privados

  private getPermissionDescription(permission: RoomPermission): string {
    const descriptions: Record<RoomPermission, string> = {
      [RoomPermission.VIEW_ROOM]: 'Ver contenido de la sala',
      [RoomPermission.VOTE]: 'Votar en contenido',
      [RoomPermission.CHAT]: 'Enviar mensajes en chat',
      [RoomPermission.REACT]: 'Reaccionar a contenido',
      [RoomPermission.SUGGEST_CONTENT]: 'Sugerir contenido',
      [RoomPermission.INJECT_CONTENT]: 'Inyectar contenido directamente',
      [RoomPermission.REMOVE_CONTENT]: 'Remover contenido',
      [RoomPermission.INVITE_MEMBERS]: 'Invitar nuevos miembros',
      [RoomPermission.REMOVE_MEMBERS]: 'Remover miembros',
      [RoomPermission.MUTE_MEMBERS]: 'Silenciar miembros',
      [RoomPermission.WARN_MEMBERS]: 'Advertir miembros',
      [RoomPermission.BAN_MEMBERS]: 'Banear miembros',
      [RoomPermission.MANAGE_ROLES]: 'Gestionar roles personalizados',
      [RoomPermission.MODIFY_SETTINGS]: 'Modificar configuración de sala',
      [RoomPermission.VIEW_MODERATION_LOG]: 'Ver historial de moderación',
      [RoomPermission.MANAGE_TEMPLATES]: 'Gestionar plantillas de sala',
      [RoomPermission.MANAGE_THEMES]: 'Gestionar temas de sala',
      [RoomPermission.MANAGE_SCHEDULES]: 'Gestionar programación de sala',
      [RoomPermission.VIEW_ANALYTICS]: 'Ver analíticas de sala',
      [RoomPermission.EXPORT_DATA]: 'Exportar datos de sala',
      [RoomPermission.DELETE_ROOM]: 'Eliminar sala',
      [RoomPermission.TRANSFER_OWNERSHIP]: 'Transferir propiedad',
      [RoomPermission.MANAGE_INTEGRATIONS]: 'Gestionar integraciones',
      [RoomPermission.VIEW_AUDIT_LOG]: 'Ver registro de auditoría',
    };

    return descriptions[permission] || 'Permiso desconocido';
  }

  private getPermissionCategory(permission: RoomPermission): string {
    const categories: Record<RoomPermission, string> = {
      [RoomPermission.VIEW_ROOM]: 'Básico',
      [RoomPermission.VOTE]: 'Básico',
      [RoomPermission.CHAT]: 'Comunicación',
      [RoomPermission.REACT]: 'Comunicación',
      [RoomPermission.SUGGEST_CONTENT]: 'Contenido',
      [RoomPermission.INJECT_CONTENT]: 'Contenido',
      [RoomPermission.REMOVE_CONTENT]: 'Contenido',
      [RoomPermission.INVITE_MEMBERS]: 'Miembros',
      [RoomPermission.REMOVE_MEMBERS]: 'Miembros',
      [RoomPermission.MUTE_MEMBERS]: 'Moderación',
      [RoomPermission.WARN_MEMBERS]: 'Moderación',
      [RoomPermission.BAN_MEMBERS]: 'Moderación',
      [RoomPermission.MANAGE_ROLES]: 'Administración',
      [RoomPermission.MODIFY_SETTINGS]: 'Administración',
      [RoomPermission.VIEW_MODERATION_LOG]: 'Moderación',
      [RoomPermission.MANAGE_TEMPLATES]: 'Administración',
      [RoomPermission.MANAGE_THEMES]: 'Administración',
      [RoomPermission.MANAGE_SCHEDULES]: 'Administración',
      [RoomPermission.VIEW_ANALYTICS]: 'Analíticas',
      [RoomPermission.EXPORT_DATA]: 'Analíticas',
      [RoomPermission.DELETE_ROOM]: 'Propietario',
      [RoomPermission.TRANSFER_OWNERSHIP]: 'Propietario',
      [RoomPermission.MANAGE_INTEGRATIONS]: 'Administración',
      [RoomPermission.VIEW_AUDIT_LOG]: 'Auditoría',
    };

    return categories[permission] || 'Otros';
  }
}
