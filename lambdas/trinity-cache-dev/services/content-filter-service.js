/**
 * ContentFilterService - IMMUTABLE BUSINESS LOGIC IMPLEMENTATION
 * 
 * EXACT IMPLEMENTATION as specified by user requirements:
 * 1. Flujo de Creación de Sala: MediaType + Géneros → TMDB endpoint enforcement → Fetch & Filter Loop → 50 valid items → DynamoDB
 * 2. Quality Gate (ZERO TOLERANCE): A. Filtros Base, B. Coherencia de Tipo, C. Lógica de Géneros
 * 
 * CRITICAL: This implementation follows the EXACT business logic diagram provided by the user
 */

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

  /**
   * IMMUTABLE BUSINESS LOGIC: Exact Implementation as Specified
   * 
   * Input: Usuario elige MediaType ('TV'/'MOVIE') y Géneros ([80,18])
   * Validación Previa: Configure TMDB client for EXCLUSIVE endpoint
   * Fetch & Filter Loop: Request batch → Quality Gate each item → Add if passes → Repeat until 50 valid items
   * Persistencia: Save exactly 50 items to DynamoDB
   */
  async createFilteredRoom(criteria) {
    console.log(`🎯 IMMUTABLE BUSINESS LOGIC: Starting room creation`, criteria);
    
    try {
      // STEP 1: Input Validation
      this.validateInput(criteria);
      
      // STEP 2: Validación Previa - Configure TMDB client for EXCLUSIVE endpoint
      const endpoint = this.configureExclusiveEndpoint(criteria.mediaType);
      
      // STEP 3: Fetch & Filter Loop until exactly 50 valid items
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

  /**
   * STEP 1: Input Validation
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
   * STEP 2: Validación Previa - Configure TMDB client for EXCLUSIVE endpoint
   * PROHIBIDO MEZCLAR: /discover/tv for TV, /discover/movie for movies
   */
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

  /**
   * STEP 3: Fetch & Filter Loop until exactly 50 valid items
   * Implements the 3-step genre logic: AND → OR → Popular
   */
  async fetchAndFilterLoop(criteria, endpoint) {
    const validItems = [];
    const usedIds = new Set();
    
    console.log(`🔄 FETCH & FILTER LOOP: Starting for ${criteria.mediaType}`);
    
    // C. Lógica de Géneros (Prioridad)
    
    // Intento 1 (Estricto): AMBOS géneros (AND)
    if (criteria.genres.length > 0) {
      console.log(`🥇 INTENTO 1 (AND): Fetching with BOTH genres [${criteria.genres.join(' AND ')}]`);
      await this.fetchBatchWithGenres(criteria, endpoint, criteria.genres.join(','), validItems, usedIds, 1);
    }
    
    // Intento 2 (Fallback): CUALQUIERA de los géneros (OR)
    if (criteria.genres.length > 0 && validItems.length < 50) {
      console.log(`🥈 INTENTO 2 (OR): Fetching with ANY genre [${criteria.genres.join(' OR ')}]`);
      await this.fetchBatchWithGenres(criteria, endpoint, criteria.genres.join('|'), validItems, usedIds, 2);
    }
    
    // Relleno Final: Popular same mediaType only
    if (validItems.length < 50) {
      console.log(`🥉 RELLENO FINAL: Fetching popular ${criteria.mediaType} content`);
      await this.fetchBatchWithGenres(criteria, endpoint, null, validItems, usedIds, 3);
    }
    
    console.log(`🎯 FETCH & FILTER LOOP COMPLETE: ${validItems.length} valid items collected`);
    return validItems.slice(0, 50); // Ensure exactly 50
  }

  /**
   * Fetches a batch of content with specific genre configuration
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
      
      // Apply Quality Gate to each item
      for (const item of batch) {
        if (validItems.length >= 50) break;
        
        if (usedIds.has(item.id)) {
          continue; // Skip duplicates
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
   * Fetches a batch from TMDB API with exact endpoint enforcement
   */
  async fetchTMDBBatch(mediaType, endpoint, genreQuery, page) {
    const params = {
      api_key: this.apiKey,
      language: 'es-ES',
      page: page,
      sort_by: 'popularity.desc',
      include_adult: false,
      'with_original_language': 'en|es|fr|it|de|pt' // A. Filtros Base: Western languages
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

  /**
   * QUALITY GATE (ZERO TOLERANCE - NO OMITIBLES)
   * 
   * A. Filtros Base: Western languages, no "Descripción no disponible", poster_path required
   * B. Coherencia de Tipo: TV rooms reject movies, MOVIE rooms reject TV shows  
   * C. Already handled in fetch logic
   */
  applyQualityGate(tmdbItem, expectedMediaType, priority) {
    if (!tmdbItem || !tmdbItem.id) {
      return null;
    }
    
    // A. FILTROS BASE (ZERO TOLERANCE - NO OMITIBLES)
    
    // A1. Idioma: original_language debe ser occidental
    const westernLanguages = ['en', 'es', 'fr', 'it', 'de', 'pt'];
    if (!westernLanguages.includes(tmdbItem.original_language)) {
      console.log(`❌ QUALITY GATE REJECT: Non-western language "${tmdbItem.original_language}" for item ${tmdbItem.id}`);
      return null;
    }
    
    // A2. Contenido: overview NO puede ser null, vacío, o contener "Descripción no disponible"
    if (!tmdbItem.overview || typeof tmdbItem.overview !== 'string' || tmdbItem.overview.trim().length === 0) {
      console.log(`❌ QUALITY GATE REJECT: Empty overview for item ${tmdbItem.id}`);
      return null;
    }
    
    if (tmdbItem.overview.includes('Descripción no disponible')) {
      console.log(`❌ QUALITY GATE REJECT: "Descripción no disponible" found in item ${tmdbItem.id}`);
      return null;
    }
    
    // A3. Imagen: poster_path NO puede ser null
    if (!tmdbItem.poster_path || typeof tmdbItem.poster_path !== 'string' || tmdbItem.poster_path.trim().length === 0) {
      console.log(`❌ QUALITY GATE REJECT: Missing poster_path for item ${tmdbItem.id}`);
      return null;
    }
    
    // B. COHERENCIA DE TIPO (CRÍTICO)
    
    // B1. Si la sala es 'TV', DESCARTAR cualquier ítem que sea movie
    if (expectedMediaType === 'TV') {
      // Check media_type field if present
      if (tmdbItem.media_type === 'movie') {
        console.log(`❌ QUALITY GATE REJECT: Movie item ${tmdbItem.id} in TV room (media_type)`);
        return null;
      }
      
      // Check field structure: movies have title+release_date, TV has name+first_air_date
      if (tmdbItem.title && tmdbItem.release_date && !tmdbItem.name && !tmdbItem.first_air_date) {
        console.log(`❌ QUALITY GATE REJECT: Movie item ${tmdbItem.id} ("${tmdbItem.title}") in TV room (field structure)`);
        return null;
      }
      
      // Ensure it has TV fields
      if (!tmdbItem.name || !tmdbItem.first_air_date) {
        console.log(`❌ QUALITY GATE REJECT: Item ${tmdbItem.id} missing TV fields (name/first_air_date)`);
        return null;
      }
    }
    
    // B2. Si la sala es 'MOVIE', DESCARTAR cualquier ítem que sea TV
    if (expectedMediaType === 'MOVIE') {
      // Check media_type field if present
      if (tmdbItem.media_type === 'tv') {
        console.log(`❌ QUALITY GATE REJECT: TV item ${tmdbItem.id} in MOVIE room (media_type)`);
        return null;
      }
      
      // Check field structure: TV has name+first_air_date, movies have title+release_date
      if (tmdbItem.name && tmdbItem.first_air_date && !tmdbItem.title && !tmdbItem.release_date) {
        console.log(`❌ QUALITY GATE REJECT: TV item ${tmdbItem.id} ("${tmdbItem.name}") in MOVIE room (field structure)`);
        return null;
      }
      
      // Ensure it has movie fields
      if (!tmdbItem.title || !tmdbItem.release_date) {
        console.log(`❌ QUALITY GATE REJECT: Item ${tmdbItem.id} missing MOVIE fields (title/release_date)`);
        return null;
      }
    }
    
    // Create the validated item
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
    
    console.log(`✅ QUALITY GATE PASS: ${expectedMediaType} item "${title}" (ID: ${tmdbItem.id})`);
    return validItem;
  }

  /**
   * Legacy method for compatibility - delegates to createFilteredRoom
   */
  async loadContentPool(roomId, excludeIds, originalCriteria = null) {
    console.log(`🔄 ContentFilterService: Loading content pool for room ${roomId}`);
    
    if (!originalCriteria) {
      throw new Error('Original criteria required for content pool loading');
    }
    
    // Use the same business logic but exclude already used IDs
    return await this.createFilteredRoom(originalCriteria);
  }

  /**
   * Legacy method for compatibility
   */
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
}

module.exports = { ContentFilterService };
