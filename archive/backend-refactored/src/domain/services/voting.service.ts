/**
 * Voting Service Implementation
 * Handles real-time voting session orchestration and vote collection
 */

import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  IVotingService,
  VotingSession,
  Vote,
  VotingOption,
  VotingResults,
  VotingStats,
  VotingSessionUpdate,
  CreateVotingSessionPayload,
  UpdateVotingSessionPayload,
  CastVotePayload,
  VotingSettings,
  OptionResult,
  VotingStatus,
} from './voting.interface';

@Injectable()
export class VotingService implements IVotingService {
  private sessions = new Map<string, VotingSession>();
  private votes = new Map<string, Vote>();
  private sessionVotes = new Map<string, Set<string>>(); // sessionId -> voteIds
  private participantVotes = new Map<string, Map<string, string>>(); // sessionId -> participantId -> voteId
  private sessionSubscribers = new Map<string, Set<(update: VotingSessionUpdate) => void>>();

  async createVotingSession(payload: CreateVotingSessionPayload): Promise<VotingSession> {
    const sessionId = this.generateSessionId();
    
    const defaultSettings: VotingSettings = {
      maxVotesPerUser: payload.type === 'multiple-choice' ? payload.options.length : 1,
      allowVoteChanges: true,
      showResultsInRealTime: false,
      requireAllParticipants: false,
      anonymousVoting: false,
      autoEndOnAllVotes: false,
    };

    // Generate option IDs
    const options: VotingOption[] = payload.options.map(option => ({
      ...option,
      id: this.generateOptionId(),
    }));

    const session: VotingSession = {
      id: sessionId,
      roomId: payload.roomId,
      title: payload.title,
      description: payload.description,
      type: payload.type,
      status: 'created',
      options,
      settings: { ...defaultSettings, ...payload.settings },
      createdBy: payload.createdBy,
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.sessionVotes.set(sessionId, new Set());
    this.participantVotes.set(sessionId, new Map());

    return session;
  }

  async getVotingSession(sessionId: string): Promise<VotingSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async getRoomVotingSessions(roomId: string): Promise<VotingSession[]> {
    const sessions: VotingSession[] = [];
    
    for (const session of this.sessions.values()) {
      if (session.roomId === roomId) {
        sessions.push(session);
      }
    }

    return sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateVotingSession(sessionId: string, payload: UpdateVotingSessionPayload, requesterId: string): Promise<VotingSession> {
    const session = await this.getVotingSession(sessionId);
    if (!session) {
      throw new NotFoundException('Voting session not found');
    }

    if (session.createdBy !== requesterId) {
      throw new ForbiddenException('Only the session creator can update the session');
    }

    if (session.status === 'active') {
      throw new BadRequestException('Cannot update an active voting session');
    }

    // Update session properties
    if (payload.title !== undefined) session.title = payload.title;
    if (payload.description !== undefined) session.description = payload.description;
    if (payload.settings) {
      session.settings = { ...session.settings, ...payload.settings };
    }
    if (payload.options) {
      session.options = payload.options.map(option => ({
        ...option,
        id: this.generateOptionId(),
      }));
    }

    this.sessions.set(sessionId, session);

    // Notify subscribers
    await this.notifySubscribers(sessionId, {
      sessionId,
      type: 'session-updated',
      data: session,
      timestamp: new Date(),
    });

    return session;
  }

  async startVotingSession(sessionId: string, requesterId: string): Promise<VotingSession> {
    const session = await this.getVotingSession(sessionId);
    if (!session) {
      throw new NotFoundException('Voting session not found');
    }

    if (session.createdBy !== requesterId) {
      throw new ForbiddenException('Only the session creator can start the session');
    }

    if (session.status !== 'created' && session.status !== 'paused') {
      throw new BadRequestException('Session cannot be started from current status');
    }

    session.status = 'active';
    session.startedAt = new Date();
    this.sessions.set(sessionId, session);

    // Set up auto-end timer if time limit is set
    if (session.settings.timeLimit) {
      setTimeout(async () => {
        const currentSession = await this.getVotingSession(sessionId);
        if (currentSession && currentSession.status === 'active') {
          await this.endVotingSession(sessionId, requesterId);
        }
      }, session.settings.timeLimit * 1000);
    }

    // Notify subscribers
    await this.notifySubscribers(sessionId, {
      sessionId,
      type: 'session-started',
      data: session,
      timestamp: new Date(),
    });

    return session;
  }

  async endVotingSession(sessionId: string, requesterId: string): Promise<VotingSession> {
    const session = await this.getVotingSession(sessionId);
    if (!session) {
      throw new NotFoundException('Voting session not found');
    }

    if (session.createdBy !== requesterId) {
      throw new ForbiddenException('Only the session creator can end the session');
    }

    if (session.status !== 'active' && session.status !== 'paused') {
      throw new BadRequestException('Session is not active or paused');
    }

    session.status = 'completed';
    session.endedAt = new Date();
    
    // Calculate final results
    session.results = await this.calculateResults(sessionId);
    
    this.sessions.set(sessionId, session);

    // Notify subscribers
    await this.notifySubscribers(sessionId, {
      sessionId,
      type: 'session-ended',
      data: session,
      timestamp: new Date(),
    });

    return session;
  }

  async pauseVotingSession(sessionId: string, requesterId: string): Promise<VotingSession> {
    const session = await this.getVotingSession(sessionId);
    if (!session) {
      throw new NotFoundException('Voting session not found');
    }

    if (session.createdBy !== requesterId) {
      throw new ForbiddenException('Only the session creator can pause the session');
    }

    if (session.status !== 'active') {
      throw new BadRequestException('Session is not active');
    }

    session.status = 'paused';
    this.sessions.set(sessionId, session);

    return session;
  }

  async resumeVotingSession(sessionId: string, requesterId: string): Promise<VotingSession> {
    const session = await this.getVotingSession(sessionId);
    if (!session) {
      throw new NotFoundException('Voting session not found');
    }

    if (session.createdBy !== requesterId) {
      throw new ForbiddenException('Only the session creator can resume the session');
    }

    if (session.status !== 'paused') {
      throw new BadRequestException('Session is not paused');
    }

    session.status = 'active';
    this.sessions.set(sessionId, session);

    return session;
  }

  async cancelVotingSession(sessionId: string, requesterId: string): Promise<VotingSession> {
    const session = await this.getVotingSession(sessionId);
    if (!session) {
      throw new NotFoundException('Voting session not found');
    }

    if (session.createdBy !== requesterId) {
      throw new ForbiddenException('Only the session creator can cancel the session');
    }

    if (session.status === 'completed' || session.status === 'cancelled') {
      throw new BadRequestException('Session is already completed or cancelled');
    }

    session.status = 'cancelled';
    session.endedAt = new Date();
    this.sessions.set(sessionId, session);

    return session;
  }

  async castVote(payload: CastVotePayload): Promise<Vote> {
    const session = await this.getVotingSession(payload.sessionId);
    if (!session) {
      throw new NotFoundException('Voting session not found');
    }

    if (session.status !== 'active') {
      throw new BadRequestException('Voting session is not active');
    }

    // Validate option IDs
    const validOptionIds = new Set(session.options.map(opt => opt.id));
    for (const optionId of payload.optionIds) {
      if (!validOptionIds.has(optionId)) {
        throw new BadRequestException(`Invalid option ID: ${optionId}`);
      }
    }

    // Validate vote count based on session type and settings
    if (session.type === 'single-choice' && payload.optionIds.length !== 1) {
      throw new BadRequestException('Single-choice voting requires exactly one option');
    }

    if (payload.optionIds.length > session.settings.maxVotesPerUser) {
      throw new BadRequestException(`Maximum ${session.settings.maxVotesPerUser} votes allowed`);
    }

    // Check if participant already voted
    const participantVotes = this.participantVotes.get(payload.sessionId);
    const existingVoteId = participantVotes?.get(payload.participantId);

    if (existingVoteId && !session.settings.allowVoteChanges) {
      throw new BadRequestException('Vote changes are not allowed for this session');
    }

    // Remove existing vote if changing
    if (existingVoteId) {
      await this.removeVote(payload.sessionId, payload.participantId);
    }

    // Create new vote
    const voteId = this.generateVoteId();
    const vote: Vote = {
      id: voteId,
      sessionId: payload.sessionId,
      participantId: payload.participantId,
      optionIds: [...payload.optionIds],
      timestamp: new Date(),
      isAnonymous: session.settings.anonymousVoting,
    };

    // Store vote
    this.votes.set(voteId, vote);
    this.sessionVotes.get(payload.sessionId)!.add(voteId);
    this.participantVotes.get(payload.sessionId)!.set(payload.participantId, voteId);

    // Check if all participants have voted and auto-end is enabled
    if (session.settings.autoEndOnAllVotes) {
      const totalVotes = this.sessionVotes.get(payload.sessionId)!.size;
      // Note: In a real implementation, you'd get the actual participant count from the room service
      // For now, we'll skip this check
    }

    // Notify subscribers
    await this.notifySubscribers(payload.sessionId, {
      sessionId: payload.sessionId,
      type: 'vote-cast',
      data: { vote, results: session.settings.showResultsInRealTime ? await this.calculateResults(payload.sessionId) : null },
      timestamp: new Date(),
    });

    return vote;
  }

  async removeVote(sessionId: string, participantId: string): Promise<void> {
    const participantVotes = this.participantVotes.get(sessionId);
    const voteId = participantVotes?.get(participantId);

    if (voteId) {
      this.votes.delete(voteId);
      this.sessionVotes.get(sessionId)?.delete(voteId);
      participantVotes.delete(participantId);
    }
  }

  async getSessionVotes(sessionId: string): Promise<Vote[]> {
    const session = await this.getVotingSession(sessionId);
    if (!session) {
      throw new NotFoundException('Voting session not found');
    }

    const voteIds = this.sessionVotes.get(sessionId) || new Set();
    const votes: Vote[] = [];

    for (const voteId of voteIds) {
      const vote = this.votes.get(voteId);
      if (vote) {
        votes.push(vote);
      }
    }

    return votes.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async getParticipantVote(sessionId: string, participantId: string): Promise<Vote | null> {
    const participantVotes = this.participantVotes.get(sessionId);
    const voteId = participantVotes?.get(participantId);

    if (voteId) {
      return this.votes.get(voteId) || null;
    }

    return null;
  }

  async getVotingResults(sessionId: string): Promise<VotingResults> {
    const session = await this.getVotingSession(sessionId);
    if (!session) {
      throw new NotFoundException('Voting session not found');
    }

    return this.calculateResults(sessionId);
  }

  async getVotingStats(): Promise<VotingStats> {
    const totalSessions = this.sessions.size;
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.status === 'active').length;
    const completedSessions = Array.from(this.sessions.values()).filter(s => s.status === 'completed').length;
    
    let totalVotes = 0;
    let totalParticipationRate = 0;
    let totalDuration = 0;
    let sessionsWithDuration = 0;

    for (const session of this.sessions.values()) {
      const sessionVoteCount = this.sessionVotes.get(session.id)?.size || 0;
      totalVotes += sessionVoteCount;

      if (session.results) {
        totalParticipationRate += session.results.participationRate;
      }

      if (session.startedAt && session.endedAt) {
        totalDuration += session.endedAt.getTime() - session.startedAt.getTime();
        sessionsWithDuration++;
      }
    }

    const averageParticipationRate = completedSessions > 0 ? totalParticipationRate / completedSessions : 0;
    const averageSessionDuration = sessionsWithDuration > 0 ? totalDuration / sessionsWithDuration / (1000 * 60) : 0;

    return {
      totalSessions,
      activeSessions,
      completedSessions,
      totalVotes,
      averageParticipationRate,
      averageSessionDuration,
    };
  }

  async subscribeToSessionUpdates(sessionId: string, callback: (update: VotingSessionUpdate) => void): Promise<void> {
    if (!this.sessionSubscribers.has(sessionId)) {
      this.sessionSubscribers.set(sessionId, new Set());
    }
    this.sessionSubscribers.get(sessionId)!.add(callback);
  }

  async unsubscribeFromSessionUpdates(sessionId: string, callback: (update: VotingSessionUpdate) => void): Promise<void> {
    const subscribers = this.sessionSubscribers.get(sessionId);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.sessionSubscribers.delete(sessionId);
      }
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    const now = new Date();
    const expiredThreshold = 24 * 60 * 60 * 1000; // 24 hours
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions) {
      const lastActivity = session.endedAt || session.createdAt;
      const isExpired = (now.getTime() - lastActivity.getTime()) > expiredThreshold;
      
      if (isExpired && (session.status === 'completed' || session.status === 'cancelled')) {
        // Clean up session data
        this.sessions.delete(sessionId);
        
        // Clean up votes
        const voteIds = this.sessionVotes.get(sessionId) || new Set();
        for (const voteId of voteIds) {
          this.votes.delete(voteId);
        }
        this.sessionVotes.delete(sessionId);
        this.participantVotes.delete(sessionId);
        this.sessionSubscribers.delete(sessionId);
        
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  // Private helper methods

  private async calculateResults(sessionId: string): Promise<VotingResults> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('Voting session not found');
    }

    const votes = await this.getSessionVotes(sessionId);
    const totalVotes = votes.length;
    
    // Note: In a real implementation, you'd get the actual participant count from the room service
    const totalParticipants = Math.max(totalVotes, 1); // Placeholder
    const participationRate = totalParticipants > 0 ? (totalVotes / totalParticipants) * 100 : 0;

    // Count votes per option
    const optionVoteCounts = new Map<string, number>();
    const optionVoters = new Map<string, string[]>();

    for (const option of session.options) {
      optionVoteCounts.set(option.id, 0);
      optionVoters.set(option.id, []);
    }

    for (const vote of votes) {
      for (const optionId of vote.optionIds) {
        const currentCount = optionVoteCounts.get(optionId) || 0;
        optionVoteCounts.set(optionId, currentCount + 1);
        
        if (!session.settings.anonymousVoting) {
          optionVoters.get(optionId)?.push(vote.participantId);
        }
      }
    }

    // Create option results
    const optionResults: OptionResult[] = session.options.map(option => {
      const voteCount = optionVoteCounts.get(option.id) || 0;
      const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
      
      return {
        optionId: option.id,
        voteCount,
        percentage,
        voters: session.settings.anonymousVoting ? undefined : optionVoters.get(option.id),
      };
    });

    // Find winning options
    const maxVotes = Math.max(...optionResults.map(r => r.voteCount));
    const winningOptions = optionResults
      .filter(r => r.voteCount === maxVotes && maxVotes > 0)
      .map(r => r.optionId);

    return {
      totalVotes,
      totalParticipants,
      participationRate,
      optionResults,
      winningOptions,
      completedAt: new Date(),
    };
  }

  private async notifySubscribers(sessionId: string, update: VotingSessionUpdate): Promise<void> {
    const subscribers = this.sessionSubscribers.get(sessionId);
    if (subscribers) {
      for (const callback of subscribers) {
        try {
          callback(update);
        } catch (error) {
          console.error('Error notifying subscriber:', error);
        }
      }
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateVoteId(): string {
    return `vote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateOptionId(): string {
    return `option_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}