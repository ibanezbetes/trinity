/**
 * TMDB Verification Service for Trinity AI Assistant
 * 
 * This service validates AI-suggested movies against The Movie Database (TMDB) API,
 * implements fuzzy matching for typos, and enriches movie data with metadata.
 * 
 * Key Features:
 * - Parallel processing with Promise.all() for performance
 * - Silent filtering of non-existent movies (hallucinations)
 * - Fuzzy matching for AI typos
 * - Poster URL construction
 * - Maximum 10 movie limit enforcement
 * 
 * **Validates: Requirements 2.1, 2.3, 6.1, 10.1.3, 10.2.1, 10.2.4**
 */

const axios = require('axios');
const { EnvironmentValidator } = require('../utils/envValidator');
const FallbackEngine = require('./fallbackEngine');
const MetricsService = require('./metricsService');
const LoggingService = require('./loggingService');

/**
 * @typedef {import('../types/interfaces.js').MovieCard} MovieCard
 * @typedef {import('../types/interfaces.js').TMDBServiceConfig} TMDBServiceConfig
 */

class TMDBService {
    /**
     * Initialize TMDB service with configuration
     * @param {TMDBServiceConfig} config - TMDB service configuration
     */
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
        this.apiKey = config.apiKey || secureConfig.tmdb.apiKey;
        this.baseUrl = config.baseUrl || secureConfig.tmdb.baseUrl;
        this.imageBaseUrl = config.imageBaseUrl || secureConfig.tmdb.imageBaseUrl;
        this.timeout = config.timeout || secureConfig.tmdb.timeout;
        this.fallbackEngine = new FallbackEngine();
        this.metricsService = new MetricsService();
        this.loggingService = new LoggingService();
        
        // **Validates: Requirement 8.3** - Never hardcode API keys or tokens
        if (!this.apiKey) {
            throw new Error('TMDB API key is required and must be provided via environment variables');
        }
        
        // Validate API key format for security
        if (!/^[a-f0-9]{32}$/.test(this.apiKey)) {
            throw new Error('Invalid TMDB API key format. Key must be a 32-character hexadecimal string');
        }
        
