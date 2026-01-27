// Script para obtener logs detallados de la Lambda
require('dotenv').config();

const { CloudWatchLogsClient, FilterLogEventsCommand, DescribeLogStreamsCommand } = require('@aws-sdk/client-cloudwatch-logs');

const config = {
    region: 'eu-west-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
};

const logsClient = new CloudWatchLogsClient(config);

async function main() {
    const logGroupName = '/aws/lambda/trinity-room-dev';
    
    try {
        console.log('📜 Buscando TODOS los logs de las últimas 2 horas...\n');
        
        const logsResponse = await logsClient.send(new FilterLogEventsCommand({
            logGroupName: logGroupName,
            startTime: Date.now() - (2 * 60 * 60 * 1000),
            limit: 100
        }));

        if (logsResponse.events && logsResponse.events.length > 0) {
            console.log(`Total eventos: ${logsResponse.events.length}\n`);
            
            // Buscar específicamente getUserRooms o getMyHistory
            const relevantEvents = logsResponse.events.filter(e => 
                e.message.includes('getUserRooms') || 
                e.message.includes('getMyHistory') ||
                e.message.includes('Historial')
            );
            
            console.log(`Eventos de getUserRooms/getMyHistory: ${relevantEvents.length}\n`);
            
            if (relevantEvents.length > 0) {
                relevantEvents.forEach(event => {
                    const time = new Date(event.timestamp).toLocaleTimeString();
                    console.log(`[${time}] ${event.message}`);
                    console.log('---');
                });
            } else {
                console.log('⚠️ No hay logs de getUserRooms - la Lambda NO está siendo invocada para esa operación');
                console.log('\nEsto significa que el problema está en el RESOLVER de AppSync, no en la Lambda.');
            }
            
            // Mostrar qué operaciones SÍ se están ejecutando
            console.log('\n📋 Operaciones que SÍ se ejecutan:');
            const operations = new Set();
            logsResponse.events.forEach(e => {
                if (e.message.includes('fieldName')) {
                    const match = e.message.match(/"fieldName":\s*"([^"]+)"/);
                    if (match) operations.add(match[1]);
                }
            });
            operations.forEach(op => console.log(`  - ${op}`));
            
        } else {
            console.log('No se encontraron logs');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

main();
