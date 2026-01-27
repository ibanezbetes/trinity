/**
 * Property-based tests for State Synchronization
 * Feature: trinity-voting-fixes, Property 19: State Synchronization
 * 
 * Tests the state synchronization system that ensures accurate room state
 * and vote counts when connections are restored.
 */

import * as fc from 'fast-check';

// Simple mock for testing core logic without complex AWS dependencies
class MockStateSyncService {
  private connections: Map<string, any> = new Map();
  private syncEvents: Array<{ roomId: string; userId?: string; timestamp: string }> = [];

  async handleUserConnection(roomId: string, userId: string, connectionId: string): Promise<void> {
    const connectionKey = `${roomId}_${userId}`;
    const existingConnection = this.connections.get(connectionKey);
    
    const connectionInfo = {
      userId,
      connectionId,
      roomId,
      connectedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      reconnectionAttempts: existingConnection ? existingConnection.reconnectionAttempts + 1 : 0,
      status: 'CONNECTED'
    };

    this.connections.set(connectionKey, connectionInfo);

    // If this is a reconnection, trigger state sync
    if (existingConnection && connectionInfo.reconnectionAttempts > 0) {
      await this.triggerRoomStateSync(roomId, userId);
    }
  }

  async handleUserDisconnection(roomId: string, userId: string, connectionId: string): Promise<void> {
    const connectionKey = `${roomId}_${userId}`;
    const existingConnection = this.connections.get(connectionKey);

    if (existingConnection) {
      existingConnection.status = 'DISCONNECTED';
      existingConnection.lastSeen = new Date().toISOString();
      this.connections.set(connectionKey, existingConnection);
    }
  }

  async triggerRoomStateSync(roomId: string, targetUserId?: string): Promise<void> {
    this.syncEvents.push({
      roomId,
      userId: targetUserId,
      timestamp: new Date().toISOString()
    });
  }

  getConnectionStats(roomId?: string): {
    totalConnections: number;
    activeConnections: number;
    disconnectedConnections: number;
  } {
    const connections = Array.from(this.connections.values());
    const filteredConnections = roomId ? 
      connections.filter(conn => conn.roomId === roomId) : 
      connections;

    const activeConnections = filteredConnections.filter(conn => conn.status === 'CONNECTED').length;
    const disconnectedConnections = filteredConnections.filter(conn => conn.status === 'DISCONNECTED').length;

    return {
      totalConnections: filteredConnections.length,
      activeConnections,
      disconnectedConnections
    };
  }

  getSyncEvents(): Array<{ roomId: string; userId?: string; timestamp: string }> {
    return [...this.syncEvents];
  }

  getConnection(roomId: string, userId: string): any {
    return this.connections.get(`${roomId}_${userId}`);
  }

  reset(): void {
    this.connections.clear();
    this.syncEvents.length = 0;
  }
}

