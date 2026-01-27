const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');

// Configurar cliente DynamoDB
const dynamoClient = new DynamoDBClient({
  region: 'eu-west-1'
});

async function listTables() {
  console.log('🔍 Listing DynamoDB tables...');
  
  try {
    const response = await dynamoClient.send(new ListTablesCommand({}));
    
    console.log('✅ Available tables:');
    response.TableNames?.forEach((tableName, index) => {
      console.log(`${index + 1}. ${tableName}`);
    });
    
    // Filter for Trinity tables
    const trinityTables = response.TableNames?.filter(name => 
      name.toLowerCase().includes('trinity') || 
      name.toLowerCase().includes('room') ||
      name.toLowerCase().includes('vote') ||
      name.toLowerCase().includes('user')
    );
    
    console.log('\n🎯 Trinity-related tables:');
    trinityTables?.forEach((tableName, index) => {
      console.log(`${index + 1}. ${tableName}`);
    });
    
  } catch (error) {
    console.error('❌ Error listing tables:', error);
  }
}

listTables();
