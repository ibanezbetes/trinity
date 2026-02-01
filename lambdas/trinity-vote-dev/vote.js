"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");

// Import Lambda client for calling movie lambda
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Initialize Lambda client
let lambdaClient = null;
function getLambdaClient() {
    if (!lambdaClient) {
        lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });
    }
    return lambdaClient;
}
// Simplified inline implementations to avoid dependency issues
const appsyncPublisher = {
    publishMatchFoundEvent: async (roomId, matchData) => {
        console.log(`📡 Publishing match found event for room ${roomId}:`, matchData);
        // In a real implementation, this would publish to AppSync subscriptions
    },
    publishVoteUpdateEvent: async (roomId, voteData) => {
        console.log(`📡 Publishing vote update event for room ${roomId}:`, voteData);
        // In a real implementation, this would publish to AppSync subscriptions
    },
    getMovieTitle: async (movieId) => {
        console.log(`🎬 Getting movie title for ${movieId}`);
        return `Movie ${movieId}`;
    }
};
const metrics = {
    logBusinessMetric: (name, value, unit) => {
        console.log(`📊 Business Metric: ${name} = ${value} ${unit || ''}`);
    },
    logError: (operation, error) => {
        console.error(`❌ Error in ${operation}:`, error);
    },
    PerformanceTimer: class {
        constructor(operation) {
            this.operation = operation;
            this.startTime = Date.now();
        }
        end() {
            const duration = Date.now() - this.startTime;
            console.log(`⏱️ ${this.operation} completed in ${duration}ms`);
        }
    }
};
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
/**
 * VoteHandler: Lógica Stop-on-Match
 * Implementa el algoritmo de votación que termina cuando todos los miembros votan
 */
const handler = async (event) => {
    console.log('🗳️ Vote Handler:', JSON.stringify(event, null, 2));
    const fieldName = event.info?.fieldName;
    const args = event.arguments;
    const { sub: userId } = event.identity; // Usuario autenticado
    try {
        switch (fieldName) {
            case 'vote':
                // Extraer parámetros del input según el schema GraphQL
                const { roomId, movieId, voteType } = args.input;
                return await processVote(userId, roomId, movieId, voteType);
            default:
                throw new Error(`Operación no soportada: ${fieldName}`);
        }
    }
    catch (error) {
        console.error(`❌ Error en ${fieldName}:`, error);
        // Mejorar mensajes de error para el usuario
        if (error instanceof Error) {
            // Si es un error de sistema interno, no exponer detalles técnicos
            if (error.message.includes('Error interno del sistema')) {
                throw error; // Ya tiene un mensaje amigable
            }
            // Para otros errores, proporcionar contexto adicional
            if (error.message.includes('Sala no encontrada')) {
                throw new Error('La sala especificada no existe o no tienes acceso a ella.');
            }
            if (error.message.includes('Usuario no es miembro activo')) {
                throw new Error('No eres miembro de esta sala o tu membresía no está activa.');
            }
            if (error.message.includes('ya votó por la película')) {
                throw new Error('Ya has votado por esta película en esta sala.');
            }
            if (error.message.includes('no está disponible para votar')) {
                throw new Error('Esta sala no está disponible para votar en este momento.');
            }
            // Errores de red o conectividad
            if (error.message.includes('Network') || error.message.includes('timeout')) {
                throw new Error('Problema de conexión. Por favor, verifica tu conexión a internet e inténtalo de nuevo.');
            }
            // Errores de autorización
            if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
                throw new Error('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
            }
            // Errores de validación de datos
            if (error.message.includes('ValidationException') || error.message.includes('Invalid')) {
                throw new Error('Los datos enviados no son válidos. Por favor, inténtalo de nuevo.');
            }
            // Error genérico para casos no manejados específicamente
            throw new Error('Ocurrió un error inesperado. Por favor, inténtalo de nuevo más tarde.');
        }
        throw error;
    }
};
exports.handler = handler;
/**
 * Procesar voto con algoritmo Stop-on-Match CORRECTO
 * Cada usuario avanza independientemente por los 50 títulos
 */
async function processVote(userId, roomId, movieId, voteType) {
    const timer = new metrics.PerformanceTimer('ProcessVote');
    console.log(`🗳️ Procesando voto: Usuario ${userId}, Sala ${roomId}, Película ${movieId}, Tipo: ${voteType}`);
    try {
        // 1. Verificar que la sala existe y está ACTIVE/WAITING
        const room = await getRoomAndValidate(roomId);
        
        // 2. Verificar que el usuario es miembro de la sala
        await validateUserMembership(userId, roomId);

        // 3. CRÍTICO: Verificar si ya hay un match ANTES de procesar cualquier voto
        const existingMatch = await checkExistingMatch(roomId);
        if (existingMatch) {
            console.log(`🎉 MATCH YA EXISTE en sala ${roomId}: película ${existingMatch.movieId}`);
            return {
                ...room,
                status: 'MATCHED',
                resultMovieId: existingMatch.movieId,
                matchFound: true,
                message: `¡Match encontrado! Película: ${existingMatch.movieTitle}`
            };
        }

        // 4. Prevenir votos duplicados del mismo usuario para la misma película
        await preventDuplicateVote(userId, roomId, movieId);

        // 5. Registrar el voto individual del usuario (tanto LIKE como DISLIKE)
        await recordUserVote(userId, roomId, movieId, voteType);

        // 6. Si es voto LIKE, incrementar contador de votos positivos para esta película
        let currentLikes = 0;
        if (voteType === 'LIKE') {
            currentLikes = await incrementVoteCount(roomId, movieId);
        } else {
            currentLikes = await getCurrentVoteCount(roomId, movieId);
        }

        const totalMembers = room.maxMembers || 2;
        console.log(`📊 Película ${movieId}: ${currentLikes}/${totalMembers} votos LIKE`);

        // 7. VERIFICAR MATCH: ¿Todos los miembros votaron LIKE a esta película específica?
        if (voteType === 'LIKE' && currentLikes === totalMembers) {
            console.log(`🎉 ¡MATCH DETECTADO! Consenso COMPLETO para película ${movieId} (${currentLikes}/${totalMembers})`);
            
            // Actualizar sala con resultado INMEDIATAMENTE
            await updateRoomWithMatch(roomId, movieId);
            
            // Obtener título de la película
            const movieTitle = await appsyncPublisher.getMovieTitle(movieId);
            
            // Notificar a TODOS los miembros de la sala (incluso si están fuera)
            await notifyAllRoomMembers(roomId, {
                type: 'MATCH_FOUND',
                movieId,
                movieTitle,
                message: `¡Match encontrado! Película: ${movieTitle}`
            });
            
            // Log business metrics
            metrics.logBusinessMetric('VOTE_CAST', 1, 'count');
            metrics.logBusinessMetric('MATCH_FOUND', 1, 'count');
            
            timer.end();
            return {
                ...room,
                status: 'MATCHED',
                resultMovieId: movieId,
                matchFound: true,
                message: `¡Match encontrado! Película: ${movieTitle}`
            };
        }

        // 8. Voto normal procesado - usuario continúa con su siguiente película
        console.log(`✅ Voto ${voteType} procesado para película ${movieId} - usuario puede continuar`);

        // 9. Verificar si este usuario ha terminado todos los 50 títulos
        const userProgress = await getUserVotingProgress(userId, roomId);
        
        if (userProgress.votedCount >= 50) {
            console.log(`🏁 Usuario ${userId} ha votado los 50 títulos`);
            
            // Verificar si TODOS los usuarios han terminado sin match
            const allUsersFinished = await checkAllUsersFinished(roomId, totalMembers);
            
            if (allUsersFinished) {
                console.log(`🏁 TODOS los usuarios terminaron sin match - Sala ${roomId}`);
                
                await notifyAllRoomMembers(roomId, {
                    type: 'NO_CONSENSUS',
                    message: 'No han conseguido ponerse de acuerdo. Intenten en otra sala.'
                });
                
                return {
                    ...room,
                    status: 'NO_CONSENSUS',
                    endOfMovies: true,
                    message: 'No han conseguido ponerse de acuerdo. Intenten en otra sala.'
                };
            } else {
                return {
                    ...room,
                    userFinished: true,
                    message: 'Has votado todas las películas. Esperando otros usuarios...'
                };
            }
        }

        // 10. Publicar evento de actualización de voto en tiempo real
        await appsyncPublisher.publishVoteUpdateEvent(roomId, {
            userId,
            movieId,
            voteType,
            currentVotes: currentLikes,
            totalMembers,
            userProgress: userProgress.votedCount
        });

        // Log business metric
        metrics.logBusinessMetric('VOTE_CAST', 1, 'count');

        timer.end();
        return {
            ...room,
            currentVotes: currentLikes,
            totalMembers,
            userProgress: userProgress.votedCount,
            message: `Voto registrado. Continúa con la siguiente película.`
        };
    }
    catch (error) {
        metrics.logError('ProcessVote', error);
        timer.end();
        throw error;
    }
}
/**
 * Obtener y validar sala
 */
