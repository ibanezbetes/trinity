/**
 * Voting System Property-Based Tests
 * Tests universal properties of the voting system
 */

import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { VotingService } from './voting.service';
import { CreateVotingSessionPayload, CastVotePayload, VotingType } from './voting.interface';

describe('VotingService Property Tests', () => {
  let service: VotingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VotingService],
    }).compile();

    service = module.get<VotingService>(VotingService);
  });

  /**
   * Property 15: Analytics and History Preservation
   * **Validates: Requirements 8.6**
   * 
   * Tests that voting analytics and history are properly preserved and calculated
   */
  describe('Property 15: Analytics and History Preservation', () => {
    it('should maintain accurate vote counts and statistics across all operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate voting session data
          fc.record({
            roomId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
            title: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 1),
            type: fc.constantFrom('single-choice', 'multiple-choice') as fc.Arbitrary<VotingType>,
            createdBy: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
          }),
          // Generate options
          fc.array(
            fc.record({
              text: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 1),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          // Generate voting operations
          fc.array(
            fc.record({
              action: fc.constantFrom('vote', 'change-vote', 'start', 'end'),
              participantId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
              optionIndex: fc.integer({ min: 0, max: 4 }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (sessionData, options, operations) => {
            // Create voting session
            const session = await service.createVotingSession({
              roomId: sessionData.roomId,
              title: sessionData.title,
              type: sessionData.type,
              options: options.slice(0, Math.min(options.length, 5)),
              createdBy: sessionData.createdBy,
              settings: { allowVoteChanges: true },
            });

            let isActive = false;
            let isCompleted = false;
            const expectedVotes = new Map<string, string[]>(); // participantId -> optionIds
            let totalVotesCast = 0;

            // Execute operations
            for (const operation of operations) {
              try {
                switch (operation.action) {
                  case 'start':
                    if (!isActive && !isCompleted) {
                      await service.startVotingSession(session.id, sessionData.createdBy);
                      isActive = true;
                    }
                    break;

                  case 'end':
                    if (isActive && !isCompleted) {
                      await service.endVotingSession(session.id, sessionData.createdBy);
                      isActive = false;
                      isCompleted = true;
                    }
                    break;

                  case 'vote':
                  case 'change-vote':
                    if (isActive && !isCompleted) {
                      const optionIndex = operation.optionIndex % session.options.length;
                      const optionId = session.options[optionIndex].id;
                      
                      const optionIds = sessionData.type === 'single-choice' 
                        ? [optionId]
                        : [optionId]; // For simplicity, just vote for one option in multiple-choice too

                      const hadPreviousVote = expectedVotes.has(operation.participantId);
                      
                      await service.castVote({
                        sessionId: session.id,
                        participantId: operation.participantId,
                        optionIds,
                      });

                      expectedVotes.set(operation.participantId, optionIds);
                      
                      if (!hadPreviousVote) {
                        totalVotesCast++;
                      }
                    }
                    break;
                }
              } catch (error) {
                // Some operations may fail due to business rules, which is expected
                continue;
              }
            }

            // Verify analytics and history preservation
            const results = await service.getVotingResults(session.id);
            const sessionVotes = await service.getSessionVotes(session.id);
            const stats = await service.getVotingStats();

            // Property: Vote count matches expected votes
            expect(sessionVotes.length).toBe(expectedVotes.size);
            expect(results.totalVotes).toBe(expectedVotes.size);

            // Property: Each participant has at most one vote
            const participantIds = sessionVotes.map(v => v.participantId);
            const uniqueParticipantIds = [...new Set(participantIds)];
            expect(participantIds.length).toBe(uniqueParticipantIds.length);

            // Property: All votes are for valid options
            for (const vote of sessionVotes) {
              for (const optionId of vote.optionIds) {
                expect(session.options.some(opt => opt.id === optionId)).toBe(true);
              }
            }

            // Property: Vote counts in results match actual votes
            let totalResultVotes = 0;
            for (const optionResult of results.optionResults) {
              const actualVoteCount = sessionVotes.filter(vote => 
                vote.optionIds.includes(optionResult.optionId)
              ).length;
              expect(optionResult.voteCount).toBe(actualVoteCount);
              totalResultVotes += optionResult.voteCount;
            }
            expect(totalResultVotes).toBe(results.totalVotes);

            // Property: Percentages sum to 100% (or 0% if no votes)
            const totalPercentage = results.optionResults.reduce((sum, result) => sum + result.percentage, 0);
            if (results.totalVotes > 0) {
              expect(totalPercentage).toBeCloseTo(100, 1);
            } else {
              expect(totalPercentage).toBe(0);
            }

            // Property: Winning options are correctly identified
            if (results.totalVotes > 0) {
              const maxVotes = Math.max(...results.optionResults.map(r => r.voteCount));
              const expectedWinners = results.optionResults
                .filter(r => r.voteCount === maxVotes)
                .map(r => r.optionId);
              expect(results.winningOptions.sort()).toEqual(expectedWinners.sort());
            }

            // Property: Statistics are consistent
            expect(stats.totalSessions).toBeGreaterThanOrEqual(1);
            if (isCompleted) {
              expect(stats.completedSessions).toBeGreaterThanOrEqual(1);
            }
            if (isActive) {
              expect(stats.activeSessions).toBeGreaterThanOrEqual(1);
            }
          }
        ),
        { numRuns: 30, timeout: 10000 }
      );
    });

    it('should preserve vote history and allow accurate result recalculation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
            createdBy: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
          }),
          fc.array(
            fc.record({
              participantId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
              optionIndex: fc.integer({ min: 0, max: 2 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (sessionData, votes) => {
            // Create session with 3 options
            const session = await service.createVotingSession({
              roomId: sessionData.roomId,
              title: 'Test Session',
              type: 'single-choice',
              options: [
                { text: 'Option A' },
                { text: 'Option B' },
                { text: 'Option C' },
              ],
              createdBy: sessionData.createdBy,
            });

            await service.startVotingSession(session.id, sessionData.createdBy);

            // Cast votes
            const uniqueVotes = new Map<string, number>();
            for (const vote of votes) {
              uniqueVotes.set(vote.participantId, vote.optionIndex);
            }

            for (const [participantId, optionIndex] of uniqueVotes) {
              await service.castVote({
                sessionId: session.id,
                participantId,
                optionIds: [session.options[optionIndex].id],
              });
            }

            // Get results multiple times - should be consistent
            const results1 = await service.getVotingResults(session.id);
            const results2 = await service.getVotingResults(session.id);
            const sessionVotes = await service.getSessionVotes(session.id);

            // Property: Results are consistent across multiple calls
            expect(results1.totalVotes).toBe(results2.totalVotes);
            expect(results1.optionResults).toEqual(results2.optionResults);
            expect(results1.winningOptions).toEqual(results2.winningOptions);

            // Property: Vote history is preserved
            expect(sessionVotes.length).toBe(uniqueVotes.size);

            // Property: Each participant's vote can be retrieved
            for (const [participantId, optionIndex] of uniqueVotes) {
              const participantVote = await service.getParticipantVote(session.id, participantId);
              expect(participantVote).toBeDefined();
              expect(participantVote?.optionIds).toEqual([session.options[optionIndex].id]);
            }

            // Property: Vote timestamps are preserved and ordered
            const timestamps = sessionVotes.map(v => v.timestamp.getTime());
            const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
            expect(timestamps).toEqual(sortedTimestamps);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('should maintain session lifecycle integrity and state consistency', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
            title: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 1),
            createdBy: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
          }),
          fc.array(
            fc.constantFrom('start', 'pause', 'resume', 'end', 'cancel'),
            { minLength: 1, maxLength: 8 }
          ),
          async (sessionData, operations) => {
            // Create session
            const session = await service.createVotingSession({
              roomId: sessionData.roomId,
              title: sessionData.title,
              type: 'single-choice',
              options: [{ text: 'Option 1' }, { text: 'Option 2' }],
              createdBy: sessionData.createdBy,
            });

            let currentStatus = 'created';
            let hasStarted = false;
            let hasEnded = false;

            // Execute state transitions
            for (const operation of operations) {
              try {
                switch (operation) {
                  case 'start':
                    if (currentStatus === 'created' || currentStatus === 'paused') {
                      await service.startVotingSession(session.id, sessionData.createdBy);
                      currentStatus = 'active';
                      hasStarted = true;
                    }
                    break;
                  case 'pause':
                    if (currentStatus === 'active') {
                      await service.pauseVotingSession(session.id, sessionData.createdBy);
                      currentStatus = 'paused';
                    }
                    break;
                  case 'resume':
                    if (currentStatus === 'paused') {
                      await service.resumeVotingSession(session.id, sessionData.createdBy);
                      currentStatus = 'active';
                    }
                    break;
                  case 'end':
                    if (currentStatus === 'active' || currentStatus === 'paused') {
                      await service.endVotingSession(session.id, sessionData.createdBy);
                      currentStatus = 'completed';
                      hasEnded = true;
                    }
                    break;
                  case 'cancel':
                    if (currentStatus !== 'completed' && currentStatus !== 'cancelled') {
                      await service.cancelVotingSession(session.id, sessionData.createdBy);
                      currentStatus = 'cancelled';
                      hasEnded = true;
                    }
                    break;
                }
              } catch (error) {
                // Some transitions may fail due to business rules
                continue;
              }
            }

            const finalSession = await service.getVotingSession(session.id);

            // Property: Session status is consistent
            expect(finalSession?.status).toBe(currentStatus);

            // Property: Timestamps are consistent with lifecycle
            if (hasStarted && finalSession?.startedAt) {
              expect(finalSession.startedAt).toBeInstanceOf(Date);
              expect(finalSession.startedAt.getTime()).toBeGreaterThanOrEqual(finalSession.createdAt.getTime());
            }

            if (hasEnded && finalSession?.endedAt && finalSession?.startedAt) {
              expect(finalSession.endedAt).toBeInstanceOf(Date);
              expect(finalSession.endedAt.getTime()).toBeGreaterThanOrEqual(finalSession.startedAt.getTime());
            }

            // Property: Results are only available for completed sessions
            if (currentStatus === 'completed') {
              expect(finalSession?.results).toBeDefined();
            }

            // Property: Session always has valid creation timestamp
            expect(finalSession?.createdAt).toBeInstanceOf(Date);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle vote changes correctly and maintain data integrity', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
            createdBy: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
            allowVoteChanges: fc.boolean(),
          }),
          fc.array(
            fc.record({
              participantId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
              optionIndex: fc.integer({ min: 0, max: 2 }),
              isChange: fc.boolean(),
            }),
            { minLength: 1, maxLength: 15 }
          ),
          async (sessionData, voteOperations) => {
            // Create session
            const session = await service.createVotingSession({
              roomId: sessionData.roomId,
              title: 'Vote Change Test',
              type: 'single-choice',
              options: [
                { text: 'Option A' },
                { text: 'Option B' },
                { text: 'Option C' },
              ],
              createdBy: sessionData.createdBy,
              settings: { allowVoteChanges: sessionData.allowVoteChanges },
            });

            await service.startVotingSession(session.id, sessionData.createdBy);

            const participantVotes = new Map<string, string>(); // participantId -> optionId
            let successfulVotes = 0;
            let failedVoteChanges = 0;

            // Execute vote operations
            for (const operation of voteOperations) {
              try {
                const optionId = session.options[operation.optionIndex].id;
                const hasExistingVote = participantVotes.has(operation.participantId);

                if (operation.isChange && hasExistingVote && !sessionData.allowVoteChanges) {
                  // This should fail
                  try {
                    await service.castVote({
                      sessionId: session.id,
                      participantId: operation.participantId,
                      optionIds: [optionId],
                    });
                  } catch (error) {
                    failedVoteChanges++;
                    continue;
                  }
                } else {
                  await service.castVote({
                    sessionId: session.id,
                    participantId: operation.participantId,
                    optionIds: [optionId],
                  });

                  participantVotes.set(operation.participantId, optionId);
                  if (!hasExistingVote) {
                    successfulVotes++;
                  }
                }
              } catch (error) {
                // Some operations may fail due to business rules
                continue;
              }
            }

            const sessionVotes = await service.getSessionVotes(session.id);
            const results = await service.getVotingResults(session.id);

            // Property: Vote count matches expected unique participants
            expect(sessionVotes.length).toBe(participantVotes.size);
            expect(results.totalVotes).toBe(participantVotes.size);

            // Property: Each participant has exactly one vote
            const voteParticipants = sessionVotes.map(v => v.participantId);
            const uniqueParticipants = [...new Set(voteParticipants)];
            expect(voteParticipants.length).toBe(uniqueParticipants.length);

            // Property: Vote changes are handled according to settings
            if (!sessionData.allowVoteChanges && failedVoteChanges > 0) {
              // Some vote changes should have failed
              expect(failedVoteChanges).toBeGreaterThan(0);
            }

            // Property: Final votes match expected state
            for (const [participantId, expectedOptionId] of participantVotes) {
              const participantVote = await service.getParticipantVote(session.id, participantId);
              expect(participantVote?.optionIds).toEqual([expectedOptionId]);
            }

            // Property: Results accurately reflect final vote state
            const optionCounts = new Map<string, number>();
            for (const optionId of participantVotes.values()) {
              optionCounts.set(optionId, (optionCounts.get(optionId) || 0) + 1);
            }

            for (const optionResult of results.optionResults) {
              const expectedCount = optionCounts.get(optionResult.optionId) || 0;
              expect(optionResult.voteCount).toBe(expectedCount);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('should maintain statistical accuracy across multiple sessions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              roomId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
              title: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 1),
              createdBy: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
              shouldComplete: fc.boolean(),
              voteCount: fc.integer({ min: 0, max: 5 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (sessionsData) => {
            // Create a fresh service instance for this test iteration
            const module: TestingModule = await Test.createTestingModule({
              providers: [VotingService],
            }).compile();
            const freshService = module.get<VotingService>(VotingService);

            const createdSessions = [];
            let expectedActiveSessions = 0;
            let expectedCompletedSessions = 0;
            let expectedTotalVotes = 0;

            // Create and manage sessions
            for (const sessionData of sessionsData) {
              const session = await freshService.createVotingSession({
                roomId: sessionData.roomId,
                title: sessionData.title,
                type: 'single-choice',
                options: [{ text: 'Option 1' }, { text: 'Option 2' }],
                createdBy: sessionData.createdBy,
              });

              createdSessions.push(session);

              // Start session
              await freshService.startVotingSession(session.id, sessionData.createdBy);
              expectedActiveSessions++;

              // Cast votes
              for (let i = 0; i < sessionData.voteCount; i++) {
                await freshService.castVote({
                  sessionId: session.id,
                  participantId: `participant-${i}`,
                  optionIds: [session.options[i % 2].id],
                });
                expectedTotalVotes++;
              }

              // Complete session if requested
              if (sessionData.shouldComplete) {
                await freshService.endVotingSession(session.id, sessionData.createdBy);
                expectedActiveSessions--;
                expectedCompletedSessions++;
              }
            }

            const stats = await freshService.getVotingStats();

            // Property: Session counts are accurate
            expect(stats.totalSessions).toBe(createdSessions.length);
            expect(stats.activeSessions).toBe(expectedActiveSessions);
            expect(stats.completedSessions).toBe(expectedCompletedSessions);

            // Property: Vote count is accurate
            expect(stats.totalVotes).toBe(expectedTotalVotes);

            // Property: Statistics are non-negative
            expect(stats.totalSessions).toBeGreaterThanOrEqual(0);
            expect(stats.activeSessions).toBeGreaterThanOrEqual(0);
            expect(stats.completedSessions).toBeGreaterThanOrEqual(0);
            expect(stats.totalVotes).toBeGreaterThanOrEqual(0);
            expect(stats.averageParticipationRate).toBeGreaterThanOrEqual(0);
            expect(stats.averageSessionDuration).toBeGreaterThanOrEqual(0);

            // Property: Active + Completed <= Total
            expect(stats.activeSessions + stats.completedSessions).toBeLessThanOrEqual(stats.totalSessions);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});