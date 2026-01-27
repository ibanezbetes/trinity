/**
 * Security Monitoring Service
 * Implements detection for suspicious authentication activity,
 * appropriate security measures for detected threats,
 * and logging and alerting for security events
 */

import { loggingService } from './loggingService';
import { authStateBroadcastService } from './authStateBroadcastService';

export interface SecurityMonitoringConfig {
  enableThreatDetection: boolean;
  enableBehaviorAnalysis: boolean;
  enableGeolocationTracking: boolean;
  enableDeviceFingerprinting: boolean;
  enableRateLimiting: boolean;
  enableAnomalyDetection: boolean;
  maxFailedAttempts: number;
  lockoutDurationMs: number;
  suspiciousActivityThreshold: number;
  anomalyDetectionSensitivity: 'low' | 'medium' | 'high';
  enableAutomaticResponse: boolean;
  enableSecurityAlerts: boolean;
  alertThreshold: number;
  monitoringIntervalMs: number;
}

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  timestamp: number;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  location?: GeolocationData;
  deviceFingerprint?: DeviceFingerprint;
  details: any;
  resolved: boolean;
  responseActions: SecurityAction[];
}

export type SecurityEventType = 
  | 'failed_login'
  | 'suspicious_login'
  | 'multiple_failed_attempts'
  | 'unusual_location'
  | 'device_change'
  | 'rate_limit_exceeded'
  | 'token_manipulation'
  | 'session_hijacking'
  | 'brute_force_attack'
  | 'credential_stuffing'
  | 'anomalous_behavior'
  | 'privilege_escalation'
  | 'data_exfiltration'
  | 'malicious_request';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export type SecurityAction = 
  | 'log_event'
  | 'send_alert'
  | 'lock_account'
  | 'require_mfa'
  | 'invalidate_sessions'
  | 'block_ip'
  | 'rate_limit'
  | 'quarantine_user'
  | 'notify_admin'
  | 'escalate_incident';

export interface GeolocationData {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  isp?: string;
}

export interface DeviceFingerprint {
  userAgent: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
  platform?: string;
  cookiesEnabled?: boolean;
  doNotTrack?: boolean;
  hash?: string;
}

export interface UserBehaviorProfile {
  userId: string;
  loginPatterns: {
    commonTimes: number[];
    commonLocations: GeolocationData[];
    commonDevices: DeviceFingerprint[];
    averageSessionDuration: number;
    typicalActivityLevel: number;
  };
  riskScore: number;
  lastUpdated: number;
  anomalies: Array<{
    type: string;
    timestamp: number;
    severity: SecuritySeverity;
    resolved: boolean;
  }>;
}

export interface ThreatIntelligence {
  maliciousIPs: Set<string>;
  suspiciousUserAgents: RegExp[];
  knownAttackPatterns: Array<{
    pattern: RegExp;
    type: SecurityEventType;
    severity: SecuritySeverity;
  }>;
  compromisedCredentials: Set<string>;
  lastUpdated: number;
}

export interface SecurityMetrics {
  totalEvents: number;
  eventsByType: Record<SecurityEventType, number>;
  eventsBySeverity: Record<SecuritySeverity, number>;
  resolvedEvents: number;
  activeThreats: number;
  averageResponseTime: number;
  falsePositiveRate: number;
  detectionAccuracy: number;
}

class SecurityMonitoringService {
  private config: SecurityMonitoringConfig = {
    enableThreatDetection: true,
    enableBehaviorAnalysis: true,
    enableGeolocationTracking: true,
    enableDeviceFingerprinting: true,
    enableRateLimiting: true,
    enableAnomalyDetection: true,
    maxFailedAttempts: 5,
    lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
    suspiciousActivityThreshold: 10,
    anomalyDetectionSensitivity: 'medium',
    enableAutomaticResponse: true,
    enableSecurityAlerts: true,
    alertThreshold: 3,
    monitoringIntervalMs: 60 * 1000, // 1 minute
  };

