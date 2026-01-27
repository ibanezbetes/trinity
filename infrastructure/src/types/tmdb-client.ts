/**
 * TMDB API Client Interfaces
 * 
 * This file defines interfaces for enhanced TMDB API integration
 * supporting the discover endpoints for movies and TV shows with
 * advanced genre filtering capabilities.
 */

import { MediaType, Genre, TMDBContent } from './content-filtering';

// ============================================================================
// TMDB API Response Types
// ============================================================================

/**
 * Raw TMDB API response structure for discover endpoints
 */
export interface TMDBDiscoverResponse {
  page: number;
  results: TMDBRawContent[];
  total_pages: number;
  total_results: number;
}

/**
 * Raw content item from TMDB API (before transformation)
 */
export interface TMDBRawContent {
  id: number;
  
  // Movie fields
  title?: string;
  original_title?: string;
  release_date?: string;
  
  // TV fields  
  name?: string;
  original_name?: string;
  first_air_date?: string;
  
  // Common fields
  poster_path?: string;
  backdrop_path?: string;
  overview: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  adult?: boolean;
  video?: boolean;
  original_language: string;
}

/**
 * TMDB Genre List Response
 */
export interface TMDBGenreResponse {
  genres: TMDBRawGenre[];
}

/**
 * Raw genre from TMDB API
 */
export interface TMDBRawGenre {
  id: number;
  name: string;
}

// ============================================================================
// TMDB Client Configuration
// ============================================================================

/**
 * Configuration for TMDB API client
 */
export interface TMDBClientConfig {
  apiKey: string;
  baseUrl?: string;
  language?: string;
  region?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * Parameters for discover API calls
 */
export interface TMDBDiscoverParams {
  // Genre filtering
  with_genres?: string;        // Comma-separated for AND, pipe-separated for OR
  without_genres?: string;     // Exclude these genres
  
  // Sorting and pagination
  sort_by?: 'popularity.desc' | 'popularity.asc' | 'vote_average.desc' | 'vote_average.asc' | 'release_date.desc' | 'release_date.asc';
  page?: number;
  
  // Date filters
  primary_release_date_gte?: string;    // Movies only
  primary_release_date_lte?: string;    // Movies only
  first_air_date_gte?: string;          // TV only
  first_air_date_lte?: string;          // TV only
  
  // Rating filters
  vote_average_gte?: number;
  vote_average_lte?: number;
  vote_count_gte?: number;
  
  // Other filters
  with_original_language?: string;
  region?: string;
  include_adult?: boolean;
  include_video?: boolean;        // Movies only
}

// ============================================================================
// Enhanced TMDB Client Interface
// ============================================================================

/**
 * Enhanced TMDB client with advanced filtering capabilities
 */
export interface EnhancedTMDBClient {
  // ========================================
  // Content Discovery
  // ========================================
  
  /**
   * Discover movies with advanced filtering
   */
  discoverMovies(params: TMDBDiscoverParams): Promise<TMDBContent[]>;
  
  /**
   * Discover TV shows with advanced filtering
   */
  discoverTV(params: TMDBDiscoverParams): Promise<TMDBContent[]>;
  
  /**
   * Generic discover method that works for both movies and TV
   */
  discover(mediaType: MediaType, params: TMDBDiscoverParams): Promise<TMDBContent[]>;
  
  // ========================================
  // Genre Management
  // ========================================
  
  /**
   * Get all available movie genres
   */
  getMovieGenres(): Promise<Genre[]>;
  
  /**
   * Get all available TV genres
   */
  getTVGenres(): Promise<Genre[]>;
  
  /**
   * Get genres for specific media type
   */
  getGenres(mediaType: MediaType): Promise<Genre[]>;
  
  // ========================================
  // Content Details
  // ========================================
  
  /**
   * Get detailed information for a specific movie
   */
  getMovieDetails(movieId: string): Promise<TMDBContent>;
  
  /**
   * Get detailed information for a specific TV show
   */
  getTVDetails(tvId: string): Promise<TMDBContent>;
  
  // ========================================
  // Batch Operations
  // ========================================
  
  /**
   * Fetch multiple pages of content in parallel
   */
  discoverMultiplePages(
    mediaType: MediaType, 
    params: TMDBDiscoverParams, 
    maxPages: number
  ): Promise<TMDBContent[]>;
  
  /**
   * Get content with all specified genres (AND logic)
   */
  getContentWithAllGenres(
    mediaType: MediaType,
    genreIds: number[],
    maxResults?: number
  ): Promise<TMDBContent[]>;
  
  /**
   * Get content with any of the specified genres (OR logic)
   */
  getContentWithAnyGenre(
    mediaType: MediaType,
    genreIds: number[],
    maxResults?: number
  ): Promise<TMDBContent[]>;
  
  /**
   * Get popular content of specified media type
   */
  getPopularContent(
    mediaType: MediaType,
    maxResults?: number
  ): Promise<TMDBContent[]>;
}

// ============================================================================
// TMDB Client Factory
// ============================================================================

/**
 * Factory interface for creating TMDB clients
 */
export interface TMDBClientFactory {
  create(config: TMDBClientConfig): EnhancedTMDBClient;
  createWithDefaults(apiKey: string): EnhancedTMDBClient;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * TMDB API specific errors
 */
export class TMDBApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public endpoint: string,
    public params?: any
  ) {
    super(message);
    this.name = 'TMDBApiError';
  }
}

/**
 * Rate limiting error
 */
export class TMDBRateLimitError extends TMDBApiError {
  constructor(
    public retryAfter: number,
    endpoint: string
  ) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds`, 429, endpoint);
    this.name = 'TMDBRateLimitError';
  }
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Genre ID mapping for common genres
 */
export const TMDB_GENRE_IDS = {
  // Movie genres
  ACTION: 28,
  ADVENTURE: 12,
  ANIMATION: 16,
  COMEDY: 35,
  CRIME: 80,
  DOCUMENTARY: 99,
  DRAMA: 18,
  FAMILY: 10751,
  FANTASY: 14,
  HISTORY: 36,
  HORROR: 27,
  MUSIC: 10402,
  MYSTERY: 9648,
  ROMANCE: 10749,
  SCIENCE_FICTION: 878,
  THRILLER: 53,
  WAR: 10752,
  WESTERN: 37,
  
  // TV genres (some overlap with movies)
  ACTION_ADVENTURE: 10759,
  KIDS: 10762,
  NEWS: 10763,
  REALITY: 10764,
  SOAP: 10766,
  TALK: 10767,
  WAR_POLITICS: 10768
} as const;

/**
 * Helper type for genre ID values
 */
export type TMDBGenreId = typeof TMDB_GENRE_IDS[keyof typeof TMDB_GENRE_IDS];

/**
 * Content transformation utilities
 */
export interface ContentTransformer {
  transformRawContent(raw: TMDBRawContent, mediaType: MediaType): TMDBContent;
  transformRawGenre(raw: TMDBRawGenre, mediaType: MediaType): Genre;
  buildPosterUrl(posterPath: string, size?: string): string;
  buildBackdropUrl(backdropPath: string, size?: string): string;
}