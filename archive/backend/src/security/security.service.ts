import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as helmet from 'helmet';

export interface SecurityConfig {
  cors: {
    origin: string[];
    credentials: boolean;
    methods: string[];
    allowedHeaders: string[];
  };
  helmet: {
    contentSecurityPolicy: {
      directives: Record<string, string[]>;
    };
    hsts: {
      maxAge: number;
      includeSubDomains: boolean;
      preload: boolean;
    };
  };
  rateLimit: {
    windowMs: number;
    max: number;
    message: string;
  };
}

export interface SecurityMetrics {
  blockedRequests: number;
  rateLimitHits: number;
  suspiciousActivity: number;
  lastSecurityScan: Date;
  securityScore: number;
}

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private securityMetrics: SecurityMetrics = {
    blockedRequests: 0,
    rateLimitHits: 0,
    suspiciousActivity: 0,
    lastSecurityScan: new Date(),
    securityScore: 100,
  };

  constructor(private configService: ConfigService) {}

  /**
   * Get security configuration for production
   */
  getSecurityConfig(): SecurityConfig {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    
    return {
      cors: {
        origin: isProduction 
          ? ['https://trinity-app.com', 'https://admin.trinity-app.com']
          : ['http://localhost:3000', 'http://localhost:8081', 'http://localhost:19006'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      },
      helmet: {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https://image.tmdb.org', 'https://*.cloudfront.net'],
            scriptSrc: ["'self'"],
            connectSrc: ["'self'", 'https://api.themoviedb.org', 'wss://'],
          },
        },
        hsts: {
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: true,
        },
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP, please try again later.',
      },
    };
  }

  /**
   * Sanitize input to prevent XSS and injection attacks
   */
  sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    }
    
    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeInput(item));
    }
    
    if (typeof input === 'object' && input !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(input)) {
        sanitized[this.sanitizeInput(key)] = this.sanitizeInput(value);
      }
      return sanitized;
    }
    
    return input;
  }

  /**
   * Generate secure random token
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash sensitive data
   */
  hashSensitiveData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Validate request for suspicious activity
   */
  validateRequest(req: any): boolean {
    const suspiciousPatterns = [
      /(<script|javascript:|on\w+\s*=)/i,
      /(union\s+select|drop\s+table|insert\s+into)/i,
      /(\.\.\/)|(\.\.\\)/,
      /(eval\(|exec\(|system\()/i,
    ];

    const requestString = JSON.stringify({
      url: req.url,
      body: req.body,
      query: req.query,
      headers: req.headers,
    });

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(requestString)) {
        this.recordSuspiciousActivity(req);
        return false;
      }
    }

    return true;
  }

  /**
   * Record suspicious activity
   */
  recordSuspiciousActivity(req?: any): void {
    this.securityMetrics.suspiciousActivity++;
    this.securityMetrics.securityScore = Math.max(0, this.securityMetrics.securityScore - 5);
    
    if (req) {
      this.logger.warn('Suspicious activity detected', {
        ip: req.ip || 'unknown',
        userAgent: req.headers?.['user-agent'] || 'unknown',
        url: req.url || 'unknown',
        timestamp: new Date().toISOString(),
      });
    } else {
      this.logger.warn('Suspicious activity detected', {
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Record blocked request
   */
  recordBlockedRequest(): void {
    this.securityMetrics.blockedRequests++;
  }

  /**
   * Record rate limit hit
   */
  recordRateLimitHit(): void {
    this.securityMetrics.rateLimitHits++;
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): SecurityMetrics {
    return { ...this.securityMetrics };
  }

  /**
   * Perform security health check
   */
  performSecurityHealthCheck(): {
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = this.securityMetrics.securityScore;

    // Check for high rate limit hits
    if (this.securityMetrics.rateLimitHits > 100) {
      issues.push('High rate limit hits detected');
      recommendations.push('Consider implementing more aggressive rate limiting');
      score -= 10;
    }

    // Check for suspicious activity
    if (this.securityMetrics.suspiciousActivity > 10) {
      issues.push('Multiple suspicious activities detected');
      recommendations.push('Review security logs and consider IP blocking');
      score -= 15;
    }

    // Check environment configuration
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    if (isProduction) {
      const requiredEnvVars = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'COGNITO_USER_POOL_ID',
        'COGNITO_CLIENT_ID',
        'TMDB_API_KEY',
      ];

      for (const envVar of requiredEnvVars) {
        if (!this.configService.get(envVar)) {
          issues.push(`Missing required environment variable: ${envVar}`);
          score -= 20;
        }
      }
    }

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (score < 50) {
      status = 'critical';
    } else if (score < 80) {
      status = 'warning';
    }

    return {
      status,
      score: Math.max(0, score),
      issues,
      recommendations,
    };
  }

  /**
   * Reset security metrics (for testing or maintenance)
   */
  resetSecurityMetrics(): void {
    this.securityMetrics = {
      blockedRequests: 0,
      rateLimitHits: 0,
      suspiciousActivity: 0,
      lastSecurityScan: new Date(),
      securityScore: 100,
    };
  }
}