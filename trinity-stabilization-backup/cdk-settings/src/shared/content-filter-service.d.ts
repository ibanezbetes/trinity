/**
 * Content Filter Service - Extracted from MONOLITH files
 *
 * CRITICAL BUSINESS LOGIC:
 * - 50-movie pre-caching system with genre prioritization
 * - Western-only language filtering (en,es,fr,it,de,pt) - NO Asian languages per requirements
 * - Genre prioritization: BOTH genres > ANY genre > Popular content
 * - Zero tolerance quality gates
 * - Critical movie detection in TV rooms
 *
 * Requirements: 1.4, 3.1, 3.5
 */
import { TMDBItem, TMDBGenre } from './enhanced-tmdb-client.js';
export interface FilterCriteria {
    mediaType: 'MOVIE' | 'TV';
    genres: number[];
    roomId?: string;
}
export interface ValidatedContent {
    tmdbId: string;
    mediaType: 'MOVIE' | 'TV';
    title: string;
    posterPath: string;
    overview: string;
    genreIds: number[];
    voteAverage: number;
    voteCount: number;
    popularity: number;
    releaseDate: string;
    priority: number;
    addedAt: string;
}
export declare class ContentFilterService {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly WESTERN_LANGUAGES;
    constructor(apiKey?: string);
    /**
     * Creates a filtered room with exactly 50 movies using immutable business logic
     */
    createFilteredRoom(criteria: FilterCriteria): Promise<ValidatedContent[]>;
    /**
     * Validates input criteria
     */
    private validateInput;
    /**
     * Configures the exclusive endpoint for the media type
     */
    private configureExclusiveEndpoint;
    /**
     * Fetch and filter loop with genre prioritization
     */
    private fetchAndFilterLoop;
    /**
     * Fetches a batch of content with specific genre query
     */
    private fetchBatchWithGenres;
    /**
     * Fetches a batch from TMDB API
     */
    private fetchTMDBBatch;
    /**
     * Applies quality gate validation with zero tolerance
     */
    private applyQualityGate;
    /**
     * Loads content pool for a room (legacy compatibility)
     */
    loadContentPool(roomId: string, excludeIds: string[], originalCriteria?: FilterCriteria): Promise<ValidatedContent[]>;
    /**
     * Gets available genres for a media type
     */
    getAvailableGenres(mediaType: 'MOVIE' | 'TV'): Promise<TMDBGenre[]>;
    /**
     * Validates business logic for a content item
     */
    validateBusinessLogic(item: TMDBItem): boolean;
    /**
     * Checks if item has valid description
     */
    hasValidDescription(item: TMDBItem): boolean;
    /**
     * Checks if language is western
     */
    isWesternLanguage(language: string): boolean;
    /**
     * Checks if item meets quality gates
     */
    meetsQualityGates(item: TMDBItem): boolean;
    /**
     * Gets the western languages list
     */
    getWesternLanguages(): string[];
}
