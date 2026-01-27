/**
 * Unit Tests: TMDB Client Error Handling
 * 
 * Tests API failures, rate limiting, network timeouts, and response validation
 * for the Enhanced TMDB Client implementation.
 * 
 * **Validates: Requirements 4.6**
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MediaType, ContentFilteringError, ErrorCodes } from '../types/content-filtering';
import { EnhancedTMDBClientImpl, TMDBClientFactory } from '../services/enhanced-tmdb-client';
import { TMDBApiError, TMDBRateLimitError, TMDBDiscoverParams } from '../types/tmdb-client';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock setTimeout for retry delay testing
const mockSetTimeout = jest.fn((callback: () => void, delay: number) => {
  // Execute callback immediately for testing
  callback();
  return 123; // Mock timer ID
});
global.setTimeout = mockSetTimeout as any;

describe('TMDB Client Error Handling', () => {
  let client: EnhancedTMDBClientImpl;
  const mockApiKey = 'test-api-key-12345';
  
  beforeEach(() => {
    client = TMDBClientFactory.create({ 
      apiKey: mockApiKey,
      retryAttempts: 3,
      retryDelay: 100
    }) as EnhancedTMDBClientImpl;
    mockFetch.mockClear();
    mockSetTimeout.mockClear();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  // ============================================================================
  // API Failure Tests
  // ============================================================================
  
  test('should handle 404 Not Found errors', async () => {
    // Arrange: Mock 404 response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers()
    });
    
    // Act & Assert: Should throw ContentFilteringError
    await expect(
      client.discover(MediaType.MOVIE, { page: 1 })
    ).rejects.toThrow(ContentFilteringError);
    
    await expect(
      client.discover(MediaType.MOVIE, { page: 1 })
    ).rejects.toThrow('Failed to discover MOVIE content');
  });
  
  test('should handle 401 Unauthorized errors (invalid API key)', async () => {
    // Arrange: Mock 401 response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers()
    });
    
    // Act & Assert: Should throw ContentFilteringError
    await expect(
      client.getMovieGenres()
    ).rejects.toThrow(ContentFilteringError);
    
    await expect(
      client.getMovieGenres()
    ).rejects.toThrow('Failed to fetch MOVIE genres');
  });
  
  test('should handle 500 Internal Server Error', async () => {
    // Arrange: Mock 500 response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers()
    });
    
    // Act & Assert: Should throw ContentFilteringError
    await expect(
      client.getTVGenres()
    ).rejects.toThrow(ContentFilteringError);
  });
  
  test('should handle malformed JSON responses', async () => {
    // Arrange: Mock response with invalid JSON
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token in JSON');
      },
      headers: new Headers()
    });
    
    // Act & Assert: Should throw ContentFilteringError
    await expect(
      client.discover(MediaType.TV, { page: 1 })
    ).rejects.toThrow(ContentFilteringError);
  });
  
  test('should handle missing required fields in API response', async () => {
    // Arrange: Mock response with missing results field
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        page: 1,
        // Missing 'results' field
        total_pages: 1,
        total_results: 0
      }),
      headers: new Headers()
    });
    
    // Act: Should handle gracefully and return empty array
    const result = await client.discover(MediaType.MOVIE, { page: 1 });
    
    // Assert: Should return empty array instead of throwing
    expect(result).toEqual([]);
  });
  
  // ============================================================================
  // Rate Limiting Tests
  // ============================================================================
  
  test('should handle 429 Rate Limit errors with Retry-After header', async () => {
    // Arrange: Mock rate limit response followed by success
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers([['Retry-After', '2']])
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          page: 1,
          results: [],
          total_pages: 1,
          total_results: 0
        }),
        headers: new Headers()
      });
    
    // Act: Should retry after rate limit
    const result = await client.discover(MediaType.MOVIE, { page: 1 });
    
    // Assert: Should succeed after retry
    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
  
  test('should handle 429 Rate Limit errors without Retry-After header', async () => {
    // Arrange: Mock rate limit response without Retry-After header
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers() // No Retry-After header
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          page: 1,
          results: [],
          total_pages: 1,
          total_results: 0
        }),
        headers: new Headers()
      });
    
    // Act: Should retry with default delay
    const result = await client.discover(MediaType.TV, { page: 1 });
    
    // Assert: Should succeed after retry with default 60s delay
    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
  
  test('should fail after max retry attempts on persistent rate limiting', async () => {
    // Arrange: Mock persistent rate limiting (all attempts fail)
    for (let i = 0; i < 3; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers([['Retry-After', '1']])
      });
    }
    
    // Act & Assert: Should throw after max retries
    await expect(
      client.discover(MediaType.MOVIE, { page: 1 })
    ).rejects.toThrow(ContentFilteringError);
    
    // Should have attempted all retries
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
  
  // ============================================================================
  // Network Timeout Tests
  // ============================================================================
  
  test('should handle network timeouts', async () => {
    // Arrange: Mock network timeout
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));
    
    // Act & Assert: Should throw ContentFilteringError
    await expect(
      client.discover(MediaType.MOVIE, { page: 1 })
    ).rejects.toThrow(ContentFilteringError);
  });
  
  test('should retry on network failures', async () => {
    // Arrange: Mock network failure followed by success
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          page: 1,
          results: [
            {
              id: 123,
              title: 'Test Movie',
              overview: 'Test',
              genre_ids: [28],
              vote_average: 7.0,
              release_date: '2023-01-01'
            }
          ],
          total_pages: 1,
          total_results: 1
        }),
        headers: new Headers()
      });
    
    // Act: Should succeed after retry
    const result = await client.discover(MediaType.MOVIE, { page: 1 });
    
    // Assert: Should return successful result
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test Movie');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    
    // Verify retry delay was applied
    expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 100);
  });
  
  test('should fail after max retry attempts on persistent network failures', async () => {
    // Arrange: Mock persistent network failures
    for (let i = 0; i < 3; i++) {
      mockFetch.mockRejectedValueOnce(new Error('Persistent network error'));
    }
    
    // Act & Assert: Should throw after max retries
    await expect(
      client.discover(MediaType.TV, { page: 1 })
    ).rejects.toThrow('Persistent network error');
    
    // Should have attempted all retries
    expect(mockFetch).toHaveBeenCalledTimes(3);
    
    // Verify exponential backoff (delay increases with each attempt)
    expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 100); // First retry
    expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 200); // Second retry
  });
  
  // ============================================================================
  // Response Validation Tests
  // ============================================================================
  
  test('should handle empty results gracefully', async () => {
    // Arrange: Mock empty results
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        page: 1,
        results: [],
        total_pages: 1,
        total_results: 0
      }),
      headers: new Headers()
    });
    
    // Act: Should handle empty results
    const result = await client.discover(MediaType.MOVIE, { page: 1 });
    
    // Assert: Should return empty array
    expect(result).toEqual([]);
  });
  
  test('should handle null/undefined fields in content items', async () => {
    // Arrange: Mock response with null/undefined fields
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        page: 1,
        results: [
          {
            id: 123,
            title: null, // Null title
            overview: undefined, // Undefined overview
            genre_ids: null, // Null genre_ids
            vote_average: null, // Null vote_average
            release_date: '', // Empty release_date
            poster_path: null // Null poster_path
          }
        ],
        total_pages: 1,
        total_results: 1
      }),
      headers: new Headers()
    });
    
    // Act: Should handle null/undefined fields gracefully
    const result = await client.discover(MediaType.MOVIE, { page: 1 });
    
    // Assert: Should provide default values
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Unknown Movie'); // Default title
    expect(result[0].overview).toBe('No description available'); // Default overview
    expect(result[0].genre_ids).toEqual([]); // Default empty array
    expect(result[0].vote_average).toBe(0); // Default rating
    expect(result[0].poster_path).toBeUndefined(); // Undefined poster
  });
  
  test('should handle invalid content transformation', async () => {
    // Arrange: Mock response with completely invalid content structure
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        page: 1,
        results: [
          'invalid-string-instead-of-object',
          null,
          { /* missing required id field */ },
          {
            id: 'invalid-id-type', // String instead of number
            title: 123, // Number instead of string
            genre_ids: 'invalid-array' // String instead of array
          }
        ],
        total_pages: 1,
        total_results: 4
      }),
      headers: new Headers()
    });
    
    // Act: Should handle invalid content gracefully
    const result = await client.discover(MediaType.MOVIE, { page: 1 });
    
    // Assert: Should filter out invalid items or provide defaults
    expect(Array.isArray(result)).toBe(true);
    // The exact behavior depends on implementation - it should not crash
  });
  
  // ============================================================================
  // Genre-specific Error Handling Tests
  // ============================================================================
  
  test('should handle genre API failures gracefully', async () => {
    // Arrange: Mock genre API failure
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers()
    });
    
    // Act & Assert: Should throw ContentFilteringError
    await expect(
      client.getMovieGenres()
    ).rejects.toThrow(ContentFilteringError);
    
    await expect(
      client.getMovieGenres()
    ).rejects.toThrow('Failed to fetch MOVIE genres');
  });
  
  test('should handle empty genre list', async () => {
    // Arrange: Mock empty genre response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        genres: []
      }),
      headers: new Headers()
    });
    
    // Act: Should handle empty genre list
    const result = await client.getTVGenres();
    
    // Assert: Should return empty array
    expect(result).toEqual([]);
  });
  
  test('should handle malformed genre data', async () => {
    // Arrange: Mock malformed genre response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        genres: [
          { id: 28, name: 'Action' }, // Valid
          { id: null, name: 'Invalid' }, // Invalid ID
          { id: 35 }, // Missing name
          null, // Null genre
          'invalid-genre-string' // Invalid type
        ]
      }),
      headers: new Headers()
    });
    
    // Act: Should handle malformed data gracefully
    const result = await client.getMovieGenres();
    
    // Assert: Should filter out invalid genres or provide defaults
    expect(Array.isArray(result)).toBe(true);
    // Should contain at least the valid genre
    const validGenres = result.filter(g => g && g.id === 28 && g.name === 'Action');
    expect(validGenres).toHaveLength(1);
  });
  
  // ============================================================================
  // Configuration Error Tests
  // ============================================================================
  
  test('should throw error when API key is missing', () => {
    // Act & Assert: Should throw error during construction
    expect(() => {
      TMDBClientFactory.create({ apiKey: '' });
    }).toThrow(ContentFilteringError);
    
    expect(() => {
      TMDBClientFactory.create({ apiKey: '' });
    }).toThrow('TMDB API key is required');
  });
  
  test('should handle invalid base URL configuration', async () => {
    // Arrange: Create client with invalid base URL
    const invalidClient = TMDBClientFactory.create({
      apiKey: mockApiKey,
      baseUrl: 'invalid-url'
    }) as EnhancedTMDBClientImpl;
    
    // Mock fetch to throw URL error
    mockFetch.mockRejectedValueOnce(new TypeError('Invalid URL'));
    
    // Act & Assert: Should handle URL construction errors
    await expect(
      invalidClient.discover(MediaType.MOVIE, { page: 1 })
    ).rejects.toThrow(ContentFilteringError);
  });
  
  // ============================================================================
  // Batch Operation Error Handling Tests
  // ============================================================================
  
  test('should handle partial failures in multi-page requests', async () => {
    // Arrange: Mock mixed success/failure responses
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          page: 1,
          results: [{ id: 1, title: 'Movie 1', overview: 'Test', genre_ids: [28], vote_average: 7.0, release_date: '2023-01-01' }],
          total_pages: 3,
          total_results: 3
        }),
        headers: new Headers()
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers()
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          page: 3,
          results: [{ id: 3, title: 'Movie 3', overview: 'Test', genre_ids: [28], vote_average: 7.0, release_date: '2023-01-01' }],
          total_pages: 3,
          total_results: 3
        }),
        headers: new Headers()
      });
    
    // Act & Assert: Should throw on any page failure
    await expect(
      client.discoverMultiplePages(MediaType.MOVIE, { page: 1 }, 3)
    ).rejects.toThrow(ContentFilteringError);
    
    // All requests should have been attempted
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
  
  test('should handle empty results in getContentWithAllGenres', async () => {
    // Arrange: Mock empty results for all pages
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          page: i + 1,
          results: [],
          total_pages: 5,
          total_results: 0
        }),
        headers: new Headers()
      });
    }
    
    // Act: Should handle empty results gracefully
    const result = await client.getContentWithAllGenres(MediaType.MOVIE, [28, 12], 10);
    
    // Assert: Should return empty array
    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });
});
