/**
 * Test Description Filtering
 * 
 * This script tests that all returned content has descriptions (overview)
 * and verifies the quality of the filtering system.
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function testDescriptionFiltering() {
  console.log('📝 Testing Description Filtering...\n');

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

    console.log('📡 Testing Animation + Comedy TV content with description filtering...\n');

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

    // Analyze descriptions
    console.log('📝 Description Analysis:');
    console.log('=' .repeat(80));
    
    let withDescription = 0;
    let withoutDescription = 0;
    let shortDescriptions = 0;
    let longDescriptions = 0;
    
    for (let i = 0; i < Math.min(content.length, 15); i++) {
      const item = content[i];
      console.log(`\n${i + 1}. ${item.title}`);
      
      // Check description from Lambda response
      const overview = item.overview || '';
      const overviewLength = overview.trim().length;
      
      if (overviewLength > 0) {
        withDescription++;
        if (overviewLength < 50) {
          shortDescriptions++;
          console.log(`   📝 SHORT DESCRIPTION (${overviewLength} chars): "${overview.substring(0, 100)}..."`);
        } else {
          longDescriptions++;
          console.log(`   📝 GOOD DESCRIPTION (${overviewLength} chars): "${overview.substring(0, 100)}..."`);
        }
      } else {
        withoutDescription++;
        console.log(`   ❌ NO DESCRIPTION`);
      }
      
      // Also check TMDB directly to see if we're missing descriptions
      const tmdbInfo = await checkTMDBDescription(item.tmdbId, item.mediaType);
      if (tmdbInfo.hasDescription && overviewLength === 0) {
        console.log(`   ⚠️ TMDB has description but Lambda doesn't - possible mapping issue`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 Description Statistics (first 15 items):');
    console.log(`   📝 With Description: ${withDescription} items`);
    console.log(`   ❌ Without Description: ${withoutDescription} items`);
    console.log(`   📄 Short Descriptions (<50 chars): ${shortDescriptions} items`);
    console.log(`   📚 Good Descriptions (50+ chars): ${longDescriptions} items`);
    
    const descriptionRate = (withDescription / Math.min(content.length, 15)) * 100;
    
    console.log('\n🎯 Analysis:');
    if (withoutDescription === 0) {
      console.log('✅ EXCELLENT: All content has descriptions!');
      console.log('   The description filtering is working perfectly.');
    } else if (withoutDescription <= 2) {
      console.log('✅ GOOD: Most content has descriptions');
      console.log(`   Description rate: ${descriptionRate.toFixed(1)}%`);
    } else {
      console.log('⚠️ ISSUE: Too many items without descriptions');
      console.log(`   Description rate: ${descriptionRate.toFixed(1)}%`);
      console.log('   The description filtering may need adjustment');
    }
    
    if (longDescriptions >= shortDescriptions) {
      console.log('✅ Quality descriptions: Most descriptions are substantial');
    } else {
      console.log('⚠️ Many descriptions are quite short');
    }

  } catch (error) {
    console.error('❌ Error during description filtering test:', error);
  }
}

async function checkTMDBDescription(tmdbId, mediaType) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return { hasDescription: false, overview: '' };
  }

  try {
    const endpoint = mediaType.toLowerCase() === 'tv' ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${apiKey}&language=es-ES`;
    
    const fetch = globalThis.fetch || require('node-fetch');
    const response = await fetch(url);
    
    if (!response.ok) {
      return { hasDescription: false, overview: '' };
    }

    const data = await response.json();
    const overview = data.overview || '';
    
    return { 
      hasDescription: overview.trim().length > 0, 
      overview: overview.trim() 
    };
    
  } catch (error) {
    return { hasDescription: false, overview: '' };
  }
}

// Run the test
testDescriptionFiltering().catch(console.error);
