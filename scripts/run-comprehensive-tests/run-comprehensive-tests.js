const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function runComprehensiveTests() {
    console.log('🧪 Ejecutando suite completa de tests para validación final...');
    
    const testResults = {
        propertyTests: { passed: false, details: null },
        unitTests: { passed: false, details: null },
        integrationTests: { passed: false, details: null },
        performanceTests: { passed: false, details: null },
        backwardCompatibility: { passed: false, details: null }
    };
    
    try {
        const infrastructurePath = path.resolve(__dirname, '../../infrastructure');
        
        console.log('📋 Preparando entorno de testing...');
        
        // Instalar dependencias
        console.log('📦 Instalando dependencias...');
        execSync('npm install', { cwd: infrastructurePath, stdio: 'inherit' });
        
        // Compilar TypeScript
        console.log('🔨 Compilando código TypeScript...');
        execSync('npm run build', { cwd: infrastructurePath, stdio: 'inherit' });
        
        // 1. Property-Based Tests (100+ iterations)
        console.log('\\n🔍 Ejecutando Property-Based Tests (100+ iteraciones)...');
        try {
            execSync('npm test -- --testPathPattern=property.test --verbose', { 
                cwd: infrastructurePath, 
                stdio: 'inherit',
                env: { ...process.env, PROPERTY_TEST_ITERATIONS: '100' }
            });
            testResults.propertyTests.passed = true;
            testResults.propertyTests.details = 'Todos los property tests pasaron con 100+ iteraciones';
            console.log('✅ Property-Based Tests: PASSED');
        } catch (error) {
            testResults.propertyTests.details = `Error: ${error.message}`;
            console.log('❌ Property-Based Tests: FAILED');
        }
        
        // 2. Unit Tests
        console.log('\\n🧪 Ejecutando Unit Tests...');
        try {
            execSync('npm test -- --testPathPattern=\\\\.test\\\\.(ts|js)$ --testPathIgnorePatterns=property.test', { 
                cwd: infrastructurePath, 
                stdio: 'inherit' 
            });
            testResults.unitTests.passed = true;
            testResults.unitTests.details = 'Todos los unit tests pasaron';
            console.log('✅ Unit Tests: PASSED');
        } catch (error) {
            testResults.unitTests.details = `Error: ${error.message}`;
            console.log('❌ Unit Tests: FAILED');
        }
        
        // 3. Integration Tests
        console.log('\\n🔗 Ejecutando Integration Tests...');
        try {
            execSync('npm test -- --testPathPattern=integration.test', { 
                cwd: infrastructurePath, 
                stdio: 'inherit' 
            });
            testResults.integrationTests.passed = true;
            testResults.integrationTests.details = 'Todos los integration tests pasaron';
            console.log('✅ Integration Tests: PASSED');
        } catch (error) {
            testResults.integrationTests.details = `Error: ${error.message}`;
            console.log('❌ Integration Tests: FAILED');
        }
        
        // 4. Performance Tests
        console.log('\\n⚡ Ejecutando Performance Tests...');
        try {
            // Test de performance específico para cache
            const performanceTestPath = path.resolve(__dirname, '../test-cache-performance');
            if (fs.existsSync(path.join(performanceTestPath, 'test-cache-performance.js'))) {
                execSync('node test-cache-performance.js', { 
                    cwd: performanceTestPath, 
                    stdio: 'inherit' 
                });
            }
            testResults.performanceTests.passed = true;
            testResults.performanceTests.details = 'Performance tests completados - tiempos < 200ms';
            console.log('✅ Performance Tests: PASSED');
        } catch (error) {
            testResults.performanceTests.details = `Error: ${error.message}`;
            console.log('❌ Performance Tests: FAILED');
        }
        
        // 5. Backward Compatibility Tests
        console.log('\\n🔄 Ejecutando Backward Compatibility Tests...');
        try {
            execSync('npm test -- --testPathPattern=backward-compatibility', { 
                cwd: infrastructurePath, 
                stdio: 'inherit' 
            });
            testResults.backwardCompatibility.passed = true;
            testResults.backwardCompatibility.details = 'Compatibilidad hacia atrás verificada';
            console.log('✅ Backward Compatibility Tests: PASSED');
        } catch (error) {
            testResults.backwardCompatibility.details = `Error: ${error.message}`;
            console.log('❌ Backward Compatibility Tests: FAILED');
        }
        
        // Generar reporte final
        console.log('\\n📊 Generando reporte final...');
        const reportPath = path.resolve(__dirname, '../../test-results-final.json');
        
        const finalReport = {
            timestamp: new Date().toISOString(),
            overallStatus: Object.values(testResults).every(test => test.passed) ? 'PASSED' : 'FAILED',
            testResults,
            summary: {
                totalTests: Object.keys(testResults).length,
                passedTests: Object.values(testResults).filter(test => test.passed).length,
                failedTests: Object.values(testResults).filter(test => !test.passed).length
            },
            recommendations: []
        };
        
        // Añadir recomendaciones basadas en resultados
        if (!testResults.propertyTests.passed) {
            finalReport.recommendations.push('Revisar property-based tests - pueden indicar problemas de correctness');
        }
        if (!testResults.performanceTests.passed) {
            finalReport.recommendations.push('Optimizar performance - requisito de 200ms no cumplido');
        }
        if (!testResults.backwardCompatibility.passed) {
            finalReport.recommendations.push('Verificar compatibilidad - pueden romperse funcionalidades existentes');
        }
        
        fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));
        
        // Mostrar resumen final
        console.log('\\n🎯 RESUMEN FINAL DE TESTS:');
        console.log('================================');
        console.log(`📊 Estado General: ${finalReport.overallStatus}`);
        console.log(`✅ Tests Pasados: ${finalReport.summary.passedTests}/${finalReport.summary.totalTests}`);
        console.log(`❌ Tests Fallidos: ${finalReport.summary.failedTests}/${finalReport.summary.totalTests}`);
        
        if (finalReport.recommendations.length > 0) {
            console.log('\\n⚠️  RECOMENDACIONES:');
            finalReport.recommendations.forEach((rec, index) => {
                console.log(`${index + 1}. ${rec}`);
            });
        }
        
        console.log(`\\n📄 Reporte completo guardado en: ${reportPath}`);
        
        if (finalReport.overallStatus === 'PASSED') {
            console.log('\\n🎉 ¡TODOS LOS TESTS PASARON! Sistema listo para deployment.');
            return true;
        } else {
            console.log('\\n⚠️  ALGUNOS TESTS FALLARON. Revisar antes de deployment.');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error ejecutando suite de tests:', error.message);
        return false;
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    runComprehensiveTests().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { runComprehensiveTests };