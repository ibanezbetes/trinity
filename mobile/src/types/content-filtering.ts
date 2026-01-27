/**
 * Content Filtering Types
 * 
 * TypeScript interfaces for the advanced content filtering system.
 * Defines types for media selection, genre filtering, and room creation.
 */

export type MediaType = 'MOVIE' | 'TV';

export interface Genre {
  id: number;
  name: string;
}

export interface FilterCriteria {
  mediaType: MediaType;
  genreIds: number[];
  roomId: string;
}

export interface CreateRoomWithFiltersInput {
  name: string;
  description?: string;
  mediaType: MediaType;
  genreIds: number[];
  isPrivate?: boolean;
  maxMembers?: number;
}

export interface UpdateRoomFiltersInput {
  mediaType: MediaType;
  genreIds: number[];
}

export interface RoomWithFilters {
  id: string;
  name: string;
  description?: string;
  mediaType: MediaType;
  genreIds: number[];
  genreNames: string[];
  filterCriteria: FilterCriteria;
  isPrivate?: boolean;
  maxMembers?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface FilterSummary {
  hasFilters: boolean;
  isLegacy: boolean;
  mediaType?: MediaType;
  genreCount: number;
  genreNames: string[];
}

export interface ContentFilteringError extends Error {
  code: string;
  suggestion?: {
    action: string;
    message: string;
    currentFilters?: {
      mediaType: MediaType;
      genreIds: number[];
      genreNames?: string[];
    };
    requestedFilters?: {
      mediaType: MediaType;
      genreIds: number[];
    };
  };
}

export interface FormValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CreateRoomFormData {
  name?: string;
  description?: string;
  mediaType?: MediaType;
  genreIds?: number[];
  isPrivate?: boolean;
  maxMembers?: number;
}

export const MAX_GENRES = 3;

export interface GenreSelectorProps {
  mediaType?: MediaType;
  selectedGenreIds: number[];
  onGenreSelectionChange: (genreIds: number[]) => void;
  maxGenres?: number;
  disabled?: boolean;
  error?: string;
}

export interface FilterSummaryProps {
  mediaType?: MediaType;
  genreIds?: number[];
  genreNames?: string[];
  onClear?: () => void;
  showClearButton?: boolean;
  compact?: boolean;
}