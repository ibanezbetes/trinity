/**
 * State Synchronization Service
 * Handles full room state refresh when connections are restored
 * Ensures vote counts and progress are accurately synced
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { publishRoomStateSyncEvent, publishConnectionStatusEvent } from '../utils/appsync-publisher';
import { logBusinessMetric, logError, PerformanceTimer } from '../utils/metrics';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export interface ConnectionInfo {
  userId: string;
  connectionId: string;
  roomId: string;
  connectedAt: string;
  lastSeen: string;
  userAgent?: string;
  reconnectionAttempts: number;
  status: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
}

export interface RoomSyncState {
  roomId: string;
  status: 'WAITING' | 'ACTIVE' | 'MATCHED' | 'COMPLETED';
  currentMovieId?: string;
  currentMovieInfo?: {
    title: string;
    genres: string[];
    year?: number;
    posterPath?: string;
  };
  totalMembers: number;
  activeConnections: number;
  votingProgress: {
    currentVotes: number;
    totalRequired: number;
    percentage: number;
    votingUsers: string[];
    pendingUsers: string[];
  };
  matchResult?: {
    movieId: string;
    movieTitle: string;
    foundAt: string;
  };
  lastSyncAt: string;
}

/**
 * State Synchronization Service
 * Manages connection state and room synchronization for real-time updates
 */
export class StateSyncService {
  private readonly CONNECTION_TIMEOUT_MS = 30000; // 30 seconds
  private readonly MAX_RECONNECTION_ATTEMPTS = 5;
  private readonly SYNC_DEBOUNCE_MS = 1000; // 1 second debounce for sync events

  // In-memory connection tracking (in production, use Redis or DynamoDB)
  private connections: Map<string, ConnectionInfo> = new Map();
  private syncTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Handle user connection to a room
   */
  async handleUserConnection(
    roomId: string,
    userId: string,
    connectionId: string,
    userAgent?: string
  ): Promise<void> {
    const timer = new PerformanceTimer('HandleUserConnection');
    console.log(`🔌 User ${userId} connecting to room ${roomId} with connection ${connectionId.substring(0, 8)}...`);

    try {
      // Get existing connection info
      const existingConnection = this.connections.get(`${roomId}_${userId}`);
      const reconnectionAttempts = existingConnection?.reconnectionAttempts || 0;

      // Create new connection info
      const connectionInfo: ConnectionInfo = {
        userId,
        connectionId,
        roomId,
        connectedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        userAgent,
        reconnectionAttempts: existingConnection ? reconnectionAttempts + 1 : 0,
        status: 'CONNECTED'
      };

      // Store connection info
      this.connections.set(`${roomId}_${userId}`, connectionInfo);

      // Update connection status in DynamoDB
      await this.updateConnectionStatusInDB(roomId, userId, 'CONNECTED', connectionInfo);

      // Publish connection status event
      await publishConnectionStatusEvent(roomId, userId, 'CONNECTED', connectionId, {
        userAgent,
        reconnectionAttempts: connectionInfo.reconnectionAttempts
      });

      // If this is a reconnection, trigger full state sync
      if (existingConnection && connectionInfo.reconnectionAttempts > 0) {
        console.log(`🔄 User ${userId} reconnecting (attempt ${connectionInfo.reconnectionAttempts}), triggering state sync`);
        await this.triggerRoomStateSync(roomId, userId);
      }

      // Log business metric
      logBusinessMetric('ROOM_JOINED', roomId, userId, {
        connectionId: connectionId.substring(0, 8),
        reconnectionAttempts: connectionInfo.reconnectionAttempts,
        isReconnection: connectionInfo.reconnectionAttempts > 0
      });

      timer.finish(true, undefined, { 
        reconnectionAttempts: connectionInfo.reconnectionAttempts,
        isReconnection: connectionInfo.reconnectionAttempts > 0
      });

    } catch (error) {
      logError('HandleUserConnection', error as Error, { roomId, userId, connectionId });
      timer.finish(false, (error as Error).name);
      throw error;
    }
  }

