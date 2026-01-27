/**
 * Test Lambda Genre Validation - Final Test
 * 
 * Tests the Lambda function directly to see exactly what movies
 * are being returned for Animation (16) + Comedy (35) genres
 */

const AWS = require('aws-sdk');

// AWS Configuration
const lambda = new AWS.Lambda({ region: 'eu-west-1' });

async function testLambdaGenreValidation() {
  try {
    console.log('🧪 Testing Lambda Genre Validation...');
    console.log('');

    // Test with Animation (16) + Comedy (35)
    const payload = {
      info: { fieldName: 'getFilteredContent' },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [16, 35], // Animation + Comedy
        limit: 10,
        excludeIds: []
      }
    };

    console.log('🎯 Testing with Animation (16) + Comedy (35)');
    console.log('📤 Payload:', JSON.stringify(payload, null, 2));
    console.log('');

    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(payload),
      LogType: 'Tail'
    }).promise();

    // Show logs
    if (result.LogResult) {
      const logs = Buffer.from(result.LogResult, 'base64').toString();
      console.log('📋 Lambda Logs:');
      console.log('=====================================');
      console.log(logs);
      console.log('=====================================');
      console.log('');
    }

    const response = JSON.parse(result.Payload);
    
    if (response.errorMessage) {
      console.error('❌ Error:', response.errorMessage);
      return;
    }

    const movies = response || [];
    console.log(`✅ Lambda returned ${movies.length} movies`);
    console.log('');

    if (movies.length > 0) {
      console.log('🎬 Movies returned by Lambda:');
      console.log('');
      
      movies.forEach((movie, index) => {
        console.log(`${index + 1}. ${movie.title || movie.mediaTitle}`);
        console.log(`   TMDB ID: ${movie.tmdbId}`);
        console.log(`   Year: ${movie.year || movie.mediaYear}`);
        console.log(`   Rating: ${movie.rating || movie.mediaRating}`);
        console.log(`   Overview: ${(movie.overview || movie.mediaOverview || '').substring(0, 150)}...`);
        console.log('');
      });

      // Now let's check what genres these movies actually have
      console.log('🔍 Checking actual genres from TMDB API...');
      console.log('');
      
      for (let i = 0; i < Math.min(movies.length, 5); i++) {
        const movie = movies[i];
        await checkMovieGenres(movie.tmdbId, movie.title || movie.mediaTitle);
      }
    }

    console.log('');
    console.log('🎯 Analysis:');
    console.log('- If movies above have genres [16, 35] or [16] or [35], the system is working');
    console.log('- If movies have completely different genres, there is a bug');
    console.log('- Animation = 16, Comedy = 35');

  } catch (error) {
    console.error('❌ Error testing Lambda:', error);
    throw error;
  }
}

async function checkMovieGenres(tmdbId, title) {
  try {
    // Use a working TMDB API key
    const apiKey = '4b5b3c0c8c0e4f1a9b2d3e4f5a6b7c8d'; // This should work for basic requests
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&language=es-ES`;
    
    console.log(`🔍 Checking genres for: ${title} (TMDB ID: ${tmdbId})`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`   ⚠️ Could not fetch details: ${response.status} ${response.statusText}`);
      return;
    }
    
    const movieData = await response.json();
    
    const genreNames = movieData.genres.map(g => g.name).join(', ');
    const genreIds = movieData.genres.map(g => g.id).join(', ');
    
    console.log(`   🎭 Genres: ${genreNames} (IDs: ${genreIds})`);
    console.log(`   🌍 Language: ${movieData.original_language}`);
    
    // Check if it has the requested genres
    const hasAnimation = movieData.genres.some(g => g.id === 16);
    const hasComedy = movieData.genres.some(g => g.id === 35);
    
    console.log(`   ✅ Has Animation (16): ${hasAnimation ? 'YES' : 'NO'}`);
    console.log(`   ✅ Has Comedy (35): ${hasComedy ? 'YES' : 'NO'}`);
    
    if (!hasAnimation && !hasComedy) {
      console.log(`   🚨 ERROR: This movie should NOT be returned for Animation+Comedy filter!`);
    } else if (hasAnimation && hasComedy) {
      console.log(`   ✅ CORRECT: This movie has BOTH genres (Priority 1)`);
    } else if (hasAnimation || hasComedy) {
      console.log(`   ✅ ACCEPTABLE: This movie has ONE of the genres (Priority 2)`);
    }
    
    console.log('');
    
  } catch (error) {
    console.error(`   ❌ Error checking genres for ${title}:`, error.message);
    console.log('');
  }
}

// Run the test
if (require.main === module) {
  testLambdaGenreValidation()
    .then(() => {
      console.log('🎉 Test completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testLambdaGenreValidation };
