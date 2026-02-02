console.log('🚨 MONOLITH VERSION LOADED - FINAL WITH JA/KO LANGUAGES');

/**
 * Trinity Cache Lambda Handler - MONOLITH VERSION FINAL
 * All classes included in single file to eliminate require() issues
 * CRITICAL FIX: Added 'ja' (Japanese) and 'ko' (Korean) to western languages
 */

// --- CLASE 1: EnhancedTMDBClient ---
const fetch = require('node-fetch');

/**
 * CRITICAL: Genre ID mapping between Movies and TV
 * Some genres have different IDs between movie and TV endpoints
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
      const mappedId = GENRE_MAPPING[genreId];
      if (mappedId !== undefined) {
        console.log(`🔄 Genre mapping: Movie genre ${genreId} → TV genre ${mappedId}`);
        return mappedId;
      }
      return genreId;
    });
  }

  async validateGenreIds(genreIds, mediaType) {
    if (!genreIds || genreIds.length === 0) return;

    try {
      const validGenres = await this.getGenres(mediaType);
      const validGenreIds = new Set(validGenres.map(g => g.id));
      
      const invalidGenres = genreIds.filter(id => !validGenreIds.has(id));
      if (invalidGenres.length > 0) {
        console.warn(`⚠️ Invalid genre IDs for ${mediaType}: ${invalidGenres.join(', ')}`);
      }
    } catch (error) {
      console.warn(`⚠️ Could not validate genre IDs for ${mediaType}:`, error);
    }
  }

  selectEndpoint(mediaType) {
    this.validateMediaType(mediaType);
    
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

  async discoverMovies(params) {
    return this.discoverContent({ ...params, mediaType: 'MOVIE' });
  }

  async discoverTV(params) {
    return this.discoverContent({ ...params, mediaType: 'TV' });
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
      } else if (params.mediaType === 'MOVIE') {
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
        } else if (params.mediaType === 'TV') {
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

    } catch (error) {
      console.error(`❌ BUSINESS LOGIC: Error discovering ${params.mediaType} content:`, error);
      
      if (error instanceof Error && error.message.includes('rate limit')) {
        console.log('⏳ TMDB: Rate limit hit, implementing backoff...');
        await this.exponentialBackoff();
        return this.discoverContent(params);
      }
      
      throw error;
    }
  }

  parseGenreString(genreString) {
    const separator = genreString.includes('|') ? '|' : ',';
    return genreString.split(separator)
      .map(id => parseInt(id.trim(), 10))
      .filter(id => !isNaN(id));
  }

  async getMovieGenres() {
    return this.getGenres('MOVIE');
  }

  async getTVGenres() {
    return this.getGenres('TV');
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
    } else if (expectedMediaType === 'TV') {
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

  getGenreMapping() {
    return { ...GENRE_MAPPING };
  }

  mapSingleGenreId(movieGenreId) {
    return GENRE_MAPPING[movieGenreId] || movieGenreId;
  }
}

// --- CLASE 2: ContentFilterService ---
const axios = require('axios');

class ContentFilterService {
  constructor() {
    this.apiKey = process.env.TMDB_API_KEY;
    this.baseUrl = 'https://api.themoviedb.org/3';
    
    if (!this.apiKey) {
      throw new Error('TMDB_API_KEY is required');
    }
    
    console.log('🎯 ContentFilterService initialized with IMMUTABLE BUSINESS LOGIC');
  }

  async createFilteredRoom(criteria) {
    console.log(`🎯 IMMUTABLE BUSINESS LOGIC: Starting room creation`, criteria);
    
    try {
      this.validateInput(criteria);
      const endpoint = this.configureExclusiveEndpoint(criteria.mediaType);
      const validItems = await this.fetchAndFilterLoop(criteria, endpoint);
      
      if (validItems.length !== 50) {
        throw new Error(`BUSINESS LOGIC FAILURE: Expected exactly 50 items, got ${validItems.length}`);
      }
      
      console.log(`✅ IMMUTABLE BUSINESS LOGIC SUCCESS: Generated exactly 50 valid ${criteria.mediaType} items`);
      return validItems;
      
    } catch (error) {
      console.error(`❌ IMMUTABLE BUSINESS LOGIC ERROR:`, error);
      throw error;
    }
  }

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

  configureExclusiveEndpoint(mediaType) {
    let endpoint;
    
    if (mediaType === 'TV') {
      endpoint = '/discover/tv';
      console.log(`📺 EXCLUSIVE ENDPOINT: ${endpoint} configured for TV content`);
    } else if (mediaType === 'MOVIE') {
      endpoint = '/discover/movie';
      console.log(`🎬 EXCLUSIVE ENDPOINT: ${endpoint} configured for MOVIE content`);
    } else {
      throw new Error(`CRITICAL: Invalid mediaType ${mediaType}`);
    }
    
    return endpoint;
  }

  async fetchAndFilterLoop(criteria, endpoint) {
    const validItems = [];
    const usedIds = new Set();
    
    console.log(`🔄 FETCH & FILTER LOOP: Starting for ${criteria.mediaType}`);
    
    if (criteria.genres.length > 0) {
      console.log(`🥇 INTENTO 1 (AND): Fetching with BOTH genres [${criteria.genres.join(' AND ')}]`);
      await this.fetchBatchWithGenres(criteria, endpoint, criteria.genres.join(','), validItems, usedIds, 1);
    }
    
    if (criteria.genres.length > 0 && validItems.length < 50) {
      console.log(`🥈 INTENTO 2 (OR): Fetching with ANY genre [${criteria.genres.join(' OR ')}]`);
      await this.fetchBatchWithGenres(criteria, endpoint, criteria.genres.join('|'), validItems, usedIds, 2);
    }
    
    if (validItems.length < 50) {
      console.log(`🥉 RELLENO FINAL: Fetching popular ${criteria.mediaType} content`);
      await this.fetchBatchWithGenres(criteria, endpoint, null, validItems, usedIds, 3);
    }
    
    console.log(`🎯 FETCH & FILTER LOOP COMPLETE: ${validItems.length} valid items collected`);
    return validItems.slice(0, 50);
  }

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
        if (validItems.length >= 50) break;
        
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

  async fetchTMDBBatch(mediaType, endpoint, genreQuery, page) {
    const params = {
      api_key: this.apiKey,
      language: 'es-ES',
      page: page,
      sort_by: 'popularity.desc',
      include_adult: false,
      // CRITICAL FIX: Added 'ja' (Japanese) and 'ko' (Korean) to western languages
      'with_original_language': 'en|es|fr|it|de|pt|ja|ko'
    };
    
    if (genreQuery) {
      params.with_genres = genreQuery;
    }
    
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log(`🌐 TMDB REQUEST: ${endpoint} (page ${page})`);
    console.log(`🚨 TMDB_URL_GENERATED: ${url}?${new URLSearchParams(params).toString()}`);
    
    try {
      const response = await axios.get(url, { params });
      return response.data.results || [];
    } catch (error) {
      console.error(`❌ TMDB API ERROR:`, error.message);
      throw error;
    }
  }

  applyQualityGate(tmdbItem, expectedMediaType, priority) {
    if (!tmdbItem || !tmdbItem.id) {
      return null;
    }
    
    // CRITICAL FIX: Added 'ja' (Japanese) and 'ko' (Korean) to western languages
    const westernLanguages = ['en', 'es', 'fr', 'it', 'de', 'pt', 'ja', 'ko'];
    if (!westernLanguages.includes(tmdbItem.original_language)) {
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

  async loadContentPool(roomId, excludeIds, originalCriteria = null) {
    console.log(`🔄 ContentFilterService: Loading content pool for room ${roomId}`);
    
    if (!originalCriteria) {
      throw new Error('Original criteria required for content pool loading');
    }
    
    return await this.createFilteredRoom(originalCriteria);
  }

  async getAvailableGenres(mediaType) {
    console.log(`🎭 ContentFilterService: Getting available genres for ${mediaType}`);
    
    const endpoint = mediaType === 'MOVIE' ? '/genre/movie/list' : '/genre/tv/list';
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await axios.get(url, {
        params: {
          api_key: this.apiKey,
          language: 'es-ES'
        }
      });
      
      return response.data.genres || [];
    } catch (error) {
      console.error(`❌ Error getting genres:`, error);
      throw error;
    }
  }
}

// --- HANDLER ---
exports.handler = async (event, context) => {
  console.log('🎯 Trinity Cache Lambda (MONOLITH VERSION FINAL) invoked:', JSON.stringify(event, null, 2));

  try {
    const { action, roomId, filterCriteria } = event;

    if (action === 'createCache') {
      if (!roomId || !filterCriteria) {
        throw new Error('roomId and filterCriteria are required for createCache');
      }

      console.log('🎬 Creating cache with MONOLITH VERSION FINAL:', { roomId, filterCriteria });

      // Initialize ContentFilterService with MONOLITH VERSION
      const contentFilterService = new ContentFilterService();
      
      // Execute IMMUTABLE BUSINESS LOGIC: Input → Validación → Fetch & Filter → 50 items
      const validItems = await contentFilterService.createFilteredRoom({
        mediaType: filterCriteria.mediaType,
        genres: filterCriteria.genreIds || [],
        roomId: roomId
      });

      console.log(`✅ MONOLITH VERSION FINAL SUCCESS: Generated exactly ${validItems.length} valid items`);

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          action: 'createCache',
          result: {
            movies: validItems,
            totalMovies: validItems.length,
            businessLogicApplied: {
              monolithVersionFinal: true,
              immutableBusinessLogic: true,
              westernAndAsianLanguagesOnly: true, // Updated to reflect ja/ko addition
              descriptionRequired: true,
              genrePrioritization: true,
              exactlyFiftyMovies: true,
              zeroToleranceQualityGate: true,
              criticalMovieDetectionInTVRooms: true
            }
          },
          timestamp: new Date().toISOString()
        })
      };
    }

    // Handle other actions with simple responses
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        action,
        result: { message: `Action ${action} completed` },
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error(`❌ Error in Trinity Cache Lambda (MONOLITH VERSION FINAL):`, error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        action: event.action || 'unknown',
        timestamp: new Date().toISOString()
      })
    };
  }
};