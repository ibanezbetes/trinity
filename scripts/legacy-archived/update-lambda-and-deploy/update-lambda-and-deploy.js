const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function updateLambdaAndDeploy() {
    console.log('🔄 Actualizando lambdas y desplegando con CDK...');
    
    try {
        // Primero, desplegar lambdas individualmente (más rápido)
        console.log('⚡ Desplegando lambdas individualmente...');
        const deployLambdasScript = path.resolve(__dirname, '../deploy-all-lambdas/deploy-all-lambdas.js');
        execSync(`node "${deployLambdasScript}"`, { stdio: 'inherit' });
        
        // Luego, hacer hotswap deployment con CDK para sincronizar
        console.log('\\n🔥 Ejecutando CDK hotswap deployment...');
        const cdkPath = path.resolve(__dirname, '../../infrastructure/clean');
        
        // Verificar que CDK esté listo
        if (!fs.existsSync(path.join(cdkPath, 'node_modules'))) {
            console.log('📦 Instalando dependencias CDK...');
            execSync('npm install', { cwd: cdkPath, stdio: 'inherit' });
        }
        
        // Compilar
        execSync('npm run build', { cwd: cdkPath, stdio: 'inherit' });
        
        // Hotswap deployment (más rápido para lambdas)
        execSync('npm run hotswap', { cwd: cdkPath, stdio: 'inherit' });
        
        console.log('\\n✅ Lambdas actualizadas y sincronizadas con CDK');
        
        // Verificar que las funciones estén actualizadas
        console.log('\\n🔍 Verificando funciones Lambda...');
        const lambdaFunctions = [
            'trinity-auth-dev',
            'trinity-cache-dev',
            'trinity-matchmaker-dev',
            'trinity-movie-dev',
            'trinity-realtime-dev',
            'trinity-room-dev',
            'trinity-vote-dev'
        ];
        
        for (const functionName of lambdaFunctions) {
            try {
                const result = execSync(`aws lambda get-function --function-name ${functionName} --region eu-west-1`, { encoding: 'utf8' });
                const functionInfo = JSON.parse(result);
                console.log(`✅ ${functionName}: ${functionInfo.Configuration.LastModified}`);
            } catch (error) {
                console.log(`⚠️  ${functionName}: Error verificando función`);
            }
        }
        
        console.log('\\n🎉 ¡Actualización completada!');
        
    } catch (error) {
        console.error('❌ Error durante la actualización:', error.message);
        process.exit(1);
    }
}

updateLambdaAndDeploy();