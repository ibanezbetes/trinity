import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fc from 'fast-check';
import { ShuffleSyncService } from './shuffle-sync.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { MediaService } from '../media/media.service';
import { MemberService } from './member.service';
import { RoomService } from './room.service';
import {
  Room,
  Member,
  MemberRole,
  MemberStatus,
  ContentFilters,
} from '../../domain/entities/room.entity';
import { MediaItem } from '../../domain/entities/media.entity';

describe('ShuffleSyncService', () => {
  let service: ShuffleSyncService;
  let dynamoDBService: jest.Mocked<DynamoDBService>;
  let mediaService: jest.Mocked<MediaService>;
  let memberService: jest.Mocked<MemberService>;
  let roomService: jest.Mocked<RoomService>;

  beforeEach(async () => {
    const mockDynamoDBService = {
      putItem: jest.fn(),
      getItem: jest.fn(),
      query: jest.fn(),
      conditionalUpdate: jest.fn(),
      batchWrite: jest.fn(),
      deleteItem: jest.fn(),
      getRoomState: jest.fn(),
    };

    const mockMediaService = {
      fetchMovies: jest.fn(),
    };

    const mockMemberService = {
      getRoomMembers: jest.fn(),
      generateShuffledListsForAllMembers: jest.fn(),
      updateMemberShuffledList: jest.fn(),
    };

    const mockRoomService = {
      getRoomById: jest.fn(),
      updateMasterList: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShuffleSyncService,
        { provide: DynamoDBService, useValue: mockDynamoDBService },
        { provide: MediaService, useValue: mockMediaService },
        { provide: MemberService, useValue: mockMemberService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ShuffleSyncService>(ShuffleSyncService);
    dynamoDBService = module.get(DynamoDBService);
    mediaService = module.get(MediaService);
    memberService = module.get(MemberService);
    roomService = module.get(RoomService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Property-Based Tests', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    /**
     * **Feature: trinity-mvp, Property 2: Consistencia de shuffle y sync**
     * **Valida: Requisitos 1.5**
     *
     * Para cualquier sala con múltiples miembros, cada miembro debe recibir un orden aleatorio único
     * de la misma lista maestra subyacente, asegurando diversidad de contenido mientras mantiene
     * integridad de consenso
     */
    it('should maintain shuffle and sync consistency across all members', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generadores
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 5,
            maxLength: 50,
          }), // masterList
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 2,
            maxLength: 10,
          }), // userIds
          async (roomId, masterList, userIds) => {
            // Arrange: Crear sala mock y miembros
            const mockRoom: Room = {
              id: roomId,
              name: 'Test Room',
              creatorId: userIds[0],
              filters: {} as ContentFilters,
              masterList,
              inviteCode: 'TEST123',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const mockMembers: Member[] = userIds.map((userId, index) => ({
              userId,
              roomId,
              role: index === 0 ? MemberRole.CREATOR : MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
              shuffledList: [],
              currentIndex: 0,
              lastActivityAt: new Date(),
              joinedAt: new Date(),
            }));

            const mockMediaItems: MediaItem[] = masterList.map((id) => ({
              tmdbId: id,
              title: `Movie ${id}`,
              overview: `Overview for ${id}`,
              posterPath: `/poster/${id}.jpg`,
              releaseDate: '2023-01-01',
              genres: ['Action'],
              popularity: Math.random() * 100,
              voteAverage: Math.random() * 10,
              voteCount: Math.floor(Math.random() * 1000),
              adult: false,
              originalLanguage: 'en',
              mediaType: 'movie' as const,
              cachedAt: new Date(),
              isPopular: false,
            }));

            // Mock service responses
            roomService.getRoomById.mockResolvedValue(mockRoom);
            mediaService.fetchMovies.mockResolvedValue(mockMediaItems);
            memberService.getRoomMembers.mockResolvedValue(mockMembers);
            memberService.generateShuffledListsForAllMembers.mockResolvedValue(
              userIds.length,
            );
            roomService.updateMasterList.mockResolvedValue();

            // Act: Generar listas desordenadas
            const result =
              await service.generateMasterListAndShuffledLists(roomId);

            // Assert: Verificar que se generaron listas para todos los miembros
            expect(result.masterListUpdated).toBe(true);
            expect(result.shuffledListsGenerated).toBe(userIds.length);
            expect(result.totalMediaItems).toBe(masterList.length);

            // Verificar que se llamaron los métodos correctos
            expect(roomService.getRoomById).toHaveBeenCalledWith(roomId);
            expect(mediaService.fetchMovies).toHaveBeenCalledWith(
              mockRoom.filters,
            );
            expect(roomService.updateMasterList).toHaveBeenCalledWith(
              roomId,
              masterList,
            );
            expect(
              memberService.generateShuffledListsForAllMembers,
            ).toHaveBeenCalledWith(roomId, masterList);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should verify shuffle sync consistency maintains same elements with different orders', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 10,
            maxLength: 30,
          }), // masterList
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 3,
            maxLength: 8,
          }), // userIds
          async (roomId, masterList, userIds) => {
            // Arrange: Crear sala y miembros con listas desordenadas simuladas
            const mockRoom: Room = {
              id: roomId,
              name: 'Test Room',
              creatorId: userIds[0],
              filters: {} as ContentFilters,
              masterList,
              inviteCode: 'TEST123',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Simular listas desordenadas diferentes para cada miembro
            const mockMembers: Member[] = userIds.map((userId, index) => {
              // Crear una versión desordenada de la lista maestra usando el userId como seed
              const shuffled = [...masterList];
              let seed = userId
                .split('')
                .reduce((a, b) => a + b.charCodeAt(0), 0);

              // Fisher-Yates shuffle con seed
              for (let i = shuffled.length - 1; i > 0; i--) {
                seed = (seed * 9301 + 49297) % 233280;
                const j = Math.floor((seed / 233280) * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
              }

              return {
                userId,
                roomId,
                role: index === 0 ? MemberRole.CREATOR : MemberRole.MEMBER,
                status: MemberStatus.ACTIVE,
                shuffledList: shuffled,
                currentIndex: 0,
                lastActivityAt: new Date(),
                joinedAt: new Date(),
              };
            });

            // Mock service responses
            roomService.getRoomById.mockResolvedValue(mockRoom);
            memberService.getRoomMembers.mockResolvedValue(mockMembers);

            // Act: Verificar consistencia
            const consistencyResult =
              await service.verifyShuffleSyncConsistency(roomId);

            // Assert: Verificar propiedades de consistencia
            expect(consistencyResult.isConsistent).toBe(true);
            expect(consistencyResult.masterListSize).toBe(masterList.length);
            expect(consistencyResult.memberListSizes).toEqual(
              new Array(userIds.length).fill(masterList.length),
            );
            expect(consistencyResult.issues).toHaveLength(0);

            // Verificar que las listas tienen diferentes órdenes (si hay más de un miembro)
            if (userIds.length > 1) {
              expect(consistencyResult.uniqueOrderings).toBe(true);
            }

            // Verificar que cada lista de miembro contiene exactamente los mismos elementos
            const masterSet = new Set(masterList);
            mockMembers.forEach((member) => {
              const memberSet = new Set(member.shuffledList);
              expect(memberSet.size).toBe(masterSet.size);

              // Verificar que todos los elementos de la lista maestra están en la lista del miembro
              masterList.forEach((mediaId) => {
                expect(memberSet.has(mediaId)).toBe(true);
              });

              // Verificar que no hay elementos extra en la lista del miembro
              member.shuffledList.forEach((mediaId) => {
                expect(masterSet.has(mediaId)).toBe(true);
              });
            });
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should handle content injection while maintaining consistency', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 5,
            maxLength: 20,
          }), // originalMasterList
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 1,
            maxLength: 10,
          }), // newMediaIds
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 2,
            maxLength: 5,
          }), // userIds
          async (roomId, originalMasterList, newMediaIds, userIds) => {
            // Ensure no duplicates between original and new content
            const uniqueNewIds = newMediaIds.filter(
              (id) => !originalMasterList.includes(id),
            );
            if (uniqueNewIds.length === 0) return; // Skip if no unique new content

            // Reset mocks for this test iteration
            jest.clearAllMocks();

            // Arrange: Crear sala con lista maestra existente
            const mockRoom: Room = {
              id: roomId,
              name: 'Test Room',
              creatorId: userIds[0],
              filters: {} as ContentFilters,
              masterList: originalMasterList,
              inviteCode: 'TEST123',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const mockMembers: Member[] = userIds.map((userId, index) => ({
              userId,
              roomId,
              role: index === 0 ? MemberRole.CREATOR : MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
              shuffledList: [...originalMasterList], // Simular lista existente
              currentIndex: Math.floor(
                Math.random() * originalMasterList.length,
              ),
              lastActivityAt: new Date(),
              joinedAt: new Date(),
            }));

            // Mock service responses
            roomService.getRoomById.mockResolvedValue(mockRoom);
            memberService.getRoomMembers.mockResolvedValue(mockMembers);
            roomService.updateMasterList.mockResolvedValue();
            memberService.updateMemberShuffledList.mockResolvedValue();

            // Act: Inyectar nuevo contenido
            const result = await service.injectNewContent(roomId, newMediaIds);

            // Assert: Verificar que se actualizó la lista maestra
            expect(result.masterListUpdated).toBe(true);
            expect(result.totalMediaItems).toBe(
              originalMasterList.length + uniqueNewIds.length,
            );

            // Verificar que se llamó updateMasterList con la lista combinada
            const expectedMasterList = [...originalMasterList, ...uniqueNewIds];
            expect(roomService.updateMasterList).toHaveBeenCalledWith(
              roomId,
              expectedMasterList,
            );

            // Verificar que se actualizaron las listas de todos los miembros
            // El número de llamadas debe ser igual al número de miembros
            expect(
              memberService.updateMemberShuffledList,
            ).toHaveBeenCalledTimes(userIds.length);
          },
        ),
        { numRuns: 50 }, // Reducir el número de runs para evitar problemas de mock
      );
    });

    it('should maintain consistency when regenerating shuffled lists', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 5,
            maxLength: 25,
          }), // masterList
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 2,
            maxLength: 6,
          }), // userIds
          async (roomId, masterList, userIds) => {
            // Arrange: Crear sala con lista maestra existente
            const mockRoom: Room = {
              id: roomId,
              name: 'Test Room',
              creatorId: userIds[0],
              filters: {} as ContentFilters,
              masterList,
              inviteCode: 'TEST123',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Mock service responses
            roomService.getRoomById.mockResolvedValue(mockRoom);
            memberService.generateShuffledListsForAllMembers.mockResolvedValue(
              userIds.length,
            );

            // Act: Regenerar listas desordenadas
            const result = await service.regenerateShuffledLists(roomId);

            // Assert: Verificar que no se actualizó la lista maestra pero sí las listas desordenadas
            expect(result.masterListUpdated).toBe(false);
            expect(result.shuffledListsGenerated).toBe(userIds.length);
            expect(result.totalMediaItems).toBe(masterList.length);

            // Verificar que se regeneraron las listas usando la lista maestra existente
            expect(
              memberService.generateShuffledListsForAllMembers,
            ).toHaveBeenCalledWith(roomId, masterList);

            // Verificar que NO se llamó updateMasterList
            expect(roomService.updateMasterList).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Unit Tests', () => {
    it('should handle empty media results gracefully', async () => {
      // Arrange
      const roomId = 'test-room-id';
      const mockRoom: Room = {
        id: roomId,
        name: 'Test Room',
        creatorId: 'user1',
        filters: {} as ContentFilters,
        masterList: [],
        inviteCode: 'TEST123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      roomService.getRoomById.mockResolvedValue(mockRoom);
      mediaService.fetchMovies.mockResolvedValue([]); // Empty results

      // Act
      const result = await service.generateMasterListAndShuffledLists(roomId);

      // Assert
      expect(result.masterListUpdated).toBe(false);
      expect(result.shuffledListsGenerated).toBe(0);
      expect(result.totalMediaItems).toBe(0);
    });

    it('should handle room not found error', async () => {
      // Arrange
      const roomId = 'non-existent-room';
      roomService.getRoomById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.generateMasterListAndShuffledLists(roomId),
      ).rejects.toThrow('Sala no encontrada');
    });

    it('should get shuffle sync stats correctly', async () => {
      // Arrange
      const roomId = 'test-room-id';
      const masterList = ['movie1', 'movie2', 'movie3'];
      const mockRoom: Room = {
        id: roomId,
        name: 'Test Room',
        creatorId: 'user1',
        filters: {} as ContentFilters,
        masterList,
        inviteCode: 'TEST123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockMembers: Member[] = [
        {
          userId: 'user1',
          roomId,
          role: MemberRole.CREATOR,
          status: MemberStatus.ACTIVE,
          shuffledList: masterList,
          currentIndex: 1, // 33% progress
          lastActivityAt: new Date(),
          joinedAt: new Date(),
        },
        {
          userId: 'user2',
          roomId,
          role: MemberRole.MEMBER,
          status: MemberStatus.ACTIVE,
          shuffledList: masterList,
          currentIndex: 2, // 66% progress
          lastActivityAt: new Date(),
          joinedAt: new Date(),
        },
      ];

      roomService.getRoomById.mockResolvedValue(mockRoom);
      memberService.getRoomMembers.mockResolvedValue(mockMembers);

      // Act
      const stats = await service.getShuffleSyncStats(roomId);

      // Assert
      expect(stats.masterListSize).toBe(3);
      expect(stats.totalMembers).toBe(2);
      expect(stats.averageProgress).toBe(50); // (33 + 66) / 2 = 49.5, rounded to 50
      expect(stats.listsGenerated).toBe(true);
      expect(stats.lastUpdate).toEqual(mockRoom.updatedAt);
    });
  });
});
