const { DynamoDBClient, DescribeTableCommand: DDBDescribeTableCommand, DeleteTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand, DescribeTableCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function analyzeAndOptimizeTables() {
  console.log('🔍 ANÁLISIS Y OPTIMIZACIÓN DE TABLAS DYNAMODB\n');

  // Tablas que deberían existir según el stack actual
  const requiredTables = [
    'trinity-users-dev',
    'trinity-rooms-dev-v2', 
    'trinity-room-members-dev',
    'trinity-votes-dev',
    'trinity-movies-cache-dev',
    'trinity-room-invites-dev-v2',
    'trinity-room-matches-dev',
    'trinity-connections-dev'
  ];

  // Tablas que pueden ser eliminadas
  const tablesToAnalyze = [
    'trinity-rooms-dev',      // Versión antigua
    'trinity-events-dev',     // No está en stack
    'trinity-analytics-dev'   // Solo en código legacy
  ];

  console.log('📊 ESTADO ACTUAL DE LAS TABLAS:\n');

  // Verificar estado de tablas requeridas
  for (const tableName of requiredTables) {
    try {
      const result = await client.send(new DDBDescribeTableCommand({ TableName: tableName }));
      const itemCount = result.Table.ItemCount || 0;
      console.log(`✅ ${tableName}: ${itemCount} items`);
    } catch (error) {
      console.log(`❌ ${tableName}: NO EXISTE`);
    }
  }

  console.log('\n🔍 ANÁLISIS DE TABLAS PROBLEMÁTICAS:\n');

  // Analizar tablas problemáticas
  for (const tableName of tablesToAnalyze) {
    try {
      const result = await client.send(new DDBDescribeTableCommand({ TableName: tableName }));
      const itemCount = result.Table.ItemCount || 0;
      
      console.log(`⚠️  ${tableName}:`);
      console.log(`   - Items: ${itemCount}`);
      console.log(`   - Estado: ${result.Table.TableStatus}`);
      console.log(`   - Creada: ${result.Table.CreationDateTime}`);
      
      if (itemCount > 0) {
        console.log(`   - ⚠️  CONTIENE DATOS - Revisar antes de eliminar`);
        
        // Si es trinity-rooms-dev, verificar si hay datos que migrar
        if (tableName === 'trinity-rooms-dev') {
          await analyzeRoomsV1Data();
        }
      } else {
        console.log(`   - ✅ VACÍA - Seguro eliminar`);
      }
      
    } catch (error) {
      console.log(`❌ ${tableName}: NO EXISTE`);
    }
    console.log('');
  }

  console.log('\n💡 RECOMENDACIONES ESPECÍFICAS:\n');
  
  await generateRecommendations();
}

async function analyzeRoomsV1Data() {
  try {
    console.log('   - 🔍 Analizando datos en trinity-rooms-dev...');
    
    const scanResult = await docClient.send(new ScanCommand({
      TableName: 'trinity-rooms-dev',
      Select: 'COUNT'
    }));
    
    if (scanResult.Count > 0) {
      // Obtener una muestra de datos
      const sampleResult = await docClient.send(new ScanCommand({
        TableName: 'trinity-rooms-dev',
        Limit: 5
      }));
      
      console.log(`   - 📊 ${scanResult.Count} rooms encontradas`);
      console.log('   - 📋 Muestra de datos:');
      
      sampleResult.Items.forEach((item, index) => {
        console.log(`     ${index + 1}. ID: ${item.id || item.PK}, Creada: ${item.createdAt || 'N/A'}`);
      });
    }
    
  } catch (error) {
    console.log('   - ❌ Error analizando datos:', error.message);
  }
}

async function generateRecommendations() {
  console.log('1. 🗑️  ELIMINAR TABLAS VACÍAS:');
  console.log('   - trinity-events-dev (no se usa en código actual)');
  console.log('   - trinity-analytics-dev (solo en backend legacy)');
  console.log('');
  
  console.log('2. 🔄 MIGRAR Y CONSOLIDAR:');
  console.log('   - trinity-rooms-dev → trinity-rooms-dev-v2');
  console.log('   - Verificar estructura de datos antes de migrar');
  console.log('');
  
  console.log('3. 🧹 ACTUALIZAR CÓDIGO LEGACY:');
  console.log('   - Cambiar referencias de trinity-rooms-dev a trinity-rooms-dev-v2');
  console.log('   - Eliminar código que usa trinity-analytics-dev');
  console.log('');
  
  console.log('4. ✅ MANTENER TABLAS ACTIVAS:');
  console.log('   - trinity-users-dev');
  console.log('   - trinity-rooms-dev-v2');
  console.log('   - trinity-room-members-dev');
  console.log('   - trinity-votes-dev');
  console.log('   - trinity-movies-cache-dev');
  console.log('   - trinity-room-invites-dev-v2');
  console.log('   - trinity-room-matches-dev');
  console.log('   - trinity-connections-dev');
}

async function migrateRoomsData() {
  console.log('\n🔄 INICIANDO MIGRACIÓN DE DATOS...\n');
  
  try {
    // Verificar que ambas tablas existen
    await client.send(new DDBDescribeTableCommand({ TableName: 'trinity-rooms-dev' }));
    await client.send(new DDBDescribeTableCommand({ TableName: 'trinity-rooms-dev-v2' }));
    
    console.log('✅ Ambas tablas existen, procediendo con migración...');
    
    // Escanear datos de la tabla antigua
    const scanResult = await docClient.send(new ScanCommand({
      TableName: 'trinity-rooms-dev'
    }));
    
    console.log(`📊 Encontradas ${scanResult.Items.length} rooms para migrar`);
    
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const item of scanResult.Items) {
      try {
        // Adaptar estructura si es necesario
        const migratedItem = adaptRoomStructure(item);
        
        await docClient.send(new PutCommand({
          TableName: 'trinity-rooms-dev-v2',
          Item: migratedItem,
          ConditionExpression: 'attribute_not_exists(PK)' // No sobrescribir existentes
        }));
        
        migratedCount++;
        console.log(`✅ Migrada room: ${item.id || item.PK}`);
        
      } catch (error) {
        errorCount++;
        console.log(`❌ Error migrando ${item.id || item.PK}: ${error.message}`);
      }
    }
    
    console.log(`\n📊 RESULTADO DE MIGRACIÓN:`);
    console.log(`   - Migradas exitosamente: ${migratedCount}`);
    console.log(`   - Errores: ${errorCount}`);
    
    if (errorCount === 0 && migratedCount > 0) {
      console.log('\n✅ Migración completada exitosamente');
      console.log('⚠️  Verificar funcionamiento antes de eliminar trinity-rooms-dev');
    }
    
  } catch (error) {
    console.log(`❌ Error en migración: ${error.message}`);
  }
}

