/**
 * Script para verificar la configuración de AWS
 * Ejecutar: node verify-aws-config.js
 */

const AWS = require('aws-sdk');

async function verifyAWSConfig() {
    console.log('🔍 Verificando configuración de AWS...\n');
    
    try {
        // Configurar región
        AWS.config.update({ region: 'eu-west-1' });
        
        // Verificar configuración básica
        console.log('📋 Configuración actual:');
        console.log('   Region:', AWS.config.region || 'No configurada');
        console.log('   Access Key ID:', AWS.config.credentials?.accessKeyId ? 
            AWS.config.credentials.accessKeyId.substring(0, 8) + '...' : 'No configurada');
        
        // Probar conexión con STS (Security Token Service)
        console.log('\n🔐 Verificando identidad...');
        const sts = new AWS.STS();
        const identity = await sts.getCallerIdentity().promise();
        
        console.log('✅ Autenticación exitosa!');
        console.log('   Account ID:', identity.Account);
        console.log('   User ARN:', identity.Arn);
        console.log('   User ID:', identity.UserId);
        
        // Probar Lambda
        console.log('\n🚀 Verificando acceso a Lambda...');
        const lambda = new AWS.Lambda();
        const functions = await lambda.listFunctions({ MaxItems: 10 }).promise();
        console.log(`✅ Lambda accesible. Funciones encontradas: ${functions.Functions.length}`);
        
        // Buscar función específica
        const trinityFunction = functions.Functions.find(f => f.FunctionName === 'trinity-movie-dev');
        if (trinityFunction) {
            console.log('   ✅ Función trinity-movie-dev encontrada');
            console.log('   Runtime:', trinityFunction.Runtime);
            console.log('   Last Modified:', trinityFunction.LastModified);
        } else {
            console.log('   ⚠️ Función trinity-movie-dev no encontrada');
        }
        
        // Probar DynamoDB
        console.log('\n🗄️ Verificando acceso a DynamoDB...');
        const dynamodb = new AWS.DynamoDB();
        const tables = await dynamodb.listTables({ Limit: 10 }).promise();
        console.log(`✅ DynamoDB accesible. Tablas encontradas: ${tables.TableNames.length}`);
        
        if (tables.TableNames.length > 0) {
            console.log('   Tablas disponibles:');
            tables.TableNames.forEach(tableName => {
                console.log(`   - ${tableName}`);
            });
        }
        
        // Verificar tabla de caché específica
        const cacheTableExists = tables.TableNames.includes('trinity-filter-cache');
        if (cacheTableExists) {
            console.log('   ✅ Tabla trinity-filter-cache encontrada');
        } else {
            console.log('   ⚠️ Tabla trinity-filter-cache no encontrada (caché deshabilitado)');
        }
        
        console.log('\n🎉 ¡Configuración de AWS completamente funcional!');
        console.log('\n📋 Próximos pasos:');
        console.log('   1. Ejecutar: node deploy-lambda-only.js');
        console.log('   2. Probar: node test-simple-filtering.js');
        
    } catch (error) {
        console.error('\n❌ Error de configuración:', error?.message || error);
        console.log('\n🔧 Posibles soluciones:');
        
        if (error?.code === 'CredentialsError' || error?.message?.includes('Unable to locate credentials')) {
            console.log('   PROBLEMA: Credenciales no configuradas');
            console.log('   SOLUCIÓN 1: Configurar variables de entorno:');
            console.log('     Windows PowerShell:');
            console.log('       $env:AWS_ACCESS_KEY_ID = "YOUR_ACCESS_KEY_ID"');
            console.log('       $env:AWS_SECRET_ACCESS_KEY = "YOUR_SECRET_ACCESS_KEY"');
            console.log('       $env:AWS_DEFAULT_REGION = "eu-west-1"');
            console.log('   SOLUCIÓN 2: Configurar AWS CLI:');
            console.log('       aws configure');
            console.log('   SOLUCIÓN 3: Crear archivo .env con las credenciales');
        } else if (error?.code === 'UnauthorizedOperation' || error?.code === 'AccessDenied') {
            console.log('   PROBLEMA: Permisos insuficientes');
            console.log('   SOLUCIÓN: Verificar permisos IAM del usuario');
            console.log('   PERMISOS NECESARIOS:');
            console.log('     - lambda:ListFunctions');
            console.log('     - lambda:UpdateFunctionCode');
            console.log('     - lambda:GetFunctionConfiguration');
            console.log('     - dynamodb:ListTables');
            console.log('     - sts:GetCallerIdentity');
        } else if (error?.code === 'NetworkingError') {
            console.log('   PROBLEMA: Error de conectividad');
            console.log('   SOLUCIÓN: Verificar conexión a internet y configuración de proxy');
        } else {
            console.log('   PROBLEMA: Error desconocido');
            console.log('   SOLUCIÓN: Revisar documentación en CONFIGURACION_AWS_CREDENCIALES.md');
        }
        
        console.log('\n📖 Para más información, consultar:');
        console.log('   - CONFIGURACION_AWS_CREDENCIALES.md');
        console.log('   - https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html');
    }
}

// Verificar si se está ejecutando directamente
if (require.main === module) {
    verifyAWSConfig();
}

module.exports = { verifyAWSConfig };