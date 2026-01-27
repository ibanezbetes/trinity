/**
 * DynamoDB Connection Store Service
 * Manages AppSync connection state in DynamoDB
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { IConnectionStore, AppSyncConnection } from './appsync.interface';

@Injectable()
export class ConnectionStoreService implements IConnectionStore {
  private readonly logger = new Logger(ConnectionStoreService.name);
  private readonly dynamoClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(private readonly configService: ConfigService) {
    const client = new DynamoDBClient({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
    });
    this.dynamoClient = DynamoDBDocumentClient.from(client);
    this.tableName = this.configService.get('APPSYNC_CONNECTIONS_TABLE', 'trinity-appsync-connections');
  }

  async storeConnection(connection: AppSyncConnection): Promise<void> {
    try {
      const item = {
        connectionId: connection.connectionId,
        id: connection.id,
        userId: connection.userId,
        roomId: connection.roomId,
        participantId: connection.participantId,
        isAuthenticated: connection.isAuthenticated,
        connectedAt: connection.connectedAt.toISOString(),
        lastActiveAt: connection.lastActiveAt.toISOString(),
        metadata: connection.metadata,
        // TTL for automatic cleanup (24 hours)
        ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
      };

      await this.dynamoClient.send(new PutCommand({
        TableName: this.tableName,
        Item: item,
      }));

      this.logger.debug(`Stored connection: ${connection.connectionId}`);
    } catch (error) {
      this.logger.error(`Failed to store connection ${connection.connectionId}:`, error);
      throw error;
    }
  }

  async removeConnection(connectionId: string): Promise<void> {
    try {
      await this.dynamoClient.send(new DeleteCommand({
        TableName: this.tableName,
        Key: { connectionId },
      }));

      this.logger.debug(`Removed connection: ${connectionId}`);
    } catch (error) {
      this.logger.error(`Failed to remove connection ${connectionId}:`, error);
      throw error;
    }
  }

  async getConnection(connectionId: string): Promise<AppSyncConnection | null> {
    try {
      const result = await this.dynamoClient.send(new GetCommand({
        TableName: this.tableName,
        Key: { connectionId },
      }));

      if (!result.Item) {
        return null;
      }

      return this.mapItemToConnection(result.Item);
    } catch (error) {
      this.logger.error(`Failed to get connection ${connectionId}:`, error);
      throw error;
    }
  }

  async getConnectionsByUser(userId: string): Promise<AppSyncConnection[]> {
    try {
      const result = await this.dynamoClient.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      }));

      return (result.Items || []).map(item => this.mapItemToConnection(item));
    } catch (error) {
      this.logger.error(`Failed to get connections for user ${userId}:`, error);
      throw error;
    }
  }

  async getConnectionsByRoom(roomId: string): Promise<AppSyncConnection[]> {
    try {
      const result = await this.dynamoClient.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'RoomIdIndex',
        KeyConditionExpression: 'roomId = :roomId',
        ExpressionAttributeValues: {
          ':roomId': roomId,
        },
      }));

      return (result.Items || []).map(item => this.mapItemToConnection(item));
    } catch (error) {
      this.logger.error(`Failed to get connections for room ${roomId}:`, error);
      throw error;
    }
  }

  async updateLastActive(connectionId: string): Promise<void> {
    try {
      await this.dynamoClient.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { connectionId },
        UpdateExpression: 'SET lastActiveAt = :lastActiveAt',
        ExpressionAttributeValues: {
          ':lastActiveAt': new Date().toISOString(),
        },
      }));

      this.logger.debug(`Updated last active for connection: ${connectionId}`);
    } catch (error) {
      this.logger.error(`Failed to update last active for connection ${connectionId}:`, error);
      throw error;
    }
  }

  async cleanupExpiredConnections(expirationTime: Date): Promise<number> {
    try {
      // Scan for expired connections
      const result = await this.dynamoClient.send(new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'lastActiveAt < :expirationTime',
        ExpressionAttributeValues: {
          ':expirationTime': expirationTime.toISOString(),
        },
      }));

      const expiredConnections = result.Items || [];
      let cleanedCount = 0;

      // Delete expired connections
      for (const item of expiredConnections) {
        try {
          await this.removeConnection(item.connectionId);
          cleanedCount++;
        } catch (error) {
          this.logger.error(`Failed to remove expired connection ${item.connectionId}:`, error);
        }
      }

      if (cleanedCount > 0) {
        this.logger.log(`Cleaned up ${cleanedCount} expired connections`);
      }

      return cleanedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup expired connections:', error);
      throw error;
    }
  }

  private mapItemToConnection(item: any): AppSyncConnection {
    return {
      id: item.id,
      userId: item.userId,
      roomId: item.roomId,
      participantId: item.participantId,
      connectionId: item.connectionId,
      isAuthenticated: item.isAuthenticated || false,
      connectedAt: new Date(item.connectedAt),
      lastActiveAt: new Date(item.lastActiveAt),
      metadata: item.metadata,
    };
  }
}