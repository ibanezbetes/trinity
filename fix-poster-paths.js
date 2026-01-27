#!/usr/bin/env node

/**
 * Fix Poster Paths in Lambda Function
 * 
 * Test and fix the poster path construction in the movie Lambda function
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1'
});

const lambda = new AWS.Lambda();

async function fixPosterPaths() {
  try {
    console.log('🖼️ Testing poster paths in Lambda function...');
    console.log('');

    // Test the Lambda function with the exact same excludeIds that the mobile app is sending
    const testPayload = {
      info: {
        fieldName: 'getFilteredContent'
      },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [16, 35], // Animation + Comedy
        limit: 5,
        excludeIds: ['movie-803796', 'movie-809', 'movie-14160', 'movie-585'] // Same format as mobile app
      },
      identity: {
        sub: 'test-user'
      },
      source: {},
      request: {
        headers: {}
      }
    };

    console.log('📤 Testing Lambda with real mobile app exclusions...');
    
    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(testPayload)
    }).promise();

    const response = JSON.parse(result.Payload);
    
    if (response.errorMessage) {
      console.log('❌ Lambda error:', response.errorMessage);
      return;
    }

    if (Array.isArray(response) && response.length > 0) {
      console.log(`✅ Lambda returned ${response.length} movies`);
      console.log('');
      console.log('🖼️ Poster path analysis:');
      
      response.forEach((movie, index) => {
        console.log(`${index + 1}. ${movie.title}`);
        console.log(`   posterPath: ${movie.posterPath || 'NULL'}`);
        console.log(`   mediaPosterPath: ${movie.mediaPosterPath || 'NULL'}`);
        console.log(`   poster: ${movie.poster || 'NULL'}`);
        
        // Show all poster-related fields
        console.log(`   All poster fields:`, {
          posterPath: movie.posterPath,
          mediaPosterPath: movie.mediaPosterPath,
          poster: movie.poster
        });
        
        // Check if the movie has any poster-related fields
        const hasAnyPoster = movie.posterPath || movie.mediaPosterPath || movie.poster;
        console.log(`   Has poster: ${hasAnyPoster ? '✅' : '❌'}`);
        console.log('');
      });
      
      // Count movies with and without posters
      const withPosters = response.filter(m => m.posterPath || m.mediaPosterPath || m.poster).length;
      const withoutPosters = response.length - withPosters;
      
      console.log('📊 Poster statistics:');
      console.log(`  Movies with posters: ${withPosters}/${response.length}`);
      console.log(`  Movies without posters: ${withoutPosters}/${response.length}`);
      
      if (withoutPosters > withPosters) {
        console.log('');
        console.log('🔍 Analysis: Most movies are missing posters');
        console.log('💡 Possible causes:');
        console.log('  1. Lambda is not constructing full TMDB poster URLs');
        console.log('  2. TMDB API is not returning poster_path for these movies');
        console.log('  3. ContentFilterService is not handling poster paths correctly');
        console.log('');
        console.log('🔧 Recommended fixes:');
        console.log('  1. Update Lambda to construct full TMDB URLs: https://image.tmdb.org/t/p/w500{poster_path}');
        console.log('  2. Add fallback poster for movies without images');
        console.log('  3. Verify TMDB API response includes poster_path');
      } else {
        console.log('');
        console.log('✅ Most movies have posters - this might be a temporary TMDB issue');
      }
      
    } else {
      console.log('❌ No movies returned or invalid response format');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

fixPosterPaths();
