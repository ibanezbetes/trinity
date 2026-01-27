/**
 * State Synchronization Service
 * Handles full room state refresh when connections are restored
 * Ensures vote counts and progress are accurately synced
 */
export interface ConnectionInfo {
    userId: string;
    connectionId: string;
    roomId: string;
    connectedAt: string;
    lastSeen: string;
    userAgent?: string;
    reconnectionAttempts: number;
    status: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
}
export interface RoomSyncState {
    roomId: string;
    status: 'WAITING' | 'ACTIVE' | 'MATCHED' | 'COMPLETED';
    currentMovieId?: string;
    currentMovieInfo?: {
        title: string;
        genres: string[];
        year?: number;
        posterPath?: string;
    };
    totalMembers: number;
    activeConnections: number;
    votingProgress: {
        currentVotes: number;
        totalRequired: number;
        percentage: number;
        votingUsers: string[];
        pendingUsers: string[];
    };
    matchResult?: {
        movieId: string;
        movieTitle: string;
        foundAt: string;
    };
    lastSyncAt: string;
}
/**
 * State Synchronization Service
 * Manages connection state and room synchronization for real-time updates
 */
export declare class StateSyncService {
    private readonly CONNECTION_TIMEOUT_MS;
    private readonly MAX_RECONNECTION_ATTEMPTS;
    private readonly SYNC_DEBOUNCE_MS;
    private connections;
    private syncTimers;
    /**
     * Handle user connection to a room
     */
    handleUserConnection(roomId: string, userId: string, connectionId: string, userAgent?: string): Promise<void>;
    /**
     * Handle user disconnection from a room
     */
    handleUserDisconnection(roomId: string, userId: string, connectionId: string): Promise<void>;
    /**
     * Trigger full room state synchronization for a specific user or all users
     */
    triggerRoomStateSync(roomId: string, targetUserId?: string): Promise<void>;
    /**
     * Get comprehensive room state for synchronization
     */
    getComprehensiveRoomState(roomId: string): Promise<RoomSyncState>;
    /**
     * Get users who have voted for a specific movie
     */
    private getVotingUsers;
    /**
     * Get movie information for state sync
     */
    private getMovieInfo;
    /**
     * Update connection status in DynamoDB
     */
    private updateConnectionStatusInDB;
    /**
     * Update last sync timestamp for a room
     */
    private updateLastSyncTimestamp;
    /**
     * Clean up stale connections
     */
    private cleanupStaleConnection;
    /**
     * Get connection statistics for monitoring
     */
    getConnectionStats(roomId?: string): {
        totalConnections: number;
        activeConnections: number;
        disconnectedConnections: number;
        roomConnections?: {
            [roomId: string]: number;
        };
    };
    /**
     * Force sync all rooms (for maintenance or recovery)
     */
    forceSyncAllRooms(): Promise<void>;
}
export declare const stateSyncService: StateSyncService;
