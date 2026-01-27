import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SecurityEvent {
  type: 'authentication' | 'authorization' | 'input_validation' | 'rate_limit' | 'suspicious_activity' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, any>;
  timestamp: Date;
  ip?: string;
  userAgent?: string;
  userId?: string;
  endpoint?: string;
}

export interface SecurityLogSummary {
  totalEvents: number;
  eventsBySeverity: Record<string, number>;
  eventsByType: Record<string, number>;
  recentEvents: SecurityEvent[];
  topIPs: Array<{ ip: string; count: number }>;
  topEndpoints: Array<{ endpoint: string; count: number }>;
}

@Injectable()
export class SecurityLoggerService {
  private readonly logger = new Logger(SecurityLoggerService.name);
  private readonly events: SecurityEvent[] = [];
  private readonly maxEvents = 1000; // Keep last 1000 events in memory

  constructor(private configService: ConfigService) {}

  /**
   * Log a security event
   */
  logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
    const securityEvent: SecurityEvent = {
      ...event,
      timestamp: new Date(),
    };

    // Add to in-memory storage
    this.events.push(securityEvent);
    
    // Keep only the last maxEvents
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Log to console with appropriate level
    const logMessage = `[SECURITY] ${event.type.toUpperCase()}: ${event.message}`;
    const logContext = {
      severity: event.severity,
      type: event.type,
      details: event.details,
      ip: event.ip,
      userAgent: event.userAgent,
      userId: event.userId,
      endpoint: event.endpoint,
      timestamp: securityEvent.timestamp.toISOString(),
    };

    switch (event.severity) {
      case 'critical':
        this.logger.error(logMessage, logContext);
        break;
      case 'high':
        this.logger.error(logMessage, logContext);
        break;
      case 'medium':
        this.logger.warn(logMessage, logContext);
        break;
      case 'low':
        this.logger.log(logMessage, logContext);
        break;
    }

