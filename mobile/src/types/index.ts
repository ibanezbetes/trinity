// Tipos de usuario
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  displayName?: string;
  avatarUrl?: string;
  username?: string;
}

// Tipos de autenticación
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string; // username
  fullName?: string; // nombre completo (opcional)
}

// Tipos de navegación
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Login: undefined;
  Register: undefined;
  Home: undefined;
};

// Tipos de respuesta de API
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Tipos de votación y respuestas (NEW: Compatible with backend VoteResponse)
export type VoteType = 'LIKE' | 'DISLIKE' | 'SKIP';

export interface VoteInput {
  roomId: string;
  movieId: string;
  voteType: VoteType;
}

export interface VoteResponse {
  success: boolean;
  responseType: 'VOTE_RECORDED' | 'MATCH_FOUND' | 'VOTE_IGNORED_MATCH_FOUND' | 'ERROR';
  room?: {
    id: string;
    status: string;
    memberCount: number;
    matchFound?: boolean;
    userFinished?: boolean;
    message?: string;
    currentVotes?: number;
    totalMembers?: number;
    userProgress?: number;
  };
  matchInfo?: {
    movieId: string;
    movieTitle: string;
    movieInfo: {
      id: string;
      title: string;
      overview: string;
      poster: string;
      rating: number;
      runtime: number;
      year: number;
      genres: string[];
    };
    matchedAt: string;
    participants: string[];
    roomId: string;
  };
  message?: string;
  error?: string;
}

export interface UserVotingProgress {
  votedCount: number;
  totalMovies: number;
  remainingMovies: number;
  isFinished: boolean;
}

// Tipos de eventos en tiempo real
export interface VoteResponseEvent {
  success: boolean;
  responseType: string;
  room?: any;
  matchInfo?: any;
  message?: string;
  error?: string;
}
