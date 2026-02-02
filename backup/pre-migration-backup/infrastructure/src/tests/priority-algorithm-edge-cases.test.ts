/**
 * Unit Tests: Priority Algorithm Edge Cases
 * 
 * Tests edge cases for the Priority Algorithm Engine including:
 * - Zero genres selected scenario
 * - Insufficient content scenarios
 * - Invalid input handling
 * - Error conditions
 * 
 * **Validates: Requirements 3.4, 3.5**
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { 
  MediaType, 
  FilterCriteria, 
  ContentFilteringError, 
  ErrorCodes,
  CONTENT_FILTERING_CONSTANTS 
} from '../types/content-filtering';
import { PriorityAlgorithmEngine, ContentAnalyzer } from '../services/priority-algorithm';
import { EnhancedTMDBClient } from '../types/tmdb-client';
import { generateMoviesWithGenres, createMockMovie } from './test-utils';

// Mock TMDB Client
const mockTMDBClient: jest.Mocked<EnhancedTMDBClient> = {
  discoverMovies: jest.fn(),
  discoverTV: jest.fn(),
  discover: jest.fn(),
  getMovieGenres: jest.fn(),
  getTVGenres: jest.fn(),
  getGenres: jest.fn(),
  getMovieDetails: jest.fn(),
  getTVDetails: jest.fn(),
  discoverMultiplePages: jest.fn(),
  getContentWithAllGenres: jest.fn(),
  getContentWithAnyGenre: jest.fn(),
  getPopularContent: jest.fn()
};

describe('Priority Algorithm Edge Cases', () => {
  let priorityAlgorithm: PriorityAlgorithmEngine;
  
  beforeEach(() => {
    priorityAlgorithm = new PriorityAlgorithmEngine(mockTMDBClient);
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  // ============================================================================
  // Zero Genres Selected Scenario
  // ============================================================================
  
  test('should handle zero genres selected by returning popular content only', async () => {
    // Arrange: No genres specified
    const popularMovies = generateMoviesWithGenres(10, [28, 35, 18]);
    mockTMDBClient.getPopularContent.mockResolvedValueOnce(popularMovies);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: [], // No genres
      roomId: 'test-room'
    };
    
    // Act: Run priority algorithm
    const result = await priorityAlgorithm.prioritizeContent(criteria, [], 5);
    
    // Assert: Should only call getPopularContent
    expect(mockTMDBClient.getContentWithAllGenres).not.toHaveBeenCalled();
    expect(mockTMDBClient.getContentWithAnyGenre).not.toHaveBeenCalled();
    expect(mockTMDBClient.getPopularContent).toHaveBeenCalledWith(MediaType.MOVIE, 5);
    
    expect(result).toHaveLength(5);
    
    // Should contain 5 items from the popular movies pool (order doesn't matter due to randomization)
    const resultIds = result.map(item => item.id);
    const availableIds = popularMovies.map(item => item.id);
    
    // All returned items should be from the available pool
    resultIds.forEach(id => {
      expect(availableIds).toContain(id);
    });
    
    // Should have exactly 5 unique items
    expect(new Set(resultIds).size).toBe(5);
  });
  
  test('should handle zero genres with TV shows', async () => {
    // Arrange: No genres specified for TV
    const popularTVShows = generateMoviesWithGenres(8, [35, 18, 10751]);
    mockTMDBClient.getPopularContent.mockResolvedValueOnce(popularTVShows);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.TV,
      genreIds: [], // No genres
      roomId: 'test-room'
    };
    
    // Act: Run priority algorithm
    const result = await priorityAlgorithm.prioritizeContent(criteria, [], 8);
    
    // Assert: Should work with TV shows too
    expect(mockTMDBClient.getPopularContent).toHaveBeenCalledWith(MediaType.TV, 8);
    expect(result).toHaveLength(8);
  });
  
  test('should handle zero genres with exclusions', async () => {
    // Arrange: No genres but with exclusions
    const popularMovies = [
      createMockMovie(1, { genre_ids: [28] }),
      createMockMovie(2, { genre_ids: [35] }), // This will be excluded
      createMockMovie(3, { genre_ids: [18] }),
      createMockMovie(4, { genre_ids: [27] }), // This will be excluded
      createMockMovie(5, { genre_ids: [53] }),
    ];
    
    mockTMDBClient.getPopularContent.mockResolvedValueOnce(popularMovies);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: [], // No genres
      roomId: 'test-room'
    };
    
    const excludeIds = ['2', '4'];
    
    // Act: Run priority algorithm with exclusions
    const result = await priorityAlgorithm.prioritizeContent(criteria, excludeIds, 5);
    
    // Assert: Should exclude specified IDs
    const resultIds = result.map(item => item.id);
    expect(resultIds).not.toContain('2');
    expect(resultIds).not.toContain('4');
    expect(resultIds).toContain('1');
    expect(resultIds).toContain('3');
    expect(resultIds).toContain('5');
    expect(result).toHaveLength(3); // Only non-excluded items
  });
  
  // ============================================================================
  // Insufficient Content Scenarios
  // ============================================================================
  
  test('should handle insufficient Priority 1 content', async () => {
    // Arrange: Very little Priority 1 content, more in other priorities
    const targetGenres = [28, 12]; // Action, Adventure
    
    const allGenresMovies = [createMockMovie(1, { genre_ids: [28, 12] })]; // Only 1 item
    const anyGenreMovies = generateMoviesWithGenres(3, [28, 35]); // IDs 100, 101, 102
    const popularMovies = generateMoviesWithGenres(5, [35, 18]).map((movie, index) => 
      createMockMovie(200 + index, { genre_ids: [35, 18] }) // IDs 200, 201, 202, 203, 204 - no overlap
    );
    
    mockTMDBClient.getContentWithAllGenres.mockResolvedValueOnce(allGenresMovies);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValueOnce(anyGenreMovies);
    mockTMDBClient.getPopularContent.mockResolvedValueOnce(popularMovies);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Request more content than available in Priority 1
    const result = await priorityAlgorithm.prioritizeContent(criteria, [], 8);
    
    // Assert: Should fill with lower priority content
    expect(result).toHaveLength(8); // 1 + 3 + 4 (no overlap now)
    
    // Should have 1 Priority 1, 3 Priority 2, and 4 Priority 3 items
    const priority1Count = result.filter(item => 
      targetGenres.every(genreId => item.genre_ids.includes(genreId))
    ).length;
    expect(priority1Count).toBe(1);
    
    const priority2Count = result.filter(item => 
      !targetGenres.every(genreId => item.genre_ids.includes(genreId)) &&
      targetGenres.some(genreId => item.genre_ids.includes(genreId))
    ).length;
    expect(priority2Count).toBe(3);
    
    const priority3Count = result.filter(item => 
      !targetGenres.some(genreId => item.genre_ids.includes(genreId))
    ).length;
    expect(priority3Count).toBe(4);
  });
  
  test('should handle no Priority 1 or 2 content (only popular)', async () => {
    // Arrange: No matching genre content at all
    const targetGenres = [28, 12]; // Action, Adventure
    
    const allGenresMovies: any[] = []; // No Priority 1
    const anyGenreMovies: any[] = [];  // No Priority 2
    const popularMovies = generateMoviesWithGenres(10, [35, 18, 27]); // Only Priority 3
    
    mockTMDBClient.getContentWithAllGenres.mockResolvedValueOnce(allGenresMovies);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValueOnce(anyGenreMovies);
    mockTMDBClient.getPopularContent.mockResolvedValueOnce(popularMovies);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Run priority algorithm
    const result = await priorityAlgorithm.prioritizeContent(criteria, [], 5);
    
    // Assert: Should return only popular content
    expect(result).toHaveLength(5);
    
    // All items should be Priority 3 (no matching genres)
    result.forEach(item => {
      expect(targetGenres.some(genreId => item.genre_ids.includes(genreId))).toBe(false);
    });
    
    // Should have called Priority 3 to fill the gap
    expect(mockTMDBClient.getPopularContent).toHaveBeenCalledWith(
      MediaType.MOVIE,
      5 // Requested exactly what was needed
    );
  });
  
  test('should handle completely empty content from all priorities', async () => {
    // Arrange: No content available at all
    const targetGenres = [28, 12];
    
    mockTMDBClient.getContentWithAllGenres.mockResolvedValueOnce([]);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValueOnce([]);
    mockTMDBClient.getPopularContent.mockResolvedValueOnce([]);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Run priority algorithm
    const result = await priorityAlgorithm.prioritizeContent(criteria, [], 10);
    
    // Assert: Should return empty array
    expect(result).toHaveLength(0);
    
    // Should have attempted all priority levels
    expect(mockTMDBClient.getContentWithAllGenres).toHaveBeenCalled();
    expect(mockTMDBClient.getContentWithAnyGenre).toHaveBeenCalled();
    expect(mockTMDBClient.getPopularContent).toHaveBeenCalled();
  });
  
  test('should handle insufficient content with large exclusion list', async () => {
    // Arrange: Content available but most is excluded
    const targetGenres = [28];
    
    const allGenresMovies = generateMoviesWithGenres(5, [28, 12]);
    const anyGenreMovies = generateMoviesWithGenres(3, [28, 35]);
    const popularMovies = generateMoviesWithGenres(4, [35, 18]);
    
    mockTMDBClient.getContentWithAllGenres.mockResolvedValueOnce(allGenresMovies);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValueOnce(anyGenreMovies);
    mockTMDBClient.getPopularContent.mockResolvedValueOnce(popularMovies);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Exclude most of the content
    const excludeIds = ['100', '101', '102', '103', '200', '201', '300', '301'];
    
    // Act: Run priority algorithm with large exclusion list
    const result = await priorityAlgorithm.prioritizeContent(criteria, excludeIds, 10);
    
    // Assert: Should return only non-excluded content
    expect(result.length).toBeLessThan(10); // Less than requested due to exclusions
    
    // No excluded IDs should be in result
    const resultIds = result.map(item => item.id);
    excludeIds.forEach(excludeId => {
      expect(resultIds).not.toContain(excludeId);
    });
  });
  
  // ============================================================================
  // Invalid Input Handling
  // ============================================================================
  
  test('should throw error for invalid media type', async () => {
    // Arrange: Invalid media type
    const criteria: FilterCriteria = {
      mediaType: 'INVALID' as MediaType,
      genreIds: [28],
      roomId: 'test-room'
    };
    
    // Act & Assert: Should throw ContentFilteringError
    await expect(
      priorityAlgorithm.prioritizeContent(criteria, [], 10)
    ).rejects.toThrow(ContentFilteringError);
    
    await expect(
      priorityAlgorithm.prioritizeContent(criteria, [], 10)
    ).rejects.toThrow('Invalid media type');
  });
  
  test('should throw error for missing media type', async () => {
    // Arrange: Missing media type
    const criteria: FilterCriteria = {
      mediaType: undefined as any,
      genreIds: [28],
      roomId: 'test-room'
    };
    
    // Act & Assert: Should throw ContentFilteringError
    await expect(
      priorityAlgorithm.prioritizeContent(criteria, [], 10)
    ).rejects.toThrow(ContentFilteringError);
    
    await expect(
      priorityAlgorithm.prioritizeContent(criteria, [], 10)
    ).rejects.toThrow('Media type is required');
  });
  
  test('should throw error for too many genres', async () => {
    // Arrange: More than maximum allowed genres
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: [28, 12, 16, 35], // 4 genres (max is 3)
      roomId: 'test-room'
    };
    
    // Act & Assert: Should throw ContentFilteringError
    await expect(
      priorityAlgorithm.prioritizeContent(criteria, [], 10)
    ).rejects.toThrow(ContentFilteringError);
    
    await expect(
      priorityAlgorithm.prioritizeContent(criteria, [], 10)
    ).rejects.toThrow(`Too many genres selected. Maximum ${CONTENT_FILTERING_CONSTANTS.MAX_GENRES_PER_ROOM} allowed`);
  });
  
  test('should throw error for invalid genre IDs', async () => {
    // Arrange: Invalid genre IDs (negative, zero, non-integer)
    const testCases = [
      { genreIds: [-1, 28], description: 'negative genre ID' },
      { genreIds: [0, 28], description: 'zero genre ID' },
      { genreIds: [28.5, 12], description: 'non-integer genre ID' },
      { genreIds: [NaN, 28], description: 'NaN genre ID' },
    ];
    
    for (const testCase of testCases) {
      const criteria: FilterCriteria = {
        mediaType: MediaType.MOVIE,
        genreIds: testCase.genreIds,
        roomId: 'test-room'
      };
      
      // Act & Assert: Should throw ContentFilteringError
      await expect(
        priorityAlgorithm.prioritizeContent(criteria, [], 10)
      ).rejects.toThrow(ContentFilteringError);
      
      await expect(
        priorityAlgorithm.prioritizeContent(criteria, [], 10)
      ).rejects.toThrow('Invalid genre IDs');
    }
  });
  
  // ============================================================================
  // Error Conditions
  // ============================================================================
  
  test('should handle TMDB client errors gracefully', async () => {
    // Arrange: TMDB client throws error
    const targetGenres = [28, 12];
    
    mockTMDBClient.getContentWithAllGenres.mockRejectedValueOnce(new Error('TMDB API Error'));
    mockTMDBClient.getContentWithAnyGenre.mockRejectedValueOnce(new Error('TMDB API Error'));
    mockTMDBClient.getPopularContent.mockRejectedValueOnce(new Error('TMDB API Error'));
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Should handle errors gracefully and return empty array
    const result = await priorityAlgorithm.prioritizeContent(criteria, [], 10);
    
    // Assert: Should return empty array when all sources fail
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });
  
  test('should handle partial TMDB client errors (some priorities fail)', async () => {
    // Arrange: Some priorities succeed, others fail
    const targetGenres = [28, 12];
    
    const allGenresMovies = generateMoviesWithGenres(2, [28, 12]);
    
    mockTMDBClient.getContentWithAllGenres.mockResolvedValueOnce(allGenresMovies);
    mockTMDBClient.getContentWithAnyGenre.mockRejectedValueOnce(new Error('Priority 2 failed'));
    mockTMDBClient.getPopularContent.mockRejectedValueOnce(new Error('Priority 3 failed'));
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Should still return Priority 1 content despite other failures
    const result = await priorityAlgorithm.prioritizeContent(criteria, [], 10);
    
    // Assert: Should return available Priority 1 content
    expect(result).toHaveLength(2);
    
    // All items should be Priority 1 (have all target genres)
    result.forEach(item => {
      expect(targetGenres.every(genreId => item.genre_ids.includes(genreId))).toBe(true);
    });
  });
  
  // ============================================================================
  // ContentAnalyzer Edge Cases
  // ============================================================================
  
  test('ContentAnalyzer should handle empty genre list', () => {
    // Arrange: Content with no target genres
    const content = createMockMovie(1, { genre_ids: [28, 35] });
    const emptyGenres: number[] = [];
    
    // Act: Analyze priority and score
    const priority = ContentAnalyzer.analyzePriority(content, emptyGenres);
    const score = ContentAnalyzer.calculateRelevanceScore(content, emptyGenres);
    
    // Assert: Should return popular priority and neutral score
    expect(priority).toBe(3); // Priority.POPULAR
    expect(score).toBe(0.5); // Neutral score
  });
  
  test('ContentAnalyzer should handle content with no genres', () => {
    // Arrange: Content with empty genre_ids
    const content = createMockMovie(1, { genre_ids: [] });
    const targetGenres = [28, 12];
    
    // Act: Analyze priority and score
    const priority = ContentAnalyzer.analyzePriority(content, targetGenres);
    const score = ContentAnalyzer.calculateRelevanceScore(content, targetGenres);
    
    // Assert: Should return popular priority and zero score
    expect(priority).toBe(3); // Priority.POPULAR
    expect(score).toBe(0); // No matching genres
  });
  
  test('ContentAnalyzer should handle perfect genre match', () => {
    // Arrange: Content with exact genre match
    const targetGenres = [28, 12, 16];
    const content = createMockMovie(1, { genre_ids: [28, 12, 16] });
    
    // Act: Analyze priority and score
    const priority = ContentAnalyzer.analyzePriority(content, targetGenres);
    const score = ContentAnalyzer.calculateRelevanceScore(content, targetGenres);
    
    // Assert: Should return Priority 1 and perfect score
    expect(priority).toBe(1); // Priority.ALL_GENRES
    expect(score).toBe(1.0); // Perfect match
  });
  
  test('ContentAnalyzer should handle partial genre match', () => {
    // Arrange: Content with partial genre match
    const targetGenres = [28, 12, 16]; // Want 3 genres
    const content = createMockMovie(1, { genre_ids: [28, 12, 35] }); // Has 2 of 3
    
    // Act: Analyze priority and score
    const priority = ContentAnalyzer.analyzePriority(content, targetGenres);
    const score = ContentAnalyzer.calculateRelevanceScore(content, targetGenres);
    
    // Assert: Should return Priority 2 and partial score
    expect(priority).toBe(2); // Priority.ANY_GENRE
    expect(score).toBeCloseTo(0.8 * (2/3), 2); // Partial match score
  });
  
  test('ContentAnalyzer should group empty content correctly', () => {
    // Arrange: Empty content array
    const emptyContent: any[] = [];
    const targetGenres = [28, 12];
    
    // Act: Group by priority
    const grouped = ContentAnalyzer.groupByPriority(emptyContent, targetGenres);
    
    // Assert: Should return empty groups
    expect(grouped[1]).toHaveLength(0); // Priority.ALL_GENRES
    expect(grouped[2]).toHaveLength(0); // Priority.ANY_GENRE
    expect(grouped[3]).toHaveLength(0); // Priority.POPULAR
  });
  
  test('ContentAnalyzer should sort by relevance correctly', () => {
    // Arrange: Mixed content with different relevance scores
    const targetGenres = [28, 12];
    const content = [
      createMockMovie(1, { genre_ids: [35, 18], vote_average: 9.0 }), // No match, high rating
      createMockMovie(2, { genre_ids: [28, 12], vote_average: 7.0 }), // Perfect match, medium rating
      createMockMovie(3, { genre_ids: [28, 35], vote_average: 8.0 }), // Partial match, high rating
      createMockMovie(4, { genre_ids: [28, 12], vote_average: 8.5 }), // Perfect match, high rating
    ];
    
    // Act: Sort by relevance
    const sorted = ContentAnalyzer.sortByRelevance(content, targetGenres);
    
    // Assert: Should be sorted by relevance first, then rating
    expect(sorted[0].id).toBe('4'); // Perfect match + highest rating
    expect(sorted[1].id).toBe('2'); // Perfect match + lower rating
    expect(sorted[2].id).toBe('3'); // Partial match + high rating
    expect(sorted[3].id).toBe('1'); // No match + high rating
  });
});
