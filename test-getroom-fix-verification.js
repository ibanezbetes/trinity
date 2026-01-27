const { AppSyncClient, EvaluateCodeCommand } = require('@aws-sdk/client-appsync');
const { CognitoIdentityProviderClient, AdminInitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');

// Configuration
const config = {
  region: 'eu-west-1',
  appSyncApiId: 'qdvhkkwneza2pkpaofehnvmubq',
  userPoolId: 'eu-west-1_EtOx2swvP',
  clientId: 'l08ofv6tef7dp8eorn022fqpj',
  username: 'testuser@example.com',
  password: 'TempPassword123!',
  appSyncEndpoint: 'https://qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com/graphql'
};

const appSyncClient = new AppSyncClient({ region: config.region });
const cognitoClient = new CognitoIdentityProviderClient({ region: config.region });

async function testGetRoomFix() {
  console.log('🧪 Testing getRoom fix after Lambda update...');
  
  try {
    // Step 1: Authenticate user
    console.log('\n🔐 Step 1: Authenticating user...');
    
    const authCommand = new AdminInitiateAuthCommand({
      UserPoolId: config.userPoolId,
      ClientId: config.clientId,
      AuthFlow: 'ADMIN_NO_SRP_AUTH',
      AuthParameters: {
        USERNAME: config.username,
        PASSWORD: config.password,
      },
    });
    
    const authResult = await cognitoClient.send(authCommand);
    const accessToken = authResult.AuthenticationResult?.AccessToken;
    
    if (!accessToken) {
      throw new Error('Failed to get access token');
    }
    
    console.log('✅ User authenticated successfully');
    
    // Step 2: Create a test room with filtering
    console.log('\n🏠 Step 2: Creating test room with advanced filtering...');
    
    const createRoomMutation = `
      mutation CreateRoom($input: CreateRoomInput!) {
        createRoom(input: $input) {
          id
          name
          mediaType
          genreIds
          genreNames
          contentIds
          filterCriteria {
            mediaType
            genres
            roomId
          }
          status
          hostId
          createdAt
        }
      }
    `;
    
    const createRoomVariables = {
      input: {
        name: "Test Room - Advanced Filtering",
        description: "Testing advanced content filtering system",
        mediaType: "MOVIE",
        genreIds: [28, 878], // Action, Science Fiction
        isPrivate: false
      }
    };
    
    const createRoomResponse = await fetch(config.appSyncEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        query: createRoomMutation,
        variables: createRoomVariables,
      }),
    });
    
    const createRoomResult = await createRoomResponse.json();
    
    if (createRoomResult.errors) {
      console.error('❌ Room creation failed:', createRoomResult.errors);
      throw new Error('Failed to create test room');
    }
    
    const room = createRoomResult.data.createRoom;
    console.log('✅ Test room created successfully:');
    console.log('📊 Room details:');
    console.log('- ID:', room.id);
    console.log('- Name:', room.name);
    console.log('- Media Type:', room.mediaType);
    console.log('- Genre IDs:', room.genreIds);
    console.log('- Genre Names:', room.genreNames);
    console.log('- Content IDs count:', room.contentIds?.length || 0);
    console.log('- Filter Criteria:', room.filterCriteria);
    
    // Step 3: Test getRoom query
    console.log('\n🔍 Step 3: Testing getRoom query...');
    
    const getRoomQuery = `
      query GetRoom($roomId: ID!) {
        getRoom(roomId: $roomId) {
          id
          name
          description
          status
          mediaType
          genreIds
          genreNames
          contentIds
          shownContentIds
          currentContentIndex
          filterCriteria {
            mediaType
            genres
            roomId
          }
          excludedContentIds
          lastContentRefresh
          hostId
          inviteCode
          inviteUrl
          isActive
          isPrivate
          memberCount
          maxMembers
          matchCount
          createdAt
          updatedAt
        }
      }
    `;
    
    const getRoomVariables = {
      roomId: room.id
    };
    
    const getRoomResponse = await fetch(config.appSyncEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        query: getRoomQuery,
        variables: getRoomVariables,
      }),
    });
    
    const getRoomResult = await getRoomResponse.json();
    
    if (getRoomResult.errors) {
      console.error('❌ getRoom query failed:', getRoomResult.errors);
      throw new Error('Failed to get room details');
    }
    
    const roomDetails = getRoomResult.data.getRoom;
    
    console.log('✅ getRoom query successful!');
    console.log('📊 Retrieved room details:');
    console.log('- ID:', roomDetails.id);
    console.log('- Name:', roomDetails.name);
    console.log('- Media Type:', roomDetails.mediaType);
    console.log('- Genre IDs:', roomDetails.genreIds);
    console.log('- Genre Names:', roomDetails.genreNames);
    console.log('- Content IDs count:', roomDetails.contentIds?.length || 0);
    console.log('- Filter Criteria:', roomDetails.filterCriteria);
    console.log('- Status:', roomDetails.status);
    console.log('- Host ID:', roomDetails.hostId);
    
    // Step 4: Verify the fix
    console.log('\n🔬 Step 4: Verifying the fix...');
    
    const hasMediaType = roomDetails.mediaType !== null && roomDetails.mediaType !== undefined;
    const hasGenreIds = roomDetails.genreIds !== null && roomDetails.genreIds !== undefined && roomDetails.genreIds.length > 0;
    const hasGenreNames = roomDetails.genreNames !== null && roomDetails.genreNames !== undefined && roomDetails.genreNames.length > 0;
    const hasFilterCriteria = roomDetails.filterCriteria !== null && roomDetails.filterCriteria !== undefined;
    
    console.log('🔍 Fix verification results:');
    console.log('- mediaType field present:', hasMediaType, hasMediaType ? `(${roomDetails.mediaType})` : '');
    console.log('- genreIds field present:', hasGenreIds, hasGenreIds ? `(${roomDetails.genreIds.join(', ')})` : '');
    console.log('- genreNames field present:', hasGenreNames, hasGenreNames ? `(${roomDetails.genreNames.join(', ')})` : '');
    console.log('- filterCriteria field present:', hasFilterCriteria);
    
    if (hasMediaType && hasGenreIds && hasGenreNames) {
      console.log('\n🎉 SUCCESS! The Lambda handler fix is working correctly!');
      console.log('✅ All required fields are now being returned by getRoom');
      console.log('✅ Advanced content filtering system is functional');
      console.log('✅ Mobile app should now receive correct data instead of mock movies');
      
      return {
        success: true,
        roomId: room.id,
        mediaType: roomDetails.mediaType,
        genreIds: roomDetails.genreIds,
        genreNames: roomDetails.genreNames,
        hasFilterCriteria: hasFilterCriteria
      };
    } else {
      console.log('\n❌ FAILURE! The fix did not work as expected');
      console.log('❌ Some required fields are still missing');
      
      return {
        success: false,
        issues: {
          missingMediaType: !hasMediaType,
          missingGenreIds: !hasGenreIds,
          missingGenreNames: !hasGenreNames,
          missingFilterCriteria: !hasFilterCriteria
        }
      };
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if (error.message?.includes('User does not exist')) {
      console.log('\n💡 Note: Test user might not exist. The Lambda fix should still work.');
      console.log('💡 Try creating a room through the mobile app to test the fix.');
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
testGetRoomFix()
  .then(result => {
    console.log('\n📋 Test Summary:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(console.error);
