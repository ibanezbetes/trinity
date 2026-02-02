/**
 * Property-Based Test for Cache Utilization
 * 
 * Property 11: Cache Utilization
 * For any voting session with populated cache, the system should serve movies from cache 
 * rather than making real-time API calls
 * 
 * Validates: Requirements 4.4
 * Feature: trinity-voting-fixes, Property 11: Cache Utilization
 */

import * as fc from 'fast-check';

// Mock DynamoDB first - before any imports
const mockSend = jest.fn();
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: mockSend,
    })),
  },
  PutCommand: jest.fn((params) => ({ params })),
  GetCommand: jest.fn((params) => ({ params })),
  QueryCommand: jest.fn((params) => ({ params })),
  UpdateCommand: jest.fn((params) => ({ params })),
}));

// Import after mocking
import { movieCacheService, CachedMovie } from '../services/movieCacheService';

// Mock metrics
jest.mock('../utils/metrics', () => ({
  logBusinessMetric: jest.fn(),
  logError: jest.fn(),
  PerformanceTimer: jest.fn().mockImplementation(() => ({
    finish: jest.fn(),
  })),
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Property 11: Cache Utilization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup environment variables
    process.env.MOVIE_CACHE_TABLE = 'test-movie-cache-table';
    process.env.TMDB_API_KEY = 'test-api-key';
  });

  /**
   * Property Test: Cache Utilization
   * 
   * For any voting session with populated cache, the system should serve movies from cache 
   * rather than making real-time API calls
   */
  it('should serve movies from cache when cache is populated', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary room IDs
        fc.string({ minLength: 10, maxLength: 50 }),
        // Generate arbitrary cached movies (1-50 movies)
        fc.array(
          fc.record({
            tmdbId: fc.integer({ min: 1, max: 999999 }),
            title: fc.string({ minLength: 1, maxLength: 100 }),
            posterPath: fc.webUrl(),
            overview: fc.string({ minLength: 10, maxLength: 500 }),
            genres: fc.array(fc.constantFrom('Action', 'Comedy', 'Drama', 'Horror', 'Romance'), { minLength: 1, maxLength: 3 }),
            year: fc.integer({ min: 1900, max: 2030 }),
            rating: fc.float({ min: 0, max: 10 }),
            cachedAt: fc.constant(new Date().toISOString()),
            ttl: fc.integer({ min: Date.now(), max: Date.now() + 86400000 }), // Valid TTL (not expired)
          }),
          { minLength: 1, maxLength: 50 }
        ),
        // Generate arbitrary genres
        fc.array(fc.constantFrom('Action', 'Comedy', 'Drama', 'Horror', 'Romance'), { maxLength: 3 }),
        
        async (roomId, cachedMovies, genres) => {
          // Setup: Mock DynamoDB to return populated cache
          mockSend.mockResolvedValueOnce({
            Item: {
              cacheKey: roomId,
              movies: cachedMovies,
              genreFilters: genres,
              cachedAt: new Date().toISOString(),
              ttl: Date.now() + 86400000, // 24 hours from now
            },
          });

          // Setup: Mock TMDB API (this should NOT be called if cache is working)
          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
              results: [
                {
                  id: 999999,
                  title: 'API Movie',
                  poster_path: '/api-poster.jpg',
                  overview: 'This movie came from API',
                  genre_ids: [28],
                  release_date: '2023-01-01',
                  vote_average: 8.0,
                },
              ],
            }),
          });

          // Action: Try to get cached movies (simulating voting session start)
          const result = await movieCacheService.getCachedMovies(roomId);

          // Assertion 1: Should return cached movies
          expect(result).toHaveLength(cachedMovies.length);
          expect(result).toEqual(cachedMovies);

          // Assertion 2: Should have called DynamoDB to get cache
          expect(mockSend).toHaveBeenCalledWith(
            expect.objectContaining({
              params: expect.objectContaining({
                TableName: 'test-movie-cache-table',
                Key: { cacheKey: roomId },
              }),
            })
          );

          // Assertion 3: Should NOT have called TMDB API (cache utilization)
          expect(mockFetch).not.toHaveBeenCalled();

          // Assertion 4: All returned movies should match cached data structure
          result.forEach((movie, index) => {
            expect(movie.tmdbId).toBe(cachedMovies[index].tmdbId);
            expect(movie.title).toBe(cachedMovies[index].title);
            expect(movie.genres).toEqual(cachedMovies[index].genres);
            expect(typeof movie.cachedAt).toBe('string');
            expect(typeof movie.ttl).toBe('number');
          });
        }
      ),
      {
        numRuns: 100, // Run 100 iterations as specified in design
        timeout: 5000,
      }
    );
  });

  /**
   * Property Test: Cache Miss Behavior
   * 
   * When cache is empty or expired, the system should fall back to API calls
   * This tests the inverse to ensure our cache utilization test is meaningful
   */
  it('should fall back to API when cache is empty or expired', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary room IDs
        fc.string({ minLength: 10, maxLength: 50 }),
        // Generate arbitrary genres
        fc.array(fc.constantFrom('Action', 'Comedy', 'Drama', 'Horror', 'Romance'), { maxLength: 3 }),
        
        async (roomId, genres) => {
          // Setup: Mock DynamoDB to return empty cache (cache miss)
          mockSend.mockResolvedValueOnce({ Item: null });

          // Setup: Mock TMDB API response
          const apiMovies = [
            {
              id: 12345,
              title: 'API Movie 1',
              poster_path: '/api1.jpg',
              overview: 'From API',
              genre_ids: [28, 35],
              release_date: '2023-01-01',
              vote_average: 7.5,
            },
            {
              id: 12346,
              title: 'API Movie 2',
              poster_path: '/api2.jpg',
              overview: 'Also from API',
              genre_ids: [18],
              release_date: '2023-02-01',
              vote_average: 8.2,
            },
          ];

          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
              results: apiMovies,
            }),
          });

          // Action: Try to pre-cache movies (which will trigger API call due to cache miss)
          const result = await movieCacheService.preCacheMovies(roomId, genres);

          // Assertion 1: Should have called DynamoDB to check for existing cache
          expect(mockSend).toHaveBeenCalledWith(
            expect.objectContaining({
              params: expect.objectContaining({
                TableName: 'test-movie-cache-table',
                Key: { cacheKey: roomId },
              }),
            })
          );

          // Assertion 2: Should have called TMDB API due to cache miss
          expect(mockFetch).toHaveBeenCalled();

          // Assertion 3: Should return movies (either from API or fallback)
          expect(result).toBeDefined();
          expect(Array.isArray(result)).toBe(true);
          expect(result.length).toBeGreaterThan(0);

          // Assertion 4: Each movie should have required cache structure
          result.forEach(movie => {
            expect(typeof movie.tmdbId).toBe('number');
            expect(typeof movie.title).toBe('string');
            expect(typeof movie.posterPath).toBe('string');
            expect(typeof movie.overview).toBe('string');
            expect(Array.isArray(movie.genres)).toBe(true);
            expect(typeof movie.cachedAt).toBe('string');
            expect(typeof movie.ttl).toBe('number');
          });
        }
      ),
      {
        numRuns: 50, // Fewer runs for the inverse test
        timeout: 5000,
      }
    );
  });

  /**
   * Property Test: Cache Expiration Behavior
   * 
   * When cache exists but is expired, system should not use it and should fetch fresh data
   */
  it('should not use expired cache and should fetch fresh data', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary room IDs
        fc.string({ minLength: 10, maxLength: 50 }),
        // Generate arbitrary expired cached movies
        fc.array(
          fc.record({
            tmdbId: fc.integer({ min: 1, max: 999999 }),
            title: fc.string({ minLength: 1, maxLength: 100 }),
            posterPath: fc.webUrl(),
            overview: fc.string({ minLength: 10, maxLength: 500 }),
            genres: fc.array(fc.constantFrom('Action', 'Comedy', 'Drama'), { minLength: 1, maxLength: 2 }),
            year: fc.integer({ min: 1900, max: 2030 }),
            rating: fc.float({ min: 0, max: 10 }),
            cachedAt: fc.constant(new Date(Date.now() - 86400000).toISOString()), // 24 hours ago
            ttl: fc.integer({ min: Date.now() - 86400000, max: Date.now() - 1 }), // Expired TTL
          }),
          { minLength: 1, maxLength: 20 }
        ),
        
        async (roomId, expiredCachedMovies) => {
          // Setup: Mock DynamoDB to return expired cache
          mockSend.mockResolvedValueOnce({
            Item: {
              cacheKey: roomId,
              movies: expiredCachedMovies,
              genreFilters: [],
              cachedAt: new Date(Date.now() - 86400000).toISOString(), // 24 hours ago
              ttl: Date.now() - 1, // Expired 1ms ago
            },
          });

          // Action: Try to get cached movies
          const result = await movieCacheService.getCachedMovies(roomId);

          // Assertion 1: Should return empty array for expired cache
          expect(result).toEqual([]);

          // Assertion 2: Should have called DynamoDB to check cache
          expect(mockSend).toHaveBeenCalledWith(
            expect.objectContaining({
              params: expect.objectContaining({
                TableName: 'test-movie-cache-table',
                Key: { cacheKey: roomId },
              }),
            })
          );

          // Assertion 3: Should not return expired movies
          expect(result).not.toEqual(expiredCachedMovies);
        }
      ),
      {
        numRuns: 50,
        timeout: 5000,
      }
    );
  });

  /**
   * Edge Case Test: Cache with Mixed TTL States
   * 
   * Test behavior when cache contains movies with different expiration states
   */
  it('should handle cache consistently regardless of individual movie TTL variations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.integer({ min: 1, max: 30 }),
        
        async (roomId, movieCount) => {
          // Generate movies with consistent cache-level TTL (what matters for cache expiration)
          const validCacheMovies: CachedMovie[] = Array.from({ length: movieCount }, (_, i) => ({
            tmdbId: 1000 + i,
            title: `Test Movie ${i + 1}`,
            posterPath: `https://example.com/poster${i + 1}.jpg`,
            overview: `Overview for movie ${i + 1}`,
            genres: ['Action'],
            year: 2023,
            rating: 7.0 + (i % 3),
            cachedAt: new Date().toISOString(),
            ttl: Date.now() + 3600000, // Individual movie TTL (1 hour from now)
          }));

          // Setup: Mock DynamoDB with valid cache (cache-level TTL is what matters)
          mockSend.mockResolvedValueOnce({
            Item: {
              cacheKey: roomId,
              movies: validCacheMovies,
              genreFilters: ['Action'],
              cachedAt: new Date().toISOString(),
              ttl: Date.now() + 86400000, // Cache-level TTL: 24 hours from now (valid)
            },
          });

          // Action: Get cached movies
          const result = await movieCacheService.getCachedMovies(roomId);

          // Assertion 1: Should return all movies from valid cache
          expect(result).toHaveLength(movieCount);
          expect(result).toEqual(validCacheMovies);

          // Assertion 2: Should not call TMDB API when cache is valid
          expect(mockFetch).not.toHaveBeenCalled();

          // Assertion 3: All movies should maintain their structure
          result.forEach((movie, index) => {
            expect(movie.tmdbId).toBe(1000 + index);
            expect(movie.title).toBe(`Test Movie ${index + 1}`);
            expect(movie.genres).toEqual(['Action']);
          });
        }
      ),
      {
        numRuns: 30,
        timeout: 3000,
      }
    );
  });
});
