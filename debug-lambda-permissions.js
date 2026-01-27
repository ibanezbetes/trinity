/**
 * Script para diagnosticar problemas específicos de Lambda
 */

const AWS = require('aws-sdk');

AWS.config.update({ region: 'eu-west-1' });

async function debugLambdaPermissions() {
    console.log('🔍 Diagnosticando problemas de Lambda...\n');
    
    try {
        const lambda = new AWS.Lambda();
        
        // Listar funciones Lambda
        console.log('📋 Listando funciones Lambda...');
        const functions = await lambda.listFunctions().promise();
        
        console.log(`✅ Encontradas ${functions.Functions.length} funciones:`);
        functions.Functions.forEach(func => {
            console.log(`   - ${func.FunctionName} (${func.Runtime})`);
        });
        
        // Buscar la función específica que está fallando
        const getUserRoomsFunction = functions.Functions.find(f => 
            f.FunctionName.includes('getUserRooms') || 
            f.FunctionName.includes('trinity') ||
            f.FunctionName.includes('room')
        );
        
        if (getUserRoomsFunction) {
            console.log(`\n🎯 Analizando función: ${getUserRoomsFunction.FunctionName}`);
            
            // Obtener configuración de la función
            const config = await lambda.getFunctionConfiguration({
                FunctionName: getUserRoomsFunction.FunctionName
            }).promise();
            
            console.log('📋 Configuración de la función:');
            console.log(`   - Runtime: ${config.Runtime}`);
            console.log(`   - Handler: ${config.Handler}`);
            console.log(`   - Role: ${config.Role}`);
            console.log(`   - Timeout: ${config.Timeout}s`);
            console.log(`   - Memory: ${config.MemorySize}MB`);
            console.log(`   - Last Modified: ${config.LastModified}`);
            
            // Verificar el rol de ejecución
            console.log('\n🔐 Verificando rol de ejecución...');
            const iam = new AWS.IAM();
            
            try {
                const roleName = config.Role.split('/').pop();
                console.log(`   - Nombre del rol: ${roleName}`);
                
                const roleInfo = await iam.getRole({ RoleName: roleName }).promise();
                console.log(`   - Rol creado: ${roleInfo.Role.CreateDate}`);
                
                // Obtener políticas del rol
                const rolePolicies = await iam.listAttachedRolePolicies({ RoleName: roleName }).promise();
                console.log('   - Políticas adjuntas:');
                rolePolicies.AttachedPolicies.forEach(policy => {
                    console.log(`     └─ ${policy.PolicyName}`);
                });
                
            } catch (roleError) {
                console.log(`   ❌ Error verificando rol: ${roleError.message}`);
            }
            
            // Probar invocación de la función
            console.log('\n🧪 Probando invocación de función...');
            try {
                const testPayload = {
                    arguments: {},
                    identity: {
                        sub: 'test-user-id',
                        username: 'test-user'
                    }
                };
                
                const result = await lambda.invoke({
                    FunctionName: getUserRoomsFunction.FunctionName,
                    Payload: JSON.stringify(testPayload),
                    InvocationType: 'RequestResponse'
                }).promise();
                
                console.log('✅ Función invocada exitosamente');
                console.log(`   - Status Code: ${result.StatusCode}`);
                
                if (result.Payload) {
                    const payload = JSON.parse(result.Payload);
                    if (payload.errorMessage) {
                        console.log(`   ❌ Error en función: ${payload.errorMessage}`);
                        console.log(`   📋 Stack trace: ${payload.errorType}`);
                    } else {
                        console.log('   ✅ Función ejecutada sin errores');
                    }
                }
                
            } catch (invokeError) {
                console.log(`   ❌ Error invocando función: ${invokeError.message}`);
            }
            
        } else {
            console.log('\n⚠️ No se encontró función específica para getUserRooms');
            console.log('📋 Funciones disponibles:');
            functions.Functions.forEach(func => {
                console.log(`   - ${func.FunctionName}`);
            });
        }
        
        // Verificar DynamoDB
        console.log('\n🗄️ Verificando acceso a DynamoDB...');
        const dynamodb = new AWS.DynamoDB();
        const tables = await dynamodb.listTables().promise();
        
        console.log(`✅ DynamoDB accesible. Tablas encontradas: ${tables.TableNames.length}`);
        tables.TableNames.forEach(tableName => {
            console.log(`   - ${tableName}`);
        });
        
    } catch (error) {
        console.error('❌ Error en diagnóstico:', error.message);
        console.log('📋 Detalles del error:', error.code);
    }
}

debugLambdaPermissions().catch(console.error);