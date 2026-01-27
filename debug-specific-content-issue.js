/**
 * Debug Specific Content Issue
 * 
 * The user mentioned seeing "Friends" and "Modern Family" in a room
 * configured for Animation + Comedy, but these shows are Comedy only.
 * Let's investigate what's happening.
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function debugSpecificContentIssue() {
  console.log('🔍 Debugging Specific Content Issue...\n');

  try {
    // Test case: Animation (16) + Comedy (35) for TV content
    // Let's get more results to see if we get Priority 2 or 3 content
    const testEvent = {
      info: { fieldName: 'getFilteredContent' },
      arguments: {
        mediaType: 'TV',
        genreIds: [16, 35], // Animation + Comedy
        limit: 30, // Get more results to see different priority levels
        excludeIds: []
      }
    };

    console.log('📡 Testing with Animation + Comedy for TV (30 results)...');
    console.log('Looking for Priority 2 (OR logic) or Priority 3 (popular) content...\n');

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

    // Analyze ALL items to see their genre composition and priority
    console.log('🔍 Analyzing ALL returned content:');
    console.log('=' .repeat(80));
    
    let priority1Count = 0;
    let priority2Count = 0;
    let priority3Count = 0;
    
    for (let i = 0; i < content.length; i++) {
      const item = content[i];
      console.log(`\n${i + 1}. ${item.title}`);
      console.log(`   Media Type: ${item.mediaType}`);
      console.log(`   TMDB ID: ${item.tmdbId}`);
      
      const genreAnalysis = await checkTMDBGenres(item.tmdbId, item.mediaType);
      
      if (genreAnalysis.hasAnimation && genreAnalysis.hasComedy) {
        priority1Count++;
        console.log('   🥇 PRIORITY 1: Has BOTH Animation AND Comedy');
      } else if (genreAnalysis.hasAnimation || genreAnalysis.hasComedy) {
        priority2Count++;
        console.log('   🥈 PRIORITY 2: Has ONLY ONE of the genres (OR logic)');
      } else {
        priority3Count++;
        console.log('   🥉 PRIORITY 3: Has NEITHER genre (popular fallback)');
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 Priority Distribution:');
    console.log(`   🥇 Priority 1 (AND logic): ${priority1Count} items`);
    console.log(`   🥈 Priority 2 (OR logic): ${priority2Count} items`);
    console.log(`   🥉 Priority 3 (Popular): ${priority3Count} items`);
    
    console.log('\n🎯 Analysis:');
    if (priority2Count > 0 || priority3Count > 0) {
      console.log('❌ ISSUE FOUND: System is returning Priority 2/3 content');
      console.log('   This explains why user sees content with only Comedy (not Animation)');
      console.log('   The system should prioritize Priority 1 content first');
    } else {
      console.log('✅ All content follows Priority 1 (AND logic) correctly');
    }

  } catch (error) {
    console.error('❌ Error during debugging:', error);
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

// Run the debug
debugSpecificContentIssue().catch(console.error);
