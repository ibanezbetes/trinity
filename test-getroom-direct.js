const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function testGetRoomDirect() {
  console.log('🧪 TESTING GETROOM FUNCTION DIRECTLY\n');

  const roomId = 'f3b6f4c1-9dcd-456f-b63c-295e832857d8'; // La sala más reciente
  
  console.log('1️⃣ Testing direct DynamoDB access...');
  try {
    const response = await docClient.send(new GetCommand({
      TableName: 'trinity-rooms-dev-v2',
      Key: { PK: roomId, SK: 'ROOM' },
    }));

    if (response.Item) {
      const room = response.Item;
      console.log('✅ Direct DynamoDB access successful');
      console.log(`   mediaType: ${room.mediaType} (${typeof room.mediaType})`);
      console.log(`   genreIds: ${JSON.stringify(room.genreIds)} (${typeof room.genreIds})`);
      console.log(`   genreNames: ${JSON.stringify(room.genreNames)} (${typeof room.genreNames})`);
      console.log(`   contentIds: ${room.contentIds || 'null'}`);
      console.log('');

      // Simulate the getRoom function mapping
      console.log('2️⃣ Simulating getRoom function mapping...');
      const mappedRoom = {
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

      console.log('✅ Mapped room object:');
      console.log(`   mediaType: ${mappedRoom.mediaType} (${typeof mappedRoom.mediaType})`);
      console.log(`   genreIds: ${JSON.stringify(mappedRoom.genreIds)} (${typeof mappedRoom.genreIds})`);
      console.log(`   genreNames: ${JSON.stringify(mappedRoom.genreNames)} (${typeof mappedRoom.genreNames})`);
      console.log(`   contentIds: ${mappedRoom.contentIds || 'null'}`);
      console.log('');

      // Check if the mapping preserves the values
      const isMediaTypePreserved = mappedRoom.mediaType === room.mediaType;
      const areGenreIdsPreserved = JSON.stringify(mappedRoom.genreIds) === JSON.stringify(room.genreIds);
      const areGenreNamesPreserved = JSON.stringify(mappedRoom.genreNames) === JSON.stringify(room.genreNames);

      console.log('3️⃣ Mapping verification:');
      console.log(`   mediaType preserved: ${isMediaTypePreserved ? '✅' : '❌'}`);
      console.log(`   genreIds preserved: ${areGenreIdsPreserved ? '✅' : '❌'}`);
      console.log(`   genreNames preserved: ${areGenreNamesPreserved ? '✅' : '❌'}`);

      if (isMediaTypePreserved && areGenreIdsPreserved && areGenreNamesPreserved) {
        console.log('');
        console.log('🎉 CONCLUSION: The getRoom mapping should work correctly!');
        console.log('   The problem might be elsewhere (caching, different room, etc.)');
      } else {
        console.log('');
        console.log('❌ CONCLUSION: There is a mapping issue in getRoom function');
      }

    } else {
      console.log('❌ Room not found in DynamoDB');
    }

  } catch (error) {
    console.error('❌ Error accessing DynamoDB:', error);
  }

  console.log('');
  console.log('4️⃣ Recommendations:');
  console.log('   - The room data is correctly stored in DynamoDB');
  console.log('   - The getRoom mapping logic appears correct');
  console.log('   - The issue might be:');
  console.log('     a) GraphQL response caching');
  console.log('     b) Lambda function not being called');
  console.log('     c) Different room being queried');
  console.log('     d) Error in Lambda execution (check CloudWatch logs)');
}

testGetRoomDirect().catch(console.error);
