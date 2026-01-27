/**
 * Room Repository Interface (Port)
 * Defines the contract for room data persistence
 */

import { Room, RoomStatus } from '../entities/room.entity';

export interface IRoomRepository {
  /**
   * Finds a room by its unique ID
   */
  findById(id: string): Promise<Room | null>;

  /**
   * Creates a new room
   */
  create(room: Room): Promise<Room>;

  /**
   * Updates an existing room
   */
  update(room: Room): Promise<Room>;

  /**
   * Deletes a room by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Finds all rooms owned by a specific user
   */
  findByOwnerId(ownerId: string): Promise<Room[]>;

  /**
   * Finds all public rooms with pagination
   */
  findPublicRooms(offset: number, limit: number): Promise<Room[]>;

  /**
   * Finds rooms by status
   */
  findByStatus(status: RoomStatus): Promise<Room[]>;

  /**
   * Finds rooms where a user is a participant
   */
  findByParticipantId(userId: string): Promise<Room[]>;

  /**
   * Searches rooms by name (case-insensitive)
   */
  searchByName(name: string, offset: number, limit: number): Promise<Room[]>;

  /**
   * Counts total number of rooms
   */
  count(): Promise<number>;

  /**
   * Counts rooms by status
   */
  countByStatus(status: RoomStatus): Promise<number>;

  /**
   * Finds rooms with active voting sessions
   */
  findWithActiveVoting(): Promise<Room[]>;
}