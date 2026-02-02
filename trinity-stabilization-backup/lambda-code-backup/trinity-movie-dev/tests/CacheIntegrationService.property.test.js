const fc = require('fast-check');
const CacheIntegrationService = require('../services/CacheIntegrationService');

/**
 * Property-based tests for CacheIntegrationService
 * Tests integration with cache system and match detection logic
 */

describe('CacheIntegrationService Property Tests', () => {
  let service;

  beforeEach(() => {
    service = new CacheIntegrationService();
    
    // Mock environment variables
    process.env.AWS_REGION = 'eu-west-1';
    process.env.ROOMS_TABLE = 'trinity-rooms-dev-v2';
    process.env.VOTES_TABLE = 'trinity-votes-dev';
    process.env.TMDB_API_KEY = 'test-api-key';
  });

  /**
   * Property 3: Match Detection Based on Room Capacity
   * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9
   */
  describe('Property 3: Match Detection Based on Room Capacity', () => {
    test('should detect matches when enough users vote YES for the same movie', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            roomCapacity: fc.integer({ min: 2, max: 10 }),
            movieId: fc.string({ minLength: 1, maxLength: 20 }),
            voteCount: fc.integer({ min: 1, max: 15 })
          }),
          async ({ roomId, roomCapacity, movieId, voteCount }) => {
            // Mock room info
            service.getRoomInfo = jest.fn().mockResolvedValue({
              id: roomId,
              capacity: roomCapacity,
              status: 'ACTIVE',
              maxMembers: roomCapacity
            });

            // Mock vote checking
            const hasMatch = voteCount >= roomCapacity;
            service.checkCurrentVotesForMatch = jest.fn().mockResolvedValue({
              hasMatch,
              matchedMovie: hasMatch ? {
                id: movieId,
                title: `Movie ${movieId}`,
                overview: 'Test movie'
              } : null,
              voteCount,
              requiredVotes: roomCapacity
            });

            // Mock room status update
            service.updateRoomMatchStatus = jest.fn().mockResolvedValue();

            const result = await service.checkMatchBeforeAction(roomId, 'user1', { type: 'VOTE' });

            // Property: Match should be detected if and only if vote count >= room capacity
            if (voteCount >= roomCapacity) {
              expect(result.isMatch).toBe(true);
              expect(result.matchedMovie).toBeDefined();
              expect(result.matchedMovie.id).toBe(movieId);
              expect(result.message).toContain('Match encontrado');
              expect(result.canClose).toBe(true);
            } else {
              expect(result.isMatch).toBe(false);
              expect(result.matchedMovie).toBeUndefined();
            }

            // Property: Room ID should always be preserved
            expect(result.roomId).toBe(roomId);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should handle different room capacities correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            capacities: fc.array(fc.integer({ min: 2, max: 8 }), { minLength: 1, maxLength: 5 }),
            movieVotes: fc.dictionary(
              fc.string({ minLength: 1, maxLength: 10 }), // movieId
              fc.integer({ min: 0, max: 10 }) // vote count
            )
          }),
          async ({ roomId, capacities, movieVotes }) => {
            for (const capacity of capacities) {
              // Mock room info with current capacity
              service.getRoomInfo = jest.fn().mockResolvedValue({
                id: roomId,
                capacity: capacity,
                status: 'ACTIVE'
              });

              // Find if any movie has enough votes
              const matchedMovies = Object.entries(movieVotes)
                .filter(([_, votes]) => votes >= capacity);

              const hasAnyMatch = matchedMovies.length > 0;
              const firstMatch = hasAnyMatch ? matchedMovies[0] : null;

              service.checkCurrentVotesForMatch = jest.fn().mockResolvedValue({
                hasMatch: hasAnyMatch,
                matchedMovie: firstMatch ? {
                  id: firstMatch[0],
                  title: `Movie ${firstMatch[0]}`,
                  overview: 'Test movie'
                } : null,
                voteCount: firstMatch ? firstMatch[1] : 0,
                requiredVotes: capacity
              });

              service.updateRoomMatchStatus = jest.fn().mockResolvedValue();

              const result = await service.checkMatchBeforeAction(roomId, 'user1', { type: 'VOTE' });

              // Property: Match detection should be consistent with capacity requirements
              expect(result.isMatch).toBe(hasAnyMatch);
              
              if (hasAnyMatch) {
                expect(result.matchedMovie).toBeDefined();
                expect(result.matchedMovie.id).toBe(firstMatch[0]);
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    test('should preserve existing matches when room is already matched', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            existingMovieId: fc.string({ minLength: 1, maxLength: 20 }),
            userId: fc.string({ minLength: 1, maxLength: 30 }),
            actionType: fc.constantFrom('VOTE', 'NAVIGATE', 'REFRESH', 'JOIN')
          }),
          async ({ roomId, existingMovieId, userId, actionType }) => {
            // Mock room that already has a match
            service.getRoomInfo = jest.fn().mockResolvedValue({
              id: roomId,
              status: 'MATCHED',
              resultMovieId: existingMovieId,
              capacity: 2
            });

            // Mock movie details
            service.getMovieDetails = jest.fn().mockResolvedValue({
              id: existingMovieId,
              title: `Matched Movie ${existingMovieId}`,
              overview: 'Previously matched movie',
              poster: null,
              vote_average: 7.5,
              release_date: '2024-01-01'
            });

            const result = await service.checkMatchBeforeAction(roomId, userId, { type: actionType });

            // Property: Existing matches should always be preserved and returned
            expect(result.isMatch).toBe(true);
            expect(result.matchedMovie).toBeDefined();
            expect(result.matchedMovie.id).toBe(existingMovieId);
            expect(result.matchedMovie.isMatched).toBe(true);
            expect(result.matchedMovie.roomStatus).toBe('MATCHED');
            expect(result.message).toContain('Match encontrado');
            expect(result.canClose).toBe(true);
            expect(result.roomId).toBe(roomId);

            // Property: Should not call vote checking for already matched rooms
            expect(service.checkCurrentVotesForMatch).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should handle match detection on every user action type', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            userId: fc.string({ minLength: 1, maxLength: 30 }),
            actions: fc.array(
              fc.record({
                type: fc.constantFrom('VOTE', 'NAVIGATE', 'REFRESH', 'JOIN', 'SKIP'),
                movieId: fc.option(fc.string({ minLength: 1, maxLength: 20 }))
              }),
              { minLength: 1, maxLength: 10 }
            )
          }),
          async ({ roomId, userId, actions }) => {
            // Mock active room without existing match
            service.getRoomInfo = jest.fn().mockResolvedValue({
              id: roomId,
              status: 'ACTIVE',
              capacity: 3
            });

            // Mock no current matches
            service.checkCurrentVotesForMatch = jest.fn().mockResolvedValue({
              hasMatch: false
            });

            for (const action of actions) {
              const result = await service.checkMatchBeforeAction(roomId, userId, action);

              // Property: Match detection should work for all action types
              expect(result).toBeDefined();
              expect(result.roomId).toBe(roomId);
              expect(typeof result.isMatch).toBe('boolean');

              // Property: Should always call room info check
              expect(service.getRoomInfo).toHaveBeenCalledWith(roomId);

              // Property: For active rooms, should check votes
              if (result.isMatch === false) {
                expect(service.checkCurrentVotesForMatch).toHaveBeenCalledWith(roomId, 3);
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property: Cache Integration Consistency
   * Validates seamless fallback between cache and legacy systems
   */
  describe('Property: Cache Integration Consistency', () => {
    test('should provide consistent movie format regardless of source', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            hasCacheActive: fc.boolean(),
            movieData: fc.record({
              movieId: fc.string({ minLength: 1, maxLength: 20 }),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              overview: fc.string({ minLength: 1, maxLength: 500 }),
              voteAverage: fc.float({ min: 0, max: 10 }),
              releaseDate: fc.date().map(d => d.toISOString().split('T')[0])
            })
          }),
          async ({ roomId, hasCacheActive, movieData }) => {
            // Mock cache status
            service.checkRoomCacheStatus = jest.fn().mockResolvedValue({
              isActive: hasCacheActive,
              currentIndex: 0,
              hasMetadata: hasCacheActive
            });

            if (hasCacheActive) {
              // Mock cache response
              service.getNextMovieFromCache = jest.fn().mockResolvedValue({
                id: movieData.movieId,
                title: movieData.title,
                poster: `https://image.tmdb.org/t/p/w500/poster.jpg`,
                overview: movieData.overview,
                vote_average: movieData.voteAverage,
                release_date: movieData.releaseDate
              });
            }

            const result = await service.getMoviesForRoom(roomId, 'action', 1);

            if (hasCacheActive) {
              // Property: Cache results should have consistent format
              expect(result).toBeDefined();
              expect(result.id).toBe(movieData.movieId);
              expect(result.title).toBe(movieData.title);
              expect(result.overview).toBe(movieData.overview);
              expect(typeof result.vote_average).toBe('number');
              expect(typeof result.release_date).toBe('string');
            } else {
              // Property: Should return null to signal legacy system usage
              expect(result).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should handle cache errors gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 50 }),
            errorType: fc.constantFrom('NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE', 'LAMBDA_ERROR')
          }),
          async ({ roomId, errorType }) => {
            // Mock cache status check that fails
            const error = new Error(`Cache error: ${errorType}`);
            service.checkRoomCacheStatus = jest.fn().mockRejectedValue(error);

            const result = await service.getMoviesForRoom(roomId, 'comedy', 1);

            // Property: Cache errors should result in graceful fallback
            expect(result).toBeNull(); // Signal to use legacy system
            
            // Property: Should not throw errors
            expect(service.checkRoomCacheStatus).toHaveBeenCalledWith(roomId);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property: Movie Format Conversion Consistency
   */
  describe('Property: Movie Format Conversion', () => {
    test('should convert cache format to legacy format consistently', () => {
      fc.assert(
        fc.property(
          fc.record({
            movieId: fc.string({ minLength: 1, maxLength: 20 }),
            title: fc.string({ minLength: 1, maxLength: 100 }),
            overview: fc.string({ minLength: 0, maxLength: 500 }),
            posterPath: fc.option(fc.webUrl()),
            voteAverage: fc.float({ min: 0, max: 10 }),
            releaseDate: fc.date().map(d => d.toISOString().split('T')[0]),
            mediaType: fc.constantFrom('MOVIE', 'TV')
          }),
          (cacheMovie) => {
            const converted = service.convertCacheMovieToLegacyFormat(cacheMovie);

            // Property: All required fields should be present
            expect(converted.id).toBe(cacheMovie.movieId);
            expect(converted.title).toBe(cacheMovie.title);
            expect(converted.overview).toBe(cacheMovie.overview || 'Descripción no disponible');
            expect(converted.vote_average).toBe(cacheMovie.voteAverage || 0);
            expect(converted.release_date).toBe(cacheMovie.releaseDate || '');

            // Property: Poster should have fallback
            if (cacheMovie.posterPath) {
              expect(converted.poster).toBe(cacheMovie.posterPath);
            } else {
              expect(converted.poster).toBe('https://via.placeholder.com/500x750?text=Sin+Poster');
            }

            // Property: Additional compatibility fields should be present
            expect(converted.remoteId).toBe(cacheMovie.movieId);
            expect(converted.tmdbId).toBe(parseInt(cacheMovie.movieId));
            expect(converted.mediaTitle).toBe(cacheMovie.title);
            expect(converted.mediaType).toBe(cacheMovie.mediaType);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: Genre Conversion Consistency
   */
  describe('Property: Genre Conversion', () => {
    test('should convert genre strings to filter criteria consistently', () => {
      fc.assert(
        fc.property(
          fc.record({
            genre: fc.option(fc.constantFrom(
              'action', 'adventure', 'animation', 'comedy', 'crime', 'documentary',
              'drama', 'family', 'fantasy', 'history', 'horror', 'music',
              'mystery', 'romance', 'science_fiction', 'thriller', 'war', 'western',
              'all', 'popular', 'unknown_genre'
            )),
            mediaType: fc.constantFrom('MOVIE', 'TV')
          }),
          ({ genre, mediaType }) => {
            const criteria = service.convertGenreToFilterCriteria(genre, mediaType);

            // Property: Media type should always be preserved
            expect(criteria.mediaType).toBe(mediaType);

            // Property: Genre IDs should be array
            expect(Array.isArray(criteria.genreIds)).toBe(true);

            // Property: Valid genres should produce genre IDs
            const validGenres = [
              'action', 'adventure', 'animation', 'comedy', 'crime', 'documentary',
              'drama', 'family', 'fantasy', 'history', 'horror', 'music',
              'mystery', 'romance', 'science_fiction', 'thriller', 'war', 'western'
            ];

            if (genre && validGenres.includes(genre.toLowerCase())) {
              expect(criteria.genreIds.length).toBe(1);
              expect(typeof criteria.genreIds[0]).toBe('number');
              expect(criteria.genreIds[0]).toBeGreaterThan(0);
            } else {
              // Property: Invalid/empty genres should produce empty array
              expect(criteria.genreIds.length).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});