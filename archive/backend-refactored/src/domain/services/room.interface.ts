/**
 * Room Management Service Interface
 * Core interface for room lifecycle and participant management
 */

export interface Room {
  id: string;
  name: string;
  description?: string;
  hostId: string;
  inviteCode: string;
  isActive: boolean;
  maxParticipants: number;
  currentParticipants: number;
  settings: RoomSettings;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}

export interface RoomSettings {
  isPublic: boolean;
  allowAnonymous: boolean;
  requireApproval: boolean;
  enableChat: boolean;
  enableVoting: boolean;
  votingTimeLimit?: number; // in seconds
  maxVotesPerUser?: number;
  allowVoteChanges: boolean;
  autoStartVoting: boolean;
}

export interface Participant {
  id: string;
  userId?: string; // null for anonymous users
  roomId: string;
  displayName: string;
  isHost: boolean;
  isAnonymous: boolean;
  permissions: ParticipantPermissions;
  joinedAt: Date;
  lastActiveAt: Date;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
}

export interface ParticipantPermissions {
  canVote: boolean;
  canChat: boolean;
  canInvite: boolean;
  canModerate: boolean;
  canManageRoom: boolean;
}

export interface CreateRoomPayload {
  name: string;
  description?: string;
  hostId: string;
  settings?: Partial<RoomSettings>;
  maxParticipants?: number;
}

export interface UpdateRoomPayload {
  name?: string;
  description?: string;
  settings?: Partial<RoomSettings>;
  maxParticipants?: number;
}

export interface JoinRoomPayload {
  roomId?: string;
  inviteCode?: string;
  userId?: string;
  displayName: string;
  isAnonymous?: boolean;
}

export interface RoomParticipantUpdate {
  participantId: string;
  permissions?: Partial<ParticipantPermissions>;
  displayName?: string;
}

export interface RoomStats {
  totalRooms: number;
  activeRooms: number;
  totalParticipants: number;
  averageParticipantsPerRoom: number;
  averageRoomDuration: number; // in minutes
}

/**
 * Core Room Management Service Interface
 * Handles room lifecycle, participants, and permissions
 */
export interface IRoomService {
  /**
   * Create a new room
   */
  createRoom(payload: CreateRoomPayload): Promise<Room>;

  /**
   * Get room by ID
   */
  getRoomById(roomId: string): Promise<Room | null>;

  /**
   * Get room by invite code
   */
  getRoomByInviteCode(inviteCode: string): Promise<Room | null>;

  /**
   * Update room settings
   */
  updateRoom(roomId: string, payload: UpdateRoomPayload, hostId: string): Promise<Room>;

  /**
   * Delete/close room
   */
  deleteRoom(roomId: string, hostId: string): Promise<void>;

  /**
   * Join room as participant
   */
  joinRoom(payload: JoinRoomPayload): Promise<Participant>;

  /**
   * Leave room
   */
  leaveRoom(roomId: string, participantId: string): Promise<void>;

  /**
   * Get all participants in a room
   */
  getRoomParticipants(roomId: string): Promise<Participant[]>;

  /**
   * Update participant permissions or info
   */
  updateParticipant(roomId: string, update: RoomParticipantUpdate, requesterId: string): Promise<Participant>;

  /**
   * Remove participant from room (kick)
   */
  removeParticipant(roomId: string, participantId: string, requesterId: string): Promise<void>;

  /**
   * Get rooms for a user (as host or participant)
   */
  getUserRooms(userId: string): Promise<Room[]>;

  /**
   * Start room session
   */
  startRoom(roomId: string, hostId: string): Promise<Room>;

  /**
   * End room session
   */
  endRoom(roomId: string, hostId: string): Promise<Room>;

  /**
   * Generate new invite code for room
   */
  regenerateInviteCode(roomId: string, hostId: string): Promise<string>;

  /**
   * Get room statistics
   */
  getRoomStats(): Promise<RoomStats>;

  /**
   * Update participant connection status
   */
  updateParticipantStatus(participantId: string, status: Participant['connectionStatus']): Promise<void>;

  /**
   * Clean up inactive rooms and participants
   */
  cleanupInactiveRooms(): Promise<number>;
}