/**
 * Debug Lambda Detailed Filtering
 * 
 * Investigates in detail what's happening in the Lambda function
 * when filtering by genres Animation (16) + Comedy (35)
 */

const AWS = require('aws-sdk');

// AWS Configuration
const lambda = new AWS.Lambda({ region: 'eu-west-1' });

async function debugLambdaDetailedFiltering() {
  try {
    console.log('🔍 Debugging Lambda Detailed Filtering...');
    console.log('');

    // Test with detailed logging and specific genres
    const payload = {
      info: { fieldName: 'getFilteredContent' },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [16, 35], // Animation + Comedy
        limit: 10
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

    // Decode and show logs
    if (result.LogResult) {
      const logs = Buffer.from(result.LogResult, 'base64').toString();
      console.log('📋 Lambda Logs (Full):');
      console.log('=====================================');
      console.log(logs);
      console.log('=====================================');
      console.log('');
    }

    const response = JSON.parse(result.Payload);
    
    if (response.errorMessage) {
      console.error('❌ Error:', response.errorMessage);
      console.error('Stack trace:', response.errorType);
      return;
    }

    const movies = response || [];
    console.log(`✅ Received ${movies.length} movies`);
    console.log('');

    if (movies.length > 0) {
      console.log('🎬 Detailed Movie Analysis:');
      console.log('');
      
      for (let i = 0; i < Math.min(movies.length, 5); i++) {
        const movie = movies[i];
        console.log(`${i + 1}. ${movie.title || movie.mediaTitle}`);
        console.log(`   TMDB ID: ${movie.tmdbId}`);
        console.log(`   Year: ${movie.year || movie.mediaYear}`);
        console.log(`   Rating: ${movie.rating || movie.mediaRating}`);
        console.log(`   Overview: ${(movie.overview || movie.mediaOverview || '').substring(0, 200)}...`);
        
        // Check actual genres from TMDB
        await checkMovieGenresDirectly(movie.tmdbId, i + 1);
        console.log('');
      }
    }

    // Now let's test individual genre filtering
    console.log('🔍 Testing individual genre filtering...');
    await testIndividualGenre(16, 'Animation');
    await testIndividualGenre(35, 'Comedy');

  } catch (error) {
    console.error('❌ Error debugging lambda filtering:', error);
    throw error;
  }
}

async function testIndividualGenre(genreId, genreName) {
  try {
    console.log(`\n🎭 Testing single genre: ${genreName} (${genreId})`);
    
    const payload = {
      info: { fieldName: 'getFilteredContent' },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [genreId],
        limit: 3
      }
    };

    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(payload)
    }).promise();

    const response = JSON.parse(result.Payload);
    const movies = response || [];
    
    console.log(`   Received ${movies.length} movies for ${genreName}`);
    if (movies.length > 0) {
      const movie = movies[0];
      console.log(`   Sample: ${movie.title || movie.mediaTitle} (TMDB: ${movie.tmdbId})`);
      await checkMovieGenresDirectly(movie.tmdbId, `${genreName} sample`);
    }
    
  } catch (error) {
    console.error(`❌ Error testing ${genreName}:`, error);
  }
}

async function checkMovieGenresDirectly(tmdbId, movieNumber) {
  try {
    const apiKey = process.env.TMDB_API_KEY || '4b5b3c0c8c0e4f1a9b2d3e4f5a6b7c8d';
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&language=es-ES`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`   ⚠️ Could not fetch TMDB details: ${response.status}`);
      return;
    }
    
    const movieData = await response.json();
    
    console.log(`   🎭 Actual Genres: ${movieData.genres.map(g => `${g.name} (${g.id})`).join(', ')}`);
    console.log(`   🌍 Language: ${movieData.original_language}`);
    
    // Check if it has the requested genres
    const hasAnimation = movieData.genres.some(g => g.id === 16);
    const hasComedy = movieData.genres.some(g => g.id === 35);
    
    console.log(`   ✅ Has Animation (16): ${hasAnimation ? 'YES' : 'NO'}`);
    console.log(`   ✅ Has Comedy (35): ${hasComedy ? 'YES' : 'NO'}`);
    
    if (!hasAnimation && !hasComedy) {
      console.log(`   🚨 ERROR: This movie should NOT be returned for Animation+Comedy filter!`);
    }
    
  } catch (error) {
    console.error(`   ❌ Error checking TMDB for ${tmdbId}:`, error.message);
  }
}

// Run the debug
if (require.main === module) {
  debugLambdaDetailedFiltering()
    .then(() => {
      console.log('🎉 Debug completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Debug failed:', error);
      process.exit(1);
    });
}

module.exports = { debugLambdaDetailedFiltering };
