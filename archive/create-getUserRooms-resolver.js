// Script para crear el resolver getUserRooms en AppSync
require('dotenv').config();

const { AppSyncClient, CreateResolverCommand, GetResolverCommand } = require('@aws-sdk/client-appsync');

const config = {
    region: 'eu-west-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
};

const client = new AppSyncClient(config);
const apiId = 'epjtt2y3fzh53ii6omzj6n6h5a';

async function main() {
    try {
        console.log('🔧 Creando resolver para getUserRooms...\n');

        // Primero obtener el resolver de getMyHistory para copiar su configuración
        const getMyHistoryResolver = await client.send(new GetResolverCommand({
            apiId: apiId,
            typeName: 'Query',
            fieldName: 'getMyHistory'
        }));

        console.log('📋 Configuración de getMyHistory (para copiar):');
        console.log(`  DataSource: ${getMyHistoryResolver.resolver.dataSourceName}`);
        console.log(`  Kind: ${getMyHistoryResolver.resolver.kind}`);

        // Crear el resolver para getUserRooms con la misma configuración
        const createResult = await client.send(new CreateResolverCommand({
            apiId: apiId,
            typeName: 'Query',
            fieldName: 'getUserRooms',
            dataSourceName: getMyHistoryResolver.resolver.dataSourceName,
            kind: getMyHistoryResolver.resolver.kind,
            requestMappingTemplate: getMyHistoryResolver.resolver.requestMappingTemplate,
            responseMappingTemplate: getMyHistoryResolver.resolver.responseMappingTemplate,
            runtime: getMyHistoryResolver.resolver.runtime,
            code: getMyHistoryResolver.resolver.code
        }));

        console.log('\n✅ Resolver getUserRooms creado exitosamente!');
        console.log(`  ARN: ${createResult.resolver.resolverArn}`);

    } catch (error) {
        if (error.name === 'ConflictException') {
            console.log('⚠️ El resolver ya existe');
        } else {
            console.error('❌ Error:', error.message);
            console.error(error);
        }
    }
}

main();
