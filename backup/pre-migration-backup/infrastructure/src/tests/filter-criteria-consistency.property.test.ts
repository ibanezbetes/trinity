/**
 * Property Test: Filter Criteria Consistency
 * 
 * **Property 11: Filter Criteria Consistency**
 * **Validates: Requirements 5.3**
 * 
 * For any content reload operation, the system should use identical filter criteria 
 * as the original room creation. This ensures that when content is replenished 
 * (when fewer than 5 titles remain), the new content follows the same filtering 
 * rules as the original room setup.
 */

import * as fc from 'fast-check';
import { ContentFilterServiceImpl } from '../services/content-filter-service';
import { PriorityAlgorithmEngine } from '../services/priority-algorithm';
import { InMemoryFilterCacheManager } from '../services/filter-cache-manager';
import {
  FilterCriteria,
  MediaType,
  TMDBContent,
  ExtendedRoom,
  CONTENT_FILTERING_CONSTANTS
} from '../types/content-filtering';
import {
  generateFilterCriteria,
  generateTMDBContent,
  createMockTMDBClient,
  generateMockContent
} from './test-utils';

describe('Property 11: Filter Criteria Consistency', () => {
  let contentFilterService: ContentFilterServiceImpl;
  let mockTMDBClient: any;
  let mockPriorityAlgorithm: any;
  let mockCacheManager: any;

  beforeEach(() => {
    // Create mock TMDB client
    mockTMDBClient = createMockTMDBClient();
    
    // Create mock priority algorithm
    mockPriorityAlgorithm = {
      prioritizeContent: jest.fn()
    };
    
    // Create in-memory cache manager for testing
    mockCacheManager = new InMemoryFilterCacheManager();
    
    // Create content filter service
    contentFilterService = new ContentFilterServiceImpl(
      mockTMDBClient,
      mockPriorityAlgorithm,
      mockCacheManager
    );
  });

  /**
   * Property Test: Filter criteria used in content reload should be identical 
   * to the original room creation criteria
   */
  test('should use identical filter criteria for content reload operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateFilterCriteria(),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 10 }),
        async (originalCriteria: FilterCriteria, excludeIds: string[]) => {
          // Skip invalid criteria to focus on the consistency property
          if (originalCriteria.genreIds.length > CONTENT_FILTERING_CONSTANTS.MAX_GENRES_PER_ROOM) {
            return true;
          }
          
          // Skip empty room IDs that cause validation errors
          if (!originalCriteria.roomId || originalCriteria.roomId.trim().length === 0) {
            return true;
          }
          
          // Generate mock content for the original room creation
          const mockContent = generateMockContent(
            CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE,
            originalCriteria.mediaType,
            originalCriteria.genreIds
          );
          
          // Mock the priority algorithm to return content
          mockPriorityAlgorithm.prioritizeContent.mockResolvedValue(mockContent);
          
          // Mock the loadContentPool method to return the mock content
          const originalLoadContentPool = contentFilterService.loadContentPool;
          contentFilterService.loadContentPool = jest.fn().mockResolvedValue(mockContent);
          
          try {
            // Create the original room with filter criteria
            const originalRoom = await contentFilterService.createFilteredRoom(originalCriteria);
            
            // Verify the room was created with the correct criteria
            expect(originalRoom.filterCriteria).toEqual(originalCriteria);
            
            // Clear the mock calls to track reload operations
            mockPriorityAlgorithm.prioritizeContent.mockClear();
            
            // Clear cache to force fresh load (not using cache)
            await mockCacheManager.invalidateCache(originalCriteria);
            
            // Generate additional mock content for reload
            const reloadMockContent = generateMockContent(
              CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE,
              originalCriteria.mediaType,
              originalCriteria.genreIds
            );
            
            mockPriorityAlgorithm.prioritizeContent.mockResolvedValue(reloadMockContent);
            
            // Simulate content reload by calling loadContentPoolWithCriteria
            // This simulates what would happen when content pool falls below threshold
            await contentFilterService.loadContentPoolWithCriteria(originalCriteria, excludeIds);
            
            // Verify that the priority algorithm was called with identical criteria
            expect(mockPriorityAlgorithm.prioritizeContent).toHaveBeenCalledWith(
              originalCriteria,
              excludeIds,
              CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE
            );
            
            // Extract the criteria used in the reload call
            const reloadCall = mockPriorityAlgorithm.prioritizeContent.mock.calls[0];
            const reloadCriteria = reloadCall[0];
            
            // Property: The reload criteria should be identical to original criteria
            expect(reloadCriteria).toEqual(originalCriteria);
            expect(reloadCriteria.mediaType).toBe(originalCriteria.mediaType);
            expect(reloadCriteria.genreIds).toEqual(originalCriteria.genreIds);
            expect(reloadCriteria.roomId).toBe(originalCriteria.roomId);
            
            return true;
          } finally {
            // Restore original method
            contentFilterService.loadContentPool = originalLoadContentPool;
          }
        }
      ),
      { 
        numRuns: 100,
        verbose: true
      }
    );
  });

  /**
   * Property Test: Multiple reload operations should always use the same criteria
   */
  test('should maintain criteria consistency across multiple reload operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateFilterCriteria(),
        fc.array(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
          { minLength: 2, maxLength: 5 }
        ),
        async (originalCriteria: FilterCriteria, multipleExcludeLists: string[][]) => {
          // Skip invalid criteria
          if (originalCriteria.genreIds.length > CONTENT_FILTERING_CONSTANTS.MAX_GENRES_PER_ROOM) {
            return true;
          }
          
          // Skip empty room IDs that cause validation errors
          if (!originalCriteria.roomId || originalCriteria.roomId.trim().length === 0) {
            return true;
          }
          
          // Generate mock content
          const mockContent = generateMockContent(
            CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE,
            originalCriteria.mediaType,
            originalCriteria.genreIds
          );
          
          mockPriorityAlgorithm.prioritizeContent.mockResolvedValue(mockContent);
          
          // Mock the loadContentPool method to return the mock content
          const originalLoadContentPool = contentFilterService.loadContentPool;
          contentFilterService.loadContentPool = jest.fn().mockResolvedValue(mockContent);
          
          try {
            // Create the original room
            const originalRoom = await contentFilterService.createFilteredRoom(originalCriteria);
            
            // Clear mock calls
            mockPriorityAlgorithm.prioritizeContent.mockClear();
            
            // Clear cache to force fresh loads
            await mockCacheManager.invalidateCache(originalCriteria);
            
            // Perform multiple reload operations with different exclude lists
            const allReloadCriteria: FilterCriteria[] = [];
            
            for (const excludeIds of multipleExcludeLists) {
              mockPriorityAlgorithm.prioritizeContent.mockResolvedValue(mockContent);
              
              await contentFilterService.loadContentPoolWithCriteria(originalCriteria, excludeIds);
              
              // Capture the criteria used in this reload if priority algorithm was called
              if (mockPriorityAlgorithm.prioritizeContent.mock.calls.length > 0) {
                const lastCall = mockPriorityAlgorithm.prioritizeContent.mock.calls[
                  mockPriorityAlgorithm.prioritizeContent.mock.calls.length - 1
                ];
                if (lastCall && lastCall[0]) {
                  allReloadCriteria.push(lastCall[0]);
                }
              }
            }
            
            // Property: All reload operations should use identical criteria
            for (const reloadCriteria of allReloadCriteria) {
              expect(reloadCriteria).toEqual(originalCriteria);
              expect(reloadCriteria.mediaType).toBe(originalCriteria.mediaType);
              expect(reloadCriteria.genreIds).toEqual(originalCriteria.genreIds);
              expect(reloadCriteria.roomId).toBe(originalCriteria.roomId);
            }
            
            // Property: All criteria should be identical to each other
            if (allReloadCriteria.length > 1) {
              const firstReloadCriteria = allReloadCriteria[0];
              for (let i = 1; i < allReloadCriteria.length; i++) {
                expect(allReloadCriteria[i]).toEqual(firstReloadCriteria);
              }
            }
            
            return true;
          } finally {
            // Restore original method
            contentFilterService.loadContentPool = originalLoadContentPool;
          }
        }
      ),
      { 
        numRuns: 50,
        verbose: true
      }
    );
  });

  /**
   * Property Test: Criteria consistency should be maintained even when cache is involved
   */
  test('should maintain criteria consistency when cache is used in reload operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateFilterCriteria(),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 10 }),
        async (originalCriteria: FilterCriteria, excludeIds: string[]) => {
          // Skip invalid criteria
          if (originalCriteria.genreIds.length > CONTENT_FILTERING_CONSTANTS.MAX_GENRES_PER_ROOM) {
            return true;
          }
          
          // Generate mock content
          const mockContent = generateMockContent(
            CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE,
            originalCriteria.mediaType,
            originalCriteria.genreIds
          );
          
          mockPriorityAlgorithm.prioritizeContent.mockResolvedValue(mockContent);
          
          // Create the original room
          await contentFilterService.createFilteredRoom(originalCriteria);
          
          // Pre-populate cache with content for these criteria
          await mockCacheManager.setCachedContent(originalCriteria, mockContent);
          
          // Clear mock calls
          mockPriorityAlgorithm.prioritizeContent.mockClear();
          
          // Perform reload operation - should use cache but still validate criteria
          await contentFilterService.loadContentPoolWithCriteria(originalCriteria, excludeIds);
          
          // Even when using cache, the criteria passed should be identical
          // The cache lookup should use the same criteria structure
          const cachedContent = await mockCacheManager.getCachedContent(originalCriteria, excludeIds);
          
          // Property: Cache should return content for identical criteria
          expect(cachedContent).toBeDefined();
          expect(Array.isArray(cachedContent)).toBe(true);
          
          // Property: If priority algorithm was called (cache miss), criteria should be identical
          if (mockPriorityAlgorithm.prioritizeContent.mock.calls.length > 0) {
            const reloadCall = mockPriorityAlgorithm.prioritizeContent.mock.calls[0];
            const reloadCriteria = reloadCall[0];
            
            expect(reloadCriteria).toEqual(originalCriteria);
          }
          
          return true;
        }
      ),
      { 
        numRuns: 75,
        verbose: true
      }
    );
  });

  /**
   * Property Test: Criteria immutability during reload operations
   */
  test('should not modify original criteria during reload operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateFilterCriteria(),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 10 }),
        async (originalCriteria: FilterCriteria, excludeIds: string[]) => {
          // Skip invalid criteria
          if (originalCriteria.genreIds.length > CONTENT_FILTERING_CONSTANTS.MAX_GENRES_PER_ROOM) {
            return true;
          }
          
          // Skip empty room IDs that cause validation errors
          if (!originalCriteria.roomId || originalCriteria.roomId.trim().length === 0) {
            return true;
          }
          
          // Create deep copy of original criteria to detect mutations
          const originalCriteriaCopy = JSON.parse(JSON.stringify(originalCriteria));
          
          // Generate mock content
          const mockContent = generateMockContent(
            CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE,
            originalCriteria.mediaType,
            originalCriteria.genreIds
          );
          
          mockPriorityAlgorithm.prioritizeContent.mockResolvedValue(mockContent);
          
          // Mock the loadContentPool method to return the mock content
          const originalLoadContentPool = contentFilterService.loadContentPool;
          contentFilterService.loadContentPool = jest.fn().mockResolvedValue(mockContent);
          
          try {
            // Create room and perform reload
            await contentFilterService.createFilteredRoom(originalCriteria);
            await contentFilterService.loadContentPoolWithCriteria(originalCriteria, excludeIds);
            
            // Property: Original criteria should not be mutated
            expect(originalCriteria).toEqual(originalCriteriaCopy);
            expect(originalCriteria.mediaType).toBe(originalCriteriaCopy.mediaType);
            expect(originalCriteria.genreIds).toEqual(originalCriteriaCopy.genreIds);
            expect(originalCriteria.roomId).toBe(originalCriteriaCopy.roomId);
            
            // Property: Genre IDs array should not be mutated
            expect(originalCriteria.genreIds.length).toBe(originalCriteriaCopy.genreIds.length);
            for (let i = 0; i < originalCriteria.genreIds.length; i++) {
              expect(originalCriteria.genreIds[i]).toBe(originalCriteriaCopy.genreIds[i]);
            }
            
            return true;
          } finally {
            // Restore original method
            contentFilterService.loadContentPool = originalLoadContentPool;
          }
        }
      ),
      { 
        numRuns: 100,
        verbose: true
      }
    );
  });

  /**
   * Edge Case Test: Empty genre list consistency
   */
  test('should maintain consistency for rooms with no genre filters', async () => {
    const criteriaWithNoGenres: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: [],
      roomId: 'test-room-no-genres'
    };

    const mockContent = generateMockContent(
      CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE,
      MediaType.MOVIE,
      []
    );

    mockPriorityAlgorithm.prioritizeContent.mockResolvedValue(mockContent);

    // Mock the loadContentPool method to return the mock content
    const originalLoadContentPool = contentFilterService.loadContentPool;
    contentFilterService.loadContentPool = jest.fn().mockResolvedValue(mockContent);

    try {
      // Create room with no genre filters
      await contentFilterService.createFilteredRoom(criteriaWithNoGenres);

      // Clear mock calls
      mockPriorityAlgorithm.prioritizeContent.mockClear();

      // Perform reload
      await contentFilterService.loadContentPoolWithCriteria(criteriaWithNoGenres, []);

      // Verify criteria consistency
      expect(mockPriorityAlgorithm.prioritizeContent).toHaveBeenCalledWith(
        criteriaWithNoGenres,
        [],
        CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE
      );

      const reloadCall = mockPriorityAlgorithm.prioritizeContent.mock.calls[0];
      const reloadCriteria = reloadCall[0];

      expect(reloadCriteria).toEqual(criteriaWithNoGenres);
      expect(reloadCriteria.genreIds).toEqual([]);
    } finally {
      // Restore original method
      contentFilterService.loadContentPool = originalLoadContentPool;
    }
  });

  /**
   * Edge Case Test: Maximum genre limit consistency
   */
  test('should maintain consistency for rooms with maximum allowed genres', async () => {
    const criteriaWithMaxGenres: FilterCriteria = {
      mediaType: MediaType.TV,
      genreIds: [28, 12, 16], // Maximum 3 genres
      roomId: 'test-room-max-genres'
    };

    const mockContent = generateMockContent(
      CONTENT_FILTERING_CONSTANTS.CONTENT_POOL_SIZE,
      MediaType.TV,
      [28, 12, 16]
    );

    mockPriorityAlgorithm.prioritizeContent.mockResolvedValue(mockContent);

    // Mock the loadContentPool method to return the mock content
    const originalLoadContentPool = contentFilterService.loadContentPool;
    contentFilterService.loadContentPool = jest.fn().mockResolvedValue(mockContent);

    try {
      // Create room with maximum genres
      await contentFilterService.createFilteredRoom(criteriaWithMaxGenres);

      // Clear mock calls
      mockPriorityAlgorithm.prioritizeContent.mockClear();

      // Perform reload
      await contentFilterService.loadContentPoolWithCriteria(criteriaWithMaxGenres, ['exclude1', 'exclude2']);

      // Verify criteria consistency
      const reloadCall = mockPriorityAlgorithm.prioritizeContent.mock.calls[0];
      const reloadCriteria = reloadCall[0];

      expect(reloadCriteria).toEqual(criteriaWithMaxGenres);
      expect(reloadCriteria.genreIds).toEqual([28, 12, 16]);
      expect(reloadCriteria.genreIds.length).toBe(CONTENT_FILTERING_CONSTANTS.MAX_GENRES_PER_ROOM);
    } finally {
      // Restore original method
      contentFilterService.loadContentPool = originalLoadContentPool;
    }
  });
});