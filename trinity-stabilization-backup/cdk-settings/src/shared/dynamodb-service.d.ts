/**
 * DynamoDB Service - Extracted from MONOLITH files
 *
 * Provides consistent database operations for Trinity business logic
 *
 * Requirements: 1.4, 3.1, 3.5
 */
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
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
export declare class DynamoDBService {
    private readonly client;
    private readonly docClient;
    private readonly tableNames;
    constructor(config?: DynamoDBConfig);
    /**
     * Gets the document client for direct access
     */
    getDocClient(): DynamoDBDocumentClient;
    /**
     * Gets table names configuration
     */
    getTableNames(): TableNames;
    /**
     * Puts an item into a table
     */
    putItem(tableName: keyof TableNames, item: Record<string, any>): Promise<void>;
    /**
     * Gets an item from a table
     */
    getItem(tableName: keyof TableNames, key: Record<string, any>): Promise<Record<string, any> | null>;
    /**
     * Updates an item in a table
     */
    updateItem(tableName: keyof TableNames, key: Record<string, any>, updateExpression: string, expressionAttributeValues: Record<string, any>, expressionAttributeNames?: Record<string, string>): Promise<Record<string, any> | null>;
    /**
     * Queries items from a table
     */
    queryItems(tableName: keyof TableNames, keyConditionExpression: string, expressionAttributeValues: Record<string, any>, expressionAttributeNames?: Record<string, string>, indexName?: string, limit?: number): Promise<Record<string, any>[]>;
    /**
     * Scans items from a table
     */
    scanItems(tableName: keyof TableNames, filterExpression?: string, expressionAttributeValues?: Record<string, any>, expressionAttributeNames?: Record<string, string>, limit?: number): Promise<Record<string, any>[]>;
    /**
     * Deletes an item from a table
     */
    deleteItem(tableName: keyof TableNames, key: Record<string, any>): Promise<void>;
    /**
     * Batch writes items to a table
     */
    batchWriteItems(tableName: keyof TableNames, items: Record<string, any>[]): Promise<void>;
    /**
     * Batch gets items from a table
     */
    batchGetItems(tableName: keyof TableNames, keys: Record<string, any>[]): Promise<Record<string, any>[]>;
    /**
     * Stores room movie cache with TTL
     */
    storeRoomMovieCache(roomId: string, movies: any[], ttlDays?: number): Promise<void>;
    /**
     * Retrieves room movie cache
     */
    getRoomMovieCache(roomId: string): Promise<any[]>;
    /**
     * Clears room movie cache
     */
    clearRoomMovieCache(roomId: string): Promise<void>;
}
