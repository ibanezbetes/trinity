import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SecurityService } from '../security.service';
import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';
export const RateLimit = (limit: number, windowMs: number = 60000) => 
  SetMetadata(RATE_LIMIT_KEY, { limit, windowMs });

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitingGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitingGuard.name);
  private readonly requests = new Map<string, RateLimitInfo>();

  constructor(
    private reflector: Reflector,
    private securityService: SecurityService,
  ) {
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const rateLimitConfig = this.reflector.getAllAndOverride(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no rate limit is configured, allow the request
    if (!rateLimitConfig) {
      return true;
    }

    const { limit, windowMs } = rateLimitConfig;
    const key = this.getClientKey(request);
    const now = Date.now();

    let rateLimitInfo = this.requests.get(key);

    // Initialize or reset if window has expired
    if (!rateLimitInfo || now > rateLimitInfo.resetTime) {
      rateLimitInfo = {
        count: 0,
        resetTime: now + windowMs,
      };
    }

    rateLimitInfo.count++;
    this.requests.set(key, rateLimitInfo);

    // Check if limit is exceeded
    if (rateLimitInfo.count > limit) {
      this.securityService.recordRateLimitHit();
      
      this.logger.warn(`Rate limit exceeded for ${key}`, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        endpoint: request.url,
        count: rateLimitInfo.count,
        limit,
        resetTime: new Date(rateLimitInfo.resetTime).toISOString(),
      });

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded',
          error: 'Too Many Requests',
          retryAfter: Math.ceil((rateLimitInfo.resetTime - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Add rate limit headers
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, limit - rateLimitInfo.count));
    response.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitInfo.resetTime / 1000));

    return true;
  }

  private getClientKey(request: any): string {
    // Use IP address and user agent for identification
    const ip = request.ip || request.connection.remoteAddress || 'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';
    return `${ip}:${this.securityService.hashSensitiveData(userAgent)}`;
  }

  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, info] of this.requests.entries()) {
      if (now > info.resetTime) {
        this.requests.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired rate limit entries`);
    }
  }

  /**
   * Get current rate limit statistics
   */
  getRateLimitStats(): {
    totalClients: number;
    activeWindows: number;
    memoryUsage: number;
  } {
    const now = Date.now();
    let activeWindows = 0;

    for (const info of this.requests.values()) {
      if (now <= info.resetTime) {
        activeWindows++;
      }
    }

    return {
      totalClients: this.requests.size,
      activeWindows,
      memoryUsage: JSON.stringify([...this.requests.entries()]).length,
    };
  }

  /**
   * Clear all rate limit data (for testing)
   */
  clearRateLimitData(): void {
    this.requests.clear();
  }
}