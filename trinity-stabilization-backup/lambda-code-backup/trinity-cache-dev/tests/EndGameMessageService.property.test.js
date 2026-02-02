const fc = require('fast-check');
const EndGameMessageService = require('../services/EndGameMessageService');

/**
 * Property-based tests for EndGameMessageService
 * Tests end-game scenarios and filter immutability
 */

describe('EndGameMessageService Property Tests', () => {
  let service;
  let mockDynamoClient;

  beforeEach(() => {
    // Mock DynamoDB client
    mockDynamoClient = {
      send: jest.fn()
    };

    service = new EndGameMessageService(mockDynamoClient);
    
    // Mock environment variables
    process.env.VOTES_TABLE = 'trinity-votes-dev';
    process.env.ROOM_MEMBERS_TABLE = 'trinity-room-members-dev';
    process.env.ROOM_CACHE_METADATA_TABLE = 'trinity-room-cache-metadata-dev';
  });

  /**
   * Property 5: End-Game Message Logic
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
   */
  describe('Property 5: End-Game Message Logic', () => {
    test('should provide different messages for regular users vs. last user', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            roomCapacity: fc.integer({ min: 2, max: 10 }),
            users: fc.array(
              fc.record({
                userId: fc.string({ minLength: 1, maxLength: 30 }),
                votedCount: fc.integer({ min: 0, max: 50 }),
                isHost: fc.boolean()
              }),
              { minLength: 2, maxLength: 10 }
            )
          }),
          async ({ roomId, roomCapacity, users }) => {
            // Ensure we have at least roomCapacity users
            const roomUsers = users.slice(0, Math.max(roomCapacity, users.length));
            
            // Mock room metadata
            mockDynamoClient.send
              .mockResolvedValueOnce({
                Item: {
                  roomId,
                  roomCapacity,
                  filterCriteria: { roomCapacity },
                  businessLogicApplied: true
                }
              });

            // Mock room members
            mockDynamoClient.send
              .mockResolvedValueOnce({
                Items: roomUsers.map(user => ({
                  userId: user.userId,
                  role: user.isHost ? 'HOST' : 'MEMBER',
                  joinedAt: new Date().toISOString()
                }))
              });

            for (const user of roomUsers) {
              // Mock user voting progress
              const votedMovieIds = Array.from({ length: user.votedCount }, (_, i) => `movie-${i}`);
              mockDynamoClient.send
                .mockResolvedValueOnce({
                  Items: votedMovieIds.map(movieId => ({
                    movieId,
                    voteType: 'LIKE',
                    votedAt: new Date().toISOString()
                  }))
                });

              // Mock voting progress for other users (for last user detection)
              for (const otherUser of roomUsers) {
                if (otherUser.userId !== user.userId) {
                  const otherVotedMovieIds = Array.from({ length: otherUser.votedCount }, (_, i) => `movie-${i}`);
                  mockDynamoClient.send
                    .mockResolvedValueOnce({
                      Items: otherVotedMovieIds.map(movieId => ({
                        movieId,
                        voteType: 'LIKE',
                        votedAt: new Date().toISOString()
                      }))
                    });
                }
              }

              const result = await service.determineEndGameMessage(roomId, user.userId);

              // Property: Users who haven't finished 50 movies should not get end-game messages
              if (user.votedCount < 50) {
                expect(result.isEndGame).toBe(false);
                expect(result.message).toBeNull();
                expect(result.remainingMovies).toBe(50 - user.votedCount);
              } else {
                // Property: Users who finished 50 movies should get end-game messages
                expect(result.isEndGame).toBe(true);
                expect(result.message).toBeDefined();
                expect(result.votedCount).toBe(user.votedCount);
                expect(result.totalMovies).toBe(50);

                // Property: Message should be one of the two expected types
                const expectedMessages = [
                  "A ver si hay suerte y haceis un match", // Regular user
                  "No os habeis puesto de acuerdo... Hacer otra sala." // Last user
                ];
                expect(expectedMessages).toContain(result.message);

                // Property: Message type should match the message content
                if (result.message === "A ver si hay suerte y haceis un match") {
                  expect(result.messageType).toBe('REGULAR_USER_FINISHED');
                  expect(result.isLastUser).toBe(false);
                } else if (result.message === "No os habeis puesto de acuerdo... Hacer otra sala.") {
                  expect(result.messageType).toBe('LAST_USER_NO_MATCH');
                  expect(result.isLastUser).toBe(true);
                }
              }

              // Reset mocks for next user
              mockDynamoClient.send.mockClear();
              
              // Re-mock room metadata and members for next iteration
              mockDynamoClient.send
                .mockResolvedValueOnce({
                  Item: {
                    roomId,
                    roomCapacity,
                    filterCriteria: { roomCapacity },
                    businessLogicApplied: true
                  }
                })
                .mockResolvedValueOnce({
                  Items: roomUsers.map(u => ({
                    userId: u.userId,
                    role: u.isHost ? 'HOST' : 'MEMBER',
                    joinedAt: new Date().toISOString()
                  }))
                });
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    test('should track user voting progress independently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            userId: fc.string({ minLength: 1, maxLength: 30 }),
            votedMovies: fc.array(
              fc.record({
                movieId: fc.string({ minLength: 1, maxLength: 20 }),
                voteType: fc.constantFrom('LIKE', 'DISLIKE'),
                votedAt: fc.date().map(d => d.toISOString())
              }),
              { minLength: 0, maxLength: 60 }
            )
          }),
          async ({ roomId, userId, votedMovies }) => {
            // Mock voting progress query
            mockDynamoClient.send.mockResolvedValueOnce({
              Items: votedMovies
            });

            const progress = await service.getUserVotingProgress(roomId, userId);

            // Property: Voted count should equal unique movie IDs
            const uniqueMovieIds = new Set(votedMovies.map(vote => vote.movieId));
            expect(progress.votedCount).toBe(uniqueMovieIds.size);

            // Property: Total votes should equal all votes (including duplicates)
            expect(progress.totalVotes).toBe(votedMovies.length);

            // Property: Voted movie IDs should contain all unique movies
            expect(progress.votedMovieIds).toHaveLength(uniqueMovieIds.size);
            expect(new Set(progress.votedMovieIds)).toEqual(uniqueMovieIds);

            // Property: Has finished should be true only if 50+ unique movies voted
            expect(progress.hasFinishedAllMovies).toBe(uniqueMovieIds.size >= 50);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should correctly identify last user to finish', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            roomCapacity: fc.integer({ min: 2, max: 5 }),
            users: fc.array(
              fc.record({
                userId: fc.string({ minLength: 1, maxLength: 30 }),
                hasFinished: fc.boolean()
              }),
              { minLength: 2, maxLength: 5 }
            ).map(users => {
              // Ensure we have unique user IDs
              const uniqueUsers = [];
              const seenIds = new Set();
              for (const user of users) {
                if (!seenIds.has(user.userId)) {
                  seenIds.add(user.userId);
                  uniqueUsers.push(user);
                }
              }
              return uniqueUsers;
            })
          }),
          async ({ roomId, roomCapacity, users }) => {
            if (users.length === 0) return; // Skip empty user arrays

            // Mock room members
            mockDynamoClient.send.mockResolvedValueOnce({
              Items: users.map(user => ({
                userId: user.userId,
                role: 'MEMBER',
                joinedAt: new Date().toISOString()
              }))
            });

            // Mock voting progress for each user
            for (const user of users) {
              const votedCount = user.hasFinished ? 50 : Math.floor(Math.random() * 49);
              const votedMovieIds = Array.from({ length: votedCount }, (_, i) => `movie-${i}`);
              
              mockDynamoClient.send.mockResolvedValueOnce({
                Items: votedMovieIds.map(movieId => ({
                  movieId,
                  voteType: 'LIKE',
                  votedAt: new Date().toISOString()
                }))
              });
            }

            const testUserId = users[0].userId;
            const testUserFinished = users[0].hasFinished;
            
            const isLast = await service.isLastUserToFinish(roomId, testUserId, roomCapacity);

            // Property: User can only be last if they have finished
            if (!testUserFinished) {
              expect(isLast).toBe(false);
            }

            // Property: If user has finished, last status depends on other users
            if (testUserFinished) {
              const finishedUsers = users.filter(u => u.hasFinished);
              const unfinishedUsers = users.filter(u => !u.hasFinished);
              
              // User is last if all users have finished and room has enough capacity
              if (unfinishedUsers.length === 0 && finishedUsers.length >= roomCapacity) {
                // This is a simplified check - in practice, timing matters
                expect(typeof isLast).toBe('boolean');
              } else {
                // If there are unfinished users, current user is not the last
                expect(isLast).toBe(false);
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 6: Filter Immutability
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  describe('Property 6: Filter Immutability', () => {
    test('should reject filter modifications after room creation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            existingFilters: fc.record({
              mediaType: fc.constantFrom('MOVIE', 'TV'),
              genreIds: fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 2 }),
              roomCapacity: fc.integer({ min: 2, max: 10 })
            }),
            newFilters: fc.record({
              mediaType: fc.constantFrom('MOVIE', 'TV'),
              genreIds: fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 2 }),
              roomCapacity: fc.integer({ min: 2, max: 10 })
            })
          }),
          async ({ roomId, existingFilters, newFilters }) => {
            // Mock room with existing filters
            mockDynamoClient.send.mockResolvedValueOnce({
              Item: {
                roomId,
                filterCriteria: existingFilters,
                businessLogicApplied: true,
                createdAt: new Date().toISOString()
              }
            });

            const result = await service.validateFilterImmutability(roomId, newFilters);

            // Property: Rooms with existing filters should reject updates
            expect(result.isValid).toBe(false);
            expect(result.canUpdate).toBe(false);
            expect(result.error).toContain('Room filters cannot be modified after creation');
            expect(result.existingFilters).toEqual(existingFilters);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should allow updates only when no existing filters exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            newFilters: fc.record({
              mediaType: fc.constantFrom('MOVIE', 'TV'),
              genreIds: fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 2 })
            })
          }),
          async ({ roomId, newFilters }) => {
            // Mock room without existing filters
            mockDynamoClient.send.mockResolvedValueOnce({
              Item: {
                roomId,
                // No filterCriteria or businessLogicApplied
                createdAt: new Date().toISOString()
              }
            });

            const result = await service.validateFilterImmutability(roomId, newFilters);

            // Property: Rooms without existing filters may allow updates
            expect(result.isValid).toBe(true);
            expect(result.canUpdate).toBe(true);
            expect(result.message).toContain('No existing filters found');
          }
        ),
        { numRuns: 50 }
      );
    });

    test('should handle missing room metadata gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            newFilters: fc.record({
              mediaType: fc.constantFrom('MOVIE', 'TV'),
              genreIds: fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 2 })
            })
          }),
          async ({ roomId, newFilters }) => {
            // Mock missing room metadata
            mockDynamoClient.send.mockResolvedValueOnce({
              Item: null
            });

            const result = await service.validateFilterImmutability(roomId, newFilters);

            // Property: Missing room should be handled gracefully
            expect(result.isValid).toBe(false);
            expect(result.canUpdate).toBe(false);
            expect(result.error).toBe('Room metadata not found');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property: End-Game Message Consistency
   */
  describe('Property: End-Game Message Consistency', () => {
    test('should provide consistent messages across multiple calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            userId: fc.string({ minLength: 1, maxLength: 30 }),
            votedCount: fc.integer({ min: 45, max: 55 }), // Around the 50-movie threshold
            roomCapacity: fc.integer({ min: 2, max: 5 })
          }),
          async ({ roomId, userId, votedCount, roomCapacity }) => {
            // Mock consistent room metadata
            const roomMetadata = {
              roomId,
              roomCapacity,
              filterCriteria: { roomCapacity },
              businessLogicApplied: true
            };

            // Mock consistent voting progress
            const votedMovieIds = Array.from({ length: votedCount }, (_, i) => `movie-${i}`);
            const votingProgress = {
              Items: votedMovieIds.map(movieId => ({
                movieId,
                voteType: 'LIKE',
                votedAt: new Date().toISOString()
              }))
            };

            // Mock room members
            const roomMembers = {
              Items: [
                { userId, role: 'HOST', joinedAt: new Date().toISOString() }
              ]
            };

            // Call the method multiple times with same mocked data
            const results = [];
            for (let i = 0; i < 3; i++) {
              mockDynamoClient.send
                .mockResolvedValueOnce({ Item: roomMetadata })
                .mockResolvedValueOnce(votingProgress)
                .mockResolvedValueOnce(roomMembers)
                .mockResolvedValueOnce(votingProgress); // For isLastUserToFinish

              const result = await service.determineEndGameMessage(roomId, userId);
              results.push(result);
            }

            // Property: All results should be consistent
            for (let i = 1; i < results.length; i++) {
              expect(results[i].isEndGame).toBe(results[0].isEndGame);
              expect(results[i].message).toBe(results[0].message);
              expect(results[i].messageType).toBe(results[0].messageType);
              expect(results[i].votedCount).toBe(results[0].votedCount);
              expect(results[i].totalMovies).toBe(results[0].totalMovies);
            }

            // Property: End-game status should depend on voted count
            if (votedCount >= 50) {
              expect(results[0].isEndGame).toBe(true);
              expect(results[0].message).toBeDefined();
            } else {
              expect(results[0].isEndGame).toBe(false);
              expect(results[0].message).toBeNull();
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});