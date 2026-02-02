/**
 * Room Extensions for Advanced Content Filtering
 *
 * This file extends the existing Room interface to support advanced content filtering
 * while maintaining backward compatibility with existing rooms.
 */
import { MediaType } from './content-filtering';
/**
 * Extended Room interface that includes optional filtering capabilities
 * while maintaining full backward compatibility with existing rooms
 */
export interface RoomWithFiltering {
    id: string;
    name: string;
    description?: string;
    status: string;
    resultMovieId?: string;
    hostId: string;
    inviteCode?: string;
    inviteUrl?: string;
    genrePreferences?: string[];
    mediaType?: MediaType;
    genreIds?: number[];
    genreNames?: string[];
    contentIds?: string[];
    currentContentIndex?: number;
    excludedContentIds?: string[];
    lastContentRefresh?: string;
    isActive: boolean;
    isPrivate: boolean;
    memberCount: number;
    maxMembers?: number;
    matchCount?: number;
    createdAt: string;
    updatedAt?: string;
}
/**
 * Extended input for creating rooms with filtering capabilities
 */
export interface CreateRoomWithFilteringInput {
    name: string;
    description?: string;
    isPrivate?: boolean;
    maxMembers?: number;
    mediaType: MediaType;
    genreIds: number[];
    genrePreferences?: string[];
}
/**
 * Operations for updating room content pool
 */
export interface ContentPoolUpdate {
    roomId: string;
    newContentIds: string[];
    excludeIds: string[];
    refreshTimestamp: string;
}
/**
 * Operations for tracking shown content
 */
export interface ShownContentUpdate {
    roomId: string;
    shownContentId: string;
    timestamp: string;
}
/**
 * Filters for querying rooms with specific criteria
 */
export interface RoomQueryFilters {
    mediaType?: MediaType;
    genreIds?: number[];
    isActive?: boolean;
    isPrivate?: boolean;
    hostId?: string;
    createdAfter?: string;
    createdBefore?: string;
}
/**
 * Statistics about room content and filtering
 */
export interface RoomContentStats {
    roomId: string;
    totalContentLoaded: number;
    contentShown: number;
    contentRemaining: number;
    averageVotingTime: number;
    filterEffectiveness: number;
    lastRefreshTime: string;
}
/**
 * Validates if a room has filtering enabled
 */
export declare function hasFilteringEnabled(room: RoomWithFiltering): boolean;
/**
 * Validates if a room is legacy (no filtering)
 */
export declare function isLegacyRoom(room: RoomWithFiltering): boolean;
/**
 * Gets the effective genre preferences for a room (new or legacy)
 */
export declare function getEffectiveGenres(room: RoomWithFiltering): string[];
/**
 * Checks if room needs content refresh
 */
export declare function needsContentRefresh(room: RoomWithFiltering): boolean;
