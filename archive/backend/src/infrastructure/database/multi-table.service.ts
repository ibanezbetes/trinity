import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';

export interface MultiTableConfig {
  usersTable: string;
  roomsTable: string;
  roomMembersTable: string;
  votesTable: string;
  moviesCacheTable: string;
}

@Injectable()
export class MultiTableService {
  private readonly logger = new Logger(MultiTableService.name);
  private readonly dynamodb: AWS.DynamoDB.DocumentClient;
  private readonly tables: MultiTableConfig;

  constructor(private configService: ConfigService) {
    // Siempre usar DynamoDB real de AWS
    AWS.config.update({
      region: this.configService.get('AWS_REGION', 'eu-west-1'),
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
    });
    this.dynamodb = new AWS.DynamoDB.DocumentClient();

    // Configuración de tablas desde variables de entorno
    this.tables = {
      usersTable: this.configService.get('USERS_TABLE', 'trinity-users-dev'),
      roomsTable: this.configService.get('ROOMS_TABLE', 'trinity-rooms-dev-v2'),
      roomMembersTable: this.configService.get(
        'ROOM_MEMBERS_TABLE',
        'trinity-room-members-dev',
      ),
      votesTable: this.configService.get('VOTES_TABLE', 'trinity-votes-dev'),
      moviesCacheTable: this.configService.get(
        'MOVIES_CACHE_TABLE',
        'trinity-movies-cache-dev',
      ),
    };
  }

  // ==================== USERS TABLE ====================

