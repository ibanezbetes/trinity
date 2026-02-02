/**
 * Room Extensions for Advanced Content Filtering
 * 
 * This file extends the existing Room interface to support advanced content filtering
 * while maintaining backward compatibility with existing rooms.
 */

import { FilterCriteria, ContentPoolEntry, MediaType } from './content-filtering';

// ============================================================================
// Extended Room Interface
// ============================================================================

/**
 * Extended Room interface that includes optional filtering capabilities
 * while maintaining full backward compatibility with existing rooms
 */
export interface RoomWithFiltering {
  // ========================================
  // Existing Room Fields (from GraphQL schema)
  // ========================================
  id: string;
  name: string;
  description?: string;
  status: string;
  resultMovieId?: string;
  hostId: string;
  inviteCode?: string;
  inviteUrl?: string;
  
  // Legacy fields (deprecated but maintained for compatibility)
  genrePreferences?: string[];
  
  // ========================================
  // New Advanced Filtering Fields
  // ========================================
  
  // Core filtering configuration (optional for backward compatibility)
  mediaType?: MediaType;           // MOVIE or TV
  genreIds?: number[];             // TMDB genre IDs (max 3)
  genreNames?: string[];           // Human-readable genre names
  
  // Content pool management
  contentIds?: string[];           // IDs of the 30 pre-loaded titles
  currentContentIndex?: number;    // Current position in contentIds array
  excludedContentIds?: string[];   // IDs of titles already shown
  lastContentRefresh?: string;     // ISO timestamp of last content reload
  
  // Room state
  isActive: boolean;
  isPrivate: boolean;
  memberCount: number;
  maxMembers?: number;
  matchCount?: number;
  createdAt: string;               // ISO timestamp
  updatedAt?: string;              // ISO timestamp
}

// ============================================================================
// Room Creation Input Extensions
// ============================================================================

/**
 * Extended input for creating rooms with filtering capabilities
 */
export interface CreateRoomWithFilteringInput {
  name: string;
  description?: string;
  isPrivate?: boolean;
  maxMembers?: number;
  
  // Advanced filtering fields
  mediaType: MediaType;            // Required for new filtering system
  genreIds: number[];              // TMDB genre IDs (max 3)
  
  // Legacy field (deprecated but maintained for compatibility)
  genrePreferences?: string[];
}

// ============================================================================
// Room Update Operations
// ============================================================================

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

// ============================================================================
// Room Query Filters
// ============================================================================

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

// ============================================================================
// Room Statistics
// ============================================================================

/**
 * Statistics about room content and filtering
 */
export interface RoomContentStats {
  roomId: string;
  totalContentLoaded: number;
  contentShown: number;
  contentRemaining: number;
  averageVotingTime: number;
  filterEffectiveness: number;    // Percentage of content that matched filters
  lastRefreshTime: string;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates if a room has filtering enabled
 */
export function hasFilteringEnabled(room: RoomWithFiltering): boolean {
  return !!(room.mediaType && room.genreIds && room.genreIds.length > 0);
}

/**
 * Validates if a room is legacy (no filtering)
 */
export function isLegacyRoom(room: RoomWithFiltering): boolean {
  return !room.mediaType && !room.genreIds;
}

/**
 * Gets the effective genre preferences for a room (new or legacy)
 */
export function getEffectiveGenres(room: RoomWithFiltering): string[] {
  if (room.genreNames && room.genreNames.length > 0) {
    return room.genreNames;
  }
  
  if (room.genrePreferences && room.genrePreferences.length > 0) {
    return room.genrePreferences;
  }
  
  return [];
}

/**
 * Checks if room needs content refresh
 */
export function needsContentRefresh(room: RoomWithFiltering): boolean {
  if (!room.contentIds || !room.currentContentIndex) {
    return true;
  }
  
  const remaining = room.contentIds.length - room.currentContentIndex;
  return remaining < 5; // Refresh when fewer than 5 titles remaining
}