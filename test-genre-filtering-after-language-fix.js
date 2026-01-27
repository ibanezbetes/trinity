/**
 * Test Genre Filtering After Language Fix
 * 
 * Testing if removing the API-level language filter fixes genre filtering
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function testGenreFilteringAfterLanguageFix() {
  console.log('🔍 Testing Genre Filtering After Language Fix...\n');

  try {
    // Test case: Animation (16) + Comedy (35) for TV content
    const testEvent = {
      info: { fieldName: 'getFilteredContent' },
      arguments: {
        mediaType: 'TV',
        genreIds: [16, 35], // Animation + Comedy
        limit: 10, // Small test first
        excludeIds: []
      }
    };

    console.log('📡 Testing with Animation + Comedy for TV...');
    console.log('Checking if genre filtering works after removing API-level language filter...\n');

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

    // Analyze first few items to see their genre composition
    console.log('🔍 Analyzing returned content:');
    console.log('=' .repeat(60));
    
    for (let i = 0; i < Math.min(5, content.length); i++) {
      const item = content[i];
      console.log(`\n${i + 1}. ${item.title}`);
      console.log(`   Media Type: ${item.mediaType}`);
      console.log(`   TMDB ID: ${item.tmdbId}`);
      
      const genreAnalysis = await checkTMDBGenres(item.tmdbId, item.mediaType);
      
      if (genreAnalysis.hasAnimation && genreAnalysis.hasComedy) {
        console.log('   ✅ Has BOTH Animation AND Comedy (Priority 1)');
      } else if (genreAnalysis.hasAnimation || genreAnalysis.hasComedy) {
        console.log('   ⚠️ Has ONLY ONE of the genres (Priority 2)');
      } else {
        console.log('   ❌ Has NEITHER genre (Priority 3 - should not appear first)');
      }
    }

  } catch (error) {
    console.error('❌ Error during testing:', error);
  }
}

async function checkTMDBGenres(tmdbId, mediaType) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return { hasAnimation: false, hasComedy: false, genres: [] };
  }

  try {
    const endpoint = mediaType.toLowerCase() === 'tv' ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${apiKey}&language=es-ES`;
    
    const fetch = globalThis.fetch || require('node-fetch');
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log(`   ⚠️ Failed to fetch TMDB data: ${response.status}`);
      return { hasAnimation: false, hasComedy: false, genres: [] };
    }

    const data = await response.json();
    const genres = data.genres || [];
    const genreIds = genres.map(g => g.id);
    const genreNames = genres.map(g => g.name);
    
    console.log(`   Genres: [${genreIds.join(', ')}] - ${genreNames.join(', ')}`);
    
    const hasAnimation = genreIds.includes(16);
    const hasComedy = genreIds.includes(35);
    
    return { hasAnimation, hasComedy, genres: genreIds };
    
  } catch (error) {
    console.log(`   ⚠️ Error checking TMDB genres: ${error.message}`);
    return { hasAnimation: false, hasComedy: false, genres: [] };
  }
}

// Run the test
testGenreFilteringAfterLanguageFix().catch(console.error);
