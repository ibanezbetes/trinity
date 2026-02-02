/**
 * DynamoDB utilities and base repository for Trinity Lambda functions
 * Provides consistent database access patterns and error handling
 */
import { TrinityConfig } from './types';
export interface QueryOptions {
    indexName?: string;
    limit?: number;
    exclusiveStartKey?: Record<string, any>;
    scanIndexForward?: boolean;
    filterExpression?: string;
    expressionAttributeNames?: Record<string, string>;
    expressionAttributeValues?: Record<string, any>;
}
export interface UpdateOptions {
    conditionExpression?: string;
    expressionAttributeNames?: Record<string, string>;
    expressionAttributeValues?: Record<string, any>;
    returnValues?: 'NONE' | 'ALL_OLD' | 'UPDATED_OLD' | 'ALL_NEW' | 'UPDATED_NEW';
}
export interface BatchWriteItem {
    tableName: string;
    operation: 'PUT' | 'DELETE';
    item?: Record<string, any>;
    key?: Record<string, any>;
}
export declare class TrinityDatabase {
    private client;
    private config;
    constructor(config: TrinityConfig);
    /**
     * Get a single item by key
     */
    get<T = any>(tableName: string, key: Record<string, any>, consistentRead?: boolean): Promise<T | null>;
    /**
     * Put an item (create or replace)
     */
    put<T extends Record<string, any>>(tableName: string, item: T, conditionExpression?: string, expressionAttributeNames?: Record<string, string>, expressionAttributeValues?: Record<string, any>): Promise<void>;
    /**
     * Update an item
     */
    update<T = any>(tableName: string, key: Record<string, any>, updateExpression: string, options?: UpdateOptions): Promise<T | null>;
    /**
     * Delete an item
     */
    delete(tableName: string, key: Record<string, any>, conditionExpression?: string, expressionAttributeNames?: Record<string, string>, expressionAttributeValues?: Record<string, any>): Promise<void>;
    /**
     * Query items
     */
    query<T = any>(tableName: string, keyConditionExpression: string, options?: QueryOptions): Promise<{
        items: T[];
        lastEvaluatedKey?: Record<string, any>;
        count: number;
    }>;
    /**
     * Scan items (use sparingly)
     */
    scan<T = any>(tableName: string, filterExpression?: string, expressionAttributeNames?: Record<string, string>, expressionAttributeValues?: Record<string, any>, limit?: number, exclusiveStartKey?: Record<string, any>): Promise<{
        items: T[];
        lastEvaluatedKey?: Record<string, any>;
        count: number;
    }>;
    /**
     * Batch get items
     */
    batchGet<T = any>(requests: Array<{
        tableName: string;
        keys: Record<string, any>[];
    }>): Promise<Record<string, T[]>>;
    /**
     * Batch write items
     */
    batchWrite(items: BatchWriteItem[]): Promise<void>;
    /**
     * Transaction write
     */
    transactWrite(items: Array<{
        operation: 'PUT' | 'UPDATE' | 'DELETE' | 'CONDITION_CHECK';
        tableName: string;
        item?: any;
        key?: Record<string, any>;
        updateExpression?: string;
        conditionExpression?: string;
        expressionAttributeNames?: Record<string, string>;
        expressionAttributeValues?: Record<string, any>;
    }>): Promise<void>;
    /**
     * Get table name from config
     */
    getTableName(tableKey: keyof TrinityConfig['tables']): string;
}
export declare function createDatabase(config: TrinityConfig): Promise<TrinityDatabase>;
