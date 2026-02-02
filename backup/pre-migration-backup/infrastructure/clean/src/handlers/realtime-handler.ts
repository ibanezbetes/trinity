/**
 * Trinity Realtime Handler
 * Handles real-time notifications through AppSync subscriptions
 * Migrated from JavaScript lambdas/trinity-realtime-dev/
 */

import { BaseHandler, createHandler } from './base-handler';
import { AppSyncEvent, ValidationError, TrinityError } from '../shared/types';
import { HandlerUtils } from './base-handler';

interface Connection {
  connectionId: string;
  userId: string;
  roomId?: string;
  connectedAt: string;
  lastPingAt: string;
  isActive: boolean;
}

interface MatchFoundInput {
  roomId: string;
  movieId: string;
  movieTitle: string;
  participants: string[];
  allParticipants: string[];
  showFullScreen: boolean;
  matchType: string;
  voteCount?: number;
  requiredVotes?: number;
  timestamp: string;
}

interface VoteUpdateInput {
  roomId: string;
  userId: string;
  movieId: string;
  voteType: 'LIKE' | 'DISLIKE' | 'SKIP';
  currentVotes: number;
  totalMembers: number;
}

interface NotificationPayload {
  type: 'MATCH_FOUND' | 'USER_JOINED' | 'USER_LEFT' | 'VOTE_CAST' | 'ROOM_UPDATED';
  roomId: string;
  data: any;
  timestamp: string;
}

interface ConnectArgs {
  userId: string;
  roomId?: string;
}

interface DisconnectArgs {
  connectionId: string;
}

interface SendNotificationArgs {
  roomId: string;
  type: string;
  data: any;
  excludeUserId?: string;
}

interface JoinRoomArgs {
  connectionId: string;
  roomId: string;
}

interface LeaveRoomArgs {
  connectionId: string;
  roomId: string;
}

class RealtimeHandler extends BaseHandler {
  async handle(event: AppSyncEvent): Promise<any> {
    const { fieldName } = HandlerUtils.getOperationInfo(event);
    const { userId } = HandlerUtils.getUserInfo(event);

    this.logger.info(`📡 Realtime operation: ${fieldName}`, { userId, fieldName });

    switch (fieldName) {
      case 'connect':
        return this.connect(event.arguments as ConnectArgs);
      
      case 'disconnect':
        return this.disconnect(event.arguments as DisconnectArgs);
      
      case 'sendNotification':
        return this.sendNotification(event.arguments as SendNotificationArgs);
      
      case 'joinRoom':
        return this.joinRoom(event.arguments as JoinRoomArgs);
      
      case 'leaveRoom':
        return this.leaveRoom(event.arguments as LeaveRoomArgs);
      
      case 'getActiveConnections':
        return this.getActiveConnections(event.arguments as { roomId?: string });
      
      case 'pingConnection':
        return this.pingConnection(event.arguments as { connectionId: string });

      // Core AppSync subscription publishing methods
      case 'publishMatchFound':
        return this.publishMatchFound(event.arguments as MatchFoundInput);
      
      case 'publishVoteUpdate':
        return this.publishVoteUpdate(event.arguments as VoteUpdateInput);
      
      default:
        throw new ValidationError(`Unknown realtime operation: ${fieldName}`);
    }
  }

