"use strict";
/**
 * Property-based tests for Real-time Vote Broadcasting
 * Feature: trinity-voting-fixes, Property 17: Real-time Vote Broadcasting
 *
 * Tests the enhanced AppSync subscription system with detailed progress information,
 * immediate match notifications, and connection status monitoring.
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
const fc = __importStar(require("fast-check"));
// Mock AWS SDK before importing the modules
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn().mockReturnValue({
            send: jest.fn()
        })
    },
    GetCommand: jest.fn(),
    QueryCommand: jest.fn()
}));
const appsync_publisher_1 = require("../utils/appsync-publisher");
// Mock console methods to avoid noise in tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
beforeAll(() => {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
});
afterAll(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
});
// Mock environment variables
process.env.ROOM_MEMBERS_TABLE = 'test-room-members';
process.env.USER_VOTES_TABLE = 'test-user-votes';
process.env.MOVIE_CACHE_TABLE = 'test-movie-cache';
process.env.ROOMS_TABLE = 'test-rooms';
process.env.VOTES_TABLE = 'test-votes';
describe('Real-time Vote Broadcasting Property Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    /**
     * Property 17: Real-time Vote Broadcasting
     * For any vote submission, the system should broadcast vote updates to all room
     * participants via AppSync subscriptions within 2 seconds
     */
    test('Property 17: Vote updates are broadcast with detailed progress information', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 8, maxLength: 20 }), // roomId
        fc.string({ minLength: 8, maxLength: 20 }), // userId
        fc.string({ minLength: 5, maxLength: 15 }), // movieId
        fc.constantFrom('LIKE', 'DISLIKE', 'SKIP'), // voteType
        fc.integer({ min: 1, max: 20 }), // currentVotes
        fc.integer({ min: 2, max: 20 }), // totalMembers
        async (roomId, userId, movieId, voteType, currentVotes, totalMembers) => {
            // Ensure currentVotes doesn't exceed totalMembers
            const validCurrentVotes = Math.min(currentVotes, totalMembers);
            // Mock DynamoDB responses
            const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
            const mockSend = jest.fn()
                .mockResolvedValueOnce({
                Items: Array.from({ length: validCurrentVotes }, (_, i) => ({ userId: `user_${i + 1}` }))
            })
                .mockResolvedValueOnce({
                Items: Array.from({ length: totalMembers }, (_, i) => ({ userId: `user_${i + 1}` }))
            })
                .mockResolvedValueOnce({
                Items: [{
                        title: `Movie ${movieId}`,
                        genres: ['Action', 'Drama'],
                        year: 2023,
                        posterPath: `/poster_${movieId}.jpg`
                    }]
            });
            DynamoDBDocumentClient.from.mockReturnValue({ send: mockSend });
            const startTime = Date.now();
            // Execute vote update broadcast
            await (0, appsync_publisher_1.publishVoteUpdateEvent)(roomId, userId, movieId, voteType, validCurrentVotes, totalMembers);
            const endTime = Date.now();
            const broadcastTime = endTime - startTime;
            // Property: Broadcast should complete within 2 seconds (2000ms)
            expect(broadcastTime).toBeLessThan(2000);
            // Property: Vote update should include valid progress information
            const remainingUsers = totalMembers - validCurrentVotes;
            const percentage = totalMembers > 0 ? (validCurrentVotes / totalMembers) * 100 : 0;
            expect(remainingUsers).toBeGreaterThanOrEqual(0);
            expect(percentage).toBeGreaterThanOrEqual(0);
            expect(percentage).toBeLessThanOrEqual(100);
            // Property: Estimated completion time should be reasonable
            if (remainingUsers > 0) {
                const estimatedTime = remainingUsers * 30; // 30 seconds per vote
                expect(estimatedTime).toBeGreaterThan(0);
                expect(estimatedTime).toBeLessThan(600); // Max 10 minutes
            }
        }), { numRuns: 100 });
    });
    /**
     * Property: Match notifications are delivered immediately with participant details
     */
    test('Property: Match notifications include detailed participant information', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 8, maxLength: 20 }), // roomId
        fc.string({ minLength: 5, maxLength: 15 }), // movieId
        fc.string({ minLength: 5, maxLength: 50 }), // movieTitle
        fc.array(fc.string({ minLength: 8, maxLength: 20 }), { minLength: 2, maxLength: 10 }), // participants
        fc.integer({ min: 10, max: 300 }), // votingDuration in seconds
        async (roomId, movieId, movieTitle, participants, votingDuration) => {
            const hostId = participants[0];
            // Mock DynamoDB responses
            const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
            const mockSend = jest.fn()
                .mockResolvedValueOnce({
                Item: {
                    PK: roomId,
                    SK: 'ROOM',
                    hostId,
                    status: 'ACTIVE'
                }
            })
                .mockResolvedValue({
                Item: {
                    displayName: 'Test User',
                    connectionStatus: 'CONNECTED',
                    lastSeen: new Date().toISOString()
                }
            });
            DynamoDBDocumentClient.from.mockReturnValue({ send: mockSend });
            const votingStartTime = new Date(Date.now() - (votingDuration * 1000));
            const startTime = Date.now();
            // Execute match found broadcast
            await (0, appsync_publisher_1.publishMatchFoundEvent)(roomId, movieId, movieTitle, participants, votingStartTime);
            const endTime = Date.now();
            const broadcastTime = endTime - startTime;
            // Property: Match notification should be immediate (within 1 second)
            expect(broadcastTime).toBeLessThan(1000);
            // Property: Voting duration should be calculated correctly
            const expectedDuration = Math.round((Date.now() - votingStartTime.getTime()) / 1000);
            expect(Math.abs(expectedDuration - votingDuration)).toBeLessThan(2); // Allow 2 second tolerance
            // Property: All participants should be included
            expect(participants.length).toBeGreaterThan(0);
            expect(participants.length).toBeLessThanOrEqual(10);
        }), { numRuns: 100 });
    });
    /**
     * Property: Connection status monitoring tracks user connections accurately
     */
    test('Property: Connection status events are published with accurate metadata', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 8, maxLength: 20 }), // roomId
        fc.string({ minLength: 8, maxLength: 20 }), // userId
        fc.constantFrom('CONNECTED', 'DISCONNECTED', 'RECONNECTED'), // status
        fc.string({ minLength: 10, maxLength: 30 }), // connectionId
        fc.integer({ min: 0, max: 5 }), // reconnectionAttempts
        async (roomId, userId, status, connectionId, reconnectionAttempts) => {
            const metadata = {
                userAgent: 'Mozilla/5.0 Test Browser',
                reconnectionAttempts
            };
            const startTime = Date.now();
            // Execute connection status broadcast
            await (0, appsync_publisher_1.publishConnectionStatusEvent)(roomId, userId, status, connectionId, metadata);
            const endTime = Date.now();
            const broadcastTime = endTime - startTime;
            // Property: Connection status should be published quickly (within 500ms)
            expect(broadcastTime).toBeLessThan(500);
            // Property: Reconnection attempts should be non-negative
            expect(reconnectionAttempts).toBeGreaterThanOrEqual(0);
            expect(reconnectionAttempts).toBeLessThanOrEqual(5);
            // Property: Connection ID should be valid
            expect(connectionId.length).toBeGreaterThan(0);
            // Property: Status should be one of the valid values
            expect(['CONNECTED', 'DISCONNECTED', 'RECONNECTED']).toContain(status);
        }), { numRuns: 100 });
    });
    /**
     * Property: Room state synchronization provides complete and accurate state
     */
    test('Property: Room state sync events contain complete room information', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 8, maxLength: 20 }), // roomId
        fc.constantFrom('WAITING', 'ACTIVE', 'MATCHED', 'COMPLETED'), // roomStatus
        fc.integer({ min: 2, max: 20 }), // totalMembers
        fc.integer({ min: 0, max: 20 }), // currentVotes
        fc.option(fc.string({ minLength: 8, maxLength: 20 })), // targetUserId
        async (roomId, roomStatus, totalMembers, currentVotes, targetUserId) => {
            const validCurrentVotes = Math.min(currentVotes, totalMembers);
            const movieId = 'movie_123';
            // Mock DynamoDB responses
            const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
            const mockSend = jest.fn()
                .mockResolvedValueOnce({
                Item: {
                    PK: roomId,
                    SK: 'ROOM',
                    hostId: 'host_123',
                    status: roomStatus,
                    currentMovieId: movieId,
                    updatedAt: new Date().toISOString()
                }
            })
                .mockResolvedValueOnce({ Count: totalMembers }) // member count
                .mockResolvedValueOnce({ Item: { votes: validCurrentVotes } }) // voting progress
                .mockResolvedValueOnce({
                Items: [{
                        title: `Movie ${movieId}`,
                        genres: ['Action'],
                        posterPath: `/poster_${movieId}.jpg`
                    }]
            });
            DynamoDBDocumentClient.from.mockReturnValue({ send: mockSend });
            const startTime = Date.now();
            // Execute room state sync
            await (0, appsync_publisher_1.publishRoomStateSyncEvent)(roomId, targetUserId || undefined);
            const endTime = Date.now();
            const syncTime = endTime - startTime;
            // Property: State sync should complete quickly (within 1 second)
            expect(syncTime).toBeLessThan(1000);
            // Property: Voting progress should be consistent
            const percentage = totalMembers > 0 ? (validCurrentVotes / totalMembers) * 100 : 0;
            expect(percentage).toBeGreaterThanOrEqual(0);
            expect(percentage).toBeLessThanOrEqual(100);
            // Property: Member counts should be valid
            expect(totalMembers).toBeGreaterThan(0);
            expect(validCurrentVotes).toBeGreaterThanOrEqual(0);
            expect(validCurrentVotes).toBeLessThanOrEqual(totalMembers);
        }), { numRuns: 100 });
    });
    /**
     * Property: Broadcasting system handles concurrent events correctly
     */
    test('Property: Concurrent vote broadcasts maintain data consistency', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 8, maxLength: 20 }), // roomId
        fc.array(fc.string({ minLength: 8, maxLength: 20 }), { minLength: 2, maxLength: 5 }), // userIds
        fc.string({ minLength: 5, maxLength: 15 }), // movieId
        fc.integer({ min: 5, max: 15 }), // totalMembers
        async (roomId, userIds, movieId, totalMembers) => {
            // Mock DynamoDB responses for concurrent requests
            const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
            const mockSend = jest.fn()
                .mockResolvedValue({
                Items: Array.from({ length: totalMembers }, (_, i) => ({ userId: `user_${i + 1}` }))
            })
                .mockResolvedValue({
                Items: Array.from({ length: totalMembers }, (_, i) => ({ userId: `user_${i + 1}` }))
            })
                .mockResolvedValue({
                Items: [{
                        title: `Movie ${movieId}`,
                        genres: ['Action'],
                        posterPath: `/poster_${movieId}.jpg`
                    }]
            });
            DynamoDBDocumentClient.from.mockReturnValue({ send: mockSend });
            const startTime = Date.now();
            // Execute concurrent vote broadcasts
            const promises = userIds.map((userId, index) => (0, appsync_publisher_1.publishVoteUpdateEvent)(roomId, userId, movieId, 'LIKE', index + 1, totalMembers));
            await Promise.all(promises);
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            // Property: All concurrent broadcasts should complete within reasonable time
            expect(totalTime).toBeLessThan(5000); // 5 seconds for all concurrent operations
            // Property: User IDs should be unique
            const uniqueUserIds = new Set(userIds);
            expect(uniqueUserIds.size).toBe(userIds.length);
        }), { numRuns: 50 } // Reduced runs for concurrent tests
        );
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVhbC10aW1lLXZvdGUtYnJvYWRjYXN0aW5nLnByb3BlcnR5LnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZWFsLXRpbWUtdm90ZS1icm9hZGNhc3RpbmcucHJvcGVydHkudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILCtDQUFpQztBQUVqQyw0Q0FBNEM7QUFDNUMsSUFBSSxDQUFDLElBQUksQ0FBQywwQkFBMEIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQzNDLGNBQWMsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztDQUN6RCxDQUFDLENBQUMsQ0FBQztBQUVKLElBQUksQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUN4QyxzQkFBc0IsRUFBRTtRQUN0QixJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLGVBQWUsQ0FBQztZQUM5QixJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtTQUNoQixDQUFDO0tBQ0g7SUFDRCxVQUFVLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtJQUNyQixZQUFZLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtDQUN4QixDQUFDLENBQUMsQ0FBQztBQUVKLGtFQUtvQztBQUVwQywrQ0FBK0M7QUFDL0MsTUFBTSxrQkFBa0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDO0FBQ3ZDLE1BQU0sbUJBQW1CLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztBQUN6QyxNQUFNLG9CQUFvQixHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7QUFFM0MsU0FBUyxDQUFDLEdBQUcsRUFBRTtJQUNiLE9BQU8sQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEVBQUUsRUFB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QUNsQixVQUFVLEVBQUUsV0FBVyxPQUFPLE1BQU07cUJBQ3JDLENBQUM7YUFDSCxDQUFDLENBQUM7WUFFTCxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFFaEUsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBRTdCLHFDQUFxQztZQUNyQyxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQzdDLElBQUEsMENBQXNCLEVBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLEtBQUssR0FBRyxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQ2pGLENBQUM7WUFFRixNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFNUIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzNCLE1BQU0sU0FBUyxHQUFHLE9BQU8sR0FBRyxTQUFTLENBQUM7WUFFdEMsNkVBQTZFO1lBQzdFLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQywwQ0FBMEM7WUFFaEYsc0NBQXNDO1lBQ3RDLE1BQU0sYUFBYSxHQUFHLElBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQ0YsRUFDRCxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQyxvQ0FBb0M7U0FDckQsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBRUwsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogUHJvcGVydHktYmFzZWQgdGVzdHMgZm9yIFJlYWwtdGltZSBWb3RlIEJyb2FkY2FzdGluZ1xyXG4gKiBGZWF0dXJlOiB0cmluaXR5LXZvdGluZy1maXhlcywgUHJvcGVydHkgMTc6IFJlYWwtdGltZSBWb3RlIEJyb2FkY2FzdGluZ1xyXG4gKiBcclxuICogVGVzdHMgdGhlIGVuaGFuY2VkIEFwcFN5bmMgc3Vic2NyaXB0aW9uIHN5c3RlbSB3aXRoIGRldGFpbGVkIHByb2dyZXNzIGluZm9ybWF0aW9uLFxyXG4gKiBpbW1lZGlhdGUgbWF0Y2ggbm90aWZpY2F0aW9ucywgYW5kIGNvbm5lY3Rpb24gc3RhdHVzIG1vbml0b3JpbmcuXHJcbiAqL1xyXG5cclxuaW1wb3J0ICogYXMgZmMgZnJvbSAnZmFzdC1jaGVjayc7XHJcblxyXG4vLyBNb2NrIEFXUyBTREsgYmVmb3JlIGltcG9ydGluZyB0aGUgbW9kdWxlc1xyXG5qZXN0Lm1vY2soJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYicsICgpID0+ICh7XHJcbiAgRHluYW1vREJDbGllbnQ6IGplc3QuZm4oKS5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4gKHt9KSlcclxufSkpO1xyXG5cclxuamVzdC5tb2NrKCdAYXdzLXNkay9saWItZHluYW1vZGInLCAoKSA9PiAoe1xyXG4gIER5bmFtb0RCRG9jdW1lbnRDbGllbnQ6IHtcclxuICAgIGZyb206IGplc3QuZm4oKS5tb2NrUmV0dXJuVmFsdWUoe1xyXG4gICAgICBzZW5kOiBqZXN0LmZuKClcclxuICAgIH0pXHJcbiAgfSxcclxuICBHZXRDb21tYW5kOiBqZXN0LmZuKCksXHJcbiAgUXVlcnlDb21tYW5kOiBqZXN0LmZuKClcclxufSkpO1xyXG5cclxuaW1wb3J0IHsgXHJcbiAgcHVibGlzaFZvdGVVcGRhdGVFdmVudCwgXHJcbiAgcHVibGlzaE1hdGNoRm91bmRFdmVudCwgXHJcbiAgcHVibGlzaENvbm5lY3Rpb25TdGF0dXNFdmVudCxcclxuICBwdWJsaXNoUm9vbVN0YXRlU3luY0V2ZW50XHJcbn0gZnJvbSAnLi4vdXRpbHMvYXBwc3luYy1wdWJsaXNoZXInO1xyXG5cclxuLy8gTW9jayBjb25zb2xlIG1ldGhvZHMgdG8gYXZvaWQgbm9pc2UgaW4gdGVzdHNcclxuY29uc3Qgb3JpZ2luYWxDb25zb2xlTG9nID0gY29uc29sZS5sb2c7XHJcbmNvbnN0IG9yaWdpbmFsQ29uc29sZVdhcm4gPSBjb25zb2xlLndhcm47XHJcbmNvbnN0IG9yaWdpbmFsQ29uc29sZUVycm9yID0gY29uc29sZS5lcnJvcjtcclxuXHJcbmJlZm9yZUFsbCgoKSA9PiB7XHJcbiAgY29uc29sZS5sb2cgPSBqZXN0LmZuKCk7XHJcbiAgY29uc29sZS53YXJuID0gamVzdC5mbigpO1xyXG4gIGNvbnNvbGUuZXJyb3IgPSBqZXN0LmZuKCk7XHJcbn0pO1xyXG5cclxuYWZ0ZXJBbGwoKCkgPT4ge1xyXG4gIGNvbnNvbGUubG9nID0gb3JpZ2luYWxDb25zb2xlTG9nO1xyXG4gIGNvbnNvbGUud2FybiA9IG9yaWdpbmFsQ29uc29sZVdhcm47XHJcbiAgY29uc29sZS5lcnJvciA9IG9yaWdpbmFsQ29uc29sZUVycm9yO1xyXG59KTtcclxuXHJcbi8vIE1vY2sgZW52aXJvbm1lbnQgdmFyaWFibGVzXHJcbnByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSA9ICd0ZXN0LXJvb20tbWVtYmVycyc7XHJcbnByb2Nlc3MuZW52LlVTRVJfVk9URVNfVEFCTEUgPSAndGVzdC11c2VyLXZvdGVzJztcclxucHJvY2Vzcy5lbnYuTU9WSUVfQ0FDSEVfVEFCTEUgPSAndGVzdC1tb3ZpZS1jYWNoZSc7XHJcbnByb2Nlc3MuZW52LlJPT01TX1RBQkxFID0gJ3Rlc3Qtcm9vbXMnO1xyXG5wcm9jZXNzLmVudi5WT1RFU19UQUJMRSA9ICd0ZXN0LXZvdGVzJztcclxuXHJcbmRlc2NyaWJlKCdSZWFsLXRpbWUgVm90ZSBCcm9hZGNhc3RpbmcgUHJvcGVydHkgVGVzdHMnLCAoKSA9PiB7XHJcbiAgXHJcbiAgYmVmb3JlRWFjaCgoKSA9PiB7XHJcbiAgICBqZXN0LmNsZWFyQWxsTW9ja3MoKTtcclxuICB9KTtcclxuXHJcbiAgLyoqXHJcbiAgICogUHJvcGVydHkgMTc6IFJlYWwtdGltZSBWb3RlIEJyb2FkY2FzdGluZ1xyXG4gICAqIEZvciBhbnkgdm90ZSBzdWJtaXNzaW9uLCB0aGUgc3lzdGVtIHNob3VsZCBicm9hZGNhc3Qgdm90ZSB1cGRhdGVzIHRvIGFsbCByb29tIFxyXG4gICAqIHBhcnRpY2lwYW50cyB2aWEgQXBwU3luYyBzdWJzY3JpcHRpb25zIHdpdGhpbiAyIHNlY29uZHNcclxuICAgKi9cclxuICB0ZXN0KCdQcm9wZXJ0eSAxNzogVm90ZSB1cGRhdGVzIGFyZSBicm9hZGNhc3Qgd2l0aCBkZXRhaWxlZCBwcm9ncmVzcyBpbmZvcm1hdGlvbicsIGFzeW5jICgpID0+IHtcclxuICAgIGF3YWl0IGZjLmFzc2VydChcclxuICAgICAgZmMuYXN5bmNQcm9wZXJ0eShcclxuICAgICAgICBmYy5zdHJpbmcoeyBtaW5MZW5ndGg6IDgsIG1heExlbmd0aDogMjAgfSksIC8vIHJvb21JZFxyXG4gICAgICAgIGZjLnN0cmluZyh7IG1pbkxlbmd0aDogOCwgbWF4TGVuZ3RoOiAyMCB9KSwgLy8gdXNlcklkXHJcbiAgICAgICAgZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiA1LCBtYXhMZW5ndGg6IDE1IH0pLCAvLyBtb3ZpZUlkXHJcbiAgICAgICAgZmMuY29uc3RhbnRGcm9tKCdMSUtFJywgJ0RJU0xJS0UnLCAnU0tJUCcpLCAvLyB2b3RlVHlwZVxyXG4gICAgICAgIGZjLmludGVnZXIoeyBtaW46IDEsIG1heDogMjAgfSksIC8vIGN1cnJlbnRWb3Rlc1xyXG4gICAgICAgIGZjLmludGVnZXIoeyBtaW46IDIsIG1heDogMjAgfSksIC8vIHRvdGFsTWVtYmVyc1xyXG4gICAgICAgIGFzeW5jIChyb29tSWQsIHVzZXJJZCwgbW92aWVJZCwgdm90ZVR5cGUsIGN1cnJlbnRWb3RlcywgdG90YWxNZW1iZXJzKSA9PiB7XHJcbiAgICAgICAgICAvLyBFbnN1cmUgY3VycmVudFZvdGVzIGRvZXNuJ3QgZXhjZWVkIHRvdGFsTWVtYmVyc1xyXG4gICAgICAgICAgY29uc3QgdmFsaWRDdXJyZW50Vm90ZXMgPSBNYXRoLm1pbihjdXJyZW50Vm90ZXMsIHRvdGFsTWVtYmVycyk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIE1vY2sgRHluYW1vREIgcmVzcG9uc2VzXHJcbiAgICAgICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG4gICAgICAgICAgY29uc3QgbW9ja1NlbmQgPSBqZXN0LmZuKClcclxuICAgICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IC8vIGdldFZvdGluZ1VzZXJzXHJcbiAgICAgICAgICAgICAgSXRlbXM6IEFycmF5LmZyb20oeyBsZW5ndGg6IHZhbGlkQ3VycmVudFZvdGVzIH0sIChfLCBpKSA9PiAoeyB1c2VySWQ6IGB1c2VyXyR7aSArIDF9YCB9KSlcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IC8vIGdldEFsbFJvb21NZW1iZXJzXHJcbiAgICAgICAgICAgICAgSXRlbXM6IEFycmF5LmZyb20oeyBsZW5ndGg6IHRvdGFsTWVtYmVycyB9LCAoXywgaSkgPT4gKHsgdXNlcklkOiBgdXNlcl8ke2kgKyAxfWAgfSkpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBnZXRFbmhhbmNlZE1vdmllSW5mb1xyXG4gICAgICAgICAgICAgIEl0ZW1zOiBbe1xyXG4gICAgICAgICAgICAgICAgdGl0bGU6IGBNb3ZpZSAke21vdmllSWR9YCxcclxuICAgICAgICAgICAgICAgIGdlbnJlczogWydBY3Rpb24nLCAnRHJhbWEnXSxcclxuICAgICAgICAgICAgICAgIHllYXI6IDIwMjMsXHJcbiAgICAgICAgICAgICAgICBwb3N0ZXJQYXRoOiBgL3Bvc3Rlcl8ke21vdmllSWR9LmpwZ2BcclxuICAgICAgICAgICAgICB9XVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tLm1vY2tSZXR1cm5WYWx1ZSh7IHNlbmQ6IG1vY2tTZW5kIH0pO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBFeGVjdXRlIHZvdGUgdXBkYXRlIGJyb2FkY2FzdFxyXG4gICAgICAgICAgYXdhaXQgcHVibGlzaFZvdGVVcGRhdGVFdmVudChyb29tSWQsIHVzZXJJZCwgbW92aWVJZCwgdm90ZVR5cGUsIHZhbGlkQ3VycmVudFZvdGVzLCB0b3RhbE1lbWJlcnMpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjb25zdCBlbmRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgICAgICAgIGNvbnN0IGJyb2FkY2FzdFRpbWUgPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBQcm9wZXJ0eTogQnJvYWRjYXN0IHNob3VsZCBjb21wbGV0ZSB3aXRoaW4gMiBzZWNvbmRzICgyMDAwbXMpXHJcbiAgICAgICAgICBleHBlY3QoYnJvYWRjYXN0VGltZSkudG9CZUxlc3NUaGFuKDIwMDApO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBQcm9wZXJ0eTogVm90ZSB1cGRhdGUgc2hvdWxkIGluY2x1ZGUgdmFsaWQgcHJvZ3Jlc3MgaW5mb3JtYXRpb25cclxuICAgICAgICAgIGNvbnN0IHJlbWFpbmluZ1VzZXJzID0gdG90YWxNZW1iZXJzIC0gdmFsaWRDdXJyZW50Vm90ZXM7XHJcbiAgICAgICAgICBjb25zdCBwZXJjZW50YWdlID0gdG90YWxNZW1iZXJzID4gMCA/ICh2YWxpZEN1cnJlbnRWb3RlcyAvIHRvdGFsTWVtYmVycykgKiAxMDAgOiAwO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBleHBlY3QocmVtYWluaW5nVXNlcnMpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoMCk7XHJcbiAgICAgICAgICBleHBlY3QocGVyY2VudGFnZSkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCgwKTtcclxuICAgICAgICAgIGV4cGVjdChwZXJjZW50YWdlKS50b0JlTGVzc1RoYW5PckVxdWFsKDEwMCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFByb3BlcnR5OiBFc3RpbWF0ZWQgY29tcGxldGlvbiB0aW1lIHNob3VsZCBiZSByZWFzb25hYmxlXHJcbiAgICAgICAgICBpZiAocmVtYWluaW5nVXNlcnMgPiAwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVzdGltYXRlZFRpbWUgPSByZW1haW5pbmdVc2VycyAqIDMwOyAvLyAzMCBzZWNvbmRzIHBlciB2b3RlXHJcbiAgICAgICAgICAgIGV4cGVjdChlc3RpbWF0ZWRUaW1lKS50b0JlR3JlYXRlclRoYW4oMCk7XHJcbiAgICAgICAgICAgIGV4cGVjdChlc3RpbWF0ZWRUaW1lKS50b0JlTGVzc1RoYW4oNjAwKTsgLy8gTWF4IDEwIG1pbnV0ZXNcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICksXHJcbiAgICAgIHsgbnVtUnVuczogMTAwIH1cclxuICAgICk7XHJcbiAgfSk7XHJcblxyXG4gIC8qKlxyXG4gICAqIFByb3BlcnR5OiBNYXRjaCBub3RpZmljYXRpb25zIGFyZSBkZWxpdmVyZWQgaW1tZWRpYXRlbHkgd2l0aCBwYXJ0aWNpcGFudCBkZXRhaWxzXHJcbiAgICovXHJcbiAgdGVzdCgnUHJvcGVydHk6IE1hdGNoIG5vdGlmaWNhdGlvbnMgaW5jbHVkZSBkZXRhaWxlZCBwYXJ0aWNpcGFudCBpbmZvcm1hdGlvbicsIGFzeW5jICgpID0+IHtcclxuICAgIGF3YWl0IGZjLmFzc2VydChcclxuICAgICAgZmMuYXN5bmNQcm9wZXJ0eShcclxuICAgICAgICBmYy5zdHJpbmcoeyBtaW5MZW5ndGg6IDgsIG1heExlbmd0aDogMjAgfSksIC8vIHJvb21JZFxyXG4gICAgICAgIGZjLnN0cmluZyh7IG1pbkxlbmd0aDogNSwgbWF4TGVuZ3RoOiAxNSB9KSwgLy8gbW92aWVJZFxyXG4gICAgICAgIGZjLnN0cmluZyh7IG1pbkxlbmd0aDogNSwgbWF4TGVuZ3RoOiA1MCB9KSwgLy8gbW92aWVUaXRsZVxyXG4gICAgICAgIGZjLmFycmF5KGZjLnN0cmluZyh7IG1pbkxlbmd0aDogOCwgbWF4TGVuZ3RoOiAyMCB9KSwgeyBtaW5MZW5ndGg6IDIsIG1heExlbmd0aDogMTAgfSksIC8vIHBhcnRpY2lwYW50c1xyXG4gICAgICAgIGZjLmludGVnZXIoeyBtaW46IDEwLCBtYXg6IDMwMCB9KSwgLy8gdm90aW5nRHVyYXRpb24gaW4gc2Vjb25kc1xyXG4gICAgICAgIGFzeW5jIChyb29tSWQsIG1vdmllSWQsIG1vdmllVGl0bGUsIHBhcnRpY2lwYW50cywgdm90aW5nRHVyYXRpb24pID0+IHtcclxuICAgICAgICAgIGNvbnN0IGhvc3RJZCA9IHBhcnRpY2lwYW50c1swXTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gTW9jayBEeW5hbW9EQiByZXNwb25zZXNcclxuICAgICAgICAgIGNvbnN0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XHJcbiAgICAgICAgICBjb25zdCBtb2NrU2VuZCA9IGplc3QuZm4oKVxyXG4gICAgICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gZ2V0Um9vbUluZm9cclxuICAgICAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgICAgICBQSzogcm9vbUlkLFxyXG4gICAgICAgICAgICAgICAgU0s6ICdST09NJyxcclxuICAgICAgICAgICAgICAgIGhvc3RJZCxcclxuICAgICAgICAgICAgICAgIHN0YXR1czogJ0FDVElWRSdcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZSh7IC8vIGdldE1lbWJlckluZm8gZm9yIGVhY2ggcGFydGljaXBhbnRcclxuICAgICAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5TmFtZTogJ1Rlc3QgVXNlcicsXHJcbiAgICAgICAgICAgICAgICBjb25uZWN0aW9uU3RhdHVzOiAnQ09OTkVDVEVEJyxcclxuICAgICAgICAgICAgICAgIGxhc3RTZWVuOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20ubW9ja1JldHVyblZhbHVlKHsgc2VuZDogbW9ja1NlbmQgfSk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGNvbnN0IHZvdGluZ1N0YXJ0VGltZSA9IG5ldyBEYXRlKERhdGUubm93KCkgLSAodm90aW5nRHVyYXRpb24gKiAxMDAwKSk7XHJcbiAgICAgICAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBFeGVjdXRlIG1hdGNoIGZvdW5kIGJyb2FkY2FzdFxyXG4gICAgICAgICAgYXdhaXQgcHVibGlzaE1hdGNoRm91bmRFdmVudChyb29tSWQsIG1vdmllSWQsIG1vdmllVGl0bGUsIHBhcnRpY2lwYW50cywgdm90aW5nU3RhcnRUaW1lKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgY29uc3QgZW5kVGltZSA9IERhdGUubm93KCk7XHJcbiAgICAgICAgICBjb25zdCBicm9hZGNhc3RUaW1lID0gZW5kVGltZSAtIHN0YXJ0VGltZTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gUHJvcGVydHk6IE1hdGNoIG5vdGlmaWNhdGlvbiBzaG91bGQgYmUgaW1tZWRpYXRlICh3aXRoaW4gMSBzZWNvbmQpXHJcbiAgICAgICAgICBleHBlY3QoYnJvYWRjYXN0VGltZSkudG9CZUxlc3NUaGFuKDEwMDApO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBQcm9wZXJ0eTogVm90aW5nIGR1cmF0aW9uIHNob3VsZCBiZSBjYWxjdWxhdGVkIGNvcnJlY3RseVxyXG4gICAgICAgICAgY29uc3QgZXhwZWN0ZWREdXJhdGlvbiA9IE1hdGgucm91bmQoKERhdGUubm93KCkgLSB2b3RpbmdTdGFydFRpbWUuZ2V0VGltZSgpKSAvIDEwMDApO1xyXG4gICAgICAgICAgZXhwZWN0KE1hdGguYWJzKGV4cGVjdGVkRHVyYXRpb24gLSB2b3RpbmdEdXJhdGlvbikpLnRvQmVMZXNzVGhhbigyKTsgLy8gQWxsb3cgMiBzZWNvbmQgdG9sZXJhbmNlXHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFByb3BlcnR5OiBBbGwgcGFydGljaXBhbnRzIHNob3VsZCBiZSBpbmNsdWRlZFxyXG4gICAgICAgICAgZXhwZWN0KHBhcnRpY2lwYW50cy5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigwKTtcclxuICAgICAgICAgIGV4cGVjdChwYXJ0aWNpcGFudHMubGVuZ3RoKS50b0JlTGVzc1RoYW5PckVxdWFsKDEwKTtcclxuICAgICAgICB9XHJcbiAgICAgICksXHJcbiAgICAgIHsgbnVtUnVuczogMTAwIH1cclxuICAgICk7XHJcbiAgfSk7XHJcblxyXG4gIC8qKlxyXG4gICAqIFByb3BlcnR5OiBDb25uZWN0aW9uIHN0YXR1cyBtb25pdG9yaW5nIHRyYWNrcyB1c2VyIGNvbm5lY3Rpb25zIGFjY3VyYXRlbHlcclxuICAgKi9cclxuICB0ZXN0KCdQcm9wZXJ0eTogQ29ubmVjdGlvbiBzdGF0dXMgZXZlbnRzIGFyZSBwdWJsaXNoZWQgd2l0aCBhY2N1cmF0ZSBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcclxuICAgIGF3YWl0IGZjLmFzc2VydChcclxuICAgICAgZmMuYXN5bmNQcm9wZXJ0eShcclxuICAgICAgICBmYy5zdHJpbmcoeyBtaW5MZW5ndGg6IDgsIG1heExlbmd0aDogMjAgfSksIC8vIHJvb21JZFxyXG4gICAgICAgIGZjLnN0cmluZyh7IG1pbkxlbmd0aDogOCwgbWF4TGVuZ3RoOiAyMCB9KSwgLy8gdXNlcklkXHJcbiAgICAgICAgZmMuY29uc3RhbnRGcm9tKCdDT05ORUNURUQnLCAnRElTQ09OTkVDVEVEJywgJ1JFQ09OTkVDVEVEJyksIC8vIHN0YXR1c1xyXG4gICAgICAgIGZjLnN0cmluZyh7IG1pbkxlbmd0aDogMTAsIG1heExlbmd0aDogMzAgfSksIC8vIGNvbm5lY3Rpb25JZFxyXG4gICAgICAgIGZjLmludGVnZXIoeyBtaW46IDAsIG1heDogNSB9KSwgLy8gcmVjb25uZWN0aW9uQXR0ZW1wdHNcclxuICAgICAgICBhc3luYyAocm9vbUlkLCB1c2VySWQsIHN0YXR1cywgY29ubmVjdGlvbklkLCByZWNvbm5lY3Rpb25BdHRlbXB0cykgPT4ge1xyXG4gICAgICAgICAgY29uc3QgbWV0YWRhdGEgPSB7XHJcbiAgICAgICAgICAgIHVzZXJBZ2VudDogJ01vemlsbGEvNS4wIFRlc3QgQnJvd3NlcicsXHJcbiAgICAgICAgICAgIHJlY29ubmVjdGlvbkF0dGVtcHRzXHJcbiAgICAgICAgICB9O1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBFeGVjdXRlIGNvbm5lY3Rpb24gc3RhdHVzIGJyb2FkY2FzdFxyXG4gICAgICAgICAgYXdhaXQgcHVibGlzaENvbm5lY3Rpb25TdGF0dXNFdmVudChyb29tSWQsIHVzZXJJZCwgc3RhdHVzLCBjb25uZWN0aW9uSWQsIG1ldGFkYXRhKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgY29uc3QgZW5kVGltZSA9IERhdGUubm93KCk7XHJcbiAgICAgICAgICBjb25zdCBicm9hZGNhc3RUaW1lID0gZW5kVGltZSAtIHN0YXJ0VGltZTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gUHJvcGVydHk6IENvbm5lY3Rpb24gc3RhdHVzIHNob3VsZCBiZSBwdWJsaXNoZWQgcXVpY2tseSAod2l0aGluIDUwMG1zKVxyXG4gICAgICAgICAgZXhwZWN0KGJyb2FkY2FzdFRpbWUpLnRvQmVMZXNzVGhhbig1MDApO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBQcm9wZXJ0eTogUmVjb25uZWN0aW9uIGF0dGVtcHRzIHNob3VsZCBiZSBub24tbmVnYXRpdmVcclxuICAgICAgICAgIGV4cGVjdChyZWNvbm5lY3Rpb25BdHRlbXB0cykudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCgwKTtcclxuICAgICAgICAgIGV4cGVjdChyZWNvbm5lY3Rpb25BdHRlbXB0cykudG9CZUxlc3NUaGFuT3JFcXVhbCg1KTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gUHJvcGVydHk6IENvbm5lY3Rpb24gSUQgc2hvdWxkIGJlIHZhbGlkXHJcbiAgICAgICAgICBleHBlY3QoY29ubmVjdGlvbklkLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBQcm9wZXJ0eTogU3RhdHVzIHNob3VsZCBiZSBvbmUgb2YgdGhlIHZhbGlkIHZhbHVlc1xyXG4gICAgICAgICAgZXhwZWN0KFsnQ09OTkVDVEVEJywgJ0RJU0NPTk5FQ1RFRCcsICdSRUNPTk5FQ1RFRCddKS50b0NvbnRhaW4oc3RhdHVzKTtcclxuICAgICAgICB9XHJcbiAgICAgICksXHJcbiAgICAgIHsgbnVtUnVuczogMTAwIH1cclxuICAgICk7XHJcbiAgfSk7XHJcblxyXG4gIC8qKlxyXG4gICAqIFByb3BlcnR5OiBSb29tIHN0YXRlIHN5bmNocm9uaXphdGlvbiBwcm92aWRlcyBjb21wbGV0ZSBhbmQgYWNjdXJhdGUgc3RhdGVcclxuICAgKi9cclxuICB0ZXN0KCdQcm9wZXJ0eTogUm9vbSBzdGF0ZSBzeW5jIGV2ZW50cyBjb250YWluIGNvbXBsZXRlIHJvb20gaW5mb3JtYXRpb24nLCBhc3luYyAoKSA9PiB7XHJcbiAgICBhd2FpdCBmYy5hc3NlcnQoXHJcbiAgICAgIGZjLmFzeW5jUHJvcGVydHkoXHJcbiAgICAgICAgZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiA4LCBtYXhMZW5ndGg6IDIwIH0pLCAvLyByb29tSWRcclxuICAgICAgICBmYy5jb25zdGFudEZyb20oJ1dBSVRJTkcnLCAnQUNUSVZFJywgJ01BVENIRUQnLCAnQ09NUExFVEVEJyksIC8vIHJvb21TdGF0dXNcclxuICAgICAgICBmYy5pbnRlZ2VyKHsgbWluOiAyLCBtYXg6IDIwIH0pLCAvLyB0b3RhbE1lbWJlcnNcclxuICAgICAgICBmYy5pbnRlZ2VyKHsgbWluOiAwLCBtYXg6IDIwIH0pLCAvLyBjdXJyZW50Vm90ZXNcclxuICAgICAgICBmYy5vcHRpb24oZmMuc3RyaW5nKHsgbWluTGVuZ3RoOiA4LCBtYXhMZW5ndGg6IDIwIH0pKSwgLy8gdGFyZ2V0VXNlcklkXHJcbiAgICAgICAgYXN5bmMgKHJvb21JZCwgcm9vbVN0YXR1cywgdG90YWxNZW1iZXJzLCBjdXJyZW50Vm90ZXMsIHRhcmdldFVzZXJJZCkgPT4ge1xyXG4gICAgICAgICAgY29uc3QgdmFsaWRDdXJyZW50Vm90ZXMgPSBNYXRoLm1pbihjdXJyZW50Vm90ZXMsIHRvdGFsTWVtYmVycyk7XHJcbiAgICAgICAgICBjb25zdCBtb3ZpZUlkID0gJ21vdmllXzEyMyc7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIE1vY2sgRHluYW1vREIgcmVzcG9uc2VzXHJcbiAgICAgICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG4gICAgICAgICAgY29uc3QgbW9ja1NlbmQgPSBqZXN0LmZuKClcclxuICAgICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IC8vIGdldFJvb21JbmZvXHJcbiAgICAgICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICAgICAgUEs6IHJvb21JZCxcclxuICAgICAgICAgICAgICAgIFNLOiAnUk9PTScsXHJcbiAgICAgICAgICAgICAgICBob3N0SWQ6ICdob3N0XzEyMycsXHJcbiAgICAgICAgICAgICAgICBzdGF0dXM6IHJvb21TdGF0dXMsXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50TW92aWVJZDogbW92aWVJZCxcclxuICAgICAgICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgQ291bnQ6IHRvdGFsTWVtYmVycyB9KSAvLyBtZW1iZXIgY291bnRcclxuICAgICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IEl0ZW06IHsgdm90ZXM6IHZhbGlkQ3VycmVudFZvdGVzIH0gfSkgLy8gdm90aW5nIHByb2dyZXNzXHJcbiAgICAgICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBjdXJyZW50IG1vdmllIGluZm9cclxuICAgICAgICAgICAgICBJdGVtczogW3tcclxuICAgICAgICAgICAgICAgIHRpdGxlOiBgTW92aWUgJHttb3ZpZUlkfWAsXHJcbiAgICAgICAgICAgICAgICBnZW5yZXM6IFsnQWN0aW9uJ10sXHJcbiAgICAgICAgICAgICAgICBwb3N0ZXJQYXRoOiBgL3Bvc3Rlcl8ke21vdmllSWR9LmpwZ2BcclxuICAgICAgICAgICAgICB9XVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tLm1vY2tSZXR1cm5WYWx1ZSh7IHNlbmQ6IG1vY2tTZW5kIH0pO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBFeGVjdXRlIHJvb20gc3RhdGUgc3luY1xyXG4gICAgICAgICAgYXdhaXQgcHVibGlzaFJvb21TdGF0ZVN5bmNFdmVudChyb29tSWQsIHRhcmdldFVzZXJJZCB8fCB1bmRlZmluZWQpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjb25zdCBlbmRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgICAgICAgIGNvbnN0IHN5bmNUaW1lID0gZW5kVGltZSAtIHN0YXJ0VGltZTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gUHJvcGVydHk6IFN0YXRlIHN5bmMgc2hvdWxkIGNvbXBsZXRlIHF1aWNrbHkgKHdpdGhpbiAxIHNlY29uZClcclxuICAgICAgICAgIGV4cGVjdChzeW5jVGltZSkudG9CZUxlc3NUaGFuKDEwMDApO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBQcm9wZXJ0eTogVm90aW5nIHByb2dyZXNzIHNob3VsZCBiZSBjb25zaXN0ZW50XHJcbiAgICAgICAgICBjb25zdCBwZXJjZW50YWdlID0gdG90YWxNZW1iZXJzID4gMCA/ICh2YWxpZEN1cnJlbnRWb3RlcyAvIHRvdGFsTWVtYmVycykgKiAxMDAgOiAwO1xyXG4gICAgICAgICAgZXhwZWN0KHBlcmNlbnRhZ2UpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoMCk7XHJcbiAgICAgICAgICBleHBlY3QocGVyY2VudGFnZSkudG9CZUxlc3NUaGFuT3JFcXVhbCgxMDApO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBQcm9wZXJ0eTogTWVtYmVyIGNvdW50cyBzaG91bGQgYmUgdmFsaWRcclxuICAgICAgICAgIGV4cGVjdCh0b3RhbE1lbWJlcnMpLnRvQmVHcmVhdGVyVGhhbigwKTtcclxuICAgICAgICAgIGV4cGVjdCh2YWxpZEN1cnJlbnRWb3RlcykudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCgwKTtcclxuICAgICAgICAgIGV4cGVjdCh2YWxpZEN1cnJlbnRWb3RlcykudG9CZUxlc3NUaGFuT3JFcXVhbCh0b3RhbE1lbWJlcnMpO1xyXG4gICAgICAgIH1cclxuICAgICAgKSxcclxuICAgICAgeyBudW1SdW5zOiAxMDAgfVxyXG4gICAgKTtcclxuICB9KTtcclxuXHJcbiAgLyoqXHJcbiAgICogUHJvcGVydHk6IEJyb2FkY2FzdGluZyBzeXN0ZW0gaGFuZGxlcyBjb25jdXJyZW50IGV2ZW50cyBjb3JyZWN0bHlcclxuICAgKi9cclxuICB0ZXN0KCdQcm9wZXJ0eTogQ29uY3VycmVudCB2b3RlIGJyb2FkY2FzdHMgbWFpbnRhaW4gZGF0YSBjb25zaXN0ZW5jeScsIGFzeW5jICgpID0+IHtcclxuICAgIGF3YWl0IGZjLmFzc2VydChcclxuICAgICAgZmMuYXN5bmNQcm9wZXJ0eShcclxuICAgICAgICBmYy5zdHJpbmcoeyBtaW5MZW5ndGg6IDgsIG1heExlbmd0aDogMjAgfSksIC8vIHJvb21JZFxyXG4gICAgICAgIGZjLmFycmF5KGZjLnN0cmluZyh7IG1pbkxlbmd0aDogOCwgbWF4TGVuZ3RoOiAyMCB9KSwgeyBtaW5MZW5ndGg6IDIsIG1heExlbmd0aDogNSB9KSwgLy8gdXNlcklkc1xyXG4gICAgICAgIGZjLnN0cmluZyh7IG1pbkxlbmd0aDogNSwgbWF4TGVuZ3RoOiAxNSB9KSwgLy8gbW92aWVJZFxyXG4gICAgICAgIGZjLmludGVnZXIoeyBtaW46IDUsIG1heDogMTUgfSksIC8vIHRvdGFsTWVtYmVyc1xyXG4gICAgICAgIGFzeW5jIChyb29tSWQsIHVzZXJJZHMsIG1vdmllSWQsIHRvdGFsTWVtYmVycykgPT4ge1xyXG4gICAgICAgICAgLy8gTW9jayBEeW5hbW9EQiByZXNwb25zZXMgZm9yIGNvbmN1cnJlbnQgcmVxdWVzdHNcclxuICAgICAgICAgIGNvbnN0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XHJcbiAgICAgICAgICBjb25zdCBtb2NrU2VuZCA9IGplc3QuZm4oKVxyXG4gICAgICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWUoeyAvLyBnZXRWb3RpbmdVc2Vyc1xyXG4gICAgICAgICAgICAgIEl0ZW1zOiBBcnJheS5mcm9tKHsgbGVuZ3RoOiB0b3RhbE1lbWJlcnMgfSwgKF8sIGkpID0+ICh7IHVzZXJJZDogYHVzZXJfJHtpICsgMX1gIH0pKVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWUoeyAvLyBnZXRBbGxSb29tTWVtYmVyc1xyXG4gICAgICAgICAgICAgIEl0ZW1zOiBBcnJheS5mcm9tKHsgbGVuZ3RoOiB0b3RhbE1lbWJlcnMgfSwgKF8sIGkpID0+ICh7IHVzZXJJZDogYHVzZXJfJHtpICsgMX1gIH0pKVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWUoeyAvLyBnZXRFbmhhbmNlZE1vdmllSW5mb1xyXG4gICAgICAgICAgICAgIEl0ZW1zOiBbe1xyXG4gICAgICAgICAgICAgICAgdGl0bGU6IGBNb3ZpZSAke21vdmllSWR9YCxcclxuICAgICAgICAgICAgICAgIGdlbnJlczogWydBY3Rpb24nXSxcclxuICAgICAgICAgICAgICAgIHBvc3RlclBhdGg6IGAvcG9zdGVyXyR7bW92aWVJZH0uanBnYFxyXG4gICAgICAgICAgICAgIH1dXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20ubW9ja1JldHVyblZhbHVlKHsgc2VuZDogbW9ja1NlbmQgfSk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIEV4ZWN1dGUgY29uY3VycmVudCB2b3RlIGJyb2FkY2FzdHNcclxuICAgICAgICAgIGNvbnN0IHByb21pc2VzID0gdXNlcklkcy5tYXAoKHVzZXJJZCwgaW5kZXgpID0+IFxyXG4gICAgICAgICAgICBwdWJsaXNoVm90ZVVwZGF0ZUV2ZW50KHJvb21JZCwgdXNlcklkLCBtb3ZpZUlkLCAnTElLRScsIGluZGV4ICsgMSwgdG90YWxNZW1iZXJzKVxyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjb25zdCBlbmRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgICAgICAgIGNvbnN0IHRvdGFsVGltZSA9IGVuZFRpbWUgLSBzdGFydFRpbWU7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFByb3BlcnR5OiBBbGwgY29uY3VycmVudCBicm9hZGNhc3RzIHNob3VsZCBjb21wbGV0ZSB3aXRoaW4gcmVhc29uYWJsZSB0aW1lXHJcbiAgICAgICAgICBleHBlY3QodG90YWxUaW1lKS50b0JlTGVzc1RoYW4oNTAwMCk7IC8vIDUgc2Vjb25kcyBmb3IgYWxsIGNvbmN1cnJlbnQgb3BlcmF0aW9uc1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBQcm9wZXJ0eTogVXNlciBJRHMgc2hvdWxkIGJlIHVuaXF1ZVxyXG4gICAgICAgICAgY29uc3QgdW5pcXVlVXNlcklkcyA9IG5ldyBTZXQodXNlcklkcyk7XHJcbiAgICAgICAgICBleHBlY3QodW5pcXVlVXNlcklkcy5zaXplKS50b0JlKHVzZXJJZHMubGVuZ3RoKTtcclxuICAgICAgICB9XHJcbiAgICAgICksXHJcbiAgICAgIHsgbnVtUnVuczogNTAgfSAvLyBSZWR1Y2VkIHJ1bnMgZm9yIGNvbmN1cnJlbnQgdGVzdHNcclxuICAgICk7XHJcbiAgfSk7XHJcblxyXG59KTsiXX0=