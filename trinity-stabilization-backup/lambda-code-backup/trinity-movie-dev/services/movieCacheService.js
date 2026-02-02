"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerState = exports.movieCacheService = exports.MovieCacheService = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const metrics_1 = require("../utils/metrics");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
// Genre ID to name mapping from TMDB
const GENRE_MAP = {
    28: 'Action',
    12: 'Adventure',
    16: 'Animation',
    35: 'Comedy',
    80: 'Crime',
    99: 'Documentary',
    18: 'Drama',
    10751: 'Family',
    14: 'Fantasy',
    36: 'History',
    27: 'Horror',
    10402: 'Music',
    9648: 'Mystery',
    10749: 'Romance',
    878: 'Science Fiction',
    10770: 'TV Movie',
    53: 'Thriller',
    10752: 'War',
    37: 'Western',
};
/**
 * Circuit Breaker States
 */
var CircuitBreakerState;
(function (CircuitBreakerState) {
    CircuitBreakerState["CLOSED"] = "CLOSED";
    CircuitBreakerState["OPEN"] = "OPEN";
    CircuitBreakerState["HALF_OPEN"] = "HALF_OPEN"; // Testing if service is back up
})(CircuitBreakerState || (exports.CircuitBreakerState = CircuitBreakerState = {}));
/**
 * Circuit Breaker for TMDB API
 */
class TMDBCircuitBreaker {
    constructor() {
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.lastFailureTime = 0;
        this.successCount = 0;
        // Configuration
        this.FAILURE_THRESHOLD = 5; // Open circuit after 5 failures
        this.SUCCESS_THRESHOLD = 3; // Close circuit after 3 successes in HALF_OPEN
        this.TIMEOUT_MS = 30000; // 30 seconds timeout before trying HALF_OPEN
        this.RESET_TIMEOUT_MS = 300000; // 5 minutes to reset failure count
    }
    /**
     * Execute a request through the circuit breaker
     */
    async execute(operation, fallback) {
        // Check if we should attempt the operation
        if (this.shouldAttemptRequest()) {
            try {
                const result = await operation();
                this.onSuccess();
                return result;
            }
            catch (error) {
                this.onFailure();
                console.warn('🔌 Circuit breaker: Operation failed, using fallback');
                return await fallback();
            }
        }
        else {
            console.warn('🔌 Circuit breaker: Circuit is OPEN, using fallback immediately');
            return await fallback();
        }
    }
    /**
     * Check if we should attempt the request based on circuit state
     */
    shouldAttemptRequest() {
        const now = Date.now();
        switch (this.state) {
            case CircuitBreakerState.CLOSED:
                // Reset failure count if enough time has passed
                if (now - this.lastFailureTime > this.RESET_TIMEOUT_MS) {
                    this.failureCount = 0;
                }
                return true;
            case CircuitBreakerState.OPEN:
                // Check if timeout has passed to try HALF_OPEN
                if (now - this.lastFailureTime >= this.TIMEOUT_MS) {
                    this.state = CircuitBreakerState.HALF_OPEN;
                    this.successCount = 0;
                    console.log('🔌 Circuit breaker: Transitioning to HALF_OPEN state');
                    return true;
                }
                return false;
            case CircuitBreakerState.HALF_OPEN:
                return true;
            default:
                return true;
        }
    }
    /**
     * Handle successful operation
     */
    onSuccess() {
        switch (this.state) {
            case CircuitBreakerState.CLOSED:
                this.failureCount = 0;
                break;
            case CircuitBreakerState.HALF_OPEN:
                this.successCount++;
                if (this.successCount >= this.SUCCESS_THRESHOLD) {
                    this.state = CircuitBreakerState.CLOSED;
                    this.failureCount = 0;
                    this.successCount = 0;
                    console.log('🔌 Circuit breaker: Transitioning to CLOSED state (service recovered)');
                }
                break;
        }
    }
    /**
     * Handle failed operation
     */
    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        switch (this.state) {
            case CircuitBreakerState.CLOSED:
                if (this.failureCount >= this.FAILURE_THRESHOLD) {
                    this.state = CircuitBreakerState.OPEN;
                    console.warn(`🔌 Circuit breaker: Transitioning to OPEN state (${this.failureCount} failures)`);
                }
                break;
            case CircuitBreakerState.HALF_OPEN:
                this.state = CircuitBreakerState.OPEN;
                this.successCount = 0;
                console.warn('🔌 Circuit breaker: Transitioning back to OPEN state (test failed)');
                break;
        }
    }
    /**
     * Get current circuit breaker status
     */
    getStatus() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime,
        };
    }
    /**
     * Reset circuit breaker (for testing or manual recovery)
     */
    reset() {
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = 0;
        console.log('🔌 Circuit breaker: Manually reset to CLOSED state');
    }
}
/**
 * Movie Cache Service
 * Handles pre-caching of movies for instant loading during voting sessions
 */
