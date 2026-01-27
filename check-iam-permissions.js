/**
 * Script para verificar permisos IAM del usuario actual
 */

const AWS = require('aws-sdk');

AWS.config.update({ region: 'eu-west-1' });

async function checkIAMPermissions() {
    console.log('🔍 Verificando permisos IAM del usuario...\n');
    
    try {
        const iam = new AWS.IAM();
        const sts = new AWS.STS();
        
        // Obtener información del usuario actual
        const identity = await sts.getCallerIdentity().promise();
        console.log('👤 Usuario actual:', identity.Arn);
        
        // Extraer nombre de usuario del ARN
        const userName = identity.Arn.split('/').pop();
        console.log('📝 Nombre de usuario:', userName);
        
        // Obtener políticas adjuntas al usuario
        console.log('\n🔐 Verificando políticas adjuntas...');
        const attachedPolicies = await iam.listAttachedUserPolicies({
            UserName: userName
        }).promise();
        
        console.log('📋 Políticas adjuntas:');
        attachedPolicies.AttachedPolicies.forEach(policy => {
            console.log(`   - ${policy.PolicyName} (${policy.PolicyArn})`);
        });
        
        // Obtener políticas inline del usuario
        const inlinePolicies = await iam.listUserPolicies({
            UserName: userName
        }).promise();
        
        if (inlinePolicies.PolicyNames.length > 0) {
            console.log('\n📄 Políticas inline:');
            inlinePolicies.PolicyNames.forEach(policyName => {
                console.log(`   - ${policyName}`);
            });
        }
        
        // Obtener grupos del usuario
        const userGroups = await iam.getGroupsForUser({
            UserName: userName
        }).promise();
        
        if (userGroups.Groups.length > 0) {
            console.log('\n👥 Grupos del usuario:');
            for (const group of userGroups.Groups) {
                console.log(`   - ${group.GroupName}`);
                
                // Obtener políticas del grupo
                const groupPolicies = await iam.listAttachedGroupPolicies({
                    GroupName: group.GroupName
                }).promise();
                
                groupPolicies.AttachedPolicies.forEach(policy => {
                    console.log(`     └─ ${policy.PolicyName}`);
                });
            }
        }
        
        // Verificar permisos específicos necesarios
        console.log('\n🧪 Verificando permisos específicos...');
        
        const requiredPermissions = [
            { service: 'Lambda', action: 'listFunctions' },
            { service: 'Lambda', action: 'updateFunctionCode' },
            { service: 'DynamoDB', action: 'listTables' },
            { service: 'DynamoDB', action: 'scan' },
            { service: 'AppSync', action: 'listGraphqlApis' }
        ];
        
        for (const perm of requiredPermissions) {
            try {
                if (perm.service === 'Lambda' && perm.action === 'listFunctions') {
                    const lambda = new AWS.Lambda();
                    await lambda.listFunctions({ MaxItems: 1 }).promise();
                    console.log(`   ✅ ${perm.service}:${perm.action}`);
                } else if (perm.service === 'DynamoDB' && perm.action === 'listTables') {
                    const dynamodb = new AWS.DynamoDB();
                    await dynamodb.listTables({ Limit: 1 }).promise();
                    console.log(`   ✅ ${perm.service}:${perm.action}`);
                } else {
                    console.log(`   ⏭️ ${perm.service}:${perm.action} (no probado)`);
                }
            } catch (error) {
                console.log(`   ❌ ${perm.service}:${perm.action} - ${error.code}`);
            }
        }
        
        console.log('\n🎯 DIAGNÓSTICO:');
        
        // Verificar si tiene políticas de administrador
        const hasAdminPolicy = attachedPolicies.AttachedPolicies.some(policy => 
            policy.PolicyName.includes('Administrator') || 
            policy.PolicyArn.includes('AdministratorAccess')
        );
        
        if (hasAdminPolicy) {
            console.log('   ✅ Usuario tiene permisos de administrador');
        } else {
            console.log('   ⚠️ Usuario NO tiene permisos de administrador');
            console.log('   💡 Puede necesitar políticas específicas para Lambda y DynamoDB');
        }
        
    } catch (error) {
        console.error('❌ Error verificando permisos IAM:', error.message);
        
        if (error.code === 'AccessDenied') {
            console.log('\n🔧 SOLUCIÓN:');
            console.log('   El usuario no tiene permisos para ver información de IAM');
            console.log('   Contactar al administrador de AWS para:');
            console.log('   1. Verificar permisos del usuario');
            console.log('   2. Agregar políticas necesarias:');
            console.log('      - AWSLambdaFullAccess');
            console.log('      - AmazonDynamoDBFullAccess');
            console.log('      - AWSAppSyncAdministrator');
        }
    }
}

checkIAMPermissions().catch(console.error);