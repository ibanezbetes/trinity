const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Compilando y desplegando fix para Lambda...\n');

try {
  // Paso 1: Compilar TypeScript
  console.log('📝 Compilando TypeScript...');
  
  // Ir al directorio raíz de infrastructure
  process.chdir('..');
  
  // Compilar solo los archivos que necesitamos
  execSync('npx tsc --target es2020 --module commonjs --outDir dist src/handlers/room.ts src/services/deepLinkService.ts src/utils/metrics.ts', {
    stdio: 'inherit'
  });
  
  console.log('✅ TypeScript compilado');
  
  // Paso 2: Crear estructura correcta para Lambda
  console.log('📦 Creando estructura para Lambda...');
  
  // Crear directorio temporal
  if (fs.existsSync('lambda-temp')) {
    execSync('rmdir /s /q lambda-temp', { shell: true });
  }
  fs.mkdirSync('lambda-temp');
  
  // Copiar archivos compilados
  if (fs.existsSync('dist')) {
    execSync('xcopy dist lambda-temp /E /I /Y', { shell: true });
  }
  
  // Copiar node_modules necesarios (solo los que usa Lambda)
  const requiredModules = ['@aws-sdk', 'uuid'];
  fs.mkdirSync('lambda-temp/node_modules', { recursive: true });
  
  for (const module of requiredModules) {
    const modulePath = `node_modules/${module}`;
    if (fs.existsSync(modulePath)) {
      execSync(`xcopy "${modulePath}" "lambda-temp/node_modules/${module}" /E /I /Y`, { shell: true });
    }
  }
  
  console.log('✅ Estructura creada');
  
  // Paso 3: Crear ZIP
  console.log('📦 Creando ZIP...');
  process.chdir('lambda-temp');
  
  execSync('powershell -Command "Compress-Archive -Path * -DestinationPath ../lambda-fixed.zip -Force"', {
    stdio: 'inherit'
  });
  
  process.chdir('..');
  console.log('✅ ZIP creado');
  
  // Paso 4: Desplegar
  console.log('☁️  Desplegando a AWS Lambda...');
  
  const result = execSync(
    'aws lambda update-function-code --function-name trinity-room-dev --zip-file fileb://lambda-fixed.zip --region eu-west-1',
    { encoding: 'utf-8' }
  );
  
  console.log('✅ Lambda actualizada exitosamente!');
  
  // Paso 5: Limpiar
  console.log('🧹 Limpiando archivos temporales...');
  if (fs.existsSync('lambda-temp')) {
    execSync('rmdir /s /q lambda-temp', { shell: true });
  }
  if (fs.existsSync('lambda-fixed.zip')) {
    fs.unlinkSync('lambda-fixed.zip');
  }
  if (fs.existsSync('dist')) {
    execSync('rmdir /s /q dist', { shell: true });
  }
  
  console.log('✅ Limpieza completada');
  
  console.log('\n🎉 ¡Despliegue completado!');
  console.log('\n📝 Próximos pasos:');
  console.log('   1. Intenta crear una sala desde la app');
  console.log('   2. Verifica que no aparezca el error de módulo');
  console.log('   3. Prueba unirte desde la web');
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  
  // Limpiar en caso de error
  try {
    if (fs.existsSync('lambda-temp')) {
      execSync('rmdir /s /q lambda-temp', { shell: true });
    }
    if (fs.existsSync('lambda-fixed.zip')) {
      fs.unlinkSync('lambda-fixed.zip');
    }
    if (fs.existsSync('dist')) {
      execSync('rmdir /s /q dist', { shell: true });
    }
  } catch (cleanupError) {
    console.error('Error en limpieza:', cleanupError.message);
  }
  
  process.exit(1);
}