async function getRoomAndValidate(roomId) {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            console.log('🔍 DEBUG: getRoomAndValidate usando clave:', { PK: roomId, SK: 'ROOM' });
            const response = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.ROOMS_TABLE,
                Key: { PK: roomId, SK: 'ROOM' },
            }));
            if (!response.Item) {
                throw new Error('Sala no encontrada');
            }
            const room = response.Item;
            console.log(`🔍 Room Status Check: ID=${room.id}, Status=${room.status}, Type=${typeof room.status}`);
            if (room.status !== 'ACTIVE' && room.status !== 'WAITING') {
                throw new Error(`La sala no está disponible para votar. Estado actual: ${room.status}`);
            }
            return room;
        }
        catch (error) {
            // Distinguir entre errores de clave y errores de negocio
            if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                console.error('❌ Error de estructura de clave en ROOMS_TABLE:', error.message);
                throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
            }
            // Errores de red o temporales - reintentar
            if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                attempt++;
                if (attempt >= maxRetries) {
                    console.error('❌ Máximo de reintentos alcanzado para getRoomAndValidate');
                    throw new Error('Error interno del sistema. Servicio temporalmente no disponible.');
                }
                console.log(`🔄 Reintentando getRoomAndValidate (intento ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt))); // Exponential backoff
                continue;
            }
            // Re-lanzar errores de negocio tal como están
            throw error;
        }
    }
    throw new Error('Error interno del sistema. No se pudo validar la sala después de múltiples intentos.');
}
/**
 * Validar que el usuario es miembro de la sala
 */
async function validateUserMembership(userId, roomId) {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            const response = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.ROOM_MEMBERS_TABLE,
                Key: { roomId, userId },
            }));
            if (!response.Item || !response.Item.isActive) {
                throw new Error('Usuario no es miembro activo de la sala');
            }
            return; // Success
        }
        catch (error) {
            // Distinguir entre errores de clave y errores de negocio
            if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                console.error('❌ Error de estructura de clave en ROOM_MEMBERS_TABLE:', error.message);
                throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
            }
            // Errores de red o temporales - reintentar
            if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                attempt++;
                if (attempt >= maxRetries) {
                    console.error('❌ Máximo de reintentos alcanzado para validateUserMembership');
                    throw new Error('Error interno del sistema. Servicio temporalmente no disponible.');
                }
                console.log(`🔄 Reintentando validateUserMembership (intento ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt))); // Exponential backoff
                continue;
            }
            // Re-lanzar errores de negocio tal como están
            throw error;
        }
    }
    throw new Error('Error interno del sistema. No se pudo validar la membresía después de múltiples intentos.');
}
/**
 * Obtener contador actual de votos sin incrementar
 */
async function getCurrentVoteCount(roomId, movieId) {
    try {
        const response = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOM_MATCHES_TABLE,
            Key: { roomId, movieId },
        }));
        
        return response.Item?.votes || 0;
    }
    catch (error) {
        console.warn(`⚠️ Error obteniendo votos actuales para ${roomId}/${movieId}:`, error);
        return 0;
    }
}

/**
 * Incrementar contador atómico de votos con manejo mejorado de concurrencia
 */
async function incrementVoteCount(roomId, movieId) {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            // Intentar actualizar voto existente con operación atómica
            const response = await docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: process.env.ROOM_MATCHES_TABLE, // Using Matches table for aggregation
                Key: { roomId, movieId },
                UpdateExpression: 'ADD votes :increment SET updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':increment': 1,
                    ':updatedAt': new Date().toISOString(),
                },
                ReturnValues: 'ALL_NEW',
            }));
            const voteCount = response.Attributes?.votes || 1;
            console.log(`✅ Voto incrementado: Sala ${roomId}, Película ${movieId}, Total: ${voteCount}`);
            return voteCount;
        }
        catch (error) {
            // Manejar errores de clave
            if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                console.error('❌ Error de estructura de clave en VOTES_TABLE:', error.message);
                throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
            }
            // Si el item no existe, intentar crearlo
            if (error.name === 'ResourceNotFoundException' || !error.name) {
                try {
                    const newVote = {
                        roomId,
                        movieId,
                        votes: 1,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    };
                    await docClient.send(new lib_dynamodb_1.PutCommand({
                        TableName: process.env.ROOM_MATCHES_TABLE,
                        Item: newVote,
                        ConditionExpression: 'attribute_not_exists(roomId) AND attribute_not_exists(movieId)',
                    }));
                    console.log(`✅ Nuevo voto creado: Sala ${roomId}, Película ${movieId}, Total: 1`);
                    return 1;
                }
                catch (putError) {
                    if (putError.name === 'ValidationException' && putError.message.includes('key element does not match')) {
                        console.error('❌ Error de estructura de clave en VOTES_TABLE (PUT):', putError.message);
                        throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
                    }
                    // Si falla la condición, significa que otro proceso creó el item
                    // Reintentar la operación UPDATE
                    if (putError.name === 'ConditionalCheckFailedException') {
                        attempt++;
                        if (attempt >= maxRetries) {
                            console.error('❌ Máximo de reintentos alcanzado para incrementar voto');
                            throw new Error('Error interno del sistema. Demasiados intentos concurrentes.');
                        }
                        console.log(`🔄 Reintentando incremento de voto (intento ${attempt + 1}/${maxRetries})`);
                        continue;
                    }
                    throw putError;
                }
            }
            // Para otros errores, reintentamos si no hemos alcanzado el máximo
            attempt++;
            if (attempt >= maxRetries) {
                console.error('❌ Error incrementando voto después de múltiples intentos:', error);
                throw error;
            }
            console.log(`🔄 Reintentando incremento de voto debido a error (intento ${attempt + 1}/${maxRetries}):`, error.name);
            // Pequeña pausa antes del reintento para evitar condiciones de carrera
            await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        }
    }
    throw new Error('Error interno del sistema. No se pudo procesar el voto después de múltiples intentos.');
}
/**
 * Obtener total de miembros activos en la sala
 */
async function getTotalActiveMembers(roomId) {
    const response = await docClient.send(new lib_dynamodb_1.QueryCommand({
        TableName: process.env.ROOM_MEMBERS_TABLE,
        KeyConditionExpression: 'roomId = :roomId',
        FilterExpression: 'isActive = :active',
        ExpressionAttributeValues: {
            ':roomId': roomId,
            ':active': true,
        },
        Select: 'COUNT',
    }));
    return response.Count || 0;
}
/**
 * Actualizar sala con resultado del match
 */
async function updateRoomWithMatch(roomId, movieId) {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            console.log('🔍 DEBUG: updateRoomWithMatch usando clave:', { PK: roomId, SK: 'ROOM' });
            await docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: process.env.ROOMS_TABLE,
                Key: { PK: roomId, SK: 'ROOM' },
                UpdateExpression: 'SET #status = :status, resultMovieId = :movieId, updatedAt = :updatedAt',
                ExpressionAttributeNames: {
                    '#status': 'status', // 'status' es palabra reservada en DynamoDB
                },
                ExpressionAttributeValues: {
                    ':status': 'MATCHED',
                    ':movieId': movieId,
                    ':updatedAt': new Date().toISOString(),
                },
            }));
            console.log(`✅ Sala ${roomId} actualizada con match: película ${movieId}`);
            return; // Success
        }
        catch (error) {
            // Manejar errores de clave
            if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                console.error('❌ Error de estructura de clave en ROOMS_TABLE (UPDATE):', error.message);
                throw new Error('Error interno del sistema al actualizar la sala.');
            }
            // Errores de red o temporales - reintentar
            if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                attempt++;
                if (attempt >= maxRetries) {
                    console.error('❌ Máximo de reintentos alcanzado para updateRoomWithMatch');
                    throw new Error('Error interno del sistema. No se pudo actualizar la sala después de múltiples intentos.');
                }
                console.log(`🔄 Reintentando updateRoomWithMatch (intento ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt))); // Exponential backoff
                continue;
            }
            console.error('❌ Error actualizando sala con match:', error);
            throw error;
        }
    }
    throw new Error('Error interno del sistema. No se pudo actualizar la sala después de múltiples intentos.');
}
/**
 * Prevenir votos duplicados del mismo usuario para la misma película
 * ACTUALIZADA: Solo verifica, no registra el voto (eso lo hace recordUserVote)
 */
async function preventDuplicateVote(userId, roomId, movieId) {
    const userMovieKey = `${userId}#${movieId}`;
    
    try {
        // Verificar si el usuario ya votó por esta película en esta sala
        const existingVote = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.VOTES_TABLE,
            Key: {
                roomId,
                'userId#movieId': userMovieKey
            },
        }));
        
        if (existingVote.Item) {
            throw new Error(`Usuario ${userId} ya votó por la película ${movieId} en la sala ${roomId}`);
        }
        
        console.log(`✅ Verificación de voto duplicado pasada para usuario ${userId}, película ${movieId}`);
        
    } catch (error) {
        if (error.message.includes('ya votó por la película')) {
            throw error; // Re-lanzar errores de negocio
        }
        
        // Manejar errores de DynamoDB
        if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
            console.error('❌ Error de estructura de clave en VOTES_TABLE:', error.message);
            throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
        }
        
        throw error;
    }
}
/**
 * Obtener lista de participantes de la sala
 */
async function getRoomParticipants(roomId) {
    try {
        const response = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            KeyConditionExpression: 'roomId = :roomId',
            FilterExpression: 'isActive = :active',
            ExpressionAttributeValues: {
                ':roomId': roomId,
                ':active': true,
            },
            ProjectionExpression: 'userId',
        }));
        return response.Items?.map(item => item.userId) || [];
    }
    catch (error) {
        console.warn('⚠️ Error obteniendo participantes:', error);
        return [];
    }
}
/**
 * Get voting start time for duration calculation
 */
async function getVotingStartTime(roomId, movieId) {
    try {
        const response = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOM_MATCHES_TABLE,
            Key: { roomId, movieId },
        }));
        if (response.Item?.createdAt) {
            return new Date(response.Item.createdAt);
        }
        return undefined;
    }
    catch (error) {
        console.warn('⚠️ Error getting voting start time:', error);
        return undefined;
    }
}
/**
 * Obtener participantes que votaron LIKE por una película específica
 * CRÍTICO: Solo usuarios que votaron LIKE deben recibir notificaciones de match
 */
async function getParticipantsWhoVotedLike(roomId, movieId) {
    try {
        const response = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.VOTES_TABLE,
            KeyConditionExpression: 'roomId = :roomId',
            FilterExpression: 'movieId = :movieId AND voteType = :voteType',
            ExpressionAttributeValues: {
                ':roomId': roomId,
                ':movieId': movieId,
                ':voteType': 'LIKE'
            },
            ProjectionExpression: 'userId'
        }));
        
        const likingUsers = response.Items?.map(item => item.userId) || [];
        console.log(`👍 Usuarios que votaron LIKE por película ${movieId} en sala ${roomId}: [${likingUsers.join(', ')}]`);
        
        return likingUsers;
    }
    catch (error) {
        console.error(`❌ Error obteniendo usuarios que votaron LIKE para película ${movieId} en sala ${roomId}:`, error);
        return [];
    }
}

/**
 * Registrar película como mostrada en la sala
 * Usa un Set en DynamoDB para evitar duplicados automáticamente
 */
