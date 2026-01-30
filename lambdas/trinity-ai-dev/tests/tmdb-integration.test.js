/**
 * TMDB Service Integration Tests
 * 
 * These tests verify the TMDB service integration with the main AI handler
 * and validate the complete flow from AI suggestions to verified movie cards.
 * 
 * Feature: trini-ai-assistant-fixes
 */

const TMDBService = require('../services/tmdbService');

describe('TMDB Service Integration Tests', () => {
    let tmdbService;

    beforeEach(() => {
        // Use environment variables for configuration
        const config = {
            apiKey: process.env.TMDB_API_KEY || 'test-api-key',
            baseUrl: process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',
            timeout: 5000
        };
        
        tmdbService = new TMDBService(config);
    });

    describe('Environment Configuration', () => {
        test('should initialize with environment variables', () => {
            expect(tmdbService.apiKey).toBeDefined();
            expect(tmdbService.baseUrl).toBeDefined();
            expect(tmdbService.imageBaseUrl).toBeDefined();
        });

        test('should have proper timeout configuration', () => {
            expect(tmdbService.timeout).toBe(5000);
        });
    });

    describe('Real-world Movie Scenarios', () => {
        test('should handle common movie titles correctly', async () => {
            // Mock successful TMDB responses for common movies
            const mockMovies = [
                {
                    id: 238,
                    title: 'The Godfather',
                    overview: 'The aging patriarch of an organized crime dynasty transfers control to his reluctant son.',
                    release_date: '1972-03-14',
                    poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
                    vote_average: 9.2,
                    genre_ids: [18, 80]
                },
                {
                    id: 680,
                    title: 'Pulp Fiction',
                    overview: 'A burger-loving hit man, his philosophical partner, and a drug-addled gangster\'s moll.',
                    release_date: '1994-10-14',
                    poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
                    vote_average: 8.9,
                    genre_ids: [80, 18]
                }
            ];

            // Mock the client.get method
            tmdbService.client.get = jest.fn()
                .mockResolvedValueOnce({ data: { results: [mockMovies[0]] } })
                .mockResolvedValueOnce({ data: { results: [mockMovies[1]] } });

            const titles = ['The Godfather', 'Pulp Fiction'];
            const result = await tmdbService.fetchMovies(titles);

            expect(result).toHaveLength(2);
            expect(result[0].title).toBe('The Godfather');
            expect(result[0].tmdbId).toBe(238);
            expect(result[0].posterUrl).toBe('https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg');
            
            expect(result[1].title).toBe('Pulp Fiction');
            expect(result[1].tmdbId).toBe(680);
            expect(result[1].releaseYear).toBe('1994');
        });

        test('should handle AI typos and fuzzy matching', async () => {
            // Simulate AI making typos in movie titles
            const mockResponse = {
                data: {
                    results: [{
                        id: 120,
                        title: 'The Lord of the Rings: The Fellowship of the Ring',
                        overview: 'A meek Hobbit from the Shire and eight companions set out on a journey.',
                        release_date: '2001-12-19',
                        poster_path: '/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg',
                        vote_average: 8.8,
                        genre_ids: [12, 14, 28]
                    }]
                }
            };

            tmdbService.client.get = jest.fn().mockResolvedValue(mockResponse);

            // AI suggests with typo: "Lord of Rings" instead of "The Lord of the Rings"
            const result = await tmdbService.fetchMovies(['Lord of Rings']);

            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('The Lord of the Rings: The Fellowship of the Ring');
            expect(result[0].tmdbId).toBe(120);
        });

        test('should filter out complete hallucinations', async () => {
            // Mock responses: real movie, hallucination, real movie
            tmdbService.client.get = jest.fn()
                .mockResolvedValueOnce({
                    data: { results: [{ id: 1, title: 'Real Movie', overview: 'Real', release_date: '2023-01-01' }] }
                })
                .mockResolvedValueOnce({
                    data: { results: [] } // Hallucination - no results
                })
                .mockResolvedValueOnce({
                    data: { results: [{ id: 2, title: 'Another Real Movie', overview: 'Also real', release_date: '2023-01-01' }] }
                });

            const titles = ['Real Movie', 'Completely Made Up Movie That Does Not Exist', 'Another Real Movie'];
            const result = await tmdbService.fetchMovies(titles);

            // Should only return the 2 real movies, filtering out the hallucination
            expect(result).toHaveLength(2);
            expect(result[0].title).toBe('Real Movie');
            expect(result[1].title).toBe('Another Real Movie');
        });
    });

    describe('Performance and Reliability', () => {
        test('should handle large batches efficiently', async () => {
            const titles = Array.from({ length: 15 }, (_, i) => `Movie ${i + 1}`);
            
            // Mock responses for all movies
            tmdbService.client.get = jest.fn().mockResolvedValue({
                data: { results: [{ id: 1, title: 'Test Movie', overview: 'Test', release_date: '2023-01-01' }] }
            });

            const startTime = Date.now();
            const result = await tmdbService.fetchMovies(titles);
            const endTime = Date.now();

            // Should enforce 10 movie limit
            expect(result).toHaveLength(10);
            
            // Should complete quickly due to parallel processing
            expect(endTime - startTime).toBeLessThan(1000);
            
            // Should have made exactly 10 API calls (due to limit)
            expect(tmdbService.client.get).toHaveBeenCalledTimes(10);
        });

        test('should handle mixed success/failure scenarios', async () => {
            const titles = ['Success 1', 'Failure', 'Success 2', 'Another Failure', 'Success 3'];
            
            // Mock mixed responses
            tmdbService.client.get = jest.fn()
                .mockResolvedValueOnce({ data: { results: [{ id: 1, title: 'Success 1', overview: 'Good', release_date: '2023-01-01' }] } })
                .mockRejectedValueOnce(new Error('API Error'))
                .mockResolvedValueOnce({ data: { results: [{ id: 2, title: 'Success 2', overview: 'Good', release_date: '2023-01-01' }] } })
                .mockResolvedValueOnce({ data: { results: [] } }) // No results
                .mockResolvedValueOnce({ data: { results: [{ id: 3, title: 'Success 3', overview: 'Good', release_date: '2023-01-01' }] } });

            const result = await tmdbService.fetchMovies(titles);

            // Should return only successful results
            expect(result).toHaveLength(3);
            expect(result.map(m => m.title)).toEqual(['Success 1', 'Success 2', 'Success 3']);
        });
    });

    describe('Fallback Mechanisms', () => {
        test('should provide static recommendations when service fails', () => {
            const fallbackMovies = tmdbService.getStaticRecommendations();

            expect(Array.isArray(fallbackMovies)).toBe(true);
            expect(fallbackMovies.length).toBeGreaterThan(0);
            
            fallbackMovies.forEach(movie => {
                expect(movie).toHaveProperty('title');
                expect(movie).toHaveProperty('synopsis');
                expect(movie).toHaveProperty('releaseYear');
                expect(movie).toHaveProperty('tmdbId');
                expect(typeof movie.tmdbId).toBe('number');
                expect(movie.tmdbId).toBeGreaterThan(0);
            });
        });

        test('should handle complete service outage gracefully', async () => {
            // Mock complete service failure
            tmdbService.client.get = jest.fn().mockRejectedValue(new Error('Service unavailable'));

            const result = await tmdbService.fetchMovies(['Any Movie']);

            // Should return empty array, not throw error
            expect(result).toEqual([]);
        });
    });

    describe('Data Quality Validation', () => {
        test('should ensure all returned movies have required fields', async () => {
            const mockResponse = {
                data: {
                    results: [{
                        id: 123,
                        title: 'Test Movie',
                        overview: 'Test overview',
                        release_date: '2023-01-01',
                        poster_path: '/test.jpg',
                        vote_average: 7.5,
                        genre_ids: [28, 12]
                    }]
                }
            };

            tmdbService.client.get = jest.fn().mockResolvedValue(mockResponse);

            const result = await tmdbService.fetchMovies(['Test Movie']);

            expect(result).toHaveLength(1);
            const movie = result[0];

            // Validate all required fields are present and properly typed
            expect(typeof movie.title).toBe('string');
            expect(movie.title.length).toBeGreaterThan(0);
            
            expect(typeof movie.tmdbId).toBe('number');
            expect(movie.tmdbId).toBeGreaterThan(0);
            
            expect(typeof movie.synopsis).toBe('string');
            expect(typeof movie.releaseYear).toBe('string');
            expect(typeof movie.rating).toBe('number');
            
            expect(Array.isArray(movie.genres)).toBe(true);
            
            // posterUrl can be string or null
            expect(movie.posterUrl === null || typeof movie.posterUrl === 'string').toBe(true);
            if (movie.posterUrl) {
                expect(movie.posterUrl).toMatch(/^https:\/\/image\.tmdb\.org/);
            }
        });

        test('should handle incomplete TMDB data gracefully', async () => {
            const incompleteResponse = {
                data: {
                    results: [{
                        id: 456,
                        title: 'Incomplete Movie',
                        // Missing overview, release_date, poster_path, etc.
                    }]
                }
            };

            tmdbService.client.get = jest.fn().mockResolvedValue(incompleteResponse);

            const result = await tmdbService.fetchMovies(['Incomplete Movie']);

            expect(result).toHaveLength(1);
            const movie = result[0];

            expect(movie.title).toBe('Incomplete Movie');
            expect(movie.tmdbId).toBe(456);
            expect(movie.posterUrl).toBeNull();
            expect(movie.synopsis).toBe('No synopsis available.');
            expect(movie.releaseYear).toBe('Unknown');
            expect(movie.rating).toBe(0);
        });
    });
});