/**
 * Content Filter Service - Extracted from MONOLITH-TRINITY-CACHE-FINAL.js
 * CRITICAL BUSINESS LOGIC: 50-movie room creation with genre prioritization
 * CRITICAL FIX: Includes JA/KO language support and "The Matrix" detection
 */

import axios from 'axios';
import { TMDBItem } from './enhanced-tmdb-client';

export interface FilterCriteria {
  mediaType: 'TV' | 'MOVIE';
  genres: number[];
  roomId?: string;
}

export interface ValidatedItem {
  tmdbId: string;
  mediaType: string;
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
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TMDB_API_KEY || '';
    this.baseUrl = 'https://api.themoviedb.org/3';
    
    if (!this.apiKey) {
      throw new Error('TMDB_API_KEY is required');
    }
    
    console.log('🎯 ContentFilterService initialized with IMMUTABLE BUSINESS LOGIC');
  }

  async createFilteredRoom(criteria: FilterCriteria): Promise<ValidatedItem[]> {
    console.log(`🎯 IMMUTABLE BUSINESS LOGIC: Starting room creation`, criteria);
    
    try {
      this.validateInput(criteria);
      const endpoint = this.configureExclusiveEndpoint(criteria.mediaType);
      const validItems = await this.fetchAndFilterLoop(criteria, endpoint);
      
      if (validItems.length !== 50) {
        console.warn(`⚠️ BUSINESS LOGIC WARNING: Expected exactly 50 items, got ${validItems.length}`);
        // Allow graceful shortage handling for western-only filtering
        if (validItems.length === 0) {
          throw new Error(`BUSINESS LOGIC FAILURE: No valid items found for ${criteria.mediaType}`);
        }
      }
      
      console.log(`✅ IMMUTABLE BUSINESS LOGIC SUCCESS: Generated ${validItems.length} valid ${criteria.mediaType} items`);
      return validItems;
      
    } catch (error) {
      console.error(`❌ IMMUTABLE BUSINESS LOGIC ERROR:`, error);
      throw error;
    }
  }

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

  private configureExclusiveEndpoint(mediaType: string): string {
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

  private async fetchAndFilterLoop(criteria: FilterCriteria, endpoint: string): Promise<ValidatedItem[]> {
    const validItems: ValidatedItem[] = [];
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
    return validItems.slice(0, 50);
  }

  private async fetchBatchWithGenres(
    criteria: FilterCriteria, 
    endpoint: string, 
    genreQuery: string | null, 
    validItems: ValidatedItem[], 
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

  private async fetchTMDBBatch(
    mediaType: string, 
    endpoint: string, 
    genreQuery: string | null, 
    page: number
  ): Promise<TMDBItem[]> {
    const params: Record<string, string | boolean | number> = {
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
    console.log(`🚨 TMDB_URL_GENERATED: ${url}?${new URLSearchParams(params as Record<string, string>).toString()}`);
    
    try {
      const response = await axios.get(url, { params });
      return response.data.results || [];
    } catch (error) {
      console.error(`❌ TMDB API ERROR:`, error);
      throw error;
    }
  }

  /**
   * CRITICAL BUSINESS LOGIC: Quality Gate with "The Matrix" Detection
   * This prevents movies from appearing in TV rooms and vice versa
   */
  private applyQualityGate(tmdbItem: TMDBItem, expectedMediaType: string, priority: number): ValidatedItem | null {
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
    
    // CRITICAL BUSINESS LOGIC: Detect movies in TV rooms ("The Matrix" Detection)
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
    
    const validItem: ValidatedItem = {
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

  async getAvailableGenres(mediaType: string): Promise<{ id: number; name: string }[]> {
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