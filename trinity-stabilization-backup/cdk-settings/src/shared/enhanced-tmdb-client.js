"use strict";
/**
 * Enhanced TMDB Client - Extracted from MONOLITH files
 *
 * CRITICAL BUSINESS LOGIC:
 * - Western-only language filtering (en,es,fr,it,de,pt) - NO Asian languages per requirements
 * - Genre mapping between Movie and TV endpoints
 * - Strict endpoint enforcement (Movie vs TV)
 * - Business logic validation with zero tolerance
 * - Rate limiting and error handling
 *
 * Requirements: 1.4, 3.1, 3.5
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedTMDBClient = exports.GENRE_MAPPING = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
/**
 * CRITICAL: Genre ID mapping between Movies and TV
 * Some genres have different IDs between movie and TV endpoints
 */
exports.GENRE_MAPPING = {
    // Action (Movie: 28) → Action & Adventure (TV: 10759)
    28: 10759,
    // Adventure (Movie: 12) → Action & Adventure (TV: 10759) 
    12: 10759,
    // Western (Movie: 37) → Western (TV: 37) - Same ID
    37: 37,
    // War (Movie: 10752) → War & Politics (TV: 10768)
    10752: 10768
};
class EnhancedTMDBClient {
    constructor(apiKey) {
        this.baseUrl = 'https://api.themoviedb.org/3';
        this.requestCount = 0;
        this.lastRequestTime = 0;
        this.RATE_LIMIT_DELAY = 250; // 4 requests per second
        // CRITICAL: Western-only languages - NO Asian languages per requirements
        this.WESTERN_LANGUAGES = ['en', 'es', 'fr', 'it', 'de', 'pt'];
        this.apiKey = apiKey || process.env.TMDB_API_KEY || '';
        if (!this.apiKey) {
            console.warn('⚠️ TMDB_API_KEY not found in environment variables');
        }
    }
    /**
     * Validates media type - CRITICAL for endpoint enforcement
     */
    validateMediaType(mediaType) {
        if (!mediaType || (mediaType !== 'MOVIE' && mediaType !== 'TV')) {
            throw new Error(`Invalid mediaType: ${mediaType}. Must be 'MOVIE' or 'TV'`);
        }
    }
    /**
     * Maps genre IDs from Movie to TV format when needed
     */
    mapGenreIds(genreIds, targetMediaType) {
        if (targetMediaType === 'MOVIE') {
            return genreIds;
        }
        return genreIds.map(genreId => {
            const mappedId = exports.GENRE_MAPPING[genreId];
            if (mappedId !== undefined) {
                console.log(`🔄 Genre mapping: Movie genre ${genreId} → TV genre ${mappedId}`);
                return mappedId;
            }
            return genreId;
        });
    }
    /**
     * Selects the correct TMDB endpoint based on media type
     */
    selectEndpoint(mediaType) {
        this.validateMediaType(mediaType);
        let endpoint;
        if (mediaType === 'MOVIE') {
            endpoint = '/discover/movie';
            console.log(`🎬 ENFORCED: Movie endpoint selected for mediaType: ${mediaType}`);
        }
        else if (mediaType === 'TV') {
            endpoint = '/discover/tv';
            console.log(`📺 ENFORCED: TV endpoint selected for mediaType: ${mediaType}`);
        }
        else {
            throw new Error(`CRITICAL ERROR: Invalid mediaType ${mediaType} - must be MOVIE or TV`);
        }
        console.log(`🎯 ENDPOINT ENFORCEMENT: ${endpoint} for mediaType: ${mediaType}`);
        return endpoint;
    }
    /**
     * Discovers content with strict business logic enforcement
     */
    async discoverContent(params) {
        this.validateMediaType(params.mediaType);
        const endpoint = this.selectEndpoint(params.mediaType);
        console.log(`🔍 BUSINESS LOGIC: Discovering ${params.mediaType} content with ABSOLUTE ENDPOINT ENFORCEMENT`, {
            endpoint,
            withGenres: params.withGenres,
            sortBy: params.sortBy,
            excludeCount: params.excludeIds?.length || 0
        });
        try {
            await this.enforceRateLimit();
            let processedGenres = params.withGenres;
            if (params.withGenres && params.mediaType === 'TV') {
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
                include_adult: 'false',
                'vote_count.gte': '50',
                // CRITICAL: Western-only languages - NO Asian languages per requirements
                'with_original_language': this.WESTERN_LANGUAGES.join('|')
            });
            if (params.mediaType === 'TV') {
                queryParams.append('with_status', '0|2|3|4|5');
                queryParams.append('with_type', '0|1|2|3|4|5');
                queryParams.append('first_air_date.gte', '1990-01-01');
                console.log(`📺 TV-SPECIFIC FILTERS: status filtering, date filtering, western languages only`);
            }
            else if (params.mediaType === 'MOVIE') {
                queryParams.append('release_date.gte', '1990-01-01');
                queryParams.append('with_runtime.gte', '60');
                console.log(`🎬 MOVIE-SPECIFIC FILTERS: date filtering, runtime filtering, western languages only`);
            }
            if (processedGenres) {
                queryParams.append('with_genres', processedGenres);
                console.log(`🎭 BUSINESS LOGIC: Using genres for ${params.mediaType}: ${processedGenres}`);
            }
            const url = `${this.baseUrl}${endpoint}?${queryParams}`;
            console.log(`🌐 BUSINESS LOGIC: Making ABSOLUTE request to ${endpoint} for ${params.mediaType}`);
            console.log(`🚨 TMDB_URL_GENERATED: ${url}`);
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
            let results = data.results || [];
            console.log(`📊 TMDB: Raw response contains ${results.length} items for ${params.mediaType}`);
            // CRITICAL: Endpoint consistency validation
            results = results.filter(item => {
                if (params.mediaType === 'MOVIE') {
                    const isValidMovie = !!(item.title && item.release_date && !item.name && !item.first_air_date);
                    if (!isValidMovie) {
                        console.warn(`❌ BUSINESS LOGIC VIOLATION: Movie endpoint returned non-movie item ${item.id}`, {
                            hasTitle: !!item.title,
                            hasName: !!item.name,
                            hasReleaseDate: !!item.release_date,
                            hasFirstAirDate: !!item.first_air_date
                        });
                        return false;
                    }
                }
                else if (params.mediaType === 'TV') {
                    const isValidTV = !!(item.name && item.first_air_date && !item.title && !item.release_date);
                    if (!isValidTV) {
                        console.warn(`❌ BUSINESS LOGIC VIOLATION: TV endpoint returned non-TV item ${item.id}`, {
                            hasTitle: !!item.title,
                            hasName: !!item.name,
                            hasReleaseDate: !!item.release_date,
                            hasFirstAirDate: !!item.first_air_date
                        });
                        return false;
                    }
                }
                return true;
            });
            console.log(`🔒 BUSINESS LOGIC ENFORCEMENT: ${results.length} items passed endpoint consistency check`);
            // Apply exclusion filter
            if (params.excludeIds && params.excludeIds.length > 0) {
                const excludeSet = new Set(params.excludeIds);
                const beforeExclude = results.length;
                results = results.filter(item => !excludeSet.has(item.id.toString()));
                console.log(`🚫 EXCLUSION FILTER: Removed ${beforeExclude - results.length} excluded items`);
            }
            // Apply business logic validation
            const beforeValidation = results.length;
            results = results.filter(item => this.validateContentFieldsBusinessLogic(item, params.mediaType));
            const afterValidation = results.length;
            console.log(`🔍 BUSINESS LOGIC QUALITY GATE: ${afterValidation}/${beforeValidation} items passed ZERO TOLERANCE validation (rejected ${beforeValidation - afterValidation} corrupted items)`);
            if (results.length === 0 && params.withGenres) {
                console.warn(`⚠️ No valid results found for ${params.mediaType} with genres: ${processedGenres}`);
                console.warn(`💡 Original genres: ${params.withGenres}`);
                console.warn(`🔍 This may indicate genre mapping issues or overly strict validation`);
            }
            return results;
        }
        catch (error) {
            console.error(`❌ BUSINESS LOGIC: Error discovering ${params.mediaType} content:`, error);
            if (error instanceof Error && error.message.includes('rate limit')) {
                console.log('⏳ TMDB: Rate limit hit, implementing backoff...');
                await this.exponentialBackoff();
                return this.discoverContent(params);
            }
            throw error;
        }
    }
    /**
     * Validates content fields with zero tolerance business logic
     */
    validateContentFieldsBusinessLogic(item, expectedMediaType) {
        if (!item || typeof item !== 'object' || !item.id) {
            console.warn(`❌ BUSINESS LOGIC REJECTED: Invalid item structure`);
            return false;
        }
        let hasCorrectTitle = false;
        let hasCorrectDate = false;
        let title = '';
        if (expectedMediaType === 'MOVIE') {
            hasCorrectTitle = !!(item.title && typeof item.title === 'string' && item.title.trim().length > 0);
            hasCorrectDate = !!(item.release_date && typeof item.release_date === 'string' && item.release_date.trim().length > 0);
            title = item.title || '';
            if (item.name || item.first_air_date) {
                console.warn(`❌ BUSINESS LOGIC REJECTED: Movie request but item ${item.id} has TV fields (name: ${item.name}, first_air_date: ${item.first_air_date})`);
                return false;
            }
        }
        else if (expectedMediaType === 'TV') {
            hasCorrectTitle = !!(item.name && typeof item.name === 'string' && item.name.trim().length > 0);
            hasCorrectDate = !!(item.first_air_date && typeof item.first_air_date === 'string' && item.first_air_date.trim().length > 0);
            title = item.name || '';
            if (item.title || item.release_date) {
                console.warn(`❌ BUSINESS LOGIC REJECTED: TV request but item ${item.id} has Movie fields (title: ${item.title}, release_date: ${item.release_date})`);
                return false;
            }
        }
        if (!hasCorrectTitle) {
            console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} missing or empty title for ${expectedMediaType}`);
            return false;
        }
        if (!hasCorrectDate) {
            console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} missing or invalid release date for ${expectedMediaType}`);
            return false;
        }
        if (!item.overview || typeof item.overview !== 'string' || item.overview.trim().length <= 20) {
            console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} has invalid overview (length: ${item.overview?.length || 0})`);
            return false;
        }
        if (item.overview.toLowerCase().includes('descripción no disponible')) {
            console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} has placeholder description: "${item.overview}"`);
            return false;
        }
        if (!item.poster_path || typeof item.poster_path !== 'string' || item.poster_path.trim().length === 0) {
            console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} has no poster path - REQUIRED`);
            return false;
        }
        // CRITICAL: Western-only language validation - NO Asian languages per requirements
        if (!item.original_language || !this.WESTERN_LANGUAGES.includes(item.original_language)) {
            console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} has non-western language: ${item.original_language}`);
            return false;
        }
        if (!item.genre_ids || !Array.isArray(item.genre_ids) || item.genre_ids.length === 0) {
            console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} has no genres`);
            return false;
        }
        if (typeof item.vote_average !== 'number' || item.vote_average < 0) {
            console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} has invalid vote_average: ${item.vote_average}`);
            return false;
        }
        if (item.adult === true) {
            console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} is adult content`);
            return false;
        }
        console.log(`✅ BUSINESS LOGIC ACCEPTED: Valid ${expectedMediaType} item "${title}" (ID: ${item.id}, Lang: ${item.original_language})`);
        return true;
    }
    /**
     * Gets available genres for a media type
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
     * Parses genre string (comma or pipe separated)
     */
    parseGenreString(genreString) {
        const separator = genreString.includes('|') ? '|' : ',';
        return genreString.split(separator)
            .map(id => parseInt(id.trim(), 10))
            .filter(id => !isNaN(id));
    }
    /**
     * Enforces rate limiting
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
     * Implements exponential backoff for rate limiting
     */
    async exponentialBackoff() {
        const delay = Math.min(1000 * Math.pow(2, this.requestCount % 5), 30000);
        console.log(`⏳ TMDB: Exponential backoff - waiting ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    /**
     * Gets the genre mapping configuration
     */
    getGenreMapping() {
        return { ...exports.GENRE_MAPPING };
    }
    /**
     * Maps a single genre ID from Movie to TV format
     */
    mapSingleGenreId(movieGenreId) {
        return exports.GENRE_MAPPING[movieGenreId] || movieGenreId;
    }
    /**
     * Gets the western languages list
     */
    getWesternLanguages() {
        return [...this.WESTERN_LANGUAGES];
    }
}
exports.EnhancedTMDBClient = EnhancedTMDBClient;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5oYW5jZWQtdG1kYi1jbGllbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbmhhbmNlZC10bWRiLWNsaWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7O0dBV0c7Ozs7OztBQUVILDREQUErQjtBQUUvQjs7O0dBR0c7QUFDVSxRQUFBLGFBQWEsR0FBRztJQUMzQixzREFBc0Q7SUFDdEQsRUFBRSxFQUFFLEtBQUs7SUFDVCwwREFBMEQ7SUFDMUQsRUFBRSxFQUFFLEtBQUs7SUFDVCxtREFBbUQ7SUFDbkQsRUFBRSxFQUFFLEVBQUU7SUFDTixrREFBa0Q7SUFDbEQsS0FBSyxFQUFFLEtBQUs7Q0FDSixDQUFDO0FBZ0NYLE1BQWEsa0JBQWtCO0lBVTdCLFlBQVksTUFBZTtRQVJWLFlBQU8sR0FBRyw4QkFBOEIsQ0FBQztRQUNsRCxpQkFBWSxHQUFHLENBQUMsQ0FBQztRQUNqQixvQkFBZSxHQUFHLENBQUMsQ0FBQztRQUNYLHFCQUFnQixHQUFHLEdBQUcsQ0FBQyxDQUFDLHdCQUF3QjtRQUVqRSx5RUFBeUU7UUFDeEQsc0JBQWlCLEdBQUcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBR3hFLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxJQUFJLEVBQUUsQ0FBQztRQUV2RCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pCLE9BQU8sQ0FBQyxJQUFJLENBQUMsb0RBQW9ELENBQUMsQ0FBQztRQUNyRSxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0gsaUJBQWlCLENBQUMsU0FBaUI7UUFDakMsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLFNBQVMsS0FBSyxPQUFPLElBQUksU0FBUyxLQUFLLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDaEUsTUFBTSxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsU0FBUywyQkFBMkIsQ0FBQyxDQUFDO1FBQzlFLENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxXQUFXLENBQUMsUUFBa0IsRUFBRSxlQUErQjtRQUM3RCxJQUFJLGVBQWUsS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUNoQyxPQUFPLFFBQVEsQ0FBQztRQUNsQixDQUFDO1FBRUQsT0FBTyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQzVCLE1BQU0sUUFBUSxHQUFHLHFCQUFhLENBQUMsT0FBcUMsQ0FBQyxDQUFDO1lBQ3RFLElBQUksUUFBUSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUMzQixPQUFPLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxPQUFPLGVBQWUsUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDL0UsT0FBTyxRQUFRLENBQUM7WUFDbEIsQ0FBQztZQUNELE9BQU8sT0FBTyxDQUFDO1FBQ2pCLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0gsY0FBYyxDQUFDLFNBQXlCO1FBQ3RDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVsQyxJQUFJLFFBQWdCLENBQUM7UUFDckIsSUFBSSxTQUFTLEtBQUssT0FBTyxFQUFFLENBQUM7WUFDMUIsUUFBUSxHQUFHLGlCQUFpQixDQUFDO1lBQzdCLE9BQU8sQ0FBQyxHQUFHLENBQUMsdURBQXVELFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDbEYsQ0FBQzthQUFNLElBQUksU0FBUyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQzlCLFFBQVEsR0FBRyxjQUFjLENBQUM7WUFDMUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvREFBb0QsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUMvRSxDQUFDO2FBQU0sQ0FBQztZQUNOLE1BQU0sSUFBSSxLQUFLLENBQUMscUNBQXFDLFNBQVMsd0JBQXdCLENBQUMsQ0FBQztRQUMxRixDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsUUFBUSxtQkFBbUIsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUNoRixPQUFPLFFBQVEsQ0FBQztJQUNsQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsZUFBZSxDQUFDLE1BQXdCO1FBQzVDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFekMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFdkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsTUFBTSxDQUFDLFNBQVMsNkNBQTZDLEVBQUU7WUFDM0csUUFBUTtZQUNSLFVBQVUsRUFBRSxNQUFNLENBQUMsVUFBVTtZQUM3QixNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU07WUFDckIsWUFBWSxFQUFFLE1BQU0sQ0FBQyxVQUFVLEVBQUUsTUFBTSxJQUFJLENBQUM7U0FDN0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDO1lBQ0gsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUU5QixJQUFJLGVBQWUsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDO1lBQ3hDLElBQUksTUFBTSxDQUFDLFVBQVUsSUFBSSxNQUFNLENBQUMsU0FBUyxLQUFLLElBQUksRUFBRSxDQUFDO2dCQUNuRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUMxRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3BFLGVBQWUsR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUUzQyxJQUFJLGVBQWUsS0FBSyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUM7b0JBQzFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLE1BQU0sQ0FBQyxVQUFVLE1BQU0sZUFBZSxFQUFFLENBQUMsQ0FBQztnQkFDckYsQ0FBQztZQUNILENBQUM7WUFFRCxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsQ0FBQztnQkFDdEMsT0FBTyxFQUFFLElBQUksQ0FBQyxNQUFNO2dCQUNwQixRQUFRLEVBQUUsT0FBTztnQkFDakIsT0FBTyxFQUFFLE1BQU0sQ0FBQyxNQUFNLElBQUksaUJBQWlCO2dCQUMzQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRTtnQkFDbkMsYUFBYSxFQUFFLE9BQU87Z0JBQ3RCLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLHlFQUF5RTtnQkFDekUsd0JBQXdCLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7YUFDM0QsQ0FBQyxDQUFDO1lBRUgsSUFBSSxNQUFNLENBQUMsU0FBUyxLQUFLLElBQUksRUFBRSxDQUFDO2dCQUM5QixXQUFXLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxXQUFXLENBQUMsQ0FBQztnQkFDL0MsV0FBVyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsYUFBYSxDQUFDLENBQUM7Z0JBQy9DLFdBQVcsQ0FBQyxNQUFNLENBQUMsb0JBQW9CLEVBQUUsWUFBWSxDQUFDLENBQUM7Z0JBQ3ZELE9BQU8sQ0FBQyxHQUFHLENBQUMsa0ZBQWtGLENBQUMsQ0FBQztZQUNsRyxDQUFDO2lCQUFNLElBQUksTUFBTSxDQUFDLFNBQVMsS0FBSyxPQUFPLEVBQUUsQ0FBQztnQkFDeEMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxZQUFZLENBQUMsQ0FBQztnQkFDckQsV0FBVyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDN0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzRkFBc0YsQ0FBQyxDQUFDO1lBQ3RHLENBQUM7WUFFRCxJQUFJLGVBQWUsRUFBRSxDQUFDO2dCQUNwQixXQUFXLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxlQUFlLENBQUMsQ0FBQztnQkFDbkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsTUFBTSxDQUFDLFNBQVMsS0FBSyxlQUFlLEVBQUUsQ0FBQyxDQUFDO1lBQzdGLENBQUM7WUFFRCxNQUFNLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxPQUFPLEdBQUcsUUFBUSxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQUMsaURBQWlELFFBQVEsUUFBUSxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUNqRyxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBRTdDLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSxvQkFBSyxFQUFDLEdBQUcsRUFBRTtnQkFDaEMsT0FBTyxFQUFFO29CQUNQLFFBQVEsRUFBRSxrQkFBa0I7b0JBQzVCLFlBQVksRUFBRSxxQkFBcUI7aUJBQ3BDO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDakIsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsUUFBUSxDQUFDLE1BQU0sSUFBSSxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztZQUMvRSxDQUFDO1lBRUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUE2QixDQUFDO1lBQzlELElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDO1lBRWpDLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0NBQWtDLE9BQU8sQ0FBQyxNQUFNLGNBQWMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFFOUYsNENBQTRDO1lBQzVDLE9BQU8sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUM5QixJQUFJLE1BQU0sQ0FBQyxTQUFTLEtBQUssT0FBTyxFQUFFLENBQUM7b0JBQ2pDLE1BQU0sWUFBWSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLFlBQVksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7b0JBQy9GLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQzt3QkFDbEIsT0FBTyxDQUFDLElBQUksQ0FBQyxzRUFBc0UsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFOzRCQUM1RixRQUFRLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLOzRCQUN0QixPQUFPLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJOzRCQUNwQixjQUFjLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZOzRCQUNuQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjO3lCQUN2QyxDQUFDLENBQUM7d0JBQ0gsT0FBTyxLQUFLLENBQUM7b0JBQ2YsQ0FBQztnQkFDSCxDQUFDO3FCQUFNLElBQUksTUFBTSxDQUFDLFNBQVMsS0FBSyxJQUFJLEVBQUUsQ0FBQztvQkFDckMsTUFBTSxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsY0FBYyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztvQkFDNUYsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO3dCQUNmLE9BQU8sQ0FBQyxJQUFJLENBQUMsZ0VBQWdFLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRTs0QkFDdEYsUUFBUSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSzs0QkFDdEIsT0FBTyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSTs0QkFDcEIsY0FBYyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWTs0QkFDbkMsZUFBZSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYzt5QkFDdkMsQ0FBQyxDQUFDO3dCQUNILE9BQU8sS0FBSyxDQUFDO29CQUNmLENBQUM7Z0JBQ0gsQ0FBQztnQkFDRCxPQUFPLElBQUksQ0FBQztZQUNkLENBQUMsQ0FBQyxDQUFDO1lBRUgsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsT0FBTyxDQUFDLE1BQU0sMENBQTBDLENBQUMsQ0FBQztZQUV4Ryx5QkFBeUI7WUFDekIsSUFBSSxNQUFNLENBQUMsVUFBVSxJQUFJLE1BQU0sQ0FBQyxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN0RCxNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQzlDLE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUM7Z0JBQ3JDLE9BQU8sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN0RSxPQUFPLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxhQUFhLEdBQUcsT0FBTyxDQUFDLE1BQU0saUJBQWlCLENBQUMsQ0FBQztZQUMvRixDQUFDO1lBRUQsa0NBQWtDO1lBQ2xDLE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQztZQUN4QyxPQUFPLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDbEcsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQztZQUV2QyxPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxlQUFlLElBQUksZ0JBQWdCLHFEQUFxRCxnQkFBZ0IsR0FBRyxlQUFlLG1CQUFtQixDQUFDLENBQUM7WUFFOUwsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQzlDLE9BQU8sQ0FBQyxJQUFJLENBQUMsaUNBQWlDLE1BQU0sQ0FBQyxTQUFTLGlCQUFpQixlQUFlLEVBQUUsQ0FBQyxDQUFDO2dCQUNsRyxPQUFPLENBQUMsSUFBSSxDQUFDLHVCQUF1QixNQUFNLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztnQkFDekQsT0FBTyxDQUFDLElBQUksQ0FBQyx1RUFBdUUsQ0FBQyxDQUFDO1lBQ3hGLENBQUM7WUFFRCxPQUFPLE9BQU8sQ0FBQztRQUVqQixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsdUNBQXVDLE1BQU0sQ0FBQyxTQUFTLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUV6RixJQUFJLEtBQUssWUFBWSxLQUFLLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztnQkFDbkUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDO2dCQUMvRCxNQUFNLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO2dCQUNoQyxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdEMsQ0FBQztZQUVELE1BQU0sS0FBSyxDQUFDO1FBQ2QsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILGtDQUFrQyxDQUFDLElBQWMsRUFBRSxpQkFBaUM7UUFDbEYsSUFBSSxDQUFDLElBQUksSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDbEQsT0FBTyxDQUFDLElBQUksQ0FBQyxtREFBbUQsQ0FBQyxDQUFDO1lBQ2xFLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUVELElBQUksZUFBZSxHQUFHLEtBQUssQ0FBQztRQUM1QixJQUFJLGNBQWMsR0FBRyxLQUFLLENBQUM7UUFDM0IsSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBRWYsSUFBSSxpQkFBaUIsS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUNsQyxlQUFlLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUssUUFBUSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ25HLGNBQWMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLE9BQU8sSUFBSSxDQUFDLFlBQVksS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDdkgsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO1lBRXpCLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQ3JDLE9BQU8sQ0FBQyxJQUFJLENBQUMscURBQXFELElBQUksQ0FBQyxFQUFFLHlCQUF5QixJQUFJLENBQUMsSUFBSSxxQkFBcUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxDQUFDLENBQUM7Z0JBQ3hKLE9BQU8sS0FBSyxDQUFDO1lBQ2YsQ0FBQztRQUNILENBQUM7YUFBTSxJQUFJLGlCQUFpQixLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3RDLGVBQWUsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLE9BQU8sSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDaEcsY0FBYyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLElBQUksT0FBTyxJQUFJLENBQUMsY0FBYyxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUM3SCxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7WUFFeEIsSUFBSSxJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDcEMsT0FBTyxDQUFDLElBQUksQ0FBQyxrREFBa0QsSUFBSSxDQUFDLEVBQUUsNkJBQTZCLElBQUksQ0FBQyxLQUFLLG1CQUFtQixJQUFJLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQztnQkFDdEosT0FBTyxLQUFLLENBQUM7WUFDZixDQUFDO1FBQ0gsQ0FBQztRQUVELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUNyQixPQUFPLENBQUMsSUFBSSxDQUFDLG1DQUFtQyxJQUFJLENBQUMsRUFBRSwrQkFBK0IsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1lBQzNHLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUVELElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNwQixPQUFPLENBQUMsSUFBSSxDQUFDLG1DQUFtQyxJQUFJLENBQUMsRUFBRSx3Q0FBd0MsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1lBQ3BILE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLE9BQU8sSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLElBQUksRUFBRSxFQUFFLENBQUM7WUFDN0YsT0FBTyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsSUFBSSxDQUFDLEVBQUUsa0NBQWtDLElBQUksQ0FBQyxRQUFRLEVBQUUsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDeEgsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxFQUFFLENBQUM7WUFDdEUsT0FBTyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsSUFBSSxDQUFDLEVBQUUsa0NBQWtDLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO1lBQzNHLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJLE9BQU8sSUFBSSxDQUFDLFdBQVcsS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDdEcsT0FBTyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsSUFBSSxDQUFDLEVBQUUsZ0NBQWdDLENBQUMsQ0FBQztZQUN6RixPQUFPLEtBQUssQ0FBQztRQUNmLENBQUM7UUFFRCxtRkFBbUY7UUFDbkYsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQztZQUN4RixPQUFPLENBQUMsSUFBSSxDQUFDLG1DQUFtQyxJQUFJLENBQUMsRUFBRSw4QkFBOEIsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQztZQUMvRyxPQUFPLEtBQUssQ0FBQztRQUNmLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3JGLE9BQU8sQ0FBQyxJQUFJLENBQUMsbUNBQW1DLElBQUksQ0FBQyxFQUFFLGdCQUFnQixDQUFDLENBQUM7WUFDekUsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDO1FBRUQsSUFBSSxPQUFPLElBQUksQ0FBQyxZQUFZLEtBQUssUUFBUSxJQUFJLElBQUksQ0FBQyxZQUFZLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDbkUsT0FBTyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsSUFBSSxDQUFDLEVBQUUsOEJBQThCLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1lBQzFHLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUN4QixPQUFPLENBQUMsSUFBSSxDQUFDLG1DQUFtQyxJQUFJLENBQUMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1lBQzVFLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsb0NBQW9DLGlCQUFpQixVQUFVLEtBQUssVUFBVSxJQUFJLENBQUMsRUFBRSxXQUFXLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLENBQUM7UUFDdkksT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsU0FBUyxDQUFDLFNBQXlCO1FBQ3ZDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVsQyxNQUFNLFFBQVEsR0FBRyxTQUFTLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUM7UUFFaEYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsU0FBUyxTQUFTLENBQUMsQ0FBQztRQUVwRCxJQUFJLENBQUM7WUFDSCxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBRTlCLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxDQUFDO2dCQUN0QyxPQUFPLEVBQUUsSUFBSSxDQUFDLE1BQU07Z0JBQ3BCLFFBQVEsRUFBRSxPQUFPO2FBQ2xCLENBQUMsQ0FBQztZQUVILE1BQU0sR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLE9BQU8sR0FBRyxRQUFRLElBQUksV0FBVyxFQUFFLENBQUM7WUFFeEQsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLG9CQUFLLEVBQUMsR0FBRyxFQUFFO2dCQUNoQyxPQUFPLEVBQUU7b0JBQ1AsUUFBUSxFQUFFLGtCQUFrQjtvQkFDNUIsWUFBWSxFQUFFLHFCQUFxQjtpQkFDcEM7YUFDRixDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUNqQixNQUFNLElBQUksS0FBSyxDQUFDLG1CQUFtQixRQUFRLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1lBQy9FLENBQUM7WUFFRCxNQUFNLElBQUksR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQTZCLENBQUM7WUFDOUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sSUFBSSxFQUFFLENBQUM7WUFFakMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsTUFBTSxDQUFDLE1BQU0sSUFBSSxTQUFTLFNBQVMsQ0FBQyxDQUFDO1lBQ3RFLE9BQU8sTUFBTSxDQUFDO1FBRWhCLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsU0FBUyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDbkUsTUFBTSxLQUFLLENBQUM7UUFDZCxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0gsZ0JBQWdCLENBQUMsV0FBbUI7UUFDbEMsTUFBTSxTQUFTLEdBQUcsV0FBVyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7UUFDeEQsT0FBTyxXQUFXLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQzthQUNoQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2FBQ2xDLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDOUIsQ0FBQztJQUVEOztPQUVHO0lBQ0ssS0FBSyxDQUFDLGdCQUFnQjtRQUM1QixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDdkIsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQztRQUV4RCxJQUFJLG9CQUFvQixHQUFHLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ2pELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxvQkFBb0IsQ0FBQztZQUMzRCxPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxLQUFLLElBQUksQ0FBQyxDQUFDO1lBQzFELE1BQU0sSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDM0QsQ0FBQztRQUVELElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRUQ7O09BRUc7SUFDSyxLQUFLLENBQUMsa0JBQWtCO1FBQzlCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxZQUFZLEdBQUcsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDekUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5Q0FBeUMsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUNoRSxNQUFNLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRDs7T0FFRztJQUNILGVBQWU7UUFDYixPQUFPLEVBQUUsR0FBRyxxQkFBYSxFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsZ0JBQWdCLENBQUMsWUFBb0I7UUFDbkMsT0FBTyxxQkFBYSxDQUFDLFlBQTBDLENBQUMsSUFBSSxZQUFZLENBQUM7SUFDbkYsQ0FBQztJQUVEOztPQUVHO0lBQ0gsbUJBQW1CO1FBQ2pCLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ3JDLENBQUM7Q0FDRjtBQXRZRCxnREFzWUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogRW5oYW5jZWQgVE1EQiBDbGllbnQgLSBFeHRyYWN0ZWQgZnJvbSBNT05PTElUSCBmaWxlc1xyXG4gKiBcclxuICogQ1JJVElDQUwgQlVTSU5FU1MgTE9HSUM6XHJcbiAqIC0gV2VzdGVybi1vbmx5IGxhbmd1YWdlIGZpbHRlcmluZyAoZW4sZXMsZnIsaXQsZGUscHQpIC0gTk8gQXNpYW4gbGFuZ3VhZ2VzIHBlciByZXF1aXJlbWVudHNcclxuICogLSBHZW5yZSBtYXBwaW5nIGJldHdlZW4gTW92aWUgYW5kIFRWIGVuZHBvaW50c1xyXG4gKiAtIFN0cmljdCBlbmRwb2ludCBlbmZvcmNlbWVudCAoTW92aWUgdnMgVFYpXHJcbiAqIC0gQnVzaW5lc3MgbG9naWMgdmFsaWRhdGlvbiB3aXRoIHplcm8gdG9sZXJhbmNlXHJcbiAqIC0gUmF0ZSBsaW1pdGluZyBhbmQgZXJyb3IgaGFuZGxpbmdcclxuICogXHJcbiAqIFJlcXVpcmVtZW50czogMS40LCAzLjEsIDMuNVxyXG4gKi9cclxuXHJcbmltcG9ydCBmZXRjaCBmcm9tICdub2RlLWZldGNoJztcclxuXHJcbi8qKlxyXG4gKiBDUklUSUNBTDogR2VucmUgSUQgbWFwcGluZyBiZXR3ZWVuIE1vdmllcyBhbmQgVFZcclxuICogU29tZSBnZW5yZXMgaGF2ZSBkaWZmZXJlbnQgSURzIGJldHdlZW4gbW92aWUgYW5kIFRWIGVuZHBvaW50c1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IEdFTlJFX01BUFBJTkcgPSB7XHJcbiAgLy8gQWN0aW9uIChNb3ZpZTogMjgpIOKGkiBBY3Rpb24gJiBBZHZlbnR1cmUgKFRWOiAxMDc1OSlcclxuICAyODogMTA3NTksXHJcbiAgLy8gQWR2ZW50dXJlIChNb3ZpZTogMTIpIOKGkiBBY3Rpb24gJiBBZHZlbnR1cmUgKFRWOiAxMDc1OSkgXHJcbiAgMTI6IDEwNzU5LFxyXG4gIC8vIFdlc3Rlcm4gKE1vdmllOiAzNykg4oaSIFdlc3Rlcm4gKFRWOiAzNykgLSBTYW1lIElEXHJcbiAgMzc6IDM3LFxyXG4gIC8vIFdhciAoTW92aWU6IDEwNzUyKSDihpIgV2FyICYgUG9saXRpY3MgKFRWOiAxMDc2OClcclxuICAxMDc1MjogMTA3NjhcclxufSBhcyBjb25zdDtcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgVE1EQlNlYXJjaFBhcmFtcyB7XHJcbiAgbWVkaWFUeXBlOiAnTU9WSUUnIHwgJ1RWJztcclxuICB3aXRoR2VucmVzPzogc3RyaW5nO1xyXG4gIHNvcnRCeT86IHN0cmluZztcclxuICBwYWdlPzogbnVtYmVyO1xyXG4gIGV4Y2x1ZGVJZHM/OiBzdHJpbmdbXTtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUTURCSXRlbSB7XHJcbiAgaWQ6IG51bWJlcjtcclxuICB0aXRsZT86IHN0cmluZztcclxuICBuYW1lPzogc3RyaW5nO1xyXG4gIHJlbGVhc2VfZGF0ZT86IHN0cmluZztcclxuICBmaXJzdF9haXJfZGF0ZT86IHN0cmluZztcclxuICBvdmVydmlldzogc3RyaW5nO1xyXG4gIHBvc3Rlcl9wYXRoOiBzdHJpbmc7XHJcbiAgZ2VucmVfaWRzOiBudW1iZXJbXTtcclxuICB2b3RlX2F2ZXJhZ2U6IG51bWJlcjtcclxuICB2b3RlX2NvdW50OiBudW1iZXI7XHJcbiAgcG9wdWxhcml0eTogbnVtYmVyO1xyXG4gIG9yaWdpbmFsX2xhbmd1YWdlOiBzdHJpbmc7XHJcbiAgYWR1bHQ6IGJvb2xlYW47XHJcbiAgbWVkaWFfdHlwZT86IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUTURCR2VucmUge1xyXG4gIGlkOiBudW1iZXI7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRW5oYW5jZWRUTURCQ2xpZW50IHtcclxuICBwcml2YXRlIHJlYWRvbmx5IGFwaUtleTogc3RyaW5nO1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgYmFzZVVybCA9ICdodHRwczovL2FwaS50aGVtb3ZpZWRiLm9yZy8zJztcclxuICBwcml2YXRlIHJlcXVlc3RDb3VudCA9IDA7XHJcbiAgcHJpdmF0ZSBsYXN0UmVxdWVzdFRpbWUgPSAwO1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgUkFURV9MSU1JVF9ERUxBWSA9IDI1MDsgLy8gNCByZXF1ZXN0cyBwZXIgc2Vjb25kXHJcbiAgXHJcbiAgLy8gQ1JJVElDQUw6IFdlc3Rlcm4tb25seSBsYW5ndWFnZXMgLSBOTyBBc2lhbiBsYW5ndWFnZXMgcGVyIHJlcXVpcmVtZW50c1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgV0VTVEVSTl9MQU5HVUFHRVMgPSBbJ2VuJywgJ2VzJywgJ2ZyJywgJ2l0JywgJ2RlJywgJ3B0J107XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwaUtleT86IHN0cmluZykge1xyXG4gICAgdGhpcy5hcGlLZXkgPSBhcGlLZXkgfHwgcHJvY2Vzcy5lbnYuVE1EQl9BUElfS0VZIHx8ICcnO1xyXG4gICAgXHJcbiAgICBpZiAoIXRoaXMuYXBpS2V5KSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPIFRNREJfQVBJX0tFWSBub3QgZm91bmQgaW4gZW52aXJvbm1lbnQgdmFyaWFibGVzJyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZXMgbWVkaWEgdHlwZSAtIENSSVRJQ0FMIGZvciBlbmRwb2ludCBlbmZvcmNlbWVudFxyXG4gICAqL1xyXG4gIHZhbGlkYXRlTWVkaWFUeXBlKG1lZGlhVHlwZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBpZiAoIW1lZGlhVHlwZSB8fCAobWVkaWFUeXBlICE9PSAnTU9WSUUnICYmIG1lZGlhVHlwZSAhPT0gJ1RWJykpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIG1lZGlhVHlwZTogJHttZWRpYVR5cGV9LiBNdXN0IGJlICdNT1ZJRScgb3IgJ1RWJ2ApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogTWFwcyBnZW5yZSBJRHMgZnJvbSBNb3ZpZSB0byBUViBmb3JtYXQgd2hlbiBuZWVkZWRcclxuICAgKi9cclxuICBtYXBHZW5yZUlkcyhnZW5yZUlkczogbnVtYmVyW10sIHRhcmdldE1lZGlhVHlwZTogJ01PVklFJyB8ICdUVicpOiBudW1iZXJbXSB7XHJcbiAgICBpZiAodGFyZ2V0TWVkaWFUeXBlID09PSAnTU9WSUUnKSB7XHJcbiAgICAgIHJldHVybiBnZW5yZUlkcztcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZ2VucmVJZHMubWFwKGdlbnJlSWQgPT4ge1xyXG4gICAgICBjb25zdCBtYXBwZWRJZCA9IEdFTlJFX01BUFBJTkdbZ2VucmVJZCBhcyBrZXlvZiB0eXBlb2YgR0VOUkVfTUFQUElOR107XHJcbiAgICAgIGlmIChtYXBwZWRJZCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCflIQgR2VucmUgbWFwcGluZzogTW92aWUgZ2VucmUgJHtnZW5yZUlkfSDihpIgVFYgZ2VucmUgJHttYXBwZWRJZH1gKTtcclxuICAgICAgICByZXR1cm4gbWFwcGVkSWQ7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIGdlbnJlSWQ7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFNlbGVjdHMgdGhlIGNvcnJlY3QgVE1EQiBlbmRwb2ludCBiYXNlZCBvbiBtZWRpYSB0eXBlXHJcbiAgICovXHJcbiAgc2VsZWN0RW5kcG9pbnQobWVkaWFUeXBlOiAnTU9WSUUnIHwgJ1RWJyk6IHN0cmluZyB7XHJcbiAgICB0aGlzLnZhbGlkYXRlTWVkaWFUeXBlKG1lZGlhVHlwZSk7XHJcbiAgICBcclxuICAgIGxldCBlbmRwb2ludDogc3RyaW5nO1xyXG4gICAgaWYgKG1lZGlhVHlwZSA9PT0gJ01PVklFJykge1xyXG4gICAgICBlbmRwb2ludCA9ICcvZGlzY292ZXIvbW92aWUnO1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+OrCBFTkZPUkNFRDogTW92aWUgZW5kcG9pbnQgc2VsZWN0ZWQgZm9yIG1lZGlhVHlwZTogJHttZWRpYVR5cGV9YCk7XHJcbiAgICB9IGVsc2UgaWYgKG1lZGlhVHlwZSA9PT0gJ1RWJykge1xyXG4gICAgICBlbmRwb2ludCA9ICcvZGlzY292ZXIvdHYnO1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+TuiBFTkZPUkNFRDogVFYgZW5kcG9pbnQgc2VsZWN0ZWQgZm9yIG1lZGlhVHlwZTogJHttZWRpYVR5cGV9YCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENSSVRJQ0FMIEVSUk9SOiBJbnZhbGlkIG1lZGlhVHlwZSAke21lZGlhVHlwZX0gLSBtdXN0IGJlIE1PVklFIG9yIFRWYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGDwn46vIEVORFBPSU5UIEVORk9SQ0VNRU5UOiAke2VuZHBvaW50fSBmb3IgbWVkaWFUeXBlOiAke21lZGlhVHlwZX1gKTtcclxuICAgIHJldHVybiBlbmRwb2ludDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIERpc2NvdmVycyBjb250ZW50IHdpdGggc3RyaWN0IGJ1c2luZXNzIGxvZ2ljIGVuZm9yY2VtZW50XHJcbiAgICovXHJcbiAgYXN5bmMgZGlzY292ZXJDb250ZW50KHBhcmFtczogVE1EQlNlYXJjaFBhcmFtcyk6IFByb21pc2U8VE1EQkl0ZW1bXT4ge1xyXG4gICAgdGhpcy52YWxpZGF0ZU1lZGlhVHlwZShwYXJhbXMubWVkaWFUeXBlKTtcclxuICAgIFxyXG4gICAgY29uc3QgZW5kcG9pbnQgPSB0aGlzLnNlbGVjdEVuZHBvaW50KHBhcmFtcy5tZWRpYVR5cGUpO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhg8J+UjSBCVVNJTkVTUyBMT0dJQzogRGlzY292ZXJpbmcgJHtwYXJhbXMubWVkaWFUeXBlfSBjb250ZW50IHdpdGggQUJTT0xVVEUgRU5EUE9JTlQgRU5GT1JDRU1FTlRgLCB7XHJcbiAgICAgIGVuZHBvaW50LFxyXG4gICAgICB3aXRoR2VucmVzOiBwYXJhbXMud2l0aEdlbnJlcyxcclxuICAgICAgc29ydEJ5OiBwYXJhbXMuc29ydEJ5LFxyXG4gICAgICBleGNsdWRlQ291bnQ6IHBhcmFtcy5leGNsdWRlSWRzPy5sZW5ndGggfHwgMFxyXG4gICAgfSk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5lbmZvcmNlUmF0ZUxpbWl0KCk7XHJcblxyXG4gICAgICBsZXQgcHJvY2Vzc2VkR2VucmVzID0gcGFyYW1zLndpdGhHZW5yZXM7XHJcbiAgICAgIGlmIChwYXJhbXMud2l0aEdlbnJlcyAmJiBwYXJhbXMubWVkaWFUeXBlID09PSAnVFYnKSB7XHJcbiAgICAgICAgY29uc3QgZ2VucmVJZHMgPSB0aGlzLnBhcnNlR2VucmVTdHJpbmcocGFyYW1zLndpdGhHZW5yZXMpO1xyXG4gICAgICAgIGNvbnN0IG1hcHBlZEdlbnJlSWRzID0gdGhpcy5tYXBHZW5yZUlkcyhnZW5yZUlkcywgcGFyYW1zLm1lZGlhVHlwZSk7XHJcbiAgICAgICAgcHJvY2Vzc2VkR2VucmVzID0gbWFwcGVkR2VucmVJZHMuam9pbignLCcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwcm9jZXNzZWRHZW5yZXMgIT09IHBhcmFtcy53aXRoR2VucmVzKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBHZW5yZSBtYXBwaW5nIGFwcGxpZWQ6ICR7cGFyYW1zLndpdGhHZW5yZXN9IOKGkiAke3Byb2Nlc3NlZEdlbnJlc31gKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IHF1ZXJ5UGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh7XHJcbiAgICAgICAgYXBpX2tleTogdGhpcy5hcGlLZXksXHJcbiAgICAgICAgbGFuZ3VhZ2U6ICdlcy1FUycsXHJcbiAgICAgICAgc29ydF9ieTogcGFyYW1zLnNvcnRCeSB8fCAncG9wdWxhcml0eS5kZXNjJyxcclxuICAgICAgICBwYWdlOiAocGFyYW1zLnBhZ2UgfHwgMSkudG9TdHJpbmcoKSxcclxuICAgICAgICBpbmNsdWRlX2FkdWx0OiAnZmFsc2UnLFxyXG4gICAgICAgICd2b3RlX2NvdW50Lmd0ZSc6ICc1MCcsXHJcbiAgICAgICAgLy8gQ1JJVElDQUw6IFdlc3Rlcm4tb25seSBsYW5ndWFnZXMgLSBOTyBBc2lhbiBsYW5ndWFnZXMgcGVyIHJlcXVpcmVtZW50c1xyXG4gICAgICAgICd3aXRoX29yaWdpbmFsX2xhbmd1YWdlJzogdGhpcy5XRVNURVJOX0xBTkdVQUdFUy5qb2luKCd8JylcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBpZiAocGFyYW1zLm1lZGlhVHlwZSA9PT0gJ1RWJykge1xyXG4gICAgICAgIHF1ZXJ5UGFyYW1zLmFwcGVuZCgnd2l0aF9zdGF0dXMnLCAnMHwyfDN8NHw1Jyk7XHJcbiAgICAgICAgcXVlcnlQYXJhbXMuYXBwZW5kKCd3aXRoX3R5cGUnLCAnMHwxfDJ8M3w0fDUnKTtcclxuICAgICAgICBxdWVyeVBhcmFtcy5hcHBlbmQoJ2ZpcnN0X2Fpcl9kYXRlLmd0ZScsICcxOTkwLTAxLTAxJyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfk7ogVFYtU1BFQ0lGSUMgRklMVEVSUzogc3RhdHVzIGZpbHRlcmluZywgZGF0ZSBmaWx0ZXJpbmcsIHdlc3Rlcm4gbGFuZ3VhZ2VzIG9ubHlgKTtcclxuICAgICAgfSBlbHNlIGlmIChwYXJhbXMubWVkaWFUeXBlID09PSAnTU9WSUUnKSB7XHJcbiAgICAgICAgcXVlcnlQYXJhbXMuYXBwZW5kKCdyZWxlYXNlX2RhdGUuZ3RlJywgJzE5OTAtMDEtMDEnKTtcclxuICAgICAgICBxdWVyeVBhcmFtcy5hcHBlbmQoJ3dpdGhfcnVudGltZS5ndGUnLCAnNjAnKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+OrCBNT1ZJRS1TUEVDSUZJQyBGSUxURVJTOiBkYXRlIGZpbHRlcmluZywgcnVudGltZSBmaWx0ZXJpbmcsIHdlc3Rlcm4gbGFuZ3VhZ2VzIG9ubHlgKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHByb2Nlc3NlZEdlbnJlcykge1xyXG4gICAgICAgIHF1ZXJ5UGFyYW1zLmFwcGVuZCgnd2l0aF9nZW5yZXMnLCBwcm9jZXNzZWRHZW5yZXMpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn46tIEJVU0lORVNTIExPR0lDOiBVc2luZyBnZW5yZXMgZm9yICR7cGFyYW1zLm1lZGlhVHlwZX06ICR7cHJvY2Vzc2VkR2VucmVzfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCB1cmwgPSBgJHt0aGlzLmJhc2VVcmx9JHtlbmRwb2ludH0/JHtxdWVyeVBhcmFtc31gO1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+MkCBCVVNJTkVTUyBMT0dJQzogTWFraW5nIEFCU09MVVRFIHJlcXVlc3QgdG8gJHtlbmRwb2ludH0gZm9yICR7cGFyYW1zLm1lZGlhVHlwZX1gKTtcclxuICAgICAgY29uc29sZS5sb2coYPCfmqggVE1EQl9VUkxfR0VORVJBVEVEOiAke3VybH1gKTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XHJcbiAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAgICdVc2VyLUFnZW50JzogJ1RyaW5pdHktQmFja2VuZC8xLjAnXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRNREIgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIHsgcmVzdWx0czogVE1EQkl0ZW1bXSB9O1xyXG4gICAgICBsZXQgcmVzdWx0cyA9IGRhdGEucmVzdWx0cyB8fCBbXTtcclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OKIFRNREI6IFJhdyByZXNwb25zZSBjb250YWlucyAke3Jlc3VsdHMubGVuZ3RofSBpdGVtcyBmb3IgJHtwYXJhbXMubWVkaWFUeXBlfWApO1xyXG5cclxuICAgICAgLy8gQ1JJVElDQUw6IEVuZHBvaW50IGNvbnNpc3RlbmN5IHZhbGlkYXRpb25cclxuICAgICAgcmVzdWx0cyA9IHJlc3VsdHMuZmlsdGVyKGl0ZW0gPT4ge1xyXG4gICAgICAgIGlmIChwYXJhbXMubWVkaWFUeXBlID09PSAnTU9WSUUnKSB7XHJcbiAgICAgICAgICBjb25zdCBpc1ZhbGlkTW92aWUgPSAhIShpdGVtLnRpdGxlICYmIGl0ZW0ucmVsZWFzZV9kYXRlICYmICFpdGVtLm5hbWUgJiYgIWl0ZW0uZmlyc3RfYWlyX2RhdGUpO1xyXG4gICAgICAgICAgaWYgKCFpc1ZhbGlkTW92aWUpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGDinYwgQlVTSU5FU1MgTE9HSUMgVklPTEFUSU9OOiBNb3ZpZSBlbmRwb2ludCByZXR1cm5lZCBub24tbW92aWUgaXRlbSAke2l0ZW0uaWR9YCwge1xyXG4gICAgICAgICAgICAgIGhhc1RpdGxlOiAhIWl0ZW0udGl0bGUsXHJcbiAgICAgICAgICAgICAgaGFzTmFtZTogISFpdGVtLm5hbWUsXHJcbiAgICAgICAgICAgICAgaGFzUmVsZWFzZURhdGU6ICEhaXRlbS5yZWxlYXNlX2RhdGUsXHJcbiAgICAgICAgICAgICAgaGFzRmlyc3RBaXJEYXRlOiAhIWl0ZW0uZmlyc3RfYWlyX2RhdGVcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHBhcmFtcy5tZWRpYVR5cGUgPT09ICdUVicpIHtcclxuICAgICAgICAgIGNvbnN0IGlzVmFsaWRUViA9ICEhKGl0ZW0ubmFtZSAmJiBpdGVtLmZpcnN0X2Fpcl9kYXRlICYmICFpdGVtLnRpdGxlICYmICFpdGVtLnJlbGVhc2VfZGF0ZSk7XHJcbiAgICAgICAgICBpZiAoIWlzVmFsaWRUVikge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYOKdjCBCVVNJTkVTUyBMT0dJQyBWSU9MQVRJT046IFRWIGVuZHBvaW50IHJldHVybmVkIG5vbi1UViBpdGVtICR7aXRlbS5pZH1gLCB7XHJcbiAgICAgICAgICAgICAgaGFzVGl0bGU6ICEhaXRlbS50aXRsZSxcclxuICAgICAgICAgICAgICBoYXNOYW1lOiAhIWl0ZW0ubmFtZSxcclxuICAgICAgICAgICAgICBoYXNSZWxlYXNlRGF0ZTogISFpdGVtLnJlbGVhc2VfZGF0ZSxcclxuICAgICAgICAgICAgICBoYXNGaXJzdEFpckRhdGU6ICEhaXRlbS5maXJzdF9haXJfZGF0ZVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg8J+UkiBCVVNJTkVTUyBMT0dJQyBFTkZPUkNFTUVOVDogJHtyZXN1bHRzLmxlbmd0aH0gaXRlbXMgcGFzc2VkIGVuZHBvaW50IGNvbnNpc3RlbmN5IGNoZWNrYCk7XHJcblxyXG4gICAgICAvLyBBcHBseSBleGNsdXNpb24gZmlsdGVyXHJcbiAgICAgIGlmIChwYXJhbXMuZXhjbHVkZUlkcyAmJiBwYXJhbXMuZXhjbHVkZUlkcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgY29uc3QgZXhjbHVkZVNldCA9IG5ldyBTZXQocGFyYW1zLmV4Y2x1ZGVJZHMpO1xyXG4gICAgICAgIGNvbnN0IGJlZm9yZUV4Y2x1ZGUgPSByZXN1bHRzLmxlbmd0aDtcclxuICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIoaXRlbSA9PiAhZXhjbHVkZVNldC5oYXMoaXRlbS5pZC50b1N0cmluZygpKSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfmqsgRVhDTFVTSU9OIEZJTFRFUjogUmVtb3ZlZCAke2JlZm9yZUV4Y2x1ZGUgLSByZXN1bHRzLmxlbmd0aH0gZXhjbHVkZWQgaXRlbXNgKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gQXBwbHkgYnVzaW5lc3MgbG9naWMgdmFsaWRhdGlvblxyXG4gICAgICBjb25zdCBiZWZvcmVWYWxpZGF0aW9uID0gcmVzdWx0cy5sZW5ndGg7XHJcbiAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihpdGVtID0+IHRoaXMudmFsaWRhdGVDb250ZW50RmllbGRzQnVzaW5lc3NMb2dpYyhpdGVtLCBwYXJhbXMubWVkaWFUeXBlKSk7XHJcbiAgICAgIGNvbnN0IGFmdGVyVmFsaWRhdGlvbiA9IHJlc3VsdHMubGVuZ3RoO1xyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYPCflI0gQlVTSU5FU1MgTE9HSUMgUVVBTElUWSBHQVRFOiAke2FmdGVyVmFsaWRhdGlvbn0vJHtiZWZvcmVWYWxpZGF0aW9ufSBpdGVtcyBwYXNzZWQgWkVSTyBUT0xFUkFOQ0UgdmFsaWRhdGlvbiAocmVqZWN0ZWQgJHtiZWZvcmVWYWxpZGF0aW9uIC0gYWZ0ZXJWYWxpZGF0aW9ufSBjb3JydXB0ZWQgaXRlbXMpYCk7XHJcblxyXG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDAgJiYgcGFyYW1zLndpdGhHZW5yZXMpIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBObyB2YWxpZCByZXN1bHRzIGZvdW5kIGZvciAke3BhcmFtcy5tZWRpYVR5cGV9IHdpdGggZ2VucmVzOiAke3Byb2Nlc3NlZEdlbnJlc31gKTtcclxuICAgICAgICBjb25zb2xlLndhcm4oYPCfkqEgT3JpZ2luYWwgZ2VucmVzOiAke3BhcmFtcy53aXRoR2VucmVzfWApO1xyXG4gICAgICAgIGNvbnNvbGUud2Fybihg8J+UjSBUaGlzIG1heSBpbmRpY2F0ZSBnZW5yZSBtYXBwaW5nIGlzc3VlcyBvciBvdmVybHkgc3RyaWN0IHZhbGlkYXRpb25gKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHJlc3VsdHM7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihg4p2MIEJVU0lORVNTIExPR0lDOiBFcnJvciBkaXNjb3ZlcmluZyAke3BhcmFtcy5tZWRpYVR5cGV9IGNvbnRlbnQ6YCwgZXJyb3IpO1xyXG4gICAgICBcclxuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygncmF0ZSBsaW1pdCcpKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ+KPsyBUTURCOiBSYXRlIGxpbWl0IGhpdCwgaW1wbGVtZW50aW5nIGJhY2tvZmYuLi4nKTtcclxuICAgICAgICBhd2FpdCB0aGlzLmV4cG9uZW50aWFsQmFja29mZigpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRpc2NvdmVyQ29udGVudChwYXJhbXMpO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlcyBjb250ZW50IGZpZWxkcyB3aXRoIHplcm8gdG9sZXJhbmNlIGJ1c2luZXNzIGxvZ2ljXHJcbiAgICovXHJcbiAgdmFsaWRhdGVDb250ZW50RmllbGRzQnVzaW5lc3NMb2dpYyhpdGVtOiBUTURCSXRlbSwgZXhwZWN0ZWRNZWRpYVR5cGU6ICdNT1ZJRScgfCAnVFYnKTogYm9vbGVhbiB7XHJcbiAgICBpZiAoIWl0ZW0gfHwgdHlwZW9mIGl0ZW0gIT09ICdvYmplY3QnIHx8ICFpdGVtLmlkKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybihg4p2MIEJVU0lORVNTIExPR0lDIFJFSkVDVEVEOiBJbnZhbGlkIGl0ZW0gc3RydWN0dXJlYCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgaGFzQ29ycmVjdFRpdGxlID0gZmFsc2U7XHJcbiAgICBsZXQgaGFzQ29ycmVjdERhdGUgPSBmYWxzZTtcclxuICAgIGxldCB0aXRsZSA9ICcnO1xyXG4gICAgXHJcbiAgICBpZiAoZXhwZWN0ZWRNZWRpYVR5cGUgPT09ICdNT1ZJRScpIHtcclxuICAgICAgaGFzQ29ycmVjdFRpdGxlID0gISEoaXRlbS50aXRsZSAmJiB0eXBlb2YgaXRlbS50aXRsZSA9PT0gJ3N0cmluZycgJiYgaXRlbS50aXRsZS50cmltKCkubGVuZ3RoID4gMCk7XHJcbiAgICAgIGhhc0NvcnJlY3REYXRlID0gISEoaXRlbS5yZWxlYXNlX2RhdGUgJiYgdHlwZW9mIGl0ZW0ucmVsZWFzZV9kYXRlID09PSAnc3RyaW5nJyAmJiBpdGVtLnJlbGVhc2VfZGF0ZS50cmltKCkubGVuZ3RoID4gMCk7XHJcbiAgICAgIHRpdGxlID0gaXRlbS50aXRsZSB8fCAnJztcclxuICAgICAgXHJcbiAgICAgIGlmIChpdGVtLm5hbWUgfHwgaXRlbS5maXJzdF9haXJfZGF0ZSkge1xyXG4gICAgICAgIGNvbnNvbGUud2Fybihg4p2MIEJVU0lORVNTIExPR0lDIFJFSkVDVEVEOiBNb3ZpZSByZXF1ZXN0IGJ1dCBpdGVtICR7aXRlbS5pZH0gaGFzIFRWIGZpZWxkcyAobmFtZTogJHtpdGVtLm5hbWV9LCBmaXJzdF9haXJfZGF0ZTogJHtpdGVtLmZpcnN0X2Fpcl9kYXRlfSlgKTtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoZXhwZWN0ZWRNZWRpYVR5cGUgPT09ICdUVicpIHtcclxuICAgICAgaGFzQ29ycmVjdFRpdGxlID0gISEoaXRlbS5uYW1lICYmIHR5cGVvZiBpdGVtLm5hbWUgPT09ICdzdHJpbmcnICYmIGl0ZW0ubmFtZS50cmltKCkubGVuZ3RoID4gMCk7XHJcbiAgICAgIGhhc0NvcnJlY3REYXRlID0gISEoaXRlbS5maXJzdF9haXJfZGF0ZSAmJiB0eXBlb2YgaXRlbS5maXJzdF9haXJfZGF0ZSA9PT0gJ3N0cmluZycgJiYgaXRlbS5maXJzdF9haXJfZGF0ZS50cmltKCkubGVuZ3RoID4gMCk7XHJcbiAgICAgIHRpdGxlID0gaXRlbS5uYW1lIHx8ICcnO1xyXG4gICAgICBcclxuICAgICAgaWYgKGl0ZW0udGl0bGUgfHwgaXRlbS5yZWxlYXNlX2RhdGUpIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oYOKdjCBCVVNJTkVTUyBMT0dJQyBSRUpFQ1RFRDogVFYgcmVxdWVzdCBidXQgaXRlbSAke2l0ZW0uaWR9IGhhcyBNb3ZpZSBmaWVsZHMgKHRpdGxlOiAke2l0ZW0udGl0bGV9LCByZWxlYXNlX2RhdGU6ICR7aXRlbS5yZWxlYXNlX2RhdGV9KWApO1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICghaGFzQ29ycmVjdFRpdGxlKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybihg4p2MIEJVU0lORVNTIExPR0lDIFJFSkVDVEVEOiBJdGVtICR7aXRlbS5pZH0gbWlzc2luZyBvciBlbXB0eSB0aXRsZSBmb3IgJHtleHBlY3RlZE1lZGlhVHlwZX1gKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghaGFzQ29ycmVjdERhdGUpIHtcclxuICAgICAgY29uc29sZS53YXJuKGDinYwgQlVTSU5FU1MgTE9HSUMgUkVKRUNURUQ6IEl0ZW0gJHtpdGVtLmlkfSBtaXNzaW5nIG9yIGludmFsaWQgcmVsZWFzZSBkYXRlIGZvciAke2V4cGVjdGVkTWVkaWFUeXBlfWApO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFpdGVtLm92ZXJ2aWV3IHx8IHR5cGVvZiBpdGVtLm92ZXJ2aWV3ICE9PSAnc3RyaW5nJyB8fCBpdGVtLm92ZXJ2aWV3LnRyaW0oKS5sZW5ndGggPD0gMjApIHtcclxuICAgICAgY29uc29sZS53YXJuKGDinYwgQlVTSU5FU1MgTE9HSUMgUkVKRUNURUQ6IEl0ZW0gJHtpdGVtLmlkfSBoYXMgaW52YWxpZCBvdmVydmlldyAobGVuZ3RoOiAke2l0ZW0ub3ZlcnZpZXc/Lmxlbmd0aCB8fCAwfSlgKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChpdGVtLm92ZXJ2aWV3LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2Rlc2NyaXBjacOzbiBubyBkaXNwb25pYmxlJykpIHtcclxuICAgICAgY29uc29sZS53YXJuKGDinYwgQlVTSU5FU1MgTE9HSUMgUkVKRUNURUQ6IEl0ZW0gJHtpdGVtLmlkfSBoYXMgcGxhY2Vob2xkZXIgZGVzY3JpcHRpb246IFwiJHtpdGVtLm92ZXJ2aWV3fVwiYCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIWl0ZW0ucG9zdGVyX3BhdGggfHwgdHlwZW9mIGl0ZW0ucG9zdGVyX3BhdGggIT09ICdzdHJpbmcnIHx8IGl0ZW0ucG9zdGVyX3BhdGgudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBjb25zb2xlLndhcm4oYOKdjCBCVVNJTkVTUyBMT0dJQyBSRUpFQ1RFRDogSXRlbSAke2l0ZW0uaWR9IGhhcyBubyBwb3N0ZXIgcGF0aCAtIFJFUVVJUkVEYCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDUklUSUNBTDogV2VzdGVybi1vbmx5IGxhbmd1YWdlIHZhbGlkYXRpb24gLSBOTyBBc2lhbiBsYW5ndWFnZXMgcGVyIHJlcXVpcmVtZW50c1xyXG4gICAgaWYgKCFpdGVtLm9yaWdpbmFsX2xhbmd1YWdlIHx8ICF0aGlzLldFU1RFUk5fTEFOR1VBR0VTLmluY2x1ZGVzKGl0ZW0ub3JpZ2luYWxfbGFuZ3VhZ2UpKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybihg4p2MIEJVU0lORVNTIExPR0lDIFJFSkVDVEVEOiBJdGVtICR7aXRlbS5pZH0gaGFzIG5vbi13ZXN0ZXJuIGxhbmd1YWdlOiAke2l0ZW0ub3JpZ2luYWxfbGFuZ3VhZ2V9YCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIWl0ZW0uZ2VucmVfaWRzIHx8ICFBcnJheS5pc0FycmF5KGl0ZW0uZ2VucmVfaWRzKSB8fCBpdGVtLmdlbnJlX2lkcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgY29uc29sZS53YXJuKGDinYwgQlVTSU5FU1MgTE9HSUMgUkVKRUNURUQ6IEl0ZW0gJHtpdGVtLmlkfSBoYXMgbm8gZ2VucmVzYCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodHlwZW9mIGl0ZW0udm90ZV9hdmVyYWdlICE9PSAnbnVtYmVyJyB8fCBpdGVtLnZvdGVfYXZlcmFnZSA8IDApIHtcclxuICAgICAgY29uc29sZS53YXJuKGDinYwgQlVTSU5FU1MgTE9HSUMgUkVKRUNURUQ6IEl0ZW0gJHtpdGVtLmlkfSBoYXMgaW52YWxpZCB2b3RlX2F2ZXJhZ2U6ICR7aXRlbS52b3RlX2F2ZXJhZ2V9YCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoaXRlbS5hZHVsdCA9PT0gdHJ1ZSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oYOKdjCBCVVNJTkVTUyBMT0dJQyBSRUpFQ1RFRDogSXRlbSAke2l0ZW0uaWR9IGlzIGFkdWx0IGNvbnRlbnRgKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgQlVTSU5FU1MgTE9HSUMgQUNDRVBURUQ6IFZhbGlkICR7ZXhwZWN0ZWRNZWRpYVR5cGV9IGl0ZW0gXCIke3RpdGxlfVwiIChJRDogJHtpdGVtLmlkfSwgTGFuZzogJHtpdGVtLm9yaWdpbmFsX2xhbmd1YWdlfSlgKTtcclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0cyBhdmFpbGFibGUgZ2VucmVzIGZvciBhIG1lZGlhIHR5cGVcclxuICAgKi9cclxuICBhc3luYyBnZXRHZW5yZXMobWVkaWFUeXBlOiAnTU9WSUUnIHwgJ1RWJyk6IFByb21pc2U8VE1EQkdlbnJlW10+IHtcclxuICAgIHRoaXMudmFsaWRhdGVNZWRpYVR5cGUobWVkaWFUeXBlKTtcclxuICAgIFxyXG4gICAgY29uc3QgZW5kcG9pbnQgPSBtZWRpYVR5cGUgPT09ICdNT1ZJRScgPyAnL2dlbnJlL21vdmllL2xpc3QnIDogJy9nZW5yZS90di9saXN0JztcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYPCfjq0gVE1EQjogR2V0dGluZyAke21lZGlhVHlwZX0gZ2VucmVzYCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5lbmZvcmNlUmF0ZUxpbWl0KCk7XHJcblxyXG4gICAgICBjb25zdCBxdWVyeVBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoe1xyXG4gICAgICAgIGFwaV9rZXk6IHRoaXMuYXBpS2V5LFxyXG4gICAgICAgIGxhbmd1YWdlOiAnZXMtRVMnXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgdXJsID0gYCR7dGhpcy5iYXNlVXJsfSR7ZW5kcG9pbnR9PyR7cXVlcnlQYXJhbXN9YDtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XHJcbiAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAgICdVc2VyLUFnZW50JzogJ1RyaW5pdHktQmFja2VuZC8xLjAnXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRNREIgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIHsgZ2VucmVzOiBUTURCR2VucmVbXSB9O1xyXG4gICAgICBjb25zdCBnZW5yZXMgPSBkYXRhLmdlbnJlcyB8fCBbXTtcclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgVE1EQjogUmV0cmlldmVkICR7Z2VucmVzLmxlbmd0aH0gJHttZWRpYVR5cGV9IGdlbnJlc2ApO1xyXG4gICAgICByZXR1cm4gZ2VucmVzO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBUTURCOiBFcnJvciBnZXR0aW5nICR7bWVkaWFUeXBlfSBnZW5yZXM6YCwgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFBhcnNlcyBnZW5yZSBzdHJpbmcgKGNvbW1hIG9yIHBpcGUgc2VwYXJhdGVkKVxyXG4gICAqL1xyXG4gIHBhcnNlR2VucmVTdHJpbmcoZ2VucmVTdHJpbmc6IHN0cmluZyk6IG51bWJlcltdIHtcclxuICAgIGNvbnN0IHNlcGFyYXRvciA9IGdlbnJlU3RyaW5nLmluY2x1ZGVzKCd8JykgPyAnfCcgOiAnLCc7XHJcbiAgICByZXR1cm4gZ2VucmVTdHJpbmcuc3BsaXQoc2VwYXJhdG9yKVxyXG4gICAgICAubWFwKGlkID0+IHBhcnNlSW50KGlkLnRyaW0oKSwgMTApKVxyXG4gICAgICAuZmlsdGVyKGlkID0+ICFpc05hTihpZCkpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRW5mb3JjZXMgcmF0ZSBsaW1pdGluZ1xyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZW5mb3JjZVJhdGVMaW1pdCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XHJcbiAgICBjb25zdCB0aW1lU2luY2VMYXN0UmVxdWVzdCA9IG5vdyAtIHRoaXMubGFzdFJlcXVlc3RUaW1lO1xyXG5cclxuICAgIGlmICh0aW1lU2luY2VMYXN0UmVxdWVzdCA8IHRoaXMuUkFURV9MSU1JVF9ERUxBWSkge1xyXG4gICAgICBjb25zdCBkZWxheSA9IHRoaXMuUkFURV9MSU1JVF9ERUxBWSAtIHRpbWVTaW5jZUxhc3RSZXF1ZXN0O1xyXG4gICAgICBjb25zb2xlLmxvZyhg4o+zIFRNREI6IFJhdGUgbGltaXRpbmcgLSB3YWl0aW5nICR7ZGVsYXl9bXNgKTtcclxuICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIGRlbGF5KSk7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5sYXN0UmVxdWVzdFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgdGhpcy5yZXF1ZXN0Q291bnQrKztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEltcGxlbWVudHMgZXhwb25lbnRpYWwgYmFja29mZiBmb3IgcmF0ZSBsaW1pdGluZ1xyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZXhwb25lbnRpYWxCYWNrb2ZmKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgZGVsYXkgPSBNYXRoLm1pbigxMDAwICogTWF0aC5wb3coMiwgdGhpcy5yZXF1ZXN0Q291bnQgJSA1KSwgMzAwMDApO1xyXG4gICAgY29uc29sZS5sb2coYOKPsyBUTURCOiBFeHBvbmVudGlhbCBiYWNrb2ZmIC0gd2FpdGluZyAke2RlbGF5fW1zYCk7XHJcbiAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgZGVsYXkpKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldHMgdGhlIGdlbnJlIG1hcHBpbmcgY29uZmlndXJhdGlvblxyXG4gICAqL1xyXG4gIGdldEdlbnJlTWFwcGluZygpOiB0eXBlb2YgR0VOUkVfTUFQUElORyB7XHJcbiAgICByZXR1cm4geyAuLi5HRU5SRV9NQVBQSU5HIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBNYXBzIGEgc2luZ2xlIGdlbnJlIElEIGZyb20gTW92aWUgdG8gVFYgZm9ybWF0XHJcbiAgICovXHJcbiAgbWFwU2luZ2xlR2VucmVJZChtb3ZpZUdlbnJlSWQ6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICByZXR1cm4gR0VOUkVfTUFQUElOR1ttb3ZpZUdlbnJlSWQgYXMga2V5b2YgdHlwZW9mIEdFTlJFX01BUFBJTkddIHx8IG1vdmllR2VucmVJZDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldHMgdGhlIHdlc3Rlcm4gbGFuZ3VhZ2VzIGxpc3RcclxuICAgKi9cclxuICBnZXRXZXN0ZXJuTGFuZ3VhZ2VzKCk6IHN0cmluZ1tdIHtcclxuICAgIHJldHVybiBbLi4udGhpcy5XRVNURVJOX0xBTkdVQUdFU107XHJcbiAgfVxyXG59Il19