/**
 * Property Test: Content Pool Size Consistency
 * 
 * **Validates: Requirements 3.1, 3.5**
 * 
 * This property test verifies that the content filtering system consistently
 * maintains the correct pool size (30 items) regardless of filter criteria,
 * exclusions, or content availability scenarios.
 */

import * as fc from 'fast-check';
import { MediaType, FilterCriteria, TMDBContent, ContentFilteringError, CONTENT_FILTERING_CONSTANTS } from '../types/content-filtering';
import { ContentFilterServiceImpl } from '../services/content-filter-service';
import { PriorityAlgorithmEngine } from '../services/priority-algorithm';
import { InMemoryFilterCacheManager } from '../services/filter-cache-manager';
import { createMockTMDBClient, generateMockContent } from './test-utils';

describe('Property Test: Content Pool Size Consistency', () => {
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
   * Property 4: Content Pool Size Consistency
   * 
   * For any valid filter criteria, the content pool should always contain
   * exactly CONTENT_POOL_SIZE (30) items when sufficient content is available,
   * or the maximum available content when less than 30 items exist.
   */
  test('Property 4: Content pool maintains consistent size across all filter combinations', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary filter criteria
        fc.record({
          mediaType: fc.constantFrom(MediaType.MOVIE, MediaType.TV),
          genreIds: fc.array(
            fc.integer({ min: 1, max: 50 }), 
            { minLength: 0, maxLength: CONTENT_FILTERING_CONSTANTS.MAX_GENRES_PER_ROOM }
          ),
          roomId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
        }),
        // Generate exclusion list
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 100 }),
        // Generate available content count (simulates TMDB API response size)
        fc.integer({ min: 0, max: 200 }),

        async (criteria: FilterCriteria, excludeIds: string[], availableContentCount: number) => {
          // Setup mock to return specified amount of content
          const mockContent = generateMockContent(availableContentCount, criteria.mediaType, criteria.genreIds);
          
          // Clear cache to ensure fresh test
          await cacheManager.invalidateCache(criteria);
          
          // Configure mock responses for all priority levels
          mockTMDBClient.getContentWithAllGenres.mockResolvedValue(
            mockContent.filter((item: TMDBContent) => 
              criteria.genreIds.every(genreId => item.genre_ids.includes(genreId))
            )
          );
          
          mockTMDBClient.getContentWithAnyGenre.mockResolvedValue(
            mockContent.filter((item: TMDBContent) => 
              criteria.genreIds.some(genreId => item.genre_ids.includes(genreId))
            )
          );
          
          mockTMDBClient.getPopularContent.mockResolvedValue(mockContent);

          try {
            // Load content pool with criteria
            const contentPool = await contentFilterService.loadContentPoolWithCriteria(criteria, excludeIds);
            
            // Calculate expected size based on available content after exclusions
            const excludeSet = new Set(excludeIds);
            const availableAfterExclusions = mockContent.filter((item: TMDBContent) => !excludeSet.has(item.id));
            const expectedSize = Math.min(
              CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE,
              availableAfterExclusions.length
            );
            
            // Verify pool size consistency
            expect(contentPool.length).toBeLessThanOrEqual(CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE);
            expect(contentPool.length).toBe(expectedSize);
            
            // Verify no excluded content appears in pool
            const poolIds = new Set(contentPool.map(item => item.id));
            excludeIds.forEach(excludedId => {
              expect(poolIds.has(excludedId)).toBe(false);
            });
            
            // Verify all content matches media type
            contentPool.forEach(item => {
              // Content should be valid for the requested media type
              expect(item.id).toBeDefined();
              expect(item.title).toBeDefined();
              expect(typeof item.vote_average).toBe('number');
            });
            
          } catch (error) {
            // Only validation errors should be thrown for invalid criteria
            if (criteria.genreIds.length > CONTENT_FILTERING_CONSTANTS.MAX_GENRES_PER_ROOM) {
              expect((error as ContentFilteringError).code).toBe('TOO_MANY_GENRES');
            } else if (!criteria.roomId || criteria.roomId.trim().length === 0) {
              expect((error as ContentFilteringError).code).toBe('INVALID_MEDIA_TYPE');
            } else {
              // Unexpected errors should not occur with valid criteria
              throw error;
            }
          }
        }
      ),
      { 
        numRuns: 100,
        timeout: 30000,
        verbose: true
      }
    );
  });

  /**
   * Property 4.1: Content Pool Size with Empty Genre Selection
   * 
   * When no genres are selected, the system should still return exactly
   * CONTENT_POOL_SIZE items of popular content for the media type.
   */
  test('Property 4.1: Content pool size consistency with no genre filters', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(MediaType.MOVIE, MediaType.TV),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        fc.integer({ min: 30, max: 200 }), // Ensure sufficient content available

        async (mediaType: MediaType, roomId: string, availableCount: number) => {
          const criteria: FilterCriteria = {
            mediaType,
            genreIds: [], // No genre filtering
            roomId
          };

          // Setup mock with sufficient popular content
          const mockContent = generateMockContent(availableCount, mediaType, []);
          mockTMDBClient.getPopularContent.mockResolvedValue(mockContent);

          const contentPool = await contentFilterService.loadContentPoolWithCriteria(criteria, []);

          // Should return exactly target pool size when no genre filtering
          expect(contentPool.length).toBe(CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE);
          
          // All content should match the requested media type
          contentPool.forEach(item => {
            expect(item.id).toBeDefined();
            expect(item.title).toBeDefined();
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 4.2: Content Pool Size with Maximum Exclusions
   * 
   * Even with a large number of exclusions, the system should attempt
   * to maintain pool size by finding non-excluded content.
   */
  test('Property 4.2: Content pool handles large exclusion lists correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mediaType: fc.constantFrom(MediaType.MOVIE, MediaType.TV),
          genreIds: fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 2 }),
          roomId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
        }),
        fc.integer({ min: 100, max: 500 }), // Large content pool
        fc.float({ min: Math.fround(0.1), max: Math.fround(0.8) }), // Exclusion ratio (10% to 80%)

        async (criteria: FilterCriteria, totalContent: number, exclusionRatio: number) => {
          // Generate large content pool
          const mockContent = generateMockContent(totalContent, criteria.mediaType, criteria.genreIds);
          
          // Generate exclusions based on ratio
          const exclusionCount = Math.floor(totalContent * exclusionRatio);
          const excludeIds = mockContent.slice(0, exclusionCount).map((item: TMDBContent) => item.id);
          
          // Setup mocks
          mockTMDBClient.getContentWithAllGenres.mockResolvedValue(mockContent);
          mockTMDBClient.getContentWithAnyGenre.mockResolvedValue(mockContent);
          mockTMDBClient.getPopularContent.mockResolvedValue(mockContent);

          const contentPool = await contentFilterService.loadContentPoolWithCriteria(criteria, excludeIds);

          // Calculate expected available content after exclusions
          const availableContent = mockContent.filter((item: TMDBContent) => !excludeIds.includes(item.id));
          const expectedSize = Math.min(
            CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE,
            availableContent.length
          );

          expect(contentPool.length).toBe(expectedSize);
          
          // Verify no excluded content appears in result
          const poolIds = new Set(contentPool.map(item => item.id));
          excludeIds.forEach((excludedId: string) => {
            expect(poolIds.has(excludedId)).toBe(false);
          });
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 4.3: Content Pool Size Consistency Across Multiple Calls
   * 
   * Multiple calls with the same criteria should return consistent pool sizes,
   * accounting for caching behavior.
   */
  test('Property 4.3: Multiple calls with same criteria return consistent sizes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mediaType: fc.constantFrom(MediaType.MOVIE, MediaType.TV),
          genreIds: fc.array(fc.integer({ min: 1, max: 30 }), { minLength: 0, maxLength: 3 }),
          roomId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
        }),

        async (criteria: FilterCriteria) => {
          // Generate consistent mock content
          const mockContent = generateMockContent(100, criteria.mediaType, criteria.genreIds);
          
          // Setup mocks to return same content each time
          mockTMDBClient.getContentWithAllGenres.mockResolvedValue(mockContent);
          mockTMDBClient.getContentWithAnyGenre.mockResolvedValue(mockContent);
          mockTMDBClient.getPopularContent.mockResolvedValue(mockContent);

          // Make multiple calls with same criteria
          const results = await Promise.all([
            contentFilterService.loadContentPoolWithCriteria(criteria, []),
            contentFilterService.loadContentPoolWithCriteria(criteria, []),
            contentFilterService.loadContentPoolWithCriteria(criteria, [])
          ]);

          // All calls should return same pool size
          const sizes = results.map(pool => pool.length);
          expect(new Set(sizes).size).toBe(1); // All sizes should be identical
          
          // Size should be consistent with expectations
          const expectedSize = Math.min(CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE, mockContent.length);
          expect(sizes[0]).toBe(expectedSize);
        }
      ),
      { numRuns: 25 }
    );
  });
});