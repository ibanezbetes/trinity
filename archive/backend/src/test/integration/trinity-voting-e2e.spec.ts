/**
 * End-to-End Integration Tests for Trinity Voting System
 * Feature: trinity-voting-fixes, Task 11.3
 * 
 * Tests complete voting flows from room creation to match finding
 */

import '../../test-setup-integration';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { AuthService } from '../../modules/auth/auth.service';
import { RoomService } from '../../modules/room/room.service';
import { VoteService } from '../../modules/vote/vote.service';
import { RealtimeService } from '../../modules/realtime/realtime.service';
import { MediaService } from '../../modules/media/media.service';
import * as fc from 'fast-check';

describe('Trinity Voting System - End-to-End Integration Tests', () => {
  let app: INestApplication;
  let authService: AuthService;
  let roomService: RoomService;
  let voteService: VoteService;
  let realtimeService: RealtimeService;
  let mediaService: MediaService;

  let testUsers: any[] = [];
  let testRoom: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get services
    authService = moduleFixture.get<AuthService>(AuthService);
    roomService = moduleFixture.get<RoomService>(RoomService);
    voteService = moduleFixture.get<VoteService>(VoteService);
    realtimeService = moduleFixture.get<RealtimeService>(RealtimeService);
    mediaService = moduleFixture.get<MediaService>(MediaService);

    // Create test users
    for (let i = 0; i < 5; i++) {
      const user = await authService.register({
        email: `e2euser${i}@test.com`,
        password: 'TestPass123!',
        username: `e2euser${i}`,
      });
      testUsers.push(user);
    }
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 15000);

  describe('Complete Voting Flow - Room Creation to Match Finding', () => {
    beforeEach(async () => {
      // Create a fresh room for each test
      testRoom = await roomService.createRoom(testUsers[0].user.id, {
        name: 'E2E Test Room',
        description: 'End-to-end testing room',
        genrePreferences: ['Action', 'Comedy'],
        isPrivate: false,
        maxMembers: 5,
      });

      // Add other users to the room
      for (let i = 1; i < testUsers.length; i++) {
        await roomService.joinRoom(testRoom.id, testUsers[i].user.id);
      }
    });

    afterEach(async () => {
      if (testRoom) {
        try {
          await roomService.deleteRoom(testRoom.id, testUsers[0].user.id);
        } catch (error) {
          // Room might already be deleted
        }
      }
    });

    it('should complete full voting flow with unanimous YES votes leading to match', async () => {
      // Get initial movie queue
      const movieQueue = await mediaService.getMovieQueue(testRoom.id);
      expect(movieQueue).toBeDefined();
      expect(movieQueue.length).toBeGreaterThan(0);

      const targetMovie = movieQueue[0];

      // All users vote YES on the same movie
      const votePromises = testUsers.map(user => 
        voteService.submitVote(testRoom.id, user.user.id, {
          movieId: targetMovie.id,
          voteType: 'LIKE',
        })
      );

      const voteResults = await Promise.all(votePromises);

      // Verify all votes were processed successfully
      voteResults.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Check if match was found (should be true with unanimous YES votes)
      const finalResult = voteResults[voteResults.length - 1];
      expect(finalResult.matchFound).toBe(true);
      expect(finalResult.roomStatus).toBe('MATCHED');

      // Verify room status was updated
      const updatedRoom = await roomService.getRoomById(testRoom.id);
      expect(updatedRoom.status).toBe('MATCHED');
      expect(updatedRoom.resultMovieId).toBe(targetMovie.id);
    });

    it('should handle mixed voting without premature completion', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.constantFrom('LIKE', 'DISLIKE'), { minLength: 5, maxLength: 5 }),
          async (votePattern) => {
            // Reset room status
            await roomService.updateRoomStatus(testRoom.id, 'ACTIVE');

            const movieQueue = await mediaService.getMovieQueue(testRoom.id);
            const targetMovie = movieQueue[0];

            // Apply vote pattern
            const votePromises = testUsers.map((user, index) => 
              voteService.submitVote(testRoom.id, user.user.id, {
                movieId: targetMovie.id,
                voteType: votePattern[index] as 'LIKE' | 'DISLIKE',
              })
            );

            const voteResults = await Promise.all(votePromises);

            // Verify all votes were processed
            voteResults.forEach(result => {
              expect(result.success).toBe(true);
            });

            // Check if match logic is correct
            const allLikes = votePattern.every(vote => vote === 'LIKE');
            const finalResult = voteResults[voteResults.length - 1];

            if (allLikes) {
              expect(finalResult.matchFound).toBe(true);
              expect(finalResult.roomStatus).toBe('MATCHED');
            } else {
              expect(finalResult.matchFound).toBe(false);
              expect(finalResult.roomStatus).toBe('ACTIVE');
            }
          }
        ),
        { numRuns: 10, timeout: 30000 }
      );
    });

    it('should handle sequential voting with progress tracking', async () => {
      const movieQueue = await mediaService.getMovieQueue(testRoom.id);
      const targetMovie = movieQueue[0];

      let currentVoteCount = 0;

      // Vote sequentially and track progress
      for (const user of testUsers) {
        const voteResult = await voteService.submitVote(testRoom.id, user.user.id, {
          movieId: targetMovie.id,
          voteType: 'LIKE',
        });

        currentVoteCount++;

        expect(voteResult.success).toBe(true);
        expect(voteResult.currentVotes).toBe(currentVoteCount);
        expect(voteResult.totalMembers).toBe(testUsers.length);

        // Match should only be found when all users have voted YES
        if (currentVoteCount === testUsers.length) {
          expect(voteResult.matchFound).toBe(true);
          expect(voteResult.roomStatus).toBe('MATCHED');
        } else {
          expect(voteResult.matchFound).toBe(false);
          expect(voteResult.roomStatus).toBe('ACTIVE');
        }
      }
    });

    it('should handle concurrent voting correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.shuffledSubarray(testUsers, { minLength: 3, maxLength: 5 }),
          async (votingUsers) => {
            // Reset room status
            await roomService.updateRoomStatus(testRoom.id, 'ACTIVE');

            const movieQueue = await mediaService.getMovieQueue(testRoom.id);
            const targetMovie = movieQueue[0];

            // Submit concurrent votes
            const concurrentVotes = votingUsers.map(user => 
              voteService.submitVote(testRoom.id, user.user.id, {
                movieId: targetMovie.id,
                voteType: 'LIKE',
              })
            );

            const results = await Promise.all(concurrentVotes);

            // All votes should be processed successfully
            results.forEach(result => {
              expect(result.success).toBe(true);
            });

            // Final vote count should match number of voting users
            const finalResult = results[results.length - 1];
            expect(finalResult.currentVotes).toBe(votingUsers.length);

            // Match should be found only if all room members voted
            if (votingUsers.length === testUsers.length) {
              expect(finalResult.matchFound).toBe(true);
            } else {
              expect(finalResult.matchFound).toBe(false);
            }
          }
        ),
        { numRuns: 8, timeout: 25000 }
      );
    });

    it('should prevent duplicate votes from same user', async () => {
      const movieQueue = await mediaService.getMovieQueue(testRoom.id);
      const targetMovie = movieQueue[0];
      const testUser = testUsers[0];

      // First vote should succeed
      const firstVote = await voteService.submitVote(testRoom.id, testUser.user.id, {
        movieId: targetMovie.id,
        voteType: 'LIKE',
      });

      expect(firstVote.success).toBe(true);
      expect(firstVote.currentVotes).toBe(1);

      // Second vote from same user should be rejected or ignored
      const secondVote = await voteService.submitVote(testRoom.id, testUser.user.id, {
        movieId: targetMovie.id,
        voteType: 'DISLIKE',
      });

      // Vote count should not increase
      expect(secondVote.currentVotes).toBe(1);
    });

    it('should handle room completion flow correctly', async () => {
      const movieQueue = await mediaService.getMovieQueue(testRoom.id);
      
      // Test voting through multiple movies without matches
      for (let i = 0; i < Math.min(3, movieQueue.length); i++) {
        const movie = movieQueue[i];
        
        // First user votes YES, others vote NO (no match)
        await voteService.submitVote(testRoom.id, testUsers[0].user.id, {
          movieId: movie.id,
          voteType: 'LIKE',
        });

        for (let j = 1; j < testUsers.length; j++) {
          const result = await voteService.submitVote(testRoom.id, testUsers[j].user.id, {
            movieId: movie.id,
            voteType: 'DISLIKE',
          });

          expect(result.success).toBe(true);
          expect(result.matchFound).toBe(false);
        }
      }

      // Room should still be active after no matches
      const roomStatus = await roomService.getRoomById(testRoom.id);
      expect(roomStatus.status).toBe('ACTIVE');
    });
  });

  describe('Error Handling in Voting Flow', () => {
    beforeEach(async () => {
      testRoom = await roomService.createRoom(testUsers[0].user.id, {
        name: 'Error Test Room',
        description: 'Testing error scenarios',
        isPrivate: false,
        maxMembers: 3,
      });
    });

    it('should handle invalid movie IDs gracefully', async () => {
      const invalidMovieId = 'invalid-movie-id-12345';

      const voteResult = await voteService.submitVote(testRoom.id, testUsers[0].user.id, {
        movieId: invalidMovieId,
        voteType: 'LIKE',
      });

      expect(voteResult.success).toBe(false);
      expect(voteResult.errorMessage).toBeDefined();
      expect(voteResult.errorMessage).toContain('movie');
    });

    it('should handle invalid room IDs gracefully', async () => {
      const invalidRoomId = 'invalid-room-id-12345';
      const movieQueue = await mediaService.getMovieQueue(testRoom.id);
      const validMovie = movieQueue[0];

      const voteResult = await voteService.submitVote(invalidRoomId, testUsers[0].user.id, {
        movieId: validMovie.id,
        voteType: 'LIKE',
      });

      expect(voteResult.success).toBe(false);
      expect(voteResult.errorMessage).toBeDefined();
      expect(voteResult.errorMessage).toContain('room');
    });

    it('should handle unauthorized users gracefully', async () => {
      const unauthorizedUserId = 'unauthorized-user-12345';
      const movieQueue = await mediaService.getMovieQueue(testRoom.id);
      const validMovie = movieQueue[0];

      const voteResult = await voteService.submitVote(testRoom.id, unauthorizedUserId, {
        movieId: validMovie.id,
        voteType: 'LIKE',
      });

      expect(voteResult.success).toBe(false);
      expect(voteResult.errorMessage).toBeDefined();
    });

    it('should maintain data consistency during error scenarios', async () => {
      const movieQueue = await mediaService.getMovieQueue(testRoom.id);
      const validMovie = movieQueue[0];

      // Add one user to room
      await roomService.joinRoom(testRoom.id, testUsers[1].user.id);

      // Valid vote
      const validVote = await voteService.submitVote(testRoom.id, testUsers[0].user.id, {
        movieId: validMovie.id,
        voteType: 'LIKE',
      });

      expect(validVote.success).toBe(true);
      expect(validVote.currentVotes).toBe(1);

      // Invalid vote attempt
      await voteService.submitVote(testRoom.id, 'invalid-user', {
        movieId: validMovie.id,
        voteType: 'LIKE',
      });

      // Valid vote count should remain unchanged
      const secondValidVote = await voteService.submitVote(testRoom.id, testUsers[1].user.id, {
        movieId: validMovie.id,
        voteType: 'LIKE',
      });

      expect(secondValidVote.success).toBe(true);
      expect(secondValidVote.currentVotes).toBe(2);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle voting performance under load', async () => {
      testRoom = await roomService.createRoom(testUsers[0].user.id, {
        name: 'Performance Test Room',
        description: 'Testing voting performance',
        isPrivate: false,
        maxMembers: 10,
      });

      const movieQueue = await mediaService.getMovieQueue(testRoom.id);
      const targetMovie = movieQueue[0];

      const startTime = Date.now();

      // Simulate concurrent votes from all users
      const votePromises = testUsers.map(user => 
        voteService.submitVote(testRoom.id, user.user.id, {
          movieId: targetMovie.id,
          voteType: 'LIKE',
        })
      );

      const results = await Promise.all(votePromises);
      const executionTime = Date.now() - startTime;

      // Should complete within reasonable time (5 seconds for 5 concurrent votes)
      expect(executionTime).toBeLessThan(5000);

      // All votes should be processed successfully
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Final result should show match found
      const finalResult = results[results.length - 1];
      expect(finalResult.matchFound).toBe(true);
    });

    it('should maintain consistency with rapid sequential votes', async () => {
      testRoom = await roomService.createRoom(testUsers[0].user.id, {
        name: 'Rapid Vote Test Room',
        description: 'Testing rapid sequential voting',
        isPrivate: false,
        maxMembers: 5,
      });

      const movieQueue = await mediaService.getMovieQueue(testRoom.id);
      const targetMovie = movieQueue[0];

      // Submit votes in rapid succession
      const results = [];
      for (const user of testUsers) {
        const result = await voteService.submitVote(testRoom.id, user.user.id, {
          movieId: targetMovie.id,
          voteType: 'LIKE',
        });
        results.push(result);
        
        // Small delay to simulate rapid but not simultaneous voting
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Verify vote counts are consistent and incremental
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.currentVotes).toBe(index + 1);
      });

      // Final result should show match
      expect(results[results.length - 1].matchFound).toBe(true);
    });
  });
});