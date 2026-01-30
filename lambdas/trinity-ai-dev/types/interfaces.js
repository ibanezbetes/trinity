/**
 * TypeScript-style interfaces and types for Trinity AI Assistant
 * Using JSDoc comments for type checking in JavaScript
 */

/**
 * @typedef {Object} LLMResponse
 * @property {'cinema'|'other'} intent - The classified intent of the user query
 * @property {string[]} [titles] - Movie titles suggested by AI (only if intent is 'cinema')
 * @property {string} [reply] - Text reply for off-topic queries (only if intent is 'other')
 */

/**
 * @typedef {Object} MovieCard
 * @property {string} title - Movie title
 * @property {string|null} posterUrl - Full poster URL or null if not available
 * @property {string} synopsis - Movie synopsis/overview
 * @property {string} releaseYear - Release year as string
 * @property {number} tmdbId - TMDB movie ID
 * @property {string[]} [genres] - Movie genres
 * @property {number} [rating] - Movie rating (0-10)
 */

/**
 * @typedef {Object} ChatSession
 * @property {string} sessionId - Unique session identifier
 * @property {string} userId - User identifier
 * @property {ChatMessage[]} messages - Array of chat messages
 * @property {number} ttl - DynamoDB TTL timestamp
 */

/**
 * @typedef {Object} ChatMessage
 * @property {'user'|'assistant'} role - Message role
 * @property {string} content - Message content
 * @property {number} timestamp - Message timestamp
 */

/**
 * @typedef {Object} AIServiceConfig
 * @property {string} hfToken - Hugging Face API token
 * @property {string} modelUrl - Hugging Face model URL
 * @property {number} [timeout] - Request timeout in milliseconds
 * @property {number} [maxTokens] - Maximum tokens to generate
 * @property {number} [temperature] - Sampling temperature
 */

/**
 * @typedef {Object} TMDBServiceConfig
 * @property {string} apiKey - TMDB API key
 * @property {string} baseUrl - TMDB API base URL
 * @property {string} imageBaseUrl - TMDB image base URL
 * @property {number} [timeout] - Request timeout in milliseconds
 */

/**
 * @typedef {Object} TriniResponse
 * @property {string} chatResponse - Trini's text response
 * @property {string[]} recommendedGenres - Recommended movie genres
 * @property {number} confidence - Confidence score (0-1)
 * @property {string} reasoning - Explanation of the recommendation
 * @property {MovieCard[]} [movies] - Optional movie recommendations
 */

/**
 * @typedef {Object} AppSyncEvent
 * @property {Object} info - GraphQL info
 * @property {string} info.fieldName - GraphQL field name
 * @property {Object} arguments - GraphQL arguments
 * @property {Object} identity - User identity
 * @property {string} identity.sub - User ID
 */

/**
 * @typedef {Object} ErrorResponse
 * @property {number} statusCode - HTTP status code
 * @property {Object} body - Response body
 * @property {string} body.type - Response type
 * @property {string} body.content - Error message
 */

module.exports = {
    // Export types for JSDoc reference
    // These are used for documentation and IDE support
};