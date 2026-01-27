const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Configurar cliente DynamoDB
const dynamoClient = new DynamoDBClient({
  region: 'eu-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

async function monitorRoomCreation() {
  console.log('🔍 Monitoring room creation...');
  console.log('📝 Create a new room in the mobile app now, then press Enter to check...');
  
  // Wait for user input
  await new Promise(resolve => {
    process.stdin.once('data', () => resolve());
  });
  
  try {
    console.log('🔍 Scanning for recent rooms...');
    
    // Get all rooms from the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const response = await docClient.send(new ScanCommand({
      TableName: 'trinity-rooms-dev-v2',
      FilterExpression: 'createdAt > :oneHourAgo',
      ExpressionAttributeValues: {
        ':oneHourAgo': oneHourAgo
      }
    }));
    
    if (!response.Items || response.Items.length === 0) {
      console.log('❌ No recent rooms found');
      return;
    }
    
    console.log(`✅ Found ${response.Items.length} recent room(s):`);
    
    // Sort by creation time (most recent first)
    const sortedRooms = response.Items.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    sortedRooms.forEach((room, index) => {
      console.log(`\n🏠 Room ${index + 1}:`);
      console.log(`- ID: ${room.id || room.roomId}`);
      console.log(`- Name: ${room.name}`);
      console.log(`- Created: ${room.createdAt}`);
      console.log(`- MediaType: ${room.mediaType || 'NULL'}`);
      console.log(`- GenreIds: ${JSON.stringify(room.genreIds) || 'NULL'}`);
      console.log(`- GenreNames: ${JSON.stringify(room.genreNames) || 'NULL'}`);
      console.log(`- ContentIds: ${room.contentIds ? room.contentIds.length + ' items' : 'NULL'}`);
      
      if (room.mediaType && room.genreIds) {
        console.log('✅ Room has filtering data');
      } else {
        console.log('❌ Room missing filtering data');
      }
    });
    
    // Show the most recent room in detail
    if (sortedRooms.length > 0) {
      console.log('\n🔍 Most recent room (full data):');
      console.log(JSON.stringify(sortedRooms[0], null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error monitoring room creation:', error);
  }
}

monitorRoomCreation();
