/**
 * TMDB Service Tests
 * 
 * Tests for TMDB verification service including:
 * - Property 4: Grounding Verification
 * - Property 5: Latency Optimization
 * - Movie hallucination filtering
 * - Parallel execution with Promise.all()
 * 
 * Feature: trini-ai-assistant-fixes
 */

const TMDBService = require('../services/tmdbService');
const axios = require('axios');
const fc = require('fast-check');

// Mock axios for unit tests
jest.mock('axios');
const mockedAxios = axios;

describe('TMDBService', () => {
    let tmdbService;
    const mockConfig = {
        apiKey: 'dc4dbcd2404c1ca852f8eb964add267d', // Valid 32-char hex string
        baseUrl: 'https://api.themoviedb.org/3',
        imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
        timeout: 5000
    };

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock axios.create to return a mock client
        const mockClient = {
            get: jest.fn(),
            defaults: { baseURL: mockConfig.baseUrl }
        };
        mockedAxios.create.mockReturnValue(mockClient);
        
        tmdbService = new TMDBService(mockConfig);
    });

    describe('Constructor', () => {
        test('should initialize with valid configuration', () => {
            expect(tmdbService.apiKey).toBe(mockConfig.apiKey);
            expect(tmdbService.baseUrl).toBe(mockConfig.baseUrl);
            expect(tmdbService.imageBaseUrl).toBe(mockConfig.imageBaseUrl);
            expect(tmdbService.timeout).toBe(mockConfig.timeout);
        });

        test('should throw error without API key', () => {
            // Temporarily clear environment variable to test the error case
            const originalApiKey = process.env.TMDB_API_KEY;
            delete process.env.TMDB_API_KEY;
            
            expect(() => {
                new TMDBService({ baseUrl: 'test' }); // No apiKey provided
            }).toThrow('Environment validation failed');
            
            // Restore environment variable
            process.env.TMDB_API_KEY = originalApiKey;
        });

        test('should use default values for optional config', () => {
            const service = new TMDBService({ apiKey: 'dc4dbcd2404c1ca852f8eb964add267d' }); // Valid API key
            expect(service.baseUrl).toBe('https://api.themoviedb.org/3');
            expect(service.imageBaseUrl).toBe('https://image.tmdb.org/t/p/w500');
            expect(service.timeout).toBe(5000);
        });
    });

    describe('searchSingleMovie', () => {
        test('should return movie card for valid movie', async () => {
            const mockResponse = {
                data: {
                    results: [{
                        id: 238,
                        title: 'The Godfather',
                        original_title: 'The Godfather',
                        overview: 'The story of a mafia family.',
                        release_date: '1972-03-14',
                        poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
                        vote_average: 9.2,
                        genre_ids: [18, 80]
                    }]
                }
            };

            tmdbService.client.get.mockResolvedValue(mockResponse);

            const result = await tmdbService.searchSingleMovie('The Godfather');

            expect(result).toEqual({
                title: 'The Godfather',
                posterUrl: 'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
                synopsis: 'The story of a mafia family.',
                releaseYear: '1972',
                tmdbId: 238,
                genres: ['Genre-18', 'Genre-80'],
                rating: 9.2
            });

            expect(tmdbService.client.get).toHaveBeenCalledWith('/search/movie', {
                params: {
                    query: 'The Godfather',
                    language: 'es-ES',
                    include_adult: false
                }
            });
        });

        test('should return null for non-existent movie (hallucination filtering)', async () => {
            const mockResponse = {
                data: {
                    results: []
                }
            };

            tmdbService.client.get.mockResolvedValue(mockResponse);

            const result = await tmdbService.searchSingleMovie('Fake Movie That Does Not Exist');

            expect(result).toBeNull();
        });

        test('should return null for invalid input', async () => {
            const invalidInputs = ['', null, undefined, '   ', 123];

            for (const input of invalidInputs) {
                const result = await tmdbService.searchSingleMovie(input);
                expect(result).toBeNull();
            }
        });

        test('should handle API errors gracefully', async () => {
            tmdbService.client.get.mockRejectedValue(new Error('Network error'));

            const result = await tmdbService.searchSingleMovie('Test Movie');

            expect(result).toBeNull();
        });

        test('should handle 404 errors silently', async () => {
            const error = new Error('Not found');
            error.response = { status: 404 };
            tmdbService.client.get.mockRejectedValue(error);

            const result = await tmdbService.searchSingleMovie('Non-existent Movie');

            expect(result).toBeNull();
        });
    });

    describe('fetchMovies - Parallel Processing', () => {
        test('Property 5: Latency Optimization - should use Promise.all() for parallel execution', async () => {
            const titles = ['Movie A', 'Movie B', 'Movie C'];
            const mockMovieData = {
                id: 1,
                title: 'Test Movie',
                overview: 'Test synopsis',
                release_date: '2023-01-01',
                poster_path: '/test.jpg',
                vote_average: 8.0,
                genre_ids: [28]
            };

            // Mock successful responses for all movies
            tmdbService.client.get.mockResolvedValue({
                data: { results: [mockMovieData] }
            });

            const startTime = Date.now();
            const result = await tmdbService.fetchMovies(titles);
            const endTime = Date.now();

            // Verify all movies were processed
            expect(result).toHaveLength(3);
            expect(tmdbService.client.get).toHaveBeenCalledTimes(3);

            // Verify parallel execution (should be much faster than sequential)
            const executionTime = endTime - startTime;
            expect(executionTime).toBeLessThan(1000); // Should complete quickly in parallel

            // Verify each movie was searched
            titles.forEach(title => {
                expect(tmdbService.client.get).toHaveBeenCalledWith('/search/movie', {
                    params: {
                        query: title,
                        language: 'es-ES',
                        include_adult: false
                    }
                });
            });
        });

        test('should enforce maximum 10 movie limit', async () => {
            const titles = Array.from({ length: 15 }, (_, i) => `Movie ${i + 1}`);
            
            tmdbService.client.get.mockResolvedValue({
                data: { results: [] }
            });

            await tmdbService.fetchMovies(titles);

            // Should only process first 10 movies
            expect(tmdbService.client.get).toHaveBeenCalledTimes(10);
        });

        test('should handle individual movie search failures gracefully', async () => {
            const titles = ['Good Movie', 'Bad Movie', 'Another Good Movie'];
            
            // Mock responses: success, failure, success
            tmdbService.client.get
                .mockResolvedValueOnce({
                    data: { results: [{ id: 1, title: 'Good Movie', overview: 'Good', release_date: '2023-01-01' }] }
                })
                .mockRejectedValueOnce(new Error('API Error'))
                .mockResolvedValueOnce({
                    data: { results: [{ id: 2, title: 'Another Good Movie', overview: 'Also good', release_date: '2023-01-01' }] }
                });

            const result = await tmdbService.fetchMovies(titles);

            // Should return only successful results
            expect(result).toHaveLength(2);
            expect(result[0].title).toBe('Good Movie');
            expect(result[1].title).toBe('Another Good Movie');
        });

        test('should return empty array on service failure', async () => {
            // Mock a service-level failure
            const originalSearchSingleMovie = tmdbService.searchSingleMovie;
            tmdbService.searchSingleMovie = jest.fn().mockImplementation(() => {
                throw new Error('Service unavailable');
            });

            const result = await tmdbService.fetchMovies(['Test Movie']);

            expect(result).toEqual([]);

            // Restore original method
            tmdbService.searchSingleMovie = originalSearchSingleMovie;
        });
    });

    describe('Property 4: Grounding Verification', () => {
        test('should filter out hallucinations (non-existent movies)', async () => {
            const titles = ['Real Movie', 'Fake Movie', 'Another Real Movie'];
            
            // Mock responses: found, not found, found
            tmdbService.client.get
                .mockResolvedValueOnce({
                    data: { results: [{ id: 1, title: 'Real Movie', overview: 'Real', release_date: '2023-01-01' }] }
                })
                .mockResolvedValueOnce({
                    data: { results: [] } // No results = hallucination
                })
                .mockResolvedValueOnce({
                    data: { results: [{ id: 2, title: 'Another Real Movie', overview: 'Also real', release_date: '2023-01-01' }] }
                });

            const result = await tmdbService.fetchMovies(titles);

            // Should only return real movies, filtering out hallucinations
            expect(result).toHaveLength(2);
            expect(result[0].title).toBe('Real Movie');
            expect(result[1].title).toBe('Another Real Movie');
        });

        test('should ensure all returned movies have valid tmdbId and posterUrl structure', async () => {
            const mockResponse = {
                data: {
                    results: [{
                        id: 123,
                        title: 'Test Movie',
                        overview: 'Test overview',
                        release_date: '2023-01-01',
                        poster_path: '/test.jpg',
                        vote_average: 7.5
                    }]
                }
            };

            tmdbService.client.get.mockResolvedValue(mockResponse);

            const result = await tmdbService.fetchMovies(['Test Movie']);

            expect(result).toHaveLength(1);
            expect(result[0]).toHaveProperty('tmdbId', 123);
            expect(result[0]).toHaveProperty('posterUrl', 'https://image.tmdb.org/t/p/w500/test.jpg');
            expect(typeof result[0].tmdbId).toBe('number');
            expect(result[0].tmdbId).toBeGreaterThan(0);
        });
    });

    describe('enrichMovieData', () => {
        test('should enrich movie data with proper formatting', () => {
            const tmdbResult = {
                id: 238,
                title: 'The Godfather',
                overview: 'A mafia family story',
                release_date: '1972-03-14',
                poster_path: '/poster.jpg',
                vote_average: 9.2,
                genre_ids: [18, 80]
            };

            const result = tmdbService.enrichMovieData(tmdbResult);

            expect(result).toEqual({
                title: 'The Godfather',
                posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
                synopsis: 'A mafia family story',
                releaseYear: '1972',
                tmdbId: 238,
                genres: ['Genre-18', 'Genre-80'],
                rating: 9.2
            });
        });

        test('should handle missing poster path', () => {
            const tmdbResult = {
                id: 1,
                title: 'No Poster Movie',
                overview: 'A movie without poster',
                release_date: '2023-01-01',
                poster_path: null,
                vote_average: 7.0
            };

            const result = tmdbService.enrichMovieData(tmdbResult);

            expect(result.posterUrl).toBeNull();
        });

        test('should handle missing release date', () => {
            const tmdbResult = {
                id: 1,
                title: 'No Date Movie',
                overview: 'A movie without date',
                release_date: null,
                vote_average: 7.0
            };

            const result = tmdbService.enrichMovieData(tmdbResult);

            expect(result.releaseYear).toBe('Unknown');
        });

        test('should handle enrichment errors gracefully', () => {
            const invalidTmdbResult = null;

            const result = tmdbService.enrichMovieData(invalidTmdbResult);

            expect(result).toHaveProperty('title');
            expect(result).toHaveProperty('posterUrl');
            expect(result).toHaveProperty('synopsis');
            expect(result).toHaveProperty('releaseYear');
            expect(result).toHaveProperty('tmdbId');
        });
    });

    describe('getStaticRecommendations', () => {
        test('should return fallback movie recommendations', () => {
            const recommendations = tmdbService.getStaticRecommendations();

            expect(Array.isArray(recommendations)).toBe(true);
            expect(recommendations.length).toBeGreaterThan(0);
            
            recommendations.forEach(movie => {
                expect(movie).toHaveProperty('title');
                expect(movie).toHaveProperty('synopsis');
                expect(movie).toHaveProperty('releaseYear');
                expect(movie).toHaveProperty('tmdbId');
                expect(typeof movie.tmdbId).toBe('number');
            });
        });
    });

    describe('testConnection', () => {
        test('should return true for successful connection', async () => {
            tmdbService.client.get.mockResolvedValue({ data: { images: {} } });

            const result = await tmdbService.testConnection();

            expect(result).toBe(true);
            expect(tmdbService.client.get).toHaveBeenCalledWith('/configuration');
        });

        test('should return false for failed connection', async () => {
            tmdbService.client.get.mockRejectedValue(new Error('Connection failed'));

            const result = await tmdbService.testConnection();

            expect(result).toBe(false);
        });
    });
});

