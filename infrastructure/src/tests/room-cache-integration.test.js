"use strict";
/**
 * Integration tests for Room Handler and Movie Cache Service
 * Tests the integration between room creation and movie pre-caching
 */
Object.defineProperty(exports, "__esModule", { value: true });
// Mock DynamoDB first
const mockSend = jest.fn();
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBClient: jest.fn(),
    DynamoDBDocumentClient: {
        from: jest.fn(() => ({
            send: mockSend,
        })),
    },
    PutCommand: jest.fn((params) => ({ params })),
    GetCommand: jest.fn((params) => ({ params })),
    QueryCommand: jest.fn((params) => ({ params })),
    UpdateCommand: jest.fn((params) => ({ params })),
}));
// Mock other dependencies
jest.mock('../utils/metrics', () => ({
    logBusinessMetric: jest.fn(),
    logError: jest.fn(),
    PerformanceTimer: jest.fn().mockImplementation(() => ({
        finish: jest.fn(),
    })),
}));
jest.mock('../services/deepLinkService', () => ({
    deepLinkService: {
        generateInviteLink: jest.fn(),
        validateInviteCode: jest.fn(),
        handleDeepLink: jest.fn(),
    },
}));
jest.mock('../services/movieCacheService', () => ({
    movieCacheService: {
        preCacheMovies: jest.fn(),
        validateGenres: jest.fn(),
        getCachedMovies: jest.fn(),
        refreshCache: jest.fn(),
        getAvailableGenres: jest.fn(),
        getCacheStats: jest.fn(),
    },
}));
const room_1 = require("../handlers/room");
const movieCacheService_1 = require("../services/movieCacheService");
const deepLinkService_1 = require("../services/deepLinkService");
const mockMovieCacheService = movieCacheService_1.movieCacheService;
const mockDeepLinkService = deepLinkService_1.deepLinkService;
// Mock Lambda context
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
describe('Room Handler - Movie Cache Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Setup environment variables
        process.env.ROOMS_TABLE = 'test-rooms-table';
        process.env.ROOM_MEMBERS_TABLE = 'test-room-members-table';
        process.env.MOVIE_CACHE_TABLE = 'test-movie-cache-table';
        // Mock successful DynamoDB operations
        mockSend.mockResolvedValue({ Item: null });
        // Mock DeepLinkService
        mockDeepLinkService.generateInviteLink.mockResolvedValue({
            code: 'ABC123',
            url: 'https://trinity.app/room/ABC123',
            roomId: 'test-room-id',
            createdBy: 'test-host-id',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            isActive: true,
            usageCount: 0,
            maxUsage: undefined,
        });
        // Mock MovieCacheService
        mockMovieCacheService.validateGenres.mockReturnValue({
            valid: ['Action', 'Comedy'],
            invalid: [],
        });
        mockMovieCacheService.preCacheMovies.mockResolvedValue([
            {
                tmdbId: 550,
                title: 'Fight Club',
                posterPath: 'https://image.tmdb.org/t/p/w500/poster.jpg',
                overview: 'A movie about fighting',
                genres: ['Action', 'Drama'],
                year: 1999,
                rating: 8.8,
                cachedAt: new Date().toISOString(),
                ttl: Date.now() + 24 * 60 * 60 * 1000,
            },
        ]);
    });
    describe('createRoom with genre preferences', () => {
        it('should create room and trigger movie pre-caching with genres', async () => {
            const event = {
                info: { fieldName: 'createRoom' },
                identity: { sub: 'test-host-id' },
                arguments: {
                    input: {
                        name: 'Action Comedy Room',
                        description: 'A room for action and comedy movies',
                        genrePreferences: ['Action', 'Comedy', 'InvalidGenre'],
                        isPrivate: false,
                        maxMembers: 10,
                    },
                },
            };
            const result = await (0, room_1.handler)(event, mockContext, {});
            // Verify room was created with correct properties
            expect(result).toMatchObject({
                name: 'Action Comedy Room',
                description: 'A room for action and comedy movies',
                hostId: 'test-host-id',
                genrePreferences: ['Action', 'Comedy'], // Invalid genre should be filtered out
                isPrivate: false,
                maxMembers: 10,
                inviteCode: 'ABC123',
                inviteUrl: 'https://trinity.app/room/ABC123',
            });
            // Verify genre validation was called
            expect(mockMovieCacheService.validateGenres).toHaveBeenCalledWith(['Action', 'Comedy', 'InvalidGenre']);
            // Verify movie pre-caching was triggered (async, so we need to wait a bit)
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(mockMovieCacheService.preCacheMovies).toHaveBeenCalledWith(expect.any(String), // roomId
            ['Action', 'Comedy']);
            // Verify room was stored in DynamoDB with genre preferences
            expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
                params: expect.objectContaining({
                    TableName: 'test-rooms-table',
                    Item: expect.objectContaining({
                        genrePreferences: ['Action', 'Comedy'],
                    }),
                }),
            }));
        });
        it('should create room without genre preferences when none provided', async () => {
            const event = {
                info: { fieldName: 'createRoom' },
                identity: { sub: 'test-host-id' },
                arguments: {
                    input: {
                        name: 'General Room',
                        description: 'A room for all movies',
                    },
                },
            };
            const result = await (0, room_1.handler)(event, mockContext, {});
            // Verify room was created without genre preferences
            expect(result).toMatchObject({
                name: 'General Room',
                description: 'A room for all movies',
                hostId: 'test-host-id',
                genrePreferences: undefined,
            });
            // Verify genre validation was not called
            expect(mockMovieCacheService.validateGenres).not.toHaveBeenCalled();
            // Verify movie pre-caching was triggered without genres
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(mockMovieCacheService.preCacheMovies).toHaveBeenCalledWith(expect.any(String), // roomId
            undefined);
        });
        it('should handle all invalid genres gracefully', async () => {
            mockMovieCacheService.validateGenres.mockReturnValue({
                valid: [],
                invalid: ['InvalidGenre1', 'InvalidGenre2'],
            });
            const event = {
                info: { fieldName: 'createRoom' },
                identity: { sub: 'test-host-id' },
                arguments: {
                    input: {
                        name: 'Invalid Genres Room',
                        genrePreferences: ['InvalidGenre1', 'InvalidGenre2'],
                    },
                },
            };
            const result = await (0, room_1.handler)(event, mockContext, {});
            // Verify room was created without genre preferences (all were invalid)
            expect(result).toMatchObject({
                name: 'Invalid Genres Room',
                genrePreferences: undefined,
            });
            // Verify movie pre-caching was triggered without genres
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(mockMovieCacheService.preCacheMovies).toHaveBeenCalledWith(expect.any(String), // roomId
            undefined);
        });
        it('should continue room creation even if movie caching fails', async () => {
            mockMovieCacheService.preCacheMovies.mockRejectedValue(new Error('Cache service unavailable'));
            // Mock validation to return only Action for this test
            mockMovieCacheService.validateGenres.mockReturnValueOnce({
                valid: ['Action'],
                invalid: [],
            });
            const event = {
                info: { fieldName: 'createRoom' },
                identity: { sub: 'test-host-id' },
                arguments: {
                    input: {
                        name: 'Resilient Room',
                        genrePreferences: ['Action'],
                    },
                },
            };
            // Should not throw error even if caching fails
            const result = await (0, room_1.handler)(event, mockContext, {});
            expect(result).toMatchObject({
                name: 'Resilient Room',
                genrePreferences: ['Action'],
            });
            // Verify caching was attempted
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(mockMovieCacheService.preCacheMovies).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm9vbS1jYWNoZS1pbnRlZ3JhdGlvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicm9vbS1jYWNoZS1pbnRlZ3JhdGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7O0FBRUgsc0JBQXNCO0FBQ3RCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztBQUMzQixJQUFJLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDeEMsY0FBYyxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUU7SUFDekIsc0JBQXNCLEVBQUU7UUFDdEIsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztZQUNuQixJQUFJLEVBQUUsUUFBUTtTQUNmLENBQUMsQ0FBQztLQUNKO0lBQ0QsVUFBVSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzdDLFVBQVUsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUM3QyxZQUFZLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDL0MsYUFBYSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0NBQ2pELENBQUMsQ0FBQyxDQUFDO0FBRUosMEJBQTBCO0FBQzFCLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUNuQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMs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QyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBJbnRlZ3JhdGlvbiB0ZXN0cyBmb3IgUm9vbSBIYW5kbGVyIGFuZCBNb3ZpZSBDYWNoZSBTZXJ2aWNlXHJcbiAqIFRlc3RzIHRoZSBpbnRlZ3JhdGlvbiBiZXR3ZWVuIHJvb20gY3JlYXRpb24gYW5kIG1vdmllIHByZS1jYWNoaW5nXHJcbiAqL1xyXG5cclxuLy8gTW9jayBEeW5hbW9EQiBmaXJzdFxyXG5jb25zdCBtb2NrU2VuZCA9IGplc3QuZm4oKTtcclxuamVzdC5tb2NrKCdAYXdzLXNkay9saWItZHluYW1vZGInLCAoKSA9PiAoe1xyXG4gIER5bmFtb0RCQ2xpZW50OiBqZXN0LmZuKCksXHJcbiAgRHluYW1vREJEb2N1bWVudENsaWVudDoge1xyXG4gICAgZnJvbTogamVzdC5mbigoKSA9PiAoe1xyXG4gICAgICBzZW5kOiBtb2NrU2VuZCxcclxuICAgIH0pKSxcclxuICB9LFxyXG4gIFB1dENvbW1hbmQ6IGplc3QuZm4oKHBhcmFtcykgPT4gKHsgcGFyYW1zIH0pKSxcclxuICBHZXRDb21tYW5kOiBqZXN0LmZuKChwYXJhbXMpID0+ICh7IHBhcmFtcyB9KSksXHJcbiAgUXVlcnlDb21tYW5kOiBqZXN0LmZuKChwYXJhbXMpID0+ICh7IHBhcmFtcyB9KSksXHJcbiAgVXBkYXRlQ29tbWFuZDogamVzdC5mbigocGFyYW1zKSA9PiAoeyBwYXJhbXMgfSkpLFxyXG59KSk7XHJcblxyXG4vLyBNb2NrIG90aGVyIGRlcGVuZGVuY2llc1xyXG5qZXN0Lm1vY2soJy4uL3V0aWxzL21ldHJpY3MnLCAoKSA9PiAoe1xyXG4gIGxvZ0J1c2luZXNzTWV0cmljOiBqZXN0LmZuKCksXHJcbiAgbG9nRXJyb3I6IGplc3QuZm4oKSxcclxuICBQZXJmb3JtYW5jZVRpbWVyOiBqZXN0LmZuKCkubW9ja0ltcGxlbWVudGF0aW9uKCgpID0+ICh7XHJcbiAgICBmaW5pc2g6IGplc3QuZm4oKSxcclxuICB9KSksXHJcbn0pKTtcclxuXHJcbmplc3QubW9jaygnLi4vc2VydmljZXMvZGVlcExpbmtTZXJ2aWNlJywgKCkgPT4gKHtcclxuICBkZWVwTGlua1NlcnZpY2U6IHtcclxuICAgIGdlbmVyYXRlSW52aXRlTGluazogamVzdC5mbigpLFxyXG4gICAgdmFsaWRhdGVJbnZpdGVDb2RlOiBqZXN0LmZuKCksXHJcbiAgICBoYW5kbGVEZWVwTGluazogamVzdC5mbigpLFxyXG4gIH0sXHJcbn0pKTtcclxuXHJcbmplc3QubW9jaygnLi4vc2VydmljZXMvbW92aWVDYWNoZVNlcnZpY2UnLCAoKSA9PiAoe1xyXG4gIG1vdmllQ2FjaGVTZXJ2aWNlOiB7XHJcbiAgICBwcmVDYWNoZU1vdmllczogamVzdC5mbigpLFxyXG4gICAgdmFsaWRhdGVHZW5yZXM6IGplc3QuZm4oKSxcclxuICAgIGdldENhY2hlZE1vdmllczogamVzdC5mbigpLFxyXG4gICAgcmVmcmVzaENhY2hlOiBqZXN0LmZuKCksXHJcbiAgICBnZXRBdmFpbGFibGVHZW5yZXM6IGplc3QuZm4oKSxcclxuICAgIGdldENhY2hlU3RhdHM6IGplc3QuZm4oKSxcclxuICB9LFxyXG59KSk7XHJcblxyXG5pbXBvcnQgeyBoYW5kbGVyIH0gZnJvbSAnLi4vaGFuZGxlcnMvcm9vbSc7XHJcbmltcG9ydCB7IG1vdmllQ2FjaGVTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvbW92aWVDYWNoZVNlcnZpY2UnO1xyXG5pbXBvcnQgeyBkZWVwTGlua1NlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9kZWVwTGlua1NlcnZpY2UnO1xyXG5cclxuY29uc3QgbW9ja01vdmllQ2FjaGVTZXJ2aWNlID0gbW92aWVDYWNoZVNlcnZpY2UgYXMgamVzdC5Nb2NrZWQ8dHlwZW9mIG1vdmllQ2FjaGVTZXJ2aWNlPjtcclxuY29uc3QgbW9ja0RlZXBMaW5rU2VydmljZSA9IGRlZXBMaW5rU2VydmljZSBhcyBqZXN0Lk1vY2tlZDx0eXBlb2YgZGVlcExpbmtTZXJ2aWNlPjtcclxuXHJcbi8vIE1vY2sgTGFtYmRhIGNvbnRleHRcclxuY29uc3QgbW9ja0NvbnRleHQgPSB7XHJcbiAgY2FsbGJhY2tXYWl0c0ZvckVtcHR5RXZlbnRMb29wOiBmYWxzZSxcclxuICBmdW5jdGlvbk5hbWU6ICd0ZXN0LWZ1bmN0aW9uJyxcclxuICBmdW5jdGlvblZlcnNpb246ICcxJyxcclxuICBpbnZva2VkRnVuY3Rpb25Bcm46ICdhcm46YXdzOmxhbWJkYTp1cy1lYXN0LTE6MTIzNDU2Nzg5MDEyOmZ1bmN0aW9uOnRlc3QtZnVuY3Rpb24nLFxyXG4gIG1lbW9yeUxpbWl0SW5NQjogJzEyOCcsXHJcbiAgYXdzUmVxdWVzdElkOiAndGVzdC1yZXF1ZXN0LWlkJyxcclxuICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS90ZXN0LWZ1bmN0aW9uJyxcclxuICBsb2dTdHJlYW1OYW1lOiAnMjAyMy8wMS8wMS9bJExBVEVTVF10ZXN0LXN0cmVhbScsXHJcbiAgZ2V0UmVtYWluaW5nVGltZUluTWlsbGlzOiAoKSA9PiAzMDAwMCxcclxuICBkb25lOiBqZXN0LmZuKCksXHJcbiAgZmFpbDogamVzdC5mbigpLFxyXG4gIHN1Y2NlZWQ6IGplc3QuZm4oKSxcclxufTtcclxuXHJcbmRlc2NyaWJlKCdSb29tIEhhbmRsZXIgLSBNb3ZpZSBDYWNoZSBJbnRlZ3JhdGlvbicsICgpID0+IHtcclxuICBiZWZvcmVFYWNoKCgpID0+IHtcclxuICAgIGplc3QuY2xlYXJBbGxNb2NrcygpO1xyXG4gICAgXHJcbiAgICAvLyBTZXR1cCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcclxuICAgIHByb2Nlc3MuZW52LlJPT01TX1RBQkxFID0gJ3Rlc3Qtcm9vbXMtdGFibGUnO1xyXG4gICAgcHJvY2Vzcy5lbnYuUk9PTV9NRU1CRVJTX1RBQkxFID0gJ3Rlc3Qtcm9vbS1tZW1iZXJzLXRhYmxlJztcclxuICAgIHByb2Nlc3MuZW52Lk1PVklFX0NBQ0hFX1RBQkxFID0gJ3Rlc3QtbW92aWUtY2FjaGUtdGFibGUnO1xyXG4gICAgXHJcbiAgICAvLyBNb2NrIHN1Y2Nlc3NmdWwgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgbW9ja1NlbmQubW9ja1Jlc29sdmVkVmFsdWUoeyBJdGVtOiBudWxsIH0pO1xyXG4gICAgXHJcbiAgICAvLyBNb2NrIERlZXBMaW5rU2VydmljZVxyXG4gICAgbW9ja0RlZXBMaW5rU2VydmljZS5nZW5lcmF0ZUludml0ZUxpbmsubW9ja1Jlc29sdmVkVmFsdWUoe1xyXG4gICAgICBjb2RlOiAnQUJDMTIzJyxcclxuICAgICAgdXJsOiAnaHR0cHM6Ly90cmluaXR5LmFwcC9yb29tL0FCQzEyMycsXHJcbiAgICAgIHJvb21JZDogJ3Rlc3Qtcm9vbS1pZCcsXHJcbiAgICAgIGNyZWF0ZWRCeTogJ3Rlc3QtaG9zdC1pZCcsXHJcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICBleHBpcmVzQXQ6IG5ldyBEYXRlKERhdGUubm93KCkgKyA3ICogMjQgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgIHVzYWdlQ291bnQ6IDAsXHJcbiAgICAgIG1heFVzYWdlOiB1bmRlZmluZWQsXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgLy8gTW9jayBNb3ZpZUNhY2hlU2VydmljZVxyXG4gICAgbW9ja01vdmllQ2FjaGVTZXJ2aWNlLnZhbGlkYXRlR2VucmVzLm1vY2tSZXR1cm5WYWx1ZSh7XHJcbiAgICAgIHZhbGlkOiBbJ0FjdGlvbicsICdDb21lZHknXSxcclxuICAgICAgaW52YWxpZDogW10sXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgbW9ja01vdmllQ2FjaGVTZXJ2aWNlLnByZUNhY2hlTW92aWVzLm1vY2tSZXNvbHZlZFZhbHVlKFtcclxuICAgICAge1xyXG4gICAgICAgIHRtZGJJZDogNTUwLFxyXG4gICAgICAgIHRpdGxlOiAnRmlnaHQgQ2x1YicsXHJcbiAgICAgICAgcG9zdGVyUGF0aDogJ2h0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAvcG9zdGVyLmpwZycsXHJcbiAgICAgICAgb3ZlcnZpZXc6ICdBIG1vdmllIGFib3V0IGZpZ2h0aW5nJyxcclxuICAgICAgICBnZW5yZXM6IFsnQWN0aW9uJywgJ0RyYW1hJ10sXHJcbiAgICAgICAgeWVhcjogMTk5OSxcclxuICAgICAgICByYXRpbmc6IDguOCxcclxuICAgICAgICBjYWNoZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIHR0bDogRGF0ZS5ub3coKSArIDI0ICogNjAgKiA2MCAqIDEwMDAsXHJcbiAgICAgIH0sXHJcbiAgICBdKTtcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ2NyZWF0ZVJvb20gd2l0aCBnZW5yZSBwcmVmZXJlbmNlcycsICgpID0+IHtcclxuICAgIGl0KCdzaG91bGQgY3JlYXRlIHJvb20gYW5kIHRyaWdnZXIgbW92aWUgcHJlLWNhY2hpbmcgd2l0aCBnZW5yZXMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGV2ZW50ID0ge1xyXG4gICAgICAgIGluZm86IHsgZmllbGROYW1lOiAnY3JlYXRlUm9vbScgfSxcclxuICAgICAgICBpZGVudGl0eTogeyBzdWI6ICd0ZXN0LWhvc3QtaWQnIH0sXHJcbiAgICAgICAgYXJndW1lbnRzOiB7XHJcbiAgICAgICAgICBpbnB1dDoge1xyXG4gICAgICAgICAgICBuYW1lOiAnQWN0aW9uIENvbWVkeSBSb29tJyxcclxuICAgICAgICAgICAgZGVzY3JpcHRpb246ICdBIHJvb20gZm9yIGFjdGlvbiBhbmQgY29tZWR5IG1vdmllcycsXHJcbiAgICAgICAgICAgIGdlbnJlUHJlZmVyZW5jZXM6IFsnQWN0aW9uJywgJ0NvbWVkeScsICdJbnZhbGlkR2VucmUnXSxcclxuICAgICAgICAgICAgaXNQcml2YXRlOiBmYWxzZSxcclxuICAgICAgICAgICAgbWF4TWVtYmVyczogMTAsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH07XHJcblxyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIGFueSwgbW9ja0NvbnRleHQgYXMgYW55LCB7fSBhcyBhbnkpO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IHJvb20gd2FzIGNyZWF0ZWQgd2l0aCBjb3JyZWN0IHByb3BlcnRpZXNcclxuICAgICAgZXhwZWN0KHJlc3VsdCkudG9NYXRjaE9iamVjdCh7XHJcbiAgICAgICAgbmFtZTogJ0FjdGlvbiBDb21lZHkgUm9vbScsXHJcbiAgICAgICAgZGVzY3JpcHRpb246ICdBIHJvb20gZm9yIGFjdGlvbiBhbmQgY29tZWR5IG1vdmllcycsXHJcbiAgICAgICAgaG9zdElkOiAndGVzdC1ob3N0LWlkJyxcclxuICAgICAgICBnZW5yZVByZWZlcmVuY2VzOiBbJ0FjdGlvbicsICdDb21lZHknXSwgLy8gSW52YWxpZCBnZW5yZSBzaG91bGQgYmUgZmlsdGVyZWQgb3V0XHJcbiAgICAgICAgaXNQcml2YXRlOiBmYWxzZSxcclxuICAgICAgICBtYXhNZW1iZXJzOiAxMCxcclxuICAgICAgICBpbnZpdGVDb2RlOiAnQUJDMTIzJyxcclxuICAgICAgICBpbnZpdGVVcmw6ICdodHRwczovL3RyaW5pdHkuYXBwL3Jvb20vQUJDMTIzJyxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgZ2VucmUgdmFsaWRhdGlvbiB3YXMgY2FsbGVkXHJcbiAgICAgIGV4cGVjdChtb2NrTW92aWVDYWNoZVNlcnZpY2UudmFsaWRhdGVHZW5yZXMpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFsnQWN0aW9uJywgJ0NvbWVkeScsICdJbnZhbGlkR2VucmUnXSk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgbW92aWUgcHJlLWNhY2hpbmcgd2FzIHRyaWdnZXJlZCAoYXN5bmMsIHNvIHdlIG5lZWQgdG8gd2FpdCBhIGJpdClcclxuICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDUwKSk7XHJcbiAgICAgIGV4cGVjdChtb2NrTW92aWVDYWNoZVNlcnZpY2UucHJlQ2FjaGVNb3ZpZXMpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxyXG4gICAgICAgIGV4cGVjdC5hbnkoU3RyaW5nKSwgLy8gcm9vbUlkXHJcbiAgICAgICAgWydBY3Rpb24nLCAnQ29tZWR5J11cclxuICAgICAgKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSByb29tIHdhcyBzdG9yZWQgaW4gRHluYW1vREIgd2l0aCBnZW5yZSBwcmVmZXJlbmNlc1xyXG4gICAgICBleHBlY3QobW9ja1NlbmQpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxyXG4gICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcclxuICAgICAgICAgIHBhcmFtczogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xyXG4gICAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXJvb21zLXRhYmxlJyxcclxuICAgICAgICAgICAgSXRlbTogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xyXG4gICAgICAgICAgICAgIGdlbnJlUHJlZmVyZW5jZXM6IFsnQWN0aW9uJywgJ0NvbWVkeSddLFxyXG4gICAgICAgICAgICB9KSxcclxuICAgICAgICAgIH0pLFxyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSByb29tIHdpdGhvdXQgZ2VucmUgcHJlZmVyZW5jZXMgd2hlbiBub25lIHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCBldmVudCA9IHtcclxuICAgICAgICBpbmZvOiB7IGZpZWxkTmFtZTogJ2NyZWF0ZVJvb20nIH0sXHJcbiAgICAgICAgaWRlbnRpdHk6IHsgc3ViOiAndGVzdC1ob3N0LWlkJyB9LFxyXG4gICAgICAgIGFyZ3VtZW50czoge1xyXG4gICAgICAgICAgaW5wdXQ6IHtcclxuICAgICAgICAgICAgbmFtZTogJ0dlbmVyYWwgUm9vbScsXHJcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQSByb29tIGZvciBhbGwgbW92aWVzJyxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgYW55LCBtb2NrQ29udGV4dCBhcyBhbnksIHt9IGFzIGFueSk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgcm9vbSB3YXMgY3JlYXRlZCB3aXRob3V0IGdlbnJlIHByZWZlcmVuY2VzXHJcbiAgICAgIGV4cGVjdChyZXN1bHQpLnRvTWF0Y2hPYmplY3Qoe1xyXG4gICAgICAgIG5hbWU6ICdHZW5lcmFsIFJvb20nLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQSByb29tIGZvciBhbGwgbW92aWVzJyxcclxuICAgICAgICBob3N0SWQ6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgIGdlbnJlUHJlZmVyZW5jZXM6IHVuZGVmaW5lZCxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgZ2VucmUgdmFsaWRhdGlvbiB3YXMgbm90IGNhbGxlZFxyXG4gICAgICBleHBlY3QobW9ja01vdmllQ2FjaGVTZXJ2aWNlLnZhbGlkYXRlR2VucmVzKS5ub3QudG9IYXZlQmVlbkNhbGxlZCgpO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IG1vdmllIHByZS1jYWNoaW5nIHdhcyB0cmlnZ2VyZWQgd2l0aG91dCBnZW5yZXNcclxuICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDUwKSk7XHJcbiAgICAgIGV4cGVjdChtb2NrTW92aWVDYWNoZVNlcnZpY2UucHJlQ2FjaGVNb3ZpZXMpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxyXG4gICAgICAgIGV4cGVjdC5hbnkoU3RyaW5nKSwgLy8gcm9vbUlkXHJcbiAgICAgICAgdW5kZWZpbmVkXHJcbiAgICAgICk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBhbGwgaW52YWxpZCBnZW5yZXMgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcclxuICAgICAgbW9ja01vdmllQ2FjaGVTZXJ2aWNlLnZhbGlkYXRlR2VucmVzLm1vY2tSZXR1cm5WYWx1ZSh7XHJcbiAgICAgICAgdmFsaWQ6IFtdLFxyXG4gICAgICAgIGludmFsaWQ6IFsnSW52YWxpZEdlbnJlMScsICdJbnZhbGlkR2VucmUyJ10sXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgZXZlbnQgPSB7XHJcbiAgICAgICAgaW5mbzogeyBmaWVsZE5hbWU6ICdjcmVhdGVSb29tJyB9LFxyXG4gICAgICAgIGlkZW50aXR5OiB7IHN1YjogJ3Rlc3QtaG9zdC1pZCcgfSxcclxuICAgICAgICBhcmd1bWVudHM6IHtcclxuICAgICAgICAgIGlucHV0OiB7XHJcbiAgICAgICAgICAgIG5hbWU6ICdJbnZhbGlkIEdlbnJlcyBSb29tJyxcclxuICAgICAgICAgICAgZ2VucmVQcmVmZXJlbmNlczogWydJbnZhbGlkR2VucmUxJywgJ0ludmFsaWRHZW5yZTInXSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgYW55LCBtb2NrQ29udGV4dCBhcyBhbnksIHt9IGFzIGFueSk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgcm9vbSB3YXMgY3JlYXRlZCB3aXRob3V0IGdlbnJlIHByZWZlcmVuY2VzIChhbGwgd2VyZSBpbnZhbGlkKVxyXG4gICAgICBleHBlY3QocmVzdWx0KS50b01hdGNoT2JqZWN0KHtcclxuICAgICAgICBuYW1lOiAnSW52YWxpZCBHZW5yZXMgUm9vbScsXHJcbiAgICAgICAgZ2VucmVQcmVmZXJlbmNlczogdW5kZWZpbmVkLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBtb3ZpZSBwcmUtY2FjaGluZyB3YXMgdHJpZ2dlcmVkIHdpdGhvdXQgZ2VucmVzXHJcbiAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1MCkpO1xyXG4gICAgICBleHBlY3QobW9ja01vdmllQ2FjaGVTZXJ2aWNlLnByZUNhY2hlTW92aWVzKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcclxuICAgICAgICBleHBlY3QuYW55KFN0cmluZyksIC8vIHJvb21JZFxyXG4gICAgICAgIHVuZGVmaW5lZFxyXG4gICAgICApO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBjb250aW51ZSByb29tIGNyZWF0aW9uIGV2ZW4gaWYgbW92aWUgY2FjaGluZyBmYWlscycsIGFzeW5jICgpID0+IHtcclxuICAgICAgbW9ja01vdmllQ2FjaGVTZXJ2aWNlLnByZUNhY2hlTW92aWVzLm1vY2tSZWplY3RlZFZhbHVlKG5ldyBFcnJvcignQ2FjaGUgc2VydmljZSB1bmF2YWlsYWJsZScpKTtcclxuICAgICAgXHJcbiAgICAgIC8vIE1vY2sgdmFsaWRhdGlvbiB0byByZXR1cm4gb25seSBBY3Rpb24gZm9yIHRoaXMgdGVzdFxyXG4gICAgICBtb2NrTW92aWVDYWNoZVNlcnZpY2UudmFsaWRhdGVHZW5yZXMubW9ja1JldHVyblZhbHVlT25jZSh7XHJcbiAgICAgICAgdmFsaWQ6IFsnQWN0aW9uJ10sXHJcbiAgICAgICAgaW52YWxpZDogW10sXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgZXZlbnQgPSB7XHJcbiAgICAgICAgaW5mbzogeyBmaWVsZE5hbWU6ICdjcmVhdGVSb29tJyB9LFxyXG4gICAgICAgIGlkZW50aXR5OiB7IHN1YjogJ3Rlc3QtaG9zdC1pZCcgfSxcclxuICAgICAgICBhcmd1bWVudHM6IHtcclxuICAgICAgICAgIGlucHV0OiB7XHJcbiAgICAgICAgICAgIG5hbWU6ICdSZXNpbGllbnQgUm9vbScsXHJcbiAgICAgICAgICAgIGdlbnJlUHJlZmVyZW5jZXM6IFsnQWN0aW9uJ10sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH07XHJcblxyXG4gICAgICAvLyBTaG91bGQgbm90IHRocm93IGVycm9yIGV2ZW4gaWYgY2FjaGluZyBmYWlsc1xyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIGFueSwgbW9ja0NvbnRleHQgYXMgYW55LCB7fSBhcyBhbnkpO1xyXG5cclxuICAgICAgZXhwZWN0KHJlc3VsdCkudG9NYXRjaE9iamVjdCh7XHJcbiAgICAgICAgbmFtZTogJ1Jlc2lsaWVudCBSb29tJyxcclxuICAgICAgICBnZW5yZVByZWZlcmVuY2VzOiBbJ0FjdGlvbiddLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBjYWNoaW5nIHdhcyBhdHRlbXB0ZWRcclxuICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDUwKSk7XHJcbiAgICAgIGV4cGVjdChtb2NrTW92aWVDYWNoZVNlcnZpY2UucHJlQ2FjaGVNb3ZpZXMpLnRvSGF2ZUJlZW5DYWxsZWQoKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59KTsiXX0=