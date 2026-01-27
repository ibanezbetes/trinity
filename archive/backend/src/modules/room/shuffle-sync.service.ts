import { Injectable, Logger } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { MediaService } from '../media/media.service';
import { MemberService } from './member.service';
import { RoomService } from './room.service';
import { ContentFilters } from '../../domain/entities/room.entity';
import { MediaItem } from '../../domain/entities/media.entity';

export interface ShuffleResult {
  masterListUpdated: boolean;
  shuffledListsGenerated: number;
  totalMediaItems: number;
}

@Injectable()
export class ShuffleSyncService {
  private readonly logger = new Logger(ShuffleSyncService.name);

  constructor(
    private dynamoDBService: DynamoDBService,
    private mediaService: MediaService,
    private memberService: MemberService,
    private roomService: RoomService,
  ) {}

  /**
   * Generar Lista Maestra y Listas Desordenadas para una sala
   */
  async generateMasterListAndShuffledLists(
    roomId: string,
  ): Promise<ShuffleResult> {
    try {
      // 1. Obtener la sala y sus filtros
      const room = await this.roomService.getRoomById(roomId);
      if (!room) {
        throw new Error('Sala no encontrada');
      }

      // 2. Obtener contenido de TMDB basado en filtros
      const mediaItems = await this.mediaService.fetchMovies(room.filters);

      if (mediaItems.length === 0) {
        this.logger.warn(
          `No se encontró contenido para la sala ${roomId} con los filtros aplicados`,
        );
        return {
          masterListUpdated: false,
          shuffledListsGenerated: 0,
          totalMediaItems: 0,
        };
      }

      // 3. Crear Lista Maestra (array de mediaIds)
      const masterList = mediaItems.map((item) => item.tmdbId);

      // 4. Actualizar Lista Maestra en la sala
      await this.roomService.updateMasterList(roomId, masterList);

      // 5. Generar Listas Desordenadas para todos los miembros
      const shuffledCount =
        await this.memberService.generateShuffledListsForAllMembers(
          roomId,
          masterList,
        );

      this.logger.log(
        `Shuffle & Sync completado para sala ${roomId}: ` +
          `${masterList.length} elementos, ${shuffledCount} listas generadas`,
      );

      return {
        masterListUpdated: true,
        shuffledListsGenerated: shuffledCount,
        totalMediaItems: masterList.length,
      };
    } catch (error) {
      this.logger.error(
        `Error en Shuffle & Sync para sala ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Regenerar listas desordenadas manteniendo la Lista Maestra
   */
  async regenerateShuffledLists(roomId: string): Promise<ShuffleResult> {
    try {
      const room = await this.roomService.getRoomById(roomId);
      if (!room) {
        throw new Error('Sala no encontrada');
      }

      if (room.masterList.length === 0) {
        // Si no hay Lista Maestra, generar todo desde cero
        return this.generateMasterListAndShuffledLists(roomId);
      }

      // Regenerar solo las listas desordenadas
      const shuffledCount =
        await this.memberService.generateShuffledListsForAllMembers(
          roomId,
          room.masterList,
        );

      this.logger.log(
        `Listas desordenadas regeneradas para sala ${roomId}: ${shuffledCount} listas`,
      );

      return {
        masterListUpdated: false,
        shuffledListsGenerated: shuffledCount,
        totalMediaItems: room.masterList.length,
      };
    } catch (error) {
      this.logger.error(
        `Error regenerando listas desordenadas: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Añadir nuevo contenido a la Lista Maestra y actualizar listas desordenadas
   */
  async injectNewContent(
    roomId: string,
    newMediaIds: string[],
  ): Promise<ShuffleResult> {
    try {
      const room = await this.roomService.getRoomById(roomId);
      if (!room) {
        throw new Error('Sala no encontrada');
      }

      // Combinar contenido existente con nuevo contenido (evitar duplicados)
      const existingIds = new Set(room.masterList);
      const uniqueNewIds = newMediaIds.filter((id) => !existingIds.has(id));

      if (uniqueNewIds.length === 0) {
        this.logger.log(
          `No hay contenido nuevo para inyectar en sala ${roomId}`,
        );
        return {
          masterListUpdated: false,
          shuffledListsGenerated: 0,
          totalMediaItems: room.masterList.length,
        };
      }

      // Actualizar Lista Maestra
      const updatedMasterList = [...room.masterList, ...uniqueNewIds];
      await this.roomService.updateMasterList(roomId, updatedMasterList);

      // Inyectar nuevo contenido en las listas desordenadas existentes
      await this.injectContentIntoShuffledLists(roomId, uniqueNewIds);

      this.logger.log(
        `Contenido inyectado en sala ${roomId}: ` +
          `${uniqueNewIds.length} nuevos elementos, total ${updatedMasterList.length}`,
      );

      return {
        masterListUpdated: true,
        shuffledListsGenerated: await this.memberService
          .getRoomMembers(roomId)
          .then((m) => m.length),
        totalMediaItems: updatedMasterList.length,
      };
    } catch (error) {
      this.logger.error(`Error inyectando contenido: ${error.message}`);
      throw error;
    }
  }

  /**
   * Inyectar contenido en listas desordenadas existentes
   */
  private async injectContentIntoShuffledLists(
    roomId: string,
    newMediaIds: string[],
  ): Promise<void> {
    const members = await this.memberService.getRoomMembers(roomId);

    for (const member of members) {
      // Generar posiciones aleatorias para insertar el nuevo contenido
      const updatedList = [...member.shuffledList];

      for (const mediaId of newMediaIds) {
        // Insertar en posición aleatoria después del índice actual
        const insertPosition = Math.max(
          member.currentIndex + 1,
          Math.floor(Math.random() * (updatedList.length + 1)),
        );
        updatedList.splice(insertPosition, 0, mediaId);
      }

      // Actualizar la lista del miembro
      await this.memberService.updateMemberShuffledList(
        roomId,
        member.userId,
        updatedList,
      );
    }

    this.logger.log(
      `Contenido inyectado en ${members.length} listas desordenadas`,
    );
  }

  /**
   * Verificar consistencia Shuffle & Sync
   */
  async verifyShuffleSyncConsistency(roomId: string): Promise<{
    isConsistent: boolean;
    masterListSize: number;
    memberListSizes: number[];
    uniqueOrderings: boolean;
    issues: string[];
  }> {
    try {
      const room = await this.roomService.getRoomById(roomId);
      const members = await this.memberService.getRoomMembers(roomId);

      if (!room) {
        return {
          isConsistent: false,
          masterListSize: 0,
          memberListSizes: [],
          uniqueOrderings: false,
          issues: ['Sala no encontrada'],
        };
      }

      const issues: string[] = [];
      const memberListSizes: number[] = [];
      const memberLists: string[][] = [];

      // Verificar cada miembro
      for (const member of members) {
        memberListSizes.push(member.shuffledList.length);
        memberLists.push(member.shuffledList);

        // Verificar que la lista del miembro contenga los mismos elementos que la Lista Maestra
        const memberSet = new Set(member.shuffledList);
        const masterSet = new Set(room.masterList);

        if (memberSet.size !== masterSet.size) {
          issues.push(
            `Miembro ${member.userId}: tamaño de lista inconsistente`,
          );
        }

        for (const mediaId of room.masterList) {
          if (!memberSet.has(mediaId)) {
            issues.push(`Miembro ${member.userId}: falta elemento ${mediaId}`);
          }
        }

        for (const mediaId of member.shuffledList) {
          if (!masterSet.has(mediaId)) {
            issues.push(`Miembro ${member.userId}: elemento extra ${mediaId}`);
          }
        }
      }

      // Verificar que las listas estén en diferentes órdenes (uniqueOrderings)
      let uniqueOrderings = true;
      if (memberLists.length > 1) {
        const firstList = memberLists[0];
        uniqueOrderings = memberLists.some(
          (list) => JSON.stringify(list) !== JSON.stringify(firstList),
        );
      }

      const isConsistent = issues.length === 0;

      return {
        isConsistent,
        masterListSize: room.masterList.length,
        memberListSizes,
        uniqueOrderings,
        issues,
      };
    } catch (error) {
      this.logger.error(`Error verificando consistencia: ${error.message}`);
      return {
        isConsistent: false,
        masterListSize: 0,
        memberListSizes: [],
        uniqueOrderings: false,
        issues: [`Error: ${error.message}`],
      };
    }
  }

  /**
   * Obtener estadísticas de Shuffle & Sync
   */
  async getShuffleSyncStats(roomId: string): Promise<{
    masterListSize: number;
    totalMembers: number;
    averageProgress: number;
    listsGenerated: boolean;
    lastUpdate: Date | null;
  }> {
    try {
      const room = await this.roomService.getRoomById(roomId);
      const members = await this.memberService.getRoomMembers(roomId);

      if (!room) {
        throw new Error('Sala no encontrada');
      }

      // Calcular progreso promedio
      const totalProgress = members.reduce((sum, member) => {
        const progress =
          member.shuffledList.length > 0
            ? (member.currentIndex / member.shuffledList.length) * 100
            : 0;
        return sum + progress;
      }, 0);

      const averageProgress =
        members.length > 0 ? totalProgress / members.length : 0;

      return {
        masterListSize: room.masterList.length,
        totalMembers: members.length,
        averageProgress: Math.round(averageProgress),
        listsGenerated: members.every((m) => m.shuffledList.length > 0),
        lastUpdate: room.updatedAt,
      };
    } catch (error) {
      this.logger.error(
        `Error obteniendo estadísticas Shuffle & Sync: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Resetear todas las listas de una sala
   */
  async resetRoomLists(roomId: string): Promise<void> {
    try {
      const members = await this.memberService.getRoomMembers(roomId);

      // Resetear índices y listas de todos los miembros
      for (const member of members) {
        await this.memberService.updateMemberShuffledList(
          roomId,
          member.userId,
          [],
        );
      }

      // Limpiar Lista Maestra
      await this.roomService.updateMasterList(roomId, []);

      this.logger.log(`Listas reseteadas para la sala ${roomId}`);
    } catch (error) {
      this.logger.error(`Error reseteando listas: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sincronizar índice del miembro basándose en los votos existentes
   * Útil cuando el índice se desincroniza por errores
   */
  async syncMemberIndex(
    roomId: string,
    userId: string,
  ): Promise<{
    previousIndex: number;
    newIndex: number;
    votesFound: number;
    synced: boolean;
  }> {
    try {
      const member = await this.memberService.getMember(roomId, userId);
      if (!member) {
        throw new Error('Miembro no encontrado');
      }

      // Contar cuántos votos tiene el usuario para elementos en su lista
      const votedMediaIds = new Set<string>();
      
      // Obtener votos del usuario en esta sala
      const votes = await this.dynamoDBService.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `ROOM#${roomId}`,
          ':sk': `VOTE#${userId}#`,
        },
      });

      for (const vote of votes) {
        if (vote.mediaId) {
          votedMediaIds.add(vote.mediaId);
        }
      }

      // Calcular el índice correcto basándose en los votos
      // El índice debe ser igual al número de elementos votados que están en la lista
      let correctIndex = 0;
      for (let i = 0; i < member.shuffledList.length; i++) {
        if (votedMediaIds.has(member.shuffledList[i])) {
          correctIndex = i + 1; // El índice debe apuntar al siguiente elemento no votado
        }
      }

      const previousIndex = member.currentIndex;

      if (correctIndex !== previousIndex) {
        // Actualizar el índice del miembro
        await this.dynamoDBService.conditionalUpdate(
          `ROOM#${roomId}`,
          `MEMBER#${userId}`,
          'SET currentIndex = :currentIndex, lastActivityAt = :lastActivityAt, updatedAt = :updatedAt',
          'attribute_exists(PK)',
          undefined,
          {
            ':currentIndex': correctIndex,
            ':lastActivityAt': new Date().toISOString(),
          },
        );

        this.logger.log(
          `Índice sincronizado para miembro ${userId} en sala ${roomId}: ${previousIndex} -> ${correctIndex}`,
        );
      }

      return {
        previousIndex,
        newIndex: correctIndex,
        votesFound: votedMediaIds.size,
        synced: correctIndex !== previousIndex,
      };
    } catch (error) {
      this.logger.error(`Error sincronizando índice: ${error.message}`);
      throw error;
    }
  }
}
