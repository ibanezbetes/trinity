const https = require('https');

// GraphQL endpoint and API key from deployment output
const GRAPHQL_ENDPOINT = 'https://qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com/graphql';
const API_KEY = 'da2-ley6uvfgz5axjgpejgtisxctlq';

function makeGraphQLRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      query,
      variables
    });

    const options = {
      hostname: 'qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com',
      port: 443,
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function testContentFiltering() {
  console.log('🎬 Testing Content Filtering System...\n');

  try {
    // Test 1: Create room with content filtering
    console.log('📝 Test 1: Creating room with Action + Sci-Fi filtering...');
    
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
          memberCount
        }
      }
    `;

    const roomInput = {
      input: {
        name: 'Action Sci-Fi Test Room',
        mediaType: 'MOVIE',
        genreIds: [28, 878], // Action + Sci-Fi
        maxMembers: 4,
        isPrivate: false
      }
    };

    const roomResult = await makeGraphQLRequest(createRoomMutation, roomInput);
    
    if (roomResult.errors) {
      console.error('❌ Room creation failed:', roomResult.errors);
      return;
    }

    const room = roomResult.data.createRoom;
    console.log('✅ Room created successfully!');
    console.log(`   Room ID: ${room.id}`);
    console.log(`   Name: ${room.name}`);
    console.log(`   Media Type: ${room.mediaType}`);
    console.log(`   Genre IDs: [${room.genreIds?.join(', ') || 'none'}]`);
    console.log(`   Genre Names: [${room.genreNames?.join(', ') || 'none'}]`);
    console.log(`   Invite Code: ${room.inviteCode}`);
    console.log(`   Content IDs: ${room.contentIds?.length || 0} movies pre-loaded\n`);

    // Test 2: Get filtered content directly
    console.log('📝 Test 2: Testing getFilteredContent query...');
    
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

    const contentVariables = {
      mediaType: 'MOVIE',
      genreIds: [28, 878], // Action + Sci-Fi
      limit: 5
    };

    const contentResult = await makeGraphQLRequest(getContentQuery, contentVariables);
    
    if (contentResult.errors) {
      console.error('❌ Content filtering failed:', contentResult.errors);
      return;
    }

    const movies = contentResult.data.getFilteredContent;
    console.log(`✅ Retrieved ${movies?.length || 0} filtered movies:`);
    
    if (movies && movies.length > 0) {
      movies.forEach((movie, index) => {
        console.log(`   ${index + 1}. ${movie.title} (${movie.vote_average}/10)`);
      });
    } else {
      console.log('   No movies found - this might indicate an issue with the movie handler');
    }

    // Test 3: Test TV shows filtering
    console.log('\n📝 Test 3: Testing TV shows filtering...');
    
    const tvVariables = {
      mediaType: 'TV',
      genreIds: [10759, 10765], // Action & Adventure + Sci-Fi & Fantasy
      limit: 3
    };

    const tvResult = await makeGraphQLRequest(getContentQuery, tvVariables);
    
    if (tvResult.errors) {
      console.error('❌ TV shows filtering failed:', tvResult.errors);
    } else {
      const tvShows = tvResult.data.getFilteredContent;
      console.log(`✅ Retrieved ${tvShows?.length || 0} filtered TV shows:`);
      
      if (tvShows && tvShows.length > 0) {
        tvShows.forEach((show, index) => {
          console.log(`   ${index + 1}. ${show.title} (${show.vote_average}/10)`);
        });
      }
    }

    console.log('\n🎉 Content filtering system test completed!');
    console.log(`🔗 Room invite link: https://trinity.app/room/${room.inviteCode}`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testContentFiltering();