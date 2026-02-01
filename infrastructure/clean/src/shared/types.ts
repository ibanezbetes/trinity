/**
 * Shared TypeScript types and interfaces for Trinity Lambda functions
 */

// Common AWS types
export interface AppSyncEvent {
  info: {
    fieldName: string;
    parentTypeName: string;
    variables: Record<string, any>;
  };
  arguments: Record<string, any>;
  identity: {
    sub: string;
    username?: string;
    claims?: Record<string, any>;
  };
  source?: Record<string, any>;
  request?: {
    headers: Record<string, string>;
  };
}

export interface LambdaResponse<T = any> {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
  data?: T;
}

// Trinity domain types
export interface TrinityUser {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface TrinityRoom {
  id: string;
  name: string;
  description?: string;
  status: 'WAITING' | 'ACTIVE' | 'MATCHED' | 'NO_CONSENSUS';
  hostId: string;
  inviteCode: string;
  inviteUrl: string;
  
  // Filtering configuration
  mediaType?: 'MOVIE' | 'TV';
  genreIds?: number[];
  genreNames?: string[];
  
  // Movie cache configuration
  preloadedMovies: string[]; // Array of 50 movie IDs
  shownContentIds?: string[]; // Array of shown movie IDs (matching existing logic)
  currentMovieIndex: number; // Current position (0-49)
  currentContentIndex?: number; // Alternative name used in existing code (optional for compatibility)
  totalMovies: number; // Should always be 50
  moviesExhausted: boolean; // Flag when all movies shown
  
  // Room configuration
  isActive: boolean;
  isPrivate: boolean;
  memberCount: number;
  maxMembers: number;
  matchCount: number;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  matchedAt?: string;
  
  // Result
  resultMovieId?: string;
}

export interface TrinityRoomMember {
  roomId: string;
  userId: string;
  role: 'HOST' | 'MEMBER';
  joinedAt: string;
  isActive: boolean;
}

export interface TrinityVote {
  roomId: string;
  userId: string;
  movieId: string;
  voteType: 'LIKE' | 'DISLIKE';
  votedAt: string;
}

export interface TrinityMovie {
  id: string; // TMDB ID
  title: string;
  overview: string;
  releaseDate: string;
  posterPath?: string;
  backdropPath?: string;
  genreIds: number[];
  voteAverage: number;
  voteCount: number;
  popularity: number;
  adult: boolean;
  originalLanguage: string;
  mediaType: 'MOVIE' | 'TV';
}

export interface TrinityMovieCache {
  roomId: string;
  sequenceIndex: number; // 0-49 for deterministic ordering
  movieId: string;
  movieData: TrinityMovie;
  batchNumber: number; // For batch processing
  cachedAt: string;
  ttl: number; // Unix timestamp for TTL
}

export interface TrinityRoomMatch {
  roomId: string;
  movieId: string;
  votes: number; // Number of LIKE votes
  matchedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Filter and cache types
export interface FilterCriteria {
  mediaType: 'MOVIE' | 'TV';
  genreIds: number[];
  roomCapacity: number;
  roomId: string;
}

export interface CacheMetadata {
  roomId: string;
  status: 'CREATING' | 'READY' | 'EXPIRED' | 'ERROR';
  movieCount: number;
  filterCriteria: FilterCriteria;
  createdAt: string;
  updatedAt: string;
  ttl: number;
  currentIndex?: number; // Current sequence index for movie retrieval
  errorMessage?: string;
}

// TMDB API types
export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  adult: boolean;
  original_language: string;
}

export interface TMDBTVShow {
  id: number;
  name: string;
  overview: string;
  first_air_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  adult: boolean;
  original_language: string;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBDiscoverResponse {
  page: number;
  results: TMDBMovie[] | TMDBTVShow[];
  total_pages: number;
  total_results: number;
}

// Error types
export class TrinityError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'TrinityError';
  }
}

export class ValidationError extends TrinityError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends TrinityError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends TrinityError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class ConflictError extends TrinityError {
  constructor(message: string, details?: any) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

// Configuration types
export interface TrinityConfig {
  region: string;
  environment: string;
  
  // DynamoDB table names
  tables: {
    users: string;
    rooms: string;
    roomMembers: string;
    roomInvites: string;
    votes: string;
    moviesCache: string;
    roomMatches: string;
    connections: string;
    chatSessions: string;
    roomMovieCache: string;
    roomCacheMetadata: string;
    matchmaking: string;
    filterCache: string;
  };
  
  // External APIs
  external: {
    tmdbApiKey: string;
    cognitoUserPoolId: string;
    cognitoClientId: string;
    appsyncApiId: string;
    appsyncApiUrl: string;
    realtimeApiUrl: string;
  };

  // AppSync configuration for real-time subscriptions
  appSync?: {
    endpoint: string;
    apiKey?: string;
    region: string;
  };
  
  // Application settings
  app: {
    cache: {
      ttlDays: number;
      batchSize: number;
      maxBatches: number;
      movieCacheSize?: number;
    };
    voting: {
      maxRoomCapacity: number;
      defaultRoomCapacity: number;
    };
    movies: {
      cacheSize: number;
      maxGenres: number;
    };
    performance?: {
      lambdaMemorySize: number;
      lambdaTimeoutSeconds: number;
      circuitBreakerFailureThreshold: number;
      circuitBreakerTimeoutMs: number;
      circuitBreakerResetTimeoutMs: number;
    };
    monitoring?: {
      logLevel: string;
      enableMetrics: boolean;
      enableXRayTracing: boolean;
      verboseLogging: boolean;
    };
  };
  
  // Lambda function names
  lambdaFunctions?: {
    auth: string;
    room: string;
    vote: string;
    movie: string;
    cache: string;
    realtime: string;
    matchmaker: string;
  };
  
  // Feature flags
  featureFlags?: {
    enableRealTimeNotifications: boolean;
    enableCircuitBreaker: boolean;
    enableMetricsLogging: boolean;
    enableGoogleSignin: boolean;
    debugMode: boolean;
  };
  
  // Google OAuth configuration
  googleOAuth?: {
    webClientId: string;
    clientSecret: string;
    androidClientId: string;
    iosClientId: string;
  };
  
  // Security configuration
  security?: {
    jwtSecret: string;
  };
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;