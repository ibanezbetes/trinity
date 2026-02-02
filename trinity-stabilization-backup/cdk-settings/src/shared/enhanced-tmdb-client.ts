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

import fetch from 'node-fetch';

/**
 * CRITICAL: Genre ID mapping between Movies and TV
 * Some genres have different IDs between movie and TV endpoints
 */
export const GENRE_MAPPING = {
  // Action (Movie: 28) → Action & Adventure (TV: 10759)
  28: 10759,
  // Adventure (Movie: 12) → Action & Adventure (TV: 10759) 
  12: 10759,
  // Western (Movie: 37) → Western (TV: 37) - Same ID
  37: 37,
  // War (Movie: 10752) → War & Politics (TV: 10768)
  10752: 10768
} as const;

export interface TMDBSearchParams {
  mediaType: 'MOVIE' | 'TV';
  withGenres?: string;
  sortBy?: string;
  page?: number;
  excludeIds?: string[];
}

export interface TMDBItem {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  poster_path: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  original_language: string;
  adult: boolean;
  media_type?: string;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export class EnhancedTMDBClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.themoviedb.org/3';
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly RATE_LIMIT_DELAY = 250; // 4 requests per second
  
  // CRITICAL: Western-only languages - NO Asian languages per requirements
  private readonly WESTERN_LANGUAGES = ['en', 'es', 'fr', 'it', 'de', 'pt'];

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TMDB_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn('⚠️ TMDB_API_KEY not found in environment variables');
    }
  }

  /**
   * Validates media type - CRITICAL for endpoint enforcement
   */
  validateMediaType(mediaType: string): void {
    if (!mediaType || (mediaType !== 'MOVIE' && mediaType !== 'TV')) {
      throw new Error(`Invalid mediaType: ${mediaType}. Must be 'MOVIE' or 'TV'`);
    }
  }

  /**
   * Maps genre IDs from Movie to TV format when needed
   */
  mapGenreIds(genreIds: number[], targetMediaType: 'MOVIE' | 'TV'): number[] {
    if (targetMediaType === 'MOVIE') {
      return genreIds;
    }

    return genreIds.map(genreId => {
      const mappedId = GENRE_MAPPING[genreId as keyof typeof GENRE_MAPPING];
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
  selectEndpoint(mediaType: 'MOVIE' | 'TV'): string {
    this.validateMediaType(mediaType);
    
    let endpoint: string;
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
   * Discovers content with strict business logic enforcement
   */
  async discoverContent(params: TMDBSearchParams): Promise<TMDBItem[]> {
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
      } else if (params.mediaType === 'MOVIE') {
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

  /**
   * Validates content fields with zero tolerance business logic
   */
  validateContentFieldsBusinessLogic(item: TMDBItem, expectedMediaType: 'MOVIE' | 'TV'): boolean {
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
  async getGenres(mediaType: 'MOVIE' | 'TV'): Promise<TMDBGenre[]> {
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

      const data = await response.json() as { genres: TMDBGenre[] };
      const genres = data.genres || [];

      console.log(`✅ TMDB: Retrieved ${genres.length} ${mediaType} genres`);
      return genres;

    } catch (error) {
      console.error(`❌ TMDB: Error getting ${mediaType} genres:`, error);
      throw error;
    }
  }

  /**
   * Parses genre string (comma or pipe separated)
   */
  parseGenreString(genreString: string): number[] {
    const separator = genreString.includes('|') ? '|' : ',';
    return genreString.split(separator)
      .map(id => parseInt(id.trim(), 10))
      .filter(id => !isNaN(id));
  }

  /**
   * Enforces rate limiting
   */
  private async enforceRateLimit(): Promise<void> {
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
  private async exponentialBackoff(): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, this.requestCount % 5), 30000);
    console.log(`⏳ TMDB: Exponential backoff - waiting ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Gets the genre mapping configuration
   */
  getGenreMapping(): typeof GENRE_MAPPING {
    return { ...GENRE_MAPPING };
  }

  /**
   * Maps a single genre ID from Movie to TV format
   */
  mapSingleGenreId(movieGenreId: number): number {
    return GENRE_MAPPING[movieGenreId as keyof typeof GENRE_MAPPING] || movieGenreId;
  }

  /**
   * Gets the western languages list
   */
  getWesternLanguages(): string[] {
    return [...this.WESTERN_LANGUAGES];
  }
}