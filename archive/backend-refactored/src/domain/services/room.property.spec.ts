/**
 * Room Management Property-Based Tests
 * Tests universal properties of room management system
 */

import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { RoomService } from './room.service';
import { CreateRoomPayload, JoinRoomPayload, Room, Participant } from './room.interface';

describe('RoomService Property Tests', () => {
  let service: RoomService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoomService],
    }).compile();

    service = module.get<RoomService>(RoomService);
  });

  /**
   * Property 12: Real-time Synchronization
   * **Validates: Requirements 8.1, 8.2, 8.3**
   * 
   * Tests that room state changes are properly synchronized and consistent
   */
  describe('Property 12: Real-time Synchronization', () => {
    it('should maintain consistent room state across all operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate room creation data
          fc.record({
            name: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 1),
            hostId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
            maxParticipants: fc.integer({ min: 1, max: 100 }),
          }),
          // Generate sequence of participant operations
          fc.array(
            fc.record({
              action: fc.constantFrom('join', 'leave', 'update'),
              userId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
              displayName: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 1),
              isAnonymous: fc.boolean(),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (roomData, participantOps) => {
            // Create room
            const room = await service.createRoom({
              name: roomData.name,
              hostId: roomData.hostId,
              maxParticipants: roomData.maxParticipants,
            });

            const joinedParticipants: Participant[] = [];
            let expectedParticipantCount = 0;

            // Execute participant operations
            for (const op of participantOps) {
              try {
                if (op.action === 'join') {
                  // Skip if room is full
                  if (expectedParticipantCount >= roomData.maxParticipants) {
                    continue;
                  }

                  const participant = await service.joinRoom({
                    roomId: room.id,
                    userId: op.userId,
                    displayName: op.displayName,
                    isAnonymous: op.isAnonymous,
                  });

                  // Check if this is a new participant or existing one
                  const existingIndex = joinedParticipants.findIndex(p => p.userId === op.userId);
                  if (existingIndex === -1) {
                    joinedParticipants.push(participant);
                    expectedParticipantCount++;
                  }
                } else if (op.action === 'leave' && joinedParticipants.length > 0) {
                  // Leave with a random existing participant
                  const participantIndex = Math.floor(Math.random() * joinedParticipants.length);
                  const participant = joinedParticipants[participantIndex];
                  
                  await service.leaveRoom(room.id, participant.id);
                  joinedParticipants.splice(participantIndex, 1);
                  expectedParticipantCount--;
                }
              } catch (error) {
                // Some operations may fail due to business rules, which is expected
                continue;
              }
            }

            // Verify room state consistency
            const currentRoom = await service.getRoomById(room.id);
            const participants = await service.getRoomParticipants(room.id);

            // Property: Room participant count matches actual participants
            expect(currentRoom?.currentParticipants).toBe(participants.length);
            expect(participants.length).toBe(expectedParticipantCount);

            // Property: All participants belong to the room
            for (const participant of participants) {
              expect(participant.roomId).toBe(room.id);
            }

            // Property: Host permissions are preserved
            const hostParticipant = participants.find(p => p.isHost);
            if (hostParticipant) {
              expect(hostParticipant.permissions.canManageRoom).toBe(true);
              expect(hostParticipant.permissions.canModerate).toBe(true);
            }

            // Property: Room capacity is never exceeded
            expect(participants.length).toBeLessThanOrEqual(roomData.maxParticipants);
          }
        ),
        { numRuns: 50, timeout: 10000 }
      );
    });

    it('should maintain participant uniqueness per user', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1), // hostId
          fc.array(
            fc.record({
              userId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
              displayName: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 1),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (hostId, users) => {
            // Create room
            const room = await service.createRoom({
              name: 'Test Room',
              hostId,
              maxParticipants: 50,
            });

            // Each user joins multiple times
            for (const user of users) {
              const participant1 = await service.joinRoom({
                roomId: room.id,
                userId: user.userId,
                displayName: user.displayName,
              });

              const participant2 = await service.joinRoom({
                roomId: room.id,
                userId: user.userId,
                displayName: user.displayName,
              });

              // Property: Same user gets same participant ID when rejoining
              expect(participant1.id).toBe(participant2.id);
            }

            const participants = await service.getRoomParticipants(room.id);
            const userIds = participants.map(p => p.userId).filter(Boolean);
            const uniqueUserIds = [...new Set(userIds)];

            // Property: No duplicate users in room
            expect(userIds.length).toBe(uniqueUserIds.length);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should preserve room settings consistency', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 1),
            hostId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
            settings: fc.record({
              allowAnonymous: fc.boolean(),
              enableVoting: fc.boolean(),
              enableChat: fc.boolean(),
              votingTimeLimit: fc.integer({ min: 60, max: 3600 }),
              maxVotesPerUser: fc.integer({ min: 1, max: 10 }),
            }),
          }),
          fc.array(
            fc.record({
              settingsUpdate: fc.record({
                allowAnonymous: fc.boolean(),
                enableVoting: fc.boolean(),
                votingTimeLimit: fc.integer({ min: 60, max: 3600 }),
              }),
            }),
            { maxLength: 5 }
          ),
          async (roomData, updates) => {
            // Create room with initial settings
            const room = await service.createRoom({
              name: roomData.name,
              hostId: roomData.hostId,
              settings: roomData.settings,
            });

            let currentSettings = { ...roomData.settings };

            // Apply updates
            for (const update of updates) {
              await service.updateRoom(
                room.id,
                { settings: update.settingsUpdate },
                roomData.hostId
              );
              currentSettings = { ...currentSettings, ...update.settingsUpdate };
            }

            const updatedRoom = await service.getRoomById(room.id);

            // Property: Settings are applied correctly
            expect(updatedRoom?.settings.allowAnonymous).toBe(currentSettings.allowAnonymous);
            expect(updatedRoom?.settings.enableVoting).toBe(currentSettings.enableVoting);
            expect(updatedRoom?.settings.votingTimeLimit).toBe(currentSettings.votingTimeLimit);

            // Property: Anonymous user access respects settings
            if (!currentSettings.allowAnonymous) {
              await expect(
                service.joinRoom({
                  roomId: room.id,
                  displayName: 'Anonymous User',
                  isAnonymous: true,
                })
              ).rejects.toThrow();
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should maintain invite code uniqueness and functionality', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 1),
              hostId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
            }),
            { minLength: 2, maxLength: 10 }
          ),
          async (roomsData) => {
            const rooms: Room[] = [];
            const inviteCodes: string[] = [];

            // Create multiple rooms
            for (const roomData of roomsData) {
              const room = await service.createRoom({
                name: roomData.name,
                hostId: roomData.hostId,
              });
              rooms.push(room);
              inviteCodes.push(room.inviteCode);
            }

            // Property: All invite codes are unique
            const uniqueCodes = [...new Set(inviteCodes)];
            expect(inviteCodes.length).toBe(uniqueCodes.length);

            // Property: Each invite code works for its room
            for (let i = 0; i < rooms.length; i++) {
              const room = rooms[i];
              const foundRoom = await service.getRoomByInviteCode(room.inviteCode);
              expect(foundRoom?.id).toBe(room.id);
            }

            // Property: Regenerated codes are different and work
            for (const room of rooms) {
              const originalCode = room.inviteCode;
              const newCode = await service.regenerateInviteCode(room.id, room.hostId);
              
              expect(newCode).not.toBe(originalCode);
              expect(newCode).toHaveLength(6);
              
              const foundRoom = await service.getRoomByInviteCode(newCode);
              expect(foundRoom?.id).toBe(room.id);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle concurrent participant operations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            hostId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
            maxParticipants: fc.integer({ min: 5, max: 20 }),
          }),
          fc.array(
            fc.record({
              userId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
              displayName: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 1),
            }),
            { minLength: 3, maxLength: 15 }
          ),
          async (roomData, users) => {
            // Create room
            const room = await service.createRoom({
              name: 'Concurrent Test Room',
              hostId: roomData.hostId,
              maxParticipants: roomData.maxParticipants,
            });

            // Remove duplicate userIds to ensure unique users
            const uniqueUsers = users.filter((user, index, arr) => 
              arr.findIndex(u => u.userId === user.userId) === index
            );

            // Simulate concurrent joins
            const joinPromises = uniqueUsers.map(user =>
              service.joinRoom({
                roomId: room.id,
                userId: user.userId,
                displayName: user.displayName,
              }).catch(() => null) // Some may fail due to capacity
            );

            const results = await Promise.all(joinPromises);
            const successfulJoins = results.filter(Boolean);

            // Get final state
            const participants = await service.getRoomParticipants(room.id);
            const currentRoom = await service.getRoomById(room.id);

            // Property: Participant count is consistent
            expect(participants.length).toBe(successfulJoins.length);
            expect(currentRoom?.currentParticipants).toBe(participants.length);

            // Property: Room capacity is never exceeded
            expect(participants.length).toBeLessThanOrEqual(roomData.maxParticipants);

            // Property: All participants are valid
            for (const participant of participants) {
              expect(participant.roomId).toBe(room.id);
              expect(participant.connectionStatus).toBe('connected');
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('should maintain room lifecycle state consistency', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 1),
            hostId: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1),
          }),
          fc.array(
            fc.constantFrom('start', 'end', 'update', 'regenerate'),
            { minLength: 1, maxLength: 10 }
          ),
          async (roomData, operations) => {
            // Create room
            const room = await service.createRoom({
              name: roomData.name,
              hostId: roomData.hostId,
            });

            let isActive = false;
            let hasStarted = false;

            // Execute operations with small delays to ensure different timestamps
            for (const operation of operations) {
              try {
                switch (operation) {
                  case 'start':
                    if (!isActive) {
                      await service.startRoom(room.id, roomData.hostId);
                      isActive = true;
                      hasStarted = true;
                      // Small delay to ensure different timestamps
                      await new Promise(resolve => setTimeout(resolve, 1));
                    }
                    break;
                  case 'end':
                    if (isActive) {
                      await service.endRoom(room.id, roomData.hostId);
                      isActive = false;
                    }
                    break;
                  case 'update':
                    await service.updateRoom(
                      room.id,
                      { name: `Updated ${roomData.name}` },
                      roomData.hostId
                    );
                    break;
                  case 'regenerate':
                    await service.regenerateInviteCode(room.id, roomData.hostId);
                    break;
                }
              } catch (error) {
                // Some operations may fail due to business rules
                continue;
              }
            }

            const finalRoom = await service.getRoomById(room.id);

            // Property: Room state is consistent
            expect(finalRoom?.isActive).toBe(isActive);
            
            if (hasStarted && finalRoom?.startedAt) {
              expect(finalRoom.startedAt).toBeInstanceOf(Date);
            }
            
            if (!isActive && hasStarted && finalRoom?.endedAt && finalRoom?.startedAt) {
              expect(finalRoom.endedAt).toBeInstanceOf(Date);
              expect(finalRoom.endedAt.getTime()).toBeGreaterThanOrEqual(finalRoom.startedAt.getTime());
            }

            // Property: Room always has valid timestamps
            expect(finalRoom?.createdAt).toBeInstanceOf(Date);
            expect(finalRoom?.updatedAt).toBeInstanceOf(Date);
            expect(finalRoom?.updatedAt.getTime()).toBeGreaterThanOrEqual(finalRoom?.createdAt.getTime());
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});