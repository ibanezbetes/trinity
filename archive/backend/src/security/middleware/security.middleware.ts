import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SecurityService } from '../security.service';
import helmet from 'helmet';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityMiddleware.name);

  constructor(private securityService: SecurityService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // Enforce HTTPS in production
    if (!this.enforceHTTPS(req, res)) {
      return; // Request was redirected or blocked
    }

    // Apply security headers using helmet
    this.applySecurityHeaders(req, res);

    // Validate request for suspicious activity
    if (!this.securityService.validateRequest(req)) {
      this.logger.warn('Suspicious request blocked', {
        ip: req.ip,
        url: req.url,
        method: req.method,
        userAgent: req.headers['user-agent'],
      });
      
      res.status(400).json({
        statusCode: 400,
        message: 'Request blocked due to security policy',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Add security-related headers
    this.addCustomSecurityHeaders(res);

    // Log security events
    this.logSecurityEvent(req);

    next();
  }

  private applySecurityHeaders(req: Request, res: Response): void {
    const securityConfig = this.securityService.getSecurityConfig();
    
    // Apply helmet middleware programmatically
    helmet({
      contentSecurityPolicy: {
        directives: securityConfig.helmet.contentSecurityPolicy.directives,
      },
      hsts: securityConfig.helmet.hsts,
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: 'same-origin' },
      frameguard: { action: 'deny' },
    })(req, res, () => {});
  }

  private addCustomSecurityHeaders(res: Response): void {
    // Custom security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // HTTPS enforcement headers for production
    if (process.env.NODE_ENV === 'production') {
      // HTTP Strict Transport Security (HSTS)
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      
      // Upgrade insecure requests
      res.setHeader('Content-Security-Policy', 'upgrade-insecure-requests');
    }
    
    // Remove server information
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    // Add custom security identifier
    res.setHeader('X-Security-Policy', 'Trinity-Security-v1.0');
    
    // Add request ID for tracking
    res.setHeader('X-Request-ID', this.generateRequestId());
  }

  private logSecurityEvent(req: Request): void {
    // Log important security events
    const securityEvent = {
      timestamp: new Date().toISOString(),
      ip: req.ip,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      contentLength: req.headers['content-length'],
      origin: req.headers.origin,
      referer: req.headers.referer,
    };

    // Log suspicious patterns
    if (this.isSuspiciousRequest(req)) {
      this.logger.warn('Suspicious request pattern detected', securityEvent);
    }

    // Log high-risk endpoints
    if (this.isHighRiskEndpoint(req.url)) {
      this.logger.log('High-risk endpoint accessed', securityEvent);
    }
  }

  private isSuspiciousRequest(req: Request): boolean {
    const suspiciousPatterns = [
      // Common attack patterns in URLs
      /\.\.\//,
      /\.\.\\/,
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      
      // SQL injection patterns
      /union\s+select/i,
      /drop\s+table/i,
      /insert\s+into/i,
      
      // Command injection
      /;.*?cat\s+/i,
      /;.*?ls\s+/i,
      /;.*?pwd/i,
      
      // Common vulnerability scanners
      /nikto/i,
      /nessus/i,
      /openvas/i,
      /nmap/i,
    ];

    const requestString = `${req.url} ${req.headers['user-agent']} ${JSON.stringify(req.body)}`;
    
    return suspiciousPatterns.some(pattern => pattern.test(requestString));
  }

  private isHighRiskEndpoint(url: string): boolean {
    const highRiskPatterns = [
      /\/auth\//,
      /\/admin\//,
      /\/api\/.*\/delete/,
      /\/api\/.*\/create/,
      /\/upload/,
      /\/download/,
    ];

    return highRiskPatterns.some(pattern => pattern.test(url));
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Enforce HTTPS in production environment
   */
  private enforceHTTPS(req: Request, res: Response): boolean {
    const isProduction = process.env.NODE_ENV === 'production';
    const isHTTPS = req.secure || req.headers['x-forwarded-proto'] === 'https';
    
    // Skip HTTPS enforcement in development
    if (!isProduction) {
      return true;
    }

    // Check if request is already HTTPS
    if (isHTTPS) {
      return true;
    }

    // Allow health check endpoints without HTTPS redirect
    const healthCheckPaths = [
      '/health',
      '/api/health',
      '/api/security/public/ping',
      '/api/security/public/status',
    ];

    if (healthCheckPaths.some(path => req.path.startsWith(path))) {
      this.logger.warn('Health check endpoint accessed over HTTP in production', {
        ip: req.ip,
        path: req.path,
        userAgent: req.headers['user-agent'],
      });
      return true; // Allow but log warning
    }

    // Redirect HTTP to HTTPS in production
    const httpsUrl = `https://${req.get('host')}${req.originalUrl}`;
    
    this.logger.warn('HTTP request redirected to HTTPS in production', {
      ip: req.ip,
      originalUrl: req.originalUrl,
      redirectUrl: httpsUrl,
      userAgent: req.headers['user-agent'],
    });

    res.redirect(301, httpsUrl);
    return false; // Request was redirected
  }
}