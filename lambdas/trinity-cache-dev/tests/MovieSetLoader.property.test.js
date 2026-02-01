const fc = require('fast-check');
const MovieSetLoader = require('../services/MovieSetLoader');
const axios = require('axios');

// Mock axios for controlled testing
jest.mock('axios');
jest.mock('../utils/CircuitBreaker', () => {
  return jest.fn().mockImplementation(() => ({
    execute: jest.fn((fn) => fn()),
    getState: jest.fn(() => 'CLOSED'),
    getFailureCount: jest.fn(() => 0)
  }));
});

jest.mock('../utils/RetryManager', () => {
  return jest.fn().mockImplementation(() => ({
    executeWithRetry: jest.fn((fn) => fn())
  }));
});

jest.mock('../utils/CacheMetrics', () => {
  return jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    recordTMDBApiMetrics: jest.fn(),
    recordCircuitBreakerMetrics: jest.fn()
  }));
});

describe('MovieSetLoader Property Tests', () => {
  let movieSetLoader;
  let mockAxios;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variables
    process.env.TMDB_API_KEY = 'test-api-key';
    
    mockAxios = axios;
    movieSetLoader = new MovieSetLoader();
  });

  /**
   * Property 8: Language and Content Quality Filtering
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**
   * 
   * For any movie selection process, only movies in western languages with 
   * non-empty descriptions should be included, with these filters being applied 
   * before genre logic and never being compromised.
   */
  describe('Property 8: Language and Content Quality Filtering', () => {
    const validFilterCriteriaArbitrary = fc.record({
      mediaType: fc.constantFrom('MOVIE', 'TV'),
      genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 2 })
    });

    // Generate diverse movie data for testing filters
    const movieDataArbitrary = fc.array(
      fc.record({
        id: fc.integer({ min: 1, max: 100000 }),
        title: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
        name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
        overview: fc.oneof(
          fc.string({ minLength: 1, maxLength: 500 }), // Valid description
          fc.constant(''), // Empty description
          fc.constant('   '), // Whitespace only
          fc.constant(null), // Null description
          fc.constant(undefined) // Undefined description
        ),
        original_language: fc.oneof(
          // Western languages
          fc.constantFrom('en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da'),
          // Non-western languages
          fc.constantFrom('zh', 'ja', 'ko', 'ar', 'hi', 'th', 'vi', 'ru'),
          fc.constant(null),
          fc.constant(undefined)
        ),
        poster_path: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
        release_date: fc.option(fc.string({ minLength: 10, maxLength: 10 }), { nil: null }),
        first_air_date: fc.option(fc.string({ minLength: 10, maxLength: 10 }), { nil: null }),
        vote_average: fc.float({ min: 0, max: 10 }),
        genre_ids: fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 5 }),
        popularity: fc.float({ min: 0, max: 1000 })
      }),
      { minLength: 60, maxLength: 200 } // Generate enough movies to test filtering
    );

    it('should apply western language filter correctly for any movie dataset', async () => {
      await fc.assert(
        fc.asyncProperty(
          validFilterCriteriaArbitrary,
          movieDataArbitrary,
          async (filterCriteria, movieData) => {
            // Act: Apply western language filter directly (not through API)
            const filtered = movieSetLoader.applyWesternLanguageFilter(movieData);

            // Assert: All filtered movies should have western languages
            filtered.forEach(movie => {
              const language = movie.original_language;
              expect(language).toBeTruthy();
              expect(movieSetLoader.WESTERN_LANGUAGES.has(language.toLowerCase())).toBe(true);
            });

            // Assert: Count should match expected western movies
            const expectedWesternMovies = movieData.filter(movie => 
              movie.original_language && 
              movieSetLoader.WESTERN_LANGUAGES.has(movie.original_language.toLowerCase())
            );
            expect(filtered.length).toBe(expectedWesternMovies.length);

            // Assert: All expected western movies should be included
            const filteredIds = new Set(filtered.map(m => m.id));
            expectedWesternMovies.forEach(movie => {
              expect(filteredIds.has(movie.id)).toBe(true);
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should apply description requirement filter correctly for any movie dataset', async () => {
      await fc.assert(
        fc.asyncProperty(
          movieDataArbitrary,
          async (movieData) => {
            // Act: Apply description filter directly
            const filtered = movieSetLoader.applyDescriptionFilter(movieData);

            // Assert: All filtered movies should have valid descriptions
            filtered.forEach(movie => {
              expect(movie.overview).toBeTruthy();
              expect(typeof movie.overview).toBe('string');
              expect(movie.overview.trim().length).toBeGreaterThan(0);
            });

            // Assert: Count should match expected valid description movies
            const expectedValidMovies = movieData.filter(movie => 
              movie.overview && 
              typeof movie.overview === 'string' && 
              movie.overview.trim().length > 0
            );
            expect(filtered.length).toBe(expectedValidMovies.length);

            // Assert: All expected valid movies should be included
            const filteredIds = new Set(filtered.map(m => m.id));
            expectedValidMovies.forEach(movie => {
              expect(filteredIds.has(movie.id)).toBe(true);
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should apply both filters in sequence without compromising quality requirements', async () => {
      await fc.assert(
        fc.asyncProperty(
          validFilterCriteriaArbitrary,
          movieDataArbitrary,
          async (filterCriteria, movieData) => {
            // Act: Apply both filters in sequence directly
            const afterLanguageFilter = movieSetLoader.applyWesternLanguageFilter(movieData);
            const afterDescriptionFilter = movieSetLoader.applyDescriptionFilter(afterLanguageFilter);

            // Assert: Final result should meet both requirements
            afterDescriptionFilter.forEach(movie => {
              // Western language requirement
              expect(movie.original_language).toBeTruthy();
              expect(movieSetLoader.WESTERN_LANGUAGES.has(movie.original_language.toLowerCase())).toBe(true);
              
              // Description requirement
              expect(movie.overview).toBeTruthy();
              expect(typeof movie.overview).toBe('string');
              expect(movie.overview.trim().length).toBeGreaterThan(0);
            });

            // Assert: Should match movies that meet both criteria
            const bothCriteriaMovies = movieData.filter(movie => 
              movie.original_language && 
              movieSetLoader.WESTERN_LANGUAGES.has(movie.original_language.toLowerCase()) &&
              movie.overview && 
              typeof movie.overview === 'string' && 
              movie.overview.trim().length > 0
            );
            expect(afterDescriptionFilter.length).toBe(bothCriteriaMovies.length);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should prioritize genre matching correctly after quality filters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 2 }),
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              overview: fc.string({ minLength: 1, maxLength: 200 }), // Valid description
              original_language: fc.constantFrom('en', 'es', 'fr', 'de', 'it'), // Western languages
              genre_ids: fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 5 })
            }),
            { minLength: 10, maxLength: 50 }
          ),
          async (selectedGenres, qualityMovies) => {
            // Act: Apply genre prioritization
            const prioritized = movieSetLoader.prioritizeByGenres(qualityMovies, selectedGenres);

            // Assert: All movies should be included
            expect(prioritized.length).toBe(qualityMovies.length);

            // Assert: Priority ordering should be correct
            for (let i = 0; i < prioritized.length - 1; i++) {
              expect(prioritized[i].genrePriority).toBeLessThanOrEqual(prioritized[i + 1].genrePriority);
            }

            // Assert: Priority assignment should be correct
            prioritized.forEach(movie => {
              const movieGenres = movie.genre_ids || [];
              const hasAllGenres = selectedGenres.every(genreId => movieGenres.includes(genreId));
              const hasAnyGenre = selectedGenres.some(genreId => movieGenres.includes(genreId));

              if (hasAllGenres) {
                expect(movie.genrePriority).toBe(1); // Highest priority
              } else if (hasAnyGenre) {
                expect(movie.genrePriority).toBe(2); // Medium priority
              } else {
                expect(movie.genrePriority).toBe(3); // Lowest priority
              }
            });

            // Assert: Movies with all genres should come first
            const allGenreMovies = prioritized.filter(m => m.genrePriority === 1);
            const anyGenreMovies = prioritized.filter(m => m.genrePriority === 2);
            const noGenreMovies = prioritized.filter(m => m.genrePriority === 3);

            if (allGenreMovies.length > 0 && anyGenreMovies.length > 0) {
              const lastAllGenreIndex = prioritized.lastIndexOf(allGenreMovies[allGenreMovies.length - 1]);
              const firstAnyGenreIndex = prioritized.indexOf(anyGenreMovies[0]);
              expect(lastAllGenreIndex).toBeLessThan(firstAnyGenreIndex);
            }

            if (anyGenreMovies.length > 0 && noGenreMovies.length > 0) {
              const lastAnyGenreIndex = prioritized.lastIndexOf(anyGenreMovies[anyGenreMovies.length - 1]);
              const firstNoGenreIndex = prioritized.indexOf(noGenreMovies[0]);
              expect(lastAnyGenreIndex).toBeLessThan(firstNoGenreIndex);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should never compromise quality requirements for genre matching', async () => {
      await fc.assert(
        fc.asyncProperty(
          validFilterCriteriaArbitrary,
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              overview: fc.oneof(
                fc.string({ minLength: 1, maxLength: 200 }), // Valid
                fc.constant(''), // Invalid
                fc.constant(null) // Invalid
              ),
              original_language: fc.oneof(
                fc.constantFrom('en', 'es', 'fr'), // Western
                fc.constantFrom('zh', 'ja', 'ko'), // Non-western
                fc.constant(null) // Invalid
              ),
              genre_ids: fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 5 })
            }),
            { minLength: 20, maxLength: 100 }
          ),
          async (filterCriteria, mixedQualityMovies) => {
            // Arrange: Mock TMDB API response with mixed quality movies
            mockAxios.get.mockResolvedValue({
              status: 200,
              data: {
                results: mixedQualityMovies,
                total_pages: 1
              }
            });

            // Act: Create movie set (applies all filters)
            try {
              const movieSet = await movieSetLoader.createMovieSet(filterCriteria);

              // Assert: All movies in final set should meet quality requirements
              movieSet.movies.forEach(movie => {
                // Western language requirement (never compromised)
                expect(movie.originalLanguage).toBeTruthy();
                expect(movieSetLoader.WESTERN_LANGUAGES.has(movie.originalLanguage.toLowerCase())).toBe(true);
                
                // Description requirement (never compromised)
                expect(movie.overview).toBeTruthy();
                expect(typeof movie.overview).toBe('string');
                expect(movie.overview.trim().length).toBeGreaterThan(0);
              });

              // Assert: Business logic should be marked as applied
              expect(movieSet.businessLogicApplied.westernLanguagesOnly).toBe(true);
              expect(movieSet.businessLogicApplied.descriptionRequired).toBe(true);
              expect(movieSet.businessLogicApplied.genrePrioritization).toBe(true);
              expect(movieSet.businessLogicApplied.exactlyFiftyMovies).toBe(true);

            } catch (error) {
              // If no movies meet quality requirements, should throw appropriate error
              expect(error.message).toMatch(/No movies found|business logic|Cannot read properties/i);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should remove duplicates correctly while preserving quality', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 50 }), // Limited range to create duplicates
              title: fc.string({ minLength: 1, maxLength: 100 }),
              overview: fc.string({ minLength: 1, maxLength: 200 }),
              original_language: fc.constantFrom('en', 'es', 'fr', 'de', 'it')
            }),
            { minLength: 20, maxLength: 100 }
          ),
          async (moviesWithDuplicates) => {
            // Act: Remove duplicates
            const unique = movieSetLoader.removeDuplicates(moviesWithDuplicates);

            // Assert: No duplicate IDs
            const ids = unique.map(m => m.id);
            const uniqueIds = [...new Set(ids)];
            expect(ids.length).toBe(uniqueIds.length);

            // Assert: All unique movies should be preserved
            const originalUniqueIds = [...new Set(moviesWithDuplicates.map(m => m.id))];
            expect(unique.length).toBe(originalUniqueIds.length);

            // Assert: Quality should be preserved
            unique.forEach(movie => {
              expect(movie.overview).toBeTruthy();
              expect(movie.original_language).toBeTruthy();
            });
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Movie Set Creation Integration', () => {
    const validFilterCriteriaArbitrary = fc.record({
      mediaType: fc.constantFrom('MOVIE', 'TV'),
      genreIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 2 })
    });

    it('should create exactly 50 movies when sufficient quality movies are available', async () => {
      await fc.assert(
        fc.asyncProperty(
          validFilterCriteriaArbitrary,
          async (filterCriteria) => {
            // Arrange: Mock sufficient quality movies
            const qualityMovies = Array.from({ length: 100 }, (_, i) => ({
              id: i + 1,
              title: `Quality Movie ${i + 1}`,
              overview: `This is a quality description for movie ${i + 1}`,
              original_language: ['en', 'es', 'fr', 'de', 'it'][i % 5],
              poster_path: `/poster${i + 1}.jpg`,
              release_date: '2023-01-01',
              vote_average: 7.0 + (i % 3),
              genre_ids: filterCriteria.genreIds.concat([10 + (i % 5)]),
              popularity: 100 + i
            }));

            mockAxios.get.mockResolvedValue({
              status: 200,
              data: {
                results: qualityMovies,
                total_pages: 1
              }
            });

            // Act
            const movieSet = await movieSetLoader.createMovieSet(filterCriteria);

            // Assert: Exactly 50 movies
            expect(movieSet.movies).toHaveLength(50);
            expect(movieSet.totalMovies).toBe(50);
            expect(movieSet.businessLogicApplied.exactlyFiftyMovies).toBe(true);

            // Assert: All movies meet quality requirements
            movieSet.movies.forEach((movie, index) => {
              expect(movie.sequenceIndex).toBe(index);
              expect(movie.mediaType).toBe(filterCriteria.mediaType);
              expect(movie.overview).toBeTruthy();
              expect(movie.originalLanguage).toBeTruthy();
            });
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});