async function trackShownMovie(roomId, movieId) {
    try {
        await docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { id: roomId },
            UpdateExpression: 'ADD shownMovieIds :movieSet',
            ExpressionAttributeValues: {
                ':movieSet': new Set([movieId]),
            },
        }));
    }
    catch (error) {
        console.error(`⚠️ Error al registrar película mostrada ${movieId}:`, error);
        // No fallamos el voto si esto falla, es secundario
    }
}

/**
 * NUEVA: Verificar si ya existe un match en la sala
 */
async function checkExistingMatch(roomId) {
    try {
        const response = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { PK: roomId, SK: 'ROOM' },
            ProjectionExpression: '#status, resultMovieId',
            ExpressionAttributeNames: {
                '#status': 'status'
            }
        }));
        
        if (response.Item && response.Item.status === 'MATCHED') {
            const movieTitle = await appsyncPublisher.getMovieTitle(response.Item.resultMovieId);
            return {
                movieId: response.Item.resultMovieId,
                movieTitle
            };
        }
        
        return null;
    } catch (error) {
        console.warn(`⚠️ Error verificando match existente para sala ${roomId}:`, error);
        return null;
    }
}

/**
 * NUEVA: Registrar voto individual del usuario (LIKE o DISLIKE)
 */
async function recordUserVote(userId, roomId, movieId, voteType) {
    try {
        const userMovieKey = `${userId}#${movieId}`;
        
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.VOTES_TABLE,
            Item: {
                roomId,
                'userId#movieId': userMovieKey,
                userId,
                movieId,
                voteType, // 'LIKE' o 'DISLIKE'
                votedAt: new Date().toISOString()
            },
            ConditionExpression: 'attribute_not_exists(roomId) AND attribute_not_exists(#sk)',
            ExpressionAttributeNames: {
                '#sk': 'userId#movieId'
            }
        }));
        
        console.log(`✅ Voto ${voteType} registrado: Usuario ${userId}, Película ${movieId}`);
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            throw new Error(`Usuario ${userId} ya votó por la película ${movieId}`);
        }
        throw error;
    }
}

/**
 * NUEVA: Verificar si todos los miembros han votado por una película específica
 */
async function checkAllMembersVotedForMovie(roomId, movieId, totalMembers) {
    try {
        // Contar cuántos usuarios únicos han votado por esta película (LIKE o DISLIKE)
        const response = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.VOTES_TABLE,
            KeyConditionExpression: 'roomId = :roomId',
            FilterExpression: 'movieId = :movieId',
            ExpressionAttributeValues: {
                ':roomId': roomId,
                ':movieId': movieId
            },
            ProjectionExpression: 'userId'
        }));
        
        const uniqueVoters = new Set(response.Items?.map(item => item.userId) || []);
        const totalVotes = uniqueVoters.size;
        
        console.log(`📊 Película ${movieId}: ${totalVotes}/${totalMembers} usuarios han votado`);
        
        return totalVotes >= totalMembers;
    } catch (error) {
        console.error(`❌ Error verificando votos totales para película ${movieId}:`, error);
        return false;
    }
}

/**
 * NUEVA: Obtener progreso de votación de un usuario específico
 */
async function getUserVotingProgress(userId, roomId) {
    try {
        // Contar cuántas películas ha votado este usuario en esta sala
        const response = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.VOTES_TABLE,
            KeyConditionExpression: 'roomId = :roomId',
            FilterExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':roomId': roomId,
                ':userId': userId
            },
            ProjectionExpression: 'movieId'
        }));
        
        const votedMovies = response.Items?.map(item => item.movieId) || [];
        const votedCount = votedMovies.length;
        
        console.log(`📊 Usuario ${userId}: Ha votado ${votedCount}/50 películas`);
        
        return {
            votedCount,
            votedMovies,
            isFinished: votedCount >= 50
        };
    } catch (error) {
        console.error(`❌ Error obteniendo progreso de usuario ${userId}:`, error);
        return {
            votedCount: 0,
            votedMovies: [],
            isFinished: false
        };
    }
}

/**
 * NUEVA: Verificar si TODOS los usuarios han terminado de votar (50 películas cada uno)
 */
async function checkAllUsersFinished(roomId, totalMembers) {
    try {
        // Obtener todos los miembros activos de la sala
        const membersResponse = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            KeyConditionExpression: 'roomId = :roomId',
            FilterExpression: 'isActive = :active',
            ExpressionAttributeValues: {
                ':roomId': roomId,
                ':active': true
            },
            ProjectionExpression: 'userId'
        }));
        
        const activeMembers = membersResponse.Items?.map(item => item.userId) || [];
        console.log(`👥 Miembros activos en sala ${roomId}: ${activeMembers.length}`);
        
        // Verificar progreso de cada miembro
        let finishedCount = 0;
        for (const userId of activeMembers) {
            const progress = await getUserVotingProgress(userId, roomId);
            if (progress.isFinished) {
                finishedCount++;
            }
        }
        
        console.log(`🏁 Usuarios terminados: ${finishedCount}/${activeMembers.length}`);
        
        return finishedCount >= activeMembers.length && activeMembers.length >= totalMembers;
    } catch (error) {
        console.error(`❌ Error verificando si todos terminaron en sala ${roomId}:`, error);
        return false;
    }
}

/**
 * NUEVA: Notificar a todos los miembros de la sala (incluso si están fuera)
 */
