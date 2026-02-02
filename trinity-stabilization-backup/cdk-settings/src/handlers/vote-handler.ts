/**
 * Trinity Vote Handler
 * Handles individual voting and match detection logic
 */

import { BaseHandler, createHandler } from './base-handler';
import { AppSyncEvent, TrinityVote, TrinityRoom, TrinityRoomMatch, TrinityRoomMember, ValidationError, NotFoundError, UnauthorizedError, ConflictError } from '../shared/types';
import { HandlerUtils } from './base-handler';

interface VoteForMovieArgs {
  roomId: string;
  movieId: string;
  voteType: 'LIKE' | 'DISLIKE';
}

interface GetUserVotesArgs {
  roomId: string;
}

interface GetRoomVotesArgs {
  roomId: string;
  movieId?: string;
}

interface CheckMatchArgs {
  roomId: string;
}

class VoteHandler extends BaseHandler {
  async handle(event: AppSyncEvent): Promise<any> {
    const { fieldName } = HandlerUtils.getOperationInfo(event);
    const { userId } = HandlerUtils.getUserInfo(event);

    this.logger.info(`🗳️ Vote operation: ${fieldName}`, { userId, fieldName });

    switch (fieldName) {
      case 'vote':
        return this.voteForMovie(event.arguments as VoteForMovieArgs, userId!);
      
      case 'getUserVotes':
        return this.getUserVotes(event.arguments as GetUserVotesArgs, userId!);
      
      case 'getRoomVotes':
        return this.getRoomVotes(event.arguments as GetRoomVotesArgs, userId!);
      
      case 'checkMatch':
        return this.checkMatch(event.arguments as CheckMatchArgs, userId!);
      
      case 'getUserVoteProgress':
        return this.getUserVoteProgress(event.arguments as { roomId: string }, userId!);
      
      default:
        throw new ValidationError(`Unknown vote operation: ${fieldName}`);
    }
  }

