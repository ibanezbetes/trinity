/**
 * Content Filtering Types
 *
 * Shared TypeScript interfaces and types for the advanced content filtering system
 */
export type MediaType = 'MOVIE' | 'TV';
export interface FilterCriteria {
    mediaType: MediaType;
    genres: number[];
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
    mediaType?: MediaType;
    genreIds?: number[];
    genrePreferences?: string[];
}
export interface UpdateRoomFiltersInput {
    mediaType?: MediaType;
    genreIds?: number[];
}
export declare class FilterValidationError extends Error {
    constructor(message: string);
}
export declare class ContentLoadingError extends Error {
    constructor(message: string);
}
export declare class FilterImmutabilityError extends Error {
    constructor(message: string);
}