  private securityEvents: Map<string, SecurityEvent> = new Map();
  private userBehaviorProfiles: Map<string, UserBehaviorProfile> = new Map();
  private failedAttempts: Map<string, Array<{ timestamp: number; ipAddress?: string }>> = new Map();
  private rateLimits: Map<string, Array<{ timestamp: number; action: string }>> = new Map();
  private lockedAccounts: Map<string, { lockedAt: number; reason: string }> = new Map();
  private threatIntelligence: ThreatIntelligence = {
    maliciousIPs: new Set(),
    suspiciousUserAgents: [
      /bot/i,
      /crawler/i,
      /scanner/i,
      /automated/i,
    ],
    knownAttackPatterns: [
      {
        pattern: /(\bor\b|\bunion\b|\bselect\b|\bdrop\b|\binsert\b|\bupdate\b|\bdelete\b)/i,
        type: 'malicious_request',
        severity: 'high',
      },
      {
        pattern: /<script|javascript:|vbscript:|onload=|onerror=/i,
        type: 'malicious_request',
        severity: 'high',
      },
    ],
    compromisedCredentials: new Set(),
    lastUpdated: Date.now(),
  };

  private monitoringInterval?: NodeJS.Timeout;
  private eventListeners: Array<(event: SecurityEvent) => void> = [];

  constructor() {
    this.initializeMonitoring();
    
    loggingService.info('SecurityMonitoring', 'Security monitoring service initialized', {
      config: this.config,
    });
  }

  /**
   * Record a security event
   */
  recordSecurityEvent(
    type: SecurityEventType,
    severity: SecuritySeverity,
    details: any,
    context?: {
      userId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      location?: GeolocationData;
    }
  ): SecurityEvent {
    const eventId = this.generateEventId();
    const timestamp = Date.now();

    const securityEvent: SecurityEvent = {
      id: eventId,
      type,
      severity,
      timestamp,
      userId: context?.userId,
      sessionId: context?.sessionId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      location: context?.location,
      deviceFingerprint: context?.userAgent ? this.generateDeviceFingerprint(context.userAgent) : undefined,
      details,
      resolved: false,
      responseActions: [],
    };

    this.securityEvents.set(eventId, securityEvent);

    // Analyze and respond to the event
    this.analyzeSecurityEvent(securityEvent);

    // Update user behavior profile if applicable
    if (context?.userId) {
      this.updateUserBehaviorProfile(context.userId, securityEvent);
    }

    // Emit event to listeners
    this.emitSecurityEvent(securityEvent);

    loggingService.warn('SecurityMonitoring', 'Security event recorded', {
      eventId,
      type,
      severity,
      userId: context?.userId,
      ipAddress: context?.ipAddress,
    });

    return securityEvent;
  }

  /**
   * Record failed authentication attempt
   */
  recordFailedAttempt(
    identifier: string, // username, email, or IP
    context?: {
      userId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      location?: GeolocationData;
    }
  ): void {
    const timestamp = Date.now();
    
    // Track failed attempts
    if (!this.failedAttempts.has(identifier)) {
      this.failedAttempts.set(identifier, []);
    }
    
    const attempts = this.failedAttempts.get(identifier)!;
    attempts.push({ timestamp, ipAddress: context?.ipAddress });
    
    // Clean old attempts (older than 1 hour)
    const oneHourAgo = timestamp - (60 * 60 * 1000);
    const recentAttempts = attempts.filter(attempt => attempt.timestamp > oneHourAgo);
    this.failedAttempts.set(identifier, recentAttempts);

    // Check for suspicious activity
    if (recentAttempts.length >= this.config.maxFailedAttempts) {
      this.recordSecurityEvent(
        'multiple_failed_attempts',
        'high',
        {
          identifier,
          attemptCount: recentAttempts.length,
          timeWindow: '1 hour',
        },
        context
      );

      // Lock account if enabled
      if (this.config.enableAutomaticResponse && context?.userId) {
        this.lockAccount(context.userId, 'multiple_failed_attempts');
      }
    } else {
      this.recordSecurityEvent(
        'failed_login',
        'low',
        {
          identifier,
          attemptNumber: recentAttempts.length,
        },
        context
      );
    }
  }

