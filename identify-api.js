const { execSync } = require('child_process');

console.log('🔍 Identificando la API correcta...\n');

const targetEndpoint = 'qdvhkkwneza2pkpaofehnvmubq';

try {
  // Obtener lista de APIs
  const apis = JSON.parse(execSync('aws appsync list-graphql-apis --region eu-west-1', { encoding: 'utf8' }));
  
  console.log('📋 APIs encontradas:');
  apis.graphqlApis.forEach(api => {
    const isTarget = api.uris && api.uris.GRAPHQL && api.uris.GRAPHQL.includes(targetEndpoint);
    const marker = isTarget ? '🎯 [ESTA ES LA QUE USA LA APP]' : '';
    
    console.log(`\n  📍 ${api.name} ${marker}`);
    console.log(`     ID: ${api.apiId}`);
    console.log(`     Endpoint: ${api.uris?.GRAPHQL || 'N/A'}`);
    console.log(`     Realtime: ${api.uris?.REALTIME || 'N/A'}`);
  });

  // Encontrar la API correcta
  const targetApi = apis.graphqlApis.find(api => 
    api.uris && api.uris.GRAPHQL && api.uris.GRAPHQL.includes(targetEndpoint)
  );

  if (targetApi) {
    console.log(`\n🎯 API que usa la app: ${targetApi.name} (${targetApi.apiId})`);
    
    // Verificar el esquema de esta API
    console.log('\n📥 Verificando esquema de la API correcta...');
    const schema = execSync(`aws appsync get-introspection-schema --api-id ${targetApi.apiId} --format SDL --region eu-west-1`, { encoding: 'utf8' });
    
    // Buscar el tipo Movie
    const movieTypeMatch = schema.match(/type Movie \{[^}]+\}/s);
    if (movieTypeMatch) {
      console.log('\n📋 Tipo Movie actual:');
      console.log(movieTypeMatch[0]);
    }
    
    // Verificar campos críticos
    const requiredFields = [
      'remoteId',
      'tmdbId', 
      'originalTitle',
      'posterPath',
      'mediaType',
      'getFilteredContent'
    ];

    console.log('\n🔍 Campos requeridos:');
    requiredFields.forEach(field => {
      if (schema.includes(field)) {
        console.log(`  ✅ ${field}`);
      } else {
        console.log(`  ❌ ${field} - FALTANTE`);
      }
    });
    
  } else {
    console.log('\n❌ No se encontró la API que usa la app');
  }

} catch (error) {
  console.error('❌ Error:', error.message);
}
