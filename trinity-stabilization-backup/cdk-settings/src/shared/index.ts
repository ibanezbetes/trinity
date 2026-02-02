/**
 * Shared Components Index - Extracted from MONOLITH files
 * 
 * Central export point for all shared business logic components
 * 
 * Requirements: 1.4, 3.1, 3.5
 */

// Core business logic components
export { EnhancedTMDBClient, GENRE_MAPPING } from './enhanced-tmdb-client.js';
export { ContentFilterService } from './content-filter-service.js';
export { DynamoDBService } from './dynamodb-service.js';
export { BusinessLogicFactory } from './business-logic-factory.js';

// Types and interfaces
export * from './business-logic-types.js';
export * from './types.js';

// Existing shared components
export { ConfigLoader, configLoader, ConfigUtils } from './config-loader.js';
export { createLogger } from './logger.js';
export { handleErrors, ErrorHandler, ErrorFactory } from './error-handler.js';
export { monitoring, MonitoringService, MetricTimer } from './monitoring.js';

// Re-export commonly used types for convenience
export type {
  TMDBSearchParams,
  TMDBItem,
  TMDBGenre,
  FilterCriteria,
  ValidatedContent,
  BusinessLogicDependencies
} from './business-logic-types.js';

export type {
  AppSyncEvent,
  LambdaResponse,
  TrinityRoom,
  TrinityUser,
  TrinityVote,
  TrinityMovie
} from './types.js';

// Constants
export { BUSINESS_LOGIC_CONSTANTS } from './business-logic-types.js';

// Import for internal use
import { BusinessLogicFactory } from './business-logic-factory.js';

/**
 * Quick access factory function for getting all business logic dependencies
 */
export function createBusinessLogicDependencies(apiKey?: string) {
  return BusinessLogicFactory.getInstance().getAllDependencies(apiKey);
}

/**
 * Quick access function for creating a room with 50-movie cache
 */
export function createRoomWithMovieCache(
  roomData: {
    name: string;
    mediaType: 'MOVIE' | 'TV';
    genreIds: number[];
    hostId: string;
    maxMembers: number;
  },
  apiKey?: string
) {
  return BusinessLogicFactory.getInstance().createRoomWithCache(roomData, apiKey);
}

/**
 * Quick access function for validating business logic integrity
 */
export function validateBusinessLogic(apiKey?: string) {
  return BusinessLogicFactory.getInstance().validateBusinessLogicIntegrity(apiKey);
}