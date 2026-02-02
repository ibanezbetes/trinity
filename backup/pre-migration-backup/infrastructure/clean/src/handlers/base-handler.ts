/**
 * Base handler for Trinity Lambda functions
 * Provides common functionality, error handling, and logging
 */

import { AppSyncEvent, TrinityConfig, TrinityError, LambdaResponse } from '../shared/types';
import { logger, LogUtils, PerformanceTimer, createLogger } from '../shared/logger';
import { getTrinityConfig } from '../shared/config';
import { createDatabase, TrinityDatabase } from '../shared/database';
import { ErrorHandler, ErrorContext } from '../shared/error-handler';

export abstract class BaseHandler {
  protected config: TrinityConfig;
  protected db: TrinityDatabase;

  constructor() {
    // Initialize will be called by the handler wrapper
  }

  /**
   * Logger interface that exposes only public methods
   */
  protected logger = {
    info: (message: string, context?: any) => logger.info(message, context),
    error: (message: string, error?: Error, context?: any) => logger.error(message, error, context),
    warn: (message: string, context?: any) => logger.warn(message, context),
    debug: (message: string, context?: any) => logger.debug(message, context),
  };

  /**
   * Initialize the handler with configuration and database
   */
  public async initialize(): Promise<void> {
    if (!this.config) {
      this.config = await getTrinityConfig();
      this.db = await createDatabase(this.config);
      
      // Update logger context with function name
      // Logger context is managed globally
    }
  }

  /**
   * Main handler method - to be implemented by subclasses
   */
  abstract handle(event: AppSyncEvent): Promise<any>;

  /**
   * Validate user authentication
   */
  protected validateAuth(event: AppSyncEvent): string {
    if (!event.identity?.sub) {
      throw new TrinityError('User not authenticated', 'UNAUTHORIZED', 401);
    }
    return event.identity.sub;
  }

  /**
   * Validate required arguments
   */
  protected validateArgs<T>(args: any, requiredFields: (keyof T)[]): T {
    const missing = requiredFields.filter(field => !args[field]);
    if (missing.length > 0) {
      throw new TrinityError(
        `Missing required arguments: ${missing.join(', ')}`,
        'VALIDATION_ERROR',
        400,
        { missing }
      );
    }
    return args as T;
  }

  /**
   * Create success response
   */
  protected success<T>(data: T, statusCode: number = 200): LambdaResponse<T> {
    return {
      statusCode,
      body: JSON.stringify(data),
      data,
    };
  }

  /**
   * Create error response using centralized error handler
   */
  protected error(error: Error, context: ErrorContext = {}): LambdaResponse {
    const errorResponse = ErrorHandler.createErrorResponse(error, context);
    
    return {
      statusCode: errorResponse.statusCode,
      body: JSON.stringify({
        error: errorResponse.error,
        code: errorResponse.code,
        category: errorResponse.category,
        details: errorResponse.details,
        timestamp: errorResponse.timestamp,
      }),
    };
  }
}

/**
 * Handler wrapper that provides common functionality
 */
export function createHandler<T extends BaseHandler>(HandlerClass: new () => T) {
  return async (event: AppSyncEvent): Promise<any> => {
    const timer = new PerformanceTimer('LambdaHandler', logger);
    const handlerInstance = new HandlerClass();

    try {
      // Log function start
      LogUtils.logFunctionStart(
        process.env.AWS_LAMBDA_FUNCTION_NAME || 'UnknownFunction',
        event,
        { userId: event.identity?.sub }
      );

      // Initialize handler
      await handlerInstance.initialize();

      // Execute handler
      const result = await handlerInstance.handle(event);

      // Log function end
      LogUtils.logFunctionEnd(
        process.env.AWS_LAMBDA_FUNCTION_NAME || 'UnknownFunction',
        result,
        { userId: event.identity?.sub }
      );

      timer.finish(true);
      return result;

    } catch (error) {
      const errorContext: ErrorContext = {
        userId: event.identity?.sub,
        operation: event.info?.fieldName,
        requestId: process.env.AWS_REQUEST_ID,
      };

      // Use centralized error handling
      ErrorHandler.logError(error as Error, errorContext, process.env.AWS_LAMBDA_FUNCTION_NAME);

      timer.finishWithError(error as Error);

      // Return GraphQL-compatible error
      if (error instanceof TrinityError) {
        throw error;
      }

      // Use error handler to create consistent error response
      const errorResponse = ErrorHandler.createErrorResponse(error as Error, errorContext);
      
      throw new TrinityError(
        errorResponse.error,
        errorResponse.code,
        errorResponse.statusCode,
        errorResponse.details
      );
    }
  };
}

/**
 * Utility functions for common handler operations
 */
export const HandlerUtils = {
  /**
   * Extract GraphQL operation info
   */
  getOperationInfo: (event: AppSyncEvent) => ({
    fieldName: event.info?.fieldName,
    parentTypeName: event.info?.parentTypeName,
    variables: event.info?.variables,
  }),

  /**
   * Extract user info from event
   */
  getUserInfo: (event: AppSyncEvent) => ({
    userId: event.identity?.sub,
    username: event.identity?.username,
    claims: event.identity?.claims,
  }),

  /**
   * Validate room access
   */
  validateRoomAccess: async (
    db: TrinityDatabase,
    userId: string,
    roomId: string,
    config: TrinityConfig
  ): Promise<boolean> => {
    try {
      const member = await db.get(
        config.tables.roomMembers,
        { roomId, userId }
      );
      
      return member && member.isActive;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('❌ Failed to validate room access', err, { userId, roomId });
      return false;
    }
  },

  /**
   * Check if user is room host
   */
  isRoomHost: async (
    db: TrinityDatabase,
    userId: string,
    roomId: string,
    config: TrinityConfig
  ): Promise<boolean> => {
    try {
      const room = await db.get(
        config.tables.rooms,
        { PK: roomId, SK: 'ROOM' }
      );
      
      return room && room.hostId === userId;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('❌ Failed to check room host', err, { userId, roomId });
      return false;
    }
  },

  /**
   * Get active room members count
   */
  getActiveRoomMembersCount: async (
    db: TrinityDatabase,
    roomId: string,
    config: TrinityConfig
  ): Promise<number> => {
    try {
      const result = await db.query(
        config.tables.roomMembers,
        'roomId = :roomId',
        {
          filterExpression: 'isActive = :active',
          expressionAttributeValues: {
            ':roomId': roomId,
            ':active': true,
          },
        }
      );
      
      return result.count;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('❌ Failed to get active room members count', err, { roomId });
      return 0;
    }
  },

  /**
   * Generate unique ID
   */
  generateId: (): string => {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  },

  /**
   * Calculate TTL timestamp
   */
  calculateTTL: (days: number): number => {
    return Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
  },

  /**
   * Validate movie ID format
   */
  isValidMovieId: (movieId: string): boolean => {
    return /^\d+$/.test(movieId);
  },

  /**
   * Validate room capacity
   */
  isValidRoomCapacity: (capacity: number): boolean => {
    return capacity >= 2 && capacity <= 10;
  },

  /**
   * Sanitize string input
   */
  sanitizeString: (input: string, maxLength: number = 255): string => {
    if (!input || typeof input !== 'string') return '';
    
    return input
      .trim()
      .substring(0, maxLength)
      .replace(/[<>\"'&]/g, ''); // Basic XSS protection
  },
};