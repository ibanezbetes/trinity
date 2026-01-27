/**
 * Authentication State Broadcasting Service
 * Handles broadcasting authentication state changes to all app components
 * and ensures consistency across components with proper event handling
 */

import { EventEmitter } from 'events';
import { loggingService } from './loggingService';

export interface AuthState {
  isAuthenticated: boolean;
  user?: {
    id: string;
    email: string;
    name?: string;
    profilePicture?: string;
    federatedProvider?: 'google' | 'cognito';
  };
  tokens?: {
    accessToken: string;
    idToken: string;
    refreshToken: string;
    expiresAt: number;
  };
  sessionId: string;
  lastUpdated: number;
  source: 'login' | 'refresh' | 'restore' | 'logout' | 'initialization';
}

export interface AuthStateListener {
  id: string;
  callback: (state: AuthState) => void;
  component?: string;
  priority?: number; // Higher priority listeners are called first
}

export interface AuthStateEvent {
  type: 'state_changed' | 'user_updated' | 'tokens_refreshed' | 'session_expired' | 'logout';
  previousState?: AuthState;
  currentState: AuthState;
  timestamp: number;
  source: string;
}

export interface BroadcastConfig {
  enableEventHistory: boolean;
  maxEventHistory: number;
  enableDebugLogging: boolean;
  enablePerformanceMetrics: boolean;
  batchUpdates: boolean;
  batchDelayMs: number;
}

class AuthStateBroadcastService extends EventEmitter {
  private currentState: AuthState;
  private listeners: Map<string, AuthStateListener> = new Map();
  private eventHistory: AuthStateEvent[] = [];
  private pendingUpdates: AuthState[] = [];
  private batchTimeout?: NodeJS.Timeout;
  
  private config: BroadcastConfig = {
    enableEventHistory: true,
    maxEventHistory: 100,
    enableDebugLogging: true,
    enablePerformanceMetrics: true,
    batchUpdates: false,
    batchDelayMs: 100,
  };

  constructor() {
    super();
    
    // Initialize with default unauthenticated state
    this.currentState = this.createInitialState();
    
    // Set up event emitter configuration
    this.setMaxListeners(50); // Allow many components to listen
    
    loggingService.info('AuthStateBroadcast', 'Authentication state broadcasting service initialized', {
      sessionId: this.currentState.sessionId,
      config: this.config,
    });
  }

  /**
   * Get current authentication state
   */
  getCurrentState(): AuthState {
    return { ...this.currentState };
  }

  /**
   * Update authentication state and broadcast to all listeners
   */
  updateAuthState(
    newState: Partial<AuthState>,
    source: AuthState['source'] = 'initialization'
  ): void {
    const startTime = Date.now();
    
    try {
      const previousState = { ...this.currentState };
      
      // Create new state
      const updatedState: AuthState = {
        ...this.currentState,
        ...newState,
        lastUpdated: Date.now(),
        source,
      };

      // Validate state consistency
      this.validateAuthState(updatedState);

      if (this.config.batchUpdates) {
        this.addToBatch(updatedState);
        return;
      }

      // Update current state
      this.currentState = updatedState;

      // Create event
      const event: AuthStateEvent = {
        type: this.determineEventType(previousState, updatedState),
        previousState,
        currentState: updatedState,
        timestamp: Date.now(),
        source,
      };

      // Add to history
      this.addToEventHistory(event);

      // Broadcast to listeners
      this.broadcastStateChange(event);

      // Log performance metrics
      if (this.config.enablePerformanceMetrics) {
        const duration = Date.now() - startTime;
        loggingService.debug('AuthStateBroadcast', 'State update completed', {
          duration,
          listenersNotified: this.listeners.size,
          eventType: event.type,
          source,
        });
      }

    } catch (error: any) {
      loggingService.error('AuthStateBroadcast', 'Failed to update auth state', {
        error: error.message,
        newState,
        source,
      });
      throw error;
    }
  }

