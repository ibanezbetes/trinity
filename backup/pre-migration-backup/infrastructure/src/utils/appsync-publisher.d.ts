/**
 * Enhanced AppSync Real-time Event Publisher
 * Publishes events to AppSync subscriptions for real-time updates with detailed progress information
 */
export interface MatchFoundEvent {
    id: string;
    timestamp: string;
    roomId: string;
    eventType: 'MATCH_FOUND';
    matchId: string;
    mediaId: string;
    mediaTitle: string;
    participants: ParticipantInfo[];
    consensusType: 'UNANIMOUS' | 'MAJORITY';
    matchDetails: {
        totalVotesRequired: number;
        finalVoteCount: number;
        votingDuration: number;
        movieGenres: string[];
        movieYear?: number;
        movieRating?: number;
    };
}
export interface VoteUpdateEvent {
    id: string;
    timestamp: string;
    roomId: string;
    eventType: 'VOTE_UPDATE';
    userId: string;
    mediaId: string;
    voteType: 'LIKE' | 'DISLIKE' | 'SKIP';
    progress: {
        totalVotes: number;
        likesCount: number;
        dislikesCount: number;
        skipsCount: number;
        remainingUsers: number;
        percentage: number;
        votingUsers: string[];
        pendingUsers: string[];
        estimatedTimeToComplete?: number;
    };
    movieInfo: {
        title: string;
        genres: string[];
        year?: number;
        posterPath?: string;
    };
}
export interface ConnectionStatusEvent {
    id: string;
    timestamp: string;
    roomId: string;
    eventType: 'CONNECTION_STATUS';
    userId: string;
    status: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTED';
    connectionId: string;
    metadata: {
        userAgent?: string;
        lastSeen: string;
        reconnectionAttempts?: number;
    };
}
export interface RoomStateEvent {
    id: string;
    timestamp: string;
    roomId: string;
    eventType: 'ROOM_STATE_SYNC';
    roomState: {
        status: 'WAITING' | 'ACTIVE' | 'MATCHED' | 'COMPLETED';
        currentMovieId?: string;
        currentMovieInfo?: {
            title: string;
            genres: string[];
            posterPath?: string;
        };
        totalMembers: number;
        activeConnections: number;
        votingProgress: {
            currentVotes: number;
            totalRequired: number;
            percentage: number;
        };
        matchResult?: {
            movieId: string;
            movieTitle: string;
            foundAt: string;
        };
    };
}
export interface ParticipantInfo {
    userId: string;
    displayName?: string;
    isHost: boolean;
    connectionStatus: 'CONNECTED' | 'DISCONNECTED';
    lastSeen: string;
    hasVoted: boolean;
}
/**
 * Publish Match Found event to all room subscribers with detailed participant information
 */
export declare function publishMatchFoundEvent(roomId: string, movieId: string, movieTitle: string, participants: string[], votingStartTime?: Date): Promise<void>;
/**
 * Publish Vote Update event to room subscribers with detailed progress information
 */
export declare function publishVoteUpdateEvent(roomId: string, userId: string, movieId: string, voteType: 'LIKE' | 'DISLIKE' | 'SKIP', currentVotes: number, totalMembers: number): Promise<void>;
/**
 * Publish connection status event for monitoring user connections
 */
export declare function publishConnectionStatusEvent(roomId: string, userId: string, status: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTED', connectionId: string, metadata?: {
    userAgent?: string;
    reconnectionAttempts?: number;
}): Promise<void>;
/**
 * Publish room state synchronization event for reconnected users
 */
export declare function publishRoomStateSyncEvent(roomId: string, targetUserId?: string): Promise<void>;
export declare function getMovieTitle(movieId: string): Promise<string>;
