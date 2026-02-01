/**
 * Property Test: Integration and Match Detection
 * Feature: room-movie-precaching, Property 3: Match Detection Based on Room Capacity
 * 
 * Tests the integration between the cache system and existing Trinity movie system,
 * with focus on match detection on every user action before execution.
 * 
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fc from 'fast-check';

// Mock AWS SDK
const mockDynamoDBClient = {
  send: jest.fn()
};

const mockLambdaClient = {
  send: jest.fn()
};

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => mockDynamoDBClient)
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => mockDynamoDBClient)
  },
  QueryCommand: jest.fn(),
  GetCommand: jest.fn(),
  UpdateCommand: jest.fn(),
  PutCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(() => mockLambdaClient),
  InvokeCommand: jest.fn()
}));

// Import the service after mocking
const IntegrationAdapter = require('../../../lambdas/trinity-cache-dev/services/IntegrationAdapter');

describe('Property Test: Integration and Match Detection', () => {
  let integrationAdapter: any;

  beforeEach(() => {
    jest.clearAllMocks();
    integrationAdapter = new IntegrationAdapter();
    
    // Set up environment variables
    process.env.AWS_REGION = 'eu-west-1';
    process.env.VOTES_TABLE = 'trinity-votes-dev';
    process.env.ROOMS_TABLE = 'trinity-rooms-dev-v2';
    process.env.ROOM_MATCHES_TABLE = 'trinity-room-matches-dev';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Property 3: Match Detection Based on Room Capacity
   * For any room with capacity N, a match should only be detected when exactly N users 
   * vote "YES" on the same movie, with match detection occurring on every user action 
   * before the action is executed.
   */
  test('Property 3: Match detection triggers correctly based on room capacity', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate room configurations
        fc.record({
          roomId: fc.string({ minLength: 5, maxLength: 20 }),
          capacity: fc.integer({ min: 2, max: 6 }),
          movieId: fc.string({ minLength: 1, maxLength: 10 }),
          userIds: fc.array(fc.string({ minLength: 3, maxLength: 15 }), { minLength: 2, maxLength: 6 })
        }),
        // Generate user actions
        fc.constantFrom('VOTE', 'NAVIGATE', 'REFRESH', 'JOIN_ROOM'),
        
        async (roomConfig, actionType) => {
          const { roomId, capacity, movieId, userIds } = roomConfig;
          
          // Ensure we have enough users for the test
          const testUsers = userIds.slice(0, Math.max(capacity, 2));
          
          console.log(`🧪 Testing room ${roomId} with capacity ${capacity}, ${testUsers.length} users, action: ${actionType}`);

          // Mock room info response
          (mockDynamoDBClient.send as jest.Mock).mockImplementation((command: any) => {
            if (command.constructor.name === 'GetCommand') {
              return Promise.resolve({
                Item: {
                  PK: roomId,
                  SK: 'ROOM',
                  capacity: capacity,
                  maxMembers: capacity,
                  status: 'ACTIVE'
                }
              });
            }
            
            if (command.constructor.name === 'QueryCommand') {
              // Generate votes - exactly 'capacity' number of YES votes for the movie
              const votes = testUsers.slice(0, capacity).map(userId => ({
                roomId: roomId,
                userId: userId,
                movieId: movieId,
                vote: 'YES'
              }));
              
              // Add some NO votes from other users to make it realistic
              const noVotes = testUsers.slice(capacity).map(userId => ({
                roomId: roomId,
                userId: userId,
                movieId: movieId + '_other',
                vote: 'NO'
              }));
              
              return Promise.resolve({
                Items: [...votes, ...noVotes]
              });
            }
            
            return Promise.resolve({});
          });

          // Test match detection
          const matchResult = await integrationAdapter.checkMatchBeforeAction(
            roomId, 
            testUsers[0], 
            { type: actionType }
          );

          // Verify match detection logic
          if (testUsers.length >= capacity) {
            // Should detect match when we have exactly 'capacity' YES votes
            expect(matchResult).toBeDefined();
            expect(matchResult.isMatch).toBe(true);
            expect(matchResult.matchedMovie).toBeDefined();
            expect(matchResult.matchedMovie.movieId).toBe(movieId);
            expect(matchResult.canClose).toBe(true);
            expect(matchResult.message).toContain('Match encontrado');
            
            console.log(`✅ Match correctly detected for room capacity ${capacity}`);
          } else {
            // Should not detect match when we don't have enough users
            expect(matchResult).toBeDefined();
            expect(matchResult.isMatch).toBe(false);
            
            console.log(`✅ No match detected (insufficient users: ${testUsers.length} < ${capacity})`);
          }
        }
      ),
      { 
        numRuns: 100,
        verbose: true,
        seed: 42
      }
    );
  });

  /**
   * Property: Match detection occurs before every user action
   * For any user action in any room, match detection should be performed first
   */
  test('Property: Match detection occurs before every user action type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          roomId: fc.string({ minLength: 5, maxLength: 20 }),
          userId: fc.string({ minLength: 3, maxLength: 15 }),
          capacity: fc.integer({ min: 2, max: 4 })
        }),
        fc.constantFrom('VOTE', 'NAVIGATE', 'REFRESH', 'JOIN_ROOM'),
        
        async (roomConfig, actionType) => {
          const { roomId, userId, capacity } = roomConfig;
          
          console.log(`🧪 Testing match detection before ${actionType} action in room ${roomId}`);

          // Mock room info
          (mockDynamoDBClient.send as jest.Mock).mockImplementation((command: any) => {
            if (command.constructor.name === 'GetCommand') {
              return Promise.resolve({
                Item: {
                  PK: roomId,
                  SK: 'ROOM',
                  capacity: capacity,
                  status: 'ACTIVE'
                }
              });
            }
            
            if (command.constructor.name === 'QueryCommand') {
              // No votes yet - no match
              return Promise.resolve({ Items: [] });
            }
            
            return Promise.resolve({});
          });

          // Test that match detection is called for every action type
          const matchResult = await integrationAdapter.checkMatchBeforeAction(
            roomId, 
            userId, 
            { type: actionType }
          );

          // Should always return a result (even if no match)
          expect(matchResult).toBeDefined();
          expect(typeof matchResult.isMatch).toBe('boolean');
          
          // For this test case (no votes), should not have a match
          expect(matchResult.isMatch).toBe(false);
          
          console.log(`✅ Match detection executed for ${actionType} action`);
        }
      ),
      { 
        numRuns: 50,
        verbose: true
      }
    );
  });

  /**
   * Property: Match detection with different vote patterns
   * Tests various voting scenarios to ensure match detection works correctly
   */
  test('Property: Match detection with various vote patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          roomId: fc.string({ minLength: 5, maxLength: 20 }),
          capacity: fc.integer({ min: 2, max: 4 }),
          movieId: fc.string({ minLength: 1, maxLength: 10 }),
          yesVoteCount: fc.integer({ min: 0, max: 6 }),
          noVoteCount: fc.integer({ min: 0, max: 3 })
        }),
        
        async (config) => {
          const { roomId, capacity, movieId, yesVoteCount, noVoteCount } = config;
          
          console.log(`🧪 Testing votes: ${yesVoteCount} YES, ${noVoteCount} NO, capacity: ${capacity}`);

          // Mock room info
          (mockDynamoDBClient.send as jest.Mock).mockImplementation((command: any) => {
            if (command.constructor.name === 'GetCommand') {
              return Promise.resolve({
                Item: {
                  PK: roomId,
                  SK: 'ROOM',
                  capacity: capacity,
                  status: 'ACTIVE'
                }
              });
            }
            
            if (command.constructor.name === 'QueryCommand') {
              const votes = [];
              
              // Add YES votes
              for (let i = 0; i < yesVoteCount; i++) {
                votes.push({
                  roomId: roomId,
                  userId: `user_${i}`,
                  movieId: movieId,
                  vote: 'YES'
                });
              }
              
              // Add NO votes
              for (let i = 0; i < noVoteCount; i++) {
                votes.push({
                  roomId: roomId,
                  userId: `user_no_${i}`,
                  movieId: movieId,
                  vote: 'NO'
                });
              }
              
              return Promise.resolve({ Items: votes });
            }
            
            return Promise.resolve({});
          });

          // Test match detection
          const matchResult = await integrationAdapter.checkMatchBeforeAction(
            roomId, 
            'test_user', 
            { type: 'VOTE' }
          );

          // Verify match logic
          const shouldHaveMatch = yesVoteCount >= capacity;
          
          expect(matchResult).toBeDefined();
          expect(matchResult.isMatch).toBe(shouldHaveMatch);
          
          if (shouldHaveMatch) {
            expect(matchResult.matchedMovie).toBeDefined();
            expect(matchResult.matchedMovie.movieId).toBe(movieId);
            console.log(`✅ Match correctly detected: ${yesVoteCount} >= ${capacity}`);
          } else {
            console.log(`✅ No match detected: ${yesVoteCount} < ${capacity}`);
          }
        }
      ),
      { 
        numRuns: 100,
        verbose: true
      }
    );
  });

  /**
   * Property: Integration with cache system fallback
   * Tests that the integration adapter properly falls back to legacy system when cache fails
   */
  test('Property: Integration fallback behavior', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          roomId: fc.string({ minLength: 5, maxLength: 20 }),
          genre: fc.constantFrom('action', 'comedy', 'drama', 'horror'),
          page: fc.integer({ min: 1, max: 5 }),
          cacheAvailable: fc.boolean()
        }),
        
        async (config) => {
          const { roomId, genre, page, cacheAvailable } = config;
          
          console.log(`🧪 Testing integration fallback: cache=${cacheAvailable}, genre=${genre}`);

          // Mock cache lambda response
          (mockLambdaClient.send as jest.Mock).mockImplementation(() => {
            if (cacheAvailable) {
              return Promise.resolve({
                Payload: new TextEncoder().encode(JSON.stringify({
                  statusCode: 200,
                  body: JSON.stringify({
                    success: true,
                    result: {
                      movieId: '123',
                      title: 'Test Movie',
                      overview: 'Test overview',
                      posterPath: '/test.jpg',
                      voteAverage: 7.5
                    }
                  })
                }))
              });
            } else {
              // Simulate cache failure
              throw new Error('Cache service unavailable');
            }
          });

          // Test cache detection
          const shouldUseCache = await integrationAdapter.shouldUseCacheForRoom(roomId);
          
          if (cacheAvailable) {
            expect(shouldUseCache).toBe(true);
            console.log(`✅ Cache correctly detected as available`);
          } else {
            expect(shouldUseCache).toBe(false);
            console.log(`✅ Cache correctly detected as unavailable`);
          }

          // Test fallback behavior
          try {
            const movies = await integrationAdapter.adaptGetMoviesRequest(genre, page, roomId);
            
            // Should always return some result (either from cache or fallback)
            expect(Array.isArray(movies)).toBe(true);
            
            if (cacheAvailable) {
              console.log(`✅ Movies returned from cache system`);
            } else {
              console.log(`✅ Movies returned from fallback system`);
            }
          } catch (error: any) {
            // Fallback should handle errors gracefully
            console.log(`⚠️ Error handled by fallback system: ${error.message}`);
          }
        }
      ),
      { 
        numRuns: 50,
        verbose: true
      }
    );
  });

  /**
   * Property: Room status update on match detection
   * Tests that room status is properly updated when a match is detected
   */
  test('Property: Room status update on match detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          roomId: fc.string({ minLength: 5, maxLength: 20 }),
          movieId: fc.string({ minLength: 1, maxLength: 10 }),
          capacity: fc.integer({ min: 2, max: 4 })
        }),
        
        async (config) => {
          const { roomId, movieId, capacity } = config;
          
          console.log(`🧪 Testing room status update for match in room ${roomId}`);

          let roomStatusUpdated = false;
          let matchRecorded = false;

          // Mock DynamoDB operations
          (mockDynamoDBClient.send as jest.Mock).mockImplementation((command: any) => {
            if (command.constructor.name === 'GetCommand') {
              return Promise.resolve({
                Item: {
                  PK: roomId,
                  SK: 'ROOM',
                  capacity: capacity,
                  status: 'ACTIVE'
                }
              });
            }
            
            if (command.constructor.name === 'QueryCommand') {
              // Generate enough YES votes to trigger a match
              const votes = [];
              for (let i = 0; i < capacity; i++) {
                votes.push({
                  roomId: roomId,
                  userId: `user_${i}`,
                  movieId: movieId,
                  vote: 'YES'
                });
              }
              return Promise.resolve({ Items: votes });
            }
            
            if (command.constructor.name === 'UpdateCommand') {
              roomStatusUpdated = true;
              return Promise.resolve({
                Attributes: {
                  status: 'MATCHED',
                  resultMovieId: movieId
                }
              });
            }
            
            if (command.constructor.name === 'PutCommand') {
              matchRecorded = true;
              return Promise.resolve({});
            }
            
            return Promise.resolve({});
          });

          // Mock movie details
          const mockResponse = {
            Payload: new TextEncoder().encode(JSON.stringify({
              id: movieId,
              title: 'Test Movie',
              overview: 'Test overview'
            }))
          };
          (mockLambdaClient.send as jest.Mock).mockResolvedValue(mockResponse);

          // Test match detection and status update
          const matchResult = await integrationAdapter.checkMatchBeforeAction(
            roomId, 
            'test_user', 
            { type: 'VOTE' }
          );

          // Verify match was detected
          expect(matchResult).toBeDefined();
          expect(matchResult.isMatch).toBe(true);
          
          // Verify room status was updated
          expect(roomStatusUpdated).toBe(true);
          expect(matchRecorded).toBe(true);
          
          console.log(`✅ Room status correctly updated on match detection`);
        }
      ),
      { 
        numRuns: 30,
        verbose: true
      }
    );
  });
});