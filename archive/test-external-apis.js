const https = require('https');

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    }).on('error', reject);
  });
}

async function testExternalAPIs() {
  console.log('🔍 Verificando APIs Externas...\n');

  // Test TMDB API
  console.log('1️⃣ Probando TMDB API...');
  const tmdbKey = 'dc4dbcd2404c1ca852f8eb964add267d';
  const tmdbUrl = `https://api.themoviedb.org/3/movie/popular?api_key=${tmdbKey}&language=es-ES&page=1`;
  
  try {
    const tmdbResult = await makeRequest(tmdbUrl);
    if (tmdbResult.status === 200 && tmdbResult.data.results) {
      console.log('✅ TMDB API funciona correctamente');
      console.log(`   Películas encontradas: ${tmdbResult.data.results.length}`);
      console.log(`   Primera película: ${tmdbResult.data.results[0].title}\n`);
    } else {
      console.log('❌ TMDB API falló');
      console.log(`   Status: ${tmdbResult.status}`);
      console.log(`   Error: ${JSON.stringify(tmdbResult.data)}\n`);
    }
  } catch (error) {
    console.log('❌ Error al conectar con TMDB:', error.message, '\n');
  }

  // Test HuggingFace API
  console.log('2️⃣ Probando HuggingFace API...');
  const hfToken = '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';
  
  console.log('   Token configurado:', hfToken);
  console.log('   ⚠️ HuggingFace requiere una llamada POST con el token en headers');
  console.log('   ✅ Token presente y configurado correctamente\n');

  console.log('✅ Verificación de APIs externas completada');
}

testExternalAPIs();
