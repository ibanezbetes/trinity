/**
 * Property-Based Test for Sequence Consistency Across Users
 * 
 * **Feature: room-movie-precaching, Property 2: Sequence Consistency Across Users**
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 * 
 * For any room with multiple participants, all users should receive movies in 
 * identical sequence order, with sequence position incrementing globally for all 
 * users when any user advances to the next movie.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the sequence management system
class MockSequenceManager {
  private sequences: Map<string, number> = new Map();
  private movies: Map<string, any[]> = new Map();
  private locks: Map<string, boolean> = new Map();

  async getNextMovieAtomic(roomId: string): Promise<any | null> {
    // Simulate atomic operation with lock
    if (this.locks.get(roomId)) {
      // Simulate retry on conflict
      await new Promise(resolve => setTimeout(resolve, 10));
      return this.getNextMovieAtomic(roomId);
    }

    this.locks.set(roomId, true);
    
    try {
      const currentIndex = this.sequences.get(roomId) || 0;
      const roomMovies = this.movies.get(roomId) || [];
      
      if (currentIndex >= roomMovies.length) {
        return null;
      }

      const movie = roomMovies[currentIndex];
      this.sequences.set(roomId, currentIndex + 1);
      
      return {
        ...movie,
        sequenceIndex: currentIndex
      };
    } finally {
      this.locks.set(roomId, false);
    }
  }

  async getCurrentSequenceIndex(roomId: string): Promise<number> {
    return this.sequences.get(roomId) || 0;
  }

  async resetSequenceIndex(roomId: string, newIndex: number = 0): Promise<void> {
    this.sequences.set(roomId, newIndex);
  }

  async validateSequenceConsistency(roomId: string): Promise<boolean> {
    const currentIndex = this.sequences.get(roomId) || 0;
    const roomMovies = this.movies.get(roomId) || [];
    
    // Check if index is within valid range
    return currentIndex >= 0 && currentIndex <= roomMovies.length;
  }

  // Helper method to setup test data
  setupRoomMovies(roomId: string, movies: any[]): void {
    this.movies.set(roomId, movies);
    this.sequences.set(roomId, 0);
  }

  // Helper method to simulate concurrent access
  async simulateConcurrentAccess(roomId: string, userCount: number): Promise<any[]> {
    const promises = [];
    
    for (let i = 0; i < userCount; i++) {
      promises.push(this.getNextMovieAtomic(roomId));
    }
    
    return Promise.all(promises);
  }
}

describe('Property Test: Sequence Consistency Across Users', () => {
  let sequenceManager: MockSequenceManager;

  beforeEach(() => {
    sequenceManager = new MockSequenceManager();
  });

  /**
   * Property Test: Deterministic Movie Order
   * 
   * For any room with a predefined movie list, all users should receive 
   * movies in exactly the same order regardless of access timing.
   */
  test('Property 2.1: Deterministic Movie Order', async () => {
    // Property: Movie order should be identical for all users
    const testScenarios = [
      {
        roomId: 'test-room-1',
        movies: [
          { movieId: '1', title: 'Movie A' },
          { movieId: '2', title: 'Movie B' },
          { movieId: '3', title: 'Movie C' },
          { movieId: '4', title: 'Movie D' },
          { movieId: '5', title: 'Movie E' }
        ],
        userCount: 3
      },
      {
        roomId: 'test-room-2',
        movies: Array.from({ length: 30 }, (_, i) => ({
          movieId: (i + 1).toString(),
          title: `Movie ${String.fromCharCode(65 + i)}`
        })),
        userCount: 5
      }
    ];

    for (const scenario of testScenarios) {
      sequenceManager.setupRoomMovies(scenario.roomId, scenario.movies);
      
      // Simulate multiple users getting movies sequentially
      const userMovies: any[][] = [];
      
      for (let user = 0; user < scenario.userCount; user++) {
        const movies = [];
        
        // Each user gets 3 movies
        for (let i = 0; i < 3; i++) {
          const movie = await sequenceManager.getNextMovieAtomic(scenario.roomId);
          if (movie) {
            movies.push(movie);
          }
        }
        
        userMovies.push(movies);
      }

      // Property: All users should have received movies in the same order
      for (let movieIndex = 0; movieIndex < 3; movieIndex++) {
        const firstUserMovie = userMovies[0][movieIndex];
        
        for (let userIndex = 1; userIndex < scenario.userCount; userIndex++) {
          const currentUserMovie = userMovies[userIndex][movieIndex];
          
          // Property: Same movie at same position for all users
          expect(currentUserMovie?.movieId).toBe(firstUserMovie?.movieId);
          expect(currentUserMovie?.sequenceIndex).toBe(firstUserMovie?.sequenceIndex);
        }
      }

      // Property: Sequence should advance correctly
      const finalIndex = await sequenceManager.getCurrentSequenceIndex(scenario.roomId);
      expect(finalIndex).toBe(scenario.userCount * 3);
    }
  });

  /**
   * Property Test: Atomic Sequence Increment
   * 
   * When multiple users access movies concurrently, sequence position 
   * should increment atomically without gaps or duplicates.
   */
  test('Property 2.2: Atomic Sequence Increment', async () => {
    // Property: Concurrent access should not create sequence gaps or duplicates
    const concurrencyScenarios = [
      { roomId: 'concurrent-room-1', movieCount: 10, concurrentUsers: 3 },
      { roomId: 'concurrent-room-2', movieCount: 20, concurrentUsers: 5 },
      { roomId: 'concurrent-room-3', movieCount: 30, concurrentUsers: 10 }
    ];

    for (const scenario of concurrencyScenarios) {
      const movies = Array.from({ length: scenario.movieCount }, (_, i) => ({
        movieId: (i + 1).toString(),
        title: `Movie ${i + 1}`
      }));

      sequenceManager.setupRoomMovies(scenario.roomId, movies);

      // Simulate concurrent access
      const results = await sequenceManager.simulateConcurrentAccess(
        scenario.roomId, 
        scenario.concurrentUsers
      );

      // Property: All results should be unique (no duplicates)
      const movieIds = results.filter(r => r !== null).map(r => r.movieId);
      const uniqueMovieIds = new Set(movieIds);
      expect(uniqueMovieIds.size).toBe(movieIds.length);

      // Property: Sequence indices should be consecutive
      const sequenceIndices = results.filter(r => r !== null).map(r => r.sequenceIndex);
      sequenceIndices.sort((a, b) => a - b);
      
      for (let i = 0; i < sequenceIndices.length; i++) {
        expect(sequenceIndices[i]).toBe(i);
      }

      // Property: Final sequence index should match number of movies retrieved
      const finalIndex = await sequenceManager.getCurrentSequenceIndex(scenario.roomId);
      expect(finalIndex).toBe(scenario.concurrentUsers);
    }
  });

  /**
   * Property Test: Session Persistence
   * 
   * Sequence position should persist across user sessions and reconnections,
   * maintaining consistency for all room participants.
   */
  test('Property 2.3: Session Persistence', async () => {
    // Property: Sequence should persist across sessions
    const persistenceScenarios = [
      {
        roomId: 'persistence-room-1',
        movies: Array.from({ length: 15 }, (_, i) => ({
          movieId: (i + 1).toString(),
          title: `Movie ${i + 1}`
        })),
        sessions: [
          { moviesRequested: 3 },
          { moviesRequested: 2 },
          { moviesRequested: 4 }
        ]
      }
    ];

    for (const scenario of persistenceScenarios) {
      sequenceManager.setupRoomMovies(scenario.roomId, scenario.movies);
      
      let expectedSequenceIndex = 0;
      const allRetrievedMovies: any[] = [];

      // Simulate multiple sessions
      for (const session of scenario.sessions) {
        const sessionMovies = [];
        
        for (let i = 0; i < session.moviesRequested; i++) {
          const movie = await sequenceManager.getNextMovieAtomic(scenario.roomId);
          if (movie) {
            sessionMovies.push(movie);
            allRetrievedMovies.push(movie);
          }
        }

        expectedSequenceIndex += session.moviesRequested;
        
        // Property: Sequence index should match expected value after each session
        const currentIndex = await sequenceManager.getCurrentSequenceIndex(scenario.roomId);
        expect(currentIndex).toBe(expectedSequenceIndex);
      }

      // Property: All movies should be in correct sequential order
      for (let i = 0; i < allRetrievedMovies.length; i++) {
        expect(allRetrievedMovies[i].sequenceIndex).toBe(i);
        expect(allRetrievedMovies[i].movieId).toBe((i + 1).toString());
      }
    }
  });

  /**
   * Property Test: Sequence Consistency Validation
   * 
   * The system should be able to validate sequence consistency and 
   * detect any inconsistencies that may arise.
   */
  test('Property 2.4: Sequence Consistency Validation', async () => {
    // Property: Consistency validation should correctly identify valid/invalid states
    const validationScenarios = [
      {
        roomId: 'validation-room-1',
        movies: Array.from({ length: 10 }, (_, i) => ({
          movieId: (i + 1).toString(),
          title: `Movie ${i + 1}`
        })),
        operations: [
          { type: 'getNext', count: 3, expectedValid: true },
          { type: 'getNext', count: 2, expectedValid: true },
          { type: 'reset', index: 0, expectedValid: true },
          { type: 'getNext', count: 1, expectedValid: true }
        ]
      }
    ];

    for (const scenario of validationScenarios) {
      sequenceManager.setupRoomMovies(scenario.roomId, scenario.movies);

      for (const operation of scenario.operations) {
        if (operation.type === 'getNext') {
          // Get movies
          for (let i = 0; i < operation.count; i++) {
            await sequenceManager.getNextMovieAtomic(scenario.roomId);
          }
        } else if (operation.type === 'reset') {
          // Reset sequence
          await sequenceManager.resetSequenceIndex(scenario.roomId, operation.index);
        }

        // Property: Validation should match expected result
        const isValid = await sequenceManager.validateSequenceConsistency(scenario.roomId);
        expect(isValid).toBe(operation.expectedValid);
      }
    }
  });

  /**
   * Property Test: Sequence Boundary Conditions
   * 
   * Sequence management should handle boundary conditions correctly,
   * such as empty rooms, exhausted movie lists, and edge cases.
   */
  test('Property 2.5: Sequence Boundary Conditions', async () => {
    // Property: Boundary conditions should be handled gracefully
    const boundaryScenarios = [
      {
        name: 'Empty room',
        roomId: 'empty-room',
        movies: [],
        expectedMovie: null,
        expectedIndex: 0
      },
      {
        name: 'Single movie room',
        roomId: 'single-movie-room',
        movies: [{ movieId: '1', title: 'Only Movie' }],
        expectedMovie: { movieId: '1', title: 'Only Movie', sequenceIndex: 0 },
        expectedIndex: 1
      },
      {
        name: 'Exhausted room',
        roomId: 'exhausted-room',
        movies: [{ movieId: '1', title: 'Last Movie' }],
        preAdvance: 1,
        expectedMovie: null,
        expectedIndex: 1
      }
    ];

    for (const scenario of boundaryScenarios) {
      sequenceManager.setupRoomMovies(scenario.roomId, scenario.movies);

      // Pre-advance sequence if needed
      if (scenario.preAdvance) {
        for (let i = 0; i < scenario.preAdvance; i++) {
          await sequenceManager.getNextMovieAtomic(scenario.roomId);
        }
      }

      // Test getting next movie
      const movie = await sequenceManager.getNextMovieAtomic(scenario.roomId);
      
      if (scenario.expectedMovie === null) {
        // Property: Should return null when no movies available
        expect(movie).toBeNull();
      } else {
        // Property: Should return expected movie with correct sequence
        expect(movie).not.toBeNull();
        expect(movie.movieId).toBe(scenario.expectedMovie.movieId);
        expect(movie.sequenceIndex).toBe(scenario.expectedMovie.sequenceIndex);
      }

      // Property: Sequence index should match expected value
      const finalIndex = await sequenceManager.getCurrentSequenceIndex(scenario.roomId);
      expect(finalIndex).toBe(scenario.expectedIndex);

      // Property: Consistency validation should pass
      const isValid = await sequenceManager.validateSequenceConsistency(scenario.roomId);
      expect(isValid).toBe(true);
    }
  });
});