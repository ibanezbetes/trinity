/**
 * Property-Based Tests for Enhanced TMDB Client
 * Feature: trinity-critical-bug-fixes
 * 
 * Tests the critical genre mapping and endpoint selection logic
 * that fixes the TV shows filtering bug.
 */

import * as fc from 'fast-check';
import { EnhancedTMDBClient, DiscoverParams } from '../enhanced-tmdb-client';
import { MediaType } from '../../types/content-filtering-types';

// Mock fetch globally
global.fetch = jest.fn();

describe('Property-Based Tests: Enhanced TMDB Client', () => {
    let client: EnhancedTMDBClient;
    const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

    beforeEach(() => {
        client = new EnhancedTMDBClient();
        mockFetch.mockClear();
        
        // Set up environment variable
        process.env.TMDB_API_KEY = 'test-api-key';
        
        // Reinitialize client to pick up the environment variable
        client = new EnhancedTMDBClient();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Property 1: TMDB Endpoint Selection Consistency
     * For any valid MediaType, the system should consistently select 
     * the correct TMDB endpoint and apply proper genre mapping
     * Validates: Requirements 1.1, 3.1, 3.2, 3.4
     */
    describe('Property 1: TMDB Endpoint Selection Consistency', () => {
        test('should consistently select correct endpoints for different media types', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('MOVIE', 'TV'), // mediaType
                    fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 3 }), // genreIds
                    fc.constantFrom('popularity.desc', 'vote_average.desc'), // sortBy
                    fc.integer({ min: 1, max: 5 }), // page
                    async (mediaType: MediaType, genreIds: number[], sortBy: string, page: number) => {
                        // Setup mock response
                        const mockResponse = {
                            ok: true,
                            json: async () => ({
                                results: [
                                    {
                                        id: 123,
                                        title: mediaType === 'MOVIE' ? 'Test Movie' : undefined,
                                        name: mediaType === 'TV' ? 'Test TV Show' : undefined,
                                        overview: 'Test overview',
                                        genre_ids: genreIds,
                                        vote_average: 7.5,
                                        release_date: mediaType === 'MOVIE' ? '2023-01-01' : undefined,
                                        first_air_date: mediaType === 'TV' ? '2023-01-01' : undefined,
                                        poster_path: '/test.jpg'
                                    }
                                ]
                            })
                        };
                        
                        mockFetch.mockResolvedValue(mockResponse as any);

                        const params: DiscoverParams = {
                            mediaType,
                            withGenres: genreIds.join(','),
                            sortBy: sortBy as any,
                            page
                        };

                        // Execute
                        const results = await client.discoverContent(params);

                        // Property: Correct endpoint should be called (may have retries due to rate limiting)
                        expect(mockFetch).toHaveBeenCalled();
                        const callUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as string;
                        
                        if (mediaType === 'MOVIE') {
                            expect(callUrl).toContain('/discover/movie');
                        } else {
                            expect(callUrl).toContain('/discover/tv');
                        }

                        // Property: API key should be included
                        expect(callUrl).toContain('api_key=test-api-key');

                        // Property: Language should be Spanish
                        expect(callUrl).toContain('language=es-ES');

                        // Property: Sort parameter should be included
                        expect(callUrl).toContain(`sort_by=${sortBy}`);

                        // Property: Page parameter should be included
                        expect(callUrl).toContain(`page=${page}`);

                        // Property: Results should be valid
                        expect(results).toHaveLength(1);
                        expect(results[0]).toHaveProperty('id', 123);
                        expect(results[0]).toHaveProperty('overview', 'Test overview');
                        expect(results[0]).toHaveProperty('genre_ids', genreIds);
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should apply genre mapping correctly for TV shows', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom(28, 12, 37, 10752), // Movie genre IDs that need mapping
                    async (movieGenreId: number) => {
                        // Setup mock response
                        const mockResponse = {
                            ok: true,
                            json: async () => ({
                                results: [
                                    {
                                        id: 456,
                                        name: 'Test TV Show',
                                        overview: 'Test TV overview',
                                        genre_ids: [movieGenreId],
                                        vote_average: 8.0,
                                        first_air_date: '2023-01-01',
                                        poster_path: '/test-tv.jpg'
                                    }
                                ]
                            })
                        };
                        
                        mockFetch.mockResolvedValue(mockResponse as any);

                        const params: DiscoverParams = {
                            mediaType: 'TV',
                            withGenres: movieGenreId.toString()
                        };

                        // Execute
                        await client.discoverContent(params);

                        // Property: Genre mapping should be applied for TV
                        const callUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as string;
                        
                        // Check if genre was mapped correctly
                        const expectedMappings: { [key: number]: number } = {
                            28: 10759,  // Action → Action & Adventure
                            12: 10759,  // Adventure → Action & Adventure
                            37: 37,     // Western → Western (same)
                            10752: 10768 // War → War & Politics
                        };
                        
                        const expectedGenreId = expectedMappings[movieGenreId];
                        // Handle URL encoding - decode the URL to check the actual parameter
                        const decodedUrl = decodeURIComponent(callUrl);
                        expect(decodedUrl).toContain(`with_genres=${expectedGenreId}`);
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should not apply genre mapping for movies', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom(28, 12, 37, 10752), // Movie genre IDs
                    async (movieGenreId: number) => {
                        // Setup mock response
                        const mockResponse = {
                            ok: true,
                            json: async () => ({
                                results: [
                                    {
                                        id: 789,
                                        title: 'Test Movie',
                                        overview: 'Test movie overview',
                                        genre_ids: [movieGenreId],
                                        vote_average: 7.8,
                                        release_date: '2023-01-01',
                                        poster_path: '/test-movie.jpg'
                                    }
                                ]
                            })
                        };
                        
                        mockFetch.mockResolvedValue(mockResponse as any);

                        const params: DiscoverParams = {
                            mediaType: 'MOVIE',
                            withGenres: movieGenreId.toString()
                        };

                        // Execute
                        await client.discoverContent(params);

                        // Property: No genre mapping should be applied for movies
                        const callUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as string;
                        const decodedUrl = decodeURIComponent(callUrl);
                        expect(decodedUrl).toContain(`with_genres=${movieGenreId}`);
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should handle multiple genre IDs with mapping for TV', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(fc.constantFrom(28, 12, 35, 18), { minLength: 2, maxLength: 3 }), // Mix of mappable and non-mappable genres
                    async (genreIds: number[]) => {
                        // Setup mock response
                        const mockResponse = {
                            ok: true,
                            json: async () => ({
                                results: [
                                    {
                                        id: 999,
                                        name: 'Multi-genre TV Show',
                                        overview: 'Multi-genre overview',
                                        genre_ids: genreIds,
                                        vote_average: 8.5,
                                        first_air_date: '2023-01-01',
                                        poster_path: '/multi-genre.jpg'
                                    }
                                ]
                            })
                        };
                        
                        mockFetch.mockResolvedValue(mockResponse as any);

                        const params: DiscoverParams = {
                            mediaType: 'TV',
                            withGenres: genreIds.join(',')
                        };

                        // Execute
                        await client.discoverContent(params);

                        // Property: All genre IDs should be processed with mapping
                        const callUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as string;
                        
                        // Apply expected mappings
                        const mappings: { [key: number]: number } = {
                            28: 10759,  // Action → Action & Adventure
                            12: 10759,  // Adventure → Action & Adventure
                            35: 35,     // Comedy → Comedy (same)
                            18: 18      // Drama → Drama (same)
                        };
                        
                        const expectedGenres = genreIds.map(id => mappings[id] || id);
                        const expectedGenreString = expectedGenres.join(',');
                        
                        const decodedUrl = decodeURIComponent(callUrl);
                        expect(decodedUrl).toContain(`with_genres=${expectedGenreString}`);
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should validate media type strictly', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('INVALID', 'movie', 'tv', '', null, undefined), // Invalid media types
                    async (invalidMediaType: any) => {
                        const params: DiscoverParams = {
                            mediaType: invalidMediaType as MediaType,
                            withGenres: '28'
                        };

                        // Property: Invalid media types should throw errors
                        await expect(client.discoverContent(params)).rejects.toThrow();
                        
                        // Property: No API calls should be made for invalid media types
                        expect(mockFetch).not.toHaveBeenCalled();
                    }
                ),
                { numRuns: 50 }
            );
        });

        test('should handle content validation correctly', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('MOVIE', 'TV'), // mediaType
                    fc.boolean(), // hasTitle
                    fc.boolean(), // hasOverview
                    fc.boolean(), // hasReleaseDate
                    fc.boolean(), // hasGenreIds
                    async (mediaType: MediaType, hasTitle: boolean, hasOverview: boolean, hasReleaseDate: boolean, hasGenreIds: boolean) => {
                        // Create content item with conditional fields
                        const contentItem: any = {
                            id: 123,
                            vote_average: 7.5
                        };

                        // Add title/name based on media type and hasTitle flag
                        if (hasTitle) {
                            if (mediaType === 'MOVIE') {
                                contentItem.title = 'Test Movie';
                            } else {
                                contentItem.name = 'Test TV Show';
                            }
                        }

                        // Add overview
                        if (hasOverview) {
                            contentItem.overview = 'Test overview';
                        }

                        // Add release date based on media type and hasReleaseDate flag
                        if (hasReleaseDate) {
                            if (mediaType === 'MOVIE') {
                                contentItem.release_date = '2023-01-01';
                            } else {
                                contentItem.first_air_date = '2023-01-01';
                            }
                        }

                        // Add genre IDs
                        if (hasGenreIds) {
                            contentItem.genre_ids = [28, 35];
                        }

                        const mockResponse = {
                            ok: true,
                            json: async () => ({
                                results: [contentItem]
                            })
                        };
                        
                        mockFetch.mockResolvedValue(mockResponse as any);

                        const params: DiscoverParams = {
                            mediaType,
                            withGenres: '28'
                        };

                        // Execute
                        const results = await client.discoverContent(params);

                        // Property: Only valid content should be returned
                        const shouldBeValid = hasTitle && hasOverview && hasReleaseDate && hasGenreIds;
                        
                        if (shouldBeValid) {
                            expect(results).toHaveLength(1);
                            expect(results[0]).toHaveProperty('id', 123);
                        } else {
                            expect(results).toHaveLength(0);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should handle API errors gracefully', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('MOVIE', 'TV'), // mediaType
                    fc.integer({ min: 400, max: 599 }), // HTTP error codes
                    async (mediaType: MediaType, errorCode: number) => {
                        // Setup mock error response
                        const mockResponse = {
                            ok: false,
                            status: errorCode,
                            statusText: `HTTP ${errorCode} Error`
                        };
                        
                        mockFetch.mockResolvedValue(mockResponse as any);

                        const params: DiscoverParams = {
                            mediaType,
                            withGenres: '28'
                        };

                        // Property: API errors should be thrown
                        await expect(client.discoverContent(params)).rejects.toThrow(`TMDB API error: ${errorCode}`);
                    }
                ),
                { numRuns: 50 }
            );
        });
    });
});