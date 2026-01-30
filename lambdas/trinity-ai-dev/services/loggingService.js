/**
 * Structured Logging Service for Trini AI Assistant
 * 
 * This service provides structured, secure logging with requestId tracing
 * and performance timing for the Trini AI Assistant.
 * 
 * **Validates: Requirements 10.2.1, 10.2.2, 10.2.3, 10.2.4**
 * 
 * Key Features:
 * - Structured JSON logging for CloudWatch
 * - RequestId correlation across all log entries
 * - Secure logging (no API tokens or sensitive data)
 * - Performance timing logs
 * - Raw LLM response logging only on parsing failures
 */

class LoggingService {
    constructor() {
        this.serviceName = 'trinity-ai-dev';
        this.environment = process.env.NODE_ENV || 'dev';
    }

    /**
     * Create base log entry with common fields
     * @param {string} requestId - Request ID for correlation
     * @param {string} level - Log level (INFO, WARN, ERROR, DEBUG)
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     * @returns {Object} Structured log entry
     */
    createLogEntry(requestId, level, message, metadata = {}) {
        return {
            timestamp: new Date().toISOString(),
            level: level,
            service: this.serviceName,
            environment: this.environment,
            requestId: requestId,
            message: message,
            ...metadata
        };
    }

    /**
     * Log info message with structured format
     * @param {string} requestId - Request ID for correlation
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     */
    info(requestId, message, metadata = {}) {
        const logEntry = this.createLogEntry(requestId, 'INFO', message, metadata);
        console.log(JSON.stringify(logEntry));
    }

    /**
     * Log warning message with structured format
     * @param {string} requestId - Request ID for correlation
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     */
    warn(requestId, message, metadata = {}) {
        const logEntry = this.createLogEntry(requestId, 'WARN', message, metadata);
        console.warn(JSON.stringify(logEntry));
    }

    /**
     * Log error message with structured format
     * @param {string} requestId - Request ID for correlation
     * @param {string} message - Log message
     * @param {Error|Object} error - Error object or metadata
     * @param {Object} metadata - Additional metadata
     */
    error(requestId, message, error = null, metadata = {}) {
        const errorData = error instanceof Error ? {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack
        } : error;

        const logEntry = this.createLogEntry(requestId, 'ERROR', message, {
            error: errorData,
            ...metadata
        });
        console.error(JSON.stringify(logEntry));
    }

    /**
     * Log debug message with structured format (only in development)
     * @param {string} requestId - Request ID for correlation
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     */
    debug(requestId, message, metadata = {}) {
        if (this.environment === 'dev' || process.env.DEBUG === 'true') {
            const logEntry = this.createLogEntry(requestId, 'DEBUG', message, metadata);
            console.log(JSON.stringify(logEntry));
        }
    }

    /**
     * Log request start with timing
     * @param {string} requestId - Request ID for correlation
     * @param {string} operation - Operation name
     * @param {Object} input - Sanitized input parameters
     * @returns {number} Start timestamp for timing
     */
    logRequestStart(requestId, operation, input = {}) {
        const startTime = Date.now();
        
        // Sanitize input to remove sensitive data
        const sanitizedInput = this.sanitizeInput(input);
        
        this.info(requestId, `Request started: ${operation}`, {
            operation: operation,
            input: sanitizedInput,
            startTime: startTime,
            phase: 'request_start'
        });
        
        return startTime;
    }

    /**
     * Log request completion with timing
     * @param {string} requestId - Request ID for correlation
     * @param {string} operation - Operation name
     * @param {number} startTime - Start timestamp from logRequestStart
     * @param {boolean} success - Whether request succeeded
     * @param {Object} result - Sanitized result data
     */
    logRequestComplete(requestId, operation, startTime, success, result = {}) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Sanitize result to remove sensitive data
        const sanitizedResult = this.sanitizeOutput(result);
        
