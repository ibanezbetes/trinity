"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
// Import content filtering services
const content_filter_service_1 = require("./services/content-filter-service");
const movieCacheService_1 = require("./services/movieCacheService");
const content_filtering_types_1 = require("./types/content-filtering-types");
// Import cache integration service
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
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
let lambdaClient = null;

function getContentFilterService() {
    if (!contentFilterService) {
        contentFilterService = new content_filter_service_1.ContentFilterService();
    }
    return contentFilterService;
}

function getLambdaClient() {
    if (!lambdaClient) {
        lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });
    }
    return lambdaClient;
}

/**
 * Updates room status to MATCHED and schedules cache cleanup
 * @param {string} roomId - Room identifier
 * @param {string} movieId - Matched movie ID
 * @returns {Promise<void>}
 */
async function updateRoomToMatched(roomId, movieId) {
    try {
        console.log(`🎉 Updating room ${roomId} to MATCHED status with movie ${movieId}`);
        
        // Update room status
        await docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { PK: roomId, SK: 'ROOM' },
            UpdateExpression: 'SET #status = :status, resultMovieId = :movieId, matchedAt = :now, updatedAt = :now',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': 'MATCHED',
                ':movieId': movieId,
                ':now': new Date().toISOString()
            }
        }));

        // Schedule cache cleanup for matched room
        await scheduleRoomCacheCleanup(roomId);
        
        console.log(`✅ Room ${roomId} updated to MATCHED status and cache cleanup scheduled`);

    } catch (error) {
        console.error(`❌ Error updating room ${roomId} to MATCHED status:`, error);
        throw error;
    }
}

/**
 * Schedules cache cleanup for a room (called when room reaches MATCHED status)
 * @param {string} roomId - Room identifier
 * @returns {Promise<void>}
 */
async function scheduleRoomCacheCleanup(roomId) {
    try {
        console.log(`🧹 Scheduling cache cleanup for room ${roomId}`);
        
        const payload = {
            action: 'scheduleCleanup',
            roomId,
            delayHours: 1
        };

        const command = new InvokeCommand({
            FunctionName: 'trinity-cache-dev',
            Payload: JSON.stringify(payload)
        });

        const client = getLambdaClient();
        const response = await client.send(command);
        const result = JSON.parse(new TextDecoder().decode(response.Payload));

        if (result.statusCode === 200) {
            const cleanupResult = JSON.parse(result.body);
            if (cleanupResult.success) {
                console.log(`✅ Cache cleanup scheduled for room ${roomId}`);
            } else {
                console.warn(`⚠️ Cache cleanup scheduling failed for room ${roomId}: ${cleanupResult.error}`);
            }
        } else {
            console.warn(`⚠️ Cache cleanup lambda returned status ${result.statusCode} for room ${roomId}`);
        }

    } catch (error) {
        console.error(`❌ Error scheduling cache cleanup for room ${roomId}:`, error);
        // Don't throw - cleanup scheduling failure shouldn't break main flow
    }
}

/**
 * Creates room movie cache using the cache lambda with 50-movie business logic
 * @param {string} roomId - Room identifier
 * @param {Object} filterCriteria - Filter criteria for the cache
 * @returns {Promise<Object>} Cache creation result
 */
