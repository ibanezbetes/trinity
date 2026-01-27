const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

async function cleanOldRooms() {
  console.log('🧹 Cleaning old rooms from DynamoDB...');
  
  try {
    // Scan all items in rooms table
    const scanResult = await docClient.send(new ScanCommand({
      TableName: 'trinity-rooms-dev-v2'
    }));
    
    console.log(`📊 Found ${scanResult.Items?.length || 0} items in rooms table`);
    
    if (scanResult.Items && scanResult.Items.length > 0) {
      // Delete all items
      for (const item of scanResult.Items) {
        await docClient.send(new DeleteCommand({
          TableName: 'trinity-rooms-dev-v2',
          Key: {
            PK: item.PK,
            SK: item.SK
          }
        }));
        console.log(`🗑️ Deleted room: ${item.PK}`);
      }
    }
    
    // Also clean room members table
    const membersResult = await docClient.send(new ScanCommand({
      TableName: 'trinity-room-members-dev'
    }));
    
    console.log(`📊 Found ${membersResult.Items?.length || 0} items in room members table`);
    
    if (membersResult.Items && membersResult.Items.length > 0) {
      for (const item of membersResult.Items) {
        await docClient.send(new DeleteCommand({
          TableName: 'trinity-room-members-dev',
          Key: {
            roomId: item.roomId,
            userId: item.userId
          }
        }));
        console.log(`🗑️ Deleted member: ${item.roomId}/${item.userId}`);
      }
    }
    
    console.log('✅ All old rooms and members cleaned successfully!');
    
  } catch (error) {
    console.error('❌ Error cleaning rooms:', error);
  }
}

cleanOldRooms();