/**
 * Voting Service Interface
 * Core interface for real-time voting system
 */

export interface VotingSession {
  id: string;
  roomId: string;
  title: string;
  description?: string;
  type: VotingType;
  status: VotingStatus;
  options: VotingOption[];
  settings: VotingSettings;
  createdBy: string;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  results?: VotingResults;
}

export interface VotingOption {
  id: string;
  text: string;
  description?: string;
  imageUrl?: string;
  metadata?: Record<string, any>;
}

export interface VotingSettings {
  timeLimit?: number; // in seconds
  maxVotesPerUser: number;
  allowVoteChanges: boolean;
  showResultsInRealTime: boolean;
  requireAllParticipants: boolean;
  anonymousVoting: boolean;
  autoEndOnAllVotes: boolean;
}

export interface Vote {
  id: string;
  sessionId: string;
  participantId: string;
  optionIds: string[];
  timestamp: Date;
  isAnonymous: boolean;
}

export interface VotingResults {
  totalVotes: number;
  totalParticipants: number;
  participationRate: number;
  optionResults: OptionResult[];
  winningOptions: string[];
  completedAt: Date;
}

export interface OptionResult {
  optionId: string;
  voteCount: number;
  percentage: number;
  voters?: string[]; // participant IDs (if not anonymous)
}

export interface VotingStats {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  totalVotes: number;
  averageParticipationRate: number;
  averageSessionDuration: number; // in minutes
}

export type VotingType = 'single-choice' | 'multiple-choice' | 'ranking' | 'rating';
export type VotingStatus = 'created' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface CreateVotingSessionPayload {
  roomId: string;
  title: string;
  description?: string;
  type: VotingType;
  options: Omit<VotingOption, 'id'>[];
  settings?: Partial<VotingSettings>;
  createdBy: string;
}

export interface UpdateVotingSessionPayload {
  title?: string;
  description?: string;
  options?: Omit<VotingOption, 'id'>[];
  settings?: Partial<VotingSettings>;
}

export interface CastVotePayload {
  sessionId: string;
  participantId: string;
  optionIds: string[];
}

export interface VotingSessionUpdate {
  sessionId: string;
  type: 'session-started' | 'session-ended' | 'vote-cast' | 'results-updated' | 'session-updated';
  data: any;
  timestamp: Date;
}

/**
 * Core Voting Service Interface
 * Handles voting session orchestration and real-time vote collection
 */
export interface IVotingService {
  /**
   * Create a new voting session
   */
  createVotingSession(payload: CreateVotingSessionPayload): Promise<VotingSession>;

  /**
   * Get voting session by ID
   */
  getVotingSession(sessionId: string): Promise<VotingSession | null>;

  /**
   * Get all voting sessions for a room
   */
  getRoomVotingSessions(roomId: string): Promise<VotingSession[]>;

  /**
   * Update voting session
   */
  updateVotingSession(sessionId: string, payload: UpdateVotingSessionPayload, requesterId: string): Promise<VotingSession>;

  /**
   * Start voting session
   */
  startVotingSession(sessionId: string, requesterId: string): Promise<VotingSession>;

  /**
   * End voting session
   */
  endVotingSession(sessionId: string, requesterId: string): Promise<VotingSession>;

  /**
   * Pause voting session
   */
  pauseVotingSession(sessionId: string, requesterId: string): Promise<VotingSession>;

  /**
   * Resume voting session
   */
  resumeVotingSession(sessionId: string, requesterId: string): Promise<VotingSession>;

  /**
   * Cancel voting session
   */
  cancelVotingSession(sessionId: string, requesterId: string): Promise<VotingSession>;

  /**
   * Cast a vote
   */
  castVote(payload: CastVotePayload): Promise<Vote>;

  /**
   * Remove/change a vote
   */
  removeVote(sessionId: string, participantId: string): Promise<void>;

  /**
   * Get votes for a session
   */
  getSessionVotes(sessionId: string): Promise<Vote[]>;

  /**
   * Get participant's vote for a session
   */
  getParticipantVote(sessionId: string, participantId: string): Promise<Vote | null>;

  /**
   * Calculate and get voting results
   */
  getVotingResults(sessionId: string): Promise<VotingResults>;

  /**
   * Get real-time voting statistics
   */
  getVotingStats(): Promise<VotingStats>;

  /**
   * Subscribe to voting session updates
   */
  subscribeToSessionUpdates(sessionId: string, callback: (update: VotingSessionUpdate) => void): Promise<void>;

  /**
   * Unsubscribe from voting session updates
   */
  unsubscribeFromSessionUpdates(sessionId: string, callback: (update: VotingSessionUpdate) => void): Promise<void>;

  /**
   * Clean up expired voting sessions
   */
  cleanupExpiredSessions(): Promise<number>;
}