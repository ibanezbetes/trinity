/**
 * Property-Based Testing Utilities for Trinity Infrastructure
 *
 * This module provides common utilities, generators, and helpers
 * for property-based testing across the Trinity system.
 */
import * as fc from 'fast-check';
/**
 * Common data generators for Trinity domain objects
 */
export declare class TrinityGenerators {
    /**
     * Generate valid movie IDs (TMDB format)
     */
    static movieId(): fc.Arbitrary<number>;
    /**
     * Generate valid room IDs
     */
    static roomId(): fc.Arbitrary<string>;
    /**
     * Generate valid user IDs (Cognito format)
     */
    static userId(): fc.Arbitrary<string>;
    /**
     * Generate valid movie titles
     */
    static movieTitle(): fc.Arbitrary<string>;
    /**
     * Generate valid movie overviews
     */
    static movieOverview(): fc.Arbitrary<string>;
    /**
     * Generate valid genre IDs (TMDB format)
     */
    static genreId(): fc.Arbitrary<number>;
    /**
     * Generate arrays of genre IDs
     */
    static genreIds(): fc.Arbitrary<number[]>;
    /**
     * Generate valid vote averages (0-10 scale)
     */
    static voteAverage(): fc.Arbitrary<number>;
    /**
     * Generate valid popularity scores
     */
    static popularity(): fc.Arbitrary<number>;
    /**
     * Generate valid release dates
     */
    static releaseDate(): fc.Arbitrary<Date>;
    /**
     * Generate valid timestamps (Unix epoch)
     */
    static timestamp(): fc.Arbitrary<number>;
    /**
     * Generate valid TTL values (future timestamps)
     */
    static ttl(): fc.Arbitrary<number>;
    /**
     * Generate complete movie objects
     */
    static movie(): fc.Arbitrary<{
        id: number;
        title: string;
        overview: string;
        release_date: string;
        genre_ids: number[];
        vote_average: number;
        popularity: number;
    }>;
    /**
     * Generate room configuration objects
     */
    static roomConfig(): fc.Arbitrary<{
        roomId: string;
        capacity: number;
        genreIds: number[];
        contentType: 'movie' | 'tv';
        minYear: number;
        maxYear: number;
        minRating: number;
    }>;
    /**
     * Generate vote objects
     */
    static vote(): fc.Arbitrary<{
        roomId: string;
        movieId: string;
        userId: string;
        vote: 'LIKE' | 'DISLIKE' | 'SKIP';
        timestamp: number;
    }>;
}
/**
 * Property test configuration presets
 */
export declare class PropertyTestConfig {
    /**
     * Standard configuration for most property tests
     */
    static standard(): {
        numRuns: number;
        verbose: boolean;
        seed: undefined;
    };
    /**
     * Fast configuration for quick feedback during development
     */
    static fast(): {
        numRuns: number;
        verbose: boolean;
        seed: undefined;
    };
    /**
     * Thorough configuration for critical system properties
     */
    static thorough(): {
        numRuns: number;
        verbose: boolean;
        seed: undefined;
    };
    /**
     * Debug configuration with verbose output
     */
    static debug(): {
        numRuns: number;
        verbose: boolean;
        seed: number;
    };
}
/**
 * Common property test patterns and utilities
 */
