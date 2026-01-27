/**
 * Test No Cache Priority 1
 * 
 * Testing with different parameters to avoid cache and see Priority 1 execution
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function testNoCachePriority1() {
  console.log('🔍 Testing No Cache Priority 1...\n');

  try {
    // Use different genre combinations to avoid cache
    const testCases = [
      { mediaType: 'TV', genreIds: [16, 35], name: 'Animation + Comedy' },
      { mediaType: 'TV', genreIds: [16, 10765], name: 'Animation + Sci-Fi' },
      { mediaType: 'MOVIE', genreIds: [16, 35], name: 'Movie Animation + Comedy' }
    ];

    for (const testCase of testCases) {
      console.log(`\n📡 Testing: ${testCase.name}`);
      console.log(`   Media Type: ${testCase.mediaType}`);
      console.log(`   Genres: [${testCase.genreIds.join(', ')}]`);

      const testEvent = {
        info: { fieldName: 'getFilteredContent' },
        arguments: {
          mediaType: testCase.mediaType,
          genreIds: testCase.genreIds,
          limit: 3, // Small limit to see results quickly
          excludeIds: []
        }
      };

      const result = await lambda.invoke({
        FunctionName: 'trinity-movie-dev',
        Payload: JSON.stringify(testEvent),
        LogType: 'Tail' // Get the logs
      }).promise();

      // Decode and display logs
      if (result.LogResult) {
        const logs = Buffer.from(result.LogResult, 'base64').toString();
        console.log('\n📋 Lambda Logs (last 20 lines):');
        const logLines = logs.split('\n');
        const lastLines = logLines.slice(-20);
        console.log(lastLines.join('\n'));
      }

      const response = JSON.parse(result.Payload);
      
      if (response.errorMessage) {
        console.error(`❌ Error for ${testCase.name}:`, response.errorMessage);
      } else {
        console.log(`✅ ${testCase.name}: Got ${response.length} items`);
        
        // Check first item to see if it has both genres
        if (response.length > 0) {
          const firstItem = response[0];
          const genreCheck = await checkTMDBGenres(firstItem.tmdbId, testCase.mediaType);
          
          const hasFirstGenre = genreCheck.genres.includes(testCase.genreIds[0]);
          const hasSecondGenre = genreCheck.genres.includes(testCase.genreIds[1]);
          
          console.log(`   First item: ${firstItem.title}`);
          console.log(`   Genres: [${genreCheck.genres.join(', ')}]`);
          console.log(`   Has both target genres: ${hasFirstGenre && hasSecondGenre}`);
        }
      }

      // Wait between tests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
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
    
    const fetch = globalThis.fetch || require('node-fetch');
    const response = await fetch(url);
    
    if (!response.ok) {
      return { genres: [] };
    }

    const data = await response.json();
    const genres = data.genres || [];
    const genreIds = genres.map(g => g.id);
    
    return { genres: genreIds };
    
  } catch (error) {
    return { genres: [] };
  }
}

// Run the test
testNoCachePriority1().catch(console.error);
