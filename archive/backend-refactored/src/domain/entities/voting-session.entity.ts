/**
 * Voting Session Domain Entity
 * Core business entity representing a voting session in the Trinity system
 */

export type VotingType = 'movie_selection' | 'rating' | 'custom';
export type VotingStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export interface VotingOption {
  id: string;
  title: string;
  description?: string;
  movieId?: string;
  imageUrl?: string;
}

export interface Vote {
  id: string;
  sessionId: string;
  userId: string;
  optionId: string;
  timestamp: Date;
  weight: number;
}

export interface VotingResults {
  totalVotes: number;
  results: Array<{
    optionId: string;
    votes: number;
    percentage: number;
  }>;
  winningOptionId?: string;
}

export class VotingSession {
  constructor(
    public readonly id: string,
    public readonly roomId: string,
    public readonly type: VotingType,
    public readonly title: string,
    public readonly options: VotingOption[],
    public readonly createdBy: string,
    public readonly votes: Vote[] = [],
    public readonly status: VotingStatus = 'pending',
    public readonly startTime: Date = new Date(),
    public readonly endTime?: Date,
    public readonly results?: VotingResults,
    public readonly description?: string,
  ) {}

  /**
   * Starts the voting session
   */
  start(): VotingSession {
    if (this.status !== 'pending') {
      throw new Error('Voting session can only be started from pending status');
    }

    return new VotingSession(
      this.id,
      this.roomId,
      this.type,
      this.title,
      this.options,
      this.createdBy,
      this.votes,
      'active',
      new Date(),
      this.endTime,
      this.results,
      this.description,
    );
  }

  /**
   * Adds a vote to the session
   */
  addVote(vote: Vote): VotingSession {
    if (this.status !== 'active') {
      throw new Error('Cannot vote on inactive session');
    }

    // Check if user already voted
    if (this.votes.some(v => v.userId === vote.userId)) {
      throw new Error('User has already voted in this session');
    }

    // Validate option exists
    if (!this.options.some(option => option.id === vote.optionId)) {
      throw new Error('Invalid voting option');
    }

    return new VotingSession(
      this.id,
      this.roomId,
      this.type,
      this.title,
      this.options,
      this.createdBy,
      [...this.votes, vote],
      this.status,
      this.startTime,
      this.endTime,
      this.results,
      this.description,
    );
  }

  /**
   * Completes the voting session and calculates results
   */
  complete(): VotingSession {
    if (this.status !== 'active') {
      throw new Error('Can only complete active voting sessions');
    }

    const results = this.calculateResults();

    return new VotingSession(
      this.id,
      this.roomId,
      this.type,
      this.title,
      this.options,
      this.createdBy,
      this.votes,
      'completed',
      this.startTime,
      new Date(),
      results,
      this.description,
    );
  }

  /**
   * Cancels the voting session
   */
  cancel(): VotingSession {
    if (this.status === 'completed') {
      throw new Error('Cannot cancel completed voting session');
    }

    return new VotingSession(
      this.id,
      this.roomId,
      this.type,
      this.title,
      this.options,
      this.createdBy,
      this.votes,
      'cancelled',
      this.startTime,
      new Date(),
      this.results,
      this.description,
    );
  }

  /**
   * Calculates voting results
   */
  private calculateResults(): VotingResults {
    const totalVotes = this.votes.length;
    const voteCounts = new Map<string, number>();

    // Count votes for each option
    this.votes.forEach(vote => {
      const currentCount = voteCounts.get(vote.optionId) || 0;
      voteCounts.set(vote.optionId, currentCount + vote.weight);
    });

    // Calculate results
    const results = this.options.map(option => {
      const votes = voteCounts.get(option.id) || 0;
      return {
        optionId: option.id,
        votes,
        percentage: totalVotes > 0 ? (votes / totalVotes) * 100 : 0,
      };
    });

    // Sort by votes to find winner
    results.sort((a, b) => b.votes - a.votes);
    const winningOptionId = results.length > 0 && results[0].votes > 0 
      ? results[0].optionId 
      : undefined;

    return {
      totalVotes,
      results,
      winningOptionId,
    };
  }

  /**
   * Checks if voting session has expired
   */
  hasExpired(): boolean {
    if (!this.endTime) return false;
    return new Date() > this.endTime;
  }

  /**
   * Gets current results without completing the session
   */
  getCurrentResults(): VotingResults {
    return this.calculateResults();
  }
}