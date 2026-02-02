/**
 * Centralized error handling system for Trinity Lambda functions
 * Provides error classification, logging, and response formatting
 */

import { TrinityError, ValidationError, NotFoundError, UnauthorizedError, ConflictError } from './types';
import { logger, LogUtils } from './logger';

export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  DATABASE = 'DATABASE',
  INTERNAL = 'INTERNAL',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT = 'TIMEOUT',
}

export interface ErrorContext {
  userId?: string;
  roomId?: string;
  movieId?: string;
  operation?: string;
  requestId?: string;
  [key: string]: any;
}

export interface ErrorResponse {
  error: string;
  code: string;
  category: ErrorCategory;
  statusCode: number;
  details?: any;
  timestamp: string;
  requestId?: string;
}

export class ErrorHandler {
  /**
   * Classify error into appropriate category
   */
  static classifyError(error: Error): ErrorCategory {
    if (error instanceof ValidationError) {
      return ErrorCategory.VALIDATION;
    }
    
    if (error instanceof UnauthorizedError) {
      return ErrorCategory.AUTHENTICATION;
    }
    
    if (error instanceof NotFoundError) {
      return ErrorCategory.NOT_FOUND;
    }
    
    if (error instanceof ConflictError) {
      return ErrorCategory.CONFLICT;
    }
    
    if (error instanceof TrinityError) {
      // Classify based on error code
      switch (error.code) {
        case 'TMDB_ERROR':
        case 'EXTERNAL_API_ERROR':
          return ErrorCategory.EXTERNAL_SERVICE;
        case 'DATABASE_ERROR':
          return ErrorCategory.DATABASE;
        case 'TIMEOUT_ERROR':
          return ErrorCategory.TIMEOUT;
        case 'RATE_LIMIT_ERROR':
          return ErrorCategory.RATE_LIMIT;
        default:
          return ErrorCategory.INTERNAL;
      }
    }
    
    // Check error message for common patterns
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout')) {
      return ErrorCategory.TIMEOUT;
    }
    
    if (message.includes('rate limit') || message.includes('throttle')) {
      return ErrorCategory.RATE_LIMIT;
    }
    
    if (message.includes('unauthorized') || message.includes('forbidden')) {
      return ErrorCategory.AUTHORIZATION;
    }
    