    // In production, you might want to send critical events to external monitoring
    if (event.severity === 'critical' && this.configService.get('NODE_ENV') === 'production') {
      this.sendCriticalAlert(securityEvent);
    }
  }

  /**
   * Log authentication events
   */
  logAuthenticationEvent(
    message: string,
    severity: SecurityEvent['severity'],
    details: Record<string, any>,
    request?: any,
  ): void {
    this.logSecurityEvent({
      type: 'authentication',
      severity,
      message,
      details,
      ip: request?.ip,
      userAgent: request?.headers?.['user-agent'],
      endpoint: request?.url,
    });
  }

  /**
   * Log authorization events
   */
  logAuthorizationEvent(
    message: string,
    severity: SecurityEvent['severity'],
    details: Record<string, any>,
    request?: any,
  ): void {
    this.logSecurityEvent({
      type: 'authorization',
      severity,
      message,
      details,
      ip: request?.ip,
      userAgent: request?.headers?.['user-agent'],
      userId: request?.user?.id,
      endpoint: request?.url,
    });
  }

  /**
   * Log input validation events
   */
  logInputValidationEvent(
    message: string,
    severity: SecurityEvent['severity'],
    details: Record<string, any>,
    request?: any,
  ): void {
    this.logSecurityEvent({
      type: 'input_validation',
      severity,
      message,
      details,
      ip: request?.ip,
      userAgent: request?.headers?.['user-agent'],
      endpoint: request?.url,
    });
  }

  /**
   * Log rate limiting events
   */
  logRateLimitEvent(
    message: string,
    severity: SecurityEvent['severity'],
    details: Record<string, any>,
    request?: any,
  ): void {
    this.logSecurityEvent({
      type: 'rate_limit',
      severity,
      message,
      details,
      ip: request?.ip,
      userAgent: request?.headers?.['user-agent'],
      endpoint: request?.url,
    });
  }

  /**
   * Log suspicious activity
   */
  logSuspiciousActivity(
    message: string,
    severity: SecurityEvent['severity'],
    details: Record<string, any>,
    request?: any,
  ): void {
    this.logSecurityEvent({
      type: 'suspicious_activity',
      severity,
      message,
      details,
      ip: request?.ip,
      userAgent: request?.headers?.['user-agent'],
      endpoint: request?.url,
    });
  }

  /**
   * Log system security events
   */
  logSystemEvent(
    message: string,
    severity: SecurityEvent['severity'],
    details: Record<string, any>,
  ): void {
    this.logSecurityEvent({
      type: 'system',
      severity,
      message,
      details,
    });
  }

  /**
   * Get security log summary
   */
  getLogSummary(hours: number = 24): SecurityLogSummary {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recentEvents = this.events.filter(event => event.timestamp >= cutoffTime);

    // Count events by severity
    const eventsBySeverity = recentEvents.reduce((acc, event) => {
      acc[event.severity] = (acc[event.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Count events by type
    const eventsByType = recentEvents.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Top IPs
    const ipCounts = recentEvents
      .filter(event => event.ip)
      .reduce((acc, event) => {
        acc[event.ip!] = (acc[event.ip!] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const topIPs = Object.entries(ipCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));

    // Top endpoints
    const endpointCounts = recentEvents
      .filter(event => event.endpoint)
      .reduce((acc, event) => {
        acc[event.endpoint!] = (acc[event.endpoint!] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const topEndpoints = Object.entries(endpointCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([endpoint, count]) => ({ endpoint, count }));

    return {
      totalEvents: recentEvents.length,
      eventsBySeverity,
      eventsByType,
      recentEvents: recentEvents.slice(-20), // Last 20 events
      topIPs,
      topEndpoints,
    };
  }

  /**
   * Get events by criteria
   */
  getEvents(criteria: {
    type?: SecurityEvent['type'];
    severity?: SecurityEvent['severity'];
    ip?: string;
    userId?: string;
    hours?: number;
    limit?: number;
  }): SecurityEvent[] {
    let filteredEvents = [...this.events];

    // Filter by time
    if (criteria.hours) {
      const cutoffTime = new Date(Date.now() - criteria.hours * 60 * 60 * 1000);
      filteredEvents = filteredEvents.filter(event => event.timestamp >= cutoffTime);
    }

    // Filter by type
    if (criteria.type) {
      filteredEvents = filteredEvents.filter(event => event.type === criteria.type);
    }

    // Filter by severity
    if (criteria.severity) {
      filteredEvents = filteredEvents.filter(event => event.severity === criteria.severity);
    }

    // Filter by IP
    if (criteria.ip) {
      filteredEvents = filteredEvents.filter(event => event.ip === criteria.ip);
    }

    // Filter by user ID
    if (criteria.userId) {
      filteredEvents = filteredEvents.filter(event => event.userId === criteria.userId);
    }

    // Sort by timestamp (newest first)
    filteredEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Limit results
    if (criteria.limit) {
      filteredEvents = filteredEvents.slice(0, criteria.limit);
    }

    return filteredEvents;
  }

  /**
   * Clear old events
   */
  clearOldEvents(hours: number = 168): number { // Default: 1 week
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const initialLength = this.events.length;
    
    // Remove old events
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].timestamp < cutoffTime) {
        this.events.splice(i, 1);
      }
    }

    const removedCount = initialLength - this.events.length;
    
    if (removedCount > 0) {
      this.logger.log(`Cleared ${removedCount} old security events`);
    }

    return removedCount;
  }

  /**
   * Send critical alert (placeholder for external monitoring integration)
   */
  private sendCriticalAlert(event: SecurityEvent): void {
    // In production, integrate with:
    // - Slack/Discord webhooks
    // - Email alerts
    // - PagerDuty
    // - CloudWatch alarms
    // - External SIEM systems
    
    this.logger.error('CRITICAL SECURITY ALERT', {
      event,
      alert: 'This is a critical security event that requires immediate attention',
    });
  }
}