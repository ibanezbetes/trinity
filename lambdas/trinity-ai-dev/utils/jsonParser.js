/**
 * Resilient JSON Parser for Trini AI Assistant
 * 
 * This module provides robust JSON parsing capabilities to handle malformed
 * AI responses from the Salamandra-2b model. It implements a multi-layered
 * parsing strategy with fallback mechanisms.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 10.1.1, 10.2.2**
 */

const MetricsService = require('../services/metricsService');
const LoggingService = require('../services/loggingService');

/**
 * @typedef {Object} LLMResponse
 * @property {'cinema'|'other'} intent - The classified intent of the user query
 * @property {string[]} [titles] - Array of movie titles (only if intent is 'cinema')
 * @property {string} [reply] - Text response (only if intent is 'other')
 */

class ResilientJSONParser {
    constructor() {
        this.parseAttempts = 0;
        this.fallbackCount = 0;
        this.metricsService = new MetricsService();
        this.loggingService = new LoggingService();
    }

    /**
     * Main parsing method that attempts multiple strategies to extract valid JSON
     * @param {string} text - Raw text response from AI model
     * @param {string} requestId - Request ID for correlation and metrics
     * @returns {Promise<LLMResponse>} Always returns a valid LLMResponse object
     */
    async parse(text, requestId = 'unknown') {
        this.parseAttempts++;
        const startTime = Date.now();
        
        try {
            // Strategy 1: Direct JSON parsing
            const directResult = this.tryDirectParse(text, requestId);
            if (directResult) {
                const latency = Date.now() - startTime;
                this.loggingService.info(requestId, 'JSON parsing successful - direct parse', {
                    phase: 'json_parsing',
                    strategy: 'direct_parse',
                    latencyMs: latency,
                    attempt: this.parseAttempts
                });
                return directResult;
            }

            // Strategy 2: Regex extraction
            const regexResult = this.extractWithRegex(text, requestId);
            if (regexResult) {
                const latency = Date.now() - startTime;
                this.loggingService.warn(requestId, 'JSON parsing required regex fallback', {
                    phase: 'json_parsing',
                    strategy: 'regex_extraction',
                    latencyMs: latency,
                    attempt: this.parseAttempts
                });
                
                // Record metrics for regex fallback
                await this.metricsService.recordJSONParseFailure(requestId, 'regex_fallback');
                
                return regexResult;
            }

            // Strategy 3: Safe fallback
            const latency = Date.now() - startTime;
            this.loggingService.error(requestId, 'All JSON parsing strategies failed - using fallback', null, {
                phase: 'json_parsing',
                strategy: 'complete_fallback',
                latencyMs: latency,
                attempt: this.parseAttempts,
                responseLength: text ? text.length : 0
            });
            
            // Log raw response only on complete failure for debugging
            this.loggingService.logJSONParsingFailure(requestId, text, 'complete_fallback', 
                new Error('All parsing strategies failed'));
            
            // Record metrics for complete fallback
            await this.metricsService.recordJSONParseFailure(requestId, 'complete_fallback');
            
            return this.getFallbackResponse();

        } catch (error) {
            const latency = Date.now() - startTime;
            this.loggingService.error(requestId, 'Unexpected error during JSON parsing', error, {
                phase: 'json_parsing',
                strategy: 'error_fallback',
                latencyMs: latency,
                attempt: this.parseAttempts
            });
            
            // Log raw response on unexpected error for debugging
            this.loggingService.logJSONParsingFailure(requestId, text, 'unexpected_error', error);
            
            // Record metrics for unexpected error
            await this.metricsService.recordJSONParseFailure(requestId, 'unexpected_error');
            
            return this.getFallbackResponse();
        }
    }

