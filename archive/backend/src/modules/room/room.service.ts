import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import {
  Room,
  CreateRoomDto,
  ContentFilters,
  RoomSummary,
  MemberRole,
} from '../../domain/entities/room.entity';
import { MemberService } from './member.service';
import { MediaService } from '../media/media.service';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import { EventTracker } from '../analytics/event-tracker.service';
import { EventType } from '../analytics/interfaces/analytics.interfaces';

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);

  constructor(
    private dynamoDBService: DynamoDBService,
    private memberService: MemberService,
    private mediaService: MediaService,
    private realtimeService: RealtimeCompatibilityService,
    private eventTracker: EventTracker,
  ) {}

  /**
   * Crear una nueva sala
   */
  async createRoom(
    creatorId: string,
    createRoomDto: CreateRoomDto,
  ): Promise<Room> {
    const roomId = uuidv4();
    const inviteCode = this.generateInviteCode();

    const room: Room = {
      id: roomId,
      name: createRoomDto.name,
      creatorId,
      filters: createRoomDto.filters,
      masterList: [], // Se llenará cuando se obtenga contenido de TMDB
      inviteCode,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Guardar sala en DynamoDB
    await this.dynamoDBService.putItem({
      PK: DynamoDBKeys.roomPK(roomId),
      SK: DynamoDBKeys.roomSK(),
      GSI1PK: DynamoDBKeys.roomGSI1PK(creatorId),
      GSI1SK: DynamoDBKeys.roomGSI1SK(room.createdAt.toISOString()),
      ...room,
    });

    // Añadir al creador como miembro con rol de creador
    await this.memberService.addMember(roomId, creatorId, MemberRole.CREATOR);

    // 📝 Track room creation event
    await this.eventTracker.trackRoomEvent(
      roomId,
      EventType.ROOM_CREATED,
      creatorId,
      {
        roomName: createRoomDto.name,
        filters: createRoomDto.filters,
        inviteCode,
        memberCount: 1,
      },
      {
        source: 'room_service',
        userAgent: 'backend',
      },
    );

    this.logger.log(`Sala creada: ${roomId} por usuario ${creatorId}`);
    return room;
  }

  /**
   * Obtener sala por ID
   */
  async getRoomById(roomId: string): Promise<Room | null> {
    try {
      const item = await this.dynamoDBService.getItem(
        DynamoDBKeys.roomPK(roomId),
        DynamoDBKeys.roomSK(),
      );

      return item ? (item as unknown as Room) : null;
    } catch (error) {
      this.logger.error(`Error getting room ${roomId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener sala por código de invitación
   */
  async getRoomByInviteCode(inviteCode: string): Promise<Room | null> {
    try {
      // Para optimizar, podríamos usar un GSI con inviteCode como PK
      // Por ahora usamos scan con filtro (menos eficiente pero funcional)
      const items = await this.dynamoDBService.query({
        KeyConditionExpression: 'SK = :sk',
        FilterExpression: 'inviteCode = :inviteCode AND isActive = :isActive',
        ExpressionAttributeValues: {
          ':sk': DynamoDBKeys.roomSK(),
          ':inviteCode': inviteCode,
          ':isActive': true,
        },
      });

      return items.length > 0 ? (items[0] as unknown as Room) : null;
    } catch (error) {
      this.logger.error(`Error getting room by invite code: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener salas del usuario
   */
  async getUserRooms(userId: string): Promise<RoomSummary[]> {
    try {
      // Obtener salas donde el usuario es miembro
      const memberRooms = await this.dynamoDBService.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk',
        ExpressionAttributeValues: {
          ':gsi1pk': DynamoDBKeys.memberGSI1PK(userId),
        },
      });

      const roomSummaries: RoomSummary[] = [];

      for (const memberItem of memberRooms) {
        const roomId = memberItem.roomId;
        const room = await this.getRoomById(roomId);

        if (room) {
          const { members, matches } =
            await this.dynamoDBService.getRoomState(roomId);

          roomSummaries.push({
            id: room.id,
            name: room.name,
            creatorId: room.creatorId,
            memberCount: members.length,
            matchCount: matches.length,
            isActive: room.isActive,
            createdAt: room.createdAt,
          });
        }
      }

      return roomSummaries;
    } catch (error) {
      this.logger.error(
        `Error getting user rooms for ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Unirse a una sala usando código de invitación
   */
  async joinRoom(userId: string, inviteCode: string): Promise<Room> {
    const room = await this.getRoomByInviteCode(inviteCode);

    if (!room) {
      throw new NotFoundException('Código de invitación inválido');
    }

    if (!room.isActive) {
      throw new ForbiddenException('La sala no está activa');
    }

    // Verificar si el usuario ya es miembro
    const existingMember = await this.memberService.getMember(room.id, userId);
    if (existingMember) {
      throw new ForbiddenException('Ya eres miembro de esta sala');
    }

    // Añadir como miembro
    await this.memberService.addMember(room.id, userId, MemberRole.MEMBER);

    // Generar lista desordenada para el nuevo miembro si hay masterList
    if (room.masterList && room.masterList.length > 0) {
      const shuffledList = this.memberService.generateShuffledList(room.masterList, userId);
      await this.memberService.updateMemberShuffledList(room.id, userId, shuffledList);
      this.logger.log(`Lista desordenada generada para nuevo miembro ${userId} en sala ${room.id}`);

      // 🚀 PRE-CARGA INICIAL: Cargar los primeros 15 títulos inmediatamente
      const initialTitles = shuffledList.slice(0, 15);
      this.mediaService.prefetchMovieDetails(initialTitles).catch(error =>
        this.logger.error(`Error prefetching initial titles for user ${userId}: ${error.message}`)
      );
      this.logger.log(`Pre-cargando ${initialTitles.length} títulos iniciales para usuario ${userId}`);
    }

    // Notificar cambio de estado de sala en tiempo real
    const members = await this.memberService.getRoomMembers(room.id);
    await this.realtimeService.notifyRoomStateChange(room.id, {
      status: 'active',
      queueLength: room.masterList?.length || 0,
      activeMembers: members.length,
    });

    this.logger.log(`Usuario ${userId} se unió a la sala ${room.id}`);
    return room;
  }

  /**
   * Abandonar una sala
   */
  async leaveRoom(userId: string, roomId: string): Promise<void> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Sala no encontrada');
    }

    const member = await this.memberService.getMember(roomId, userId);
    if (!member) {
      throw new NotFoundException('No eres miembro de esta sala');
    }

    // Si es el creador, desactivar la sala
    if (member.role === 'creator') {
      await this.deactivateRoom(roomId);
    }

    // Eliminar al miembro y sus votos
    await this.memberService.removeMember(roomId, userId);

    // Notificar cambio de estado de miembro en tiempo real
    await this.realtimeService.notifyMemberStatusChange(roomId, {
      userId,
      status: 'left',
      lastActivity: new Date().toISOString(),
    });

    // Notificar cambio de estado de sala
    const remainingMembers = await this.memberService.getRoomMembers(roomId);
    await this.realtimeService.notifyRoomStateChange(roomId, {
      status: room.isActive ? 'active' : 'finished',
      queueLength: room.masterList?.length || 0,
      activeMembers: remainingMembers.length,
    });

    this.logger.log(`Usuario ${userId} abandonó la sala ${roomId}`);
  }

  /**
   * Actualizar filtros de la sala (solo creador)
   */
  async updateRoomFilters(
    userId: string,
    roomId: string,
    filters: ContentFilters,
  ): Promise<Room> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Sala no encontrada');
    }

    if (room.creatorId !== userId) {
      throw new ForbiddenException(
        'Solo el creador puede actualizar los filtros',
      );
    }

    const updatedRoom = {
      ...room,
      filters,
      updatedAt: new Date(),
    };

    await this.dynamoDBService.putItem({
      PK: DynamoDBKeys.roomPK(roomId),
      SK: DynamoDBKeys.roomSK(),
      GSI1PK: DynamoDBKeys.roomGSI1PK(room.creatorId),
      GSI1SK: DynamoDBKeys.roomGSI1SK(room.createdAt.toISOString()),
      ...updatedRoom,
    });

    this.logger.log(`Filtros actualizados para la sala ${roomId}`);
    return updatedRoom;
  }

  /**
   * Desactivar una sala
   */
  private async deactivateRoom(roomId: string): Promise<void> {
    await this.dynamoDBService.conditionalUpdate(
      DynamoDBKeys.roomPK(roomId),
      DynamoDBKeys.roomSK(),
      'SET isActive = :isActive, updatedAt = :updatedAt',
      'attribute_exists(PK)',
      undefined,
      {
        ':isActive': false,
        ':updatedAt': new Date().toISOString(),
      },
    );
  }

  /**
   * Generar código de invitación único
   */
  private generateInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Actualizar lista maestra de la sala
   */
  async updateMasterList(roomId: string, mediaIds: string[]): Promise<void> {
    await this.dynamoDBService.conditionalUpdate(
      DynamoDBKeys.roomPK(roomId),
      DynamoDBKeys.roomSK(),
      'SET masterList = :masterList, updatedAt = :updatedAt',
      'attribute_exists(PK)',
      undefined,
      {
        ':masterList': mediaIds,
        ':updatedAt': new Date().toISOString(),
      },
    );

    this.logger.log(
      `Lista maestra actualizada para la sala ${roomId} con ${mediaIds.length} elementos`,
    );
  }

  /**
   * Obtener detalles completos de la sala con miembros y matches
   */
  async getRoomDetails(
    roomId: string,
    userId: string,
  ): Promise<{
    room: Room;
    members: any[];
    matchCount: number;
    userRole: string;
  }> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Sala no encontrada');
    }

    // Verificar que el usuario es miembro
    const userMember = await this.memberService.getMember(roomId, userId);
    if (!userMember) {
      throw new ForbiddenException('No tienes acceso a esta sala');
    }

    const { members, matches } =
      await this.dynamoDBService.getRoomState(roomId);

    return {
      room,
      members: members.map((member) => ({
        userId: member.userId,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
        lastActivityAt: member.lastActivityAt,
      })),
      matchCount: matches.length,
      userRole: userMember.role,
    };
  }

  /**
   * Regenerar código de invitación (solo creador)
   */
  async regenerateInviteCode(userId: string, roomId: string): Promise<string> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Sala no encontrada');
    }

    if (room.creatorId !== userId) {
      throw new ForbiddenException(
        'Solo el creador puede regenerar el código de invitación',
      );
    }

    const newInviteCode = this.generateInviteCode();

    await this.dynamoDBService.conditionalUpdate(
      DynamoDBKeys.roomPK(roomId),
      DynamoDBKeys.roomSK(),
      'SET inviteCode = :inviteCode, updatedAt = :updatedAt',
      'attribute_exists(PK)',
      undefined,
      {
        ':inviteCode': newInviteCode,
        ':updatedAt': new Date().toISOString(),
      },
    );

    this.logger.log(`Código de invitación regenerado para la sala ${roomId}`);
    return newInviteCode;
  }

  /**
   * Verificar si el usuario puede acceder a la sala
   */
  async canUserAccessRoom(userId: string, roomId: string): Promise<boolean> {
    try {
      const member = await this.memberService.getMember(roomId, userId);
      return member !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtener estadísticas de la sala
   */
  async getRoomStats(roomId: string): Promise<{
    totalMembers: number;
    activeMembers: number;
    totalMatches: number;
    averageProgress: number;
  }> {
    const { members, matches } =
      await this.dynamoDBService.getRoomState(roomId);
    const activeMembers = await this.memberService.getActiveMembers(roomId);

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
      totalMembers: members.length,
      activeMembers: activeMembers.length,
      totalMatches: matches.length,
      averageProgress: Math.round(averageProgress),
    };
  }

  /**
   * Obtener sala por ID (método de compatibilidad)
   */
  async getRoom(roomId: string): Promise<Room | null> {
    return this.getRoomById(roomId);
  }

  /**
   * Eliminar sala (solo creador)
   */
  async deleteRoom(userId: string, roomId: string): Promise<void> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Sala no encontrada');
    }

    if (room.creatorId !== userId) {
      throw new ForbiddenException('Solo el creador puede eliminar la sala');
    }

    // Marcar como eliminada en lugar de eliminar físicamente
    await this.dynamoDBService.conditionalUpdate(
      DynamoDBKeys.roomPK(roomId),
      DynamoDBKeys.roomSK(),
      'SET isActive = :isActive, deletedAt = :deletedAt, updatedAt = :updatedAt',
      'attribute_exists(PK)',
      undefined,
      {
        ':isActive': false,
        ':deletedAt': new Date().toISOString(),
        ':updatedAt': new Date().toISOString(),
      },
    );

    this.logger.log(`Sala ${roomId} eliminada por usuario ${userId}`);
  }

  /**
   * Pausar sala (solo creador)
   */
  async pauseRoom(roomId: string, userId: string): Promise<void> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Sala no encontrada');
    }

    if (room.creatorId !== userId && userId !== 'system') {
      throw new ForbiddenException('Solo el creador puede pausar la sala');
    }

    await this.dynamoDBService.conditionalUpdate(
      DynamoDBKeys.roomPK(roomId),
      DynamoDBKeys.roomSK(),
      'SET #status = :status, pausedAt = :pausedAt, updatedAt = :updatedAt',
      'attribute_exists(PK)',
      {
        '#status': 'status',
      },
      {
        ':status': 'paused',
        ':pausedAt': new Date().toISOString(),
        ':updatedAt': new Date().toISOString(),
      },
    );

    // Notificar cambio de estado en tiempo real
    await this.realtimeService.notifyRoomStateChange(roomId, {
      status: 'paused',
      queueLength: room.masterList?.length || 0,
      activeMembers: (await this.memberService.getRoomMembers(roomId)).length,
    });

    this.logger.log(`Sala ${roomId} pausada por ${userId}`);
  }

  /**
   * Reanudar sala (solo creador)
   */
  async resumeRoom(roomId: string, userId: string): Promise<void> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Sala no encontrada');
    }

    if (room.creatorId !== userId && userId !== 'system') {
      throw new ForbiddenException('Solo el creador puede reanudar la sala');
    }

    await this.dynamoDBService.conditionalUpdate(
      DynamoDBKeys.roomPK(roomId),
      DynamoDBKeys.roomSK(),
      'SET #status = :status, resumedAt = :resumedAt, updatedAt = :updatedAt',
      'attribute_exists(PK)',
      {
        '#status': 'status',
      },
      {
        ':status': 'active',
        ':resumedAt': new Date().toISOString(),
        ':updatedAt': new Date().toISOString(),
      },
    );

    // Notificar cambio de estado en tiempo real
    await this.realtimeService.notifyRoomStateChange(roomId, {
      status: 'active',
      queueLength: room.masterList?.length || 0,
      activeMembers: (await this.memberService.getRoomMembers(roomId)).length,
    });

    this.logger.log(`Sala ${roomId} reanudada por ${userId}`);
  }
}
