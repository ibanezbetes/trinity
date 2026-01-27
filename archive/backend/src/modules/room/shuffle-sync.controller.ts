import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
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
import { ShuffleSyncService, ShuffleResult } from './shuffle-sync.service';

export class InjectContentDto {
  mediaIds: string[];
}

@ApiTags('Shuffle & Sync')
@ApiBearerAuth()
@Controller('rooms/:roomId/shuffle-sync')
@UseGuards(JwtAuthGuard, RoomMemberGuard)
export class ShuffleSyncController {
  private readonly logger = new Logger(ShuffleSyncController.name);

  constructor(private shuffleSyncService: ShuffleSyncService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generar Lista Maestra y Listas Desordenadas',
    description:
      'Obtiene contenido de TMDB basado en filtros de la sala y genera listas desordenadas para todos los miembros',
  })
  @ApiResponse({
    status: 200,
    description: 'Listas generadas exitosamente',
    schema: {
      type: 'object',
      properties: {
        masterListUpdated: { type: 'boolean' },
        shuffledListsGenerated: { type: 'number' },
        totalMediaItems: { type: 'number' },
      },
    },
  })
  async generateMasterListAndShuffledLists(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<ShuffleResult> {
    this.logger.log(
      `Generating master list and shuffled lists for room ${roomId} by user ${req.user.sub}`,
    );

    return this.shuffleSyncService.generateMasterListAndShuffledLists(roomId);
  }

  @Post('regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerar Listas Desordenadas',
    description:
      'Regenera las listas desordenadas manteniendo la Lista Maestra existente',
  })
  @ApiResponse({
    status: 200,
    description: 'Listas regeneradas exitosamente',
  })
  async regenerateShuffledLists(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<ShuffleResult> {
    this.logger.log(
      `Regenerating shuffled lists for room ${roomId} by user ${req.user.sub}`,
    );

    return this.shuffleSyncService.regenerateShuffledLists(roomId);
  }

  @Post('inject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Inyectar Nuevo Contenido',
    description:
      'Añade nuevo contenido a la Lista Maestra y actualiza las listas desordenadas',
  })
  @ApiResponse({
    status: 200,
    description: 'Contenido inyectado exitosamente',
  })
  async injectNewContent(
    @Param('roomId') roomId: string,
    @Body() injectContentDto: InjectContentDto,
    @Request() req: any,
  ): Promise<ShuffleResult> {
    this.logger.log(
      `Injecting content for room ${roomId} by user ${req.user.sub}`,
    );

    return this.shuffleSyncService.injectNewContent(
      roomId,
      injectContentDto.mediaIds,
    );
  }

  @Get('verify')
  @ApiOperation({
    summary: 'Verificar Consistencia Shuffle & Sync',
    description:
      'Verifica que todas las listas desordenadas contengan los mismos elementos que la Lista Maestra',
  })
  @ApiResponse({
    status: 200,
    description: 'Verificación de consistencia completada',
    schema: {
      type: 'object',
      properties: {
        isConsistent: { type: 'boolean' },
        masterListSize: { type: 'number' },
        memberListSizes: { type: 'array', items: { type: 'number' } },
        uniqueOrderings: { type: 'boolean' },
        issues: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async verifyShuffleSyncConsistency(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ) {
    this.logger.log(
      `Verifying shuffle sync consistency for room ${roomId} by user ${req.user.sub}`,
    );

    return this.shuffleSyncService.verifyShuffleSyncConsistency(roomId);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Obtener Estadísticas Shuffle & Sync',
    description:
      'Obtiene estadísticas del estado actual del mecanismo Shuffle & Sync',
  })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        masterListSize: { type: 'number' },
        totalMembers: { type: 'number' },
        averageProgress: { type: 'number' },
        listsGenerated: { type: 'boolean' },
        lastUpdate: { type: 'string', format: 'date-time' },
      },
    },
  })
  async getShuffleSyncStats(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ) {
    this.logger.log(
      `Getting shuffle sync stats for room ${roomId} by user ${req.user.sub}`,
    );

    return this.shuffleSyncService.getShuffleSyncStats(roomId);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resetear Listas de la Sala',
    description:
      'Resetea todas las listas de la sala (Lista Maestra y listas desordenadas)',
  })
  @ApiResponse({
    status: 200,
    description: 'Listas reseteadas exitosamente',
  })
  async resetRoomLists(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    this.logger.log(
      `Resetting room lists for room ${roomId} by user ${req.user.sub}`,
    );

    await this.shuffleSyncService.resetRoomLists(roomId);

    return { message: 'Listas de la sala reseteadas exitosamente' };
  }

  @Post('sync-index')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sincronizar Índice del Miembro',
    description:
      'Sincroniza el índice del miembro basándose en los votos existentes. Útil cuando el índice se desincroniza por errores.',
  })
  @ApiResponse({
    status: 200,
    description: 'Índice sincronizado exitosamente',
    schema: {
      type: 'object',
      properties: {
        previousIndex: { type: 'number' },
        newIndex: { type: 'number' },
        votesFound: { type: 'number' },
        synced: { type: 'boolean' },
      },
    },
  })
  async syncMemberIndex(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<{
    previousIndex: number;
    newIndex: number;
    votesFound: number;
    synced: boolean;
  }> {
    this.logger.log(
      `Syncing member index for user ${req.user.sub} in room ${roomId}`,
    );

    return this.shuffleSyncService.syncMemberIndex(roomId, req.user.sub);
  }
}
