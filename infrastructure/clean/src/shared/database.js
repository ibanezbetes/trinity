"use strict";
/**
 * DynamoDB utilities and base repository for Trinity Lambda functions
 * Provides consistent database access patterns and error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrinityDatabase = void 0;
exports.createDatabase = createDatabase;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const types_1 = require("./types");
const logger_1 = require("./logger");
class TrinityDatabase {
    constructor(config) {
        this.config = config;
        const dynamoClient = new client_dynamodb_1.DynamoDBClient({
            region: config.region,
            maxAttempts: 3,
        });
        this.client = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient, {
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
    async get(tableName, key, consistentRead = false) {
        try {
            logger_1.LogUtils.logDatabaseOperation('GET', tableName, key);
            const command = new lib_dynamodb_1.GetCommand({
                TableName: tableName,
                Key: key,
                ConsistentRead: consistentRead,
            });
            const response = await this.client.send(command);
            if (!response.Item) {
                logger_1.logger.debug('🔍 Item not found', { tableName, key });
                return null;
            }
            logger_1.logger.debug('✅ Item retrieved successfully', { tableName, key });
            return response.Item;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error(`❌ Failed to get item from ${tableName}`, err, { key });
            throw new types_1.TrinityError(`Failed to get item from ${tableName}`, 'DATABASE_ERROR', 500, { key });
        }
    }
    /**
     * Put an item (create or replace)
     */
    async put(tableName, item, conditionExpression, expressionAttributeNames, expressionAttributeValues) {
        try {
            logger_1.LogUtils.logDatabaseOperation('PUT', tableName, item);
            const command = new lib_dynamodb_1.PutCommand({
                TableName: tableName,
                Item: item,
                ConditionExpression: conditionExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
            });
            await this.client.send(command);
            logger_1.logger.debug('✅ Item put successfully', { tableName });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error(`❌ Failed to put item to ${tableName}`, err, { item });
            if (err.name === 'ConditionalCheckFailedException') {
                throw new types_1.TrinityError('Condition check failed', 'CONDITION_FAILED', 409, { item });
            }
            throw new types_1.TrinityError(`Failed to put item to ${tableName}`, 'DATABASE_ERROR', 500, { item });
        }
    }
    /**
     * Update an item
     */
    async update(tableName, key, updateExpression, options = {}) {
        try {
            logger_1.LogUtils.logDatabaseOperation('UPDATE', tableName, key);
            const command = new lib_dynamodb_1.UpdateCommand({
                TableName: tableName,
                Key: key,
                UpdateExpression: updateExpression,
                ConditionExpression: options.conditionExpression,
                ExpressionAttributeNames: options.expressionAttributeNames,
                ExpressionAttributeValues: options.expressionAttributeValues,
                ReturnValues: options.returnValues || 'ALL_NEW',
            });
            const response = await this.client.send(command);
            logger_1.logger.debug('✅ Item updated successfully', { tableName, key });
            return response.Attributes || null;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error(`❌ Failed to update item in ${tableName}`, err, { key });
            if (err.name === 'ConditionalCheckFailedException') {
                throw new types_1.TrinityError('Condition check failed', 'CONDITION_FAILED', 409, { key });
            }
            throw new types_1.TrinityError(`Failed to update item in ${tableName}`, 'DATABASE_ERROR', 500, { key });
        }
    }
    /**
     * Delete an item
     */
    async delete(tableName, key, conditionExpression, expressionAttributeNames, expressionAttributeValues) {
        try {
            logger_1.LogUtils.logDatabaseOperation('DELETE', tableName, key);
            const command = new lib_dynamodb_1.DeleteCommand({
                TableName: tableName,
                Key: key,
                ConditionExpression: conditionExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
            });
            await this.client.send(command);
            logger_1.logger.debug('✅ Item deleted successfully', { tableName, key });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error(`❌ Failed to delete item from ${tableName}`, err, { key });
            if (err.name === 'ConditionalCheckFailedException') {
                throw new types_1.TrinityError('Condition check failed', 'CONDITION_FAILED', 409, { key });
            }
            throw new types_1.TrinityError(`Failed to delete item from ${tableName}`, 'DATABASE_ERROR', 500, { key });
        }
    }
    /**
     * Query items
     */
    async query(tableName, keyConditionExpression, options = {}) {
        try {
            logger_1.LogUtils.logDatabaseOperation('QUERY', tableName, { keyConditionExpression });
            const command = new lib_dynamodb_1.QueryCommand({
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
            logger_1.logger.debug('✅ Query completed successfully', {
                tableName,
                count: response.Count,
                scannedCount: response.ScannedCount
            });
            return {
                items: (response.Items || []),
                lastEvaluatedKey: response.LastEvaluatedKey,
                count: response.Count || 0,
            };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error(`❌ Failed to query ${tableName}`, err, { keyConditionExpression });
            throw new types_1.TrinityError(`Failed to query ${tableName}`, 'DATABASE_ERROR', 500, { keyConditionExpression });
        }
    }
    /**
     * Scan items (use sparingly)
     */
    async scan(tableName, filterExpression, expressionAttributeNames, expressionAttributeValues, limit, exclusiveStartKey) {
        try {
            logger_1.LogUtils.logDatabaseOperation('SCAN', tableName, { filterExpression });
            const command = new lib_dynamodb_1.ScanCommand({
                TableName: tableName,
                FilterExpression: filterExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                Limit: limit,
                ExclusiveStartKey: exclusiveStartKey,
            });
            const response = await this.client.send(command);
            logger_1.logger.debug('✅ Scan completed successfully', {
                tableName,
                count: response.Count,
                scannedCount: response.ScannedCount
            });
            return {
                items: (response.Items || []),
                lastEvaluatedKey: response.LastEvaluatedKey,
                count: response.Count || 0,
            };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error(`❌ Failed to scan ${tableName}`, err, { filterExpression });
            throw new types_1.TrinityError(`Failed to scan ${tableName}`, 'DATABASE_ERROR', 500, { filterExpression });
        }
    }
    /**
     * Batch get items
     */
    async batchGet(requests) {
        try {
            logger_1.logger.debug('🔍 Batch get operation', { requestCount: requests.length });
            const requestItems = {};
            for (const request of requests) {
                requestItems[request.tableName] = {
                    Keys: request.keys,
                };
            }
            const command = new lib_dynamodb_1.BatchGetCommand({
                RequestItems: requestItems,
            });
            const response = await this.client.send(command);
            logger_1.logger.debug('✅ Batch get completed successfully', {
                responseCount: Object.keys(response.Responses || {}).length
            });
            return (response.Responses || {});
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error('❌ Failed to batch get items', err);
            throw new types_1.TrinityError('Failed to batch get items', 'DATABASE_ERROR', 500);
        }
    }
    /**
     * Batch write items
     */
    async batchWrite(items) {
        try {
            logger_1.logger.debug('📝 Batch write operation', { itemCount: items.length });
            const requestItems = {};
            for (const item of items) {
                if (!requestItems[item.tableName]) {
                    requestItems[item.tableName] = [];
                }
                if (item.operation === 'PUT') {
                    requestItems[item.tableName].push({
                        PutRequest: { Item: item.item },
                    });
                }
                else if (item.operation === 'DELETE') {
                    requestItems[item.tableName].push({
                        DeleteRequest: { Key: item.key },
                    });
                }
            }
            const command = new lib_dynamodb_1.BatchWriteCommand({
                RequestItems: requestItems,
            });
            await this.client.send(command);
            logger_1.logger.debug('✅ Batch write completed successfully');
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error('❌ Failed to batch write items', err);
            throw new types_1.TrinityError('Failed to batch write items', 'DATABASE_ERROR', 500);
        }
    }
    /**
     * Transaction write
     */
    async transactWrite(items) {
        try {
            logger_1.logger.debug('🔄 Transaction write operation', { itemCount: items.length });
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
            const command = new lib_dynamodb_1.TransactWriteCommand({
                TransactItems: transactItems,
            });
            await this.client.send(command);
            logger_1.logger.debug('✅ Transaction write completed successfully');
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error('❌ Failed to execute transaction write', err);
            throw new types_1.TrinityError('Failed to execute transaction write', 'DATABASE_ERROR', 500);
        }
    }
    /**
     * Get table name from config
     */
    getTableName(tableKey) {
        return this.config.tables[tableKey];
    }
}
exports.TrinityDatabase = TrinityDatabase;
// Factory function to create database instance
async function createDatabase(config) {
    return new TrinityDatabase(config);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YWJhc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkYXRhYmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7QUF3Ykgsd0NBRUM7QUF4YkQsOERBQTBEO0FBQzFELHdEQVkrQjtBQUMvQixtQ0FBcUU7QUFDckUscUNBQTRDO0FBMEI1QyxNQUFhLGVBQWU7SUFJMUIsWUFBWSxNQUFxQjtRQUMvQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUVyQixNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUM7WUFDdEMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNO1lBQ3JCLFdBQVcsRUFBRSxDQUFDO1NBQ2YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLE1BQU0sR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFO1lBQ3RELGVBQWUsRUFBRTtnQkFDZixrQkFBa0IsRUFBRSxLQUFLO2dCQUN6QixxQkFBcUIsRUFBRSxJQUFJO2dCQUMzQix5QkFBeUIsRUFBRSxLQUFLO2FBQ2pDO1lBQ0QsaUJBQWlCLEVBQUU7Z0JBQ2pCLFdBQVcsRUFBRSxLQUFLO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLEdBQUcsQ0FDUCxTQUFpQixFQUNqQixHQUF3QixFQUN4QixpQkFBMEIsS0FBSztRQUUvQixJQUFJLENBQUM7WUFDSCxpQkFBUSxDQUFDLG9CQUFvQixDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFFckQsTUFBTSxPQUFPLEdBQUcsSUFBSSx5QkFBVSxDQUFDO2dCQUM3QixTQUFTLEVBQUUsU0FBUztnQkFDcEIsR0FBRyxFQUFFLEdBQUc7Z0JBQ1IsY0FBYyxFQUFFLGNBQWM7YUFDL0IsQ0FBQyxDQUFDO1lBRUgsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFP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LENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxPQUFPLEdBQUcsSUFBSSxtQ0FBb0IsQ0FBQztnQkFDdkMsYUFBYSxFQUFFLGFBQWE7YUFDN0IsQ0FBQyxDQUFDO1lBRUgsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNoQyxlQUFNLENBQUMsS0FBSyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7UUFFN0QsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLEdBQUcsR0FBRyxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3RFLGVBQU0sQ0FBQyxLQUFLLENBQUMsdUNBQXVDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDM0QsTUFBTSxJQUFJLG9CQUFZLENBQUMscUNBQXFDLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDdkYsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILFlBQVksQ0FBQyxRQUF1QztRQUNsRCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7Q0FDRjtBQTFZRCwwQ0EwWUM7QUFFRCwrQ0FBK0M7QUFDeEMsS0FBSyxVQUFVLGNBQWMsQ0FBQyxNQUFxQjtJQUN4RCxPQUFPLElBQUksZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3JDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogRHluYW1vREIgdXRpbGl0aWVzIGFuZCBiYXNlIHJlcG9zaXRvcnkgZm9yIFRyaW5pdHkgTGFtYmRhIGZ1bmN0aW9uc1xyXG4gKiBQcm92aWRlcyBjb25zaXN0ZW50IGRhdGFiYXNlIGFjY2VzcyBwYXR0ZXJucyBhbmQgZXJyb3IgaGFuZGxpbmdcclxuICovXHJcblxyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XHJcbmltcG9ydCB7IFxyXG4gIER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFxyXG4gIEdldENvbW1hbmQsIFxyXG4gIFB1dENvbW1hbmQsIFxyXG4gIFVwZGF0ZUNvbW1hbmQsIFxyXG4gIERlbGV0ZUNvbW1hbmQsIFxyXG4gIFF1ZXJ5Q29tbWFuZCwgXHJcbiAgU2NhbkNvbW1hbmQsXHJcbiAgQmF0Y2hHZXRDb21tYW5kLFxyXG4gIEJhdGNoV3JpdGVDb21tYW5kLFxyXG4gIFRyYW5zYWN0V3JpdGVDb21tYW5kLFxyXG4gIFRyYW5zYWN0R2V0Q29tbWFuZCxcclxufSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xyXG5pbXBvcnQgeyBUcmluaXR5Q29uZmlnLCBUcmluaXR5RXJyb3IsIE5vdEZvdW5kRXJyb3IgfSBmcm9tICcuL3R5cGVzJztcclxuaW1wb3J0IHsgbG9nZ2VyLCBMb2dVdGlscyB9IGZyb20gJy4vbG9nZ2VyJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgUXVlcnlPcHRpb25zIHtcclxuICBpbmRleE5hbWU/OiBzdHJpbmc7XHJcbiAgbGltaXQ/OiBudW1iZXI7XHJcbiAgZXhjbHVzaXZlU3RhcnRLZXk/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG4gIHNjYW5JbmRleEZvcndhcmQ/OiBib29sZWFuO1xyXG4gIGZpbHRlckV4cHJlc3Npb24/OiBzdHJpbmc7XHJcbiAgZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcclxuICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzPzogUmVjb3JkPHN0cmluZywgYW55PjtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBVcGRhdGVPcHRpb25zIHtcclxuICBjb25kaXRpb25FeHByZXNzaW9uPzogc3RyaW5nO1xyXG4gIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XHJcbiAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlcz86IFJlY29yZDxzdHJpbmcsIGFueT47XHJcbiAgcmV0dXJuVmFsdWVzPzogJ05PTkUnIHwgJ0FMTF9PTEQnIHwgJ1VQREFURURfT0xEJyB8ICdBTExfTkVXJyB8ICdVUERBVEVEX05FVyc7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQmF0Y2hXcml0ZUl0ZW0ge1xyXG4gIHRhYmxlTmFtZTogc3RyaW5nO1xyXG4gIG9wZXJhdGlvbjogJ1BVVCcgfCAnREVMRVRFJztcclxuICBpdGVtPzogUmVjb3JkPHN0cmluZywgYW55PjtcclxuICBrZXk/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgVHJpbml0eURhdGFiYXNlIHtcclxuICBwcml2YXRlIGNsaWVudDogRHluYW1vREJEb2N1bWVudENsaWVudDtcclxuICBwcml2YXRlIGNvbmZpZzogVHJpbml0eUNvbmZpZztcclxuXHJcbiAgY29uc3RydWN0b3IoY29uZmlnOiBUcmluaXR5Q29uZmlnKSB7XHJcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgIFxyXG4gICAgY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHtcclxuICAgICAgcmVnaW9uOiBjb25maWcucmVnaW9uLFxyXG4gICAgICBtYXhBdHRlbXB0czogMyxcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICB0aGlzLmNsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQsIHtcclxuICAgICAgbWFyc2hhbGxPcHRpb25zOiB7XHJcbiAgICAgICAgY29udmVydEVtcHR5VmFsdWVzOiBmYWxzZSxcclxuICAgICAgICByZW1vdmVVbmRlZmluZWRWYWx1ZXM6IHRydWUsXHJcbiAgICAgICAgY29udmVydENsYXNzSW5zdGFuY2VUb01hcDogZmFsc2UsXHJcbiAgICAgIH0sXHJcbiAgICAgIHVubWFyc2hhbGxPcHRpb25zOiB7XHJcbiAgICAgICAgd3JhcE51bWJlcnM6IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgYSBzaW5nbGUgaXRlbSBieSBrZXlcclxuICAgKi9cclxuICBhc3luYyBnZXQ8VCA9IGFueT4oXHJcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgXHJcbiAgICBrZXk6IFJlY29yZDxzdHJpbmcsIGFueT4sXHJcbiAgICBjb25zaXN0ZW50UmVhZDogYm9vbGVhbiA9IGZhbHNlXHJcbiAgKTogUHJvbWlzZTxUIHwgbnVsbD4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgTG9nVXRpbHMubG9nRGF0YWJhc2VPcGVyYXRpb24oJ0dFVCcsIHRhYmxlTmFtZSwga2V5KTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXHJcbiAgICAgICAgS2V5OiBrZXksXHJcbiAgICAgICAgQ29uc2lzdGVudFJlYWQ6IGNvbnNpc3RlbnRSZWFkLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5jbGllbnQuc2VuZChjb21tYW5kKTtcclxuICAgICAgXHJcbiAgICAgIGlmICghcmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICAgIGxvZ2dlci5kZWJ1Zygn8J+UjSBJdGVtIG5vdCBmb3VuZCcsIHsgdGFibGVOYW1lLCBrZXkgfSk7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxvZ2dlci5kZWJ1Zygn4pyFIEl0ZW0gcmV0cmlldmVkIHN1Y2Nlc3NmdWxseScsIHsgdGFibGVOYW1lLCBrZXkgfSk7XHJcbiAgICAgIHJldHVybiByZXNwb25zZS5JdGVtIGFzIFQ7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICBsb2dnZXIuZXJyb3IoYOKdjCBGYWlsZWQgdG8gZ2V0IGl0ZW0gZnJvbSAke3RhYmxlTmFtZX1gLCBlcnIsIHsga2V5IH0pO1xyXG4gICAgICB0aHJvdyBuZXcgVHJpbml0eUVycm9yKGBGYWlsZWQgdG8gZ2V0IGl0ZW0gZnJvbSAke3RhYmxlTmFtZX1gLCAnREFUQUJBU0VfRVJST1InLCA1MDAsIHsga2V5IH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUHV0IGFuIGl0ZW0gKGNyZWF0ZSBvciByZXBsYWNlKVxyXG4gICAqL1xyXG4gIGFzeW5jIHB1dDxUIGV4dGVuZHMgUmVjb3JkPHN0cmluZywgYW55Pj4oXHJcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgXHJcbiAgICBpdGVtOiBULFxyXG4gICAgY29uZGl0aW9uRXhwcmVzc2lvbj86IHN0cmluZyxcclxuICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXHJcbiAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzPzogUmVjb3JkPHN0cmluZywgYW55PlxyXG4gICk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgTG9nVXRpbHMubG9nRGF0YWJhc2VPcGVyYXRpb24oJ1BVVCcsIHRhYmxlTmFtZSwgaXRlbSk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxyXG4gICAgICAgIEl0ZW06IGl0ZW0sXHJcbiAgICAgICAgQ29uZGl0aW9uRXhwcmVzc2lvbjogY29uZGl0aW9uRXhwcmVzc2lvbixcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGF3YWl0IHRoaXMuY2xpZW50LnNlbmQoY29tbWFuZCk7XHJcbiAgICAgIGxvZ2dlci5kZWJ1Zygn4pyFIEl0ZW0gcHV0IHN1Y2Nlc3NmdWxseScsIHsgdGFibGVOYW1lIH0pO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnN0IGVyciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyb3IpKTtcclxuICAgICAgbG9nZ2VyLmVycm9yKGDinYwgRmFpbGVkIHRvIHB1dCBpdGVtIHRvICR7dGFibGVOYW1lfWAsIGVyciwgeyBpdGVtIH0pO1xyXG4gICAgICBcclxuICAgICAgaWYgKGVyci5uYW1lID09PSAnQ29uZGl0aW9uYWxDaGVja0ZhaWxlZEV4Y2VwdGlvbicpIHtcclxuICAgICAgICB0aHJvdyBuZXcgVHJpbml0eUVycm9yKCdDb25kaXRpb24gY2hlY2sgZmFpbGVkJywgJ0NPTkRJVElPTl9GQUlMRUQnLCA0MDksIHsgaXRlbSB9KTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgdGhyb3cgbmV3IFRyaW5pdHlFcnJvcihgRmFpbGVkIHRvIHB1dCBpdGVtIHRvICR7dGFibGVOYW1lfWAsICdEQVRBQkFTRV9FUlJPUicsIDUwMCwgeyBpdGVtIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVXBkYXRlIGFuIGl0ZW1cclxuICAgKi9cclxuICBhc3luYyB1cGRhdGU8VCA9IGFueT4oXHJcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcclxuICAgIGtleTogUmVjb3JkPHN0cmluZywgYW55PixcclxuICAgIHVwZGF0ZUV4cHJlc3Npb246IHN0cmluZyxcclxuICAgIG9wdGlvbnM6IFVwZGF0ZU9wdGlvbnMgPSB7fVxyXG4gICk6IFByb21pc2U8VCB8IG51bGw+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIExvZ1V0aWxzLmxvZ0RhdGFiYXNlT3BlcmF0aW9uKCdVUERBVEUnLCB0YWJsZU5hbWUsIGtleSk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IFVwZGF0ZUNvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxyXG4gICAgICAgIEtleToga2V5LFxyXG4gICAgICAgIFVwZGF0ZUV4cHJlc3Npb246IHVwZGF0ZUV4cHJlc3Npb24sXHJcbiAgICAgICAgQ29uZGl0aW9uRXhwcmVzc2lvbjogb3B0aW9ucy5jb25kaXRpb25FeHByZXNzaW9uLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogb3B0aW9ucy5leHByZXNzaW9uQXR0cmlidXRlTmFtZXMsXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogb3B0aW9ucy5leHByZXNzaW9uQXR0cmlidXRlVmFsdWVzLFxyXG4gICAgICAgIFJldHVyblZhbHVlczogb3B0aW9ucy5yZXR1cm5WYWx1ZXMgfHwgJ0FMTF9ORVcnLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5jbGllbnQuc2VuZChjb21tYW5kKTtcclxuICAgICAgbG9nZ2VyLmRlYnVnKCfinIUgSXRlbSB1cGRhdGVkIHN1Y2Nlc3NmdWxseScsIHsgdGFibGVOYW1lLCBrZXkgfSk7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4gcmVzcG9uc2UuQXR0cmlidXRlcyBhcyBUIHx8IG51bGw7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICBsb2dnZXIuZXJyb3IoYOKdjCBGYWlsZWQgdG8gdXBkYXRlIGl0ZW0gaW4gJHt0YWJsZU5hbWV9YCwgZXJyLCB7IGtleSB9KTtcclxuICAgICAgXHJcbiAgICAgIGlmIChlcnIubmFtZSA9PT0gJ0NvbmRpdGlvbmFsQ2hlY2tGYWlsZWRFeGNlcHRpb24nKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IFRyaW5pdHlFcnJvcignQ29uZGl0aW9uIGNoZWNrIGZhaWxlZCcsICdDT05ESVRJT05fRkFJTEVEJywgNDA5LCB7IGtleSB9KTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgdGhyb3cgbmV3IFRyaW5pdHlFcnJvcihgRmFpbGVkIHRvIHVwZGF0ZSBpdGVtIGluICR7dGFibGVOYW1lfWAsICdEQVRBQkFTRV9FUlJPUicsIDUwMCwgeyBrZXkgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBEZWxldGUgYW4gaXRlbVxyXG4gICAqL1xyXG4gIGFzeW5jIGRlbGV0ZShcclxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxyXG4gICAga2V5OiBSZWNvcmQ8c3RyaW5nLCBhbnk+LFxyXG4gICAgY29uZGl0aW9uRXhwcmVzc2lvbj86IHN0cmluZyxcclxuICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXHJcbiAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzPzogUmVjb3JkPHN0cmluZywgYW55PlxyXG4gICk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgTG9nVXRpbHMubG9nRGF0YWJhc2VPcGVyYXRpb24oJ0RFTEVURScsIHRhYmxlTmFtZSwga2V5KTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgRGVsZXRlQ29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXHJcbiAgICAgICAgS2V5OiBrZXksXHJcbiAgICAgICAgQ29uZGl0aW9uRXhwcmVzc2lvbjogY29uZGl0aW9uRXhwcmVzc2lvbixcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGF3YWl0IHRoaXMuY2xpZW50LnNlbmQoY29tbWFuZCk7XHJcbiAgICAgIGxvZ2dlci5kZWJ1Zygn4pyFIEl0ZW0gZGVsZXRlZCBzdWNjZXNzZnVsbHknLCB7IHRhYmxlTmFtZSwga2V5IH0pO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnN0IGVyciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyb3IpKTtcclxuICAgICAgbG9nZ2VyLmVycm9yKGDinYwgRmFpbGVkIHRvIGRlbGV0ZSBpdGVtIGZyb20gJHt0YWJsZU5hbWV9YCwgZXJyLCB7IGtleSB9KTtcclxuICAgICAgXHJcbiAgICAgIGlmIChlcnIubmFtZSA9PT0gJ0NvbmRpdGlvbmFsQ2hlY2tGYWlsZWRFeGNlcHRpb24nKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IFRyaW5pdHlFcnJvcignQ29uZGl0aW9uIGNoZWNrIGZhaWxlZCcsICdDT05ESVRJT05fRkFJTEVEJywgNDA5LCB7IGtleSB9KTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgdGhyb3cgbmV3IFRyaW5pdHlFcnJvcihgRmFpbGVkIHRvIGRlbGV0ZSBpdGVtIGZyb20gJHt0YWJsZU5hbWV9YCwgJ0RBVEFCQVNFX0VSUk9SJywgNTAwLCB7IGtleSB9KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFF1ZXJ5IGl0ZW1zXHJcbiAgICovXHJcbiAgYXN5bmMgcXVlcnk8VCA9IGFueT4oXHJcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcclxuICAgIGtleUNvbmRpdGlvbkV4cHJlc3Npb246IHN0cmluZyxcclxuICAgIG9wdGlvbnM6IFF1ZXJ5T3B0aW9ucyA9IHt9XHJcbiAgKTogUHJvbWlzZTx7IGl0ZW1zOiBUW107IGxhc3RFdmFsdWF0ZWRLZXk/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+OyBjb3VudDogbnVtYmVyIH0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIExvZ1V0aWxzLmxvZ0RhdGFiYXNlT3BlcmF0aW9uKCdRVUVSWScsIHRhYmxlTmFtZSwgeyBrZXlDb25kaXRpb25FeHByZXNzaW9uIH0pO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBRdWVyeUNvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxyXG4gICAgICAgIEluZGV4TmFtZTogb3B0aW9ucy5pbmRleE5hbWUsXHJcbiAgICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjoga2V5Q29uZGl0aW9uRXhwcmVzc2lvbixcclxuICAgICAgICBGaWx0ZXJFeHByZXNzaW9uOiBvcHRpb25zLmZpbHRlckV4cHJlc3Npb24sXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiBvcHRpb25zLmV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiBvcHRpb25zLmV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXMsXHJcbiAgICAgICAgTGltaXQ6IG9wdGlvbnMubGltaXQsXHJcbiAgICAgICAgRXhjbHVzaXZlU3RhcnRLZXk6IG9wdGlvbnMuZXhjbHVzaXZlU3RhcnRLZXksXHJcbiAgICAgICAgU2NhbkluZGV4Rm9yd2FyZDogb3B0aW9ucy5zY2FuSW5kZXhGb3J3YXJkLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5jbGllbnQuc2VuZChjb21tYW5kKTtcclxuICAgICAgXHJcbiAgICAgIGxvZ2dlci5kZWJ1Zygn4pyFIFF1ZXJ5IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknLCB7IFxyXG4gICAgICAgIHRhYmxlTmFtZSwgXHJcbiAgICAgICAgY291bnQ6IHJlc3BvbnNlLkNvdW50LFxyXG4gICAgICAgIHNjYW5uZWRDb3VudDogcmVzcG9uc2UuU2Nhbm5lZENvdW50IFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgaXRlbXM6IChyZXNwb25zZS5JdGVtcyB8fCBbXSkgYXMgVFtdLFxyXG4gICAgICAgIGxhc3RFdmFsdWF0ZWRLZXk6IHJlc3BvbnNlLkxhc3RFdmFsdWF0ZWRLZXksXHJcbiAgICAgICAgY291bnQ6IHJlc3BvbnNlLkNvdW50IHx8IDAsXHJcbiAgICAgIH07XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICBsb2dnZXIuZXJyb3IoYOKdjCBGYWlsZWQgdG8gcXVlcnkgJHt0YWJsZU5hbWV9YCwgZXJyLCB7IGtleUNvbmRpdGlvbkV4cHJlc3Npb24gfSk7XHJcbiAgICAgIHRocm93IG5ldyBUcmluaXR5RXJyb3IoYEZhaWxlZCB0byBxdWVyeSAke3RhYmxlTmFtZX1gLCAnREFUQUJBU0VfRVJST1InLCA1MDAsIHsga2V5Q29uZGl0aW9uRXhwcmVzc2lvbiB9KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFNjYW4gaXRlbXMgKHVzZSBzcGFyaW5nbHkpXHJcbiAgICovXHJcbiAgYXN5bmMgc2NhbjxUID0gYW55PihcclxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxyXG4gICAgZmlsdGVyRXhwcmVzc2lvbj86IHN0cmluZyxcclxuICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXHJcbiAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzPzogUmVjb3JkPHN0cmluZywgYW55PixcclxuICAgIGxpbWl0PzogbnVtYmVyLFxyXG4gICAgZXhjbHVzaXZlU3RhcnRLZXk/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+XHJcbiAgKTogUHJvbWlzZTx7IGl0ZW1zOiBUW107IGxhc3RFdmFsdWF0ZWRLZXk/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+OyBjb3VudDogbnVtYmVyIH0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIExvZ1V0aWxzLmxvZ0RhdGFiYXNlT3BlcmF0aW9uKCdTQ0FOJywgdGFibGVOYW1lLCB7IGZpbHRlckV4cHJlc3Npb24gfSk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IFNjYW5Db21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcclxuICAgICAgICBGaWx0ZXJFeHByZXNzaW9uOiBmaWx0ZXJFeHByZXNzaW9uLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXMsXHJcbiAgICAgICAgTGltaXQ6IGxpbWl0LFxyXG4gICAgICAgIEV4Y2x1c2l2ZVN0YXJ0S2V5OiBleGNsdXNpdmVTdGFydEtleSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuY2xpZW50LnNlbmQoY29tbWFuZCk7XHJcbiAgICAgIFxyXG4gICAgICBsb2dnZXIuZGVidWcoJ+KchSBTY2FuIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknLCB7IFxyXG4gICAgICAgIHRhYmxlTmFtZSwgXHJcbiAgICAgICAgY291bnQ6IHJlc3BvbnNlLkNvdW50LFxyXG4gICAgICAgIHNjYW5uZWRDb3VudDogcmVzcG9uc2UuU2Nhbm5lZENvdW50IFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgaXRlbXM6IChyZXNwb25zZS5JdGVtcyB8fCBbXSkgYXMgVFtdLFxyXG4gICAgICAgIGxhc3RFdmFsdWF0ZWRLZXk6IHJlc3BvbnNlLkxhc3RFdmFsdWF0ZWRLZXksXHJcbiAgICAgICAgY291bnQ6IHJlc3BvbnNlLkNvdW50IHx8IDAsXHJcbiAgICAgIH07XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICBsb2dnZXIuZXJyb3IoYOKdjCBGYWlsZWQgdG8gc2NhbiAke3RhYmxlTmFtZX1gLCBlcnIsIHsgZmlsdGVyRXhwcmVzc2lvbiB9KTtcclxuICAgICAgdGhyb3cgbmV3IFRyaW5pdHlFcnJvcihgRmFpbGVkIHRvIHNjYW4gJHt0YWJsZU5hbWV9YCwgJ0RBVEFCQVNFX0VSUk9SJywgNTAwLCB7IGZpbHRlckV4cHJlc3Npb24gfSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBCYXRjaCBnZXQgaXRlbXNcclxuICAgKi9cclxuICBhc3luYyBiYXRjaEdldDxUID0gYW55PihyZXF1ZXN0czogQXJyYXk8eyB0YWJsZU5hbWU6IHN0cmluZzsga2V5czogUmVjb3JkPHN0cmluZywgYW55PltdIH0+KTogUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCBUW10+PiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBsb2dnZXIuZGVidWcoJ/CflI0gQmF0Y2ggZ2V0IG9wZXJhdGlvbicsIHsgcmVxdWVzdENvdW50OiByZXF1ZXN0cy5sZW5ndGggfSk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCByZXF1ZXN0SXRlbXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcclxuICAgICAgXHJcbiAgICAgIGZvciAoY29uc3QgcmVxdWVzdCBvZiByZXF1ZXN0cykge1xyXG4gICAgICAgIHJlcXVlc3RJdGVtc1tyZXF1ZXN0LnRhYmxlTmFtZV0gPSB7XHJcbiAgICAgICAgICBLZXlzOiByZXF1ZXN0LmtleXMsXHJcbiAgICAgICAgfTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBCYXRjaEdldENvbW1hbmQoe1xyXG4gICAgICAgIFJlcXVlc3RJdGVtczogcmVxdWVzdEl0ZW1zLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5jbGllbnQuc2VuZChjb21tYW5kKTtcclxuICAgICAgXHJcbiAgICAgIGxvZ2dlci5kZWJ1Zygn4pyFIEJhdGNoIGdldCBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5JywgeyBcclxuICAgICAgICByZXNwb25zZUNvdW50OiBPYmplY3Qua2V5cyhyZXNwb25zZS5SZXNwb25zZXMgfHwge30pLmxlbmd0aCBcclxuICAgICAgfSk7XHJcblxyXG4gICAgICByZXR1cm4gKHJlc3BvbnNlLlJlc3BvbnNlcyB8fCB7fSkgYXMgUmVjb3JkPHN0cmluZywgVFtdPjtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zdCBlcnIgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSk7XHJcbiAgICAgIGxvZ2dlci5lcnJvcign4p2MIEZhaWxlZCB0byBiYXRjaCBnZXQgaXRlbXMnLCBlcnIpO1xyXG4gICAgICB0aHJvdyBuZXcgVHJpbml0eUVycm9yKCdGYWlsZWQgdG8gYmF0Y2ggZ2V0IGl0ZW1zJywgJ0RBVEFCQVNFX0VSUk9SJywgNTAwKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEJhdGNoIHdyaXRlIGl0ZW1zXHJcbiAgICovXHJcbiAgYXN5bmMgYmF0Y2hXcml0ZShpdGVtczogQmF0Y2hXcml0ZUl0ZW1bXSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgbG9nZ2VyLmRlYnVnKCfwn5OdIEJhdGNoIHdyaXRlIG9wZXJhdGlvbicsIHsgaXRlbUNvdW50OiBpdGVtcy5sZW5ndGggfSk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCByZXF1ZXN0SXRlbXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcclxuICAgICAgXHJcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xyXG4gICAgICAgIGlmICghcmVxdWVzdEl0ZW1zW2l0ZW0udGFibGVOYW1lXSkge1xyXG4gICAgICAgICAgcmVxdWVzdEl0ZW1zW2l0ZW0udGFibGVOYW1lXSA9IFtdO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoaXRlbS5vcGVyYXRpb24gPT09ICdQVVQnKSB7XHJcbiAgICAgICAgICByZXF1ZXN0SXRlbXNbaXRlbS50YWJsZU5hbWVdLnB1c2goe1xyXG4gICAgICAgICAgICBQdXRSZXF1ZXN0OiB7IEl0ZW06IGl0ZW0uaXRlbSB9LFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChpdGVtLm9wZXJhdGlvbiA9PT0gJ0RFTEVURScpIHtcclxuICAgICAgICAgIHJlcXVlc3RJdGVtc1tpdGVtLnRhYmxlTmFtZV0ucHVzaCh7XHJcbiAgICAgICAgICAgIERlbGV0ZVJlcXVlc3Q6IHsgS2V5OiBpdGVtLmtleSB9LFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IEJhdGNoV3JpdGVDb21tYW5kKHtcclxuICAgICAgICBSZXF1ZXN0SXRlbXM6IHJlcXVlc3RJdGVtcyxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKGNvbW1hbmQpO1xyXG4gICAgICBsb2dnZXIuZGVidWcoJ+KchSBCYXRjaCB3cml0ZSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICBsb2dnZXIuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gYmF0Y2ggd3JpdGUgaXRlbXMnLCBlcnIpO1xyXG4gICAgICB0aHJvdyBuZXcgVHJpbml0eUVycm9yKCdGYWlsZWQgdG8gYmF0Y2ggd3JpdGUgaXRlbXMnLCAnREFUQUJBU0VfRVJST1InLCA1MDApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVHJhbnNhY3Rpb24gd3JpdGVcclxuICAgKi9cclxuICBhc3luYyB0cmFuc2FjdFdyaXRlKGl0ZW1zOiBBcnJheTx7XHJcbiAgICBvcGVyYXRpb246ICdQVVQnIHwgJ1VQREFURScgfCAnREVMRVRFJyB8ICdDT05ESVRJT05fQ0hFQ0snO1xyXG4gICAgdGFibGVOYW1lOiBzdHJpbmc7XHJcbiAgICBpdGVtPzogYW55O1xyXG4gICAga2V5PzogUmVjb3JkPHN0cmluZywgYW55PjtcclxuICAgIHVwZGF0ZUV4cHJlc3Npb24/OiBzdHJpbmc7XHJcbiAgICBjb25kaXRpb25FeHByZXNzaW9uPzogc3RyaW5nO1xyXG4gICAgZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcclxuICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG4gIH0+KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBsb2dnZXIuZGVidWcoJ/CflIQgVHJhbnNhY3Rpb24gd3JpdGUgb3BlcmF0aW9uJywgeyBpdGVtQ291bnQ6IGl0ZW1zLmxlbmd0aCB9KTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHRyYW5zYWN0SXRlbXMgPSBpdGVtcy5tYXAoaXRlbSA9PiB7XHJcbiAgICAgICAgY29uc3QgYmFzZVBhcmFtcyA9IHtcclxuICAgICAgICAgIFRhYmxlTmFtZTogaXRlbS50YWJsZU5hbWUsXHJcbiAgICAgICAgICBDb25kaXRpb25FeHByZXNzaW9uOiBpdGVtLmNvbmRpdGlvbkV4cHJlc3Npb24sXHJcbiAgICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IGl0ZW0uZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzLFxyXG4gICAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogaXRlbS5leHByZXNzaW9uQXR0cmlidXRlVmFsdWVzLFxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHN3aXRjaCAoaXRlbS5vcGVyYXRpb24pIHtcclxuICAgICAgICAgIGNhc2UgJ1BVVCc6XHJcbiAgICAgICAgICAgIHJldHVybiB7IFB1dDogeyAuLi5iYXNlUGFyYW1zLCBJdGVtOiBpdGVtLml0ZW0gfSB9O1xyXG4gICAgICAgICAgY2FzZSAnVVBEQVRFJzpcclxuICAgICAgICAgICAgcmV0dXJuIHsgXHJcbiAgICAgICAgICAgICAgVXBkYXRlOiB7IFxyXG4gICAgICAgICAgICAgICAgLi4uYmFzZVBhcmFtcywgXHJcbiAgICAgICAgICAgICAgICBLZXk6IGl0ZW0ua2V5LCBcclxuICAgICAgICAgICAgICAgIFVwZGF0ZUV4cHJlc3Npb246IGl0ZW0udXBkYXRlRXhwcmVzc2lvbiBcclxuICAgICAgICAgICAgICB9IFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgY2FzZSAnREVMRVRFJzpcclxuICAgICAgICAgICAgcmV0dXJuIHsgRGVsZXRlOiB7IC4uLmJhc2VQYXJhbXMsIEtleTogaXRlbS5rZXkgfSB9O1xyXG4gICAgICAgICAgY2FzZSAnQ09ORElUSU9OX0NIRUNLJzpcclxuICAgICAgICAgICAgcmV0dXJuIHsgQ29uZGl0aW9uQ2hlY2s6IHsgLi4uYmFzZVBhcmFtcywgS2V5OiBpdGVtLmtleSB9IH07XHJcbiAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIHRyYW5zYWN0aW9uIG9wZXJhdGlvbjogJHtpdGVtLm9wZXJhdGlvbn1gKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBUcmFuc2FjdFdyaXRlQ29tbWFuZCh7XHJcbiAgICAgICAgVHJhbnNhY3RJdGVtczogdHJhbnNhY3RJdGVtcyxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKGNvbW1hbmQpO1xyXG4gICAgICBsb2dnZXIuZGVidWcoJ+KchSBUcmFuc2FjdGlvbiB3cml0ZSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICBsb2dnZXIuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gZXhlY3V0ZSB0cmFuc2FjdGlvbiB3cml0ZScsIGVycik7XHJcbiAgICAgIHRocm93IG5ldyBUcmluaXR5RXJyb3IoJ0ZhaWxlZCB0byBleGVjdXRlIHRyYW5zYWN0aW9uIHdyaXRlJywgJ0RBVEFCQVNFX0VSUk9SJywgNTAwKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCB0YWJsZSBuYW1lIGZyb20gY29uZmlnXHJcbiAgICovXHJcbiAgZ2V0VGFibGVOYW1lKHRhYmxlS2V5OiBrZXlvZiBUcmluaXR5Q29uZmlnWyd0YWJsZXMnXSk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gdGhpcy5jb25maWcudGFibGVzW3RhYmxlS2V5XTtcclxuICB9XHJcbn1cclxuXHJcbi8vIEZhY3RvcnkgZnVuY3Rpb24gdG8gY3JlYXRlIGRhdGFiYXNlIGluc3RhbmNlXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVEYXRhYmFzZShjb25maWc6IFRyaW5pdHlDb25maWcpOiBQcm9taXNlPFRyaW5pdHlEYXRhYmFzZT4ge1xyXG4gIHJldHVybiBuZXcgVHJpbml0eURhdGFiYXNlKGNvbmZpZyk7XHJcbn0iXX0=