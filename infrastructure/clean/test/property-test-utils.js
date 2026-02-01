"use strict";
/**
 * Property-Based Testing Utilities for Trinity Infrastructure
 *
 * This module provides common utilities, generators, and helpers
 * for property-based testing across the Trinity system.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PropertyTestPerformance = exports.PropertyTestMocks = exports.TrinityValidators = exports.PropertyTestPatterns = exports.PropertyTestConfig = exports.TrinityGenerators = void 0;
const fc = __importStar(require("fast-check"));
/**
 * Common data generators for Trinity domain objects
 */
class TrinityGenerators {
    /**
     * Generate valid movie IDs (TMDB format)
     */
    static movieId() {
        return fc.integer({ min: 1, max: 999999 });
    }
    /**
     * Generate valid room IDs
     */
    static roomId() {
        return fc.string({
            minLength: 8,
            maxLength: 20,
            unit: fc.oneof(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), fc.constant('-'), fc.constant('_'))
        });
    }
    /**
     * Generate valid user IDs (Cognito format)
     */
    static userId() {
        return fc.uuid();
    }
    /**
     * Generate valid movie titles
     */
    static movieTitle() {
        return fc.string({
            minLength: 1,
            maxLength: 100,
            unit: fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', ' ', '-', '.', '!', '?', ':', ';', ',')
        }).filter(s => s.trim().length > 0);
    }
    /**
     * Generate valid movie overviews
     */
    static movieOverview() {
        return fc.string({
            minLength: 10,
            maxLength: 500,
            unit: fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', ' ', '-', '.', '!', '?', ':', ';', ',', '(', ')')
        });
    }
    /**
     * Generate valid genre IDs (TMDB format)
     */
    static genreId() {
        return fc.constantFrom(28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37);
    }
    /**
     * Generate arrays of genre IDs
     */
    static genreIds() {
        return fc.array(this.genreId(), { minLength: 1, maxLength: 5 }).map(arr => [...new Set(arr)]);
    }
    /**
     * Generate valid vote averages (0-10 scale)
     */
    static voteAverage() {
        return fc.float({ min: 0, max: 10, noNaN: true });
    }
    /**
     * Generate valid popularity scores
     */
    static popularity() {
        return fc.float({ min: 0, max: 1000, noNaN: true });
    }
    /**
     * Generate valid release dates
     */
    static releaseDate() {
        return fc.date({
            min: new Date('1900-01-01'),
            max: new Date('2030-12-31')
        });
    }
    /**
     * Generate valid timestamps (Unix epoch)
     */
    static timestamp() {
        return fc.integer({ min: 1600000000, max: 2000000000 });
    }
    /**
     * Generate valid TTL values (future timestamps)
     */
    static ttl() {
        const now = Math.floor(Date.now() / 1000);
        return fc.integer({ min: now, max: now + (365 * 24 * 60 * 60) }); // Up to 1 year in future
    }
    /**
     * Generate complete movie objects
     */
    static movie() {
        return fc.record({
            id: this.movieId(),
            title: this.movieTitle(),
            overview: this.movieOverview(),
            release_date: this.releaseDate().map(d => d.toISOString().split('T')[0]),
            genre_ids: this.genreIds(),
            vote_average: this.voteAverage(),
            popularity: this.popularity(),
        });
    }
    /**
     * Generate room configuration objects
     */
    static roomConfig() {
        return fc.record({
            roomId: this.roomId(),
            capacity: fc.integer({ min: 2, max: 10 }),
            genreIds: this.genreIds(),
            contentType: fc.constantFrom('movie', 'tv'),
            minYear: fc.integer({ min: 1950, max: 2020 }),
            maxYear: fc.integer({ min: 2021, max: 2030 }),
            minRating: fc.float({ min: 0, max: 7 }),
        });
    }
    /**
     * Generate vote objects
     */
    static vote() {
        return fc.record({
            roomId: this.roomId(),
            movieId: this.movieId().map(id => id.toString()),
            userId: this.userId(),
            vote: fc.constantFrom('LIKE', 'DISLIKE', 'SKIP'),
            timestamp: this.timestamp(),
        });
    }
}
exports.TrinityGenerators = TrinityGenerators;
/**
 * Property test configuration presets
 */
class PropertyTestConfig {
    /**
     * Standard configuration for most property tests
     */
    static standard() {
        return {
            numRuns: 100,
            verbose: false,
            seed: undefined,
        };
    }
    /**
     * Fast configuration for quick feedback during development
     */
    static fast() {
        return {
            numRuns: 25,
            verbose: false,
            seed: undefined,
        };
    }
    /**
     * Thorough configuration for critical system properties
     */
    static thorough() {
        return {
            numRuns: 500,
            verbose: true,
            seed: undefined,
        };
    }
    /**
     * Debug configuration with verbose output
     */
    static debug() {
        return {
            numRuns: 10,
            verbose: true,
            seed: 42, // Fixed seed for reproducible debugging
        };
    }
}
exports.PropertyTestConfig = PropertyTestConfig;
/**
 * Common property test patterns and utilities
 */
class PropertyTestPatterns {
    /**
     * Test that a function is idempotent (f(f(x)) === f(x))
     */
    static idempotent(generator, fn, equals = (a, b) => JSON.stringify(a) === JSON.stringify(b)) {
        return fc.property(generator, (input) => {
            const result1 = fn(input);
            const result2 = fn(result1);
            return equals(result1, result2);
        });
    }
    /**
     * Test that a function preserves certain invariants
     */
    static invariant(generator, fn, invariantCheck) {
        return fc.property(generator, (input) => {
            const output = fn(input);
            return invariantCheck(input, output);
        });
    }
    /**
     * Test round-trip consistency (serialize -> deserialize -> equals original)
     */
    static roundTrip(generator, serialize, deserialize, equals = (a, b) => JSON.stringify(a) === JSON.stringify(b)) {
        return fc.property(generator, (input) => {
            try {
                const serialized = serialize(input);
                const deserialized = deserialize(serialized);
                return equals(input, deserialized);
            }
            catch (error) {
                // Serialization/deserialization should not throw for valid inputs
                return false;
            }
        });
    }
    /**
     * Test that a function is commutative (f(a, b) === f(b, a))
     */
    static commutative(generator, fn, equals = (a, b) => JSON.stringify(a) === JSON.stringify(b)) {
        return fc.property(generator, generator, (a, b) => {
            const result1 = fn(a, b);
            const result2 = fn(b, a);
            return equals(result1, result2);
        });
    }
    /**
     * Test that a function is associative (f(f(a, b), c) === f(a, f(b, c)))
     */
    static associative(generator, fn, equals = (a, b) => JSON.stringify(a) === JSON.stringify(b)) {
        return fc.property(generator, generator, generator, (a, b, c) => {
            const result1 = fn(fn(a, b), c);
            const result2 = fn(a, fn(b, c));
            return equals(result1, result2);
        });
    }
    /**
     * Test that a function has an identity element (f(x, identity) === x)
     */
    static identity(generator, identity, fn, equals = (a, b) => JSON.stringify(a) === JSON.stringify(b)) {
        return fc.property(generator, (input) => {
            const result1 = fn(input, identity);
            const result2 = fn(identity, input);
            return equals(result1, input) && equals(result2, input);
        });
    }
}
exports.PropertyTestPatterns = PropertyTestPatterns;
/**
 * Validation utilities for Trinity domain objects
 */
