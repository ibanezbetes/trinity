#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Desplegando función Lambda completa con dependencias...\n');

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
  
  // Verificar si existe node_modules en infrastructure
  const infraDir = path.join(__dirname, 'infrastructure');
  const nodeModulesPath = path.join(infraDir, 'node_modules');
  
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('📦 Instalando dependencias...');
    process.chdir(infraDir);
    execSync('npm install', { stdio: 'inherit' });
    process.chdir(srcDir);
  }
  
  console.log('✅ Dependencias verificadas');
  
  // Crear ZIP incluyendo node_modules
  console.log('📦 Creando ZIP con dependencias...');
  
  // Copiar node_modules al directorio src temporalmente
  const tempNodeModules = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(tempNodeModules)) {
    console.log('📋 Copiando node_modules...');
    execSync(`xcopy "${nodeModulesPath}" "${tempNodeModules}" /E /I /Q`, { stdio: 'inherit' });
  }
  
  // Crear ZIP con todo
  execSync('powershell -Command "Compress-Archive -Path handlers,services,utils,node_modules -DestinationPath lambda-complete.zip -Force"', {
    stdio: 'inherit'
  });
  
  console.log('✅ ZIP completo creado');
  
  // Verificar que el ZIP existe
  if (!fs.existsSync('lambda-complete.zip')) {
    throw new Error('El archivo ZIP no se creó correctamente');
  }
  
  console.log('☁️  Desplegando a AWS Lambda...');
  
  // Desplegar a Lambda
  const result = execSync(
    'aws lambda update-function-code --function-name trinity-room-dev --zip-file fileb://lambda-complete.zip --region eu-west-1',
    { encoding: 'utf-8' }
  );
  
  console.log('✅ Lambda actualizada exitosamente!');
  console.log('\nRespuesta de AWS:');
  const response = JSON.parse(result);
  console.log(`   Función: ${response.FunctionName}`);
  console.log(`   Tamaño: ${response.CodeSize} bytes`);
  console.log(`   Última modificación: ${response.LastModified}`);
  
  // Limpiar archivos temporales
  if (fs.existsSync('lambda-complete.zip')) {
    fs.unlinkSync('lambda-complete.zip');
  }
  
  // Limpiar node_modules temporal
  if (fs.existsSync(tempNodeModules)) {
    console.log('🧹 Limpiando archivos temporales...');
    execSync(`rmdir /s /q "${tempNodeModules}"`, { stdio: 'inherit' });
  }
  
  console.log('✅ Archivos temporales eliminados');
  
  console.log('\n🎉 ¡Despliegue completado!');
  console.log('\n📝 Próximos pasos:');
  console.log('   1. Esperar 10 segundos para que se complete la actualización');
  console.log('   2. Probar la función Lambda');
  console.log('   3. Si funciona, probar desde la app móvil');
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  
  // Limpiar en caso de error
  const cleanupFiles = ['lambda-complete.zip', 'node_modules'];
  cleanupFiles.forEach(file => {
    try {
      if (fs.existsSync(file)) {
        if (fs.statSync(file).isDirectory()) {
          execSync(`rmdir /s /q "${file}"`, { stdio: 'inherit' });
        } else {
          fs.unlinkSync(file);
        }
      }
    } catch (e) {}
  });
  
  process.exit(1);
}