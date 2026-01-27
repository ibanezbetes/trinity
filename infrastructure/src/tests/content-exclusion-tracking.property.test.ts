/**
 * Property Test: Content Exclusion Tracking
 * 
 * **Validates: Requirements 7.4**
 * 
 * This property test validates that the FilterCacheManager correctly tracks
 * content that has been shown to users in rooms, ensuring no duplicate
 * content is presented and exclusions persist across sessions.
 */

import * as fc from 'fast-check';
import {
  FilterCacheManager,
  createInMemoryCacheManager
} from '../services/filter-cache-manager';

describe('Property Test: Content Exclusion Tracking', () => {
  let cacheManager: FilterCacheManager;
  
  beforeEach(() => {
    // Create a fresh instance for each test to avoid state leakage
    cacheManager = createInMemoryCacheManager();
  });
  
  /**
   * Property 14: Content Exclusion Tracking
   * 
   * For any room and set of content IDs:
   * 1. Tracked content should be retrievable as excluded content
   * 2. Multiple tracking calls should accumulate exclusions
   * 3. Exclusions should persist until explicitly cleared
   * 4. Different rooms should have independent exclusion lists
   */
  test('Property 14: Content Exclusion Tracking', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          roomId1: fc.string({ minLength: 1, maxLength: 50 }),
          roomId2: fc.string({ minLength: 1, maxLength: 50 }),
          contentBatch1: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          contentBatch2: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          contentBatch3: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 })
        }),
        async ({ roomId1, roomId2, contentBatch1, contentBatch2, contentBatch3 }) => {
          // Create a fresh cache manager for this test run
          const testCacheManager = createInMemoryCacheManager();
          
          // Ensure rooms are different
          fc.pre(roomId1 !== roomId2);
          
          // Remove duplicates within batches
          const uniqueBatch1 = [...new Set(contentBatch1)];
          const uniqueBatch2 = [...new Set(contentBatch2)];
          const uniqueBatch3 = [...new Set(contentBatch3)];
          
          // Initially, no content should be excluded for either room
          const initialExclusions1 = await testCacheManager.getExcludedContent(roomId1);
          const initialExclusions2 = await testCacheManager.getExcludedContent(roomId2);
          
          expect(initialExclusions1).toEqual([]);
          expect(initialExclusions2).toEqual([]);
          
          // Track first batch for room 1
          await testCacheManager.trackShownContent(roomId1, uniqueBatch1);
          
          // Track second batch for room 1 (should accumulate)
          await testCacheManager.trackShownContent(roomId1, uniqueBatch2);
          
          // Track third batch for room 2
          await testCacheManager.trackShownContent(roomId2, uniqueBatch3);
          
          // Retrieve exclusions
          const exclusions1 = await testCacheManager.getExcludedContent(roomId1);
          const exclusions2 = await testCacheManager.getExcludedContent(roomId2);
          
          // Room 1 should have exclusions from both batches
          const expectedExclusions1 = [...new Set([...uniqueBatch1, ...uniqueBatch2])];
          expect(exclusions1.sort()).toEqual(expectedExclusions1.sort());
          
          // Room 2 should only have exclusions from batch 3
          expect(exclusions2.sort()).toEqual(uniqueBatch3.sort());
          
          // Rooms should have independent exclusion lists
          if (expectedExclusions1.length > 0 && uniqueBatch3.length > 0) {
            const room1Set = new Set(exclusions1);
            const room2Set = new Set(exclusions2);
            
            // Check that rooms don't share exclusions (unless there's overlap in test data)
            const hasOverlap = expectedExclusions1.some(id => uniqueBatch3.includes(id));
            if (!hasOverlap) {
              expect([...room1Set].some(id => room2Set.has(id))).toBe(false);
            }
          }
        }
      ),
      { numRuns: 50, timeout: 10000 }
    );
  });
  
  /**
   * Property: Exclusion Accumulation
   * 
   * Multiple calls to trackShownContent for the same room should accumulate
   * exclusions without losing previously tracked content.
   */
  test('Property: Exclusion Accumulation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          roomId: fc.string({ minLength: 1, maxLength: 50 }),
          batches: fc.array(
            fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 1, maxLength: 8 }),
            { minLength: 2, maxLength: 5 }
          )
        }),
        async ({ roomId, batches }) => {
          // Create a fresh cache manager for this test run
          const testCacheManager = createInMemoryCacheManager();
          
          const allExpectedIds = new Set<string>();
          
          // Track each batch sequentially
          for (const batch of batches) {
            const uniqueBatch = [...new Set(batch)];
            
            // Skip empty batches to avoid test noise
            if (uniqueBatch.length === 0) {
              continue;
            }
            
            await testCacheManager.trackShownContent(roomId, uniqueBatch);
            
            // Add to expected set
            uniqueBatch.forEach(id => allExpectedIds.add(id));
            
            // Verify accumulation after each batch
            const currentExclusions = await testCacheManager.getExcludedContent(roomId);
            const currentSet = new Set(currentExclusions);
            
            // All previously tracked content should still be excluded
            for (const expectedId of allExpectedIds) {
              expect(currentSet.has(expectedId)).toBe(true);
            }
            
            // Should not have more exclusions than expected
            expect(currentExclusions.length).toBe(allExpectedIds.size);
          }
          
          // Final verification
          const finalExclusions = await testCacheManager.getExcludedContent(roomId);
          expect(finalExclusions.sort()).toEqual([...allExpectedIds].sort());
        }
      ),
      { numRuns: 30, timeout: 8000 }
    );
  });
  
  /**
   * Property: Exclusion Persistence
   * 
   * Exclusions should persist across multiple retrieval operations
   * until explicitly cleared.
   */
  test('Property: Exclusion Persistence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          roomId: fc.string({ minLength: 1, maxLength: 50 }),
          contentIds: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 15 }),
          retrievalCount: fc.integer({ min: 2, max: 10 })
        }),
        async ({ roomId, contentIds, retrievalCount }) => {
          // Create a fresh cache manager for this test run
          const testCacheManager = createInMemoryCacheManager();
          
          const uniqueIds = [...new Set(contentIds)];
          
          // Track content
          await testCacheManager.trackShownContent(roomId, uniqueIds);
          
          // Retrieve exclusions multiple times
          const retrievalResults: string[][] = [];
          for (let i = 0; i < retrievalCount; i++) {
            const exclusions = await testCacheManager.getExcludedContent(roomId);
            retrievalResults.push(exclusions);
          }
          
          // All retrievals should return the same exclusions
          const expectedExclusions = uniqueIds.sort();
          for (const result of retrievalResults) {
            expect(result.sort()).toEqual(expectedExclusions);
          }
          
          // Verify all results are identical
          for (let i = 1; i < retrievalResults.length; i++) {
            expect(retrievalResults[i].sort()).toEqual(retrievalResults[0].sort());
          }
        }
      ),
      { numRuns: 25, timeout: 8000 }
    );
  });
  
  /**
   * Property: Exclusion Clearing
   * 
   * After clearing exclusions for a room, subsequent retrievals should
   * return empty arrays, while other rooms remain unaffected.
   */
  test('Property: Exclusion Clearing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          roomId1: fc.string({ minLength: 1, maxLength: 50 }),
          roomId2: fc.string({ minLength: 1, maxLength: 50 }),
          contentIds1: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          contentIds2: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 })
        }),
        async ({ roomId1, roomId2, contentIds1, contentIds2 }) => {
          // Create a fresh cache manager for this test run
          const testCacheManager = createInMemoryCacheManager();
          
          // Ensure rooms are different
          fc.pre(roomId1 !== roomId2);
          
          const uniqueIds1 = [...new Set(contentIds1)];
          const uniqueIds2 = [...new Set(contentIds2)];
          
          // Track content for both rooms
          await testCacheManager.trackShownContent(roomId1, uniqueIds1);
          await testCacheManager.trackShownContent(roomId2, uniqueIds2);
          
          // Verify both rooms have exclusions
          const beforeClear1 = await testCacheManager.getExcludedContent(roomId1);
          const beforeClear2 = await testCacheManager.getExcludedContent(roomId2);
          
          expect(beforeClear1.sort()).toEqual(uniqueIds1.sort());
          expect(beforeClear2.sort()).toEqual(uniqueIds2.sort());
          
          // Clear exclusions for room 1 only
          await testCacheManager.clearRoomExclusions(roomId1);
          
          // Check results after clearing
          const afterClear1 = await testCacheManager.getExcludedContent(roomId1);
          const afterClear2 = await testCacheManager.getExcludedContent(roomId2);
          
          // Room 1 should have no exclusions
          expect(afterClear1).toEqual([]);
          
          // Room 2 should still have its exclusions
          expect(afterClear2.sort()).toEqual(uniqueIds2.sort());
        }
      ),
      { numRuns: 30, timeout: 8000 }
    );
  });
  
  /**
   * Property: Empty Content Tracking
   * 
   * Tracking empty content arrays should not affect existing exclusions
   * and should not cause errors.
   */
  test('Property: Empty Content Tracking', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          roomId: fc.string({ minLength: 1, maxLength: 50 }),
          initialContent: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          emptyCallCount: fc.integer({ min: 1, max: 5 })
        }),
        async ({ roomId, initialContent, emptyCallCount }) => {
          // Create a fresh cache manager for this test run
          const testCacheManager = createInMemoryCacheManager();
          
          const uniqueInitial = [...new Set(initialContent)];
          
          // Track initial content
          await testCacheManager.trackShownContent(roomId, uniqueInitial);
          
          // Verify initial exclusions
          const initialExclusions = await testCacheManager.getExcludedContent(roomId);
          expect(initialExclusions.sort()).toEqual(uniqueInitial.sort());
          
          // Track empty arrays multiple times
          for (let i = 0; i < emptyCallCount; i++) {
            await testCacheManager.trackShownContent(roomId, []);
          }
          
          // Exclusions should remain unchanged
          const finalExclusions = await testCacheManager.getExcludedContent(roomId);
          expect(finalExclusions.sort()).toEqual(uniqueInitial.sort());
        }
      ),
      { numRuns: 20, timeout: 6000 }
    );
  });
  
  /**
   * Property: Duplicate Content Handling
   * 
   * Tracking the same content IDs multiple times should not create
   * duplicate exclusions.
   */
  test('Property: Duplicate Content Handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          roomId: fc.string({ minLength: 1, maxLength: 50 }),
          contentIds: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          repeatCount: fc.integer({ min: 2, max: 5 })
        }),
        async ({ roomId, contentIds, repeatCount }) => {
          // Create a fresh cache manager for this test run
          const testCacheManager = createInMemoryCacheManager();
          
          const uniqueIds = [...new Set(contentIds)];
          
          // Track the same content multiple times
          for (let i = 0; i < repeatCount; i++) {
            await testCacheManager.trackShownContent(roomId, uniqueIds);
          }
          
          // Should only have unique exclusions
          const exclusions = await testCacheManager.getExcludedContent(roomId);
          const exclusionSet = new Set(exclusions);
          
          // No duplicates in result
          expect(exclusions.length).toBe(exclusionSet.size);
          
          // Should match original unique IDs
          expect(exclusions.sort()).toEqual(uniqueIds.sort());
        }
      ),
      { numRuns: 25, timeout: 8000 }
    );
  });
});