// Servicio para gestionar matches conectando con el backend
import { apiClient } from './apiClient';

// Flag para usar mock o backend real
const USE_MOCK = false; // Cambiar a false cuando el backend esté disponible

export interface Match {
  id: string;
  roomId: string;
  mediaId: string;
  mediaTitle: string;
  mediaPosterPath: string;
  mediaOverview?: string;
  participantCount: number;
  createdAt: string;
  consensusType: 'unanimous_like' | 'majority_like';
}

export interface MatchLibrary {
  roomId: string;
  totalMatches: number;
  recentMatches: Match[];
  matchesByGenre: Record<string, number>;
  averageMatchTime: number;
}

export interface MatchStats {
  roomId: string;
  totalMatches: number;
  matchesThisWeek: number;
  averageParticipants: number;
  mostPopularGenre: string;
  fastestMatch: number;
  slowestMatch: number;
  matchRate: number;
}

export interface MatchDetectionResult {
  hasMatch: boolean;
  matchId?: string;
  consensusType?: string;
  participants?: string[];
  totalVotes: number;
  requiredVotes: number;
}

export interface PendingMatchResult {
  hasNewMatch: boolean;
  match?: {
    id: string;
    mediaTitle: string;
    participantCount: number;
    createdAt: string;
  };
}

class MatchService {
  /**
   * Obtener matches de una sala
   */
  async getRoomMatches(roomId: string, limit: number = 50): Promise<Match[]> {
    try {
      if (USE_MOCK) {
        return this.mockGetRoomMatches(roomId);
      }
      return await apiClient.get<Match[]>(`/rooms/${roomId}/matches?limit=${limit}`);
    } catch (error) {
      console.error('Error getting room matches:', error);
      if (USE_MOCK || __DEV__) {
        return this.mockGetRoomMatches(roomId);
      }
      throw error;
    }
  }

  /**
   * Obtener biblioteca de matches de una sala
   */
  async getRoomMatchLibrary(roomId: string): Promise<MatchLibrary> {
    try {
      if (USE_MOCK) {
        return this.mockGetMatchLibrary(roomId);
      }
      return await apiClient.get<MatchLibrary>(`/rooms/${roomId}/matches/library`);
    } catch (error) {
      console.error('Error getting match library:', error);
      if (USE_MOCK || __DEV__) {
        return this.mockGetMatchLibrary(roomId);
      }
      throw error;
    }
  }

  /**
   * Obtener estadísticas de matches de una sala
   */
  async getMatchStats(roomId: string): Promise<MatchStats> {
    try {
      if (USE_MOCK) {
        return this.mockGetMatchStats(roomId);
      }
      return await apiClient.get<MatchStats>(`/rooms/${roomId}/matches/stats`);
    } catch (error) {
      console.error('Error getting match stats:', error);
      if (USE_MOCK || __DEV__) {
        return this.mockGetMatchStats(roomId);
      }
      throw error;
    }
  }

  /**
   * Obtener detalles de un match específico
   */
  async getMatchById(roomId: string, matchId: string): Promise<Match | null> {
    try {
      if (USE_MOCK) {
        return this.mockGetMatchById(matchId);
      }
      return await apiClient.get<Match>(`/rooms/${roomId}/matches/${matchId}`);
    } catch (error) {
      console.error('Error getting match:', error);
      return null;
    }
  }

  /**
   * Detectar match para un contenido específico
   */
  async detectMatch(roomId: string, mediaId: string): Promise<MatchDetectionResult> {
    try {
      if (USE_MOCK) {
        return this.mockDetectMatch(mediaId);
      }
      return await apiClient.post<MatchDetectionResult>(`/rooms/${roomId}/matches/media/${mediaId}/detect`);
    } catch (error) {
      console.error('Error detecting match:', error);
      if (USE_MOCK || __DEV__) {
        return this.mockDetectMatch(mediaId);
      }
      throw error;
    }
  }

  /**
   * Verificar matches pendientes después de una votación
   */
  async checkPendingMatches(roomId: string, mediaId: string): Promise<PendingMatchResult> {
    try {
      if (USE_MOCK) {
        return this.mockCheckPendingMatches();
      }
      return await apiClient.post<PendingMatchResult>(`/rooms/${roomId}/matches/media/${mediaId}/check`);
    } catch (error) {
      console.error('Error checking pending matches:', error);
      if (USE_MOCK || __DEV__) {
        return this.mockCheckPendingMatches();
      }
      throw error;
    }
  }

