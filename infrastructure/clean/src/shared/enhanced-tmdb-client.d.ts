/**
 * Enhanced TMDB Client - Extracted from MONOLITH-TRINITY-CACHE-FINAL.js
 * CRITICAL BUSINESS LOGIC: Preserves all filtering and validation logic
 * CRITICAL FIX: Includes JA/KO language support and strict media type validation
 */
/**
 * CRITICAL: Genre ID mapping between Movies and TV
 * Some genres have different IDs between movie and TV endpoints
 */
export declare const GENRE_MAPPING: Record<number, number>;
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
    private apiKey;
    private baseUrl;
    private requestCount;
    private lastRequestTime;
    private readonly RATE_LIMIT_DELAY;
    constructor(apiKey?: string);
    validateMediaType(mediaType: string): void;
    mapGenreIds(genreIds: number[], targetMediaType: string): number[];
    selectEndpoint(mediaType: string): string;
    discoverContent(params: TMDBSearchParams): Promise<TMDBItem[]>;
    /**
     * CRITICAL BUSINESS LOGIC: The Matrix Detection
     * This validation prevents movies from appearing in TV rooms
     */
    validateContentFieldsBusinessLogic(item: TMDBItem, expectedMediaType: string): boolean;
    private parseGenreString;
    private enforceRateLimit;
    private exponentialBackoff;
    getGenres(mediaType: string): Promise<{
        id: number;
        name: string;
    }[]>;
    getGenreMapping(): Record<number, number>;
    mapSingleGenreId(movieGenreId: number): number;
}
