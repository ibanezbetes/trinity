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
                include_adult: 'false'
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
            // Filter out excluded IDs if provided
            if (params.excludeIds && params.excludeIds.length > 0) {
                const excludeSet = new Set(params.excludeIds);
                results = results.filter(item => !excludeSet.has(item.id.toString()));
            }
            // Validate required fields (Requirements: 4.5)
            results = results.filter(item => this.validateContentFields(item));
            console.log(`✅ TMDB: Retrieved ${results.length} valid ${params.mediaType} items`);
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
     * Validates that content has all required fields and quality standards
     * Requirements: 4.5
     * 
     * Quality filters:
     * - Must have meaningful description (overview)
     * - Title must be in western/latin characters (not Asian scripts)
     * - Must have minimum rating and vote count
     */
    validateContentFields(item) {
        const requiredFields = [
            'id',
            'overview',
            'genre_ids',
            'vote_average'
        ];
        
        // Check for title/name
        const title = item.title || item.name;
        if (!title) return false;
        
        // QUALITY FILTER 1: Title must be in western/latin characters
        // Reject titles that are primarily in Asian scripts (Chinese, Japanese, Korean, Arabic, etc.)
        const hasWesternTitle = this.isWesternTitle(title);
        if (!hasWesternTitle) {
            console.log(`🚫 Rejected non-western title: "${title}"`);
            return false;
        }
        
        // QUALITY FILTER 2: Must have meaningful description
        const overview = item.overview || '';
        if (overview.length < 20) {
            console.log(`🚫 Rejected insufficient description: "${title}" (${overview.length} chars)`);
            return false;
        }
        
        // QUALITY FILTER 3: Must have minimum quality rating
        const rating = item.vote_average || 0;
        const voteCount = item.vote_count || 0;
        if (rating < 5.0 || voteCount < 10) {
            console.log(`🚫 Rejected low quality: "${title}" (rating: ${rating}, votes: ${voteCount})`);
            return false;
        }
        
        // Check for release date
        const hasReleaseDate = item.release_date || item.first_air_date;
        if (!hasReleaseDate) return false;
        
        // Check other required fields
        const hasRequiredFields = requiredFields.every(field => 
            item[field] !== undefined && item[field] !== null
        );
        
        if (hasRequiredFields) {
            console.log(`✅ Quality approved: "${title}" (rating: ${rating}, votes: ${voteCount})`);
        }
        
        return hasRequiredFields;
    }
    
    /**
     * Checks if a title is primarily in western/latin characters
     * Rejects titles in Asian scripts (Chinese, Japanese, Korean, Arabic, etc.)
     */
    isWesternTitle(title) {
        // Remove common punctuation and numbers
        const cleanTitle = title.replace(/[0-9\s\-\.\,\!\?\:\;\(\)\[\]\"\']/g, '');
        
        if (cleanTitle.length === 0) return true; // If only punctuation, allow it
        
        let westernChars = 0;
        let totalChars = cleanTitle.length;
        
        for (let char of cleanTitle) {
            const code = char.charCodeAt(0);
            
            // Latin characters (including accented)
            if ((code >= 65 && code <= 90) ||     // A-Z
                (code >= 97 && code <= 122) ||    // a-z
                (code >= 192 && code <= 687)) {   // Extended Latin (À-ʯ)
                westernChars++;
            }
            // Cyrillic (Russian, etc.) - also considered "western" for our purposes
            else if (code >= 1024 && code <= 1279) {
                westernChars++;
            }
        }
        
        // Require at least 70% western characters
        const westernRatio = westernChars / totalChars;
        return westernRatio >= 0.7;
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
