#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_ID = 'epjtt2y3fzh53ii6omzj6n6h5a';
const REGION = 'eu-west-1';
const SCHEMA_PATH = path.join(__dirname, 'infrastructure', 'schema.graphql');

console.log('🚀 Actualizando schema de AppSync...\n');

// Leer schema
const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');
console.log(`✅ Schema leído (${schemaContent.length} caracteres)\n`);

// Crear archivo temporal en el directorio actual
const tempPath = path.join(__dirname, 'temp-schema-update.graphql');
fs.writeFileSync(tempPath, schemaContent);

try {
  console.log('📤 Enviando schema a AppSync...');
  
  const result = execSync(
    `aws appsync start-schema-creation --api-id ${API_ID} --region ${REGION} --definition file://${tempPath}`,
    { encoding: 'utf-8', cwd: __dirname }
  );
  
  console.log('✅ Schema actualizado!');
  console.log(result);
  
} catch (error) {
  console.error('❌ Error:', error.message);
  if (error.stderr) {
    console.error(error.stderr.toString());
  }
} finally {
  // Limpiar
  if (fs.existsSync(tempPath)) {
    fs.unlinkSync(tempPath);
  }
}
