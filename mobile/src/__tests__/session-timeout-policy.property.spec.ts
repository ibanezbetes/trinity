/**
 * Property Test 29: Session Timeout Policy
 * Validates Requirements 10.4: Session timeout configuration and enforcement
 * 
 * This property test ensures that:
 * - Proper session timeout configuration and enforcement
 * - Automatic session cleanup for expired sessions
 * - Session timeout warnings for users
 * - Activity tracking and idle detection
 * - Session extension and renewal mechanisms
 */

import fc from 'fast-check';
import { sessionTimeoutService, SessionInfo, TimeoutEvent, ActivityEvent } from '../services/sessionTimeoutService';

describe('Property Test 29: Session Timeout Policy', () => {
  beforeEach(() => {
    // Configure for testing
    sessionTimeoutService.updateConfig({
      enableTimeoutEnforcement: true,
      sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
      warningTimeoutMs: 5 * 60 * 1000, // 5 minutes before expiry
      idleTimeoutMs: 15 * 60 * 1000, // 15 minutes idle
      enableIdleDetection: true,
      enableWarningNotifications: true,
      enableAutomaticExtension: false,
      maxExtensions: 3,
      extensionDurationMs: 15 * 60 * 1000, // 15 minutes extension
      enableGracePeriod: true,
      gracePeriodMs: 2 * 60 * 1000, // 2 minutes grace period
      enableActivityTracking: true,
      activityCheckIntervalMs: 1000, // 1 second for testing
    });

    // Clean up any existing sessions
    const activeSessions = sessionTimeoutService.getActiveSessions();
    activeSessions.forEach(session => {
      sessionTimeoutService.removeSession(session.sessionId);
    });
  });

  afterEach(() => {
    // Clean up sessions after each test
    const activeSessions = sessionTimeoutService.getActiveSessions();
    activeSessions.forEach(session => {
      sessionTimeoutService.removeSession(session.sessionId);
    });
  });

  /**
   * Property: Sessions are created with proper timeout configuration
   */
  it('should create sessions with proper timeout configuration', () => {
    fc.assert(fc.property(
      fc.record({
        sessionId: fc.string({ minLength: 10, maxLength: 50 }),
        userId: fc.string({ minLength: 5, maxLength: 30 }),
        customTimeout: fc.option(fc.integer({ min: 60000, max: 7200000 })), // 1 minute to 2 hours
      }),
      ({ sessionId, userId, customTimeout }) => {
        const session = sessionTimeoutService.createSession(sessionId, userId, customTimeout);

        expect(session.sessionId).toBe(sessionId);
        expect(session.userId).toBe(userId);
        expect(session.isActive).toBe(true);
        expect(session.createdAt).toBeGreaterThan(0);
        expect(session.lastActivity).toBeGreaterThan(0);
        expect(session.expiresAt).toBeGreaterThan(session.createdAt);
        expect(session.extensionsUsed).toBe(0);
        expect(session.activityScore).toBe(100);

        // Verify timeout duration
        const expectedTimeout = customTimeout || 30 * 60 * 1000;
        const actualTimeout = session.expiresAt - session.createdAt;
        expect(Math.abs(actualTimeout - expectedTimeout)).toBeLessThan(1000); // Allow 1 second tolerance

        // Verify session can be retrieved
        const retrievedSession = sessionTimeoutService.getSession(sessionId);
        expect(retrievedSession).toEqual(session);

        // Verify session is valid
        expect(sessionTimeoutService.isSessionValid(sessionId)).toBe(true);

        // Clean up
        sessionTimeoutService.removeSession(sessionId);
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Activity updates work correctly
   */
  it('should update session activity correctly', () => {
    fc.assert(fc.property(
      fc.record({
        sessionId: fc.string({ minLength: 10, maxLength: 50 }),
        userId: fc.string({ minLength: 5, maxLength: 30 }),
        activityType: fc.constantFrom('user_interaction', 'api_call', 'background_task', 'heartbeat'),
        activityCount: fc.integer({ min: 1, max: 10 }),
      }),
      ({ sessionId, userId, activityType, activityCount }) => {
        const session = sessionTimeoutService.createSession(sessionId, userId);
        const initialActivity = session.lastActivity;
        const initialScore = session.activityScore;

        // Simulate multiple activities
        for (let i = 0; i < activityCount; i++) {
          const updated = sessionTimeoutService.updateActivity(sessionId, activityType, { iteration: i });
          expect(updated).toBe(true);
        }

        const updatedSession = sessionTimeoutService.getSession(sessionId);
        expect(updatedSession).toBeDefined();
        expect(updatedSession!.lastActivity).toBeGreaterThanOrEqual(initialActivity);
        
        // Activity score should increase for positive activities
        if (activityType === 'user_interaction' || activityType === 'api_call') {
          expect(updatedSession!.activityScore).toBeGreaterThanOrEqual(initialScore);
        }

        // Clean up
        sessionTimeoutService.removeSession(sessionId);
      }
    ), { numRuns: 25 });
  });

  /**
   * Property: Session extension works within limits
   */
  it('should extend sessions within configured limits', () => {
    fc.assert(fc.property(
      fc.record({
        sessionId: fc.string({ minLength: 10, maxLength: 50 }),
        userId: fc.string({ minLength: 5, maxLength: 30 }),
        extensionAttempts: fc.integer({ min: 1, max: 6 }),
        extensionDuration: fc.option(fc.integer({ min: 60000, max: 1800000 })), // 1 minute to 30 minutes
      }),
      ({ sessionId, userId, extensionAttempts, extensionDuration }) => {
        const session = sessionTimeoutService.createSession(sessionId, userId);
        const initialExpiresAt = session.expiresAt;
        let successfulExtensions = 0;

        for (let i = 0; i < extensionAttempts; i++) {
          const extended = sessionTimeoutService.extendSession(sessionId, extensionDuration);
          
          if (i < 3) { // Max extensions is 3
            expect(extended).toBe(true);
            successfulExtensions++;
          } else {
            expect(extended).toBe(false); // Should fail after max extensions
          }
        }

        const finalSession = sessionTimeoutService.getSession(sessionId);
        expect(finalSession).toBeDefined();
        expect(finalSession!.extensionsUsed).toBe(successfulExtensions);
        expect(finalSession!.extensionsUsed).toBeLessThanOrEqual(3);

        if (successfulExtensions > 0) {
          expect(finalSession!.expiresAt).toBeGreaterThan(initialExpiresAt);
        }

        // Clean up
        sessionTimeoutService.removeSession(sessionId);
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Session renewal resets timeout and extensions
   */
  it('should renew sessions correctly', () => {
    fc.assert(fc.property(
      fc.record({
        sessionId: fc.string({ minLength: 10, maxLength: 50 }),
        userId: fc.string({ minLength: 5, maxLength: 30 }),
        extensionsBeforeRenewal: fc.integer({ min: 0, max: 3 }),
      }),
      ({ sessionId, userId, extensionsBeforeRenewal }) => {
        const session = sessionTimeoutService.createSession(sessionId, userId);
        
        // Extend session multiple times
        for (let i = 0; i < extensionsBeforeRenewal; i++) {
          sessionTimeoutService.extendSession(sessionId);
        }

        const beforeRenewal = sessionTimeoutService.getSession(sessionId);
        expect(beforeRenewal!.extensionsUsed).toBe(extensionsBeforeRenewal);

        // Renew session
        const renewed = sessionTimeoutService.renewSession(sessionId);
        expect(renewed).toBe(true);

        const afterRenewal = sessionTimeoutService.getSession(sessionId);
        expect(afterRenewal).toBeDefined();
        expect(afterRenewal!.extensionsUsed).toBe(0); // Should reset extensions
        expect(afterRenewal!.activityScore).toBe(100); // Should reset activity score
        expect(afterRenewal!.expiresAt).toBeGreaterThan(beforeRenewal!.expiresAt);

        // Clean up
        sessionTimeoutService.removeSession(sessionId);
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: Session expiration works correctly
   */
  it('should expire sessions correctly', () => {
    fc.assert(fc.property(
      fc.record({
        sessionId: fc.string({ minLength: 10, maxLength: 50 }),
        userId: fc.string({ minLength: 5, maxLength: 30 }),
        expiryReason: fc.string({ minLength: 5, maxLength: 30 }),
      }),
      ({ sessionId, userId, expiryReason }) => {
        const session = sessionTimeoutService.createSession(sessionId, userId);
        expect(session.isActive).toBe(true);
        expect(sessionTimeoutService.isSessionValid(sessionId)).toBe(true);

        // Expire session
        const expired = sessionTimeoutService.expireSession(sessionId, expiryReason);
        expect(expired).toBe(true);

        const expiredSession = sessionTimeoutService.getSession(sessionId);
        expect(expiredSession).toBeDefined();
        expect(expiredSession!.isActive).toBe(false);
        expect(expiredSession!.expiresAt).toBeLessThanOrEqual(Date.now());

        // Session should no longer be valid
        expect(sessionTimeoutService.isSessionValid(sessionId)).toBe(false);

        // Clean up
        sessionTimeoutService.removeSession(sessionId);
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Time remaining calculation is accurate
   */
  it('should calculate time remaining accurately', () => {
    fc.assert(fc.property(
      fc.record({
        sessionId: fc.string({ minLength: 10, maxLength: 50 }),
        userId: fc.string({ minLength: 5, maxLength: 30 }),
        timeoutMs: fc.integer({ min: 60000, max: 3600000 }), // 1 minute to 1 hour
      }),
      ({ sessionId, userId, timeoutMs }) => {
        const session = sessionTimeoutService.createSession(sessionId, userId, timeoutMs);
        const timeRemaining = sessionTimeoutService.getTimeRemaining(sessionId);

        // Time remaining should be close to the configured timeout
        expect(timeRemaining).toBeGreaterThan(0);
        expect(timeRemaining).toBeLessThanOrEqual(timeoutMs);
        expect(Math.abs(timeRemaining - timeoutMs)).toBeLessThan(1000); // Allow 1 second tolerance

        // Time remaining should decrease over time
        const initialTime = timeRemaining;
        
        // Wait a small amount and check again
        setTimeout(() => {
          const newTimeRemaining = sessionTimeoutService.getTimeRemaining(sessionId);
          expect(newTimeRemaining).toBeLessThan(initialTime);
        }, 100);

        // Expired session should have 0 time remaining
        sessionTimeoutService.expireSession(sessionId);
        const expiredTimeRemaining = sessionTimeoutService.getTimeRemaining(sessionId);
        expect(expiredTimeRemaining).toBe(0);

        // Clean up
        sessionTimeoutService.removeSession(sessionId);
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: Warning detection works correctly
   */
  it('should detect when sessions need warnings', () => {
    fc.assert(fc.property(
      fc.record({
        sessionId: fc.string({ minLength: 10, maxLength: 50 }),
        userId: fc.string({ minLength: 5, maxLength: 30 }),
        shortTimeout: fc.integer({ min: 60000, max: 300000 }), // 1-5 minutes
      }),
      ({ sessionId, userId, shortTimeout }) => {
        // Create session with short timeout to trigger warning
        const session = sessionTimeoutService.createSession(sessionId, userId, shortTimeout);
        
        // Initially should not need warning
        expect(sessionTimeoutService.needsWarning(sessionId)).toBe(false);

        // Simulate time passing by manually adjusting expiry
        const warningThreshold = 5 * 60 * 1000; // 5 minutes
        const updatedSession = sessionTimeoutService.getSession(sessionId);
        if (updatedSession) {
          updatedSession.expiresAt = Date.now() + (warningThreshold - 1000); // 1 second before warning threshold
        }

        // Now should need warning
        expect(sessionTimeoutService.needsWarning(sessionId)).toBe(true);

        // Mark warning as shown
        sessionTimeoutService.markWarningShown(sessionId);
        const sessionAfterWarning = sessionTimeoutService.getSession(sessionId);
        expect(sessionAfterWarning!.warningShownAt).toBeDefined();
        expect(sessionAfterWarning!.warningShownAt).toBeGreaterThan(0);

        // Clean up
        sessionTimeoutService.removeSession(sessionId);
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: User session retrieval works correctly
   */
  it('should retrieve user sessions correctly', () => {
    fc.assert(fc.property(
      fc.record({
        userId: fc.string({ minLength: 5, maxLength: 30 }),
        sessionCount: fc.integer({ min: 1, max: 5 }),
        otherUserId: fc.string({ minLength: 5, maxLength: 30 }),
      }),
      ({ userId, sessionCount, otherUserId }) => {
        fc.pre(userId !== otherUserId); // Ensure different user IDs

        const sessionIds: string[] = [];

        // Create multiple sessions for the user
        for (let i = 0; i < sessionCount; i++) {
          const sessionId = `${userId}_session_${i}`;
          sessionTimeoutService.createSession(sessionId, userId);
          sessionIds.push(sessionId);
        }

        // Create a session for another user
        const otherSessionId = `${otherUserId}_session`;
        sessionTimeoutService.createSession(otherSessionId, otherUserId);

        // Retrieve user sessions
        const userSessions = sessionTimeoutService.getUserSessions(userId);
        expect(userSessions.length).toBe(sessionCount);
        
        userSessions.forEach(session => {
          expect(session.userId).toBe(userId);
          expect(session.isActive).toBe(true);
          expect(sessionIds).toContain(session.sessionId);
        });

        // Other user's session should not be included
        const otherUserSessions = userSessions.filter(s => s.userId === otherUserId);
        expect(otherUserSessions.length).toBe(0);

        // Clean up
        sessionIds.forEach(id => sessionTimeoutService.removeSession(id));
        sessionTimeoutService.removeSession(otherSessionId);
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: Configuration changes affect behavior
   */
  it('should respect configuration changes', () => {
    fc.assert(fc.property(
      fc.record({
        enableTimeoutEnforcement: fc.boolean(),
        enableWarningNotifications: fc.boolean(),
        enableIdleDetection: fc.boolean(),
        enableActivityTracking: fc.boolean(),
        sessionTimeoutMs: fc.integer({ min: 60000, max: 3600000 }),
        warningTimeoutMs: fc.integer({ min: 30000, max: 600000 }),
        maxExtensions: fc.integer({ min: 0, max: 10 }),
      }),
      ({ enableTimeoutEnforcement, enableWarningNotifications, enableIdleDetection, 
         enableActivityTracking, sessionTimeoutMs, warningTimeoutMs, maxExtensions }) => {
        
        // Update configuration
        sessionTimeoutService.updateConfig({
          enableTimeoutEnforcement,
          enableWarningNotifications,
          enableIdleDetection,
          enableActivityTracking,
          sessionTimeoutMs,
          warningTimeoutMs,
          maxExtensions,
        });

        // Verify configuration was applied
        const currentConfig = sessionTimeoutService.getConfig();
        expect(currentConfig.enableTimeoutEnforcement).toBe(enableTimeoutEnforcement);
        expect(currentConfig.enableWarningNotifications).toBe(enableWarningNotifications);
        expect(currentConfig.enableIdleDetection).toBe(enableIdleDetection);
        expect(currentConfig.enableActivityTracking).toBe(enableActivityTracking);
        expect(currentConfig.sessionTimeoutMs).toBe(sessionTimeoutMs);
        expect(currentConfig.warningTimeoutMs).toBe(warningTimeoutMs);
        expect(currentConfig.maxExtensions).toBe(maxExtensions);

        // Test behavior with new configuration
        const sessionId = 'test_config_session';
        const userId = 'test_user';
        
        const session = sessionTimeoutService.createSession(sessionId, userId);
        
        // Verify timeout duration matches configuration
        const actualTimeout = session.expiresAt - session.createdAt;
        expect(Math.abs(actualTimeout - sessionTimeoutMs)).toBeLessThan(1000);

        // Test extension limits
        let successfulExtensions = 0;
        for (let i = 0; i < maxExtensions + 2; i++) {
          const extended = sessionTimeoutService.extendSession(sessionId);
          if (extended) successfulExtensions++;
        }
        expect(successfulExtensions).toBeLessThanOrEqual(maxExtensions);

        // Clean up
        sessionTimeoutService.removeSession(sessionId);
      }
    ), { numRuns: 10 });
  });

  /**
   * Property: Event listeners receive correct events
   */
  it('should emit timeout events correctly', () => {
    fc.assert(fc.property(
      fc.record({
        sessionId: fc.string({ minLength: 10, maxLength: 50 }),
        userId: fc.string({ minLength: 5, maxLength: 30 }),
      }),
      ({ sessionId, userId }) => {
        const receivedEvents: TimeoutEvent[] = [];
        
        const eventListener = (event: TimeoutEvent) => {
          receivedEvents.push(event);
        };

        sessionTimeoutService.addTimeoutEventListener(eventListener);

        try {
          // Create session - should emit 'renewed' event
          sessionTimeoutService.createSession(sessionId, userId);
          expect(receivedEvents.length).toBeGreaterThan(0);
          expect(receivedEvents[0].type).toBe('renewed');
          expect(receivedEvents[0].sessionId).toBe(sessionId);

          // Extend session - should emit 'extended' event
          sessionTimeoutService.extendSession(sessionId);
          const extendedEvent = receivedEvents.find(e => e.type === 'extended');
          expect(extendedEvent).toBeDefined();
          expect(extendedEvent!.sessionId).toBe(sessionId);

          // Expire session - should emit 'expired' event
          sessionTimeoutService.expireSession(sessionId, 'test_expiry');
          const expiredEvent = receivedEvents.find(e => e.type === 'expired');
          expect(expiredEvent).toBeDefined();
          expect(expiredEvent!.sessionId).toBe(sessionId);
          expect(expiredEvent!.reason).toBe('test_expiry');

        } finally {
          sessionTimeoutService.removeTimeoutEventListener(eventListener);
          sessionTimeoutService.removeSession(sessionId);
        }
      }
    ), { numRuns: 10 });
  });

  /**
   * Property: Statistics are accurate
   */
  it('should provide accurate timeout statistics', () => {
    fc.assert(fc.property(
      fc.record({
        activeSessionCount: fc.integer({ min: 1, max: 5 }),
        expiredSessionCount: fc.integer({ min: 0, max: 3 }),
      }),
      ({ activeSessionCount, expiredSessionCount }) => {
        const sessionIds: string[] = [];

        // Create active sessions
        for (let i = 0; i < activeSessionCount; i++) {
          const sessionId = `active_session_${i}`;
          sessionTimeoutService.createSession(sessionId, `user_${i}`);
          sessionIds.push(sessionId);
        }

        // Create and expire sessions
        for (let i = 0; i < expiredSessionCount; i++) {
          const sessionId = `expired_session_${i}`;
          sessionTimeoutService.createSession(sessionId, `expired_user_${i}`);
          sessionTimeoutService.expireSession(sessionId, 'test_expiry');
          sessionIds.push(sessionId);
        }

        const stats = sessionTimeoutService.getStats();

        expect(stats.activeSessions).toBe(activeSessionCount);
        expect(stats.totalSessions).toBe(activeSessionCount + expiredSessionCount);
        expect(stats.expiredSessions).toBe(expiredSessionCount);
        expect(stats.config).toBeDefined();
        expect(stats.averageActivityScore).toBeGreaterThanOrEqual(0);
        expect(stats.averageActivityScore).toBeLessThanOrEqual(100);

        // Clean up
        sessionIds.forEach(id => sessionTimeoutService.removeSession(id));
      }
    ), { numRuns: 10 });
  });
});