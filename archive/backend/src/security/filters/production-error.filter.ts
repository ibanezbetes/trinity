import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SecurityService } from '../security.service';

@Catch()
export class ProductionErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProductionErrorFilter.name);

  constructor(private securityService: SecurityService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.getHttpStatus(exception);
    const errorResponse = this.buildErrorResponse(exception, request, status);

    // Log the error with appropriate level
    this.logError(exception, request, status);

    // Record security-related errors
    if (this.isSecurityRelated(exception, status)) {
      this.securityService.recordBlockedRequest();
    }

    response.status(status).json(errorResponse);
  }

  private getHttpStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private buildErrorResponse(exception: unknown, request: Request, status: number): any {
    const isProduction = process.env.NODE_ENV === 'production';
    const timestamp = new Date().toISOString();
    const path = request.url;

    // Base error response
    const errorResponse: any = {
      statusCode: status,
      timestamp,
      path,
    };

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object') {
        Object.assign(errorResponse, exceptionResponse);
      } else {
        errorResponse.message = exceptionResponse;
      }
    } else {
      // For non-HTTP exceptions, provide generic message in production
      errorResponse.message = isProduction 
        ? 'Internal server error' 
        : (exception as Error)?.message || 'Unknown error';
    }

    // In production, sanitize error messages to prevent information leakage
    if (isProduction) {
      errorResponse.message = this.sanitizeErrorMessage(errorResponse.message, status);
      
      // Remove stack traces and sensitive information
      delete errorResponse.stack;
      delete errorResponse.error;
      
      // Add generic error ID for tracking
      errorResponse.errorId = this.generateErrorId();
    } else {
      // In development, include more details for debugging
      if (exception instanceof Error) {
        errorResponse.stack = exception.stack;
        errorResponse.name = exception.name;
      }
    }

    return errorResponse;
  }

  private sanitizeErrorMessage(message: string, status: number): string {
    // Provide user-friendly messages without exposing internal details
    const sanitizedMessages: Record<number, string> = {
      400: 'Bad request. Please check your input and try again.',
      401: 'Authentication required. Please log in and try again.',
      403: 'Access denied. You do not have permission to perform this action.',
      404: 'The requested resource was not found.',
      409: 'Conflict. The resource already exists or is in use.',
      422: 'Invalid input. Please check your data and try again.',
      429: 'Too many requests. Please wait before trying again.',
      500: 'Internal server error. Please try again later.',
      502: 'Service temporarily unavailable. Please try again later.',
      503: 'Service temporarily unavailable. Please try again later.',
    };

    // Return sanitized message or original if it's safe
    if (sanitizedMessages[status]) {
      return sanitizedMessages[status];
    }

    // For other status codes, check if message contains sensitive information
    if (this.containsSensitiveInfo(message)) {
      return 'An error occurred. Please contact support if the problem persists.';
    }

    return message;
  }

  private containsSensitiveInfo(message: string): boolean {
    const sensitivePatterns = [
      /password/i,
      /token/i,
      /secret/i,
      /key/i,
      /database/i,
      /connection/i,
      /aws/i,
      /cognito/i,
      /dynamodb/i,
      /file system/i,
      /path/i,
      /directory/i,
      /stack trace/i,
    ];

    return sensitivePatterns.some(pattern => pattern.test(message));
  }

  private logError(exception: unknown, request: Request, status: number): void {
    const errorContext = {
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      userId: (request as any).user?.id,
      timestamp: new Date().toISOString(),
      statusCode: status,
    };

    if (status >= 500) {
      // Server errors - log as error
      this.logger.error(
        `Server Error: ${exception instanceof Error ? exception.message : 'Unknown error'}`,
        {
          ...errorContext,
          stack: exception instanceof Error ? exception.stack : undefined,
        },
      );
    } else if (status >= 400) {
      // Client errors - log as warning
      this.logger.warn(
        `Client Error: ${exception instanceof HttpException ? exception.message : 'Bad request'}`,
        errorContext,
      );
    } else {
      // Other errors - log as debug
      this.logger.debug(
        `Request Error: ${exception instanceof Error ? exception.message : 'Unknown'}`,
        errorContext,
      );
    }
  }

  private isSecurityRelated(exception: unknown, status: number): boolean {
    // Consider these as security-related errors
    const securityStatuses = [400, 401, 403, 422, 429];
    
    if (securityStatuses.includes(status)) {
      return true;
    }

    // Check if exception message indicates security issue
    if (exception instanceof Error) {
      const securityKeywords = [
        'unauthorized',
        'forbidden',
        'invalid token',
        'malicious',
        'suspicious',
        'rate limit',
        'blocked',
      ];
      
      const message = exception.message.toLowerCase();
      return securityKeywords.some(keyword => message.includes(keyword));
    }

    return false;
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}