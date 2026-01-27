import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomMemberGuard } from './guards/room-member.guard';
import {
  InactiveMemberService,
  InactivityConfig,
} from './inactive-member.service';

export class UpdateInactivityConfigDto {
  warningThresholdMinutes?: number;
  inactiveThresholdMinutes?: number;
  exclusionThresholdMinutes?: number;
  enableAutomaticCleanup?: boolean;
  notificationEnabled?: boolean;
}

@ApiTags('Inactive Members')
@ApiBearerAuth()
@Controller('rooms/:roomId/inactive-members')
@UseGuards(JwtAuthGuard, RoomMemberGuard)
export class InactiveMemberController {
  private readonly logger = new Logger(InactiveMemberController.name);

  constructor(private inactiveMemberService: InactiveMemberService) {}

  @Get('report')
  @ApiOperation({
    summary: 'Obtener reporte de actividad de miembros',
    description:
      'Obtiene un reporte detallado del estado de actividad de todos los miembros de la sala',
  })
  @ApiResponse({
    status: 200,
    description: 'Reporte de actividad obtenido exitosamente',
    schema: {
      type: 'object',
      properties: {
        roomId: { type: 'string' },
        totalMembers: { type: 'number' },
        activeMembers: { type: 'number' },
        warningMembers: { type: 'number' },
        inactiveMembers: { type: 'number' },
        excludedMembers: { type: 'number' },
        lastCheckAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async getActivityReport(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ) {
    this.logger.log(
      `Getting activity report for room ${roomId} by user ${req.user.sub}`,
    );

    return this.inactiveMemberService.checkRoomMemberActivity(roomId);
  }

  @Get('active-for-voting')
  @ApiOperation({
    summary: 'Obtener miembros activos para votación',
    description:
      'Obtiene la lista de miembros que deben ser incluidos en el cálculo de consenso',
  })
  @ApiResponse({
    status: 200,
    description: 'Miembros activos obtenidos exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          role: { type: 'string' },
          status: { type: 'string' },
          lastActivityAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  async getActiveMembersForVoting(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ) {
    return this.inactiveMemberService.getActiveMembersForVoting(roomId);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Obtener estadísticas de actividad',
    description: 'Obtiene estadísticas detalladas de actividad de la sala',
  })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        totalMembers: { type: 'number' },
        activeMembers: { type: 'number' },
        inactiveMembers: { type: 'number' },
        averageInactivityMinutes: { type: 'number' },
        mostInactiveMember: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            minutesInactive: { type: 'number' },
          },
        },
      },
    },
  })
  async getRoomActivityStats(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ) {
    return this.inactiveMemberService.getRoomActivityStats(roomId);
  }

  @Get('member/:userId/status')
  @ApiOperation({
    summary: 'Obtener estado de actividad de un miembro',
    description:
      'Obtiene el estado detallado de actividad de un miembro específico',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de actividad obtenido exitosamente',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        roomId: { type: 'string' },
        status: { type: 'string' },
        lastActivityAt: { type: 'string', format: 'date-time' },
        minutesSinceActivity: { type: 'number' },
        activityLevel: { type: 'string' },
        shouldExcludeFromVoting: { type: 'boolean' },
      },
    },
  })
  async getMemberActivityStatus(
    @Param('roomId') roomId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    const status = await this.inactiveMemberService.getMemberActivityStatus(
      roomId,
      userId,
    );

    if (!status) {
      return { message: 'Miembro no encontrado' };
    }

    return status;
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ejecutar limpieza de miembros inactivos',
    description:
      'Ejecuta manualmente la limpieza de miembros inactivos en la sala',
  })
  @ApiResponse({
    status: 200,
    description: 'Limpieza ejecutada exitosamente',
    schema: {
      type: 'object',
      properties: {
        processed: { type: 'number' },
        warned: { type: 'number' },
        markedInactive: { type: 'number' },
        excluded: { type: 'number' },
      },
    },
  })
  async cleanupInactiveMembers(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ) {
    this.logger.log(
      `Manual cleanup requested for room ${roomId} by user ${req.user.sub}`,
    );

    return this.inactiveMemberService.cleanupInactiveMembers(roomId);
  }

  @Post('member/:userId/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reactivar un miembro',
    description: 'Marca un miembro como activo manualmente',
  })
  @ApiResponse({
    status: 200,
    description: 'Miembro reactivado exitosamente',
  })
  async reactivateMember(
    @Param('roomId') roomId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    this.logger.log(
      `Reactivating member ${userId} in room ${roomId} by user ${req.user.sub}`,
    );

    await this.inactiveMemberService.reactivateMember(roomId, userId);

    return { message: 'Miembro reactivado exitosamente' };
  }

  @Post('member/:userId/mark-active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marcar miembro como activo',
    description:
      'Actualiza la última actividad de un miembro (usado internamente por otras acciones)',
  })
  @ApiResponse({
    status: 200,
    description: 'Actividad actualizada exitosamente',
  })
  async markMemberActive(
    @Param('roomId') roomId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    await this.inactiveMemberService.markMemberActive(roomId, userId);

    return { message: 'Actividad actualizada' };
  }
}

@ApiTags('Inactivity Configuration')
@ApiBearerAuth()
@Controller('admin/inactivity-config')
@UseGuards(JwtAuthGuard)
export class InactivityConfigController {
  private readonly logger = new Logger(InactivityConfigController.name);

  constructor(private inactiveMemberService: InactiveMemberService) {}

  @Get()
  @ApiOperation({
    summary: 'Obtener configuración de inactividad',
    description:
      'Obtiene la configuración actual de manejo de miembros inactivos',
  })
  @ApiResponse({
    status: 200,
    description: 'Configuración obtenida exitosamente',
  })
  async getInactivityConfig(@Request() req: any) {
    return this.inactiveMemberService.getInactivityConfig();
  }

  @Put()
  @ApiOperation({
    summary: 'Actualizar configuración de inactividad',
    description: 'Actualiza la configuración de manejo de miembros inactivos',
  })
  @ApiResponse({
    status: 200,
    description: 'Configuración actualizada exitosamente',
  })
  async updateInactivityConfig(
    @Body() updateConfigDto: UpdateInactivityConfigDto,
    @Request() req: any,
  ) {
    this.logger.log(`Updating inactivity config by user ${req.user.sub}`);

    this.inactiveMemberService.updateInactivityConfig(updateConfigDto);

    return {
      message: 'Configuración actualizada exitosamente',
      config: this.inactiveMemberService.getInactivityConfig(),
    };
  }
}
