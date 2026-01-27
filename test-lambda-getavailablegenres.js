/**
 * Test getAvailableGenres by directly invoking the Lambda function
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' });
const lambda = new AWS.Lambda();

async function testGetAvailableGenres() {
  console.log('🎭 Testing getAvailableGenres by invoking Lambda directly...\n');

  // Test for MOVIE
  console.log('📽️ Testing MOVIE genres...');
  try {
    const movieEvent = {
      info: {
        fieldName: 'getAvailableGenres'
      },
      arguments: {
        mediaType: 'MOVIE'
      }
    };

    const movieResult = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(movieEvent)
    }).promise();

    const movieResponse = JSON.parse(movieResult.Payload);
    
    if (movieResponse && Array.isArray(movieResponse)) {
      console.log(`✅ MOVIE genres loaded: ${movieResponse.length} genres`);
      console.log('First 5 movie genres:');
      movieResponse.slice(0, 5).forEach(genre => {
        console.log(`  - ${genre.name} (ID: ${genre.id})`);
      });
    } else {
      console.log('❌ Unexpected movie response format');
      console.log('Response:', JSON.stringify(movieResponse, null, 2));
    }
  } catch (error) {
    console.error('❌ Error testing MOVIE genres:', error.message);
  }

  console.log('\n📺 Testing TV genres...');
  try {
    const tvEvent = {
      info: {
        fieldName: 'getAvailableGenres'
      },
      arguments: {
        mediaType: 'TV'
      }
    };

    const tvResult = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(tvEvent)
    }).promise();

    const tvResponse = JSON.parse(tvResult.Payload);
    
    if (tvResponse && Array.isArray(tvResponse)) {
      console.log(`✅ TV genres loaded: ${tvResponse.length} genres`);
      console.log('First 5 TV genres:');
      tvResponse.slice(0, 5).forEach(genre => {
        console.log(`  - ${genre.name} (ID: ${genre.id})`);
      });
    } else {
      console.log('❌ Unexpected TV response format');
      console.log('Response:', JSON.stringify(tvResponse, null, 2));
    }
  } catch (error) {
    console.error('❌ Error testing TV genres:', error.message);
  }
}

// Run the test
testGetAvailableGenres().catch(console.error);
