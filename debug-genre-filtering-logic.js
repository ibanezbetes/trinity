/**
 * Debug Genre Filtering Logic Issue
 * 
 * This script tests the current genre filtering implementation to identify
 * why content with only some genres (not all) is being returned when
 * AND logic should be applied.
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function debugGenreFiltering() {
  console.log('🔍 Debugging Genre Filtering Logic...\n');

  try {
    // Test case: Animation (16) + Comedy (35) for TV content
    // This should only return content that has BOTH genres
    const testEvent = {
      info: { fieldName: 'getFilteredContent' },
      arguments: {
        mediaType: 'TV',
        genreIds: [16, 35], // Animation + Comedy
        limit: 10,
        excludeIds: []
      }
    };

    console.log('📡 Testing with Animation + Comedy for TV...');
    console.log('Expected: Only content with BOTH Animation AND Comedy genres');
    console.log('Actual behavior: Let\'s see what we get...\n');

    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(testEvent)
    }).promise();

    const response = JSON.parse(result.Payload);
    
    if (response.errorMessage) {
      console.error('❌ Lambda Error:', response.errorMessage);
      return;
    }

    const content = response;
    console.log(`📊 Retrieved ${content.length} items\n`);

    // Analyze the first few items to see their genre composition
    console.log('🔍 Analyzing genre composition of returned content:');
    console.log('=' .repeat(60));
    
    for (let i = 0; i < Math.min(5, content.length); i++) {
      const item = content[i];
      console.log(`\n${i + 1}. ${item.title}`);
      console.log(`   Media Type: ${item.mediaType}`);
      console.log(`   TMDB ID: ${item.tmdbId}`);
      
      // We need to check the actual TMDB data to see the genres
      // Since the returned data doesn't include genre_ids, let's make a direct TMDB call
      await checkTMDBGenres(item.tmdbId, item.mediaType);
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎯 Analysis Summary:');
    console.log('- If items above show content with only Comedy OR only Animation,');
    console.log('  then the AND logic is NOT working correctly.');
    console.log('- Expected: All items should have BOTH Animation (16) AND Comedy (35)');

  } catch (error) {
    console.error('❌ Error during debugging:', error);
  }
}

async function checkTMDBGenres(tmdbId, mediaType) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.log('   ⚠️ TMDB_API_KEY not available for genre check');
    return;
  }

  try {
    const endpoint = mediaType.toLowerCase() === 'tv' ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${apiKey}&language=es-ES`;
    
    const fetch = globalThis.fetch || require('node-fetch');
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log(`   ⚠️ Failed to fetch TMDB data: ${response.status}`);
      return;
    }

    const data = await response.json();
    const genres = data.genres || [];
    const genreIds = genres.map(g => g.id);
    const genreNames = genres.map(g => g.name);
    
    console.log(`   Genres: [${genreIds.join(', ')}] - ${genreNames.join(', ')}`);
    
    // Check if it has both Animation (16) and Comedy (35)
    const hasAnimation = genreIds.includes(16);
    const hasComedy = genreIds.includes(35);
    
    if (hasAnimation && hasComedy) {
      console.log('   ✅ HAS BOTH Animation AND Comedy (correct for AND logic)');
    } else if (hasAnimation || hasComedy) {
      console.log('   ❌ HAS ONLY ONE of the genres (indicates OR logic issue)');
    } else {
      console.log('   ❌ HAS NEITHER genre (indicates fallback content)');
    }
    
  } catch (error) {
    console.log(`   ⚠️ Error checking TMDB genres: ${error.message}`);
  }
}

// Run the debug
debugGenreFiltering().catch(console.error);
