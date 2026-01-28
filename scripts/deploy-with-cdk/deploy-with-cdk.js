const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function deployWithCDK() {
    console.log('🚀 Desplegando Trinity con CDK...');
    
    try {
        // Verificar que CDK esté configurado
        console.log('📋 Verificando configuración CDK...');
        
        const cdkPath = path.resolve(__dirname, '../../infrastructure/clean');
        
        if (!fs.existsSync(path.join(cdkPath, 'package.json'))) {
            throw new Error('CDK no está configurado. Ejecuta: cd infrastructure/clean && npm install');
        }
        
        // Instalar dependencias si es necesario
        if (!fs.existsSync(path.join(cdkPath, 'node_modules'))) {
            console.log('📦 Instalando dependencias CDK...');
            execSync('npm install', { cwd: cdkPath, stdio: 'inherit' });
        }
        
        // Compilar TypeScript
        console.log('🔨 Compilando código TypeScript...');
        execSync('npm run build', { cwd: cdkPath, stdio: 'inherit' });
        
        // Verificar bootstrap
        console.log('🏗️  Verificando CDK bootstrap...');
        try {
            execSync('cdk list', { cwd: cdkPath, stdio: 'pipe' });
        } catch (error) {
            console.log('⚠️  CDK no está bootstrapped, ejecutando bootstrap...');
            execSync('npm run bootstrap', { cwd: cdkPath, stdio: 'inherit' });
        }
        
        // Mostrar diferencias
        console.log('📊 Mostrando diferencias...');
        try {
            execSync('cdk diff', { cwd: cdkPath, stdio: 'inherit' });
        } catch (error) {
            console.log('ℹ️  No hay diferencias o es el primer deployment');
        }
        
        // Desplegar en orden
        const deploymentOrder = [
            'TrinityDatabaseStack',
            'TrinityLambdaStack', 
            'TrinityApiStack',
            'TrinityMainStack'
        ];
        
        for (const stackName of deploymentOrder) {
            console.log(`\\n🚀 Desplegando ${stackName}...`);
            execSync(`cdk deploy ${stackName} --require-approval never`, { 
                cwd: cdkPath, 
                stdio: 'inherit' 
            });
            console.log(`✅ ${stackName} desplegado exitosamente`);
        }
        
        // Obtener outputs
        console.log('\\n📋 Obteniendo información de deployment...');
        const outputs = execSync('cdk list', { cwd: cdkPath, encoding: 'utf8' });
        
        console.log('\\n🎉 ¡Deployment completado exitosamente!');
        console.log('\\n📊 Stacks desplegados:');
        console.log(outputs);
        
        // Guardar información de deployment
        const deploymentInfo = {
            timestamp: new Date().toISOString(),
            region: 'eu-west-1',
            stacks: deploymentOrder,
            status: 'success'
        };
        
        fs.writeFileSync('deployment-info.json', JSON.stringify(deploymentInfo, null, 2));
        console.log('\\n💾 Información de deployment guardada en deployment-info.json');
        
    } catch (error) {
        console.error('❌ Error durante el deployment:', error.message);
        process.exit(1);
    }
}

deployWithCDK();