export declare class PropertyTestPatterns {
    /**
     * Test that a function is idempotent (f(f(x)) === f(x))
     */
    static idempotent<T>(generator: fc.Arbitrary<T>, fn: (input: T) => T, equals?: (a: T, b: T) => boolean): fc.IPropertyWithHooks<[input: T]>;
    /**
     * Test that a function preserves certain invariants
     */
    static invariant<T>(generator: fc.Arbitrary<T>, fn: (input: T) => T, invariantCheck: (input: T, output: T) => boolean): fc.IPropertyWithHooks<[input: T]>;
    /**
     * Test round-trip consistency (serialize -> deserialize -> equals original)
     */
    static roundTrip<T>(generator: fc.Arbitrary<T>, serialize: (input: T) => string, deserialize: (serialized: string) => T, equals?: (a: T, b: T) => boolean): fc.IPropertyWithHooks<[input: T]>;
    /**
     * Test that a function is commutative (f(a, b) === f(b, a))
     */
    static commutative<T, R>(generator: fc.Arbitrary<T>, fn: (a: T, b: T) => R, equals?: (a: R, b: R) => boolean): fc.IPropertyWithHooks<[a: T, b: T]>;
    /**
     * Test that a function is associative (f(f(a, b), c) === f(a, f(b, c)))
     */
    static associative<T>(generator: fc.Arbitrary<T>, fn: (a: T, b: T) => T, equals?: (a: T, b: T) => boolean): fc.IPropertyWithHooks<[a: T, b: T, c: T]>;
    /**
     * Test that a function has an identity element (f(x, identity) === x)
     */
    static identity<T>(generator: fc.Arbitrary<T>, identity: T, fn: (a: T, b: T) => T, equals?: (a: T, b: T) => boolean): fc.IPropertyWithHooks<[input: T]>;
}
/**
 * Validation utilities for Trinity domain objects
 */
export declare class TrinityValidators {
    /**
     * Validate movie object structure
     */
    static isValidMovie(movie: any): boolean;
    /**
     * Validate vote object structure
     */
    static isValidVote(vote: any): boolean;
    /**
     * Validate room configuration object structure
     */
    static isValidRoomConfig(config: any): boolean;
    /**
     * Validate DynamoDB item structure (common fields)
     */
    static isValidDynamoDBItem(item: any): boolean;
    /**
     * Validate cache entry structure
     */
    static isValidCacheEntry(entry: any): boolean;
}
/**
 * Mock utilities for property-based testing
 */
export declare class PropertyTestMocks {
    /**
     * Create a mock DynamoDB client with configurable responses
     */
    static createMockDynamoDB(responses?: Record<string, any>): {
        getItem: jest.Mock<any, any, any>;
        putItem: jest.Mock<any, any, any>;
        updateItem: jest.Mock<any, any, any>;
        deleteItem: jest.Mock<any, any, any>;
        query: jest.Mock<any, any, any>;
        scan: jest.Mock<any, any, any>;
        batchGetItem: jest.Mock<any, any, any>;
        batchWriteItem: jest.Mock<any, any, any>;
        transactWrite: jest.Mock<any, any, any>;
    };
    /**
     * Create a mock configuration service
     */
    static createMockConfig(config?: Record<string, any>): {
        get: jest.Mock<any, any, any>;
        set: jest.Mock<any, any, any>;
        refresh: jest.Mock<any, any, any>;
    };
    /**
     * Create a mock logger
     */
    static createMockLogger(): {
        info: jest.Mock<any, any, any>;
        error: jest.Mock<any, any, any>;
        warn: jest.Mock<any, any, any>;
        debug: jest.Mock<any, any, any>;
    };
    /**
     * Create a mock TMDB API client
     */
    static createMockTMDBClient(responses?: Record<string, any>): {
        searchMovies: jest.Mock<any, any, any>;
        getMovieDetails: jest.Mock<any, any, any>;
        discoverMovies: jest.Mock<any, any, any>;
    };
}
/**
 * Performance testing utilities for property-based tests
 */
export declare class PropertyTestPerformance {
    /**
     * Measure execution time of a function
     */
    static measureTime<T>(fn: () => Promise<T>): Promise<{
        result: T;
        timeMs: number;
    }>;
    /**
     * Test that a function completes within a time limit
     */
    static withinTimeLimit<T>(generator: fc.Arbitrary<T>, fn: (input: T) => Promise<any>, timeLimitMs: number): fc.IAsyncPropertyWithHooks<[input: T]>;
    /**
     * Test that performance scales linearly with input size
     */
    static linearScaling<T>(sizeGenerator: fc.Arbitrary<number>, inputGenerator: (size: number) => fc.Arbitrary<T>, fn: (input: T) => Promise<any>, maxScalingFactor?: number): fc.IAsyncPropertyWithHooks<[size1: number, size2: number]>;
}