    if (message.includes('not found')) {
      return ErrorCategory.NOT_FOUND;
    }
    
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorCategory.VALIDATION;
    }
    
    return ErrorCategory.INTERNAL;
  }

  /**
   * Get appropriate HTTP status code for error
   */
  static getStatusCode(error: Error, category: ErrorCategory): number {
    if (error instanceof TrinityError) {
      return error.statusCode;
    }
    
    switch (category) {
      case ErrorCategory.VALIDATION:
        return 400;
      case ErrorCategory.AUTHENTICATION:
        return 401;
      case ErrorCategory.AUTHORIZATION:
        return 403;
      case ErrorCategory.NOT_FOUND:
        return 404;
      case ErrorCategory.CONFLICT:
        return 409;
      case ErrorCategory.RATE_LIMIT:
        return 429;
      case ErrorCategory.TIMEOUT:
        return 504;
      case ErrorCategory.EXTERNAL_SERVICE:
        return 502;
      case ErrorCategory.DATABASE:
      case ErrorCategory.INTERNAL:
      default:
        return 500;
    }
  }

  /**
   * Create standardized error response
   */
  static createErrorResponse(
    error: Error, 
    context: ErrorContext = {}
  ): ErrorResponse {
    const category = this.classifyError(error);
    const statusCode = this.getStatusCode(error, category);
    
    const response: ErrorResponse = {
      error: this.sanitizeErrorMessage(error.message, category),
      code: error instanceof TrinityError ? error.code : 'INTERNAL_ERROR',
      category,
      statusCode,
      timestamp: new Date().toISOString(),
      requestId: context.requestId,
    };
    
    // Add details for non-production environments or specific error types
    if (this.shouldIncludeDetails(error, category)) {
      response.details = error instanceof TrinityError ? error.details : undefined;
    }
    
    return response;
  }

  /**
   * Log error with appropriate level and context
   */
  static logError(
    error: Error, 
    context: ErrorContext = {},
    operation?: string
  ): void {
    const category = this.classifyError(error);
    const statusCode = this.getStatusCode(error, category);
    
    // Determine log level based on error category
    const logLevel = this.getLogLevel(category, statusCode);
    
    const logContext = {
      ...context,
      operation,
      errorCategory: category,
      statusCode,
    };
    
    const message = `${category} Error: ${error.message}`;
    
    switch (logLevel) {
      case 'error':
        logger.error(message, error, logContext);
        break;
      case 'warn':
        logger.warn(message, logContext);
        break;
      case 'info':
        logger.info(message, logContext);
        break;
      default:
        logger.debug(message, logContext);
    }
    
    // Log business metrics for error tracking
    logger.logBusinessMetric(
      `error.${category.toLowerCase()}`,
      1,
      'Count',
      logContext
    );
  }

  /**
   * Handle error with logging and response creation
   */
  static handleError(
    error: Error,
    context: ErrorContext = {},
    operation?: string
  ): ErrorResponse {
    // Log the error
    this.logError(error, context, operation);
    
    // Create response
    return this.createErrorResponse(error, context);
  }

  /**
   * Wrap async function with error handling
   */
  static wrapAsync<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    context: ErrorContext = {},
    operation?: string
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        const errorResponse = this.handleError(error as Error, context, operation);
        
        // Re-throw as TrinityError for consistent handling
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
   * Create retry wrapper for operations that might fail temporarily
   */
  static withRetry<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    options: {
      maxRetries?: number;
      baseDelay?: number;
      maxDelay?: number;
      retryableCategories?: ErrorCategory[];
    } = {}
  ): (...args: T) => Promise<R> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      retryableCategories = [
        ErrorCategory.EXTERNAL_SERVICE,
        ErrorCategory.TIMEOUT,
        ErrorCategory.RATE_LIMIT,
      ],
    } = options;

    return async (...args: T): Promise<R> => {
      let lastError: Error;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn(...args);
        } catch (error) {
          lastError = error as Error;
          
          // Don't retry on last attempt
          if (attempt === maxRetries) {
            break;
          }
          
          // Check if error is retryable
          const category = this.classifyError(lastError);
          if (!retryableCategories.includes(category)) {
            break;
          }
          
          // Calculate delay with exponential backoff
          const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
          
          logger.warn(`Retrying operation after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, {
            error: lastError.message,
            category,
            attempt: attempt + 1,
            maxRetries,
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      throw lastError!;
    };
  }

  /**
   * Sanitize error message for client consumption
   */
  private static sanitizeErrorMessage(message: string, category: ErrorCategory): string {
    // For internal errors, provide generic message to avoid information leakage
    if (category === ErrorCategory.INTERNAL || category === ErrorCategory.DATABASE) {
      return 'An internal error occurred. Please try again later.';
    }
    
    // For external service errors, provide generic message
    if (category === ErrorCategory.EXTERNAL_SERVICE) {
      return 'External service temporarily unavailable. Please try again later.';
    }
    
    // For other errors, return the original message (it's safe for client consumption)
    return message;
  }

  /**
   * Determine if error details should be included in response
   */
  private static shouldIncludeDetails(error: Error, category: ErrorCategory): boolean {
    // Always include details for validation errors
    if (category === ErrorCategory.VALIDATION) {
      return true;
    }
    
    // Include details for TrinityError with details
    if (error instanceof TrinityError && error.details) {
      return true;
    }
    
    // Don't include details for internal errors in production
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && (category === ErrorCategory.INTERNAL || category === ErrorCategory.DATABASE)) {
      return false;
    }
    
    return false;
  }

  /**
   * Determine appropriate log level for error
   */
  private static getLogLevel(category: ErrorCategory, statusCode: number): string {
    // Client errors (4xx) are usually warnings
    if (statusCode >= 400 && statusCode < 500) {
      switch (category) {
        case ErrorCategory.VALIDATION:
        case ErrorCategory.NOT_FOUND:
          return 'info'; // These are expected in normal operation
        case ErrorCategory.AUTHENTICATION:
        case ErrorCategory.AUTHORIZATION:
          return 'warn'; // These might indicate security issues
        default:
          return 'warn';
      }
    }
    
    // Server errors (5xx) are errors
    if (statusCode >= 500) {
      return 'error';
    }
    
    return 'info';
  }
}

/**
 * Decorator for automatic error handling
 */
export function handleErrors(
  context: ErrorContext = {},
  operation?: string
) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      try {
        return await method.apply(this, args);
      } catch (error) {
        const errorResponse = ErrorHandler.handleError(
          error as Error,
          { ...context, operation: operation || propertyName }
        );
        
        throw new TrinityError(
          errorResponse.error,
          errorResponse.code,
          errorResponse.statusCode,
          errorResponse.details
        );
      }
    };
    
    return descriptor;
  };
}

/**
 * Common error factory functions
 */
export const ErrorFactory = {
  validation: (message: string, details?: any) => 
    new ValidationError(message, details),
    
  notFound: (resource: string, id?: string) => 
    new NotFoundError(resource, id),
    
  unauthorized: (message?: string) => 
    new UnauthorizedError(message),
    
  conflict: (message: string, details?: any) => 
    new ConflictError(message, details),
    
  external: (service: string, message: string, details?: any) => 
    new TrinityError(`${service} error: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502, details),
    
  database: (operation: string, details?: any) => 
    new TrinityError(`Database ${operation} failed`, 'DATABASE_ERROR', 500, details),
    
  timeout: (operation: string, timeoutMs: number) => 
    new TrinityError(`${operation} timed out after ${timeoutMs}ms`, 'TIMEOUT_ERROR', 504),
    
  rateLimit: (message: string = 'Rate limit exceeded') => 
    new TrinityError(message, 'RATE_LIMIT_ERROR', 429),
};

export { ErrorHandler as default };