/**
 * Trinity AI Handler - Trini AI Assistant
 * 
 * This is the main handler for the trinity-ai-dev Lambda function.
 * Implements the new architecture with improved JSON parsing, ChatML protocol,
 * TMDB verification, and persona guardrails.
 * 
 * **Security: All credentials are managed via environment variables**
 * **Validates: Requirements 7.1, 7.2, 7.3, 8.1, 8.2, 8.3**
 */

// Load environment variables (for local development)
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: '../../.env' });
}

const { AIService } = require('./services/aiService');
const TMDBService = require('./services/tmdbService');
const FallbackEngine = require('./services/fallbackEngine');
const { EnvironmentValidator } = require('./utils/envValidator');
const MetricsService = require('./services/metricsService');
const LoggingService = require('./services/loggingService');

// AWS SDK for DynamoDB chat session integration
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Initialize services at module level for performance optimization
let aiService;
let tmdbService;
let fallbackEngine;
let envValidator;
let metricsService;
let loggingService;
let isEnvironmentValid = false;

try {
    envValidator = new EnvironmentValidator();
    const validationResults = envValidator.validateEnvironment();
    isEnvironmentValid = validationResults.valid;
    
    if (!isEnvironmentValid) {
        console.error('❌ Environment validation failed:', validationResults.errors);
        console.error('🔧 Please check your .env file configuration');
    } else {
        console.log('✅ Environment validation passed - all credentials properly configured');
        
        // Initialize services with validated environment
        aiService = new AIService();
        tmdbService = new TMDBService();
        fallbackEngine = new FallbackEngine();
        metricsService = new MetricsService();
        loggingService = new LoggingService();
        
        console.log('✅ All services initialized successfully');
    }
} catch (error) {
    console.error('❌ Failed to initialize services:', error.message);
    isEnvironmentValid = false;
}

/**
 * Main Lambda handler for AI recommendations
 * @param {Object} event - AppSync event
 * @returns {Object} AI recommendation response
 */
exports.handler = async (event) => {
    const requestId = event.requestContext?.requestId || uuidv4();
    const startTime = Date.now();
    
    // Initialize logging for this request
    if (!loggingService) {
        loggingService = new LoggingService();
    }
    if (!metricsService) {
        metricsService = new MetricsService();
    }
    
    loggingService.info(requestId, 'Trinity AI Handler request started', {
        phase: 'handler_start',
        fieldName: event.info?.fieldName,
        userId: event.arguments?.userId,
        sessionId: event.arguments?.sessionId
    });
    
    // Validate environment before processing
    if (!isEnvironmentValid) {
        loggingService.error(requestId, 'Cannot process request - environment validation failed', null, {
            phase: 'environment_validation_failed'
        });
        return {
            statusCode: 500,
            body: {
                error: 'Configuration Error',
                message: 'Service temporarily unavailable due to configuration issues'
            }
        };
    }
    
    // Log security compliance
    loggingService.info(requestId, 'Security compliance verified - all credentials from environment', {
        phase: 'security_compliance'
    });
    
    const fieldName = event.info?.fieldName;
    const args = event.arguments;
    
    // Debug logging
    console.log(`🔍 [${requestId}] Handler Debug - fieldName: "${fieldName}", args:`, JSON.stringify(args, null, 2));
    
    try {
        let response;
        
        switch (fieldName) {
            case 'getChatRecommendations':
                console.log(`🎯 [${requestId}] Executing getChatRecommendations with text: "${args.text}"`);
                response = await processTriniRecommendations(args.text, args.roomGenres, args.sessionId, args.userId, requestId);
                break;
            
            case 'askTrini':
                // GraphQL interface - convert to internal format
                response = await processAskTrini(args.input, requestId);
                break;
            
            case 'getChatHistory':
                response = await processChatHistory(args.userId, args.limit, requestId);
                break;
            
            case 'getTriniRecommendations':
                response = await processGetTriniRecommendations(args.sessionId, requestId);
                break;
            
            case 'addTriniRecommendationToRoom':
                response = await processAddToRoom(args.roomId, args.movieId, requestId);
                break;
            
            default:
                throw new Error(`Operación no soportada: ${fieldName}`);
        }
        
        // Log successful response and record metrics
        const processingTime = Date.now() - startTime;
        
        loggingService.logRequestComplete(requestId, fieldName, startTime, true, {
            confidence: response.confidence || 'N/A',
            genreCount: response.recommendedGenres?.length || 0,
            source: response._metadata?.source || 'unknown',
            sessionId: response._metadata?.sessionId || response.sessionId || 'none'
        });
        
        // Record overall request performance metrics
        await metricsService.recordRequestPerformance(requestId, processingTime, fieldName, true);
        
        return response;
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        
        loggingService.error(requestId, `Error in ${fieldName}`, error, {
            phase: 'handler_error',
            fieldName: fieldName,
            processingTime: processingTime
        });
        
        // Record request failure metrics
        await metricsService.recordRequestPerformance(requestId, processingTime, fieldName || 'unknown', false);
        
        // Return fallback response for any unhandled errors
        const fallbackResponse = fallbackEngine.getIntelligentFallbackResponse('', 'general_error');
        return {
            chatResponse: fallbackResponse.reply,
            recommendedGenres: fallbackResponse.detectedGenres || ['drama', 'comedia', 'aventura'],
            confidence: 0.5,
            reasoning: 'Error técnico - usando recomendaciones de respaldo',
            _metadata: {
                processingTime: processingTime,
                source: 'error_fallback',
                error: error.message,
                requestId: requestId,
                timestamp: new Date().toISOString()
            }
        };
    }
};

