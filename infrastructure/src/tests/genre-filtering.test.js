"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const movieCacheService_1 = require("../services/movieCacheService");
// Mock DynamoDB and TMDB API
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('../utils/metrics');
// Mock fetch for TMDB API
const mockFetch = jest.fn();
global.fetch = mockFetch;
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
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId, genres);
            // Verify all movies have Action genre
            expect(cachedMovies.length).toBeGreaterThan(0);
            cachedMovies.forEach(movie => {
                expect(movie.genres).toContain('Action');
            });
            // Verify TMDB API was called with correct genre filter
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('with_genres=28'));
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
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId, genres);
            // Verify all movies have at least one of the requested genres
            expect(cachedMovies.length).toBeGreaterThan(0);
            cachedMovies.forEach(movie => {
                const hasRequestedGenre = movie.genres.some(movieGenre => genres.some(requestedGenre => movieGenre.toLowerCase() === requestedGenre.toLowerCase()));
                expect(hasRequestedGenre).toBe(true);
            });
            // Verify TMDB API was called with correct genre filters
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('with_genres=28,35,18'));
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
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId, genres);
            // Should still return movies (fallback to popular movies)
            expect(cachedMovies.length).toBeGreaterThan(0);
            // Verify TMDB API was called without genre filters (invalid genres ignored)
            expect(mockFetch).toHaveBeenCalledWith(expect.not.stringContaining('with_genres='));
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
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId, genres);
            // Verify all movies have at least one valid genre (Action or Comedy)
            expect(cachedMovies.length).toBeGreaterThan(0);
            cachedMovies.forEach(movie => {
                const hasValidGenre = movie.genres.some(movieGenre => ['Action', 'Comedy'].includes(movieGenre));
                expect(hasValidGenre).toBe(true);
            });
            // Verify TMDB API was called with only valid genre filters (28=Action, 35=Comedy)
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('with_genres=28,35'));
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
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId);
            // Should return movies from various genres
            expect(cachedMovies.length).toBeGreaterThan(0);
            // Collect all genres from cached movies
            const allGenres = new Set();
            cachedMovies.forEach(movie => {
                movie.genres.forEach(genre => allGenres.add(genre));
            });
            // Should have movies from multiple genres (popular movies across all genres)
            expect(allGenres.size).toBeGreaterThan(1);
            // Verify TMDB API was called without genre filters
            expect(mockFetch).toHaveBeenCalledWith(expect.not.stringContaining('with_genres='));
        });
    });
    describe('Genre Validation', () => {
        it('should validate genre names correctly', () => {
            const validGenres = ['Action', 'Comedy', 'Drama'];
            const invalidGenres = ['InvalidGenre', 'AnotherInvalid'];
            const mixedGenres = [...validGenres, ...invalidGenres];
            const result = movieCacheService_1.movieCacheService.validateGenres(mixedGenres);
            expect(result.valid).toEqual(expect.arrayContaining(validGenres));
            expect(result.invalid).toEqual(expect.arrayContaining(invalidGenres));
            expect(result.valid.length).toBe(3);
            expect(result.invalid.length).toBe(2);
        });
        it('should return available genres list', () => {
            const availableGenres = movieCacheService_1.movieCacheService.getAvailableGenres();
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
            const result = movieCacheService_1.movieCacheService.validateGenres(genres);
            expect(result.valid).toEqual(['Action', 'Comedy', 'Drama']);
            expect(result.invalid).toEqual([]);
        });
    });
    describe('Genre Filtering Edge Cases', () => {
        it('should handle empty genre array', async () => {
            const roomId = 'test-room-empty-genres';
            const genres = [];
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
            const cachedMovies = await movieCacheService_1.movieCacheService.preCacheMovies(roomId, genres);
            expect(cachedMovies.length).toBeGreaterThan(0);
        });
        it('should handle whitespace in genre names', () => {
            const genres = [' Action ', '  Comedy  ', 'Drama'];
            const result = movieCacheService_1.movieCacheService.validateGenres(genres);
            expect(result.valid).toEqual(['Action', 'Comedy', 'Drama']);
            expect(result.invalid).toEqual([]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VucmUtZmlsdGVyaW5nLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnZW5yZS1maWx0ZXJpbmcudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7OztHQVNHOztBQUVILHFFQUFrRTtBQUVsRSw2QkFBNkI7QUFDN0IsSUFBSSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0FBQ25DLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUU5QiwwQkFBMEI7QUFDMUIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDO0FBQzNCLE1BQWMsQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDO0FBRWxDLFFBQVEsQ0FBQywwQ0FBMEMsRUFBRSxHQUFHLEVBQUU7SUFDeEQsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUVyQiw2QkFBNkI7UUFDN0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsR0FBRyx3QkFBd0IsQ0FBQztRQUN6RCxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksR0FBRyxjQUFjLENBQUM7SUFDNUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMseUNBQXlDLEVBQUUsR0FBRyxFQUFFO1FBQ3ZELEVBQUUsQ0FBQyxnREFBZ0QsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM5RCxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQztZQUNsQyxNQUFNLE1BQU0sR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRTFCLDRDQUE0QztZQUM1QyxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDdkQsRUFBRSxFQUFFLElBQUksR0FBRyxDQUFDO2dCQUNaLEtBQUssRUFBRSxn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QUMsQ0FBQztZQUM1RSxNQUFNLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqRCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyx5Q0FBeUMsRUFBRSxHQUFHLEVBQUU7WUFDakQsTUFBTSxNQUFNLEdBQUcsQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ25ELE1BQU0sTUFBTSxHQUFHLHFDQUFpQixDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUV4RCxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUM1RCxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNyQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogVW5pdCBUZXN0cyBmb3IgR2VucmUgRmlsdGVyaW5nIFN5c3RlbVxyXG4gKiBGZWF0dXJlOiB0cmluaXR5LXZvdGluZy1maXhlc1xyXG4gKiBcclxuICogUHJvcGVydHkgOTogR2VucmUgRmlsdGVyaW5nIENvbnNpc3RlbmN5XHJcbiAqIFZhbGlkYXRlczogUmVxdWlyZW1lbnRzIDQuMiwgNS4yXHJcbiAqIFxyXG4gKiBGb3IgYW55IHJvb20gd2l0aCBzcGVjaWZpZWQgZ2VucmVzLCBhbGwgY2FjaGVkIG1vdmllcyBzaG91bGQgYmVsb25nIFxyXG4gKiB0byBhdCBsZWFzdCBvbmUgb2YgdGhlIHNwZWNpZmllZCBnZW5yZXNcclxuICovXHJcblxyXG5pbXBvcnQgeyBtb3ZpZUNhY2hlU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL21vdmllQ2FjaGVTZXJ2aWNlJztcclxuXHJcbi8vIE1vY2sgRHluYW1vREIgYW5kIFRNREIgQVBJXHJcbmplc3QubW9jaygnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XHJcbmplc3QubW9jaygnLi4vdXRpbHMvbWV0cmljcycpO1xyXG5cclxuLy8gTW9jayBmZXRjaCBmb3IgVE1EQiBBUElcclxuY29uc3QgbW9ja0ZldGNoID0gamVzdC5mbigpO1xyXG4oZ2xvYmFsIGFzIGFueSkuZmV0Y2ggPSBtb2NrRmV0Y2g7XHJcblxyXG5kZXNjcmliZSgnR2VucmUgRmlsdGVyaW5nIENvbnNpc3RlbmN5IC0gVW5pdCBUZXN0cycsICgpID0+IHtcclxuICBiZWZvcmVFYWNoKCgpID0+IHtcclxuICAgIGplc3QuY2xlYXJBbGxNb2NrcygpO1xyXG4gICAgXHJcbiAgICAvLyBNb2NrIGVudmlyb25tZW50IHZhcmlhYmxlc1xyXG4gICAgcHJvY2Vzcy5lbnYuTU9WSUVfQ0FDSEVfVEFCTEUgPSAndGVzdC1tb3ZpZS1jYWNoZS10YWJsZSc7XHJcbiAgICBwcm9jZXNzLmVudi5UTURCX0FQSV9LRVkgPSAndGVzdC1hcGkta2V5JztcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ1Byb3BlcnR5IDk6IEdlbnJlIEZpbHRlcmluZyBDb25zaXN0ZW5jeScsICgpID0+IHtcclxuICAgIGl0KCdzaG91bGQgZmlsdGVyIG1vdmllcyBieSBzaW5nbGUgZ2VucmUgY29ycmVjdGx5JywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLWFjdGlvbic7XHJcbiAgICAgIGNvbnN0IGdlbnJlcyA9IFsnQWN0aW9uJ107XHJcblxyXG4gICAgICAvLyBNb2NrIFRNREIgQVBJIHJlc3BvbnNlIHdpdGggQWN0aW9uIG1vdmllc1xyXG4gICAgICBjb25zdCBtb2NrTW92aWVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMjAgfSwgKF8sIGkpID0+ICh7XHJcbiAgICAgICAgaWQ6IDEwMDAgKyBpLFxyXG4gICAgICAgIHRpdGxlOiBgQWN0aW9uIE1vdmllICR7aSArIDF9YCxcclxuICAgICAgICBwb3N0ZXJfcGF0aDogYC9hY3Rpb24ke2kgKyAxfS5qcGdgLFxyXG4gICAgICAgIG92ZXJ2aWV3OiBgQWN0aW9uLXBhY2tlZCBtb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgZ2VucmVfaWRzOiBbMjhdLCAvLyBBY3Rpb24gZ2VucmUgSURcclxuICAgICAgICByZWxlYXNlX2RhdGU6ICcyMDIzLTAxLTAxJyxcclxuICAgICAgICB2b3RlX2F2ZXJhZ2U6IDcuNSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgbW9ja0ZldGNoLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XHJcbiAgICAgICAgb2s6IHRydWUsXHJcbiAgICAgICAganNvbjogYXN5bmMgKCkgPT4gKHtcclxuICAgICAgICAgIHJlc3VsdHM6IG1vY2tNb3ZpZXMsXHJcbiAgICAgICAgICB0b3RhbF9wYWdlczogMSxcclxuICAgICAgICAgIHRvdGFsX3Jlc3VsdHM6IG1vY2tNb3ZpZXMubGVuZ3RoLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG4gICAgICBjb25zdCBtb2NrU2VuZCA9IGplc3QuZm4oKVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIGdldENhY2hlZE1vdmllcyByZXR1cm5zIGVtcHR5XHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSk7IC8vIHN0b3JlQ2FjaGVJbkR5bmFtb0RCIHN1Y2NlZWRzXHJcblxyXG4gICAgICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20gPSBqZXN0LmZuKCkubW9ja1JldHVyblZhbHVlKHtcclxuICAgICAgICBzZW5kOiBtb2NrU2VuZCxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBFeGVjdXRlIHByZS1jYWNoaW5nIHdpdGggQWN0aW9uIGdlbnJlXHJcbiAgICAgIGNvbnN0IGNhY2hlZE1vdmllcyA9IGF3YWl0IG1vdmllQ2FjaGVTZXJ2aWNlLnByZUNhY2hlTW92aWVzKHJvb21JZCwgZ2VucmVzKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBhbGwgbW92aWVzIGhhdmUgQWN0aW9uIGdlbnJlXHJcbiAgICAgIGV4cGVjdChjYWNoZWRNb3ZpZXMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMCk7XHJcbiAgICAgIGNhY2hlZE1vdmllcy5mb3JFYWNoKG1vdmllID0+IHtcclxuICAgICAgICBleHBlY3QobW92aWUuZ2VucmVzKS50b0NvbnRhaW4oJ0FjdGlvbicpO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBUTURCIEFQSSB3YXMgY2FsbGVkIHdpdGggY29ycmVjdCBnZW5yZSBmaWx0ZXJcclxuICAgICAgZXhwZWN0KG1vY2tGZXRjaCkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXHJcbiAgICAgICAgZXhwZWN0LnN0cmluZ0NvbnRhaW5pbmcoJ3dpdGhfZ2VucmVzPTI4JylcclxuICAgICAgKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgZmlsdGVyIG1vdmllcyBieSBtdWx0aXBsZSBnZW5yZXMgY29ycmVjdGx5JywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLW11bHRpLWdlbnJlJztcclxuICAgICAgY29uc3QgZ2VucmVzID0gWydBY3Rpb24nLCAnQ29tZWR5JywgJ0RyYW1hJ107XHJcblxyXG4gICAgICAvLyBNb2NrIFRNREIgQVBJIHJlc3BvbnNlIHdpdGggbWl4ZWQgZ2VucmUgbW92aWVzXHJcbiAgICAgIGNvbnN0IG1vY2tNb3ZpZXMgPSBbXHJcbiAgICAgICAgLy8gQWN0aW9uIG1vdmllc1xyXG4gICAgICAgIC4uLkFycmF5LmZyb20oeyBsZW5ndGg6IDEwIH0sIChfLCBpKSA9PiAoe1xyXG4gICAgICAgICAgaWQ6IDIwMDAgKyBpLFxyXG4gICAgICAgICAgdGl0bGU6IGBBY3Rpb24gTW92aWUgJHtpICsgMX1gLFxyXG4gICAgICAgICAgcG9zdGVyX3BhdGg6IGAvYWN0aW9uJHtpICsgMX0uanBnYCxcclxuICAgICAgICAgIG92ZXJ2aWV3OiBgQWN0aW9uIG1vdmllICR7aSArIDF9YCxcclxuICAgICAgICAgIGdlbnJlX2lkczogWzI4XSwgLy8gQWN0aW9uXHJcbiAgICAgICAgICByZWxlYXNlX2RhdGU6ICcyMDIzLTAxLTAxJyxcclxuICAgICAgICAgIHZvdGVfYXZlcmFnZTogNy41LFxyXG4gICAgICAgIH0pKSxcclxuICAgICAgICAvLyBDb21lZHkgbW92aWVzXHJcbiAgICAgICAgLi4uQXJyYXkuZnJvbSh7IGxlbmd0aDogMTAgfSwgKF8sIGkpID0+ICh7XHJcbiAgICAgICAgICBpZDogMzAwMCArIGksXHJcbiAgICAgICAgICB0aXRsZTogYENvbWVkeSBNb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgICBwb3N0ZXJfcGF0aDogYC9jb21lZHkke2kgKyAxfS5qcGdgLFxyXG4gICAgICAgICAgb3ZlcnZpZXc6IGBDb21lZHkgbW92aWUgJHtpICsgMX1gLFxyXG4gICAgICAgICAgZ2VucmVfaWRzOiBbMzVdLCAvLyBDb21lZHlcclxuICAgICAgICAgIHJlbGVhc2VfZGF0ZTogJzIwMjMtMDEtMDEnLFxyXG4gICAgICAgICAgdm90ZV9hdmVyYWdlOiA3LjAsXHJcbiAgICAgICAgfSkpLFxyXG4gICAgICAgIC8vIERyYW1hIG1vdmllc1xyXG4gICAgICAgIC4uLkFycmF5LmZyb20oeyBsZW5ndGg6IDEwIH0sIChfLCBpKSA9PiAoe1xyXG4gICAgICAgICAgaWQ6IDQwMDAgKyBpLFxyXG4gICAgICAgICAgdGl0bGU6IGBEcmFtYSBNb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgICBwb3N0ZXJfcGF0aDogYC9kcmFtYSR7aSArIDF9LmpwZ2AsXHJcbiAgICAgICAgICBvdmVydmlldzogYERyYW1hIG1vdmllICR7aSArIDF9YCxcclxuICAgICAgICAgIGdlbnJlX2lkczogWzE4XSwgLy8gRHJhbWFcclxuICAgICAgICAgIHJlbGVhc2VfZGF0ZTogJzIwMjMtMDEtMDEnLFxyXG4gICAgICAgICAgdm90ZV9hdmVyYWdlOiA4LjAsXHJcbiAgICAgICAgfSkpLFxyXG4gICAgICBdO1xyXG5cclxuICAgICAgbW9ja0ZldGNoLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XHJcbiAgICAgICAgb2s6IHRydWUsXHJcbiAgICAgICAganNvbjogYXN5bmMgKCkgPT4gKHtcclxuICAgICAgICAgIHJlc3VsdHM6IG1vY2tNb3ZpZXMsXHJcbiAgICAgICAgICB0b3RhbF9wYWdlczogMSxcclxuICAgICAgICAgIHRvdGFsX3Jlc3VsdHM6IG1vY2tNb3ZpZXMubGVuZ3RoLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG4gICAgICBjb25zdCBtb2NrU2VuZCA9IGplc3QuZm4oKVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIGdldENhY2hlZE1vdmllcyByZXR1cm5zIGVtcHR5XHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSk7IC8vIHN0b3JlQ2FjaGVJbkR5bmFtb0RCIHN1Y2NlZWRzXHJcblxyXG4gICAgICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20gPSBqZXN0LmZuKCkubW9ja1JldHVyblZhbHVlKHtcclxuICAgICAgICBzZW5kOiBtb2NrU2VuZCxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBFeGVjdXRlIHByZS1jYWNoaW5nIHdpdGggbXVsdGlwbGUgZ2VucmVzXHJcbiAgICAgIGNvbnN0IGNhY2hlZE1vdmllcyA9IGF3YWl0IG1vdmllQ2FjaGVTZXJ2aWNlLnByZUNhY2hlTW92aWVzKHJvb21JZCwgZ2VucmVzKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBhbGwgbW92aWVzIGhhdmUgYXQgbGVhc3Qgb25lIG9mIHRoZSByZXF1ZXN0ZWQgZ2VucmVzXHJcbiAgICAgIGV4cGVjdChjYWNoZWRNb3ZpZXMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMCk7XHJcbiAgICAgIGNhY2hlZE1vdmllcy5mb3JFYWNoKG1vdmllID0+IHtcclxuICAgICAgICBjb25zdCBoYXNSZXF1ZXN0ZWRHZW5yZSA9IG1vdmllLmdlbnJlcy5zb21lKG1vdmllR2VucmUgPT5cclxuICAgICAgICAgIGdlbnJlcy5zb21lKHJlcXVlc3RlZEdlbnJlID0+XHJcbiAgICAgICAgICAgIG1vdmllR2VucmUudG9Mb3dlckNhc2UoKSA9PT0gcmVxdWVzdGVkR2VucmUudG9Mb3dlckNhc2UoKVxyXG4gICAgICAgICAgKVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgZXhwZWN0KGhhc1JlcXVlc3RlZEdlbnJlKS50b0JlKHRydWUpO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBUTURCIEFQSSB3YXMgY2FsbGVkIHdpdGggY29ycmVjdCBnZW5yZSBmaWx0ZXJzXHJcbiAgICAgIGV4cGVjdChtb2NrRmV0Y2gpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxyXG4gICAgICAgIGV4cGVjdC5zdHJpbmdDb250YWluaW5nKCd3aXRoX2dlbnJlcz0yOCwzNSwxOCcpXHJcbiAgICAgICk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBpbnZhbGlkIGdlbnJlcyBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLWludmFsaWQtZ2VucmVzJztcclxuICAgICAgY29uc3QgZ2VucmVzID0gWydJbnZhbGlkR2VucmUnLCAnQW5vdGhlckludmFsaWRHZW5yZSddO1xyXG5cclxuICAgICAgLy8gTW9jayBUTURCIEFQSSByZXNwb25zZSB3aXRoIHBvcHVsYXIgbW92aWVzIChubyBnZW5yZSBmaWx0ZXIgYXBwbGllZClcclxuICAgICAgY29uc3QgbW9ja01vdmllcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDIwIH0sIChfLCBpKSA9PiAoe1xyXG4gICAgICAgIGlkOiA1MDAwICsgaSxcclxuICAgICAgICB0aXRsZTogYFBvcHVsYXIgTW92aWUgJHtpICsgMX1gLFxyXG4gICAgICAgIHBvc3Rlcl9wYXRoOiBgL3BvcHVsYXIke2kgKyAxfS5qcGdgLFxyXG4gICAgICAgIG92ZXJ2aWV3OiBgUG9wdWxhciBtb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgZ2VucmVfaWRzOiBbMjgsIDM1LCAxOF0sIC8vIE1peGVkIGdlbnJlc1xyXG4gICAgICAgIHJlbGVhc2VfZGF0ZTogJzIwMjMtMDEtMDEnLFxyXG4gICAgICAgIHZvdGVfYXZlcmFnZTogNy41LFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBtb2NrRmV0Y2gubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHtcclxuICAgICAgICBvazogdHJ1ZSxcclxuICAgICAgICBqc29uOiBhc3luYyAoKSA9PiAoe1xyXG4gICAgICAgICAgcmVzdWx0czogbW9ja01vdmllcyxcclxuICAgICAgICAgIHRvdGFsX3BhZ2VzOiAxLFxyXG4gICAgICAgICAgdG90YWxfcmVzdWx0czogbW9ja01vdmllcy5sZW5ndGgsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zXHJcbiAgICAgIGNvbnN0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XHJcbiAgICAgIGNvbnN0IG1vY2tTZW5kID0gamVzdC5mbigpXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IEl0ZW06IG51bGwgfSkgLy8gZ2V0Q2FjaGVkTW92aWVzIHJldHVybnMgZW1wdHlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHt9KTsgLy8gc3RvcmVDYWNoZUluRHluYW1vREIgc3VjY2VlZHNcclxuXHJcbiAgICAgIER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbSA9IGplc3QuZm4oKS5tb2NrUmV0dXJuVmFsdWUoe1xyXG4gICAgICAgIHNlbmQ6IG1vY2tTZW5kLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIEV4ZWN1dGUgcHJlLWNhY2hpbmcgd2l0aCBpbnZhbGlkIGdlbnJlc1xyXG4gICAgICBjb25zdCBjYWNoZWRNb3ZpZXMgPSBhd2FpdCBtb3ZpZUNhY2hlU2VydmljZS5wcmVDYWNoZU1vdmllcyhyb29tSWQsIGdlbnJlcyk7XHJcblxyXG4gICAgICAvLyBTaG91bGQgc3RpbGwgcmV0dXJuIG1vdmllcyAoZmFsbGJhY2sgdG8gcG9wdWxhciBtb3ZpZXMpXHJcbiAgICAgIGV4cGVjdChjYWNoZWRNb3ZpZXMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMCk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgVE1EQiBBUEkgd2FzIGNhbGxlZCB3aXRob3V0IGdlbnJlIGZpbHRlcnMgKGludmFsaWQgZ2VucmVzIGlnbm9yZWQpXHJcbiAgICAgIGV4cGVjdChtb2NrRmV0Y2gpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxyXG4gICAgICAgIGV4cGVjdC5ub3Quc3RyaW5nQ29udGFpbmluZygnd2l0aF9nZW5yZXM9JylcclxuICAgICAgKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1peGVkIHZhbGlkIGFuZCBpbnZhbGlkIGdlbnJlcycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbS1taXhlZC1nZW5yZXMnO1xyXG4gICAgICBjb25zdCBnZW5yZXMgPSBbJ0FjdGlvbicsICdJbnZhbGlkR2VucmUnLCAnQ29tZWR5J107XHJcblxyXG4gICAgICAvLyBNb2NrIFRNREIgQVBJIHJlc3BvbnNlIHdpdGggQWN0aW9uIGFuZCBDb21lZHkgbW92aWVzXHJcbiAgICAgIGNvbnN0IG1vY2tNb3ZpZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAyMCB9LCAoXywgaSkgPT4gKHtcclxuICAgICAgICBpZDogNjAwMCArIGksXHJcbiAgICAgICAgdGl0bGU6IGBNaXhlZCBHZW5yZSBNb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgcG9zdGVyX3BhdGg6IGAvbWl4ZWQke2kgKyAxfS5qcGdgLFxyXG4gICAgICAgIG92ZXJ2aWV3OiBgTWl4ZWQgZ2VucmUgbW92aWUgJHtpICsgMX1gLFxyXG4gICAgICAgIGdlbnJlX2lkczogaSAlIDIgPT09IDAgPyBbMjhdIDogWzM1XSwgLy8gQWx0ZXJuYXRlIGJldHdlZW4gQWN0aW9uIGFuZCBDb21lZHlcclxuICAgICAgICByZWxlYXNlX2RhdGU6ICcyMDIzLTAxLTAxJyxcclxuICAgICAgICB2b3RlX2F2ZXJhZ2U6IDcuNSxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgbW9ja0ZldGNoLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XHJcbiAgICAgICAgb2s6IHRydWUsXHJcbiAgICAgICAganNvbjogYXN5bmMgKCkgPT4gKHtcclxuICAgICAgICAgIHJlc3VsdHM6IG1vY2tNb3ZpZXMsXHJcbiAgICAgICAgICB0b3RhbF9wYWdlczogMSxcclxuICAgICAgICAgIHRvdGFsX3Jlc3VsdHM6IG1vY2tNb3ZpZXMubGVuZ3RoLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG4gICAgICBjb25zdCBtb2NrU2VuZCA9IGplc3QuZm4oKVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIGdldENhY2hlZE1vdmllcyByZXR1cm5zIGVtcHR5XHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSk7IC8vIHN0b3JlQ2FjaGVJbkR5bmFtb0RCIHN1Y2NlZWRzXHJcblxyXG4gICAgICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20gPSBqZXN0LmZuKCkubW9ja1JldHVyblZhbHVlKHtcclxuICAgICAgICBzZW5kOiBtb2NrU2VuZCxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBFeGVjdXRlIHByZS1jYWNoaW5nIHdpdGggbWl4ZWQgdmFsaWQvaW52YWxpZCBnZW5yZXNcclxuICAgICAgY29uc3QgY2FjaGVkTW92aWVzID0gYXdhaXQgbW92aWVDYWNoZVNlcnZpY2UucHJlQ2FjaGVNb3ZpZXMocm9vbUlkLCBnZW5yZXMpO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IGFsbCBtb3ZpZXMgaGF2ZSBhdCBsZWFzdCBvbmUgdmFsaWQgZ2VucmUgKEFjdGlvbiBvciBDb21lZHkpXHJcbiAgICAgIGV4cGVjdChjYWNoZWRNb3ZpZXMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMCk7XHJcbiAgICAgIGNhY2hlZE1vdmllcy5mb3JFYWNoKG1vdmllID0+IHtcclxuICAgICAgICBjb25zdCBoYXNWYWxpZEdlbnJlID0gbW92aWUuZ2VucmVzLnNvbWUobW92aWVHZW5yZSA9PlxyXG4gICAgICAgICAgWydBY3Rpb24nLCAnQ29tZWR5J10uaW5jbHVkZXMobW92aWVHZW5yZSlcclxuICAgICAgICApO1xyXG4gICAgICAgIGV4cGVjdChoYXNWYWxpZEdlbnJlKS50b0JlKHRydWUpO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBUTURCIEFQSSB3YXMgY2FsbGVkIHdpdGggb25seSB2YWxpZCBnZW5yZSBmaWx0ZXJzICgyOD1BY3Rpb24sIDM1PUNvbWVkeSlcclxuICAgICAgZXhwZWN0KG1vY2tGZXRjaCkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXHJcbiAgICAgICAgZXhwZWN0LnN0cmluZ0NvbnRhaW5pbmcoJ3dpdGhfZ2VucmVzPTI4LDM1JylcclxuICAgICAgKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgZGVmYXVsdCB0byBwb3B1bGFyIG1vdmllcyB3aGVuIG5vIGdlbnJlcyBzcGVjaWZpZWQnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20tbm8tZ2VucmVzJztcclxuXHJcbiAgICAgIC8vIE1vY2sgVE1EQiBBUEkgcmVzcG9uc2Ugd2l0aCBwb3B1bGFyIG1vdmllcyBhY3Jvc3MgYWxsIGdlbnJlc1xyXG4gICAgICBjb25zdCBtb2NrTW92aWVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMjAgfSwgKF8sIGkpID0+ICh7XHJcbiAgICAgICAgaWQ6IDcwMDAgKyBpLFxyXG4gICAgICAgIHRpdGxlOiBgUG9wdWxhciBNb3ZpZSAke2kgKyAxfWAsXHJcbiAgICAgICAgcG9zdGVyX3BhdGg6IGAvcG9wdWxhciR7aSArIDF9LmpwZ2AsXHJcbiAgICAgICAgb3ZlcnZpZXc6IGBQb3B1bGFyIG1vdmllICR7aSArIDF9YCxcclxuICAgICAgICBnZW5yZV9pZHM6IFsyOCwgMzUsIDE4LCA1MywgODc4XSwgLy8gTWl4ZWQgZ2VucmVzXHJcbiAgICAgICAgcmVsZWFzZV9kYXRlOiAnMjAyMy0wMS0wMScsXHJcbiAgICAgICAgdm90ZV9hdmVyYWdlOiA4LjAsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIG1vY2tGZXRjaC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe1xyXG4gICAgICAgIG9rOiB0cnVlLFxyXG4gICAgICAgIGpzb246IGFzeW5jICgpID0+ICh7XHJcbiAgICAgICAgICByZXN1bHRzOiBtb2NrTW92aWVzLFxyXG4gICAgICAgICAgdG90YWxfcGFnZXM6IDEsXHJcbiAgICAgICAgICB0b3RhbF9yZXN1bHRzOiBtb2NrTW92aWVzLmxlbmd0aCxcclxuICAgICAgICB9KSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgY29uc3QgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50IH0gPSByZXF1aXJlKCdAYXdzLXNkay9saWItZHluYW1vZGInKTtcclxuICAgICAgY29uc3QgbW9ja1NlbmQgPSBqZXN0LmZuKClcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgSXRlbTogbnVsbCB9KSAvLyBnZXRDYWNoZWRNb3ZpZXMgcmV0dXJucyBlbXB0eVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pOyAvLyBzdG9yZUNhY2hlSW5EeW5hbW9EQiBzdWNjZWVkc1xyXG5cclxuICAgICAgRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tID0gamVzdC5mbigpLm1vY2tSZXR1cm5WYWx1ZSh7XHJcbiAgICAgICAgc2VuZDogbW9ja1NlbmQsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gRXhlY3V0ZSBwcmUtY2FjaGluZyB3aXRob3V0IGdlbnJlc1xyXG4gICAgICBjb25zdCBjYWNoZWRNb3ZpZXMgPSBhd2FpdCBtb3ZpZUNhY2hlU2VydmljZS5wcmVDYWNoZU1vdmllcyhyb29tSWQpO1xyXG5cclxuICAgICAgLy8gU2hvdWxkIHJldHVybiBtb3ZpZXMgZnJvbSB2YXJpb3VzIGdlbnJlc1xyXG4gICAgICBleHBlY3QoY2FjaGVkTW92aWVzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xyXG4gICAgICBcclxuICAgICAgLy8gQ29sbGVjdCBhbGwgZ2VucmVzIGZyb20gY2FjaGVkIG1vdmllc1xyXG4gICAgICBjb25zdCBhbGxHZW5yZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcclxuICAgICAgY2FjaGVkTW92aWVzLmZvckVhY2gobW92aWUgPT4ge1xyXG4gICAgICAgIG1vdmllLmdlbnJlcy5mb3JFYWNoKGdlbnJlID0+IGFsbEdlbnJlcy5hZGQoZ2VucmUpKTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBTaG91bGQgaGF2ZSBtb3ZpZXMgZnJvbSBtdWx0aXBsZSBnZW5yZXMgKHBvcHVsYXIgbW92aWVzIGFjcm9zcyBhbGwgZ2VucmVzKVxyXG4gICAgICBleHBlY3QoYWxsR2VucmVzLnNpemUpLnRvQmVHcmVhdGVyVGhhbigxKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBUTURCIEFQSSB3YXMgY2FsbGVkIHdpdGhvdXQgZ2VucmUgZmlsdGVyc1xyXG4gICAgICBleHBlY3QobW9ja0ZldGNoKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcclxuICAgICAgICBleHBlY3Qubm90LnN0cmluZ0NvbnRhaW5pbmcoJ3dpdGhfZ2VucmVzPScpXHJcbiAgICAgICk7XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ0dlbnJlIFZhbGlkYXRpb24nLCAoKSA9PiB7XHJcbiAgICBpdCgnc2hvdWxkIHZhbGlkYXRlIGdlbnJlIG5hbWVzIGNvcnJlY3RseScsICgpID0+IHtcclxuICAgICAgY29uc3QgdmFsaWRHZW5yZXMgPSBbJ0FjdGlvbicsICdDb21lZHknLCAnRHJhbWEnXTtcclxuICAgICAgY29uc3QgaW52YWxpZEdlbnJlcyA9IFsnSW52YWxpZEdlbnJlJywgJ0Fub3RoZXJJbnZhbGlkJ107XHJcbiAgICAgIGNvbnN0IG1peGVkR2VucmVzID0gWy4uLnZhbGlkR2VucmVzLCAuLi5pbnZhbGlkR2VucmVzXTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IG1vdmllQ2FjaGVTZXJ2aWNlLnZhbGlkYXRlR2VucmVzKG1peGVkR2VucmVzKTtcclxuXHJcbiAgICAgIGV4cGVjdChyZXN1bHQudmFsaWQpLnRvRXF1YWwoZXhwZWN0LmFycmF5Q29udGFpbmluZyh2YWxpZEdlbnJlcykpO1xyXG4gICAgICBleHBlY3QocmVzdWx0LmludmFsaWQpLnRvRXF1YWwoZXhwZWN0LmFycmF5Q29udGFpbmluZyhpbnZhbGlkR2VucmVzKSk7XHJcbiAgICAgIGV4cGVjdChyZXN1bHQudmFsaWQubGVuZ3RoKS50b0JlKDMpO1xyXG4gICAgICBleHBlY3QocmVzdWx0LmludmFsaWQubGVuZ3RoKS50b0JlKDIpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gYXZhaWxhYmxlIGdlbnJlcyBsaXN0JywgKCkgPT4ge1xyXG4gICAgICBjb25zdCBhdmFpbGFibGVHZW5yZXMgPSBtb3ZpZUNhY2hlU2VydmljZS5nZXRBdmFpbGFibGVHZW5yZXMoKTtcclxuXHJcbiAgICAgIGV4cGVjdChhdmFpbGFibGVHZW5yZXMpLnRvQ29udGFpbignQWN0aW9uJyk7XHJcbiAgICAgIGV4cGVjdChhdmFpbGFibGVHZW5yZXMpLnRvQ29udGFpbignQ29tZWR5Jyk7XHJcbiAgICAgIGV4cGVjdChhdmFpbGFibGVHZW5yZXMpLnRvQ29udGFpbignRHJhbWEnKTtcclxuICAgICAgZXhwZWN0KGF2YWlsYWJsZUdlbnJlcykudG9Db250YWluKCdIb3Jyb3InKTtcclxuICAgICAgZXhwZWN0KGF2YWlsYWJsZUdlbnJlcykudG9Db250YWluKCdTY2llbmNlIEZpY3Rpb24nKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFNob3VsZCBiZSBzb3J0ZWQgYWxwaGFiZXRpY2FsbHlcclxuICAgICAgY29uc3Qgc29ydGVkR2VucmVzID0gWy4uLmF2YWlsYWJsZUdlbnJlc10uc29ydCgpO1xyXG4gICAgICBleHBlY3QoYXZhaWxhYmxlR2VucmVzKS50b0VxdWFsKHNvcnRlZEdlbnJlcyk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBjYXNlLWluc2Vuc2l0aXZlIGdlbnJlIHZhbGlkYXRpb24nLCAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGdlbnJlcyA9IFsnYWN0aW9uJywgJ0NPTUVEWScsICdEcmFtYSddO1xyXG4gICAgICBjb25zdCByZXN1bHQgPSBtb3ZpZUNhY2hlU2VydmljZS52YWxpZGF0ZUdlbnJlcyhnZW5yZXMpO1xyXG5cclxuICAgICAgZXhwZWN0KHJlc3VsdC52YWxpZCkudG9FcXVhbChbJ0FjdGlvbicsICdDb21lZHknLCAnRHJhbWEnXSk7XHJcbiAgICAgIGV4cGVjdChyZXN1bHQuaW52YWxpZCkudG9FcXVhbChbXSk7XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ0dlbnJlIEZpbHRlcmluZyBFZGdlIENhc2VzJywgKCkgPT4ge1xyXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgZ2VucmUgYXJyYXknLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20tZW1wdHktZ2VucmVzJztcclxuICAgICAgY29uc3QgZ2VucmVzOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgICAgLy8gTW9jayBUTURCIEFQSSByZXNwb25zZVxyXG4gICAgICBjb25zdCBtb2NrTW92aWVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMjAgfSwgKF8sIGkpID0+ICh7XHJcbiAgICAgICAgaWQ6IDgwMDAgKyBpLFxyXG4gICAgICAgIHRpdGxlOiBgTW92aWUgJHtpICsgMX1gLFxyXG4gICAgICAgIHBvc3Rlcl9wYXRoOiBgL21vdmllJHtpICsgMX0uanBnYCxcclxuICAgICAgICBvdmVydmlldzogYE1vdmllICR7aSArIDF9YCxcclxuICAgICAgICBnZW5yZV9pZHM6IFsyOCwgMzVdLFxyXG4gICAgICAgIHJlbGVhc2VfZGF0ZTogJzIwMjMtMDEtMDEnLFxyXG4gICAgICAgIHZvdGVfYXZlcmFnZTogNy4wLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBtb2NrRmV0Y2gubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHtcclxuICAgICAgICBvazogdHJ1ZSxcclxuICAgICAgICBqc29uOiBhc3luYyAoKSA9PiAoe1xyXG4gICAgICAgICAgcmVzdWx0czogbW9ja01vdmllcyxcclxuICAgICAgICAgIHRvdGFsX3BhZ2VzOiAxLFxyXG4gICAgICAgICAgdG90YWxfcmVzdWx0czogbW9ja01vdmllcy5sZW5ndGgsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zXHJcbiAgICAgIGNvbnN0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XHJcbiAgICAgIGNvbnN0IG1vY2tTZW5kID0gamVzdC5mbigpXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IEl0ZW06IG51bGwgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHt9KTtcclxuXHJcbiAgICAgIER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbSA9IGplc3QuZm4oKS5tb2NrUmV0dXJuVmFsdWUoe1xyXG4gICAgICAgIHNlbmQ6IG1vY2tTZW5kLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFNob3VsZCB3b3JrIHRoZSBzYW1lIGFzIG5vIGdlbnJlcyBzcGVjaWZpZWRcclxuICAgICAgY29uc3QgY2FjaGVkTW92aWVzID0gYXdhaXQgbW92aWVDYWNoZVNlcnZpY2UucHJlQ2FjaGVNb3ZpZXMocm9vbUlkLCBnZW5yZXMpO1xyXG4gICAgICBleHBlY3QoY2FjaGVkTW92aWVzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgd2hpdGVzcGFjZSBpbiBnZW5yZSBuYW1lcycsICgpID0+IHtcclxuICAgICAgY29uc3QgZ2VucmVzID0gWycgQWN0aW9uICcsICcgIENvbWVkeSAgJywgJ0RyYW1hJ107XHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IG1vdmllQ2FjaGVTZXJ2aWNlLnZhbGlkYXRlR2VucmVzKGdlbnJlcyk7XHJcblxyXG4gICAgICBleHBlY3QocmVzdWx0LnZhbGlkKS50b0VxdWFsKFsnQWN0aW9uJywgJ0NvbWVkeScsICdEcmFtYSddKTtcclxuICAgICAgZXhwZWN0KHJlc3VsdC5pbnZhbGlkKS50b0VxdWFsKFtdKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59KTsiXX0=