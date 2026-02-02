/**
 * DynamoDB Service - Extracted from MONOLITH files
 * 
 * Provides consistent database operations for Trinity business logic
 * 
 * Requirements: 1.4, 3.1, 3.5
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  UpdateCommand, 
  QueryCommand,
  ScanCommand,
  DeleteCommand,
  BatchWriteCommand,
  BatchGetCommand
} from '@aws-sdk/lib-dynamodb';

export interface DynamoDBConfig {
  region?: string;
  endpoint?: string;
}

export interface TableNames {
  rooms: string;
  roomMembers: string;
  votes: string;
  moviesCache: string;
  roomMatches: string;
  roomInvites: string;
  connections: string;
  roomMovieCache: string;
  roomCacheMetadata: string;
  matchmaking: string;
  filterCache: string;
  users: string;
}

export class DynamoDBService {
  private readonly client: DynamoDBClient;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableNames: TableNames;

  constructor(config: DynamoDBConfig = {}) {
    this.client = new DynamoDBClient({
      region: config.region || process.env.AWS_REGION || 'eu-west-1',
      ...(config.endpoint && { endpoint: config.endpoint })
    });
    
    this.docClient = DynamoDBDocumentClient.from(this.client);
    
    // Initialize table names from environment variables
    this.tableNames = {
      rooms: process.env.ROOMS_TABLE || 'trinity-rooms-dev-v2',
      roomMembers: process.env.ROOM_MEMBERS_TABLE || 'trinity-room-members-dev',
      votes: process.env.VOTES_TABLE || 'trinity-votes-dev',
      moviesCache: process.env.MOVIES_CACHE_TABLE || 'trinity-movies-cache-dev',
      roomMatches: process.env.ROOM_MATCHES_TABLE || 'trinity-room-matches-dev',
      roomInvites: process.env.ROOM_INVITES_TABLE || 'trinity-room-invites-dev-v2',
      connections: process.env.CONNECTIONS_TABLE || 'trinity-connections-dev',
      roomMovieCache: process.env.ROOM_MOVIE_CACHE_TABLE || 'trinity-room-movie-cache-dev',
      roomCacheMetadata: process.env.ROOM_CACHE_METADATA_TABLE || 'trinity-room-cache-metadata-dev',
      matchmaking: process.env.MATCHMAKING_TABLE || 'trinity-matchmaking-dev',
      filterCache: process.env.FILTER_CACHE_TABLE || 'trinity-filter-cache',
      users: process.env.USERS_TABLE || 'trinity-users-dev'
    };

    console.log('🗄️ DynamoDBService initialized with table names:', this.tableNames);
  }

  /**
   * Gets the document client for direct access
   */
  getDocClient(): DynamoDBDocumentClient {
    return this.docClient;
  }

  /**
   * Gets table names configuration
   */
  getTableNames(): TableNames {
    return { ...this.tableNames };
  }

  /**
   * Puts an item into a table
   */
  async putItem(tableName: keyof TableNames, item: Record<string, any>): Promise<void> {
    const table = this.tableNames[tableName];
    console.log(`📝 DynamoDB PUT: ${table}`, { itemId: item.id || item.PK || 'unknown' });
    
    try {
      await this.docClient.send(new PutCommand({
        TableName: table,
        Item: item
      }));
      
      console.log(`✅ DynamoDB PUT SUCCESS: ${table}`);
    } catch (error) {
      console.error(`❌ DynamoDB PUT ERROR: ${table}`, error);
      throw error;
    }
  }

  /**
   * Gets an item from a table
   */
  async getItem(tableName: keyof TableNames, key: Record<string, any>): Promise<Record<string, any> | null> {
    const table = this.tableNames[tableName];
    console.log(`🔍 DynamoDB GET: ${table}`, key);
    
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: table,
        Key: key
      }));
      
      if (result.Item) {
        console.log(`✅ DynamoDB GET SUCCESS: ${table} - Item found`);
        return result.Item;
      } else {
        console.log(`⚠️ DynamoDB GET: ${table} - Item not found`);
        return null;
      }
    } catch (error) {
      console.error(`❌ DynamoDB GET ERROR: ${table}`, error);
      throw error;
    }
  }

  /**
   * Updates an item in a table
   */
  async updateItem(
    tableName: keyof TableNames, 
    key: Record<string, any>, 
    updateExpression: string,
    expressionAttributeValues: Record<string, any>,
    expressionAttributeNames?: Record<string, string>
  ): Promise<Record<string, any> | null> {
    const table = this.tableNames[tableName];
    console.log(`🔄 DynamoDB UPDATE: ${table}`, key);
    
    try {
      const result = await this.docClient.send(new UpdateCommand({
        TableName: table,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
        ReturnValues: 'ALL_NEW'
      }));
      
      console.log(`✅ DynamoDB UPDATE SUCCESS: ${table}`);
      return result.Attributes || null;
    } catch (error) {
      console.error(`❌ DynamoDB UPDATE ERROR: ${table}`, error);
      throw error;
    }
  }

  /**
   * Queries items from a table
   */
  async queryItems(
    tableName: keyof TableNames,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, any>,
    expressionAttributeNames?: Record<string, string>,
    indexName?: string,
    limit?: number
  ): Promise<Record<string, any>[]> {
    const table = this.tableNames[tableName];
    console.log(`🔍 DynamoDB QUERY: ${table}`, { indexName, limit });
    
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: table,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
        ...(indexName && { IndexName: indexName }),
        ...(limit && { Limit: limit })
      }));
      
      const items = result.Items || [];
      console.log(`✅ DynamoDB QUERY SUCCESS: ${table} - ${items.length} items found`);
      return items;
    } catch (error) {
      console.error(`❌ DynamoDB QUERY ERROR: ${table}`, error);
      throw error;
    }
  }

  /**
   * Scans items from a table
   */
  async scanItems(
    tableName: keyof TableNames,
    filterExpression?: string,
    expressionAttributeValues?: Record<string, any>,
    expressionAttributeNames?: Record<string, string>,
    limit?: number
  ): Promise<Record<string, any>[]> {
    const table = this.tableNames[tableName];
    console.log(`🔍 DynamoDB SCAN: ${table}`, { limit });
    
    try {
      const result = await this.docClient.send(new ScanCommand({
        TableName: table,
        ...(filterExpression && { FilterExpression: filterExpression }),
        ...(expressionAttributeValues && { ExpressionAttributeValues: expressionAttributeValues }),
        ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
        ...(limit && { Limit: limit })
      }));
      
      const items = result.Items || [];
      console.log(`✅ DynamoDB SCAN SUCCESS: ${table} - ${items.length} items found`);
      return items;
    } catch (error) {
      console.error(`❌ DynamoDB SCAN ERROR: ${table}`, error);
      throw error;
    }
  }

  /**
   * Deletes an item from a table
   */
  async deleteItem(tableName: keyof TableNames, key: Record<string, any>): Promise<void> {
    const table = this.tableNames[tableName];
    console.log(`🗑️ DynamoDB DELETE: ${table}`, key);
    
    try {
      await this.docClient.send(new DeleteCommand({
        TableName: table,
        Key: key
      }));
      
      console.log(`✅ DynamoDB DELETE SUCCESS: ${table}`);
    } catch (error) {
      console.error(`❌ DynamoDB DELETE ERROR: ${table}`, error);
      throw error;
    }
  }

  /**
   * Batch writes items to a table
   */
  async batchWriteItems(tableName: keyof TableNames, items: Record<string, any>[]): Promise<void> {
    const table = this.tableNames[tableName];
    console.log(`📝 DynamoDB BATCH WRITE: ${table} - ${items.length} items`);
    
    // DynamoDB batch write limit is 25 items
    const batchSize = 25;
    const batches = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    try {
      for (const batch of batches) {
        const requestItems = {
          [table]: batch.map(item => ({
            PutRequest: {
              Item: item
            }
          }))
        };
        
        await this.docClient.send(new BatchWriteCommand({
          RequestItems: requestItems
        }));
      }
      
      console.log(`✅ DynamoDB BATCH WRITE SUCCESS: ${table} - ${items.length} items written`);
    } catch (error) {
      console.error(`❌ DynamoDB BATCH WRITE ERROR: ${table}`, error);
      throw error;
    }
  }

  /**
   * Batch gets items from a table
   */
  async batchGetItems(tableName: keyof TableNames, keys: Record<string, any>[]): Promise<Record<string, any>[]> {
    const table = this.tableNames[tableName];
    console.log(`🔍 DynamoDB BATCH GET: ${table} - ${keys.length} keys`);
    
    // DynamoDB batch get limit is 100 items
    const batchSize = 100;
    const batches = [];
    
    for (let i = 0; i < keys.length; i += batchSize) {
      batches.push(keys.slice(i, i + batchSize));
    }
    
    const allItems: Record<string, any>[] = [];
    
    try {
      for (const batch of batches) {
        const requestItems = {
          [table]: {
            Keys: batch
          }
        };
        
        const result = await this.docClient.send(new BatchGetCommand({
          RequestItems: requestItems
        }));
        
        if (result.Responses && result.Responses[table]) {
          allItems.push(...result.Responses[table]);
        }
      }
      
      console.log(`✅ DynamoDB BATCH GET SUCCESS: ${table} - ${allItems.length} items retrieved`);
      return allItems;
    } catch (error) {
      console.error(`❌ DynamoDB BATCH GET ERROR: ${table}`, error);
      throw error;
    }
  }

  /**
   * Stores room movie cache with TTL
   */
  async storeRoomMovieCache(roomId: string, movies: any[], ttlDays: number = 7): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + (ttlDays * 24 * 60 * 60);
    const now = new Date().toISOString();
    
    console.log(`🎬 Storing room movie cache for ${roomId} - ${movies.length} movies, TTL: ${ttlDays} days`);
    
    const cacheItems = movies.map((movie, index) => ({
      PK: roomId,
      SK: `MOVIE#${index.toString().padStart(3, '0')}`,
      roomId,
      movieIndex: index,
      movieData: movie,
      ttl,
      createdAt: now
    }));
    
    await this.batchWriteItems('roomMovieCache', cacheItems);
    
    // Store metadata
    await this.putItem('roomCacheMetadata', {
      PK: roomId,
      SK: 'METADATA',
      roomId,
      totalMovies: movies.length,
      ttl,
      createdAt: now,
      lastAccessed: now
    });
    
    console.log(`✅ Room movie cache stored for ${roomId}`);
  }

  /**
   * Retrieves room movie cache
   */
  async getRoomMovieCache(roomId: string): Promise<any[]> {
    console.log(`🔍 Retrieving room movie cache for ${roomId}`);
    
    try {
      const items = await this.queryItems(
        'roomMovieCache',
        'PK = :roomId AND begins_with(SK, :moviePrefix)',
        {
          ':roomId': roomId,
          ':moviePrefix': 'MOVIE#'
        }
      );
      
      // Sort by movie index and extract movie data
      const movies = items
        .sort((a, b) => a.movieIndex - b.movieIndex)
        .map(item => item.movieData);
      
      console.log(`✅ Retrieved ${movies.length} movies from cache for room ${roomId}`);
      return movies;
    } catch (error) {
      console.error(`❌ Error retrieving room movie cache for ${roomId}:`, error);
      return [];
    }
  }

  /**
   * Clears room movie cache
   */
  async clearRoomMovieCache(roomId: string): Promise<void> {
    console.log(`🗑️ Clearing room movie cache for ${roomId}`);
    
    try {
      const items = await this.queryItems(
        'roomMovieCache',
        'PK = :roomId',
        { ':roomId': roomId }
      );
      
      for (const item of items) {
        await this.deleteItem('roomMovieCache', {
          PK: item.PK,
          SK: item.SK
        });
      }
      
      // Clear metadata
      await this.deleteItem('roomCacheMetadata', {
        PK: roomId,
        SK: 'METADATA'
      });
      
      console.log(`✅ Cleared room movie cache for ${roomId}`);
    } catch (error) {
      console.error(`❌ Error clearing room movie cache for ${roomId}:`, error);
      throw error;
    }
  }
}