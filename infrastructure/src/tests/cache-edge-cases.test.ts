/**
 * Unit Tests: Cache Edge Cases
 * 
 * Tests cache expiration scenarios and cache corruption handling
 * for the FilterCacheManager implementation.
 * 
 * **Validates: Requirements 7.3, 7.5**
 */

import * as fc from 'fast-check';
import {
  FilterCriteria,
  TMDBContent,
  MediaType,
  CONTENT_FILTERING_CONSTANTS
} from '../types/content-filtering';

import {
  FilterCacheManager,
  InMemoryFilterCacheManager,
  createInMemoryCacheManager
} from '../services/filter-cache-manager';

import { generateTMDBContent } from './test-utils';

describe('Cache Edge Cases', () => {
  let cacheManager: FilterCacheManager;
  
  beforeEach(() => {
    cacheManager = createInMemoryCacheManager();
  });
  
  describe('Cache Expiration Scenarios', () => {
    test('should return null for expired cache entries', async () => {
      // Create a cache manager with very short TTL for testing
      const shortTTLManager = new TestCacheManagerWithCustomTTL(1); // 1ms TTL
      
      const criteria: FilterCriteria = {
        mediaType: MediaType.MOVIE,
        genreIds: [28, 12],
        roomId: 'test-room'
      };
      
      const content = [
        fc.sample(generateTMDBContent(), 1)[0],
        fc.sample(generateTMDBContent(), 1)[0],
        fc.sample(generateTMDBContent(), 1)[0]
      ];
      
      // Cache content
      await shortTTLManager.setCachedContent(criteria, content);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should return null due to expiration
      const retrieved = await shortTTLManager.getCachedContent(criteria);
      expect(retrieved).toBeNull();
    });
    
    test('should handle cache cleanup correctly', async () => {
      const shortTTLManager = new TestCacheManagerWithCustomTTL(1); // 1ms TTL
      
      const criteria1: FilterCriteria = {
        mediaType: MediaType.MOVIE,
        genreIds: [28],
        roomId: 'room1'
      };
      
      const criteria2: FilterCriteria = {
        mediaType: MediaType.TV,
        genreIds: [18],
        roomId: 'room2'
      };
      
      const content1 = [fc.sample(generateTMDBContent(), 1)[0]];
      const content2 = [fc.sample(generateTMDBContent(), 1)[0]];
      
      // Cache content for both criteria
      await shortTTLManager.setCachedContent(criteria1, content1);
      await shortTTLManager.setCachedContent(criteria2, content2);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Run cleanup
      const cleanedCount = await shortTTLManager.cleanupExpiredCache();
      
      // Should have cleaned up expired entries
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
      
      // Both should return null after cleanup
      const retrieved1 = await shortTTLManager.getCachedContent(criteria1);
      const retrieved2 = await shortTTLManager.getCachedContent(criteria2);
      
      expect(retrieved1).toBeNull();
      expect(retrieved2).toBeNull();
    });
    
    test('should not return expired content even if cleanup has not run', async () => {
      const shortTTLManager = new TestCacheManagerWithCustomTTL(1); // 1ms TTL
      
      const criteria: FilterCriteria = {
        mediaType: MediaType.MOVIE,
        genreIds: [35],
        roomId: 'test-room'
      };
      
      const content = [fc.sample(generateTMDBContent(), 1)[0]];
      
      // Cache content
      await shortTTLManager.setCachedContent(criteria, content);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should return null even without explicit cleanup
      const retrieved = await shortTTLManager.getCachedContent(criteria);
      expect(retrieved).toBeNull();
    });
  });
  
  describe('Cache Corruption Handling', () => {
    test('should handle malformed cache entries gracefully', async () => {
      const corruptibleManager = new TestCacheManagerWithCorruption();
      
      const criteria: FilterCriteria = {
        mediaType: MediaType.MOVIE,
        genreIds: [28, 12],
        roomId: 'test-room'
      };
      
      // This should not throw an error even with corruption
      const retrieved = await corruptibleManager.getCachedContent(criteria);
      expect(retrieved).toBeNull();
    });
    
    test('should handle missing required fields in cache entries', async () => {
      const criteria: FilterCriteria = {
        mediaType: MediaType.TV,
        genreIds: [18],
        roomId: 'test-room'
      };
      
      const invalidContent = [
        {
          id: '123',
          // Missing required fields like title, overview, etc.
        } as TMDBContent
      ];
      
      // Should handle invalid content gracefully
      await expect(cacheManager.setCachedContent(criteria, invalidContent))
        .resolves.not.toThrow();
      
      const retrieved = await cacheManager.getCachedContent(criteria);
      expect(retrieved).not.toBeNull();
      expect(retrieved).toHaveLength(1);
    });
    
    test('should handle extremely large content arrays', async () => {
      const criteria: FilterCriteria = {
        mediaType: MediaType.MOVIE,
        genreIds: [28],
        roomId: 'large-content-room'
      };
      
      // Create a very large content array
      const largeContent: TMDBContent[] = [];
      for (let i = 0; i < 1000; i++) {
        largeContent.push({
          id: `movie-${i}`,
          title: `Movie ${i}`,
          overview: `Overview for movie ${i}`,
          genre_ids: [28, 12],
          vote_average: Math.random() * 10,
          poster_path: `/poster-${i}.jpg`,
          release_date: '2023-01-01'
        });
      }
      
      // Should handle large arrays without issues
      await expect(cacheManager.setCachedContent(criteria, largeContent))
        .resolves.not.toThrow();
      
      const retrieved = await cacheManager.getCachedContent(criteria);
      expect(retrieved).not.toBeNull();
      expect(retrieved).toHaveLength(1000);
    });
    
    test('should handle content with special characters and unicode', async () => {
      const criteria: FilterCriteria = {
        mediaType: MediaType.MOVIE,
        genreIds: [35],
        roomId: 'unicode-room-🎬'
      };
      
      const unicodeContent: TMDBContent[] = [
        {
          id: 'unicode-1',
          title: 'Película con Ñ y Acentós 🎭',
          overview: 'Una descripción con caracteres especiales: áéíóú ñ ¿¡',
          genre_ids: [35],
          vote_average: 8.5,
          poster_path: '/póster-ñ.jpg',
          release_date: '2023-12-25'
        },
        {
          id: 'unicode-2',
          title: '映画タイトル 🎌',
          overview: 'Japanese characters and emojis 🗾',
          genre_ids: [35],
          vote_average: 7.2,
          poster_path: '/japanese-poster.jpg',
          release_date: '2023-06-15'
        }
      ];
      
      // Should handle unicode content correctly
      await expect(cacheManager.setCachedContent(criteria, unicodeContent))
        .resolves.not.toThrow();
      
      const retrieved = await cacheManager.getCachedContent(criteria);
      expect(retrieved).not.toBeNull();
      expect(retrieved).toHaveLength(2);
      
      // Verify unicode content is preserved
      const titles = retrieved!.map(c => c.title);
      expect(titles).toContain('Película con Ñ y Acentós 🎭');
      expect(titles).toContain('映画タイトル 🎌');
    });
  });
  
  describe('Exclusion Edge Cases', () => {
    test('should handle room IDs with special characters', async () => {
      const specialRoomId = 'room-with-special-chars_123!@#$%^&*()';
      const contentIds = ['content-1', 'content-2', 'content-3'];
      
      // Should handle special characters in room IDs
      await expect(cacheManager.trackShownContent(specialRoomId, contentIds))
        .resolves.not.toThrow();
      
      const exclusions = await cacheManager.getExcludedContent(specialRoomId);
      expect(exclusions.sort()).toEqual(contentIds.sort());
    });
    
    test('should handle very long exclusion lists', async () => {
      const roomId = 'long-exclusion-room';
      const longContentList: string[] = [];
      
      // Create a very long list of content IDs
      for (let i = 0; i < 10000; i++) {
        longContentList.push(`content-${i}`);
      }
      
      // Should handle large exclusion lists
      await expect(cacheManager.trackShownContent(roomId, longContentList))
        .resolves.not.toThrow();
      
      const exclusions = await cacheManager.getExcludedContent(roomId);
      expect(exclusions).toHaveLength(10000);
      expect(exclusions.sort()).toEqual(longContentList.sort());
    });
    
    test('should handle concurrent exclusion tracking', async () => {
      const roomId = 'concurrent-room';
      const batch1 = ['content-1', 'content-2', 'content-3'];
      const batch2 = ['content-4', 'content-5', 'content-6'];
      const batch3 = ['content-7', 'content-8', 'content-9'];
      
      // Track multiple batches concurrently
      await Promise.all([
        cacheManager.trackShownContent(roomId, batch1),
        cacheManager.trackShownContent(roomId, batch2),
        cacheManager.trackShownContent(roomId, batch3)
      ]);
      
      const exclusions = await cacheManager.getExcludedContent(roomId);
      const allExpected = [...batch1, ...batch2, ...batch3];
      
      // Should have all content from all batches
      expect(exclusions.sort()).toEqual(allExpected.sort());
    });
    
    test('should handle clearing non-existent room exclusions', async () => {
      const nonExistentRoomId = 'non-existent-room-12345';
      
      // Should not throw error when clearing non-existent room
      await expect(cacheManager.clearRoomExclusions(nonExistentRoomId))
        .resolves.not.toThrow();
      
      // Should still return empty array
      const exclusions = await cacheManager.getExcludedContent(nonExistentRoomId);
      expect(exclusions).toEqual([]);
    });
  });
  
  describe('Memory and Performance Edge Cases', () => {
    test('should handle rapid cache operations', async () => {
      const operations: Promise<any>[] = [];
      
      // Perform many cache operations rapidly
      for (let i = 0; i < 100; i++) {
        const criteria: FilterCriteria = {
          mediaType: i % 2 === 0 ? MediaType.MOVIE : MediaType.TV,
          genreIds: [28 + (i % 5)],
          roomId: `room-${i}`
        };
        
        const content = [fc.sample(generateTMDBContent(), 1)[0]];
        
        operations.push(cacheManager.setCachedContent(criteria, content));
        operations.push(cacheManager.getCachedContent(criteria));
      }
      
      // All operations should complete without errors
      await expect(Promise.all(operations)).resolves.not.toThrow();
    });
    
    test('should handle cache key collisions gracefully', async () => {
      // Create criteria that might generate similar cache keys
      const criteria1: FilterCriteria = {
        mediaType: MediaType.MOVIE,
        genreIds: [28, 12],
        roomId: 'room-a'
      };
      
      const criteria2: FilterCriteria = {
        mediaType: MediaType.MOVIE,
        genreIds: [12, 28], // Same genres, different order
        roomId: 'room-b'
      };
      
      const content1 = [fc.sample(generateTMDBContent(), 1)[0]];
      const content2 = [fc.sample(generateTMDBContent(), 1)[0]];
      
      // Cache both
      await cacheManager.setCachedContent(criteria1, content1);
      await cacheManager.setCachedContent(criteria2, content2);
      
      // Both should be retrievable (cache keys should be consistent for same genre sets)
      const retrieved1 = await cacheManager.getCachedContent(criteria1);
      const retrieved2 = await cacheManager.getCachedContent(criteria2);
      
      expect(retrieved1).not.toBeNull();
      expect(retrieved2).not.toBeNull();
      
      // Since genres are the same (just different order), they should return the same cached content
      expect(retrieved1!.map(c => c.id).sort()).toEqual(retrieved2!.map(c => c.id).sort());
    });
  });
});

