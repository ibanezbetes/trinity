/**
 * WebSocket Service Unit Tests
 * Tests for WebSocket connection management and Redis pub/sub
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebSocketService } from './websocket.service';
import { RedisService } from './redis.service';
import { WebSocketMessage } from './websocket.interface';

describe('WebSocketService', () => {
  let service: WebSocketService;
  let redisService: RedisService;
  let mockSocket: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSocketService,
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                WEBSOCKET_CLEANUP_INTERVAL: 60000,
                WEBSOCKET_INACTIVE_THRESHOLD: 300000,
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<WebSocketService>(WebSocketService);
    redisService = module.get<RedisService>(RedisService);

    // Mock socket
    mockSocket = {
      id: 'socket-123',
      emit: jest.fn(),
      on: jest.fn(),
      disconnect: jest.fn(),
    };
  });

  afterEach(async () => {
    // Clean up
    await service.onModuleDestroy();
  });

  describe('handleConnection', () => {
    it('should create a new WebSocket connection', async () => {
      const connection = await service.handleConnection(mockSocket);

      expect(connection).toBeDefined();
      expect(connection.id).toBeDefined();
      expect(connection.socket).toBe(mockSocket);
      expect(connection.isAuthenticated).toBe(false);
      expect(connection.connectedAt).toBeInstanceOf(Date);
      expect(connection.lastActiveAt).toBeInstanceOf(Date);
    });

    it('should set up socket event handlers', async () => {
      await service.handleConnection(mockSocket);

      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('ping', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('handleDisconnection', () => {
    it('should remove connection and clean up mappings', async () => {
      const connection = await service.handleConnection(mockSocket);
      
      // Authenticate and join room
      await service.authenticateConnection(connection.id, 'valid-token-123');
      await service.joinRoom(connection.id, 'room-123', 'participant-456');

      // Verify connection exists
      const foundConnection = await service.getConnection(connection.id);
      expect(foundConnection).toBeDefined();

      // Disconnect
      await service.handleDisconnection(connection.id);

      // Verify connection is removed
      const removedConnection = await service.getConnection(connection.id);
      expect(removedConnection).toBeNull();
    });
  });

  describe('authenticateConnection', () => {
    it('should authenticate connection with valid token', async () => {
      const connection = await service.handleConnection(mockSocket);
      
      await service.authenticateConnection(connection.id, 'valid-token-123');

      const authenticatedConnection = await service.getConnection(connection.id);
      expect(authenticatedConnection?.isAuthenticated).toBe(true);
      expect(authenticatedConnection?.userId).toBeDefined();
      expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
        type: 'authenticated',
      }));
    });

    it('should reject authentication with invalid token', async () => {
      const connection = await service.handleConnection(mockSocket);
      
      try {
        await service.authenticateConnection(connection.id, 'invalid');
        // If no error is thrown, check that authentication failed
        const authenticatedConnection = await service.getConnection(connection.id);
        expect(authenticatedConnection?.isAuthenticated).toBe(false);
      } catch (error) {
        // Authentication should fail for invalid tokens
        expect(error).toBeDefined();
      }

      expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
        type: 'authentication-failed',
      }));
    });

    it('should throw error for non-existent connection', async () => {
      await expect(
        service.authenticateConnection('non-existent', 'valid-token-123')
      ).rejects.toThrow('Connection not found');
    });
  });

  describe('joinRoom', () => {
    it('should allow authenticated user to join room', async () => {
      const connection = await service.handleConnection(mockSocket);
      await service.authenticateConnection(connection.id, 'valid-token-123');
      
      await service.joinRoom(connection.id, 'room-123', 'participant-456');

      const updatedConnection = await service.getConnection(connection.id);
      expect(updatedConnection?.roomId).toBe('room-123');
      expect(updatedConnection?.participantId).toBe('participant-456');

      expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
        type: 'room-joined',
        roomId: 'room-123',
      }));
    });

    it('should reject unauthenticated user', async () => {
      const connection = await service.handleConnection(mockSocket);
      
      await expect(
        service.joinRoom(connection.id, 'room-123', 'participant-456')
      ).rejects.toThrow('Connection not authenticated');
    });

    it('should leave current room when joining new room', async () => {
      const connection = await service.handleConnection(mockSocket);
      await service.authenticateConnection(connection.id, 'valid-token-123');
      
      // Join first room
      await service.joinRoom(connection.id, 'room-123', 'participant-456');
      
      // Join second room
      await service.joinRoom(connection.id, 'room-456', 'participant-789');

      const updatedConnection = await service.getConnection(connection.id);
      expect(updatedConnection?.roomId).toBe('room-456');
      expect(updatedConnection?.participantId).toBe('participant-789');
    });
  });

  describe('leaveRoom', () => {
    it('should allow user to leave room', async () => {
      const connection = await service.handleConnection(mockSocket);
      await service.authenticateConnection(connection.id, 'valid-token-123');
      await service.joinRoom(connection.id, 'room-123', 'participant-456');
      
      await service.leaveRoom(connection.id, 'room-123');

      const updatedConnection = await service.getConnection(connection.id);
      expect(updatedConnection?.roomId).toBeUndefined();
      expect(updatedConnection?.participantId).toBeUndefined();

      expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
        type: 'room-left',
        roomId: 'room-123',
      }));
    });

    it('should do nothing if user not in specified room', async () => {
      const connection = await service.handleConnection(mockSocket);
      await service.authenticateConnection(connection.id, 'valid-token-123');
      await service.joinRoom(connection.id, 'room-123', 'participant-456');
      
      // Try to leave different room
      await service.leaveRoom(connection.id, 'room-456');

      const updatedConnection = await service.getConnection(connection.id);
      expect(updatedConnection?.roomId).toBe('room-123'); // Still in original room
    });
  });

  describe('sendToConnection', () => {
    it('should send message to specific connection', async () => {
      const connection = await service.handleConnection(mockSocket);
      
      const message: WebSocketMessage = {
        type: 'test-message',
        data: { content: 'Hello' },
        timestamp: new Date(),
        messageId: 'msg-123',
      };

      await service.sendToConnection(connection.id, message);

      expect(mockSocket.emit).toHaveBeenCalledWith('message', message);
    });

    it('should handle non-existent connection gracefully', async () => {
      const message: WebSocketMessage = {
        type: 'test-message',
        data: { content: 'Hello' },
        timestamp: new Date(),
        messageId: 'msg-123',
      };

      // Should not throw
      await service.sendToConnection('non-existent', message);
    });
  });

  describe('broadcastToRoom', () => {
    it('should broadcast message to all room connections', async () => {
      // Create multiple connections in same room
      const connection1 = await service.handleConnection(mockSocket);
      const mockSocket2 = { ...mockSocket, emit: jest.fn() };
      const connection2 = await service.handleConnection(mockSocket2);

      await service.authenticateConnection(connection1.id, 'valid-token-123');
      await service.authenticateConnection(connection2.id, 'valid-token-456');
      
      await service.joinRoom(connection1.id, 'room-123');
      await service.joinRoom(connection2.id, 'room-123');

      const message: WebSocketMessage = {
        type: 'room-broadcast',
        roomId: 'room-123',
        data: { content: 'Hello room' },
        timestamp: new Date(),
        messageId: 'msg-123',
      };

      await service.broadcastToRoom('room-123', message);

      expect(mockSocket.emit).toHaveBeenCalledWith('message', message);
      expect(mockSocket2.emit).toHaveBeenCalledWith('message', message);
    });

    it('should exclude specified connections from broadcast', async () => {
      const connection1 = await service.handleConnection(mockSocket);
      const mockSocket2 = { ...mockSocket, emit: jest.fn() };
      const connection2 = await service.handleConnection(mockSocket2);

      await service.authenticateConnection(connection1.id, 'valid-token-123');
      await service.authenticateConnection(connection2.id, 'valid-token-456');
      
      await service.joinRoom(connection1.id, 'room-123');
      await service.joinRoom(connection2.id, 'room-123');

      const message: WebSocketMessage = {
        type: 'room-broadcast',
        roomId: 'room-123',
        data: { content: 'Hello room' },
        timestamp: new Date(),
        messageId: 'msg-123',
      };

      await service.broadcastToRoom('room-123', message, [connection1.id]);

      expect(mockSocket.emit).not.toHaveBeenCalledWith('message', message);
      expect(mockSocket2.emit).toHaveBeenCalledWith('message', message);
    });
  });

  describe('getUserConnections', () => {
    it('should return all connections for a user', async () => {
      const connection1 = await service.handleConnection(mockSocket);
      const mockSocket2 = { ...mockSocket, emit: jest.fn() };
      const connection2 = await service.handleConnection(mockSocket2);

      await service.authenticateConnection(connection1.id, 'valid-token-123');
      await service.authenticateConnection(connection2.id, 'valid-token-123'); // Same user

      const userConnections = await service.getUserConnections('user_valid-to');
      expect(userConnections).toHaveLength(2);
      expect(userConnections.map(c => c.id)).toContain(connection1.id);
      expect(userConnections.map(c => c.id)).toContain(connection2.id);
    });

    it('should return empty array for user with no connections', async () => {
      const userConnections = await service.getUserConnections('non-existent-user');
      expect(userConnections).toHaveLength(0);
    });
  });

  describe('getRoomConnections', () => {
    it('should return all connections for a room', async () => {
      const connection1 = await service.handleConnection(mockSocket);
      const mockSocket2 = { ...mockSocket, emit: jest.fn() };
      const connection2 = await service.handleConnection(mockSocket2);

      await service.authenticateConnection(connection1.id, 'valid-token-123');
      await service.authenticateConnection(connection2.id, 'valid-token-456');
      
      await service.joinRoom(connection1.id, 'room-123');
      await service.joinRoom(connection2.id, 'room-123');

      const roomConnections = await service.getRoomConnections('room-123');
      expect(roomConnections).toHaveLength(2);
      expect(roomConnections.map(c => c.id)).toContain(connection1.id);
      expect(roomConnections.map(c => c.id)).toContain(connection2.id);
    });

    it('should return empty array for room with no connections', async () => {
      const roomConnections = await service.getRoomConnections('empty-room');
      expect(roomConnections).toHaveLength(0);
    });
  });

  describe('getConnectionStats', () => {
    it('should return accurate connection statistics', async () => {
      const connection1 = await service.handleConnection(mockSocket);
      const mockSocket2 = { ...mockSocket, emit: jest.fn() };
      const connection2 = await service.handleConnection(mockSocket2);

      await service.authenticateConnection(connection1.id, 'valid-token-123');
      await service.joinRoom(connection1.id, 'room-123');

      const stats = await service.getConnectionStats();

      expect(stats.totalConnections).toBe(2);
      expect(stats.authenticatedConnections).toBe(1);
      expect(stats.roomConnections.get('room-123')).toBe(1);
      expect(stats.averageConnectionDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cleanupInactiveConnections', () => {
    it('should remove inactive connections', async () => {
      const connection = await service.handleConnection(mockSocket);
      
      // Mock old last active time
      const connectionObj = await service.getConnection(connection.id);
      if (connectionObj) {
        connectionObj.lastActiveAt = new Date(Date.now() - 400000); // 6+ minutes ago
      }

      const cleanedCount = await service.cleanupInactiveConnections();

      expect(cleanedCount).toBe(1);
      
      const removedConnection = await service.getConnection(connection.id);
      expect(removedConnection).toBeNull();
    });

    it('should not remove active connections', async () => {
      const connection = await service.handleConnection(mockSocket);
      
      const cleanedCount = await service.cleanupInactiveConnections();

      expect(cleanedCount).toBe(0);
      
      const activeConnection = await service.getConnection(connection.id);
      expect(activeConnection).toBeDefined();
    });
  });
});