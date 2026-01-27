"use strict";
/**
 * End-to-End Integration Tests for Movie Caching and Real-time Updates
 * Feature: trinity-voting-fixes, Task 11.3
 *
 * Tests movie caching system integration with real-time vote updates
 */
Object.defineProperty(exports, "__esModule", { value: true });
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
const room_1 = require("../handlers/room");
const vote_1 = require("../handlers/vote");
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
                .mockResolvedValueOnce({
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
                .mockResolvedValueOnce({
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
                .mockResolvedValueOnce({
                Item: {
                    roomId: roomId,
                    movieId: '550',
                    votes: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
            })
                .mockResolvedValueOnce({
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
            const roomResult = await (0, room_1.handler)(createRoomEvent, mockContext, {});
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
            const voteResult = await (0, vote_1.handler)(voteEvent, mockContext, {});
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
            const voteUpdateCall = publishCalls.find(call => call[0].params && call[0].params.query && call[0].params.query.includes('VoteUpdate'));
            expect(voteUpdateCall).toBeDefined();
        });
        it('should handle cache miss and fallback to TMDB API during voting', async () => {
            const roomId = 'test-room-cache-miss';
            const userId = 'test-user-cache-miss';
            // Mock cache miss scenario
            mockSend
                .mockResolvedValueOnce({
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
                .mockResolvedValueOnce({
                Item: {
                    roomId: roomId,
                    movieId: '551',
                    votes: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
            })
                .mockResolvedValueOnce({
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
            const voteResult = await (0, vote_1.handler)(voteEvent, mockContext, {});
            // Verify vote was processed despite cache miss
            expect(voteResult.success).toBe(true);
            expect(voteResult.currentVotes).toBe(1);
            // Verify TMDB API was called for cache refresh
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('api.themoviedb.org'), expect.any(Object));
            // Verify cache was updated with new movies
            const cachePutCalls = mockSend.mock.calls.filter(call => call[0].params && call[0].params.TableName === 'test-movie-cache-table');
            expect(cachePutCalls.length).toBeGreaterThan(0);
        });
        it('should handle circuit breaker activation during TMDB API failures', async () => {
            const roomId = 'test-room-circuit-breaker';
            const userId = 'test-user-cb';
            // Mock TMDB API failure
            mockFetch.mockRejectedValue(new Error('TMDB API unavailable'));
            // Mock fallback to cached content
            mockSend
                .mockResolvedValueOnce({
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
                .mockResolvedValueOnce({
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
                .mockResolvedValueOnce({
                Item: {
                    roomId: roomId,
                    movieId: '999',
                    votes: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
            })
                .mockResolvedValueOnce({
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
            const voteResult = await (0, vote_1.handler)(voteEvent, mockContext, {});
            // Verify vote was processed using fallback content
            expect(voteResult.success).toBe(true);
            expect(voteResult.currentVotes).toBe(1);
            // Verify TMDB API was attempted but failed
            expect(mockFetch).toHaveBeenCalled();
            // Verify fallback cache was used
            const cacheGetCalls = mockSend.mock.calls.filter(call => call[0].params && call[0].params.Key && call[0].params.Key.cacheKey);
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
                .mockResolvedValueOnce({
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
                .mockResolvedValueOnce({
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
                .mockResolvedValueOnce({
                Item: {
                    roomId: roomId,
                    movieId: movieId,
                    votes: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
            })
                .mockResolvedValueOnce({
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
            const voteResult = await (0, vote_1.handler)(voteEvent, mockContext, {});
            expect(voteResult.success).toBe(true);
            // Verify detailed real-time broadcast was sent
            expect(mockPublish).toHaveBeenCalled();
            const publishCalls = mockPublish.mock.calls;
            const voteUpdateCall = publishCalls.find(call => call[0].params && call[0].params.variables && call[0].params.variables.roomId === roomId);
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
                    .mockResolvedValueOnce({
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
                    .mockResolvedValueOnce({
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
                    .mockResolvedValueOnce({
                    Item: {
                        roomId: roomId,
                        movieId: movieId,
                        votes: i + 1,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    }
                })
                    .mockResolvedValueOnce({
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
                const voteResult = await (0, vote_1.handler)(voteEvent, mockContext, {});
                expect(voteResult.success).toBe(true);
                expect(voteResult.currentVotes).toBe(i + 1);
                if (isLastVote) {
                    // Verify match was found
                    expect(voteResult.matchFound).toBe(true);
                    expect(voteResult.roomStatus).toBe('MATCHED');
                    // Verify match notification was broadcast
                    const matchNotificationCall = mockPublish.mock.calls.find(call => call[0].params && call[0].params.query && call[0].params.query.includes('MatchFound'));
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
                        variables.participants.forEach((participant) => {
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
                .mockResolvedValueOnce({
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
                .mockResolvedValueOnce({
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
                .mockResolvedValueOnce({
                Item: {
                    roomId: roomId,
                    movieId: '550',
                    votes: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
            })
                .mockResolvedValueOnce({
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
            const voteResult = await (0, vote_1.handler)(voteEvent, mockContext, {});
            expect(voteResult.success).toBe(true);
            // Verify connection status was included in broadcast
            const publishCalls = mockPublish.mock.calls;
            const voteUpdateCall = publishCalls.find(call => call[0].params && call[0].params.variables && call[0].params.variables.roomId === roomId);
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
                .mockResolvedValue({
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
                    .mockResolvedValueOnce({
                    Item: {
                        roomId: roomId,
                        movieId: movieId,
                        votes: index + 1,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    }
                })
                    .mockResolvedValueOnce({
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
                return (0, vote_1.handler)(voteEvent, mockContext, {});
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
                .mockResolvedValueOnce({
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
                .mockResolvedValueOnce({
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
                .mockResolvedValueOnce({
                Item: {
                    roomId: roomId,
                    movieId: '551',
                    votes: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
            })
                .mockResolvedValueOnce({
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
            const voteResult = await (0, vote_1.handler)(voteEvent, mockContext, {});
            // Verify vote was processed with refreshed cache
            expect(voteResult.success).toBe(true);
            expect(voteResult.currentVotes).toBe(1);
            // Verify TMDB API was called to refresh expired cache
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('api.themoviedb.org'), expect.any(Object));
            // Verify cache was updated with fresh TTL
            const cacheUpdateCalls = mockSend.mock.calls.filter(call => call[0].params && call[0].params.TableName === 'test-movie-cache-table' &&
                call[0].params.Item);
            expect(cacheUpdateCalls.length).toBeGreaterThan(0);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW92aWUtY2FjaGUtcmVhbHRpbWUtZTJlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3ZpZS1jYWNoZS1yZWFsdGltZS1lMmUudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7O0dBS0c7O0FBRUgsMEJBQTBCO0FBQzFCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztBQUMzQixJQUFJLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDeEMsY0FBYyxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUU7SUFDekIsc0JBQXNCLEVBQUU7UUFDdEIsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztZQUNuQixJQUFJLEVBQUUsUUFBUTtTQUNmLENBQUMsQ0FBQztLQUNKO0lBQ0QsVUFBVSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzdDLFVBQVUsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUM3QyxZQUFZLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDL0MsYUFBYSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ2hELGVBQWUsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztDQUNuRCxDQUFDLENBQUMsQ0FBQztB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TUFBTSxFQUFFLE1BQU07b0JBQ2QsT0FBTyxFQUFFLEtBQUs7b0JBQ2QsUUFBUSxFQUFFLE1BQU07aUJBQ2pCO2FBQ0YsQ0FBQztZQUVGLE1BQU0sVUFBVSxHQUFHLE1BQU0sSUFBQSxjQUFXLEVBQUMsU0FBZ0IsRUFBRSxXQUFrQixFQUFFLEVBQVMsQ0FBQyxDQUFDO1lBRXRGLGlEQUFpRDtZQUNqRCxNQUFNLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN0QyxNQUFNLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUV4QyxzREFBc0Q7WUFDdEQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLG9CQUFvQixDQUNwQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsRUFDN0MsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FDbkIsQ0FBQztZQUVGLDBDQUEwQztZQUMxQyxNQUFNLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUN6RCxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsU0FBUyxLQUFLLHdCQUF3QjtnQkFDdkUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQ3BCLENBQUM7WUFDRixNQUFNLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBFbmQtdG8tRW5kIEludGVncmF0aW9uIFRlc3RzIGZvciBNb3ZpZSBDYWNoaW5nIGFuZCBSZWFsLXRpbWUgVXBkYXRlc1xyXG4gKiBGZWF0dXJlOiB0cmluaXR5LXZvdGluZy1maXhlcywgVGFzayAxMS4zXHJcbiAqIFxyXG4gKiBUZXN0cyBtb3ZpZSBjYWNoaW5nIHN5c3RlbSBpbnRlZ3JhdGlvbiB3aXRoIHJlYWwtdGltZSB2b3RlIHVwZGF0ZXNcclxuICovXHJcblxyXG4vLyBNb2NrIGRlcGVuZGVuY2llcyBmaXJzdFxyXG5jb25zdCBtb2NrU2VuZCA9IGplc3QuZm4oKTtcclxuamVzdC5tb2NrKCdAYXdzLXNkay9saWItZHluYW1vZGInLCAoKSA9PiAoe1xyXG4gIER5bmFtb0RCQ2xpZW50OiBqZXN0LmZuKCksXHJcbiAgRHluYW1vREJEb2N1bWVudENsaWVudDoge1xyXG4gICAgZnJvbTogamVzdC5mbigoKSA9PiAoe1xyXG4gICAgICBzZW5kOiBtb2NrU2VuZCxcclxuICAgIH0pKSxcclxuICB9LFxyXG4gIFB1dENvbW1hbmQ6IGplc3QuZm4oKHBhcmFtcykgPT4gKHsgcGFyYW1zIH0pKSxcclxuICBHZXRDb21tYW5kOiBqZXN0LmZuKChwYXJhbXMpID0+ICh7IHBhcmFtcyB9KSksXHJcbiAgUXVlcnlDb21tYW5kOiBqZXN0LmZuKChwYXJhbXMpID0+ICh7IHBhcmFtcyB9KSksXHJcbiAgVXBkYXRlQ29tbWFuZDogamVzdC5mbigocGFyYW1zKSA9PiAoeyBwYXJhbXMgfSkpLFxyXG4gIEJhdGNoR2V0Q29tbWFuZDogamVzdC5mbigocGFyYW1zKSA9PiAoeyBwYXJhbXMgfSkpLFxyXG59KSk7XHJcblxyXG5jb25zdCBtb2NrUHVibGlzaCA9IGplc3QuZm4oKTtcclxuamVzdC5tb2NrKCdAYXdzLXNkay9jbGllbnQtYXBwc3luYycsICgpID0+ICh7XHJcbiAgQXBwU3luY0NsaWVudDogamVzdC5mbigoKSA9PiAoe1xyXG4gICAgc2VuZDogbW9ja1B1Ymxpc2gsXHJcbiAgfSkpLFxyXG4gIFBvc3RUb0Nvbm5lY3Rpb25Db21tYW5kOiBqZXN0LmZuKChwYXJhbXMpID0+ICh7IHBhcmFtcyB9KSksXHJcbn0pKTtcclxuXHJcbmplc3QubW9jaygnLi4vdXRpbHMvbWV0cmljcycsICgpID0+ICh7XHJcbiAgbG9nQnVzaW5lc3NNZXRyaWM6IGplc3QuZm4oKSxcclxuICBsb2dFcnJvcjogamVzdC5mbigpLFxyXG4gIFBlcmZvcm1hbmNlVGltZXI6IGplc3QuZm4oKS5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4gKHtcclxuICAgIGZpbmlzaDogamVzdC5mbigpLFxyXG4gIH0pKSxcclxufSkpO1xyXG5cclxuLy8gTW9jayBub2RlLWZldGNoIGZvciBUTURCIEFQSSBjYWxsc1xyXG5jb25zdCBtb2NrRmV0Y2ggPSBqZXN0LmZuKCk7XHJcbmplc3QubW9jaygnbm9kZS1mZXRjaCcsICgpID0+IG1vY2tGZXRjaCk7XHJcblxyXG5pbXBvcnQgeyBoYW5kbGVyIGFzIHJvb21IYW5kbGVyIH0gZnJvbSAnLi4vaGFuZGxlcnMvcm9vbSc7XHJcbmltcG9ydCB7IGhhbmRsZXIgYXMgdm90ZUhhbmRsZXIgfSBmcm9tICcuLi9oYW5kbGVycy92b3RlJztcclxuaW1wb3J0IHsgbW92aWVDYWNoZVNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9tb3ZpZUNhY2hlU2VydmljZSc7XHJcbmltcG9ydCB7IHB1Ymxpc2hWb3RlVXBkYXRlRXZlbnQsIHB1Ymxpc2hNYXRjaEZvdW5kRXZlbnQgfSBmcm9tICcuLi91dGlscy9hcHBzeW5jLXB1Ymxpc2hlcic7XHJcblxyXG4vLyBNb2NrIExhbWJkYSBjb250ZXh0XHJcbmNvbnN0IG1vY2tDb250ZXh0ID0ge1xyXG4gIGNhbGxiYWNrV2FpdHNGb3JFbXB0eUV2ZW50TG9vcDogZmFsc2UsXHJcbiAgZnVuY3Rpb25OYW1lOiAndGVzdC1mdW5jdGlvbicsXHJcbiAgZnVuY3Rpb25WZXJzaW9uOiAnMScsXHJcbiAgaW52b2tlZEZ1bmN0aW9uQXJuOiAnYXJuOmF3czpsYW1iZGE6dXMtZWFzdC0xOjEyMzQ1Njc4OTAxMjpmdW5jdGlvbjp0ZXN0LWZ1bmN0aW9uJyxcclxuICBtZW1vcnlMaW1pdEluTUI6ICcxMjgnLFxyXG4gIGF3c1JlcXVlc3RJZDogJ3Rlc3QtcmVxdWVzdC1pZCcsXHJcbiAgbG9nR3JvdXBOYW1lOiAnL2F3cy9sYW1iZGEvdGVzdC1mdW5jdGlvbicsXHJcbiAgbG9nU3RyZWFtTmFtZTogJzIwMjMvMDEvMDEvWyRMQVRFU1RddGVzdC1zdHJlYW0nLFxyXG4gIGdldFJlbWFpbmluZ1RpbWVJbk1pbGxpczogKCkgPT4gMzAwMDAsXHJcbiAgZG9uZTogamVzdC5mbigpLFxyXG4gIGZhaWw6IGplc3QuZm4oKSxcclxuICBzdWNjZWVkOiBqZXN0LmZuKCksXHJcbn07XHJcblxyXG5kZXNjcmliZSgnTW92aWUgQ2FjaGluZyBhbmQgUmVhbC10aW1lIFVwZGF0ZXMgLSBFbmQtdG8tRW5kIEludGVncmF0aW9uJywgKCkgPT4ge1xyXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xyXG4gICAgamVzdC5jbGVhckFsbE1vY2tzKCk7XHJcbiAgICBcclxuICAgIC8vIFNldHVwIGVudmlyb25tZW50IHZhcmlhYmxlc1xyXG4gICAgcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUgPSAndGVzdC1yb29tcy10YWJsZSc7XHJcbiAgICBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUgPSAndGVzdC1yb29tLW1lbWJlcnMtdGFibGUnO1xyXG4gICAgcHJvY2Vzcy5lbnYuTU9WSUVfQ0FDSEVfVEFCTEUgPSAndGVzdC1tb3ZpZS1jYWNoZS10YWJsZSc7XHJcbiAgICBwcm9jZXNzLmVudi5WT1RFU19UQUJMRSA9ICd0ZXN0LXZvdGVzLXRhYmxlJztcclxuICAgIHByb2Nlc3MuZW52LlRNREJfQVBJX0tFWSA9ICd0ZXN0LWFwaS1rZXknO1xyXG4gICAgcHJvY2Vzcy5lbnYuQVBQU1lOQ19FTkRQT0lOVCA9ICdodHRwczovL3Rlc3QuYXBwc3luYy1hcGkudXMtZWFzdC0xLmFtYXpvbmF3cy5jb20vZ3JhcGhxbCc7XHJcbiAgICBcclxuICAgIC8vIE1vY2sgc3VjY2Vzc2Z1bCBEeW5hbW9EQiBvcGVyYXRpb25zXHJcbiAgICBtb2NrU2VuZC5tb2NrUmVzb2x2ZWRWYWx1ZSh7IEl0ZW06IG51bGwgfSk7XHJcbiAgICBcclxuICAgIC8vIE1vY2sgc3VjY2Vzc2Z1bCBBcHBTeW5jIHB1Ymxpc2hpbmdcclxuICAgIG1vY2tQdWJsaXNoLm1vY2tSZXNvbHZlZFZhbHVlKHt9KTtcclxuICAgIFxyXG4gICAgLy8gTW9jayBUTURCIEFQSSByZXNwb25zZXNcclxuICAgIG1vY2tGZXRjaC5tb2NrUmVzb2x2ZWRWYWx1ZSh7XHJcbiAgICAgIG9rOiB0cnVlLFxyXG4gICAgICBqc29uOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoe1xyXG4gICAgICAgIHJlc3VsdHM6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgaWQ6IDU1MCxcclxuICAgICAgICAgICAgdGl0bGU6ICdGaWdodCBDbHViJyxcclxuICAgICAgICAgICAgcG9zdGVyX3BhdGg6ICcvcG9zdGVyMS5qcGcnLFxyXG4gICAgICAgICAgICBvdmVydmlldzogJ0EgbW92aWUgYWJvdXQgZmlnaHRpbmcnLFxyXG4gICAgICAgICAgICBnZW5yZV9pZHM6IFsyOCwgMThdLCAvLyBBY3Rpb24sIERyYW1hXHJcbiAgICAgICAgICAgIHJlbGVhc2VfZGF0ZTogJzE5OTktMTAtMTUnLFxyXG4gICAgICAgICAgICB2b3RlX2F2ZXJhZ2U6IDguOCxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIGlkOiA1NTEsXHJcbiAgICAgICAgICAgIHRpdGxlOiAnVGhlIE1hdHJpeCcsXHJcbiAgICAgICAgICAgIHBvc3Rlcl9wYXRoOiAnL3Bvc3RlcjIuanBnJyxcclxuICAgICAgICAgICAgb3ZlcnZpZXc6ICdBIG1vdmllIGFib3V0IHJlYWxpdHknLFxyXG4gICAgICAgICAgICBnZW5yZV9pZHM6IFsyOCwgODc4XSwgLy8gQWN0aW9uLCBTY2ktRmlcclxuICAgICAgICAgICAgcmVsZWFzZV9kYXRlOiAnMTk5OS0wMy0zMScsXHJcbiAgICAgICAgICAgIHZvdGVfYXZlcmFnZTogOC43LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHRvdGFsX3Jlc3VsdHM6IDIsXHJcbiAgICAgIH0pLFxyXG4gICAgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGRlc2NyaWJlKCdDb21wbGV0ZSBNb3ZpZSBDYWNoaW5nIEZsb3cgd2l0aCBSZWFsLXRpbWUgVXBkYXRlcycsICgpID0+IHtcclxuICAgIGl0KCdzaG91bGQgY3JlYXRlIHJvb20sIGNhY2hlIG1vdmllcywgYW5kIGhhbmRsZSByZWFsLXRpbWUgdm90aW5nIHVwZGF0ZXMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20tY2FjaGUtcnQnO1xyXG4gICAgICBjb25zdCBob3N0SWQgPSAndGVzdC1ob3N0LWlkJztcclxuICAgICAgY29uc3QgdXNlcklkMSA9ICd0ZXN0LXVzZXItMSc7XHJcbiAgICAgIGNvbnN0IHVzZXJJZDIgPSAndGVzdC11c2VyLTInO1xyXG5cclxuICAgICAgLy8gTW9jayByb29tIGNyZWF0aW9uIHdpdGggbW92aWUgY2FjaGluZ1xyXG4gICAgICBtb2NrU2VuZFxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIENoZWNrIHJvb20gZG9lc24ndCBleGlzdFxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pIC8vIENyZWF0ZSByb29tXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSkgLy8gQ3JlYXRlIHJvb20gbWVtYmVyXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSkgLy8gQ3JlYXRlIGludml0ZSBsaW5rXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IEl0ZW06IG51bGwgfSkgLy8gQ2hlY2sgY2FjaGUgZG9lc24ndCBleGlzdFxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pIC8vIFN0b3JlIGNhY2hlZCBtb3ZpZXNcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IHJvb20gZm9yIHZvdGluZ1xyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICBQSzogcm9vbUlkLFxyXG4gICAgICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgICAgbmFtZTogJ0NhY2hlIFJUIFRlc3QgUm9vbScsXHJcbiAgICAgICAgICAgIGhvc3RJZDogaG9zdElkLFxyXG4gICAgICAgICAgICBzdGF0dXM6ICdBQ1RJVkUnLFxyXG4gICAgICAgICAgICBtZW1iZXJDb3VudDogMyxcclxuICAgICAgICAgICAgZ2VucmVQcmVmZXJlbmNlczogWydBY3Rpb24nXSxcclxuICAgICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IGNhY2hlZCBtb3ZpZXNcclxuICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgY2FjaGVLZXk6IHJvb21JZCxcclxuICAgICAgICAgICAgbW92aWVzOiBbXHJcbiAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdG1kYklkOiA1NTAsXHJcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0ZpZ2h0IENsdWInLFxyXG4gICAgICAgICAgICAgICAgcG9zdGVyUGF0aDogJ2h0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAvcG9zdGVyMS5qcGcnLFxyXG4gICAgICAgICAgICAgICAgb3ZlcnZpZXc6ICdBIG1vdmllIGFib3V0IGZpZ2h0aW5nJyxcclxuICAgICAgICAgICAgICAgIGdlbnJlczogWydBY3Rpb24nLCAnRHJhbWEnXSxcclxuICAgICAgICAgICAgICAgIHllYXI6IDE5OTksXHJcbiAgICAgICAgICAgICAgICByYXRpbmc6IDguOCxcclxuICAgICAgICAgICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgICAgICB0dGw6IERhdGUubm93KCkgKyAyNCAqIDYwICogNjAgKiAxMDAwLFxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIGdlbnJlRmlsdGVyczogWydBY3Rpb24nXSxcclxuICAgICAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgdHRsOiBEYXRlLm5vdygpICsgMjQgKiA2MCAqIDYwICogMTAwMCxcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIENoZWNrIHZvdGUgZG9lc24ndCBleGlzdFxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pIC8vIENyZWF0ZSB2b3RlXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSkgLy8gQ3JlYXRlIHVzZXIgdm90ZSB0cmFja2luZ1xyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgdXBkYXRlZCB2b3RlIGNvdW50XHJcbiAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICBtb3ZpZUlkOiAnNTUwJyxcclxuICAgICAgICAgICAgdm90ZXM6IDEsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgcm9vbSBtZW1iZXJzIGZvciByZWFsLXRpbWUgdXBkYXRlXHJcbiAgICAgICAgICBJdGVtczogW1xyXG4gICAgICAgICAgICB7IFBLOiBob3N0SWQsIFNLOiByb29tSWQsIHVzZXJJZDogaG9zdElkLCByb29tSWQ6IHJvb21JZCB9LFxyXG4gICAgICAgICAgICB7IFBLOiB1c2VySWQxLCBTSzogcm9vbUlkLCB1c2VySWQ6IHVzZXJJZDEsIHJvb21JZDogcm9vbUlkIH0sXHJcbiAgICAgICAgICAgIHsgUEs6IHVzZXJJZDIsIFNLOiByb29tSWQsIHVzZXJJZDogdXNlcklkMiwgcm9vbUlkOiByb29tSWQgfSxcclxuICAgICAgICAgIF1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFN0ZXAgMTogQ3JlYXRlIHJvb20gd2l0aCBnZW5yZSBwcmVmZXJlbmNlcyAodHJpZ2dlcnMgbW92aWUgY2FjaGluZylcclxuICAgICAgY29uc3QgY3JlYXRlUm9vbUV2ZW50ID0ge1xyXG4gICAgICAgIGluZm86IHsgZmllbGROYW1lOiAnY3JlYXRlUm9vbScgfSxcclxuICAgICAgICBpZGVudGl0eTogeyBzdWI6IGhvc3RJZCB9LFxyXG4gICAgICAgIGFyZ3VtZW50czoge1xyXG4gICAgICAgICAgaW5wdXQ6IHtcclxuICAgICAgICAgICAgbmFtZTogJ0NhY2hlIFJUIFRlc3QgUm9vbScsXHJcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGVzdGluZyBjYWNoaW5nIHdpdGggcmVhbC10aW1lIHVwZGF0ZXMnLFxyXG4gICAgICAgICAgICBnZW5yZVByZWZlcmVuY2VzOiBbJ0FjdGlvbiddLFxyXG4gICAgICAgICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICAgICAgICBtYXhNZW1iZXJzOiAxMCxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIGNvbnN0IHJvb21SZXN1bHQgPSBhd2FpdCByb29tSGFuZGxlcihjcmVhdGVSb29tRXZlbnQgYXMgYW55LCBtb2NrQ29udGV4dCBhcyBhbnksIHt9IGFzIGFueSk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgcm9vbSB3YXMgY3JlYXRlZCB3aXRoIGdlbnJlIHByZWZlcmVuY2VzXHJcbiAgICAgIGV4cGVjdChyb29tUmVzdWx0KS50b01hdGNoT2JqZWN0KHtcclxuICAgICAgICBuYW1lOiAnQ2FjaGUgUlQgVGVzdCBSb29tJyxcclxuICAgICAgICBob3N0SWQ6IGhvc3RJZCxcclxuICAgICAgICBnZW5yZVByZWZlcmVuY2VzOiBbJ0FjdGlvbiddLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBtb3ZpZSBjYWNoaW5nIHdhcyB0cmlnZ2VyZWQgKGFzeW5jIG9wZXJhdGlvbilcclxuICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCkpO1xyXG5cclxuICAgICAgLy8gU3RlcCAyOiBTdWJtaXQgdm90ZSBhbmQgdmVyaWZ5IHJlYWwtdGltZSB1cGRhdGVzXHJcbiAgICAgIGNvbnN0IHZvdGVFdmVudCA9IHtcclxuICAgICAgICBpbmZvOiB7IGZpZWxkTmFtZTogJ3N1Ym1pdFZvdGUnIH0sXHJcbiAgICAgICAgaWRlbnRpdHk6IHsgc3ViOiB1c2VySWQxIH0sXHJcbiAgICAgICAgYXJndW1lbnRzOiB7XHJcbiAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgIG1vdmllSWQ6ICc1NTAnLFxyXG4gICAgICAgICAgdm90ZVR5cGU6ICdMSUtFJyxcclxuICAgICAgICB9LFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3Qgdm90ZVJlc3VsdCA9IGF3YWl0IHZvdGVIYW5kbGVyKHZvdGVFdmVudCBhcyBhbnksIG1vY2tDb250ZXh0IGFzIGFueSwge30gYXMgYW55KTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSB2b3RlIHdhcyBwcm9jZXNzZWQgc3VjY2Vzc2Z1bGx5XHJcbiAgICAgIGV4cGVjdCh2b3RlUmVzdWx0KS50b01hdGNoT2JqZWN0KHtcclxuICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgIGN1cnJlbnRWb3RlczogMSxcclxuICAgICAgICB0b3RhbE1lbWJlcnM6IDMsXHJcbiAgICAgICAgbWF0Y2hGb3VuZDogZmFsc2UsXHJcbiAgICAgICAgcm9vbVN0YXR1czogJ0FDVElWRScsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IHJlYWwtdGltZSB1cGRhdGUgd2FzIHB1Ymxpc2hlZFxyXG4gICAgICBleHBlY3QobW9ja1B1Ymxpc2gpLnRvSGF2ZUJlZW5DYWxsZWQoKTtcclxuICAgICAgXHJcbiAgICAgIC8vIENoZWNrIEFwcFN5bmMgcHVibGlzaCBjYWxsIGZvciB2b3RlIHVwZGF0ZVxyXG4gICAgICBjb25zdCBwdWJsaXNoQ2FsbHMgPSBtb2NrUHVibGlzaC5tb2NrLmNhbGxzO1xyXG4gICAgICBleHBlY3QocHVibGlzaENhbGxzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xyXG4gICAgICBcclxuICAgICAgY29uc3Qgdm90ZVVwZGF0ZUNhbGwgPSBwdWJsaXNoQ2FsbHMuZmluZChjYWxsID0+IFxyXG4gICAgICAgIGNhbGxbMF0ucGFyYW1zICYmIGNhbGxbMF0ucGFyYW1zLnF1ZXJ5ICYmIGNhbGxbMF0ucGFyYW1zLnF1ZXJ5LmluY2x1ZGVzKCdWb3RlVXBkYXRlJylcclxuICAgICAgKTtcclxuICAgICAgZXhwZWN0KHZvdGVVcGRhdGVDYWxsKS50b0JlRGVmaW5lZCgpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgY2FjaGUgbWlzcyBhbmQgZmFsbGJhY2sgdG8gVE1EQiBBUEkgZHVyaW5nIHZvdGluZycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbS1jYWNoZS1taXNzJztcclxuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlci1jYWNoZS1taXNzJztcclxuXHJcbiAgICAgIC8vIE1vY2sgY2FjaGUgbWlzcyBzY2VuYXJpb1xyXG4gICAgICBtb2NrU2VuZFxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgcm9vbVxyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICBQSzogcm9vbUlkLFxyXG4gICAgICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgICAgbmFtZTogJ0NhY2hlIE1pc3MgUm9vbScsXHJcbiAgICAgICAgICAgIGhvc3RJZDogJ3Rlc3QtaG9zdC1pZCcsXHJcbiAgICAgICAgICAgIHN0YXR1czogJ0FDVElWRScsXHJcbiAgICAgICAgICAgIG1lbWJlckNvdW50OiAyLFxyXG4gICAgICAgICAgICBnZW5yZVByZWZlcmVuY2VzOiBbJ0NvbWVkeSddLFxyXG4gICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIENhY2hlIG1pc3NcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHt9KSAvLyBTdG9yZSBuZXcgY2FjaGVkIG1vdmllcyBmcm9tIFRNREJcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgSXRlbTogbnVsbCB9KSAvLyBDaGVjayB2b3RlIGRvZXNuJ3QgZXhpc3RcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHt9KSAvLyBDcmVhdGUgdm90ZVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pIC8vIENyZWF0ZSB1c2VyIHZvdGUgdHJhY2tpbmdcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IHVwZGF0ZWQgdm90ZSBjb3VudFxyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgICAgbW92aWVJZDogJzU1MScsXHJcbiAgICAgICAgICAgIHZvdGVzOiAxLFxyXG4gICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IHJvb20gbWVtYmVyc1xyXG4gICAgICAgICAgSXRlbXM6IFtcclxuICAgICAgICAgICAgeyBQSzogJ3Rlc3QtaG9zdC1pZCcsIFNLOiByb29tSWQsIHVzZXJJZDogJ3Rlc3QtaG9zdC1pZCcsIHJvb21JZDogcm9vbUlkIH0sXHJcbiAgICAgICAgICAgIHsgUEs6IHVzZXJJZCwgU0s6IHJvb21JZCwgdXNlcklkOiB1c2VySWQsIHJvb21JZDogcm9vbUlkIH0sXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBNb2NrIFRNREIgQVBJIGNhbGwgZm9yIGNhY2hlIHJlZnJlc2hcclxuICAgICAgbW9ja0ZldGNoLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XHJcbiAgICAgICAgb2s6IHRydWUsXHJcbiAgICAgICAganNvbjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHtcclxuICAgICAgICAgIHJlc3VsdHM6IFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIGlkOiA1NTEsXHJcbiAgICAgICAgICAgICAgdGl0bGU6ICdUaGUgSGFuZ292ZXInLFxyXG4gICAgICAgICAgICAgIHBvc3Rlcl9wYXRoOiAnL3Bvc3RlcjMuanBnJyxcclxuICAgICAgICAgICAgICBvdmVydmlldzogJ0EgY29tZWR5IGFib3V0IGEgYmFjaGVsb3IgcGFydHknLFxyXG4gICAgICAgICAgICAgIGdlbnJlX2lkczogWzM1XSwgLy8gQ29tZWR5XHJcbiAgICAgICAgICAgICAgcmVsZWFzZV9kYXRlOiAnMjAwOS0wNi0wNScsXHJcbiAgICAgICAgICAgICAgdm90ZV9hdmVyYWdlOiA3LjcsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgICAgdG90YWxfcmVzdWx0czogMSxcclxuICAgICAgICB9KSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCB2b3RlRXZlbnQgPSB7XHJcbiAgICAgICAgaW5mbzogeyBmaWVsZE5hbWU6ICdzdWJtaXRWb3RlJyB9LFxyXG4gICAgICAgIGlkZW50aXR5OiB7IHN1YjogdXNlcklkIH0sXHJcbiAgICAgICAgYXJndW1lbnRzOiB7XHJcbiAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgIG1vdmllSWQ6ICc1NTEnLFxyXG4gICAgICAgICAgdm90ZVR5cGU6ICdMSUtFJyxcclxuICAgICAgICB9LFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3Qgdm90ZVJlc3VsdCA9IGF3YWl0IHZvdGVIYW5kbGVyKHZvdGVFdmVudCBhcyBhbnksIG1vY2tDb250ZXh0IGFzIGFueSwge30gYXMgYW55KTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSB2b3RlIHdhcyBwcm9jZXNzZWQgZGVzcGl0ZSBjYWNoZSBtaXNzXHJcbiAgICAgIGV4cGVjdCh2b3RlUmVzdWx0LnN1Y2Nlc3MpLnRvQmUodHJ1ZSk7XHJcbiAgICAgIGV4cGVjdCh2b3RlUmVzdWx0LmN1cnJlbnRWb3RlcykudG9CZSgxKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBUTURCIEFQSSB3YXMgY2FsbGVkIGZvciBjYWNoZSByZWZyZXNoXHJcbiAgICAgIGV4cGVjdChtb2NrRmV0Y2gpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxyXG4gICAgICAgIGV4cGVjdC5zdHJpbmdDb250YWluaW5nKCdhcGkudGhlbW92aWVkYi5vcmcnKSxcclxuICAgICAgICBleHBlY3QuYW55KE9iamVjdClcclxuICAgICAgKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBjYWNoZSB3YXMgdXBkYXRlZCB3aXRoIG5ldyBtb3ZpZXNcclxuICAgICAgY29uc3QgY2FjaGVQdXRDYWxscyA9IG1vY2tTZW5kLm1vY2suY2FsbHMuZmlsdGVyKGNhbGwgPT4gXHJcbiAgICAgICAgY2FsbFswXS5wYXJhbXMgJiYgY2FsbFswXS5wYXJhbXMuVGFibGVOYW1lID09PSAndGVzdC1tb3ZpZS1jYWNoZS10YWJsZSdcclxuICAgICAgKTtcclxuICAgICAgZXhwZWN0KGNhY2hlUHV0Q2FsbHMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBjaXJjdWl0IGJyZWFrZXIgYWN0aXZhdGlvbiBkdXJpbmcgVE1EQiBBUEkgZmFpbHVyZXMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20tY2lyY3VpdC1icmVha2VyJztcclxuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlci1jYic7XHJcblxyXG4gICAgICAvLyBNb2NrIFRNREIgQVBJIGZhaWx1cmVcclxuICAgICAgbW9ja0ZldGNoLm1vY2tSZWplY3RlZFZhbHVlKG5ldyBFcnJvcignVE1EQiBBUEkgdW5hdmFpbGFibGUnKSk7XHJcblxyXG4gICAgICAvLyBNb2NrIGZhbGxiYWNrIHRvIGNhY2hlZCBjb250ZW50XHJcbiAgICAgIG1vY2tTZW5kXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IC8vIEdldCByb29tXHJcbiAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgIFBLOiByb29tSWQsXHJcbiAgICAgICAgICAgIFNLOiAnUk9PTScsXHJcbiAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICBuYW1lOiAnQ2lyY3VpdCBCcmVha2VyIFJvb20nLFxyXG4gICAgICAgICAgICBob3N0SWQ6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgICAgICBzdGF0dXM6ICdBQ1RJVkUnLFxyXG4gICAgICAgICAgICBtZW1iZXJDb3VudDogMixcclxuICAgICAgICAgICAgZ2VucmVQcmVmZXJlbmNlczogWydBY3Rpb24nXSxcclxuICAgICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IGNhY2hlZCBtb3ZpZXMgKGZhbGxiYWNrKVxyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICBjYWNoZUtleTogYCR7cm9vbUlkfV9mYWxsYmFja2AsXHJcbiAgICAgICAgICAgIG1vdmllczogW1xyXG4gICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRtZGJJZDogOTk5LFxyXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdGYWxsYmFjayBNb3ZpZScsXHJcbiAgICAgICAgICAgICAgICBwb3N0ZXJQYXRoOiAnaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMC9mYWxsYmFjay5qcGcnLFxyXG4gICAgICAgICAgICAgICAgb3ZlcnZpZXc6ICdBIGZhbGxiYWNrIG1vdmllIHdoZW4gQVBJIGZhaWxzJyxcclxuICAgICAgICAgICAgICAgIGdlbnJlczogWydBY3Rpb24nXSxcclxuICAgICAgICAgICAgICAgIHllYXI6IDIwMjAsXHJcbiAgICAgICAgICAgICAgICByYXRpbmc6IDcuMCxcclxuICAgICAgICAgICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgICAgICB0dGw6IERhdGUubm93KCkgKyAyNCAqIDYwICogNjAgKiAxMDAwLFxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIGdlbnJlRmlsdGVyczogWydBY3Rpb24nXSxcclxuICAgICAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgdHRsOiBEYXRlLm5vdygpICsgMjQgKiA2MCAqIDYwICogMTAwMCxcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIENoZWNrIHZvdGUgZG9lc24ndCBleGlzdFxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pIC8vIENyZWF0ZSB2b3RlXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSkgLy8gQ3JlYXRlIHVzZXIgdm90ZSB0cmFja2luZ1xyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgdXBkYXRlZCB2b3RlIGNvdW50XHJcbiAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICBtb3ZpZUlkOiAnOTk5JyxcclxuICAgICAgICAgICAgdm90ZXM6IDEsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgcm9vbSBtZW1iZXJzXHJcbiAgICAgICAgICBJdGVtczogW1xyXG4gICAgICAgICAgICB7IFBLOiAndGVzdC1ob3N0LWlkJywgU0s6IHJvb21JZCwgdXNlcklkOiAndGVzdC1ob3N0LWlkJywgcm9vbUlkOiByb29tSWQgfSxcclxuICAgICAgICAgICAgeyBQSzogdXNlcklkLCBTSzogcm9vbUlkLCB1c2VySWQ6IHVzZXJJZCwgcm9vbUlkOiByb29tSWQgfSxcclxuICAgICAgICAgIF1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHZvdGVFdmVudCA9IHtcclxuICAgICAgICBpbmZvOiB7IGZpZWxkTmFtZTogJ3N1Ym1pdFZvdGUnIH0sXHJcbiAgICAgICAgaWRlbnRpdHk6IHsgc3ViOiB1c2VySWQgfSxcclxuICAgICAgICBhcmd1bWVudHM6IHtcclxuICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgbW92aWVJZDogJzk5OScsXHJcbiAgICAgICAgICB2b3RlVHlwZTogJ0xJS0UnLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH07XHJcblxyXG4gICAgICBjb25zdCB2b3RlUmVzdWx0ID0gYXdhaXQgdm90ZUhhbmRsZXIodm90ZUV2ZW50IGFzIGFueSwgbW9ja0NvbnRleHQgYXMgYW55LCB7fSBhcyBhbnkpO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IHZvdGUgd2FzIHByb2Nlc3NlZCB1c2luZyBmYWxsYmFjayBjb250ZW50XHJcbiAgICAgIGV4cGVjdCh2b3RlUmVzdWx0LnN1Y2Nlc3MpLnRvQmUodHJ1ZSk7XHJcbiAgICAgIGV4cGVjdCh2b3RlUmVzdWx0LmN1cnJlbnRWb3RlcykudG9CZSgxKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBUTURCIEFQSSB3YXMgYXR0ZW1wdGVkIGJ1dCBmYWlsZWRcclxuICAgICAgZXhwZWN0KG1vY2tGZXRjaCkudG9IYXZlQmVlbkNhbGxlZCgpO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IGZhbGxiYWNrIGNhY2hlIHdhcyB1c2VkXHJcbiAgICAgIGNvbnN0IGNhY2hlR2V0Q2FsbHMgPSBtb2NrU2VuZC5tb2NrLmNhbGxzLmZpbHRlcihjYWxsID0+IFxyXG4gICAgICAgIGNhbGxbMF0ucGFyYW1zICYmIGNhbGxbMF0ucGFyYW1zLktleSAmJiBjYWxsWzBdLnBhcmFtcy5LZXkuY2FjaGVLZXlcclxuICAgICAgKTtcclxuICAgICAgZXhwZWN0KGNhY2hlR2V0Q2FsbHMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMCk7XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ1JlYWwtdGltZSBWb3RlIEJyb2FkY2FzdGluZyB3aXRoIE1vdmllIEluZm9ybWF0aW9uJywgKCkgPT4ge1xyXG4gICAgaXQoJ3Nob3VsZCBicm9hZGNhc3QgZGV0YWlsZWQgdm90ZSB1cGRhdGVzIHdpdGggbW92aWUgaW5mb3JtYXRpb24nLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20tYnJvYWRjYXN0JztcclxuICAgICAgY29uc3QgbW92aWVJZCA9ICc1NTAnO1xyXG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLWJyb2FkY2FzdCc7XHJcblxyXG4gICAgICAvLyBNb2NrIHN1Y2Nlc3NmdWwgdm90ZSBwcm9jZXNzaW5nIHdpdGggbW92aWUgZGV0YWlsc1xyXG4gICAgICBtb2NrU2VuZFxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgcm9vbVxyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICBQSzogcm9vbUlkLFxyXG4gICAgICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgICAgbmFtZTogJ0Jyb2FkY2FzdCBUZXN0IFJvb20nLFxyXG4gICAgICAgICAgICBob3N0SWQ6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgICAgICBzdGF0dXM6ICdBQ1RJVkUnLFxyXG4gICAgICAgICAgICBtZW1iZXJDb3VudDogMyxcclxuICAgICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IGNhY2hlZCBtb3ZpZXMgZm9yIG1vdmllIGRldGFpbHNcclxuICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgY2FjaGVLZXk6IHJvb21JZCxcclxuICAgICAgICAgICAgbW92aWVzOiBbXHJcbiAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdG1kYklkOiA1NTAsXHJcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0ZpZ2h0IENsdWInLFxyXG4gICAgICAgICAgICAgICAgcG9zdGVyUGF0aDogJ2h0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAvcG9zdGVyMS5qcGcnLFxyXG4gICAgICAgICAgICAgICAgb3ZlcnZpZXc6ICdBIG1vdmllIGFib3V0IGZpZ2h0aW5nJyxcclxuICAgICAgICAgICAgICAgIGdlbnJlczogWydBY3Rpb24nLCAnRHJhbWEnXSxcclxuICAgICAgICAgICAgICAgIHllYXI6IDE5OTksXHJcbiAgICAgICAgICAgICAgICByYXRpbmc6IDguOCxcclxuICAgICAgICAgICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgICAgICB0dGw6IERhdGUubm93KCkgKyAyNCAqIDYwICogNjAgKiAxMDAwLFxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIGdlbnJlRmlsdGVyczogW10sXHJcbiAgICAgICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgIHR0bDogRGF0ZS5ub3coKSArIDI0ICogNjAgKiA2MCAqIDEwMDAsXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgSXRlbTogbnVsbCB9KSAvLyBDaGVjayB2b3RlIGRvZXNuJ3QgZXhpc3RcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHt9KSAvLyBDcmVhdGUgdm90ZVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pIC8vIENyZWF0ZSB1c2VyIHZvdGUgdHJhY2tpbmdcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IHVwZGF0ZWQgdm90ZSBjb3VudFxyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgICAgbW92aWVJZDogbW92aWVJZCxcclxuICAgICAgICAgICAgdm90ZXM6IDEsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgcm9vbSBtZW1iZXJzIGZvciBicm9hZGNhc3RpbmdcclxuICAgICAgICAgIEl0ZW1zOiBbXHJcbiAgICAgICAgICAgIHsgXHJcbiAgICAgICAgICAgICAgUEs6ICd0ZXN0LWhvc3QtaWQnLCBcclxuICAgICAgICAgICAgICBTSzogcm9vbUlkLCBcclxuICAgICAgICAgICAgICB1c2VySWQ6ICd0ZXN0LWhvc3QtaWQnLCBcclxuICAgICAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgICAgICBkaXNwbGF5TmFtZTogJ0hvc3QgVXNlcicsXHJcbiAgICAgICAgICAgICAgam9pbmVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgeyBcclxuICAgICAgICAgICAgICBQSzogdXNlcklkLCBcclxuICAgICAgICAgICAgICBTSzogcm9vbUlkLCBcclxuICAgICAgICAgICAgICB1c2VySWQ6IHVzZXJJZCwgXHJcbiAgICAgICAgICAgICAgcm9vbUlkOiByb29tSWQsXHJcbiAgICAgICAgICAgICAgZGlzcGxheU5hbWU6ICdUZXN0IFVzZXInLFxyXG4gICAgICAgICAgICAgIGpvaW5lZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHsgXHJcbiAgICAgICAgICAgICAgUEs6ICd0ZXN0LXVzZXItMycsIFxyXG4gICAgICAgICAgICAgIFNLOiByb29tSWQsIFxyXG4gICAgICAgICAgICAgIHVzZXJJZDogJ3Rlc3QtdXNlci0zJywgXHJcbiAgICAgICAgICAgICAgcm9vbUlkOiByb29tSWQsXHJcbiAgICAgICAgICAgICAgZGlzcGxheU5hbWU6ICdVc2VyIFRocmVlJyxcclxuICAgICAgICAgICAgICBqb2luZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgXVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3Qgdm90ZUV2ZW50ID0ge1xyXG4gICAgICAgIGluZm86IHsgZmllbGROYW1lOiAnc3VibWl0Vm90ZScgfSxcclxuICAgICAgICBpZGVudGl0eTogeyBzdWI6IHVzZXJJZCB9LFxyXG4gICAgICAgIGFyZ3VtZW50czoge1xyXG4gICAgICAgICAgcm9vbUlkOiByb29tSWQsXHJcbiAgICAgICAgICBtb3ZpZUlkOiBtb3ZpZUlkLFxyXG4gICAgICAgICAgdm90ZVR5cGU6ICdMSUtFJyxcclxuICAgICAgICB9LFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3Qgdm90ZVJlc3VsdCA9IGF3YWl0IHZvdGVIYW5kbGVyKHZvdGVFdmVudCBhcyBhbnksIG1vY2tDb250ZXh0IGFzIGFueSwge30gYXMgYW55KTtcclxuXHJcbiAgICAgIGV4cGVjdCh2b3RlUmVzdWx0LnN1Y2Nlc3MpLnRvQmUodHJ1ZSk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgZGV0YWlsZWQgcmVhbC10aW1lIGJyb2FkY2FzdCB3YXMgc2VudFxyXG4gICAgICBleHBlY3QobW9ja1B1Ymxpc2gpLnRvSGF2ZUJlZW5DYWxsZWQoKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHB1Ymxpc2hDYWxscyA9IG1vY2tQdWJsaXNoLm1vY2suY2FsbHM7XHJcbiAgICAgIGNvbnN0IHZvdGVVcGRhdGVDYWxsID0gcHVibGlzaENhbGxzLmZpbmQoY2FsbCA9PiBcclxuICAgICAgICBjYWxsWzBdLnBhcmFtcyAmJiBjYWxsWzBdLnBhcmFtcy52YXJpYWJsZXMgJiYgY2FsbFswXS5wYXJhbXMudmFyaWFibGVzLnJvb21JZCA9PT0gcm9vbUlkXHJcbiAgICAgICk7XHJcbiAgICAgIFxyXG4gICAgICBleHBlY3Qodm90ZVVwZGF0ZUNhbGwpLnRvQmVEZWZpbmVkKCk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAodm90ZVVwZGF0ZUNhbGwpIHtcclxuICAgICAgICBjb25zdCB2YXJpYWJsZXMgPSB2b3RlVXBkYXRlQ2FsbFswXS5wYXJhbXMudmFyaWFibGVzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFZlcmlmeSB2b3RlIHByb2dyZXNzIGluZm9ybWF0aW9uXHJcbiAgICAgICAgZXhwZWN0KHZhcmlhYmxlcy52b3RlUHJvZ3Jlc3MpLnRvTWF0Y2hPYmplY3Qoe1xyXG4gICAgICAgICAgY3VycmVudFZvdGVzOiAxLFxyXG4gICAgICAgICAgdG90YWxNZW1iZXJzOiAzLFxyXG4gICAgICAgICAgdm90aW5nVXNlcnM6IGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW3VzZXJJZF0pLFxyXG4gICAgICAgICAgcGVuZGluZ1VzZXJzOiBleHBlY3QuYXJyYXlDb250YWluaW5nKFsndGVzdC1ob3N0LWlkJywgJ3Rlc3QtdXNlci0zJ10pLFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBWZXJpZnkgbW92aWUgaW5mb3JtYXRpb24gaXMgaW5jbHVkZWRcclxuICAgICAgICBleHBlY3QodmFyaWFibGVzLm1vdmllSW5mbykudG9NYXRjaE9iamVjdCh7XHJcbiAgICAgICAgICB0bWRiSWQ6IDU1MCxcclxuICAgICAgICAgIHRpdGxlOiAnRmlnaHQgQ2x1YicsXHJcbiAgICAgICAgICBnZW5yZXM6IFsnQWN0aW9uJywgJ0RyYW1hJ10sXHJcbiAgICAgICAgICB5ZWFyOiAxOTk5LFxyXG4gICAgICAgICAgcmF0aW5nOiA4LjgsXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgYnJvYWRjYXN0IG1hdGNoIGZvdW5kIG5vdGlmaWNhdGlvbnMgd2l0aCBwYXJ0aWNpcGFudCBkZXRhaWxzJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLW1hdGNoJztcclxuICAgICAgY29uc3QgbW92aWVJZCA9ICc1NTAnO1xyXG4gICAgICBjb25zdCB1c2VycyA9IFsndXNlci0xJywgJ3VzZXItMicsICd1c2VyLTMnXTtcclxuXHJcbiAgICAgIC8vIE1vY2sgdW5hbmltb3VzIHZvdGluZyBzY2VuYXJpb1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHVzZXJzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgdXNlcklkID0gdXNlcnNbaV07XHJcbiAgICAgICAgY29uc3QgaXNMYXN0Vm90ZSA9IGkgPT09IHVzZXJzLmxlbmd0aCAtIDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbW9ja1NlbmRcclxuICAgICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgcm9vbVxyXG4gICAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgICAgUEs6IHJvb21JZCxcclxuICAgICAgICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICAgIG5hbWU6ICdNYXRjaCBUZXN0IFJvb20nLFxyXG4gICAgICAgICAgICAgIGhvc3RJZDogdXNlcnNbMF0sXHJcbiAgICAgICAgICAgICAgc3RhdHVzOiAnQUNUSVZFJyxcclxuICAgICAgICAgICAgICBtZW1iZXJDb3VudDogdXNlcnMubGVuZ3RoLFxyXG4gICAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IC8vIEdldCBjYWNoZWQgbW92aWVzXHJcbiAgICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgICBjYWNoZUtleTogcm9vbUlkLFxyXG4gICAgICAgICAgICAgIG1vdmllczogW1xyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICB0bWRiSWQ6IDU1MCxcclxuICAgICAgICAgICAgICAgICAgdGl0bGU6ICdGaWdodCBDbHViJyxcclxuICAgICAgICAgICAgICAgICAgcG9zdGVyUGF0aDogJ2h0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAvcG9zdGVyMS5qcGcnLFxyXG4gICAgICAgICAgICAgICAgICBvdmVydmlldzogJ0EgbW92aWUgYWJvdXQgZmlnaHRpbmcnLFxyXG4gICAgICAgICAgICAgICAgICBnZW5yZXM6IFsnQWN0aW9uJywgJ0RyYW1hJ10sXHJcbiAgICAgICAgICAgICAgICAgIHllYXI6IDE5OTksXHJcbiAgICAgICAgICAgICAgICAgIHJhdGluZzogOC44LFxyXG4gICAgICAgICAgICAgICAgICBjYWNoZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgICAgICB0dGw6IERhdGUubm93KCkgKyAyNCAqIDYwICogNjAgKiAxMDAwLFxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICAgIGdlbnJlRmlsdGVyczogW10sXHJcbiAgICAgICAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICB0dGw6IERhdGUubm93KCkgKyAyNCAqIDYwICogNjAgKiAxMDAwLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IEl0ZW06IG51bGwgfSkgLy8gQ2hlY2sgdm90ZSBkb2Vzbid0IGV4aXN0XHJcbiAgICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHt9KSAvLyBDcmVhdGUgdm90ZVxyXG4gICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSkgLy8gQ3JlYXRlIHVzZXIgdm90ZSB0cmFja2luZ1xyXG4gICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IC8vIEdldCB1cGRhdGVkIHZvdGUgY291bnRcclxuICAgICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICAgIG1vdmllSWQ6IG1vdmllSWQsXHJcbiAgICAgICAgICAgICAgdm90ZXM6IGkgKyAxLFxyXG4gICAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IC8vIEdldCByb29tIG1lbWJlcnNcclxuICAgICAgICAgICAgSXRlbXM6IHVzZXJzLm1hcCh1aWQgPT4gKHtcclxuICAgICAgICAgICAgICBQSzogdWlkLFxyXG4gICAgICAgICAgICAgIFNLOiByb29tSWQsXHJcbiAgICAgICAgICAgICAgdXNlcklkOiB1aWQsXHJcbiAgICAgICAgICAgICAgcm9vbUlkOiByb29tSWQsXHJcbiAgICAgICAgICAgICAgZGlzcGxheU5hbWU6IGBVc2VyICR7dWlkfWAsXHJcbiAgICAgICAgICAgICAgam9pbmVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgfSkpXHJcbiAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgaWYgKGlzTGFzdFZvdGUpIHtcclxuICAgICAgICAgIC8vIE1vY2sgcm9vbSBzdGF0dXMgdXBkYXRlIHRvIE1BVENIRURcclxuICAgICAgICAgIG1vY2tTZW5kLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSk7IC8vIFVwZGF0ZSByb29tIHN0YXR1c1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgdm90ZUV2ZW50ID0ge1xyXG4gICAgICAgICAgaW5mbzogeyBmaWVsZE5hbWU6ICdzdWJtaXRWb3RlJyB9LFxyXG4gICAgICAgICAgaWRlbnRpdHk6IHsgc3ViOiB1c2VySWQgfSxcclxuICAgICAgICAgIGFyZ3VtZW50czoge1xyXG4gICAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgICAgbW92aWVJZDogbW92aWVJZCxcclxuICAgICAgICAgICAgdm90ZVR5cGU6ICdMSUtFJyxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3Qgdm90ZVJlc3VsdCA9IGF3YWl0IHZvdGVIYW5kbGVyKHZvdGVFdmVudCBhcyBhbnksIG1vY2tDb250ZXh0IGFzIGFueSwge30gYXMgYW55KTtcclxuXHJcbiAgICAgICAgZXhwZWN0KHZvdGVSZXN1bHQuc3VjY2VzcykudG9CZSh0cnVlKTtcclxuICAgICAgICBleHBlY3Qodm90ZVJlc3VsdC5jdXJyZW50Vm90ZXMpLnRvQmUoaSArIDEpO1xyXG5cclxuICAgICAgICBpZiAoaXNMYXN0Vm90ZSkge1xyXG4gICAgICAgICAgLy8gVmVyaWZ5IG1hdGNoIHdhcyBmb3VuZFxyXG4gICAgICAgICAgZXhwZWN0KHZvdGVSZXN1bHQubWF0Y2hGb3VuZCkudG9CZSh0cnVlKTtcclxuICAgICAgICAgIGV4cGVjdCh2b3RlUmVzdWx0LnJvb21TdGF0dXMpLnRvQmUoJ01BVENIRUQnKTtcclxuXHJcbiAgICAgICAgICAvLyBWZXJpZnkgbWF0Y2ggbm90aWZpY2F0aW9uIHdhcyBicm9hZGNhc3RcclxuICAgICAgICAgIGNvbnN0IG1hdGNoTm90aWZpY2F0aW9uQ2FsbCA9IG1vY2tQdWJsaXNoLm1vY2suY2FsbHMuZmluZChjYWxsID0+IFxyXG4gICAgICAgICAgICBjYWxsWzBdLnBhcmFtcyAmJiBjYWxsWzBdLnBhcmFtcy5xdWVyeSAmJiBjYWxsWzBdLnBhcmFtcy5xdWVyeS5pbmNsdWRlcygnTWF0Y2hGb3VuZCcpXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBleHBlY3QobWF0Y2hOb3RpZmljYXRpb25DYWxsKS50b0JlRGVmaW5lZCgpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBpZiAobWF0Y2hOb3RpZmljYXRpb25DYWxsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHZhcmlhYmxlcyA9IG1hdGNoTm90aWZpY2F0aW9uQ2FsbFswXS5wYXJhbXMudmFyaWFibGVzO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gVmVyaWZ5IG1hdGNoIGRldGFpbHNcclxuICAgICAgICAgICAgZXhwZWN0KHZhcmlhYmxlcy5tYXRjaERldGFpbHMpLnRvTWF0Y2hPYmplY3Qoe1xyXG4gICAgICAgICAgICAgIG1vdmllSWQ6IG1vdmllSWQsXHJcbiAgICAgICAgICAgICAgbW92aWVUaXRsZTogJ0ZpZ2h0IENsdWInLFxyXG4gICAgICAgICAgICAgIHZvdGluZ0R1cmF0aW9uOiBleHBlY3QuYW55KE51bWJlciksXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gVmVyaWZ5IHBhcnRpY2lwYW50IGluZm9ybWF0aW9uXHJcbiAgICAgICAgICAgIGV4cGVjdCh2YXJpYWJsZXMucGFydGljaXBhbnRzKS50b0hhdmVMZW5ndGgodXNlcnMubGVuZ3RoKTtcclxuICAgICAgICAgICAgdmFyaWFibGVzLnBhcnRpY2lwYW50cy5mb3JFYWNoKChwYXJ0aWNpcGFudDogYW55KSA9PiB7XHJcbiAgICAgICAgICAgICAgZXhwZWN0KHBhcnRpY2lwYW50KS50b01hdGNoT2JqZWN0KHtcclxuICAgICAgICAgICAgICAgIHVzZXJJZDogZXhwZWN0LmFueShTdHJpbmcpLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheU5hbWU6IGV4cGVjdC5hbnkoU3RyaW5nKSxcclxuICAgICAgICAgICAgICAgIHZvdGluZ1N0YXR1czogJ1ZPVEVEX1lFUycsXHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgY29ubmVjdGlvbiBzdGF0dXMgbW9uaXRvcmluZyBkdXJpbmcgdm90aW5nJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLWNvbm5lY3Rpb24nO1xyXG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLWNvbm5lY3Rpb24nO1xyXG5cclxuICAgICAgLy8gTW9jayB2b3RlIHByb2Nlc3Npbmcgd2l0aCBjb25uZWN0aW9uIG1vbml0b3JpbmdcclxuICAgICAgbW9ja1NlbmRcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IHJvb21cclxuICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgUEs6IHJvb21JZCxcclxuICAgICAgICAgICAgU0s6ICdST09NJyxcclxuICAgICAgICAgICAgcm9vbUlkOiByb29tSWQsXHJcbiAgICAgICAgICAgIG5hbWU6ICdDb25uZWN0aW9uIFRlc3QgUm9vbScsXHJcbiAgICAgICAgICAgIGhvc3RJZDogJ3Rlc3QtaG9zdC1pZCcsXHJcbiAgICAgICAgICAgIHN0YXR1czogJ0FDVElWRScsXHJcbiAgICAgICAgICAgIG1lbWJlckNvdW50OiAyLFxyXG4gICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgY2FjaGVkIG1vdmllc1xyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICBjYWNoZUtleTogcm9vbUlkLFxyXG4gICAgICAgICAgICBtb3ZpZXM6IFtcclxuICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0bWRiSWQ6IDU1MCxcclxuICAgICAgICAgICAgICAgIHRpdGxlOiAnRmlnaHQgQ2x1YicsXHJcbiAgICAgICAgICAgICAgICBwb3N0ZXJQYXRoOiAnaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMC9wb3N0ZXIxLmpwZycsXHJcbiAgICAgICAgICAgICAgICBvdmVydmlldzogJ0EgbW92aWUgYWJvdXQgZmlnaHRpbmcnLFxyXG4gICAgICAgICAgICAgICAgZ2VucmVzOiBbJ0FjdGlvbicsICdEcmFtYSddLFxyXG4gICAgICAgICAgICAgICAgeWVhcjogMTk5OSxcclxuICAgICAgICAgICAgICAgIHJhdGluZzogOC44LFxyXG4gICAgICAgICAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICAgIHR0bDogRGF0ZS5ub3coKSArIDI0ICogNjAgKiA2MCAqIDEwMDAsXHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgZ2VucmVGaWx0ZXJzOiBbXSxcclxuICAgICAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgdHRsOiBEYXRlLm5vdygpICsgMjQgKiA2MCAqIDYwICogMTAwMCxcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIENoZWNrIHZvdGUgZG9lc24ndCBleGlzdFxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pIC8vIENyZWF0ZSB2b3RlXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSkgLy8gQ3JlYXRlIHVzZXIgdm90ZSB0cmFja2luZ1xyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgdXBkYXRlZCB2b3RlIGNvdW50XHJcbiAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICBtb3ZpZUlkOiAnNTUwJyxcclxuICAgICAgICAgICAgdm90ZXM6IDEsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgcm9vbSBtZW1iZXJzIHdpdGggY29ubmVjdGlvbiBzdGF0dXNcclxuICAgICAgICAgIEl0ZW1zOiBbXHJcbiAgICAgICAgICAgIHsgXHJcbiAgICAgICAgICAgICAgUEs6ICd0ZXN0LWhvc3QtaWQnLCBcclxuICAgICAgICAgICAgICBTSzogcm9vbUlkLCBcclxuICAgICAgICAgICAgICB1c2VySWQ6ICd0ZXN0LWhvc3QtaWQnLCBcclxuICAgICAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgICAgICBkaXNwbGF5TmFtZTogJ0hvc3QgVXNlcicsXHJcbiAgICAgICAgICAgICAgY29ubmVjdGlvblN0YXR1czogJ0NPTk5FQ1RFRCcsXHJcbiAgICAgICAgICAgICAgbGFzdFNlZW46IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgeyBcclxuICAgICAgICAgICAgICBQSzogdXNlcklkLCBcclxuICAgICAgICAgICAgICBTSzogcm9vbUlkLCBcclxuICAgICAgICAgICAgICB1c2VySWQ6IHVzZXJJZCwgXHJcbiAgICAgICAgICAgICAgcm9vbUlkOiByb29tSWQsXHJcbiAgICAgICAgICAgICAgZGlzcGxheU5hbWU6ICdUZXN0IFVzZXInLFxyXG4gICAgICAgICAgICAgIGNvbm5lY3Rpb25TdGF0dXM6ICdDT05ORUNURUQnLFxyXG4gICAgICAgICAgICAgIGxhc3RTZWVuOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCB2b3RlRXZlbnQgPSB7XHJcbiAgICAgICAgaW5mbzogeyBmaWVsZE5hbWU6ICdzdWJtaXRWb3RlJyB9LFxyXG4gICAgICAgIGlkZW50aXR5OiB7IHN1YjogdXNlcklkIH0sXHJcbiAgICAgICAgYXJndW1lbnRzOiB7XHJcbiAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgIG1vdmllSWQ6ICc1NTAnLFxyXG4gICAgICAgICAgdm90ZVR5cGU6ICdMSUtFJyxcclxuICAgICAgICB9LFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3Qgdm90ZVJlc3VsdCA9IGF3YWl0IHZvdGVIYW5kbGVyKHZvdGVFdmVudCBhcyBhbnksIG1vY2tDb250ZXh0IGFzIGFueSwge30gYXMgYW55KTtcclxuXHJcbiAgICAgIGV4cGVjdCh2b3RlUmVzdWx0LnN1Y2Nlc3MpLnRvQmUodHJ1ZSk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgY29ubmVjdGlvbiBzdGF0dXMgd2FzIGluY2x1ZGVkIGluIGJyb2FkY2FzdFxyXG4gICAgICBjb25zdCBwdWJsaXNoQ2FsbHMgPSBtb2NrUHVibGlzaC5tb2NrLmNhbGxzO1xyXG4gICAgICBjb25zdCB2b3RlVXBkYXRlQ2FsbCA9IHB1Ymxpc2hDYWxscy5maW5kKGNhbGwgPT4gXHJcbiAgICAgICAgY2FsbFswXS5wYXJhbXMgJiYgY2FsbFswXS5wYXJhbXMudmFyaWFibGVzICYmIGNhbGxbMF0ucGFyYW1zLnZhcmlhYmxlcy5yb29tSWQgPT09IHJvb21JZFxyXG4gICAgICApO1xyXG4gICAgICBcclxuICAgICAgZXhwZWN0KHZvdGVVcGRhdGVDYWxsKS50b0JlRGVmaW5lZCgpO1xyXG4gICAgICBcclxuICAgICAgaWYgKHZvdGVVcGRhdGVDYWxsKSB7XHJcbiAgICAgICAgY29uc3QgdmFyaWFibGVzID0gdm90ZVVwZGF0ZUNhbGxbMF0ucGFyYW1zLnZhcmlhYmxlcztcclxuICAgICAgICBcclxuICAgICAgICAvLyBWZXJpZnkgY29ubmVjdGlvbiBzdGF0dXMgaW5mb3JtYXRpb25cclxuICAgICAgICBleHBlY3QodmFyaWFibGVzLmNvbm5lY3Rpb25TdGF0dXMpLnRvTWF0Y2hPYmplY3Qoe1xyXG4gICAgICAgICAgY29ubmVjdGVkVXNlcnM6IGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoWyd0ZXN0LWhvc3QtaWQnLCB1c2VySWRdKSxcclxuICAgICAgICAgIHRvdGFsQ29ubmVjdGlvbnM6IDIsXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH0pO1xyXG5cclxuICBkZXNjcmliZSgnQ2FjaGUgUGVyZm9ybWFuY2UgYW5kIE9wdGltaXphdGlvbicsICgpID0+IHtcclxuICAgIGl0KCdzaG91bGQgb3B0aW1pemUgY2FjaGUgcGVyZm9ybWFuY2UgZHVyaW5nIGhpZ2gtZnJlcXVlbmN5IHZvdGluZycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbS1wZXJmb3JtYW5jZSc7XHJcbiAgICAgIGNvbnN0IG1vdmllSWQgPSAnNTUwJztcclxuICAgICAgY29uc3QgdXNlcnMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMCB9LCAoXywgaSkgPT4gYHVzZXItJHtpfWApO1xyXG5cclxuICAgICAgLy8gTW9jayBoaWdoLXBlcmZvcm1hbmNlIGNhY2hlIHNjZW5hcmlvXHJcbiAgICAgIG1vY2tTZW5kXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlKHsgLy8gRGVmYXVsdCByb29tIHJlc3BvbnNlXHJcbiAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgIFBLOiByb29tSWQsXHJcbiAgICAgICAgICAgIFNLOiAnUk9PTScsXHJcbiAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICBuYW1lOiAnUGVyZm9ybWFuY2UgVGVzdCBSb29tJyxcclxuICAgICAgICAgICAgaG9zdElkOiB1c2Vyc1swXSxcclxuICAgICAgICAgICAgc3RhdHVzOiAnQUNUSVZFJyxcclxuICAgICAgICAgICAgbWVtYmVyQ291bnQ6IHVzZXJzLmxlbmd0aCxcclxuICAgICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBNb2NrIGNhY2hlZCBtb3ZpZXMgKHNob3VsZCBiZSByZXVzZWQgYWNyb3NzIHZvdGVzKVxyXG4gICAgICBjb25zdCBjYWNoZWRNb3ZpZXNSZXNwb25zZSA9IHtcclxuICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICBjYWNoZUtleTogcm9vbUlkLFxyXG4gICAgICAgICAgbW92aWVzOiBbXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICB0bWRiSWQ6IDU1MCxcclxuICAgICAgICAgICAgICB0aXRsZTogJ0ZpZ2h0IENsdWInLFxyXG4gICAgICAgICAgICAgIHBvc3RlclBhdGg6ICdodHRwczovL2ltYWdlLnRtZGIub3JnL3QvcC93NTAwL3Bvc3RlcjEuanBnJyxcclxuICAgICAgICAgICAgICBvdmVydmlldzogJ0EgbW92aWUgYWJvdXQgZmlnaHRpbmcnLFxyXG4gICAgICAgICAgICAgIGdlbnJlczogWydBY3Rpb24nLCAnRHJhbWEnXSxcclxuICAgICAgICAgICAgICB5ZWFyOiAxOTk5LFxyXG4gICAgICAgICAgICAgIHJhdGluZzogOC44LFxyXG4gICAgICAgICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgICAgdHRsOiBEYXRlLm5vdygpICsgMjQgKiA2MCAqIDYwICogMTAwMCxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIF0sXHJcbiAgICAgICAgICBnZW5yZUZpbHRlcnM6IFtdLFxyXG4gICAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIHR0bDogRGF0ZS5ub3coKSArIDI0ICogNjAgKiA2MCAqIDEwMDAsXHJcbiAgICAgICAgfVxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcclxuXHJcbiAgICAgIC8vIFNpbXVsYXRlIHJhcGlkIHZvdGluZyBmcm9tIG11bHRpcGxlIHVzZXJzXHJcbiAgICAgIGNvbnN0IHZvdGVQcm9taXNlcyA9IHVzZXJzLm1hcChhc3luYyAodXNlcklkLCBpbmRleCkgPT4ge1xyXG4gICAgICAgIC8vIFNldHVwIG1vY2tzIGZvciBlYWNoIHZvdGVcclxuICAgICAgICBtb2NrU2VuZFxyXG4gICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZShjYWNoZWRNb3ZpZXNSZXNwb25zZSkgLy8gR2V0IGNhY2hlZCBtb3ZpZXNcclxuICAgICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIENoZWNrIHZvdGUgZG9lc24ndCBleGlzdFxyXG4gICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSkgLy8gQ3JlYXRlIHZvdGVcclxuICAgICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pIC8vIENyZWF0ZSB1c2VyIHZvdGUgdHJhY2tpbmdcclxuICAgICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgdXBkYXRlZCB2b3RlIGNvdW50XHJcbiAgICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgICAgICBtb3ZpZUlkOiBtb3ZpZUlkLFxyXG4gICAgICAgICAgICAgIHZvdGVzOiBpbmRleCArIDEsXHJcbiAgICAgICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IHJvb20gbWVtYmVyc1xyXG4gICAgICAgICAgICBJdGVtczogdXNlcnMuc2xpY2UoMCwgaW5kZXggKyAxKS5tYXAodWlkID0+ICh7XHJcbiAgICAgICAgICAgICAgUEs6IHVpZCxcclxuICAgICAgICAgICAgICBTSzogcm9vbUlkLFxyXG4gICAgICAgICAgICAgIHVzZXJJZDogdWlkLFxyXG4gICAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICAgIGRpc3BsYXlOYW1lOiBgVXNlciAke3VpZH1gLFxyXG4gICAgICAgICAgICB9KSlcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCB2b3RlRXZlbnQgPSB7XHJcbiAgICAgICAgICBpbmZvOiB7IGZpZWxkTmFtZTogJ3N1Ym1pdFZvdGUnIH0sXHJcbiAgICAgICAgICBpZGVudGl0eTogeyBzdWI6IHVzZXJJZCB9LFxyXG4gICAgICAgICAgYXJndW1lbnRzOiB7XHJcbiAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICBtb3ZpZUlkOiBtb3ZpZUlkLFxyXG4gICAgICAgICAgICB2b3RlVHlwZTogJ0xJS0UnLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICByZXR1cm4gdm90ZUhhbmRsZXIodm90ZUV2ZW50IGFzIGFueSwgbW9ja0NvbnRleHQgYXMgYW55LCB7fSBhcyBhbnkpO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbCh2b3RlUHJvbWlzZXMpO1xyXG4gICAgICBjb25zdCBleGVjdXRpb25UaW1lID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBwZXJmb3JtYW5jZSAoc2hvdWxkIGNvbXBsZXRlIHdpdGhpbiByZWFzb25hYmxlIHRpbWUpXHJcbiAgICAgIGV4cGVjdChleGVjdXRpb25UaW1lKS50b0JlTGVzc1RoYW4oNTAwMCk7IC8vIDUgc2Vjb25kcyBmb3IgMTAgY29uY3VycmVudCB2b3Rlc1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IGFsbCB2b3RlcyB3ZXJlIHByb2Nlc3NlZCBzdWNjZXNzZnVsbHlcclxuICAgICAgcmVzdWx0cy5mb3JFYWNoKChyZXN1bHQsIGluZGV4KSA9PiB7XHJcbiAgICAgICAgZXhwZWN0KHJlc3VsdC5zdWNjZXNzKS50b0JlKHRydWUpO1xyXG4gICAgICAgIGV4cGVjdChyZXN1bHQuY3VycmVudFZvdGVzKS50b0JlKGluZGV4ICsgMSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IGNhY2hlIHdhcyBlZmZpY2llbnRseSByZXVzZWQgKG5vIFRNREIgQVBJIGNhbGxzKVxyXG4gICAgICBleHBlY3QobW9ja0ZldGNoKS5ub3QudG9IYXZlQmVlbkNhbGxlZCgpO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IHJlYWwtdGltZSB1cGRhdGVzIHdlcmUgc2VudCBmb3IgYWxsIHZvdGVzXHJcbiAgICAgIGV4cGVjdChtb2NrUHVibGlzaCkudG9IYXZlQmVlbkNhbGxlZFRpbWVzKHVzZXJzLmxlbmd0aCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBjYWNoZSBUVEwgZXhwaXJhdGlvbiBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLXR0bCc7XHJcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItdHRsJztcclxuXHJcbiAgICAgIC8vIE1vY2sgZXhwaXJlZCBjYWNoZSBzY2VuYXJpb1xyXG4gICAgICBtb2NrU2VuZFxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgcm9vbVxyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICBQSzogcm9vbUlkLFxyXG4gICAgICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgICAgbmFtZTogJ1RUTCBUZXN0IFJvb20nLFxyXG4gICAgICAgICAgICBob3N0SWQ6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgICAgICBzdGF0dXM6ICdBQ1RJVkUnLFxyXG4gICAgICAgICAgICBtZW1iZXJDb3VudDogMixcclxuICAgICAgICAgICAgZ2VucmVQcmVmZXJlbmNlczogWydBY3Rpb24nXSxcclxuICAgICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IGV4cGlyZWQgY2FjaGVcclxuICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgY2FjaGVLZXk6IHJvb21JZCxcclxuICAgICAgICAgICAgbW92aWVzOiBbXHJcbiAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdG1kYklkOiA1NTAsXHJcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0ZpZ2h0IENsdWInLFxyXG4gICAgICAgICAgICAgICAgcG9zdGVyUGF0aDogJ2h0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAvcG9zdGVyMS5qcGcnLFxyXG4gICAgICAgICAgICAgICAgb3ZlcnZpZXc6ICdBIG1vdmllIGFib3V0IGZpZ2h0aW5nJyxcclxuICAgICAgICAgICAgICAgIGdlbnJlczogWydBY3Rpb24nLCAnRHJhbWEnXSxcclxuICAgICAgICAgICAgICAgIHllYXI6IDE5OTksXHJcbiAgICAgICAgICAgICAgICByYXRpbmc6IDguOCxcclxuICAgICAgICAgICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZShEYXRlLm5vdygpIC0gMjUgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSwgLy8gMjUgaG91cnMgYWdvXHJcbiAgICAgICAgICAgICAgICB0dGw6IERhdGUubm93KCkgLSA2MCAqIDYwICogMTAwMCwgLy8gRXhwaXJlZCAxIGhvdXIgYWdvXHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgZ2VucmVGaWx0ZXJzOiBbJ0FjdGlvbiddLFxyXG4gICAgICAgICAgICBjYWNoZWRBdDogbmV3IERhdGUoRGF0ZS5ub3coKSAtIDI1ICogNjAgKiA2MCAqIDEwMDApLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgIHR0bDogRGF0ZS5ub3coKSAtIDYwICogNjAgKiAxMDAwLCAvLyBFeHBpcmVkXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHt9KSAvLyBSZWZyZXNoIGNhY2hlIHdpdGggbmV3IG1vdmllc1xyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIENoZWNrIHZvdGUgZG9lc24ndCBleGlzdFxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pIC8vIENyZWF0ZSB2b3RlXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSkgLy8gQ3JlYXRlIHVzZXIgdm90ZSB0cmFja2luZ1xyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgdXBkYXRlZCB2b3RlIGNvdW50XHJcbiAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICBtb3ZpZUlkOiAnNTUxJyxcclxuICAgICAgICAgICAgdm90ZXM6IDEsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgcm9vbSBtZW1iZXJzXHJcbiAgICAgICAgICBJdGVtczogW1xyXG4gICAgICAgICAgICB7IFBLOiAndGVzdC1ob3N0LWlkJywgU0s6IHJvb21JZCwgdXNlcklkOiAndGVzdC1ob3N0LWlkJywgcm9vbUlkOiByb29tSWQgfSxcclxuICAgICAgICAgICAgeyBQSzogdXNlcklkLCBTSzogcm9vbUlkLCB1c2VySWQ6IHVzZXJJZCwgcm9vbUlkOiByb29tSWQgfSxcclxuICAgICAgICAgIF1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgIC8vIE1vY2sgVE1EQiBBUEkgY2FsbCBmb3IgY2FjaGUgcmVmcmVzaFxyXG4gICAgICBtb2NrRmV0Y2gubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHtcclxuICAgICAgICBvazogdHJ1ZSxcclxuICAgICAgICBqc29uOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoe1xyXG4gICAgICAgICAgcmVzdWx0czogW1xyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgaWQ6IDU1MSxcclxuICAgICAgICAgICAgICB0aXRsZTogJ1RoZSBNYXRyaXggUmVsb2FkZWQnLFxyXG4gICAgICAgICAgICAgIHBvc3Rlcl9wYXRoOiAnL3Bvc3RlcjIuanBnJyxcclxuICAgICAgICAgICAgICBvdmVydmlldzogJ1RoZSBzZXF1ZWwgdG8gVGhlIE1hdHJpeCcsXHJcbiAgICAgICAgICAgICAgZ2VucmVfaWRzOiBbMjgsIDg3OF0sIC8vIEFjdGlvbiwgU2NpLUZpXHJcbiAgICAgICAgICAgICAgcmVsZWFzZV9kYXRlOiAnMjAwMy0wNS0xNScsXHJcbiAgICAgICAgICAgICAgdm90ZV9hdmVyYWdlOiA3LjIsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgICAgdG90YWxfcmVzdWx0czogMSxcclxuICAgICAgICB9KSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCB2b3RlRXZlbnQgPSB7XHJcbiAgICAgICAgaW5mbzogeyBmaWVsZE5hbWU6ICdzdWJtaXRWb3RlJyB9LFxyXG4gICAgICAgIGlkZW50aXR5OiB7IHN1YjogdXNlcklkIH0sXHJcbiAgICAgICAgYXJndW1lbnRzOiB7XHJcbiAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgIG1vdmllSWQ6ICc1NTEnLFxyXG4gICAgICAgICAgdm90ZVR5cGU6ICdMSUtFJyxcclxuICAgICAgICB9LFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3Qgdm90ZVJlc3VsdCA9IGF3YWl0IHZvdGVIYW5kbGVyKHZvdGVFdmVudCBhcyBhbnksIG1vY2tDb250ZXh0IGFzIGFueSwge30gYXMgYW55KTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSB2b3RlIHdhcyBwcm9jZXNzZWQgd2l0aCByZWZyZXNoZWQgY2FjaGVcclxuICAgICAgZXhwZWN0KHZvdGVSZXN1bHQuc3VjY2VzcykudG9CZSh0cnVlKTtcclxuICAgICAgZXhwZWN0KHZvdGVSZXN1bHQuY3VycmVudFZvdGVzKS50b0JlKDEpO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IFRNREIgQVBJIHdhcyBjYWxsZWQgdG8gcmVmcmVzaCBleHBpcmVkIGNhY2hlXHJcbiAgICAgIGV4cGVjdChtb2NrRmV0Y2gpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxyXG4gICAgICAgIGV4cGVjdC5zdHJpbmdDb250YWluaW5nKCdhcGkudGhlbW92aWVkYi5vcmcnKSxcclxuICAgICAgICBleHBlY3QuYW55KE9iamVjdClcclxuICAgICAgKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBjYWNoZSB3YXMgdXBkYXRlZCB3aXRoIGZyZXNoIFRUTFxyXG4gICAgICBjb25zdCBjYWNoZVVwZGF0ZUNhbGxzID0gbW9ja1NlbmQubW9jay5jYWxscy5maWx0ZXIoY2FsbCA9PiBcclxuICAgICAgICBjYWxsWzBdLnBhcmFtcyAmJiBjYWxsWzBdLnBhcmFtcy5UYWJsZU5hbWUgPT09ICd0ZXN0LW1vdmllLWNhY2hlLXRhYmxlJyAmJiBcclxuICAgICAgICBjYWxsWzBdLnBhcmFtcy5JdGVtXHJcbiAgICAgICk7XHJcbiAgICAgIGV4cGVjdChjYWNoZVVwZGF0ZUNhbGxzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbn0pOyJdfQ==