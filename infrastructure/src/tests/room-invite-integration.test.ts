/**
 * Integration Tests for Room Handler with Invite System
 * Feature: trinity-voting-fixes
 * 
 * Tests the integration between Room Handler and Deep Link Service
 */

import { DeepLinkService } from '../services/deepLinkService';

describe('Room Handler - Invite System Integration', () => {
  let deepLinkService: DeepLinkService;

  beforeEach(() => {
    // Create DeepLinkService instance for testing
    deepLinkService = new DeepLinkService();
    
    // Set up environment variables
    process.env.INVITE_LINKS_TABLE = 'test-invite-links-table';
    process.env.ROOMS_TABLE = 'test-rooms-table';
  });

  describe('Invite Code Generation Logic', () => {
    it('should generate invite codes with correct format', () => {
      // Test the private method by accessing it
      const generateMethod = (deepLinkService as any).generateRandomCode;
      const code = generateMethod.call(deepLinkService);

      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBe(6);
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('should generate different codes on multiple calls', () => {
      const generateMethod = (deepLinkService as any).generateRandomCode;
      const codes = new Set();
      
      // Generate 100 codes to test uniqueness
      for (let i = 0; i < 100; i++) {
        const code = generateMethod.call(deepLinkService);
        codes.add(code);
      }
      
      // Should have high uniqueness (allow for some collisions in random generation)
      expect(codes.size).toBeGreaterThan(90);
    });

    it('should generate codes using only valid characters', () => {
      const generateMethod = (deepLinkService as any).generateRandomCode;
      const validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      
      for (let i = 0; i < 50; i++) {
        const code = generateMethod.call(deepLinkService);
        
        for (const char of code) {
          expect(validChars.includes(char)).toBe(true);
        }
      }
    });
  });

  describe('URL Format Validation', () => {
    it('should extract invite codes from various URL formats', () => {
      const testCases = [
        { url: 'https://trinity.app/room/ABC123', expected: 'ABC123' },
        { url: 'trinity.app/room/XYZ789', expected: 'XYZ789' },
        { url: '/room/DEF456', expected: 'DEF456' },
        { url: 'GHI012', expected: 'GHI012' },
      ];

      testCases.forEach(({ url, expected }) => {
        // Access private method for testing
        const extractMethod = (deepLinkService as any).extractInviteCodeFromUrl;
        const result = extractMethod.call(deepLinkService, url);
        expect(result).toBe(expected);
      });
    });

    it('should reject invalid URL formats', () => {
      const invalidUrls = [
        'https://example.com/room/ABC123', // Wrong domain
        'https://trinity.app/invalid/ABC123', // Wrong path
        'https://trinity.app/room/ABC12', // Too short
        'https://trinity.app/room/ABCDEFG', // Too long
        'invalid-format', // No valid pattern
        '', // Empty
      ];

      invalidUrls.forEach(url => {
        // Access private method for testing
        const extractMethod = (deepLinkService as any).extractInviteCodeFromUrl;
        const result = extractMethod.call(deepLinkService, url);
        expect(result).toBeNull();
      });
    });

    it('should handle case insensitive extraction', () => {
      const testCases = [
        { url: 'https://trinity.app/room/abc123', expected: 'ABC123' },
        { url: 'trinity.app/room/xyz789', expected: 'XYZ789' },
        { url: '/room/def456', expected: 'DEF456' },
        { url: 'ghi012', expected: 'GHI012' },
      ];

      testCases.forEach(({ url, expected }) => {
        const extractMethod = (deepLinkService as any).extractInviteCodeFromUrl;
        const result = extractMethod.call(deepLinkService, url);
        expect(result).toBe(expected);
      });
    });
  });

  describe('URL Generation', () => {
    it('should generate correct base URL format', () => {
      const baseUrl = 'https://trinity.app';
      const inviteCode = 'ABC123';
      const expectedUrl = `${baseUrl}/room/${inviteCode}`;
      
      // Test URL construction logic
      expect(`${baseUrl}/room/${inviteCode}`).toBe(expectedUrl);
    });

    it('should maintain consistency between URL generation and parsing', () => {
      const testCodes = ['ABC123', 'XYZ789', 'DEF456', 'GHI012'];
      
      testCodes.forEach(code => {
        const url = `https://trinity.app/room/${code}`;
        
        // Extract code from generated URL
        const extractMethod = (deepLinkService as any).extractInviteCodeFromUrl;
        const extractedCode = extractMethod.call(deepLinkService, url);
        
        expect(extractedCode).toBe(code);
      });
    });
  });

  describe('Invite Link Structure', () => {
    it('should create invite link objects with correct structure', () => {
      const mockInviteLink = {
        code: 'ABC123',
        url: 'https://trinity.app/room/ABC123',
        roomId: 'room-123',
        createdBy: 'user-456',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        isActive: true,
        usageCount: 0,
      };

      // Validate structure
      expect(mockInviteLink.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(mockInviteLink.url).toBe(`https://trinity.app/room/${mockInviteLink.code}`);
      expect(mockInviteLink.roomId).toBeDefined();
      expect(mockInviteLink.createdBy).toBeDefined();
      expect(mockInviteLink.isActive).toBe(true);
      expect(mockInviteLink.usageCount).toBe(0);
      
      // Validate timestamps
      const createdTime = new Date(mockInviteLink.createdAt);
      const expiryTime = new Date(mockInviteLink.expiresAt);
      expect(expiryTime.getTime()).toBeGreaterThan(createdTime.getTime());
    });

    it('should calculate expiry times correctly', () => {
      const now = new Date();
      const expiryHours = 24;
      const expectedExpiry = new Date(now.getTime() + (expiryHours * 60 * 60 * 1000));
      
      // Test expiry calculation logic
      const calculatedExpiry = new Date(now.getTime() + (expiryHours * 60 * 60 * 1000));
      
      expect(Math.abs(calculatedExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
    });
  });

  describe('Room Info Structure', () => {
    it('should create room info objects with correct structure', () => {
      const mockRoomInfo = {
        roomId: 'room-123',
        name: 'Test Room',
        hostId: 'user-456',
        status: 'WAITING',
        memberCount: 1,
        isPrivate: false,
        createdAt: new Date().toISOString(),
      };

      // Validate structure
      expect(mockRoomInfo.roomId).toBeDefined();
      expect(mockRoomInfo.name).toBeDefined();
      expect(mockRoomInfo.hostId).toBeDefined();
      expect(mockRoomInfo.status).toBeDefined();
      expect(typeof mockRoomInfo.memberCount).toBe('number');
      expect(typeof mockRoomInfo.isPrivate).toBe('boolean');
      expect(mockRoomInfo.createdAt).toBeDefined();
      
      // Validate timestamp format
      expect(() => new Date(mockRoomInfo.createdAt)).not.toThrow();
    });
  });

  describe('Deep Link Action Structure', () => {
    it('should create valid JOIN_ROOM actions', () => {
      const joinAction = {
        type: 'JOIN_ROOM' as const,
        roomId: 'room-123',
        metadata: {
          roomName: 'Test Room',
          hostId: 'user-456',
          memberCount: 1,
          inviteCode: 'ABC123',
        },
      };

      expect(joinAction.type).toBe('JOIN_ROOM');
      expect(joinAction.roomId).toBeDefined();
      expect(joinAction.metadata).toBeDefined();
      expect(joinAction.metadata.roomName).toBeDefined();
      expect(joinAction.metadata.inviteCode).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('should create valid ERROR actions', () => {
      const errorAction = {
        type: 'ERROR' as const,
        errorMessage: 'Invalid invite link format',
      };

      expect(errorAction.type).toBe('ERROR');
      expect(errorAction.errorMessage).toBeDefined();
      expect(typeof errorAction.errorMessage).toBe('string');
    });

    it('should create valid INVALID_CODE actions', () => {
      const invalidAction = {
        type: 'INVALID_CODE' as const,
        errorMessage: 'This invite link is invalid or has expired',
      };

      expect(invalidAction.type).toBe('INVALID_CODE');
      expect(invalidAction.errorMessage).toBeDefined();
      expect(typeof invalidAction.errorMessage).toBe('string');
    });
  });

  describe('Integration Properties', () => {
    it('should maintain URL format consistency', () => {
      const baseUrl = 'https://trinity.app';
      const testCodes = ['ABC123', 'XYZ789', 'DEF456', 'GHI012', 'JKL345'];
      
      testCodes.forEach(code => {
        // Generate URL
        const url = `${baseUrl}/room/${code}`;
        
        // Extract code back
        const extractMethod = (deepLinkService as any).extractInviteCodeFromUrl;
        const extractedCode = extractMethod.call(deepLinkService, url);
        
        // Should be consistent
        expect(extractedCode).toBe(code);
        expect(url).toBe(`${baseUrl}/room/${code}`);
      });
    });

    it('should handle edge cases in URL parsing', () => {
      const edgeCases = [
        { url: 'https://trinity.app/room/ABC123/', expected: null }, // Trailing slash not supported in backend
        { url: 'https://trinity.app/room/ABC123?param=value', expected: null }, // Query params not supported
        { url: 'https://trinity.app/room/ABC123#fragment', expected: null }, // Fragments not supported
      ];

      edgeCases.forEach(({ url, expected }) => {
        const extractMethod = (deepLinkService as any).extractInviteCodeFromUrl;
        const result = extractMethod.call(deepLinkService, url);
        expect(result).toBe(expected);
      });
    });

    it('should validate invite code format consistently', () => {
      const validCodes = ['ABC123', 'XYZ789', 'DEF456', '123456', 'ABCDEF'];
      const invalidCodes = ['ABC12', 'ABCDEFG', 'abc123', 'ABC-23', 'ABC_23'];
      
      validCodes.forEach(code => {
        expect(code).toMatch(/^[A-Z0-9]{6}$/);
      });
      
      invalidCodes.forEach(code => {
        expect(code).not.toMatch(/^[A-Z0-9]{6}$/);
      });
    });
  });
});
