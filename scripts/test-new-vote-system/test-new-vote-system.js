#!/usr/bin/env node

/**
 * Test del Nuevo Sistema de Votación
 * Verifica que el comportamiento sea exactamente como se especifica
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const dynamoClient = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

// Test data
const TEST_ROOM_ID = `test-room-${Date.now()}`;
const TEST_USER_1 = `test-user-1-${Date.now()}`;
const TEST_USER_2 = `test-user-2-${Date.now()}`;
const TEST_MOVIE_1 = '12345';
const TEST_MOVIE_2 = '67890';

console.log('🧪 Iniciando Test del Nuevo Sistema de Votación');
console.log(`📋 Room ID: ${TEST_ROOM_ID}`);
console.log(`👤 User 1: ${TEST_USER_1}`);
console.log(`👤 User 2: ${TEST_USER_2}`);

async function createTestRoom() {
    console.log('\n🏠 Creando sala de test...');
    
    const room = {
        PK: TEST_ROOM_ID,
        SK: 'ROOM',
        roomId: TEST_ROOM_ID,
        id: TEST_ROOM_ID,
        name: 'Test Room',
        status: 'WAITING',
        hostId: TEST_USER_1,
        maxMembers: 2,
        preloadedMovies: [TEST_MOVIE_1, TEST_MOVIE_2, '11111', '22222', '33333'],
        currentMovieIndex: 0,
        totalMovies: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    await docClient.send(new PutCommand({
        TableName: 'trinity-rooms-dev-v2',
        Item: room
    }));
    
    // Crear miembros
    await docClient.send(new PutCommand({
        TableName: 'trinity-room-members-dev',
        Item: {
            roomId: TEST_ROOM_ID,
            userId: TEST_USER_1,
            role: 'HOST',
            isActive: true,
            joinedAt: new Date().toISOString()
        }
    }));
    
    await docClient.send(new PutCommand({
        TableName: 'trinity-room-members-dev',
        Item: {
            roomId: TEST_ROOM_ID,
            userId: TEST_USER_2,
            role: 'MEMBER',
            isActive: true,
            joinedAt: new Date().toISOString()
        }
    }));
    
    console.log('✅ Sala de test creada');
}

async function callVoteLambda(userId, movieId, voteType) {
    console.log(`\n🗳️ ${userId} votando ${voteType} por película ${movieId}...`);
    
    const payload = {
        info: { fieldName: 'vote' },
        arguments: {
            input: {
                roomId: TEST_ROOM_ID,
                movieId,
                voteType
            }
        },
        identity: { sub: userId }
    };
    
    try {
        const response = await lambdaClient.send(new InvokeCommand({
            FunctionName: 'trinity-vote-dev',
            Payload: JSON.stringify(payload)
        }));
        
        const result = JSON.parse(new TextDecoder().decode(response.Payload));
        
        if (result.errorType) {
            console.error(`❌ Error en voto:`, result.errorMessage);
            return { error: result.errorMessage };
        }
        
        console.log(`✅ Voto procesado:`, {
            status: result.status,
            message: result.message,
            matchFound: result.matchFound,
            resultMovieId: result.resultMovieId
        });
        
        return result;
        
    } catch (error) {
        console.error(`❌ Error llamando vote lambda:`, error);
        return { error: error.message };
    }
}

async function getNextMovieForUser(userId) {
    console.log(`\n🎬 Obteniendo siguiente película para usuario ${userId}...`);
    
    const payload = {
        info: { fieldName: 'getNextMovieForUser' },
        arguments: { roomId: TEST_ROOM_ID },
        identity: { sub: userId, username: userId }
    };
    
    try {
        const response = await lambdaClient.send(new InvokeCommand({
            FunctionName: 'trinity-movie-dev',
            Payload: JSON.stringify(payload)
        }));
        
        const result = JSON.parse(new TextDecoder().decode(response.Payload));
        
        if (result.errorType) {
            console.error(`❌ Error obteniendo película:`, result.errorMessage);
            return null;
        }
        
        console.log(`🎭 Siguiente película para ${userId}: ${result.title} (${result.progress || 'N/A'})`);
        return result;
        
    } catch (error) {
        console.error(`❌ Error llamando movie lambda:`, error);
        return null;
    }
}

async function testScenario1_QuickMatch() {
    console.log('\n🎯 TEST ESCENARIO 1: Match Rápido');
    console.log('Ambos usuarios votan LIKE por la primera película');
    
    // Verificar que ambos usuarios pueden obtener su primera película
    let movie1 = await getNextMovieForUser(TEST_USER_1);
    let movie2 = await getNextMovieForUser(TEST_USER_2);
    
    if (!movie1 || !movie2) {
        throw new Error('No se pudo obtener película inicial para usuarios');
    }
    
    // Usuario 1 vota LIKE
    let result1 = await callVoteLambda(TEST_USER_1, TEST_MOVIE_1, 'LIKE');
    if (result1.error) throw new Error(`Error voto 1: ${result1.error}`);
    
    // No debería haber match aún
    if (result1.matchFound) {
        throw new Error('Match prematuro detectado');
    }
    
    // Usuario 2 vota LIKE - debería generar match
    let result2 = await callVoteLambda(TEST_USER_2, TEST_MOVIE_1, 'LIKE');
    if (result2.error) throw new Error(`Error voto 2: ${result2.error}`);
    
    // Debería haber match
    if (!result2.matchFound || result2.status !== 'MATCHED') {
        throw new Error('Match no detectado correctamente');
    }
    
    console.log('✅ ESCENARIO 1 PASADO: Match detectado correctamente');
}

async function resetRoom() {
    console.log('\n🔄 Reseteando sala para siguiente test...');
    
    // Resetear sala
    await docClient.send(new PutCommand({
        TableName: 'trinity-rooms-dev-v2',
        Item: {
            PK: TEST_ROOM_ID,
            SK: 'ROOM',
            roomId: TEST_ROOM_ID,
            id: TEST_ROOM_ID,
            name: 'Test Room',
            status: 'WAITING',
            hostId: TEST_USER_1,
            maxMembers: 2,
            preloadedMovies: [TEST_MOVIE_1, TEST_MOVIE_2, '11111', '22222', '33333'],
            currentMovieIndex: 0,
            totalMovies: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    }));
    
    // Limpiar votos
    try {
        await docClient.send(new DeleteCommand({
            TableName: 'trinity-votes-dev',
            Key: { roomId: TEST_ROOM_ID, 'userId#movieId': `${TEST_USER_1}#${TEST_MOVIE_1}` }
        }));
    } catch (e) {}
    
    try {
        await docClient.send(new DeleteCommand({
            TableName: 'trinity-votes-dev',
            Key: { roomId: TEST_ROOM_ID, 'userId#movieId': `${TEST_USER_2}#${TEST_MOVIE_1}` }
        }));
    } catch (e) {}
    
    try {
        await docClient.send(new DeleteCommand({
            TableName: 'trinity-room-matches-dev',
            Key: { roomId: TEST_ROOM_ID, movieId: TEST_MOVIE_1 }
        }));
    } catch (e) {}
    
    console.log('✅ Sala reseteada');
}

async function testScenario2_IndividualProgress() {
    console.log('\n🎯 TEST ESCENARIO 2: Progreso Individual');
    console.log('Cada usuario avanza independientemente por sus películas');
    
    // Usuario 1 vota por varias películas
    let result1a = await callVoteLambda(TEST_USER_1, TEST_MOVIE_1, 'LIKE');
    if (result1a.error) throw new Error(`Error voto 1a: ${result1a.error}`);
    
    let result1b = await callVoteLambda(TEST_USER_1, TEST_MOVIE_2, 'DISLIKE');
    if (result1b.error) throw new Error(`Error voto 1b: ${result1b.error}`);
    
    // Usuario 2 vota por diferentes películas
    let result2a = await callVoteLambda(TEST_USER_2, '11111', 'DISLIKE');
    if (result2a.error) throw new Error(`Error voto 2a: ${result2a.error}`);
    
    let result2b = await callVoteLambda(TEST_USER_2, '22222', 'LIKE');
    if (result2b.error) throw new Error(`Error voto 2b: ${result2b.error}`);
    
    // Verificar que no hay match (diferentes películas)
    if (result1a.matchFound || result1b.matchFound || result2a.matchFound || result2b.matchFound) {
        throw new Error('Match incorrecto detectado con películas diferentes');
    }
    
    // Ahora ambos votan LIKE por la misma película
    let result1c = await callVoteLambda(TEST_USER_1, '33333', 'LIKE');
    if (result1c.error) throw new Error(`Error voto 1c: ${result1c.error}`);
    
    let result2c = await callVoteLambda(TEST_USER_2, '33333', 'LIKE');
    if (result2c.error) throw new Error(`Error voto 2c: ${result2c.error}`);
    
    // Debería haber match en la película común
    if (!result2c.matchFound || result2c.status !== 'MATCHED') {
        throw new Error('Match no detectado con película común');
    }
    
    console.log('✅ ESCENARIO 2 PASADO: Progreso individual y match en película común');
}

async function cleanup() {
    console.log('\n🧹 Limpiando datos de test...');
    
    try {
        // Eliminar sala
        await docClient.send(new DeleteCommand({
            TableName: 'trinity-rooms-dev-v2',
            Key: { PK: TEST_ROOM_ID, SK: 'ROOM' }
        }));
        
        // Eliminar miembros
        await docClient.send(new DeleteCommand({
            TableName: 'trinity-room-members-dev',
            Key: { roomId: TEST_ROOM_ID, userId: TEST_USER_1 }
        }));
        
        await docClient.send(new DeleteCommand({
            TableName: 'trinity-room-members-dev',
            Key: { roomId: TEST_ROOM_ID, userId: TEST_USER_2 }
        }));
        
        console.log('✅ Cleanup completado');
    } catch (error) {
        console.warn('⚠️ Error en cleanup:', error.message);
    }
}

async function runTests() {
    try {
        await createTestRoom();
        
        await testScenario1_QuickMatch();
        await resetRoom();
        
        await testScenario2_IndividualProgress();
        
        console.log('\n🎉 TODOS LOS TESTS PASARON');
        console.log('✅ El nuevo sistema de votación funciona correctamente');
        
    } catch (error) {
        console.error('\n💥 TEST FALLÓ:', error.message);
        process.exit(1);
    } finally {
        await cleanup();
    }
}

// Ejecutar tests
runTests().catch(console.error);