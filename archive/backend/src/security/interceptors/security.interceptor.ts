import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { SecurityService } from '../security.service';

@Injectable()
export class SecurityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SecurityInterceptor.name);

  constructor(private securityService: SecurityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();

    // Log request start
    this.logRequestStart(request);

    return next.handle().pipe(
      tap((data) => {
        // Log successful response
        this.logRequestEnd(request, response, startTime, 'success');
        
        // Sanitize response data if needed
        return this.sanitizeResponse(data);
      }),
      catchError((error) => {
        // Log error response
        this.logRequestEnd(request, response, startTime, 'error', error);
        
        // Re-throw the error
        throw error;
      }),
    );
  }

  private logRequestStart(request: any): void {
    const requestInfo = {
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      contentType: request.headers['content-type'],
      contentLength: request.headers['content-length'],
      timestamp: new Date().toISOString(),
    };

    this.logger.debug('Request started', requestInfo);
  }

  private logRequestEnd(
    request: any,
    response: any,
    startTime: number,
    status: 'success' | 'error',
    error?: any,
  ): void {
    const duration = Date.now() - startTime;
    const requestInfo = {
      method: request.method,
      url: request.url,
      ip: request.ip,
      statusCode: response.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    };

    if (status === 'success') {
      this.logger.log('Request completed successfully', requestInfo);
    } else {
      this.logger.error('Request failed', {
        ...requestInfo,
        error: error?.message || 'Unknown error',
      });
    }

    // Track performance metrics
    this.trackPerformanceMetrics(request, duration, response.statusCode);
  }

  private sanitizeResponse(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Remove sensitive fields from response
    const sensitiveFields = [
      'password',
      'secret',
      'token',
      'key',
      'privateKey',
      'accessKey',
      'secretKey',
      'apiKey',
    ];

    return this.removeSensitiveFields(data, sensitiveFields);
  }

  private removeSensitiveFields(obj: any, sensitiveFields: string[]): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeSensitiveFields(item, sensitiveFields));
    }

    if (typeof obj === 'object' && obj !== null) {
      const sanitized = { ...obj };
      
      for (const field of sensitiveFields) {
        if (field in sanitized) {
          sanitized[field] = '***REDACTED***';
        }
      }

      // Recursively sanitize nested objects
      for (const [key, value] of Object.entries(sanitized)) {
        if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.removeSensitiveFields(value, sensitiveFields);
        }
      }

      return sanitized;
    }

    return obj;
  }

  private trackPerformanceMetrics(request: any, duration: number, statusCode: number): void {
    // Track slow requests
    if (duration > 1000) {
      this.logger.warn('Slow request detected', {
        url: request.url,
        method: request.method,
        duration: `${duration}ms`,
        statusCode,
      });
    }

    // Track error rates
    if (statusCode >= 400) {
      this.logger.warn('Error response', {
        url: request.url,
        method: request.method,
        statusCode,
        duration: `${duration}ms`,
      });
    }

    // Track security-related metrics
    if (this.isSecurityEndpoint(request.url)) {
      this.logger.log('Security endpoint accessed', {
        url: request.url,
        method: request.method,
        statusCode,
        duration: `${duration}ms`,
        ip: request.ip,
      });
    }
  }

  private isSecurityEndpoint(url: string): boolean {
    const securityEndpoints = [
      '/auth/',
      '/security/',
      '/admin/',
      '/user/',
      '/permissions/',
    ];

    return securityEndpoints.some(endpoint => url.includes(endpoint));
  }
}