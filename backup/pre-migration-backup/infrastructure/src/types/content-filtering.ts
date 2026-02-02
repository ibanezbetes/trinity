/**
 * Advanced Content Filtering - Core Types and Interfaces
 * 
 * This file defines the core data models and interfaces for the advanced
 * content filtering system that allows users to create rooms with specific
 * media type and genre filters.
 */

// ============================================================================
// Core Enums
// ============================================================================

export enum MediaType {
  MOVIE = 'MOVIE',
  TV = 'TV'
}

export enum Priority {
  ALL_GENRES = 1,    // Priority 1: Content with ALL selected genres
  ANY_GENRE = 2,     // Priority 2: Content with AT LEAST ONE selected genre  
  POPULAR = 3        // Priority 3: Popular content of same media type
}

// ============================================================================
// Filter Criteria
// ============================================================================

export interface FilterCriteria {
  mediaType: MediaType;
  genreIds: number[];  // Maximum 3 genres allowed
  roomId: string;
}

// ============================================================================
// Genre Model
// ============================================================================

export interface Genre {
  id: number;
  name: string;
  mediaType: MediaType;
}

// ============================================================================
// Content Models
// ============================================================================

export interface TMDBContent {
  id: string;
  title: string;           // movie.title or tv.name
  poster_path?: string;
  overview: string;
  genre_ids: number[];
  vote_average: number;
  release_date?: string;   // movie.release_date or tv.first_air_date
}

export interface ContentPoolEntry {
  tmdbId: string;
  mediaType: MediaType;
  title: string;
  posterPath?: string;
  overview: string;
  genreIds: number[];
  voteAverage: number;
  releaseDate: string;
  priority: Priority;
  addedAt: Date;
}

export interface PrioritizedContent {
  content: TMDBContent[];
  priority: Priority;
  randomized: boolean;
}

// ============================================================================
// Extended Room Model
// ============================================================================

export interface ExtendedRoom {
  // Existing room fields
  id: string;
  name: string;
  createdBy: string;
  participants: string[];  // User IDs
  
  // New filtering fields (optional for backward compatibility)
  filterCriteria?: FilterCriteria;
  contentPool: ContentPoolEntry[];
  excludedContentIds: string[];
  lastContentRefresh: Date;
  currentContentIndex: number;
}

// ============================================================================
// Cache Models
// ============================================================================

export interface FilterCacheEntry {
  cacheKey: string;        // Hash of FilterCriteria
  mediaType: MediaType;
  genreIds: number[];
  content: TMDBContent[];
  createdAt: Date;
  expiresAt: Date;
  totalAvailable: number;
}

export interface RoomExclusions {
  roomId: string;
  excludedIds: Set<string>;
  lastUpdated: Date;
}

// ============================================================================
// TMDB API Parameters
// ============================================================================

export interface DiscoverParams {
  withGenres?: string;     // "28,12" for AND, "28|12" for OR
  sortBy: 'popularity.desc' | 'vote_average.desc';
  page: number;
  excludeIds?: string[];
}

// ============================================================================
// Service Interfaces
// ============================================================================

export interface ContentFilterService {
  createFilteredRoom(criteria: FilterCriteria): Promise<ExtendedRoom>;
  loadContentPool(roomId: string, excludeIds: string[]): Promise<TMDBContent[]>;
  getAvailableGenres(mediaType: MediaType): Promise<Genre[]>;
}

export interface PriorityAlgorithm {
  prioritizeContent(
    content: TMDBContent[], 
    criteria: FilterCriteria
  ): PrioritizedContent[];
}

export interface TMDBClient {
  discoverMovies(params: DiscoverParams): Promise<TMDBContent[]>;
  discoverTV(params: DiscoverParams): Promise<TMDBContent[]>;
  getMovieGenres(): Promise<Genre[]>;
  getTVGenres(): Promise<Genre[]>;
}

export interface FilterCacheManager {
  getCachedContent(criteria: FilterCriteria): Promise<TMDBContent[] | null>;
  setCachedContent(criteria: FilterCriteria, content: TMDBContent[]): Promise<void>;
  invalidateCache(criteria: FilterCriteria): Promise<void>;
  trackShownContent(roomId: string, contentIds: string[]): Promise<void>;
}

// ============================================================================
// UI Component Props
// ============================================================================

export interface MediaTypeSelectorProps {
  onSelect: (type: MediaType) => void;
  selectedType?: MediaType;
  disabled?: boolean;
}

export interface GenreSelectorProps {
  genres: Genre[];
  maxSelection: number;
  selectedGenres: number[];
  onSelectionChange: (selected: number[]) => void;
  disabled?: boolean;
}

export interface FilterSummaryProps {
  criteria: FilterCriteria;
  estimatedCount: number;
  loading?: boolean;
}

// ============================================================================
// Validation Constants
// ============================================================================

export const CONTENT_FILTERING_CONSTANTS = {
  MAX_GENRES_PER_ROOM: 3,
  CONTENT_POOL_SIZE: 30,
  MIN_CONTENT_THRESHOLD: 5,
  CACHE_TTL_DAYS: 30,
  MAX_PAGES_TO_FETCH: 10
} as const;

// ============================================================================
// Error Types
// ============================================================================

export class ContentFilteringError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ContentFilteringError';
  }
}

export enum ErrorCodes {
  INVALID_MEDIA_TYPE = 'INVALID_MEDIA_TYPE',
  TOO_MANY_GENRES = 'TOO_MANY_GENRES',
  TMDB_API_ERROR = 'TMDB_API_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  INSUFFICIENT_CONTENT = 'INSUFFICIENT_CONTENT',
  FILTER_IMMUTABLE = 'FILTER_IMMUTABLE'
}