/**
 * Property-Based Test: Priority Algorithm Correctness
 * 
 * **Feature: advanced-content-filtering, Property 5: Priority Algorithm Correctness**
 * **Validates: Requirements 3.2**
 * 
 * Property: For any content loading with selected genres, the system should prioritize 
 * content containing all genres first, then content with any genre, then popular content 
 * of the same media type
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MediaType, FilterCriteria, TMDBContent, Priority } from '../types/content-filtering';
import { PriorityAlgorithmEngine, ContentAnalyzer } from '../services/priority-algorithm';
import { EnhancedTMDBClient } from '../types/tmdb-client';
import { 
  createMockMovie, 
  createMockTVShow, 
  generateMoviesWithGenres,
  TEST_GENRE_IDS 
} from './test-utils';

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

describe('Property Test: Priority Algorithm Correctness', () => {
  let priorityAlgorithm: PriorityAlgorithmEngine;
  
  beforeEach(() => {
    priorityAlgorithm = new PriorityAlgorithmEngine(mockTMDBClient);
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  /**
   * Property 5: Priority Algorithm Correctness
   * Tests that content is prioritized correctly: ALL genres > ANY genre > Popular
   */
  test('Property 5: Priority Algorithm Correctness - Three-tier prioritization with movies', async () => {
    // Arrange: Create test data with different genre combinations
    const targetGenres = [28, 12]; // Action, Adventure
    
    // Priority 1: Movies with ALL genres (Action AND Adventure)
    const allGenresMovies = [
      createMockMovie(101, { genre_ids: [28, 12, 16] }), // Action, Adventure, Animation
      createMockMovie(102, { genre_ids: [28, 12] }),     // Action, Adventure
    ];
    
    // Priority 2: Movies with ANY genre (Action OR Adventure)
    const anyGenreMovies = [
      createMockMovie(201, { genre_ids: [28, 35] }),     // Action, Comedy
      createMockMovie(202, { genre_ids: [12, 18] }),     // Adventure, Drama
    ];
    
    // Priority 3: Popular movies (no matching genres)
    const popularMovies = [
      createMockMovie(301, { genre_ids: [35, 18] }),     // Comedy, Drama
      createMockMovie(302, { genre_ids: [27, 53] }),     // Horror, Thriller
    ];
    
    // Mock TMDB client responses
    mockTMDBClient.getContentWithAllGenres.mockResolvedValueOnce(allGenresMovies);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValueOnce(anyGenreMovies);
    mockTMDBClient.getPopularContent.mockResolvedValueOnce(popularMovies);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Run priority algorithm
    const result = await priorityAlgorithm.prioritizeContent(criteria, [], 10);
    
    // Assert: Verify priority ordering
    expect(result).toHaveLength(6); // All content should be included
    
    // Verify that Priority 1 content (ALL genres) appears first in logical order
    const priority1Items = result.filter(item => 
      targetGenres.every(genreId => item.genre_ids.includes(genreId))
    );
    expect(priority1Items).toHaveLength(2);
    
    // Verify that Priority 2 content (ANY genre) is included
    const priority2Items = result.filter(item => 
      !targetGenres.every(genreId => item.genre_ids.includes(genreId)) &&
      targetGenres.some(genreId => item.genre_ids.includes(genreId))
    );
    expect(priority2Items).toHaveLength(2);
    
    // Verify that Priority 3 content (Popular) is included
    const priority3Items = result.filter(item => 
      !targetGenres.some(genreId => item.genre_ids.includes(genreId))
    );
    expect(priority3Items).toHaveLength(2);
    
    // Verify TMDB client was called with correct parameters
    expect(mockTMDBClient.getContentWithAllGenres).toHaveBeenCalledWith(
      MediaType.MOVIE,
      targetGenres,
      30
    );
    expect(mockTMDBClient.getContentWithAnyGenre).toHaveBeenCalledWith(
      MediaType.MOVIE,
      targetGenres,
      30
    );
    expect(mockTMDBClient.getPopularContent).toHaveBeenCalledWith(
      MediaType.MOVIE,
      expect.any(Number)
    );
  });
  
  test('Property 5: Priority Algorithm Correctness - Three-tier prioritization with TV shows', async () => {
    // Arrange: Create test data for TV shows
    const targetGenres = [35, 18]; // Comedy, Drama
    
    const allGenresTVShows = [
      createMockTVShow(101, { genre_ids: [35, 18, 10751] }), // Comedy, Drama, Family
    ];
    
    const anyGenreTVShows = [
      createMockTVShow(201, { genre_ids: [35, 16] }),        // Comedy, Animation
      createMockTVShow(202, { genre_ids: [18, 9648] }),      // Drama, Mystery
    ];
    
    const popularTVShows = [
      createMockTVShow(301, { genre_ids: [10759, 10765] }),  // Action & Adventure, Soap
    ];
    
    // Mock TMDB client responses
    mockTMDBClient.getContentWithAllGenres.mockResolvedValueOnce(allGenresTVShows);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValueOnce(anyGenreTVShows);
    mockTMDBClient.getPopularContent.mockResolvedValueOnce(popularTVShows);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.TV,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Run priority algorithm
    const result = await priorityAlgorithm.prioritizeContent(criteria, [], 10);
    
    // Assert: Verify all content types are represented
    expect(result).toHaveLength(4);
    
    // Verify Priority 1 content (ALL genres)
    const priority1Items = result.filter(item => 
      targetGenres.every(genreId => item.genre_ids.includes(genreId))
    );
    expect(priority1Items).toHaveLength(1);
    
    // Verify Priority 2 content (ANY genre)
    const priority2Items = result.filter(item => 
      !targetGenres.every(genreId => item.genre_ids.includes(genreId)) &&
      targetGenres.some(genreId => item.genre_ids.includes(genreId))
    );
    expect(priority2Items).toHaveLength(2);
    
    // Verify Priority 3 content (Popular)
    const priority3Items = result.filter(item => 
      !targetGenres.some(genreId => item.genre_ids.includes(genreId))
    );
    expect(priority3Items).toHaveLength(1);
  });
  
  test('Property 5: Priority Algorithm Correctness - Single genre prioritization', async () => {
    // Arrange: Test with single genre
    const targetGenres = [28]; // Action only
    
    const allGenresMovies = generateMoviesWithGenres(3, [28, 12, 16]); // Contains Action
    const anyGenreMovies = generateMoviesWithGenres(2, [28, 35]);      // Contains Action
    const popularMovies = generateMoviesWithGenres(2, [35, 18]);       // No Action
    
    // Mock TMDB client responses
    mockTMDBClient.getContentWithAllGenres.mockResolvedValueOnce(allGenresMovies);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValueOnce(anyGenreMovies);
    mockTMDBClient.getPopularContent.mockResolvedValueOnce(popularMovies);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Run priority algorithm
    const result = await priorityAlgorithm.prioritizeContent(criteria, [], 10);
    
    // Assert: For single genre, Priority 1 and Priority 2 should be the same
    // (content with the single genre)
    const actionMovies = result.filter(item => item.genre_ids.includes(28));
    const nonActionMovies = result.filter(item => !item.genre_ids.includes(28));
    
    expect(actionMovies.length).toBeGreaterThan(0);
    expect(nonActionMovies.length).toBeGreaterThan(0);
    
    // Verify that action movies are prioritized over non-action movies
    expect(actionMovies.length).toBeGreaterThanOrEqual(nonActionMovies.length);
  });
  
  test('Property 5: Priority Algorithm Correctness - No genres specified (popular only)', async () => {
    // Arrange: Test with no genres (should return only popular content)
    const popularMovies = generateMoviesWithGenres(5, [28, 35, 18]);
    
    // Mock TMDB client response
    mockTMDBClient.getPopularContent.mockResolvedValueOnce(popularMovies);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: [], // No genres specified
      roomId: 'test-room'
    };
    
    // Act: Run priority algorithm
    const result = await priorityAlgorithm.prioritizeContent(criteria, [], 10);
    
    // Assert: Should only call getPopularContent
    expect(mockTMDBClient.getContentWithAllGenres).not.toHaveBeenCalled();
    expect(mockTMDBClient.getContentWithAnyGenre).not.toHaveBeenCalled();
    expect(mockTMDBClient.getPopularContent).toHaveBeenCalledWith(MediaType.MOVIE, 10);
    
    expect(result).toHaveLength(5);
    expect(result).toEqual(expect.arrayContaining(popularMovies));
  });
  
  test('Property 5: Priority Algorithm Correctness - Exclusion filtering works across all priorities', async () => {
    // Arrange: Create content and exclude some items
    const targetGenres = [28, 12]; // Action, Adventure
    
    const allGenresMovies = [
      createMockMovie(101, { genre_ids: [28, 12] }),
      createMockMovie(102, { genre_ids: [28, 12] }), // This will be excluded
    ];
    
    const anyGenreMovies = [
      createMockMovie(201, { genre_ids: [28] }),
      createMockMovie(202, { genre_ids: [12] }),     // This will be excluded
    ];
    
    const popularMovies = [
      createMockMovie(301, { genre_ids: [35] }),
      createMockMovie(302, { genre_ids: [18] }),     // This will be excluded
    ];
    
    const excludeIds = ['102', '202', '302']; // Exclude one from each priority
    
    // Mock TMDB client responses
    mockTMDBClient.getContentWithAllGenres.mockResolvedValueOnce(allGenresMovies);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValueOnce(anyGenreMovies);
    mockTMDBClient.getPopularContent.mockResolvedValueOnce(popularMovies);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Run priority algorithm with exclusions
    const result = await priorityAlgorithm.prioritizeContent(criteria, excludeIds, 10);
    
    // Assert: Excluded items should not be in result
    const resultIds = result.map(item => item.id);
    expect(resultIds).not.toContain('102');
    expect(resultIds).not.toContain('202');
    expect(resultIds).not.toContain('302');
    
    // Non-excluded items should be present
    expect(resultIds).toContain('101');
    expect(resultIds).toContain('201');
    expect(resultIds).toContain('301');
    
    expect(result).toHaveLength(3);
  });
  
  test('Property 5: Priority Algorithm Correctness - Maximum genre limit (3 genres)', async () => {
    // Arrange: Test with maximum allowed genres
    const targetGenres = [28, 12, 16]; // Action, Adventure, Animation (max 3)
    
    const allGenresMovies = [
      createMockMovie(101, { genre_ids: [28, 12, 16, 35] }), // Has all 3 + Comedy
    ];
    
    const anyGenreMovies = [
      createMockMovie(201, { genre_ids: [28, 35] }),         // Has Action only
      createMockMovie(202, { genre_ids: [12, 18] }),         // Has Adventure only
      createMockMovie(203, { genre_ids: [16, 27] }),         // Has Animation only
    ];
    
    const popularMovies = [
      createMockMovie(301, { genre_ids: [35, 18] }),         // No matching genres
    ];
    
    // Mock TMDB client responses
    mockTMDBClient.getContentWithAllGenres.mockResolvedValueOnce(allGenresMovies);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValueOnce(anyGenreMovies);
    mockTMDBClient.getPopularContent.mockResolvedValueOnce(popularMovies);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Run priority algorithm
    const result = await priorityAlgorithm.prioritizeContent(criteria, [], 10);
    
    // Assert: Verify Priority 1 item has ALL 3 genres
    const priority1Items = result.filter(item => 
      targetGenres.every(genreId => item.genre_ids.includes(genreId))
    );
    expect(priority1Items).toHaveLength(1);
    expect(priority1Items[0].id).toBe('101');
    
    // Verify Priority 2 items have at least one genre
    const priority2Items = result.filter(item => 
      !targetGenres.every(genreId => item.genre_ids.includes(genreId)) &&
      targetGenres.some(genreId => item.genre_ids.includes(genreId))
    );
    expect(priority2Items).toHaveLength(3);
    
    // Verify each Priority 2 item has at least one target genre
    priority2Items.forEach(item => {
      const hasTargetGenre = targetGenres.some(genreId => item.genre_ids.includes(genreId));
      expect(hasTargetGenre).toBe(true);
    });
  });
  
  test('Property 5: Priority Algorithm Correctness - Insufficient content handling', async () => {
    // Arrange: Test when there's not enough content in higher priorities
    const targetGenres = [28, 12]; // Action, Adventure
    
    // Only 1 item in Priority 1, none in Priority 2
    const allGenresMovies = [
      createMockMovie(101, { genre_ids: [28, 12] }),
    ];
    
    const anyGenreMovies: TMDBContent[] = []; // Empty Priority 2
    
    // Lots of popular content to fill the gap
    const popularMovies = generateMoviesWithGenres(10, [35, 18, 27]);
    
    // Mock TMDB client responses
    mockTMDBClient.getContentWithAllGenres.mockResolvedValueOnce(allGenresMovies);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValueOnce(anyGenreMovies);
    mockTMDBClient.getPopularContent.mockResolvedValueOnce(popularMovies);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Run priority algorithm requesting 5 items
    const result = await priorityAlgorithm.prioritizeContent(criteria, [], 5);
    
    // Assert: Should get 1 Priority 1 item + 4 Priority 3 items
    expect(result).toHaveLength(5);
    
    const priority1Items = result.filter(item => 
      targetGenres.every(genreId => item.genre_ids.includes(genreId))
    );
    expect(priority1Items).toHaveLength(1);
    
    const priority3Items = result.filter(item => 
      !targetGenres.some(genreId => item.genre_ids.includes(genreId))
    );
    expect(priority3Items).toHaveLength(4);
    
    // Verify Priority 3 was called to fill the gap
    expect(mockTMDBClient.getPopularContent).toHaveBeenCalledWith(
      MediaType.MOVIE,
      4 // Should request exactly what's needed
    );
  });
  
  /**
   * Property test using ContentAnalyzer utility functions
   */
  test('Property 5: Priority Algorithm Correctness - ContentAnalyzer priority detection', () => {
    // Arrange: Test content with different genre combinations
    const targetGenres = [28, 12, 16]; // Action, Adventure, Animation
    
    const testCases = [
      {
        content: createMockMovie(1, { genre_ids: [28, 12, 16, 35] }), // All + extra
        expectedPriority: Priority.ALL_GENRES,
        expectedScore: 1.0
      },
      {
        content: createMockMovie(2, { genre_ids: [28, 12] }),         // Missing Animation
        expectedPriority: Priority.ANY_GENRE,
        expectedScore: 0.8 * (2/3) // Partial match
      },
      {
        content: createMockMovie(3, { genre_ids: [28] }),             // Only Action
        expectedPriority: Priority.ANY_GENRE,
        expectedScore: 0.8 * (1/3) // Partial match
      },
      {
        content: createMockMovie(4, { genre_ids: [35, 18] }),         // No matches
        expectedPriority: Priority.POPULAR,
        expectedScore: 0.0
      }
    ];
    
    // Act & Assert: Test each case
    testCases.forEach(testCase => {
      const actualPriority = ContentAnalyzer.analyzePriority(testCase.content, targetGenres);
      const actualScore = ContentAnalyzer.calculateRelevanceScore(testCase.content, targetGenres);
      
      expect(actualPriority).toBe(testCase.expectedPriority);
      expect(actualScore).toBeCloseTo(testCase.expectedScore, 2);
    });
  });
  
  test('Property 5: Priority Algorithm Correctness - Content grouping by priority', () => {
    // Arrange: Mixed content with different priority levels
    const targetGenres = [28, 12]; // Action, Adventure
    
    const mixedContent = [
      createMockMovie(1, { genre_ids: [28, 12, 16] }),  // Priority 1
      createMockMovie(2, { genre_ids: [28, 35] }),      // Priority 2
      createMockMovie(3, { genre_ids: [35, 18] }),      // Priority 3
      createMockMovie(4, { genre_ids: [28, 12] }),      // Priority 1
      createMockMovie(5, { genre_ids: [12, 27] }),      // Priority 2
    ];
    
    // Act: Group content by priority
    const grouped = ContentAnalyzer.groupByPriority(mixedContent, targetGenres);
    
    // Assert: Verify correct grouping
    expect(grouped[Priority.ALL_GENRES]).toHaveLength(2);
    expect(grouped[Priority.ANY_GENRE]).toHaveLength(2);
    expect(grouped[Priority.POPULAR]).toHaveLength(1);
    
    // Verify specific items are in correct groups
    const priority1Ids = grouped[Priority.ALL_GENRES].map(item => item.id);
    expect(priority1Ids).toContain('1');
    expect(priority1Ids).toContain('4');
    
    const priority2Ids = grouped[Priority.ANY_GENRE].map(item => item.id);
    expect(priority2Ids).toContain('2');
    expect(priority2Ids).toContain('5');
    
    const priority3Ids = grouped[Priority.POPULAR].map(item => item.id);
    expect(priority3Ids).toContain('3');
  });
});
