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

import { DeepLinkService } from '../services/deepLinkService';

describe('Invite Code Uniqueness - Unit Tests', () => {
  let mockSend: jest.Mock;
  let deepLinkService: DeepLinkService;
  let mockGetCommand: jest.Mock;
  let mockPutCommand: jest.Mock;
  let mockUpdateCommand: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variables
    process.env.INVITE_LINKS_TABLE = 'test-invite-links-table';
    process.env.ROOMS_TABLE = 'test-rooms-table';

    // Create mock send function
    mockSend = jest.fn();

    // Get the mocked command constructors
    const { GetCommand, PutCommand, UpdateCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    mockGetCommand = GetCommand as jest.Mock;
    mockPutCommand = PutCommand as jest.Mock;
    mockUpdateCommand = UpdateCommand as jest.Mock;

    // Mock DynamoDB client and document client
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    
    DynamoDBClient.mockImplementation(() => ({}));
    const mockDocClient = {
      send: mockSend,
    };
    DynamoDBDocumentClient.from = jest.fn().mockReturnValue(mockDocClient);

    // Create service instance with mocked client
    deepLinkService = new DeepLinkService(mockDocClient as any);
  });

  describe('Property 6: Invite Code Uniqueness', () => {
    it('should generate unique invite codes for multiple rooms', async () => {
      const roomIds = ['room1', 'room2', 'room3', 'room4', 'room5'];
      const userId = 'test-user';
      const generatedCodes = new Set<string>();

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
      const inviteLinks = await Promise.all(
        roomIds.map(roomId => deepLinkService.generateInviteLink(roomId, userId))
      );

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
      const inviteLinks = await Promise.all(
        Array.from({ length: 10 }, () => 
          deepLinkService.generateInviteLink(roomId, userId)
        )
      );

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
      const inviteLinks = await Promise.all(
        Array.from({ length: 20 }, () => 
          deepLinkService.generateInviteLink(roomId, userId)
        )
      );

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
          } else {
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
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          constructor: expect.objectContaining({
            name: 'UpdateCommand'
          })
        })
      );
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