  /**
   * Handle user disconnection from a room
   */
  async handleUserDisconnection(
    roomId: string,
    userId: string,
    connectionId: string
  ): Promise<void> {
    const timer = new PerformanceTimer('HandleUserDisconnection');
    console.log(`🔌 User ${userId} disconnecting from room ${roomId}`);

    try {
      const connectionKey = `${roomId}_${userId}`;
      const existingConnection = this.connections.get(connectionKey);

      if (existingConnection) {
        // Update connection status
        existingConnection.status = 'DISCONNECTED';
        existingConnection.lastSeen = new Date().toISOString();
        this.connections.set(connectionKey, existingConnection);

        // Update connection status in DynamoDB
        await this.updateConnectionStatusInDB(roomId, userId, 'DISCONNECTED', existingConnection);

        // Publish disconnection event
        await publishConnectionStatusEvent(roomId, userId, 'DISCONNECTED', connectionId, {
          userAgent: existingConnection.userAgent,
          reconnectionAttempts: existingConnection.reconnectionAttempts
        });

        // Schedule connection cleanup after timeout
        setTimeout(() => {
          this.cleanupStaleConnection(roomId, userId);
        }, this.CONNECTION_TIMEOUT_MS);
      }

      // Log business metric
      logBusinessMetric('USER_DISCONNECTED', roomId, userId, {
        connectionId: connectionId.substring(0, 8),
        connectionDuration: existingConnection ? 
          Date.now() - new Date(existingConnection.connectedAt).getTime() : 0
      });

      timer.finish(true);

    } catch (error) {
      logError('HandleUserDisconnection', error as Error, { roomId, userId, connectionId });
      timer.finish(false, (error as Error).name);
      throw error;
    }
  }

  /**
   * Trigger full room state synchronization for a specific user or all users
   */
  async triggerRoomStateSync(roomId: string, targetUserId?: string): Promise<void> {
    const timer = new PerformanceTimer('TriggerRoomStateSync');
    console.log(`🔄 Triggering room state sync for room ${roomId}${targetUserId ? ` (user: ${targetUserId})` : ' (all users)'}`);

    try {
      // Debounce sync events to avoid overwhelming the system
      const syncKey = targetUserId ? `${roomId}_${targetUserId}` : roomId;
      
      if (this.syncTimers.has(syncKey)) {
        clearTimeout(this.syncTimers.get(syncKey)!);
      }

      const syncTimer = setTimeout(async () => {
        try {
          // Get comprehensive room state
          const roomState = await this.getComprehensiveRoomState(roomId);
          
          // Publish state sync event
          await publishRoomStateSyncEvent(roomId, targetUserId);
          
          // Update last sync timestamp
          await this.updateLastSyncTimestamp(roomId);
          
          // Log business metric
          logBusinessMetric('ROOM_STATE_SYNCED', roomId, targetUserId || 'all_users', {
            roomStatus: roomState.status,
            totalMembers: roomState.totalMembers,
            activeConnections: roomState.activeConnections,
            votingProgress: roomState.votingProgress.percentage
          });
          
          console.log(`✅ Room state sync completed for room ${roomId}`);
          
        } catch (syncError) {
          console.error('❌ Error in debounced sync:', syncError);
        } finally {
          this.syncTimers.delete(syncKey);
        }
      }, this.SYNC_DEBOUNCE_MS);

      this.syncTimers.set(syncKey, syncTimer);
      timer.finish(true);

    } catch (error) {
      logError('TriggerRoomStateSync', error as Error, { roomId, targetUserId });
      timer.finish(false, (error as Error).name);
      throw error;
    }
  }