  async createUser(user: any): Promise<void> {
    try {
      await this.dynamodb
        .put({
          TableName: this.tables.usersTable,
          Item: {
            ...user,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        })
        .promise();

      this.logger.debug(`User created: ${user.userId}`);
    } catch (error) {
      this.logger.error(`Error creating user: ${error.message}`);
      throw error;
    }
  }

  async getUser(userId: string): Promise<any | null> {
    try {
      const result = await this.dynamodb
        .get({
          TableName: this.tables.usersTable,
          Key: { userId },
        })
        .promise();

      return result.Item || null;
    } catch (error) {
      this.logger.error(`Error getting user: ${error.message}`);
      throw error;
    }
  }

  // ==================== ROOMS TABLE ====================

  async createRoom(room: any): Promise<void> {
    try {
      await this.dynamodb
        .put({
          TableName: this.tables.roomsTable,
          Item: {
            ...room,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        })
        .promise();

      this.logger.debug(`Room created: ${room.roomId}`);
    } catch (error) {
      this.logger.error(`Error creating room: ${error.message}`);
      throw error;
    }
  }

  async getRoom(roomId: string): Promise<any | null> {
    try {
      const result = await this.dynamodb
        .get({
          TableName: this.tables.roomsTable,
          Key: { roomId },
        })
        .promise();

      return result.Item || null;
    } catch (error) {
      this.logger.error(`Error getting room: ${error.message}`);
      throw error;
    }
  }

  async updateRoomStatus(
    roomId: string,
    status: string,
    resultMovieId?: string,
  ): Promise<void> {
    try {
      const updateExpression = resultMovieId
        ? 'SET #status = :status, resultMovieId = :resultMovieId, updatedAt = :updatedAt'
        : 'SET #status = :status, updatedAt = :updatedAt';

      const expressionAttributeValues = resultMovieId
        ? {
            ':status': status,
            ':resultMovieId': resultMovieId,
            ':updatedAt': new Date().toISOString(),
          }
        : { ':status': status, ':updatedAt': new Date().toISOString() };

      await this.dynamodb
        .update({
          TableName: this.tables.roomsTable,
          Key: { roomId },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: expressionAttributeValues,
        })
        .promise();

      this.logger.debug(`Room status updated: ${roomId} -> ${status}`);
    } catch (error) {
      this.logger.error(`Error updating room status: ${error.message}`);
      throw error;
    }
  }

  // ==================== ROOM MEMBERS TABLE ====================

  async addRoomMember(
    roomId: string,
    userId: string,
    role: string = 'MEMBER',
  ): Promise<void> {
    try {
      await this.dynamodb
        .put({
          TableName: this.tables.roomMembersTable,
          Item: {
            roomId,
            userId,
            role,
            joinedAt: new Date().toISOString(),
            isActive: true,
          },
        })
        .promise();

      this.logger.debug(`Member added to room: ${userId} -> ${roomId}`);
    } catch (error) {
      this.logger.error(`Error adding room member: ${error.message}`);
      throw error;
    }
  }

  async getRoomMembers(roomId: string): Promise<any[]> {
    try {
      const result = await this.dynamodb
        .query({
          TableName: this.tables.roomMembersTable,
          KeyConditionExpression: 'roomId = :roomId',
          ExpressionAttributeValues: {
            ':roomId': roomId,
          },
        })
        .promise();

      return result.Items || [];
    } catch (error) {
      this.logger.error(`Error getting room members: ${error.message}`);
      throw error;
    }
  }

  async getUserHistory(userId: string): Promise<any[]> {
    try {
      const result = await this.dynamodb
        .query({
          TableName: this.tables.roomMembersTable,
          IndexName: 'UserHistoryIndex',
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':userId': userId,
          },
          ScanIndexForward: false, // Más recientes primero
        })
        .promise();

      return result.Items || [];
    } catch (error) {
      this.logger.error(`Error getting user history: ${error.message}`);
      throw error;
    }
  }

  // ==================== VOTES TABLE ====================

  async incrementVote(
    roomId: string,
    movieId: string,
    voteType: 'LIKE' | 'DISLIKE',
  ): Promise<any> {
    try {
      const updateExpression =
        voteType === 'LIKE'
          ? 'ADD likesCount :inc SET updatedAt = :updatedAt'
          : 'ADD dislikesCount :inc SET updatedAt = :updatedAt';

      const result = await this.dynamodb
        .update({
          TableName: this.tables.votesTable,
          Key: { roomId, movieId },
          UpdateExpression: updateExpression,
          ExpressionAttributeValues: {
            ':inc': 1,
            ':updatedAt': new Date().toISOString(),
          },
          ReturnValues: 'ALL_NEW',
        })
        .promise();

      this.logger.debug(
        `Vote incremented: ${roomId}/${movieId} -> ${voteType}`,
      );
      return result.Attributes;
    } catch (error) {
      this.logger.error(`Error incrementing vote: ${error.message}`);
      throw error;
    }
  }

  async getVote(roomId: string, movieId: string): Promise<any | null> {
    try {
      const result = await this.dynamodb
        .get({
          TableName: this.tables.votesTable,
          Key: { roomId, movieId },
        })
        .promise();

      return result.Item || null;
    } catch (error) {
      this.logger.error(`Error getting vote: ${error.message}`);
      throw error;
    }
  }

  async getRoomVotes(roomId: string): Promise<any[]> {
    try {
      const result = await this.dynamodb
        .query({
          TableName: this.tables.votesTable,
          KeyConditionExpression: 'roomId = :roomId',
          ExpressionAttributeValues: {
            ':roomId': roomId,
          },
        })
        .promise();

      return result.Items || [];
    } catch (error) {
      this.logger.error(`Error getting room votes: ${error.message}`);
      throw error;
    }
  }

  // ==================== MOVIES CACHE TABLE ====================

  async cacheMovie(movie: any): Promise<void> {
    try {
      const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 días

      await this.dynamodb
        .put({
          TableName: this.tables.moviesCacheTable,
          Item: {
            ...movie,
            cachedAt: new Date().toISOString(),
            ttl, // TTL automático de DynamoDB
          },
        })
        .promise();

      this.logger.debug(`Movie cached: ${movie.tmdbId}`);
    } catch (error) {
      this.logger.error(`Error caching movie: ${error.message}`);
      throw error;
    }
  }

  async getCachedMovie(tmdbId: string): Promise<any | null> {
    try {
      const result = await this.dynamodb
        .get({
          TableName: this.tables.moviesCacheTable,
          Key: { tmdbId },
        })
        .promise();

      return result.Item || null;
    } catch (error) {
      this.logger.error(`Error getting cached movie: ${error.message}`);
      throw error;
    }
  }

  async searchCachedMovies(filters: any): Promise<any[]> {
    try {
      // Para búsquedas complejas, usaremos Scan con filtros
      // En producción, consideraríamos GSI adicionales para optimizar
      const params: AWS.DynamoDB.DocumentClient.ScanInput = {
        TableName: this.tables.moviesCacheTable,
      };

      if (filters.genres && filters.genres.length > 0) {
        params.FilterExpression = 'contains(genres, :genre)';
        params.ExpressionAttributeValues = {
          ':genre': filters.genres[0], // Simplificado para el MVP
        };
      }

      const result = await this.dynamodb.scan(params).promise();
      return result.Items || [];
    } catch (error) {
      this.logger.error(`Error searching cached movies: ${error.message}`);
      throw error;
    }
  }

  // ==================== UTILIDADES ====================

  async putItem(tableName: string, item: any): Promise<void> {
    try {
      await this.dynamodb
        .put({
          TableName: tableName,
          Item: {
            ...item,
            updatedAt: new Date().toISOString(),
          },
        })
        .promise();

      this.logger.debug(`Item put in table: ${tableName}`);
    } catch (error) {
      this.logger.error(`Error putting item: ${error.message}`);
      throw error;
    }
  }

  async query(tableName: string, params: any): Promise<any[]> {
    try {
      const result = await this.dynamodb
        .query({
          TableName: tableName,
          ...params,
        })
        .promise();

      return result.Items || [];
    } catch (error) {
      this.logger.error(`Error querying table: ${error.message}`);
      throw error;
    }
  }

  async scan(tableName: string, params: any = {}): Promise<any[]> {
    try {
      const result = await this.dynamodb
        .scan({
          TableName: tableName,
          ...params,
        })
        .promise();

      return result.Items || [];
    } catch (error) {
      this.logger.error(`Error scanning table: ${error.message}`);
      throw error;
    }
  }

  async update(tableName: string, key: any, updateParams: any): Promise<any> {
    try {
      const result = await this.dynamodb
        .update({
          TableName: tableName,
          Key: key,
          ...updateParams,
          ExpressionAttributeValues: {
            ...updateParams.ExpressionAttributeValues,
            ':updatedAt': new Date().toISOString(),
          },
          UpdateExpression: updateParams.UpdateExpression + ', updatedAt = :updatedAt',
          ReturnValues: 'ALL_NEW',
        })
        .promise();

      this.logger.debug(`Item updated in table: ${tableName}`);
      return result.Attributes;
    } catch (error) {
      this.logger.error(`Error updating item: ${error.message}`);
      throw error;
    }
  }

  async create(tableName: string, item: any): Promise<void> {
    try {
      await this.dynamodb
        .put({
          TableName: tableName,
          Item: {
            ...item,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        })
        .promise();

      this.logger.debug(`Item created in table: ${tableName}`);
    } catch (error) {
      this.logger.error(`Error creating item: ${error.message}`);
      throw error;
    }
  }

  async deleteItem(tableName: string, key: any): Promise<void> {
    try {
      await this.dynamodb
        .delete({
          TableName: tableName,
          Key: key,
        })
        .promise();

      this.logger.debug(`Item deleted from table: ${tableName}`);
    } catch (error) {
      this.logger.error(`Error deleting item: ${error.message}`);
      throw error;
    }
  }

  async batchWriteItems(tableName: string, items: any[]): Promise<void> {
    return this.batchWrite(tableName, items);
  }

  async batchWrite(tableName: string, items: any[]): Promise<void> {
    if (items.length === 0) return;

    try {
      const chunks = this.chunkArray(items, 25); // Límite de DynamoDB

      for (const chunk of chunks) {
        const writeRequests = chunk.map((item) => ({
          PutRequest: { Item: item },
        }));

        await this.dynamodb
          .batchWrite({
            RequestItems: {
              [tableName]: writeRequests,
            },
          })
          .promise();
      }

      this.logger.debug(`Batch write completed: ${items.length} items`);
    } catch (error) {
      this.logger.error(`Error in batch write: ${error.message}`);
      throw error;
    }
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