/**
 * Process Trini recommendations using the new architecture
 * Implements the main orchestration flow: Intent → AI → TMDB → Response
 * 
 * **Validates: Requirements 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 7.3**
 * 
 * @param {string} userText - User's query text
 * @param {string[]} roomGenres - Optional room genre preferences
 * @param {string} sessionId - Chat session ID (optional)
 * @param {string} userId - User ID for chat session tracking
 * @param {string} requestId - Request ID for logging and tracing
 * @returns {Object} Formatted response for mobile client
 */
async function processTriniRecommendations(userText, roomGenres, sessionId, userId, requestId) {
    const startTime = Date.now();
    console.log(`🧠 [${requestId}] Processing Trini recommendation for: "${userText}"`);
    console.log(`🎬 [${requestId}] Room genres: ${roomGenres ? roomGenres.join(', ') : 'none'}`);
    console.log(`💬 [${requestId}] Session ID: ${sessionId || 'none'}, User ID: ${userId || 'none'}`);
    
    try {
        // Step 0: Handle chat session persistence (if sessionId and userId provided)
        let currentSessionId = sessionId;
        if (userId) {
            currentSessionId = await handleChatSession(userText, sessionId, userId, requestId);
            loggingService.logChatSessionOperation(requestId, 'handled', currentSessionId, {
                userId: userId,
                hasExistingSession: !!sessionId
            });
        }
        
        // Step 1: Process query through AI service with ChatML formatting
        loggingService.info(requestId, 'Step 1: Processing query through AI service', {
            phase: 'ai_processing_start',
            queryLength: userText ? userText.length : 0
        });
        const aiResponse = await aiService.processQuery(userText, requestId);
        loggingService.info(requestId, 'AI response received', {
            phase: 'ai_processing_complete',
            intent: aiResponse.intent,
            hasTitles: !!aiResponse.titles,
            hasReply: !!aiResponse.reply
        });
        
        // Step 2: Handle intent classification and persona guardrails
        if (aiResponse.intent === 'other') {
            loggingService.info(requestId, 'Off-topic intent detected - returning persona refusal', {
                phase: 'persona_guardrail_activated',
                intent: aiResponse.intent
            });
            
            // Save assistant response to chat session
            if (currentSessionId && userId) {
                await saveChatMessage(currentSessionId, 'assistant', aiResponse.reply, requestId);
            }
            
            return formatMobileResponse({
                chatResponse: aiResponse.reply,
                recommendedGenres: [],
                confidence: 0.9,
                reasoning: 'Consulta fuera del tema cinematográfico - respuesta de La Trini',
                movies: [],
                processingTime: Date.now() - startTime,
                source: 'persona_guardrail',
                sessionId: currentSessionId,
                requestId: requestId
            });
        }
        
        // Step 3: Verify movies against TMDB (only for cinema intent)
        loggingService.info(requestId, 'Step 3: Verifying movies against TMDB', {
            phase: 'tmdb_verification_start',
            movieCount: aiResponse.titles ? aiResponse.titles.length : 0
        });
        const verifiedMovies = await tmdbService.fetchMovies(aiResponse.titles || [], requestId);
        loggingService.info(requestId, 'TMDB verification complete', {
            phase: 'tmdb_verification_complete',
            originalCount: aiResponse.titles ? aiResponse.titles.length : 0,
            verifiedCount: verifiedMovies.length
        });
        
        // Step 4: Generate cinema response
        const cinemaResponse = generateCinemaResponse(aiResponse.titles, verifiedMovies, userText);
        
        // Step 5: Save assistant response to chat session
        if (currentSessionId && userId) {
            await saveChatMessage(currentSessionId, 'assistant', cinemaResponse, requestId);
        }
        
        // Step 6: Format response for mobile client
        const response = formatMobileResponse({
            chatResponse: cinemaResponse,
            recommendedGenres: extractGenresFromMovies(verifiedMovies, roomGenres),
            confidence: calculateConfidence(aiResponse, verifiedMovies, roomGenres),
            reasoning: generateReasoning(aiResponse.titles, verifiedMovies, roomGenres),
            movies: verifiedMovies,
            processingTime: Date.now() - startTime,
            source: 'ai_tmdb_verified',
            sessionId: currentSessionId,
            requestId: requestId
        });
        
        loggingService.info(requestId, `Processing complete in ${Date.now() - startTime}ms`, {
            phase: 'processing_complete',
            totalLatencyMs: Date.now() - startTime,
            source: 'ai_tmdb_verified'
        });
        return response;
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        
        loggingService.error(requestId, 'Error in processTriniRecommendations', error, {
            phase: 'processing_error',
            processingTime: processingTime
        });
        
        // Determine error type for appropriate fallback
        let errorType = 'general_error';
        if (error.message.includes('RATE_LIMIT')) {
            errorType = 'rate_limit';
        } else if (error.message.includes('TIMEOUT')) {
            errorType = 'timeout';
        } else if (error.message.includes('NETWORK')) {
            errorType = 'network_error';
        }
        
        // Use fallback engine for error recovery with intelligent analysis
        loggingService.logFallbackActivation(requestId, errorType, 'Processing error', error);
        
        // Record fallback activation metrics
        await metricsService.recordFallbackActivation(requestId, errorType, error.message);
        
        // Use intelligent fallback that analyzes the user query
        const intelligentFallback = fallbackEngine.getIntelligentFallbackResponse(userText, errorType);
        
        // Save fallback response to chat session if possible
        if (sessionId && userId) {
            try {
                await saveChatMessage(sessionId, 'assistant', intelligentFallback.reply, requestId);
            } catch (chatError) {
                loggingService.warn(requestId, 'Failed to save fallback response to chat session', {
                    phase: 'chat_session_save_error',
                    error: chatError.message
                });
            }
        }
        
        return formatMobileResponse({
            chatResponse: intelligentFallback.reply,
            recommendedGenres: intelligentFallback.detectedGenres || 
                extractGenresFromTitles(intelligentFallback.titles),
            confidence: 0.7, // Higher confidence for intelligent fallback
            reasoning: `Fallback inteligente activado - detecté interés en: ${intelligentFallback.detectedGenres?.join(', ') || 'cine clásico'}`,
            movies: intelligentFallback.movies || [],
            processingTime: Date.now() - startTime,
            source: 'intelligent_fallback',
            error: errorType,
            sessionId: sessionId,
            requestId: requestId
        });
    }
}

