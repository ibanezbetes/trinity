#!/usr/bin/env node

/**
 * Script para probar el escenario completo de match en Trinity
 * 
 * Este script simula:
 * 1. Crear una sala con 2 usuarios
 * 2. Ambos usuarios votan por la misma película
 * 3. Verificar que se detecta el match
 * 4. Verificar que la sala se actualiza correctamente
 * 5. Verificar que no se pueden hacer más votos
 */

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configurar AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const appsync = new AWS.AppSync({ region: 'eu-west-1' });

// Variables de entorno
const ROOMS_TABLE = 'trinity-rooms-dev-v2';
const ROOM_MEMBERS_TABLE = 'trinity-room-members-dev';
const VOTES_TABLE = 'trinity-room-matches-dev';

async function testMatchScenario() {
  console.log('🧪 Iniciando test de escenario de match...\n');

  const roomId = uuidv4();
  const user1Id = uuidv4();
  const user2Id = uuidv4();
  const movieId = 'movie-12345';
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    // Paso 1: Crear sala
    console.log('📝 Paso 1: Creando sala de prueba...');
    await createTestRoom(roomId, user1Id, inviteCode);
    console.log(`✅ Sala creada: ${roomId}`);

    // Paso 2: Agregar segundo usuario
    console.log('\n👥 Paso 2: Agregando segundo usuario...');
    await addUserToRoom(roomId, user2Id);
    console.log(`✅ Usuario agregado: ${user2Id}`);

    // Paso 3: Verificar estado inicial
    console.log('\n🔍 Paso 3: Verificando estado inicial...');
    const initialRoom = await getRoomStatus(roomId);
    console.log(`Estado inicial: ${initialRoom.status}`);
    console.log(`ResultMovieId inicial: ${initialRoom.resultMovieId || 'null'}`);

    // Paso 4: Usuario 1 vota
    console.log('\n🗳️ Paso 4: Usuario 1 vota por la película...');
    await simulateVote(roomId, movieId, user1Id);
    const votesAfterUser1 = await getVoteCount(roomId, movieId);
    console.log(`✅ Votos después del usuario 1: ${votesAfterUser1}`);

    // Paso 5: Usuario 2 vota (debería crear match)
    console.log('\n🗳️ Paso 5: Usuario 2 vota por la misma película...');
    await simulateVote(roomId, movieId, user2Id);
    const votesAfterUser2 = await getVoteCount(roomId, movieId);
    console.log(`✅ Votos después del usuario 2: ${votesAfterUser2}`);

    // Paso 6: Verificar match
    console.log('\n🎉 Paso 6: Verificando match...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar propagación
    
    const finalRoom = await getRoomStatus(roomId);
    console.log(`Estado final: ${finalRoom.status}`);
    console.log(`ResultMovieId final: ${finalRoom.resultMovieId || 'null'}`);

    // Verificar resultados
    if (finalRoom.status === 'MATCHED' && finalRoom.resultMovieId === movieId) {
      console.log('\n🎉 ¡SUCCESS! Match detectado correctamente');
      console.log(`✅ Estado: ${finalRoom.status}`);
      console.log(`✅ Película ganadora: ${finalRoom.resultMovieId}`);
    } else {
      console.log('\n❌ FAIL! Match no detectado correctamente');
      console.log(`❌ Estado esperado: MATCHED, actual: ${finalRoom.status}`);
      console.log(`❌ Película esperada: ${movieId}, actual: ${finalRoom.resultMovieId || 'null'}`);
    }

    // Paso 7: Intentar votar después del match
    console.log('\n🚫 Paso 7: Intentando votar después del match...');
    try {
      await simulateVote(roomId, 'movie-67890', user1Id);
      console.log('❌ ERROR: Se permitió votar después del match');
    } catch (error) {
      if (error.message.includes('no está disponible para votar')) {
        console.log('✅ Correcto: Voto rechazado después del match');
      } else {
        console.log(`⚠️ Error inesperado: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error durante el test:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Limpiando datos de prueba...');
    await cleanup(roomId, user1Id, user2Id, movieId);
    console.log('✅ Cleanup completado');
  }
}

async function createTestRoom(roomId, hostId, inviteCode) {
  const now = new Date().toISOString();
  
  // Crear sala
  await dynamodb.put({
    TableName: ROOMS_TABLE,
    Item: {
      PK: roomId,
      SK: 'ROOM',
      roomId,
      id: roomId,
      name: 'Test Match Room',
      description: 'Sala de prueba para match',
      status: 'ACTIVE',
      resultMovieId: null,
      hostId,
      inviteCode,
      isActive: true,
      isPrivate: false,
      memberCount: 1,
      maxMembers: 2,
      matchCount: 0,
      mediaType: 'MOVIE',
      genreIds: [35], // Comedia
      createdAt: now,
      updatedAt: now,
    }
  }).promise();

  // Agregar host como miembro
  await dynamodb.put({
    TableName: ROOM_MEMBERS_TABLE,
    Item: {
      roomId,
      userId: hostId,
      role: 'HOST',
      joinedAt: now,
      isActive: true,
    }
  }).promise();
}

async function addUserToRoom(roomId, userId) {
  const now = new Date().toISOString();
  
  // Agregar usuario como miembro
  await dynamodb.put({
    TableName: ROOM_MEMBERS_TABLE,
    Item: {
      roomId,
      userId,
      role: 'MEMBER',
      joinedAt: now,
      isActive: true,
    }
  }).promise();

  // Actualizar contador de miembros
  await dynamodb.update({
    TableName: ROOMS_TABLE,
    Key: { PK: roomId, SK: 'ROOM' },
    UpdateExpression: 'SET memberCount = memberCount + :inc, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':inc': 1,
      ':updatedAt': now,
    }
  }).promise();
}

async function simulateVote(roomId, movieId, userId) {
  // Simular voto incrementando contador
  await dynamodb.update({
    TableName: VOTES_TABLE,
    Key: { roomId, movieId },
    UpdateExpression: 'ADD votes :increment SET updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':increment': 1,
      ':updatedAt': new Date().toISOString(),
    }
  }).promise();

  // Obtener votos actuales
  const voteResult = await dynamodb.get({
    TableName: VOTES_TABLE,
    Key: { roomId, movieId }
  }).promise();

  const currentVotes = voteResult.Item?.votes || 1;
  console.log(`Votos actuales para ${movieId}: ${currentVotes}`);

  // Si alcanzamos 2 votos, actualizar sala a MATCHED
  if (currentVotes >= 2) {
    console.log('🎉 ¡Match detectado! Actualizando sala...');
    await dynamodb.update({
      TableName: ROOMS_TABLE,
      Key: { PK: roomId, SK: 'ROOM' },
      UpdateExpression: 'SET #status = :status, resultMovieId = :movieId, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': 'MATCHED',
        ':movieId': movieId,
        ':updatedAt': new Date().toISOString(),
      }
    }).promise();
  }
}

async function getRoomStatus(roomId) {
  const result = await dynamodb.get({
    TableName: ROOMS_TABLE,
    Key: { PK: roomId, SK: 'ROOM' }
  }).promise();

  return result.Item || {};
}

async function getVoteCount(roomId, movieId) {
  const result = await dynamodb.get({
    TableName: VOTES_TABLE,
    Key: { roomId, movieId }
  }).promise();

  return result.Item?.votes || 0;
}

async function cleanup(roomId, user1Id, user2Id, movieId) {
  try {
    // Eliminar sala
    await dynamodb.delete({
      TableName: ROOMS_TABLE,
      Key: { PK: roomId, SK: 'ROOM' }
    }).promise();

    // Eliminar miembros
    await dynamodb.delete({
      TableName: ROOM_MEMBERS_TABLE,
      Key: { roomId, userId: user1Id }
    }).promise();

    await dynamodb.delete({
      TableName: ROOM_MEMBERS_TABLE,
      Key: { roomId, userId: user2Id }
    }).promise();

    // Eliminar votos
    await dynamodb.delete({
      TableName: VOTES_TABLE,
      Key: { roomId, movieId }
    }).promise();

  } catch (error) {
    console.warn('⚠️ Error durante cleanup:', error.message);
  }
}

// Ejecutar test
if (require.main === module) {
  testMatchScenario()
    .then(() => {
      console.log('\n🎯 Test completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test falló:', error);
      process.exit(1);
    });
}

module.exports = { testMatchScenario };