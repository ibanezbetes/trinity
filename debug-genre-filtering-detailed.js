/**
 * Debug Genre Filtering - Detailed Analysis
 * 
 * Analyzes the genre filtering in detail to see what's happening
 */

const AWS = require('aws-sdk');

// AWS Configuration
const lambda = new AWS.Lambda({ region: 'eu-west-1' });

async function debugGenreFiltering() {
  try {
    console.log('🔍 Debugging Genre Filtering in Detail...');
    console.log('');

    // Test with detailed logging
    const payload = {
      info: { fieldName: 'getFilteredContent' },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [16, 35], // Animación + Comedia
        limit: 5
      }
    };

    console.log('🎯 Testing with Animación (16) + Comedia (35)');
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
      console.log('📋 Lambda Logs:');
      console.log('================');
      console.log(logs);
      console.log('================');
      console.log('');
    }

    const response = JSON.parse(result.Payload);
    
    if (response.errorMessage) {
      console.error('❌ Error:', response.errorMessage);
      return;
    }

    const movies = response || [];
    console.log(`✅ Received ${movies.length} movies`);
    console.log('');

    if (movies.length > 0) {
      console.log('🎬 Detailed Movie Analysis:');
      movies.forEach((movie, index) => {
        console.log(`${index + 1}. ${movie.title || movie.mediaTitle}`);
        console.log(`   Year: ${movie.year || movie.mediaYear}`);
        console.log(`   Rating: ${movie.rating || movie.mediaRating}`);
        console.log(`   TMDB ID: ${movie.tmdbId}`);
        console.log(`   Overview: ${(movie.overview || movie.mediaOverview || '').substring(0, 150)}...`);
        console.log('');
      });
    }

    // Now let's test the TMDB API directly to see what genres these movies actually have
    console.log('🔍 Checking actual genres from TMDB API...');
    if (movies.length > 0) {
      await checkMovieGenresDirectly(movies[0].tmdbId);
    }

  } catch (error) {
    console.error('❌ Error debugging genre filtering:', error);
    throw error;
  }
}

async function checkMovieGenresDirectly(tmdbId) {
  try {
    const apiKey = process.env.TMDB_API_KEY || '4b5b3c0c8c0e4f1a9b2d3e4f5a6b7c8d'; // Fallback key
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&language=es-ES`;
    
    console.log(`🌐 Fetching movie details for TMDB ID: ${tmdbId}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`⚠️ Could not fetch movie details: ${response.status}`);
      return;
    }
    
    const movieData = await response.json();
    
    console.log(`🎬 Movie: ${movieData.title}`);
    console.log(`📅 Release Date: ${movieData.release_date}`);
    console.log(`🎭 Genres:`, movieData.genres.map(g => `${g.name} (${g.id})`).join(', '));
    console.log(`🌍 Original Language: ${movieData.original_language}`);
    console.log(`📝 Overview: ${movieData.overview?.substring(0, 200)}...`);
    
    // Check if it has the requested genres
    const hasAnimation = movieData.genres.some(g => g.id === 16);
    const hasComedy = movieData.genres.some(g => g.id === 35);
    
    console.log('');
    console.log('🔍 Genre Analysis:');
    console.log(`   Has Animación (16): ${hasAnimation ? '✅' : '❌'}`);
    console.log(`   Has Comedia (35): ${hasComedy ? '✅' : '❌'}`);
    console.log(`   Should be included in AND logic: ${hasAnimation && hasComedy ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('❌ Error checking movie genres directly:', error);
  }
}

// Run the debug
if (require.main === module) {
  debugGenreFiltering()
    .then(() => {
      console.log('🎉 Debug completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Debug failed:', error);
      process.exit(1);
    });
}

module.exports = { debugGenreFiltering };
