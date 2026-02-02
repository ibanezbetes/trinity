/**
 * Property Test: Cache Management by Filter Criteria
 * 
 * **Validates: Requirements 7.1, 7.2**
 * 
 * This property test validates that the FilterCacheManager correctly handles
 * caching operations based on filter criteria, ensuring cache consistency
 * and proper key generation.
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
  createInMemoryCacheManager
} from '../services/filter-cache-manager';

import { generateTMDBContent, generateFilterCriteria } from './test-utils';

describe('Property Test: Cache Management by Filter Criteria', () => {
  let cacheManager: FilterCacheManager;
  
  beforeEach(() => {
    cacheManager = createInMemoryCacheManager();
  });
  
  /**
   * Property 13: Cache Management by Filter Criteria
   * 
   * For any valid filter criteria and content list:
   * 1. After caching content, it should be retrievable with the same criteria
   * 2. Different criteria should not return cached content from other criteria
   * 3. Cache keys should be deterministic and consistent
   */
  test('Property 13: Cache Management by Filter Criteria', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate two different filter criteria
        fc.record({
          criteria1: generateFilterCriteria(),
          criteria2: generateFilterCriteria(),
          content1: fc.array(generateTMDBContent(), { minLength: 1, maxLength: 50 }),
          content2: fc.array(generateTMDBContent(), { minLength: 1, maxLength: 50 })
        }),
        async ({ criteria1, criteria2, content1, content2 }) => {
          // Ensure criteria are different (at least one field differs)
          fc.pre(
            criteria1.mediaType !== criteria2.mediaType ||
            !arraysEqual(criteria1.genreIds, criteria2.genreIds)
          );
          
          // Cache content for first criteria
          await cacheManager.setCachedContent(criteria1, content1);
          
          // Cache content for second criteria
          await cacheManager.setCachedContent(criteria2, content2);
          
          // Retrieve content for first criteria
          const retrieved1 = await cacheManager.getCachedContent(criteria1);
          
          // Retrieve content for second criteria
          const retrieved2 = await cacheManager.getCachedContent(criteria2);
          
          // Assertions
          expect(retrieved1).not.toBeNull();
          expect(retrieved2).not.toBeNull();
          
          // Content should match what was cached
          expect(retrieved1).toHaveLength(content1.length);
          expect(retrieved2).toHaveLength(content2.length);
          
          // Content IDs should match (order may differ due to filtering)
          const ids1 = content1.map(c => c.id).sort();
          const retrievedIds1 = retrieved1!.map(c => c.id).sort();
          expect(retrievedIds1).toEqual(ids1);
          
          const ids2 = content2.map(c => c.id).sort();
          const retrievedIds2 = retrieved2!.map(c => c.id).sort();
          expect(retrievedIds2).toEqual(ids2);
          
          // Different criteria should return different content
          if (!arraysEqual(ids1, ids2)) {
            expect(retrievedIds1).not.toEqual(retrievedIds2);
          }
        }
      ),
      { numRuns: 50, timeout: 10000 }
    );
  });
  
  /**
   * Property: Cache Key Consistency
   * 
   * The same filter criteria should always generate the same cache key,
   * regardless of the order of operations or genre ID ordering.
   */
  test('Property: Cache Key Consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mediaType: fc.constantFrom(MediaType.MOVIE, MediaType.TV),
          genreIds: fc.array(
            fc.integer({ min: 1, max: 999 }),
            { minLength: 0, maxLength: CONTENT_FILTERING_CONSTANTS.MAX_GENRES_PER_ROOM }
          ),
          roomId: fc.string({ minLength: 1, maxLength: 50 }),
          content: fc.array(generateTMDBContent(), { minLength: 1, maxLength: 10 })
        }),
        async ({ mediaType, genreIds, roomId, content }) => {
          // Create criteria with genres in original order
          const criteria1: FilterCriteria = {
            mediaType,
            genreIds: [...genreIds],
            roomId
          };
          
          // Create criteria with genres in shuffled order
          const shuffledGenres = [...genreIds].sort(() => Math.random() - 0.5);
          const criteria2: FilterCriteria = {
            mediaType,
            genreIds: shuffledGenres,
            roomId
          };
          
          // Cache content with first criteria
          await cacheManager.setCachedContent(criteria1, content);
          
          // Try to retrieve with second criteria (should work if key generation is consistent)
          const retrieved = await cacheManager.getCachedContent(criteria2);
          
          // Should retrieve the same content regardless of genre order
          expect(retrieved).not.toBeNull();
          expect(retrieved).toHaveLength(content.length);
          
          const originalIds = content.map(c => c.id).sort();
          const retrievedIds = retrieved!.map(c => c.id).sort();
          expect(retrievedIds).toEqual(originalIds);
        }
      ),
      { numRuns: 30, timeout: 8000 }
    );
  });
  
  /**
   * Property: Cache Exclusion Filtering
   * 
   * When retrieving cached content with exclusion IDs, the returned content
   * should not contain any of the excluded items.
   */
  test('Property: Cache Exclusion Filtering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          criteria: generateFilterCriteria(),
          content: fc.array(generateTMDBContent(), { minLength: 5, maxLength: 30 }),
          excludeRatio: fc.float({ min: Math.fround(0.1), max: Math.fround(0.8) }) // Exclude 10-80% of content
        }),
        async ({ criteria, content, excludeRatio }) => {
          // Cache the content
          await cacheManager.setCachedContent(criteria, content);
          
          // Select some content IDs to exclude
          const excludeCount = Math.floor(content.length * excludeRatio);
          const excludeIds = content
            .slice(0, excludeCount)
            .map(c => c.id);
          
          // Retrieve content with exclusions
          const retrieved = await cacheManager.getCachedContent(criteria, excludeIds);
          
          // Assertions
          expect(retrieved).not.toBeNull();
          
          // No excluded IDs should be in the result
          const retrievedIds = retrieved!.map(c => c.id);
          const excludeSet = new Set(excludeIds);
          
          for (const id of retrievedIds) {
            expect(excludeSet.has(id)).toBe(false);
          }
          
          // Result should contain the non-excluded items
          const expectedCount = content.length - excludeIds.length;
          expect(retrieved).toHaveLength(expectedCount);
          
          // All returned items should be from the original content
          const originalIds = new Set(content.map(c => c.id));
          for (const id of retrievedIds) {
            expect(originalIds.has(id)).toBe(true);
          }
        }
      ),
      { numRuns: 40, timeout: 8000 }
    );
  });
  
  /**
   * Property: Cache Miss Behavior
   * 
   * Requesting content for criteria that hasn't been cached should return null.
   */
  test('Property: Cache Miss Behavior', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateFilterCriteria(),
        async (criteria) => {
          // Try to retrieve content that was never cached
          const retrieved = await cacheManager.getCachedContent(criteria);
          
          // Should return null for cache miss
          expect(retrieved).toBeNull();
        }
      ),
      { numRuns: 20, timeout: 5000 }
    );
  });
  
  /**
   * Property: Cache Invalidation
   * 
   * After invalidating cache for specific criteria, subsequent retrievals
   * should return null, while other cached content remains unaffected.
   */
  test('Property: Cache Invalidation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          criteria1: generateFilterCriteria(),
          criteria2: generateFilterCriteria(),
          content1: fc.array(generateTMDBContent(), { minLength: 1, maxLength: 20 }),
          content2: fc.array(generateTMDBContent(), { minLength: 1, maxLength: 20 })
        }),
        async ({ criteria1, criteria2, content1, content2 }) => {
          // Ensure criteria are different
          fc.pre(
            criteria1.mediaType !== criteria2.mediaType ||
            !arraysEqual(criteria1.genreIds, criteria2.genreIds)
          );
          
          // Cache content for both criteria
          await cacheManager.setCachedContent(criteria1, content1);
          await cacheManager.setCachedContent(criteria2, content2);
          
          // Verify both are cached
          const beforeInvalidation1 = await cacheManager.getCachedContent(criteria1);
          const beforeInvalidation2 = await cacheManager.getCachedContent(criteria2);
          
          expect(beforeInvalidation1).not.toBeNull();
          expect(beforeInvalidation2).not.toBeNull();
          
          // Invalidate cache for first criteria only
          await cacheManager.invalidateCache(criteria1);
          
          // Check results after invalidation
          const afterInvalidation1 = await cacheManager.getCachedContent(criteria1);
          const afterInvalidation2 = await cacheManager.getCachedContent(criteria2);
          
          // First criteria should return null (invalidated)
          expect(afterInvalidation1).toBeNull();
          
          // Second criteria should still return cached content
          expect(afterInvalidation2).not.toBeNull();
          expect(afterInvalidation2).toHaveLength(content2.length);
        }
      ),
      { numRuns: 30, timeout: 8000 }
    );
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, index) => val === sortedB[index]);
}