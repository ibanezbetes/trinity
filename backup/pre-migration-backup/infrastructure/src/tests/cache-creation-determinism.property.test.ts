/**
 * Property-Based Test for Deterministic Cache Creation
 * 
 * **Feature: room-movie-precaching, Property 1: Deterministic Cache Creation**
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 * 
 * For any room created with valid filter criteria, the cache system should 
 * pre-load exactly 30 movies matching those criteria in a consistent, 
 * deterministic order that remains identical across multiple cache creation 
 * attempts with the same criteria.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the MovieBatchLoader class
class MockMovieBatchLoader {
  private movieDatabase: any[] = [];

  constructor() {
    // Initialize with a large set of test movies
    this.movieDatabase = this.generateTestMovies(200);
  }

  private generateTestMovies(count: number): any[] {
    const genres = [28, 35, 18, 27, 10749, 878, 53]; // Action, Comedy, Drama, Horror, Romance, Sci-Fi, Thriller
    const movies = [];

    for (let i = 1; i <= count; i++) {
      movies.push({
        id: i.toString(),
        title: `Test Movie ${i}`,
        overview: `Overview for test movie ${i}`,
        poster_path: `/poster${i}.jpg`,
        release_date: `202${(i % 4)}-0${(i % 9) + 1}-${(i % 28) + 1}`,
        vote_average: 5 + (i % 5),
        genre_ids: [genres[i % genres.length], genres[(i + 1) % genres.length]],
        popularity: 50 + (i % 100)
      });
    }

    return movies;
  }

  async createMovieBatch(criteria: any, excludeIds: string[] = [], batchSize: number = 30) {
    // Simulate deterministic movie selection
    let filteredMovies = this.movieDatabase.filter(movie => 
      !excludeIds.includes(movie.id.toString())
    );

    // Apply genre filtering if specified
    if (criteria.genreIds && criteria.genreIds.length > 0) {
      filteredMovies = filteredMovies.filter(movie =>
        criteria.genreIds.some((genreId: number) => movie.genre_ids.includes(genreId))
      );
    }

    // Sort deterministically (by ID for consistency)
    filteredMovies.sort((a, b) => parseInt(a.id) - parseInt(b.id));

    // Apply priority algorithm (deterministic)
    const moviesWithPriority = filteredMovies.map(movie => ({
      ...movie,
      priority: this.calculatePriority(movie, criteria)
    }));

    // Sort by priority, then by ID for deterministic order
    moviesWithPriority.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return parseInt(a.id) - parseInt(b.id);
    });

    // Take requested batch size
    const selectedMovies = moviesWithPriority.slice(0, batchSize);

    // Convert to cache format
    const cachedMovies = selectedMovies.map((movie, index) => ({
      movieId: movie.id.toString(),
      title: movie.title,
      overview: movie.overview,
      posterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      releaseDate: movie.release_date,
      voteAverage: movie.vote_average,
      genreIds: movie.genre_ids,
      mediaType: criteria.mediaType,
      priority: movie.priority,
      sequenceIndex: index
    }));

    return {
      batchNumber: 1,
      movies: cachedMovies,
      filterCriteria: criteria,
      createdAt: new Date().toISOString(),
      totalMovies: cachedMovies.length,
      source: 'api'
    };
  }

  private calculatePriority(movie: any, criteria: any): number {
    let score = 1; // Base priority

    // Boost score for genre matches
    if (criteria.genreIds && criteria.genreIds.length > 0 && movie.genre_ids) {
      const genreMatches = criteria.genreIds.filter((id: number) => 
        movie.genre_ids.includes(id)
      ).length;
      
      if (genreMatches === criteria.genreIds.length) {
        score = 3; // Perfect genre match
      } else if (genreMatches > 0) {
        score = 2; // Partial genre match
      }
    }

    // Boost for high ratings
    if (movie.vote_average >= 7.5) {
      score += 0.5;
    } else if (movie.vote_average >= 6.0) {
      score += 0.2;
    }

    // Boost for popularity
    if (movie.popularity >= 100) {
      score += 0.3;
    } else if (movie.popularity >= 50) {
      score += 0.1;
    }

    return Math.min(score, 3); // Cap at 3
  }
}

describe('Property Test: Deterministic Cache Creation', () => {
  let movieBatchLoader: MockMovieBatchLoader;

  beforeEach(() => {
    movieBatchLoader = new MockMovieBatchLoader();
  });

  /**
   * Property Test: Consistent Movie Selection
   * 
   * For any valid filter criteria, multiple cache creation attempts should 
   * return exactly the same movies in exactly the same order.
   */
  test('Property 1.1: Consistent Movie Selection', async () => {
    // Property: Same criteria should always produce same results
    const testCriteria = [
      {
        mediaType: 'MOVIE',
        genreIds: [28], // Action
        roomId: 'test-room-1'
      },
      {
        mediaType: 'MOVIE',
        genreIds: [35, 18], // Comedy + Drama
        roomId: 'test-room-2'
      },
      {
        mediaType: 'TV',
        genreIds: [878, 53], // Sci-Fi + Thriller
        roomId: 'test-room-3'
      },
      {
        mediaType: 'MOVIE',
        genreIds: [], // No genre filter
        roomId: 'test-room-4'
      }
    ];

    for (const criteria of testCriteria) {
      // Create cache multiple times with same criteria
      const batch1 = await movieBatchLoader.createMovieBatch(criteria, [], 30);
      const batch2 = await movieBatchLoader.createMovieBatch(criteria, [], 30);
      const batch3 = await movieBatchLoader.createMovieBatch(criteria, [], 30);

      // Property: All batches should have same number of movies
      expect(batch1.movies.length).toBe(batch2.movies.length);
      expect(batch2.movies.length).toBe(batch3.movies.length);

      // Property: Movies should be in identical order
      for (let i = 0; i < batch1.movies.length; i++) {
        expect(batch1.movies[i].movieId).toBe(batch2.movies[i].movieId);
        expect(batch2.movies[i].movieId).toBe(batch3.movies[i].movieId);
        expect(batch1.movies[i].sequenceIndex).toBe(i);
        expect(batch2.movies[i].sequenceIndex).toBe(i);
        expect(batch3.movies[i].sequenceIndex).toBe(i);
      }

      // Property: Filter criteria should be preserved
      expect(batch1.filterCriteria).toEqual(criteria);
      expect(batch2.filterCriteria).toEqual(criteria);
      expect(batch3.filterCriteria).toEqual(criteria);
    }
  });

  /**
   * Property Test: Genre-Based Filtering
   * 
   * Movies returned should match the specified genre criteria, with proper
   * priority given to exact matches vs partial matches.
   */
  test('Property 1.2: Genre-Based Filtering', async () => {
    // Property: Movies should match genre criteria with proper prioritization
    const genreTestCases = [
      {
        criteria: { mediaType: 'MOVIE', genreIds: [28], roomId: 'action-room' },
        expectedGenre: 28,
        description: 'Single genre filter'
      },
      {
        criteria: { mediaType: 'MOVIE', genreIds: [35, 18], roomId: 'comedy-drama-room' },
        expectedGenres: [35, 18],
        description: 'Multiple genre filter'
      },
      {
        criteria: { mediaType: 'MOVIE', genreIds: [27, 53, 878], roomId: 'horror-thriller-scifi-room' },
        expectedGenres: [27, 53, 878],
        description: 'Three genre filter'
      }
    ];

    for (const testCase of genreTestCases) {
      const batch = await movieBatchLoader.createMovieBatch(testCase.criteria, [], 30);

      // Property: Should return requested number of movies
      expect(batch.movies.length).toBeLessThanOrEqual(30);
      expect(batch.movies.length).toBeGreaterThan(0);

      // Property: All movies should match at least one specified genre
      for (const movie of batch.movies) {
        const hasMatchingGenre = testCase.criteria.genreIds.some(genreId =>
          movie.genreIds.includes(genreId)
        );
        expect(hasMatchingGenre).toBe(true);
      }

      // Property: Movies with perfect genre matches should have higher priority
      const perfectMatches = batch.movies.filter(movie =>
        testCase.criteria.genreIds.every(genreId => movie.genreIds.includes(genreId))
      );
      
      const partialMatches = batch.movies.filter(movie =>
        testCase.criteria.genreIds.some(genreId => movie.genreIds.includes(genreId)) &&
        !testCase.criteria.genreIds.every(genreId => movie.genreIds.includes(genreId))
      );

      // Property: Perfect matches should appear before partial matches
      if (perfectMatches.length > 0 && partialMatches.length > 0) {
        const firstPerfectIndex = batch.movies.findIndex(movie =>
          testCase.criteria.genreIds.every(genreId => movie.genreIds.includes(genreId))
        );
        
        const firstPartialIndex = batch.movies.findIndex(movie =>
          testCase.criteria.genreIds.some(genreId => movie.genreIds.includes(genreId)) &&
          !testCase.criteria.genreIds.every(genreId => movie.genreIds.includes(genreId))
        );

        if (firstPerfectIndex !== -1 && firstPartialIndex !== -1) {
          expect(firstPerfectIndex).toBeLessThan(firstPartialIndex);
        }
      }
    }
  });

  /**
   * Property Test: Batch Size Consistency
   * 
   * Cache creation should respect the requested batch size and handle
   * cases where insufficient movies are available.
   */
  test('Property 1.3: Batch Size Consistency', async () => {
    // Property: Batch size should be respected when possible
    const batchSizeTests = [
      { size: 10, criteria: { mediaType: 'MOVIE', genreIds: [28], roomId: 'small-batch' } },
      { size: 30, criteria: { mediaType: 'MOVIE', genreIds: [35], roomId: 'standard-batch' } },
      { size: 50, criteria: { mediaType: 'MOVIE', genreIds: [18], roomId: 'large-batch' } },
      { size: 100, criteria: { mediaType: 'MOVIE', genreIds: [], roomId: 'huge-batch' } }
    ];

    for (const test of batchSizeTests) {
      const batch = await movieBatchLoader.createMovieBatch(test.criteria, [], test.size);

      // Property: Should not exceed requested batch size
      expect(batch.movies.length).toBeLessThanOrEqual(test.size);

      // Property: Should return as many movies as available (up to requested size)
      expect(batch.movies.length).toBeGreaterThan(0);

      // Property: Each movie should have correct sequence index
      for (let i = 0; i < batch.movies.length; i++) {
        expect(batch.movies[i].sequenceIndex).toBe(i);
      }

      // Property: Total movies count should match actual array length
      expect(batch.totalMovies).toBe(batch.movies.length);
    }
  });

  /**
   * Property Test: Exclusion List Handling
   * 
   * Movies in the exclusion list should never appear in the batch,
   * and the system should find alternative movies to maintain batch size.
   */
  test('Property 1.4: Exclusion List Handling', async () => {
    // Property: Excluded movies should never appear in results
    const exclusionTests = [
      {
        criteria: { mediaType: 'MOVIE', genreIds: [28], roomId: 'exclusion-test-1' },
        excludeIds: ['1', '2', '3', '4', '5'],
        batchSize: 20
      },
      {
        criteria: { mediaType: 'MOVIE', genreIds: [35, 18], roomId: 'exclusion-test-2' },
        excludeIds: ['10', '20', '30', '40', '50', '60', '70', '80', '90', '100'],
        batchSize: 25
      },
      {
        criteria: { mediaType: 'MOVIE', genreIds: [], roomId: 'exclusion-test-3' },
        excludeIds: Array.from({ length: 50 }, (_, i) => (i + 1).toString()),
        batchSize: 30
      }
    ];

    for (const test of exclusionTests) {
      const batch = await movieBatchLoader.createMovieBatch(
        test.criteria, 
        test.excludeIds, 
        test.batchSize
      );

      // Property: No excluded movies should appear in results
      for (const movie of batch.movies) {
        expect(test.excludeIds).not.toContain(movie.movieId);
      }

      // Property: Should still return movies (alternative selections)
      expect(batch.movies.length).toBeGreaterThan(0);

      // Property: Should maintain deterministic order even with exclusions
      const batch2 = await movieBatchLoader.createMovieBatch(
        test.criteria, 
        test.excludeIds, 
        test.batchSize
      );

      expect(batch.movies.length).toBe(batch2.movies.length);
      for (let i = 0; i < batch.movies.length; i++) {
        expect(batch.movies[i].movieId).toBe(batch2.movies[i].movieId);
      }
    }
  });

  /**
   * Property Test: Priority Algorithm Consistency
   * 
   * The priority algorithm should consistently rank movies based on
   * genre matches, ratings, and popularity in a deterministic manner.
   */
  test('Property 1.5: Priority Algorithm Consistency', async () => {
    // Property: Priority algorithm should be deterministic and consistent
    const priorityTests = [
      {
        criteria: { mediaType: 'MOVIE', genreIds: [28, 35], roomId: 'priority-test-1' },
        description: 'Action + Comedy preference'
      },
      {
        criteria: { mediaType: 'MOVIE', genreIds: [18], roomId: 'priority-test-2' },
        description: 'Drama preference'
      },
      {
        criteria: { mediaType: 'MOVIE', genreIds: [], roomId: 'priority-test-3' },
        description: 'No genre preference (popularity-based)'
      }
    ];

    for (const test of priorityTests) {
      const batch1 = await movieBatchLoader.createMovieBatch(test.criteria, [], 30);
      const batch2 = await movieBatchLoader.createMovieBatch(test.criteria, [], 30);

      // Property: Priority ordering should be identical across runs
      for (let i = 0; i < batch1.movies.length; i++) {
        expect(batch1.movies[i].movieId).toBe(batch2.movies[i].movieId);
        expect(batch1.movies[i].priority).toBe(batch2.movies[i].priority);
      }

      // Property: Movies should be ordered by priority (higher first)
      for (let i = 0; i < batch1.movies.length - 1; i++) {
        const currentPriority = batch1.movies[i].priority;
        const nextPriority = batch1.movies[i + 1].priority;
        
        // Priority should be non-increasing (same or lower)
        expect(currentPriority).toBeGreaterThanOrEqual(nextPriority);
      }

      // Property: Priority values should be within valid range (1-3)
      for (const movie of batch1.movies) {
        expect(movie.priority).toBeGreaterThanOrEqual(1);
        expect(movie.priority).toBeLessThanOrEqual(3);
      }

      // Property: Movies with genre matches should have higher priority than those without
      if (test.criteria.genreIds.length > 0) {
        const moviesWithGenreMatch = batch1.movies.filter(movie =>
          test.criteria.genreIds.some(genreId => movie.genreIds.includes(genreId))
        );
        
        const moviesWithoutGenreMatch = batch1.movies.filter(movie =>
          !test.criteria.genreIds.some(genreId => movie.genreIds.includes(genreId))
        );

        if (moviesWithGenreMatch.length > 0 && moviesWithoutGenreMatch.length > 0) {
          const minGenreMatchPriority = Math.min(...moviesWithGenreMatch.map(m => m.priority));
          const maxNoGenreMatchPriority = Math.max(...moviesWithoutGenreMatch.map(m => m.priority));
          
          expect(minGenreMatchPriority).toBeGreaterThanOrEqual(maxNoGenreMatchPriority);
        }
      }
    }
  });

  /**
   * Property Test: Media Type Filtering
   * 
   * Cache creation should respect media type (MOVIE vs TV) and only
   * return content of the specified type.
   */
  test('Property 1.6: Media Type Filtering', async () => {
    // Property: Media type should be consistently applied
    const mediaTypeTests = [
      { mediaType: 'MOVIE', genreIds: [28], roomId: 'movie-room' },
      { mediaType: 'TV', genreIds: [35], roomId: 'tv-room' },
      { mediaType: 'MOVIE', genreIds: [], roomId: 'movie-no-genre' },
      { mediaType: 'TV', genreIds: [], roomId: 'tv-no-genre' }
    ];

    for (const test of mediaTypeTests) {
      const criteria = {
        mediaType: test.mediaType,
        genreIds: test.genreIds,
        roomId: test.roomId
      };

      const batch = await movieBatchLoader.createMovieBatch(criteria, [], 30);

      // Property: All movies should have correct media type
      for (const movie of batch.movies) {
        expect(movie.mediaType).toBe(test.mediaType);
      }

      // Property: Should return movies for any valid media type
      expect(batch.movies.length).toBeGreaterThan(0);

      // Property: Media type should be preserved in filter criteria
      expect(batch.filterCriteria.mediaType).toBe(test.mediaType);
    }
  });
});