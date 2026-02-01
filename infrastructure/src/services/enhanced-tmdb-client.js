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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5oYW5jZWQtdG1kYi1jbGllbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbmhhbmNlZC10bWRiLWNsaWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7O0dBV0c7OztBQStCSDs7OztHQUlHO0FBQ0gsTUFBTSxhQUFhLEdBQXVDO0lBQ3hELHNEQUFzRDtJQUN0RCxFQUFFLEVBQUUsS0FBSztJQUNULDBEQUEwRDtJQUMxRCxFQUFFLEVBQUUsS0FBSztJQUNULG1EQUFtRDtJQUNuRCxFQUFFLEVBQUUsRUFBRTtJQUNOLGtEQUFrRDtJQUNsRCxLQUFLLEVBQUUsS0FBSztJQUNaLGlFQUFpRTtJQUNqRSwwQ0FBMEM7Q0FDM0MsQ0FBQztBQUVGLE1BQWEsa0JBQWtCO0lBTzdCO1FBTFEsWUFBTyxHQUFHLDhCQUE4QixDQUFDO1FBQ3pDLGlCQUFZLEdBQUcsQ0FBQyxDQUFDO1FBQ2pCLG9CQUFlLEdBQUcsQ0FBQyxDQUFDO1FBQ1gscUJBQWdCLEdBQUcsR0FBRyxDQUFDLENBQUMsd0JBQXdCO1FBRy9ELElBQUksQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLElBQUksRUFBRSxDQUFDO1FBQzdDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDakIsT0FBTyxDQUFDLElBQUksQ0FBQyxvREFBb0QsQ0FBQyxDQUFDO1FBQ3JFLENBQUM7SUFDSCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssaUJBQWlCLENBQUMsU0FBb0I7UUFDNUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLFNBQVMsS0FBSyxPQUFPLElBQUksU0FBUyxLQUFLLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDaEUsTUFBTSxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsU0FBUywyQkFBMkIsQ0FBQyxDQUFDO1FBQzlFLENBQUM7SUFDSCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssV0FBVyxDQUFDLFFBQWtCLEVBQUUsZUFBMEI7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QUFJLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsaUJBQWlCO1FBQzNGLE9BQU8sQ0FBQyxHQUFHLENBQUMseUNBQXlDLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDaEUsTUFBTSxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsZUFBZTtRQUNiLE9BQU8sRUFBRSxHQUFHLGFBQWEsRUFBRSxDQUFDO0lBQzlCLENBQUM7SUFFRDs7O09BR0c7SUFDSCxnQkFBZ0IsQ0FBQyxZQUFvQjtRQUNuQyxPQUFPLGFBQWEsQ0FBQyxZQUFZLENBQUMsSUFBSSxZQUFZLENBQUM7SUFDckQsQ0FBQztDQUNGO0FBeldELGdEQXlXQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBFbmhhbmNlZFRNREJDbGllbnQgLSBUTURCIEFQSSBJbnRlZ3JhdGlvbiB3aXRoIERpc2NvdmVyIEVuZHBvaW50c1xyXG4gKiBcclxuICogUHJvdmlkZXMgb3B0aW1pemVkIGNvbW11bmljYXRpb24gd2l0aCBUTURCIEFQSSBmb3IgY29udGVudCBmaWx0ZXJpbmc6XHJcbiAqIC0gRGlzY292ZXIgbW92aWVzIGFuZCBUViBzaG93cyB3aXRoIGdlbnJlIGZpbHRlcmluZ1xyXG4gKiAtIFN1cHBvcnQgZm9yIEFORC9PUiBnZW5yZSBsb2dpY1xyXG4gKiAtIEdlbnJlIGxpc3QgcmV0cmlldmFsXHJcbiAqIC0gQ1JJVElDQUw6IEdlbnJlIElEIG1hcHBpbmcgYmV0d2VlbiBNb3ZpZXMgYW5kIFRWXHJcbiAqIC0gRXJyb3IgaGFuZGxpbmcgYW5kIHJhdGUgbGltaXRpbmdcclxuICogXHJcbiAqIFJlcXVpcmVtZW50czogMS4xLCAxLjIsIDMuMSwgMy4yLCAzLjMsIDMuNSwgNC4xLCA0LjIsIDQuMywgNC40LCA0LjUsIDQuNlxyXG4gKi9cclxuXHJcbmltcG9ydCB7IE1lZGlhVHlwZSB9IGZyb20gJy4uL3R5cGVzL2NvbnRlbnQtZmlsdGVyaW5nLXR5cGVzJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRGlzY292ZXJQYXJhbXMge1xyXG4gIG1lZGlhVHlwZTogTWVkaWFUeXBlO1xyXG4gIHdpdGhHZW5yZXM/OiBzdHJpbmc7ICAvLyBcIjI4LDEyXCIgZm9yIEFORCwgXCIyOHwxMlwiIGZvciBPUlxyXG4gIHNvcnRCeT86ICdwb3B1bGFyaXR5LmRlc2MnIHwgJ3ZvdGVfYXZlcmFnZS5kZXNjJztcclxuICBwYWdlPzogbnVtYmVyO1xyXG4gIGV4Y2x1ZGVJZHM/OiBzdHJpbmdbXTtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUTURCQ29udGVudCB7XHJcbiAgaWQ6IG51bWJlcjtcclxuICB0aXRsZT86IHN0cmluZztcclxuICBuYW1lPzogc3RyaW5nO1xyXG4gIG92ZXJ2aWV3OiBzdHJpbmc7XHJcbiAgcG9zdGVyX3BhdGg/OiBzdHJpbmc7XHJcbiAgYmFja2Ryb3BfcGF0aD86IHN0cmluZztcclxuICBnZW5yZV9pZHM6IG51bWJlcltdO1xyXG4gIHZvdGVfYXZlcmFnZTogbnVtYmVyO1xyXG4gIHJlbGVhc2VfZGF0ZT86IHN0cmluZztcclxuICBmaXJzdF9haXJfZGF0ZT86IHN0cmluZztcclxuICBtZWRpYV90eXBlPzogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEdlbnJlIHtcclxuICBpZDogbnVtYmVyO1xyXG4gIG5hbWU6IHN0cmluZztcclxufVxyXG5cclxuLyoqXHJcbiAqIENSSVRJQ0FMOiBHZW5yZSBJRCBtYXBwaW5nIGJldHdlZW4gTW92aWVzIGFuZCBUVlxyXG4gKiBTb21lIGdlbnJlcyBoYXZlIGRpZmZlcmVudCBJRHMgYmV0d2VlbiBtb3ZpZSBhbmQgVFYgZW5kcG9pbnRzXHJcbiAqIFJlcXVpcmVtZW50czogMS4yLCAzLjVcclxuICovXHJcbmNvbnN0IEdFTlJFX01BUFBJTkc6IHsgW21vdmllR2VucmVJZDogbnVtYmVyXTogbnVtYmVyIH0gPSB7XHJcbiAgLy8gQWN0aW9uIChNb3ZpZTogMjgpIOKGkiBBY3Rpb24gJiBBZHZlbnR1cmUgKFRWOiAxMDc1OSlcclxuICAyODogMTA3NTksXHJcbiAgLy8gQWR2ZW50dXJlIChNb3ZpZTogMTIpIOKGkiBBY3Rpb24gJiBBZHZlbnR1cmUgKFRWOiAxMDc1OSkgXHJcbiAgMTI6IDEwNzU5LFxyXG4gIC8vIFdlc3Rlcm4gKE1vdmllOiAzNykg4oaSIFdlc3Rlcm4gKFRWOiAzNykgLSBTYW1lIElEXHJcbiAgMzc6IDM3LFxyXG4gIC8vIFdhciAoTW92aWU6IDEwNzUyKSDihpIgV2FyICYgUG9saXRpY3MgKFRWOiAxMDc2OClcclxuICAxMDc1MjogMTA3NjhcclxuICAvLyBOb3RlOiBNb3N0IG90aGVyIGdlbnJlcyBoYXZlIHRoZSBzYW1lIElEcyBiZXR3ZWVuIG1vdmllIGFuZCBUVlxyXG4gIC8vIENvbWVkeTogMzUsIERyYW1hOiAxOCwgSG9ycm9yOiAyNywgZXRjLlxyXG59O1xyXG5cclxuZXhwb3J0IGNsYXNzIEVuaGFuY2VkVE1EQkNsaWVudCB7XHJcbiAgcHJpdmF0ZSBhcGlLZXk6IHN0cmluZztcclxuICBwcml2YXRlIGJhc2VVcmwgPSAnaHR0cHM6Ly9hcGkudGhlbW92aWVkYi5vcmcvMyc7XHJcbiAgcHJpdmF0ZSByZXF1ZXN0Q291bnQgPSAwO1xyXG4gIHByaXZhdGUgbGFzdFJlcXVlc3RUaW1lID0gMDtcclxuICBwcml2YXRlIHJlYWRvbmx5IFJBVEVfTElNSVRfREVMQVkgPSAyNTA7IC8vIDQgcmVxdWVzdHMgcGVyIHNlY29uZFxyXG5cclxuICBjb25zdHJ1Y3RvcigpIHtcclxuICAgIHRoaXMuYXBpS2V5ID0gcHJvY2Vzcy5lbnYuVE1EQl9BUElfS0VZIHx8ICcnO1xyXG4gICAgaWYgKCF0aGlzLmFwaUtleSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBUTURCX0FQSV9LRVkgbm90IGZvdW5kIGluIGVudmlyb25tZW50IHZhcmlhYmxlcycpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRU5IQU5DRUQ6IFZhbGlkYXRlcyBtZWRpYVR5cGUgc3RyaWN0bHlcclxuICAgKiBSZXF1aXJlbWVudHM6IDEuMSwgMy4xXHJcbiAgICovXHJcbiAgcHJpdmF0ZSB2YWxpZGF0ZU1lZGlhVHlwZShtZWRpYVR5cGU6IE1lZGlhVHlwZSk6IHZvaWQge1xyXG4gICAgaWYgKCFtZWRpYVR5cGUgfHwgKG1lZGlhVHlwZSAhPT0gJ01PVklFJyAmJiBtZWRpYVR5cGUgIT09ICdUVicpKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBtZWRpYVR5cGU6ICR7bWVkaWFUeXBlfS4gTXVzdCBiZSAnTU9WSUUnIG9yICdUVidgKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENSSVRJQ0FMOiBNYXBzIGdlbnJlIElEcyBmcm9tIG1vdmllIGZvcm1hdCB0byBUViBmb3JtYXQgd2hlbiBuZWVkZWRcclxuICAgKiBSZXF1aXJlbWVudHM6IDEuMiwgMy41XHJcbiAgICovXHJcbiAgcHJpdmF0ZSBtYXBHZW5yZUlkcyhnZW5yZUlkczogbnVtYmVyW10sIHRhcmdldE1lZGlhVHlwZTogTWVkaWFUeXBlKTogbnVtYmVyW10ge1xyXG4gICAgaWYgKHRhcmdldE1lZGlhVHlwZSA9PT0gJ01PVklFJykge1xyXG4gICAgICAvLyBObyBtYXBwaW5nIG5lZWRlZCBmb3IgbW92aWVzIC0gdXNlIG9yaWdpbmFsIElEc1xyXG4gICAgICByZXR1cm4gZ2VucmVJZHM7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yIFRWIHNob3dzLCBtYXAgbW92aWUgZ2VucmUgSURzIHRvIFRWIGdlbnJlIElEc1xyXG4gICAgcmV0dXJuIGdlbnJlSWRzLm1hcChnZW5yZUlkID0+IHtcclxuICAgICAgY29uc3QgbWFwcGVkSWQgPSBHRU5SRV9NQVBQSU5HW2dlbnJlSWRdO1xyXG4gICAgICBpZiAobWFwcGVkSWQpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBHZW5yZSBtYXBwaW5nOiBNb3ZpZSBnZW5yZSAke2dlbnJlSWR9IOKGkiBUViBnZW5yZSAke21hcHBlZElkfWApO1xyXG4gICAgICAgIHJldHVybiBtYXBwZWRJZDtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZ2VucmVJZDsgLy8gVXNlIG9yaWdpbmFsIElEIGlmIG5vIG1hcHBpbmcgZXhpc3RzXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEVOSEFOQ0VEOiBWYWxpZGF0ZXMgZ2VucmUgSURzIGZvciB0YXJnZXQgbWVkaWEgdHlwZVxyXG4gICAqIFJlcXVpcmVtZW50czogMS4yLCAzLjJcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlR2VucmVJZHMoZ2VucmVJZHM6IG51bWJlcltdLCBtZWRpYVR5cGU6IE1lZGlhVHlwZSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgaWYgKCFnZW5yZUlkcyB8fCBnZW5yZUlkcy5sZW5ndGggPT09IDApIHJldHVybjtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCB2YWxpZEdlbnJlcyA9IGF3YWl0IHRoaXMuZ2V0R2VucmVzKG1lZGlhVHlwZSk7XHJcbiAgICAgIGNvbnN0IHZhbGlkR2VucmVJZHMgPSBuZXcgU2V0KHZhbGlkR2VucmVzLm1hcChnID0+IGcuaWQpKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGludmFsaWRHZW5yZXMgPSBnZW5yZUlkcy5maWx0ZXIoaWQgPT4gIXZhbGlkR2VucmVJZHMuaGFzKGlkKSk7XHJcbiAgICAgIGlmIChpbnZhbGlkR2VucmVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBJbnZhbGlkIGdlbnJlIElEcyBmb3IgJHttZWRpYVR5cGV9OiAke2ludmFsaWRHZW5yZXMuam9pbignLCAnKX1gKTtcclxuICAgICAgICAvLyBEb24ndCB0aHJvdyBlcnJvciAtIGp1c3QgbG9nIHdhcm5pbmcgZm9yIG5vd1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBDb3VsZCBub3QgdmFsaWRhdGUgZ2VucmUgSURzIGZvciAke21lZGlhVHlwZX06YCwgZXJyb3IpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRU5IQU5DRUQ6IFNlbGVjdHMgY29ycmVjdCBUTURCIGVuZHBvaW50IHdpdGggdmFsaWRhdGlvblxyXG4gICAqIFJlcXVpcmVtZW50czogMy4xLCAzLjIsIDMuNFxyXG4gICAqL1xyXG4gIHByaXZhdGUgc2VsZWN0RW5kcG9pbnQobWVkaWFUeXBlOiBNZWRpYVR5cGUpOiBzdHJpbmcge1xyXG4gICAgdGhpcy52YWxpZGF0ZU1lZGlhVHlwZShtZWRpYVR5cGUpO1xyXG4gICAgXHJcbiAgICBjb25zdCBlbmRwb2ludCA9IG1lZGlhVHlwZSA9PT0gJ01PVklFJyA/ICcvZGlzY292ZXIvbW92aWUnIDogJy9kaXNjb3Zlci90dic7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+OryBTZWxlY3RlZCBUTURCIGVuZHBvaW50OiAke2VuZHBvaW50fSBmb3IgbWVkaWFUeXBlOiAke21lZGlhVHlwZX1gKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIGVuZHBvaW50O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRGlzY292ZXJzIG1vdmllcyB1c2luZyBUTURCIGRpc2NvdmVyIGVuZHBvaW50XHJcbiAgICogUmVxdWlyZW1lbnRzOiA0LjEsIDQuMywgNC40XHJcbiAgICovXHJcbiAgYXN5bmMgZGlzY292ZXJNb3ZpZXMocGFyYW1zOiBPbWl0PERpc2NvdmVyUGFyYW1zLCAnbWVkaWFUeXBlJz4pOiBQcm9taXNlPFRNREJDb250ZW50W10+IHtcclxuICAgIHJldHVybiB0aGlzLmRpc2NvdmVyQ29udGVudCh7IC4uLnBhcmFtcywgbWVkaWFUeXBlOiAnTU9WSUUnIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRGlzY292ZXJzIFRWIHNob3dzIHVzaW5nIFRNREIgZGlzY292ZXIgZW5kcG9pbnRcclxuICAgKiBSZXF1aXJlbWVudHM6IDQuMiwgNC4zLCA0LjRcclxuICAgKi9cclxuICBhc3luYyBkaXNjb3ZlclRWKHBhcmFtczogT21pdDxEaXNjb3ZlclBhcmFtcywgJ21lZGlhVHlwZSc+KTogUHJvbWlzZTxUTURCQ29udGVudFtdPiB7XHJcbiAgICByZXR1cm4gdGhpcy5kaXNjb3ZlckNvbnRlbnQoeyAuLi5wYXJhbXMsIG1lZGlhVHlwZTogJ1RWJyB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEVOSEFOQ0VEOiBHZW5lcmljIGRpc2NvdmVyIG1ldGhvZCB3aXRoIGdlbnJlIG1hcHBpbmcgYW5kIHZhbGlkYXRpb25cclxuICAgKiBSZXF1aXJlbWVudHM6IDEuMSwgMS4yLCAzLjEsIDMuMiwgMy4zLCAzLjUsIDQuMSwgNC4yLCA0LjMsIDQuNCwgNC41XHJcbiAgICovXHJcbiAgYXN5bmMgZGlzY292ZXJDb250ZW50KHBhcmFtczogRGlzY292ZXJQYXJhbXMpOiBQcm9taXNlPFRNREJDb250ZW50W10+IHtcclxuICAgIC8vIENSSVRJQ0FMOiBWYWxpZGF0ZSBtZWRpYVR5cGUgZmlyc3RcclxuICAgIHRoaXMudmFsaWRhdGVNZWRpYVR5cGUocGFyYW1zLm1lZGlhVHlwZSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGVuZHBvaW50ID0gdGhpcy5zZWxlY3RFbmRwb2ludChwYXJhbXMubWVkaWFUeXBlKTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYPCflI0gVE1EQjogRGlzY292ZXJpbmcgJHtwYXJhbXMubWVkaWFUeXBlfSBjb250ZW50YCwge1xyXG4gICAgICB3aXRoR2VucmVzOiBwYXJhbXMud2l0aEdlbnJlcyxcclxuICAgICAgc29ydEJ5OiBwYXJhbXMuc29ydEJ5LFxyXG4gICAgICBleGNsdWRlQ291bnQ6IHBhcmFtcy5leGNsdWRlSWRzPy5sZW5ndGggfHwgMFxyXG4gICAgfSk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5lbmZvcmNlUmF0ZUxpbWl0KCk7XHJcblxyXG4gICAgICAvLyBDUklUSUNBTDogSGFuZGxlIGdlbnJlIG1hcHBpbmcgZm9yIFRWIHNob3dzXHJcbiAgICAgIGxldCBwcm9jZXNzZWRHZW5yZXMgPSBwYXJhbXMud2l0aEdlbnJlcztcclxuICAgICAgaWYgKHBhcmFtcy53aXRoR2VucmVzICYmIHBhcmFtcy5tZWRpYVR5cGUgPT09ICdUVicpIHtcclxuICAgICAgICAvLyBQYXJzZSBnZW5yZSBzdHJpbmcgYW5kIGFwcGx5IG1hcHBpbmdcclxuICAgICAgICBjb25zdCBnZW5yZUlkcyA9IHRoaXMucGFyc2VHZW5yZVN0cmluZyhwYXJhbXMud2l0aEdlbnJlcyk7XHJcbiAgICAgICAgY29uc3QgbWFwcGVkR2VucmVJZHMgPSB0aGlzLm1hcEdlbnJlSWRzKGdlbnJlSWRzLCBwYXJhbXMubWVkaWFUeXBlKTtcclxuICAgICAgICBwcm9jZXNzZWRHZW5yZXMgPSBtYXBwZWRHZW5yZUlkcy5qb2luKCcsJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByb2Nlc3NlZEdlbnJlcyAhPT0gcGFyYW1zLndpdGhHZW5yZXMpIHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIEdlbnJlIG1hcHBpbmcgYXBwbGllZDogJHtwYXJhbXMud2l0aEdlbnJlc30g4oaSICR7cHJvY2Vzc2VkR2VucmVzfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgcXVlcnlQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHtcclxuICAgICAgICBhcGlfa2V5OiB0aGlzLmFwaUtleSxcclxuICAgICAgICBsYW5ndWFnZTogJ2VzLUVTJyxcclxuICAgICAgICBzb3J0X2J5OiBwYXJhbXMuc29ydEJ5IHx8ICdwb3B1bGFyaXR5LmRlc2MnLFxyXG4gICAgICAgIHBhZ2U6IChwYXJhbXMucGFnZSB8fCAxKS50b1N0cmluZygpLFxyXG4gICAgICAgIGluY2x1ZGVfYWR1bHQ6ICdmYWxzZSdcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBBZGQgZ2VucmUgZmlsdGVyaW5nIGlmIHNwZWNpZmllZFxyXG4gICAgICBpZiAocHJvY2Vzc2VkR2VucmVzKSB7XHJcbiAgICAgICAgcXVlcnlQYXJhbXMuYXBwZW5kKCd3aXRoX2dlbnJlcycsIHByb2Nlc3NlZEdlbnJlcyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfjq0gVXNpbmcgZ2VucmVzIGZvciAke3BhcmFtcy5tZWRpYVR5cGV9OiAke3Byb2Nlc3NlZEdlbnJlc31gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgdXJsID0gYCR7dGhpcy5iYXNlVXJsfSR7ZW5kcG9pbnR9PyR7cXVlcnlQYXJhbXN9YDtcclxuICAgICAgY29uc29sZS5sb2coYPCfjJAgVE1EQjogTWFraW5nIHJlcXVlc3QgdG8gJHtlbmRwb2ludH1gKTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XHJcbiAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAgICdVc2VyLUFnZW50JzogJ1RyaW5pdHktQmFja2VuZC8xLjAnXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRNREIgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIGFueTtcclxuICAgICAgbGV0IHJlc3VsdHM6IFRNREJDb250ZW50W10gPSBkYXRhLnJlc3VsdHMgfHwgW107XHJcblxyXG4gICAgICAvLyBGaWx0ZXIgb3V0IGV4Y2x1ZGVkIElEcyBpZiBwcm92aWRlZFxyXG4gICAgICBpZiAocGFyYW1zLmV4Y2x1ZGVJZHMgJiYgcGFyYW1zLmV4Y2x1ZGVJZHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGNvbnN0IGV4Y2x1ZGVTZXQgPSBuZXcgU2V0KHBhcmFtcy5leGNsdWRlSWRzKTtcclxuICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIoaXRlbSA9PiAhZXhjbHVkZVNldC5oYXMoaXRlbS5pZC50b1N0cmluZygpKSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEVOSEFOQ0VEOiBWYWxpZGF0ZSByZXF1aXJlZCBmaWVsZHMgYW5kIGNvbnRlbnQgdHlwZSBjb25zaXN0ZW5jeVxyXG4gICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIoaXRlbSA9PiB0aGlzLnZhbGlkYXRlQ29udGVudEZpZWxkcyhpdGVtLCBwYXJhbXMubWVkaWFUeXBlKSk7XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFRNREI6IFJldHJpZXZlZCAke3Jlc3VsdHMubGVuZ3RofSB2YWxpZCAke3BhcmFtcy5tZWRpYVR5cGV9IGl0ZW1zYCk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDAgJiYgcGFyYW1zLndpdGhHZW5yZXMpIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBObyByZXN1bHRzIGZvdW5kIGZvciAke3BhcmFtcy5tZWRpYVR5cGV9IHdpdGggZ2VucmVzOiAke3Byb2Nlc3NlZEdlbnJlc31gKTtcclxuICAgICAgICBjb25zb2xlLndhcm4oYPCfkqEgT3JpZ2luYWwgZ2VucmVzOiAke3BhcmFtcy53aXRoR2VucmVzfWApO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4gcmVzdWx0cztcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgVE1EQjogRXJyb3IgZGlzY292ZXJpbmcgJHtwYXJhbXMubWVkaWFUeXBlfSBjb250ZW50OmAsIGVycm9yKTtcclxuICAgICAgXHJcbiAgICAgIC8vIEdyYWNlZnVsIGVycm9yIGhhbmRsaW5nIChSZXF1aXJlbWVudHM6IDQuNilcclxuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygncmF0ZSBsaW1pdCcpKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ+KPsyBUTURCOiBSYXRlIGxpbWl0IGhpdCwgaW1wbGVtZW50aW5nIGJhY2tvZmYuLi4nKTtcclxuICAgICAgICBhd2FpdCB0aGlzLmV4cG9uZW50aWFsQmFja29mZigpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRpc2NvdmVyQ29udGVudChwYXJhbXMpOyAvLyBSZXRyeSBvbmNlXHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSEVMUEVSOiBQYXJzZXMgZ2VucmUgc3RyaW5nIGludG8gYXJyYXkgb2YgbnVtYmVyc1xyXG4gICAqIFN1cHBvcnRzIGJvdGggY29tbWEtc2VwYXJhdGVkIChBTkQpIGFuZCBwaXBlLXNlcGFyYXRlZCAoT1IpIGZvcm1hdHNcclxuICAgKi9cclxuICBwcml2YXRlIHBhcnNlR2VucmVTdHJpbmcoZ2VucmVTdHJpbmc6IHN0cmluZyk6IG51bWJlcltdIHtcclxuICAgIC8vIEhhbmRsZSBib3RoIFwiMjgsMTJcIiAoQU5EKSBhbmQgXCIyOHwxMlwiIChPUikgZm9ybWF0c1xyXG4gICAgY29uc3Qgc2VwYXJhdG9yID0gZ2VucmVTdHJpbmcuaW5jbHVkZXMoJ3wnKSA/ICd8JyA6ICcsJztcclxuICAgIHJldHVybiBnZW5yZVN0cmluZy5zcGxpdChzZXBhcmF0b3IpXHJcbiAgICAgIC5tYXAoaWQgPT4gcGFyc2VJbnQoaWQudHJpbSgpLCAxMCkpXHJcbiAgICAgIC5maWx0ZXIoaWQgPT4gIWlzTmFOKGlkKSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXRzIGF2YWlsYWJsZSBnZW5yZXMgZm9yIG1vdmllc1xyXG4gICAqIFJlcXVpcmVtZW50czogMS40LCAyLjFcclxuICAgKi9cclxuICBhc3luYyBnZXRNb3ZpZUdlbnJlcygpOiBQcm9taXNlPEdlbnJlW10+IHtcclxuICAgIHJldHVybiB0aGlzLmdldEdlbnJlcygnTU9WSUUnKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldHMgYXZhaWxhYmxlIGdlbnJlcyBmb3IgVFYgc2hvd3NcclxuICAgKiBSZXF1aXJlbWVudHM6IDEuNCwgMi4xXHJcbiAgICovXHJcbiAgYXN5bmMgZ2V0VFZHZW5yZXMoKTogUHJvbWlzZTxHZW5yZVtdPiB7XHJcbiAgICByZXR1cm4gdGhpcy5nZXRHZW5yZXMoJ1RWJyk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmljIG1ldGhvZCB0byBnZXQgZ2VucmVzIGZvciBhbnkgbWVkaWEgdHlwZVxyXG4gICAqIFJlcXVpcmVtZW50czogMS40LCAyLjFcclxuICAgKi9cclxuICBhc3luYyBnZXRHZW5yZXMobWVkaWFUeXBlOiBNZWRpYVR5cGUpOiBQcm9taXNlPEdlbnJlW10+IHtcclxuICAgIHRoaXMudmFsaWRhdGVNZWRpYVR5cGUobWVkaWFUeXBlKTtcclxuICAgIFxyXG4gICAgY29uc3QgZW5kcG9pbnQgPSBtZWRpYVR5cGUgPT09ICdNT1ZJRScgPyAnL2dlbnJlL21vdmllL2xpc3QnIDogJy9nZW5yZS90di9saXN0JztcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYPCfjq0gVE1EQjogR2V0dGluZyAke21lZGlhVHlwZX0gZ2VucmVzYCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5lbmZvcmNlUmF0ZUxpbWl0KCk7XHJcblxyXG4gICAgICBjb25zdCBxdWVyeVBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoe1xyXG4gICAgICAgIGFwaV9rZXk6IHRoaXMuYXBpS2V5LFxyXG4gICAgICAgIGxhbmd1YWdlOiAnZXMtRVMnXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgdXJsID0gYCR7dGhpcy5iYXNlVXJsfSR7ZW5kcG9pbnR9PyR7cXVlcnlQYXJhbXN9YDtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XHJcbiAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAgICdVc2VyLUFnZW50JzogJ1RyaW5pdHktQmFja2VuZC8xLjAnXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRNREIgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIGFueTtcclxuICAgICAgY29uc3QgZ2VucmVzOiBHZW5yZVtdID0gZGF0YS5nZW5yZXMgfHwgW107XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFRNREI6IFJldHJpZXZlZCAke2dlbnJlcy5sZW5ndGh9ICR7bWVkaWFUeXBlfSBnZW5yZXNgKTtcclxuICAgICAgcmV0dXJuIGdlbnJlcztcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgVE1EQjogRXJyb3IgZ2V0dGluZyAke21lZGlhVHlwZX0gZ2VucmVzOmAsIGVycm9yKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFTkhBTkNFRDogVmFsaWRhdGVzIHRoYXQgY29udGVudCBoYXMgYWxsIHJlcXVpcmVkIGZpZWxkcyBhbmQgbWF0Y2hlcyBtZWRpYSB0eXBlXHJcbiAgICogUmVxdWlyZW1lbnRzOiA0LjUsIDEuMywgMS40XHJcbiAgICovXHJcbiAgcHJpdmF0ZSB2YWxpZGF0ZUNvbnRlbnRGaWVsZHMoaXRlbTogYW55LCBleHBlY3RlZE1lZGlhVHlwZTogTWVkaWFUeXBlKTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCByZXF1aXJlZEZpZWxkcyA9IFtcclxuICAgICAgJ2lkJyxcclxuICAgICAgJ292ZXJ2aWV3JyxcclxuICAgICAgJ2dlbnJlX2lkcycsXHJcbiAgICAgICd2b3RlX2F2ZXJhZ2UnXHJcbiAgICBdO1xyXG5cclxuICAgIC8vIENoZWNrIGZvciB0aXRsZS9uYW1lIGJhc2VkIG9uIG1lZGlhIHR5cGVcclxuICAgIGxldCBoYXNUaXRsZSA9IGZhbHNlO1xyXG4gICAgaWYgKGV4cGVjdGVkTWVkaWFUeXBlID09PSAnTU9WSUUnKSB7XHJcbiAgICAgIGhhc1RpdGxlID0gISFpdGVtLnRpdGxlO1xyXG4gICAgfSBlbHNlIGlmIChleHBlY3RlZE1lZGlhVHlwZSA9PT0gJ1RWJykge1xyXG4gICAgICBoYXNUaXRsZSA9ICEhaXRlbS5uYW1lO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIWhhc1RpdGxlKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIENvbnRlbnQgbWlzc2luZyB0aXRsZS9uYW1lIGZvciAke2V4cGVjdGVkTWVkaWFUeXBlfTpgLCBpdGVtLmlkKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGZvciByZWxlYXNlIGRhdGUgYmFzZWQgb24gbWVkaWEgdHlwZVxyXG4gICAgbGV0IGhhc1JlbGVhc2VEYXRlID0gZmFsc2U7XHJcbiAgICBpZiAoZXhwZWN0ZWRNZWRpYVR5cGUgPT09ICdNT1ZJRScpIHtcclxuICAgICAgaGFzUmVsZWFzZURhdGUgPSAhIWl0ZW0ucmVsZWFzZV9kYXRlO1xyXG4gICAgfSBlbHNlIGlmIChleHBlY3RlZE1lZGlhVHlwZSA9PT0gJ1RWJykge1xyXG4gICAgICBoYXNSZWxlYXNlRGF0ZSA9ICEhaXRlbS5maXJzdF9haXJfZGF0ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFoYXNSZWxlYXNlRGF0ZSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBDb250ZW50IG1pc3NpbmcgcmVsZWFzZSBkYXRlIGZvciAke2V4cGVjdGVkTWVkaWFUeXBlfTpgLCBpdGVtLmlkKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIG90aGVyIHJlcXVpcmVkIGZpZWxkc1xyXG4gICAgY29uc3QgaGFzUmVxdWlyZWRGaWVsZHMgPSByZXF1aXJlZEZpZWxkcy5ldmVyeShmaWVsZCA9PiB7XHJcbiAgICAgIGNvbnN0IGhhc0ZpZWxkID0gaXRlbVtmaWVsZF0gIT09IHVuZGVmaW5lZCAmJiBpdGVtW2ZpZWxkXSAhPT0gbnVsbDtcclxuICAgICAgaWYgKCFoYXNGaWVsZCkge1xyXG4gICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIENvbnRlbnQgbWlzc2luZyByZXF1aXJlZCBmaWVsZCAnJHtmaWVsZH0nOmAsIGl0ZW0uaWQpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBoYXNGaWVsZDtcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZGl0aW9uYWwgdmFsaWRhdGlvbjogb3ZlcnZpZXcgc2hvdWxkIG5vdCBiZSBlbXB0eVxyXG4gICAgaWYgKHR5cGVvZiBpdGVtLm92ZXJ2aWV3ID09PSAnc3RyaW5nJyAmJiBpdGVtLm92ZXJ2aWV3LnRyaW0oKS5sZW5ndGggPT09IDApIHtcclxuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gQ29udGVudCBoYXMgZW1wdHkgb3ZlcnZpZXc6YCwgaXRlbS5pZCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gaGFzUmVxdWlyZWRGaWVsZHM7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFbmZvcmNlcyByYXRlIGxpbWl0aW5nIHRvIHJlc3BlY3QgVE1EQiBBUEkgbGltaXRzXHJcbiAgICogUmVxdWlyZW1lbnRzOiA0LjZcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGVuZm9yY2VSYXRlTGltaXQoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xyXG4gICAgY29uc3QgdGltZVNpbmNlTGFzdFJlcXVlc3QgPSBub3cgLSB0aGlzLmxhc3RSZXF1ZXN0VGltZTtcclxuXHJcbiAgICBpZiAodGltZVNpbmNlTGFzdFJlcXVlc3QgPCB0aGlzLlJBVEVfTElNSVRfREVMQVkpIHtcclxuICAgICAgY29uc3QgZGVsYXkgPSB0aGlzLlJBVEVfTElNSVRfREVMQVkgLSB0aW1lU2luY2VMYXN0UmVxdWVzdDtcclxuICAgICAgY29uc29sZS5sb2coYOKPsyBUTURCOiBSYXRlIGxpbWl0aW5nIC0gd2FpdGluZyAke2RlbGF5fW1zYCk7XHJcbiAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBkZWxheSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMubGFzdFJlcXVlc3RUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgIHRoaXMucmVxdWVzdENvdW50Kys7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBJbXBsZW1lbnRzIGV4cG9uZW50aWFsIGJhY2tvZmYgZm9yIGVycm9yIHJlY292ZXJ5XHJcbiAgICogUmVxdWlyZW1lbnRzOiA0LjZcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGV4cG9uZW50aWFsQmFja29mZigpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IGRlbGF5ID0gTWF0aC5taW4oMTAwMCAqIE1hdGgucG93KDIsIHRoaXMucmVxdWVzdENvdW50ICUgNSksIDMwMDAwKTsgLy8gTWF4IDMwIHNlY29uZHNcclxuICAgIGNvbnNvbGUubG9nKGDij7MgVE1EQjogRXhwb25lbnRpYWwgYmFja29mZiAtIHdhaXRpbmcgJHtkZWxheX1tc2ApO1xyXG4gICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIGRlbGF5KSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBVVElMSVRZOiBHZXRzIGdlbnJlIG1hcHBpbmcgaW5mb3JtYXRpb24gZm9yIGRlYnVnZ2luZ1xyXG4gICAqIFJlcXVpcmVtZW50czogMS4yLCAzLjVcclxuICAgKi9cclxuICBnZXRHZW5yZU1hcHBpbmcoKTogeyBbbW92aWVHZW5yZUlkOiBudW1iZXJdOiBudW1iZXIgfSB7XHJcbiAgICByZXR1cm4geyAuLi5HRU5SRV9NQVBQSU5HIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBVVElMSVRZOiBNYXBzIGEgc2luZ2xlIGdlbnJlIElEIGZyb20gbW92aWUgdG8gVFYgZm9ybWF0XHJcbiAgICogUmVxdWlyZW1lbnRzOiAxLjIsIDMuNVxyXG4gICAqL1xyXG4gIG1hcFNpbmdsZUdlbnJlSWQobW92aWVHZW5yZUlkOiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgcmV0dXJuIEdFTlJFX01BUFBJTkdbbW92aWVHZW5yZUlkXSB8fCBtb3ZpZUdlbnJlSWQ7XHJcbiAgfVxyXG59Il19