  /**
   * Obtener matches recientes del usuario (todas las salas)
   */
  async getUserRecentMatches(limit: number = 20): Promise<Match[]> {
    try {
      if (USE_MOCK) {
        return this.mockGetUserRecentMatches();
      }
      return await apiClient.get<Match[]>(`/user/matches/recent?limit=${limit}`);
    } catch (error) {
      console.error('Error getting user recent matches:', error);
      if (USE_MOCK || __DEV__) {
        return this.mockGetUserRecentMatches();
      }
      throw error;
    }
  }

  // ============ MOCK DATA PARA DESARROLLO ============

  private mockGetRoomMatches(roomId: string): Match[] {
    return [
      {
        id: 'match-1',
        roomId,
        mediaId: '550',
        mediaTitle: 'Fight Club',
        mediaPosterPath: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
        mediaOverview: 'Un hombre deprimido que sufre de insomnio conoce a un extraño vendedor de jabón...',
        participantCount: 3,
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        consensusType: 'unanimous_like',
      },
      {
        id: 'match-2',
        roomId,
        mediaId: '680',
        mediaTitle: 'Pulp Fiction',
        mediaPosterPath: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
        mediaOverview: 'Las vidas de dos sicarios, un boxeador, la esposa de un gángster...',
        participantCount: 3,
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        consensusType: 'unanimous_like',
      },
      {
        id: 'match-3',
        roomId,
        mediaId: '155',
        mediaTitle: 'The Dark Knight',
        mediaPosterPath: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
        mediaOverview: 'Batman se enfrenta al Joker, un criminal que siembra el caos en Gotham...',
        participantCount: 3,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        consensusType: 'unanimous_like',
      },
    ];
  }

  private mockGetMatchLibrary(roomId: string): MatchLibrary {
    return {
      roomId,
      totalMatches: 5,
      recentMatches: this.mockGetRoomMatches(roomId),
      matchesByGenre: {
        'Acción': 2,
        'Drama': 2,
        'Thriller': 1,
      },
      averageMatchTime: 45, // minutos
    };
  }

  private mockGetMatchStats(roomId: string): MatchStats {
    return {
      roomId,
      totalMatches: 5,
      matchesThisWeek: 3,
      averageParticipants: 3,
      mostPopularGenre: 'Acción',
      fastestMatch: 15, // minutos
      slowestMatch: 120, // minutos
      matchRate: 25, // porcentaje
    };
  }

  private mockGetMatchById(matchId: string): Match {
    return {
      id: matchId,
      roomId: 'room-1',
      mediaId: '550',
      mediaTitle: 'Fight Club',
      mediaPosterPath: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
      mediaOverview: 'Un hombre deprimido que sufre de insomnio conoce a un extraño vendedor de jabón...',
      participantCount: 3,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      consensusType: 'unanimous_like',
    };
  }

  private mockDetectMatch(mediaId: string): MatchDetectionResult {
    const hasMatch = Math.random() > 0.7;
    return {
      hasMatch,
      matchId: hasMatch ? `match-${Date.now()}` : undefined,
      consensusType: hasMatch ? 'unanimous_like' : undefined,
      participants: hasMatch ? ['user-1', 'user-2', 'user-3'] : undefined,
      totalVotes: 3,
      requiredVotes: 3,
    };
  }

  private mockCheckPendingMatches(): PendingMatchResult {
    const hasNewMatch = Math.random() > 0.8;
    return {
      hasNewMatch,
      match: hasNewMatch ? {
        id: `match-${Date.now()}`,
        mediaTitle: 'Nueva película',
        participantCount: 3,
        createdAt: new Date().toISOString(),
      } : undefined,
    };
  }

  private mockGetUserRecentMatches(): Match[] {
    return [
      {
        id: 'match-1',
        roomId: 'room-1',
        mediaId: '550',
        mediaTitle: 'Fight Club',
        mediaPosterPath: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
        participantCount: 3,
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        consensusType: 'unanimous_like',
      },
      {
        id: 'match-2',
        roomId: 'room-2',
        mediaId: '680',
        mediaTitle: 'Pulp Fiction',
        mediaPosterPath: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
        participantCount: 4,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        consensusType: 'unanimous_like',
      },
    ];
  }
}

export const matchService = new MatchService();
