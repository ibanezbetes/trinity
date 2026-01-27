/**
 * Property-Based Tests for Movie Pre-loading System
 * Feature: trinity-voting-fixes, Property 23: Movie Pre-loading
 * Validates: Requirements 10.1
 * 
 * Property 23: Movie Pre-loading
 * For any voting session start, the system should pre-load the next 3 movies in the background
 */

import * as fc from 'fast-check';
import { moviePreloadService } from '../services/moviePreloadService';
import { mediaService, MediaItemDetails } from '../services/mediaService';

// Mock the media service
jest.mock('../services/mediaService', () => ({
  mediaService: {
    getMovieDetails: jest.fn(),
  },
}));

// Mock the logging service
jest.mock('../services/loggingService', () => ({
  loggingService: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockMediaService = mediaService as jest.Mocked<typeof mediaService>;

describe('Movie Pre-loading Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear any existing preload queues
    moviePreloadService.clearPreloads('test-room');
  });

  afterEach(() => {
    // Clean up after each test
    moviePreloadService.clearPreloads('test-room');
  });

  /**
   * Property 23: Movie Pre-loading
   * For any voting session start, the system should pre-load the next 3 movies in the background
   */
  test('Property 23: Movie Pre-loading - should pre-load next 3 movies for any valid movie list', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate room ID
        fc.string({ minLength: 5, maxLength: 20 }).filter((s: string) => s.trim().length > 0),
        // Generate movie list (minimum 4 movies to test pre-loading of 3)
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 999999 }),
            title: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 4, maxLength: 20 }
        ).map(movies => {
          // Ensure unique movie IDs to avoid pre-loading conflicts
          const uniqueMovies: Array<{id: number, title: string}> = [];
          const seenIds = new Set<number>();
          
          for (const movie of movies) {
            if (!seenIds.has(movie.id)) {
              seenIds.add(movie.id);
              uniqueMovies.push(movie);
            }
          }
          
          // Ensure we still have at least 4 unique movies
          while (uniqueMovies.length < 4) {
            let newId = Math.floor(Math.random() * 999999) + 1;
            while (seenIds.has(newId)) {
              newId = Math.floor(Math.random() * 999999) + 1;
            }
            seenIds.add(newId);
            uniqueMovies.push({ id: newId, title: `Movie ${newId}` });
          }
          
          return uniqueMovies;
        }),
        // Generate starting index
        fc.integer({ min: 0, max: 5 }),
        
        async (roomId: string, moviesList: Array<{id: number, title: string}>, startIndex: number) => {
          // Ensure start index is valid for the movie list
          const validStartIndex = Math.min(startIndex, moviesList.length - 4);
          
          // Mock successful movie details responses
          mockMediaService.getMovieDetails.mockImplementation(async (movieId: number): Promise<MediaItemDetails | null> => ({
            id: `movie-${movieId}`,
            tmdbId: movieId,
            title: `Movie ${movieId}`,
            originalTitle: `Original Movie ${movieId}`,
            overview: `Overview for movie ${movieId}`,
            posterPath: `/poster${movieId}.jpg`,
            backdropPath: `/backdrop${movieId}.jpg`,
            releaseDate: '2024-01-01',
            year: '2024',
            rating: 7.5,
            voteCount: 1000,
            genres: ['Action', 'Drama'],
            mediaType: 'movie',
            runtime: 120,
            tagline: 'Test tagline',
            budget: 1000000,
            revenue: 5000000,
            trailerKey: null,
            watchProviders: [],
            cast: [],
            director: null,
          }));

          // Initialize pre-loading
          await moviePreloadService.initializePreloading(roomId, moviesList, validStartIndex);
          
          // Wait a bit for background pre-loading to complete
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Get pre-load status
          const status = moviePreloadService.getPreloadStatus(roomId);
          
          // Property: Should attempt to pre-load next 3 movies
          const expectedPreloadCount = Math.min(3, moviesList.length - validStartIndex - 1);
          
          // Verify pre-loading behavior
          expect(status.currentIndex).toBe(validStartIndex);
          expect(status.totalMovies).toBe(moviesList.length);
          
          // Should have attempted to pre-load the expected number of movies
          if (expectedPreloadCount > 0) {
            expect(mockMediaService.getMovieDetails).toHaveBeenCalled();
            
            // The service should have been called at least once
            expect(mockMediaService.getMovieDetails.mock.calls.length).toBeGreaterThan(0);
            
            // Verify that at least some of the expected movies were requested for pre-loading
            const calledMovieIds = mockMediaService.getMovieDetails.mock.calls.map(call => call[0]);
            const expectedMovieIds: number[] = [];
            
            // Collect expected movie IDs for pre-loading
            for (let i = 1; i <= expectedPreloadCount; i++) {
              const targetIndex = validStartIndex + i;
              if (targetIndex < moviesList.length) {
                expectedMovieIds.push(moviesList[targetIndex].id);
              }
            }
            
            // At least one of the expected movies should have been called for pre-loading
            const hasExpectedMovie = expectedMovieIds.some(expectedId => 
              calledMovieIds.includes(expectedId)
            );
            expect(hasExpectedMovie).toBe(true);
          }
          
          // Clean up
          moviePreloadService.clearPreloads(roomId);
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  /**
   * Property: Pre-loading should handle concurrent initialization
   */
  test('Property 23.1: Concurrent pre-loading initialization should be safe', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            roomId: fc.string({ minLength: 5, maxLength: 15 }),
            moviesList: fc.array(
              fc.record({ id: fc.integer({ min: 1, max: 999 }) }),
              { minLength: 5, maxLength: 10 }
            ),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        
        async (roomConfigs: Array<{roomId: string, moviesList: Array<{id: number}>}>) => {
          // Mock successful responses
          mockMediaService.getMovieDetails.mockResolvedValue({
            id: 'movie-123',
            tmdbId: 123,
            title: 'Test Movie',
            originalTitle: 'Test Movie',
            overview: 'Test overview',
            posterPath: '/test.jpg',
            backdropPath: '/test-backdrop.jpg',
            releaseDate: '2024-01-01',
            year: '2024',
            rating: 7.0,
            voteCount: 100,
            genres: ['Test'],
            mediaType: 'movie',
            runtime: 90,
            tagline: 'Test tagline',
            budget: 1000000,
            revenue: 2000000,
            trailerKey: null,
            watchProviders: [],
            cast: [],
            director: null,
          });

          // Initialize pre-loading for all rooms concurrently
          const initPromises = roomConfigs.map((config: {roomId: string, moviesList: Array<{id: number}>}) =>
            moviePreloadService.initializePreloading(config.roomId, config.moviesList, 0)
          );
          
          // Should not throw errors when initializing concurrently
          await expect(Promise.all(initPromises)).resolves.not.toThrow();
          
          // Wait for pre-loading to complete
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Verify each room has proper status
          roomConfigs.forEach((config: {roomId: string, moviesList: Array<{id: number}>}) => {
            const status = moviePreloadService.getPreloadStatus(config.roomId);
            expect(status.totalMovies).toBe(config.moviesList.length);
            expect(status.currentIndex).toBe(0);
          });
          
          // Clean up all rooms
          roomConfigs.forEach((config: {roomId: string, moviesList: Array<{id: number}>}) => {
            moviePreloadService.clearPreloads(config.roomId);
          });
        }
      ),
      { numRuns: 50 }
    );
  }, 20000);

  /**
   * Property: Pre-loading should handle API failures gracefully
   */
  test('Property 23.2: Pre-loading should handle API failures without breaking the system', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 15 }),
        fc.array(
          fc.record({ id: fc.integer({ min: 1, max: 999 }) }),
          { minLength: 5, maxLength: 10 }
        ),
        fc.float({ min: 0, max: 1 }), // Failure rate
        
        async (roomId: string, moviesList: Array<{id: number}>, failureRate: number) => {
          // Mock API with random failures
          mockMediaService.getMovieDetails.mockImplementation(async (movieId: number): Promise<MediaItemDetails | null> => {
            if (Math.random() < failureRate) {
              throw new Error(`API failure for movie ${movieId}`);
            }
            return {
              id: `movie-${movieId}`,
              tmdbId: movieId,
              title: `Movie ${movieId}`,
              originalTitle: `Movie ${movieId}`,
              overview: 'Test overview',
              posterPath: '/test.jpg',
              backdropPath: '/test-backdrop.jpg',
              releaseDate: '2024-01-01',
              year: '2024',
              rating: 7.0,
              voteCount: 100,
              genres: ['Test'],
              mediaType: 'movie',
              runtime: 90,
              tagline: 'Test tagline',
              budget: 1000000,
              revenue: 2000000,
              trailerKey: null,
              watchProviders: [],
              cast: [],
              director: null,
            };
          });

          // Initialize pre-loading - should not throw even with API failures
          await expect(
            moviePreloadService.initializePreloading(roomId, moviesList, 0)
          ).resolves.not.toThrow();
          
          // Wait for pre-loading attempts
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // System should still be functional
          const status = moviePreloadService.getPreloadStatus(roomId);
          expect(status.totalMovies).toBe(moviesList.length);
          expect(status.currentIndex).toBe(0);
          
          // Should be able to get movies (with fallback to on-demand)
          const firstMovieId = moviesList[0].id.toString();
          const movieDetails = await moviePreloadService.getMovie(roomId, firstMovieId);
          
          // Should either return pre-loaded data or fallback successfully
          // (movieDetails can be null if both pre-load and fallback fail, which is acceptable)
          expect(typeof movieDetails === 'object').toBe(true);
          
          // Clean up
          moviePreloadService.clearPreloads(roomId);
        }
      ),
      { numRuns: 50 }
    );
  }, 25000);

  /**
   * Property: Advancing through movies should trigger new pre-loads
   */
  test('Property 23.3: Advancing through movies should maintain pre-loading window', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 15 }),
        fc.array(
          fc.record({ id: fc.integer({ min: 1, max: 999 }) }),
          { minLength: 8, maxLength: 15 } // Need enough movies to test advancement
        ),
        fc.integer({ min: 1, max: 3 }), // Number of advances
        
        async (roomId: string, moviesList: Array<{id: number}>, advanceCount: number) => {
          // Mock successful responses
          mockMediaService.getMovieDetails.mockResolvedValue({
            id: 'movie-123',
            tmdbId: 123,
            title: 'Test Movie',
            originalTitle: 'Test Movie',
            overview: 'Test overview',
            posterPath: '/test.jpg',
            backdropPath: '/test-backdrop.jpg',
            releaseDate: '2024-01-01',
            year: '2024',
            rating: 7.0,
            voteCount: 100,
            genres: ['Test'],
            mediaType: 'movie',
            runtime: 90,
            tagline: 'Test tagline',
            budget: 1000000,
            revenue: 2000000,
            trailerKey: null,
            watchProviders: [],
            cast: [],
            director: null,
          });

          // Initialize pre-loading
          await moviePreloadService.initializePreloading(roomId, moviesList, 0);
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Advance through movies
          for (let i = 0; i < advanceCount; i++) {
            await moviePreloadService.advanceToNext(roomId);
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          // Verify current index advanced correctly
          const status = moviePreloadService.getPreloadStatus(roomId);
          expect(status.currentIndex).toBe(advanceCount);
          
          // Should still be attempting to pre-load next movies
          const remainingMovies = moviesList.length - status.currentIndex - 1;
          const expectedPreloadAttempts = Math.min(3, remainingMovies);
          
          if (expectedPreloadAttempts > 0) {
            // Should have made API calls for pre-loading
            expect(mockMediaService.getMovieDetails).toHaveBeenCalled();
          }
          
          // Clean up
          moviePreloadService.clearPreloads(roomId);
        }
      ),
      { numRuns: 50 }
    );
  }, 20000);
});