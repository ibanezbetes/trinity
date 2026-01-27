#!/usr/bin/env node

/**
 * Test the getAvailableGenres function fix
 * This script tests both MOVIE and TV media types to ensure genres load correctly
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' }); // Using eu-west-1 based on the Lambda ARN

const lambda = new AWS.Lambda();

console.log('🧪 Testing getAvailableGenres function fix...');

async function testGetAvailableGenres() {
  try {
    console.log('');
    console.log('📽️ Testing MOVIE genres...');
    
    // Test MOVIE media type
    const movieEvent = {
      info: { fieldName: 'getAvailableGenres' },
      arguments: { mediaType: 'MOVIE' }
    };
    
    const movieResult = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(movieEvent)
    }).promise();
    
    const movieResponse = JSON.parse(movieResult.Payload);
    
    if (movieResult.StatusCode === 200 && !movieResponse.errorMessage) {
      console.log('✅ MOVIE genres loaded successfully!');
      console.log(`📊 Found ${movieResponse.length || 0} movie genres`);
      if (movieResponse.length > 0) {
        console.log('🎬 Sample genres:', movieResponse.slice(0, 3).map(g => g.name).join(', '));
      }
    } else {
      console.log('❌ MOVIE genres failed:', movieResponse.errorMessage || 'Unknown error');
    }
    
    console.log('');
    console.log('📺 Testing TV genres...');
    
    // Test TV media type
    const tvEvent = {
      info: { fieldName: 'getAvailableGenres' },
      arguments: { mediaType: 'TV' }
    };
    
    const tvResult = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(tvEvent)
    }).promise();
    
    const tvResponse = JSON.parse(tvResult.Payload);
    
    if (tvResult.StatusCode === 200 && !tvResponse.errorMessage) {
      console.log('✅ TV genres loaded successfully!');
      console.log(`📊 Found ${tvResponse.length || 0} TV genres`);
      if (tvResponse.length > 0) {
        console.log('📺 Sample genres:', tvResponse.slice(0, 3).map(g => g.name).join(', '));
      }
    } else {
      console.log('❌ TV genres failed:', tvResponse.errorMessage || 'Unknown error');
    }
    
    console.log('');
    console.log('🎉 Test completed!');
    console.log('');
    console.log('📱 Next steps:');
    console.log('1. Open the mobile app');
    console.log('2. Go to create room modal');
    console.log('3. Switch between "Películas" and "Series"');
    console.log('4. Verify that genres load without the "Operación no soportada" error');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'ResourceNotFoundException') {
      console.log('');
      console.log('💡 Make sure the Lambda function name is correct: trinity-movie-dev');
    }
    
    process.exit(1);
  }
}

testGetAvailableGenres();
