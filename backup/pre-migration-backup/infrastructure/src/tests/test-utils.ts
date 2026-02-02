/**
 * Test Utilities for TMDB Client Tests
 * 
 * Common utilities and helpers for testing TMDB client functionality
 */

import { jest } from '@jest/globals';

// ============================================================================
// Mock Response Helpers
// ============================================================================

/**
 * Creates a mock successful Response object for fetch
 */
export function createMockResponse(data: any, status: number = 200): Response {
  const headers = new Headers();
  
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers,
    url: 'https://api.themoviedb.org/3/test',
    redirected: false,
    type: 'basic',
    clone: jest.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: jest.fn(),
    blob: jest.fn(),
    formData: jest.fn(),
    bytes: jest.fn()
  } as Response;
}

/**
 * Creates a mock error Response object for fetch
 */
export function createMockErrorResponse(status: number, statusText: string, headerEntries?: [string, string][]): Response {
  const headers = new Headers();
  if (headerEntries) {
    headerEntries.forEach(([key, value]) => headers.set(key, value));
  }
  
  return {
    ok: false,
    status,
    statusText,
    json: async () => { throw new Error('Response not ok'); },
    text: async () => statusText,
    headers,
    url: 'https://api.themoviedb.org/3/test',
    redirected: false,
    type: 'basic',
    clone: jest.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: jest.fn(),
    blob: jest.fn(),
    formData: jest.fn(),
    bytes: jest.fn()
  } as Response;
}

/**
 * Creates a mock TMDB discover response
 */
export function createMockDiscoverResponse(results: any[] = [], page: number = 1): any {
  return {
    page,
    results,
    total_pages: Math.ceil(results.length / 20),
    total_results: results.length
  };
}

/**
 * Creates a mock TMDB movie object (transformed format)
 */
export function createMockMovie(id: number, overrides: Partial<any> = {}): any {
  return {
    id: id.toString(), // Convert to string like the transformer does
    title: `Test Movie ${id}`,
    overview: 'Test overview',
    genre_ids: [28, 12],
    vote_average: 7.5,
    release_date: '2023-01-01',
    poster_path: '/test-poster.jpg',
    ...overrides
  };
}

/**
 * Creates a mock TMDB TV show object (transformed format)
 */
export function createMockTVShow(id: number, overrides: Partial<any> = {}): any {
  return {
    id: id.toString(), // Convert to string like the transformer does
    name: `Test TV Show ${id}`,
    overview: 'Test TV overview',
    genre_ids: [35, 18],
    vote_average: 8.2,
    first_air_date: '2023-01-01',
    poster_path: '/test-tv-poster.jpg',
    ...overrides
  };
}

/**
 * Creates a mock TMDB genre response
 */
export function createMockGenreResponse(genres: Array<{ id: number; name: string }> = []): any {
  return {
    genres
  };
}

// ============================================================================
// Mock Setup Helpers
// ============================================================================

/**
 * Sets up fetch mock with multiple successful responses
 */
export function mockMultipleSuccessResponses(mockFetch: jest.MockedFunction<typeof fetch>, responses: any[]): void {
  responses.forEach(response => {
    mockFetch.mockResolvedValueOnce(createMockResponse(response));
  });
}

/**
 * Sets up fetch mock with error response
 */
export function mockErrorResponse(mockFetch: jest.MockedFunction<typeof fetch>, status: number, statusText: string): void {
  mockFetch.mockResolvedValueOnce(createMockErrorResponse(status, statusText));
}

/**
 * Sets up fetch mock with rate limit response followed by success
 */
export function mockRateLimitThenSuccess(
  mockFetch: jest.MockedFunction<typeof fetch>, 
  retryAfter: number, 
  successData: any
): void {
  mockFetch.mockResolvedValueOnce(
    createMockErrorResponse(429, 'Too Many Requests', [['Retry-After', retryAfter.toString()]])
  );
  mockFetch.mockResolvedValueOnce(createMockResponse(successData));
}

