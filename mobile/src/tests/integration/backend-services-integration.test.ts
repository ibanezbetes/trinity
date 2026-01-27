/**
 * Integration Tests: Backend Services Integration
 * 
 * Tests the integration between mobile services and backend GraphQL API,
 * including error handling, caching, and real-world scenarios.
 */

import { appSyncService } from '../../services/appSyncService';
import {
  createRoomWithFilters,
  updateRoomFilters,
  getAvailableGenres,
  hasContentFilters,
  isLegacyRoom,
  getFilterSummary
} from '../../services/roomService';
import { MediaType, CreateRoomWithFiltersInput, UpdateRoomFiltersInput } from '../../types/content-filtering';

// Mock AppSync Service
jest.mock('../../services/appSyncService', () => ({
  appSyncService: {
    createRoomWithFilters: jest.fn(),
    updateRoomFilters: jest.fn(),
    getAvailableGenres: jest.fn()
  }
}));

const mockAppSyncService = appSyncService as jest.Mocked<typeof appSyncService>;

describe('Backend Services Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Room Creation with Filters', () => {
    it('should create room with movie filters successfully', async () => {
      // Arrange
      const input: CreateRoomWithFiltersInput = {
        name: 'Action Movie Night',
        description: 'Epic action movies only',
        mediaType: 'MOVIE',
        genreIds: [28, 12], // Action, Adventure
        isPrivate: false,
        maxMembers: 8
      };

      const mockRoom = {
        id: 'room-123',
        name: 'Action Movie Night',
        description: 'Epic action movies only',
        mediaType: 'MOVIE',
        genreIds: [28, 12],
        genreNames: ['Action', 'Adventure'],
        filterCriteria: {
          mediaType: 'MOVIE',
          genreIds: [28, 12],
          roomId: 'room-123'
        },
        isPrivate: false,
        maxMembers: 8,
        createdAt: '2024-01-01T00:00:00Z'
      };

      mockAppSyncService.createRoomWithFilters.mockResolvedValue(mockRoom);

      // Act
      const result = await createRoomWithFilters(input);

      // Assert
      expect(result).toEqual(mockRoom);
      expect(mockAppSyncService.createRoomWithFilters).toHaveBeenCalledWith(input);
    });

    it('should create room with TV filters successfully', async () => {
      // Arrange
      const input: CreateRoomWithFiltersInput = {
        name: 'Comedy Series Binge',
        mediaType: 'TV',
        genreIds: [35, 18], // Comedy, Drama
        isPrivate: true
      };

      const mockRoom = {
        id: 'room-456',
        name: 'Comedy Series Binge',
        mediaType: 'TV',
        genreIds: [35, 18],
        genreNames: ['Comedy', 'Drama'],
        filterCriteria: {
          mediaType: 'TV',
          genreIds: [35, 18],
          roomId: 'room-456'
        },
        isPrivate: true,
        createdAt: '2024-01-01T00:00:00Z'
      };

      mockAppSyncService.createRoomWithFilters.mockResolvedValue(mockRoom);

      // Act
      const result = await createRoomWithFilters(input);

      // Assert
      expect(result).toEqual(mockRoom);
      expect(mockAppSyncService.createRoomWithFilters).toHaveBeenCalledWith(input);
    });

    it('should handle validation errors during room creation', async () => {
      // Arrange
      const input: CreateRoomWithFiltersInput = {
        name: '', // Invalid: empty name
        mediaType: 'MOVIE',
        genreIds: [28]
      };

      // Act & Assert
      await expect(createRoomWithFilters(input)).rejects.toThrow('El nombre de la sala es requerido');
      expect(mockAppSyncService.createRoomWithFilters).not.toHaveBeenCalled();
    });

    it('should handle invalid media type', async () => {
      // Arrange
      const input: CreateRoomWithFiltersInput = {
        name: 'Test Room',
        mediaType: 'INVALID' as MediaType,
        genreIds: [28]
      };

      // Act & Assert
      await expect(createRoomWithFilters(input)).rejects.toThrow('Tipo de contenido válido es requerido');
      expect(mockAppSyncService.createRoomWithFilters).not.toHaveBeenCalled();
    });

    it('should handle too many genres', async () => {
      // Arrange
      const input: CreateRoomWithFiltersInput = {
        name: 'Test Room',
        mediaType: 'MOVIE',
        genreIds: [28, 35, 18, 12] // 4 genres > max 3
      };

      // Act & Assert
      await expect(createRoomWithFilters(input)).rejects.toThrow('Máximo 3 géneros permitidos');
      expect(mockAppSyncService.createRoomWithFilters).not.toHaveBeenCalled();
    });

    it('should handle GraphQL errors', async () => {
      // Arrange
      const input: CreateRoomWithFiltersInput = {
        name: 'Test Room',
        mediaType: 'MOVIE',
        genreIds: [28]
      };

      const graphQLError = {
        graphQLErrors: [{
          message: 'Insufficient content for selected filters',
          extensions: {
            code: 'INSUFFICIENT_CONTENT'
          }
        }]
      };

      mockAppSyncService.createRoomWithFilters.mockRejectedValue(graphQLError);

      // Act & Assert
      await expect(createRoomWithFilters(input)).rejects.toThrow('Insufficient content for selected filters');
    });

    it('should handle network errors', async () => {
      // Arrange
      const input: CreateRoomWithFiltersInput = {
        name: 'Test Room',
        mediaType: 'MOVIE',
        genreIds: [28]
      };

      const networkError = {
        networkError: {
          message: 'Network request failed'
        }
      };

      mockAppSyncService.createRoomWithFilters.mockRejectedValue(networkError);

      // Act & Assert
      await expect(createRoomWithFilters(input)).rejects.toThrow('Error de conexión. Verifica tu conexión a internet.');
    });
  });

  describe('Filter Immutability', () => {
    it('should reject filter updates due to immutability', async () => {
      // Arrange
      const roomId = 'room-123';
      const input: UpdateRoomFiltersInput = {
        mediaType: 'TV',
        genreIds: [35, 18]
      };

      const immutabilityError = {
        graphQLErrors: [{
          message: 'Los filtros no pueden modificarse después de crear la sala',
          extensions: {
            code: 'FILTER_IMMUTABLE',
            suggestion: {
              action: 'Crear nueva sala',
              message: 'Para cambiar filtros, crea una nueva sala con los filtros deseados',
              currentFilters: {
                mediaType: 'MOVIE',
                genreIds: [28],
                genreNames: ['Action']
              },
              requestedFilters: {
                mediaType: 'TV',
                genreIds: [35, 18]
              }
            }
          }
        }]
      };

      mockAppSyncService.updateRoomFilters.mockRejectedValue(immutabilityError);

      // Act & Assert
      await expect(updateRoomFilters(roomId, input)).rejects.toMatchObject({
        message: 'Los filtros no pueden modificarse después de crear la sala',
        code: 'FILTER_IMMUTABLE',
        suggestion: expect.objectContaining({
          action: 'Crear nueva sala',
          message: expect.stringContaining('Para cambiar filtros')
        })
      });

      expect(mockAppSyncService.updateRoomFilters).toHaveBeenCalledWith(roomId, input);
    });
  });

  describe('Genre Loading', () => {
    it('should load movie genres successfully', async () => {
      // Arrange
      const mockGenres = [
        { id: 28, name: 'Action' },
        { id: 12, name: 'Adventure' },
        { id: 35, name: 'Comedy' },
        { id: 18, name: 'Drama' },
        { id: 27, name: 'Horror' }
      ];

      mockAppSyncService.getAvailableGenres.mockResolvedValue(mockGenres);

      // Act
      const result = await getAvailableGenres('MOVIE');

      // Assert
      expect(result).toEqual(mockGenres);
      expect(mockAppSyncService.getAvailableGenres).toHaveBeenCalledWith('MOVIE');
    });

    it('should load TV genres successfully', async () => {
      // Arrange
      const mockGenres = [
        { id: 10759, name: 'Action & Adventure' },
        { id: 35, name: 'Comedy' },
        { id: 18, name: 'Drama' },
        { id: 10765, name: 'Sci-Fi & Fantasy' },
        { id: 10766, name: 'Soap' }
      ];

      mockAppSyncService.getAvailableGenres.mockResolvedValue(mockGenres);

      // Act
      const result = await getAvailableGenres('TV');

      // Assert
      expect(result).toEqual(mockGenres);
      expect(mockAppSyncService.getAvailableGenres).toHaveBeenCalledWith('TV');
    });

    it('should handle genre loading errors', async () => {
      // Arrange
      const graphQLError = {
        graphQLErrors: [{
          message: 'Failed to fetch genres from TMDB'
        }]
      };

      mockAppSyncService.getAvailableGenres.mockRejectedValue(graphQLError);

      // Act & Assert
      await expect(getAvailableGenres('MOVIE')).rejects.toThrow('Failed to fetch genres from TMDB');
    });

    it('should handle empty genre response', async () => {
      // Arrange
      mockAppSyncService.getAvailableGenres.mockResolvedValue([]);

      // Act
      const result = await getAvailableGenres('MOVIE');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('Room Analysis Utilities', () => {
    it('should correctly identify rooms with content filters', () => {
      // Arrange
      const roomWithFilters = {
        id: 'room-1',
        name: 'Filtered Room',
        mediaType: 'MOVIE' as MediaType,
        genreIds: [28, 35],
        filterCriteria: {
          mediaType: 'MOVIE' as MediaType,
          genreIds: [28, 35],
          roomId: 'room-1'
        }
      } as any;

      const roomWithoutFilters = {
        id: 'room-2',
        name: 'Legacy Room',
        genrePreferences: ['Action', 'Comedy']
      } as any;

      // Act & Assert
      expect(hasContentFilters(roomWithFilters)).toBe(true);
      expect(hasContentFilters(roomWithoutFilters)).toBe(false);
    });

    it('should correctly identify legacy rooms', () => {
      // Arrange
      const legacyRoom = {
        id: 'room-1',
        name: 'Legacy Room',
        genrePreferences: ['Action', 'Comedy']
      } as any;

      const modernRoom = {
        id: 'room-2',
        name: 'Modern Room',
        mediaType: 'MOVIE' as MediaType,
        genreIds: [28, 35],
        filterCriteria: {
          mediaType: 'MOVIE' as MediaType,
          genreIds: [28, 35],
          roomId: 'room-2'
        }
      } as any;

      // Act & Assert
      expect(isLegacyRoom(legacyRoom)).toBe(true);
      expect(isLegacyRoom(modernRoom)).toBe(false);
    });

    it('should generate correct filter summary for modern rooms', () => {
      // Arrange
      const modernRoom = {
        id: 'room-1',
        name: 'Modern Room',
        mediaType: 'MOVIE' as MediaType,
        genreIds: [28, 35, 18],
        genreNames: ['Action', 'Comedy', 'Drama'],
        filterCriteria: {
          mediaType: 'MOVIE' as MediaType,
          genreIds: [28, 35, 18],
          roomId: 'room-1'
        }
      } as any;

      // Act
      const summary = getFilterSummary(modernRoom);

      // Assert
      expect(summary).toEqual({
        hasFilters: true,
        isLegacy: false,
        mediaType: 'MOVIE',
        genreCount: 3,
        genreNames: ['Action', 'Comedy', 'Drama']
      });
    });

    it('should generate correct filter summary for legacy rooms', () => {
      // Arrange
      const legacyRoom = {
        id: 'room-1',
        name: 'Legacy Room',
        genrePreferences: ['Action', 'Comedy']
      } as any;

      // Act
      const summary = getFilterSummary(legacyRoom);

      // Assert
      expect(summary).toEqual({
        hasFilters: false,
        isLegacy: true,
        genreCount: 2,
        genreNames: ['Action', 'Comedy']
      });
    });

    it('should generate correct filter summary for rooms without filters', () => {
      // Arrange
      const emptyRoom = {
        id: 'room-1',
        name: 'Empty Room'
      } as any;

      // Act
      const summary = getFilterSummary(emptyRoom);

      // Assert
      expect(summary).toEqual({
        hasFilters: false,
        isLegacy: false,
        genreCount: 0,
        genreNames: []
      });
    });
  });

  describe('Error Recovery and Retry Logic', () => {
    it('should handle intermittent network failures', async () => {
      // Arrange
      const input: CreateRoomWithFiltersInput = {
        name: 'Test Room',
        mediaType: 'MOVIE',
        genreIds: [28]
      };

      const networkError = { networkError: { message: 'Network request failed' } };
      const successResponse = {
        id: 'room-123',
        name: 'Test Room',
        mediaType: 'MOVIE',
        genreIds: [28]
      };

      mockAppSyncService.createRoomWithFilters
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse);

      // Act - First attempt fails
      await expect(createRoomWithFilters(input)).rejects.toThrow('Error de conexión');

      // Act - Second attempt succeeds
      const result = await createRoomWithFilters(input);

      // Assert
      expect(result).toEqual(successResponse);
      expect(mockAppSyncService.createRoomWithFilters).toHaveBeenCalledTimes(2);
    });

    it('should handle genre loading retry after failure', async () => {
      // Arrange
      const networkError = { networkError: { message: 'Network request failed' } };
      const successResponse = [{ id: 28, name: 'Action' }];

      mockAppSyncService.getAvailableGenres
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse);

      // Act - First attempt fails
      await expect(getAvailableGenres('MOVIE')).rejects.toThrow('Error de conexión');

      // Act - Second attempt succeeds
      const result = await getAvailableGenres('MOVIE');

      // Assert
      expect(result).toEqual(successResponse);
      expect(mockAppSyncService.getAvailableGenres).toHaveBeenCalledTimes(2);
    });
  });
});