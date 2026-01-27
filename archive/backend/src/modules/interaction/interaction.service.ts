import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import { MemberService } from '../room/member.service';
import { RoomService } from '../room/room.service';
import { MediaService } from '../media/media.service';
import { RoomRefreshService } from '../room/room-refresh.service';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import { EventTracker } from '../analytics/event-tracker.service';
import { EventType } from '../analytics/interfaces/analytics.interfaces';
import {
  Vote,
  VoteType,
  VoteResult,
  QueueStatus,
  SwipeSession,
  VoteStats,
} from '../../domain/entities/interaction.entity';
import { CreateVoteDto } from './dto/create-vote.dto';

@Injectable()
export class InteractionService {
  private readonly logger = new Logger(InteractionService.name);

  constructor(
    private dynamoDBService: DynamoDBService,
    private memberService: MemberService,
    private roomService: RoomService,
    private mediaService: MediaService,
    private roomRefreshService: RoomRefreshService,
    private realtimeService: RealtimeCompatibilityService,
    private eventTracker: EventTracker,
  ) {}

  /**
   * Registrar un voto (swipe) del usuario
   */
  async registerVote(
    userId: string,
    roomId: string,
    createVoteDto: CreateVoteDto,
  ): Promise<VoteResult> {
    try {
      // 1. Verificar que el usuario es miembro de la sala
      const member = await this.memberService.getMember(roomId, userId);
      if (!member) {
        throw new NotFoundException('No eres miembro de esta sala');
      }

      // 2. Verificar que el mediaId está en la lista del usuario y es el siguiente
      const currentMediaId = await this.memberService.getNextMediaForMember(
        roomId,
        userId,
      );
      if (!currentMediaId) {
        throw new BadRequestException(
          'No hay más contenido disponible en tu cola',
        );
      }

      if (currentMediaId !== createVoteDto.mediaId) {
        throw new BadRequestException(
          'El contenido no corresponde al siguiente en tu cola',
        );
      }

      // 3. Verificar que no existe un voto previo para este contenido
      const existingVote = await this.getVote(
        userId,
        roomId,
        createVoteDto.mediaId,
      );
      if (existingVote) {
        throw new BadRequestException('Ya has votado por este contenido');
      }

      // 4. Crear el voto
      const vote: Vote = {
        userId,
        roomId,
        mediaId: createVoteDto.mediaId,
        voteType: createVoteDto.voteType,
        timestamp: new Date(),
        sessionId: createVoteDto.sessionId,
      };

      await this.saveVote(vote);

      // 📝 Track content vote event (asíncrono para no bloquear)
      this.eventTracker.trackContentInteraction(
        userId,
        roomId,
        createVoteDto.mediaId,
        'vote',
        {
          voteType: createVoteDto.voteType,
          sessionId: createVoteDto.sessionId,
        },
        {
          source: 'interaction_service',
          userAgent: 'backend',
        },
      ).catch(error => 
        this.logger.error(`Error tracking vote event: ${error.message}`)
      );

      // 5. Avanzar el índice del miembro
      const newIndex = await this.memberService.advanceMemberIndex(
        roomId,
        userId,
      );

      // 6. Actualizar actividad del miembro
      await this.memberService.updateMemberActivity(roomId, userId);

      // 7. Obtener el siguiente elemento multimedia
      const nextMediaId = await this.memberService.getNextMediaForMember(
        roomId,
        userId,
      );

      // 8. Calcular progreso
      const progress = await this.memberService.getMemberProgress(
        roomId,
        userId,
      );

      // 9. Notificar voto en tiempo real (asíncrono para no bloquear)
      this.realtimeService.notifyVote(roomId, {
        userId,
        mediaId: createVoteDto.mediaId,
        voteType: createVoteDto.voteType,
        progress: {
          totalVotes: progress.currentIndex,
          requiredVotes: progress.totalItems,
          percentage: progress.progressPercentage,
        },
      }).catch(error => 
        this.logger.error(`Error sending realtime vote notification: ${error.message}`)
      );

      // 10. Pre-cargar próximos títulos para optimizar rendimiento
      this.prefetchUpcomingTitles(roomId, userId).catch(error =>
        this.logger.error(`Error prefetching upcoming titles: ${error.message}`)
      );

      // 11. Verificar si la sala necesita renovación automática
      this.checkRoomRefresh(roomId).catch(error =>
        this.logger.error(`Error checking room refresh: ${error.message}`)
      );

      this.logger.log(
        `Voto registrado: ${userId} votó ${createVoteDto.voteType} por ${createVoteDto.mediaId} en sala ${roomId}`,
      );

      return {
        voteRegistered: true,
        nextMediaId,
        queueCompleted: nextMediaId === null,
        currentProgress: progress,
      };
    } catch (error) {
      this.logger.error(`Error registrando voto: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener el estado actual de la cola del usuario
   */
  async getQueueStatus(userId: string, roomId: string): Promise<QueueStatus> {
    try {
      // Verificar membresía
      const member = await this.memberService.getMember(roomId, userId);
      if (!member) {
        throw new NotFoundException('No eres miembro de esta sala');
      }

      this.logger.debug(`getQueueStatus - Member ${userId} shuffledList length: ${member.shuffledList?.length || 0}, currentIndex: ${member.currentIndex}`);

      // Obtener elemento actual
      const currentMediaId = await this.memberService.getNextMediaForMember(
        roomId,
        userId,
      );

      this.logger.debug(`getQueueStatus - currentMediaId: ${currentMediaId}`);

      // Obtener progreso
      const progress = await this.memberService.getMemberProgress(
        roomId,
        userId,
      );

      return {
        userId,
        roomId,
        currentMediaId,
        hasNext: currentMediaId !== null,
        isCompleted: currentMediaId === null,
        progress,
      };
    } catch (error) {
      this.logger.error(`Error obteniendo estado de cola: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener detalles del contenido actual del usuario
   */
  async getCurrentMediaDetails(userId: string, roomId: string) {
    const queueStatus = await this.getQueueStatus(userId, roomId);

    if (!queueStatus.currentMediaId) {
      return null;
    }

    // Obtener detalles del contenido desde el servicio de media
    const mediaDetails = await this.mediaService.getMovieDetails(
      queueStatus.currentMediaId,
    );

    return {
      ...mediaDetails,
      queueInfo: queueStatus.progress,
    };
  }

  /**
   * Obtener historial de votos del usuario en una sala
   */
  async getUserVoteHistory(
    userId: string,
    roomId: string,
    limit: number = 50,
  ): Promise<Vote[]> {
    try {
      const votes = await this.dynamoDBService.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': DynamoDBKeys.roomPK(roomId),
          ':sk': `VOTE#${userId}#`,
        },
        ScanIndexForward: false, // Orden descendente por timestamp
        Limit: limit,
      });

      return votes as unknown as Vote[];
    } catch (error) {
      this.logger.error(
        `Error obteniendo historial de votos: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener votos de un contenido específico en una sala
   */
  async getMediaVotes(roomId: string, mediaId: string): Promise<Vote[]> {
    try {
      const votes = await this.dynamoDBService.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk AND GSI1SK = :gsi1sk',
        ExpressionAttributeValues: {
          ':gsi1pk': DynamoDBKeys.voteGSI1PK(mediaId),
          ':gsi1sk': DynamoDBKeys.voteGSI1SK(roomId),
        },
      });

      return votes as unknown as Vote[];
    } catch (error) {
      this.logger.error(`Error obteniendo votos de media: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verificar si todos los miembros activos han votado por un contenido
   */
  async checkUnanimousVote(
    roomId: string,
    mediaId: string,
  ): Promise<{
    isUnanimous: boolean;
    voteType: VoteType | null;
    totalVotes: number;
    activeMembers: number;
  }> {
    try {
      // Obtener miembros activos
      const activeMembers = await this.memberService.getActiveMembers(roomId);

      // Obtener votos para este contenido
      const votes = await this.getMediaVotes(roomId, mediaId);

      // Filtrar solo votos de miembros activos
      const activeMemberIds = new Set(activeMembers.map((m) => m.userId));
      const activeVotes = votes.filter((vote) =>
        activeMemberIds.has(vote.userId),
      );

      // CORRECCIÓN: Requiere al menos 2 miembros activos para crear un match
      // Un match solo tiene sentido cuando múltiples personas están de acuerdo
      if (
        activeVotes.length === activeMembers.length &&
        activeVotes.length >= 2 && // ← NUEVA CONDICIÓN: Mínimo 2 miembros
        activeMembers.length >= 2   // ← NUEVA CONDICIÓN: Mínimo 2 miembros activos
      ) {
        const firstVoteType = activeVotes[0].voteType;
        const isUnanimous = activeVotes.every(
          (vote) => vote.voteType === firstVoteType,
        );

        this.logger.log(
          `🎯 Checking unanimity for ${mediaId}: ${activeVotes.length}/${activeMembers.length} votes, all ${firstVoteType}? ${isUnanimous}`,
        );

        return {
          isUnanimous,
          voteType: isUnanimous ? firstVoteType : null,
          totalVotes: activeVotes.length,
          activeMembers: activeMembers.length,
        };
      }

      // Si hay menos de 2 miembros o no todos han votado, no hay unanimidad
      this.logger.debug(
        `❌ No unanimity for ${mediaId}: ${activeVotes.length}/${activeMembers.length} votes (need at least 2 members)`,
      );

      return {
        isUnanimous: false,
        voteType: null,
        totalVotes: activeVotes.length,
        activeMembers: activeMembers.length,
      };
    } catch (error) {
      this.logger.error(`Error verificando unanimidad: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de votación de una sala
   */
  async getRoomVoteStats(roomId: string): Promise<VoteStats> {
    try {
      // Obtener todos los votos de la sala
      const votes = await this.dynamoDBService.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': DynamoDBKeys.roomPK(roomId),
          ':sk': 'VOTE#',
        },
      });

      // Obtener miembros de la sala
      const members = await this.memberService.getRoomMembers(roomId);

      // Calcular estadísticas
      const totalVotes = votes.length;
      const likesCount = votes.filter(
        (vote) => vote.voteType === VoteType.LIKE,
      ).length;
      const dislikesCount = votes.filter(
        (vote) => vote.voteType === VoteType.DISLIKE,
      ).length;
      const uniqueVoters = new Set(votes.map((vote) => vote.userId)).size;

      // Calcular tasa de completitud y progreso promedio
      let totalProgress = 0;
      let completedMembers = 0;

      for (const member of members) {
        const progress = await this.memberService.getMemberProgress(
          roomId,
          member.userId,
        );
        totalProgress += progress.progressPercentage;

        if (progress.progressPercentage === 100) {
          completedMembers++;
        }
      }

      const completionRate =
        members.length > 0 ? (completedMembers / members.length) * 100 : 0;
      const averageProgress =
        members.length > 0 ? totalProgress / members.length : 0;

      return {
        roomId,
        totalVotes,
        likesCount,
        dislikesCount,
        uniqueVoters,
        completionRate: Math.round(completionRate),
        averageProgress: Math.round(averageProgress),
      };
    } catch (error) {
      this.logger.error(
        `Error obteniendo estadísticas de sala: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Iniciar una sesión de swipe
   */
  async startSwipeSession(
    userId: string,
    roomId: string,
  ): Promise<SwipeSession> {
    const sessionId = uuidv4();
    const member = await this.memberService.getMember(roomId, userId);

    if (!member) {
      throw new NotFoundException('No eres miembro de esta sala');
    }

    this.logger.debug(`startSwipeSession - Member ${userId} shuffledList length: ${member.shuffledList?.length || 0}, currentIndex: ${member.currentIndex}`);

    const progress = await this.memberService.getMemberProgress(roomId, userId);

    const session: SwipeSession = {
      userId,
      roomId,
      sessionId,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      currentIndex: progress.currentIndex,
      totalItems: progress.totalItems,
      votesInSession: 0,
    };

    // Guardar sesión en caché (podríamos usar DynamoDB TTL o Redis)
    await this.saveSwipeSession(session);

    return session;
  }

  /**
   * Eliminar votos de un miembro (cuando abandona la sala)
   */
  async removeUserVotes(userId: string, roomId: string): Promise<void> {
    try {
      // Obtener todos los votos del usuario en esta sala
      const votes = await this.getUserVoteHistory(userId, roomId, 1000);

      // Eliminar todos los votos
      for (const vote of votes) {
        await this.dynamoDBService.deleteItem(
          DynamoDBKeys.roomPK(roomId),
          DynamoDBKeys.voteSK(userId, vote.mediaId),
        );
      }

      this.logger.log(
        `Eliminados ${votes.length} votos del usuario ${userId} en sala ${roomId}`,
      );
    } catch (error) {
      this.logger.error(`Error eliminando votos de usuario: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validar integridad de votos
   */
  async validateVoteIntegrity(roomId: string): Promise<{
    isValid: boolean;
    issues: string[];
    totalVotes: number;
    duplicateVotes: number;
    orphanedVotes: number;
  }> {
    try {
      const issues: string[] = [];
      let duplicateVotes = 0;
      let orphanedVotes = 0;

      // Obtener todos los votos de la sala
      const votes = await this.dynamoDBService.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': DynamoDBKeys.roomPK(roomId),
          ':sk': 'VOTE#',
        },
      });

      // Obtener miembros actuales
      const members = await this.memberService.getRoomMembers(roomId);
      const memberIds = new Set(members.map((m) => m.userId));

      // Verificar duplicados y votos huérfanos
      const voteKeys = new Set();

      for (const vote of votes) {
        const voteKey = `${vote.userId}#${vote.mediaId}`;

        // Verificar duplicados
        if (voteKeys.has(voteKey)) {
          duplicateVotes++;
          issues.push(`Voto duplicado: ${voteKey}`);
        } else {
          voteKeys.add(voteKey);
        }

        // Verificar votos huérfanos (de usuarios que ya no son miembros)
        if (!memberIds.has(vote.userId)) {
          orphanedVotes++;
          issues.push(`Voto huérfano de usuario ${vote.userId}`);
        }
      }

      const isValid = issues.length === 0;

      return {
        isValid,
        issues,
        totalVotes: votes.length,
        duplicateVotes,
        orphanedVotes,
      };
    } catch (error) {
      this.logger.error(
        `Error validando integridad de votos: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Métodos privados de utilidad
   */
  private async saveVote(vote: Vote): Promise<void> {
    await this.dynamoDBService.putItem({
      PK: DynamoDBKeys.roomPK(vote.roomId),
      SK: DynamoDBKeys.voteSK(vote.userId, vote.mediaId),
      GSI1PK: DynamoDBKeys.voteGSI1PK(vote.mediaId),
      GSI1SK: DynamoDBKeys.voteGSI1SK(vote.roomId),
      ...vote,
    });
  }

  private async getVote(
    userId: string,
    roomId: string,
    mediaId: string,
  ): Promise<Vote | null> {
    try {
      const item = await this.dynamoDBService.getItem(
        DynamoDBKeys.roomPK(roomId),
        DynamoDBKeys.voteSK(userId, mediaId),
      );

      return item ? (item as unknown as Vote) : null;
    } catch (error) {
      return null;
    }
  }

  private async saveSwipeSession(session: SwipeSession): Promise<void> {
    // En una implementación real, esto podría ir a Redis o DynamoDB con TTL
    // Por ahora, simplemente logueamos la sesión
    this.logger.debug(
      `Sesión de swipe iniciada: ${session.sessionId} para usuario ${session.userId}`,
    );
  }

  /**
   * Pre-cargar próximos títulos para optimizar rendimiento (AGRESIVO)
   */
  private async prefetchUpcomingTitles(roomId: string, userId: string): Promise<void> {
    try {
      const member = await this.memberService.getMember(roomId, userId);
      if (!member || !member.shuffledList) {
        return;
      }

      // Pre-cargar los próximos 10 títulos (más agresivo)
      const lookAhead = 10;
      const upcomingIds = member.shuffledList.slice(
        member.currentIndex,
        member.currentIndex + lookAhead
      );

      if (upcomingIds.length > 0) {
        await this.mediaService.prefetchMovieDetails(upcomingIds);
        this.logger.debug(
          `Prefetched ${upcomingIds.length} upcoming titles for user ${userId} in room ${roomId}`
        );
      }
    } catch (error) {
      this.logger.error(`Error prefetching titles: ${error.message}`);
    }
  }

  /**
   * Verificar si la sala necesita renovación automática
   */
  private async checkRoomRefresh(roomId: string): Promise<void> {
    try {
      // Obtener filtros de contenido de la sala
      const room = await this.roomService.getRoomById(roomId);
      if (!room) {
        return;
      }

      // Verificar y renovar si es necesario
      const refreshed = await this.roomRefreshService.checkAndRefreshIfNeeded(
        roomId,
        room.filters // Usar 'filters' en lugar de 'contentFilters'
      );

      if (refreshed) {
        this.logger.log(`Room ${roomId} was automatically refreshed with new content`);
      }
    } catch (error) {
      this.logger.error(`Error checking room refresh: ${error.message}`);
    }
  }
}