        this.info(requestId, `Request completed: ${operation}`, {
            operation: operation,
            success: success,
            duration: duration,
            result: sanitizedResult,
            endTime: endTime,
            phase: 'request_complete',
            performance: {
                totalLatencyMs: duration,
                success: success
            }
        });
    }

    /**
     * Log AI service interaction
     * @param {string} requestId - Request ID for correlation
     * @param {string} phase - Phase: 'request', 'response', 'error'
     * @param {Object} data - Interaction data
     */
    logAIServiceInteraction(requestId, phase, data = {}) {
        const sanitizedData = {
            ...data,
            // Remove sensitive data
            token: data.token ? '[REDACTED]' : undefined,
            apiKey: data.apiKey ? '[REDACTED]' : undefined,
            authorization: data.authorization ? '[REDACTED]' : undefined
        };

        this.info(requestId, `AI service interaction: ${phase}`, {
            phase: `ai_service_${phase}`,
            service: 'huggingface',
            model: data.model || 'salamandra-2b',
            ...sanitizedData
        });
    }

    /**
     * Log TMDB service interaction
     * @param {string} requestId - Request ID for correlation
     * @param {string} phase - Phase: 'request', 'response', 'error'
     * @param {Object} data - Interaction data
     */
    logTMDBServiceInteraction(requestId, phase, data = {}) {
        const sanitizedData = {
            ...data,
            // Remove sensitive data
            apiKey: data.apiKey ? '[REDACTED]' : undefined,
            token: data.token ? '[REDACTED]' : undefined
        };

        this.info(requestId, `TMDB service interaction: ${phase}`, {
            phase: `tmdb_service_${phase}`,
            service: 'tmdb',
            ...sanitizedData
        });
    }

    /**
     * Log JSON parsing failure with raw LLM response
     * **ONLY logs raw response on parsing failures for debugging**
     * @param {string} requestId - Request ID for correlation
     * @param {string} rawResponse - Raw LLM response (only logged on failure)
     * @param {string} failureType - Type of parsing failure
     * @param {Error} error - Parsing error
     */
    logJSONParsingFailure(requestId, rawResponse, failureType, error) {
        this.error(requestId, 'JSON parsing failure - logging raw response for debugging', error, {
            phase: 'json_parsing_failure',
            failureType: failureType,
            rawResponse: rawResponse, // Only logged on failures
            responseLength: rawResponse ? rawResponse.length : 0,
            debugging: true
        });
    }

    /**
     * Log intent classification
     * @param {string} requestId - Request ID for correlation
     * @param {string} userQuery - User query (sanitized)
     * @param {string} intent - Classified intent
     * @param {number} confidence - Confidence score
     */
    logIntentClassification(requestId, userQuery, intent, confidence) {
        this.info(requestId, `Intent classified: ${intent}`, {
            phase: 'intent_classification',
            intent: intent,
            confidence: confidence,
            queryLength: userQuery ? userQuery.length : 0,
            // Don't log full query for privacy
            queryPreview: userQuery ? userQuery.substring(0, 50) + '...' : ''
        });
    }

    /**
     * Log TMDB verification results
     * @param {string} requestId - Request ID for correlation
     * @param {Array} originalTitles - Original AI suggested titles
     * @param {Array} verifiedMovies - TMDB verified movies
     * @param {number} latencyMs - TMDB API latency
     */
    logTMDBVerification(requestId, originalTitles, verifiedMovies, latencyMs) {
        this.info(requestId, 'TMDB verification completed', {
            phase: 'tmdb_verification',
            originalCount: originalTitles ? originalTitles.length : 0,
            verifiedCount: verifiedMovies ? verifiedMovies.length : 0,
            successRate: originalTitles && originalTitles.length > 0 ? 
                (verifiedMovies.length / originalTitles.length) * 100 : 0,
            latencyMs: latencyMs,
            performance: {
                tmdbLatencyMs: latencyMs,
                moviesProcessed: originalTitles ? originalTitles.length : 0,
                moviesVerified: verifiedMovies ? verifiedMovies.length : 0
            }
        });
    }

    /**
     * Log fallback activation
     * @param {string} requestId - Request ID for correlation
     * @param {string} fallbackType - Type of fallback activated
     * @param {string} reason - Reason for fallback
     * @param {Error} originalError - Original error that triggered fallback
     */
    logFallbackActivation(requestId, fallbackType, reason, originalError = null) {
        this.warn(requestId, `Fallback activated: ${fallbackType}`, {
            phase: 'fallback_activation',
            fallbackType: fallbackType,
            reason: reason,
            originalError: originalError ? {
                name: originalError.name,
                message: originalError.message
            } : null
        });
    }

    /**
     * Log chat session operations
     * @param {string} requestId - Request ID for correlation
     * @param {string} operation - Operation: 'create', 'update', 'retrieve'
     * @param {string} sessionId - Session ID
     * @param {Object} metadata - Additional metadata
     */
    logChatSessionOperation(requestId, operation, sessionId, metadata = {}) {
        this.info(requestId, `Chat session ${operation}: ${sessionId}`, {
            phase: 'chat_session',
            operation: operation,
            sessionId: sessionId,
            ...metadata
        });
    }

    /**
     * Log performance timing for specific operations
     * @param {string} requestId - Request ID for correlation
     * @param {string} operation - Operation name
     * @param {number} latencyMs - Operation latency in milliseconds
     * @param {Object} metadata - Additional performance metadata
     */
    logPerformanceTiming(requestId, operation, latencyMs, metadata = {}) {
        this.info(requestId, `Performance timing: ${operation}`, {
            phase: 'performance_timing',
            operation: operation,
            latencyMs: latencyMs,
            performance: {
                operation: operation,
                latencyMs: latencyMs,
                ...metadata
            }
        });
    }

    /**
     * Sanitize input data to remove sensitive information
     * @param {Object} input - Input data to sanitize
     * @returns {Object} Sanitized input data
     */
    sanitizeInput(input) {
        if (!input || typeof input !== 'object') {
            return input;
        }

        const sanitized = { ...input };
        
        // Remove or redact sensitive fields
        const sensitiveFields = [
            'token', 'apiKey', 'authorization', 'password', 'secret',
            'hfToken', 'tmdbApiKey', 'accessToken', 'refreshToken'
        ];
        
        sensitiveFields.forEach(field => {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        });

        // Truncate long text fields for readability
        if (sanitized.text && sanitized.text.length > 200) {
            sanitized.text = sanitized.text.substring(0, 200) + '... [TRUNCATED]';
        }
        
        if (sanitized.query && sanitized.query.length > 200) {
            sanitized.query = sanitized.query.substring(0, 200) + '... [TRUNCATED]';
        }

        return sanitized;
    }

    /**
     * Sanitize output data to remove sensitive information
     * @param {Object} output - Output data to sanitize
     * @returns {Object} Sanitized output data
     */
    sanitizeOutput(output) {
        if (!output || typeof output !== 'object') {
            return output;
        }

        const sanitized = { ...output };
        
        // Remove sensitive fields from output
        const sensitiveFields = [
            'token', 'apiKey', 'authorization', 'secret',
            'rawResponse' // Only log raw responses on failures
        ];
        
        sensitiveFields.forEach(field => {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        });

        // Summarize large arrays/objects
        if (sanitized.movies && Array.isArray(sanitized.movies)) {
            sanitized.movieCount = sanitized.movies.length;
            if (sanitized.movies.length > 5) {
                sanitized.movies = sanitized.movies.slice(0, 5).concat(['... [TRUNCATED]']);
            }
        }

        return sanitized;
    }

    /**
     * Create correlation ID for distributed tracing
     * @param {string} requestId - Base request ID
     * @param {string} operation - Operation name
     * @returns {string} Correlation ID
     */
    createCorrelationId(requestId, operation) {
        return `${requestId}-${operation}-${Date.now()}`;
    }
}

module.exports = LoggingService;