  /**
   * Register a listener for authentication state changes
   */
  addListener(listener: AuthStateListener): void {
    try {
      // Validate listener
      if (!listener.id || !listener.callback) {
        throw new Error('Listener must have id and callback');
      }

      if (this.listeners.has(listener.id)) {
        loggingService.warn('AuthStateBroadcast', 'Replacing existing listener', {
          listenerId: listener.id,
          component: listener.component,
        });
      }

      // Add listener
      this.listeners.set(listener.id, listener);

      // Immediately notify with current state
      try {
        listener.callback(this.currentState);
      } catch (callbackError: any) {
        loggingService.error('AuthStateBroadcast', 'Listener callback failed during registration', {
          listenerId: listener.id,
          error: callbackError.message,
        });
      }

      if (this.config.enableDebugLogging) {
        loggingService.debug('AuthStateBroadcast', 'Listener registered', {
          listenerId: listener.id,
          component: listener.component,
          priority: listener.priority,
          totalListeners: this.listeners.size,
        });
      }

    } catch (error: any) {
      loggingService.error('AuthStateBroadcast', 'Failed to add listener', {
        error: error.message,
        listenerId: listener.id,
      });
      throw error;
    }
  }

  /**
   * Remove a listener
   */
  removeListener(listenerId: string): boolean {
    const removed = this.listeners.delete(listenerId);
    
    if (removed && this.config.enableDebugLogging) {
      loggingService.debug('AuthStateBroadcast', 'Listener removed', {
        listenerId,
        remainingListeners: this.listeners.size,
      });
    }

    return removed;
  }

  /**
   * Remove all listeners for a component
   */
  removeComponentListeners(component: string): number {
    let removedCount = 0;
    
    for (const [id, listener] of this.listeners.entries()) {
      if (listener.component === component) {
        this.listeners.delete(id);
        removedCount++;
      }
    }

    if (removedCount > 0 && this.config.enableDebugLogging) {
      loggingService.debug('AuthStateBroadcast', 'Component listeners removed', {
        component,
        removedCount,
        remainingListeners: this.listeners.size,
      });
    }

    return removedCount;
  }

  /**
   * Get all registered listeners
   */
  getListeners(): AuthStateListener[] {
    return Array.from(this.listeners.values());
  }

