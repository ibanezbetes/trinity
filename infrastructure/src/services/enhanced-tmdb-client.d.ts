/**
 * EnhancedTMDBClient - TMDB API Integration with Discover Endpoints
 *
 * Provides optimized communication with TMDB API for content filtering:
 * - Discover movies and TV shows with genre filtering
 * - Support for AND/OR genre logic
 * - Genre list retrieval
 * - CRITICAL: Genre ID mapping between Movies and TV
 * - Error handling and rate limiting
 *
 * Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
import { MediaType } from '../types/content-filtering-types';
export interface DiscoverParams {
    mediaType: MediaType;
    withGenres?: string;
    sortBy?: 'popularity.desc' | 'vote_average.desc';
    page?: number;
    excludeIds?: string[];
}
export interface TMDBContent {
    id: number;
    title?: string;
    name?: string;
    overview: string;
    poster_path?: string;
    backdrop_path?: string;
    genre_ids: number[];
    vote_average: number;
    release_date?: string;
    first_air_date?: string;
    media_type?: string;
}
export interface Genre {
    id: number;
    name: string;
}
export declare class EnhancedTMDBClient {
    private apiKey;
    private baseUrl;
    private requestCount;
    private lastRequestTime;
    private readonly RATE_LIMIT_DELAY;
    constructor();
    /**
     * ENHANCED: Validates mediaType strictly
     * Requirements: 1.1, 3.1
     */
    private validateMediaType;
    /**
     * CRITICAL: Maps genre IDs from movie format to TV format when needed
     * Requirements: 1.2, 3.5
     */
    private mapGenreIds;
    /**
     * ENHANCED: Validates genre IDs for target media type
     * Requirements: 1.2, 3.2
     */
    private validateGenreIds;
    /**
     * ENHANCED: Selects correct TMDB endpoint with validation
     * Requirements: 3.1, 3.2, 3.4
     */
    private selectEndpoint;
    /**
     * Discovers movies using TMDB discover endpoint
     * Requirements: 4.1, 4.3, 4.4
     */
    discoverMovies(params: Omit<DiscoverParams, 'mediaType'>): Promise<TMDBContent[]>;
    /**
     * Discovers TV shows using TMDB discover endpoint
     * Requirements: 4.2, 4.3, 4.4
     */
    discoverTV(params: Omit<DiscoverParams, 'mediaType'>): Promise<TMDBContent[]>;
    /**
     * ENHANCED: Generic discover method with genre mapping and validation
     * Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5
     */
    discoverContent(params: DiscoverParams): Promise<TMDBContent[]>;
    /**
     * HELPER: Parses genre string into array of numbers
     * Supports both comma-separated (AND) and pipe-separated (OR) formats
     */
    private parseGenreString;
    /**
     * Gets available genres for movies
     * Requirements: 1.4, 2.1
     */
    getMovieGenres(): Promise<Genre[]>;
    /**
     * Gets available genres for TV shows
     * Requirements: 1.4, 2.1
     */
    getTVGenres(): Promise<Genre[]>;
    /**
     * Generic method to get genres for any media type
     * Requirements: 1.4, 2.1
     */
    getGenres(mediaType: MediaType): Promise<Genre[]>;
    /**
     * ENHANCED: Validates that content has all required fields and matches media type
     * Requirements: 4.5, 1.3, 1.4
     */
    private validateContentFields;
    /**
     * Enforces rate limiting to respect TMDB API limits
     * Requirements: 4.6
     */
    private enforceRateLimit;
    /**
     * Implements exponential backoff for error recovery
     * Requirements: 4.6
     */
    private exponentialBackoff;
    /**
     * UTILITY: Gets genre mapping information for debugging
     * Requirements: 1.2, 3.5
     */
    getGenreMapping(): {
        [movieGenreId: number]: number;
    };
    /**
     * UTILITY: Maps a single genre ID from movie to TV format
     * Requirements: 1.2, 3.5
     */
    mapSingleGenreId(movieGenreId: number): number;
}
