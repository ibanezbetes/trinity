/**
 * Session Timeout Service
 * Implements proper session timeout configuration and enforcement,
 * automatic session cleanup for expired sessions,
 * and session timeout warnings for users
 */

import { loggingService } from './loggingService';
import { authStateBroadcastService } from './authStateBroadcastService';

export interface SessionTimeoutConfig {
  enableTimeoutEnforcement: boolean;
  sessionTimeoutMs: number;
  warningTimeoutMs: number;
  idleTimeoutMs: number;
  enableIdleDetection: boolean;
  enableWarningNotifications: boolean;
  enableAutomaticExtension: boolean;
  maxExtensions: number;
  extensionDurationMs: number;
  enableGracePeriod: boolean;
  gracePeriodMs: number;
  enableActivityTracking: boolean;
  activityCheckIntervalMs: number;
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  warningShownAt?: number;
  extensionsUsed: number;
  isActive: boolean;
  activityScore: number;
}

export interface TimeoutEvent {
  type: 'warning' | 'expired' | 'extended' | 'renewed';
  sessionId: string;
  timestamp: number;
  timeRemaining?: number;
  reason?: string;
}

export interface ActivityEvent {
  type: 'user_interaction' | 'api_call' | 'background_task' | 'heartbeat';
  timestamp: number;
  details?: any;
}

class SessionTimeoutService {
  private config: SessionTimeoutConfig = {
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
    activityCheckIntervalMs: 30 * 1000, // Check every 30 seconds
  };

  private sessions: Map<string, SessionInfo> = new Map();
  private timeoutCallbacks: Map<string, NodeJS.Timeout> = new Map();
  private warningCallbacks: Map<string, NodeJS.Timeout> = new Map();
  private activityCheckInterval?: NodeJS.Timeout;
  private eventListeners: Array<(event: TimeoutEvent) => void> = [];
  private activityListeners: Array<(activity: ActivityEvent) => void> = [];

  constructor() {
    this.initializeActivityTracking();
    
    loggingService.info('SessionTimeout', 'Session timeout service initialized', {
      config: this.config,
    });
  }

  /**
   * Create a new session with timeout enforcement
   */
  createSession(sessionId: string, userId: string, customTimeout?: number): SessionInfo {
    const now = Date.now();
    const timeoutMs = customTimeout || this.config.sessionTimeoutMs;
    
    const sessionInfo: SessionInfo = {
      sessionId,
      userId,
      createdAt: now,
      lastActivity: now,
      expiresAt: now + timeoutMs,
      extensionsUsed: 0,
      isActive: true,
      activityScore: 100,
    };

    this.sessions.set(sessionId, sessionInfo);
    
    if (this.config.enableTimeoutEnforcement) {
      this.scheduleTimeoutCallbacks(sessionInfo);
    }

    loggingService.info('SessionTimeout', 'Session created', {
      sessionId,
      userId,
      expiresAt: new Date(sessionInfo.expiresAt).toISOString(),
      timeoutMs,
    });

    this.emitTimeoutEvent({
      type: 'renewed',
      sessionId,
      timestamp: now,
      timeRemaining: timeoutMs,
    });

    return sessionInfo;
  }

  /**
   * Update session activity
   */
  updateActivity(sessionId: string, activityType: ActivityEvent['type'] = 'user_interaction', details?: any): boolean {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.isActive) {
      return false;
    }

    const now = Date.now();
    session.lastActivity = now;
    
    // Update activity score based on activity type
    this.updateActivityScore(session, activityType);

    // Check if session should be extended based on activity
    if (this.shouldExtendSession(session, activityType)) {
      this.extendSession(sessionId, this.config.extensionDurationMs);
    }

    // Emit activity event
    this.emitActivityEvent({
      type: activityType,
      timestamp: now,
      details,
    });

    loggingService.debug('SessionTimeout', 'Session activity updated', {
      sessionId,
      activityType,
      lastActivity: new Date(session.lastActivity).toISOString(),
      activityScore: session.activityScore,
    });