async function notifyAllRoomMembers(roomId, notification) {
    try {
        // Obtener todos los miembros de la sala
        const members = await getRoomParticipants(roomId);
        
        console.log(`📢 Notificando a ${members.length} miembros de sala ${roomId}:`, notification);
        
        // En una implementación real, esto enviaría push notifications
        // Por ahora, publicamos evento AppSync para usuarios conectados
        await appsyncPublisher.publishMatchFoundEvent(roomId, {
            type: notification.type,
            movieId: notification.movieId,
            movieTitle: notification.movieTitle,
            message: notification.message,
            participants: members,
            timestamp: new Date().toISOString()
        });
        
        // TODO: Implementar push notifications para usuarios desconectados
        
    } catch (error) {
        console.error(`❌ Error notificando miembros de sala ${roomId}:`, error);
        // No fallar el flujo principal si las notificaciones fallan
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm90ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZvdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUFvSDtBQUVwSCwrREFBK0Q7QUFDL0QsTUFBTSxnQkFBZ0IsR0FBRztJQUN2QixzQkFBc0IsRUFBRSxLQUFLLEVBQUUsTUFBYyxFQUFFLFNBQWMsRUFBRSxFQUFFO1FBQy9ELE9BQU8sQ0FBQyxHQUFHLENBQUMsNENBQTRDLE1BQU0sR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzlFLHdFQUF3RTtJQUMxRSxDQUFDO0lBQ0Qsc0JBQXNCLEVBQUUsS0FBSyxFQUFFLE1BQWMsRUFBRSxRQUFhLEVBQUUsRUFBRTtRQUM5RCxPQUFPLENBQUMsR0FBRyxDQUFDLDRDQUE0QyxNQUFNLEdBQUcsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUM3RSx3RUFBd0U7SUFDMUUsQ0FBQztJQUNELGFBQWEsRUFBRSxLQUFLLEVBQUUsT0FBZSxFQUFFLEVBQUU7UUFDdkMsT0FBTyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUNyRCxPQUFPLFNBQVMsT0FBTyxFQUFFLENBQUM7SUFDNUIsQ0FBQztDQUNGLENBQUM7QUFFRixNQUFNLE9BQU8sR0FBRztJQUNkLGlCQUFpQixFQUFFLENBQUMsSUFBWSxFQUFFLEtBQWEsRUFBRSxJQUFhLEVBQUUsRUFBRTtRQUNoRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixJQUFJLE1BQU0sS0FBSyxJQUFJLElBQUksSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFDRCxRQUFRLEVBQUUsQ0FBQyxTQUFpQixFQUFFLEtBQVUsRUFBRSxFQUFFO1FBQzFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsY0FBYyxTQUFTLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBQ0QsZ0JBQWdCLEVBQUU7UUFFaEIsWUFBb0IsU0FB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T0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBbUI7WUFDMUMsR0FBRyxFQUFFLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRTtTQUN6QixDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQztZQUM3QixPQUFPLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDM0MsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ25CLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzRCxPQUFPLFNBQVMsQ0FBQztJQUNuQixDQUFDO0FBQ0gsQ0FBQztBQUVEOzs7R0FHRztBQUNILEtBQUssVUFBVSxlQUFlLENBQUMsTUFBYyxFQUFFLE9BQWU7SUFDNUQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksNEJBQWEsQ0FBQztZQUNyQyxTQUFTLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFZO1lBQ25DLEdBQUcsRUFBRSxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUU7WUFDbkIsZ0JBQWdCLEVBQUUsNkJBQTZCO1lBQy9DLHlCQUF5QixFQUFFO2dCQUN6QixXQUFXLEVBQUUsSUFBSSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQzthQUNoQztTQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ04sQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxPQUFPLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1RSxtREFBbUQ7SUFDckQsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBTeW5jUmVzb2x2ZXJFdmVudCwgQXBwU3luY1Jlc29sdmVySGFuZGxlciB9IGZyb20gJ2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XHJcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIEdldENvbW1hbmQsIFB1dENvbW1hbmQsIFVwZGF0ZUNvbW1hbmQsIFF1ZXJ5Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcblxyXG4vLyBTaW1wbGlmaWVkIGlubGluZSBpbXBsZW1lbnRhdGlvbnMgdG8gYXZvaWQgZGVwZW5kZW5jeSBpc3N1ZXNcclxuY29uc3QgYXBwc3luY1B1Ymxpc2hlciA9IHtcclxuICBwdWJsaXNoTWF0Y2hGb3VuZEV2ZW50OiBhc3luYyAocm9vbUlkOiBzdHJpbmcsIG1hdGNoRGF0YTogYW55KSA9PiB7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBQdWJsaXNoaW5nIG1hdGNoIGZvdW5kIGV2ZW50IGZvciByb29tICR7cm9vbUlkfTpgLCBtYXRjaERhdGEpO1xyXG4gICAgLy8gSW4gYSByZWFsIGltcGxlbWVudGF0aW9uLCB0aGlzIHdvdWxkIHB1Ymxpc2ggdG8gQXBwU3luYyBzdWJzY3JpcHRpb25zXHJcbiAgfSxcclxuICBwdWJsaXNoVm90ZVVwZGF0ZUV2ZW50OiBhc3luYyAocm9vbUlkOiBzdHJpbmcsIHZvdGVEYXRhOiBhbnkpID0+IHtcclxuICAgIGNvbnNvbGUubG9nKGDwn5OhIFB1Ymxpc2hpbmcgdm90ZSB1cGRhdGUgZXZlbnQgZm9yIHJvb20gJHtyb29tSWR9OmAsIHZvdGVEYXRhKTtcclxuICAgIC8vIEluIGEgcmVhbCBpbXBsZW1lbnRhdGlvbiwgdGhpcyB3b3VsZCBwdWJsaXNoIHRvIEFwcFN5bmMgc3Vic2NyaXB0aW9uc1xyXG4gIH0sXHJcbiAgZ2V0TW92aWVUaXRsZTogYXN5bmMgKG1vdmllSWQ6IHN0cmluZykgPT4ge1xyXG4gICAgY29uc29sZS5sb2coYPCfjqwgR2V0dGluZyBtb3ZpZSB0aXRsZSBmb3IgJHttb3ZpZUlkfWApO1xyXG4gICAgcmV0dXJuIGBNb3ZpZSAke21vdmllSWR9YDtcclxuICB9XHJcbn07XHJcblxyXG5jb25zdCBtZXRyaWNzID0ge1xyXG4gIGxvZ0J1c2luZXNzTWV0cmljOiAobmFtZTogc3RyaW5nLCB2YWx1ZTogbnVtYmVyLCB1bml0Pzogc3RyaW5nKSA9PiB7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+TiiBCdXNpbmVzcyBNZXRyaWM6ICR7bmFtZX0gPSAke3ZhbHVlfSAke3VuaXQgfHwgJyd9YCk7XHJcbiAgfSxcclxuICBsb2dFcnJvcjogKG9wZXJhdGlvbjogc3RyaW5nLCBlcnJvcjogYW55KSA9PiB7XHJcbiAgICBjb25zb2xlLmVycm9yKGDinYwgRXJyb3IgaW4gJHtvcGVyYXRpb259OmAsIGVycm9yKTtcclxuICB9LFxyXG4gIFBlcmZvcm1hbmNlVGltZXI6IGNsYXNzIHtcclxuICAgIHByaXZhdGUgc3RhcnRUaW1lOiBudW1iZXI7XHJcbiAgICBjb25zdHJ1Y3Rvcihwcml2YXRlIG9wZXJhdGlvbjogc3RyaW5nKSB7XHJcbiAgICAgIHRoaXMuc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgIH1cclxuICAgIGVuZCgpIHtcclxuICAgICAgY29uc3QgZHVyYXRpb24gPSBEYXRlLm5vdygpIC0gdGhpcy5zdGFydFRpbWU7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDij7HvuI8gJHt0aGlzLm9wZXJhdGlvbn0gY29tcGxldGVkIGluICR7ZHVyYXRpb259bXNgKTtcclxuICAgIH1cclxuICB9XHJcbn07XHJcblxyXG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xyXG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50IGFzIGFueSk7XHJcblxyXG5pbnRlcmZhY2UgUm9vbSB7XHJcbiAgaWQ6IHN0cmluZztcclxuICBzdGF0dXM6IHN0cmluZztcclxuICByZXN1bHRNb3ZpZUlkPzogc3RyaW5nO1xyXG4gIGhvc3RJZDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVm90ZSB7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgbW92aWVJZDogc3RyaW5nO1xyXG4gIHZvdGVzOiBudW1iZXI7XHJcbiAgY3JlYXRlZEF0OiBzdHJpbmc7XHJcbiAgdXBkYXRlZEF0OiBzdHJpbmc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBWb3RlSGFuZGxlcjogTMOzZ2ljYSBTdG9wLW9uLU1hdGNoXHJcbiAqIEltcGxlbWVudGEgZWwgYWxnb3JpdG1vIGRlIHZvdGFjacOzbiBxdWUgdGVybWluYSBjdWFuZG8gdG9kb3MgbG9zIG1pZW1icm9zIHZvdGFuXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgaGFuZGxlcjogQXBwU3luY1Jlc29sdmVySGFuZGxlcjxhbnksIGFueT4gPSBhc3luYyAoZXZlbnQ6IEFwcFN5bmNSZXNvbHZlckV2ZW50PGFueT4pID0+IHtcclxuICBjb25zb2xlLmxvZygn8J+Xs++4jyBWb3RlIEhhbmRsZXI6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuXHJcbiAgY29uc3QgZmllbGROYW1lID0gZXZlbnQuaW5mbz8uZmllbGROYW1lO1xyXG4gIGNvbnN0IGFyZ3MgPSBldmVudC5hcmd1bWVudHM7XHJcbiAgY29uc3QgeyBzdWI6IHVzZXJJZCB9ID0gZXZlbnQuaWRlbnRpdHkgYXMgYW55OyAvLyBVc3VhcmlvIGF1dGVudGljYWRvXHJcblxyXG4gIHRyeSB7XHJcbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xyXG4gICAgICBjYXNlICd2b3RlJzpcclxuICAgICAgICAvLyBFeHRyYWVyIHBhcsOhbWV0cm9zIGRlbCBpbnB1dCBzZWfDum4gZWwgc2NoZW1hIEdyYXBoUUxcclxuICAgICAgICBjb25zdCB7IHJvb21JZCwgbW92aWVJZCwgdm90ZVR5cGUgfSA9IGFyZ3MuaW5wdXQ7XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IHByb2Nlc3NWb3RlKHVzZXJJZCwgcm9vbUlkLCBtb3ZpZUlkLCB2b3RlVHlwZSk7XHJcblxyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgT3BlcmFjacOzbiBubyBzb3BvcnRhZGE6ICR7ZmllbGROYW1lfWApO1xyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKGDinYwgRXJyb3IgZW4gJHtmaWVsZE5hbWV9OmAsIGVycm9yKTtcclxuXHJcbiAgICAvLyBNZWpvcmFyIG1lbnNhamVzIGRlIGVycm9yIHBhcmEgZWwgdXN1YXJpb1xyXG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcclxuICAgICAgLy8gU2kgZXMgdW4gZXJyb3IgZGUgc2lzdGVtYSBpbnRlcm5vLCBubyBleHBvbmVyIGRldGFsbGVzIHTDqWNuaWNvc1xyXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYScpKSB7XHJcbiAgICAgICAgdGhyb3cgZXJyb3I7IC8vIFlhIHRpZW5lIHVuIG1lbnNhamUgYW1pZ2FibGVcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gUGFyYSBvdHJvcyBlcnJvcmVzLCBwcm9wb3JjaW9uYXIgY29udGV4dG8gYWRpY2lvbmFsXHJcbiAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdTYWxhIG5vIGVuY29udHJhZGEnKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTGEgc2FsYSBlc3BlY2lmaWNhZGEgbm8gZXhpc3RlIG8gbm8gdGllbmVzIGFjY2VzbyBhIGVsbGEuJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdVc3VhcmlvIG5vIGVzIG1pZW1icm8gYWN0aXZvJykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGVyZXMgbWllbWJybyBkZSBlc3RhIHNhbGEgbyB0dSBtZW1icmVzw61hIG5vIGVzdMOhIGFjdGl2YS4nKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ3lhIHZvdMOzIHBvciBsYSBwZWzDrWN1bGEnKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignWWEgaGFzIHZvdGFkbyBwb3IgZXN0YSBwZWzDrWN1bGEgZW4gZXN0YSBzYWxhLicpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnbm8gZXN0w6EgZGlzcG9uaWJsZSBwYXJhIHZvdGFyJykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VzdGEgc2FsYSBubyBlc3TDoSBkaXNwb25pYmxlIHBhcmEgdm90YXIgZW4gZXN0ZSBtb21lbnRvLicpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBFcnJvcmVzIGRlIHJlZCBvIGNvbmVjdGl2aWRhZFxyXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnTmV0d29yaycpIHx8IGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ3RpbWVvdXQnKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUHJvYmxlbWEgZGUgY29uZXhpw7NuLiBQb3IgZmF2b3IsIHZlcmlmaWNhIHR1IGNvbmV4acOzbiBhIGludGVybmV0IGUgaW50w6ludGFsbyBkZSBudWV2by4nKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRXJyb3JlcyBkZSBhdXRvcml6YWNpw7NuXHJcbiAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdVbmF1dGhvcml6ZWQnKSB8fCBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdGb3JiaWRkZW4nKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVHUgc2VzacOzbiBoYSBleHBpcmFkby4gUG9yIGZhdm9yLCBpbmljaWEgc2VzacOzbiBkZSBudWV2by4nKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRXJyb3JlcyBkZSB2YWxpZGFjacOzbiBkZSBkYXRvc1xyXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnVmFsaWRhdGlvbkV4Y2VwdGlvbicpIHx8IGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ0ludmFsaWQnKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTG9zIGRhdG9zIGVudmlhZG9zIG5vIHNvbiB2w6FsaWRvcy4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvLicpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBFcnJvciBnZW7DqXJpY28gcGFyYSBjYXNvcyBubyBtYW5lamFkb3MgZXNwZWPDrWZpY2FtZW50ZVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ09jdXJyacOzIHVuIGVycm9yIGluZXNwZXJhZG8uIFBvciBmYXZvciwgaW50w6ludGFsbyBkZSBudWV2byBtw6FzIHRhcmRlLicpO1xyXG4gICAgfVxyXG5cclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBQcm9jZXNhciB2b3RvIGNvbiBhbGdvcml0bW8gU3RvcC1vbi1NYXRjaFxyXG4gKiBTb2xvIHByb2Nlc2Egdm90b3MgTElLRSAtIGxvcyBESVNMSUtFIHNlIGlnbm9yYW4gc2Vnw7puIGVsIGFsZ29yaXRtb1xyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1ZvdGUodXNlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nLCBtb3ZpZUlkOiBzdHJpbmcsIHZvdGVUeXBlOiBzdHJpbmcpOiBQcm9taXNlPFJvb20+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBtZXRyaWNzLlBlcmZvcm1hbmNlVGltZXIoJ1Byb2Nlc3NWb3RlJyk7XHJcbiAgY29uc29sZS5sb2coYPCfl7PvuI8gUHJvY2VzYW5kbyB2b3RvOiBVc3VhcmlvICR7dXNlcklkfSwgU2FsYSAke3Jvb21JZH0sIFBlbMOtY3VsYSAke21vdmllSWR9LCBUaXBvOiAke3ZvdGVUeXBlfWApO1xyXG5cclxuICB0cnkge1xyXG4gICAgLy8gMS4gVmVyaWZpY2FyIHF1ZSBsYSBzYWxhIGV4aXN0ZSB5IGVzdMOhIEFDVElWRVxyXG4gICAgY29uc3Qgcm9vbSA9IGF3YWl0IGdldFJvb21BbmRWYWxpZGF0ZShyb29tSWQpO1xyXG5cclxuICAgIC8vIDIuIFZlcmlmaWNhciBxdWUgZWwgdXN1YXJpbyBlcyBtaWVtYnJvIGRlIGxhIHNhbGFcclxuICAgIGF3YWl0IHZhbGlkYXRlVXNlck1lbWJlcnNoaXAodXNlcklkLCByb29tSWQpO1xyXG5cclxuICAgIC8vIDMuIFJlZ2lzdHJhciBxdWUgbGEgcGVsw61jdWxhIGhhIHNpZG8gbW9zdHJhZGEgKElORElGRVJFTlRFIGRlbCB0aXBvIGRlIHZvdG8pXHJcbiAgICAvLyBFc3RvIGV2aXRhIHF1ZSB2dWVsdmEgYSBhcGFyZWNlciBwYXJhIGN1YWxxdWllciB1c3VhcmlvIGRlIGxhIHNhbGFcclxuICAgIGF3YWl0IHRyYWNrU2hvd25Nb3ZpZShyb29tSWQsIG1vdmllSWQpO1xyXG5cclxuICAgIC8vIDQuIFNvbG8gcHJvY2VzYXIgdm90b3MgTElLRSAtIGlnbm9yYXIgRElTTElLRSBzZWfDum4gYWxnb3JpdG1vIFN0b3Atb24tTWF0Y2hcclxuICAgIGlmICh2b3RlVHlwZSAhPT0gJ0xJS0UnKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDij63vuI8gSWdub3JhbmRvIHZvdG8gJHt2b3RlVHlwZX0gc2Vnw7puIGFsZ29yaXRtbyBTdG9wLW9uLU1hdGNoYCk7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgaWQ6IHJvb21JZCxcclxuICAgICAgICBzdGF0dXM6IHJvb20uc3RhdHVzLFxyXG4gICAgICAgIHJlc3VsdE1vdmllSWQ6IHJvb20ucmVzdWx0TW92aWVJZCxcclxuICAgICAgICBob3N0SWQ6IHJvb20uaG9zdElkLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIDQuIFByZXZlbmlyIHZvdG9zIGR1cGxpY2Fkb3MgZGVsIG1pc21vIHVzdWFyaW8gcGFyYSBsYSBtaXNtYSBwZWzDrWN1bGFcclxuICAgIGF3YWl0IHByZXZlbnREdXBsaWNhdGVWb3RlKHVzZXJJZCwgcm9vbUlkLCBtb3ZpZUlkKTtcclxuXHJcbiAgICAvLyA1LiBJbmNyZW1lbnRhciBjb250YWRvciBhdMOzbWljbyBlbiBWb3Rlc1RhYmxlXHJcbiAgICBjb25zdCBjdXJyZW50Vm90ZXMgPSBhd2FpdCBpbmNyZW1lbnRWb3RlQ291bnQocm9vbUlkLCBtb3ZpZUlkKTtcclxuXHJcbiAgICAvLyA2LiBPYnRlbmVyIG1heE1lbWJlcnMgZGUgbGEgc2FsYSAobm8gbWllbWJyb3MgYWN0aXZvcyBhY3R1YWxlcylcclxuICAgIC8vIElNUE9SVEFOVEU6IFVzYW1vcyBtYXhNZW1iZXJzIHBhcmEgc2FiZXIgY3XDoW50b3Mgdm90b3Mgc2UgbmVjZXNpdGFuIHBhcmEgY29uc2Vuc29cclxuICAgIGNvbnN0IHRvdGFsTWVtYmVycyA9IHJvb20ubWF4TWVtYmVycyB8fCAyOyAvLyBGYWxsYmFjayBhIDIgc2kgbm8gZXN0w6EgZGVmaW5pZG9cclxuXHJcbiAgICBjb25zb2xlLmxvZyhg8J+TiiBWb3RvcyBhY3R1YWxlczogJHtjdXJyZW50Vm90ZXN9LCBNaWVtYnJvcyByZXF1ZXJpZG9zOiAke3RvdGFsTWVtYmVyc31gKTtcclxuXHJcbiAgICAvLyA3LiBQdWJsaWNhciBldmVudG8gZGUgYWN0dWFsaXphY2nDs24gZGUgdm90byBlbiB0aWVtcG8gcmVhbFxyXG4gICAgYXdhaXQgYXBwc3luY1B1Ymxpc2hlci5wdWJsaXNoVm90ZVVwZGF0ZUV2ZW50KHJvb21JZCwge1xyXG4gICAgICB1c2VySWQsXHJcbiAgICAgIG1vdmllSWQsXHJcbiAgICAgIHZvdGVUeXBlOiAnTElLRScsXHJcbiAgICAgIGN1cnJlbnRWb3RlcyxcclxuICAgICAgdG90YWxNZW1iZXJzXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICBtZXRyaWNzLmxvZ0J1c2luZXNzTWV0cmljKCdWT1RFX0NBU1QnLCAxLCAnY291bnQnKTtcclxuXHJcbiAgICAvLyA4LiBWZXJpZmljYXIgc2kgc2UgYWxjYW56w7MgZWwgY29uc2Vuc28gKFN0b3Atb24tTWF0Y2gpXHJcbiAgICBpZiAoY3VycmVudFZvdGVzID49IHRvdGFsTWVtYmVycykge1xyXG4gICAgICBjb25zb2xlLmxvZygn8J+OiSDCoU1hdGNoIGVuY29udHJhZG8hIEFjdHVhbGl6YW5kbyBzYWxhIHkgbm90aWZpY2FuZG8uLi4nKTtcclxuXHJcbiAgICAgIC8vIEFjdHVhbGl6YXIgc2FsYSBjb24gcmVzdWx0YWRvXHJcbiAgICAgIGF3YWl0IHVwZGF0ZVJvb21XaXRoTWF0Y2gocm9vbUlkLCBtb3ZpZUlkKTtcclxuXHJcbiAgICAgIC8vIE9idGVuZXIgcGFydGljaXBhbnRlcyBwYXJhIGxhIG5vdGlmaWNhY2nDs25cclxuICAgICAgY29uc3QgcGFydGljaXBhbnRzID0gYXdhaXQgZ2V0Um9vbVBhcnRpY2lwYW50cyhyb29tSWQpO1xyXG5cclxuICAgICAgLy8gT2J0ZW5lciB0w610dWxvIGRlIGxhIHBlbMOtY3VsYVxyXG4gICAgICBjb25zdCBtb3ZpZVRpdGxlID0gYXdhaXQgYXBwc3luY1B1Ymxpc2hlci5nZXRNb3ZpZVRpdGxlKG1vdmllSWQpO1xyXG5cclxuICAgICAgLy8gR2V0IHZvdGluZyBzdGFydCB0aW1lIGZvciBkdXJhdGlvbiBjYWxjdWxhdGlvblxyXG4gICAgICBjb25zdCB2b3RpbmdTdGFydFRpbWUgPSBhd2FpdCBnZXRWb3RpbmdTdGFydFRpbWUocm9vbUlkLCBtb3ZpZUlkKTtcclxuXHJcbiAgICAgIC8vIFB1YmxpY2FyIGV2ZW50byBkZSBtYXRjaCBlbmNvbnRyYWRvIGVuIHRpZW1wbyByZWFsIGNvbiBpbmZvcm1hY2nDs24gZGV0YWxsYWRhXHJcbiAgICAgIGF3YWl0IGFwcHN5bmNQdWJsaXNoZXIucHVibGlzaE1hdGNoRm91bmRFdmVudChyb29tSWQsIHtcclxuICAgICAgICBtb3ZpZUlkLFxyXG4gICAgICAgIG1vdmllVGl0bGUsXHJcbiAgICAgICAgcGFydGljaXBhbnRzLFxyXG4gICAgICAgIHZvdGluZ1N0YXJ0VGltZVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIExvZyBidXNpbmVzcyBtZXRyaWMgZm9yIG1hdGNoXHJcbiAgICAgIG1ldHJpY3MubG9nQnVzaW5lc3NNZXRyaWMoJ01BVENIX0ZPVU5EJywgMSwgJ2NvdW50Jyk7XHJcblxyXG4gICAgICB0aW1lci5lbmQoKTtcclxuXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgLi4ucm9vbSwgLy8gUmV0dXJuIGZ1bGwgcm9vbSBvYmplY3RcclxuICAgICAgICBzdGF0dXM6ICdNQVRDSEVEJyxcclxuICAgICAgICByZXN1bHRNb3ZpZUlkOiBtb3ZpZUlkLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIDkuIFNpIG5vIGhheSBtYXRjaCwgcmV0b3JuYXIgc2FsYSBhY3R1YWxpemFkYVxyXG4gICAgdGltZXIuZW5kKCk7XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgLi4ucm9vbSwgLy8gUmV0dXJuIGZ1bGwgcm9vbSBvYmplY3RcclxuICAgICAgLy8gTm8gc3RhdHVzIGNoYW5nZSBmb3Igbm9ybWFsIHZvdGVcclxuICAgIH07XHJcblxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBtZXRyaWNzLmxvZ0Vycm9yKCdQcm9jZXNzVm90ZScsIGVycm9yIGFzIEVycm9yKTtcclxuICAgIHRpbWVyLmVuZCgpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciB5IHZhbGlkYXIgc2FsYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0Um9vbUFuZFZhbGlkYXRlKHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcclxuICBjb25zdCBtYXhSZXRyaWVzID0gMztcclxuICBsZXQgYXR0ZW1wdCA9IDA7XHJcblxyXG4gIHdoaWxlIChhdHRlbXB0IDwgbWF4UmV0cmllcykge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc29sZS5sb2coJ/CflI0gREVCVUc6IGdldFJvb21BbmRWYWxpZGF0ZSB1c2FuZG8gY2xhdmU6JywgeyBQSzogcm9vbUlkLCBTSzogJ1JPT00nIH0pO1xyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgICBLZXk6IHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9LFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBpZiAoIXJlc3BvbnNlLkl0ZW0pIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1NhbGEgbm8gZW5jb250cmFkYScpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCByb29tID0gcmVzcG9uc2UuSXRlbTtcclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SNIFJvb20gU3RhdHVzIENoZWNrOiBJRD0ke3Jvb20uaWR9LCBTdGF0dXM9JHtyb29tLnN0YXR1c30sIFR5cGU9JHt0eXBlb2Ygcm9vbS5zdGF0dXN9YCk7XHJcbiAgICAgIGlmIChyb29tLnN0YXR1cyAhPT0gJ0FDVElWRScgJiYgcm9vbS5zdGF0dXMgIT09ICdXQUlUSU5HJykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTGEgc2FsYSBubyBlc3TDoSBkaXNwb25pYmxlIHBhcmEgdm90YXIuIEVzdGFkbyBhY3R1YWw6ICR7cm9vbS5zdGF0dXN9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiByb29tO1xyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAvLyBEaXN0aW5ndWlyIGVudHJlIGVycm9yZXMgZGUgY2xhdmUgeSBlcnJvcmVzIGRlIG5lZ29jaW9cclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdWYWxpZGF0aW9uRXhjZXB0aW9uJyAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdrZXkgZWxlbWVudCBkb2VzIG5vdCBtYXRjaCcpKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRlIGVzdHJ1Y3R1cmEgZGUgY2xhdmUgZW4gUk9PTVNfVEFCTEU6JywgZXJyb3IubWVzc2FnZSk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBQb3IgZmF2b3IsIGludMOpbnRhbG8gZGUgbnVldm8gbcOhcyB0YXJkZS4nKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRXJyb3JlcyBkZSByZWQgbyB0ZW1wb3JhbGVzIC0gcmVpbnRlbnRhclxyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1NlcnZpY2VFeGNlcHRpb24nIHx8IGVycm9yLm5hbWUgPT09ICdUaHJvdHRsaW5nRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnSW50ZXJuYWxTZXJ2ZXJFcnJvcicpIHtcclxuICAgICAgICBhdHRlbXB0Kys7XHJcbiAgICAgICAgaWYgKGF0dGVtcHQgPj0gbWF4UmV0cmllcykge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIE3DoXhpbW8gZGUgcmVpbnRlbnRvcyBhbGNhbnphZG8gcGFyYSBnZXRSb29tQW5kVmFsaWRhdGUnKTtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gU2VydmljaW8gdGVtcG9yYWxtZW50ZSBubyBkaXNwb25pYmxlLicpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coYPCflIQgUmVpbnRlbnRhbmRvIGdldFJvb21BbmRWYWxpZGF0ZSAoaW50ZW50byAke2F0dGVtcHQgKyAxfS8ke21heFJldHJpZXN9KWApO1xyXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAgKiBNYXRoLnBvdygyLCBhdHRlbXB0KSkpOyAvLyBFeHBvbmVudGlhbCBiYWNrb2ZmXHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFJlLWxhbnphciBlcnJvcmVzIGRlIG5lZ29jaW8gdGFsIGNvbW8gZXN0w6FuXHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBObyBzZSBwdWRvIHZhbGlkYXIgbGEgc2FsYSBkZXNwdcOpcyBkZSBtw7psdGlwbGVzIGludGVudG9zLicpO1xyXG59XHJcblxyXG4vKipcclxuICogVmFsaWRhciBxdWUgZWwgdXN1YXJpbyBlcyBtaWVtYnJvIGRlIGxhIHNhbGFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHZhbGlkYXRlVXNlck1lbWJlcnNoaXAodXNlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgY29uc3QgbWF4UmV0cmllcyA9IDM7XHJcbiAgbGV0IGF0dGVtcHQgPSAwO1xyXG5cclxuICB3aGlsZSAoYXR0ZW1wdCA8IG1heFJldHJpZXMpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgICBLZXk6IHsgcm9vbUlkLCB1c2VySWQgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5JdGVtIHx8ICFyZXNwb25zZS5JdGVtLmlzQWN0aXZlKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVc3VhcmlvIG5vIGVzIG1pZW1icm8gYWN0aXZvIGRlIGxhIHNhbGEnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuOyAvLyBTdWNjZXNzXHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgIC8vIERpc3Rpbmd1aXIgZW50cmUgZXJyb3JlcyBkZSBjbGF2ZSB5IGVycm9yZXMgZGUgbmVnb2Npb1xyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1ZhbGlkYXRpb25FeGNlcHRpb24nICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2tleSBlbGVtZW50IGRvZXMgbm90IG1hdGNoJykpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZGUgZXN0cnVjdHVyYSBkZSBjbGF2ZSBlbiBST09NX01FTUJFUlNfVEFCTEU6JywgZXJyb3IubWVzc2FnZSk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBQb3IgZmF2b3IsIGludMOpbnRhbG8gZGUgbnVldm8gbcOhcyB0YXJkZS4nKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRXJyb3JlcyBkZSByZWQgbyB0ZW1wb3JhbGVzIC0gcmVpbnRlbnRhclxyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1NlcnZpY2VFeGNlcHRpb24nIHx8IGVycm9yLm5hbWUgPT09ICdUaHJvdHRsaW5nRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnSW50ZXJuYWxTZXJ2ZXJFcnJvcicpIHtcclxuICAgICAgICBhdHRlbXB0Kys7XHJcbiAgICAgICAgaWYgKGF0dGVtcHQgPj0gbWF4UmV0cmllcykge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIE3DoXhpbW8gZGUgcmVpbnRlbnRvcyBhbGNhbnphZG8gcGFyYSB2YWxpZGF0ZVVzZXJNZW1iZXJzaGlwJyk7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIFNlcnZpY2lvIHRlbXBvcmFsbWVudGUgbm8gZGlzcG9uaWJsZS4nKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlaW50ZW50YW5kbyB2YWxpZGF0ZVVzZXJNZW1iZXJzaGlwIChpbnRlbnRvICR7YXR0ZW1wdCArIDF9LyR7bWF4UmV0cmllc30pYCk7XHJcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCAqIE1hdGgucG93KDIsIGF0dGVtcHQpKSk7IC8vIEV4cG9uZW50aWFsIGJhY2tvZmZcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gUmUtbGFuemFyIGVycm9yZXMgZGUgbmVnb2NpbyB0YWwgY29tbyBlc3TDoW5cclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIE5vIHNlIHB1ZG8gdmFsaWRhciBsYSBtZW1icmVzw61hIGRlc3B1w6lzIGRlIG3Dumx0aXBsZXMgaW50ZW50b3MuJyk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBJbmNyZW1lbnRhciBjb250YWRvciBhdMOzbWljbyBkZSB2b3RvcyBjb24gbWFuZWpvIG1lam9yYWRvIGRlIGNvbmN1cnJlbmNpYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gaW5jcmVtZW50Vm90ZUNvdW50KHJvb21JZDogc3RyaW5nLCBtb3ZpZUlkOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xyXG4gIGNvbnN0IG1heFJldHJpZXMgPSAzO1xyXG4gIGxldCBhdHRlbXB0ID0gMDtcclxuXHJcbiAgd2hpbGUgKGF0dGVtcHQgPCBtYXhSZXRyaWVzKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBJbnRlbnRhciBhY3R1YWxpemFyIHZvdG8gZXhpc3RlbnRlIGNvbiBvcGVyYWNpw7NuIGF0w7NtaWNhXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFVwZGF0ZUNvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NQVRDSEVTX1RBQkxFISwgLy8gVXNpbmcgTWF0Y2hlcyB0YWJsZSBmb3IgYWdncmVnYXRpb25cclxuICAgICAgICBLZXk6IHsgcm9vbUlkLCBtb3ZpZUlkIH0sXHJcbiAgICAgICAgVXBkYXRlRXhwcmVzc2lvbjogJ0FERCB2b3RlcyA6aW5jcmVtZW50IFNFVCB1cGRhdGVkQXQgPSA6dXBkYXRlZEF0JyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOmluY3JlbWVudCc6IDEsXHJcbiAgICAgICAgICAnOnVwZGF0ZWRBdCc6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIFJldHVyblZhbHVlczogJ0FMTF9ORVcnLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBjb25zdCB2b3RlQ291bnQgPSByZXNwb25zZS5BdHRyaWJ1dGVzPy52b3RlcyB8fCAxO1xyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFZvdG8gaW5jcmVtZW50YWRvOiBTYWxhICR7cm9vbUlkfSwgUGVsw61jdWxhICR7bW92aWVJZH0sIFRvdGFsOiAke3ZvdGVDb3VudH1gKTtcclxuICAgICAgcmV0dXJuIHZvdGVDb3VudDtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgIC8vIE1hbmVqYXIgZXJyb3JlcyBkZSBjbGF2ZVxyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1ZhbGlkYXRpb25FeGNlcHRpb24nICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2tleSBlbGVtZW50IGRvZXMgbm90IG1hdGNoJykpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZGUgZXN0cnVjdHVyYSBkZSBjbGF2ZSBlbiBWT1RFU19UQUJMRTonLCBlcnJvci5tZXNzYWdlKTtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIFBvciBmYXZvciwgaW50w6ludGFsbyBkZSBudWV2byBtw6FzIHRhcmRlLicpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBTaSBlbCBpdGVtIG5vIGV4aXN0ZSwgaW50ZW50YXIgY3JlYXJsb1xyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1Jlc291cmNlTm90Rm91bmRFeGNlcHRpb24nIHx8ICFlcnJvci5uYW1lKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGNvbnN0IG5ld1ZvdGU6IFZvdGUgPSB7XHJcbiAgICAgICAgICAgIHJvb21JZCxcclxuICAgICAgICAgICAgbW92aWVJZCxcclxuICAgICAgICAgICAgdm90ZXM6IDEsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUFUQ0hFU19UQUJMRSEsXHJcbiAgICAgICAgICAgIEl0ZW06IG5ld1ZvdGUsXHJcbiAgICAgICAgICAgIENvbmRpdGlvbkV4cHJlc3Npb246ICdhdHRyaWJ1dGVfbm90X2V4aXN0cyhyb29tSWQpIEFORCBhdHRyaWJ1dGVfbm90X2V4aXN0cyhtb3ZpZUlkKScsXHJcbiAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgICAgY29uc29sZS5sb2coYOKchSBOdWV2byB2b3RvIGNyZWFkbzogU2FsYSAke3Jvb21JZH0sIFBlbMOtY3VsYSAke21vdmllSWR9LCBUb3RhbDogMWApO1xyXG4gICAgICAgICAgcmV0dXJuIDE7XHJcblxyXG4gICAgICAgIH0gY2F0Y2ggKHB1dEVycm9yOiBhbnkpIHtcclxuICAgICAgICAgIGlmIChwdXRFcnJvci5uYW1lID09PSAnVmFsaWRhdGlvbkV4Y2VwdGlvbicgJiYgcHV0RXJyb3IubWVzc2FnZS5pbmNsdWRlcygna2V5IGVsZW1lbnQgZG9lcyBub3QgbWF0Y2gnKSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZGUgZXN0cnVjdHVyYSBkZSBjbGF2ZSBlbiBWT1RFU19UQUJMRSAoUFVUKTonLCBwdXRFcnJvci5tZXNzYWdlKTtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBQb3IgZmF2b3IsIGludMOpbnRhbG8gZGUgbnVldm8gbcOhcyB0YXJkZS4nKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBTaSBmYWxsYSBsYSBjb25kaWNpw7NuLCBzaWduaWZpY2EgcXVlIG90cm8gcHJvY2VzbyBjcmXDsyBlbCBpdGVtXHJcbiAgICAgICAgICAvLyBSZWludGVudGFyIGxhIG9wZXJhY2nDs24gVVBEQVRFXHJcbiAgICAgICAgICBpZiAocHV0RXJyb3IubmFtZSA9PT0gJ0NvbmRpdGlvbmFsQ2hlY2tGYWlsZWRFeGNlcHRpb24nKSB7XHJcbiAgICAgICAgICAgIGF0dGVtcHQrKztcclxuICAgICAgICAgICAgaWYgKGF0dGVtcHQgPj0gbWF4UmV0cmllcykge1xyXG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBNw6F4aW1vIGRlIHJlaW50ZW50b3MgYWxjYW56YWRvIHBhcmEgaW5jcmVtZW50YXIgdm90bycpO1xyXG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gRGVtYXNpYWRvcyBpbnRlbnRvcyBjb25jdXJyZW50ZXMuJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc29sZS5sb2coYPCflIQgUmVpbnRlbnRhbmRvIGluY3JlbWVudG8gZGUgdm90byAoaW50ZW50byAke2F0dGVtcHQgKyAxfS8ke21heFJldHJpZXN9KWApO1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICB0aHJvdyBwdXRFcnJvcjtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFBhcmEgb3Ryb3MgZXJyb3JlcywgcmVpbnRlbnRhbW9zIHNpIG5vIGhlbW9zIGFsY2FuemFkbyBlbCBtw6F4aW1vXHJcbiAgICAgIGF0dGVtcHQrKztcclxuICAgICAgaWYgKGF0dGVtcHQgPj0gbWF4UmV0cmllcykge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbmNyZW1lbnRhbmRvIHZvdG8gZGVzcHXDqXMgZGUgbcO6bHRpcGxlcyBpbnRlbnRvczonLCBlcnJvcik7XHJcbiAgICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlaW50ZW50YW5kbyBpbmNyZW1lbnRvIGRlIHZvdG8gZGViaWRvIGEgZXJyb3IgKGludGVudG8gJHthdHRlbXB0ICsgMX0vJHttYXhSZXRyaWVzfSk6YCwgZXJyb3IubmFtZSk7XHJcbiAgICAgIC8vIFBlcXVlw7FhIHBhdXNhIGFudGVzIGRlbCByZWludGVudG8gcGFyYSBldml0YXIgY29uZGljaW9uZXMgZGUgY2FycmVyYVxyXG4gICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwICogYXR0ZW1wdCkpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBObyBzZSBwdWRvIHByb2Nlc2FyIGVsIHZvdG8gZGVzcHXDqXMgZGUgbcO6bHRpcGxlcyBpbnRlbnRvcy4nKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgdG90YWwgZGUgbWllbWJyb3MgYWN0aXZvcyBlbiBsYSBzYWxhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRUb3RhbEFjdGl2ZU1lbWJlcnMocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XHJcbiAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAncm9vbUlkID0gOnJvb21JZCcsXHJcbiAgICBGaWx0ZXJFeHByZXNzaW9uOiAnaXNBY3RpdmUgPSA6YWN0aXZlJyxcclxuICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgJzpyb29tSWQnOiByb29tSWQsXHJcbiAgICAgICc6YWN0aXZlJzogdHJ1ZSxcclxuICAgIH0sXHJcbiAgICBTZWxlY3Q6ICdDT1VOVCcsXHJcbiAgfSkpO1xyXG5cclxuICByZXR1cm4gcmVzcG9uc2UuQ291bnQgfHwgMDtcclxufVxyXG5cclxuLyoqXHJcbiAqIEFjdHVhbGl6YXIgc2FsYSBjb24gcmVzdWx0YWRvIGRlbCBtYXRjaFxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gdXBkYXRlUm9vbVdpdGhNYXRjaChyb29tSWQ6IHN0cmluZywgbW92aWVJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgY29uc3QgbWF4UmV0cmllcyA9IDM7XHJcbiAgbGV0IGF0dGVtcHQgPSAwO1xyXG5cclxuICB3aGlsZSAoYXR0ZW1wdCA8IG1heFJldHJpZXMpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIERFQlVHOiB1cGRhdGVSb29tV2l0aE1hdGNoIHVzYW5kbyBjbGF2ZTonLCB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSk7XHJcbiAgICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgICBLZXk6IHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9LFxyXG4gICAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgI3N0YXR1cyA9IDpzdGF0dXMsIHJlc3VsdE1vdmllSWQgPSA6bW92aWVJZCwgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7XHJcbiAgICAgICAgICAnI3N0YXR1cyc6ICdzdGF0dXMnLCAvLyAnc3RhdHVzJyBlcyBwYWxhYnJhIHJlc2VydmFkYSBlbiBEeW5hbW9EQlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgJzpzdGF0dXMnOiAnTUFUQ0hFRCcsXHJcbiAgICAgICAgICAnOm1vdmllSWQnOiBtb3ZpZUlkLFxyXG4gICAgICAgICAgJzp1cGRhdGVkQXQnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYOKchSBTYWxhICR7cm9vbUlkfSBhY3R1YWxpemFkYSBjb24gbWF0Y2g6IHBlbMOtY3VsYSAke21vdmllSWR9YCk7XHJcbiAgICAgIHJldHVybjsgLy8gU3VjY2Vzc1xyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAvLyBNYW5lamFyIGVycm9yZXMgZGUgY2xhdmVcclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdWYWxpZGF0aW9uRXhjZXB0aW9uJyAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdrZXkgZWxlbWVudCBkb2VzIG5vdCBtYXRjaCcpKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRlIGVzdHJ1Y3R1cmEgZGUgY2xhdmUgZW4gUk9PTVNfVEFCTEUgKFVQREFURSk6JywgZXJyb3IubWVzc2FnZSk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hIGFsIGFjdHVhbGl6YXIgbGEgc2FsYS4nKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRXJyb3JlcyBkZSByZWQgbyB0ZW1wb3JhbGVzIC0gcmVpbnRlbnRhclxyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1NlcnZpY2VFeGNlcHRpb24nIHx8IGVycm9yLm5hbWUgPT09ICdUaHJvdHRsaW5nRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnSW50ZXJuYWxTZXJ2ZXJFcnJvcicpIHtcclxuICAgICAgICBhdHRlbXB0Kys7XHJcbiAgICAgICAgaWYgKGF0dGVtcHQgPj0gbWF4UmV0cmllcykge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIE3DoXhpbW8gZGUgcmVpbnRlbnRvcyBhbGNhbnphZG8gcGFyYSB1cGRhdGVSb29tV2l0aE1hdGNoJyk7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIE5vIHNlIHB1ZG8gYWN0dWFsaXphciBsYSBzYWxhIGRlc3B1w6lzIGRlIG3Dumx0aXBsZXMgaW50ZW50b3MuJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBSZWludGVudGFuZG8gdXBkYXRlUm9vbVdpdGhNYXRjaCAoaW50ZW50byAke2F0dGVtcHQgKyAxfS8ke21heFJldHJpZXN9KWApO1xyXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAgKiBNYXRoLnBvdygyLCBhdHRlbXB0KSkpOyAvLyBFeHBvbmVudGlhbCBiYWNrb2ZmXHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBhY3R1YWxpemFuZG8gc2FsYSBjb24gbWF0Y2g6JywgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gTm8gc2UgcHVkbyBhY3R1YWxpemFyIGxhIHNhbGEgZGVzcHXDqXMgZGUgbcO6bHRpcGxlcyBpbnRlbnRvcy4nKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFByZXZlbmlyIHZvdG9zIGR1cGxpY2Fkb3MgZGVsIG1pc21vIHVzdWFyaW8gcGFyYSBsYSBtaXNtYSBwZWzDrWN1bGEgY29uIG1hbmVqbyBkZSBjb25jdXJyZW5jaWFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHByZXZlbnREdXBsaWNhdGVWb3RlKHVzZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZywgbW92aWVJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgY29uc3Qgcm9vbU1vdmllSWQgPSBgJHtyb29tSWR9XyR7bW92aWVJZH1gO1xyXG4gIGNvbnN0IG1heFJldHJpZXMgPSAzO1xyXG4gIGxldCBhdHRlbXB0ID0gMDtcclxuICBjb25zdCB1c2VyTW92aWVLZXkgPSBgJHt1c2VySWR9IyR7bW92aWVJZH1gO1xyXG5cclxuICB3aGlsZSAoYXR0ZW1wdCA8IG1heFJldHJpZXMpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIFZlcmlmaWNhciBzaSBlbCB1c3VhcmlvIHlhIHZvdMOzIHBvciBlc3RhIHBlbMOtY3VsYSBlbiBlc3RhIHNhbGFcclxuICAgICAgLy8gVXNpbmcgVk9URVNfVEFCTEUgKFVzZXIgVm90ZXMpIHdpdGggY29ycmVjdCBzY2hlbWE6IFBLPXJvb21JZCwgU0s9dXNlcklkI21vdmllSWRcclxuXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nVm90ZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlZPVEVTX1RBQkxFISxcclxuICAgICAgICBLZXk6IHtcclxuICAgICAgICAgIHJvb21JZCxcclxuICAgICAgICAgICd1c2VySWQjbW92aWVJZCc6IHVzZXJNb3ZpZUtleVxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGlmIChleGlzdGluZ1ZvdGUuSXRlbSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVXN1YXJpbyAke3VzZXJJZH0geWEgdm90w7MgcG9yIGxhIHBlbMOtY3VsYSAke21vdmllSWR9IGVuIGxhIHNhbGEgJHtyb29tSWR9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFJlZ2lzdHJhciBlbCB2b3RvIHBhcmEgcHJldmVuaXIgZHVwbGljYWRvcyBjb24gY29uZGljacOzbiBhdMOzbWljYVxyXG4gICAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5WT1RFU19UQUJMRSEsXHJcbiAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgcm9vbUlkLFxyXG4gICAgICAgICAgJ3VzZXJJZCNtb3ZpZUlkJzogdXNlck1vdmllS2V5LFxyXG4gICAgICAgICAgdXNlcklkLFxyXG4gICAgICAgICAgbW92aWVJZCxcclxuICAgICAgICAgIHZvdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIHZvdGVUeXBlOiAnTElLRScgLy8gVHJpbml0eSBzb2xvIHRpZW5lIHZvdG9zIHBvc2l0aXZvc1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgQ29uZGl0aW9uRXhwcmVzc2lvbjogJ2F0dHJpYnV0ZV9ub3RfZXhpc3RzKHJvb21JZCkgQU5EIGF0dHJpYnV0ZV9ub3RfZXhpc3RzKCNzayknLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczoge1xyXG4gICAgICAgICAgJyNzayc6ICd1c2VySWQjbW92aWVJZCdcclxuICAgICAgICB9XHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgVm90byByZWdpc3RyYWRvOiBVc3VhcmlvICR7dXNlcklkfSwgU2FsYSAke3Jvb21JZH0sIFBlbMOtY3VsYSAke21vdmllSWR9YCk7XHJcbiAgICAgIHJldHVybjsgLy8gw4l4aXRvLCBzYWxpciBkZSBsYSBmdW5jacOzblxyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgLy8gTWFuZWphciBlcnJvcmVzIGRlIGNsYXZlXHJcbiAgICAgIGlmIChlcnJvci5uYW1lID09PSAnVmFsaWRhdGlvbkV4Y2VwdGlvbicgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygna2V5IGVsZW1lbnQgZG9lcyBub3QgbWF0Y2gnKSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBkZSBlc3RydWN0dXJhIGRlIGNsYXZlIGVuIFVTRVJfVk9URVNfVEFCTEU6JywgZXJyb3IubWVzc2FnZSk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBQb3IgZmF2b3IsIGludMOpbnRhbG8gZGUgbnVldm8gbcOhcyB0YXJkZS4nKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gU2kgZmFsbGEgbGEgY29uZGljacOzbiwgc2lnbmlmaWNhIHF1ZSBlbCB1c3VhcmlvIHlhIHZvdMOzIChjb25kaWNpw7NuIGRlIGNhcnJlcmEpXHJcbiAgICAgIGlmIChlcnJvci5uYW1lID09PSAnQ29uZGl0aW9uYWxDaGVja0ZhaWxlZEV4Y2VwdGlvbicpIHtcclxuICAgICAgICAvLyBWZXJpZmljYXIgbnVldmFtZW50ZSBzaSByZWFsbWVudGUgeWEgdm90w7NcclxuICAgICAgICBjb25zdCBkb3VibGVDaGVjayA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuVk9URVNfVEFCTEUhLFxyXG4gICAgICAgICAgS2V5OiB7XHJcbiAgICAgICAgICAgIHJvb21JZCxcclxuICAgICAgICAgICAgJ3VzZXJJZCNtb3ZpZUlkJzogdXNlck1vdmllS2V5XHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgaWYgKGRvdWJsZUNoZWNrLkl0ZW0pIHtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVXN1YXJpbyAke3VzZXJJZH0geWEgdm90w7MgcG9yIGxhIHBlbMOtY3VsYSAke21vdmllSWR9IGVuIGxhIHNhbGEgJHtyb29tSWR9YCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTaSBubyBleGlzdGUgZWwgaXRlbSBwZXJvIGZhbGzDsyBsYSBjb25kaWNpw7NuLCByZWludGVudGFtb3NcclxuICAgICAgICBhdHRlbXB0Kys7XHJcbiAgICAgICAgaWYgKGF0dGVtcHQgPj0gbWF4UmV0cmllcykge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIE3DoXhpbW8gZGUgcmVpbnRlbnRvcyBhbGNhbnphZG8gcGFyYSBwcmV2ZW5pciB2b3RvIGR1cGxpY2FkbycpO1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBEZW1hc2lhZG9zIGludGVudG9zIGNvbmN1cnJlbnRlcy4nKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlaW50ZW50YW5kbyByZWdpc3RybyBkZSB2b3RvIChpbnRlbnRvICR7YXR0ZW1wdCArIDF9LyR7bWF4UmV0cmllc30pYCk7XHJcbiAgICAgICAgLy8gUGVxdWXDsWEgcGF1c2EgYW50ZXMgZGVsIHJlaW50ZW50b1xyXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1MCAqIGF0dGVtcHQpKTtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gUGFyYSBvdHJvcyBlcnJvcmVzLCByZWludGVudGFtb3Mgc2kgbm8gaGVtb3MgYWxjYW56YWRvIGVsIG3DoXhpbW9cclxuICAgICAgaWYgKGF0dGVtcHQgPCBtYXhSZXRyaWVzIC0gMSkge1xyXG4gICAgICAgIGF0dGVtcHQrKztcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBSZWludGVudGFuZG8gcHJldmVuY2nDs24gZGUgdm90byBkdXBsaWNhZG8gKGludGVudG8gJHthdHRlbXB0ICsgMX0vJHttYXhSZXRyaWVzfSk6YCwgZXJyb3IubmFtZSk7XHJcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDUwICogYXR0ZW1wdCkpO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gTm8gc2UgcHVkbyByZWdpc3RyYXIgZWwgdm90byBkZXNwdcOpcyBkZSBtw7psdGlwbGVzIGludGVudG9zLicpO1xyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciBsaXN0YSBkZSBwYXJ0aWNpcGFudGVzIGRlIGxhIHNhbGFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldFJvb21QYXJ0aWNpcGFudHMocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ3Jvb21JZCA9IDpyb29tSWQnLFxyXG4gICAgICBGaWx0ZXJFeHByZXNzaW9uOiAnaXNBY3RpdmUgPSA6YWN0aXZlJyxcclxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICc6cm9vbUlkJzogcm9vbUlkLFxyXG4gICAgICAgICc6YWN0aXZlJzogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgUHJvamVjdGlvbkV4cHJlc3Npb246ICd1c2VySWQnLFxyXG4gICAgfSkpO1xyXG5cclxuICAgIHJldHVybiByZXNwb25zZS5JdGVtcz8ubWFwKGl0ZW0gPT4gaXRlbS51c2VySWQpIHx8IFtdO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBvYnRlbmllbmRvIHBhcnRpY2lwYW50ZXM6JywgZXJyb3IpO1xyXG4gICAgcmV0dXJuIFtdO1xyXG4gIH1cclxufVxyXG4vKipcclxuICogR2V0IHZvdGluZyBzdGFydCB0aW1lIGZvciBkdXJhdGlvbiBjYWxjdWxhdGlvblxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0Vm90aW5nU3RhcnRUaW1lKHJvb21JZDogc3RyaW5nLCBtb3ZpZUlkOiBzdHJpbmcpOiBQcm9taXNlPERhdGUgfCB1bmRlZmluZWQ+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NQVRDSEVTX1RBQkxFISxcclxuICAgICAgS2V5OiB7IHJvb21JZCwgbW92aWVJZCB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmIChyZXNwb25zZS5JdGVtPy5jcmVhdGVkQXQpIHtcclxuICAgICAgcmV0dXJuIG5ldyBEYXRlKHJlc3BvbnNlLkl0ZW0uY3JlYXRlZEF0KTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBnZXR0aW5nIHZvdGluZyBzdGFydCB0aW1lOicsIGVycm9yKTtcclxuICAgIHJldHVybiB1bmRlZmluZWQ7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUmVnaXN0cmFyIHBlbMOtY3VsYSBjb21vIG1vc3RyYWRhIGVuIGxhIHNhbGFcclxuICogVXNhIHVuIFNldCBlbiBEeW5hbW9EQiBwYXJhIGV2aXRhciBkdXBsaWNhZG9zIGF1dG9tw6F0aWNhbWVudGVcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHRyYWNrU2hvd25Nb3ZpZShyb29tSWQ6IHN0cmluZywgbW92aWVJZDogc3RyaW5nKSB7XHJcbiAgdHJ5IHtcclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgIEtleTogeyBpZDogcm9vbUlkIH0sXHJcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdBREQgc2hvd25Nb3ZpZUlkcyA6bW92aWVTZXQnLFxyXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgJzptb3ZpZVNldCc6IG5ldyBTZXQoW21vdmllSWRdKSxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcihg4pqg77iPIEVycm9yIGFsIHJlZ2lzdHJhciBwZWzDrWN1bGEgbW9zdHJhZGEgJHttb3ZpZUlkfTpgLCBlcnJvcik7XHJcbiAgICAvLyBObyBmYWxsYW1vcyBlbCB2b3RvIHNpIGVzdG8gZmFsbGEsIGVzIHNlY3VuZGFyaW9cclxuICB9XHJcbn0iXX0=