class TrinityValidators {
    /**
     * Validate movie object structure
     */
    static isValidMovie(movie) {
        return (typeof movie === 'object' &&
            movie !== null &&
            typeof movie.id === 'number' &&
            movie.id > 0 &&
            typeof movie.title === 'string' &&
            movie.title.trim().length > 0 &&
            typeof movie.overview === 'string' &&
            typeof movie.release_date === 'string' &&
            Array.isArray(movie.genre_ids) &&
            movie.genre_ids.every((id) => typeof id === 'number' && id > 0) &&
            typeof movie.vote_average === 'number' &&
            movie.vote_average >= 0 &&
            movie.vote_average <= 10 &&
            typeof movie.popularity === 'number' &&
            movie.popularity >= 0);
    }
    /**
     * Validate vote object structure
     */
    static isValidVote(vote) {
        return (typeof vote === 'object' &&
            vote !== null &&
            typeof vote.roomId === 'string' &&
            vote.roomId.length > 0 &&
            typeof vote.movieId === 'string' &&
            vote.movieId.length > 0 &&
            typeof vote.userId === 'string' &&
            vote.userId.length > 0 &&
            ['LIKE', 'DISLIKE', 'SKIP'].includes(vote.vote) &&
            typeof vote.timestamp === 'number' &&
            vote.timestamp > 0);
    }
    /**
     * Validate room configuration object structure
     */
    static isValidRoomConfig(config) {
        return (typeof config === 'object' &&
            config !== null &&
            typeof config.roomId === 'string' &&
            config.roomId.length > 0 &&
            typeof config.capacity === 'number' &&
            config.capacity >= 2 &&
            config.capacity <= 10 &&
            Array.isArray(config.genreIds) &&
            config.genreIds.length > 0 &&
            config.genreIds.every((id) => typeof id === 'number' && id > 0) &&
            ['movie', 'tv'].includes(config.contentType) &&
            typeof config.minYear === 'number' &&
            typeof config.maxYear === 'number' &&
            config.maxYear > config.minYear &&
            typeof config.minRating === 'number' &&
            config.minRating >= 0 &&
            config.minRating <= 10);
    }
    /**
     * Validate DynamoDB item structure (common fields)
     */
    static isValidDynamoDBItem(item) {
        return (typeof item === 'object' &&
            item !== null &&
            // All DynamoDB items should have at least a primary key
            Object.keys(item).length > 0 &&
            // Check for common DynamoDB patterns
            Object.values(item).every(value => value !== undefined &&
                value !== null));
    }
    /**
     * Validate cache entry structure
     */
    static isValidCacheEntry(entry) {
        return (typeof entry === 'object' &&
            entry !== null &&
            typeof entry.movieId === 'string' &&
            entry.movieId.length > 0 &&
            typeof entry.cachedAt === 'number' &&
            entry.cachedAt > 0 &&
            typeof entry.ttl === 'number' &&
            entry.ttl > entry.cachedAt &&
            entry.data !== undefined &&
            entry.data !== null);
    }
}
exports.TrinityValidators = TrinityValidators;
/**
 * Mock utilities for property-based testing
 */
class PropertyTestMocks {
    /**
     * Create a mock DynamoDB client with configurable responses
     */
    static createMockDynamoDB(responses = {}) {
        return {
            getItem: jest.fn().mockImplementation(async (params) => {
                const key = JSON.stringify(params.Key);
                return { Item: responses[key] || null };
            }),
            putItem: jest.fn().mockResolvedValue({}),
            updateItem: jest.fn().mockResolvedValue({}),
            deleteItem: jest.fn().mockResolvedValue({}),
            query: jest.fn().mockResolvedValue({ Items: [] }),
            scan: jest.fn().mockResolvedValue({ Items: [] }),
            batchGetItem: jest.fn().mockResolvedValue({ Responses: {} }),
            batchWriteItem: jest.fn().mockResolvedValue({}),
            transactWrite: jest.fn().mockResolvedValue({}),
        };
    }
    /**
     * Create a mock configuration service
     */
    static createMockConfig(config = {}) {
        return {
            get: jest.fn().mockImplementation((key) => {
                return Promise.resolve(config[key]);
            }),
            set: jest.fn().mockResolvedValue(undefined),
            refresh: jest.fn().mockResolvedValue(undefined),
        };
    }
    /**
     * Create a mock logger
     */
    static createMockLogger() {
        return {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        };
    }
    /**
     * Create a mock TMDB API client
     */
    static createMockTMDBClient(responses = {}) {
        return {
            searchMovies: jest.fn().mockImplementation(async (query) => {
                return responses[`search:${query}`] || { results: [] };
            }),
            getMovieDetails: jest.fn().mockImplementation(async (id) => {
                return responses[`movie:${id}`] || null;
            }),
            discoverMovies: jest.fn().mockImplementation(async (filters) => {
                const key = JSON.stringify(filters);
                return responses[`discover:${key}`] || { results: [] };
            }),
        };
    }
}
exports.PropertyTestMocks = PropertyTestMocks;
/**
 * Performance testing utilities for property-based tests
 */
