const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1'
});

const appsync = new AWS.AppSyncGraphQL({
  endpoint: 'https://qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com/graphql',
  region: 'eu-west-1',
  auth: {
    type: 'API_KEY',
    apikey: 'da2-ley6uvfgz5axjgpejgtisxctlq'
  }
});

async function testRoomWithFiltering() {
  console.log('🎬 Testing Room Creation with Content Filtering...');
  
  try {
    // Create room with content filtering
    const createRoomMutation = `
      mutation CreateRoom($input: CreateRoomInput!) {
        createRoom(input: $input) {
          id
          name
          mediaType
          genreIds
          genreNames
          contentIds
          inviteCode
          status
        }
      }
    `;

    const variables = {
      input: {
        name: 'Test Action Sci-Fi Room',
        mediaType: 'MOVIE',
        genreIds: [28, 878], // Action + Sci-Fi
        maxMembers: 4,
        isPrivate: false
      }
    };

    console.log('📤 Creating room with filtering:', variables);

    const result = await appsync.graphql({
      query: createRoomMutation,
      variables
    });

    console.log('✅ Room created successfully:', result.data.createRoom);
    
    const roomId = result.data.createRoom.id;
    
    // Test getting filtered content
    const getContentQuery = `
      query GetFilteredContent($mediaType: MediaType!, $genreIds: [Int!]!, $limit: Int) {
        getFilteredContent(mediaType: $mediaType, genreIds: $genreIds, limit: $limit) {
          id
          title
          poster
          overview
          vote_average
          release_date
        }
      }
    `;

    console.log('📤 Testing filtered content query...');
    
    const contentResult = await appsync.graphql({
      query: getContentQuery,
      variables: {
        mediaType: 'MOVIE',
        genreIds: [28, 878],
        limit: 5
      }
    });

    console.log('✅ Filtered content retrieved:', contentResult.data.getFilteredContent?.length || 0, 'movies');
    
    if (contentResult.data.getFilteredContent?.length > 0) {
      console.log('🎬 Sample movie:', contentResult.data.getFilteredContent[0]);
    }
    
  } catch (error) {
    console.error('❌ Error testing room with filtering:', error);
    if (error.errors) {
      console.error('GraphQL Errors:', error.errors);
    }
  }
}

testRoomWithFiltering();
