/**
 * Connection Resilience Service
 * Handles automatic reconnection, state synchronization, and graceful degradation
 */

import { Injectable, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppSyncConnection, AppSyncMessage, IAppSyncManager } from './appsync.interface';

export interface ConnectionHealth {
  connectionId: string;
  isHealthy: boolean;
  lastPing: Date;
  consecutiveFailures: number;
  reconnectAttempts: number;
  lastReconnectAttempt?: Date;
}

export interface ReconnectionStrategy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface StateSnapshot {
  connectionId: string;
  userId?: string;
  roomId?: string;
  participantId?: string;
  lastKnownState: Record<string, any>;
  timestamp: Date;
}

@Injectable()
export class ConnectionResilienceService implements OnModuleDestroy {
  private readonly logger = new Logger(ConnectionResilienceService.name);
  private healthChecks = new Map<string, ConnectionHealth>();
  private stateSnapshots = new Map<string, StateSnapshot>();
  private reconnectionTimers = new Map<string, NodeJS.Timeout>();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private pollingFallbacks = new Map<string, NodeJS.Timeout>();

  private readonly defaultStrategy: ReconnectionStrategy = {
    maxAttempts: 5,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2,
  };

  constructor(
    private readonly configService: ConfigService,
    @Inject('IAppSyncManager') private readonly appSyncManager: IAppSyncManager,
  ) {
    this.startHealthCheckInterval();
  }