  /**
   * Check for suspicious login patterns
   */
  checkSuspiciousLogin(
    userId: string,
    context: {
      ipAddress?: string;
      userAgent?: string;
      location?: GeolocationData;
    }
  ): boolean {
    if (!this.config.enableBehaviorAnalysis) {
      return false;
    }

    const userProfile = this.userBehaviorProfiles.get(userId);
    if (!userProfile) {
      // First login, create profile
      this.createUserBehaviorProfile(userId, context);
      return false;
    }

    let suspiciousFactors = 0;
    const suspiciousReasons: string[] = [];

    // Check location anomaly
    if (this.config.enableGeolocationTracking && context.location) {
      const isUnusualLocation = this.isUnusualLocation(userProfile, context.location);
      if (isUnusualLocation) {
        suspiciousFactors++;
        suspiciousReasons.push('unusual_location');
      }
    }

    // Check device fingerprint
    if (this.config.enableDeviceFingerprinting && context.userAgent) {
      const deviceFingerprint = this.generateDeviceFingerprint(context.userAgent);
      const isUnusualDevice = this.isUnusualDevice(userProfile, deviceFingerprint);
      if (isUnusualDevice) {
        suspiciousFactors++;
        suspiciousReasons.push('unusual_device');
      }
    }

    // Check time patterns
    const isUnusualTime = this.isUnusualLoginTime(userProfile, Date.now());
    if (isUnusualTime) {
      suspiciousFactors++;
      suspiciousReasons.push('unusual_time');
    }

    // Check against threat intelligence
    if (context.ipAddress && this.threatIntelligence.maliciousIPs.has(context.ipAddress)) {
      suspiciousFactors++;
      suspiciousReasons.push('malicious_ip');
    }

    if (context.userAgent) {
      const isSuspiciousUserAgent = this.threatIntelligence.suspiciousUserAgents.some(
        pattern => pattern.test(context.userAgent!)
      );
      if (isSuspiciousUserAgent) {
        suspiciousFactors++;
        suspiciousReasons.push('suspicious_user_agent');
      }
    }

    // Determine if login is suspicious
    const isSuspicious = suspiciousFactors >= this.getSuspiciousThreshold();

    if (isSuspicious) {
      this.recordSecurityEvent(
        'suspicious_login',
        suspiciousFactors >= 3 ? 'high' : 'medium',
        {
          suspiciousFactors,
          reasons: suspiciousReasons,
          userProfile: {
            riskScore: userProfile.riskScore,
            lastSeen: userProfile.lastUpdated,
          },
        },
        {
          userId,
          ...context,
        }
      );
    }

    return isSuspicious;
  }