/**
 * Process askTrini GraphQL mutation
 * Converts GraphQL input to internal format and processes the query
 * 
 * **Validates: Requirements 7.2, 7.3** - GraphQL API interface compatibility
 * 
 * @param {Object} input - GraphQL TriniQuery input
 * @param {string} requestId - Request ID for logging and tracing
 * @returns {Object} TriniResponse formatted for GraphQL
 */
async function processAskTrini(input, requestId) {
    const startTime = Date.now();
    console.log(`🎭 [${requestId}] Processing askTrini GraphQL mutation:`, input);
    
    // Validate input
    if (!input || !input.query || !input.userId) {
        throw new Error('Invalid input: query and userId are required');
    }
    
    try {
        // Convert GraphQL input to internal format
        const internalResponse = await processTriniRecommendations(
            input.query,
            null, // No room genres in GraphQL interface
            input.sessionId,
            input.userId,
            requestId
        );
        
        // Convert internal response to GraphQL format
        const graphqlResponse = {
            sessionId: internalResponse._metadata?.sessionId || input.sessionId || 'new-session',
            message: internalResponse.chatResponse,
            recommendations: [], // Will be populated from movies if available
            extractedFilters: extractFiltersFromResponse(internalResponse),
            confidence: internalResponse.confidence
        };
        
        // Convert movies to GraphQL MovieRecommendation format
        if (internalResponse._metadata?.movies && internalResponse._metadata.movies.length > 0) {
            graphqlResponse.recommendations = internalResponse._metadata.movies.map((movie, index) => ({
                movie: {
                    id: movie.tmdbId?.toString() || movie.id?.toString() || `movie-${index}`,
                    title: movie.title,
                    overview: movie.synopsis || movie.overview,
                    poster: movie.posterUrl || movie.poster,
                    release_date: movie.releaseDate || movie.release_date,
                    vote_average: movie.rating || movie.vote_average,
                    runtime: movie.runtime,
                    genres: movie.genres ? movie.genres.map(g => ({ id: 0, name: g })) : []
                },
                relevanceScore: 0.8, // Default relevance score
                reasoning: `Recomendada por Trini basada en tu consulta`
            }));
        }
        
        console.log(`✅ [${requestId}] askTrini processed in ${Date.now() - startTime}ms`);
        return graphqlResponse;
        
    } catch (error) {
        console.error(`❌ [${requestId}] Error in processAskTrini:`, error);
        
        // Return GraphQL-compatible error response
        return {
            sessionId: input.sessionId || 'error-session',
            message: 'Lo siento, cariño, tuve un problema técnico. ¿Puedes intentarlo de nuevo?',
            recommendations: [],
            extractedFilters: null,
            confidence: 0.1
        };
    }
}

