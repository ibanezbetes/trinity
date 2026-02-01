"use strict";
/**
 * Centralized error handling system for Trinity Lambda functions
 * Provides error classification, logging, and response formatting
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = exports.ErrorFactory = exports.ErrorHandler = exports.ErrorCategory = void 0;
exports.handleErrors = handleErrors;
const types_1 = require("./types");
const logger_1 = require("./logger");
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["VALIDATION"] = "VALIDATION";
    ErrorCategory["AUTHENTICATION"] = "AUTHENTICATION";
    ErrorCategory["AUTHORIZATION"] = "AUTHORIZATION";
    ErrorCategory["NOT_FOUND"] = "NOT_FOUND";
    ErrorCategory["CONFLICT"] = "CONFLICT";
    ErrorCategory["EXTERNAL_SERVICE"] = "EXTERNAL_SERVICE";
    ErrorCategory["DATABASE"] = "DATABASE";
    ErrorCategory["INTERNAL"] = "INTERNAL";
    ErrorCategory["RATE_LIMIT"] = "RATE_LIMIT";
    ErrorCategory["TIMEOUT"] = "TIMEOUT";
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
class ErrorHandler {
    /**
     * Classify error into appropriate category
     */
    static classifyError(error) {
        if (error instanceof types_1.ValidationError) {
            return ErrorCategory.VALIDATION;
        }
        if (error instanceof types_1.UnauthorizedError) {
            return ErrorCategory.AUTHENTICATION;
        }
        if (error instanceof types_1.NotFoundError) {
            return ErrorCategory.NOT_FOUND;
        }
        if (error instanceof types_1.ConflictError) {
            return ErrorCategory.CONFLICT;
        }
        if (error instanceof types_1.TrinityError) {
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
    static getStatusCode(error, category) {
        if (error instanceof types_1.TrinityError) {
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
    static createErrorResponse(error, context = {}) {
        const category = this.classifyError(error);
        const statusCode = this.getStatusCode(error, category);
        const response = {
            error: this.sanitizeErrorMessage(error.message, category),
            code: error instanceof types_1.TrinityError ? error.code : 'INTERNAL_ERROR',
            category,
            statusCode,
            timestamp: new Date().toISOString(),
            requestId: context.requestId,
        };
        // Add details for non-production environments or specific error types
        if (this.shouldIncludeDetails(error, category)) {
            response.details = error instanceof types_1.TrinityError ? error.details : undefined;
        }
        return response;
    }
    /**
     * Log error with appropriate level and context
     */
    static logError(error, context = {}, operation) {
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
                logger_1.logger.error(message, error, logContext);
                break;
            case 'warn':
                logger_1.logger.warn(message, logContext);
                break;
            case 'info':
                logger_1.logger.info(message, logContext);
                break;
            default:
                logger_1.logger.debug(message, logContext);
        }
        // Log business metrics for error tracking
        logger_1.logger.logBusinessMetric(`error.${category.toLowerCase()}`, 1, 'Count', logContext);
    }
    /**
     * Handle error with logging and response creation
     */
    static handleError(error, context = {}, operation) {
        // Log the error
        this.logError(error, context, operation);
        // Create response
        return this.createErrorResponse(error, context);
    }
    /**
     * Wrap async function with error handling
     */
    static wrapAsync(fn, context = {}, operation) {
        return async (...args) => {
            try {
                return await fn(...args);
            }
            catch (error) {
                const errorResponse = this.handleError(error, context, operation);
                // Re-throw as TrinityError for consistent handling
                throw new types_1.TrinityError(errorResponse.error, errorResponse.code, errorResponse.statusCode, errorResponse.details);
            }
        };
    }
    /**
     * Create retry wrapper for operations that might fail temporarily
     */
    static withRetry(fn, options = {}) {
        const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, retryableCategories = [
            ErrorCategory.EXTERNAL_SERVICE,
            ErrorCategory.TIMEOUT,
            ErrorCategory.RATE_LIMIT,
        ], } = options;
        return async (...args) => {
            let lastError;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    return await fn(...args);
                }
                catch (error) {
                    lastError = error;
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
                    logger_1.logger.warn(`Retrying operation after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, {
                        error: lastError.message,
                        category,
                        attempt: attempt + 1,
                        maxRetries,
                    });
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            throw lastError;
        };
    }
    /**
     * Sanitize error message for client consumption
     */
    static sanitizeErrorMessage(message, category) {
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
    static shouldIncludeDetails(error, category) {
        // Always include details for validation errors
        if (category === ErrorCategory.VALIDATION) {
            return true;
        }
        // Include details for TrinityError with details
        if (error instanceof types_1.TrinityError && error.details) {
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
    static getLogLevel(category, statusCode) {
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
exports.ErrorHandler = ErrorHandler;
exports.default = ErrorHandler;
/**
 * Decorator for automatic error handling
 */
function handleErrors(context = {}, operation) {
    return function (target, propertyName, descriptor) {
        const method = descriptor.value;
        descriptor.value = async function (...args) {
            try {
                return await method.apply(this, args);
            }
            catch (error) {
                const errorResponse = ErrorHandler.handleError(error, { ...context, operation: operation || propertyName });
                throw new types_1.TrinityError(errorResponse.error, errorResponse.code, errorResponse.statusCode, errorResponse.details);
            }
        };
        return descriptor;
    };
}
/**
 * Common error factory functions
 */
exports.ErrorFactory = {
    validation: (message, details) => new types_1.ValidationError(message, details),
    notFound: (resource, id) => new types_1.NotFoundError(resource, id),
    unauthorized: (message) => new types_1.UnauthorizedError(message),
    conflict: (message, details) => new types_1.ConflictError(message, details),
    external: (service, message, details) => new types_1.TrinityError(`${service} error: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502, details),
    database: (operation, details) => new types_1.TrinityError(`Database ${operation} failed`, 'DATABASE_ERROR', 500, details),
    timeout: (operation, timeoutMs) => new types_1.TrinityError(`${operation} timed out after ${timeoutMs}ms`, 'TIMEOUT_ERROR', 504),
    rateLimit: (message = 'Rate limit exceeded') => new types_1.TrinityError(message, 'RATE_LIMIT_ERROR', 429),
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXJyb3ItaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVycm9yLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBMFhILG9DQStCQztBQXZaRCxtQ0FBeUc7QUFDekcscUNBQTRDO0FBRTVDLElBQVksYUFXWDtBQVhELFdBQVksYUFBYTtJQUN2QiwwQ0FBeUIsQ0FBQTtJQUN6QixrREFBaUMsQ0FBQTtJQUNqQyxnREFBK0IsQ0FBQTtJQUMvQix3Q0FBdUIsQ0FBQTtJQUN2QixzQ0FBcUIsQ0FBQTtJQUNyQixzREFBcUMsQ0FBQTtJQUNyQyxzQ0FBcUIsQ0FBQTtJQUNyQixzQ0FBcUIsQ0FBQTtJQUNyQiwwQ0FBeUIsQ0FBQTtJQUN6QixvQ0FBbUIsQ0FBQTtBQUNyQixDQUFDLEVBWFcsYUFBYSw2QkFBYixhQUFhLFFBV3hCO0FBcUJELE1BQWEsWUFBWTtJQUN2Qjs7T0FFRztJQUNILE1BQU0sQ0FBQyxhQUFhLENBQUMsS0FBWTtRQUMvQixJQUFJLEtBQUssWUFBWSx1QkFBZSxFQUFFLENBQUM7WUFDckMsT0FBTyxhQUFhLENBQUMsVUFBVSxDQUFDO1FBQ2xDLENBQUM7UUFFRCxJQUFJLEtBQUssWUFBWSx5QkFBaUIsRUFBRSxDQUFDO1lBQ3ZDLE9BQU8sYUFBYSxDQUFDLGNBQWMsQ0FBQztRQUN0QyxDQUFDO1FBRUQsSUFBSSxLQUFLLFlBQVkscUJBQWEsRUFBRSxDQUFDO1lBQ25DLE9BQU8sYUFBYSxDQUFDLFNBQVMsQ0FBQztRQUNqQyxDQUFDO1FBRUQsSUFBSSxLQUFLLFlBQVkscUJBQWEsRUFBRSxDQUFDO1lBQ25DLE9BQU8sYUFBYSxDQUFDLFFBQVEsQ0FBQztRQUNoQyxDQUFDO1FBRUQsSUFBSSxLQUFLLFlBQVksb0JBQVksRUFBRSxDQUFDO1lBQ2xDLCtCQUErQjtZQUMvQixRQUFRLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDbkIsS0FBSyxZQUFZLENBQUM7Z0JBQ2xCLEtB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QVEsRUFBRSxDQUFDLE9BQWUsRUFBRSxPQUFhLEVBQUUsRUFBRSxDQUMzQyxJQUFJLHFCQUFhLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQztJQUVyQyxRQUFRLEVBQUUsQ0FBQyxPQUFlLEVBQUUsT0FBZSxFQUFFLE9BQWEsRUFBRSxFQUFFLENBQzVELElBQUksb0JBQVksQ0FBQyxHQUFHLE9BQU8sV0FBVyxPQUFPLEVBQUUsRUFBRSx3QkFBd0IsRUFBRSxHQUFHLEVBQUUsT0FBTyxDQUFDO0lBRTFGLFFBQVEsRUFBRSxDQUFDLFNBQWlCLEVBQUUsT0FBYSxFQUFFLEVBQUUsQ0FDN0MsSUFBSSxvQkFBWSxDQUFDLFlBQVksU0FBUyxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFLE9BQU8sQ0FBQztJQUVsRixPQUFPLEVBQUUsQ0FBQyxTQUFpQixFQUFFLFNBQWlCLEVBQUUsRUFBRSxDQUNoRCxJQUFJLG9CQUFZLENBQUMsR0FBRyxTQUFTLG9CQUFvQixTQUFTLElBQUksRUFBRSxlQUFlLEVBQUUsR0FBRyxDQUFDO0lBRXZGLFNBQVMsRUFBRSxDQUFDLFVBQWtCLHFCQUFxQixFQUFFLEVBQUUsQ0FDckQsSUFBSSxvQkFBWSxDQUFDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxHQUFHLENBQUM7Q0FDckQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBDZW50cmFsaXplZCBlcnJvciBoYW5kbGluZyBzeXN0ZW0gZm9yIFRyaW5pdHkgTGFtYmRhIGZ1bmN0aW9uc1xyXG4gKiBQcm92aWRlcyBlcnJvciBjbGFzc2lmaWNhdGlvbiwgbG9nZ2luZywgYW5kIHJlc3BvbnNlIGZvcm1hdHRpbmdcclxuICovXHJcblxyXG5pbXBvcnQgeyBUcmluaXR5RXJyb3IsIFZhbGlkYXRpb25FcnJvciwgTm90Rm91bmRFcnJvciwgVW5hdXRob3JpemVkRXJyb3IsIENvbmZsaWN0RXJyb3IgfSBmcm9tICcuL3R5cGVzJztcclxuaW1wb3J0IHsgbG9nZ2VyLCBMb2dVdGlscyB9IGZyb20gJy4vbG9nZ2VyJztcclxuXHJcbmV4cG9ydCBlbnVtIEVycm9yQ2F0ZWdvcnkge1xyXG4gIFZBTElEQVRJT04gPSAnVkFMSURBVElPTicsXHJcbiAgQVVUSEVOVElDQVRJT04gPSAnQVVUSEVOVElDQVRJT04nLFxyXG4gIEFVVEhPUklaQVRJT04gPSAnQVVUSE9SSVpBVElPTicsXHJcbiAgTk9UX0ZPVU5EID0gJ05PVF9GT1VORCcsXHJcbiAgQ09ORkxJQ1QgPSAnQ09ORkxJQ1QnLFxyXG4gIEVYVEVSTkFMX1NFUlZJQ0UgPSAnRVhURVJOQUxfU0VSVklDRScsXHJcbiAgREFUQUJBU0UgPSAnREFUQUJBU0UnLFxyXG4gIElOVEVSTkFMID0gJ0lOVEVSTkFMJyxcclxuICBSQVRFX0xJTUlUID0gJ1JBVEVfTElNSVQnLFxyXG4gIFRJTUVPVVQgPSAnVElNRU9VVCcsXHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRXJyb3JDb250ZXh0IHtcclxuICB1c2VySWQ/OiBzdHJpbmc7XHJcbiAgcm9vbUlkPzogc3RyaW5nO1xyXG4gIG1vdmllSWQ/OiBzdHJpbmc7XHJcbiAgb3BlcmF0aW9uPzogc3RyaW5nO1xyXG4gIHJlcXVlc3RJZD86IHN0cmluZztcclxuICBba2V5OiBzdHJpbmddOiBhbnk7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRXJyb3JSZXNwb25zZSB7XHJcbiAgZXJyb3I6IHN0cmluZztcclxuICBjb2RlOiBzdHJpbmc7XHJcbiAgY2F0ZWdvcnk6IEVycm9yQ2F0ZWdvcnk7XHJcbiAgc3RhdHVzQ29kZTogbnVtYmVyO1xyXG4gIGRldGFpbHM/OiBhbnk7XHJcbiAgdGltZXN0YW1wOiBzdHJpbmc7XHJcbiAgcmVxdWVzdElkPzogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRXJyb3JIYW5kbGVyIHtcclxuICAvKipcclxuICAgKiBDbGFzc2lmeSBlcnJvciBpbnRvIGFwcHJvcHJpYXRlIGNhdGVnb3J5XHJcbiAgICovXHJcbiAgc3RhdGljIGNsYXNzaWZ5RXJyb3IoZXJyb3I6IEVycm9yKTogRXJyb3JDYXRlZ29yeSB7XHJcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBWYWxpZGF0aW9uRXJyb3IpIHtcclxuICAgICAgcmV0dXJuIEVycm9yQ2F0ZWdvcnkuVkFMSURBVElPTjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgVW5hdXRob3JpemVkRXJyb3IpIHtcclxuICAgICAgcmV0dXJuIEVycm9yQ2F0ZWdvcnkuQVVUSEVOVElDQVRJT047XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIE5vdEZvdW5kRXJyb3IpIHtcclxuICAgICAgcmV0dXJuIEVycm9yQ2F0ZWdvcnkuTk9UX0ZPVU5EO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBDb25mbGljdEVycm9yKSB7XHJcbiAgICAgIHJldHVybiBFcnJvckNhdGVnb3J5LkNPTkZMSUNUO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBUcmluaXR5RXJyb3IpIHtcclxuICAgICAgLy8gQ2xhc3NpZnkgYmFzZWQgb24gZXJyb3IgY29kZVxyXG4gICAgICBzd2l0Y2ggKGVycm9yLmNvZGUpIHtcclxuICAgICAgICBjYXNlICdUTURCX0VSUk9SJzpcclxuICAgICAgICBjYXNlICdFWFRFUk5BTF9BUElfRVJST1InOlxyXG4gICAgICAgICAgcmV0dXJuIEVycm9yQ2F0ZWdvcnkuRVhURVJOQUxfU0VSVklDRTtcclxuICAgICAgICBjYXNlICdEQVRBQkFTRV9FUlJPUic6XHJcbiAgICAgICAgICByZXR1cm4gRXJyb3JDYXRlZ29yeS5EQVRBQkFTRTtcclxuICAgICAgICBjYXNlICdUSU1FT1VUX0VSUk9SJzpcclxuICAgICAgICAgIHJldHVybiBFcnJvckNhdGVnb3J5LlRJTUVPVVQ7XHJcbiAgICAgICAgY2FzZSAnUkFURV9MSU1JVF9FUlJPUic6XHJcbiAgICAgICAgICByZXR1cm4gRXJyb3JDYXRlZ29yeS5SQVRFX0xJTUlUO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICByZXR1cm4gRXJyb3JDYXRlZ29yeS5JTlRFUk5BTDtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDaGVjayBlcnJvciBtZXNzYWdlIGZvciBjb21tb24gcGF0dGVybnNcclxuICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvci5tZXNzYWdlLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBcclxuICAgIGlmIChtZXNzYWdlLmluY2x1ZGVzKCd0aW1lb3V0JykpIHtcclxuICAgICAgcmV0dXJuIEVycm9yQ2F0ZWdvcnkuVElNRU9VVDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKG1lc3NhZ2UuaW5jbHVkZXMoJ3JhdGUgbGltaXQnKSB8fCBtZXNzYWdlLmluY2x1ZGVzKCd0aHJvdHRsZScpKSB7XHJcbiAgICAgIHJldHVybiBFcnJvckNhdGVnb3J5LlJBVEVfTElNSVQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChtZXNzYWdlLmluY2x1ZGVzKCd1bmF1dGhvcml6ZWQnKSB8fCBtZXNzYWdlLmluY2x1ZGVzKCdmb3JiaWRkZW4nKSkge1xyXG4gICAgICByZXR1cm4gRXJyb3JDYXRlZ29yeS5BVVRIT1JJWkFUSU9OO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAobWVzc2FnZS5pbmNsdWRlcygnbm90IGZvdW5kJykpIHtcclxuICAgICAgcmV0dXJuIEVycm9yQ2F0ZWdvcnkuTk9UX0ZPVU5EO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAobWVzc2FnZS5pbmNsdWRlcygndmFsaWRhdGlvbicpIHx8IG1lc3NhZ2UuaW5jbHVkZXMoJ2ludmFsaWQnKSkge1xyXG4gICAgICByZXR1cm4gRXJyb3JDYXRlZ29yeS5WQUxJREFUSU9OO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gRXJyb3JDYXRlZ29yeS5JTlRFUk5BTDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBhcHByb3ByaWF0ZSBIVFRQIHN0YXR1cyBjb2RlIGZvciBlcnJvclxyXG4gICAqL1xyXG4gIHN0YXRpYyBnZXRTdGF0dXNDb2RlKGVycm9yOiBFcnJvciwgY2F0ZWdvcnk6IEVycm9yQ2F0ZWdvcnkpOiBudW1iZXIge1xyXG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgVHJpbml0eUVycm9yKSB7XHJcbiAgICAgIHJldHVybiBlcnJvci5zdGF0dXNDb2RlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBzd2l0Y2ggKGNhdGVnb3J5KSB7XHJcbiAgICAgIGNhc2UgRXJyb3JDYXRlZ29yeS5WQUxJREFUSU9OOlxyXG4gICAgICAgIHJldHVybiA0MDA7XHJcbiAgICAgIGNhc2UgRXJyb3JDYXRlZ29yeS5BVVRIRU5USUNBVElPTjpcclxuICAgICAgICByZXR1cm4gNDAxO1xyXG4gICAgICBjYXNlIEVycm9yQ2F0ZWdvcnkuQVVUSE9SSVpBVElPTjpcclxuICAgICAgICByZXR1cm4gNDAzO1xyXG4gICAgICBjYXNlIEVycm9yQ2F0ZWdvcnkuTk9UX0ZPVU5EOlxyXG4gICAgICAgIHJldHVybiA0MDQ7XHJcbiAgICAgIGNhc2UgRXJyb3JDYXRlZ29yeS5DT05GTElDVDpcclxuICAgICAgICByZXR1cm4gNDA5O1xyXG4gICAgICBjYXNlIEVycm9yQ2F0ZWdvcnkuUkFURV9MSU1JVDpcclxuICAgICAgICByZXR1cm4gNDI5O1xyXG4gICAgICBjYXNlIEVycm9yQ2F0ZWdvcnkuVElNRU9VVDpcclxuICAgICAgICByZXR1cm4gNTA0O1xyXG4gICAgICBjYXNlIEVycm9yQ2F0ZWdvcnkuRVhURVJOQUxfU0VSVklDRTpcclxuICAgICAgICByZXR1cm4gNTAyO1xyXG4gICAgICBjYXNlIEVycm9yQ2F0ZWdvcnkuREFUQUJBU0U6XHJcbiAgICAgIGNhc2UgRXJyb3JDYXRlZ29yeS5JTlRFUk5BTDpcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICByZXR1cm4gNTAwO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIHN0YW5kYXJkaXplZCBlcnJvciByZXNwb25zZVxyXG4gICAqL1xyXG4gIHN0YXRpYyBjcmVhdGVFcnJvclJlc3BvbnNlKFxyXG4gICAgZXJyb3I6IEVycm9yLCBcclxuICAgIGNvbnRleHQ6IEVycm9yQ29udGV4dCA9IHt9XHJcbiAgKTogRXJyb3JSZXNwb25zZSB7XHJcbiAgICBjb25zdCBjYXRlZ29yeSA9IHRoaXMuY2xhc3NpZnlFcnJvcihlcnJvcik7XHJcbiAgICBjb25zdCBzdGF0dXNDb2RlID0gdGhpcy5nZXRTdGF0dXNDb2RlKGVycm9yLCBjYXRlZ29yeSk7XHJcbiAgICBcclxuICAgIGNvbnN0IHJlc3BvbnNlOiBFcnJvclJlc3BvbnNlID0ge1xyXG4gICAgICBlcnJvcjogdGhpcy5zYW5pdGl6ZUVycm9yTWVzc2FnZShlcnJvci5tZXNzYWdlLCBjYXRlZ29yeSksXHJcbiAgICAgIGNvZGU6IGVycm9yIGluc3RhbmNlb2YgVHJpbml0eUVycm9yID8gZXJyb3IuY29kZSA6ICdJTlRFUk5BTF9FUlJPUicsXHJcbiAgICAgIGNhdGVnb3J5LFxyXG4gICAgICBzdGF0dXNDb2RlLFxyXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgcmVxdWVzdElkOiBjb250ZXh0LnJlcXVlc3RJZCxcclxuICAgIH07XHJcbiAgICBcclxuICAgIC8vIEFkZCBkZXRhaWxzIGZvciBub24tcHJvZHVjdGlvbiBlbnZpcm9ubWVudHMgb3Igc3BlY2lmaWMgZXJyb3IgdHlwZXNcclxuICAgIGlmICh0aGlzLnNob3VsZEluY2x1ZGVEZXRhaWxzKGVycm9yLCBjYXRlZ29yeSkpIHtcclxuICAgICAgcmVzcG9uc2UuZGV0YWlscyA9IGVycm9yIGluc3RhbmNlb2YgVHJpbml0eUVycm9yID8gZXJyb3IuZGV0YWlscyA6IHVuZGVmaW5lZDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHJlc3BvbnNlO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogTG9nIGVycm9yIHdpdGggYXBwcm9wcmlhdGUgbGV2ZWwgYW5kIGNvbnRleHRcclxuICAgKi9cclxuICBzdGF0aWMgbG9nRXJyb3IoXHJcbiAgICBlcnJvcjogRXJyb3IsIFxyXG4gICAgY29udGV4dDogRXJyb3JDb250ZXh0ID0ge30sXHJcbiAgICBvcGVyYXRpb24/OiBzdHJpbmdcclxuICApOiB2b2lkIHtcclxuICAgIGNvbnN0IGNhdGVnb3J5ID0gdGhpcy5jbGFzc2lmeUVycm9yKGVycm9yKTtcclxuICAgIGNvbnN0IHN0YXR1c0NvZGUgPSB0aGlzLmdldFN0YXR1c0NvZGUoZXJyb3IsIGNhdGVnb3J5KTtcclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIGxvZyBsZXZlbCBiYXNlZCBvbiBlcnJvciBjYXRlZ29yeVxyXG4gICAgY29uc3QgbG9nTGV2ZWwgPSB0aGlzLmdldExvZ0xldmVsKGNhdGVnb3J5LCBzdGF0dXNDb2RlKTtcclxuICAgIFxyXG4gICAgY29uc3QgbG9nQ29udGV4dCA9IHtcclxuICAgICAgLi4uY29udGV4dCxcclxuICAgICAgb3BlcmF0aW9uLFxyXG4gICAgICBlcnJvckNhdGVnb3J5OiBjYXRlZ29yeSxcclxuICAgICAgc3RhdHVzQ29kZSxcclxuICAgIH07XHJcbiAgICBcclxuICAgIGNvbnN0IG1lc3NhZ2UgPSBgJHtjYXRlZ29yeX0gRXJyb3I6ICR7ZXJyb3IubWVzc2FnZX1gO1xyXG4gICAgXHJcbiAgICBzd2l0Y2ggKGxvZ0xldmVsKSB7XHJcbiAgICAgIGNhc2UgJ2Vycm9yJzpcclxuICAgICAgICBsb2dnZXIuZXJyb3IobWVzc2FnZSwgZXJyb3IsIGxvZ0NvbnRleHQpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICd3YXJuJzpcclxuICAgICAgICBsb2dnZXIud2FybihtZXNzYWdlLCBsb2dDb250ZXh0KTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAnaW5mbyc6XHJcbiAgICAgICAgbG9nZ2VyLmluZm8obWVzc2FnZSwgbG9nQ29udGV4dCk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgbG9nZ2VyLmRlYnVnKG1lc3NhZ2UsIGxvZ0NvbnRleHQpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljcyBmb3IgZXJyb3IgdHJhY2tpbmdcclxuICAgIGxvZ2dlci5sb2dCdXNpbmVzc01ldHJpYyhcclxuICAgICAgYGVycm9yLiR7Y2F0ZWdvcnkudG9Mb3dlckNhc2UoKX1gLFxyXG4gICAgICAxLFxyXG4gICAgICAnQ291bnQnLFxyXG4gICAgICBsb2dDb250ZXh0XHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSGFuZGxlIGVycm9yIHdpdGggbG9nZ2luZyBhbmQgcmVzcG9uc2UgY3JlYXRpb25cclxuICAgKi9cclxuICBzdGF0aWMgaGFuZGxlRXJyb3IoXHJcbiAgICBlcnJvcjogRXJyb3IsXHJcbiAgICBjb250ZXh0OiBFcnJvckNvbnRleHQgPSB7fSxcclxuICAgIG9wZXJhdGlvbj86IHN0cmluZ1xyXG4gICk6IEVycm9yUmVzcG9uc2Uge1xyXG4gICAgLy8gTG9nIHRoZSBlcnJvclxyXG4gICAgdGhpcy5sb2dFcnJvcihlcnJvciwgY29udGV4dCwgb3BlcmF0aW9uKTtcclxuICAgIFxyXG4gICAgLy8gQ3JlYXRlIHJlc3BvbnNlXHJcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVFcnJvclJlc3BvbnNlKGVycm9yLCBjb250ZXh0KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFdyYXAgYXN5bmMgZnVuY3Rpb24gd2l0aCBlcnJvciBoYW5kbGluZ1xyXG4gICAqL1xyXG4gIHN0YXRpYyB3cmFwQXN5bmM8VCBleHRlbmRzIGFueVtdLCBSPihcclxuICAgIGZuOiAoLi4uYXJnczogVCkgPT4gUHJvbWlzZTxSPixcclxuICAgIGNvbnRleHQ6IEVycm9yQ29udGV4dCA9IHt9LFxyXG4gICAgb3BlcmF0aW9uPzogc3RyaW5nXHJcbiAgKTogKC4uLmFyZ3M6IFQpID0+IFByb21pc2U8Uj4ge1xyXG4gICAgcmV0dXJuIGFzeW5jICguLi5hcmdzOiBUKTogUHJvbWlzZTxSPiA9PiB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGZuKC4uLmFyZ3MpO1xyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnN0IGVycm9yUmVzcG9uc2UgPSB0aGlzLmhhbmRsZUVycm9yKGVycm9yIGFzIEVycm9yLCBjb250ZXh0LCBvcGVyYXRpb24pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFJlLXRocm93IGFzIFRyaW5pdHlFcnJvciBmb3IgY29uc2lzdGVudCBoYW5kbGluZ1xyXG4gICAgICAgIHRocm93IG5ldyBUcmluaXR5RXJyb3IoXHJcbiAgICAgICAgICBlcnJvclJlc3BvbnNlLmVycm9yLFxyXG4gICAgICAgICAgZXJyb3JSZXNwb25zZS5jb2RlLFxyXG4gICAgICAgICAgZXJyb3JSZXNwb25zZS5zdGF0dXNDb2RlLFxyXG4gICAgICAgICAgZXJyb3JSZXNwb25zZS5kZXRhaWxzXHJcbiAgICAgICAgKTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSByZXRyeSB3cmFwcGVyIGZvciBvcGVyYXRpb25zIHRoYXQgbWlnaHQgZmFpbCB0ZW1wb3JhcmlseVxyXG4gICAqL1xyXG4gIHN0YXRpYyB3aXRoUmV0cnk8VCBleHRlbmRzIGFueVtdLCBSPihcclxuICAgIGZuOiAoLi4uYXJnczogVCkgPT4gUHJvbWlzZTxSPixcclxuICAgIG9wdGlvbnM6IHtcclxuICAgICAgbWF4UmV0cmllcz86IG51bWJlcjtcclxuICAgICAgYmFzZURlbGF5PzogbnVtYmVyO1xyXG4gICAgICBtYXhEZWxheT86IG51bWJlcjtcclxuICAgICAgcmV0cnlhYmxlQ2F0ZWdvcmllcz86IEVycm9yQ2F0ZWdvcnlbXTtcclxuICAgIH0gPSB7fVxyXG4gICk6ICguLi5hcmdzOiBUKSA9PiBQcm9taXNlPFI+IHtcclxuICAgIGNvbnN0IHtcclxuICAgICAgbWF4UmV0cmllcyA9IDMsXHJcbiAgICAgIGJhc2VEZWxheSA9IDEwMDAsXHJcbiAgICAgIG1heERlbGF5ID0gMTAwMDAsXHJcbiAgICAgIHJldHJ5YWJsZUNhdGVnb3JpZXMgPSBbXHJcbiAgICAgICAgRXJyb3JDYXRlZ29yeS5FWFRFUk5BTF9TRVJWSUNFLFxyXG4gICAgICAgIEVycm9yQ2F0ZWdvcnkuVElNRU9VVCxcclxuICAgICAgICBFcnJvckNhdGVnb3J5LlJBVEVfTElNSVQsXHJcbiAgICAgIF0sXHJcbiAgICB9ID0gb3B0aW9ucztcclxuXHJcbiAgICByZXR1cm4gYXN5bmMgKC4uLmFyZ3M6IFQpOiBQcm9taXNlPFI+ID0+IHtcclxuICAgICAgbGV0IGxhc3RFcnJvcjogRXJyb3I7XHJcbiAgICAgIFxyXG4gICAgICBmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8PSBtYXhSZXRyaWVzOyBhdHRlbXB0KyspIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgcmV0dXJuIGF3YWl0IGZuKC4uLmFyZ3MpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICBsYXN0RXJyb3IgPSBlcnJvciBhcyBFcnJvcjtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gRG9uJ3QgcmV0cnkgb24gbGFzdCBhdHRlbXB0XHJcbiAgICAgICAgICBpZiAoYXR0ZW1wdCA9PT0gbWF4UmV0cmllcykge1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gQ2hlY2sgaWYgZXJyb3IgaXMgcmV0cnlhYmxlXHJcbiAgICAgICAgICBjb25zdCBjYXRlZ29yeSA9IHRoaXMuY2xhc3NpZnlFcnJvcihsYXN0RXJyb3IpO1xyXG4gICAgICAgICAgaWYgKCFyZXRyeWFibGVDYXRlZ29yaWVzLmluY2x1ZGVzKGNhdGVnb3J5KSkge1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gQ2FsY3VsYXRlIGRlbGF5IHdpdGggZXhwb25lbnRpYWwgYmFja29mZlxyXG4gICAgICAgICAgY29uc3QgZGVsYXkgPSBNYXRoLm1pbihiYXNlRGVsYXkgKiBNYXRoLnBvdygyLCBhdHRlbXB0KSwgbWF4RGVsYXkpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBsb2dnZXIud2FybihgUmV0cnlpbmcgb3BlcmF0aW9uIGFmdGVyICR7ZGVsYXl9bXMgKGF0dGVtcHQgJHthdHRlbXB0ICsgMX0vJHttYXhSZXRyaWVzfSlgLCB7XHJcbiAgICAgICAgICAgIGVycm9yOiBsYXN0RXJyb3IubWVzc2FnZSxcclxuICAgICAgICAgICAgY2F0ZWdvcnksXHJcbiAgICAgICAgICAgIGF0dGVtcHQ6IGF0dGVtcHQgKyAxLFxyXG4gICAgICAgICAgICBtYXhSZXRyaWVzLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBkZWxheSkpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgdGhyb3cgbGFzdEVycm9yITtcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTYW5pdGl6ZSBlcnJvciBtZXNzYWdlIGZvciBjbGllbnQgY29uc3VtcHRpb25cclxuICAgKi9cclxuICBwcml2YXRlIHN0YXRpYyBzYW5pdGl6ZUVycm9yTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcsIGNhdGVnb3J5OiBFcnJvckNhdGVnb3J5KTogc3RyaW5nIHtcclxuICAgIC8vIEZvciBpbnRlcm5hbCBlcnJvcnMsIHByb3ZpZGUgZ2VuZXJpYyBtZXNzYWdlIHRvIGF2b2lkIGluZm9ybWF0aW9uIGxlYWthZ2VcclxuICAgIGlmIChjYXRlZ29yeSA9PT0gRXJyb3JDYXRlZ29yeS5JTlRFUk5BTCB8fCBjYXRlZ29yeSA9PT0gRXJyb3JDYXRlZ29yeS5EQVRBQkFTRSkge1xyXG4gICAgICByZXR1cm4gJ0FuIGludGVybmFsIGVycm9yIG9jY3VycmVkLiBQbGVhc2UgdHJ5IGFnYWluIGxhdGVyLic7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZvciBleHRlcm5hbCBzZXJ2aWNlIGVycm9ycywgcHJvdmlkZSBnZW5lcmljIG1lc3NhZ2VcclxuICAgIGlmIChjYXRlZ29yeSA9PT0gRXJyb3JDYXRlZ29yeS5FWFRFUk5BTF9TRVJWSUNFKSB7XHJcbiAgICAgIHJldHVybiAnRXh0ZXJuYWwgc2VydmljZSB0ZW1wb3JhcmlseSB1bmF2YWlsYWJsZS4gUGxlYXNlIHRyeSBhZ2FpbiBsYXRlci4nO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGb3Igb3RoZXIgZXJyb3JzLCByZXR1cm4gdGhlIG9yaWdpbmFsIG1lc3NhZ2UgKGl0J3Mgc2FmZSBmb3IgY2xpZW50IGNvbnN1bXB0aW9uKVxyXG4gICAgcmV0dXJuIG1lc3NhZ2U7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBEZXRlcm1pbmUgaWYgZXJyb3IgZGV0YWlscyBzaG91bGQgYmUgaW5jbHVkZWQgaW4gcmVzcG9uc2VcclxuICAgKi9cclxuICBwcml2YXRlIHN0YXRpYyBzaG91bGRJbmNsdWRlRGV0YWlscyhlcnJvcjogRXJyb3IsIGNhdGVnb3J5OiBFcnJvckNhdGVnb3J5KTogYm9vbGVhbiB7XHJcbiAgICAvLyBBbHdheXMgaW5jbHVkZSBkZXRhaWxzIGZvciB2YWxpZGF0aW9uIGVycm9yc1xyXG4gICAgaWYgKGNhdGVnb3J5ID09PSBFcnJvckNhdGVnb3J5LlZBTElEQVRJT04pIHtcclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEluY2x1ZGUgZGV0YWlscyBmb3IgVHJpbml0eUVycm9yIHdpdGggZGV0YWlsc1xyXG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgVHJpbml0eUVycm9yICYmIGVycm9yLmRldGFpbHMpIHtcclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIERvbid0IGluY2x1ZGUgZGV0YWlscyBmb3IgaW50ZXJuYWwgZXJyb3JzIGluIHByb2R1Y3Rpb25cclxuICAgIGNvbnN0IGlzUHJvZHVjdGlvbiA9IHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbic7XHJcbiAgICBpZiAoaXNQcm9kdWN0aW9uICYmIChjYXRlZ29yeSA9PT0gRXJyb3JDYXRlZ29yeS5JTlRFUk5BTCB8fCBjYXRlZ29yeSA9PT0gRXJyb3JDYXRlZ29yeS5EQVRBQkFTRSkpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBEZXRlcm1pbmUgYXBwcm9wcmlhdGUgbG9nIGxldmVsIGZvciBlcnJvclxyXG4gICAqL1xyXG4gIHByaXZhdGUgc3RhdGljIGdldExvZ0xldmVsKGNhdGVnb3J5OiBFcnJvckNhdGVnb3J5LCBzdGF0dXNDb2RlOiBudW1iZXIpOiBzdHJpbmcge1xyXG4gICAgLy8gQ2xpZW50IGVycm9ycyAoNHh4KSBhcmUgdXN1YWxseSB3YXJuaW5nc1xyXG4gICAgaWYgKHN0YXR1c0NvZGUgPj0gNDAwICYmIHN0YXR1c0NvZGUgPCA1MDApIHtcclxuICAgICAgc3dpdGNoIChjYXRlZ29yeSkge1xyXG4gICAgICAgIGNhc2UgRXJyb3JDYXRlZ29yeS5WQUxJREFUSU9OOlxyXG4gICAgICAgIGNhc2UgRXJyb3JDYXRlZ29yeS5OT1RfRk9VTkQ6XHJcbiAgICAgICAgICByZXR1cm4gJ2luZm8nOyAvLyBUaGVzZSBhcmUgZXhwZWN0ZWQgaW4gbm9ybWFsIG9wZXJhdGlvblxyXG4gICAgICAgIGNhc2UgRXJyb3JDYXRlZ29yeS5BVVRIRU5USUNBVElPTjpcclxuICAgICAgICBjYXNlIEVycm9yQ2F0ZWdvcnkuQVVUSE9SSVpBVElPTjpcclxuICAgICAgICAgIHJldHVybiAnd2Fybic7IC8vIFRoZXNlIG1pZ2h0IGluZGljYXRlIHNlY3VyaXR5IGlzc3Vlc1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICByZXR1cm4gJ3dhcm4nO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNlcnZlciBlcnJvcnMgKDV4eCkgYXJlIGVycm9yc1xyXG4gICAgaWYgKHN0YXR1c0NvZGUgPj0gNTAwKSB7XHJcbiAgICAgIHJldHVybiAnZXJyb3InO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gJ2luZm8nO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIERlY29yYXRvciBmb3IgYXV0b21hdGljIGVycm9yIGhhbmRsaW5nXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlRXJyb3JzKFxyXG4gIGNvbnRleHQ6IEVycm9yQ29udGV4dCA9IHt9LFxyXG4gIG9wZXJhdGlvbj86IHN0cmluZ1xyXG4pIHtcclxuICByZXR1cm4gZnVuY3Rpb24gKFxyXG4gICAgdGFyZ2V0OiBhbnksXHJcbiAgICBwcm9wZXJ0eU5hbWU6IHN0cmluZyxcclxuICAgIGRlc2NyaXB0b3I6IFByb3BlcnR5RGVzY3JpcHRvclxyXG4gICkge1xyXG4gICAgY29uc3QgbWV0aG9kID0gZGVzY3JpcHRvci52YWx1ZTtcclxuICAgIFxyXG4gICAgZGVzY3JpcHRvci52YWx1ZSA9IGFzeW5jIGZ1bmN0aW9uICguLi5hcmdzOiBhbnlbXSkge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIHJldHVybiBhd2FpdCBtZXRob2QuYXBwbHkodGhpcywgYXJncyk7XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc3QgZXJyb3JSZXNwb25zZSA9IEVycm9ySGFuZGxlci5oYW5kbGVFcnJvcihcclxuICAgICAgICAgIGVycm9yIGFzIEVycm9yLFxyXG4gICAgICAgICAgeyAuLi5jb250ZXh0LCBvcGVyYXRpb246IG9wZXJhdGlvbiB8fCBwcm9wZXJ0eU5hbWUgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhyb3cgbmV3IFRyaW5pdHlFcnJvcihcclxuICAgICAgICAgIGVycm9yUmVzcG9uc2UuZXJyb3IsXHJcbiAgICAgICAgICBlcnJvclJlc3BvbnNlLmNvZGUsXHJcbiAgICAgICAgICBlcnJvclJlc3BvbnNlLnN0YXR1c0NvZGUsXHJcbiAgICAgICAgICBlcnJvclJlc3BvbnNlLmRldGFpbHNcclxuICAgICAgICApO1xyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICByZXR1cm4gZGVzY3JpcHRvcjtcclxuICB9O1xyXG59XHJcblxyXG4vKipcclxuICogQ29tbW9uIGVycm9yIGZhY3RvcnkgZnVuY3Rpb25zXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgRXJyb3JGYWN0b3J5ID0ge1xyXG4gIHZhbGlkYXRpb246IChtZXNzYWdlOiBzdHJpbmcsIGRldGFpbHM/OiBhbnkpID0+IFxyXG4gICAgbmV3IFZhbGlkYXRpb25FcnJvcihtZXNzYWdlLCBkZXRhaWxzKSxcclxuICAgIFxyXG4gIG5vdEZvdW5kOiAocmVzb3VyY2U6IHN0cmluZywgaWQ/OiBzdHJpbmcpID0+IFxyXG4gICAgbmV3IE5vdEZvdW5kRXJyb3IocmVzb3VyY2UsIGlkKSxcclxuICAgIFxyXG4gIHVuYXV0aG9yaXplZDogKG1lc3NhZ2U/OiBzdHJpbmcpID0+IFxyXG4gICAgbmV3IFVuYXV0aG9yaXplZEVycm9yKG1lc3NhZ2UpLFxyXG4gICAgXHJcbiAgY29uZmxpY3Q6IChtZXNzYWdlOiBzdHJpbmcsIGRldGFpbHM/OiBhbnkpID0+IFxyXG4gICAgbmV3IENvbmZsaWN0RXJyb3IobWVzc2FnZSwgZGV0YWlscyksXHJcbiAgICBcclxuICBleHRlcm5hbDogKHNlcnZpY2U6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nLCBkZXRhaWxzPzogYW55KSA9PiBcclxuICAgIG5ldyBUcmluaXR5RXJyb3IoYCR7c2VydmljZX0gZXJyb3I6ICR7bWVzc2FnZX1gLCAnRVhURVJOQUxfU0VSVklDRV9FUlJPUicsIDUwMiwgZGV0YWlscyksXHJcbiAgICBcclxuICBkYXRhYmFzZTogKG9wZXJhdGlvbjogc3RyaW5nLCBkZXRhaWxzPzogYW55KSA9PiBcclxuICAgIG5ldyBUcmluaXR5RXJyb3IoYERhdGFiYXNlICR7b3BlcmF0aW9ufSBmYWlsZWRgLCAnREFUQUJBU0VfRVJST1InLCA1MDAsIGRldGFpbHMpLFxyXG4gICAgXHJcbiAgdGltZW91dDogKG9wZXJhdGlvbjogc3RyaW5nLCB0aW1lb3V0TXM6IG51bWJlcikgPT4gXHJcbiAgICBuZXcgVHJpbml0eUVycm9yKGAke29wZXJhdGlvbn0gdGltZWQgb3V0IGFmdGVyICR7dGltZW91dE1zfW1zYCwgJ1RJTUVPVVRfRVJST1InLCA1MDQpLFxyXG4gICAgXHJcbiAgcmF0ZUxpbWl0OiAobWVzc2FnZTogc3RyaW5nID0gJ1JhdGUgbGltaXQgZXhjZWVkZWQnKSA9PiBcclxuICAgIG5ldyBUcmluaXR5RXJyb3IobWVzc2FnZSwgJ1JBVEVfTElNSVRfRVJST1InLCA0MjkpLFxyXG59O1xyXG5cclxuZXhwb3J0IHsgRXJyb3JIYW5kbGVyIGFzIGRlZmF1bHQgfTsiXX0=