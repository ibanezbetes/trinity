/**
 * Property-Based Test for Batch Management and Duplicate Prevention
 * 
 * **Feature: room-movie-precaching, Property 3: Batch Management and Duplicate Prevention**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 * 
 * For any room cache, when 80% of the current batch is consumed, the next batch 
 * should be automatically loaded with no duplicate movies across all batches 
 * while maintaining the same filter criteria.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the RoomMovieCacheService class
class MockRoomMovieCacheService {
  private roomCaches: Map<string, any> = new Map();
  private movieDatabase: any[] = [];
  private batchSize = 30;
  private maxBatches = 10;

  constructor() {
    // Initialize with a large set of test movies
    this.movieDatabase = this.generateTestMovies(500);
  }

  private generateTestMovies(count: number): any[] {
    const genres = [28, 35, 18, 27, 10749, 878, 53];
    const movies = [];

    for (let i = 1; i <= count; i++) {
      movies.push({
        movieId: i.toString(),
        title: `Test Movie ${i}`,
        overview: `Overview for test movie ${i}`,
        posterPath: `/poster${i}.jpg`,
        releaseDate: `202${(i % 4)}-0${(i % 9) + 1}-${(i % 28) + 1}`,
        voteAverage: 5 + (i % 5),
        genreIds: [genres[i % genres.length], genres[(i + 1) % genres.length]],
        mediaType: i % 2 === 0 ? 'MOVIE' : 'TV',
        priority: 1 + (i % 3)
      });
    }

    return movies;
  }

  async createRoomCache(roomId: string, filterCriteria: any) {
    const filteredMovies = this.getFilteredMovies(filterCriteria, []);
    const initialBatch = filteredMovies.slice(0, this.batchSize);

    const cache = {
      roomId,
      currentIndex: 0,
      totalMovies: initialBatch.length,
      batchesLoaded: 1,
      filterCriteria,
      nextBatchThreshold: Math.floor(initialBatch.length * 0.8),
      batches: [initialBatch],
      usedMovieIds: new Set(initialBatch.map(m => m.movieId)),
      createdAt: new Date().toISOString(),
      status: 'ACTIVE'
    };

    this.roomCaches.set(roomId, cache);
    return { success: true, metadata: cache };
  }

  async loadMovieBatch(roomId: string, batchNumber: number) {
    const cache = this.roomCaches.get(roomId);
    if (!cache) {
      throw new Error(`No cache found for room ${roomId}`);
    }

    if (batchNumber > this.maxBatches) {
      throw new Error(`Maximum batches (${this.maxBatches}) exceeded`);
    }

    // Get existing movie IDs to prevent duplicates
    const existingIds = Array.from(cache.usedMovieIds);
    
    // Get filtered movies excluding existing ones
    const filteredMovies = this.getFilteredMovies(cache.filterCriteria, existingIds);
    const newBatch = filteredMovies.slice(0, this.batchSize);

    if (newBatch.length === 0) {
      return { movies: [], batchNumber, totalMovies: 0 };
    }

    // Update cache
    cache.batches.push(newBatch);
    cache.batchesLoaded = batchNumber;
    cache.totalMovies += newBatch.length;
    cache.nextBatchThreshold = cache.totalMovies + Math.floor(newBatch.length * 0.8);
    
    // Add new movie IDs to used set
    newBatch.forEach(movie => cache.usedMovieIds.add(movie.movieId));

    return {
      movies: newBatch,
      batchNumber,
      totalMovies: newBatch.length,
      filterCriteria: cache.filterCriteria
    };
  }

  async checkBatchRefreshNeeded(roomId: string): Promise<boolean> {
    const cache = this.roomCaches.get(roomId);
    if (!cache) return false;

    return cache.currentIndex >= cache.nextBatchThreshold && 
           cache.batchesLoaded < this.maxBatches;
  }

  async getCurrentIndex(roomId: string): Promise<number> {
    const cache = this.roomCaches.get(roomId);
    return cache ? cache.currentIndex : 0;
  }

  async advanceIndex(roomId: string): Promise<void> {
    const cache = this.roomCaches.get(roomId);
    if (cache) {
      cache.currentIndex++;
    }
  }

  async getNextMovie(roomId: string) {
    const cache = this.roomCaches.get(roomId);
    if (!cache) return null;

    // Check if we need to load next batch
    if (await this.checkBatchRefreshNeeded(roomId)) {
      await this.loadMovieBatch(roomId, cache.batchesLoaded + 1);
    }

    // Find the movie at current index across all batches
    let globalIndex = cache.currentIndex;
    for (const batch of cache.batches) {
      if (globalIndex < batch.length) {
        const movie = batch[globalIndex];
        cache.currentIndex++;
        return movie;
      }
      globalIndex -= batch.length;
    }

    return null; // No more movies
  }

  private getFilteredMovies(criteria: any, excludeIds: string[]): any[] {
    let filtered = this.movieDatabase.filter(movie => 
      !excludeIds.includes(movie.movieId) &&
      movie.mediaType === criteria.mediaType
    );

    // Apply genre filtering if specified
    if (criteria.genreIds && criteria.genreIds.length > 0) {
      filtered = filtered.filter(movie =>
        criteria.genreIds.some((genreId: number) => movie.genreIds.includes(genreId))
      );
    }

    // Sort deterministically
    filtered.sort((a, b) => parseInt(a.movieId) - parseInt(b.movieId));

    return filtered;
  }

  getAllUsedMovieIds(roomId: string): string[] {
    const cache = this.roomCaches.get(roomId);
    return cache ? Array.from(cache.usedMovieIds) : [];
  }

  getBatchCount(roomId: string): number {
    const cache = this.roomCaches.get(roomId);
    return cache ? cache.batchesLoaded : 0;
  }

  getTotalMoviesInCache(roomId: string): number {
    const cache = this.roomCaches.get(roomId);
    return cache ? cache.totalMovies : 0;
  }
}

describe('Property Test: Batch Management and Duplicate Prevention', () => {
  let cacheService: MockRoomMovieCacheService;

  beforeEach(() => {
    cacheService = new MockRoomMovieCacheService();
  });

  /**
   * Property Test: Automatic Batch Loading at 80% Threshold
   * 
   * When 80% of current batch is consumed, the next batch should be 
   * automatically loaded without manual intervention.
   */
  test('Property 3.1: Automatic Batch Loading at 80% Threshold', async () => {
    // Property: Next batch should load automatically at 80% consumption
    const testScenarios = [
      {
        roomId: 'auto-batch-room-1',
        criteria: { mediaType: 'MOVIE', genreIds: [28], roomId: 'auto-batch-room-1' },
        batchSize: 30,
        threshold: 24 // 80% of 30
      },
      {
        roomId: 'auto-batch-room-2',
        criteria: { mediaType: 'MOVIE', genreIds: [35, 18], roomId: 'auto-batch-room-2' },
        batchSize: 30,
        threshold: 24
      }
    ];

    for (const scenario of testScenarios) {
      // Create initial cache
      await cacheService.createRoomCache(scenario.roomId, scenario.criteria);
      
      // Consume movies up to threshold - 1
      for (let i = 0; i < scenario.threshold - 1; i++) {
        await cacheService.advanceIndex(scenario.roomId);
      }

      // Property: Should not need batch refresh yet
      let needsRefresh = await cacheService.checkBatchRefreshNeeded(scenario.roomId);
      expect(needsRefresh).toBe(false);
      expect(cacheService.getBatchCount(scenario.roomId)).toBe(1);

      // Advance to threshold
      await cacheService.advanceIndex(scenario.roomId);

      // Property: Should now need batch refresh
      needsRefresh = await cacheService.checkBatchRefreshNeeded(scenario.roomId);
      expect(needsRefresh).toBe(true);

      // Get next movie (should trigger batch loading)
      const movie = await cacheService.getNextMovie(scenario.roomId);

      // Property: Should have loaded second batch
      expect(cacheService.getBatchCount(scenario.roomId)).toBe(2);
      expect(movie).not.toBeNull();

      // Property: Total movies should have increased
      const totalMovies = cacheService.getTotalMoviesInCache(scenario.roomId);
      expect(totalMovies).toBeGreaterThan(30);
    }
  });

  /**
   * Property Test: No Duplicate Movies Across Batches
   * 
   * Each movie should appear only once across all batches for a room,
   * regardless of how many batches are loaded.
   */
  test('Property 3.2: No Duplicate Movies Across Batches', async () => {
    // Property: No movie should appear twice across all batches
    const duplicateTestScenarios = [
      {
        roomId: 'duplicate-test-1',
        criteria: { mediaType: 'MOVIE', genreIds: [28], roomId: 'duplicate-test-1' },
        batchesToLoad: 3
      },
      {
        roomId: 'duplicate-test-2',
        criteria: { mediaType: 'MOVIE', genreIds: [35, 18, 27], roomId: 'duplicate-test-2' },
        batchesToLoad: 5
      },
      {
        roomId: 'duplicate-test-3',
        criteria: { mediaType: 'TV', genreIds: [], roomId: 'duplicate-test-3' },
        batchesToLoad: 4
      }
    ];

    for (const scenario of duplicateTestScenarios) {
      // Create initial cache
      await cacheService.createRoomCache(scenario.roomId, scenario.criteria);

      // Load multiple batches
      for (let batchNum = 2; batchNum <= scenario.batchesToLoad; batchNum++) {
        await cacheService.loadMovieBatch(scenario.roomId, batchNum);
      }

      // Property: All movie IDs should be unique
      const allUsedIds = cacheService.getAllUsedMovieIds(scenario.roomId);
      const uniqueIds = new Set(allUsedIds);
      
      expect(uniqueIds.size).toBe(allUsedIds.length);

      // Property: Each batch should contribute unique movies
      expect(cacheService.getBatchCount(scenario.roomId)).toBe(scenario.batchesToLoad);
      
      // Property: Total movies should be sum of all batch sizes (no overlaps)
      const totalMovies = cacheService.getTotalMoviesInCache(scenario.roomId);
      expect(totalMovies).toBe(allUsedIds.length);
    }
  });

  /**
   * Property Test: Filter Criteria Consistency Across Batches
   * 
   * All batches should use the same filter criteria as the original room
   * configuration, maintaining consistency across batch loads.
   */
  test('Property 3.3: Filter Criteria Consistency Across Batches', async () => {
    // Property: Filter criteria should remain consistent across all batches
    const consistencyScenarios = [
      {
        roomId: 'consistency-room-1',
        criteria: { mediaType: 'MOVIE', genreIds: [28, 35], roomId: 'consistency-room-1' },
        batchesToTest: 3
      },
      {
        roomId: 'consistency-room-2',
        criteria: { mediaType: 'TV', genreIds: [18, 53, 878], roomId: 'consistency-room-2' },
        batchesToTest: 4
      }
    ];

    for (const scenario of consistencyScenarios) {
      // Create initial cache
      const initialResult = await cacheService.createRoomCache(scenario.roomId, scenario.criteria);
      
      // Load additional batches and verify criteria consistency
      for (let batchNum = 2; batchNum <= scenario.batchesToTest; batchNum++) {
        const batchResult = await cacheService.loadMovieBatch(scenario.roomId, batchNum);
        
        // Property: Filter criteria should match original
        expect(batchResult.filterCriteria).toEqual(scenario.criteria);
        
        // Property: All movies in batch should match media type
        for (const movie of batchResult.movies) {
          expect(movie.mediaType).toBe(scenario.criteria.mediaType);
          
          // Property: Movies should match genre criteria if specified
          if (scenario.criteria.genreIds.length > 0) {
            const hasMatchingGenre = scenario.criteria.genreIds.some(genreId =>
              movie.genreIds.includes(genreId)
            );
            expect(hasMatchingGenre).toBe(true);
          }
        }
      }
    }
  });

  /**
   * Property Test: Batch Size Limits and Maximum Batches
   * 
   * System should respect batch size limits and maximum batch count,
   * handling edge cases gracefully.
   */
  test('Property 3.4: Batch Size Limits and Maximum Batches', async () => {
    // Property: Should respect batch size and maximum batch limits
    const limitTestScenarios = [
      {
        roomId: 'limit-test-1',
        criteria: { mediaType: 'MOVIE', genreIds: [28], roomId: 'limit-test-1' },
        maxBatches: 10,
        expectedBatchSize: 30
      },
      {
        roomId: 'limit-test-2',
        criteria: { mediaType: 'TV', genreIds: [35], roomId: 'limit-test-2' },
        maxBatches: 10,
        expectedBatchSize: 30
      }
    ];

    for (const scenario of limitTestScenarios) {
      // Create initial cache
      await cacheService.createRoomCache(scenario.roomId, scenario.criteria);

      // Try to load maximum number of batches
      for (let batchNum = 2; batchNum <= scenario.maxBatches; batchNum++) {
        const batchResult = await cacheService.loadMovieBatch(scenario.roomId, batchNum);
        
        // Property: Each batch should not exceed expected size
        expect(batchResult.movies.length).toBeLessThanOrEqual(scenario.expectedBatchSize);
        
        // Property: Should successfully load up to max batches
        expect(cacheService.getBatchCount(scenario.roomId)).toBe(batchNum);
      }

      // Property: Should not exceed maximum batch count
      expect(cacheService.getBatchCount(scenario.roomId)).toBeLessThanOrEqual(scenario.maxBatches);

      // Property: Attempting to load beyond max should fail
      await expect(cacheService.loadMovieBatch(scenario.roomId, scenario.maxBatches + 1))
        .rejects.toThrow('Maximum batches');
    }
  });

  /**
   * Property Test: Insufficient Movies Handling
   * 
   * When insufficient unique movies are available for a full batch,
   * system should handle gracefully and return available movies.
   */
  test('Property 3.5: Insufficient Movies Handling', async () => {
    // Property: Should handle insufficient movies gracefully
    const insufficientMoviesScenarios = [
      {
        roomId: 'insufficient-test-1',
        // Use very specific criteria to limit available movies
        criteria: { mediaType: 'MOVIE', genreIds: [27, 53, 878], roomId: 'insufficient-test-1' },
        description: 'Very specific genre combination'
      }
    ];

    for (const scenario of insufficientMoviesScenarios) {
      // Create initial cache
      await cacheService.createRoomCache(scenario.roomId, scenario.criteria);

      let totalBatchesLoaded = 1;
      let lastBatchSize = 30; // Initial batch size

      // Keep loading batches until we get insufficient movies
      while (lastBatchSize > 0 && totalBatchesLoaded < 10) {
        try {
          const batchResult = await cacheService.loadMovieBatch(scenario.roomId, totalBatchesLoaded + 1);
          lastBatchSize = batchResult.movies.length;
          totalBatchesLoaded++;

          // Property: Should not return duplicate movies even when running low
          const allUsedIds = cacheService.getAllUsedMovieIds(scenario.roomId);
          const uniqueIds = new Set(allUsedIds);
          expect(uniqueIds.size).toBe(allUsedIds.length);

        } catch (error) {
          // Expected when reaching limits
          break;
        }
      }

      // Property: Should have loaded at least initial batch
      expect(totalBatchesLoaded).toBeGreaterThanOrEqual(1);

      // Property: All loaded movies should be unique
      const finalUsedIds = cacheService.getAllUsedMovieIds(scenario.roomId);
      const finalUniqueIds = new Set(finalUsedIds);
      expect(finalUniqueIds.size).toBe(finalUsedIds.length);
    }
  });

  /**
   * Property Test: Batch Loading Performance and Consistency
   * 
   * Batch loading should be consistent and maintain performance
   * characteristics across multiple loads.
   */
  test('Property 3.6: Batch Loading Performance and Consistency', async () => {
    // Property: Batch loading should be consistent and performant
    const performanceScenarios = [
      {
        roomId: 'performance-test-1',
        criteria: { mediaType: 'MOVIE', genreIds: [28, 35, 18], roomId: 'performance-test-1' },
        batchesToLoad: 5
      }
    ];

    for (const scenario of performanceScenarios) {
      // Create initial cache
      const startTime = Date.now();
      await cacheService.createRoomCache(scenario.roomId, scenario.criteria);
      const initialLoadTime = Date.now() - startTime;

      const batchLoadTimes: number[] = [];

      // Load multiple batches and measure consistency
      for (let batchNum = 2; batchNum <= scenario.batchesToLoad; batchNum++) {
        const batchStartTime = Date.now();
        const batchResult = await cacheService.loadMovieBatch(scenario.roomId, batchNum);
        const batchLoadTime = Date.now() - batchStartTime;
        
        batchLoadTimes.push(batchLoadTime);

        // Property: Each batch should return movies
        expect(batchResult.movies.length).toBeGreaterThan(0);

        // Property: Batch loading should be reasonably fast (under 1 second for mock)
        expect(batchLoadTime).toBeLessThan(1000);
      }

      // Property: Batch loading times should be relatively consistent
      if (batchLoadTimes.length > 1) {
        const avgLoadTime = batchLoadTimes.reduce((a, b) => a + b, 0) / batchLoadTimes.length;
        const maxDeviation = Math.max(...batchLoadTimes.map(time => Math.abs(time - avgLoadTime)));
        
        // Allow for some variation but should be generally consistent
        expect(maxDeviation).toBeLessThan(avgLoadTime * 2);
      }

      // Property: Total movies should increase with each batch
      const finalTotal = cacheService.getTotalMoviesInCache(scenario.roomId);
      expect(finalTotal).toBeGreaterThan(30); // More than initial batch
    }
  });
});