/**
 * ContentFilterService - Advanced Content Filtering System
 *
 * Orchestrates the filtering and loading of content using:
 * - Priority Algorithm (3-tier system)
 * - TMDB API integration
 * - Cache management
 * - Content exclusion tracking
 *
 * Requirements: 3.1, 5.1, 5.2, 5.3
 */
import { MediaType } from '../types/content-filtering-types';
export interface FilterCriteria {
    mediaType: MediaType;
    genres: number[];
    roomId: string;
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
    priority: 1 | 2 | 3;
    addedAt: string;
}
export interface Room {
    id: string;
    name: string;
    filterCriteria?: FilterCriteria;
    contentPool: ContentPoolEntry[];
    excludedContentIds: string[];
    lastContentRefresh: Date;
}
export declare class ContentFilterService {
    private tmdbClient;
    private priorityAlgorithm;
    private cacheManager;
    constructor();
    /**
     * Creates a filtered room with pre-loaded content pool
     * Requirements: 3.1, 3.5
     */
    createFilteredRoom(criteria: FilterCriteria): Promise<ContentPoolEntry[]>;
    /**
     * Loads additional content for room when pool is low
     * Requirements: 5.1, 5.2
     */
    loadContentPool(roomId: string, excludeIds: string[]): Promise<ContentPoolEntry[]>;
    /**
     * Gets available genres for a media type
     * Requirements: 1.4, 2.1
     */
    getAvailableGenres(mediaType: MediaType): Promise<Array<{
        id: number;
        name: string;
    }>>;
    /**
     * Generates prioritized content using the 3-tier algorithm
     * Private method that implements the core filtering logic
     */
    private generatePrioritizedContent;
    /**
     * Maps TMDB content to ContentPoolEntry format
     */
    private mapToContentPoolEntry;
}