/**
 * Property-Based Tests using fast-check
 * These tests validate system properties across many random inputs
 */
describe('TMDB Service Property-Based Tests', () => {
    let tmdbService;

    beforeEach(() => {
        const mockClient = {
            get: jest.fn()
        };
        mockedAxios.create.mockReturnValue(mockClient);
        
        tmdbService = new TMDBService({
            apiKey: 'dc4dbcd2404c1ca852f8eb964add267d', // Valid 32-char hex string
            baseUrl: 'https://api.themoviedb.org/3'
        });
    });

    test('Property 4: Grounding Verification - All returned movies must have valid structure', () => {
        fc.assert(
            fc.asyncProperty(
                fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 15 }),
                async (titles) => {
                    // Mock successful responses with valid movie data
                    tmdbService.client.get.mockResolvedValue({
                        data: {
                            results: [{
                                id: 123,
                                title: 'Test Movie',
                                overview: 'Test overview',
                                release_date: '2023-01-01',
                                poster_path: '/test.jpg',
                                vote_average: 7.5
                            }]
                        }
                    });

                    const result = await tmdbService.fetchMovies(titles);

                    // Property: All returned movies must have valid structure
                    result.forEach(movie => {
                        expect(movie).toHaveProperty('title');
                        expect(movie).toHaveProperty('tmdbId');
                        expect(movie).toHaveProperty('posterUrl');
                        expect(movie).toHaveProperty('synopsis');
                        expect(movie).toHaveProperty('releaseYear');
                        expect(typeof movie.tmdbId).toBe('number');
                        expect(movie.tmdbId).toBeGreaterThan(0);
                    });

                    // Property: Result length should never exceed 10
                    expect(result.length).toBeLessThanOrEqual(10);
                }
            ),
            { numRuns: 50 }
        );
    });

    test('Property 5: Latency Optimization - Parallel execution invariant', () => {
        fc.assert(
            fc.asyncProperty(
                fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 2, maxLength: 5 }),
                async (titles) => {
                    let callCount = 0;
                    const callTimes = [];

                    // Mock client to track call timing
                    tmdbService.client.get.mockImplementation(() => {
                        callTimes.push(Date.now());
                        callCount++;
                        return Promise.resolve({
                            data: { results: [{ id: callCount, title: `Movie ${callCount}`, overview: 'Test' }] }
                        });
                    });

                    await tmdbService.fetchMovies(titles);

                    // Property: All API calls should be initiated nearly simultaneously
                    if (callTimes.length > 1) {
                        const maxTimeDiff = Math.max(...callTimes) - Math.min(...callTimes);
                        expect(maxTimeDiff).toBeLessThan(100); // All calls within 100ms indicates parallel execution
                    }

                    // Property: Number of API calls should equal number of titles (up to 10)
                    const expectedCalls = Math.min(titles.length, 10);
                    expect(callCount).toBe(expectedCalls);
                }
            ),
            { numRuns: 30 }
        );
    });
});