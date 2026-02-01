#!/usr/bin/env node

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
    region: 'eu-west-1'
});

const dynamodb = new AWS.DynamoDB();

async function purgeAllRooms() {
    console.log('🚨 EMERGENCY PURGE: Deleting ALL rooms and related data...');
    
    try {
        // 1. Get all room IDs
        console.log('📋 Scanning trinity-rooms-dev-v2 table...');
        const roomsResult = await dynamodb.scan({
            TableName: 'trinity-rooms-dev-v2',
            ProjectionExpression: 'id'
        }).promise();
        
        const roomIds = roomsResult.Items.map(item => item.id.S);
        console.log(`🔍 Found ${roomIds.length} rooms to delete`);
        
        // 2. Get full room data and delete
        console.log('📋 Getting full room data for deletion...');
        const fullRoomsResult = await dynamodb.scan({
            TableName: 'trinity-rooms-dev-v2'
        }).promise();
        
        for (const room of fullRoomsResult.Items) {
            const pk = room.PK.S;
            const sk = room.SK.S;
            console.log(`🗑️ Deleting room: PK=${pk}, SK=${sk}`);
            await dynamodb.deleteItem({
                TableName: 'trinity-rooms-dev-v2',
                Key: { 
                    PK: { S: pk },
                    SK: { S: sk }
                }
            }).promise();
        }
        
        // 3. Delete all room members
        console.log('📋 Scanning trinity-room-members-dev table...');
        const membersResult = await dynamodb.scan({
            TableName: 'trinity-room-members-dev'
        }).promise();
        
        for (const member of membersResult.Items) {
            await dynamodb.deleteItem({
                TableName: 'trinity-room-members-dev',
                Key: { 
                    roomId: member.roomId,
                    userId: member.userId
                }
            }).promise();
        }
        
        // 4. Delete all room matches
        console.log('📋 Scanning trinity-room-matches-dev table...');
        const matchesResult = await dynamodb.scan({
            TableName: 'trinity-room-matches-dev'
        }).promise();
        
        for (const match of matchesResult.Items) {
            await dynamodb.deleteItem({
                TableName: 'trinity-room-matches-dev',
                Key: { 
                    roomId: match.roomId,
                    movieId: match.movieId
                }
            }).promise();
        }
        
        // 5. Delete all votes
        console.log('📋 Scanning trinity-votes-dev table...');
        const votesResult = await dynamodb.scan({
            TableName: 'trinity-votes-dev'
        }).promise();
        
        for (const vote of votesResult.Items) {
            await dynamodb.deleteItem({
                TableName: 'trinity-votes-dev',
                Key: { 
                    roomId: vote.roomId,
                    'userId#movieId': vote['userId#movieId']
                }
            }).promise();
        }
        
        // 6. Delete all room movie cache
        console.log('📋 Scanning trinity-room-movie-cache-dev table...');
        const cacheResult = await dynamodb.scan({
            TableName: 'trinity-room-movie-cache-dev'
        }).promise();
        
        for (const cache of cacheResult.Items) {
            await dynamodb.deleteItem({
                TableName: 'trinity-room-movie-cache-dev',
                Key: { 
                    roomId: cache.roomId,
                    sequenceIndex: cache.sequenceIndex
                }
            }).promise();
        }
        
        // 7. Delete all room cache metadata
        console.log('📋 Scanning trinity-room-cache-metadata-dev table...');
        const metadataResult = await dynamodb.scan({
            TableName: 'trinity-room-cache-metadata-dev'
        }).promise();
        
        for (const metadata of metadataResult.Items) {
            await dynamodb.deleteItem({
                TableName: 'trinity-room-cache-metadata-dev',
                Key: { 
                    roomId: metadata.roomId
                }
            }).promise();
        }
        
        console.log('✅ EMERGENCY PURGE COMPLETED');
        console.log(`🗑️ Deleted ${roomIds.length} rooms and all related data`);
        console.log('📊 All tables are now clean');
        
    } catch (error) {
        console.error('❌ PURGE FAILED:', error);
        process.exit(1);
    }
}

purgeAllRooms();