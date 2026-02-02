"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const movieCacheService_1 = require("../services/movieCacheService");
// Mock DynamoDB and TMDB API
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('../utils/metrics');
// Mock fetch for TMDB API
const mockFetch = jest.fn();
global.fetch = mockFetch;
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
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId, genres);
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
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId);
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
            const existingMovies = Array.from({ length: 25 }, (_, i) => ({
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
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId, genres);
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
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId);
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
            const expiredMovies = Array.from({ length: 20 }, (_, i) => ({
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
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId);
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
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId, genres);
            // Verify TMDB API was called with genre filters
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('with_genres=28,35'));
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
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId);
            expect(cachedMovies.length).toBe(20);
            cachedMovies.forEach(movie => {
                expect(movie.title).toContain('Error Test Movie');
            });
            // Should have attempted to store in DynamoDB
            expect(mockSend).toHaveBeenCalledTimes(2);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW92aWUtcHJlLWNhY2hpbmcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1vdmllLXByZS1jYWNoaW5nLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7R0FTRzs7QUFFSCxxRUFBK0U7QUFFL0UsNkJBQTZCO0FBQzdCLElBQUksQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztBQUNuQyxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7QUFFOUIsMEJBQTBCO0FBQzFCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztBQUMzQixNQUFjLENBQUMsS0FBSyxHQUFHLFNBQVMsQ0FBQztBQUVsQyxRQUFRLENBQUMseUNBQXlDLEVBQUUsR0FBRyxFQUFFO0lBQ3ZELFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDZCxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFckIsNkJBQTZCO1FBQzdCLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEdBQUcsd0JBQXdCLENBQUM7UUFDekQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEdBQUcsY0FBYyxDQUFDO0lBQzVDLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLHdDQUF3QyxFQUFFLEdBQUcsRUFBRTtRQUN0RCxFQUFFLENBQUMsbUVBQW1FLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDakYsTUFBTSxNQUFNLEdBQUcsZUFBZSxDQUFDO1lBQy9CLE1BQU0sTUFBTSxHQUFHLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBRXBDLG9DQUFvQztZQUNwQyxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDdkQsRUFBRSxFQUFFLElBQUksR0FBRyxDQUFDO2dCQUNa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cUIsQ0FBQyxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyw2QkFBNkI7WUFFMUYsc0JBQXNCLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxlQUFlLENBQUM7Z0JBQ3RELElBQUksRUFBRSxRQUFRO2FBQ2YsQ0FBQyxDQUFDO1lBRUgsbURBQW1EO1lBQ25ELE1BQU0sWUFBWSxHQUFHLE1BQU0scUNBQWlCLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRXBFLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3JDLFlBQVksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUU7Z0JBQzNCLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDcEQsQ0FBQyxDQUFDLENBQUM7WUFFSCw2Q0FBNkM7WUFDN0MsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzVDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBVbml0IFRlc3RzIGZvciBNb3ZpZSBQcmUtY2FjaGluZyBTeXN0ZW1cclxuICogRmVhdHVyZTogdHJpbml0eS12b3RpbmctZml4ZXNcclxuICogXHJcbiAqIFByb3BlcnR5IDg6IE1vdmllIFByZS1jYWNoaW5nIEJlaGF2aW9yXHJcbiAqIFZhbGlkYXRlczogUmVxdWlyZW1lbnRzIDQuMVxyXG4gKiBcclxuICogRm9yIGFueSBuZXdseSBjcmVhdGVkIHJvb20sIHRoZSBzeXN0ZW0gc2hvdWxkIHByZS1mZXRjaCBhbmQgY2FjaGUgXHJcbiAqIDIwLTUwIG1vdmllIHRpdGxlcyBmcm9tIFRNREIgQVBJIHdpdGhpbiAzMCBzZWNvbmRzXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgbW92aWVDYWNoZVNlcnZpY2UsIENhY2hlZE1vdmllIH0gZnJvbSAnLi4vc2VydmljZXMvbW92aWVDYWNoZVNlcnZpY2UnO1xyXG5cclxuLy8gTW9jayBEeW5hbW9EQiBhbmQgVE1EQiBBUElcclxuamVzdC5tb2NrKCdAYXdzLXNkay9saWItZHluYW1vZGInKTtcclxuamVzdC5tb2NrKCcuLi91dGlscy9tZXRyaWNzJyk7XHJcblxyXG4vLyBNb2NrIGZldGNoIGZvciBUTURCIEFQSVxyXG5jb25zdCBtb2NrRmV0Y2ggPSBqZXN0LmZuKCk7XHJcbihnbG9iYWwgYXMgYW55KS5mZXRjaCA9IG1vY2tGZXRjaDtcclxuXHJcbmRlc2NyaWJlKCdNb3ZpZSBQcmUtY2FjaGluZyBCZWhhdmlvciAtIFVuaXQgVGVzdHMnLCAoKSA9PiB7XHJcbiAgYmVmb3JlRWFjaCgoKSA9PiB7XHJcbiAgICBqZXN0LmNsZWFyQWxsTW9ja3MoKTtcclxuICAgIFxyXG4gICAgLy8gTW9jayBlbnZpcm9ubWVudCB2YXJpYWJsZXNcclxuICAgIHByb2Nlc3MuZW52Lk1PVklFX0NBQ0hFX1RBQkxFID0gJ3Rlc3QtbW92aWUtY2FjaGUtdGFibGUnO1xyXG4gICAgcHJvY2Vzcy5lbnYuVE1EQl9BUElfS0VZID0gJ3Rlc3QtYXBpLWtleSc7XHJcbiAgfSk7XHJcblxyXG4gIGRlc2NyaWJlKCdQcm9wZXJ0eSA4OiBNb3ZpZSBQcmUtY2FjaGluZyBCZWhhdmlvcicsICgpID0+IHtcclxuICAgIGl0KCdzaG91bGQgcHJlLWZldGNoIGFuZCBjYWNoZSAyMC01MCBtb3ZpZXMgZm9yIGEgcm9vbSB3aXRoaW4gdGltZW91dCcsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbS0xMjMnO1xyXG4gICAgICBjb25zdCBnZW5yZXMgPSBbJ0FjdGlvbicsICdDb21lZHknXTtcclxuXHJcbiAgICAgIC8vIE1vY2sgc3VjY2Vzc2Z1bCBUTURCIEFQSSByZXNwb25zZVxyXG4gICAgICBjb25zdCBtb2NrTW92aWVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMzAgfSwgKF8sIGkpID0+ICh7XHJcbiAgICAgICAgaWQ6IDEwMDAgKyBpLFxyXG4gICAgICAgIHRpdGxlOiBgVGVzdCBNb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgcG9zdGVyX3BhdGg6IGAvcG9zdGVyJHtpICsgMX0uanBnYCxcclxuICAgICAgICBvdmVydmlldzogYE92ZXJ2aWV3IGZvciBtb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgZ2VucmVfaWRzOiBbMjgsIDEyXSwgLy8gQWN0aW9uLCBBZHZlbnR1cmVcclxuICAgICAgICByZWxlYXNlX2RhdGU6ICcyMDIzLTAxLTAxJyxcclxuICAgICAgICB2b3RlX2F2ZXJhZ2U6IDcuNSArIChpICUgMyksXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIG1vY2tGZXRjaC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe1xyXG4gICAgICAgIG9rOiB0cnVlLFxyXG4gICAgICAgIGpzb246IGFzeW5jICgpID0+ICh7XHJcbiAgICAgICAgICByZXN1bHRzOiBtb2NrTW92aWVzLFxyXG4gICAgICAgICAgdG90YWxfcGFnZXM6IDEsXHJcbiAgICAgICAgICB0b3RhbF9yZXN1bHRzOiBtb2NrTW92aWVzLmxlbmd0aCxcclxuICAgICAgICB9KSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgY29uc3QgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50IH0gPSByZXF1aXJlKCdAYXdzLXNkay9saWItZHluYW1vZGInKTtcclxuICAgICAgY29uc3QgbW9ja1NlbmQgPSBqZXN0LmZuKClcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgSXRlbTogbnVsbCB9KSAvLyBnZXRDYWNoZWRNb3ZpZXMgcmV0dXJucyBlbXB0eVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pOyAvLyBzdG9yZUNhY2hlSW5EeW5hbW9EQiBzdWNjZWVkc1xyXG5cclxuICAgICAgRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tID0gamVzdC5mbigpLm1vY2tSZXR1cm5WYWx1ZSh7XHJcbiAgICAgICAgc2VuZDogbW9ja1NlbmQsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gU3RhcnQgdGltZXJcclxuICAgICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcclxuXHJcbiAgICAgIC8vIEV4ZWN1dGUgcHJlLWNhY2hpbmdcclxuICAgICAgY29uc3QgY2FjaGVkTW92aWVzID0gYXdhaXQgbW92aWVDYWNoZVNlcnZpY2UucHJlQ2FjaGVNb3ZpZXMocm9vbUlkLCBnZW5yZXMpO1xyXG5cclxuICAgICAgLy8gRW5kIHRpbWVyXHJcbiAgICAgIGNvbnN0IGVuZFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgICBjb25zdCBkdXJhdGlvbiA9IGVuZFRpbWUgLSBzdGFydFRpbWU7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgdGltaW5nIGNvbnN0cmFpbnQgKDMwIHNlY29uZHMgPSAzMDAwMG1zKVxyXG4gICAgICBleHBlY3QoZHVyYXRpb24pLnRvQmVMZXNzVGhhbigzMDAwMCk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgbW92aWUgY291bnQgaXMgd2l0aGluIGV4cGVjdGVkIHJhbmdlXHJcbiAgICAgIGV4cGVjdChjYWNoZWRNb3ZpZXMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDIwKTtcclxuICAgICAgZXhwZWN0KGNhY2hlZE1vdmllcy5sZW5ndGgpLnRvQmVMZXNzVGhhbk9yRXF1YWwoNTApO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IGFsbCBtb3ZpZXMgaGF2ZSByZXF1aXJlZCBwcm9wZXJ0aWVzXHJcbiAgICAgIGNhY2hlZE1vdmllcy5mb3JFYWNoKG1vdmllID0+IHtcclxuICAgICAgICBleHBlY3QobW92aWUpLnRvSGF2ZVByb3BlcnR5KCd0bWRiSWQnKTtcclxuICAgICAgICBleHBlY3QobW92aWUpLnRvSGF2ZVByb3BlcnR5KCd0aXRsZScpO1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZSkudG9IYXZlUHJvcGVydHkoJ3Bvc3RlclBhdGgnKTtcclxuICAgICAgICBleHBlY3QobW92aWUpLnRvSGF2ZVByb3BlcnR5KCdvdmVydmlldycpO1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZSkudG9IYXZlUHJvcGVydHkoJ2dlbnJlcycpO1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZSkudG9IYXZlUHJvcGVydHkoJ2NhY2hlZEF0Jyk7XHJcbiAgICAgICAgZXhwZWN0KG1vdmllKS50b0hhdmVQcm9wZXJ0eSgndHRsJyk7XHJcblxyXG4gICAgICAgIC8vIFZlcmlmeSBkYXRhIHR5cGVzXHJcbiAgICAgICAgZXhwZWN0KHR5cGVvZiBtb3ZpZS50bWRiSWQpLnRvQmUoJ251bWJlcicpO1xyXG4gICAgICAgIGV4cGVjdCh0eXBlb2YgbW92aWUudGl0bGUpLnRvQmUoJ3N0cmluZycpO1xyXG4gICAgICAgIGV4cGVjdCh0eXBlb2YgbW92aWUucG9zdGVyUGF0aCkudG9CZSgnc3RyaW5nJyk7XHJcbiAgICAgICAgZXhwZWN0KHR5cGVvZiBtb3ZpZS5vdmVydmlldykudG9CZSgnc3RyaW5nJyk7XHJcbiAgICAgICAgZXhwZWN0KEFycmF5LmlzQXJyYXkobW92aWUuZ2VucmVzKSkudG9CZSh0cnVlKTtcclxuICAgICAgICBleHBlY3QodHlwZW9mIG1vdmllLmNhY2hlZEF0KS50b0JlKCdzdHJpbmcnKTtcclxuICAgICAgICBleHBlY3QodHlwZW9mIG1vdmllLnR0bCkudG9CZSgnbnVtYmVyJyk7XHJcblxyXG4gICAgICAgIC8vIFZlcmlmeSBUVEwgaXMgc2V0IGZvciAyNCBob3VycyBmcm9tIG5vd1xyXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVFRMID0gRGF0ZS5ub3coKSArICgyNCAqIDYwICogNjAgKiAxMDAwKTtcclxuICAgICAgICBleHBlY3QobW92aWUudHRsKS50b0JlR3JlYXRlclRoYW4oRGF0ZS5ub3coKSk7XHJcbiAgICAgICAgZXhwZWN0KG1vdmllLnR0bCkudG9CZUxlc3NUaGFuKGV4cGVjdGVkVFRMICsgNjAwMDApOyAvLyBBbGxvdyAxIG1pbnV0ZSB0b2xlcmFuY2VcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBUTURCIEFQSSBmYWlsdXJlcyBncmFjZWZ1bGx5IHdpdGggZmFsbGJhY2sgbW92aWVzJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLTQ1Nic7XHJcblxyXG4gICAgICAvLyBNb2NrIFRNREIgQVBJIGZhaWx1cmVcclxuICAgICAgbW9ja0ZldGNoLm1vY2tSZWplY3RlZFZhbHVlT25jZShuZXcgRXJyb3IoJ1RNREIgQVBJIHVuYXZhaWxhYmxlJykpO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zXHJcbiAgICAgIGNvbnN0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XHJcbiAgICAgIGNvbnN0IG1vY2tTZW5kID0gamVzdC5mbigpXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IEl0ZW06IG51bGwgfSkgLy8gZ2V0Q2FjaGVkTW92aWVzIHJldHVybnMgZW1wdHlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHt9KTsgLy8gc3RvcmVDYWNoZUluRHluYW1vREIgc3VjY2VlZHNcclxuXHJcbiAgICAgIER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbSA9IGplc3QuZm4oKS5tb2NrUmV0dXJuVmFsdWUoe1xyXG4gICAgICAgIHNlbmQ6IG1vY2tTZW5kLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIEV4ZWN1dGUgcHJlLWNhY2hpbmcgKHNob3VsZCB1c2UgZmFsbGJhY2spXHJcbiAgICAgIGNvbnN0IGNhY2hlZE1vdmllcyA9IGF3YWl0IG1vdmllQ2FjaGVTZXJ2aWNlLnByZUNhY2hlTW92aWVzKHJvb21JZCk7XHJcblxyXG4gICAgICAvLyBTaG91bGQgc3RpbGwgcmV0dXJuIG1vdmllcyAoZmFsbGJhY2spXHJcbiAgICAgIGV4cGVjdChjYWNoZWRNb3ZpZXMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDIwKTtcclxuICAgICAgZXhwZWN0KGNhY2hlZE1vdmllcy5sZW5ndGgpLnRvQmVMZXNzVGhhbk9yRXF1YWwoNTApO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IGZhbGxiYWNrIG1vdmllcyBoYXZlIGNvcnJlY3Qgc3RydWN0dXJlXHJcbiAgICAgIGNhY2hlZE1vdmllcy5mb3JFYWNoKG1vdmllID0+IHtcclxuICAgICAgICBleHBlY3QobW92aWUpLnRvSGF2ZVByb3BlcnR5KCd0bWRiSWQnKTtcclxuICAgICAgICBleHBlY3QobW92aWUpLnRvSGF2ZVByb3BlcnR5KCd0aXRsZScpO1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZS50aXRsZSkudG9Db250YWluKCdQb3B1bGFyIE1vdmllJyk7XHJcbiAgICAgICAgZXhwZWN0KG1vdmllLmdlbnJlcykudG9Db250YWluKCdQb3B1bGFyJyk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCByZXVzZSBleGlzdGluZyB2YWxpZCBjYWNoZSBpbnN0ZWFkIG9mIGZldGNoaW5nIG5ldyBtb3ZpZXMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20tNzg5JztcclxuICAgICAgY29uc3QgZ2VucmVzID0gWydEcmFtYSddO1xyXG5cclxuICAgICAgLy8gTW9jayBleGlzdGluZyBjYWNoZSBpbiBEeW5hbW9EQlxyXG4gICAgICBjb25zdCBleGlzdGluZ01vdmllczogQ2FjaGVkTW92aWVbXSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDI1IH0sIChfLCBpKSA9PiAoe1xyXG4gICAgICAgIHRtZGJJZDogMjAwMCArIGksXHJcbiAgICAgICAgdGl0bGU6IGBDYWNoZWQgTW92aWUgJHtpICsgMX1gLFxyXG4gICAgICAgIHBvc3RlclBhdGg6IGAvY2FjaGVkJHtpICsgMX0uanBnYCxcclxuICAgICAgICBvdmVydmlldzogYENhY2hlZCBvdmVydmlldyAke2kgKyAxfWAsXHJcbiAgICAgICAgZ2VucmVzOiBnZW5yZXMsXHJcbiAgICAgICAgeWVhcjogMjAyMyxcclxuICAgICAgICByYXRpbmc6IDguMCxcclxuICAgICAgICBjYWNoZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIHR0bDogRGF0ZS5ub3coKSArICgyMyAqIDYwICogNjAgKiAxMDAwKSwgLy8gVmFsaWQgZm9yIDIzIG1vcmUgaG91cnNcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zXHJcbiAgICAgIGNvbnN0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XHJcbiAgICAgIGNvbnN0IG1vY2tTZW5kID0gamVzdC5mbigpXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IFxyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICBjYWNoZUtleTogcm9vbUlkLFxyXG4gICAgICAgICAgICBtb3ZpZXM6IGV4aXN0aW5nTW92aWVzLFxyXG4gICAgICAgICAgICBnZW5yZUZpbHRlcnM6IGdlbnJlcyxcclxuICAgICAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgdHRsOiBEYXRlLm5vdygpICsgKDIzICogNjAgKiA2MCAqIDEwMDApLFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tID0gamVzdC5mbigpLm1vY2tSZXR1cm5WYWx1ZSh7XHJcbiAgICAgICAgc2VuZDogbW9ja1NlbmQsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gRXhlY3V0ZSBwcmUtY2FjaGluZ1xyXG4gICAgICBjb25zdCBjYWNoZWRNb3ZpZXMgPSBhd2FpdCBtb3ZpZUNhY2hlU2VydmljZS5wcmVDYWNoZU1vdmllcyhyb29tSWQsIGdlbnJlcyk7XHJcblxyXG4gICAgICAvLyBTaG91bGQgcmV0dXJuIGV4aXN0aW5nIGNhY2hlZCBtb3ZpZXNcclxuICAgICAgZXhwZWN0KGNhY2hlZE1vdmllcykudG9FcXVhbChleGlzdGluZ01vdmllcyk7XHJcbiAgICAgIGV4cGVjdChjYWNoZWRNb3ZpZXMubGVuZ3RoKS50b0JlKDI1KTtcclxuXHJcbiAgICAgIC8vIFNob3VsZCBvbmx5IGNhbGwgRHluYW1vREIgb25jZSAodG8gZ2V0IGV4aXN0aW5nIGNhY2hlKVxyXG4gICAgICBleHBlY3QobW9ja1NlbmQpLnRvSGF2ZUJlZW5DYWxsZWRUaW1lcygxKTtcclxuXHJcbiAgICAgIC8vIFNob3VsZCBOT1QgY2FsbCBUTURCIEFQSVxyXG4gICAgICBleHBlY3QobW9ja0ZldGNoKS5ub3QudG9IYXZlQmVlbkNhbGxlZCgpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBzZXQgVFRMIHRvIGV4YWN0bHkgMjQgaG91cnMgZnJvbSBjYWNoZSBjcmVhdGlvbiB0aW1lJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLXR0bCc7XHJcblxyXG4gICAgICAvLyBNb2NrIFRNREIgQVBJIHJlc3BvbnNlXHJcbiAgICAgIGNvbnN0IG1vY2tNb3ZpZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAyNSB9LCAoXywgaSkgPT4gKHtcclxuICAgICAgICBpZDogNTAwMCArIGksXHJcbiAgICAgICAgdGl0bGU6IGBUVEwgVGVzdCBNb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgcG9zdGVyX3BhdGg6IGAvdHRsJHtpICsgMX0uanBnYCxcclxuICAgICAgICBvdmVydmlldzogYFRUTCB0ZXN0IG92ZXJ2aWV3ICR7aSArIDF9YCxcclxuICAgICAgICBnZW5yZV9pZHM6IFsxOF0sIC8vIERyYW1hXHJcbiAgICAgICAgcmVsZWFzZV9kYXRlOiAnMjAyMy0wNi0wMScsXHJcbiAgICAgICAgdm90ZV9hdmVyYWdlOiA3LjAsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIG1vY2tGZXRjaC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe1xyXG4gICAgICAgIG9rOiB0cnVlLFxyXG4gICAgICAgIGpzb246IGFzeW5jICgpID0+ICh7XHJcbiAgICAgICAgICByZXN1bHRzOiBtb2NrTW92aWVzLFxyXG4gICAgICAgICAgdG90YWxfcGFnZXM6IDEsXHJcbiAgICAgICAgICB0b3RhbF9yZXN1bHRzOiBtb2NrTW92aWVzLmxlbmd0aCxcclxuICAgICAgICB9KSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgY29uc3QgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50IH0gPSByZXF1aXJlKCdAYXdzLXNkay9saWItZHluYW1vZGInKTtcclxuICAgICAgY29uc3QgbW9ja1NlbmQgPSBqZXN0LmZuKClcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgSXRlbTogbnVsbCB9KSAvLyBnZXRDYWNoZWRNb3ZpZXMgcmV0dXJucyBlbXB0eVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pOyAvLyBzdG9yZUNhY2hlSW5EeW5hbW9EQiBzdWNjZWVkc1xyXG5cclxuICAgICAgRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tID0gamVzdC5mbigpLm1vY2tSZXR1cm5WYWx1ZSh7XHJcbiAgICAgICAgc2VuZDogbW9ja1NlbmQsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgYmVmb3JlQ2FjaGluZyA9IERhdGUubm93KCk7XHJcbiAgICAgIGNvbnN0IGNhY2hlZE1vdmllcyA9IGF3YWl0IG1vdmllQ2FjaGVTZXJ2aWNlLnByZUNhY2hlTW92aWVzKHJvb21JZCk7XHJcbiAgICAgIGNvbnN0IGFmdGVyQ2FjaGluZyA9IERhdGUubm93KCk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgVFRMIGlzIHNldCBjb3JyZWN0bHkgZm9yIGVhY2ggbW92aWVcclxuICAgICAgY29uc3QgZXhwZWN0ZWRUVExNaW4gPSBiZWZvcmVDYWNoaW5nICsgKDI0ICogNjAgKiA2MCAqIDEwMDApO1xyXG4gICAgICBjb25zdCBleHBlY3RlZFRUTE1heCA9IGFmdGVyQ2FjaGluZyArICgyNCAqIDYwICogNjAgKiAxMDAwKTtcclxuXHJcbiAgICAgIGNhY2hlZE1vdmllcy5mb3JFYWNoKG1vdmllID0+IHtcclxuICAgICAgICBleHBlY3QobW92aWUudHRsKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKGV4cGVjdGVkVFRMTWluKTtcclxuICAgICAgICBleHBlY3QobW92aWUudHRsKS50b0JlTGVzc1RoYW5PckVxdWFsKGV4cGVjdGVkVFRMTWF4KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBWZXJpZnkgVFRMIGlzIGFwcHJveGltYXRlbHkgMjQgaG91cnMgZnJvbSBub3dcclxuICAgICAgICBjb25zdCB0dGxIb3VycyA9IChtb3ZpZS50dGwgLSBEYXRlLm5vdygpKSAvICg2MCAqIDYwICogMTAwMCk7XHJcbiAgICAgICAgZXhwZWN0KHR0bEhvdXJzKS50b0JlR3JlYXRlclRoYW4oMjMuOSk7IC8vIEFsbG93IHNtYWxsIHRvbGVyYW5jZVxyXG4gICAgICAgIGV4cGVjdCh0dGxIb3VycykudG9CZUxlc3NUaGFuKDI0LjEpO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGV4cGlyZWQgY2FjaGUgYnkgZmV0Y2hpbmcgbmV3IG1vdmllcycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbS1leHBpcmVkJztcclxuXHJcbiAgICAgIC8vIE1vY2sgZXhwaXJlZCBjYWNoZSBpbiBEeW5hbW9EQlxyXG4gICAgICBjb25zdCBleHBpcmVkTW92aWVzOiBDYWNoZWRNb3ZpZVtdID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMjAgfSwgKF8sIGkpID0+ICh7XHJcbiAgICAgICAgdG1kYklkOiAzMDAwICsgaSxcclxuICAgICAgICB0aXRsZTogYEV4cGlyZWQgTW92aWUgJHtpICsgMX1gLFxyXG4gICAgICAgIHBvc3RlclBhdGg6IGAvZXhwaXJlZCR7aSArIDF9LmpwZ2AsXHJcbiAgICAgICAgb3ZlcnZpZXc6IGBFeHBpcmVkIG92ZXJ2aWV3ICR7aSArIDF9YCxcclxuICAgICAgICBnZW5yZXM6IFsnQWN0aW9uJ10sXHJcbiAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKERhdGUubm93KCkgLSAyNSAqIDYwICogNjAgKiAxMDAwKS50b0lTT1N0cmluZygpLCAvLyAyNSBob3VycyBhZ29cclxuICAgICAgICB0dGw6IERhdGUubm93KCkgLSAoMSAqIDYwICogNjAgKiAxMDAwKSwgLy8gRXhwaXJlZCAxIGhvdXIgYWdvXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIC8vIE1vY2sgZnJlc2ggVE1EQiBBUEkgcmVzcG9uc2VcclxuICAgICAgY29uc3QgZnJlc2hNb3ZpZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAzMCB9LCAoXywgaSkgPT4gKHtcclxuICAgICAgICBpZDogNDAwMCArIGksXHJcbiAgICAgICAgdGl0bGU6IGBGcmVzaCBNb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgcG9zdGVyX3BhdGg6IGAvZnJlc2gke2kgKyAxfS5qcGdgLFxyXG4gICAgICAgIG92ZXJ2aWV3OiBgRnJlc2ggb3ZlcnZpZXcgJHtpICsgMX1gLFxyXG4gICAgICAgIGdlbnJlX2lkczogWzM1XSwgLy8gQ29tZWR5XHJcbiAgICAgICAgcmVsZWFzZV9kYXRlOiAnMjAyNC0wMS0wMScsXHJcbiAgICAgICAgdm90ZV9hdmVyYWdlOiA4LjUsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIG1vY2tGZXRjaC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe1xyXG4gICAgICAgIG9rOiB0cnVlLFxyXG4gICAgICAgIGpzb246IGFzeW5jICgpID0+ICh7XHJcbiAgICAgICAgICByZXN1bHRzOiBmcmVzaE1vdmllcyxcclxuICAgICAgICAgIHRvdGFsX3BhZ2VzOiAxLFxyXG4gICAgICAgICAgdG90YWxfcmVzdWx0czogZnJlc2hNb3ZpZXMubGVuZ3RoLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG4gICAgICBjb25zdCBtb2NrU2VuZCA9IGplc3QuZm4oKVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBcclxuICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgY2FjaGVLZXk6IHJvb21JZCxcclxuICAgICAgICAgICAgbW92aWVzOiBleHBpcmVkTW92aWVzLFxyXG4gICAgICAgICAgICBnZW5yZUZpbHRlcnM6IFtdLFxyXG4gICAgICAgICAgICBjYWNoZWRBdDogbmV3IERhdGUoRGF0ZS5ub3coKSAtIDI1ICogNjAgKiA2MCAqIDEwMDApLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgIHR0bDogRGF0ZS5ub3coKSAtICgxICogNjAgKiA2MCAqIDEwMDApLCAvLyBFeHBpcmVkXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHt9KTsgLy8gc3RvcmVDYWNoZUluRHluYW1vREIgc3VjY2VlZHNcclxuXHJcbiAgICAgIER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbSA9IGplc3QuZm4oKS5tb2NrUmV0dXJuVmFsdWUoe1xyXG4gICAgICAgIHNlbmQ6IG1vY2tTZW5kLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIEV4ZWN1dGUgcHJlLWNhY2hpbmdcclxuICAgICAgY29uc3QgY2FjaGVkTW92aWVzID0gYXdhaXQgbW92aWVDYWNoZVNlcnZpY2UucHJlQ2FjaGVNb3ZpZXMocm9vbUlkKTtcclxuXHJcbiAgICAgIC8vIFNob3VsZCByZXR1cm4gZnJlc2ggbW92aWVzLCBub3QgZXhwaXJlZCBvbmVzXHJcbiAgICAgIGV4cGVjdChjYWNoZWRNb3ZpZXMubGVuZ3RoKS50b0JlKDMwKTtcclxuICAgICAgY2FjaGVkTW92aWVzLmZvckVhY2gobW92aWUgPT4ge1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZS50aXRsZSkudG9Db250YWluKCdGcmVzaCBNb3ZpZScpO1xyXG4gICAgICAgIGV4cGVjdChtb3ZpZS50bWRiSWQpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoNDAwMCk7XHJcbiAgICAgICAgZXhwZWN0KG1vdmllLnRtZGJJZCkudG9CZUxlc3NUaGFuKDQwMzApO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFNob3VsZCBjYWxsIFRNREIgQVBJIHRvIGdldCBmcmVzaCBtb3ZpZXNcclxuICAgICAgZXhwZWN0KG1vY2tGZXRjaCkudG9IYXZlQmVlbkNhbGxlZFRpbWVzKDEpO1xyXG5cclxuICAgICAgLy8gU2hvdWxkIGNhbGwgRHluYW1vREIgdHdpY2UgKGdldCBleHBpcmVkIGNhY2hlLCBzdG9yZSBuZXcgY2FjaGUpXHJcbiAgICAgIGV4cGVjdChtb2NrU2VuZCkudG9IYXZlQmVlbkNhbGxlZFRpbWVzKDIpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGRlc2NyaWJlKCdHZW5yZSBGaWx0ZXJpbmcnLCAoKSA9PiB7XHJcbiAgICBpdCgnc2hvdWxkIGFwcGx5IGdlbnJlIGZpbHRlcnMgdG8gVE1EQiBBUEkgY2FsbHMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20tZ2VucmVzJztcclxuICAgICAgY29uc3QgZ2VucmVzID0gWydBY3Rpb24nLCAnQ29tZWR5J107XHJcblxyXG4gICAgICAvLyBNb2NrIFRNREIgQVBJIHJlc3BvbnNlXHJcbiAgICAgIGNvbnN0IG1vY2tNb3ZpZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAyNSB9LCAoXywgaSkgPT4gKHtcclxuICAgICAgICBpZDogNjAwMCArIGksXHJcbiAgICAgICAgdGl0bGU6IGBHZW5yZSBNb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgcG9zdGVyX3BhdGg6IGAvZ2VucmUke2kgKyAxfS5qcGdgLFxyXG4gICAgICAgIG92ZXJ2aWV3OiBgR2VucmUgb3ZlcnZpZXcgJHtpICsgMX1gLFxyXG4gICAgICAgIGdlbnJlX2lkczogWzI4LCAzNV0sIC8vIEFjdGlvbiwgQ29tZWR5XHJcbiAgICAgICAgcmVsZWFzZV9kYXRlOiAnMjAyMy0wOC0wMScsXHJcbiAgICAgICAgdm90ZV9hdmVyYWdlOiA3LjgsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIG1vY2tGZXRjaC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe1xyXG4gICAgICAgIG9rOiB0cnVlLFxyXG4gICAgICAgIGpzb246IGFzeW5jICgpID0+ICh7XHJcbiAgICAgICAgICByZXN1bHRzOiBtb2NrTW92aWVzLFxyXG4gICAgICAgICAgdG90YWxfcGFnZXM6IDEsXHJcbiAgICAgICAgICB0b3RhbF9yZXN1bHRzOiBtb2NrTW92aWVzLmxlbmd0aCxcclxuICAgICAgICB9KSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgY29uc3QgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50IH0gPSByZXF1aXJlKCdAYXdzLXNkay9saWItZHluYW1vZGInKTtcclxuICAgICAgY29uc3QgbW9ja1NlbmQgPSBqZXN0LmZuKClcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgSXRlbTogbnVsbCB9KSAvLyBnZXRDYWNoZWRNb3ZpZXMgcmV0dXJucyBlbXB0eVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pOyAvLyBzdG9yZUNhY2hlSW5EeW5hbW9EQiBzdWNjZWVkc1xyXG5cclxuICAgICAgRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tID0gamVzdC5mbigpLm1vY2tSZXR1cm5WYWx1ZSh7XHJcbiAgICAgICAgc2VuZDogbW9ja1NlbmQsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gRXhlY3V0ZSBwcmUtY2FjaGluZyB3aXRoIGdlbnJlc1xyXG4gICAgICBjb25zdCBjYWNoZWRNb3ZpZXMgPSBhd2FpdCBtb3ZpZUNhY2hlU2VydmljZS5wcmVDYWNoZU1vdmllcyhyb29tSWQsIGdlbnJlcyk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgVE1EQiBBUEkgd2FzIGNhbGxlZCB3aXRoIGdlbnJlIGZpbHRlcnNcclxuICAgICAgZXhwZWN0KG1vY2tGZXRjaCkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXHJcbiAgICAgICAgZXhwZWN0LnN0cmluZ0NvbnRhaW5pbmcoJ3dpdGhfZ2VucmVzPTI4LDM1JylcclxuICAgICAgKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBtb3ZpZXMgd2VyZSBjYWNoZWQgd2l0aCBjb3JyZWN0IGdlbnJlc1xyXG4gICAgICBleHBlY3QoY2FjaGVkTW92aWVzLmxlbmd0aCkudG9CZSgyNSk7XHJcbiAgICAgIGNhY2hlZE1vdmllcy5mb3JFYWNoKG1vdmllID0+IHtcclxuICAgICAgICBleHBlY3QobW92aWUuZ2VucmVzKS50b0VxdWFsKGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoWydBY3Rpb24nLCAnQ29tZWR5J10pKTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ0Vycm9yIEhhbmRsaW5nJywgKCkgPT4ge1xyXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgRHluYW1vREIgZmFpbHVyZXMgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbS1kYi1lcnJvcic7XHJcblxyXG4gICAgICAvLyBNb2NrIHN1Y2Nlc3NmdWwgVE1EQiBBUEkgcmVzcG9uc2VcclxuICAgICAgY29uc3QgbW9ja01vdmllcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDIwIH0sIChfLCBpKSA9PiAoe1xyXG4gICAgICAgIGlkOiA3MDAwICsgaSxcclxuICAgICAgICB0aXRsZTogYEVycm9yIFRlc3QgTW92aWUgJHtpICsgMX1gLFxyXG4gICAgICAgIHBvc3Rlcl9wYXRoOiBgL2Vycm9yJHtpICsgMX0uanBnYCxcclxuICAgICAgICBvdmVydmlldzogYEVycm9yIHRlc3Qgb3ZlcnZpZXcgJHtpICsgMX1gLFxyXG4gICAgICAgIGdlbnJlX2lkczogWzUzXSwgLy8gVGhyaWxsZXJcclxuICAgICAgICByZWxlYXNlX2RhdGU6ICcyMDIzLTA5LTAxJyxcclxuICAgICAgICB2b3RlX2F2ZXJhZ2U6IDYuNSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgbW9ja0ZldGNoLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XHJcbiAgICAgICAgb2s6IHRydWUsXHJcbiAgICAgICAganNvbjogYXN5bmMgKCkgPT4gKHtcclxuICAgICAgICAgIHJlc3VsdHM6IG1vY2tNb3ZpZXMsXHJcbiAgICAgICAgICB0b3RhbF9wYWdlczogMSxcclxuICAgICAgICAgIHRvdGFsX3Jlc3VsdHM6IG1vY2tNb3ZpZXMubGVuZ3RoLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgZmFpbHVyZVxyXG4gICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG4gICAgICBjb25zdCBtb2NrU2VuZCA9IGplc3QuZm4oKVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIGdldENhY2hlZE1vdmllcyBzdWNjZWVkc1xyXG4gICAgICAgIC5tb2NrUmVqZWN0ZWRWYWx1ZU9uY2UobmV3IEVycm9yKCdEeW5hbW9EQiB1bmF2YWlsYWJsZScpKTsgLy8gc3RvcmVDYWNoZUluRHluYW1vREIgZmFpbHNcclxuXHJcbiAgICAgIER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbSA9IGplc3QuZm4oKS5tb2NrUmV0dXJuVmFsdWUoe1xyXG4gICAgICAgIHNlbmQ6IG1vY2tTZW5kLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFNob3VsZCBzdGlsbCByZXR1cm4gbW92aWVzIGV2ZW4gaWYgc3RvcmFnZSBmYWlsc1xyXG4gICAgICBjb25zdCBjYWNoZWRNb3ZpZXMgPSBhd2FpdCBtb3ZpZUNhY2hlU2VydmljZS5wcmVDYWNoZU1vdmllcyhyb29tSWQpO1xyXG5cclxuICAgICAgZXhwZWN0KGNhY2hlZE1vdmllcy5sZW5ndGgpLnRvQmUoMjApO1xyXG4gICAgICBjYWNoZWRNb3ZpZXMuZm9yRWFjaChtb3ZpZSA9PiB7XHJcbiAgICAgICAgZXhwZWN0KG1vdmllLnRpdGxlKS50b0NvbnRhaW4oJ0Vycm9yIFRlc3QgTW92aWUnKTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBTaG91bGQgaGF2ZSBhdHRlbXB0ZWQgdG8gc3RvcmUgaW4gRHluYW1vREJcclxuICAgICAgZXhwZWN0KG1vY2tTZW5kKS50b0hhdmVCZWVuQ2FsbGVkVGltZXMoMik7XHJcbiAgICB9KTtcclxuICB9KTtcclxufSk7Il19