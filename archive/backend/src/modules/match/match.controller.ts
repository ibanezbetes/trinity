import {
  Controller,
  Get,
  Post,
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
import { MatchService } from './match.service';

@ApiTags('Matches')
@ApiBearerAuth()
@Controller('rooms/:roomId/matches')
@UseGuards(JwtAuthGuard, RoomMemberGuard)
export class MatchController {
  private readonly logger = new Logger(MatchController.name);

  constructor(private matchService: MatchService) {}

  @Get()
  @ApiOperation({
    summary: 'Obtener matches de la sala',
    description: 'Obtiene todos los matches de consenso de la sala',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de matches a retornar (default: 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'Matches obtenidos exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          roomId: { type: 'string' },
          mediaTitle: { type: 'string' },
          mediaPosterPath: { type: 'string' },
          participantCount: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' },
          consensusType: {
            type: 'string',
            enum: ['unanimous_like', 'majority_like'],
          },
        },
      },
    },
  })
  async getRoomMatches(
    @Param('roomId') roomId: string,
    @Query('limit') limit: string = '50',
    @Request() req: any,
  ) {
    const limitNum = parseInt(limit, 10) || 50;
    return this.matchService.getRoomMatches(roomId, limitNum);
  }

  @Get('library')
  @ApiOperation({
    summary: 'Obtener biblioteca de matches',
    description: 'Obtiene la biblioteca completa de matches con estadísticas',
  })
  @ApiResponse({
    status: 200,
    description: 'Biblioteca de matches obtenida exitosamente',
    schema: {
      type: 'object',
      properties: {
        roomId: { type: 'string' },
        totalMatches: { type: 'number' },
        recentMatches: { type: 'array' },
        matchesByGenre: { type: 'object' },
        averageMatchTime: { type: 'number' },
      },
    },
  })
  async getRoomMatchLibrary(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ) {
    return this.matchService.getRoomMatchLibrary(roomId);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Obtener estadísticas de matches',
    description: 'Obtiene estadísticas detalladas de matches de la sala',
  })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        roomId: { type: 'string' },
        totalMatches: { type: 'number' },
        matchesThisWeek: { type: 'number' },
        averageParticipants: { type: 'number' },
        mostPopularGenre: { type: 'string' },
        fastestMatch: { type: 'number' },
        slowestMatch: { type: 'number' },
        matchRate: { type: 'number' },
      },
    },
  })
  async getMatchStats(@Param('roomId') roomId: string, @Request() req: any) {
    return this.matchService.getMatchStats(roomId);
  }

  @Get(':matchId')
  @ApiOperation({
    summary: 'Obtener detalles de un match específico',
    description: 'Obtiene los detalles completos de un match por su ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalles del match obtenidos exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Match no encontrado',
  })
  async getMatchById(
    @Param('roomId') roomId: string,
    @Param('matchId') matchId: string,
    @Request() req: any,
  ) {
    const match = await this.matchService.getMatchById(matchId);

    if (!match) {
      return { message: 'Match no encontrado' };
    }

    return match;
  }

  @Post('media/:mediaId/detect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detectar match para contenido específico',
    description:
      'Verifica si hay consenso para un contenido específico y crea un match si es necesario',
  })
  @ApiResponse({
    status: 200,
    description: 'Detección de match completada',
    schema: {
      type: 'object',
      properties: {
        hasMatch: { type: 'boolean' },
        matchId: { type: 'string' },
        consensusType: { type: 'string' },
        participants: { type: 'array', items: { type: 'string' } },
        totalVotes: { type: 'number' },
        requiredVotes: { type: 'number' },
      },
    },
  })
  async detectMatch(
    @Param('roomId') roomId: string,
    @Param('mediaId') mediaId: string,
    @Request() req: any,
  ) {
    this.logger.log(
      `Detecting match for media ${mediaId} in room ${roomId} by user ${req.user.sub}`,
    );

    return this.matchService.detectMatch(roomId, mediaId);
  }

  @Post('media/:mediaId/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar matches pendientes',
    description: 'Verifica si hay matches pendientes después de una votación',
  })
  @ApiResponse({
    status: 200,
    description: 'Verificación completada',
  })
  async checkPendingMatches(
    @Param('roomId') roomId: string,
    @Param('mediaId') mediaId: string,
    @Request() req: any,
  ) {
    const match = await this.matchService.checkPendingMatches(roomId, mediaId);

    if (match) {
      return {
        hasNewMatch: true,
        match: {
          id: match.id,
          mediaTitle: match.mediaDetails.title,
          participantCount: match.participants.length,
          createdAt: match.createdAt,
        },
      };
    }

    return { hasNewMatch: false };
  }
}

@ApiTags('User Matches')
@ApiBearerAuth()
@Controller('user/matches')
@UseGuards(JwtAuthGuard)
export class UserMatchController {
  private readonly logger = new Logger(UserMatchController.name);

  constructor(private matchService: MatchService) {}

  @Get('recent')
  @ApiOperation({
    summary: 'Obtener matches recientes del usuario',
    description:
      'Obtiene los matches más recientes de todas las salas del usuario',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de matches a retornar (default: 20)',
  })
  @ApiResponse({
    status: 200,
    description: 'Matches recientes obtenidos exitosamente',
  })
  async getUserRecentMatches(
    @Query('limit') limit: string = '20',
    @Request() req: any,
  ) {
    const limitNum = parseInt(limit, 10) || 20;
    return this.matchService.getUserRecentMatches(req.user.sub, limitNum);
  }
}
