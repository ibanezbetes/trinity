/**
 * Business Logic Types - Extracted from MONOLITH files
 * 
 * Shared types and interfaces for the Trinity business logic components
 * 
 * Requirements: 1.4, 3.1, 3.5
 */

import { EnhancedTMDBClient } from './enhanced-tmdb-client.js';
import { ContentFilterService } from './content-filter-service.js';
import { DynamoDBService } from './dynamodb-service.js';

export interface BusinessLogicDependencies {
  tmdbClient: EnhancedTMDBClient;
  contentFilterService: ContentFilterService;
  dynamoDBService: DynamoDBService;
}

// Re-export types from other modules for convenience
export type { TMDBSearchParams, TMDBItem, TMDBGenre } from './enhanced-tmdb-client.js';
export type { FilterCriteria, ValidatedContent } from './content-filter-service.js';
export { GENRE_MAPPING } from './enhanced-tmdb-client.js';

/**
 * Room creation criteria with business logic validation
 */
export interface RoomCreationCriteria {
  name: string;
  description?: string;
  mediaType: 'MOVIE' | 'TV';
  genreIds: number[];
  maxMembers: number;
  isPrivate?: boolean;
  roomId?: string;
}

/**
 * Content cache metadata
 */
export interface ContentCacheMetadata {
  roomId: string;
  mediaType: 'MOVIE' | 'TV';
  genreIds: number[];
  genreNames: string[];
  totalItems: number;
  createdAt: string;
  lastRefresh: string;
  businessLogicVersion: string;
}

/**
 * Business logic validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  itemsProcessed: number;
  itemsAccepted: number;
  itemsRejected: number;
}

/**
 * TMDB API configuration
 */
export interface TMDBConfig {
  apiKey: string;
  baseUrl: string;
  rateLimit: number;
  westernLanguages: string[];
  minVoteCount: number;
  includeAdult: boolean;
}

/**
 * Genre prioritization strategy
 */
export interface GenrePrioritization {
  priority1: 'BOTH_GENRES'; // AND logic
  priority2: 'ANY_GENRE';   // OR logic  
  priority3: 'POPULAR';     // No genre filter
}

/**
 * Quality gate configuration
 */
export interface QualityGateConfig {
  requireDescription: boolean;
  requirePoster: boolean;
  requireGenres: boolean;
  westernLanguagesOnly: boolean;
  excludeAdultContent: boolean;
  minOverviewLength: number;
  forbiddenDescriptions: string[];
}

/**
 * Business logic constants
 */
export const BUSINESS_LOGIC_CONSTANTS = {
  MAX_MOVIES_PER_ROOM: 50,
  MAX_GENRES_PER_ROOM: 2,
  MIN_OVERVIEW_LENGTH: 20,
  RATE_LIMIT_DELAY: 250,
  MAX_PAGES_PER_PRIORITY: 5,
  WESTERN_LANGUAGES: ['en', 'es', 'fr', 'it', 'de', 'pt'] as const,
  FORBIDDEN_DESCRIPTIONS: ['Descripción no disponible', 'Description not available'] as const,
  BUSINESS_LOGIC_VERSION: 'MONOLITH-FINAL-v1.0'
} as const;

/**
 * Error types for business logic validation
 */
export enum BusinessLogicError {
  INVALID_MEDIA_TYPE = 'INVALID_MEDIA_TYPE',
  TOO_MANY_GENRES = 'TOO_MANY_GENRES',
  MOVIE_IN_TV_ROOM = 'MOVIE_IN_TV_ROOM',
  TV_IN_MOVIE_ROOM = 'TV_IN_MOVIE_ROOM',
  NON_WESTERN_LANGUAGE = 'NON_WESTERN_LANGUAGE',
  MISSING_DESCRIPTION = 'MISSING_DESCRIPTION',
  MISSING_POSTER = 'MISSING_POSTER',
  ADULT_CONTENT = 'ADULT_CONTENT',
  INVALID_GENRE_MAPPING = 'INVALID_GENRE_MAPPING',
  TMDB_API_ERROR = 'TMDB_API_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}

/**
 * Performance metrics for business logic operations
 */
export interface BusinessLogicMetrics {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  errorType?: BusinessLogicError;
  itemsProcessed: number;
  itemsAccepted: number;
  itemsRejected: number;
  apiCallsCount: number;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Content filtering statistics
 */
export interface FilteringStats {
  totalRequested: number;
  totalFound: number;
  totalValidated: number;
  totalRejected: number;
  rejectionReasons: Record<string, number>;
  priorityDistribution: Record<number, number>;
  languageDistribution: Record<string, number>;
  genreDistribution: Record<number, number>;
}