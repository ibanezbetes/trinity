"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentFilterService = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
class ContentFilterService {
    constructor(apiKey) {
        this.baseUrl = 'https://api.themoviedb.org/3';
        // CRITICAL: Western-only languages - NO Asian languages per requirements
        this.WESTERN_LANGUAGES = ['en', 'es', 'fr', 'it', 'de', 'pt'];
        this.apiKey = apiKey || process.env.TMDB_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('TMDB_API_KEY is required');
        }
        console.log('🎯 ContentFilterService initialized with IMMUTABLE BUSINESS LOGIC');
    }
    /**
     * Creates a filtered room with exactly 50 movies using immutable business logic
     */
    async createFilteredRoom(criteria) {
        console.log(`🎯 IMMUTABLE BUSINESS LOGIC: Starting room creation`, criteria);
        try {
            this.validateInput(criteria);
            const endpoint = this.configureExclusiveEndpoint(criteria.mediaType);
            const validItems = await this.fetchAndFilterLoop(criteria, endpoint);
            // CRITICAL: Accept fewer than 50 items if western-only filtering results in shortage
            if (validItems.length === 0) {
                throw new Error(`BUSINESS LOGIC FAILURE: No valid items found for ${criteria.mediaType}`);
            }
            console.log(`✅ IMMUTABLE BUSINESS LOGIC SUCCESS: Generated ${validItems.length} valid ${criteria.mediaType} items (target: 50)`);
            return validItems.slice(0, 50); // Ensure maximum 50 items
        }
        catch (error) {
            console.error(`❌ IMMUTABLE BUSINESS LOGIC ERROR:`, error);
            throw error;
        }
    }
    /**
     * Validates input criteria
     */
    validateInput(criteria) {
        if (!criteria.mediaType || !['TV', 'MOVIE'].includes(criteria.mediaType)) {
            throw new Error(`Invalid mediaType: ${criteria.mediaType}. Must be 'TV' or 'MOVIE'`);
        }
        if (!criteria.genres || !Array.isArray(criteria.genres)) {
            throw new Error('Genres must be an array');
        }
        if (criteria.genres.length > 2) {
            throw new Error('Maximum 2 genres allowed');
        }
        console.log(`✅ INPUT VALIDATION: MediaType=${criteria.mediaType}, Genres=[${criteria.genres.join(',')}]`);
    }
    /**
     * Configures the exclusive endpoint for the media type
     */
    configureExclusiveEndpoint(mediaType) {
        let endpoint;
        if (mediaType === 'TV') {
            endpoint = '/discover/tv';
            console.log(`📺 EXCLUSIVE ENDPOINT: ${endpoint} configured for TV content`);
        }
        else if (mediaType === 'MOVIE') {
            endpoint = '/discover/movie';
            console.log(`🎬 EXCLUSIVE ENDPOINT: ${endpoint} configured for MOVIE content`);
        }
        else {
            throw new Error(`CRITICAL: Invalid mediaType ${mediaType}`);
        }
        return endpoint;
    }
    /**
     * Fetch and filter loop with genre prioritization
     */
    async fetchAndFilterLoop(criteria, endpoint) {
        const validItems = [];
        const usedIds = new Set();
        console.log(`🔄 FETCH & FILTER LOOP: Starting for ${criteria.mediaType}`);
        // Priority 1: BOTH genres (AND logic)
        if (criteria.genres.length > 0) {
            console.log(`🥇 INTENTO 1 (AND): Fetching with BOTH genres [${criteria.genres.join(' AND ')}]`);
            await this.fetchBatchWithGenres(criteria, endpoint, criteria.genres.join(','), validItems, usedIds, 1);
        }
        // Priority 2: ANY genre (OR logic)
        if (criteria.genres.length > 0 && validItems.length < 50) {
            console.log(`🥈 INTENTO 2 (OR): Fetching with ANY genre [${criteria.genres.join(' OR ')}]`);
            await this.fetchBatchWithGenres(criteria, endpoint, criteria.genres.join('|'), validItems, usedIds, 2);
        }
        // Priority 3: Popular content (no genre filter)
        if (validItems.length < 50) {
            console.log(`🥉 RELLENO FINAL: Fetching popular ${criteria.mediaType} content`);
            await this.fetchBatchWithGenres(criteria, endpoint, null, validItems, usedIds, 3);
        }
        console.log(`🎯 FETCH & FILTER LOOP COMPLETE: ${validItems.length} valid items collected`);
        return validItems;
    }
    /**
     * Fetches a batch of content with specific genre query
     */
    async fetchBatchWithGenres(criteria, endpoint, genreQuery, validItems, usedIds, priority) {
        let page = 1;
        const maxPages = 5;
        while (validItems.length < 50 && page <= maxPages) {
            console.log(`📄 Fetching page ${page} for priority ${priority}`);
            const batch = await this.fetchTMDBBatch(criteria.mediaType, endpoint, genreQuery, page);
            if (!batch || batch.length === 0) {
                console.log(`⚠️ No more results for priority ${priority}, page ${page}`);
                break;
            }
            for (const item of batch) {
                if (validItems.length >= 50)
                    break;
                if (usedIds.has(item.id)) {
                    continue;
                }
                const validatedItem = this.applyQualityGate(item, criteria.mediaType, priority);
                if (validatedItem) {
                    validItems.push(validatedItem);
                    usedIds.add(item.id);
                }
            }
            page++;
        }
        console.log(`✅ Priority ${priority} complete: ${validItems.length} total valid items`);
    }
    /**
     * Fetches a batch from TMDB API
     */
    async fetchTMDBBatch(mediaType, endpoint, genreQuery, page) {
        const params = {
            api_key: this.apiKey,
            language: 'es-ES',
            page: page,
            sort_by: 'popularity.desc',
            include_adult: false,
            // CRITICAL: Western-only languages - NO Asian languages per requirements
            'with_original_language': this.WESTERN_LANGUAGES.join('|')
        };
        if (genreQuery) {
            params.with_genres = genreQuery;
        }
        const url = `${this.baseUrl}${endpoint}?${new URLSearchParams(params).toString()}`;
        console.log(`🌐 TMDB REQUEST: ${endpoint} (page ${page})`);
        console.log(`🚨 TMDB_URL_GENERATED: ${url}`);
        try {
            const response = await (0, node_fetch_1.default)(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Trinity-Backend/1.0'
                }
            });
            if (!response.ok) {
                throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return data.results || [];
        }
        catch (error) {
            console.error(`❌ TMDB API ERROR:`, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    /**
     * Applies quality gate validation with zero tolerance
     */
    applyQualityGate(tmdbItem, expectedMediaType, priority) {
        if (!tmdbItem || !tmdbItem.id) {
            return null;
        }
        // CRITICAL: Western-only language validation - NO Asian languages per requirements
        if (!this.WESTERN_LANGUAGES.includes(tmdbItem.original_language)) {
            console.log(`❌ QUALITY GATE REJECT: Non-western language "${tmdbItem.original_language}" for item ${tmdbItem.id}`);
            return null;
        }
        if (!tmdbItem.overview || typeof tmdbItem.overview !== 'string' || tmdbItem.overview.trim().length === 0) {
            console.log(`❌ QUALITY GATE REJECT: Empty overview for item ${tmdbItem.id}`);
            return null;
        }
        if (tmdbItem.overview.includes('Descripción no disponible')) {
            console.log(`❌ QUALITY GATE REJECT: "Descripción no disponible" found in item ${tmdbItem.id}`);
            return null;
        }
        if (!tmdbItem.poster_path || typeof tmdbItem.poster_path !== 'string' || tmdbItem.poster_path.trim().length === 0) {
            console.log(`❌ QUALITY GATE REJECT: Missing poster_path for item ${tmdbItem.id}`);
            return null;
        }
        // CRITICAL BUSINESS LOGIC: Detect movies in TV rooms
        if (expectedMediaType === 'TV') {
            if (tmdbItem.media_type === 'movie') {
                console.error(`🚨 CRITICAL: MOVIE DETECTED in TV room - Item ${tmdbItem.id} (media_type: movie)`);
                throw new Error(`CRITICAL: MOVIE DETECTED in TV room - Item ${tmdbItem.id} has media_type: movie`);
            }
            if (tmdbItem.title && tmdbItem.release_date && !tmdbItem.name && !tmdbItem.first_air_date) {
                console.error(`🚨 CRITICAL: MOVIE DETECTED in TV room - Item ${tmdbItem.id} ("${tmdbItem.title}") has movie field structure`);
                throw new Error(`CRITICAL: MOVIE DETECTED in TV room - Item ${tmdbItem.id} ("${tmdbItem.title}") has movie fields (title/release_date) instead of TV fields (name/first_air_date)`);
            }
            if (!tmdbItem.name || !tmdbItem.first_air_date) {
                console.log(`❌ QUALITY GATE REJECT: Item ${tmdbItem.id} missing TV fields (name/first_air_date)`);
                return null;
            }
        }
        if (expectedMediaType === 'MOVIE') {
            if (tmdbItem.media_type === 'tv') {
                console.log(`❌ QUALITY GATE REJECT: TV item ${tmdbItem.id} in MOVIE room (media_type)`);
                return null;
            }
            if (tmdbItem.name && tmdbItem.first_air_date && !tmdbItem.title && !tmdbItem.release_date) {
                console.log(`❌ QUALITY GATE REJECT: TV item ${tmdbItem.id} ("${tmdbItem.name}") in MOVIE room (field structure)`);
                return null;
            }
            if (!tmdbItem.title || !tmdbItem.release_date) {
                console.log(`❌ QUALITY GATE REJECT: Item ${tmdbItem.id} missing MOVIE fields (title/release_date)`);
                return null;
            }
        }
        const title = expectedMediaType === 'TV' ? tmdbItem.name : tmdbItem.title;
        const releaseDate = expectedMediaType === 'TV' ? tmdbItem.first_air_date : tmdbItem.release_date;
        const validItem = {
            tmdbId: tmdbItem.id.toString(),
            mediaType: expectedMediaType,
            title: title.trim(),
            posterPath: `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}`,
            overview: tmdbItem.overview.trim(),
            genreIds: tmdbItem.genre_ids || [],
            voteAverage: tmdbItem.vote_average || 0,
            voteCount: tmdbItem.vote_count || 0,
            popularity: tmdbItem.popularity || 0,
            releaseDate,
            priority,
            addedAt: new Date().toISOString()
        };
        console.log(`✅ QUALITY GATE PASS: ${expectedMediaType} item "${title}" (ID: ${tmdbItem.id}, Lang: ${tmdbItem.original_language})`);
        return validItem;
    }
    /**
     * Loads content pool for a room (legacy compatibility)
     */
    async loadContentPool(roomId, excludeIds, originalCriteria) {
        console.log(`🔄 ContentFilterService: Loading content pool for room ${roomId}`);
        if (!originalCriteria) {
            throw new Error('Original criteria required for content pool loading');
        }
        return await this.createFilteredRoom(originalCriteria);
    }
    /**
     * Gets available genres for a media type
     */
    async getAvailableGenres(mediaType) {
        console.log(`🎭 ContentFilterService: Getting available genres for ${mediaType}`);
        const endpoint = mediaType === 'MOVIE' ? '/genre/movie/list' : '/genre/tv/list';
        const url = `${this.baseUrl}${endpoint}?api_key=${this.apiKey}&language=es-ES`;
        try {
            const response = await (0, node_fetch_1.default)(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Trinity-Backend/1.0'
                }
            });
            if (!response.ok) {
                throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return data.genres || [];
        }
        catch (error) {
            console.error(`❌ Error getting genres:`, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    /**
     * Validates business logic for a content item
     */
    validateBusinessLogic(item) {
        return this.applyQualityGate(item, 'MOVIE', 1) !== null || this.applyQualityGate(item, 'TV', 1) !== null;
    }
    /**
     * Checks if item has valid description
     */
    hasValidDescription(item) {
        return !!(item.overview &&
            typeof item.overview === 'string' &&
            item.overview.trim().length > 0 &&
            !item.overview.includes('Descripción no disponible'));
    }
    /**
     * Checks if language is western
     */
    isWesternLanguage(language) {
        return this.WESTERN_LANGUAGES.includes(language);
    }
    /**
     * Checks if item meets quality gates
     */
    meetsQualityGates(item) {
        return this.hasValidDescription(item) &&
            this.isWesternLanguage(item.original_language) &&
            !!(item.poster_path && item.poster_path.trim().length > 0) &&
            !!(item.genre_ids && item.genre_ids.length > 0) &&
            item.adult !== true;
    }
    /**
     * Gets the western languages list
     */
    getWesternLanguages() {
        return [...this.WESTERN_LANGUAGES];
    }
}
exports.ContentFilterService = ContentFilterService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC1maWx0ZXItc2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvbnRlbnQtZmlsdGVyLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7OztHQVdHOzs7Ozs7QUFFSCw0REFBK0I7QUF3Qi9CLE1BQWEsb0JBQW9CO0lBTy9CLFlBQVksTUFBZTtRQUxWLFlBQU8sR0FBRyw4QkFBOEIsQ0FBQztRQUUxRCx5RUFBeUU7UUFDeEQsc0JBQWlCLEdBQUcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBR3hFLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxJQUFJLEVBQUUsQ0FBQztRQUV2RCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtRUFBbUUsQ0FBQyxDQUFDO0lBQ25GLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxRQUF3QjtRQUMvQyxPQUFPLENBQUMsR0FBRyxDQUFDLHFEQUFxRCxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTdFLElBQUksQ0FBQztZQUNILElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDN0IsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNyRSxNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFFckUscUZBQXFGO1lBQ3JGLElBQUksVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUs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U2VydmljZSAtIEV4dHJhY3RlZCBmcm9tIE1PTk9MSVRIIGZpbGVzXHJcbiAqIFxyXG4gKiBDUklUSUNBTCBCVVNJTkVTUyBMT0dJQzpcclxuICogLSA1MC1tb3ZpZSBwcmUtY2FjaGluZyBzeXN0ZW0gd2l0aCBnZW5yZSBwcmlvcml0aXphdGlvblxyXG4gKiAtIFdlc3Rlcm4tb25seSBsYW5ndWFnZSBmaWx0ZXJpbmcgKGVuLGVzLGZyLGl0LGRlLHB0KSAtIE5PIEFzaWFuIGxhbmd1YWdlcyBwZXIgcmVxdWlyZW1lbnRzXHJcbiAqIC0gR2VucmUgcHJpb3JpdGl6YXRpb246IEJPVEggZ2VucmVzID4gQU5ZIGdlbnJlID4gUG9wdWxhciBjb250ZW50XHJcbiAqIC0gWmVybyB0b2xlcmFuY2UgcXVhbGl0eSBnYXRlc1xyXG4gKiAtIENyaXRpY2FsIG1vdmllIGRldGVjdGlvbiBpbiBUViByb29tc1xyXG4gKiBcclxuICogUmVxdWlyZW1lbnRzOiAxLjQsIDMuMSwgMy41XHJcbiAqL1xyXG5cclxuaW1wb3J0IGZldGNoIGZyb20gJ25vZGUtZmV0Y2gnO1xyXG5pbXBvcnQgeyBFbmhhbmNlZFRNREJDbGllbnQsIFRNREJJdGVtLCBUTURCR2VucmUgfSBmcm9tICcuL2VuaGFuY2VkLXRtZGItY2xpZW50LmpzJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRmlsdGVyQ3JpdGVyaWEge1xyXG4gIG1lZGlhVHlwZTogJ01PVklFJyB8ICdUVic7XHJcbiAgZ2VucmVzOiBudW1iZXJbXTtcclxuICByb29tSWQ/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgVmFsaWRhdGVkQ29udGVudCB7XHJcbiAgdG1kYklkOiBzdHJpbmc7XHJcbiAgbWVkaWFUeXBlOiAnTU9WSUUnIHwgJ1RWJztcclxuICB0aXRsZTogc3RyaW5nO1xyXG4gIHBvc3RlclBhdGg6IHN0cmluZztcclxuICBvdmVydmlldzogc3RyaW5nO1xyXG4gIGdlbnJlSWRzOiBudW1iZXJbXTtcclxuICB2b3RlQXZlcmFnZTogbnVtYmVyO1xyXG4gIHZvdGVDb3VudDogbnVtYmVyO1xyXG4gIHBvcHVsYXJpdHk6IG51bWJlcjtcclxuICByZWxlYXNlRGF0ZTogc3RyaW5nO1xyXG4gIHByaW9yaXR5OiBudW1iZXI7XHJcbiAgYWRkZWRBdDogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQ29udGVudEZpbHRlclNlcnZpY2Uge1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgYXBpS2V5OiBzdHJpbmc7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBiYXNlVXJsID0gJ2h0dHBzOi8vYXBpLnRoZW1vdmllZGIub3JnLzMnO1xyXG4gIFxyXG4gIC8vIENSSVRJQ0FMOiBXZXN0ZXJuLW9ubHkgbGFuZ3VhZ2VzIC0gTk8gQXNpYW4gbGFuZ3VhZ2VzIHBlciByZXF1aXJlbWVudHNcclxuICBwcml2YXRlIHJlYWRvbmx5IFdFU1RFUk5fTEFOR1VBR0VTID0gWydlbicsICdlcycsICdmcicsICdpdCcsICdkZScsICdwdCddO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcGlLZXk/OiBzdHJpbmcpIHtcclxuICAgIHRoaXMuYXBpS2V5ID0gYXBpS2V5IHx8IHByb2Nlc3MuZW52LlRNREJfQVBJX0tFWSB8fCAnJztcclxuICAgIFxyXG4gICAgaWYgKCF0aGlzLmFwaUtleSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RNREJfQVBJX0tFWSBpcyByZXF1aXJlZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZygn8J+OryBDb250ZW50RmlsdGVyU2VydmljZSBpbml0aWFsaXplZCB3aXRoIElNTVVUQUJMRSBCVVNJTkVTUyBMT0dJQycpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlcyBhIGZpbHRlcmVkIHJvb20gd2l0aCBleGFjdGx5IDUwIG1vdmllcyB1c2luZyBpbW11dGFibGUgYnVzaW5lc3MgbG9naWNcclxuICAgKi9cclxuICBhc3luYyBjcmVhdGVGaWx0ZXJlZFJvb20oY3JpdGVyaWE6IEZpbHRlckNyaXRlcmlhKTogUHJvbWlzZTxWYWxpZGF0ZWRDb250ZW50W10+IHtcclxuICAgIGNvbnNvbGUubG9nKGDwn46vIElNTVVUQUJMRSBCVVNJTkVTUyBMT0dJQzogU3RhcnRpbmcgcm9vbSBjcmVhdGlvbmAsIGNyaXRlcmlhKTtcclxuICAgIFxyXG4gICAgdHJ5IHtcclxuICAgICAgdGhpcy52YWxpZGF0ZUlucHV0KGNyaXRlcmlhKTtcclxuICAgICAgY29uc3QgZW5kcG9pbnQgPSB0aGlzLmNvbmZpZ3VyZUV4Y2x1c2l2ZUVuZHBvaW50KGNyaXRlcmlhLm1lZGlhVHlwZSk7XHJcbiAgICAgIGNvbnN0IHZhbGlkSXRlbXMgPSBhd2FpdCB0aGlzLmZldGNoQW5kRmlsdGVyTG9vcChjcml0ZXJpYSwgZW5kcG9pbnQpO1xyXG4gICAgICBcclxuICAgICAgLy8gQ1JJVElDQUw6IEFjY2VwdCBmZXdlciB0aGFuIDUwIGl0ZW1zIGlmIHdlc3Rlcm4tb25seSBmaWx0ZXJpbmcgcmVzdWx0cyBpbiBzaG9ydGFnZVxyXG4gICAgICBpZiAodmFsaWRJdGVtcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJVU0lORVNTIExPR0lDIEZBSUxVUkU6IE5vIHZhbGlkIGl0ZW1zIGZvdW5kIGZvciAke2NyaXRlcmlhLm1lZGlhVHlwZX1gKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYOKchSBJTU1VVEFCTEUgQlVTSU5FU1MgTE9HSUMgU1VDQ0VTUzogR2VuZXJhdGVkICR7dmFsaWRJdGVtcy5sZW5ndGh9IHZhbGlkICR7Y3JpdGVyaWEubWVkaWFUeXBlfSBpdGVtcyAodGFyZ2V0OiA1MClgKTtcclxuICAgICAgcmV0dXJuIHZhbGlkSXRlbXMuc2xpY2UoMCwgNTApOyAvLyBFbnN1cmUgbWF4aW11bSA1MCBpdGVtc1xyXG4gICAgICBcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBJTU1VVEFCTEUgQlVTSU5FU1MgTE9HSUMgRVJST1I6YCwgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlcyBpbnB1dCBjcml0ZXJpYVxyXG4gICAqL1xyXG4gIHByaXZhdGUgdmFsaWRhdGVJbnB1dChjcml0ZXJpYTogRmlsdGVyQ3JpdGVyaWEpOiB2b2lkIHtcclxuICAgIGlmICghY3JpdGVyaWEubWVkaWFUeXBlIHx8ICFbJ1RWJywgJ01PVklFJ10uaW5jbHVkZXMoY3JpdGVyaWEubWVkaWFUeXBlKSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbWVkaWFUeXBlOiAke2NyaXRlcmlhLm1lZGlhVHlwZX0uIE11c3QgYmUgJ1RWJyBvciAnTU9WSUUnYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghY3JpdGVyaWEuZ2VucmVzIHx8ICFBcnJheS5pc0FycmF5KGNyaXRlcmlhLmdlbnJlcykpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdHZW5yZXMgbXVzdCBiZSBhbiBhcnJheScpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoY3JpdGVyaWEuZ2VucmVzLmxlbmd0aCA+IDIpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXhpbXVtIDIgZ2VucmVzIGFsbG93ZWQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYOKchSBJTlBVVCBWQUxJREFUSU9OOiBNZWRpYVR5cGU9JHtjcml0ZXJpYS5tZWRpYVR5cGV9LCBHZW5yZXM9WyR7Y3JpdGVyaWEuZ2VucmVzLmpvaW4oJywnKX1dYCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDb25maWd1cmVzIHRoZSBleGNsdXNpdmUgZW5kcG9pbnQgZm9yIHRoZSBtZWRpYSB0eXBlXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBjb25maWd1cmVFeGNsdXNpdmVFbmRwb2ludChtZWRpYVR5cGU6ICdNT1ZJRScgfCAnVFYnKTogc3RyaW5nIHtcclxuICAgIGxldCBlbmRwb2ludDogc3RyaW5nO1xyXG4gICAgXHJcbiAgICBpZiAobWVkaWFUeXBlID09PSAnVFYnKSB7XHJcbiAgICAgIGVuZHBvaW50ID0gJy9kaXNjb3Zlci90dic7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5O6IEVYQ0xVU0lWRSBFTkRQT0lOVDogJHtlbmRwb2ludH0gY29uZmlndXJlZCBmb3IgVFYgY29udGVudGApO1xyXG4gICAgfSBlbHNlIGlmIChtZWRpYVR5cGUgPT09ICdNT1ZJRScpIHtcclxuICAgICAgZW5kcG9pbnQgPSAnL2Rpc2NvdmVyL21vdmllJztcclxuICAgICAgY29uc29sZS5sb2coYPCfjqwgRVhDTFVTSVZFIEVORFBPSU5UOiAke2VuZHBvaW50fSBjb25maWd1cmVkIGZvciBNT1ZJRSBjb250ZW50YCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENSSVRJQ0FMOiBJbnZhbGlkIG1lZGlhVHlwZSAke21lZGlhVHlwZX1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIGVuZHBvaW50O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggYW5kIGZpbHRlciBsb29wIHdpdGggZ2VucmUgcHJpb3JpdGl6YXRpb25cclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGZldGNoQW5kRmlsdGVyTG9vcChjcml0ZXJpYTogRmlsdGVyQ3JpdGVyaWEsIGVuZHBvaW50OiBzdHJpbmcpOiBQcm9taXNlPFZhbGlkYXRlZENvbnRlbnRbXT4ge1xyXG4gICAgY29uc3QgdmFsaWRJdGVtczogVmFsaWRhdGVkQ29udGVudFtdID0gW107XHJcbiAgICBjb25zdCB1c2VkSWRzID0gbmV3IFNldDxudW1iZXI+KCk7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGDwn5SEIEZFVENIICYgRklMVEVSIExPT1A6IFN0YXJ0aW5nIGZvciAke2NyaXRlcmlhLm1lZGlhVHlwZX1gKTtcclxuICAgIFxyXG4gICAgLy8gUHJpb3JpdHkgMTogQk9USCBnZW5yZXMgKEFORCBsb2dpYylcclxuICAgIGlmIChjcml0ZXJpYS5nZW5yZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+lhyBJTlRFTlRPIDEgKEFORCk6IEZldGNoaW5nIHdpdGggQk9USCBnZW5yZXMgWyR7Y3JpdGVyaWEuZ2VucmVzLmpvaW4oJyBBTkQgJyl9XWApO1xyXG4gICAgICBhd2FpdCB0aGlzLmZldGNoQmF0Y2hXaXRoR2VucmVzKGNyaXRlcmlhLCBlbmRwb2ludCwgY3JpdGVyaWEuZ2VucmVzLmpvaW4oJywnKSwgdmFsaWRJdGVtcywgdXNlZElkcywgMSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFByaW9yaXR5IDI6IEFOWSBnZW5yZSAoT1IgbG9naWMpXHJcbiAgICBpZiAoY3JpdGVyaWEuZ2VucmVzLmxlbmd0aCA+IDAgJiYgdmFsaWRJdGVtcy5sZW5ndGggPCA1MCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+liCBJTlRFTlRPIDIgKE9SKTogRmV0Y2hpbmcgd2l0aCBBTlkgZ2VucmUgWyR7Y3JpdGVyaWEuZ2VucmVzLmpvaW4oJyBPUiAnKX1dYCk7XHJcbiAgICAgIGF3YWl0IHRoaXMuZmV0Y2hCYXRjaFdpdGhHZW5yZXMoY3JpdGVyaWEsIGVuZHBvaW50LCBjcml0ZXJpYS5nZW5yZXMuam9pbignfCcpLCB2YWxpZEl0ZW1zLCB1c2VkSWRzLCAyKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gUHJpb3JpdHkgMzogUG9wdWxhciBjb250ZW50IChubyBnZW5yZSBmaWx0ZXIpXHJcbiAgICBpZiAodmFsaWRJdGVtcy5sZW5ndGggPCA1MCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+liSBSRUxMRU5PIEZJTkFMOiBGZXRjaGluZyBwb3B1bGFyICR7Y3JpdGVyaWEubWVkaWFUeXBlfSBjb250ZW50YCk7XHJcbiAgICAgIGF3YWl0IHRoaXMuZmV0Y2hCYXRjaFdpdGhHZW5yZXMoY3JpdGVyaWEsIGVuZHBvaW50LCBudWxsLCB2YWxpZEl0ZW1zLCB1c2VkSWRzLCAzKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYPCfjq8gRkVUQ0ggJiBGSUxURVIgTE9PUCBDT01QTEVURTogJHt2YWxpZEl0ZW1zLmxlbmd0aH0gdmFsaWQgaXRlbXMgY29sbGVjdGVkYCk7XHJcbiAgICByZXR1cm4gdmFsaWRJdGVtcztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoZXMgYSBiYXRjaCBvZiBjb250ZW50IHdpdGggc3BlY2lmaWMgZ2VucmUgcXVlcnlcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGZldGNoQmF0Y2hXaXRoR2VucmVzKFxyXG4gICAgY3JpdGVyaWE6IEZpbHRlckNyaXRlcmlhLFxyXG4gICAgZW5kcG9pbnQ6IHN0cmluZyxcclxuICAgIGdlbnJlUXVlcnk6IHN0cmluZyB8IG51bGwsXHJcbiAgICB2YWxpZEl0ZW1zOiBWYWxpZGF0ZWRDb250ZW50W10sXHJcbiAgICB1c2VkSWRzOiBTZXQ8bnVtYmVyPixcclxuICAgIHByaW9yaXR5OiBudW1iZXJcclxuICApOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGxldCBwYWdlID0gMTtcclxuICAgIGNvbnN0IG1heFBhZ2VzID0gNTtcclxuICAgIFxyXG4gICAgd2hpbGUgKHZhbGlkSXRlbXMubGVuZ3RoIDwgNTAgJiYgcGFnZSA8PSBtYXhQYWdlcykge1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+ThCBGZXRjaGluZyBwYWdlICR7cGFnZX0gZm9yIHByaW9yaXR5ICR7cHJpb3JpdHl9YCk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBiYXRjaCA9IGF3YWl0IHRoaXMuZmV0Y2hUTURCQmF0Y2goY3JpdGVyaWEubWVkaWFUeXBlLCBlbmRwb2ludCwgZ2VucmVRdWVyeSwgcGFnZSk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoIWJhdGNoIHx8IGJhdGNoLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gTm8gbW9yZSByZXN1bHRzIGZvciBwcmlvcml0eSAke3ByaW9yaXR5fSwgcGFnZSAke3BhZ2V9YCk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBiYXRjaCkge1xyXG4gICAgICAgIGlmICh2YWxpZEl0ZW1zLmxlbmd0aCA+PSA1MCkgYnJlYWs7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHVzZWRJZHMuaGFzKGl0ZW0uaWQpKSB7XHJcbiAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgdmFsaWRhdGVkSXRlbSA9IHRoaXMuYXBwbHlRdWFsaXR5R2F0ZShpdGVtLCBjcml0ZXJpYS5tZWRpYVR5cGUsIHByaW9yaXR5KTtcclxuICAgICAgICBpZiAodmFsaWRhdGVkSXRlbSkge1xyXG4gICAgICAgICAgdmFsaWRJdGVtcy5wdXNoKHZhbGlkYXRlZEl0ZW0pO1xyXG4gICAgICAgICAgdXNlZElkcy5hZGQoaXRlbS5pZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICBwYWdlKys7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGDinIUgUHJpb3JpdHkgJHtwcmlvcml0eX0gY29tcGxldGU6ICR7dmFsaWRJdGVtcy5sZW5ndGh9IHRvdGFsIHZhbGlkIGl0ZW1zYCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaGVzIGEgYmF0Y2ggZnJvbSBUTURCIEFQSVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZmV0Y2hUTURCQmF0Y2goXHJcbiAgICBtZWRpYVR5cGU6ICdNT1ZJRScgfCAnVFYnLFxyXG4gICAgZW5kcG9pbnQ6IHN0cmluZyxcclxuICAgIGdlbnJlUXVlcnk6IHN0cmluZyB8IG51bGwsXHJcbiAgICBwYWdlOiBudW1iZXJcclxuICApOiBQcm9taXNlPFRNREJJdGVtW10+IHtcclxuICAgIGNvbnN0IHBhcmFtczogUmVjb3JkPHN0cmluZywgYW55PiA9IHtcclxuICAgICAgYXBpX2tleTogdGhpcy5hcGlLZXksXHJcbiAgICAgIGxhbmd1YWdlOiAnZXMtRVMnLFxyXG4gICAgICBwYWdlOiBwYWdlLFxyXG4gICAgICBzb3J0X2J5OiAncG9wdWxhcml0eS5kZXNjJyxcclxuICAgICAgaW5jbHVkZV9hZHVsdDogZmFsc2UsXHJcbiAgICAgIC8vIENSSVRJQ0FMOiBXZXN0ZXJuLW9ubHkgbGFuZ3VhZ2VzIC0gTk8gQXNpYW4gbGFuZ3VhZ2VzIHBlciByZXF1aXJlbWVudHNcclxuICAgICAgJ3dpdGhfb3JpZ2luYWxfbGFuZ3VhZ2UnOiB0aGlzLldFU1RFUk5fTEFOR1VBR0VTLmpvaW4oJ3wnKVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgaWYgKGdlbnJlUXVlcnkpIHtcclxuICAgICAgcGFyYW1zLndpdGhfZ2VucmVzID0gZ2VucmVRdWVyeTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgdXJsID0gYCR7dGhpcy5iYXNlVXJsfSR7ZW5kcG9pbnR9PyR7bmV3IFVSTFNlYXJjaFBhcmFtcyhwYXJhbXMpLnRvU3RyaW5nKCl9YDtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYPCfjJAgVE1EQiBSRVFVRVNUOiAke2VuZHBvaW50fSAocGFnZSAke3BhZ2V9KWApO1xyXG4gICAgY29uc29sZS5sb2coYPCfmqggVE1EQl9VUkxfR0VORVJBVEVEOiAke3VybH1gKTtcclxuICAgIFxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgJ1VzZXItQWdlbnQnOiAnVHJpbml0eS1CYWNrZW5kLzEuMCdcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVE1EQiBBUEkgZXJyb3I6ICR7cmVzcG9uc2Uuc3RhdHVzfSAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgeyByZXN1bHRzOiBUTURCSXRlbVtdIH07XHJcbiAgICAgIHJldHVybiBkYXRhLnJlc3VsdHMgfHwgW107XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgVE1EQiBBUEkgRVJST1I6YCwgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEFwcGxpZXMgcXVhbGl0eSBnYXRlIHZhbGlkYXRpb24gd2l0aCB6ZXJvIHRvbGVyYW5jZVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXBwbHlRdWFsaXR5R2F0ZSh0bWRiSXRlbTogVE1EQkl0ZW0sIGV4cGVjdGVkTWVkaWFUeXBlOiAnTU9WSUUnIHwgJ1RWJywgcHJpb3JpdHk6IG51bWJlcik6IFZhbGlkYXRlZENvbnRlbnQgfCBudWxsIHtcclxuICAgIGlmICghdG1kYkl0ZW0gfHwgIXRtZGJJdGVtLmlkKSB7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDUklUSUNBTDogV2VzdGVybi1vbmx5IGxhbmd1YWdlIHZhbGlkYXRpb24gLSBOTyBBc2lhbiBsYW5ndWFnZXMgcGVyIHJlcXVpcmVtZW50c1xyXG4gICAgaWYgKCF0aGlzLldFU1RFUk5fTEFOR1VBR0VTLmluY2x1ZGVzKHRtZGJJdGVtLm9yaWdpbmFsX2xhbmd1YWdlKSkge1xyXG4gICAgICBjb25zb2xlLmxvZyhg4p2MIFFVQUxJVFkgR0FURSBSRUpFQ1Q6IE5vbi13ZXN0ZXJuIGxhbmd1YWdlIFwiJHt0bWRiSXRlbS5vcmlnaW5hbF9sYW5ndWFnZX1cIiBmb3IgaXRlbSAke3RtZGJJdGVtLmlkfWApO1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCF0bWRiSXRlbS5vdmVydmlldyB8fCB0eXBlb2YgdG1kYkl0ZW0ub3ZlcnZpZXcgIT09ICdzdHJpbmcnIHx8IHRtZGJJdGVtLm92ZXJ2aWV3LnRyaW0oKS5sZW5ndGggPT09IDApIHtcclxuICAgICAgY29uc29sZS5sb2coYOKdjCBRVUFMSVRZIEdBVEUgUkVKRUNUOiBFbXB0eSBvdmVydmlldyBmb3IgaXRlbSAke3RtZGJJdGVtLmlkfWApO1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHRtZGJJdGVtLm92ZXJ2aWV3LmluY2x1ZGVzKCdEZXNjcmlwY2nDs24gbm8gZGlzcG9uaWJsZScpKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDinYwgUVVBTElUWSBHQVRFIFJFSkVDVDogXCJEZXNjcmlwY2nDs24gbm8gZGlzcG9uaWJsZVwiIGZvdW5kIGluIGl0ZW0gJHt0bWRiSXRlbS5pZH1gKTtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghdG1kYkl0ZW0ucG9zdGVyX3BhdGggfHwgdHlwZW9mIHRtZGJJdGVtLnBvc3Rlcl9wYXRoICE9PSAnc3RyaW5nJyB8fCB0bWRiSXRlbS5wb3N0ZXJfcGF0aC50cmltKCkubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDinYwgUVVBTElUWSBHQVRFIFJFSkVDVDogTWlzc2luZyBwb3N0ZXJfcGF0aCBmb3IgaXRlbSAke3RtZGJJdGVtLmlkfWApO1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ1JJVElDQUwgQlVTSU5FU1MgTE9HSUM6IERldGVjdCBtb3ZpZXMgaW4gVFYgcm9vbXNcclxuICAgIGlmIChleHBlY3RlZE1lZGlhVHlwZSA9PT0gJ1RWJykge1xyXG4gICAgICBpZiAodG1kYkl0ZW0ubWVkaWFfdHlwZSA9PT0gJ21vdmllJykge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYPCfmqggQ1JJVElDQUw6IE1PVklFIERFVEVDVEVEIGluIFRWIHJvb20gLSBJdGVtICR7dG1kYkl0ZW0uaWR9IChtZWRpYV90eXBlOiBtb3ZpZSlgKTtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENSSVRJQ0FMOiBNT1ZJRSBERVRFQ1RFRCBpbiBUViByb29tIC0gSXRlbSAke3RtZGJJdGVtLmlkfSBoYXMgbWVkaWFfdHlwZTogbW92aWVgKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgaWYgKHRtZGJJdGVtLnRpdGxlICYmIHRtZGJJdGVtLnJlbGVhc2VfZGF0ZSAmJiAhdG1kYkl0ZW0ubmFtZSAmJiAhdG1kYkl0ZW0uZmlyc3RfYWlyX2RhdGUpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKGDwn5qoIENSSVRJQ0FMOiBNT1ZJRSBERVRFQ1RFRCBpbiBUViByb29tIC0gSXRlbSAke3RtZGJJdGVtLmlkfSAoXCIke3RtZGJJdGVtLnRpdGxlfVwiKSBoYXMgbW92aWUgZmllbGQgc3RydWN0dXJlYCk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDUklUSUNBTDogTU9WSUUgREVURUNURUQgaW4gVFYgcm9vbSAtIEl0ZW0gJHt0bWRiSXRlbS5pZH0gKFwiJHt0bWRiSXRlbS50aXRsZX1cIikgaGFzIG1vdmllIGZpZWxkcyAodGl0bGUvcmVsZWFzZV9kYXRlKSBpbnN0ZWFkIG9mIFRWIGZpZWxkcyAobmFtZS9maXJzdF9haXJfZGF0ZSlgKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgaWYgKCF0bWRiSXRlbS5uYW1lIHx8ICF0bWRiSXRlbS5maXJzdF9haXJfZGF0ZSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDinYwgUVVBTElUWSBHQVRFIFJFSkVDVDogSXRlbSAke3RtZGJJdGVtLmlkfSBtaXNzaW5nIFRWIGZpZWxkcyAobmFtZS9maXJzdF9haXJfZGF0ZSlgKTtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoZXhwZWN0ZWRNZWRpYVR5cGUgPT09ICdNT1ZJRScpIHtcclxuICAgICAgaWYgKHRtZGJJdGVtLm1lZGlhX3R5cGUgPT09ICd0dicpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhg4p2MIFFVQUxJVFkgR0FURSBSRUpFQ1Q6IFRWIGl0ZW0gJHt0bWRiSXRlbS5pZH0gaW4gTU9WSUUgcm9vbSAobWVkaWFfdHlwZSlgKTtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgaWYgKHRtZGJJdGVtLm5hbWUgJiYgdG1kYkl0ZW0uZmlyc3RfYWlyX2RhdGUgJiYgIXRtZGJJdGVtLnRpdGxlICYmICF0bWRiSXRlbS5yZWxlYXNlX2RhdGUpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhg4p2MIFFVQUxJVFkgR0FURSBSRUpFQ1Q6IFRWIGl0ZW0gJHt0bWRiSXRlbS5pZH0gKFwiJHt0bWRiSXRlbS5uYW1lfVwiKSBpbiBNT1ZJRSByb29tIChmaWVsZCBzdHJ1Y3R1cmUpYCk7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGlmICghdG1kYkl0ZW0udGl0bGUgfHwgIXRtZGJJdGVtLnJlbGVhc2VfZGF0ZSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDinYwgUVVBTElUWSBHQVRFIFJFSkVDVDogSXRlbSAke3RtZGJJdGVtLmlkfSBtaXNzaW5nIE1PVklFIGZpZWxkcyAodGl0bGUvcmVsZWFzZV9kYXRlKWApO1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnN0IHRpdGxlID0gZXhwZWN0ZWRNZWRpYVR5cGUgPT09ICdUVicgPyB0bWRiSXRlbS5uYW1lISA6IHRtZGJJdGVtLnRpdGxlITtcclxuICAgIGNvbnN0IHJlbGVhc2VEYXRlID0gZXhwZWN0ZWRNZWRpYVR5cGUgPT09ICdUVicgPyB0bWRiSXRlbS5maXJzdF9haXJfZGF0ZSEgOiB0bWRiSXRlbS5yZWxlYXNlX2RhdGUhO1xyXG4gICAgXHJcbiAgICBjb25zdCB2YWxpZEl0ZW06IFZhbGlkYXRlZENvbnRlbnQgPSB7XHJcbiAgICAgIHRtZGJJZDogdG1kYkl0ZW0uaWQudG9TdHJpbmcoKSxcclxuICAgICAgbWVkaWFUeXBlOiBleHBlY3RlZE1lZGlhVHlwZSxcclxuICAgICAgdGl0bGU6IHRpdGxlLnRyaW0oKSxcclxuICAgICAgcG9zdGVyUGF0aDogYGh0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAke3RtZGJJdGVtLnBvc3Rlcl9wYXRofWAsXHJcbiAgICAgIG92ZXJ2aWV3OiB0bWRiSXRlbS5vdmVydmlldy50cmltKCksXHJcbiAgICAgIGdlbnJlSWRzOiB0bWRiSXRlbS5nZW5yZV9pZHMgfHwgW10sXHJcbiAgICAgIHZvdGVBdmVyYWdlOiB0bWRiSXRlbS52b3RlX2F2ZXJhZ2UgfHwgMCxcclxuICAgICAgdm90ZUNvdW50OiB0bWRiSXRlbS52b3RlX2NvdW50IHx8IDAsXHJcbiAgICAgIHBvcHVsYXJpdHk6IHRtZGJJdGVtLnBvcHVsYXJpdHkgfHwgMCxcclxuICAgICAgcmVsZWFzZURhdGUsXHJcbiAgICAgIHByaW9yaXR5LFxyXG4gICAgICBhZGRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgIH07XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGDinIUgUVVBTElUWSBHQVRFIFBBU1M6ICR7ZXhwZWN0ZWRNZWRpYVR5cGV9IGl0ZW0gXCIke3RpdGxlfVwiIChJRDogJHt0bWRiSXRlbS5pZH0sIExhbmc6ICR7dG1kYkl0ZW0ub3JpZ2luYWxfbGFuZ3VhZ2V9KWApO1xyXG4gICAgcmV0dXJuIHZhbGlkSXRlbTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIExvYWRzIGNvbnRlbnQgcG9vbCBmb3IgYSByb29tIChsZWdhY3kgY29tcGF0aWJpbGl0eSlcclxuICAgKi9cclxuICBhc3luYyBsb2FkQ29udGVudFBvb2wocm9vbUlkOiBzdHJpbmcsIGV4Y2x1ZGVJZHM6IHN0cmluZ1tdLCBvcmlnaW5hbENyaXRlcmlhPzogRmlsdGVyQ3JpdGVyaWEpOiBQcm9taXNlPFZhbGlkYXRlZENvbnRlbnRbXT4ge1xyXG4gICAgY29uc29sZS5sb2coYPCflIQgQ29udGVudEZpbHRlclNlcnZpY2U6IExvYWRpbmcgY29udGVudCBwb29sIGZvciByb29tICR7cm9vbUlkfWApO1xyXG4gICAgXHJcbiAgICBpZiAoIW9yaWdpbmFsQ3JpdGVyaWEpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdPcmlnaW5hbCBjcml0ZXJpYSByZXF1aXJlZCBmb3IgY29udGVudCBwb29sIGxvYWRpbmcnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuY3JlYXRlRmlsdGVyZWRSb29tKG9yaWdpbmFsQ3JpdGVyaWEpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0cyBhdmFpbGFibGUgZ2VucmVzIGZvciBhIG1lZGlhIHR5cGVcclxuICAgKi9cclxuICBhc3luYyBnZXRBdmFpbGFibGVHZW5yZXMobWVkaWFUeXBlOiAnTU9WSUUnIHwgJ1RWJyk6IFByb21pc2U8VE1EQkdlbnJlW10+IHtcclxuICAgIGNvbnNvbGUubG9nKGDwn46tIENvbnRlbnRGaWx0ZXJTZXJ2aWNlOiBHZXR0aW5nIGF2YWlsYWJsZSBnZW5yZXMgZm9yICR7bWVkaWFUeXBlfWApO1xyXG4gICAgXHJcbiAgICBjb25zdCBlbmRwb2ludCA9IG1lZGlhVHlwZSA9PT0gJ01PVklFJyA/ICcvZ2VucmUvbW92aWUvbGlzdCcgOiAnL2dlbnJlL3R2L2xpc3QnO1xyXG4gICAgY29uc3QgdXJsID0gYCR7dGhpcy5iYXNlVXJsfSR7ZW5kcG9pbnR9P2FwaV9rZXk9JHt0aGlzLmFwaUtleX0mbGFuZ3VhZ2U9ZXMtRVNgO1xyXG4gICAgXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwge1xyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgICAnVXNlci1BZ2VudCc6ICdUcmluaXR5LUJhY2tlbmQvMS4wJ1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUTURCIEFQSSBlcnJvcjogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyB7IGdlbnJlczogVE1EQkdlbnJlW10gfTtcclxuICAgICAgcmV0dXJuIGRhdGEuZ2VucmVzIHx8IFtdO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIGdldHRpbmcgZ2VucmVzOmAsIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZXMgYnVzaW5lc3MgbG9naWMgZm9yIGEgY29udGVudCBpdGVtXHJcbiAgICovXHJcbiAgdmFsaWRhdGVCdXNpbmVzc0xvZ2ljKGl0ZW06IFRNREJJdGVtKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5hcHBseVF1YWxpdHlHYXRlKGl0ZW0sICdNT1ZJRScsIDEpICE9PSBudWxsIHx8IHRoaXMuYXBwbHlRdWFsaXR5R2F0ZShpdGVtLCAnVFYnLCAxKSAhPT0gbnVsbDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrcyBpZiBpdGVtIGhhcyB2YWxpZCBkZXNjcmlwdGlvblxyXG4gICAqL1xyXG4gIGhhc1ZhbGlkRGVzY3JpcHRpb24oaXRlbTogVE1EQkl0ZW0pOiBib29sZWFuIHtcclxuICAgIHJldHVybiAhIShpdGVtLm92ZXJ2aWV3ICYmIFxyXG4gICAgICAgICAgICAgdHlwZW9mIGl0ZW0ub3ZlcnZpZXcgPT09ICdzdHJpbmcnICYmIFxyXG4gICAgICAgICAgICAgaXRlbS5vdmVydmlldy50cmltKCkubGVuZ3RoID4gMCAmJlxyXG4gICAgICAgICAgICAgIWl0ZW0ub3ZlcnZpZXcuaW5jbHVkZXMoJ0Rlc2NyaXBjacOzbiBubyBkaXNwb25pYmxlJykpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2hlY2tzIGlmIGxhbmd1YWdlIGlzIHdlc3Rlcm5cclxuICAgKi9cclxuICBpc1dlc3Rlcm5MYW5ndWFnZShsYW5ndWFnZTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5XRVNURVJOX0xBTkdVQUdFUy5pbmNsdWRlcyhsYW5ndWFnZSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDaGVja3MgaWYgaXRlbSBtZWV0cyBxdWFsaXR5IGdhdGVzXHJcbiAgICovXHJcbiAgbWVldHNRdWFsaXR5R2F0ZXMoaXRlbTogVE1EQkl0ZW0pOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmhhc1ZhbGlkRGVzY3JpcHRpb24oaXRlbSkgJiZcclxuICAgICAgICAgICB0aGlzLmlzV2VzdGVybkxhbmd1YWdlKGl0ZW0ub3JpZ2luYWxfbGFuZ3VhZ2UpICYmXHJcbiAgICAgICAgICAgISEoaXRlbS5wb3N0ZXJfcGF0aCAmJiBpdGVtLnBvc3Rlcl9wYXRoLnRyaW0oKS5sZW5ndGggPiAwKSAmJlxyXG4gICAgICAgICAgICEhKGl0ZW0uZ2VucmVfaWRzICYmIGl0ZW0uZ2VucmVfaWRzLmxlbmd0aCA+IDApICYmXHJcbiAgICAgICAgICAgaXRlbS5hZHVsdCAhPT0gdHJ1ZTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldHMgdGhlIHdlc3Rlcm4gbGFuZ3VhZ2VzIGxpc3RcclxuICAgKi9cclxuICBnZXRXZXN0ZXJuTGFuZ3VhZ2VzKCk6IHN0cmluZ1tdIHtcclxuICAgIHJldHVybiBbLi4udGhpcy5XRVNURVJOX0xBTkdVQUdFU107XHJcbiAgfVxyXG59Il19