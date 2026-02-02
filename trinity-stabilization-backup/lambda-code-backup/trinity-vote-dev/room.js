"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
// Simplified imports - removing external dependencies for now
// import { logBusinessMetric, logError, PerformanceTimer } from '../utils/metrics';
// import { deepLinkService } from '../services/deepLinkService';
// import { movieCacheService } from '../services/movieCacheService';
// Simple replacements for removed dependencies
const logBusinessMetric = (event, roomId, userId, data) => {
    console.log(`📊 Business Metric: ${event}`, { roomId, userId, data });
};
const logError = (operation, error, context) => {
    console.error(`❌ Error in ${operation}:`, error, context);
};
class PerformanceTimer {
    constructor(operation) {
        this.operation = operation;
        this.startTime = Date.now();
    }
    finish(success, errorType, data) {
        const duration = Date.now() - this.startTime;
        console.log(`⏱️ ${this.operation}: ${duration}ms (${success ? 'SUCCESS' : 'FAILED'})`, { errorType, data });
    }
}
// Simple deep link service replacement
const deepLinkService = {
    async generateInviteLink(roomId, hostId, options) {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        return {
            code,
            url: `https://trinity-app.com/invite/${code}`
        };
    },
    async validateInviteCode(code) {
        // For now, return null - this will be implemented later
        return null;
    }
};
// Simple movie cache service replacement
const movieCacheService = {
    validateGenres(genres) {
        return { valid: genres, invalid: [] };
    },
    async preCacheMovies(roomId, genres) {
        console.log(`🎬 Pre-caching movies for room ${roomId} with genres:`, genres);
        return [];
    }
};
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
/**
 * RoomHandler: Gestiona salas
 * Maneja createRoom, joinRoom y getMyHistory
 */
const handler = async (event) => {
    console.log('🏠 Room Handler:', JSON.stringify(event, null, 2));
    const { fieldName } = event.info;
    const { sub: userId } = event.identity; // Usuario autenticado
    try {
        switch (fieldName) {
            case 'createRoom':
                console.log('🔍 Room Handler - createRoom arguments:', JSON.stringify(event.arguments, null, 2));
                return await createRoom(userId, event.arguments.input);
            case 'createRoomDebug':
                console.log('🔍 Room Handler - createRoomDebug arguments:', JSON.stringify(event.arguments, null, 2));
                return await createRoomDebug(userId, event.arguments.input);
            case 'createRoomSimple':
                console.log('🔍 Room Handler - createRoomSimple arguments:', JSON.stringify(event.arguments, null, 2));
                return await createRoomSimple(userId, event.arguments.name);
            case 'joinRoom':
                return await joinRoom(userId, event.arguments.roomId);
            case 'joinRoomByInvite':
                return await joinRoomByInvite(userId, event.arguments.inviteCode);
            case 'getMyHistory':
                return await getMyHistory(userId);
            case 'getUserRooms':
                return await getMyHistory(userId); // getUserRooms is an alias for getMyHistory
            case 'getRoom':
                return await getRoom(userId, event.arguments.roomId);
            default:
                throw new Error(`Operación no soportada: ${fieldName}`);
        }
    }
    catch (error) {
        console.error(`❌ Error en ${fieldName}:`, error);
        throw error;
    }
};
exports.handler = handler;
/**
 * Crear nueva sala
 */
