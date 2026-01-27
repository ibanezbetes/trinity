/**
 * Test Simple Filtering
 * 
 * Prueba simple para verificar si los filtros se están aplicando
 */

// Cargar variables de entorno si existe archivo .env
try {
    require('dotenv').config();
} catch (e) {
    // dotenv no está instalado, usar variables de entorno del sistema
}

const AWS = require('aws-sdk');

// AWS Configuration - Credenciales desde variables de entorno
AWS.config.update({ 
    region: process.env.AWS_DEFAULT_REGION || 'eu-west-1'
    // Las credenciales se cargan automáticamente desde:
    // 1. Variables de entorno: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
    // 2. Archivo ~/.aws/credentials
    // 3. Roles IAM (en producción)
});

const lambda = new AWS.Lambda();

async function testSimpleFiltering() {
  try {
    console.log('🔍 Testing Simple Filtering...');
    console.log('');

    // Test with just one genre to see if basic filtering works
    const payload = {
      info: { fieldName: 'getFilteredContent' },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [35], // Just Comedy
        limit: 5,
        excludeIds: []
      }
    };

    console.log('🎯 Testing with just Comedy (35)');
    console.log('📤 Payload:', JSON.stringify(payload, null, 2));
    console.log('');

    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(payload),
      LogType: 'Tail'
    }).promise();

    // Show ALL logs to see if filtering messages appear
    if (result.LogResult) {
      const logs = Buffer.from(result.LogResult, 'base64').toString();
      console.log('📋 COMPLETE Lambda Logs:');
      console.log('=====================================');
      console.log(logs);
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
      console.log('🔍 Quick analysis:');
      console.log('');
      
      movies.forEach((movie, index) => {
        const title = movie.title || movie.mediaTitle || 'Sin título';
        const overview = movie.overview || movie.mediaOverview || '';
        
        console.log(`${index + 1}. ${title}`);
        console.log(`   Descripción: ${overview ? 'SÍ' : 'NO'} (${overview.length} chars)`);
        console.log('');
      });
    }

    console.log('🎯 Buscar en los logs:');
    console.log('- "Raw results from API" - para ver si los filtros se ejecutan');
    console.log('- "After language filtering" - para ver filtrado de idioma');
    console.log('- "After description filtering" - para ver filtrado de descripción');

  } catch (error) {
    console.error('❌ Error testing simple filtering:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testSimpleFiltering()
    .then(() => {
      console.log('🎉 Simple filtering test completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testSimpleFiltering };
