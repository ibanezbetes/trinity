import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SetMetadata } from '@nestjs/common';

export const IP_WHITELIST_KEY = 'ipWhitelist';
export const IPWhitelist = (ips: string[]) => SetMetadata(IP_WHITELIST_KEY, ips);

@Injectable()
export class IPWhitelistGuard implements CanActivate {
  private readonly logger = new Logger(IPWhitelistGuard.name);

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const whitelistedIPs = this.reflector.getAllAndOverride<string[]>(IP_WHITELIST_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no IP whitelist is configured, allow the request
    if (!whitelistedIPs || whitelistedIPs.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const clientIP = this.getClientIP(request);

    // Get additional whitelisted IPs from environment
    const envWhitelistIPs = this.getEnvironmentWhitelistIPs();
    const allWhitelistedIPs = [...whitelistedIPs, ...envWhitelistIPs];

    // Check if client IP is whitelisted
    const isWhitelisted = this.isIPWhitelisted(clientIP, allWhitelistedIPs);

    if (!isWhitelisted) {
      this.logger.warn('IP access denied', {
        clientIP,
        whitelistedIPs: allWhitelistedIPs,
        userAgent: request.headers['user-agent'],
        endpoint: request.url,
        timestamp: new Date().toISOString(),
      });

      throw new ForbiddenException({
        statusCode: 403,
        message: 'Access denied: IP not whitelisted',
        error: 'Forbidden',
        timestamp: new Date().toISOString(),
      });
    }

    this.logger.log('IP access granted', {
      clientIP,
      endpoint: request.url,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  private getClientIP(request: any): string {
    // Try to get the real IP from various headers
    const possibleHeaders = [
      'x-forwarded-for',
      'x-real-ip',
      'x-client-ip',
      'cf-connecting-ip', // Cloudflare
      'x-forwarded',
      'forwarded-for',
      'forwarded',
    ];

    for (const header of possibleHeaders) {
      const headerValue = request.headers[header];
      if (headerValue) {
        // x-forwarded-for can contain multiple IPs, take the first one
        const ip = headerValue.split(',')[0].trim();
        if (this.isValidIP(ip)) {
          return ip;
        }
      }
    }

    // Fallback to connection remote address
    return request.ip || request.connection?.remoteAddress || 'unknown';
  }

  private getEnvironmentWhitelistIPs(): string[] {
    const envIPs = this.configService.get<string>('ADMIN_WHITELIST_IPS', '');
    if (!envIPs) {
      return [];
    }

    return envIPs.split(',').map(ip => ip.trim()).filter(ip => this.isValidIP(ip));
  }

  private isIPWhitelisted(clientIP: string, whitelistedIPs: string[]): boolean {
    // Handle localhost variations
    const localhostVariations = ['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'];
    
    for (const whitelistedIP of whitelistedIPs) {
      // Exact match
      if (clientIP === whitelistedIP) {
        return true;
      }

      // Localhost variations
      if (localhostVariations.includes(clientIP) && localhostVariations.includes(whitelistedIP)) {
        return true;
      }

      // CIDR notation support (basic)
      if (whitelistedIP.includes('/') && this.isIPInCIDR(clientIP, whitelistedIP)) {
        return true;
      }

      // Wildcard support (e.g., 192.168.1.*)
      if (whitelistedIP.includes('*')) {
        const pattern = whitelistedIP.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(clientIP)) {
          return true;
        }
      }
    }

    return false;
  }

  private isValidIP(ip: string): boolean {
    // Basic IP validation (IPv4 and IPv6)
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip) || ip === 'localhost';
  }

  private isIPInCIDR(ip: string, cidr: string): boolean {
    // Basic CIDR check - for production, use a proper IP library
    try {
      const [network, prefixLength] = cidr.split('/');
      const prefix = parseInt(prefixLength, 10);
      
      // This is a simplified implementation
      // For production, consider using libraries like 'ip' or 'netmask'
      if (prefix === 32) {
        return ip === network;
      }
      
      // For now, just do basic network matching
      const networkParts = network.split('.');
      const ipParts = ip.split('.');
      
      const bytesToCheck = Math.floor(prefix / 8);
      for (let i = 0; i < bytesToCheck; i++) {
        if (networkParts[i] !== ipParts[i]) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      this.logger.error('CIDR validation error', { ip, cidr, error: error.message });
      return false;
    }
  }

  /**
   * Get current whitelist statistics
   */
  getWhitelistStats(): {
    environmentIPs: string[];
    totalWhitelistedIPs: number;
    lastAccessAttempt: Date;
  } {
    const envIPs = this.getEnvironmentWhitelistIPs();
    
    return {
      environmentIPs: envIPs,
      totalWhitelistedIPs: envIPs.length,
      lastAccessAttempt: new Date(),
    };
  }
}