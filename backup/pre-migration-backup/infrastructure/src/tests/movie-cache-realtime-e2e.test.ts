/**
 * End-to-End Integration Tests for Movie Caching and Real-time Updates
 * Feature: trinity-voting-fixes, Task 11.3
 * 
 * Tests movie caching system integration with real-time vote updates
 */

// Mock dependencies first
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
  BatchGetCommand: jest.fn((params) => ({ params })),
}));

const mockPublish = jest.fn();
jest.mock('@aws-sdk/client-appsync', () => ({
  AppSyncClient: jest.fn(() => ({
    send: mockPublish,
  })),
  PostToConnectionCommand: jest.fn((params) => ({ params })),
}));

jest.mock('../utils/metrics', () => ({
  logBusinessMetric: jest.fn(),
  logError: jest.fn(),
  PerformanceTimer: jest.fn().mockImplementation(() => ({
    finish: jest.fn(),
  })),
}));

// Mock node-fetch for TMDB API calls
const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

import { handler as roomHandler } from '../handlers/room';
import { handler as voteHandler } from '../handlers/vote';
import { movieCacheService } from '../services/movieCacheService';
import { publishVoteUpdateEvent, publishMatchFoundEvent } from '../utils/appsync-publisher';

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

describe('Movie Caching and Real-time Updates - End-to-End Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup environment variables
    process.env.ROOMS_TABLE = 'test-rooms-table';
    process.env.ROOM_MEMBERS_TABLE = 'test-room-members-table';
    process.env.MOVIE_CACHE_TABLE = 'test-movie-cache-table';
    process.env.VOTES_TABLE = 'test-votes-table';
    process.env.TMDB_API_KEY = 'test-api-key';
    process.env.APPSYNC_ENDPOINT = 'https://test.appsync-api.us-east-1.amazonaws.com/graphql';
    
    // Mock successful DynamoDB operations
    mockSend.mockResolvedValue({ Item: null });
    
    // Mock successful AppSync publishing
    mockPublish.mockResolvedValue({});
    
    // Mock TMDB API responses
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [
          {
            id: 550,
            title: 'Fight Club',
            poster_path: '/poster1.jpg',
            overview: 'A movie about fighting',
            genre_ids: [28, 18], // Action, Drama
            release_date: '1999-10-15',
            vote_average: 8.8,
          },
          {
            id: 551,
            title: 'The Matrix',
            poster_path: '/poster2.jpg',
            overview: 'A movie about reality',
            genre_ids: [28, 878], // Action, Sci-Fi
            release_date: '1999-03-31',
            vote_average: 8.7,
          },
        ],
        total_results: 2,
      }),
    });
  });

  describe('Complete Movie Caching Flow with Real-time Updates', () => {
    it('should create room, cache movies, and handle real-time voting updates', async () => {
      const roomId = 'test-room-cache-rt';
      const hostId = 'test-host-id';
      const userId1 = 'test-user-1';
      const userId2 = 'test-user-2';

      // Mock room creation with movie caching
      mockSend
        .mockResolvedValueOnce({ Item: null }) // Check room doesn't exist
        .mockResolvedValueOnce({}) // Create room
        .mockResolvedValueOnce({}) // Create room member
        .mockResolvedValueOnce({}) // Create invite link
        .mockResolvedValueOnce({ Item: null }) // Check cache doesn't exist
        .mockResolvedValueOnce({}) // Store cached movies
        .mockResolvedValueOnce({ // Get room for voting
          Item: {
            PK: roomId,
            SK: 'ROOM',
            roomId: roomId,
            name: 'Cache RT Test Room',
            hostId: hostId,
            status: 'ACTIVE',
            memberCount: 3,
            genrePreferences: ['Action'],
            createdAt: new Date().toISOString(),
          }
        })
        .mockResolvedValueOnce({ // Get cached movies
          Item: {
            cacheKey: roomId,
            movies: [
              {
                tmdbId: 550,
                title: 'Fight Club',
                posterPath: 'https://image.tmdb.org/t/p/w500/poster1.jpg',
                overview: 'A movie about fighting',
                genres: ['Action', 'Drama'],
                year: 1999,
                rating: 8.8,
                cachedAt: new Date().toISOString(),
                ttl: Date.now() + 24 * 60 * 60 * 1000,
              },
            ],
            genreFilters: ['Action'],
            cachedAt: new Date().toISOString(),
            ttl: Date.now() + 24 * 60 * 60 * 1000,
          }
        })
        .mockResolvedValueOnce({ Item: null }) // Check vote doesn't exist
        .mockResolvedValueOnce({}) // Create vote
        .mockResolvedValueOnce({}) // Create user vote tracking
        .mockResolvedValueOnce({ // Get updated vote count
          Item: {
            roomId: roomId,
            movieId: '550',
            votes: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        })
        .mockResolvedValueOnce({ // Get room members for real-time update
          Items: [
            { PK: hostId, SK: roomId, userId: hostId, roomId: roomId },
            { PK: userId1, SK: roomId, userId: userId1, roomId: roomId },
            { PK: userId2, SK: roomId, userId: userId2, roomId: roomId },
          ]
        });

      // Step 1: Create room with genre preferences (triggers movie caching)
      const createRoomEvent = {
        info: { fieldName: 'createRoom' },
        identity: { sub: hostId },
        arguments: {
          input: {
            name: 'Cache RT Test Room',
            description: 'Testing caching with real-time updates',
            genrePreferences: ['Action'],
            isPrivate: false,
            maxMembers: 10,
          },
        },
      };

      const roomResult = await roomHandler(createRoomEvent as any, mockContext as any, {} as any);

      // Verify room was created with genre preferences
      expect(roomResult).toMatchObject({
        name: 'Cache RT Test Room',
        hostId: hostId,
        genrePreferences: ['Action'],
      });

      // Verify movie caching was triggered (async operation)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Step 2: Submit vote and verify real-time updates
      const voteEvent = {
        info: { fieldName: 'submitVote' },
        identity: { sub: userId1 },
        arguments: {
          roomId: roomId,
          movieId: '550',
          voteType: 'LIKE',
        },
      };

      const voteResult = await voteHandler(voteEvent as any, mockContext as any, {} as any);

      // Verify vote was processed successfully
      expect(voteResult).toMatchObject({
        success: true,
        currentVotes: 1,
        totalMembers: 3,
        matchFound: false,
        roomStatus: 'ACTIVE',
      });

      // Verify real-time update was published
      expect(mockPublish).toHaveBeenCalled();
      
      // Check AppSync publish call for vote update
      const publishCalls = mockPublish.mock.calls;
      expect(publishCalls.length).toBeGreaterThan(0);
      
      const voteUpdateCall = publishCalls.find(call => 
        call[0].params && call[0].params.query && call[0].params.query.includes('VoteUpdate')
      );
      expect(voteUpdateCall).toBeDefined();
    });

    it('should handle cache miss and fallback to TMDB API during voting', async () => {
      const roomId = 'test-room-cache-miss';
      const userId = 'test-user-cache-miss';

      // Mock cache miss scenario
      mockSend
        .mockResolvedValueOnce({ // Get room
          Item: {
            PK: roomId,
            SK: 'ROOM',
            roomId: roomId,
            name: 'Cache Miss Room',
            hostId: 'test-host-id',
            status: 'ACTIVE',
            memberCount: 2,
            genrePreferences: ['Comedy'],
            createdAt: new Date().toISOString(),
          }
        })
        .mockResolvedValueOnce({ Item: null }) // Cache miss
        .mockResolvedValueOnce({}) // Store new cached movies from TMDB
        .mockResolvedValueOnce({ Item: null }) // Check vote doesn't exist
        .mockResolvedValueOnce({}) // Create vote
        .mockResolvedValueOnce({}) // Create user vote tracking
        .mockResolvedValueOnce({ // Get updated vote count
          Item: {
            roomId: roomId,
            movieId: '551',
            votes: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        })
        .mockResolvedValueOnce({ // Get room members
          Items: [
            { PK: 'test-host-id', SK: roomId, userId: 'test-host-id', roomId: roomId },
            { PK: userId, SK: roomId, userId: userId, roomId: roomId },
          ]
        });

      // Mock TMDB API call for cache refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            {
              id: 551,
              title: 'The Hangover',
              poster_path: '/poster3.jpg',
              overview: 'A comedy about a bachelor party',
              genre_ids: [35], // Comedy
              release_date: '2009-06-05',
              vote_average: 7.7,
            },
          ],
          total_results: 1,
        }),
      });

      const voteEvent = {
        info: { fieldName: 'submitVote' },
        identity: { sub: userId },
        arguments: {
          roomId: roomId,
          movieId: '551',
          voteType: 'LIKE',
        },
      };

      const voteResult = await voteHandler(voteEvent as any, mockContext as any, {} as any);

      // Verify vote was processed despite cache miss
      expect(voteResult.success).toBe(true);
      expect(voteResult.currentVotes).toBe(1);

      // Verify TMDB API was called for cache refresh
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.themoviedb.org'),
        expect.any(Object)
      );

      // Verify cache was updated with new movies
      const cachePutCalls = mockSend.mock.calls.filter(call => 
        call[0].params && call[0].params.TableName === 'test-movie-cache-table'
      );
      expect(cachePutCalls.length).toBeGreaterThan(0);
    });

    it('should handle circuit breaker activation during TMDB API failures', async () => {
      const roomId = 'test-room-circuit-breaker';
      const userId = 'test-user-cb';

      // Mock TMDB API failure
      mockFetch.mockRejectedValue(new Error('TMDB API unavailable'));

      // Mock fallback to cached content
      mockSend
        .mockResolvedValueOnce({ // Get room
          Item: {
            PK: roomId,
            SK: 'ROOM',
            roomId: roomId,
            name: 'Circuit Breaker Room',
            hostId: 'test-host-id',
            status: 'ACTIVE',
            memberCount: 2,
            genrePreferences: ['Action'],
            createdAt: new Date().toISOString(),
          }
        })
        .mockResolvedValueOnce({ // Get cached movies (fallback)
          Item: {
            cacheKey: `${roomId}_fallback`,
            movies: [
              {
                tmdbId: 999,
                title: 'Fallback Movie',
                posterPath: 'https://image.tmdb.org/t/p/w500/fallback.jpg',
                overview: 'A fallback movie when API fails',
                genres: ['Action'],
                year: 2020,
                rating: 7.0,
                cachedAt: new Date().toISOString(),
                ttl: Date.now() + 24 * 60 * 60 * 1000,
              },
            ],
            genreFilters: ['Action'],
            cachedAt: new Date().toISOString(),
            ttl: Date.now() + 24 * 60 * 60 * 1000,
          }
        })
        .mockResolvedValueOnce({ Item: null }) // Check vote doesn't exist
        .mockResolvedValueOnce({}) // Create vote
        .mockResolvedValueOnce({}) // Create user vote tracking
        .mockResolvedValueOnce({ // Get updated vote count
          Item: {
            roomId: roomId,
            movieId: '999',
            votes: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        })
        .mockResolvedValueOnce({ // Get room members
          Items: [
            { PK: 'test-host-id', SK: roomId, userId: 'test-host-id', roomId: roomId },
            { PK: userId, SK: roomId, userId: userId, roomId: roomId },
          ]
        });

      const voteEvent = {
        info: { fieldName: 'submitVote' },
        identity: { sub: userId },
        arguments: {
          roomId: roomId,
          movieId: '999',
          voteType: 'LIKE',
        },
      };

      const voteResult = await voteHandler(voteEvent as any, mockContext as any, {} as any);

      // Verify vote was processed using fallback content
      expect(voteResult.success).toBe(true);
      expect(voteResult.currentVotes).toBe(1);

      // Verify TMDB API was attempted but failed
      expect(mockFetch).toHaveBeenCalled();

      // Verify fallback cache was used
      const cacheGetCalls = mockSend.mock.calls.filter(call => 
        call[0].params && call[0].params.Key && call[0].params.Key.cacheKey
      );
      expect(cacheGetCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Real-time Vote Broadcasting with Movie Information', () => {
    it('should broadcast detailed vote updates with movie information', async () => {
      const roomId = 'test-room-broadcast';
      const movieId = '550';
      const userId = 'test-user-broadcast';

      // Mock successful vote processing with movie details
      mockSend
        .mockResolvedValueOnce({ // Get room
          Item: {
            PK: roomId,
            SK: 'ROOM',
            roomId: roomId,
            name: 'Broadcast Test Room',
            hostId: 'test-host-id',
            status: 'ACTIVE',
            memberCount: 3,
            createdAt: new Date().toISOString(),
          }
        })
        .mockResolvedValueOnce({ // Get cached movies for movie details
          Item: {
            cacheKey: roomId,
            movies: [
              {
                tmdbId: 550,
                title: 'Fight Club',
                posterPath: 'https://image.tmdb.org/t/p/w500/poster1.jpg',
                overview: 'A movie about fighting',
                genres: ['Action', 'Drama'],
                year: 1999,
                rating: 8.8,
                cachedAt: new Date().toISOString(),
                ttl: Date.now() + 24 * 60 * 60 * 1000,
              },
            ],
            genreFilters: [],
            cachedAt: new Date().toISOString(),
            ttl: Date.now() + 24 * 60 * 60 * 1000,
          }
        })
        .mockResolvedValueOnce({ Item: null }) // Check vote doesn't exist
        .mockResolvedValueOnce({}) // Create vote
        .mockResolvedValueOnce({}) // Create user vote tracking
        .mockResolvedValueOnce({ // Get updated vote count
          Item: {
            roomId: roomId,
            movieId: movieId,
            votes: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        })
        .mockResolvedValueOnce({ // Get room members for broadcasting
          Items: [
            { 
              PK: 'test-host-id', 
              SK: roomId, 
              userId: 'test-host-id', 
              roomId: roomId,
              displayName: 'Host User',
              joinedAt: new Date().toISOString(),
            },
            { 
              PK: userId, 
              SK: roomId, 
              userId: userId, 
              roomId: roomId,
              displayName: 'Test User',
              joinedAt: new Date().toISOString(),
            },
            { 
              PK: 'test-user-3', 
              SK: roomId, 
              userId: 'test-user-3', 
              roomId: roomId,
              displayName: 'User Three',
              joinedAt: new Date().toISOString(),
            },
          ]
        });

      const voteEvent = {
        info: { fieldName: 'submitVote' },
        identity: { sub: userId },
        arguments: {
          roomId: roomId,
          movieId: movieId,
          voteType: 'LIKE',
        },
      };

      const voteResult = await voteHandler(voteEvent as any, mockContext as any, {} as any);

      expect(voteResult.success).toBe(true);

      // Verify detailed real-time broadcast was sent
      expect(mockPublish).toHaveBeenCalled();
      
      const publishCalls = mockPublish.mock.calls;
      const voteUpdateCall = publishCalls.find(call => 
        call[0].params && call[0].params.variables && call[0].params.variables.roomId === roomId
      );
      
      expect(voteUpdateCall).toBeDefined();
      
      if (voteUpdateCall) {
        const variables = voteUpdateCall[0].params.variables;
        
        // Verify vote progress information
        expect(variables.voteProgress).toMatchObject({
          currentVotes: 1,
          totalMembers: 3,
          votingUsers: expect.arrayContaining([userId]),
          pendingUsers: expect.arrayContaining(['test-host-id', 'test-user-3']),
        });

        // Verify movie information is included
        expect(variables.movieInfo).toMatchObject({
          tmdbId: 550,
          title: 'Fight Club',
          genres: ['Action', 'Drama'],
          year: 1999,
          rating: 8.8,
        });
      }
    });

    it('should broadcast match found notifications with participant details', async () => {
      const roomId = 'test-room-match';
      const movieId = '550';
      const users = ['user-1', 'user-2', 'user-3'];

      // Mock unanimous voting scenario
      for (let i = 0; i < users.length; i++) {
        const userId = users[i];
        const isLastVote = i === users.length - 1;
        
        mockSend
          .mockResolvedValueOnce({ // Get room
            Item: {
              PK: roomId,
              SK: 'ROOM',
              roomId: roomId,
              name: 'Match Test Room',
              hostId: users[0],
              status: 'ACTIVE',
              memberCount: users.length,
              createdAt: new Date().toISOString(),
            }
          })
          .mockResolvedValueOnce({ // Get cached movies
            Item: {
              cacheKey: roomId,
              movies: [
                {
                  tmdbId: 550,
                  title: 'Fight Club',
                  posterPath: 'https://image.tmdb.org/t/p/w500/poster1.jpg',
                  overview: 'A movie about fighting',
                  genres: ['Action', 'Drama'],
                  year: 1999,
                  rating: 8.8,
                  cachedAt: new Date().toISOString(),
                  ttl: Date.now() + 24 * 60 * 60 * 1000,
                },
              ],
              genreFilters: [],
              cachedAt: new Date().toISOString(),
              ttl: Date.now() + 24 * 60 * 60 * 1000,
            }
          })
          .mockResolvedValueOnce({ Item: null }) // Check vote doesn't exist
          .mockResolvedValueOnce({}) // Create vote
          .mockResolvedValueOnce({}) // Create user vote tracking
          .mockResolvedValueOnce({ // Get updated vote count
            Item: {
              roomId: roomId,
              movieId: movieId,
              votes: i + 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          })
          .mockResolvedValueOnce({ // Get room members
            Items: users.map(uid => ({
              PK: uid,
              SK: roomId,
              userId: uid,
              roomId: roomId,
              displayName: `User ${uid}`,
              joinedAt: new Date().toISOString(),
            }))
          });

        if (isLastVote) {
          // Mock room status update to MATCHED
          mockSend.mockResolvedValueOnce({}); // Update room status
        }

        const voteEvent = {
          info: { fieldName: 'submitVote' },
          identity: { sub: userId },
          arguments: {
            roomId: roomId,
            movieId: movieId,
            voteType: 'LIKE',
          },
        };

        const voteResult = await voteHandler(voteEvent as any, mockContext as any, {} as any);

        expect(voteResult.success).toBe(true);
        expect(voteResult.currentVotes).toBe(i + 1);

        if (isLastVote) {
          // Verify match was found
          expect(voteResult.matchFound).toBe(true);
          expect(voteResult.roomStatus).toBe('MATCHED');

          // Verify match notification was broadcast
          const matchNotificationCall = mockPublish.mock.calls.find(call => 
            call[0].params && call[0].params.query && call[0].params.query.includes('MatchFound')
          );
          
          expect(matchNotificationCall).toBeDefined();
          
          if (matchNotificationCall) {
            const variables = matchNotificationCall[0].params.variables;
            
            // Verify match details
            expect(variables.matchDetails).toMatchObject({
              movieId: movieId,
              movieTitle: 'Fight Club',
              votingDuration: expect.any(Number),
            });

            // Verify participant information
            expect(variables.participants).toHaveLength(users.length);
            variables.participants.forEach((participant: any) => {
              expect(participant).toMatchObject({
                userId: expect.any(String),
                displayName: expect.any(String),
                votingStatus: 'VOTED_YES',
              });
            });
          }
        }
      }
    });

    it('should handle connection status monitoring during voting', async () => {
      const roomId = 'test-room-connection';
      const userId = 'test-user-connection';

      // Mock vote processing with connection monitoring
      mockSend
        .mockResolvedValueOnce({ // Get room
          Item: {
            PK: roomId,
            SK: 'ROOM',
            roomId: roomId,
            name: 'Connection Test Room',
            hostId: 'test-host-id',
            status: 'ACTIVE',
            memberCount: 2,
            createdAt: new Date().toISOString(),
          }
        })
        .mockResolvedValueOnce({ // Get cached movies
          Item: {
            cacheKey: roomId,
            movies: [
              {
                tmdbId: 550,
                title: 'Fight Club',
                posterPath: 'https://image.tmdb.org/t/p/w500/poster1.jpg',
                overview: 'A movie about fighting',
                genres: ['Action', 'Drama'],
                year: 1999,
                rating: 8.8,
                cachedAt: new Date().toISOString(),
                ttl: Date.now() + 24 * 60 * 60 * 1000,
              },
            ],
            genreFilters: [],
            cachedAt: new Date().toISOString(),
            ttl: Date.now() + 24 * 60 * 60 * 1000,
          }
        })
        .mockResolvedValueOnce({ Item: null }) // Check vote doesn't exist
        .mockResolvedValueOnce({}) // Create vote
        .mockResolvedValueOnce({}) // Create user vote tracking
        .mockResolvedValueOnce({ // Get updated vote count
          Item: {
            roomId: roomId,
            movieId: '550',
            votes: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        })
        .mockResolvedValueOnce({ // Get room members with connection status
          Items: [
            { 
              PK: 'test-host-id', 
              SK: roomId, 
              userId: 'test-host-id', 
              roomId: roomId,
              displayName: 'Host User',
              connectionStatus: 'CONNECTED',
              lastSeen: new Date().toISOString(),
            },
            { 
              PK: userId, 
              SK: roomId, 
              userId: userId, 
              roomId: roomId,
              displayName: 'Test User',
              connectionStatus: 'CONNECTED',
              lastSeen: new Date().toISOString(),
            },
          ]
        });

      const voteEvent = {
        info: { fieldName: 'submitVote' },
        identity: { sub: userId },
        arguments: {
          roomId: roomId,
          movieId: '550',
          voteType: 'LIKE',
        },
      };

      const voteResult = await voteHandler(voteEvent as any, mockContext as any, {} as any);

      expect(voteResult.success).toBe(true);

      // Verify connection status was included in broadcast
      const publishCalls = mockPublish.mock.calls;
      const voteUpdateCall = publishCalls.find(call => 
        call[0].params && call[0].params.variables && call[0].params.variables.roomId === roomId
      );
      
      expect(voteUpdateCall).toBeDefined();
      
      if (voteUpdateCall) {
        const variables = voteUpdateCall[0].params.variables;
        
        // Verify connection status information
        expect(variables.connectionStatus).toMatchObject({
          connectedUsers: expect.arrayContaining(['test-host-id', userId]),
          totalConnections: 2,
        });
      }
    });
  });

  describe('Cache Performance and Optimization', () => {
    it('should optimize cache performance during high-frequency voting', async () => {
      const roomId = 'test-room-performance';
      const movieId = '550';
      const users = Array.from({ length: 10 }, (_, i) => `user-${i}`);

      // Mock high-performance cache scenario
      mockSend
        .mockResolvedValue({ // Default room response
          Item: {
            PK: roomId,
            SK: 'ROOM',
            roomId: roomId,
            name: 'Performance Test Room',
            hostId: users[0],
            status: 'ACTIVE',
            memberCount: users.length,
            createdAt: new Date().toISOString(),
          }
        });

      // Mock cached movies (should be reused across votes)
      const cachedMoviesResponse = {
        Item: {
          cacheKey: roomId,
          movies: [
            {
              tmdbId: 550,
              title: 'Fight Club',
              posterPath: 'https://image.tmdb.org/t/p/w500/poster1.jpg',
              overview: 'A movie about fighting',
              genres: ['Action', 'Drama'],
              year: 1999,
              rating: 8.8,
              cachedAt: new Date().toISOString(),
              ttl: Date.now() + 24 * 60 * 60 * 1000,
            },
          ],
          genreFilters: [],
          cachedAt: new Date().toISOString(),
          ttl: Date.now() + 24 * 60 * 60 * 1000,
        }
      };

      const startTime = Date.now();

      // Simulate rapid voting from multiple users
      const votePromises = users.map(async (userId, index) => {
        // Setup mocks for each vote
        mockSend
          .mockResolvedValueOnce(cachedMoviesResponse) // Get cached movies
          .mockResolvedValueOnce({ Item: null }) // Check vote doesn't exist
          .mockResolvedValueOnce({}) // Create vote
          .mockResolvedValueOnce({}) // Create user vote tracking
          .mockResolvedValueOnce({ // Get updated vote count
            Item: {
              roomId: roomId,
              movieId: movieId,
              votes: index + 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          })
          .mockResolvedValueOnce({ // Get room members
            Items: users.slice(0, index + 1).map(uid => ({
              PK: uid,
              SK: roomId,
              userId: uid,
              roomId: roomId,
              displayName: `User ${uid}`,
            }))
          });

        const voteEvent = {
          info: { fieldName: 'submitVote' },
          identity: { sub: userId },
          arguments: {
            roomId: roomId,
            movieId: movieId,
            voteType: 'LIKE',
          },
        };

        return voteHandler(voteEvent as any, mockContext as any, {} as any);
      });

      const results = await Promise.all(votePromises);
      const executionTime = Date.now() - startTime;

      // Verify performance (should complete within reasonable time)
      expect(executionTime).toBeLessThan(5000); // 5 seconds for 10 concurrent votes

      // Verify all votes were processed successfully
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.currentVotes).toBe(index + 1);
      });

      // Verify cache was efficiently reused (no TMDB API calls)
      expect(mockFetch).not.toHaveBeenCalled();

      // Verify real-time updates were sent for all votes
      expect(mockPublish).toHaveBeenCalledTimes(users.length);
    });

    it('should handle cache TTL expiration gracefully', async () => {
      const roomId = 'test-room-ttl';
      const userId = 'test-user-ttl';

      // Mock expired cache scenario
      mockSend
        .mockResolvedValueOnce({ // Get room
          Item: {
            PK: roomId,
            SK: 'ROOM',
            roomId: roomId,
            name: 'TTL Test Room',
            hostId: 'test-host-id',
            status: 'ACTIVE',
            memberCount: 2,
            genrePreferences: ['Action'],
            createdAt: new Date().toISOString(),
          }
        })
        .mockResolvedValueOnce({ // Get expired cache
          Item: {
            cacheKey: roomId,
            movies: [
              {
                tmdbId: 550,
                title: 'Fight Club',
                posterPath: 'https://image.tmdb.org/t/p/w500/poster1.jpg',
                overview: 'A movie about fighting',
                genres: ['Action', 'Drama'],
                year: 1999,
                rating: 8.8,
                cachedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
                ttl: Date.now() - 60 * 60 * 1000, // Expired 1 hour ago
              },
            ],
            genreFilters: ['Action'],
            cachedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
            ttl: Date.now() - 60 * 60 * 1000, // Expired
          }
        })
        .mockResolvedValueOnce({}) // Refresh cache with new movies
        .mockResolvedValueOnce({ Item: null }) // Check vote doesn't exist
        .mockResolvedValueOnce({}) // Create vote
        .mockResolvedValueOnce({}) // Create user vote tracking
        .mockResolvedValueOnce({ // Get updated vote count
          Item: {
            roomId: roomId,
            movieId: '551',
            votes: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        })
        .mockResolvedValueOnce({ // Get room members
          Items: [
            { PK: 'test-host-id', SK: roomId, userId: 'test-host-id', roomId: roomId },
            { PK: userId, SK: roomId, userId: userId, roomId: roomId },
          ]
        });

      // Mock TMDB API call for cache refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            {
              id: 551,
              title: 'The Matrix Reloaded',
              poster_path: '/poster2.jpg',
              overview: 'The sequel to The Matrix',
              genre_ids: [28, 878], // Action, Sci-Fi
              release_date: '2003-05-15',
              vote_average: 7.2,
            },
          ],
          total_results: 1,
        }),
      });

      const voteEvent = {
        info: { fieldName: 'submitVote' },
        identity: { sub: userId },
        arguments: {
          roomId: roomId,
          movieId: '551',
          voteType: 'LIKE',
        },
      };

      const voteResult = await voteHandler(voteEvent as any, mockContext as any, {} as any);

      // Verify vote was processed with refreshed cache
      expect(voteResult.success).toBe(true);
      expect(voteResult.currentVotes).toBe(1);

      // Verify TMDB API was called to refresh expired cache
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.themoviedb.org'),
        expect.any(Object)
      );

      // Verify cache was updated with fresh TTL
      const cacheUpdateCalls = mockSend.mock.calls.filter(call => 
        call[0].params && call[0].params.TableName === 'test-movie-cache-table' && 
        call[0].params.Item
      );
      expect(cacheUpdateCalls.length).toBeGreaterThan(0);
    });
  });
});
