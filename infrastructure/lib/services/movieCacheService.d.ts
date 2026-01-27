declare global {
    function fetch(input: string, init?: any): Promise<any>;
}
export interface CachedMovie {
    tmdbId: number;
    title: string;
    posterPath: string;
    overview: string;
    genres: string[];
    year?: number;
    rating?: number;
    cachedAt: string;
    ttl: number;
}
export interface MovieCache {
    cacheKey: string;
    movies: CachedMovie[];
    genreFilters: string[];
    cachedAt: string;
    ttl: number;
}
export interface TMDBMovie {
    id: number;
    title: string;
    poster_path: string | null;
    overview: string;
    genre_ids: number[];
    release_date: string;
    vote_average: number;
}
export interface TMDBResponse {
    results: TMDBMovie[];
    total_pages: number;
    total_results: number;
}
/**
 * Circuit Breaker States
 */
declare enum CircuitBreakerState {
    CLOSED = "CLOSED",// Normal operation, requests go through
    OPEN = "OPEN",// Circuit is open, requests fail fast
    HALF_OPEN = "HALF_OPEN"
}
/**
 * Movie Cache Service
 * Handles pre-caching of movies for instant loading during voting sessions
 */
export declare class MovieCacheService {
    private readonly CACHE_TTL_HOURS;
    private readonly DEFAULT_CACHE_SIZE;
    private readonly MAX_CACHE_SIZE;
    private readonly MIN_CACHE_SIZE;
    private readonly circuitBreaker;
    /**
     * Pre-cache movies for a room with optional genre filtering
     * Implements cache-first strategy with circuit breaker fallback
     */
    preCacheMovies(roomId: string, genres?: string[]): Promise<CachedMovie[]>;
    /**
     * Get cached movies for a room
     */
    getCachedMovies(roomId: string): Promise<CachedMovie[]>;
    /**
     * Refresh cache for a room
     */
    refreshCache(roomId: string, genres?: string[]): Promise<void>;
    /**
     * Fetch movies from TMDB API with genre filtering
     */
    private fetchMoviesFromTMDB;
    /**
     * Convert genre names to TMDB genre IDs
     */
    private genreNamesToIds;
    /**
     * Get list of available genres
     */
    getAvailableGenres(): string[];
    /**
     * Validate genre names against available genres
     */
    validateGenres(genreNames: string[]): {
        valid: string[];
        invalid: string[];
    };
    /**
     * Get fallback movies from cache of other rooms with similar genres
     */
    private getFallbackFromCache;
    /**
     * Get circuit breaker status for monitoring
     */
    getCircuitBreakerStatus(): {
        state: CircuitBreakerState;
        failureCount: number;
        successCount: number;
        lastFailureTime: number;
    };
    /**
     * Reset circuit breaker (for manual recovery or testing)
     */
    resetCircuitBreaker(): void;
    /**
     * Check if TMDB API is available through circuit breaker
     */
    isApiAvailable(): Promise<boolean>;
    /**
     * Get fallback movies when TMDB API fails
     */
    private getFallbackMovies;
    /**
     * Store movie cache in DynamoDB
     */
    private storeCacheInDynamoDB;
    /**
     * Delete cache from DynamoDB
     */
    private deleteCacheFromDynamoDB;
    /**
     * Get cache statistics for monitoring
     */
    getCacheStats(roomId: string): Promise<{
        exists: boolean;
        movieCount: number;
        genres: string[];
        cachedAt?: string;
        expiresAt?: string;
        isExpired: boolean;
    }>;
}
export declare const movieCacheService: MovieCacheService;
export { CircuitBreakerState };
