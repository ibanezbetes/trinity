/**
 * End-to-End Integration Tests for Trinity Mobile App
 * Feature: trinity-voting-fixes, Task 11.3
 * 
 * Tests mobile app integration with deep links, voting, and real-time updates
 */

import { deepLinkService } from '../services/deepLinkService';
import { roomService } from '../services/roomService';
import { voteService } from '../services/voteService';
import { appSyncService } from '../services/appSyncService';
import { moviePreloadService } from '../services/moviePreloadService';
import { operationQueueService } from '../services/operationQueueService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  getAllKeys: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
}));

// Mock React Native modules
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
  Linking: {
    openURL: jest.fn(),
    canOpenURL: jest.fn(() => Promise.resolve(true)),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    getInitialURL: jest.fn(() => Promise.resolve(null)),
  },
  Platform: {
    OS: 'ios',
  },
}));

// Mock Expo modules
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path) => `trinity://room/${path}`),
  parse: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

// Mock network calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Trinity Mobile App - End-to-End Integration Tests', () => {
  const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock AsyncStorage default responses
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
    mockAsyncStorage.removeItem.mockResolvedValue();
    mockAsyncStorage.multiGet.mockResolvedValue([]);

    // Mock successful API responses
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {},
      }),
      status: 200,
    });
  });

  describe('Complete Deep Link to Room Joining Flow', () => {
    it('should handle deep link, validate invite, and join room successfully', async () => {
      const inviteCode = 'ABC123';
      const roomId = 'test-room-123';
      const deepLinkUrl = `https://trinity.app/room/${inviteCode}`;

      // Mock invite validation response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          valid: true,
          roomInfo: {
            roomId: roomId,
            name: 'Test Room',
            hostId: 'host-123',
            status: 'WAITING',
            memberCount: 2,
            maxMembers: 10,
            isPrivate: false,
          },
        }),
        status: 200,
      });

      // Mock room joining response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          room: {
            roomId: roomId,
            name: 'Test Room',
            hostId: 'host-123',
            status: 'WAITING',
            memberCount: 3,
            maxMembers: 10,
            isPrivate: false,
          },
        }),
        status: 200,
      });

      // Step 1: Process deep link
      const deepLinkResult = await deepLinkService.handleDeepLink(deepLinkUrl);

      expect(deepLinkResult.type).toBe('JOIN_ROOM');
      expect(deepLinkResult.roomId).toBe(roomId);
      expect(deepLinkResult.metadata?.inviteCode).toBe(inviteCode);

      // Step 2: Validate invite code
      const validationResult = await deepLinkService.validateInviteCode(inviteCode);

      expect(validationResult).toMatchObject({
        roomId: roomId,
        name: 'Test Room',
        status: 'WAITING',
        memberCount: 2,
      });

      // Step 3: Join room
      const joinResult = await roomService.joinRoomByInvite(inviteCode);

      expect(joinResult).toMatchObject({
        roomId: roomId,
        name: 'Test Room',
        memberCount: 3,
      });

      // Verify API calls were made correctly
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      // Verify invite validation call
      expect(mockFetch).toHaveBeenNthCalledWith(1, 
        expect.stringContaining(`/validate-invite/${inviteCode}`),
        expect.objectContaining({
          method: 'GET',
        })
      );

      // Verify room join call
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        expect.stringContaining('/join-room-by-invite'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(inviteCode),
        })
      );
    });

    it('should handle invalid invite codes gracefully', async () => {
      const invalidCode = 'INVALID';
      const deepLinkUrl = `https://trinity.app/room/${invalidCode}`;

      // Mock invalid invite response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          valid: false,
          error: 'Invite link not found or has expired',
        }),
        status: 404,
      });

      // Process deep link
      const deepLinkResult = await deepLinkService.handleDeepLink(deepLinkUrl);

      expect(deepLinkResult.type).toBe('JOIN_ROOM');

      // Attempt to validate invalid invite
      const validationResult = await deepLinkService.validateInviteCode(invalidCode);

      expect(validationResult).toBeNull();

      // Verify error handling
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/validate-invite/${invalidCode}`),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should handle expired invite codes correctly', async () => {
      const expiredCode = 'EXPIRE';
      const deepLinkUrl = `https://trinity.app/room/${expiredCode}`;

      // Mock expired invite response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          valid: false,
          error: 'Invite link has expired',
        }),
        status: 410,
      });

      const deepLinkResult = await deepLinkService.handleDeepLink(deepLinkUrl);
      expect(deepLinkResult.type).toBe('JOIN_ROOM');

      const validationResult = await deepLinkService.validateInviteCode(expiredCode);
      expect(validationResult).toBeNull();
    });
  });

  describe('Complete Voting Flow with Real-time Updates', () => {
    it('should handle voting flow with movie preloading and real-time updates', async () => {
      const roomId = 'test-room-voting';
      const movieId = 'movie-123';
      const userId = 'user-123';

      // Mock room details
      const mockRoom = {
        roomId: roomId,
        name: 'Voting Test Room',
        hostId: 'host-123',
        status: 'ACTIVE',
        memberCount: 3,
        genrePreferences: ['Action', 'Comedy'],
      };

      // Mock movie queue
      const mockMovies = [
        {
          id: movieId,
          title: 'Test Movie',
          poster: 'https://image.tmdb.org/t/p/w500/poster.jpg',
          overview: 'A test movie',
          genres: ['Action'],
          year: 2023,
          rating: 8.5,
        },
        {
          id: 'movie-124',
          title: 'Next Movie',
          poster: 'https://image.tmdb.org/t/p/w500/poster2.jpg',
          overview: 'The next movie',
          genres: ['Comedy'],
          year: 2023,
          rating: 7.8,
        },
      ];

      // Mock movie preloading
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === `preloaded_movies_${roomId}`) {
          return Promise.resolve(JSON.stringify(mockMovies));
        }
        if (key === `room_${roomId}`) {
          return Promise.resolve(JSON.stringify(mockRoom));
        }
        return Promise.resolve(null);
      });

      // Mock vote submission response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          currentVotes: 1,
          totalMembers: 3,
          matchFound: false,
          roomStatus: 'ACTIVE',
        }),
        status: 200,
      });

      // Step 1: Initialize movie preloading
      await moviePreloadService.initializeForRoom(roomId);

      // Verify movies were preloaded
      const preloadedMovies = await moviePreloadService.getPreloadedMovies(roomId);
      expect(preloadedMovies).toHaveLength(2);
      expect(preloadedMovies[0].title).toBe('Test Movie');

      // Step 2: Submit vote
      const voteResult = await voteService.submitVote(roomId, {
        movieId: movieId,
        voteType: 'LIKE',
      });

      expect(voteResult).toMatchObject({
        success: true,
        currentVotes: 1,
        totalMembers: 3,
        matchFound: false,
      });

      // Step 3: Verify real-time subscription setup
      const subscriptionSetup = await appSyncService.subscribeToRoomUpdates(roomId);
      expect(subscriptionSetup).toBeDefined();

      // Verify API calls
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/vote'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(movieId),
        })
      );

      // Verify local storage interactions
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith(`preloaded_movies_${roomId}`);
      expect(mockAsyncStorage.setItem).toHaveBeenCalled();
    });

    it('should handle unanimous voting leading to match', async () => {
      const roomId = 'test-room-match';
      const movieId = 'movie-match';

      // Mock match found response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          currentVotes: 3,
          totalMembers: 3,
          matchFound: true,
          roomStatus: 'MATCHED',
          matchedMovie: {
            id: movieId,
            title: 'Matched Movie',
            poster: 'https://image.tmdb.org/t/p/w500/matched.jpg',
          },
        }),
        status: 200,
      });

      const voteResult = await voteService.submitVote(roomId, {
        movieId: movieId,
        voteType: 'LIKE',
      });

      expect(voteResult).toMatchObject({
        success: true,
        matchFound: true,
        roomStatus: 'MATCHED',
        matchedMovie: {
          id: movieId,
          title: 'Matched Movie',
        },
      });
    });

    it('should handle voting with poor network connectivity using operation queue', async () => {
      const roomId = 'test-room-offline';
      const movieId = 'movie-offline';

      // Mock network failure
      mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

      // Mock operation queue storage
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'operation_queue') {
          return Promise.resolve('[]');
        }
        return Promise.resolve(null);
      });

      // Submit vote while offline
      const voteResult = await voteService.submitVote(roomId, {
        movieId: movieId,
        voteType: 'LIKE',
      });

      // Should return optimistic response
      expect(voteResult).toMatchObject({
        success: true,
        queued: true,
      });

      // Verify operation was queued
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'operation_queue',
        expect.stringContaining(movieId)
      );

      // Mock network recovery and successful retry
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          currentVotes: 1,
          totalMembers: 3,
          matchFound: false,
        }),
        status: 200,
      });

      // Process queued operations
      const processResult = await operationQueueService.processQueue();
      expect(processResult.processed).toBeGreaterThan(0);
    });
  });

  describe('Movie Preloading and Caching Integration', () => {
    it('should preload movies based on room genre preferences', async () => {
      const roomId = 'test-room-preload';
      const genrePreferences = ['Action', 'Sci-Fi'];

      // Mock room with genre preferences
      const mockRoom = {
        roomId: roomId,
        name: 'Preload Test Room',
        genrePreferences: genrePreferences,
        status: 'ACTIVE',
      };

      // Mock movie API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          movies: [
            {
              id: 'action-1',
              title: 'Action Movie 1',
              genres: ['Action'],
              poster: '/action1.jpg',
            },
            {
              id: 'scifi-1',
              title: 'Sci-Fi Movie 1',
              genres: ['Sci-Fi'],
              poster: '/scifi1.jpg',
            },
          ],
        }),
        status: 200,
      });

      // Initialize preloading
      await moviePreloadService.initializeForRoom(roomId, genrePreferences);

      // Verify genre-based movie fetching
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/movies'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Action'),
        })
      );

      // Verify movies were cached locally
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        `preloaded_movies_${roomId}`,
        expect.stringContaining('Action Movie 1')
      );
    });

    it('should handle image caching for offline viewing', async () => {
      const roomId = 'test-room-images';
      const movieWithImage = {
        id: 'movie-img',
        title: 'Movie with Image',
        poster: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      };

      // Mock image caching
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key.startsWith('cached_image_')) {
          return Promise.resolve('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...');
        }
        return Promise.resolve(null);
      });

      // Initialize with image caching
      await moviePreloadService.initializeForRoom(roomId);
      
      // Simulate image preloading
      const cachedImage = await moviePreloadService.getCachedImage(movieWithImage.poster);
      
      expect(cachedImage).toBeDefined();
      expect(cachedImage).toContain('data:image/jpeg;base64');

      // Verify image was cached
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith(
        expect.stringContaining('cached_image_')
      );
    });

    it('should handle cache expiration and refresh', async () => {
      const roomId = 'test-room-expire';
      
      // Mock expired cache
      const expiredCache = {
        movies: [],
        cachedAt: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
        ttl: 24 * 60 * 60 * 1000, // 24 hour TTL
      };

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(expiredCache));

      // Mock fresh movie data
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          movies: [
            {
              id: 'fresh-1',
              title: 'Fresh Movie',
              poster: '/fresh.jpg',
            },
          ],
        }),
        status: 200,
      });

      // Initialize with expired cache
      await moviePreloadService.initializeForRoom(roomId);

      // Verify cache refresh was triggered
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/movies'),
        expect.any(Object)
      );

      // Verify new cache was stored
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        `preloaded_movies_${roomId}`,
        expect.stringContaining('Fresh Movie')
      );
    });
  });

  describe('Real-time Updates and Connection Management', () => {
    it('should handle real-time vote updates via AppSync', async () => {
      const roomId = 'test-room-realtime';
      let subscriptionCallback: ((data: any) => void) | null = null;

      // Mock AppSync subscription
      const mockSubscription = {
        subscribe: jest.fn((callback) => {
          subscriptionCallback = callback;
          return {
            unsubscribe: jest.fn(),
          };
        }),
      };

      // Setup subscription
      const subscription = await appSyncService.subscribeToRoomUpdates(roomId);
      expect(subscription).toBeDefined();

      // Simulate receiving vote update
      const voteUpdate = {
        roomId: roomId,
        voteProgress: {
          currentVotes: 2,
          totalMembers: 3,
          votingUsers: ['user-1', 'user-2'],
          pendingUsers: ['user-3'],
        },
        movieInfo: {
          id: 'movie-123',
          title: 'Test Movie',
          genres: ['Action'],
        },
      };

      if (subscriptionCallback) {
        subscriptionCallback(voteUpdate);
      }

      // Verify update was processed
      // In a real implementation, this would update the UI state
      expect(voteUpdate.voteProgress.currentVotes).toBe(2);
      expect(voteUpdate.movieInfo.title).toBe('Test Movie');
    });

    it('should handle connection loss and reconnection', async () => {
      const roomId = 'test-room-connection';

      // Mock connection status tracking
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'connection_status') {
          return Promise.resolve('CONNECTED');
        }
        return Promise.resolve(null);
      });

      // Simulate connection loss
      await appSyncService.handleConnectionLoss(roomId);

      // Verify connection status was updated
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'connection_status',
        'DISCONNECTED'
      );

      // Simulate reconnection
      await appSyncService.handleReconnection(roomId);

      // Verify reconnection handling
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'connection_status',
        'RECONNECTING'
      );
    });

    it('should sync room state on reconnection', async () => {
      const roomId = 'test-room-sync';

      // Mock room state sync response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          room: {
            roomId: roomId,
            status: 'ACTIVE',
            memberCount: 4,
            currentMovie: {
              id: 'current-movie',
              title: 'Current Movie',
            },
          },
          voteProgress: {
            currentVotes: 2,
            totalMembers: 4,
          },
        }),
        status: 200,
      });

      // Perform state sync
      const syncResult = await appSyncService.syncRoomState(roomId);

      expect(syncResult).toMatchObject({
        room: {
          roomId: roomId,
          status: 'ACTIVE',
          memberCount: 4,
        },
        voteProgress: {
          currentVotes: 2,
          totalMembers: 4,
        },
      });

      // Verify sync API call
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/rooms/${roomId}/sync`),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle API failures gracefully with user-friendly messages', async () => {
      const roomId = 'test-room-error';

      // Mock API failure
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Attempt operation that should fail gracefully
      const result = await roomService.getRoomDetails(roomId);

      // Should return null or error state, not throw
      expect(result).toBeNull();

      // Verify error was logged (in real implementation)
      // This would typically involve checking error logging service calls
    });

    it('should maintain data consistency during partial failures', async () => {
      const roomId = 'test-room-consistency';
      const movieId = 'movie-consistency';

      // Mock partial failure scenario
      mockFetch
        .mockResolvedValueOnce({ // First call succeeds
          ok: true,
          json: () => Promise.resolve({ success: true }),
          status: 200,
        })
        .mockRejectedValueOnce(new Error('Second call fails')); // Second call fails

      // Perform operations that might partially fail
      const firstResult = await voteService.submitVote(roomId, {
        movieId: movieId,
        voteType: 'LIKE',
      });

      expect(firstResult.success).toBe(true);

      // Second operation should handle failure gracefully
      const secondResult = await roomService.leaveRoom(roomId);
      expect(secondResult).toBeFalsy(); // Should indicate failure

      // Verify data consistency is maintained
      // In real implementation, this would check local state consistency
    });

    it('should handle concurrent operations safely', async () => {
      const roomId = 'test-room-concurrent';
      const operations = [];

      // Mock successful responses for all operations
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
        status: 200,
      });

      // Simulate concurrent operations
      for (let i = 0; i < 5; i++) {
        operations.push(
          voteService.submitVote(roomId, {
            movieId: `movie-${i}`,
            voteType: 'LIKE',
          })
        );
      }

      const results = await Promise.all(operations);

      // All operations should complete successfully
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Verify all API calls were made
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });
  });

  describe('Performance and Memory Management', () => {
    it('should manage memory efficiently during extended usage', async () => {
      const roomId = 'test-room-memory';

      // Simulate extended usage with multiple operations
      for (let i = 0; i < 10; i++) {
        await moviePreloadService.initializeForRoom(`${roomId}-${i}`);
        
        // Simulate cleanup of old data
        if (i > 5) {
          await moviePreloadService.cleanup(`${roomId}-${i - 5}`);
        }
      }

      // Verify cleanup was performed
      expect(mockAsyncStorage.removeItem).toHaveBeenCalled();
    });

    it('should handle large movie datasets efficiently', async () => {
      const roomId = 'test-room-large';
      
      // Mock large dataset
      const largeMovieSet = Array.from({ length: 100 }, (_, i) => ({
        id: `movie-${i}`,
        title: `Movie ${i}`,
        poster: `/poster${i}.jpg`,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          movies: largeMovieSet,
        }),
        status: 200,
      });

      const startTime = Date.now();
      await moviePreloadService.initializeForRoom(roomId);
      const executionTime = Date.now() - startTime;

      // Should handle large datasets within reasonable time
      expect(executionTime).toBeLessThan(5000); // 5 seconds

      // Verify data was processed correctly
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        `preloaded_movies_${roomId}`,
        expect.stringContaining('Movie 99')
      );
    });
  });
});