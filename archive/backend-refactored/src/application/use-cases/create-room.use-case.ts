/**
 * Create Room Use Case
 * Application layer use case for creating a new room
 */

import { Injectable } from '@nestjs/common';
import { Room, RoomSettings } from '../../domain/entities/room.entity';
import type { IRoomRepository } from '../../domain/repositories/room.repository';
import type { IUserRepository } from '../../domain/repositories/user.repository';
import { RoomDomainService } from '../../domain/services/room.service';
import { v4 as uuidv4 } from 'uuid';

export interface CreateRoomRequest {
  name: string;
  description?: string;
  ownerId: string;
  settings?: Partial<RoomSettings>;
}

export interface CreateRoomResponse {
  room: Room;
}

@Injectable()
export class CreateRoomUseCase {
  constructor(
    private readonly roomRepository: IRoomRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(request: CreateRoomRequest): Promise<CreateRoomResponse> {
    // Validate input
    RoomDomainService.validateRoomCreation(request.name, request.ownerId);

    // Verify owner exists
    const owner = await this.userRepository.findById(request.ownerId);
    if (!owner) {
      throw new Error('Owner not found');
    }

    // Validate settings if provided
    if (request.settings) {
      RoomDomainService.validateRoomSettings(request.settings);
    }

    // Create default settings
    const defaultSettings: RoomSettings = {
      isPublic: true,
      maxParticipants: 50,
      allowGuestVoting: false,
      requireApprovalToJoin: false,
    };

    const settings = { ...defaultSettings, ...request.settings };

    // Create room entity
    const roomId = uuidv4();
    const ownerParticipant = RoomDomainService.createParticipant(owner, 'owner');
    
    const room = new Room(
      roomId,
      request.name.trim(),
      request.ownerId,
      [ownerParticipant],
      settings,
      'waiting',
      request.description?.trim(),
    );

    // Persist room
    const createdRoom = await this.roomRepository.create(room);

    return { room: createdRoom };
  }
}