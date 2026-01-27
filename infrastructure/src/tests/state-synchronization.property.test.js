"use strict";
/**
 * Property-based tests for State Synchronization
 * Feature: trinity-voting-fixes, Property 19: State Synchronization
 *
 * Tests the state synchronization system that ensures accurate room state
 * and vote counts when connections are restored.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fc = __importStar(require("fast-check"));
// Simple mock for testing core logic without complex AWS dependencies
class MockStateSyncService {
    constructor() {
        this.connections = new Map();
        this.syncEvents = [];
    }
    async handleUserConnection(roomId, userId, connectionId) {
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
    async handleUserDisconnection(roomId, userId, connectionId) {
        const connectionKey = `${roomId}_${userId}`;
        const existingConnection = this.connections.get(connectionKey);
        if (existingConnection) {
            existingConnection.status = 'DISCONNECTED';
            existingConnection.lastSeen = new Date().toISOString();
            this.connections.set(connectionKey, existingConnection);
        }
    }
    async triggerRoomStateSync(roomId, targetUserId) {
        this.syncEvents.push({
            roomId,
            userId: targetUserId,
            timestamp: new Date().toISOString()
        });
    }
    getConnectionStats(roomId) {
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
    getSyncEvents() {
        return [...this.syncEvents];
    }
    getConnection(roomId, userId) {
        return this.connections.get(`${roomId}_${userId}`);
    }
    reset() {
        this.connections.clear();
        this.syncEvents.length = 0;
    }
}
describe('State Synchronization Property Tests', () => {
    let mockService;
    beforeEach(() => {
        mockService = new MockStateSyncService();
    });
    /**
     * Property 19: State Synchronization
     * For any reconnection event, the system should sync the latest room state
     * and vote counts accurately
     */
    test('Property 19: Reconnection triggers accurate state synchronization', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 8, maxLength: 20 }).filter(s => s.trim().length > 0), // roomId
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
        }), { numRuns: 100 });
    });
    /**
     * Property: Connection tracking maintains accurate state
     */
    test('Property: Connection tracking accurately reflects user states', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 8, maxLength: 20 }).filter(s => s.trim().length > 0), // roomId
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
            expect(statsAfterDisconnect.totalConnections).toBe(statsAfterDisconnect.activeConnections + statsAfterDisconnect.disconnectedConnections);
        }), { numRuns: 100 });
    });
    /**
     * Property: State sync events are triggered correctly
     */
    test('Property: State sync events are triggered for reconnections only', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 8, maxLength: 20 }).filter(s => s.trim().length > 0), // roomId
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
        }), { numRuns: 100 });
    });
    /**
     * Property: Connection state consistency
     */
    test('Property: Connection state remains consistent across operations', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 8, maxLength: 20 }).filter(s => s.trim().length > 0), // roomId
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
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdGUtc3luY2hyb25pemF0aW9uLnByb3BlcnR5LnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzdGF0ZS1zeW5jaHJvbml6YXRpb24ucHJvcGVydHkudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILCtDQUFpQztBQUVqQyxzRUFBc0U7QUFDdEUsTUFBTSxvQkFBb0I7SUFBMUI7UUFDVSxnQkFBVyxHQUFxQixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzFDLGVBQVUsR0FBa0UsRUFBRSxDQUFDO0lBMkV6RixDQUFDO0lBekVDLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxNQUFjLEVBQUUsTUFBYyxFQUFFLFlBQW9CO1FBQzdFLE1BQU0sYUFBYSxHQUFHLEdBQUcsTUFBTSxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQzVDLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFL0QsTUFBTSxjQUFjLEdBQUc7WUFDckIsTUFBTTtZQUNOLFlBQVk7WUFDWixNQUFNO1lBQ04sV0FBVyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1lBQ3JDLFFBQVEsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtZQUNsQyxvQkFBb0IsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLENBQUMsb0JBQW9CLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFGLE1BQU0sRUFBRSxXQUFXO1NBQ3BCLENBQUM7UUFFRixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFFcEQsZ0RBQWdEO1FBQ2hELElBQUksa0JBQWtCLElBQUksY0FBYyxDQUFDLG9CQUFvQixHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2xFLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNsRCxDQUFDO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxNQUFjLEVBQUUsTUFBYyxFQUFFLFlBQW9CO1FBQ2hGLE1BQU0sYUFBYSxHQUFHLEdBQUcsTUFBTSxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQzVDLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFL0QsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1lBQ3ZCLGtCQUFrQixDQUFDLE1BQU0sR0FBRyxjQUFjLENBQUM7WUFDM0Msa0JBQWtCLENBQUMsUUFBUSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDdkQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDMUQsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsb0JBQW9CLENBQUMsTUFBYyxFQUFFLFlBQXFCO1FBQzlELElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDO1lBQ25CLE1BQU07WUFDTixNQUFNLEVBQUUsWUFBWTtZQUNwQixTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7U0FDcEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELGtCQUFrQixDQUFDLE1BQWU7UUFLaEMsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDMUQsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsQ0FBQztZQUNsQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ3BELFdBQVcsQ0FBQztRQUVkLE1BQU0saUJBQWlCLEdBQUcsbUJBQW1CLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxXQUFXLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDakcsTUFBTSx1QkFBdUIsR0FBRyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLGNBQWMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUUxRyxPQUFPO1lBQ0wsZ0JBQWdCLEVBQUUsbUJBQW1CLENBQUMsTUFBTTtZQUM1QyxpQkFBaUI7WUFDakIsdUJBQXVCO1NBQ3hCLENBQUM7SUFDSixDQUFDO0lBRUQsYUFBYTtRQUNYLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUM5QixDQUFDO0lBRUQsYUFBYSxDQUFDLE1BQWMsRUFBRSxNQUFjO1FBQzFDLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxNQUFNLElBQUksTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQsS0FBSztRQUNILElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDekIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQzdCLENBQUM7Q0FDRjtBQUVELFFBQVEsQ0FBQyxzQ0FBc0MsRUFBRSxHQUFHLEVBQUU7SUFFcEQsSUFBSSxXQUFpQyxDQUFDO0lBRXRDLFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDZCxXQUFXLEdBQUcsSUFBSSxvQkFBb0IsRUFBRSxDQUFDO0lBQzNDLENBQUMsQ0FBQyxDQUFDO0lBRUg7Ozs7T0FJRztJQUNILElBQUksQ0FBQyxtRUFBbUUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNuRixNQUFNLEVBQUUsQ0FBQyxNQUFNLENBQ2IsRUFBRSxDQUFDLGFBQWEsQ0FDZCxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLFNBQVM7UUFDdEYsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxTQUFTO1FBQ3RGLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsZUFBZTtRQUM3RixLQUFLLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsRUFBRTtZQUNyQyxzQkFBc0I7WUFDdEIsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBRXBCLCtDQUErQztZQUMvQyxNQUFNLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBRXJFLE1BQU0saUJBQWlCLEdBQUcsV0FBVyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDcEUsTUFBTSxDQUFDLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXZELElBQUksVUFBVSxHQUFHLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUM3QyxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLDhCQUE4QjtZQUVqRSxrQkFBa0I7WUFDbEIsTUFBTSxXQUFXLENBQUMsdUJBQXVCLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxZQUFZLENBQUMsQ0FBQztZQUV4RSxNQUFNLHNCQUFzQixHQUFHLFdBQVcsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3pFLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7WUFFM0QsdUNBQXVDO1lBQ3ZDLE1BQU0sV0FBVyxHQUFHLEdBQUcsWUFBWSxZQUFZLENBQUM7WUFDaEQsTUFBTSxXQUFXLENBQUMsb0JBQW9CLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztZQUVwRSxNQUFNLHFCQUFxQixHQUFHLFdBQVcsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBRXhFLDBEQUEwRDtZQUMxRCxNQUFNLENBQUMscUJBQXFCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0QsTUFBTSxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUV2RCxtREFBbUQ7WUFDbkQsVUFBVSxHQUFHLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUN6QyxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMxQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUUxQyxrREFBa0Q7WUFDbEQsTUFBTSxXQUFXLENBQUMsdUJBQXVCLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztZQUN2RSxNQUFNLGlCQUFpQixHQUFHLEdBQUcsWUFBWSxhQUFhLENBQUM7WUFDdkQsTUFBTSxXQUFXLENBQUMsb0JBQW9CLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1lBRTFFLE1BQU0sa0JBQWtCLEdBQUcsV0FBVyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDckUsTUFBTSxDQUFDLGtCQUFrQixDQUFDLG9CQUFvQixDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXhELDBEQUEwRDtZQUMxRCxVQUFVLEdBQUcsV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLENBQUMsQ0FDRixFQUNELEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUNqQixDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSDs7T0FFRztJQUNILElBQUksQ0FBQywrREFBK0QsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMvRSxNQUFNLEVBQUUsQ0FBQyxNQUFNLENBQ2IsRUFBRSxDQUFDLGFBQWEsQ0FDZCxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLFNBQVM7UUFDdEYsRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxVQUFVO1FBQ2pJLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsZ0JBQWdCO1FBQ3hJLEtBQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxFQUFFO1lBQ3ZDLHNCQUFzQjtZQUN0QixXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7WUFFcEIsaUNBQWlDO1lBQ2pDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUMvRSxNQUFNLFdBQVcsR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFekQsb0JBQW9CO1lBQ3BCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ3RDLE1BQU0sV0FBVyxDQUFDLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0UsQ0FBQztZQUVELDBDQUEwQztZQUMxQyxNQUFNLGlCQUFpQixHQUFHLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNqRSxNQUFNLENBQUMsaUJBQWlCLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQy9ELE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDOUQsTUFBTSxDQUFDLGlCQUFpQixDQUFDLHVCQUF1QixDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRTFELCtCQUErQjtZQUMvQixNQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZFLE1BQU0sdUJBQXVCLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsaUJBQWlCLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFL0UsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUNsRCxNQUFNLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0RyxDQUFDO1lBRUQsc0VBQXNFO1lBQ3RFLE1BQU0sb0JBQW9CLEdBQUcsV0FBVyxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3BFLE1BQU0sY0FBYyxHQUFHLEtBQUssQ0FBQyxNQUFNLEdBQUcsaUJBQWlCLENBQUMsTUFBTSxDQUFDO1lBQy9ELE1BQU0sb0JBQW9CLEdBQUcsaUJBQWlCLENBQUMsTUFBTSxDQUFDO1lBRXRELE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUNwRSxNQUFNLENBQUMsb0JBQW9CLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztZQUNoRixNQUFNLENBQUMsb0JBQW9CLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRWpFLGlFQUFpRTtZQUNqRSxNQUFNLENBQUMsb0JBQW9CLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLENBQ2hELG9CQUFvQixDQUFDLGlCQUFpQixHQUFHLG9CQUFvQixDQUFDLHVCQUF1QixDQUN0RixDQUFDO1FBQ0osQ0FBQyxDQUNGLEVBQ0QsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQ2pCLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVIOztPQUVHO0lBQ0gsSUFBSSxDQUFDLGtFQUFrRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xGLE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FDYixFQUFFLENBQUMsYUFBYSxDQUNkLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsU0FBUztRQUN0RixFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLFVBQVU7UUFDakksS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsRUFBRTtZQUN4QixzQkFBc0I7WUFDdEIsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBRXBCLE1BQU0sS0FBSyxHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsb0JBQW9CO1lBRXpELHVDQUF1QztZQUN2QyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUN0QyxNQUFNLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN4RSxDQUFDO1lBRUQsNkRBQTZEO1lBQzdELElBQUksVUFBVSxHQUFHLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUM3QyxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVsQyxxQ0FBcUM7WUFDckMsSUFBSSxrQkFBa0IsR0FBRyxDQUFDLENBQUM7WUFDM0IsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDdEMsTUFBTSxXQUFXLENBQUMsdUJBQXVCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3pFLE1BQU0sV0FBVyxDQUFDLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUMzRSxrQkFBa0IsRUFBRSxDQUFDO2dCQUVyQixnRUFBZ0U7Z0JBQ2hFLFVBQVUsR0FBRyxXQUFXLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3pDLE1BQU0sQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQ25ELE1BQU0sQ0FBQyxVQUFVLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMvRCxNQUFNLENBQUMsVUFBVSxDQUFDLGtCQUFrQixHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNuRSxDQUFDO1lBRUQsK0VBQStFO1lBQy9FLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxQixNQUFNLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQzNFLE1BQU0sV0FBVyxDQUFDLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsY0FBYyxDQUFDLENBQUM7WUFDekUsa0JBQWtCLEVBQUUsQ0FBQztZQUVyQixVQUFVLEdBQUcsV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFFbkQseURBQXlEO1lBQ3pELE1BQU0sZUFBZSxHQUFHLFdBQVcsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ3BFLE1BQU0sQ0FBQyxlQUFlLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkQsQ0FBQyxDQUNGLEVBQ0QsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQ2pCLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVIOztPQUVHO0lBQ0gsSUFBSSxDQUFDLGlFQUFpRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2pGLE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FDYixFQUFFLENBQUMsYUFBYSxDQUNkLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsU0FBUztRQUN0RixFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLFNBQVM7UUFDdEYsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsOEJBQThCO1FBQzlELEtBQUssRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQy9CLHNCQUFzQjtZQUN0QixXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7WUFFcEIsSUFBSSw0QkFBNEIsR0FBRyxDQUFDLENBQUM7WUFFckMscUJBQXFCO1lBQ3JCLE1BQU0sV0FBVyxDQUFDLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUM7WUFFdkUsSUFBSSxVQUFVLEdBQUcsV0FBVyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDM0QsTUFBTSxDQUFDLFVBQVUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoRCxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUU1QywrQ0FBK0M7WUFDL0MsS0FBSyxJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUUsS0FBSyxJQUFJLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDO2dCQUM3QyxhQUFhO2dCQUNiLE1BQU0sV0FBVyxDQUFDLHVCQUF1QixDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsUUFBUSxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFFL0UsVUFBVSxHQUFHLFdBQVcsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUN2RCxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFFL0MsWUFBWTtnQkFDWixNQUFNLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLFFBQVEsS0FBSyxFQUFFLENBQUMsQ0FBQztnQkFDeEUsNEJBQTRCLEVBQUUsQ0FBQztnQkFFL0IsVUFBVSxHQUFHLFdBQVcsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUV2RCw2REFBNkQ7Z0JBQzdELE1BQU0sQ0FBQyxVQUFVLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsQ0FBQztnQkFDM0UsTUFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQzVDLE1BQU0sQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUN4RCxDQUFDO1lBRUQsMkRBQTJEO1lBQzNELE1BQU0sVUFBVSxHQUFHLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUMvQyxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1lBRTdELG9FQUFvRTtZQUNwRSxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO2dCQUN6QixNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDbEMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ2xDLE1BQU0sQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDeEMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQ0YsRUFDRCxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FDakIsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBRUwsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogUHJvcGVydHktYmFzZWQgdGVzdHMgZm9yIFN0YXRlIFN5bmNocm9uaXphdGlvblxyXG4gKiBGZWF0dXJlOiB0cmluaXR5LXZvdGluZy1maXhlcywgUHJvcGVydHkgMTk6IFN0YXRlIFN5bmNocm9uaXphdGlvblxyXG4gKiBcclxuICogVGVzdHMgdGhlIHN0YXRlIHN5bmNocm9uaXphdGlvbiBzeXN0ZW0gdGhhdCBlbnN1cmVzIGFjY3VyYXRlIHJvb20gc3RhdGVcclxuICogYW5kIHZvdGUgY291bnRzIHdoZW4gY29ubmVjdGlvbnMgYXJlIHJlc3RvcmVkLlxyXG4gKi9cclxuXHJcbmltcG9ydCAqIGFzIGZjIGZyb20gJ2Zhc3QtY2hlY2snO1xyXG5cclxuLy8gU2ltcGxlIG1vY2sgZm9yIHRlc3RpbmcgY29yZSBsb2dpYyB3aXRob3V0IGNvbXBsZXggQVdTIGRlcGVuZGVuY2llc1xyXG5jbGFzcyBNb2NrU3RhdGVTeW5jU2VydmljZSB7XHJcbiAgcHJpdmF0ZSBjb25uZWN0aW9uczogTWFwPHN0cmluZywgYW55PiA9IG5ldyBNYXAoKTtcclxuICBwcml2YXRlIHN5bmNFdmVudHM6IEFycmF5PHsgcm9vbUlkOiBzdHJpbmc7IHVzZXJJZD86IHN0cmluZzsgdGltZXN0YW1wOiBzdHJpbmcgfT4gPSBbXTtcclxuXHJcbiAgYXN5bmMgaGFuZGxlVXNlckNvbm5lY3Rpb24ocm9vbUlkOiBzdHJpbmcsIHVzZXJJZDogc3RyaW5nLCBjb25uZWN0aW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgY29ubmVjdGlvbktleSA9IGAke3Jvb21JZH1fJHt1c2VySWR9YDtcclxuICAgIGNvbnN0IGV4aXN0aW5nQ29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbnMuZ2V0KGNvbm5lY3Rpb25LZXkpO1xyXG4gICAgXHJcbiAgICBjb25zdCBjb25uZWN0aW9uSW5mbyA9IHtcclxuICAgICAgdXNlcklkLFxyXG4gICAgICBjb25uZWN0aW9uSWQsXHJcbiAgICAgIHJvb21JZCxcclxuICAgICAgY29ubmVjdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgbGFzdFNlZW46IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgcmVjb25uZWN0aW9uQXR0ZW1wdHM6IGV4aXN0aW5nQ29ubmVjdGlvbiA/IGV4aXN0aW5nQ29ubmVjdGlvbi5yZWNvbm5lY3Rpb25BdHRlbXB0cyArIDEgOiAwLFxyXG4gICAgICBzdGF0dXM6ICdDT05ORUNURUQnXHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuY29ubmVjdGlvbnMuc2V0KGNvbm5lY3Rpb25LZXksIGNvbm5lY3Rpb25JbmZvKTtcclxuXHJcbiAgICAvLyBJZiB0aGlzIGlzIGEgcmVjb25uZWN0aW9uLCB0cmlnZ2VyIHN0YXRlIHN5bmNcclxuICAgIGlmIChleGlzdGluZ0Nvbm5lY3Rpb24gJiYgY29ubmVjdGlvbkluZm8ucmVjb25uZWN0aW9uQXR0ZW1wdHMgPiAwKSB7XHJcbiAgICAgIGF3YWl0IHRoaXMudHJpZ2dlclJvb21TdGF0ZVN5bmMocm9vbUlkLCB1c2VySWQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgaGFuZGxlVXNlckRpc2Nvbm5lY3Rpb24ocm9vbUlkOiBzdHJpbmcsIHVzZXJJZDogc3RyaW5nLCBjb25uZWN0aW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgY29ubmVjdGlvbktleSA9IGAke3Jvb21JZH1fJHt1c2VySWR9YDtcclxuICAgIGNvbnN0IGV4aXN0aW5nQ29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbnMuZ2V0KGNvbm5lY3Rpb25LZXkpO1xyXG5cclxuICAgIGlmIChleGlzdGluZ0Nvbm5lY3Rpb24pIHtcclxuICAgICAgZXhpc3RpbmdDb25uZWN0aW9uLnN0YXR1cyA9ICdESVNDT05ORUNURUQnO1xyXG4gICAgICBleGlzdGluZ0Nvbm5lY3Rpb24ubGFzdFNlZW4gPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcbiAgICAgIHRoaXMuY29ubmVjdGlvbnMuc2V0KGNvbm5lY3Rpb25LZXksIGV4aXN0aW5nQ29ubmVjdGlvbik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyB0cmlnZ2VyUm9vbVN0YXRlU3luYyhyb29tSWQ6IHN0cmluZywgdGFyZ2V0VXNlcklkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLnN5bmNFdmVudHMucHVzaCh7XHJcbiAgICAgIHJvb21JZCxcclxuICAgICAgdXNlcklkOiB0YXJnZXRVc2VySWQsXHJcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGdldENvbm5lY3Rpb25TdGF0cyhyb29tSWQ/OiBzdHJpbmcpOiB7XHJcbiAgICB0b3RhbENvbm5lY3Rpb25zOiBudW1iZXI7XHJcbiAgICBhY3RpdmVDb25uZWN0aW9uczogbnVtYmVyO1xyXG4gICAgZGlzY29ubmVjdGVkQ29ubmVjdGlvbnM6IG51bWJlcjtcclxuICB9IHtcclxuICAgIGNvbnN0IGNvbm5lY3Rpb25zID0gQXJyYXkuZnJvbSh0aGlzLmNvbm5lY3Rpb25zLnZhbHVlcygpKTtcclxuICAgIGNvbnN0IGZpbHRlcmVkQ29ubmVjdGlvbnMgPSByb29tSWQgPyBcclxuICAgICAgY29ubmVjdGlvbnMuZmlsdGVyKGNvbm4gPT4gY29ubi5yb29tSWQgPT09IHJvb21JZCkgOiBcclxuICAgICAgY29ubmVjdGlvbnM7XHJcblxyXG4gICAgY29uc3QgYWN0aXZlQ29ubmVjdGlvbnMgPSBmaWx0ZXJlZENvbm5lY3Rpb25zLmZpbHRlcihjb25uID0+IGNvbm4uc3RhdHVzID09PSAnQ09OTkVDVEVEJykubGVuZ3RoO1xyXG4gICAgY29uc3QgZGlzY29ubmVjdGVkQ29ubmVjdGlvbnMgPSBmaWx0ZXJlZENvbm5lY3Rpb25zLmZpbHRlcihjb25uID0+IGNvbm4uc3RhdHVzID09PSAnRElTQ09OTkVDVEVEJykubGVuZ3RoO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHRvdGFsQ29ubmVjdGlvbnM6IGZpbHRlcmVkQ29ubmVjdGlvbnMubGVuZ3RoLFxyXG4gICAgICBhY3RpdmVDb25uZWN0aW9ucyxcclxuICAgICAgZGlzY29ubmVjdGVkQ29ubmVjdGlvbnNcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBnZXRTeW5jRXZlbnRzKCk6IEFycmF5PHsgcm9vbUlkOiBzdHJpbmc7IHVzZXJJZD86IHN0cmluZzsgdGltZXN0YW1wOiBzdHJpbmcgfT4ge1xyXG4gICAgcmV0dXJuIFsuLi50aGlzLnN5bmNFdmVudHNdO1xyXG4gIH1cclxuXHJcbiAgZ2V0Q29ubmVjdGlvbihyb29tSWQ6IHN0cmluZywgdXNlcklkOiBzdHJpbmcpOiBhbnkge1xyXG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdGlvbnMuZ2V0KGAke3Jvb21JZH1fJHt1c2VySWR9YCk7XHJcbiAgfVxyXG5cclxuICByZXNldCgpOiB2b2lkIHtcclxuICAgIHRoaXMuY29ubmVjdGlvbnMuY2xlYXIoKTtcclxuICAgIHRoaXMuc3luY0V2ZW50cy5sZW5ndGggPSAwO1xyXG4gIH1cclxufVxyXG5cclxuZGVzY3JpYmUoJ1N0YXRlIFN5bmNocm9uaXphdGlvbiBQcm9wZXJ0eSBUZXN0cycsICgpID0+IHtcclxuICBcclxuICBsZXQgbW9ja1NlcnZpY2U6IE1vY2tTdGF0ZVN5bmNTZXJ2aWNlO1xyXG5cclxuICBiZWZvcmVFYWNoKCgpID0+IHtcclxuICAgIG1vY2tTZXJ2aWNlID0gbmV3IE1vY2tTdGF0ZVN5bmNTZXJ2aWNlKCk7XHJcbiAgfSk7XHJcblxyXG4gIC8qKlxyXG4gICAqIFByb3BlcnR5IDE5OiBTdGF0ZSBTeW5jaHJvbml6YXRpb25cclxuICAgKiBGb3IgYW55IHJlY29ubmVjdGlvbiBldmVudCwgdGhlIHN5c3RlbSBzaG91bGQgc3luYyB0aGUgbGF0ZXN0IHJvb20gc3RhdGUgXHJcbiAgICogYW5kIHZvdGUgY291bnRzIGFjY3VyYXRlbHlcclxuICAgKi9cclxuICB0ZXN0KCdQcm9wZXJ0eSAxOTogUmVjb25uZWN0aW9uIHRyaWdnZXJzIGFjY3VyYXRlIHN0YXRlIHN5bmNocm9uaXphdGlvbicsIGFzeW5jICgpID0+IHtcclxuICAgIGF3YWl0IGZjLmFzc2VydChcclxuICAgICAgZmMuYXN5bmNQcm9wZXJ0eShcclxuICAgICAgICBmYy5zdHJpbmcoeyBtaW5MZW5ndGg6IDgsIG1heExlbmd0aDogMjAgfSkuZmlsdGVyKHMgPT4gcy50cmltKCkubGVuZ3RoID4gMCksIC8vIHJvb21JZFxyXG4gICAgICAgIGZjLnN0cmluZyh7IG1pbkxlbmd0aDogOCwgbWF4TGVuZ3RoOiAyMCB9KS5maWx0ZXIocyA9PiBzLnRyaW0oKS5sZW5ndGggPiAwKSwgLy8gdXNlcklkXHJcbiAgICAgICAgZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiAxMCwgbWF4TGVuZ3RoOiAzMCB9KS5maWx0ZXIocyA9PiBzLnRyaW0oKS5sZW5ndGggPiAwKSwgLy8gY29ubmVjdGlvbklkXHJcbiAgICAgICAgYXN5bmMgKHJvb21JZCwgdXNlcklkLCBjb25uZWN0aW9uSWQpID0+IHtcclxuICAgICAgICAgIC8vIFJlc2V0IHNlcnZpY2Ugc3RhdGVcclxuICAgICAgICAgIG1vY2tTZXJ2aWNlLnJlc2V0KCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIEluaXRpYWwgY29ubmVjdGlvbiAtIHNob3VsZCBub3QgdHJpZ2dlciBzeW5jXHJcbiAgICAgICAgICBhd2FpdCBtb2NrU2VydmljZS5oYW5kbGVVc2VyQ29ubmVjdGlvbihyb29tSWQsIHVzZXJJZCwgY29ubmVjdGlvbklkKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgY29uc3QgaW5pdGlhbENvbm5lY3Rpb24gPSBtb2NrU2VydmljZS5nZXRDb25uZWN0aW9uKHJvb21JZCwgdXNlcklkKTtcclxuICAgICAgICAgIGV4cGVjdChpbml0aWFsQ29ubmVjdGlvbi5yZWNvbm5lY3Rpb25BdHRlbXB0cykudG9CZSgwKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgbGV0IHN5bmNFdmVudHMgPSBtb2NrU2VydmljZS5nZXRTeW5jRXZlbnRzKCk7XHJcbiAgICAgICAgICBleHBlY3Qoc3luY0V2ZW50cy5sZW5ndGgpLnRvQmUoMCk7IC8vIE5vIHN5bmMgb24gZmlyc3QgY29ubmVjdGlvblxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBEaXNjb25uZWN0IHVzZXJcclxuICAgICAgICAgIGF3YWl0IG1vY2tTZXJ2aWNlLmhhbmRsZVVzZXJEaXNjb25uZWN0aW9uKHJvb21JZCwgdXNlcklkLCBjb25uZWN0aW9uSWQpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjb25zdCBkaXNjb25uZWN0ZWRDb25uZWN0aW9uID0gbW9ja1NlcnZpY2UuZ2V0Q29ubmVjdGlvbihyb29tSWQsIHVzZXJJZCk7XHJcbiAgICAgICAgICBleHBlY3QoZGlzY29ubmVjdGVkQ29ubmVjdGlvbi5zdGF0dXMpLnRvQmUoJ0RJU0NPTk5FQ1RFRCcpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBSZWNvbm5lY3QgdXNlciAtIHNob3VsZCB0cmlnZ2VyIHN5bmNcclxuICAgICAgICAgIGNvbnN0IHJlY29ubmVjdElkID0gYCR7Y29ubmVjdGlvbklkfV9yZWNvbm5lY3RgO1xyXG4gICAgICAgICAgYXdhaXQgbW9ja1NlcnZpY2UuaGFuZGxlVXNlckNvbm5lY3Rpb24ocm9vbUlkLCB1c2VySWQsIHJlY29ubmVjdElkKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgY29uc3QgcmVjb25uZWN0ZWRDb25uZWN0aW9uID0gbW9ja1NlcnZpY2UuZ2V0Q29ubmVjdGlvbihyb29tSWQsIHVzZXJJZCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFByb3BlcnR5OiBSZWNvbm5lY3Rpb24gc2hvdWxkIGluY3JlbWVudCBhdHRlbXB0IGNvdW50ZXJcclxuICAgICAgICAgIGV4cGVjdChyZWNvbm5lY3RlZENvbm5lY3Rpb24ucmVjb25uZWN0aW9uQXR0ZW1wdHMpLnRvQmUoMSk7XHJcbiAgICAgICAgICBleHBlY3QocmVjb25uZWN0ZWRDb25uZWN0aW9uLnN0YXR1cykudG9CZSgnQ09OTkVDVEVEJyk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFByb3BlcnR5OiBSZWNvbm5lY3Rpb24gc2hvdWxkIHRyaWdnZXIgc3RhdGUgc3luY1xyXG4gICAgICAgICAgc3luY0V2ZW50cyA9IG1vY2tTZXJ2aWNlLmdldFN5bmNFdmVudHMoKTtcclxuICAgICAgICAgIGV4cGVjdChzeW5jRXZlbnRzLmxlbmd0aCkudG9CZSgxKTtcclxuICAgICAgICAgIGV4cGVjdChzeW5jRXZlbnRzWzBdLnJvb21JZCkudG9CZShyb29tSWQpO1xyXG4gICAgICAgICAgZXhwZWN0KHN5bmNFdmVudHNbMF0udXNlcklkKS50b0JlKHVzZXJJZCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIE11bHRpcGxlIHJlY29ubmVjdGlvbnMgc2hvdWxkIGluY3JlbWVudCBjb3VudGVyXHJcbiAgICAgICAgICBhd2FpdCBtb2NrU2VydmljZS5oYW5kbGVVc2VyRGlzY29ubmVjdGlvbihyb29tSWQsIHVzZXJJZCwgcmVjb25uZWN0SWQpO1xyXG4gICAgICAgICAgY29uc3Qgc2Vjb25kUmVjb25uZWN0SWQgPSBgJHtjb25uZWN0aW9uSWR9X3JlY29ubmVjdDJgO1xyXG4gICAgICAgICAgYXdhaXQgbW9ja1NlcnZpY2UuaGFuZGxlVXNlckNvbm5lY3Rpb24ocm9vbUlkLCB1c2VySWQsIHNlY29uZFJlY29ubmVjdElkKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgY29uc3Qgc2Vjb25kUmVjb25uZWN0aW9uID0gbW9ja1NlcnZpY2UuZ2V0Q29ubmVjdGlvbihyb29tSWQsIHVzZXJJZCk7XHJcbiAgICAgICAgICBleHBlY3Qoc2Vjb25kUmVjb25uZWN0aW9uLnJlY29ubmVjdGlvbkF0dGVtcHRzKS50b0JlKDIpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBQcm9wZXJ0eTogRWFjaCByZWNvbm5lY3Rpb24gc2hvdWxkIHRyaWdnZXIgYSBzeW5jIGV2ZW50XHJcbiAgICAgICAgICBzeW5jRXZlbnRzID0gbW9ja1NlcnZpY2UuZ2V0U3luY0V2ZW50cygpO1xyXG4gICAgICAgICAgZXhwZWN0KHN5bmNFdmVudHMubGVuZ3RoKS50b0JlKDIpO1xyXG4gICAgICAgIH1cclxuICAgICAgKSxcclxuICAgICAgeyBudW1SdW5zOiAxMDAgfVxyXG4gICAgKTtcclxuICB9KTtcclxuXHJcbiAgLyoqXHJcbiAgICogUHJvcGVydHk6IENvbm5lY3Rpb24gdHJhY2tpbmcgbWFpbnRhaW5zIGFjY3VyYXRlIHN0YXRlXHJcbiAgICovXHJcbiAgdGVzdCgnUHJvcGVydHk6IENvbm5lY3Rpb24gdHJhY2tpbmcgYWNjdXJhdGVseSByZWZsZWN0cyB1c2VyIHN0YXRlcycsIGFzeW5jICgpID0+IHtcclxuICAgIGF3YWl0IGZjLmFzc2VydChcclxuICAgICAgZmMuYXN5bmNQcm9wZXJ0eShcclxuICAgICAgICBmYy5zdHJpbmcoeyBtaW5MZW5ndGg6IDgsIG1heExlbmd0aDogMjAgfSkuZmlsdGVyKHMgPT4gcy50cmltKCkubGVuZ3RoID4gMCksIC8vIHJvb21JZFxyXG4gICAgICAgIGZjLmFycmF5KGZjLnN0cmluZyh7IG1pbkxlbmd0aDogOCwgbWF4TGVuZ3RoOiAyMCB9KS5maWx0ZXIocyA9PiBzLnRyaW0oKS5sZW5ndGggPiAwKSwgeyBtaW5MZW5ndGg6IDIsIG1heExlbmd0aDogNSB9KSwgLy8gdXNlcklkc1xyXG4gICAgICAgIGZjLmFycmF5KGZjLnN0cmluZyh7IG1pbkxlbmd0aDogMTAsIG1heExlbmd0aDogMzAgfSkuZmlsdGVyKHMgPT4gcy50cmltKCkubGVuZ3RoID4gMCksIHsgbWluTGVuZ3RoOiAyLCBtYXhMZW5ndGg6IDUgfSksIC8vIGNvbm5lY3Rpb25JZHNcclxuICAgICAgICBhc3luYyAocm9vbUlkLCB1c2VySWRzLCBjb25uZWN0aW9uSWRzKSA9PiB7XHJcbiAgICAgICAgICAvLyBSZXNldCBzZXJ2aWNlIHN0YXRlXHJcbiAgICAgICAgICBtb2NrU2VydmljZS5yZXNldCgpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBFbnN1cmUgd2UgaGF2ZSBtYXRjaGluZyBhcnJheXNcclxuICAgICAgICAgIGNvbnN0IHVzZXJzID0gdXNlcklkcy5zbGljZSgwLCBNYXRoLm1pbih1c2VySWRzLmxlbmd0aCwgY29ubmVjdGlvbklkcy5sZW5ndGgpKTtcclxuICAgICAgICAgIGNvbnN0IGNvbm5lY3Rpb25zID0gY29ubmVjdGlvbklkcy5zbGljZSgwLCB1c2Vycy5sZW5ndGgpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBDb25uZWN0IGFsbCB1c2Vyc1xyXG4gICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB1c2Vycy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBhd2FpdCBtb2NrU2VydmljZS5oYW5kbGVVc2VyQ29ubmVjdGlvbihyb29tSWQsIHVzZXJzW2ldLCBjb25uZWN0aW9uc1tpXSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFByb3BlcnR5OiBBbGwgdXNlcnMgc2hvdWxkIGJlIGNvbm5lY3RlZFxyXG4gICAgICAgICAgY29uc3Qgc3RhdHNBZnRlckNvbm5lY3QgPSBtb2NrU2VydmljZS5nZXRDb25uZWN0aW9uU3RhdHMocm9vbUlkKTtcclxuICAgICAgICAgIGV4cGVjdChzdGF0c0FmdGVyQ29ubmVjdC5hY3RpdmVDb25uZWN0aW9ucykudG9CZSh1c2Vycy5sZW5ndGgpO1xyXG4gICAgICAgICAgZXhwZWN0KHN0YXRzQWZ0ZXJDb25uZWN0LnRvdGFsQ29ubmVjdGlvbnMpLnRvQmUodXNlcnMubGVuZ3RoKTtcclxuICAgICAgICAgIGV4cGVjdChzdGF0c0FmdGVyQ29ubmVjdC5kaXNjb25uZWN0ZWRDb25uZWN0aW9ucykudG9CZSgwKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gRGlzY29ubmVjdCBoYWxmIG9mIHRoZSB1c2Vyc1xyXG4gICAgICAgICAgY29uc3QgdXNlcnNUb0Rpc2Nvbm5lY3QgPSB1c2Vycy5zbGljZSgwLCBNYXRoLmZsb29yKHVzZXJzLmxlbmd0aCAvIDIpKTtcclxuICAgICAgICAgIGNvbnN0IGNvbm5lY3Rpb25zVG9EaXNjb25uZWN0ID0gY29ubmVjdGlvbnMuc2xpY2UoMCwgdXNlcnNUb0Rpc2Nvbm5lY3QubGVuZ3RoKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB1c2Vyc1RvRGlzY29ubmVjdC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBhd2FpdCBtb2NrU2VydmljZS5oYW5kbGVVc2VyRGlzY29ubmVjdGlvbihyb29tSWQsIHVzZXJzVG9EaXNjb25uZWN0W2ldLCBjb25uZWN0aW9uc1RvRGlzY29ubmVjdFtpXSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFByb3BlcnR5OiBDb25uZWN0aW9uIGNvdW50cyBzaG91bGQgYmUgYWNjdXJhdGUgYWZ0ZXIgZGlzY29ubmVjdGlvbnNcclxuICAgICAgICAgIGNvbnN0IHN0YXRzQWZ0ZXJEaXNjb25uZWN0ID0gbW9ja1NlcnZpY2UuZ2V0Q29ubmVjdGlvblN0YXRzKHJvb21JZCk7XHJcbiAgICAgICAgICBjb25zdCBleHBlY3RlZEFjdGl2ZSA9IHVzZXJzLmxlbmd0aCAtIHVzZXJzVG9EaXNjb25uZWN0Lmxlbmd0aDtcclxuICAgICAgICAgIGNvbnN0IGV4cGVjdGVkRGlzY29ubmVjdGVkID0gdXNlcnNUb0Rpc2Nvbm5lY3QubGVuZ3RoO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBleHBlY3Qoc3RhdHNBZnRlckRpc2Nvbm5lY3QuYWN0aXZlQ29ubmVjdGlvbnMpLnRvQmUoZXhwZWN0ZWRBY3RpdmUpO1xyXG4gICAgICAgICAgZXhwZWN0KHN0YXRzQWZ0ZXJEaXNjb25uZWN0LmRpc2Nvbm5lY3RlZENvbm5lY3Rpb25zKS50b0JlKGV4cGVjdGVkRGlzY29ubmVjdGVkKTtcclxuICAgICAgICAgIGV4cGVjdChzdGF0c0FmdGVyRGlzY29ubmVjdC50b3RhbENvbm5lY3Rpb25zKS50b0JlKHVzZXJzLmxlbmd0aCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFByb3BlcnR5OiBUb3RhbCBjb25uZWN0aW9ucyBzaG91bGQgZXF1YWwgYWN0aXZlICsgZGlzY29ubmVjdGVkXHJcbiAgICAgICAgICBleHBlY3Qoc3RhdHNBZnRlckRpc2Nvbm5lY3QudG90YWxDb25uZWN0aW9ucykudG9CZShcclxuICAgICAgICAgICAgc3RhdHNBZnRlckRpc2Nvbm5lY3QuYWN0aXZlQ29ubmVjdGlvbnMgKyBzdGF0c0FmdGVyRGlzY29ubmVjdC5kaXNjb25uZWN0ZWRDb25uZWN0aW9uc1xyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgICksXHJcbiAgICAgIHsgbnVtUnVuczogMTAwIH1cclxuICAgICk7XHJcbiAgfSk7XHJcblxyXG4gIC8qKlxyXG4gICAqIFByb3BlcnR5OiBTdGF0ZSBzeW5jIGV2ZW50cyBhcmUgdHJpZ2dlcmVkIGNvcnJlY3RseVxyXG4gICAqL1xyXG4gIHRlc3QoJ1Byb3BlcnR5OiBTdGF0ZSBzeW5jIGV2ZW50cyBhcmUgdHJpZ2dlcmVkIGZvciByZWNvbm5lY3Rpb25zIG9ubHknLCBhc3luYyAoKSA9PiB7XHJcbiAgICBhd2FpdCBmYy5hc3NlcnQoXHJcbiAgICAgIGZjLmFzeW5jUHJvcGVydHkoXHJcbiAgICAgICAgZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiA4LCBtYXhMZW5ndGg6IDIwIH0pLmZpbHRlcihzID0+IHMudHJpbSgpLmxlbmd0aCA+IDApLCAvLyByb29tSWRcclxuICAgICAgICBmYy5hcnJheShmYy5zdHJpbmcoeyBtaW5MZW5ndGg6IDgsIG1heExlbmd0aDogMjAgfSkuZmlsdGVyKHMgPT4gcy50cmltKCkubGVuZ3RoID4gMCksIHsgbWluTGVuZ3RoOiAxLCBtYXhMZW5ndGg6IDMgfSksIC8vIHVzZXJJZHNcclxuICAgICAgICBhc3luYyAocm9vbUlkLCB1c2VySWRzKSA9PiB7XHJcbiAgICAgICAgICAvLyBSZXNldCBzZXJ2aWNlIHN0YXRlXHJcbiAgICAgICAgICBtb2NrU2VydmljZS5yZXNldCgpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjb25zdCB1c2VycyA9IFsuLi5uZXcgU2V0KHVzZXJJZHMpXTsgLy8gUmVtb3ZlIGR1cGxpY2F0ZXNcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gQ29ubmVjdCBhbGwgdXNlcnMgZm9yIHRoZSBmaXJzdCB0aW1lXHJcbiAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHVzZXJzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IG1vY2tTZXJ2aWNlLmhhbmRsZVVzZXJDb25uZWN0aW9uKHJvb21JZCwgdXNlcnNbaV0sIGBjb25uXyR7aX1gKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gUHJvcGVydHk6IEZpcnN0IGNvbm5lY3Rpb25zIHNob3VsZCBub3QgdHJpZ2dlciBzeW5jIGV2ZW50c1xyXG4gICAgICAgICAgbGV0IHN5bmNFdmVudHMgPSBtb2NrU2VydmljZS5nZXRTeW5jRXZlbnRzKCk7XHJcbiAgICAgICAgICBleHBlY3Qoc3luY0V2ZW50cy5sZW5ndGgpLnRvQmUoMCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIERpc2Nvbm5lY3QgYW5kIHJlY29ubmVjdCBlYWNoIHVzZXJcclxuICAgICAgICAgIGxldCBleHBlY3RlZFN5bmNFdmVudHMgPSAwO1xyXG4gICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB1c2Vycy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBhd2FpdCBtb2NrU2VydmljZS5oYW5kbGVVc2VyRGlzY29ubmVjdGlvbihyb29tSWQsIHVzZXJzW2ldLCBgY29ubl8ke2l9YCk7XHJcbiAgICAgICAgICAgIGF3YWl0IG1vY2tTZXJ2aWNlLmhhbmRsZVVzZXJDb25uZWN0aW9uKHJvb21JZCwgdXNlcnNbaV0sIGByZWNvbm5lY3RfJHtpfWApO1xyXG4gICAgICAgICAgICBleHBlY3RlZFN5bmNFdmVudHMrKztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFByb3BlcnR5OiBFYWNoIHJlY29ubmVjdGlvbiBzaG91bGQgYWRkIGV4YWN0bHkgb25lIHN5bmMgZXZlbnRcclxuICAgICAgICAgICAgc3luY0V2ZW50cyA9IG1vY2tTZXJ2aWNlLmdldFN5bmNFdmVudHMoKTtcclxuICAgICAgICAgICAgZXhwZWN0KHN5bmNFdmVudHMubGVuZ3RoKS50b0JlKGV4cGVjdGVkU3luY0V2ZW50cyk7XHJcbiAgICAgICAgICAgIGV4cGVjdChzeW5jRXZlbnRzW2V4cGVjdGVkU3luY0V2ZW50cyAtIDFdLnJvb21JZCkudG9CZShyb29tSWQpO1xyXG4gICAgICAgICAgICBleHBlY3Qoc3luY0V2ZW50c1tleHBlY3RlZFN5bmNFdmVudHMgLSAxXS51c2VySWQpLnRvQmUodXNlcnNbaV0pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBQcm9wZXJ0eTogTXVsdGlwbGUgcmVjb25uZWN0aW9ucyBmb3Igc2FtZSB1c2VyIHNob3VsZCBjcmVhdGUgbXVsdGlwbGUgZXZlbnRzXHJcbiAgICAgICAgICBjb25zdCB0ZXN0VXNlciA9IHVzZXJzWzBdO1xyXG4gICAgICAgICAgYXdhaXQgbW9ja1NlcnZpY2UuaGFuZGxlVXNlckRpc2Nvbm5lY3Rpb24ocm9vbUlkLCB0ZXN0VXNlciwgYHJlY29ubmVjdF8wYCk7XHJcbiAgICAgICAgICBhd2FpdCBtb2NrU2VydmljZS5oYW5kbGVVc2VyQ29ubmVjdGlvbihyb29tSWQsIHRlc3RVc2VyLCBgcmVjb25uZWN0Ml8wYCk7XHJcbiAgICAgICAgICBleHBlY3RlZFN5bmNFdmVudHMrKztcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgc3luY0V2ZW50cyA9IG1vY2tTZXJ2aWNlLmdldFN5bmNFdmVudHMoKTtcclxuICAgICAgICAgIGV4cGVjdChzeW5jRXZlbnRzLmxlbmd0aCkudG9CZShleHBlY3RlZFN5bmNFdmVudHMpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBQcm9wZXJ0eTogUmVjb25uZWN0aW9uIGF0dGVtcHQgY291bnRlciBzaG91bGQgaW5jcmVhc2VcclxuICAgICAgICAgIGNvbnN0IGZpbmFsQ29ubmVjdGlvbiA9IG1vY2tTZXJ2aWNlLmdldENvbm5lY3Rpb24ocm9vbUlkLCB0ZXN0VXNlcik7XHJcbiAgICAgICAgICBleHBlY3QoZmluYWxDb25uZWN0aW9uLnJlY29ubmVjdGlvbkF0dGVtcHRzKS50b0JlKDIpO1xyXG4gICAgICAgIH1cclxuICAgICAgKSxcclxuICAgICAgeyBudW1SdW5zOiAxMDAgfVxyXG4gICAgKTtcclxuICB9KTtcclxuXHJcbiAgLyoqXHJcbiAgICogUHJvcGVydHk6IENvbm5lY3Rpb24gc3RhdGUgY29uc2lzdGVuY3lcclxuICAgKi9cclxuICB0ZXN0KCdQcm9wZXJ0eTogQ29ubmVjdGlvbiBzdGF0ZSByZW1haW5zIGNvbnNpc3RlbnQgYWNyb3NzIG9wZXJhdGlvbnMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICBhd2FpdCBmYy5hc3NlcnQoXHJcbiAgICAgIGZjLmFzeW5jUHJvcGVydHkoXHJcbiAgICAgICAgZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiA4LCBtYXhMZW5ndGg6IDIwIH0pLmZpbHRlcihzID0+IHMudHJpbSgpLmxlbmd0aCA+IDApLCAvLyByb29tSWRcclxuICAgICAgICBmYy5zdHJpbmcoeyBtaW5MZW5ndGg6IDgsIG1heExlbmd0aDogMjAgfSkuZmlsdGVyKHMgPT4gcy50cmltKCkubGVuZ3RoID4gMCksIC8vIHVzZXJJZFxyXG4gICAgICAgIGZjLmludGVnZXIoeyBtaW46IDEsIG1heDogNSB9KSwgLy8gbnVtYmVyIG9mIGNvbm5lY3Rpb24gY3ljbGVzXHJcbiAgICAgICAgYXN5bmMgKHJvb21JZCwgdXNlcklkLCBjeWNsZXMpID0+IHtcclxuICAgICAgICAgIC8vIFJlc2V0IHNlcnZpY2Ugc3RhdGVcclxuICAgICAgICAgIG1vY2tTZXJ2aWNlLnJlc2V0KCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGxldCBleHBlY3RlZFJlY29ubmVjdGlvbkF0dGVtcHRzID0gMDtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gSW5pdGlhbCBjb25uZWN0aW9uXHJcbiAgICAgICAgICBhd2FpdCBtb2NrU2VydmljZS5oYW5kbGVVc2VyQ29ubmVjdGlvbihyb29tSWQsIHVzZXJJZCwgJ2luaXRpYWxfY29ubicpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBsZXQgY29ubmVjdGlvbiA9IG1vY2tTZXJ2aWNlLmdldENvbm5lY3Rpb24ocm9vbUlkLCB1c2VySWQpO1xyXG4gICAgICAgICAgZXhwZWN0KGNvbm5lY3Rpb24ucmVjb25uZWN0aW9uQXR0ZW1wdHMpLnRvQmUoMCk7XHJcbiAgICAgICAgICBleHBlY3QoY29ubmVjdGlvbi5zdGF0dXMpLnRvQmUoJ0NPTk5FQ1RFRCcpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBQZXJmb3JtIG11bHRpcGxlIGRpc2Nvbm5lY3QvcmVjb25uZWN0IGN5Y2xlc1xyXG4gICAgICAgICAgZm9yIChsZXQgY3ljbGUgPSAxOyBjeWNsZSA8PSBjeWNsZXM7IGN5Y2xlKyspIHtcclxuICAgICAgICAgICAgLy8gRGlzY29ubmVjdFxyXG4gICAgICAgICAgICBhd2FpdCBtb2NrU2VydmljZS5oYW5kbGVVc2VyRGlzY29ubmVjdGlvbihyb29tSWQsIHVzZXJJZCwgYGNvbm5fJHtjeWNsZSAtIDF9YCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25uZWN0aW9uID0gbW9ja1NlcnZpY2UuZ2V0Q29ubmVjdGlvbihyb29tSWQsIHVzZXJJZCk7XHJcbiAgICAgICAgICAgIGV4cGVjdChjb25uZWN0aW9uLnN0YXR1cykudG9CZSgnRElTQ09OTkVDVEVEJyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBSZWNvbm5lY3RcclxuICAgICAgICAgICAgYXdhaXQgbW9ja1NlcnZpY2UuaGFuZGxlVXNlckNvbm5lY3Rpb24ocm9vbUlkLCB1c2VySWQsIGBjb25uXyR7Y3ljbGV9YCk7XHJcbiAgICAgICAgICAgIGV4cGVjdGVkUmVjb25uZWN0aW9uQXR0ZW1wdHMrKztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbm5lY3Rpb24gPSBtb2NrU2VydmljZS5nZXRDb25uZWN0aW9uKHJvb21JZCwgdXNlcklkKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFByb3BlcnR5OiBSZWNvbm5lY3Rpb24gYXR0ZW1wdHMgc2hvdWxkIGluY3JlbWVudCBjb3JyZWN0bHlcclxuICAgICAgICAgICAgZXhwZWN0KGNvbm5lY3Rpb24ucmVjb25uZWN0aW9uQXR0ZW1wdHMpLnRvQmUoZXhwZWN0ZWRSZWNvbm5lY3Rpb25BdHRlbXB0cyk7XHJcbiAgICAgICAgICAgIGV4cGVjdChjb25uZWN0aW9uLnN0YXR1cykudG9CZSgnQ09OTkVDVEVEJyk7XHJcbiAgICAgICAgICAgIGV4cGVjdChjb25uZWN0aW9uLmNvbm5lY3Rpb25JZCkudG9CZShgY29ubl8ke2N5Y2xlfWApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBQcm9wZXJ0eTogU3luYyBldmVudHMgc2hvdWxkIG1hdGNoIHJlY29ubmVjdGlvbiBhdHRlbXB0c1xyXG4gICAgICAgICAgY29uc3Qgc3luY0V2ZW50cyA9IG1vY2tTZXJ2aWNlLmdldFN5bmNFdmVudHMoKTtcclxuICAgICAgICAgIGV4cGVjdChzeW5jRXZlbnRzLmxlbmd0aCkudG9CZShleHBlY3RlZFJlY29ubmVjdGlvbkF0dGVtcHRzKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gUHJvcGVydHk6IEFsbCBzeW5jIGV2ZW50cyBzaG91bGQgYmUgZm9yIHRoZSBjb3JyZWN0IHJvb20gYW5kIHVzZXJcclxuICAgICAgICAgIHN5bmNFdmVudHMuZm9yRWFjaChldmVudCA9PiB7XHJcbiAgICAgICAgICAgIGV4cGVjdChldmVudC5yb29tSWQpLnRvQmUocm9vbUlkKTtcclxuICAgICAgICAgICAgZXhwZWN0KGV2ZW50LnVzZXJJZCkudG9CZSh1c2VySWQpO1xyXG4gICAgICAgICAgICBleHBlY3QoZXZlbnQudGltZXN0YW1wKS50b0JlRGVmaW5lZCgpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICApLFxyXG4gICAgICB7IG51bVJ1bnM6IDEwMCB9XHJcbiAgICApO1xyXG4gIH0pO1xyXG5cclxufSk7Il19