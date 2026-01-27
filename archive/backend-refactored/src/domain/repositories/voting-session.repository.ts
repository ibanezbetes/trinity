/**
 * Voting Session Repository Interface (Port)
 * Defines the contract for voting session data persistence
 */

import { VotingSession, VotingStatus, VotingType } from '../entities/voting-session.entity';

export interface IVotingSessionRepository {
  /**
   * Finds a voting session by its unique ID
   */
  findById(id: string): Promise<VotingSession | null>;

  /**
   * Creates a new voting session
   */
  create(session: VotingSession): Promise<VotingSession>;

  /**
   * Updates an existing voting session
   */
  update(session: VotingSession): Promise<VotingSession>;

  /**
   * Deletes a voting session by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Finds all voting sessions for a specific room
   */
  findByRoomId(roomId: string): Promise<VotingSession[]>;

  /**
   * Finds voting sessions by status
   */
  findByStatus(status: VotingStatus): Promise<VotingSession[]>;

  /**
   * Finds voting sessions by type
   */
  findByType(type: VotingType): Promise<VotingSession[]>;

  /**
   * Finds voting sessions created by a specific user
   */
  findByCreatedBy(userId: string): Promise<VotingSession[]>;

  /**
   * Finds active voting session for a room (if any)
   */
  findActiveByRoomId(roomId: string): Promise<VotingSession | null>;

  /**
   * Finds expired voting sessions that need to be completed
   */
  findExpiredSessions(): Promise<VotingSession[]>;

  /**
   * Counts total number of voting sessions
   */
  count(): Promise<number>;

  /**
   * Counts voting sessions by status
   */
  countByStatus(status: VotingStatus): Promise<number>;
}