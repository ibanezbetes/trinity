import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import {
  Member,
  MemberRole,
  MemberStatus,
} from '../../domain/entities/room.entity';
import { EventTracker } from '../analytics/event-tracker.service';
import { EventType } from '../analytics/interfaces/analytics.interfaces';

@Injectable()
export class MemberService {
  private readonly logger = new Logger(MemberService.name);
  private readonly inactiveTimeoutMinutes: number;

  constructor(
    private dynamoDBService: DynamoDBService,
    private configService: ConfigService,
    private eventTracker: EventTracker,
  ) {
    this.inactiveTimeoutMinutes = this.configService.get(
      'INACTIVE_MEMBER_TIMEOUT_MINUTES',
      30,
    );
  }

  /**
   * Añadir un miembro a la sala
   */
  async addMember(
    roomId: string,
    userId: string,
    role: MemberRole,
  ): Promise<Member> {
    const member: Member = {
      userId,
      roomId,
      role,
      status: MemberStatus.ACTIVE,
      shuffledList: [], // Se llenará cuando se genere la lista
      currentIndex: 0,
      lastActivityAt: new Date(),
      joinedAt: new Date(),
    };

    await this.dynamoDBService.putItem({
      PK: DynamoDBKeys.roomPK(roomId),
      SK: DynamoDBKeys.memberSK(userId),
      GSI1PK: DynamoDBKeys.memberGSI1PK(userId),
      GSI1SK: DynamoDBKeys.memberGSI1SK(roomId),
      ...member,
    });

    // 📝 Track room join event (only if not creator - creator join is tracked in room creation)
    if (role !== MemberRole.CREATOR) {
      await this.eventTracker.trackRoomEvent(
        roomId,
        EventType.ROOM_JOINED,
        userId,
        {
          memberRole: role,
          joinMethod: 'invite',
        },
        {
          source: 'member_service',
          userAgent: 'backend',
        },
      );
    }

    this.logger.log(
      `Miembro añadido: ${userId} a la sala ${roomId} con rol ${role}`,
    );
    return member;
  }

