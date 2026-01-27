/**
 * Property Test 30: Security Monitoring
 * Validates Requirements 10.5: Security monitoring and threat detection
 * 
 * This property test ensures that:
 * - Detection for suspicious authentication activity
 * - Appropriate security measures for detected threats
 * - Logging and alerting for security events
 * - Behavior analysis and anomaly detection
 * - Rate limiting and account protection
 */

import fc from 'fast-check';
import { 
  securityMonitoringService, 
  SecurityEvent, 
  SecurityEventType, 
  SecuritySeverity,
  GeolocationData,
  DeviceFingerprint
} from '../services/securityMonitoringService';

describe('Property Test 30: Security Monitoring', () => {
  beforeEach(() => {
    // Configure for testing
    securityMonitoringService.updateConfig({
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
      monitoringIntervalMs: 5000, // 5 seconds for testing
    });

    // Clean up any existing events
    const existingEvents = securityMonitoringService.getSecurityEvents();
    existingEvents.forEach(event => {
      securityMonitoringService.resolveSecurityEvent(event.id, 'test_cleanup');
    });
  });

  afterEach(() => {
    // Clean up after each test
    const events = securityMonitoringService.getSecurityEvents();
    events.forEach(event => {
      securityMonitoringService.resolveSecurityEvent(event.id, 'test_cleanup');
    });
  });

  /**
   * Property: Security events are recorded correctly
   */
  it('should record security events with proper metadata', () => {
    fc.assert(fc.property(
      fc.record({
        eventType: fc.constantFrom(
          'failed_login', 'suspicious_login', 'multiple_failed_attempts',
          'unusual_location', 'device_change', 'rate_limit_exceeded',
          'token_manipulation', 'session_hijacking', 'brute_force_attack',
          'anomalous_behavior', 'malicious_request'
        ),
        severity: fc.constantFrom('low', 'medium', 'high', 'critical'),
        userId: fc.string({ minLength: 5, maxLength: 30 }),
        sessionId: fc.string({ minLength: 10, maxLength: 50 }),
        ipAddress: fc.ipV4(),
        userAgent: fc.string({ minLength: 20, maxLength: 100 }),
        details: fc.record({
          reason: fc.string({ minLength: 5, maxLength: 50 }),
          metadata: fc.anything(),
        }),
      }),
      ({ eventType, severity, userId, sessionId, ipAddress, userAgent, details }) => {
        const event = securityMonitoringService.recordSecurityEvent(
          eventType as SecurityEventType,
          severity as SecuritySeverity,
          details,
          {
            userId,
            sessionId,
            ipAddress,
            userAgent,
          }
        );

        expect(event.id).toBeDefined();
        expect(event.type).toBe(eventType);
        expect(event.severity).toBe(severity);
        expect(event.userId).toBe(userId);
        expect(event.sessionId).toBe(sessionId);
        expect(event.ipAddress).toBe(ipAddress);
        expect(event.userAgent).toBe(userAgent);
        expect(event.timestamp).toBeGreaterThan(0);
        expect(event.resolved).toBe(false);
        expect(event.responseActions).toBeDefined();
        expect(Array.isArray(event.responseActions)).toBe(true);
        expect(event.details).toEqual(details);

        // Verify event can be retrieved
        const retrievedEvent = securityMonitoringService.getSecurityEvents({ type: eventType })[0];
        expect(retrievedEvent).toBeDefined();
        expect(retrievedEvent.id).toBe(event.id);
      }
    ), { numRuns: 25 });
  });

  /**
   * Property: Failed attempt tracking works correctly
   */
  it('should track failed attempts and trigger security measures', () => {
    fc.assert(fc.property(
      fc.record({
        identifier: fc.string({ minLength: 5, maxLength: 30 }),
        userId: fc.string({ minLength: 5, maxLength: 30 }),
        ipAddress: fc.ipV4(),
        attemptCount: fc.integer({ min: 1, max: 10 }),
        userAgent: fc.string({ minLength: 20, maxLength: 100 }),
      }),
      ({ identifier, userId, ipAddress, attemptCount, userAgent }) => {
        const initialEvents = securityMonitoringService.getSecurityEvents().length;

        // Record multiple failed attempts
        for (let i = 0; i < attemptCount; i++) {
          securityMonitoringService.recordFailedAttempt(identifier, {
            userId,
            ipAddress,
            userAgent,
          });
        }

        const events = securityMonitoringService.getSecurityEvents();
        const newEvents = events.slice(0, events.length - initialEvents);

        // Should have recorded events for each attempt
        expect(newEvents.length).toBeGreaterThanOrEqual(attemptCount);

        // Check for failed login events
        const failedLoginEvents = newEvents.filter(e => e.type === 'failed_login');
        expect(failedLoginEvents.length).toBeGreaterThan(0);

        // If attempts exceed threshold, should trigger multiple failed attempts event
        if (attemptCount >= 5) {
          const multipleFailedEvents = newEvents.filter(e => e.type === 'multiple_failed_attempts');
          expect(multipleFailedEvents.length).toBeGreaterThan(0);

          // Account should be locked
          expect(securityMonitoringService.isAccountLocked(userId)).toBe(true);
        }

        // All events should have proper context
        newEvents.forEach(event => {
          expect(event.userId).toBe(userId);
          expect(event.ipAddress).toBe(ipAddress);
          expect(event.userAgent).toBe(userAgent);
        });
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Suspicious login detection works correctly
   */
  it('should detect suspicious login patterns', () => {
    fc.assert(fc.property(
      fc.record({
        userId: fc.string({ minLength: 5, maxLength: 30 }),
        normalLocation: fc.record({
          country: fc.string({ minLength: 2, maxLength: 20 }),
          region: fc.string({ minLength: 2, maxLength: 20 }),
          city: fc.string({ minLength: 2, maxLength: 20 }),
        }),
        suspiciousLocation: fc.record({
          country: fc.string({ minLength: 2, maxLength: 20 }),
          region: fc.string({ minLength: 2, maxLength: 20 }),
          city: fc.string({ minLength: 2, maxLength: 20 }),
        }),
        normalUserAgent: fc.string({ minLength: 20, maxLength: 100 }),
        suspiciousUserAgent: fc.string({ minLength: 20, maxLength: 100 }),
        ipAddress: fc.ipV4(),
      }),
      ({ userId, normalLocation, suspiciousLocation, normalUserAgent, suspiciousUserAgent, ipAddress }) => {
        fc.pre(normalLocation.country !== suspiciousLocation.country);
        fc.pre(normalUserAgent !== suspiciousUserAgent);

        // Establish normal behavior pattern
        for (let i = 0; i < 3; i++) {
          const isSuspicious = securityMonitoringService.checkSuspiciousLogin(userId, {
            ipAddress,
            userAgent: normalUserAgent,
            location: normalLocation,
          });
          expect(isSuspicious).toBe(false); // First few logins should not be suspicious
        }

        // Test suspicious login with different location
        const suspiciousLocationResult = securityMonitoringService.checkSuspiciousLogin(userId, {
          ipAddress,
          userAgent: normalUserAgent,
          location: suspiciousLocation,
        });

        // Test suspicious login with different device
        const suspiciousDeviceResult = securityMonitoringService.checkSuspiciousLogin(userId, {
          ipAddress,
          userAgent: suspiciousUserAgent,
          location: normalLocation,
        });

        // At least one should be detected as suspicious
        expect(suspiciousLocationResult || suspiciousDeviceResult).toBe(true);

        // Check for suspicious login events
        const suspiciousEvents = securityMonitoringService.getSecurityEvents({
          type: 'suspicious_login',
          userId,
        });
        expect(suspiciousEvents.length).toBeGreaterThan(0);

        suspiciousEvents.forEach(event => {
          expect(event.userId).toBe(userId);
          expect(event.details.suspiciousFactors).toBeGreaterThan(0);
          expect(Array.isArray(event.details.reasons)).toBe(true);
        });
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: Rate limiting works correctly
   */
  it('should enforce rate limits correctly', () => {
    fc.assert(fc.property(
      fc.record({
        identifier: fc.string({ minLength: 5, maxLength: 30 }),
        action: fc.string({ minLength: 3, maxLength: 20 }),
        requestCount: fc.integer({ min: 1, max: 20 }),
        limit: fc.integer({ min: 5, max: 15 }),
        windowMs: fc.integer({ min: 10000, max: 60000 }),
      }),
      ({ identifier, action, requestCount, limit, windowMs }) => {
        let rateLimitHit = false;

        // Make multiple requests
        for (let i = 0; i < requestCount; i++) {
          const isRateLimited = securityMonitoringService.checkRateLimit(
            identifier,
            action,
            limit,
            windowMs
          );

          if (i >= limit) {
            expect(isRateLimited).toBe(true);
            rateLimitHit = true;
          } else {
            expect(isRateLimited).toBe(false);
          }
        }

        // If rate limit was hit, should have rate limit events
        if (rateLimitHit) {
          const rateLimitEvents = securityMonitoringService.getSecurityEvents({
            type: 'rate_limit_exceeded',
          });
          expect(rateLimitEvents.length).toBeGreaterThan(0);

          const relevantEvent = rateLimitEvents.find(e => 
            e.details.identifier === identifier && e.details.action === action
          );
          expect(relevantEvent).toBeDefined();
          expect(relevantEvent!.details.limit).toBe(limit);
        }
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Anomaly detection works correctly
   */
  it('should detect behavioral anomalies', () => {
    fc.assert(fc.property(
      fc.record({
        userId: fc.string({ minLength: 5, maxLength: 30 }),
        normalSessionDuration: fc.integer({ min: 300000, max: 1800000 }), // 5-30 minutes
        anomalousSessionDuration: fc.integer({ min: 3600000, max: 7200000 }), // 1-2 hours
        normalActivityLevel: fc.integer({ min: 40, max: 60 }),
        anomalousActivityLevel: fc.integer({ min: 90, max: 100 }),
        maliciousPattern: fc.constantFrom(
          'SELECT * FROM users',
          '<script>alert("xss")</script>',
          'DROP TABLE users',
          'UNION SELECT password FROM accounts'
        ),
      }),
      ({ userId, normalSessionDuration, anomalousSessionDuration, normalActivityLevel, anomalousActivityLevel, maliciousPattern }) => {
        // Establish normal behavior
        for (let i = 0; i < 3; i++) {
          const anomalies = securityMonitoringService.detectAnomalies(userId, {
            sessionDuration: normalSessionDuration,
            activityLevel: normalActivityLevel,
          });
          // Normal behavior should not trigger anomalies initially
        }

        // Test anomalous session duration
        const sessionAnomalies = securityMonitoringService.detectAnomalies(userId, {
          sessionDuration: anomalousSessionDuration,
          activityLevel: normalActivityLevel,
        });

        // Test anomalous activity level
        const activityAnomalies = securityMonitoringService.detectAnomalies(userId, {
          sessionDuration: normalSessionDuration,
          activityLevel: anomalousActivityLevel,
        });

        // Test malicious request patterns
        const patternAnomalies = securityMonitoringService.detectAnomalies(userId, {
          requestPatterns: [maliciousPattern],
        });

        // Should detect at least some anomalies
        const totalAnomalies = sessionAnomalies.length + activityAnomalies.length + patternAnomalies.length;
        expect(totalAnomalies).toBeGreaterThan(0);

        // Check for anomalous behavior events
        const anomalyEvents = securityMonitoringService.getSecurityEvents({
          type: 'anomalous_behavior',
          userId,
        });
        expect(anomalyEvents.length).toBeGreaterThan(0);

        anomalyEvents.forEach(event => {
          expect(event.userId).toBe(userId);
          expect(event.details.anomalyType).toBeDefined();
          expect(event.details.confidence).toBeGreaterThan(0);
          expect(event.details.confidence).toBeLessThanOrEqual(1);
        });
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: Account locking and unlocking works correctly
   */
  it('should lock and unlock accounts correctly', () => {
    fc.assert(fc.property(
      fc.record({
        userId: fc.string({ minLength: 5, maxLength: 30 }),
        lockReason: fc.string({ minLength: 5, max: 50 }),
      }),
      ({ userId, lockReason }) => {
        // Initially account should not be locked
        expect(securityMonitoringService.isAccountLocked(userId)).toBe(false);

        // Lock account
        securityMonitoringService.lockAccount(userId, lockReason);
        expect(securityMonitoringService.isAccountLocked(userId)).toBe(true);

        // Check for lock event
        const lockEvents = securityMonitoringService.getSecurityEvents({
          userId,
        }).filter(e => e.details.action === 'account_locked');
        expect(lockEvents.length).toBeGreaterThan(0);
        expect(lockEvents[0].details.reason).toBe(lockReason);

        // Unlock account
        const unlocked = securityMonitoringService.unlockAccount(userId);
        expect(unlocked).toBe(true);
        expect(securityMonitoringService.isAccountLocked(userId)).toBe(false);

        // Check for unlock event
        const unlockEvents = securityMonitoringService.getSecurityEvents({
          userId,
        }).filter(e => e.details.action === 'account_unlocked');
        expect(unlockEvents.length).toBeGreaterThan(0);

        // Trying to unlock again should return false
        const alreadyUnlocked = securityMonitoringService.unlockAccount(userId);
        expect(alreadyUnlocked).toBe(false);
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Event filtering and retrieval works correctly
   */
  it('should filter and retrieve events correctly', () => {
    fc.assert(fc.property(
      fc.record({
        userId1: fc.string({ minLength: 5, maxLength: 30 }),
        userId2: fc.string({ minLength: 5, maxLength: 30 }),
        eventType1: fc.constantFrom('failed_login', 'suspicious_login', 'rate_limit_exceeded'),
        eventType2: fc.constantFrom('brute_force_attack', 'anomalous_behavior', 'malicious_request'),
        severity1: fc.constantFrom('low', 'medium'),
        severity2: fc.constantFrom('high', 'critical'),
      }),
      ({ userId1, userId2, eventType1, eventType2, severity1, severity2 }) => {
        fc.pre(userId1 !== userId2);
        fc.pre(eventType1 !== eventType2);
        fc.pre(severity1 !== severity2);

        // Record events for different users, types, and severities
        const event1 = securityMonitoringService.recordSecurityEvent(
          eventType1 as SecurityEventType,
          severity1 as SecuritySeverity,
          { test: 'data1' },
          { userId: userId1 }
        );

        const event2 = securityMonitoringService.recordSecurityEvent(
          eventType2 as SecurityEventType,
          severity2 as SecuritySeverity,
          { test: 'data2' },
          { userId: userId2 }
        );

        // Test filtering by user
        const user1Events = securityMonitoringService.getSecurityEvents({ userId: userId1 });
        expect(user1Events.some(e => e.id === event1.id)).toBe(true);
        expect(user1Events.some(e => e.id === event2.id)).toBe(false);

        const user2Events = securityMonitoringService.getSecurityEvents({ userId: userId2 });
        expect(user2Events.some(e => e.id === event2.id)).toBe(true);
        expect(user2Events.some(e => e.id === event1.id)).toBe(false);

        // Test filtering by type
        const type1Events = securityMonitoringService.getSecurityEvents({ type: eventType1 as SecurityEventType });
        expect(type1Events.some(e => e.id === event1.id)).toBe(true);
        expect(type1Events.some(e => e.id === event2.id)).toBe(false);

        // Test filtering by severity
        const severity1Events = securityMonitoringService.getSecurityEvents({ severity: severity1 as SecuritySeverity });
        expect(severity1Events.some(e => e.id === event1.id)).toBe(true);
        expect(severity1Events.some(e => e.id === event2.id)).toBe(false);

        // Test filtering by resolved status
        const unresolvedEvents = securityMonitoringService.getSecurityEvents({ resolved: false });
        expect(unresolvedEvents.some(e => e.id === event1.id)).toBe(true);
        expect(unresolvedEvents.some(e => e.id === event2.id)).toBe(true);

        // Resolve one event and test again
        securityMonitoringService.resolveSecurityEvent(event1.id, 'test_resolution');
        
        const stillUnresolvedEvents = securityMonitoringService.getSecurityEvents({ resolved: false });
        expect(stillUnresolvedEvents.some(e => e.id === event1.id)).toBe(false);
        expect(stillUnresolvedEvents.some(e => e.id === event2.id)).toBe(true);

        const resolvedEvents = securityMonitoringService.getSecurityEvents({ resolved: true });
        expect(resolvedEvents.some(e => e.id === event1.id)).toBe(true);
        expect(resolvedEvents.some(e => e.id === event2.id)).toBe(false);
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: Security metrics are accurate
   */
  it('should provide accurate security metrics', () => {
    fc.assert(fc.property(
      fc.record({
        eventCount: fc.integer({ min: 1, max: 10 }),
        resolvedCount: fc.integer({ min: 0, max: 5 }),
      }),
      ({ eventCount, resolvedCount }) => {
        fc.pre(resolvedCount <= eventCount);

        const eventTypes: SecurityEventType[] = ['failed_login', 'suspicious_login', 'rate_limit_exceeded'];
        const severities: SecuritySeverity[] = ['low', 'medium', 'high'];
        const createdEvents: SecurityEvent[] = [];

        // Create events
        for (let i = 0; i < eventCount; i++) {
          const eventType = eventTypes[i % eventTypes.length];
          const severity = severities[i % severities.length];
          
          const event = securityMonitoringService.recordSecurityEvent(
            eventType,
            severity,
            { testData: i },
            { userId: `user_${i}` }
          );
          createdEvents.push(event);
        }

        // Resolve some events
        for (let i = 0; i < resolvedCount; i++) {
          securityMonitoringService.resolveSecurityEvent(
            createdEvents[i].id,
            'test_resolution'
          );
        }

        const metrics = securityMonitoringService.getSecurityMetrics();

        expect(metrics.totalEvents).toBeGreaterThanOrEqual(eventCount);
        expect(metrics.resolvedEvents).toBeGreaterThanOrEqual(resolvedCount);
        expect(metrics.eventsByType).toBeDefined();
        expect(metrics.eventsBySeverity).toBeDefined();
        expect(metrics.averageResponseTime).toBeGreaterThanOrEqual(0);
        expect(metrics.falsePositiveRate).toBeGreaterThanOrEqual(0);
        expect(metrics.falsePositiveRate).toBeLessThanOrEqual(1);
        expect(metrics.detectionAccuracy).toBeGreaterThanOrEqual(0);
        expect(metrics.detectionAccuracy).toBeLessThanOrEqual(1);

        // Verify event type counts
        Object.keys(metrics.eventsByType).forEach(type => {
          expect(metrics.eventsByType[type as SecurityEventType]).toBeGreaterThan(0);
        });

        // Verify severity counts
        Object.keys(metrics.eventsBySeverity).forEach(severity => {
          expect(metrics.eventsBySeverity[severity as SecuritySeverity]).toBeGreaterThan(0);
        });
      }
    ), { numRuns: 10 });
  });

  /**
   * Property: Configuration changes affect behavior
   */
  it('should respect configuration changes', () => {
    fc.assert(fc.property(
      fc.record({
        enableThreatDetection: fc.boolean(),
        enableBehaviorAnalysis: fc.boolean(),
        enableRateLimiting: fc.boolean(),
        enableAnomalyDetection: fc.boolean(),
        maxFailedAttempts: fc.integer({ min: 3, max: 10 }),
        anomalyDetectionSensitivity: fc.constantFrom('low', 'medium', 'high'),
        enableAutomaticResponse: fc.boolean(),
      }),
      ({ enableThreatDetection, enableBehaviorAnalysis, enableRateLimiting, 
         enableAnomalyDetection, maxFailedAttempts, anomalyDetectionSensitivity, enableAutomaticResponse }) => {
        
        // Update configuration
        securityMonitoringService.updateConfig({
          enableThreatDetection,
          enableBehaviorAnalysis,
          enableRateLimiting,
          enableAnomalyDetection,
          maxFailedAttempts,
          anomalyDetectionSensitivity: anomalyDetectionSensitivity as 'low' | 'medium' | 'high',
          enableAutomaticResponse,
        });

        // Verify configuration was applied
        const currentConfig = securityMonitoringService.getConfig();
        expect(currentConfig.enableThreatDetection).toBe(enableThreatDetection);
        expect(currentConfig.enableBehaviorAnalysis).toBe(enableBehaviorAnalysis);
        expect(currentConfig.enableRateLimiting).toBe(enableRateLimiting);
        expect(currentConfig.enableAnomalyDetection).toBe(enableAnomalyDetection);
        expect(currentConfig.maxFailedAttempts).toBe(maxFailedAttempts);
        expect(currentConfig.anomalyDetectionSensitivity).toBe(anomalyDetectionSensitivity);
        expect(currentConfig.enableAutomaticResponse).toBe(enableAutomaticResponse);

        // Test behavior with new configuration
        const userId = 'test_config_user';
        const identifier = 'test_identifier';

        // Test failed attempts with new threshold
        for (let i = 0; i < maxFailedAttempts + 1; i++) {
          securityMonitoringService.recordFailedAttempt(identifier, { userId });
        }

        // Should trigger multiple failed attempts event at the configured threshold
        const multipleFailedEvents = securityMonitoringService.getSecurityEvents({
          type: 'multiple_failed_attempts',
        });
        expect(multipleFailedEvents.length).toBeGreaterThan(0);

        // Account locking should depend on automatic response setting
        const isLocked = securityMonitoringService.isAccountLocked(userId);
        expect(isLocked).toBe(enableAutomaticResponse);

        // Test rate limiting behavior
        const rateLimitResult = securityMonitoringService.checkRateLimit(identifier, 'test_action', 1, 60000);
        if (enableRateLimiting) {
          // Second call should be rate limited
          const secondResult = securityMonitoringService.checkRateLimit(identifier, 'test_action', 1, 60000);
          expect(secondResult).toBe(true);
        }

        // Test anomaly detection behavior
        if (enableAnomalyDetection) {
          const anomalies = securityMonitoringService.detectAnomalies(userId, {
            sessionDuration: 7200000, // 2 hours - should be anomalous
          });
          // Behavior depends on sensitivity, but should be consistent
          expect(Array.isArray(anomalies)).toBe(true);
        }
      }
    ), { numRuns: 10 });
  });

  /**
   * Property: Event listeners receive correct events
   */
  it('should emit security events to listeners correctly', () => {
    fc.assert(fc.property(
      fc.record({
        eventType: fc.constantFrom('failed_login', 'suspicious_login', 'anomalous_behavior'),
        severity: fc.constantFrom('low', 'medium', 'high'),
        userId: fc.string({ minLength: 5, maxLength: 30 }),
      }),
      ({ eventType, severity, userId }) => {
        const receivedEvents: SecurityEvent[] = [];
        
        const eventListener = (event: SecurityEvent) => {
          receivedEvents.push(event);
        };

        securityMonitoringService.addSecurityEventListener(eventListener);

        try {
          // Record security event
          const recordedEvent = securityMonitoringService.recordSecurityEvent(
            eventType as SecurityEventType,
            severity as SecuritySeverity,
            { test: 'data' },
            { userId }
          );

          // Should have received the event
          expect(receivedEvents.length).toBeGreaterThan(0);
          
          const receivedEvent = receivedEvents.find(e => e.id === recordedEvent.id);
          expect(receivedEvent).toBeDefined();
          expect(receivedEvent!.type).toBe(eventType);
          expect(receivedEvent!.severity).toBe(severity);
          expect(receivedEvent!.userId).toBe(userId);

        } finally {
          securityMonitoringService.removeSecurityEventListener(eventListener);
        }
      }
    ), { numRuns: 15 });
  });
});