    /**
     * Strategy 1: Attempt standard JSON.parse on the raw response
     * @param {string} text - Raw text to parse
     * @param {string} requestId - Request ID for logging
     * @returns {LLMResponse|null} Parsed object or null if parsing fails
     */
    tryDirectParse(text, requestId = 'unknown') {
        if (!text || typeof text !== 'string') {
            this.loggingService.debug(requestId, 'Direct parse failed - invalid input', {
                inputType: typeof text,
                inputLength: text ? text.length : 0
            });
            return null;
        }

        try {
            const trimmed = text.trim();
            if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
                this.loggingService.debug(requestId, 'Direct parse failed - not JSON format', {
                    startsWithBrace: trimmed.startsWith('{'),
                    endsWithBrace: trimmed.endsWith('}'),
                    preview: trimmed.substring(0, 100)
                });
                return null;
            }

            const parsed = JSON.parse(trimmed);
            
            // Validate the parsed object has the required structure
            if (this.isValidLLMResponse(parsed)) {
                this.loggingService.debug(requestId, 'Direct parse validation successful', {
                    intent: parsed.intent,
                    hasTitles: !!parsed.titles,
                    hasReply: !!parsed.reply
                });
                return parsed;
            }
            
            this.loggingService.debug(requestId, 'Direct parse failed - invalid LLM response structure', {
                parsedKeys: Object.keys(parsed),
                intent: parsed.intent
            });
            return null;
        } catch (error) {
            // Silent failure - this is expected for malformed JSON
            this.loggingService.debug(requestId, 'Direct parse failed - JSON syntax error', {
                errorMessage: error.message
            });
            return null;
        }
    }

    /**
     * Strategy 2: Use regex to extract JSON object from potentially "chatty" response
     * @param {string} text - Raw text that may contain JSON embedded in other text
     * @param {string} requestId - Request ID for logging
     * @returns {LLMResponse|null} Extracted and parsed object or null if extraction fails
     */
    extractWithRegex(text, requestId = 'unknown') {
        if (!text || typeof text !== 'string') {
            this.loggingService.debug(requestId, 'Regex extraction failed - invalid input', {
                inputType: typeof text,
                inputLength: text ? text.length : 0
            });
            return null;
        }

        try {
            // Use regex pattern to find JSON object: /\{[\s\S]*\}/
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            
            if (!jsonMatch) {
                this.loggingService.debug(requestId, 'Regex extraction failed - no JSON pattern found', {
                    textLength: text.length,
                    preview: text.substring(0, 100)
                });
                return null;
            }

            const jsonString = jsonMatch[0];
            const parsed = JSON.parse(jsonString);
            
            // Validate the parsed object has the required structure
            if (this.isValidLLMResponse(parsed)) {
                this.loggingService.debug(requestId, 'Regex extraction validation successful', {
                    intent: parsed.intent,
                    extractedLength: jsonString.length,
                    originalLength: text.length
                });
                return parsed;
            }
            
            this.loggingService.debug(requestId, 'Regex extraction failed - invalid LLM response structure', {
                parsedKeys: Object.keys(parsed),
                intent: parsed.intent
            });
            return null;
        } catch (error) {
            // Silent failure - regex extraction can fail on malformed JSON
            this.loggingService.debug(requestId, 'Regex extraction failed - JSON syntax error', {
                errorMessage: error.message
            });
            return null;
        }
    }

    /**
     * Strategy 3: Return a safe fallback response when all parsing fails
     * @returns {LLMResponse} A valid fallback response indicating technical difficulty
     */
    getFallbackResponse() {
        this.fallbackCount++;
        
        return {
            intent: 'other',
            reply: 'Ay cariño, mi conexión neuronal va lenta hoy. ¿Me lo puedes repetir?'
        };
    }

    /**
     * Validates that a parsed object conforms to the LLMResponse interface
     * @param {any} obj - Object to validate
     * @returns {boolean} True if object is a valid LLMResponse
     */
    isValidLLMResponse(obj) {
        if (!obj || typeof obj !== 'object') {
            return false;
        }

        // Must have intent property with valid values
        if (!obj.intent || !['cinema', 'other'].includes(obj.intent)) {
            return false;
        }

        // If intent is 'cinema', should have titles array
        if (obj.intent === 'cinema') {
            if (!obj.titles || !Array.isArray(obj.titles)) {
                return false;
            }
            // Titles should be strings
            if (!obj.titles.every(title => typeof title === 'string')) {
                return false;
            }
        }

        // If intent is 'other', should have reply string
        if (obj.intent === 'other') {
            if (!obj.reply || typeof obj.reply !== 'string') {
                return false;
            }
        }

        return true;
    }

    /**
     * Get parsing statistics for monitoring
     * @returns {Object} Statistics about parsing attempts and fallbacks
     */
    getStats() {
        return {
            parseAttempts: this.parseAttempts,
            fallbackCount: this.fallbackCount,
            successRate: this.parseAttempts > 0 ? 
                ((this.parseAttempts - this.fallbackCount) / this.parseAttempts * 100).toFixed(2) + '%' : 
                '0%'
        };
    }

    /**
     * Reset statistics (useful for testing)
     */
    resetStats() {
        this.parseAttempts = 0;
        this.fallbackCount = 0;
    }
}

module.exports = {
    ResilientJSONParser
};