async function createRoom(hostId, input) {
    const timer = new PerformanceTimer('CreateRoom');
    const roomId = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    console.log('🔍 createRoom - hostId:', hostId);
    console.log('🔍 createRoom - input:', JSON.stringify(input, null, 2));
    try {
        // Generate unique invite link using DeepLinkService
        const inviteLink = await deepLinkService.generateInviteLink(roomId, hostId, {
            expiryHours: 168, // 7 days
            maxUsage: undefined, // No usage limit
        });
        // Validate and normalize genre preferences (DEPRECATED)
        let validatedGenres = [];
        if (input.genrePreferences && input.genrePreferences.length > 0) {
            const genreValidation = movieCacheService.validateGenres(input.genrePreferences);
            validatedGenres = genreValidation.valid;
            if (genreValidation.invalid.length > 0) {
                console.warn(`⚠️ Invalid genres ignored: ${genreValidation.invalid.join(', ')}`);
            }
            console.log(`🎭 Validated genres for room ${roomId}: ${validatedGenres.join(', ')}`);
        }
        // NUEVO: Mapear géneros si se especificó mediaType y genreIds
        let contentIds = [];
        let genreNames = [];
        if (input.mediaType && input.genreIds && input.genreIds.length > 0) {
            console.log(`🎯 Filtros recibidos: ${input.mediaType}, géneros: [${input.genreIds.join(', ')}]`);
            // Mapear IDs de géneros a nombres
            const genreMap = {
                28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
                80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
                14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
                9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia ficción',
                10770: 'Película de TV', 53: 'Suspense', 10752: 'Bélica', 37: 'Western'
            };
            genreNames = input.genreIds.map(id => genreMap[id] || 'Otro');
            console.log(`✅ Géneros mapeados: ${genreNames.join(', ')}`);
            // TODO: Pre-carga de contenido se implementará usando una aproximación diferente
            // El import dinámico causa problemas en Lambda
        }
        // Crear sala en RoomsTable
        const room = {
            id: roomId,
            name: input.name,
            description: input.description,
            status: 'WAITING',
            hostId,
            inviteCode: inviteLink.code,
            inviteUrl: inviteLink.url,
            genrePreferences: validatedGenres.length > 0 ? validatedGenres : undefined,
            mediaType: input.mediaType, // NUEVO
            genreIds: input.genreIds, // NUEVO
            genreNames: genreNames.length > 0 ? genreNames : undefined, // NUEVO
            contentIds: contentIds.length > 0 ? contentIds : undefined, // NUEVO
            shownContentIds: [], // NUEVO: Inicializar vacío
            currentContentIndex: 0, // NUEVO: Empezar en 0
            isActive: true,
            isPrivate: input.isPrivate || false,
            memberCount: 1, // El host cuenta como miembro
            maxMembers: input.maxMembers,
            matchCount: 0,
            createdAt: now,
            updatedAt: now,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOMS_TABLE,
            Item: {
                PK: roomId, // Add PK for DynamoDB primary key
                SK: 'ROOM', // Add SK for DynamoDB sort key
                roomId,
                ...room,
            },
        }));
        // Añadir host como miembro
        const hostMember = {
            roomId,
            userId: hostId,
            role: 'HOST',
            joinedAt: now,
            isActive: true,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Item: hostMember,
        }));
        // Trigger movie pre-caching in background (DEPRECATED - ahora usamos contentIds)
        if (validatedGenres.length > 0 && !input.mediaType) {
            console.log(`🎬 Triggering legacy movie pre-cache for room ${roomId}`);
            movieCacheService.preCacheMovies(roomId, validatedGenres)
                .then((cachedMovies) => {
                console.log(`✅ Legacy movie pre-cache completed for room ${roomId}: ${cachedMovies.length} movies cached`);
            })
                .catch((error) => {
                console.error(`❌ Legacy movie pre-cache failed for room ${roomId}:`, error);
            });
        }
        // Log business metric
        logBusinessMetric('ROOM_CREATED', roomId, hostId, {
            roomStatus: 'WAITING',
            roomName: input.name,
            isPrivate: input.isPrivate || false,
            genrePreferences: validatedGenres,
            genreCount: validatedGenres.length,
            mediaType: input.mediaType,
            genreIds: input.genreIds,
            contentCount: contentIds.length
        });
        console.log(`✅ Sala creada: ${roomId} (${input.name}) por ${hostId} con ${contentIds.length} títulos pre-cargados`);
        timer.finish(true, undefined, { roomId, hostId, roomName: input.name, contentCount: contentIds.length });
        return room;
    }
    catch (error) {
        logError('CreateRoom', error, { hostId, roomId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Unirse a una sala usando código de invitación
 */
async function joinRoomByInvite(userId, inviteCode) {
    const timer = new PerformanceTimer('JoinRoomByInvite');
    try {
        console.log(`🔗 User ${userId} attempting to join room with invite code: ${inviteCode}`);
        // For now, return error since deep link service is simplified
        throw new Error('Invite code functionality temporarily disabled');
    }
    catch (error) {
        logError('JoinRoomByInvite', error, { userId, inviteCode });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Unirse a una sala existente
 */
async function joinRoom(userId, roomId) {
    const timer = new PerformanceTimer('JoinRoom');
    try {
        // Verificar que la sala existe y está disponible
        const maxRetries = 3;
        let attempt = 0;
        let roomResponse;
        while (attempt < maxRetries) {
            try {
                roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
                    TableName: process.env.ROOMS_TABLE,
                    Key: { PK: roomId, SK: 'ROOM' },
                }));
                break; // Success, exit retry loop
            }
            catch (error) {
                if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                    console.error('❌ Error de estructura de clave en ROOMS_TABLE (joinRoom):', error.message);
                    throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
                }
                // Errores de red o temporales - reintentar
                if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                    attempt++;
                    if (attempt >= maxRetries) {
                        console.error('❌ Máximo de reintentos alcanzado para joinRoom getRoomAndValidate');
                        throw new Error('Error interno del sistema. Servicio temporalmente no disponible.');
                    }
                    console.log(`🔄 Reintentando joinRoom getRoomAndValidate (intento ${attempt + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt))); // Exponential backoff
                    continue;
                }
                throw error; // Re-throw other errors
            }
        }
        if (!roomResponse || !roomResponse.Item) {
            throw new Error('Sala no encontrada');
        }
        const room = roomResponse.Item;
        if (room.status !== 'WAITING') {
            throw new Error('La sala no está disponible para nuevos miembros');
        }
        // Verificar si el usuario ya está en la sala
        const existingMember = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Key: { roomId, userId },
        }));
        if (existingMember.Item) {
            // Usuario ya está en la sala, solo actualizar como activo
            await docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: process.env.ROOM_MEMBERS_TABLE,
                Key: { roomId, userId },
                UpdateExpression: 'SET isActive = :active, joinedAt = :joinedAt',
                ExpressionAttributeValues: {
                    ':active': true,
                    ':joinedAt': new Date().toISOString(),
                },
            }));
        }
        else {
            // Añadir nuevo miembro
            const newMember = {
                roomId,
                userId,
                role: 'MEMBER',
                joinedAt: new Date().toISOString(),
                isActive: true,
            };
            await docClient.send(new lib_dynamodb_1.PutCommand({
                TableName: process.env.ROOM_MEMBERS_TABLE,
                Item: newMember,
            }));
        }
        // Actualizar timestamp de la sala
        const maxRetriesUpdate = 3;
        let attemptUpdate = 0;
        while (attemptUpdate < maxRetriesUpdate) {
            try {
                await docClient.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: process.env.ROOMS_TABLE,
                    Key: { PK: roomId, SK: 'ROOM' },
                    UpdateExpression: 'SET updatedAt = :updatedAt',
                    ExpressionAttributeValues: {
                        ':updatedAt': new Date().toISOString(),
                    },
                }));
                break; // Success, exit retry loop
            }
            catch (error) {
                if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                    console.error('❌ Error de estructura de clave en ROOMS_TABLE (joinRoom update):', error.message);
                    throw new Error('Error interno del sistema al actualizar la sala.');
                }
                // Errores de red o temporales - reintentar
                if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                    attemptUpdate++;
                    if (attemptUpdate >= maxRetriesUpdate) {
                        console.error('❌ Máximo de reintentos alcanzado para joinRoom updateRoom');
                        throw new Error('Error interno del sistema. No se pudo actualizar la sala después de múltiples intentos.');
                    }
                    console.log(`🔄 Reintentando joinRoom updateRoom (intento ${attemptUpdate + 1}/${maxRetriesUpdate})`);
                    await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attemptUpdate))); // Exponential backoff
                    continue;
                }
                throw error; // Re-throw other errors
            }
        }
        // Log business metric
        logBusinessMetric('ROOM_JOINED', roomId, userId, {
            roomStatus: room.status,
            wasExistingMember: !!existingMember.Item
        });
        console.log(`✅ Usuario ${userId} se unió a sala ${roomId}`);
        timer.finish(true, undefined, { roomId, userId, wasExisting: !!existingMember.Item });
        return {
            id: roomId,
            name: room.name,
            description: room.description,
            status: room.status,
            resultMovieId: room.resultMovieId,
            hostId: room.hostId,
            inviteCode: room.inviteCode,
            inviteUrl: room.inviteUrl,
            genrePreferences: room.genrePreferences,
            isActive: room.isActive,
            isPrivate: room.isPrivate,
            memberCount: room.memberCount,
            maxMembers: room.maxMembers,
            matchCount: room.matchCount || 0, // Add matchCount field
            createdAt: room.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    }
    catch (error) {
        logError('JoinRoom', error, { userId, roomId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Obtener historial de salas del usuario
 */
async function getMyHistory(userId) {
    // Consultar GSI UserHistoryIndex para obtener salas del usuario
    const response = await docClient.send(new lib_dynamodb_1.QueryCommand({
        TableName: process.env.ROOM_MEMBERS_TABLE,
        IndexName: 'UserHistoryIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
            ':userId': userId,
        },
        ScanIndexForward: false, // Ordenar por joinedAt descendente (más recientes primero)
        Limit: 50, // Limitar a últimas 50 salas
    }));
    if (!response.Items || response.Items.length === 0) {
        return [];
    }
    // Obtener detalles de cada sala
    const rooms = [];
    for (const member of response.Items) {
        try {
            const maxRetriesHistory = 3;
            let attemptHistory = 0;
            let roomResponse;
            while (attemptHistory < maxRetriesHistory) {
                try {
                    roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
                        TableName: process.env.ROOMS_TABLE,
                        Key: { PK: member.roomId, SK: 'ROOM' },
                    }));
                    break; // Success, exit retry loop
                }
                catch (error) {
                    if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                        console.error('❌ Error de estructura de clave en ROOMS_TABLE (getMyHistory):', error.message);
                        // Skip this room and continue with others
                        break;
                    }
                    // Errores de red o temporales - reintentar
                    if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                        attemptHistory++;
                        if (attemptHistory >= maxRetriesHistory) {
                            console.warn(`⚠️ Error obteniendo sala ${member.roomId} después de múltiples intentos:`, error);
                            break; // Skip this room and continue with others
                        }
                        console.log(`🔄 Reintentando getMyHistory getRoomDetails (intento ${attemptHistory + 1}/${maxRetriesHistory})`);
                        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attemptHistory))); // Exponential backoff
                        continue;
                    }
                    throw error; // Re-throw other errors
                }
            }
            if (roomResponse && roomResponse.Item) {
                const room = roomResponse.Item;
                rooms.push({
                    id: room.roomId,
                    name: room.name || 'Sala sin nombre',
                    description: room.description,
                    status: room.status,
                    resultMovieId: room.resultMovieId,
                    hostId: room.hostId,
                    inviteCode: room.inviteCode,
                    inviteUrl: room.inviteUrl,
                    genrePreferences: room.genrePreferences,
                    isActive: room.isActive !== false, // Default to true if not set
                    isPrivate: room.isPrivate || false,
                    memberCount: room.memberCount || 1,
                    maxMembers: room.maxMembers,
                    matchCount: room.matchCount || 0, // Add matchCount field
                    createdAt: room.createdAt || new Date().toISOString(),
                    updatedAt: room.updatedAt || new Date().toISOString(),
                });
            }
        }
        catch (error) {
            console.warn(`⚠️ Error obteniendo sala ${member.roomId}:`, error);
            // Continuar con las demás salas
        }
    }
    console.log(`📋 Historial obtenido para ${userId}: ${rooms.length} salas`);
    return rooms;
}
/**
 * Crear nueva sala (versión debug con solo name)
 */
async function createRoomDebug(hostId, input) {
    const timer = new PerformanceTimer('CreateRoomDebug');
    const roomId = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    console.log('🔍 createRoomDebug - hostId:', hostId);
    console.log('🔍 createRoomDebug - input:', JSON.stringify(input, null, 2));
    try {
        // Generate unique invite link using DeepLinkService
        const inviteLink = await deepLinkService.generateInviteLink(roomId, hostId, {
            expiryHours: 168, // 7 days
            maxUsage: undefined, // No usage limit
        });
        // Crear sala en RoomsTable con valores por defecto
        const room = {
            id: roomId,
            name: input.name,
            description: 'Sala de debug',
            status: 'WAITING',
            hostId,
            inviteCode: inviteLink.code,
            inviteUrl: inviteLink.url,
            isActive: true,
            isPrivate: false,
            memberCount: 1, // El host cuenta como miembro
            maxMembers: 10, // Valor por defecto
            matchCount: 0, // Initialize matchCount field
            createdAt: now,
            updatedAt: now,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOMS_TABLE,
            Item: {
                PK: roomId, // Add PK for DynamoDB primary key
                SK: 'ROOM', // Add SK for DynamoDB sort key
                roomId,
                ...room,
            },
        }));
        // Añadir host como miembro
        const hostMember = {
            roomId,
            userId: hostId,
            role: 'HOST',
            joinedAt: now,
            isActive: true,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Item: hostMember,
        }));
        // Log business metric
        logBusinessMetric('ROOM_CREATED', roomId, hostId, {
            roomStatus: 'WAITING',
            roomName: input.name,
            isPrivate: false,
            debug: true
        });
        console.log(`✅ Sala debug creada: ${roomId} (${input.name}) por ${hostId}`);
        timer.finish(true, undefined, { roomId, hostId, roomName: input.name });
        return room;
    }
    catch (error) {
        logError('CreateRoomDebug', error, { hostId, roomId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Crear nueva sala (versión simple sin input type)
 */
async function createRoomSimple(hostId, name) {
    const timer = new PerformanceTimer('CreateRoomSimple');
    const roomId = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    console.log('🔍 createRoomSimple - hostId:', hostId);
    console.log('🔍 createRoomSimple - name:', name);
    console.log('🔍 createRoomSimple - roomId generated:', roomId);
    try {
        console.log('🔍 createRoomSimple - Step 1: Calling deepLinkService.generateInviteLink...');
        // Generate unique invite link using DeepLinkService
        const inviteLink = await deepLinkService.generateInviteLink(roomId, hostId, {
            expiryHours: 168, // 7 days
            maxUsage: undefined, // No usage limit
        });
        console.log('✅ createRoomSimple - Step 1 SUCCESS: Invite link generated:', inviteLink.code);
        console.log('🔍 createRoomSimple - Step 2: Creating room object...');
        // Crear sala en RoomsTable con valores por defecto
        const room = {
            id: roomId,
            name: name,
            description: 'Sala simple',
            status: 'WAITING',
            hostId,
            inviteCode: inviteLink.code,
            inviteUrl: inviteLink.url,
            isActive: true,
            isPrivate: false,
            memberCount: 1, // El host cuenta como miembro
            maxMembers: 10, // Valor por defecto
            matchCount: 0, // Initialize matchCount field
            createdAt: now,
            updatedAt: now,
        };
        console.log('✅ createRoomSimple - Step 2 SUCCESS: Room object created');
        console.log('🔍 createRoomSimple - Step 3: Saving room to DynamoDB...');
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOMS_TABLE,
            Item: {
                PK: roomId, // Add PK for DynamoDB primary key
                SK: 'ROOM', // Add SK for DynamoDB sort key
                roomId,
                ...room,
            },
        }));
        console.log('✅ createRoomSimple - Step 3 SUCCESS: Room saved to DynamoDB');
        console.log('🔍 createRoomSimple - Step 4: Adding host as member...');
        // Añadir host como miembro
        const hostMember = {
            roomId,
            userId: hostId,
            role: 'HOST',
            joinedAt: now,
            isActive: true,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Item: hostMember,
        }));
        console.log('✅ createRoomSimple - Step 4 SUCCESS: Host added as member');
        console.log('🔍 createRoomSimple - Step 5: Logging business metric...');
        // Log business metric
        logBusinessMetric('ROOM_CREATED', roomId, hostId, {
            roomStatus: 'WAITING',
            roomName: name,
            isPrivate: false,
            simple: true
        });
        console.log('✅ createRoomSimple - Step 5 SUCCESS: Business metric logged');
        console.log(`✅ Sala simple creada: ${roomId} (${name}) por ${hostId}`);
        console.log('🔍 createRoomSimple - Returning room object:', JSON.stringify(room, null, 2));
        timer.finish(true, undefined, { roomId, hostId, roomName: name });
        return room;
    }
    catch (error) {
        console.error('💥💥💥 createRoomSimple - EXCEPTION CAUGHT:', error);
        console.error('💥 Error name:', error.name);
        console.error('💥 Error message:', error.message);
        console.error('💥 Error stack:', error.stack);
        logError('CreateRoomSimple', error, { hostId, roomId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Obtener detalles de una sala específica
 */
async function getRoom(userId, roomId) {
    try {
        // Verificar que el usuario es miembro de la sala
        const memberResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Key: { roomId, userId },
        }));
        if (!memberResponse.Item) {
            throw new Error('No tienes acceso a esta sala');
        }
        // Obtener detalles de la sala
        const maxRetriesGetRoom = 3;
        let attemptGetRoom = 0;
        let roomResponse;
        while (attemptGetRoom < maxRetriesGetRoom) {
            try {
                roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
                    TableName: process.env.ROOMS_TABLE,
                    Key: { PK: roomId, SK: 'ROOM' },
                }));
                break; // Success, exit retry loop
            }
            catch (error) {
                if (error.name === 'ValidationException' && error.message.includes('key element does not match')) {
                    console.error('❌ Error de estructura de clave en ROOMS_TABLE (getRoom):', error.message);
                    throw new Error('Error interno del sistema. Por favor, inténtalo de nuevo más tarde.');
                }
                // Errores de red o temporales - reintentar
                if (error.name === 'ServiceException' || error.name === 'ThrottlingException' || error.name === 'InternalServerError') {
                    attemptGetRoom++;
                    if (attemptGetRoom >= maxRetriesGetRoom) {
                        console.error('❌ Máximo de reintentos alcanzado para getRoom');
                        throw new Error('Error interno del sistema. Servicio temporalmente no disponible.');
                    }
                    console.log(`🔄 Reintentando getRoom (intento ${attemptGetRoom + 1}/${maxRetriesGetRoom})`);
                    await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attemptGetRoom))); // Exponential backoff
                    continue;
                }
                throw error; // Re-throw other errors
            }
        }
        if (!roomResponse || !roomResponse.Item) {
            throw new Error('Sala no encontrada');
        }
        const room = roomResponse.Item;
        return {
            id: room.roomId,
            name: room.name || 'Sala sin nombre',
            description: room.description,
            status: room.status,
            resultMovieId: room.resultMovieId,
            hostId: room.hostId,
            inviteCode: room.inviteCode,
            inviteUrl: room.inviteUrl,
            genrePreferences: room.genrePreferences,
            isActive: room.isActive !== false,
            isPrivate: room.isPrivate || false,
            memberCount: room.memberCount || 1,
            maxMembers: room.maxMembers,
            matchCount: room.matchCount || 0, // Add matchCount field
            createdAt: room.createdAt || new Date().toISOString(),
            updatedAt: room.updatedAt || new Date().toISOString(),
        };
    }
    catch (error) {
        console.error(`❌ Error obteniendo sala ${roomId}:`, error);
        throw error;
    }
}
