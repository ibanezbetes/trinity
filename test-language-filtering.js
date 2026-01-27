/**
 * Test Language Filtering
 * 
 * This script tests the new language filtering to ensure we're not getting
 * too much content in Asian languages (Chinese, Japanese, Korean, etc.)
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function testLanguageFiltering() {
  console.log('🌍 Testing Language Filtering...\n');

  try {
    // Test case: Animation + Comedy for TV content
    const testEvent = {
      info: { fieldName: 'getFilteredContent' },
      arguments: {
        mediaType: 'TV',
        genreIds: [16, 35], // Animation + Comedy
        limit: 30,
        excludeIds: []
      }
    };

    console.log('📡 Testing Animation + Comedy TV content with language filtering...\n');

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

    // Analyze languages
    console.log('🌍 Language Analysis:');
    console.log('=' .repeat(80));
    
    const languageStats = {};
    const asianLanguages = ['zh', 'ja', 'ko', 'th', 'vi', 'hi', 'ar'];
    const westernLanguages = ['es', 'en', 'fr', 'it', 'pt', 'de'];
    
    let asianCount = 0;
    let westernCount = 0;
    let unknownCount = 0;
    
    for (let i = 0; i < Math.min(content.length, 10); i++) {
      const item = content[i];
      console.log(`\n${i + 1}. ${item.title}`);
      console.log(`   TMDB ID: ${item.tmdbId}`);
      
      // Check original language via TMDB API
      const languageInfo = await checkTMDBLanguage(item.tmdbId, item.mediaType);
      
      if (languageInfo.originalLanguage) {
        const lang = languageInfo.originalLanguage;
        languageStats[lang] = (languageStats[lang] || 0) + 1;
        
        if (asianLanguages.includes(lang)) {
          asianCount++;
          console.log(`   🈳 ASIAN LANGUAGE: ${lang.toUpperCase()} - ${languageInfo.languageName}`);
        } else if (westernLanguages.includes(lang)) {
          westernCount++;
          console.log(`   🌍 WESTERN LANGUAGE: ${lang.toUpperCase()} - ${languageInfo.languageName}`);
        } else {
          unknownCount++;
          console.log(`   ❓ OTHER LANGUAGE: ${lang.toUpperCase()} - ${languageInfo.languageName}`);
        }
      } else {
        unknownCount++;
        console.log(`   ⚠️ Language info not available`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 Language Distribution (first 10 items):');
    console.log(`   🌍 Western Languages: ${westernCount} items`);
    console.log(`   🈳 Asian Languages: ${asianCount} items`);
    console.log(`   ❓ Other/Unknown: ${unknownCount} items`);
    
    console.log('\n📈 Language Breakdown:');
    Object.entries(languageStats).forEach(([lang, count]) => {
      console.log(`   ${lang.toUpperCase()}: ${count} items`);
    });
    
    console.log('\n🎯 Analysis:');
    if (asianCount === 0) {
      console.log('✅ EXCELLENT: No Asian language content found');
      console.log('   The language filtering is working perfectly!');
    } else if (asianCount <= 2) {
      console.log('✅ GOOD: Very few Asian language content found');
      console.log('   The language filtering is working well');
    } else {
      console.log('⚠️ ISSUE: Too much Asian language content found');
      console.log('   The language filtering may need adjustment');
    }

  } catch (error) {
    console.error('❌ Error during language filtering test:', error);
  }
}

async function checkTMDBLanguage(tmdbId, mediaType) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return { originalLanguage: null, languageName: 'Unknown' };
  }

  try {
    const endpoint = mediaType.toLowerCase() === 'tv' ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${apiKey}&language=es-ES`;
    
    const fetch = globalThis.fetch || require('node-fetch');
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log(`   ⚠️ Failed to fetch TMDB data: ${response.status}`);
      return { originalLanguage: null, languageName: 'Unknown' };
    }

    const data = await response.json();
    const originalLanguage = data.original_language;
    
    // Get language name
    const languageNames = {
      'es': 'Spanish',
      'en': 'English', 
      'fr': 'French',
      'it': 'Italian',
      'pt': 'Portuguese',
      'de': 'German',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'th': 'Thai',
      'vi': 'Vietnamese',
      'hi': 'Hindi',
      'ar': 'Arabic'
    };
    
    const languageName = languageNames[originalLanguage] || originalLanguage || 'Unknown';
    
    return { originalLanguage, languageName };
    
  } catch (error) {
    console.log(`   ⚠️ Error checking TMDB language: ${error.message}`);
    return { originalLanguage: null, languageName: 'Unknown' };
  }
}

// Run the test
testLanguageFiltering().catch(console.error);
