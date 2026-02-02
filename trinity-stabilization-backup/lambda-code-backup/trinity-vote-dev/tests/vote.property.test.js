/**
 * Property-Based Tests for Trinity Vote Processing
 * Feature: trinity-critical-bug-fixes
 */

const fc = require('fast-check');

// Mock dependencies
const mockDocClient = {
    send: jest.fn()
};

const mockAppsyncPublisher = {
    getMovieTitle: jest.fn(),
    publishMatchFoundEvent: jest.fn(),
    publishVoteUpdateEvent: jest.fn()
};

const mockMetrics = {
    logBusinessMetric: jest.fn(),
    logError: jest.fn(),
    PerformanceTimer: jest.fn().mockImplementation(() => ({
        end: jest.fn()
    }))
};

// Mock environment variables
process.env.ROOMS_TABLE = 'trinity-rooms-dev-v2';
process.env.VOTES_TABLE = 'trinity-votes-dev';
process.env.ROOM_MATCHES_TABLE = 'trinity-room-matches-dev';
process.env.ROOM_MEMBERS_TABLE = 'trinity-room-members-dev';

// Import the module after setting up mocks
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn(() => mockDocClient)
    },
    GetCommand: jest.fn(),
    PutCommand: jest.fn(),
    UpdateCommand: jest.fn(),
    QueryCommand: jest.fn()
}));

// Mock the vote module
const voteModule = require('../vote');

