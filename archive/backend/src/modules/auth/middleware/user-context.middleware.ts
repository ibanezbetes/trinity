import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { UserProfile } from '../../../domain/entities/user.entity';

/**
 * Enhanced user context interface for requests
 */
export interface EnhancedUserContext extends UserProfile {
  // Standard fields (from UserProfile)
  id: string;
  sub: string;
  email: string;
  username: string;
  emailVerified: boolean;
  
  // Additional context fields for convenience
  userId: string; // Alias for id - for backward compatibility
  userSub: string; // Alias for sub - for Cognito compatibility
  
  // Permission context
  permissions?: string[];
  roles?: string[];
  
  // Session context
  sessionId?: string;
  tokenIssuedAt?: Date;
  tokenExpiresAt?: Date;
  
  // Request context
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Middleware to enhance user context in requests
 */
@Injectable()
export class UserContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(UserContextMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    // Only process if user is already authenticated (set by JWT strategy)
    if (req.user) {
      try {
        // Enhance user context with additional fields
        const enhancedUser: EnhancedUserContext = {
          ...req.user,
          // Ensure all required aliases are present
          userId: req.user.id || req.user.sub,
          userSub: req.user.sub || req.user.id,
          
          // Add request context
          requestId: this.generateRequestId(),
          ipAddress: this.extractIpAddress(req),
          userAgent: req.headers['user-agent'],
          
          // Add session context if available
          sessionId: this.extractSessionId(req),
          tokenIssuedAt: this.extractTokenIssuedAt(req),
          tokenExpiresAt: this.extractTokenExpiresAt(req),
        };

        // Set enhanced context
        req.user = enhancedUser;
        req.userContext = enhancedUser;

        // Add user context to response headers for debugging (non-sensitive info only)
        if (process.env.NODE_ENV !== 'production') {
          res.setHeader('X-User-ID', enhancedUser.id);
          res.setHeader('X-User-Email', enhancedUser.email);
          if (enhancedUser.requestId) {
            res.setHeader('X-Request-ID', enhancedUser.requestId);
          }
        }

        this.logger.debug(`Enhanced user context for ${enhancedUser.email} (${enhancedUser.id})`);
      } catch (error) {
        this.logger.error(`Error enhancing user context: ${error.message}`);
        // Continue with original user context if enhancement fails
      }
    }

    next();
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract IP address from request
   */
  private extractIpAddress(req: Request): string {
    return (
      req.headers['x-forwarded-for'] as string ||
      req.headers['x-real-ip'] as string ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Extract session ID from request headers or generate one
   */
  private extractSessionId(req: Request): string {
    return (
      req.headers['x-session-id'] as string ||
      req.headers['x-request-id'] as string ||
      `session_${Date.now()}`
    );
  }

  /**
   * Extract token issued at time from JWT payload
   */
  private extractTokenIssuedAt(req: Request): Date | undefined {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return undefined;

      const token = authHeader.replace('Bearer ', '');
      const payload = this.decodeJwtPayload(token);
      
      return payload?.iat ? new Date(payload.iat * 1000) : undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Extract token expiration time from JWT payload
   */
  private extractTokenExpiresAt(req: Request): Date | undefined {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return undefined;

      const token = authHeader.replace('Bearer ', '');
      const payload = this.decodeJwtPayload(token);
      
      return payload?.exp ? new Date(payload.exp * 1000) : undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Decode JWT payload without verification (for context extraction only)
   */
  private decodeJwtPayload(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = parts[1];
      const decoded = Buffer.from(payload, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (error) {
      return null;
    }
  }
}

/**
 * Utility functions for accessing user context
 */
export class UserContextUtils {
  /**
   * Get user ID from request (handles all variations)
   */
  static getUserId(req: Request): string | undefined {
    return req.user?.id || req.user?.sub || req.user?.userId;
  }

  /**
   * Get user email from request
   */
  static getUserEmail(req: Request): string | undefined {
    return req.user?.email;
  }

  /**
   * Get user permissions from request
   */
  static getUserPermissions(req: Request): string[] {
    return req.user?.permissions || [];
  }

  /**
   * Check if user has specific permission
   */
  static hasPermission(req: Request, permission: string): boolean {
    const permissions = UserContextUtils.getUserPermissions(req);
    return permissions.includes(permission);
  }

  /**
   * Get enhanced user context
   */
  static getEnhancedContext(req: Request): EnhancedUserContext | undefined {
    return req.userContext || req.user;
  }

  /**
   * Validate user context is properly set
   */
  static validateUserContext(req: Request): boolean {
    const user = req.user;
    if (!user) return false;

    // Check required fields
    return !!(user.id && user.email && user.username);
  }

  /**
   * Get user display name (fallback to username if displayName not set)
   */
  static getDisplayName(req: Request): string | undefined {
    const user = req.user;
    return user?.displayName || user?.username;
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(req: Request): boolean {
    return !!req.user && UserContextUtils.validateUserContext(req);
  }

  /**
   * Get request context information
   */
  static getRequestContext(req: Request): {
    requestId?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  } {
    const user = req.user as EnhancedUserContext;
    return {
      requestId: user?.requestId,
      ipAddress: user?.ipAddress,
      userAgent: user?.userAgent,
      sessionId: user?.sessionId,
    };
  }
}