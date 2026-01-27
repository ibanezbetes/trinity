/**
 * Test Priority 1 Content Availability
 * 
 * This script tests how many items with BOTH Animation AND Comedy genres
 * are actually available in TMDB to understand if the issue is:
 * 1. Not enough Priority 1 content exists
 * 2. We're not fetching enough pages
 * 3. The filtering logic is wrong
 */

const fetch = globalThis.fetch || require('node-fetch');

async function testPriority1Availability() {
  console.log('🔍 Testing Priority 1 Content Availability...\n');
  
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.error('❌ TMDB_API_KEY not found');
    return;
  }

  try {
    console.log('📡 Searching for TV shows with BOTH Animation (16) AND Comedy (35)...');
    
    let allContent = [];
    const maxPages = 10; // Test up to 10 pages
    
    for (let page = 1; page <= maxPages; page++) {
      console.log(`   Fetching page ${page}...`);
      
      const url = `https://api.themoviedb.org/3/discover/tv?with_genres=16,35&api_key=${apiKey}&language=es-ES&page=${page}&sort_by=vote_average.desc&include_adult=false`;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.log(`   ⚠️ Error on page ${page}: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      const results = data.results || [];
      
      if (results.length === 0) {
        console.log(`   📄 Page ${page}: No more results`);
        break;
      }
      
      // Verify each item actually has BOTH genres
      const validItems = results.filter(item => {
        const genres = item.genre_ids || [];
        return genres.includes(16) && genres.includes(35);
      });
      
      console.log(`   📄 Page ${page}: ${results.length} total, ${validItems.length} with both genres`);
      allContent.push(...validItems);
      
      // If we got less than 20 results, we're probably at the end
      if (results.length < 20) {
        console.log(`   📄 Page ${page}: Fewer than 20 results, likely at end`);
        break;
      }
    }
    
    console.log('\n📊 Results Summary:');
    console.log(`   Total Priority 1 content found: ${allContent.length} items`);
    console.log(`   Pages searched: ${Math.min(maxPages, allContent.length > 0 ? Math.ceil(allContent.length / 20) + 1 : 1)}`);
    
    if (allContent.length >= 30) {
      console.log('   ✅ Enough Priority 1 content exists (30+ items)');
      console.log('   🔍 Issue: Lambda is not fetching enough pages or filtering incorrectly');
    } else {
      console.log(`   ⚠️ Limited Priority 1 content available (${allContent.length} items)`);
      console.log('   📝 This explains why Priority 2 content appears in results');
    }
    
    console.log('\n🎯 Top 10 Priority 1 Items:');
    allContent.slice(0, 10).forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.name || item.title} (ID: ${item.id})`);
    });
    
    if (allContent.length < 30) {
      console.log('\n💡 Recommendation:');
      console.log('   The current behavior is actually correct - there are not enough');
      console.log('   Priority 1 items to fill 30 slots, so Priority 2 content is needed.');
      console.log('   The user should expect to see some comedy-only content mixed in.');
    }

  } catch (error) {
    console.error('❌ Error testing Priority 1 availability:', error);
  }
}

// Run the test
testPriority1Availability().catch(console.error);
