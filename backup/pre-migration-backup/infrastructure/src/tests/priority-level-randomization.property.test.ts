/**
 * Property-Based Test: Priority Level Randomization
 * 
 * **Feature: advanced-content-filtering, Property 6: Priority Level Randomization**
 * **Validates: Requirements 3.3**
 * 
 * Property: For any content loading within the same priority level, multiple executions 
 * should produce different orderings of the same content set
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MediaType, FilterCriteria } from '../types/content-filtering';
import { PriorityAlgorithmEngine } from '../services/priority-algorithm';
import { EnhancedTMDBClient } from '../types/tmdb-client';
import { generateMoviesWithGenres, generateTVShowsWithGenres } from './test-utils';

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

describe('Property Test: Priority Level Randomization', () => {
  let priorityAlgorithm: PriorityAlgorithmEngine;
  
  beforeEach(() => {
    priorityAlgorithm = new PriorityAlgorithmEngine(mockTMDBClient);
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  /**
   * Property 6: Priority Level Randomization
   * Tests that multiple executions produce different orderings within priority levels
   */
  test('Property 6: Priority Level Randomization - Multiple executions produce different orderings', async () => {
    // Arrange: Create consistent test data (same content every time)
    const targetGenres = [28, 12]; // Action, Adventure
    
    // Create enough content to make randomization detectable
    const allGenresMovies = generateMoviesWithGenres(10, [28, 12, 16]);
    const anyGenreMovies = generateMoviesWithGenres(8, [28, 35]);
    const popularMovies = generateMoviesWithGenres(6, [35, 18]);
    
    // Mock TMDB client to return the same data every time
    const mockAllGenres = jest.fn<Promise<TMDBContent[]>, [MediaType, number[], number?]>().mockResolvedValue([...allGenresMovies]);
    const mockAnyGenre = jest.fn<Promise<TMDBContent[]>, [MediaType, number[], number?]>().mockResolvedValue([...anyGenreMovies]);
    const mockPopular = jest.fn<Promise<TMDBContent[]>, [MediaType, number?]>().mockResolvedValue([...popularMovies]);
    
    mockTMDBClient.getContentWithAllGenres = mockAllGenres as any;
    mockTMDBClient.getContentWithAnyGenre = mockAnyGenre as any;
    mockTMDBClient.getPopularContent = mockPopular as any;
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Execute the algorithm multiple times
    const executions = 10;
    const results: string[][] = [];
    
    for (let i = 0; i < executions; i++) {
      const result = await priorityAlgorithm.prioritizeContent(criteria, [], 20);
      results.push(result.map(item => item.id));
    }
    
    // Assert: Verify that not all executions produce identical orderings
    const firstResult = results[0];
    let identicalCount = 0;
    
    for (let i = 1; i < results.length; i++) {
      const isIdentical = results[i].every((id, index) => id === firstResult[index]);
      if (isIdentical) {
        identicalCount++;
      }
    }
    
    // Property assertion: Not all results should be identical (randomization working)
    // Allow for some identical results due to random chance, but not all
    expect(identicalCount).toBeLessThan(executions - 1);
    
    // Verify that all results contain the same content (just in different orders)
    results.forEach(result => {
      expect(result).toHaveLength(firstResult.length);
      
      // Each result should contain the same set of IDs
      const sortedResult = [...result].sort();
      const sortedFirst = [...firstResult].sort();
      expect(sortedResult).toEqual(sortedFirst);
    });
    
    console.log(`🎲 Randomization test: ${executions - identicalCount - 1}/${executions - 1} executions had different orderings`);
  });
  
  test('Property 6: Priority Level Randomization - Priority 1 content is randomized', async () => {
    // Arrange: Focus on Priority 1 content only
    const targetGenres = [28, 12, 16]; // Action, Adventure, Animation
    
    // Create multiple items that all have ALL genres (Priority 1)
    const allGenresMovies = generateMoviesWithGenres(8, [28, 12, 16]);
    
    // Mock to return only Priority 1 content (empty Priority 2 and 3)
    mockTMDBClient.getContentWithAllGenres.mockResolvedValue([...allGenresMovies]);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValue([]);
    mockTMDBClient.getPopularContent.mockResolvedValue([]);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Execute multiple times
    const executions = 15;
    const results: string[][] = [];
    
    for (let i = 0; i < executions; i++) {
      const result = await priorityAlgorithm.prioritizeContent(criteria, [], 8);
      results.push(result.map(item => item.id));
    }
    
    // Assert: Verify randomization within Priority 1
    const uniqueOrderings = new Set(results.map(result => result.join(',')));
    
    // Should have multiple unique orderings (randomization working)
    expect(uniqueOrderings.size).toBeGreaterThan(1);
    
    // All results should contain the same Priority 1 content
    results.forEach(result => {
      expect(result).toHaveLength(8);
      
      // All items should have ALL target genres (Priority 1)
      result.forEach(id => {
        const movie = allGenresMovies.find(m => m.id === id);
        expect(movie).toBeDefined();
        expect(targetGenres.every(genreId => movie!.genre_ids.includes(genreId))).toBe(true);
      });
    });
    
    console.log(`🎲 Priority 1 randomization: ${uniqueOrderings.size} unique orderings out of ${executions} executions`);
  });
  
  test('Property 6: Priority Level Randomization - Priority 2 content is randomized', async () => {
    // Arrange: Focus on Priority 2 content (ANY genre)
    const targetGenres = [28, 12]; // Action, Adventure
    
    // No Priority 1 content
    const allGenresMovies: any[] = [];
    
    // Multiple Priority 2 items (have at least one target genre)
    const anyGenreMovies = [
      ...generateMoviesWithGenres(3, [28, 35]),    // Action + Comedy
      ...generateMoviesWithGenres(3, [12, 18]),    // Adventure + Drama
      ...generateMoviesWithGenres(2, [28, 27]),    // Action + Horror
    ];
    
    // No Priority 3 content
    const popularMovies: any[] = [];
    
    mockTMDBClient.getContentWithAllGenres.mockResolvedValue(allGenresMovies);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValue([...anyGenreMovies]);
    mockTMDBClient.getPopularContent.mockResolvedValue(popularMovies);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Execute multiple times
    const executions = 12;
    const results: string[][] = [];
    
    for (let i = 0; i < executions; i++) {
      const result = await priorityAlgorithm.prioritizeContent(criteria, [], 8);
      results.push(result.map(item => item.id));
    }
    
    // Assert: Verify randomization within Priority 2
    const uniqueOrderings = new Set(results.map(result => result.join(',')));
    expect(uniqueOrderings.size).toBeGreaterThan(1);
    
    // All results should contain the same Priority 2 content
    results.forEach(result => {
      expect(result).toHaveLength(8);
      
      // All items should have at least one target genre (Priority 2)
      result.forEach(id => {
        const movie = anyGenreMovies.find(m => m.id === id);
        expect(movie).toBeDefined();
        expect(targetGenres.some(genreId => movie!.genre_ids.includes(genreId))).toBe(true);
      });
    });
    
    console.log(`🎲 Priority 2 randomization: ${uniqueOrderings.size} unique orderings out of ${executions} executions`);
  });
  
  test('Property 6: Priority Level Randomization - Priority 3 content is randomized', async () => {
    // Arrange: Focus on Priority 3 content (popular, no genre matching)
    const targetGenres = [28, 12]; // Action, Adventure
    
    // No Priority 1 or 2 content
    const allGenresMovies: any[] = [];
    const anyGenreMovies: any[] = [];
    
    // Multiple Priority 3 items (no target genres)
    const popularMovies = generateMoviesWithGenres(10, [35, 18, 27, 53]);
    
    mockTMDBClient.getContentWithAllGenres.mockResolvedValue(allGenresMovies);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValue(anyGenreMovies);
    mockTMDBClient.getPopularContent.mockResolvedValue([...popularMovies]);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Execute multiple times
    const executions = 10;
    const results: string[][] = [];
    
    for (let i = 0; i < executions; i++) {
      const result = await priorityAlgorithm.prioritizeContent(criteria, [], 8);
      results.push(result.map(item => item.id));
    }
    
    // Assert: Verify randomization within Priority 3
    const uniqueOrderings = new Set(results.map(result => result.join(',')));
    expect(uniqueOrderings.size).toBeGreaterThan(1);
    
    // All results should contain Priority 3 content
    results.forEach(result => {
      expect(result).toHaveLength(8);
      
      // All items should NOT have target genres (Priority 3)
      result.forEach(id => {
        const movie = popularMovies.find(m => m.id === id);
        expect(movie).toBeDefined();
        expect(targetGenres.some(genreId => movie!.genre_ids.includes(genreId))).toBe(false);
      });
    });
    
    console.log(`🎲 Priority 3 randomization: ${uniqueOrderings.size} unique orderings out of ${executions} executions`);
  });
  
  test('Property 6: Priority Level Randomization - Mixed priorities maintain individual randomization', async () => {
    // Arrange: Create content for all three priority levels
    const targetGenres = [28, 12]; // Action, Adventure
    
    const allGenresMovies = generateMoviesWithGenres(4, [28, 12, 16]);  // Priority 1
    const anyGenreMovies = generateMoviesWithGenres(4, [28, 35]);       // Priority 2
    const popularMovies = generateMoviesWithGenres(4, [35, 18]);        // Priority 3
    
    mockTMDBClient.getContentWithAllGenres.mockResolvedValue([...allGenresMovies]);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValue([...anyGenreMovies]);
    mockTMDBClient.getPopularContent.mockResolvedValue([...popularMovies]);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Execute multiple times
    const executions = 8;
    const results: string[][] = [];
    
    for (let i = 0; i < executions; i++) {
      const result = await priorityAlgorithm.prioritizeContent(criteria, [], 12);
      results.push(result.map(item => item.id));
    }
    
    // Assert: Verify that different priority levels are mixed randomly
    const uniqueOrderings = new Set(results.map(result => result.join(',')));
    expect(uniqueOrderings.size).toBeGreaterThan(1);
    
    // Analyze the distribution of priority levels in results
    results.forEach(result => {
      expect(result).toHaveLength(12);
      
      // Count items from each priority level
      let priority1Count = 0;
      let priority2Count = 0;
      let priority3Count = 0;
      
      result.forEach(id => {
        const isP1 = allGenresMovies.some(m => m.id === id);
        const isP2 = anyGenreMovies.some(m => m.id === id);
        const isP3 = popularMovies.some(m => m.id === id);
        
        if (isP1) priority1Count++;
        else if (isP2) priority2Count++;
        else if (isP3) priority3Count++;
      });
      
      // Should have content from all priority levels
      expect(priority1Count).toBe(4);
      expect(priority2Count).toBe(4);
      expect(priority3Count).toBe(4);
    });
    
    console.log(`🎲 Mixed priorities randomization: ${uniqueOrderings.size} unique orderings out of ${executions} executions`);
  });
  
  test('Property 6: Priority Level Randomization - TV shows are also randomized', async () => {
    // Arrange: Test randomization with TV shows
    const targetGenres = [35, 18]; // Comedy, Drama
    
    const allGenresTVShows = generateTVShowsWithGenres(6, [35, 18, 10751]);
    const anyGenreTVShows = generateTVShowsWithGenres(4, [35, 16]);
    const popularTVShows = generateTVShowsWithGenres(4, [10759, 10765]);
    
    mockTMDBClient.getContentWithAllGenres.mockResolvedValue([...allGenresTVShows]);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValue([...anyGenreTVShows]);
    mockTMDBClient.getPopularContent.mockResolvedValue([...popularTVShows]);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.TV,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Execute multiple times
    const executions = 8;
    const results: string[][] = [];
    
    for (let i = 0; i < executions; i++) {
      const result = await priorityAlgorithm.prioritizeContent(criteria, [], 10);
      results.push(result.map(item => item.id));
    }
    
    // Assert: Verify randomization works for TV shows too
    const uniqueOrderings = new Set(results.map(result => result.join(',')));
    expect(uniqueOrderings.size).toBeGreaterThan(1);
    
    // All results should contain the same TV show content
    results.forEach(result => {
      expect(result).toHaveLength(10);
      
      // Verify content is from the expected TV shows
      result.forEach(id => {
        const isFromTestData = 
          allGenresTVShows.some(tv => tv.id === id) ||
          anyGenreTVShows.some(tv => tv.id === id) ||
          popularTVShows.some(tv => tv.id === id);
        expect(isFromTestData).toBe(true);
      });
    });
    
    console.log(`🎲 TV shows randomization: ${uniqueOrderings.size} unique orderings out of ${executions} executions`);
  });
  
  test('Property 6: Priority Level Randomization - Single item per priority level (no randomization possible)', async () => {
    // Arrange: Edge case with only one item per priority level
    const targetGenres = [28, 12]; // Action, Adventure
    
    const allGenresMovies = generateMoviesWithGenres(1, [28, 12, 16]);  // 1 Priority 1 item
    const anyGenreMovies = generateMoviesWithGenres(1, [28, 35]);       // 1 Priority 2 item
    const popularMovies = generateMoviesWithGenres(1, [35, 18]);        // 1 Priority 3 item
    
    mockTMDBClient.getContentWithAllGenres.mockResolvedValue([...allGenresMovies]);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValue([...anyGenreMovies]);
    mockTMDBClient.getPopularContent.mockResolvedValue([...popularMovies]);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Execute multiple times
    const executions = 5;
    const results: string[][] = [];
    
    for (let i = 0; i < executions; i++) {
      const result = await priorityAlgorithm.prioritizeContent(criteria, [], 3);
      results.push(result.map(item => item.id));
    }
    
    // Assert: With only one item per priority, all results should be identical
    const uniqueOrderings = new Set(results.map(result => result.join(',')));
    
    // Should have only one unique ordering (no randomization possible)
    expect(uniqueOrderings.size).toBe(1);
    
    // All results should be identical
    const firstResult = results[0];
    results.forEach(result => {
      expect(result).toEqual(firstResult);
      expect(result).toHaveLength(3);
    });
    
    console.log(`🎲 Single item test: ${uniqueOrderings.size} unique ordering (expected: 1)`);
  });
  
  test('Property 6: Priority Level Randomization - Empty priority levels handled correctly', async () => {
    // Arrange: Test with some empty priority levels
    const targetGenres = [28, 12]; // Action, Adventure
    
    const allGenresMovies = generateMoviesWithGenres(5, [28, 12, 16]);  // Priority 1 only
    const anyGenreMovies: any[] = [];                                   // Empty Priority 2
    const popularMovies: any[] = [];                                    // Empty Priority 3
    
    mockTMDBClient.getContentWithAllGenres.mockResolvedValue([...allGenresMovies]);
    mockTMDBClient.getContentWithAnyGenre.mockResolvedValue(anyGenreMovies);
    mockTMDBClient.getPopularContent.mockResolvedValue(popularMovies);
    
    const criteria: FilterCriteria = {
      mediaType: MediaType.MOVIE,
      genreIds: targetGenres,
      roomId: 'test-room'
    };
    
    // Act: Execute multiple times
    const executions = 6;
    const results: string[][] = [];
    
    for (let i = 0; i < executions; i++) {
      const result = await priorityAlgorithm.prioritizeContent(criteria, [], 5);
      results.push(result.map(item => item.id));
    }
    
    // Assert: Should still randomize the available Priority 1 content
    const uniqueOrderings = new Set(results.map(result => result.join(',')));
    expect(uniqueOrderings.size).toBeGreaterThan(1);
    
    // All results should contain only Priority 1 content
    results.forEach(result => {
      expect(result).toHaveLength(5);
      
      result.forEach(id => {
        const movie = allGenresMovies.find(m => m.id === id);
        expect(movie).toBeDefined();
        expect(targetGenres.every(genreId => movie!.genre_ids.includes(genreId))).toBe(true);
      });
    });
    
    console.log(`🎲 Empty priority levels test: ${uniqueOrderings.size} unique orderings out of ${executions} executions`);
  });
});
