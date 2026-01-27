/**
 * Test TMDB Filtering Direct
 * 
 * Prueba directamente la API de TMDB para ver qué datos están llegando
 * y verificar si los filtros se están aplicando correctamente
 */

// Use built-in fetch from Node.js 18+ runtime or fallback
const fetch = globalThis.fetch || require('node-fetch');

async function testTMDBFilteringDirect() {
  try {
    console.log('🔍 Testing TMDB API directly...');
    console.log('');

    const apiKey = process.env.TMDB_API_KEY || '4b5b3c0c8c0e4f1a9b2d3e4f5a6b7c8d';
    
    // Test with Animation (16) + Comedy (35) - same as Lambda
    const url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&language=es-ES&with_genres=16,35&sort_by=vote_average.desc&page=1&include_adult=false`;
    
    console.log('🌐 Making request to TMDB API:');
    console.log(url);
    console.log('');

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Trinity-Backend/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const results = data.results || [];

    console.log(`✅ TMDB API returned ${results.length} movies`);
    console.log('');

    if (results.length > 0) {
      console.log('🔍 Analyzing raw TMDB data:');
      console.log('');
      
      results.slice(0, 10).forEach((movie, index) => {
        console.log(`${index + 1}. ${movie.title || movie.original_title}`);
        console.log(`   TMDB ID: ${movie.id}`);
        console.log(`   Original Language: ${movie.original_language}`);
        console.log(`   Genres: [${movie.genre_ids.join(', ')}]`);
        
        // Check description
        const overview = movie.overview || '';
        if (!overview || overview.trim().length === 0) {
          console.log(`   ❌ PROBLEMA: Sin descripción`);
        } else if (overview.trim().length < 20) {
          console.log(`   ⚠️ ADVERTENCIA: Descripción muy corta (${overview.trim().length} caracteres)`);
          console.log(`   Descripción: "${overview.trim()}"`);
        } else {
          console.log(`   ✅ Descripción: OK (${overview.trim().length} caracteres)`);
          console.log(`   Descripción: "${overview.substring(0, 100)}..."`);
        }
        
        // Check language
        const westernLanguages = ['es', 'en', 'fr', 'it', 'pt', 'de'];
        if (!westernLanguages.includes(movie.original_language)) {
          console.log(`   ❌ PROBLEMA: Idioma no occidental (${movie.original_language})`);
        } else {
          console.log(`   ✅ Idioma: OK (${movie.original_language})`);
        }
        
        // Check genres
        const hasAnimation = movie.genre_ids.includes(16);
        const hasComedy = movie.genre_ids.includes(35);
        console.log(`   ✅ Animation (16): ${hasAnimation ? 'YES' : 'NO'}`);
        console.log(`   ✅ Comedy (35): ${hasComedy ? 'YES' : 'NO'}`);
        
        console.log('');
      });
    }

    console.log('🎯 Análisis de datos crudos de TMDB:');
    console.log('- Esto muestra exactamente qué datos está devolviendo TMDB');
    console.log('- Si hay problemas aquí, el problema está en la API de TMDB');
    console.log('- Si no hay problemas aquí, el problema está en nuestros filtros');

  } catch (error) {
    console.error('❌ Error testing TMDB API directly:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testTMDBFilteringDirect()
    .then(() => {
      console.log('🎉 TMDB direct test completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testTMDBFilteringDirect };
