"use strict";
/**
 * EnhancedTMDBClient - TMDB API Integration with Discover Endpoints
 *
 * Provides optimized communication with TMDB API for content filtering:
 * - Discover movies and TV shows with genre filtering
 * - Support for AND/OR genre logic
 * - Genre list retrieval
 * - Error handling and rate limiting
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedTMDBClient = void 0;
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
     * Generic discover method for both movies and TV
     * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
     */
    async discoverContent(params) {
        console.log('🚨 DEBUG: ENHANCED TMDB CLIENT WITH STRICT FILTERING ACTIVE 🚨');
        const endpoint = params.mediaType === 'MOVIE' ? '/discover/movie' : '/discover/tv';
        console.log(`🔍 TMDB: Discovering ${params.mediaType} content`, {
            withGenres: params.withGenres,
            sortBy: params.sortBy,
            excludeCount: params.excludeIds?.length || 0
        });
        try {
            await this.enforceRateLimit();
            const queryParams = new URLSearchParams({
                api_key: this.apiKey,
                language: 'es-ES',
                sort_by: params.sortBy || 'popularity.desc',
                page: (params.page || 1).toString(),
                include_adult: 'false',
                // Add minimum vote count to improve quality
                'vote_count.gte': '5' // Minimum 5 votes to ensure some popularity
            });
            // Add genre filtering if specified
            if (params.withGenres) {
                queryParams.append('with_genres', params.withGenres);
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
            
            console.log(`🔍 TMDB: Raw results from API: ${results.length} items`);
            
            // FIRST: Filter out excluded IDs if provided
            if (params.excludeIds && params.excludeIds.length > 0) {
                const excludeSet = new Set(params.excludeIds);
                results = results.filter(item => !excludeSet.has(item.id.toString()));
                console.log(`🔍 TMDB: After excluding IDs: ${results.length} items`);
            }
            
            // SECOND: STRICT Filter by western languages only
            results = results.filter(item => {
                const originalLang = item.original_language;
                const westernLanguages = ['es', 'en', 'fr', 'it', 'pt', 'de'];
                const isWesternLanguage = westernLanguages.includes(originalLang);
                
                if (!isWesternLanguage) {
                    console.log(`❌ TMDB: Filtering out non-western language: ${item.title || item.name} (${originalLang})`);
                }
                
                return isWesternLanguage;
            });
            console.log(`🔍 TMDB: After language filtering: ${results.length} items`);
            
            // THIRD: STRICT Filter out content without meaningful descriptions
            results = results.filter(item => {
                const overview = item.overview;
                const hasValidDescription = overview && 
                                          typeof overview === 'string' && 
                                          overview.trim().length >= 30; // Increased to 30 characters minimum
                
                if (!hasValidDescription) {
                    console.log(`❌ TMDB: Filtering out item without description: ${item.title || item.name} (overview length: ${overview ? overview.trim().length : 0})`);
                }
                
                return hasValidDescription;
            });
            console.log(`🔍 TMDB: After description filtering: ${results.length} items`);
            
            // Additional genre validation for filtered requests
            if (params.withGenres) {
                // Handle pipe-separated OR logic (Priority 2)
                if (params.withGenres.includes('|')) {
                    const targetGenres = params.withGenres.split('|').map(g => parseInt(g.trim()));
                    console.log(`🔍 TMDB: Validating OR genres [${targetGenres.join(' OR ')}] for ${results.length} items`);
                    
                    results = results.filter(item => {
                        const itemGenres = item.genre_ids || [];
                        // For OR logic, item must have AT LEAST ONE of the target genres
                        const hasAnyGenre = targetGenres.some(genreId => itemGenres.includes(genreId));
                        if (!hasAnyGenre) {
                            console.log(`❌ TMDB: ${item.title || item.name} missing any required genre. Has: [${itemGenres.join(',')}], Needs any of: [${targetGenres.join(',')}]`);
                        }
                        return hasAnyGenre;
                    });
                }
                // Handle comma-separated AND logic (Priority 1)
                else if (params.withGenres.includes(',')) {
                    const targetGenres = params.withGenres.split(',').map(g => parseInt(g.trim()));
                    console.log(`🔍 TMDB: Validating AND genres [${targetGenres.join(' AND ')}] for ${results.length} items`);
                    
                    results = results.filter(item => {
                        const itemGenres = item.genre_ids || [];
                        // For AND logic, item must have ALL target genres (can have additional ones)
                        const hasAllGenres = targetGenres.every(genreId => itemGenres.includes(genreId));
                        if (!hasAllGenres) {
                            const missingGenres = targetGenres.filter(genreId => !itemGenres.includes(genreId));
                            console.log(`❌ TMDB: ${item.title || item.name} missing required genres. Has: [${itemGenres.join(',')}], Missing: [${missingGenres.join(',')}]`);
                        }
                        return hasAllGenres;
                    });
                }
                // Handle single genre (fallback)
                else {
                    const targetGenre = parseInt(params.withGenres.trim());
                    console.log(`🔍 TMDB: Validating single genre ${targetGenre} for ${results.length} items`);
                    
                    results = results.filter(item => {
                        const itemGenres = item.genre_ids || [];
                        const hasTargetGenre = itemGenres.includes(targetGenre);
                        if (!hasTargetGenre) {
                            console.log(`❌ TMDB: ${item.title || item.name} missing genre ${targetGenre}. Has: [${itemGenres.join(',')}]`);
                        }
                        return hasTargetGenre;
                    });
                }
                
                console.log(`✅ TMDB: After genre validation: ${results.length} items remain`);
            }
            
            // Validate required fields (Requirements: 4.5)
            results = results.filter(item => this.validateContentFields(item));
            console.log(`✅ TMDB: Retrieved ${results.length} valid ${params.mediaType} items (after all filters)`);
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
     * Validates that content has all required fields (simplified - main validation done earlier)
     * Requirements: 4.5
     */
    validateContentFields(item) {
        // Basic field validation only (language and description already validated)
        const requiredFields = ['id', 'genre_ids', 'vote_average'];
        
        // Check for title/name
        const hasTitle = item.title || item.name;
        if (!hasTitle) {
            return false;
        }
        
        // Check for release date
        const hasReleaseDate = item.release_date || item.first_air_date;
        if (!hasReleaseDate) {
            return false;
        }
        
        // Check other required fields
        const hasRequiredFields = requiredFields.every(field => item[field] !== undefined && item[field] !== null);
        
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
}
exports.EnhancedTMDBClient = EnhancedTMDBClient;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5oYW5jZWQtdG1kYi1jbGllbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbmhhbmNlZC10bWRiLWNsaWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7R0FVRzs7O0FBK0JILE1BQWEsa0JBQWtCO0lBTzdCO1FBTFEsWUFBTyxHQUFHLDhCQUE4QixDQUFDO1FBQ3pDLGlCQUFZLEdBQUcsQ0FBQyxDQUFDO1FBQ2pCLG9CQUFlLEdBQUcsQ0FBQyxDQUFDO1FBQ1gscUJBQWdCLEdBQUcsR0FBRyxDQUFDLENBQUMsd0JBQXdCO1FBRy9ELElBQUksQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLElBQUksRUFBRSxDQUFDO1FBQzdDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDakIsT0FBTyxDQUFDLElBQUksQ0FBQyxvREFBb0QsQ0FBQyxDQUFDO1FBQ3JFLENBQUM7SUFDSCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUF5QztRQUM1RCxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxHQUFHLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUF5QztRQUN4RCxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxHQUFHLE1BQU0sRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLGVBQWUsQ0FBQyxNQUFzQjtRQUMxQyxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsU0FBUyxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQztRQUVuRixPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixN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LSBUTURCIEFQSSBJbnRlZ3JhdGlvbiB3aXRoIERpc2NvdmVyIEVuZHBvaW50c1xyXG4gKiBcclxuICogUHJvdmlkZXMgb3B0aW1pemVkIGNvbW11bmljYXRpb24gd2l0aCBUTURCIEFQSSBmb3IgY29udGVudCBmaWx0ZXJpbmc6XHJcbiAqIC0gRGlzY292ZXIgbW92aWVzIGFuZCBUViBzaG93cyB3aXRoIGdlbnJlIGZpbHRlcmluZ1xyXG4gKiAtIFN1cHBvcnQgZm9yIEFORC9PUiBnZW5yZSBsb2dpY1xyXG4gKiAtIEdlbnJlIGxpc3QgcmV0cmlldmFsXHJcbiAqIC0gRXJyb3IgaGFuZGxpbmcgYW5kIHJhdGUgbGltaXRpbmdcclxuICogXHJcbiAqIFJlcXVpcmVtZW50czogNC4xLCA0LjIsIDQuMywgNC40LCA0LjUsIDQuNlxyXG4gKi9cclxuXHJcbmltcG9ydCB7IE1lZGlhVHlwZSB9IGZyb20gJy4uL3R5cGVzL2NvbnRlbnQtZmlsdGVyaW5nLXR5cGVzJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRGlzY292ZXJQYXJhbXMge1xyXG4gIG1lZGlhVHlwZTogTWVkaWFUeXBlO1xyXG4gIHdpdGhHZW5yZXM/OiBzdHJpbmc7ICAvLyBcIjI4LDEyXCIgZm9yIEFORCwgXCIyOHwxMlwiIGZvciBPUlxyXG4gIHNvcnRCeT86ICdwb3B1bGFyaXR5LmRlc2MnIHwgJ3ZvdGVfYXZlcmFnZS5kZXNjJztcclxuICBwYWdlPzogbnVtYmVyO1xyXG4gIGV4Y2x1ZGVJZHM/OiBzdHJpbmdbXTtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUTURCQ29udGVudCB7XHJcbiAgaWQ6IG51bWJlcjtcclxuICB0aXRsZT86IHN0cmluZztcclxuICBuYW1lPzogc3RyaW5nO1xyXG4gIG92ZXJ2aWV3OiBzdHJpbmc7XHJcbiAgcG9zdGVyX3BhdGg/OiBzdHJpbmc7XHJcbiAgYmFja2Ryb3BfcGF0aD86IHN0cmluZztcclxuICBnZW5yZV9pZHM6IG51bWJlcltdO1xyXG4gIHZvdGVfYXZlcmFnZTogbnVtYmVyO1xyXG4gIHJlbGVhc2VfZGF0ZT86IHN0cmluZztcclxuICBmaXJzdF9haXJfZGF0ZT86IHN0cmluZztcclxuICBtZWRpYV90eXBlPzogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEdlbnJlIHtcclxuICBpZDogbnVtYmVyO1xyXG4gIG5hbWU6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEVuaGFuY2VkVE1EQkNsaWVudCB7XHJcbiAgcHJpdmF0ZSBhcGlLZXk6IHN0cmluZztcclxuICBwcml2YXRlIGJhc2VVcmwgPSAnaHR0cHM6Ly9hcGkudGhlbW92aWVkYi5vcmcvMyc7XHJcbiAgcHJpdmF0ZSByZXF1ZXN0Q291bnQgPSAwO1xyXG4gIHByaXZhdGUgbGFzdFJlcXVlc3RUaW1lID0gMDtcclxuICBwcml2YXRlIHJlYWRvbmx5IFJBVEVfTElNSVRfREVMQVkgPSAyNTA7IC8vIDQgcmVxdWVzdHMgcGVyIHNlY29uZFxyXG5cclxuICBjb25zdHJ1Y3RvcigpIHtcclxuICAgIHRoaXMuYXBpS2V5ID0gcHJvY2Vzcy5lbnYuVE1EQl9BUElfS0VZIHx8ICcnO1xyXG4gICAgaWYgKCF0aGlzLmFwaUtleSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBUTURCX0FQSV9LRVkgbm90IGZvdW5kIGluIGVudmlyb25tZW50IHZhcmlhYmxlcycpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRGlzY292ZXJzIG1vdmllcyB1c2luZyBUTURCIGRpc2NvdmVyIGVuZHBvaW50XHJcbiAgICogUmVxdWlyZW1lbnRzOiA0LjEsIDQuMywgNC40XHJcbiAgICovXHJcbiAgYXN5bmMgZGlzY292ZXJNb3ZpZXMocGFyYW1zOiBPbWl0PERpc2NvdmVyUGFyYW1zLCAnbWVkaWFUeXBlJz4pOiBQcm9taXNlPFRNREJDb250ZW50W10+IHtcclxuICAgIHJldHVybiB0aGlzLmRpc2NvdmVyQ29udGVudCh7IC4uLnBhcmFtcywgbWVkaWFUeXBlOiAnTU9WSUUnIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRGlzY292ZXJzIFRWIHNob3dzIHVzaW5nIFRNREIgZGlzY292ZXIgZW5kcG9pbnRcclxuICAgKiBSZXF1aXJlbWVudHM6IDQuMiwgNC4zLCA0LjRcclxuICAgKi9cclxuICBhc3luYyBkaXNjb3ZlclRWKHBhcmFtczogT21pdDxEaXNjb3ZlclBhcmFtcywgJ21lZGlhVHlwZSc+KTogUHJvbWlzZTxUTURCQ29udGVudFtdPiB7XHJcbiAgICByZXR1cm4gdGhpcy5kaXNjb3ZlckNvbnRlbnQoeyAuLi5wYXJhbXMsIG1lZGlhVHlwZTogJ1RWJyB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdlbmVyaWMgZGlzY292ZXIgbWV0aG9kIGZvciBib3RoIG1vdmllcyBhbmQgVFZcclxuICAgKiBSZXF1aXJlbWVudHM6IDQuMSwgNC4yLCA0LjMsIDQuNCwgNC41XHJcbiAgICovXHJcbiAgYXN5bmMgZGlzY292ZXJDb250ZW50KHBhcmFtczogRGlzY292ZXJQYXJhbXMpOiBQcm9taXNlPFRNREJDb250ZW50W10+IHtcclxuICAgIGNvbnN0IGVuZHBvaW50ID0gcGFyYW1zLm1lZGlhVHlwZSA9PT0gJ01PVklFJyA/ICcvZGlzY292ZXIvbW92aWUnIDogJy9kaXNjb3Zlci90dic7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGDwn5SNIFRNREI6IERpc2NvdmVyaW5nICR7cGFyYW1zLm1lZGlhVHlwZX0gY29udGVudGAsIHtcclxuICAgICAgd2l0aEdlbnJlczogcGFyYW1zLndpdGhHZW5yZXMsXHJcbiAgICAgIHNvcnRCeTogcGFyYW1zLnNvcnRCeSxcclxuICAgICAgZXhjbHVkZUNvdW50OiBwYXJhbXMuZXhjbHVkZUlkcz8ubGVuZ3RoIHx8IDBcclxuICAgIH0pO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuZW5mb3JjZVJhdGVMaW1pdCgpO1xyXG5cclxuICAgICAgY29uc3QgcXVlcnlQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHtcclxuICAgICAgICBhcGlfa2V5OiB0aGlzLmFwaUtleSxcclxuICAgICAgICBsYW5ndWFnZTogJ2VzLUVTJyxcclxuICAgICAgICBzb3J0X2J5OiBwYXJhbXMuc29ydEJ5IHx8ICdwb3B1bGFyaXR5LmRlc2MnLFxyXG4gICAgICAgIHBhZ2U6IChwYXJhbXMucGFnZSB8fCAxKS50b1N0cmluZygpLFxyXG4gICAgICAgIGluY2x1ZGVfYWR1bHQ6ICdmYWxzZSdcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBBZGQgZ2VucmUgZmlsdGVyaW5nIGlmIHNwZWNpZmllZFxyXG4gICAgICBpZiAocGFyYW1zLndpdGhHZW5yZXMpIHtcclxuICAgICAgICBxdWVyeVBhcmFtcy5hcHBlbmQoJ3dpdGhfZ2VucmVzJywgcGFyYW1zLndpdGhHZW5yZXMpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCB1cmwgPSBgJHt0aGlzLmJhc2VVcmx9JHtlbmRwb2ludH0/JHtxdWVyeVBhcmFtc31gO1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+MkCBUTURCOiBNYWtpbmcgcmVxdWVzdCB0byAke2VuZHBvaW50fWApO1xyXG5cclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgJ1VzZXItQWdlbnQnOiAnVHJpbml0eS1CYWNrZW5kLzEuMCdcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVE1EQiBBUEkgZXJyb3I6ICR7cmVzcG9uc2Uuc3RhdHVzfSAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgYW55O1xyXG4gICAgICBsZXQgcmVzdWx0czogVE1EQkNvbnRlbnRbXSA9IGRhdGEucmVzdWx0cyB8fCBbXTtcclxuXHJcbiAgICAgIC8vIEZpbHRlciBvdXQgZXhjbHVkZWQgSURzIGlmIHByb3ZpZGVkXHJcbiAgICAgIGlmIChwYXJhbXMuZXhjbHVkZUlkcyAmJiBwYXJhbXMuZXhjbHVkZUlkcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgY29uc3QgZXhjbHVkZVNldCA9IG5ldyBTZXQocGFyYW1zLmV4Y2x1ZGVJZHMpO1xyXG4gICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihpdGVtID0+ICFleGNsdWRlU2V0LmhhcyhpdGVtLmlkLnRvU3RyaW5nKCkpKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gVmFsaWRhdGUgcmVxdWlyZWQgZmllbGRzIChSZXF1aXJlbWVudHM6IDQuNSlcclxuICAgICAgcmVzdWx0cyA9IHJlc3VsdHMuZmlsdGVyKGl0ZW0gPT4gdGhpcy52YWxpZGF0ZUNvbnRlbnRGaWVsZHMoaXRlbSkpO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYOKchSBUTURCOiBSZXRyaWV2ZWQgJHtyZXN1bHRzLmxlbmd0aH0gdmFsaWQgJHtwYXJhbXMubWVkaWFUeXBlfSBpdGVtc2ApO1xyXG4gICAgICByZXR1cm4gcmVzdWx0cztcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgVE1EQjogRXJyb3IgZGlzY292ZXJpbmcgJHtwYXJhbXMubWVkaWFUeXBlfSBjb250ZW50OmAsIGVycm9yKTtcclxuICAgICAgXHJcbiAgICAgIC8vIEdyYWNlZnVsIGVycm9yIGhhbmRsaW5nIChSZXF1aXJlbWVudHM6IDQuNilcclxuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygncmF0ZSBsaW1pdCcpKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ+KPsyBUTURCOiBSYXRlIGxpbWl0IGhpdCwgaW1wbGVtZW50aW5nIGJhY2tvZmYuLi4nKTtcclxuICAgICAgICBhd2FpdCB0aGlzLmV4cG9uZW50aWFsQmFja29mZigpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRpc2NvdmVyQ29udGVudChwYXJhbXMpOyAvLyBSZXRyeSBvbmNlXHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0cyBhdmFpbGFibGUgZ2VucmVzIGZvciBtb3ZpZXNcclxuICAgKiBSZXF1aXJlbWVudHM6IDEuNCwgMi4xXHJcbiAgICovXHJcbiAgYXN5bmMgZ2V0TW92aWVHZW5yZXMoKTogUHJvbWlzZTxHZW5yZVtdPiB7XHJcbiAgICByZXR1cm4gdGhpcy5nZXRHZW5yZXMoJ01PVklFJyk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXRzIGF2YWlsYWJsZSBnZW5yZXMgZm9yIFRWIHNob3dzXHJcbiAgICogUmVxdWlyZW1lbnRzOiAxLjQsIDIuMVxyXG4gICAqL1xyXG4gIGFzeW5jIGdldFRWR2VucmVzKCk6IFByb21pc2U8R2VucmVbXT4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZ2V0R2VucmVzKCdUVicpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJpYyBtZXRob2QgdG8gZ2V0IGdlbnJlcyBmb3IgYW55IG1lZGlhIHR5cGVcclxuICAgKiBSZXF1aXJlbWVudHM6IDEuNCwgMi4xXHJcbiAgICovXHJcbiAgYXN5bmMgZ2V0R2VucmVzKG1lZGlhVHlwZTogTWVkaWFUeXBlKTogUHJvbWlzZTxHZW5yZVtdPiB7XHJcbiAgICBjb25zdCBlbmRwb2ludCA9IG1lZGlhVHlwZSA9PT0gJ01PVklFJyA/ICcvZ2VucmUvbW92aWUvbGlzdCcgOiAnL2dlbnJlL3R2L2xpc3QnO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhg8J+OrSBUTURCOiBHZXR0aW5nICR7bWVkaWFUeXBlfSBnZW5yZXNgKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCB0aGlzLmVuZm9yY2VSYXRlTGltaXQoKTtcclxuXHJcbiAgICAgIGNvbnN0IHF1ZXJ5UGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh7XHJcbiAgICAgICAgYXBpX2tleTogdGhpcy5hcGlLZXksXHJcbiAgICAgICAgbGFuZ3VhZ2U6ICdlcy1FUydcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCB1cmwgPSBgJHt0aGlzLmJhc2VVcmx9JHtlbmRwb2ludH0/JHtxdWVyeVBhcmFtc31gO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgJ1VzZXItQWdlbnQnOiAnVHJpbml0eS1CYWNrZW5kLzEuMCdcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVE1EQiBBUEkgZXJyb3I6ICR7cmVzcG9uc2Uuc3RhdHVzfSAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgYW55O1xyXG4gICAgICBjb25zdCBnZW5yZXM6IEdlbnJlW10gPSBkYXRhLmdlbnJlcyB8fCBbXTtcclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgVE1EQjogUmV0cmlldmVkICR7Z2VucmVzLmxlbmd0aH0gJHttZWRpYVR5cGV9IGdlbnJlc2ApO1xyXG4gICAgICByZXR1cm4gZ2VucmVzO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBUTURCOiBFcnJvciBnZXR0aW5nICR7bWVkaWFUeXBlfSBnZW5yZXM6YCwgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlcyB0aGF0IGNvbnRlbnQgaGFzIGFsbCByZXF1aXJlZCBmaWVsZHNcclxuICAgKiBSZXF1aXJlbWVudHM6IDQuNVxyXG4gICAqL1xyXG4gIHByaXZhdGUgdmFsaWRhdGVDb250ZW50RmllbGRzKGl0ZW06IGFueSk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgcmVxdWlyZWRGaWVsZHMgPSBbXHJcbiAgICAgICdpZCcsXHJcbiAgICAgICdvdmVydmlldycsXHJcbiAgICAgICdnZW5yZV9pZHMnLFxyXG4gICAgICAndm90ZV9hdmVyYWdlJ1xyXG4gICAgXTtcclxuXHJcbiAgICAvLyBDaGVjayBmb3IgdGl0bGUvbmFtZVxyXG4gICAgY29uc3QgaGFzVGl0bGUgPSBpdGVtLnRpdGxlIHx8IGl0ZW0ubmFtZTtcclxuICAgIGlmICghaGFzVGl0bGUpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAvLyBDaGVjayBmb3IgcmVsZWFzZSBkYXRlXHJcbiAgICBjb25zdCBoYXNSZWxlYXNlRGF0ZSA9IGl0ZW0ucmVsZWFzZV9kYXRlIHx8IGl0ZW0uZmlyc3RfYWlyX2RhdGU7XHJcbiAgICBpZiAoIWhhc1JlbGVhc2VEYXRlKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgLy8gQ2hlY2sgb3RoZXIgcmVxdWlyZWQgZmllbGRzXHJcbiAgICByZXR1cm4gcmVxdWlyZWRGaWVsZHMuZXZlcnkoZmllbGQgPT4gaXRlbVtmaWVsZF0gIT09IHVuZGVmaW5lZCAmJiBpdGVtW2ZpZWxkXSAhPT0gbnVsbCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFbmZvcmNlcyByYXRlIGxpbWl0aW5nIHRvIHJlc3BlY3QgVE1EQiBBUEkgbGltaXRzXHJcbiAgICogUmVxdWlyZW1lbnRzOiA0LjZcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGVuZm9yY2VSYXRlTGltaXQoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xyXG4gICAgY29uc3QgdGltZVNpbmNlTGFzdFJlcXVlc3QgPSBub3cgLSB0aGlzLmxhc3RSZXF1ZXN0VGltZTtcclxuXHJcbiAgICBpZiAodGltZVNpbmNlTGFzdFJlcXVlc3QgPCB0aGlzLlJBVEVfTElNSVRfREVMQVkpIHtcclxuICAgICAgY29uc3QgZGVsYXkgPSB0aGlzLlJBVEVfTElNSVRfREVMQVkgLSB0aW1lU2luY2VMYXN0UmVxdWVzdDtcclxuICAgICAgY29uc29sZS5sb2coYOKPsyBUTURCOiBSYXRlIGxpbWl0aW5nIC0gd2FpdGluZyAke2RlbGF5fW1zYCk7XHJcbiAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBkZWxheSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMubGFzdFJlcXVlc3RUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgIHRoaXMucmVxdWVzdENvdW50Kys7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBJbXBsZW1lbnRzIGV4cG9uZW50aWFsIGJhY2tvZmYgZm9yIGVycm9yIHJlY292ZXJ5XHJcbiAgICogUmVxdWlyZW1lbnRzOiA0LjZcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGV4cG9uZW50aWFsQmFja29mZigpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IGRlbGF5ID0gTWF0aC5taW4oMTAwMCAqIE1hdGgucG93KDIsIHRoaXMucmVxdWVzdENvdW50ICUgNSksIDMwMDAwKTsgLy8gTWF4IDMwIHNlY29uZHNcclxuICAgIGNvbnNvbGUubG9nKGDij7MgVE1EQjogRXhwb25lbnRpYWwgYmFja29mZiAtIHdhaXRpbmcgJHtkZWxheX1tc2ApO1xyXG4gICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIGRlbGF5KSk7XHJcbiAgfVxyXG59Il19