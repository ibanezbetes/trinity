/**
 * Script para limpiar todas las salas de prueba
 */

const AWS = require('aws-sdk');

// Configurar AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

async function cleanTestRooms() {
  console.log('🧹 Limpiando salas de prueba...');

  try {
    // Escanear todas las salas
    const scanParams = {
      TableName: 'TrinityStack-RoomsTable'
    };

    const result = await dynamodb.scan(scanParams).promise();
    
    if (!result.Items || result.Items.length === 0) {
      console.log('✅ No hay salas para limpiar');
      return;
    }

    console.log(`🔍 Encontradas ${result.Items.length} salas`);

    // Filtrar salas de prueba (que contengan "Búsqueda:" en el nombre)
    const testRooms = result.Items.filter(room => 
      room.name && (
        room.name.includes('Búsqueda:') || 
        room.name.includes('Test') ||
        room.name.includes('Prueba')
      )
    );

    if (testRooms.length === 0) {
      console.log('✅ No hay salas de prueba para limpiar');
      return;
    }

    console.log(`🗑️ Eliminando ${testRooms.length} salas de prueba...`);

    // Eliminar cada sala de prueba
    for (const room of testRooms) {
      try {
        const deleteParams = {
          TableName: 'TrinityStack-RoomsTable',
          Key: {
            id: room.id
          }
        };

        await dynamodb.delete(deleteParams).promise();
        console.log(`✅ Eliminada sala: ${room.name} (${room.id})`);
      } catch (error) {
        console.error(`❌ Error eliminando sala ${room.id}:`, error.message);
      }
    }

    console.log(`🎉 Limpieza completada. ${testRooms.length} salas eliminadas.`);

  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  cleanTestRooms().catch(console.error);
}

module.exports = { cleanTestRooms };
