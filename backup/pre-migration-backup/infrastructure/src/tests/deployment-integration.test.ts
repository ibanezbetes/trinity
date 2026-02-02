/**
 * Integration tests for deployment validation
 * Tests end-to-end cache functionality after deployment
 * Validates table creation, Lambda permissions, and environment variables
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

describe('Deployment Integration Tests', () => {
  let dynamoClient: DynamoDBDocumentClient;
  let lambdaClient: LambdaClient;
  
  const testRoomId = `test-room-${Date.now()}`;
  const region = 'eu-west-1';

  beforeAll(() => {
    dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
    lambdaClient = new LambdaClient({ region });
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      await dynamoClient.send(new DeleteCommand({
        TableName: 'trinity-room-cache-metadata-dev',
        Key: { roomId: testRoomId }
      }));
    } catch (error) {
      console.log('Cleanup completed or no data to clean');
    }
  });

  describe('DynamoDB Tables Deployment', () => {
    test('should verify trinity-room-movie-cache-dev table exists and is accessible', async () => {
      const testItem = {
        roomId: testRoomId,
        sequenceIndex: 0,
        movieId: 'test-movie-123',
        title: 'Test Movie',
        overview: 'Test movie for deployment validation',
        posterPath: 'https://example.com/poster.jpg',
        releaseDate: '2024-01-01',
        voteAverage: 7.5,
        genreIds: [28, 12],
        batchNumber: 1,
        mediaType: 'MOVIE',
        addedAt: new Date().toISOString(),
        priority: 2,
        ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
        isActive: true
      };

      // Test write operation
      await expect(dynamoClient.send(new PutCommand({
        TableName: 'trinity-room-movie-cache-dev',
        Item: testItem
      }))).resolves.not.toThrow();

      // Test read operation
      const result = await dynamoClient.send(new GetCommand({
        TableName: 'trinity-room-movie-cache-dev',
        Key: { roomId: testRoomId, sequenceIndex: 0 }
      }));

      expect(result.Item).toBeDefined();
      expect(result.Item?.movieId).toBe('test-movie-123');
      expect(result.Item?.title).toBe('Test Movie');

      // Test query operation (BatchIndex)
      const queryResult = await dynamoClient.send(new QueryCommand({
        TableName: 'trinity-room-movie-cache-dev',
        IndexName: 'BatchIndex',
        KeyConditionExpression: 'roomId = :roomId AND batchNumber = :batchNumber',
        ExpressionAttributeValues: {
          ':roomId': testRoomId,
          ':batchNumber': 1
        }
      }));

      expect(queryResult.Items).toBeDefined();
      expect(queryResult.Items?.length).toBe(1);
    });

    test('should verify trinity-room-cache-metadata-dev table exists and is accessible', async () => {
      const testMetadata = {
        roomId: testRoomId,
        currentIndex: 0,
        totalMovies: 30,
        batchesLoaded: 1,
        filterCriteria: {
          mediaType: 'MOVIE',
          genreIds: [28, 12],
          roomId: testRoomId
        },
        lastBatchLoadedAt: new Date().toISOString(),
        nextBatchThreshold: 24,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'ACTIVE',
        ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
      };

      // Test write operation
      await expect(dynamoClient.send(new PutCommand({
        TableName: 'trinity-room-cache-metadata-dev',
        Item: testMetadata
      }))).resolves.not.toThrow();

      // Test read operation
      const result = await dynamoClient.send(new GetCommand({
        TableName: 'trinity-room-cache-metadata-dev',
        Key: { roomId: testRoomId }
      }));

      expect(result.Item).toBeDefined();
      expect(result.Item?.status).toBe('ACTIVE');
      expect(result.Item?.totalMovies).toBe(30);

      // Test query operation (StatusIndex)
      const queryResult = await dynamoClient.send(new QueryCommand({
        TableName: 'trinity-room-cache-metadata-dev',
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'ACTIVE'
        }
      }));

      expect(queryResult.Items).toBeDefined();
      expect(queryResult.Items?.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Lambda Functions Deployment', () => {
    test('should verify trinity-cache-dev lambda exists and has correct environment variables', async () => {
      const payload = {
        action: 'healthCheck',
        roomId: testRoomId
      };

      const command = new InvokeCommand({
        FunctionName: 'trinity-cache-dev',
        Payload: JSON.stringify(payload),
      });

      const response = await lambdaClient.send(command);
      expect(response.StatusCode).toBe(200);

      const result = JSON.parse(new TextDecoder().decode(response.Payload));
      expect(result).toBeDefined();
      
      // Verify environment variables are set
      expect(result.environment).toBeDefined();
      expect(result.environment.ROOM_MOVIE_CACHE_TABLE).toBe('trinity-room-movie-cache-dev');
      expect(result.environment.ROOM_CACHE_METADATA_TABLE).toBe('trinity-room-cache-metadata-dev');
      expect(result.environment.BATCH_SIZE).toBe('30');
      expect(result.environment.MAX_BATCHES).toBe('10');
      expect(result.environment.CACHE_TTL_DAYS).toBe('7');
    });

    test('should verify trinity-movie-dev lambda has cache integration', async () => {
      const payload = {
        action: 'checkCacheIntegration',
        roomId: testRoomId
      };

      const command = new InvokeCommand({
        FunctionName: 'trinity-movie-dev',
        Payload: JSON.stringify(payload),
      });

      const response = await lambdaClient.send(command);
      expect(response.StatusCode).toBe(200);

      const result = JSON.parse(new TextDecoder().decode(response.Payload));
      expect(result).toBeDefined();
      
      // Verify cache integration environment variables
      expect(result.environment).toBeDefined();
      expect(result.environment.ROOM_MOVIE_CACHE_TABLE).toBe('trinity-room-movie-cache-dev');
      expect(result.environment.ROOM_CACHE_METADATA_TABLE).toBe('trinity-room-cache-metadata-dev');
    });

    test('should verify trinity-room-dev lambda has cache trigger capability', async () => {
      const payload = {
        action: 'checkCacheTrigger',
        roomId: testRoomId
      };

      const command = new InvokeCommand({
        FunctionName: 'trinity-room-dev',
        Payload: JSON.stringify(payload),
      });

      const response = await lambdaClient.send(command);
      expect(response.StatusCode).toBe(200);

      const result = JSON.parse(new TextDecoder().decode(response.Payload));
      expect(result).toBeDefined();
      
      // Verify cache trigger environment variables
      expect(result.environment).toBeDefined();
      expect(result.environment.ROOM_MOVIE_CACHE_TABLE).toBe('trinity-room-movie-cache-dev');
      expect(result.environment.ROOM_CACHE_METADATA_TABLE).toBe('trinity-room-cache-metadata-dev');
    });
  });

  describe('End-to-End Cache Functionality', () => {
    test('should create room cache, retrieve movies, and cleanup', async () => {
      // Step 1: Create room cache via trinity-cache-dev
      const createCachePayload = {
        action: 'createRoomCache',
        roomId: testRoomId,
        filterCriteria: {
          mediaType: 'MOVIE',
          genreIds: [28, 12], // Action, Adventure
          roomId: testRoomId
        }
      };

      const createCommand = new InvokeCommand({
        FunctionName: 'trinity-cache-dev',
        Payload: JSON.stringify(createCachePayload),
      });

      const createResponse = await lambdaClient.send(createCommand);
      expect(createResponse.StatusCode).toBe(200);

      const createResult = JSON.parse(new TextDecoder().decode(createResponse.Payload));
      expect(createResult.success).toBe(true);
      expect(createResult.initialBatchSize).toBeGreaterThan(0);

      // Step 2: Retrieve movies via trinity-movie-dev (cache integration)
      const getMoviesPayload = {
        action: 'getMovies',
        roomId: testRoomId,
        genre: 'action',
        page: 1
      };

      const getMoviesCommand = new InvokeCommand({
        FunctionName: 'trinity-movie-dev',
        Payload: JSON.stringify(getMoviesPayload),
      });

      const getMoviesResponse = await lambdaClient.send(getMoviesCommand);
      expect(getMoviesResponse.StatusCode).toBe(200);

      const moviesResult = JSON.parse(new TextDecoder().decode(getMoviesResponse.Payload));
      expect(moviesResult.movies).toBeDefined();
      expect(moviesResult.movies.length).toBeGreaterThan(0);
      expect(moviesResult.fromCache).toBe(true);

      // Step 3: Verify sequence consistency
      const getNextMoviePayload = {
        action: 'getNextMovie',
        roomId: testRoomId
      };

      const getNextCommand = new InvokeCommand({
        FunctionName: 'trinity-cache-dev',
        Payload: JSON.stringify(getNextMoviePayload),
      });

      const nextMovieResponse = await lambdaClient.send(getNextCommand);
      expect(nextMovieResponse.StatusCode).toBe(200);

      const nextMovieResult = JSON.parse(new TextDecoder().decode(nextMovieResponse.Payload));
      expect(nextMovieResult.movie).toBeDefined();
      expect(nextMovieResult.movie.sequenceIndex).toBe(0);

      // Step 4: Cleanup cache
      const cleanupPayload = {
        action: 'cleanupRoomCache',
        roomId: testRoomId
      };

      const cleanupCommand = new InvokeCommand({
        FunctionName: 'trinity-cache-dev',
        Payload: JSON.stringify(cleanupPayload),
      });

      const cleanupResponse = await lambdaClient.send(cleanupCommand);
      expect(cleanupResponse.StatusCode).toBe(200);

      const cleanupResult = JSON.parse(new TextDecoder().decode(cleanupResponse.Payload));
      expect(cleanupResult.success).toBe(true);
    }, 30000); // 30 second timeout for E2E test
  });

  describe('Performance and Reliability Validation', () => {
    test('should verify cache response times meet 200ms requirement', async () => {
      // Create test cache first
      await dynamoClient.send(new PutCommand({
        TableName: 'trinity-room-cache-metadata-dev',
        Item: {
          roomId: testRoomId,
          currentIndex: 0,
          totalMovies: 30,
          batchesLoaded: 1,
          status: 'ACTIVE',
          ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
        }
      }));

      // Add test movie to cache
      await dynamoClient.send(new PutCommand({
        TableName: 'trinity-room-movie-cache-dev',
        Item: {
          roomId: testRoomId,
          sequenceIndex: 0,
          movieId: 'perf-test-movie',
          title: 'Performance Test Movie',
          overview: 'Movie for performance testing',
          posterPath: 'https://example.com/poster.jpg',
          releaseDate: '2024-01-01',
          voteAverage: 8.0,
          genreIds: [28],
          batchNumber: 1,
          mediaType: 'MOVIE',
          addedAt: new Date().toISOString(),
          priority: 1,
          ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
          isActive: true
        }
      }));

      // Test response time
      const startTime = Date.now();
      
      const payload = {
        action: 'getNextMovie',
        roomId: testRoomId
      };

      const command = new InvokeCommand({
        FunctionName: 'trinity-cache-dev',
        Payload: JSON.stringify(payload),
      });

      const response = await lambdaClient.send(command);
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.StatusCode).toBe(200);
      expect(responseTime).toBeLessThan(200); // 200ms requirement

      const result = JSON.parse(new TextDecoder().decode(response.Payload));
      expect(result.movie).toBeDefined();
      expect(result.movie.movieId).toBe('perf-test-movie');
    });

    test('should verify error handling and fallback behavior', async () => {
      const nonExistentRoomId = `non-existent-${Date.now()}`;
      
      const payload = {
        action: 'getNextMovie',
        roomId: nonExistentRoomId
      };

      const command = new InvokeCommand({
        FunctionName: 'trinity-cache-dev',
        Payload: JSON.stringify(payload),
      });

      const response = await lambdaClient.send(command);
      expect(response.StatusCode).toBe(200);

      const result = JSON.parse(new TextDecoder().decode(response.Payload));
      expect(result.movie).toBeNull(); // Should return null for non-existent room
      expect(result.error).toBeUndefined(); // Should not throw error
    });
  });
});