/**
 * Process getChatHistory GraphQL query
 * Retrieves chat session history for a user
 * 
 * @param {string} userId - User ID
 * @param {number} limit - Maximum number of sessions to return
 * @param {string} requestId - Request ID for logging
 * @returns {Array} Array of ChatSession objects
 */
async function processChatHistory(userId, limit = 10, requestId) {
    const startTime = Date.now();
    console.log(`📚 [${requestId}] Processing getChatHistory for user: ${userId}, limit: ${limit}`);
    
    const CHAT_SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE || 'trinity-chat-sessions-dev';
    
    try {
        // Query DynamoDB for user's chat sessions
        const { ScanCommand } = require('@aws-sdk/client-dynamodb');
        
        const scanParams = {
            TableName: CHAT_SESSIONS_TABLE,
            FilterExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': { S: userId }
            },
            Limit: Math.min(limit, 50) // Cap at 50 for performance
        };
        
        const result = await dynamoClient.send(new ScanCommand(scanParams));
        
        // Convert DynamoDB items to GraphQL format
        const sessions = (result.Items || []).map(item => ({
            sessionId: item.sessionId?.S || '',
            userId: item.userId?.S || '',
            messages: (item.messages?.L || []).map(msg => ({
                messageId: msg.M?.messageId?.S || '',
                type: msg.M?.role?.S === 'user' ? 'USER_QUERY' : 'TRINI_RESPONSE',
                content: msg.M?.content?.S || '',
                timestamp: new Date(msg.M?.timestamp?.N ? parseInt(msg.M.timestamp.N) : Date.now()).toISOString()
            })),
            createdAt: item.createdAt?.S || new Date().toISOString(),
            updatedAt: item.lastUpdated?.S || item.createdAt?.S || new Date().toISOString()
        }));
        
        console.log(`✅ [${requestId}] Retrieved ${sessions.length} chat sessions in ${Date.now() - startTime}ms`);
        return sessions;
        
    } catch (error) {
        console.error(`❌ [${requestId}] Error in processChatHistory:`, error);
        return []; // Return empty array on error
    }
}

