const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * Script para limpiar TODOS los datos de prueba de Trinity
 * ⚠️ CUIDADO: Este script borra TODOS los datos de las tablas
 * Solo usar en desarrollo/testing, NUNCA en producción
 */

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'eu-west-1' }));

// Tablas a limpiar
const TABLES_TO_CLEAN = [
  'trinity-rooms-dev-v2',
  'trinity-room-members-dev', 
  'trinity-room-invites-dev-v2',
  'trinity-votes-dev',
  'trinity-room-matches-dev',
  'trinity-connections-dev',
  'trinity-room-movie-cache-dev',
  'trinity-room-cache-metadata-dev',
  'trinity-matchmaking-dev'
];

// Tablas que NO se deben tocar (datos de usuarios y cache de películas global)
const PROTECTED_TABLES = [
  'trinity-users-dev',        // Mantener usuarios registrados
  'trinity-movies-cache-dev'  // Mantener cache global de películas
];

/**
 * Borra todos los elementos de una tabla usando batch delete
 */
async function clearTable(tableName) {
  console.log(`🧹 Limpiando tabla: ${tableName}`);
  
  try {
    let itemsDeleted = 0;
    let lastEvaluatedKey = undefined;
    
    do {
      // Escanear la tabla para obtener todas las claves
      const scanParams = {
        TableName: tableName,
        ProjectionExpression: '#pk, #sk',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK'
        },
        Limit: 25, // Procesar en lotes de 25 (máximo para BatchWrite)
        ExclusiveStartKey: lastEvaluatedKey
      };

      // Para tablas que no usan PK/SK, usar las claves primarias específicas
      if (tableName === 'trinity-room-members-dev') {
        scanParams.ProjectionExpression = 'roomId, userId';
        scanParams.ExpressionAttributeNames = {};
      } else if (tableName === 'trinity-votes-dev') {
        scanParams.ProjectionExpression = 'voteId';
        scanParams.ExpressionAttributeNames = {};
      } else if (tableName === 'trinity-connections-dev') {
        scanParams.ProjectionExpression = 'connectionId';
        scanParams.ExpressionAttributeNames = {};
      } else if (tableName === 'trinity-room-movie-cache-dev') {
        scanParams.ProjectionExpression = 'roomId, sequenceIndex';
        scanParams.ExpressionAttributeNames = {};
      } else if (tableName === 'trinity-room-cache-metadata-dev') {
        scanParams.ProjectionExpression = 'roomId';
        scanParams.ExpressionAttributeNames = {};
      } else if (tableName === 'trinity-matchmaking-dev') {
        scanParams.ProjectionExpression = 'matchId';
        scanParams.ExpressionAttributeNames = {};
      }

      const scanResult = await dynamoClient.send(new ScanCommand(scanParams));
      
      if (!scanResult.Items || scanResult.Items.length === 0) {
        break;
      }

      // Preparar batch delete
      const deleteRequests = scanResult.Items.map(item => {
        let key;
        
        if (tableName === 'trinity-room-members-dev') {
          key = { roomId: item.roomId, userId: item.userId };
        } else if (tableName === 'trinity-votes-dev') {
          key = { voteId: item.voteId };
        } else if (tableName === 'trinity-connections-dev') {
          key = { connectionId: item.connectionId };
        } else if (tableName === 'trinity-room-movie-cache-dev') {
          key = { roomId: item.roomId, sequenceIndex: item.sequenceIndex };
        } else if (tableName === 'trinity-room-cache-metadata-dev') {
          key = { roomId: item.roomId };
        } else if (tableName === 'trinity-matchmaking-dev') {
          key = { matchId: item.matchId };
        } else {
          // Tablas con PK/SK
          key = { PK: item.PK, SK: item.SK };
        }

        return {
          DeleteRequest: { Key: key }
        };
      });

      // Ejecutar batch delete
      if (deleteRequests.length > 0) {
        const batchParams = {
          RequestItems: {
            [tableName]: deleteRequests
          }
        };

        await dynamoClient.send(new BatchWriteCommand(batchParams));
        itemsDeleted += deleteRequests.length;
        console.log(`   ✅ Borrados ${deleteRequests.length} elementos (total: ${itemsDeleted})`);
      }

      lastEvaluatedKey = scanResult.LastEvaluatedKey;
      
      // Pequeña pausa para no sobrecargar DynamoDB
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } while (lastEvaluatedKey);

    console.log(`✅ Tabla ${tableName} limpiada: ${itemsDeleted} elementos borrados`);
    return itemsDeleted;

  } catch (error) {
    console.error(`❌ Error limpiando tabla ${tableName}:`, error);
    throw error;
  }
}

/**
 * Función principal
 */
async function cleanupAllTestData() {
  console.log('🚨 LIMPIEZA COMPLETA DE DATOS DE PRUEBA DE TRINITY');
  console.log('⚠️  Este script borrará TODOS los datos de las siguientes tablas:');
  console.log(`   ${TABLES_TO_CLEAN.join(', ')}`);
  console.log('');
  console.log('📋 Tablas protegidas (NO se borrarán):');
  console.log(`   ${PROTECTED_TABLES.join(', ')}`);
  console.log('');
  
  // Confirmación de seguridad
  console.log('⏳ Iniciando limpieza en 3 segundos...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  let totalItemsDeleted = 0;
  const startTime = Date.now();

  try {
    for (const tableName of TABLES_TO_CLEAN) {
      const itemsDeleted = await clearTable(tableName);
      totalItemsDeleted += itemsDeleted;
    }

    const duration = Date.now() - startTime;
    
    console.log('');
    console.log('🎉 LIMPIEZA COMPLETADA EXITOSAMENTE');
    console.log(`📊 Resumen:`);
    console.log(`   • Tablas limpiadas: ${TABLES_TO_CLEAN.length}`);
    console.log(`   • Elementos borrados: ${totalItemsDeleted}`);
    console.log(`   • Tiempo total: ${(duration / 1000).toFixed(2)}s`);
    console.log('');
    console.log('✅ Trinity está listo para empezar con datos limpios');
    console.log('👥 Los usuarios registrados se mantuvieron intactos');
    console.log('🎬 El cache global de películas se mantuvo intacto');

  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
    process.exit(1);
  }
}

// Ejecutar solo si se llama directamente
if (require.main === module) {
  cleanupAllTestData();
}

module.exports = { cleanupAllTestData };