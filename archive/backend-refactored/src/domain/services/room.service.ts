/**
 * Room Management Service Implementation
 * Handles room lifecycle, participants, and permissions
 */

import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  IRoomService,
  Room,
  Participant,
  CreateRoomPayload,
  UpdateRoomPayload,
  JoinRoomPayload,
  RoomParticipantUpdate,
  RoomStats,
  RoomSettings,
  ParticipantPermissions,
} from './room.interface';

@Injectable()
export class RoomService implements IRoomService {
  private rooms = new Map<string, Room>();
  private participants = new Map<string, Participant>();
  private roomParticipants = new Map<string, Set<string>>(); // roomId -> participantIds
  private userRooms = new Map<string, Set<string>>(); // userId -> roomIds

  async createRoom(payload: CreateRoomPayload): Promise<Room> {
    const roomId = this.generateRoomId();
    const inviteCode = this.generateInviteCode();
    
    const defaultSettings: RoomSettings = {
      isPublic: false,
      allowAnonymous: true,
      requireApproval: false,
      enableChat: true,
      enableVoting: true,
      votingTimeLimit: 300, // 5 minutes
      maxVotesPerUser: 1,
      allowVoteChanges: true,
      autoStartVoting: false,
    };

    const room: Room = {
      id: roomId,
      name: payload.name,
      description: payload.description,
      hostId: payload.hostId,
      inviteCode,
      isActive: false,
      maxParticipants: payload.maxParticipants || 50,
      currentParticipants: 0,
      settings: { ...defaultSettings, ...payload.settings },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.rooms.set(roomId, room);
    
    // Add to user's rooms
    if (!this.userRooms.has(payload.hostId)) {
      this.userRooms.set(payload.hostId, new Set());
    }
    this.userRooms.get(payload.hostId)!.add(roomId);

    return room;
  }

  async getRoomById(roomId: string): Promise<Room | null> {
    return this.rooms.get(roomId) || null;
  }

  async getRoomByInviteCode(inviteCode: string): Promise<Room | null> {
    for (const room of this.rooms.values()) {
      if (room.inviteCode === inviteCode) {
        return room;
      }
    }
    return null;
  }

  async updateRoom(roomId: string, payload: UpdateRoomPayload, hostId: string): Promise<Room> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException('Only the host can update room settings');
    }

    // Update room properties
    if (payload.name !== undefined) room.name = payload.name;
    if (payload.description !== undefined) room.description = payload.description;
    if (payload.maxParticipants !== undefined) room.maxParticipants = payload.maxParticipants;
    if (payload.settings) {
      room.settings = { ...room.settings, ...payload.settings };
    }

    room.updatedAt = new Date();
    this.rooms.set(roomId, room);