/**
 * Sets up fetch mock with network error
 */
export function mockNetworkError(mockFetch: jest.MockedFunction<typeof fetch>, errorMessage: string = 'Network error'): void {
  mockFetch.mockRejectedValueOnce(new Error(errorMessage));
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Asserts that a URL contains the expected endpoint
 */
export function assertEndpointCalled(mockFetch: jest.MockedFunction<typeof fetch>, expectedEndpoint: string, callIndex: number = 0): void {
  expect(mockFetch).toHaveBeenCalled();
  const calledUrl = mockFetch.mock.calls[callIndex][0] as string;
  expect(calledUrl).toContain(expectedEndpoint);
}

/**
 * Asserts that a URL contains the expected query parameters
 */
export function assertQueryParams(mockFetch: jest.MockedFunction<typeof fetch>, expectedParams: Record<string, string>, callIndex: number = 0): void {
  expect(mockFetch).toHaveBeenCalled();
  const calledUrl = mockFetch.mock.calls[callIndex][0] as string;
  
  Object.entries(expectedParams).forEach(([key, value]) => {
    const encodedValue = encodeURIComponent(value);
    expect(calledUrl).toContain(`${key}=${encodedValue}`);
  });
}

/**
 * Asserts that a URL does NOT contain specific parameters
 */
export function assertQueryParamsNotPresent(mockFetch: jest.MockedFunction<typeof fetch>, forbiddenParams: string[], callIndex: number = 0): void {
  expect(mockFetch).toHaveBeenCalled();
  const calledUrl = mockFetch.mock.calls[callIndex][0] as string;
  
  forbiddenParams.forEach(param => {
    expect(calledUrl).not.toContain(param);
  });
}

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generates test genre IDs for different scenarios
 */
export const TEST_GENRE_IDS = {
  SINGLE: [28], // Action
  DOUBLE: [28, 12], // Action, Adventure
  TRIPLE: [28, 12, 16], // Action, Adventure, Animation
  COMEDY_DRAMA: [35, 18], // Comedy, Drama
  FANTASY_ROMANCE: [14, 10749] // Fantasy, Romance
} as const;

/**
 * Generates test movie data with specific genre combinations
 */
export function generateMoviesWithGenres(count: number, genreIds: number[]): any[] {
  return Array.from({ length: count }, (_, index) => 
    createMockMovie(100 + index, { genre_ids: genreIds })
  );
}

/**
 * Generates test TV show data with specific genre combinations
 */
export function generateTVShowsWithGenres(count: number, genreIds: number[]): any[] {
  return Array.from({ length: count }, (_, index) => 
    createMockTVShow(200 + index, { genre_ids: genreIds })
  );
}

// ============================================================================
// Fast-Check Generators for Property-Based Testing
// ============================================================================

import * as fc from 'fast-check';
import { MediaType, FilterCriteria, TMDBContent, CONTENT_FILTERING_CONSTANTS } from '../types/content-filtering';

/**
 * Generates a random TMDBContent object for property-based testing
 */
export function generateTMDBContent(): fc.Arbitrary<TMDBContent> {
  return fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    title: fc.string({ minLength: 1, maxLength: 100 }),
    poster_path: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
    overview: fc.string({ minLength: 0, maxLength: 500 }),
    genre_ids: fc.array(fc.integer({ min: 1, max: 999 }), { minLength: 0, maxLength: 10 }),
    vote_average: fc.float({ min: 0, max: 10 }),
    release_date: fc.option(fc.string({ minLength: 10, maxLength: 10 })) // YYYY-MM-DD format
  });
}

/**
 * Generates a random FilterCriteria object for property-based testing
 */
