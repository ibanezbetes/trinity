"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fc = __importStar(require("fast-check"));
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
const movieCacheService_1 = require("../services/movieCacheService");
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
        await fc.assert(fc.asyncProperty(
        // Generate arbitrary room IDs
        fc.string({ minLength: 10, maxLength: 50 }), 
        // Generate arbitrary cached movies (1-50 movies)
        fc.array(fc.record({
            tmdbId: fc.integer({ min: 1, max: 999999 }),
            title: fc.string({ minLength: 1, maxLength: 100 }),
            posterPath: fc.webUrl(),
            overview: fc.string({ minLength: 10, maxLength: 500 }),
            genres: fc.array(fc.constantFrom('Action', 'Comedy', 'Drama', 'Horror', 'Romance'), { minLength: 1, maxLength: 3 }),
            year: fc.integer({ min: 1900, max: 2030 }),
            rating: fc.float({ min: 0, max: 10 }),
            cachedAt: fc.constant(new Date().toISOString()),
            ttl: fc.integer({ min: Date.now(), max: Date.now() + 86400000 }), // Valid TTL (not expired)
        }), { minLength: 1, maxLength: 50 }), 
        // Generate arbitrary genres
        fc.array(fc.constantFrom('Action', 'Comedy', 'Drama', 'Horror', 'Romance'), { maxLength: 3 }), async (roomId, cachedMovies, genres) => {
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
            const result = await movieCacheService_1.movieCacheService.getCachedMovies(roomId);
            // Assertion 1: Should return cached movies
            expect(result).toHaveLength(cachedMovies.length);
            expect(result).toEqual(cachedMovies);
            // Assertion 2: Should have called DynamoDB to get cache
            expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
                params: expect.objectContaining({
                    TableName: 'test-movie-cache-table',
                    Key: { cacheKey: roomId },
                }),
            }));
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
        }), {
            numRuns: 100, // Run 100 iterations as specified in design
            timeout: 5000,
        });
    });
    /**
     * Property Test: Cache Miss Behavior
     *
     * When cache is empty or expired, the system should fall back to API calls
     * This tests the inverse to ensure our cache utilization test is meaningful
     */
    it('should fall back to API when cache is empty or expired', async () => {
        await fc.assert(fc.asyncProperty(
        // Generate arbitrary room IDs
        fc.string({ minLength: 10, maxLength: 50 }), 
        // Generate arbitrary genres
        fc.array(fc.constantFrom('Action', 'Comedy', 'Drama', 'Horror', 'Romance'), { maxLength: 3 }), async (roomId, genres) => {
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
            const result = await movieCacheService_1.movieCacheService.preCacheMovies(roomId, genres);
            // Assertion 1: Should have called DynamoDB to check for existing cache
            expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
                params: expect.objectContaining({
                    TableName: 'test-movie-cache-table',
                    Key: { cacheKey: roomId },
                }),
            }));
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
        }), {
            numRuns: 50, // Fewer runs for the inverse test
            timeout: 5000,
        });
    });
    /**
     * Property Test: Cache Expiration Behavior
     *
     * When cache exists but is expired, system should not use it and should fetch fresh data
     */
    it('should not use expired cache and should fetch fresh data', async () => {
        await fc.assert(fc.asyncProperty(
        // Generate arbitrary room IDs
        fc.string({ minLength: 10, maxLength: 50 }), 
        // Generate arbitrary expired cached movies
        fc.array(fc.record({
            tmdbId: fc.integer({ min: 1, max: 999999 }),
            title: fc.string({ minLength: 1, maxLength: 100 }),
            posterPath: fc.webUrl(),
            overview: fc.string({ minLength: 10, maxLength: 500 }),
            genres: fc.array(fc.constantFrom('Action', 'Comedy', 'Drama'), { minLength: 1, maxLength: 2 }),
            year: fc.integer({ min: 1900, max: 2030 }),
            rating: fc.float({ min: 0, max: 10 }),
            cachedAt: fc.constant(new Date(Date.now() - 86400000).toISOString()), // 24 hours ago
            ttl: fc.integer({ min: Date.now() - 86400000, max: Date.now() - 1 }), // Expired TTL
        }), { minLength: 1, maxLength: 20 }), async (roomId, expiredCachedMovies) => {
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
            const result = await movieCacheService_1.movieCacheService.getCachedMovies(roomId);
            // Assertion 1: Should return empty array for expired cache
            expect(result).toEqual([]);
            // Assertion 2: Should have called DynamoDB to check cache
            expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
                params: expect.objectContaining({
                    TableName: 'test-movie-cache-table',
                    Key: { cacheKey: roomId },
                }),
            }));
            // Assertion 3: Should not return expired movies
            expect(result).not.toEqual(expiredCachedMovies);
        }), {
            numRuns: 50,
            timeout: 5000,
        });
    });
    /**
     * Edge Case Test: Cache with Mixed TTL States
     *
     * Test behavior when cache contains movies with different expiration states
     */
    it('should handle cache consistently regardless of individual movie TTL variations', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 10, maxLength: 50 }), fc.integer({ min: 1, max: 30 }), async (roomId, movieCount) => {
            // Generate movies with consistent cache-level TTL (what matters for cache expiration)
            const validCacheMovies = Array.from({ length: movieCount }, (_, i) => ({
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
            const result = await movieCacheService_1.movieCacheService.getCachedMovies(roomId);
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
        }), {
            numRuns: 30,
            timeout: 3000,
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGUtdXRpbGl6YXRpb24ucHJvcGVydHkudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNhY2hlLXV0aWxpemF0aW9uLnByb3BlcnR5LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7R0FTRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCwrQ0FBaUM7QUFFakMsMkNBQTJDO0FBQzNDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztBQUMzQixJQUFJLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDeEMsY0FBYyxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUU7SUFDekIsc0JBQXNCLEVBQUU7UUFDdEIsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztZQUNuQixJQUFJLEVBQUUsUUFBUTtTQUNmLENBQUMsQ0FBQztLQUNKO0lBQ0QsVUFBVSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzdDLFVBQVUsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUM3QyxZQUFZLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDL0MsYUFBYSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0NBQ2pELENBQUMsQ0FBQyxDQUFDO0FBRUosdUJBQXVCO0FBQ3ZCLHFFQUErRTtBQUUvRSxlQUFlO0FB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QVEsRUFBRSw2Q0FBNkM7aUJBQzFFO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsNEJBQTRCO1lBQzVCLE1BQU0sTUFBTSxHQUFHLE1BQU0scUNBQWlCLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRS9ELHlEQUF5RDtZQUN6RCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUV6Qyw0REFBNEQ7WUFDNUQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBRXpDLDBEQUEwRDtZQUMxRCxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO2dCQUM5QixNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUM7Z0JBQ3hDLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsS0FBSyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3BELE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUMzQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FDRixFQUNEO1lBQ0UsT0FBTyxFQUFFLEVBQUU7WUFDWCxPQUFPLEVBQUUsSUFBSTtTQUNkLENBQ0YsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogUHJvcGVydHktQmFzZWQgVGVzdCBmb3IgQ2FjaGUgVXRpbGl6YXRpb25cclxuICogXHJcbiAqIFByb3BlcnR5IDExOiBDYWNoZSBVdGlsaXphdGlvblxyXG4gKiBGb3IgYW55IHZvdGluZyBzZXNzaW9uIHdpdGggcG9wdWxhdGVkIGNhY2hlLCB0aGUgc3lzdGVtIHNob3VsZCBzZXJ2ZSBtb3ZpZXMgZnJvbSBjYWNoZSBcclxuICogcmF0aGVyIHRoYW4gbWFraW5nIHJlYWwtdGltZSBBUEkgY2FsbHNcclxuICogXHJcbiAqIFZhbGlkYXRlczogUmVxdWlyZW1lbnRzIDQuNFxyXG4gKiBGZWF0dXJlOiB0cmluaXR5LXZvdGluZy1maXhlcywgUHJvcGVydHkgMTE6IENhY2hlIFV0aWxpemF0aW9uXHJcbiAqL1xyXG5cclxuaW1wb3J0ICogYXMgZmMgZnJvbSAnZmFzdC1jaGVjayc7XHJcblxyXG4vLyBNb2NrIER5bmFtb0RCIGZpcnN0IC0gYmVmb3JlIGFueSBpbXBvcnRzXHJcbmNvbnN0IG1vY2tTZW5kID0gamVzdC5mbigpO1xyXG5qZXN0Lm1vY2soJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicsICgpID0+ICh7XHJcbiAgRHluYW1vREJDbGllbnQ6IGplc3QuZm4oKSxcclxuICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50OiB7XHJcbiAgICBmcm9tOiBqZXN0LmZuKCgpID0+ICh7XHJcbiAgICAgIHNlbmQ6IG1vY2tTZW5kLFxyXG4gICAgfSkpLFxyXG4gIH0sXHJcbiAgUHV0Q29tbWFuZDogamVzdC5mbigocGFyYW1zKSA9PiAoeyBwYXJhbXMgfSkpLFxyXG4gIEdldENvbW1hbmQ6IGplc3QuZm4oKHBhcmFtcykgPT4gKHsgcGFyYW1zIH0pKSxcclxuICBRdWVyeUNvbW1hbmQ6IGplc3QuZm4oKHBhcmFtcykgPT4gKHsgcGFyYW1zIH0pKSxcclxuICBVcGRhdGVDb21tYW5kOiBqZXN0LmZuKChwYXJhbXMpID0+ICh7IHBhcmFtcyB9KSksXHJcbn0pKTtcclxuXHJcbi8vIEltcG9ydCBhZnRlciBtb2NraW5nXHJcbmltcG9ydCB7IG1vdmllQ2FjaGVTZXJ2aWNlLCBDYWNoZWRNb3ZpZSB9IGZyb20gJy4uL3NlcnZpY2VzL21vdmllQ2FjaGVTZXJ2aWNlJztcclxuXHJcbi8vIE1vY2sgbWV0cmljc1xyXG5qZXN0Lm1vY2soJy4uL3V0aWxzL21ldHJpY3MnLCAoKSA9PiAoe1xyXG4gIGxvZ0J1c2luZXNzTWV0cmljOiBqZXN0LmZuKCksXHJcbiAgbG9nRXJyb3I6IGplc3QuZm4oKSxcclxuICBQZXJmb3JtYW5jZVRpbWVyOiBqZXN0LmZuKCkubW9ja0ltcGxlbWVudGF0aW9uKCgpID0+ICh7XHJcbiAgICBmaW5pc2g6IGplc3QuZm4oKSxcclxuICB9KSksXHJcbn0pKTtcclxuXHJcbi8vIE1vY2sgZmV0Y2ggZ2xvYmFsbHlcclxuY29uc3QgbW9ja0ZldGNoID0gamVzdC5mbigpO1xyXG5nbG9iYWwuZmV0Y2ggPSBtb2NrRmV0Y2g7XHJcblxyXG5kZXNjcmliZSgnUHJvcGVydHkgMTE6IENhY2hlIFV0aWxpemF0aW9uJywgKCkgPT4ge1xyXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xyXG4gICAgamVzdC5jbGVhckFsbE1vY2tzKCk7XHJcbiAgICBcclxuICAgIC8vIFNldHVwIGVudmlyb25tZW50IHZhcmlhYmxlc1xyXG4gICAgcHJvY2Vzcy5lbnYuTU9WSUVfQ0FDSEVfVEFCTEUgPSAndGVzdC1tb3ZpZS1jYWNoZS10YWJsZSc7XHJcbiAgICBwcm9jZXNzLmVudi5UTURCX0FQSV9LRVkgPSAndGVzdC1hcGkta2V5JztcclxuICB9KTtcclxuXHJcbiAgLyoqXHJcbiAgICogUHJvcGVydHkgVGVzdDogQ2FjaGUgVXRpbGl6YXRpb25cclxuICAgKiBcclxuICAgKiBGb3IgYW55IHZvdGluZyBzZXNzaW9uIHdpdGggcG9wdWxhdGVkIGNhY2hlLCB0aGUgc3lzdGVtIHNob3VsZCBzZXJ2ZSBtb3ZpZXMgZnJvbSBjYWNoZSBcclxuICAgKiByYXRoZXIgdGhhbiBtYWtpbmcgcmVhbC10aW1lIEFQSSBjYWxsc1xyXG4gICAqL1xyXG4gIGl0KCdzaG91bGQgc2VydmUgbW92aWVzIGZyb20gY2FjaGUgd2hlbiBjYWNoZSBpcyBwb3B1bGF0ZWQnLCBhc3luYyAoKSA9PiB7XHJcbiAgICBhd2FpdCBmYy5hc3NlcnQoXHJcbiAgICAgIGZjLmFzeW5jUHJvcGVydHkoXHJcbiAgICAgICAgLy8gR2VuZXJhdGUgYXJiaXRyYXJ5IHJvb20gSURzXHJcbiAgICAgICAgZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiAxMCwgbWF4TGVuZ3RoOiA1MCB9KSxcclxuICAgICAgICAvLyBHZW5lcmF0ZSBhcmJpdHJhcnkgY2FjaGVkIG1vdmllcyAoMS01MCBtb3ZpZXMpXHJcbiAgICAgICAgZmMuYXJyYXkoXHJcbiAgICAgICAgICBmYy5yZWNvcmQoe1xyXG4gICAgICAgICAgICB0bWRiSWQ6IGZjLmludGVnZXIoeyBtaW46IDEsIG1heDogOTk5OTk5IH0pLFxyXG4gICAgICAgICAgICB0aXRsZTogZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiAxLCBtYXhMZW5ndGg6IDEwMCB9KSxcclxuICAgICAgICAgICAgcG9zdGVyUGF0aDogZmMud2ViVXJsKCksXHJcbiAgICAgICAgICAgIG92ZXJ2aWV3OiBmYy5zdHJpbmcoeyBtaW5MZW5ndGg6IDEwLCBtYXhMZW5ndGg6IDUwMCB9KSxcclxuICAgICAgICAgICAgZ2VucmVzOiBmYy5hcnJheShmYy5jb25zdGFudEZyb20oJ0FjdGlvbicsICdDb21lZHknLCAnRHJhbWEnLCAnSG9ycm9yJywgJ1JvbWFuY2UnKSwgeyBtaW5MZW5ndGg6IDEsIG1heExlbmd0aDogMyB9KSxcclxuICAgICAgICAgICAgeWVhcjogZmMuaW50ZWdlcih7IG1pbjogMTkwMCwgbWF4OiAyMDMwIH0pLFxyXG4gICAgICAgICAgICByYXRpbmc6IGZjLmZsb2F0KHsgbWluOiAwLCBtYXg6IDEwIH0pLFxyXG4gICAgICAgICAgICBjYWNoZWRBdDogZmMuY29uc3RhbnQobmV3IERhdGUoKS50b0lTT1N0cmluZygpKSxcclxuICAgICAgICAgICAgdHRsOiBmYy5pbnRlZ2VyKHsgbWluOiBEYXRlLm5vdygpLCBtYXg6IERhdGUubm93KCkgKyA4NjQwMDAwMCB9KSwgLy8gVmFsaWQgVFRMIChub3QgZXhwaXJlZClcclxuICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgeyBtaW5MZW5ndGg6IDEsIG1heExlbmd0aDogNTAgfVxyXG4gICAgICAgICksXHJcbiAgICAgICAgLy8gR2VuZXJhdGUgYXJiaXRyYXJ5IGdlbnJlc1xyXG4gICAgICAgIGZjLmFycmF5KGZjLmNvbnN0YW50RnJvbSgnQWN0aW9uJywgJ0NvbWVkeScsICdEcmFtYScsICdIb3Jyb3InLCAnUm9tYW5jZScpLCB7IG1heExlbmd0aDogMyB9KSxcclxuICAgICAgICBcclxuICAgICAgICBhc3luYyAocm9vbUlkLCBjYWNoZWRNb3ZpZXMsIGdlbnJlcykgPT4ge1xyXG4gICAgICAgICAgLy8gU2V0dXA6IE1vY2sgRHluYW1vREIgdG8gcmV0dXJuIHBvcHVsYXRlZCBjYWNoZVxyXG4gICAgICAgICAgbW9ja1NlbmQubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHtcclxuICAgICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICAgIGNhY2hlS2V5OiByb29tSWQsXHJcbiAgICAgICAgICAgICAgbW92aWVzOiBjYWNoZWRNb3ZpZXMsXHJcbiAgICAgICAgICAgICAgZ2VucmVGaWx0ZXJzOiBnZW5yZXMsXHJcbiAgICAgICAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICB0dGw6IERhdGUubm93KCkgKyA4NjQwMDAwMCwgLy8gMjQgaG91cnMgZnJvbSBub3dcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIC8vIFNldHVwOiBNb2NrIFRNREIgQVBJICh0aGlzIHNob3VsZCBOT1QgYmUgY2FsbGVkIGlmIGNhY2hlIGlzIHdvcmtpbmcpXHJcbiAgICAgICAgICBtb2NrRmV0Y2gubW9ja1Jlc29sdmVkVmFsdWUoe1xyXG4gICAgICAgICAgICBvazogdHJ1ZSxcclxuICAgICAgICAgICAganNvbjogYXN5bmMgKCkgPT4gKHtcclxuICAgICAgICAgICAgICByZXN1bHRzOiBbXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgIGlkOiA5OTk5OTksXHJcbiAgICAgICAgICAgICAgICAgIHRpdGxlOiAnQVBJIE1vdmllJyxcclxuICAgICAgICAgICAgICAgICAgcG9zdGVyX3BhdGg6ICcvYXBpLXBvc3Rlci5qcGcnLFxyXG4gICAgICAgICAgICAgICAgICBvdmVydmlldzogJ1RoaXMgbW92aWUgY2FtZSBmcm9tIEFQSScsXHJcbiAgICAgICAgICAgICAgICAgIGdlbnJlX2lkczogWzI4XSxcclxuICAgICAgICAgICAgICAgICAgcmVsZWFzZV9kYXRlOiAnMjAyMy0wMS0wMScsXHJcbiAgICAgICAgICAgICAgICAgIHZvdGVfYXZlcmFnZTogOC4wLFxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICB9KSxcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIC8vIEFjdGlvbjogVHJ5IHRvIGdldCBjYWNoZWQgbW92aWVzIChzaW11bGF0aW5nIHZvdGluZyBzZXNzaW9uIHN0YXJ0KVxyXG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbW92aWVDYWNoZVNlcnZpY2UuZ2V0Q2FjaGVkTW92aWVzKHJvb21JZCk7XHJcblxyXG4gICAgICAgICAgLy8gQXNzZXJ0aW9uIDE6IFNob3VsZCByZXR1cm4gY2FjaGVkIG1vdmllc1xyXG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG9IYXZlTGVuZ3RoKGNhY2hlZE1vdmllcy5sZW5ndGgpO1xyXG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG9FcXVhbChjYWNoZWRNb3ZpZXMpO1xyXG5cclxuICAgICAgICAgIC8vIEFzc2VydGlvbiAyOiBTaG91bGQgaGF2ZSBjYWxsZWQgRHluYW1vREIgdG8gZ2V0IGNhY2hlXHJcbiAgICAgICAgICBleHBlY3QobW9ja1NlbmQpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxyXG4gICAgICAgICAgICBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XHJcbiAgICAgICAgICAgICAgcGFyYW1zOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XHJcbiAgICAgICAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LW1vdmllLWNhY2hlLXRhYmxlJyxcclxuICAgICAgICAgICAgICAgIEtleTogeyBjYWNoZUtleTogcm9vbUlkIH0sXHJcbiAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgIC8vIEFzc2VydGlvbiAzOiBTaG91bGQgTk9UIGhhdmUgY2FsbGVkIFRNREIgQVBJIChjYWNoZSB1dGlsaXphdGlvbilcclxuICAgICAgICAgIGV4cGVjdChtb2NrRmV0Y2gpLm5vdC50b0hhdmVCZWVuQ2FsbGVkKCk7XHJcblxyXG4gICAgICAgICAgLy8gQXNzZXJ0aW9uIDQ6IEFsbCByZXR1cm5lZCBtb3ZpZXMgc2hvdWxkIG1hdGNoIGNhY2hlZCBkYXRhIHN0cnVjdHVyZVxyXG4gICAgICAgICAgcmVzdWx0LmZvckVhY2goKG1vdmllLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBleHBlY3QobW92aWUudG1kYklkKS50b0JlKGNhY2hlZE1vdmllc1tpbmRleF0udG1kYklkKTtcclxuICAgICAgICAgICAgZXhwZWN0KG1vdmllLnRpdGxlKS50b0JlKGNhY2hlZE1vdmllc1tpbmRleF0udGl0bGUpO1xyXG4gICAgICAgICAgICBleHBlY3QobW92aWUuZ2VucmVzKS50b0VxdWFsKGNhY2hlZE1vdmllc1tpbmRleF0uZ2VucmVzKTtcclxuICAgICAgICAgICAgZXhwZWN0KHR5cGVvZiBtb3ZpZS5jYWNoZWRBdCkudG9CZSgnc3RyaW5nJyk7XHJcbiAgICAgICAgICAgIGV4cGVjdCh0eXBlb2YgbW92aWUudHRsKS50b0JlKCdudW1iZXInKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgKSxcclxuICAgICAge1xyXG4gICAgICAgIG51bVJ1bnM6IDEwMCwgLy8gUnVuIDEwMCBpdGVyYXRpb25zIGFzIHNwZWNpZmllZCBpbiBkZXNpZ25cclxuICAgICAgICB0aW1lb3V0OiA1MDAwLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG4gIH0pO1xyXG5cclxuICAvKipcclxuICAgKiBQcm9wZXJ0eSBUZXN0OiBDYWNoZSBNaXNzIEJlaGF2aW9yXHJcbiAgICogXHJcbiAgICogV2hlbiBjYWNoZSBpcyBlbXB0eSBvciBleHBpcmVkLCB0aGUgc3lzdGVtIHNob3VsZCBmYWxsIGJhY2sgdG8gQVBJIGNhbGxzXHJcbiAgICogVGhpcyB0ZXN0cyB0aGUgaW52ZXJzZSB0byBlbnN1cmUgb3VyIGNhY2hlIHV0aWxpemF0aW9uIHRlc3QgaXMgbWVhbmluZ2Z1bFxyXG4gICAqL1xyXG4gIGl0KCdzaG91bGQgZmFsbCBiYWNrIHRvIEFQSSB3aGVuIGNhY2hlIGlzIGVtcHR5IG9yIGV4cGlyZWQnLCBhc3luYyAoKSA9PiB7XHJcbiAgICBhd2FpdCBmYy5hc3NlcnQoXHJcbiAgICAgIGZjLmFzeW5jUHJvcGVydHkoXHJcbiAgICAgICAgLy8gR2VuZXJhdGUgYXJiaXRyYXJ5IHJvb20gSURzXHJcbiAgICAgICAgZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiAxMCwgbWF4TGVuZ3RoOiA1MCB9KSxcclxuICAgICAgICAvLyBHZW5lcmF0ZSBhcmJpdHJhcnkgZ2VucmVzXHJcbiAgICAgICAgZmMuYXJyYXkoZmMuY29uc3RhbnRGcm9tKCdBY3Rpb24nLCAnQ29tZWR5JywgJ0RyYW1hJywgJ0hvcnJvcicsICdSb21hbmNlJyksIHsgbWF4TGVuZ3RoOiAzIH0pLFxyXG4gICAgICAgIFxyXG4gICAgICAgIGFzeW5jIChyb29tSWQsIGdlbnJlcykgPT4ge1xyXG4gICAgICAgICAgLy8gU2V0dXA6IE1vY2sgRHluYW1vREIgdG8gcmV0dXJuIGVtcHR5IGNhY2hlIChjYWNoZSBtaXNzKVxyXG4gICAgICAgICAgbW9ja1NlbmQubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgSXRlbTogbnVsbCB9KTtcclxuXHJcbiAgICAgICAgICAvLyBTZXR1cDogTW9jayBUTURCIEFQSSByZXNwb25zZVxyXG4gICAgICAgICAgY29uc3QgYXBpTW92aWVzID0gW1xyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgaWQ6IDEyMzQ1LFxyXG4gICAgICAgICAgICAgIHRpdGxlOiAnQVBJIE1vdmllIDEnLFxyXG4gICAgICAgICAgICAgIHBvc3Rlcl9wYXRoOiAnL2FwaTEuanBnJyxcclxuICAgICAgICAgICAgICBvdmVydmlldzogJ0Zyb20gQVBJJyxcclxuICAgICAgICAgICAgICBnZW5yZV9pZHM6IFsyOCwgMzVdLFxyXG4gICAgICAgICAgICAgIHJlbGVhc2VfZGF0ZTogJzIwMjMtMDEtMDEnLFxyXG4gICAgICAgICAgICAgIHZvdGVfYXZlcmFnZTogNy41LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgaWQ6IDEyMzQ2LFxyXG4gICAgICAgICAgICAgIHRpdGxlOiAnQVBJIE1vdmllIDInLFxyXG4gICAgICAgICAgICAgIHBvc3Rlcl9wYXRoOiAnL2FwaTIuanBnJyxcclxuICAgICAgICAgICAgICBvdmVydmlldzogJ0Fsc28gZnJvbSBBUEknLFxyXG4gICAgICAgICAgICAgIGdlbnJlX2lkczogWzE4XSxcclxuICAgICAgICAgICAgICByZWxlYXNlX2RhdGU6ICcyMDIzLTAyLTAxJyxcclxuICAgICAgICAgICAgICB2b3RlX2F2ZXJhZ2U6IDguMixcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIF07XHJcblxyXG4gICAgICAgICAgbW9ja0ZldGNoLm1vY2tSZXNvbHZlZFZhbHVlKHtcclxuICAgICAgICAgICAgb2s6IHRydWUsXHJcbiAgICAgICAgICAgIGpzb246IGFzeW5jICgpID0+ICh7XHJcbiAgICAgICAgICAgICAgcmVzdWx0czogYXBpTW92aWVzLFxyXG4gICAgICAgICAgICB9KSxcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIC8vIEFjdGlvbjogVHJ5IHRvIHByZS1jYWNoZSBtb3ZpZXMgKHdoaWNoIHdpbGwgdHJpZ2dlciBBUEkgY2FsbCBkdWUgdG8gY2FjaGUgbWlzcylcclxuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1vdmllQ2FjaGVTZXJ2aWNlLnByZUNhY2hlTW92aWVzKHJvb21JZCwgZ2VucmVzKTtcclxuXHJcbiAgICAgICAgICAvLyBBc3NlcnRpb24gMTogU2hvdWxkIGhhdmUgY2FsbGVkIER5bmFtb0RCIHRvIGNoZWNrIGZvciBleGlzdGluZyBjYWNoZVxyXG4gICAgICAgICAgZXhwZWN0KG1vY2tTZW5kKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcclxuICAgICAgICAgICAgZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xyXG4gICAgICAgICAgICAgIHBhcmFtczogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xyXG4gICAgICAgICAgICAgICAgVGFibGVOYW1lOiAndGVzdC1tb3ZpZS1jYWNoZS10YWJsZScsXHJcbiAgICAgICAgICAgICAgICBLZXk6IHsgY2FjaGVLZXk6IHJvb21JZCB9LFxyXG4gICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAvLyBBc3NlcnRpb24gMjogU2hvdWxkIGhhdmUgY2FsbGVkIFRNREIgQVBJIGR1ZSB0byBjYWNoZSBtaXNzXHJcbiAgICAgICAgICBleHBlY3QobW9ja0ZldGNoKS50b0hhdmVCZWVuQ2FsbGVkKCk7XHJcblxyXG4gICAgICAgICAgLy8gQXNzZXJ0aW9uIDM6IFNob3VsZCByZXR1cm4gbW92aWVzIChlaXRoZXIgZnJvbSBBUEkgb3IgZmFsbGJhY2spXHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS50b0JlRGVmaW5lZCgpO1xyXG4gICAgICAgICAgZXhwZWN0KEFycmF5LmlzQXJyYXkocmVzdWx0KSkudG9CZSh0cnVlKTtcclxuICAgICAgICAgIGV4cGVjdChyZXN1bHQubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMCk7XHJcblxyXG4gICAgICAgICAgLy8gQXNzZXJ0aW9uIDQ6IEVhY2ggbW92aWUgc2hvdWxkIGhhdmUgcmVxdWlyZWQgY2FjaGUgc3RydWN0dXJlXHJcbiAgICAgICAgICByZXN1bHQuZm9yRWFjaChtb3ZpZSA9PiB7XHJcbiAgICAgICAgICAgIGV4cGVjdCh0eXBlb2YgbW92aWUudG1kYklkKS50b0JlKCdudW1iZXInKTtcclxuICAgICAgICAgICAgZXhwZWN0KHR5cGVvZiBtb3ZpZS50aXRsZSkudG9CZSgnc3RyaW5nJyk7XHJcbiAgICAgICAgICAgIGV4cGVjdCh0eXBlb2YgbW92aWUucG9zdGVyUGF0aCkudG9CZSgnc3RyaW5nJyk7XHJcbiAgICAgICAgICAgIGV4cGVjdCh0eXBlb2YgbW92aWUub3ZlcnZpZXcpLnRvQmUoJ3N0cmluZycpO1xyXG4gICAgICAgICAgICBleHBlY3QoQXJyYXkuaXNBcnJheShtb3ZpZS5nZW5yZXMpKS50b0JlKHRydWUpO1xyXG4gICAgICAgICAgICBleHBlY3QodHlwZW9mIG1vdmllLmNhY2hlZEF0KS50b0JlKCdzdHJpbmcnKTtcclxuICAgICAgICAgICAgZXhwZWN0KHR5cGVvZiBtb3ZpZS50dGwpLnRvQmUoJ251bWJlcicpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICApLFxyXG4gICAgICB7XHJcbiAgICAgICAgbnVtUnVuczogNTAsIC8vIEZld2VyIHJ1bnMgZm9yIHRoZSBpbnZlcnNlIHRlc3RcclxuICAgICAgICB0aW1lb3V0OiA1MDAwLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG4gIH0pO1xyXG5cclxuICAvKipcclxuICAgKiBQcm9wZXJ0eSBUZXN0OiBDYWNoZSBFeHBpcmF0aW9uIEJlaGF2aW9yXHJcbiAgICogXHJcbiAgICogV2hlbiBjYWNoZSBleGlzdHMgYnV0IGlzIGV4cGlyZWQsIHN5c3RlbSBzaG91bGQgbm90IHVzZSBpdCBhbmQgc2hvdWxkIGZldGNoIGZyZXNoIGRhdGFcclxuICAgKi9cclxuICBpdCgnc2hvdWxkIG5vdCB1c2UgZXhwaXJlZCBjYWNoZSBhbmQgc2hvdWxkIGZldGNoIGZyZXNoIGRhdGEnLCBhc3luYyAoKSA9PiB7XHJcbiAgICBhd2FpdCBmYy5hc3NlcnQoXHJcbiAgICAgIGZjLmFzeW5jUHJvcGVydHkoXHJcbiAgICAgICAgLy8gR2VuZXJhdGUgYXJiaXRyYXJ5IHJvb20gSURzXHJcbiAgICAgICAgZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiAxMCwgbWF4TGVuZ3RoOiA1MCB9KSxcclxuICAgICAgICAvLyBHZW5lcmF0ZSBhcmJpdHJhcnkgZXhwaXJlZCBjYWNoZWQgbW92aWVzXHJcbiAgICAgICAgZmMuYXJyYXkoXHJcbiAgICAgICAgICBmYy5yZWNvcmQoe1xyXG4gICAgICAgICAgICB0bWRiSWQ6IGZjLmludGVnZXIoeyBtaW46IDEsIG1heDogOTk5OTk5IH0pLFxyXG4gICAgICAgICAgICB0aXRsZTogZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiAxLCBtYXhMZW5ndGg6IDEwMCB9KSxcclxuICAgICAgICAgICAgcG9zdGVyUGF0aDogZmMud2ViVXJsKCksXHJcbiAgICAgICAgICAgIG92ZXJ2aWV3OiBmYy5zdHJpbmcoeyBtaW5MZW5ndGg6IDEwLCBtYXhMZW5ndGg6IDUwMCB9KSxcclxuICAgICAgICAgICAgZ2VucmVzOiBmYy5hcnJheShmYy5jb25zdGFudEZyb20oJ0FjdGlvbicsICdDb21lZHknLCAnRHJhbWEnKSwgeyBtaW5MZW5ndGg6IDEsIG1heExlbmd0aDogMiB9KSxcclxuICAgICAgICAgICAgeWVhcjogZmMuaW50ZWdlcih7IG1pbjogMTkwMCwgbWF4OiAyMDMwIH0pLFxyXG4gICAgICAgICAgICByYXRpbmc6IGZjLmZsb2F0KHsgbWluOiAwLCBtYXg6IDEwIH0pLFxyXG4gICAgICAgICAgICBjYWNoZWRBdDogZmMuY29uc3RhbnQobmV3IERhdGUoRGF0ZS5ub3coKSAtIDg2NDAwMDAwKS50b0lTT1N0cmluZygpKSwgLy8gMjQgaG91cnMgYWdvXHJcbiAgICAgICAgICAgIHR0bDogZmMuaW50ZWdlcih7IG1pbjogRGF0ZS5ub3coKSAtIDg2NDAwMDAwLCBtYXg6IERhdGUubm93KCkgLSAxIH0pLCAvLyBFeHBpcmVkIFRUTFxyXG4gICAgICAgICAgfSksXHJcbiAgICAgICAgICB7IG1pbkxlbmd0aDogMSwgbWF4TGVuZ3RoOiAyMCB9XHJcbiAgICAgICAgKSxcclxuICAgICAgICBcclxuICAgICAgICBhc3luYyAocm9vbUlkLCBleHBpcmVkQ2FjaGVkTW92aWVzKSA9PiB7XHJcbiAgICAgICAgICAvLyBTZXR1cDogTW9jayBEeW5hbW9EQiB0byByZXR1cm4gZXhwaXJlZCBjYWNoZVxyXG4gICAgICAgICAgbW9ja1NlbmQubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHtcclxuICAgICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICAgIGNhY2hlS2V5OiByb29tSWQsXHJcbiAgICAgICAgICAgICAgbW92aWVzOiBleHBpcmVkQ2FjaGVkTW92aWVzLFxyXG4gICAgICAgICAgICAgIGdlbnJlRmlsdGVyczogW10sXHJcbiAgICAgICAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKERhdGUubm93KCkgLSA4NjQwMDAwMCkudG9JU09TdHJpbmcoKSwgLy8gMjQgaG91cnMgYWdvXHJcbiAgICAgICAgICAgICAgdHRsOiBEYXRlLm5vdygpIC0gMSwgLy8gRXhwaXJlZCAxbXMgYWdvXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAvLyBBY3Rpb246IFRyeSB0byBnZXQgY2FjaGVkIG1vdmllc1xyXG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbW92aWVDYWNoZVNlcnZpY2UuZ2V0Q2FjaGVkTW92aWVzKHJvb21JZCk7XHJcblxyXG4gICAgICAgICAgLy8gQXNzZXJ0aW9uIDE6IFNob3VsZCByZXR1cm4gZW1wdHkgYXJyYXkgZm9yIGV4cGlyZWQgY2FjaGVcclxuICAgICAgICAgIGV4cGVjdChyZXN1bHQpLnRvRXF1YWwoW10pO1xyXG5cclxuICAgICAgICAgIC8vIEFzc2VydGlvbiAyOiBTaG91bGQgaGF2ZSBjYWxsZWQgRHluYW1vREIgdG8gY2hlY2sgY2FjaGVcclxuICAgICAgICAgIGV4cGVjdChtb2NrU2VuZCkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXHJcbiAgICAgICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcclxuICAgICAgICAgICAgICBwYXJhbXM6IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcclxuICAgICAgICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtbW92aWUtY2FjaGUtdGFibGUnLFxyXG4gICAgICAgICAgICAgICAgS2V5OiB7IGNhY2hlS2V5OiByb29tSWQgfSxcclxuICAgICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgLy8gQXNzZXJ0aW9uIDM6IFNob3VsZCBub3QgcmV0dXJuIGV4cGlyZWQgbW92aWVzXHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS5ub3QudG9FcXVhbChleHBpcmVkQ2FjaGVkTW92aWVzKTtcclxuICAgICAgICB9XHJcbiAgICAgICksXHJcbiAgICAgIHtcclxuICAgICAgICBudW1SdW5zOiA1MCxcclxuICAgICAgICB0aW1lb3V0OiA1MDAwLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG4gIH0pO1xyXG5cclxuICAvKipcclxuICAgKiBFZGdlIENhc2UgVGVzdDogQ2FjaGUgd2l0aCBNaXhlZCBUVEwgU3RhdGVzXHJcbiAgICogXHJcbiAgICogVGVzdCBiZWhhdmlvciB3aGVuIGNhY2hlIGNvbnRhaW5zIG1vdmllcyB3aXRoIGRpZmZlcmVudCBleHBpcmF0aW9uIHN0YXRlc1xyXG4gICAqL1xyXG4gIGl0KCdzaG91bGQgaGFuZGxlIGNhY2hlIGNvbnNpc3RlbnRseSByZWdhcmRsZXNzIG9mIGluZGl2aWR1YWwgbW92aWUgVFRMIHZhcmlhdGlvbnMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICBhd2FpdCBmYy5hc3NlcnQoXHJcbiAgICAgIGZjLmFzeW5jUHJvcGVydHkoXHJcbiAgICAgICAgZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiAxMCwgbWF4TGVuZ3RoOiA1MCB9KSxcclxuICAgICAgICBmYy5pbnRlZ2VyKHsgbWluOiAxLCBtYXg6IDMwIH0pLFxyXG4gICAgICAgIFxyXG4gICAgICAgIGFzeW5jIChyb29tSWQsIG1vdmllQ291bnQpID0+IHtcclxuICAgICAgICAgIC8vIEdlbmVyYXRlIG1vdmllcyB3aXRoIGNvbnNpc3RlbnQgY2FjaGUtbGV2ZWwgVFRMICh3aGF0IG1hdHRlcnMgZm9yIGNhY2hlIGV4cGlyYXRpb24pXHJcbiAgICAgICAgICBjb25zdCB2YWxpZENhY2hlTW92aWVzOiBDYWNoZWRNb3ZpZVtdID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogbW92aWVDb3VudCB9LCAoXywgaSkgPT4gKHtcclxuICAgICAgICAgICAgdG1kYklkOiAxMDAwICsgaSxcclxuICAgICAgICAgICAgdGl0bGU6IGBUZXN0IE1vdmllICR7aSArIDF9YCxcclxuICAgICAgICAgICAgcG9zdGVyUGF0aDogYGh0dHBzOi8vZXhhbXBsZS5jb20vcG9zdGVyJHtpICsgMX0uanBnYCxcclxuICAgICAgICAgICAgb3ZlcnZpZXc6IGBPdmVydmlldyBmb3IgbW92aWUgJHtpICsgMX1gLFxyXG4gICAgICAgICAgICBnZW5yZXM6IFsnQWN0aW9uJ10sXHJcbiAgICAgICAgICAgIHllYXI6IDIwMjMsXHJcbiAgICAgICAgICAgIHJhdGluZzogNy4wICsgKGkgJSAzKSxcclxuICAgICAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgdHRsOiBEYXRlLm5vdygpICsgMzYwMDAwMCwgLy8gSW5kaXZpZHVhbCBtb3ZpZSBUVEwgKDEgaG91ciBmcm9tIG5vdylcclxuICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgICAvLyBTZXR1cDogTW9jayBEeW5hbW9EQiB3aXRoIHZhbGlkIGNhY2hlIChjYWNoZS1sZXZlbCBUVEwgaXMgd2hhdCBtYXR0ZXJzKVxyXG4gICAgICAgICAgbW9ja1NlbmQubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHtcclxuICAgICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICAgIGNhY2hlS2V5OiByb29tSWQsXHJcbiAgICAgICAgICAgICAgbW92aWVzOiB2YWxpZENhY2hlTW92aWVzLFxyXG4gICAgICAgICAgICAgIGdlbnJlRmlsdGVyczogWydBY3Rpb24nXSxcclxuICAgICAgICAgICAgICBjYWNoZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgIHR0bDogRGF0ZS5ub3coKSArIDg2NDAwMDAwLCAvLyBDYWNoZS1sZXZlbCBUVEw6IDI0IGhvdXJzIGZyb20gbm93ICh2YWxpZClcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIC8vIEFjdGlvbjogR2V0IGNhY2hlZCBtb3ZpZXNcclxuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1vdmllQ2FjaGVTZXJ2aWNlLmdldENhY2hlZE1vdmllcyhyb29tSWQpO1xyXG5cclxuICAgICAgICAgIC8vIEFzc2VydGlvbiAxOiBTaG91bGQgcmV0dXJuIGFsbCBtb3ZpZXMgZnJvbSB2YWxpZCBjYWNoZVxyXG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG9IYXZlTGVuZ3RoKG1vdmllQ291bnQpO1xyXG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG9FcXVhbCh2YWxpZENhY2hlTW92aWVzKTtcclxuXHJcbiAgICAgICAgICAvLyBBc3NlcnRpb24gMjogU2hvdWxkIG5vdCBjYWxsIFRNREIgQVBJIHdoZW4gY2FjaGUgaXMgdmFsaWRcclxuICAgICAgICAgIGV4cGVjdChtb2NrRmV0Y2gpLm5vdC50b0hhdmVCZWVuQ2FsbGVkKCk7XHJcblxyXG4gICAgICAgICAgLy8gQXNzZXJ0aW9uIDM6IEFsbCBtb3ZpZXMgc2hvdWxkIG1haW50YWluIHRoZWlyIHN0cnVjdHVyZVxyXG4gICAgICAgICAgcmVzdWx0LmZvckVhY2goKG1vdmllLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBleHBlY3QobW92aWUudG1kYklkKS50b0JlKDEwMDAgKyBpbmRleCk7XHJcbiAgICAgICAgICAgIGV4cGVjdChtb3ZpZS50aXRsZSkudG9CZShgVGVzdCBNb3ZpZSAke2luZGV4ICsgMX1gKTtcclxuICAgICAgICAgICAgZXhwZWN0KG1vdmllLmdlbnJlcykudG9FcXVhbChbJ0FjdGlvbiddKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgKSxcclxuICAgICAge1xyXG4gICAgICAgIG51bVJ1bnM6IDMwLFxyXG4gICAgICAgIHRpbWVvdXQ6IDMwMDAsXHJcbiAgICAgIH1cclxuICAgICk7XHJcbiAgfSk7XHJcbn0pOyJdfQ==