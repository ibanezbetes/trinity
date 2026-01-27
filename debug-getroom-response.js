const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

async function debugGetRoomResponse() {
  console.log('🔍 DEBUGGING GETROOM RESPONSE ISSUE\n');

  // Test room ID from recent creation
  const testRoomId = 'test-room-debug-' + Date.now();
  const testUserId = 'test-user-123';

  try {
    console.log('1️⃣ Creating test room directly in DynamoDB...');
    
    // Create room with filtering data
    const roomData = {
      PK: testRoomId,
      SK: 'ROOM',
      roomId: testRoomId,
      id: testRoomId,
      name: 'Debug Test Room',
      description: 'Room for debugging getRoom response',
      status: 'WAITING',
      hostId: testUserId,
      inviteCode: 'DEBUG123',
      inviteUrl: 'https://trinity-app.com/invite/DEBUG123',
      // NEW FILTERING FIELDS - These should be returned by getRoom
      mediaType: 'MOVIE',
      genreIds: [28, 12, 878], // Action, Adventure, Science Fiction
      genreNames: ['Action', 'Adventure', 'Science Fiction'],
      contentIds: [
        '550', '680', '155', '13', '120', '121', '122', '123', '124', '125',
        '126', '127', '128', '129', '130', '131', '132', '133', '134', '135',
        '136', '137', '138', '139', '140', '141', '142', '143', '144', '145'
      ],
      shownContentIds: [],
      currentContentIndex: 0,
      filterCriteria: {
        mediaType: 'MOVIE',
        genres: [28, 12, 878],
        roomId: testRoomId
      },
      excludedContentIds: [],
      lastContentRefresh: new Date().toISOString(),
      // STANDARD FIELDS
      isActive: true,
      isPrivate: false,
      memberCount: 1,
      maxMembers: 10,
      matchCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: 'trinity-rooms-dev-v2',
      Item: roomData
    }).promise();

    console.log('   ✅ Test room created in DynamoDB');
    console.log(`   Room ID: ${testRoomId}`);
    console.log(`   MediaType: ${roomData.mediaType}`);
    console.log(`   GenreIds: [${roomData.genreIds.join(', ')}]`);
    console.log(`   ContentIds: ${roomData.contentIds.length} items`);
    console.log('');

    console.log('2️⃣ Creating room member entry...');
    
    const memberData = {
      roomId: testRoomId,
      userId: testUserId,
      role: 'HOST',
      joinedAt: new Date().toISOString(),
      isActive: true
    };

    await dynamodb.put({
      TableName: 'trinity-room-members-dev',
      Item: memberData
    }).promise();

    console.log('   ✅ Room member created');
    console.log('');

    console.log('3️⃣ Reading room data directly from DynamoDB...');
    
    const directRead = await dynamodb.get({
      TableName: 'trinity-rooms-dev-v2',
      Key: { PK: testRoomId, SK: 'ROOM' }
    }).promise();

    if (directRead.Item) {
      console.log('   ✅ Direct DynamoDB read successful');
      console.log('   Raw data from DynamoDB:');
      console.log(`     mediaType: ${directRead.Item.mediaType}`);
      console.log(`     genreIds: ${JSON.stringify(directRead.Item.genreIds)}`);
      console.log(`     genreNames: ${JSON.stringify(directRead.Item.genreNames)}`);
      console.log(`     contentIds: ${directRead.Item.contentIds ? `[${directRead.Item.contentIds.length} items]` : 'null'}`);
      console.log(`     filterCriteria: ${directRead.Item.filterCriteria ? 'SET' : 'null'}`);
      console.log(`     lastContentRefresh: ${directRead.Item.lastContentRefresh}`);
    } else {
      console.log('   ❌ Direct DynamoDB read failed - no item found');
    }
    console.log('');

    console.log('4️⃣ Simulating getRoom handler logic...');
    
    // Simulate the exact logic from getRoom function
    try {
      // Check member access
      const memberResponse = await dynamodb.get({
        TableName: 'trinity-room-members-dev',
        Key: { roomId: testRoomId, userId: testUserId }
      }).promise();

      if (!memberResponse.Item) {
        console.log('   ❌ Member check failed');
        return;
      }
      console.log('   ✅ Member access verified');

      // Get room details (same as handler)
      const roomResponse = await dynamodb.get({
        TableName: 'trinity-rooms-dev-v2',
        Key: { PK: testRoomId, SK: 'ROOM' }
      }).promise();

      if (!roomResponse.Item) {
        console.log('   ❌ Room not found in handler simulation');
        return;
      }

      const room = roomResponse.Item;
      console.log('   ✅ Room found in handler simulation');

      // Create return object (same as handler)
      const returnObject = {
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

      console.log('   Handler would return:');
      console.log(`     mediaType: ${returnObject.mediaType}`);
      console.log(`     genreIds: ${JSON.stringify(returnObject.genreIds)}`);
      console.log(`     genreNames: ${JSON.stringify(returnObject.genreNames)}`);
      console.log(`     contentIds: ${returnObject.contentIds ? `[${returnObject.contentIds.length} items]` : 'null'}`);
      console.log(`     filterCriteria: ${returnObject.filterCriteria ? 'SET' : 'null'}`);
      console.log(`     lastContentRefresh: ${returnObject.lastContentRefresh}`);

    } catch (error) {
      console.log(`   ❌ Handler simulation error: ${error.message}`);
    }
    console.log('');

    console.log('5️⃣ Testing GraphQL query simulation...');
    
    // This simulates what happens when GraphQL processes the return value
    const graphqlResult = {
      id: directRead.Item.roomId,
      name: directRead.Item.name,
      mediaType: directRead.Item.mediaType,
      genreIds: directRead.Item.genreIds,
      genreNames: directRead.Item.genreNames,
      contentIds: directRead.Item.contentIds,
      filterCriteria: directRead.Item.filterCriteria,
      lastContentRefresh: directRead.Item.lastContentRefresh
    };

    console.log('   GraphQL would return:');
    console.log(JSON.stringify(graphqlResult, null, 2));
    console.log('');

    console.log('6️⃣ Cleanup - Deleting test data...');
    
    // Delete room
    await dynamodb.delete({
      TableName: 'trinity-rooms-dev-v2',
      Key: { PK: testRoomId, SK: 'ROOM' }
    }).promise();

    // Delete member
    await dynamodb.delete({
      TableName: 'trinity-room-members-dev',
      Key: { roomId: testRoomId, userId: testUserId }
    }).promise();

    console.log('   ✅ Test data cleaned up');

  } catch (error) {
    console.error('❌ Debug test failed:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugGetRoomResponse().catch(console.error);
