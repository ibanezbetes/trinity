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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC1maWx0ZXItc2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvbnRlbnQtZmlsdGVyLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7O0dBVUc7OztBQUdILGlFQUE0RDtBQUM1RCw2REFBK0Q7QUFDL0QsaUVBQTREO0FBK0I1RCxNQUFhLG9CQUFvQjtJQUsvQjtRQUNFLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSx5Q0FBa0IsRUFBRSxDQUFDO1FBQzNDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLDRDQUF1QixFQUFFLENBQUM7UUFDdkQsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLHlDQUFrQixFQUFFLENBQUM7SUFDL0MsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxRQUF3QjtRQUMvQyxPQUFPLENBQUMsR0FBRyxDQUFDLGdFQUFnRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXhGLElBQUksQ0FBQztZQUNILG9CQUFvQjtZQUNwQixNQUFNLGFBQWEsR0FBRyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDekUsSUFBSSxhQUFhLElBQUksYUFBYSxDQUFDLE1BQU0sSUFBSSxFQUFFLEVBQUUsQ0FBQztnQkFDaEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpREFBaUQsYUFBYSxDQUFDLE1BQU0sU0FBUyxDQUFDLENBQUM7Z0JBQzVGLE9BQU8sYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDcEMsQ0FBQztZQUVELGdEQUFnRDtZQUNoRCxNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFFeEUsb0JBQW9CO1lBQ3BCLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFR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WUFDbkUsUUFBUTtZQUNSLE9BQU8sRUFBRSxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsaURBQWlEO1NBQ2pGLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUE1TEQsb0RBNExDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIENvbnRlbnRGaWx0ZXJTZXJ2aWNlIC0gQWR2YW5jZWQgQ29udGVudCBGaWx0ZXJpbmcgU3lzdGVtXHJcbiAqIFxyXG4gKiBPcmNoZXN0cmF0ZXMgdGhlIGZpbHRlcmluZyBhbmQgbG9hZGluZyBvZiBjb250ZW50IHVzaW5nOlxyXG4gKiAtIFByaW9yaXR5IEFsZ29yaXRobSAoMy10aWVyIHN5c3RlbSlcclxuICogLSBUTURCIEFQSSBpbnRlZ3JhdGlvblxyXG4gKiAtIENhY2hlIG1hbmFnZW1lbnRcclxuICogLSBDb250ZW50IGV4Y2x1c2lvbiB0cmFja2luZ1xyXG4gKiBcclxuICogUmVxdWlyZW1lbnRzOiAzLjEsIDUuMSwgNS4yLCA1LjNcclxuICovXHJcblxyXG5pbXBvcnQgeyBNZWRpYVR5cGUgfSBmcm9tICcuLi90eXBlcy9jb250ZW50LWZpbHRlcmluZy10eXBlcyc7XHJcbmltcG9ydCB7IEVuaGFuY2VkVE1EQkNsaWVudCB9IGZyb20gJy4vZW5oYW5jZWQtdG1kYi1jbGllbnQnO1xyXG5pbXBvcnQgeyBQcmlvcml0eUFsZ29yaXRobUVuZ2luZSB9IGZyb20gJy4vcHJpb3JpdHktYWxnb3JpdGhtJztcclxuaW1wb3J0IHsgRmlsdGVyQ2FjaGVNYW5hZ2VyIH0gZnJvbSAnLi9maWx0ZXItY2FjaGUtbWFuYWdlcic7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEZpbHRlckNyaXRlcmlhIHtcclxuICBtZWRpYVR5cGU6IE1lZGlhVHlwZTtcclxuICBnZW5yZXM6IG51bWJlcltdOyAgLy8gTWF4aW11bSAzIGdlbnJlc1xyXG4gIHJvb21JZDogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIENvbnRlbnRQb29sRW50cnkge1xyXG4gIHRtZGJJZDogc3RyaW5nO1xyXG4gIG1lZGlhVHlwZTogTWVkaWFUeXBlO1xyXG4gIHRpdGxlOiBzdHJpbmc7XHJcbiAgcG9zdGVyUGF0aD86IHN0cmluZztcclxuICBvdmVydmlldzogc3RyaW5nO1xyXG4gIGdlbnJlSWRzOiBudW1iZXJbXTtcclxuICB2b3RlQXZlcmFnZTogbnVtYmVyO1xyXG4gIHJlbGVhc2VEYXRlOiBzdHJpbmc7XHJcbiAgcHJpb3JpdHk6IDEgfCAyIHwgMztcclxuICBhZGRlZEF0OiBzdHJpbmc7IC8vIElTTyBzdHJpbmcgZm9yIER5bmFtb0RCIGNvbXBhdGliaWxpdHlcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBSb29tIHtcclxuICBpZDogc3RyaW5nO1xyXG4gIG5hbWU6IHN0cmluZztcclxuICBmaWx0ZXJDcml0ZXJpYT86IEZpbHRlckNyaXRlcmlhO1xyXG4gIGNvbnRlbnRQb29sOiBDb250ZW50UG9vbEVudHJ5W107XHJcbiAgZXhjbHVkZWRDb250ZW50SWRzOiBzdHJpbmdbXTtcclxuICBsYXN0Q29udGVudFJlZnJlc2g6IERhdGU7XHJcbiAgLy8gLi4uIG90aGVyIHJvb20gZmllbGRzXHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBDb250ZW50RmlsdGVyU2VydmljZSB7XHJcbiAgcHJpdmF0ZSB0bWRiQ2xpZW50OiBFbmhhbmNlZFRNREJDbGllbnQ7XHJcbiAgcHJpdmF0ZSBwcmlvcml0eUFsZ29yaXRobTogUHJpb3JpdHlBbGdvcml0aG1FbmdpbmU7XHJcbiAgcHJpdmF0ZSBjYWNoZU1hbmFnZXI6IEZpbHRlckNhY2hlTWFuYWdlcjtcclxuXHJcbiAgY29uc3RydWN0b3IoKSB7XHJcbiAgICB0aGlzLnRtZGJDbGllbnQgPSBuZXcgRW5oYW5jZWRUTURCQ2xpZW50KCk7XHJcbiAgICB0aGlzLnByaW9yaXR5QWxnb3JpdGhtID0gbmV3IFByaW9yaXR5QWxnb3JpdGhtRW5naW5lKCk7XHJcbiAgICB0aGlzLmNhY2hlTWFuYWdlciA9IG5ldyBGaWx0ZXJDYWNoZU1hbmFnZXIoKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZXMgYSBmaWx0ZXJlZCByb29tIHdpdGggcHJlLWxvYWRlZCBjb250ZW50IHBvb2xcclxuICAgKiBSZXF1aXJlbWVudHM6IDMuMSwgMy41XHJcbiAgICovXHJcbiAgYXN5bmMgY3JlYXRlRmlsdGVyZWRSb29tKGNyaXRlcmlhOiBGaWx0ZXJDcml0ZXJpYSk6IFByb21pc2U8Q29udGVudFBvb2xFbnRyeVtdPiB7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+OrCBDb250ZW50RmlsdGVyU2VydmljZTogQ3JlYXRpbmcgZmlsdGVyZWQgcm9vbSB3aXRoIGNyaXRlcmlhOmAsIGNyaXRlcmlhKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBDaGVjayBjYWNoZSBmaXJzdFxyXG4gICAgICBjb25zdCBjYWNoZWRDb250ZW50ID0gYXdhaXQgdGhpcy5jYWNoZU1hbmFnZXIuZ2V0Q2FjaGVkQ29udGVudChjcml0ZXJpYSk7XHJcbiAgICAgIGlmIChjYWNoZWRDb250ZW50ICYmIGNhY2hlZENvbnRlbnQubGVuZ3RoID49IDMwKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKchSBDb250ZW50RmlsdGVyU2VydmljZTogVXNpbmcgY2FjaGVkIGNvbnRlbnQgKCR7Y2FjaGVkQ29udGVudC5sZW5ndGh9IGl0ZW1zKWApO1xyXG4gICAgICAgIHJldHVybiBjYWNoZWRDb250ZW50LnNsaWNlKDAsIDMwKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gR2VuZXJhdGUgbmV3IGNvbnRlbnQgdXNpbmcgcHJpb3JpdHkgYWxnb3JpdGhtXHJcbiAgICAgIGNvbnN0IGNvbnRlbnRQb29sID0gYXdhaXQgdGhpcy5nZW5lcmF0ZVByaW9yaXRpemVkQ29udGVudChjcml0ZXJpYSwgW10pO1xyXG4gICAgICBcclxuICAgICAgLy8gQ2FjaGUgdGhlIHJlc3VsdHNcclxuICAgICAgYXdhaXQgdGhpcy5jYWNoZU1hbmFnZXIuc2V0Q2FjaGVkQ29udGVudChjcml0ZXJpYSwgY29udGVudFBvb2wpO1xyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYOKchSBDb250ZW50RmlsdGVyU2VydmljZTogR2VuZXJhdGVkICR7Y29udGVudFBvb2wubGVuZ3RofSBpdGVtcyBmb3Igcm9vbSAke2NyaXRlcmlhLnJvb21JZH1gKTtcclxuICAgICAgcmV0dXJuIGNvbnRlbnRQb29sO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBDb250ZW50RmlsdGVyU2VydmljZTogRXJyb3IgY3JlYXRpbmcgZmlsdGVyZWQgcm9vbTpgLCBlcnJvcik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogTG9hZHMgYWRkaXRpb25hbCBjb250ZW50IGZvciByb29tIHdoZW4gcG9vbCBpcyBsb3dcclxuICAgKiBSZXF1aXJlbWVudHM6IDUuMSwgNS4yXHJcbiAgICovXHJcbiAgYXN5bmMgbG9hZENvbnRlbnRQb29sKHJvb21JZDogc3RyaW5nLCBleGNsdWRlSWRzOiBzdHJpbmdbXSk6IFByb21pc2U8Q29udGVudFBvb2xFbnRyeVtdPiB7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+UhCBDb250ZW50RmlsdGVyU2VydmljZTogTG9hZGluZyBjb250ZW50IHBvb2wgZm9yIHJvb20gJHtyb29tSWR9LCBleGNsdWRpbmcgJHtleGNsdWRlSWRzLmxlbmd0aH0gaXRlbXNgKTtcclxuXHJcbiAgICAvLyBUaGlzIHdvdWxkIHR5cGljYWxseSBnZXQgdGhlIHJvb20ncyBmaWx0ZXIgY3JpdGVyaWEgZnJvbSBkYXRhYmFzZVxyXG4gICAgLy8gRm9yIG5vdywgd2UnbGwgdXNlIGEgZmFsbGJhY2sgYXBwcm9hY2hcclxuICAgIGNvbnN0IGNyaXRlcmlhOiBGaWx0ZXJDcml0ZXJpYSA9IHtcclxuICAgICAgbWVkaWFUeXBlOiAnTU9WSUUnLFxyXG4gICAgICBnZW5yZXM6IFtdLFxyXG4gICAgICByb29tSWRcclxuICAgIH07XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgY29udGVudFBvb2wgPSBhd2FpdCB0aGlzLmdlbmVyYXRlUHJpb3JpdGl6ZWRDb250ZW50KGNyaXRlcmlhLCBleGNsdWRlSWRzKTtcclxuICAgICAgY29uc29sZS5sb2coYOKchSBDb250ZW50RmlsdGVyU2VydmljZTogTG9hZGVkICR7Y29udGVudFBvb2wubGVuZ3RofSBhZGRpdGlvbmFsIGl0ZW1zYCk7XHJcbiAgICAgIHJldHVybiBjb250ZW50UG9vbDtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgQ29udGVudEZpbHRlclNlcnZpY2U6IEVycm9yIGxvYWRpbmcgY29udGVudCBwb29sOmAsIGVycm9yKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXRzIGF2YWlsYWJsZSBnZW5yZXMgZm9yIGEgbWVkaWEgdHlwZVxyXG4gICAqIFJlcXVpcmVtZW50czogMS40LCAyLjFcclxuICAgKi9cclxuICBhc3luYyBnZXRBdmFpbGFibGVHZW5yZXMobWVkaWFUeXBlOiBNZWRpYVR5cGUpOiBQcm9taXNlPEFycmF5PHtpZDogbnVtYmVyLCBuYW1lOiBzdHJpbmd9Pj4ge1xyXG4gICAgY29uc29sZS5sb2coYPCfjq0gQ29udGVudEZpbHRlclNlcnZpY2U6IEdldHRpbmcgYXZhaWxhYmxlIGdlbnJlcyBmb3IgJHttZWRpYVR5cGV9YCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgZ2VucmVzID0gYXdhaXQgdGhpcy50bWRiQ2xpZW50LmdldEdlbnJlcyhtZWRpYVR5cGUpO1xyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIENvbnRlbnRGaWx0ZXJTZXJ2aWNlOiBSZXRyaWV2ZWQgJHtnZW5yZXMubGVuZ3RofSBnZW5yZXMgZm9yICR7bWVkaWFUeXBlfWApO1xyXG4gICAgICByZXR1cm4gZ2VucmVzO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBDb250ZW50RmlsdGVyU2VydmljZTogRXJyb3IgZ2V0dGluZyBnZW5yZXM6YCwgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdlbmVyYXRlcyBwcmlvcml0aXplZCBjb250ZW50IHVzaW5nIHRoZSAzLXRpZXIgYWxnb3JpdGhtXHJcbiAgICogUHJpdmF0ZSBtZXRob2QgdGhhdCBpbXBsZW1lbnRzIHRoZSBjb3JlIGZpbHRlcmluZyBsb2dpY1xyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZ2VuZXJhdGVQcmlvcml0aXplZENvbnRlbnQoXHJcbiAgICBjcml0ZXJpYTogRmlsdGVyQ3JpdGVyaWEsIFxyXG4gICAgZXhjbHVkZUlkczogc3RyaW5nW11cclxuICApOiBQcm9taXNlPENvbnRlbnRQb29sRW50cnlbXT4ge1xyXG4gICAgY29uc29sZS5sb2coYPCfjq8gQ29udGVudEZpbHRlclNlcnZpY2U6IEdlbmVyYXRpbmcgcHJpb3JpdGl6ZWQgY29udGVudGAsIHsgY3JpdGVyaWEsIGV4Y2x1ZGVDb3VudDogZXhjbHVkZUlkcy5sZW5ndGggfSk7XHJcblxyXG4gICAgY29uc3QgcmVzdWx0czogQ29udGVudFBvb2xFbnRyeVtdID0gW107XHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIFByaW9yaXR5IDE6IEFsbCBnZW5yZXMgKEFORCBsb2dpYykgLSB1cCB0byAxNSBpdGVtc1xyXG4gICAgICBpZiAoY3JpdGVyaWEuZ2VucmVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+lhyBQcmlvcml0eSAxOiBGZXRjaGluZyBjb250ZW50IHdpdGggQUxMIGdlbnJlcyBbJHtjcml0ZXJpYS5nZW5yZXMuam9pbignLCcpfV1gKTtcclxuICAgICAgICBjb25zdCBhbGxHZW5yZXNDb250ZW50ID0gYXdhaXQgdGhpcy50bWRiQ2xpZW50LmRpc2NvdmVyQ29udGVudCh7XHJcbiAgICAgICAgICBtZWRpYVR5cGU6IGNyaXRlcmlhLm1lZGlhVHlwZSxcclxuICAgICAgICAgIHdpdGhHZW5yZXM6IGNyaXRlcmlhLmdlbnJlcy5qb2luKCcsJyksIC8vIENvbW1hLXNlcGFyYXRlZCBmb3IgQU5EIGxvZ2ljXHJcbiAgICAgICAgICBzb3J0Qnk6ICd2b3RlX2F2ZXJhZ2UuZGVzYycsXHJcbiAgICAgICAgICBleGNsdWRlSWRzXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHByaW9yaXR5MUl0ZW1zID0gdGhpcy5wcmlvcml0eUFsZ29yaXRobS5yYW5kb21pemVDb250ZW50KGFsbEdlbnJlc0NvbnRlbnQpXHJcbiAgICAgICAgICAuc2xpY2UoMCwgMTUpXHJcbiAgICAgICAgICAubWFwKGl0ZW0gPT4gdGhpcy5tYXBUb0NvbnRlbnRQb29sRW50cnkoaXRlbSwgMSwgbm93KSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmVzdWx0cy5wdXNoKC4uLnByaW9yaXR5MUl0ZW1zKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIFByaW9yaXR5IDE6IEFkZGVkICR7cHJpb3JpdHkxSXRlbXMubGVuZ3RofSBpdGVtc2ApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBQcmlvcml0eSAyOiBBbnkgZ2VucmUgKE9SIGxvZ2ljKSAtIGZpbGwgdXAgdG8gMzAgaXRlbXNcclxuICAgICAgaWYgKGNyaXRlcmlhLmdlbnJlcy5sZW5ndGggPiAwICYmIHJlc3VsdHMubGVuZ3RoIDwgMzApIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+liCBQcmlvcml0eSAyOiBGZXRjaGluZyBjb250ZW50IHdpdGggQU5ZIGdlbnJlIFske2NyaXRlcmlhLmdlbnJlcy5qb2luKCd8Jyl9XWApO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRFeGNsdWRlSWRzID0gWy4uLmV4Y2x1ZGVJZHMsIC4uLnJlc3VsdHMubWFwKHIgPT4gci50bWRiSWQpXTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBhbnlHZW5yZUNvbnRlbnQgPSBhd2FpdCB0aGlzLnRtZGJDbGllbnQuZGlzY292ZXJDb250ZW50KHtcclxuICAgICAgICAgIG1lZGlhVHlwZTogY3JpdGVyaWEubWVkaWFUeXBlLFxyXG4gICAgICAgICAgd2l0aEdlbnJlczogY3JpdGVyaWEuZ2VucmVzLmpvaW4oJ3wnKSwgLy8gUGlwZS1zZXBhcmF0ZWQgZm9yIE9SIGxvZ2ljXHJcbiAgICAgICAgICBzb3J0Qnk6ICdwb3B1bGFyaXR5LmRlc2MnLFxyXG4gICAgICAgICAgZXhjbHVkZUlkczogY3VycmVudEV4Y2x1ZGVJZHNcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgbmVlZGVkID0gMzAgLSByZXN1bHRzLmxlbmd0aDtcclxuICAgICAgICBjb25zdCBwcmlvcml0eTJJdGVtcyA9IHRoaXMucHJpb3JpdHlBbGdvcml0aG0ucmFuZG9taXplQ29udGVudChhbnlHZW5yZUNvbnRlbnQpXHJcbiAgICAgICAgICAuc2xpY2UoMCwgbmVlZGVkKVxyXG4gICAgICAgICAgLm1hcChpdGVtID0+IHRoaXMubWFwVG9Db250ZW50UG9vbEVudHJ5KGl0ZW0sIDIsIG5vdykpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJlc3VsdHMucHVzaCguLi5wcmlvcml0eTJJdGVtcyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYOKchSBQcmlvcml0eSAyOiBBZGRlZCAke3ByaW9yaXR5Mkl0ZW1zLmxlbmd0aH0gaXRlbXNgKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gUHJpb3JpdHkgMzogUG9wdWxhciBmYWxsYmFjayAtIGZpbGwgcmVtYWluaW5nIHNsb3RzXHJcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA8IDMwKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfpYkgUHJpb3JpdHkgMzogRmV0Y2hpbmcgcG9wdWxhciAke2NyaXRlcmlhLm1lZGlhVHlwZX0gY29udGVudGApO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRFeGNsdWRlSWRzID0gWy4uLmV4Y2x1ZGVJZHMsIC4uLnJlc3VsdHMubWFwKHIgPT4gci50bWRiSWQpXTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBwb3B1bGFyQ29udGVudCA9IGF3YWl0IHRoaXMudG1kYkNsaWVudC5kaXNjb3ZlckNvbnRlbnQoe1xyXG4gICAgICAgICAgbWVkaWFUeXBlOiBjcml0ZXJpYS5tZWRpYVR5cGUsXHJcbiAgICAgICAgICBzb3J0Qnk6ICdwb3B1bGFyaXR5LmRlc2MnLFxyXG4gICAgICAgICAgZXhjbHVkZUlkczogY3VycmVudEV4Y2x1ZGVJZHNcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgbmVlZGVkID0gMzAgLSByZXN1bHRzLmxlbmd0aDtcclxuICAgICAgICBjb25zdCBwcmlvcml0eTNJdGVtcyA9IHRoaXMucHJpb3JpdHlBbGdvcml0aG0ucmFuZG9taXplQ29udGVudChwb3B1bGFyQ29udGVudClcclxuICAgICAgICAgIC5zbGljZSgwLCBuZWVkZWQpXHJcbiAgICAgICAgICAubWFwKGl0ZW0gPT4gdGhpcy5tYXBUb0NvbnRlbnRQb29sRW50cnkoaXRlbSwgMywgbm93KSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmVzdWx0cy5wdXNoKC4uLnByaW9yaXR5M0l0ZW1zKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIFByaW9yaXR5IDM6IEFkZGVkICR7cHJpb3JpdHkzSXRlbXMubGVuZ3RofSBpdGVtc2ApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg8J+OryBDb250ZW50RmlsdGVyU2VydmljZTogR2VuZXJhdGVkICR7cmVzdWx0cy5sZW5ndGh9IHRvdGFsIGl0ZW1zYCk7XHJcbiAgICAgIHJldHVybiByZXN1bHRzO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBDb250ZW50RmlsdGVyU2VydmljZTogRXJyb3IgaW4gZ2VuZXJhdGVQcmlvcml0aXplZENvbnRlbnQ6YCwgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIE1hcHMgVE1EQiBjb250ZW50IHRvIENvbnRlbnRQb29sRW50cnkgZm9ybWF0XHJcbiAgICovXHJcbiAgcHJpdmF0ZSBtYXBUb0NvbnRlbnRQb29sRW50cnkoXHJcbiAgICB0bWRiSXRlbTogYW55LCBcclxuICAgIHByaW9yaXR5OiAxIHwgMiB8IDMsIFxyXG4gICAgYWRkZWRBdDogRGF0ZVxyXG4gICk6IENvbnRlbnRQb29sRW50cnkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgdG1kYklkOiB0bWRiSXRlbS5pZC50b1N0cmluZygpLFxyXG4gICAgICBtZWRpYVR5cGU6IHRtZGJJdGVtLm1lZGlhX3R5cGUgfHwgJ01PVklFJyxcclxuICAgICAgdGl0bGU6IHRtZGJJdGVtLnRpdGxlIHx8IHRtZGJJdGVtLm5hbWUsXHJcbiAgICAgIHBvc3RlclBhdGg6IHRtZGJJdGVtLnBvc3Rlcl9wYXRoID8gYGh0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAke3RtZGJJdGVtLnBvc3Rlcl9wYXRofWAgOiB1bmRlZmluZWQsXHJcbiAgICAgIG92ZXJ2aWV3OiB0bWRiSXRlbS5vdmVydmlldyB8fCAnJyxcclxuICAgICAgZ2VucmVJZHM6IHRtZGJJdGVtLmdlbnJlX2lkcyB8fCBbXSxcclxuICAgICAgdm90ZUF2ZXJhZ2U6IHRtZGJJdGVtLnZvdGVfYXZlcmFnZSB8fCAwLFxyXG4gICAgICByZWxlYXNlRGF0ZTogdG1kYkl0ZW0ucmVsZWFzZV9kYXRlIHx8IHRtZGJJdGVtLmZpcnN0X2Fpcl9kYXRlIHx8ICcnLFxyXG4gICAgICBwcmlvcml0eSxcclxuICAgICAgYWRkZWRBdDogYWRkZWRBdC50b0lTT1N0cmluZygpIC8vIFN0b3JlIGFzIElTTyBzdHJpbmcgZm9yIER5bmFtb0RCIGNvbXBhdGliaWxpdHlcclxuICAgIH07XHJcbiAgfVxyXG59Il19