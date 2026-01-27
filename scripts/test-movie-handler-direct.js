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

async function testMovieHandlerDirect() {
  console.log('🎬 Testing Movie Handler Direct Access...\n');

  try {
    // Test getFilteredContent (this should work without auth if properly configured)
    console.log('📝 Testing getFilteredContent query...');
    
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
      limit: 3
    };

    console.log('📤 Sending request with variables:', contentVariables);
    
    const contentResult = await makeGraphQLRequest(getContentQuery, contentVariables);
    
    console.log('📥 Response received:', JSON.stringify(contentResult, null, 2));
    
    if (contentResult.errors) {
      console.error('❌ Movie handler failed:', contentResult.errors);
      
      // Check if it's an authorization issue
      if (contentResult.errors.some(e => e.errorType === 'Unauthorized')) {
        console.log('🔐 This query requires authentication. The handler is deployed but needs auth.');
      }
    } else {
      const movies = contentResult.data.getFilteredContent;
      console.log(`✅ Movie handler working! Retrieved ${movies?.length || 0} movies:`);
      
      if (movies && movies.length > 0) {
        movies.forEach((movie, index) => {
          console.log(`   ${index + 1}. ${movie.title} (Rating: ${movie.vote_average}/10)`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMovieHandlerDirect();