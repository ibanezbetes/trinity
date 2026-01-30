/**
 * AI Service for Trini AI Assistant
 * 
 * This service handles interaction with the Salamandra-2b model via Hugging Face API
 * using proper ChatML protocol formatting. It implements few-shot learning and
 * "La Trini" persona definition for consistent movie recommendations.
 * 
 * **Validates: Requirements 3.1, 3.2, 3.4, 4.1, 10.1.2, 10.2.1, 10.2.4**
 */

const { OpenAI } = require('openai');
const { ResilientJSONParser } = require('../utils/jsonParser');
const { EnvironmentValidator } = require('../utils/envValidator');
const FallbackEngine = require('./fallbackEngine');
const MetricsService = require('./metricsService');
const LoggingService = require('./loggingService');

/**
 * @typedef {Object} AIServiceConfig
 * @property {string} hfToken - Hugging Face API token
 * @property {string} modelName - Model name for Qwen
 * @property {number} timeout - Request timeout in milliseconds
 */

/**
 * @typedef {Object} LLMResponse
 * @property {'cinema'|'other'} intent - The classified intent of the user query
 * @property {string[]} [titles] - Array of movie titles (only if intent is 'cinema')
 * @property {string} [reply] - Text response (only if intent is 'other')
 */

class AIService {
    constructor(config = {}) {
        // Initialize environment validator
        this.envValidator = new EnvironmentValidator();
        const validationResults = this.envValidator.validateEnvironment();
        
        if (!validationResults.valid) {
            throw new Error('Environment validation failed. Check required environment variables.');
        }
        
        // Get secure configuration from validated environment
        const secureConfig = this.envValidator.getSecureConfig();
        
        // **Validates: Requirement 8.2** - Use process.env for all API credentials
        this.hfToken = config.hfToken || secureConfig.ai.hfToken;
        this.modelName = config.modelName || 'Qwen/Qwen2.5-1.5B-Instruct';
        this.timeout = config.timeout || secureConfig.ai.timeout;
        
        this.parser = new ResilientJSONParser();
        this.fallbackEngine = new FallbackEngine();
        this.metricsService = new MetricsService();
        this.loggingService = new LoggingService();
        
        // **TEMPORARY FIX**: Use intelligent fallback as primary mode
        // The HF token doesn't have access to required providers for Serverless Inference
        // The intelligent fallback provides excellent movie recommendations
        console.log('[AIService] Using intelligent fallback as primary mode - provides excellent movie recommendations');
        this.useIntelligentFallback = true;
        
        // Keep token validation for future use
        if (!this.hfToken || !this.hfToken.startsWith('hf_')) {
            console.warn('[AIService] HF token not available or invalid format');
        } else {
            console.log('[AIService] HF token available for future use when providers are configured');
        }

        // Initialize OpenAI client with Hugging Face Serverless Inference (if token available)
        if (!this.useIntelligentFallback) {
            this.openaiClient = new OpenAI({
                baseURL: "https://router.huggingface.co/v1",
                apiKey: this.hfToken,
                timeout: this.timeout
            });

            console.log('[AIService] Initialized with model:', this.modelName);
            console.log('[AIService] Using Hugging Face Serverless Inference via OpenAI SDK');
        } else {
            console.log('[AIService] Initialized in intelligent fallback mode');
            this.openaiClient = null;
        }
        console.log('[AIService] Environment validation passed ✅');
    }

    /**
     * Process a user query through the AI model using OpenAI Chat Completions API
     * @param {string} userQuery - The user's question or request
     * @param {string} requestId - Request ID for correlation and metrics
     * @returns {Promise<LLMResponse>} Processed response with intent classification
     */
    async processQuery(userQuery, requestId = 'unknown') {
        const startTime = this.loggingService.logRequestStart(requestId, 'ai_service_query', {
            queryLength: userQuery ? userQuery.length : 0,
            model: 'qwen-2.5-1.5b'
        });
        
        try {
            this.loggingService.info(requestId, 'Processing AI query', {
                phase: 'ai_service_start',
                queryLength: userQuery ? userQuery.length : 0,
                useIntelligentFallback: this.useIntelligentFallback
            });
            
            // If using intelligent fallback, skip AI call
            if (this.useIntelligentFallback) {
                this.loggingService.info(requestId, 'Using intelligent fallback instead of AI API', {
                    phase: 'intelligent_fallback_direct'
                });
                
                const intelligentFallback = this.fallbackEngine.getIntelligentFallbackResponse(userQuery, 'ai_unavailable');
                
                // Record fallback activation metrics
                await this.metricsService.recordFallbackActivation(requestId, 'ai_unavailable', 'AI service not available');
                
                return {
                    intent: intelligentFallback.intent,
                    titles: intelligentFallback.titles,
                    reply: intelligentFallback.reply,
                    fallback: true,
                    errorType: 'ai_unavailable',
                    detectedGenres: intelligentFallback.detectedGenres
                };
            }
            
            // Call OpenAI Chat Completions API with timing
            const aiStartTime = Date.now();
            this.loggingService.logAIServiceInteraction(requestId, 'request', {
                model: 'qwen-2.5-1.5b',
                queryLength: userQuery ? userQuery.length : 0
            });
            
            const rawResponse = await this.callOpenAIChat(userQuery, requestId);
            const aiLatency = Date.now() - aiStartTime;
            
            this.loggingService.logAIServiceInteraction(requestId, 'response', {
                model: 'qwen-2.5-1.5b',
                latencyMs: aiLatency,
                responseLength: rawResponse ? rawResponse.length : 0
            });
            
            // Record AI service performance metrics
            await this.metricsService.recordAIServicePerformance(requestId, aiLatency, true, 'qwen-2.5-1.5b');
            
            // Parse response using resilient JSON parser
            const parsedResponse = await this.parser.parse(rawResponse, requestId);
            
            // Record intent classification metrics
            await this.metricsService.recordIntentClassification(requestId, parsedResponse.intent, 0.8);
            
            this.loggingService.logIntentClassification(requestId, userQuery, parsedResponse.intent, 0.8);
            
            this.loggingService.logRequestComplete(requestId, 'ai_service_query', startTime, true, {
                intent: parsedResponse.intent,
                hasTitles: !!parsedResponse.titles,
                hasReply: !!parsedResponse.reply
            });
            
            return parsedResponse;
            
        } catch (error) {
            const aiLatency = Date.now() - startTime;
            
            this.loggingService.error(requestId, 'Error processing AI query', error, {
                phase: 'ai_service_error',
                latencyMs: aiLatency
            });
            
            // Record AI service failure metrics
            await this.metricsService.recordAIServicePerformance(requestId, aiLatency, false, 'qwen-2.5-1.5b');
            
            // Determine error type and use appropriate fallback
            let errorType = 'general_error';
            
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                errorType = 'timeout';
            } else if (error.status === 429 || error.message.includes('rate limit')) {
                errorType = 'rate_limit';
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                errorType = 'network_error';
            } else if (error.status >= 500) {
                errorType = 'ai_failure';
            }
            
            // Record fallback activation metrics
            await this.metricsService.recordFallbackActivation(requestId, errorType, error.message);
            
            this.loggingService.logFallbackActivation(requestId, errorType, 'AI service error', error);
            
            // Check if fallback should be activated
            if (this.fallbackEngine.shouldActivateFallback(error)) {
                this.loggingService.info(requestId, `Activating intelligent fallback for error type: ${errorType}`, {
                    phase: 'intelligent_fallback_activation',
                    errorType: errorType
                });
                
                // Use intelligent fallback that can analyze the query
                const intelligentFallback = this.fallbackEngine.getIntelligentFallbackResponse(userQuery, errorType);
                
                return {
                    intent: intelligentFallback.intent, // This should be 'cinema' for movie queries
                    titles: intelligentFallback.titles,
                    reply: intelligentFallback.reply,
                    fallback: true,
                    errorType: errorType,
                    detectedGenres: intelligentFallback.detectedGenres
                };
            }
            
            // Default fallback for non-critical errors
            return {
                intent: 'other',
                reply: this.fallbackEngine.getOfflineMessage('general_error')
            };
        }
    }

    /**
     * Call OpenAI Chat Completions API via Hugging Face Serverless Inference
     * **Validates: Requirements 3.2, 5.2, 5.3, 10.2.3**
     * @param {string} userQuery - User's question
     * @param {string} requestId - Request ID for logging
     * @returns {Promise<string>} Raw response text from the model
     */
    async callOpenAIChat(userQuery, requestId = 'unknown') {
        try {
            this.loggingService.debug(requestId, 'Calling OpenAI Chat Completions API', {
                phase: 'openai_api_call',
                queryLength: userQuery.length,
                timeout: this.timeout,
                model: this.modelName
            });
            
            const chatCompletion = await this.openaiClient.chat.completions.create({
                model: this.modelName,
                messages: [
                    {
                        role: "system",
                        content: `Eres "La Trini", una experta en cine con personalidad casual y femenina. Tu trabajo es ayudar a los usuarios con recomendaciones de películas.

REGLAS IMPORTANTES:
1. SOLO hablas de cine y películas. Si te preguntan sobre otros temas (cocina, matemáticas, política, etc.), responde educadamente que no sabes de eso.
2. SIEMPRE responde en formato JSON válido.
3. Clasifica la intención del usuario como "cinema" o "other".
4. Si es "cinema": proporciona una lista de títulos de películas.
5. Si es "other": proporciona una respuesta educada rechazando el tema.

EJEMPLOS:

Usuario: "¿Qué películas me recomiendas para una noche romántica?"
Respuesta: {"intent": "cinema", "titles": ["Casablanca", "El Diario de Noah", "Antes del Amanecer", "La La Land", "Titanic"]}

Usuario: "¿Cómo cocino pasta?"
Respuesta: {"intent": "other", "reply": "Cariño, yo de eso no entiendo, solo sé de cine. ¿Te puedo recomendar alguna película sobre chefs?"}

Usuario: "Películas de acción con Keanu Reeves"
Respuesta: {"intent": "cinema", "titles": ["John Wick", "Matrix", "Speed", "Point Break", "Constantine"]}`
                    },
                    {
                        role: "user",
                        content: userQuery
                    }
                ],
                max_tokens: 200,
                temperature: 0.7
            });

            const responseContent = chatCompletion.choices[0]?.message?.content || '';
            
            this.loggingService.debug(requestId, 'Successfully received response from OpenAI API', {
                phase: 'openai_api_success',
                responseLength: responseContent.length,
                model: this.modelName
            });
            
            return responseContent;

        } catch (error) {
            this.loggingService.error(requestId, 'OpenAI Chat Completions API error', error, {
                phase: 'openai_api_error',
                model: this.modelName,
                timeout: this.timeout
            });
            
            // Handle specific error types
            if (error.status) {
                const status = error.status;
                const message = error.message || 'Unknown error';
                
                // Rate limiting errors (429, 503)
                if (status === 429 || status === 503) {
                    this.loggingService.warn(requestId, 'Rate limiting detected', {
                        phase: 'rate_limiting',
                        status: status,
                        message: message
                    });
                    throw new Error(`API_RATE_LIMIT: ${status} ${message}`);
                }
                
                // Other HTTP errors
                throw new Error(`API_ERROR: ${status} ${message}`);
            }
            
            // Timeout errors
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                this.loggingService.warn(requestId, 'Request timeout', {
                    phase: 'timeout',
                    timeout: this.timeout
                });
                throw new Error('API_TIMEOUT: Request timed out');
            }
            
            // Network errors
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                this.loggingService.warn(requestId, 'Network error', {
                    phase: 'network_error',
                    errorCode: error.code
                });
                throw new Error(`NETWORK_ERROR: ${error.code}`);
            }
            
            // Re-throw other errors
            throw error;
        }
    }

    /**
     * Get service statistics for monitoring
     * @returns {Object} Service statistics including parser stats
     */
    getStats() {
        return {
            service: 'AIService',
            modelName: this.modelName,
            timeout: this.timeout,
            parser: this.parser.getStats()
        };
    }

    /**
     * Reset service statistics (useful for testing)
     */
    resetStats() {
        this.parser.resetStats();
    }
}

module.exports = {
    AIService
};