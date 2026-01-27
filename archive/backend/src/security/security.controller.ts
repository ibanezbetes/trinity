import { Controller, Get, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SecurityService } from './security.service';
import type { SecurityMetrics } from './security.service';
import { EnvironmentValidator } from './validators/environment.validator';
import { RateLimitingGuard, RateLimit } from './guards/rate-limiting.guard';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';

@ApiTags('Security')
@Controller('security')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SecurityController {
  private readonly logger = new Logger(SecurityController.name);

  constructor(
    private securityService: SecurityService,
    private environmentValidator: EnvironmentValidator,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Get security health status' })
  @ApiResponse({ status: 200, description: 'Security health check results' })
  @RateLimit(10, 60000) // 10 requests per minute
  getSecurityHealth() {
    this.logger.log('Security health check requested');
    
    const healthCheck = this.securityService.performSecurityHealthCheck();
    const environmentStatus = this.environmentValidator.getEnvironmentStatus();
    
    return {
      timestamp: new Date().toISOString(),
      security: healthCheck,
      environment: environmentStatus,
      overall: {
        status: healthCheck.status === 'healthy' && environmentStatus.validation.isValid 
          ? 'healthy' 
          : healthCheck.status === 'critical' || !environmentStatus.validation.isValid 
            ? 'critical' 
            : 'warning',
        score: Math.min(healthCheck.score, environmentStatus.validation.securityScore),
      },
    };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get security metrics' })
  @ApiResponse({ status: 200, description: 'Current security metrics' })
  @RateLimit(20, 60000) // 20 requests per minute
  getSecurityMetrics(): SecurityMetrics {
    this.logger.log('Security metrics requested');
    return this.securityService.getSecurityMetrics();
  }

  @Get('config')
  @ApiOperation({ summary: 'Get security configuration' })
  @ApiResponse({ status: 200, description: 'Current security configuration' })
  @RateLimit(5, 60000) // 5 requests per minute
  getSecurityConfig() {
    this.logger.log('Security configuration requested');
    
    const config = this.securityService.getSecurityConfig();
    
    // Remove sensitive information from response
    return {
      cors: config.cors,
      rateLimit: config.rateLimit,
      helmet: {
        contentSecurityPolicy: config.helmet.contentSecurityPolicy,
        hsts: config.helmet.hsts,
      },
    };
  }

  @Post('validate-input')
  @ApiOperation({ summary: 'Validate input for security issues' })
  @ApiResponse({ status: 200, description: 'Input validation results' })
  @RateLimit(50, 60000) // 50 requests per minute
  validateInput(@Body() input: { data: any }) {
    this.logger.log('Input validation requested');
    
    try {
      const sanitized = this.securityService.sanitizeInput(input.data);
      const isValid = this.securityService.validateRequest({ body: input.data });
      
      return {
        isValid,
        sanitized,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Input validation failed', error);
      return {
        isValid: false,
        error: 'Validation failed',
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('scan')
  @ApiOperation({ summary: 'Perform security scan' })
  @ApiResponse({ status: 200, description: 'Security scan results' })
  @RateLimit(2, 300000) // 2 requests per 5 minutes
  performSecurityScan() {
    this.logger.log('Security scan initiated');
    
    const healthCheck = this.securityService.performSecurityHealthCheck();
    const environmentStatus = this.environmentValidator.getEnvironmentStatus();
    const metrics = this.securityService.getSecurityMetrics();
    
    const scanResults = {
      timestamp: new Date().toISOString(),
      scanId: this.securityService.generateSecureToken(16),
      results: {
        security: healthCheck,
        environment: environmentStatus,
        metrics,
      },
      recommendations: [
        ...healthCheck.recommendations,
        ...environmentStatus.recommendations,
      ],
      summary: {
        overallScore: Math.min(healthCheck.score, environmentStatus.validation.securityScore),
        criticalIssues: healthCheck.issues.length + environmentStatus.validation.errors.length,
        warnings: environmentStatus.validation.warnings.length,
        status: healthCheck.status === 'healthy' && environmentStatus.validation.isValid 
          ? 'passed' 
          : 'failed',
      },
    };
    
    this.logger.log('Security scan completed', {
      scanId: scanResults.scanId,
      score: scanResults.summary.overallScore,
      status: scanResults.summary.status,
    });
    
    return scanResults;
  }

  @Post('reset-metrics')
  @ApiOperation({ summary: 'Reset security metrics (admin only)' })
  @ApiResponse({ status: 200, description: 'Security metrics reset' })
  @RateLimit(1, 300000) // 1 request per 5 minutes
  resetSecurityMetrics() {
    this.logger.warn('Security metrics reset requested');
    
    this.securityService.resetSecurityMetrics();
    
    return {
      message: 'Security metrics have been reset',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('rate-limit-stats')
  @ApiOperation({ summary: 'Get rate limiting statistics' })
  @ApiResponse({ status: 200, description: 'Rate limiting statistics' })
  @RateLimit(10, 60000) // 10 requests per minute
  getRateLimitStats() {
    this.logger.log('Rate limit statistics requested');
    
    // This would need to be implemented in the RateLimitingGuard
    // For now, return basic info
    return {
      timestamp: new Date().toISOString(),
      message: 'Rate limiting is active',
      limits: {
        short: '10 requests per second',
        medium: '50 requests per 10 seconds',
        long: '100 requests per minute',
      },
    };
  }
}