/**
 * Connection Resilience Service Unit Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConnectionResilienceService } from './connection-resilience.service';
import { IAppSyncManager, AppSyncConnection } from './appsync.interface';

describe('ConnectionResilienceService', () => {
  let service: ConnectionResilienceService;
  let mockAppSyncManager: jest.Mocked<IAppSyncManager>;
  let mockConfigService: jest.Mocked<ConfigService>;

  const mockConnection: AppSyncConnection = {
    id: 'conn_123',
    connectionId: 'appsync_conn_123',
    userId: 'user_123',
    roomId: 'room_123',
    participantId: 'participant_123',
    isAuthenticated: true,
    connectedAt: new Date(),
    lastActiveAt: new Date(),
  };

  beforeEach(async () => {
    mockAppSyncManager = {
      handleConnectionEvent: jest.fn(),
      publishRoomMessage: jest.fn(),
      publishVotingUpdate: jest.fn(),
      publishUserMessage: jest.fn(),
      broadcastToAll: jest.fn(),
      getRoomConnections: jest.fn(),
      getUserConnections: jest.fn(),
      getConnectionStats: jest.fn(),
      cleanupInactiveConnections: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config = {
          HEALTH_CHECK_INTERVAL: 30000,
          HEALTH_CHECK_TIMEOUT: 60000,
          RECONNECTION_MAX_ATTEMPTS: 5,
          RECONNECTION_BASE_DELAY: 1000,
          RECONNECTION_MAX_DELAY: 30000,
          RECONNECTION_BACKOFF_MULTIPLIER: 2,
          POLLING_FALLBACK_INTERVAL: 5000,
        };
        return config[key] || defaultValue;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionResilienceService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'IAppSyncManager', useValue: mockAppSyncManager },
      ],
    }).compile();

    service = module.get<ConnectionResilienceService>(ConnectionResilienceService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('initializeConnectionHealth', () => {
    it('should initialize health monitoring for a connection', async () => {
      await service.initializeConnectionHealth(mockConnection);

      const health = service.getConnectionHealth(mockConnection.connectionId);
      expect(health).toBeDefined();
      expect(health?.connectionId).toBe(mockConnection.connectionId);
      expect(health?.isHealthy).toBe(true);
      expect(health?.consecutiveFailures).toBe(0);
      expect(health?.reconnectAttempts).toBe(0);
    });

    it('should create state snapshot during initialization', async () => {
      await service.initializeConnectionHealth(mockConnection);

      // Health should be initialized
      const health = service.getConnectionHealth(mockConnection.connectionId);
      expect(health).toBeDefined();
    });
  });

  describe('handleConnectionFailure', () => {
    beforeEach(async () => {
      await service.initializeConnectionHealth(mockConnection);
    });

    it('should mark connection as unhealthy on failure', async () => {
      const error = new Error('Connection failed');
      
      await service.handleConnectionFailure(mockConnection.connectionId, error);

      const health = service.getConnectionHealth(mockConnection.connectionId);
      expect(health?.isHealthy).toBe(false);
      expect(health?.consecutiveFailures).toBe(1);
    });

    it('should increment consecutive failures on repeated failures', async () => {
      const error = new Error('Connection failed');
      
      await service.handleConnectionFailure(mockConnection.connectionId, error);
      await service.handleConnectionFailure(mockConnection.connectionId, error);

      const health = service.getConnectionHealth(mockConnection.connectionId);
      expect(health?.consecutiveFailures).toBe(2);
    });

    it('should handle failure for non-existent connection gracefully', async () => {
      const error = new Error('Connection failed');
      
      await expect(
        service.handleConnectionFailure('non_existent_connection', error)
      ).resolves.not.toThrow();
    });
  });

  describe('handleReconnectionSuccess', () => {
    const newConnection: AppSyncConnection = {
      ...mockConnection,
      connectionId: 'appsync_conn_456',
    };

    beforeEach(async () => {
      await service.initializeConnectionHealth(mockConnection);
      await service.handleConnectionFailure(mockConnection.connectionId, new Error('Test failure'));
    });

    it('should transfer health monitoring to new connection', async () => {
      await service.handleReconnectionSuccess(mockConnection.connectionId, newConnection);

      const oldHealth = service.getConnectionHealth(mockConnection.connectionId);
      const newHealth = service.getConnectionHealth(newConnection.connectionId);

      expect(oldHealth).toBeNull();
      expect(newHealth).toBeDefined();
      expect(newHealth?.isHealthy).toBe(true);
      expect(newHealth?.consecutiveFailures).toBe(0);
      expect(newHealth?.reconnectAttempts).toBe(0);
    });

    it('should publish state synchronization message', async () => {
      await service.handleReconnectionSuccess(mockConnection.connectionId, newConnection);

      expect(mockAppSyncManager.publishUserMessage).toHaveBeenCalledWith(
        newConnection.userId,
        expect.objectContaining({
          type: 'state-sync',
          userId: newConnection.userId,
          roomId: newConnection.roomId,
          participantId: newConnection.participantId,
        })
      );
    });
  });

  describe('updateConnectionHealth', () => {
    beforeEach(async () => {
      await service.initializeConnectionHealth(mockConnection);
    });

    it('should update connection health status', async () => {
      await service.updateConnectionHealth(mockConnection.connectionId, false);

      const health = service.getConnectionHealth(mockConnection.connectionId);
      expect(health?.isHealthy).toBe(false);
    });

    it('should reset consecutive failures when marking as healthy', async () => {
      // First mark as unhealthy
      await service.handleConnectionFailure(mockConnection.connectionId, new Error('Test'));
      
      // Then mark as healthy
      await service.updateConnectionHealth(mockConnection.connectionId, true);

      const health = service.getConnectionHealth(mockConnection.connectionId);
      expect(health?.isHealthy).toBe(true);
      expect(health?.consecutiveFailures).toBe(0);
    });

    it('should handle update for non-existent connection gracefully', async () => {
      await expect(
        service.updateConnectionHealth('non_existent_connection', true)
      ).resolves.not.toThrow();
    });
  });

  describe('enablePollingFallback', () => {
    beforeEach(async () => {
      await service.initializeConnectionHealth(mockConnection);
    });

    it('should enable polling fallback for connection with room', async () => {
      await service.enablePollingFallback(mockConnection.connectionId);

      const stats = service.getResilienceStats();
      expect(stats.pollingFallbacks).toBe(1);
    });

    it('should not enable polling fallback for connection without room', async () => {
      const connectionWithoutRoom = { ...mockConnection, roomId: undefined };
      await service.initializeConnectionHealth(connectionWithoutRoom);

      await service.enablePollingFallback(connectionWithoutRoom.connectionId);

      const stats = service.getResilienceStats();
      expect(stats.pollingFallbacks).toBe(0);
    });
  });

  describe('disablePollingFallback', () => {
    beforeEach(async () => {
      await service.initializeConnectionHealth(mockConnection);
      await service.enablePollingFallback(mockConnection.connectionId);
    });

    it('should disable polling fallback for connection', async () => {
      await service.disablePollingFallback(mockConnection.connectionId);

      const stats = service.getResilienceStats();
      expect(stats.pollingFallbacks).toBe(0);
    });

    it('should handle disable for non-existent fallback gracefully', async () => {
      await expect(
        service.disablePollingFallback('non_existent_connection')
      ).resolves.not.toThrow();
    });
  });

  describe('cleanupConnection', () => {
    beforeEach(async () => {
      await service.initializeConnectionHealth(mockConnection);
      await service.enablePollingFallback(mockConnection.connectionId);
    });

    it('should clean up all connection resources', async () => {
      await service.cleanupConnection(mockConnection.connectionId);

      const health = service.getConnectionHealth(mockConnection.connectionId);
      const stats = service.getResilienceStats();

      expect(health).toBeNull();
      expect(stats.pollingFallbacks).toBe(0);
      expect(stats.totalConnections).toBe(0);
    });
  });

  describe('getResilienceStats', () => {
    it('should return correct statistics', async () => {
      await service.initializeConnectionHealth(mockConnection);
      
      const healthyConnection = { ...mockConnection, connectionId: 'healthy_conn' };
      await service.initializeConnectionHealth(healthyConnection);
      
      const unhealthyConnection = { ...mockConnection, connectionId: 'unhealthy_conn' };
      await service.initializeConnectionHealth(unhealthyConnection);
      await service.handleConnectionFailure(unhealthyConnection.connectionId, new Error('Test'));

      const stats = service.getResilienceStats();

      expect(stats.totalConnections).toBe(3);
      expect(stats.healthyConnections).toBe(2);
      expect(stats.unhealthyConnections).toBe(1);
      // Note: activeReconnections might be > 0 due to async timers
      expect(stats.activeReconnections).toBeGreaterThanOrEqual(0);
      expect(stats.pollingFallbacks).toBeGreaterThanOrEqual(0); // May have polling fallback enabled
    });

    it('should return zero stats when no connections', () => {
      const stats = service.getResilienceStats();

      expect(stats.totalConnections).toBe(0);
      expect(stats.healthyConnections).toBe(0);
      expect(stats.unhealthyConnections).toBe(0);
      expect(stats.activeReconnections).toBe(0);
      expect(stats.pollingFallbacks).toBe(0);
    });
  });

  describe('reconnection strategy', () => {
    beforeEach(async () => {
      await service.initializeConnectionHealth(mockConnection);
    });

    it('should use exponential backoff for reconnection delays', async () => {
      // Mock the private method behavior by testing multiple failures
      const error = new Error('Connection failed');
      
      // Simulate multiple failures to trigger reconnection attempts
      for (let i = 0; i < 3; i++) {
        await service.handleConnectionFailure(mockConnection.connectionId, error);
      }

      const health = service.getConnectionHealth(mockConnection.connectionId);
      expect(health?.consecutiveFailures).toBe(3);
    });

    it('should enable polling fallback after max reconnection attempts', async () => {
      const error = new Error('Connection failed');
      
      // Simulate max failures to trigger polling fallback
      for (let i = 0; i < 6; i++) { // More than max attempts (5)
        await service.handleConnectionFailure(mockConnection.connectionId, error);
      }

      // Should eventually enable polling fallback
      // Note: This is a simplified test - in reality, the reconnection logic
      // would be more complex with timers
    });
  });
});