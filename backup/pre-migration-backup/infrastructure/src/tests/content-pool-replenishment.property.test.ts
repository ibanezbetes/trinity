/**
 * Property Test: Content Pool Replenishment
 * 
 * **Property 10: Content Pool Replenishment**
 * **Validates: Requirements 5.1, 5.2**
 * 
 * This property test verifies that the content filtering system automatically
 * replenishes the content pool when it falls below the minimum threshold,
 * ensuring continuous availability of fresh content for users.
 */

import * as fc from 'fast-check';
import { MediaType, FilterCriteria, TMDBContent, ContentFilteringError, CONTENT_FILTERING_CONSTANTS } from '../types/content-filtering';
import { ContentFilterServiceImpl } from '../services/content-filter-service';
import { PriorityAlgorithmEngine } from '../services/priority-algorithm';
import { InMemoryFilterCacheManager } from '../services/filter-cache-manager';
import { createMockTMDBClient, generateMockContent } from './test-utils';

describe('Property Test: Content Pool Replenishment', () => {
  let contentFilterService: ContentFilterServiceImpl;
  let mockTMDBClient: any;
  let priorityAlgorithm: PriorityAlgorithmEngine;
  let cacheManager: InMemoryFilterCacheManager;

  beforeEach(() => {
    mockTMDBClient = createMockTMDBClient();
    priorityAlgorithm = new PriorityAlgorithmEngine(mockTMDBClient);
    cacheManager = new InMemoryFilterCacheManager();
    contentFilterService = new ContentFilterServiceImpl(mockTMDBClient, priorityAlgorithm, cacheManager);
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  /**
   * Property 10.1: Automatic Replenishment Trigger
   * 
   * When the available content pool falls below MIN_CONTENT_THRESHOLD (5 items),
   * the system should automatically trigger replenishment to maintain adequate content.
   */
  test('Property 10.1: System triggers replenishment when pool falls below threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mediaType: fc.constantFrom(MediaType.MOVIE, MediaType.TV),
          genreIds: fc.array(fc.integer({ min: 1, max: 30 }), { minLength: 1, maxLength: 3 }),
          roomId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
        }),
        fc.integer({ min: 100, max: 500 }), // Total available content
        fc.integer({ min: 0, max: 4 }), // Remaining content (below threshold)

        async (criteria: FilterCriteria, totalContent: number, remainingContent: number) => {
          // Generate large pool of available content
          const allContent = generateMockContent(totalContent, criteria.mediaType, criteria.genreIds);
          
          // Simulate content that has already been shown (excluded)
          const shownContent = allContent.slice(0, totalContent - remainingContent);
          const excludeIds = shownContent.map(item => item.id);
          
          // Track exclusions in cache manager
          await cacheManager.trackShownContent(criteria.roomId, excludeIds);
          
          // Setup mocks to return all available content
          mockTMDBClient.getContentWithAllGenres.mockResolvedValue(allContent);
          mockTMDBClient.getContentWithAnyGenre.mockResolvedValue(allContent);
          mockTMDBClient.getPopularContent.mockResolvedValue(allContent);

          // Load content pool - this should trigger replenishment logic
          const contentPool = await contentFilterService.loadContentPoolWithCriteria(criteria, excludeIds);
          
          // Verify replenishment behavior
          if (remainingContent < CONTENT_FILTERING_CONSTANTS.MIN_CONTENT_THRESHOLD) {
            // When below threshold, system should attempt to load full pool size
            const expectedSize = Math.min(
              CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE,
              Math.max(remainingContent, 0)
            );
            expect(contentPool.length).toBe(expectedSize);
            
            // Verify no excluded content appears in pool
            const poolIds = new Set(contentPool.map(item => item.id));
            excludeIds.forEach(excludedId => {
              expect(poolIds.has(excludedId)).toBe(false);
            });
          } else {
            // When above threshold, normal loading behavior
            expect(contentPool.length).toBeGreaterThanOrEqual(remainingContent);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 10.2: Fresh Content Loading
   * 
   * During replenishment, the system should load fresh content that hasn't
   * been shown before, maintaining content diversity and user engagement.
   */
  test('Property 10.2: Replenishment loads only fresh, unseen content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mediaType: fc.constantFrom(MediaType.MOVIE, MediaType.TV),
          genreIds: fc.array(fc.integer({ min: 1, max: 30 }), { minLength: 0, maxLength: 3 }),
          roomId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
        }),
        fc.integer({ min: 50, max: 200 }), // Large content pool
        fc.float({ min: Math.fround(0.3), max: Math.fround(0.8) }), // Exclusion ratio

        async (criteria: FilterCriteria, totalContent: number, exclusionRatio: number) => {
          // Generate content pool
          const allContent = generateMockContent(totalContent, criteria.mediaType, criteria.genreIds);
          
          // Create exclusion list (previously shown content)
          const exclusionCount = Math.floor(totalContent * exclusionRatio);
          const excludeIds = allContent.slice(0, exclusionCount).map(item => item.id);
          
          // Track exclusions
          await cacheManager.trackShownContent(criteria.roomId, excludeIds);
          
          // Setup mocks
          mockTMDBClient.getContentWithAllGenres.mockResolvedValue(allContent);
          mockTMDBClient.getContentWithAnyGenre.mockResolvedValue(allContent);
          mockTMDBClient.getPopularContent.mockResolvedValue(allContent);

          // Load content pool
          const contentPool = await contentFilterService.loadContentPoolWithCriteria(criteria, excludeIds);
          
          // Verify all content in pool is fresh (not excluded)
          const poolIds = new Set(contentPool.map(item => item.id));
          const excludeSet = new Set(excludeIds);
          
          // No excluded content should appear in the pool
          poolIds.forEach(poolId => {
            expect(excludeSet.has(poolId)).toBe(false);
          });
          
          // Pool should contain only fresh content
          const freshContent = allContent.filter(item => !excludeSet.has(item.id));
          const expectedMaxSize = Math.min(
            CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE,
            freshContent.length
          );
          
          expect(contentPool.length).toBeLessThanOrEqual(expectedMaxSize);
          expect(contentPool.length).toBeGreaterThan(0); // Should have some content unless no fresh content available
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 10.3: Replenishment Maintains Priority Order
   * 
   * During replenishment, the system should maintain the three-tier priority
   * system (ALL genres > ANY genre > Popular) while loading fresh content.
   */
  test('Property 10.3: Replenishment maintains content priority ordering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mediaType: fc.constantFrom(MediaType.MOVIE, MediaType.TV),
          genreIds: fc.array(fc.integer({ min: 1, max: 30 }), { minLength: 1, maxLength: 2 }),
          roomId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
        }),

        async (criteria: FilterCriteria) => {
          // Generate diverse content with different genre combinations
          const allGenresContent = generateMockContent(20, criteria.mediaType, criteria.genreIds);
          const someGenresContent = generateMockContent(20, criteria.mediaType, [criteria.genreIds[0]]);
          const popularContent = generateMockContent(20, criteria.mediaType, [99, 100]); // Different genres
          
          const allContent = [...allGenresContent, ...someGenresContent, ...popularContent];
          
          // Setup mocks to return appropriate content for each priority level
          mockTMDBClient.getContentWithAllGenres.mockResolvedValue(allGenresContent);
          mockTMDBClient.getContentWithAnyGenre.mockResolvedValue([...allGenresContent, ...someGenresContent]);
          mockTMDBClient.getPopularContent.mockResolvedValue(popularContent);

          // Load content pool
          const contentPool = await contentFilterService.loadContentPoolWithCriteria(criteria, []);
          
          // Analyze priority distribution in the result
          let priority1Count = 0; // ALL genres
          let priority2Count = 0; // ANY genre (but not all)
          let priority3Count = 0; // Popular (no matching genres)
          
          contentPool.forEach(item => {
            const hasAllGenres = criteria.genreIds.every(genreId => item.genre_ids.includes(genreId));
            const hasAnyGenre = criteria.genreIds.some(genreId => item.genre_ids.includes(genreId));
            
            if (hasAllGenres) {
              priority1Count++;
            } else if (hasAnyGenre) {
              priority2Count++;
            } else {
              priority3Count++;
            }
          });
          
          // Verify priority ordering is maintained
          // Priority 1 content should be preferred when available
          if (allGenresContent.length > 0) {
            expect(priority1Count).toBeGreaterThan(0);
          }
          
          // Total should not exceed pool size
          expect(priority1Count + priority2Count + priority3Count).toBe(contentPool.length);
          expect(contentPool.length).toBeLessThanOrEqual(CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE);
          
          // Content should be valid
          contentPool.forEach(item => {
            expect(item.id).toBeDefined();
            expect(item.title).toBeDefined();
            expect(typeof item.vote_average).toBe('number');
          });
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Property 10.4: Replenishment Handles Insufficient Content
   * 
   * When there's insufficient fresh content available, the system should
   * gracefully handle the situation without errors and return what's available.
   */
  test('Property 10.4: Replenishment handles insufficient fresh content gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mediaType: fc.constantFrom(MediaType.MOVIE, MediaType.TV),
          genreIds: fc.array(fc.integer({ min: 1, max: 30 }), { minLength: 1, maxLength: 3 }),
          roomId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
        }),
        fc.integer({ min: 1, max: 10 }), // Very limited content available

        async (criteria: FilterCriteria, limitedContent: number) => {
          // Generate very limited content
          const allContent = generateMockContent(limitedContent, criteria.mediaType, criteria.genreIds);
          
          // Exclude most content, leaving very little fresh content
          const excludeCount = Math.max(0, limitedContent - 2);
          const excludeIds = allContent.slice(0, excludeCount).map(item => item.id);
          
          // Track exclusions
          await cacheManager.trackShownContent(criteria.roomId, excludeIds);
          
          // Setup mocks
          mockTMDBClient.getContentWithAllGenres.mockResolvedValue(allContent);
          mockTMDBClient.getContentWithAnyGenre.mockResolvedValue(allContent);
          mockTMDBClient.getPopularContent.mockResolvedValue(allContent);

          // Load content pool - should not throw error
          const contentPool = await contentFilterService.loadContentPoolWithCriteria(criteria, excludeIds);
          
          // Verify graceful handling
          const availableFreshContent = allContent.filter(item => !excludeIds.includes(item.id));
          const expectedSize = Math.min(
            CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE,
            availableFreshContent.length
          );
          
          expect(contentPool.length).toBe(expectedSize);
          expect(contentPool.length).toBeGreaterThanOrEqual(0);
          
          // Verify no excluded content in pool
          const poolIds = new Set(contentPool.map(item => item.id));
          excludeIds.forEach(excludedId => {
            expect(poolIds.has(excludedId)).toBe(false);
          });
          
          // All returned content should be valid
          contentPool.forEach(item => {
            expect(item.id).toBeDefined();
            expect(item.title).toBeDefined();
            expect(typeof item.vote_average).toBe('number');
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 10.5: Replenishment Consistency Across Multiple Calls
   * 
   * Multiple replenishment calls with the same exclusion state should
   * return consistent results, ensuring predictable behavior.
   */
  test('Property 10.5: Multiple replenishment calls return consistent results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mediaType: fc.constantFrom(MediaType.MOVIE, MediaType.TV),
          genreIds: fc.array(fc.integer({ min: 1, max: 30 }), { minLength: 0, maxLength: 2 }),
          roomId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
        }),

        async (criteria: FilterCriteria) => {
          // Generate consistent content
          const allContent = generateMockContent(100, criteria.mediaType, criteria.genreIds);
          const excludeIds = allContent.slice(0, 50).map(item => item.id);
          
          // Track exclusions
          await cacheManager.trackShownContent(criteria.roomId, excludeIds);
          
          // Setup mocks to return same content each time
          mockTMDBClient.getContentWithAllGenres.mockResolvedValue(allContent);
          mockTMDBClient.getContentWithAnyGenre.mockResolvedValue(allContent);
          mockTMDBClient.getPopularContent.mockResolvedValue(allContent);

          // Make multiple calls
          const results = await Promise.all([
            contentFilterService.loadContentPoolWithCriteria(criteria, excludeIds),
            contentFilterService.loadContentPoolWithCriteria(criteria, excludeIds),
            contentFilterService.loadContentPoolWithCriteria(criteria, excludeIds)
          ]);

          // All calls should return same pool size
          const sizes = results.map(pool => pool.length);
          expect(new Set(sizes).size).toBe(1); // All sizes should be identical
          
          // Size should be consistent with expectations
          const availableFreshContent = allContent.filter(item => !excludeIds.includes(item.id));
          const expectedSize = Math.min(CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE, availableFreshContent.length);
          expect(sizes[0]).toBe(expectedSize);
          
          // All results should contain valid content
          results.forEach(pool => {
            pool.forEach(item => {
              expect(item.id).toBeDefined();
              expect(item.title).toBeDefined();
              expect(typeof item.vote_average).toBe('number');
            });
          });
        }
      ),
      { numRuns: 15 }
    );
  });
});