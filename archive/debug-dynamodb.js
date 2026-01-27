// Script para debuggear DynamoDB y obtener salas del usuario
const { DynamoDBClient, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

// Load credentials from .env file
require('dotenv').config();

const client = new DynamoDBClient({
    region: 'eu-west-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);

// Simular exactamente lo que hace la Lambda getUserRooms
async function getUserRooms(userId) {
    console.log(`\n📋 Obteniendo salas para userId: ${userId}\n`);
    
    // Paso 1: Query GSI UserHistoryIndex
    console.log('Paso 1: Query GSI UserHistoryIndex...');
    const response = await docClient.send(new QueryCommand({
        TableName: 'trinity-room-members-dev',
        IndexName: 'UserHistoryIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
            ':userId': userId,
        },
        ScanIndexForward: false,
        Limit: 50,
    }));

    console.log(`  Encontrados ${response.Items?.length || 0} membresías`);
    
    if (!response.Items || response.Items.length === 0) {
        console.log('  No hay membresías para este usuario');
        return [];
    }

    // Paso 2: Obtener detalles de cada sala
    console.log('\nPaso 2: Obteniendo detalles de cada sala...');
    const rooms = [];
    
    for (const member of response.Items) {
        console.log(`  - Buscando sala ${member.roomId}...`);
        try {
            const roomResponse = await docClient.send(new GetCommand({
                TableName: 'trinity-rooms-dev-v2',
                Key: { PK: member.roomId, SK: 'ROOM' },
            }));

            if (roomResponse.Item) {
                console.log(`    ✅ Encontrada: ${roomResponse.Item.name}`);
                rooms.push({
                    id: roomResponse.Item.roomId,
                    name: roomResponse.Item.name,
                    inviteCode: roomResponse.Item.inviteCode,
                    status: roomResponse.Item.status,
                    memberCount: roomResponse.Item.memberCount,
                });
            } else {
                console.log(`    ❌ No encontrada (Item null)`);
            }
        } catch (error) {
            console.log(`    ❌ Error: ${error.message}`);
        }
    }

    return rooms;
}

async function main() {
    try {
        // Usuario test@trinity.com
        const userId = '3205a484-80e1-7058-303f-b64f983e7cb6';
        const rooms = await getUserRooms(userId);
        
        console.log('\n📋 Resultado final:');
        console.log(JSON.stringify(rooms, null, 2));

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

main();
