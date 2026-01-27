/**
 * Voting Service Unit Tests
 * Tests for voting session orchestration and vote collection
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { VotingService } from './voting.service';
import { CreateVotingSessionPayload, CastVotePayload, UpdateVotingSessionPayload } from './voting.interface';

describe('VotingService', () => {
  let service: VotingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VotingService],
    }).compile();

    service = module.get<VotingService>(VotingService);
  });

  describe('createVotingSession', () => {
    it('should create a single-choice voting session', async () => {
      const payload: CreateVotingSessionPayload = {
        roomId: 'room-123',
        title: 'Choose a movie',
        type: 'single-choice',
        options: [
          { text: 'Movie A' },
          { text: 'Movie B' },
          { text: 'Movie C' },
        ],
        createdBy: 'user-123',
      };

      const session = await service.createVotingSession(payload);

      expect(session).toBeDefined();
      expect(session.roomId).toBe(payload.roomId);
      expect(session.title).toBe(payload.title);
      expect(session.type).toBe(payload.type);
      expect(session.status).toBe('created');
      expect(session.options).toHaveLength(3);
      expect(session.options[0].id).toBeDefined();
      expect(session.settings.maxVotesPerUser).toBe(1);
    });

    it('should create a multiple-choice voting session', async () => {
      const payload: CreateVotingSessionPayload = {
        roomId: 'room-123',
        title: 'Choose genres',
        type: 'multiple-choice',
        options: [
          { text: 'Action' },
          { text: 'Comedy' },
          { text: 'Drama' },
        ],
        createdBy: 'user-123',
      };

      const session = await service.createVotingSession(payload);

      expect(session.type).toBe('multiple-choice');
      expect(session.settings.maxVotesPerUser).toBe(3); // Same as number of options
    });

    it('should create session with custom settings', async () => {
      const payload: CreateVotingSessionPayload = {
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }, { text: 'Option 2' }],
        settings: {
          timeLimit: 300,
          allowVoteChanges: false,
          anonymousVoting: true,
        },
        createdBy: 'user-123',
      };

      const session = await service.createVotingSession(payload);

      expect(session.settings.timeLimit).toBe(300);
      expect(session.settings.allowVoteChanges).toBe(false);
      expect(session.settings.anonymousVoting).toBe(true);
    });
  });

  describe('getVotingSession', () => {
    it('should return session if exists', async () => {
      const payload: CreateVotingSessionPayload = {
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      };

      const createdSession = await service.createVotingSession(payload);
      const foundSession = await service.getVotingSession(createdSession.id);

      expect(foundSession).toEqual(createdSession);
    });

    it('should return null if session does not exist', async () => {
      const session = await service.getVotingSession('non-existent-id');
      expect(session).toBeNull();
    });
  });

  describe('getRoomVotingSessions', () => {
    it('should return sessions for a room', async () => {
      const roomId = 'room-123';
      
      const session1 = await service.createVotingSession({
        roomId,
        title: 'Session 1',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10)); // Increased delay

      const session2 = await service.createVotingSession({
        roomId,
        title: 'Session 2',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      // Different room
      await service.createVotingSession({
        roomId: 'room-456',
        title: 'Session 3',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      const sessions = await service.getRoomVotingSessions(roomId);

      expect(sessions).toHaveLength(2);
      
      // Verify sessions are ordered by creation time (most recent first)
      expect(sessions[0].createdAt.getTime()).toBeGreaterThanOrEqual(sessions[1].createdAt.getTime());
      
      // Verify both sessions are present
      const sessionTitles = sessions.map(s => s.title).sort();
      expect(sessionTitles).toEqual(['Session 1', 'Session 2']);
    });
  });

  describe('updateVotingSession', () => {
    it('should update session by creator', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Original Title',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      const updatePayload: UpdateVotingSessionPayload = {
        title: 'Updated Title',
        settings: { timeLimit: 600 },
      };

      const updatedSession = await service.updateVotingSession(session.id, updatePayload, 'user-123');

      expect(updatedSession.title).toBe('Updated Title');
      expect(updatedSession.settings.timeLimit).toBe(600);
    });

    it('should throw ForbiddenException for non-creator', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      const updatePayload: UpdateVotingSessionPayload = {
        title: 'Updated Title',
      };

      await expect(
        service.updateVotingSession(session.id, updatePayload, 'other-user')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for active session', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      await service.startVotingSession(session.id, 'user-123');

      const updatePayload: UpdateVotingSessionPayload = {
        title: 'Updated Title',
      };

      await expect(
        service.updateVotingSession(session.id, updatePayload, 'user-123')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('startVotingSession', () => {
    it('should start a created session', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      const startedSession = await service.startVotingSession(session.id, 'user-123');

      expect(startedSession.status).toBe('active');
      expect(startedSession.startedAt).toBeDefined();
    });

    it('should throw ForbiddenException for non-creator', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      await expect(
        service.startVotingSession(session.id, 'other-user')
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('endVotingSession', () => {
    it('should end an active session', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      await service.startVotingSession(session.id, 'user-123');
      const endedSession = await service.endVotingSession(session.id, 'user-123');

      expect(endedSession.status).toBe('completed');
      expect(endedSession.endedAt).toBeDefined();
      expect(endedSession.results).toBeDefined();
    });
  });

  describe('castVote', () => {
    it('should cast a single-choice vote', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }, { text: 'Option 2' }],
        createdBy: 'user-123',
      });

      await service.startVotingSession(session.id, 'user-123');

      const votePayload: CastVotePayload = {
        sessionId: session.id,
        participantId: 'participant-456',
        optionIds: [session.options[0].id],
      };

      const vote = await service.castVote(votePayload);

      expect(vote.sessionId).toBe(session.id);
      expect(vote.participantId).toBe('participant-456');
      expect(vote.optionIds).toEqual([session.options[0].id]);
    });

    it('should cast a multiple-choice vote', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'multiple-choice',
        options: [{ text: 'Option 1' }, { text: 'Option 2' }, { text: 'Option 3' }],
        createdBy: 'user-123',
      });

      await service.startVotingSession(session.id, 'user-123');

      const votePayload: CastVotePayload = {
        sessionId: session.id,
        participantId: 'participant-456',
        optionIds: [session.options[0].id, session.options[2].id],
      };

      const vote = await service.castVote(votePayload);

      expect(vote.optionIds).toHaveLength(2);
      expect(vote.optionIds).toContain(session.options[0].id);
      expect(vote.optionIds).toContain(session.options[2].id);
    });

    it('should throw BadRequestException for inactive session', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      const votePayload: CastVotePayload = {
        sessionId: session.id,
        participantId: 'participant-456',
        optionIds: [session.options[0].id],
      };

      await expect(service.castVote(votePayload)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid option ID', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      await service.startVotingSession(session.id, 'user-123');

      const votePayload: CastVotePayload = {
        sessionId: session.id,
        participantId: 'participant-456',
        optionIds: ['invalid-option-id'],
      };

      await expect(service.castVote(votePayload)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for multiple options in single-choice', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }, { text: 'Option 2' }],
        createdBy: 'user-123',
      });

      await service.startVotingSession(session.id, 'user-123');

      const votePayload: CastVotePayload = {
        sessionId: session.id,
        participantId: 'participant-456',
        optionIds: [session.options[0].id, session.options[1].id],
      };

      await expect(service.castVote(votePayload)).rejects.toThrow(BadRequestException);
    });

    it('should allow vote changes when enabled', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }, { text: 'Option 2' }],
        settings: { allowVoteChanges: true },
        createdBy: 'user-123',
      });

      await service.startVotingSession(session.id, 'user-123');

      // First vote
      await service.castVote({
        sessionId: session.id,
        participantId: 'participant-456',
        optionIds: [session.options[0].id],
      });

      // Change vote
      const newVote = await service.castVote({
        sessionId: session.id,
        participantId: 'participant-456',
        optionIds: [session.options[1].id],
      });

      expect(newVote.optionIds).toEqual([session.options[1].id]);

      // Should only have one vote for this participant
      const participantVote = await service.getParticipantVote(session.id, 'participant-456');
      expect(participantVote?.optionIds).toEqual([session.options[1].id]);
    });

    it('should reject vote changes when disabled', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }, { text: 'Option 2' }],
        settings: { allowVoteChanges: false },
        createdBy: 'user-123',
      });

      await service.startVotingSession(session.id, 'user-123');

      // First vote
      await service.castVote({
        sessionId: session.id,
        participantId: 'participant-456',
        optionIds: [session.options[0].id],
      });

      // Try to change vote
      await expect(
        service.castVote({
          sessionId: session.id,
          participantId: 'participant-456',
          optionIds: [session.options[1].id],
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getVotingResults', () => {
    it('should calculate voting results correctly', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }, { text: 'Option 2' }, { text: 'Option 3' }],
        createdBy: 'user-123',
      });

      await service.startVotingSession(session.id, 'user-123');

      // Cast votes
      await service.castVote({
        sessionId: session.id,
        participantId: 'participant-1',
        optionIds: [session.options[0].id],
      });

      await service.castVote({
        sessionId: session.id,
        participantId: 'participant-2',
        optionIds: [session.options[0].id],
      });

      await service.castVote({
        sessionId: session.id,
        participantId: 'participant-3',
        optionIds: [session.options[1].id],
      });

      const results = await service.getVotingResults(session.id);

      expect(results.totalVotes).toBe(3);
      expect(results.optionResults).toHaveLength(3);
      
      const option1Result = results.optionResults.find(r => r.optionId === session.options[0].id);
      const option2Result = results.optionResults.find(r => r.optionId === session.options[1].id);
      const option3Result = results.optionResults.find(r => r.optionId === session.options[2].id);

      expect(option1Result?.voteCount).toBe(2);
      expect(option1Result?.percentage).toBeCloseTo(66.67, 1);
      expect(option2Result?.voteCount).toBe(1);
      expect(option2Result?.percentage).toBeCloseTo(33.33, 1);
      expect(option3Result?.voteCount).toBe(0);
      expect(option3Result?.percentage).toBe(0);

      expect(results.winningOptions).toEqual([session.options[0].id]);
    });
  });

  describe('getVotingStats', () => {
    it('should return correct voting statistics', async () => {
      // Create multiple sessions
      const session1 = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Session 1',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      const session2 = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Session 2',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      // Start one session
      await service.startVotingSession(session1.id, 'user-123');

      // Complete another session
      await service.startVotingSession(session2.id, 'user-123');
      await service.endVotingSession(session2.id, 'user-123');

      const stats = await service.getVotingStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(1);
      expect(stats.completedSessions).toBe(1);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should clean up expired completed sessions', async () => {
      const session = await service.createVotingSession({
        roomId: 'room-123',
        title: 'Test Session',
        type: 'single-choice',
        options: [{ text: 'Option 1' }],
        createdBy: 'user-123',
      });

      await service.startVotingSession(session.id, 'user-123');
      await service.endVotingSession(session.id, 'user-123');

      // Mock old session by manipulating the internal state
      const sessions = (service as any).sessions;
      const sessionData = sessions.get(session.id);
      sessionData.endedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      sessions.set(session.id, sessionData);

      const cleanedCount = await service.cleanupExpiredSessions();

      expect(cleanedCount).toBe(1);
      
      const foundSession = await service.getVotingSession(session.id);
      expect(foundSession).toBeNull();
    });
  });
});