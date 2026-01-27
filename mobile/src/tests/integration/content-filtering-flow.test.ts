/**
 * Integration Tests: Complete Content Filtering Flow
 * 
 * Tests the end-to-end room creation with filters, content loading,
 * and replenishment scenarios with error handling and edge cases.
 */

import { renderHook, act } from '@testing-library/react-hooks';
import { Alert } from 'react-native';
import { useCreateRoomWithFilters } from '../../hooks/useRoomFilters';
import { useGenres } from '../../hooks/useGenres';
import { createRoomWithFilters, getAvailableGenres } from '../../services/roomService';
import { MediaType, CreateRoomWithFiltersInput } from '../../types/content-filtering';

// Mock dependencies
jest.mock('../../services/roomService');
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn()
  }
}));

const mockCreateRoomWithFilters = createRoomWithFilters as jest.MockedFunction<typeof createRoomWithFilters>;
const mockGetAvailableGenres = getAvailableGenres as jest.MockedFunction<typeof getAvailableGenres>;
const mockAlert = Alert.alert as jest.MockedFunction<typeof Alert.alert>;

describe('Content Filtering Integration Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Room Creation with Filters', () => {
    it('should successfully create room with movie filters', async () => {
      // Arrange
      const mockRoom = {
        id: 'room-123',
        name: 'Action Movies Night',
        mediaType: 'MOVIE' as MediaType,
        genreIds: [28, 12], // Action, Adventure
        genreNames: ['Action', 'Adventure'],
        filterCriteria: {
          mediaType: 'MOVIE' as MediaType,
          genreIds: [28, 12],
          roomId: 'room-123'
        }
      };

      mockCreateRoomWithFilters.mockResolvedValue(mockRoom as any);

      const { result } = renderHook(() => useCreateRoomWithFilters());

      // Act
      await act(async () => {
        result.current.setRoomName('Action Movies Night');
        result.current.setMediaType('MOVIE');
        result.current.setGenreIds([28, 12]);
        
        const createdRoom = await result.current.submitForm();
        
        // Assert
        expect(createdRoom).toEqual(mockRoom);
        expect(mockCreateRoomWithFilters).toHaveBeenCalledWith({
          name: 'Action Movies Night',
          mediaType: 'MOVIE',
          genreIds: [28, 12],
          isPrivate: false
        });
      });
    });

    it('should successfully create room with TV filters', async () => {
      // Arrange
      const mockRoom = {
        id: 'room-456',
        name: 'Comedy Series Binge',
        mediaType: 'TV' as MediaType,
        genreIds: [35], // Comedy
        genreNames: ['Comedy'],
        filterCriteria: {
          mediaType: 'TV' as MediaType,
          genreIds: [35],
          roomId: 'room-456'
        }
      };

      mockCreateRoomWithFilters.mockResolvedValue(mockRoom as any);

      const { result } = renderHook(() => useCreateRoomWithFilters());

      // Act
      await act(async () => {
        result.current.setRoomName('Comedy Series Binge');
        result.current.setMediaType('TV');
        result.current.setGenreIds([35]);
        result.current.setIsPrivate(true);
        result.current.setMaxMembers(8);
        
        const createdRoom = await result.current.submitForm();
        
        // Assert
        expect(createdRoom).toEqual(mockRoom);
        expect(mockCreateRoomWithFilters).toHaveBeenCalledWith({
          name: 'Comedy Series Binge',
          mediaType: 'TV',
          genreIds: [35],
          isPrivate: true,
          maxMembers: 8
        });
      });
    });

    it('should create room with maximum genres (3)', async () => {
      // Arrange
      const mockRoom = {
        id: 'room-789',
        name: 'Mixed Genres Room',
        mediaType: 'MOVIE' as MediaType,
        genreIds: [28, 35, 18], // Action, Comedy, Drama
        genreNames: ['Action', 'Comedy', 'Drama']
      };

      mockCreateRoomWithFilters.mockResolvedValue(mockRoom as any);

      const { result } = renderHook(() => useCreateRoomWithFilters());

      // Act
      await act(async () => {
        result.current.setRoomName('Mixed Genres Room');
        result.current.setMediaType('MOVIE');
        result.current.setGenreIds([28, 35, 18]);
        
        const createdRoom = await result.current.submitForm();
        
        // Assert
        expect(createdRoom).toEqual(mockRoom);
        expect(mockCreateRoomWithFilters).toHaveBeenCalledWith({
          name: 'Mixed Genres Room',
          mediaType: 'MOVIE',
          genreIds: [28, 35, 18],
          isPrivate: false
        });
      });
    });
  });

  describe('Genre Loading and Selection Flow', () => {
    it('should load movie genres successfully', async () => {
      // Arrange
      const mockGenres = [
        { id: 28, name: 'Action' },
        { id: 12, name: 'Adventure' },
        { id: 35, name: 'Comedy' },
        { id: 18, name: 'Drama' }
      ];

      mockGetAvailableGenres.mockResolvedValue(mockGenres);

      const { result, waitForNextUpdate } = renderHook(() => useGenres('MOVIE'));

      // Act
      await waitForNextUpdate();

      // Assert
      expect(result.current.genres).toEqual(mockGenres);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeUndefined();
      expect(mockGetAvailableGenres).toHaveBeenCalledWith('MOVIE');
    });

    it('should load TV genres successfully', async () => {
      // Arrange
      const mockGenres = [
        { id: 10759, name: 'Action & Adventure' },
        { id: 35, name: 'Comedy' },
        { id: 18, name: 'Drama' },
        { id: 10765, name: 'Sci-Fi & Fantasy' }
      ];

      mockGetAvailableGenres.mockResolvedValue(mockGenres);

      const { result, waitForNextUpdate } = renderHook(() => useGenres('TV'));

      // Act
      await waitForNextUpdate();

      // Assert
      expect(result.current.genres).toEqual(mockGenres);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeUndefined();
      expect(mockGetAvailableGenres).toHaveBeenCalledWith('TV');
    });

    it('should handle genre loading errors', async () => {
      // Arrange
      const errorMessage = 'Failed to load genres';
      mockGetAvailableGenres.mockRejectedValue(new Error(errorMessage));

      const { result, waitForNextUpdate } = renderHook(() => useGenres('MOVIE'));

      // Act
      await waitForNextUpdate();

      // Assert
      expect(result.current.genres).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(errorMessage);
    });

    it('should refetch genres after error', async () => {
      // Arrange
      mockGetAvailableGenres
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([{ id: 28, name: 'Action' }]);

      const { result, waitForNextUpdate } = renderHook(() => useGenres('MOVIE'));

      // Wait for initial error
      await waitForNextUpdate();
      expect(result.current.error).toBe('Network error');

      // Act - refetch
      await act(async () => {
        await result.current.refetch();
      });

      // Assert
      expect(result.current.genres).toEqual([{ id: 28, name: 'Action' }]);
      expect(result.current.error).toBeUndefined();
      expect(mockGetAvailableGenres).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle validation errors during room creation', async () => {
      // Arrange
      const { result } = renderHook(() => useCreateRoomWithFilters());

      // Act & Assert - Missing name
      await act(async () => {
        result.current.setMediaType('MOVIE');
        result.current.setGenreIds([28]);
        
        await expect(result.current.submitForm()).rejects.toThrow('Nombre de la sala es requerido');
      });

      // Act & Assert - Missing media type
      await act(async () => {
        result.current.setRoomName('Test Room');
        result.current.setMediaType(undefined as any);
        
        await expect(result.current.submitForm()).rejects.toThrow('Tipo de contenido es requerido');
      });

      // Act & Assert - Too many genres
      await act(async () => {
        result.current.setRoomName('Test Room');
        result.current.setMediaType('MOVIE');
        result.current.setGenreIds([28, 35, 18, 12]); // 4 genres > max 3
        
        await expect(result.current.submitForm()).rejects.toThrow('Máximo 3 géneros permitidos');
      });
    });

    it('should handle content filtering errors with suggestions', async () => {
      // Arrange
      const contentFilteringError = {
        message: 'No hay contenido disponible para los filtros seleccionados',
        code: 'INSUFFICIENT_CONTENT',
        suggestion: {
          action: 'Usar filtros sugeridos',
          message: 'Prueba con géneros más populares',
          currentFilters: {
            mediaType: 'MOVIE' as MediaType,
            genreIds: [28, 35],
            genreNames: ['Action', 'Comedy']
          },
          requestedFilters: {
            mediaType: 'MOVIE' as MediaType,
            genreIds: [99, 100] // Non-existent genres
          }
        }
      };

      mockCreateRoomWithFilters.mockRejectedValue(contentFilteringError);

      const { result } = renderHook(() => useCreateRoomWithFilters());

      // Act
      await act(async () => {
        result.current.setRoomName('Test Room');
        result.current.setMediaType('MOVIE');
        result.current.setGenreIds([99, 100]);
        
        await expect(result.current.submitForm()).rejects.toEqual(contentFilteringError);
      });

      // Assert
      expect(result.current.error).toEqual(contentFilteringError);
    });

    it('should handle network errors during room creation', async () => {
      // Arrange
      const networkError = new Error('Error de conexión. Verifica tu conexión a internet.');
      mockCreateRoomWithFilters.mockRejectedValue(networkError);

      const { result } = renderHook(() => useCreateRoomWithFilters());

      // Act
      await act(async () => {
        result.current.setRoomName('Test Room');
        result.current.setMediaType('MOVIE');
        result.current.setGenreIds([28]);
        
        await expect(result.current.submitForm()).rejects.toThrow('Error de conexión');
      });

      // Assert
      expect(result.current.error).toEqual(networkError);
    });

    it('should handle empty genre list for media type', async () => {
      // Arrange
      mockGetAvailableGenres.mockResolvedValue([]);

      const { result, waitForNextUpdate } = renderHook(() => useGenres('MOVIE'));

      // Act
      await waitForNextUpdate();

      // Assert
      expect(result.current.genres).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeUndefined();
    });

    it('should reset form data correctly', async () => {
      // Arrange
      const { result } = renderHook(() => useCreateRoomWithFilters());

      // Act - Set form data
      await act(async () => {
        result.current.setRoomName('Test Room');
        result.current.setRoomDescription('Test Description');
        result.current.setMediaType('MOVIE');
        result.current.setGenreIds([28, 35]);
        result.current.setIsPrivate(true);
        result.current.setMaxMembers(8);
      });

      // Verify data is set
      expect(result.current.formData.name).toBe('Test Room');
      expect(result.current.formData.mediaType).toBe('MOVIE');
      expect(result.current.formData.genreIds).toEqual([28, 35]);

      // Act - Reset form
      await act(async () => {
        result.current.resetForm();
      });

      // Assert - Form is reset
      expect(result.current.formData).toEqual({
        maxMembers: 6,
        isPrivate: false
      });
    });
  });

  describe('Form Validation Flow', () => {
    it('should validate complete form correctly', async () => {
      // Arrange
      const { result } = renderHook(() => useCreateRoomWithFilters());

      // Act - Set valid form data
      await act(async () => {
        result.current.setRoomName('Valid Room');
        result.current.setMediaType('MOVIE');
        result.current.setGenreIds([28, 35]);
        
        const validation = result.current.validateForm();
        
        // Assert
        expect(validation.valid).toBe(true);
        expect(validation.errors).toEqual([]);
        expect(result.current.isValid).toBe(true);
      });
    });

    it('should validate form with warnings', async () => {
      // Arrange
      const { result } = renderHook(() => useCreateRoomWithFilters());

      // Act - Set form data with no genres
      await act(async () => {
        result.current.setRoomName('Valid Room');
        result.current.setMediaType('MOVIE');
        result.current.setGenreIds([]);
        
        const validation = result.current.validateForm();
        
        // Assert
        expect(validation.valid).toBe(true); // Still valid, just warnings
        expect(validation.warnings).toContain('Selecciona al menos un género para mejores recomendaciones');
        expect(result.current.warnings.length).toBeGreaterThan(0);
      });
    });

    it('should validate form with multiple errors', async () => {
      // Arrange
      const { result } = renderHook(() => useCreateRoomWithFilters());

      // Act - Set invalid form data
      await act(async () => {
        // Don't set name (required)
        result.current.setMediaType(undefined as any); // Invalid media type
        result.current.setGenreIds([28, 35, 18, 12]); // Too many genres
        
        const validation = result.current.validateForm();
        
        // Assert
        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain('Tipo de contenido es requerido');
        expect(validation.errors).toContain('Máximo 3 géneros permitidos');
        expect(result.current.isValid).toBe(false);
      });
    });
  });

  describe('Media Type Change Flow', () => {
    it('should reset genres when media type changes', async () => {
      // Arrange
      const { result } = renderHook(() => useCreateRoomWithFilters());

      // Act - Set initial data
      await act(async () => {
        result.current.setMediaType('MOVIE');
        result.current.setGenreIds([28, 35]); // Action, Comedy
      });

      expect(result.current.formData.genreIds).toEqual([28, 35]);

      // Act - Change media type
      await act(async () => {
        result.current.setMediaType('TV');
      });

      // Assert - Genres should be reset
      expect(result.current.formData.mediaType).toBe('TV');
      expect(result.current.formData.genreIds).toEqual([]);
    });
  });

  describe('Loading States', () => {
    it('should handle loading state during room creation', async () => {
      // Arrange
      let resolvePromise: (value: any) => void;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      
      mockCreateRoomWithFilters.mockReturnValue(promise as any);

      const { result } = renderHook(() => useCreateRoomWithFilters());

      // Act - Start room creation
      await act(async () => {
        result.current.setRoomName('Test Room');
        result.current.setMediaType('MOVIE');
        result.current.setGenreIds([28]);
      });

      // Start submission (don't await)
      act(() => {
        result.current.submitForm();
      });

      // Assert - Loading state
      expect(result.current.loading).toBe(true);

      // Resolve promise
      await act(async () => {
        resolvePromise!({ id: 'room-123', name: 'Test Room' });
        await promise;
      });

      // Assert - Loading complete
      expect(result.current.loading).toBe(false);
    });

    it('should handle loading state during genre fetching', async () => {
      // Arrange
      let resolvePromise: (value: any) => void;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      
      mockGetAvailableGenres.mockReturnValue(promise as any);

      const { result } = renderHook(() => useGenres('MOVIE'));

      // Assert - Initial loading state
      expect(result.current.loading).toBe(true);
      expect(result.current.genres).toEqual([]);

      // Resolve promise
      await act(async () => {
        resolvePromise!([{ id: 28, name: 'Action' }]);
        await promise;
      });

      // Assert - Loading complete
      expect(result.current.loading).toBe(false);
      expect(result.current.genres).toEqual([{ id: 28, name: 'Action' }]);
    });
  });
});