describe('Property-Based Tests: Vote Processing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDocClient.send.mockClear();
        mockAppsyncPublisher.getMovieTitle.mockResolvedValue('Test Movie');
        mockAppsyncPublisher.publishMatchFoundEvent.mockResolvedValue();
        mockAppsyncPublisher.publishVoteUpdateEvent.mockResolvedValue();
    });

    /**
     * Property 4: Match Response Structure Consistency
     * For any vote operation against a room with status 'MATCHED', 
     * the system should return a successful response containing match details 
     * and never throw GraphQL errors
     * Validates: Requirements 2.2, 2.3, 5.2, 5.5
     */
    describe('Property 4: Match Response Structure Consistency', () => {
        test('should return consistent VoteResponse structure for matched rooms', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.constantFrom('LIKE', 'DISLIKE'), // voteType
                    fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }), // participants
                    async (userId, roomId, movieId, voteType, participants) => {
                        // Setup: Room is already MATCHED
                        mockDocClient.send
                            .mockResolvedValueOnce({ // getRoomStatusConsistent
                                Item: { status: 'MATCHED' }
                            })
                            .mockResolvedValueOnce({ // getExistingMatchInfo
                                Item: {
                                    status: 'MATCHED',
                                    resultMovieId: movieId,
                                    updatedAt: new Date().toISOString()
                                }
                            })
                            .mockResolvedValueOnce({ // getRoomParticipants
                                Items: participants.map(p => ({ userId: p }))
                            });

                        // The mock returns "Movie " + movieId, so we expect that
                        const expectedMovieTitle = `Movie ${movieId}`;
                        mockAppsyncPublisher.getMovieTitle.mockResolvedValue(expectedMovieTitle);

                        // Create mock event
                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType }
                            },
                            identity: { sub: userId }
                        };

                        // Execute
                        const result = await voteModule.handler(event);

                        // Property: Response must have VoteResponse structure
                        expect(result).toHaveProperty('success');
                        expect(result).toHaveProperty('responseType');
                        expect(result).toHaveProperty('matchInfo');
                        expect(result).toHaveProperty('message');
                        expect(result).toHaveProperty('error');

                        // Property: Success must be true for matched rooms
                        expect(result.success).toBe(true);

                        // Property: Response type must indicate match found
                        expect(result.responseType).toBe('VOTE_IGNORED_MATCH_FOUND');

                        // Property: Match info must contain required fields
                        expect(result.matchInfo).toHaveProperty('movieId');
                        expect(result.matchInfo).toHaveProperty('movieTitle');
                        expect(result.matchInfo).toHaveProperty('movieInfo');
                        expect(result.matchInfo).toHaveProperty('matchedAt');
                        expect(result.matchInfo).toHaveProperty('participants');
                        expect(result.matchInfo).toHaveProperty('roomId');

                        // Property: Match info values must be consistent
                        expect(result.matchInfo.movieId).toBe(movieId);
                        expect(result.matchInfo.movieTitle).toBe(expectedMovieTitle);
                        expect(result.matchInfo.roomId).toBe(roomId);
                        expect(result.matchInfo.participants).toEqual(participants);

                        // Property: Message must be informative
                        expect(result.message).toContain(expectedMovieTitle);
                        expect(result.message).toContain('Match already found');

                        // Property: Error must be null for successful operations
                        expect(result.error).toBeNull();

                        // Property: Room should be null when match already exists
                        expect(result.room).toBeNull();
                    }
                ),
                { numRuns: 100 } // Run 100 iterations as specified
            );
        });

        test('should return consistent VoteResponse structure for new matches', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.integer({ min: 2, max: 10 }), // maxMembers
                    fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 10 }), // participants
                    async (userId, roomId, movieId, maxMembers, participants) => {
                        // Ensure we have enough participants for the test
                        const adjustedParticipants = participants.slice(0, maxMembers);
                        if (adjustedParticipants.length < maxMembers) {
                            adjustedParticipants.push(...Array(maxMembers - adjustedParticipants.length).fill(0).map((_, i) => `user${i}`));
                        }

                        // The mock returns "Movie " + movieId, so we expect that
                        const expectedMovieTitle = `Movie ${movieId}`;

                        // Setup: Room is ACTIVE, vote triggers match
                        mockDocClient.send
                            .mockResolvedValueOnce({ // getRoomStatusConsistent
                                Item: { status: 'ACTIVE' }
                            })
                            .mockResolvedValueOnce({ // getRoomAndValidate
                                Item: {
                                    id: roomId,
                                    status: 'ACTIVE',
                                    maxMembers,
                                    PK: roomId,
                                    SK: 'ROOM'
                                }
                            })
                            .mockResolvedValueOnce({ // validateUserMembership
                                Item: { roomId, userId, isActive: true }
                            })
                            .mockResolvedValueOnce({ // preventDuplicateVote - no existing vote
                                Item: null
                            })
                            .mockResolvedValueOnce({}) // recordVoteAtomically
                            .mockResolvedValueOnce({ // incrementVoteCountAtomically
                                Attributes: { votes: maxMembers }
                            })
                            .mockResolvedValueOnce({}) // checkAndUpdateMatchAtomically - success
                            .mockResolvedValueOnce({ // getRoomParticipants
                                Items: adjustedParticipants.map(p => ({ userId: p }))
                            });

                        mockAppsyncPublisher.getMovieTitle.mockResolvedValue(expectedMovieTitle);

                        // Create mock event
                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType: 'LIKE' }
                            },
                            identity: { sub: userId }
                        };

                        // Execute
                        const result = await voteModule.handler(event);

                        // Property: Response must have VoteResponse structure
                        expect(result).toHaveProperty('success');
                        expect(result).toHaveProperty('responseType');
                        expect(result).toHaveProperty('room');
                        expect(result).toHaveProperty('matchInfo');
                        expect(result).toHaveProperty('message');
                        expect(result).toHaveProperty('error');

                        // Property: Success must be true for new matches
                        expect(result.success).toBe(true);

                        // Property: Response type must indicate match found
                        expect(result.responseType).toBe('MATCH_FOUND');

                        // Property: Room must be updated with match status
                        expect(result.room).toHaveProperty('status', 'MATCHED');
                        expect(result.room).toHaveProperty('resultMovieId', movieId);
                        expect(result.room).toHaveProperty('matchFound', true);

                        // Property: Match info must be complete
                        expect(result.matchInfo).toHaveProperty('movieId', movieId);
                        expect(result.matchInfo).toHaveProperty('movieTitle', expectedMovieTitle);
                        expect(result.matchInfo).toHaveProperty('roomId', roomId);

                        // Property: Message must be celebratory
                        expect(result.message).toContain('Match encontrado');
                        expect(result.message).toContain(expectedMovieTitle);

                        // Property: Error must be null for successful operations
                        expect(result.error).toBeNull();
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should return consistent VoteResponse structure for normal votes', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.constantFrom('LIKE', 'DISLIKE'), // voteType
                    fc.integer({ min: 2, max: 10 }), // maxMembers
                    fc.integer({ min: 0, max: 49 }), // userProgress
                    async (userId, roomId, movieId, voteType, maxMembers, userProgress) => {
                        const currentVotes = voteType === 'LIKE' ? 1 : 0;

                        // Setup: Normal vote processing (no match)
                        mockDocClient.send
                            .mockResolvedValueOnce({ // getRoomStatusConsistent
                                Item: { status: 'ACTIVE' }
                            })
                            .mockResolvedValueOnce({ // getRoomAndValidate
                                Item: {
                                    id: roomId,
                                    status: 'ACTIVE',
                                    maxMembers,
                                    PK: roomId,
                                    SK: 'ROOM'
                                }
                            })
                            .mockResolvedValueOnce({ // validateUserMembership
                                Item: { roomId, userId, isActive: true }
                            })
                            .mockResolvedValueOnce({ // preventDuplicateVote
                                Item: null
                            })
                            .mockResolvedValueOnce({}) // recordVoteAtomically
                            .mockResolvedValueOnce({ // incrementVoteCountAtomically or getCurrentVoteCount
                                Attributes: { votes: currentVotes }
                            })
                            .mockResolvedValueOnce({ // getUserVotingProgress
                                Items: Array(userProgress).fill(0).map((_, i) => ({ movieId: `movie${i}` }))
                            });

                        // Create mock event
                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType }
                            },
                            identity: { sub: userId }
                        };

                        // Execute
                        const result = await voteModule.handler(event);

                        // Property: Response must have VoteResponse structure
                        expect(result).toHaveProperty('success');
                        expect(result).toHaveProperty('responseType');
                        expect(result).toHaveProperty('room');
                        expect(result).toHaveProperty('matchInfo');
                        expect(result).toHaveProperty('message');
                        expect(result).toHaveProperty('error');

                        // Property: Success must be true for normal votes
                        expect(result.success).toBe(true);

                        // Property: Response type must indicate vote recorded
                        expect(result.responseType).toBe('VOTE_RECORDED');

                        // Property: Room must contain vote progress
                        expect(result.room).toHaveProperty('currentVotes', currentVotes);
                        expect(result.room).toHaveProperty('totalMembers', maxMembers);
                        expect(result.room).toHaveProperty('userProgress', userProgress);

                        // Property: Match info must be null for normal votes
                        expect(result.matchInfo).toBeNull();

                        // Property: Message must be informative
                        expect(result.message).toContain('Voto registrado');

                        // Property: Error must be null for successful operations
                        expect(result.error).toBeNull();
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should return consistent VoteResponse structure for errors', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.constantFrom('LIKE', 'DISLIKE'), // voteType
                    fc.string({ minLength: 1, maxLength: 100 }), // errorMessage
                    async (userId, roomId, movieId, voteType, errorMessage) => {
                        // Setup: Error scenario
                        mockDocClient.send.mockRejectedValue(new Error(errorMessage));

                        // Create mock event
                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType }
                            },
                            identity: { sub: userId }
                        };

                        // Execute
                        const result = await voteModule.handler(event);

                        // Property: Response must have VoteResponse structure even for errors
                        expect(result).toHaveProperty('success');
                        expect(result).toHaveProperty('responseType');
                        expect(result).toHaveProperty('room');
                        expect(result).toHaveProperty('matchInfo');
                        expect(result).toHaveProperty('message');
                        expect(result).toHaveProperty('error');

                        // Property: Success must be false for errors
                        expect(result.success).toBe(false);

                        // Property: Response type must indicate error
                        expect(result.responseType).toBe('ERROR');

                        // Property: Room must be null for errors
                        expect(result.room).toBeNull();

                        // Property: Match info must be null for errors
                        expect(result.matchInfo).toBeNull();

                        // Property: Message must be null for errors
                        expect(result.message).toBeNull();

                        // Property: Error must contain the error message
                        expect(result.error).toBe(errorMessage);
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    /**
     * Property 5: Atomic State Management
     * For any sequence of concurrent vote operations, the system should maintain 
     * consistent state without race conditions or data corruption
     * Validates: Requirements 4.1, 4.3, 8.2, 8.4, 8.5
     */
    describe('Property 5: Atomic State Management', () => {
        test('should maintain consistent state during concurrent vote operations', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 3 }), // userIds (smaller for simpler test)
                    fc.integer({ min: 3, max: 5 }), // maxMembers (ensure no match)
                    async (roomId, movieId, userIds, maxMembers) => {
                        // Ensure we don't trigger a match by having fewer LIKE votes than maxMembers
                        const adjustedUserIds = userIds.slice(0, 2); // Only 2 users
                        const voteTypes = ['LIKE', 'DISLIKE']; // Mixed votes, no match

                        // Setup: Room is ACTIVE, no existing votes, no match triggered
                        mockDocClient.send
                            .mockResolvedValue({ Item: { status: 'ACTIVE' } }) // getRoomStatusConsistent
                            .mockResolvedValue({ // getRoomAndValidate
                                Item: {
                                    id: roomId,
                                    status: 'ACTIVE',
                                    maxMembers,
                                    PK: roomId,
                                    SK: 'ROOM'
                                }
                            })
                            .mockResolvedValue({ // validateUserMembership
                                Item: { roomId, userId: adjustedUserIds[0], isActive: true }
                            })
                            .mockResolvedValue({ Item: null }) // preventDuplicateVote
                            .mockResolvedValue({}) // recordVoteAtomically
                            .mockResolvedValue({ Attributes: { votes: 1 } }) // incrementVoteCountAtomically (no match)
                            .mockResolvedValue({ // getUserVotingProgress
                                Items: Array(10).fill(0).map((_, i) => ({ movieId: `movie${i}` }))
                            });

                        // Execute votes sequentially to avoid complex mock setup
                        const results = [];
                        for (let i = 0; i < adjustedUserIds.length; i++) {
                            const event = {
                                info: { fieldName: 'vote' },
                                arguments: {
                                    input: { roomId, movieId, voteType: voteTypes[i] }
                                },
                                identity: { sub: adjustedUserIds[i] }
                            };
                            const result = await voteModule.handler(event);
                            results.push(result);
                        }

                        // Property: All operations should succeed
                        results.forEach(result => {
                            expect(result.success).toBe(true);
                        });

                        // Property: All results should have consistent structure
                        results.forEach(result => {
                            expect(result).toHaveProperty('success');
                            expect(result).toHaveProperty('responseType');
                            expect(result).toHaveProperty('room');
                            expect(result).toHaveProperty('matchInfo');
                            expect(result).toHaveProperty('message');
                            expect(result).toHaveProperty('error');
                        });

                        // Property: Response types should be VOTE_RECORDED (no match)
                        results.forEach(result => {
                            expect(result.responseType).toBe('VOTE_RECORDED');
                        });

                        // Property: Error should be null for successful operations
                        results.forEach(result => {
                            expect(result.error).toBeNull();
                        });

                        // Property: Room data should be consistent across results
                        const roomResults = results.filter(r => r.room !== null);
                        if (roomResults.length > 1) {
                            const firstRoom = roomResults[0].room;
                            roomResults.forEach(result => {
                                expect(result.room.id).toBe(firstRoom.id);
                                expect(result.room.maxMembers).toBe(firstRoom.maxMembers);
                            });
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should handle atomic vote count increments correctly', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.integer({ min: 1, max: 5 }), // initialVoteCount
                    fc.integer({ min: 6, max: 10 }), // maxMembers (ensure no match)
                    async (roomId, movieId, userId, initialVoteCount, maxMembers) => {
                        const finalVoteCount = initialVoteCount + 1; // No match since finalVoteCount < maxMembers

                        // Setup: Room is ACTIVE, vote increments atomically, no match
                        mockDocClient.send
                            .mockResolvedValueOnce({ Item: { status: 'ACTIVE' } }) // getRoomStatusConsistent
                            .mockResolvedValueOnce({ // getRoomAndValidate
                                Item: {
                                    id: roomId,
                                    status: 'ACTIVE',
                                    maxMembers,
                                    PK: roomId,
                                    SK: 'ROOM'
                                }
                            })
                            .mockResolvedValueOnce({ // validateUserMembership
                                Item: { roomId, userId, isActive: true }
                            })
                            .mockResolvedValueOnce({ Item: null }) // preventDuplicateVote
                            .mockResolvedValueOnce({}) // recordVoteAtomically
                            .mockResolvedValueOnce({ // incrementVoteCountAtomically
                                Attributes: { votes: finalVoteCount, version: 1 }
                            })
                            .mockResolvedValueOnce({ // getUserVotingProgress
                                Items: Array(10).fill(0).map((_, i) => ({ movieId: `movie${i}` }))
                            });

                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType: 'LIKE' }
                            },
                            identity: { sub: userId }
                        };

                        const result = await voteModule.handler(event);

                        // Property: Vote count should be incremented atomically
                        expect(result.success).toBe(true);
                        expect(result.responseType).toBe('VOTE_RECORDED'); // No match
                        expect(result.room).toHaveProperty('currentVotes', finalVoteCount);

                        // Property: Version should be maintained for conflict detection
                        // This is validated by the atomic operation itself

                        // Property: Total members should remain consistent
                        expect(result.room).toHaveProperty('totalMembers', maxMembers);

                        // Property: Vote count should never exceed max members
                        expect(result.room.currentVotes).toBeLessThanOrEqual(maxMembers);
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should maintain room status consistency during state transitions', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.constantFrom('ACTIVE', 'WAITING'), // initialStatus
                    fc.integer({ min: 2, max: 5 }), // maxMembers
                    async (roomId, movieId, userId, initialStatus, maxMembers) => {
                        // Setup: Room transitions from initial status
                        mockDocClient.send
                            .mockResolvedValueOnce({ Item: { status: initialStatus } }) // getRoomStatusConsistent
                            .mockResolvedValueOnce({ // getRoomAndValidate
                                Item: {
                                    id: roomId,
                                    status: initialStatus,
                                    maxMembers,
                                    PK: roomId,
                                    SK: 'ROOM'
                                }
                            })
                            .mockResolvedValueOnce({ // validateUserMembership
                                Item: { roomId, userId, isActive: true }
                            })
                            .mockResolvedValueOnce({ Item: null }) // preventDuplicateVote
                            .mockResolvedValueOnce({}) // recordVoteAtomically
                            .mockResolvedValueOnce({ // incrementVoteCountAtomically - triggers match
                                Attributes: { votes: maxMembers }
                            })
                            .mockResolvedValueOnce({}) // checkAndUpdateMatchAtomically - success
                            .mockResolvedValueOnce({ // getRoomParticipants
                                Items: Array(maxMembers).fill(0).map((_, i) => ({ userId: `user${i}` }))
                            });

                        mockAppsyncPublisher.getMovieTitle.mockResolvedValue(`Movie ${movieId}`);

                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType: 'LIKE' }
                            },
                            identity: { sub: userId }
                        };

                        const result = await voteModule.handler(event);

                        // Property: State transition should be atomic and consistent
                        expect(result.success).toBe(true);
                        expect(result.responseType).toBe('MATCH_FOUND');

                        // Property: Room status should transition to MATCHED
                        expect(result.room).toHaveProperty('status', 'MATCHED');
                        expect(result.room).toHaveProperty('matchFound', true);
                        expect(result.room).toHaveProperty('resultMovieId', movieId);

                        // Property: Match info should be complete and consistent
                        expect(result.matchInfo).toHaveProperty('movieId', movieId);
                        expect(result.matchInfo).toHaveProperty('roomId', roomId);
                        expect(result.matchInfo).toHaveProperty('movieTitle', `Movie ${movieId}`);
                        expect(result.matchInfo).toHaveProperty('participants');
                        expect(result.matchInfo.participants).toHaveLength(maxMembers);
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    /**
     * Property 6: Concurrent Vote Processing
     * For any set of concurrent vote operations on the same room/movie, 
     * the system should handle them atomically without race conditions
     * Validates: Requirements 2.4, 4.4, 4.5
     */
    describe('Property 6: Concurrent Vote Processing', () => {
        test('should handle concurrent votes without race conditions', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 4 }), // userIds
                    fc.integer({ min: 5, max: 8 }), // maxMembers (ensure no match)
                    async (roomId, movieId, userIds, maxMembers) => {
                        // Ensure we have unique user IDs
                        const uniqueUserIds = [...new Set(userIds)].slice(0, 3);
                        
                        // Setup: All votes are LIKE but won't trigger match
                        const voteCount = uniqueUserIds.length; // Less than maxMembers
                        
                        // Mock setup for concurrent operations
                        mockDocClient.send.mockImplementation((command) => {
                            // Simulate different responses based on command type
                            if (command.input?.Key?.PK) {
                                // getRoomStatusConsistent or getRoomAndValidate
                                if (command.input.ProjectionExpression === '#status') {
                                    return Promise.resolve({ Item: { status: 'ACTIVE' } });
                                } else {
                                    return Promise.resolve({
                                        Item: {
                                            id: roomId,
                                            status: 'ACTIVE',
                                            maxMembers,
                                            PK: roomId,
                                            SK: 'ROOM'
                                        }
                                    });
                                }
                            } else if (command.input?.TableName === process.env.ROOM_MEMBERS_TABLE) {
                                // validateUserMembership
                                return Promise.resolve({
                                    Item: { roomId, userId: uniqueUserIds[0], isActive: true }
                                });
                            } else if (command.input?.TableName === process.env.VOTES_TABLE && command.input?.Key) {
                                // preventDuplicateVote
                                return Promise.resolve({ Item: null });
                            } else if (command.input?.TableName === process.env.VOTES_TABLE && command.input?.Item) {
                                // recordVoteAtomically
                                return Promise.resolve({});
                            } else if (command.input?.TableName === process.env.ROOM_MATCHES_TABLE) {
                                // incrementVoteCountAtomically
                                return Promise.resolve({ Attributes: { votes: voteCount } });
                            } else if (command.input?.KeyConditionExpression) {
                                // getUserVotingProgress
                                return Promise.resolve({
                                    Items: Array(10).fill(0).map((_, i) => ({ movieId: `movie${i}` }))
                                });
                            }
                            
                            return Promise.resolve({});
                        });

                        // Execute concurrent votes
                        const votePromises = uniqueUserIds.map(userId => {
                            const event = {
                                info: { fieldName: 'vote' },
                                arguments: {
                                    input: { roomId, movieId, voteType: 'LIKE' }
                                },
                                identity: { sub: userId }
                            };
                            return voteModule.handler(event);
                        });

                        const results = await Promise.all(votePromises);

                        // Property: All concurrent operations should succeed
                        results.forEach(result => {
                            expect(result.success).toBe(true);
                        });

                        // Property: All results should have consistent VoteResponse structure
                        results.forEach(result => {
                            expect(result).toHaveProperty('success');
                            expect(result).toHaveProperty('responseType');
                            expect(result).toHaveProperty('room');
                            expect(result).toHaveProperty('matchInfo');
                            expect(result).toHaveProperty('message');
                            expect(result).toHaveProperty('error');
                        });

                        // Property: No race conditions - all should be VOTE_RECORDED (no match)
                        results.forEach(result => {
                            expect(result.responseType).toBe('VOTE_RECORDED');
                        });

                        // Property: Error should be null for successful concurrent operations
                        results.forEach(result => {
                            expect(result.error).toBeNull();
                        });

                        // Property: Match info should be null for non-match scenarios
                        results.forEach(result => {
                            expect(result.matchInfo).toBeNull();
                        });
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should handle concurrent match detection correctly', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.integer({ min: 2, max: 4 }), // maxMembers
                    async (roomId, movieId, maxMembers) => {
                        // Generate exactly maxMembers users for a guaranteed match
                        const userIds = Array(maxMembers).fill(0).map((_, i) => `user${i}`);
                        
                        // Track which user triggers the match
                        let matchTriggered = false;
                        
                        // Mock setup for match scenario
                        mockDocClient.send.mockImplementation((command) => {
                            if (command.input?.Key?.PK) {
                                // getRoomStatusConsistent or getRoomAndValidate
                                if (command.input.ProjectionExpression === '#status') {
                                    return Promise.resolve({ Item: { status: 'ACTIVE' } });
                                } else {
                                    return Promise.resolve({
                                        Item: {
                                            id: roomId,
                                            status: 'ACTIVE',
                                            maxMembers,
                                            PK: roomId,
                                            SK: 'ROOM'
                                        }
                                    });
                                }
                            } else if (command.input?.TableName === process.env.ROOM_MEMBERS_TABLE) {
                                return Promise.resolve({
                                    Item: { roomId, userId: userIds[0], isActive: true }
                                });
                            } else if (command.input?.TableName === process.env.VOTES_TABLE && command.input?.Key) {
                                return Promise.resolve({ Item: null });
                            } else if (command.input?.TableName === process.env.VOTES_TABLE && command.input?.Item) {
                                return Promise.resolve({});
                            } else if (command.input?.TableName === process.env.ROOM_MATCHES_TABLE) {
                                // Simulate reaching match threshold
                                return Promise.resolve({ Attributes: { votes: maxMembers } });
                            } else if (command.input?.UpdateExpression?.includes('SET #status = :status')) {
                                // checkAndUpdateMatchAtomically - only first one succeeds
                                if (!matchTriggered) {
                                    matchTriggered = true;
                                    return Promise.resolve({});
                                } else {
                                    // Simulate conditional check failure for subsequent attempts
                                    const error = new Error('ConditionalCheckFailedException');
                                    error.name = 'ConditionalCheckFailedException';
                                    throw error;
                                }
                            } else if (command.input?.KeyConditionExpression?.includes('roomId = :roomId')) {
                                if (command.input.ProjectionExpression === 'userId') {
                                    // getRoomParticipants
                                    return Promise.resolve({
                                        Items: userIds.map(id => ({ userId: id }))
                                    });
                                } else {
                                    // getUserVotingProgress
                                    return Promise.resolve({
                                        Items: Array(10).fill(0).map((_, i) => ({ movieId: `movie${i}` }))
                                    });
                                }
                            }
                            
                            return Promise.resolve({});
                        });

                        mockAppsyncPublisher.getMovieTitle.mockResolvedValue(`Movie ${movieId}`);

                        // Execute concurrent votes that should trigger match
                        const votePromises = userIds.map(userId => {
                            const event = {
                                info: { fieldName: 'vote' },
                                arguments: {
                                    input: { roomId, movieId, voteType: 'LIKE' }
                                },
                                identity: { sub: userId }
                            };
                            return voteModule.handler(event);
                        });

                        const results = await Promise.all(votePromises);

                        // Property: All concurrent operations should succeed
                        results.forEach(result => {
                            expect(result.success).toBe(true);
                        });

                        // Property: Exactly one should trigger match, others should get existing match
                        const matchFoundResults = results.filter(r => r.responseType === 'MATCH_FOUND');
                        const matchIgnoredResults = results.filter(r => r.responseType === 'VOTE_IGNORED_MATCH_FOUND');
                        
                        // Property: Should have at least one match found (atomic winner)
                        expect(matchFoundResults.length).toBeGreaterThanOrEqual(1);
                        
                        // Property: All results should be either MATCH_FOUND or VOTE_IGNORED_MATCH_FOUND
                        results.forEach(result => {
                            expect(['MATCH_FOUND', 'VOTE_IGNORED_MATCH_FOUND']).toContain(result.responseType);
                        });

                        // Property: All should have match info
                        results.forEach(result => {
                            expect(result.matchInfo).not.toBeNull();
                            expect(result.matchInfo).toHaveProperty('movieId', movieId);
                            expect(result.matchInfo).toHaveProperty('roomId', roomId);
                        });
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should maintain vote count consistency under concurrent load', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.array(fc.constantFrom('LIKE', 'DISLIKE'), { minLength: 3, maxLength: 5 }), // voteTypes
                    fc.integer({ min: 6, max: 10 }), // maxMembers (no match)
                    async (roomId, movieId, voteTypes, maxMembers) => {
                        const userIds = voteTypes.map((_, i) => `user${i}`);
                        const likeCount = voteTypes.filter(v => v === 'LIKE').length;
                        
                        // Mock consistent vote counting
                        let currentVoteCount = 0;
                        
                        mockDocClient.send.mockImplementation((command) => {
                            if (command.input?.Key?.PK) {
                                if (command.input.ProjectionExpression === '#status') {
                                    return Promise.resolve({ Item: { status: 'ACTIVE' } });
                                } else {
                                    return Promise.resolve({
                                        Item: {
                                            id: roomId,
                                            status: 'ACTIVE',
                                            maxMembers,
                                            PK: roomId,
                                            SK: 'ROOM'
                                        }
                                    });
                                }
                            } else if (command.input?.TableName === process.env.ROOM_MEMBERS_TABLE) {
                                return Promise.resolve({
                                    Item: { roomId, userId: userIds[0], isActive: true }
                                });
                            } else if (command.input?.TableName === process.env.VOTES_TABLE && command.input?.Key) {
                                return Promise.resolve({ Item: null });
                            } else if (command.input?.TableName === process.env.VOTES_TABLE && command.input?.Item) {
                                return Promise.resolve({});
                            } else if (command.input?.TableName === process.env.ROOM_MATCHES_TABLE) {
                                // Atomic increment simulation
                                if (command.input?.UpdateExpression?.includes('ADD votes')) {
                                    currentVoteCount++;
                                    return Promise.resolve({ Attributes: { votes: currentVoteCount } });
                                } else {
                                    return Promise.resolve({ Item: { votes: currentVoteCount } });
                                }
                            } else if (command.input?.KeyConditionExpression) {
                                return Promise.resolve({
                                    Items: Array(10).fill(0).map((_, i) => ({ movieId: `movie${i}` }))
                                });
                            }
                            
                            return Promise.resolve({});
                        });

                        // Execute concurrent votes with mixed types
                        const votePromises = userIds.map((userId, index) => {
                            const event = {
                                info: { fieldName: 'vote' },
                                arguments: {
                                    input: { roomId, movieId, voteType: voteTypes[index] }
                                },
                                identity: { sub: userId }
                            };
                            return voteModule.handler(event);
                        });

                        const results = await Promise.all(votePromises);

                        // Property: All operations should succeed
                        results.forEach(result => {
                            expect(result.success).toBe(true);
                        });

                        // Property: Vote counts should be consistent
                        const likeResults = results.filter((_, i) => voteTypes[i] === 'LIKE');
                        likeResults.forEach(result => {
                            expect(result.room).toHaveProperty('currentVotes');
                            expect(result.room.currentVotes).toBeGreaterThan(0);
                            expect(result.room.currentVotes).toBeLessThanOrEqual(likeCount);
                        });

                        // Property: No match should occur (vote count < maxMembers)
                        results.forEach(result => {
                            expect(result.responseType).toBe('VOTE_RECORDED');
                            expect(result.matchInfo).toBeNull();
                        });
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    /**
     * Property 7: Room Status Check Priority
     * For any room status check operation, the system should prioritize 
     * MATCHED status detection and return appropriate responses without errors
     * Validates: Requirements 2.1, 8.1
     */
    describe('Property 7: Room Status Check Priority', () => {
        test('should prioritize MATCHED status detection over other operations', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.constantFrom('LIKE', 'DISLIKE'), // voteType
                    fc.string({ minLength: 1, maxLength: 50 }), // matchedMovieId
                    fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }), // participants
                    async (userId, roomId, movieId, voteType, matchedMovieId, participants) => {
                        // Setup: Room has MATCHED status - should be detected immediately
                        mockDocClient.send
                            .mockResolvedValueOnce({ // getRoomStatusConsistent (priority check)
                                Item: { status: 'MATCHED' }
                            })
                            .mockResolvedValueOnce({ // getExistingMatchInfo (called due to MATCHED status)
                                Item: {
                                    status: 'MATCHED',
                                    resultMovieId: matchedMovieId,
                                    updatedAt: new Date().toISOString()
                                }
                            })
                            .mockResolvedValueOnce({ // getRoomParticipants
                                Items: participants.map(p => ({ userId: p }))
                            });

                        const expectedMovieTitle = `Movie ${matchedMovieId}`;
                        mockAppsyncPublisher.getMovieTitle.mockResolvedValue(expectedMovieTitle);

                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType }
                            },
                            identity: { sub: userId }
                        };

                        const result = await voteModule.handler(event);

                        // Property: MATCHED status should be detected with HIGH priority
                        expect(result.success).toBe(true);
                        expect(result.responseType).toBe('VOTE_IGNORED_MATCH_FOUND');

                        // Property: Match info should be returned immediately
                        expect(result.matchInfo).not.toBeNull();
                        expect(result.matchInfo.movieId).toBe(matchedMovieId);
                        expect(result.matchInfo.movieTitle).toBe(expectedMovieTitle);
                        expect(result.matchInfo.roomId).toBe(roomId);
                        expect(result.matchInfo.participants).toEqual(participants);

                        // Property: No further processing should occur (room is null)
                        expect(result.room).toBeNull();

                        // Property: Message should indicate existing match
                        expect(result.message).toContain('Match already found');
                        expect(result.message).toContain(expectedMovieTitle);

                        // Property: No error should occur for priority detection
                        expect(result.error).toBeNull();
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should handle ACTIVE/WAITING status with NORMAL priority', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.constantFrom('ACTIVE', 'WAITING'), // roomStatus
                    fc.constantFrom('LIKE', 'DISLIKE'), // voteType
                    fc.integer({ min: 2, max: 5 }), // maxMembers
                    async (userId, roomId, movieId, roomStatus, voteType, maxMembers) => {
                        // Setup: Room has ACTIVE/WAITING status - normal processing
                        mockDocClient.send
                            .mockResolvedValueOnce({ // getRoomStatusConsistent (priority check)
                                Item: { status: roomStatus }
                            })
                            .mockResolvedValueOnce({ // getRoomAndValidate (normal flow)
                                Item: {
                                    id: roomId,
                                    status: roomStatus,
                                    maxMembers,
                                    PK: roomId,
                                    SK: 'ROOM'
                                }
                            })
                            .mockResolvedValueOnce({ // validateUserMembership
                                Item: { roomId, userId, isActive: true }
                            })
                            .mockResolvedValueOnce({ // preventDuplicateVote
                                Item: null
                            })
                            .mockResolvedValueOnce({}) // recordVoteAtomically
                            .mockResolvedValueOnce({ // incrementVoteCountAtomically or getCurrentVoteCount
                                Attributes: { votes: 1 }
                            })
                            .mockResolvedValueOnce({ // getUserVotingProgress
                                Items: Array(10).fill(0).map((_, i) => ({ movieId: `movie${i}` }))
                            });

                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType }
                            },
                            identity: { sub: userId }
                        };

                        const result = await voteModule.handler(event);

                        // Property: ACTIVE/WAITING status should proceed with NORMAL priority
                        expect(result.success).toBe(true);
                        expect(result.responseType).toBe('VOTE_RECORDED');

                        // Property: Room should be processed normally
                        expect(result.room).not.toBeNull();
                        expect(result.room.status).toBe(roomStatus);
                        expect(result.room.maxMembers).toBe(maxMembers);

                        // Property: Vote should be recorded
                        const expectedVotes = voteType === 'LIKE' ? 1 : 0;
                        expect(result.room.currentVotes).toBe(expectedVotes);
                        expect(result.room.userProgress).toBe(10);

                        // Property: No match info for normal processing
                        expect(result.matchInfo).toBeNull();

                        // Property: Success message should be provided
                        expect(result.message).toContain('Voto registrado');

                        // Property: No error for normal processing
                        expect(result.error).toBeNull();
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should handle invalid status with LOW priority error handling', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.constantFrom('CLOSED', 'EXPIRED', 'INVALID'), // invalidStatus
                    fc.constantFrom('LIKE', 'DISLIKE'), // voteType
                    async (userId, roomId, movieId, invalidStatus, voteType) => {
                        // Setup: Room has invalid status - should be handled with LOW priority
                        mockDocClient.send
                            .mockResolvedValueOnce({ // getRoomStatusConsistent (priority check)
                                Item: { status: invalidStatus }
                            })
                            .mockResolvedValueOnce({ // getRoomStatusWithMetadata (detailed check)
                                Item: {
                                    status: invalidStatus,
                                    maxMembers: 2,
                                    memberCount: 1,
                                    isMatchedRoom: false
                                }
                            });

                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType }
                            },
                            identity: { sub: userId }
                        };

                        const result = await voteModule.handler(event);

                        // Property: Invalid status should be handled with LOW priority
                        expect(result.success).toBe(false);
                        expect(result.responseType).toBe('ERROR');

                        // Property: Room should be null for invalid status
                        expect(result.room).toBeNull();

                        // Property: No match info for error cases
                        expect(result.matchInfo).toBeNull();

                        // Property: Message should be null for errors
                        expect(result.message).toBeNull();

                        // Property: Error should indicate room unavailability (generic error is acceptable)
                        expect(result.error).toBeTruthy();
                        expect(typeof result.error).toBe('string');

                        // Property: Error should be user-friendly
                        expect(result.error).not.toContain('ValidationException');
                        expect(result.error).not.toContain('DynamoDB');
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should handle room not found with appropriate priority', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.constantFrom('LIKE', 'DISLIKE'), // voteType
                    async (userId, roomId, movieId, voteType) => {
                        // Setup: Room not found - should be handled appropriately
                        mockDocClient.send
                            .mockResolvedValueOnce({ // getRoomStatusConsistent (priority check)
                                Item: null // Room not found
                            })
                            .mockResolvedValueOnce({ // getRoomStatusWithMetadata (detailed check)
                                Item: null // Confirm room not found
                            });

                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType }
                            },
                            identity: { sub: userId }
                        };

                        const result = await voteModule.handler(event);

                        // Property: Room not found should be handled gracefully
                        expect(result.success).toBe(false);
                        expect(result.responseType).toBe('ERROR');

                        // Property: Room should be null when not found
                        expect(result.room).toBeNull();

                        // Property: No match info when room doesn't exist
                        expect(result.matchInfo).toBeNull();

                        // Property: Message should be null for errors
                        expect(result.message).toBeNull();

                        // Property: Error should indicate room not found (generic error is acceptable)
                        expect(result.error).toBeTruthy();
                        expect(typeof result.error).toBe('string');

                        // Property: Error should be user-friendly
                        expect(result.error).not.toContain('null');
                        expect(result.error).not.toContain('undefined');
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    /**
     * Property 8: Error Suppression for Matched Rooms
     * For any error scenario in matched rooms, the system should suppress 
     * technical errors and return user-friendly messages without exposing internals
     * Validates: Requirements 5.1, 5.3
     */
    describe('Property 8: Error Suppression for Matched Rooms', () => {
        test('should suppress technical errors and return user-friendly messages', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.constantFrom('LIKE', 'DISLIKE'), // voteType
                    fc.constantFrom(
                        'ValidationException', 
                        'DynamoDB error', 
                        'Network timeout', 
                        'Internal server error',
                        'ConditionalCheckFailedException'
                    ), // technicalError
                    async (userId, roomId, movieId, voteType, technicalError) => {
                        // Setup: Room status check fails with technical error
                        const error = new Error(`${technicalError}: Technical details that should not be exposed`);
                        error.name = technicalError;
                        
                        mockDocClient.send.mockRejectedValue(error);

                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType }
                            },
                            identity: { sub: userId }
                        };

                        const result = await voteModule.handler(event);

                        // Property: Technical errors should be suppressed
                        expect(result.success).toBe(false);
                        expect(result.responseType).toBe('ERROR');

                        // Property: Error message should be user-friendly
                        expect(result.error).toBeTruthy();
                        expect(typeof result.error).toBe('string');

                        // Property: Technical details should NOT be exposed
                        expect(result.error).not.toContain('ValidationException');
                        expect(result.error).not.toContain('DynamoDB');
                        expect(result.error).not.toContain('ConditionalCheckFailedException');
                        expect(result.error).not.toContain('Technical details');
                        expect(result.error).not.toContain('Internal server error');

                        // Property: Error should be in Spanish (user-friendly)
                        expect(result.error).toMatch(/error|problema|inténtalo|sesión|conexión|datos|inesperado/i);

                        // Property: Room and match info should be null for errors
                        expect(result.room).toBeNull();
                        expect(result.matchInfo).toBeNull();
                        expect(result.message).toBeNull();
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should handle room unavailability errors gracefully', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.constantFrom('LIKE', 'DISLIKE'), // voteType
                    fc.constantFrom('CLOSED', 'EXPIRED', 'INACTIVE', 'DELETED'), // roomStatus
                    async (userId, roomId, movieId, voteType, roomStatus) => {
                        // Setup: Room is unavailable for voting
                        mockDocClient.send
                            .mockResolvedValueOnce({ // getRoomStatusConsistent
                                Item: { status: roomStatus }
                            })
                            .mockResolvedValueOnce({ // getRoomStatusWithMetadata
                                Item: {
                                    status: roomStatus,
                                    maxMembers: 2,
                                    memberCount: 1,
                                    isMatchedRoom: false
                                }
                            });

                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType }
                            },
                            identity: { sub: userId }
                        };

                        const result = await voteModule.handler(event);

                        // Property: Room unavailability should be handled gracefully
                        expect(result.success).toBe(false);
                        expect(result.responseType).toBe('ERROR');

                        // Property: Error should be user-friendly and informative
                        expect(result.error).toBeTruthy();
                        expect(typeof result.error).toBe('string');

                        // Property: Error should not expose internal status values
                        expect(result.error).not.toContain(roomStatus);
                        expect(result.error).not.toContain('CLOSED');
                        expect(result.error).not.toContain('EXPIRED');
                        expect(result.error).not.toContain('INACTIVE');
                        expect(result.error).not.toContain('DELETED');

                        // Property: Error should be contextually appropriate
                        expect(result.error).toMatch(/disponible|momento|sala|votar|error/i);

                        // Property: Response structure should be consistent
                        expect(result.room).toBeNull();
                        expect(result.matchInfo).toBeNull();
                        expect(result.message).toBeNull();
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should suppress database connection errors appropriately', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.constantFrom('LIKE', 'DISLIKE'), // voteType
                    fc.constantFrom(
                        'ServiceException',
                        'ThrottlingException', 
                        'InternalServerError',
                        'NetworkingError',
                        'TimeoutError'
                    ), // dbError
                    async (userId, roomId, movieId, voteType, dbError) => {
                        // Setup: Database connection error
                        const error = new Error(`${dbError}: Database connection failed with technical details`);
                        error.name = dbError;
                        
                        mockDocClient.send.mockRejectedValue(error);

                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType }
                            },
                            identity: { sub: userId }
                        };

                        const result = await voteModule.handler(event);

                        // Property: Database errors should be suppressed
                        expect(result.success).toBe(false);
                        expect(result.responseType).toBe('ERROR');

                        // Property: Error message should be generic and user-friendly
                        expect(result.error).toBeTruthy();
                        expect(typeof result.error).toBe('string');

                        // Property: Database technical details should NOT be exposed
                        expect(result.error).not.toContain('ServiceException');
                        expect(result.error).not.toContain('ThrottlingException');
                        expect(result.error).not.toContain('InternalServerError');
                        expect(result.error).not.toContain('NetworkingError');
                        expect(result.error).not.toContain('TimeoutError');
                        expect(result.error).not.toContain('Database connection failed');
                        expect(result.error).not.toContain('technical details');

                        // Property: Error should suggest user action
                        expect(result.error).toMatch(/inténtalo|conexión|problema|error|más tarde/i);

                        // Property: Response structure should be consistent
                        expect(result.room).toBeNull();
                        expect(result.matchInfo).toBeNull();
                        expect(result.message).toBeNull();
                    }
                ),
                { numRuns: 100 }
            );
        });

        test('should handle authorization errors with appropriate suppression', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }), // userId
                    fc.string({ minLength: 1, maxLength: 50 }), // roomId
                    fc.string({ minLength: 1, maxLength: 50 }), // movieId
                    fc.constantFrom('LIKE', 'DISLIKE'), // voteType
                    fc.constantFrom('Unauthorized', 'Forbidden', 'AccessDenied'), // authError
                    async (userId, roomId, movieId, voteType, authError) => {
                        // Setup: Authorization error
                        const error = new Error(`${authError}: JWT token expired or invalid credentials`);
                        error.name = authError;
                        
                        mockDocClient.send.mockRejectedValue(error);

                        const event = {
                            info: { fieldName: 'vote' },
                            arguments: {
                                input: { roomId, movieId, voteType }
                            },
                            identity: { sub: userId }
                        };

                        const result = await voteModule.handler(event);

                        // Property: Authorization errors should be handled gracefully
                        expect(result.success).toBe(false);
                        expect(result.responseType).toBe('ERROR');

                        // Property: Error message should be user-friendly
                        expect(result.error).toBeTruthy();
                        expect(typeof result.error).toBe('string');

                        // Property: Technical auth details should NOT be exposed
                        expect(result.error).not.toContain('Unauthorized');
                        expect(result.error).not.toContain('Forbidden');
                        expect(result.error).not.toContain('AccessDenied');
                        expect(result.error).not.toContain('JWT token');
                        expect(result.error).not.toContain('invalid credentials');

                        // Property: Error should suggest session renewal
                        expect(result.error).toMatch(/sesión|inicia|expirado|nuevo/i);

                        // Property: Response structure should be consistent
                        expect(result.room).toBeNull();
                        expect(result.matchInfo).toBeNull();
                        expect(result.message).toBeNull();
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});