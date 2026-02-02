"use strict";
/**
 * Unit Tests for Invite Code Uniqueness
 * Feature: trinity-voting-fixes
 *
 * Property 6: Invite Code Uniqueness
 * Validates: Requirements 3.1
 *
 * For any set of generated invite codes, all codes should be unique,
 * exactly 6 characters long, and follow the specified format
 */
Object.defineProperty(exports, "__esModule", { value: true });
// Mock DynamoDB before importing the service
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb', () => {
    const originalModule = jest.requireActual('@aws-sdk/lib-dynamodb');
    return {
        ...originalModule,
        GetCommand: jest.fn(),
        PutCommand: jest.fn(),
        UpdateCommand: jest.fn(),
        QueryCommand: jest.fn(),
        DynamoDBDocumentClient: {
            from: jest.fn(),
        },
    };
});
jest.mock('../utils/metrics');
const deepLinkService_1 = require("../services/deepLinkService");
describe('Invite Code Uniqueness - Unit Tests', () => {
    let mockSend;
    let deepLinkService;
    let mockGetCommand;
    let mockPutCommand;
    let mockUpdateCommand;
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock environment variables
        process.env.INVITE_LINKS_TABLE = 'test-invite-links-table';
        process.env.ROOMS_TABLE = 'test-rooms-table';
        // Create mock send function
        mockSend = jest.fn();
        // Get the mocked command constructors
        const { GetCommand, PutCommand, UpdateCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
        mockGetCommand = GetCommand;
        mockPutCommand = PutCommand;
        mockUpdateCommand = UpdateCommand;
        // Mock DynamoDB client and document client
        const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
        DynamoDBClient.mockImplementation(() => ({}));
        const mockDocClient = {
            send: mockSend,
        };
        DynamoDBDocumentClient.from = jest.fn().mockReturnValue(mockDocClient);
        // Create service instance with mocked client
        deepLinkService = new deepLinkService_1.DeepLinkService(mockDocClient);
    });
    describe('Property 6: Invite Code Uniqueness', () => {
        it('should generate unique invite codes for multiple rooms', async () => {
            const roomIds = ['room1', 'room2', 'room3', 'room4', 'room5'];
            const userId = 'test-user';
            const generatedCodes = new Set();
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                // Mock GetCommand for code existence check (always return not found)
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({ Item: null });
                }
                // Mock PutCommand for storing invite links
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            // Generate invite links for all rooms
            const inviteLinks = await Promise.all(roomIds.map(roomId => deepLinkService.generateInviteLink(roomId, userId)));
            // Verify all codes are unique
            inviteLinks.forEach(invite => {
                expect(generatedCodes.has(invite.code)).toBe(false);
                generatedCodes.add(invite.code);
            });
            expect(generatedCodes.size).toBe(roomIds.length);
        });
        it('should generate codes that are exactly 6 characters long', async () => {
            const roomId = 'test-room';
            const userId = 'test-user';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({ Item: null });
                }
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            // Generate multiple invite codes
            const inviteLinks = await Promise.all(Array.from({ length: 10 }, () => deepLinkService.generateInviteLink(roomId, userId)));
            // Verify all codes are exactly 6 characters
            inviteLinks.forEach(invite => {
                expect(invite.code).toHaveLength(6);
            });
        });
        it('should generate codes using only valid characters (A-Z, 0-9)', async () => {
            const roomId = 'test-room';
            const userId = 'test-user';
            const validChars = /^[A-Z0-9]+$/;
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({ Item: null });
                }
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            // Generate multiple invite codes
            const inviteLinks = await Promise.all(Array.from({ length: 20 }, () => deepLinkService.generateInviteLink(roomId, userId)));
            // Verify all codes use only valid characters
            inviteLinks.forEach(invite => {
                expect(invite.code).toMatch(validChars);
            });
        });
        it('should handle code collisions by retrying generation', async () => {
            const roomId = 'test-room';
            const userId = 'test-user';
            let callCount = 0;
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations with collision simulation
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    callCount++;
                    // Simulate collision for first 2 attempts, then success
                    if (callCount <= 2) {
                        return Promise.resolve({ Item: { code: 'EXISTING' } });
                    }
                    else {
                        return Promise.resolve({ Item: null });
                    }
                }
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            // Generate invite link (should succeed after retries)
            const inviteLink = await deepLinkService.generateInviteLink(roomId, userId);
            expect(inviteLink.code).toHaveLength(6);
            expect(callCount).toBeGreaterThan(2); // Should have retried
        });
        it('should create proper URL format for invite links', async () => {
            const roomId = 'test-room';
            const userId = 'test-user';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({ Item: null });
                }
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            const inviteLink = await deepLinkService.generateInviteLink(roomId, userId);
            // Verify URL format
            expect(inviteLink.url).toBe(`https://trinity.app/room/${inviteLink.code}`);
            expect(inviteLink.url).toMatch(/^https:\/\/trinity\.app\/room\/[A-Z0-9]{6}$/);
        });
        it('should set proper expiry time for invite links', async () => {
            const roomId = 'test-room';
            const userId = 'test-user';
            const customExpiryHours = 24;
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({ Item: null });
                }
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            const beforeGeneration = Date.now();
            const inviteLink = await deepLinkService.generateInviteLink(roomId, userId, {
                expiryHours: customExpiryHours,
            });
            const afterGeneration = Date.now();
            const expiryTime = new Date(inviteLink.expiresAt).getTime();
            const expectedMinExpiry = beforeGeneration + (customExpiryHours * 60 * 60 * 1000);
            const expectedMaxExpiry = afterGeneration + (customExpiryHours * 60 * 60 * 1000);
            expect(expiryTime).toBeGreaterThanOrEqual(expectedMinExpiry);
            expect(expiryTime).toBeLessThanOrEqual(expectedMaxExpiry);
        });
        it('should initialize invite links with correct default values', async () => {
            const roomId = 'test-room';
            const userId = 'test-user';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({ Item: null });
                }
                if (command.constructor.name === 'PutCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });
            const inviteLink = await deepLinkService.generateInviteLink(roomId, userId);
            // Verify default values
            expect(inviteLink.roomId).toBe(roomId);
            expect(inviteLink.createdBy).toBe(userId);
            expect(inviteLink.isActive).toBe(true);
            expect(inviteLink.usageCount).toBe(0);
            expect(inviteLink.maxUsage).toBeUndefined();
            expect(typeof inviteLink.createdAt).toBe('string');
            expect(new Date(inviteLink.createdAt).getTime()).toBeGreaterThan(0);
        });
    });
    describe('Invite Code Validation', () => {
        it('should validate existing active invite codes', async () => {
            const inviteCode = 'ABC123';
            const roomId = 'test-room';
            // Mock command constructors to capture arguments
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockPutCommand.mockImplementation((args) => ({
                constructor: { name: 'PutCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                // Handle different command types
                if (command.constructor.name === 'GetCommand') {
                    const args = command.input || {};
                    const key = args.Key || {};
                    // Check for invite code lookup
                    if (key.PK === inviteCode && key.SK === 'INVITE') {
                        return Promise.resolve({
                            Item: {
                                code: inviteCode,
                                roomId,
                                isActive: true,
                                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                                usageCount: 0,
                            }
                        });
                    }
                    // Check for room lookup
                    if (key.PK === roomId && key.SK === 'ROOM') {
                        return Promise.resolve({
                            Item: {
                                roomId,
                                name: 'Test Room',
                                hostId: 'host-user',
                                status: 'ACTIVE',
                                memberCount: 5,
                                isPrivate: false,
                                createdAt: new Date().toISOString(),
                            }
                        });
                    }
                }
                return Promise.resolve({ Item: null });
            });
            const roomInfo = await deepLinkService.validateInviteCode(inviteCode);
            expect(roomInfo).not.toBeNull();
            expect(roomInfo?.roomId).toBe(roomId);
            expect(roomInfo?.name).toBe('Test Room');
        });
        it('should reject expired invite codes', async () => {
            const inviteCode = 'EXPIRED';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockUpdateCommand.mockImplementation((args) => ({
                constructor: { name: 'UpdateCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    const key = command.input?.Key || {};
                    if (key.PK === inviteCode && key.SK === 'INVITE') {
                        return Promise.resolve({
                            Item: {
                                code: inviteCode,
                                roomId: 'test-room',
                                isActive: true,
                                expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Expired
                                usageCount: 0,
                            }
                        });
                    }
                }
                // Mock deactivation update
                if (command.constructor.name === 'UpdateCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({ Item: null });
            });
            const roomInfo = await deepLinkService.validateInviteCode(inviteCode);
            expect(roomInfo).toBeNull();
        });
        it('should reject inactive invite codes', async () => {
            const inviteCode = 'INACTIVE';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    const key = command.input?.Key || {};
                    if (key.PK === inviteCode && key.SK === 'INVITE') {
                        return Promise.resolve({
                            Item: {
                                code: inviteCode,
                                roomId: 'test-room',
                                isActive: false, // Inactive
                                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                                usageCount: 0,
                            }
                        });
                    }
                }
                return Promise.resolve({ Item: null });
            });
            const roomInfo = await deepLinkService.validateInviteCode(inviteCode);
            expect(roomInfo).toBeNull();
        });
        it('should reject codes that have reached usage limit', async () => {
            const inviteCode = 'MAXUSED';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockUpdateCommand.mockImplementation((args) => ({
                constructor: { name: 'UpdateCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    const key = command.input?.Key || {};
                    if (key.PK === inviteCode && key.SK === 'INVITE') {
                        return Promise.resolve({
                            Item: {
                                code: inviteCode,
                                roomId: 'test-room',
                                isActive: true,
                                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                                usageCount: 5,
                                maxUsage: 5, // Reached limit
                            }
                        });
                    }
                }
                // Mock deactivation update
                if (command.constructor.name === 'UpdateCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({ Item: null });
            });
            const roomInfo = await deepLinkService.validateInviteCode(inviteCode);
            expect(roomInfo).toBeNull();
        });
    });
    describe('Deep Link URL Parsing', () => {
        it('should extract invite codes from various URL formats', async () => {
            const testCases = [
                { url: 'https://trinity.app/room/ABC123', expected: 'ABC123' },
                { url: 'trinity.app/room/XYZ789', expected: 'XYZ789' },
                { url: '/room/DEF456', expected: 'DEF456' },
                { url: 'GHI789', expected: 'GHI789' },
            ];
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            mockUpdateCommand.mockImplementation((args) => ({
                constructor: { name: 'UpdateCommand' },
                input: args,
            }));
            // Mock successful validation for all codes
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    const key = command.input?.Key || {};
                    const code = key.PK;
                    if (key.SK === 'INVITE') {
                        return Promise.resolve({
                            Item: {
                                code,
                                roomId: 'test-room',
                                isActive: true,
                                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                                usageCount: 0,
                            }
                        });
                    }
                    if (key.SK === 'ROOM') {
                        return Promise.resolve({
                            Item: {
                                roomId: 'test-room',
                                name: 'Test Room',
                                hostId: 'host-user',
                                status: 'ACTIVE',
                                memberCount: 1,
                                isPrivate: false,
                                createdAt: new Date().toISOString(),
                            }
                        });
                    }
                }
                // Mock usage count increment
                if (command.constructor.name === 'UpdateCommand') {
                    return Promise.resolve({});
                }
                return Promise.resolve({ Item: null });
            });
            for (const testCase of testCases) {
                const action = await deepLinkService.handleDeepLink(testCase.url);
                expect(action.type).toBe('JOIN_ROOM');
                expect(action.roomId).toBe('test-room');
                expect(action.metadata?.inviteCode).toBe(testCase.expected);
            }
        });
        it('should reject invalid URL formats', async () => {
            const invalidUrls = [
                'https://example.com/room/ABC123',
                'trinity.app/invalid/ABC123',
                '/invalid/ABC123',
                'TOOLONG123',
                'SHORT',
                '',
            ];
            for (const url of invalidUrls) {
                const action = await deepLinkService.handleDeepLink(url);
                expect(action.type).toBe('ERROR');
                expect(action.errorMessage).toContain('Invalid invite link format');
            }
        });
    });
    describe('Invite Link Management', () => {
        it('should deactivate invite codes', async () => {
            const inviteCode = 'DEACTIVATE';
            // Mock command constructors
            mockUpdateCommand.mockImplementation((args) => ({
                constructor: { name: 'UpdateCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockResolvedValue({});
            await deepLinkService.deactivateInviteCode(inviteCode);
            // Verify UpdateCommand was called
            expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
                constructor: expect.objectContaining({
                    name: 'UpdateCommand'
                })
            }));
        });
        it('should get invite statistics', async () => {
            const inviteCode = 'STATS123';
            // Mock command constructors
            mockGetCommand.mockImplementation((args) => ({
                constructor: { name: 'GetCommand' },
                input: args,
            }));
            // Mock DynamoDB operations
            mockSend.mockImplementation((command) => {
                if (command.constructor.name === 'GetCommand') {
                    return Promise.resolve({
                        Item: {
                            code: inviteCode,
                            usageCount: 3,
                            maxUsage: 10,
                            isActive: true,
                            expiresAt: '2024-12-31T23:59:59.999Z',
                            createdAt: '2024-01-01T00:00:00.000Z',
                        }
                    });
                }
                return Promise.resolve({ Item: null });
            });
            const stats = await deepLinkService.getInviteStats(inviteCode);
            expect(stats).not.toBeNull();
            expect(stats?.code).toBe(inviteCode);
            expect(stats?.usageCount).toBe(3);
            expect(stats?.maxUsage).toBe(10);
            expect(stats?.isActive).toBe(true);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW52aXRlLWNvZGUtdW5pcXVlbmVzcy50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaW52aXRlLWNvZGUtdW5pcXVlbmVzcy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7O0dBU0c7O0FBRUgsNkNBQTZDO0FBQzdDLElBQUksQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUN0QyxJQUFJLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtJQUN0QyxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLHVCQUF1QixDQUFDLENBQUM7SUFDbkUsT0FBTztRQUNMLEdBQUcsY0FBYztRQUNqQixVQUFVLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtRQUNyQixVQUFVLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtRQUNyQixhQUFhLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtRQUN4QixZQUFZLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtRQUN2QixzQkFBc0IsRUFBRTtZQUN0QixJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtTQUNoQjtLQUNGLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUNILElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUU5QixpRUFBOEQ7QUFFOUQsUUFBUSxDQUFDLHFDQUFxQyxFQUFFLEdBQUcsRUFBRTtJQUNuRCxJQUFJLFFBQW1CLENBQUM7SUFDeEIsSUFBSSxlQUFnQyxDQUFDO0lBQ3JDLElBQUksY0FBeUIsQ0FBQztJQUM5QixJQUFJLGNBQXlCLENBQUM7SUFDOUIsSUFBSSxpQkFBNEIsQ0FBQztJQUVqQyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBRXJCLDZCQUE2QjtRQUM3QixPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixHQUFHLHlCQUF5QixDQUFD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biAqIFVuaXQgVGVzdHMgZm9yIEludml0ZSBDb2RlIFVuaXF1ZW5lc3NcclxuICogRmVhdHVyZTogdHJpbml0eS12b3RpbmctZml4ZXNcclxuICogXHJcbiAqIFByb3BlcnR5IDY6IEludml0ZSBDb2RlIFVuaXF1ZW5lc3NcclxuICogVmFsaWRhdGVzOiBSZXF1aXJlbWVudHMgMy4xXHJcbiAqIFxyXG4gKiBGb3IgYW55IHNldCBvZiBnZW5lcmF0ZWQgaW52aXRlIGNvZGVzLCBhbGwgY29kZXMgc2hvdWxkIGJlIHVuaXF1ZSwgXHJcbiAqIGV4YWN0bHkgNiBjaGFyYWN0ZXJzIGxvbmcsIGFuZCBmb2xsb3cgdGhlIHNwZWNpZmllZCBmb3JtYXRcclxuICovXHJcblxyXG4vLyBNb2NrIER5bmFtb0RCIGJlZm9yZSBpbXBvcnRpbmcgdGhlIHNlcnZpY2VcclxuamVzdC5tb2NrKCdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInKTtcclxuamVzdC5tb2NrKCdAYXdzLXNkay9saWItZHluYW1vZGInLCAoKSA9PiB7XHJcbiAgY29uc3Qgb3JpZ2luYWxNb2R1bGUgPSBqZXN0LnJlcXVpcmVBY3R1YWwoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG4gIHJldHVybiB7XHJcbiAgICAuLi5vcmlnaW5hbE1vZHVsZSxcclxuICAgIEdldENvbW1hbmQ6IGplc3QuZm4oKSxcclxuICAgIFB1dENvbW1hbmQ6IGplc3QuZm4oKSxcclxuICAgIFVwZGF0ZUNvbW1hbmQ6IGplc3QuZm4oKSxcclxuICAgIFF1ZXJ5Q29tbWFuZDogamVzdC5mbigpLFxyXG4gICAgRHluYW1vREJEb2N1bWVudENsaWVudDoge1xyXG4gICAgICBmcm9tOiBqZXN0LmZuKCksXHJcbiAgICB9LFxyXG4gIH07XHJcbn0pO1xyXG5qZXN0Lm1vY2soJy4uL3V0aWxzL21ldHJpY3MnKTtcclxuXHJcbmltcG9ydCB7IERlZXBMaW5rU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2RlZXBMaW5rU2VydmljZSc7XHJcblxyXG5kZXNjcmliZSgnSW52aXRlIENvZGUgVW5pcXVlbmVzcyAtIFVuaXQgVGVzdHMnLCAoKSA9PiB7XHJcbiAgbGV0IG1vY2tTZW5kOiBqZXN0Lk1vY2s7XHJcbiAgbGV0IGRlZXBMaW5rU2VydmljZTogRGVlcExpbmtTZXJ2aWNlO1xyXG4gIGxldCBtb2NrR2V0Q29tbWFuZDogamVzdC5Nb2NrO1xyXG4gIGxldCBtb2NrUHV0Q29tbWFuZDogamVzdC5Nb2NrO1xyXG4gIGxldCBtb2NrVXBkYXRlQ29tbWFuZDogamVzdC5Nb2NrO1xyXG5cclxuICBiZWZvcmVFYWNoKCgpID0+IHtcclxuICAgIGplc3QuY2xlYXJBbGxNb2NrcygpO1xyXG4gICAgXHJcbiAgICAvLyBNb2NrIGVudmlyb25tZW50IHZhcmlhYmxlc1xyXG4gICAgcHJvY2Vzcy5lbnYuSU5WSVRFX0xJTktTX1RBQkxFID0gJ3Rlc3QtaW52aXRlLWxpbmtzLXRhYmxlJztcclxuICAgIHByb2Nlc3MuZW52LlJPT01TX1RBQkxFID0gJ3Rlc3Qtcm9vbXMtdGFibGUnO1xyXG5cclxuICAgIC8vIENyZWF0ZSBtb2NrIHNlbmQgZnVuY3Rpb25cclxuICAgIG1vY2tTZW5kID0gamVzdC5mbigpO1xyXG5cclxuICAgIC8vIEdldCB0aGUgbW9ja2VkIGNvbW1hbmQgY29uc3RydWN0b3JzXHJcbiAgICBjb25zdCB7IEdldENvbW1hbmQsIFB1dENvbW1hbmQsIFVwZGF0ZUNvbW1hbmQsIER5bmFtb0RCRG9jdW1lbnRDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG4gICAgbW9ja0dldENvbW1hbmQgPSBHZXRDb21tYW5kIGFzIGplc3QuTW9jaztcclxuICAgIG1vY2tQdXRDb21tYW5kID0gUHV0Q29tbWFuZCBhcyBqZXN0Lk1vY2s7XHJcbiAgICBtb2NrVXBkYXRlQ29tbWFuZCA9IFVwZGF0ZUNvbW1hbmQgYXMgamVzdC5Nb2NrO1xyXG5cclxuICAgIC8vIE1vY2sgRHluYW1vREIgY2xpZW50IGFuZCBkb2N1bWVudCBjbGllbnRcclxuICAgIGNvbnN0IHsgRHluYW1vREJDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYicpO1xyXG4gICAgXHJcbiAgICBEeW5hbW9EQkNsaWVudC5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4gKHt9KSk7XHJcbiAgICBjb25zdCBtb2NrRG9jQ2xpZW50ID0ge1xyXG4gICAgICBzZW5kOiBtb2NrU2VuZCxcclxuICAgIH07XHJcbiAgICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20gPSBqZXN0LmZuKCkubW9ja1JldHVyblZhbHVlKG1vY2tEb2NDbGllbnQpO1xyXG5cclxuICAgIC8vIENyZWF0ZSBzZXJ2aWNlIGluc3RhbmNlIHdpdGggbW9ja2VkIGNsaWVudFxyXG4gICAgZGVlcExpbmtTZXJ2aWNlID0gbmV3IERlZXBMaW5rU2VydmljZShtb2NrRG9jQ2xpZW50IGFzIGFueSk7XHJcbiAgfSk7XHJcblxyXG4gIGRlc2NyaWJlKCdQcm9wZXJ0eSA2OiBJbnZpdGUgQ29kZSBVbmlxdWVuZXNzJywgKCkgPT4ge1xyXG4gICAgaXQoJ3Nob3VsZCBnZW5lcmF0ZSB1bmlxdWUgaW52aXRlIGNvZGVzIGZvciBtdWx0aXBsZSByb29tcycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3Qgcm9vbUlkcyA9IFsncm9vbTEnLCAncm9vbTInLCAncm9vbTMnLCAncm9vbTQnLCAncm9vbTUnXTtcclxuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlcic7XHJcbiAgICAgIGNvbnN0IGdlbmVyYXRlZENvZGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XHJcblxyXG4gICAgICAvLyBNb2NrIGNvbW1hbmQgY29uc3RydWN0b3JzXHJcbiAgICAgIG1vY2tHZXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnR2V0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG4gICAgICBcclxuICAgICAgbW9ja1B1dENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdQdXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgbW9ja1NlbmQubW9ja0ltcGxlbWVudGF0aW9uKChjb21tYW5kKSA9PiB7XHJcbiAgICAgICAgLy8gTW9jayBHZXRDb21tYW5kIGZvciBjb2RlIGV4aXN0ZW5jZSBjaGVjayAoYWx3YXlzIHJldHVybiBub3QgZm91bmQpXHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ0dldENvbW1hbmQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbTogbnVsbCB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gTW9jayBQdXRDb21tYW5kIGZvciBzdG9yaW5nIGludml0ZSBsaW5rc1xyXG4gICAgICAgIGlmIChjb21tYW5kLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdQdXRDb21tYW5kJykge1xyXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIEdlbmVyYXRlIGludml0ZSBsaW5rcyBmb3IgYWxsIHJvb21zXHJcbiAgICAgIGNvbnN0IGludml0ZUxpbmtzID0gYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICAgICAgcm9vbUlkcy5tYXAocm9vbUlkID0+IGRlZXBMaW5rU2VydmljZS5nZW5lcmF0ZUludml0ZUxpbmsocm9vbUlkLCB1c2VySWQpKVxyXG4gICAgICApO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IGFsbCBjb2RlcyBhcmUgdW5pcXVlXHJcbiAgICAgIGludml0ZUxpbmtzLmZvckVhY2goaW52aXRlID0+IHtcclxuICAgICAgICBleHBlY3QoZ2VuZXJhdGVkQ29kZXMuaGFzKGludml0ZS5jb2RlKSkudG9CZShmYWxzZSk7XHJcbiAgICAgICAgZ2VuZXJhdGVkQ29kZXMuYWRkKGludml0ZS5jb2RlKTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBleHBlY3QoZ2VuZXJhdGVkQ29kZXMuc2l6ZSkudG9CZShyb29tSWRzLmxlbmd0aCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGdlbmVyYXRlIGNvZGVzIHRoYXQgYXJlIGV4YWN0bHkgNiBjaGFyYWN0ZXJzIGxvbmcnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20nO1xyXG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyJztcclxuXHJcbiAgICAgIC8vIE1vY2sgY29tbWFuZCBjb25zdHJ1Y3RvcnNcclxuICAgICAgbW9ja0dldENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdHZXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcbiAgICAgIFxyXG4gICAgICBtb2NrUHV0Q29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ1B1dENvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBtb2NrU2VuZC5tb2NrSW1wbGVtZW50YXRpb24oKGNvbW1hbmQpID0+IHtcclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnR2V0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBJdGVtOiBudWxsIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnUHV0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBHZW5lcmF0ZSBtdWx0aXBsZSBpbnZpdGUgY29kZXNcclxuICAgICAgY29uc3QgaW52aXRlTGlua3MgPSBhd2FpdCBQcm9taXNlLmFsbChcclxuICAgICAgICBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMCB9LCAoKSA9PiBcclxuICAgICAgICAgIGRlZXBMaW5rU2VydmljZS5nZW5lcmF0ZUludml0ZUxpbmsocm9vbUlkLCB1c2VySWQpXHJcbiAgICAgICAgKVxyXG4gICAgICApO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IGFsbCBjb2RlcyBhcmUgZXhhY3RseSA2IGNoYXJhY3RlcnNcclxuICAgICAgaW52aXRlTGlua3MuZm9yRWFjaChpbnZpdGUgPT4ge1xyXG4gICAgICAgIGV4cGVjdChpbnZpdGUuY29kZSkudG9IYXZlTGVuZ3RoKDYpO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgZ2VuZXJhdGUgY29kZXMgdXNpbmcgb25seSB2YWxpZCBjaGFyYWN0ZXJzIChBLVosIDAtOSknLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20nO1xyXG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyJztcclxuICAgICAgY29uc3QgdmFsaWRDaGFycyA9IC9eW0EtWjAtOV0rJC87XHJcblxyXG4gICAgICAvLyBNb2NrIGNvbW1hbmQgY29uc3RydWN0b3JzXHJcbiAgICAgIG1vY2tHZXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnR2V0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG4gICAgICBcclxuICAgICAgbW9ja1B1dENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdQdXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgbW9ja1NlbmQubW9ja0ltcGxlbWVudGF0aW9uKChjb21tYW5kKSA9PiB7XHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ0dldENvbW1hbmQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbTogbnVsbCB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ1B1dENvbW1hbmQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gR2VuZXJhdGUgbXVsdGlwbGUgaW52aXRlIGNvZGVzXHJcbiAgICAgIGNvbnN0IGludml0ZUxpbmtzID0gYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICAgICAgQXJyYXkuZnJvbSh7IGxlbmd0aDogMjAgfSwgKCkgPT4gXHJcbiAgICAgICAgICBkZWVwTGlua1NlcnZpY2UuZ2VuZXJhdGVJbnZpdGVMaW5rKHJvb21JZCwgdXNlcklkKVxyXG4gICAgICAgIClcclxuICAgICAgKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBhbGwgY29kZXMgdXNlIG9ubHkgdmFsaWQgY2hhcmFjdGVyc1xyXG4gICAgICBpbnZpdGVMaW5rcy5mb3JFYWNoKGludml0ZSA9PiB7XHJcbiAgICAgICAgZXhwZWN0KGludml0ZS5jb2RlKS50b01hdGNoKHZhbGlkQ2hhcnMpO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGNvZGUgY29sbGlzaW9ucyBieSByZXRyeWluZyBnZW5lcmF0aW9uJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tJztcclxuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlcic7XHJcbiAgICAgIGxldCBjYWxsQ291bnQgPSAwO1xyXG5cclxuICAgICAgLy8gTW9jayBjb21tYW5kIGNvbnN0cnVjdG9yc1xyXG4gICAgICBtb2NrR2V0Q29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ0dldENvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuICAgICAgXHJcbiAgICAgIG1vY2tQdXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnUHV0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zIHdpdGggY29sbGlzaW9uIHNpbXVsYXRpb25cclxuICAgICAgbW9ja1NlbmQubW9ja0ltcGxlbWVudGF0aW9uKChjb21tYW5kKSA9PiB7XHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ0dldENvbW1hbmQnKSB7XHJcbiAgICAgICAgICBjYWxsQ291bnQrKztcclxuICAgICAgICAgIC8vIFNpbXVsYXRlIGNvbGxpc2lvbiBmb3IgZmlyc3QgMiBhdHRlbXB0cywgdGhlbiBzdWNjZXNzXHJcbiAgICAgICAgICBpZiAoY2FsbENvdW50IDw9IDIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW06IHsgY29kZTogJ0VYSVNUSU5HJyB9IH0pO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW06IG51bGwgfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjb21tYW5kLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdQdXRDb21tYW5kJykge1xyXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIEdlbmVyYXRlIGludml0ZSBsaW5rIChzaG91bGQgc3VjY2VlZCBhZnRlciByZXRyaWVzKVxyXG4gICAgICBjb25zdCBpbnZpdGVMaW5rID0gYXdhaXQgZGVlcExpbmtTZXJ2aWNlLmdlbmVyYXRlSW52aXRlTGluayhyb29tSWQsIHVzZXJJZCk7XHJcblxyXG4gICAgICBleHBlY3QoaW52aXRlTGluay5jb2RlKS50b0hhdmVMZW5ndGgoNik7XHJcbiAgICAgIGV4cGVjdChjYWxsQ291bnQpLnRvQmVHcmVhdGVyVGhhbigyKTsgLy8gU2hvdWxkIGhhdmUgcmV0cmllZFxyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgcHJvcGVyIFVSTCBmb3JtYXQgZm9yIGludml0ZSBsaW5rcycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3Qgcm9vbUlkID0gJ3Rlc3Qtcm9vbSc7XHJcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXInO1xyXG5cclxuICAgICAgLy8gTW9jayBjb21tYW5kIGNvbnN0cnVjdG9yc1xyXG4gICAgICBtb2NrR2V0Q29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ0dldENvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuICAgICAgXHJcbiAgICAgIG1vY2tQdXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnUHV0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zXHJcbiAgICAgIG1vY2tTZW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoY29tbWFuZCkgPT4ge1xyXG4gICAgICAgIGlmIChjb21tYW5kLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdHZXRDb21tYW5kJykge1xyXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW06IG51bGwgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjb21tYW5kLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdQdXRDb21tYW5kJykge1xyXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IGludml0ZUxpbmsgPSBhd2FpdCBkZWVwTGlua1NlcnZpY2UuZ2VuZXJhdGVJbnZpdGVMaW5rKHJvb21JZCwgdXNlcklkKTtcclxuXHJcbiAgICAgIC8vIFZlcmlmeSBVUkwgZm9ybWF0XHJcbiAgICAgIGV4cGVjdChpbnZpdGVMaW5rLnVybCkudG9CZShgaHR0cHM6Ly90cmluaXR5LmFwcC9yb29tLyR7aW52aXRlTGluay5jb2RlfWApO1xyXG4gICAgICBleHBlY3QoaW52aXRlTGluay51cmwpLnRvTWF0Y2goL15odHRwczpcXC9cXC90cmluaXR5XFwuYXBwXFwvcm9vbVxcL1tBLVowLTldezZ9JC8pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCBzZXQgcHJvcGVyIGV4cGlyeSB0aW1lIGZvciBpbnZpdGUgbGlua3MnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20nO1xyXG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyJztcclxuICAgICAgY29uc3QgY3VzdG9tRXhwaXJ5SG91cnMgPSAyNDtcclxuXHJcbiAgICAgIC8vIE1vY2sgY29tbWFuZCBjb25zdHJ1Y3RvcnNcclxuICAgICAgbW9ja0dldENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdHZXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcbiAgICAgIFxyXG4gICAgICBtb2NrUHV0Q29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ1B1dENvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBtb2NrU2VuZC5tb2NrSW1wbGVtZW50YXRpb24oKGNvbW1hbmQpID0+IHtcclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnR2V0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBJdGVtOiBudWxsIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnUHV0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCBiZWZvcmVHZW5lcmF0aW9uID0gRGF0ZS5ub3coKTtcclxuICAgICAgY29uc3QgaW52aXRlTGluayA9IGF3YWl0IGRlZXBMaW5rU2VydmljZS5nZW5lcmF0ZUludml0ZUxpbmsocm9vbUlkLCB1c2VySWQsIHtcclxuICAgICAgICBleHBpcnlIb3VyczogY3VzdG9tRXhwaXJ5SG91cnMsXHJcbiAgICAgIH0pO1xyXG4gICAgICBjb25zdCBhZnRlckdlbmVyYXRpb24gPSBEYXRlLm5vdygpO1xyXG5cclxuICAgICAgY29uc3QgZXhwaXJ5VGltZSA9IG5ldyBEYXRlKGludml0ZUxpbmsuZXhwaXJlc0F0KS5nZXRUaW1lKCk7XHJcbiAgICAgIGNvbnN0IGV4cGVjdGVkTWluRXhwaXJ5ID0gYmVmb3JlR2VuZXJhdGlvbiArIChjdXN0b21FeHBpcnlIb3VycyAqIDYwICogNjAgKiAxMDAwKTtcclxuICAgICAgY29uc3QgZXhwZWN0ZWRNYXhFeHBpcnkgPSBhZnRlckdlbmVyYXRpb24gKyAoY3VzdG9tRXhwaXJ5SG91cnMgKiA2MCAqIDYwICogMTAwMCk7XHJcblxyXG4gICAgICBleHBlY3QoZXhwaXJ5VGltZSkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbChleHBlY3RlZE1pbkV4cGlyeSk7XHJcbiAgICAgIGV4cGVjdChleHBpcnlUaW1lKS50b0JlTGVzc1RoYW5PckVxdWFsKGV4cGVjdGVkTWF4RXhwaXJ5KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0KCdzaG91bGQgaW5pdGlhbGl6ZSBpbnZpdGUgbGlua3Mgd2l0aCBjb3JyZWN0IGRlZmF1bHQgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByb29tSWQgPSAndGVzdC1yb29tJztcclxuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlcic7XHJcblxyXG4gICAgICAvLyBNb2NrIGNvbW1hbmQgY29uc3RydWN0b3JzXHJcbiAgICAgIG1vY2tHZXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnR2V0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG4gICAgICBcclxuICAgICAgbW9ja1B1dENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdQdXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgbW9ja1NlbmQubW9ja0ltcGxlbWVudGF0aW9uKChjb21tYW5kKSA9PiB7XHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ0dldENvbW1hbmQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbTogbnVsbCB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ1B1dENvbW1hbmQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgaW52aXRlTGluayA9IGF3YWl0IGRlZXBMaW5rU2VydmljZS5nZW5lcmF0ZUludml0ZUxpbmsocm9vbUlkLCB1c2VySWQpO1xyXG5cclxuICAgICAgLy8gVmVyaWZ5IGRlZmF1bHQgdmFsdWVzXHJcbiAgICAgIGV4cGVjdChpbnZpdGVMaW5rLnJvb21JZCkudG9CZShyb29tSWQpO1xyXG4gICAgICBleHBlY3QoaW52aXRlTGluay5jcmVhdGVkQnkpLnRvQmUodXNlcklkKTtcclxuICAgICAgZXhwZWN0KGludml0ZUxpbmsuaXNBY3RpdmUpLnRvQmUodHJ1ZSk7XHJcbiAgICAgIGV4cGVjdChpbnZpdGVMaW5rLnVzYWdlQ291bnQpLnRvQmUoMCk7XHJcbiAgICAgIGV4cGVjdChpbnZpdGVMaW5rLm1heFVzYWdlKS50b0JlVW5kZWZpbmVkKCk7XHJcbiAgICAgIGV4cGVjdCh0eXBlb2YgaW52aXRlTGluay5jcmVhdGVkQXQpLnRvQmUoJ3N0cmluZycpO1xyXG4gICAgICBleHBlY3QobmV3IERhdGUoaW52aXRlTGluay5jcmVhdGVkQXQpLmdldFRpbWUoKSkudG9CZUdyZWF0ZXJUaGFuKDApO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGRlc2NyaWJlKCdJbnZpdGUgQ29kZSBWYWxpZGF0aW9uJywgKCkgPT4ge1xyXG4gICAgaXQoJ3Nob3VsZCB2YWxpZGF0ZSBleGlzdGluZyBhY3RpdmUgaW52aXRlIGNvZGVzJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCBpbnZpdGVDb2RlID0gJ0FCQzEyMyc7XHJcbiAgICAgIGNvbnN0IHJvb21JZCA9ICd0ZXN0LXJvb20nO1xyXG5cclxuICAgICAgLy8gTW9jayBjb21tYW5kIGNvbnN0cnVjdG9ycyB0byBjYXB0dXJlIGFyZ3VtZW50c1xyXG4gICAgICBtb2NrR2V0Q29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ0dldENvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuICAgICAgXHJcbiAgICAgIG1vY2tQdXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnUHV0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zXHJcbiAgICAgIG1vY2tTZW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoY29tbWFuZCkgPT4ge1xyXG4gICAgICAgIC8vIEhhbmRsZSBkaWZmZXJlbnQgY29tbWFuZCB0eXBlc1xyXG4gICAgICAgIGlmIChjb21tYW5kLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdHZXRDb21tYW5kJykge1xyXG4gICAgICAgICAgY29uc3QgYXJncyA9IGNvbW1hbmQuaW5wdXQgfHwge307XHJcbiAgICAgICAgICBjb25zdCBrZXkgPSBhcmdzLktleSB8fCB7fTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gQ2hlY2sgZm9yIGludml0ZSBjb2RlIGxvb2t1cFxyXG4gICAgICAgICAgaWYgKGtleS5QSyA9PT0gaW52aXRlQ29kZSAmJiBrZXkuU0sgPT09ICdJTlZJVEUnKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xyXG4gICAgICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgICAgIGNvZGU6IGludml0ZUNvZGUsXHJcbiAgICAgICAgICAgICAgICByb29tSWQsXHJcbiAgICAgICAgICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGV4cGlyZXNBdDogbmV3IERhdGUoRGF0ZS5ub3coKSArIDI0ICogNjAgKiA2MCAqIDEwMDApLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgICAgICB1c2FnZUNvdW50OiAwLFxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIENoZWNrIGZvciByb29tIGxvb2t1cFxyXG4gICAgICAgICAgaWYgKGtleS5QSyA9PT0gcm9vbUlkICYmIGtleS5TSyA9PT0gJ1JPT00nKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xyXG4gICAgICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgICAgIHJvb21JZCxcclxuICAgICAgICAgICAgICAgIG5hbWU6ICdUZXN0IFJvb20nLFxyXG4gICAgICAgICAgICAgICAgaG9zdElkOiAnaG9zdC11c2VyJyxcclxuICAgICAgICAgICAgICAgIHN0YXR1czogJ0FDVElWRScsXHJcbiAgICAgICAgICAgICAgICBtZW1iZXJDb3VudDogNSxcclxuICAgICAgICAgICAgICAgIGlzUHJpdmF0ZTogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbTogbnVsbCB9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCByb29tSW5mbyA9IGF3YWl0IGRlZXBMaW5rU2VydmljZS52YWxpZGF0ZUludml0ZUNvZGUoaW52aXRlQ29kZSk7XHJcblxyXG4gICAgICBleHBlY3Qocm9vbUluZm8pLm5vdC50b0JlTnVsbCgpO1xyXG4gICAgICBleHBlY3Qocm9vbUluZm8/LnJvb21JZCkudG9CZShyb29tSWQpO1xyXG4gICAgICBleHBlY3Qocm9vbUluZm8/Lm5hbWUpLnRvQmUoJ1Rlc3QgUm9vbScpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCByZWplY3QgZXhwaXJlZCBpbnZpdGUgY29kZXMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGludml0ZUNvZGUgPSAnRVhQSVJFRCc7XHJcblxyXG4gICAgICAvLyBNb2NrIGNvbW1hbmQgY29uc3RydWN0b3JzXHJcbiAgICAgIG1vY2tHZXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnR2V0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG4gICAgICBcclxuICAgICAgbW9ja1VwZGF0ZUNvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdVcGRhdGVDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgbW9ja1NlbmQubW9ja0ltcGxlbWVudGF0aW9uKChjb21tYW5kKSA9PiB7XHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ0dldENvbW1hbmQnKSB7XHJcbiAgICAgICAgICBjb25zdCBrZXkgPSBjb21tYW5kLmlucHV0Py5LZXkgfHwge307XHJcbiAgICAgICAgICBpZiAoa2V5LlBLID09PSBpbnZpdGVDb2RlICYmIGtleS5TSyA9PT0gJ0lOVklURScpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XHJcbiAgICAgICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICAgICAgY29kZTogaW52aXRlQ29kZSxcclxuICAgICAgICAgICAgICAgIHJvb21JZDogJ3Rlc3Qtcm9vbScsXHJcbiAgICAgICAgICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGV4cGlyZXNBdDogbmV3IERhdGUoRGF0ZS5ub3coKSAtIDI0ICogNjAgKiA2MCAqIDEwMDApLnRvSVNPU3RyaW5nKCksIC8vIEV4cGlyZWRcclxuICAgICAgICAgICAgICAgIHVzYWdlQ291bnQ6IDAsXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gTW9jayBkZWFjdGl2YXRpb24gdXBkYXRlXHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ1VwZGF0ZUNvbW1hbmQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW06IG51bGwgfSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3Qgcm9vbUluZm8gPSBhd2FpdCBkZWVwTGlua1NlcnZpY2UudmFsaWRhdGVJbnZpdGVDb2RlKGludml0ZUNvZGUpO1xyXG5cclxuICAgICAgZXhwZWN0KHJvb21JbmZvKS50b0JlTnVsbCgpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCByZWplY3QgaW5hY3RpdmUgaW52aXRlIGNvZGVzJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCBpbnZpdGVDb2RlID0gJ0lOQUNUSVZFJztcclxuXHJcbiAgICAgIC8vIE1vY2sgY29tbWFuZCBjb25zdHJ1Y3RvcnNcclxuICAgICAgbW9ja0dldENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdHZXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcclxuICAgICAgbW9ja1NlbmQubW9ja0ltcGxlbWVudGF0aW9uKChjb21tYW5kKSA9PiB7XHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ0dldENvbW1hbmQnKSB7XHJcbiAgICAgICAgICBjb25zdCBrZXkgPSBjb21tYW5kLmlucHV0Py5LZXkgfHwge307XHJcbiAgICAgICAgICBpZiAoa2V5LlBLID09PSBpbnZpdGVDb2RlICYmIGtleS5TSyA9PT0gJ0lOVklURScpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XHJcbiAgICAgICAgICAgICAgSXRlbToge1xyXG4gICAgICAgICAgICAgICAgY29kZTogaW52aXRlQ29kZSxcclxuICAgICAgICAgICAgICAgIHJvb21JZDogJ3Rlc3Qtcm9vbScsXHJcbiAgICAgICAgICAgICAgICBpc0FjdGl2ZTogZmFsc2UsIC8vIEluYWN0aXZlXHJcbiAgICAgICAgICAgICAgICBleHBpcmVzQXQ6IG5ldyBEYXRlKERhdGUubm93KCkgKyAyNCAqIDYwICogNjAgKiAxMDAwKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgICAgdXNhZ2VDb3VudDogMCxcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbTogbnVsbCB9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCByb29tSW5mbyA9IGF3YWl0IGRlZXBMaW5rU2VydmljZS52YWxpZGF0ZUludml0ZUNvZGUoaW52aXRlQ29kZSk7XHJcblxyXG4gICAgICBleHBlY3Qocm9vbUluZm8pLnRvQmVOdWxsKCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIHJlamVjdCBjb2RlcyB0aGF0IGhhdmUgcmVhY2hlZCB1c2FnZSBsaW1pdCcsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3QgaW52aXRlQ29kZSA9ICdNQVhVU0VEJztcclxuXHJcbiAgICAgIC8vIE1vY2sgY29tbWFuZCBjb25zdHJ1Y3RvcnNcclxuICAgICAgbW9ja0dldENvbW1hbmQubW9ja0ltcGxlbWVudGF0aW9uKChhcmdzKSA9PiAoe1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiB7IG5hbWU6ICdHZXRDb21tYW5kJyB9LFxyXG4gICAgICAgIGlucHV0OiBhcmdzLFxyXG4gICAgICB9KSk7XHJcbiAgICAgIFxyXG4gICAgICBtb2NrVXBkYXRlQ29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ1VwZGF0ZUNvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBtb2NrU2VuZC5tb2NrSW1wbGVtZW50YXRpb24oKGNvbW1hbmQpID0+IHtcclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnR2V0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIGNvbnN0IGtleSA9IGNvbW1hbmQuaW5wdXQ/LktleSB8fCB7fTtcclxuICAgICAgICAgIGlmIChrZXkuUEsgPT09IGludml0ZUNvZGUgJiYga2V5LlNLID09PSAnSU5WSVRFJykge1xyXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcclxuICAgICAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgICAgICBjb2RlOiBpbnZpdGVDb2RlLFxyXG4gICAgICAgICAgICAgICAgcm9vbUlkOiAndGVzdC1yb29tJyxcclxuICAgICAgICAgICAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZXhwaXJlc0F0OiBuZXcgRGF0ZShEYXRlLm5vdygpICsgMjQgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICAgIHVzYWdlQ291bnQ6IDUsXHJcbiAgICAgICAgICAgICAgICBtYXhVc2FnZTogNSwgLy8gUmVhY2hlZCBsaW1pdFxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIE1vY2sgZGVhY3RpdmF0aW9uIHVwZGF0ZVxyXG4gICAgICAgIGlmIChjb21tYW5kLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdVcGRhdGVDb21tYW5kJykge1xyXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBJdGVtOiBudWxsIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHJvb21JbmZvID0gYXdhaXQgZGVlcExpbmtTZXJ2aWNlLnZhbGlkYXRlSW52aXRlQ29kZShpbnZpdGVDb2RlKTtcclxuXHJcbiAgICAgIGV4cGVjdChyb29tSW5mbykudG9CZU51bGwoKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG5cclxuICBkZXNjcmliZSgnRGVlcCBMaW5rIFVSTCBQYXJzaW5nJywgKCkgPT4ge1xyXG4gICAgaXQoJ3Nob3VsZCBleHRyYWN0IGludml0ZSBjb2RlcyBmcm9tIHZhcmlvdXMgVVJMIGZvcm1hdHMnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHRlc3RDYXNlcyA9IFtcclxuICAgICAgICB7IHVybDogJ2h0dHBzOi8vdHJpbml0eS5hcHAvcm9vbS9BQkMxMjMnLCBleHBlY3RlZDogJ0FCQzEyMycgfSxcclxuICAgICAgICB7IHVybDogJ3RyaW5pdHkuYXBwL3Jvb20vWFlaNzg5JywgZXhwZWN0ZWQ6ICdYWVo3ODknIH0sXHJcbiAgICAgICAgeyB1cmw6ICcvcm9vbS9ERUY0NTYnLCBleHBlY3RlZDogJ0RFRjQ1NicgfSxcclxuICAgICAgICB7IHVybDogJ0dISTc4OScsIGV4cGVjdGVkOiAnR0hJNzg5JyB9LFxyXG4gICAgICBdO1xyXG5cclxuICAgICAgLy8gTW9jayBjb21tYW5kIGNvbnN0cnVjdG9yc1xyXG4gICAgICBtb2NrR2V0Q29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ0dldENvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuICAgICAgXHJcbiAgICAgIG1vY2tVcGRhdGVDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnVXBkYXRlQ29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgLy8gTW9jayBzdWNjZXNzZnVsIHZhbGlkYXRpb24gZm9yIGFsbCBjb2Rlc1xyXG4gICAgICBtb2NrU2VuZC5tb2NrSW1wbGVtZW50YXRpb24oKGNvbW1hbmQpID0+IHtcclxuICAgICAgICBpZiAoY29tbWFuZC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnR2V0Q29tbWFuZCcpIHtcclxuICAgICAgICAgIGNvbnN0IGtleSA9IGNvbW1hbmQuaW5wdXQ/LktleSB8fCB7fTtcclxuICAgICAgICAgIGNvbnN0IGNvZGUgPSBrZXkuUEs7XHJcbiAgICAgICAgICBpZiAoa2V5LlNLID09PSAnSU5WSVRFJykge1xyXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcclxuICAgICAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgICAgICBjb2RlLFxyXG4gICAgICAgICAgICAgICAgcm9vbUlkOiAndGVzdC1yb29tJyxcclxuICAgICAgICAgICAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZXhwaXJlc0F0OiBuZXcgRGF0ZShEYXRlLm5vdygpICsgMjQgKiA2MCAqIDYwICogMTAwMCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICAgIHVzYWdlQ291bnQ6IDAsXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChrZXkuU0sgPT09ICdST09NJykge1xyXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcclxuICAgICAgICAgICAgICBJdGVtOiB7XHJcbiAgICAgICAgICAgICAgICByb29tSWQ6ICd0ZXN0LXJvb20nLFxyXG4gICAgICAgICAgICAgICAgbmFtZTogJ1Rlc3QgUm9vbScsXHJcbiAgICAgICAgICAgICAgICBob3N0SWQ6ICdob3N0LXVzZXInLFxyXG4gICAgICAgICAgICAgICAgc3RhdHVzOiAnQUNUSVZFJyxcclxuICAgICAgICAgICAgICAgIG1lbWJlckNvdW50OiAxLFxyXG4gICAgICAgICAgICAgICAgaXNQcml2YXRlOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIE1vY2sgdXNhZ2UgY291bnQgaW5jcmVtZW50XHJcbiAgICAgICAgaWYgKGNvbW1hbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ1VwZGF0ZUNvbW1hbmQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW06IG51bGwgfSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgZm9yIChjb25zdCB0ZXN0Q2FzZSBvZiB0ZXN0Q2FzZXMpIHtcclxuICAgICAgICBjb25zdCBhY3Rpb24gPSBhd2FpdCBkZWVwTGlua1NlcnZpY2UuaGFuZGxlRGVlcExpbmsodGVzdENhc2UudXJsKTtcclxuICAgICAgICBcclxuICAgICAgICBleHBlY3QoYWN0aW9uLnR5cGUpLnRvQmUoJ0pPSU5fUk9PTScpO1xyXG4gICAgICAgIGV4cGVjdChhY3Rpb24ucm9vbUlkKS50b0JlKCd0ZXN0LXJvb20nKTtcclxuICAgICAgICBleHBlY3QoYWN0aW9uLm1ldGFkYXRhPy5pbnZpdGVDb2RlKS50b0JlKHRlc3RDYXNlLmV4cGVjdGVkKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgaXQoJ3Nob3VsZCByZWplY3QgaW52YWxpZCBVUkwgZm9ybWF0cycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3QgaW52YWxpZFVybHMgPSBbXHJcbiAgICAgICAgJ2h0dHBzOi8vZXhhbXBsZS5jb20vcm9vbS9BQkMxMjMnLFxyXG4gICAgICAgICd0cmluaXR5LmFwcC9pbnZhbGlkL0FCQzEyMycsXHJcbiAgICAgICAgJy9pbnZhbGlkL0FCQzEyMycsXHJcbiAgICAgICAgJ1RPT0xPTkcxMjMnLFxyXG4gICAgICAgICdTSE9SVCcsXHJcbiAgICAgICAgJycsXHJcbiAgICAgIF07XHJcblxyXG4gICAgICBmb3IgKGNvbnN0IHVybCBvZiBpbnZhbGlkVXJscykge1xyXG4gICAgICAgIGNvbnN0IGFjdGlvbiA9IGF3YWl0IGRlZXBMaW5rU2VydmljZS5oYW5kbGVEZWVwTGluayh1cmwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGV4cGVjdChhY3Rpb24udHlwZSkudG9CZSgnRVJST1InKTtcclxuICAgICAgICBleHBlY3QoYWN0aW9uLmVycm9yTWVzc2FnZSkudG9Db250YWluKCdJbnZhbGlkIGludml0ZSBsaW5rIGZvcm1hdCcpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgZGVzY3JpYmUoJ0ludml0ZSBMaW5rIE1hbmFnZW1lbnQnLCAoKSA9PiB7XHJcbiAgICBpdCgnc2hvdWxkIGRlYWN0aXZhdGUgaW52aXRlIGNvZGVzJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCBpbnZpdGVDb2RlID0gJ0RFQUNUSVZBVEUnO1xyXG5cclxuICAgICAgLy8gTW9jayBjb21tYW5kIGNvbnN0cnVjdG9yc1xyXG4gICAgICBtb2NrVXBkYXRlQ29tbWFuZC5tb2NrSW1wbGVtZW50YXRpb24oKGFyZ3MpID0+ICh7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IHsgbmFtZTogJ1VwZGF0ZUNvbW1hbmQnIH0sXHJcbiAgICAgICAgaW5wdXQ6IGFyZ3MsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIC8vIE1vY2sgRHluYW1vREIgb3BlcmF0aW9uc1xyXG4gICAgICBtb2NrU2VuZC5tb2NrUmVzb2x2ZWRWYWx1ZSh7fSk7XHJcblxyXG4gICAgICBhd2FpdCBkZWVwTGlua1NlcnZpY2UuZGVhY3RpdmF0ZUludml0ZUNvZGUoaW52aXRlQ29kZSk7XHJcblxyXG4gICAgICAvLyBWZXJpZnkgVXBkYXRlQ29tbWFuZCB3YXMgY2FsbGVkXHJcbiAgICAgIGV4cGVjdChtb2NrU2VuZCkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXHJcbiAgICAgICAgZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xyXG4gICAgICAgICAgY29uc3RydWN0b3I6IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcclxuICAgICAgICAgICAgbmFtZTogJ1VwZGF0ZUNvbW1hbmQnXHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpdCgnc2hvdWxkIGdldCBpbnZpdGUgc3RhdGlzdGljcycsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3QgaW52aXRlQ29kZSA9ICdTVEFUUzEyMyc7XHJcblxyXG4gICAgICAvLyBNb2NrIGNvbW1hbmQgY29uc3RydWN0b3JzXHJcbiAgICAgIG1vY2tHZXRDb21tYW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoYXJncykgPT4gKHtcclxuICAgICAgICBjb25zdHJ1Y3RvcjogeyBuYW1lOiAnR2V0Q29tbWFuZCcgfSxcclxuICAgICAgICBpbnB1dDogYXJncyxcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zXHJcbiAgICAgIG1vY2tTZW5kLm1vY2tJbXBsZW1lbnRhdGlvbigoY29tbWFuZCkgPT4ge1xyXG4gICAgICAgIGlmIChjb21tYW5kLmNvbnN0cnVjdG9yLm5hbWUgPT09ICdHZXRDb21tYW5kJykge1xyXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XHJcbiAgICAgICAgICAgIEl0ZW06IHtcclxuICAgICAgICAgICAgICBjb2RlOiBpbnZpdGVDb2RlLFxyXG4gICAgICAgICAgICAgIHVzYWdlQ291bnQ6IDMsXHJcbiAgICAgICAgICAgICAgbWF4VXNhZ2U6IDEwLFxyXG4gICAgICAgICAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICAgICAgICAgIGV4cGlyZXNBdDogJzIwMjQtMTItMzFUMjM6NTk6NTkuOTk5WicsXHJcbiAgICAgICAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMC4wMDBaJyxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBJdGVtOiBudWxsIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHN0YXRzID0gYXdhaXQgZGVlcExpbmtTZXJ2aWNlLmdldEludml0ZVN0YXRzKGludml0ZUNvZGUpO1xyXG5cclxuICAgICAgZXhwZWN0KHN0YXRzKS5ub3QudG9CZU51bGwoKTtcclxuICAgICAgZXhwZWN0KHN0YXRzPy5jb2RlKS50b0JlKGludml0ZUNvZGUpO1xyXG4gICAgICBleHBlY3Qoc3RhdHM/LnVzYWdlQ291bnQpLnRvQmUoMyk7XHJcbiAgICAgIGV4cGVjdChzdGF0cz8ubWF4VXNhZ2UpLnRvQmUoMTApO1xyXG4gICAgICBleHBlY3Qoc3RhdHM/LmlzQWN0aXZlKS50b0JlKHRydWUpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbn0pOyJdfQ==