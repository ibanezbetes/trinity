"use strict";
/**
 * DynamoDB Service - Consistent database operations for Trinity
 * Provides standardized DynamoDB operations with proper error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamoDBService = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
class DynamoDBService {
    constructor(config) {
        const dynamoClient = new client_dynamodb_1.DynamoDBClient({
            region: config?.region || process.env.AWS_REGION || 'eu-west-1',
            ...(config?.endpoint && { endpoint: config.endpoint })
        });
        this.client = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
        console.log('🗄️ DynamoDBService initialized');
    }
    async putItem(tableName, item) {
        try {
            await this.client.send(new lib_dynamodb_1.PutCommand({
                TableName: tableName,
                Item: item
            }));
            console.log(`✅ DynamoDB: Item put to ${tableName}`);
        }
        catch (error) {
            console.error(`❌ DynamoDB: Error putting item to ${tableName}:`, error);
            throw error;
        }
    }
    async getItem(tableName, key) {
        try {
            const result = await this.client.send(new lib_dynamodb_1.GetCommand({
                TableName: tableName,
                Key: key
            }));
            if (result.Item) {
                console.log(`✅ DynamoDB: Item retrieved from ${tableName}`);
                return result.Item;
            }
            else {
                console.log(`ℹ️ DynamoDB: No item found in ${tableName} with key:`, key);
                return null;
            }
        }
        catch (error) {
            console.error(`❌ DynamoDB: Error getting item from ${tableName}:`, error);
            throw error;
        }
    }
    async updateItem(tableName, key, updateExpression, expressionAttributeValues, expressionAttributeNames) {
        try {
            const result = await this.client.send(new lib_dynamodb_1.UpdateCommand({
                TableName: tableName,
                Key: key,
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                ExpressionAttributeNames: expressionAttributeNames,
                ReturnValues: 'ALL_NEW'
            }));
            console.log(`✅ DynamoDB: Item updated in ${tableName}`);
            return result.Attributes || null;
        }
        catch (error) {
            console.error(`❌ DynamoDB: Error updating item in ${tableName}:`, error);
            throw error;
        }
    }
    async deleteItem(tableName, key) {
        try {
            await this.client.send(new lib_dynamodb_1.DeleteCommand({
                TableName: tableName,
                Key: key
            }));
            console.log(`✅ DynamoDB: Item deleted from ${tableName}`);
        }
        catch (error) {
            console.error(`❌ DynamoDB: Error deleting item from ${tableName}:`, error);
            throw error;
        }
    }
    async query(tableName, keyConditionExpression, expressionAttributeValues, indexName, filterExpression, expressionAttributeNames, limit) {
        try {
            const result = await this.client.send(new lib_dynamodb_1.QueryCommand({
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
        }
        catch (error) {
            console.error(`❌ DynamoDB: Error querying ${tableName}:`, error);
            throw error;
        }
    }
    async scan(tableName, filterExpression, expressionAttributeValues, expressionAttributeNames, limit) {
        try {
            const result = await this.client.send(new lib_dynamodb_1.ScanCommand({
                TableName: tableName,
                FilterExpression: filterExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                ExpressionAttributeNames: expressionAttributeNames,
                Limit: limit
            }));
            console.log(`✅ DynamoDB: Scan executed on ${tableName}, returned ${result.Items?.length || 0} items`);
            return result.Items || [];
        }
        catch (error) {
            console.error(`❌ DynamoDB: Error scanning ${tableName}:`, error);
            throw error;
        }
    }
    async batchWrite(tableName, items) {
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
                await this.client.send(new lib_dynamodb_1.BatchWriteCommand({
                    RequestItems: {
                        [tableName]: batch
                    }
                }));
            }
            console.log(`✅ DynamoDB: Batch write completed for ${items.length} items to ${tableName}`);
        }
        catch (error) {
            console.error(`❌ DynamoDB: Error in batch write to ${tableName}:`, error);
            throw error;
        }
    }
    async batchGet(tableName, keys) {
        try {
            const result = await this.client.send(new lib_dynamodb_1.BatchGetCommand({
                RequestItems: {
                    [tableName]: {
                        Keys: keys
                    }
                }
            }));
            const items = result.Responses?.[tableName] || [];
            console.log(`✅ DynamoDB: Batch get completed, retrieved ${items.length} items from ${tableName}`);
            return items;
        }
        catch (error) {
            console.error(`❌ DynamoDB: Error in batch get from ${tableName}:`, error);
            throw error;
        }
    }
    /**
     * Utility method to create TTL timestamp (current time + days)
     */
    createTTL(days) {
        return Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
    }
    /**
     * Utility method to check if TTL has expired
     */
    isTTLExpired(ttl) {
        return ttl < Math.floor(Date.now() / 1000);
    }
}
exports.DynamoDBService = DynamoDBService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHluYW1vZGItc2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImR5bmFtb2RiLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsOERBQTBEO0FBQzFELHdEQVUrQjtBQU8vQixNQUFhLGVBQWU7SUFHMUIsWUFBWSxNQUF1QjtRQUNqQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUM7WUFDdEMsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVztZQUMvRCxHQUFHLENBQUMsTUFBTSxFQUFFLFFBQVEsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7U0FDdkQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLE1BQU0sR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDeEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQWlCLEVBQUUsSUFBeUI7UUFDeEQsSUFBSSxDQUFDO1lBQ0gsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLHlCQUFVLENBQUM7Z0JBQ3BDLFNBQVMsRUFBRSxTQUFTO2dCQUNwQixJQUFJLEVBQUUsSUFBSTthQUNYLENBQUMsQ0FBQyxDQUFDO1lBQ0osT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUN0RCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMscUNBQXFDLFNBQVMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3hFLE1BQU0sS0FBSyxDQUFDO1FBQ2QsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTyxDQUFDLFNB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QUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLDhCQUFlLENBQUM7Z0JBQ3hELFlBQVksRUFBRTtvQkFDWixDQUFDLFNBQVMsQ0FBQyxFQUFFO3dCQUNYLElBQUksRUFBRSxJQUFJO3FCQUNYO2lCQUNGO2FBQ0YsQ0FBQyxDQUFDLENBQUM7WUFFSixNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2xELE9BQU8sQ0FBQyxHQUFHLENBQUMsOENBQThDLEtBQUssQ0FBQyxNQUFNLGVBQWUsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUNsRyxPQUFPLEtBQUssQ0FBQztRQUNmLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDMUUsTUFBTSxLQUFLLENBQUM7UUFDZCxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0gsU0FBUyxDQUFDLElBQVk7UUFDcEIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFFRDs7T0FFRztJQUNILFlBQVksQ0FBQyxHQUFXO1FBQ3RCLE9BQU8sR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO0lBQzdDLENBQUM7Q0FDRjtBQW5NRCwwQ0FtTUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogRHluYW1vREIgU2VydmljZSAtIENvbnNpc3RlbnQgZGF0YWJhc2Ugb3BlcmF0aW9ucyBmb3IgVHJpbml0eVxyXG4gKiBQcm92aWRlcyBzdGFuZGFyZGl6ZWQgRHluYW1vREIgb3BlcmF0aW9ucyB3aXRoIHByb3BlciBlcnJvciBoYW5kbGluZ1xyXG4gKi9cclxuXHJcbmltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcclxuaW1wb3J0IHsgXHJcbiAgRHluYW1vREJEb2N1bWVudENsaWVudCwgXHJcbiAgUHV0Q29tbWFuZCwgXHJcbiAgR2V0Q29tbWFuZCwgXHJcbiAgVXBkYXRlQ29tbWFuZCwgXHJcbiAgRGVsZXRlQ29tbWFuZCxcclxuICBRdWVyeUNvbW1hbmQsIFxyXG4gIFNjYW5Db21tYW5kLFxyXG4gIEJhdGNoV3JpdGVDb21tYW5kLFxyXG4gIEJhdGNoR2V0Q29tbWFuZFxyXG59IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIER5bmFtb0RCQ29uZmlnIHtcclxuICByZWdpb24/OiBzdHJpbmc7XHJcbiAgZW5kcG9pbnQ/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBEeW5hbW9EQlNlcnZpY2Uge1xyXG4gIHByaXZhdGUgY2xpZW50OiBEeW5hbW9EQkRvY3VtZW50Q2xpZW50O1xyXG5cclxuICBjb25zdHJ1Y3Rvcihjb25maWc/OiBEeW5hbW9EQkNvbmZpZykge1xyXG4gICAgY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHtcclxuICAgICAgcmVnaW9uOiBjb25maWc/LnJlZ2lvbiB8fCBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICdldS13ZXN0LTEnLFxyXG4gICAgICAuLi4oY29uZmlnPy5lbmRwb2ludCAmJiB7IGVuZHBvaW50OiBjb25maWcuZW5kcG9pbnQgfSlcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICB0aGlzLmNsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xyXG4gICAgY29uc29sZS5sb2coJ/Cfl4TvuI8gRHluYW1vREJTZXJ2aWNlIGluaXRpYWxpemVkJyk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBwdXRJdGVtKHRhYmxlTmFtZTogc3RyaW5nLCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcclxuICAgICAgICBJdGVtOiBpdGVtXHJcbiAgICAgIH0pKTtcclxuICAgICAgY29uc29sZS5sb2coYOKchSBEeW5hbW9EQjogSXRlbSBwdXQgdG8gJHt0YWJsZU5hbWV9YCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgRHluYW1vREI6IEVycm9yIHB1dHRpbmcgaXRlbSB0byAke3RhYmxlTmFtZX06YCwgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIGdldEl0ZW0odGFibGVOYW1lOiBzdHJpbmcsIGtleTogUmVjb3JkPHN0cmluZywgYW55Pik6IFByb21pc2U8UmVjb3JkPHN0cmluZywgYW55PiB8IG51bGw+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxyXG4gICAgICAgIEtleToga2V5XHJcbiAgICAgIH0pKTtcclxuICAgICAgXHJcbiAgICAgIGlmIChyZXN1bHQuSXRlbSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgRHluYW1vREI6IEl0ZW0gcmV0cmlldmVkIGZyb20gJHt0YWJsZU5hbWV9YCk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5JdGVtO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDihLnvuI8gRHluYW1vREI6IE5vIGl0ZW0gZm91bmQgaW4gJHt0YWJsZU5hbWV9IHdpdGgga2V5OmAsIGtleSk7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBEeW5hbW9EQjogRXJyb3IgZ2V0dGluZyBpdGVtIGZyb20gJHt0YWJsZU5hbWV9OmAsIGVycm9yKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyB1cGRhdGVJdGVtKFxyXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsIFxyXG4gICAga2V5OiBSZWNvcmQ8c3RyaW5nLCBhbnk+LCBcclxuICAgIHVwZGF0ZUV4cHJlc3Npb246IHN0cmluZywgXHJcbiAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzPzogUmVjb3JkPHN0cmluZywgYW55PixcclxuICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz5cclxuICApOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIGFueT4gfCBudWxsPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcclxuICAgICAgICBLZXk6IGtleSxcclxuICAgICAgICBVcGRhdGVFeHByZXNzaW9uOiB1cGRhdGVFeHByZXNzaW9uLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXMsXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiBleHByZXNzaW9uQXR0cmlidXRlTmFtZXMsXHJcbiAgICAgICAgUmV0dXJuVmFsdWVzOiAnQUxMX05FVydcclxuICAgICAgfSkpO1xyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYOKchSBEeW5hbW9EQjogSXRlbSB1cGRhdGVkIGluICR7dGFibGVOYW1lfWApO1xyXG4gICAgICByZXR1cm4gcmVzdWx0LkF0dHJpYnV0ZXMgfHwgbnVsbDtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBEeW5hbW9EQjogRXJyb3IgdXBkYXRpbmcgaXRlbSBpbiAke3RhYmxlTmFtZX06YCwgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIGRlbGV0ZUl0ZW0odGFibGVOYW1lOiBzdHJpbmcsIGtleTogUmVjb3JkPHN0cmluZywgYW55Pik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5jbGllbnQuc2VuZChuZXcgRGVsZXRlQ29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXHJcbiAgICAgICAgS2V5OiBrZXlcclxuICAgICAgfSkpO1xyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIER5bmFtb0RCOiBJdGVtIGRlbGV0ZWQgZnJvbSAke3RhYmxlTmFtZX1gKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBEeW5hbW9EQjogRXJyb3IgZGVsZXRpbmcgaXRlbSBmcm9tICR7dGFibGVOYW1lfTpgLCBlcnJvcik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgcXVlcnkoXHJcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgXHJcbiAgICBrZXlDb25kaXRpb25FeHByZXNzaW9uOiBzdHJpbmcsIFxyXG4gICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogUmVjb3JkPHN0cmluZywgYW55PixcclxuICAgIGluZGV4TmFtZT86IHN0cmluZyxcclxuICAgIGZpbHRlckV4cHJlc3Npb24/OiBzdHJpbmcsXHJcbiAgICBleHByZXNzaW9uQXR0cmlidXRlTmFtZXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LFxyXG4gICAgbGltaXQ/OiBudW1iZXJcclxuICApOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIGFueT5bXT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcclxuICAgICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBrZXlDb25kaXRpb25FeHByZXNzaW9uLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXMsXHJcbiAgICAgICAgSW5kZXhOYW1lOiBpbmRleE5hbWUsXHJcbiAgICAgICAgRmlsdGVyRXhwcmVzc2lvbjogZmlsdGVyRXhwcmVzc2lvbixcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcyxcclxuICAgICAgICBMaW1pdDogbGltaXRcclxuICAgICAgfSkpO1xyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYOKchSBEeW5hbW9EQjogUXVlcnkgZXhlY3V0ZWQgb24gJHt0YWJsZU5hbWV9LCByZXR1cm5lZCAke3Jlc3VsdC5JdGVtcz8ubGVuZ3RoIHx8IDB9IGl0ZW1zYCk7XHJcbiAgICAgIHJldHVybiByZXN1bHQuSXRlbXMgfHwgW107XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgRHluYW1vREI6IEVycm9yIHF1ZXJ5aW5nICR7dGFibGVOYW1lfTpgLCBlcnJvcik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgc2NhbihcclxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxyXG4gICAgZmlsdGVyRXhwcmVzc2lvbj86IHN0cmluZyxcclxuICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+LFxyXG4gICAgZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPixcclxuICAgIGxpbWl0PzogbnVtYmVyXHJcbiAgKTogUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCBhbnk+W10+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY2xpZW50LnNlbmQobmV3IFNjYW5Db21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcclxuICAgICAgICBGaWx0ZXJFeHByZXNzaW9uOiBmaWx0ZXJFeHByZXNzaW9uLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXMsXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiBleHByZXNzaW9uQXR0cmlidXRlTmFtZXMsXHJcbiAgICAgICAgTGltaXQ6IGxpbWl0XHJcbiAgICAgIH0pKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRHluYW1vREI6IFNjYW4gZXhlY3V0ZWQgb24gJHt0YWJsZU5hbWV9LCByZXR1cm5lZCAke3Jlc3VsdC5JdGVtcz8ubGVuZ3RoIHx8IDB9IGl0ZW1zYCk7XHJcbiAgICAgIHJldHVybiByZXN1bHQuSXRlbXMgfHwgW107XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgRHluYW1vREI6IEVycm9yIHNjYW5uaW5nICR7dGFibGVOYW1lfTpgLCBlcnJvcik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgYmF0Y2hXcml0ZSh0YWJsZU5hbWU6IHN0cmluZywgaXRlbXM6IFJlY29yZDxzdHJpbmcsIGFueT5bXSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcHV0UmVxdWVzdHMgPSBpdGVtcy5tYXAoaXRlbSA9PiAoe1xyXG4gICAgICAgIFB1dFJlcXVlc3Q6IHsgSXRlbTogaXRlbSB9XHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIC8vIER5bmFtb0RCIGJhdGNoIHdyaXRlIGxpbWl0IGlzIDI1IGl0ZW1zXHJcbiAgICAgIGNvbnN0IGJhdGNoZXMgPSBbXTtcclxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwdXRSZXF1ZXN0cy5sZW5ndGg7IGkgKz0gMjUpIHtcclxuICAgICAgICBiYXRjaGVzLnB1c2gocHV0UmVxdWVzdHMuc2xpY2UoaSwgaSArIDI1KSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZvciAoY29uc3QgYmF0Y2ggb2YgYmF0Y2hlcykge1xyXG4gICAgICAgIGF3YWl0IHRoaXMuY2xpZW50LnNlbmQobmV3IEJhdGNoV3JpdGVDb21tYW5kKHtcclxuICAgICAgICAgIFJlcXVlc3RJdGVtczoge1xyXG4gICAgICAgICAgICBbdGFibGVOYW1lXTogYmF0Y2hcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KSk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRHluYW1vREI6IEJhdGNoIHdyaXRlIGNvbXBsZXRlZCBmb3IgJHtpdGVtcy5sZW5ndGh9IGl0ZW1zIHRvICR7dGFibGVOYW1lfWApO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihg4p2MIER5bmFtb0RCOiBFcnJvciBpbiBiYXRjaCB3cml0ZSB0byAke3RhYmxlTmFtZX06YCwgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIGJhdGNoR2V0KHRhYmxlTmFtZTogc3RyaW5nLCBrZXlzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+W10pOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIGFueT5bXT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jbGllbnQuc2VuZChuZXcgQmF0Y2hHZXRDb21tYW5kKHtcclxuICAgICAgICBSZXF1ZXN0SXRlbXM6IHtcclxuICAgICAgICAgIFt0YWJsZU5hbWVdOiB7XHJcbiAgICAgICAgICAgIEtleXM6IGtleXNcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0pKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGl0ZW1zID0gcmVzdWx0LlJlc3BvbnNlcz8uW3RhYmxlTmFtZV0gfHwgW107XHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRHluYW1vREI6IEJhdGNoIGdldCBjb21wbGV0ZWQsIHJldHJpZXZlZCAke2l0ZW1zLmxlbmd0aH0gaXRlbXMgZnJvbSAke3RhYmxlTmFtZX1gKTtcclxuICAgICAgcmV0dXJuIGl0ZW1zO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihg4p2MIER5bmFtb0RCOiBFcnJvciBpbiBiYXRjaCBnZXQgZnJvbSAke3RhYmxlTmFtZX06YCwgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFV0aWxpdHkgbWV0aG9kIHRvIGNyZWF0ZSBUVEwgdGltZXN0YW1wIChjdXJyZW50IHRpbWUgKyBkYXlzKVxyXG4gICAqL1xyXG4gIGNyZWF0ZVRUTChkYXlzOiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgcmV0dXJuIE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApICsgKGRheXMgKiAyNCAqIDYwICogNjApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVXRpbGl0eSBtZXRob2QgdG8gY2hlY2sgaWYgVFRMIGhhcyBleHBpcmVkXHJcbiAgICovXHJcbiAgaXNUVExFeHBpcmVkKHR0bDogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdHRsIDwgTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCk7XHJcbiAgfVxyXG59Il19