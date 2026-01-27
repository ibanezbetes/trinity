import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';

export interface DynamoDBItem {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  [key: string]: any;
}

export interface QueryOptions {
  IndexName?: string;
  KeyConditionExpression: string;
  ExpressionAttributeNames?: { [key: string]: string };
  ExpressionAttributeValues: { [key: string]: any };
  FilterExpression?: string;
  Limit?: number;
  ScanIndexForward?: boolean;
}

@Injectable()
export class DynamoDBService {
  private readonly logger = new Logger(DynamoDBService.name);
  private readonly dynamodb: AWS.DynamoDB.DocumentClient;
  private readonly tableName: string;

  constructor(private configService: ConfigService) {
    // Siempre usar DynamoDB real de AWS (no local)
    AWS.config.update({
      region: this.configService.get('AWS_REGION', 'eu-west-1'),
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
    });
    this.dynamodb = new AWS.DynamoDB.DocumentClient();

    this.tableName = this.configService.get(
      'DYNAMODB_TABLE_NAME',
      'trinity-main',
    );
  }

  /**
   * Crear o actualizar un item en DynamoDB
   */
  async putItem(item: DynamoDBItem): Promise<void> {
    try {
      await this.dynamodb
        .put({
          TableName: this.tableName,
          Item: {
            ...item,
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        })
        .promise();

      this.logger.debug(`Item created/updated: PK=${item.PK}, SK=${item.SK}`);
    } catch (error) {
      this.logger.error(`Error putting item: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener un item específico por PK y SK
   */
  async getItem(PK: string, SK: string): Promise<DynamoDBItem | null> {
    try {
      const result = await this.dynamodb
        .get({
          TableName: this.tableName,
          Key: { PK, SK },
        })
        .promise();

      return (result.Item as DynamoDBItem) || null;
    } catch (error) {
      this.logger.error(`Error getting item: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Consultar items usando Query (más eficiente que Scan)
   */
  async query(options: QueryOptions): Promise<DynamoDBItem[]> {
    try {
      const params: AWS.DynamoDB.DocumentClient.QueryInput = {
        TableName: this.tableName,
        ...options,
      };

      const result = await this.dynamodb.query(params).promise();
      return (result.Items as DynamoDBItem[]) || [];
    } catch (error) {
      this.logger.error(`Error querying items: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener múltiples items en una sola operación (BatchGet)
   */
  async batchGet(keys: { PK: string; SK: string }[]): Promise<DynamoDBItem[]> {
    if (keys.length === 0) return [];

    try {
      // DynamoDB BatchGet tiene límite de 100 items
      const chunks = this.chunkArray(keys, 100);
      const allItems: DynamoDBItem[] = [];

      for (const chunk of chunks) {
        const params: AWS.DynamoDB.DocumentClient.BatchGetItemInput = {
          RequestItems: {
            [this.tableName]: {
              Keys: chunk,
            },
          },
        };

        const result = await this.dynamodb.batchGet(params).promise();
        const items =
          (result.Responses?.[this.tableName] as DynamoDBItem[]) || [];
        allItems.push(...items);
      }

      return allItems;
    } catch (error) {
      this.logger.error(
        `Error batch getting items: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Escribir múltiples items en una sola operación (BatchWrite)
   */
  async batchWrite(items: DynamoDBItem[]): Promise<void> {
    if (items.length === 0) return;

    try {
      // DynamoDB BatchWrite tiene límite de 25 items
      const chunks = this.chunkArray(items, 25);

      for (const chunk of chunks) {
        const writeRequests = chunk.map((item) => ({
          PutRequest: {
            Item: {
              ...item,
              createdAt: item.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        }));

        const params: AWS.DynamoDB.DocumentClient.BatchWriteItemInput = {
          RequestItems: {
            [this.tableName]: writeRequests,
          },
        };

        await this.dynamodb.batchWrite(params).promise();
      }

      this.logger.debug(`Batch write completed for ${items.length} items`);
    } catch (error) {
      this.logger.error(
        `Error batch writing items: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Eliminar un item
   */
  async deleteItem(PK: string, SK: string): Promise<void> {
    try {
      await this.dynamodb
        .delete({
          TableName: this.tableName,
          Key: { PK, SK },
        })
        .promise();

      this.logger.debug(`Item deleted: PK=${PK}, SK=${SK}`);
    } catch (error) {
      this.logger.error(`Error deleting item: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Actualización condicional (para evitar race conditions)
   */
  async conditionalUpdate(
    PK: string,
    SK: string,
    updateExpression: string,
    conditionExpression: string,
    expressionAttributeNames?: { [key: string]: string },
    expressionAttributeValues?: { [key: string]: any },
  ): Promise<DynamoDBItem> {
    try {
      const params: AWS.DynamoDB.DocumentClient.UpdateItemInput = {
        TableName: this.tableName,
        Key: { PK, SK },
        UpdateExpression: updateExpression,
        ConditionExpression: conditionExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      };

      // Solo añadir updatedAt si se usa en el UpdateExpression
      if (updateExpression.includes(':updatedAt')) {
        params.ExpressionAttributeValues = {
          ...expressionAttributeValues,
          ':updatedAt': new Date().toISOString(),
        };
      }

      const result = await this.dynamodb.update(params).promise();
      return result.Attributes as DynamoDBItem;
    } catch (error) {
      this.logger.error(
        `Error conditional update: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Utilidad para dividir arrays en chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Obtener el estado de la sala optimizado (una sola query)
   */
  async getRoomState(roomId: string): Promise<{
    room: DynamoDBItem | null;
    members: DynamoDBItem[];
    votes: DynamoDBItem[];
    matches: DynamoDBItem[];
  }> {
    try {
      const roomData = await this.query({
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `ROOM#${roomId}`,
        },
      });

      const room = roomData.find((item) => item.SK === 'METADATA') || null;
      const members = roomData.filter((item) => item.SK.startsWith('MEMBER#'));
      const votes = roomData.filter((item) => item.SK.startsWith('VOTE#'));
      const matches = roomData.filter((item) => item.SK.startsWith('MATCH#'));

      return { room, members, votes, matches };
    } catch (error) {
      this.logger.error(
        `Error getting room state: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
