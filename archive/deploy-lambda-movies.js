/**
 * Script para compilar y desplegar la Lambda de películas actualizada
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Desplegando Lambda de películas actualizada...\n');

try {
  // 1. Compilar TypeScript
  console.log('📦 Compilando TypeScript...');
  execSync('npm run build', {
    cwd: path.join(__dirname, 'infrastructure'),
    stdio: 'inherit'
  });
  console.log('✅ Compilación exitosa\n');

  // 2. Desplegar con CDK
  console.log('☁️  Desplegando a AWS...');
  execSync('npm run deploy -- --require-approval never', {
    cwd: path.join(__dirname, 'infrastructure'),
    stdio: 'inherit'
  });
  console.log('✅ Despliegue exitoso\n');

  console.log('🎉 Lambda actualizada correctamente!');
  console.log('📝 Cambios aplicados:');
  console.log('   - Soporte para paginación (parámetro page)');
  console.log('   - Devuelve todas las películas de cada página (~20 por página)');
  console.log('   - Cache por página para mejor rendimiento');
  console.log('   - Soporte para hasta 500 páginas de TMDB');

} catch (error) {
  console.error('❌ Error durante el despliegue:', error.message);
  process.exit(1);
}
