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
import { PermissionService } from '../permission/permission.service';
import {
  ContentSuggestion,
  ContentSuggestionStatus,
  ContentSuggestionType,
  ContentSuggestionVote,
  ContentSuggestionComment,
  RoomSuggestionConfig,
  RoomSuggestionStats,
  ContentSuggestionFilters,
  SuggestionSearchResult,
  SuggestionEvent,
  SuggestionTemplate,
  SuggestionNotificationConfig,
  SuggestionApprovalWorkflow,
  SuggestionChangeHistory,
} from '../../domain/entities/content-suggestion.entity';
import { RoomPermission } from '../../domain/entities/room-moderation.entity';
import {
  CreateSuggestionDto,
  UpdateSuggestionDto,
  VoteSuggestionDto,
  CommentSuggestionDto,
  CreateSuggestionConfigDto,
  UpdateSuggestionConfigDto,
  SuggestionFiltersDto,
  ReviewSuggestionDto,
  CreateSuggestionTemplateDto,
  UpdateNotificationConfigDto,
} from './dto/content-suggestion.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ContentSuggestionService {
  private readonly logger = new Logger(ContentSuggestionService.name);

  constructor(
    private dynamoDBService: DynamoDBService,
    private realtimeService: RealtimeCompatibilityService,
    private permissionService: PermissionService,
  ) {}

  /**
   * Crear sugerencia de contenido
   */
  async createSuggestion(
    roomId: string,
    userId: string,
    username: string,
    createSuggestionDto: CreateSuggestionDto,
  ): Promise<ContentSuggestion> {
    // Verificar permisos
    await this.permissionService.checkPermission(
      roomId,
      userId,
      RoomPermission.SUGGEST_CONTENT,
    );

    // Verificar configuración de sugerencias
    const config = await this.getSuggestionConfig(roomId);
    if (!config.isEnabled) {
      throw new ForbiddenException(
        'Las sugerencias están deshabilitadas en esta sala',
      );
    }

    // Verificar límites de usuario
    await this.checkUserLimits(roomId, userId, config);

    // Verificar tipos permitidos
    if (!config.allowedTypes.includes(createSuggestionDto.type)) {
      throw new BadRequestException(
        `Tipo de sugerencia no permitido: ${createSuggestionDto.type}`,
      );
    }

    // Verificar si se requiere razón
    if (config.requireReason && !createSuggestionDto.reason) {
      throw new BadRequestException('Se requiere una razón para la sugerencia');
    }

    const suggestionId = uuidv4();
    const now = new Date();

    const suggestion: ContentSuggestion = {
      id: suggestionId,
      roomId,
      suggestedBy: userId,
      suggestedByUsername: username,
      type: createSuggestionDto.type,
      status: config.requireApproval
        ? ContentSuggestionStatus.PENDING
        : ContentSuggestionStatus.APPROVED,
      title: createSuggestionDto.title,
      description: createSuggestionDto.description,
      tmdbId: createSuggestionDto.tmdbId,
      imdbId: createSuggestionDto.imdbId,
      year: createSuggestionDto.year,
      genre: createSuggestionDto.genre || [],
      rating: createSuggestionDto.rating,
      duration: createSuggestionDto.duration,
      posterUrl: createSuggestionDto.posterUrl,
      trailerUrl: createSuggestionDto.trailerUrl,
      reason: createSuggestionDto.reason,
      tags: createSuggestionDto.tags || [],
      priority: createSuggestionDto.priority || 3,
      votes: [],
      totalVotes: 0,
      positiveVotes: 0,
      negativeVotes: 0,
      voteScore: 0,
      comments: [],
      commentCount: 0,
      metadata: createSuggestionDto.metadata,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: `SUGGESTION#${suggestionId}`,
        GSI1PK: `SUGGESTION#${suggestionId}`,
        GSI1SK: `ROOM#${roomId}`,
        GSI2PK: `USER_SUGGESTION#${userId}`,
        GSI2SK: `${roomId}#${now.toISOString()}`,
        ...suggestion,
      });

      // Actualizar estadísticas
      await this.updateSuggestionStats(roomId, 'created');

      // Notificar en tiempo real
      await this.realtimeService.notifyContentSuggestion(roomId, {
        type: 'created',
        roomId,
        suggestionId,
        userId,
        username,
        suggestion,
        timestamp: now,
      });

      this.logger.log(
        `Sugerencia creada: ${suggestionId} en sala ${roomId} por usuario ${userId}`,
      );
      return suggestion;
    } catch (error) {
      this.logger.error(`Error creando sugerencia: ${error.message}`);
      throw error;
    }
  }

  /**
   * Votar en sugerencia
   */
  async voteSuggestion(
    roomId: string,
    suggestionId: string,
    userId: string,
    username: string,
    voteDto: VoteSuggestionDto,
  ): Promise<ContentSuggestion> {
    // Verificar permisos
    await this.permissionService.checkPermission(
      roomId,
      userId,
      RoomPermission.VOTE,
    );

    // Verificar configuración
    const config = await this.getSuggestionConfig(roomId);
    if (!config.allowVoting) {
      throw new ForbiddenException(
        'La votación está deshabilitada en esta sala',
      );
    }

    const suggestion = await this.getSuggestion(roomId, suggestionId);

    // Verificar que la sugerencia esté en estado votable
    if (
      suggestion.status !== ContentSuggestionStatus.PENDING &&
      suggestion.status !== ContentSuggestionStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException('No se puede votar en esta sugerencia');
    }

    // Verificar que el usuario no haya votado ya
    const existingVoteIndex = suggestion.votes.findIndex(
      (vote) => vote.userId === userId,
    );

    const vote: ContentSuggestionVote = {
      userId,
      username,
      vote: voteDto.vote,
      reason: voteDto.reason,
      createdAt: new Date(),
    };

    const votes = [...suggestion.votes];

    if (existingVoteIndex >= 0) {
      // Actualizar voto existente
      votes[existingVoteIndex] = vote;
    } else {
      // Agregar nuevo voto
      votes.push(vote);
    }

    // Recalcular estadísticas de votación
    const positiveVotes = votes.filter((v) => v.vote === 'up').length;
    const negativeVotes = votes.filter((v) => v.vote === 'down').length;
    const totalVotes = votes.length;
    const voteScore = positiveVotes - negativeVotes;

    const updatedSuggestion: ContentSuggestion = {
      ...suggestion,
      votes,
      totalVotes,
      positiveVotes,
      negativeVotes,
      voteScore,
      updatedAt: new Date(),
    };

    // Verificar aprobación automática
    if (
      config.autoImplementHighScored &&
      voteScore >= config.autoImplementThreshold &&
      totalVotes >= config.minVotesToApprove
    ) {
      updatedSuggestion.status = ContentSuggestionStatus.APPROVED;
    }

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: `SUGGESTION#${suggestionId}`,
        GSI1PK: `SUGGESTION#${suggestionId}`,
        GSI1SK: `ROOM#${roomId}`,
        GSI2PK: `USER_SUGGESTION#${suggestion.suggestedBy}`,
        GSI2SK: `${roomId}#${suggestion.createdAt.toISOString()}`,
        ...updatedSuggestion,
      });

      // Registrar cambio en historial
      await this.recordSuggestionChange(
        suggestionId,
        userId,
        'vote',
        voteDto.vote,
        vote,
      );

      // Notificar en tiempo real
      await this.realtimeService.notifyContentSuggestion(roomId, {
        type: 'voted',
        roomId,
        suggestionId,
        userId,
        username,
        vote,
        timestamp: new Date(),
      });

      this.logger.log(
        `Voto registrado en sugerencia ${suggestionId}: ${voteDto.vote} por usuario ${userId}`,
      );
      return updatedSuggestion;
    } catch (error) {
      this.logger.error(`Error votando sugerencia: ${error.message}`);
      throw error;
    }
  }

  /**
   * Comentar en sugerencia
   */
  async commentSuggestion(
    roomId: string,
    suggestionId: string,
    userId: string,
    username: string,
    commentDto: CommentSuggestionDto,
  ): Promise<ContentSuggestion> {
    // Verificar permisos
    await this.permissionService.checkPermission(
      roomId,
      userId,
      RoomPermission.CHAT,
    );

    // Verificar configuración
    const config = await this.getSuggestionConfig(roomId);
    if (!config.allowComments) {
      throw new ForbiddenException(
        'Los comentarios están deshabilitados en esta sala',
      );
    }

    const suggestion = await this.getSuggestion(roomId, suggestionId);

    const commentId = uuidv4();
    const comment: ContentSuggestionComment = {
      id: commentId,
      userId,
      username,
      userAvatar: commentDto.userAvatar,
      content: commentDto.content,
      replyToId: commentDto.replyToId,
      reactions: [],
      isEdited: false,
      createdAt: new Date(),
    };

    const updatedSuggestion: ContentSuggestion = {
      ...suggestion,
      comments: [...suggestion.comments, comment],
      commentCount: suggestion.commentCount + 1,
      updatedAt: new Date(),
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: `SUGGESTION#${suggestionId}`,
        GSI1PK: `SUGGESTION#${suggestionId}`,
        GSI1SK: `ROOM#${roomId}`,
        GSI2PK: `USER_SUGGESTION#${suggestion.suggestedBy}`,
        GSI2SK: `${roomId}#${suggestion.createdAt.toISOString()}`,
        ...updatedSuggestion,
      });

      // Registrar cambio en historial
      await this.recordSuggestionChange(
        suggestionId,
        userId,
        'comment',
        null,
        comment,
      );

      // Notificar en tiempo real
      await this.realtimeService.notifyContentSuggestion(roomId, {
        type: 'commented',
        roomId,
        suggestionId,
        userId,
        username,
        comment,
        timestamp: new Date(),
      });

      this.logger.log(
        `Comentario agregado a sugerencia ${suggestionId} por usuario ${userId}`,
      );
      return updatedSuggestion;
    } catch (error) {
      this.logger.error(`Error comentando sugerencia: ${error.message}`);
      throw error;
    }
  }

  /**
   * Revisar sugerencia (aprobar/rechazar)
   */
  async reviewSuggestion(
    roomId: string,
    suggestionId: string,
    userId: string,
    reviewDto: ReviewSuggestionDto,
  ): Promise<ContentSuggestion> {
    // Verificar permisos de moderación
    await this.permissionService.checkPermission(
      roomId,
      userId,
      RoomPermission.MANAGE_ROLES,
    );

    const suggestion = await this.getSuggestion(roomId, suggestionId);

    // Verificar que la sugerencia esté en estado revisable
    if (
      suggestion.status !== ContentSuggestionStatus.PENDING &&
      suggestion.status !== ContentSuggestionStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException('Esta sugerencia no puede ser revisada');
    }

    const now = new Date();
    const updatedSuggestion: ContentSuggestion = {
      ...suggestion,
      status: reviewDto.status,
      reviewedBy: userId,
      reviewedAt: now,
      reviewNotes: reviewDto.notes,
      updatedAt: now,
    };

    // Si se aprueba, marcar para implementación si está configurado
    if (reviewDto.status === ContentSuggestionStatus.APPROVED) {
      const config = await this.getSuggestionConfig(roomId);
      if (config.autoImplementHighScored) {
        updatedSuggestion.addedToQueueAt = now;
      }
    }

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: `SUGGESTION#${suggestionId}`,
        GSI1PK: `SUGGESTION#${suggestionId}`,
        GSI1SK: `ROOM#${roomId}`,
        GSI2PK: `USER_SUGGESTION#${suggestion.suggestedBy}`,
        GSI2SK: `${roomId}#${suggestion.createdAt.toISOString()}`,
        ...updatedSuggestion,
      });

      // Actualizar estadísticas
      await this.updateSuggestionStats(
        roomId,
        reviewDto.status === ContentSuggestionStatus.APPROVED
          ? 'approved'
          : 'rejected',
      );

      // Registrar cambio en historial
      await this.recordSuggestionChange(
        suggestionId,
        userId,
        'status',
        suggestion.status,
        reviewDto.status,
      );

      // Notificar en tiempo real
      await this.realtimeService.notifyContentSuggestion(roomId, {
        type:
          reviewDto.status === ContentSuggestionStatus.APPROVED
            ? 'approved'
            : 'rejected',
        roomId,
        suggestionId,
        userId,
        username: '', // Se puede obtener del contexto
        timestamp: now,
      });

      this.logger.log(
        `Sugerencia ${suggestionId} revisada: ${reviewDto.status} por usuario ${userId}`,
      );
      return updatedSuggestion;
    } catch (error) {
      this.logger.error(`Error revisando sugerencia: ${error.message}`);
      throw error;
    }
  }

  /**
   * Implementar sugerencia (agregar a cola de contenido)
   */
  async implementSuggestion(
    roomId: string,
    suggestionId: string,
    userId: string,
  ): Promise<ContentSuggestion> {
    // Verificar permisos
    await this.permissionService.checkPermission(
      roomId,
      userId,
      RoomPermission.INJECT_CONTENT,
    );

    const suggestion = await this.getSuggestion(roomId, suggestionId);

    // Verificar que la sugerencia esté aprobada
    if (suggestion.status !== ContentSuggestionStatus.APPROVED) {
      throw new BadRequestException(
        'Solo se pueden implementar sugerencias aprobadas',
      );
    }

    const now = new Date();
    const updatedSuggestion: ContentSuggestion = {
      ...suggestion,
      status: ContentSuggestionStatus.IMPLEMENTED,
      implementedAt: now,
      implementedBy: userId,
      updatedAt: now,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: `SUGGESTION#${suggestionId}`,
        GSI1PK: `SUGGESTION#${suggestionId}`,
        GSI1SK: `ROOM#${roomId}`,
        GSI2PK: `USER_SUGGESTION#${suggestion.suggestedBy}`,
        GSI2SK: `${roomId}#${suggestion.createdAt.toISOString()}`,
        ...updatedSuggestion,
      });

      // Actualizar estadísticas
      await this.updateSuggestionStats(roomId, 'implemented');

      // Registrar cambio en historial
      await this.recordSuggestionChange(
        suggestionId,
        userId,
        'status',
        suggestion.status,
        ContentSuggestionStatus.IMPLEMENTED,
      );

      // Notificar en tiempo real
      await this.realtimeService.notifyContentSuggestion(roomId, {
        type: 'implemented',
        roomId,
        suggestionId,
        userId,
        username: '', // Se puede obtener del contexto
        timestamp: now,
      });

      this.logger.log(
        `Sugerencia ${suggestionId} implementada por usuario ${userId}`,
      );
      return updatedSuggestion;
    } catch (error) {
      this.logger.error(`Error implementando sugerencia: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener sugerencias con filtros
   */
  async getSuggestions(
    roomId: string,
    userId: string,
    filters: SuggestionFiltersDto,
  ): Promise<SuggestionSearchResult> {
    // Verificar permisos
    await this.permissionService.checkPermission(
      roomId,
      userId,
      RoomPermission.VIEW_ROOM,
    );

    try {
      const limit = Math.min(filters.limit || 20, 100);
      const queryParams: any = {
        KeyConditionExpression: 'GSI1SK = :sk',
        ExpressionAttributeValues: {
          ':sk': `ROOM#${roomId}`,
        },
        IndexName: 'GSI1',
        ScanIndexForward: filters.sortOrder !== 'desc',
        Limit: limit,
      };

      // Aplicar filtros
      const filterExpressions: string[] = [];

      if (filters.suggestedBy) {
        queryParams.ExpressionAttributeValues[':suggestedBy'] =
          filters.suggestedBy;
        filterExpressions.push('suggestedBy = :suggestedBy');
      }

      if (filters.type) {
        queryParams.ExpressionAttributeValues[':type'] = filters.type;
        filterExpressions.push('#type = :type');
        queryParams.ExpressionAttributeNames = { '#type': 'type' };
      }

      if (filters.status) {
        queryParams.ExpressionAttributeValues[':status'] = filters.status;
        filterExpressions.push('#status = :status');
        queryParams.ExpressionAttributeNames = {
          ...queryParams.ExpressionAttributeNames,
          '#status': 'status',
        };
      }

      if (filters.genre) {
        queryParams.ExpressionAttributeValues[':genre'] = filters.genre;
        filterExpressions.push('contains(genre, :genre)');
      }

      if (filters.minScore !== undefined) {
        queryParams.ExpressionAttributeValues[':minScore'] = filters.minScore;
        filterExpressions.push('voteScore >= :minScore');
      }

      if (filters.maxScore !== undefined) {
        queryParams.ExpressionAttributeValues[':maxScore'] = filters.maxScore;
        filterExpressions.push('voteScore <= :maxScore');
      }

      if (filters.dateFrom) {
        queryParams.ExpressionAttributeValues[':dateFrom'] =
          filters.dateFrom.toISOString();
        filterExpressions.push('createdAt >= :dateFrom');
      }

      if (filters.dateTo) {
        queryParams.ExpressionAttributeValues[':dateTo'] =
          filters.dateTo.toISOString();
        filterExpressions.push('createdAt <= :dateTo');
      }

      if (filters.searchText) {
        queryParams.ExpressionAttributeValues[':searchText'] =
          filters.searchText;
        filterExpressions.push(
          '(contains(title, :searchText) OR contains(description, :searchText))',
        );
      }

      if (filters.hasComments !== undefined) {
        if (filters.hasComments) {
          filterExpressions.push('commentCount > :zero');
          queryParams.ExpressionAttributeValues[':zero'] = 0;
        } else {
          filterExpressions.push('commentCount = :zero');
          queryParams.ExpressionAttributeValues[':zero'] = 0;
        }
      }

      if (filters.minVotes !== undefined) {
        queryParams.ExpressionAttributeValues[':minVotes'] = filters.minVotes;
        filterExpressions.push('totalVotes >= :minVotes');
      }

      if (filterExpressions.length > 0) {
        queryParams.FilterExpression = filterExpressions.join(' AND ');
      }

      if (filters.offset) {
        queryParams.ExclusiveStartKey = {
          GSI1SK: `ROOM#${roomId}`,
          GSI1PK: filters.offset,
        };
      }

      const result = await this.dynamoDBService.query(queryParams);
      const suggestions =
        (result as any).Items?.map((item: any) => item as ContentSuggestion) || [];

      return {
        suggestions,
        totalCount: suggestions.length,
        hasMore: !!(result as any).LastEvaluatedKey,
        nextOffset: (result as any).LastEvaluatedKey?.GSI1PK,
      };
    } catch (error) {
      this.logger.error(`Error obteniendo sugerencias: ${error.message}`);
      throw error;
    }
  }

  /**
   * Configurar sugerencias de sala
   */
  async configureSuggestionConfig(
    roomId: string,
    userId: string,
    configDto: CreateSuggestionConfigDto | UpdateSuggestionConfigDto,
  ): Promise<RoomSuggestionConfig> {
    // Verificar permisos
    await this.permissionService.checkPermission(
      roomId,
      userId,
      RoomPermission.MODIFY_SETTINGS,
    );

    const now = new Date();
    const config: RoomSuggestionConfig = {
      roomId,
      isEnabled: configDto.isEnabled ?? true,
      requireApproval: configDto.requireApproval ?? true,
      allowVoting: configDto.allowVoting ?? true,
      allowComments: configDto.allowComments ?? true,
      minVotesToApprove: configDto.minVotesToApprove ?? 3,
      minScoreToApprove: configDto.minScoreToApprove ?? 2,
      maxSuggestionsPerUser: configDto.maxSuggestionsPerUser ?? 5,
      maxPendingSuggestions: configDto.maxPendingSuggestions ?? 20,
      autoImplementHighScored: configDto.autoImplementHighScored ?? false,
      autoImplementThreshold: configDto.autoImplementThreshold ?? 5,
      allowedTypes:
        configDto.allowedTypes || Object.values(ContentSuggestionType),
      requireReason: configDto.requireReason ?? false,
      moderationEnabled: configDto.moderationEnabled ?? true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: 'SUGGESTION_CONFIG',
        ...config,
      });

      this.logger.log(
        `Configuración de sugerencias actualizada para sala ${roomId}`,
      );
      return config;
    } catch (error) {
      this.logger.error(`Error configurando sugerencias: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener configuración de sugerencias
   */
  async getSuggestionConfig(roomId: string): Promise<RoomSuggestionConfig> {
    try {
      const result = await this.dynamoDBService.getItem(
        DynamoDBKeys.roomPK(roomId),
        'SUGGESTION_CONFIG',
      );

      if (!result) {
        // Retornar configuración por defecto
        return {
          roomId,
          isEnabled: true,
          requireApproval: true,
          allowVoting: true,
          allowComments: true,
          minVotesToApprove: 3,
          minScoreToApprove: 2,
          maxSuggestionsPerUser: 5,
          maxPendingSuggestions: 20,
          autoImplementHighScored: false,
          autoImplementThreshold: 5,
          allowedTypes: Object.values(ContentSuggestionType),
          requireReason: false,
          moderationEnabled: true,
          createdBy: 'system',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      return result as unknown as RoomSuggestionConfig;
    } catch (error) {
      this.logger.error(
        `Error obteniendo configuración de sugerencias: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener estadísticas de sugerencias
   */
  async getSuggestionStats(
    roomId: string,
    userId: string,
  ): Promise<RoomSuggestionStats> {
    // Verificar permisos
    await this.permissionService.checkPermission(
      roomId,
      userId,
      RoomPermission.VIEW_ROOM,
    );

    try {
      const result = await this.dynamoDBService.getItem(
        DynamoDBKeys.roomPK(roomId),
        'SUGGESTION_STATS',
      );

      if (!result) {
        // Calcular estadísticas si no existen
        return this.calculateSuggestionStats(roomId);
      }

      return result as unknown as RoomSuggestionStats;
    } catch (error) {
      this.logger.error(
        `Error obteniendo estadísticas de sugerencias: ${error.message}`,
      );
      throw error;
    }
  }

  // Métodos auxiliares privados

  private async getSuggestion(
    roomId: string,
    suggestionId: string,
  ): Promise<ContentSuggestion> {
    const result = await this.dynamoDBService.getItem(
      DynamoDBKeys.roomPK(roomId),
      `SUGGESTION#${suggestionId}`,
    );

    if (!result) {
      throw new NotFoundException('Sugerencia no encontrada');
    }

    return result as unknown as ContentSuggestion;
  }

  private async checkUserLimits(
    roomId: string,
    userId: string,
    config: RoomSuggestionConfig,
  ): Promise<void> {
    // Verificar límite de sugerencias por usuario por día
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.dynamoDBService.query({
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk AND GSI2SK >= :today',
      ExpressionAttributeValues: {
        ':pk': `USER_SUGGESTION#${userId}`,
        ':today': `${roomId}#${today.toISOString()}`,
      },
    });

    const todaySuggestions = (result as any).Items?.length || 0;
    if (todaySuggestions >= config.maxSuggestionsPerUser) {
      throw new BadRequestException(
        `Has alcanzado el límite de ${config.maxSuggestionsPerUser} sugerencias por día`,
      );
    }

    // Verificar límite de sugerencias pendientes en la sala
    const pendingResult = await this.dynamoDBService.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':pk': DynamoDBKeys.roomPK(roomId),
        ':sk': 'SUGGESTION#',
        ':status': ContentSuggestionStatus.PENDING,
      },
    });

    const pendingSuggestions = (pendingResult as any).Items?.length || 0;
    if (pendingSuggestions >= config.maxPendingSuggestions) {
      throw new BadRequestException(
        `La sala ha alcanzado el límite de ${config.maxPendingSuggestions} sugerencias pendientes`,
      );
    }
  }

  private async updateSuggestionStats(
    roomId: string,
    action: string,
  ): Promise<void> {
    try {
      // Esta es una implementación simplificada
      // En producción, se podría usar un sistema más sofisticado de agregación
      const now = new Date();

      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: 'SUGGESTION_STATS',
        roomId,
        lastActivityAt: now,
        lastAction: action,
        updatedAt: now,
      });
    } catch (error) {
      this.logger.warn(
        `Error actualizando estadísticas de sugerencias: ${error.message}`,
      );
      // No lanzar error para no afectar la operación principal
    }
  }

  private async recordSuggestionChange(
    suggestionId: string,
    changedBy: string,
    changeType: string,
    oldValue: any,
    newValue: any,
  ): Promise<void> {
    try {
      const changeId = uuidv4();
      const change: SuggestionChangeHistory = {
        id: changeId,
        suggestionId,
        changedBy,
        changeType: changeType as any,
        oldValue,
        newValue,
        createdAt: new Date(),
      };

      await this.dynamoDBService.putItem({
        PK: `SUGGESTION#${suggestionId}`,
        SK: `CHANGE#${changeId}`,
        ...change,
      });
    } catch (error) {
      this.logger.warn(
        `Error registrando cambio de sugerencia: ${error.message}`,
      );
      // No lanzar error para no afectar la operación principal
    }
  }

  private async calculateSuggestionStats(
    roomId: string,
  ): Promise<RoomSuggestionStats> {
    // Implementación simplificada para calcular estadísticas
    // En producción, esto se haría de forma más eficiente
    return {
      roomId,
      totalSuggestions: 0,
      pendingSuggestions: 0,
      approvedSuggestions: 0,
      rejectedSuggestions: 0,
      implementedSuggestions: 0,
      suggestionsByType: {
        [ContentSuggestionType.MOVIE]: 0,
        [ContentSuggestionType.TV_SHOW]: 0,
        [ContentSuggestionType.DOCUMENTARY]: 0,
        [ContentSuggestionType.ANIME]: 0,
        [ContentSuggestionType.CUSTOM]: 0,
      },
      suggestionsByStatus: {
        [ContentSuggestionStatus.PENDING]: 0,
        [ContentSuggestionStatus.APPROVED]: 0,
        [ContentSuggestionStatus.REJECTED]: 0,
        [ContentSuggestionStatus.UNDER_REVIEW]: 0,
        [ContentSuggestionStatus.IMPLEMENTED]: 0,
      },
      topSuggesters: [],
      averageVotesPerSuggestion: 0,
      averageScorePerSuggestion: 0,
      averageTimeToApproval: 0,
      lastSuggestionAt: new Date(),
      mostPopularGenres: [],
    };
  }
}
