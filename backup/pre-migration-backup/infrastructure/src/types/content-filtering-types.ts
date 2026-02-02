/**
 * Content Filtering Types
 * 
 * Shared TypeScript interfaces and types for the advanced content filtering system
 */

export type MediaType = 'MOVIE' | 'TV';

export interface FilterCriteria {
  mediaType: MediaType;
  genres: number[];  // Maximum 3 genres
  roomId: string;
}

export interface ContentPoolEntry {
  tmdbId: string;
  mediaType: MediaType;
  title: string;
  posterPath?: string;
  overview: string;
  genreIds: number[];
  voteAverage: number;
  releaseDate: string;
  priority: 1 | 2 | 3;
  addedAt: Date;
}

export interface Genre {
  id: number;
  name: string;
  mediaType: MediaType;
}

export interface Room {
  id: string;
  name: string;
  description?: string;
  hostId: string;
  inviteCode: string;
  isActive: boolean;
  isPrivate: boolean;
  memberCount: number;
  maxMembers?: number;
  
  // New filtering fields
  mediaType?: MediaType;
  genreIds?: number[];
  genreNames?: string[];
  filterCriteria?: FilterCriteria;
  contentPool?: ContentPoolEntry[];
  excludedContentIds?: string[];
  lastContentRefresh?: Date;
  
  createdAt: Date;
  updatedAt?: Date;
}

export interface CreateRoomInput {
  name: string;
  description?: string;
  isPrivate?: boolean;
  maxMembers?: number;
  mediaType?: MediaType; // Make optional for backward compatibility
  genreIds?: number[]; // Make optional for backward compatibility
  genrePreferences?: string[]; // DEPRECATED: Legacy field for backward compatibility
}

export interface UpdateRoomFiltersInput {
  mediaType?: MediaType;
  genreIds?: number[];
}

// Error types
export class FilterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterValidationError';
  }
}

export class ContentLoadingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentLoadingError';
  }
}

export class FilterImmutabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterImmutabilityError';
  }
}