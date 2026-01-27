/**
 * Test Final Filtering Logic
 * 
 * Testing the complete filtering logic with:
 * - Western languages only
 * - Content with descriptions only
 * - Maximum 2 genres
 * - Priority 1: ALL genres (AND logic)
 * - Priority 2: ANY genre (OR logic)
 * - Priority 3: Popular fallback
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function testFinalFilteringLogic() {
  console.log('🔍 Testing Final Filtering Logic...\n');

  try {
    // Test case: Animation + Comedy for TV (2 genres maximum)
    const testEvent = {
      info: { fieldName: 'getFilteredContent' },
      arguments: {
        mediaType: 'TV',
        genreIds: [16, 35], // Animation + Comedy (2 genres)
        limit: 10, // Get 10 items to analyze
        excludeIds: []
      }
    };

    console.log('📡 Testing Animation + Comedy for TV (2 genres)...');
    console.log('Expected behavior:');
    console.log('  1. Priority 1: Content with BOTH Animation AND Comedy');
    console.log('  2. Priority 2: Content with Animation OR Comedy (if P1 < 30)');
    console.log('  3. Priority 3: Popular content (if P1+P2 < 30)');
    console.log('  4. All content should have descriptions');
    console.log('  5. All content should be in western languages\n');

    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(testEvent),
      LogType: 'Tail' // Get the logs
    }).promise();

    // Decode and display logs
    if (result.LogResult) {
      const logs = Buffer.from(result.LogResult, 'base64').toString();
      console.log('📋 Lambda Logs:');
      console.log('=' .repeat(80));
      console.log(logs);
      console.log('=' .repeat(80));
    }

    const response = JSON.parse(result.Payload);
    
    if (response.errorMessage) {
      console.error('\n❌ Lambda Error:', response.errorMessage);
      return;
    }

    const content = response;
    console.log(`\n📊 Retrieved ${content.length} items`);

    // Analyze each item
    console.log('\n🔍 Detailed Analysis:');
    let priority1Count = 0;
    let priority2Count = 0;
    let priority3Count = 0;
    let noDescriptionCount = 0;
    let nonWesternCount = 0;

    for (let i = 0; i < content.length; i++) {
      const item = content[i];
      console.log(`\n${i + 1}. ${item.title}`);
      console.log(`   TMDB ID: ${item.tmdbId}`);
      console.log(`   Media Type: ${item.mediaType}`);
      
      // Check actual TMDB data
      const tmdbData = await checkTMDBData(item.tmdbId, item.mediaType);
      
      console.log(`   Genres: [${tmdbData.genres.join(', ')}]`);
      console.log(`   Language: ${tmdbData.language}`);
      console.log(`   Has Description: ${tmdbData.hasDescription}`);
      
      // Check genre logic
      const hasAnimation = tmdbData.genres.includes(16);
      const hasComedy = tmdbData.genres.includes(35);
      
      if (hasAnimation && hasComedy) {
        priority1Count++;
        console.log('   ✅ Priority 1: Has BOTH Animation AND Comedy');
      } else if (hasAnimation || hasComedy) {
        priority2Count++;
        console.log('   🟡 Priority 2: Has Animation OR Comedy (but not both)');
      } else {
        priority3Count++;
        console.log('   🔵 Priority 3: Popular content (no target genres)');
      }
      
      // Check filters
      if (!tmdbData.hasDescription) {
        noDescriptionCount++;
        console.log('   ❌ NO DESCRIPTION - Should be filtered out!');
      }
      
      const westernLanguages = ['es', 'en', 'fr', 'it', 'pt', 'de'];
      if (!westernLanguages.includes(tmdbData.language)) {
        nonWesternCount++;
        console.log(`   ❌ NON-WESTERN LANGUAGE (${tmdbData.language}) - Should be filtered out!`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 Final Analysis:');
    console.log(`   🥇 Priority 1 (AND logic): ${priority1Count} items`);
    console.log(`   🥈 Priority 2 (OR logic): ${priority2Count} items`);
    console.log(`   🥉 Priority 3 (Popular): ${priority3Count} items`);
    console.log(`   ❌ Items without description: ${noDescriptionCount}`);
    console.log(`   ❌ Items with non-western languages: ${nonWesternCount}`);
    
    console.log('\n🎯 Validation:');
    if (priority1Count > 0) {
      console.log('✅ Priority 1 (AND logic) is working - found content with both genres');
    } else {
      console.log('⚠️ Priority 1 (AND logic) found no content - system correctly fell back');
    }
    
    if (noDescriptionCount === 0) {
      console.log('✅ Description filter is working - all content has descriptions');
    } else {
      console.log(`❌ Description filter failed - ${noDescriptionCount} items without descriptions`);
    }
    
    if (nonWesternCount === 0) {
      console.log('✅ Language filter is working - all content is in western languages');
    } else {
      console.log(`❌ Language filter failed - ${nonWesternCount} items in non-western languages`);
    }

  } catch (error) {
    console.error('❌ Error during testing:', error);
  }
}

async function checkTMDBData(tmdbId, mediaType) {
  const apiKey = 'dc4dbcd2404c1ca852f8eb964add267d';
  
  try {
    const endpoint = mediaType.toLowerCase() === 'tv' ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${apiKey}&language=es-ES`;
    
    const fetch = require('node-fetch');
    const response = await fetch(url);
    
    if (!response.ok) {
      return { genres: [], language: 'unknown', hasDescription: false };
    }

    const data = await response.json();
    const genres = data.genres || [];
    const genreIds = genres.map(g => g.id);
    const language = data.original_language || 'unknown';
    const hasDescription = data.overview && data.overview.trim().length > 0;
    
    return { genres: genreIds, language, hasDescription };
    
  } catch (error) {
    return { genres: [], language: 'unknown', hasDescription: false };
  }
}

// Run the test
testFinalFilteringLogic().catch(console.error);