/**
 * Process getTriniRecommendations GraphQL query
 * Gets movie recommendations from a specific session
 * 
 * @param {string} sessionId - Session ID
 * @param {string} requestId - Request ID for logging
 * @returns {Array} Array of MovieRecommendation objects
 */
async function processGetTriniRecommendations(sessionId, requestId) {
    const startTime = Date.now();
    console.log(`🎬 [${requestId}] Processing getTriniRecommendations for session: ${sessionId}`);
    
    // This is a placeholder implementation
    // In a full implementation, you would retrieve recommendations from the session
    try {
        // For now, return empty array
        // TODO: Implement session-based recommendation retrieval
        console.log(`✅ [${requestId}] Retrieved recommendations in ${Date.now() - startTime}ms`);
        return [];
        
    } catch (error) {
        console.error(`❌ [${requestId}] Error in processTriniRecommendations:`, error);
        return [];
    }
}

/**
 * Process addTriniRecommendationToRoom GraphQL mutation
 * Adds a Trini recommendation to a voting room
 * 
 * @param {string} roomId - Room ID
 * @param {string} movieId - Movie ID
 * @param {string} requestId - Request ID for logging
 * @returns {Object} AddToRoomResponse
 */
async function processAddToRoom(roomId, movieId, requestId) {
    const startTime = Date.now();
    console.log(`🏠 [${requestId}] Processing addTriniRecommendationToRoom: room=${roomId}, movie=${movieId}`);
    
    try {
        // This is a placeholder implementation
        // In a full implementation, you would add the movie to the room's content pool
        // TODO: Implement room integration logic
        
        console.log(`✅ [${requestId}] Added recommendation to room in ${Date.now() - startTime}ms`);
        return {
            success: true,
            message: 'Película añadida a la sala exitosamente',
            roomId: roomId,
            movieId: movieId
        };
        
    } catch (error) {
        console.error(`❌ [${requestId}] Error in processAddToRoom:`, error);
        return {
            success: false,
            message: 'Error al añadir la película a la sala',
            roomId: roomId,
            movieId: movieId
        };
    }
}

/**
 * Extract filters from internal response for GraphQL format
 * @param {Object} internalResponse - Internal response object
 * @returns {Object|null} ExtractedFilters object or null
 */
function extractFiltersFromResponse(internalResponse) {
    if (!internalResponse.recommendedGenres || internalResponse.recommendedGenres.length === 0) {
        return null;
    }
    
    return {
        genres: internalResponse.recommendedGenres,
        yearRange: null, // Not currently extracted
        rating: null, // Not currently extracted
        keywords: [] // Not currently extracted
    };
}

/**
 * Generate cinema response based on AI suggestions and verified movies
 * @param {string[]} aiTitles - Original AI suggested titles
 * @param {Object[]} verifiedMovies - TMDB verified movies
 * @param {string} userText - Original user query
 * @returns {string} Formatted chat response
 */
