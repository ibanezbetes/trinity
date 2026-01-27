import { apiClient } from './apiClient';
import { operationQueueService } from './operationQueueService';
import { errorLoggingService } from './errorLoggingService';
import { appSyncService } from './appSyncService';
import { 
  MediaType, 
  Genre, 
  CreateRoomWithFiltersInput, 
  UpdateRoomFiltersInput,
  RoomWithFilters,
  FilterSummary
} from '../types/content-filtering';

// Flag para usar mock o backend real
const USE_MOCK = false; // Cambiar a false cuando el backend esté disponible

export interface ContentFilters {
  genres?: string[];
  releaseYearFrom?: number;
  releaseYearTo?: number;
  minRating?: number;
  contentTypes?: ('movie' | 'tv')[];
}

export interface CreateRoomDto {
  name: string;
  description?: string;
  isPrivate?: boolean;
  maxMembers?: number;
  genrePreferences?: string[]; // Enhanced: Support for genre preferences
  filters: ContentFilters;
}

export interface Room {
  id: string;
  name: string;
  description?: string;
  status: string;
  hostId: string;
  inviteCode: string;
  inviteUrl?: string; // Enhanced: Support for invite URLs
  genrePreferences?: string[]; // Enhanced: Support for genre preferences
  creatorId: string;
  filters: ContentFilters;
  masterList: string[];
  isActive: boolean;
  isPrivate?: boolean;
  memberCount: number;
  maxMembers?: number;
  matchCount?: number;
  currentMovieIndex?: number;
  totalMovies?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomSummary {
  id: string;
  name: string;
  creatorId: string;
  memberCount: number;
  matchCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface RoomMember {
  userId: string;
  role: 'creator' | 'member';
  status: 'active' | 'inactive';
  joinedAt: string;
  lastActivityAt: string;
}

export interface RoomDetails {
  room: Room;
  members: RoomMember[];
  matchCount: number;
  userRole: string;
}

export interface RoomStats {
  totalMembers: number;
  activeMembers: number;
  totalMatches: number;
  averageProgress: number;
}

export interface NextMediaResponse {
  mediaId?: string;
  completed: boolean;
  message?: string;
}

export interface MemberProgress {
  currentIndex: number;
  totalItems: number;
  percentage: number;
}

class RoomService {
  /**
   * Crear una nueva sala con queue support para poor connectivity
   * Enhanced: Now supports genre preferences and invite URLs
   */
  async createRoom(dto: CreateRoomDto): Promise<Room> {
    const result = await operationQueueService.executeOrQueue(
      'CREATE_ROOM',
      dto,
      async () => {
        if (USE_MOCK) {
          return this.mockCreateRoom(dto);
        }

        // Use GraphQL via AppSync for enhanced room creation
        try {
          const appSyncResult = await appSyncService.createRoom({
            name: dto.name,
            description: dto.description,
            isPrivate: dto.isPrivate,
            maxMembers: dto.maxMembers,
            genrePreferences: dto.genrePreferences
          });

          // Transform AppSync result to Room interface
          const room = appSyncResult.createRoom;
          return {
            id: room.id,
            name: room.name,
            description: room.description,
            status: room.status,
            hostId: room.hostId,
            inviteCode: room.inviteCode,
            inviteUrl: room.inviteUrl,
            genrePreferences: room.genrePreferences,
            creatorId: room.hostId, // Map hostId to creatorId for compatibility
            filters: dto.filters,
            masterList: [],
            isActive: room.isActive,
            isPrivate: room.isPrivate,
            memberCount: room.memberCount,
            maxMembers: room.maxMembers,
            matchCount: room.matchCount || 0,
            createdAt: room.createdAt,
            updatedAt: room.updatedAt || room.createdAt
          };
        } catch (error: any) {
          // Enhanced error handling with context
          errorLoggingService.logError(error, {
            operation: 'createRoom',
            metadata: { dto }
          }, {
            message: 'Unable to create room. Please check your connection and try again.',
            canRetry: true
          });

          // Fallback to REST API if GraphQL fails
          return await apiClient.post<Room>('/rooms', dto);
        }
      },
      {
        priority: 'HIGH', // Room creation is high priority
        maxRetries: 3,
        expiresInMs: 10 * 60 * 1000 // 10 minutes expiration
      }
    );

    if (result.success) {
      return result.data;
    } else {
      // If queued, return optimistic response
      if (result.data?.queued) {
        console.log('📝 Room creation queued for later execution');
        return this.mockCreateRoom(dto); // Optimistic response
      }
      throw new Error(result.error || 'Failed to create room');
    }
  }

  /**
   * Obtener salas del usuario con enhanced error handling
   */
  async getUserRooms(): Promise<RoomSummary[]> {
    console.log('🔄 RoomService: getUserRooms called');
    try {
      if (USE_MOCK) {
        console.log('📝 RoomService: Using mock data');
        return this.mockGetUserRooms();
      }

      // Try GraphQL first for enhanced data
      try {
        console.log('🌐 RoomService: Making GraphQL call to getUserRooms');
        const appSyncResult = await appSyncService.getUserRooms();

        // Transform GraphQL result to RoomSummary interface
        const rooms = appSyncResult.getUserRooms.map(room => ({
          id: room.id,
          name: room.name,
          creatorId: room.hostId || 'unknown',
          memberCount: room.memberCount || 0,
          matchCount: room.matchCount || 0,
          isActive: room.isActive,
          createdAt: room.createdAt
        }));

        console.log('✅ RoomService: GraphQL call successful', rooms);
        return rooms;
      } catch (graphqlError: any) {
        console.log('⚠️ RoomService: GraphQL failed, falling back to REST API', graphqlError.message);

        // Fallback to REST API
        console.log('🌐 RoomService: Making REST API call to /rooms');
        const result = await apiClient.get<RoomSummary[]>('/rooms');
        console.log('✅ RoomService: REST API call successful', result);
        return result;
      }
    } catch (error: any) {
      console.error('❌ RoomService: All API calls failed', error);

      // Enhanced error logging
      errorLoggingService.logError(error, {
        operation: 'getUserRooms'
      }, {
        message: 'Unable to load your rooms. Please check your connection.',
        canRetry: true
      });

      console.log('🔍 RoomService: Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });

      // Si hay error de autenticación o no hay salas, devolver array vacío
      if (error.response?.status === 401 || error.response?.status === 404) {
        console.log('🔒 RoomService: Auth error or not found, returning empty array');
        return [];
      }
      // Solo usar mock en desarrollo si está habilitado
      if (USE_MOCK) {
        console.log('📝 RoomService: Falling back to mock data');
        return this.mockGetUserRooms();
      }
      // En producción, devolver array vacío en caso de error
      console.log('🚫 RoomService: Returning empty array due to error');
      return [];
    }
  }

  /**
   * Obtener detalles de una sala con enhanced fields
   */
  async getRoomDetails(roomId: string): Promise<RoomDetails> {
    try {
      if (USE_MOCK) {
        return this.mockGetRoomDetails(roomId);
      }

      // Try GraphQL first for enhanced room details
      try {
        const appSyncResult = await appSyncService.getRoom(roomId);
        const room = appSyncResult.getRoom;

        // Transform to RoomDetails interface
        return {
          room: {
            id: room.id,
            name: room.name,
            description: room.description,
            status: room.status,
            hostId: room.hostId,
            inviteCode: room.inviteCode,
            inviteUrl: room.inviteUrl,
            genrePreferences: room.genrePreferences,
            creatorId: room.hostId,
            filters: { contentTypes: ['movie'] }, // Default filters
            masterList: [],
            isActive: room.isActive,
            isPrivate: room.isPrivate,
            memberCount: room.memberCount,
            maxMembers: room.maxMembers,
            matchCount: room.matchCount,
            createdAt: room.createdAt,
            updatedAt: room.updatedAt
          },
          members: [], // Would need separate API call for members
          matchCount: room.matchCount || 0,
          userRole: 'creator' // Assume creator for now - would need to determine from user context
        };
      } catch (graphqlError: any) {
        console.log('⚠️ RoomService: GraphQL getRoomDetails failed, falling back to REST API', graphqlError.message);

        // Enhanced error logging
        errorLoggingService.logError(graphqlError, {
          operation: 'getRoomDetails',
          roomId
        });

        // Fallback to REST API
        return await apiClient.get<RoomDetails>(`/rooms/${roomId}`);
      }
    } catch (error: any) {
      console.error('Error getting room details:', error);

      // Enhanced error logging
      errorLoggingService.logError(error, {
        operation: 'getRoomDetails',
        roomId
      }, {
        message: 'Unable to load room details. Please try again.',
        canRetry: true
      });

      if (USE_MOCK) {
        return this.mockGetRoomDetails(roomId);
      }
      throw error;
    }
  }

  /**
   * Obtener estadísticas de una sala
   */
  async getRoomStats(roomId: string): Promise<RoomStats> {
    try {
      if (USE_MOCK) {
        return this.mockGetRoomStats();
      }
      return await apiClient.get<RoomStats>(`/rooms/${roomId}/stats`);
    } catch (error) {
      console.error('Error getting room stats:', error);
      if (USE_MOCK) {
        return this.mockGetRoomStats();
      }
      throw error;
    }
  }

  /**
   * Obtener mi progreso en la sala
   */
  async getMyProgress(roomId: string): Promise<MemberProgress> {
    try {
      if (USE_MOCK) {
        return { currentIndex: 5, totalItems: 20, percentage: 25 };
      }
      return await apiClient.get<MemberProgress>(`/rooms/${roomId}/my-progress`);
    } catch (error) {
      console.error('Error getting progress:', error);
      return { currentIndex: 0, totalItems: 0, percentage: 0 };
    }
  }

  /**
   * Obtener siguiente media para votar
   */
  async getNextMedia(roomId: string): Promise<NextMediaResponse> {
    try {
      if (USE_MOCK) {
        return { mediaId: '550', completed: false }; // Fight Club como ejemplo
      }
      return await apiClient.get<NextMediaResponse>(`/rooms/${roomId}/next-media`);
    } catch (error) {
      console.error('Error getting next media:', error);
      return { completed: true, message: 'Error al obtener contenido' };
    }
  }

  /**
   * Unirse a una sala con código de invitación con queue support y enhanced error handling
   */
  async joinRoom(inviteCode: string): Promise<Room> {
    const result = await operationQueueService.executeOrQueue(
      'JOIN_ROOM',
      { inviteCode },
      async () => {
        if (USE_MOCK) {
          return this.mockJoinRoom(inviteCode);
        }

        // Use GraphQL via AppSync for enhanced room joining
        try {
          const appSyncResult = await appSyncService.joinRoomByInvite(inviteCode);
          const room = appSyncResult.joinRoomByInvite;

          // Transform AppSync result to Room interface
          return {
            id: room.id,
            name: room.name,
            description: room.description,
            status: room.status,
            hostId: room.hostId,
            inviteCode: room.inviteCode,
            inviteUrl: room.inviteUrl,
            genrePreferences: room.genrePreferences,
            creatorId: room.hostId,
            filters: { contentTypes: ['movie'] }, // Default filters
            masterList: [],
            isActive: room.isActive,
            isPrivate: room.isPrivate,
            memberCount: room.memberCount,
            maxMembers: room.maxMembers,
            matchCount: room.matchCount,
            createdAt: room.createdAt,
            updatedAt: room.updatedAt
          };
        } catch (error: any) {
          // Enhanced error handling with context
          errorLoggingService.logError(error, {
            operation: 'joinRoom',
            metadata: { inviteCode }
          });

          // Fallback to REST API if GraphQL fails
          return await apiClient.post<Room>('/rooms/join', { inviteCode });
        }
      },
      {
        priority: 'HIGH', // Room joining is high priority
        maxRetries: 3,
        expiresInMs: 5 * 60 * 1000 // 5 minutes expiration
      }
    );

    if (result.success) {
      return result.data;
    } else {
      // If queued, return optimistic response
      if (result.data?.queued) {
        console.log('📝 Room join queued for later execution');
        return this.mockJoinRoom(inviteCode); // Optimistic response
      }
      throw new Error(result.error || 'Failed to join room');
    }
  }

  /**
   * Abandonar una sala con queue support
   */
  async leaveRoom(roomId: string): Promise<void> {
    const result = await operationQueueService.executeOrQueue(
      'LEAVE_ROOM',
      {},
      async () => {
        if (USE_MOCK) {
          console.log('Mock: Left room', roomId);
          return;
        }
        await apiClient.delete(`/rooms/${roomId}/leave`);
      },
      {
        roomId,
        priority: 'MEDIUM', // Leave room is medium priority
        maxRetries: 2,
        expiresInMs: 2 * 60 * 1000 // 2 minutes expiration
      }
    );

    if (!result.success && !result.data?.queued) {
      throw new Error(result.error || 'Failed to leave room');
    }
    // If queued, operation will complete later
  }

  /**
   * Actualizar filtros de la sala (solo creador) con queue support y enhanced error handling
   */
  async updateRoomFilters(roomId: string, filters: ContentFilters): Promise<Room> {
    const result = await operationQueueService.executeOrQueue(
      'UPDATE_FILTERS',
      { filters },
      async () => {
        if (USE_MOCK) {
          console.log('Mock: Updated filters for room', roomId);
          return this.mockGetRoomDetails(roomId).then(d => d.room);
        }

        try {
          // Enhanced: Update both content filters and genre preferences
          const genrePreferences = filters.genres || [];

          // Note: This would require a new GraphQL mutation for updating room filters
          // For now, fallback to REST API
          return await apiClient.put<Room>(`/rooms/${roomId}/filters`, {
            filters,
            genrePreferences
          });
        } catch (error: any) {
          // Enhanced error handling
          errorLoggingService.logError(error, {
            operation: 'updateRoomFilters',
            roomId,
            metadata: { filters }
          }, {
            message: 'Unable to update room preferences. Please try again.',
            canRetry: true
          });

          throw error;
        }
      },
      {
        roomId,
        priority: 'LOW', // Filter updates are low priority
        maxRetries: 2,
        expiresInMs: 10 * 60 * 1000 // 10 minutes expiration
      }
    );

    if (result.success) {
      return result.data;
    } else {
      // If queued, return optimistic response
      if (result.data?.queued) {
        console.log('📝 Filter update queued for later execution');
        const roomDetails = await this.mockGetRoomDetails(roomId);
        return {
          ...roomDetails.room,
          filters,
          genrePreferences: filters.genres // Enhanced: Update genre preferences
        };
      }
      throw new Error(result.error || 'Failed to update room filters');
    }
  }

  /**
   * Regenerar código de invitación
   */
  async regenerateInviteCode(roomId: string): Promise<string> {
    try {
      if (USE_MOCK) {
        return this.generateInviteCode();
      }
      const response = await apiClient.post<{ inviteCode: string }>(`/rooms/${roomId}/regenerate-invite`);
      return response.inviteCode;
    } catch (error) {
      console.error('Error regenerating invite code:', error);
      throw error;
    }
  }

  /**
   * Eliminar una sala (solo creador)
   */
  async deleteRoom(roomId: string): Promise<void> {
    try {
      if (USE_MOCK) {
        console.log('Mock: Deleted room', roomId);
        return;
      }
      await apiClient.delete(`/rooms/${roomId}`);
    } catch (error) {
      console.error('Error deleting room:', error);
      throw error;
    }
  }

  // ============ MOCK DATA PARA DESARROLLO ============

  private mockCreateRoom(dto: CreateRoomDto): Room {
    const inviteCode = this.generateInviteCode();
    return {
      id: `room-${Date.now()}`,
      name: dto.name,
      description: dto.description,
      status: 'ACTIVE',
      hostId: 'mock-user-id',
      inviteCode,
      inviteUrl: `https://trinity.app/room/${inviteCode}`, // Enhanced: Generate invite URL
      genrePreferences: dto.genrePreferences, // Enhanced: Include genre preferences
      creatorId: 'mock-user-id',
      filters: dto.filters,
      masterList: [],
      isActive: true,
      isPrivate: dto.isPrivate || false,
      memberCount: 1,
      maxMembers: dto.maxMembers || 10,
      matchCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private mockGetUserRooms(): RoomSummary[] {
    return [
      {
        id: 'room-1',
        name: 'Noche de películas',
        creatorId: 'mock-user-id',
        memberCount: 3,
        matchCount: 5,
        isActive: true,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'room-2',
        name: 'Series con amigos',
        creatorId: 'other-user',
        memberCount: 4,
        matchCount: 2,
        isActive: true,
        createdAt: new Date(Date.now() - 172800000).toISOString(),
      },
      {
        id: 'room-3',
        name: 'Documentales',
        creatorId: 'mock-user-id',
        memberCount: 2,
        matchCount: 8,
        isActive: true,
        createdAt: new Date(Date.now() - 259200000).toISOString(),
      },
    ];
  }

  private mockGetRoomDetails(roomId: string): Promise<RoomDetails> {
    return Promise.resolve({
      room: {
        id: roomId,
        name: 'Noche de películas',
        description: 'Una sala para ver películas con amigos',
        status: 'ACTIVE',
        hostId: 'mock-user-id',
        inviteCode: 'ABC123',
        inviteUrl: 'https://trinity.app/room/ABC123', // Enhanced: Include invite URL
        genrePreferences: ['Action', 'Adventure', 'Comedy'], // Enhanced: Include genre preferences
        creatorId: 'mock-user-id',
        filters: {
          genres: ['28', '12', '35'], // Action, Adventure, Comedy
          contentTypes: ['movie'],
        },
        masterList: ['550', '551', '552', '553', '554'],
        isActive: true,
        isPrivate: false,
        memberCount: 3,
        maxMembers: 10,
        matchCount: 5,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      members: [
        {
          userId: 'mock-user-id',
          role: 'creator',
          status: 'active',
          joinedAt: new Date(Date.now() - 86400000).toISOString(),
          lastActivityAt: new Date().toISOString(),
        },
        {
          userId: 'user-2',
          role: 'member',
          status: 'active',
          joinedAt: new Date(Date.now() - 43200000).toISOString(),
          lastActivityAt: new Date().toISOString(),
        },
        {
          userId: 'user-3',
          role: 'member',
          status: 'inactive',
          joinedAt: new Date(Date.now() - 21600000).toISOString(),
          lastActivityAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
      matchCount: 5,
      userRole: 'creator',
    });
  }

  private mockGetRoomStats(): RoomStats {
    return {
      totalMembers: 3,
      activeMembers: 2,
      totalMatches: 5,
      averageProgress: 45,
    };
  }

  private mockJoinRoom(inviteCode: string): Room {
    return {
      id: `room-joined-${Date.now()}`,
      name: `Sala ${inviteCode}`,
      description: 'Sala unida por código de invitación',
      status: 'ACTIVE',
      hostId: 'other-user',
      inviteCode,
      inviteUrl: `https://trinity.app/room/${inviteCode}`, // Enhanced: Include invite URL
      genrePreferences: ['Drama', 'Thriller'], // Enhanced: Include genre preferences
      creatorId: 'other-user',
      filters: {
        genres: ['18', '53'], // Drama, Thriller
        contentTypes: ['movie', 'tv']
      },
      masterList: [],
      isActive: true,
      isPrivate: false,
      memberCount: 2,
      maxMembers: 8,
      matchCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private generateInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

// ============ CONTENT FILTERING FUNCTIONS ============

/**
 * Create room with advanced content filters
 */
export const createRoomWithFilters = async (input: CreateRoomWithFiltersInput): Promise<RoomWithFilters> => {
  // Validation
  if (!input.name || input.name.trim().length === 0) {
    throw new Error('El nombre de la sala es requerido');
  }

  if (!input.mediaType || !['MOVIE', 'TV'].includes(input.mediaType)) {
    throw new Error('Tipo de contenido válido es requerido');
  }

  if (input.genreIds && input.genreIds.length > 3) {
    throw new Error('Máximo 3 géneros permitidos');
  }

  try {
    // Use AppSync service for creating room with filters
    const result = await appSyncService.createRoomWithFilters(input);
    return result;
  } catch (error: any) {
    console.error('Error creating room with filters:', error);
    
    // Handle GraphQL errors
    if (error.graphQLErrors && error.graphQLErrors.length > 0) {
      const graphQLError = error.graphQLErrors[0];
      throw new Error(graphQLError.message);
    }
    
    // Handle network errors
    if (error.networkError) {
      throw new Error('Error de conexión. Verifica tu conexión a internet.');
    }
    
    throw error;
  }
};

/**
 * Update room filters (will be rejected due to immutability)
 */
export const updateRoomFilters = async (roomId: string, input: UpdateRoomFiltersInput): Promise<RoomWithFilters> => {
  try {
    // This will always fail due to filter immutability
    const result = await appSyncService.updateRoomFilters(roomId, input);
    return result;
  } catch (error: any) {
    console.error('Error updating room filters:', error);
    
    // Handle immutability errors with suggestions
    if (error.graphQLErrors && error.graphQLErrors.length > 0) {
      const graphQLError = error.graphQLErrors[0];
      
      if (graphQLError.extensions?.code === 'FILTER_IMMUTABLE') {
        const suggestion = graphQLError.extensions.suggestion;
        throw {
          message: graphQLError.message,
          code: 'FILTER_IMMUTABLE',
          suggestion
        };
      }
      
      throw new Error(graphQLError.message);
    }
    
    // Handle network errors
    if (error.networkError) {
      throw new Error('Error de conexión. Verifica tu conexión a internet.');
    }
    
    throw error;
  }
};

/**
 * Get available genres for media type
 */
export const getAvailableGenres = async (mediaType: MediaType): Promise<Genre[]> => {
  try {
    // Use AppSync service for getting genres
    const result = await appSyncService.getAvailableGenres(mediaType);
    return result;
  } catch (error: any) {
    console.error('Error loading genres:', error);
    
    // Handle GraphQL errors
    if (error.graphQLErrors && error.graphQLErrors.length > 0) {
      const graphQLError = error.graphQLErrors[0];
      throw new Error(graphQLError.message);
    }
    
    // Handle network errors
    if (error.networkError) {
      throw new Error('Error de conexión. Verifica tu conexión a internet.');
    }
    
    throw error;
  }
};

/**
 * Check if room has content filters
 */
export const hasContentFilters = (room: any): boolean => {
  return !!(room.filterCriteria || (room.mediaType && room.genreIds));
};

/**
 * Check if room is legacy (uses old genre preferences)
 */
export const isLegacyRoom = (room: any): boolean => {
  return !!(room.genrePreferences && !room.filterCriteria && !room.mediaType);
};

/**
 * Get filter summary for room
 */
export const getFilterSummary = (room: any): FilterSummary => {
  if (hasContentFilters(room)) {
    return {
      hasFilters: true,
      isLegacy: false,
      mediaType: room.mediaType,
      genreCount: room.genreIds?.length || 0,
      genreNames: room.genreNames || []
    };
  }
  
  if (isLegacyRoom(room)) {
    return {
      hasFilters: false,
      isLegacy: true,
      genreCount: room.genrePreferences?.length || 0,
      genreNames: room.genrePreferences || []
    };
  }
  
  return {
    hasFilters: false,
    isLegacy: false,
    genreCount: 0,
    genreNames: []
  };
};

export const roomService = new RoomService();
