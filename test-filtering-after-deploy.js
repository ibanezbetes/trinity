const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function testFilteringAfterDeploy() {
  console.log('🧪 TESTING FILTERING AFTER DEPLOYMENT\n');

  // 1. Crear una sala de prueba usando GraphQL
  console.log('1️⃣ Creando sala de prueba con filtrado...');
  
  const testRoomData = {
    name: "Test Filtering Room",
    mediaType: "MOVIE",
    genreIds: [28, 12], // Acción, Aventura
    maxMembers: 2,
    isPrivate: false
  };

  try {
    // Simular llamada GraphQL createRoom
    const graphqlEndpoint = 'https://qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com/graphql';
    const apiKey = 'da2-ley6uvfgz5axjgpejgtisxctlq';
    
    const createRoomMutation = `
      mutation CreateRoom($input: CreateRoomInput!) {
        createRoom(input: $input) {
          id
          name
          mediaType
          genreIds
          genreNames
          contentIds
          lastContentRefresh
        }
      }
    `;

    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        query: createRoomMutation,
        variables: {
          input: testRoomData
        }
      })
    });

    const result = await response.json();
    
    if (result.errors) {
      console.log('❌ Error en GraphQL:', JSON.stringify(result.errors, null, 2));
      return;
    }

    if (result.data && result.data.createRoom) {
      const room = result.data.createRoom;
      console.log('✅ Sala creada exitosamente:');
      console.log(`   ID: ${room.id}`);
      console.log(`   Nombre: ${room.name}`);
      console.log(`   MediaType: ${room.mediaType}`);
      console.log(`   GenreIds: ${JSON.stringify(room.genreIds)}`);
      console.log(`   GenreNames: ${JSON.stringify(room.genreNames)}`);
      console.log(`   ContentIds: ${room.contentIds ? `[${room.contentIds.length} items]` : 'null'}`);
      console.log(`   LastRefresh: ${room.lastContentRefresh || 'null'}`);
      
      // 2. Verificar en DynamoDB
      console.log('\n2️⃣ Verificando datos en DynamoDB...');
      
      const dbRoom = await docClient.send(new GetCommand({
        TableName: 'trinity-rooms-dev-v2',
        Key: { PK: room.id, SK: 'ROOM' }
      }));

      if (dbRoom.Item) {
        console.log('✅ Datos en DynamoDB:');
        console.log(`   mediaType: ${dbRoom.Item.mediaType}`);
        console.log(`   genreIds: ${JSON.stringify(dbRoom.Item.genreIds)}`);
        console.log(`   contentIds: ${dbRoom.Item.contentIds ? `[${dbRoom.Item.contentIds.length} items]` : 'null'}`);
        console.log(`   lastContentRefresh: ${dbRoom.Item.lastContentRefresh || 'null'}`);
        
        // 3. Análisis del resultado
        console.log('\n3️⃣ Análisis del resultado:');
        
        if (dbRoom.Item.contentIds && dbRoom.Item.contentIds.length > 0) {
          console.log('🎉 ¡FILTRADO FUNCIONANDO!');
          console.log(`   ✅ ContentIds cargados: ${dbRoom.Item.contentIds.length} películas`);
          console.log(`   ✅ Filtrado por géneros: ${JSON.stringify(dbRoom.Item.genreIds)}`);
          console.log(`   ✅ Última actualización: ${dbRoom.Item.lastContentRefresh}`);
        } else {
          console.log('❌ Filtrado aún no funciona:');
          console.log('   - ContentIds está vacío o null');
          console.log('   - Posibles causas:');
          console.log('     * Variables de entorno aún no propagadas');
          console.log('     * Error en ContentFilterService');
          console.log('     * Timeout en Lambda');
          console.log('     * Error en TMDB API');
        }
        
      } else {
        console.log('❌ No se encontró la sala en DynamoDB');
      }
      
    } else {
      console.log('❌ No se recibió respuesta válida de createRoom');
    }

  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
  }

  console.log('\n🎯 PRÓXIMOS PASOS:');
  console.log('1. Si el filtrado no funciona, revisar logs de Lambda');
  console.log('2. Verificar que las variables de entorno llegaron a Lambda');
  console.log('3. Probar crear otra sala desde la app móvil');
  console.log('4. Revisar CloudWatch logs para errores específicos');
}

testFilteringAfterDeploy();
