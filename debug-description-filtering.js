/**
 * Debug Description Filtering
 * 
 * Verifica que los títulos devueltos tengan descripción y estén en idiomas occidentales
 */

const AWS = require('aws-sdk');

// AWS Configuration
const lambda = new AWS.Lambda({ region: 'eu-west-1' });

async function debugDescriptionFiltering() {
  try {
    console.log('🔍 Debugging Description and Language Filtering...');
    console.log('');

    // Test with Animation (16) + Comedy (35)
    const payload = {
      info: { fieldName: 'getFilteredContent' },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [16, 35], // Animation + Comedy
        limit: 10,
        excludeIds: []
      }
    };

    console.log('🎯 Testing with Animation (16) + Comedy (35)');
    console.log('');

    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(payload),
      LogType: 'Tail'
    }).promise();

    // Show logs
    if (result.LogResult) {
      const logs = Buffer.from(result.LogResult, 'base64').toString();
      console.log('📋 Lambda Logs (last part):');
      console.log('=====================================');
      // Show only the last 20 lines to see the most relevant info
      const logLines = logs.split('\n');
      const lastLines = logLines.slice(-20);
      console.log(lastLines.join('\n'));
      console.log('=====================================');
      console.log('');
    }

    const response = JSON.parse(result.Payload);
    
    if (response.errorMessage) {
      console.error('❌ Error:', response.errorMessage);
      return;
    }

    const movies = response || [];
    console.log(`✅ Lambda returned ${movies.length} movies`);
    console.log('');

    if (movies.length > 0) {
      console.log('🔍 Analyzing returned movies for description and language issues:');
      console.log('');
      
      movies.forEach((movie, index) => {
        const title = movie.title || movie.mediaTitle || 'Sin título';
        const overview = movie.overview || movie.mediaOverview || '';
        const year = movie.year || movie.mediaYear || 'Sin año';
        
        console.log(`${index + 1}. ${title} (${year})`);
        console.log(`   TMDB ID: ${movie.tmdbId}`);
        
        // Check description
        if (!overview || overview.trim().length === 0) {
          console.log(`   ❌ PROBLEMA: Sin descripción`);
        } else if (overview.trim().length < 10) {
          console.log(`   ⚠️ ADVERTENCIA: Descripción muy corta (${overview.trim().length} caracteres)`);
          console.log(`   Descripción: "${overview.trim()}"`);
        } else {
          console.log(`   ✅ Descripción: OK (${overview.trim().length} caracteres)`);
          console.log(`   Descripción: "${overview.substring(0, 100)}..."`);
        }
        
        console.log('');
      });
    }

    console.log('🎯 Análisis:');
    console.log('- Si hay películas sin descripción o con descripciones muy cortas, hay un problema en el filtrado');
    console.log('- Si hay películas con títulos en idiomas no occidentales, hay un problema en el filtrado de idioma');
    console.log('- Animation = 16, Comedy = 35');

  } catch (error) {
    console.error('❌ Error debugging description filtering:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  debugDescriptionFiltering()
    .then(() => {
      console.log('🎉 Debug completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Debug failed:', error);
      process.exit(1);
    });
}

module.exports = { debugDescriptionFiltering };
