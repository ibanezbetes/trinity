const { DynamoDBClient, ListTablesCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });

async function listActualTables() {
  try {
    console.log('🔍 LISTANDO TABLAS REALES EN DYNAMODB...\n');
    
    const result = await client.send(new ListTablesCommand({}));
    
    console.log(`📊 Total de tablas encontradas: ${result.TableNames.length}\n`);
    
    // Filtrar solo las tablas de Trinity
    const trinityTables = result.TableNames.filter(name => name.includes('trinity'));
    
    console.log('🎯 TABLAS DE TRINITY:\n');
    
    for (const tableName of trinityTables) {
      try {
        const tableInfo = await client.send(new DescribeTableCommand({ TableName: tableName }));
        const itemCount = tableInfo.Table.ItemCount || 0;
        const status = tableInfo.Table.TableStatus;
        const created = new Date(tableInfo.Table.CreationDateTime).toLocaleDateString();
        
        console.log(`📋 ${tableName}`);
        console.log(`   Estado: ${status}`);
        console.log(`   Items: ${itemCount}`);
        console.log(`   Creada: ${created}`);
        console.log('');
        
      } catch (error) {
        console.log(`❌ Error obteniendo info de ${tableName}: ${error.message}\n`);
      }
    }
    
    // Mostrar todas las tablas para referencia
    console.log('📋 TODAS LAS TABLAS EN LA CUENTA:\n');
    result.TableNames.forEach(name => {
      console.log(`   - ${name}`);
    });
    
  } catch (error) {
    console.error('❌ Error listando tablas:', error.message);
    
    if (error.name === 'UnrecognizedClientException') {
      console.log('\n💡 POSIBLES SOLUCIONES:');
      console.log('1. Verificar credenciales AWS: aws configure list');
      console.log('2. Verificar región: aws configure get region');
      console.log('3. Verificar permisos DynamoDB');
    }
  }
}

listActualTables();