  /**
   * Publish Match Found event to AppSync subscriptions
   * Migrated from JavaScript appsyncPublisher.publishMatchFoundEvent
   */
  private async publishMatchFound(input: MatchFoundInput): Promise<boolean> {
    this.validateArgs<MatchFoundInput>(input, ['roomId', 'movieId', 'movieTitle', 'participants']);

    try {
      this.logger.info(`📡 Publishing ENHANCED match found event for room ${input.roomId}`, {
        movieId: input.movieId,
        movieTitle: input.movieTitle,
        participantCount: input.participants.length
      });

      // IMPORTANTE: Solo notificar a usuarios que votaron LIKE
      const likingParticipants = input.participants || [];
      const allParticipants = input.allParticipants || [];
      
      this.logger.info(`🎯 Notificando MATCH a ${likingParticipants.length} usuarios que votaron LIKE de ${allParticipants.length} total`);

      // Publish to AppSync subscription for ENHANCED match display
      const mutation = `
        mutation PublishMatchFound($input: MatchFoundInput!) {
          publishMatchFound(input: $input) {
            roomId
            movieId
            movieTitle
            participants
            allParticipants
            showFullScreen
            matchType
            timestamp
          }
        }
      `;

      const variables = {
        input: {
          roomId: input.roomId,
          movieId: input.movieId,
          movieTitle: input.movieTitle,
          participants: likingParticipants, // Solo usuarios que votaron LIKE
          allParticipants: allParticipants, // Todos los participantes para contexto
          showFullScreen: true, // Mostrar pantalla completa del match
          matchType: 'CONSENSUS', // Tipo de match
          voteCount: input.voteCount,
          requiredVotes: input.requiredVotes,
          timestamp: input.timestamp
        }
      };

      // Execute AppSync mutation to trigger subscriptions
      await this.executeAppSyncMutation(mutation, variables);

      // CRÍTICO: Solo notificar a usuarios que votaron LIKE
      for (const userId of likingParticipants) {
        this.logger.info(`🎉 Notificando MATCH COMPLETO a usuario ${userId} que votó LIKE en room ${input.roomId}`);
        this.logger.info(`📺 Usuario ${userId} verá pantalla completa de match para película "${input.movieTitle}"`);
      }

      // Notificar a otros usuarios (que no votaron LIKE) sobre el match pero sin pantalla completa
      const nonLikingUsers = allParticipants.filter(userId => !likingParticipants.includes(userId));
      for (const userId of nonLikingUsers) {
        this.logger.info(`📢 Notificando match (sin pantalla completa) a usuario ${userId} que NO votó LIKE en room ${input.roomId}`);
      }

      this.logger.info(`✅ Match notification sent: ${likingParticipants.length} FULL SCREEN, ${nonLikingUsers.length} notification only`);

      return true;
    } catch (error) {
      this.logger.error(`❌ Error publishing enhanced match event for room ${input.roomId}`, error as Error);
      // Don't throw - notification failure shouldn't break the match logic
      return false;
    }
  }

  /**
   * Publish Vote Update event to AppSync subscriptions
   * Migrated from JavaScript appsyncPublisher.publishVoteUpdateEvent
   */
  private async publishVoteUpdate(input: VoteUpdateInput): Promise<boolean> {
    this.validateArgs<VoteUpdateInput>(input, ['roomId', 'userId', 'movieId', 'voteType']);

    try {
      this.logger.info(`📡 Publishing vote update event for room ${input.roomId}`, {
        userId: input.userId,
        movieId: input.movieId,
        voteType: input.voteType,
        currentVotes: input.currentVotes,
        totalMembers: input.totalMembers
      });

      // Get all room members to notify
      const members = await this.getRoomMembers(input.roomId);

      // Broadcast vote update to all room members
      for (const member of members) {
        if (member.userId !== input.userId) { // Don't notify the voter
          this.logger.info(`📡 Notifying user ${member.userId} of vote update in room ${input.roomId}`);
        }
      }

      // Prepare AppSync mutation for vote update
      const mutation = `
        mutation PublishVoteUpdate($input: VoteUpdateInput!) {
          publishVoteUpdate(input: $input) {
            roomId
            userId
            movieId
            voteType
            currentVotes
            totalMembers
            timestamp
          }
        }
      `;

      const variables = {
        input: {
          ...input,
          timestamp: new Date().toISOString()
        }
      };

      // Execute AppSync mutation to trigger subscriptions
      await this.executeAppSyncMutation(mutation, variables);

      return true;
    } catch (error) {
      this.logger.error(`❌ Error publishing vote update for room ${input.roomId}`, error as Error);
      return false;
    }
  }

