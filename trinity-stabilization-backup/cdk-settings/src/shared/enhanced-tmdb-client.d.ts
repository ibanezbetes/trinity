/**
 * Enhanced TMDB Client - Extracted from MONOLITH files
 *
 * CRITICAL BUSINESS LOGIC:
 * - Western-only language filtering (en,es,fr,it,de,pt) - NO Asian languages per requirements
 * - Genre mapping between Movie and TV endpoints
 * - Strict endpoint enforcement (Movie vs TV)
 * - Business logic validation with zero tolerance
 * - Rate limiting and error handling
 *
 * Requirements: 1.4, 3.1, 3.5
 */
/**
 * CRITICAL: Genre ID mapping between Movies and TV
 * Some genres have different IDs between movie and TV endpoints
 */
export declare const GENRE_MAPPING: {
    readonly 28: 10759;
    readonly 12: 10759;
    readonly 37: 37;
    readonly 10752: 10768;
};
export interface TMDBSearchParams {
    mediaType: 'MOVIE' | 'TV';
    withGenres?: string;
    sortBy?: string;
    page?: number;
    excludeIds?: string[];
}
export interface TMDBItem {
    id: number;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    overview: string;
    poster_path: string;
    genre_ids: number[];
    vote_average: number;
    vote_count: number;
    popularity: number;
    original_language: string;
    adult: boolean;
    media_type?: string;
}
export interface TMDBGenre {
    id: number;
    name: string;
}
export declare class EnhancedTMDBClient {
    private readonly apiKey;
    private readonly baseUrl;
    private requestCount;
    private lastRequestTime;
    private readonly RATE_LIMIT_DELAY;
    private readonly WESTERN_LANGUAGES;
    constructor(apiKey?: string);
    /**
     * Validates media type - CRITICAL for endpoint enforcement
     */
    validateMediaType(mediaType: string): void;
    /**
     * Maps genre IDs from Movie to TV format when needed
     */
    mapGenreIds(genreIds: number[], targetMediaType: 'MOVIE' | 'TV'): number[];
    /**
     * Selects the correct TMDB endpoint based on media type
     */
    selectEndpoint(mediaType: 'MOVIE' | 'TV'): string;
    /**
     * Discovers content with strict business logic enforcement
     */
    discoverContent(params: TMDBSearchParams): Promise<TMDBItem[]>;
    /**
     * Validates content fields with zero tolerance business logic
     */
    validateContentFieldsBusinessLogic(item: TMDBItem, expectedMediaType: 'MOVIE' | 'TV'): boolean;
    /**
     * Gets available genres for a media type
     */
    getGenres(mediaType: 'MOVIE' | 'TV'): Promise<TMDBGenre[]>;
    /**
     * Parses genre string (comma or pipe separated)
     */
    parseGenreString(genreString: string): number[];
    /**
     * Enforces rate limiting
     */
    private enforceRateLimit;
    /**
     * Implements exponential backoff for rate limiting
     */
    private exponentialBackoff;
    /**
     * Gets the genre mapping configuration
     */
    getGenreMapping(): typeof GENRE_MAPPING;
    /**
     * Maps a single genre ID from Movie to TV format
     */
    mapSingleGenreId(movieGenreId: number): number;
    /**
     * Gets the western languages list
     */
    getWesternLanguages(): string[];
}
