/**
 * Unit Tests for Deep Link Service
 * Feature: trinity-voting-fixes
 * 
 * Tests the mobile deep link handling for invite links
 */

// Mock dependencies
jest.mock('react-native', () => ({
  Linking: {
    addEventListener: jest.fn(),
    removeAllListeners: jest.fn(),
    getInitialURL: jest.fn(),
    canOpenURL: jest.fn(),
    openURL: jest.fn(),
  },
  Alert: {
    alert: jest.fn(),
  },
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
}));

jest.mock('../services/roomService', () => ({
  roomService: {
    joinRoom: jest.fn(),
  },
}));

jest.mock('../services/cognitoAuthService', () => ({
  cognitoAuthService: {
    checkStoredAuth: jest.fn(),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

import { deepLinkService } from '../services/deepLinkService';
import { Linking, Alert } from 'react-native';
import { router } from 'expo-router';
import { roomService } from '../services/roomService';
import { cognitoAuthService } from '../services/cognitoAuthService';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('DeepLinkService', () => {
  const mockLinking = Linking as jest.Mocked<typeof Linking>;
  const mockAlert = Alert as jest.Mocked<typeof Alert>;
  const mockRouter = router as jest.Mocked<typeof router>;
  const mockRoomService = roomService as jest.Mocked<typeof roomService>;
  const mockCognitoAuthService = cognitoAuthService as jest.Mocked<typeof cognitoAuthService>;
  const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  // Helper function to create mock authenticated user
  const mockAuthenticatedUser = () => ({
    isAuthenticated: true,
    user: { 
      sub: 'user-123', 
      email: 'test@example.com', 
      email_verified: true,
      name: 'Test User' 
    },
    tokens: { accessToken: 'token123', idToken: 'idtoken123', refreshToken: 'refresh123' }
  });

  // Helper function to create mock unauthenticated user
  const mockUnauthenticatedUser = () => ({
    isAuthenticated: false
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the service state
    deepLinkService.cleanup();
    
    // Ensure Alert mock is properly set up
    mockAlert.alert.mockClear();
  });

  describe('Initialization', () => {
    it('should initialize deep link service correctly', () => {
      deepLinkService.initialize();

      expect(mockLinking.addEventListener).toHaveBeenCalledWith(
        'url',
        expect.any(Function)
      );
      expect(mockLinking.getInitialURL).toHaveBeenCalled();
    });

    it('should not initialize twice', () => {
      deepLinkService.initialize();
      deepLinkService.initialize();

      // Should only be called once
      expect(mockLinking.addEventListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Invite Code Extraction', () => {
    it('should extract invite codes from Trinity app scheme URLs', () => {
      const testCases = [
        'trinity://room/ABC123',
        'trinity://invite/XYZ789',
      ];

      testCases.forEach(url => {
        expect(deepLinkService.isValidInviteLink(url)).toBe(true);
      });
    });

    it('should extract invite codes from HTTPS URLs', () => {
      const testCases = [
        'https://trinity.app/room/ABC123',
        'http://trinity.app/room/XYZ789',
      ];

      testCases.forEach(url => {
        expect(deepLinkService.isValidInviteLink(url)).toBe(true);
      });
    });

    it('should extract invite codes from domain-only URLs', () => {
      const url = 'trinity.app/room/ABC123';
      expect(deepLinkService.isValidInviteLink(url)).toBe(true);
    });

    it('should extract invite codes from path-only URLs', () => {
      const url = '/room/ABC123';
      expect(deepLinkService.isValidInviteLink(url)).toBe(true);
    });

    it('should extract invite codes from direct codes', () => {
      const url = 'ABC123';
      expect(deepLinkService.isValidInviteLink(url)).toBe(true);
    });

    it('should reject invalid invite code formats', () => {
      const invalidCodes = [
        'trinity://room/ABC12',     // Too short
        'trinity://room/TOOLONG123', // Too long  
        'https://example.com/room/ABC123', // Wrong domain
        '',                         // Empty
        'invalid-format',          // No valid pattern
      ];

      invalidCodes.forEach(url => {
        expect(deepLinkService.isValidInviteLink(url)).toBe(false);
      });

      // Test that valid formats work
      const validCodes = [
        'trinity://room/ABC123',
        'https://trinity.app/room/XYZ789',
      ];

      validCodes.forEach(url => {
        expect(deepLinkService.isValidInviteLink(url)).toBe(true);
      });
    });
  });

  describe('Invite Link Generation', () => {
    it('should generate correct app scheme invite links', () => {
      const inviteCode = 'ABC123';
      const link = deepLinkService.generateInviteLink(inviteCode);
      expect(link).toBe('trinity://room/ABC123');
    });

    it('should generate correct web invite links', () => {
      const inviteCode = 'XYZ789';
      const link = deepLinkService.generateWebInviteLink(inviteCode);
      expect(link).toBe('https://trinity.app/room/XYZ789');
    });
  });

  describe('Room Joining Flow', () => {
    beforeEach(() => {
      deepLinkService.initialize();
    });

    it('should handle unauthenticated users by redirecting to login', async () => {
      // Mock unauthenticated user
      mockCognitoAuthService.checkStoredAuth.mockResolvedValue(mockUnauthenticatedUser());

      mockAsyncStorage.setItem.mockResolvedValue();

      const handleDeepLink = mockLinking.addEventListener.mock.calls[0][1];
      
      // Wait for the async operation to complete
      await handleDeepLink({ url: 'trinity://room/ABC123' });
      
      // Add a small delay to ensure all async operations complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCognitoAuthService.checkStoredAuth).toHaveBeenCalled();
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('pendingInviteCode', 'ABC123');
      
      // Should show sign in required alert (only one alert for unauthenticated users)
      expect(mockAlert.alert).toHaveBeenCalledTimes(1);
      expect(mockAlert.alert).toHaveBeenCalledWith(
        'Sign In Required',
        'You need to sign in to join this room. After signing in, you\'ll automatically be taken to the room.',
        expect.any(Array)
      );
      expect(mockRoomService.joinRoom).not.toHaveBeenCalled();
    });

    it('should successfully join room with valid invite link', async () => {
      const mockRoom = {
        id: 'room-123',
        name: 'Test Room',
        creatorId: 'user-456',
        filters: {},
        masterList: [],
        inviteCode: 'ABC123',
        isActive: true,
        createdAt: '2026-01-10T12:00:00Z',
        updatedAt: '2026-01-10T12:00:00Z',
      };

      // Mock authenticated user
      mockCognitoAuthService.checkStoredAuth.mockResolvedValue(mockAuthenticatedUser());

      mockRoomService.joinRoom.mockResolvedValue(mockRoom);

      // Simulate deep link handling
      const handleDeepLink = mockLinking.addEventListener.mock.calls[0][1];
      await handleDeepLink({ url: 'trinity://room/ABC123' });
      
      // Add a small delay to ensure all async operations complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCognitoAuthService.checkStoredAuth).toHaveBeenCalled();
      expect(mockRoomService.joinRoom).toHaveBeenCalledWith('ABC123');
      
      // Should call Alert twice: loading then success
      expect(mockAlert.alert).toHaveBeenCalledTimes(2);
      expect(mockAlert.alert).toHaveBeenNthCalledWith(1,
        'Joining Room',
        'Please wait while we connect you to the room...',
        [],
        { cancelable: false }
      );
      expect(mockAlert.alert).toHaveBeenNthCalledWith(2,
        'Welcome!',
        `You've joined "Test Room". Get ready to vote on movies!`,
        expect.any(Array)
      );
    });

    it('should handle expired invite links', async () => {
      // Mock authenticated user
      mockCognitoAuthService.checkStoredAuth.mockResolvedValue(mockAuthenticatedUser());

      const error = new Error('Invite link has expired');
      mockRoomService.joinRoom.mockRejectedValue(error);

      const handleDeepLink = mockLinking.addEventListener.mock.calls[0][1];
      await handleDeepLink({ url: 'trinity://room/EXPIRE' });
      
      // Add a small delay to ensure all async operations complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should call Alert twice: loading then error
      expect(mockAlert.alert).toHaveBeenCalledTimes(2);
      expect(mockAlert.alert).toHaveBeenNthCalledWith(1,
        'Joining Room',
        'Please wait while we connect you to the room...',
        [],
        { cancelable: false }
      );
      expect(mockAlert.alert).toHaveBeenNthCalledWith(2,
        'Unable to Join Room',
        'This invite link has expired. Please ask for a new one.',
        expect.any(Array)
      );
    });

    it('should handle invalid invite links', async () => {
      // Mock authenticated user
      mockCognitoAuthService.checkStoredAuth.mockResolvedValue(mockAuthenticatedUser());

      const error = new Error('Invalid invite code');
      mockRoomService.joinRoom.mockRejectedValue(error);

      const handleDeepLink = mockLinking.addEventListener.mock.calls[0][1];
      await handleDeepLink({ url: 'trinity://room/INVALD' });
      
      // Add a small delay to ensure all async operations complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should call Alert twice: loading then error
      expect(mockAlert.alert).toHaveBeenCalledTimes(2);
      expect(mockAlert.alert).toHaveBeenNthCalledWith(1,
        'Joining Room',
        'Please wait while we connect you to the room...',
        [],
        { cancelable: false }
      );
      expect(mockAlert.alert).toHaveBeenNthCalledWith(2,
        'Unable to Join Room',
        'This invite link is invalid. Please check the link and try again.',
        expect.any(Array)
      );
    });

    it('should handle full room errors', async () => {
      // Mock authenticated user
      mockCognitoAuthService.checkStoredAuth.mockResolvedValue(mockAuthenticatedUser());

      const error = new Error('Room is full');
      mockRoomService.joinRoom.mockRejectedValue(error);

      const handleDeepLink = mockLinking.addEventListener.mock.calls[0][1];
      await handleDeepLink({ url: 'trinity://room/FULL12' });
      
      // Add a small delay to ensure all async operations complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should call Alert twice: loading then error
      expect(mockAlert.alert).toHaveBeenCalledTimes(2);
      expect(mockAlert.alert).toHaveBeenNthCalledWith(1,
        'Joining Room',
        'Please wait while we connect you to the room...',
        [],
        { cancelable: false }
      );
      expect(mockAlert.alert).toHaveBeenNthCalledWith(2,
        'Unable to Join Room',
        'This room is full. Please try again later.',
        expect.any(Array)
      );
    });

    it('should handle generic errors', async () => {
      // Mock authenticated user
      mockCognitoAuthService.checkStoredAuth.mockResolvedValue(mockAuthenticatedUser());

      const error = new Error('Network error');
      mockRoomService.joinRoom.mockRejectedValue(error);

      const handleDeepLink = mockLinking.addEventListener.mock.calls[0][1];
      await handleDeepLink({ url: 'trinity://room/ERROR1' });
      
      // Add a small delay to ensure all async operations complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should call Alert twice: loading then error
      expect(mockAlert.alert).toHaveBeenCalledTimes(2);
      expect(mockAlert.alert).toHaveBeenNthCalledWith(1,
        'Joining Room',
        'Please wait while we connect you to the room...',
        [],
        { cancelable: false }
      );
      expect(mockAlert.alert).toHaveBeenNthCalledWith(2,
        'Unable to Join Room',
        'Unable to join the room. Please try again.',
        expect.any(Array)
      );
    });

    it('should handle malformed invite links', async () => {
      // Mock authenticated user
      mockCognitoAuthService.checkStoredAuth.mockResolvedValue(mockAuthenticatedUser());

      const handleDeepLink = mockLinking.addEventListener.mock.calls[0][1];
      await handleDeepLink({ url: 'trinity://room/INVALD' });
      
      // Add a small delay to ensure all async operations complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should call Alert twice: loading then error
      expect(mockAlert.alert).toHaveBeenCalledTimes(2);
      expect(mockAlert.alert).toHaveBeenNthCalledWith(1,
        'Joining Room',
        'Please wait while we connect you to the room...',
        [],
        { cancelable: false }
      );
      expect(mockAlert.alert).toHaveBeenNthCalledWith(2,
        'Unable to Join Room',
        'Unable to join the room. Please try again.',
        expect.any(Array)
      );
    });
  });

  describe('Handler Registration', () => {
    it('should register and call custom handlers', () => {
      const mockHandler = jest.fn();
      deepLinkService.registerHandler('/custom', mockHandler);

      deepLinkService.initialize();
      const handleDeepLink = mockLinking.addEventListener.mock.calls[0][1];
      handleDeepLink({ url: 'trinity://host/custom' });

      expect(mockHandler).toHaveBeenCalledWith('trinity://host/custom');
    });

    it('should unregister handlers', () => {
      const mockHandler = jest.fn();
      deepLinkService.registerHandler('/custom', mockHandler);
      deepLinkService.unregisterHandler('/custom');

      deepLinkService.initialize();
      const handleDeepLink = mockLinking.addEventListener.mock.calls[0][1];
      handleDeepLink({ url: 'trinity://host/custom' });

      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Initial URL Handling', () => {
    it('should handle initial URL when app is opened from deep link', async () => {
      mockLinking.getInitialURL.mockResolvedValue('trinity://room/INIT12');
      
      // Mock authenticated user
      mockCognitoAuthService.checkStoredAuth.mockResolvedValue(mockAuthenticatedUser());

      const mockRoom = {
        id: 'room-initial',
        name: 'Initial Room',
        creatorId: 'user-123',
        filters: {},
        masterList: [],
        inviteCode: 'INIT12',
        isActive: true,
        createdAt: '2026-01-10T12:00:00Z',
        updatedAt: '2026-01-10T12:00:00Z',
      };
      mockRoomService.joinRoom.mockResolvedValue(mockRoom);

      deepLinkService.initialize();

      // Wait for the timeout in handleInitialURL
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockRoomService.joinRoom).toHaveBeenCalledWith('INIT12');
    });

    it('should handle no initial URL', async () => {
      mockLinking.getInitialURL.mockResolvedValue(null);

      deepLinkService.initialize();

      // Wait for the timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockRoomService.joinRoom).not.toHaveBeenCalled();
    });

    it('should handle initial URL errors', async () => {
      mockLinking.getInitialURL.mockRejectedValue(new Error('URL error'));

      deepLinkService.initialize();

      // Should not crash
      expect(() => deepLinkService.initialize()).not.toThrow();
    });
  });

  describe('External URL Opening', () => {
    it('should open supported URLs', async () => {
      mockLinking.canOpenURL.mockResolvedValue(true);
      mockLinking.openURL.mockResolvedValue(undefined);

      await deepLinkService.openURL('https://example.com');

      expect(mockLinking.canOpenURL).toHaveBeenCalledWith('https://example.com');
      expect(mockLinking.openURL).toHaveBeenCalledWith('https://example.com');
    });

    it('should handle unsupported URLs', async () => {
      mockLinking.canOpenURL.mockResolvedValue(false);

      await deepLinkService.openURL('unsupported://url');

      expect(mockLinking.canOpenURL).toHaveBeenCalledWith('unsupported://url');
      expect(mockLinking.openURL).not.toHaveBeenCalled();
    });

    it('should handle URL opening errors', async () => {
      mockLinking.canOpenURL.mockRejectedValue(new Error('URL error'));

      await expect(deepLinkService.openURL('https://example.com')).resolves.not.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should clean up listeners and handlers', () => {
      deepLinkService.initialize();
      deepLinkService.registerHandler('/test', jest.fn());

      deepLinkService.cleanup();

      expect(mockLinking.removeAllListeners).toHaveBeenCalledWith('url');
    });
  });

  describe('OAuth Callback', () => {
    it('should return correct OAuth callback URL', () => {
      const callbackUrl = deepLinkService.getOAuthCallbackURL();
      expect(callbackUrl).toBe('trinity://auth/callback');
    });
  });

  describe('Pending Invite Code Management', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should store and retrieve pending invite codes', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();
      mockAsyncStorage.getItem.mockResolvedValue('ABC123');
      mockAsyncStorage.removeItem.mockResolvedValue();

      // Store invite code
      await deepLinkService['storeInviteCodeForLater']('ABC123');
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('pendingInviteCode', 'ABC123');

      // Retrieve invite code
      const retrievedCode = await deepLinkService.getPendingInviteCode();
      expect(retrievedCode).toBe('ABC123');
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('pendingInviteCode');
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('pendingInviteCode');
    });

    it('should return null when no pending invite code exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const retrievedCode = await deepLinkService.getPendingInviteCode();
      expect(retrievedCode).toBeNull();
      expect(mockAsyncStorage.removeItem).not.toHaveBeenCalled();
    });

    it('should handle pending invite code after authentication', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('ABC123');
      mockAsyncStorage.removeItem.mockResolvedValue();
      
      // Mock authenticated user
      mockCognitoAuthService.checkStoredAuth.mockResolvedValue(mockAuthenticatedUser());

      const mockRoom = {
        id: 'room-123',
        name: 'Test Room',
        creatorId: 'user-456',
        filters: {},
        masterList: [],
        inviteCode: 'ABC123',
        isActive: true,
        createdAt: '2026-01-10T12:00:00Z',
        updatedAt: '2026-01-10T12:00:00Z',
      };
      mockRoomService.joinRoom.mockResolvedValue(mockRoom);

      await deepLinkService.handlePendingInviteCode();

      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('pendingInviteCode');
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('pendingInviteCode');
      expect(mockRoomService.joinRoom).toHaveBeenCalledWith('ABC123');
    });

    it('should handle authentication errors when processing pending invite codes', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('ABC123');
      mockAsyncStorage.removeItem.mockResolvedValue();
      mockAsyncStorage.setItem.mockResolvedValue();
      
      // Mock unauthenticated user (shouldn't happen in normal flow, but test error handling)
      mockCognitoAuthService.checkStoredAuth.mockResolvedValue(mockUnauthenticatedUser());

      await deepLinkService.handlePendingInviteCode();

      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('pendingInviteCode');
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('pendingInviteCode');
      // Should store the code again since user is not authenticated
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('pendingInviteCode', 'ABC123');
      expect(mockRoomService.joinRoom).not.toHaveBeenCalled();
    });
  });
});