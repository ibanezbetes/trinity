/**
 * Test Strict Genre Validation
 * 
 * Testing that the genre filtering is working correctly with strict validation
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function testStrictGenreValidation() {
  console.log('🔍 Testing Strict Genre Validation...\n');

  try {
    // Test case: Animation + Comedy for MOVIES (should be easier to find than TV)
    const testEvent = {
      info: { fieldName: 'getFilteredContent' },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [16, 35], // Animation + Comedy
        limit: 5, // Small test to analyze results
        excludeIds: []
      }
    };

    console.log('📡 Testing Animation + Comedy for MOVIES...');
    console.log('Expected: All results should have BOTH genres [16, 35]');
    console.log('Expected: All results should have descriptions');
    console.log('Expected: All results should be in western languages\n');

    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(testEvent),
      LogType: 'Tail' // Get the logs
    }).promise();

    // Decode and display logs
    if (result.LogResult) {
      const logs = Buffer.from(result.LogResult, 'base64').toString();
      console.log('📋 Lambda Logs (last 30 lines):');
      console.log('=' .repeat(80));
      const logLines = logs.split('\n');
      const lastLines = logLines.slice(-30);
      console.log(lastLines.join('\n'));
      console.log('=' .repeat(80));
    }

    const response = JSON.parse(result.Payload);
    
    if (response.errorMessage) {
      console.error('\n❌ Lambda Error:', response.errorMessage);
      return;
    }

    const content = response;
    console.log(`\n📊 Retrieved ${content.length} items`);

    if (content.length === 0) {
      console.log('⚠️ No content returned - this might indicate an issue with the filtering');
      return;
    }

    // Analyze each item
    console.log('\n🔍 Detailed Genre Analysis:');
    let validItems = 0;
    let invalidItems = 0;

    for (let i = 0; i < content.length; i++) {
      const item = content[i];
      console.log(`\n${i + 1}. ${item.title}`);
      console.log(`   TMDB ID: ${item.tmdbId}`);
      console.log(`   Media Type: ${item.mediaType}`);
      
      // Check actual TMDB data
      const tmdbData = await checkTMDBGenres(item.tmdbId, item.mediaType);
      
      console.log(`   Actual Genres: [${tmdbData.genres.join(', ')}]`);
      console.log(`   Language: ${tmdbData.language}`);
      console.log(`   Has Description: ${tmdbData.hasDescription}`);
      
      // Check if it has both required genres
      const hasAnimation = tmdbData.genres.includes(16);
      const hasComedy = tmdbData.genres.includes(35);
      
      if (hasAnimation && hasComedy) {
        validItems++;
        console.log('   ✅ VALID: Has BOTH Animation (16) AND Comedy (35)');
      } else {
        invalidItems++;
        console.log('   ❌ INVALID: Missing required genres');
        if (!hasAnimation) console.log('      - Missing Animation (16)');
        if (!hasComedy) console.log('      - Missing Comedy (35)');
      }
      
      // Check other filters
      const westernLanguages = ['es', 'en', 'fr', 'it', 'pt', 'de'];
      if (!westernLanguages.includes(tmdbData.language)) {
        console.log(`   ❌ INVALID: Non-western language (${tmdbData.language})`);
      }
      
      if (!tmdbData.hasDescription) {
        console.log('   ❌ INVALID: No description');
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 Validation Results:');
    console.log(`   ✅ Valid items (both genres): ${validItems}`);
    console.log(`   ❌ Invalid items (missing genres): ${invalidItems}`);
    console.log(`   📈 Success rate: ${((validItems / content.length) * 100).toFixed(1)}%`);
    
    if (validItems === content.length) {
      console.log('\n🎉 SUCCESS: All items have the required genres!');
    } else {
      console.log('\n⚠️ ISSUE: Some items are missing the required genres');
      console.log('   This indicates the genre filtering needs improvement');
    }

  } catch (error) {
    console.error('❌ Error during testing:', error);
  }
}

async function checkTMDBGenres(tmdbId, mediaType) {
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
testStrictGenreValidation().catch(console.error);
