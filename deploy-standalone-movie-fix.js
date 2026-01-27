/**
 * Deploy standalone movie handler with poster path fix
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

console.log('\n🖼️ Desplegando Movie Handler Standalone con Fix de Poster Paths\n');
console.log('='.repeat(60));

// Paso 1: Crear ZIP con el handler standalone
console.log('\n📦 Paso 1: Creando archivo ZIP...');

const output = fs.createWriteStream(path.join(__dirname, 'movie-standalone.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', async () => {
  console.log(`✅ ZIP creado: ${archive.pointer()} bytes`);
  
  // Paso 2: Desplegar a Lambda
  console.log('\n☁️  Paso 2: Desplegando a AWS Lambda trinity-movie-dev...');
  
  try {
    const result = execSync(
      'aws lambda update-function-code --function-name trinity-movie-dev --zip-file fileb://movie-standalone.zip --region eu-west-1',
      { encoding: 'utf-8', cwd: __dirname }
    );
    
    console.log('✅ Lambda actualizada exitosamente!');
    console.log('\nRespuesta de AWS:');
    console.log(JSON.stringify(JSON.parse(result), null, 2));
    
    // Paso 3: Limpiar
    console.log('\n🧹 Paso 3: Limpiando archivos temporales...');
    fs.unlinkSync(path.join(__dirname, 'movie-standalone.zip'));
    console.log('✅ Limpieza completada');
    
    console.log('\n' + '='.repeat(60));
    console.log('\n🎉 ¡Despliegue completado exitosamente!');
    console.log('\n📝 Próximos pasos:');
    console.log('   1. Ejecuta: node fix-poster-paths.js');
    console.log('   2. Verifica que los posters ahora muestren URLs completas');
    console.log('   3. Prueba la app móvil para ver las carátulas');
    console.log('\n💡 Para ver logs de Lambda en tiempo real:');
    console.log('   aws logs tail /aws/lambda/trinity-movie-dev --follow --region eu-west-1\n');
    
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

// Agregar solo el archivo standalone
const standaloneHandlerPath = path.join(__dirname, 'infrastructure', 'movie-handler-standalone.js');
if (fs.existsSync(standaloneHandlerPath)) {
  console.log('📁 Agregando movie-handler-standalone.js como movie.js...');
  archive.file(standaloneHandlerPath, { name: 'movie.js' });
} else {
  console.error('❌ No se encontró el archivo movie-handler-standalone.js');
  process.exit(1);
}

archive.finalize();
