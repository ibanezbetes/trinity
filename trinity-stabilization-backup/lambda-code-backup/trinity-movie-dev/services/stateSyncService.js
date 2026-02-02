"use strict";
/**
 * State Synchronization Service
 * Handles full room state refresh when connections are restored
 * Ensures vote counts and progress are accurately synced
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.stateSyncService = exports.StateSyncService = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const appsync_publisher_1 = require("../utils/appsync-publisher");
const metrics_1 = require("../utils/metrics");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
/**
 * State Synchronization Service
 * Manages connection state and room synchronization for real-time updates
 */
class StateSyncService {
    constructor() {
        this.CONNECTION_TIMEOUT_MS = 30000; // 30 seconds
        this.MAX_RECONNECTION_ATTEMPTS = 5;
        this.SYNC_DEBOUNCE_MS = 1000; // 1 second debounce for sync events
        // In-memory connection tracking (in production, use Redis or DynamoDB)
        this.connections = new Map();
        this.syncTimers = new Map();
    }
    /**
     * Handle user connection to a room
     */
    async handleUserConnection(roomId, userId, connectionId, userAgent) {
        const timer = new metrics_1.PerformanceTimer('HandleUserConnection');
        console.log(`🔌 User ${userId} connecting to room ${roomId} with connection ${connectionId.substring(0, 8)}...`);
        try {
            // Get existing connection info
            const existingConnection = this.connections.get(`${roomId}_${userId}`);
            const reconnectionAttempts = existingConnection?.reconnectionAttempts || 0;
            // Create new connection info
            const connectionInfo = {
                userId,
                connectionId,
                roomId,
                connectedAt: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                userAgent,
                reconnectionAttempts: existingConnection ? reconnectionAttempts + 1 : 0,
                status: 'CONNECTED'
            };
            // Store connection info
            this.connections.set(`${roomId}_${userId}`, connectionInfo);
            // Update connection status in DynamoDB
            await this.updateConnectionStatusInDB(roomId, userId, 'CONNECTED', connectionInfo);
            // Publish connection status event
            await (0, appsync_publisher_1.publishConnectionStatusEvent)(roomId, userId, 'CONNECTED', connectionId, {
                userAgent,
                reconnectionAttempts: connectionInfo.reconnectionAttempts
            });
            // If this is a reconnection, trigger full state sync
            if (existingConnection && connectionInfo.reconnectionAttempts > 0) {
                console.log(`🔄 User ${userId} reconnecting (attempt ${connectionInfo.reconnectionAttempts}), triggering state sync`);
                await this.triggerRoomStateSync(roomId, userId);
            }
            // Log business metric
            (0, metrics_1.logBusinessMetric)('ROOM_JOINED', roomId, userId, {
                connectionId: connectionId.substring(0, 8),
                reconnectionAttempts: connectionInfo.reconnectionAttempts,
                isReconnection: connectionInfo.reconnectionAttempts > 0
            });
            timer.finish(true, undefined, {
                reconnectionAttempts: connectionInfo.reconnectionAttempts,
                isReconnection: connectionInfo.reconnectionAttempts > 0
            });
        }
        catch (error) {
            (0, metrics_1.logError)('HandleUserConnection', error, { roomId, userId, connectionId });
            timer.finish(false, error.name);
            throw error;
        }
    }
    /**
     * Handle user disconnection from a room
     */
    async handleUserDisconnection(roomId, userId, connectionId) {
        const timer = new metrics_1.PerformanceTimer('HandleUserDisconnection');
        console.log(`🔌 User ${userId} disconnecting from room ${roomId}`);
        try {
            const connectionKey = `${roomId}_${userId}`;
            const existingConnection = this.connections.get(connectionKey);
            if (existingConnection) {
                // Update connection status
                existingConnection.status = 'DISCONNECTED';
                existingConnection.lastSeen = new Date().toISOString();
                this.connections.set(connectionKey, existingConnection);
                // Update connection status in DynamoDB
                await this.updateConnectionStatusInDB(roomId, userId, 'DISCONNECTED', existingConnection);
                // Publish disconnection event
                await (0, appsync_publisher_1.publishConnectionStatusEvent)(roomId, userId, 'DISCONNECTED', connectionId, {
                    userAgent: existingConnection.userAgent,
                    reconnectionAttempts: existingConnection.reconnectionAttempts
                });
                // Schedule connection cleanup after timeout
                setTimeout(() => {
                    this.cleanupStaleConnection(roomId, userId);
                }, this.CONNECTION_TIMEOUT_MS);
            }
            // Log business metric
            (0, metrics_1.logBusinessMetric)('USER_DISCONNECTED', roomId, userId, {
                connectionId: connectionId.substring(0, 8),
                connectionDuration: existingConnection ?
                    Date.now() - new Date(existingConnection.connectedAt).getTime() : 0
            });
            timer.finish(true);
        }
        catch (error) {
            (0, metrics_1.logError)('HandleUserDisconnection', error, { roomId, userId, connectionId });
            timer.finish(false, error.name);
            throw error;
        }
    }
    /**
     * Trigger full room state synchronization for a specific user or all users
     */
    async triggerRoomStateSync(roomId, targetUserId) {
        const timer = new metrics_1.PerformanceTimer('TriggerRoomStateSync');
        console.log(`🔄 Triggering room state sync for room ${roomId}${targetUserId ? ` (user: ${targetUserId})` : ' (all users)'}`);
        try {
            // Debounce sync events to avoid overwhelming the system
            const syncKey = targetUserId ? `${roomId}_${targetUserId}` : roomId;
            if (this.syncTimers.has(syncKey)) {
                clearTimeout(this.syncTimers.get(syncKey));
            }
            const syncTimer = setTimeout(async () => {
                try {
                    // Get comprehensive room state
                    const roomState = await this.getComprehensiveRoomState(roomId);
                    // Publish state sync event
                    await (0, appsync_publisher_1.publishRoomStateSyncEvent)(roomId, targetUserId);
                    // Update last sync timestamp
                    await this.updateLastSyncTimestamp(roomId);
                    // Log business metric
                    (0, metrics_1.logBusinessMetric)('ROOM_STATE_SYNCED', roomId, targetUserId || 'all_users', {
                        roomStatus: roomState.status,
                        totalMembers: roomState.totalMembers,
                        activeConnections: roomState.activeConnections,
                        votingProgress: roomState.votingProgress.percentage
                    });
                    console.log(`✅ Room state sync completed for room ${roomId}`);
                }
                catch (syncError) {
                    console.error('❌ Error in debounced sync:', syncError);
                }
                finally {
                    this.syncTimers.delete(syncKey);
                }
            }, this.SYNC_DEBOUNCE_MS);
            this.syncTimers.set(syncKey, syncTimer);
            timer.finish(true);
        }
        catch (error) {
            (0, metrics_1.logError)('TriggerRoomStateSync', error, { roomId, targetUserId });
            timer.finish(false, error.name);
            throw error;
        }
    }
    /**
     * Get comprehensive room state for synchronization
     */
    async getComprehensiveRoomState(roomId) {
        try {
            // Get room information
            const roomResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.ROOMS_TABLE,
                Key: { PK: roomId, SK: 'ROOM' },
            }));
            const room = roomResponse.Item;
            if (!room) {
                throw new Error(`Room ${roomId} not found`);
            }
            // Get all active members
            const membersResponse = await docClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: process.env.ROOM_MEMBERS_TABLE,
                KeyConditionExpression: 'roomId = :roomId',
                FilterExpression: 'isActive = :active',
                ExpressionAttributeValues: {
                    ':roomId': roomId,
                    ':active': true
                }
            }));
            const totalMembers = membersResponse.Count || 0;
            const allMembers = membersResponse.Items?.map(item => item.userId) || [];
            // Get current voting progress if room is active
            let votingProgress = {
                currentVotes: 0,
                totalRequired: totalMembers,
                percentage: 0,
                votingUsers: [],
                pendingUsers: allMembers
            };
            if (room.status === 'ACTIVE' && room.currentMovieId) {
                // Get current votes
                const votesResponse = await docClient.send(new lib_dynamodb_1.GetCommand({
                    TableName: process.env.VOTES_TABLE,
                    Key: { roomId, movieId: room.currentMovieId },
                }));
                const currentVotes = votesResponse.Item?.votes || 0;
                // Get users who have voted
                const votingUsers = await this.getVotingUsers(roomId, room.currentMovieId);
                const pendingUsers = allMembers.filter(userId => !votingUsers.includes(userId));
                votingProgress = {
                    currentVotes,
                    totalRequired: totalMembers,
                    percentage: totalMembers > 0 ? (currentVotes / totalMembers) * 100 : 0,
                    votingUsers,
                    pendingUsers
                };
            }
            // Get current movie info if available
            let currentMovieInfo;
            if (room.currentMovieId) {
                currentMovieInfo = await this.getMovieInfo(room.currentMovieId);
            }
            // Get match result if room is matched
            let matchResult;
            if (room.status === 'MATCHED' && room.resultMovieId) {
                const matchMovieInfo = await this.getMovieInfo(room.resultMovieId);
                matchResult = {
                    movieId: room.resultMovieId,
                    movieTitle: matchMovieInfo.title,
                    foundAt: room.updatedAt || new Date().toISOString()
                };
            }
            // Count active connections
            const activeConnections = Array.from(this.connections.values())
                .filter(conn => conn.roomId === roomId && conn.status === 'CONNECTED')
                .length;
            return {
                roomId,
                status: room.status,
                currentMovieId: room.currentMovieId,
                currentMovieInfo,
                totalMembers,
                activeConnections: Math.max(activeConnections, totalMembers), // Fallback to member count
                votingProgress,
                matchResult,
                lastSyncAt: new Date().toISOString()
            };
        }
        catch (error) {
            console.error('❌ Error getting comprehensive room state:', error);
            throw error;
        }
    }
    /**
     * Get users who have voted for a specific movie
     */
    async getVotingUsers(roomId, movieId) {
        try {
            const roomMovieId = `${roomId}_${movieId}`;
            const response = await docClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: process.env.USER_VOTES_TABLE,
                IndexName: 'RoomMovieIndex',
                KeyConditionExpression: 'roomMovieId = :roomMovieId',
                ExpressionAttributeValues: {
                    ':roomMovieId': roomMovieId
                },
                ProjectionExpression: 'userId'
            }));
            return response.Items?.map(item => item.userId) || [];
        }
        catch (error) {
            console.warn('⚠️ Error getting voting users:', error);
            return [];
        }
    }
    /**
     * Get movie information for state sync
     */
    async getMovieInfo(movieId) {
        try {
            // Try to get from movie cache first
            const cacheResponse = await docClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: process.env.MOVIE_CACHE_TABLE,
                IndexName: 'MovieIdIndex',
                KeyConditionExpression: 'movieId = :movieId',
                ExpressionAttributeValues: {
                    ':movieId': movieId
                },
                Limit: 1
            }));
            if (cacheResponse.Items && cacheResponse.Items.length > 0) {
                const cachedMovie = cacheResponse.Items[0];
                return {
                    title: cachedMovie.title || `Movie ${movieId}`,
                    genres: cachedMovie.genres || [],
                    year: cachedMovie.year,
                    posterPath: cachedMovie.posterPath
                };
            }
            // Fallback to basic info
            return {
                title: `Movie ${movieId}`,
                genres: [],
            };
        }
        catch (error) {
            console.warn('⚠️ Error getting movie info:', error);
            return {
                title: `Movie ${movieId}`,
                genres: [],
            };
        }
    }
    /**
     * Update connection status in DynamoDB
     */
    async updateConnectionStatusInDB(roomId, userId, status, connectionInfo) {
        try {
            await docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: process.env.ROOM_MEMBERS_TABLE,
                Key: { roomId, userId },
                UpdateExpression: 'SET connectionStatus = :status, lastSeen = :lastSeen, reconnectionAttempts = :attempts',
                ExpressionAttributeValues: {
                    ':status': status,
                    ':lastSeen': connectionInfo.lastSeen,
                    ':attempts': connectionInfo.reconnectionAttempts
                }
            }));
        }
        catch (error) {
            console.warn('⚠️ Error updating connection status in DB:', error);
            // Don't throw - this is not critical for functionality
        }
    }
    /**
     * Update last sync timestamp for a room
     */
    async updateLastSyncTimestamp(roomId) {
        try {
            await docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: process.env.ROOMS_TABLE,
                Key: { PK: roomId, SK: 'ROOM' },
                UpdateExpression: 'SET lastSyncAt = :timestamp',
                ExpressionAttributeValues: {
                    ':timestamp': new Date().toISOString()
                }
            }));
        }
        catch (error) {
            console.warn('⚠️ Error updating last sync timestamp:', error);
            // Don't throw - this is not critical
        }
    }
    /**
     * Clean up stale connections
     */
    cleanupStaleConnection(roomId, userId) {
        const connectionKey = `${roomId}_${userId}`;
        const connection = this.connections.get(connectionKey);
        if (connection && connection.status === 'DISCONNECTED') {
            const timeSinceLastSeen = Date.now() - new Date(connection.lastSeen).getTime();
            if (timeSinceLastSeen >= this.CONNECTION_TIMEOUT_MS) {
                console.log(`🧹 Cleaning up stale connection for user ${userId} in room ${roomId}`);
                this.connections.delete(connectionKey);
                // Log cleanup metric
                (0, metrics_1.logBusinessMetric)('CONNECTION_CLEANED_UP', roomId, userId, {
                    connectionDuration: Date.now() - new Date(connection.connectedAt).getTime(),
                    timeSinceLastSeen
                });
            }
        }
    }
    /**
     * Get connection statistics for monitoring
     */
    getConnectionStats(roomId) {
        const connections = Array.from(this.connections.values());
        const filteredConnections = roomId ?
            connections.filter(conn => conn.roomId === roomId) :
            connections;
        const activeConnections = filteredConnections.filter(conn => conn.status === 'CONNECTED').length;
        const disconnectedConnections = filteredConnections.filter(conn => conn.status === 'DISCONNECTED').length;
        const stats = {
            totalConnections: filteredConnections.length,
            activeConnections,
            disconnectedConnections
        };
        if (!roomId) {
            // Group by room
            const roomConnections = {};
            connections.forEach(conn => {
                if (conn.status === 'CONNECTED') {
                    roomConnections[conn.roomId] = (roomConnections[conn.roomId] || 0) + 1;
                }
            });
            return { ...stats, roomConnections };
        }
        return stats;
    }
    /**
     * Force sync all rooms (for maintenance or recovery)
     */
    async forceSyncAllRooms() {
        console.log('🔄 Force syncing all active rooms...');
        try {
            // Get all unique room IDs from active connections
            const roomIds = [...new Set(Array.from(this.connections.values())
                    .filter(conn => conn.status === 'CONNECTED')
                    .map(conn => conn.roomId))];
            // Trigger sync for each room
            const syncPromises = roomIds.map(roomId => this.triggerRoomStateSync(roomId).catch(error => console.error(`❌ Error syncing room ${roomId}:`, error)));
            await Promise.all(syncPromises);
            console.log(`✅ Force sync completed for ${roomIds.length} rooms`);
        }
        catch (error) {
            console.error('❌ Error in force sync all rooms:', error);
            throw error;
        }
    }
}
exports.StateSyncService = StateSyncService;
// Export singleton instance
exports.stateSyncService = new StateSyncService();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdGVTeW5jU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YXRlU3luY1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7O0dBSUc7OztBQUVILDhEQUEwRDtBQUMxRCx3REFBd0c7QUFDeEcsa0VBQXFHO0FBQ3JHLDhDQUFpRjtBQUVqRixNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBd0M1RDs7O0dBR0c7QUFDSCxNQUFhLGdCQUFnQjtJQUE3QjtRQUNtQiwwQkFBcUIsR0FBRyxLQUFLLENBQUMsQ0FBQyxhQUFhO1FBQzVDLDhCQUF5QixHQUFHLENBQUMsQ0FBQztRQUM5QixxQkFBZ0IsR0FBRyxJQUFJLENBQUMsQ0FBQyxvQ0FBb0M7UUFFOUUsdUVBQXVFO1FBQy9ELGdCQUFXLEdBQWdDLElBQUksR0FBRyxFQUFFLENBQUM7UUFDckQsZUFBVSxHQUFnQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBNGQ5RCxDQUFDO0lBMWRDOztPQUVHO0lBQ0gsS0FBSyxDQUFDLG9CQUFvQixDQUN4QixNQUFjLEVBQ2QsTUFBYyxFQUNkLFlBQW9CLEVBQ3BCLFNBQWtCO1FBRWxCLE1BQU0sS0FBSyxHQUFHLElBQUksMEJBQWdCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUMzRCxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsTUFBTSx1QkFBdUIsTUFBTSxvQkFBb0IsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRWpILElBQUksQ0FBQztZQUNILCtCQUErQjtZQUMvQixNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBTSxJQUFJLE1BQU0sRUFBRSxDQUFDLENBQUM7WUFDdkUs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QUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRTlCLDZCQUE2QjtZQUM3QixNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQ3hDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FDOUMsT0FBTyxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsTUFBTSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQ3hELENBQ0YsQ0FBQztZQUVGLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNoQyxPQUFPLENBQUMsR0FBRyxDQUFDLDhCQUE4QixPQUFPLENBQUMsTUFBTSxRQUFRLENBQUMsQ0FBQztRQUVwRSxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDekQsTUFBTSxLQUFLLENBQUM7UUFDZCxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBbmVELDRDQW1lQztBQUVELDRCQUE0QjtBQUNmLFFBQUEsZ0JBQWdCLEdBQUcsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIFN0YXRlIFN5bmNocm9uaXphdGlvbiBTZXJ2aWNlXHJcbiAqIEhhbmRsZXMgZnVsbCByb29tIHN0YXRlIHJlZnJlc2ggd2hlbiBjb25uZWN0aW9ucyBhcmUgcmVzdG9yZWRcclxuICogRW5zdXJlcyB2b3RlIGNvdW50cyBhbmQgcHJvZ3Jlc3MgYXJlIGFjY3VyYXRlbHkgc3luY2VkXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kLCBRdWVyeUNvbW1hbmQsIFVwZGF0ZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xyXG5pbXBvcnQgeyBwdWJsaXNoUm9vbVN0YXRlU3luY0V2ZW50LCBwdWJsaXNoQ29ubmVjdGlvblN0YXR1c0V2ZW50IH0gZnJvbSAnLi4vdXRpbHMvYXBwc3luYy1wdWJsaXNoZXInO1xyXG5pbXBvcnQgeyBsb2dCdXNpbmVzc01ldHJpYywgbG9nRXJyb3IsIFBlcmZvcm1hbmNlVGltZXIgfSBmcm9tICcuLi91dGlscy9tZXRyaWNzJztcclxuXHJcbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XHJcbmNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBDb25uZWN0aW9uSW5mbyB7XHJcbiAgdXNlcklkOiBzdHJpbmc7XHJcbiAgY29ubmVjdGlvbklkOiBzdHJpbmc7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgY29ubmVjdGVkQXQ6IHN0cmluZztcclxuICBsYXN0U2Vlbjogc3RyaW5nO1xyXG4gIHVzZXJBZ2VudD86IHN0cmluZztcclxuICByZWNvbm5lY3Rpb25BdHRlbXB0czogbnVtYmVyO1xyXG4gIHN0YXR1czogJ0NPTk5FQ1RFRCcgfCAnRElTQ09OTkVDVEVEJyB8ICdSRUNPTk5FQ1RJTkcnO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFJvb21TeW5jU3RhdGUge1xyXG4gIHJvb21JZDogc3RyaW5nO1xyXG4gIHN0YXR1czogJ1dBSVRJTkcnIHwgJ0FDVElWRScgfCAnTUFUQ0hFRCcgfCAnQ09NUExFVEVEJztcclxuICBjdXJyZW50TW92aWVJZD86IHN0cmluZztcclxuICBjdXJyZW50TW92aWVJbmZvPzoge1xyXG4gICAgdGl0bGU6IHN0cmluZztcclxuICAgIGdlbnJlczogc3RyaW5nW107XHJcbiAgICB5ZWFyPzogbnVtYmVyO1xyXG4gICAgcG9zdGVyUGF0aD86IHN0cmluZztcclxuICB9O1xyXG4gIHRvdGFsTWVtYmVyczogbnVtYmVyO1xyXG4gIGFjdGl2ZUNvbm5lY3Rpb25zOiBudW1iZXI7XHJcbiAgdm90aW5nUHJvZ3Jlc3M6IHtcclxuICAgIGN1cnJlbnRWb3RlczogbnVtYmVyO1xyXG4gICAgdG90YWxSZXF1aXJlZDogbnVtYmVyO1xyXG4gICAgcGVyY2VudGFnZTogbnVtYmVyO1xyXG4gICAgdm90aW5nVXNlcnM6IHN0cmluZ1tdO1xyXG4gICAgcGVuZGluZ1VzZXJzOiBzdHJpbmdbXTtcclxuICB9O1xyXG4gIG1hdGNoUmVzdWx0Pzoge1xyXG4gICAgbW92aWVJZDogc3RyaW5nO1xyXG4gICAgbW92aWVUaXRsZTogc3RyaW5nO1xyXG4gICAgZm91bmRBdDogc3RyaW5nO1xyXG4gIH07XHJcbiAgbGFzdFN5bmNBdDogc3RyaW5nO1xyXG59XHJcblxyXG4vKipcclxuICogU3RhdGUgU3luY2hyb25pemF0aW9uIFNlcnZpY2VcclxuICogTWFuYWdlcyBjb25uZWN0aW9uIHN0YXRlIGFuZCByb29tIHN5bmNocm9uaXphdGlvbiBmb3IgcmVhbC10aW1lIHVwZGF0ZXNcclxuICovXHJcbmV4cG9ydCBjbGFzcyBTdGF0ZVN5bmNTZXJ2aWNlIHtcclxuICBwcml2YXRlIHJlYWRvbmx5IENPTk5FQ1RJT05fVElNRU9VVF9NUyA9IDMwMDAwOyAvLyAzMCBzZWNvbmRzXHJcbiAgcHJpdmF0ZSByZWFkb25seSBNQVhfUkVDT05ORUNUSU9OX0FUVEVNUFRTID0gNTtcclxuICBwcml2YXRlIHJlYWRvbmx5IFNZTkNfREVCT1VOQ0VfTVMgPSAxMDAwOyAvLyAxIHNlY29uZCBkZWJvdW5jZSBmb3Igc3luYyBldmVudHNcclxuXHJcbiAgLy8gSW4tbWVtb3J5IGNvbm5lY3Rpb24gdHJhY2tpbmcgKGluIHByb2R1Y3Rpb24sIHVzZSBSZWRpcyBvciBEeW5hbW9EQilcclxuICBwcml2YXRlIGNvbm5lY3Rpb25zOiBNYXA8c3RyaW5nLCBDb25uZWN0aW9uSW5mbz4gPSBuZXcgTWFwKCk7XHJcbiAgcHJpdmF0ZSBzeW5jVGltZXJzOiBNYXA8c3RyaW5nLCBOb2RlSlMuVGltZW91dD4gPSBuZXcgTWFwKCk7XHJcblxyXG4gIC8qKlxyXG4gICAqIEhhbmRsZSB1c2VyIGNvbm5lY3Rpb24gdG8gYSByb29tXHJcbiAgICovXHJcbiAgYXN5bmMgaGFuZGxlVXNlckNvbm5lY3Rpb24oXHJcbiAgICByb29tSWQ6IHN0cmluZyxcclxuICAgIHVzZXJJZDogc3RyaW5nLFxyXG4gICAgY29ubmVjdGlvbklkOiBzdHJpbmcsXHJcbiAgICB1c2VyQWdlbnQ/OiBzdHJpbmdcclxuICApOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ0hhbmRsZVVzZXJDb25uZWN0aW9uJyk7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+UjCBVc2VyICR7dXNlcklkfSBjb25uZWN0aW5nIHRvIHJvb20gJHtyb29tSWR9IHdpdGggY29ubmVjdGlvbiAke2Nvbm5lY3Rpb25JZC5zdWJzdHJpbmcoMCwgOCl9Li4uYCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gR2V0IGV4aXN0aW5nIGNvbm5lY3Rpb24gaW5mb1xyXG4gICAgICBjb25zdCBleGlzdGluZ0Nvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb25zLmdldChgJHtyb29tSWR9XyR7dXNlcklkfWApO1xyXG4gICAgICBjb25zdCByZWNvbm5lY3Rpb25BdHRlbXB0cyA9IGV4aXN0aW5nQ29ubmVjdGlvbj8ucmVjb25uZWN0aW9uQXR0ZW1wdHMgfHwgMDtcclxuXHJcbiAgICAgIC8vIENyZWF0ZSBuZXcgY29ubmVjdGlvbiBpbmZvXHJcbiAgICAgIGNvbnN0IGNvbm5lY3Rpb25JbmZvOiBDb25uZWN0aW9uSW5mbyA9IHtcclxuICAgICAgICB1c2VySWQsXHJcbiAgICAgICAgY29ubmVjdGlvbklkLFxyXG4gICAgICAgIHJvb21JZCxcclxuICAgICAgICBjb25uZWN0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIGxhc3RTZWVuOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgdXNlckFnZW50LFxyXG4gICAgICAgIHJlY29ubmVjdGlvbkF0dGVtcHRzOiBleGlzdGluZ0Nvbm5lY3Rpb24gPyByZWNvbm5lY3Rpb25BdHRlbXB0cyArIDEgOiAwLFxyXG4gICAgICAgIHN0YXR1czogJ0NPTk5FQ1RFRCdcclxuICAgICAgfTtcclxuXHJcbiAgICAgIC8vIFN0b3JlIGNvbm5lY3Rpb24gaW5mb1xyXG4gICAgICB0aGlzLmNvbm5lY3Rpb25zLnNldChgJHtyb29tSWR9XyR7dXNlcklkfWAsIGNvbm5lY3Rpb25JbmZvKTtcclxuXHJcbiAgICAgIC8vIFVwZGF0ZSBjb25uZWN0aW9uIHN0YXR1cyBpbiBEeW5hbW9EQlxyXG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZUNvbm5lY3Rpb25TdGF0dXNJbkRCKHJvb21JZCwgdXNlcklkLCAnQ09OTkVDVEVEJywgY29ubmVjdGlvbkluZm8pO1xyXG5cclxuICAgICAgLy8gUHVibGlzaCBjb25uZWN0aW9uIHN0YXR1cyBldmVudFxyXG4gICAgICBhd2FpdCBwdWJsaXNoQ29ubmVjdGlvblN0YXR1c0V2ZW50KHJvb21JZCwgdXNlcklkLCAnQ09OTkVDVEVEJywgY29ubmVjdGlvbklkLCB7XHJcbiAgICAgICAgdXNlckFnZW50LFxyXG4gICAgICAgIHJlY29ubmVjdGlvbkF0dGVtcHRzOiBjb25uZWN0aW9uSW5mby5yZWNvbm5lY3Rpb25BdHRlbXB0c1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIElmIHRoaXMgaXMgYSByZWNvbm5lY3Rpb24sIHRyaWdnZXIgZnVsbCBzdGF0ZSBzeW5jXHJcbiAgICAgIGlmIChleGlzdGluZ0Nvbm5lY3Rpb24gJiYgY29ubmVjdGlvbkluZm8ucmVjb25uZWN0aW9uQXR0ZW1wdHMgPiAwKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCflIQgVXNlciAke3VzZXJJZH0gcmVjb25uZWN0aW5nIChhdHRlbXB0ICR7Y29ubmVjdGlvbkluZm8ucmVjb25uZWN0aW9uQXR0ZW1wdHN9KSwgdHJpZ2dlcmluZyBzdGF0ZSBzeW5jYCk7XHJcbiAgICAgICAgYXdhaXQgdGhpcy50cmlnZ2VyUm9vbVN0YXRlU3luYyhyb29tSWQsIHVzZXJJZCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIExvZyBidXNpbmVzcyBtZXRyaWNcclxuICAgICAgbG9nQnVzaW5lc3NNZXRyaWMoJ1JPT01fSk9JTkVEJywgcm9vbUlkLCB1c2VySWQsIHtcclxuICAgICAgICBjb25uZWN0aW9uSWQ6IGNvbm5lY3Rpb25JZC5zdWJzdHJpbmcoMCwgOCksXHJcbiAgICAgICAgcmVjb25uZWN0aW9uQXR0ZW1wdHM6IGNvbm5lY3Rpb25JbmZvLnJlY29ubmVjdGlvbkF0dGVtcHRzLFxyXG4gICAgICAgIGlzUmVjb25uZWN0aW9uOiBjb25uZWN0aW9uSW5mby5yZWNvbm5lY3Rpb25BdHRlbXB0cyA+IDBcclxuICAgICAgfSk7XHJcblxyXG4gICAgICB0aW1lci5maW5pc2godHJ1ZSwgdW5kZWZpbmVkLCB7IFxyXG4gICAgICAgIHJlY29ubmVjdGlvbkF0dGVtcHRzOiBjb25uZWN0aW9uSW5mby5yZWNvbm5lY3Rpb25BdHRlbXB0cyxcclxuICAgICAgICBpc1JlY29ubmVjdGlvbjogY29ubmVjdGlvbkluZm8ucmVjb25uZWN0aW9uQXR0ZW1wdHMgPiAwXHJcbiAgICAgIH0pO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGxvZ0Vycm9yKCdIYW5kbGVVc2VyQ29ubmVjdGlvbicsIGVycm9yIGFzIEVycm9yLCB7IHJvb21JZCwgdXNlcklkLCBjb25uZWN0aW9uSWQgfSk7XHJcbiAgICAgIHRpbWVyLmZpbmlzaChmYWxzZSwgKGVycm9yIGFzIEVycm9yKS5uYW1lKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBIYW5kbGUgdXNlciBkaXNjb25uZWN0aW9uIGZyb20gYSByb29tXHJcbiAgICovXHJcbiAgYXN5bmMgaGFuZGxlVXNlckRpc2Nvbm5lY3Rpb24oXHJcbiAgICByb29tSWQ6IHN0cmluZyxcclxuICAgIHVzZXJJZDogc3RyaW5nLFxyXG4gICAgY29ubmVjdGlvbklkOiBzdHJpbmdcclxuICApOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ0hhbmRsZVVzZXJEaXNjb25uZWN0aW9uJyk7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+UjCBVc2VyICR7dXNlcklkfSBkaXNjb25uZWN0aW5nIGZyb20gcm9vbSAke3Jvb21JZH1gKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjb25uZWN0aW9uS2V5ID0gYCR7cm9vbUlkfV8ke3VzZXJJZH1gO1xyXG4gICAgICBjb25zdCBleGlzdGluZ0Nvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb25zLmdldChjb25uZWN0aW9uS2V5KTtcclxuXHJcbiAgICAgIGlmIChleGlzdGluZ0Nvbm5lY3Rpb24pIHtcclxuICAgICAgICAvLyBVcGRhdGUgY29ubmVjdGlvbiBzdGF0dXNcclxuICAgICAgICBleGlzdGluZ0Nvbm5lY3Rpb24uc3RhdHVzID0gJ0RJU0NPTk5FQ1RFRCc7XHJcbiAgICAgICAgZXhpc3RpbmdDb25uZWN0aW9uLmxhc3RTZWVuID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG4gICAgICAgIHRoaXMuY29ubmVjdGlvbnMuc2V0KGNvbm5lY3Rpb25LZXksIGV4aXN0aW5nQ29ubmVjdGlvbik7XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSBjb25uZWN0aW9uIHN0YXR1cyBpbiBEeW5hbW9EQlxyXG4gICAgICAgIGF3YWl0IHRoaXMudXBkYXRlQ29ubmVjdGlvblN0YXR1c0luREIocm9vbUlkLCB1c2VySWQsICdESVNDT05ORUNURUQnLCBleGlzdGluZ0Nvbm5lY3Rpb24pO1xyXG5cclxuICAgICAgICAvLyBQdWJsaXNoIGRpc2Nvbm5lY3Rpb24gZXZlbnRcclxuICAgICAgICBhd2FpdCBwdWJsaXNoQ29ubmVjdGlvblN0YXR1c0V2ZW50KHJvb21JZCwgdXNlcklkLCAnRElTQ09OTkVDVEVEJywgY29ubmVjdGlvbklkLCB7XHJcbiAgICAgICAgICB1c2VyQWdlbnQ6IGV4aXN0aW5nQ29ubmVjdGlvbi51c2VyQWdlbnQsXHJcbiAgICAgICAgICByZWNvbm5lY3Rpb25BdHRlbXB0czogZXhpc3RpbmdDb25uZWN0aW9uLnJlY29ubmVjdGlvbkF0dGVtcHRzXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFNjaGVkdWxlIGNvbm5lY3Rpb24gY2xlYW51cCBhZnRlciB0aW1lb3V0XHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLmNsZWFudXBTdGFsZUNvbm5lY3Rpb24ocm9vbUlkLCB1c2VySWQpO1xyXG4gICAgICAgIH0sIHRoaXMuQ09OTkVDVElPTl9USU1FT1VUX01TKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gTG9nIGJ1c2luZXNzIG1ldHJpY1xyXG4gICAgICBsb2dCdXNpbmVzc01ldHJpYygnVVNFUl9ESVNDT05ORUNURUQnLCByb29tSWQsIHVzZXJJZCwge1xyXG4gICAgICAgIGNvbm5lY3Rpb25JZDogY29ubmVjdGlvbklkLnN1YnN0cmluZygwLCA4KSxcclxuICAgICAgICBjb25uZWN0aW9uRHVyYXRpb246IGV4aXN0aW5nQ29ubmVjdGlvbiA/IFxyXG4gICAgICAgICAgRGF0ZS5ub3coKSAtIG5ldyBEYXRlKGV4aXN0aW5nQ29ubmVjdGlvbi5jb25uZWN0ZWRBdCkuZ2V0VGltZSgpIDogMFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHRpbWVyLmZpbmlzaCh0cnVlKTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBsb2dFcnJvcignSGFuZGxlVXNlckRpc2Nvbm5lY3Rpb24nLCBlcnJvciBhcyBFcnJvciwgeyByb29tSWQsIHVzZXJJZCwgY29ubmVjdGlvbklkIH0pO1xyXG4gICAgICB0aW1lci5maW5pc2goZmFsc2UsIChlcnJvciBhcyBFcnJvcikubmFtZSk7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVHJpZ2dlciBmdWxsIHJvb20gc3RhdGUgc3luY2hyb25pemF0aW9uIGZvciBhIHNwZWNpZmljIHVzZXIgb3IgYWxsIHVzZXJzXHJcbiAgICovXHJcbiAgYXN5bmMgdHJpZ2dlclJvb21TdGF0ZVN5bmMocm9vbUlkOiBzdHJpbmcsIHRhcmdldFVzZXJJZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgdGltZXIgPSBuZXcgUGVyZm9ybWFuY2VUaW1lcignVHJpZ2dlclJvb21TdGF0ZVN5bmMnKTtcclxuICAgIGNvbnNvbGUubG9nKGDwn5SEIFRyaWdnZXJpbmcgcm9vbSBzdGF0ZSBzeW5jIGZvciByb29tICR7cm9vbUlkfSR7dGFyZ2V0VXNlcklkID8gYCAodXNlcjogJHt0YXJnZXRVc2VySWR9KWAgOiAnIChhbGwgdXNlcnMpJ31gKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBEZWJvdW5jZSBzeW5jIGV2ZW50cyB0byBhdm9pZCBvdmVyd2hlbG1pbmcgdGhlIHN5c3RlbVxyXG4gICAgICBjb25zdCBzeW5jS2V5ID0gdGFyZ2V0VXNlcklkID8gYCR7cm9vbUlkfV8ke3RhcmdldFVzZXJJZH1gIDogcm9vbUlkO1xyXG4gICAgICBcclxuICAgICAgaWYgKHRoaXMuc3luY1RpbWVycy5oYXMoc3luY0tleSkpIHtcclxuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5zeW5jVGltZXJzLmdldChzeW5jS2V5KSEpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBzeW5jVGltZXIgPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgLy8gR2V0IGNvbXByZWhlbnNpdmUgcm9vbSBzdGF0ZVxyXG4gICAgICAgICAgY29uc3Qgcm9vbVN0YXRlID0gYXdhaXQgdGhpcy5nZXRDb21wcmVoZW5zaXZlUm9vbVN0YXRlKHJvb21JZCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFB1Ymxpc2ggc3RhdGUgc3luYyBldmVudFxyXG4gICAgICAgICAgYXdhaXQgcHVibGlzaFJvb21TdGF0ZVN5bmNFdmVudChyb29tSWQsIHRhcmdldFVzZXJJZCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFVwZGF0ZSBsYXN0IHN5bmMgdGltZXN0YW1wXHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnVwZGF0ZUxhc3RTeW5jVGltZXN0YW1wKHJvb21JZCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIExvZyBidXNpbmVzcyBtZXRyaWNcclxuICAgICAgICAgIGxvZ0J1c2luZXNzTWV0cmljKCdST09NX1NUQVRFX1NZTkNFRCcsIHJvb21JZCwgdGFyZ2V0VXNlcklkIHx8ICdhbGxfdXNlcnMnLCB7XHJcbiAgICAgICAgICAgIHJvb21TdGF0dXM6IHJvb21TdGF0ZS5zdGF0dXMsXHJcbiAgICAgICAgICAgIHRvdGFsTWVtYmVyczogcm9vbVN0YXRlLnRvdGFsTWVtYmVycyxcclxuICAgICAgICAgICAgYWN0aXZlQ29ubmVjdGlvbnM6IHJvb21TdGF0ZS5hY3RpdmVDb25uZWN0aW9ucyxcclxuICAgICAgICAgICAgdm90aW5nUHJvZ3Jlc3M6IHJvb21TdGF0ZS52b3RpbmdQcm9ncmVzcy5wZXJjZW50YWdlXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgY29uc29sZS5sb2coYOKchSBSb29tIHN0YXRlIHN5bmMgY29tcGxldGVkIGZvciByb29tICR7cm9vbUlkfWApO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgfSBjYXRjaCAoc3luY0Vycm9yKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZGVib3VuY2VkIHN5bmM6Jywgc3luY0Vycm9yKTtcclxuICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgdGhpcy5zeW5jVGltZXJzLmRlbGV0ZShzeW5jS2V5KTtcclxuICAgICAgICB9XHJcbiAgICAgIH0sIHRoaXMuU1lOQ19ERUJPVU5DRV9NUyk7XHJcblxyXG4gICAgICB0aGlzLnN5bmNUaW1lcnMuc2V0KHN5bmNLZXksIHN5bmNUaW1lcik7XHJcbiAgICAgIHRpbWVyLmZpbmlzaCh0cnVlKTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBsb2dFcnJvcignVHJpZ2dlclJvb21TdGF0ZVN5bmMnLCBlcnJvciBhcyBFcnJvciwgeyByb29tSWQsIHRhcmdldFVzZXJJZCB9KTtcclxuICAgICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBjb21wcmVoZW5zaXZlIHJvb20gc3RhdGUgZm9yIHN5bmNocm9uaXphdGlvblxyXG4gICAqL1xyXG4gIGFzeW5jIGdldENvbXByZWhlbnNpdmVSb29tU3RhdGUocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPFJvb21TeW5jU3RhdGU+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIEdldCByb29tIGluZm9ybWF0aW9uXHJcbiAgICAgIGNvbnN0IHJvb21SZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgICBLZXk6IHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9LFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBjb25zdCByb29tID0gcm9vbVJlc3BvbnNlLkl0ZW07XHJcbiAgICAgIGlmICghcm9vbSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgUm9vbSAke3Jvb21JZH0gbm90IGZvdW5kYCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEdldCBhbGwgYWN0aXZlIG1lbWJlcnNcclxuICAgICAgY29uc3QgbWVtYmVyc1Jlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICdyb29tSWQgPSA6cm9vbUlkJyxcclxuICAgICAgICBGaWx0ZXJFeHByZXNzaW9uOiAnaXNBY3RpdmUgPSA6YWN0aXZlJyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOnJvb21JZCc6IHJvb21JZCxcclxuICAgICAgICAgICc6YWN0aXZlJzogdHJ1ZVxyXG4gICAgICAgIH1cclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgY29uc3QgdG90YWxNZW1iZXJzID0gbWVtYmVyc1Jlc3BvbnNlLkNvdW50IHx8IDA7XHJcbiAgICAgIGNvbnN0IGFsbE1lbWJlcnMgPSBtZW1iZXJzUmVzcG9uc2UuSXRlbXM/Lm1hcChpdGVtID0+IGl0ZW0udXNlcklkKSB8fCBbXTtcclxuXHJcbiAgICAgIC8vIEdldCBjdXJyZW50IHZvdGluZyBwcm9ncmVzcyBpZiByb29tIGlzIGFjdGl2ZVxyXG4gICAgICBsZXQgdm90aW5nUHJvZ3Jlc3MgPSB7XHJcbiAgICAgICAgY3VycmVudFZvdGVzOiAwLFxyXG4gICAgICAgIHRvdGFsUmVxdWlyZWQ6IHRvdGFsTWVtYmVycyxcclxuICAgICAgICBwZXJjZW50YWdlOiAwLFxyXG4gICAgICAgIHZvdGluZ1VzZXJzOiBbXSBhcyBzdHJpbmdbXSxcclxuICAgICAgICBwZW5kaW5nVXNlcnM6IGFsbE1lbWJlcnNcclxuICAgICAgfTtcclxuXHJcbiAgICAgIGlmIChyb29tLnN0YXR1cyA9PT0gJ0FDVElWRScgJiYgcm9vbS5jdXJyZW50TW92aWVJZCkge1xyXG4gICAgICAgIC8vIEdldCBjdXJyZW50IHZvdGVzXHJcbiAgICAgICAgY29uc3Qgdm90ZXNSZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuVk9URVNfVEFCTEUhLFxyXG4gICAgICAgICAgS2V5OiB7IHJvb21JZCwgbW92aWVJZDogcm9vbS5jdXJyZW50TW92aWVJZCB9LFxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgY29uc3QgY3VycmVudFZvdGVzID0gdm90ZXNSZXNwb25zZS5JdGVtPy52b3RlcyB8fCAwO1xyXG5cclxuICAgICAgICAvLyBHZXQgdXNlcnMgd2hvIGhhdmUgdm90ZWRcclxuICAgICAgICBjb25zdCB2b3RpbmdVc2VycyA9IGF3YWl0IHRoaXMuZ2V0Vm90aW5nVXNlcnMocm9vbUlkLCByb29tLmN1cnJlbnRNb3ZpZUlkKTtcclxuICAgICAgICBjb25zdCBwZW5kaW5nVXNlcnMgPSBhbGxNZW1iZXJzLmZpbHRlcih1c2VySWQgPT4gIXZvdGluZ1VzZXJzLmluY2x1ZGVzKHVzZXJJZCkpO1xyXG5cclxuICAgICAgICB2b3RpbmdQcm9ncmVzcyA9IHtcclxuICAgICAgICAgIGN1cnJlbnRWb3RlcyxcclxuICAgICAgICAgIHRvdGFsUmVxdWlyZWQ6IHRvdGFsTWVtYmVycyxcclxuICAgICAgICAgIHBlcmNlbnRhZ2U6IHRvdGFsTWVtYmVycyA+IDAgPyAoY3VycmVudFZvdGVzIC8gdG90YWxNZW1iZXJzKSAqIDEwMCA6IDAsXHJcbiAgICAgICAgICB2b3RpbmdVc2VycyxcclxuICAgICAgICAgIHBlbmRpbmdVc2Vyc1xyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEdldCBjdXJyZW50IG1vdmllIGluZm8gaWYgYXZhaWxhYmxlXHJcbiAgICAgIGxldCBjdXJyZW50TW92aWVJbmZvO1xyXG4gICAgICBpZiAocm9vbS5jdXJyZW50TW92aWVJZCkge1xyXG4gICAgICAgIGN1cnJlbnRNb3ZpZUluZm8gPSBhd2FpdCB0aGlzLmdldE1vdmllSW5mbyhyb29tLmN1cnJlbnRNb3ZpZUlkKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gR2V0IG1hdGNoIHJlc3VsdCBpZiByb29tIGlzIG1hdGNoZWRcclxuICAgICAgbGV0IG1hdGNoUmVzdWx0O1xyXG4gICAgICBpZiAocm9vbS5zdGF0dXMgPT09ICdNQVRDSEVEJyAmJiByb29tLnJlc3VsdE1vdmllSWQpIHtcclxuICAgICAgICBjb25zdCBtYXRjaE1vdmllSW5mbyA9IGF3YWl0IHRoaXMuZ2V0TW92aWVJbmZvKHJvb20ucmVzdWx0TW92aWVJZCk7XHJcbiAgICAgICAgbWF0Y2hSZXN1bHQgPSB7XHJcbiAgICAgICAgICBtb3ZpZUlkOiByb29tLnJlc3VsdE1vdmllSWQsXHJcbiAgICAgICAgICBtb3ZpZVRpdGxlOiBtYXRjaE1vdmllSW5mby50aXRsZSxcclxuICAgICAgICAgIGZvdW5kQXQ6IHJvb20udXBkYXRlZEF0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIENvdW50IGFjdGl2ZSBjb25uZWN0aW9uc1xyXG4gICAgICBjb25zdCBhY3RpdmVDb25uZWN0aW9ucyA9IEFycmF5LmZyb20odGhpcy5jb25uZWN0aW9ucy52YWx1ZXMoKSlcclxuICAgICAgICAuZmlsdGVyKGNvbm4gPT4gY29ubi5yb29tSWQgPT09IHJvb21JZCAmJiBjb25uLnN0YXR1cyA9PT0gJ0NPTk5FQ1RFRCcpXHJcbiAgICAgICAgLmxlbmd0aDtcclxuXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgcm9vbUlkLFxyXG4gICAgICAgIHN0YXR1czogcm9vbS5zdGF0dXMsXHJcbiAgICAgICAgY3VycmVudE1vdmllSWQ6IHJvb20uY3VycmVudE1vdmllSWQsXHJcbiAgICAgICAgY3VycmVudE1vdmllSW5mbyxcclxuICAgICAgICB0b3RhbE1lbWJlcnMsXHJcbiAgICAgICAgYWN0aXZlQ29ubmVjdGlvbnM6IE1hdGgubWF4KGFjdGl2ZUNvbm5lY3Rpb25zLCB0b3RhbE1lbWJlcnMpLCAvLyBGYWxsYmFjayB0byBtZW1iZXIgY291bnRcclxuICAgICAgICB2b3RpbmdQcm9ncmVzcyxcclxuICAgICAgICBtYXRjaFJlc3VsdCxcclxuICAgICAgICBsYXN0U3luY0F0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgfTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZ2V0dGluZyBjb21wcmVoZW5zaXZlIHJvb20gc3RhdGU6JywgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCB1c2VycyB3aG8gaGF2ZSB2b3RlZCBmb3IgYSBzcGVjaWZpYyBtb3ZpZVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZ2V0Vm90aW5nVXNlcnMocm9vbUlkOiBzdHJpbmcsIG1vdmllSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJvb21Nb3ZpZUlkID0gYCR7cm9vbUlkfV8ke21vdmllSWR9YDtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5VU0VSX1ZPVEVTX1RBQkxFISxcclxuICAgICAgICBJbmRleE5hbWU6ICdSb29tTW92aWVJbmRleCcsXHJcbiAgICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ3Jvb21Nb3ZpZUlkID0gOnJvb21Nb3ZpZUlkJyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOnJvb21Nb3ZpZUlkJzogcm9vbU1vdmllSWRcclxuICAgICAgICB9LFxyXG4gICAgICAgIFByb2plY3Rpb25FeHByZXNzaW9uOiAndXNlcklkJ1xyXG4gICAgICB9KSk7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4gcmVzcG9uc2UuSXRlbXM/Lm1hcChpdGVtID0+IGl0ZW0udXNlcklkKSB8fCBbXTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPIEVycm9yIGdldHRpbmcgdm90aW5nIHVzZXJzOicsIGVycm9yKTtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IG1vdmllIGluZm9ybWF0aW9uIGZvciBzdGF0ZSBzeW5jXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBnZXRNb3ZpZUluZm8obW92aWVJZDogc3RyaW5nKTogUHJvbWlzZTx7XHJcbiAgICB0aXRsZTogc3RyaW5nO1xyXG4gICAgZ2VucmVzOiBzdHJpbmdbXTtcclxuICAgIHllYXI/OiBudW1iZXI7XHJcbiAgICBwb3N0ZXJQYXRoPzogc3RyaW5nO1xyXG4gIH0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIFRyeSB0byBnZXQgZnJvbSBtb3ZpZSBjYWNoZSBmaXJzdFxyXG4gICAgICBjb25zdCBjYWNoZVJlc3BvbnNlID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5NT1ZJRV9DQUNIRV9UQUJMRSEsXHJcbiAgICAgICAgSW5kZXhOYW1lOiAnTW92aWVJZEluZGV4JyxcclxuICAgICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAnbW92aWVJZCA9IDptb3ZpZUlkJyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOm1vdmllSWQnOiBtb3ZpZUlkXHJcbiAgICAgICAgfSxcclxuICAgICAgICBMaW1pdDogMVxyXG4gICAgICB9KSk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoY2FjaGVSZXNwb25zZS5JdGVtcyAmJiBjYWNoZVJlc3BvbnNlLkl0ZW1zLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zdCBjYWNoZWRNb3ZpZSA9IGNhY2hlUmVzcG9uc2UuSXRlbXNbMF07XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIHRpdGxlOiBjYWNoZWRNb3ZpZS50aXRsZSB8fCBgTW92aWUgJHttb3ZpZUlkfWAsXHJcbiAgICAgICAgICBnZW5yZXM6IGNhY2hlZE1vdmllLmdlbnJlcyB8fCBbXSxcclxuICAgICAgICAgIHllYXI6IGNhY2hlZE1vdmllLnllYXIsXHJcbiAgICAgICAgICBwb3N0ZXJQYXRoOiBjYWNoZWRNb3ZpZS5wb3N0ZXJQYXRoXHJcbiAgICAgICAgfTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gRmFsbGJhY2sgdG8gYmFzaWMgaW5mb1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHRpdGxlOiBgTW92aWUgJHttb3ZpZUlkfWAsXHJcbiAgICAgICAgZ2VucmVzOiBbXSxcclxuICAgICAgfTtcclxuICAgICAgXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBnZXR0aW5nIG1vdmllIGluZm86JywgZXJyb3IpO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHRpdGxlOiBgTW92aWUgJHttb3ZpZUlkfWAsXHJcbiAgICAgICAgZ2VucmVzOiBbXSxcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFVwZGF0ZSBjb25uZWN0aW9uIHN0YXR1cyBpbiBEeW5hbW9EQlxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgdXBkYXRlQ29ubmVjdGlvblN0YXR1c0luREIoXHJcbiAgICByb29tSWQ6IHN0cmluZyxcclxuICAgIHVzZXJJZDogc3RyaW5nLFxyXG4gICAgc3RhdHVzOiAnQ09OTkVDVEVEJyB8ICdESVNDT05ORUNURUQnLFxyXG4gICAgY29ubmVjdGlvbkluZm86IENvbm5lY3Rpb25JbmZvXHJcbiAgKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgVXBkYXRlQ29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUhLFxyXG4gICAgICAgIEtleTogeyByb29tSWQsIHVzZXJJZCB9LFxyXG4gICAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgY29ubmVjdGlvblN0YXR1cyA9IDpzdGF0dXMsIGxhc3RTZWVuID0gOmxhc3RTZWVuLCByZWNvbm5lY3Rpb25BdHRlbXB0cyA9IDphdHRlbXB0cycsXHJcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgJzpzdGF0dXMnOiBzdGF0dXMsXHJcbiAgICAgICAgICAnOmxhc3RTZWVuJzogY29ubmVjdGlvbkluZm8ubGFzdFNlZW4sXHJcbiAgICAgICAgICAnOmF0dGVtcHRzJzogY29ubmVjdGlvbkluZm8ucmVjb25uZWN0aW9uQXR0ZW1wdHNcclxuICAgICAgICB9XHJcbiAgICAgIH0pKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPIEVycm9yIHVwZGF0aW5nIGNvbm5lY3Rpb24gc3RhdHVzIGluIERCOicsIGVycm9yKTtcclxuICAgICAgLy8gRG9uJ3QgdGhyb3cgLSB0aGlzIGlzIG5vdCBjcml0aWNhbCBmb3IgZnVuY3Rpb25hbGl0eVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVXBkYXRlIGxhc3Qgc3luYyB0aW1lc3RhbXAgZm9yIGEgcm9vbVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgdXBkYXRlTGFzdFN5bmNUaW1lc3RhbXAocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBVcGRhdGVDb21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJPT01TX1RBQkxFISxcclxuICAgICAgICBLZXk6IHsgUEs6IHJvb21JZCwgU0s6ICdST09NJyB9LFxyXG4gICAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgbGFzdFN5bmNBdCA9IDp0aW1lc3RhbXAnLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcclxuICAgICAgICAgICc6dGltZXN0YW1wJzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgICAgfVxyXG4gICAgICB9KSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciB1cGRhdGluZyBsYXN0IHN5bmMgdGltZXN0YW1wOicsIGVycm9yKTtcclxuICAgICAgLy8gRG9uJ3QgdGhyb3cgLSB0aGlzIGlzIG5vdCBjcml0aWNhbFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2xlYW4gdXAgc3RhbGUgY29ubmVjdGlvbnNcclxuICAgKi9cclxuICBwcml2YXRlIGNsZWFudXBTdGFsZUNvbm5lY3Rpb24ocm9vbUlkOiBzdHJpbmcsIHVzZXJJZDogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBjb25zdCBjb25uZWN0aW9uS2V5ID0gYCR7cm9vbUlkfV8ke3VzZXJJZH1gO1xyXG4gICAgY29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbnMuZ2V0KGNvbm5lY3Rpb25LZXkpO1xyXG4gICAgXHJcbiAgICBpZiAoY29ubmVjdGlvbiAmJiBjb25uZWN0aW9uLnN0YXR1cyA9PT0gJ0RJU0NPTk5FQ1RFRCcpIHtcclxuICAgICAgY29uc3QgdGltZVNpbmNlTGFzdFNlZW4gPSBEYXRlLm5vdygpIC0gbmV3IERhdGUoY29ubmVjdGlvbi5sYXN0U2VlbikuZ2V0VGltZSgpO1xyXG4gICAgICBcclxuICAgICAgaWYgKHRpbWVTaW5jZUxhc3RTZWVuID49IHRoaXMuQ09OTkVDVElPTl9USU1FT1VUX01TKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfp7kgQ2xlYW5pbmcgdXAgc3RhbGUgY29ubmVjdGlvbiBmb3IgdXNlciAke3VzZXJJZH0gaW4gcm9vbSAke3Jvb21JZH1gKTtcclxuICAgICAgICB0aGlzLmNvbm5lY3Rpb25zLmRlbGV0ZShjb25uZWN0aW9uS2V5KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBMb2cgY2xlYW51cCBtZXRyaWNcclxuICAgICAgICBsb2dCdXNpbmVzc01ldHJpYygnQ09OTkVDVElPTl9DTEVBTkVEX1VQJywgcm9vbUlkLCB1c2VySWQsIHtcclxuICAgICAgICAgIGNvbm5lY3Rpb25EdXJhdGlvbjogRGF0ZS5ub3coKSAtIG5ldyBEYXRlKGNvbm5lY3Rpb24uY29ubmVjdGVkQXQpLmdldFRpbWUoKSxcclxuICAgICAgICAgIHRpbWVTaW5jZUxhc3RTZWVuXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBjb25uZWN0aW9uIHN0YXRpc3RpY3MgZm9yIG1vbml0b3JpbmdcclxuICAgKi9cclxuICBnZXRDb25uZWN0aW9uU3RhdHMocm9vbUlkPzogc3RyaW5nKToge1xyXG4gICAgdG90YWxDb25uZWN0aW9uczogbnVtYmVyO1xyXG4gICAgYWN0aXZlQ29ubmVjdGlvbnM6IG51bWJlcjtcclxuICAgIGRpc2Nvbm5lY3RlZENvbm5lY3Rpb25zOiBudW1iZXI7XHJcbiAgICByb29tQ29ubmVjdGlvbnM/OiB7IFtyb29tSWQ6IHN0cmluZ106IG51bWJlciB9O1xyXG4gIH0ge1xyXG4gICAgY29uc3QgY29ubmVjdGlvbnMgPSBBcnJheS5mcm9tKHRoaXMuY29ubmVjdGlvbnMudmFsdWVzKCkpO1xyXG4gICAgY29uc3QgZmlsdGVyZWRDb25uZWN0aW9ucyA9IHJvb21JZCA/IFxyXG4gICAgICBjb25uZWN0aW9ucy5maWx0ZXIoY29ubiA9PiBjb25uLnJvb21JZCA9PT0gcm9vbUlkKSA6IFxyXG4gICAgICBjb25uZWN0aW9ucztcclxuXHJcbiAgICBjb25zdCBhY3RpdmVDb25uZWN0aW9ucyA9IGZpbHRlcmVkQ29ubmVjdGlvbnMuZmlsdGVyKGNvbm4gPT4gY29ubi5zdGF0dXMgPT09ICdDT05ORUNURUQnKS5sZW5ndGg7XHJcbiAgICBjb25zdCBkaXNjb25uZWN0ZWRDb25uZWN0aW9ucyA9IGZpbHRlcmVkQ29ubmVjdGlvbnMuZmlsdGVyKGNvbm4gPT4gY29ubi5zdGF0dXMgPT09ICdESVNDT05ORUNURUQnKS5sZW5ndGg7XHJcblxyXG4gICAgY29uc3Qgc3RhdHMgPSB7XHJcbiAgICAgIHRvdGFsQ29ubmVjdGlvbnM6IGZpbHRlcmVkQ29ubmVjdGlvbnMubGVuZ3RoLFxyXG4gICAgICBhY3RpdmVDb25uZWN0aW9ucyxcclxuICAgICAgZGlzY29ubmVjdGVkQ29ubmVjdGlvbnNcclxuICAgIH07XHJcblxyXG4gICAgaWYgKCFyb29tSWQpIHtcclxuICAgICAgLy8gR3JvdXAgYnkgcm9vbVxyXG4gICAgICBjb25zdCByb29tQ29ubmVjdGlvbnM6IHsgW3Jvb21JZDogc3RyaW5nXTogbnVtYmVyIH0gPSB7fTtcclxuICAgICAgY29ubmVjdGlvbnMuZm9yRWFjaChjb25uID0+IHtcclxuICAgICAgICBpZiAoY29ubi5zdGF0dXMgPT09ICdDT05ORUNURUQnKSB7XHJcbiAgICAgICAgICByb29tQ29ubmVjdGlvbnNbY29ubi5yb29tSWRdID0gKHJvb21Db25uZWN0aW9uc1tjb25uLnJvb21JZF0gfHwgMCkgKyAxO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICAgIHJldHVybiB7IC4uLnN0YXRzLCByb29tQ29ubmVjdGlvbnMgfTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gc3RhdHM7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGb3JjZSBzeW5jIGFsbCByb29tcyAoZm9yIG1haW50ZW5hbmNlIG9yIHJlY292ZXJ5KVxyXG4gICAqL1xyXG4gIGFzeW5jIGZvcmNlU3luY0FsbFJvb21zKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc29sZS5sb2coJ/CflIQgRm9yY2Ugc3luY2luZyBhbGwgYWN0aXZlIHJvb21zLi4uJyk7XHJcbiAgICBcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIEdldCBhbGwgdW5pcXVlIHJvb20gSURzIGZyb20gYWN0aXZlIGNvbm5lY3Rpb25zXHJcbiAgICAgIGNvbnN0IHJvb21JZHMgPSBbLi4ubmV3IFNldChBcnJheS5mcm9tKHRoaXMuY29ubmVjdGlvbnMudmFsdWVzKCkpXHJcbiAgICAgICAgLmZpbHRlcihjb25uID0+IGNvbm4uc3RhdHVzID09PSAnQ09OTkVDVEVEJylcclxuICAgICAgICAubWFwKGNvbm4gPT4gY29ubi5yb29tSWQpKV07XHJcblxyXG4gICAgICAvLyBUcmlnZ2VyIHN5bmMgZm9yIGVhY2ggcm9vbVxyXG4gICAgICBjb25zdCBzeW5jUHJvbWlzZXMgPSByb29tSWRzLm1hcChyb29tSWQgPT4gXHJcbiAgICAgICAgdGhpcy50cmlnZ2VyUm9vbVN0YXRlU3luYyhyb29tSWQpLmNhdGNoKGVycm9yID0+IFxyXG4gICAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIHN5bmNpbmcgcm9vbSAke3Jvb21JZH06YCwgZXJyb3IpXHJcbiAgICAgICAgKVxyXG4gICAgICApO1xyXG5cclxuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoc3luY1Byb21pc2VzKTtcclxuICAgICAgY29uc29sZS5sb2coYOKchSBGb3JjZSBzeW5jIGNvbXBsZXRlZCBmb3IgJHtyb29tSWRzLmxlbmd0aH0gcm9vbXNgKTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZm9yY2Ugc3luYyBhbGwgcm9vbXM6JywgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIEV4cG9ydCBzaW5nbGV0b24gaW5zdGFuY2VcclxuZXhwb3J0IGNvbnN0IHN0YXRlU3luY1NlcnZpY2UgPSBuZXcgU3RhdGVTeW5jU2VydmljZSgpOyJdfQ==