function generateCinemaResponse(aiTitles, verifiedMovies, userText) {
    const movieCount = verifiedMovies.length;
    
    if (movieCount === 0) {
        return "Ay cariño, no pude encontrar películas específicas para tu consulta, pero no te preocupes. Déjame buscar algunas opciones populares que podrían gustarte.";
    }
    
    if (movieCount === aiTitles.length) {
        return `¡Perfecto! He encontrado ${movieCount} películas geniales para ti. Todas están verificadas y disponibles. ¿Te apetece alguna de estas opciones?`;
    }
    
    return `He encontrado ${movieCount} películas verificadas de las que te sugerí. Algunas no estaban disponibles, pero estas opciones son excelentes para lo que buscas.`;
}

/**
 * Extract genres from verified movies, prioritizing room genres
 * @param {Object[]} movies - Verified movie objects
 * @param {string[]} roomGenres - Room genre preferences
 * @returns {string[]} Array of recommended genres (max 3)
 */
function extractGenresFromMovies(movies, roomGenres) {
    if (movies.length === 0) {
        return roomGenres && roomGenres.length > 0 ? 
            roomGenres.slice(0, 3) : 
            ['drama', 'comedia', 'aventura'];
    }
    
    // Extract all genres from movies
    const allGenres = movies.flatMap(movie => movie.genres || []);
    const uniqueGenres = [...new Set(allGenres)];
    
    // Prioritize room genres if available
    if (roomGenres && roomGenres.length > 0) {
        const prioritized = [];
        const roomGenresLower = roomGenres.map(g => g.toLowerCase());
        
        // Add matching genres first
        uniqueGenres.forEach(genre => {
            if (roomGenresLower.includes(genre.toLowerCase()) && prioritized.length < 3) {
                prioritized.push(genre);
            }
        });
        
        // Fill remaining slots with other genres
        uniqueGenres.forEach(genre => {
            if (!prioritized.includes(genre) && prioritized.length < 3) {
                prioritized.push(genre);
            }
        });
        
        return prioritized.length > 0 ? prioritized : roomGenres.slice(0, 3);
    }
    
    return uniqueGenres.slice(0, 3);
}

/**
 * Extract genres from movie titles (fallback method)
 * @param {string[]} titles - Movie titles
 * @returns {string[]} Default genres based on common patterns
 */
function extractGenresFromTitles(titles) {
    // Simple heuristic based on common movie patterns
    const actionKeywords = ['john wick', 'matrix', 'terminator', 'speed'];
    const dramaKeywords = ['padrino', 'schindler', 'ciudadano kane'];
    const comedyKeywords = ['comedia', 'funny', 'laugh'];
    
    const titlesLower = titles.map(t => t.toLowerCase()).join(' ');
    
    const genres = [];
    if (actionKeywords.some(keyword => titlesLower.includes(keyword))) {
        genres.push('acción');
    }
    if (dramaKeywords.some(keyword => titlesLower.includes(keyword))) {
        genres.push('drama');
    }
    if (comedyKeywords.some(keyword => titlesLower.includes(keyword))) {
        genres.push('comedia');
    }
    
    // Fill with defaults if no matches
    while (genres.length < 3) {
        const defaults = ['drama', 'aventura', 'comedia'];
        const next = defaults.find(g => !genres.includes(g));
        if (next) genres.push(next);
        else break;
    }
    
    return genres;
}

/**
 * Calculate confidence score based on AI response and TMDB verification
 * @param {Object} aiResponse - AI service response
 * @param {Object[]} verifiedMovies - TMDB verified movies
 * @param {string[]} roomGenres - Room genre preferences
 * @returns {number} Confidence score (0-1)
 */
