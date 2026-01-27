/**
 * Unit Tests for Genre Filtering System
 * Feature: trinity-voting-fixes
 * 
 * Property 9: Genre Filtering Consistency
 * Validates: Requirements 4.2, 5.2
 * 
 * For any room with specified genres, all cached movies should belong 
 * to at least one of the specified genres
 */

import { movieCacheService } from '../services/movieCacheService';

// Mock DynamoDB and TMDB API
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('../utils/metrics');

// Mock fetch for TMDB API
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('Genre Filtering Consistency - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variables
    process.env.MOVIE_CACHE_TABLE = 'test-movie-cache-table';
    process.env.TMDB_API_KEY = 'test-api-key';
  });

  describe('Property 9: Genre Filtering Consistency', () => {
    it('should filter movies by single genre correctly', async () => {
      const roomId = 'test-room-action';
      const genres = ['Action'];

      // Mock TMDB API response with Action movies
      const mockMovies = Array.from({ length: 20 }, (_, i) => ({
        id: 1000 + i,
        title: `Action Movie ${i + 1}`,
        poster_path: `/action${i + 1}.jpg`,
        overview: `Action-packed movie ${i + 1}`,
        genre_ids: [28], // Action genre ID
        release_date: '2023-01-01',
        vote_average: 7.5,
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

      // Execute pre-caching with Action genre
      const cachedMovies = await movieCacheService.preCacheMovies(roomId, genres);

      // Verify all movies have Action genre
      expect(cachedMovies.length).toBeGreaterThan(0);
      cachedMovies.forEach(movie => {
        expect(movie.genres).toContain('Action');
      });

      // Verify TMDB API was called with correct genre filter
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('with_genres=28')
      );
    });

    it('should filter movies by multiple genres correctly', async () => {
      const roomId = 'test-room-multi-genre';
      const genres = ['Action', 'Comedy', 'Drama'];

      // Mock TMDB API response with mixed genre movies
      const mockMovies = [
        // Action movies
        ...Array.from({ length: 10 }, (_, i) => ({
          id: 2000 + i,
          title: `Action Movie ${i + 1}`,
          poster_path: `/action${i + 1}.jpg`,
          overview: `Action movie ${i + 1}`,
          genre_ids: [28], // Action
          release_date: '2023-01-01',
          vote_average: 7.5,
        })),
        // Comedy movies
        ...Array.from({ length: 10 }, (_, i) => ({
          id: 3000 + i,
          title: `Comedy Movie ${i + 1}`,
          poster_path: `/comedy${i + 1}.jpg`,
          overview: `Comedy movie ${i + 1}`,
          genre_ids: [35], // Comedy
          release_date: '2023-01-01',
          vote_average: 7.0,
        })),
        // Drama movies
        ...Array.from({ length: 10 }, (_, i) => ({
          id: 4000 + i,
          title: `Drama Movie ${i + 1}`,
          poster_path: `/drama${i + 1}.jpg`,
          overview: `Drama movie ${i + 1}`,
          genre_ids: [18], // Drama
          release_date: '2023-01-01',
          vote_average: 8.0,
        })),
      ];

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

      // Execute pre-caching with multiple genres
      const cachedMovies = await movieCacheService.preCacheMovies(roomId, genres);

      // Verify all movies have at least one of the requested genres
      expect(cachedMovies.length).toBeGreaterThan(0);
      cachedMovies.forEach(movie => {
        const hasRequestedGenre = movie.genres.some(movieGenre =>
          genres.some(requestedGenre =>
            movieGenre.toLowerCase() === requestedGenre.toLowerCase()
          )
        );
        expect(hasRequestedGenre).toBe(true);
      });

      // Verify TMDB API was called with correct genre filters
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('with_genres=28,35,18')
      );
    });

    it('should handle invalid genres gracefully', async () => {
      const roomId = 'test-room-invalid-genres';
      const genres = ['InvalidGenre', 'AnotherInvalidGenre'];

      // Mock TMDB API response with popular movies (no genre filter applied)
      const mockMovies = Array.from({ length: 20 }, (_, i) => ({
        id: 5000 + i,
        title: `Popular Movie ${i + 1}`,
        poster_path: `/popular${i + 1}.jpg`,
        overview: `Popular movie ${i + 1}`,
        genre_ids: [28, 35, 18], // Mixed genres
        release_date: '2023-01-01',
        vote_average: 7.5,
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

      // Execute pre-caching with invalid genres
      const cachedMovies = await movieCacheService.preCacheMovies(roomId, genres);

      // Should still return movies (fallback to popular movies)
      expect(cachedMovies.length).toBeGreaterThan(0);

      // Verify TMDB API was called without genre filters (invalid genres ignored)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.not.stringContaining('with_genres=')
      );
    });

    it('should handle mixed valid and invalid genres', async () => {
      const roomId = 'test-room-mixed-genres';
      const genres = ['Action', 'InvalidGenre', 'Comedy'];

      // Mock TMDB API response with Action and Comedy movies
      const mockMovies = Array.from({ length: 20 }, (_, i) => ({
        id: 6000 + i,
        title: `Mixed Genre Movie ${i + 1}`,
        poster_path: `/mixed${i + 1}.jpg`,
        overview: `Mixed genre movie ${i + 1}`,
        genre_ids: i % 2 === 0 ? [28] : [35], // Alternate between Action and Comedy
        release_date: '2023-01-01',
        vote_average: 7.5,
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

      // Execute pre-caching with mixed valid/invalid genres
      const cachedMovies = await movieCacheService.preCacheMovies(roomId, genres);

      // Verify all movies have at least one valid genre (Action or Comedy)
      expect(cachedMovies.length).toBeGreaterThan(0);
      cachedMovies.forEach(movie => {
        const hasValidGenre = movie.genres.some(movieGenre =>
          ['Action', 'Comedy'].includes(movieGenre)
        );
        expect(hasValidGenre).toBe(true);
      });

      // Verify TMDB API was called with only valid genre filters (28=Action, 35=Comedy)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('with_genres=28,35')
      );
    });

    it('should default to popular movies when no genres specified', async () => {
      const roomId = 'test-room-no-genres';

      // Mock TMDB API response with popular movies across all genres
      const mockMovies = Array.from({ length: 20 }, (_, i) => ({
        id: 7000 + i,
        title: `Popular Movie ${i + 1}`,
        poster_path: `/popular${i + 1}.jpg`,
        overview: `Popular movie ${i + 1}`,
        genre_ids: [28, 35, 18, 53, 878], // Mixed genres
        release_date: '2023-01-01',
        vote_average: 8.0,
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

      // Execute pre-caching without genres
      const cachedMovies = await movieCacheService.preCacheMovies(roomId);

      // Should return movies from various genres
      expect(cachedMovies.length).toBeGreaterThan(0);
      
      // Collect all genres from cached movies
      const allGenres = new Set<string>();
      cachedMovies.forEach(movie => {
        movie.genres.forEach(genre => allGenres.add(genre));
      });

      // Should have movies from multiple genres (popular movies across all genres)
      expect(allGenres.size).toBeGreaterThan(1);

      // Verify TMDB API was called without genre filters
      expect(mockFetch).toHaveBeenCalledWith(
        expect.not.stringContaining('with_genres=')
      );
    });
  });

  describe('Genre Validation', () => {
    it('should validate genre names correctly', () => {
      const validGenres = ['Action', 'Comedy', 'Drama'];
      const invalidGenres = ['InvalidGenre', 'AnotherInvalid'];
      const mixedGenres = [...validGenres, ...invalidGenres];

      const result = movieCacheService.validateGenres(mixedGenres);

      expect(result.valid).toEqual(expect.arrayContaining(validGenres));
      expect(result.invalid).toEqual(expect.arrayContaining(invalidGenres));
      expect(result.valid.length).toBe(3);
      expect(result.invalid.length).toBe(2);
    });

    it('should return available genres list', () => {
      const availableGenres = movieCacheService.getAvailableGenres();

      expect(availableGenres).toContain('Action');
      expect(availableGenres).toContain('Comedy');
      expect(availableGenres).toContain('Drama');
      expect(availableGenres).toContain('Horror');
      expect(availableGenres).toContain('Science Fiction');
      
      // Should be sorted alphabetically
      const sortedGenres = [...availableGenres].sort();
      expect(availableGenres).toEqual(sortedGenres);
    });

    it('should handle case-insensitive genre validation', () => {
      const genres = ['action', 'COMEDY', 'Drama'];
      const result = movieCacheService.validateGenres(genres);

      expect(result.valid).toEqual(['Action', 'Comedy', 'Drama']);
      expect(result.invalid).toEqual([]);
    });
  });

  describe('Genre Filtering Edge Cases', () => {
    it('should handle empty genre array', async () => {
      const roomId = 'test-room-empty-genres';
      const genres: string[] = [];

      // Mock TMDB API response
      const mockMovies = Array.from({ length: 20 }, (_, i) => ({
        id: 8000 + i,
        title: `Movie ${i + 1}`,
        poster_path: `/movie${i + 1}.jpg`,
        overview: `Movie ${i + 1}`,
        genre_ids: [28, 35],
        release_date: '2023-01-01',
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
        .mockResolvedValueOnce({ Item: null })
        .mockResolvedValueOnce({});

      DynamoDBDocumentClient.from = jest.fn().mockReturnValue({
        send: mockSend,
      });

      // Should work the same as no genres specified
      const cachedMovies = await movieCacheService.preCacheMovies(roomId, genres);
      expect(cachedMovies.length).toBeGreaterThan(0);
    });

    it('should handle whitespace in genre names', () => {
      const genres = [' Action ', '  Comedy  ', 'Drama'];
      const result = movieCacheService.validateGenres(genres);

      expect(result.valid).toEqual(['Action', 'Comedy', 'Drama']);
      expect(result.invalid).toEqual([]);
    });
  });
});
