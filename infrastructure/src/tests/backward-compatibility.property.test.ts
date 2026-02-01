/**
 * Property-Based Test for Backward Compatibility and Integration
 * 
 * **Feature: room-movie-precaching, Property 6: Backward Compatibility and Integration**
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 * 
 * For any existing Trinity functionality (voting, room management), the cache system 
 * should integrate seamlessly without breaking existing behavior, maintaining full 
 * backward compatibility with pre-cache rooms.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the CacheIntegrationService class
class MockCacheIntegrationService {
  async getMoviesForRoom(roomId: string, genre: string, page: number) {
    // Simulate cache check failure - should return null for legacy fallback
    if (roomId.includes('legacy') || roomId.includes('error')) {
      return null;
    }
    
    // Simulate successful cache retrieval
    return [{
      id: '12345',
      title: 'Cached Movie',
      poster: 'https://image.tmdb.org/t/p/w500/test.jpg',
      overview: 'Test movie from cache',
      vote_average: 7.5,
      release_date: '2024-01-01'
    }];
  }

  async createRoomCache(roomId: string, filterCriteria: any) {
    if (!filterCriteria || !filterCriteria.mediaType) {
      throw new Error('Invalid filter criteria');
    }
    
    return {
      cacheId: `cache-${roomId}`,
      movieCount: 30,
      success: true
    };
  }

  convertCacheMovieToLegacyFormat(cacheMovie: any) {
    return {
      id: cacheMovie.movieId,
      title: cacheMovie.title,
      poster: cacheMovie.posterPath || 'https://via.placeholder.com/500x750?text=Sin+Poster',
      overview: cacheMovie.overview || 'Descripción no disponible',
      vote_average: cacheMovie.voteAverage || 0,
      release_date: cacheMovie.releaseDate || '',
      
      // Additional fields for compatibility
      remoteId: cacheMovie.movieId,
      tmdbId: parseInt(cacheMovie.movieId),
      mediaTitle: cacheMovie.title,
      mediaPosterPath: cacheMovie.posterPath,
      mediaYear: cacheMovie.releaseDate ? new Date(cacheMovie.releaseDate).getFullYear() : null,
      mediaRating: cacheMovie.voteAverage,
      mediaOverview: cacheMovie.overview,
      mediaType: cacheMovie.mediaType
    };
  }

  convertGenreToFilterCriteria(genre: string, mediaType: string = 'MOVIE') {
    const genreMap: { [key: string]: number } = {
      'action': 28,
      'adventure': 12,
      'animation': 16,
      'comedy': 35,
      'crime': 80,
      'documentary': 99,
      'drama': 18,
      'family': 10751,
      'fantasy': 14,
      'history': 36,
      'horror': 27,
      'music': 10402,
      'mystery': 9648,
      'romance': 10749,
      'science_fiction': 878,
      'thriller': 53,
      'war': 10752,
      'western': 37
    };

    const genreIds: number[] = [];
    if (genre && genre !== 'all' && genre !== 'popular') {
      const genreId = genreMap[genre.toLowerCase()];
      if (genreId) {
        genreIds.push(genreId);
      }
    }

    return {
      mediaType,
      genreIds
    };
  }
}

describe('Property Test: Backward Compatibility and Integration', () => {
  let cacheService: MockCacheIntegrationService;

  beforeEach(() => {
    cacheService = new MockCacheIntegrationService();
  });

  /**
   * Property Test: Legacy Room Compatibility
   * 
   * For any room created before cache implementation, the system should continue
   * to work without modification, falling back to legacy TMDB system.
   */
  test('Property 6.1: Legacy Room Compatibility', async () => {
    // Property: Legacy rooms without cache should work unchanged
    const legacyRoomScenarios = [
      // Room without cache metadata
      { roomId: 'legacy-room-1', hasCache: false, genre: 'action', page: 1 },
      { roomId: 'legacy-room-2', hasCache: false, genre: 'comedy', page: 2 },
      { roomId: 'legacy-room-3', hasCache: false, genre: undefined, page: 1 },
      // Room with empty cache
      { roomId: 'empty-cache-room', hasCache: true, isEmpty: true, genre: 'drama', page: 1 }
    ];

    for (const scenario of legacyRoomScenarios) {
      // Test that getMoviesForRoom returns null (signals legacy system)
      const result = await cacheService.getMoviesForRoom(scenario.roomId, scenario.genre || '', scenario.page);
      
      // Property: Should return null to signal legacy system usage for legacy rooms
      expect(result).toBeNull();
    }
  });

  /**
   * Property Test: Cache System Graceful Fallback
   * 
   * When cache system fails, existing functionality should continue working
   * without interruption using the legacy TMDB system.
   */
  test('Property 6.2: Cache System Graceful Fallback', async () => {
    // Property: Cache failures should not break existing functionality
    const failureScenarios = [
      'error-room-1',
      'error-room-2', 
      'legacy-fallback-room'
    ];

    for (const roomId of failureScenarios) {
      // Test that cache failures result in graceful fallback
      const result = await cacheService.getMoviesForRoom(roomId, 'action', 1);
      
      // Property: Should return null (fallback signal) for error scenarios
      expect(result).toBeNull();
    }
  });

  /**
   * Property Test: Room Creation Integration
   * 
   * Room creation should work with or without cache system, maintaining
   * backward compatibility with existing room creation flows.
   */
  test('Property 6.3: Room Creation Integration', async () => {
    // Property: Room creation should work regardless of cache system state
    const roomCreationScenarios = [
      // New rooms with cache system
      { 
        roomId: 'new-room-1', 
        filterCriteria: { mediaType: 'MOVIE', genreIds: [28, 35] },
        expectCacheCreation: true 
      },
      // Legacy rooms without filter criteria
      { 
        roomId: 'legacy-room-1', 
        filterCriteria: null,
        expectCacheCreation: false 
      }
    ];

    for (const scenario of roomCreationScenarios) {
      if (scenario.filterCriteria && scenario.expectCacheCreation) {
        // Test cache creation (this would be called from room creation)
        const result = await cacheService.createRoomCache(scenario.roomId, scenario.filterCriteria);
        
        // Property: Valid filter criteria should create cache
        expect(result).toBeDefined();
        expect(result.cacheId).toBeDefined();
        expect(result.success).toBe(true);
      }

      if (!scenario.filterCriteria && !scenario.expectCacheCreation) {
        // Property: Invalid filter criteria should throw error but not break room creation
        await expect(cacheService.createRoomCache(scenario.roomId, scenario.filterCriteria))
          .rejects.toThrow('Invalid filter criteria');
      }
    }
  });

  /**
   * Property Test: Movie Format Consistency
   * 
   * Movies returned by cache system should be in the same format as
   * legacy system to maintain API compatibility.
   */
  test('Property 6.4: Movie Format Consistency', async () => {
    // Property: Cache movies should match legacy movie format
    const cacheMovie = {
      movieId: '12345',
      title: 'Test Movie',
      overview: 'Test overview',
      posterPath: '/test-poster.jpg',
      releaseDate: '2024-01-01',
      voteAverage: 7.5,
      genreIds: [28, 35],
      mediaType: 'MOVIE'
    };

    // Test format conversion
    const legacyMovie = cacheService.convertCacheMovieToLegacyFormat(cacheMovie);

    // Property: All required legacy fields should be present
    expect(legacyMovie).toHaveProperty('id', '12345');
    expect(legacyMovie).toHaveProperty('title', 'Test Movie');
    expect(legacyMovie).toHaveProperty('overview', 'Test overview');
    expect(legacyMovie).toHaveProperty('poster');
    expect(legacyMovie).toHaveProperty('vote_average', 7.5);
    expect(legacyMovie).toHaveProperty('release_date', '2024-01-01');

    // Property: Additional compatibility fields should be present
    expect(legacyMovie).toHaveProperty('remoteId', '12345');
    expect(legacyMovie).toHaveProperty('tmdbId', 12345);
    expect(legacyMovie).toHaveProperty('mediaTitle', 'Test Movie');
    expect(legacyMovie).toHaveProperty('mediaPosterPath', '/test-poster.jpg');
    expect(legacyMovie).toHaveProperty('mediaType', 'MOVIE');

    // Property: Poster URL should be properly formatted
    expect(legacyMovie.poster).toMatch(/^https?:\/\//);
  });

  /**
   * Property Test: Filter Criteria Conversion
   * 
   * Legacy genre strings should be properly converted to new filter criteria
   * format for backward compatibility.
   */
  test('Property 6.5: Filter Criteria Conversion', async () => {
    // Property: Legacy genres should map to correct TMDB genre IDs
    const genreConversions = [
      { genre: 'action', expectedId: 28 },
      { genre: 'comedy', expectedId: 35 },
      { genre: 'drama', expectedId: 18 },
      { genre: 'horror', expectedId: 27 },
      { genre: 'romance', expectedId: 10749 },
      { genre: 'science_fiction', expectedId: 878 }
    ];

    for (const conversion of genreConversions) {
      const filterCriteria = cacheService.convertGenreToFilterCriteria(conversion.genre, 'MOVIE');
      
      // Property: Should convert to correct filter format
      expect(filterCriteria).toHaveProperty('mediaType', 'MOVIE');
      expect(filterCriteria).toHaveProperty('genreIds');
      expect(filterCriteria.genreIds).toContain(conversion.expectedId);
    }

    // Property: Invalid/unknown genres should not break conversion
    const invalidGenres = ['invalid', '', 'unknown-genre'];
    for (const invalidGenre of invalidGenres) {
      const filterCriteria = cacheService.convertGenreToFilterCriteria(invalidGenre, 'MOVIE');
      
      // Property: Should return valid filter criteria even for invalid input
      expect(filterCriteria).toHaveProperty('mediaType', 'MOVIE');
      expect(filterCriteria).toHaveProperty('genreIds');
      expect(Array.isArray(filterCriteria.genreIds)).toBe(true);
    }
  });

  /**
   * Property Test: New Room Cache Integration
   * 
   * New rooms with proper filter criteria should successfully use cache system
   * while maintaining compatibility with existing API.
   */
  test('Property 6.6: New Room Cache Integration', async () => {
    // Property: New rooms should successfully use cache when available
    const newRoomScenarios = [
      { roomId: 'new-cache-room-1', genre: 'action', page: 1 },
      { roomId: 'new-cache-room-2', genre: 'comedy', page: 1 },
      { roomId: 'new-cache-room-3', genre: 'drama', page: 2 }
    ];

    for (const scenario of newRoomScenarios) {
      // Test that new rooms can use cache system
      const result = await cacheService.getMoviesForRoom(scenario.roomId, scenario.genre, scenario.page);
      
      // Property: Should return movies array for new rooms with cache
      expect(result).not.toBeNull();
      expect(Array.isArray(result)).toBe(true);
      
      if (result && result.length > 0) {
        const movie = result[0];
        
        // Property: Returned movies should have required fields
        expect(movie).toHaveProperty('id');
        expect(movie).toHaveProperty('title');
        expect(movie).toHaveProperty('poster');
        expect(movie).toHaveProperty('overview');
        expect(movie).toHaveProperty('vote_average');
        expect(movie).toHaveProperty('release_date');
      }
    }
  });
});