        // Configure axios instance for TMDB API
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: this.timeout,
            params: {
                api_key: this.apiKey
            }
        });
        
        console.log('[TMDBService] Initialized with base URL:', this.baseUrl);
        console.log('[TMDBService] Environment validation passed ✅');
    }

    /**
     * Fetch and verify multiple movies in parallel
     * **Property 5: Latency Optimization** - Uses Promise.all() for parallel execution
     * **Property 4: Grounding Verification** - Filters out hallucinations
     * 
     * @param {string[]} titles - Array of movie titles to search
     * @param {string} requestId - Request ID for correlation and metrics
     * @returns {Promise<MovieCard[]>} Array of verified movie cards (max 10)
     */
    async fetchMovies(titles, requestId = 'unknown') {
        const startTime = this.loggingService.logRequestStart(requestId, 'tmdb_verification', {
            movieCount: titles ? titles.length : 0
        });
        
        try {
            this.loggingService.info(requestId, `Starting parallel TMDB search for ${titles.length} movies`, {
                phase: 'tmdb_verification_start',
                movieCount: titles.length,
                titles: titles.slice(0, 5) // Log first 5 titles for debugging
            });
            
            // Enforce maximum 10 movie limit
            const limitedTitles = titles.slice(0, 10);
            
            this.loggingService.logTMDBServiceInteraction(requestId, 'request', {
                movieCount: limitedTitles.length,
                parallelExecution: true
            });
            
            // Execute all searches in parallel using Promise.all()
            const tmdbStartTime = Date.now();
            const searchPromises = limitedTitles.map(title => 
                this.searchSingleMovie(title, requestId).catch(error => {
                    this.loggingService.warn(requestId, `TMDB search failed for movie: ${title}`, {
                        phase: 'tmdb_search_failure',
                        title: title,
                        error: error.message
                    });
                    return null; // Return null for failed searches
                })
            );
            
            const searchResults = await Promise.all(searchPromises);
            const tmdbLatency = Date.now() - tmdbStartTime;
            
            // Filter out null results (failed searches and hallucinations)
            const validMovies = searchResults.filter(movie => movie !== null);
            
            this.loggingService.logTMDBServiceInteraction(requestId, 'response', {
                movieCount: limitedTitles.length,
                verifiedCount: validMovies.length,
                latencyMs: tmdbLatency,
                successRate: limitedTitles.length > 0 ? (validMovies.length / limitedTitles.length) * 100 : 0
            });
            
            // Record TMDB metrics
            await this.metricsService.recordTMDBLatency(requestId, tmdbLatency, limitedTitles.length, validMovies.length);
            
            this.loggingService.logTMDBVerification(requestId, limitedTitles, validMovies, tmdbLatency);
            
            this.loggingService.logRequestComplete(requestId, 'tmdb_verification', startTime, true, {
                originalCount: titles.length,
                verifiedCount: validMovies.length,
                successRate: titles.length > 0 ? (validMovies.length / titles.length) * 100 : 0
            });
            
            return validMovies;
            
        } catch (error) {
            const tmdbLatency = Date.now() - startTime;
            
            this.loggingService.error(requestId, 'Error in TMDB fetchMovies', error, {
                phase: 'tmdb_verification_error',
                movieCount: titles ? titles.length : 0,
                latencyMs: tmdbLatency
            });
            
            // Record TMDB failure metrics
            await this.metricsService.recordTMDBLatency(requestId, tmdbLatency, titles ? titles.length : 0, 0);
            
            // Check if fallback should be activated
            if (this.fallbackEngine.shouldActivateFallback(error)) {
                this.loggingService.logFallbackActivation(requestId, 'tmdb_failure', 'TMDB API failure', error);
                
                // Record fallback activation metrics
                await this.metricsService.recordFallbackActivation(requestId, 'tmdb_failure', error.message);
                
                return this.fallbackEngine.getStaticRecommendations();
            }
            
            // Return empty array for non-critical errors - graceful degradation
            return [];
        }
    }

    /**
     * Search for a single movie with fuzzy matching
     * **Property 4: Grounding Verification** - Validates movie existence
     * 
     * @param {string} title - Movie title to search
     * @param {string} requestId - Request ID for logging
     * @returns {Promise<MovieCard|null>} Movie card or null if not found
     */
    async searchSingleMovie(title, requestId = 'unknown') {
        try {
            if (!title || typeof title !== 'string' || title.trim().length === 0) {
                this.loggingService.warn(requestId, 'Invalid title provided to TMDB search', {
                    phase: 'tmdb_search_validation',
                    title: title,
                    titleType: typeof title
                });
                return null;
            }
            
            const cleanTitle = title.trim();
            this.loggingService.debug(requestId, `Searching TMDB for movie: ${cleanTitle}`, {
                phase: 'tmdb_single_search',
                title: cleanTitle
            });
            
            // Search TMDB API
            const response = await this.client.get('/search/movie', {
                params: {
                    query: cleanTitle,
                    language: 'es-ES', // Spanish language for Trinity users
                    include_adult: false
                }
            });
            
            const results = response.data.results;
            
            if (!results || results.length === 0) {
                this.loggingService.debug(requestId, `No TMDB results found for: ${cleanTitle}`, {
                    phase: 'tmdb_no_results',
                    title: cleanTitle
                });
                return null; // Silent filtering of hallucinations
            }
            
            // Use fuzzy matching - select the first result (TMDB ranks by relevance)
            const bestMatch = results[0];
            
            // Enrich movie data with metadata
            const enrichedMovie = this.enrichMovieData(bestMatch);
            
            this.loggingService.debug(requestId, `Found TMDB movie: ${enrichedMovie.title}`, {
                phase: 'tmdb_movie_found',
                title: enrichedMovie.title,
                tmdbId: enrichedMovie.tmdbId,
                originalTitle: cleanTitle
            });
            
            return enrichedMovie;
            
        } catch (error) {
            if (error.response?.status === 404) {
                this.loggingService.debug(requestId, `TMDB movie not found: ${title}`, {
                    phase: 'tmdb_404',
                    title: title
                });
                return null; // Silent filtering
            }
            
            this.loggingService.error(requestId, `TMDB API error searching for movie: ${title}`, error, {
                phase: 'tmdb_search_error',
                title: title,
                status: error.response?.status
            });
            return null; // Return null on API errors for graceful degradation
        }
    }

    /**
     * Enrich TMDB result with metadata and proper formatting
     * **Property 4: Grounding Verification** - Ensures valid movie data
     * 
     * @param {Object} tmdbResult - Raw TMDB API result
     * @returns {MovieCard} Enriched movie card
     */
    enrichMovieData(tmdbResult) {
        try {
            // Extract release year from release_date
            let releaseYear = 'Unknown';
            if (tmdbResult.release_date) {
                const year = new Date(tmdbResult.release_date).getFullYear();
                if (!isNaN(year)) {
                    releaseYear = year.toString();
                }
            }
            
            // Construct full poster URL
            let posterUrl = null;
            if (tmdbResult.poster_path) {
                posterUrl = `${this.imageBaseUrl}${tmdbResult.poster_path}`;
            }
            
            // Create enriched movie card
            const movieCard = {
                title: tmdbResult.title || tmdbResult.original_title || 'Unknown Title',
                posterUrl: posterUrl,
                synopsis: tmdbResult.overview || 'No synopsis available.',
                releaseYear: releaseYear,
                tmdbId: tmdbResult.id,
                genres: [], // Will be populated if genre data is available
                rating: tmdbResult.vote_average || 0
            };
            
            // Add genre information if available
            if (tmdbResult.genre_ids && Array.isArray(tmdbResult.genre_ids)) {
                // Note: For full genre names, we would need a separate API call
                // For now, we store the genre IDs
                movieCard.genres = tmdbResult.genre_ids.map(id => `Genre-${id}`);
            }
            
            return movieCard;
            
        } catch (error) {
            console.error('[TMDBService] Error enriching movie data:', error);
            
            // Return minimal valid movie card on error
            return {
                title: (tmdbResult && tmdbResult.title) ? tmdbResult.title : 'Unknown Title',
                posterUrl: null,
                synopsis: 'Error loading movie details.',
                releaseYear: 'Unknown',
                tmdbId: (tmdbResult && tmdbResult.id) ? tmdbResult.id : 0,
                genres: [],
                rating: 0
            };
        }
    }

    /**
     * Get fallback movie recommendations when TMDB API fails
     * Now delegates to FallbackEngine for consistency
     * @returns {MovieCard[]} Array of static movie recommendations
     */
    getStaticRecommendations() {
        console.log('[TMDBService] Delegating to FallbackEngine for static recommendations');
        return this.fallbackEngine.getStaticRecommendations();
    }

    /**
     * Test TMDB API connectivity
     * @returns {Promise<boolean>} True if API is accessible
     */
    async testConnection() {
        try {
            const response = await this.client.get('/configuration');
            console.log('[TMDBService] API connection test successful');
            return true;
        } catch (error) {
            console.error('[TMDBService] API connection test failed:', error.message);
            return false;
        }
    }
}

module.exports = TMDBService;