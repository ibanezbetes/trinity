#!/usr/bin/env node

/**
 * Test the media type filtering fix
 * This script tests that TV content returns TV shows and MOVIE content returns movies
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: 'eu-west-1' });

const lambda = new AWS.Lambda();

console.log('🧪 Testing media type filtering fix...');

async function testMediaTypeFiltering() {
  try {
    console.log('');
    console.log('📺 Testing TV content filtering...');
    
    // Test TV media type with Comedy + Animation genres (35, 16)
    const tvEvent = {
      info: { fieldName: 'getFilteredContent' },
      arguments: { 
        mediaType: 'TV', 
        genreIds: [35, 16], // Comedy + Animation for TV
        limit: 5,
        excludeIds: []
      }
    };
    
    const tvResult = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(tvEvent)
    }).promise();
    
    const tvResponse = JSON.parse(tvResult.Payload);
    
    if (tvResult.StatusCode === 200 && !tvResponse.errorMessage) {
      console.log('✅ TV content loaded successfully!');
      console.log(`📊 Found ${tvResponse.length || 0} TV items`);
      
      if (tvResponse.length > 0) {
        const firstItem = tvResponse[0];
        console.log(`🔍 First item details:`);
        console.log(`   - ID: ${firstItem.id}`);
        console.log(`   - Title: ${firstItem.title}`);
        console.log(`   - MediaType: ${firstItem.mediaType}`);
        console.log(`   - Year: ${firstItem.year}`);
        
        // Verify mediaType is correct
        if (firstItem.mediaType === 'tv') {
          console.log('✅ MediaType is correctly set to "tv"');
        } else {
          console.log(`❌ MediaType is wrong: expected "tv", got "${firstItem.mediaType}"`);
        }
        
        // Verify ID format
        if (firstItem.id.startsWith('tv-')) {
          console.log('✅ ID format is correct (starts with "tv-")');
        } else {
          console.log(`❌ ID format is wrong: expected "tv-*", got "${firstItem.id}"`);
        }
      }
    } else {
      console.log('❌ TV content failed:', tvResponse.errorMessage || 'Unknown error');
    }
    
    console.log('');
    console.log('🎬 Testing MOVIE content filtering...');
    
    // Test MOVIE media type with Action + Adventure genres (28, 12)
    const movieEvent = {
      info: { fieldName: 'getFilteredContent' },
      arguments: { 
        mediaType: 'MOVIE', 
        genreIds: [28, 12], // Action + Adventure for movies
        limit: 5,
        excludeIds: []
      }
    };
    
    const movieResult = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(movieEvent)
    }).promise();
    
    const movieResponse = JSON.parse(movieResult.Payload);
    
    if (movieResult.StatusCode === 200 && !movieResponse.errorMessage) {
      console.log('✅ MOVIE content loaded successfully!');
      console.log(`📊 Found ${movieResponse.length || 0} movie items`);
      
      if (movieResponse.length > 0) {
        const firstItem = movieResponse[0];
        console.log(`🔍 First item details:`);
        console.log(`   - ID: ${firstItem.id}`);
        console.log(`   - Title: ${firstItem.title}`);
        console.log(`   - MediaType: ${firstItem.mediaType}`);
        console.log(`   - Year: ${firstItem.year}`);
        
        // Verify mediaType is correct
        if (firstItem.mediaType === 'movie') {
          console.log('✅ MediaType is correctly set to "movie"');
        } else {
          console.log(`❌ MediaType is wrong: expected "movie", got "${firstItem.mediaType}"`);
        }
        
        // Verify ID format
        if (firstItem.id.startsWith('movie-')) {
          console.log('✅ ID format is correct (starts with "movie-")');
        } else {
          console.log(`❌ ID format is wrong: expected "movie-*", got "${firstItem.id}"`);
        }
      }
    } else {
      console.log('❌ MOVIE content failed:', movieResponse.errorMessage || 'Unknown error');
    }
    
    console.log('');
    console.log('🎉 Media type filtering test completed!');
    console.log('');
    console.log('📱 Next steps:');
    console.log('1. Open the mobile app');
    console.log('2. Create a room with TV media type and select genres');
    console.log('3. Verify that TV shows are displayed (not movies)');
    console.log('4. Create a room with MOVIE media type and select genres');
    console.log('5. Verify that movies are displayed (not TV shows)');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'ResourceNotFoundException') {
      console.log('');
      console.log('💡 Make sure the Lambda function name is correct: trinity-movie-dev');
    }
    
    process.exit(1);
  }
}

testMediaTypeFiltering();
