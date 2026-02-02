"use strict";
/**
 * EnhancedTMDBClient - TMDB API Integration with Discover Endpoints
 *
 * Provides optimized communication with TMDB API for content filtering:
 * - Discover movies and TV shows with genre filtering
 * - Support for AND/OR genre logic
 * - Genre list retrieval
 * - CRITICAL: Genre ID mapping between Movies and TV
 * - Error handling and rate limiting
 *
 * Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedTMDBClient = void 0;
/**
 * CRITICAL: Genre ID mapping between Movies and TV
 * Some genres have different IDs between movie and TV endpoints
 * Requirements: 1.2, 3.5
 */
const GENRE_MAPPING = {
    // Action (Movie: 28) → Action & Adventure (TV: 10759)
    28: 10759,
    // Adventure (Movie: 12) → Action & Adventure (TV: 10759) 
    12: 10759,
    // Western (Movie: 37) → Western (TV: 37) - Same ID
    37: 37,
    // War (Movie: 10752) → War & Politics (TV: 10768)
    10752: 10768
    // Note: Most other genres have the same IDs between movie and TV
    // Comedy: 35, Drama: 18, Horror: 27, etc.
};
class EnhancedTMDBClient {
    constructor() {
        this.baseUrl = 'https://api.themoviedb.org/3';
        this.requestCount = 0;
        this.lastRequestTime = 0;
        this.RATE_LIMIT_DELAY = 250; // 4 requests per second
        this.apiKey = process.env.TMDB_API_KEY || '';
        if (!this.apiKey) {
            console.warn('⚠️ TMDB_API_KEY not found in environment variables');
        }
    }
    /**
     * ENHANCED: Validates mediaType strictly
     * Requirements: 1.1, 3.1
     */
    validateMediaType(mediaType) {
        if (!mediaType || (mediaType !== 'MOVIE' && mediaType !== 'TV')) {
            throw new Error(`Invalid mediaType: ${mediaType}. Must be 'MOVIE' or 'TV'`);
        }
    }
    /**
     * CRITICAL: Maps genre IDs from movie format to TV format when needed
     * Requirements: 1.2, 3.5
     */
    mapGenreIds(genreIds, targetMediaType) {
        if (targetMediaType === 'MOVIE') {
            // No mapping needed for movies - use original IDs
            return genreIds;
        }
        // For TV shows, map movie genre IDs to TV genre IDs
        return genreIds.map(genreId => {
            const mappedId = GENRE_MAPPING[genreId];
            if (mappedId) {
                console.log(`🔄 Genre mapping: Movie genre ${genreId} → TV genre ${mappedId}`);
                return mappedId;
            }
            return genreId; // Use original ID if no mapping exists
        });
    }
    /**
     * ENHANCED: Validates genre IDs for target media type
     * Requirements: 1.2, 3.2
     */
    async validateGenreIds(genreIds, mediaType) {
        if (!genreIds || genreIds.length === 0)
            return;
        try {
            const validGenres = await this.getGenres(mediaType);
            const validGenreIds = new Set(validGenres.map(g => g.id));
            const invalidGenres = genreIds.filter(id => !validGenreIds.has(id));
            if (invalidGenres.length > 0) {
                console.warn(`⚠️ Invalid genre IDs for ${mediaType}: ${invalidGenres.join(', ')}`);
                // Don't throw error - just log warning for now
            }
        }
        catch (error) {
            console.warn(`⚠️ Could not validate genre IDs for ${mediaType}:`, error);
        }
    }
    /**
     * ENHANCED: Selects correct TMDB endpoint with validation
     * Requirements: 3.1, 3.2, 3.4
     */
    selectEndpoint(mediaType) {
        this.validateMediaType(mediaType);
        const endpoint = mediaType === 'MOVIE' ? '/discover/movie' : '/discover/tv';
        console.log(`🎯 Selected TMDB endpoint: ${endpoint} for mediaType: ${mediaType}`);
        return endpoint;
    }
    /**
     * Discovers movies using TMDB discover endpoint
     * Requirements: 4.1, 4.3, 4.4
     */
    async discoverMovies(params) {
        return this.discoverContent({ ...params, mediaType: 'MOVIE' });
    }
    /**
     * Discovers TV shows using TMDB discover endpoint
     * Requirements: 4.2, 4.3, 4.4
     */
    async discoverTV(params) {
        return this.discoverContent({ ...params, mediaType: 'TV' });
    }
    /**
     * ENHANCED: Generic discover method with genre mapping and validation
     * Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5
     */
    async discoverContent(params) {
        // CRITICAL: Validate mediaType first
        this.validateMediaType(params.mediaType);
        const endpoint = this.selectEndpoint(params.mediaType);
        console.log(`🔍 TMDB: Discovering ${params.mediaType} content`, {
            withGenres: params.withGenres,
            sortBy: params.sortBy,
            excludeCount: params.excludeIds?.length || 0
        });
        try {
            await this.enforceRateLimit();
            // CRITICAL: Handle genre mapping for TV shows
            let processedGenres = params.withGenres;
            if (params.withGenres && params.mediaType === 'TV') {
                // Parse genre string and apply mapping
                const genreIds = this.parseGenreString(params.withGenres);
                const mappedGenreIds = this.mapGenreIds(genreIds, params.mediaType);
                processedGenres = mappedGenreIds.join(',');
                if (processedGenres !== params.withGenres) {
                    console.log(`🔄 Genre mapping applied: ${params.withGenres} → ${processedGenres}`);
                }
            }
            const queryParams = new URLSearchParams({
                api_key: this.apiKey,
                language: 'es-ES',
                sort_by: params.sortBy || 'popularity.desc',
                page: (params.page || 1).toString(),
                include_adult: 'false'
            });
            // Add genre filtering if specified
            if (processedGenres) {
                queryParams.append('with_genres', processedGenres);
                console.log(`🎭 Using genres for ${params.mediaType}: ${processedGenres}`);
            }
            const url = `${this.baseUrl}${endpoint}?${queryParams}`;
            console.log(`🌐 TMDB: Making request to ${endpoint}`);
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Trinity-Backend/1.0'
                }
            });
            if (!response.ok) {
                throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            let results = data.results || [];
            // Filter out excluded IDs if provided
            if (params.excludeIds && params.excludeIds.length > 0) {
                const excludeSet = new Set(params.excludeIds);
                results = results.filter(item => !excludeSet.has(item.id.toString()));
            }
            // ENHANCED: Validate required fields and content type consistency
            results = results.filter(item => this.validateContentFields(item, params.mediaType));
            console.log(`✅ TMDB: Retrieved ${results.length} valid ${params.mediaType} items`);
            if (results.length === 0 && params.withGenres) {
                console.warn(`⚠️ No results found for ${params.mediaType} with genres: ${processedGenres}`);
                console.warn(`💡 Original genres: ${params.withGenres}`);
            }
            return results;
        }
        catch (error) {
            console.error(`❌ TMDB: Error discovering ${params.mediaType} content:`, error);
            // Graceful error handling (Requirements: 4.6)
            if (error instanceof Error && error.message.includes('rate limit')) {
                console.log('⏳ TMDB: Rate limit hit, implementing backoff...');
                await this.exponentialBackoff();
                return this.discoverContent(params); // Retry once
            }
            throw error;
        }
    }
    /**
     * HELPER: Parses genre string into array of numbers
     * Supports both comma-separated (AND) and pipe-separated (OR) formats
     */
    parseGenreString(genreString) {
        // Handle both "28,12" (AND) and "28|12" (OR) formats
        const separator = genreString.includes('|') ? '|' : ',';
        return genreString.split(separator)
            .map(id => parseInt(id.trim(), 10))
            .filter(id => !isNaN(id));
    }
    /**
     * Gets available genres for movies
     * Requirements: 1.4, 2.1
     */
    async getMovieGenres() {
        return this.getGenres('MOVIE');
    }
    /**
     * Gets available genres for TV shows
     * Requirements: 1.4, 2.1
     */
    async getTVGenres() {
        return this.getGenres('TV');
    }
    /**
     * Generic method to get genres for any media type
     * Requirements: 1.4, 2.1
     */
    async getGenres(mediaType) {
        this.validateMediaType(mediaType);
        const endpoint = mediaType === 'MOVIE' ? '/genre/movie/list' : '/genre/tv/list';
        console.log(`🎭 TMDB: Getting ${mediaType} genres`);
        try {
            await this.enforceRateLimit();
            const queryParams = new URLSearchParams({
                api_key: this.apiKey,
                language: 'es-ES'
            });
            const url = `${this.baseUrl}${endpoint}?${queryParams}`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Trinity-Backend/1.0'
                }
            });
            if (!response.ok) {
                throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            const genres = data.genres || [];
            console.log(`✅ TMDB: Retrieved ${genres.length} ${mediaType} genres`);
            return genres;
        }
        catch (error) {
            console.error(`❌ TMDB: Error getting ${mediaType} genres:`, error);
            throw error;
        }
    }
    /**
     * ENHANCED: Validates that content has all required fields and matches media type
     * Requirements: 4.5, 1.3, 1.4
     */
    validateContentFields(item, expectedMediaType) {
        const requiredFields = [
            'id',
            'overview',
            'genre_ids',
            'vote_average'
        ];
        // Check for title/name based on media type
        let hasTitle = false;
        if (expectedMediaType === 'MOVIE') {
            hasTitle = !!item.title;
        }
        else if (expectedMediaType === 'TV') {
            hasTitle = !!item.name;
        }
        if (!hasTitle) {
            console.warn(`⚠️ Content missing title/name for ${expectedMediaType}:`, item.id);
            return false;
        }
        // Check for release date based on media type
        let hasReleaseDate = false;
        if (expectedMediaType === 'MOVIE') {
            hasReleaseDate = !!item.release_date;
        }
        else if (expectedMediaType === 'TV') {
            hasReleaseDate = !!item.first_air_date;
        }
        if (!hasReleaseDate) {
            console.warn(`⚠️ Content missing release date for ${expectedMediaType}:`, item.id);
            return false;
        }
        // Check other required fields
        const hasRequiredFields = requiredFields.every(field => {
            const hasField = item[field] !== undefined && item[field] !== null;
            if (!hasField) {
                console.warn(`⚠️ Content missing required field '${field}':`, item.id);
            }
            return hasField;
        });
        // Additional validation: overview should not be empty
        if (typeof item.overview === 'string' && item.overview.trim().length === 0) {
            console.warn(`⚠️ Content has empty overview:`, item.id);
            return false;
        }
        return hasRequiredFields;
    }
    /**
     * Enforces rate limiting to respect TMDB API limits
     * Requirements: 4.6
     */
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
            const delay = this.RATE_LIMIT_DELAY - timeSinceLastRequest;
            console.log(`⏳ TMDB: Rate limiting - waiting ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        this.lastRequestTime = Date.now();
        this.requestCount++;
    }
    /**
     * Implements exponential backoff for error recovery
     * Requirements: 4.6
     */
    async exponentialBackoff() {
        const delay = Math.min(1000 * Math.pow(2, this.requestCount % 5), 30000); // Max 30 seconds
        console.log(`⏳ TMDB: Exponential backoff - waiting ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    /**
     * UTILITY: Gets genre mapping information for debugging
     * Requirements: 1.2, 3.5
     */
    getGenreMapping() {
        return { ...GENRE_MAPPING };
    }
    /**
     * UTILITY: Maps a single genre ID from movie to TV format
     * Requirements: 1.2, 3.5
     */
    mapSingleGenreId(movieGenreId) {
        return GENRE_MAPPING[movieGenreId] || movieGenreId;
    }
}
exports.EnhancedTMDBClient = EnhancedTMDBClient;