  /**
   * Vote for a movie and check for matches (matching existing processVote logic)
   */
  private async voteForMovie(args: VoteForMovieArgs, userId: string): Promise<{ vote: TrinityVote; match?: TrinityRoomMatch }> {
    // Validate required fields
    this.validateArgs<VoteForMovieArgs>(args, ['roomId', 'movieId', 'voteType']);

    this.logger.info(`🗳️ Procesando voto: Usuario ${userId}, Sala ${args.roomId}, Película ${args.movieId}, Tipo: ${args.voteType}`);

    // 1. Verificar que la sala existe y está ACTIVE/WAITING
    const room = await this.getRoomAndValidate(args.roomId);

    // 2. Verificar que el usuario es miembro de la sala
    await this.validateUserMembership(userId, args.roomId);

    // 3. Registrar que la película ha sido mostrada (INDIFERENTE del tipo de voto)
    await this.trackShownMovie(args.roomId, args.movieId);

    // 4. Solo procesar votos LIKE - ignorar DISLIKE según algoritmo Stop-on-Match
    if (args.voteType !== 'LIKE') {
      this.logger.info(`⏭️ Ignorando voto ${args.voteType} según algoritmo Stop-on-Match`);
      return {
        vote: {
          roomId: args.roomId,
          userId,
          movieId: args.movieId,
          voteType: args.voteType,
          votedAt: new Date().toISOString(),
        },
      };
    }

    // 5. Prevenir votos duplicados del mismo usuario para la misma película
    await this.preventDuplicateVote(userId, args.roomId, args.movieId);

    // 6. Incrementar contador atómico en VotesTable
    const currentVotes = await this.incrementVoteCount(args.roomId, args.movieId);

    // 7. Obtener maxMembers de la sala (no miembros activos actuales)
    const totalMembers = room.maxMembers || 2; // Fallback a 2 si no está definido
    this.logger.info(`📊 Votos actuales: ${currentVotes}, Miembros requeridos: ${totalMembers}`);

    // Create vote object
    const now = new Date().toISOString();
    const vote: TrinityVote = {
      roomId: args.roomId,
      userId,
      movieId: args.movieId,
      voteType: args.voteType,
      votedAt: now,
    };

    // 8. Verificar si se alcanzó el consenso (Stop-on-Match)
    let match: TrinityRoomMatch | undefined;
    if (currentVotes >= totalMembers) {
      this.logger.info('🎉 ¡Match encontrado! Actualizando sala y notificando...');
      
      // Actualizar sala con resultado
      await this.updateRoomWithMatch(args.roomId, args.movieId);

      // Create match record
      match = {
        roomId: args.roomId,
        movieId: args.movieId,
        votes: currentVotes,
        matchedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      await this.db.put(this.config.tables.roomMatches, match);

      this.logger.info('🎯 New match created', { roomId: args.roomId, movieId: args.movieId, votes: currentVotes });
    }

    return { vote, match };
  }

  /**
   * Get user's votes for a room
   */
  private async getUserVotes(args: GetUserVotesArgs, userId: string): Promise<TrinityVote[]> {
    this.validateArgs<GetUserVotesArgs>(args, ['roomId']);

    // Validate user has access to room
    const hasAccess = await HandlerUtils.validateRoomAccess(
      this.db,
      userId,
      args.roomId,
      this.config
    );

    if (!hasAccess) {
      throw new UnauthorizedError('Access denied to room');
    }

    // Get user's votes for this room
    const votes = await this.db.query<TrinityVote>(
      this.config.tables.votes,
      'roomId = :roomId AND userId = :userId',
      {
        indexName: 'RoomUserIndex',
        expressionAttributeValues: {
          ':roomId': args.roomId,
          ':userId': userId,
        },
      }
    );

    return votes.items;
  }

  /**
   * Get all votes for a room (or specific movie)
   */
  private async getRoomVotes(args: GetRoomVotesArgs, userId: string): Promise<TrinityVote[]> {
    this.validateArgs<GetRoomVotesArgs>(args, ['roomId']);

    // Validate user has access to room
    const hasAccess = await HandlerUtils.validateRoomAccess(
      this.db,
      userId,
      args.roomId,
      this.config
    );

    if (!hasAccess) {
      throw new UnauthorizedError('Access denied to room');
    }

    let votes;

    if (args.movieId) {
      // Get votes for specific movie
      votes = await this.db.query<TrinityVote>(
        this.config.tables.votes,
        'roomId = :roomId AND movieId = :movieId',
        {
          indexName: 'RoomMovieIndex',
          expressionAttributeValues: {
            ':roomId': args.roomId,
            ':movieId': args.movieId,
          },
        }
      );
    } else {
      // Get all votes for room
      votes = await this.db.query<TrinityVote>(
        this.config.tables.votes,
        'roomId = :roomId',
        {
          expressionAttributeValues: {
            ':roomId': args.roomId,
          },
        }
      );
    }

    return votes.items;
  }

  /**
   * Check for matches in a room
   */
  private async checkMatch(args: CheckMatchArgs, userId: string): Promise<TrinityRoomMatch | null> {
    this.validateArgs<CheckMatchArgs>(args, ['roomId']);

    // Validate user has access to room
    const hasAccess = await HandlerUtils.validateRoomAccess(
      this.db,
      userId,
      args.roomId,
      this.config
    );

    if (!hasAccess) {
      throw new UnauthorizedError('Access denied to room');
    }

    // Get room details
    const room = await this.db.get<TrinityRoom>(
      this.config.tables.rooms,
      { id: args.roomId }
    );

    if (!room || !room.isActive) {
      throw new NotFoundError('Room');
    }

    // Check if room already has a match
    if (room.status === 'MATCHED' && room.resultMovieId) {
      const existingMatch = await this.db.get<TrinityRoomMatch>(
        this.config.tables.roomMatches,
        { roomId: args.roomId, movieId: room.resultMovieId }
      );
      return existingMatch;
    }

    // Check all movies for potential matches
    const roomMovies = await this.db.query(
      this.config.tables.roomMovieCache,
      'roomId = :roomId',
      {
        expressionAttributeValues: { ':roomId': args.roomId },
      }
    );

    for (const movie of roomMovies.items) {
      const match = await this.checkForMatch(args.roomId, movie.movieId, room.maxMembers);
      if (match) {
        return match;
      }
    }

    return null;
  }

  /**
   * Get user's voting progress in a room
   */
  private async getUserVoteProgress(args: { roomId: string }, userId: string): Promise<{
    totalMovies: number;
    votedMovies: number;
    remainingMovies: number;
    completionPercentage: number;
    hasVotedAll: boolean;
  }> {
    // Validate user has access to room
    const hasAccess = await HandlerUtils.validateRoomAccess(
      this.db,
      userId,
      args.roomId,
      this.config
    );

    if (!hasAccess) {
      throw new UnauthorizedError('Access denied to room');
    }

    // Get total movies in room cache
    const roomMovies = await this.db.query(
      this.config.tables.roomMovieCache,
      'roomId = :roomId',
      {
        expressionAttributeValues: { ':roomId': args.roomId },
      }
    );

    const totalMovies = roomMovies.count;

    // Get user's votes for this room
    const userVotes = await this.getUserVotes({ roomId: args.roomId }, userId);
    const votedMovies = userVotes.length;

    const remainingMovies = Math.max(0, totalMovies - votedMovies);
    const completionPercentage = totalMovies > 0 ? Math.round((votedMovies / totalMovies) * 100) : 0;
    const hasVotedAll = votedMovies >= totalMovies;

    return {
      totalMovies,
      votedMovies,
      remainingMovies,
      completionPercentage,
      hasVotedAll,
    };
  }

  /**
   * Check if a specific movie has enough votes for a match
   */
  private async checkForMatch(roomId: string, movieId: string, requiredVotes: number): Promise<TrinityRoomMatch | null> {
    // Get all LIKE votes for this movie in this room
    const likeVotes = await this.db.query<TrinityVote>(
      this.config.tables.votes,
      'roomId = :roomId AND movieId = :movieId',
      {
        indexName: 'RoomMovieIndex',
        filterExpression: 'voteType = :voteType',
        expressionAttributeValues: {
          ':roomId': roomId,
          ':movieId': movieId,
          ':voteType': 'LIKE',
        },
      }
    );

    // Check if we have enough votes for a match
    if (likeVotes.count >= requiredVotes) {
      // Check if match already exists
      let existingMatch = await this.db.get<TrinityRoomMatch>(
        this.config.tables.roomMatches,
        { roomId, movieId }
      );

      if (!existingMatch) {
        // Create new match record
        const now = new Date().toISOString();
        const match: TrinityRoomMatch = {
          roomId,
          movieId,
          votes: likeVotes.count,
          matchedAt: now,
          createdAt: now,
          updatedAt: now,
        };

        await this.db.put(this.config.tables.roomMatches, match);
        existingMatch = match;

        this.logger.info('🎯 New match created', { roomId, movieId, votes: likeVotes.count });
      }

      return existingMatch;
    }

    return null;
  }

  /**
   * Get and validate room (matching existing getRoomAndValidate)
   */
  private async getRoomAndValidate(roomId: string): Promise<TrinityRoom> {
    this.logger.info('🔍 DEBUG: getRoomAndValidate usando clave:', { PK: roomId, SK: 'ROOM' });
    
    const response = await this.db.get(this.config.tables.rooms, { PK: roomId, SK: 'ROOM' });
    
    if (!response) {
      throw new NotFoundError('Sala no encontrada');
    }

    const room = response as any;
    this.logger.info(`🔍 Room Status Check: ID=${room.id || room.roomId}, Status=${room.status}, Type=${typeof room.status}`);

    if (room.status !== 'ACTIVE' && room.status !== 'WAITING') {
      throw new ValidationError(`La sala no está disponible para votar. Estado actual: ${room.status}`);
    }

    return {
      ...room,
      id: room.roomId || room.id,
    } as TrinityRoom;
  }

  /**
   * Validate user membership (matching existing validateUserMembership)
   */
  private async validateUserMembership(userId: string, roomId: string): Promise<void> {
    const response = await this.db.get<TrinityRoomMember>(
      this.config.tables.roomMembers,
      { roomId, userId }
    );

    if (!response || !response.isActive) {
      throw new UnauthorizedError('Usuario no es miembro activo de la sala');
    }
  }

  /**
   * Prevent duplicate votes (matching existing preventDuplicateVote)
   */
  private async preventDuplicateVote(userId: string, roomId: string, movieId: string): Promise<void> {
    const userMovieKey = `${userId}#${movieId}`;

    // Check if user already voted for this movie in this room
    const existingVote = await this.db.get(
      this.config.tables.votes,
      {
        roomId,
        'userId#movieId': userMovieKey
      }
    );

    if (existingVote) {
      throw new ConflictError(`Usuario ${userId} ya votó por la película ${movieId} en la sala ${roomId}`);
    }

    // Register the vote to prevent duplicates
    await this.db.put(this.config.tables.votes, {
      roomId,
      'userId#movieId': userMovieKey,
      userId,
      movieId,
      votedAt: new Date().toISOString(),
      voteType: 'LIKE'
    });

    this.logger.info(`✅ Voto registrado: Usuario ${userId}, Sala ${roomId}, Película ${movieId}`);
  }

  /**
   * Increment vote count atomically (matching existing incrementVoteCount)
   */
  private async incrementVoteCount(roomId: string, movieId: string): Promise<number> {
    try {
      // Try to update existing vote count atomically
      const response = await this.db.update(
        this.config.tables.roomMatches,
        { roomId, movieId },
        'ADD votes :increment SET updatedAt = :updatedAt',
        {
          expressionAttributeValues: {
            ':increment': 1,
            ':updatedAt': new Date().toISOString(),
          },
          returnValues: 'ALL_NEW',
        }
      );

      const voteCount = (response as any)?.votes || 1;
      this.logger.info(`✅ Voto incrementado: Sala ${roomId}, Película ${movieId}, Total: ${voteCount}`);
      return voteCount;

    } catch (error) {
      // If item doesn't exist, create it
      try {
        const newVote = {
          roomId,
          movieId,
          votes: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await this.db.put(this.config.tables.roomMatches, newVote);
        this.logger.info(`✅ Nuevo voto creado: Sala ${roomId}, Película ${movieId}, Total: 1`);
        return 1;

      } catch (putError) {
        this.logger.error('❌ Error incrementando voto', putError as Error);
        throw putError;
      }
    }
  }

  /**
   * Update room with match result (matching existing updateRoomWithMatch)
   */
  private async updateRoomWithMatch(roomId: string, movieId: string): Promise<void> {
    this.logger.info('🔍 DEBUG: updateRoomWithMatch usando clave:', { PK: roomId, SK: 'ROOM' });
    
    await this.db.update(
      this.config.tables.rooms,
      { PK: roomId, SK: 'ROOM' },
      'SET #status = :status, resultMovieId = :movieId, updatedAt = :updatedAt',
      {
        expressionAttributeNames: {
          '#status': 'status', // 'status' is a reserved word in DynamoDB
        },
        expressionAttributeValues: {
          ':status': 'MATCHED',
          ':movieId': movieId,
          ':updatedAt': new Date().toISOString(),
        },
      }
    );

    this.logger.info(`✅ Sala ${roomId} actualizada con match: película ${movieId}`);
  }

  /**
   * Track shown movie (matching existing trackShownMovie)
   */
  private async trackShownMovie(roomId: string, movieId: string): Promise<void> {
    try {
      await this.db.update(
        this.config.tables.rooms,
        { PK: roomId, SK: 'ROOM' },
        'ADD shownMovieIds :movieSet',
        {
          expressionAttributeValues: {
            ':movieSet': new Set([movieId]),
          },
        }
      );
    } catch (error) {
      this.logger.error(`⚠️ Error al registrar película mostrada ${movieId}`, error as Error);
      // Don't fail the vote if this fails, it's secondary
    }
  }
}

// Export the handler
export const handler = createHandler(VoteHandler);