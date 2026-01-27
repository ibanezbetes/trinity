const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

// Configurar cliente DynamoDB
const dynamoClient = new DynamoDBClient({
  region: 'eu-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

async function testGetRoomHandler() {
  console.log('🔍 Testing getRoom handler logic...');
  
  try {
    const roomId = '34ad9d7f-199a-48a5-b9b8-2c5561762420';
    const userId = '22c53444-20b1-7095-0706-8f68d93726b6'; // Host ID from logs
    
    console.log(`🔍 Step 1: Checking if user ${userId} is member of room ${roomId}...`);
    
    // Verificar que el usuario es miembro de la sala
    const memberResponse = await docClient.send(new GetCommand({
      TableName: 'trinity-room-members-dev',
      Key: { roomId, userId },
    }));
    
    if (!memberResponse.Item) {
      console.log('❌ User is not a member of the room');
      return;
    }
    
    console.log('✅ User is a member:', JSON.stringify(memberResponse.Item, null, 2));
    
    console.log(`🔍 Step 2: Getting room details for ${roomId}...`);
    
    // Obtener detalles de la sala
    const roomResponse = await docClient.send(new GetCommand({
      TableName: 'trinity-rooms-dev-v2',
      Key: { PK: roomId, SK: 'ROOM' },
    }));
    
    if (!roomResponse.Item) {
      console.log('❌ Room not found');
      return;
    }
    
    console.log('✅ Room found in DynamoDB:');
    console.log('📊 Raw room data:', JSON.stringify(roomResponse.Item, null, 2));
    
    const room = roomResponse.Item;
    
    // Simular la transformación que hace el handler
    const transformedRoom = {
      id: room.roomId,
      name: room.name || 'Sala sin nombre',
      description: room.description,
      status: room.status,
      resultMovieId: room.resultMovieId,
      hostId: room.hostId,
      inviteCode: room.inviteCode,
      inviteUrl: room.inviteUrl,
      genrePreferences: room.genrePreferences,
      mediaType: room.mediaType,
      genreIds: room.genreIds,
      genreNames: room.genreNames,
      contentIds: room.contentIds,
      shownContentIds: room.shownContentIds,
      currentContentIndex: room.currentContentIndex,
      filterCriteria: room.filterCriteria,
      excludedContentIds: room.excludedContentIds,
      lastContentRefresh: room.lastContentRefresh,
      isActive: room.isActive !== false,
      isPrivate: room.isPrivate || false,
      memberCount: room.memberCount || 1,
      maxMembers: room.maxMembers,
      matchCount: room.matchCount || 0,
      createdAt: room.createdAt || new Date().toISOString(),
      updatedAt: room.updatedAt || new Date().toISOString(),
    };
    
    console.log('\n🔍 Step 3: Transformed room object (what handler returns):');
    console.log('📊 Transformed room:', JSON.stringify(transformedRoom, null, 2));
    
    // Verificar específicamente los campos problemáticos
    console.log('\n🔍 Step 4: Specific field verification:');
    console.log('- mediaType:', transformedRoom.mediaType);
    console.log('- genreIds:', transformedRoom.genreIds);
    console.log('- genreNames:', transformedRoom.genreNames);
    
    if (transformedRoom.mediaType && transformedRoom.genreIds) {
      console.log('✅ Fields are correctly preserved in transformation');
    } else {
      console.log('❌ Fields are lost during transformation');
    }
    
  } catch (error) {
    console.error('❌ Error testing getRoom handler:', error);
  }
}

testGetRoomHandler();
