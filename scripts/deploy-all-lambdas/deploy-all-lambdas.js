const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function deployAllLambdas() {
    console.log('🚀 Desplegando todas las lambdas...');
    
    const lambdaFunctions = [
        'trinity-ai-dev',
        'trinity-auth-dev',
        'trinity-movie-dev',
        'trinity-realtime-dev',
        'trinity-room-dev',
        'trinity-vote-dev'
    ];
    
    for (const functionName of lambdaFunctions) {
        try {
            console.log(`📦 Desplegando ${functionName}...`);
            
            const lambdaDir = path.resolve(__dirname, '../../lambdas', functionName);
            
            // Crear ZIP
            execSync(`zip -r function.zip . -x "*.git*" "README.md" "lambda-config.json"`, { 
                cwd: lambdaDir,
                stdio: 'inherit' 
            });
            
            // Desplegar
            execSync(`aws lambda update-function-code --function-name ${functionName} --zip-file fileb://${lambdaDir}/function.zip --region eu-west-1`, { stdio: 'inherit' });
            
            // Limpiar ZIP
            fs.unlinkSync(path.join(lambdaDir, 'function.zip'));
            
            console.log(`✅ ${functionName} desplegada correctamente`);
            
        } catch (error) {
            console.error(`❌ Error desplegando ${functionName}:`, error.message);
        }
    }
    
    console.log('\n🎉 ¡Deployment completado!');
}

deployAllLambdas();