class MovieCacheService {
    constructor() {
        this.CACHE_TTL_HOURS = 24;
        this.DEFAULT_CACHE_SIZE = 30;
        this.MAX_CACHE_SIZE = 50;
        this.MIN_CACHE_SIZE = 20;
        // Circuit breaker for TMDB API
        this.circuitBreaker = new TMDBCircuitBreaker();
    }
    /**
     * Pre-cache movies for a room with optional genre filtering
     * Implements cache-first strategy with circuit breaker fallback
     */
    async preCacheMovies(roomId, genres) {
        const timer = new metrics_1.PerformanceTimer('PreCacheMovies');
        console.log(`🎬 Pre-caching movies for room ${roomId}`, genres ? `with genres: ${genres.join(', ')}` : 'all genres');
        try {
            // CACHE-FIRST STRATEGY: Check if cache already exists and is valid
            const existingCache = await this.getCachedMovies(roomId);
            if (existingCache.length > 0) {
                console.log(`✅ Using existing cache for room ${roomId}: ${existingCache.length} movies`);
                timer.finish(true, undefined, { source: 'existing_cache', movieCount: existingCache.length });
                return existingCache;
            }
            // Cache miss - try to fetch from TMDB API through circuit breaker
            console.log('📡 Cache miss - fetching from TMDB API through circuit breaker');
            const movies = await this.circuitBreaker.execute(
            // Primary operation: Fetch from TMDB API
            async () => {
                return await this.fetchMoviesFromTMDB(genres);
            }, 
            // Fallback operation: Use cached content or default movies
            async () => {
                console.log('🔄 Circuit breaker fallback: Trying cached content from other rooms');
                // Try to get cached movies from other rooms with similar genres
                const fallbackFromCache = await this.getFallbackFromCache(genres);
                if (fallbackFromCache.length > 0) {
                    console.log(`✅ Found ${fallbackFromCache.length} movies from cache fallback`);
                    return fallbackFromCache;
                }
                // Last resort: Use default fallback movies
                console.log('🎭 Using default fallback movies');
                return await this.getFallbackMovies();
            });
            if (movies.length === 0) {
                console.warn('⚠️ No movies available from any source, using minimal fallback');
                const fallbackMovies = await this.getFallbackMovies();
                await this.storeCacheInDynamoDB(roomId, fallbackMovies, genres || []);
                timer.finish(true, undefined, { source: 'minimal_fallback', movieCount: fallbackMovies.length });
                return fallbackMovies;
            }
            // Store in cache
            await this.storeCacheInDynamoDB(roomId, movies, genres || []);
            // Log business metric with circuit breaker status
            const circuitStatus = this.circuitBreaker.getStatus();
            (0, metrics_1.logBusinessMetric)('MOVIES_CACHED', roomId, 'system', {
                movieCount: movies.length,
                genres: genres || [],
                cacheSize: movies.length,
                circuitBreakerState: circuitStatus.state,
                circuitBreakerFailures: circuitStatus.failureCount
            });
            console.log(`✅ Successfully cached ${movies.length} movies for room ${roomId}`);
            timer.finish(true, undefined, {
                source: circuitStatus.state === CircuitBreakerState.CLOSED ? 'tmdb_api' : 'circuit_breaker_fallback',
                movieCount: movies.length
            });
            return movies;
        }
        catch (error) {
            (0, metrics_1.logError)('PreCacheMovies', error, { roomId, genres });
            timer.finish(false, error.name);
            // Final fallback to default movies on any error
            console.log('🔄 Using final fallback movies due to error');
            const fallbackMovies = await this.getFallbackMovies();
            try {
                await this.storeCacheInDynamoDB(roomId, fallbackMovies, genres || []);
            }
            catch (storeError) {
                console.error('❌ Failed to store fallback cache:', storeError);
            }
            return fallbackMovies;
        }
    }
    /**
     * Get cached movies for a room
     */
    async getCachedMovies(roomId) {
        try {
            const response = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.MOVIE_CACHE_TABLE,
                Key: { cacheKey: roomId },
            }));
            if (!response.Item) {
                return [];
            }
            const cache = response.Item;
            // Check if cache is expired
            const now = Date.now();
            if (now > cache.ttl) {
                console.log(`⏰ Cache expired for room ${roomId}, removing`);
                // Could delete expired cache here, but for now just return empty
                return [];
            }
            console.log(`📦 Retrieved ${cache.movies.length} cached movies for room ${roomId}`);
            return cache.movies;
        }
        catch (error) {
            console.error('❌ Error retrieving cached movies:', error);
            return [];
        }
    }
    /**
     * Refresh cache for a room
     */
    async refreshCache(roomId, genres) {
        console.log(`🔄 Refreshing cache for room ${roomId}`);
        try {
            // Delete existing cache
            await this.deleteCacheFromDynamoDB(roomId);
            // Create new cache
            await this.preCacheMovies(roomId, genres);
            console.log(`✅ Cache refreshed for room ${roomId}`);
        }
        catch (error) {
            console.error('❌ Error refreshing cache:', error);
            throw error;
        }
    }
    /**
     * Fetch movies from TMDB API with genre filtering
     */
    async fetchMoviesFromTMDB(genres) {
        const apiKey = process.env.TMDB_API_KEY;
        if (!apiKey) {
            throw new Error('TMDB API key not configured');
        }
        try {
            let url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&sort_by=popularity.desc&include_adult=false&include_video=false&page=1`;
            // Add genre filtering if specified
            if (genres && genres.length > 0) {
                const genreIds = this.genreNamesToIds(genres);
                if (genreIds.length > 0) {
                    url += `&with_genres=${genreIds.join(',')}`;
                    console.log(`🎭 Applying genre filters: ${genres.join(', ')} (IDs: ${genreIds.join(', ')})`);
                }
                else {
                    console.warn(`⚠️ No valid genre IDs found for: ${genres.join(', ')}, using popular movies`);
                }
            }
            else {
                console.log('🎬 No genre filters specified, fetching popular movies across all genres');
            }
            console.log('🌐 Fetching movies from TMDB:', url.replace(apiKey, '[API_KEY]'));
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            if (!data.results || data.results.length === 0) {
                console.warn('⚠️ No movies returned from TMDB API');
                throw new Error('No movies found from TMDB API');
            }
            // Convert TMDB format to our cached movie format
            const movies = data.results.slice(0, this.DEFAULT_CACHE_SIZE).map(movie => ({
                tmdbId: movie.id,
                title: movie.title,
                posterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : '',
                overview: movie.overview,
                genres: movie.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean),
                year: movie.release_date ? new Date(movie.release_date).getFullYear() : undefined,
                rating: movie.vote_average,
                cachedAt: new Date().toISOString(),
                ttl: Date.now() + (this.CACHE_TTL_HOURS * 60 * 60 * 1000),
            }));
            console.log(`✅ Fetched ${movies.length} movies from TMDB`);
            // Validate genre filtering worked correctly
            if (genres && genres.length > 0) {
                const genreFilteredCount = movies.filter(movie => movie.genres.some(movieGenre => genres.some(requestedGenre => movieGenre.toLowerCase() === requestedGenre.toLowerCase()))).length;
                console.log(`🎭 Genre filtering validation: ${genreFilteredCount}/${movies.length} movies match requested genres`);
            }
            return movies;
        }
        catch (error) {
            console.error('❌ Error fetching from TMDB:', error);
            throw error;
        }
    }
    /**
     * Convert genre names to TMDB genre IDs
     */
    genreNamesToIds(genreNames) {
        const genreIds = [];
        const unmatchedGenres = [];
        for (const name of genreNames) {
            const normalizedName = name.toLowerCase().trim();
            let found = false;
            for (const [id, genreName] of Object.entries(GENRE_MAP)) {
                if (genreName.toLowerCase() === normalizedName) {
                    genreIds.push(parseInt(id));
                    found = true;
                    break;
                }
            }
            if (!found) {
                unmatchedGenres.push(name);
            }
        }
        if (unmatchedGenres.length > 0) {
            console.warn(`⚠️ Unknown genres ignored: ${unmatchedGenres.join(', ')}`);
            console.log(`📋 Available genres: ${Object.values(GENRE_MAP).join(', ')}`);
        }
        return genreIds;
    }
    /**
     * Get list of available genres
     */
    getAvailableGenres() {
        return Object.values(GENRE_MAP).sort();
    }
    /**
     * Validate genre names against available genres
     */
    validateGenres(genreNames) {
        const availableGenres = this.getAvailableGenres().map(g => g.toLowerCase());
        const valid = [];
        const invalid = [];
        for (const genre of genreNames) {
            const normalizedGenre = genre.toLowerCase().trim();
            if (availableGenres.includes(normalizedGenre)) {
                // Find the properly capitalized version
                const properGenre = Object.values(GENRE_MAP).find(g => g.toLowerCase() === normalizedGenre);
                if (properGenre) {
                    valid.push(properGenre);
                }
            }
            else {
                invalid.push(genre);
            }
        }
        return { valid, invalid };
    }
    /**
     * Get fallback movies from cache of other rooms with similar genres
     */
    async getFallbackFromCache(genres) {
        try {
            // If no genres specified, try to get any cached movies
            if (!genres || genres.length === 0) {
                console.log('🔍 Searching for any cached movies as fallback');
                // This is a simplified approach - in production you might want to scan the cache table
                return [];
            }
            // Try to find cached movies that match the requested genres
            console.log(`🔍 Searching for cached movies with genres: ${genres.join(', ')}`);
            // Create a genre-based cache key to look for similar content
            const genreKey = `genre_${genres.sort().join('_').toLowerCase()}`;
            const response = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.MOVIE_CACHE_TABLE,
                Key: { cacheKey: genreKey },
            }));
            if (response.Item) {
                const cache = response.Item;
                // Check if cache is not expired
                const now = Date.now();
                if (now <= cache.ttl) {
                    console.log(`✅ Found ${cache.movies.length} movies from genre-based cache fallback`);
                    return cache.movies.slice(0, this.DEFAULT_CACHE_SIZE);
                }
            }
            return [];
        }
        catch (error) {
            console.error('❌ Error getting fallback from cache:', error);
            return [];
        }
    }
    /**
     * Get circuit breaker status for monitoring
     */
    getCircuitBreakerStatus() {
        return this.circuitBreaker.getStatus();
    }
    /**
     * Reset circuit breaker (for manual recovery or testing)
     */
    resetCircuitBreaker() {
        this.circuitBreaker.reset();
    }
    /**
     * Check if TMDB API is available through circuit breaker
     */
    async isApiAvailable() {
        const status = this.circuitBreaker.getStatus();
        return status.state !== CircuitBreakerState.OPEN;
    }
    /**
     * Get fallback movies when TMDB API fails
     */
    async getFallbackMovies() {
        // Popular movie IDs as fallback
        const fallbackMovieIds = [
            550, 551, 552, 553, 554, 555, 556, 557, 558, 559,
            560, 561, 562, 563, 564, 565, 566, 567, 568, 569,
            570, 571, 572, 573, 574, 575, 576, 577, 578, 579
        ];
        return fallbackMovieIds.map((id, index) => ({
            tmdbId: id,
            title: `Película Popular ${index + 1}`,
            posterPath: `https://image.tmdb.org/t/p/w500/placeholder${id}.jpg`,
            overview: `Esta es una película popular con ID ${id}. Los detalles se cargarán desde TMDB cuando se acceda.`,
            genres: ['acción', 'drama'], // Use proper Spanish genres instead of 'Popular'
            year: 2023,
            rating: 7.5,
            cachedAt: new Date().toISOString(),
            ttl: Date.now() + (this.CACHE_TTL_HOURS * 60 * 60 * 1000),
        }));
    }
    /**
     * Store movie cache in DynamoDB
     */
    async storeCacheInDynamoDB(roomId, movies, genres) {
        const cache = {
            cacheKey: roomId,
            movies,
            genreFilters: genres,
            cachedAt: new Date().toISOString(),
            ttl: Date.now() + (this.CACHE_TTL_HOURS * 60 * 60 * 1000),
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.MOVIE_CACHE_TABLE,
            Item: cache,
        }));
        console.log(`💾 Stored cache for room ${roomId}: ${movies.length} movies`);
    }
    /**
     * Delete cache from DynamoDB
     */
    async deleteCacheFromDynamoDB(roomId) {
        await docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: process.env.MOVIE_CACHE_TABLE,
            Key: { cacheKey: roomId },
            UpdateExpression: 'REMOVE movies, genreFilters, cachedAt',
            ConditionExpression: 'attribute_exists(cacheKey)',
        }));
    }
    /**
     * Get cache statistics for monitoring
     */
    async getCacheStats(roomId) {
        try {
            const response = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.MOVIE_CACHE_TABLE,
                Key: { cacheKey: roomId },
            }));
            if (!response.Item) {
                return {
                    exists: false,
                    movieCount: 0,
                    genres: [],
                    isExpired: false,
                };
            }
            const cache = response.Item;
            const now = Date.now();
            const isExpired = now > cache.ttl;
            return {
                exists: true,
                movieCount: cache.movies.length,
                genres: cache.genreFilters,
                cachedAt: cache.cachedAt,
                expiresAt: new Date(cache.ttl).toISOString(),
                isExpired,
            };
        }
        catch (error) {
            console.error('❌ Error getting cache stats:', error);
            return {
                exists: false,
                movieCount: 0,
                genres: [],
                isExpired: false,
            };
        }
    }
}
exports.MovieCacheService = MovieCacheService;
// Export singleton instance
exports.movieCacheService = new MovieCacheService();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW92aWVDYWNoZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3ZpZUNhY2hlU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw4REFBMEQ7QUFDMUQsd0RBQW9IO0FBQ3BILDhDQUFpRjtBQU9qRixNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBc0M1RCxxQ0FBcUM7QUFDckMsTUFBTSxTQUFTLEdBQTJCO0lBQ3hDLEVBQUUsRUFBRSxRQUFRO0lBQ1osRUFBRSxFQUFFLFdBQVc7SUFDZixFQUFFLEVBQUUsV0FBVztJQUNmLEVBQUUsRUFBRSxRQUFRO0lBQ1osRUFBRSxFQUFFLE9BQU87SUFDWCxFQUFFLEVBQUUsYUFBYTtJQUNqQixFQUFFLEVBQUUsT0FBTztJQUNYLEtBQUssRUFBRSxRQUFRO0lBQ2YsRUFBRSxFQUFFLFNBQVM7SUFDYixFQUFFLEVBQUUsU0FBUztJQUNiLEVBQUUsRUFBRSxRQUFRO0lBQ1osS0FBSyxFQUFFLE9BQU87SUFDZCxJQUFJLEVBQUUsU0FBUztJQUNmLEtBQUssRUFBRSxTQUFTO0lBQ2hCLEdBQUcsRUFBRSxpQkFBaUI7SUFDdEIsS0FBSyxFQUFFLFVBQVU7SUFDakIsRUFBRSxFQUFFLFVBQVU7SUFDZCxLQUFLLEVBQUUsS0FBSztJQUNaLEVBQUUsRUFBRSxTQUFTO0NBQ2QsQ0FBQztBQUVGOztHQUVHO0FBQ0gsSUFBSyxtQkFJSjtBQUpELFdBQUssbUJBQW1CO0lBQ3RCLHdDQUFpQixDQUFBO0lBQ2pCLG9DQUFhLENBQUE7SUFDYiw4Q0FBdUIsQ0FBQSxDQUFDLGdDQUFnQztBQUMxRCxDQUFDLEVBSkksbUJBQW1CLG1DQUFuQixtQkFBbUIsUUFJdkI7QUFFRDs7R0FFRztBQUNILE1BQU0sa0JBQWtCO0lBQXhCO1FBQ1UsVUFBSyxHQUF3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QUFNLEVBQUUsRUFBRTtnQkFDVixTQUFTLEVBQUUsS0FBSzthQUNqQixDQUFDO1FBQ0osQ0FBQztJQUNILENBQUM7Q0FDRjtBQTdjRCw4Q0E2Y0M7QUFFRCw0QkFBNEI7QUFDZixRQUFBLGlCQUFpQixHQUFHLElBQUksaUJBQWlCLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcclxuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCwgR2V0Q29tbWFuZCwgUXVlcnlDb21tYW5kLCBVcGRhdGVDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcclxuaW1wb3J0IHsgbG9nQnVzaW5lc3NNZXRyaWMsIGxvZ0Vycm9yLCBQZXJmb3JtYW5jZVRpbWVyIH0gZnJvbSAnLi4vdXRpbHMvbWV0cmljcyc7XHJcblxyXG4vLyBGb3IgTm9kZS5qcyBmZXRjaCBzdXBwb3J0XHJcbmRlY2xhcmUgZ2xvYmFsIHtcclxuICBmdW5jdGlvbiBmZXRjaChpbnB1dDogc3RyaW5nLCBpbml0PzogYW55KTogUHJvbWlzZTxhbnk+O1xyXG59XHJcblxyXG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xyXG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQ2FjaGVkTW92aWUge1xyXG4gIHRtZGJJZDogbnVtYmVyO1xyXG4gIHRpdGxlOiBzdHJpbmc7XHJcbiAgcG9zdGVyUGF0aDogc3RyaW5nO1xyXG4gIG92ZXJ2aWV3OiBzdHJpbmc7XHJcbiAgZ2VucmVzOiBzdHJpbmdbXTtcclxuICB5ZWFyPzogbnVtYmVyO1xyXG4gIHJhdGluZz86IG51bWJlcjtcclxuICBjYWNoZWRBdDogc3RyaW5nO1xyXG4gIHR0bDogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIE1vdmllQ2FjaGUge1xyXG4gIGNhY2hlS2V5OiBzdHJpbmc7ICAgICAvLyBQSzogcm9vbUlkIG9yIGdlbnJlLWJhc2VkIGtleVxyXG4gIG1vdmllczogQ2FjaGVkTW92aWVbXTtcclxuICBnZW5yZUZpbHRlcnM6IHN0cmluZ1tdO1xyXG4gIGNhY2hlZEF0OiBzdHJpbmc7XHJcbiAgdHRsOiBudW1iZXI7ICAgICAgICAgIC8vIDI0LWhvdXIgZXhwaXJhdGlvblxyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFRNREJNb3ZpZSB7XHJcbiAgaWQ6IG51bWJlcjtcclxuICB0aXRsZTogc3RyaW5nO1xyXG4gIHBvc3Rlcl9wYXRoOiBzdHJpbmcgfCBudWxsO1xyXG4gIG92ZXJ2aWV3OiBzdHJpbmc7XHJcbiAgZ2VucmVfaWRzOiBudW1iZXJbXTtcclxuICByZWxlYXNlX2RhdGU6IHN0cmluZztcclxuICB2b3RlX2F2ZXJhZ2U6IG51bWJlcjtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUTURCUmVzcG9uc2Uge1xyXG4gIHJlc3VsdHM6IFRNREJNb3ZpZVtdO1xyXG4gIHRvdGFsX3BhZ2VzOiBudW1iZXI7XHJcbiAgdG90YWxfcmVzdWx0czogbnVtYmVyO1xyXG59XHJcblxyXG4vLyBHZW5yZSBJRCB0byBuYW1lIG1hcHBpbmcgZnJvbSBUTURCXHJcbmNvbnN0IEdFTlJFX01BUDogUmVjb3JkPG51bWJlciwgc3RyaW5nPiA9IHtcclxuICAyODogJ0FjdGlvbicsXHJcbiAgMTI6ICdBZHZlbnR1cmUnLFxyXG4gIDE2OiAnQW5pbWF0aW9uJyxcclxuICAzNTogJ0NvbWVkeScsXHJcbiAgODA6ICdDcmltZScsXHJcbiAgOTk6ICdEb2N1bWVudGFyeScsXHJcbiAgMTg6ICdEcmFtYScsXHJcbiAgMTA3NTE6ICdGYW1pbHknLFxyXG4gIDE0OiAnRmFudGFzeScsXHJcbiAgMzY6ICdIaXN0b3J5JyxcclxuICAyNzogJ0hvcnJvcicsXHJcbiAgMTA0MDI6ICdNdXNpYycsXHJcbiAgOTY0ODogJ015c3RlcnknLFxyXG4gIDEwNzQ5OiAnUm9tYW5jZScsXHJcbiAgODc4OiAnU2NpZW5jZSBGaWN0aW9uJyxcclxuICAxMDc3MDogJ1RWIE1vdmllJyxcclxuICA1MzogJ1RocmlsbGVyJyxcclxuICAxMDc1MjogJ1dhcicsXHJcbiAgMzc6ICdXZXN0ZXJuJyxcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDaXJjdWl0IEJyZWFrZXIgU3RhdGVzXHJcbiAqL1xyXG5lbnVtIENpcmN1aXRCcmVha2VyU3RhdGUge1xyXG4gIENMT1NFRCA9ICdDTE9TRUQnLCAgICAgLy8gTm9ybWFsIG9wZXJhdGlvbiwgcmVxdWVzdHMgZ28gdGhyb3VnaFxyXG4gIE9QRU4gPSAnT1BFTicsICAgICAgICAgLy8gQ2lyY3VpdCBpcyBvcGVuLCByZXF1ZXN0cyBmYWlsIGZhc3RcclxuICBIQUxGX09QRU4gPSAnSEFMRl9PUEVOJyAvLyBUZXN0aW5nIGlmIHNlcnZpY2UgaXMgYmFjayB1cFxyXG59XHJcblxyXG4vKipcclxuICogQ2lyY3VpdCBCcmVha2VyIGZvciBUTURCIEFQSVxyXG4gKi9cclxuY2xhc3MgVE1EQkNpcmN1aXRCcmVha2VyIHtcclxuICBwcml2YXRlIHN0YXRlOiBDaXJjdWl0QnJlYWtlclN0YXRlID0gQ2lyY3VpdEJyZWFrZXJTdGF0ZS5DTE9TRUQ7XHJcbiAgcHJpdmF0ZSBmYWlsdXJlQ291bnQ6IG51bWJlciA9IDA7XHJcbiAgcHJpdmF0ZSBsYXN0RmFpbHVyZVRpbWU6IG51bWJlciA9IDA7XHJcbiAgcHJpdmF0ZSBzdWNjZXNzQ291bnQ6IG51bWJlciA9IDA7XHJcblxyXG4gIC8vIENvbmZpZ3VyYXRpb25cclxuICBwcml2YXRlIHJlYWRvbmx5IEZBSUxVUkVfVEhSRVNIT0xEID0gNTsgICAgICAgIC8vIE9wZW4gY2lyY3VpdCBhZnRlciA1IGZhaWx1cmVzXHJcbiAgcHJpdmF0ZSByZWFkb25seSBTVUNDRVNTX1RIUkVTSE9MRCA9IDM7ICAgICAgICAvLyBDbG9zZSBjaXJjdWl0IGFmdGVyIDMgc3VjY2Vzc2VzIGluIEhBTEZfT1BFTlxyXG4gIHByaXZhdGUgcmVhZG9ubHkgVElNRU9VVF9NUyA9IDMwMDAwOyAgICAgICAgICAvLyAzMCBzZWNvbmRzIHRpbWVvdXQgYmVmb3JlIHRyeWluZyBIQUxGX09QRU5cclxuICBwcml2YXRlIHJlYWRvbmx5IFJFU0VUX1RJTUVPVVRfTVMgPSAzMDAwMDA7ICAgLy8gNSBtaW51dGVzIHRvIHJlc2V0IGZhaWx1cmUgY291bnRcclxuXHJcbiAgLyoqXHJcbiAgICogRXhlY3V0ZSBhIHJlcXVlc3QgdGhyb3VnaCB0aGUgY2lyY3VpdCBicmVha2VyXHJcbiAgICovXHJcbiAgYXN5bmMgZXhlY3V0ZTxUPihvcGVyYXRpb246ICgpID0+IFByb21pc2U8VD4sIGZhbGxiYWNrOiAoKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XHJcbiAgICAvLyBDaGVjayBpZiB3ZSBzaG91bGQgYXR0ZW1wdCB0aGUgb3BlcmF0aW9uXHJcbiAgICBpZiAodGhpcy5zaG91bGRBdHRlbXB0UmVxdWVzdCgpKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3BlcmF0aW9uKCk7XHJcbiAgICAgICAgdGhpcy5vblN1Y2Nlc3MoKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIHRoaXMub25GYWlsdXJlKCk7XHJcbiAgICAgICAgY29uc29sZS53YXJuKCfwn5SMIENpcmN1aXQgYnJlYWtlcjogT3BlcmF0aW9uIGZhaWxlZCwgdXNpbmcgZmFsbGJhY2snKTtcclxuICAgICAgICByZXR1cm4gYXdhaXQgZmFsbGJhY2soKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS53YXJuKCfwn5SMIENpcmN1aXQgYnJlYWtlcjogQ2lyY3VpdCBpcyBPUEVOLCB1c2luZyBmYWxsYmFjayBpbW1lZGlhdGVseScpO1xyXG4gICAgICByZXR1cm4gYXdhaXQgZmFsbGJhY2soKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrIGlmIHdlIHNob3VsZCBhdHRlbXB0IHRoZSByZXF1ZXN0IGJhc2VkIG9uIGNpcmN1aXQgc3RhdGVcclxuICAgKi9cclxuICBwcml2YXRlIHNob3VsZEF0dGVtcHRSZXF1ZXN0KCk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcclxuXHJcbiAgICBzd2l0Y2ggKHRoaXMuc3RhdGUpIHtcclxuICAgICAgY2FzZSBDaXJjdWl0QnJlYWtlclN0YXRlLkNMT1NFRDpcclxuICAgICAgICAvLyBSZXNldCBmYWlsdXJlIGNvdW50IGlmIGVub3VnaCB0aW1lIGhhcyBwYXNzZWRcclxuICAgICAgICBpZiAobm93IC0gdGhpcy5sYXN0RmFpbHVyZVRpbWUgPiB0aGlzLlJFU0VUX1RJTUVPVVRfTVMpIHtcclxuICAgICAgICAgIHRoaXMuZmFpbHVyZUNvdW50ID0gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcblxyXG4gICAgICBjYXNlIENpcmN1aXRCcmVha2VyU3RhdGUuT1BFTjpcclxuICAgICAgICAvLyBDaGVjayBpZiB0aW1lb3V0IGhhcyBwYXNzZWQgdG8gdHJ5IEhBTEZfT1BFTlxyXG4gICAgICAgIGlmIChub3cgLSB0aGlzLmxhc3RGYWlsdXJlVGltZSA+PSB0aGlzLlRJTUVPVVRfTVMpIHtcclxuICAgICAgICAgIHRoaXMuc3RhdGUgPSBDaXJjdWl0QnJlYWtlclN0YXRlLkhBTEZfT1BFTjtcclxuICAgICAgICAgIHRoaXMuc3VjY2Vzc0NvdW50ID0gMDtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCfwn5SMIENpcmN1aXQgYnJlYWtlcjogVHJhbnNpdGlvbmluZyB0byBIQUxGX09QRU4gc3RhdGUnKTtcclxuICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICBjYXNlIENpcmN1aXRCcmVha2VyU3RhdGUuSEFMRl9PUEVOOlxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG5cclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEhhbmRsZSBzdWNjZXNzZnVsIG9wZXJhdGlvblxyXG4gICAqL1xyXG4gIHByaXZhdGUgb25TdWNjZXNzKCk6IHZvaWQge1xyXG4gICAgc3dpdGNoICh0aGlzLnN0YXRlKSB7XHJcbiAgICAgIGNhc2UgQ2lyY3VpdEJyZWFrZXJTdGF0ZS5DTE9TRUQ6XHJcbiAgICAgICAgdGhpcy5mYWlsdXJlQ291bnQgPSAwO1xyXG4gICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgY2FzZSBDaXJjdWl0QnJlYWtlclN0YXRlLkhBTEZfT1BFTjpcclxuICAgICAgICB0aGlzLnN1Y2Nlc3NDb3VudCsrO1xyXG4gICAgICAgIGlmICh0aGlzLnN1Y2Nlc3NDb3VudCA+PSB0aGlzLlNVQ0NFU1NfVEhSRVNIT0xEKSB7XHJcbiAgICAgICAgICB0aGlzLnN0YXRlID0gQ2lyY3VpdEJyZWFrZXJTdGF0ZS5DTE9TRUQ7XHJcbiAgICAgICAgICB0aGlzLmZhaWx1cmVDb3VudCA9IDA7XHJcbiAgICAgICAgICB0aGlzLnN1Y2Nlc3NDb3VudCA9IDA7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZygn8J+UjCBDaXJjdWl0IGJyZWFrZXI6IFRyYW5zaXRpb25pbmcgdG8gQ0xPU0VEIHN0YXRlIChzZXJ2aWNlIHJlY292ZXJlZCknKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBIYW5kbGUgZmFpbGVkIG9wZXJhdGlvblxyXG4gICAqL1xyXG4gIHByaXZhdGUgb25GYWlsdXJlKCk6IHZvaWQge1xyXG4gICAgdGhpcy5mYWlsdXJlQ291bnQrKztcclxuICAgIHRoaXMubGFzdEZhaWx1cmVUaW1lID0gRGF0ZS5ub3coKTtcclxuXHJcbiAgICBzd2l0Y2ggKHRoaXMuc3RhdGUpIHtcclxuICAgICAgY2FzZSBDaXJjdWl0QnJlYWtlclN0YXRlLkNMT1NFRDpcclxuICAgICAgICBpZiAodGhpcy5mYWlsdXJlQ291bnQgPj0gdGhpcy5GQUlMVVJFX1RIUkVTSE9MRCkge1xyXG4gICAgICAgICAgdGhpcy5zdGF0ZSA9IENpcmN1aXRCcmVha2VyU3RhdGUuT1BFTjtcclxuICAgICAgICAgIGNvbnNvbGUud2Fybihg8J+UjCBDaXJjdWl0IGJyZWFrZXI6IFRyYW5zaXRpb25pbmcgdG8gT1BFTiBzdGF0ZSAoJHt0aGlzLmZhaWx1cmVDb3VudH0gZmFpbHVyZXMpYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgY2FzZSBDaXJjdWl0QnJlYWtlclN0YXRlLkhBTEZfT1BFTjpcclxuICAgICAgICB0aGlzLnN0YXRlID0gQ2lyY3VpdEJyZWFrZXJTdGF0ZS5PUEVOO1xyXG4gICAgICAgIHRoaXMuc3VjY2Vzc0NvdW50ID0gMDtcclxuICAgICAgICBjb25zb2xlLndhcm4oJ/CflIwgQ2lyY3VpdCBicmVha2VyOiBUcmFuc2l0aW9uaW5nIGJhY2sgdG8gT1BFTiBzdGF0ZSAodGVzdCBmYWlsZWQpJyk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgY3VycmVudCBjaXJjdWl0IGJyZWFrZXIgc3RhdHVzXHJcbiAgICovXHJcbiAgZ2V0U3RhdHVzKCk6IHtcclxuICAgIHN0YXRlOiBDaXJjdWl0QnJlYWtlclN0YXRlO1xyXG4gICAgZmFpbHVyZUNvdW50OiBudW1iZXI7XHJcbiAgICBzdWNjZXNzQ291bnQ6IG51bWJlcjtcclxuICAgIGxhc3RGYWlsdXJlVGltZTogbnVtYmVyO1xyXG4gIH0ge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RhdGU6IHRoaXMuc3RhdGUsXHJcbiAgICAgIGZhaWx1cmVDb3VudDogdGhpcy5mYWlsdXJlQ291bnQsXHJcbiAgICAgIHN1Y2Nlc3NDb3VudDogdGhpcy5zdWNjZXNzQ291bnQsXHJcbiAgICAgIGxhc3RGYWlsdXJlVGltZTogdGhpcy5sYXN0RmFpbHVyZVRpbWUsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVzZXQgY2lyY3VpdCBicmVha2VyIChmb3IgdGVzdGluZyBvciBtYW51YWwgcmVjb3ZlcnkpXHJcbiAgICovXHJcbiAgcmVzZXQoKTogdm9pZCB7XHJcbiAgICB0aGlzLnN0YXRlID0gQ2lyY3VpdEJyZWFrZXJTdGF0ZS5DTE9TRUQ7XHJcbiAgICB0aGlzLmZhaWx1cmVDb3VudCA9IDA7XHJcbiAgICB0aGlzLnN1Y2Nlc3NDb3VudCA9IDA7XHJcbiAgICB0aGlzLmxhc3RGYWlsdXJlVGltZSA9IDA7XHJcbiAgICBjb25zb2xlLmxvZygn8J+UjCBDaXJjdWl0IGJyZWFrZXI6IE1hbnVhbGx5IHJlc2V0IHRvIENMT1NFRCBzdGF0ZScpO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE1vdmllIENhY2hlIFNlcnZpY2VcclxuICogSGFuZGxlcyBwcmUtY2FjaGluZyBvZiBtb3ZpZXMgZm9yIGluc3RhbnQgbG9hZGluZyBkdXJpbmcgdm90aW5nIHNlc3Npb25zXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgTW92aWVDYWNoZVNlcnZpY2Uge1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgQ0FDSEVfVFRMX0hPVVJTID0gMjQ7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBERUZBVUxUX0NBQ0hFX1NJWkUgPSAzMDtcclxuICBwcml2YXRlIHJlYWRvbmx5IE1BWF9DQUNIRV9TSVpFID0gNTA7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBNSU5fQ0FDSEVfU0laRSA9IDIwO1xyXG5cclxuICAvLyBDaXJjdWl0IGJyZWFrZXIgZm9yIFRNREIgQVBJXHJcbiAgcHJpdmF0ZSByZWFkb25seSBjaXJjdWl0QnJlYWtlciA9IG5ldyBUTURCQ2lyY3VpdEJyZWFrZXIoKTtcclxuXHJcbiAgLyoqXHJcbiAgICogUHJlLWNhY2hlIG1vdmllcyBmb3IgYSByb29tIHdpdGggb3B0aW9uYWwgZ2VucmUgZmlsdGVyaW5nXHJcbiAgICogSW1wbGVtZW50cyBjYWNoZS1maXJzdCBzdHJhdGVneSB3aXRoIGNpcmN1aXQgYnJlYWtlciBmYWxsYmFja1xyXG4gICAqL1xyXG4gIGFzeW5jIHByZUNhY2hlTW92aWVzKHJvb21JZDogc3RyaW5nLCBnZW5yZXM/OiBzdHJpbmdbXSk6IFByb21pc2U8Q2FjaGVkTW92aWVbXT4ge1xyXG4gICAgY29uc3QgdGltZXIgPSBuZXcgUGVyZm9ybWFuY2VUaW1lcignUHJlQ2FjaGVNb3ZpZXMnKTtcclxuICAgIGNvbnNvbGUubG9nKGDwn46sIFByZS1jYWNoaW5nIG1vdmllcyBmb3Igcm9vbSAke3Jvb21JZH1gLCBnZW5yZXMgPyBgd2l0aCBnZW5yZXM6ICR7Z2VucmVzLmpvaW4oJywgJyl9YCA6ICdhbGwgZ2VucmVzJyk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gQ0FDSEUtRklSU1QgU1RSQVRFR1k6IENoZWNrIGlmIGNhY2hlIGFscmVhZHkgZXhpc3RzIGFuZCBpcyB2YWxpZFxyXG4gICAgICBjb25zdCBleGlzdGluZ0NhY2hlID0gYXdhaXQgdGhpcy5nZXRDYWNoZWRNb3ZpZXMocm9vbUlkKTtcclxuICAgICAgaWYgKGV4aXN0aW5nQ2FjaGUubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgVXNpbmcgZXhpc3RpbmcgY2FjaGUgZm9yIHJvb20gJHtyb29tSWR9OiAke2V4aXN0aW5nQ2FjaGUubGVuZ3RofSBtb3ZpZXNgKTtcclxuICAgICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IHNvdXJjZTogJ2V4aXN0aW5nX2NhY2hlJywgbW92aWVDb3VudDogZXhpc3RpbmdDYWNoZS5sZW5ndGggfSk7XHJcbiAgICAgICAgcmV0dXJuIGV4aXN0aW5nQ2FjaGU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIENhY2hlIG1pc3MgLSB0cnkgdG8gZmV0Y2ggZnJvbSBUTURCIEFQSSB0aHJvdWdoIGNpcmN1aXQgYnJlYWtlclxyXG4gICAgICBjb25zb2xlLmxvZygn8J+ToSBDYWNoZSBtaXNzIC0gZmV0Y2hpbmcgZnJvbSBUTURCIEFQSSB0aHJvdWdoIGNpcmN1aXQgYnJlYWtlcicpO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgbW92aWVzID0gYXdhaXQgdGhpcy5jaXJjdWl0QnJlYWtlci5leGVjdXRlKFxyXG4gICAgICAgIC8vIFByaW1hcnkgb3BlcmF0aW9uOiBGZXRjaCBmcm9tIFRNREIgQVBJXHJcbiAgICAgICAgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZmV0Y2hNb3ZpZXNGcm9tVE1EQihnZW5yZXMpO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy8gRmFsbGJhY2sgb3BlcmF0aW9uOiBVc2UgY2FjaGVkIGNvbnRlbnQgb3IgZGVmYXVsdCBtb3ZpZXNcclxuICAgICAgICBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZygn8J+UhCBDaXJjdWl0IGJyZWFrZXIgZmFsbGJhY2s6IFRyeWluZyBjYWNoZWQgY29udGVudCBmcm9tIG90aGVyIHJvb21zJyk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFRyeSB0byBnZXQgY2FjaGVkIG1vdmllcyBmcm9tIG90aGVyIHJvb21zIHdpdGggc2ltaWxhciBnZW5yZXNcclxuICAgICAgICAgIGNvbnN0IGZhbGxiYWNrRnJvbUNhY2hlID0gYXdhaXQgdGhpcy5nZXRGYWxsYmFja0Zyb21DYWNoZShnZW5yZXMpO1xyXG4gICAgICAgICAgaWYgKGZhbGxiYWNrRnJvbUNhY2hlLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYOKchSBGb3VuZCAke2ZhbGxiYWNrRnJvbUNhY2hlLmxlbmd0aH0gbW92aWVzIGZyb20gY2FjaGUgZmFsbGJhY2tgKTtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbGxiYWNrRnJvbUNhY2hlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBMYXN0IHJlc29ydDogVXNlIGRlZmF1bHQgZmFsbGJhY2sgbW92aWVzXHJcbiAgICAgICAgICBjb25zb2xlLmxvZygn8J+OrSBVc2luZyBkZWZhdWx0IGZhbGxiYWNrIG1vdmllcycpO1xyXG4gICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0RmFsbGJhY2tNb3ZpZXMoKTtcclxuICAgICAgICB9XHJcbiAgICAgICk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAobW92aWVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGNvbnNvbGUud2Fybign4pqg77iPIE5vIG1vdmllcyBhdmFpbGFibGUgZnJvbSBhbnkgc291cmNlLCB1c2luZyBtaW5pbWFsIGZhbGxiYWNrJyk7XHJcbiAgICAgICAgY29uc3QgZmFsbGJhY2tNb3ZpZXMgPSBhd2FpdCB0aGlzLmdldEZhbGxiYWNrTW92aWVzKCk7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5zdG9yZUNhY2hlSW5EeW5hbW9EQihyb29tSWQsIGZhbGxiYWNrTW92aWVzLCBnZW5yZXMgfHwgW10pO1xyXG4gICAgICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgc291cmNlOiAnbWluaW1hbF9mYWxsYmFjaycsIG1vdmllQ291bnQ6IGZhbGxiYWNrTW92aWVzLmxlbmd0aCB9KTtcclxuICAgICAgICByZXR1cm4gZmFsbGJhY2tNb3ZpZXM7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFN0b3JlIGluIGNhY2hlXHJcbiAgICAgIGF3YWl0IHRoaXMuc3RvcmVDYWNoZUluRHluYW1vREIocm9vbUlkLCBtb3ZpZXMsIGdlbnJlcyB8fCBbXSk7XHJcblxyXG4gICAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljIHdpdGggY2lyY3VpdCBicmVha2VyIHN0YXR1c1xyXG4gICAgICBjb25zdCBjaXJjdWl0U3RhdHVzID0gdGhpcy5jaXJjdWl0QnJlYWtlci5nZXRTdGF0dXMoKTtcclxuICAgICAgbG9nQnVzaW5lc3NNZXRyaWMoJ01PVklFU19DQUNIRUQnLCByb29tSWQsICdzeXN0ZW0nLCB7XHJcbiAgICAgICAgbW92aWVDb3VudDogbW92aWVzLmxlbmd0aCxcclxuICAgICAgICBnZW5yZXM6IGdlbnJlcyB8fCBbXSxcclxuICAgICAgICBjYWNoZVNpemU6IG1vdmllcy5sZW5ndGgsXHJcbiAgICAgICAgY2lyY3VpdEJyZWFrZXJTdGF0ZTogY2lyY3VpdFN0YXR1cy5zdGF0ZSxcclxuICAgICAgICBjaXJjdWl0QnJlYWtlckZhaWx1cmVzOiBjaXJjdWl0U3RhdHVzLmZhaWx1cmVDb3VudFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgU3VjY2Vzc2Z1bGx5IGNhY2hlZCAke21vdmllcy5sZW5ndGh9IG1vdmllcyBmb3Igcm9vbSAke3Jvb21JZH1gKTtcclxuICAgICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyBcclxuICAgICAgICBzb3VyY2U6IGNpcmN1aXRTdGF0dXMuc3RhdGUgPT09IENpcmN1aXRCcmVha2VyU3RhdGUuQ0xPU0VEID8gJ3RtZGJfYXBpJyA6ICdjaXJjdWl0X2JyZWFrZXJfZmFsbGJhY2snLCBcclxuICAgICAgICBtb3ZpZUNvdW50OiBtb3ZpZXMubGVuZ3RoIFxyXG4gICAgICB9KTtcclxuICAgICAgcmV0dXJuIG1vdmllcztcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBsb2dFcnJvcignUHJlQ2FjaGVNb3ZpZXMnLCBlcnJvciBhcyBFcnJvciwgeyByb29tSWQsIGdlbnJlcyB9KTtcclxuICAgICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgICBcclxuICAgICAgLy8gRmluYWwgZmFsbGJhY2sgdG8gZGVmYXVsdCBtb3ZpZXMgb24gYW55IGVycm9yXHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SEIFVzaW5nIGZpbmFsIGZhbGxiYWNrIG1vdmllcyBkdWUgdG8gZXJyb3InKTtcclxuICAgICAgY29uc3QgZmFsbGJhY2tNb3ZpZXMgPSBhd2FpdCB0aGlzLmdldEZhbGxiYWNrTW92aWVzKCk7XHJcbiAgICAgIFxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMuc3RvcmVDYWNoZUluRHluYW1vREIocm9vbUlkLCBmYWxsYmFja01vdmllcywgZ2VucmVzIHx8IFtdKTtcclxuICAgICAgfSBjYXRjaCAoc3RvcmVFcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gc3RvcmUgZmFsbGJhY2sgY2FjaGU6Jywgc3RvcmVFcnJvcik7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIHJldHVybiBmYWxsYmFja01vdmllcztcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBjYWNoZWQgbW92aWVzIGZvciBhIHJvb21cclxuICAgKi9cclxuICBhc3luYyBnZXRDYWNoZWRNb3ZpZXMocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPENhY2hlZE1vdmllW10+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuTU9WSUVfQ0FDSEVfVEFCTEUhLFxyXG4gICAgICAgIEtleTogeyBjYWNoZUtleTogcm9vbUlkIH0sXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICAgIHJldHVybiBbXTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgY2FjaGUgPSByZXNwb25zZS5JdGVtIGFzIE1vdmllQ2FjaGU7XHJcbiAgICAgIFxyXG4gICAgICAvLyBDaGVjayBpZiBjYWNoZSBpcyBleHBpcmVkXHJcbiAgICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XHJcbiAgICAgIGlmIChub3cgPiBjYWNoZS50dGwpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhg4o+wIENhY2hlIGV4cGlyZWQgZm9yIHJvb20gJHtyb29tSWR9LCByZW1vdmluZ2ApO1xyXG4gICAgICAgIC8vIENvdWxkIGRlbGV0ZSBleHBpcmVkIGNhY2hlIGhlcmUsIGJ1dCBmb3Igbm93IGp1c3QgcmV0dXJuIGVtcHR5XHJcbiAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg8J+TpiBSZXRyaWV2ZWQgJHtjYWNoZS5tb3ZpZXMubGVuZ3RofSBjYWNoZWQgbW92aWVzIGZvciByb29tICR7cm9vbUlkfWApO1xyXG4gICAgICByZXR1cm4gY2FjaGUubW92aWVzO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciByZXRyaWV2aW5nIGNhY2hlZCBtb3ZpZXM6JywgZXJyb3IpO1xyXG4gICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZWZyZXNoIGNhY2hlIGZvciBhIHJvb21cclxuICAgKi9cclxuICBhc3luYyByZWZyZXNoQ2FjaGUocm9vbUlkOiBzdHJpbmcsIGdlbnJlcz86IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+UhCBSZWZyZXNoaW5nIGNhY2hlIGZvciByb29tICR7cm9vbUlkfWApO1xyXG4gICAgXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBEZWxldGUgZXhpc3RpbmcgY2FjaGVcclxuICAgICAgYXdhaXQgdGhpcy5kZWxldGVDYWNoZUZyb21EeW5hbW9EQihyb29tSWQpO1xyXG4gICAgICBcclxuICAgICAgLy8gQ3JlYXRlIG5ldyBjYWNoZVxyXG4gICAgICBhd2FpdCB0aGlzLnByZUNhY2hlTW92aWVzKHJvb21JZCwgZ2VucmVzKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgQ2FjaGUgcmVmcmVzaGVkIGZvciByb29tICR7cm9vbUlkfWApO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHJlZnJlc2hpbmcgY2FjaGU6JywgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIG1vdmllcyBmcm9tIFRNREIgQVBJIHdpdGggZ2VucmUgZmlsdGVyaW5nXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBmZXRjaE1vdmllc0Zyb21UTURCKGdlbnJlcz86IHN0cmluZ1tdKTogUHJvbWlzZTxDYWNoZWRNb3ZpZVtdPiB7XHJcbiAgICBjb25zdCBhcGlLZXkgPSBwcm9jZXNzLmVudi5UTURCX0FQSV9LRVk7XHJcbiAgICBpZiAoIWFwaUtleSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RNREIgQVBJIGtleSBub3QgY29uZmlndXJlZCcpO1xyXG4gICAgfVxyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGxldCB1cmwgPSBgaHR0cHM6Ly9hcGkudGhlbW92aWVkYi5vcmcvMy9kaXNjb3Zlci9tb3ZpZT9hcGlfa2V5PSR7YXBpS2V5fSZzb3J0X2J5PXBvcHVsYXJpdHkuZGVzYyZpbmNsdWRlX2FkdWx0PWZhbHNlJmluY2x1ZGVfdmlkZW89ZmFsc2UmcGFnZT0xYDtcclxuICAgICAgXHJcbiAgICAgIC8vIEFkZCBnZW5yZSBmaWx0ZXJpbmcgaWYgc3BlY2lmaWVkXHJcbiAgICAgIGlmIChnZW5yZXMgJiYgZ2VucmVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zdCBnZW5yZUlkcyA9IHRoaXMuZ2VucmVOYW1lc1RvSWRzKGdlbnJlcyk7XHJcbiAgICAgICAgaWYgKGdlbnJlSWRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIHVybCArPSBgJndpdGhfZ2VucmVzPSR7Z2VucmVJZHMuam9pbignLCcpfWA7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+OrSBBcHBseWluZyBnZW5yZSBmaWx0ZXJzOiAke2dlbnJlcy5qb2luKCcsICcpfSAoSURzOiAke2dlbnJlSWRzLmpvaW4oJywgJyl9KWApO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBObyB2YWxpZCBnZW5yZSBJRHMgZm91bmQgZm9yOiAke2dlbnJlcy5qb2luKCcsICcpfSwgdXNpbmcgcG9wdWxhciBtb3ZpZXNgKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ/CfjqwgTm8gZ2VucmUgZmlsdGVycyBzcGVjaWZpZWQsIGZldGNoaW5nIHBvcHVsYXIgbW92aWVzIGFjcm9zcyBhbGwgZ2VucmVzJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn4yQIEZldGNoaW5nIG1vdmllcyBmcm9tIFRNREI6JywgdXJsLnJlcGxhY2UoYXBpS2V5LCAnW0FQSV9LRVldJykpO1xyXG5cclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwpO1xyXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUTURCIEFQSSBlcnJvcjogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyBUTURCUmVzcG9uc2U7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoIWRhdGEucmVzdWx0cyB8fCBkYXRhLnJlc3VsdHMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gTm8gbW92aWVzIHJldHVybmVkIGZyb20gVE1EQiBBUEknKTtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIG1vdmllcyBmb3VuZCBmcm9tIFRNREIgQVBJJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIENvbnZlcnQgVE1EQiBmb3JtYXQgdG8gb3VyIGNhY2hlZCBtb3ZpZSBmb3JtYXRcclxuICAgICAgY29uc3QgbW92aWVzOiBDYWNoZWRNb3ZpZVtdID0gZGF0YS5yZXN1bHRzLnNsaWNlKDAsIHRoaXMuREVGQVVMVF9DQUNIRV9TSVpFKS5tYXAobW92aWUgPT4gKHtcclxuICAgICAgICB0bWRiSWQ6IG1vdmllLmlkLFxyXG4gICAgICAgIHRpdGxlOiBtb3ZpZS50aXRsZSxcclxuICAgICAgICBwb3N0ZXJQYXRoOiBtb3ZpZS5wb3N0ZXJfcGF0aCA/IGBodHRwczovL2ltYWdlLnRtZGIub3JnL3QvcC93NTAwJHttb3ZpZS5wb3N0ZXJfcGF0aH1gIDogJycsXHJcbiAgICAgICAgb3ZlcnZpZXc6IG1vdmllLm92ZXJ2aWV3LFxyXG4gICAgICAgIGdlbnJlczogbW92aWUuZ2VucmVfaWRzLm1hcChpZCA9PiBHRU5SRV9NQVBbaWRdKS5maWx0ZXIoQm9vbGVhbiksXHJcbiAgICAgICAgeWVhcjogbW92aWUucmVsZWFzZV9kYXRlID8gbmV3IERhdGUobW92aWUucmVsZWFzZV9kYXRlKS5nZXRGdWxsWWVhcigpIDogdW5kZWZpbmVkLFxyXG4gICAgICAgIHJhdGluZzogbW92aWUudm90ZV9hdmVyYWdlLFxyXG4gICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgdHRsOiBEYXRlLm5vdygpICsgKHRoaXMuQ0FDSEVfVFRMX0hPVVJTICogNjAgKiA2MCAqIDEwMDApLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEZldGNoZWQgJHttb3ZpZXMubGVuZ3RofSBtb3ZpZXMgZnJvbSBUTURCYCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBWYWxpZGF0ZSBnZW5yZSBmaWx0ZXJpbmcgd29ya2VkIGNvcnJlY3RseVxyXG4gICAgICBpZiAoZ2VucmVzICYmIGdlbnJlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgY29uc3QgZ2VucmVGaWx0ZXJlZENvdW50ID0gbW92aWVzLmZpbHRlcihtb3ZpZSA9PiBcclxuICAgICAgICAgIG1vdmllLmdlbnJlcy5zb21lKG1vdmllR2VucmUgPT4gXHJcbiAgICAgICAgICAgIGdlbnJlcy5zb21lKHJlcXVlc3RlZEdlbnJlID0+IFxyXG4gICAgICAgICAgICAgIG1vdmllR2VucmUudG9Mb3dlckNhc2UoKSA9PT0gcmVxdWVzdGVkR2VucmUudG9Mb3dlckNhc2UoKVxyXG4gICAgICAgICAgICApXHJcbiAgICAgICAgICApXHJcbiAgICAgICAgKS5sZW5ndGg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfjq0gR2VucmUgZmlsdGVyaW5nIHZhbGlkYXRpb246ICR7Z2VucmVGaWx0ZXJlZENvdW50fS8ke21vdmllcy5sZW5ndGh9IG1vdmllcyBtYXRjaCByZXF1ZXN0ZWQgZ2VucmVzYCk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIHJldHVybiBtb3ZpZXM7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGZldGNoaW5nIGZyb20gVE1EQjonLCBlcnJvcik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ29udmVydCBnZW5yZSBuYW1lcyB0byBUTURCIGdlbnJlIElEc1xyXG4gICAqL1xyXG4gIHByaXZhdGUgZ2VucmVOYW1lc1RvSWRzKGdlbnJlTmFtZXM6IHN0cmluZ1tdKTogbnVtYmVyW10ge1xyXG4gICAgY29uc3QgZ2VucmVJZHM6IG51bWJlcltdID0gW107XHJcbiAgICBjb25zdCB1bm1hdGNoZWRHZW5yZXM6IHN0cmluZ1tdID0gW107XHJcbiAgICBcclxuICAgIGZvciAoY29uc3QgbmFtZSBvZiBnZW5yZU5hbWVzKSB7XHJcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWROYW1lID0gbmFtZS50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcclxuICAgICAgbGV0IGZvdW5kID0gZmFsc2U7XHJcbiAgICAgIFxyXG4gICAgICBmb3IgKGNvbnN0IFtpZCwgZ2VucmVOYW1lXSBvZiBPYmplY3QuZW50cmllcyhHRU5SRV9NQVApKSB7XHJcbiAgICAgICAgaWYgKGdlbnJlTmFtZS50b0xvd2VyQ2FzZSgpID09PSBub3JtYWxpemVkTmFtZSkge1xyXG4gICAgICAgICAgZ2VucmVJZHMucHVzaChwYXJzZUludChpZCkpO1xyXG4gICAgICAgICAgZm91bmQgPSB0cnVlO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICBpZiAoIWZvdW5kKSB7XHJcbiAgICAgICAgdW5tYXRjaGVkR2VucmVzLnB1c2gobmFtZSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHVubWF0Y2hlZEdlbnJlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIFVua25vd24gZ2VucmVzIGlnbm9yZWQ6ICR7dW5tYXRjaGVkR2VucmVzLmpvaW4oJywgJyl9YCk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OLIEF2YWlsYWJsZSBnZW5yZXM6ICR7T2JqZWN0LnZhbHVlcyhHRU5SRV9NQVApLmpvaW4oJywgJyl9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBnZW5yZUlkcztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBsaXN0IG9mIGF2YWlsYWJsZSBnZW5yZXNcclxuICAgKi9cclxuICBnZXRBdmFpbGFibGVHZW5yZXMoKTogc3RyaW5nW10ge1xyXG4gICAgcmV0dXJuIE9iamVjdC52YWx1ZXMoR0VOUkVfTUFQKS5zb3J0KCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBnZW5yZSBuYW1lcyBhZ2FpbnN0IGF2YWlsYWJsZSBnZW5yZXNcclxuICAgKi9cclxuICB2YWxpZGF0ZUdlbnJlcyhnZW5yZU5hbWVzOiBzdHJpbmdbXSk6IHsgdmFsaWQ6IHN0cmluZ1tdOyBpbnZhbGlkOiBzdHJpbmdbXSB9IHtcclxuICAgIGNvbnN0IGF2YWlsYWJsZUdlbnJlcyA9IHRoaXMuZ2V0QXZhaWxhYmxlR2VucmVzKCkubWFwKGcgPT4gZy50b0xvd2VyQ2FzZSgpKTtcclxuICAgIGNvbnN0IHZhbGlkOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgY29uc3QgaW52YWxpZDogc3RyaW5nW10gPSBbXTtcclxuICAgIFxyXG4gICAgZm9yIChjb25zdCBnZW5yZSBvZiBnZW5yZU5hbWVzKSB7XHJcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRHZW5yZSA9IGdlbnJlLnRvTG93ZXJDYXNlKCkudHJpbSgpO1xyXG4gICAgICBpZiAoYXZhaWxhYmxlR2VucmVzLmluY2x1ZGVzKG5vcm1hbGl6ZWRHZW5yZSkpIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBwcm9wZXJseSBjYXBpdGFsaXplZCB2ZXJzaW9uXHJcbiAgICAgICAgY29uc3QgcHJvcGVyR2VucmUgPSBPYmplY3QudmFsdWVzKEdFTlJFX01BUCkuZmluZChnID0+IGcudG9Mb3dlckNhc2UoKSA9PT0gbm9ybWFsaXplZEdlbnJlKTtcclxuICAgICAgICBpZiAocHJvcGVyR2VucmUpIHtcclxuICAgICAgICAgIHZhbGlkLnB1c2gocHJvcGVyR2VucmUpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBpbnZhbGlkLnB1c2goZ2VucmUpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiB7IHZhbGlkLCBpbnZhbGlkIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgZmFsbGJhY2sgbW92aWVzIGZyb20gY2FjaGUgb2Ygb3RoZXIgcm9vbXMgd2l0aCBzaW1pbGFyIGdlbnJlc1xyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZ2V0RmFsbGJhY2tGcm9tQ2FjaGUoZ2VucmVzPzogc3RyaW5nW10pOiBQcm9taXNlPENhY2hlZE1vdmllW10+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIElmIG5vIGdlbnJlcyBzcGVjaWZpZWQsIHRyeSB0byBnZXQgYW55IGNhY2hlZCBtb3ZpZXNcclxuICAgICAgaWYgKCFnZW5yZXMgfHwgZ2VucmVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5SNIFNlYXJjaGluZyBmb3IgYW55IGNhY2hlZCBtb3ZpZXMgYXMgZmFsbGJhY2snKTtcclxuICAgICAgICAvLyBUaGlzIGlzIGEgc2ltcGxpZmllZCBhcHByb2FjaCAtIGluIHByb2R1Y3Rpb24geW91IG1pZ2h0IHdhbnQgdG8gc2NhbiB0aGUgY2FjaGUgdGFibGVcclxuICAgICAgICByZXR1cm4gW107XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFRyeSB0byBmaW5kIGNhY2hlZCBtb3ZpZXMgdGhhdCBtYXRjaCB0aGUgcmVxdWVzdGVkIGdlbnJlc1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+UjSBTZWFyY2hpbmcgZm9yIGNhY2hlZCBtb3ZpZXMgd2l0aCBnZW5yZXM6ICR7Z2VucmVzLmpvaW4oJywgJyl9YCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBDcmVhdGUgYSBnZW5yZS1iYXNlZCBjYWNoZSBrZXkgdG8gbG9vayBmb3Igc2ltaWxhciBjb250ZW50XHJcbiAgICAgIGNvbnN0IGdlbnJlS2V5ID0gYGdlbnJlXyR7Z2VucmVzLnNvcnQoKS5qb2luKCdfJykudG9Mb3dlckNhc2UoKX1gO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5NT1ZJRV9DQUNIRV9UQUJMRSEsXHJcbiAgICAgICAgS2V5OiB7IGNhY2hlS2V5OiBnZW5yZUtleSB9LFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBpZiAocmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICAgIGNvbnN0IGNhY2hlID0gcmVzcG9uc2UuSXRlbSBhcyBNb3ZpZUNhY2hlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGlmIGNhY2hlIGlzIG5vdCBleHBpcmVkXHJcbiAgICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcclxuICAgICAgICBpZiAobm93IDw9IGNhY2hlLnR0bCkge1xyXG4gICAgICAgICAgY29uc29sZS5sb2coYOKchSBGb3VuZCAke2NhY2hlLm1vdmllcy5sZW5ndGh9IG1vdmllcyBmcm9tIGdlbnJlLWJhc2VkIGNhY2hlIGZhbGxiYWNrYCk7XHJcbiAgICAgICAgICByZXR1cm4gY2FjaGUubW92aWVzLnNsaWNlKDAsIHRoaXMuREVGQVVMVF9DQUNIRV9TSVpFKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBbXTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBnZXR0aW5nIGZhbGxiYWNrIGZyb20gY2FjaGU6JywgZXJyb3IpO1xyXG4gICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgY2lyY3VpdCBicmVha2VyIHN0YXR1cyBmb3IgbW9uaXRvcmluZ1xyXG4gICAqL1xyXG4gIGdldENpcmN1aXRCcmVha2VyU3RhdHVzKCk6IHtcclxuICAgIHN0YXRlOiBDaXJjdWl0QnJlYWtlclN0YXRlO1xyXG4gICAgZmFpbHVyZUNvdW50OiBudW1iZXI7XHJcbiAgICBzdWNjZXNzQ291bnQ6IG51bWJlcjtcclxuICAgIGxhc3RGYWlsdXJlVGltZTogbnVtYmVyO1xyXG4gIH0ge1xyXG4gICAgcmV0dXJuIHRoaXMuY2lyY3VpdEJyZWFrZXIuZ2V0U3RhdHVzKCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZXNldCBjaXJjdWl0IGJyZWFrZXIgKGZvciBtYW51YWwgcmVjb3Zlcnkgb3IgdGVzdGluZylcclxuICAgKi9cclxuICByZXNldENpcmN1aXRCcmVha2VyKCk6IHZvaWQge1xyXG4gICAgdGhpcy5jaXJjdWl0QnJlYWtlci5yZXNldCgpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2hlY2sgaWYgVE1EQiBBUEkgaXMgYXZhaWxhYmxlIHRocm91Z2ggY2lyY3VpdCBicmVha2VyXHJcbiAgICovXHJcbiAgYXN5bmMgaXNBcGlBdmFpbGFibGUoKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICBjb25zdCBzdGF0dXMgPSB0aGlzLmNpcmN1aXRCcmVha2VyLmdldFN0YXR1cygpO1xyXG4gICAgcmV0dXJuIHN0YXR1cy5zdGF0ZSAhPT0gQ2lyY3VpdEJyZWFrZXJTdGF0ZS5PUEVOO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGZhbGxiYWNrIG1vdmllcyB3aGVuIFRNREIgQVBJIGZhaWxzXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBnZXRGYWxsYmFja01vdmllcygpOiBQcm9taXNlPENhY2hlZE1vdmllW10+IHtcclxuICAgIC8vIFBvcHVsYXIgbW92aWUgSURzIGFzIGZhbGxiYWNrXHJcbiAgICBjb25zdCBmYWxsYmFja01vdmllSWRzID0gW1xyXG4gICAgICA1NTAsIDU1MSwgNTUyLCA1NTMsIDU1NCwgNTU1LCA1NTYsIDU1NywgNTU4LCA1NTksXHJcbiAgICAgIDU2MCwgNTYxLCA1NjIsIDU2MywgNTY0LCA1NjUsIDU2NiwgNTY3LCA1NjgsIDU2OSxcclxuICAgICAgNTcwLCA1NzEsIDU3MiwgNTczLCA1NzQsIDU3NSwgNTc2LCA1NzcsIDU3OCwgNTc5XHJcbiAgICBdO1xyXG5cclxuICAgIHJldHVybiBmYWxsYmFja01vdmllSWRzLm1hcCgoaWQsIGluZGV4KSA9PiAoe1xyXG4gICAgICB0bWRiSWQ6IGlkLFxyXG4gICAgICB0aXRsZTogYFBlbMOtY3VsYSBQb3B1bGFyICR7aW5kZXggKyAxfWAsXHJcbiAgICAgIHBvc3RlclBhdGg6IGBodHRwczovL2ltYWdlLnRtZGIub3JnL3QvcC93NTAwL3BsYWNlaG9sZGVyJHtpZH0uanBnYCxcclxuICAgICAgb3ZlcnZpZXc6IGBFc3RhIGVzIHVuYSBwZWzDrWN1bGEgcG9wdWxhciBjb24gSUQgJHtpZH0uIExvcyBkZXRhbGxlcyBzZSBjYXJnYXLDoW4gZGVzZGUgVE1EQiBjdWFuZG8gc2UgYWNjZWRhLmAsXHJcbiAgICAgIGdlbnJlczogWydhY2Npw7NuJywgJ2RyYW1hJ10sIC8vIFVzZSBwcm9wZXIgU3BhbmlzaCBnZW5yZXMgaW5zdGVhZCBvZiAnUG9wdWxhcidcclxuICAgICAgeWVhcjogMjAyMyxcclxuICAgICAgcmF0aW5nOiA3LjUsXHJcbiAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHR0bDogRGF0ZS5ub3coKSArICh0aGlzLkNBQ0hFX1RUTF9IT1VSUyAqIDYwICogNjAgKiAxMDAwKSxcclxuICAgIH0pKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFN0b3JlIG1vdmllIGNhY2hlIGluIER5bmFtb0RCXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBzdG9yZUNhY2hlSW5EeW5hbW9EQihyb29tSWQ6IHN0cmluZywgbW92aWVzOiBDYWNoZWRNb3ZpZVtdLCBnZW5yZXM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBjYWNoZTogTW92aWVDYWNoZSA9IHtcclxuICAgICAgY2FjaGVLZXk6IHJvb21JZCxcclxuICAgICAgbW92aWVzLFxyXG4gICAgICBnZW5yZUZpbHRlcnM6IGdlbnJlcyxcclxuICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgdHRsOiBEYXRlLm5vdygpICsgKHRoaXMuQ0FDSEVfVFRMX0hPVVJTICogNjAgKiA2MCAqIDEwMDApLFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuTU9WSUVfQ0FDSEVfVEFCTEUhLFxyXG4gICAgICBJdGVtOiBjYWNoZSxcclxuICAgIH0pKTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg8J+SviBTdG9yZWQgY2FjaGUgZm9yIHJvb20gJHtyb29tSWR9OiAke21vdmllcy5sZW5ndGh9IG1vdmllc2ApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRGVsZXRlIGNhY2hlIGZyb20gRHluYW1vREJcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZUNhY2hlRnJvbUR5bmFtb0RCKHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgVXBkYXRlQ29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuTU9WSUVfQ0FDSEVfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgY2FjaGVLZXk6IHJvb21JZCB9LFxyXG4gICAgICBVcGRhdGVFeHByZXNzaW9uOiAnUkVNT1ZFIG1vdmllcywgZ2VucmVGaWx0ZXJzLCBjYWNoZWRBdCcsXHJcbiAgICAgIENvbmRpdGlvbkV4cHJlc3Npb246ICdhdHRyaWJ1dGVfZXhpc3RzKGNhY2hlS2V5KScsXHJcbiAgICB9KSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgY2FjaGUgc3RhdGlzdGljcyBmb3IgbW9uaXRvcmluZ1xyXG4gICAqL1xyXG4gIGFzeW5jIGdldENhY2hlU3RhdHMocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPHtcclxuICAgIGV4aXN0czogYm9vbGVhbjtcclxuICAgIG1vdmllQ291bnQ6IG51bWJlcjtcclxuICAgIGdlbnJlczogc3RyaW5nW107XHJcbiAgICBjYWNoZWRBdD86IHN0cmluZztcclxuICAgIGV4cGlyZXNBdD86IHN0cmluZztcclxuICAgIGlzRXhwaXJlZDogYm9vbGVhbjtcclxuICB9PiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52Lk1PVklFX0NBQ0hFX1RBQkxFISxcclxuICAgICAgICBLZXk6IHsgY2FjaGVLZXk6IHJvb21JZCB9LFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBpZiAoIXJlc3BvbnNlLkl0ZW0pIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgZXhpc3RzOiBmYWxzZSxcclxuICAgICAgICAgIG1vdmllQ291bnQ6IDAsXHJcbiAgICAgICAgICBnZW5yZXM6IFtdLFxyXG4gICAgICAgICAgaXNFeHBpcmVkOiBmYWxzZSxcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBjYWNoZSA9IHJlc3BvbnNlLkl0ZW0gYXMgTW92aWVDYWNoZTtcclxuICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcclxuICAgICAgY29uc3QgaXNFeHBpcmVkID0gbm93ID4gY2FjaGUudHRsO1xyXG5cclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBleGlzdHM6IHRydWUsXHJcbiAgICAgICAgbW92aWVDb3VudDogY2FjaGUubW92aWVzLmxlbmd0aCxcclxuICAgICAgICBnZW5yZXM6IGNhY2hlLmdlbnJlRmlsdGVycyxcclxuICAgICAgICBjYWNoZWRBdDogY2FjaGUuY2FjaGVkQXQsXHJcbiAgICAgICAgZXhwaXJlc0F0OiBuZXcgRGF0ZShjYWNoZS50dGwpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgaXNFeHBpcmVkLFxyXG4gICAgICB9O1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBnZXR0aW5nIGNhY2hlIHN0YXRzOicsIGVycm9yKTtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBleGlzdHM6IGZhbHNlLFxyXG4gICAgICAgIG1vdmllQ291bnQ6IDAsXHJcbiAgICAgICAgZ2VucmVzOiBbXSxcclxuICAgICAgICBpc0V4cGlyZWQ6IGZhbHNlLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLy8gRXhwb3J0IHNpbmdsZXRvbiBpbnN0YW5jZVxyXG5leHBvcnQgY29uc3QgbW92aWVDYWNoZVNlcnZpY2UgPSBuZXcgTW92aWVDYWNoZVNlcnZpY2UoKTtcclxuXHJcbi8vIEV4cG9ydCBDaXJjdWl0QnJlYWtlclN0YXRlIGZvciBleHRlcm5hbCB1c2VcclxuZXhwb3J0IHsgQ2lyY3VpdEJyZWFrZXJTdGF0ZSB9OyJdfQ==