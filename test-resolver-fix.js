#!/usr/bin/env node

/**
 * Test Resolver Fix
 * 
 * Test the fixed getFilteredContent resolver
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1'
});

async function testResolverFix() {
  try {
    console.log('🧪 Testing fixed getFilteredContent resolver...');
    console.log('');

    const lambda = new AWS.Lambda();
    
    // Test the Lambda function with the new payload structure
    const testPayload = {
      info: {
        fieldName: 'getFilteredContent'
      },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [35, 16], // Comedy + Animation
        limit: 5,
        excludeIds: []
      },
      identity: {
        sub: 'test-user'
      },
      source: {},
      request: {
        headers: {}
      }
    };

    console.log('📤 Testing Lambda with fixed payload structure...');
    console.log('🎬 Requesting: Comedy (35) + Animation (16) movies');
    
    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(testPayload)
    }).promise();

    const response = JSON.parse(result.Payload);
    
    if (response.errorMessage) {
      console.log('❌ Lambda error:', response.errorMessage);
      console.log('Error type:', response.errorType);
    } else if (Array.isArray(response)) {
      console.log(`✅ Lambda returned ${response.length} movies`);
      
      if (response.length > 0) {
        console.log('');
        console.log('🎬 Sample Comedy + Animation movies:');
        response.slice(0, 3).forEach((movie, index) => {
          console.log(`  ${index + 1}. ${movie.title} (${movie.year || 'N/A'})`);
          console.log(`     Overview: ${movie.overview ? movie.overview.substring(0, 80) + '...' : 'N/A'}`);
          console.log(`     Rating: ${movie.rating || 'N/A'}`);
          console.log('');
        });
      }
    } else {
      console.log('📋 Unexpected response format:', typeof response);
      console.log('Response:', JSON.stringify(response, null, 2));
    }
    
    console.log('');
    console.log('🎉 RESOLVER FIX TEST COMPLETE!');
    console.log('');
    console.log('📱 Expected mobile app behavior:');
    console.log('1. No more "Operación no soportada: undefined" errors');
    console.log('2. getFilteredContent returns real TMDB movies');
    console.log('3. Movies match Comedy + Animation genres');
    console.log('4. Advanced filtering system fully operational');
    console.log('');
    console.log('🔄 Next steps:');
    console.log('1. Test the mobile app again');
    console.log('2. Create a new room with Comedy + Animation');
    console.log('3. Verify real animated comedies appear');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testResolverFix();
