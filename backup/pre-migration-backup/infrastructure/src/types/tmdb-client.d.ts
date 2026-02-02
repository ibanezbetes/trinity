/**
 * TMDB API Client Interfaces
 *
 * This file defines interfaces for enhanced TMDB API integration
 * supporting the discover endpoints for movies and TV shows with
 * advanced genre filtering capabilities.
 */
import { MediaType, Genre, TMDBContent } from './content-filtering';
/**
 * Raw TMDB API response structure for discover endpoints
 */
export interface TMDBDiscoverResponse {
    page: number;
    results: TMDBRawContent[];
    total_pages: number;
    total_results: number;
}
/**
 * Raw content item from TMDB API (before transformation)
 */
export interface TMDBRawContent {
    id: number;
    title?: string;
    original_title?: string;
    release_date?: string;
    name?: string;
    original_name?: string;
    first_air_date?: string;
    poster_path?: string;
    backdrop_path?: string;
    overview: string;
    genre_ids: number[];
    vote_average: number;
    vote_count: number;
    popularity: number;
    adult?: boolean;
    video?: boolean;
    original_language: string;
}
/**
 * TMDB Genre List Response
 */
export interface TMDBGenreResponse {
    genres: TMDBRawGenre[];
}
/**
 * Raw genre from TMDB API
 */
export interface TMDBRawGenre {
    id: number;
    name: string;
}
/**
 * Configuration for TMDB API client
 */
export interface TMDBClientConfig {
    apiKey: string;
    baseUrl?: string;
    language?: string;
    region?: string;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
}
/**
 * Parameters for discover API calls
 */
export interface TMDBDiscoverParams {
    with_genres?: string;
    without_genres?: string;
    sort_by?: 'popularity.desc' | 'popularity.asc' | 'vote_average.desc' | 'vote_average.asc' | 'release_date.desc' | 'release_date.asc';
    page?: number;
    primary_release_date_gte?: string;
    primary_release_date_lte?: string;
    first_air_date_gte?: string;
    first_air_date_lte?: string;
    vote_average_gte?: number;
    vote_average_lte?: number;
    vote_count_gte?: number;
    with_original_language?: string;
    region?: string;
    include_adult?: boolean;
    include_video?: boolean;
}
/**
 * Enhanced TMDB client with advanced filtering capabilities
 */
export interface EnhancedTMDBClient {
    /**
     * Discover movies with advanced filtering
     */
    discoverMovies(params: TMDBDiscoverParams): Promise<TMDBContent[]>;
    /**
     * Discover TV shows with advanced filtering
     */
    discoverTV(params: TMDBDiscoverParams): Promise<TMDBContent[]>;
    /**
     * Generic discover method that works for both movies and TV
     */
    discover(mediaType: MediaType, params: TMDBDiscoverParams): Promise<TMDBContent[]>;
    /**
     * Get all available movie genres
     */
    getMovieGenres(): Promise<Genre[]>;
    /**
     * Get all available TV genres
     */
    getTVGenres(): Promise<Genre[]>;
    /**
     * Get genres for specific media type
     */
    getGenres(mediaType: MediaType): Promise<Genre[]>;
    /**
     * Get detailed information for a specific movie
     */
    getMovieDetails(movieId: string): Promise<TMDBContent>;
    /**
     * Get detailed information for a specific TV show
     */
    getTVDetails(tvId: string): Promise<TMDBContent>;
    /**
     * Fetch multiple pages of content in parallel
     */
    discoverMultiplePages(mediaType: MediaType, params: TMDBDiscoverParams, maxPages: number): Promise<TMDBContent[]>;
    /**
     * Get content with all specified genres (AND logic)
     */
    getContentWithAllGenres(mediaType: MediaType, genreIds: number[], maxResults?: number): Promise<TMDBContent[]>;
    /**
     * Get content with any of the specified genres (OR logic)
     */
    getContentWithAnyGenre(mediaType: MediaType, genreIds: number[], maxResults?: number): Promise<TMDBContent[]>;
    /**
     * Get popular content of specified media type
     */
    getPopularContent(mediaType: MediaType, maxResults?: number): Promise<TMDBContent[]>;
}
/**
 * Factory interface for creating TMDB clients
 */
export interface TMDBClientFactory {
    create(config: TMDBClientConfig): EnhancedTMDBClient;
    createWithDefaults(apiKey: string): EnhancedTMDBClient;
}
/**
 * TMDB API specific errors
 */
export declare class TMDBApiError extends Error {
    statusCode: number;
    endpoint: string;
    params?: any | undefined;
    constructor(message: string, statusCode: number, endpoint: string, params?: any | undefined);
}
/**
 * Rate limiting error
 */
export declare class TMDBRateLimitError extends TMDBApiError {
    retryAfter: number;
    constructor(retryAfter: number, endpoint: string);
}
/**
 * Genre ID mapping for common genres
 */
export declare const TMDB_GENRE_IDS: {
    readonly ACTION: 28;
    readonly ADVENTURE: 12;
    readonly ANIMATION: 16;
    readonly COMEDY: 35;
    readonly CRIME: 80;
    readonly DOCUMENTARY: 99;
    readonly DRAMA: 18;
    readonly FAMILY: 10751;
    readonly FANTASY: 14;
    readonly HISTORY: 36;
    readonly HORROR: 27;
    readonly MUSIC: 10402;
    readonly MYSTERY: 9648;
    readonly ROMANCE: 10749;
    readonly SCIENCE_FICTION: 878;
    readonly THRILLER: 53;
    readonly WAR: 10752;
    readonly WESTERN: 37;
    readonly ACTION_ADVENTURE: 10759;
    readonly KIDS: 10762;
    readonly NEWS: 10763;
    readonly REALITY: 10764;
    readonly SOAP: 10766;
    readonly TALK: 10767;
    readonly WAR_POLITICS: 10768;
};
/**
 * Helper type for genre ID values
 */
export type TMDBGenreId = typeof TMDB_GENRE_IDS[keyof typeof TMDB_GENRE_IDS];
/**
 * Content transformation utilities
 */
export interface ContentTransformer {
    transformRawContent(raw: TMDBRawContent, mediaType: MediaType): TMDBContent;
    transformRawGenre(raw: TMDBRawGenre, mediaType: MediaType): Genre;
    buildPosterUrl(posterPath: string, size?: string): string;
    buildBackdropUrl(backdropPath: string, size?: string): string;
}