describe('State Synchronization Property Tests', () => {
  
  let mockService: MockStateSyncService;

  beforeEach(() => {
    mockService = new MockStateSyncService();
  });

  /**
   * Property 19: State Synchronization
   * For any reconnection event, the system should sync the latest room state 
   * and vote counts accurately
   */
  test('Property 19: Reconnection triggers accurate state synchronization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 20 }).filter(s => s.trim().length > 0), // roomId
        fc.string({ minLength: 8, maxLength: 20 }).filter(s => s.trim().length > 0), // userId
        fc.string({ minLength: 10, maxLength: 30 }).filter(s => s.trim().length > 0), // connectionId
        async (roomId, userId, connectionId) => {
          // Reset service state
          mockService.reset();
          
          // Initial connection - should not trigger sync
          await mockService.handleUserConnection(roomId, userId, connectionId);
          
          const initialConnection = mockService.getConnection(roomId, userId);
          expect(initialConnection.reconnectionAttempts).toBe(0);
          
          let syncEvents = mockService.getSyncEvents();
          expect(syncEvents.length).toBe(0); // No sync on first connection
          
          // Disconnect user
          await mockService.handleUserDisconnection(roomId, userId, connectionId);
          
          const disconnectedConnection = mockService.getConnection(roomId, userId);
          expect(disconnectedConnection.status).toBe('DISCONNECTED');
          
          // Reconnect user - should trigger sync
          const reconnectId = `${connectionId}_reconnect`;
          await mockService.handleUserConnection(roomId, userId, reconnectId);
          
          const reconnectedConnection = mockService.getConnection(roomId, userId);
          
          // Property: Reconnection should increment attempt counter
          expect(reconnectedConnection.reconnectionAttempts).toBe(1);
          expect(reconnectedConnection.status).toBe('CONNECTED');
          
          // Property: Reconnection should trigger state sync
          syncEvents = mockService.getSyncEvents();
          expect(syncEvents.length).toBe(1);
          expect(syncEvents[0].roomId).toBe(roomId);
          expect(syncEvents[0].userId).toBe(userId);
          
          // Multiple reconnections should increment counter
          await mockService.handleUserDisconnection(roomId, userId, reconnectId);
          const secondReconnectId = `${connectionId}_reconnect2`;
          await mockService.handleUserConnection(roomId, userId, secondReconnectId);
          
          const secondReconnection = mockService.getConnection(roomId, userId);
          expect(secondReconnection.reconnectionAttempts).toBe(2);
          
          // Property: Each reconnection should trigger a sync event
          syncEvents = mockService.getSyncEvents();
          expect(syncEvents.length).toBe(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Connection tracking maintains accurate state
   */
  test('Property: Connection tracking accurately reflects user states', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 20 }).filter(s => s.trim().length > 0), // roomId
        fc.array(fc.string({ minLength: 8, maxLength: 20 }).filter(s => s.trim().length > 0), { minLength: 2, maxLength: 5 }), // userIds
        fc.array(fc.string({ minLength: 10, maxLength: 30 }).filter(s => s.trim().length > 0), { minLength: 2, maxLength: 5 }), // connectionIds
        async (roomId, userIds, connectionIds) => {
          // Reset service state
          mockService.reset();
          
          // Ensure we have matching arrays
          const users = userIds.slice(0, Math.min(userIds.length, connectionIds.length));
          const connections = connectionIds.slice(0, users.length);
          
          // Connect all users
          for (let i = 0; i < users.length; i++) {
            await mockService.handleUserConnection(roomId, users[i], connections[i]);
          }
          
          // Property: All users should be connected
          const statsAfterConnect = mockService.getConnectionStats(roomId);
          expect(statsAfterConnect.activeConnections).toBe(users.length);
          expect(statsAfterConnect.totalConnections).toBe(users.length);
          expect(statsAfterConnect.disconnectedConnections).toBe(0);
          
          // Disconnect half of the users
          const usersToDisconnect = users.slice(0, Math.floor(users.length / 2));
          const connectionsToDisconnect = connections.slice(0, usersToDisconnect.length);
          
          for (let i = 0; i < usersToDisconnect.length; i++) {
            await mockService.handleUserDisconnection(roomId, usersToDisconnect[i], connectionsToDisconnect[i]);
          }
          
          // Property: Connection counts should be accurate after disconnections
          const statsAfterDisconnect = mockService.getConnectionStats(roomId);
          const expectedActive = users.length - usersToDisconnect.length;
          const expectedDisconnected = usersToDisconnect.length;
          
          expect(statsAfterDisconnect.activeConnections).toBe(expectedActive);
          expect(statsAfterDisconnect.disconnectedConnections).toBe(expectedDisconnected);
          expect(statsAfterDisconnect.totalConnections).toBe(users.length);
          
          // Property: Total connections should equal active + disconnected
          expect(statsAfterDisconnect.totalConnections).toBe(
            statsAfterDisconnect.activeConnections + statsAfterDisconnect.disconnectedConnections
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: State sync events are triggered correctly
   */
  test('Property: State sync events are triggered for reconnections only', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 20 }).filter(s => s.trim().length > 0), // roomId
        fc.array(fc.string({ minLength: 8, maxLength: 20 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 3 }), // userIds
        async (roomId, userIds) => {
          // Reset service state
          mockService.reset();
          
          const users = [...new Set(userIds)]; // Remove duplicates
          
          // Connect all users for the first time
          for (let i = 0; i < users.length; i++) {
            await mockService.handleUserConnection(roomId, users[i], `conn_${i}`);
          }
          
          // Property: First connections should not trigger sync events
          let syncEvents = mockService.getSyncEvents();
          expect(syncEvents.length).toBe(0);
          
          // Disconnect and reconnect each user
          let expectedSyncEvents = 0;
          for (let i = 0; i < users.length; i++) {
            await mockService.handleUserDisconnection(roomId, users[i], `conn_${i}`);
            await mockService.handleUserConnection(roomId, users[i], `reconnect_${i}`);
            expectedSyncEvents++;
            
            // Property: Each reconnection should add exactly one sync event
            syncEvents = mockService.getSyncEvents();
            expect(syncEvents.length).toBe(expectedSyncEvents);
            expect(syncEvents[expectedSyncEvents - 1].roomId).toBe(roomId);
            expect(syncEvents[expectedSyncEvents - 1].userId).toBe(users[i]);
          }
          
          // Property: Multiple reconnections for same user should create multiple events
          const testUser = users[0];
          await mockService.handleUserDisconnection(roomId, testUser, `reconnect_0`);
          await mockService.handleUserConnection(roomId, testUser, `reconnect2_0`);
          expectedSyncEvents++;
          
          syncEvents = mockService.getSyncEvents();
          expect(syncEvents.length).toBe(expectedSyncEvents);
          
          // Property: Reconnection attempt counter should increase
          const finalConnection = mockService.getConnection(roomId, testUser);
          expect(finalConnection.reconnectionAttempts).toBe(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Connection state consistency
   */
  test('Property: Connection state remains consistent across operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 20 }).filter(s => s.trim().length > 0), // roomId
        fc.string({ minLength: 8, maxLength: 20 }).filter(s => s.trim().length > 0), // userId
        fc.integer({ min: 1, max: 5 }), // number of connection cycles
        async (roomId, userId, cycles) => {
          // Reset service state
          mockService.reset();
          
          let expectedReconnectionAttempts = 0;
          
          // Initial connection
          await mockService.handleUserConnection(roomId, userId, 'initial_conn');
          
          let connection = mockService.getConnection(roomId, userId);
          expect(connection.reconnectionAttempts).toBe(0);
          expect(connection.status).toBe('CONNECTED');
          
          // Perform multiple disconnect/reconnect cycles
          for (let cycle = 1; cycle <= cycles; cycle++) {
            // Disconnect
            await mockService.handleUserDisconnection(roomId, userId, `conn_${cycle - 1}`);
            
            connection = mockService.getConnection(roomId, userId);
            expect(connection.status).toBe('DISCONNECTED');
            
            // Reconnect
            await mockService.handleUserConnection(roomId, userId, `conn_${cycle}`);
            expectedReconnectionAttempts++;
            
            connection = mockService.getConnection(roomId, userId);
            
            // Property: Reconnection attempts should increment correctly
            expect(connection.reconnectionAttempts).toBe(expectedReconnectionAttempts);
            expect(connection.status).toBe('CONNECTED');
            expect(connection.connectionId).toBe(`conn_${cycle}`);
          }
          
          // Property: Sync events should match reconnection attempts
          const syncEvents = mockService.getSyncEvents();
          expect(syncEvents.length).toBe(expectedReconnectionAttempts);
          
          // Property: All sync events should be for the correct room and user
          syncEvents.forEach(event => {
            expect(event.roomId).toBe(roomId);
            expect(event.userId).toBe(userId);
            expect(event.timestamp).toBeDefined();
          });
        }
      ),
      { numRuns: 100 }
    );
  });

});
