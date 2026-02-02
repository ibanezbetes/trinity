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
        
        // Genre mapping for different media types - COMPLETE MAPPING
        this.GENRE_MAPPING = {
            // Géneros que necesitan mapeo obligatorio (0 contenido en TV)
            28: { MOVIE: 28, TV: 18 },    // Action -> Drama (series de acción suelen ser dramáticas)
            12: { MOVIE: 12, TV: 18 },    // Adventure -> Drama (aventuras épicas como GoT)
            14: { MOVIE: 14, TV: 18 },    // Fantasy -> Drama (fantasía épica como GoT, LOTR)
            10402: { MOVIE: 10402, TV: 99 }, // Music -> Documentary (documentales musicales)
            878: { MOVIE: 878, TV: 18 },  // Science Fiction -> Drama (sci-fi series como Black Mirror)
            10752: { MOVIE: 10752, TV: 36 }, // War -> History (series históricas de guerra)
            
            // Géneros con poco contenido - mapear para mejor experiencia
            27: { MOVIE: 27, TV: 9648 },  // Horror -> Mystery (más contenido relevante)
            53: { MOVIE: 53, TV: 80 },    // Thriller -> Crime (más contenido relevante)
            
            // Géneros que funcionan bien - mantener sin cambios
            16: { MOVIE: 16, TV: 16 },    // Animation
            35: { MOVIE: 35, TV: 35 },    // Comedy
            80: { MOVIE: 80, TV: 80 },    // Crime
            99: { MOVIE: 99, TV: 99 },    // Documentary
            18: { MOVIE: 18, TV: 18 },    // Drama
            10751: { MOVIE: 10751, TV: 10751 }, // Family
            36: { MOVIE: 36, TV: 36 },    // History
            9648: { MOVIE: 9648, TV: 9648 }, // Mystery
            10749: { MOVIE: 10749, TV: 10749 }, // Romance
            37: { MOVIE: 37, TV: 37 }     // Western
        };
    }
    
    /**
     * Maps genre IDs to appropriate ones for the given media type
     */
    mapGenresForMediaType(genreIds, mediaType) {
        const mappedGenres = genreIds.map(genreId => {
            const mapping = this.GENRE_MAPPING[genreId];
            if (mapping && mapping[mediaType]) {
                const originalGenre = genreId;
                const mappedGenre = mapping[mediaType];
                if (originalGenre !== mappedGenre) {
                    console.log(`🔄 Genre mapping: ${originalGenre} -> ${mappedGenre} for ${mediaType}`);
                }
                return mappedGenre;
            }
            return genreId; // Keep original if no mapping exists
        });
        
        console.log(`🎯 Genre mapping result: [${genreIds.join(',')}] -> [${mappedGenres.join(',')}] for ${mediaType}`);
        return mappedGenres;
    }
    /**
     * Creates a filtered room with pre-loaded content pool
     * Requirements: 3.1, 3.5
     */
    async createFilteredRoom(criteria) {
        console.log(`🎬 ContentFilterService: Creating filtered room with criteria:`, criteria);
        try {
            // TEMPORARY: Skip cache to force fresh content generation
            console.log(`🔄 ContentFilterService: Skipping cache, generating fresh content`);
            
            // Generate new content using priority algorithm
            const contentPool = await this.generatePrioritizedContent(criteria, []);
            
            // Cache the results for future use
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
        
        // Apply genre mapping for media type
        const originalGenres = criteria.genres;
        const mappedGenres = this.mapGenresForMediaType(criteria.genres, criteria.mediaType);
        
        // Create updated criteria with mapped genres
        const updatedCriteria = {
            ...criteria,
            genres: mappedGenres
        };
        
        const results = [];
        const now = new Date();
        try {
            // Priority 1: All genres (AND logic) - up to 15 items
            if (updatedCriteria.genres.length > 0) {
                console.log(`🥇 Priority 1: Fetching content with ALL genres [${updatedCriteria.genres.join(',')}]`);
                const allGenresContent = await this.tmdbClient.discoverContent({
                    mediaType: updatedCriteria.mediaType,
                    withGenres: updatedCriteria.genres.join(','), // Comma-separated for AND logic
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
            if (updatedCriteria.genres.length > 0 && results.length < 30) {
                console.log(`🥈 Priority 2: Fetching content with ANY genre [${updatedCriteria.genres.join('|')}]`);
                const currentExcludeIds = [...excludeIds, ...results.map(r => r.tmdbId)];
                const anyGenreContent = await this.tmdbClient.discoverContent({
                    mediaType: updatedCriteria.mediaType,
                    withGenres: updatedCriteria.genres.join('|'), // Pipe-separated for OR logic
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
            // Priority 3: Popular fallback with same genres - fill remaining slots
            if (results.length < 30) {
                console.log(`🥉 Priority 3: Fetching popular ${updatedCriteria.mediaType} content with same genres`);
                const currentExcludeIds = [...excludeIds, ...results.map(r => r.tmdbId)];
                
                // IMPORTANT: Still apply genre filtering in fallback to maintain relevance
                const fallbackParams = {
                    mediaType: updatedCriteria.mediaType,
                    sortBy: 'popularity.desc',
                    excludeIds: currentExcludeIds
                };
                
                // Apply genre filtering even in fallback if genres are specified
                if (updatedCriteria.genres.length > 0) {
                    fallbackParams.withGenres = updatedCriteria.genres.join('|'); // OR logic for broader results
                    console.log(`🎯 Priority 3: Applying genre filter [${updatedCriteria.genres.join('|')}] to maintain relevance`);
                }
                
                const popularContent = await this.tmdbClient.discoverContent(fallbackParams);
                const needed = 30 - results.length;
                const priority3Items = this.priorityAlgorithm.randomizeContent(popularContent)
                    .slice(0, needed)
                    .map(item => this.mapToContentPoolEntry(item, 3, now));
                results.push(...priority3Items);
                console.log(`✅ Priority 3: Added ${priority3Items.length} items with genre filtering`);
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
