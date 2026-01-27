/**
 * AppSync Real-time Manager Service
 * Handles AppSync GraphQL subscriptions and real-time broadcasting
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IAppSyncManager,
  AppSyncConnection,
  AppSyncMessage,
  ConnectionEvent,
} from './appsync.interface';
import { ConnectionStoreService } from './connection-store.service';
import { AppSyncGraphQLService } from './appsync-graphql.service';
import { ConnectionResilienceService } from './connection-resilience.service';

@Injectable()
export class AppSyncService implements IAppSyncManager, OnModuleDestroy {
  private readonly logger = new Logger(AppSyncService.name);
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly connectionStore: ConnectionStoreService,
    private readonly graphqlService: AppSyncGraphQLService,
    private readonly resilienceService: ConnectionResilienceService,
    private readonly configService: ConfigService,
  ) {
    this.startCleanupInterval();
  }

  async onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  private startCleanupInterval() {
    const intervalMs = this.configService.get('APPSYNC_CLEANUP_INTERVAL', 300000); // 5 minutes
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupInactiveConnections();
      } catch (error) {
        this.logger.error('Error during cleanup interval:', error);
      }
    }, intervalMs);
  }

  async handleConnectionEvent(event: ConnectionEvent): Promise<void> {
    try {
      if (event.eventType === 'CONNECT') {
        await this.handleConnect(event);
      } else if (event.eventType === 'DISCONNECT') {
        await this.handleDisconnect(event);
      }
    } catch (error) {
      this.logger.error(`Failed to handle connection event:`, error);
    }
  }

  private async handleConnect(event: ConnectionEvent): Promise<void> {
    const connection: AppSyncConnection = {
      id: this.generateConnectionId(),
      connectionId: event.connectionId,
      userId: event.userId,
      roomId: event.roomId,
      isAuthenticated: !!event.userId,
      connectedAt: new Date(event.timestamp),
      lastActiveAt: new Date(event.timestamp),
    };

    await this.connectionStore.storeConnection(connection);
    
    // Initialize connection resilience monitoring
    await this.resilienceService.initializeConnectionHealth(connection);
    
    this.logger.debug(`AppSync connection established: ${event.connectionId}`);

    // Send welcome message if user is authenticated
    if (event.userId) {
      await this.publishUserMessage(event.userId, {
        type: 'connection-established',
        userId: event.userId,
        data: { connectionId: event.connectionId },
        timestamp: new Date().toISOString(),
        messageId: this.generateMessageId(),
      });
    }
  }

  private async handleDisconnect(event: ConnectionEvent): Promise<void> {
    const connection = await this.connectionStore.getConnection(event.connectionId);
    
    if (connection) {
      // Notify room if user was in a room
      if (connection.roomId && connection.userId) {
        await this.publishRoomMessage(connection.roomId, {
          type: 'user-disconnected',
          roomId: connection.roomId,
          userId: connection.userId,
          data: { userId: connection.userId, participantId: connection.participantId },
          timestamp: new Date().toISOString(),
          messageId: this.generateMessageId(),
        }, [connection.userId]);
      }

      // Clean up resilience resources
      await this.resilienceService.cleanupConnection(event.connectionId);
      
      await this.connectionStore.removeConnection(event.connectionId);
    }

    this.logger.debug(`AppSync connection closed: ${event.connectionId}`);
  }

  async publishRoomMessage(roomId: string, message: AppSyncMessage, excludeUsers: string[] = []): Promise<void> {
    try {
      const mutation = `
        mutation PublishRoomMessage($input: RoomMessageInput!) {
          publishRoomMessage(input: $input) {
            roomId
            message {
              type
              data
              timestamp
              messageId
            }
          }
        }
      `;

      const variables = {
        input: {
          roomId,
          message: {
            type: message.type,
            roomId: message.roomId,
            userId: message.userId,
            participantId: message.participantId,
            data: JSON.stringify(message.data),
            timestamp: message.timestamp,
            messageId: message.messageId,
          },
          excludeUsers,
        },
      };

      await this.graphqlService.executeMutation(mutation, variables);
      
      this.logger.debug(`Published room message to ${roomId}: ${message.type}`);
    } catch (error) {
      this.logger.error(`Failed to publish room message to ${roomId}:`, error);
      
      // Handle connection failures for affected users
      await this.handlePublishFailure(roomId, error);
      
      throw error;
    }
  }

  async publishVotingUpdate(sessionId: string, roomId: string, message: AppSyncMessage): Promise<void> {
    try {
      const mutation = `
        mutation PublishVotingUpdate($input: VotingUpdateInput!) {
          publishVotingUpdate(input: $input) {
            sessionId
            roomId
            message {
              type
              data
              timestamp
              messageId
            }
          }
        }
      `;

      const variables = {
        input: {
          sessionId,
          roomId,
          message: {
            type: message.type,
            roomId: message.roomId,
            userId: message.userId,
            participantId: message.participantId,
            data: JSON.stringify(message.data),
            timestamp: message.timestamp,
            messageId: message.messageId,
          },
        },
      };

      await this.graphqlService.executeMutation(mutation, variables);
      
      this.logger.debug(`Published voting update for session ${sessionId}: ${message.type}`);
    } catch (error) {
      this.logger.error(`Failed to publish voting update for session ${sessionId}:`, error);
      throw error;
    }
  }

  async publishUserMessage(userId: string, message: AppSyncMessage): Promise<void> {
    try {
      const mutation = `
        mutation PublishUserMessage($input: UserMessageInput!) {
          publishUserMessage(input: $input) {
            userId
            message {
              type
              data
              timestamp
              messageId
            }
          }
        }
      `;

      const variables = {
        input: {
          userId,
          message: {
            type: message.type,
            roomId: message.roomId,
            userId: message.userId,
            participantId: message.participantId,
            data: JSON.stringify(message.data),
            timestamp: message.timestamp,
            messageId: message.messageId,
          },
        },
      };

      await this.graphqlService.executeMutation(mutation, variables);
      
      this.logger.debug(`Published user message to ${userId}: ${message.type}`);
    } catch (error) {
      this.logger.error(`Failed to publish user message to ${userId}:`, error);
      
      // Handle connection failures for the user
      await this.handleUserMessageFailure(userId, error);
      
      throw error;
    }
  }

  async broadcastToAll(message: AppSyncMessage, excludeUsers: string[] = []): Promise<void> {
    try {
      const mutation = `
        mutation BroadcastMessage($input: BroadcastMessageInput!) {
          broadcastMessage(input: $input) {
            message {
              type
              data
              timestamp
              messageId
            }
            excludeUsers
          }
        }
      `;

      const variables = {
        input: {
          message: {
            type: message.type,
            roomId: message.roomId,
            userId: message.userId,
            participantId: message.participantId,
            data: JSON.stringify(message.data),
            timestamp: message.timestamp,
            messageId: message.messageId,
          },
          excludeUsers,
        },
      };

      await this.graphqlService.executeMutation(mutation, variables);
      
      this.logger.debug(`Broadcasted message to all: ${message.type}`);
    } catch (error) {
      this.logger.error('Failed to broadcast message to all:', error);
      throw error;
    }
  }

  async getRoomConnections(roomId: string): Promise<AppSyncConnection[]> {
    try {
      return await this.connectionStore.getConnectionsByRoom(roomId);
    } catch (error) {
      this.logger.error(`Failed to get room connections for ${roomId}:`, error);
      throw error;
    }
  }

  async getUserConnections(userId: string): Promise<AppSyncConnection[]> {
    try {
      return await this.connectionStore.getConnectionsByUser(userId);
    } catch (error) {
      this.logger.error(`Failed to get user connections for ${userId}:`, error);
      throw error;
    }
  }

  async getConnectionStats(): Promise<{
    totalConnections: number;
    authenticatedConnections: number;
    roomConnections: Map<string, number>;
  }> {
    try {
      // In a real implementation, you might want to cache these stats
      // or use DynamoDB aggregation queries for better performance
      
      // For now, we'll return basic stats
      // In production, consider using CloudWatch metrics or cached aggregates
      
      return {
        totalConnections: 0, // Would need to scan/count all connections
        authenticatedConnections: 0, // Would need to scan/count authenticated connections
        roomConnections: new Map(), // Would need to aggregate by room
      };
    } catch (error) {
      this.logger.error('Failed to get connection stats:', error);
      throw error;
    }
  }

  async cleanupInactiveConnections(): Promise<number> {
    try {
      const inactiveThreshold = this.configService.get('APPSYNC_INACTIVE_THRESHOLD', 1800000); // 30 minutes
      const expirationTime = new Date(Date.now() - inactiveThreshold);
      
      return await this.connectionStore.cleanupExpiredConnections(expirationTime);
    } catch (error) {
      this.logger.error('Failed to cleanup inactive connections:', error);
      throw error;
    }
  }

  // Helper methods for integration with other services

  async notifyRoomJoin(roomId: string, userId: string, participantId?: string): Promise<void> {
    await this.publishRoomMessage(roomId, {
      type: 'user-joined-room',
      roomId,
      userId,
      participantId,
      data: { userId, participantId },
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId(),
    }, [userId]);
  }

  async notifyRoomLeave(roomId: string, userId: string, participantId?: string): Promise<void> {
    await this.publishRoomMessage(roomId, {
      type: 'user-left-room',
      roomId,
      userId,
      participantId,
      data: { userId, participantId },
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId(),
    });
  }

  async notifyVoteCast(sessionId: string, roomId: string, userId: string, participantId: string, optionIds: string[]): Promise<void> {
    await this.publishVotingUpdate(sessionId, roomId, {
      type: 'vote-cast',
      roomId,
      userId,
      participantId,
      data: { sessionId, optionIds, participantId },
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId(),
    });
  }

  async notifyVotingSessionUpdate(sessionId: string, roomId: string, updateType: string, data: any): Promise<void> {
    await this.publishVotingUpdate(sessionId, roomId, {
      type: `voting-session-${updateType}`,
      roomId,
      data: { sessionId, ...data },
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId(),
    });
  }

  async notifyRoomUpdate(roomId: string, updateType: string, data: any): Promise<void> {
    await this.publishRoomMessage(roomId, {
      type: `room-${updateType}`,
      roomId,
      data: { roomId, ...data },
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId(),
    });
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Resilience and recovery methods

  async handleConnectionFailure(connectionId: string, error: Error): Promise<void> {
    await this.resilienceService.handleConnectionFailure(connectionId, error);
  }

  async handleReconnection(oldConnectionId: string, newConnection: AppSyncConnection): Promise<void> {
    await this.resilienceService.handleReconnectionSuccess(oldConnectionId, newConnection);
  }

  async updateConnectionHealth(connectionId: string, isHealthy: boolean): Promise<void> {
    await this.resilienceService.updateConnectionHealth(connectionId, isHealthy);
  }

  async enablePollingFallback(connectionId: string): Promise<void> {
    await this.resilienceService.enablePollingFallback(connectionId);
  }

  async disablePollingFallback(connectionId: string): Promise<void> {
    await this.resilienceService.disablePollingFallback(connectionId);
  }

  getResilienceStats(): any {
    return this.resilienceService.getResilienceStats();
  }

  private async handlePublishFailure(roomId: string, error: Error): Promise<void> {
    // Get all connections for the room
    const connections = await this.getRoomConnections(roomId);
    
    // Mark connections as potentially unhealthy
    for (const connection of connections) {
      await this.resilienceService.handleConnectionFailure(connection.connectionId, error);
    }
  }

  private async handleUserMessageFailure(userId: string, error: Error): Promise<void> {
    // Get all connections for the user
    const connections = await this.getUserConnections(userId);
    
    // Mark connections as potentially unhealthy
    for (const connection of connections) {
      await this.resilienceService.handleConnectionFailure(connection.connectionId, error);
    }
  }
}