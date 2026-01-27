/**
 * WebSocket Manager Service Implementation
 * Handles WebSocket connections and Redis pub/sub coordination
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IWebSocketManager,
  WebSocketConnection,
  WebSocketMessage,
  ConnectionStats,
  RedisMessage,
} from './websocket.interface';
import { RedisService } from './redis.service';

@Injectable()
export class WebSocketService implements IWebSocketManager, OnModuleDestroy {
  private readonly logger = new Logger(WebSocketService.name);
  private connections = new Map<string, WebSocketConnection>();
  private userConnections = new Map<string, Set<string>>(); // userId -> connectionIds
  private roomConnections = new Map<string, Set<string>>(); // roomId -> connectionIds
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.initializeRedisSubscriptions();
    this.startCleanupInterval();
  }

  async onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    await this.disconnectAllConnections();
  }

  private async initializeRedisSubscriptions() {
    try {
      // Subscribe to room-specific channels
      await this.redisService.psubscribe('room:*', this.handleRedisMessage.bind(this));
      
      // Subscribe to user-specific channels
      await this.redisService.psubscribe('user:*', this.handleRedisMessage.bind(this));
      
      // Subscribe to broadcast channel
      await this.redisService.subscribe('broadcast', this.handleRedisMessage.bind(this));
      
      this.logger.log('Redis subscriptions initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Redis subscriptions:', error);
    }
  }

  private async handleRedisMessage(message: RedisMessage) {
    try {
      const { channel, data } = message;
      
      if (channel === 'broadcast') {
        // Broadcast to all connections
        await this.broadcastToAll(data.message, data.excludeConnections);
      } else if (channel.startsWith('room:')) {
        // Room-specific message
        const roomId = channel.substring(5); // Remove 'room:' prefix
        await this.broadcastToRoom(roomId, data.message, data.excludeConnections);
      } else if (channel.startsWith('user:')) {
        // User-specific message
        const userId = channel.substring(5); // Remove 'user:' prefix
        await this.sendToUser(userId, data.message);
      }
    } catch (error) {
      this.logger.error('Error handling Redis message:', error);
    }
  }

  private startCleanupInterval() {
    const intervalMs = this.configService.get('WEBSOCKET_CLEANUP_INTERVAL', 60000); // 1 minute
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupInactiveConnections();
      } catch (error) {
        this.logger.error('Error during cleanup interval:', error);
      }
    }, intervalMs);
  }

  async handleConnection(socket: any): Promise<WebSocketConnection> {
    const connectionId = this.generateConnectionId();
    
    const connection: WebSocketConnection = {
      id: connectionId,
      socket,
      isAuthenticated: false,
      connectedAt: new Date(),
      lastActiveAt: new Date(),
    };

    this.connections.set(connectionId, connection);
    
    // Set up socket event handlers
    this.setupSocketHandlers(socket, connectionId);
    
    this.logger.debug(`New WebSocket connection: ${connectionId}`);
    
    return connection;
  }

  private setupSocketHandlers(socket: any, connectionId: string) {
    // Handle socket disconnect
    socket.on('disconnect', async () => {
      await this.handleDisconnection(connectionId);
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.lastActiveAt = new Date();
        socket.emit('pong');
      }
    });

    // Handle custom message types
    socket.on('message', async (data: any) => {
      await this.handleSocketMessage(connectionId, data);
    });
  }

  private async handleSocketMessage(connectionId: string, data: any) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    connection.lastActiveAt = new Date();

    try {
      // Handle different message types
      switch (data.type) {
        case 'authenticate':
          await this.authenticateConnection(connectionId, data.token);
          break;
        case 'join-room':
          await this.joinRoom(connectionId, data.roomId, data.participantId);
          break;
        case 'leave-room':
          await this.leaveRoom(connectionId, data.roomId);
          break;
        default:
          this.logger.warn(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      this.logger.error(`Error handling socket message from ${connectionId}:`, error);
      
      // Send error response
      await this.sendToConnection(connectionId, {
        type: 'error',
        data: { message: 'Failed to process message' },
        timestamp: new Date(),
        messageId: this.generateMessageId(),
      });
    }
  }

  async handleDisconnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    // Remove from user connections
    if (connection.userId) {
      const userConns = this.userConnections.get(connection.userId);
      if (userConns) {
        userConns.delete(connectionId);
        if (userConns.size === 0) {
          this.userConnections.delete(connection.userId);
        }
      }
    }

    // Remove from room connections
    if (connection.roomId) {
      const roomConns = this.roomConnections.get(connection.roomId);
      if (roomConns) {
        roomConns.delete(connectionId);
        if (roomConns.size === 0) {
          this.roomConnections.delete(connection.roomId);
        }
      }
    }

    // Remove connection
    this.connections.delete(connectionId);
    
    this.logger.debug(`WebSocket disconnected: ${connectionId}`);
  }

  async authenticateConnection(connectionId: string, token: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    try {
      // In a real implementation, you would validate the JWT token
      // For now, we'll extract user info from a mock token
      const userInfo = this.validateToken(token);
      
      connection.userId = userInfo.userId;
      connection.isAuthenticated = true;
      connection.lastActiveAt = new Date();

      // Add to user connections
      if (!this.userConnections.has(userInfo.userId)) {
        this.userConnections.set(userInfo.userId, new Set());
      }
      this.userConnections.get(userInfo.userId)!.add(connectionId);

      // Send authentication success
      await this.sendToConnection(connectionId, {
        type: 'authenticated',
        data: { userId: userInfo.userId },
        timestamp: new Date(),
        messageId: this.generateMessageId(),
      });

      this.logger.debug(`Connection authenticated: ${connectionId} for user ${userInfo.userId}`);
    } catch (error) {
      this.logger.error(`Authentication failed for connection ${connectionId}:`, error);
      
      await this.sendToConnection(connectionId, {
        type: 'authentication-failed',
        data: { message: 'Invalid token' },
        timestamp: new Date(),
        messageId: this.generateMessageId(),
      });
    }
  }

  private validateToken(token: string): { userId: string } {
    // Mock token validation - in production, use JWT service
    if (!token || token.length < 10) {
      throw new Error('Invalid token');
    }
    
    // Extract user ID from token (mock implementation)
    const userId = `user_${token.substring(0, 8)}`;
    return { userId };
  }

  async joinRoom(connectionId: string, roomId: string, participantId?: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    if (!connection.isAuthenticated) {
      throw new Error('Connection not authenticated');
    }

    // Leave current room if any
    if (connection.roomId) {
      await this.leaveRoom(connectionId, connection.roomId);
    }

    // Join new room
    connection.roomId = roomId;
    connection.participantId = participantId;
    connection.lastActiveAt = new Date();

    // Add to room connections
    if (!this.roomConnections.has(roomId)) {
      this.roomConnections.set(roomId, new Set());
    }
    this.roomConnections.get(roomId)!.add(connectionId);

    // Send join confirmation
    await this.sendToConnection(connectionId, {
      type: 'room-joined',
      roomId,
      data: { roomId, participantId },
      timestamp: new Date(),
      messageId: this.generateMessageId(),
    });

    // Notify other room members
    await this.broadcastToRoom(roomId, {
      type: 'user-joined-room',
      roomId,
      userId: connection.userId,
      data: { userId: connection.userId, participantId },
      timestamp: new Date(),
      messageId: this.generateMessageId(),
    }, [connectionId]);

    this.logger.debug(`Connection ${connectionId} joined room ${roomId}`);
  }

  async leaveRoom(connectionId: string, roomId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.roomId !== roomId) {
      return;
    }

    // Remove from room connections
    const roomConns = this.roomConnections.get(roomId);
    if (roomConns) {
      roomConns.delete(connectionId);
      if (roomConns.size === 0) {
        this.roomConnections.delete(roomId);
      }
    }

    const userId = connection.userId;
    const participantId = connection.participantId;

    // Update connection
    connection.roomId = undefined;
    connection.participantId = undefined;
    connection.lastActiveAt = new Date();

    // Send leave confirmation
    await this.sendToConnection(connectionId, {
      type: 'room-left',
      roomId,
      data: { roomId },
      timestamp: new Date(),
      messageId: this.generateMessageId(),
    });

    // Notify other room members
    await this.broadcastToRoom(roomId, {
      type: 'user-left-room',
      roomId,
      userId,
      data: { userId, participantId },
      timestamp: new Date(),
      messageId: this.generateMessageId(),
    });

    this.logger.debug(`Connection ${connectionId} left room ${roomId}`);
  }

  async sendToConnection(connectionId: string, message: WebSocketMessage): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.socket) {
      return;
    }

    try {
      connection.socket.emit('message', message);
      connection.lastActiveAt = new Date();
    } catch (error) {
      this.logger.error(`Failed to send message to connection ${connectionId}:`, error);
      // Connection might be dead, remove it
      await this.handleDisconnection(connectionId);
    }
  }

  async sendToUser(userId: string, message: WebSocketMessage): Promise<void> {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds || connectionIds.size === 0) {
      // User not connected locally, publish to Redis for other instances
      await this.publishToRedis(`user:${userId}`, { message });
      return;
    }

    const promises = Array.from(connectionIds).map(connectionId =>
      this.sendToConnection(connectionId, message)
    );

    await Promise.all(promises);
  }

  async broadcastToRoom(roomId: string, message: WebSocketMessage, excludeConnections: string[] = []): Promise<void> {
    const connectionIds = this.roomConnections.get(roomId);
    if (!connectionIds || connectionIds.size === 0) {
      // No local connections, publish to Redis for other instances
      await this.publishToRedis(`room:${roomId}`, { message, excludeConnections });
      return;
    }

    const excludeSet = new Set(excludeConnections);
    const promises = Array.from(connectionIds)
      .filter(connectionId => !excludeSet.has(connectionId))
      .map(connectionId => this.sendToConnection(connectionId, message));

    await Promise.all(promises);

    // Also publish to Redis for other instances
    await this.publishToRedis(`room:${roomId}`, { message, excludeConnections });
  }

  async broadcastToAll(message: WebSocketMessage, excludeConnections: string[] = []): Promise<void> {
    const excludeSet = new Set(excludeConnections);
    const promises = Array.from(this.connections.keys())
      .filter(connectionId => !excludeSet.has(connectionId))
      .map(connectionId => this.sendToConnection(connectionId, message));

    await Promise.all(promises);

    // Also publish to Redis for other instances
    await this.publishToRedis('broadcast', { message, excludeConnections });
  }

  async getConnection(connectionId: string): Promise<WebSocketConnection | null> {
    return this.connections.get(connectionId) || null;
  }

  async getUserConnections(userId: string): Promise<WebSocketConnection[]> {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) {
      return [];
    }

    const connections: WebSocketConnection[] = [];
    for (const connectionId of connectionIds) {
      const connection = this.connections.get(connectionId);
      if (connection) {
        connections.push(connection);
      }
    }

    return connections;
  }

  async getRoomConnections(roomId: string): Promise<WebSocketConnection[]> {
    const connectionIds = this.roomConnections.get(roomId);
    if (!connectionIds) {
      return [];
    }

    const connections: WebSocketConnection[] = [];
    for (const connectionId of connectionIds) {
      const connection = this.connections.get(connectionId);
      if (connection) {
        connections.push(connection);
      }
    }

    return connections;
  }

  async getConnectionStats(): Promise<ConnectionStats> {
    const totalConnections = this.connections.size;
    const authenticatedConnections = Array.from(this.connections.values())
      .filter(conn => conn.isAuthenticated).length;

    const roomConnections = new Map<string, number>();
    for (const [roomId, connectionIds] of this.roomConnections) {
      roomConnections.set(roomId, connectionIds.size);
    }

    // Calculate average connection duration
    const now = new Date().getTime();
    let totalDuration = 0;
    for (const connection of this.connections.values()) {
      totalDuration += now - connection.connectedAt.getTime();
    }
    const averageConnectionDuration = totalConnections > 0 
      ? totalDuration / totalConnections / 1000 // in seconds
      : 0;

    return {
      totalConnections,
      authenticatedConnections,
      roomConnections,
      averageConnectionDuration,
    };
  }

  async publishToRedis(channel: string, data: any): Promise<void> {
    try {
      await this.redisService.publish(channel, data);
    } catch (error) {
      this.logger.error(`Failed to publish to Redis channel ${channel}:`, error);
    }
  }

  async subscribeToRedis(channel: string, callback: (message: RedisMessage) => void): Promise<void> {
    await this.redisService.subscribe(channel, callback);
  }

  async unsubscribeFromRedis(channel: string): Promise<void> {
    await this.redisService.unsubscribe(channel);
  }

  async cleanupInactiveConnections(): Promise<number> {
    const now = new Date().getTime();
    const inactiveThreshold = this.configService.get('WEBSOCKET_INACTIVE_THRESHOLD', 300000); // 5 minutes
    let cleanedCount = 0;

    for (const [connectionId, connection] of this.connections) {
      const inactiveTime = now - connection.lastActiveAt.getTime();
      
      if (inactiveTime > inactiveThreshold) {
        await this.handleDisconnection(connectionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} inactive connections`);
    }

    return cleanedCount;
  }

  private async disconnectAllConnections(): Promise<void> {
    const connectionIds = Array.from(this.connections.keys());
    const promises = connectionIds.map(connectionId => this.handleDisconnection(connectionId));
    await Promise.all(promises);
    this.logger.log('All WebSocket connections disconnected');
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}