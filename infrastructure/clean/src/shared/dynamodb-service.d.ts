/**
 * DynamoDB Service - Consistent database operations for Trinity
 * Provides standardized DynamoDB operations with proper error handling
 */
export interface DynamoDBConfig {
    region?: string;
    endpoint?: string;
}
export declare class DynamoDBService {
    private client;
    constructor(config?: DynamoDBConfig);
    putItem(tableName: string, item: Record<string, any>): Promise<void>;
    getItem(tableName: string, key: Record<string, any>): Promise<Record<string, any> | null>;
    updateItem(tableName: string, key: Record<string, any>, updateExpression: string, expressionAttributeValues?: Record<string, any>, expressionAttributeNames?: Record<string, string>): Promise<Record<string, any> | null>;
    deleteItem(tableName: string, key: Record<string, any>): Promise<void>;
    query(tableName: string, keyConditionExpression: string, expressionAttributeValues: Record<string, any>, indexName?: string, filterExpression?: string, expressionAttributeNames?: Record<string, string>, limit?: number): Promise<Record<string, any>[]>;
    scan(tableName: string, filterExpression?: string, expressionAttributeValues?: Record<string, any>, expressionAttributeNames?: Record<string, string>, limit?: number): Promise<Record<string, any>[]>;
    batchWrite(tableName: string, items: Record<string, any>[]): Promise<void>;
    batchGet(tableName: string, keys: Record<string, any>[]): Promise<Record<string, any>[]>;
    /**
     * Utility method to create TTL timestamp (current time + days)
     */
    createTTL(days: number): number;
    /**
     * Utility method to check if TTL has expired
     */
    isTTLExpired(ttl: number): boolean;
}
