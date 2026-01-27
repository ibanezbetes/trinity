"use strict";
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
const fc = __importStar(require("fast-check"));
const ai_1 = require("../handlers/ai");
// Mock environment variables
process.env.HF_API_TOKEN = 'test-token';
process.env.TMDB_API_KEY = 'test-tmdb-key';
// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({
            Items: [],
            Count: 0
        })
    }))
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn().mockReturnValue({
            send: jest.fn().mockResolvedValue({
                Items: [],
                Count: 0
            })
        })
    },
    GetCommand: jest.fn(),
    PutCommand: jest.fn(),
    QueryCommand: jest.fn()
}));
// Mock fetch for Hugging Face API and TMDB API
const mockFetch = jest.fn();
global.fetch = mockFetch;
// Mock movie cache service
jest.mock('../services/movieCacheService', () => ({
    movieCacheService: {
        preCacheMovies: jest.fn(),
    },
}));
// Mock metrics utilities
jest.mock('../utils/metrics', () => ({
    logBusinessMetric: jest.fn(),
    logError: jest.fn(),
    PerformanceTimer: jest.fn().mockImplementation(() => ({
        finish: jest.fn(),
    })),
}));
// Mock context
const mockContext = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test-function',
    logStreamName: '2023/01/01/[$LATEST]test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn(),
};
// Helper to create mock AppSync event
function createMockEvent(fieldName, args) {
    return {
        arguments: args,
        identity: null,
        source: null,
        request: {
            headers: {},
            domainName: null,
        },
        prev: null,
        info: {
            fieldName,
            parentTypeName: 'Query',
            variables: {},
            selectionSetList: [],
            selectionSetGraphQL: '',
        },
        stash: {},
    };
}
describe('AI Fallback Behavior Property Tests', () => {
    // Get the mocked function
    const { movieCacheService } = require('../services/movieCacheService');
    const mockPreCacheMovies = movieCacheService.preCacheMovies;
    beforeEach(() => {
        jest.clearAllMocks();
    });
    /**
     * Property 16: AI Fallback Behavior
     * For any AI service failure, the system should fall back to genre-based TMDB API recommendations
     * Validates: Requirements 6.5
     *
     * Feature: trinity-voting-fixes, Property 16: AI Fallback Behavior
     */
    it('should fall back to TMDB API recommendations when AI service fails', async () => {
        await fc.assert(fc.asyncProperty(
        // Generate user text input
        fc.string({ minLength: 5, maxLength: 100 }).filter(s => s.trim().length > 0), 
        // Generate room genres (0-3 genres from available list)
        fc.array(fc.constantFrom('acción', 'aventura', 'animación', 'comedia', 'crimen', 'documental', 'drama', 'familia', 'fantasía', 'historia', 'terror', 'música', 'misterio', 'romance', 'ciencia ficción', 'thriller', 'guerra', 'western'), { minLength: 0, maxLength: 3 }).map(genres => [...new Set(genres)]), // Remove duplicates
        async (userText, roomGenres) => {
            // Mock Salamandra API failure
            mockFetch.mockRejectedValueOnce(new Error('Salamandra API unavailable'));
            // Mock successful TMDB API response through movie cache service
            const mockMovies = [
                {
                    tmdbId: 1,
                    title: 'Test Movie 1',
                    posterPath: 'https://image.tmdb.org/t/p/w500/test1.jpg',
                    overview: 'A great test movie',
                    genres: roomGenres.length > 0 ? [roomGenres[0]] : ['drama'],
                    year: 2023,
                    rating: 8.0,
                    cachedAt: new Date().toISOString(),
                    ttl: Date.now() + 86400000,
                },
                {
                    tmdbId: 2,
                    title: 'Test Movie 2',
                    posterPath: 'https://image.tmdb.org/t/p/w500/test2.jpg',
                    overview: 'Another great test movie',
                    genres: roomGenres.length > 1 ? [roomGenres[1]] : ['comedia'],
                    year: 2023,
                    rating: 7.5,
                    cachedAt: new Date().toISOString(),
                    ttl: Date.now() + 86400000,
                },
            ];
            mockPreCacheMovies.mockResolvedValueOnce(mockMovies);
            // Create mock AppSync event
            const event = createMockEvent('getChatRecommendations', {
                text: userText,
                roomGenres: roomGenres.length > 0 ? roomGenres : undefined,
            });
            // Execute the handler
            const result = await (0, ai_1.handler)(event, mockContext, jest.fn());
            // Verify response structure
            expect(result).toHaveProperty('chatResponse');
            expect(result).toHaveProperty('recommendedGenres');
            expect(result).toHaveProperty('confidence');
            expect(result).toHaveProperty('reasoning');
            // Verify TMDB fallback was used
            expect(mockPreCacheMovies).toHaveBeenCalledWith('tmdb_fallback_temp', expect.any(Array));
            // Verify confidence is appropriate for TMDB fallback (should be higher than local fallback)
            expect(result.confidence).toBeGreaterThan(0.5);
            expect(result.confidence).toBeLessThanOrEqual(1);
            // Verify recommended genres are valid
            expect(Array.isArray(result.recommendedGenres)).toBe(true);
            expect(result.recommendedGenres.length).toBeGreaterThan(0);
            expect(result.recommendedGenres.length).toBeLessThanOrEqual(3);
            // Verify reasoning mentions TMDB
            expect(result.reasoning.toLowerCase()).toContain('tmdb');
            // Verify chat response is contextual and mentions movies found
            expect(result.chatResponse.length).toBeGreaterThan(0);
            expect(result.chatResponse).toContain('películas');
        }), { numRuns: 100, timeout: 10000 });
    }, 15000);
    /**
     * Property Test: Graceful Degradation to Local Fallback
     * When both AI and TMDB API fail, system should use local fallback
     */
    it('should gracefully degrade to local fallback when both AI and TMDB fail', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.trim().length > 0), fc.array(fc.constantFrom('drama', 'comedia', 'acción', 'thriller', 'romance'), { minLength: 0, maxLength: 2 }).map(genres => [...new Set(genres)]), async (userText, roomGenres) => {
            // Mock both AI and TMDB failures
            mockFetch.mockRejectedValueOnce(new Error('Salamandra API failure'));
            mockPreCacheMovies.mockRejectedValueOnce(new Error('TMDB API failure'));
            const event = createMockEvent('getChatRecommendations', {
                text: userText,
                roomGenres: roomGenres.length > 0 ? roomGenres : undefined,
            });
            // Execute handler (should use local fallback)
            const result = await (0, ai_1.handler)(event, mockContext, jest.fn());
            // Verify local fallback response structure
            expect(result).toHaveProperty('chatResponse');
            expect(result).toHaveProperty('recommendedGenres');
            expect(result).toHaveProperty('confidence');
            expect(result).toHaveProperty('reasoning');
            // Verify both services were attempted
            expect(mockFetch).toHaveBeenCalled();
            expect(mockPreCacheMovies).toHaveBeenCalled();
            // Verify confidence is reasonable for local fallback
            expect(result.confidence).toBeGreaterThan(0.4);
            expect(result.confidence).toBeLessThanOrEqual(1);
            // Verify recommended genres are valid
            expect(Array.isArray(result.recommendedGenres)).toBe(true);
            expect(result.recommendedGenres.length).toBeGreaterThan(0);
            expect(result.recommendedGenres.length).toBeLessThanOrEqual(3);
            // Verify chat response is empathetic and helpful
            expect(result.chatResponse.length).toBeGreaterThan(0);
            expect(typeof result.reasoning).toBe('string');
            expect(result.reasoning.length).toBeGreaterThan(0);
        }), { numRuns: 50, timeout: 8000 });
    }, 12000);
    /**
     * Property Test: TMDB Fallback Genre Alignment
     * TMDB fallback should respect room genre preferences when available
     */
    it('should align TMDB fallback recommendations with room genres', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 10, maxLength: 30 }), fc.constantFrom('drama', 'comedia', 'acción'), // Single genre for clear alignment
        async (userText, roomGenre) => {
            // Mock AI failure
            mockFetch.mockRejectedValueOnce(new Error('AI service down'));
            // Mock TMDB response with movies matching the room genre
            const mockMovies = [
                {
                    tmdbId: 1,
                    title: 'Genre Movie 1',
                    posterPath: 'https://image.tmdb.org/t/p/w500/genre1.jpg',
                    overview: 'A movie in the requested genre',
                    genres: [roomGenre],
                    year: 2023,
                    rating: 8.0,
                    cachedAt: new Date().toISOString(),
                    ttl: Date.now() + 86400000,
                },
                {
                    tmdbId: 2,
                    title: 'Genre Movie 2',
                    posterPath: 'https://image.tmdb.org/t/p/w500/genre2.jpg',
                    overview: 'Another movie in the requested genre',
                    genres: [roomGenre, 'aventura'],
                    year: 2023,
                    rating: 7.8,
                    cachedAt: new Date().toISOString(),
                    ttl: Date.now() + 86400000,
                },
            ];
            mockPreCacheMovies.mockResolvedValueOnce(mockMovies);
            const event = createMockEvent('getChatRecommendations', {
                text: userText,
                roomGenres: [roomGenre],
            });
            const result = await (0, ai_1.handler)(event, mockContext, jest.fn());
            // Verify TMDB service was called with correct genre
            expect(mockPreCacheMovies).toHaveBeenCalledWith('tmdb_fallback_temp', [roomGenre]);
            // Verify recommended genres include the room genre
            const normalizedRecommended = result.recommendedGenres.map((g) => g.toLowerCase());
            const normalizedRoomGenre = roomGenre.toLowerCase();
            expect(normalizedRecommended).toContain(normalizedRoomGenre);
            // Verify confidence is high due to genre alignment
            expect(result.confidence).toBeGreaterThan(0.6);
            // Verify reasoning mentions the genre alignment
            expect(result.reasoning.toLowerCase()).toContain(roomGenre.toLowerCase());
        }), { numRuns: 30, timeout: 6000 });
    }, 10000);
    /**
     * Property Test: Fallback Response Quality
     * All fallback responses should maintain quality standards
     */
    it('should maintain response quality across all fallback scenarios', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 1, maxLength: 100 }), fc.option(fc.array(fc.constantFrom('drama', 'comedia', 'acción', 'thriller', 'romance', 'animación'), { minLength: 0, maxLength: 3 }), { nil: undefined }), fc.boolean(), // Whether TMDB should fail
        async (userText, roomGenres, tmdbShouldFail) => {
            // Always mock AI failure to test fallback
            mockFetch.mockRejectedValueOnce(new Error('AI service unavailable'));
            if (tmdbShouldFail) {
                // Mock TMDB failure
                mockPreCacheMovies.mockRejectedValueOnce(new Error('TMDB service unavailable'));
            }
            else {
                // Mock successful TMDB response
                const mockMovies = [
                    {
                        tmdbId: 1,
                        title: 'Fallback Movie',
                        posterPath: 'https://image.tmdb.org/t/p/w500/fallback.jpg',
                        overview: 'A reliable fallback movie',
                        genres: roomGenres && roomGenres.length > 0 ? [roomGenres[0]] : ['drama'],
                        year: 2023,
                        rating: 7.5,
                        cachedAt: new Date().toISOString(),
                        ttl: Date.now() + 86400000,
                    },
                ];
                mockPreCacheMovies.mockResolvedValueOnce(mockMovies);
            }
            const event = createMockEvent('getChatRecommendations', {
                text: userText,
                roomGenres,
            });
            const result = await (0, ai_1.handler)(event, mockContext, jest.fn());
            // Verify consistent response structure
            expect(typeof result.chatResponse).toBe('string');
            expect(result.chatResponse.length).toBeGreaterThan(0);
            expect(Array.isArray(result.recommendedGenres)).toBe(true);
            expect(result.recommendedGenres.length).toBeGreaterThan(0);
            expect(result.recommendedGenres.length).toBeLessThanOrEqual(3);
            expect(typeof result.confidence).toBe('number');
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
            expect(typeof result.reasoning).toBe('string');
            expect(result.reasoning.length).toBeGreaterThan(0);
            // Verify response quality indicators
            expect(result.chatResponse).not.toContain('undefined');
            expect(result.chatResponse).not.toContain('null');
            expect(result.reasoning).not.toContain('undefined');
            expect(result.reasoning).not.toContain('null');
            // All recommended genres should be valid
            const validGenres = [
                'acción', 'aventura', 'animación', 'comedia', 'crimen', 'documental',
                'drama', 'familia', 'fantasía', 'historia', 'terror', 'música',
                'misterio', 'romance', 'ciencia ficción', 'thriller', 'guerra', 'western'
            ];
            result.recommendedGenres.forEach((genre) => {
                expect(validGenres).toContain(genre);
            });
        }), { numRuns: 75, timeout: 8000 });
    }, 12000);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWktZmFsbGJhY2stYmVoYXZpb3IucHJvcGVydHkudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFpLWZhbGxiYWNrLWJlaGF2aW9yLnByb3BlcnR5LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwrQ0FBaUM7QUFDakMsdUNBQXlDO0FBR3pDLDZCQUE2QjtBQUM3QixPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7QUFDeEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEdBQUcsZUFBZSxDQUFDO0FBRTNDLGVBQWU7QUFDZixJQUFJLENBQUMsSUFBSSxDQUFDLDBCQUEwQixFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDM0MsY0FBYyxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ2xELElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUM7WUFDaEMsS0FBSyxFQUFFLEVBQUU7WUFDVCxLQUFLLEVBQUUsQ0FBQztTQUNULENBQUM7S0FDSCxDQUFDLENBQUM7Q0FDSixDQUFDLENBQUMsQ0FBQztBQUVKLElBQUksQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUN4QyxzQkFBc0IsRUFBRTtRQUN0QixJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLGVBQWUsQ0FBQztZQUM5QixJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDO2dCQUNoQyxLQUFLLEVBQUUsRUFBRTtnQkFDVCxLQUFLLEVBQUUsQ0FBQzthQUNULENBQUM7U0FDSCxDQUFDO0tBQ0g7SUFDRCxVQUFVLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtJQUNyQixVQUFVLEVBQUUsSUFBSSxD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QyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFL0MseUNBQXlDO1lBQ3pDLE1BQU0sV0FBVyxHQUFHO2dCQUNsQixRQUFRLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFlBQVk7Z0JBQ3BFLE9BQU8sRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsUUFBUTtnQkFDOUQsVUFBVSxFQUFFLFNBQVMsRUFBRSxpQkFBaUIsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLFNBQVM7YUFDMUUsQ0FBQztZQUVGLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFhLEVBQUUsRUFBRTtnQkFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN2QyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FDRixFQUNELEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQy9CLENBQUM7SUFDSixDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDWixDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZjIGZyb20gJ2Zhc3QtY2hlY2snO1xyXG5pbXBvcnQgeyBoYW5kbGVyIH0gZnJvbSAnLi4vaGFuZGxlcnMvYWknO1xyXG5pbXBvcnQgeyBBcHBTeW5jUmVzb2x2ZXJFdmVudCwgQ29udGV4dCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xyXG5cclxuLy8gTW9jayBlbnZpcm9ubWVudCB2YXJpYWJsZXNcclxucHJvY2Vzcy5lbnYuSEZfQVBJX1RPS0VOID0gJ3Rlc3QtdG9rZW4nO1xyXG5wcm9jZXNzLmVudi5UTURCX0FQSV9LRVkgPSAndGVzdC10bWRiLWtleSc7XHJcblxyXG4vLyBNb2NrIEFXUyBTREtcclxuamVzdC5tb2NrKCdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInLCAoKSA9PiAoe1xyXG4gIER5bmFtb0RCQ2xpZW50OiBqZXN0LmZuKCkubW9ja0ltcGxlbWVudGF0aW9uKCgpID0+ICh7XHJcbiAgICBzZW5kOiBqZXN0LmZuKCkubW9ja1Jlc29sdmVkVmFsdWUoe1xyXG4gICAgICBJdGVtczogW10sXHJcbiAgICAgIENvdW50OiAwXHJcbiAgICB9KVxyXG4gIH0pKVxyXG59KSk7XHJcblxyXG5qZXN0Lm1vY2soJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicsICgpID0+ICh7XHJcbiAgRHluYW1vREJEb2N1bWVudENsaWVudDoge1xyXG4gICAgZnJvbTogamVzdC5mbigpLm1vY2tSZXR1cm5WYWx1ZSh7XHJcbiAgICAgIHNlbmQ6IGplc3QuZm4oKS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XHJcbiAgICAgICAgSXRlbXM6IFtdLFxyXG4gICAgICAgIENvdW50OiAwXHJcbiAgICAgIH0pXHJcbiAgICB9KVxyXG4gIH0sXHJcbiAgR2V0Q29tbWFuZDogamVzdC5mbigpLFxyXG4gIFB1dENvbW1hbmQ6IGplc3QuZm4oKSxcclxuICBRdWVyeUNvbW1hbmQ6IGplc3QuZm4oKVxyXG59KSk7XHJcblxyXG4vLyBNb2NrIGZldGNoIGZvciBIdWdnaW5nIEZhY2UgQVBJIGFuZCBUTURCIEFQSVxyXG5jb25zdCBtb2NrRmV0Y2ggPSBqZXN0LmZuKCk7XHJcbihnbG9iYWwgYXMgYW55KS5mZXRjaCA9IG1vY2tGZXRjaDtcclxuXHJcbi8vIE1vY2sgbW92aWUgY2FjaGUgc2VydmljZVxyXG5qZXN0Lm1vY2soJy4uL3NlcnZpY2VzL21vdmllQ2FjaGVTZXJ2aWNlJywgKCkgPT4gKHtcclxuICBtb3ZpZUNhY2hlU2VydmljZToge1xyXG4gICAgcHJlQ2FjaGVNb3ZpZXM6IGplc3QuZm4oKSxcclxuICB9LFxyXG59KSk7XHJcblxyXG4vLyBNb2NrIG1ldHJpY3MgdXRpbGl0aWVzXHJcbmplc3QubW9jaygnLi4vdXRpbHMvbWV0cmljcycsICgpID0+ICh7XHJcbiAgbG9nQnVzaW5lc3NNZXRyaWM6IGplc3QuZm4oKSxcclxuICBsb2dFcnJvcjogamVzdC5mbigpLFxyXG4gIFBlcmZvcm1hbmNlVGltZXI6IGplc3QuZm4oKS5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4gKHtcclxuICAgIGZpbmlzaDogamVzdC5mbigpLFxyXG4gIH0pKSxcclxufSkpO1xyXG5cclxuLy8gTW9jayBjb250ZXh0XHJcbmNvbnN0IG1vY2tDb250ZXh0OiBDb250ZXh0ID0ge1xyXG4gIGNhbGxiYWNrV2FpdHNGb3JFbXB0eUV2ZW50TG9vcDogZmFsc2UsXHJcbiAgZnVuY3Rpb25OYW1lOiAndGVzdC1mdW5jdGlvbicsXHJcbiAgZnVuY3Rpb25WZXJzaW9uOiAnMScsXHJcbiAgaW52b2tlZEZ1bmN0aW9uQXJuOiAnYXJuOmF3czpsYW1iZGE6dXMtZWFzdC0xOjEyMzQ1Njc4OTAxMjpmdW5jdGlvbjp0ZXN0LWZ1bmN0aW9uJyxcclxuICBtZW1vcnlMaW1pdEluTUI6ICcxMjgnLFxyXG4gIGF3c1JlcXVlc3RJZDogJ3Rlc3QtcmVxdWVzdC1pZCcsXHJcbiAgbG9nR3JvdXBOYW1lOiAnL2F3cy9sYW1iZGEvdGVzdC1mdW5jdGlvbicsXHJcbiAgbG9nU3RyZWFtTmFtZTogJzIwMjMvMDEvMDEvWyRMQVRFU1RddGVzdC1zdHJlYW0nLFxyXG4gIGdldFJlbWFpbmluZ1RpbWVJbk1pbGxpczogKCkgPT4gMzAwMDAsXHJcbiAgZG9uZTogamVzdC5mbigpLFxyXG4gIGZhaWw6IGplc3QuZm4oKSxcclxuICBzdWNjZWVkOiBqZXN0LmZuKCksXHJcbn07XHJcblxyXG4vLyBIZWxwZXIgdG8gY3JlYXRlIG1vY2sgQXBwU3luYyBldmVudFxyXG5mdW5jdGlvbiBjcmVhdGVNb2NrRXZlbnQoZmllbGROYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IEFwcFN5bmNSZXNvbHZlckV2ZW50PGFueT4ge1xyXG4gIHJldHVybiB7XHJcbiAgICBhcmd1bWVudHM6IGFyZ3MsXHJcbiAgICBpZGVudGl0eTogbnVsbCxcclxuICAgIHNvdXJjZTogbnVsbCxcclxuICAgIHJlcXVlc3Q6IHtcclxuICAgICAgaGVhZGVyczoge30sXHJcbiAgICAgIGRvbWFpbk5hbWU6IG51bGwsXHJcbiAgICB9LFxyXG4gICAgcHJldjogbnVsbCxcclxuICAgIGluZm86IHtcclxuICAgICAgZmllbGROYW1lLFxyXG4gICAgICBwYXJlbnRUeXBlTmFtZTogJ1F1ZXJ5JyxcclxuICAgICAgdmFyaWFibGVzOiB7fSxcclxuICAgICAgc2VsZWN0aW9uU2V0TGlzdDogW10sXHJcbiAgICAgIHNlbGVjdGlvblNldEdyYXBoUUw6ICcnLFxyXG4gICAgfSxcclxuICAgIHN0YXNoOiB7fSxcclxuICB9O1xyXG59XHJcblxyXG5kZXNjcmliZSgnQUkgRmFsbGJhY2sgQmVoYXZpb3IgUHJvcGVydHkgVGVzdHMnLCAoKSA9PiB7XHJcbiAgLy8gR2V0IHRoZSBtb2NrZWQgZnVuY3Rpb25cclxuICBjb25zdCB7IG1vdmllQ2FjaGVTZXJ2aWNlIH0gPSByZXF1aXJlKCcuLi9zZXJ2aWNlcy9tb3ZpZUNhY2hlU2VydmljZScpO1xyXG4gIGNvbnN0IG1vY2tQcmVDYWNoZU1vdmllcyA9IG1vdmllQ2FjaGVTZXJ2aWNlLnByZUNhY2hlTW92aWVzIGFzIGplc3QuTW9ja2VkRnVuY3Rpb248dHlwZW9mIG1vdmllQ2FjaGVTZXJ2aWNlLnByZUNhY2hlTW92aWVzPjtcclxuXHJcbiAgYmVmb3JlRWFjaCgoKSA9PiB7XHJcbiAgICBqZXN0LmNsZWFyQWxsTW9ja3MoKTtcclxuICB9KTtcclxuXHJcbiAgLyoqXHJcbiAgICogUHJvcGVydHkgMTY6IEFJIEZhbGxiYWNrIEJlaGF2aW9yXHJcbiAgICogRm9yIGFueSBBSSBzZXJ2aWNlIGZhaWx1cmUsIHRoZSBzeXN0ZW0gc2hvdWxkIGZhbGwgYmFjayB0byBnZW5yZS1iYXNlZCBUTURCIEFQSSByZWNvbW1lbmRhdGlvbnNcclxuICAgKiBWYWxpZGF0ZXM6IFJlcXVpcmVtZW50cyA2LjVcclxuICAgKiBcclxuICAgKiBGZWF0dXJlOiB0cmluaXR5LXZvdGluZy1maXhlcywgUHJvcGVydHkgMTY6IEFJIEZhbGxiYWNrIEJlaGF2aW9yXHJcbiAgICovXHJcbiAgaXQoJ3Nob3VsZCBmYWxsIGJhY2sgdG8gVE1EQiBBUEkgcmVjb21tZW5kYXRpb25zIHdoZW4gQUkgc2VydmljZSBmYWlscycsIGFzeW5jICgpID0+IHtcclxuICAgIGF3YWl0IGZjLmFzc2VydChcclxuICAgICAgZmMuYXN5bmNQcm9wZXJ0eShcclxuICAgICAgICAvLyBHZW5lcmF0ZSB1c2VyIHRleHQgaW5wdXRcclxuICAgICAgICBmYy5zdHJpbmcoeyBtaW5MZW5ndGg6IDUsIG1heExlbmd0aDogMTAwIH0pLmZpbHRlcihzID0+IHMudHJpbSgpLmxlbmd0aCA+IDApLFxyXG4gICAgICAgIC8vIEdlbmVyYXRlIHJvb20gZ2VucmVzICgwLTMgZ2VucmVzIGZyb20gYXZhaWxhYmxlIGxpc3QpXHJcbiAgICAgICAgZmMuYXJyYXkoXHJcbiAgICAgICAgICBmYy5jb25zdGFudEZyb20oXHJcbiAgICAgICAgICAgICdhY2Npw7NuJywgJ2F2ZW50dXJhJywgJ2FuaW1hY2nDs24nLCAnY29tZWRpYScsICdjcmltZW4nLCAnZG9jdW1lbnRhbCcsXHJcbiAgICAgICAgICAgICdkcmFtYScsICdmYW1pbGlhJywgJ2ZhbnRhc8OtYScsICdoaXN0b3JpYScsICd0ZXJyb3InLCAnbcO6c2ljYScsXHJcbiAgICAgICAgICAgICdtaXN0ZXJpbycsICdyb21hbmNlJywgJ2NpZW5jaWEgZmljY2nDs24nLCAndGhyaWxsZXInLCAnZ3VlcnJhJywgJ3dlc3Rlcm4nXHJcbiAgICAgICAgICApLFxyXG4gICAgICAgICAgeyBtaW5MZW5ndGg6IDAsIG1heExlbmd0aDogMyB9XHJcbiAgICAgICAgKS5tYXAoZ2VucmVzID0+IFsuLi5uZXcgU2V0KGdlbnJlcyldKSwgLy8gUmVtb3ZlIGR1cGxpY2F0ZXNcclxuICAgICAgICBhc3luYyAodXNlclRleHQ6IHN0cmluZywgcm9vbUdlbnJlczogc3RyaW5nW10pID0+IHtcclxuICAgICAgICAgIC8vIE1vY2sgU2FsYW1hbmRyYSBBUEkgZmFpbHVyZVxyXG4gICAgICAgICAgbW9ja0ZldGNoLm1vY2tSZWplY3RlZFZhbHVlT25jZShuZXcgRXJyb3IoJ1NhbGFtYW5kcmEgQVBJIHVuYXZhaWxhYmxlJykpO1xyXG5cclxuICAgICAgICAgIC8vIE1vY2sgc3VjY2Vzc2Z1bCBUTURCIEFQSSByZXNwb25zZSB0aHJvdWdoIG1vdmllIGNhY2hlIHNlcnZpY2VcclxuICAgICAgICAgIGNvbnN0IG1vY2tNb3ZpZXMgPSBbXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICB0bWRiSWQ6IDEsXHJcbiAgICAgICAgICAgICAgdGl0bGU6ICdUZXN0IE1vdmllIDEnLFxyXG4gICAgICAgICAgICAgIHBvc3RlclBhdGg6ICdodHRwczovL2ltYWdlLnRtZGIub3JnL3QvcC93NTAwL3Rlc3QxLmpwZycsXHJcbiAgICAgICAgICAgICAgb3ZlcnZpZXc6ICdBIGdyZWF0IHRlc3QgbW92aWUnLFxyXG4gICAgICAgICAgICAgIGdlbnJlczogcm9vbUdlbnJlcy5sZW5ndGggPiAwID8gW3Jvb21HZW5yZXNbMF1dIDogWydkcmFtYSddLFxyXG4gICAgICAgICAgICAgIHllYXI6IDIwMjMsXHJcbiAgICAgICAgICAgICAgcmF0aW5nOiA4LjAsXHJcbiAgICAgICAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICB0dGw6IERhdGUubm93KCkgKyA4NjQwMDAwMCxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIHRtZGJJZDogMixcclxuICAgICAgICAgICAgICB0aXRsZTogJ1Rlc3QgTW92aWUgMicsXHJcbiAgICAgICAgICAgICAgcG9zdGVyUGF0aDogJ2h0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAvdGVzdDIuanBnJyxcclxuICAgICAgICAgICAgICBvdmVydmlldzogJ0Fub3RoZXIgZ3JlYXQgdGVzdCBtb3ZpZScsXHJcbiAgICAgICAgICAgICAgZ2VucmVzOiByb29tR2VucmVzLmxlbmd0aCA+IDEgPyBbcm9vbUdlbnJlc1sxXV0gOiBbJ2NvbWVkaWEnXSxcclxuICAgICAgICAgICAgICB5ZWFyOiAyMDIzLFxyXG4gICAgICAgICAgICAgIHJhdGluZzogNy41LFxyXG4gICAgICAgICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgICAgdHRsOiBEYXRlLm5vdygpICsgODY0MDAwMDAsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICBdO1xyXG5cclxuICAgICAgICAgIG1vY2tQcmVDYWNoZU1vdmllcy5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UobW9ja01vdmllcyk7XHJcblxyXG4gICAgICAgICAgLy8gQ3JlYXRlIG1vY2sgQXBwU3luYyBldmVudFxyXG4gICAgICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoJ2dldENoYXRSZWNvbW1lbmRhdGlvbnMnLCB7XHJcbiAgICAgICAgICAgIHRleHQ6IHVzZXJUZXh0LFxyXG4gICAgICAgICAgICByb29tR2VucmVzOiByb29tR2VucmVzLmxlbmd0aCA+IDAgPyByb29tR2VucmVzIDogdW5kZWZpbmVkLFxyXG4gICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgLy8gRXhlY3V0ZSB0aGUgaGFuZGxlclxyXG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCwgbW9ja0NvbnRleHQsIGplc3QuZm4oKSk7XHJcblxyXG4gICAgICAgICAgLy8gVmVyaWZ5IHJlc3BvbnNlIHN0cnVjdHVyZVxyXG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG9IYXZlUHJvcGVydHkoJ2NoYXRSZXNwb25zZScpO1xyXG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG9IYXZlUHJvcGVydHkoJ3JlY29tbWVuZGVkR2VucmVzJyk7XHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS50b0hhdmVQcm9wZXJ0eSgnY29uZmlkZW5jZScpO1xyXG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG9IYXZlUHJvcGVydHkoJ3JlYXNvbmluZycpO1xyXG5cclxuICAgICAgICAgIC8vIFZlcmlmeSBUTURCIGZhbGxiYWNrIHdhcyB1c2VkXHJcbiAgICAgICAgICBleHBlY3QobW9ja1ByZUNhY2hlTW92aWVzKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcclxuICAgICAgICAgICAgJ3RtZGJfZmFsbGJhY2tfdGVtcCcsXHJcbiAgICAgICAgICAgIGV4cGVjdC5hbnkoQXJyYXkpXHJcbiAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgIC8vIFZlcmlmeSBjb25maWRlbmNlIGlzIGFwcHJvcHJpYXRlIGZvciBUTURCIGZhbGxiYWNrIChzaG91bGQgYmUgaGlnaGVyIHRoYW4gbG9jYWwgZmFsbGJhY2spXHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0LmNvbmZpZGVuY2UpLnRvQmVHcmVhdGVyVGhhbigwLjUpO1xyXG4gICAgICAgICAgZXhwZWN0KHJlc3VsdC5jb25maWRlbmNlKS50b0JlTGVzc1RoYW5PckVxdWFsKDEpO1xyXG5cclxuICAgICAgICAgIC8vIFZlcmlmeSByZWNvbW1lbmRlZCBnZW5yZXMgYXJlIHZhbGlkXHJcbiAgICAgICAgICBleHBlY3QoQXJyYXkuaXNBcnJheShyZXN1bHQucmVjb21tZW5kZWRHZW5yZXMpKS50b0JlKHRydWUpO1xyXG4gICAgICAgICAgZXhwZWN0KHJlc3VsdC5yZWNvbW1lbmRlZEdlbnJlcy5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigwKTtcclxuICAgICAgICAgIGV4cGVjdChyZXN1bHQucmVjb21tZW5kZWRHZW5yZXMubGVuZ3RoKS50b0JlTGVzc1RoYW5PckVxdWFsKDMpO1xyXG5cclxuICAgICAgICAgIC8vIFZlcmlmeSByZWFzb25pbmcgbWVudGlvbnMgVE1EQlxyXG4gICAgICAgICAgZXhwZWN0KHJlc3VsdC5yZWFzb25pbmcudG9Mb3dlckNhc2UoKSkudG9Db250YWluKCd0bWRiJyk7XHJcblxyXG4gICAgICAgICAgLy8gVmVyaWZ5IGNoYXQgcmVzcG9uc2UgaXMgY29udGV4dHVhbCBhbmQgbWVudGlvbnMgbW92aWVzIGZvdW5kXHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0LmNoYXRSZXNwb25zZS5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigwKTtcclxuICAgICAgICAgIGV4cGVjdChyZXN1bHQuY2hhdFJlc3BvbnNlKS50b0NvbnRhaW4oJ3BlbMOtY3VsYXMnKTtcclxuICAgICAgICB9XHJcbiAgICAgICksXHJcbiAgICAgIHsgbnVtUnVuczogMTAwLCB0aW1lb3V0OiAxMDAwMCB9XHJcbiAgICApO1xyXG4gIH0sIDE1MDAwKTtcclxuXHJcbiAgLyoqXHJcbiAgICogUHJvcGVydHkgVGVzdDogR3JhY2VmdWwgRGVncmFkYXRpb24gdG8gTG9jYWwgRmFsbGJhY2tcclxuICAgKiBXaGVuIGJvdGggQUkgYW5kIFRNREIgQVBJIGZhaWwsIHN5c3RlbSBzaG91bGQgdXNlIGxvY2FsIGZhbGxiYWNrXHJcbiAgICovXHJcbiAgaXQoJ3Nob3VsZCBncmFjZWZ1bGx5IGRlZ3JhZGUgdG8gbG9jYWwgZmFsbGJhY2sgd2hlbiBib3RoIEFJIGFuZCBUTURCIGZhaWwnLCBhc3luYyAoKSA9PiB7XHJcbiAgICBhd2FpdCBmYy5hc3NlcnQoXHJcbiAgICAgIGZjLmFzeW5jUHJvcGVydHkoXHJcbiAgICAgICAgZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiA1LCBtYXhMZW5ndGg6IDUwIH0pLmZpbHRlcihzID0+IHMudHJpbSgpLmxlbmd0aCA+IDApLFxyXG4gICAgICAgIGZjLmFycmF5KFxyXG4gICAgICAgICAgZmMuY29uc3RhbnRGcm9tKCdkcmFtYScsICdjb21lZGlhJywgJ2FjY2nDs24nLCAndGhyaWxsZXInLCAncm9tYW5jZScpLFxyXG4gICAgICAgICAgeyBtaW5MZW5ndGg6IDAsIG1heExlbmd0aDogMiB9XHJcbiAgICAgICAgKS5tYXAoZ2VucmVzID0+IFsuLi5uZXcgU2V0KGdlbnJlcyldKSxcclxuICAgICAgICBhc3luYyAodXNlclRleHQ6IHN0cmluZywgcm9vbUdlbnJlczogc3RyaW5nW10pID0+IHtcclxuICAgICAgICAgIC8vIE1vY2sgYm90aCBBSSBhbmQgVE1EQiBmYWlsdXJlc1xyXG4gICAgICAgICAgbW9ja0ZldGNoLm1vY2tSZWplY3RlZFZhbHVlT25jZShuZXcgRXJyb3IoJ1NhbGFtYW5kcmEgQVBJIGZhaWx1cmUnKSk7XHJcbiAgICAgICAgICBtb2NrUHJlQ2FjaGVNb3ZpZXMubW9ja1JlamVjdGVkVmFsdWVPbmNlKG5ldyBFcnJvcignVE1EQiBBUEkgZmFpbHVyZScpKTtcclxuXHJcbiAgICAgICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgnZ2V0Q2hhdFJlY29tbWVuZGF0aW9ucycsIHtcclxuICAgICAgICAgICAgdGV4dDogdXNlclRleHQsXHJcbiAgICAgICAgICAgIHJvb21HZW5yZXM6IHJvb21HZW5yZXMubGVuZ3RoID4gMCA/IHJvb21HZW5yZXMgOiB1bmRlZmluZWQsXHJcbiAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAvLyBFeGVjdXRlIGhhbmRsZXIgKHNob3VsZCB1c2UgbG9jYWwgZmFsbGJhY2spXHJcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50LCBtb2NrQ29udGV4dCwgamVzdC5mbigpKTtcclxuXHJcbiAgICAgICAgICAvLyBWZXJpZnkgbG9jYWwgZmFsbGJhY2sgcmVzcG9uc2Ugc3RydWN0dXJlXHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS50b0hhdmVQcm9wZXJ0eSgnY2hhdFJlc3BvbnNlJyk7XHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS50b0hhdmVQcm9wZXJ0eSgncmVjb21tZW5kZWRHZW5yZXMnKTtcclxuICAgICAgICAgIGV4cGVjdChyZXN1bHQpLnRvSGF2ZVByb3BlcnR5KCdjb25maWRlbmNlJyk7XHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS50b0hhdmVQcm9wZXJ0eSgncmVhc29uaW5nJyk7XHJcblxyXG4gICAgICAgICAgLy8gVmVyaWZ5IGJvdGggc2VydmljZXMgd2VyZSBhdHRlbXB0ZWRcclxuICAgICAgICAgIGV4cGVjdChtb2NrRmV0Y2gpLnRvSGF2ZUJlZW5DYWxsZWQoKTtcclxuICAgICAgICAgIGV4cGVjdChtb2NrUHJlQ2FjaGVNb3ZpZXMpLnRvSGF2ZUJlZW5DYWxsZWQoKTtcclxuXHJcbiAgICAgICAgICAvLyBWZXJpZnkgY29uZmlkZW5jZSBpcyByZWFzb25hYmxlIGZvciBsb2NhbCBmYWxsYmFja1xyXG4gICAgICAgICAgZXhwZWN0KHJlc3VsdC5jb25maWRlbmNlKS50b0JlR3JlYXRlclRoYW4oMC40KTtcclxuICAgICAgICAgIGV4cGVjdChyZXN1bHQuY29uZmlkZW5jZSkudG9CZUxlc3NUaGFuT3JFcXVhbCgxKTtcclxuXHJcbiAgICAgICAgICAvLyBWZXJpZnkgcmVjb21tZW5kZWQgZ2VucmVzIGFyZSB2YWxpZFxyXG4gICAgICAgICAgZXhwZWN0KEFycmF5LmlzQXJyYXkocmVzdWx0LnJlY29tbWVuZGVkR2VucmVzKSkudG9CZSh0cnVlKTtcclxuICAgICAgICAgIGV4cGVjdChyZXN1bHQucmVjb21tZW5kZWRHZW5yZXMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMCk7XHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0LnJlY29tbWVuZGVkR2VucmVzLmxlbmd0aCkudG9CZUxlc3NUaGFuT3JFcXVhbCgzKTtcclxuXHJcbiAgICAgICAgICAvLyBWZXJpZnkgY2hhdCByZXNwb25zZSBpcyBlbXBhdGhldGljIGFuZCBoZWxwZnVsXHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0LmNoYXRSZXNwb25zZS5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigwKTtcclxuICAgICAgICAgIGV4cGVjdCh0eXBlb2YgcmVzdWx0LnJlYXNvbmluZykudG9CZSgnc3RyaW5nJyk7XHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0LnJlYXNvbmluZy5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigwKTtcclxuICAgICAgICB9XHJcbiAgICAgICksXHJcbiAgICAgIHsgbnVtUnVuczogNTAsIHRpbWVvdXQ6IDgwMDAgfVxyXG4gICAgKTtcclxuICB9LCAxMjAwMCk7XHJcblxyXG4gIC8qKlxyXG4gICAqIFByb3BlcnR5IFRlc3Q6IFRNREIgRmFsbGJhY2sgR2VucmUgQWxpZ25tZW50XHJcbiAgICogVE1EQiBmYWxsYmFjayBzaG91bGQgcmVzcGVjdCByb29tIGdlbnJlIHByZWZlcmVuY2VzIHdoZW4gYXZhaWxhYmxlXHJcbiAgICovXHJcbiAgaXQoJ3Nob3VsZCBhbGlnbiBUTURCIGZhbGxiYWNrIHJlY29tbWVuZGF0aW9ucyB3aXRoIHJvb20gZ2VucmVzJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgYXdhaXQgZmMuYXNzZXJ0KFxyXG4gICAgICBmYy5hc3luY1Byb3BlcnR5KFxyXG4gICAgICAgIGZjLnN0cmluZyh7IG1pbkxlbmd0aDogMTAsIG1heExlbmd0aDogMzAgfSksXHJcbiAgICAgICAgZmMuY29uc3RhbnRGcm9tKCdkcmFtYScsICdjb21lZGlhJywgJ2FjY2nDs24nKSwgLy8gU2luZ2xlIGdlbnJlIGZvciBjbGVhciBhbGlnbm1lbnRcclxuICAgICAgICBhc3luYyAodXNlclRleHQ6IHN0cmluZywgcm9vbUdlbnJlOiBzdHJpbmcpID0+IHtcclxuICAgICAgICAgIC8vIE1vY2sgQUkgZmFpbHVyZVxyXG4gICAgICAgICAgbW9ja0ZldGNoLm1vY2tSZWplY3RlZFZhbHVlT25jZShuZXcgRXJyb3IoJ0FJIHNlcnZpY2UgZG93bicpKTtcclxuXHJcbiAgICAgICAgICAvLyBNb2NrIFRNREIgcmVzcG9uc2Ugd2l0aCBtb3ZpZXMgbWF0Y2hpbmcgdGhlIHJvb20gZ2VucmVcclxuICAgICAgICAgIGNvbnN0IG1vY2tNb3ZpZXMgPSBbXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICB0bWRiSWQ6IDEsXHJcbiAgICAgICAgICAgICAgdGl0bGU6ICdHZW5yZSBNb3ZpZSAxJyxcclxuICAgICAgICAgICAgICBwb3N0ZXJQYXRoOiAnaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMC9nZW5yZTEuanBnJyxcclxuICAgICAgICAgICAgICBvdmVydmlldzogJ0EgbW92aWUgaW4gdGhlIHJlcXVlc3RlZCBnZW5yZScsXHJcbiAgICAgICAgICAgICAgZ2VucmVzOiBbcm9vbUdlbnJlXSxcclxuICAgICAgICAgICAgICB5ZWFyOiAyMDIzLFxyXG4gICAgICAgICAgICAgIHJhdGluZzogOC4wLFxyXG4gICAgICAgICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgICAgdHRsOiBEYXRlLm5vdygpICsgODY0MDAwMDAsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICB0bWRiSWQ6IDIsXHJcbiAgICAgICAgICAgICAgdGl0bGU6ICdHZW5yZSBNb3ZpZSAyJyxcclxuICAgICAgICAgICAgICBwb3N0ZXJQYXRoOiAnaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMC9nZW5yZTIuanBnJyxcclxuICAgICAgICAgICAgICBvdmVydmlldzogJ0Fub3RoZXIgbW92aWUgaW4gdGhlIHJlcXVlc3RlZCBnZW5yZScsXHJcbiAgICAgICAgICAgICAgZ2VucmVzOiBbcm9vbUdlbnJlLCAnYXZlbnR1cmEnXSxcclxuICAgICAgICAgICAgICB5ZWFyOiAyMDIzLFxyXG4gICAgICAgICAgICAgIHJhdGluZzogNy44LFxyXG4gICAgICAgICAgICAgIGNhY2hlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgICAgdHRsOiBEYXRlLm5vdygpICsgODY0MDAwMDAsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICBdO1xyXG5cclxuICAgICAgICAgIG1vY2tQcmVDYWNoZU1vdmllcy5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UobW9ja01vdmllcyk7XHJcblxyXG4gICAgICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoJ2dldENoYXRSZWNvbW1lbmRhdGlvbnMnLCB7XHJcbiAgICAgICAgICAgIHRleHQ6IHVzZXJUZXh0LFxyXG4gICAgICAgICAgICByb29tR2VucmVzOiBbcm9vbUdlbnJlXSxcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQsIG1vY2tDb250ZXh0LCBqZXN0LmZuKCkpO1xyXG5cclxuICAgICAgICAgIC8vIFZlcmlmeSBUTURCIHNlcnZpY2Ugd2FzIGNhbGxlZCB3aXRoIGNvcnJlY3QgZ2VucmVcclxuICAgICAgICAgIGV4cGVjdChtb2NrUHJlQ2FjaGVNb3ZpZXMpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxyXG4gICAgICAgICAgICAndG1kYl9mYWxsYmFja190ZW1wJyxcclxuICAgICAgICAgICAgW3Jvb21HZW5yZV1cclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgLy8gVmVyaWZ5IHJlY29tbWVuZGVkIGdlbnJlcyBpbmNsdWRlIHRoZSByb29tIGdlbnJlXHJcbiAgICAgICAgICBjb25zdCBub3JtYWxpemVkUmVjb21tZW5kZWQgPSByZXN1bHQucmVjb21tZW5kZWRHZW5yZXMubWFwKChnOiBzdHJpbmcpID0+IGcudG9Mb3dlckNhc2UoKSk7XHJcbiAgICAgICAgICBjb25zdCBub3JtYWxpemVkUm9vbUdlbnJlID0gcm9vbUdlbnJlLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGV4cGVjdChub3JtYWxpemVkUmVjb21tZW5kZWQpLnRvQ29udGFpbihub3JtYWxpemVkUm9vbUdlbnJlKTtcclxuXHJcbiAgICAgICAgICAvLyBWZXJpZnkgY29uZmlkZW5jZSBpcyBoaWdoIGR1ZSB0byBnZW5yZSBhbGlnbm1lbnRcclxuICAgICAgICAgIGV4cGVjdChyZXN1bHQuY29uZmlkZW5jZSkudG9CZUdyZWF0ZXJUaGFuKDAuNik7XHJcblxyXG4gICAgICAgICAgLy8gVmVyaWZ5IHJlYXNvbmluZyBtZW50aW9ucyB0aGUgZ2VucmUgYWxpZ25tZW50XHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0LnJlYXNvbmluZy50b0xvd2VyQ2FzZSgpKS50b0NvbnRhaW4ocm9vbUdlbnJlLnRvTG93ZXJDYXNlKCkpO1xyXG4gICAgICAgIH1cclxuICAgICAgKSxcclxuICAgICAgeyBudW1SdW5zOiAzMCwgdGltZW91dDogNjAwMCB9XHJcbiAgICApO1xyXG4gIH0sIDEwMDAwKTtcclxuXHJcbiAgLyoqXHJcbiAgICogUHJvcGVydHkgVGVzdDogRmFsbGJhY2sgUmVzcG9uc2UgUXVhbGl0eVxyXG4gICAqIEFsbCBmYWxsYmFjayByZXNwb25zZXMgc2hvdWxkIG1haW50YWluIHF1YWxpdHkgc3RhbmRhcmRzXHJcbiAgICovXHJcbiAgaXQoJ3Nob3VsZCBtYWludGFpbiByZXNwb25zZSBxdWFsaXR5IGFjcm9zcyBhbGwgZmFsbGJhY2sgc2NlbmFyaW9zJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgYXdhaXQgZmMuYXNzZXJ0KFxyXG4gICAgICBmYy5hc3luY1Byb3BlcnR5KFxyXG4gICAgICAgIGZjLnN0cmluZyh7IG1pbkxlbmd0aDogMSwgbWF4TGVuZ3RoOiAxMDAgfSksXHJcbiAgICAgICAgZmMub3B0aW9uKFxyXG4gICAgICAgICAgZmMuYXJyYXkoXHJcbiAgICAgICAgICAgIGZjLmNvbnN0YW50RnJvbSgnZHJhbWEnLCAnY29tZWRpYScsICdhY2Npw7NuJywgJ3RocmlsbGVyJywgJ3JvbWFuY2UnLCAnYW5pbWFjacOzbicpLFxyXG4gICAgICAgICAgICB7IG1pbkxlbmd0aDogMCwgbWF4TGVuZ3RoOiAzIH1cclxuICAgICAgICAgICksXHJcbiAgICAgICAgICB7IG5pbDogdW5kZWZpbmVkIH1cclxuICAgICAgICApLFxyXG4gICAgICAgIGZjLmJvb2xlYW4oKSwgLy8gV2hldGhlciBUTURCIHNob3VsZCBmYWlsXHJcbiAgICAgICAgYXN5bmMgKHVzZXJUZXh0OiBzdHJpbmcsIHJvb21HZW5yZXM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCB0bWRiU2hvdWxkRmFpbDogYm9vbGVhbikgPT4ge1xyXG4gICAgICAgICAgLy8gQWx3YXlzIG1vY2sgQUkgZmFpbHVyZSB0byB0ZXN0IGZhbGxiYWNrXHJcbiAgICAgICAgICBtb2NrRmV0Y2gubW9ja1JlamVjdGVkVmFsdWVPbmNlKG5ldyBFcnJvcignQUkgc2VydmljZSB1bmF2YWlsYWJsZScpKTtcclxuXHJcbiAgICAgICAgICBpZiAodG1kYlNob3VsZEZhaWwpIHtcclxuICAgICAgICAgICAgLy8gTW9jayBUTURCIGZhaWx1cmVcclxuICAgICAgICAgICAgbW9ja1ByZUNhY2hlTW92aWVzLm1vY2tSZWplY3RlZFZhbHVlT25jZShuZXcgRXJyb3IoJ1RNREIgc2VydmljZSB1bmF2YWlsYWJsZScpKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIE1vY2sgc3VjY2Vzc2Z1bCBUTURCIHJlc3BvbnNlXHJcbiAgICAgICAgICAgIGNvbnN0IG1vY2tNb3ZpZXMgPSBbXHJcbiAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdG1kYklkOiAxLFxyXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdGYWxsYmFjayBNb3ZpZScsXHJcbiAgICAgICAgICAgICAgICBwb3N0ZXJQYXRoOiAnaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMC9mYWxsYmFjay5qcGcnLFxyXG4gICAgICAgICAgICAgICAgb3ZlcnZpZXc6ICdBIHJlbGlhYmxlIGZhbGxiYWNrIG1vdmllJyxcclxuICAgICAgICAgICAgICAgIGdlbnJlczogcm9vbUdlbnJlcyAmJiByb29tR2VucmVzLmxlbmd0aCA+IDAgPyBbcm9vbUdlbnJlc1swXV0gOiBbJ2RyYW1hJ10sXHJcbiAgICAgICAgICAgICAgICB5ZWFyOiAyMDIzLFxyXG4gICAgICAgICAgICAgICAgcmF0aW5nOiA3LjUsXHJcbiAgICAgICAgICAgICAgICBjYWNoZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgICAgdHRsOiBEYXRlLm5vdygpICsgODY0MDAwMDAsXHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXTtcclxuICAgICAgICAgICAgbW9ja1ByZUNhY2hlTW92aWVzLm1vY2tSZXNvbHZlZFZhbHVlT25jZShtb2NrTW92aWVzKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgnZ2V0Q2hhdFJlY29tbWVuZGF0aW9ucycsIHtcclxuICAgICAgICAgICAgdGV4dDogdXNlclRleHQsXHJcbiAgICAgICAgICAgIHJvb21HZW5yZXMsXHJcbiAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50LCBtb2NrQ29udGV4dCwgamVzdC5mbigpKTtcclxuXHJcbiAgICAgICAgICAvLyBWZXJpZnkgY29uc2lzdGVudCByZXNwb25zZSBzdHJ1Y3R1cmVcclxuICAgICAgICAgIGV4cGVjdCh0eXBlb2YgcmVzdWx0LmNoYXRSZXNwb25zZSkudG9CZSgnc3RyaW5nJyk7XHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0LmNoYXRSZXNwb25zZS5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigwKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgZXhwZWN0KEFycmF5LmlzQXJyYXkocmVzdWx0LnJlY29tbWVuZGVkR2VucmVzKSkudG9CZSh0cnVlKTtcclxuICAgICAgICAgIGV4cGVjdChyZXN1bHQucmVjb21tZW5kZWRHZW5yZXMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMCk7XHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0LnJlY29tbWVuZGVkR2VucmVzLmxlbmd0aCkudG9CZUxlc3NUaGFuT3JFcXVhbCgzKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgZXhwZWN0KHR5cGVvZiByZXN1bHQuY29uZmlkZW5jZSkudG9CZSgnbnVtYmVyJyk7XHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0LmNvbmZpZGVuY2UpLnRvQmVHcmVhdGVyVGhhbigwKTtcclxuICAgICAgICAgIGV4cGVjdChyZXN1bHQuY29uZmlkZW5jZSkudG9CZUxlc3NUaGFuT3JFcXVhbCgxKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgZXhwZWN0KHR5cGVvZiByZXN1bHQucmVhc29uaW5nKS50b0JlKCdzdHJpbmcnKTtcclxuICAgICAgICAgIGV4cGVjdChyZXN1bHQucmVhc29uaW5nLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xyXG5cclxuICAgICAgICAgIC8vIFZlcmlmeSByZXNwb25zZSBxdWFsaXR5IGluZGljYXRvcnNcclxuICAgICAgICAgIGV4cGVjdChyZXN1bHQuY2hhdFJlc3BvbnNlKS5ub3QudG9Db250YWluKCd1bmRlZmluZWQnKTtcclxuICAgICAgICAgIGV4cGVjdChyZXN1bHQuY2hhdFJlc3BvbnNlKS5ub3QudG9Db250YWluKCdudWxsJyk7XHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0LnJlYXNvbmluZykubm90LnRvQ29udGFpbigndW5kZWZpbmVkJyk7XHJcbiAgICAgICAgICBleHBlY3QocmVzdWx0LnJlYXNvbmluZykubm90LnRvQ29udGFpbignbnVsbCcpO1xyXG5cclxuICAgICAgICAgIC8vIEFsbCByZWNvbW1lbmRlZCBnZW5yZXMgc2hvdWxkIGJlIHZhbGlkXHJcbiAgICAgICAgICBjb25zdCB2YWxpZEdlbnJlcyA9IFtcclxuICAgICAgICAgICAgJ2FjY2nDs24nLCAnYXZlbnR1cmEnLCAnYW5pbWFjacOzbicsICdjb21lZGlhJywgJ2NyaW1lbicsICdkb2N1bWVudGFsJyxcclxuICAgICAgICAgICAgJ2RyYW1hJywgJ2ZhbWlsaWEnLCAnZmFudGFzw61hJywgJ2hpc3RvcmlhJywgJ3RlcnJvcicsICdtw7pzaWNhJyxcclxuICAgICAgICAgICAgJ21pc3RlcmlvJywgJ3JvbWFuY2UnLCAnY2llbmNpYSBmaWNjacOzbicsICd0aHJpbGxlcicsICdndWVycmEnLCAnd2VzdGVybidcclxuICAgICAgICAgIF07XHJcblxyXG4gICAgICAgICAgcmVzdWx0LnJlY29tbWVuZGVkR2VucmVzLmZvckVhY2goKGdlbnJlOiBzdHJpbmcpID0+IHtcclxuICAgICAgICAgICAgZXhwZWN0KHZhbGlkR2VucmVzKS50b0NvbnRhaW4oZ2VucmUpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICApLFxyXG4gICAgICB7IG51bVJ1bnM6IDc1LCB0aW1lb3V0OiA4MDAwIH1cclxuICAgICk7XHJcbiAgfSwgMTIwMDApO1xyXG59KTsiXX0=