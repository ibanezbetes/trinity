const { DynamoDBClient, DescribeTableCommand, DeleteTableCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });

async function cleanupEmptyTables() {
  console.log('🧹 LIMPIEZA DE TABLAS VACÍAS\n');

  const tablesToCheck = [
    'trinity-events-dev',
    'trinity-analytics-dev'
  ];

  console.log('📋 Tablas a verificar y eliminar:');
  tablesToCheck.forEach(table => console.log(`   - ${table}`));
  console.log('');

  for (const tableName of tablesToCheck) {
    try {
      console.log(`🔍 Verificando ${tableName}...`);
      
      const tableInfo = await client.send(new DescribeTableCommand({ TableName: tableName }));
      const itemCount = tableInfo.Table.ItemCount || 0;
      const status = tableInfo.Table.TableStatus;

      console.log(`   Estado: ${status}`);
      console.log(`   Items: ${itemCount}`);

      if (itemCount === 0) {
        console.log(`   ✅ Tabla vacía - Procediendo a eliminar...`);
        
        try {
          await client.send(new DeleteTableCommand({ TableName: tableName }));
          console.log(`   🗑️  ${tableName} eliminada exitosamente`);
        } catch (deleteError) {
          console.log(`   ❌ Error eliminando ${tableName}: ${deleteError.message}`);
        }
      } else {
        console.log(`   ⚠️  Tabla contiene ${itemCount} items - NO se eliminará`);
      }

    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.log(`   ℹ️  ${tableName} no existe`);
      } else {
        console.log(`   ❌ Error verificando ${tableName}: ${error.message}`);
      }
    }
    
    console.log('');
  }

  console.log('🎯 RESUMEN DE LIMPIEZA COMPLETADO');
  console.log('Las tablas vacías han sido eliminadas para optimizar costos y simplicidad.');
}

cleanupEmptyTables();
