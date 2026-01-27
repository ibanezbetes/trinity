import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
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
import { ContentSuggestionService } from './content-suggestion.service';
import {
  CreateSuggestionDto,
  UpdateSuggestionDto,
  VoteSuggestionDto,
  CommentSuggestionDto,
  ReviewSuggestionDto,
  SuggestionFiltersDto,
  CreateSuggestionConfigDto,
  UpdateSuggestionConfigDto,
  CreateSuggestionTemplateDto,
  UpdateNotificationConfigDto,
  SuggestionStatsQueryDto,
} from './dto/content-suggestion.dto';
import {
  ContentSuggestion,
  SuggestionSearchResult,
  RoomSuggestionConfig,
  RoomSuggestionStats,
  SuggestionTemplate,
  SuggestionNotificationConfig,
} from '../../domain/entities/content-suggestion.entity';

@ApiTags('Content Suggestions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rooms/:roomId/suggestions')
export class ContentSuggestionController {
  constructor(
    private readonly contentSuggestionService: ContentSuggestionService,
  ) {}

  /**
   * Crear sugerencia de contenido
   */
  @Post()
  @ApiOperation({ summary: 'Crear sugerencia de contenido' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 201,
    description: 'Sugerencia creada exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: 403,
    description: 'Sin permisos para sugerir contenido',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de sugerencia inválidos o límites excedidos',
  })
  async createSuggestion(
    @Param('roomId') roomId: string,
    @Body() createSuggestionDto: CreateSuggestionDto,
    @Request() req: any,
  ): Promise<ContentSuggestion> {
    const { userId, username } = req.user;
    return this.contentSuggestionService.createSuggestion(
      roomId,
      userId,
      username,
      createSuggestionDto,
    );
  }

