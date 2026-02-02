/**
 * EnhancedTMDBClient - TMDB API Integration with Discover Endpoints (JavaScript version)
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

// Polyfill fetch for Node.js
const fetch = require('node-fetch');

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
    this.apiKey = process.env.TMDB_API_KEY || '';
    this.baseUrl = 'https://api.themoviedb.org/3';
    this.requestCount = 0;
    this.lastRequestTime = 0;
    this.RATE_LIMIT_DELAY = 250; // 4 requests per second

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
      if (mappedId !== undefined) {
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
    if (!genreIds || genreIds.length === 0) return;

    try {
      const validGenres = await this.getGenres(mediaType);
      const validGenreIds = new Set(validGenres.map(g => g.id));
      
      const invalidGenres = genreIds.filter(id => !validGenreIds.has(id));
      if (invalidGenres.length > 0) {
        console.warn(`⚠️ Invalid genre IDs for ${mediaType}: ${invalidGenres.join(', ')}`);
        // Don't throw error - just log warning for now
      }
    } catch (error) {
      console.warn(`⚠️ Could not validate genre IDs for ${mediaType}:`, error);
    }
  }

  /**
   * CRITICAL FIX: Selects correct TMDB endpoint with ABSOLUTE ENFORCEMENT
   * BUSINESS LOGIC: TV → /discover/tv, MOVIE → /discover/movie (NO EXCEPTIONS)
   * Requirements: 3.1, 3.2, 3.4
   */
  selectEndpoint(mediaType) {
    this.validateMediaType(mediaType);
    
    // CRITICAL: ABSOLUTE ENDPOINT ENFORCEMENT
    let endpoint;
    if (mediaType === 'MOVIE') {
      endpoint = '/discover/movie';
      console.log(`🎬 ENFORCED: Movie endpoint selected for mediaType: ${mediaType}`);
    } else if (mediaType === 'TV') {
      endpoint = '/discover/tv';
      console.log(`📺 ENFORCED: TV endpoint selected for mediaType: ${mediaType}`);
    } else {
      throw new Error(`CRITICAL ERROR: Invalid mediaType ${mediaType} - must be MOVIE or TV`);
    }
    
    console.log(`🎯 ENDPOINT ENFORCEMENT: ${endpoint} for mediaType: ${mediaType}`);
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
   * BUSINESS LOGIC IMPLEMENTATION: Exact algorithm as specified
   * EMERGENCY HOTFIX: ZERO TOLERANCE for mixed content - STRICTEST ENDPOINT ENFORCEMENT
   * Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5
   */
  async discoverContent(params) {
    // CRITICAL: Validate mediaType first - ZERO TOLERANCE
    this.validateMediaType(params.mediaType);
    
    // BUSINESS LOGIC: ABSOLUTE ENDPOINT ENFORCEMENT
    const endpoint = this.selectEndpoint(params.mediaType);
    
    console.log(`🔍 BUSINESS LOGIC: Discovering ${params.mediaType} content with ABSOLUTE ENDPOINT ENFORCEMENT`, {
      endpoint,
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

      // BUSINESS LOGIC: BASE QUALITY FILTERS (ZERO TOLERANCE)
      const queryParams = new URLSearchParams({
        api_key: this.apiKey,
        language: 'es-ES',
        sort_by: params.sortBy || 'popularity.desc',
        page: (params.page || 1).toString(),
        include_adult: 'false', // CRITICAL: Always exclude adult content
        'vote_count.gte': '50', // CRITICAL: Increased minimum vote count for quality
        'with_original_language': 'en|es|fr|it|de|pt' // BUSINESS LOGIC: Western languages only
      });

      // BUSINESS LOGIC: Media type specific filters with ABSOLUTE ENFORCEMENT
      if (params.mediaType === 'TV') {
        // ABSOLUTE ENFORCEMENT: TV-specific parameters
        queryParams.append('with_status', '0|2|3|4|5'); // Exclude cancelled shows (status 1)
        queryParams.append('with_type', '0|1|2|3|4|5'); // All TV types except adult
        queryParams.append('first_air_date.gte', '1990-01-01'); // Only shows from 1990 onwards
        console.log(`📺 TV-SPECIFIC FILTERS: status filtering, date filtering, western languages`);
      } else if (params.mediaType === 'MOVIE') {
        // ABSOLUTE ENFORCEMENT: Movie-specific parameters
        queryParams.append('release_date.gte', '1990-01-01'); // Only movies from 1990 onwards
        queryParams.append('with_runtime.gte', '60'); // Minimum runtime for movies
        console.log(`🎬 MOVIE-SPECIFIC FILTERS: date filtering, runtime filtering, western languages`);
      }

      // BUSINESS LOGIC: Genre filtering (2-step algorithm)
      if (processedGenres) {
        queryParams.append('with_genres', processedGenres);
        console.log(`🎭 BUSINESS LOGIC: Using genres for ${params.mediaType}: ${processedGenres}`);
      }

      const url = `${this.baseUrl}${endpoint}?${queryParams}`;
      console.log(`🌐 BUSINESS LOGIC: Making ABSOLUTE request to ${endpoint} for ${params.mediaType}`);
      console.log(`🚨 TMDB_URL_GENERATED: ${url}`);

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

      console.log(`📊 TMDB: Raw response contains ${results.length} items for ${params.mediaType}`);

      // BUSINESS LOGIC: ABSOLUTE ENDPOINT CONSISTENCY VALIDATION
      results = results.filter(item => {
        if (params.mediaType === 'MOVIE') {
          // ABSOLUTE ENFORCEMENT: Movies MUST have title and release_date, MUST NOT have name or first_air_date
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
        } else if (params.mediaType === 'TV') {
          // ABSOLUTE ENFORCEMENT: TV MUST have name and first_air_date, MUST NOT have title or release_date
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

      // Filter out excluded IDs if provided
      if (params.excludeIds && params.excludeIds.length > 0) {
        const excludeSet = new Set(params.excludeIds);
        const beforeExclude = results.length;
        results = results.filter(item => !excludeSet.has(item.id.toString()));
        console.log(`🚫 EXCLUSION FILTER: Removed ${beforeExclude - results.length} excluded items`);
      }

      // BUSINESS LOGIC: QUALITY GATE - ZERO TOLERANCE VALIDATION
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

    } catch (error) {
      console.error(`❌ BUSINESS LOGIC: Error discovering ${params.mediaType} content:`, error);
      
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

    } catch (error) {
      console.error(`❌ TMDB: Error getting ${mediaType} genres:`, error);
      throw error;
    }
  }

  /**
   * BUSINESS LOGIC: Quality Gate - Zero Tolerance validation
   * EXACT IMPLEMENTATION as specified in business requirements
   */
  validateContentFieldsBusinessLogic(item, expectedMediaType) {
    // CRITICAL: Reject null/undefined items immediately
    if (!item || typeof item !== 'object' || !item.id) {
      console.warn(`❌ BUSINESS LOGIC REJECTED: Invalid item structure`);
      return false;
    }

    // BUSINESS LOGIC: Media type validation with ABSOLUTE ENFORCEMENT
    let hasCorrectTitle = false;
    let hasCorrectDate = false;
    let title = '';
    
    if (expectedMediaType === 'MOVIE') {
      hasCorrectTitle = !!(item.title && typeof item.title === 'string' && item.title.trim().length > 0);
      hasCorrectDate = !!(item.release_date && typeof item.release_date === 'string' && item.release_date.trim().length > 0);
      title = item.title || '';
      
      // BUSINESS LOGIC: ABSOLUTE ENFORCEMENT - Reject if it has ANY TV-specific fields
      if (item.name || item.first_air_date) {
        console.warn(`❌ BUSINESS LOGIC REJECTED: Movie request but item ${item.id} has TV fields (name: ${item.name}, first_air_date: ${item.first_air_date})`);
        return false;
      }
    } else if (expectedMediaType === 'TV') {
      hasCorrectTitle = !!(item.name && typeof item.name === 'string' && item.name.trim().length > 0);
      hasCorrectDate = !!(item.first_air_date && typeof item.first_air_date === 'string' && item.first_air_date.trim().length > 0);
      title = item.name || '';
      
      // BUSINESS LOGIC: ABSOLUTE ENFORCEMENT - Reject if it has ANY Movie-specific fields
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

    // BUSINESS LOGIC: Quality Gate - Overview validation
    if (!item.overview || typeof item.overview !== 'string' || item.overview.trim().length <= 20) {
      console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} has invalid overview (length: ${item.overview?.length || 0})`);
      return false;
    }

    // BUSINESS LOGIC: Quality Gate - Check for placeholder descriptions
    if (item.overview.toLowerCase().includes('descripción no disponible')) {
      console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} has placeholder description: "${item.overview}"`);
      return false;
    }

    // BUSINESS LOGIC: Quality Gate - Poster validation (REQUIRED)
    if (!item.poster_path || typeof item.poster_path !== 'string' || item.poster_path.trim().length === 0) {
      console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} has no poster path - REQUIRED`);
      return false;
    }

    // BUSINESS LOGIC: Quality Gate - Western languages only
    const westernLanguages = ['en', 'es', 'fr', 'it', 'de', 'pt'];
    if (!item.original_language || !westernLanguages.includes(item.original_language)) {
      console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} has non-western language: ${item.original_language}`);
      return false;
    }

    // BUSINESS LOGIC: Quality Gate - Genre validation
    if (!item.genre_ids || !Array.isArray(item.genre_ids) || item.genre_ids.length === 0) {
      console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} has no genres`);
      return false;
    }

    // BUSINESS LOGIC: Quality Gate - Vote validation
    if (typeof item.vote_average !== 'number' || item.vote_average < 0) {
      console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} has invalid vote_average: ${item.vote_average}`);
      return false;
    }

    // BUSINESS LOGIC: Quality Gate - Adult content filter
    if (item.adult === true) {
      console.warn(`❌ BUSINESS LOGIC REJECTED: Item ${item.id} is adult content`);
      return false;
    }

    console.log(`✅ BUSINESS LOGIC ACCEPTED: Valid ${expectedMediaType} item "${title}" (ID: ${item.id}, Lang: ${item.original_language})`);
    return true;
  }

  /**
   * EMERGENCY FIX: Validates that content has all required fields and matches media type
   * ZERO TOLERANCE - STRICT ENFORCEMENT - NO EXCEPTIONS
   */
  validateContentFields(item, expectedMediaType) {
    // CRITICAL: Reject null/undefined items immediately
    if (!item || typeof item !== 'object' || !item.id) {
      console.warn(`❌ REJECTED: Invalid item structure`);
      return false;
    }

    // CRITICAL: Strict media type validation with ZERO TOLERANCE for mixed content
    let hasCorrectTitle = false;
    let hasCorrectDate = false;
    let title = '';
    
    if (expectedMediaType === 'MOVIE') {
      hasCorrectTitle = !!(item.title && typeof item.title === 'string' && item.title.trim().length > 0);
      hasCorrectDate = !!(item.release_date && typeof item.release_date === 'string' && item.release_date.trim().length > 0);
      title = item.title || '';
      
      // CRITICAL: ZERO TOLERANCE - Reject if it has ANY TV-specific fields (mixed content detection)
      if (item.name || item.first_air_date) {
        console.warn(`❌ REJECTED: Movie request but item ${item.id} has TV fields (name: ${item.name}, first_air_date: ${item.first_air_date})`);
        return false;
      }
    } else if (expectedMediaType === 'TV') {
      hasCorrectTitle = !!(item.name && typeof item.name === 'string' && item.name.trim().length > 0);
      hasCorrectDate = !!(item.first_air_date && typeof item.first_air_date === 'string' && item.first_air_date.trim().length > 0);
      title = item.name || '';
      
      // CRITICAL: ZERO TOLERANCE - Reject if it has ANY Movie-specific fields (mixed content detection)
      if (item.title || item.release_date) {
        console.warn(`❌ REJECTED: TV request but item ${item.id} has Movie fields (title: ${item.title}, release_date: ${item.release_date})`);
        return false;
      }
    }

    if (!hasCorrectTitle) {
      console.warn(`❌ REJECTED: Item ${item.id} missing or empty title for ${expectedMediaType}`);
      return false;
    }

    if (!hasCorrectDate) {
      console.warn(`❌ REJECTED: Item ${item.id} missing or invalid release date for ${expectedMediaType}`);
      return false;
    }

    // CRITICAL: ZERO TOLERANCE - Strict overview validation
    if (!item.overview || typeof item.overview !== 'string' || item.overview.trim().length === 0) {
      console.warn(`❌ REJECTED: Item ${item.id} has empty/missing overview`);
      return false;
    }

    // CRITICAL: ZERO TOLERANCE - Check for placeholder descriptions (expanded list)
    const invalidDescriptions = [
      'descripción no disponible',
      'description not available',
      'no description',
      'sin descripción',
      'no disponible',
      'not available',
      'n/a',
      'tbd',
      'coming soon',
      'próximamente',
      'sin sinopsis',
      'no overview',
      'no synopsis',
      'título desconocido',
      'unknown title',
      'película no disponible',
      'movie not available'
    ];
    
    const lowerOverview = item.overview.toLowerCase().trim();
    if (invalidDescriptions.some(invalid => lowerOverview.includes(invalid))) {
      console.warn(`❌ REJECTED: Item ${item.id} has placeholder description: "${item.overview}"`);
      return false;
    }

    // CRITICAL: ZERO TOLERANCE - Minimum overview length requirement
    if (item.overview.trim().length < 20) {
      console.warn(`❌ REJECTED: Item ${item.id} has too short overview (${item.overview.trim().length} chars): "${item.overview}"`);
      return false;
    }

    // CRITICAL: ZERO TOLERANCE - Strict genre validation
    if (!item.genre_ids || !Array.isArray(item.genre_ids) || item.genre_ids.length === 0) {
      console.warn(`❌ REJECTED: Item ${item.id} has no genres`);
      return false;
    }

    // CRITICAL: ZERO TOLERANCE - Vote average validation
    if (typeof item.vote_average !== 'number' || item.vote_average < 0) {
      console.warn(`❌ REJECTED: Item ${item.id} has invalid vote_average: ${item.vote_average}`);
      return false;
    }

    // CRITICAL: ZERO TOLERANCE - Poster validation is now REQUIRED
    if (!item.poster_path || typeof item.poster_path !== 'string' || item.poster_path.trim().length === 0) {
      console.warn(`❌ REJECTED: Item ${item.id} has no poster path - REQUIRED for production`);
      return false;
    }

    // CRITICAL: ZERO TOLERANCE - Adult content filter (expanded)
    if (item.adult === true) {
      console.warn(`❌ REJECTED: Item ${item.id} is adult content`);
      return false;
    }

    // CRITICAL: ZERO TOLERANCE - Check for inappropriate content in title (expanded list)
    const inappropriateKeywords = [
      'lesbian adventures',
      'adult',
      'xxx',
      'porn',
      'erotic',
      'sex',
      '18+',
      'mature',
      'explicit',
      'nsfw',
      'sexual',
      'nude',
      'naked'
    ];
    
    if (inappropriateKeywords.some(keyword => title.toLowerCase().includes(keyword))) {
      console.warn(`❌ REJECTED: Item ${item.id} has inappropriate title: "${title}"`);
      return false;
    }

    // CRITICAL: ZERO TOLERANCE - Check for inappropriate content in overview
    if (inappropriateKeywords.some(keyword => item.overview.toLowerCase().includes(keyword))) {
      console.warn(`❌ REJECTED: Item ${item.id} has inappropriate content in overview`);
      return false;
    }

    // CRITICAL: ZERO TOLERANCE - Vote count validation (must have community engagement)
    if (typeof item.vote_count !== 'number' || item.vote_count < 10) {
      console.warn(`❌ REJECTED: Item ${item.id} has insufficient vote count: ${item.vote_count} (minimum: 10)`);
      return false;
    }

    // CRITICAL: ZERO TOLERANCE - Popularity validation (must be reasonably popular)
    if (typeof item.popularity !== 'number' || item.popularity < 1) {
      console.warn(`❌ REJECTED: Item ${item.id} has insufficient popularity: ${item.popularity}`);
      return false;
    }

    console.log(`✅ ACCEPTED: Valid ${expectedMediaType} item "${title}" (ID: ${item.id}, Rating: ${item.vote_average}, Votes: ${item.vote_count}, Popularity: ${item.popularity})`);
    return true;
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

module.exports = { EnhancedTMDBClient };