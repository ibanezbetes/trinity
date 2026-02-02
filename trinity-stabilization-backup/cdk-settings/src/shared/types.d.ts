/**
 * Shared TypeScript types and interfaces for Trinity Lambda functions
 */
export * from './business-logic-types.js';
export { BusinessLogicFactory } from './business-logic-factory.js';
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
    mediaType?: 'MOVIE' | 'TV';
    genreIds?: number[];
    genreNames?: string[];
    preloadedMovies: string[];
    shownContentIds?: string[];
    currentMovieIndex: number;
    currentContentIndex?: number;
    totalMovies: number;
    moviesExhausted: boolean;
    isActive: boolean;
    isPrivate: boolean;
    memberCount: number;
    maxMembers: number;
    matchCount: number;
    createdAt: string;
    updatedAt: string;
    matchedAt?: string;
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
    id: string;
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
    sequenceIndex: number;
    movieId: string;
    movieData: TrinityMovie;
    batchNumber: number;
    cachedAt: string;
    ttl: number;
}
export interface TrinityRoomMatch {
    roomId: string;
    movieId: string;
    votes: number;
    matchedAt?: string;
    createdAt: string;
    updatedAt: string;
}
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
    currentIndex?: number;
    errorMessage?: string;
}
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
export declare class TrinityError extends Error {
    code: string;
    statusCode: number;
    details?: any | undefined;
    constructor(message: string, code: string, statusCode?: number, details?: any | undefined);
}
export declare class ValidationError extends TrinityError {
    constructor(message: string, details?: any);
}
export declare class NotFoundError extends TrinityError {
    constructor(resource: string, id?: string);
}
export declare class UnauthorizedError extends TrinityError {
    constructor(message?: string);
}
export declare class ConflictError extends TrinityError {
    constructor(message: string, details?: any);
}
export interface TrinityConfig {
    region: string;
    environment: string;
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
    external: {
        tmdbApiKey: string;
        cognitoUserPoolId: string;
        cognitoClientId: string;
        appsyncApiId: string;
        appsyncApiUrl: string;
        realtimeApiUrl: string;
    };
    appSync?: {
        endpoint: string;
        apiKey?: string;
        region: string;
    };
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
    lambdaFunctions?: {
        auth: string;
        room: string;
        vote: string;
        movie: string;
        cache: string;
        realtime: string;
        matchmaker: string;
    };
    featureFlags?: {
        enableRealTimeNotifications: boolean;
        enableCircuitBreaker: boolean;
        enableMetricsLogging: boolean;
        enableGoogleSignin: boolean;
        debugMode: boolean;
    };
    googleOAuth?: {
        webClientId: string;
        clientSecret: string;
        androidClientId: string;
        iosClientId: string;
    };
    security?: {
        jwtSecret: string;
    };
}
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