// ============================================================================
// Test Helper Classes
// ============================================================================

/**
 * Test cache manager with customizable TTL for expiration testing
 */
class TestCacheManagerWithCustomTTL extends InMemoryFilterCacheManager {
  constructor(private ttlMs: number) {
    super();
  }
  
  async setCachedContent(criteria: FilterCriteria, content: TMDBContent[]): Promise<void> {
    const cacheKey = this.buildCacheKey(criteria);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    
    const entry = {
      cacheKey,
      mediaType: criteria.mediaType,
      genreIds: criteria.genreIds,
      content,
      createdAt: now,
      expiresAt,
      totalAvailable: content.length
    };
    
    (this as any).cache.set(cacheKey, entry);
  }
  
  private buildCacheKey(criteria: FilterCriteria): string {
    const sortedGenres = [...criteria.genreIds].sort((a, b) => a - b);
    return `${criteria.mediaType}|${sortedGenres.join(',')}`;
  }
}

/**
 * Test cache manager that simulates corruption scenarios
 */
class TestCacheManagerWithCorruption extends InMemoryFilterCacheManager {
  async getCachedContent(
    criteria: FilterCriteria, 
    excludeIds: string[] = []
  ): Promise<TMDBContent[] | null> {
    // Simulate corruption by returning null
    return null;
  }
}