// Script para verificar la configuración de la Lambda RoomHandler
require('dotenv').config();

const { LambdaClient, ListFunctionsCommand, GetFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');
const { CloudWatchLogsClient, DescribeLogGroupsCommand, GetLogEventsCommand, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');

const config = {
    region: 'eu-west-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
};

const lambdaClient = new LambdaClient(config);
const logsClient = new CloudWatchLogsClient(config);

async function main() {
    try {
        // 1. Listar funciones Lambda relacionadas con Room
        console.log('🔍 Buscando funciones Lambda...\n');
        
        const listResponse = await lambdaClient.send(new ListFunctionsCommand({}));
        const roomFunctions = listResponse.Functions.filter(f => 
            f.FunctionName.toLowerCase().includes('room') || 
            f.FunctionName.toLowerCase().includes('trinity')
        );

        console.log('📋 Funciones encontradas:');
        roomFunctions.forEach(f => {
            console.log(`  - ${f.FunctionName}`);
        });

        // 2. Obtener configuración de la función Room
        const roomHandler = roomFunctions.find(f => f.FunctionName.toLowerCase().includes('room'));
        
        if (roomHandler) {
            console.log(`\n🔧 Configuración de ${roomHandler.FunctionName}:\n`);
            
            const configResponse = await lambdaClient.send(new GetFunctionConfigurationCommand({
                FunctionName: roomHandler.FunctionName
            }));

            console.log('Variables de entorno:');
            if (configResponse.Environment && configResponse.Environment.Variables) {
                Object.entries(configResponse.Environment.Variables).forEach(([key, value]) => {
                    // Ocultar valores sensibles
                    const displayValue = key.includes('KEY') || key.includes('SECRET') ? '***' : value;
                    console.log(`  ${key}: ${displayValue}`);
                });
            } else {
                console.log('  ⚠️ No hay variables de entorno configuradas!');
            }

            // 3. Buscar logs recientes
            console.log('\n📜 Buscando logs recientes...\n');
            
            const logGroupName = `/aws/lambda/${roomHandler.FunctionName}`;
            
            try {
                const logsResponse = await logsClient.send(new FilterLogEventsCommand({
                    logGroupName: logGroupName,
                    filterPattern: 'getUserRooms OR getMyHistory OR ERROR',
                    limit: 20,
                    startTime: Date.now() - (60 * 60 * 1000) // Última hora
                }));

                if (logsResponse.events && logsResponse.events.length > 0) {
                    console.log('Últimos logs relevantes:');
                    logsResponse.events.slice(-10).forEach(event => {
                        const time = new Date(event.timestamp).toLocaleTimeString();
                        console.log(`  [${time}] ${event.message.substring(0, 200)}`);
                    });
                } else {
                    console.log('  No se encontraron logs recientes');
                }
            } catch (logError) {
                console.log('  ⚠️ No se pudo acceder a los logs:', logError.message);
            }
        } else {
            console.log('\n⚠️ No se encontró función Lambda de Room');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

main();
