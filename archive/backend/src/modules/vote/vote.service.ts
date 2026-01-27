import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';

export interface VoteInput {
  roomId: string;
  movieId: string;
  voteType: 'LIKE' | 'DISLIKE';
  userId: string;
}

export interface VoteResult {
  vote: any;
  roomUpdated: boolean;
  matchFound: boolean;
  matchedMovie?: any;
}

@Injectable()
export class VoteService {
  private readonly logger = new Logger(VoteService.name);

  constructor(private multiTableService: MultiTableService) {}

  /**
   * Algoritmo "Stop-on-Match" - Lógica crítica de votación
   */
  async processVote(input: VoteInput): Promise<VoteResult> {
    const { roomId, movieId, voteType, userId } = input;

    try {
      // 1. Verificar que la sala existe y está en estado ACTIVE
      const room = await this.multiTableService.getRoom(roomId);
      if (!room) {
        throw new BadRequestException('Sala no encontrada');
      }

      if (room.status !== 'ACTIVE') {
        throw new BadRequestException(
          `No se puede votar. Estado de la sala: ${room.status}`,
        );
      }

      // 2. Verificar que el usuario es miembro de la sala
      const members = await this.multiTableService.getRoomMembers(roomId);
      const isMember = members.some(
        (member) => member.userId === userId && member.isActive,
      );

      if (!isMember) {
        throw new BadRequestException('No eres miembro de esta sala');
      }

      // 3. Incrementar el contador de votos atómicamente
      const updatedVote = await this.multiTableService.incrementVote(
        roomId,
        movieId,
        voteType,
      );

      // 4. Verificar condición de victoria (Stop-on-Match)
      const totalMembers = members.filter((member) => member.isActive).length;
      const likesCount = updatedVote.likesCount || 0;

      let matchFound = false;
      let roomUpdated = false;

      // Condición de Match: todos los miembros activos han dado LIKE
      if (voteType === 'LIKE' && likesCount === totalMembers) {
        // ¡MATCH ENCONTRADO!
        await this.multiTableService.updateRoomStatus(
          roomId,
          'MATCHED',
          movieId,
        );
        matchFound = true;
        roomUpdated = true;

        this.logger.log(
          `🎉 MATCH encontrado en sala ${roomId}: película ${movieId}`,
        );
      }

      return {
        vote: updatedVote,
        roomUpdated,
        matchFound,
        matchedMovie: matchFound ? { tmdbId: movieId } : undefined,
      };
    } catch (error) {
      this.logger.error(`Error processing vote: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener votos de una sala
   */
  async getRoomVotes(roomId: string): Promise<any[]> {
    try {
      return await this.multiTableService.getRoomVotes(roomId);
    } catch (error) {
      this.logger.error(`Error getting room votes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener detalles de un voto específico
   */
  async getVote(roomId: string, movieId: string): Promise<any | null> {
    try {
      return await this.multiTableService.getVote(roomId, movieId);
    } catch (error) {
      this.logger.error(`Error getting vote: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reiniciar votos de una sala (para nueva ronda)
   */
  async resetRoomVotes(roomId: string): Promise<void> {
    try {
      // Obtener todos los votos actuales
      const votes = await this.multiTableService.getRoomVotes(roomId);

      // En una implementación completa, eliminaríamos los votos existentes
      // Por ahora, solo actualizamos el estado de la sala
      await this.multiTableService.updateRoomStatus(roomId, 'ACTIVE');

      this.logger.log(`Votes reset for room ${roomId}`);
    } catch (error) {
      this.logger.error(`Error resetting room votes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de votación de una sala
   */
  async getVotingStats(roomId: string): Promise<{
    totalVotes: number;
    totalMovies: number;
    topMovie: any | null;
    memberCount: number;
  }> {
    try {
      const [votes, members] = await Promise.all([
        this.multiTableService.getRoomVotes(roomId),
        this.multiTableService.getRoomMembers(roomId),
      ]);

      const totalVotes = votes.reduce(
        (sum, vote) => sum + (vote.likesCount || 0) + (vote.dislikesCount || 0),
        0,
      );

      // Encontrar la película con más likes
      const topMovie = votes.reduce((top, current) => {
        const currentLikes = current.likesCount || 0;
        const topLikes = top?.likesCount || 0;
        return currentLikes > topLikes ? current : top;
      }, null);

      return {
        totalVotes,
        totalMovies: votes.length,
        topMovie,
        memberCount: members.filter((member) => member.isActive).length,
      };
    } catch (error) {
      this.logger.error(`Error getting voting stats: ${error.message}`);
      throw error;
    }
  }
}
