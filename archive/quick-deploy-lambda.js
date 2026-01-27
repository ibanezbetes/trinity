/**
 * Script para desplegar rápidamente el fix de Lambda a AWS
 * Ejecutar: node quick-deploy-lambda.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

console.log('\n🚀 Desplegando Fix de Join Room a AWS Lambda\n');
console.log('='.repeat(60));

// Paso 1: Crear ZIP con el código actualizado
console.log('\n📦 Paso 1: Creando archivo ZIP...');

const output = fs.createWriteStream(path.join(__dirname, 'lambda-update.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', async () => {
  console.log(`✅ ZIP creado: ${archive.pointer()} bytes`);
  
  // Paso 2: Desplegar a Lambda
  console.log('\n☁️  Paso 2: Desplegando a AWS Lambda trinity-room-dev...');
  
  try {
    const result = execSync(
      'aws lambda update-function-code --function-name trinity-room-dev --zip-file fileb://lambda-update.zip --region eu-west-1',
      { encoding: 'utf-8', cwd: __dirname }
    );
    
    console.log('✅ Lambda actualizada exitosamente!');
    console.log('\nRespuesta de AWS:');
    console.log(JSON.stringify(JSON.parse(result), null, 2));
    
    // Paso 3: Limpiar
    console.log('\n🧹 Paso 3: Limpiando archivos temporales...');
    fs.unlinkSync(path.join(__dirname, 'lambda-update.zip'));
    console.log('✅ Limpieza completada');
    
    console.log('\n' + '='.repeat(60));
    console.log('\n🎉 ¡Despliegue completado exitosamente!');
    console.log('\n📝 Próximos pasos:');
    console.log('   1. Recarga la página web (Ctrl+R)');
    console.log('   2. Intenta unirte a una sala con un código válido');
    console.log('   3. Verifica los logs en la consola del navegador');
    console.log('\n💡 Para ver logs de Lambda en tiempo real:');
    console.log('   aws logs tail /aws/lambda/trinity-room-dev --follow --region eu-west-1\n');
    
  } catch (error) {
    console.error('\n❌ Error al desplegar a Lambda:');
    console.error(error.message);
    console.error('\n🔍 Verifica que:');
    console.error('   - AWS CLI esté instalado');
    console.error('   - Tus credenciales AWS estén configuradas');
    console.error('   - Tengas permisos para actualizar Lambda');
    process.exit(1);
  }
});

archive.on('error', (err) => {
  console.error('❌ Error al crear ZIP:', err);
  process.exit(1);
});

archive.pipe(output);

// Agregar archivos al ZIP
const srcPath = path.join(__dirname, 'infrastructure', 'src');
archive.directory(path.join(srcPath, 'handlers'), 'handlers');
archive.directory(path.join(srcPath, 'services'), 'services');
archive.directory(path.join(srcPath, 'utils'), 'utils');

archive.finalize();
