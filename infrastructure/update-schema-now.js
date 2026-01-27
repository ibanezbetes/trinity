#!/usr/bin/env node

const { AppSyncClient, StartSchemaCreationCommand, GetSchemaCreationStatusCommand } = require('@aws-sdk/client-appsync');
const fs = require('fs');
const path = require('path');

const API_ID = 'epjtt2y3fzh53ii6omzj6n6h5a';
const REGION = 'eu-west-1';

// Configurar cliente AppSync
const client = new AppSyncClient({ region: REGION });

console.log('🚀 Actualizando schema de AppSync...\n');

// Leer schema
const schemaPath = path.join(__dirname, 'schema.graphql');
const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

console.log(`✅ Schema leído (${schemaContent.length} caracteres)`);
console.log(`📍 API ID: ${API_ID}`);
console.log(`📍 Region: ${REGION}\n`);

async function updateSchema() {
  try {
    // Iniciar actualización del schema
    console.log('📤 Enviando schema a AppSync...');
    
    const startCommand = new StartSchemaCreationCommand({
      apiId: API_ID,
      definition: Buffer.from(schemaContent)
    });
    
    const startResult = await client.send(startCommand);
    console.log('✅ Actualización iniciada!');
    console.log('Status:', startResult.status);
    console.log('\n⏳ Esperando a que se complete...\n');
    
    // Verificar estado cada 2 segundos
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusCommand = new GetSchemaCreationStatusCommand({ apiId: API_ID });
      const statusResult = await client.send(statusCommand);
      
      attempts++;
      
      if (statusResult.status === 'SUCCESS') {
        console.log('\n✅ ¡Schema actualizado exitosamente!');
        console.log('\n🎉 Ahora el frontend puede cargar TODAS las películas!');
        console.log('📝 Próximos pasos:');
        console.log('   1. La app se recargará automáticamente');
        console.log('   2. Ve a la pestaña "Explorar"');
        console.log('   3. Espera mientras carga 25 páginas (~500 películas)');
        console.log('   4. ¡Disfruta de TODO el contenido!\n');
        process.exit(0);
      } else if (statusResult.status === 'FAILED') {
        console.error('\n❌ La actualización falló');
        console.error('Detalles:', statusResult.details);
        process.exit(1);
      } else if (statusResult.status === 'PROCESSING') {
        process.stdout.write('.');
      }
    }
    
    console.log('\n⚠️  Timeout: La actualización está tomando más tiempo del esperado');
    console.log('Verifica el estado manualmente en AWS Console');
    process.exit(1);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Detalles:', error);
    process.exit(1);
  }
}

updateSchema();
