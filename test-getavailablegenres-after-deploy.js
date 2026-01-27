/**
 * Test getAvailableGenres after deployment
 * Verifies that the function is working correctly for both MOVIE and TV
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' });
const appsync = new AWS.AppSync();

// AppSync endpoint and API key
const APPSYNC_ENDPOINT = 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql';
const API_KEY = 'da2-fakeApiId123456';

async function testGetAvailableGenres() {
  console.log('🎭 Testing getAvailableGenres after deployment...\n');

  // Test for MOVIE
  console.log('📽️ Testing MOVIE genres...');
  try {
    const movieQuery = `
      query GetAvailableGenres($mediaType: MediaType!) {
        getAvailableGenres(mediaType: $mediaType) {
          id
          name
        }
      }
    `;

    const movieResult = await makeGraphQLRequest(movieQuery, { mediaType: 'MOVIE' });
    
    if (movieResult.data && movieResult.data.getAvailableGenres) {
      console.log(`✅ MOVIE genres loaded: ${movieResult.data.getAvailableGenres.length} genres`);
      console.log('First 5 movie genres:');
      movieResult.data.getAvailableGenres.slice(0, 5).forEach(genre => {
        console.log(`  - ${genre.name} (ID: ${genre.id})`);
      });
    } else {
      console.log('❌ No movie genres returned');
      console.log('Response:', JSON.stringify(movieResult, null, 2));
    }
  } catch (error) {
    console.error('❌ Error testing MOVIE genres:', error.message);
  }

  console.log('\n📺 Testing TV genres...');
  try {
    const tvQuery = `
      query GetAvailableGenres($mediaType: MediaType!) {
        getAvailableGenres(mediaType: $mediaType) {
          id
          name
        }
      }
    `;

    const tvResult = await makeGraphQLRequest(tvQuery, { mediaType: 'TV' });
    
    if (tvResult.data && tvResult.data.getAvailableGenres) {
      console.log(`✅ TV genres loaded: ${tvResult.data.getAvailableGenres.length} genres`);
      console.log('First 5 TV genres:');
      tvResult.data.getAvailableGenres.slice(0, 5).forEach(genre => {
        console.log(`  - ${genre.name} (ID: ${genre.id})`);
      });
    } else {
      console.log('❌ No TV genres returned');
      console.log('Response:', JSON.stringify(tvResult, null, 2));
    }
  } catch (error) {
    console.error('❌ Error testing TV genres:', error.message);
  }
}

async function makeGraphQLRequest(query, variables) {
  const fetch = globalThis.fetch || require('node-fetch');
  
  const response = await fetch(APPSYNC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      query,
      variables
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

// Run the test
testGetAvailableGenres().catch(console.error);
