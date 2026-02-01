const fc = require('fast-check');
const RoomMovieCacheService = require('../services/RoomMovieCacheService');
const MovieSetLoader = require('../services/MovieSetLoader');
const CacheStorageManager = require('../services/CacheStorageManager');

// Mock dependencies
jest.mock('../services/MovieSetLoader');
jest.mock('../services/CacheStorageManager');
jest.mock('../utils/CacheMetrics', () => {
  return jest.fn().mockImplementation(() => ({
    createTimer: jest.fn(() => ({
      finish: jest.fn()
    })),
    log: jest.fn(),
    recordError: jest.fn()
  }));
});

describe('RoomMovieCacheService Property Tests', () => {
  let cacheService;
  let mockMovieSetLoader;
  let mockStorageManager;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock implementations
    mockMovieSetLoader = {
      createMovieSet: jest.fn()
    };
    
    mockStorageManager = {
      getCacheMetadata: jest.fn(),
      storeMovieSet: jest.fn(),
      updateCacheMetadata: jest.fn()
    };

    MovieSetLoader.mockImplementation(() => mockMovieSetLoader);
    CacheStorageManager.mockImplementation(() => mockStorageManager);

    cacheService = new RoomMovieCacheService();
  });

  /**
   * Property 1: Deterministic Cache Creation with Business Logic
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9**
   * 
   * For any room created with valid filter criteria, the cache system should 
   * pre-load exactly 50 movies matching the specific business logic: western 
   * languages only, non-empty descriptions, media type selection (movies OR series), 
   * and genre prioritization (both selected genres first, then any selected genres), 
   * all randomized within these constraints.
   */
  describe('Property 1: Deterministic Cache Creation with Business Logic', () => {
    const validFilterCriteriaArbitrary = fc.record({
      mediaType: fc.constantFrom('MOVIE', 'TV'),
      genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 2 }),
      roomCapacity: fc.integer({ min: 2, max: 10 })
    });

    const roomIdArbitrary = fc.string({ minLength: 1, maxLength: 50 });

    it('should create cache with exactly 50 movies using business logic for any valid filter criteria', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          validFilterCriteriaArbitrary,
          async (originalRoomId, filterCriteria) => {
            // Use a stable roomId for the test
            const roomId = `test-room-${Math.random().toString(36).substr(2, 9)}`;
            
            // Arrange: Mock no existing cache
            mockStorageManager.getCacheMetadata.mockResolvedValue(null);
            
            // Mock movie set creation with exactly 50 movies
            const mockMovieSet = {
              movies: Array.from({ length: 50 }, (_, index) => ({
                movieId: `movie_${index}`,
                title: `Test Movie ${index}`,
                overview: `Description for movie ${index}`,
                posterPath: `/poster_${index}.jpg`,
                releaseDate: '2023-01-01',
                voteAverage: 7.5,
                genreIds: filterCriteria.genreIds,
                originalLanguage: 'en', // Western language
                mediaType: filterCriteria.mediaType,
                priority: 1,
                sequenceIndex: index
              })),
              filterCriteria,
              createdAt: new Date().toISOString(),
              totalMovies: 50,
              businessLogicApplied: {
                westernLanguagesOnly: true,
                descriptionRequired: true,
                genrePrioritization: true,
                exactlyFiftyMovies: true
              }
            };
            
            mockMovieSetLoader.createMovieSet.mockResolvedValue(mockMovieSet);
            mockStorageManager.storeMovieSet.mockResolvedValue();
            mockStorageManager.updateCacheMetadata.mockResolvedValue();

            // Act
            const result = await cacheService.createRoomCache(roomId, filterCriteria);

            // Assert: Business Logic Requirements
            expect(result.success).toBe(true);
            expect(result.movieCount).toBe(50); // Requirement 1.1: exactly 50 movies
            
            // Verify MovieSetLoader was called with correct criteria
            expect(mockMovieSetLoader.createMovieSet).toHaveBeenCalledWith(filterCriteria);
            
            // Verify storage operations
            expect(mockStorageManager.storeMovieSet).toHaveBeenCalledWith(
              roomId, 
              mockMovieSet, 
              expect.any(Number) // TTL
            );
            
            // Verify metadata creation with business logic tracking
            expect(mockStorageManager.updateCacheMetadata).toHaveBeenCalledWith(
              roomId,
              expect.objectContaining({
                totalMovies: 50,
                businessLogicApplied: expect.objectContaining({
                  westernLanguagesOnly: true,
                  descriptionRequired: true,
                  genrePrioritization: true,
                  exactlyFiftyMovies: true
                }),
                filterCriteria: expect.objectContaining({
                  mediaType: filterCriteria.mediaType,
                  genreIds: filterCriteria.genreIds
                })
              })
            );
          }
        ),
        { numRuns: 100 } // Run 100 iterations for comprehensive testing
      );
    });

    it('should validate filter criteria according to business requirements', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          fc.record({
            mediaType: fc.option(fc.constantFrom('MOVIE', 'TV', 'INVALID'), { nil: null }),
            genreIds: fc.option(
              fc.oneof(
                fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 5 }),
                fc.constant('invalid'),
                fc.constant(null)
              ),
              { nil: null }
            ),
            roomCapacity: fc.option(fc.integer({ min: -5, max: 15 }), { nil: null })
          }),
          async (roomId, invalidCriteria) => {
            // Skip valid cases (tested above)
            const isValid = 
              invalidCriteria.mediaType && ['MOVIE', 'TV'].includes(invalidCriteria.mediaType) &&
              Array.isArray(invalidCriteria.genreIds) && 
              invalidCriteria.genreIds.length >= 1 && 
              invalidCriteria.genreIds.length <= 2 &&
              invalidCriteria.genreIds.every(id => typeof id === 'number' && id > 0) &&
              (!invalidCriteria.roomCapacity || (typeof invalidCriteria.roomCapacity === 'number' && invalidCriteria.roomCapacity >= 2));
            
            if (isValid) return; // Skip valid cases
            
            // Act & Assert: Should throw validation error
            await expect(cacheService.createRoomCache(roomId, invalidCriteria))
              .rejects.toThrow();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle existing cache gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArbitrary,
          validFilterCriteriaArbitrary,
          async (originalRoomId, filterCriteria) => {
            // Use a stable roomId for the test
            const roomId = `test-room-${Math.random().toString(36).substr(2, 9)}`;
            
            // Arrange: Mock existing active cache
            const existingMetadata = {
              roomId,
              status: 'ACTIVE',
              totalMovies: 50,
              filterCriteria
            };
            mockStorageManager.getCacheMetadata.mockResolvedValue(existingMetadata);

            // Act
            const result = await cacheService.createRoomCache(roomId, filterCriteria);

            // Assert
            expect(result.success).toBe(true);
            expect(result.message).toBe('Cache already exists');
            expect(result.metadata).toEqual(existingMetadata);
            
            // Verify no new cache creation
            expect(mockMovieSetLoader.createMovieSet).not.toHaveBeenCalled();
            expect(mockStorageManager.storeMovieSet).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Business Logic Validation Methods', () => {
    it('should correctly identify western languages', () => {
      fc.assert(
        fc.property(
          fc.record({
            originalLanguage: fc.constantFrom('en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'hi')
          }),
          (movie) => {
            const westernLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt'];
            const isWestern = cacheService.isWesternLanguage(movie);
            const shouldBeWestern = westernLanguages.includes(movie.originalLanguage);
            
            expect(isWestern).toBe(shouldBeWestern);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly validate descriptions', () => {
      fc.assert(
        fc.property(
          fc.record({
            overview: fc.oneof(
              fc.string({ minLength: 1, maxLength: 500 }),
              fc.constant(''),
              fc.constant('   '),
              fc.constant(null),
              fc.constant(undefined)
            )
          }),
          (movie) => {
            const hasValid = cacheService.hasValidDescription(movie);
            const shouldBeValid = movie.overview && 
                                 typeof movie.overview === 'string' && 
                                 movie.overview.trim().length > 0;
            
            expect(hasValid).toBe(shouldBeValid);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly apply genre prioritization', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              genreIds: fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 5 })
            }),
            { minLength: 1, maxLength: 20 }
          ),
          fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 2 }),
          (movies, selectedGenres) => {
            const prioritized = cacheService.applyGenrePrioritization(movies, selectedGenres);
            
            // Verify all movies are included
            expect(prioritized.length).toBe(movies.length);
            
            // Verify priority ordering
            for (let i = 0; i < prioritized.length - 1; i++) {
              expect(prioritized[i].genrePriority).toBeLessThanOrEqual(prioritized[i + 1].genrePriority);
            }
            
            // Verify priority assignment logic
            prioritized.forEach(movie => {
              const movieGenres = movie.genreIds || [];
              const hasAllGenres = selectedGenres.every(genreId => movieGenres.includes(genreId));
              const hasAnyGenre = selectedGenres.some(genreId => movieGenres.includes(genreId));
              
              if (hasAllGenres) {
                expect(movie.genrePriority).toBe(1);
              } else if (hasAnyGenre) {
                expect(movie.genrePriority).toBe(2);
              } else {
                expect(movie.genrePriority).toBe(3);
              }
            });
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});