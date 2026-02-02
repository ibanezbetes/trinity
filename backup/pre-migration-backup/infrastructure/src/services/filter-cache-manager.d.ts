/**
 * FilterCacheManager - Efficient Cache Management for Content Filtering
 *
 * Manages caching of filtered content by unique FilterCriteria combinations:
 * - Cache key generation from FilterCriteria
 * - Cache storage and retrieval with DynamoDB
 * - Cache expiration and invalidation
 * - Content exclusion tracking per room
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
import { FilterCriteria, ContentPoolEntry } from './content-filter-service';
export interface FilterCacheEntry {
    cacheKey: string;
    mediaType: string;
    genreIds: number[];
    content: ContentPoolEntry[];
    createdAt: Date | string;
    expiresAt: Date | string;
    totalAvailable: number;
}
export interface RoomExclusions {
    roomId: string;
    excludedIds: Set<string>;
    lastUpdated: Date;
}
export declare class FilterCacheManager {
    private dynamoClient;
    private cacheTableName;
    private exclusionsTableName;
    private readonly CACHE_TTL_HOURS;
    constructor();
    /**
     * Gets cached content for specific filter criteria
     * Requirements: 7.1, 7.2
     */
    getCachedContent(criteria: FilterCriteria): Promise<ContentPoolEntry[] | null>;
    /**
     * Stores content in cache with expiration
     * Requirements: 7.1, 7.2, 7.3
     */
    setCachedContent(criteria: FilterCriteria, content: ContentPoolEntry[]): Promise<void>;
    /**
     * Invalidates cache entry for specific criteria
     * Requirements: 7.3, 7.5
     */
    invalidateCache(criteria: FilterCriteria): Promise<void>;
    /**
     * Tracks content that has been shown in a room to avoid repetition
     * Requirements: 7.4
     */
    trackShownContent(roomId: string, contentIds: string[]): Promise<void>;
    /**
     * Gets list of content IDs that have been shown in a room
     * Requirements: 7.4
     */
    getRoomExclusions(roomId: string): Promise<string[]>;
    /**
     * Generates unique cache key from FilterCriteria
     * Requirements: 7.1
     */
    private generateCacheKey;
    /**
     * Cleans up expired cache entries (maintenance function)
     * Requirements: 7.3, 7.5
     */
    cleanupExpiredCache(): Promise<void>;
}
