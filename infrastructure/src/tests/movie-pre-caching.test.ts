/**
 * Unit Tests for Movie Pre-caching System
 * Feature: trinity-voting-fixes
 * 
 * Property 8: Movie Pre-caching Behavior
 * Validates: Requirements 4.1
 * 
 * For any newly created room, the system should pre-fetch and cache 
 * 20-50 movie titles from TMDB API within 30 seconds
 */

import { movieCacheService, CachedMovie } from '../services/movieCacheService';

// Mock DynamoDB and TMDB API
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('../utils/metrics');

// Mock fetch for TMDB API
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('Movie Pre-caching Behavior - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variables
    process.env.MOVIE_CACHE_TABLE = 'test-movie-cache-table';
    process.env.TMDB_API_KEY = 'test-api-key';
  });

  describe('Property 8: Movie Pre-caching Behavior', () => {
    it('should pre-fetch and cache 20-50 movies for a room within timeout', async () => {
      const roomId = 'test-room-123';
      const genres = ['Action', 'Comedy'];

      // Mock successful TMDB API response
      const mockMovies = Array.from({ length: 30 }, (_, i) => ({
        id: 1000 + i,
        title: `Test Movie ${i + 1}`,
        poster_path: `/poster${i + 1}.jpg`,
        overview: `Overview for movie ${i + 1}`,
        genre_ids: [28, 12], // Action, Adventure
        release_date: '2023-01-01',
        vote_average: 7.5 + (i % 3),
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: mockMovies,
          total_pages: 1,
          total_results: mockMovies.length,
        }),
      });

      // Mock DynamoDB operations
      const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
      const mockSend = jest.fn()
        .mockResolvedValueOnce({ Item: null }) // getCachedMovies returns empty
        .mockResolvedValueOnce({}); // storeCacheInDynamoDB succeeds

      DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
        send: mockSend,
      });

      // Start timer
      const startTime = Date.now();

      // Execute pre-caching
      const cachedMovies = await movieCacheService.preCacheMovies(roomId, genres);

      // End timer
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify timing constraint (30 seconds = 30000ms)
      expect(duration).toBeLessThan(30000);

      // Verify movie count is within expected range
      expect(cachedMovies.length).toBeGreaterThanOrEqual(20);
      expect(cachedMovies.length).toBeLessThanOrEqual(50);

      // Verify all movies have required properties
      cachedMovies.forEach(movie => {
        expect(movie).toHaveProperty('tmdbId');
        expect(movie).toHaveProperty('title');
        expect(movie).toHaveProperty('posterPath');
        expect(movie).toHaveProperty('overview');
        expect(movie).toHaveProperty('genres');
        expect(movie).toHaveProperty('cachedAt');
        expect(movie).toHaveProperty('ttl');

        // Verify data types
        expect(typeof movie.tmdbId).toBe('number');
        expect(typeof movie.title).toBe('string');
        expect(typeof movie.posterPath).toBe('string');
        expect(typeof movie.overview).toBe('string');
        expect(Array.isArray(movie.genres)).toBe(true);
        expect(typeof movie.cachedAt).toBe('string');
        expect(typeof movie.ttl).toBe('number');

        // Verify TTL is set for 24 hours from now
        const expectedTTL = Date.now() + (24 * 60 * 60 * 1000);
        expect(movie.ttl).toBeGreaterThan(Date.now());
        expect(movie.ttl).toBeLessThan(expectedTTL + 60000); // Allow 1 minute tolerance
      });
    });

    it('should handle TMDB API failures gracefully with fallback movies', async () => {
      const roomId = 'test-room-456';

      // Mock TMDB API failure
      mockFetch.mockRejectedValueOnce(new Error('TMDB API unavailable'));

      // Mock DynamoDB operations
      const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
      const mockSend = jest.fn()
        .mockResolvedValueOnce({ Item: null }) // getCachedMovies returns empty
        .mockResolvedValueOnce({}); // storeCacheInDynamoDB succeeds

      DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
        send: mockSend,
      });

      // Execute pre-caching (should use fallback)
      const cachedMovies = await movieCacheService.preCacheMovies(roomId);

      // Should still return movies (fallback)
      expect(cachedMovies.length).toBeGreaterThanOrEqual(20);
      expect(cachedMovies.length).toBeLessThanOrEqual(50);

      // Verify fallback movies have correct structure
      cachedMovies.forEach(movie => {
        expect(movie).toHaveProperty('tmdbId');
        expect(movie).toHaveProperty('title');
        expect(movie.title).toContain('Popular Movie');
        expect(movie.genres).toContain('Popular');
      });
    });

    it('should reuse existing valid cache instead of fetching new movies', async () => {
      const roomId = 'test-room-789';
      const genres = ['Drama'];

      // Mock existing cache in DynamoDB
      const existingMovies: CachedMovie[] = Array.from({ length: 25 }, (_, i) => ({
        tmdbId: 2000 + i,
        title: `Cached Movie ${i + 1}`,
        posterPath: `/cached${i + 1}.jpg`,
        overview: `Cached overview ${i + 1}`,
        genres: genres,
        year: 2023,
        rating: 8.0,
        cachedAt: new Date().toISOString(),
        ttl: Date.now() + (23 * 60 * 60 * 1000), // Valid for 23 more hours
      }));

      // Mock DynamoDB operations
      const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
      const mockSend = jest.fn()
        .mockResolvedValueOnce({ 
          Item: {
            cacheKey: roomId,
            movies: existingMovies,
            genreFilters: genres,
            cachedAt: new Date().toISOString(),
            ttl: Date.now() + (23 * 60 * 60 * 1000),
          }
        });

      DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
        send: mockSend,
      });

      // Execute pre-caching
      const cachedMovies = await movieCacheService.preCacheMovies(roomId, genres);

      // Should return existing cached movies
      expect(cachedMovies).toEqual(existingMovies);
      expect(cachedMovies.length).toBe(25);

      // Should only call DynamoDB once (to get existing cache)
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Should NOT call TMDB API
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should set TTL to exactly 24 hours from cache creation time', async () => {
      const roomId = 'test-room-ttl';

      // Mock TMDB API response
      const mockMovies = Array.from({ length: 25 }, (_, i) => ({
        id: 5000 + i,
        title: `TTL Test Movie ${i + 1}`,
        poster_path: `/ttl${i + 1}.jpg`,
        overview: `TTL test overview ${i + 1}`,
        genre_ids: [18], // Drama
        release_date: '2023-06-01',
        vote_average: 7.0,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: mockMovies,
          total_pages: 1,
          total_results: mockMovies.length,
        }),
      });

      // Mock DynamoDB operations
      const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
      const mockSend = jest.fn()
        .mockResolvedValueOnce({ Item: null }) // getCachedMovies returns empty
        .mockResolvedValueOnce({}); // storeCacheInDynamoDB succeeds

      DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
        send: mockSend,
      });

      const beforeCaching = Date.now();
      const cachedMovies = await movieCacheService.preCacheMovies(roomId);
      const afterCaching = Date.now();

      // Verify TTL is set correctly for each movie
      const expectedTTLMin = beforeCaching + (24 * 60 * 60 * 1000);
      const expectedTTLMax = afterCaching + (24 * 60 * 60 * 1000);

      cachedMovies.forEach(movie => {
        expect(movie.ttl).toBeGreaterThanOrEqual(expectedTTLMin);
        expect(movie.ttl).toBeLessThanOrEqual(expectedTTLMax);
        
        // Verify TTL is approximately 24 hours from now
        const ttlHours = (movie.ttl - Date.now()) / (60 * 60 * 1000);
        expect(ttlHours).toBeGreaterThan(23.9); // Allow small tolerance
        expect(ttlHours).toBeLessThan(24.1);
      });
    });

    it('should handle expired cache by fetching new movies', async () => {
      const roomId = 'test-room-expired';

      // Mock expired cache in DynamoDB
      const expiredMovies: CachedMovie[] = Array.from({ length: 20 }, (_, i) => ({
        tmdbId: 3000 + i,
        title: `Expired Movie ${i + 1}`,
        posterPath: `/expired${i + 1}.jpg`,
        overview: `Expired overview ${i + 1}`,
        genres: ['Action'],
        cachedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
        ttl: Date.now() - (1 * 60 * 60 * 1000), // Expired 1 hour ago
      }));

      // Mock fresh TMDB API response
      const freshMovies = Array.from({ length: 30 }, (_, i) => ({
        id: 4000 + i,
        title: `Fresh Movie ${i + 1}`,
        poster_path: `/fresh${i + 1}.jpg`,
        overview: `Fresh overview ${i + 1}`,
        genre_ids: [35], // Comedy
        release_date: '2024-01-01',
        vote_average: 8.5,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: freshMovies,
          total_pages: 1,
          total_results: freshMovies.length,
        }),
      });

      // Mock DynamoDB operations
      const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
      const mockSend = jest.fn()
        .mockResolvedValueOnce({ 
          Item: {
            cacheKey: roomId,
            movies: expiredMovies,
            genreFilters: [],
            cachedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
            ttl: Date.now() - (1 * 60 * 60 * 1000), // Expired
          }
        })
        .mockResolvedValueOnce({}); // storeCacheInDynamoDB succeeds

      DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
        send: mockSend,
      });

      // Execute pre-caching
      const cachedMovies = await movieCacheService.preCacheMovies(roomId);

      // Should return fresh movies, not expired ones
      expect(cachedMovies.length).toBe(30);
      cachedMovies.forEach(movie => {
        expect(movie.title).toContain('Fresh Movie');
        expect(movie.tmdbId).toBeGreaterThanOrEqual(4000);
        expect(movie.tmdbId).toBeLessThan(4030);
      });

      // Should call TMDB API to get fresh movies
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should call DynamoDB twice (get expired cache, store new cache)
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('Genre Filtering', () => {
    it('should apply genre filters to TMDB API calls', async () => {
      const roomId = 'test-room-genres';
      const genres = ['Action', 'Comedy'];

      // Mock TMDB API response
      const mockMovies = Array.from({ length: 25 }, (_, i) => ({
        id: 6000 + i,
        title: `Genre Movie ${i + 1}`,
        poster_path: `/genre${i + 1}.jpg`,
        overview: `Genre overview ${i + 1}`,
        genre_ids: [28, 35], // Action, Comedy
        release_date: '2023-08-01',
        vote_average: 7.8,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: mockMovies,
          total_pages: 1,
          total_results: mockMovies.length,
        }),
      });

      // Mock DynamoDB operations
      const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
      const mockSend = jest.fn()
        .mockResolvedValueOnce({ Item: null }) // getCachedMovies returns empty
        .mockResolvedValueOnce({}); // storeCacheInDynamoDB succeeds

      DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
        send: mockSend,
      });

      // Execute pre-caching with genres
      const cachedMovies = await movieCacheService.preCacheMovies(roomId, genres);

      // Verify TMDB API was called with genre filters
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('with_genres=28,35')
      );

      // Verify movies were cached with correct genres
      expect(cachedMovies.length).toBe(25);
      cachedMovies.forEach(movie => {
        expect(movie.genres).toEqual(expect.arrayContaining(['Action', 'Comedy']));
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle DynamoDB failures gracefully', async () => {
      const roomId = 'test-room-db-error';

      // Mock successful TMDB API response
      const mockMovies = Array.from({ length: 20 }, (_, i) => ({
        id: 7000 + i,
        title: `Error Test Movie ${i + 1}`,
        poster_path: `/error${i + 1}.jpg`,
        overview: `Error test overview ${i + 1}`,
        genre_ids: [53], // Thriller
        release_date: '2023-09-01',
        vote_average: 6.5,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: mockMovies,
          total_pages: 1,
          total_results: mockMovies.length,
        }),
      });

      // Mock DynamoDB failure
      const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
      const mockSend = jest.fn()
        .mockResolvedValueOnce({ Item: null }) // getCachedMovies succeeds
        .mockRejectedValueOnce(new Error('DynamoDB unavailable')); // storeCacheInDynamoDB fails

      DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
        send: mockSend,
      });

      // Should still return movies even if storage fails
      const cachedMovies = await movieCacheService.preCacheMovies(roomId);

      expect(cachedMovies.length).toBe(20);
      cachedMovies.forEach(movie => {
        expect(movie.title).toContain('Error Test Movie');
      });

      // Should have attempted to store in DynamoDB
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });
});
