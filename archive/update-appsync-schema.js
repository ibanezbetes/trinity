#!/usr/bin/env node

/**
 * Script para actualizar el schema de AppSync con las subscriptions Enhanced
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_ID = 'epjtt2y3fzh53ii6omzj6n6h5a';
const REGION = 'eu-west-1';
const SCHEMA_PATH = path.join(__dirname, 'infrastructure', 'schema.graphql');

console.log('🚀 Actualizando schema de AppSync...\n');

// Verificar que el archivo existe
if (!fs.existsSync(SCHEMA_PATH)) {
  console.error(`❌ Error: No se encontró el archivo ${SCHEMA_PATH}`);
  process.exit(1);
}

console.log(`📄 Leyendo schema desde: ${SCHEMA_PATH}`);
const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');

console.log(`✅ Schema leído (${schemaContent.length} caracteres)\n`);

const tempSchemaPath = path.join(__dirname, 'temp-schema.graphql');
fs.writeFileSync(tempSchemaPath, schemaContent);

console.log('📤 Iniciando actualización del schema en AppSync...');
console.log(`   API ID: ${API_ID}`);
console.log(`   Region: ${REGION}\n`);

try {
  const result = execSync(
    `aws appsync start-schema-creation --api-id ${API_ID} --region ${REGION} --definition file://${tempSchemaPath}`,
    { encoding: 'utf-8' }
  );

  console.log('✅ Actualización iniciada exitosamente!');
  console.log(result);

  console.log('\n⏳ Esperando a que se complete la actualización...');
  
  // Esperar y verificar el estado
  let attempts = 0;
  const maxAttempts = 30; // 30 segundos máximo
  
  while (attempts < maxAttempts) {
    try {
      const statusResult = execSync(
        `aws appsync get-schema-creation-status --api-id ${API_ID} --region ${REGION} --no-cli-pager`,
        { encoding: 'utf-8' }
      );
      
      const status = JSON.parse(statusResult);
      
      if (status.status === 'SUCCESS') {
        console.log('\n🎉 ¡Schema actualizado exitosamente!');
        break;
      } else if (status.status === 'FAILED') {
        console.error('\n❌ Error: La actualización del schema falló');
        console.error('Detalles:', status.details);
        process.exit(1);
      } else if (status.status === 'PROCESSING') {
        process.stdout.write('.');
        // Esperar 1 segundo de forma síncrona
        execSync('timeout /t 1 /nobreak > nul 2>&1 || sleep 1', { stdio: 'ignore' });
        attempts++;
      }
    } catch (e) {
      console.error('\n❌ Error al verificar el estado:', e.message);
      break;
    }
  }

  if (attempts >= maxAttempts) {
    console.log('\n⚠️  Timeout: La actualización está tomando más tiempo del esperado');
    console.log('   Verifica el estado manualmente con:');
    console.log(`   aws appsync get-schema-creation-status --api-id ${API_ID} --region ${REGION}`);
  }

} catch (error) {
  console.error('\n❌ Error al actualizar el schema:', error.message);
  if (error.stderr) {
    console.error('Detalles:', error.stderr.toString());
  }
  process.exit(1);
} finally {
  // Limpiar archivo temporal
  if (fs.existsSync(tempSchemaPath)) {
    fs.unlinkSync(tempSchemaPath);
  }
}

console.log('\n✅ Proceso completado');
console.log('\n📝 Próximos pasos:');
console.log('   1. Ejecutar: node verify-appsync-cli.js');
console.log('   2. Ejecutar: create-subscription-resolvers.bat');
console.log('   3. Probar desde la app móvil\n');
