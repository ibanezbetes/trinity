/**
 * Room Service Unit Tests
 * Tests for room lifecycle, participants, and permissions
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoomService } from './room.service';
import { CreateRoomPayload, JoinRoomPayload, UpdateRoomPayload, RoomParticipantUpdate } from './room.interface';

describe('RoomService', () => {
  let service: RoomService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoomService],
    }).compile();

    service = module.get<RoomService>(RoomService);
  });

  describe('createRoom', () => {
    it('should create a room with default settings', async () => {
      const payload: CreateRoomPayload = {
        name: 'Test Room',
        description: 'A test room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(payload);

      expect(room).toBeDefined();
      expect(room.name).toBe(payload.name);
      expect(room.description).toBe(payload.description);
      expect(room.hostId).toBe(payload.hostId);
      expect(room.isActive).toBe(false);
      expect(room.currentParticipants).toBe(0);
      expect(room.maxParticipants).toBe(50);
      expect(room.inviteCode).toHaveLength(6);
      expect(room.settings.allowAnonymous).toBe(true);
      expect(room.settings.enableVoting).toBe(true);
    });

    it('should create a room with custom settings', async () => {
      const payload: CreateRoomPayload = {
        name: 'Custom Room',
        hostId: 'host-456',
        maxParticipants: 20,
        settings: {
          isPublic: true,
          allowAnonymous: false,
          votingTimeLimit: 600,
        },
      };

      const room = await service.createRoom(payload);

      expect(room.maxParticipants).toBe(20);
      expect(room.settings.isPublic).toBe(true);
      expect(room.settings.allowAnonymous).toBe(false);
      expect(room.settings.votingTimeLimit).toBe(600);
    });
  });

  describe('getRoomById', () => {
    it('should return room if exists', async () => {
      const payload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const createdRoom = await service.createRoom(payload);
      const foundRoom = await service.getRoomById(createdRoom.id);

      expect(foundRoom).toEqual(createdRoom);
    });

    it('should return null if room does not exist', async () => {
      const room = await service.getRoomById('non-existent-id');
      expect(room).toBeNull();
    });
  });

  describe('getRoomByInviteCode', () => {
    it('should return room by invite code', async () => {
      const payload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const createdRoom = await service.createRoom(payload);
      const foundRoom = await service.getRoomByInviteCode(createdRoom.inviteCode);

      expect(foundRoom).toEqual(createdRoom);
    });

    it('should return null for invalid invite code', async () => {
      const room = await service.getRoomByInviteCode('INVALID');
      expect(room).toBeNull();
    });
  });

  describe('updateRoom', () => {
    it('should update room settings by host', async () => {
      const payload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(payload);
      const updatePayload: UpdateRoomPayload = {
        name: 'Updated Room',
        maxParticipants: 30,
        settings: { allowAnonymous: false },
      };

      const updatedRoom = await service.updateRoom(room.id, updatePayload, 'host-123');

      expect(updatedRoom.name).toBe('Updated Room');
      expect(updatedRoom.maxParticipants).toBe(30);
      expect(updatedRoom.settings.allowAnonymous).toBe(false);
    });

    it('should throw NotFoundException for non-existent room', async () => {
      const updatePayload: UpdateRoomPayload = { name: 'Updated' };

      await expect(
        service.updateRoom('non-existent', updatePayload, 'host-123')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-host user', async () => {
      const payload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(payload);
      const updatePayload: UpdateRoomPayload = { name: 'Updated' };

      await expect(
        service.updateRoom(room.id, updatePayload, 'other-user')
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('joinRoom', () => {
    it('should allow user to join room by ID', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);
      const joinPayload: JoinRoomPayload = {
        roomId: room.id,
        userId: 'user-456',
        displayName: 'Test User',
      };

      const participant = await service.joinRoom(joinPayload);

      expect(participant.userId).toBe('user-456');
      expect(participant.displayName).toBe('Test User');
      expect(participant.roomId).toBe(room.id);
      expect(participant.isHost).toBe(false);
      expect(participant.connectionStatus).toBe('connected');
    });

    it('should allow user to join room by invite code', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);
      const joinPayload: JoinRoomPayload = {
        inviteCode: room.inviteCode,
        userId: 'user-456',
        displayName: 'Test User',
      };

      const participant = await service.joinRoom(joinPayload);

      expect(participant.roomId).toBe(room.id);
    });

    it('should allow host to join their own room', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);
      const joinPayload: JoinRoomPayload = {
        roomId: room.id,
        userId: 'host-123',
        displayName: 'Host User',
      };

      const participant = await service.joinRoom(joinPayload);

      expect(participant.isHost).toBe(true);
      expect(participant.permissions.canManageRoom).toBe(true);
      expect(participant.permissions.canModerate).toBe(true);
    });

    it('should allow anonymous users when enabled', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
        settings: { allowAnonymous: true },
      };

      const room = await service.createRoom(roomPayload);
      const joinPayload: JoinRoomPayload = {
        roomId: room.id,
        displayName: 'Anonymous User',
        isAnonymous: true,
      };

      const participant = await service.joinRoom(joinPayload);

      expect(participant.isAnonymous).toBe(true);
      expect(participant.userId).toBeUndefined();
    });

    it('should reject anonymous users when disabled', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
        settings: { allowAnonymous: false },
      };

      const room = await service.createRoom(roomPayload);
      const joinPayload: JoinRoomPayload = {
        roomId: room.id,
        displayName: 'Anonymous User',
        isAnonymous: true,
      };

      await expect(service.joinRoom(joinPayload)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for invalid room', async () => {
      const joinPayload: JoinRoomPayload = {
        roomId: 'non-existent',
        userId: 'user-456',
        displayName: 'Test User',
      };

      await expect(service.joinRoom(joinPayload)).rejects.toThrow(NotFoundException);
    });

    it('should reject when room is full', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
        maxParticipants: 1,
      };

      const room = await service.createRoom(roomPayload);
      
      // First user joins successfully
      await service.joinRoom({
        roomId: room.id,
        userId: 'user-1',
        displayName: 'User 1',
      });

      // Second user should be rejected
      const joinPayload: JoinRoomPayload = {
        roomId: room.id,
        userId: 'user-2',
        displayName: 'User 2',
      };

      await expect(service.joinRoom(joinPayload)).rejects.toThrow(BadRequestException);
    });

    it('should return existing participant if user rejoins', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);
      const joinPayload: JoinRoomPayload = {
        roomId: room.id,
        userId: 'user-456',
        displayName: 'Test User',
      };

      const participant1 = await service.joinRoom(joinPayload);
      const participant2 = await service.joinRoom(joinPayload);

      expect(participant1.id).toBe(participant2.id);
      expect(participant2.connectionStatus).toBe('connected');
    });
  });

  describe('leaveRoom', () => {
    it('should allow participant to leave room', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);
      const participant = await service.joinRoom({
        roomId: room.id,
        userId: 'user-456',
        displayName: 'Test User',
      });

      await service.leaveRoom(room.id, participant.id);

      const participants = await service.getRoomParticipants(room.id);
      expect(participants).toHaveLength(0);
    });

    it('should throw NotFoundException for invalid participant', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);

      await expect(
        service.leaveRoom(room.id, 'invalid-participant')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRoomParticipants', () => {
    it('should return participants sorted with host first', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);
      
      // Regular user joins first
      await service.joinRoom({
        roomId: room.id,
        userId: 'user-456',
        displayName: 'Regular User',
      });

      // Host joins second
      await service.joinRoom({
        roomId: room.id,
        userId: 'host-123',
        displayName: 'Host User',
      });

      const participants = await service.getRoomParticipants(room.id);
      
      expect(participants).toHaveLength(2);
      expect(participants[0].isHost).toBe(true);
      expect(participants[1].isHost).toBe(false);
    });

    it('should throw NotFoundException for invalid room', async () => {
      await expect(
        service.getRoomParticipants('non-existent')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('startRoom and endRoom', () => {
    it('should allow host to start room', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);
      const startedRoom = await service.startRoom(room.id, 'host-123');

      expect(startedRoom.isActive).toBe(true);
      expect(startedRoom.startedAt).toBeDefined();
    });

    it('should allow host to end room', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);
      await service.startRoom(room.id, 'host-123');
      const endedRoom = await service.endRoom(room.id, 'host-123');

      expect(endedRoom.isActive).toBe(false);
      expect(endedRoom.endedAt).toBeDefined();
    });

    it('should throw ForbiddenException for non-host', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);

      await expect(
        service.startRoom(room.id, 'other-user')
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('regenerateInviteCode', () => {
    it('should generate new invite code for host', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);
      const originalCode = room.inviteCode;
      
      const newCode = await service.regenerateInviteCode(room.id, 'host-123');

      expect(newCode).not.toBe(originalCode);
      expect(newCode).toHaveLength(6);
    });

    it('should throw ForbiddenException for non-host', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);

      await expect(
        service.regenerateInviteCode(room.id, 'other-user')
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getRoomStats', () => {
    it('should return correct room statistics', async () => {
      // Create multiple rooms
      await service.createRoom({ name: 'Room 1', hostId: 'host-1' });
      const room2 = await service.createRoom({ name: 'Room 2', hostId: 'host-2' });
      
      // Start one room
      await service.startRoom(room2.id, 'host-2');
      
      // Add participants
      await service.joinRoom({
        roomId: room2.id,
        userId: 'user-1',
        displayName: 'User 1',
      });

      const stats = await service.getRoomStats();

      expect(stats.totalRooms).toBe(2);
      expect(stats.activeRooms).toBe(1);
      expect(stats.totalParticipants).toBe(1);
    });
  });

  describe('updateParticipant', () => {
    it('should allow host to update participant permissions', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);
      
      // Host joins
      await service.joinRoom({
        roomId: room.id,
        userId: 'host-123',
        displayName: 'Host',
      });

      // Regular user joins
      const participant = await service.joinRoom({
        roomId: room.id,
        userId: 'user-456',
        displayName: 'User',
      });

      const update: RoomParticipantUpdate = {
        participantId: participant.id,
        permissions: { canModerate: true },
      };

      const updatedParticipant = await service.updateParticipant(room.id, update, 'host-123');

      expect(updatedParticipant.permissions.canModerate).toBe(true);
    });

    it('should throw ForbiddenException for non-host', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      const room = await service.createRoom(roomPayload);
      const participant = await service.joinRoom({
        roomId: room.id,
        userId: 'user-456',
        displayName: 'User',
      });

      const update: RoomParticipantUpdate = {
        participantId: participant.id,
        permissions: { canModerate: true },
      };

      await expect(
        service.updateParticipant(room.id, update, 'other-user')
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cleanupInactiveRooms', () => {
    it('should clean up inactive rooms', async () => {
      const roomPayload: CreateRoomPayload = {
        name: 'Test Room',
        hostId: 'host-123',
      };

      await service.createRoom(roomPayload);
      
      // Mock old room by manipulating the internal state
      const rooms = (service as any).rooms;
      for (const [roomId, room] of rooms) {
        room.updatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
        rooms.set(roomId, room);
      }

      const cleanedCount = await service.cleanupInactiveRooms();

      expect(cleanedCount).toBe(1);
    });
  });
});