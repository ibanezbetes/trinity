/**
 * Test Utilities for TMDB Client Tests
 *
 * Common utilities and helpers for testing TMDB client functionality
 */
import { jest } from '@jest/globals';
/**
 * Creates a mock successful Response object for fetch
 */
export declare function createMockResponse(data: any, status?: number): Response;
/**
 * Creates a mock error Response object for fetch
 */
export declare function createMockErrorResponse(status: number, statusText: string, headerEntries?: [string, string][]): Response;
/**
 * Creates a mock TMDB discover response
 */
export declare function createMockDiscoverResponse(results?: any[], page?: number): any;
/**
 * Creates a mock TMDB movie object (transformed format)
 */
export declare function createMockMovie(id: number, overrides?: Partial<any>): any;
/**
 * Creates a mock TMDB TV show object (transformed format)
 */
export declare function createMockTVShow(id: number, overrides?: Partial<any>): any;
/**
 * Creates a mock TMDB genre response
 */
export declare function createMockGenreResponse(genres?: Array<{
    id: number;
    name: string;
}>): any;
/**
 * Sets up fetch mock with multiple successful responses
 */
export declare function mockMultipleSuccessResponses(mockFetch: jest.MockedFunction<typeof fetch>, responses: any[]): void;
/**
 * Sets up fetch mock with error response
 */
export declare function mockErrorResponse(mockFetch: jest.MockedFunction<typeof fetch>, status: number, statusText: string): void;
/**
 * Sets up fetch mock with rate limit response followed by success
 */
export declare function mockRateLimitThenSuccess(mockFetch: jest.MockedFunction<typeof fetch>, retryAfter: number, successData: any): void;
/**
 * Sets up fetch mock with network error
 */
export declare function mockNetworkError(mockFetch: jest.MockedFunction<typeof fetch>, errorMessage?: string): void;
/**
 * Asserts that a URL contains the expected endpoint
 */
export declare function assertEndpointCalled(mockFetch: jest.MockedFunction<typeof fetch>, expectedEndpoint: string, callIndex?: number): void;
/**
 * Asserts that a URL contains the expected query parameters
 */
export declare function assertQueryParams(mockFetch: jest.MockedFunction<typeof fetch>, expectedParams: Record<string, string>, callIndex?: number): void;
/**
 * Asserts that a URL does NOT contain specific parameters
 */
export declare function assertQueryParamsNotPresent(mockFetch: jest.MockedFunction<typeof fetch>, forbiddenParams: string[], callIndex?: number): void;
/**
 * Generates test genre IDs for different scenarios
 */
export declare const TEST_GENRE_IDS: {
    readonly SINGLE: readonly [28];
    readonly DOUBLE: readonly [28, 12];
    readonly TRIPLE: readonly [28, 12, 16];
    readonly COMEDY_DRAMA: readonly [35, 18];
    readonly FANTASY_ROMANCE: readonly [14, 10749];
};
/**
 * Generates test movie data with specific genre combinations
 */
export declare function generateMoviesWithGenres(count: number, genreIds: number[]): any[];
/**
 * Generates test TV show data with specific genre combinations
 */
export declare function generateTVShowsWithGenres(count: number, genreIds: number[]): any[];
import * as fc from 'fast-check';
import { MediaType, FilterCriteria, TMDBContent } from '../types/content-filtering';
/**
 * Generates a random TMDBContent object for property-based testing
 */
export declare function generateTMDBContent(): fc.Arbitrary<TMDBContent>;
/**
 * Generates a random FilterCriteria object for property-based testing
 */
export declare function generateFilterCriteria(): fc.Arbitrary<FilterCriteria>;
/**
 * Generates a TMDBContent object with specific genre IDs
 */
export declare function generateTMDBContentWithGenres(genreIds: number[]): fc.Arbitrary<TMDBContent>;
/**
 * Generates a FilterCriteria with specific constraints
 */
export declare function generateFilterCriteriaWithConstraints(mediaType?: MediaType, maxGenres?: number): fc.Arbitrary<FilterCriteria>;
/**
 * Generates a room ID string for testing
 */
export declare function generateRoomId(): fc.Arbitrary<string>;
/**
 * Generates an array of content IDs for exclusion testing
 */
export declare function generateContentIds(minLength?: number, maxLength?: number): fc.Arbitrary<string[]>;
/**
 * Creates a mock TMDB client for testing
 */
export declare function createMockTMDBClient(): any;
/**
 * Generates mock content for testing
 */
export declare function generateMockContent(count: number, mediaType: MediaType, genreIds?: number[]): TMDBContent[];
