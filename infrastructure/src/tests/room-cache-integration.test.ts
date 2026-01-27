/**
 * Integration tests for Room Handler and Movie Cache Service
 * Tests the integration between room creation and movie pre-caching
 */

// Mock DynamoDB first
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

// Mock other dependencies
jest.mock('../utils/metrics', () => ({
  logBusinessMetric: jest.fn(),
  logError: jest.fn(),
  PerformanceTimer: jest.fn().mockImplementation(() => ({
    finish: jest.fn(),
  })),
}));

jest.mock('../services/deepLinkService', () => ({
  deepLinkService: {
    generateInviteLink: jest.fn(),
    validateInviteCode: jest.fn(),
    handleDeepLink: jest.fn(),
  },
}));

jest.mock('../services/movieCacheService', () => ({
  movieCacheService: {
    preCacheMovies: jest.fn(),
    validateGenres: jest.fn(),
    getCachedMovies: jest.fn(),
    refreshCache: jest.fn(),
    getAvailableGenres: jest.fn(),
    getCacheStats: jest.fn(),
  },
}));

import { handler } from '../handlers/room';
import { movieCacheService } from '../services/movieCacheService';
import { deepLinkService } from '../services/deepLinkService';

const mockMovieCacheService = movieCacheService as jest.Mocked<typeof movieCacheService>;
const mockDeepLinkService = deepLinkService as jest.Mocked<typeof deepLinkService>;

// Mock Lambda context
const mockContext = {
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

describe('Room Handler - Movie Cache Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup environment variables
    process.env.ROOMS_TABLE = 'test-rooms-table';
    process.env.ROOM_MEMBERS_TABLE = 'test-room-members-table';
    process.env.MOVIE_CACHE_TABLE = 'test-movie-cache-table';
    
    // Mock successful DynamoDB operations
    mockSend.mockResolvedValue({ Item: null });
    
    // Mock DeepLinkService
    mockDeepLinkService.generateInviteLink.mockResolvedValue({
      code: 'ABC123',
      url: 'https://trinity.app/room/ABC123',
      roomId: 'test-room-id',
      createdBy: 'test-host-id',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      isActive: true,
      usageCount: 0,
      maxUsage: undefined,
    });
    
    // Mock MovieCacheService
    mockMovieCacheService.validateGenres.mockReturnValue({
      valid: ['Action', 'Comedy'],
      invalid: [],
    });
    
    mockMovieCacheService.preCacheMovies.mockResolvedValue([
      {
        tmdbId: 550,
        title: 'Fight Club',
        posterPath: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        overview: 'A movie about fighting',
        genres: ['Action', 'Drama'],
        year: 1999,
        rating: 8.8,
        cachedAt: new Date().toISOString(),
        ttl: Date.now() + 24 * 60 * 60 * 1000,
      },
    ]);
  });

  describe('createRoom with genre preferences', () => {
    it('should create room and trigger movie pre-caching with genres', async () => {
      const event = {
        info: { fieldName: 'createRoom' },
        identity: { sub: 'test-host-id' },
        arguments: {
          input: {
            name: 'Action Comedy Room',
            description: 'A room for action and comedy movies',
            genrePreferences: ['Action', 'Comedy', 'InvalidGenre'],
            isPrivate: false,
            maxMembers: 10,
          },
        },
      };

      const result = await handler(event as any, mockContext as any, {} as any);

      // Verify room was created with correct properties
      expect(result).toMatchObject({
        name: 'Action Comedy Room',
        description: 'A room for action and comedy movies',
        hostId: 'test-host-id',
        genrePreferences: ['Action', 'Comedy'], // Invalid genre should be filtered out
        isPrivate: false,
        maxMembers: 10,
        inviteCode: 'ABC123',
        inviteUrl: 'https://trinity.app/room/ABC123',
      });

      // Verify genre validation was called
      expect(mockMovieCacheService.validateGenres).toHaveBeenCalledWith(['Action', 'Comedy', 'InvalidGenre']);

      // Verify movie pre-caching was triggered (async, so we need to wait a bit)
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockMovieCacheService.preCacheMovies).toHaveBeenCalledWith(
        expect.any(String), // roomId
        ['Action', 'Comedy']
      );

      // Verify room was stored in DynamoDB with genre preferences
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            TableName: 'test-rooms-table',
            Item: expect.objectContaining({
              genrePreferences: ['Action', 'Comedy'],
            }),
          }),
        })
      );
    });

    it('should create room without genre preferences when none provided', async () => {
      const event = {
        info: { fieldName: 'createRoom' },
        identity: { sub: 'test-host-id' },
        arguments: {
          input: {
            name: 'General Room',
            description: 'A room for all movies',
          },
        },
      };

      const result = await handler(event as any, mockContext as any, {} as any);

      // Verify room was created without genre preferences
      expect(result).toMatchObject({
        name: 'General Room',
        description: 'A room for all movies',
        hostId: 'test-host-id',
        genrePreferences: undefined,
      });

      // Verify genre validation was not called
      expect(mockMovieCacheService.validateGenres).not.toHaveBeenCalled();

      // Verify movie pre-caching was triggered without genres
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockMovieCacheService.preCacheMovies).toHaveBeenCalledWith(
        expect.any(String), // roomId
        undefined
      );
    });

    it('should handle all invalid genres gracefully', async () => {
      mockMovieCacheService.validateGenres.mockReturnValue({
        valid: [],
        invalid: ['InvalidGenre1', 'InvalidGenre2'],
      });

      const event = {
        info: { fieldName: 'createRoom' },
        identity: { sub: 'test-host-id' },
        arguments: {
          input: {
            name: 'Invalid Genres Room',
            genrePreferences: ['InvalidGenre1', 'InvalidGenre2'],
          },
        },
      };

      const result = await handler(event as any, mockContext as any, {} as any);

      // Verify room was created without genre preferences (all were invalid)
      expect(result).toMatchObject({
        name: 'Invalid Genres Room',
        genrePreferences: undefined,
      });

      // Verify movie pre-caching was triggered without genres
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockMovieCacheService.preCacheMovies).toHaveBeenCalledWith(
        expect.any(String), // roomId
        undefined
      );
    });

    it('should continue room creation even if movie caching fails', async () => {
      mockMovieCacheService.preCacheMovies.mockRejectedValue(new Error('Cache service unavailable'));
      
      // Mock validation to return only Action for this test
      mockMovieCacheService.validateGenres.mockReturnValueOnce({
        valid: ['Action'],
        invalid: [],
      });

      const event = {
        info: { fieldName: 'createRoom' },
        identity: { sub: 'test-host-id' },
        arguments: {
          input: {
            name: 'Resilient Room',
            genrePreferences: ['Action'],
          },
        },
      };

      // Should not throw error even if caching fails
      const result = await handler(event as any, mockContext as any, {} as any);

      expect(result).toMatchObject({
        name: 'Resilient Room',
        genrePreferences: ['Action'],
      });

      // Verify caching was attempted
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockMovieCacheService.preCacheMovies).toHaveBeenCalled();
    });
  });
});
