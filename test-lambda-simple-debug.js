#!/usr/bin/env node

/**
 * Simple Lambda Debug Test
 * 
 * Test the Lambda function with a simpler approach to see what's happening
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1'
});

const lambda = new AWS.Lambda();

async function testLambdaSimple() {
  try {
    console.log('🧪 Testing Lambda Function Simple Debug...');
    console.log('');

    const functionName = 'trinity-movie-dev';
    
    // Test 1: Check if getMovies works (existing functionality)
    console.log('📤 Test 1: Testing getMovies (existing functionality)...');
    const getMoviesPayload = {
      info: {
        fieldName: 'getMovies'
      },
      arguments: {
        genre: 'comedy',
        page: 1
      }
    };

    const getMoviesResult = await lambda.invoke({
      FunctionName: functionName,
      Payload: JSON.stringify(getMoviesPayload)
    }).promise();

    const getMoviesResponse = JSON.parse(getMoviesResult.Payload);
    
    if (getMoviesResponse.errorMessage) {
      console.log('❌ getMovies failed:', getMoviesResponse.errorMessage);
    } else {
      console.log(`✅ getMovies works: ${Array.isArray(getMoviesResponse) ? getMoviesResponse.length : 'unknown'} results`);
    }

    console.log('');

    // Test 2: Check if getFilteredContent works
    console.log('📤 Test 2: Testing getFilteredContent...');
    const getFilteredPayload = {
      info: {
        fieldName: 'getFilteredContent'
      },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [35], // Comedy only
        limit: 10,
        excludeIds: []
      }
    };

    const getFilteredResult = await lambda.invoke({
      FunctionName: functionName,
      Payload: JSON.stringify(getFilteredPayload)
    }).promise();

    const getFilteredResponse = JSON.parse(getFilteredResult.Payload);
    
    if (getFilteredResponse.errorMessage) {
      console.log('❌ getFilteredContent failed:', getFilteredResponse.errorMessage);
      console.log('Error type:', getFilteredResponse.errorType);
      
      // Check if it's a ContentFilterService issue
      if (getFilteredResponse.errorMessage.includes('ContentFilterService') || 
          getFilteredResponse.errorMessage.includes('createFilteredRoom')) {
        console.log('');
        console.log('🔍 Analysis: ContentFilterService is not working properly');
        console.log('💡 Solution: Use direct TMDB API calls instead of ContentFilterService');
      }
    } else {
      console.log(`✅ getFilteredContent works: ${Array.isArray(getFilteredResponse) ? getFilteredResponse.length : 'unknown'} results`);
    }

    console.log('');

    // Test 3: Check environment variables
    console.log('📤 Test 3: Checking Lambda environment...');
    
    try {
      const configResult = await lambda.getFunctionConfiguration({
        FunctionName: functionName
      }).promise();
      
      const envVars = configResult.Environment?.Variables || {};
      
      console.log('🔧 Environment Variables:');
      console.log(`  TMDB_API_KEY: ${envVars.TMDB_API_KEY ? '✅ Set' : '❌ Missing'}`);
      console.log(`  MOVIES_CACHE_TABLE: ${envVars.MOVIES_CACHE_TABLE ? '✅ Set' : '❌ Missing'}`);
      console.log(`  ROOMS_TABLE: ${envVars.ROOMS_TABLE ? '✅ Set' : '❌ Missing'}`);
      
    } catch (configError) {
      console.log('⚠️ Could not check environment variables:', configError.message);
    }

    console.log('');
    console.log('🎯 Recommendations:');
    console.log('1. If getMovies works but getFilteredContent fails:');
    console.log('   → ContentFilterService dependency issue');
    console.log('   → Use direct TMDB API calls in getFilteredContent');
    console.log('');
    console.log('2. If both fail:');
    console.log('   → TMDB_API_KEY environment variable issue');
    console.log('   → Lambda function deployment issue');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testLambdaSimple();
