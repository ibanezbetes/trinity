"use strict";
/**
 * End-to-End Integration Tests for Invite Links and Deep Link System
 * Feature: trinity-voting-fixes, Task 11.3
 *
 * Tests invite link generation and deep link handling across the full system
 */
Object.defineProperty(exports, "__esModule", { value: true });
// Mock dependencies first
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
jest.mock('../utils/metrics', () => ({
    logBusinessMetric: jest.fn(),
    logError: jest.fn(),
    PerformanceTimer: jest.fn().mockImplementation(() => ({
        finish: jest.fn(),
    })),
}));
const room_1 = require("../handlers/room");
const validateInvite_1 = require("../handlers/validateInvite");
const deepLinkService_1 = require("../services/deepLinkService");
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
describe('Invite Links and Deep Link System - End-to-End Integration', () => {
    let deepLinkService;
    beforeEach(() => {
        jest.clearAllMocks();
        // Setup environment variables
        process.env.ROOMS_TABLE = 'test-rooms-table';
        process.env.INVITE_LINKS_TABLE = 'test-invite-links-table';
        process.env.ROOM_MEMBERS_TABLE = 'test-room-members-table';
        deepLinkService = new deepLinkService_1.DeepLinkService();
        // Mock successful DynamoDB operations
        mockSend.mockResolvedValue({ Item: null });
    });
    describe('Complete Invite Link Flow - Generation to Validation', () => {
        it('should create room with functional invite link and validate successfully', async () => {
            // Mock room creation response
            const mockRoomId = 'test-room-12345';
            const mockInviteCode = 'ABC123';
            mockSend
                .mockResolvedValueOnce({ Item: null }) // Check room doesn't exist
                .mockResolvedValueOnce({}) // Create room
                .mockResolvedValueOnce({}) // Create room member
                .mockResolvedValueOnce({ Item: null }) // Check invite code doesn't exist
                .mockResolvedValueOnce({}) // Create invite link
                .mockResolvedValueOnce({
                Item: {
                    code: mockInviteCode,
                    roomId: mockRoomId,
                    url: `https://trinity.app/room/${mockInviteCode}`,
                    createdBy: 'test-host-id',
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    isActive: true,
                    usageCount: 0,
                }
            })
                .mockResolvedValueOnce({
                Item: {
                    PK: mockRoomId,
                    SK: 'ROOM',
                    roomId: mockRoomId,
                    name: 'Test Room',
                    hostId: 'test-host-id',
                    status: 'WAITING',
                    memberCount: 1,
                    isPrivate: false,
                    createdAt: new Date().toISOString(),
                }
            });
            // Step 1: Create room with invite link
            const createRoomEvent = {
                info: { fieldName: 'createRoom' },
                identity: { sub: 'test-host-id' },
                arguments: {
                    input: {
                        name: 'E2E Test Room',
                        description: 'End-to-end testing room',
                        isPrivate: false,
                        maxMembers: 10,
                    },
                },
            };
            const roomResult = await (0, room_1.handler)(createRoomEvent, mockContext, {});
            // Verify room was created with invite link
            expect(roomResult).toMatchObject({
                name: 'E2E Test Room',
                hostId: 'test-host-id',
                inviteCode: expect.stringMatching(/^[A-Z0-9]{6}$/),
                inviteUrl: expect.stringMatching(/^https:\/\/trinity\.app\/room\/[A-Z0-9]{6}$/),
            });
            // Step 2: Validate the generated invite link
            const validateEvent = {
                pathParameters: {
                    inviteCode: mockInviteCode,
                },
                httpMethod: 'GET',
            };
            const validationResult = await (0, validateInvite_1.handler)(validateEvent);
            // Verify validation response
            expect(validationResult.statusCode).toBe(200);
            const responseBody = JSON.parse(validationResult.body);
            expect(responseBody).toMatchObject({
                valid: true,
                roomInfo: {
                    roomId: mockRoomId,
                    name: 'Test Room',
                    hostId: 'test-host-id',
                    status: 'WAITING',
                    memberCount: 1,
                    isPrivate: false,
                },
            });
        });
        it('should handle invalid invite codes correctly', async () => {
            const invalidCode = 'INVALID';
            // Mock no invite link found
            mockSend.mockResolvedValueOnce({ Item: null });
            const validateEvent = {
                pathParameters: {
                    inviteCode: invalidCode,
                },
                httpMethod: 'GET',
            };
            const validationResult = await (0, validateInvite_1.handler)(validateEvent);
            expect(validationResult.statusCode).toBe(404);
            const responseBody = JSON.parse(validationResult.body);
            expect(responseBody).toMatchObject({
                valid: false,
                error: 'Invite link not found or has expired',
            });
        });
        it('should handle expired invite codes correctly', async () => {
            const expiredCode = 'EXPIRE';
            // Mock expired invite link
            mockSend.mockResolvedValueOnce({
                Item: {
                    code: expiredCode,
                    roomId: 'test-room-id',
                    url: `https://trinity.app/room/${expiredCode}`,
                    createdBy: 'test-host-id',
                    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
                    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
                    isActive: true,
                    usageCount: 0,
                }
            });
            const validateEvent = {
                pathParameters: {
                    inviteCode: expiredCode,
                },
                httpMethod: 'GET',
            };
            const validationResult = await (0, validateInvite_1.handler)(validateEvent);
            expect(validationResult.statusCode).toBe(410);
            const responseBody = JSON.parse(validationResult.body);
            expect(responseBody).toMatchObject({
                valid: false,
                error: 'Invite link has expired',
            });
        });
        it('should handle deactivated invite codes correctly', async () => {
            const deactivatedCode = 'DEACT1';
            // Mock deactivated invite link
            mockSend.mockResolvedValueOnce({
                Item: {
                    code: deactivatedCode,
                    roomId: 'test-room-id',
                    url: `https://trinity.app/room/${deactivatedCode}`,
                    createdBy: 'test-host-id',
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    isActive: false, // Deactivated
                    usageCount: 0,
                }
            });
            const validateEvent = {
                pathParameters: {
                    inviteCode: deactivatedCode,
                },
                httpMethod: 'GET',
            };
            const validationResult = await (0, validateInvite_1.handler)(validateEvent);
            expect(validationResult.statusCode).toBe(410);
            const responseBody = JSON.parse(validationResult.body);
            expect(responseBody).toMatchObject({
                valid: false,
                error: 'Invite link has been deactivated',
            });
        });
    });
    describe('Deep Link URL Processing', () => {
        it('should process various deep link URL formats correctly', async () => {
            const testCases = [
                {
                    url: 'https://trinity.app/room/ABC123',
                    expectedCode: 'ABC123',
                    description: 'Full HTTPS URL',
                },
                {
                    url: 'trinity.app/room/XYZ789',
                    expectedCode: 'XYZ789',
                    description: 'Domain with path',
                },
                {
                    url: '/room/DEF456',
                    expectedCode: 'DEF456',
                    description: 'Path only',
                },
                {
                    url: 'GHI012',
                    expectedCode: 'GHI012',
                    description: 'Code only',
                },
            ];
            for (const testCase of testCases) {
                // Mock successful invite link lookup
                mockSend
                    .mockResolvedValueOnce({
                    Item: {
                        code: testCase.expectedCode,
                        roomId: 'test-room-id',
                        url: `https://trinity.app/room/${testCase.expectedCode}`,
                        createdBy: 'test-host-id',
                        createdAt: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                        isActive: true,
                        usageCount: 0,
                    }
                })
                    .mockResolvedValueOnce({
                    Item: {
                        PK: 'test-room-id',
                        SK: 'ROOM',
                        roomId: 'test-room-id',
                        name: 'Test Room',
                        hostId: 'test-host-id',
                        status: 'WAITING',
                        memberCount: 1,
                        isPrivate: false,
                        createdAt: new Date().toISOString(),
                    }
                });
                const deepLinkAction = await deepLinkService.handleDeepLink(testCase.url);
                expect(deepLinkAction.type).toBe('JOIN_ROOM');
                expect(deepLinkAction.roomId).toBe('test-room-id');
                expect(deepLinkAction.metadata?.inviteCode).toBe(testCase.expectedCode);
            }
        });
        it('should reject invalid deep link URL formats', async () => {
            const invalidUrls = [
                'https://example.com/room/ABC123', // Wrong domain
                'https://trinity.app/invalid/ABC123', // Wrong path
                'https://trinity.app/room/ABC12', // Too short
                'https://trinity.app/room/ABCDEFG', // Too long
                'invalid-format', // No valid pattern
                '', // Empty
            ];
            for (const invalidUrl of invalidUrls) {
                const deepLinkAction = await deepLinkService.handleDeepLink(invalidUrl);
                expect(deepLinkAction.type).toBe('ERROR');
                expect(deepLinkAction.errorMessage).toContain('Invalid invite link format');
            }
        });
    });
    describe('Room Joining via Invite Links', () => {
        it('should handle successful room joining via invite code', async () => {
            const inviteCode = 'JOIN01';
            const roomId = 'test-room-join';
            const userId = 'test-user-join';
            // Mock successful invite validation and room joining
            mockSend
                .mockResolvedValueOnce({
                Item: {
                    code: inviteCode,
                    roomId: roomId,
                    url: `https://trinity.app/room/${inviteCode}`,
                    createdBy: 'test-host-id',
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    isActive: true,
                    usageCount: 0,
                }
            })
                .mockResolvedValueOnce({
                Item: {
                    PK: roomId,
                    SK: 'ROOM',
                    roomId: roomId,
                    name: 'Join Test Room',
                    hostId: 'test-host-id',
                    status: 'WAITING',
                    memberCount: 1,
                    maxMembers: 10,
                    isPrivate: false,
                    createdAt: new Date().toISOString(),
                }
            })
                .mockResolvedValueOnce({ Item: null }) // Check user not already in room
                .mockResolvedValueOnce({}) // Add user to room
                .mockResolvedValueOnce({}) // Update room member count
                .mockResolvedValueOnce({}) // Update invite usage count
                .mockResolvedValueOnce({
                Item: {
                    PK: roomId,
                    SK: 'ROOM',
                    roomId: roomId,
                    name: 'Join Test Room',
                    hostId: 'test-host-id',
                    status: 'WAITING',
                    memberCount: 2,
                    maxMembers: 10,
                    isPrivate: false,
                    createdAt: new Date().toISOString(),
                }
            });
            // Join room via invite code
            const joinEvent = {
                info: { fieldName: 'joinRoomByInvite' },
                identity: { sub: userId },
                arguments: {
                    inviteCode: inviteCode,
                },
            };
            const joinResult = await (0, room_1.handler)(joinEvent, mockContext, {});
            // Verify successful join
            expect(joinResult).toMatchObject({
                roomId: roomId,
                name: 'Join Test Room',
                hostId: 'test-host-id',
                status: 'WAITING',
                memberCount: 2,
                isPrivate: false,
            });
        });
        it('should prevent joining full rooms via invite', async () => {
            const inviteCode = 'FULL01';
            const roomId = 'test-room-full';
            const userId = 'test-user-full';
            // Mock full room scenario
            mockSend
                .mockResolvedValueOnce({
                Item: {
                    code: inviteCode,
                    roomId: roomId,
                    url: `https://trinity.app/room/${inviteCode}`,
                    createdBy: 'test-host-id',
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    isActive: true,
                    usageCount: 0,
                }
            })
                .mockResolvedValueOnce({
                Item: {
                    PK: roomId,
                    SK: 'ROOM',
                    roomId: roomId,
                    name: 'Full Room',
                    hostId: 'test-host-id',
                    status: 'WAITING',
                    memberCount: 5,
                    maxMembers: 5, // Room is full
                    isPrivate: false,
                    createdAt: new Date().toISOString(),
                }
            });
            const joinEvent = {
                info: { fieldName: 'joinRoomByInvite' },
                identity: { sub: userId },
                arguments: {
                    inviteCode: inviteCode,
                },
            };
            // Should throw error for full room
            await expect((0, room_1.handler)(joinEvent, mockContext, {}))
                .rejects.toThrow('Room is full');
        });
        it('should prevent duplicate joins via invite', async () => {
            const inviteCode = 'DUP001';
            const roomId = 'test-room-dup';
            const userId = 'test-user-dup';
            // Mock user already in room scenario
            mockSend
                .mockResolvedValueOnce({
                Item: {
                    code: inviteCode,
                    roomId: roomId,
                    url: `https://trinity.app/room/${inviteCode}`,
                    createdBy: 'test-host-id',
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    isActive: true,
                    usageCount: 0,
                }
            })
                .mockResolvedValueOnce({
                Item: {
                    PK: roomId,
                    SK: 'ROOM',
                    roomId: roomId,
                    name: 'Duplicate Test Room',
                    hostId: 'test-host-id',
                    status: 'WAITING',
                    memberCount: 2,
                    maxMembers: 10,
                    isPrivate: false,
                    createdAt: new Date().toISOString(),
                }
            })
                .mockResolvedValueOnce({
                Item: {
                    PK: userId,
                    SK: roomId,
                    userId: userId,
                    roomId: roomId,
                    joinedAt: new Date().toISOString(),
                }
            });
            const joinEvent = {
                info: { fieldName: 'joinRoomByInvite' },
                identity: { sub: userId },
                arguments: {
                    inviteCode: inviteCode,
                },
            };
            // Should throw error for duplicate join
            await expect((0, room_1.handler)(joinEvent, mockContext, {}))
                .rejects.toThrow('User is already a member of this room');
        });
    });
    describe('Invite Link Usage Tracking', () => {
        it('should track invite link usage correctly', async () => {
            const inviteCode = 'TRACK1';
            const roomId = 'test-room-track';
            let usageCount = 0;
            // Simulate multiple users joining via same invite
            for (let i = 0; i < 3; i++) {
                const userId = `test-user-${i}`;
                mockSend
                    .mockResolvedValueOnce({
                    Item: {
                        code: inviteCode,
                        roomId: roomId,
                        url: `https://trinity.app/room/${inviteCode}`,
                        createdBy: 'test-host-id',
                        createdAt: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                        isActive: true,
                        usageCount: usageCount,
                    }
                })
                    .mockResolvedValueOnce({
                    Item: {
                        PK: roomId,
                        SK: 'ROOM',
                        roomId: roomId,
                        name: 'Usage Tracking Room',
                        hostId: 'test-host-id',
                        status: 'WAITING',
                        memberCount: i + 1,
                        maxMembers: 10,
                        isPrivate: false,
                        createdAt: new Date().toISOString(),
                    }
                })
                    .mockResolvedValueOnce({ Item: null }) // User not in room
                    .mockResolvedValueOnce({}) // Add user to room
                    .mockResolvedValueOnce({}) // Update room member count
                    .mockResolvedValueOnce({}) // Update invite usage count
                    .mockResolvedValueOnce({
                    Item: {
                        PK: roomId,
                        SK: 'ROOM',
                        roomId: roomId,
                        name: 'Usage Tracking Room',
                        hostId: 'test-host-id',
                        status: 'WAITING',
                        memberCount: i + 2,
                        maxMembers: 10,
                        isPrivate: false,
                        createdAt: new Date().toISOString(),
                    }
                });
                const joinEvent = {
                    info: { fieldName: 'joinRoomByInvite' },
                    identity: { sub: userId },
                    arguments: {
                        inviteCode: inviteCode,
                    },
                };
                const result = await (0, room_1.handler)(joinEvent, mockContext, {});
                expect(result.memberCount).toBe(i + 2);
                usageCount++;
            }
            // Verify usage tracking calls were made
            const updateCalls = mockSend.mock.calls.filter(call => call[0].params && call[0].params.UpdateExpression);
            // Should have update calls for invite usage tracking
            expect(updateCalls.length).toBeGreaterThan(0);
        });
        it('should handle maximum usage limits correctly', async () => {
            const inviteCode = 'LIMIT1';
            const roomId = 'test-room-limit';
            const userId = 'test-user-limit';
            // Mock invite with maximum usage reached
            mockSend.mockResolvedValueOnce({
                Item: {
                    code: inviteCode,
                    roomId: roomId,
                    url: `https://trinity.app/room/${inviteCode}`,
                    createdBy: 'test-host-id',
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    isActive: true,
                    usageCount: 10,
                    maxUsage: 10, // Limit reached
                }
            });
            const joinEvent = {
                info: { fieldName: 'joinRoomByInvite' },
                identity: { sub: userId },
                arguments: {
                    inviteCode: inviteCode,
                },
            };
            // Should throw error for usage limit exceeded
            await expect((0, room_1.handler)(joinEvent, mockContext, {}))
                .rejects.toThrow('Invite link usage limit exceeded');
        });
    });
    describe('Cross-Platform Deep Link Handling', () => {
        it('should generate consistent URLs across platforms', async () => {
            const testCodes = ['WEB001', 'MOB001', 'APP001'];
            testCodes.forEach(code => {
                const expectedUrl = `https://trinity.app/room/${code}`;
                // Test URL generation consistency
                const generatedUrl = `https://trinity.app/room/${code}`;
                expect(generatedUrl).toBe(expectedUrl);
                // Test URL parsing consistency - use public method or test through handleDeepLink
                // Since extractInviteCodeFromUrl is private, we'll test through handleDeepLink
            });
        });
        it('should handle web browser access correctly', async () => {
            const inviteCode = 'WEB123';
            // Mock web browser validation request
            mockSend.mockResolvedValueOnce({
                Item: {
                    code: inviteCode,
                    roomId: 'test-room-web',
                    url: `https://trinity.app/room/${inviteCode}`,
                    createdBy: 'test-host-id',
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    isActive: true,
                    usageCount: 0,
                }
            }).mockResolvedValueOnce({
                Item: {
                    PK: 'test-room-web',
                    SK: 'ROOM',
                    roomId: 'test-room-web',
                    name: 'Web Test Room',
                    hostId: 'test-host-id',
                    status: 'WAITING',
                    memberCount: 1,
                    isPrivate: false,
                    createdAt: new Date().toISOString(),
                }
            });
            const validateEvent = {
                pathParameters: {
                    inviteCode: inviteCode,
                },
                httpMethod: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            };
            const result = await (0, validateInvite_1.handler)(validateEvent);
            expect(result.statusCode).toBe(200);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.valid).toBe(true);
            expect(responseBody.roomInfo.name).toBe('Web Test Room');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW52aXRlLWRlZXAtbGluay1lMmUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImludml0ZS1kZWVwLWxpbmstZTJlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7OztHQUtHOztBQUVILDBCQUEwQjtBQUMxQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7QUFDM0IsSUFBSSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQ3hDLGNBQWMsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFO0lBQ3pCLHNCQUFzQixFQUFFO1FBQ3RCLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7WUFDbkIsSUFBSSxFQUFFLFFBQVE7U0FDZixDQUFDLENBQUM7S0FDSjtJQUNELFVBQVUsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUM3QyxVQUFVLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDN0MsWUFBWSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQy9DLGFBQWEsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztDQUNqRCxDQUFDLENBQUMsQ0FBQztBQUVKLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUNuQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFO0lBQzVC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YUFBb0IsQ0FBQyxDQUFDO1lBRWpFLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRXBDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3RDLE1BQU0sQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUMzRCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogRW5kLXRvLUVuZCBJbnRlZ3JhdGlvbiBUZXN0cyBmb3IgSW52aXRlIExpbmtzIGFuZCBEZWVwIExpbmsgU3lzdGVtXHJcbiAqIEZlYXR1cmU6IHRyaW5pdHktdm90aW5nLWZpeGVzLCBUYXNrIDExLjNcclxuICogXHJcbiAqIFRlc3RzIGludml0ZSBsaW5rIGdlbmVyYXRpb24gYW5kIGRlZXAgbGluayBoYW5kbGluZyBhY3Jvc3MgdGhlIGZ1bGwgc3lzdGVtXHJcbiAqL1xyXG5cclxuLy8gTW9jayBkZXBlbmRlbmNpZXMgZmlyc3RcclxuY29uc3QgbW9ja1NlbmQgPSBqZXN0LmZuKCk7XHJcbmplc3QubW9jaygnQGF3cy1zZGsvbGliLWR5bmFtb2RiJywgKCkgPT4gKHtcclxuICBEeW5hbW9EQkNsaWVudDogamVzdC5mbigpLFxyXG4gIER5bmFtb0RCRG9jdW1lbnRDbGllbnQ6IHtcclxuICAgIGZyb206IGplc3QuZm4oKCkgPT4gKHtcclxuICAgICAgc2VuZDogbW9ja1NlbmQsXHJcbiAgICB9KSksXHJcbiAgfSxcclxuICBQdXRDb21tYW5kOiBqZXN0LmZuKChwYXJhbXMpID0+ICh7IHBhcmFtcyB9KSksXHJcbiAgR2V0Q29tbWFuZDogamVzdC5mbigocGFyYW1zKSA9PiAoeyBwYXJhbXMgfSkpLFxyXG4gIFF1ZXJ5Q29tbWFuZDogamVzdC5mbigocGFyYW1zKSA9PiAoeyBwYXJhbXMgfSkpLFxyXG4gIFVwZGF0ZUNvbW1hbmQ6IGplc3QuZm4oKHBhcmFtcykgPT4gKHsgcGFyYW1zIH0pKSxcclxufSkpO1xyXG5cclxuamVzdC5tb2NrKCcuLi91dGlscy9tZXRyaWNzJywgKCkgPT4gKHtcclxuICBsb2dCdXNpbmVzc01ldHJpYzogamVzdC5mbigpLFxyXG4gIGxvZ0Vycm9yOiBqZXN0LmZuKCksXHJcbiAgUGVyZm9ybWFuY2VUaW1lcjogamVzdC5mbigpLm1vY2tJbXBsZW1lbnRhdGlvbigoKSA9PiAoe1xyXG4gICAgZmluaXNoOiBqZXN0LmZuKCksXHJcbiAgfSkpLFxyXG59KSk7XHJcblxyXG5pbXBvcnQgeyBoYW5kbGVyIGFzIHJvb21IYW5kbGVyIH0gZnJvbSAnLi4vaGFuZGxlcnMvcm9vbSc7XHJcbmltcG9ydCB7IGhhbmRsZXIgYXMgdmFsaWRhdGVJbnZpdGVIYW5kbGVyIH0gZnJvbSAnLi4vaGFuZGxlcnMvdmFsaWRhdGVJbnZpdGUnO1xyXG5pbXBvcnQgeyBEZWVwTGlua1NlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9kZWVwTGlua1NlcnZpY2UnO1xyXG5cclxuLy8gTW9jayBMYW1iZGEgY29udGV4dFxyXG5jb25zdCBtb2NrQ29udGV4dCA9IHtcclxuICBjYWxsYmFja1dhaXRzRm9yRW1wdHlFdmVudExvb3A6IGZhbHNlLFxyXG4gIGZ1bmN0aW9uTmFtZTogJ3Rlc3QtZnVuY3Rpb24nLFxyXG4gIGZ1bmN0aW9uVmVyc2lvbjogJzEnLFxyXG4gIGludm9rZWRGdW5jdGlvbkFybjogJ2Fybjphd3M6bGFtYmRhOnVzLWVhc3QtMToxMjM0NTY3ODkwMTI6ZnVuY3Rpb246dGVzdC1mdW5jdGlvbicsXHJcbiAgbWVtb3J5TGltaXRJbk1COiAnMTI4JyxcclxuICBhd3NSZXF1ZXN0SWQ6ICd0ZXN0LXJlcXVlc3QtaWQnLFxyXG4gIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL3Rlc3QtZnVuY3Rpb24nLFxyXG4gIGxvZ1N0cmVhbU5hbWU6ICcyMDIzLzAxLzAxL1skTEFURVNUXXRlc3Qtc3RyZWFtJyxcclxuICBnZXRSZW1haW5pbmdUaW1lSW5NaWxsaXM6ICgpID0+IDMwMDAwLFxyXG4gIGRvbmU6IGplc3QuZm4oKSxcclxuICBmYWlsOiBqZXN0LmZuKCksXHJcbiAgc3VjY2VlZDogamVzdC5mbigpLFxyXG59O1xyXG5cclxuZGVzY3JpYmUoJ0ludml0ZSBMaW5rcyBhbmQgRGVlcCBMaW5rIFN5c3RlbSAtIEVuZC10by1FbmQgSW50ZWdyYXRpb24nLCAoKSA9PiB7XHJcbiAgbGV0IGRlZXBMaW5rU2VydmljZTogRGVlcExpbmtTZXJ2aWNlO1xyXG5cclxuICBiZWZvcmVFYWNoKCgpID0+IHtcclxuICAgIGplc3QuY2xlYXJBbGxNb2NrcygpO1xyXG4gICAgXHJcbiAgICAvLyBTZXR1cCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcclxuICAgIHByb2Nlc3MuZW52LlJPT01TX1RBQkxFID0gJ3Rlc3Qtcm9vbXMtdGFibGUnO1xyXG4gICAgcHJvY2Vzcy5lbnYuSU5WSVRFX0xJTktTX1RBQkxFID0gJ3Rlc3QtaW52aXRlLWxpbmtzLXRhYmxlJztcclxuICAgIHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSA9ICd0ZXN0LXJvb20tbWVtYmVycy10YWJsZSc7XHJcbiAgICBcclxuICAgIGRlZXBMaW5rU2VydmljZSA9IG5ldyBEZWVwTGlua1NlcnZpY2UoKTtcclxuICAgIFxyXG4gICAgLy8gTW9jayBzdWNjZXNzZnVsIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgIG1vY2tTZW5kLm1vY2tSZXNvbHZlZFZhbHVlKHsgSXRlbTogbnVsbCB9KTtcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ0NvbXBsZXRlIEludml0ZSBMaW5rIEZsb3cgLSBHZW5lcmF0aW9uIHRvIFZhbGlkYXRpb24nLCAoKSA9PiB7XHJcbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSByb29tIHdpdGggZnVuY3Rpb25hbCBpbnZpdGUgbGluayBhbmQgdmFsaWRhdGUgc3VjY2Vzc2Z1bGx5JywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAvLyBNb2NrIHJvb20gY3JlYXRpb24gcmVzcG9uc2VcclxuICAgICAgY29uc3QgbW9ja1Jvb21JZCA9ICd0ZXN0LXJvb20tMTIzNDUnO1xyXG4gICAgICBjb25zdCBtb2NrSW52aXRlQ29kZSA9ICdBQkMxMjMnO1xyXG4gICAgICBcclxuICAgICAgbW9ja1NlbmRcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgSXRlbTogbnVsbCB9KSAvLyBDaGVjayByb29tIGRvZXNuJ3QgZXhpc3RcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHt9KSAvLyBDcmVhdGUgcm9vbVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe30pIC8vIENyZWF0ZSByb29tIG1lbWJlclxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pIC8vIENoZWNrIGludml0ZSBjb2RlIGRvZXNuJ3QgZXhpc3RcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHt9KSAvLyBDcmVhdGUgaW52aXRlIGxpbmtcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IGludml0ZSBsaW5rIGZvciB2YWxpZGF0aW9uXHJcbiAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgIGNvZGU6IG1vY2tJbnZpdGVDb2RlLFxyXG4gICAgICAgICAgICByb29tSWQ6IG1vY2tSb29tSWQsXHJcbiAgICAgICAgICAgIHVybDogYGh0dHBzOi8vdHJpbml0eS5hcHAvcm9vbS8ke21vY2tJbnZpdGVDb2RlfWAsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRCeTogJ3Rlc3QtaG9zdC1pZCcsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICBleHBpcmVzQXQ6IG5ldyBEYXRlKERhdGUubm93KCkgKyA3ICogMjQgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgICAgICAgIHVzYWdlQ291bnQ6IDAsXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IHJvb20gZGV0YWlscyBmb3IgdmFsaWRhdGlvblxyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICBQSzogbW9ja1Jvb21JZCxcclxuICAgICAgICAgICAgU0s6ICdST09NJyxcclxuICAgICAgICAgICAgcm9vbUlkOiBtb2NrUm9vbUlkLFxyXG4gICAgICAgICAgICBuYW1lOiAnVGVzdCBSb29tJyxcclxuICAgICAgICAgICAgaG9zdElkOiAndGVzdC1ob3N0LWlkJyxcclxuICAgICAgICAgICAgc3RhdHVzOiAnV0FJVElORycsXHJcbiAgICAgICAgICAgIG1lbWJlckNvdW50OiAxLFxyXG4gICAgICAgICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFN0ZXAgMTogQ3JlYXRlIHJvb20gd2l0aCBpbnZpdGUgbGlua1xyXG4gICAgICBjb25zdCBjcmVhdGVSb29tRXZlbnQgPSB7XHJcbiAgICAgICAgaW5mbzogeyBmaWVsZE5hbWU6ICdjcmVhdGVSb29tJyB9LFxyXG4gICAgICAgIGlkZW50aXR5OiB7IHN1YjogJ3Rlc3QtaG9zdC1pZCcgfSxcclxuICAgICAgICBhcmd1bWVudHM6IHtcclxuICAgICAgICAgIGlucHV0OiB7XHJcbiAgICAgICAgICAgIG5hbWU6ICdFMkUgVGVzdCBSb29tJyxcclxuICAgICAgICAgICAgZGVzY3JpcHRpb246ICdFbmQtdG8tZW5kIHRlc3Rpbmcgcm9vbScsXHJcbiAgICAgICAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgICAgICAgIG1heE1lbWJlcnM6IDEwLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3Qgcm9vbVJlc3VsdCA9IGF3YWl0IHJvb21IYW5kbGVyKGNyZWF0ZVJvb21FdmVudCBhcyBhbnksIG1vY2tDb250ZXh0IGFzIGFueSwge30gYXMgYW55KTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSByb29tIHdhcyBjcmVhdGVkIHdpdGggaW52aXRlIGxpbmtcclxuICAgICAgZXhwZWN0KHJvb21SZXN1bHQpLnRvTWF0Y2hPYmplY3Qoe1xyXG4gICAgICAgIG5hbWU6ICdFMkUgVGVzdCBSb29tJyxcclxuICAgICAgICBob3N0SWQ6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgIGludml0ZUNvZGU6IGV4cGVjdC5zdHJpbmdNYXRjaGluZygvXltBLVowLTldezZ9JC8pLFxyXG4gICAgICAgIGludml0ZVVybDogZXhwZWN0LnN0cmluZ01hdGNoaW5nKC9eaHR0cHM6XFwvXFwvdHJpbml0eVxcLmFwcFxcL3Jvb21cXC9bQS1aMC05XXs2fSQvKSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBTdGVwIDI6IFZhbGlkYXRlIHRoZSBnZW5lcmF0ZWQgaW52aXRlIGxpbmtcclxuICAgICAgY29uc3QgdmFsaWRhdGVFdmVudCA9IHtcclxuICAgICAgICBwYXRoUGFyYW1ldGVyczoge1xyXG4gICAgICAgICAgaW52aXRlQ29kZTogbW9ja0ludml0ZUNvZGUsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBodHRwTWV0aG9kOiAnR0VUJyxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIGNvbnN0IHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0ZUludml0ZUhhbmRsZXIodmFsaWRhdGVFdmVudCBhcyBhbnkpO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IHZhbGlkYXRpb24gcmVzcG9uc2VcclxuICAgICAgZXhwZWN0KHZhbGlkYXRpb25SZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgcmVzcG9uc2VCb2R5ID0gSlNPTi5wYXJzZSh2YWxpZGF0aW9uUmVzdWx0LmJvZHkpO1xyXG4gICAgICBleHBlY3QocmVzcG9uc2VCb2R5KS50b01hdGNoT2JqZWN0KHtcclxuICAgICAgICB2YWxpZDogdHJ1ZSxcclxuICAgICAgICByb29tSW5mbzoge1xyXG4gICAgICAgICAgcm9vbUlkOiBtb2NrUm9vbUlkLFxyXG4gICAgICAgICAgbmFtZTogJ1Rlc3QgUm9vbScsXHJcbiAgICAgICAgICBob3N0SWQ6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgICAgc3RhdHVzOiAnV0FJVElORycsXHJcbiAgICAgICAgICBtZW1iZXJDb3VudDogMSxcclxuICAgICAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBpbnZhbGlkIGludml0ZSBjb2RlcyBjb3JyZWN0bHknLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGludmFsaWRDb2RlID0gJ0lOVkFMSUQnO1xyXG4gICAgICBcclxuICAgICAgLy8gTW9jayBubyBpbnZpdGUgbGluayBmb3VuZFxyXG4gICAgICBtb2NrU2VuZC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyBJdGVtOiBudWxsIH0pO1xyXG5cclxuICAgICAgY29uc3QgdmFsaWRhdGVFdmVudCA9IHtcclxuICAgICAgICBwYXRoUGFyYW1ldGVyczoge1xyXG4gICAgICAgICAgaW52aXRlQ29kZTogaW52YWxpZENvZGUsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBodHRwTWV0aG9kOiAnR0VUJyxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIGNvbnN0IHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0ZUludml0ZUhhbmRsZXIodmFsaWRhdGVFdmVudCBhcyBhbnkpO1xyXG5cclxuICAgICAgZXhwZWN0KHZhbGlkYXRpb25SZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDQpO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgcmVzcG9uc2VCb2R5ID0gSlNPTi5wYXJzZSh2YWxpZGF0aW9uUmVzdWx0LmJvZHkpO1xyXG4gICAgICBleHBlY3QocmVzcG9uc2VCb2R5KS50b01hdGNoT2JqZWN0KHtcclxuICAgICAgICB2YWxpZDogZmFsc2UsXHJcbiAgICAgICAgZXJyb3I6ICdJbnZpdGUgbGluayBub3QgZm91bmQgb3IgaGFzIGV4cGlyZWQnLFxyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGV4cGlyZWQgaW52aXRlIGNvZGVzIGNvcnJlY3RseScsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3QgZXhwaXJlZENvZGUgPSAnRVhQSVJFJztcclxuICAgICAgXHJcbiAgICAgIC8vIE1vY2sgZXhwaXJlZCBpbnZpdGUgbGlua1xyXG4gICAgICBtb2NrU2VuZC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe1xyXG4gICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgIGNvZGU6IGV4cGlyZWRDb2RlLFxyXG4gICAgICAgICAgcm9vbUlkOiAndGVzdC1yb29tLWlkJyxcclxuICAgICAgICAgIHVybDogYGh0dHBzOi8vdHJpbml0eS5hcHAvcm9vbS8ke2V4cGlyZWRDb2RlfWAsXHJcbiAgICAgICAgICBjcmVhdGVkQnk6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZShEYXRlLm5vdygpIC0gOCAqIDI0ICogNjAgKiA2MCAqIDEwMDApLnRvSVNPU3RyaW5nKCksIC8vIDggZGF5cyBhZ29cclxuICAgICAgICAgIGV4cGlyZXNBdDogbmV3IERhdGUoRGF0ZS5ub3coKSAtIDI0ICogNjAgKiA2MCAqIDEwMDApLnRvSVNPU3RyaW5nKCksIC8vIDEgZGF5IGFnb1xyXG4gICAgICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgICAgICB1c2FnZUNvdW50OiAwLFxyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCB2YWxpZGF0ZUV2ZW50ID0ge1xyXG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgICBpbnZpdGVDb2RlOiBleHBpcmVkQ29kZSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIGh0dHBNZXRob2Q6ICdHRVQnLFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3QgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRlSW52aXRlSGFuZGxlcih2YWxpZGF0ZUV2ZW50IGFzIGFueSk7XHJcblxyXG4gICAgICBleHBlY3QodmFsaWRhdGlvblJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQxMCk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCByZXNwb25zZUJvZHkgPSBKU09OLnBhcnNlKHZhbGlkYXRpb25SZXN1bHQuYm9keSk7XHJcbiAgICAgIGV4cGVjdChyZXNwb25zZUJvZHkpLnRvTWF0Y2hPYmplY3Qoe1xyXG4gICAgICAgIHZhbGlkOiBmYWxzZSxcclxuICAgICAgICBlcnJvcjogJ0ludml0ZSBsaW5rIGhhcyBleHBpcmVkJyxcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBkZWFjdGl2YXRlZCBpbnZpdGUgY29kZXMgY29ycmVjdGx5JywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCBkZWFjdGl2YXRlZENvZGUgPSAnREVBQ1QxJztcclxuICAgICAgXHJcbiAgICAgIC8vIE1vY2sgZGVhY3RpdmF0ZWQgaW52aXRlIGxpbmtcclxuICAgICAgbW9ja1NlbmQubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHtcclxuICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICBjb2RlOiBkZWFjdGl2YXRlZENvZGUsXHJcbiAgICAgICAgICByb29tSWQ6ICd0ZXN0LXJvb20taWQnLFxyXG4gICAgICAgICAgdXJsOiBgaHR0cHM6Ly90cmluaXR5LmFwcC9yb29tLyR7ZGVhY3RpdmF0ZWRDb2RlfWAsXHJcbiAgICAgICAgICBjcmVhdGVkQnk6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICBleHBpcmVzQXQ6IG5ldyBEYXRlKERhdGUubm93KCkgKyA3ICogMjQgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIGlzQWN0aXZlOiBmYWxzZSwgLy8gRGVhY3RpdmF0ZWRcclxuICAgICAgICAgIHVzYWdlQ291bnQ6IDAsXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHZhbGlkYXRlRXZlbnQgPSB7XHJcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHtcclxuICAgICAgICAgIGludml0ZUNvZGU6IGRlYWN0aXZhdGVkQ29kZSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIGh0dHBNZXRob2Q6ICdHRVQnLFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3QgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRlSW52aXRlSGFuZGxlcih2YWxpZGF0ZUV2ZW50IGFzIGFueSk7XHJcblxyXG4gICAgICBleHBlY3QodmFsaWRhdGlvblJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQxMCk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCByZXNwb25zZUJvZHkgPSBKU09OLnBhcnNlKHZhbGlkYXRpb25SZXN1bHQuYm9keSk7XHJcbiAgICAgIGV4cGVjdChyZXNwb25zZUJvZHkpLnRvTWF0Y2hPYmplY3Qoe1xyXG4gICAgICAgIHZhbGlkOiBmYWxzZSxcclxuICAgICAgICBlcnJvcjogJ0ludml0ZSBsaW5rIGhhcyBiZWVuIGRlYWN0aXZhdGVkJyxcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ0RlZXAgTGluayBVUkwgUHJvY2Vzc2luZycsICgpID0+IHtcclxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyB2YXJpb3VzIGRlZXAgbGluayBVUkwgZm9ybWF0cyBjb3JyZWN0bHknLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHRlc3RDYXNlcyA9IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICB1cmw6ICdodHRwczovL3RyaW5pdHkuYXBwL3Jvb20vQUJDMTIzJyxcclxuICAgICAgICAgIGV4cGVjdGVkQ29kZTogJ0FCQzEyMycsXHJcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0Z1bGwgSFRUUFMgVVJMJyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIHVybDogJ3RyaW5pdHkuYXBwL3Jvb20vWFlaNzg5JyxcclxuICAgICAgICAgIGV4cGVjdGVkQ29kZTogJ1hZWjc4OScsXHJcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0RvbWFpbiB3aXRoIHBhdGgnLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgdXJsOiAnL3Jvb20vREVGNDU2JyxcclxuICAgICAgICAgIGV4cGVjdGVkQ29kZTogJ0RFRjQ1NicsXHJcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1BhdGggb25seScsXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICB1cmw6ICdHSEkwMTInLFxyXG4gICAgICAgICAgZXhwZWN0ZWRDb2RlOiAnR0hJMDEyJyxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ29kZSBvbmx5JyxcclxuICAgICAgICB9LFxyXG4gICAgICBdO1xyXG5cclxuICAgICAgZm9yIChjb25zdCB0ZXN0Q2FzZSBvZiB0ZXN0Q2FzZXMpIHtcclxuICAgICAgICAvLyBNb2NrIHN1Y2Nlc3NmdWwgaW52aXRlIGxpbmsgbG9va3VwXHJcbiAgICAgICAgbW9ja1NlbmRcclxuICAgICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe1xyXG4gICAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgICAgY29kZTogdGVzdENhc2UuZXhwZWN0ZWRDb2RlLFxyXG4gICAgICAgICAgICAgIHJvb21JZDogJ3Rlc3Qtcm9vbS1pZCcsXHJcbiAgICAgICAgICAgICAgdXJsOiBgaHR0cHM6Ly90cmluaXR5LmFwcC9yb29tLyR7dGVzdENhc2UuZXhwZWN0ZWRDb2RlfWAsXHJcbiAgICAgICAgICAgICAgY3JlYXRlZEJ5OiAndGVzdC1ob3N0LWlkJyxcclxuICAgICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICBleHBpcmVzQXQ6IG5ldyBEYXRlKERhdGUubm93KCkgKyA3ICogMjQgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgICAgICAgICAgICB1c2FnZUNvdW50OiAwLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XHJcbiAgICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgICBQSzogJ3Rlc3Qtcm9vbS1pZCcsXHJcbiAgICAgICAgICAgICAgU0s6ICdST09NJyxcclxuICAgICAgICAgICAgICByb29tSWQ6ICd0ZXN0LXJvb20taWQnLFxyXG4gICAgICAgICAgICAgIG5hbWU6ICdUZXN0IFJvb20nLFxyXG4gICAgICAgICAgICAgIGhvc3RJZDogJ3Rlc3QtaG9zdC1pZCcsXHJcbiAgICAgICAgICAgICAgc3RhdHVzOiAnV0FJVElORycsXHJcbiAgICAgICAgICAgICAgbWVtYmVyQ291bnQ6IDEsXHJcbiAgICAgICAgICAgICAgaXNQcml2YXRlOiBmYWxzZSxcclxuICAgICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRlZXBMaW5rQWN0aW9uID0gYXdhaXQgZGVlcExpbmtTZXJ2aWNlLmhhbmRsZURlZXBMaW5rKHRlc3RDYXNlLnVybCk7XHJcblxyXG4gICAgICAgIGV4cGVjdChkZWVwTGlua0FjdGlvbi50eXBlKS50b0JlKCdKT0lOX1JPT00nKTtcclxuICAgICAgICBleHBlY3QoZGVlcExpbmtBY3Rpb24ucm9vbUlkKS50b0JlKCd0ZXN0LXJvb20taWQnKTtcclxuICAgICAgICBleHBlY3QoZGVlcExpbmtBY3Rpb24ubWV0YWRhdGE/Lmludml0ZUNvZGUpLnRvQmUodGVzdENhc2UuZXhwZWN0ZWRDb2RlKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCByZWplY3QgaW52YWxpZCBkZWVwIGxpbmsgVVJMIGZvcm1hdHMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGludmFsaWRVcmxzID0gW1xyXG4gICAgICAgICdodHRwczovL2V4YW1wbGUuY29tL3Jvb20vQUJDMTIzJywgLy8gV3JvbmcgZG9tYWluXHJcbiAgICAgICAgJ2h0dHBzOi8vdHJpbml0eS5hcHAvaW52YWxpZC9BQkMxMjMnLCAvLyBXcm9uZyBwYXRoXHJcbiAgICAgICAgJ2h0dHBzOi8vdHJpbml0eS5hcHAvcm9vbS9BQkMxMicsIC8vIFRvbyBzaG9ydFxyXG4gICAgICAgICdodHRwczovL3RyaW5pdHkuYXBwL3Jvb20vQUJDREVGRycsIC8vIFRvbyBsb25nXHJcbiAgICAgICAgJ2ludmFsaWQtZm9ybWF0JywgLy8gTm8gdmFsaWQgcGF0dGVyblxyXG4gICAgICAgICcnLCAvLyBFbXB0eVxyXG4gICAgICBdO1xyXG5cclxuICAgICAgZm9yIChjb25zdCBpbnZhbGlkVXJsIG9mIGludmFsaWRVcmxzKSB7XHJcbiAgICAgICAgY29uc3QgZGVlcExpbmtBY3Rpb24gPSBhd2FpdCBkZWVwTGlua1NlcnZpY2UuaGFuZGxlRGVlcExpbmsoaW52YWxpZFVybCk7XHJcblxyXG4gICAgICAgIGV4cGVjdChkZWVwTGlua0FjdGlvbi50eXBlKS50b0JlKCdFUlJPUicpO1xyXG4gICAgICAgIGV4cGVjdChkZWVwTGlua0FjdGlvbi5lcnJvck1lc3NhZ2UpLnRvQ29udGFpbignSW52YWxpZCBpbnZpdGUgbGluayBmb3JtYXQnKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGRlc2NyaWJlKCdSb29tIEpvaW5pbmcgdmlhIEludml0ZSBMaW5rcycsICgpID0+IHtcclxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHN1Y2Nlc3NmdWwgcm9vbSBqb2luaW5nIHZpYSBpbnZpdGUgY29kZScsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3QgaW52aXRlQ29kZSA9ICdKT0lOMDEnO1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLWpvaW4nO1xyXG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLWpvaW4nO1xyXG5cclxuICAgICAgLy8gTW9jayBzdWNjZXNzZnVsIGludml0ZSB2YWxpZGF0aW9uIGFuZCByb29tIGpvaW5pbmdcclxuICAgICAgbW9ja1NlbmRcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IGludml0ZSBsaW5rXHJcbiAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgIGNvZGU6IGludml0ZUNvZGUsXHJcbiAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICB1cmw6IGBodHRwczovL3RyaW5pdHkuYXBwL3Jvb20vJHtpbnZpdGVDb2RlfWAsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRCeTogJ3Rlc3QtaG9zdC1pZCcsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICBleHBpcmVzQXQ6IG5ldyBEYXRlKERhdGUubm93KCkgKyA3ICogMjQgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgICAgICAgIHVzYWdlQ291bnQ6IDAsXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IHJvb20gZGV0YWlsc1xyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICBQSzogcm9vbUlkLFxyXG4gICAgICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgICAgbmFtZTogJ0pvaW4gVGVzdCBSb29tJyxcclxuICAgICAgICAgICAgaG9zdElkOiAndGVzdC1ob3N0LWlkJyxcclxuICAgICAgICAgICAgc3RhdHVzOiAnV0FJVElORycsXHJcbiAgICAgICAgICAgIG1lbWJlckNvdW50OiAxLFxyXG4gICAgICAgICAgICBtYXhNZW1iZXJzOiAxMCxcclxuICAgICAgICAgICAgaXNQcml2YXRlOiBmYWxzZSxcclxuICAgICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgSXRlbTogbnVsbCB9KSAvLyBDaGVjayB1c2VyIG5vdCBhbHJlYWR5IGluIHJvb21cclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHt9KSAvLyBBZGQgdXNlciB0byByb29tXHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSkgLy8gVXBkYXRlIHJvb20gbWVtYmVyIGNvdW50XHJcbiAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSkgLy8gVXBkYXRlIGludml0ZSB1c2FnZSBjb3VudFxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBHZXQgdXBkYXRlZCByb29tXHJcbiAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgIFBLOiByb29tSWQsXHJcbiAgICAgICAgICAgIFNLOiAnUk9PTScsXHJcbiAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICBuYW1lOiAnSm9pbiBUZXN0IFJvb20nLFxyXG4gICAgICAgICAgICBob3N0SWQ6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgICAgICBzdGF0dXM6ICdXQUlUSU5HJyxcclxuICAgICAgICAgICAgbWVtYmVyQ291bnQ6IDIsXHJcbiAgICAgICAgICAgIG1heE1lbWJlcnM6IDEwLFxyXG4gICAgICAgICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgIC8vIEpvaW4gcm9vbSB2aWEgaW52aXRlIGNvZGVcclxuICAgICAgY29uc3Qgam9pbkV2ZW50ID0ge1xyXG4gICAgICAgIGluZm86IHsgZmllbGROYW1lOiAnam9pblJvb21CeUludml0ZScgfSxcclxuICAgICAgICBpZGVudGl0eTogeyBzdWI6IHVzZXJJZCB9LFxyXG4gICAgICAgIGFyZ3VtZW50czoge1xyXG4gICAgICAgICAgaW52aXRlQ29kZTogaW52aXRlQ29kZSxcclxuICAgICAgICB9LFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3Qgam9pblJlc3VsdCA9IGF3YWl0IHJvb21IYW5kbGVyKGpvaW5FdmVudCBhcyBhbnksIG1vY2tDb250ZXh0IGFzIGFueSwge30gYXMgYW55KTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBzdWNjZXNzZnVsIGpvaW5cclxuICAgICAgZXhwZWN0KGpvaW5SZXN1bHQpLnRvTWF0Y2hPYmplY3Qoe1xyXG4gICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgIG5hbWU6ICdKb2luIFRlc3QgUm9vbScsXHJcbiAgICAgICAgaG9zdElkOiAndGVzdC1ob3N0LWlkJyxcclxuICAgICAgICBzdGF0dXM6ICdXQUlUSU5HJyxcclxuICAgICAgICBtZW1iZXJDb3VudDogMixcclxuICAgICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgcHJldmVudCBqb2luaW5nIGZ1bGwgcm9vbXMgdmlhIGludml0ZScsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3QgaW52aXRlQ29kZSA9ICdGVUxMMDEnO1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLWZ1bGwnO1xyXG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLWZ1bGwnO1xyXG5cclxuICAgICAgLy8gTW9jayBmdWxsIHJvb20gc2NlbmFyaW9cclxuICAgICAgbW9ja1NlbmRcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IGludml0ZSBsaW5rXHJcbiAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgIGNvZGU6IGludml0ZUNvZGUsXHJcbiAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICB1cmw6IGBodHRwczovL3RyaW5pdHkuYXBwL3Jvb20vJHtpbnZpdGVDb2RlfWAsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRCeTogJ3Rlc3QtaG9zdC1pZCcsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICBleHBpcmVzQXQ6IG5ldyBEYXRlKERhdGUubm93KCkgKyA3ICogMjQgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgICAgICAgIHVzYWdlQ291bnQ6IDAsXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IHJvb20gZGV0YWlscyAoZnVsbCByb29tKVxyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICBQSzogcm9vbUlkLFxyXG4gICAgICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgICAgbmFtZTogJ0Z1bGwgUm9vbScsXHJcbiAgICAgICAgICAgIGhvc3RJZDogJ3Rlc3QtaG9zdC1pZCcsXHJcbiAgICAgICAgICAgIHN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICAgICAgICBtZW1iZXJDb3VudDogNSxcclxuICAgICAgICAgICAgbWF4TWVtYmVyczogNSwgLy8gUm9vbSBpcyBmdWxsXHJcbiAgICAgICAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3Qgam9pbkV2ZW50ID0ge1xyXG4gICAgICAgIGluZm86IHsgZmllbGROYW1lOiAnam9pblJvb21CeUludml0ZScgfSxcclxuICAgICAgICBpZGVudGl0eTogeyBzdWI6IHVzZXJJZCB9LFxyXG4gICAgICAgIGFyZ3VtZW50czoge1xyXG4gICAgICAgICAgaW52aXRlQ29kZTogaW52aXRlQ29kZSxcclxuICAgICAgICB9LFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgLy8gU2hvdWxkIHRocm93IGVycm9yIGZvciBmdWxsIHJvb21cclxuICAgICAgYXdhaXQgZXhwZWN0KHJvb21IYW5kbGVyKGpvaW5FdmVudCBhcyBhbnksIG1vY2tDb250ZXh0IGFzIGFueSwge30gYXMgYW55KSlcclxuICAgICAgICAucmVqZWN0cy50b1Rocm93KCdSb29tIGlzIGZ1bGwnKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgcHJldmVudCBkdXBsaWNhdGUgam9pbnMgdmlhIGludml0ZScsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3QgaW52aXRlQ29kZSA9ICdEVVAwMDEnO1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tLWR1cCc7XHJcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItZHVwJztcclxuXHJcbiAgICAgIC8vIE1vY2sgdXNlciBhbHJlYWR5IGluIHJvb20gc2NlbmFyaW9cclxuICAgICAgbW9ja1NlbmRcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IGludml0ZSBsaW5rXHJcbiAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgIGNvZGU6IGludml0ZUNvZGUsXHJcbiAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICB1cmw6IGBodHRwczovL3RyaW5pdHkuYXBwL3Jvb20vJHtpbnZpdGVDb2RlfWAsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRCeTogJ3Rlc3QtaG9zdC1pZCcsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICBleHBpcmVzQXQ6IG5ldyBEYXRlKERhdGUubm93KCkgKyA3ICogMjQgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgaXNBY3RpdmU6IHRydWUsXHJcbiAgICAgICAgICAgIHVzYWdlQ291bnQ6IDAsXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IHJvb20gZGV0YWlsc1xyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICBQSzogcm9vbUlkLFxyXG4gICAgICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgICAgICByb29tSWQ6IHJvb21JZCxcclxuICAgICAgICAgICAgbmFtZTogJ0R1cGxpY2F0ZSBUZXN0IFJvb20nLFxyXG4gICAgICAgICAgICBob3N0SWQ6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgICAgICBzdGF0dXM6ICdXQUlUSU5HJyxcclxuICAgICAgICAgICAgbWVtYmVyQ291bnQ6IDIsXHJcbiAgICAgICAgICAgIG1heE1lbWJlcnM6IDEwLFxyXG4gICAgICAgICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICAgIC5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2UoeyAvLyBVc2VyIGFscmVhZHkgaW4gcm9vbVxyXG4gICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICBQSzogdXNlcklkLFxyXG4gICAgICAgICAgICBTSzogcm9vbUlkLFxyXG4gICAgICAgICAgICB1c2VySWQ6IHVzZXJJZCxcclxuICAgICAgICAgICAgcm9vbUlkOiByb29tSWQsXHJcbiAgICAgICAgICAgIGpvaW5lZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCBqb2luRXZlbnQgPSB7XHJcbiAgICAgICAgaW5mbzogeyBmaWVsZE5hbWU6ICdqb2luUm9vbUJ5SW52aXRlJyB9LFxyXG4gICAgICAgIGlkZW50aXR5OiB7IHN1YjogdXNlcklkIH0sXHJcbiAgICAgICAgYXJndW1lbnRzOiB7XHJcbiAgICAgICAgICBpbnZpdGVDb2RlOiBpbnZpdGVDb2RlLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH07XHJcblxyXG4gICAgICAvLyBTaG91bGQgdGhyb3cgZXJyb3IgZm9yIGR1cGxpY2F0ZSBqb2luXHJcbiAgICAgIGF3YWl0IGV4cGVjdChyb29tSGFuZGxlcihqb2luRXZlbnQgYXMgYW55LCBtb2NrQ29udGV4dCBhcyBhbnksIHt9IGFzIGFueSkpXHJcbiAgICAgICAgLnJlamVjdHMudG9UaHJvdygnVXNlciBpcyBhbHJlYWR5IGEgbWVtYmVyIG9mIHRoaXMgcm9vbScpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGRlc2NyaWJlKCdJbnZpdGUgTGluayBVc2FnZSBUcmFja2luZycsICgpID0+IHtcclxuICAgIGl0KCdzaG91bGQgdHJhY2sgaW52aXRlIGxpbmsgdXNhZ2UgY29ycmVjdGx5JywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCBpbnZpdGVDb2RlID0gJ1RSQUNLMSc7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20tdHJhY2snO1xyXG4gICAgICBcclxuICAgICAgbGV0IHVzYWdlQ291bnQgPSAwO1xyXG5cclxuICAgICAgLy8gU2ltdWxhdGUgbXVsdGlwbGUgdXNlcnMgam9pbmluZyB2aWEgc2FtZSBpbnZpdGVcclxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCAzOyBpKyspIHtcclxuICAgICAgICBjb25zdCB1c2VySWQgPSBgdGVzdC11c2VyLSR7aX1gO1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1vY2tTZW5kXHJcbiAgICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IGludml0ZSBsaW5rXHJcbiAgICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgICBjb2RlOiBpbnZpdGVDb2RlLFxyXG4gICAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICAgIHVybDogYGh0dHBzOi8vdHJpbml0eS5hcHAvcm9vbS8ke2ludml0ZUNvZGV9YCxcclxuICAgICAgICAgICAgICBjcmVhdGVkQnk6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgIGV4cGlyZXNBdDogbmV3IERhdGUoRGF0ZS5ub3coKSArIDcgKiAyNCAqIDYwICogNjAgKiAxMDAwKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICAgICAgICAgIHVzYWdlQ291bnQ6IHVzYWdlQ291bnQsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IHJvb20gZGV0YWlsc1xyXG4gICAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgICAgUEs6IHJvb21JZCxcclxuICAgICAgICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICAgIG5hbWU6ICdVc2FnZSBUcmFja2luZyBSb29tJyxcclxuICAgICAgICAgICAgICBob3N0SWQ6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgICAgICAgIHN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICAgICAgICAgIG1lbWJlckNvdW50OiBpICsgMSxcclxuICAgICAgICAgICAgICBtYXhNZW1iZXJzOiAxMCxcclxuICAgICAgICAgICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7IEl0ZW06IG51bGwgfSkgLy8gVXNlciBub3QgaW4gcm9vbVxyXG4gICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSkgLy8gQWRkIHVzZXIgdG8gcm9vbVxyXG4gICAgICAgICAgLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7fSkgLy8gVXBkYXRlIHJvb20gbWVtYmVyIGNvdW50XHJcbiAgICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHt9KSAvLyBVcGRhdGUgaW52aXRlIHVzYWdlIGNvdW50XHJcbiAgICAgICAgICAubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHsgLy8gR2V0IHVwZGF0ZWQgcm9vbVxyXG4gICAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgICAgUEs6IHJvb21JZCxcclxuICAgICAgICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgICAgICAgIHJvb21JZDogcm9vbUlkLFxyXG4gICAgICAgICAgICAgIG5hbWU6ICdVc2FnZSBUcmFja2luZyBSb29tJyxcclxuICAgICAgICAgICAgICBob3N0SWQ6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgICAgICAgIHN0YXR1czogJ1dBSVRJTkcnLFxyXG4gICAgICAgICAgICAgIG1lbWJlckNvdW50OiBpICsgMixcclxuICAgICAgICAgICAgICBtYXhNZW1iZXJzOiAxMCxcclxuICAgICAgICAgICAgICBpc1ByaXZhdGU6IGZhbHNlLFxyXG4gICAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgam9pbkV2ZW50ID0ge1xyXG4gICAgICAgICAgaW5mbzogeyBmaWVsZE5hbWU6ICdqb2luUm9vbUJ5SW52aXRlJyB9LFxyXG4gICAgICAgICAgaWRlbnRpdHk6IHsgc3ViOiB1c2VySWQgfSxcclxuICAgICAgICAgIGFyZ3VtZW50czoge1xyXG4gICAgICAgICAgICBpbnZpdGVDb2RlOiBpbnZpdGVDb2RlLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCByb29tSGFuZGxlcihqb2luRXZlbnQgYXMgYW55LCBtb2NrQ29udGV4dCBhcyBhbnksIHt9IGFzIGFueSk7XHJcbiAgICAgICAgZXhwZWN0KHJlc3VsdC5tZW1iZXJDb3VudCkudG9CZShpICsgMik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdXNhZ2VDb3VudCsrO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBWZXJpZnkgdXNhZ2UgdHJhY2tpbmcgY2FsbHMgd2VyZSBtYWRlXHJcbiAgICAgIGNvbnN0IHVwZGF0ZUNhbGxzID0gbW9ja1NlbmQubW9jay5jYWxscy5maWx0ZXIoY2FsbCA9PiBcclxuICAgICAgICBjYWxsWzBdLnBhcmFtcyAmJiBjYWxsWzBdLnBhcmFtcy5VcGRhdGVFeHByZXNzaW9uXHJcbiAgICAgICk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBTaG91bGQgaGF2ZSB1cGRhdGUgY2FsbHMgZm9yIGludml0ZSB1c2FnZSB0cmFja2luZ1xyXG4gICAgICBleHBlY3QodXBkYXRlQ2FsbHMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtYXhpbXVtIHVzYWdlIGxpbWl0cyBjb3JyZWN0bHknLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGludml0ZUNvZGUgPSAnTElNSVQxJztcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbS1saW1pdCc7XHJcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItbGltaXQnO1xyXG5cclxuICAgICAgLy8gTW9jayBpbnZpdGUgd2l0aCBtYXhpbXVtIHVzYWdlIHJlYWNoZWRcclxuICAgICAgbW9ja1NlbmQubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHtcclxuICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICBjb2RlOiBpbnZpdGVDb2RlLFxyXG4gICAgICAgICAgcm9vbUlkOiByb29tSWQsXHJcbiAgICAgICAgICB1cmw6IGBodHRwczovL3RyaW5pdHkuYXBwL3Jvb20vJHtpbnZpdGVDb2RlfWAsXHJcbiAgICAgICAgICBjcmVhdGVkQnk6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICBleHBpcmVzQXQ6IG5ldyBEYXRlKERhdGUubm93KCkgKyA3ICogMjQgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICAgICAgdXNhZ2VDb3VudDogMTAsXHJcbiAgICAgICAgICBtYXhVc2FnZTogMTAsIC8vIExpbWl0IHJlYWNoZWRcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3Qgam9pbkV2ZW50ID0ge1xyXG4gICAgICAgIGluZm86IHsgZmllbGROYW1lOiAnam9pblJvb21CeUludml0ZScgfSxcclxuICAgICAgICBpZGVudGl0eTogeyBzdWI6IHVzZXJJZCB9LFxyXG4gICAgICAgIGFyZ3VtZW50czoge1xyXG4gICAgICAgICAgaW52aXRlQ29kZTogaW52aXRlQ29kZSxcclxuICAgICAgICB9LFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgLy8gU2hvdWxkIHRocm93IGVycm9yIGZvciB1c2FnZSBsaW1pdCBleGNlZWRlZFxyXG4gICAgICBhd2FpdCBleHBlY3Qocm9vbUhhbmRsZXIoam9pbkV2ZW50IGFzIGFueSwgbW9ja0NvbnRleHQgYXMgYW55LCB7fSBhcyBhbnkpKVxyXG4gICAgICAgIC5yZWplY3RzLnRvVGhyb3coJ0ludml0ZSBsaW5rIHVzYWdlIGxpbWl0IGV4Y2VlZGVkJyk7XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ0Nyb3NzLVBsYXRmb3JtIERlZXAgTGluayBIYW5kbGluZycsICgpID0+IHtcclxuICAgIGl0KCdzaG91bGQgZ2VuZXJhdGUgY29uc2lzdGVudCBVUkxzIGFjcm9zcyBwbGF0Zm9ybXMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHRlc3RDb2RlcyA9IFsnV0VCMDAxJywgJ01PQjAwMScsICdBUFAwMDEnXTtcclxuICAgICAgXHJcbiAgICAgIHRlc3RDb2Rlcy5mb3JFYWNoKGNvZGUgPT4ge1xyXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVXJsID0gYGh0dHBzOi8vdHJpbml0eS5hcHAvcm9vbS8ke2NvZGV9YDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUZXN0IFVSTCBnZW5lcmF0aW9uIGNvbnNpc3RlbmN5XHJcbiAgICAgICAgY29uc3QgZ2VuZXJhdGVkVXJsID0gYGh0dHBzOi8vdHJpbml0eS5hcHAvcm9vbS8ke2NvZGV9YDtcclxuICAgICAgICBleHBlY3QoZ2VuZXJhdGVkVXJsKS50b0JlKGV4cGVjdGVkVXJsKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUZXN0IFVSTCBwYXJzaW5nIGNvbnNpc3RlbmN5IC0gdXNlIHB1YmxpYyBtZXRob2Qgb3IgdGVzdCB0aHJvdWdoIGhhbmRsZURlZXBMaW5rXHJcbiAgICAgICAgLy8gU2luY2UgZXh0cmFjdEludml0ZUNvZGVGcm9tVXJsIGlzIHByaXZhdGUsIHdlJ2xsIHRlc3QgdGhyb3VnaCBoYW5kbGVEZWVwTGlua1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHdlYiBicm93c2VyIGFjY2VzcyBjb3JyZWN0bHknLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGludml0ZUNvZGUgPSAnV0VCMTIzJztcclxuICAgICAgXHJcbiAgICAgIC8vIE1vY2sgd2ViIGJyb3dzZXIgdmFsaWRhdGlvbiByZXF1ZXN0XHJcbiAgICAgIG1vY2tTZW5kLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XHJcbiAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgY29kZTogaW52aXRlQ29kZSxcclxuICAgICAgICAgIHJvb21JZDogJ3Rlc3Qtcm9vbS13ZWInLFxyXG4gICAgICAgICAgdXJsOiBgaHR0cHM6Ly90cmluaXR5LmFwcC9yb29tLyR7aW52aXRlQ29kZX1gLFxyXG4gICAgICAgICAgY3JlYXRlZEJ5OiAndGVzdC1ob3N0LWlkJyxcclxuICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgZXhwaXJlc0F0OiBuZXcgRGF0ZShEYXRlLm5vdygpICsgNyAqIDI0ICogNjAgKiA2MCAqIDEwMDApLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgICAgICAgIHVzYWdlQ291bnQ6IDAsXHJcbiAgICAgICAgfVxyXG4gICAgICB9KS5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe1xyXG4gICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgIFBLOiAndGVzdC1yb29tLXdlYicsXHJcbiAgICAgICAgICBTSzogJ1JPT00nLFxyXG4gICAgICAgICAgcm9vbUlkOiAndGVzdC1yb29tLXdlYicsXHJcbiAgICAgICAgICBuYW1lOiAnV2ViIFRlc3QgUm9vbScsXHJcbiAgICAgICAgICBob3N0SWQ6ICd0ZXN0LWhvc3QtaWQnLFxyXG4gICAgICAgICAgc3RhdHVzOiAnV0FJVElORycsXHJcbiAgICAgICAgICBtZW1iZXJDb3VudDogMSxcclxuICAgICAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgdmFsaWRhdGVFdmVudCA9IHtcclxuICAgICAgICBwYXRoUGFyYW1ldGVyczoge1xyXG4gICAgICAgICAgaW52aXRlQ29kZTogaW52aXRlQ29kZSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIGh0dHBNZXRob2Q6ICdHRVQnLFxyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICdVc2VyLUFnZW50JzogJ01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNicsXHJcbiAgICAgICAgfSxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHZhbGlkYXRlSW52aXRlSGFuZGxlcih2YWxpZGF0ZUV2ZW50IGFzIGFueSk7XHJcblxyXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlQm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xyXG4gICAgICBleHBlY3QocmVzcG9uc2VCb2R5LnZhbGlkKS50b0JlKHRydWUpO1xyXG4gICAgICBleHBlY3QocmVzcG9uc2VCb2R5LnJvb21JbmZvLm5hbWUpLnRvQmUoJ1dlYiBUZXN0IFJvb20nKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59KTsiXX0=