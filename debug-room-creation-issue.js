const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

// Configurar cliente DynamoDB
const dynamoClient = new DynamoDBClient({
  region: 'eu-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

async function debugRoomCreationIssue() {
  console.log('🔍 Debugging room creation issue...');
  
  try {
    // Buscar la sala más reciente creada
    const roomId = '63407658-af6b-4463-a75a-345ef09c1de9'; // Nueva sala de Comedia
    
    console.log(`🔍 Checking room ${roomId} in DynamoDB...`);
    
    // Obtener la sala directamente de DynamoDB
    const roomResponse = await docClient.send(new GetCommand({
      TableName: 'trinity-rooms-dev-v2',
      Key: { PK: roomId, SK: 'ROOM' },
    }));
    
    if (!roomResponse.Item) {
      console.log('❌ Room not found in DynamoDB');
      return;
    }
    
    console.log('✅ Room found in DynamoDB:');
    console.log('📊 Raw DynamoDB Item:', JSON.stringify(roomResponse.Item, null, 2));
    
    // Verificar específicamente los campos problemáticos
    console.log('\n🔍 Specific field analysis:');
    console.log('- mediaType:', roomResponse.Item.mediaType);
    console.log('- genreIds:', roomResponse.Item.genreIds);
    console.log('- genreNames:', roomResponse.Item.genreNames);
    console.log('- contentIds:', roomResponse.Item.contentIds);
    console.log('- filterCriteria:', roomResponse.Item.filterCriteria);
    
    // Verificar si hay diferencias entre los campos guardados y los esperados
    const expectedFields = {
      mediaType: 'MOVIE',
      genreIds: [12, 878],
      genreNames: ['Aventura', 'Ciencia ficción']
    };
    
    console.log('\n🔍 Expected vs Actual:');
    for (const [field, expected] of Object.entries(expectedFields)) {
      const actual = roomResponse.Item[field];
      const matches = JSON.stringify(actual) === JSON.stringify(expected);
      console.log(`- ${field}: Expected ${JSON.stringify(expected)}, Got ${JSON.stringify(actual)} ${matches ? '✅' : '❌'}`);
    }
    
  } catch (error) {
    console.error('❌ Error debugging room creation:', error);
  }
}

debugRoomCreationIssue();
