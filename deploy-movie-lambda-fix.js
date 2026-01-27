/**
 * Script para desplegar el fix de poster paths al Lambda de movies
 * Ejecutar: node deploy-movie-lambda-fix.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

console.log('\n🖼️ Desplegando Fix de Poster Paths a AWS Lambda\n');
console.log('='.repeat(60));

// Paso 1: Crear ZIP con el código actualizado
console.log('\n📦 Paso 1: Creando archivo ZIP...');

const output = fs.createWriteStream(path.join(__dirname, 'movie-lambda-fix.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', async () => {
  console.log(`✅ ZIP creado: ${archive.pointer()} bytes`);
  
  // Paso 2: Desplegar a Lambda
  console.log('\n☁️  Paso 2: Desplegando a AWS Lambda trinity-movie-dev...');
  
  try {
    const result = execSync(
      'aws lambda update-function-code --function-name trinity-movie-dev --zip-file fileb://movie-lambda-fix.zip --region eu-west-1',
      { encoding: 'utf-8', cwd: __dirname }
    );
    
    console.log('✅ Lambda actualizada exitosamente!');
    console.log('\nRespuesta de AWS:');
    console.log(JSON.stringify(JSON.parse(result), null, 2));
    
    // Paso 3: Limpiar
    console.log('\n🧹 Paso 3: Limpiando archivos temporales...');
    fs.unlinkSync(path.join(__dirname, 'movie-lambda-fix.zip'));
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

// Agregar archivos al ZIP
const srcPath = path.join(__dirname, 'infrastructure', 'src');
const distPath = path.join(__dirname, 'infrastructure', 'dist');

// Agregar el archivo movie.js directamente en la raíz del ZIP
const movieJsPath = path.join(srcPath, 'handlers', 'movie.js');
if (fs.existsSync(movieJsPath)) {
  console.log('📁 Agregando movie.js en la raíz del ZIP...');
  archive.file(movieJsPath, { name: 'movie.js' });
} else {
  console.log('⚠️ No se encontró movie.js compilado en src, intentando dist...');
  const movieDistPath = path.join(distPath, 'handlers', 'movie.js');
  if (fs.existsSync(movieDistPath)) {
    archive.file(movieDistPath, { name: 'movie.js' });
  } else {
    console.log('⚠️ No se encontró movie.js, usando TypeScript...');
    const movieTsPath = path.join(srcPath, 'handlers', 'movie.ts');
    if (fs.existsSync(movieTsPath)) {
      archive.file(movieTsPath, { name: 'movie.js' });
    }
  }
}

// Agregar las dependencias manteniendo la estructura de directorios esperada
if (fs.existsSync(distPath)) {
  console.log('📁 Agregando archivos compilados desde dist/...');
  archive.directory(path.join(distPath, 'services'), 'services');
  archive.directory(path.join(distPath, 'types'), 'types');
  if (fs.existsSync(path.join(distPath, 'utils'))) {
    archive.directory(path.join(distPath, 'utils'), 'utils');
  }
}

// Agregar archivos fuente como respaldo
console.log('📁 Agregando archivos fuente desde src/...');
archive.directory(path.join(srcPath, 'services'), 'services');
archive.directory(path.join(srcPath, 'types'), 'types');
if (fs.existsSync(path.join(srcPath, 'utils'))) {
  archive.directory(path.join(srcPath, 'utils'), 'utils');
}

// También incluir los archivos compilados de lib si existen
const libPath = path.join(__dirname, 'infrastructure', 'lib');
if (fs.existsSync(libPath)) {
  console.log('📁 Agregando archivos desde lib/...');
  if (fs.existsSync(path.join(libPath, 'services'))) {
    archive.directory(path.join(libPath, 'services'), 'services');
  }
  if (fs.existsSync(path.join(libPath, 'types'))) {
    archive.directory(path.join(libPath, 'types'), 'types');
  }
  if (fs.existsSync(path.join(libPath, 'utils'))) {
    archive.directory(path.join(libPath, 'utils'), 'utils');
  }
}

archive.finalize();