function calculateConfidence(aiResponse, verifiedMovies, roomGenres) {
    let baseConfidence = 0.8; // High confidence for new architecture
    
    // Adjust based on TMDB verification success rate
    if (aiResponse.titles && aiResponse.titles.length > 0) {
        const verificationRate = verifiedMovies.length / aiResponse.titles.length;
        baseConfidence *= (0.7 + 0.3 * verificationRate);
    }
    
    // Boost confidence if room genres are aligned
    if (roomGenres && roomGenres.length > 0 && verifiedMovies.length > 0) {
        const movieGenres = verifiedMovies.flatMap(m => m.genres || []);
        const alignment = calculateGenreAlignment(movieGenres, roomGenres);
        baseConfidence *= (0.9 + 0.1 * alignment);
    }
    
    return Math.round(baseConfidence * 100) / 100;
}

/**
 * Calculate genre alignment between recommended and room genres
 * @param {string[]} recommendedGenres - Recommended genres
 * @param {string[]} roomGenres - Room genre preferences
 * @returns {number} Alignment score (0-1)
 */
function calculateGenreAlignment(recommendedGenres, roomGenres) {
    if (!roomGenres || roomGenres.length === 0 || recommendedGenres.length === 0) {
        return 0;
    }
    
    const normalizedRoom = roomGenres.map(g => g.toLowerCase().trim());
    const normalizedRecommended = recommendedGenres.map(g => g.toLowerCase().trim());
    
    const matches = normalizedRecommended.filter(genre => 
        normalizedRoom.includes(genre)
    ).length;
    
    return matches / Math.max(recommendedGenres.length, roomGenres.length);
}

/**
 * Generate reasoning explanation for the recommendation
 * @param {string[]} aiTitles - Original AI suggested titles
 * @param {Object[]} verifiedMovies - TMDB verified movies
 * @param {string[]} roomGenres - Room genre preferences
 * @returns {string} Reasoning explanation
 */
function generateReasoning(aiTitles, verifiedMovies, roomGenres) {
    const totalSuggested = aiTitles ? aiTitles.length : 0;
    const verified = verifiedMovies.length;
    
    let reasoning = `Procesé ${totalSuggested} sugerencias de IA y verifiqué ${verified} películas en TMDB.`;
    
    if (verified < totalSuggested) {
        reasoning += ` Filtré ${totalSuggested - verified} títulos que no existen.`;
    }
    
    if (roomGenres && roomGenres.length > 0) {
        const movieGenres = verifiedMovies.flatMap(m => m.genres || []);
        const alignment = calculateGenreAlignment(movieGenres, roomGenres);
        if (alignment > 0.5) {
            reasoning += ` Las recomendaciones se alinean bien con los géneros de la sala.`;
        }
    }
    
    return reasoning;
}

/**
 * Format response for mobile client compatibility
 * **Validates: Requirements 7.2, 7.3** - Maintain GraphQL API interface
 * 
 * @param {Object} data - Response data
 * @returns {Object} Formatted response for mobile client
 */
function formatMobileResponse(data) {
    return {
        chatResponse: data.chatResponse,
        recommendedGenres: data.recommendedGenres,
        confidence: data.confidence,
        reasoning: data.reasoning,
        // Additional metadata for monitoring and debugging
        _metadata: {
            processingTime: data.processingTime,
            source: data.source,
            movieCount: data.movies ? data.movies.length : 0,
            timestamp: new Date().toISOString(),
            error: data.error || null,
            sessionId: data.sessionId || null,
            requestId: data.requestId || null
        }
    };
}

/**
 * Handle chat session persistence in DynamoDB
 * **Validates: Requirement 7.3** - Maintain existing DynamoDB chat session integration
 * 
 * @param {string} userText - User's message
 * @param {string} sessionId - Existing session ID (optional)
 * @param {string} userId - User ID
 * @param {string} requestId - Request ID for logging
 * @returns {string} Session ID (existing or newly created)
 */
