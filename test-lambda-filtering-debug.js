#!/usr/bin/env node

/**
 * Debug Lambda Filtering Issue
 * 
 * Test the movie Lambda function directly to see why it's returning 0 items
 * for Animation + Comedy genres.
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1'
});

const lambda = new AWS.Lambda();

async function testLambdaFiltering() {
  try {
    console.log('🧪 Testing Lambda Filtering for Animation + Comedy...');
    console.log('');

    // Test the movie Lambda function directly
    const functionName = 'trinity-movie-dev';
    
    // Test payload for Animation (16) + Comedy (35)
    const testPayload = {
      field: 'getFilteredContent',
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [16, 35],
        limit: 30,
        excludeIds: []
      },
      identity: {
        sub: 'test-user',
        username: 'test-user'
      },
      source: {},
      request: {
        headers: {}
      }
    };

    console.log('📤 Invoking Lambda function:', functionName);
    console.log('📋 Payload:', JSON.stringify(testPayload, null, 2));
    console.log('');

    const result = await lambda.invoke({
      FunctionName: functionName,
      Payload: JSON.stringify(testPayload)
    }).promise();

    const response = JSON.parse(result.Payload);
    
    console.log('📥 Lambda Response:');
    console.log('Status Code:', result.StatusCode);
    console.log('');

    if (response.errorMessage) {
      console.error('❌ Lambda Error:', response.errorMessage);
      console.error('Error Type:', response.errorType);
      if (response.stackTrace) {
        console.error('Stack Trace:', response.stackTrace.join('\n'));
      }
    } else {
      console.log('✅ Lambda executed successfully');
      console.log('');
      
      if (Array.isArray(response)) {
        console.log(`📊 Results: ${response.length} movies found`);
        
        if (response.length > 0) {
          console.log('');
          console.log('🎬 Sample movies:');
          response.slice(0, 5).forEach((movie, index) => {
            console.log(`  ${index + 1}. ${movie.title} (${movie.year || 'N/A'})`);
            console.log(`     Genres: ${movie.genres ? movie.genres.join(', ') : 'N/A'}`);
            console.log(`     TMDB ID: ${movie.tmdbId || movie.id}`);
            console.log('');
          });
        } else {
          console.log('❌ No movies returned - this is the problem!');
          console.log('');
          console.log('🔍 Possible causes:');
          console.log('  1. TMDB API key not working');
          console.log('  2. No movies match Animation + Comedy genres');
          console.log('  3. Lambda function filtering logic issue');
          console.log('  4. TMDB API rate limiting');
        }
      } else {
        console.log('📋 Response format:', typeof response);
        console.log('Response:', JSON.stringify(response, null, 2));
      }
    }

    // Test with individual genres
    console.log('');
    console.log('🔍 Testing individual genres...');
    
    // Test Animation only
    const animationPayload = {
      ...testPayload,
      arguments: {
        ...testPayload.arguments,
        genreIds: [16] // Animation only
      }
    };

    console.log('📤 Testing Animation only (genre 16)...');
    const animationResult = await lambda.invoke({
      FunctionName: functionName,
      Payload: JSON.stringify(animationPayload)
    }).promise();

    const animationResponse = JSON.parse(animationResult.Payload);
    
    if (Array.isArray(animationResponse)) {
      console.log(`✅ Animation only: ${animationResponse.length} movies found`);
    } else {
      console.log('❌ Animation test failed:', animationResponse.errorMessage || 'Unknown error');
    }

    // Test Comedy only
    const comedyPayload = {
      ...testPayload,
      arguments: {
        ...testPayload.arguments,
        genreIds: [35] // Comedy only
      }
    };

    console.log('📤 Testing Comedy only (genre 35)...');
    const comedyResult = await lambda.invoke({
      FunctionName: functionName,
      Payload: JSON.stringify(comedyPayload)
    }).promise();

    const comedyResponse = JSON.parse(comedyResult.Payload);
    
    if (Array.isArray(comedyResponse)) {
      console.log(`✅ Comedy only: ${comedyResponse.length} movies found`);
    } else {
      console.log('❌ Comedy test failed:', comedyResponse.errorMessage || 'Unknown error');
    }

    console.log('');
    console.log('🎯 Analysis:');
    console.log('If individual genres work but combination doesn\'t:');
    console.log('  → Lambda is using AND logic (movies must have BOTH genres)');
    console.log('  → Very few movies are both Animation AND Comedy');
    console.log('  → Should use OR logic (movies with ANY of the selected genres)');
    console.log('');
    console.log('If no genres work:');
    console.log('  → TMDB API key or environment variable issue');
    console.log('  → Lambda function error');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testLambdaFiltering();