export function generateFilterCriteria(): fc.Arbitrary<FilterCriteria> {
  return fc.record({
    mediaType: fc.constantFrom(MediaType.MOVIE, MediaType.TV),
    genreIds: fc.array(
      fc.integer({ min: 1, max: 999 }),
      { minLength: 0, maxLength: CONTENT_FILTERING_CONSTANTS.MAX_GENRES_PER_ROOM }
    ),
    roomId: fc.string({ minLength: 1, maxLength: 50 })
  });
}

/**
 * Generates a TMDBContent object with specific genre IDs
 */
export function generateTMDBContentWithGenres(genreIds: number[]): fc.Arbitrary<TMDBContent> {
  return fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    title: fc.string({ minLength: 1, maxLength: 100 }),
    poster_path: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
    overview: fc.string({ minLength: 0, maxLength: 500 }),
    genre_ids: fc.constant(genreIds),
    vote_average: fc.float({ min: 0, max: 10 }),
    release_date: fc.option(fc.string({ minLength: 10, maxLength: 10 }))
  });
}

/**
 * Generates a FilterCriteria with specific constraints
 */
export function generateFilterCriteriaWithConstraints(
  mediaType?: MediaType,
  maxGenres?: number
): fc.Arbitrary<FilterCriteria> {
  return fc.record({
    mediaType: mediaType ? fc.constant(mediaType) : fc.constantFrom(MediaType.MOVIE, MediaType.TV),
    genreIds: fc.array(
      fc.integer({ min: 1, max: 999 }),
      { minLength: 0, maxLength: maxGenres || CONTENT_FILTERING_CONSTANTS.MAX_GENRES_PER_ROOM }
    ),
    roomId: fc.string({ minLength: 1, maxLength: 50 })
  });
}

/**
 * Generates a room ID string for testing
 */
export function generateRoomId(): fc.Arbitrary<string> {
  return fc.string({ minLength: 1, maxLength: 50 });
}

/**
 * Generates an array of content IDs for exclusion testing
 */
export function generateContentIds(minLength: number = 0, maxLength: number = 20): fc.Arbitrary<string[]> {
  return fc.array(
    fc.string({ minLength: 1, maxLength: 20 }),
    { minLength, maxLength }
  );
}

// ============================================================================
// Mock TMDB Client for Testing
// ============================================================================

/**
 * Creates a mock TMDB client for testing
 */
export function createMockTMDBClient(): any {
  return {
    discoverMovies: jest.fn(),
    discoverTV: jest.fn(),
    discover: jest.fn(),
    getMovieGenres: jest.fn(),
    getTVGenres: jest.fn(),
    getGenres: jest.fn(),
    getMovieDetails: jest.fn(),
    getTVDetails: jest.fn(),
    discoverMultiplePages: jest.fn(),
    getContentWithAllGenres: jest.fn(),
    getContentWithAnyGenre: jest.fn(),
    getPopularContent: jest.fn()
  };
}

/**
 * Generates mock content for testing
 */
export function generateMockContent(
  count: number, 
  mediaType: MediaType, 
  genreIds: number[] = []
): TMDBContent[] {
  return Array.from({ length: count }, (_, index) => {
    const baseGenres = genreIds.length > 0 ? genreIds : [28, 12]; // Default to Action, Adventure
    
    // Add some variety in genre combinations
    const contentGenres = index % 3 === 0 
      ? baseGenres // Some content has all requested genres
      : index % 2 === 0 
        ? [baseGenres[0]] // Some content has partial genres
        : [35, 18]; // Some content has different genres (Comedy, Drama)
    
    return {
      id: (1000 + index).toString(),
      title: mediaType === MediaType.MOVIE 
        ? `Test Movie ${index + 1}` 
        : `Test TV Show ${index + 1}`,
      poster_path: `/test-poster-${index}.jpg`,
      overview: `Test overview for content ${index + 1}`,
      genre_ids: contentGenres,
      vote_average: 5.0 + (index % 5), // Vary ratings from 5.0 to 9.0
      release_date: `202${(index % 4)}-01-01`
    };
  });
}