class PropertyTestPerformance {
    /**
     * Measure execution time of a function
     */
    static async measureTime(fn) {
        const start = process.hrtime.bigint();
        const result = await fn();
        const end = process.hrtime.bigint();
        const timeMs = Number(end - start) / 1000000;
        return { result, timeMs };
    }
    /**
     * Test that a function completes within a time limit
     */
    static withinTimeLimit(generator, fn, timeLimitMs) {
        return fc.asyncProperty(generator, async (input) => {
            const { timeMs } = await this.measureTime(() => fn(input));
            return timeMs <= timeLimitMs;
        });
    }
    /**
     * Test that performance scales linearly with input size
     */
    static linearScaling(sizeGenerator, inputGenerator, fn, maxScalingFactor = 10) {
        return fc.asyncProperty(sizeGenerator, sizeGenerator.filter(size2 => size2 > 0), async (size1, size2) => {
            if (size1 === size2)
                return true;
            const [smallSize, largeSize] = size1 < size2 ? [size1, size2] : [size2, size1];
            const scalingFactor = largeSize / smallSize;
            if (scalingFactor > maxScalingFactor)
                return true; // Skip extreme scaling tests
            const smallInput = fc.sample(inputGenerator(smallSize), 1)[0];
            const largeInput = fc.sample(inputGenerator(largeSize), 1)[0];
            const { timeMs: smallTime } = await this.measureTime(() => fn(smallInput));
            const { timeMs: largeTime } = await this.measureTime(() => fn(largeInput));
            // Performance should scale no worse than quadratically
            const performanceRatio = largeTime / Math.max(smallTime, 1);
            const expectedMaxRatio = scalingFactor * scalingFactor;
            return performanceRatio <= expectedMaxRatio;
        });
    }
}
exports.PropertyTestPerformance = PropertyTestPerformance;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvcGVydHktdGVzdC11dGlscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb3BlcnR5LXRlc3QtdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7OztHQUtHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCwrQ0FBaUM7QUFFakM7O0dBRUc7QUFDSCxNQUFhLGlCQUFpQjtJQUM1Qjs7T0FFRztJQUNILE1BQU0sQ0FBQyxPQUFPO1FBQ1osT0FBTyxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUM3QyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsTUFBTTtRQUNYLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQztZQUNmLFNBQVMsRUFBRSxDQUFDO1lBQ1osU0FBUyxFQUFFLEVBQUU7WUFDYixJQUFJLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FDWixFQUFFLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQ25NLEVBQUUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQ2hCLEVBQUUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQ2pCO1NBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLE1BQU07UUFDWCxPQUFPLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNuQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsVUFBVTtRQUNmLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQztZQUNmLFNBQVMsRUFBRSxDQUFDO1lBQ1osU0FBUyxFQUFFLEdBQUc7WUFDZCxJQUFJLEVBQUUsRUFBRSxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7U0FDaE0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLGFBQWE7UUFDbEIsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDO1lBQ2YsU0FBUyxFQUFFLEVBQUU7WUFDYixTQUFTLEVBQUUsR0FBRztZQUNkLElBQUksRUFBRSxFQUFFLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO1NBQzFNLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQyxPQUFPO1FBQ1osT0FBTyxFQUFFLENBQUMsWUFBWSxDQUNwQixFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQzdGLENBQUM7SUFDSixDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsUUFBUTtRQUNiLE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEcsQ0FBQztJQUVEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLFdBQVc7UUFDaEIsT0FBTyxFQUFFLENBQUMsS0FBSyxD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RTNFLHVEQUF1RDtZQUN2RCxNQUFNLGdCQUFnQixHQUFHLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM1RCxNQUFNLGdCQUFnQixHQUFHLGFBQWEsR0FBRyxhQUFhLENBQUM7WUFFdkQsT0FBTyxnQkFBZ0IsSUFBSSxnQkFBZ0IsQ0FBQztRQUM5QyxDQUFDLENBQ0YsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQTVERCwwREE0REMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogUHJvcGVydHktQmFzZWQgVGVzdGluZyBVdGlsaXRpZXMgZm9yIFRyaW5pdHkgSW5mcmFzdHJ1Y3R1cmVcclxuICogXHJcbiAqIFRoaXMgbW9kdWxlIHByb3ZpZGVzIGNvbW1vbiB1dGlsaXRpZXMsIGdlbmVyYXRvcnMsIGFuZCBoZWxwZXJzXHJcbiAqIGZvciBwcm9wZXJ0eS1iYXNlZCB0ZXN0aW5nIGFjcm9zcyB0aGUgVHJpbml0eSBzeXN0ZW0uXHJcbiAqL1xyXG5cclxuaW1wb3J0ICogYXMgZmMgZnJvbSAnZmFzdC1jaGVjayc7XHJcblxyXG4vKipcclxuICogQ29tbW9uIGRhdGEgZ2VuZXJhdG9ycyBmb3IgVHJpbml0eSBkb21haW4gb2JqZWN0c1xyXG4gKi9cclxuZXhwb3J0IGNsYXNzIFRyaW5pdHlHZW5lcmF0b3JzIHtcclxuICAvKipcclxuICAgKiBHZW5lcmF0ZSB2YWxpZCBtb3ZpZSBJRHMgKFRNREIgZm9ybWF0KVxyXG4gICAqL1xyXG4gIHN0YXRpYyBtb3ZpZUlkKCk6IGZjLkFyYml0cmFyeTxudW1iZXI+IHtcclxuICAgIHJldHVybiBmYy5pbnRlZ2VyKHsgbWluOiAxLCBtYXg6IDk5OTk5OSB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdlbmVyYXRlIHZhbGlkIHJvb20gSURzXHJcbiAgICovXHJcbiAgc3RhdGljIHJvb21JZCgpOiBmYy5BcmJpdHJhcnk8c3RyaW5nPiB7XHJcbiAgICByZXR1cm4gZmMuc3RyaW5nKHsgXHJcbiAgICAgIG1pbkxlbmd0aDogOCwgXHJcbiAgICAgIG1heExlbmd0aDogMjAsXHJcbiAgICAgIHVuaXQ6IGZjLm9uZW9mKFxyXG4gICAgICAgIGZjLmNvbnN0YW50RnJvbSgnYScsICdiJywgJ2MnLCAnZCcsICdlJywgJ2YnLCAnZycsICdoJywgJ2knLCAnaicsICdrJywgJ2wnLCAnbScsICduJywgJ28nLCAncCcsICdxJywgJ3InLCAncycsICd0JywgJ3UnLCAndicsICd3JywgJ3gnLCAneScsICd6JywgJzAnLCAnMScsICcyJywgJzMnLCAnNCcsICc1JywgJzYnLCAnNycsICc4JywgJzknKSxcclxuICAgICAgICBmYy5jb25zdGFudCgnLScpLFxyXG4gICAgICAgIGZjLmNvbnN0YW50KCdfJylcclxuICAgICAgKVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmF0ZSB2YWxpZCB1c2VyIElEcyAoQ29nbml0byBmb3JtYXQpXHJcbiAgICovXHJcbiAgc3RhdGljIHVzZXJJZCgpOiBmYy5BcmJpdHJhcnk8c3RyaW5nPiB7XHJcbiAgICByZXR1cm4gZmMudXVpZCgpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJhdGUgdmFsaWQgbW92aWUgdGl0bGVzXHJcbiAgICovXHJcbiAgc3RhdGljIG1vdmllVGl0bGUoKTogZmMuQXJiaXRyYXJ5PHN0cmluZz4ge1xyXG4gICAgcmV0dXJuIGZjLnN0cmluZyh7IFxyXG4gICAgICBtaW5MZW5ndGg6IDEsIFxyXG4gICAgICBtYXhMZW5ndGg6IDEwMCxcclxuICAgICAgdW5pdDogZmMuY29uc3RhbnRGcm9tKCdhJywgJ2InLCAnYycsICdkJywgJ2UnLCAnZicsICdnJywgJ2gnLCAnaScsICdqJywgJ2snLCAnbCcsICdtJywgJ24nLCAnbycsICdwJywgJ3EnLCAncicsICdzJywgJ3QnLCAndScsICd2JywgJ3cnLCAneCcsICd5JywgJ3onLCAnICcsICctJywgJy4nLCAnIScsICc/JywgJzonLCAnOycsICcsJylcclxuICAgIH0pLmZpbHRlcihzID0+IHMudHJpbSgpLmxlbmd0aCA+IDApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJhdGUgdmFsaWQgbW92aWUgb3ZlcnZpZXdzXHJcbiAgICovXHJcbiAgc3RhdGljIG1vdmllT3ZlcnZpZXcoKTogZmMuQXJiaXRyYXJ5PHN0cmluZz4ge1xyXG4gICAgcmV0dXJuIGZjLnN0cmluZyh7IFxyXG4gICAgICBtaW5MZW5ndGg6IDEwLCBcclxuICAgICAgbWF4TGVuZ3RoOiA1MDAsXHJcbiAgICAgIHVuaXQ6IGZjLmNvbnN0YW50RnJvbSgnYScsICdiJywgJ2MnLCAnZCcsICdlJywgJ2YnLCAnZycsICdoJywgJ2knLCAnaicsICdrJywgJ2wnLCAnbScsICduJywgJ28nLCAncCcsICdxJywgJ3InLCAncycsICd0JywgJ3UnLCAndicsICd3JywgJ3gnLCAneScsICd6JywgJyAnLCAnLScsICcuJywgJyEnLCAnPycsICc6JywgJzsnLCAnLCcsICcoJywgJyknKVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmF0ZSB2YWxpZCBnZW5yZSBJRHMgKFRNREIgZm9ybWF0KVxyXG4gICAqL1xyXG4gIHN0YXRpYyBnZW5yZUlkKCk6IGZjLkFyYml0cmFyeTxudW1iZXI+IHtcclxuICAgIHJldHVybiBmYy5jb25zdGFudEZyb20oXHJcbiAgICAgIDI4LCAxMiwgMTYsIDM1LCA4MCwgOTksIDE4LCAxMDc1MSwgMTQsIDM2LCAyNywgMTA0MDIsIDk2NDgsIDEwNzQ5LCA4NzgsIDEwNzcwLCA1MywgMTA3NTIsIDM3XHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJhdGUgYXJyYXlzIG9mIGdlbnJlIElEc1xyXG4gICAqL1xyXG4gIHN0YXRpYyBnZW5yZUlkcygpOiBmYy5BcmJpdHJhcnk8bnVtYmVyW10+IHtcclxuICAgIHJldHVybiBmYy5hcnJheSh0aGlzLmdlbnJlSWQoKSwgeyBtaW5MZW5ndGg6IDEsIG1heExlbmd0aDogNSB9KS5tYXAoYXJyID0+IFsuLi5uZXcgU2V0KGFycildKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdlbmVyYXRlIHZhbGlkIHZvdGUgYXZlcmFnZXMgKDAtMTAgc2NhbGUpXHJcbiAgICovXHJcbiAgc3RhdGljIHZvdGVBdmVyYWdlKCk6IGZjLkFyYml0cmFyeTxudW1iZXI+IHtcclxuICAgIHJldHVybiBmYy5mbG9hdCh7IG1pbjogMCwgbWF4OiAxMCwgbm9OYU46IHRydWUgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmF0ZSB2YWxpZCBwb3B1bGFyaXR5IHNjb3Jlc1xyXG4gICAqL1xyXG4gIHN0YXRpYyBwb3B1bGFyaXR5KCk6IGZjLkFyYml0cmFyeTxudW1iZXI+IHtcclxuICAgIHJldHVybiBmYy5mbG9hdCh7IG1pbjogMCwgbWF4OiAxMDAwLCBub05hTjogdHJ1ZSB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdlbmVyYXRlIHZhbGlkIHJlbGVhc2UgZGF0ZXNcclxuICAgKi9cclxuICBzdGF0aWMgcmVsZWFzZURhdGUoKTogZmMuQXJiaXRyYXJ5PERhdGU+IHtcclxuICAgIHJldHVybiBmYy5kYXRlKHsgXHJcbiAgICAgIG1pbjogbmV3IERhdGUoJzE5MDAtMDEtMDEnKSwgXHJcbiAgICAgIG1heDogbmV3IERhdGUoJzIwMzAtMTItMzEnKSBcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJhdGUgdmFsaWQgdGltZXN0YW1wcyAoVW5peCBlcG9jaClcclxuICAgKi9cclxuICBzdGF0aWMgdGltZXN0YW1wKCk6IGZjLkFyYml0cmFyeTxudW1iZXI+IHtcclxuICAgIHJldHVybiBmYy5pbnRlZ2VyKHsgbWluOiAxNjAwMDAwMDAwLCBtYXg6IDIwMDAwMDAwMDAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmF0ZSB2YWxpZCBUVEwgdmFsdWVzIChmdXR1cmUgdGltZXN0YW1wcylcclxuICAgKi9cclxuICBzdGF0aWMgdHRsKCk6IGZjLkFyYml0cmFyeTxudW1iZXI+IHtcclxuICAgIGNvbnN0IG5vdyA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApO1xyXG4gICAgcmV0dXJuIGZjLmludGVnZXIoeyBtaW46IG5vdywgbWF4OiBub3cgKyAoMzY1ICogMjQgKiA2MCAqIDYwKSB9KTsgLy8gVXAgdG8gMSB5ZWFyIGluIGZ1dHVyZVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJhdGUgY29tcGxldGUgbW92aWUgb2JqZWN0c1xyXG4gICAqL1xyXG4gIHN0YXRpYyBtb3ZpZSgpOiBmYy5BcmJpdHJhcnk8e1xyXG4gICAgaWQ6IG51bWJlcjtcclxuICAgIHRpdGxlOiBzdHJpbmc7XHJcbiAgICBvdmVydmlldzogc3RyaW5nO1xyXG4gICAgcmVsZWFzZV9kYXRlOiBzdHJpbmc7XHJcbiAgICBnZW5yZV9pZHM6IG51bWJlcltdO1xyXG4gICAgdm90ZV9hdmVyYWdlOiBudW1iZXI7XHJcbiAgICBwb3B1bGFyaXR5OiBudW1iZXI7XHJcbiAgfT4ge1xyXG4gICAgcmV0dXJuIGZjLnJlY29yZCh7XHJcbiAgICAgIGlkOiB0aGlzLm1vdmllSWQoKSxcclxuICAgICAgdGl0bGU6IHRoaXMubW92aWVUaXRsZSgpLFxyXG4gICAgICBvdmVydmlldzogdGhpcy5tb3ZpZU92ZXJ2aWV3KCksXHJcbiAgICAgIHJlbGVhc2VfZGF0ZTogdGhpcy5yZWxlYXNlRGF0ZSgpLm1hcChkID0+IGQudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdKSxcclxuICAgICAgZ2VucmVfaWRzOiB0aGlzLmdlbnJlSWRzKCksXHJcbiAgICAgIHZvdGVfYXZlcmFnZTogdGhpcy52b3RlQXZlcmFnZSgpLFxyXG4gICAgICBwb3B1bGFyaXR5OiB0aGlzLnBvcHVsYXJpdHkoKSxcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJhdGUgcm9vbSBjb25maWd1cmF0aW9uIG9iamVjdHNcclxuICAgKi9cclxuICBzdGF0aWMgcm9vbUNvbmZpZygpOiBmYy5BcmJpdHJhcnk8e1xyXG4gICAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgICBjYXBhY2l0eTogbnVtYmVyO1xyXG4gICAgZ2VucmVJZHM6IG51bWJlcltdO1xyXG4gICAgY29udGVudFR5cGU6ICdtb3ZpZScgfCAndHYnO1xyXG4gICAgbWluWWVhcjogbnVtYmVyO1xyXG4gICAgbWF4WWVhcjogbnVtYmVyO1xyXG4gICAgbWluUmF0aW5nOiBudW1iZXI7XHJcbiAgfT4ge1xyXG4gICAgcmV0dXJuIGZjLnJlY29yZCh7XHJcbiAgICAgIHJvb21JZDogdGhpcy5yb29tSWQoKSxcclxuICAgICAgY2FwYWNpdHk6IGZjLmludGVnZXIoeyBtaW46IDIsIG1heDogMTAgfSksXHJcbiAgICAgIGdlbnJlSWRzOiB0aGlzLmdlbnJlSWRzKCksXHJcbiAgICAgIGNvbnRlbnRUeXBlOiBmYy5jb25zdGFudEZyb20oJ21vdmllJywgJ3R2JyksXHJcbiAgICAgIG1pblllYXI6IGZjLmludGVnZXIoeyBtaW46IDE5NTAsIG1heDogMjAyMCB9KSxcclxuICAgICAgbWF4WWVhcjogZmMuaW50ZWdlcih7IG1pbjogMjAyMSwgbWF4OiAyMDMwIH0pLFxyXG4gICAgICBtaW5SYXRpbmc6IGZjLmZsb2F0KHsgbWluOiAwLCBtYXg6IDcgfSksXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdlbmVyYXRlIHZvdGUgb2JqZWN0c1xyXG4gICAqL1xyXG4gIHN0YXRpYyB2b3RlKCk6IGZjLkFyYml0cmFyeTx7XHJcbiAgICByb29tSWQ6IHN0cmluZztcclxuICAgIG1vdmllSWQ6IHN0cmluZztcclxuICAgIHVzZXJJZDogc3RyaW5nO1xyXG4gICAgdm90ZTogJ0xJS0UnIHwgJ0RJU0xJS0UnIHwgJ1NLSVAnO1xyXG4gICAgdGltZXN0YW1wOiBudW1iZXI7XHJcbiAgfT4ge1xyXG4gICAgcmV0dXJuIGZjLnJlY29yZCh7XHJcbiAgICAgIHJvb21JZDogdGhpcy5yb29tSWQoKSxcclxuICAgICAgbW92aWVJZDogdGhpcy5tb3ZpZUlkKCkubWFwKGlkID0+IGlkLnRvU3RyaW5nKCkpLFxyXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkKCksXHJcbiAgICAgIHZvdGU6IGZjLmNvbnN0YW50RnJvbSgnTElLRScsICdESVNMSUtFJywgJ1NLSVAnKSxcclxuICAgICAgdGltZXN0YW1wOiB0aGlzLnRpbWVzdGFtcCgpLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUHJvcGVydHkgdGVzdCBjb25maWd1cmF0aW9uIHByZXNldHNcclxuICovXHJcbmV4cG9ydCBjbGFzcyBQcm9wZXJ0eVRlc3RDb25maWcge1xyXG4gIC8qKlxyXG4gICAqIFN0YW5kYXJkIGNvbmZpZ3VyYXRpb24gZm9yIG1vc3QgcHJvcGVydHkgdGVzdHNcclxuICAgKi9cclxuICBzdGF0aWMgc3RhbmRhcmQoKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBudW1SdW5zOiAxMDAsXHJcbiAgICAgIHZlcmJvc2U6IGZhbHNlLFxyXG4gICAgICBzZWVkOiB1bmRlZmluZWQsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmFzdCBjb25maWd1cmF0aW9uIGZvciBxdWljayBmZWVkYmFjayBkdXJpbmcgZGV2ZWxvcG1lbnRcclxuICAgKi9cclxuICBzdGF0aWMgZmFzdCgpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIG51bVJ1bnM6IDI1LFxyXG4gICAgICB2ZXJib3NlOiBmYWxzZSxcclxuICAgICAgc2VlZDogdW5kZWZpbmVkLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFRob3JvdWdoIGNvbmZpZ3VyYXRpb24gZm9yIGNyaXRpY2FsIHN5c3RlbSBwcm9wZXJ0aWVzXHJcbiAgICovXHJcbiAgc3RhdGljIHRob3JvdWdoKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgbnVtUnVuczogNTAwLFxyXG4gICAgICB2ZXJib3NlOiB0cnVlLFxyXG4gICAgICBzZWVkOiB1bmRlZmluZWQsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRGVidWcgY29uZmlndXJhdGlvbiB3aXRoIHZlcmJvc2Ugb3V0cHV0XHJcbiAgICovXHJcbiAgc3RhdGljIGRlYnVnKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgbnVtUnVuczogMTAsXHJcbiAgICAgIHZlcmJvc2U6IHRydWUsXHJcbiAgICAgIHNlZWQ6IDQyLCAvLyBGaXhlZCBzZWVkIGZvciByZXByb2R1Y2libGUgZGVidWdnaW5nXHJcbiAgICB9O1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENvbW1vbiBwcm9wZXJ0eSB0ZXN0IHBhdHRlcm5zIGFuZCB1dGlsaXRpZXNcclxuICovXHJcbmV4cG9ydCBjbGFzcyBQcm9wZXJ0eVRlc3RQYXR0ZXJucyB7XHJcbiAgLyoqXHJcbiAgICogVGVzdCB0aGF0IGEgZnVuY3Rpb24gaXMgaWRlbXBvdGVudCAoZihmKHgpKSA9PT0gZih4KSlcclxuICAgKi9cclxuICBzdGF0aWMgaWRlbXBvdGVudDxUPihcclxuICAgIGdlbmVyYXRvcjogZmMuQXJiaXRyYXJ5PFQ+LFxyXG4gICAgZm46IChpbnB1dDogVCkgPT4gVCxcclxuICAgIGVxdWFsczogKGE6IFQsIGI6IFQpID0+IGJvb2xlYW4gPSAoYSwgYikgPT4gSlNPTi5zdHJpbmdpZnkoYSkgPT09IEpTT04uc3RyaW5naWZ5KGIpXHJcbiAgKSB7XHJcbiAgICByZXR1cm4gZmMucHJvcGVydHkoZ2VuZXJhdG9yLCAoaW5wdXQpID0+IHtcclxuICAgICAgY29uc3QgcmVzdWx0MSA9IGZuKGlucHV0KTtcclxuICAgICAgY29uc3QgcmVzdWx0MiA9IGZuKHJlc3VsdDEpO1xyXG4gICAgICByZXR1cm4gZXF1YWxzKHJlc3VsdDEsIHJlc3VsdDIpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBUZXN0IHRoYXQgYSBmdW5jdGlvbiBwcmVzZXJ2ZXMgY2VydGFpbiBpbnZhcmlhbnRzXHJcbiAgICovXHJcbiAgc3RhdGljIGludmFyaWFudDxUPihcclxuICAgIGdlbmVyYXRvcjogZmMuQXJiaXRyYXJ5PFQ+LFxyXG4gICAgZm46IChpbnB1dDogVCkgPT4gVCxcclxuICAgIGludmFyaWFudENoZWNrOiAoaW5wdXQ6IFQsIG91dHB1dDogVCkgPT4gYm9vbGVhblxyXG4gICkge1xyXG4gICAgcmV0dXJuIGZjLnByb3BlcnR5KGdlbmVyYXRvciwgKGlucHV0KSA9PiB7XHJcbiAgICAgIGNvbnN0IG91dHB1dCA9IGZuKGlucHV0KTtcclxuICAgICAgcmV0dXJuIGludmFyaWFudENoZWNrKGlucHV0LCBvdXRwdXQpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBUZXN0IHJvdW5kLXRyaXAgY29uc2lzdGVuY3kgKHNlcmlhbGl6ZSAtPiBkZXNlcmlhbGl6ZSAtPiBlcXVhbHMgb3JpZ2luYWwpXHJcbiAgICovXHJcbiAgc3RhdGljIHJvdW5kVHJpcDxUPihcclxuICAgIGdlbmVyYXRvcjogZmMuQXJiaXRyYXJ5PFQ+LFxyXG4gICAgc2VyaWFsaXplOiAoaW5wdXQ6IFQpID0+IHN0cmluZyxcclxuICAgIGRlc2VyaWFsaXplOiAoc2VyaWFsaXplZDogc3RyaW5nKSA9PiBULFxyXG4gICAgZXF1YWxzOiAoYTogVCwgYjogVCkgPT4gYm9vbGVhbiA9IChhLCBiKSA9PiBKU09OLnN0cmluZ2lmeShhKSA9PT0gSlNPTi5zdHJpbmdpZnkoYilcclxuICApIHtcclxuICAgIHJldHVybiBmYy5wcm9wZXJ0eShnZW5lcmF0b3IsIChpbnB1dCkgPT4ge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IHNlcmlhbGl6ZWQgPSBzZXJpYWxpemUoaW5wdXQpO1xyXG4gICAgICAgIGNvbnN0IGRlc2VyaWFsaXplZCA9IGRlc2VyaWFsaXplKHNlcmlhbGl6ZWQpO1xyXG4gICAgICAgIHJldHVybiBlcXVhbHMoaW5wdXQsIGRlc2VyaWFsaXplZCk7XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgLy8gU2VyaWFsaXphdGlvbi9kZXNlcmlhbGl6YXRpb24gc2hvdWxkIG5vdCB0aHJvdyBmb3IgdmFsaWQgaW5wdXRzXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFRlc3QgdGhhdCBhIGZ1bmN0aW9uIGlzIGNvbW11dGF0aXZlIChmKGEsIGIpID09PSBmKGIsIGEpKVxyXG4gICAqL1xyXG4gIHN0YXRpYyBjb21tdXRhdGl2ZTxULCBSPihcclxuICAgIGdlbmVyYXRvcjogZmMuQXJiaXRyYXJ5PFQ+LFxyXG4gICAgZm46IChhOiBULCBiOiBUKSA9PiBSLFxyXG4gICAgZXF1YWxzOiAoYTogUiwgYjogUikgPT4gYm9vbGVhbiA9IChhLCBiKSA9PiBKU09OLnN0cmluZ2lmeShhKSA9PT0gSlNPTi5zdHJpbmdpZnkoYilcclxuICApIHtcclxuICAgIHJldHVybiBmYy5wcm9wZXJ0eShnZW5lcmF0b3IsIGdlbmVyYXRvciwgKGEsIGIpID0+IHtcclxuICAgICAgY29uc3QgcmVzdWx0MSA9IGZuKGEsIGIpO1xyXG4gICAgICBjb25zdCByZXN1bHQyID0gZm4oYiwgYSk7XHJcbiAgICAgIHJldHVybiBlcXVhbHMocmVzdWx0MSwgcmVzdWx0Mik7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFRlc3QgdGhhdCBhIGZ1bmN0aW9uIGlzIGFzc29jaWF0aXZlIChmKGYoYSwgYiksIGMpID09PSBmKGEsIGYoYiwgYykpKVxyXG4gICAqL1xyXG4gIHN0YXRpYyBhc3NvY2lhdGl2ZTxUPihcclxuICAgIGdlbmVyYXRvcjogZmMuQXJiaXRyYXJ5PFQ+LFxyXG4gICAgZm46IChhOiBULCBiOiBUKSA9PiBULFxyXG4gICAgZXF1YWxzOiAoYTogVCwgYjogVCkgPT4gYm9vbGVhbiA9IChhLCBiKSA9PiBKU09OLnN0cmluZ2lmeShhKSA9PT0gSlNPTi5zdHJpbmdpZnkoYilcclxuICApIHtcclxuICAgIHJldHVybiBmYy5wcm9wZXJ0eShnZW5lcmF0b3IsIGdlbmVyYXRvciwgZ2VuZXJhdG9yLCAoYSwgYiwgYykgPT4ge1xyXG4gICAgICBjb25zdCByZXN1bHQxID0gZm4oZm4oYSwgYiksIGMpO1xyXG4gICAgICBjb25zdCByZXN1bHQyID0gZm4oYSwgZm4oYiwgYykpO1xyXG4gICAgICByZXR1cm4gZXF1YWxzKHJlc3VsdDEsIHJlc3VsdDIpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBUZXN0IHRoYXQgYSBmdW5jdGlvbiBoYXMgYW4gaWRlbnRpdHkgZWxlbWVudCAoZih4LCBpZGVudGl0eSkgPT09IHgpXHJcbiAgICovXHJcbiAgc3RhdGljIGlkZW50aXR5PFQ+KFxyXG4gICAgZ2VuZXJhdG9yOiBmYy5BcmJpdHJhcnk8VD4sXHJcbiAgICBpZGVudGl0eTogVCxcclxuICAgIGZuOiAoYTogVCwgYjogVCkgPT4gVCxcclxuICAgIGVxdWFsczogKGE6IFQsIGI6IFQpID0+IGJvb2xlYW4gPSAoYSwgYikgPT4gSlNPTi5zdHJpbmdpZnkoYSkgPT09IEpTT04uc3RyaW5naWZ5KGIpXHJcbiAgKSB7XHJcbiAgICByZXR1cm4gZmMucHJvcGVydHkoZ2VuZXJhdG9yLCAoaW5wdXQpID0+IHtcclxuICAgICAgY29uc3QgcmVzdWx0MSA9IGZuKGlucHV0LCBpZGVudGl0eSk7XHJcbiAgICAgIGNvbnN0IHJlc3VsdDIgPSBmbihpZGVudGl0eSwgaW5wdXQpO1xyXG4gICAgICByZXR1cm4gZXF1YWxzKHJlc3VsdDEsIGlucHV0KSAmJiBlcXVhbHMocmVzdWx0MiwgaW5wdXQpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogVmFsaWRhdGlvbiB1dGlsaXRpZXMgZm9yIFRyaW5pdHkgZG9tYWluIG9iamVjdHNcclxuICovXHJcbmV4cG9ydCBjbGFzcyBUcmluaXR5VmFsaWRhdG9ycyB7XHJcbiAgLyoqXHJcbiAgICogVmFsaWRhdGUgbW92aWUgb2JqZWN0IHN0cnVjdHVyZVxyXG4gICAqL1xyXG4gIHN0YXRpYyBpc1ZhbGlkTW92aWUobW92aWU6IGFueSk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIChcclxuICAgICAgdHlwZW9mIG1vdmllID09PSAnb2JqZWN0JyAmJlxyXG4gICAgICBtb3ZpZSAhPT0gbnVsbCAmJlxyXG4gICAgICB0eXBlb2YgbW92aWUuaWQgPT09ICdudW1iZXInICYmXHJcbiAgICAgIG1vdmllLmlkID4gMCAmJlxyXG4gICAgICB0eXBlb2YgbW92aWUudGl0bGUgPT09ICdzdHJpbmcnICYmXHJcbiAgICAgIG1vdmllLnRpdGxlLnRyaW0oKS5sZW5ndGggPiAwICYmXHJcbiAgICAgIHR5cGVvZiBtb3ZpZS5vdmVydmlldyA9PT0gJ3N0cmluZycgJiZcclxuICAgICAgdHlwZW9mIG1vdmllLnJlbGVhc2VfZGF0ZSA9PT0gJ3N0cmluZycgJiZcclxuICAgICAgQXJyYXkuaXNBcnJheShtb3ZpZS5nZW5yZV9pZHMpICYmXHJcbiAgICAgIG1vdmllLmdlbnJlX2lkcy5ldmVyeSgoaWQ6IGFueSkgPT4gdHlwZW9mIGlkID09PSAnbnVtYmVyJyAmJiBpZCA+IDApICYmXHJcbiAgICAgIHR5cGVvZiBtb3ZpZS52b3RlX2F2ZXJhZ2UgPT09ICdudW1iZXInICYmXHJcbiAgICAgIG1vdmllLnZvdGVfYXZlcmFnZSA+PSAwICYmXHJcbiAgICAgIG1vdmllLnZvdGVfYXZlcmFnZSA8PSAxMCAmJlxyXG4gICAgICB0eXBlb2YgbW92aWUucG9wdWxhcml0eSA9PT0gJ251bWJlcicgJiZcclxuICAgICAgbW92aWUucG9wdWxhcml0eSA+PSAwXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVmFsaWRhdGUgdm90ZSBvYmplY3Qgc3RydWN0dXJlXHJcbiAgICovXHJcbiAgc3RhdGljIGlzVmFsaWRWb3RlKHZvdGU6IGFueSk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIChcclxuICAgICAgdHlwZW9mIHZvdGUgPT09ICdvYmplY3QnICYmXHJcbiAgICAgIHZvdGUgIT09IG51bGwgJiZcclxuICAgICAgdHlwZW9mIHZvdGUucm9vbUlkID09PSAnc3RyaW5nJyAmJlxyXG4gICAgICB2b3RlLnJvb21JZC5sZW5ndGggPiAwICYmXHJcbiAgICAgIHR5cGVvZiB2b3RlLm1vdmllSWQgPT09ICdzdHJpbmcnICYmXHJcbiAgICAgIHZvdGUubW92aWVJZC5sZW5ndGggPiAwICYmXHJcbiAgICAgIHR5cGVvZiB2b3RlLnVzZXJJZCA9PT0gJ3N0cmluZycgJiZcclxuICAgICAgdm90ZS51c2VySWQubGVuZ3RoID4gMCAmJlxyXG4gICAgICBbJ0xJS0UnLCAnRElTTElLRScsICdTS0lQJ10uaW5jbHVkZXModm90ZS52b3RlKSAmJlxyXG4gICAgICB0eXBlb2Ygdm90ZS50aW1lc3RhbXAgPT09ICdudW1iZXInICYmXHJcbiAgICAgIHZvdGUudGltZXN0YW1wID4gMFxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlIHJvb20gY29uZmlndXJhdGlvbiBvYmplY3Qgc3RydWN0dXJlXHJcbiAgICovXHJcbiAgc3RhdGljIGlzVmFsaWRSb29tQ29uZmlnKGNvbmZpZzogYW55KTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gKFxyXG4gICAgICB0eXBlb2YgY29uZmlnID09PSAnb2JqZWN0JyAmJlxyXG4gICAgICBjb25maWcgIT09IG51bGwgJiZcclxuICAgICAgdHlwZW9mIGNvbmZpZy5yb29tSWQgPT09ICdzdHJpbmcnICYmXHJcbiAgICAgIGNvbmZpZy5yb29tSWQubGVuZ3RoID4gMCAmJlxyXG4gICAgICB0eXBlb2YgY29uZmlnLmNhcGFjaXR5ID09PSAnbnVtYmVyJyAmJlxyXG4gICAgICBjb25maWcuY2FwYWNpdHkgPj0gMiAmJlxyXG4gICAgICBjb25maWcuY2FwYWNpdHkgPD0gMTAgJiZcclxuICAgICAgQXJyYXkuaXNBcnJheShjb25maWcuZ2VucmVJZHMpICYmXHJcbiAgICAgIGNvbmZpZy5nZW5yZUlkcy5sZW5ndGggPiAwICYmXHJcbiAgICAgIGNvbmZpZy5nZW5yZUlkcy5ldmVyeSgoaWQ6IGFueSkgPT4gdHlwZW9mIGlkID09PSAnbnVtYmVyJyAmJiBpZCA+IDApICYmXHJcbiAgICAgIFsnbW92aWUnLCAndHYnXS5pbmNsdWRlcyhjb25maWcuY29udGVudFR5cGUpICYmXHJcbiAgICAgIHR5cGVvZiBjb25maWcubWluWWVhciA9PT0gJ251bWJlcicgJiZcclxuICAgICAgdHlwZW9mIGNvbmZpZy5tYXhZZWFyID09PSAnbnVtYmVyJyAmJlxyXG4gICAgICBjb25maWcubWF4WWVhciA+IGNvbmZpZy5taW5ZZWFyICYmXHJcbiAgICAgIHR5cGVvZiBjb25maWcubWluUmF0aW5nID09PSAnbnVtYmVyJyAmJlxyXG4gICAgICBjb25maWcubWluUmF0aW5nID49IDAgJiZcclxuICAgICAgY29uZmlnLm1pblJhdGluZyA8PSAxMFxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlIER5bmFtb0RCIGl0ZW0gc3RydWN0dXJlIChjb21tb24gZmllbGRzKVxyXG4gICAqL1xyXG4gIHN0YXRpYyBpc1ZhbGlkRHluYW1vREJJdGVtKGl0ZW06IGFueSk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIChcclxuICAgICAgdHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnICYmXHJcbiAgICAgIGl0ZW0gIT09IG51bGwgJiZcclxuICAgICAgLy8gQWxsIER5bmFtb0RCIGl0ZW1zIHNob3VsZCBoYXZlIGF0IGxlYXN0IGEgcHJpbWFyeSBrZXlcclxuICAgICAgT2JqZWN0LmtleXMoaXRlbSkubGVuZ3RoID4gMCAmJlxyXG4gICAgICAvLyBDaGVjayBmb3IgY29tbW9uIER5bmFtb0RCIHBhdHRlcm5zXHJcbiAgICAgIE9iamVjdC52YWx1ZXMoaXRlbSkuZXZlcnkodmFsdWUgPT4gXHJcbiAgICAgICAgdmFsdWUgIT09IHVuZGVmaW5lZCAmJiBcclxuICAgICAgICB2YWx1ZSAhPT0gbnVsbFxyXG4gICAgICApXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVmFsaWRhdGUgY2FjaGUgZW50cnkgc3RydWN0dXJlXHJcbiAgICovXHJcbiAgc3RhdGljIGlzVmFsaWRDYWNoZUVudHJ5KGVudHJ5OiBhbnkpOiBib29sZWFuIHtcclxuICAgIHJldHVybiAoXHJcbiAgICAgIHR5cGVvZiBlbnRyeSA9PT0gJ29iamVjdCcgJiZcclxuICAgICAgZW50cnkgIT09IG51bGwgJiZcclxuICAgICAgdHlwZW9mIGVudHJ5Lm1vdmllSWQgPT09ICdzdHJpbmcnICYmXHJcbiAgICAgIGVudHJ5Lm1vdmllSWQubGVuZ3RoID4gMCAmJlxyXG4gICAgICB0eXBlb2YgZW50cnkuY2FjaGVkQXQgPT09ICdudW1iZXInICYmXHJcbiAgICAgIGVudHJ5LmNhY2hlZEF0ID4gMCAmJlxyXG4gICAgICB0eXBlb2YgZW50cnkudHRsID09PSAnbnVtYmVyJyAmJlxyXG4gICAgICBlbnRyeS50dGwgPiBlbnRyeS5jYWNoZWRBdCAmJlxyXG4gICAgICBlbnRyeS5kYXRhICE9PSB1bmRlZmluZWQgJiZcclxuICAgICAgZW50cnkuZGF0YSAhPT0gbnVsbFxyXG4gICAgKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNb2NrIHV0aWxpdGllcyBmb3IgcHJvcGVydHktYmFzZWQgdGVzdGluZ1xyXG4gKi9cclxuZXhwb3J0IGNsYXNzIFByb3BlcnR5VGVzdE1vY2tzIHtcclxuICAvKipcclxuICAgKiBDcmVhdGUgYSBtb2NrIER5bmFtb0RCIGNsaWVudCB3aXRoIGNvbmZpZ3VyYWJsZSByZXNwb25zZXNcclxuICAgKi9cclxuICBzdGF0aWMgY3JlYXRlTW9ja0R5bmFtb0RCKHJlc3BvbnNlczogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9KSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBnZXRJdGVtOiBqZXN0LmZuKCkubW9ja0ltcGxlbWVudGF0aW9uKGFzeW5jIChwYXJhbXMpID0+IHtcclxuICAgICAgICBjb25zdCBrZXkgPSBKU09OLnN0cmluZ2lmeShwYXJhbXMuS2V5KTtcclxuICAgICAgICByZXR1cm4geyBJdGVtOiByZXNwb25zZXNba2V5XSB8fCBudWxsIH07XHJcbiAgICAgIH0pLFxyXG4gICAgICBwdXRJdGVtOiBqZXN0LmZuKCkubW9ja1Jlc29sdmVkVmFsdWUoe30pLFxyXG4gICAgICB1cGRhdGVJdGVtOiBqZXN0LmZuKCkubW9ja1Jlc29sdmVkVmFsdWUoe30pLFxyXG4gICAgICBkZWxldGVJdGVtOiBqZXN0LmZuKCkubW9ja1Jlc29sdmVkVmFsdWUoe30pLFxyXG4gICAgICBxdWVyeTogamVzdC5mbigpLm1vY2tSZXNvbHZlZFZhbHVlKHsgSXRlbXM6IFtdIH0pLFxyXG4gICAgICBzY2FuOiBqZXN0LmZuKCkubW9ja1Jlc29sdmVkVmFsdWUoeyBJdGVtczogW10gfSksXHJcbiAgICAgIGJhdGNoR2V0SXRlbTogamVzdC5mbigpLm1vY2tSZXNvbHZlZFZhbHVlKHsgUmVzcG9uc2VzOiB7fSB9KSxcclxuICAgICAgYmF0Y2hXcml0ZUl0ZW06IGplc3QuZm4oKS5tb2NrUmVzb2x2ZWRWYWx1ZSh7fSksXHJcbiAgICAgIHRyYW5zYWN0V3JpdGU6IGplc3QuZm4oKS5tb2NrUmVzb2x2ZWRWYWx1ZSh7fSksXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIGEgbW9jayBjb25maWd1cmF0aW9uIHNlcnZpY2VcclxuICAgKi9cclxuICBzdGF0aWMgY3JlYXRlTW9ja0NvbmZpZyhjb25maWc6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fSkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgZ2V0OiBqZXN0LmZuKCkubW9ja0ltcGxlbWVudGF0aW9uKChrZXk6IHN0cmluZykgPT4ge1xyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoY29uZmlnW2tleV0pO1xyXG4gICAgICB9KSxcclxuICAgICAgc2V0OiBqZXN0LmZuKCkubW9ja1Jlc29sdmVkVmFsdWUodW5kZWZpbmVkKSxcclxuICAgICAgcmVmcmVzaDogamVzdC5mbigpLm1vY2tSZXNvbHZlZFZhbHVlKHVuZGVmaW5lZCksXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIGEgbW9jayBsb2dnZXJcclxuICAgKi9cclxuICBzdGF0aWMgY3JlYXRlTW9ja0xvZ2dlcigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluZm86IGplc3QuZm4oKSxcclxuICAgICAgZXJyb3I6IGplc3QuZm4oKSxcclxuICAgICAgd2FybjogamVzdC5mbigpLFxyXG4gICAgICBkZWJ1ZzogamVzdC5mbigpLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBhIG1vY2sgVE1EQiBBUEkgY2xpZW50XHJcbiAgICovXHJcbiAgc3RhdGljIGNyZWF0ZU1vY2tUTURCQ2xpZW50KHJlc3BvbnNlczogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9KSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzZWFyY2hNb3ZpZXM6IGplc3QuZm4oKS5tb2NrSW1wbGVtZW50YXRpb24oYXN5bmMgKHF1ZXJ5KSA9PiB7XHJcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlc1tgc2VhcmNoOiR7cXVlcnl9YF0gfHwgeyByZXN1bHRzOiBbXSB9O1xyXG4gICAgICB9KSxcclxuICAgICAgZ2V0TW92aWVEZXRhaWxzOiBqZXN0LmZuKCkubW9ja0ltcGxlbWVudGF0aW9uKGFzeW5jIChpZCkgPT4ge1xyXG4gICAgICAgIHJldHVybiByZXNwb25zZXNbYG1vdmllOiR7aWR9YF0gfHwgbnVsbDtcclxuICAgICAgfSksXHJcbiAgICAgIGRpc2NvdmVyTW92aWVzOiBqZXN0LmZuKCkubW9ja0ltcGxlbWVudGF0aW9uKGFzeW5jIChmaWx0ZXJzKSA9PiB7XHJcbiAgICAgICAgY29uc3Qga2V5ID0gSlNPTi5zdHJpbmdpZnkoZmlsdGVycyk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlc1tgZGlzY292ZXI6JHtrZXl9YF0gfHwgeyByZXN1bHRzOiBbXSB9O1xyXG4gICAgICB9KSxcclxuICAgIH07XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUGVyZm9ybWFuY2UgdGVzdGluZyB1dGlsaXRpZXMgZm9yIHByb3BlcnR5LWJhc2VkIHRlc3RzXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgUHJvcGVydHlUZXN0UGVyZm9ybWFuY2Uge1xyXG4gIC8qKlxyXG4gICAqIE1lYXN1cmUgZXhlY3V0aW9uIHRpbWUgb2YgYSBmdW5jdGlvblxyXG4gICAqL1xyXG4gIHN0YXRpYyBhc3luYyBtZWFzdXJlVGltZTxUPihmbjogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8eyByZXN1bHQ6IFQ7IHRpbWVNczogbnVtYmVyIH0+IHtcclxuICAgIGNvbnN0IHN0YXJ0ID0gcHJvY2Vzcy5ocnRpbWUuYmlnaW50KCk7XHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmbigpO1xyXG4gICAgY29uc3QgZW5kID0gcHJvY2Vzcy5ocnRpbWUuYmlnaW50KCk7XHJcbiAgICBjb25zdCB0aW1lTXMgPSBOdW1iZXIoZW5kIC0gc3RhcnQpIC8gMV8wMDBfMDAwO1xyXG4gICAgcmV0dXJuIHsgcmVzdWx0LCB0aW1lTXMgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFRlc3QgdGhhdCBhIGZ1bmN0aW9uIGNvbXBsZXRlcyB3aXRoaW4gYSB0aW1lIGxpbWl0XHJcbiAgICovXHJcbiAgc3RhdGljIHdpdGhpblRpbWVMaW1pdDxUPihcclxuICAgIGdlbmVyYXRvcjogZmMuQXJiaXRyYXJ5PFQ+LFxyXG4gICAgZm46IChpbnB1dDogVCkgPT4gUHJvbWlzZTxhbnk+LFxyXG4gICAgdGltZUxpbWl0TXM6IG51bWJlclxyXG4gICkge1xyXG4gICAgcmV0dXJuIGZjLmFzeW5jUHJvcGVydHkoZ2VuZXJhdG9yLCBhc3luYyAoaW5wdXQpID0+IHtcclxuICAgICAgY29uc3QgeyB0aW1lTXMgfSA9IGF3YWl0IHRoaXMubWVhc3VyZVRpbWUoKCkgPT4gZm4oaW5wdXQpKTtcclxuICAgICAgcmV0dXJuIHRpbWVNcyA8PSB0aW1lTGltaXRNcztcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVGVzdCB0aGF0IHBlcmZvcm1hbmNlIHNjYWxlcyBsaW5lYXJseSB3aXRoIGlucHV0IHNpemVcclxuICAgKi9cclxuICBzdGF0aWMgbGluZWFyU2NhbGluZzxUPihcclxuICAgIHNpemVHZW5lcmF0b3I6IGZjLkFyYml0cmFyeTxudW1iZXI+LFxyXG4gICAgaW5wdXRHZW5lcmF0b3I6IChzaXplOiBudW1iZXIpID0+IGZjLkFyYml0cmFyeTxUPixcclxuICAgIGZuOiAoaW5wdXQ6IFQpID0+IFByb21pc2U8YW55PixcclxuICAgIG1heFNjYWxpbmdGYWN0b3I6IG51bWJlciA9IDEwXHJcbiAgKSB7XHJcbiAgICByZXR1cm4gZmMuYXN5bmNQcm9wZXJ0eShcclxuICAgICAgc2l6ZUdlbmVyYXRvcixcclxuICAgICAgc2l6ZUdlbmVyYXRvci5maWx0ZXIoc2l6ZTIgPT4gc2l6ZTIgPiAwKSxcclxuICAgICAgYXN5bmMgKHNpemUxLCBzaXplMikgPT4ge1xyXG4gICAgICAgIGlmIChzaXplMSA9PT0gc2l6ZTIpIHJldHVybiB0cnVlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IFtzbWFsbFNpemUsIGxhcmdlU2l6ZV0gPSBzaXplMSA8IHNpemUyID8gW3NpemUxLCBzaXplMl0gOiBbc2l6ZTIsIHNpemUxXTtcclxuICAgICAgICBjb25zdCBzY2FsaW5nRmFjdG9yID0gbGFyZ2VTaXplIC8gc21hbGxTaXplO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChzY2FsaW5nRmFjdG9yID4gbWF4U2NhbGluZ0ZhY3RvcikgcmV0dXJuIHRydWU7IC8vIFNraXAgZXh0cmVtZSBzY2FsaW5nIHRlc3RzXHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3Qgc21hbGxJbnB1dCA9IGZjLnNhbXBsZShpbnB1dEdlbmVyYXRvcihzbWFsbFNpemUpLCAxKVswXTtcclxuICAgICAgICBjb25zdCBsYXJnZUlucHV0ID0gZmMuc2FtcGxlKGlucHV0R2VuZXJhdG9yKGxhcmdlU2l6ZSksIDEpWzBdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHsgdGltZU1zOiBzbWFsbFRpbWUgfSA9IGF3YWl0IHRoaXMubWVhc3VyZVRpbWUoKCkgPT4gZm4oc21hbGxJbnB1dCkpO1xyXG4gICAgICAgIGNvbnN0IHsgdGltZU1zOiBsYXJnZVRpbWUgfSA9IGF3YWl0IHRoaXMubWVhc3VyZVRpbWUoKCkgPT4gZm4obGFyZ2VJbnB1dCkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFBlcmZvcm1hbmNlIHNob3VsZCBzY2FsZSBubyB3b3JzZSB0aGFuIHF1YWRyYXRpY2FsbHlcclxuICAgICAgICBjb25zdCBwZXJmb3JtYW5jZVJhdGlvID0gbGFyZ2VUaW1lIC8gTWF0aC5tYXgoc21hbGxUaW1lLCAxKTtcclxuICAgICAgICBjb25zdCBleHBlY3RlZE1heFJhdGlvID0gc2NhbGluZ0ZhY3RvciAqIHNjYWxpbmdGYWN0b3I7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHBlcmZvcm1hbmNlUmF0aW8gPD0gZXhwZWN0ZWRNYXhSYXRpbztcclxuICAgICAgfVxyXG4gICAgKTtcclxuICB9XHJcbn0iXX0=