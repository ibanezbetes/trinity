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

import { MediaType } from '../types/content-filtering-types';

export interface DiscoverParams {
  mediaType: MediaType;
  withGenres?: string;  // "28,12" for AND, "28|12" for OR
  sortBy?: 'popularity.desc' | 'vote_average.desc';
  page?: number;
  excludeIds?: string[];
}

export interface TMDBContent {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  genre_ids: number[];
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: string;
}

export interface Genre {
  id: number;
  name: string;
}

export class EnhancedTMDBClient {
  private apiKey: string;
  private baseUrl = 'https://api.themoviedb.org/3';
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly RATE_LIMIT_DELAY = 250; // 4 requests per second

  constructor() {
    this.apiKey = process.env.TMDB_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️ TMDB_API_KEY not found in environment variables');
    }
  }

  /**
   * Discovers movies using TMDB discover endpoint
   * Requirements: 4.1, 4.3, 4.4
   */
  async discoverMovies(params: Omit<DiscoverParams, 'mediaType'>): Promise<TMDBContent[]> {
    return this.discoverContent({ ...params, mediaType: 'MOVIE' });
  }

  /**
   * Discovers TV shows using TMDB discover endpoint
   * Requirements: 4.2, 4.3, 4.4
   */
  async discoverTV(params: Omit<DiscoverParams, 'mediaType'>): Promise<TMDBContent[]> {
    return this.discoverContent({ ...params, mediaType: 'TV' });
  }

  /**
   * Generic discover method for both movies and TV
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
   */
  async discoverContent(params: DiscoverParams): Promise<TMDBContent[]> {
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

      const data = await response.json() as any;
      let results: TMDBContent[] = data.results || [];

      // Filter out excluded IDs if provided
      if (params.excludeIds && params.excludeIds.length > 0) {
        const excludeSet = new Set(params.excludeIds);
        results = results.filter(item => !excludeSet.has(item.id.toString()));
      }

      // Validate required fields (Requirements: 4.5)
      results = results.filter(item => this.validateContentFields(item));

      console.log(`✅ TMDB: Retrieved ${results.length} valid ${params.mediaType} items`);
      return results;

    } catch (error) {
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
  async getMovieGenres(): Promise<Genre[]> {
    return this.getGenres('MOVIE');
  }

  /**
   * Gets available genres for TV shows
   * Requirements: 1.4, 2.1
   */
  async getTVGenres(): Promise<Genre[]> {
    return this.getGenres('TV');
  }

  /**
   * Generic method to get genres for any media type
   * Requirements: 1.4, 2.1
   */
  async getGenres(mediaType: MediaType): Promise<Genre[]> {
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

      const data = await response.json() as any;
      const genres: Genre[] = data.genres || [];

      console.log(`✅ TMDB: Retrieved ${genres.length} ${mediaType} genres`);
      return genres;

    } catch (error) {
      console.error(`❌ TMDB: Error getting ${mediaType} genres:`, error);
      throw error;
    }
  }

  /**
   * Validates that content has all required fields
   * Requirements: 4.5
   */
  private validateContentFields(item: any): boolean {
    const requiredFields = [
      'id',
      'overview',
      'genre_ids',
      'vote_average'
    ];

    // Check for title/name
    const hasTitle = item.title || item.name;
    if (!hasTitle) return false;

    // Check for release date
    const hasReleaseDate = item.release_date || item.first_air_date;
    if (!hasReleaseDate) return false;

    // Check other required fields
    return requiredFields.every(field => item[field] !== undefined && item[field] !== null);
  }

  /**
   * Enforces rate limiting to respect TMDB API limits
   * Requirements: 4.6
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
   * Implements exponential backoff for error recovery
   * Requirements: 4.6
   */
  private async exponentialBackoff(): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, this.requestCount % 5), 30000); // Max 30 seconds
    console.log(`⏳ TMDB: Exponential backoff - waiting ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}