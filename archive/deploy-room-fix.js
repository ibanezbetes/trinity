#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Desplegando fix para Room Lambda...\n');

try {
  // Cambiar al directorio infrastructure/src
  const srcDir = path.join(__dirname, 'infrastructure', 'src');
  process.chdir(srcDir);
  
  console.log('📁 Directorio actual:', process.cwd());
  
  // Verificar que las carpetas existen
  const folders = ['handlers', 'services', 'utils'];
  for (const folder of folders) {
    if (!fs.existsSync(folder)) {
      throw new Error(`Carpeta ${folder} no encontrada en ${process.cwd()}`);
    }
  }
  
  console.log('✅ Carpetas verificadas');
  
  // Crear ZIP usando PowerShell
  console.log('📦 Creando ZIP...');
  execSync('powershell -Command "Compress-Archive -Path handlers,services,utils -DestinationPath lambda-update.zip -Force"', {
    stdio: 'inherit'
  });
  
  console.log('✅ ZIP creado');
  
  // Verificar que el ZIP existe
  if (!fs.existsSync('lambda-update.zip')) {
    throw new Error('El archivo ZIP no se creó correctamente');
  }
  
  console.log('☁️  Desplegando a AWS Lambda...');
  
  // Desplegar a Lambda
  const result = execSync(
    'aws lambda update-function-code --function-name trinity-room-dev --zip-file fileb://lambda-update.zip --region eu-west-1',
    { encoding: 'utf-8' }
  );
  
  console.log('✅ Lambda actualizada exitosamente!');
  console.log('\nRespuesta de AWS:');
  console.log(JSON.stringify(JSON.parse(result), null, 2));
  
  // Limpiar
  fs.unlinkSync('lambda-update.zip');
  console.log('✅ Archivo temporal eliminado');
  
  console.log('\n🎉 ¡Despliegue completado!');
  console.log('\n📝 Próximos pasos:');
  console.log('   1. Intenta crear una sala desde la app móvil');
  console.log('   2. Verifica que no hay errores en los logs');
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  
  // Limpiar en caso de error
  if (fs.existsSync('lambda-update.zip')) {
    fs.unlinkSync('lambda-update.zip');
  }
  
  process.exit(1);
}