const { execSync } = require('child_process');
const path = require('path');

async function testDeploymentIntegration() {
    console.log('🧪 Ejecutando tests de integración de deployment...');
    
    try {
        const testPath = path.resolve(__dirname, '../../infrastructure/src/tests');
        
        console.log('📋 Verificando configuración de tests...');
        
        // Verificar que las dependencias estén instaladas
        console.log('📦 Instalando dependencias de testing...');
        execSync('npm install', { 
            cwd: path.resolve(__dirname, '../../infrastructure'), 
            stdio: 'inherit' 
        });
        
        // Compilar TypeScript si es necesario
        console.log('🔨 Compilando tests TypeScript...');
        execSync('npm run build', { 
            cwd: path.resolve(__dirname, '../../infrastructure'), 
            stdio: 'inherit' 
        });
        
        // Ejecutar tests de integración específicos
        console.log('🚀 Ejecutando tests de integración de deployment...');
        execSync('npm test -- --testPathPattern=deployment-integration.test', { 
            cwd: path.resolve(__dirname, '../../infrastructure'), 
            stdio: 'inherit' 
        });
        
        console.log('✅ Tests de integración completados exitosamente');
        
        // Ejecutar tests de property-based para validación adicional
        console.log('🔍 Ejecutando property-based tests para validación...');
        execSync('npm test -- --testPathPattern=property.test', { 
            cwd: path.resolve(__dirname, '../../infrastructure'), 
            stdio: 'inherit' 
        });
        
        console.log('🎉 ¡Todos los tests de deployment pasaron exitosamente!');
        
        // Generar reporte de cobertura
        console.log('📊 Generando reporte de cobertura...');
        try {
            execSync('npm run test:coverage', { 
                cwd: path.resolve(__dirname, '../../infrastructure'), 
                stdio: 'inherit' 
            });
        } catch (coverageError) {
            console.log('⚠️  Reporte de cobertura no disponible (opcional)');
        }
        
    } catch (error) {
        console.error('❌ Error en tests de integración:', error.message);
        
        // Mostrar información de debugging
        console.log('\\n🔍 Información de debugging:');
        console.log('- Verificar que las tablas DynamoDB estén creadas');
        console.log('- Verificar que las funciones Lambda estén desplegadas');
        console.log('- Verificar credenciales AWS y región eu-west-1');
        console.log('- Verificar variables de entorno en las funciones Lambda');
        
        process.exit(1);
    }
}

testDeploymentIntegration();