    return true;
  }

  /**
   * Extend session timeout
   */
  extendSession(sessionId: string, extensionMs?: number): boolean {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.isActive) {
      return false;
    }

    if (session.extensionsUsed >= this.config.maxExtensions) {
      loggingService.warn('SessionTimeout', 'Session extension limit reached', {
        sessionId,
        extensionsUsed: session.extensionsUsed,
        maxExtensions: this.config.maxExtensions,
      });
      return false;
    }

    const extension = extensionMs || this.config.extensionDurationMs;
    const now = Date.now();
    
    session.expiresAt = Math.max(session.expiresAt, now) + extension;
    session.extensionsUsed++;
    session.lastActivity = now;

    // Clear existing timeouts and reschedule
    this.clearTimeoutCallbacks(sessionId);
    this.scheduleTimeoutCallbacks(session);

    loggingService.info('SessionTimeout', 'Session extended', {
      sessionId,
      extensionMs: extension,
      newExpiresAt: new Date(session.expiresAt).toISOString(),
      extensionsUsed: session.extensionsUsed,
    });

    this.emitTimeoutEvent({
      type: 'extended',
      sessionId,
      timestamp: now,
      timeRemaining: session.expiresAt - now,
    });

    return true;
  }

  /**
   * Renew session (reset timeout)
   */
  renewSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.isActive) {
      return false;
    }

    const now = Date.now();
    session.expiresAt = now + this.config.sessionTimeoutMs;
    session.lastActivity = now;
    session.extensionsUsed = 0; // Reset extensions on renewal
    session.activityScore = 100; // Reset activity score

    // Clear existing timeouts and reschedule
    this.clearTimeoutCallbacks(sessionId);
    this.scheduleTimeoutCallbacks(session);

    loggingService.info('SessionTimeout', 'Session renewed', {
      sessionId,
      newExpiresAt: new Date(session.expiresAt).toISOString(),
    });

    this.emitTimeoutEvent({
      type: 'renewed',
      sessionId,
      timestamp: now,
      timeRemaining: session.expiresAt - now,
    });

    return true;
  }

  /**
   * Expire session immediately
   */
  expireSession(sessionId: string, reason: string = 'manual_expiry'): boolean {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return false;
    }

    session.isActive = false;
    session.expiresAt = Date.now();

    this.clearTimeoutCallbacks(sessionId);

    loggingService.info('SessionTimeout', 'Session expired', {
      sessionId,
      reason,
      userId: session.userId,
    });

    this.emitTimeoutEvent({
      type: 'expired',
      sessionId,
      timestamp: Date.now(),
      reason,
    });

    // Notify authentication system
    authStateBroadcastService.broadcastAuthStateChange({
      type: 'session_expired',
      sessionId,
      reason,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    let cleanedCount = 0;

    this.sessions.forEach((session, sessionId) => {
      if (session.isActive && session.expiresAt <= now) {
        this.expireSession(sessionId, 'timeout_expired');
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      loggingService.info('SessionTimeout', 'Expired sessions cleaned up', {
        cleanedCount,
        totalSessions: this.sessions.size,
      });
    }

    return cleanedCount;
  }

  /**
   * Remove session completely
   */
  removeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return false;
    }

    this.clearTimeoutCallbacks(sessionId);
    this.sessions.delete(sessionId);

    loggingService.debug('SessionTimeout', 'Session removed', {
      sessionId,
      userId: session.userId,
    });

    return true;
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  /**
   * Get sessions for a specific user
   */
  getUserSessions(userId: string): SessionInfo[] {
    return Array.from(this.sessions.values()).filter(session => 
      session.userId === userId && session.isActive
    );
  }

  /**
   * Check if session is valid and active
   */
  isSessionValid(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.isActive) {
      return false;
    }

    const now = Date.now();
    
    // Check if session has expired
    if (session.expiresAt <= now) {
      this.expireSession(sessionId, 'timeout_expired');
      return false;
    }

    // Check idle timeout
    if (this.config.enableIdleDetection) {
      const idleTime = now - session.lastActivity;
      if (idleTime >= this.config.idleTimeoutMs) {
        this.expireSession(sessionId, 'idle_timeout');
        return false;
      }
    }

    return true;
  }

  /**
   * Get time remaining for session
   */
  getTimeRemaining(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.isActive) {
      return 0;
    }

    return Math.max(0, session.expiresAt - Date.now());
  }

  /**
   * Check if session needs warning
   */
  needsWarning(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.isActive || !this.config.enableWarningNotifications) {
      return false;
    }

    const timeRemaining = this.getTimeRemaining(sessionId);
    const needsWarning = timeRemaining <= this.config.warningTimeoutMs && timeRemaining > 0;
    
    // Don't show warning if already shown recently
    if (needsWarning && session.warningShownAt) {
      const timeSinceWarning = Date.now() - session.warningShownAt;
      return timeSinceWarning >= (this.config.warningTimeoutMs / 2); // Show warning again halfway through warning period
    }

    return needsWarning;
  }

  /**
   * Mark warning as shown
   */
  markWarningShown(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      session.warningShownAt = Date.now();
      
      this.emitTimeoutEvent({
        type: 'warning',
        sessionId,
        timestamp: Date.now(),
        timeRemaining: this.getTimeRemaining(sessionId),
      });
    }
  }

  /**
   * Add timeout event listener
   */
  addTimeoutEventListener(listener: (event: TimeoutEvent) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove timeout event listener
   */
  removeTimeoutEventListener(listener: (event: TimeoutEvent) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Add activity event listener
   */
  addActivityEventListener(listener: (activity: ActivityEvent) => void): void {
    this.activityListeners.push(listener);
  }

  /**
   * Remove activity event listener
   */
  removeActivityEventListener(listener: (activity: ActivityEvent) => void): void {
    const index = this.activityListeners.indexOf(listener);
    if (index > -1) {
      this.activityListeners.splice(index, 1);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SessionTimeoutConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    // Restart activity tracking if interval changed
    if (oldConfig.activityCheckIntervalMs !== this.config.activityCheckIntervalMs ||
        oldConfig.enableActivityTracking !== this.config.enableActivityTracking) {
      this.initializeActivityTracking();
    }
    
    // Update existing sessions if timeout changed
    if (oldConfig.sessionTimeoutMs !== this.config.sessionTimeoutMs) {
      this.updateExistingSessionTimeouts();
    }
    
    loggingService.info('SessionTimeout', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): SessionTimeoutConfig {
    return { ...this.config };
  }

  /**
   * Get timeout statistics
   */
  getStats(): {
    config: SessionTimeoutConfig;
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    sessionsNeedingWarning: number;
    averageActivityScore: number;
  } {
    const allSessions = Array.from(this.sessions.values());
    const activeSessions = allSessions.filter(s => s.isActive);
    const expiredSessions = allSessions.filter(s => !s.isActive);
    const sessionsNeedingWarning = activeSessions.filter(s => this.needsWarning(s.sessionId));
    
    const averageActivityScore = activeSessions.length > 0
      ? activeSessions.reduce((sum, s) => sum + s.activityScore, 0) / activeSessions.length
      : 0;

    return {
      config: this.config,
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      expiredSessions: expiredSessions.length,
      sessionsNeedingWarning: sessionsNeedingWarning.length,
      averageActivityScore,
    };
  }

  // Private helper methods

  private scheduleTimeoutCallbacks(session: SessionInfo): void {
    const now = Date.now();
    const timeToExpiry = session.expiresAt - now;
    const timeToWarning = timeToExpiry - this.config.warningTimeoutMs;

    // Schedule warning callback
    if (this.config.enableWarningNotifications && timeToWarning > 0) {
      const warningTimeout = setTimeout(() => {
        if (this.needsWarning(session.sessionId)) {
          this.markWarningShown(session.sessionId);
        }
      }, timeToWarning);
      
      this.warningCallbacks.set(session.sessionId, warningTimeout);
    }

    // Schedule expiry callback
    if (timeToExpiry > 0) {
      const expiryTimeout = setTimeout(() => {
        this.expireSession(session.sessionId, 'timeout_expired');
      }, timeToExpiry + (this.config.enableGracePeriod ? this.config.gracePeriodMs : 0));
      
      this.timeoutCallbacks.set(session.sessionId, expiryTimeout);
    }
  }

  private clearTimeoutCallbacks(sessionId: string): void {
    const warningTimeout = this.warningCallbacks.get(sessionId);
    if (warningTimeout) {
      clearTimeout(warningTimeout);
      this.warningCallbacks.delete(sessionId);
    }

    const expiryTimeout = this.timeoutCallbacks.get(sessionId);
    if (expiryTimeout) {
      clearTimeout(expiryTimeout);
      this.timeoutCallbacks.delete(sessionId);
    }
  }

  private updateActivityScore(session: SessionInfo, activityType: ActivityEvent['type']): void {
    if (!this.config.enableActivityTracking) {
      return;
    }

    const scoreChanges = {
      'user_interaction': 10,
      'api_call': 5,
      'background_task': 2,
      'heartbeat': 1,
    };

    const scoreChange = scoreChanges[activityType] || 1;
    session.activityScore = Math.min(100, session.activityScore + scoreChange);
  }

  private shouldExtendSession(session: SessionInfo, activityType: ActivityEvent['type']): boolean {
    if (!this.config.enableAutomaticExtension) {
      return false;
    }

    if (session.extensionsUsed >= this.config.maxExtensions) {
      return false;
    }

    // Only extend for high-value activities
    const highValueActivities = ['user_interaction', 'api_call'];
    if (!highValueActivities.includes(activityType)) {
      return false;
    }

    // Only extend if session is close to expiry
    const timeRemaining = this.getTimeRemaining(session.sessionId);
    return timeRemaining <= this.config.warningTimeoutMs;
  }

  private initializeActivityTracking(): void {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
    }

    if (this.config.enableActivityTracking) {
      this.activityCheckInterval = setInterval(() => {
        this.performActivityCheck();
      }, this.config.activityCheckIntervalMs);
    }
  }

  private performActivityCheck(): void {
    const now = Date.now();
    
    this.sessions.forEach((session) => {
      if (!session.isActive) return;

      // Decay activity score over time
      const timeSinceActivity = now - session.lastActivity;
      const decayRate = timeSinceActivity / (5 * 60 * 1000); // Decay over 5 minutes
      session.activityScore = Math.max(0, session.activityScore - decayRate);

      // Check for idle timeout
      if (this.config.enableIdleDetection && timeSinceActivity >= this.config.idleTimeoutMs) {
        this.expireSession(session.sessionId, 'idle_timeout');
      }
    });

    // Clean up expired sessions
    this.cleanupExpiredSessions();
  }

  private updateExistingSessionTimeouts(): void {
    this.sessions.forEach((session) => {
      if (!session.isActive) return;

      const now = Date.now();
      const timeElapsed = now - session.createdAt;
      const newExpiresAt = session.createdAt + this.config.sessionTimeoutMs;

      // Only update if new timeout is different and session hasn't been extended
      if (newExpiresAt !== session.expiresAt && session.extensionsUsed === 0) {
        session.expiresAt = newExpiresAt;
        
        // Reschedule callbacks
        this.clearTimeoutCallbacks(session.sessionId);
        this.scheduleTimeoutCallbacks(session);
      }
    });
  }

  private emitTimeoutEvent(event: TimeoutEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error: any) {
        loggingService.error('SessionTimeout', 'Error in timeout event listener', {
          error: error.message,
          eventType: event.type,
        });
      }
    });
  }

  private emitActivityEvent(activity: ActivityEvent): void {
    this.activityListeners.forEach(listener => {
      try {
        listener(activity);
      } catch (error: any) {
        loggingService.error('SessionTimeout', 'Error in activity event listener', {
          error: error.message,
          activityType: activity.type,
        });
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Clear all timeouts
    this.timeoutCallbacks.forEach(timeout => clearTimeout(timeout));
    this.warningCallbacks.forEach(timeout => clearTimeout(timeout));
    
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
    }

    // Clear all data
    this.sessions.clear();
    this.timeoutCallbacks.clear();
    this.warningCallbacks.clear();
    this.eventListeners.length = 0;
    this.activityListeners.length = 0;
    
    loggingService.info('SessionTimeout', 'Session timeout service destroyed');
  }
}

export const sessionTimeoutService = new SessionTimeoutService();
export type { SessionTimeoutConfig, SessionInfo, TimeoutEvent, ActivityEvent };