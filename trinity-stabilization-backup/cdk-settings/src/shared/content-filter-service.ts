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

import fetch from 'node-fetch';
import { EnhancedTMDBClient, TMDBItem, TMDBGenre } from './enhanced-tmdb-client.js';

export interface FilterCriteria {
  mediaType: 'MOVIE' | 'TV';
  genres: number[];
  roomId?: string;
}

export interface ValidatedContent {
  tmdbId: string;
  mediaType: 'MOVIE' | 'TV';
  title: string;
  posterPath: string;
  overview: string;
  genreIds: number[];
  voteAverage: number;
  voteCount: number;
  popularity: number;
  releaseDate: string;
  priority: number;
  addedAt: string;
}

export class ContentFilterService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.themoviedb.org/3';
  
  // CRITICAL: Western-only languages - NO Asian languages per requirements
  private readonly WESTERN_LANGUAGES = ['en', 'es', 'fr', 'it', 'de', 'pt'];

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TMDB_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('TMDB_API_KEY is required');
    }
    
    console.log('🎯 ContentFilterService initialized with IMMUTABLE BUSINESS LOGIC');
  }

  /**
   * Creates a filtered room with exactly 50 movies using immutable business logic
   */
  async createFilteredRoom(criteria: FilterCriteria): Promise<ValidatedContent[]> {
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
      
    } catch (error) {
      console.error(`❌ IMMUTABLE BUSINESS LOGIC ERROR:`, error);
      throw error;
    }
  }

  /**
   * Validates input criteria
   */
  private validateInput(criteria: FilterCriteria): void {
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
  private configureExclusiveEndpoint(mediaType: 'MOVIE' | 'TV'): string {
    let endpoint: string;
    
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
   * Fetch and filter loop with genre prioritization
   */
  private async fetchAndFilterLoop(criteria: FilterCriteria, endpoint: string): Promise<ValidatedContent[]> {
    const validItems: ValidatedContent[] = [];
    const usedIds = new Set<number>();
    
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
  private async fetchBatchWithGenres(
    criteria: FilterCriteria,
    endpoint: string,
    genreQuery: string | null,
    validItems: ValidatedContent[],
    usedIds: Set<number>,
    priority: number
  ): Promise<void> {
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

  /**
   * Fetches a batch from TMDB API
   */
  private async fetchTMDBBatch(
    mediaType: 'MOVIE' | 'TV',
    endpoint: string,
    genreQuery: string | null,
    page: number
  ): Promise<TMDBItem[]> {
    const params: Record<string, any> = {
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
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Trinity-Backend/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { results: TMDBItem[] };
      return data.results || [];
    } catch (error) {
      console.error(`❌ TMDB API ERROR:`, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Applies quality gate validation with zero tolerance
   */
  private applyQualityGate(tmdbItem: TMDBItem, expectedMediaType: 'MOVIE' | 'TV', priority: number): ValidatedContent | null {
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
    
    const title = expectedMediaType === 'TV' ? tmdbItem.name! : tmdbItem.title!;
    const releaseDate = expectedMediaType === 'TV' ? tmdbItem.first_air_date! : tmdbItem.release_date!;
    
    const validItem: ValidatedContent = {
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
  async loadContentPool(roomId: string, excludeIds: string[], originalCriteria?: FilterCriteria): Promise<ValidatedContent[]> {
    console.log(`🔄 ContentFilterService: Loading content pool for room ${roomId}`);
    
    if (!originalCriteria) {
      throw new Error('Original criteria required for content pool loading');
    }
    
    return await this.createFilteredRoom(originalCriteria);
  }

  /**
   * Gets available genres for a media type
   */
  async getAvailableGenres(mediaType: 'MOVIE' | 'TV'): Promise<TMDBGenre[]> {
    console.log(`🎭 ContentFilterService: Getting available genres for ${mediaType}`);
    
    const endpoint = mediaType === 'MOVIE' ? '/genre/movie/list' : '/genre/tv/list';
    const url = `${this.baseUrl}${endpoint}?api_key=${this.apiKey}&language=es-ES`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Trinity-Backend/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { genres: TMDBGenre[] };
      return data.genres || [];
    } catch (error) {
      console.error(`❌ Error getting genres:`, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Validates business logic for a content item
   */
  validateBusinessLogic(item: TMDBItem): boolean {
    return this.applyQualityGate(item, 'MOVIE', 1) !== null || this.applyQualityGate(item, 'TV', 1) !== null;
  }

  /**
   * Checks if item has valid description
   */
  hasValidDescription(item: TMDBItem): boolean {
    return !!(item.overview && 
             typeof item.overview === 'string' && 
             item.overview.trim().length > 0 &&
             !item.overview.includes('Descripción no disponible'));
  }

  /**
   * Checks if language is western
   */
  isWesternLanguage(language: string): boolean {
    return this.WESTERN_LANGUAGES.includes(language);
  }

  /**
   * Checks if item meets quality gates
   */
  meetsQualityGates(item: TMDBItem): boolean {
    return this.hasValidDescription(item) &&
           this.isWesternLanguage(item.original_language) &&
           !!(item.poster_path && item.poster_path.trim().length > 0) &&
           !!(item.genre_ids && item.genre_ids.length > 0) &&
           item.adult !== true;
  }

  /**
   * Gets the western languages list
   */
  getWesternLanguages(): string[] {
    return [...this.WESTERN_LANGUAGES];
  }
}