  /**
   * Obtener un miembro específico
   */
  async getMember(roomId: string, userId: string): Promise<Member | null> {
    try {
      const item = await this.dynamoDBService.getItem(
        DynamoDBKeys.roomPK(roomId),
        DynamoDBKeys.memberSK(userId),
      );

      return item ? (item as unknown as Member) : null;
    } catch (error) {
      this.logger.error(
        `Error getting member ${userId} from room ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener todos los miembros de una sala
   */
  async getRoomMembers(roomId: string): Promise<Member[]> {
    try {
      const items = await this.dynamoDBService.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': DynamoDBKeys.roomPK(roomId),
          ':sk': 'MEMBER#',
        },
      });

      return items as unknown as Member[];
    } catch (error) {
      this.logger.error(
        `Error getting members for room ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener miembros activos de una sala
   */
  async getActiveMembers(roomId: string): Promise<Member[]> {
    const allMembers = await this.getRoomMembers(roomId);
    const now = new Date();
    const timeoutMs = this.inactiveTimeoutMinutes * 60 * 1000;

    return allMembers.filter((member) => {
      const lastActivity = new Date(member.lastActivityAt);
      const isRecentlyActive =
        now.getTime() - lastActivity.getTime() < timeoutMs;
      return member.status === MemberStatus.ACTIVE && isRecentlyActive;
    });
  }

  /**
   * Eliminar un miembro de la sala
   */
  async removeMember(roomId: string, userId: string): Promise<void> {
    // 📝 Track room leave event
    await this.eventTracker.trackRoomEvent(
      roomId,
      EventType.ROOM_LEFT,
      userId,
      {
        leaveMethod: 'manual',
      },
      {
        source: 'member_service',
        userAgent: 'backend',
      },
    );

    // Eliminar el miembro
    await this.dynamoDBService.deleteItem(
      DynamoDBKeys.roomPK(roomId),
      DynamoDBKeys.memberSK(userId),
    );

    // Eliminar todos los votos del miembro en esta sala
    await this.removeAllMemberVotes(roomId, userId);

    this.logger.log(`Miembro eliminado: ${userId} de la sala ${roomId}`);
  }

  /**
   * Actualizar actividad del miembro
   */
  async updateMemberActivity(roomId: string, userId: string): Promise<void> {
    try {
      await this.dynamoDBService.conditionalUpdate(
        DynamoDBKeys.roomPK(roomId),
        DynamoDBKeys.memberSK(userId),
        'SET lastActivityAt = :lastActivityAt, #status = :status, updatedAt = :updatedAt',
        'attribute_exists(PK)',
        {
          '#status': 'status',
        },
        {
          ':lastActivityAt': new Date().toISOString(),
          ':status': MemberStatus.ACTIVE,
        },
      );
    } catch (error) {
      this.logger.error(`Error updating member activity: ${error.message}`);
      // No lanzar error, es una operación de background
    }
  }

  /**
   * Actualizar lista desordenada del miembro
   */
  async updateMemberShuffledList(
    roomId: string,
    userId: string,
    shuffledList: string[],
  ): Promise<void> {
    await this.dynamoDBService.conditionalUpdate(
      DynamoDBKeys.roomPK(roomId),
      DynamoDBKeys.memberSK(userId),
      'SET shuffledList = :shuffledList, currentIndex = :currentIndex, updatedAt = :updatedAt',
      'attribute_exists(PK)',
      undefined,
      {
        ':shuffledList': shuffledList,
        ':currentIndex': 0, // Reset index when updating list
        ':updatedAt': new Date().toISOString(),
      },
    );

    this.logger.log(
      `Lista desordenada actualizada para miembro ${userId} en sala ${roomId}`,
    );
  }

  /**
   * Avanzar índice del miembro en su lista
   */
  async advanceMemberIndex(roomId: string, userId: string): Promise<number> {
    const member = await this.getMember(roomId, userId);
    if (!member) {
      throw new Error('Miembro no encontrado');
    }

    const newIndex = member.currentIndex + 1;

    await this.dynamoDBService.conditionalUpdate(
      DynamoDBKeys.roomPK(roomId),
      DynamoDBKeys.memberSK(userId),
      'SET currentIndex = :currentIndex, lastActivityAt = :lastActivityAt, updatedAt = :updatedAt',
      'attribute_exists(PK)',
      undefined,
      {
        ':currentIndex': newIndex,
        ':lastActivityAt': new Date().toISOString(),
      },
    );

    return newIndex;
  }

  /**
   * Generar lista desordenada para un miembro
   */
  generateShuffledList(masterList: string[], seed?: string): string[] {
    // Usar el userId como seed para que sea consistente pero único por usuario
    const shuffled = [...masterList];

    // Algoritmo Fisher-Yates con seed
    const random = this.seededRandom(seed || Date.now().toString());

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Generador de números aleatorios con seed
   */
  private seededRandom(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return function () {
      hash = Math.sin(hash) * 10000;
      return hash - Math.floor(hash);
    };
  }

  /**
   * Eliminar todos los votos de un miembro en una sala
   */
  private async removeAllMemberVotes(
    roomId: string,
    userId: string,
  ): Promise<void> {
    try {
      // Obtener todos los votos del miembro en esta sala
      const votes = await this.dynamoDBService.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': DynamoDBKeys.roomPK(roomId),
          ':sk': `VOTE#${userId}#`,
        },
      });

      // Eliminar todos los votos
      for (const vote of votes) {
        await this.dynamoDBService.deleteItem(vote.PK, vote.SK);
      }

      this.logger.log(
        `Eliminados ${votes.length} votos del miembro ${userId} en sala ${roomId}`,
      );
    } catch (error) {
      this.logger.error(`Error removing member votes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener progreso del miembro en la sala
   */
  async getMemberProgress(
    roomId: string,
    userId: string,
  ): Promise<{
    currentIndex: number;
    totalItems: number;
    progressPercentage: number;
    remainingItems: number;
  }> {
    const member = await this.getMember(roomId, userId);
    if (!member) {
      throw new Error('Miembro no encontrado');
    }

    const totalItems = member.shuffledList.length;
    const currentIndex = member.currentIndex;
    const progressPercentage =
      totalItems > 0 ? (currentIndex / totalItems) * 100 : 0;
    const remainingItems = Math.max(0, totalItems - currentIndex);

    return {
      currentIndex,
      totalItems,
      progressPercentage: Math.round(progressPercentage),
      remainingItems,
    };
  }

  /**
   * Obtener siguiente elemento multimedia para el miembro
   */
  async getNextMediaForMember(
    roomId: string,
    userId: string,
  ): Promise<string | null> {
    const member = await this.getMember(roomId, userId);
    if (!member) {
      throw new Error('Miembro no encontrado');
    }

    if (member.currentIndex >= member.shuffledList.length) {
      return null; // No hay más elementos
    }

    return member.shuffledList[member.currentIndex];
  }

  /**
   * Marcar miembro como inactivo
   */
  async markMemberInactive(roomId: string, userId: string): Promise<void> {
    try {
      await this.dynamoDBService.conditionalUpdate(
        DynamoDBKeys.roomPK(roomId),
        DynamoDBKeys.memberSK(userId),
        'SET #status = :status, updatedAt = :updatedAt',
        'attribute_exists(PK)',
        {
          '#status': 'status',
        },
        {
          ':status': MemberStatus.INACTIVE,
          ':updatedAt': new Date().toISOString(),
        },
      );

      this.logger.log(
        `Miembro ${userId} marcado como inactivo en sala ${roomId}`,
      );
    } catch (error) {
      this.logger.error(`Error marking member inactive: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generar listas desordenadas para todos los miembros de una sala
   */
  async generateShuffledListsForAllMembers(
    roomId: string,
    masterList: string[],
  ): Promise<number> {
    const members = await this.getRoomMembers(roomId);

    for (const member of members) {
      // Usar userId como seed para consistencia
      const shuffledList = this.generateShuffledList(masterList, member.userId);
      await this.updateMemberShuffledList(roomId, member.userId, shuffledList);
    }

    this.logger.log(
      `Listas desordenadas generadas para ${members.length} miembros en sala ${roomId}`,
    );
    return members.length;
  }
}
