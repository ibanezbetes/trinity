/**
 * DynamoDB Service - Consistent database operations for Trinity
 * Provides standardized DynamoDB operations with proper error handling
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  UpdateCommand, 
  DeleteCommand,
  QueryCommand, 
  ScanCommand,
  BatchWriteCommand,
  BatchGetCommand
} from '@aws-sdk/lib-dynamodb';

export interface DynamoDBConfig {
  region?: string;
  endpoint?: string;
}

export class DynamoDBService {
  private client: DynamoDBDocumentClient;

  constructor(config?: DynamoDBConfig) {
    const dynamoClient = new DynamoDBClient({
      region: config?.region || process.env.AWS_REGION || 'eu-west-1',
      ...(config?.endpoint && { endpoint: config.endpoint })
    });
    
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    console.log('🗄️ DynamoDBService initialized');
  }

  async putItem(tableName: string, item: Record<string, any>): Promise<void> {
    try {
      await this.client.send(new PutCommand({
        TableName: tableName,
        Item: item
      }));
      console.log(`✅ DynamoDB: Item put to ${tableName}`);
    } catch (error) {
      console.error(`❌ DynamoDB: Error putting item to ${tableName}:`, error);
      throw error;
    }
  }

  async getItem(tableName: string, key: Record<string, any>): Promise<Record<string, any> | null> {
    try {
      const result = await this.client.send(new GetCommand({
        TableName: tableName,
        Key: key
      }));
      
      if (result.Item) {
        console.log(`✅ DynamoDB: Item retrieved from ${tableName}`);
        return result.Item;
      } else {
        console.log(`ℹ️ DynamoDB: No item found in ${tableName} with key:`, key);
        return null;
      }
    } catch (error) {
      console.error(`❌ DynamoDB: Error getting item from ${tableName}:`, error);
      throw error;
    }
  }

  async updateItem(
    tableName: string, 
    key: Record<string, any>, 
    updateExpression: string, 
    expressionAttributeValues?: Record<string, any>,
    expressionAttributeNames?: Record<string, string>
  ): Promise<Record<string, any> | null> {
    try {
      const result = await this.client.send(new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        ReturnValues: 'ALL_NEW'
      }));
      
      console.log(`✅ DynamoDB: Item updated in ${tableName}`);
      return result.Attributes || null;
    } catch (error) {
      console.error(`❌ DynamoDB: Error updating item in ${tableName}:`, error);
      throw error;
    }
  }

  async deleteItem(tableName: string, key: Record<string, any>): Promise<void> {
    try {
      await this.client.send(new DeleteCommand({
        TableName: tableName,
        Key: key
      }));
      console.log(`✅ DynamoDB: Item deleted from ${tableName}`);
    } catch (error) {
      console.error(`❌ DynamoDB: Error deleting item from ${tableName}:`, error);
      throw error;
    }
  }

  async query(
    tableName: string, 
    keyConditionExpression: string, 
    expressionAttributeValues: Record<string, any>,
    indexName?: string,
    filterExpression?: string,
    expressionAttributeNames?: Record<string, string>,
    limit?: number
  ): Promise<Record<string, any>[]> {
    try {
      const result = await this.client.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        IndexName: indexName,
        FilterExpression: filterExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        Limit: limit
      }));
      
      console.log(`✅ DynamoDB: Query executed on ${tableName}, returned ${result.Items?.length || 0} items`);
      return result.Items || [];
    } catch (error) {
      console.error(`❌ DynamoDB: Error querying ${tableName}:`, error);
      throw error;
    }
  }

  async scan(
    tableName: string,
    filterExpression?: string,
    expressionAttributeValues?: Record<string, any>,
    expressionAttributeNames?: Record<string, string>,
    limit?: number
  ): Promise<Record<string, any>[]> {
    try {
      const result = await this.client.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        Limit: limit
      }));
      
      console.log(`✅ DynamoDB: Scan executed on ${tableName}, returned ${result.Items?.length || 0} items`);
      return result.Items || [];
    } catch (error) {
      console.error(`❌ DynamoDB: Error scanning ${tableName}:`, error);
      throw error;
    }
  }

  async batchWrite(tableName: string, items: Record<string, any>[]): Promise<void> {
    try {
      const putRequests = items.map(item => ({
        PutRequest: { Item: item }
      }));

      // DynamoDB batch write limit is 25 items
      const batches = [];
      for (let i = 0; i < putRequests.length; i += 25) {
        batches.push(putRequests.slice(i, i + 25));
      }

      for (const batch of batches) {
        await this.client.send(new BatchWriteCommand({
          RequestItems: {
            [tableName]: batch
          }
        }));
      }
      
      console.log(`✅ DynamoDB: Batch write completed for ${items.length} items to ${tableName}`);
    } catch (error) {
      console.error(`❌ DynamoDB: Error in batch write to ${tableName}:`, error);
      throw error;
    }
  }

  async batchGet(tableName: string, keys: Record<string, any>[]): Promise<Record<string, any>[]> {
    try {
      const result = await this.client.send(new BatchGetCommand({
        RequestItems: {
          [tableName]: {
            Keys: keys
          }
        }
      }));
      
      const items = result.Responses?.[tableName] || [];
      console.log(`✅ DynamoDB: Batch get completed, retrieved ${items.length} items from ${tableName}`);
      return items;
    } catch (error) {
      console.error(`❌ DynamoDB: Error in batch get from ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Utility method to create TTL timestamp (current time + days)
   */
  createTTL(days: number): number {
    return Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
  }

  /**
   * Utility method to check if TTL has expired
   */
  isTTLExpired(ttl: number): boolean {
    return ttl < Math.floor(Date.now() / 1000);
  }
}