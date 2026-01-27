/**
 * Room Domain Entity
 * Core business entity representing a movie room in the Trinity system
 */

export interface RoomSettings {
  isPublic: boolean;
  maxParticipants: number;
  allowGuestVoting: boolean;
  votingTimeLimit?: number; // in seconds
  requireApprovalToJoin: boolean;
}

export interface Participant {
  userId: string;
  displayName: string;
  joinedAt: Date;
  role: 'owner' | 'moderator' | 'member';
  isActive: boolean;
}

export type RoomStatus = 'waiting' | 'voting' | 'watching' | 'closed';

export class Room {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly ownerId: string,
    public readonly participants: Participant[] = [],
    public readonly settings: RoomSettings = {
      isPublic: true,
      maxParticipants: 50,
      allowGuestVoting: false,
      requireApprovalToJoin: false,
    },
    public readonly status: RoomStatus = 'waiting',
    public readonly description?: string,
    public readonly currentMovieId?: string,
    public readonly currentVotingSessionId?: string,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date(),
  ) {}

  /**
   * Adds a participant to the room
   */
  addParticipant(participant: Participant): Room {
    if (this.participants.length >= this.settings.maxParticipants) {
      throw new Error('Room is at maximum capacity');
    }

    if (this.participants.some(p => p.userId === participant.userId)) {
      throw new Error('User is already in the room');
    }

    return new Room(
      this.id,
      this.name,
      this.ownerId,
      [...this.participants, participant],
      this.settings,
      this.status,
      this.description,
      this.currentMovieId,
      this.currentVotingSessionId,
      this.createdAt,
      new Date(),
    );
  }

  /**
   * Removes a participant from the room
   */
  removeParticipant(userId: string): Room {
    const updatedParticipants = this.participants.filter(p => p.userId !== userId);
    
    return new Room(
      this.id,
      this.name,
      this.ownerId,
      updatedParticipants,
      this.settings,
      this.status,
      this.description,
      this.currentMovieId,
      this.currentVotingSessionId,
      this.createdAt,
      new Date(),
    );
  }

  /**
   * Updates room settings
   */
  updateSettings(newSettings: Partial<RoomSettings>): Room {
    return new Room(
      this.id,
      this.name,
      this.ownerId,
      this.participants,
      { ...this.settings, ...newSettings },
      this.status,
      this.description,
      this.currentMovieId,
      this.currentVotingSessionId,
      this.createdAt,
      new Date(),
    );
  }

  /**
   * Updates room status
   */
  updateStatus(newStatus: RoomStatus): Room {
    return new Room(
      this.id,
      this.name,
      this.ownerId,
      this.participants,
      this.settings,
      newStatus,
      this.description,
      this.currentMovieId,
      this.currentVotingSessionId,
      this.createdAt,
      new Date(),
    );
  }

  /**
   * Starts a voting session
   */
  startVotingSession(votingSessionId: string): Room {
    return new Room(
      this.id,
      this.name,
      this.ownerId,
      this.participants,
      this.settings,
      'voting',
      this.description,
      this.currentMovieId,
      votingSessionId,
      this.createdAt,
      new Date(),
    );
  }

  /**
   * Checks if a user can join the room
   */
  canUserJoin(userId: string): boolean {
    if (this.participants.length >= this.settings.maxParticipants) {
      return false;
    }

    if (this.participants.some(p => p.userId === userId)) {
      return false;
    }

    return true;
  }

  /**
   * Checks if a user is the owner of the room
   */
  isOwner(userId: string): boolean {
    return this.ownerId === userId;
  }

  /**
   * Gets active participants count
   */
  getActiveParticipantsCount(): number {
    return this.participants.filter(p => p.isActive).length;
  }
}