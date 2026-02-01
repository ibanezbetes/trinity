#!/usr/bin/env node

/**
 * EMERGENCY CACHE PURGE SCRIPT
 * Deletes ALL items from trinity-room-movie-cache-dev to force regeneration with new validation
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'trinity-room-movie-cache-dev';

async function purgeTable() {
    console.log('🚨 EMERGENCY CACHE PURGE STARTING...');
    console.log(`📊 Target table: ${TABLE_NAME}`);
    
    let totalDeleted = 0;
    let lastEvaluatedKey = undefined;
    
    do {
        try {
            // Scan for items to delete
            const scanParams = {
                TableName: TABLE_NAME,
                ProjectionExpression: 'roomId, sequenceIndex', // Correct key attributes
                Limit: 25, // Process in batches
                ExclusiveStartKey: lastEvaluatedKey
            };
            
            const scanResult = await docClient.send(new ScanCommand(scanParams));
            
            if (!scanResult.Items || scanResult.Items.length === 0) {
                break;
            }
            
            // Prepare batch delete
            const deleteRequests = scanResult.Items.map(item => ({
                DeleteRequest: {
                    Key: {
                        roomId: item.roomId,
                        sequenceIndex: item.sequenceIndex
                    }
                }
            }));
            
            // Execute batch delete
            const batchParams = {
                RequestItems: {
                    [TABLE_NAME]: deleteRequests
                }
            };
            
            await docClient.send(new BatchWriteCommand(batchParams));
            
            totalDeleted += deleteRequests.length;
            console.log(`🗑️ Deleted batch: ${deleteRequests.length} items (Total: ${totalDeleted})`);
            
            lastEvaluatedKey = scanResult.LastEvaluatedKey;
            
            // Small delay to avoid throttling
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            console.error('❌ Error during purge:', error);
            throw error;
        }
        
    } while (lastEvaluatedKey);
    
    console.log(`✅ PURGE COMPLETE: ${totalDeleted} corrupted cache entries deleted`);
    console.log('🔄 System will now regenerate cache with ZERO TOLERANCE validation');
    
    return totalDeleted;
}

// Execute purge
purgeTable()
    .then(deleted => {
        console.log(`\n🎯 EMERGENCY PURGE SUCCESSFUL`);
        console.log(`📊 Total items purged: ${deleted}`);
        console.log(`🔒 New cache will enforce ZERO TOLERANCE validation`);
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ EMERGENCY PURGE FAILED:', error);
        process.exit(1);
    });