  /**
   * Check rate limiting
   */
  checkRateLimit(
    identifier: string, // IP, user ID, or session ID
    action: string,
    limit: number = 10,
    windowMs: number = 60 * 1000 // 1 minute
  ): boolean {
    if (!this.config.enableRateLimiting) {
      return false;
    }

    const now = Date.now();
    const key = `${identifier}:${action}`;
    
    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, []);
    }

    const requests = this.rateLimits.get(key)!;
    
    // Clean old requests
    const windowStart = now - windowMs;
    const recentRequests = requests.filter(req => req.timestamp > windowStart);
    this.rateLimits.set(key, recentRequests);

    // Check if limit exceeded
    if (recentRequests.length >= limit) {
      this.recordSecurityEvent(
        'rate_limit_exceeded',
        'medium',
        {
          identifier,
          action,
          requestCount: recentRequests.length,
          limit,
          windowMs,
        }
      );
      return true;
    }

    // Record this request
    recentRequests.push({ timestamp: now, action });
    return false;
  }

  /**
   * Detect anomalous behavior
   */
  detectAnomalies(
    userId: string,
    activityData: {
      sessionDuration?: number;
      activityLevel?: number;
      requestPatterns?: string[];
      dataAccess?: string[];
    }
  ): Array<{ type: string; severity: SecuritySeverity; confidence: number }> {
    if (!this.config.enableAnomalyDetection) {
      return [];
    }

    const userProfile = this.userBehaviorProfiles.get(userId);
    if (!userProfile) {
      return [];
    }

    const anomalies: Array<{ type: string; severity: SecuritySeverity; confidence: number }> = [];

    // Check session duration anomaly
    if (activityData.sessionDuration !== undefined) {
      const avgDuration = userProfile.loginPatterns.averageSessionDuration;
      const deviation = Math.abs(activityData.sessionDuration - avgDuration) / avgDuration;
      
      if (deviation > this.getAnomalyThreshold()) {
        anomalies.push({
          type: 'unusual_session_duration',
          severity: deviation > 2 ? 'high' : 'medium',
          confidence: Math.min(deviation, 1),
        });
      }
    }

    // Check activity level anomaly
    if (activityData.activityLevel !== undefined) {
      const avgActivity = userProfile.loginPatterns.typicalActivityLevel;
      const deviation = Math.abs(activityData.activityLevel - avgActivity) / avgActivity;
      
      if (deviation > this.getAnomalyThreshold()) {
        anomalies.push({
          type: 'unusual_activity_level',
          severity: deviation > 2 ? 'high' : 'medium',
          confidence: Math.min(deviation, 1),
        });
      }
    }

    // Check for malicious request patterns
    if (activityData.requestPatterns) {
      for (const pattern of activityData.requestPatterns) {
        for (const attackPattern of this.threatIntelligence.knownAttackPatterns) {
          if (attackPattern.pattern.test(pattern)) {
            anomalies.push({
              type: 'malicious_request_pattern',
              severity: attackPattern.severity,
              confidence: 0.9,
            });
          }
        }
      }
    }

    // Record anomalies as security events
    anomalies.forEach(anomaly => {
      this.recordSecurityEvent(
        'anomalous_behavior',
        anomaly.severity,
        {
          anomalyType: anomaly.type,
          confidence: anomaly.confidence,
          activityData,
        },
        { userId }
      );
    });

    return anomalies;
  }

  /**
   * Lock user account
   */
  lockAccount(userId: string, reason: string): void {
    this.lockedAccounts.set(userId, {
      lockedAt: Date.now(),
      reason,
    });

    this.recordSecurityEvent(
      'privilege_escalation', // Using as account action event
      'high',
      {
        action: 'account_locked',
        reason,
      },
      { userId }
    );

    // Invalidate all user sessions
    authStateBroadcastService.broadcastAuthStateChange({
      type: 'account_locked',
      userId,
      reason,
      timestamp: Date.now(),
    });

    loggingService.warn('SecurityMonitoring', 'Account locked', {
      userId,
      reason,
    });
  }

  /**
   * Unlock user account
   */
  unlockAccount(userId: string): boolean {
    const lockInfo = this.lockedAccounts.get(userId);
    if (!lockInfo) {
      return false;
    }

    this.lockedAccounts.delete(userId);

    this.recordSecurityEvent(
      'privilege_escalation', // Using as account action event
      'medium',
      {
        action: 'account_unlocked',
        lockedDuration: Date.now() - lockInfo.lockedAt,
      },
      { userId }
    );

    loggingService.info('SecurityMonitoring', 'Account unlocked', {
      userId,
      lockedDuration: Date.now() - lockInfo.lockedAt,
    });

    return true;
  }

  /**
   * Check if account is locked
   */
  isAccountLocked(userId: string): boolean {
    const lockInfo = this.lockedAccounts.get(userId);
    if (!lockInfo) {
      return false;
    }

    // Check if lockout period has expired
    const lockoutExpiry = lockInfo.lockedAt + this.config.lockoutDurationMs;
    if (Date.now() > lockoutExpiry) {
      this.unlockAccount(userId);
      return false;
    }

    return true;
  }

  /**
   * Get security events
   */
  getSecurityEvents(filters?: {
    type?: SecurityEventType;
    severity?: SecuritySeverity;
    userId?: string;
    resolved?: boolean;
    startTime?: number;
    endTime?: number;
  }): SecurityEvent[] {
    let events = Array.from(this.securityEvents.values());

    if (filters) {
      if (filters.type) {
        events = events.filter(event => event.type === filters.type);
      }
      if (filters.severity) {
        events = events.filter(event => event.severity === filters.severity);
      }
      if (filters.userId) {
        events = events.filter(event => event.userId === filters.userId);
      }
      if (filters.resolved !== undefined) {
        events = events.filter(event => event.resolved === filters.resolved);
      }
      if (filters.startTime) {
        events = events.filter(event => event.timestamp >= filters.startTime!);
      }
      if (filters.endTime) {
        events = events.filter(event => event.timestamp <= filters.endTime!);
      }
    }

    return events.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Resolve security event
   */
  resolveSecurityEvent(eventId: string, resolution: string): boolean {
    const event = this.securityEvents.get(eventId);
    if (!event) {
      return false;
    }

    event.resolved = true;
    event.details.resolution = resolution;
    event.details.resolvedAt = Date.now();

    loggingService.info('SecurityMonitoring', 'Security event resolved', {
      eventId,
      type: event.type,
      resolution,
    });

    return true;
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): SecurityMetrics {
    const events = Array.from(this.securityEvents.values());
    
    const eventsByType: Record<SecurityEventType, number> = {} as any;
    const eventsBySeverity: Record<SecuritySeverity, number> = {} as any;
    
    events.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
    });

    const resolvedEvents = events.filter(e => e.resolved).length;
    const activeThreats = events.filter(e => !e.resolved && e.severity === 'high').length;

    return {
      totalEvents: events.length,
      eventsByType,
      eventsBySeverity,
      resolvedEvents,
      activeThreats,
      averageResponseTime: this.calculateAverageResponseTime(events),
      falsePositiveRate: this.calculateFalsePositiveRate(events),
      detectionAccuracy: this.calculateDetectionAccuracy(events),
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SecurityMonitoringConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    // Restart monitoring if interval changed
    if (oldConfig.monitoringIntervalMs !== this.config.monitoringIntervalMs) {
      this.initializeMonitoring();
    }
    
    loggingService.info('SecurityMonitoring', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): SecurityMonitoringConfig {
    return { ...this.config };
  }

  /**
   * Add security event listener
   */
  addSecurityEventListener(listener: (event: SecurityEvent) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove security event listener
   */
  removeSecurityEventListener(listener: (event: SecurityEvent) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  // Private helper methods

  private initializeMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.performSecurityCheck();
    }, this.config.monitoringIntervalMs);
  }

  private performSecurityCheck(): void {
    // Clean up old data
    this.cleanupOldData();
    
    // Check for patterns in recent events
    this.analyzeEventPatterns();
    
    // Update threat intelligence
    this.updateThreatIntelligence();
  }

  private cleanupOldData(): void {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    // Clean old security events
    this.securityEvents.forEach((event, id) => {
      if (event.timestamp < oneWeekAgo && event.resolved) {
        this.securityEvents.delete(id);
      }
    });

    // Clean old failed attempts
    this.failedAttempts.forEach((attempts, key) => {
      const recentAttempts = attempts.filter(attempt => attempt.timestamp > oneWeekAgo);
      if (recentAttempts.length === 0) {
        this.failedAttempts.delete(key);
      } else {
        this.failedAttempts.set(key, recentAttempts);
      }
    });

    // Clean old rate limits
    this.rateLimits.forEach((requests, key) => {
      const recentRequests = requests.filter(req => req.timestamp > oneWeekAgo);
      if (recentRequests.length === 0) {
        this.rateLimits.delete(key);
      } else {
        this.rateLimits.set(key, recentRequests);
      }
    });
  }

  private analyzeEventPatterns(): void {
    const recentEvents = this.getSecurityEvents({
      startTime: Date.now() - (24 * 60 * 60 * 1000), // Last 24 hours
    });

    // Look for coordinated attacks
    const ipGroups = new Map<string, SecurityEvent[]>();
    recentEvents.forEach(event => {
      if (event.ipAddress) {
        if (!ipGroups.has(event.ipAddress)) {
          ipGroups.set(event.ipAddress, []);
        }
        ipGroups.get(event.ipAddress)!.push(event);
      }
    });

    ipGroups.forEach((events, ipAddress) => {
      if (events.length >= this.config.alertThreshold) {
        this.recordSecurityEvent(
          'brute_force_attack',
          'high',
          {
            ipAddress,
            eventCount: events.length,
            timeWindow: '24 hours',
            eventTypes: [...new Set(events.map(e => e.type))],
          }
        );
      }
    });
  }

  private updateThreatIntelligence(): void {
    // This would typically fetch from external threat intelligence feeds
    // For now, we'll update based on our own observations
    
    const highSeverityEvents = this.getSecurityEvents({
      severity: 'high',
      startTime: Date.now() - (24 * 60 * 60 * 1000),
    });

    highSeverityEvents.forEach(event => {
      if (event.ipAddress && event.type === 'brute_force_attack') {
        this.threatIntelligence.maliciousIPs.add(event.ipAddress);
      }
    });

    this.threatIntelligence.lastUpdated = Date.now();
  }

  private analyzeSecurityEvent(event: SecurityEvent): void {
    const actions: SecurityAction[] = ['log_event'];

    // Determine response actions based on event type and severity
    switch (event.type) {
      case 'multiple_failed_attempts':
      case 'brute_force_attack':
        actions.push('send_alert', 'rate_limit');
        if (event.severity === 'high') {
          actions.push('block_ip');
        }
        break;
        
      case 'suspicious_login':
        actions.push('require_mfa');
        if (event.severity === 'high') {
          actions.push('send_alert');
        }
        break;
        
      case 'session_hijacking':
      case 'token_manipulation':
        actions.push('invalidate_sessions', 'send_alert');
        break;
        
      case 'anomalous_behavior':
        if (event.severity === 'high') {
          actions.push('quarantine_user', 'notify_admin');
        }
        break;
        
      case 'malicious_request':
        actions.push('block_ip', 'send_alert');
        break;
    }

    // Execute automatic responses if enabled
    if (this.config.enableAutomaticResponse) {
      this.executeSecurityActions(event, actions);
    }

    event.responseActions = actions;
  }

  private executeSecurityActions(event: SecurityEvent, actions: SecurityAction[]): void {
    actions.forEach(action => {
      try {
        switch (action) {
          case 'lock_account':
            if (event.userId) {
              this.lockAccount(event.userId, event.type);
            }
            break;
            
          case 'invalidate_sessions':
            if (event.userId) {
              authStateBroadcastService.broadcastAuthStateChange({
                type: 'security_invalidation',
                userId: event.userId,
                reason: event.type,
                timestamp: Date.now(),
              });
            }
            break;
            
          case 'send_alert':
            if (this.config.enableSecurityAlerts) {
              this.sendSecurityAlert(event);
            }
            break;
            
          // Other actions would be implemented based on requirements
        }
      } catch (error: any) {
        loggingService.error('SecurityMonitoring', 'Failed to execute security action', {
          action,
          eventId: event.id,
          error: error.message,
        });
      }
    });
  }

  private sendSecurityAlert(event: SecurityEvent): void {
    // This would typically send alerts via email, SMS, or push notifications
    loggingService.warn('SecurityMonitoring', 'Security alert triggered', {
      eventId: event.id,
      type: event.type,
      severity: event.severity,
      userId: event.userId,
      ipAddress: event.ipAddress,
    });
  }

  private generateEventId(): string {
    return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateDeviceFingerprint(userAgent: string): DeviceFingerprint {
    return {
      userAgent,
      hash: this.hashString(userAgent),
    };
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private createUserBehaviorProfile(userId: string, context: any): void {
    const profile: UserBehaviorProfile = {
      userId,
      loginPatterns: {
        commonTimes: [new Date().getHours()],
        commonLocations: context.location ? [context.location] : [],
        commonDevices: context.userAgent ? [this.generateDeviceFingerprint(context.userAgent)] : [],
        averageSessionDuration: 30 * 60 * 1000, // Default 30 minutes
        typicalActivityLevel: 50, // Default medium activity
      },
      riskScore: 0,
      lastUpdated: Date.now(),
      anomalies: [],
    };

    this.userBehaviorProfiles.set(userId, profile);
  }

  private updateUserBehaviorProfile(userId: string, event: SecurityEvent): void {
    let profile = this.userBehaviorProfiles.get(userId);
    if (!profile) {
      this.createUserBehaviorProfile(userId, event);
      profile = this.userBehaviorProfiles.get(userId)!;
    }

    // Update risk score based on event
    const riskIncrease = this.getRiskIncrease(event.type, event.severity);
    profile.riskScore = Math.min(100, profile.riskScore + riskIncrease);

    // Add anomaly if applicable
    if (event.type === 'anomalous_behavior' || event.type === 'suspicious_login') {
      profile.anomalies.push({
        type: event.type,
        timestamp: event.timestamp,
        severity: event.severity,
        resolved: false,
      });
    }

    profile.lastUpdated = Date.now();
  }

  private getRiskIncrease(eventType: SecurityEventType, severity: SecuritySeverity): number {
    const baseRisk = {
      'low': 1,
      'medium': 5,
      'high': 15,
      'critical': 30,
    };

    const typeMultiplier = {
      'failed_login': 0.5,
      'suspicious_login': 1,
      'multiple_failed_attempts': 2,
      'brute_force_attack': 3,
      'session_hijacking': 4,
      'malicious_request': 3,
    };

    return baseRisk[severity] * (typeMultiplier[eventType] || 1);
  }

  private isUnusualLocation(profile: UserBehaviorProfile, location: GeolocationData): boolean {
    if (profile.loginPatterns.commonLocations.length === 0) {
      return false;
    }

    // Simple distance-based check (in a real implementation, you'd use proper geolocation)
    return !profile.loginPatterns.commonLocations.some(commonLocation => 
      commonLocation.country === location.country
    );
  }

  private isUnusualDevice(profile: UserBehaviorProfile, device: DeviceFingerprint): boolean {
    if (profile.loginPatterns.commonDevices.length === 0) {
      return false;
    }

    return !profile.loginPatterns.commonDevices.some(commonDevice => 
      commonDevice.hash === device.hash
    );
  }

  private isUnusualLoginTime(profile: UserBehaviorProfile, timestamp: number): boolean {
    const hour = new Date(timestamp).getHours();
    const commonHours = profile.loginPatterns.commonTimes;
    
    if (commonHours.length === 0) {
      return false;
    }

    // Check if current hour is within 2 hours of any common time
    return !commonHours.some(commonHour => Math.abs(hour - commonHour) <= 2);
  }

  private getSuspiciousThreshold(): number {
    switch (this.config.anomalyDetectionSensitivity) {
      case 'low': return 3;
      case 'medium': return 2;
      case 'high': return 1;
      default: return 2;
    }
  }

  private getAnomalyThreshold(): number {
    switch (this.config.anomalyDetectionSensitivity) {
      case 'low': return 2.0;
      case 'medium': return 1.5;
      case 'high': return 1.0;
      default: return 1.5;
    }
  }

  private calculateAverageResponseTime(events: SecurityEvent[]): number {
    const resolvedEvents = events.filter(e => e.resolved && e.details.resolvedAt);
    if (resolvedEvents.length === 0) return 0;

    const totalResponseTime = resolvedEvents.reduce((sum, event) => {
      return sum + (event.details.resolvedAt - event.timestamp);
    }, 0);

    return totalResponseTime / resolvedEvents.length;
  }

  private calculateFalsePositiveRate(events: SecurityEvent[]): number {
    const resolvedEvents = events.filter(e => e.resolved);
    if (resolvedEvents.length === 0) return 0;

    const falsePositives = resolvedEvents.filter(e => 
      e.details.resolution && e.details.resolution.includes('false_positive')
    );

    return falsePositives.length / resolvedEvents.length;
  }

  private calculateDetectionAccuracy(events: SecurityEvent[]): number {
    const resolvedEvents = events.filter(e => e.resolved);
    if (resolvedEvents.length === 0) return 0;

    const truePositives = resolvedEvents.filter(e => 
      e.details.resolution && !e.details.resolution.includes('false_positive')
    );

    return truePositives.length / resolvedEvents.length;
  }

  private emitSecurityEvent(event: SecurityEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error: any) {
        loggingService.error('SecurityMonitoring', 'Error in security event listener', {
          error: error.message,
          eventType: event.type,
        });
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.securityEvents.clear();
    this.userBehaviorProfiles.clear();
    this.failedAttempts.clear();
    this.rateLimits.clear();
    this.lockedAccounts.clear();
    this.eventListeners.length = 0;
    
    loggingService.info('SecurityMonitoring', 'Security monitoring service destroyed');
  }
}

export const securityMonitoringService = new SecurityMonitoringService();
export type { 
  SecurityMonitoringConfig, 
  SecurityEvent, 
  SecurityEventType, 
  SecuritySeverity, 
  SecurityAction,
  GeolocationData,
  DeviceFingerprint,
  UserBehaviorProfile,
  ThreatIntelligence,
  SecurityMetrics
};