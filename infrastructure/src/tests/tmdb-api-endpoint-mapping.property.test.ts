/**
 * Property-Based Test: API Endpoint Mapping
 * 
 * **Feature: advanced-content-filtering, Property 7: API Endpoint Mapping**
 * **Validates: Requirements 4.1, 4.2**
 * 
 * Property: For any media type selection, the system should use `/discover/movie` 
 * for MOVIE type and `/discover/tv` for TV type
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MediaType } from '../types/content-filtering';
import { EnhancedTMDBClientImpl, TMDBClientFactory } from '../services/enhanced-tmdb-client';
import { TMDBDiscoverParams } from '../types/tmdb-client';
import { 
  createMockResponse, 
  createMockDiscoverResponse, 
  createMockMovie, 
  createMockTVShow,
  assertEndpointCalled,
  assertQueryParams
} from './test-utils';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('Property Test: API Endpoint Mapping', () => {
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
   * Property 7: API Endpoint Mapping
   * For any media type selection, the system should use correct TMDB endpoints
   */
  test('Property 7: API Endpoint Mapping - MOVIE type uses discover/movie endpoint', async () => {
    // Arrange: Mock successful API response
    const mockMovie = createMockMovie(123);
    const mockResponse = createMockDiscoverResponse([mockMovie]);
    mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));
    
    const testParams: TMDBDiscoverParams = {
      with_genres: '28,12',
      sort_by: 'popularity.desc',
      page: 1
    };
    
    // Act: Call discover method with MOVIE media type
    await client.discover(MediaType.MOVIE, testParams);
    
    // Assert: Verify correct endpoint was called
    assertEndpointCalled(mockFetch, '/discover/movie');
    assertQueryParams(mockFetch, {
      'api_key': mockApiKey,
      'with_genres': '28,12',
      'sort_by': 'popularity.desc',
      'page': '1'
    });
  });
  
  test('Property 7: API Endpoint Mapping - TV type uses discover/tv endpoint', async () => {
    // Arrange: Mock successful API response
    const mockResponse = {
      page: 1,
      results: [
        {
          id: 456,
          name: 'Test TV Show',
          overview: 'Test TV overview',
          genre_ids: [35, 18],
          vote_average: 8.2,
          first_air_date: '2023-01-01',
          poster_path: '/test-tv-poster.jpg'
        }
      ],
      total_pages: 1,
      total_results: 1
    };
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
      headers: new Headers()
    });
    
    const testParams: TMDBDiscoverParams = {
      with_genres: '35,18',
      sort_by: 'vote_average.desc',
      page: 1
    };
    
    // Act: Call discover method with TV media type
    await client.discover(MediaType.TV, testParams);
    
    // Assert: Verify correct endpoint was called
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    
    // Property assertion: TV type should use discover/tv endpoint
    expect(calledUrl).toContain('/discover/tv');
    expect(calledUrl).not.toContain('/discover/movie');
    
    // Verify API key is included
    expect(calledUrl).toContain(`api_key=${mockApiKey}`);
    
    // Verify parameters are correctly passed
    expect(calledUrl).toContain('with_genres=35%2C18');
    expect(calledUrl).toContain('sort_by=vote_average.desc');
    expect(calledUrl).toContain('page=1');
  });
  
  test('Property 7: API Endpoint Mapping - discoverMovies method uses movie endpoint', async () => {
    // Arrange: Mock successful API response
    const mockResponse = {
      page: 1,
      results: [],
      total_pages: 1,
      total_results: 0
    };
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
      headers: new Headers()
    });
    
    const testParams: TMDBDiscoverParams = {
      with_genres: '14',
      page: 1
    };
    
    // Act: Call discoverMovies method
    await client.discoverMovies(testParams);
    
    // Assert: Verify movie endpoint was used
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    
    expect(calledUrl).toContain('/discover/movie');
    expect(calledUrl).not.toContain('/discover/tv');
  });
  
  test('Property 7: API Endpoint Mapping - discoverTV method uses TV endpoint', async () => {
    // Arrange: Mock successful API response
    const mockResponse = {
      page: 1,
      results: [],
      total_pages: 1,
      total_results: 0
    };
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
      headers: new Headers()
    });
    
    const testParams: TMDBDiscoverParams = {
      with_genres: '16',
      page: 1
    };
    
    // Act: Call discoverTV method
    await client.discoverTV(testParams);
    
    // Assert: Verify TV endpoint was used
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    
    expect(calledUrl).toContain('/discover/tv');
    expect(calledUrl).not.toContain('/discover/movie');
  });
  
  /**
   * Property-based test with multiple media types
   * Tests the invariant across different combinations
   */
  test('Property 7: API Endpoint Mapping - Invariant holds for all media types', async () => {
    const testCases = [
      { mediaType: MediaType.MOVIE, expectedEndpoint: '/discover/movie' },
      { mediaType: MediaType.TV, expectedEndpoint: '/discover/tv' }
    ];
    
    for (const testCase of testCases) {
      // Arrange: Mock response for each test case
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          page: 1,
          results: [],
          total_pages: 1,
          total_results: 0
        }),
        headers: new Headers()
      });
      
      const params: TMDBDiscoverParams = {
        with_genres: '28',
        page: 1
      };
      
      // Act: Call discover with the media type
      await client.discover(testCase.mediaType, params);
      
      // Assert: Verify correct endpoint mapping
      const calledUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as string;
      
      expect(calledUrl).toContain(testCase.expectedEndpoint);
      
      // Ensure it doesn't contain the wrong endpoint
      const otherEndpoints = testCases
        .filter(tc => tc.mediaType !== testCase.mediaType)
        .map(tc => tc.expectedEndpoint);
      
      otherEndpoints.forEach(wrongEndpoint => {
        expect(calledUrl).not.toContain(wrongEndpoint);
      });
    }
    
    // Verify all calls were made
    expect(mockFetch).toHaveBeenCalledTimes(testCases.length);
  });
  
  test('Property 7: API Endpoint Mapping - Base URL construction is consistent', async () => {
    // Arrange: Test with custom base URL
    const customClient = TMDBClientFactory.create({
      apiKey: mockApiKey,
      baseUrl: 'https://custom-tmdb-api.com/v3'
    }) as EnhancedTMDBClientImpl;
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        page: 1,
        results: [],
        total_pages: 1,
        total_results: 0
      }),
      headers: new Headers()
    });
    
    // Act: Make a request
    await customClient.discover(MediaType.MOVIE, { page: 1 });
    
    // Assert: Verify custom base URL is used with correct endpoint
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://custom-tmdb-api.com/v3/discover/movie');
  });
  
  test('Property 7: API Endpoint Mapping - Error handling preserves endpoint information', async () => {
    // Arrange: Mock API error
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers()
    });
    
    // Act & Assert: Verify error contains endpoint information
    await expect(
      client.discover(MediaType.MOVIE, { page: 1 })
    ).rejects.toThrow();
    
    // Verify the correct endpoint was attempted
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/discover/movie');
  });
});
