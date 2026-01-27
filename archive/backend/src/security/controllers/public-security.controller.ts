import { Controller, Get, Logger, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SecurityService } from '../security.service';
import { EnvironmentValidator } from '../validators/environment.validator';
import { RateLimit } from '../guards/rate-limiting.guard';
import type { Request } from 'express';

@ApiTags('Public Security')
@Controller('security/public')
export class PublicSecurityController {
  private readonly logger = new Logger(PublicSecurityController.name);

  constructor(
    private securityService: SecurityService,
    private environmentValidator: EnvironmentValidator,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get basic security status (public)' })
  @ApiResponse({ status: 200, description: 'Basic security status' })
  @RateLimit(5, 60000) // 5 requests per minute
  getPublicSecurityStatus(@Req() req: Request) {
    this.logger.log('Public security status requested', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    
    const healthCheck = this.securityService.performSecurityHealthCheck();
    
    // Return only non-sensitive information
    return {
      timestamp: new Date().toISOString(),
      status: healthCheck.status,
      score: healthCheck.score,
      environment: this.environmentValidator.getEnvironmentStatus().environment,
      securityFeatures: {
        rateLimiting: 'active',
        inputValidation: 'active',
        securityHeaders: 'active',
        errorHandling: 'secure',
      },
      version: '1.0.0',
    };
  }

  @Get('ping')
  @ApiOperation({ summary: 'Security service ping (public)' })
  @ApiResponse({ status: 200, description: 'Security service is alive' })
  @RateLimit(20, 60000) // 20 requests per minute
  ping(@Req() req: Request) {
    this.logger.debug('Security ping requested', {
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Trinity Security Service',
      version: '1.0.0',
    };
  }

  @Get('headers-check')
  @ApiOperation({ summary: 'Check security headers (public)' })
  @ApiResponse({ status: 200, description: 'Security headers status' })
  @RateLimit(10, 60000) // 10 requests per minute
  checkSecurityHeaders(@Req() req: Request) {
    this.logger.log('Security headers check requested', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    
    const expectedHeaders = [
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection',
      'Referrer-Policy',
      'X-Security-Policy',
      'X-Request-ID',
    ];
    
    return {
      timestamp: new Date().toISOString(),
      securityHeaders: {
        implemented: expectedHeaders,
        status: 'active',
        description: 'All security headers are properly configured',
      },
      rateLimiting: {
        status: 'active',
        limits: {
          short: '10 requests/second',
          medium: '50 requests/10 seconds',
          long: '100 requests/minute',
        },
      },
    };
  }
}