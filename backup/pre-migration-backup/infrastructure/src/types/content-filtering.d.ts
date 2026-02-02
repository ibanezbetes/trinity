/**
 * Advanced Content Filtering - Core Types and Interfaces
 *
 * This file defines the core data models and interfaces for the advanced
 * content filtering system that allows users to create rooms with specific
 * media type and genre filters.
 */
export declare enum MediaType {
    MOVIE = "MOVIE",
    TV = "TV"
}
export declare enum Priority {
    ALL_GENRES = 1,// Priority 1: Content with ALL selected genres
    ANY_GENRE = 2,// Priority 2: Content with AT LEAST ONE selected genre  
    POPULAR = 3
}
export interface FilterCriteria {
    mediaType: MediaType;
    genreIds: number[];
    roomId: string;
}
export interface Genre {
    id: number;
    name: string;
    mediaType: MediaType;
}
export interface TMDBContent {
    id: string;
    title: string;
    poster_path?: string;
    overview: string;
    genre_ids: number[];
    vote_average: number;
    release_date?: string;
}
export interface ContentPoolEntry {
    tmdbId: string;
    mediaType: MediaType;
    title: string;
    posterPath?: string;
    overview: string;
    genreIds: number[];
    voteAverage: number;
    releaseDate: string;
    priority: Priority;
    addedAt: Date;
}
export interface PrioritizedContent {
    content: TMDBContent[];
    priority: Priority;
    randomized: boolean;
}
export interface ExtendedRoom {
    id: string;
    name: string;
    createdBy: string;
    participants: string[];
    filterCriteria?: FilterCriteria;
    contentPool: ContentPoolEntry[];
    excludedContentIds: string[];
    lastContentRefresh: Date;
    currentContentIndex: number;
}
export interface FilterCacheEntry {
    cacheKey: string;
    mediaType: MediaType;
    genreIds: number[];
    content: TMDBContent[];
    createdAt: Date;
    expiresAt: Date;
    totalAvailable: number;
}
export interface RoomExclusions {
    roomId: string;
    excludedIds: Set<string>;
    lastUpdated: Date;
}
export interface DiscoverParams {
    withGenres?: string;
    sortBy: 'popularity.desc' | 'vote_average.desc';
    page: number;
    excludeIds?: string[];
}
export interface ContentFilterService {
    createFilteredRoom(criteria: FilterCriteria): Promise<ExtendedRoom>;
    loadContentPool(roomId: string, excludeIds: string[]): Promise<TMDBContent[]>;
    getAvailableGenres(mediaType: MediaType): Promise<Genre[]>;
}
export interface PriorityAlgorithm {
    prioritizeContent(content: TMDBContent[], criteria: FilterCriteria): PrioritizedContent[];
}
export interface TMDBClient {
    discoverMovies(params: DiscoverParams): Promise<TMDBContent[]>;
    discoverTV(params: DiscoverParams): Promise<TMDBContent[]>;
    getMovieGenres(): Promise<Genre[]>;
    getTVGenres(): Promise<Genre[]>;
}
export interface FilterCacheManager {
    getCachedContent(criteria: FilterCriteria): Promise<TMDBContent[] | null>;
    setCachedContent(criteria: FilterCriteria, content: TMDBContent[]): Promise<void>;
    invalidateCache(criteria: FilterCriteria): Promise<void>;
    trackShownContent(roomId: string, contentIds: string[]): Promise<void>;
}
export interface MediaTypeSelectorProps {
    onSelect: (type: MediaType) => void;
    selectedType?: MediaType;
    disabled?: boolean;
}
export interface GenreSelectorProps {
    genres: Genre[];
    maxSelection: number;
    selectedGenres: number[];
    onSelectionChange: (selected: number[]) => void;
    disabled?: boolean;
}
export interface FilterSummaryProps {
    criteria: FilterCriteria;
    estimatedCount: number;
    loading?: boolean;
}
export declare const CONTENT_FILTERING_CONSTANTS: {
    readonly MAX_GENRES_PER_ROOM: 3;
    readonly CONTENT_POOL_SIZE: 30;
    readonly MIN_CONTENT_THRESHOLD: 5;
    readonly CACHE_TTL_DAYS: 30;
    readonly MAX_PAGES_TO_FETCH: 10;
};
export declare class ContentFilteringError extends Error {
    code: string;
    details?: any | undefined;
    constructor(message: string, code: string, details?: any | undefined);
}
export declare enum ErrorCodes {
    INVALID_MEDIA_TYPE = "INVALID_MEDIA_TYPE",
    TOO_MANY_GENRES = "TOO_MANY_GENRES",
    TMDB_API_ERROR = "TMDB_API_ERROR",
    CACHE_ERROR = "CACHE_ERROR",
    INSUFFICIENT_CONTENT = "INSUFFICIENT_CONTENT",
    FILTER_IMMUTABLE = "FILTER_IMMUTABLE"
}