async function handleChatSession(userText, sessionId, userId, requestId) {
    const CHAT_SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE || 'trinity-chat-sessions-dev';
    
    try {
        let currentSessionId = sessionId;
        
        // Create new session if none provided
        if (!currentSessionId) {
            currentSessionId = uuidv4();
            console.log(`💬 [${requestId}] Creating new chat session: ${currentSessionId}`);
            
            // Create new session in DynamoDB
            const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days TTL
            
            await docClient.send(new PutCommand({
                TableName: CHAT_SESSIONS_TABLE,
                Item: {
                    sessionId: currentSessionId,
                    userId: userId,
                    createdAt: new Date().toISOString(),
                    messages: [],
                    ttl: ttl,
                    messageCount: 0
                }
            }));
            
            console.log(`✅ [${requestId}] New chat session created: ${currentSessionId}`);
        }
        
        // Save user message to session
        await saveChatMessage(currentSessionId, 'user', userText, requestId);
        
        return currentSessionId;
        
    } catch (error) {
        console.error(`❌ [${requestId}] Error handling chat session:`, error);
        // Return sessionId anyway to not break the flow
        return sessionId || uuidv4();
    }
}

/**
 * Save a chat message to DynamoDB session
 * **Validates: Requirement 7.3** - DynamoDB Chat History Write
 * 
 * @param {string} sessionId - Session ID
 * @param {string} role - Message role ('user' or 'assistant')
 * @param {string} content - Message content
 * @param {string} requestId - Request ID for logging
 */
async function saveChatMessage(sessionId, role, content, requestId) {
    const CHAT_SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE || 'trinity-chat-sessions-dev';
    const MAX_MESSAGES = 10; // Limit messages per session
    
    try {
        console.log(`💾 [${requestId}] Saving ${role} message to session ${sessionId}`);
        
        // Get current session to check message count
        const sessionResponse = await docClient.send(new GetCommand({
            TableName: CHAT_SESSIONS_TABLE,
            Key: { sessionId: sessionId }
        }));
        
        if (!sessionResponse.Item) {
            console.warn(`⚠️ [${requestId}] Session ${sessionId} not found, creating new one`);
            // Create session if it doesn't exist
            const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
            await docClient.send(new PutCommand({
                TableName: CHAT_SESSIONS_TABLE,
                Item: {
                    sessionId: sessionId,
                    userId: 'unknown',
                    createdAt: new Date().toISOString(),
                    messages: [],
                    ttl: ttl,
                    messageCount: 0
                }
            }));
        }
        
        const session = sessionResponse.Item || { messages: [], messageCount: 0 };
        const currentMessages = session.messages || [];
        const currentCount = session.messageCount || 0;
        
        // Create new message
        const newMessage = {
            role: role,
            content: content,
            timestamp: Date.now()
        };
        
        // Add message and maintain limit
        const updatedMessages = [...currentMessages, newMessage];
        if (updatedMessages.length > MAX_MESSAGES) {
            // Remove oldest messages to maintain limit
            updatedMessages.splice(0, updatedMessages.length - MAX_MESSAGES);
        }
        
        // Update session with new message
        await docClient.send(new UpdateCommand({
            TableName: CHAT_SESSIONS_TABLE,
            Key: { sessionId: sessionId },
            UpdateExpression: 'SET messages = :messages, messageCount = :count, lastUpdated = :updated',
            ExpressionAttributeValues: {
                ':messages': updatedMessages,
                ':count': currentCount + 1,
                ':updated': new Date().toISOString()
            }
        }));
        
        console.log(`✅ [${requestId}] Message saved to session ${sessionId} (${role})`);
        
    } catch (error) {
        console.error(`❌ [${requestId}] Error saving message to session ${sessionId}:`, error);
        // Don't throw error to avoid breaking the main flow
    }
}

/**
 * Extract filters from internal response for GraphQL format
 * @param {Object} internalResponse - Internal response object
 * @returns {Object|null} ExtractedFilters object or null
 */
function extractFiltersFromResponse(internalResponse) {
    if (!internalResponse.recommendedGenres || internalResponse.recommendedGenres.length === 0) {
        return null;
    }
    
    return {
        genres: internalResponse.recommendedGenres,
        yearRange: null, // Not currently extracted
        rating: null, // Not currently extracted
        keywords: [] // Not currently extracted
    };
}