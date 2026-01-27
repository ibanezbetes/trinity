/**
 * Debug TMDB API directly to see what's happening
 * Test the actual TMDB discover endpoint for TV with Animation + Comedy
 */

const fetch = globalThis.fetch || require('node-fetch');

const TMDB_API_KEY = 'dc4dbcd2404c1ca852f8eb964add267d';
const BASE_URL = 'https://api.themoviedb.org/3';

async function debugTMDBDirect() {
  console.log('🔍 DEBUGGING TMDB API DIRECTLY');
  console.log('═'.repeat(50));
  
  // Test 1: Get TV genres to verify IDs
  console.log('\n📺 Step 1: Getting TV genres...');
  try {
    const genresUrl = `${BASE_URL}/genre/tv/list?api_key=${TMDB_API_KEY}&language=es-ES`;
    const genresResponse = await fetch(genresUrl);
    const genresData = await genresResponse.json();
    
    console.log('Available TV genres:');
    genresData.genres.forEach(genre => {
      if (genre.id === 16 || genre.id === 35) {
        console.log(`   ✅ ${genre.name} (ID: ${genre.id})`);
      } else {
        console.log(`   - ${genre.name} (ID: ${genre.id})`);
      }
    });
    
    // Find Animation and Comedy
    const animation = genresData.genres.find(g => g.id === 16);
    const comedy = genresData.genres.find(g => g.id === 35);
    
    console.log(`\n🎯 Target genres:`);
    console.log(`   Animation: ${animation ? animation.name : 'NOT FOUND'} (16)`);
    console.log(`   Comedy: ${comedy ? comedy.name : 'NOT FOUND'} (35)`);
    
  } catch (error) {
    console.error('❌ Error getting genres:', error.message);
    return;
  }
  
  // Test 2: Discover TV shows with Animation + Comedy (AND logic)
  console.log('\n📺 Step 2: Discovering TV with Animation AND Comedy...');
  try {
    const discoverUrl = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&with_genres=16,35&sort_by=popularity.desc&page=1&include_adult=false`;
    console.log('URL:', discoverUrl);
    
    const discoverResponse = await fetch(discoverUrl);
    const discoverData = await discoverResponse.json();
    
    console.log(`\n✅ TMDB returned ${discoverData.results?.length || 0} results`);
    
    if (discoverData.results && discoverData.results.length > 0) {
      console.log('\n📋 First 5 results:');
      discoverData.results.slice(0, 5).forEach((show, index) => {
        console.log(`\n${index + 1}. ${show.name} (ID: ${show.id})`);
        console.log(`   Genres: [${show.genre_ids.join(', ')}]`);
        console.log(`   Has Animation (16): ${show.genre_ids.includes(16) ? '✅' : '❌'}`);
        console.log(`   Has Comedy (35): ${show.genre_ids.includes(35) ? '✅' : '❌'}`);
        console.log(`   Overview: ${show.overview.substring(0, 100)}...`);
      });
    } else {
      console.log('❌ No results found for Animation + Comedy');
    }
    
  } catch (error) {
    console.error('❌ Error discovering content:', error.message);
  }
  
  // Test 3: Try OR logic (Animation OR Comedy)
  console.log('\n📺 Step 3: Discovering TV with Animation OR Comedy...');
  try {
    // TMDB doesn't support OR directly, so we'll test Animation only
    const animationUrl = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&with_genres=16&sort_by=popularity.desc&page=1&include_adult=false`;
    console.log('Animation URL:', animationUrl);
    
    const animationResponse = await fetch(animationUrl);
    const animationData = await animationResponse.json();
    
    console.log(`\n✅ Animation only: ${animationData.results?.length || 0} results`);
    
    if (animationData.results && animationData.results.length > 0) {
      console.log('\nFirst 3 Animation results:');
      animationData.results.slice(0, 3).forEach((show, index) => {
        console.log(`${index + 1}. ${show.name} (${show.id}) - Genres: [${show.genre_ids.join(', ')}]`);
      });
    }
    
    // Test Comedy only
    const comedyUrl = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&with_genres=35&sort_by=popularity.desc&page=1&include_adult=false`;
    const comedyResponse = await fetch(comedyUrl);
    const comedyData = await comedyResponse.json();
    
    console.log(`\n✅ Comedy only: ${comedyData.results?.length || 0} results`);
    
    if (comedyData.results && comedyData.results.length > 0) {
      console.log('\nFirst 3 Comedy results:');
      comedyData.results.slice(0, 3).forEach((show, index) => {
        console.log(`${index + 1}. ${show.name} (${show.id}) - Genres: [${show.genre_ids.join(', ')}]`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error with OR logic test:', error.message);
  }
  
  console.log('\n' + '═'.repeat(50));
  console.log('🎯 ANALYSIS COMPLETE');
}

// Run the debug
debugTMDBDirect().catch(console.error);