  /**
   * Obtener sugerencias con filtros
   */
  @Get()
  @ApiOperation({ summary: 'Obtener sugerencias de contenido' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiQuery({
    name: 'suggestedBy',
    required: false,
    description: 'Filtrar por usuario',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filtrar por tipo de contenido',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filtrar por estado',
  })
  @ApiQuery({
    name: 'genre',
    required: false,
    description: 'Filtrar por género',
  })
  @ApiQuery({
    name: 'minScore',
    required: false,
    type: Number,
    description: 'Puntuación mínima',
  })
  @ApiQuery({
    name: 'maxScore',
    required: false,
    type: Number,
    description: 'Puntuación máxima',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Fecha desde (ISO)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'Fecha hasta (ISO)',
  })
  @ApiQuery({
    name: 'searchText',
    required: false,
    description: 'Buscar en título/descripción',
  })
  @ApiQuery({
    name: 'hasComments',
    required: false,
    type: Boolean,
    description: 'Con comentarios',
  })
  @ApiQuery({
    name: 'minVotes',
    required: false,
    type: Number,
    description: 'Votos mínimos',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Campo para ordenar',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    description: 'Orden (asc/desc)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de resultados',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Offset para paginación',
  })
  @ApiResponse({
    status: 200,
    description: 'Sugerencias obtenidas exitosamente',
    type: Object,
  })
  async getSuggestions(
    @Param('roomId') roomId: string,
    @Query() filters: SuggestionFiltersDto,
    @Request() req: any,
  ): Promise<SuggestionSearchResult> {
    const { userId } = req.user;
    return this.contentSuggestionService.getSuggestions(
      roomId,
      userId,
      filters,
    );
  }

  /**
   * Obtener sugerencia específica
   */
  @Get(':suggestionId')
  @ApiOperation({ summary: 'Obtener sugerencia específica' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'suggestionId', description: 'ID de la sugerencia' })
  @ApiResponse({
    status: 200,
    description: 'Sugerencia obtenida exitosamente',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Sugerencia no encontrada' })
  async getSuggestion(
    @Param('roomId') roomId: string,
    @Param('suggestionId') suggestionId: string,
    @Request() req: any,
  ): Promise<ContentSuggestion> {
    // Esta funcionalidad se implementaría en el servicio
    // Por ahora retornamos un placeholder
    throw new Error('Not implemented yet');
  }

  /**
   * Votar en sugerencia
   */
  @Post(':suggestionId/vote')
  @ApiOperation({ summary: 'Votar en sugerencia de contenido' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'suggestionId', description: 'ID de la sugerencia' })
  @ApiResponse({
    status: 201,
    description: 'Voto registrado exitosamente',
    type: Object,
  })
  @ApiResponse({ status: 403, description: 'Sin permisos para votar' })
  @ApiResponse({
    status: 400,
    description: 'No se puede votar en esta sugerencia',
  })
  async voteSuggestion(
    @Param('roomId') roomId: string,
    @Param('suggestionId') suggestionId: string,
    @Body() voteDto: VoteSuggestionDto,
    @Request() req: any,
  ): Promise<ContentSuggestion> {
    const { userId, username } = req.user;
    return this.contentSuggestionService.voteSuggestion(
      roomId,
      suggestionId,
      userId,
      username,
      voteDto,
    );
  }

  /**
   * Comentar en sugerencia
   */
  @Post(':suggestionId/comments')
  @ApiOperation({ summary: 'Comentar en sugerencia de contenido' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'suggestionId', description: 'ID de la sugerencia' })
  @ApiResponse({
    status: 201,
    description: 'Comentario agregado exitosamente',
    type: Object,
  })
  @ApiResponse({ status: 403, description: 'Sin permisos para comentar' })
  async commentSuggestion(
    @Param('roomId') roomId: string,
    @Param('suggestionId') suggestionId: string,
    @Body() commentDto: CommentSuggestionDto,
    @Request() req: any,
  ): Promise<ContentSuggestion> {
    const { userId, username } = req.user;
    return this.contentSuggestionService.commentSuggestion(
      roomId,
      suggestionId,
      userId,
      username,
      commentDto,
    );
  }

  /**
   * Revisar sugerencia (aprobar/rechazar)
   */
  @Post(':suggestionId/review')
  @ApiOperation({ summary: 'Revisar sugerencia (aprobar/rechazar)' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'suggestionId', description: 'ID de la sugerencia' })
  @ApiResponse({
    status: 200,
    description: 'Sugerencia revisada exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: 403,
    description: 'Sin permisos para revisar sugerencias',
  })
  @ApiResponse({ status: 400, description: 'Sugerencia no puede ser revisada' })
  async reviewSuggestion(
    @Param('roomId') roomId: string,
    @Param('suggestionId') suggestionId: string,
    @Body() reviewDto: ReviewSuggestionDto,
    @Request() req: any,
  ): Promise<ContentSuggestion> {
    const { userId } = req.user;
    return this.contentSuggestionService.reviewSuggestion(
      roomId,
      suggestionId,
      userId,
      reviewDto,
    );
  }

  /**
   * Implementar sugerencia (agregar a cola)
   */
  @Post(':suggestionId/implement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Implementar sugerencia aprobada' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'suggestionId', description: 'ID de la sugerencia' })
  @ApiResponse({
    status: 200,
    description: 'Sugerencia implementada exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: 403,
    description: 'Sin permisos para implementar sugerencias',
  })
  @ApiResponse({
    status: 400,
    description: 'Solo se pueden implementar sugerencias aprobadas',
  })
  async implementSuggestion(
    @Param('roomId') roomId: string,
    @Param('suggestionId') suggestionId: string,
    @Request() req: any,
  ): Promise<ContentSuggestion> {
    const { userId } = req.user;
    return this.contentSuggestionService.implementSuggestion(
      roomId,
      suggestionId,
      userId,
    );
  }

  /**
   * Configurar sugerencias de sala
   */
  @Post('config')
  @ApiOperation({ summary: 'Configurar sugerencias de sala' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 201,
    description: 'Configuración creada exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: 403,
    description: 'Sin permisos para configurar sugerencias',
  })
  async createSuggestionConfig(
    @Param('roomId') roomId: string,
    @Body() configDto: CreateSuggestionConfigDto,
    @Request() req: any,
  ): Promise<RoomSuggestionConfig> {
    const { userId } = req.user;
    return this.contentSuggestionService.configureSuggestionConfig(
      roomId,
      userId,
      configDto,
    );
  }

  /**
   * Actualizar configuración de sugerencias
   */
  @Put('config')
  @ApiOperation({ summary: 'Actualizar configuración de sugerencias' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 200,
    description: 'Configuración actualizada exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: 403,
    description: 'Sin permisos para configurar sugerencias',
  })
  async updateSuggestionConfig(
    @Param('roomId') roomId: string,
    @Body() configDto: UpdateSuggestionConfigDto,
    @Request() req: any,
  ): Promise<RoomSuggestionConfig> {
    const { userId } = req.user;
    return this.contentSuggestionService.configureSuggestionConfig(
      roomId,
      userId,
      configDto,
    );
  }

  /**
   * Obtener configuración de sugerencias
   */
  @Get('config')
  @ApiOperation({ summary: 'Obtener configuración de sugerencias' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 200,
    description: 'Configuración obtenida exitosamente',
    type: Object,
  })
  async getSuggestionConfig(
    @Param('roomId') roomId: string,
  ): Promise<RoomSuggestionConfig> {
    return this.contentSuggestionService.getSuggestionConfig(roomId);
  }

  /**
   * Obtener estadísticas de sugerencias
   */
  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de sugerencias' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Fecha desde (ISO)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'Fecha hasta (ISO)',
  })
  @ApiQuery({
    name: 'includeUserDetails',
    required: false,
    type: Boolean,
    description: 'Incluir detalles por usuario',
  })
  @ApiQuery({
    name: 'includeGenreTrends',
    required: false,
    type: Boolean,
    description: 'Incluir tendencias por género',
  })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas obtenidas exitosamente',
    type: Object,
  })
  async getSuggestionStats(
    @Param('roomId') roomId: string,
    @Query() queryDto: SuggestionStatsQueryDto,
    @Request() req: any,
  ): Promise<RoomSuggestionStats> {
    const { userId } = req.user;
    return this.contentSuggestionService.getSuggestionStats(roomId, userId);
  }

  /**
   * Buscar sugerencias
   */
  @Get('search')
  @ApiOperation({ summary: 'Buscar sugerencias de contenido' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiQuery({ name: 'q', description: 'Término de búsqueda' })
  @ApiQuery({ name: 'type', required: false, description: 'Filtrar por tipo' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filtrar por estado',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de resultados',
  })
  @ApiResponse({
    status: 200,
    description: 'Búsqueda completada exitosamente',
    type: Object,
  })
  async searchSuggestions(
    @Param('roomId') roomId: string,
    @Query('q') searchText: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ): Promise<SuggestionSearchResult> {
    const { userId } = req.user;
    const filters: SuggestionFiltersDto = {
      searchText,
      type: type as any,
      status: status as any,
      limit: limit || 20,
      sortOrder: 'desc',
    };
    return this.contentSuggestionService.getSuggestions(
      roomId,
      userId,
      filters,
    );
  }

  /**
   * Obtener sugerencias pendientes
   */
  @Get('pending')
  @ApiOperation({ summary: 'Obtener sugerencias pendientes de aprobación' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de resultados',
  })
  @ApiResponse({
    status: 200,
    description: 'Sugerencias pendientes obtenidas exitosamente',
    type: Object,
  })
  async getPendingSuggestions(
    @Param('roomId') roomId: string,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ): Promise<SuggestionSearchResult> {
    const { userId } = req.user;
    const filters: SuggestionFiltersDto = {
      status: 'pending' as any,
      limit: limit || 20,
      sortBy: 'createdAt',
      sortOrder: 'asc',
    };
    return this.contentSuggestionService.getSuggestions(
      roomId,
      userId,
      filters,
    );
  }

  /**
   * Obtener sugerencias populares
   */
  @Get('popular')
  @ApiOperation({ summary: 'Obtener sugerencias más populares' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de resultados',
  })
  @ApiQuery({
    name: 'timeframe',
    required: false,
    description: 'Marco temporal (week, month, all)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sugerencias populares obtenidas exitosamente',
    type: Object,
  })
  async getPopularSuggestions(
    @Param('roomId') roomId: string,
    @Query('limit') limit?: number,
    @Query('timeframe') timeframe?: string,
    @Request() req?: any,
  ): Promise<SuggestionSearchResult> {
    const { userId } = req.user;

    // Calcular fecha desde basada en timeframe
    let dateFrom: Date | undefined;
    if (timeframe === 'week') {
      dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeframe === 'month') {
      dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const filters: SuggestionFiltersDto = {
      dateFrom,
      limit: limit || 20,
      sortBy: 'voteScore',
      sortOrder: 'desc',
      minVotes: 1,
    };
    return this.contentSuggestionService.getSuggestions(
      roomId,
      userId,
      filters,
    );
  }

  /**
   * Obtener mis sugerencias
   */
  @Get('my-suggestions')
  @ApiOperation({ summary: 'Obtener mis sugerencias' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filtrar por estado',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de resultados',
  })
  @ApiResponse({
    status: 200,
    description: 'Mis sugerencias obtenidas exitosamente',
    type: Object,
  })
  async getMySuggestions(
    @Param('roomId') roomId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ): Promise<SuggestionSearchResult> {
    const { userId } = req.user;
    const filters: SuggestionFiltersDto = {
      suggestedBy: userId,
      status: status as any,
      limit: limit || 20,
      sortOrder: 'desc',
    };
    return this.contentSuggestionService.getSuggestions(
      roomId,
      userId,
      filters,
    );
  }

  /**
   * Obtener sugerencias por género
   */
  @Get('by-genre/:genre')
  @ApiOperation({ summary: 'Obtener sugerencias por género' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'genre', description: 'Género de contenido' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de resultados',
  })
  @ApiResponse({
    status: 200,
    description: 'Sugerencias por género obtenidas exitosamente',
    type: Object,
  })
  async getSuggestionsByGenre(
    @Param('roomId') roomId: string,
    @Param('genre') genre: string,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ): Promise<SuggestionSearchResult> {
    const { userId } = req.user;
    const filters: SuggestionFiltersDto = {
      genre,
      limit: limit || 20,
      sortBy: 'voteScore',
      sortOrder: 'desc',
    };
    return this.contentSuggestionService.getSuggestions(
      roomId,
      userId,
      filters,
    );
  }

  /**
   * Obtener resumen de actividad de sugerencias
   */
  @Get('activity-summary')
  @ApiOperation({ summary: 'Obtener resumen de actividad de sugerencias' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 200,
    description: 'Resumen de actividad obtenido exitosamente',
    type: Object,
  })
  async getActivitySummary(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<any> {
    const { userId } = req.user;

    // Obtener estadísticas básicas
    const stats = await this.contentSuggestionService.getSuggestionStats(
      roomId,
      userId,
    );

    // Obtener sugerencias recientes
    const recentFilters: SuggestionFiltersDto = {
      limit: 5,
      sortOrder: 'desc',
    };
    const recent = await this.contentSuggestionService.getSuggestions(
      roomId,
      userId,
      recentFilters,
    );

    return {
      stats,
      recentSuggestions: recent.suggestions,
      summary: {
        totalActive: stats.pendingSuggestions + stats.approvedSuggestions,
        needsReview: stats.pendingSuggestions,
        readyToImplement: stats.approvedSuggestions,
        recentActivity: recent.suggestions.length,
      },
    };
  }
}
