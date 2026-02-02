/**
 * Base handler for Trinity Lambda functions
 * Provides common functionality, error handling, and logging
 */
import { AppSyncEvent, TrinityConfig, LambdaResponse } from '../shared/types';
import { TrinityDatabase } from '../shared/database';
import { ErrorContext } from '../shared/error-handler';
export declare abstract class BaseHandler {
    protected config: TrinityConfig;
    protected db: TrinityDatabase;
    constructor();
    /**
     * Logger interface that exposes only public methods
     */
    protected logger: {
        info: (message: string, context?: any) => void;
        error: (message: string, error?: Error, context?: any) => void;
        warn: (message: string, context?: any) => void;
        debug: (message: string, context?: any) => void;
    };
    /**
     * Initialize the handler with configuration and database
     */
    initialize(): Promise<void>;
    /**
     * Main handler method - to be implemented by subclasses
     */
    abstract handle(event: AppSyncEvent): Promise<any>;
    /**
     * Validate user authentication
     */
    protected validateAuth(event: AppSyncEvent): string;
    /**
     * Validate required arguments
     */
    protected validateArgs<T>(args: any, requiredFields: (keyof T)[]): T;
    /**
     * Create success response
     */
    protected success<T>(data: T, statusCode?: number): LambdaResponse<T>;
    /**
     * Create error response using centralized error handler
     */
    protected error(error: Error, context?: ErrorContext): LambdaResponse;
}
/**
 * Handler wrapper that provides common functionality
 */
export declare function createHandler<T extends BaseHandler>(HandlerClass: new () => T): (event: AppSyncEvent) => Promise<any>;
/**
 * Utility functions for common handler operations
 */
export declare const HandlerUtils: {
    /**
     * Extract GraphQL operation info
     */
    getOperationInfo: (event: AppSyncEvent) => {
        fieldName: string;
        parentTypeName: string;
        variables: Record<string, any>;
    };
    /**
     * Extract user info from event
     */
    getUserInfo: (event: AppSyncEvent) => {
        userId: string;
        username: string | undefined;
        claims: Record<string, any> | undefined;
    };
    /**
     * Validate room access
     */
    validateRoomAccess: (db: TrinityDatabase, userId: string, roomId: string, config: TrinityConfig) => Promise<boolean>;
    /**
     * Check if user is room host
     */
    isRoomHost: (db: TrinityDatabase, userId: string, roomId: string, config: TrinityConfig) => Promise<boolean>;
    /**
     * Get active room members count
     */
    getActiveRoomMembersCount: (db: TrinityDatabase, roomId: string, config: TrinityConfig) => Promise<number>;
    /**
     * Generate unique ID
     */
    generateId: () => string;
    /**
     * Calculate TTL timestamp
     */
    calculateTTL: (days: number) => number;
    /**
     * Validate movie ID format
     */
    isValidMovieId: (movieId: string) => boolean;
    /**
     * Validate room capacity
     */
    isValidRoomCapacity: (capacity: number) => boolean;
    /**
     * Sanitize string input
     */
    sanitizeString: (input: string, maxLength?: number) => string;
};
