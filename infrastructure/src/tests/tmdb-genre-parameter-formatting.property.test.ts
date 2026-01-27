/**
 * Property-Based Test: Genre Parameter Formatting
 * 
 * **Feature: advanced-content-filtering, Property 8: Genre Parameter Formatting**
 * **Validates: Requirements 4.3, 4.4**
 * 
 * Property: For any multi-genre query, the system should use comma-separated IDs 
 * for AND logic (Priority 1) and pipe-separated IDs for OR logic (Priority 2)
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MediaType } from '../types/content-filtering';
import { EnhancedTMDBClientImpl, TMDBClientFactory } from '../services/enhanced-tmdb-client';
import { TMDBDiscoverParams } from '../types/tmdb-client';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('Property Test: Genre Parameter Formatting', () => {
  let client: EnhancedTMDBClientImpl;
  const mockApiKey = 'test-api-key-12345';
  
  beforeEach(() => {
    client = TMDBClientFactory.create({ apiKey: mockApiKey }) as EnhancedTMDBClientImpl;
    mockFetch.mockClear();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  /**
   * Helper function to mock successful TMDB API response
   */
  const mockSuccessfulResponse = (results: any[] = []) => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        page: 1,
        results,
        total_pages: 1,
        total_results: results.length
      }),
      headers: new Headers()
    });
  };
  
  /**
   * Property 8: Genre Parameter Formatting - AND Logic (Comma-separated)
   * Tests that getContentWithAllGenres uses comma-separated genre IDs
   */
  test('Property 8: Genre Parameter Formatting - AND logic uses comma-separated IDs', async () => {
    // Arrange: Mock multiple pages of responses for getContentWithAllGenres
    for (let i = 0; i < 5; i++) {
      mockSuccessfulResponse([
        {
          id: 100 + i,
          title: `Test Movie ${i}`,
          overview: 'Test overview',
          genre_ids: [28, 12, 16], // Contains all requested genres
          vote_average: 7.5,
          release_date: '2023-01-01',
          poster_path: '/test-poster.jpg'
        }
      ]);
    }
    
    const testGenreIds = [28, 12, 16]; // Action, Adventure, Animation
    
    // Act: Call getContentWithAllGenres (should use AND logic)
    await client.getContentWithAllGenres(MediaType.MOVIE, testGenreIds, 10);
    
    // Assert: Verify comma-separated genre formatting for AND logic
    expect(mockFetch).toHaveBeenCalledTimes(5); // 5 pages
    
    // Check all calls use comma-separated format
    for (let i = 0; i < 5; i++) {
      const calledUrl = mockFetch.mock.calls[i][0] as string;
      
      // Property assertion: AND logic should use comma-separated IDs
      expect(calledUrl).toContain('with_genres=28%2C12%2C16'); // URL-encoded comma
      expect(calledUrl).not.toContain('with_genres=28%7C12%7C16'); // Should not contain pipes
      
      // Verify it's using vote_average.desc for AND logic (Priority 1)
      expect(calledUrl).toContain('sort_by=vote_average.desc');
    }
  });
  
  /**
   * Property 8: Genre Parameter Formatting - OR Logic (Pipe-separated)
   * Tests that getContentWithAnyGenre uses pipe-separated genre IDs
   */
  test('Property 8: Genre Parameter Formatting - OR logic uses pipe-separated IDs', async () => {
    // Arrange: Mock multiple pages of responses for getContentWithAnyGenre
    for (let i = 0; i < 3; i++) {
      mockSuccessfulResponse([
        {
          id: 200 + i,
          name: `Test TV Show ${i}`,
          overview: 'Test TV overview',
          genre_ids: [35], // Contains at least one requested genre
          vote_average: 8.2,
          first_air_date: '2023-01-01',
          poster_path: '/test-tv-poster.jpg'
        }
      ]);
    }
    
    const testGenreIds = [35, 18, 10749]; // Comedy, Drama, Romance
    
    // Act: Call getContentWithAnyGenre (should use OR logic)
    await client.getContentWithAnyGenre(MediaType.TV, testGenreIds, 10);
    
    // Assert: Verify pipe-separated genre formatting for OR logic
    expect(mockFetch).toHaveBeenCalledTimes(3); // 3 pages
    
    // Check all calls use pipe-separated format
    for (let i = 0; i < 3; i++) {
      const calledUrl = mockFetch.mock.calls[i][0] as string;
      
      // Property assertion: OR logic should use pipe-separated IDs
      expect(calledUrl).toContain('with_genres=35%7C18%7C10749'); // URL-encoded pipe
      expect(calledUrl).not.toContain('with_genres=35%2C18%2C10749'); // Should not contain commas
      
      // Verify it's using popularity.desc for OR logic (Priority 2)
      expect(calledUrl).toContain('sort_by=popularity.desc');
    }
  });
  
  /**
   * Property 8: Genre Parameter Formatting - Direct parameter passing
   * Tests that discover method correctly formats genre parameters
   */
  test('Property 8: Genre Parameter Formatting - Direct comma-separated parameters', async () => {
    // Arrange
    mockSuccessfulResponse();
    
    const params: TMDBDiscoverParams = {
      with_genres: '28,12,16', // Comma-separated for AND logic
      sort_by: 'vote_average.desc',
      page: 1
    };
    
    // Act
    await client.discover(MediaType.MOVIE, params);
    
    // Assert: Verify comma-separated format is preserved
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('with_genres=28%2C12%2C16');
    expect(calledUrl).not.toContain('%7C'); // No pipes
  });
  
  test('Property 8: Genre Parameter Formatting - Direct pipe-separated parameters', async () => {
    // Arrange
    mockSuccessfulResponse();
    
    const params: TMDBDiscoverParams = {
      with_genres: '35|18|10749', // Pipe-separated for OR logic
      sort_by: 'popularity.desc',
      page: 1
    };
    
    // Act
    await client.discover(MediaType.TV, params);
    
    // Assert: Verify pipe-separated format is preserved
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('with_genres=35%7C18%7C10749');
    expect(calledUrl).not.toContain('%2C'); // No commas
  });
  
  /**
   * Property 8: Genre Parameter Formatting - Single genre handling
   * Tests that single genres work correctly in both contexts
   */
  test('Property 8: Genre Parameter Formatting - Single genre in AND context', async () => {
    // Arrange
    for (let i = 0; i < 5; i++) {
      mockSuccessfulResponse([
        {
          id: 300 + i,
          title: `Single Genre Movie ${i}`,
          overview: 'Test overview',
          genre_ids: [28], // Action only
          vote_average: 7.0,
          release_date: '2023-01-01'
        }
      ]);
    }
    
    // Act: Single genre in AND context
    await client.getContentWithAllGenres(MediaType.MOVIE, [28], 5);
    
    // Assert: Single genre should still work (no comma needed)
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('with_genres=28');
    expect(calledUrl).not.toContain('%2C'); // No comma for single genre
    expect(calledUrl).not.toContain('%7C'); // No pipe for single genre
  });
  
  test('Property 8: Genre Parameter Formatting - Single genre in OR context', async () => {
    // Arrange
    for (let i = 0; i < 3; i++) {
      mockSuccessfulResponse([
        {
          id: 400 + i,
          name: `Single Genre TV ${i}`,
          overview: 'Test overview',
          genre_ids: [35], // Comedy only
          vote_average: 8.0,
          first_air_date: '2023-01-01'
        }
      ]);
    }
    
    // Act: Single genre in OR context
    await client.getContentWithAnyGenre(MediaType.TV, [35], 5);
    
    // Assert: Single genre should still work (no pipe needed)
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('with_genres=35');
    expect(calledUrl).not.toContain('%2C'); // No comma for single genre
    expect(calledUrl).not.toContain('%7C'); // No pipe for single genre
  });
  
  /**
   * Property 8: Genre Parameter Formatting - Empty genre handling
   * Tests behavior when no genres are specified
   */
  test('Property 8: Genre Parameter Formatting - Empty genres fall back to popular', async () => {
    // Arrange: Mock popular endpoint response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        page: 1,
        results: [
          {
            id: 500,
            title: 'Popular Movie',
            overview: 'Popular content',
            genre_ids: [28, 12],
            vote_average: 8.5,
            release_date: '2023-01-01'
          }
        ],
        total_pages: 1,
        total_results: 1
      }),
      headers: new Headers()
    });
    
    // Act: Call with empty genre array
    await client.getContentWithAllGenres(MediaType.MOVIE, [], 10);
    
    // Assert: Should fall back to popular endpoint (no genre parameters)
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/movie/popular');
    expect(calledUrl).not.toContain('with_genres');
  });
  
  /**
   * Property 8: Genre Parameter Formatting - Maximum genre limit
   * Tests formatting with maximum allowed genres (3)
   */
  test('Property 8: Genre Parameter Formatting - Maximum genres AND logic', async () => {
    // Arrange
    for (let i = 0; i < 5; i++) {
      mockSuccessfulResponse([
        {
          id: 600 + i,
          title: `Max Genres Movie ${i}`,
          overview: 'Test overview',
          genre_ids: [28, 12, 16], // All three genres
          vote_average: 7.8,
          release_date: '2023-01-01'
        }
      ]);
    }
    
    const maxGenres = [28, 12, 16]; // Action, Adventure, Animation (max 3)
    
    // Act
    await client.getContentWithAllGenres(MediaType.MOVIE, maxGenres, 10);
    
    // Assert: All three genres should be comma-separated
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('with_genres=28%2C12%2C16');
    
    // Verify all genre IDs are present
    maxGenres.forEach(genreId => {
      expect(calledUrl).toContain(genreId.toString());
    });
  });
  
  test('Property 8: Genre Parameter Formatting - Maximum genres OR logic', async () => {
    // Arrange
    for (let i = 0; i < 3; i++) {
      mockSuccessfulResponse([
        {
          id: 700 + i,
          name: `Max Genres TV ${i}`,
          overview: 'Test overview',
          genre_ids: [35], // At least one genre
          vote_average: 8.1,
          first_air_date: '2023-01-01'
        }
      ]);
    }
    
    const maxGenres = [35, 18, 10749]; // Comedy, Drama, Romance (max 3)
    
    // Act
    await client.getContentWithAnyGenre(MediaType.TV, maxGenres, 10);
    
    // Assert: All three genres should be pipe-separated
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('with_genres=35%7C18%7C10749');
    
    // Verify all genre IDs are present
    maxGenres.forEach(genreId => {
      expect(calledUrl).toContain(genreId.toString());
    });
  });
  
  /**
   * Property 8: Genre Parameter Formatting - Invariant test
   * Tests that the formatting invariant holds across different scenarios
   */
  test('Property 8: Genre Parameter Formatting - Invariant holds for all valid inputs', async () => {
    const testCases = [
      {
        method: 'AND',
        genreIds: [28],
        expectedSeparator: '', // Single genre, no separator
        expectedFormat: '28'
      },
      {
        method: 'AND',
        genreIds: [28, 12],
        expectedSeparator: '%2C', // Comma for AND
        expectedFormat: '28%2C12'
      },
      {
        method: 'AND',
        genreIds: [28, 12, 16],
        expectedSeparator: '%2C', // Comma for AND
        expectedFormat: '28%2C12%2C16'
      },
      {
        method: 'OR',
        genreIds: [35],
        expectedSeparator: '', // Single genre, no separator
        expectedFormat: '35'
      },
      {
        method: 'OR',
        genreIds: [35, 18],
        expectedSeparator: '%7C', // Pipe for OR
        expectedFormat: '35%7C18'
      },
      {
        method: 'OR',
        genreIds: [35, 18, 10749],
        expectedSeparator: '%7C', // Pipe for OR
        expectedFormat: '35%7C18%7C10749'
      }
    ];
    
    for (const testCase of testCases) {
      // Arrange: Mock responses based on method
      const pagesToMock = testCase.method === 'AND' ? 5 : 3;
      for (let i = 0; i < pagesToMock; i++) {
        mockSuccessfulResponse([
          {
            id: 800 + i,
            title: `Test Content ${i}`,
            overview: 'Test',
            genre_ids: testCase.genreIds,
            vote_average: 7.0,
            release_date: '2023-01-01'
          }
        ]);
      }
      
      // Act: Call appropriate method
      if (testCase.method === 'AND') {
        await client.getContentWithAllGenres(MediaType.MOVIE, testCase.genreIds, 5);
      } else {
        await client.getContentWithAnyGenre(MediaType.MOVIE, testCase.genreIds, 5);
      }
      
      // Assert: Verify correct formatting
      const recentCalls = mockFetch.mock.calls.slice(-pagesToMock);
      recentCalls.forEach(call => {
        const calledUrl = call[0] as string;
        expect(calledUrl).toContain(`with_genres=${testCase.expectedFormat}`);
        
        // Verify separator consistency
        if (testCase.expectedSeparator) {
          expect(calledUrl).toContain(testCase.expectedSeparator);
        }
      });
    }
  });
});
