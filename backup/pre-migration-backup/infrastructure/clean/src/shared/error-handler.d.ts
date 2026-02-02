/**
 * Centralized error handling system for Trinity Lambda functions
 * Provides error classification, logging, and response formatting
 */
import { TrinityError, ValidationError, NotFoundError, UnauthorizedError, ConflictError } from './types';
export declare enum ErrorCategory {
    VALIDATION = "VALIDATION",
    AUTHENTICATION = "AUTHENTICATION",
    AUTHORIZATION = "AUTHORIZATION",
    NOT_FOUND = "NOT_FOUND",
    CONFLICT = "CONFLICT",
    EXTERNAL_SERVICE = "EXTERNAL_SERVICE",
    DATABASE = "DATABASE",
    INTERNAL = "INTERNAL",
    RATE_LIMIT = "RATE_LIMIT",
    TIMEOUT = "TIMEOUT"
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
export declare class ErrorHandler {
    /**
     * Classify error into appropriate category
     */
    static classifyError(error: Error): ErrorCategory;
    /**
     * Get appropriate HTTP status code for error
     */
    static getStatusCode(error: Error, category: ErrorCategory): number;
    /**
     * Create standardized error response
     */
    static createErrorResponse(error: Error, context?: ErrorContext): ErrorResponse;
    /**
     * Log error with appropriate level and context
     */
    static logError(error: Error, context?: ErrorContext, operation?: string): void;
    /**
     * Handle error with logging and response creation
     */
    static handleError(error: Error, context?: ErrorContext, operation?: string): ErrorResponse;
    /**
     * Wrap async function with error handling
     */
    static wrapAsync<T extends any[], R>(fn: (...args: T) => Promise<R>, context?: ErrorContext, operation?: string): (...args: T) => Promise<R>;
    /**
     * Create retry wrapper for operations that might fail temporarily
     */
    static withRetry<T extends any[], R>(fn: (...args: T) => Promise<R>, options?: {
        maxRetries?: number;
        baseDelay?: number;
        maxDelay?: number;
        retryableCategories?: ErrorCategory[];
    }): (...args: T) => Promise<R>;
    /**
     * Sanitize error message for client consumption
     */
    private static sanitizeErrorMessage;
    /**
     * Determine if error details should be included in response
     */
    private static shouldIncludeDetails;
    /**
     * Determine appropriate log level for error
     */
    private static getLogLevel;
}
/**
 * Decorator for automatic error handling
 */
export declare function handleErrors(context?: ErrorContext, operation?: string): (target: any, propertyName: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
/**
 * Common error factory functions
 */
export declare const ErrorFactory: {
    validation: (message: string, details?: any) => ValidationError;
    notFound: (resource: string, id?: string) => NotFoundError;
    unauthorized: (message?: string) => UnauthorizedError;
    conflict: (message: string, details?: any) => ConflictError;
    external: (service: string, message: string, details?: any) => TrinityError;
    database: (operation: string, details?: any) => TrinityError;
    timeout: (operation: string, timeoutMs: number) => TrinityError;
    rateLimit: (message?: string) => TrinityError;
};
export { ErrorHandler as default };
