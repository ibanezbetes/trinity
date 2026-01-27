import * as fc from 'fast-check';
import { handler } from '../handlers/ai';
import { AppSyncResolverEvent, Context } from 'aws-lambda';

// Mock environment variables
process.env.HF_API_TOKEN = 'test-token';
process.env.TMDB_API_KEY = 'test-tmdb-key';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      Items: [],
      Count: 0
    })
  }))
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockReturnValue({
      send: jest.fn().mockResolvedValue({
        Items: [],
        Count: 0
      })
    })
  },
  GetCommand: jest.fn(),
  PutCommand: jest.fn(),
  QueryCommand: jest.fn()
}));

// Mock fetch for Hugging Face API and TMDB API
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Mock movie cache service
jest.mock('../services/movieCacheService', () => ({
  movieCacheService: {
    preCacheMovies: jest.fn(),
  },
}));

// Mock metrics utilities
jest.mock('../utils/metrics', () => ({
  logBusinessMetric: jest.fn(),
  logError: jest.fn(),
  PerformanceTimer: jest.fn().mockImplementation(() => ({
    finish: jest.fn(),
  })),
}));

// Mock context
const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-function',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test-function',
  logStreamName: '2023/01/01/[$LATEST]test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: jest.fn(),
  fail: jest.fn(),
  succeed: jest.fn(),
};

// Helper to create mock AppSync event
function createMockEvent(fieldName: string, args: any): AppSyncResolverEvent<any> {
  return {
    arguments: args,
    identity: null,
    source: null,
    request: {
      headers: {},
      domainName: null,
    },
    prev: null,
    info: {
      fieldName,
      parentTypeName: 'Query',
      variables: {},
      selectionSetList: [],
      selectionSetGraphQL: '',
    },
    stash: {},
  };
}