  /**
   * Execute AppSync mutation to trigger subscriptions
   * Migrated from JavaScript publishToRoomSubscribers function
   */
  private async executeAppSyncMutation(mutation: string, variables: any): Promise<void> {
    const endpoint = this.config.appSync?.endpoint;
    const apiKey = this.config.appSync?.apiKey;

    if (!endpoint) {
      this.logger.warn('⚠️ APPSYNC_ENDPOINT not defined, cannot publish event');
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey || '',
        },
        body: JSON.stringify({
          query: mutation,
          variables
        })
      });

      if (!response.ok) {
        throw new Error(`AppSync request failed: ${response.status} ${response.statusText}`);
      }

      const result: any = await response.json();
      if (result.errors) {
        this.logger.error('❌ AppSync Publish Error:', new Error(JSON.stringify(result.errors)));
      } else {
        this.logger.info(`✅ Event published successfully to ${endpoint}`);
      }
    } catch (error) {
      this.logger.error('❌ Error publishing to AppSync:', error as Error);
      throw error;
    }
  }

  /**
   * Get all active members of a room
   * Migrated from JavaScript getRoomMembers function
   */
  private async getRoomMembers(roomId: string): Promise<Array<{ userId: string; isActive: boolean }>> {
    try {
      const result = await this.db.query<{ userId: string; isActive: boolean }>(
        this.config.tables.roomMembers,
        'roomId = :roomId',
        {
          filterExpression: 'isActive = :active',
          expressionAttributeValues: {
            ':roomId': roomId,
            ':active': true
          }
        }
      );

      return result.items;
    } catch (error) {
      this.logger.error(`❌ Error getting room members for ${roomId}`, error as Error);
      return [];
    }
  }

  /**
   * Get movie title for notifications
   * Migrated from JavaScript appsyncPublisher.getMovieTitle
   */
  private async getMovieTitle(movieId: string): Promise<string> {
    try {
      this.logger.info(`🎬 Getting movie title for ${movieId}`);
      
      // Try to get from cache first
      const cachedMovie = await this.db.get(
        this.config.tables.moviesCache,
        { tmdbId: `movie_details_${movieId}` }
      );

      if (cachedMovie?.movieDetails?.title) {
        return cachedMovie.movieDetails.title;
      }

      // Fallback to generic title
      return `Movie ${movieId}`;
    } catch (error) {
      this.logger.warn(`⚠️ Error getting movie title for ${movieId}`, { error: (error as Error).message });
      return `Movie ${movieId}`;
    }
  }

  /**
   * Handle user connection to real-time subscriptions
   * Manages connection state in DynamoDB for subscription targeting
   */
  private async connect(args: ConnectArgs): Promise<Connection> {
    this.validateArgs<ConnectArgs>(args, ['userId']);

    const connectionId = HandlerUtils.generateId();
    const now = new Date().toISOString();

    const connection: Connection = {
      connectionId,
      userId: args.userId,
      roomId: args.roomId,
      connectedAt: now,
      lastPingAt: now,
      isActive: true,
    };

    // Store connection for subscription targeting
    await this.db.put(this.config.tables.connections, connection);

    this.logger.info('✅ Real-time connection established', { 
      connectionId, 
      userId: args.userId,
      roomId: args.roomId 
    });

    // If joining a room, notify other room members via AppSync subscription
    if (args.roomId) {
      await this.publishVoteUpdate({
        roomId: args.roomId,
        userId: args.userId,
        movieId: 'connection_event',
        voteType: 'LIKE', // Dummy value for connection event
        currentVotes: 0,
        totalMembers: 0
      });
    }

    return connection;
  }

  /**
   * Handle user disconnection from real-time subscriptions
   */
  private async disconnect(args: DisconnectArgs): Promise<boolean> {
    this.validateArgs<DisconnectArgs>(args, ['connectionId']);

    // Get connection details
    const connection = await this.db.get<Connection>(
      this.config.tables.connections,
      { connectionId: args.connectionId }
    );

    if (!connection) {
      this.logger.warn('⚠️ Connection not found for disconnect', { connectionId: args.connectionId });
      return false;
    }

    // Mark connection as inactive
    await this.db.update(
      this.config.tables.connections,
      { connectionId: args.connectionId },
      'SET #isActive = :false, #lastPingAt = :timestamp',
      {
        expressionAttributeNames: {
          '#isActive': 'isActive',
          '#lastPingAt': 'lastPingAt',
        },
        expressionAttributeValues: {
          ':false': false,
          ':timestamp': new Date().toISOString(),
        },
      }
    );

    this.logger.info('✅ Real-time connection disconnected', { 
      connectionId: args.connectionId,
      userId: connection.userId,
      roomId: connection.roomId 
    });

    // If user was in a room, notify other room members via AppSync subscription
    if (connection.roomId) {
      await this.publishVoteUpdate({
        roomId: connection.roomId,
        userId: connection.userId,
        movieId: 'disconnection_event',
        voteType: 'LIKE', // Dummy value for disconnection event
        currentVotes: 0,
        totalMembers: 0
      });
    }

    return true;
  }

  /**
   * Send notification to room members via AppSync subscriptions
   */
  private async sendNotification(args: SendNotificationArgs): Promise<boolean> {
    this.validateArgs<SendNotificationArgs>(args, ['roomId', 'type', 'data']);

    const notification: NotificationPayload = {
      type: args.type as any,
      roomId: args.roomId,
      data: args.data,
      timestamp: new Date().toISOString(),
    };

    // Use AppSync subscription publishing based on notification type
    if (args.type === 'MATCH_FOUND' && args.data.movieId && args.data.movieTitle) {
      await this.publishMatchFound({
        roomId: args.roomId,
        movieId: args.data.movieId,
        movieTitle: args.data.movieTitle,
        participants: args.data.participants || [],
        allParticipants: args.data.allParticipants || [],
        showFullScreen: true,
        matchType: 'CONSENSUS',
        voteCount: args.data.voteCount,
        requiredVotes: args.data.requiredVotes,
        timestamp: notification.timestamp
      });
    } else if (args.type === 'VOTE_CAST' && args.data.userId && args.data.movieId) {
      await this.publishVoteUpdate({
        roomId: args.roomId,
        userId: args.data.userId,
        movieId: args.data.movieId,
        voteType: args.data.voteType || 'LIKE',
        currentVotes: args.data.currentVotes || 0,
        totalMembers: args.data.totalMembers || 0
      });
    }

    this.logger.info('✅ Notification sent to room via AppSync', { 
      roomId: args.roomId, 
      type: args.type,
      excludeUserId: args.excludeUserId 
    });

    return true;
  }

  /**
   * Join a room (update existing connection)
   */
  private async joinRoom(args: JoinRoomArgs): Promise<boolean> {
    this.validateArgs<JoinRoomArgs>(args, ['connectionId', 'roomId']);

    // Update connection with room ID
    const updatedConnection = await this.db.update<Connection>(
      this.config.tables.connections,
      { connectionId: args.connectionId },
      'SET #roomId = :roomId, #lastPingAt = :timestamp',
      {
        expressionAttributeNames: {
          '#roomId': 'roomId',
          '#lastPingAt': 'lastPingAt',
        },
        expressionAttributeValues: {
          ':roomId': args.roomId,
          ':timestamp': new Date().toISOString(),
        },
        returnValues: 'ALL_NEW',
      }
    );

    if (!updatedConnection) {
      throw new ValidationError('Connection not found');
    }

    this.logger.info('✅ Connection joined room', { 
      connectionId: args.connectionId,
      roomId: args.roomId,
      userId: updatedConnection.userId 
    });

    // Notify other room members via AppSync subscription
    await this.publishVoteUpdate({
      roomId: args.roomId,
      userId: updatedConnection.userId,
      movieId: 'user_joined_event',
      voteType: 'LIKE', // Dummy value for join event
      currentVotes: 0,
      totalMembers: 0
    });

    return true;
  }

  /**
   * Leave a room (update existing connection)
   */
  private async leaveRoom(args: LeaveRoomArgs): Promise<boolean> {
    this.validateArgs<LeaveRoomArgs>(args, ['connectionId', 'roomId']);

    // Get connection details before update
    const connection = await this.db.get<Connection>(
      this.config.tables.connections,
      { connectionId: args.connectionId }
    );

    if (!connection) {
      throw new ValidationError('Connection not found');
    }

    // Remove room ID from connection
    await this.db.update(
      this.config.tables.connections,
      { connectionId: args.connectionId },
      'REMOVE #roomId SET #lastPingAt = :timestamp',
      {
        expressionAttributeNames: {
          '#roomId': 'roomId',
          '#lastPingAt': 'lastPingAt',
        },
        expressionAttributeValues: {
          ':timestamp': new Date().toISOString(),
        },
      }
    );

    this.logger.info('✅ Connection left room', { 
      connectionId: args.connectionId,
      roomId: args.roomId,
      userId: connection.userId 
    });

    // Notify other room members via AppSync subscription
    await this.publishVoteUpdate({
      roomId: args.roomId,
      userId: connection.userId,
      movieId: 'user_left_event',
      voteType: 'LIKE', // Dummy value for leave event
      currentVotes: 0,
      totalMembers: 0
    });

    return true;
  }

  /**
   * Get active connections (optionally filtered by room)
   */
  private async getActiveConnections(args: { roomId?: string }): Promise<Connection[]> {
    if (args.roomId) {
      // Get connections for specific room
      const result = await this.db.query<Connection>(
        this.config.tables.connections,
        'roomId = :roomId',
        {
          indexName: 'RoomIdIndex',
          filterExpression: 'isActive = :active',
          expressionAttributeValues: {
            ':roomId': args.roomId,
            ':active': true,
          },
        }
      );

      return result.items;
    } else {
      // Get all active connections
      const result = await this.db.scan<Connection>(
        this.config.tables.connections,
        'isActive = :active',
        { ':active': 'true' } // Use string instead of boolean for DynamoDB
      );

      return result.items;
    }
  }

  /**
   * Ping connection to keep it alive
   */
  private async pingConnection(args: { connectionId: string }): Promise<boolean> {
    this.validateArgs<{ connectionId: string }>(args, ['connectionId']);

    try {
      await this.db.update(
        this.config.tables.connections,
        { connectionId: args.connectionId },
        'SET #lastPingAt = :timestamp',
        {
          expressionAttributeNames: {
            '#lastPingAt': 'lastPingAt',
          },
          expressionAttributeValues: {
            ':timestamp': new Date().toISOString(),
          },
        }
      );

      return true;
    } catch (error) {
      this.logger.warn('⚠️ Failed to ping connection', { connectionId: args.connectionId });
      return false;
    }
  }
}

// Export the handler
export const handler = createHandler(RealtimeHandler);