  /**
   * Get comprehensive room state for synchronization
   */
  async getComprehensiveRoomState(roomId: string): Promise<RoomSyncState> {
    try {
      // Get room information
      const roomResponse = await docClient.send(new GetCommand({
        TableName: process.env.ROOMS_TABLE!,
        Key: { PK: roomId, SK: 'ROOM' },
      }));

      const room = roomResponse.Item;
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }

      // Get all active members
      const membersResponse = await docClient.send(new QueryCommand({
        TableName: process.env.ROOM_MEMBERS_TABLE!,
        KeyConditionExpression: 'roomId = :roomId',
        FilterExpression: 'isActive = :active',
        ExpressionAttributeValues: {
          ':roomId': roomId,
          ':active': true
        }
      }));

      const totalMembers = membersResponse.Count || 0;
      const allMembers = membersResponse.Items?.map(item => item.userId) || [];

      // Get current voting progress if room is active
      let votingProgress = {
        currentVotes: 0,
        totalRequired: totalMembers,
        percentage: 0,
        votingUsers: [] as string[],
        pendingUsers: allMembers
      };

      if (room.status === 'ACTIVE' && room.currentMovieId) {
        // Get current votes
        const votesResponse = await docClient.send(new GetCommand({
          TableName: process.env.VOTES_TABLE!,
          Key: { roomId, movieId: room.currentMovieId },
        }));

        const currentVotes = votesResponse.Item?.votes || 0;

        // Get users who have voted
        const votingUsers = await this.getVotingUsers(roomId, room.currentMovieId);
        const pendingUsers = allMembers.filter(userId => !votingUsers.includes(userId));

        votingProgress = {
          currentVotes,
          totalRequired: totalMembers,
          percentage: totalMembers > 0 ? (currentVotes / totalMembers) * 100 : 0,
          votingUsers,
          pendingUsers
        };
      }

      // Get current movie info if available
      let currentMovieInfo;
      if (room.currentMovieId) {
        currentMovieInfo = await this.getMovieInfo(room.currentMovieId);
      }

      // Get match result if room is matched
      let matchResult;
      if (room.status === 'MATCHED' && room.resultMovieId) {
        const matchMovieInfo = await this.getMovieInfo(room.resultMovieId);
        matchResult = {
          movieId: room.resultMovieId,
          movieTitle: matchMovieInfo.title,
          foundAt: room.updatedAt || new Date().toISOString()
        };
      }

      // Count active connections
      const activeConnections = Array.from(this.connections.values())
        .filter(conn => conn.roomId === roomId && conn.status === 'CONNECTED')
        .length;

      return {
        roomId,
        status: room.status,
        currentMovieId: room.currentMovieId,
        currentMovieInfo,
        totalMembers,
        activeConnections: Math.max(activeConnections, totalMembers), // Fallback to member count
        votingProgress,
        matchResult,
        lastSyncAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Error getting comprehensive room state:', error);
      throw error;
    }
  }

  /**
   * Get users who have voted for a specific movie
   */
  private async getVotingUsers(roomId: string, movieId: string): Promise<string[]> {
    try {
      const roomMovieId = `${roomId}_${movieId}`;
      
      const response = await docClient.send(new QueryCommand({
        TableName: process.env.USER_VOTES_TABLE!,
        IndexName: 'RoomMovieIndex',
        KeyConditionExpression: 'roomMovieId = :roomMovieId',
        ExpressionAttributeValues: {
          ':roomMovieId': roomMovieId
        },
        ProjectionExpression: 'userId'
      }));
      
      return response.Items?.map(item => item.userId) || [];
    } catch (error) {
      console.warn('⚠️ Error getting voting users:', error);
      return [];
    }
  }

  /**
   * Get movie information for state sync
   */
  private async getMovieInfo(movieId: string): Promise<{
    title: string;
    genres: string[];
    year?: number;
    posterPath?: string;
  }> {
    try {
      // Try to get from movie cache first
      const cacheResponse = await docClient.send(new QueryCommand({
        TableName: process.env.MOVIE_CACHE_TABLE!,
        IndexName: 'MovieIdIndex',
        KeyConditionExpression: 'movieId = :movieId',
        ExpressionAttributeValues: {
          ':movieId': movieId
        },
        Limit: 1
      }));
      
      if (cacheResponse.Items && cacheResponse.Items.length > 0) {
        const cachedMovie = cacheResponse.Items[0];
        return {
          title: cachedMovie.title || `Movie ${movieId}`,
          genres: cachedMovie.genres || [],
          year: cachedMovie.year,
          posterPath: cachedMovie.posterPath
        };
      }
      
      // Fallback to basic info
      return {
        title: `Movie ${movieId}`,
        genres: [],
      };
      
    } catch (error) {
      console.warn('⚠️ Error getting movie info:', error);
      return {
        title: `Movie ${movieId}`,
        genres: [],
      };
    }
  }

