/**
 * DynamoDB utilities and base repository for Trinity Lambda functions
 * Provides consistent database access patterns and error handling
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  UpdateCommand, 
  DeleteCommand, 
  QueryCommand, 
  ScanCommand,
  BatchGetCommand,
  BatchWriteCommand,
  TransactWriteCommand,
  TransactGetCommand,
} from '@aws-sdk/lib-dynamodb';
import { TrinityConfig, TrinityError, NotFoundError } from './types';
import { logger, LogUtils } from './logger';

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

export class TrinityDatabase {
  private client: DynamoDBDocumentClient;
  private config: TrinityConfig;

  constructor(config: TrinityConfig) {
    this.config = config;
    
    const dynamoClient = new DynamoDBClient({
      region: config.region,
      maxAttempts: 3,
    });
    
    this.client = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        convertEmptyValues: false,
        removeUndefinedValues: true,
        convertClassInstanceToMap: false,
      },
      unmarshallOptions: {
        wrapNumbers: false,
      },
    });
  }

  /**
   * Get a single item by key
   */
  async get<T = any>(
    tableName: string, 
    key: Record<string, any>,
    consistentRead: boolean = false
  ): Promise<T | null> {
    try {
      LogUtils.logDatabaseOperation('GET', tableName, key);
      
      const command = new GetCommand({
        TableName: tableName,
        Key: key,
        ConsistentRead: consistentRead,
      });

      const response = await this.client.send(command);
      
      if (!response.Item) {
        logger.debug('🔍 Item not found', { tableName, key });
        return null;
      }

      logger.debug('✅ Item retrieved successfully', { tableName, key });
      return response.Item as T;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`❌ Failed to get item from ${tableName}`, err, { key });
      throw new TrinityError(`Failed to get item from ${tableName}`, 'DATABASE_ERROR', 500, { key });
    }
  }

  /**
   * Put an item (create or replace)
   */
  async put<T extends Record<string, any>>(
    tableName: string, 
    item: T,
    conditionExpression?: string,
    expressionAttributeNames?: Record<string, string>,
    expressionAttributeValues?: Record<string, any>
  ): Promise<void> {
    try {
      LogUtils.logDatabaseOperation('PUT', tableName, item);
      
      const command = new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: conditionExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      });

      await this.client.send(command);
      logger.debug('✅ Item put successfully', { tableName });

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`❌ Failed to put item to ${tableName}`, err, { item });
      
      if (err.name === 'ConditionalCheckFailedException') {
        throw new TrinityError('Condition check failed', 'CONDITION_FAILED', 409, { item });
      }
      
      throw new TrinityError(`Failed to put item to ${tableName}`, 'DATABASE_ERROR', 500, { item });
    }
  }

  /**
   * Update an item
   */
  async update<T = any>(
    tableName: string,
    key: Record<string, any>,
    updateExpression: string,
    options: UpdateOptions = {}
  ): Promise<T | null> {
    try {
      LogUtils.logDatabaseOperation('UPDATE', tableName, key);
      
      const command = new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: updateExpression,
        ConditionExpression: options.conditionExpression,
        ExpressionAttributeNames: options.expressionAttributeNames,
        ExpressionAttributeValues: options.expressionAttributeValues,
        ReturnValues: options.returnValues || 'ALL_NEW',
      });

      const response = await this.client.send(command);
      logger.debug('✅ Item updated successfully', { tableName, key });
      
      return response.Attributes as T || null;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`❌ Failed to update item in ${tableName}`, err, { key });
      
      if (err.name === 'ConditionalCheckFailedException') {
        throw new TrinityError('Condition check failed', 'CONDITION_FAILED', 409, { key });
      }
      
      throw new TrinityError(`Failed to update item in ${tableName}`, 'DATABASE_ERROR', 500, { key });
    }
  }

  /**
   * Delete an item
   */
  async delete(
    tableName: string,
    key: Record<string, any>,
    conditionExpression?: string,
    expressionAttributeNames?: Record<string, string>,
    expressionAttributeValues?: Record<string, any>
  ): Promise<void> {
    try {
      LogUtils.logDatabaseOperation('DELETE', tableName, key);
      
      const command = new DeleteCommand({
        TableName: tableName,
        Key: key,
        ConditionExpression: conditionExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      });

      await this.client.send(command);
      logger.debug('✅ Item deleted successfully', { tableName, key });

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`❌ Failed to delete item from ${tableName}`, err, { key });
      
      if (err.name === 'ConditionalCheckFailedException') {
        throw new TrinityError('Condition check failed', 'CONDITION_FAILED', 409, { key });
      }
      
      throw new TrinityError(`Failed to delete item from ${tableName}`, 'DATABASE_ERROR', 500, { key });
    }
  }

  /**
   * Query items
   */
  async query<T = any>(
    tableName: string,
    keyConditionExpression: string,
    options: QueryOptions = {}
  ): Promise<{ items: T[]; lastEvaluatedKey?: Record<string, any>; count: number }> {
    try {
      LogUtils.logDatabaseOperation('QUERY', tableName, { keyConditionExpression });
      
      const command = new QueryCommand({
        TableName: tableName,
        IndexName: options.indexName,
        KeyConditionExpression: keyConditionExpression,
        FilterExpression: options.filterExpression,
        ExpressionAttributeNames: options.expressionAttributeNames,
        ExpressionAttributeValues: options.expressionAttributeValues,
        Limit: options.limit,
        ExclusiveStartKey: options.exclusiveStartKey,
        ScanIndexForward: options.scanIndexForward,
      });

      const response = await this.client.send(command);
      
      logger.debug('✅ Query completed successfully', { 
        tableName, 
        count: response.Count,
        scannedCount: response.ScannedCount 
      });

      return {
        items: (response.Items || []) as T[],
        lastEvaluatedKey: response.LastEvaluatedKey,
        count: response.Count || 0,
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`❌ Failed to query ${tableName}`, err, { keyConditionExpression });
      throw new TrinityError(`Failed to query ${tableName}`, 'DATABASE_ERROR', 500, { keyConditionExpression });
    }
  }

  /**
   * Scan items (use sparingly)
   */
  async scan<T = any>(
    tableName: string,
    filterExpression?: string,
    expressionAttributeNames?: Record<string, string>,
    expressionAttributeValues?: Record<string, any>,
    limit?: number,
    exclusiveStartKey?: Record<string, any>
  ): Promise<{ items: T[]; lastEvaluatedKey?: Record<string, any>; count: number }> {
    try {
      LogUtils.logDatabaseOperation('SCAN', tableName, { filterExpression });
      
      const command = new ScanCommand({
        TableName: tableName,
        FilterExpression: filterExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      });

      const response = await this.client.send(command);
      
      logger.debug('✅ Scan completed successfully', { 
        tableName, 
        count: response.Count,
        scannedCount: response.ScannedCount 
      });

      return {
        items: (response.Items || []) as T[],
        lastEvaluatedKey: response.LastEvaluatedKey,
        count: response.Count || 0,
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`❌ Failed to scan ${tableName}`, err, { filterExpression });
      throw new TrinityError(`Failed to scan ${tableName}`, 'DATABASE_ERROR', 500, { filterExpression });
    }
  }

  /**
   * Batch get items
   */
  async batchGet<T = any>(requests: Array<{ tableName: string; keys: Record<string, any>[] }>): Promise<Record<string, T[]>> {
    try {
      logger.debug('🔍 Batch get operation', { requestCount: requests.length });
      
      const requestItems: Record<string, any> = {};
      
      for (const request of requests) {
        requestItems[request.tableName] = {
          Keys: request.keys,
        };
      }

      const command = new BatchGetCommand({
        RequestItems: requestItems,
      });

      const response = await this.client.send(command);
      
      logger.debug('✅ Batch get completed successfully', { 
        responseCount: Object.keys(response.Responses || {}).length 
      });

      return (response.Responses || {}) as Record<string, T[]>;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('❌ Failed to batch get items', err);
      throw new TrinityError('Failed to batch get items', 'DATABASE_ERROR', 500);
    }
  }

  /**
   * Batch write items
   */
  async batchWrite(items: BatchWriteItem[]): Promise<void> {
    try {
      logger.debug('📝 Batch write operation', { itemCount: items.length });
      
      const requestItems: Record<string, any> = {};
      
      for (const item of items) {
        if (!requestItems[item.tableName]) {
          requestItems[item.tableName] = [];
        }
        
        if (item.operation === 'PUT') {
          requestItems[item.tableName].push({
            PutRequest: { Item: item.item },
          });
        } else if (item.operation === 'DELETE') {
          requestItems[item.tableName].push({
            DeleteRequest: { Key: item.key },
          });
        }
      }

      const command = new BatchWriteCommand({
        RequestItems: requestItems,
      });

      await this.client.send(command);
      logger.debug('✅ Batch write completed successfully');

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('❌ Failed to batch write items', err);
      throw new TrinityError('Failed to batch write items', 'DATABASE_ERROR', 500);
    }
  }

  /**
   * Transaction write
   */
  async transactWrite(items: Array<{
    operation: 'PUT' | 'UPDATE' | 'DELETE' | 'CONDITION_CHECK';
    tableName: string;
    item?: any;
    key?: Record<string, any>;
    updateExpression?: string;
    conditionExpression?: string;
    expressionAttributeNames?: Record<string, string>;
    expressionAttributeValues?: Record<string, any>;
  }>): Promise<void> {
    try {
      logger.debug('🔄 Transaction write operation', { itemCount: items.length });
      
      const transactItems = items.map(item => {
        const baseParams = {
          TableName: item.tableName,
          ConditionExpression: item.conditionExpression,
          ExpressionAttributeNames: item.expressionAttributeNames,
          ExpressionAttributeValues: item.expressionAttributeValues,
        };

        switch (item.operation) {
          case 'PUT':
            return { Put: { ...baseParams, Item: item.item } };
          case 'UPDATE':
            return { 
              Update: { 
                ...baseParams, 
                Key: item.key, 
                UpdateExpression: item.updateExpression 
              } 
            };
          case 'DELETE':
            return { Delete: { ...baseParams, Key: item.key } };
          case 'CONDITION_CHECK':
            return { ConditionCheck: { ...baseParams, Key: item.key } };
          default:
            throw new Error(`Unsupported transaction operation: ${item.operation}`);
        }
      });

      const command = new TransactWriteCommand({
        TransactItems: transactItems,
      });

      await this.client.send(command);
      logger.debug('✅ Transaction write completed successfully');

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('❌ Failed to execute transaction write', err);
      throw new TrinityError('Failed to execute transaction write', 'DATABASE_ERROR', 500);
    }
  }

  /**
   * Get table name from config
   */
  getTableName(tableKey: keyof TrinityConfig['tables']): string {
    return this.config.tables[tableKey];
  }
}

// Factory function to create database instance
export async function createDatabase(config: TrinityConfig): Promise<TrinityDatabase> {
  return new TrinityDatabase(config);
}