describe('AI Fallback Behavior Property Tests', () => {
  // Get the mocked function
  const { movieCacheService } = require('../services/movieCacheService');
  const mockPreCacheMovies = movieCacheService.preCacheMovies as jest.MockedFunction<typeof movieCacheService.preCacheMovies>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 16: AI Fallback Behavior
   * For any AI service failure, the system should fall back to genre-based TMDB API recommendations
   * Validates: Requirements 6.5
   * 
   * Feature: trinity-voting-fixes, Property 16: AI Fallback Behavior
   */
  it('should fall back to TMDB API recommendations when AI service fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate user text input
        fc.string({ minLength: 5, maxLength: 100 }).filter(s => s.trim().length > 0),
        // Generate room genres (0-3 genres from available list)
        fc.array(
          fc.constantFrom(
            'acción', 'aventura', 'animación', 'comedia', 'crimen', 'documental',
            'drama', 'familia', 'fantasía', 'historia', 'terror', 'música',
            'misterio', 'romance', 'ciencia ficción', 'thriller', 'guerra', 'western'
          ),
          { minLength: 0, maxLength: 3 }
        ).map(genres => [...new Set(genres)]), // Remove duplicates
        async (userText: string, roomGenres: string[]) => {
          // Mock Salamandra API failure
          mockFetch.mockRejectedValueOnce(new Error('Salamandra API unavailable'));

          // Mock successful TMDB API response through movie cache service
          const mockMovies = [
            {
              tmdbId: 1,
              title: 'Test Movie 1',
              posterPath: 'https://image.tmdb.org/t/p/w500/test1.jpg',
              overview: 'A great test movie',
              genres: roomGenres.length > 0 ? [roomGenres[0]] : ['drama'],
              year: 2023,
              rating: 8.0,
              cachedAt: new Date().toISOString(),
              ttl: Date.now() + 86400000,
            },
            {
              tmdbId: 2,
              title: 'Test Movie 2',
              posterPath: 'https://image.tmdb.org/t/p/w500/test2.jpg',
              overview: 'Another great test movie',
              genres: roomGenres.length > 1 ? [roomGenres[1]] : ['comedia'],
              year: 2023,
              rating: 7.5,
              cachedAt: new Date().toISOString(),
              ttl: Date.now() + 86400000,
            },
          ];

          mockPreCacheMovies.mockResolvedValueOnce(mockMovies);

          // Create mock AppSync event
          const event = createMockEvent('getChatRecommendations', {
            text: userText,
            roomGenres: roomGenres.length > 0 ? roomGenres : undefined,
          });

          // Execute the handler
          const result = await handler(event, mockContext, jest.fn());

          // Verify response structure
          expect(result).toHaveProperty('chatResponse');
          expect(result).toHaveProperty('recommendedGenres');
          expect(result).toHaveProperty('confidence');
          expect(result).toHaveProperty('reasoning');

          // Verify TMDB fallback was used
          expect(mockPreCacheMovies).toHaveBeenCalledWith(
            'tmdb_fallback_temp',
            expect.any(Array)
          );

          // Verify confidence is appropriate for TMDB fallback (should be higher than local fallback)
          expect(result.confidence).toBeGreaterThan(0.5);
          expect(result.confidence).toBeLessThanOrEqual(1);

          // Verify recommended genres are valid
          expect(Array.isArray(result.recommendedGenres)).toBe(true);
          expect(result.recommendedGenres.length).toBeGreaterThan(0);
          expect(result.recommendedGenres.length).toBeLessThanOrEqual(3);

          // Verify reasoning mentions TMDB
          expect(result.reasoning.toLowerCase()).toContain('tmdb');

          // Verify chat response is contextual and mentions movies found
          expect(result.chatResponse.length).toBeGreaterThan(0);
          expect(result.chatResponse).toContain('películas');
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  }, 15000);

  /**
   * Property Test: Graceful Degradation to Local Fallback
   * When both AI and TMDB API fail, system should use local fallback
   */
  it('should gracefully degrade to local fallback when both AI and TMDB fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.array(
          fc.constantFrom('drama', 'comedia', 'acción', 'thriller', 'romance'),
          { minLength: 0, maxLength: 2 }
        ).map(genres => [...new Set(genres)]),
        async (userText: string, roomGenres: string[]) => {
          // Mock both AI and TMDB failures
          mockFetch.mockRejectedValueOnce(new Error('Salamandra API failure'));
          mockPreCacheMovies.mockRejectedValueOnce(new Error('TMDB API failure'));

          const event = createMockEvent('getChatRecommendations', {
            text: userText,
            roomGenres: roomGenres.length > 0 ? roomGenres : undefined,
          });

          // Execute handler (should use local fallback)
          const result = await handler(event, mockContext, jest.fn());

          // Verify local fallback response structure
          expect(result).toHaveProperty('chatResponse');
          expect(result).toHaveProperty('recommendedGenres');
          expect(result).toHaveProperty('confidence');
          expect(result).toHaveProperty('reasoning');

          // Verify both services were attempted
          expect(mockFetch).toHaveBeenCalled();
          expect(mockPreCacheMovies).toHaveBeenCalled();

          // Verify confidence is reasonable for local fallback
          expect(result.confidence).toBeGreaterThan(0.4);
          expect(result.confidence).toBeLessThanOrEqual(1);

          // Verify recommended genres are valid
          expect(Array.isArray(result.recommendedGenres)).toBe(true);
          expect(result.recommendedGenres.length).toBeGreaterThan(0);
          expect(result.recommendedGenres.length).toBeLessThanOrEqual(3);

          // Verify chat response is empathetic and helpful
          expect(result.chatResponse.length).toBeGreaterThan(0);
          expect(typeof result.reasoning).toBe('string');
          expect(result.reasoning.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50, timeout: 8000 }
    );
  }, 12000);

  /**
   * Property Test: TMDB Fallback Genre Alignment
   * TMDB fallback should respect room genre preferences when available
   */
  it('should align TMDB fallback recommendations with room genres', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 30 }),
        fc.constantFrom('drama', 'comedia', 'acción'), // Single genre for clear alignment
        async (userText: string, roomGenre: string) => {
          // Mock AI failure
          mockFetch.mockRejectedValueOnce(new Error('AI service down'));

          // Mock TMDB response with movies matching the room genre
          const mockMovies = [
            {
              tmdbId: 1,
              title: 'Genre Movie 1',
              posterPath: 'https://image.tmdb.org/t/p/w500/genre1.jpg',
              overview: 'A movie in the requested genre',
              genres: [roomGenre],
              year: 2023,
              rating: 8.0,
              cachedAt: new Date().toISOString(),
              ttl: Date.now() + 86400000,
            },
            {
              tmdbId: 2,
              title: 'Genre Movie 2',
              posterPath: 'https://image.tmdb.org/t/p/w500/genre2.jpg',
              overview: 'Another movie in the requested genre',
              genres: [roomGenre, 'aventura'],
              year: 2023,
              rating: 7.8,
              cachedAt: new Date().toISOString(),
              ttl: Date.now() + 86400000,
            },
          ];

          mockPreCacheMovies.mockResolvedValueOnce(mockMovies);

          const event = createMockEvent('getChatRecommendations', {
            text: userText,
            roomGenres: [roomGenre],
          });

          const result = await handler(event, mockContext, jest.fn());

          // Verify TMDB service was called with correct genre
          expect(mockPreCacheMovies).toHaveBeenCalledWith(
            'tmdb_fallback_temp',
            [roomGenre]
          );

          // Verify recommended genres include the room genre
          const normalizedRecommended = result.recommendedGenres.map((g: string) => g.toLowerCase());
          const normalizedRoomGenre = roomGenre.toLowerCase();
          
          expect(normalizedRecommended).toContain(normalizedRoomGenre);

          // Verify confidence is high due to genre alignment
          expect(result.confidence).toBeGreaterThan(0.6);

          // Verify reasoning mentions the genre alignment
          expect(result.reasoning.toLowerCase()).toContain(roomGenre.toLowerCase());
        }
      ),
      { numRuns: 30, timeout: 6000 }
    );
  }, 10000);

  /**
   * Property Test: Fallback Response Quality
   * All fallback responses should maintain quality standards
   */
  it('should maintain response quality across all fallback scenarios', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.option(
          fc.array(
            fc.constantFrom('drama', 'comedia', 'acción', 'thriller', 'romance', 'animación'),
            { minLength: 0, maxLength: 3 }
          ),
          { nil: undefined }
        ),
        fc.boolean(), // Whether TMDB should fail
        async (userText: string, roomGenres: string[] | undefined, tmdbShouldFail: boolean) => {
          // Always mock AI failure to test fallback
          mockFetch.mockRejectedValueOnce(new Error('AI service unavailable'));

          if (tmdbShouldFail) {
            // Mock TMDB failure
            mockPreCacheMovies.mockRejectedValueOnce(new Error('TMDB service unavailable'));
          } else {
            // Mock successful TMDB response
            const mockMovies = [
              {
                tmdbId: 1,
                title: 'Fallback Movie',
                posterPath: 'https://image.tmdb.org/t/p/w500/fallback.jpg',
                overview: 'A reliable fallback movie',
                genres: roomGenres && roomGenres.length > 0 ? [roomGenres[0]] : ['drama'],
                year: 2023,
                rating: 7.5,
                cachedAt: new Date().toISOString(),
                ttl: Date.now() + 86400000,
              },
            ];
            mockPreCacheMovies.mockResolvedValueOnce(mockMovies);
          }

          const event = createMockEvent('getChatRecommendations', {
            text: userText,
            roomGenres,
          });

          const result = await handler(event, mockContext, jest.fn());

          // Verify consistent response structure
          expect(typeof result.chatResponse).toBe('string');
          expect(result.chatResponse.length).toBeGreaterThan(0);
          
          expect(Array.isArray(result.recommendedGenres)).toBe(true);
          expect(result.recommendedGenres.length).toBeGreaterThan(0);
          expect(result.recommendedGenres.length).toBeLessThanOrEqual(3);
          
          expect(typeof result.confidence).toBe('number');
          expect(result.confidence).toBeGreaterThan(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
          
          expect(typeof result.reasoning).toBe('string');
          expect(result.reasoning.length).toBeGreaterThan(0);

          // Verify response quality indicators
          expect(result.chatResponse).not.toContain('undefined');
          expect(result.chatResponse).not.toContain('null');
          expect(result.reasoning).not.toContain('undefined');
          expect(result.reasoning).not.toContain('null');

          // All recommended genres should be valid
          const validGenres = [
            'acción', 'aventura', 'animación', 'comedia', 'crimen', 'documental',
            'drama', 'familia', 'fantasía', 'historia', 'terror', 'música',
            'misterio', 'romance', 'ciencia ficción', 'thriller', 'guerra', 'western'
          ];

          result.recommendedGenres.forEach((genre: string) => {
            expect(validGenres).toContain(genre);
          });
        }
      ),
      { numRuns: 75, timeout: 8000 }
    );
  }, 12000);
});
