/**
 * Test TMDB API OR logic - verify if pipe syntax works
 */

const fetch = globalThis.fetch || require('node-fetch');

const TMDB_API_KEY = 'dc4dbcd2404c1ca852f8eb964add267d';
const BASE_URL = 'https://api.themoviedb.org/3';

async function testTMDBOrLogic() {
  console.log('🔍 TESTING TMDB OR LOGIC');
  console.log('═'.repeat(50));
  
  // Test 1: Using pipe syntax (what our service is doing)
  console.log('\n📺 Test 1: Using PIPE syntax (16|35)...');
  try {
    const pipeUrl = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&with_genres=16|35&sort_by=popularity.desc&page=1&include_adult=false`;
    console.log('URL:', pipeUrl);
    
    const pipeResponse = await fetch(pipeUrl);
    const pipeData = await pipeResponse.json();
    
    console.log(`✅ Pipe syntax returned ${pipeData.results?.length || 0} results`);
    
    if (pipeData.results && pipeData.results.length > 0) {
      console.log('First 3 results with PIPE:');
      pipeData.results.slice(0, 3).forEach((show, index) => {
        console.log(`${index + 1}. ${show.name} (${show.id}) - Genres: [${show.genre_ids.join(', ')}]`);
      });
    } else {
      console.log('❌ No results with pipe syntax');
      if (pipeData.errors) {
        console.log('Errors:', pipeData.errors);
      }
    }
    
  } catch (error) {
    console.error('❌ Error with pipe syntax:', error.message);
  }
  
  // Test 2: Using comma syntax (AND logic)
  console.log('\n📺 Test 2: Using COMMA syntax (16,35)...');
  try {
    const commaUrl = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&with_genres=16,35&sort_by=popularity.desc&page=1&include_adult=false`;
    console.log('URL:', commaUrl);
    
    const commaResponse = await fetch(commaUrl);
    const commaData = await commaResponse.json();
    
    console.log(`✅ Comma syntax returned ${commaData.results?.length || 0} results`);
    
    if (commaData.results && commaData.results.length > 0) {
      console.log('First 3 results with COMMA:');
      commaData.results.slice(0, 3).forEach((show, index) => {
        console.log(`${index + 1}. ${show.name} (${show.id}) - Genres: [${show.genre_ids.join(', ')}]`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error with comma syntax:', error.message);
  }
  
  // Test 3: Multiple separate calls (proper OR logic)
  console.log('\n📺 Test 3: Separate calls for OR logic...');
  try {
    // Animation only
    const animUrl = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&with_genres=16&sort_by=popularity.desc&page=1&include_adult=false`;
    const animResponse = await fetch(animUrl);
    const animData = await animResponse.json();
    
    // Comedy only  
    const comedyUrl = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&with_genres=35&sort_by=popularity.desc&page=1&include_adult=false`;
    const comedyResponse = await fetch(comedyUrl);
    const comedyData = await comedyResponse.json();
    
    console.log(`Animation results: ${animData.results?.length || 0}`);
    console.log(`Comedy results: ${comedyData.results?.length || 0}`);
    
    // Combine and deduplicate
    const combined = [];
    const seenIds = new Set();
    
    [...(animData.results || []), ...(comedyData.results || [])].forEach(show => {
      if (!seenIds.has(show.id)) {
        seenIds.add(show.id);
        combined.push(show);
      }
    });
    
    console.log(`Combined unique results: ${combined.length}`);
    
    if (combined.length > 0) {
      console.log('First 5 combined results:');
      combined.slice(0, 5).forEach((show, index) => {
        console.log(`${index + 1}. ${show.name} (${show.id}) - Genres: [${show.genre_ids.join(', ')}]`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error with separate calls:', error.message);
  }
  
  console.log('\n' + '═'.repeat(50));
  console.log('🎯 ANALYSIS COMPLETE');
}

// Run the test
testTMDBOrLogic().catch(console.error);
