import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomMemberGuard } from '../room/guards/room-member.guard';
import { InteractionService } from './interaction.service';
import { CreateVoteDto } from './dto/create-vote.dto';
import { VoteType } from '../../domain/entities/interaction.entity';

@ApiTags('Interactions')
@ApiBearerAuth()
@Controller('rooms/:roomId/interactions')
@UseGuards(JwtAuthGuard, RoomMemberGuard)
export class InteractionController {
  private readonly logger = new Logger(InteractionController.name);

  constructor(private interactionService: InteractionService) {}

  @Post('vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Registrar voto (swipe)',
    description:
      'Registra un voto de like o dislike para el contenido actual del usuario',
  })
  @ApiResponse({
    status: 200,
    description: 'Voto registrado exitosamente',
    schema: {
      type: 'object',
      properties: {
        voteRegistered: { type: 'boolean' },
        nextMediaId: { type: 'string', nullable: true },
        queueCompleted: { type: 'boolean' },
        currentProgress: {
          type: 'object',
          properties: {
            currentIndex: { type: 'number' },
            totalItems: { type: 'number' },
            remainingItems: { type: 'number' },
            progressPercentage: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Datos de voto inválidos' })
  @ApiResponse({ status: 404, description: 'Usuario no es miembro de la sala' })
  async registerVote(
    @Param('roomId') roomId: string,
    @Body() createVoteDto: CreateVoteDto,
    @Request() req: any,
  ) {
    this.logger.log(
      `Registering vote for user ${req.user.sub} in room ${roomId}`,
    );

    return this.interactionService.registerVote(
      req.user.sub,
      roomId,
      createVoteDto,
    );
  }

  @Get('queue/status')
  @ApiOperation({
    summary: 'Obtener estado de la cola',
    description: 'Obtiene el estado actual de la cola de contenido del usuario',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de la cola obtenido exitosamente',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        roomId: { type: 'string' },
        currentMediaId: { type: 'string', nullable: true },
        hasNext: { type: 'boolean' },
        isCompleted: { type: 'boolean' },
        progress: {
          type: 'object',
          properties: {
            currentIndex: { type: 'number' },
            totalItems: { type: 'number' },
            remainingItems: { type: 'number' },
            progressPercentage: { type: 'number' },
          },
        },
      },
    },
  })
  async getQueueStatus(@Param('roomId') roomId: string, @Request() req: any) {
    return this.interactionService.getQueueStatus(req.user.sub, roomId);
  }

  @Get('current-media')
  @ApiOperation({
    summary: 'Obtener contenido actual',
    description:
      'Obtiene los detalles del contenido actual en la cola del usuario',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalles del contenido actual obtenidos exitosamente',
  })
  @ApiResponse({
    status: 204,
    description: 'No hay contenido disponible (cola completada)',
  })
  async getCurrentMedia(@Param('roomId') roomId: string, @Request() req: any) {
    const mediaDetails = await this.interactionService.getCurrentMediaDetails(
      req.user.sub,
      roomId,
    );

    if (!mediaDetails) {
      return { message: 'Cola completada - no hay más contenido disponible' };
    }

    return mediaDetails;
  }

  @Get('votes/history')
  @ApiOperation({
    summary: 'Obtener historial de votos',
    description: 'Obtiene el historial de votos del usuario en la sala',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de votos a retornar (default: 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de votos obtenido exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          roomId: { type: 'string' },
          mediaId: { type: 'string' },
          voteType: { type: 'string', enum: ['like', 'dislike'] },
          timestamp: { type: 'string', format: 'date-time' },
          sessionId: { type: 'string' },
        },
      },
    },
  })
  async getVoteHistory(
    @Param('roomId') roomId: string,
    @Query('limit') limit: string = '50',
    @Request() req: any,
  ) {
    const limitNum = parseInt(limit, 10) || 50;
    return this.interactionService.getUserVoteHistory(
      req.user.sub,
      roomId,
      limitNum,
    );
  }

  @Get('media/:mediaId/votes')
  @ApiOperation({
    summary: 'Obtener votos de contenido específico',
    description:
      'Obtiene todos los votos para un contenido específico en la sala',
  })
  @ApiResponse({
    status: 200,
    description: 'Votos del contenido obtenidos exitosamente',
  })
  async getMediaVotes(
    @Param('roomId') roomId: string,
    @Param('mediaId') mediaId: string,
    @Request() req: any,
  ) {
    return this.interactionService.getMediaVotes(roomId, mediaId);
  }

  @Get('media/:mediaId/consensus')
  @ApiOperation({
    summary: 'Verificar consenso de contenido',
    description:
      'Verifica si hay consenso unánime (todos los miembros activos votaron igual) para un contenido',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de consenso obtenido exitosamente',
    schema: {
      type: 'object',
      properties: {
        isUnanimous: { type: 'boolean' },
        voteType: { type: 'string', enum: ['like', 'dislike'], nullable: true },
        totalVotes: { type: 'number' },
        activeMembers: { type: 'number' },
      },
    },
  })
  async checkConsensus(
    @Param('roomId') roomId: string,
    @Param('mediaId') mediaId: string,
    @Request() req: any,
  ) {
    return this.interactionService.checkUnanimousVote(roomId, mediaId);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Obtener estadísticas de votación',
    description: 'Obtiene estadísticas generales de votación de la sala',
  })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        roomId: { type: 'string' },
        totalVotes: { type: 'number' },
        likesCount: { type: 'number' },
        dislikesCount: { type: 'number' },
        uniqueVoters: { type: 'number' },
        completionRate: { type: 'number' },
        averageProgress: { type: 'number' },
      },
    },
  })
  async getRoomStats(@Param('roomId') roomId: string, @Request() req: any) {
    return this.interactionService.getRoomVoteStats(roomId);
  }

  @Post('session/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión de swipe',
    description: 'Inicia una nueva sesión de swipe para tracking de actividad',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión iniciada exitosamente',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        startedAt: { type: 'string', format: 'date-time' },
        currentIndex: { type: 'number' },
        totalItems: { type: 'number' },
      },
    },
  })
  async startSwipeSession(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ) {
    return this.interactionService.startSwipeSession(req.user.sub, roomId);
  }

  @Get('validate')
  @ApiOperation({
    summary: 'Validar integridad de votos',
    description:
      'Valida la integridad de todos los votos en la sala (solo para debugging/admin)',
  })
  @ApiResponse({
    status: 200,
    description: 'Validación completada',
    schema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean' },
        issues: { type: 'array', items: { type: 'string' } },
        totalVotes: { type: 'number' },
        duplicateVotes: { type: 'number' },
        orphanedVotes: { type: 'number' },
      },
    },
  })
  async validateVoteIntegrity(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ) {
    return this.interactionService.validateVoteIntegrity(roomId);
  }
}
