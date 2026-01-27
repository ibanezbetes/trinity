/**
 * Debug what TMDB is returning inside the Lambda vs locally
 * This will help us understand why we're getting different results
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ 
  region: 'eu-west-1'
  // AWS credentials are loaded from environment variables or AWS CLI
});

const lambda = new AWS.Lambda();

async function debugTMDBInLambda() {
  console.log('🔍 DEBUGGING TMDB RESPONSES: LAMBDA vs LOCAL');
  console.log('═'.repeat(60));
  
  // First, test locally
  console.log('\n1️⃣ Testing TMDB API locally...');
  await testTMDBLocally();
  
  // Then test in Lambda
  console.log('\n2️⃣ Testing TMDB API in Lambda...');
  await testTMDBInLambda();
}

async function testTMDBLocally() {
  const fetch = globalThis.fetch || require('node-fetch');
  const TMDB_API_KEY = 'dc4dbcd2404c1ca852f8eb964add267d';
  const BASE_URL = 'https://api.themoviedb.org/3';
  
  try {
    // Test the exact same call that Lambda makes
    const url = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&with_genres=16,35&sort_by=vote_average.desc&page=1&include_adult=false`;
    console.log('   URL:', url);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`   ✅ Local TMDB returned ${data.results?.length || 0} results`);
    
    if (data.results && data.results.length > 0) {
      console.log('   📋 First 5 local results:');
      data.results.slice(0, 5).forEach((show, index) => {
        console.log(`      ${index + 1}. ${show.name} (ID: ${show.id}) - Genres: [${show.genre_ids.join(', ')}]`);
      });
    }
    
  } catch (error) {
    console.error('   ❌ Local TMDB test failed:', error.message);
  }
}

async function testTMDBInLambda() {
  try {
    // Create a special test event that will make the Lambda log TMDB responses
    const event = {
      info: { fieldName: 'getFilteredContent' },
      arguments: { 
        mediaType: 'TV',
        genreIds: [16, 35], // Animation + Comedy
        limit: 5,
        excludeIds: []
      }
    };

    console.log('   📤 Sending test event to Lambda...');

    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(event),
      LogType: 'Tail'
    }).promise();

    // Parse the response
    const content = JSON.parse(result.Payload);
    
    // Extract logs to see TMDB responses
    if (result.LogResult) {
      const logs = Buffer.from(result.LogResult, 'base64').toString();
      
      // Look for TMDB response information in logs
      const tmdbLines = logs.split('\n').filter(line => 
        line.includes('TMDB: Retrieved') || 
        line.includes('Priority 1:') ||
        line.includes('Priority 2:')
      );
      
      console.log('   📋 Lambda TMDB logs:');
      tmdbLines.forEach(line => {
        console.log(`      ${line.trim()}`);
      });
    }
    
    if (content && Array.isArray(content)) {
      console.log(`   ✅ Lambda returned ${content.length} items`);
      console.log('   📋 First 5 Lambda results:');
      content.slice(0, 5).forEach((item, index) => {
        console.log(`      ${index + 1}. ${item.title} (ID: ${item.tmdbId})`);
      });
    } else {
      console.log('   ❌ Lambda returned invalid content');
      console.log('   Response:', JSON.stringify(content, null, 2));
    }

  } catch (error) {
    console.error('   ❌ Lambda TMDB test failed:', error.message);
  }
}

// Run the debug
debugTMDBInLambda().catch(console.error);
