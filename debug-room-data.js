const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function debugRoomData() {
  console.log('🔍 DEBUGGING ROOM DATA AND GETROOM ISSUE\n');

  try {
    console.log('1️⃣ Scanning existing rooms in trinity-rooms-dev-v2...');
    
    const scanResult = await docClient.send(new ScanCommand({
      TableName: 'trinity-rooms-dev-v2',
      Limit: 10
    }));

    console.log(`   Found ${scanResult.Items?.length || 0} rooms in database`);
    
    if (scanResult.Items && scanResult.Items.length > 0) {
      console.log('\n   📋 Existing rooms:');
      scanResult.Items.forEach((room, index) => {
        console.log(`   ${index + 1}. ${room.name || 'Unnamed'} (${room.roomId || room.id})`);
        console.log(`      Status: ${room.status}`);
        console.log(`      MediaType: ${room.mediaType || 'null'}`);
        console.log(`      GenreIds: ${room.genreIds ? JSON.stringify(room.genreIds) : 'null'}`);
        console.log(`      ContentIds: ${room.contentIds ? `[${room.contentIds.length} items]` : 'null'}`);
        console.log(`      FilterCriteria: ${room.filterCriteria ? 'SET' : 'null'}`);
        console.log('');
      });

      // Test getRoom logic with an existing room
      const testRoom = scanResult.Items[0];
      const testRoomId = testRoom.roomId || testRoom.id;
      
      console.log(`2️⃣ Testing getRoom logic with existing room: ${testRoomId}`);
      
      // Check if there's a member for this room
      const memberScan = await docClient.send(new ScanCommand({
        TableName: 'trinity-room-members-dev',
        FilterExpression: 'roomId = :roomId',
        ExpressionAttributeValues: {
          ':roomId': testRoomId
        },
        Limit: 1
      }));

      if (memberScan.Items && memberScan.Items.length > 0) {
        const testUserId = memberScan.Items[0].userId;
        console.log(`   Found member: ${testUserId}`);
        
        // Simulate getRoom handler logic
        console.log('   Simulating getRoom handler...');
        
        // Step 1: Check member access
        const memberResponse = await docClient.send(new GetCommand({
          TableName: 'trinity-room-members-dev',
          Key: { roomId: testRoomId, userId: testUserId }
        }));

        if (memberResponse.Item) {
          console.log('   ✅ Member access verified');
          
          // Step 2: Get room details
          const roomResponse = await docClient.send(new GetCommand({
            TableName: 'trinity-rooms-dev-v2',
            Key: { PK: testRoomId, SK: 'ROOM' }
          }));

          if (roomResponse.Item) {
            console.log('   ✅ Room found');
            
            const room = roomResponse.Item;
            console.log('   Raw room data from DynamoDB:');
            console.log(`     PK: ${room.PK}`);
            console.log(`     SK: ${room.SK}`);
            console.log(`     roomId: ${room.roomId}`);
            console.log(`     name: ${room.name}`);
            console.log(`     mediaType: ${room.mediaType}`);
            console.log(`     genreIds: ${JSON.stringify(room.genreIds)}`);
            console.log(`     genreNames: ${JSON.stringify(room.genreNames)}`);
            console.log(`     contentIds: ${room.contentIds ? `[${room.contentIds.length} items]` : 'null'}`);
            console.log(`     filterCriteria: ${room.filterCriteria ? JSON.stringify(room.filterCriteria) : 'null'}`);
            console.log(`     lastContentRefresh: ${room.lastContentRefresh}`);
            
            // Step 3: Create return object (exact same logic as handler)
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

            console.log('\n   Handler would return:');
            console.log(`     id: ${returnObject.id}`);
            console.log(`     name: ${returnObject.name}`);
            console.log(`     mediaType: ${returnObject.mediaType}`);
            console.log(`     genreIds: ${JSON.stringify(returnObject.genreIds)}`);
            console.log(`     genreNames: ${JSON.stringify(returnObject.genreNames)}`);
            console.log(`     contentIds: ${returnObject.contentIds ? `[${returnObject.contentIds.length} items]` : 'null'}`);
            console.log(`     filterCriteria: ${returnObject.filterCriteria ? 'SET' : 'null'}`);
            console.log(`     lastContentRefresh: ${returnObject.lastContentRefresh}`);

          } else {
            console.log('   ❌ Room not found with PK/SK structure');
          }
        } else {
          console.log('   ❌ Member access denied');
        }
      } else {
        console.log('   ❌ No members found for this room');
      }
    }

    console.log('\n3️⃣ Creating a test room with filtering data...');
    
    const testRoomId = 'debug-room-' + Date.now();
    const testUserId = 'debug-user-123';
    
    const roomData = {
      PK: testRoomId,
      SK: 'ROOM',
      roomId: testRoomId,
      id: testRoomId,
      name: 'Debug Test Room with Filtering',
      description: 'Test room to debug getRoom response',
      status: 'WAITING',
      hostId: testUserId,
      inviteCode: 'DEBUG' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      inviteUrl: 'https://trinity-app.com/invite/DEBUG123',
      // FILTERING FIELDS
      mediaType: 'MOVIE',
      genreIds: [28, 12, 878],
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

    await docClient.send(new PutCommand({
      TableName: 'trinity-rooms-dev-v2',
      Item: roomData
    }));

    console.log(`   ✅ Test room created: ${testRoomId}`);

    // Create member
    const memberData = {
      roomId: testRoomId,
      userId: testUserId,
      role: 'HOST',
      joinedAt: new Date().toISOString(),
      isActive: true
    };

    await docClient.send(new PutCommand({
      TableName: 'trinity-room-members-dev',
      Item: memberData
    }));

    console.log('   ✅ Test member created');

    console.log('\n4️⃣ Testing getRoom with the new test room...');
    
    // Test getRoom logic
    const memberCheck = await docClient.send(new GetCommand({
      TableName: 'trinity-room-members-dev',
      Key: { roomId: testRoomId, userId: testUserId }
    }));

    if (memberCheck.Item) {
      console.log('   ✅ Member access verified');
      
      const roomCheck = await docClient.send(new GetCommand({
        TableName: 'trinity-rooms-dev-v2',
        Key: { PK: testRoomId, SK: 'ROOM' }
      }));

      if (roomCheck.Item) {
        console.log('   ✅ Room retrieved successfully');
        
        const room = roomCheck.Item;
        console.log('   Retrieved data:');
        console.log(`     mediaType: ${room.mediaType}`);
        console.log(`     genreIds: ${JSON.stringify(room.genreIds)}`);
        console.log(`     contentIds: ${room.contentIds ? `[${room.contentIds.length} items]` : 'null'}`);
        console.log(`     filterCriteria: ${room.filterCriteria ? 'SET' : 'null'}`);
        
        // Test the return object creation
        const result = {
          id: room.roomId,
          name: room.name,
          mediaType: room.mediaType,
          genreIds: room.genreIds,
          genreNames: room.genreNames,
          contentIds: room.contentIds,
          filterCriteria: room.filterCriteria,
          lastContentRefresh: room.lastContentRefresh
        };

        console.log('\n   Final result object:');
        console.log(JSON.stringify(result, null, 2));

      } else {
        console.log('   ❌ Room not found');
      }
    } else {
      console.log('   ❌ Member not found');
    }

    console.log('\n5️⃣ Cleaning up test room...');
    
    await docClient.send(new DeleteCommand({
      TableName: 'trinity-rooms-dev-v2',
      Key: { PK: testRoomId, SK: 'ROOM' }
    }));

    await docClient.send(new DeleteCommand({
      TableName: 'trinity-room-members-dev',
      Key: { roomId: testRoomId, userId: testUserId }
    }));

    console.log('   ✅ Test data cleaned up');

  } catch (error) {
    console.error('❌ Debug failed:', error);
    console.error('Error details:', error.message);
  }
}

debugRoomData().catch(console.error);