    return room;
  }

  async deleteRoom(roomId: string, hostId: string): Promise<void> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException('Only the host can delete the room');
    }

    // Remove all participants
    const participantIds = this.roomParticipants.get(roomId) || new Set();
    for (const participantId of participantIds) {
      this.participants.delete(participantId);
    }

    // Clean up mappings
    this.roomParticipants.delete(roomId);
    this.userRooms.get(hostId)?.delete(roomId);
    this.rooms.delete(roomId);
  }

  async joinRoom(payload: JoinRoomPayload): Promise<Participant> {
    let room: Room | null = null;

    if (payload.roomId) {
      room = await this.getRoomById(payload.roomId);
    } else if (payload.inviteCode) {
      room = await this.getRoomByInviteCode(payload.inviteCode);
    }

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if anonymous users are allowed
    if (payload.isAnonymous && !room.settings.allowAnonymous) {
      throw new ForbiddenException('Anonymous users are not allowed in this room');
    }

    // Check if user is already in the room (for non-anonymous users)
    if (payload.userId) {
      const existingParticipant = await this.findParticipantByUserId(room.id, payload.userId);
      if (existingParticipant) {
        // Update connection status and return existing participant
        existingParticipant.connectionStatus = 'connected';
        existingParticipant.lastActiveAt = new Date();
        this.participants.set(existingParticipant.id, existingParticipant);
        return existingParticipant;
      }
    }

    // Check room capacity before adding new participant
    if (room.currentParticipants >= room.maxParticipants) {
      throw new BadRequestException('Room is full');
    }

    const participantId = this.generateParticipantId();
    const isHost = room.hostId === payload.userId;

    const defaultPermissions: ParticipantPermissions = {
      canVote: room.settings.enableVoting,
      canChat: room.settings.enableChat,
      canInvite: !payload.isAnonymous,
      canModerate: isHost,
      canManageRoom: isHost,
    };

    const participant: Participant = {
      id: participantId,
      userId: payload.userId,
      roomId: room.id,
      displayName: payload.displayName,
      isHost,
      isAnonymous: payload.isAnonymous || false,
      permissions: defaultPermissions,
      joinedAt: new Date(),
      lastActiveAt: new Date(),
      connectionStatus: 'connected',
    };

    // Update room participant count
    room.currentParticipants++;
    room.updatedAt = new Date();
    this.rooms.set(room.id, room);

    // Store participant
    this.participants.set(participantId, participant);

    // Update mappings
    if (!this.roomParticipants.has(room.id)) {
      this.roomParticipants.set(room.id, new Set());
    }
    this.roomParticipants.get(room.id)!.add(participantId);

    if (payload.userId) {
      if (!this.userRooms.has(payload.userId)) {
        this.userRooms.set(payload.userId, new Set());
      }
      this.userRooms.get(payload.userId)!.add(room.id);
    }

    return participant;
  }

  async leaveRoom(roomId: string, participantId: string): Promise<void> {
    const participant = this.participants.get(participantId);
    if (!participant || participant.roomId !== roomId) {
      throw new NotFoundException('Participant not found in room');
    }

    const room = await this.getRoomById(roomId);
    if (room) {
      room.currentParticipants = Math.max(0, room.currentParticipants - 1);
      room.updatedAt = new Date();
      this.rooms.set(roomId, room);
    }

    // Clean up participant
    this.participants.delete(participantId);
    this.roomParticipants.get(roomId)?.delete(participantId);
    
    if (participant.userId) {
      this.userRooms.get(participant.userId)?.delete(roomId);
    }
  }

  async getRoomParticipants(roomId: string): Promise<Participant[]> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const participantIds = this.roomParticipants.get(roomId) || new Set();
    const participants: Participant[] = [];

    for (const participantId of participantIds) {
      const participant = this.participants.get(participantId);
      if (participant) {
        participants.push(participant);
      }
    }

    return participants.sort((a, b) => {
      // Host first, then by join time
      if (a.isHost && !b.isHost) return -1;
      if (!a.isHost && b.isHost) return 1;
      return a.joinedAt.getTime() - b.joinedAt.getTime();
    });
  }

  async updateParticipant(roomId: string, update: RoomParticipantUpdate, requesterId: string): Promise<Participant> {
    const participant = this.participants.get(update.participantId);
    if (!participant || participant.roomId !== roomId) {
      throw new NotFoundException('Participant not found in room');
    }

    const requester = await this.findParticipantByUserId(roomId, requesterId);
    if (!requester || !requester.permissions.canManageRoom) {
      throw new ForbiddenException('Insufficient permissions to update participant');
    }

    // Update participant
    if (update.displayName !== undefined) {
      participant.displayName = update.displayName;
    }
    if (update.permissions) {
      participant.permissions = { ...participant.permissions, ...update.permissions };
    }

    this.participants.set(participant.id, participant);
    return participant;
  }

  async removeParticipant(roomId: string, participantId: string, requesterId: string): Promise<void> {
    const participant = this.participants.get(participantId);
    if (!participant || participant.roomId !== roomId) {
      throw new NotFoundException('Participant not found in room');
    }

    const requester = await this.findParticipantByUserId(roomId, requesterId);
    if (!requester || !requester.permissions.canManageRoom) {
      throw new ForbiddenException('Insufficient permissions to remove participant');
    }

    // Cannot remove the host
    if (participant.isHost) {
      throw new ForbiddenException('Cannot remove the room host');
    }

    await this.leaveRoom(roomId, participantId);
  }

  async getUserRooms(userId: string): Promise<Room[]> {
    const roomIds = this.userRooms.get(userId) || new Set();
    const rooms: Room[] = [];

    for (const roomId of roomIds) {
      const room = this.rooms.get(roomId);
      if (room) {
        rooms.push(room);
      }
    }

    return rooms.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async startRoom(roomId: string, hostId: string): Promise<Room> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException('Only the host can start the room');
    }

    if (room.isActive) {
      throw new BadRequestException('Room is already active');
    }

    room.isActive = true;
    room.startedAt = new Date();
    room.updatedAt = new Date();
    this.rooms.set(roomId, room);

    return room;
  }

  async endRoom(roomId: string, hostId: string): Promise<Room> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException('Only the host can end the room');
    }

    if (!room.isActive) {
      throw new BadRequestException('Room is not active');
    }

    room.isActive = false;
    room.endedAt = new Date();
    room.updatedAt = new Date();
    this.rooms.set(roomId, room);

    return room;
  }

  async regenerateInviteCode(roomId: string, hostId: string): Promise<string> {
    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException('Only the host can regenerate invite code');
    }

    const newInviteCode = this.generateInviteCode();
    room.inviteCode = newInviteCode;
    room.updatedAt = new Date();
    this.rooms.set(roomId, room);

    return newInviteCode;
  }

  async getRoomStats(): Promise<RoomStats> {
    const totalRooms = this.rooms.size;
    const activeRooms = Array.from(this.rooms.values()).filter(room => room.isActive).length;
    const totalParticipants = this.participants.size;
    
    const averageParticipantsPerRoom = totalRooms > 0 ? totalParticipants / totalRooms : 0;
    
    // Calculate average room duration for ended rooms
    const endedRooms = Array.from(this.rooms.values()).filter(room => room.endedAt && room.startedAt);
    const totalDuration = endedRooms.reduce((sum, room) => {
      const duration = room.endedAt!.getTime() - room.startedAt!.getTime();
      return sum + duration;
    }, 0);
    const averageRoomDuration = endedRooms.length > 0 ? totalDuration / endedRooms.length / (1000 * 60) : 0;

    return {
      totalRooms,
      activeRooms,
      totalParticipants,
      averageParticipantsPerRoom,
      averageRoomDuration,
    };
  }

  async updateParticipantStatus(participantId: string, status: Participant['connectionStatus']): Promise<void> {
    const participant = this.participants.get(participantId);
    if (participant) {
      participant.connectionStatus = status;
      participant.lastActiveAt = new Date();
      this.participants.set(participantId, participant);
    }
  }

  async cleanupInactiveRooms(): Promise<number> {
    const now = new Date();
    const inactiveThreshold = 24 * 60 * 60 * 1000; // 24 hours
    let cleanedCount = 0;

    for (const [roomId, room] of this.rooms) {
      const lastActivity = room.updatedAt.getTime();
      const isInactive = (now.getTime() - lastActivity) > inactiveThreshold;
      
      if (isInactive && !room.isActive) {
        await this.deleteRoom(roomId, room.hostId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  // Private helper methods

  private async findParticipantByUserId(roomId: string, userId: string): Promise<Participant | null> {
    const participantIds = this.roomParticipants.get(roomId) || new Set();
    
    for (const participantId of participantIds) {
      const participant = this.participants.get(participantId);
      if (participant && participant.userId === userId) {
        return participant;
      }
    }
    
    return null;
  }

  private generateRoomId(): string {
    return `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateParticipantId(): string {
    return `participant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateInviteCode(): string {
    // Generate a 6-character alphanumeric code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}