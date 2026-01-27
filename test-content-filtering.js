const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function testContentFiltering() {
  console.log('🧪 TESTING CONTENT FILTERING SYSTEM\n');

  // 1. Verificar variables de entorno
  console.log('1️⃣ Verificando configuración...');
  console.log(`   TMDB_API_KEY: ${process.env.TMDB_API_KEY ? '✅ Configurada' : '❌ No encontrada'}`);
  console.log(`   HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? '✅ Configurada' : '❌ No encontrada'}`);
  console.log('');

  // 2. Probar llamada directa a TMDB
  console.log('2️⃣ Probando TMDB API directamente...');
  
  if (!process.env.TMDB_API_KEY) {
    console.log('❌ No se puede probar TMDB sin API key');
    console.log('💡 Configura TMDB_API_KEY en las variables de entorno');
    return;
  }

  try {
    const tmdbUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY}&language=es-ES&with_genres=12,878&sort_by=popularity.desc&page=1&include_adult=false`;
    
    console.log('🔍 Probando URL:', tmdbUrl.replace(process.env.TMDB_API_KEY, 'HIDDEN'));
    
    const response = await fetch(tmdbUrl);
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ TMDB API funciona: ${data.results?.length || 0} películas encontradas`);
      
      if (data.results && data.results.length > 0) {
        console.log('📋 Muestra de películas:');
        data.results.slice(0, 3).forEach((movie, index) => {
          console.log(`   ${index + 1}. ${movie.title} (${movie.release_date?.substring(0, 4) || 'N/A'})`);
        });
      }
    } else {
      console.log('❌ Error en TMDB API:', data.status_message || data.error || 'Error desconocido');
    }
  } catch (error) {
    console.log('❌ Error conectando con TMDB:', error.message);
  }
  
  console.log('');

  // 3. Simular creación de sala con filtrado
  console.log('3️⃣ Simulando creación de sala con filtrado...');
  
  const mockRoomData = {
    name: "Test Room",
    mediaType: "MOVIE",
    genreIds: [12, 878], // Aventura, Ciencia ficción
    maxMembers: 2,
    isPrivate: false
  };
  
  console.log('📋 Datos de sala simulada:', JSON.stringify(mockRoomData, null, 2));
  
  // Simular el proceso de filtrado
  try {
    console.log('🎯 Simulando filtrado de contenido...');
    
    // Esto simula lo que debería hacer ContentFilterService
    const genreString = mockRoomData.genreIds.join(',');
    const testUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY}&language=es-ES&with_genres=${genreString}&sort_by=vote_average.desc&page=1&include_adult=false`;
    
    const filterResponse = await fetch(testUrl);
    const filterData = await filterResponse.json();
    
    if (filterResponse.ok && filterData.results) {
      console.log(`✅ Filtrado exitoso: ${filterData.results.length} películas encontradas`);
      console.log('🎬 Top 3 películas filtradas:');
      
      filterData.results.slice(0, 3).forEach((movie, index) => {
        console.log(`   ${index + 1}. ${movie.title} (Rating: ${movie.vote_average})`);
        console.log(`      Géneros: ${movie.genre_ids.join(', ')}`);
      });
      
      // Simular lo que debería guardarse en contentIds
      const contentIds = filterData.results.slice(0, 30).map(movie => movie.id.toString());
      console.log(`📊 ContentIds que deberían guardarse: [${contentIds.length} items]`);
      
    } else {
      console.log('❌ Error en filtrado:', filterData.status_message || 'Error desconocido');
    }
    
  } catch (error) {
    console.log('❌ Error en simulación de filtrado:', error.message);
  }
  
  console.log('');

  // 4. Verificar por qué las salas reales no tienen contentIds
  console.log('4️⃣ Analizando salas reales sin contentIds...');
  
  try {
    const roomId = '2fcc6ee6-214c-47e6-bf6a-624cc5f65f3f'; // Sala reciente de los logs
    
    const roomData = await docClient.send(new GetCommand({
      TableName: 'trinity-rooms-dev-v2',
      Key: { PK: roomId, SK: 'ROOM' }
    }));
    
    if (roomData.Item) {
      console.log('📋 Datos de sala real:');
      console.log(`   mediaType: ${roomData.Item.mediaType}`);
      console.log(`   genreIds: ${JSON.stringify(roomData.Item.genreIds)}`);
      console.log(`   contentIds: ${roomData.Item.contentIds || 'null'}`);
      console.log(`   lastContentRefresh: ${roomData.Item.lastContentRefresh || 'null'}`);
      
      // Intentar el filtrado que debería haber ocurrido
      if (roomData.Item.mediaType && roomData.Item.genreIds) {
        console.log('🔄 Intentando filtrado que debería haber ocurrido...');
        
        const genreString = roomData.Item.genreIds.join(',');
        const shouldWorkUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY}&language=es-ES&with_genres=${genreString}&sort_by=vote_average.desc&page=1&include_adult=false`;
        
        const shouldWorkResponse = await fetch(shouldWorkUrl);
        const shouldWorkData = await shouldWorkResponse.json();
        
        if (shouldWorkResponse.ok && shouldWorkData.results) {
          console.log(`✅ El filtrado DEBERÍA funcionar: ${shouldWorkData.results.length} resultados`);
          console.log('❓ Problema: El servicio de filtrado no se está ejecutando correctamente');
        } else {
          console.log('❌ El filtrado fallaría:', shouldWorkData.status_message);
        }
      }
      
    } else {
      console.log('❌ No se encontró la sala para análisis');
    }
    
  } catch (error) {
    console.log('❌ Error analizando sala real:', error.message);
  }

  console.log('\n🎯 CONCLUSIONES:');
  console.log('1. Verificar que TMDB_API_KEY esté disponible en el entorno Lambda');
  console.log('2. Verificar que ContentFilterService se esté ejecutando sin errores');
  console.log('3. Revisar logs de Lambda para errores en el filtrado');
  console.log('4. Considerar timeout o límites de memoria en Lambda');
}

testContentFiltering();
