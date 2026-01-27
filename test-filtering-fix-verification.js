#!/usr/bin/env node

/**
 * Test script to verify the advanced content filtering fix
 * This script creates a new room with filtering and checks if the fields are properly stored/retrieved
 */

const { CognitoIdentityProviderClient, AdminInitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');

const REGION = 'eu-west-1';
const USER_POOL_ID = 'eu-west-1_EtOx2swvP';
const CLIENT_ID = 'l08ofv6tef7dp8eorn022fqpj';
const GRAPHQL_ENDPOINT = 'https://qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com/graphql';

// Test user credentials (replace with actual test user)
const TEST_EMAIL = 'juan@juan.com';
const TEST_PASSWORD = 'TrinityTest123!';

async function authenticateUser() {
  const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });
  
  try {
    const authCommand = new AdminInitiateAuthCommand({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
      AuthFlow: 'ADMIN_NO_SRP_AUTH',
      AuthParameters: {
        USERNAME: TEST_EMAIL,
        PASSWORD: TEST_PASSWORD,
      },
    });

    const authResult = await cognitoClient.send(authCommand);
    return authResult.AuthenticationResult.AccessToken;
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    throw error;
  }
}

async function graphqlRequest(query, variables = {}, token) {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();
  
  if (result.errors) {
    console.error('❌ GraphQL errors:', result.errors);
    throw new Error(`GraphQL Error: ${result.errors[0].message}`);
  }
  
  return result.data;
}

async function testContentFilteringFix() {
  console.log('🧪 Testing Advanced Content Filtering Fix...\n');

  try {
    // Step 1: Authenticate
    console.log('🔐 Step 1: Authenticating user...');
    const token = await authenticateUser();
    console.log('✅ Authentication successful\n');

    // Step 2: Create room with filtering
    console.log('🏠 Step 2: Creating room with advanced filtering...');
    const createRoomMutation = `
      mutation CreateRoom($input: CreateRoomInput!) {
        createRoom(input: $input) {
          id
          name
          mediaType
          genreIds
          genreNames
          contentIds
          createdAt
        }
      }
    `;

    const roomInput = {
      name: `Test Filtering Fix - ${new Date().toISOString()}`,
      mediaType: 'MOVIE',
      genreIds: [28, 12], // Action, Adventure
      maxMembers: 2,
      isPrivate: false
    };

    const createResult = await graphqlRequest(createRoomMutation, { input: roomInput }, token);
    const createdRoom = createResult.createRoom;
    
    console.log('✅ Room created successfully:');
    console.log(`   ID: ${createdRoom.id}`);
    console.log(`   Name: ${createdRoom.name}`);
    console.log(`   MediaType: ${createdRoom.mediaType}`);
    console.log(`   GenreIds: [${createdRoom.genreIds?.join(', ') || 'null'}]`);
    console.log(`   GenreNames: [${createdRoom.genreNames?.join(', ') || 'null'}]`);
    console.log(`   ContentIds: ${createdRoom.contentIds || 'null'}\n`);

    // Step 3: Retrieve room and verify fields
    console.log('🔍 Step 3: Retrieving room to verify filtering fields...');
    const getRoomQuery = `
      query GetRoom($roomId: ID!) {
        getRoom(roomId: $roomId) {
          id
          name
          mediaType
          genreIds
          genreNames
          contentIds
          createdAt
        }
      }
    `;

    const getResult = await graphqlRequest(getRoomQuery, { roomId: createdRoom.id }, token);
    const retrievedRoom = getResult.getRoom;
    
    console.log('✅ Room retrieved successfully:');
    console.log(`   ID: ${retrievedRoom.id}`);
    console.log(`   Name: ${retrievedRoom.name}`);
    console.log(`   MediaType: ${retrievedRoom.mediaType}`);
    console.log(`   GenreIds: [${retrievedRoom.genreIds?.join(', ') || 'null'}]`);
    console.log(`   GenreNames: [${retrievedRoom.genreNames?.join(', ') || 'null'}]`);
    console.log(`   ContentIds: ${retrievedRoom.contentIds || 'null'}\n`);

    // Step 4: Verify the fix
    console.log('🔬 Step 4: Verifying the fix...');
    
    const issues = [];
    
    if (retrievedRoom.mediaType !== 'MOVIE') {
      issues.push(`❌ MediaType should be 'MOVIE', got: ${retrievedRoom.mediaType}`);
    }
    
    if (!retrievedRoom.genreIds || retrievedRoom.genreIds.length !== 2) {
      issues.push(`❌ GenreIds should be [28, 12], got: ${retrievedRoom.genreIds}`);
    }
    
    if (!retrievedRoom.genreNames || retrievedRoom.genreNames.length !== 2) {
      issues.push(`❌ GenreNames should have 2 items, got: ${retrievedRoom.genreNames}`);
    }

    if (issues.length === 0) {
      console.log('🎉 SUCCESS! The advanced content filtering fix is working correctly!');
      console.log('✅ All filtering fields are properly stored and retrieved.');
      console.log('✅ The system should now use advanced filtering instead of legacy fallback.');
    } else {
      console.log('❌ ISSUES FOUND:');
      issues.forEach(issue => console.log(`   ${issue}`));
      console.log('\n🔧 The fix may need additional work or deployment.');
    }

    return createdRoom.id;

  } catch (error) {
    console.error('💥 Test failed:', error.message);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testContentFilteringFix()
    .then((roomId) => {
      console.log(`\n🏁 Test completed. Room ID: ${roomId}`);
      console.log('💡 You can now test this room in the mobile app to see if filtering works!');
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testContentFilteringFix };
