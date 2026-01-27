/**
 * Test TMDB API Direct
 * 
 * Testing TMDB API directly to see if genre filtering works
 */

async function testTMDBAPIDirect() {
  console.log('🔍 Testing TMDB API Direct...\n');

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.error('❌ TMDB_API_KEY not found');
    return;
  }

  const fetch = require('node-fetch');

  try {

    // Test 1: Animation + Comedy for TV (AND logic)
    console.log('📡 Test 1: Animation + Comedy for TV (AND logic)');
    const url1 = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&language=es-ES&with_genres=16,35&sort_by=vote_average.desc&include_adult=false`;
    console.log('URL:', url1);
    
    const response1 = await fetch(url1);
    const data1 = await response1.json();
    
    console.log(`Results: ${data1.results?.length || 0} items`);
    if (data1.results && data1.results.length > 0) {
      console.log('First few results:');
      for (let i = 0; i < Math.min(3, data1.results.length); i++) {
        const item = data1.results[i];
        console.log(`  ${i + 1}. ${item.name} (ID: ${item.id})`);
        console.log(`     Genres: [${item.genre_ids.join(', ')}]`);
        
        const hasAnimation = item.genre_ids.includes(16);
        const hasComedy = item.genre_ids.includes(35);
        console.log(`     Has Animation: ${hasAnimation}, Has Comedy: ${hasComedy}`);
      }
    } else {
      console.log('❌ No results found for Animation + Comedy');
    }

    console.log('\n' + '='.repeat(60));

    // Test 2: Just Animation for TV
    console.log('📡 Test 2: Just Animation for TV');
    const url2 = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&language=es-ES&with_genres=16&sort_by=vote_average.desc&include_adult=false`;
    console.log('URL:', url2);
    
    const response2 = await fetch(url2);
    const data2 = await response2.json();
    
    console.log(`Results: ${data2.results?.length || 0} items`);
    if (data2.results && data2.results.length > 0) {
      console.log('First few results:');
      for (let i = 0; i < Math.min(3, data2.results.length); i++) {
        const item = data2.results[i];
        console.log(`  ${i + 1}. ${item.name} (ID: ${item.id})`);
        console.log(`     Genres: [${item.genre_ids.join(', ')}]`);
      }
    }

    console.log('\n' + '='.repeat(60));

    // Test 3: Just Comedy for TV
    console.log('📡 Test 3: Just Comedy for TV');
    const url3 = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&language=es-ES&with_genres=35&sort_by=vote_average.desc&include_adult=false`;
    console.log('URL:', url3);
    
    const response3 = await fetch(url3);
    const data3 = await response3.json();
    
    console.log(`Results: ${data3.results?.length || 0} items`);
    if (data3.results && data3.results.length > 0) {
      console.log('First few results:');
      for (let i = 0; i < Math.min(3, data3.results.length); i++) {
        const item = data3.results[i];
        console.log(`  ${i + 1}. ${item.name} (ID: ${item.id})`);
        console.log(`     Genres: [${item.genre_ids.join(', ')}]`);
      }
    }

    console.log('\n🎯 Analysis:');
    if (data1.results && data1.results.length > 0) {
      console.log('✅ TMDB API supports AND logic with comma-separated genres');
    } else {
      console.log('❌ TMDB API might not have content with both Animation AND Comedy for TV');
      console.log('   This could explain why Priority 1 returns empty and system falls back to Priority 3');
    }

  } catch (error) {
    console.error('❌ Error testing TMDB API:', error);
  }
}

// Run the test
testTMDBAPIDirect().catch(console.error);
