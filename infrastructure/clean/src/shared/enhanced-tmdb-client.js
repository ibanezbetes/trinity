"use strict";
/**
 * Enhanced TMDB Client - Extracted from MONOLITH-TRINITY-CACHE-FINAL.js
 * CRITICAL BUSINESS LOGIC: Preserves all filtering and validation logic
 * CRITICAL FIX: Includes JA/KO language support and strict media type validation
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
        this.RATE_LIMIT_DELAY = 250; // 4 requests per second
        this.apiKey = apiKey || process.env.TMDB_API_KEY || '';
        this.baseUrl = 'https://api.themoviedb.org/3';
        this.requestCount = 0;
        this.lastRequestTime = 0;
        if (!this.apiKey) {
            console.warn('⚠️ TMDB_API_KEY not found in environment variables');
        }
    }
    validateMediaType(mediaType) {
        if (!mediaType || (mediaType !== 'MOVIE' && mediaType !== 'TV')) {
            throw new Error(`Invalid mediaType: ${mediaType}. Must be 'MOVIE' or 'TV'`);
        }
    }
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
                // CRITICAL FIX: Added 'ja' (Japanese) and 'ko' (Korean) to western languages
                'with_original_language': 'en|es|fr|it|de|pt|ja|ko'
            });
            if (params.mediaType === 'TV') {
                queryParams.append('with_status', '0|2|3|4|5');
                queryParams.append('with_type', '0|1|2|3|4|5');
                queryParams.append('first_air_date.gte', '1990-01-01');
                console.log(`📺 TV-SPECIFIC FILTERS: status filtering, date filtering, western+asian languages`);
            }
            else if (params.mediaType === 'MOVIE') {
                queryParams.append('release_date.gte', '1990-01-01');
                queryParams.append('with_runtime.gte', '60');
                console.log(`🎬 MOVIE-SPECIFIC FILTERS: date filtering, runtime filtering, western+asian languages`);
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
            // CRITICAL BUSINESS LOGIC: Endpoint consistency validation
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
            if (params.excludeIds && params.excludeIds.length > 0) {
                const excludeSet = new Set(params.excludeIds);
                const beforeExclude = results.length;
                results = results.filter(item => !excludeSet.has(item.id.toString()));
                console.log(`🚫 EXCLUSION FILTER: Removed ${beforeExclude - results.length} excluded items`);
            }
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
     * CRITICAL BUSINESS LOGIC: The Matrix Detection
     * This validation prevents movies from appearing in TV rooms
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
            // CRITICAL: Prevent TV items in Movie requests
            if (item.name || item.first_air_date) {
                console.warn(`❌ BUSINESS LOGIC REJECTED: Movie request but item ${item.id} has TV fields (name: ${item.name}, first_air_date: ${item.first_air_date})`);
                return false;
            }
        }
        else if (expectedMediaType === 'TV') {
            hasCorrectTitle = !!(item.name && typeof item.name === 'string' && item.name.trim().length > 0);
            hasCorrectDate = !!(item.first_air_date && typeof item.first_air_date === 'string' && item.first_air_date.trim().length > 0);
            title = item.name || '';
            // CRITICAL: Prevent Movie items in TV requests (The Matrix Detection)
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
        // CRITICAL FIX: Added 'ja' (Japanese) and 'ko' (Korean) to western languages
        const westernLanguages = ['en', 'es', 'fr', 'it', 'de', 'pt', 'ja', 'ko'];
        if (!item.original_language || !westernLanguages.includes(item.original_language)) {
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
    parseGenreString(genreString) {
        const separator = genreString.includes('|') ? '|' : ',';
        return genreString.split(separator)
            .map(id => parseInt(id.trim(), 10))
            .filter(id => !isNaN(id));
    }
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
    async exponentialBackoff() {
        const delay = Math.min(1000 * Math.pow(2, this.requestCount % 5), 30000);
        console.log(`⏳ TMDB: Exponential backoff - waiting ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
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
    getGenreMapping() {
        return { ...exports.GENRE_MAPPING };
    }
    mapSingleGenreId(movieGenreId) {
        return exports.GENRE_MAPPING[movieGenreId] || movieGenreId;
    }
}
exports.EnhancedTMDBClient = EnhancedTMDBClient;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5oYW5jZWQtdG1kYi1jbGllbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbmhhbmNlZC10bWRiLWNsaWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7R0FJRzs7Ozs7O0FBRUgsNERBQStCO0FBRS9COzs7R0FHRztBQUNVLFFBQUEsYUFBYSxHQUEyQjtJQUNuRCxzREFBc0Q7SUFDdEQsRUFBRSxFQUFFLEtBQUs7SUFDVCwwREFBMEQ7SUFDMUQsRUFBRSxFQUFFLEtBQUs7SUFDVCxtREFBbUQ7SUFDbkQsRUFBRSxFQUFFLEVBQUU7SUFDTixrREFBa0Q7SUFDbEQsS0FBSyxFQUFFLEtBQUs7Q0FDYixDQUFDO0FBZ0NGLE1BQWEsa0JBQWtCO0lBTzdCLFlBQVksTUFBZTtRQUZWLHFCQUFnQixHQUFHLEdBQUcsQ0FBQyxDQUFDLHdCQUF3QjtRQUcvRCxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksSUFBSSxFQUFFLENBQUM7UUFDdkQsSUFBSSxDQUFDLE9BQU8sR0FBRyw4QkFBOEIsQ0FBQztRQUM5QyxJQUFJLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQztRQUN0QixJQUFJLENBQUMsZUFBZSxHQUFHLENBQUMsQ0FBQztRQUV6QixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pCLE9BQU8sQ0FBQyxJQUFJLENBQUMsb0RBQW9ELENBQUMsQ0FBQztRQUNyRSxDQUFDO0lBQ0gsQ0FBQztJQUVELGlCQUFpQixDQUFDLFNBQWlCO1FBQ2pDLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxTQUFTLEtBQUssT0FBTyxJQUFJLFNBQVMsS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2hFLE1BQU0sSUFBSSxLQUFLLENBQUMsc0JBQXNCLFNBQVMsMkJBQTJCLENBQUMsQ0FBQztRQUM5RSxDQUFDO0lBQ0gsQ0FBQztJQUVELFdBQVcsQ0FBQyxRQUFrQixFQUFF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SSxXQUFXLEVBQUUsQ0FBQztZQUV4RCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsb0JBQUssRUFBQyxHQUFHLEVBQUU7Z0JBQ2hDLE9BQU8sRUFBRTtvQkFDUCxRQUFRLEVBQUUsa0JBQWtCO29CQUM1QixZQUFZLEVBQUUscUJBQXFCO2lCQUNwQzthQUNGLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsbUJBQW1CLFFBQVEsQ0FBQyxNQUFNLElBQUksUUFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDL0UsQ0FBQztZQUVELE1BQU0sSUFBSSxHQUFHLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBZ0QsQ0FBQztZQUNqRixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQztZQUVqQyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixNQUFNLENBQUMsTUFBTSxJQUFJLFNBQVMsU0FBUyxDQUFDLENBQUM7WUFDdEUsT0FBTyxNQUFNLENBQUM7UUFFaEIsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHlCQUF5QixTQUFTLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNuRSxNQUFNLEtBQUssQ0FBQztRQUNkLENBQUM7SUFDSCxDQUFDO0lBRUQsZUFBZTtRQUNiLE9BQU8sRUFBRSxHQUFHLHFCQUFhLEVBQUUsQ0FBQztJQUM5QixDQUFDO0lBRUQsZ0JBQWdCLENBQUMsWUFBb0I7UUFDbkMsT0FBTyxxQkFBYSxDQUFDLFlBQVksQ0FBQyxJQUFJLFlBQVksQ0FBQztJQUNyRCxDQUFDO0NBQ0Y7QUFuV0QsZ0RBbVdDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIEVuaGFuY2VkIFRNREIgQ2xpZW50IC0gRXh0cmFjdGVkIGZyb20gTU9OT0xJVEgtVFJJTklUWS1DQUNIRS1GSU5BTC5qc1xyXG4gKiBDUklUSUNBTCBCVVNJTkVTUyBMT0dJQzogUHJlc2VydmVzIGFsbCBmaWx0ZXJpbmcgYW5kIHZhbGlkYXRpb24gbG9naWNcclxuICogQ1JJVElDQUwgRklYOiBJbmNsdWRlcyBKQS9LTyBsYW5ndWFnZSBzdXBwb3J0IGFuZCBzdHJpY3QgbWVkaWEgdHlwZSB2YWxpZGF0aW9uXHJcbiAqL1xyXG5cclxuaW1wb3J0IGZldGNoIGZyb20gJ25vZGUtZmV0Y2gnO1xyXG5cclxuLyoqXHJcbiAqIENSSVRJQ0FMOiBHZW5yZSBJRCBtYXBwaW5nIGJldHdlZW4gTW92aWVzIGFuZCBUVlxyXG4gKiBTb21lIGdlbnJlcyBoYXZlIGRpZmZlcmVudCBJRHMgYmV0d2VlbiBtb3ZpZSBhbmQgVFYgZW5kcG9pbnRzXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgR0VOUkVfTUFQUElORzogUmVjb3JkPG51bWJlciwgbnVtYmVyPiA9IHtcclxuICAvLyBBY3Rpb24gKE1vdmllOiAyOCkg4oaSIEFjdGlvbiAmIEFkdmVudHVyZSAoVFY6IDEwNzU5KVxyXG4gIDI4OiAxMDc1OSxcclxuICAvLyBBZHZlbnR1cmUgKE1vdmllOiAxMikg4oaSIEFjdGlvbiAmIEFkdmVudHVyZSAoVFY6IDEwNzU5KSBcclxuICAxMjogMTA3NTksXHJcbiAgLy8gV2VzdGVybiAoTW92aWU6IDM3KSDihpIgV2VzdGVybiAoVFY6IDM3KSAtIFNhbWUgSURcclxuICAzNzogMzcsXHJcbiAgLy8gV2FyIChNb3ZpZTogMTA3NTIpIOKGkiBXYXIgJiBQb2xpdGljcyAoVFY6IDEwNzY4KVxyXG4gIDEwNzUyOiAxMDc2OFxyXG59O1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUTURCU2VhcmNoUGFyYW1zIHtcclxuICBtZWRpYVR5cGU6ICdNT1ZJRScgfCAnVFYnO1xyXG4gIHdpdGhHZW5yZXM/OiBzdHJpbmc7XHJcbiAgc29ydEJ5Pzogc3RyaW5nO1xyXG4gIHBhZ2U/OiBudW1iZXI7XHJcbiAgZXhjbHVkZUlkcz86IHN0cmluZ1tdO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFRNREJJdGVtIHtcclxuICBpZDogbnVtYmVyO1xyXG4gIHRpdGxlPzogc3RyaW5nO1xyXG4gIG5hbWU/OiBzdHJpbmc7XHJcbiAgcmVsZWFzZV9kYXRlPzogc3RyaW5nO1xyXG4gIGZpcnN0X2Fpcl9kYXRlPzogc3RyaW5nO1xyXG4gIG92ZXJ2aWV3OiBzdHJpbmc7XHJcbiAgcG9zdGVyX3BhdGg6IHN0cmluZztcclxuICBnZW5yZV9pZHM6IG51bWJlcltdO1xyXG4gIHZvdGVfYXZlcmFnZTogbnVtYmVyO1xyXG4gIHZvdGVfY291bnQ6IG51bWJlcjtcclxuICBwb3B1bGFyaXR5OiBudW1iZXI7XHJcbiAgb3JpZ2luYWxfbGFuZ3VhZ2U6IHN0cmluZztcclxuICBhZHVsdDogYm9vbGVhbjtcclxuICBtZWRpYV90eXBlPzogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFRNREJHZW5yZSB7XHJcbiAgaWQ6IG51bWJlcjtcclxuICBuYW1lOiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBFbmhhbmNlZFRNREJDbGllbnQge1xyXG4gIHByaXZhdGUgYXBpS2V5OiBzdHJpbmc7XHJcbiAgcHJpdmF0ZSBiYXNlVXJsOiBzdHJpbmc7XHJcbiAgcHJpdmF0ZSByZXF1ZXN0Q291bnQ6IG51bWJlcjtcclxuICBwcml2YXRlIGxhc3RSZXF1ZXN0VGltZTogbnVtYmVyO1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgUkFURV9MSU1JVF9ERUxBWSA9IDI1MDsgLy8gNCByZXF1ZXN0cyBwZXIgc2Vjb25kXHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwaUtleT86IHN0cmluZykge1xyXG4gICAgdGhpcy5hcGlLZXkgPSBhcGlLZXkgfHwgcHJvY2Vzcy5lbnYuVE1EQl9BUElfS0VZIHx8ICcnO1xyXG4gICAgdGhpcy5iYXNlVXJsID0gJ2h0dHBzOi8vYXBpLnRoZW1vdmllZGIub3JnLzMnO1xyXG4gICAgdGhpcy5yZXF1ZXN0Q291bnQgPSAwO1xyXG4gICAgdGhpcy5sYXN0UmVxdWVzdFRpbWUgPSAwO1xyXG5cclxuICAgIGlmICghdGhpcy5hcGlLZXkpIHtcclxuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gVE1EQl9BUElfS0VZIG5vdCBmb3VuZCBpbiBlbnZpcm9ubWVudCB2YXJpYWJsZXMnKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHZhbGlkYXRlTWVkaWFUeXBlKG1lZGlhVHlwZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBpZiAoIW1lZGlhVHlwZSB8fCAobWVkaWFUeXBlICE9PSAnTU9WSUUnICYmIG1lZGlhVHlwZSAhPT0gJ1RWJykpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIG1lZGlhVHlwZTogJHttZWRpYVR5cGV9LiBNdXN0IGJlICdNT1ZJRScgb3IgJ1RWJ2ApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgbWFwR2VucmVJZHMoZ2VucmVJZHM6IG51bWJlcltdLCB0YXJnZXRNZWRpYVR5cGU6IHN0cmluZyk6IG51bWJlcltdIHtcclxuICAgIGlmICh0YXJnZXRNZWRpYVR5cGUgPT09ICdNT1ZJRScpIHtcclxuICAgICAgcmV0dXJuIGdlbnJlSWRzO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBnZW5yZUlkcy5tYXAoZ2VucmVJZCA9PiB7XHJcbiAgICAgIGNvbnN0IG1hcHBlZElkID0gR0VOUkVfTUFQUElOR1tnZW5yZUlkXTtcclxuICAgICAgaWYgKG1hcHBlZElkICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBHZW5yZSBtYXBwaW5nOiBNb3ZpZSBnZW5yZSAke2dlbnJlSWR9IOKGkiBUViBnZW5yZSAke21hcHBlZElkfWApO1xyXG4gICAgICAgIHJldHVybiBtYXBwZWRJZDtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZ2VucmVJZDtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgc2VsZWN0RW5kcG9pbnQobWVkaWFUeXBlOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgdGhpcy52YWxpZGF0ZU1lZGlhVHlwZShtZWRpYVR5cGUpO1xyXG4gICAgXHJcbiAgICBsZXQgZW5kcG9pbnQ6IHN0cmluZztcclxuICAgIGlmIChtZWRpYVR5cGUgPT09ICdNT1ZJRScpIHtcclxuICAgICAgZW5kcG9pbnQgPSAnL2Rpc2NvdmVyL21vdmllJztcclxuICAgICAgY29uc29sZS5sb2coYPCfjqwgRU5GT1JDRUQ6IE1vdmllIGVuZHBvaW50IHNlbGVjdGVkIGZvciBtZWRpYVR5cGU6ICR7bWVkaWFUeXBlfWApO1xyXG4gICAgfSBlbHNlIGlmIChtZWRpYVR5cGUgPT09ICdUVicpIHtcclxuICAgICAgZW5kcG9pbnQgPSAnL2Rpc2NvdmVyL3R2JztcclxuICAgICAgY29uc29sZS5sb2coYPCfk7ogRU5GT1JDRUQ6IFRWIGVuZHBvaW50IHNlbGVjdGVkIGZvciBtZWRpYVR5cGU6ICR7bWVkaWFUeXBlfWApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDUklUSUNBTCBFUlJPUjogSW52YWxpZCBtZWRpYVR5cGUgJHttZWRpYVR5cGV9IC0gbXVzdCBiZSBNT1ZJRSBvciBUVmApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhg8J+OryBFTkRQT0lOVCBFTkZPUkNFTUVOVDogJHtlbmRwb2ludH0gZm9yIG1lZGlhVHlwZTogJHttZWRpYVR5cGV9YCk7XHJcbiAgICByZXR1cm4gZW5kcG9pbnQ7XHJcbiAgfVxyXG5cclxuICBhc3luYyBkaXNjb3ZlckNvbnRlbnQocGFyYW1zOiBUTURCU2VhcmNoUGFyYW1zKTogUHJvbWlzZTxUTURCSXRlbVtdPiB7XHJcbiAgICB0aGlzLnZhbGlkYXRlTWVkaWFUeXBlKHBhcmFtcy5tZWRpYVR5cGUpO1xyXG4gICAgXHJcbiAgICBjb25zdCBlbmRwb2ludCA9IHRoaXMuc2VsZWN0RW5kcG9pbnQocGFyYW1zLm1lZGlhVHlwZSk7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGDwn5SNIEJVU0lORVNTIExPR0lDOiBEaXNjb3ZlcmluZyAke3BhcmFtcy5tZWRpYVR5cGV9IGNvbnRlbnQgd2l0aCBBQlNPTFVURSBFTkRQT0lOVCBFTkZPUkNFTUVOVGAsIHtcclxuICAgICAgZW5kcG9pbnQsXHJcbiAgICAgIHdpdGhHZW5yZXM6IHBhcmFtcy53aXRoR2VucmVzLFxyXG4gICAgICBzb3J0Qnk6IHBhcmFtcy5zb3J0QnksXHJcbiAgICAgIGV4Y2x1ZGVDb3VudDogcGFyYW1zLmV4Y2x1ZGVJZHM/Lmxlbmd0aCB8fCAwXHJcbiAgICB9KTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCB0aGlzLmVuZm9yY2VSYXRlTGltaXQoKTtcclxuXHJcbiAgICAgIGxldCBwcm9jZXNzZWRHZW5yZXMgPSBwYXJhbXMud2l0aEdlbnJlcztcclxuICAgICAgaWYgKHBhcmFtcy53aXRoR2VucmVzICYmIHBhcmFtcy5tZWRpYVR5cGUgPT09ICdUVicpIHtcclxuICAgICAgICBjb25zdCBnZW5yZUlkcyA9IHRoaXMucGFyc2VHZW5yZVN0cmluZyhwYXJhbXMud2l0aEdlbnJlcyk7XHJcbiAgICAgICAgY29uc3QgbWFwcGVkR2VucmVJZHMgPSB0aGlzLm1hcEdlbnJlSWRzKGdlbnJlSWRzLCBwYXJhbXMubWVkaWFUeXBlKTtcclxuICAgICAgICBwcm9jZXNzZWRHZW5yZXMgPSBtYXBwZWRHZW5yZUlkcy5qb2luKCcsJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByb2Nlc3NlZEdlbnJlcyAhPT0gcGFyYW1zLndpdGhHZW5yZXMpIHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIEdlbnJlIG1hcHBpbmcgYXBwbGllZDogJHtwYXJhbXMud2l0aEdlbnJlc30g4oaSICR7cHJvY2Vzc2VkR2VucmVzfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgcXVlcnlQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHtcclxuICAgICAgICBhcGlfa2V5OiB0aGlzLmFwaUtleSxcclxuICAgICAgICBsYW5ndWFnZTogJ2VzLUVTJyxcclxuICAgICAgICBzb3J0X2J5OiBwYXJhbXMuc29ydEJ5IHx8ICdwb3B1bGFyaXR5LmRlc2MnLFxyXG4gICAgICAgIHBhZ2U6IChwYXJhbXMucGFnZSB8fCAxKS50b1N0cmluZygpLFxyXG4gICAgICAgIGluY2x1ZGVfYWR1bHQ6ICdmYWxzZScsXHJcbiAgICAgICAgJ3ZvdGVfY291bnQuZ3RlJzogJzUwJyxcclxuICAgICAgICAvLyBDUklUSUNBTCBGSVg6IEFkZGVkICdqYScgKEphcGFuZXNlKSBhbmQgJ2tvJyAoS29yZWFuKSB0byB3ZXN0ZXJuIGxhbmd1YWdlc1xyXG4gICAgICAgICd3aXRoX29yaWdpbmFsX2xhbmd1YWdlJzogJ2VufGVzfGZyfGl0fGRlfHB0fGphfGtvJ1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGlmIChwYXJhbXMubWVkaWFUeXBlID09PSAnVFYnKSB7XHJcbiAgICAgICAgcXVlcnlQYXJhbXMuYXBwZW5kKCd3aXRoX3N0YXR1cycsICcwfDJ8M3w0fDUnKTtcclxuICAgICAgICBxdWVyeVBhcmFtcy5hcHBlbmQoJ3dpdGhfdHlwZScsICcwfDF8MnwzfDR8NScpO1xyXG4gICAgICAgIHF1ZXJ5UGFyYW1zLmFwcGVuZCgnZmlyc3RfYWlyX2RhdGUuZ3RlJywgJzE5OTAtMDEtMDEnKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+TuiBUVi1TUEVDSUZJQyBGSUxURVJTOiBzdGF0dXMgZmlsdGVyaW5nLCBkYXRlIGZpbHRlcmluZywgd2VzdGVybithc2lhbiBsYW5ndWFnZXNgKTtcclxuICAgICAgfSBlbHNlIGlmIChwYXJhbXMubWVkaWFUeXBlID09PSAnTU9WSUUnKSB7XHJcbiAgICAgICAgcXVlcnlQYXJhbXMuYXBwZW5kKCdyZWxlYXNlX2RhdGUuZ3RlJywgJzE5OTAtMDEtMDEnKTtcclxuICAgICAgICBxdWVyeVBhcmFtcy5hcHBlbmQoJ3dpdGhfcnVudGltZS5ndGUnLCAnNjAnKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+OrCBNT1ZJRS1TUEVDSUZJQyBGSUxURVJTOiBkYXRlIGZpbHRlcmluZywgcnVudGltZSBmaWx0ZXJpbmcsIHdlc3Rlcm4rYXNpYW4gbGFuZ3VhZ2VzYCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChwcm9jZXNzZWRHZW5yZXMpIHtcclxuICAgICAgICBxdWVyeVBhcmFtcy5hcHBlbmQoJ3dpdGhfZ2VucmVzJywgcHJvY2Vzc2VkR2VucmVzKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+OrSBCVVNJTkVTUyBMT0dJQzogVXNpbmcgZ2VucmVzIGZvciAke3BhcmFtcy5tZWRpYVR5cGV9OiAke3Byb2Nlc3NlZEdlbnJlc31gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgdXJsID0gYCR7dGhpcy5iYXNlVXJsfSR7ZW5kcG9pbnR9PyR7cXVlcnlQYXJhbXN9YDtcclxuICAgICAgY29uc29sZS5sb2coYPCfjJAgQlVTSU5FU1MgTE9HSUM6IE1ha2luZyBBQlNPTFVURSByZXF1ZXN0IHRvICR7ZW5kcG9pbnR9IGZvciAke3BhcmFtcy5tZWRpYVR5cGV9YCk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5qoIFRNREJfVVJMX0dFTkVSQVRFRDogJHt1cmx9YCk7XHJcblxyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwge1xyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgICAnVXNlci1BZ2VudCc6ICdUcmluaXR5LUJhY2tlbmQvMS4wJ1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUTURCIEFQSSBlcnJvcjogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyB7IHJlc3VsdHM6IFRNREJJdGVtW10gfTtcclxuICAgICAgbGV0IHJlc3VsdHMgPSBkYXRhLnJlc3VsdHMgfHwgW107XHJcblxyXG4gICAgICBjb25zb2xlLmxvZyhg8J+TiiBUTURCOiBSYXcgcmVzcG9uc2UgY29udGFpbnMgJHtyZXN1bHRzLmxlbmd0aH0gaXRlbXMgZm9yICR7cGFyYW1zLm1lZGlhVHlwZX1gKTtcclxuXHJcbiAgICAgIC8vIENSSVRJQ0FMIEJVU0lORVNTIExPR0lDOiBFbmRwb2ludCBjb25zaXN0ZW5jeSB2YWxpZGF0aW9uXHJcbiAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihpdGVtID0+IHtcclxuICAgICAgICBpZiAocGFyYW1zLm1lZGlhVHlwZSA9PT0gJ01PVklFJykge1xyXG4gICAgICAgICAgY29uc3QgaXNWYWxpZE1vdmllID0gISEoaXRlbS50aXRsZSAmJiBpdGVtLnJlbGVhc2VfZGF0ZSAmJiAhaXRlbS5uYW1lICYmICFpdGVtLmZpcnN0X2Fpcl9kYXRlKTtcclxuICAgICAgICAgIGlmICghaXNWYWxpZE1vdmllKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2Fybihg4p2MIEJVU0lORVNTIExPR0lDIFZJT0xBVElPTjogTW92aWUgZW5kcG9pbnQgcmV0dXJuZWQgbm9uLW1vdmllIGl0ZW0gJHtpdGVtLmlkfWAsIHtcclxuICAgICAgICAgICAgICBoYXNUaXRsZTogISFpdGVtLnRpdGxlLFxyXG4gICAgICAgICAgICAgIGhhc05hbWU6ICEhaXRlbS5uYW1lLFxyXG4gICAgICAgICAgICAgIGhhc1JlbGVhc2VEYXRlOiAhIWl0ZW0ucmVsZWFzZV9kYXRlLFxyXG4gICAgICAgICAgICAgIGhhc0ZpcnN0QWlyRGF0ZTogISFpdGVtLmZpcnN0X2Fpcl9kYXRlXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChwYXJhbXMubWVkaWFUeXBlID09PSAnVFYnKSB7XHJcbiAgICAgICAgICBjb25zdCBpc1ZhbGlkVFYgPSAhIShpdGVtLm5hbWUgJiYgaXRlbS5maXJzdF9haXJfZGF0ZSAmJiAhaXRlbS50aXRsZSAmJiAhaXRlbS5yZWxlYXNlX2RhdGUpO1xyXG4gICAgICAgICAgaWYgKCFpc1ZhbGlkVFYpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGDinYwgQlVTSU5FU1MgTE9HSUMgVklPTEFUSU9OOiBUViBlbmRwb2ludCByZXR1cm5lZCBub24tVFYgaXRlbSAke2l0ZW0uaWR9YCwge1xyXG4gICAgICAgICAgICAgIGhhc1RpdGxlOiAhIWl0ZW0udGl0bGUsXHJcbiAgICAgICAgICAgICAgaGFzTmFtZTogISFpdGVtLm5hbWUsXHJcbiAgICAgICAgICAgICAgaGFzUmVsZWFzZURhdGU6ICEhaXRlbS5yZWxlYXNlX2RhdGUsXHJcbiAgICAgICAgICAgICAgaGFzRmlyc3RBaXJEYXRlOiAhIWl0ZW0uZmlyc3RfYWlyX2RhdGVcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYPCflJIgQlVTSU5FU1MgTE9HSUMgRU5GT1JDRU1FTlQ6ICR7cmVzdWx0cy5sZW5ndGh9IGl0ZW1zIHBhc3NlZCBlbmRwb2ludCBjb25zaXN0ZW5jeSBjaGVja2ApO1xyXG5cclxuICAgICAgaWYgKHBhcmFtcy5leGNsdWRlSWRzICYmIHBhcmFtcy5leGNsdWRlSWRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zdCBleGNsdWRlU2V0ID0gbmV3IFNldChwYXJhbXMuZXhjbHVkZUlkcyk7XHJcbiAgICAgICAgY29uc3QgYmVmb3JlRXhjbHVkZSA9IHJlc3VsdHMubGVuZ3RoO1xyXG4gICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihpdGVtID0+ICFleGNsdWRlU2V0LmhhcyhpdGVtLmlkLnRvU3RyaW5nKCkpKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+aqyBFWENMVVNJT04gRklMVEVSOiBSZW1vdmVkICR7YmVmb3JlRXhjbHVkZSAtIHJlc3VsdHMubGVuZ3RofSBleGNsdWRlZCBpdGVtc2ApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBiZWZvcmVWYWxpZGF0aW9uID0gcmVzdWx0cy5sZW5ndGg7XHJcbiAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihpdGVtID0+IHRoaXMudmFsaWRhdGVDb250ZW50RmllbGRzQnVzaW5lc3NMb2dpYyhpdGVtLCBwYXJhbXMubWVkaWFUeXBlKSk7XHJcbiAgICAgIGNvbnN0IGFmdGVyVmFsaWRhdGlvbiA9IHJlc3VsdHMubGVuZ3RoO1xyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYPCflI0gQlVTSU5FU1MgTE9HSUMgUVVBTElUWSBHQVRFOiAke2FmdGVyVmFsaWRhdGlvbn0vJHtiZWZvcmVWYWxpZGF0aW9ufSBpdGVtcyBwYXNzZWQgWkVSTyBUT0xFUkFOQ0UgdmFsaWRhdGlvbiAocmVqZWN0ZWQgJHtiZWZvcmVWYWxpZGF0aW9uIC0gYWZ0ZXJWYWxpZGF0aW9ufSBjb3JydXB0ZWQgaXRlbXMpYCk7XHJcblxyXG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDAgJiYgcGFyYW1zLndpdGhHZW5yZXMpIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBObyB2YWxpZCByZXN1bHRzIGZvdW5kIGZvciAke3BhcmFtcy5tZWRpYVR5cGV9IHdpdGggZ2VucmVzOiAke3Byb2Nlc3NlZEdlbnJlc31gKTtcclxuICAgICAgICBjb25zb2xlLndhcm4oYPCfkqEgT3JpZ2luYWwgZ2VucmVzOiAke3BhcmFtcy53aXRoR2VucmVzfWApO1xyXG4gICAgICAgIGNvbnNvbGUud2Fybihg8J+UjSBUaGlzIG1heSBpbmRpY2F0ZSBnZW5yZSBtYXBwaW5nIGlzc3VlcyBvciBvdmVybHkgc3RyaWN0IHZhbGlkYXRpb25gKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHJlc3VsdHM7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihg4p2MIEJVU0lORVNTIExPR0lDOiBFcnJvciBkaXNjb3ZlcmluZyAke3BhcmFtcy5tZWRpYVR5cGV9IGNvbnRlbnQ6YCwgZXJyb3IpO1xyXG4gICAgICBcclxuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygncmF0ZSBsaW1pdCcpKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ+KPsyBUTURCOiBSYXRlIGxpbWl0IGhpdCwgaW1wbGVtZW50aW5nIGJhY2tvZmYuLi4nKTtcclxuICAgICAgICBhd2FpdCB0aGlzLmV4cG9uZW50aWFsQmFja29mZigpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRpc2NvdmVyQ29udGVudChwYXJhbXMpO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENSSVRJQ0FMIEJVU0lORVNTIExPR0lDOiBUaGUgTWF0cml4IERldGVjdGlvblxyXG4gICAqIFRoaXMgdmFsaWRhdGlvbiBwcmV2ZW50cyBtb3ZpZXMgZnJvbSBhcHBlYXJpbmcgaW4gVFYgcm9vbXNcclxuICAgKi9cclxuICB2YWxpZGF0ZUNvbnRlbnRGaWVsZHNCdXNpbmVzc0xvZ2ljKGl0ZW06IFRNREJJdGVtLCBleHBlY3RlZE1lZGlhVHlwZTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICBpZiAoIWl0ZW0gfHwgdHlwZW9mIGl0ZW0gIT09ICdvYmplY3QnIHx8ICFpdGVtLmlkKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybihg4p2MIEJVU0lORVNTIExPR0lDIFJFSkVDVEVEOiBJbnZhbGlkIGl0ZW0gc3RydWN0dXJlYCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgaGFzQ29ycmVjdFRpdGxlID0gZmFsc2U7XHJcbiAgICBsZXQgaGFzQ29ycmVjdERhdGUgPSBmYWxzZTtcclxuICAgIGxldCB0aXRsZSA9ICcnO1xyXG4gICAgXHJcbiAgICBpZiAoZXhwZWN0ZWRNZWRpYVR5cGUgPT09ICdNT1ZJRScpIHtcclxuICAgICAgaGFzQ29ycmVjdFRpdGxlID0gISEoaXRlbS50aXRsZSAmJiB0eXBlb2YgaXRlbS50aXRsZSA9PT0gJ3N0cmluZycgJiYgaXRlbS50aXRsZS50cmltKCkubGVuZ3RoID4gMCk7XHJcbiAgICAgIGhhc0NvcnJlY3REYXRlID0gISEoaXRlbS5yZWxlYXNlX2RhdGUgJiYgdHlwZW9mIGl0ZW0ucmVsZWFzZV9kYXRlID09PSAnc3RyaW5nJyAmJiBpdGVtLnJlbGVhc2VfZGF0ZS50cmltKCkubGVuZ3RoID4gMCk7XHJcbiAgICAgIHRpdGxlID0gaXRlbS50aXRsZSB8fCAnJztcclxuICAgICAgXHJcbiAgICAgIC8vIENSSVRJQ0FMOiBQcmV2ZW50IFRWIGl0ZW1zIGluIE1vdmllIHJlcXVlc3RzXHJcbiAgICAgIGlmIChpdGVtLm5hbWUgfHwgaXRlbS5maXJzdF9haXJfZGF0ZSkge1xyXG4gICAgICAgIGNvbnNvbGUud2Fybihg4p2MIEJVU0lORVNTIExPR0lDIFJFSkVDVEVEOiBNb3ZpZSByZXF1ZXN0IGJ1dCBpdGVtICR7aXRlbS5pZH0gaGFzIFRWIGZpZWxkcyAobmFtZTogJHtpdGVtLm5hbWV9LCBmaXJzdF9haXJfZGF0ZTogJHtpdGVtLmZpcnN0X2Fpcl9kYXRlfSlgKTtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoZXhwZWN0ZWRNZWRpYVR5cGUgPT09ICdUVicpIHtcclxuICAgICAgaGFzQ29ycmVjdFRpdGxlID0gISEoaXRlbS5uYW1lICYmIHR5cGVvZiBpdGVtLm5hbWUgPT09ICdzdHJpbmcnICYmIGl0ZW0ubmFtZS50cmltKCkubGVuZ3RoID4gMCk7XHJcbiAgICAgIGhhc0NvcnJlY3REYXRlID0gISEoaXRlbS5maXJzdF9haXJfZGF0ZSAmJiB0eXBlb2YgaXRlbS5maXJzdF9haXJfZGF0ZSA9PT0gJ3N0cmluZycgJiYgaXRlbS5maXJzdF9haXJfZGF0ZS50cmltKCkubGVuZ3RoID4gMCk7XHJcbiAgICAgIHRpdGxlID0gaXRlbS5uYW1lIHx8ICcnO1xyXG4gICAgICBcclxuICAgICAgLy8gQ1JJVElDQUw6IFByZXZlbnQgTW92aWUgaXRlbXMgaW4gVFYgcmVxdWVzdHMgKFRoZSBNYXRyaXggRGV0ZWN0aW9uKVxyXG4gICAgICBpZiAoaXRlbS50aXRsZSB8fCBpdGVtLnJlbGVhc2VfZGF0ZSkge1xyXG4gICAgICAgIGNvbnNvbGUud2Fybihg4p2MIEJVU0lORVNTIExPR0lDIFJFSkVDVEVEOiBUViByZXF1ZXN0IGJ1dCBpdGVtICR7aXRlbS5pZH0gaGFzIE1vdmllIGZpZWxkcyAodGl0bGU6ICR7aXRlbS50aXRsZX0sIHJlbGVhc2VfZGF0ZTogJHtpdGVtLnJlbGVhc2VfZGF0ZX0pYCk7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFoYXNDb3JyZWN0VGl0bGUpIHtcclxuICAgICAgY29uc29sZS53YXJuKGDinYwgQlVTSU5FU1MgTE9HSUMgUkVKRUNURUQ6IEl0ZW0gJHtpdGVtLmlkfSBtaXNzaW5nIG9yIGVtcHR5IHRpdGxlIGZvciAke2V4cGVjdGVkTWVkaWFUeXBlfWApO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFoYXNDb3JyZWN0RGF0ZSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oYOKdjCBCVVNJTkVTUyBMT0dJQyBSRUpFQ1RFRDogSXRlbSAke2l0ZW0uaWR9IG1pc3Npbmcgb3IgaW52YWxpZCByZWxlYXNlIGRhdGUgZm9yICR7ZXhwZWN0ZWRNZWRpYVR5cGV9YCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIWl0ZW0ub3ZlcnZpZXcgfHwgdHlwZW9mIGl0ZW0ub3ZlcnZpZXcgIT09ICdzdHJpbmcnIHx8IGl0ZW0ub3ZlcnZpZXcudHJpbSgpLmxlbmd0aCA8PSAyMCkge1xyXG4gICAgICBjb25zb2xlLndhcm4oYOKdjCBCVVNJTkVTUyBMT0dJQyBSRUpFQ1RFRDogSXRlbSAke2l0ZW0uaWR9IGhhcyBpbnZhbGlkIG92ZXJ2aWV3IChsZW5ndGg6ICR7aXRlbS5vdmVydmlldz8ubGVuZ3RoIHx8IDB9KWApO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGl0ZW0ub3ZlcnZpZXcudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZGVzY3JpcGNpw7NuIG5vIGRpc3BvbmlibGUnKSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oYOKdjCBCVVNJTkVTUyBMT0dJQyBSRUpFQ1RFRDogSXRlbSAke2l0ZW0uaWR9IGhhcyBwbGFjZWhvbGRlciBkZXNjcmlwdGlvbjogXCIke2l0ZW0ub3ZlcnZpZXd9XCJgKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghaXRlbS5wb3N0ZXJfcGF0aCB8fCB0eXBlb2YgaXRlbS5wb3N0ZXJfcGF0aCAhPT0gJ3N0cmluZycgfHwgaXRlbS5wb3N0ZXJfcGF0aC50cmltKCkubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybihg4p2MIEJVU0lORVNTIExPR0lDIFJFSkVDVEVEOiBJdGVtICR7aXRlbS5pZH0gaGFzIG5vIHBvc3RlciBwYXRoIC0gUkVRVUlSRURgKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENSSVRJQ0FMIEZJWDogQWRkZWQgJ2phJyAoSmFwYW5lc2UpIGFuZCAna28nIChLb3JlYW4pIHRvIHdlc3Rlcm4gbGFuZ3VhZ2VzXHJcbiAgICBjb25zdCB3ZXN0ZXJuTGFuZ3VhZ2VzID0gWydlbicsICdlcycsICdmcicsICdpdCcsICdkZScsICdwdCcsICdqYScsICdrbyddO1xyXG4gICAgaWYgKCFpdGVtLm9yaWdpbmFsX2xhbmd1YWdlIHx8ICF3ZXN0ZXJuTGFuZ3VhZ2VzLmluY2x1ZGVzKGl0ZW0ub3JpZ2luYWxfbGFuZ3VhZ2UpKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybihg4p2MIEJVU0lORVNTIExPR0lDIFJFSkVDVEVEOiBJdGVtICR7aXRlbS5pZH0gaGFzIG5vbi13ZXN0ZXJuIGxhbmd1YWdlOiAke2l0ZW0ub3JpZ2luYWxfbGFuZ3VhZ2V9YCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIWl0ZW0uZ2VucmVfaWRzIHx8ICFBcnJheS5pc0FycmF5KGl0ZW0uZ2VucmVfaWRzKSB8fCBpdGVtLmdlbnJlX2lkcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgY29uc29sZS53YXJuKGDinYwgQlVTSU5FU1MgTE9HSUMgUkVKRUNURUQ6IEl0ZW0gJHtpdGVtLmlkfSBoYXMgbm8gZ2VucmVzYCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodHlwZW9mIGl0ZW0udm90ZV9hdmVyYWdlICE9PSAnbnVtYmVyJyB8fCBpdGVtLnZvdGVfYXZlcmFnZSA8IDApIHtcclxuICAgICAgY29uc29sZS53YXJuKGDinYwgQlVTSU5FU1MgTE9HSUMgUkVKRUNURUQ6IEl0ZW0gJHtpdGVtLmlkfSBoYXMgaW52YWxpZCB2b3RlX2F2ZXJhZ2U6ICR7aXRlbS52b3RlX2F2ZXJhZ2V9YCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoaXRlbS5hZHVsdCA9PT0gdHJ1ZSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oYOKdjCBCVVNJTkVTUyBMT0dJQyBSRUpFQ1RFRDogSXRlbSAke2l0ZW0uaWR9IGlzIGFkdWx0IGNvbnRlbnRgKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgQlVTSU5FU1MgTE9HSUMgQUNDRVBURUQ6IFZhbGlkICR7ZXhwZWN0ZWRNZWRpYVR5cGV9IGl0ZW0gXCIke3RpdGxlfVwiIChJRDogJHtpdGVtLmlkfSwgTGFuZzogJHtpdGVtLm9yaWdpbmFsX2xhbmd1YWdlfSlgKTtcclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBwYXJzZUdlbnJlU3RyaW5nKGdlbnJlU3RyaW5nOiBzdHJpbmcpOiBudW1iZXJbXSB7XHJcbiAgICBjb25zdCBzZXBhcmF0b3IgPSBnZW5yZVN0cmluZy5pbmNsdWRlcygnfCcpID8gJ3wnIDogJywnO1xyXG4gICAgcmV0dXJuIGdlbnJlU3RyaW5nLnNwbGl0KHNlcGFyYXRvcilcclxuICAgICAgLm1hcChpZCA9PiBwYXJzZUludChpZC50cmltKCksIDEwKSlcclxuICAgICAgLmZpbHRlcihpZCA9PiAhaXNOYU4oaWQpKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgZW5mb3JjZVJhdGVMaW1pdCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XHJcbiAgICBjb25zdCB0aW1lU2luY2VMYXN0UmVxdWVzdCA9IG5vdyAtIHRoaXMubGFzdFJlcXVlc3RUaW1lO1xyXG5cclxuICAgIGlmICh0aW1lU2luY2VMYXN0UmVxdWVzdCA8IHRoaXMuUkFURV9MSU1JVF9ERUxBWSkge1xyXG4gICAgICBjb25zdCBkZWxheSA9IHRoaXMuUkFURV9MSU1JVF9ERUxBWSAtIHRpbWVTaW5jZUxhc3RSZXF1ZXN0O1xyXG4gICAgICBjb25zb2xlLmxvZyhg4o+zIFRNREI6IFJhdGUgbGltaXRpbmcgLSB3YWl0aW5nICR7ZGVsYXl9bXNgKTtcclxuICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIGRlbGF5KSk7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5sYXN0UmVxdWVzdFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgdGhpcy5yZXF1ZXN0Q291bnQrKztcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgZXhwb25lbnRpYWxCYWNrb2ZmKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgZGVsYXkgPSBNYXRoLm1pbigxMDAwICogTWF0aC5wb3coMiwgdGhpcy5yZXF1ZXN0Q291bnQgJSA1KSwgMzAwMDApO1xyXG4gICAgY29uc29sZS5sb2coYOKPsyBUTURCOiBFeHBvbmVudGlhbCBiYWNrb2ZmIC0gd2FpdGluZyAke2RlbGF5fW1zYCk7XHJcbiAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgZGVsYXkpKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGdldEdlbnJlcyhtZWRpYVR5cGU6IHN0cmluZyk6IFByb21pc2U8eyBpZDogbnVtYmVyOyBuYW1lOiBzdHJpbmcgfVtdPiB7XHJcbiAgICB0aGlzLnZhbGlkYXRlTWVkaWFUeXBlKG1lZGlhVHlwZSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGVuZHBvaW50ID0gbWVkaWFUeXBlID09PSAnTU9WSUUnID8gJy9nZW5yZS9tb3ZpZS9saXN0JyA6ICcvZ2VucmUvdHYvbGlzdCc7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGDwn46tIFRNREI6IEdldHRpbmcgJHttZWRpYVR5cGV9IGdlbnJlc2ApO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuZW5mb3JjZVJhdGVMaW1pdCgpO1xyXG5cclxuICAgICAgY29uc3QgcXVlcnlQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHtcclxuICAgICAgICBhcGlfa2V5OiB0aGlzLmFwaUtleSxcclxuICAgICAgICBsYW5ndWFnZTogJ2VzLUVTJ1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHVybCA9IGAke3RoaXMuYmFzZVVybH0ke2VuZHBvaW50fT8ke3F1ZXJ5UGFyYW1zfWA7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwge1xyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgICAnVXNlci1BZ2VudCc6ICdUcmluaXR5LUJhY2tlbmQvMS4wJ1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUTURCIEFQSSBlcnJvcjogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyB7IGdlbnJlczogeyBpZDogbnVtYmVyOyBuYW1lOiBzdHJpbmcgfVtdIH07XHJcbiAgICAgIGNvbnN0IGdlbnJlcyA9IGRhdGEuZ2VucmVzIHx8IFtdO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYOKchSBUTURCOiBSZXRyaWV2ZWQgJHtnZW5yZXMubGVuZ3RofSAke21lZGlhVHlwZX0gZ2VucmVzYCk7XHJcbiAgICAgIHJldHVybiBnZW5yZXM7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihg4p2MIFRNREI6IEVycm9yIGdldHRpbmcgJHttZWRpYVR5cGV9IGdlbnJlczpgLCBlcnJvcik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZ2V0R2VucmVNYXBwaW5nKCk6IFJlY29yZDxudW1iZXIsIG51bWJlcj4ge1xyXG4gICAgcmV0dXJuIHsgLi4uR0VOUkVfTUFQUElORyB9O1xyXG4gIH1cclxuXHJcbiAgbWFwU2luZ2xlR2VucmVJZChtb3ZpZUdlbnJlSWQ6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICByZXR1cm4gR0VOUkVfTUFQUElOR1ttb3ZpZUdlbnJlSWRdIHx8IG1vdmllR2VucmVJZDtcclxuICB9XHJcbn0iXX0=