  async onModuleDestroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Clear all timers
    for (const timer of this.reconnectionTimers.values()) {
      clearTimeout(timer);
    }
    for (const timer of this.pollingFallbacks.values()) {
      clearInterval(timer);
    }
  }

  /**
   * Initialize connection health monitoring
   */
  async initializeConnectionHealth(connection: AppSyncConnection): Promise<void> {
    const health: ConnectionHealth = {
      connectionId: connection.connectionId,
      isHealthy: true,
      lastPing: new Date(),
      consecutiveFailures: 0,
      reconnectAttempts: 0,
    };

    this.healthChecks.set(connection.connectionId, health);
    
    // Create initial state snapshot
    await this.createStateSnapshot(connection);

    this.logger.debug(`Initialized health monitoring for connection: ${connection.connectionId}`);
  }

  /**
   * Handle connection failure and initiate recovery
   */
  async handleConnectionFailure(connectionId: string, error: Error): Promise<void> {
    const health = this.healthChecks.get(connectionId);
    if (!health) {
      this.logger.warn(`No health record found for connection: ${connectionId}`);
      return;
    }

    health.isHealthy = false;
    health.consecutiveFailures++;
    this.healthChecks.set(connectionId, health);

    this.logger.warn(`Connection failure detected for ${connectionId}:`, error.message);

    // Start reconnection process
    await this.initiateReconnection(connectionId);
  }

  /**
   * Handle successful reconnection
   */
  async handleReconnectionSuccess(oldConnectionId: string, newConnection: AppSyncConnection): Promise<void> {
    const health = this.healthChecks.get(oldConnectionId);
    if (health) {
      // Transfer health monitoring to new connection
      const newHealth: ConnectionHealth = {
        ...health,
        connectionId: newConnection.connectionId,
        isHealthy: true,
        consecutiveFailures: 0,
        reconnectAttempts: 0,
        lastPing: new Date(),
      };

      this.healthChecks.delete(oldConnectionId);
      this.healthChecks.set(newConnection.connectionId, newHealth);

      // Clear reconnection timer
      const timer = this.reconnectionTimers.get(oldConnectionId);
      if (timer) {
        clearTimeout(timer);
        this.reconnectionTimers.delete(oldConnectionId);
      }

      // Synchronize state after reconnection
      await this.synchronizeStateAfterReconnection(oldConnectionId, newConnection);

      this.logger.log(`Reconnection successful for ${oldConnectionId} -> ${newConnection.connectionId}`);
    }
  }

  /**
   * Create state snapshot for connection
   */
  async createStateSnapshot(connection: AppSyncConnection): Promise<void> {
    const snapshot: StateSnapshot = {
      connectionId: connection.connectionId,
      userId: connection.userId,
      roomId: connection.roomId,
      participantId: connection.participantId,
      lastKnownState: {
        isAuthenticated: connection.isAuthenticated,
        metadata: connection.metadata,
        connectedAt: connection.connectedAt,
        lastActiveAt: connection.lastActiveAt,
      },
      timestamp: new Date(),
    };

    this.stateSnapshots.set(connection.connectionId, snapshot);
  }

  /**
   * Update connection health status
   */
  async updateConnectionHealth(connectionId: string, isHealthy: boolean): Promise<void> {
    const health = this.healthChecks.get(connectionId);
    if (health) {
      health.isHealthy = isHealthy;
      health.lastPing = new Date();
      
      if (isHealthy) {
        health.consecutiveFailures = 0;
      }

      this.healthChecks.set(connectionId, health);
    }
  }

  /**
   * Get connection health status
   */
  getConnectionHealth(connectionId: string): ConnectionHealth | null {
    return this.healthChecks.get(connectionId) || null;
  }

  /**
   * Enable polling fallback for connection
   */
  async enablePollingFallback(connectionId: string): Promise<void> {
    const snapshot = this.stateSnapshots.get(connectionId);
    if (!snapshot || !snapshot.roomId) {
      return;
    }

    const pollingInterval = this.configService.get('POLLING_FALLBACK_INTERVAL', 5000); // 5 seconds

    const timer = setInterval(async () => {
      try {
        // Poll for room updates
        await this.pollRoomUpdates(snapshot.roomId!, connectionId);
      } catch (error) {
        this.logger.error(`Polling fallback error for ${connectionId}:`, error);
      }
    }, pollingInterval);

    this.pollingFallbacks.set(connectionId, timer);
    this.logger.log(`Enabled polling fallback for connection: ${connectionId}`);
  }

  /**
   * Disable polling fallback for connection
   */
  async disablePollingFallback(connectionId: string): Promise<void> {
    const timer = this.pollingFallbacks.get(connectionId);
    if (timer) {
      clearInterval(timer);
      this.pollingFallbacks.delete(connectionId);
      this.logger.log(`Disabled polling fallback for connection: ${connectionId}`);
    }
  }

  /**
   * Clean up connection resources
   */
  async cleanupConnection(connectionId: string): Promise<void> {
    this.healthChecks.delete(connectionId);
    this.stateSnapshots.delete(connectionId);
    
    const reconnectTimer = this.reconnectionTimers.get(connectionId);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      this.reconnectionTimers.delete(connectionId);
    }

    await this.disablePollingFallback(connectionId);

    this.logger.debug(`Cleaned up resources for connection: ${connectionId}`);
  }

  /**
   * Get resilience statistics
   */
  getResilienceStats(): {
    totalConnections: number;
    healthyConnections: number;
    unhealthyConnections: number;
    activeReconnections: number;
    pollingFallbacks: number;
  } {
    const totalConnections = this.healthChecks.size;
    let healthyConnections = 0;
    let unhealthyConnections = 0;

    for (const health of this.healthChecks.values()) {
      if (health.isHealthy) {
        healthyConnections++;
      } else {
        unhealthyConnections++;
      }
    }

    return {
      totalConnections,
      healthyConnections,
      unhealthyConnections,
      activeReconnections: this.reconnectionTimers.size,
      pollingFallbacks: this.pollingFallbacks.size,
    };
  }

  // Private methods

  private startHealthCheckInterval(): void {
    const intervalMs = this.configService.get('HEALTH_CHECK_INTERVAL', 30000); // 30 seconds
    
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, intervalMs);
  }

  private async performHealthChecks(): Promise<void> {
    const now = new Date();
    const healthTimeout = this.configService.get('HEALTH_CHECK_TIMEOUT', 60000); // 1 minute

    for (const [connectionId, health] of this.healthChecks) {
      const timeSinceLastPing = now.getTime() - health.lastPing.getTime();
      
      if (timeSinceLastPing > healthTimeout && health.isHealthy) {
        this.logger.warn(`Connection ${connectionId} appears unhealthy (no ping for ${timeSinceLastPing}ms)`);
        await this.handleConnectionFailure(connectionId, new Error('Health check timeout'));
      }
    }
  }

  private async initiateReconnection(connectionId: string): Promise<void> {
    const health = this.healthChecks.get(connectionId);
    if (!health) {
      return;
    }

    const strategy = this.getReconnectionStrategy();
    
    if (health.reconnectAttempts >= strategy.maxAttempts) {
      this.logger.error(`Max reconnection attempts reached for ${connectionId}, enabling polling fallback`);
      await this.enablePollingFallback(connectionId);
      return;
    }

    health.reconnectAttempts++;
    health.lastReconnectAttempt = new Date();
    this.healthChecks.set(connectionId, health);

    const delay = this.calculateReconnectionDelay(health.reconnectAttempts, strategy);
    
    const timer = setTimeout(async () => {
      try {
        await this.attemptReconnection(connectionId);
      } catch (error) {
        this.logger.error(`Reconnection attempt failed for ${connectionId}:`, error);
        // Schedule next attempt
        await this.initiateReconnection(connectionId);
      }
    }, delay);

    this.reconnectionTimers.set(connectionId, timer);
    
    this.logger.log(`Scheduled reconnection attempt ${health.reconnectAttempts}/${strategy.maxAttempts} for ${connectionId} in ${delay}ms`);
  }

  private async attemptReconnection(connectionId: string): Promise<void> {
    const snapshot = this.stateSnapshots.get(connectionId);
    if (!snapshot) {
      throw new Error('No state snapshot found for reconnection');
    }

    // In a real implementation, this would trigger the client to reconnect
    // For now, we'll simulate a successful reconnection
    this.logger.log(`Attempting reconnection for ${connectionId}`);
    
    // This would be handled by the client-side reconnection logic
    // The server would receive a new connection event with the same user/room info
  }

  private async synchronizeStateAfterReconnection(oldConnectionId: string, newConnection: AppSyncConnection): Promise<void> {
    const snapshot = this.stateSnapshots.get(oldConnectionId);
    if (!snapshot) {
      return;
    }

    try {
      // Send state synchronization message
      if (newConnection.userId && newConnection.roomId) {
        const syncMessage: AppSyncMessage = {
          type: 'state-sync',
          userId: newConnection.userId,
          roomId: newConnection.roomId,
          participantId: newConnection.participantId,
          data: {
            lastKnownState: snapshot.lastKnownState,
            reconnectedAt: new Date().toISOString(),
            previousConnectionId: oldConnectionId,
          },
          timestamp: new Date().toISOString(),
          messageId: this.generateMessageId(),
        };

        await this.appSyncManager.publishUserMessage(newConnection.userId, syncMessage);
      }

      // Update state snapshot with new connection
      const newSnapshot: StateSnapshot = {
        ...snapshot,
        connectionId: newConnection.connectionId,
        timestamp: new Date(),
      };

      this.stateSnapshots.delete(oldConnectionId);
      this.stateSnapshots.set(newConnection.connectionId, newSnapshot);

      this.logger.log(`State synchronized after reconnection for ${newConnection.connectionId}`);
    } catch (error) {
      this.logger.error('Failed to synchronize state after reconnection:', error);
    }
  }

  private async pollRoomUpdates(roomId: string, connectionId: string): Promise<void> {
    // In a real implementation, this would poll for room state updates
    // and send them to the client via HTTP or other fallback mechanism
    
    // For now, we'll just log the polling activity
    this.logger.debug(`Polling room updates for ${roomId} (connection: ${connectionId})`);
  }

  private getReconnectionStrategy(): ReconnectionStrategy {
    return {
      maxAttempts: this.configService.get('RECONNECTION_MAX_ATTEMPTS', this.defaultStrategy.maxAttempts),
      baseDelay: this.configService.get('RECONNECTION_BASE_DELAY', this.defaultStrategy.baseDelay),
      maxDelay: this.configService.get('RECONNECTION_MAX_DELAY', this.defaultStrategy.maxDelay),
      backoffMultiplier: this.configService.get('RECONNECTION_BACKOFF_MULTIPLIER', this.defaultStrategy.backoffMultiplier),
    };
  }

  private calculateReconnectionDelay(attempt: number, strategy: ReconnectionStrategy): number {
    const delay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt - 1);
    return Math.min(delay, strategy.maxDelay);
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}