import { Injectable, Logger } from '@nestjs/common';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import { ALIAService } from '../ai/alia.service';
import { MediaService } from '../media/media.service';
import { RoomService } from '../room/room.service';
import { VoteService } from '../vote/vote.service';

export interface GraphQLContext {
  userId: string;
  username: string;
  email: string;
}

export interface CreateRoomInput {
  filters: {
    genres?: string[];
    releaseYearFrom?: number;
    releaseYearTo?: number;
    minRating?: number;
    contentTypes?: string[];
  };
}

export interface JoinRoomInput {
  inviteCode: string;
}

export interface VoteInput {
  roomId: string;
  movieId: string;
  voteType: 'LIKE' | 'DISLIKE';
}

@Injectable()
export class GraphQLResolverService {
  private readonly logger = new Logger(GraphQLResolverService.name);

  constructor(
    private voteService: VoteService,
    private aliaService: ALIAService,
    private multiTableService: MultiTableService,
    private mediaService: MediaService,
    private roomService: RoomService,
  ) {}

  /**
   * Query: getMyHistory
   */
  async getMyHistory(context: GraphQLContext): Promise<any[]> {
    try {
      const history = await this.multiTableService.getUserHistory(
        context.userId,
      );

      // Enriquecer con datos de las salas
      const enrichedHistory = await Promise.all(
        history.map(async (entry) => {
          const room = await this.multiTableService.getRoom(entry.roomId);
          return {
            ...entry,
            room,
          };
        }),
      );

      return enrichedHistory;
    } catch (error) {
      this.logger.error(`Error getting user history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Query: getChatRecommendations
   */
  async getChatRecommendations(
    userText: string,
    context: GraphQLContext,
  ): Promise<any> {
    try {
      const recommendation = await this.aliaService.getChatRecommendations({
        userText,
        userId: context.userId,
      });

      this.logger.log(
        `Salamandra recommendations for user ${context.userId}: ${recommendation.recommendations.join(', ')}`,
      );

      return recommendation;
    } catch (error) {
      this.logger.error(`Error getting chat recommendations: ${error.message}`);
      throw error;
    }
  }

  /**
   * Query: getRoom
   */
  async getRoom(roomId: string, context: GraphQLContext): Promise<any> {
    try {
      const room = await this.multiTableService.getRoom(roomId);
      if (!room) {
        return null;
      }

      // Enriquecer con miembros
      const members = await this.multiTableService.getRoomMembers(roomId);

      return {
        ...room,
        members,
        memberCount: members.length,
      };
    } catch (error) {
      this.logger.error(`Error getting room: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mutation: createRoom
   */
  async createRoom(
    input: CreateRoomInput,
    context: GraphQLContext,
  ): Promise<any> {
    try {
      const roomId = this.generateRoomId();

      const room = {
        roomId,
        hostId: context.userId,
        status: 'WAITING',
        filters: input.filters,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.multiTableService.createRoom(room);

      // Agregar al host como miembro
      await this.multiTableService.addRoomMember(
        roomId,
        context.userId,
        'HOST',
      );

      // Generar código de unión simple
      const joinCode = roomId.substring(0, 6).toUpperCase();

      this.logger.log(`Room created: ${roomId} by ${context.userId}`);

      return {
        room: {
          ...room,
          memberCount: 1,
        },
        joinCode,
      };
    } catch (error) {
      this.logger.error(`Error creating room: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mutation: joinRoom
   */
  async joinRoom(input: JoinRoomInput, context: GraphQLContext): Promise<any> {
    try {
      // Use the room service to join by invite code
      const room = await this.roomService.joinRoom(context.userId, input.inviteCode);
      
      this.logger.log(`User ${context.userId} joined room ${room.id} with invite code ${input.inviteCode}`);

      return room;
    } catch (error) {
      this.logger.error(`Error joining room: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mutation: vote (Stop-on-Match Algorithm)
   */
  async vote(input: VoteInput, context: GraphQLContext): Promise<any> {
    try {
      const result = await this.voteService.processVote({
        ...input,
        userId: context.userId,
      });

      this.logger.log(
        `Vote processed: ${context.userId} -> ${input.voteType} on ${input.movieId} in ${input.roomId}`,
      );

      if (result.matchFound) {
        this.logger.log(`🎉 MATCH FOUND in room ${input.roomId}!`);
      }

      return result;
    } catch (error) {
      this.logger.error(`Error processing vote: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mutation: startVoting
   */
  async startVoting(roomId: string, context: GraphQLContext): Promise<any> {
    try {
      const room = await this.multiTableService.getRoom(roomId);
      if (!room) {
        throw new Error('Sala no encontrada');
      }

      if (room.hostId !== context.userId) {
        throw new Error('Solo el host puede iniciar la votación');
      }

      await this.multiTableService.updateRoomStatus(roomId, 'ACTIVE');

      const updatedRoom = await this.multiTableService.getRoom(roomId);
      const members = await this.multiTableService.getRoomMembers(roomId);

      this.logger.log(
        `Voting started in room ${roomId} by host ${context.userId}`,
      );

      return {
        ...updatedRoom,
        members,
        memberCount: members.length,
      };
    } catch (error) {
      this.logger.error(`Error starting voting: ${error.message}`);
      throw error;
    }
  }

  /**
   * Utilidades privadas
   */
  private generateRoomId(): string {
    return `room_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}