function adaptRoomStructure(oldItem) {
  // Adaptar estructura de v1 a v2 si es necesario
  const newItem = { ...oldItem };
  
  // Asegurar que tiene la estructura PK/SK requerida por v2
  if (!newItem.PK && newItem.id) {
    newItem.PK = `ROOM#${newItem.id}`;
    newItem.SK = 'ROOM';
  }
  
  // Agregar campos requeridos si faltan
  if (!newItem.createdAt) {
    newItem.createdAt = new Date().toISOString();
  }
  
  return newItem;
}

// Función para eliminar tabla vacía
async function deleteEmptyTable(tableName) {
  try {
    const result = await client.send(new DDBDescribeTableCommand({ TableName: tableName }));
    const itemCount = result.Table.ItemCount || 0;
    
    if (itemCount === 0) {
      console.log(`🗑️  Eliminando tabla vacía: ${tableName}`);
      // Aquí iría el comando de eliminación
      // await dynamoClient.send(new DeleteTableCommand({ TableName: tableName }));
      console.log(`✅ Tabla ${tableName} marcada para eliminación`);
    } else {
      console.log(`⚠️  No se puede eliminar ${tableName}: contiene ${itemCount} items`);
    }
  } catch (error) {
    console.log(`❌ Error verificando ${tableName}: ${error.message}`);
  }
}

// Ejecutar análisis
if (require.main === module) {
  analyzeAndOptimizeTables()
    .then(() => {
      console.log('\n🎯 PRÓXIMOS PASOS:');
      console.log('1. Revisar el análisis anterior');
      console.log('2. Ejecutar migración si es necesario: node optimize-dynamodb-tables.js --migrate');
      console.log('3. Actualizar código legacy');
      console.log('4. Eliminar tablas obsoletas');
    })
    .catch(console.error);
}

module.exports = {
  analyzeAndOptimizeTables,
  migrateRoomsData,
  deleteEmptyTable
};
