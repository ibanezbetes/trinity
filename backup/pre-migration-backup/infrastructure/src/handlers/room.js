"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
// Import content filtering services
const content_filter_service_1 = require("../services/content-filter-service");
const movieCacheService_1 = require("../services/movieCacheService");
const content_filtering_types_1 = require("../types/content-filtering-types");
// Simple replacements for metrics and utilities
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
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
// Initialize content filtering services
let contentFilterService = null;
function getContentFilterService() {
    if (!contentFilterService) {
        contentFilterService = new content_filter_service_1.ContentFilterService();
    }
    return contentFilterService;
}
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
            case 'getAvailableGenres':
                return await getAvailableGenres(event.arguments.mediaType);
            case 'updateRoomFilters':
                return await updateRoomFilters(userId, event.arguments.roomId, event.arguments.input);
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
        // Validate input
        if (!input.name || input.name.trim().length === 0) {
            throw new Error('Room name is required');
        }
        // Validate genre limits for new filtering system
        if (input.genreIds && input.genreIds.length > 3) {
            throw new content_filtering_types_1.FilterValidationError('Maximum 3 genres allowed');
        }
        // Generate unique invite link using DeepLinkService
        const inviteLink = await deepLinkService.generateInviteLink(roomId, hostId, {
            expiryHours: 168, // 7 days
            maxUsage: undefined, // No usage limit
        });
        // Handle legacy genre preferences (DEPRECATED)
        let validatedGenres = [];
        if (input.genrePreferences && input.genrePreferences.length > 0) {
            const genreValidation = movieCacheService_1.movieCacheService.validateGenres(input.genrePreferences);
            validatedGenres = genreValidation.valid;
            if (genreValidation.invalid.length > 0) {
                console.warn(`⚠️ Invalid genres ignored: ${genreValidation.invalid.join(', ')}`);
            }
            console.log(`🎭 Validated legacy genres for room ${roomId}: ${validatedGenres.join(', ')}`);
        }
        // Initialize room data
        let contentIds = [];
        let genreNames = [];
        let filterCriteria;
        let excludedContentIds = [];
        // NEW: Handle content filtering with mediaType and genreIds
        if (input.mediaType && input.genreIds !== undefined) {
            console.log(`🎯 New filtering system: ${input.mediaType}, genres: [${input.genreIds.join(', ')}]`);
            try {
                // Create filter criteria
                filterCriteria = {
                    mediaType: input.mediaType,
                    genres: input.genreIds,
                    roomId
                };
                // Get content filtering service
                const contentService = getContentFilterService();
                // Load genre names for UI
                if (input.genreIds.length > 0 && filterCriteria) {
                    const availableGenres = await contentService.getAvailableGenres(filterCriteria.mediaType);
                    const genreMap = new Map(availableGenres.map(g => [g.id, g.name]));
                    genreNames = input.genreIds.map(id => genreMap.get(id) || 'Unknown');
                    console.log(`✅ Genre names mapped: ${genreNames.join(', ')}`);
                }
                // Load initial content pool using content filtering service
                const contentPool = await contentService.createFilteredRoom(filterCriteria);
                contentIds = contentPool.map(content => content.tmdbId);
                console.log(`✅ Content filtering: loaded ${contentIds.length} titles for ${input.mediaType} with genres [${input.genreIds.join(', ')}]`);
            }
            catch (error) {
                console.error('❌ Content filtering failed:', error);
                // For backward compatibility, don't fail room creation if content filtering fails
                // Just log the error and continue with empty content
                if (error instanceof content_filtering_types_1.FilterValidationError) {
                    console.warn(`⚠️ Content filtering error: ${error.message}`);
                }
                else {
                    console.warn(`⚠️ Unexpected content filtering error:`, error);
                }
                // Reset to empty state
                contentIds = [];
                genreNames = [];
                filterCriteria = undefined;
            }
        }
        // LEGACY: Handle old genre preferences system for backward compatibility
        else if (validatedGenres.length > 0) {
            console.log(`🎭 Using legacy genre system for room ${roomId}`);
            // Trigger legacy movie pre-caching in background
            movieCacheService_1.movieCacheService.preCacheMovies(roomId, validatedGenres)
                .then((cachedMovies) => {
                console.log(`✅ Legacy movie pre-cache completed for room ${roomId}: ${cachedMovies.length} movies cached`);
            })
                .catch((error) => {
                console.error(`❌ Legacy movie pre-cache failed for room ${roomId}:`, error);
            });
        }
        // Create room object
        const room = {
            id: roomId,
            name: input.name.trim(),
            description: input.description,
            status: 'WAITING',
            hostId,
            inviteCode: inviteLink.code,
            inviteUrl: inviteLink.url,
            // Legacy fields (for backward compatibility)
            genrePreferences: validatedGenres.length > 0 ? validatedGenres : undefined,
            // New filtering fields
            mediaType: input.mediaType,
            genreIds: input.genreIds || [],
            genreNames: genreNames.length > 0 ? genreNames : [],
            contentIds: contentIds.length > 0 ? contentIds : [],
            shownContentIds: [], // Initialize empty
            currentContentIndex: 0, // Start at 0
            filterCriteria,
            excludedContentIds,
            lastContentRefresh: contentIds.length > 0 ? now : undefined,
            // Standard fields
            isActive: true,
            isPrivate: input.isPrivate || false,
            memberCount: 1, // Host counts as member
            maxMembers: input.maxMembers,
            matchCount: 0,
            createdAt: now,
            updatedAt: now,
        };
        // Save room to DynamoDB
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOMS_TABLE,
            Item: {
                PK: roomId,
                SK: 'ROOM',
                roomId,
                ...room,
            },
        }));
        // Add host as member
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
            isPrivate: input.isPrivate || false,
            // Legacy metrics
            genrePreferences: validatedGenres,
            genreCount: validatedGenres.length,
            // New filtering metrics
            mediaType: input.mediaType,
            genreIds: input.genreIds,
            contentCount: contentIds.length,
            hasFiltering: !!filterCriteria,
            filteringSuccess: contentIds.length > 0 || !input.mediaType
        });
        console.log(`✅ Room created: ${roomId} (${input.name}) by ${hostId} with ${contentIds.length} pre-loaded titles`);
        timer.finish(true, undefined, {
            roomId,
            hostId,
            roomName: input.name,
            contentCount: contentIds.length,
            hasFiltering: !!filterCriteria
        });
        return room;
    }
    catch (error) {
        logError('CreateRoom', error, { hostId, roomId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Get available genres for a media type
 * NEW: Content filtering system
 */
async function getAvailableGenres(mediaType) {
    const timer = new PerformanceTimer('GetAvailableGenres');
    try {
        console.log(`🎭 Getting available genres for ${mediaType}`);
        const contentService = getContentFilterService();
        const genres = await contentService.getAvailableGenres(mediaType);
        console.log(`✅ Retrieved ${genres.length} genres for ${mediaType}`);
        timer.finish(true, undefined, { mediaType, genreCount: genres.length });
        return genres;
    }
    catch (error) {
        logError('GetAvailableGenres', error, { mediaType });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Update room filters (with immutability enforcement)
 * NEW: Content filtering system
 */
async function updateRoomFilters(userId, roomId, input) {
    const timer = new PerformanceTimer('UpdateRoomFilters');
    try {
        console.log(`🔄 User ${userId} attempting to update filters for room ${roomId}:`, input);
        // Get room to check current state
        const roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { PK: roomId, SK: 'ROOM' },
        }));
        if (!roomResponse.Item) {
            throw new Error('Room not found');
        }
        const room = roomResponse.Item;
        // Check if user is host
        if (room.hostId !== userId) {
            throw new Error('Only room host can update filters');
        }
        // Enforce filter immutability (Requirements: 6.1, 6.2, 6.3)
        if (room.filterCriteria || room.mediaType || room.genreIds) {
            throw new content_filtering_types_1.FilterImmutabilityError('Room filters cannot be modified after creation. Please create a new room with different filters.');
        }
        // This should never be reached due to immutability, but kept for completeness
        throw new Error('Filter updates are not allowed');
    }
    catch (error) {
        logError('UpdateRoomFilters', error, { userId, roomId, input });
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
            mediaType: room.mediaType,
            genreIds: room.genreIds,
            genreNames: room.genreNames,
            contentIds: room.contentIds,
            shownContentIds: room.shownContentIds,
            currentContentIndex: room.currentContentIndex,
            filterCriteria: room.filterCriteria,
            excludedContentIds: room.excludedContentIds,
            lastContentRefresh: room.lastContentRefresh,
            isActive: room.isActive,
            isPrivate: room.isPrivate,
            memberCount: room.memberCount,
            maxMembers: room.maxMembers,
            matchCount: room.matchCount || 0,
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
 * Unirse a una sala por código de invitación
 */
async function joinRoomByInvite(userId, inviteCode) {
    const timer = new PerformanceTimer('JoinRoomByInvite');
    try {
        console.log(`🔗 User ${userId} attempting to join room with invite code: ${inviteCode}`);
        // Find room by invite code using GSI
        const roomQuery = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.ROOMS_TABLE,
            IndexName: 'InviteCodeIndex',
            KeyConditionExpression: 'inviteCode = :inviteCode',
            ExpressionAttributeValues: {
                ':inviteCode': inviteCode,
            },
        }));
        if (!roomQuery.Items || roomQuery.Items.length === 0) {
            throw new Error('Código de invitación inválido o expirado');
        }
        const roomData = roomQuery.Items[0];
        const roomId = roomData.roomId;
        console.log(`✅ Found room ${roomId} for invite code ${inviteCode}`);
        // Use existing joinRoom function
        return await joinRoom(userId, roomId);
    }
    catch (error) {
        logError('JoinRoomByInvite', error, { userId, inviteCode });
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
                    mediaType: room.mediaType,
                    genreIds: room.genreIds,
                    genreNames: room.genreNames,
                    contentIds: room.contentIds,
                    shownContentIds: room.shownContentIds,
                    currentContentIndex: room.currentContentIndex,
                    filterCriteria: room.filterCriteria,
                    excludedContentIds: room.excludedContentIds,
                    lastContentRefresh: room.lastContentRefresh,
                    isActive: room.isActive !== false, // Default to true if not set
                    isPrivate: room.isPrivate || false,
                    memberCount: room.memberCount || 1,
                    maxMembers: room.maxMembers,
                    matchCount: room.matchCount || 0,
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
            mediaType: room.mediaType,
            genreIds: room.genreIds,
            genreNames: room.genreNames,
            contentIds: room.contentIds,
            shownContentIds: room.shownContentIds,
            currentContentIndex: room.currentContentIndex,
            filterCriteria: room.filterCriteria,
            excludedContentIds: room.excludedContentIds,
            lastContentRefresh: room.lastContentRefresh,
            isActive: room.isActive !== false,
            isPrivate: room.isPrivate || false,
            memberCount: room.memberCount || 1,
            maxMembers: room.maxMembers,
            matchCount: room.matchCount || 0,
            createdAt: room.createdAt || new Date().toISOString(),
            updatedAt: room.updatedAt || new Date().toISOString(),
        };
    }
    catch (error) {
        console.error(`❌ Error obteniendo sala ${roomId}:`, error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm9vbS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJvb20udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUFvSDtBQUNwSCwrQkFBb0M7QUFFcEMsb0NBQW9DO0FBQ3BDLCtFQUEwRTtBQUkxRSxxRUFBa0U7QUFDbEUsOEVBQXNLO0FBRXRLLGdEQUFnRDtBQUNoRCxNQUFNLGlCQUFpQixHQUFHLENBQUMsS0FBYSxFQUFFLE1BQWMsRUFBRSxNQUFjLEVBQUUsSUFBUyxFQUFFLEVBQUU7SUFDckYsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsS0FBSyxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7QUFDeEUsQ0FBQyxDQUFDO0FBRUYsTUFBTSxRQUFRLEdBQUcsQ0FBQyxTQUFpQixFQUFFLEtBQVksRUFBRSxPQUFZLEVBQUUsRUFBRTtJQUNqRSxPQUFPLENBQUMsS0FBSyxDQUFDLGNBQWMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQzVELENBQUMsQ0FBQztBQUVGLE1BQU0sZ0JBQWdCO0lBSXBCLFlBQVksU0FBaUI7UUFDM0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDM0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUVELE1BQU0sQ0FBQyxPQUFnQixFQUFFLFNBQWtCLEVBQUUsSUFBVTtRQUNyRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUM3QyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLFNBQVMsS0FBSyxRQUFRLE9BQU8sT0FBTyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFFBQVEsR0FBRyxFQUFFLEVBQUUsU0FBUyxFQUFFLElB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QkFBa0IsRUFBRSxJQUFJLENBQUMsa0JBQWtCO1lBQzNDLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxLQUFLLEtBQUs7WUFDakMsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLElBQUksS0FBSztZQUNsQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVcsSUFBSSxDQUFDO1lBQ2xDLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMzQixVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDO1lBQ2hDLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1lBQ3JELFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1NBQ3RELENBQUM7SUFFSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkJBQTJCLE1BQU0sR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBTeW5jUmVzb2x2ZXJFdmVudCwgQXBwU3luY1Jlc29sdmVySGFuZGxlciB9IGZyb20gJ2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XHJcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQsIEdldENvbW1hbmQsIFF1ZXJ5Q29tbWFuZCwgVXBkYXRlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xyXG5cclxuLy8gSW1wb3J0IGNvbnRlbnQgZmlsdGVyaW5nIHNlcnZpY2VzXHJcbmltcG9ydCB7IENvbnRlbnRGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvY29udGVudC1maWx0ZXItc2VydmljZSc7XHJcbmltcG9ydCB7IEVuaGFuY2VkVE1EQkNsaWVudCB9IGZyb20gJy4uL3NlcnZpY2VzL2VuaGFuY2VkLXRtZGItY2xpZW50JztcclxuaW1wb3J0IHsgUHJpb3JpdHlBbGdvcml0aG1FbmdpbmUgfSBmcm9tICcuLi9zZXJ2aWNlcy9wcmlvcml0eS1hbGdvcml0aG0nO1xyXG5pbXBvcnQgeyBGaWx0ZXJDYWNoZU1hbmFnZXIgfSBmcm9tICcuLi9zZXJ2aWNlcy9maWx0ZXItY2FjaGUtbWFuYWdlcic7XHJcbmltcG9ydCB7IG1vdmllQ2FjaGVTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvbW92aWVDYWNoZVNlcnZpY2UnO1xyXG5pbXBvcnQgeyBNZWRpYVR5cGUsIEZpbHRlckNyaXRlcmlhLCBDcmVhdGVSb29tSW5wdXQsIFVwZGF0ZVJvb21GaWx0ZXJzSW5wdXQsIEZpbHRlckltbXV0YWJpbGl0eUVycm9yLCBGaWx0ZXJWYWxpZGF0aW9uRXJyb3IgfSBmcm9tICcuLi90eXBlcy9jb250ZW50LWZpbHRlcmluZy10eXBlcyc7XHJcblxyXG4vLyBTaW1wbGUgcmVwbGFjZW1lbnRzIGZvciBtZXRyaWNzIGFuZCB1dGlsaXRpZXNcclxuY29uc3QgbG9nQnVzaW5lc3NNZXRyaWMgPSAoZXZlbnQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcsIHVzZXJJZDogc3RyaW5nLCBkYXRhOiBhbnkpID0+IHtcclxuICBjb25zb2xlLmxvZyhg8J+TiiBCdXNpbmVzcyBNZXRyaWM6ICR7ZXZlbnR9YCwgeyByb29tSWQsIHVzZXJJZCwgZGF0YSB9KTtcclxufTtcclxuXHJcbmNvbnN0IGxvZ0Vycm9yID0gKG9wZXJhdGlvbjogc3RyaW5nLCBlcnJvcjogRXJyb3IsIGNvbnRleHQ6IGFueSkgPT4ge1xyXG4gIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBpbiAke29wZXJhdGlvbn06YCwgZXJyb3IsIGNvbnRleHQpO1xyXG59O1xyXG5cclxuY2xhc3MgUGVyZm9ybWFuY2VUaW1lciB7XHJcbiAgcHJpdmF0ZSBzdGFydFRpbWU6IG51bWJlcjtcclxuICBwcml2YXRlIG9wZXJhdGlvbjogc3RyaW5nO1xyXG5cclxuICBjb25zdHJ1Y3RvcihvcGVyYXRpb246IHN0cmluZykge1xyXG4gICAgdGhpcy5vcGVyYXRpb24gPSBvcGVyYXRpb247XHJcbiAgICB0aGlzLnN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgfVxyXG5cclxuICBmaW5pc2goc3VjY2VzczogYm9vbGVhbiwgZXJyb3JUeXBlPzogc3RyaW5nLCBkYXRhPzogYW55KSB7XHJcbiAgICBjb25zdCBkdXJhdGlvbiA9IERhdGUubm93KCkgLSB0aGlzLnN0YXJ0VGltZTtcclxuICAgIGNvbnNvbGUubG9nKGDij7HvuI8gJHt0aGlzLm9wZXJhdGlvbn06ICR7ZHVyYXRpb259bXMgKCR7c3VjY2VzcyA/ICdTVUNDRVNTJyA6ICdGQUlMRUQnfSlgLCB7IGVycm9yVHlwZSwgZGF0YSB9KTtcclxuICB9XHJcbn1cclxuXHJcbi8vIFNpbXBsZSBkZWVwIGxpbmsgc2VydmljZSByZXBsYWNlbWVudFxyXG5jb25zdCBkZWVwTGlua1NlcnZpY2UgPSB7XHJcbiAgYXN5bmMgZ2VuZXJhdGVJbnZpdGVMaW5rKHJvb21JZDogc3RyaW5nLCBob3N0SWQ6IHN0cmluZywgb3B0aW9uczogYW55KSB7XHJcbiAgICBjb25zdCBjb2RlID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDIsIDgpLnRvVXBwZXJDYXNlKCk7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBjb2RlLFxyXG4gICAgICB1cmw6IGBodHRwczovL3RyaW5pdHktYXBwLmNvbS9pbnZpdGUvJHtjb2RlfWBcclxuICAgIH07XHJcbiAgfSxcclxuICBcclxuICBhc3luYyB2YWxpZGF0ZUludml0ZUNvZGUoY29kZTogc3RyaW5nKSB7XHJcbiAgICAvLyBGb3Igbm93LCByZXR1cm4gbnVsbCAtIHRoaXMgd2lsbCBiZSBpbXBsZW1lbnRlZCBsYXRlclxyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG59O1xyXG5cclxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcclxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XHJcblxyXG4vLyBJbml0aWFsaXplIGNvbnRlbnQgZmlsdGVyaW5nIHNlcnZpY2VzXHJcbmxldCBjb250ZW50RmlsdGVyU2VydmljZTogQ29udGVudEZpbHRlclNlcnZpY2UgfCBudWxsID0gbnVsbDtcclxuXHJcbmZ1bmN0aW9uIGdldENvbnRlbnRGaWx0ZXJTZXJ2aWNlKCk6IENvbnRlbnRGaWx0ZXJTZXJ2aWNlIHtcclxuICBpZiAoIWNvbnRlbnRGaWx0ZXJTZXJ2aWNlKSB7XHJcbiAgICBjb250ZW50RmlsdGVyU2VydmljZSA9IG5ldyBDb250ZW50RmlsdGVyU2VydmljZSgpO1xyXG4gIH1cclxuICByZXR1cm4gY29udGVudEZpbHRlclNlcnZpY2U7XHJcbn1cclxuXHJcbmludGVyZmFjZSBSb29tIHtcclxuICBpZDogc3RyaW5nO1xyXG4gIG5hbWU6IHN0cmluZztcclxuICBkZXNjcmlwdGlvbj86IHN0cmluZztcclxuICBzdGF0dXM6IHN0cmluZztcclxuICByZXN1bHRNb3ZpZUlkPzogc3RyaW5nO1xyXG4gIGhvc3RJZDogc3RyaW5nO1xyXG4gIGludml0ZUNvZGU/OiBzdHJpbmc7XHJcbiAgaW52aXRlVXJsPzogc3RyaW5nO1xyXG4gIGdlbnJlUHJlZmVyZW5jZXM/OiBzdHJpbmdbXTsgLy8gREVQUkVDQVRFRDogTWFudGVuZXIgcG9yIGNvbXBhdGliaWxpZGFkXHJcbiAgbWVkaWFUeXBlPzogJ01PVklFJyB8ICdUVic7IC8vIE5VRVZPOiBUaXBvIGRlIGNvbnRlbmlkb1xyXG4gIGdlbnJlSWRzPzogbnVtYmVyW107IC8vIE5VRVZPOiBJRHMgZGUgZ8OpbmVyb3MgVE1EQlxyXG4gIGdlbnJlTmFtZXM/OiBzdHJpbmdbXTsgLy8gTlVFVk86IE5vbWJyZXMgZGUgZ8OpbmVyb3MgKHBhcmEgVUkpXHJcbiAgY29udGVudElkcz86IHN0cmluZ1tdOyAvLyBOVUVWTzogSURzIGRlIGxvcyAzMCB0w610dWxvcyBwcmUtY2FyZ2Fkb3NcclxuICBzaG93bkNvbnRlbnRJZHM/OiBzdHJpbmdbXTsgLy8gTlVFVk86IElEcyBkZSB0w610dWxvcyB5YSBtb3N0cmFkb3MgKHBhcmEgcmVjYXJnYSlcclxuICBjdXJyZW50Q29udGVudEluZGV4PzogbnVtYmVyOyAvLyBOVUVWTzogw41uZGljZSBhY3R1YWwgZW4gY29udGVudElkc1xyXG4gIGZpbHRlckNyaXRlcmlhPzogRmlsdGVyQ3JpdGVyaWE7IC8vIE5VRVZPOiBDcml0ZXJpb3MgZGUgZmlsdHJhZG8gYXBsaWNhZG9zXHJcbiAgZXhjbHVkZWRDb250ZW50SWRzPzogc3RyaW5nW107IC8vIE5VRVZPOiBJRHMgZGUgY29udGVuaWRvIGV4Y2x1aWRvXHJcbiAgbGFzdENvbnRlbnRSZWZyZXNoPzogc3RyaW5nOyAvLyBOVUVWTzogw5psdGltYSBhY3R1YWxpemFjacOzbiBkZWwgcG9vbCBkZSBjb250ZW5pZG9cclxuICBpc0FjdGl2ZTogYm9vbGVhbjtcclxuICBpc1ByaXZhdGU6IGJvb2xlYW47XHJcbiAgbWVtYmVyQ291bnQ6IG51bWJlcjtcclxuICBtYXhNZW1iZXJzPzogbnVtYmVyO1xyXG4gIG1hdGNoQ291bnQ/OiBudW1iZXI7XHJcbiAgY3JlYXRlZEF0OiBzdHJpbmc7XHJcbiAgdXBkYXRlZEF0Pzogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ3JlYXRlUm9vbUlucHV0RGVidWcge1xyXG4gIG5hbWU6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFJvb21NZW1iZXIge1xyXG4gIHJvb21JZDogc3RyaW5nO1xyXG4gIHVzZXJJZDogc3RyaW5nO1xyXG4gIHJvbGU6ICdIT1NUJyB8ICdNRU1CRVInO1xyXG4gIGpvaW5lZEF0OiBzdHJpbmc7XHJcbiAgaXNBY3RpdmU6IGJvb2xlYW47XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSb29tSGFuZGxlcjogR2VzdGlvbmEgc2FsYXNcclxuICogTWFuZWphIGNyZWF0ZVJvb20sIGpvaW5Sb29tIHkgZ2V0TXlIaXN0b3J5XHJcbiAqL1xyXG5leHBvcnQgY29uc3QgaGFuZGxlcjogQXBwU3luY1Jlc29sdmVySGFuZGxlcjxhbnksIGFueT4gPSBhc3luYyAoZXZlbnQ6IEFwcFN5bmNSZXNvbHZlckV2ZW50PGFueT4pID0+IHtcclxuICBjb25zb2xlLmxvZygn8J+PoCBSb29tIEhhbmRsZXI6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuXHJcbiAgY29uc3QgeyBmaWVsZE5hbWUgfSA9IGV2ZW50LmluZm87XHJcbiAgY29uc3QgeyBzdWI6IHVzZXJJZCB9ID0gZXZlbnQuaWRlbnRpdHkgYXMgYW55OyAvLyBVc3VhcmlvIGF1dGVudGljYWRvXHJcblxyXG4gIHRyeSB7XHJcbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xyXG4gICAgICBjYXNlICdjcmVhdGVSb29tJzpcclxuICAgICAgICBjb25zb2xlLmxvZygn8J+UjSBSb29tIEhhbmRsZXIgLSBjcmVhdGVSb29tIGFyZ3VtZW50czonLCBKU09OLnN0cmluZ2lmeShldmVudC5hcmd1bWVudHMsIG51bGwsIDIpKTtcclxuICAgICAgICByZXR1cm4gYXdhaXQgY3JlYXRlUm9vbSh1c2VySWQsIGV2ZW50LmFyZ3VtZW50cy5pbnB1dCk7XHJcblxyXG4gICAgICBjYXNlICdjcmVhdGVSb29tRGVidWcnOlxyXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5SNIFJvb20gSGFuZGxlciAtIGNyZWF0ZVJvb21EZWJ1ZyBhcmd1bWVudHM6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQuYXJndW1lbnRzLCBudWxsLCAyKSk7XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGNyZWF0ZVJvb21EZWJ1Zyh1c2VySWQsIGV2ZW50LmFyZ3VtZW50cy5pbnB1dCk7XHJcblxyXG4gICAgICBjYXNlICdjcmVhdGVSb29tU2ltcGxlJzpcclxuICAgICAgICBjb25zb2xlLmxvZygn8J+UjSBSb29tIEhhbmRsZXIgLSBjcmVhdGVSb29tU2ltcGxlIGFyZ3VtZW50czonLCBKU09OLnN0cmluZ2lmeShldmVudC5hcmd1bWVudHMsIG51bGwsIDIpKTtcclxuICAgICAgICByZXR1cm4gYXdhaXQgY3JlYXRlUm9vbVNpbXBsZSh1c2VySWQsIGV2ZW50LmFyZ3VtZW50cy5uYW1lKTtcclxuXHJcbiAgICAgIGNhc2UgJ2pvaW5Sb29tJzpcclxuICAgICAgICByZXR1cm4gYXdhaXQgam9pblJvb20odXNlcklkLCBldmVudC5hcmd1bWVudHMucm9vbUlkKTtcclxuXHJcbiAgICAgIGNhc2UgJ2pvaW5Sb29tQnlJbnZpdGUnOlxyXG4gICAgICAgIHJldHVybiBhd2FpdCBqb2luUm9vbUJ5SW52aXRlKHVzZXJJZCwgZXZlbnQuYXJndW1lbnRzLmludml0ZUNvZGUpO1xyXG5cclxuICAgICAgY2FzZSAnZ2V0TXlIaXN0b3J5JzpcclxuICAgICAgICByZXR1cm4gYXdhaXQgZ2V0TXlIaXN0b3J5KHVzZXJJZCk7XHJcblxyXG4gICAgICBjYXNlICdnZXRVc2VyUm9vbXMnOlxyXG4gICAgICAgIHJldHVybiBhd2FpdCBnZXRNeUhpc3RvcnkodXNlcklkKTsgLy8gZ2V0VXNlclJvb21zIGlzIGFuIGFsaWFzIGZvciBnZXRNeUhpc3RvcnlcclxuXHJcbiAgICAgIGNhc2UgJ2dldFJvb20nOlxyXG4gICAgICAgIHJldHVybiBhd2FpdCBnZXRSb29tKHVzZXJJZCwgZXZlbnQuYXJndW1lbnRzLnJvb21JZCk7XHJcblxyXG4gICAgICBjYXNlICdnZXRBdmFpbGFibGVHZW5yZXMnOlxyXG4gICAgICAgIHJldHVybiBhd2FpdCBnZXRBdmFpbGFibGVHZW5yZXMoZXZlbnQuYXJndW1lbnRzLm1lZGlhVHlwZSk7XHJcblxyXG4gICAgICBjYXNlICd1cGRhdGVSb29tRmlsdGVycyc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IHVwZGF0ZVJvb21GaWx0ZXJzKHVzZXJJZCwgZXZlbnQuYXJndW1lbnRzLnJvb21JZCwgZXZlbnQuYXJndW1lbnRzLmlucHV0KTtcclxuXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYWNpw7NuIG5vIHNvcG9ydGFkYTogJHtmaWVsZE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBlbiAke2ZpZWxkTmFtZX06YCwgZXJyb3IpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIENyZWFyIG51ZXZhIHNhbGFcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVJvb20oaG9zdElkOiBzdHJpbmcsIGlucHV0OiBDcmVhdGVSb29tSW5wdXQpOiBQcm9taXNlPFJvb20+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdDcmVhdGVSb29tJyk7XHJcbiAgY29uc3Qgcm9vbUlkID0gdXVpZHY0KCk7XHJcbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG5cclxuICBjb25zb2xlLmxvZygn8J+UjSBjcmVhdGVSb29tIC0gaG9zdElkOicsIGhvc3RJZCk7XHJcbiAgY29uc29sZS5sb2coJ/CflI0gY3JlYXRlUm9vbSAtIGlucHV0OicsIEpTT04uc3RyaW5naWZ5KGlucHV0LCBudWxsLCAyKSk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyBWYWxpZGF0ZSBpbnB1dFxyXG4gICAgaWYgKCFpbnB1dC5uYW1lIHx8IGlucHV0Lm5hbWUudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Jvb20gbmFtZSBpcyByZXF1aXJlZCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFZhbGlkYXRlIGdlbnJlIGxpbWl0cyBmb3IgbmV3IGZpbHRlcmluZyBzeXN0ZW1cclxuICAgIGlmIChpbnB1dC5nZW5yZUlkcyAmJiBpbnB1dC5nZW5yZUlkcy5sZW5ndGggPiAzKSB7XHJcbiAgICAgIHRocm93IG5ldyBGaWx0ZXJWYWxpZGF0aW9uRXJyb3IoXHJcbiAgICAgICAgJ01heGltdW0gMyBnZW5yZXMgYWxsb3dlZCdcclxuICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZW5lcmF0ZSB1bmlxdWUgaW52aXRlIGxpbmsgdXNpbmcgRGVlcExpbmtTZXJ2aWNlXHJcbiAgICBjb25zdCBpbnZpdGVMaW5rID0gYXdhaXQgZGVlcExpbmtTZXJ2aWNlLmdlbmVyYXRlSW52aXRlTGluayhyb29tSWQsIGhvc3RJZCwge1xyXG4gICAgICBleHBpcnlIb3VyczogMTY4LCAvLyA3IGRheXNcclxuICAgICAgbWF4VXNhZ2U6IHVuZGVmaW5lZCwgLy8gTm8gdXNhZ2UgbGltaXRcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEhhbmRsZSBsZWdhY3kgZ2VucmUgcHJlZmVyZW5jZXMgKERFUFJFQ0FURUQpXHJcbiAgICBsZXQgdmFsaWRhdGVkR2VucmVzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgaWYgKGlucHV0LmdlbnJlUHJlZmVyZW5jZXMgJiYgaW5wdXQuZ2VucmVQcmVmZXJlbmNlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNvbnN0IGdlbnJlVmFsaWRhdGlvbiA9IG1vdmllQ2FjaGVTZXJ2aWNlLnZhbGlkYXRlR2VucmVzKGlucHV0LmdlbnJlUHJlZmVyZW5jZXMpO1xyXG4gICAgICB2YWxpZGF0ZWRHZW5yZXMgPSBnZW5yZVZhbGlkYXRpb24udmFsaWQ7XHJcblxyXG4gICAgICBpZiAoZ2VucmVWYWxpZGF0aW9uLmludmFsaWQubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIEludmFsaWQgZ2VucmVzIGlnbm9yZWQ6ICR7Z2VucmVWYWxpZGF0aW9uLmludmFsaWQuam9pbignLCAnKX1gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc29sZS5sb2coYPCfjq0gVmFsaWRhdGVkIGxlZ2FjeSBnZW5yZXMgZm9yIHJvb20gJHtyb29tSWR9OiAke3ZhbGlkYXRlZEdlbnJlcy5qb2luKCcsICcpfWApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEluaXRpYWxpemUgcm9vbSBkYXRhXHJcbiAgICBsZXQgY29udGVudElkczogc3RyaW5nW10gPSBbXTtcclxuICAgIGxldCBnZW5yZU5hbWVzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgbGV0IGZpbHRlckNyaXRlcmlhOiBGaWx0ZXJDcml0ZXJpYSB8IHVuZGVmaW5lZDtcclxuICAgIGxldCBleGNsdWRlZENvbnRlbnRJZHM6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgLy8gTkVXOiBIYW5kbGUgY29udGVudCBmaWx0ZXJpbmcgd2l0aCBtZWRpYVR5cGUgYW5kIGdlbnJlSWRzXHJcbiAgICBpZiAoaW5wdXQubWVkaWFUeXBlICYmIGlucHV0LmdlbnJlSWRzICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgY29uc29sZS5sb2coYPCfjq8gTmV3IGZpbHRlcmluZyBzeXN0ZW06ICR7aW5wdXQubWVkaWFUeXBlfSwgZ2VucmVzOiBbJHtpbnB1dC5nZW5yZUlkcy5qb2luKCcsICcpfV1gKTtcclxuXHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgLy8gQ3JlYXRlIGZpbHRlciBjcml0ZXJpYVxyXG4gICAgICAgIGZpbHRlckNyaXRlcmlhID0ge1xyXG4gICAgICAgICAgbWVkaWFUeXBlOiBpbnB1dC5tZWRpYVR5cGUgYXMgTWVkaWFUeXBlLFxyXG4gICAgICAgICAgZ2VucmVzOiBpbnB1dC5nZW5yZUlkcyxcclxuICAgICAgICAgIHJvb21JZFxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIEdldCBjb250ZW50IGZpbHRlcmluZyBzZXJ2aWNlXHJcbiAgICAgICAgY29uc3QgY29udGVudFNlcnZpY2UgPSBnZXRDb250ZW50RmlsdGVyU2VydmljZSgpO1xyXG5cclxuICAgICAgICAvLyBMb2FkIGdlbnJlIG5hbWVzIGZvciBVSVxyXG4gICAgICAgIGlmIChpbnB1dC5nZW5yZUlkcy5sZW5ndGggPiAwICYmIGZpbHRlckNyaXRlcmlhKSB7XHJcbiAgICAgICAgICBjb25zdCBhdmFpbGFibGVHZW5yZXMgPSBhd2FpdCBjb250ZW50U2VydmljZS5nZXRBdmFpbGFibGVHZW5yZXMoZmlsdGVyQ3JpdGVyaWEubWVkaWFUeXBlKTtcclxuICAgICAgICAgIGNvbnN0IGdlbnJlTWFwID0gbmV3IE1hcChhdmFpbGFibGVHZW5yZXMubWFwKGcgPT4gW2cuaWQsIGcubmFtZV0pKTtcclxuICAgICAgICAgIGdlbnJlTmFtZXMgPSBpbnB1dC5nZW5yZUlkcy5tYXAoaWQgPT4gZ2VucmVNYXAuZ2V0KGlkKSB8fCAnVW5rbm93bicpO1xyXG4gICAgICAgICAgY29uc29sZS5sb2coYOKchSBHZW5yZSBuYW1lcyBtYXBwZWQ6ICR7Z2VucmVOYW1lcy5qb2luKCcsICcpfWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gTG9hZCBpbml0aWFsIGNvbnRlbnQgcG9vbCB1c2luZyBjb250ZW50IGZpbHRlcmluZyBzZXJ2aWNlXHJcbiAgICAgICAgY29uc3QgY29udGVudFBvb2wgPSBhd2FpdCBjb250ZW50U2VydmljZS5jcmVhdGVGaWx0ZXJlZFJvb20oZmlsdGVyQ3JpdGVyaWEpO1xyXG4gICAgICAgIGNvbnRlbnRJZHMgPSBjb250ZW50UG9vbC5tYXAoY29udGVudCA9PiBjb250ZW50LnRtZGJJZCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc29sZS5sb2coYOKchSBDb250ZW50IGZpbHRlcmluZzogbG9hZGVkICR7Y29udGVudElkcy5sZW5ndGh9IHRpdGxlcyBmb3IgJHtpbnB1dC5tZWRpYVR5cGV9IHdpdGggZ2VucmVzIFske2lucHV0LmdlbnJlSWRzLmpvaW4oJywgJyl9XWApO1xyXG5cclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgQ29udGVudCBmaWx0ZXJpbmcgZmFpbGVkOicsIGVycm9yKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSwgZG9uJ3QgZmFpbCByb29tIGNyZWF0aW9uIGlmIGNvbnRlbnQgZmlsdGVyaW5nIGZhaWxzXHJcbiAgICAgICAgLy8gSnVzdCBsb2cgdGhlIGVycm9yIGFuZCBjb250aW51ZSB3aXRoIGVtcHR5IGNvbnRlbnRcclxuICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBGaWx0ZXJWYWxpZGF0aW9uRXJyb3IpIHtcclxuICAgICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIENvbnRlbnQgZmlsdGVyaW5nIGVycm9yOiAke2Vycm9yLm1lc3NhZ2V9YCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIFVuZXhwZWN0ZWQgY29udGVudCBmaWx0ZXJpbmcgZXJyb3I6YCwgZXJyb3IpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBSZXNldCB0byBlbXB0eSBzdGF0ZVxyXG4gICAgICAgIGNvbnRlbnRJZHMgPSBbXTtcclxuICAgICAgICBnZW5yZU5hbWVzID0gW107XHJcbiAgICAgICAgZmlsdGVyQ3JpdGVyaWEgPSB1bmRlZmluZWQ7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBMRUdBQ1k6IEhhbmRsZSBvbGQgZ2VucmUgcHJlZmVyZW5jZXMgc3lzdGVtIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XHJcbiAgICBlbHNlIGlmICh2YWxpZGF0ZWRHZW5yZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+OrSBVc2luZyBsZWdhY3kgZ2VucmUgc3lzdGVtIGZvciByb29tICR7cm9vbUlkfWApO1xyXG4gICAgICBcclxuICAgICAgLy8gVHJpZ2dlciBsZWdhY3kgbW92aWUgcHJlLWNhY2hpbmcgaW4gYmFja2dyb3VuZFxyXG4gICAgICBtb3ZpZUNhY2hlU2VydmljZS5wcmVDYWNoZU1vdmllcyhyb29tSWQsIHZhbGlkYXRlZEdlbnJlcylcclxuICAgICAgICAudGhlbigoY2FjaGVkTW92aWVzKSA9PiB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIExlZ2FjeSBtb3ZpZSBwcmUtY2FjaGUgY29tcGxldGVkIGZvciByb29tICR7cm9vbUlkfTogJHtjYWNoZWRNb3ZpZXMubGVuZ3RofSBtb3ZpZXMgY2FjaGVkYCk7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgTGVnYWN5IG1vdmllIHByZS1jYWNoZSBmYWlsZWQgZm9yIHJvb20gJHtyb29tSWR9OmAsIGVycm9yKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDcmVhdGUgcm9vbSBvYmplY3RcclxuICAgIGNvbnN0IHJvb206IFJvb20gPSB7XHJcbiAgICAgIGlkOiByb29tSWQsXHJcbiAgICAgIG5hbWU6IGlucHV0Lm5hbWUudHJpbSgpLFxyXG4gICAgICBkZXNjcmlwdGlvbjogaW5wdXQuZGVzY3JpcHRpb24sXHJcbiAgICAgIHN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICBob3N0SWQsXHJcbiAgICAgIGludml0ZUNvZGU6IGludml0ZUxpbmsuY29kZSxcclxuICAgICAgaW52aXRlVXJsOiBpbnZpdGVMaW5rLnVybCxcclxuICAgICAgLy8gTGVnYWN5IGZpZWxkcyAoZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkpXHJcbiAgICAgIGdlbnJlUHJlZmVyZW5jZXM6IHZhbGlkYXRlZEdlbnJlcy5sZW5ndGggPiAwID8gdmFsaWRhdGVkR2VucmVzIDogdW5kZWZpbmVkLFxyXG4gICAgICAvLyBOZXcgZmlsdGVyaW5nIGZpZWxkc1xyXG4gICAgICBtZWRpYVR5cGU6IGlucHV0Lm1lZGlhVHlwZSxcclxuICAgICAgZ2VucmVJZHM6IGlucHV0LmdlbnJlSWRzIHx8IFtdLFxyXG4gICAgICBnZW5yZU5hbWVzOiBnZW5yZU5hbWVzLmxlbmd0aCA+IDAgPyBnZW5yZU5hbWVzIDogW10sXHJcbiAgICAgIGNvbnRlbnRJZHM6IGNvbnRlbnRJZHMubGVuZ3RoID4gMCA/IGNvbnRlbnRJZHMgOiBbXSxcclxuICAgICAgc2hvd25Db250ZW50SWRzOiBbXSwgLy8gSW5pdGlhbGl6ZSBlbXB0eVxyXG4gICAgICBjdXJyZW50Q29udGVudEluZGV4OiAwLCAvLyBTdGFydCBhdCAwXHJcbiAgICAgIGZpbHRlckNyaXRlcmlhLFxyXG4gICAgICBleGNsdWRlZENvbnRlbnRJZHMsXHJcbiAgICAgIGxhc3RDb250ZW50UmVmcmVzaDogY29udGVudElkcy5sZW5ndGggPiAwID8gbm93IDogdW5kZWZpbmVkLFxyXG4gICAgICAvLyBTdGFuZGFyZCBmaWVsZHNcclxuICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgIGlzUHJpdmF0ZTogaW5wdXQuaXNQcml2YXRlIHx8IGZhbHNlLFxyXG4gICAgICBtZW1iZXJDb3VudDogMSwgLy8gSG9zdCBjb3VudHMgYXMgbWVtYmVyXHJcbiAgICAgIG1heE1lbWJlcnM6IGlucHV0Lm1heE1lbWJlcnMsXHJcbiAgICAgIG1hdGNoQ291bnQ6IDAsXHJcbiAgICAgIGNyZWF0ZWRBdDogbm93LFxyXG4gICAgICB1cGRhdGVkQXQ6IG5vdyxcclxuICAgIH07XHJcblxyXG4gICAgLy8gU2F2ZSByb29tIHRvIER5bmFtb0RCXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICBJdGVtOiB7XHJcbiAgICAgICAgUEs6IHJvb21JZCxcclxuICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgIHJvb21JZCxcclxuICAgICAgICAuLi5yb29tLFxyXG4gICAgICB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIC8vIEFkZCBob3N0IGFzIG1lbWJlclxyXG4gICAgY29uc3QgaG9zdE1lbWJlcjogUm9vbU1lbWJlciA9IHtcclxuICAgICAgcm9vbUlkLFxyXG4gICAgICB1c2VySWQ6IGhvc3RJZCxcclxuICAgICAgcm9sZTogJ0hPU1QnLFxyXG4gICAgICBqb2luZWRBdDogbm93LFxyXG4gICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgIH07XHJcblxyXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgIEl0ZW06IGhvc3RNZW1iZXIsXHJcbiAgICB9KSk7XHJcblxyXG4gICAgLy8gTG9nIGJ1c2luZXNzIG1ldHJpY1xyXG4gICAgbG9nQnVzaW5lc3NNZXRyaWMoJ1JPT01fQ1JFQVRFRCcsIHJvb21JZCwgaG9zdElkLCB7XHJcbiAgICAgIHJvb21TdGF0dXM6ICdXQUlUSU5HJyxcclxuICAgICAgcm9vbU5hbWU6IGlucHV0Lm5hbWUsXHJcbiAgICAgIGlzUHJpdmF0ZTogaW5wdXQuaXNQcml2YXRlIHx8IGZhbHNlLFxyXG4gICAgICAvLyBMZWdhY3kgbWV0cmljc1xyXG4gICAgICBnZW5yZVByZWZlcmVuY2VzOiB2YWxpZGF0ZWRHZW5yZXMsXHJcbiAgICAgIGdlbnJlQ291bnQ6IHZhbGlkYXRlZEdlbnJlcy5sZW5ndGgsXHJcbiAgICAgIC8vIE5ldyBmaWx0ZXJpbmcgbWV0cmljc1xyXG4gICAgICBtZWRpYVR5cGU6IGlucHV0Lm1lZGlhVHlwZSxcclxuICAgICAgZ2VucmVJZHM6IGlucHV0LmdlbnJlSWRzLFxyXG4gICAgICBjb250ZW50Q291bnQ6IGNvbnRlbnRJZHMubGVuZ3RoLFxyXG4gICAgICBoYXNGaWx0ZXJpbmc6ICEhZmlsdGVyQ3JpdGVyaWEsXHJcbiAgICAgIGZpbHRlcmluZ1N1Y2Nlc3M6IGNvbnRlbnRJZHMubGVuZ3RoID4gMCB8fCAhaW5wdXQubWVkaWFUeXBlXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIFJvb20gY3JlYXRlZDogJHtyb29tSWR9ICgke2lucHV0Lm5hbWV9KSBieSAke2hvc3RJZH0gd2l0aCAke2NvbnRlbnRJZHMubGVuZ3RofSBwcmUtbG9hZGVkIHRpdGxlc2ApO1xyXG4gICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyBcclxuICAgICAgcm9vbUlkLCBcclxuICAgICAgaG9zdElkLCBcclxuICAgICAgcm9vbU5hbWU6IGlucHV0Lm5hbWUsIFxyXG4gICAgICBjb250ZW50Q291bnQ6IGNvbnRlbnRJZHMubGVuZ3RoLFxyXG4gICAgICBoYXNGaWx0ZXJpbmc6ICEhZmlsdGVyQ3JpdGVyaWFcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICByZXR1cm4gcm9vbTtcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGxvZ0Vycm9yKCdDcmVhdGVSb29tJywgZXJyb3IgYXMgRXJyb3IsIHsgaG9zdElkLCByb29tSWQgfSk7XHJcbiAgICB0aW1lci5maW5pc2goZmFsc2UsIChlcnJvciBhcyBFcnJvcikubmFtZSk7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgYXZhaWxhYmxlIGdlbnJlcyBmb3IgYSBtZWRpYSB0eXBlXHJcbiAqIE5FVzogQ29udGVudCBmaWx0ZXJpbmcgc3lzdGVtXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRBdmFpbGFibGVHZW5yZXMobWVkaWFUeXBlOiBNZWRpYVR5cGUpOiBQcm9taXNlPEFycmF5PHtpZDogbnVtYmVyLCBuYW1lOiBzdHJpbmd9Pj4ge1xyXG4gIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ0dldEF2YWlsYWJsZUdlbnJlcycpO1xyXG5cclxuICB0cnkge1xyXG4gICAgY29uc29sZS5sb2coYPCfjq0gR2V0dGluZyBhdmFpbGFibGUgZ2VucmVzIGZvciAke21lZGlhVHlwZX1gKTtcclxuXHJcbiAgICBjb25zdCBjb250ZW50U2VydmljZSA9IGdldENvbnRlbnRGaWx0ZXJTZXJ2aWNlKCk7XHJcbiAgICBjb25zdCBnZW5yZXMgPSBhd2FpdCBjb250ZW50U2VydmljZS5nZXRBdmFpbGFibGVHZW5yZXMobWVkaWFUeXBlKTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIFJldHJpZXZlZCAke2dlbnJlcy5sZW5ndGh9IGdlbnJlcyBmb3IgJHttZWRpYVR5cGV9YCk7XHJcbiAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IG1lZGlhVHlwZSwgZ2VucmVDb3VudDogZ2VucmVzLmxlbmd0aCB9KTtcclxuICAgIFxyXG4gICAgcmV0dXJuIGdlbnJlcztcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGxvZ0Vycm9yKCdHZXRBdmFpbGFibGVHZW5yZXMnLCBlcnJvciBhcyBFcnJvciwgeyBtZWRpYVR5cGUgfSk7XHJcbiAgICB0aW1lci5maW5pc2goZmFsc2UsIChlcnJvciBhcyBFcnJvcikubmFtZSk7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBVcGRhdGUgcm9vbSBmaWx0ZXJzICh3aXRoIGltbXV0YWJpbGl0eSBlbmZvcmNlbWVudClcclxuICogTkVXOiBDb250ZW50IGZpbHRlcmluZyBzeXN0ZW1cclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHVwZGF0ZVJvb21GaWx0ZXJzKHVzZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZywgaW5wdXQ6IFVwZGF0ZVJvb21GaWx0ZXJzSW5wdXQpOiBQcm9taXNlPFJvb20+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdVcGRhdGVSb29tRmlsdGVycycpO1xyXG5cclxuICB0cnkge1xyXG4gICAgY29uc29sZS5sb2coYPCflIQgVXNlciAke3VzZXJJZH0gYXR0ZW1wdGluZyB0byB1cGRhdGUgZmlsdGVycyBmb3Igcm9vbSAke3Jvb21JZH06YCwgaW5wdXQpO1xyXG5cclxuICAgIC8vIEdldCByb29tIHRvIGNoZWNrIGN1cnJlbnQgc3RhdGVcclxuICAgIGNvbnN0IHJvb21SZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgIEtleTogeyBQSzogcm9vbUlkLCBTSzogJ1JPT00nIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaWYgKCFyb29tUmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Jvb20gbm90IGZvdW5kJyk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgcm9vbSA9IHJvb21SZXNwb25zZS5JdGVtIGFzIGFueTtcclxuXHJcbiAgICAvLyBDaGVjayBpZiB1c2VyIGlzIGhvc3RcclxuICAgIGlmIChyb29tLmhvc3RJZCAhPT0gdXNlcklkKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignT25seSByb29tIGhvc3QgY2FuIHVwZGF0ZSBmaWx0ZXJzJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRW5mb3JjZSBmaWx0ZXIgaW1tdXRhYmlsaXR5IChSZXF1aXJlbWVudHM6IDYuMSwgNi4yLCA2LjMpXHJcbiAgICBpZiAocm9vbS5maWx0ZXJDcml0ZXJpYSB8fCByb29tLm1lZGlhVHlwZSB8fCByb29tLmdlbnJlSWRzKSB7XHJcbiAgICAgIHRocm93IG5ldyBGaWx0ZXJJbW11dGFiaWxpdHlFcnJvcihcclxuICAgICAgICAnUm9vbSBmaWx0ZXJzIGNhbm5vdCBiZSBtb2RpZmllZCBhZnRlciBjcmVhdGlvbi4gUGxlYXNlIGNyZWF0ZSBhIG5ldyByb29tIHdpdGggZGlmZmVyZW50IGZpbHRlcnMuJ1xyXG4gICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFRoaXMgc2hvdWxkIG5ldmVyIGJlIHJlYWNoZWQgZHVlIHRvIGltbXV0YWJpbGl0eSwgYnV0IGtlcHQgZm9yIGNvbXBsZXRlbmVzc1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGaWx0ZXIgdXBkYXRlcyBhcmUgbm90IGFsbG93ZWQnKTtcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGxvZ0Vycm9yKCdVcGRhdGVSb29tRmlsdGVycycsIGVycm9yIGFzIEVycm9yLCB7IHVzZXJJZCwgcm9vbUlkLCBpbnB1dCB9KTtcclxuICAgIHRpbWVyLmZpbmlzaChmYWxzZSwgKGVycm9yIGFzIEVycm9yKS5uYW1lKTtcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFVuaXJzZSBhIHVuYSBzYWxhIGV4aXN0ZW50ZVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gam9pblJvb20odXNlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTxSb29tPiB7XHJcbiAgY29uc3QgdGltZXIgPSBuZXcgUGVyZm9ybWFuY2VUaW1lcignSm9pblJvb20nKTtcclxuXHJcbiAgdHJ5IHtcclxuICAgIC8vIFZlcmlmaWNhciBxdWUgbGEgc2FsYSBleGlzdGUgeSBlc3TDoSBkaXNwb25pYmxlXHJcbiAgICBjb25zdCBtYXhSZXRyaWVzID0gMztcclxuICAgIGxldCBhdHRlbXB0ID0gMDtcclxuICAgIGxldCByb29tUmVzcG9uc2U7XHJcblxyXG4gICAgd2hpbGUgKGF0dGVtcHQgPCBtYXhSZXRyaWVzKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgcm9vbVJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgICAgICBLZXk6IHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9LFxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICBicmVhazsgLy8gU3VjY2VzcywgZXhpdCByZXRyeSBsb29wXHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1ZhbGlkYXRpb25FeGNlcHRpb24nICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2tleSBlbGVtZW50IGRvZXMgbm90IG1hdGNoJykpIHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBkZSBlc3RydWN0dXJhIGRlIGNsYXZlIGVuIFJPT01TX1RBQkxFIChqb2luUm9vbSk6JywgZXJyb3IubWVzc2FnZSk7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIFBvciBmYXZvciwgaW50w6ludGFsbyBkZSBudWV2byBtw6FzIHRhcmRlLicpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRXJyb3JlcyBkZSByZWQgbyB0ZW1wb3JhbGVzIC0gcmVpbnRlbnRhclxyXG4gICAgICAgIGlmIChlcnJvci5uYW1lID09PSAnU2VydmljZUV4Y2VwdGlvbicgfHwgZXJyb3IubmFtZSA9PT0gJ1Rocm90dGxpbmdFeGNlcHRpb24nIHx8IGVycm9yLm5hbWUgPT09ICdJbnRlcm5hbFNlcnZlckVycm9yJykge1xyXG4gICAgICAgICAgYXR0ZW1wdCsrO1xyXG4gICAgICAgICAgaWYgKGF0dGVtcHQgPj0gbWF4UmV0cmllcykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgTcOheGltbyBkZSByZWludGVudG9zIGFsY2FuemFkbyBwYXJhIGpvaW5Sb29tIGdldFJvb21BbmRWYWxpZGF0ZScpO1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIFNlcnZpY2lvIHRlbXBvcmFsbWVudGUgbm8gZGlzcG9uaWJsZS4nKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBSZWludGVudGFuZG8gam9pblJvb20gZ2V0Um9vbUFuZFZhbGlkYXRlIChpbnRlbnRvICR7YXR0ZW1wdCArIDF9LyR7bWF4UmV0cmllc30pYCk7XHJcbiAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwICogTWF0aC5wb3coMiwgYXR0ZW1wdCkpKTsgLy8gRXhwb25lbnRpYWwgYmFja29mZlxyXG4gICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aHJvdyBlcnJvcjsgLy8gUmUtdGhyb3cgb3RoZXIgZXJyb3JzXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXJvb21SZXNwb25zZSB8fCAhcm9vbVJlc3BvbnNlLkl0ZW0pIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdTYWxhIG5vIGVuY29udHJhZGEnKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByb29tID0gcm9vbVJlc3BvbnNlLkl0ZW0gYXMgYW55O1xyXG5cclxuICAgIGlmIChyb29tLnN0YXR1cyAhPT0gJ1dBSVRJTkcnKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignTGEgc2FsYSBubyBlc3TDoSBkaXNwb25pYmxlIHBhcmEgbnVldm9zIG1pZW1icm9zJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVmVyaWZpY2FyIHNpIGVsIHVzdWFyaW8geWEgZXN0w6EgZW4gbGEgc2FsYVxyXG4gICAgY29uc3QgZXhpc3RpbmdNZW1iZXIgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgS2V5OiB7IHJvb21JZCwgdXNlcklkIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaWYgKGV4aXN0aW5nTWVtYmVyLkl0ZW0pIHtcclxuICAgICAgLy8gVXN1YXJpbyB5YSBlc3TDoSBlbiBsYSBzYWxhLCBzb2xvIGFjdHVhbGl6YXIgY29tbyBhY3Rpdm9cclxuICAgICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFVwZGF0ZUNvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFISxcclxuICAgICAgICBLZXk6IHsgcm9vbUlkLCB1c2VySWQgfSxcclxuICAgICAgICBVcGRhdGVFeHByZXNzaW9uOiAnU0VUIGlzQWN0aXZlID0gOmFjdGl2ZSwgam9pbmVkQXQgPSA6am9pbmVkQXQnLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAgICc6YWN0aXZlJzogdHJ1ZSxcclxuICAgICAgICAgICc6am9pbmVkQXQnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgfSkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gQcOxYWRpciBudWV2byBtaWVtYnJvXHJcbiAgICAgIGNvbnN0IG5ld01lbWJlcjogUm9vbU1lbWJlciA9IHtcclxuICAgICAgICByb29tSWQsXHJcbiAgICAgICAgdXNlcklkLFxyXG4gICAgICAgIHJvbGU6ICdNRU1CRVInLFxyXG4gICAgICAgIGpvaW5lZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgIH07XHJcblxyXG4gICAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgICAgIEl0ZW06IG5ld01lbWJlcixcclxuICAgICAgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEFjdHVhbGl6YXIgdGltZXN0YW1wIGRlIGxhIHNhbGFcclxuICAgIGNvbnN0IG1heFJldHJpZXNVcGRhdGUgPSAzO1xyXG4gICAgbGV0IGF0dGVtcHRVcGRhdGUgPSAwO1xyXG5cclxuICAgIHdoaWxlIChhdHRlbXB0VXBkYXRlIDwgbWF4UmV0cmllc1VwZGF0ZSkge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICAgICAgS2V5OiB7IFBLOiByb29tSWQsIFNLOiAnUk9PTScgfSxcclxuICAgICAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdCcsXHJcbiAgICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAgICc6dXBkYXRlZEF0JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgYnJlYWs7IC8vIFN1Y2Nlc3MsIGV4aXQgcmV0cnkgbG9vcFxyXG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdWYWxpZGF0aW9uRXhjZXB0aW9uJyAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdrZXkgZWxlbWVudCBkb2VzIG5vdCBtYXRjaCcpKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZGUgZXN0cnVjdHVyYSBkZSBjbGF2ZSBlbiBST09NU19UQUJMRSAoam9pblJvb20gdXBkYXRlKTonLCBlcnJvci5tZXNzYWdlKTtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYSBhbCBhY3R1YWxpemFyIGxhIHNhbGEuJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBFcnJvcmVzIGRlIHJlZCBvIHRlbXBvcmFsZXMgLSByZWludGVudGFyXHJcbiAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdTZXJ2aWNlRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnVGhyb3R0bGluZ0V4Y2VwdGlvbicgfHwgZXJyb3IubmFtZSA9PT0gJ0ludGVybmFsU2VydmVyRXJyb3InKSB7XHJcbiAgICAgICAgICBhdHRlbXB0VXBkYXRlKys7XHJcbiAgICAgICAgICBpZiAoYXR0ZW1wdFVwZGF0ZSA+PSBtYXhSZXRyaWVzVXBkYXRlKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBNw6F4aW1vIGRlIHJlaW50ZW50b3MgYWxjYW56YWRvIHBhcmEgam9pblJvb20gdXBkYXRlUm9vbScpO1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIE5vIHNlIHB1ZG8gYWN0dWFsaXphciBsYSBzYWxhIGRlc3B1w6lzIGRlIG3Dumx0aXBsZXMgaW50ZW50b3MuJyk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgY29uc29sZS5sb2coYPCflIQgUmVpbnRlbnRhbmRvIGpvaW5Sb29tIHVwZGF0ZVJvb20gKGludGVudG8gJHthdHRlbXB0VXBkYXRlICsgMX0vJHttYXhSZXRyaWVzVXBkYXRlfSlgKTtcclxuICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAgKiBNYXRoLnBvdygyLCBhdHRlbXB0VXBkYXRlKSkpOyAvLyBFeHBvbmVudGlhbCBiYWNrb2ZmXHJcbiAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRocm93IGVycm9yOyAvLyBSZS10aHJvdyBvdGhlciBlcnJvcnNcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIExvZyBidXNpbmVzcyBtZXRyaWNcclxuICAgIGxvZ0J1c2luZXNzTWV0cmljKCdST09NX0pPSU5FRCcsIHJvb21JZCwgdXNlcklkLCB7XHJcbiAgICAgIHJvb21TdGF0dXM6IHJvb20uc3RhdHVzLFxyXG4gICAgICB3YXNFeGlzdGluZ01lbWJlcjogISFleGlzdGluZ01lbWJlci5JdGVtXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIFVzdWFyaW8gJHt1c2VySWR9IHNlIHVuacOzIGEgc2FsYSAke3Jvb21JZH1gKTtcclxuXHJcbiAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJvb21JZCwgdXNlcklkLCB3YXNFeGlzdGluZzogISFleGlzdGluZ01lbWJlci5JdGVtIH0pO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIGlkOiByb29tSWQsXHJcbiAgICAgIG5hbWU6IHJvb20ubmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246IHJvb20uZGVzY3JpcHRpb24sXHJcbiAgICAgIHN0YXR1czogcm9vbS5zdGF0dXMsXHJcbiAgICAgIHJlc3VsdE1vdmllSWQ6IHJvb20ucmVzdWx0TW92aWVJZCxcclxuICAgICAgaG9zdElkOiByb29tLmhvc3RJZCxcclxuICAgICAgaW52aXRlQ29kZTogcm9vbS5pbnZpdGVDb2RlLFxyXG4gICAgICBpbnZpdGVVcmw6IHJvb20uaW52aXRlVXJsLFxyXG4gICAgICBnZW5yZVByZWZlcmVuY2VzOiByb29tLmdlbnJlUHJlZmVyZW5jZXMsXHJcbiAgICAgIG1lZGlhVHlwZTogcm9vbS5tZWRpYVR5cGUsXHJcbiAgICAgIGdlbnJlSWRzOiByb29tLmdlbnJlSWRzLFxyXG4gICAgICBnZW5yZU5hbWVzOiByb29tLmdlbnJlTmFtZXMsXHJcbiAgICAgIGNvbnRlbnRJZHM6IHJvb20uY29udGVudElkcyxcclxuICAgICAgc2hvd25Db250ZW50SWRzOiByb29tLnNob3duQ29udGVudElkcyxcclxuICAgICAgY3VycmVudENvbnRlbnRJbmRleDogcm9vbS5jdXJyZW50Q29udGVudEluZGV4LFxyXG4gICAgICBmaWx0ZXJDcml0ZXJpYTogcm9vbS5maWx0ZXJDcml0ZXJpYSxcclxuICAgICAgZXhjbHVkZWRDb250ZW50SWRzOiByb29tLmV4Y2x1ZGVkQ29udGVudElkcyxcclxuICAgICAgbGFzdENvbnRlbnRSZWZyZXNoOiByb29tLmxhc3RDb250ZW50UmVmcmVzaCxcclxuICAgICAgaXNBY3RpdmU6IHJvb20uaXNBY3RpdmUsXHJcbiAgICAgIGlzUHJpdmF0ZTogcm9vbS5pc1ByaXZhdGUsXHJcbiAgICAgIG1lbWJlckNvdW50OiByb29tLm1lbWJlckNvdW50LFxyXG4gICAgICBtYXhNZW1iZXJzOiByb29tLm1heE1lbWJlcnMsXHJcbiAgICAgIG1hdGNoQ291bnQ6IHJvb20ubWF0Y2hDb3VudCB8fCAwLFxyXG4gICAgICBjcmVhdGVkQXQ6IHJvb20uY3JlYXRlZEF0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICB9O1xyXG5cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgbG9nRXJyb3IoJ0pvaW5Sb29tJywgZXJyb3IgYXMgRXJyb3IsIHsgdXNlcklkLCByb29tSWQgfSk7XHJcbiAgICB0aW1lci5maW5pc2goZmFsc2UsIChlcnJvciBhcyBFcnJvcikubmFtZSk7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBVbmlyc2UgYSB1bmEgc2FsYSBwb3IgY8OzZGlnbyBkZSBpbnZpdGFjacOzblxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gam9pblJvb21CeUludml0ZSh1c2VySWQ6IHN0cmluZywgaW52aXRlQ29kZTogc3RyaW5nKTogUHJvbWlzZTxSb29tPiB7XHJcbiAgY29uc3QgdGltZXIgPSBuZXcgUGVyZm9ybWFuY2VUaW1lcignSm9pblJvb21CeUludml0ZScpO1xyXG5cclxuICB0cnkge1xyXG4gICAgY29uc29sZS5sb2coYPCflJcgVXNlciAke3VzZXJJZH0gYXR0ZW1wdGluZyB0byBqb2luIHJvb20gd2l0aCBpbnZpdGUgY29kZTogJHtpbnZpdGVDb2RlfWApO1xyXG5cclxuICAgIC8vIEZpbmQgcm9vbSBieSBpbnZpdGUgY29kZSB1c2luZyBHU0lcclxuICAgIGNvbnN0IHJvb21RdWVyeSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgSW5kZXhOYW1lOiAnSW52aXRlQ29kZUluZGV4JyxcclxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ2ludml0ZUNvZGUgPSA6aW52aXRlQ29kZScsXHJcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAnOmludml0ZUNvZGUnOiBpbnZpdGVDb2RlLFxyXG4gICAgICB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmICghcm9vbVF1ZXJ5Lkl0ZW1zIHx8IHJvb21RdWVyeS5JdGVtcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDw7NkaWdvIGRlIGludml0YWNpw7NuIGludsOhbGlkbyBvIGV4cGlyYWRvJyk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgcm9vbURhdGEgPSByb29tUXVlcnkuSXRlbXNbMF07XHJcbiAgICBjb25zdCByb29tSWQgPSByb29tRGF0YS5yb29tSWQ7XHJcblxyXG4gICAgY29uc29sZS5sb2coYOKchSBGb3VuZCByb29tICR7cm9vbUlkfSBmb3IgaW52aXRlIGNvZGUgJHtpbnZpdGVDb2RlfWApO1xyXG5cclxuICAgIC8vIFVzZSBleGlzdGluZyBqb2luUm9vbSBmdW5jdGlvblxyXG4gICAgcmV0dXJuIGF3YWl0IGpvaW5Sb29tKHVzZXJJZCwgcm9vbUlkKTtcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGxvZ0Vycm9yKCdKb2luUm9vbUJ5SW52aXRlJywgZXJyb3IgYXMgRXJyb3IsIHsgdXNlcklkLCBpbnZpdGVDb2RlIH0pO1xyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciBoaXN0b3JpYWwgZGUgc2FsYXMgZGVsIHVzdWFyaW9cclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldE15SGlzdG9yeSh1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8Um9vbVtdPiB7XHJcbiAgLy8gQ29uc3VsdGFyIEdTSSBVc2VySGlzdG9yeUluZGV4IHBhcmEgb2J0ZW5lciBzYWxhcyBkZWwgdXN1YXJpb1xyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XHJcbiAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICBJbmRleE5hbWU6ICdVc2VySGlzdG9yeUluZGV4JyxcclxuICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICd1c2VySWQgPSA6dXNlcklkJyxcclxuICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgJzp1c2VySWQnOiB1c2VySWQsXHJcbiAgICB9LFxyXG4gICAgU2NhbkluZGV4Rm9yd2FyZDogZmFsc2UsIC8vIE9yZGVuYXIgcG9yIGpvaW5lZEF0IGRlc2NlbmRlbnRlIChtw6FzIHJlY2llbnRlcyBwcmltZXJvKVxyXG4gICAgTGltaXQ6IDUwLCAvLyBMaW1pdGFyIGEgw7psdGltYXMgNTAgc2FsYXNcclxuICB9KSk7XHJcblxyXG4gIGlmICghcmVzcG9uc2UuSXRlbXMgfHwgcmVzcG9uc2UuSXRlbXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICByZXR1cm4gW107XHJcbiAgfVxyXG5cclxuICAvLyBPYnRlbmVyIGRldGFsbGVzIGRlIGNhZGEgc2FsYVxyXG4gIGNvbnN0IHJvb21zOiBSb29tW10gPSBbXTtcclxuXHJcbiAgZm9yIChjb25zdCBtZW1iZXIgb2YgcmVzcG9uc2UuSXRlbXMpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IG1heFJldHJpZXNIaXN0b3J5ID0gMztcclxuICAgICAgbGV0IGF0dGVtcHRIaXN0b3J5ID0gMDtcclxuICAgICAgbGV0IHJvb21SZXNwb25zZTtcclxuXHJcbiAgICAgIHdoaWxlIChhdHRlbXB0SGlzdG9yeSA8IG1heFJldHJpZXNIaXN0b3J5KSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIHJvb21SZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgICAgICAgIEtleTogeyBQSzogbWVtYmVyLnJvb21JZCwgU0s6ICdST09NJyB9LFxyXG4gICAgICAgICAgfSkpO1xyXG4gICAgICAgICAgYnJlYWs7IC8vIFN1Y2Nlc3MsIGV4aXQgcmV0cnkgbG9vcFxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgICAgIGlmIChlcnJvci5uYW1lID09PSAnVmFsaWRhdGlvbkV4Y2VwdGlvbicgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygna2V5IGVsZW1lbnQgZG9lcyBub3QgbWF0Y2gnKSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZGUgZXN0cnVjdHVyYSBkZSBjbGF2ZSBlbiBST09NU19UQUJMRSAoZ2V0TXlIaXN0b3J5KTonLCBlcnJvci5tZXNzYWdlKTtcclxuICAgICAgICAgICAgLy8gU2tpcCB0aGlzIHJvb20gYW5kIGNvbnRpbnVlIHdpdGggb3RoZXJzXHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIEVycm9yZXMgZGUgcmVkIG8gdGVtcG9yYWxlcyAtIHJlaW50ZW50YXJcclxuICAgICAgICAgIGlmIChlcnJvci5uYW1lID09PSAnU2VydmljZUV4Y2VwdGlvbicgfHwgZXJyb3IubmFtZSA9PT0gJ1Rocm90dGxpbmdFeGNlcHRpb24nIHx8IGVycm9yLm5hbWUgPT09ICdJbnRlcm5hbFNlcnZlckVycm9yJykge1xyXG4gICAgICAgICAgICBhdHRlbXB0SGlzdG9yeSsrO1xyXG4gICAgICAgICAgICBpZiAoYXR0ZW1wdEhpc3RvcnkgPj0gbWF4UmV0cmllc0hpc3RvcnkpIHtcclxuICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBFcnJvciBvYnRlbmllbmRvIHNhbGEgJHttZW1iZXIucm9vbUlkfSBkZXNwdcOpcyBkZSBtw7psdGlwbGVzIGludGVudG9zOmAsIGVycm9yKTtcclxuICAgICAgICAgICAgICBicmVhazsgLy8gU2tpcCB0aGlzIHJvb20gYW5kIGNvbnRpbnVlIHdpdGggb3RoZXJzXHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlaW50ZW50YW5kbyBnZXRNeUhpc3RvcnkgZ2V0Um9vbURldGFpbHMgKGludGVudG8gJHthdHRlbXB0SGlzdG9yeSArIDF9LyR7bWF4UmV0cmllc0hpc3Rvcnl9KWApO1xyXG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwICogTWF0aC5wb3coMiwgYXR0ZW1wdEhpc3RvcnkpKSk7IC8vIEV4cG9uZW50aWFsIGJhY2tvZmZcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgdGhyb3cgZXJyb3I7IC8vIFJlLXRocm93IG90aGVyIGVycm9yc1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHJvb21SZXNwb25zZSAmJiByb29tUmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICAgIGNvbnN0IHJvb20gPSByb29tUmVzcG9uc2UuSXRlbTtcclxuICAgICAgICByb29tcy5wdXNoKHtcclxuICAgICAgICAgIGlkOiByb29tLnJvb21JZCxcclxuICAgICAgICAgIG5hbWU6IHJvb20ubmFtZSB8fCAnU2FsYSBzaW4gbm9tYnJlJyxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uOiByb29tLmRlc2NyaXB0aW9uLFxyXG4gICAgICAgICAgc3RhdHVzOiByb29tLnN0YXR1cyxcclxuICAgICAgICAgIHJlc3VsdE1vdmllSWQ6IHJvb20ucmVzdWx0TW92aWVJZCxcclxuICAgICAgICAgIGhvc3RJZDogcm9vbS5ob3N0SWQsXHJcbiAgICAgICAgICBpbnZpdGVDb2RlOiByb29tLmludml0ZUNvZGUsXHJcbiAgICAgICAgICBpbnZpdGVVcmw6IHJvb20uaW52aXRlVXJsLFxyXG4gICAgICAgICAgZ2VucmVQcmVmZXJlbmNlczogcm9vbS5nZW5yZVByZWZlcmVuY2VzLFxyXG4gICAgICAgICAgbWVkaWFUeXBlOiByb29tLm1lZGlhVHlwZSxcclxuICAgICAgICAgIGdlbnJlSWRzOiByb29tLmdlbnJlSWRzLFxyXG4gICAgICAgICAgZ2VucmVOYW1lczogcm9vbS5nZW5yZU5hbWVzLFxyXG4gICAgICAgICAgY29udGVudElkczogcm9vbS5jb250ZW50SWRzLFxyXG4gICAgICAgICAgc2hvd25Db250ZW50SWRzOiByb29tLnNob3duQ29udGVudElkcyxcclxuICAgICAgICAgIGN1cnJlbnRDb250ZW50SW5kZXg6IHJvb20uY3VycmVudENvbnRlbnRJbmRleCxcclxuICAgICAgICAgIGZpbHRlckNyaXRlcmlhOiByb29tLmZpbHRlckNyaXRlcmlhLFxyXG4gICAgICAgICAgZXhjbHVkZWRDb250ZW50SWRzOiByb29tLmV4Y2x1ZGVkQ29udGVudElkcyxcclxuICAgICAgICAgIGxhc3RDb250ZW50UmVmcmVzaDogcm9vbS5sYXN0Q29udGVudFJlZnJlc2gsXHJcbiAgICAgICAgICBpc0FjdGl2ZTogcm9vbS5pc0FjdGl2ZSAhPT0gZmFsc2UsIC8vIERlZmF1bHQgdG8gdHJ1ZSBpZiBub3Qgc2V0XHJcbiAgICAgICAgICBpc1ByaXZhdGU6IHJvb20uaXNQcml2YXRlIHx8IGZhbHNlLFxyXG4gICAgICAgICAgbWVtYmVyQ291bnQ6IHJvb20ubWVtYmVyQ291bnQgfHwgMSxcclxuICAgICAgICAgIG1heE1lbWJlcnM6IHJvb20ubWF4TWVtYmVycyxcclxuICAgICAgICAgIG1hdGNoQ291bnQ6IHJvb20ubWF0Y2hDb3VudCB8fCAwLFxyXG4gICAgICAgICAgY3JlYXRlZEF0OiByb29tLmNyZWF0ZWRBdCB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB1cGRhdGVkQXQ6IHJvb20udXBkYXRlZEF0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gRXJyb3Igb2J0ZW5pZW5kbyBzYWxhICR7bWVtYmVyLnJvb21JZH06YCwgZXJyb3IpO1xyXG4gICAgICAvLyBDb250aW51YXIgY29uIGxhcyBkZW3DoXMgc2FsYXNcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGNvbnNvbGUubG9nKGDwn5OLIEhpc3RvcmlhbCBvYnRlbmlkbyBwYXJhICR7dXNlcklkfTogJHtyb29tcy5sZW5ndGh9IHNhbGFzYCk7XHJcbiAgcmV0dXJuIHJvb21zO1xyXG59XHJcblxyXG4vKipcclxuICogQ3JlYXIgbnVldmEgc2FsYSAodmVyc2nDs24gZGVidWcgY29uIHNvbG8gbmFtZSlcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVJvb21EZWJ1Zyhob3N0SWQ6IHN0cmluZywgaW5wdXQ6IENyZWF0ZVJvb21JbnB1dERlYnVnKTogUHJvbWlzZTxSb29tPiB7XHJcbiAgY29uc3QgdGltZXIgPSBuZXcgUGVyZm9ybWFuY2VUaW1lcignQ3JlYXRlUm9vbURlYnVnJyk7XHJcbiAgY29uc3Qgcm9vbUlkID0gdXVpZHY0KCk7XHJcbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG5cclxuICBjb25zb2xlLmxvZygn8J+UjSBjcmVhdGVSb29tRGVidWcgLSBob3N0SWQ6JywgaG9zdElkKTtcclxuICBjb25zb2xlLmxvZygn8J+UjSBjcmVhdGVSb29tRGVidWcgLSBpbnB1dDonLCBKU09OLnN0cmluZ2lmeShpbnB1dCwgbnVsbCwgMikpO1xyXG5cclxuICB0cnkge1xyXG4gICAgLy8gR2VuZXJhdGUgdW5pcXVlIGludml0ZSBsaW5rIHVzaW5nIERlZXBMaW5rU2VydmljZVxyXG4gICAgY29uc3QgaW52aXRlTGluayA9IGF3YWl0IGRlZXBMaW5rU2VydmljZS5nZW5lcmF0ZUludml0ZUxpbmsocm9vbUlkLCBob3N0SWQsIHtcclxuICAgICAgZXhwaXJ5SG91cnM6IDE2OCwgLy8gNyBkYXlzXHJcbiAgICAgIG1heFVzYWdlOiB1bmRlZmluZWQsIC8vIE5vIHVzYWdlIGxpbWl0XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhciBzYWxhIGVuIFJvb21zVGFibGUgY29uIHZhbG9yZXMgcG9yIGRlZmVjdG9cclxuICAgIGNvbnN0IHJvb206IFJvb20gPSB7XHJcbiAgICAgIGlkOiByb29tSWQsXHJcbiAgICAgIG5hbWU6IGlucHV0Lm5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2FsYSBkZSBkZWJ1ZycsXHJcbiAgICAgIHN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICBob3N0SWQsXHJcbiAgICAgIGludml0ZUNvZGU6IGludml0ZUxpbmsuY29kZSxcclxuICAgICAgaW52aXRlVXJsOiBpbnZpdGVMaW5rLnVybCxcclxuICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgIG1lbWJlckNvdW50OiAxLCAvLyBFbCBob3N0IGN1ZW50YSBjb21vIG1pZW1icm9cclxuICAgICAgbWF4TWVtYmVyczogMTAsIC8vIFZhbG9yIHBvciBkZWZlY3RvXHJcbiAgICAgIG1hdGNoQ291bnQ6IDAsIC8vIEluaXRpYWxpemUgbWF0Y2hDb3VudCBmaWVsZFxyXG4gICAgICBjcmVhdGVkQXQ6IG5vdyxcclxuICAgICAgdXBkYXRlZEF0OiBub3csXHJcbiAgICB9O1xyXG5cclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgIEl0ZW06IHtcclxuICAgICAgICBQSzogcm9vbUlkLCAvLyBBZGQgUEsgZm9yIER5bmFtb0RCIHByaW1hcnkga2V5XHJcbiAgICAgICAgU0s6ICdST09NJywgLy8gQWRkIFNLIGZvciBEeW5hbW9EQiBzb3J0IGtleVxyXG4gICAgICAgIHJvb21JZCxcclxuICAgICAgICAuLi5yb29tLFxyXG4gICAgICB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIC8vIEHDsWFkaXIgaG9zdCBjb21vIG1pZW1icm9cclxuICAgIGNvbnN0IGhvc3RNZW1iZXI6IFJvb21NZW1iZXIgPSB7XHJcbiAgICAgIHJvb21JZCxcclxuICAgICAgdXNlcklkOiBob3N0SWQsXHJcbiAgICAgIHJvbGU6ICdIT1NUJyxcclxuICAgICAgam9pbmVkQXQ6IG5vdyxcclxuICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICB9O1xyXG5cclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgICBJdGVtOiBob3N0TWVtYmVyLFxyXG4gICAgfSkpO1xyXG5cclxuICAgIC8vIExvZyBidXNpbmVzcyBtZXRyaWNcclxuICAgIGxvZ0J1c2luZXNzTWV0cmljKCdST09NX0NSRUFURUQnLCByb29tSWQsIGhvc3RJZCwge1xyXG4gICAgICByb29tU3RhdHVzOiAnV0FJVElORycsXHJcbiAgICAgIHJvb21OYW1lOiBpbnB1dC5uYW1lLFxyXG4gICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICBkZWJ1ZzogdHJ1ZVxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coYOKchSBTYWxhIGRlYnVnIGNyZWFkYTogJHtyb29tSWR9ICgke2lucHV0Lm5hbWV9KSBwb3IgJHtob3N0SWR9YCk7XHJcbiAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHJvb21JZCwgaG9zdElkLCByb29tTmFtZTogaW5wdXQubmFtZSB9KTtcclxuICAgIHJldHVybiByb29tO1xyXG5cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgbG9nRXJyb3IoJ0NyZWF0ZVJvb21EZWJ1ZycsIGVycm9yIGFzIEVycm9yLCB7IGhvc3RJZCwgcm9vbUlkIH0pO1xyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogQ3JlYXIgbnVldmEgc2FsYSAodmVyc2nDs24gc2ltcGxlIHNpbiBpbnB1dCB0eXBlKVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlUm9vbVNpbXBsZShob3N0SWQ6IHN0cmluZywgbmFtZTogc3RyaW5nKTogUHJvbWlzZTxSb29tPiB7XHJcbiAgY29uc3QgdGltZXIgPSBuZXcgUGVyZm9ybWFuY2VUaW1lcignQ3JlYXRlUm9vbVNpbXBsZScpO1xyXG4gIGNvbnN0IHJvb21JZCA9IHV1aWR2NCgpO1xyXG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuXHJcbiAgY29uc29sZS5sb2coJ/CflI0gY3JlYXRlUm9vbVNpbXBsZSAtIGhvc3RJZDonLCBob3N0SWQpO1xyXG4gIGNvbnNvbGUubG9nKCfwn5SNIGNyZWF0ZVJvb21TaW1wbGUgLSBuYW1lOicsIG5hbWUpO1xyXG4gIGNvbnNvbGUubG9nKCfwn5SNIGNyZWF0ZVJvb21TaW1wbGUgLSByb29tSWQgZ2VuZXJhdGVkOicsIHJvb21JZCk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICBjb25zb2xlLmxvZygn8J+UjSBjcmVhdGVSb29tU2ltcGxlIC0gU3RlcCAxOiBDYWxsaW5nIGRlZXBMaW5rU2VydmljZS5nZW5lcmF0ZUludml0ZUxpbmsuLi4nKTtcclxuICAgIC8vIEdlbmVyYXRlIHVuaXF1ZSBpbnZpdGUgbGluayB1c2luZyBEZWVwTGlua1NlcnZpY2VcclxuICAgIGNvbnN0IGludml0ZUxpbmsgPSBhd2FpdCBkZWVwTGlua1NlcnZpY2UuZ2VuZXJhdGVJbnZpdGVMaW5rKHJvb21JZCwgaG9zdElkLCB7XHJcbiAgICAgIGV4cGlyeUhvdXJzOiAxNjgsIC8vIDcgZGF5c1xyXG4gICAgICBtYXhVc2FnZTogdW5kZWZpbmVkLCAvLyBObyB1c2FnZSBsaW1pdFxyXG4gICAgfSk7XHJcbiAgICBjb25zb2xlLmxvZygn4pyFIGNyZWF0ZVJvb21TaW1wbGUgLSBTdGVwIDEgU1VDQ0VTUzogSW52aXRlIGxpbmsgZ2VuZXJhdGVkOicsIGludml0ZUxpbmsuY29kZSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coJ/CflI0gY3JlYXRlUm9vbVNpbXBsZSAtIFN0ZXAgMjogQ3JlYXRpbmcgcm9vbSBvYmplY3QuLi4nKTtcclxuICAgIC8vIENyZWFyIHNhbGEgZW4gUm9vbXNUYWJsZSBjb24gdmFsb3JlcyBwb3IgZGVmZWN0b1xyXG4gICAgY29uc3Qgcm9vbTogUm9vbSA9IHtcclxuICAgICAgaWQ6IHJvb21JZCxcclxuICAgICAgbmFtZTogbmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdTYWxhIHNpbXBsZScsXHJcbiAgICAgIHN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICBob3N0SWQsXHJcbiAgICAgIGludml0ZUNvZGU6IGludml0ZUxpbmsuY29kZSxcclxuICAgICAgaW52aXRlVXJsOiBpbnZpdGVMaW5rLnVybCxcclxuICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgIG1lbWJlckNvdW50OiAxLCAvLyBFbCBob3N0IGN1ZW50YSBjb21vIG1pZW1icm9cclxuICAgICAgbWF4TWVtYmVyczogMTAsIC8vIFZhbG9yIHBvciBkZWZlY3RvXHJcbiAgICAgIG1hdGNoQ291bnQ6IDAsIC8vIEluaXRpYWxpemUgbWF0Y2hDb3VudCBmaWVsZFxyXG4gICAgICBjcmVhdGVkQXQ6IG5vdyxcclxuICAgICAgdXBkYXRlZEF0OiBub3csXHJcbiAgICB9O1xyXG4gICAgY29uc29sZS5sb2coJ+KchSBjcmVhdGVSb29tU2ltcGxlIC0gU3RlcCAyIFNVQ0NFU1M6IFJvb20gb2JqZWN0IGNyZWF0ZWQnKTtcclxuXHJcbiAgICBjb25zb2xlLmxvZygn8J+UjSBjcmVhdGVSb29tU2ltcGxlIC0gU3RlcCAzOiBTYXZpbmcgcm9vbSB0byBEeW5hbW9EQi4uLicpO1xyXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgSXRlbToge1xyXG4gICAgICAgIFBLOiByb29tSWQsIC8vIEFkZCBQSyBmb3IgRHluYW1vREIgcHJpbWFyeSBrZXlcclxuICAgICAgICBTSzogJ1JPT00nLCAvLyBBZGQgU0sgZm9yIER5bmFtb0RCIHNvcnQga2V5XHJcbiAgICAgICAgcm9vbUlkLFxyXG4gICAgICAgIC4uLnJvb20sXHJcbiAgICAgIH0sXHJcbiAgICB9KSk7XHJcbiAgICBjb25zb2xlLmxvZygn4pyFIGNyZWF0ZVJvb21TaW1wbGUgLSBTdGVwIDMgU1VDQ0VTUzogUm9vbSBzYXZlZCB0byBEeW5hbW9EQicpO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKCfwn5SNIGNyZWF0ZVJvb21TaW1wbGUgLSBTdGVwIDQ6IEFkZGluZyBob3N0IGFzIG1lbWJlci4uLicpO1xyXG4gICAgLy8gQcOxYWRpciBob3N0IGNvbW8gbWllbWJyb1xyXG4gICAgY29uc3QgaG9zdE1lbWJlcjogUm9vbU1lbWJlciA9IHtcclxuICAgICAgcm9vbUlkLFxyXG4gICAgICB1c2VySWQ6IGhvc3RJZCxcclxuICAgICAgcm9sZTogJ0hPU1QnLFxyXG4gICAgICBqb2luZWRBdDogbm93LFxyXG4gICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgIH07XHJcblxyXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgIEl0ZW06IGhvc3RNZW1iZXIsXHJcbiAgICB9KSk7XHJcbiAgICBjb25zb2xlLmxvZygn4pyFIGNyZWF0ZVJvb21TaW1wbGUgLSBTdGVwIDQgU1VDQ0VTUzogSG9zdCBhZGRlZCBhcyBtZW1iZXInKTtcclxuXHJcbiAgICBjb25zb2xlLmxvZygn8J+UjSBjcmVhdGVSb29tU2ltcGxlIC0gU3RlcCA1OiBMb2dnaW5nIGJ1c2luZXNzIG1ldHJpYy4uLicpO1xyXG4gICAgLy8gTG9nIGJ1c2luZXNzIG1ldHJpY1xyXG4gICAgbG9nQnVzaW5lc3NNZXRyaWMoJ1JPT01fQ1JFQVRFRCcsIHJvb21JZCwgaG9zdElkLCB7XHJcbiAgICAgIHJvb21TdGF0dXM6ICdXQUlUSU5HJyxcclxuICAgICAgcm9vbU5hbWU6IG5hbWUsXHJcbiAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgIHNpbXBsZTogdHJ1ZVxyXG4gICAgfSk7XHJcbiAgICBjb25zb2xlLmxvZygn4pyFIGNyZWF0ZVJvb21TaW1wbGUgLSBTdGVwIDUgU1VDQ0VTUzogQnVzaW5lc3MgbWV0cmljIGxvZ2dlZCcpO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgU2FsYSBzaW1wbGUgY3JlYWRhOiAke3Jvb21JZH0gKCR7bmFtZX0pIHBvciAke2hvc3RJZH1gKTtcclxuICAgIGNvbnNvbGUubG9nKCfwn5SNIGNyZWF0ZVJvb21TaW1wbGUgLSBSZXR1cm5pbmcgcm9vbSBvYmplY3Q6JywgSlNPTi5zdHJpbmdpZnkocm9vbSwgbnVsbCwgMikpO1xyXG4gICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByb29tSWQsIGhvc3RJZCwgcm9vbU5hbWU6IG5hbWUgfSk7XHJcbiAgICByZXR1cm4gcm9vbTtcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ/CfkqXwn5Kl8J+SpSBjcmVhdGVSb29tU2ltcGxlIC0gRVhDRVBUSU9OIENBVUdIVDonLCBlcnJvcik7XHJcbiAgICBjb25zb2xlLmVycm9yKCfwn5KlIEVycm9yIG5hbWU6JywgKGVycm9yIGFzIEVycm9yKS5uYW1lKTtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ/CfkqUgRXJyb3IgbWVzc2FnZTonLCAoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2UpO1xyXG4gICAgY29uc29sZS5lcnJvcign8J+SpSBFcnJvciBzdGFjazonLCAoZXJyb3IgYXMgRXJyb3IpLnN0YWNrKTtcclxuICAgIGxvZ0Vycm9yKCdDcmVhdGVSb29tU2ltcGxlJywgZXJyb3IgYXMgRXJyb3IsIHsgaG9zdElkLCByb29tSWQgfSk7XHJcbiAgICB0aW1lci5maW5pc2goZmFsc2UsIChlcnJvciBhcyBFcnJvcikubmFtZSk7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuYXN5bmMgZnVuY3Rpb24gZ2V0Um9vbSh1c2VySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPFJvb20gfCBudWxsPiB7XHJcbiAgdHJ5IHtcclxuICAgIC8vIFZlcmlmaWNhciBxdWUgZWwgdXN1YXJpbyBlcyBtaWVtYnJvIGRlIGxhIHNhbGFcclxuICAgIGNvbnN0IG1lbWJlclJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSEsXHJcbiAgICAgIEtleTogeyByb29tSWQsIHVzZXJJZCB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmICghbWVtYmVyUmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHRpZW5lcyBhY2Nlc28gYSBlc3RhIHNhbGEnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBPYnRlbmVyIGRldGFsbGVzIGRlIGxhIHNhbGFcclxuICAgIGNvbnN0IG1heFJldHJpZXNHZXRSb29tID0gMztcclxuICAgIGxldCBhdHRlbXB0R2V0Um9vbSA9IDA7XHJcbiAgICBsZXQgcm9vbVJlc3BvbnNlO1xyXG5cclxuICAgIHdoaWxlIChhdHRlbXB0R2V0Um9vbSA8IG1heFJldHJpZXNHZXRSb29tKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgcm9vbVJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSEsXHJcbiAgICAgICAgICBLZXk6IHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9LFxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICBicmVhazsgLy8gU3VjY2VzcywgZXhpdCByZXRyeSBsb29wXHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ1ZhbGlkYXRpb25FeGNlcHRpb24nICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2tleSBlbGVtZW50IGRvZXMgbm90IG1hdGNoJykpIHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBkZSBlc3RydWN0dXJhIGRlIGNsYXZlIGVuIFJPT01TX1RBQkxFIChnZXRSb29tKTonLCBlcnJvci5tZXNzYWdlKTtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgaW50ZXJubyBkZWwgc2lzdGVtYS4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIGRlIG51ZXZvIG3DoXMgdGFyZGUuJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBFcnJvcmVzIGRlIHJlZCBvIHRlbXBvcmFsZXMgLSByZWludGVudGFyXHJcbiAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdTZXJ2aWNlRXhjZXB0aW9uJyB8fCBlcnJvci5uYW1lID09PSAnVGhyb3R0bGluZ0V4Y2VwdGlvbicgfHwgZXJyb3IubmFtZSA9PT0gJ0ludGVybmFsU2VydmVyRXJyb3InKSB7XHJcbiAgICAgICAgICBhdHRlbXB0R2V0Um9vbSsrO1xyXG4gICAgICAgICAgaWYgKGF0dGVtcHRHZXRSb29tID49IG1heFJldHJpZXNHZXRSb29tKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBNw6F4aW1vIGRlIHJlaW50ZW50b3MgYWxjYW56YWRvIHBhcmEgZ2V0Um9vbScpO1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIGludGVybm8gZGVsIHNpc3RlbWEuIFNlcnZpY2lvIHRlbXBvcmFsbWVudGUgbm8gZGlzcG9uaWJsZS4nKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBSZWludGVudGFuZG8gZ2V0Um9vbSAoaW50ZW50byAke2F0dGVtcHRHZXRSb29tICsgMX0vJHttYXhSZXRyaWVzR2V0Um9vbX0pYCk7XHJcbiAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwICogTWF0aC5wb3coMiwgYXR0ZW1wdEdldFJvb20pKSk7IC8vIEV4cG9uZW50aWFsIGJhY2tvZmZcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhyb3cgZXJyb3I7IC8vIFJlLXRocm93IG90aGVyIGVycm9yc1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFyb29tUmVzcG9uc2UgfHwgIXJvb21SZXNwb25zZS5JdGVtKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignU2FsYSBubyBlbmNvbnRyYWRhJyk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgcm9vbSA9IHJvb21SZXNwb25zZS5JdGVtO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIGlkOiByb29tLnJvb21JZCxcclxuICAgICAgbmFtZTogcm9vbS5uYW1lIHx8ICdTYWxhIHNpbiBub21icmUnLFxyXG4gICAgICBkZXNjcmlwdGlvbjogcm9vbS5kZXNjcmlwdGlvbixcclxuICAgICAgc3RhdHVzOiByb29tLnN0YXR1cyxcclxuICAgICAgcmVzdWx0TW92aWVJZDogcm9vbS5yZXN1bHRNb3ZpZUlkLFxyXG4gICAgICBob3N0SWQ6IHJvb20uaG9zdElkLFxyXG4gICAgICBpbnZpdGVDb2RlOiByb29tLmludml0ZUNvZGUsXHJcbiAgICAgIGludml0ZVVybDogcm9vbS5pbnZpdGVVcmwsXHJcbiAgICAgIGdlbnJlUHJlZmVyZW5jZXM6IHJvb20uZ2VucmVQcmVmZXJlbmNlcyxcclxuICAgICAgbWVkaWFUeXBlOiByb29tLm1lZGlhVHlwZSxcclxuICAgICAgZ2VucmVJZHM6IHJvb20uZ2VucmVJZHMsXHJcbiAgICAgIGdlbnJlTmFtZXM6IHJvb20uZ2VucmVOYW1lcyxcclxuICAgICAgY29udGVudElkczogcm9vbS5jb250ZW50SWRzLFxyXG4gICAgICBzaG93bkNvbnRlbnRJZHM6IHJvb20uc2hvd25Db250ZW50SWRzLFxyXG4gICAgICBjdXJyZW50Q29udGVudEluZGV4OiByb29tLmN1cnJlbnRDb250ZW50SW5kZXgsXHJcbiAgICAgIGZpbHRlckNyaXRlcmlhOiByb29tLmZpbHRlckNyaXRlcmlhLFxyXG4gICAgICBleGNsdWRlZENvbnRlbnRJZHM6IHJvb20uZXhjbHVkZWRDb250ZW50SWRzLFxyXG4gICAgICBsYXN0Q29udGVudFJlZnJlc2g6IHJvb20ubGFzdENvbnRlbnRSZWZyZXNoLFxyXG4gICAgICBpc0FjdGl2ZTogcm9vbS5pc0FjdGl2ZSAhPT0gZmFsc2UsXHJcbiAgICAgIGlzUHJpdmF0ZTogcm9vbS5pc1ByaXZhdGUgfHwgZmFsc2UsXHJcbiAgICAgIG1lbWJlckNvdW50OiByb29tLm1lbWJlckNvdW50IHx8IDEsXHJcbiAgICAgIG1heE1lbWJlcnM6IHJvb20ubWF4TWVtYmVycyxcclxuICAgICAgbWF0Y2hDb3VudDogcm9vbS5tYXRjaENvdW50IHx8IDAsXHJcbiAgICAgIGNyZWF0ZWRBdDogcm9vbS5jcmVhdGVkQXQgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICB1cGRhdGVkQXQ6IHJvb20udXBkYXRlZEF0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgIH07XHJcblxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKGDinYwgRXJyb3Igb2J0ZW5pZW5kbyBzYWxhICR7cm9vbUlkfTpgLCBlcnJvcik7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn0iXX0=