async function createRoomMovieCache(roomId, filterCriteria) {
    try {
        console.log(`🎬 Creating 50-movie cache for room ${roomId} with business logic`);
        
        // Validate filter criteria according to business requirements
        if (!filterCriteria.mediaType || !['MOVIE', 'TV'].includes(filterCriteria.mediaType)) {
            throw new Error('Media type must be either MOVIE or TV (exclusive selection)');
        }

        if (!filterCriteria.genreIds || !Array.isArray(filterCriteria.genreIds)) {
            throw new Error('Genre IDs must be provided as an array');
        }

        if (filterCriteria.genreIds.length < 0 || filterCriteria.genreIds.length > 2) {
            throw new Error('Must select 0, 1, or 2 genres (0 = popular movies, 1-2 = specific genres)');
        }

        // Add room capacity for match detection
        const enhancedCriteria = {
            ...filterCriteria,
            roomCapacity: filterCriteria.roomCapacity || 2 // Default to 2-person room
        };
        
        const payload = {
            action: 'createCache',
            roomId,
            filterCriteria: enhancedCriteria
        };

        const command = new InvokeCommand({
            FunctionName: 'trinity-cache-dev',
            Payload: JSON.stringify(payload)
        });

        const client = getLambdaClient();
        const response = await client.send(command);
        const result = JSON.parse(new TextDecoder().decode(response.Payload));

        if (result.statusCode === 200) {
            const cacheResult = JSON.parse(result.body);
            if (cacheResult.success) {
                console.log(`✅ 50-movie cache created successfully for room ${roomId} with business logic`);
                console.log(`📊 Cache metadata: ${cacheResult.result.movieCount} movies, capacity: ${enhancedCriteria.roomCapacity}`);
                console.log(`🎯 Movie IDs available: ${cacheResult.result.movieIds ? cacheResult.result.movieIds.length : 0} movies`);
                return cacheResult.result;
            } else {
                throw new Error(`Cache creation failed: ${cacheResult.error}`);
            }
        } else {
            throw new Error(`Cache lambda returned status ${result.statusCode}: ${result.body}`);
        }

    } catch (error) {
        console.error(`❌ Error creating 50-movie cache for room ${roomId}:`, error);
        // Don't throw - cache creation failure shouldn't break room creation
        // The system will fall back to legacy movie loading
        return null;
    }
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
        if (input.genreIds && input.genreIds.length > 2) {
            throw new content_filtering_types_1.FilterValidationError('Maximum 2 genres allowed');
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
        // NEW: Handle content filtering with mediaType and genreIds using 50-movie cache system
        if (input.mediaType && input.genreIds !== undefined) {
            console.log(`🎯 New filtering system with 50-movie cache: ${input.mediaType}, genres: [${input.genreIds.join(', ')}]`);
            try {
                // Create filter criteria for 50-movie cache system
                filterCriteria = {
                    mediaType: input.mediaType,
                    genreIds: input.genreIds, // Use genreIds instead of genres for cache system
                    roomCapacity: input.maxMembers || 2, // Add room capacity for match detection
                    roomId
                };
                
                // Get content filtering service for genre names
                const contentService = getContentFilterService();
                
                // Load genre names for UI
                if (input.genreIds.length > 0) {
                    const availableGenres = await contentService.getAvailableGenres(filterCriteria.mediaType);
                    const genreMap = new Map(availableGenres.map(g => [g.id, g.name]));
                    genreNames = input.genreIds.map(id => genreMap.get(id) || 'Unknown');
                    console.log(`✅ Genre names mapped: ${genreNames.join(', ')}`);
                }

                // CRITICAL: CREATE 50-MOVIE CACHE DURING ROOM CREATION
                // This ensures all users see the SAME 50 movies in the SAME ORDER
                console.log(`🎬 Creating 50-movie cache for room ${roomId} with business logic filters`);
                
                const cacheResult = await createRoomMovieCache(roomId, filterCriteria);
                
                if (cacheResult && cacheResult.movieCount === 50) {
                    console.log(`✅ 50-movie cache created successfully for room ${roomId}`);
                    console.log(`📊 Cache contains exactly ${cacheResult.movieCount} movies with business logic applied`);
                    
                    // CRITICAL FIX: Get movie IDs from cache result for room storage
                    contentIds = cacheResult.movieIds || [];
                    
                    console.log(`🎯 Movie IDs extracted from cache: ${contentIds.length} movies`);
                    console.log(`🔍 First 5 movie IDs: [${contentIds.slice(0, 5).join(', ')}]`);
                    
                    // Log successful cache creation
                    console.log(`🎯 Room ${roomId} will use 50-movie cache system for consistent user experience with ${contentIds.length} movies`);
                } else {
                    console.warn(`⚠️ Cache creation failed or returned incorrect count for room ${roomId}, falling back to legacy system`);
                    
                    // FALLBACK: Use legacy content filtering system
                    const contentPool = await contentService.createFilteredRoom({
                        mediaType: filterCriteria.mediaType,
                        genres: filterCriteria.genreIds,
                        roomId
                    });
                    
                    // Limit to exactly 50 movies for consistency
                    const limitedContent = contentPool.slice(0, 50);
                    contentIds = limitedContent.map(content => content.tmdbId);
                    
                    console.log(`✅ FALLBACK: Loaded ${contentIds.length} movies using legacy system for room ${roomId}`);
                }
                
            }
            catch (error) {
                console.error('❌ 50-movie cache creation failed:', error);
                
                // FALLBACK: Use legacy content filtering system
                console.log(`🔄 FALLBACK: Using legacy content filtering for room ${roomId}`);
                
                try {
                    const contentService = getContentFilterService();
                    
                    // Create fallback filter criteria
                    const fallbackCriteria = {
                        mediaType: input.mediaType || 'movie',
                        genres: input.genreIds || [],
                        roomId
                    };
                    
                    const fallbackContentPool = await contentService.createFilteredRoom(fallbackCriteria);
                    
                    // Limit to exactly 50 movies for consistency
                    const fallbackLimitedContent = fallbackContentPool.slice(0, 50);
                    contentIds = fallbackLimitedContent.map(content => content.tmdbId);
                    
                    console.log(`✅ FALLBACK: Loaded ${contentIds.length} movies using legacy system for room ${roomId}`);
                    
                } catch (fallbackError) {
                    console.error('❌ FALLBACK also failed:', fallbackError);
                    
                    // Final fallback: Use popular movies
                    try {
                        const popularCriteria = {
                            mediaType: 'movie',
                            genres: [],
                            roomId
                        };
                        
                        const popularContentPool = await contentService.createFilteredRoom(popularCriteria);
                        const popularLimitedContent = popularContentPool.slice(0, 50);
                        contentIds = popularLimitedContent.map(content => content.tmdbId);
                        
                        console.log(`✅ FINAL FALLBACK: Loaded ${contentIds.length} popular movies for room ${roomId}`);
                        
                    } catch (finalError) {
                        console.error('❌ All fallbacks failed:', finalError);
                        
                        // FINAL EMERGENCY FALLBACK: Use hardcoded popular movie IDs
                        console.log(`🚨 EMERGENCY FALLBACK: Using hardcoded popular movies for room ${roomId}`);
                        
                        // Popular movie IDs that should always exist in TMDB
                        const emergencyMovieIds = [
                            '550', '680', '13', '122', '155', '157', '238', '240', '278', '424',
                            '429', '539', '598', '637', '680', '769', '857', '862', '863', '914',
                            '1124', '1891', '1892', '1893', '1894', '1895', '2062', '2080', '2109', '2157',
                            '8587', '9806', '10020', '10138', '10193', '11036', '11324', '11778', '12445', '13475',
                            '14160', '15121', '16869', '18785', '19995', '20526', '22538', '24428', '27205', '49026'
                        ];
                        
                        contentIds = emergencyMovieIds;
                        console.log(`✅ EMERGENCY FALLBACK: Loaded ${contentIds.length} hardcoded popular movies for room ${roomId}`);
                    }
                }
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
        
        // FINAL SAFETY CHECK: Ensure contentIds is never empty
        if (contentIds.length === 0) {
            console.log(`🚨 FINAL SAFETY CHECK: contentIds is empty for room ${roomId}, applying emergency fallback`);
            
            // Emergency fallback with popular movie IDs
            const emergencyMovieIds = [
                '550', '680', '13', '122', '155', '157', '238', '240', '278', '424',
                '429', '539', '598', '637', '680', '769', '857', '862', '863', '914',
                '1124', '1891', '1892', '1893', '1894', '1895', '2062', '2080', '2109', '2157',
                '8587', '9806', '10020', '10138', '10193', '11036', '11324', '11778', '12445', '13475',
                '14160', '15121', '16869', '18785', '19995', '20526', '22538', '24428', '27205', '49026'
            ];
            
            contentIds = emergencyMovieIds;
            console.log(`✅ FINAL SAFETY CHECK: Applied emergency fallback with ${contentIds.length} popular movies`);
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
            
            // CRITICAL: Store EXACTLY 50 movies for consistent experience
            preloadedMovies: contentIds.length > 0 ? contentIds : [], // All 50 movies stored here
            currentMovieIndex: 0, // Track which movie to show next (0-49)
            totalMovies: contentIds.length, // Total movies available (should be 50)
            moviesExhausted: false, // Flag to track if all 50 movies have been shown
            
            // Legacy fields (keep for backward compatibility)
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
        console.log(`✅ Room created: ${roomId} (${input.name}) by ${hostId} with ${contentIds.length} pre-loaded movies stored in room`);

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
        
        // NUEVO: Verificar límite de miembros antes de permitir unirse
        const maxMembers = room.maxMembers || 2; // Default a 2 si no está definido
        
        // Contar miembros activos actuales
        const currentMembers = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            KeyConditionExpression: 'roomId = :roomId',
            FilterExpression: 'isActive = :active',
            ExpressionAttributeValues: {
                ':roomId': roomId,
                ':active': true
            }
        }));
        
        const currentMemberCount = currentMembers.Items?.length || 0;
        
        console.log(`👥 Sala ${roomId}: ${currentMemberCount}/${maxMembers} miembros activos`);
        
        // Verificar si el usuario ya está en la sala
        const existingMember = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.ROOM_MEMBERS_TABLE,
            Key: { roomId, userId },
        }));
        
        // Si el usuario no es miembro existente, verificar límite
        if (!existingMember.Item && currentMemberCount >= maxMembers) {
            throw new Error(`La sala está llena (${maxMembers}/${maxMembers} miembros). No se pueden unir más usuarios.`);
        }
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
        
        console.log('🔍 createRoomSimple - Step 2: Pre-loading movies with default settings...');
        
        // CRITICAL FIX: Pre-load movies using 50-MOVIE CACHE SYSTEM
        // Use default settings: movie type with popular content (no specific genres)
        let contentIds = [];
        let filterCriteria;
        
        try {
            // Create default filter criteria for popular movies
            filterCriteria = {
                mediaType: 'MOVIE', // Use uppercase for consistency
                genreIds: [], // No specific genres = popular movies
                roomCapacity: 2, // Default room capacity
                roomId
            };
            
            console.log(`🎬 Creating 50-movie cache for simple room ${roomId} with popular movies`);
            
            // CRITICAL: CREATE 50-MOVIE CACHE DURING ROOM CREATION
            // This ensures all users see the SAME 50 movies in the SAME ORDER
            const cacheResult = await createRoomMovieCache(roomId, filterCriteria);
            
            if (cacheResult && cacheResult.movieCount === 50) {
                console.log(`✅ 50-movie cache created successfully for simple room ${roomId}`);
                console.log(`📊 Cache contains exactly ${cacheResult.movieCount} movies with business logic applied`);
                
                // CRITICAL FIX: Get movie IDs from cache result for room storage
                contentIds = cacheResult.movieIds || [];
                
                console.log(`🎯 Movie IDs extracted from cache: ${contentIds.length} movies`);
                console.log(`🔍 First 5 movie IDs: [${contentIds.slice(0, 5).join(', ')}]`);
                
                console.log(`🎯 Simple room ${roomId} will use 50-movie cache system for consistent user experience with ${contentIds.length} movies`);
            } else {
                console.warn(`⚠️ Cache creation failed for simple room ${roomId}, falling back to legacy system`);
                
                // FALLBACK: Use legacy content filtering system
                const contentService = getContentFilterService();
                const contentPool = await contentService.createFilteredRoom({
                    mediaType: 'movie',
                    genres: [], // No specific genres = popular movies
                    roomId
                });
                
                // Limit to exactly 50 movies for consistency
                const limitedContent = contentPool.slice(0, 50);
                contentIds = limitedContent.map(content => content.tmdbId);
                
                console.log(`✅ FALLBACK: Loaded ${contentIds.length} popular movies for simple room ${roomId}`);
            }
            
        } catch (error) {
            console.error('❌ Movie pre-loading failed for simple room:', error);
            // For simple rooms, we'll create with empty movies and let the system handle it
            contentIds = [];
            filterCriteria = undefined;
        }
        
        console.log('🔍 createRoomSimple - Step 3: Creating room object with pre-loaded movies...');
        
        // Crear sala en RoomsTable con valores por defecto + películas pre-cargadas
        const room = {
            id: roomId,
            name: name,
            description: 'Sala simple',
            status: 'WAITING',
            hostId,
            inviteCode: inviteLink.code,
            inviteUrl: inviteLink.url,
            
            // NEW: Movie pre-loading fields for individual voting system
            mediaType: 'MOVIE', // Use uppercase for consistency with cache system
            genreIds: [], // No specific genres for simple rooms
            genreNames: [], // No specific genre names
            
            // CRITICAL: Store EXACTLY 50 movies for consistent experience
            preloadedMovies: contentIds.length > 0 ? contentIds : [], // All 50 movies stored here
            currentMovieIndex: 0, // Track which movie to show next (0-49)
            totalMovies: contentIds.length, // Total movies available (should be 50)
            moviesExhausted: false, // Flag to track if all 50 movies have been shown
            
            // Legacy fields (keep for backward compatibility)
            contentIds: contentIds.length > 0 ? contentIds : [],
            shownContentIds: [], // Initialize empty
            currentContentIndex: 0, // Start at 0
            filterCriteria,
            excludedContentIds: [],
            lastContentRefresh: contentIds.length > 0 ? now : undefined,
            
            // Standard fields
            isActive: true,
            isPrivate: false,
            memberCount: 1, // El host cuenta como miembro
            maxMembers: 2, // Default to 2 for simple rooms (like voting system expects)
            matchCount: 0, // Initialize matchCount field
            createdAt: now,
            updatedAt: now,
        };
        console.log('✅ createRoomSimple - Step 3 SUCCESS: Room object created with pre-loaded movies');
        console.log('🔍 createRoomSimple - Step 4: Saving room to DynamoDB...');
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.ROOMS_TABLE,
            Item: {
                PK: roomId, // Add PK for DynamoDB primary key
                SK: 'ROOM', // Add SK for DynamoDB sort key
                roomId,
                ...room,
            },
        }));
        console.log('✅ createRoomSimple - Step 4 SUCCESS: Room saved to DynamoDB');
        console.log('🔍 createRoomSimple - Step 5: Adding host as member...');
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
        console.log('✅ createRoomSimple - Step 5 SUCCESS: Host added as member');
        console.log('🔍 createRoomSimple - Step 6: Logging business metric...');
        // Log business metric
        logBusinessMetric('ROOM_CREATED', roomId, hostId, {
            roomStatus: 'WAITING',
            roomName: name,
            isPrivate: false,
            simple: true,
            contentCount: contentIds.length,
            hasMoviePreloading: contentIds.length > 0
        });
        console.log('✅ createRoomSimple - Step 6 SUCCESS: Business metric logged');
        console.log(`✅ Sala simple creada: ${roomId} (${name}) por ${hostId} con ${contentIds.length} películas pre-cargadas`);
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
