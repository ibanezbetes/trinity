const { DynamoDBClient, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function verifyOptimization() {
  console.log('🔍 VERIFICACIÓN FINAL DE OPTIMIZACIÓN\n');

  // Tablas que deberían existir
  const expectedTables = [
    'trinity-users-dev',
    'trinity-rooms-dev-v2', 
    'trinity-room-members-dev',
    'trinity-votes-dev',
    'trinity-movies-cache-dev',
    'trinity-room-invites-dev-v2',
    'trinity-room-matches-dev',
    'trinity-connections-dev'
  ];

  // Tablas que NO deberían existir
  const deletedTables = [
    'trinity-rooms-dev',
    'trinity-events-dev',
    'trinity-analytics-dev'
  ];

  console.log('✅ VERIFICANDO TABLAS EXISTENTES:\n');

  let allGood = true;

  for (const tableName of expectedTables) {
    try {
      const result = await client.send(new DescribeTableCommand({ TableName: tableName }));
      const itemCount = result.Table.ItemCount || 0;
      const status = result.Table.TableStatus;
      
      console.log(`✅ ${tableName}`);
      console.log(`   Estado: ${status}`);
      console.log(`   Items: ${itemCount}`);
      
      if (status !== 'ACTIVE') {
        console.log(`   ⚠️  ADVERTENCIA: Estado no es ACTIVE`);
        allGood = false;
      }
      
    } catch (error) {
      console.log(`❌ ${tableName}: NO EXISTE`);
      allGood = false;
    }
    console.log('');
  }

  console.log('🗑️  VERIFICANDO TABLAS ELIMINADAS:\n');

  for (const tableName of deletedTables) {
    try {
      await client.send(new DescribeTableCommand({ TableName: tableName }));
      console.log(`❌ ${tableName}: AÚN EXISTE (debería estar eliminada)`);
      allGood = false;
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.log(`✅ ${tableName}: Correctamente eliminada`);
      } else {
        console.log(`⚠️  ${tableName}: Error verificando - ${error.message}`);
      }
    }
  }

  console.log('\n📊 VERIFICANDO DATOS EN TRINITY-ROOMS-DEV-V2:\n');

  try {
    const roomsResult = await docClient.send(new ScanCommand({
      TableName: 'trinity-rooms-dev-v2',
      Select: 'COUNT'
    }));

    console.log(`✅ trinity-rooms-dev-v2 contiene ${roomsResult.Count} rooms`);
    
    if (roomsResult.Count >= 6) {
      console.log('   ✅ Datos migrados correctamente (6+ rooms esperadas)');
    } else {
      console.log('   ⚠️  Menos rooms de las esperadas');
      allGood = false;
    }

    // Obtener muestra de datos
    const sampleResult = await docClient.send(new ScanCommand({
      TableName: 'trinity-rooms-dev-v2',
      Limit: 3
    }));

    console.log('\n📋 Muestra de rooms en trinity-rooms-dev-v2:');
    sampleResult.Items.forEach((room, index) => {
      console.log(`   ${index + 1}. ${room.id || room.PK} - ${room.name || 'Sin nombre'}`);
    });

  } catch (error) {
    console.log(`❌ Error verificando datos: ${error.message}`);
    allGood = false;
  }

  console.log('\n🎯 RESUMEN DE VERIFICACIÓN:\n');

  if (allGood) {
    console.log('🎉 ¡OPTIMIZACIÓN COMPLETAMENTE EXITOSA!');
    console.log('');
    console.log('✅ Todas las tablas necesarias están activas');
    console.log('✅ Todas las tablas obsoletas fueron eliminadas');
    console.log('✅ Los datos fueron migrados correctamente');
    console.log('✅ El sistema está listo para usar');
    console.log('');
    console.log('💰 Beneficios obtenidos:');
    console.log('   - 27% menos tablas (11 → 8)');
    console.log('   - Estructura consolidada y limpia');
    console.log('   - Costos de DynamoDB reducidos');
    console.log('   - Mantenimiento simplificado');
    
  } else {
    console.log('⚠️  HAY PROBLEMAS QUE REVISAR');
    console.log('');
    console.log('Revisa los mensajes de error anteriores y:');
    console.log('1. Verifica la configuración de AWS');
    console.log('2. Confirma que las tablas están en la región correcta');
    console.log('3. Revisa los permisos de DynamoDB');
  }

  console.log('\n📋 PRÓXIMOS PASOS RECOMENDADOS:');
  console.log('1. Probar funcionalidad de la aplicación');
  console.log('2. Monitorear logs por errores');
  console.log('3. Verificar costos de AWS en los próximos días');
  console.log('4. Considerar limpiar archivos de optimización si todo funciona bien');
}

verifyOptimization();