  /**
   * Get event history
   */
  getEventHistory(count?: number): AuthStateEvent[] {
    if (count) {
      return this.eventHistory.slice(-count);
    }
    return [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  clearEventHistory(): void {
    this.eventHistory = [];
    loggingService.debug('AuthStateBroadcast', 'Event history cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BroadcastConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    loggingService.info('AuthStateBroadcast', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): BroadcastConfig {
    return { ...this.config };
  }

  /**
   * Get broadcasting statistics
   */
  getStats(): {
    currentState: AuthState;
    listenersCount: number;
    eventHistoryCount: number;
    lastEventTime?: number;
    sessionId: string;
  } {
    return {
      currentState: this.getCurrentState(),
      listenersCount: this.listeners.size,
      eventHistoryCount: this.eventHistory.length,
      lastEventTime: this.eventHistory[this.eventHistory.length - 1]?.timestamp,
      sessionId: this.currentState.sessionId,
    };
  }

  /**
   * Force broadcast current state to all listeners
   */
  forceBroadcast(): void {
    const event: AuthStateEvent = {
      type: 'state_changed',
      currentState: this.currentState,
      timestamp: Date.now(),
      source: 'force_broadcast',
    };

    this.broadcastStateChange(event);
    
    loggingService.debug('AuthStateBroadcast', 'Force broadcast completed', {
      listenersNotified: this.listeners.size,
    });
  }

  /**
   * Reset to initial unauthenticated state
   */
  reset(): void {
    const previousState = { ...this.currentState };
    this.currentState = this.createInitialState();
    
    const event: AuthStateEvent = {
      type: 'logout',
      previousState,
      currentState: this.currentState,
      timestamp: Date.now(),
      source: 'reset',
    };

    this.addToEventHistory(event);
    this.broadcastStateChange(event);
    
    loggingService.info('AuthStateBroadcast', 'Auth state reset to initial state', {
      sessionId: this.currentState.sessionId,
    });
  }

  // Private helper methods

  private createInitialState(): AuthState {
    return {
      isAuthenticated: false,
      sessionId: this.generateSessionId(),
      lastUpdated: Date.now(),
      source: 'initialization',
    };
  }

  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `auth-${timestamp}-${random}`;
  }

  private validateAuthState(state: AuthState): void {
    // Basic validation
    if (typeof state.isAuthenticated !== 'boolean') {
      throw new Error('isAuthenticated must be a boolean');
    }

    if (state.isAuthenticated) {
      if (!state.user || !state.user.id || !state.user.email) {
        throw new Error('Authenticated state must have valid user information');
      }

      if (!state.tokens || !state.tokens.accessToken) {
        throw new Error('Authenticated state must have valid tokens');
      }

      // Check token expiration
      if (state.tokens.expiresAt && state.tokens.expiresAt <= Date.now()) {
        loggingService.warn('AuthStateBroadcast', 'Setting state with expired tokens', {
          expiresAt: new Date(state.tokens.expiresAt).toISOString(),
          now: new Date().toISOString(),
        });
      }
    }

    if (!state.sessionId || !state.lastUpdated || !state.source) {
      throw new Error('State must have sessionId, lastUpdated, and source');
    }
  }

  private determineEventType(
    previousState: AuthState,
    currentState: AuthState
  ): AuthStateEvent['type'] {
    // Logout event
    if (previousState.isAuthenticated && !currentState.isAuthenticated) {
      return 'logout';
    }

    // Login event (state changed)
    if (!previousState.isAuthenticated && currentState.isAuthenticated) {
      return 'state_changed';
    }

    // Token refresh
    if (
      previousState.tokens?.accessToken !== currentState.tokens?.accessToken &&
      currentState.isAuthenticated
    ) {
      return 'tokens_refreshed';
    }

    // User information update
    if (
      currentState.isAuthenticated &&
      (previousState.user?.name !== currentState.user?.name ||
       previousState.user?.profilePicture !== currentState.user?.profilePicture)
    ) {
      return 'user_updated';
    }

    // Session expiration
    if (
      currentState.tokens?.expiresAt &&
      currentState.tokens.expiresAt <= Date.now()
    ) {
      return 'session_expired';
    }

    // Default to state changed
    return 'state_changed';
  }

  private addToEventHistory(event: AuthStateEvent): void {
    if (!this.config.enableEventHistory) {
      return;
    }

    this.eventHistory.push(event);

    // Maintain history size limit
    if (this.eventHistory.length > this.config.maxEventHistory) {
      this.eventHistory = this.eventHistory.slice(-this.config.maxEventHistory);
    }
  }

  private broadcastStateChange(event: AuthStateEvent): void {
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    // Sort listeners by priority (higher priority first)
    const sortedListeners = Array.from(this.listeners.values()).sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    );

    // Notify all listeners
    for (const listener of sortedListeners) {
      try {
        listener.callback(event.currentState);
        successCount++;
      } catch (error: any) {
        errorCount++;
        loggingService.error('AuthStateBroadcast', 'Listener callback failed', {
          listenerId: listener.id,
          component: listener.component,
          error: error.message,
          eventType: event.type,
        });
      }
    }

    // Emit event for EventEmitter listeners
    this.emit('authStateChanged', event);

    if (this.config.enableDebugLogging) {
      loggingService.debug('AuthStateBroadcast', 'State broadcast completed', {
        eventType: event.type,
        listenersNotified: successCount,
        errors: errorCount,
        duration: Date.now() - startTime,
      });
    }
  }

  private addToBatch(state: AuthState): void {
    this.pendingUpdates.push(state);

    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // Set new timeout for batch processing
    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.config.batchDelayMs);
  }

  private processBatch(): void {
    if (this.pendingUpdates.length === 0) {
      return;
    }

    // Get the latest state from the batch
    const latestState = this.pendingUpdates[this.pendingUpdates.length - 1];
    const previousState = { ...this.currentState };

    // Clear batch
    this.pendingUpdates = [];
    this.batchTimeout = undefined;

    // Update state
    this.currentState = latestState;

    // Create event
    const event: AuthStateEvent = {
      type: this.determineEventType(previousState, latestState),
      previousState,
      currentState: latestState,
      timestamp: Date.now(),
      source: 'batch_update',
    };

    // Add to history and broadcast
    this.addToEventHistory(event);
    this.broadcastStateChange(event);

    loggingService.debug('AuthStateBroadcast', 'Batch update processed', {
      batchSize: this.pendingUpdates.length + 1,
      eventType: event.type,
    });
  }
}

export const authStateBroadcastService = new AuthStateBroadcastService();
export type { AuthState, AuthStateListener, AuthStateEvent, BroadcastConfig };