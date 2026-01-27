#!/usr/bin/env node

/**
 * Test Movie Exclusions Logic
 * 
 * Test that the Lambda function properly excludes already shown movies
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1'
});

const lambda = new AWS.Lambda();

async function testMovieExclusions() {
  try {
    console.log('🎬 Testing movie exclusions logic...');
    console.log('');

    // Test 1: Get movies without exclusions
    console.log('📤 Test 1: Getting movies WITHOUT exclusions...');
    
    const testPayload1 = {
      info: {
        fieldName: 'getFilteredContent'
      },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [16, 35], // Animation + Comedy
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

    const result1 = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(testPayload1)
    }).promise();

    const response1 = JSON.parse(result1.Payload);
    
    if (response1.errorMessage) {
      console.log('❌ Lambda error:', response1.errorMessage);
      return;
    }

    if (Array.isArray(response1) && response1.length > 0) {
      console.log(`✅ Test 1: Got ${response1.length} movies without exclusions`);
      
      const movieIds = response1.map(m => m.id);
      const movieTitles = response1.map(m => m.title);
      
      console.log('🎬 Movies returned:');
      response1.forEach((movie, index) => {
        console.log(`  ${index + 1}. ${movie.title} (ID: ${movie.id})`);
      });
      
      console.log('');
      
      // Test 2: Get movies WITH exclusions (exclude first 3 movies from test 1)
      console.log('📤 Test 2: Getting movies WITH exclusions...');
      console.log(`🚫 Excluding: ${movieIds.slice(0, 3).join(', ')}`);
      
      const testPayload2 = {
        info: {
          fieldName: 'getFilteredContent'
        },
        arguments: {
          mediaType: 'MOVIE',
          genreIds: [16, 35], // Animation + Comedy
          limit: 5,
          excludeIds: movieIds.slice(0, 3) // Exclude first 3 movies
        },
        identity: {
          sub: 'test-user'
        },
        source: {},
        request: {
          headers: {}
        }
      };

      const result2 = await lambda.invoke({
        FunctionName: 'trinity-movie-dev',
        Payload: JSON.stringify(testPayload2)
      }).promise();

      const response2 = JSON.parse(result2.Payload);
      
      if (response2.errorMessage) {
        console.log('❌ Lambda error:', response2.errorMessage);
        return;
      }

      if (Array.isArray(response2) && response2.length > 0) {
        console.log(`✅ Test 2: Got ${response2.length} movies with exclusions`);
        
        console.log('🎬 Movies returned (should be different):');
        response2.forEach((movie, index) => {
          console.log(`  ${index + 1}. ${movie.title} (ID: ${movie.id})`);
        });
        
        console.log('');
        
        // Verify exclusions worked
        const excludedIds = movieIds.slice(0, 3);
        const newMovieIds = response2.map(m => m.id);
        
        const foundExcluded = newMovieIds.filter(id => excludedIds.includes(id));
        
        if (foundExcluded.length === 0) {
          console.log('✅ EXCLUSION TEST PASSED: No excluded movies found in second result');
          console.log('✅ The exclusion logic is working correctly!');
        } else {
          console.log('❌ EXCLUSION TEST FAILED: Found excluded movies in second result:');
          foundExcluded.forEach(id => {
            const movie = response2.find(m => m.id === id);
            console.log(`  - ${movie.title} (ID: ${id})`);
          });
        }
        
        console.log('');
        console.log('📊 Summary:');
        console.log(`  Test 1 (no exclusions): ${response1.length} movies`);
        console.log(`  Test 2 (with exclusions): ${response2.length} movies`);
        console.log(`  Excluded movies: ${excludedIds.length}`);
        console.log(`  Overlap found: ${foundExcluded.length}`);
        
      } else {
        console.log('❌ Test 2: No movies returned or invalid response format');
      }
      
    } else {
      console.log('❌ Test 1: No movies returned or invalid response format');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testMovieExclusions();
