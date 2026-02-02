/**
 * Shared Components Index - Extracted from MONOLITH files
 *
 * Central export point for all shared business logic components
 *
 * Requirements: 1.4, 3.1, 3.5
 */
export { EnhancedTMDBClient, GENRE_MAPPING } from './enhanced-tmdb-client.js';
export { ContentFilterService } from './content-filter-service.js';
export { DynamoDBService } from './dynamodb-service.js';
export { BusinessLogicFactory } from './business-logic-factory.js';
export * from './business-logic-types.js';
export * from './types.js';
export { ConfigLoader, configLoader, ConfigUtils } from './config-loader.js';
export { createLogger } from './logger.js';
export { handleErrors, ErrorHandler, ErrorFactory } from './error-handler.js';
export { monitoring, MonitoringService, MetricTimer } from './monitoring.js';
export type { TMDBSearchParams, TMDBItem, TMDBGenre, FilterCriteria, ValidatedContent, BusinessLogicDependencies } from './business-logic-types.js';
export type { AppSyncEvent, LambdaResponse, TrinityRoom, TrinityUser, TrinityVote, TrinityMovie } from './types.js';
export { BUSINESS_LOGIC_CONSTANTS } from './business-logic-types.js';
/**
 * Quick access factory function for getting all business logic dependencies
 */
export declare function createBusinessLogicDependencies(apiKey?: string): import("./business-logic-factory.js").BusinessLogicDependencies;
/**
 * Quick access function for creating a room with 50-movie cache
 */
export declare function createRoomWithMovieCache(roomData: {
    name: string;
    mediaType: 'MOVIE' | 'TV';
    genreIds: number[];
    hostId: string;
    maxMembers: number;
}, apiKey?: string): Promise<{
    room: any;
    movies: any[];
}>;
/**
 * Quick access function for validating business logic integrity
 */
export declare function validateBusinessLogic(apiKey?: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
}>;