  /**
   * Update connection status in DynamoDB
   */
  private async updateConnectionStatusInDB(
    roomId: string,
    userId: string,
    status: 'CONNECTED' | 'DISCONNECTED',
    connectionInfo: ConnectionInfo
  ): Promise<void> {
    try {
      await docClient.send(new UpdateCommand({
        TableName: process.env.ROOM_MEMBERS_TABLE!,
        Key: { roomId, userId },
        UpdateExpression: 'SET connectionStatus = :status, lastSeen = :lastSeen, reconnectionAttempts = :attempts',
        ExpressionAttributeValues: {
          ':status': status,
          ':lastSeen': connectionInfo.lastSeen,
          ':attempts': connectionInfo.reconnectionAttempts
        }
      }));
    } catch (error) {
      console.warn('⚠️ Error updating connection status in DB:', error);
      // Don't throw - this is not critical for functionality
    }
  }

  /**
   * Update last sync timestamp for a room
   */
  private async updateLastSyncTimestamp(roomId: string): Promise<void> {
    try {
      await docClient.send(new UpdateCommand({
        TableName: process.env.ROOMS_TABLE!,
        Key: { PK: roomId, SK: 'ROOM' },
        UpdateExpression: 'SET lastSyncAt = :timestamp',
        ExpressionAttributeValues: {
          ':timestamp': new Date().toISOString()
        }
      }));
    } catch (error) {
      console.warn('⚠️ Error updating last sync timestamp:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Clean up stale connections
   */
  private cleanupStaleConnection(roomId: string, userId: string): void {
    const connectionKey = `${roomId}_${userId}`;
    const connection = this.connections.get(connectionKey);
    
    if (connection && connection.status === 'DISCONNECTED') {
      const timeSinceLastSeen = Date.now() - new Date(connection.lastSeen).getTime();
      
      if (timeSinceLastSeen >= this.CONNECTION_TIMEOUT_MS) {
        console.log(`🧹 Cleaning up stale connection for user ${userId} in room ${roomId}`);
        this.connections.delete(connectionKey);
        
        // Log cleanup metric
        logBusinessMetric('CONNECTION_CLEANED_UP', roomId, userId, {
          connectionDuration: Date.now() - new Date(connection.connectedAt).getTime(),
          timeSinceLastSeen
        });
      }
    }
  }

  /**
   * Get connection statistics for monitoring
   */
  getConnectionStats(roomId?: string): {
    totalConnections: number;
    activeConnections: number;
    disconnectedConnections: number;
    roomConnections?: { [roomId: string]: number };
  } {
    const connections = Array.from(this.connections.values());
    const filteredConnections = roomId ? 
      connections.filter(conn => conn.roomId === roomId) : 
      connections;

    const activeConnections = filteredConnections.filter(conn => conn.status === 'CONNECTED').length;
    const disconnectedConnections = filteredConnections.filter(conn => conn.status === 'DISCONNECTED').length;

    const stats = {
      totalConnections: filteredConnections.length,
      activeConnections,
      disconnectedConnections
    };

    if (!roomId) {
      // Group by room
      const roomConnections: { [roomId: string]: number } = {};
      connections.forEach(conn => {
        if (conn.status === 'CONNECTED') {
          roomConnections[conn.roomId] = (roomConnections[conn.roomId] || 0) + 1;
        }
      });
      return { ...stats, roomConnections };
    }

    return stats;
  }

  /**
   * Force sync all rooms (for maintenance or recovery)
   */
  async forceSyncAllRooms(): Promise<void> {
    console.log('🔄 Force syncing all active rooms...');
    
    try {
      // Get all unique room IDs from active connections
      const roomIds = [...new Set(Array.from(this.connections.values())
        .filter(conn => conn.status === 'CONNECTED')
        .map(conn => conn.roomId))];

      // Trigger sync for each room
      const syncPromises = roomIds.map(roomId => 
        this.triggerRoomStateSync(roomId).catch(error => 
          console.error(`❌ Error syncing room ${roomId}:`, error)
        )
      );

      await Promise.all(syncPromises);
      console.log(`✅ Force sync completed for ${roomIds.length} rooms`);

    } catch (error) {
      console.error('❌ Error in force sync all rooms:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const stateSyncService = new StateSyncService();