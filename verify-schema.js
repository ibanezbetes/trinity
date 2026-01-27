const { execSync } = require('child_process');

console.log('🔍 Verificando esquema GraphQL de AppSync...\n');

try {
  // Obtener lista de APIs
  const apis = JSON.parse(execSync('aws appsync list-graphql-apis --region eu-west-1', { encoding: 'utf8' }));
  
  if (!apis.graphqlApis || apis.graphqlApis.length === 0) {
    console.log('❌ No se encontraron APIs de AppSync');
    process.exit(1);
  }

  // Buscar la API de Trinity (asumiendo que tiene "trinity" en el nombre)
  const trinityApi = apis.graphqlApis.find(api => 
    api.name.toLowerCase().includes('trinity') || 
    api.name.toLowerCase().includes('stack')
  );

  if (!trinityApi) {
    console.log('❌ No se encontró la API de Trinity');
    console.log('APIs disponibles:');
    apis.graphqlApis.forEach(api => console.log(`  - ${api.name} (${api.apiId})`));
    process.exit(1);
  }

  console.log(`✅ API encontrada: ${trinityApi.name} (${trinityApi.apiId})`);

  // Obtener el esquema
  console.log('📥 Descargando esquema...');
  const schema = execSync(`aws appsync get-introspection-schema --api-id ${trinityApi.apiId} --format SDL --region eu-west-1`, { encoding: 'utf8' });

  // Verificar campos críticos
  const requiredFields = [
    'remoteId',
    'tmdbId', 
    'originalTitle',
    'posterPath',
    'mediaType',
    'getFilteredContent'
  ];

  console.log('\n🔍 Verificando campos críticos:');
  
  let allFieldsPresent = true;
  requiredFields.forEach(field => {
    if (schema.includes(field)) {
      console.log(`  ✅ ${field}`);
    } else {
      console.log(`  ❌ ${field} - FALTANTE`);
      allFieldsPresent = false;
    }
  });

  if (allFieldsPresent) {
    console.log('\n🎉 ¡Esquema actualizado correctamente!');
    console.log('El sistema de filtrado avanzado debería funcionar ahora.');
  } else {
    console.log('\n⚠️  Esquema incompleto');
    console.log('Ejecuta: cd infrastructure && npm run deploy');
  }

} catch (error) {
  console.error('❌ Error verificando esquema:', error.message);
  console.log('\n💡 Asegúrate de que:');
  console.log('  - AWS CLI esté configurado');
  console.log('  - Tengas permisos para AppSync');
  console.log('  - La región sea correcta (eu-west-1)');
}
