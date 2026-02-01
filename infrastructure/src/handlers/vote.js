"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
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
 * Procesar voto con algoritmo Stop-on-Match
 * Solo procesa votos LIKE - los DISLIKE se ignoran según el algoritmo
 */
async function processVote(userId, roomId, movieId, voteType) {
    const timer = new metrics.PerformanceTimer('ProcessVote');
    console.log(`🗳️ Procesando voto: Usuario ${userId}, Sala ${roomId}, Película ${movieId}, Tipo: ${voteType}`);
    try {
        // 1. Verificar que la sala existe y está ACTIVE
        const room = await getRoomAndValidate(roomId);
        // 2. Verificar que el usuario es miembro de la sala
        await validateUserMembership(userId, roomId);
        // 3. Registrar que la película ha sido mostrada (INDIFERENTE del tipo de voto)
        // Esto evita que vuelva a aparecer para cualquier usuario de la sala
        await trackShownMovie(roomId, movieId);
        // 4. Solo procesar votos LIKE - ignorar DISLIKE según algoritmo Stop-on-Match
        if (voteType !== 'LIKE') {
            console.log(`⏭️ Ignorando voto ${voteType} según algoritmo Stop-on-Match`);
            return {
                id: roomId,
                status: room.status,
                resultMovieId: room.resultMovieId,
                hostId: room.hostId,
            };
        }
        // 4. Prevenir votos duplicados del mismo usuario para la misma película
        await preventDuplicateVote(userId, roomId, movieId);
        // 5. Incrementar contador atómico en VotesTable
        const currentVotes = await incrementVoteCount(roomId, movieId);
        // 6. Obtener maxMembers de la sala (no miembros activos actuales)
        // IMPORTANTE: Usamos maxMembers para saber cuántos votos se necesitan para consenso
        const totalMembers = room.maxMembers || 2; // Fallback a 2 si no está definido
        console.log(`📊 Votos actuales: ${currentVotes}, Miembros requeridos: ${totalMembers}`);
        // 7. Publicar evento de actualización de voto en tiempo real
        await appsyncPublisher.publishVoteUpdateEvent(roomId, {
            userId,
            movieId,
            voteType: 'LIKE',
            currentVotes,
            totalMembers
        });
        // Log business metric
        metrics.logBusinessMetric('VOTE_CAST', 1, 'count');
        // 8. Verificar si se alcanzó el consenso (Stop-on-Match)
        if (currentVotes >= totalMembers) {
            console.log('🎉 ¡Match encontrado! Actualizando sala y notificando...');
            // Actualizar sala con resultado
            await updateRoomWithMatch(roomId, movieId);
            // Obtener participantes para la notificación
            const participants = await getRoomParticipants(roomId);
            // Obtener título de la película
            const movieTitle = await appsyncPublisher.getMovieTitle(movieId);
            // Get voting start time for duration calculation
            const votingStartTime = await getVotingStartTime(roomId, movieId);
            // Publicar evento de match encontrado en tiempo real con información detallada
            await appsyncPublisher.publishMatchFoundEvent(roomId, {
                movieId,
                movieTitle,
                participants,
                votingStartTime
            });
            // Log business metric for match
            metrics.logBusinessMetric('MATCH_FOUND', 1, 'count');
            timer.end();
            return {
                ...room, // Return full room object
                status: 'MATCHED',
                resultMovieId: movieId,
            };
        }
        // 9. Si no hay match, retornar sala actualizada
        timer.end();
        return {
            ...room, // Return full room object
            // No status change for normal vote
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
            console.log(`🔍 Room Status Check: ID=${room.id}, Status=${room.status}, Type=${typeof room.status}, ResultMovieId=${room.resultMovieId}`);
            // Prevent voting if room already has a match
            if (room.status === 'MATCHED' || room.resultMovieId) {
                console.log(`🚫 Sala ya tiene match: Estado=${room.status}, ResultMovieId=${room.resultMovieId}`);
                throw new Error('Esta sala ya encontró una película perfecta. No se pueden realizar más votos.');
            }
            // Only allow voting in ACTIVE or WAITING states
            if (room.status !== 'ACTIVE' && room.status !== 'WAITING') {
                console.log(`🚫 Sala no disponible para votar: Estado=${room.status}, ResultMovieId=${room.resultMovieId}`);
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
 * Prevenir votos duplicados del mismo usuario para la misma película con manejo de concurrencia
 */
async function preventDuplicateVote(userId, roomId, movieId) {
    const roomMovieId = `${roomId}_${movieId}`;
    const maxRetries = 3;
    let attempt = 0;
    const userMovieKey = `${userId}#${movieId}`;
    while (attempt < maxRetries) {
        try {
            // Verificar si el usuario ya votó por esta película en esta sala
            // Using VOTES_TABLE (User Votes) with correct schema: PK=roomId, SK=userId#movieId
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
            // Registrar el voto para prevenir duplicados con condición atómica
            await docClient.send(new lib_dynamodb_1.PutCommand({
                TableName: process.env.VOTES_TABLE,
                Item: {
                    roomId,
                    'userId#movieId': userMovieKey,
                    userId,
                    movieId,
                    votedAt: new Date().toISOString(),
                    voteType: 'LIKE' // Trinity solo tiene votos positivos
                },
                ConditionExpression: 'attribute_not_exists(roomId) AND attribute_not_exists(#sk)',
                ExpressionAttributeNames: {
                    '#sk': 'userId#movieId'
                }
            }));
            console.log(`✅ Voto registrado: Usuario ${userId}, Sala ${roomId}, Película ${movieId}`);
            return; // Éxito, salir de la función
        }
        catch (error) {
            // Manejar errores de clave
            if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                console.error('❌ Error de estructura de clave en USER_VOTES_TABLE:', error.message);
                throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
            }
            // Si falla la condición, significa que el usuario ya votó (condición de carrera)
            if (error.name === 'ConditionalCheckFailedException') {
                // Verificar nuevamente si realmente ya votó
                const doubleCheck = await docClient.send(new lib_dynamodb_1.GetCommand({
                    TableName: process.env.VOTES_TABLE,
                    Key: {
                        roomId,
                        'userId#movieId': userMovieKey
                    },
                }));
                if (doubleCheck.Item) {
                    throw new Error(`Usuario ${userId} ya votó por la película ${movieId} en la sala ${roomId}`);
                }
                // Si no existe el item pero falló la condición, reintentamos
                attempt++;
                if (attempt >= maxRetries) {
                    console.error('❌ Máximo de reintentos alcanzado para prevenir voto duplicado');
                    throw new Error('Error interno del sistema. Demasiados intentos concurrentes.');
                }
                console.log(`🔄 Reintentando registro de voto (intento ${attempt + 1}/${maxRetries})`);
                // Pequeña pausa antes del reintento
                await new Promise(resolve => setTimeout(resolve, 50 * attempt));
                continue;
            }
            // Para otros errores, reintentamos si no hemos alcanzado el máximo
            if (attempt < maxRetries - 1) {
                attempt++;
                console.log(`🔄 Reintentando prevención de voto duplicado (intento ${attempt + 1}/${maxRetries}):`, error.name);
                await new Promise(resolve => setTimeout(resolve, 50 * attempt));
                continue;
            }
            throw error;
        }
    }
    throw new Error('Error interno del sistema. No se pudo registrar el voto después de múltiples intentos.');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm90ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZvdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUFvSDtBQUVwSCwrREFBK0Q7QUFDL0QsTUFBTSxnQkFBZ0IsR0FBRztJQUN2QixzQkFBc0IsRUFBRSxLQUFLLEVBQUUsTUFBYyxFQUFFLFNBQWMsRUFBRSxFQUFFO1FBQy9ELE9BQU8sQ0FBQyxHQUFHLENBQUMsNENBQTRDLE1BQU0sR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzlFLHdFQUF3RTtJQUMxRSxDQUFDO0lBQ0Qsc0JBQXNCLEVBQUUsS0FBSyxFQUFFLE1BQWMsRUFBRSxRQUFhLEVBQUUsRUFBRTtRQUM5RCxPQUFPLENBQUMsR0FBRyxDQUFDLDRDQUE0QyxNQUFNLEdBQUcsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUM3RSx3RUFBd0U7SUFDMUUsQ0FBQztJQUNELGFBQWEsRUFBRSxLQUFLLEVBQUUsT0FBZSxFQUFFLEVBQUU7UUFDdkMsT0FBTyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUNyRCxPQUFPLFNBQVMsT0FBTyxFQUFFLENBQUM7SUFDNUIsQ0FBQztDQUNGLENBQUM7QUFFRixNQUFNLE9BQU8sR0FBRztJQUNkLGlCQUFpQixFQUFFLENBQUMsSUFBWSxFQUFFLEtBQWEsRUFBRSxJQUFhLEVBQUUsRUFBRTtRQUNoRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixJQUFJLE1BQU0sS0FBSyxJQUFJLElBQUksSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFDRCxRQUFRLEVBQUUsQ0FBQyxTQUFpQixFQUFFLEtBQVUsRUFBRSxFQUFFO1FBQzFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsY0FBYyxTQUFTLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBQ0QsZ0JBQWdCLEVBQUU7UUFFaEIsWUFBb0IsU0FB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QUFnQixFQUFFLDZCQUE2QjtZQUMvQyx5QkFBeUIsRUFBRTtnQkFDekIsV0FBVyxFQUFFLElBQUksR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7YUFDaEM7U0FDRixDQUFDLENBQUMsQ0FBQztJQUNOLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywyQ0FBMkMsT0FBTyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDNUUsbURBQW1EO0lBQ3JELENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwU3luY1Jlc29sdmVyRXZlbnQsIEFwcFN5bmNSZXNvbHZlckhhbmRsZXIgfSBmcm9tICdhd3MtbGFtYmRhJztcclxuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kLCBQdXRDb21tYW5kLCBVcGRhdGVDb21tYW5kLCBRdWVyeUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xyXG5cclxuLy8gU2ltcGxpZmllZCBpbmxpbmUgaW1wbGVtZW50YXRpb25zIHRvIGF2b2lkIGRlcGVuZGVuY3kgaXNzdWVzXHJcbmNvbnN0IGFwcHN5bmNQdWJsaXNoZXIgPSB7XHJcbiAgcHVibGlzaE1hdGNoRm91bmRFdmVudDogYXN5bmMgKHJvb21JZDogc3RyaW5nLCBtYXRjaERhdGE6IGFueSkgPT4ge1xyXG4gICAgY29uc29sZS5sb2coYPCfk6EgUHVibGlzaGluZyBtYXRjaCBmb3VuZCBldmVudCBmb3Igcm9vbSAke3Jvb21JZH06YCwgbWF0Y2hEYXRhKTtcclxuICAgIC8vIEluIGEgcmVhbCBpbXBsZW1lbnRhdGlvbiwgdGhpcyB3b3VsZCBwdWJsaXNoIHRvIEFwcFN5bmMgc3Vic2NyaXB0aW9uc1xyXG4gIH0sXHJcbiAgcHVibGlzaFZvdGVVcGRhdGVFdmVudDogYXN5bmMgKHJvb21JZDogc3RyaW5nLCB2b3RlRGF0YTogYW55KSA9PiB7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBQdWJsaXNoaW5nIHZvdGUgdXBkYXRlIGV2ZW50IGZvciByb29tICR7cm9vbUlkfTpgLCB2b3RlRGF0YSk7XHJcbiAgICAvLyBJbiBhIHJlYWwgaW1wbGVtZW50YXRpb24sIHRoaXMgd291bGQgcHVibGlzaCB0byBBcHBTeW5jIHN1YnNjcmlwdGlvbnNcclxuICB9LFxyXG4gIGdldE1vdmllVGl0bGU6IGFzeW5jIChtb3ZpZUlkOiBzdHJpbmcpID0+IHtcclxuICAgIGNvbnNvbGUubG9nKGDwn46sIEdldHRpbmcgbW92aWUgdGl0bGUgZm9yICR7bW92aWVJZH1gKTtcclxuICAgIHJldHVybiBgTW92aWUgJHttb3ZpZUlkfWA7XHJcbiAgfVxyXG59O1xyXG5cclxuY29uc3QgbWV0cmljcyA9IHtcclxuICBsb2dCdXNpbmVzc01ldHJpYzogKG5hbWU6IHN0cmluZywgdmFsdWU6IG51bWJlciwgdW5pdD86IHN0cmluZykgPT4ge1xyXG4gICAgY29uc29sZS5sb2coYPCfk4ogQnVzaW5lc3MgTWV0cmljOiAke25hbWV9ID0gJHt2YWx1ZX0gJHt1bml0IHx8ICcnfWApO1xyXG4gIH0sXHJcbiAgbG9nRXJyb3I6IChvcGVyYXRpb246IHN0cmluZywgZXJyb3I6IGFueSkgPT4ge1xyXG4gICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIGluICR7b3BlcmF0aW9ufTpgLCBlcnJvcik7XHJcbiAgfSxcclxuICBQZXJmb3JtYW5jZVRpbWVyOiBjbGFzcyB7XHJcbiAgICBwcml2YXRlIHN0YXJ0VGltZTogbnVtYmVyO1xyXG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSBvcGVyYXRpb246IHN0cmluZykge1xyXG4gICAgICB0aGlzLnN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgICB9XHJcbiAgICBlbmQoKSB7XHJcbiAgICAgIGNvbnN0IGR1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHRoaXMuc3RhcnRUaW1lO1xyXG4gICAgICBjb25zb2xlLmxvZyhg4o+x77iPICR7dGhpcy5vcGVyYXRpb259IGNvbXBsZXRlZCBpbiAke2R1cmF0aW9ufW1zYCk7XHJcbiAgICB9XHJcbiAgfVxyXG59O1xyXG5cclxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcclxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCBhcyBhbnkpO1xyXG5cclxuaW50ZXJmYWNlIFJvb20ge1xyXG4gIGlkOiBzdHJpbmc7XHJcbiAgc3RhdHVzOiBzdHJpbmc7XHJcbiAgcmVzdWx0TW92aWVJZD86IHN0cmluZztcclxuICBob3N0SWQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFZvdGUge1xyXG4gIHJvb21JZDogc3RyaW5nO1xyXG4gIG1vdmllSWQ6IHN0cmluZztcclxuICB2b3RlczogbnVtYmVyO1xyXG4gIGNyZWF0ZWRBdDogc3RyaW5nO1xyXG4gIHVwZGF0ZWRBdDogc3RyaW5nO1xyXG59XHJcblxyXG4vKipcclxuICogVm90ZUhhbmRsZXI6IEzDs2dpY2EgU3RvcC1vbi1NYXRjaFxyXG4gKiBJbXBsZW1lbnRhIGVsIGFsZ29yaXRtbyBkZSB2b3RhY2nDs24gcXVlIHRlcm1pbmEgY3VhbmRvIHRvZG9zIGxvcyBtaWVtYnJvcyB2b3RhblxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGhhbmRsZXI6IEFwcFN5bmNSZXNvbHZlckhhbmRsZXI8YW55LCBhbnk+ID0gYXN5bmMgKGV2ZW50OiBBcHBTeW5jUmVzb2x2ZXJFdmVudDxhbnk+KSA9PiB7XHJcbiAgY29uc29sZS5sb2coJ/Cfl7PvuI8gVm90ZSBIYW5kbGVyOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XHJcblxyXG4gIGNvbnN0IGZpZWxkTmFtZSA9IGV2ZW50LmluZm8/LmZpZWxkTmFtZTtcclxuICBjb25zdCBhcmdzID0gZXZlbnQuYXJndW1lbnRzO1xyXG4gIGNvbnN0IHsgc3ViOiB1c2VySWQgfSA9IGV2ZW50LmlkZW50aXR5IGFzIGFueTsgLy8gVXN1YXJpbyBhdXRlbnRpY2Fkb1xyXG5cclxuICB0cnkge1xyXG4gICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcclxuICAgICAgY2FzZSAndm90ZSc6XHJcbiAgICAgICAgLy8gRXh0cmFlciBwYXLDoW1ldHJvcyBkZWwgaW5wdXQgc2Vnw7puIGVsIHNjaGVtYSBHcmFwaFFMXHJcbiAgICAgICAgY29uc3QgeyByb29tSWQsIG1vdmllSWQsIHZvdGVUeXBlIH0gPSBhcmdzLmlucHV0O1xyXG4gICAgICAgIHJldHVybiBhd2FpdCBwcm9jZXNzVm90ZSh1c2VySWQsIHJvb21JZCwgbW92aWVJZCwgdm90ZVR5cGUpO1xyXG5cclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZXJhY2nDs24gbm8gc29wb3J0YWRhOiAke2ZpZWxkTmFtZX1gKTtcclxuICAgIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIGVuICR7ZmllbGROYW1lfTpgLCBlcnJvcik7XHJcblxyXG4gICAgLy8gTWVqb3JhciBtZW5zYWplcyBkZSBlcnJvciBwYXJhIGVsIHVzdWFyaW9cclxuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgIC8vIFNpIGVzIHVuIGVycm9yIGRlIHNpc3RlbWEgaW50ZXJubywgbm8gZXhwb25lciBkZXRhbGxlcyB0w6ljbmljb3NcclxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEnKSkge1xyXG4gICAgICAgIHRocm93IGVycm9yOyAvLyBZYSB0aWVuZSB1biBtZW5zYWplIGFtaWdhYmxlXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFBhcmEgb3Ryb3MgZXJyb3JlcywgcHJvcG9yY2lvbmFyIGNvbnRleHRvIGFkaWNpb25hbFxyXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnU2FsYSBubyBlbmNvbnRyYWRhJykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0xhIHNhbGEgZXNwZWNpZmljYWRhIG5vIGV4aXN0ZSBvIG5vIHRpZW5lcyBhY2Nlc28gYSBlbGxhLicpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnVXN1YXJpbyBubyBlcyBtaWVtYnJvIGFjdGl2bycpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBlcmVzIG1pZW1icm8gZGUgZXN0YSBzYWxhIG8gdHUgbWVtYnJlc8OtYSBubyBlc3TDoSBhY3RpdmEuJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCd5YSB2b3TDsyBwb3IgbGEgcGVsw61jdWxhJykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lhIGhhcyB2b3RhZG8gcG9yIGVzdGEgcGVsw61jdWxhIGVuIGVzdGEgc2FsYS4nKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ25vIGVzdMOhIGRpc3BvbmlibGUgcGFyYSB2b3RhcicpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFc3RhIHNhbGEgbm8gZXN0w6EgZGlzcG9uaWJsZSBwYXJhIHZvdGFyIGVuIGVzdGUgbW9tZW50by4nKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRXJyb3JlcyBkZSByZWQgbyBjb25lY3RpdmlkYWRcclxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ05ldHdvcmsnKSB8fCBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCd0aW1lb3V0JykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Byb2JsZW1hIGRlIGNvbmV4acOzbi4gUG9yIGZhdm9yLCB2ZXJpZmljYSB0dSBjb25leGnDs24gYSBpbnRlcm5ldCBlIGludMOpbnRhbG8gZGUgbnVldm8uJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEVycm9yZXMgZGUgYXV0b3JpemFjacOzblxyXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnVW5hdXRob3JpemVkJykgfHwgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnRm9yYmlkZGVuJykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1R1IHNlc2nDs24gaGEgZXhwaXJhZG8uIFBvciBmYXZvciwgaW5pY2lhIHNlc2nDs24gZGUgbnVldm8uJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEVycm9yZXMgZGUgdmFsaWRhY2nDs24gZGUgZGF0b3NcclxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ1ZhbGlkYXRpb25FeGNlcHRpb24nKSB8fCBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdJbnZhbGlkJykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0xvcyBkYXRvcyBlbnZpYWRvcyBubyBzb24gdsOhbGlkb3MuIFBvciBmYXZvciwgaW50w6ludGFsbyBkZSBudWV2by4nKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRXJyb3IgZ2Vuw6lyaWNvIHBhcmEgY2Fzb3Mgbm8gbWFuZWphZG9zIGVzcGVjw61maWNhbWVudGVcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdPY3VycmnDsyB1biBlcnJvciBpbmVzcGVyYWRvLiBQb3IgZmF2b3IsIGludMOpbnRhbG8gZGUgbnVldm8gbcOhcyB0YXJkZS4nKTtcclxuICAgIH1cclxuXHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogUHJvY2VzYXIgdm90byBjb24gYWxnb3JpdG1vIFN0b3Atb24tTWF0Y2hcclxuICogU29sbyBwcm9jZXNhIHZvdG9zIExJS0UgLSBsb3MgRElTTElLRSBzZSBpZ25vcmFuIHNlZ8O6biBlbCBhbGdvcml0bW9cclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NWb3RlKHVzZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZywgbW92aWVJZDogc3RyaW5nLCB2b3RlVHlwZTogc3RyaW5nKTogUHJvbWlzZTxSb29tPiB7XHJcbiAgY29uc3QgdGltZXIgPSBuZXcgbWV0cmljcy5QZXJmb3JtYW5jZVRpbWVyKCdQcm9jZXNzVm90ZScpO1xyXG4gIGNvbnNvbGUubG9nKGDwn5ez77iPIFByb2Nlc2FuZG8gdm90bzogVXN1YXJpbyAke3VzZXJJZH0sIFNhbGEgJHtyb29tSWR9LCBQZWzDrWN1bGEgJHttb3ZpZUlkfSwgVGlwbzogJHt2b3RlVHlwZX1gKTtcclxuXHJcbiAgdHJ5IHtcclxuICAgIC8vIDEuIFZlcmlmaWNhciBxdWUgbGEgc2FsYSBleGlzdGUgeSBlc3TDoSBBQ1RJVkVcclxuICAgIGNvbnN0IHJvb20gPSBhd2FpdCBnZXRSb29tQW5kVmFsaWRhdGUocm9vbUlkKTtcclxuXHJcbiAgICAvLyAyLiBWZXJpZmljYXIgcXVlIGVsIHVzdWFyaW8gZXMgbWllbWJybyBkZSBsYSBzYWxhXHJcbiAgICBhd2FpdCB2YWxpZGF0ZVVzZXJNZW1iZXJzaGlwKHVzZXJJZCwgcm9vbUlkKTtcclxuXHJcbiAgICAvLyAzLiBSZWdpc3RyYXIgcXVlIGxhIHBlbMOtY3VsYSBoYSBzaWRvIG1vc3RyYWRhIChJTkRJRkVSRU5URSBkZWwgdGlwbyBkZSB2b3RvKVxyXG4gICAgLy8gRXN0byBldml0YSBxdWUgdnVlbHZhIGEgYXBhcmVjZXIgcGFyYSBjdWFscXVpZXIgdXN1YXJpbyBkZSBsYSBzYWxhXHJcbiAgICBhd2FpdCB0cmFja1Nob3duTW92aWUocm9vbUlkLCBtb3ZpZUlkKTtcclxuXHJcbiAgICAvLyA0LiBTb2xvIHByb2Nlc2FyIHZvdG9zIExJS0UgLSBpZ25vcmFyIERJU0xJS0Ugc2Vnw7puIGFsZ29yaXRtbyBTdG9wLW9uLU1hdGNoXHJcbiAgICBpZiAodm90ZVR5cGUgIT09ICdMSUtFJykge1xyXG4gICAgICBjb25zb2xlLmxvZyhg4o+t77iPIElnbm9yYW5kbyB2b3RvICR7dm90ZVR5cGV9IHNlZ8O6biBhbGdvcml0bW8gU3RvcC1vbi1NYXRjaGApO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGlkOiByb29tSWQsXHJcbiAgICAgICAgc3RhdHVzOiByb29tLnN0YXR1cyxcclxuICAgICAgICByZXN1bHRNb3ZpZUlkOiByb29tLnJlc3VsdE1vdmllSWQsXHJcbiAgICAgICAgaG9zdElkOiByb29tLmhvc3RJZCxcclxuICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyA0LiBQcmV2ZW5pciB2b3RvcyBkdXBsaWNhZG9zIGRlbCBtaXNtbyB1c3VhcmlvIHBhcmEgbGEgbWlzbWEgcGVsw61jdWxhXHJcbiAgICBhd2FpdCBwcmV2ZW50RHVwbGljYXRlVm90ZSh1c2VySWQsIHJvb21JZCwgbW92aWVJZCk7XHJcblxyXG4gICAgLy8gNS4gSW5jcmVtZW50YXIgY29udGFkb3IgYXTDs21pY28gZW4gVm90ZXNUYWJsZVxyXG4gICAgY29uc3QgY3VycmVudFZvdGVzID0gYXdhaXQgaW5jcmVtZW50Vm90ZUNvdW50KHJvb21JZCwgbW92aWVJZCk7XHJcblxyXG4gICAgLy8gNi4gT2J0ZW5lciBtYXhNZW1iZXJzIGRlIGxhIHNhbGEgKG5vIG1pZW1icm9zIGFjdGl2b3MgYWN0dWFsZXMpXHJcbiAgICAvLyBJTVBPUlRBTlRFOiBVc2Ftb3MgbWF4TWVtYmVycyBwYXJhIHNhYmVyIGN1w6FudG9zIHZvdG9zIHNlIG5lY2VzaXRhbiBwYXJhIGNvbnNlbnNvXHJcbiAgICBjb25zdCB0b3RhbE1lbWJlcnMgPSByb29tLm1heE1lbWJlcnMgfHwgMjsgLy8gRmFsbGJhY2sgYSAyIHNpIG5vIGVzdMOhIGRlZmluaWRvXHJcblxyXG4gICAgY29uc29sZS5sb2coYPCfk4ogVm90b3MgYWN0dWFsZXM6ICR7Y3VycmVudFZvdGVzfSwgTWllbWJyb3MgcmVxdWVyaWRvczogJHt0b3RhbE1lbWJlcnN9YCk7XHJcblxyXG4gICAgLy8gNy4gUHVibGljYXIgZXZlbnRvIGRlIGFjdHVhbGl6YWNpw7NuIGRlIHZvdG8gZW4gdGllbXBvIHJlYWxcclxuICAgIGF3YWl0IGFwcHN5bmNQdWJsaXNoZXIucHVibGlzaFZvdGVVcGRhdGVFdmVudChyb29tSWQsIHtcclxuICAgICAgdXNlcklkLFxyXG4gICAgICBtb3ZpZUlkLFxyXG4gICAgICB2b3RlVHlwZTogJ0xJS0UnLFxyXG4gICAgICBjdXJyZW50Vm90ZXMsXHJcbiAgICAgIHRvdGFsTWVtYmVyc1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gTG9nIGJ1c2luZXNzIG1ldHJpY1xyXG4gICAgbWV0cmljcy5sb2dCdXNpbmVzc01ldHJpYygnVk9URV9DQVNUJywgMSwgJ2NvdW50Jyk7XHJcblxyXG4gICAgLy8gOC4gVmVyaWZpY2FyIHNpIHNlIGFsY2FuesOzIGVsIGNvbnNlbnNvIChTdG9wLW9uLU1hdGNoKVxyXG4gICAgaWYgKGN1cnJlbnRWb3RlcyA+PSB0b3RhbE1lbWJlcnMpIHtcclxuICAgICAgY29uc29sZS5sb2coJ/CfjokgwqFNYXRjaCBlbmNvbnRyYWRvISBBY3R1YWxpemFuZG8gc2FsYSB5IG5vdGlmaWNhbmRvLi4uJyk7XHJcblxyXG4gICAgICAvLyBBY3R1YWxpemFyIHNhbGEgY29uIHJlc3VsdGFkb1xyXG4gICAgICBhd2FpdCB1cGRhdGVSb29tV2l0aE1hdGNoKHJvb21JZCwgbW92aWVJZCk7XHJcblxyXG4gICAgICAvLyBPYnRlbmVyIHBhcnRpY2lwYW50ZXMgcGFyYSBsYSBub3RpZmljYWNpw7NuXHJcbiAgICAgIGNvbnN0IHBhcnRpY2lwYW50cyA9IGF3YWl0IGdldFJvb21QYXJ0aWNpcGFudHMocm9vbUlkKTtcclxuXHJcbiAgICAgIC8vIE9idGVuZXIgdMOtdHVsbyBkZSBsYSBwZWzDrWN1bGFcclxuICAgICAgY29uc3QgbW92aWVUaXRsZSA9IGF3YWl0IGFwcHN5bmNQdWJsaXNoZXIuZ2V0TW92aWVUaXRsZShtb3ZpZUlkKTtcclxuXHJcbiAgICAgIC8vIEdldCB2b3Rpbmcgc3RhcnQgdGltZSBmb3IgZHVyYXRpb24gY2FsY3VsYXRpb25cclxuICAgICAgY29uc3Qgdm90aW5nU3RhcnRUaW1lID0gYXdhaXQgZ2V0Vm90aW5nU3RhcnRUaW1lKHJvb21JZCwgbW92aWVJZCk7XHJcblxyXG4gICAgICAvLyBQdWJsaWNhciBldmVudG8gZGUgbWF0Y2ggZW5jb250cmFkbyBlbiB0aWVtcG8gcmVhbCBjb24gaW5mb3JtYWNpw7NuIGRldGFsbGFkYVxyXG4gICAgICBhd2FpdCBhcHBzeW5jUHVibGlzaGVyLnB1Ymxpc2hNYXRjaEZvdW5kRXZlbnQocm9vbUlkLCB7XHJcbiAgICAgICAgbW92aWVJZCxcclxuICAgICAgICBtb3ZpZVRpdGxlLFxyXG4gICAgICAgIHBhcnRpY2lwYW50cyxcclxuICAgICAgICB2b3RpbmdTdGFydFRpbWVcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljIGZvciBtYXRjaFxyXG4gICAgICBtZXRyaWNzLmxvZ0J1c2luZXNzTWV0cmljKCdNQVRDSF9GT1VORCcsIDEsICdjb3VudCcpO1xyXG5cclxuICAgICAgdGltZXIuZW5kKCk7XHJcblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIC4uLnJvb20sIC8vIFJldHVybiBmdWxsIHJvb20gb2JqZWN0XHJcbiAgICAgICAgc3RhdHVzOiAnTUFUQ0hFRCcsXHJcbiAgICAgICAgcmVzdWx0TW92aWVJZDogbW92aWVJZCxcclxuICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyA5LiBTaSBubyBoYXkgbWF0Y2gsIHJldG9ybmFyIHNhbGEgYWN0dWFsaXphZGFcclxuICAgIHRpbWVyLmVuZCgpO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIC4uLnJvb20sIC8vIFJldHVybiBmdWxsIHJvb20gb2JqZWN0XHJcbiAgICAgIC8vIE5vIHN0YXR1cyBjaGFuZ2UgZm9yIG5vcm1hbCB2b3RlXHJcbiAgICB9O1xyXG5cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgbWV0cmljcy5sb2dFcnJvcignUHJvY2Vzc1ZvdGUnLCBlcnJvciBhcyBFcnJvcik7XHJcbiAgICB0aW1lci5lbmQoKTtcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgeSB2YWxpZGFyIHNhbGFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldFJvb21BbmRWYWxpZGF0ZShyb29tSWQ6IHN0cmluZyk6IFByb21pc2U8YW55PiB7XHJcbiAgY29uc3QgbWF4UmV0cmllcyA9IDM7XHJcbiAgbGV0IGF0dGVtcHQgPSAwO1xyXG5cclxuICB3aGlsZSAoYXR0ZW1wdCA8IG1heFJldHJpZXMpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIERFQlVHOiBnZXRSb29tQW5kVmFsaWRhdGUgdXNhbmRvIGNsYXZlOicsIHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9KTtcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTYWxhIG5vIGVuY29udHJhZGEnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3Qgcm9vbSA9IHJlc3BvbnNlLkl0ZW07XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg8J+UjSBSb29tIFN0YXR1cyBDaGVjazogSUQ9JHtyb29tLmlkfSwgU3RhdHVzPSR7cm9vbS5zdGF0dXN9LCBUeXBlPSR7dHlwZW9mIHJvb20uc3RhdHVzfSwgUmVzdWx0TW92aWVJZD0ke3Jvb20ucmVzdWx0TW92aWVJZH1gKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFByZXZlbnQgdm90aW5nIGlmIHJvb20gYWxyZWFkeSBoYXMgYSBtYXRjaFxyXG4gICAgICBpZiAocm9vbS5zdGF0dXMgPT09ICdNQVRDSEVEJyB8fCByb29tLnJlc3VsdE1vdmllSWQpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+aqyBTYWxhIHlhIHRpZW5lIG1hdGNoOiBFc3RhZG89JHtyb29tLnN0YXR1c30sIFJlc3VsdE1vdmllSWQ9JHtyb29tLnJlc3VsdE1vdmllSWR9YCk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFc3RhIHNhbGEgeWEgZW5jb250csOzIHVuYSBwZWzDrWN1bGEgcGVyZmVjdGEuIE5vIHNlIHB1ZWRlbiByZWFsaXphciBtw6FzIHZvdG9zLicpO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAvLyBPbmx5IGFsbG93IHZvdGluZyBpbiBBQ1RJVkUgb3IgV0FJVElORyBzdGF0ZXNcclxuICAgICAgaWYgKHJvb20uc3RhdHVzICE9PSAnQUNUSVZFJyAmJiByb29tLnN0YXR1cyAhPT0gJ1dBSVRJTkcnKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfmqsgU2FsYSBubyBkaXNwb25pYmxlIHBhcmEgdm90YXI6IEVzdGFkbz0ke3Jvb20uc3RhdHVzfSwgUmVzdWx0TW92aWVJZD0ke3Jvb20ucmVzdWx0TW92aWVJZH1gKTtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYExhIHNhbGEgbm8gZXN0w6EgZGlzcG9uaWJsZSBwYXJhIHZvdGFyLiBFc3RhZG8gYWN0dWFsOiAke3Jvb20uc3RhdHVzfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gcm9vbTtcclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgLy8gRGlzdGluZ3VpciBlbnRyZSBlcnJvcmVzIGRlIGNsYXZlIHkgZXJyb3JlcyBkZSBuZWdvY2lvXHJcbiAgICAgIGlmIChlcnJvci5uYW1lID09PSAnVmFsaWRhdGlvbkV4Y2VwdGlvbicgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygna2V5IGVsZW1lbnQgZG9lcyBub3QgbWF0Y2gnKSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBkZSBlc3RydWN0dXJhIGRlIGNsYXZlIGVuIFJPT01TX1RBQkxFOicsIGVycm9yLm1lc3NhZ2UpO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEVycm9yZXMgZGUgcmVkIG8gdGVtcG9yYWxlcyAtIHJlaW50ZW50YXJcclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdTZXJ2aWNlRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnVGhyb3R0bGluZ0V4Y2VwdGlvbicgfHwgZXJyb3IubmFtZSA9PT0gJ0ludGVybmFsU2VydmVyRXJyb3InKSB7XHJcbiAgICAgICAgYXR0ZW1wdCsrO1xyXG4gICAgICAgIGlmIChhdHRlbXB0ID49IG1heFJldHJpZXMpIHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBNw6F4aW1vIGRlIHJlaW50ZW50b3MgYWxjYW56YWRvIHBhcmEgZ2V0Um9vbUFuZFZhbGlkYXRlJyk7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIFNlcnZpY2lvIHRlbXBvcmFsbWVudGUgbm8gZGlzcG9uaWJsZS4nKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlaW50ZW50YW5kbyBnZXRSb29tQW5kVmFsaWRhdGUgKGludGVudG8gJHthdHRlbXB0ICsgMX0vJHttYXhSZXRyaWVzfSlgKTtcclxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwICogTWF0aC5wb3coMiwgYXR0ZW1wdCkpKTsgLy8gRXhwb25lbnRpYWwgYmFja29mZlxyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBSZS1sYW56YXIgZXJyb3JlcyBkZSBuZWdvY2lvIHRhbCBjb21vIGVzdMOhblxyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gTm8gc2UgcHVkbyB2YWxpZGFyIGxhIHNhbGEgZGVzcHXDqXMgZGUgbcO6bHRpcGxlcyBpbnRlbnRvcy4nKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXIgcXVlIGVsIHVzdWFyaW8gZXMgbWllbWJybyBkZSBsYSBzYWxhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiB2YWxpZGF0ZVVzZXJNZW1iZXJzaGlwKHVzZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGNvbnN0IG1heFJldHJpZXMgPSAzO1xyXG4gIGxldCBhdHRlbXB0ID0gMDtcclxuXHJcbiAgd2hpbGUgKGF0dGVtcHQgPCBtYXhSZXRyaWVzKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IHJvb21JZCwgdXNlcklkIH0sXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2UuSXRlbSB8fCAhcmVzcG9uc2UuSXRlbS5pc0FjdGl2ZSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVXN1YXJpbyBubyBlcyBtaWVtYnJvIGFjdGl2byBkZSBsYSBzYWxhJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybjsgLy8gU3VjY2Vzc1xyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAvLyBEaXN0aW5ndWlyIGVudHJlIGVycm9yZXMgZGUgY2xhdmUgeSBlcnJvcmVzIGRlIG5lZ29jaW9cclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdWYWxpZGF0aW9uRXhjZXB0aW9uJyAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdrZXkgZWxlbWVudCBkb2VzIG5vdCBtYXRjaCcpKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRlIGVzdHJ1Y3R1cmEgZGUgY2xhdmUgZW4gUk9PTV9NRU1CRVJTX1RBQkxFOicsIGVycm9yLm1lc3NhZ2UpO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEVycm9yZXMgZGUgcmVkIG8gdGVtcG9yYWxlcyAtIHJlaW50ZW50YXJcclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdTZXJ2aWNlRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnVGhyb3R0bGluZ0V4Y2VwdGlvbicgfHwgZXJyb3IubmFtZSA9PT0gJ0ludGVybmFsU2VydmVyRXJyb3InKSB7XHJcbiAgICAgICAgYXR0ZW1wdCsrO1xyXG4gICAgICAgIGlmIChhdHRlbXB0ID49IG1heFJldHJpZXMpIHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBNw6F4aW1vIGRlIHJlaW50ZW50b3MgYWxjYW56YWRvIHBhcmEgdmFsaWRhdGVVc2VyTWVtYmVyc2hpcCcpO1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBTZXJ2aWNpbyB0ZW1wb3JhbG1lbnRlIG5vIGRpc3BvbmlibGUuJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBSZWludGVudGFuZG8gdmFsaWRhdGVVc2VyTWVtYmVyc2hpcCAoaW50ZW50byAke2F0dGVtcHQgKyAxfS8ke21heFJldHJpZXN9KWApO1xyXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAgKiBNYXRoLnBvdygyLCBhdHRlbXB0KSkpOyAvLyBFeHBvbmVudGlhbCBiYWNrb2ZmXHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFJlLWxhbnphciBlcnJvcmVzIGRlIG5lZ29jaW8gdGFsIGNvbW8gZXN0w6FuXHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBObyBzZSBwdWRvIHZhbGlkYXIgbGEgbWVtYnJlc8OtYSBkZXNwdcOpcyBkZSBtw7psdGlwbGVzIGludGVudG9zLicpO1xyXG59XHJcblxyXG4vKipcclxuICogSW5jcmVtZW50YXIgY29udGFkb3IgYXTDs21pY28gZGUgdm90b3MgY29uIG1hbmVqbyBtZWpvcmFkbyBkZSBjb25jdXJyZW5jaWFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGluY3JlbWVudFZvdGVDb3VudChyb29tSWQ6IHN0cmluZywgbW92aWVJZDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcclxuICBjb25zdCBtYXhSZXRyaWVzID0gMztcclxuICBsZXQgYXR0ZW1wdCA9IDA7XHJcblxyXG4gIHdoaWxlIChhdHRlbXB0IDwgbWF4UmV0cmllcykge1xyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gSW50ZW50YXIgYWN0dWFsaXphciB2b3RvIGV4aXN0ZW50ZSBjb24gb3BlcmFjacOzbiBhdMOzbWljYVxyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUFUQ0hFU19UQUJMRSEsIC8vIFVzaW5nIE1hdGNoZXMgdGFibGUgZm9yIGFnZ3JlZ2F0aW9uXHJcbiAgICAgICAgS2V5OiB7IHJvb21JZCwgbW92aWVJZCB9LFxyXG4gICAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdBREQgdm90ZXMgOmluY3JlbWVudCBTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgJzppbmNyZW1lbnQnOiAxLFxyXG4gICAgICAgICAgJzp1cGRhdGVkQXQnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgICBSZXR1cm5WYWx1ZXM6ICdBTExfTkVXJyxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgY29uc3Qgdm90ZUNvdW50ID0gcmVzcG9uc2UuQXR0cmlidXRlcz8udm90ZXMgfHwgMTtcclxuICAgICAgY29uc29sZS5sb2coYOKchSBWb3RvIGluY3JlbWVudGFkbzogU2FsYSAke3Jvb21JZH0sIFBlbMOtY3VsYSAke21vdmllSWR9LCBUb3RhbDogJHt2b3RlQ291bnR9YCk7XHJcbiAgICAgIHJldHVybiB2b3RlQ291bnQ7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAvLyBNYW5lamFyIGVycm9yZXMgZGUgY2xhdmVcclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdWYWxpZGF0aW9uRXhjZXB0aW9uJyAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdrZXkgZWxlbWVudCBkb2VzIG5vdCBtYXRjaCcpKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRlIGVzdHJ1Y3R1cmEgZGUgY2xhdmUgZW4gVk9URVNfVEFCTEU6JywgZXJyb3IubWVzc2FnZSk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBQb3IgZmF2b3IsIGludMOpbnRhbG8gZGUgbnVldm8gbcOhcyB0YXJkZS4nKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gU2kgZWwgaXRlbSBubyBleGlzdGUsIGludGVudGFyIGNyZWFybG9cclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdSZXNvdXJjZU5vdEZvdW5kRXhjZXB0aW9uJyB8fCAhZXJyb3IubmFtZSkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBjb25zdCBuZXdWb3RlOiBWb3RlID0ge1xyXG4gICAgICAgICAgICByb29tSWQsXHJcbiAgICAgICAgICAgIG1vdmllSWQsXHJcbiAgICAgICAgICAgIHZvdGVzOiAxLFxyXG4gICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01BVENIRVNfVEFCTEUhLFxyXG4gICAgICAgICAgICBJdGVtOiBuZXdWb3RlLFxyXG4gICAgICAgICAgICBDb25kaXRpb25FeHByZXNzaW9uOiAnYXR0cmlidXRlX25vdF9leGlzdHMocm9vbUlkKSBBTkQgYXR0cmlidXRlX25vdF9leGlzdHMobW92aWVJZCknLFxyXG4gICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgTnVldm8gdm90byBjcmVhZG86IFNhbGEgJHtyb29tSWR9LCBQZWzDrWN1bGEgJHttb3ZpZUlkfSwgVG90YWw6IDFgKTtcclxuICAgICAgICAgIHJldHVybiAxO1xyXG5cclxuICAgICAgICB9IGNhdGNoIChwdXRFcnJvcjogYW55KSB7XHJcbiAgICAgICAgICBpZiAocHV0RXJyb3IubmFtZSA9PT0gJ1ZhbGlkYXRpb25FeGNlcHRpb24nICYmIHB1dEVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2tleSBlbGVtZW50IGRvZXMgbm90IG1hdGNoJykpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRlIGVzdHJ1Y3R1cmEgZGUgY2xhdmUgZW4gVk9URVNfVEFCTEUgKFBVVCk6JywgcHV0RXJyb3IubWVzc2FnZSk7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJyk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gU2kgZmFsbGEgbGEgY29uZGljacOzbiwgc2lnbmlmaWNhIHF1ZSBvdHJvIHByb2Nlc28gY3Jlw7MgZWwgaXRlbVxyXG4gICAgICAgICAgLy8gUmVpbnRlbnRhciBsYSBvcGVyYWNpw7NuIFVQREFURVxyXG4gICAgICAgICAgaWYgKHB1dEVycm9yLm5hbWUgPT09ICdDb25kaXRpb25hbENoZWNrRmFpbGVkRXhjZXB0aW9uJykge1xyXG4gICAgICAgICAgICBhdHRlbXB0Kys7XHJcbiAgICAgICAgICAgIGlmIChhdHRlbXB0ID49IG1heFJldHJpZXMpIHtcclxuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgTcOheGltbyBkZSByZWludGVudG9zIGFsY2FuemFkbyBwYXJhIGluY3JlbWVudGFyIHZvdG8nKTtcclxuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIERlbWFzaWFkb3MgaW50ZW50b3MgY29uY3VycmVudGVzLicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlaW50ZW50YW5kbyBpbmNyZW1lbnRvIGRlIHZvdG8gKGludGVudG8gJHthdHRlbXB0ICsgMX0vJHttYXhSZXRyaWVzfSlgKTtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgdGhyb3cgcHV0RXJyb3I7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBQYXJhIG90cm9zIGVycm9yZXMsIHJlaW50ZW50YW1vcyBzaSBubyBoZW1vcyBhbGNhbnphZG8gZWwgbcOheGltb1xyXG4gICAgICBhdHRlbXB0Kys7XHJcbiAgICAgIGlmIChhdHRlbXB0ID49IG1heFJldHJpZXMpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW5jcmVtZW50YW5kbyB2b3RvIGRlc3B1w6lzIGRlIG3Dumx0aXBsZXMgaW50ZW50b3M6JywgZXJyb3IpO1xyXG4gICAgICAgIHRocm93IGVycm9yO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg8J+UhCBSZWludGVudGFuZG8gaW5jcmVtZW50byBkZSB2b3RvIGRlYmlkbyBhIGVycm9yIChpbnRlbnRvICR7YXR0ZW1wdCArIDF9LyR7bWF4UmV0cmllc30pOmAsIGVycm9yLm5hbWUpO1xyXG4gICAgICAvLyBQZXF1ZcOxYSBwYXVzYSBhbnRlcyBkZWwgcmVpbnRlbnRvIHBhcmEgZXZpdGFyIGNvbmRpY2lvbmVzIGRlIGNhcnJlcmFcclxuICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCAqIGF0dGVtcHQpKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gTm8gc2UgcHVkbyBwcm9jZXNhciBlbCB2b3RvIGRlc3B1w6lzIGRlIG3Dumx0aXBsZXMgaW50ZW50b3MuJyk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIHRvdGFsIGRlIG1pZW1icm9zIGFjdGl2b3MgZW4gbGEgc2FsYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0VG90YWxBY3RpdmVNZW1iZXJzKHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcclxuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xyXG4gICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ3Jvb21JZCA9IDpyb29tSWQnLFxyXG4gICAgRmlsdGVyRXhwcmVzc2lvbjogJ2lzQWN0aXZlID0gOmFjdGl2ZScsXHJcbiAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICc6cm9vbUlkJzogcm9vbUlkLFxyXG4gICAgICAnOmFjdGl2ZSc6IHRydWUsXHJcbiAgICB9LFxyXG4gICAgU2VsZWN0OiAnQ09VTlQnLFxyXG4gIH0pKTtcclxuXHJcbiAgcmV0dXJuIHJlc3BvbnNlLkNvdW50IHx8IDA7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBY3R1YWxpemFyIHNhbGEgY29uIHJlc3VsdGFkbyBkZWwgbWF0Y2hcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHVwZGF0ZVJvb21XaXRoTWF0Y2gocm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGNvbnN0IG1heFJldHJpZXMgPSAzO1xyXG4gIGxldCBhdHRlbXB0ID0gMDtcclxuXHJcbiAgd2hpbGUgKGF0dGVtcHQgPCBtYXhSZXRyaWVzKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zb2xlLmxvZygn8J+UjSBERUJVRzogdXBkYXRlUm9vbVdpdGhNYXRjaCB1c2FuZG8gY2xhdmU6JywgeyBQSzogcm9vbUlkLCBTSzogJ1JPT00nIH0pO1xyXG4gICAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgVXBkYXRlQ29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSxcclxuICAgICAgICBVcGRhdGVFeHByZXNzaW9uOiAnU0VUICNzdGF0dXMgPSA6c3RhdHVzLCByZXN1bHRNb3ZpZUlkID0gOm1vdmllSWQsIHVwZGF0ZWRBdCA9IDp1cGRhdGVkQXQnLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczoge1xyXG4gICAgICAgICAgJyNzdGF0dXMnOiAnc3RhdHVzJywgLy8gJ3N0YXR1cycgZXMgcGFsYWJyYSByZXNlcnZhZGEgZW4gRHluYW1vREJcclxuICAgICAgICB9LFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAgICc6c3RhdHVzJzogJ01BVENIRUQnLFxyXG4gICAgICAgICAgJzptb3ZpZUlkJzogbW92aWVJZCxcclxuICAgICAgICAgICc6dXBkYXRlZEF0JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgU2FsYSAke3Jvb21JZH0gYWN0dWFsaXphZGEgY29uIG1hdGNoOiBwZWzDrWN1bGEgJHttb3ZpZUlkfWApO1xyXG4gICAgICByZXR1cm47IC8vIFN1Y2Nlc3NcclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgLy8gTWFuZWphciBlcnJvcmVzIGRlIGNsYXZlXHJcbiAgICAgIGlmIChlcnJvci5uYW1lID09PSAnVmFsaWRhdGlvbkV4Y2VwdGlvbicgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygna2V5IGVsZW1lbnQgZG9lcyBub3QgbWF0Y2gnKSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBkZSBlc3RydWN0dXJhIGRlIGNsYXZlIGVuIFJPT01TX1RBQkxFIChVUERBVEUpOicsIGVycm9yLm1lc3NhZ2UpO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYSBhbCBhY3R1YWxpemFyIGxhIHNhbGEuJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEVycm9yZXMgZGUgcmVkIG8gdGVtcG9yYWxlcyAtIHJlaW50ZW50YXJcclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdTZXJ2aWNlRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnVGhyb3R0bGluZ0V4Y2VwdGlvbicgfHwgZXJyb3IubmFtZSA9PT0gJ0ludGVybmFsU2VydmVyRXJyb3InKSB7XHJcbiAgICAgICAgYXR0ZW1wdCsrO1xyXG4gICAgICAgIGlmIChhdHRlbXB0ID49IG1heFJldHJpZXMpIHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBNw6F4aW1vIGRlIHJlaW50ZW50b3MgYWxjYW56YWRvIHBhcmEgdXBkYXRlUm9vbVdpdGhNYXRjaCcpO1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBpbnRlcm5vIGRlbCBzaXN0ZW1hLiBObyBzZSBwdWRvIGFjdHVhbGl6YXIgbGEgc2FsYSBkZXNwdcOpcyBkZSBtw7psdGlwbGVzIGludGVudG9zLicpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coYPCflIQgUmVpbnRlbnRhbmRvIHVwZGF0ZVJvb21XaXRoTWF0Y2ggKGludGVudG8gJHthdHRlbXB0ICsgMX0vJHttYXhSZXRyaWVzfSlgKTtcclxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwICogTWF0aC5wb3coMiwgYXR0ZW1wdCkpKTsgLy8gRXhwb25lbnRpYWwgYmFja29mZlxyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgYWN0dWFsaXphbmRvIHNhbGEgY29uIG1hdGNoOicsIGVycm9yKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIE5vIHNlIHB1ZG8gYWN0dWFsaXphciBsYSBzYWxhIGRlc3B1w6lzIGRlIG3Dumx0aXBsZXMgaW50ZW50b3MuJyk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBQcmV2ZW5pciB2b3RvcyBkdXBsaWNhZG9zIGRlbCBtaXNtbyB1c3VhcmlvIHBhcmEgbGEgbWlzbWEgcGVsw61jdWxhIGNvbiBtYW5lam8gZGUgY29uY3VycmVuY2lhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBwcmV2ZW50RHVwbGljYXRlVm90ZSh1c2VySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGNvbnN0IHJvb21Nb3ZpZUlkID0gYCR7cm9vbUlkfV8ke21vdmllSWR9YDtcclxuICBjb25zdCBtYXhSZXRyaWVzID0gMztcclxuICBsZXQgYXR0ZW1wdCA9IDA7XHJcbiAgY29uc3QgdXNlck1vdmllS2V5ID0gYCR7dXNlcklkfSMke21vdmllSWR9YDtcclxuXHJcbiAgd2hpbGUgKGF0dGVtcHQgPCBtYXhSZXRyaWVzKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBWZXJpZmljYXIgc2kgZWwgdXN1YXJpbyB5YSB2b3TDsyBwb3IgZXN0YSBwZWzDrWN1bGEgZW4gZXN0YSBzYWxhXHJcbiAgICAgIC8vIFVzaW5nIFZPVEVTX1RBQkxFIChVc2VyIFZvdGVzKSB3aXRoIGNvcnJlY3Qgc2NoZW1hOiBQSz1yb29tSWQsIFNLPXVzZXJJZCNtb3ZpZUlkXHJcblxyXG4gICAgICBjb25zdCBleGlzdGluZ1ZvdGUgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5WT1RFU19UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7XHJcbiAgICAgICAgICByb29tSWQsXHJcbiAgICAgICAgICAndXNlcklkI21vdmllSWQnOiB1c2VyTW92aWVLZXlcclxuICAgICAgICB9LFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBpZiAoZXhpc3RpbmdWb3RlLkl0ZW0pIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVzdWFyaW8gJHt1c2VySWR9IHlhIHZvdMOzIHBvciBsYSBwZWzDrWN1bGEgJHttb3ZpZUlkfSBlbiBsYSBzYWxhICR7cm9vbUlkfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBSZWdpc3RyYXIgZWwgdm90byBwYXJhIHByZXZlbmlyIGR1cGxpY2Fkb3MgY29uIGNvbmRpY2nDs24gYXTDs21pY2FcclxuICAgICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuVk9URVNfVEFCTEUhLFxyXG4gICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgIHJvb21JZCxcclxuICAgICAgICAgICd1c2VySWQjbW92aWVJZCc6IHVzZXJNb3ZpZUtleSxcclxuICAgICAgICAgIHVzZXJJZCxcclxuICAgICAgICAgIG1vdmllSWQsXHJcbiAgICAgICAgICB2b3RlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB2b3RlVHlwZTogJ0xJS0UnIC8vIFRyaW5pdHkgc29sbyB0aWVuZSB2b3RvcyBwb3NpdGl2b3NcclxuICAgICAgICB9LFxyXG4gICAgICAgIENvbmRpdGlvbkV4cHJlc3Npb246ICdhdHRyaWJ1dGVfbm90X2V4aXN0cyhyb29tSWQpIEFORCBhdHRyaWJ1dGVfbm90X2V4aXN0cygjc2spJyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHtcclxuICAgICAgICAgICcjc2snOiAndXNlcklkI21vdmllSWQnXHJcbiAgICAgICAgfVxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFZvdG8gcmVnaXN0cmFkbzogVXN1YXJpbyAke3VzZXJJZH0sIFNhbGEgJHtyb29tSWR9LCBQZWzDrWN1bGEgJHttb3ZpZUlkfWApO1xyXG4gICAgICByZXR1cm47IC8vIMOJeGl0bywgc2FsaXIgZGUgbGEgZnVuY2nDs25cclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgIC8vIE1hbmVqYXIgZXJyb3JlcyBkZSBjbGF2ZVxyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1ZhbGlkYXRpb25FeGNlcHRpb24nICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2tleSBlbGVtZW50IGRvZXMgbm90IG1hdGNoJykpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZGUgZXN0cnVjdHVyYSBkZSBjbGF2ZSBlbiBVU0VSX1ZPVEVTX1RBQkxFOicsIGVycm9yLm1lc3NhZ2UpO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFNpIGZhbGxhIGxhIGNvbmRpY2nDs24sIHNpZ25pZmljYSBxdWUgZWwgdXN1YXJpbyB5YSB2b3TDsyAoY29uZGljacOzbiBkZSBjYXJyZXJhKVxyXG4gICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ0NvbmRpdGlvbmFsQ2hlY2tGYWlsZWRFeGNlcHRpb24nKSB7XHJcbiAgICAgICAgLy8gVmVyaWZpY2FyIG51ZXZhbWVudGUgc2kgcmVhbG1lbnRlIHlhIHZvdMOzXHJcbiAgICAgICAgY29uc3QgZG91YmxlQ2hlY2sgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlZPVEVTX1RBQkxFISxcclxuICAgICAgICAgIEtleToge1xyXG4gICAgICAgICAgICByb29tSWQsXHJcbiAgICAgICAgICAgICd1c2VySWQjbW92aWVJZCc6IHVzZXJNb3ZpZUtleVxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGlmIChkb3VibGVDaGVjay5JdGVtKSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVzdWFyaW8gJHt1c2VySWR9IHlhIHZvdMOzIHBvciBsYSBwZWzDrWN1bGEgJHttb3ZpZUlkfSBlbiBsYSBzYWxhICR7cm9vbUlkfWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2kgbm8gZXhpc3RlIGVsIGl0ZW0gcGVybyBmYWxsw7MgbGEgY29uZGljacOzbiwgcmVpbnRlbnRhbW9zXHJcbiAgICAgICAgYXR0ZW1wdCsrO1xyXG4gICAgICAgIGlmIChhdHRlbXB0ID49IG1heFJldHJpZXMpIHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBNw6F4aW1vIGRlIHJlaW50ZW50b3MgYWxjYW56YWRvIHBhcmEgcHJldmVuaXIgdm90byBkdXBsaWNhZG8nKTtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gRGVtYXNpYWRvcyBpbnRlbnRvcyBjb25jdXJyZW50ZXMuJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBSZWludGVudGFuZG8gcmVnaXN0cm8gZGUgdm90byAoaW50ZW50byAke2F0dGVtcHQgKyAxfS8ke21heFJldHJpZXN9KWApO1xyXG4gICAgICAgIC8vIFBlcXVlw7FhIHBhdXNhIGFudGVzIGRlbCByZWludGVudG9cclxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgNTAgKiBhdHRlbXB0KSk7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFBhcmEgb3Ryb3MgZXJyb3JlcywgcmVpbnRlbnRhbW9zIHNpIG5vIGhlbW9zIGFsY2FuemFkbyBlbCBtw6F4aW1vXHJcbiAgICAgIGlmIChhdHRlbXB0IDwgbWF4UmV0cmllcyAtIDEpIHtcclxuICAgICAgICBhdHRlbXB0Kys7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCflIQgUmVpbnRlbnRhbmRvIHByZXZlbmNpw7NuIGRlIHZvdG8gZHVwbGljYWRvIChpbnRlbnRvICR7YXR0ZW1wdCArIDF9LyR7bWF4UmV0cmllc30pOmAsIGVycm9yLm5hbWUpO1xyXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1MCAqIGF0dGVtcHQpKTtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIE5vIHNlIHB1ZG8gcmVnaXN0cmFyIGVsIHZvdG8gZGVzcHXDqXMgZGUgbcO6bHRpcGxlcyBpbnRlbnRvcy4nKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgbGlzdGEgZGUgcGFydGljaXBhbnRlcyBkZSBsYSBzYWxhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRSb29tUGFydGljaXBhbnRzKHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICdyb29tSWQgPSA6cm9vbUlkJyxcclxuICAgICAgRmlsdGVyRXhwcmVzc2lvbjogJ2lzQWN0aXZlID0gOmFjdGl2ZScsXHJcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAnOnJvb21JZCc6IHJvb21JZCxcclxuICAgICAgICAnOmFjdGl2ZSc6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIFByb2plY3Rpb25FeHByZXNzaW9uOiAndXNlcklkJyxcclxuICAgIH0pKTtcclxuXHJcbiAgICByZXR1cm4gcmVzcG9uc2UuSXRlbXM/Lm1hcChpdGVtID0+IGl0ZW0udXNlcklkKSB8fCBbXTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gRXJyb3Igb2J0ZW5pZW5kbyBwYXJ0aWNpcGFudGVzOicsIGVycm9yKTtcclxuICAgIHJldHVybiBbXTtcclxuICB9XHJcbn1cclxuLyoqXHJcbiAqIEdldCB2b3Rpbmcgc3RhcnQgdGltZSBmb3IgZHVyYXRpb24gY2FsY3VsYXRpb25cclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldFZvdGluZ1N0YXJ0VGltZShyb29tSWQ6IHN0cmluZywgbW92aWVJZDogc3RyaW5nKTogUHJvbWlzZTxEYXRlIHwgdW5kZWZpbmVkPiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUFUQ0hFU19UQUJMRSEsXHJcbiAgICAgIEtleTogeyByb29tSWQsIG1vdmllSWQgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICBpZiAocmVzcG9uc2UuSXRlbT8uY3JlYXRlZEF0KSB7XHJcbiAgICAgIHJldHVybiBuZXcgRGF0ZShyZXNwb25zZS5JdGVtLmNyZWF0ZWRBdCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gRXJyb3IgZ2V0dGluZyB2b3Rpbmcgc3RhcnQgdGltZTonLCBlcnJvcik7XHJcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFJlZ2lzdHJhciBwZWzDrWN1bGEgY29tbyBtb3N0cmFkYSBlbiBsYSBzYWxhXHJcbiAqIFVzYSB1biBTZXQgZW4gRHluYW1vREIgcGFyYSBldml0YXIgZHVwbGljYWRvcyBhdXRvbcOhdGljYW1lbnRlXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiB0cmFja1Nob3duTW92aWUocm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZykge1xyXG4gIHRyeSB7XHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgVXBkYXRlQ29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgaWQ6IHJvb21JZCB9LFxyXG4gICAgICBVcGRhdGVFeHByZXNzaW9uOiAnQUREIHNob3duTW92aWVJZHMgOm1vdmllU2V0JyxcclxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICc6bW92aWVTZXQnOiBuZXcgU2V0KFttb3ZpZUlkXSksXHJcbiAgICAgIH0sXHJcbiAgICB9KSk7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoYOKaoO+4jyBFcnJvciBhbCByZWdpc3RyYXIgcGVsw61jdWxhIG1vc3RyYWRhICR7bW92aWVJZH06YCwgZXJyb3IpO1xyXG4gICAgLy8gTm8gZmFsbGFtb3MgZWwgdm90byBzaSBlc3RvIGZhbGxhLCBlcyBzZWN1bmRhcmlvXHJcbiAgfVxyXG59Il19