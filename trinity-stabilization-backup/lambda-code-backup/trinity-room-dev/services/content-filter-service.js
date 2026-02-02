"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentFilterService = void 0;
const enhanced_tmdb_client_1 = require("./enhanced-tmdb-client");
const priority_algorithm_1 = require("./priority-algorithm");
const filter_cache_manager_1 = require("./filter-cache-manager");
class ContentFilterService {
    constructor() {
        this.tmdbClient = new enhanced_tmdb_client_1.EnhancedTMDBClient();
        this.priorityAlgorithm = new priority_algorithm_1.PriorityAlgorithmEngine();
        this.cacheManager = new filter_cache_manager_1.FilterCacheManager();
    }
    /**
     * Creates a filtered room with pre-loaded content pool
     * Requirements: 3.1, 3.5
     */
    async createFilteredRoom(criteria) {
        console.log(`🎬 ContentFilterService: Creating filtered room with criteria:`, criteria);
        try {
            // Check cache first
            const cachedContent = await this.cacheManager.getCachedContent(criteria);
            if (cachedContent && cachedContent.length >= 30) {
                console.log(`✅ ContentFilterService: Using cached content (${cachedContent.length} items)`);
                return cachedContent.slice(0, 30);
            }
            // Generate new content using priority algorithm
            const contentPool = await this.generatePrioritizedContent(criteria, []);
            // Cache the results
            await this.cacheManager.setCachedContent(criteria, contentPool);
            console.log(`✅ ContentFilterService: Generated ${contentPool.length} items for room ${criteria.roomId}`);
            return contentPool;
        }
        catch (error) {
            console.error(`❌ ContentFilterService: Error creating filtered room:`, error);
            throw error;
        }
    }
    /**
     * Loads additional content for room when pool is low
     * Requirements: 5.1, 5.2
     */
    async loadContentPool(roomId, excludeIds) {
        console.log(`🔄 ContentFilterService: Loading content pool for room ${roomId}, excluding ${excludeIds.length} items`);
        // This would typically get the room's filter criteria from database
        // For now, we'll use a fallback approach
        const criteria = {
            mediaType: 'MOVIE',
            genres: [],
            roomId
        };
        try {
            const contentPool = await this.generatePrioritizedContent(criteria, excludeIds);
            console.log(`✅ ContentFilterService: Loaded ${contentPool.length} additional items`);
            return contentPool;
        }
        catch (error) {
            console.error(`❌ ContentFilterService: Error loading content pool:`, error);
            throw error;
        }
    }
    /**
     * Gets available genres for a media type
     * Requirements: 1.4, 2.1
     */
    async getAvailableGenres(mediaType) {
        console.log(`🎭 ContentFilterService: Getting available genres for ${mediaType}`);
        try {
            const genres = await this.tmdbClient.getGenres(mediaType);
            console.log(`✅ ContentFilterService: Retrieved ${genres.length} genres for ${mediaType}`);
            return genres;
        }
        catch (error) {
            console.error(`❌ ContentFilterService: Error getting genres:`, error);
            throw error;
        }
    }
    /**
     * Generates prioritized content using the 3-tier algorithm
     * Private method that implements the core filtering logic
     */
    async generatePrioritizedContent(criteria, excludeIds) {
        console.log(`🎯 ContentFilterService: Generating prioritized content`, { criteria, excludeCount: excludeIds.length });
        const results = [];
        const now = new Date();
        try {
            // Priority 1: All genres (AND logic) - up to 15 items
            if (criteria.genres.length > 0) {
                console.log(`🥇 Priority 1: Fetching content with ALL genres [${criteria.genres.join(',')}]`);
                const allGenresContent = await this.tmdbClient.discoverContent({
                    mediaType: criteria.mediaType,
                    withGenres: criteria.genres.join(','), // Comma-separated for AND logic
                    sortBy: 'vote_average.desc',
                    excludeIds
                });
                const priority1Items = this.priorityAlgorithm.randomizeContent(allGenresContent)
                    .slice(0, 15)
                    .map(item => this.mapToContentPoolEntry(item, 1, now));
                results.push(...priority1Items);
                console.log(`✅ Priority 1: Added ${priority1Items.length} items`);
            }
            // Priority 2: Any genre (OR logic) - fill up to 30 items
            if (criteria.genres.length > 0 && results.length < 30) {
                console.log(`🥈 Priority 2: Fetching content with ANY genre [${criteria.genres.join('|')}]`);
                const currentExcludeIds = [...excludeIds, ...results.map(r => r.tmdbId)];
                const anyGenreContent = await this.tmdbClient.discoverContent({
                    mediaType: criteria.mediaType,
                    withGenres: criteria.genres.join('|'), // Pipe-separated for OR logic
                    sortBy: 'popularity.desc',
                    excludeIds: currentExcludeIds
                });
                const needed = 30 - results.length;
                const priority2Items = this.priorityAlgorithm.randomizeContent(anyGenreContent)
                    .slice(0, needed)
                    .map(item => this.mapToContentPoolEntry(item, 2, now));
                results.push(...priority2Items);
                console.log(`✅ Priority 2: Added ${priority2Items.length} items`);
            }
            // Priority 3: Popular fallback - fill remaining slots
            if (results.length < 30) {
                console.log(`🥉 Priority 3: Fetching popular ${criteria.mediaType} content`);
                const currentExcludeIds = [...excludeIds, ...results.map(r => r.tmdbId)];
                const popularContent = await this.tmdbClient.discoverContent({
                    mediaType: criteria.mediaType,
                    sortBy: 'popularity.desc',
                    excludeIds: currentExcludeIds
                });
                const needed = 30 - results.length;
                const priority3Items = this.priorityAlgorithm.randomizeContent(popularContent)
                    .slice(0, needed)
                    .map(item => this.mapToContentPoolEntry(item, 3, now));
                results.push(...priority3Items);
                console.log(`✅ Priority 3: Added ${priority3Items.length} items`);
            }
            console.log(`🎯 ContentFilterService: Generated ${results.length} total items`);
            return results;
        }
        catch (error) {
            console.error(`❌ ContentFilterService: Error in generatePrioritizedContent:`, error);
            throw error;
        }
    }
    /**
     * Maps TMDB content to ContentPoolEntry format
     */
    mapToContentPoolEntry(tmdbItem, priority, addedAt) {
        return {
            tmdbId: tmdbItem.id.toString(),
            mediaType: tmdbItem.media_type || 'MOVIE',
            title: tmdbItem.title || tmdbItem.name,
            posterPath: tmdbItem.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}` : undefined,
            overview: tmdbItem.overview || '',
            genreIds: tmdbItem.genre_ids || [],
            voteAverage: tmdbItem.vote_average || 0,
            releaseDate: tmdbItem.release_date || tmdbItem.first_air_date || '',
            priority,
            addedAt: addedAt.toISOString() // Store as ISO string for DynamoDB compatibility
        };
    }
}
exports.ContentFilterService = ContentFilterService;
