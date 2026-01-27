import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fc from 'fast-check';
import { MediaService } from './media.service';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import { TMDBService } from '../../infrastructure/tmdb/tmdb.service';
import {
  CircuitBreakerService,
  CircuitState,
} from '../../infrastructure/circuit-breaker/circuit-breaker.service';
import { MediaItem } from '../../domain/entities/media.entity';

// Mock services
const mockMultiTableService = {
  cacheMovie: jest.fn(),
  getCachedMovie: jest.fn(),
  searchCachedMovies: jest.fn(),
  putItem: jest.fn(),
  getItem: jest.fn(),
  query: jest.fn(),
  batchWrite: jest.fn(),
};

const mockTMDBService = {
  initialize: jest.fn(),
  discoverContent: jest.fn(),
  getMovieDetails: jest.fn(),
  getPopularMovies: jest.fn(),
  searchMovies: jest.fn(),
  convertToMediaItem: jest.fn(),
  healthCheck: jest.fn(),
};

const mockCircuitBreakerService = {
  execute: jest.fn(),
  getCircuitStats: jest.fn(),
  resetCircuit: jest.fn(),
};

describe('MediaService Property Tests', () => {
  let service: MediaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        {
          provide: MultiTableService,
          useValue: mockMultiTableService,
        },
        {
          provide: TMDBService,
          useValue: mockTMDBService,
        },
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreakerService,
        },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  /**
   * **Feature: trinity-mvp, Property 7: Integración TMDB con fallback**
   * **Valida: Requisitos 4.1, 4.2, 4.3, 4.4, 4.5**
   *
   * Para cualquier solicitud de contenido, el sistema debe intentar la API TMDB primero,
   * cachear resultados exitosos, y recurrir a la base de datos sombra cuando TMDB no esté disponible,
   * siempre respetando filtros aplicados
   */
  describe('Property 7: TMDB integration with fallback', () => {
    it('should attempt TMDB API first and cache successful results', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            filters: fc.record({
              genres: fc.option(
                fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
                  maxLength: 3,
                }),
              ),
              releaseYearFrom: fc.option(fc.integer({ min: 1900, max: 2030 })),
              releaseYearTo: fc.option(fc.integer({ min: 1900, max: 2030 })),
              minRating: fc.option(fc.float({ min: 0, max: 10 })),
              contentTypes: fc.option(
                fc.array(fc.constantFrom('movie', 'tv'), { maxLength: 2 }),
              ),
            }),
            tmdbResults: fc.array(
              fc.record({
                tmdbId: fc.string({ minLength: 1, maxLength: 10 }),
                title: fc.string({ minLength: 1, maxLength: 100 }),
                overview: fc.string({ minLength: 0, maxLength: 500 }),
                posterPath: fc.string({ minLength: 0, maxLength: 200 }),
                releaseDate: fc
                  .date({
                    min: new Date('1900-01-01'),
                    max: new Date('2030-12-31'),
                  })
                  .map((d) => d.toISOString().split('T')[0]),
                popularity: fc.float({ min: 0, max: 1000 }),
                voteAverage: fc.float({ min: 0, max: 10 }),
                voteCount: fc.integer({ min: 0, max: 100000 }),
                genres: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
                  maxLength: 3,
                }),
                mediaType: fc.constantFrom('movie', 'tv'),
              }),
              { minLength: 0, maxLength: 20 },
            ),
            tmdbSuccess: fc.boolean(),
          }),
          async (testData) => {
            // Mock circuit breaker to execute operation or fallback based on tmdbSuccess
            mockCircuitBreakerService.execute.mockImplementation(
              async (name, operation, fallback) => {
                if (testData.tmdbSuccess) {
                  return operation();
                } else {
                  return fallback();
                }
              },
            );

            // Mock TMDB service response
            mockTMDBService.discoverContent.mockResolvedValue(
              testData.tmdbResults,
            );

            // Mock caching
            mockMultiTableService.cacheMovie.mockResolvedValue(undefined);

            // Mock fallback (cached content)
            mockMultiTableService.searchCachedMovies.mockResolvedValue(
              testData.tmdbResults.slice(
                0,
                Math.min(5, testData.tmdbResults.length),
              ), // Simulate cached subset
            );

            // Execute the operation
            const result = await service.fetchMovies(testData.filters);

            if (testData.tmdbSuccess) {
              // Verify TMDB API was attempted
              expect(mockCircuitBreakerService.execute).toHaveBeenCalledWith(
                'tmdb-api',
                expect.any(Function),
                expect.any(Function),
              );

              // Verify results match TMDB response
              expect(result).toEqual(testData.tmdbResults);

              // Verify caching was attempted if there were results
              if (testData.tmdbResults.length > 0) {
                expect(mockMultiTableService.cacheMovie).toHaveBeenCalled();
              }
            } else {
              // Verify fallback was used
              expect(mockCircuitBreakerService.execute).toHaveBeenCalled();
              expect(
                mockMultiTableService.searchCachedMovies,
              ).toHaveBeenCalled();

              // Result should be from cache (subset of original data)
              expect(result.length).toBeLessThanOrEqual(
                testData.tmdbResults.length,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should respect applied filters in both TMDB and cached content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            filters: fc.record({
              genres: fc.option(
                fc.array(fc.constantFrom('Action', 'Comedy', 'Drama'), {
                  minLength: 1,
                  maxLength: 2,
                }),
              ),
              releaseYearFrom: fc.option(fc.integer({ min: 2000, max: 2020 })),
              releaseYearTo: fc.option(fc.integer({ min: 2021, max: 2024 })),
              minRating: fc.option(fc.float({ min: 5, max: 9 })),
            }),
            useCache: fc.boolean(),
          }),
          async (testData) => {
            const mockResults: MediaItem[] = [
              {
                tmdbId: '1',
                title: 'Action Movie 2022',
                overview: 'An action movie',
                posterPath: '/poster1.jpg',
                releaseDate: '2022-01-01',
                genres: ['Action'],
                popularity: 100,
                voteAverage: 8.5,
                voteCount: 1000,
                adult: false,
                originalLanguage: 'en',
                mediaType: 'movie',
                cachedAt: new Date(),
                isPopular: true,
              },
              {
                tmdbId: '2',
                title: 'Comedy Movie 2019',
                overview: 'A comedy movie',
                posterPath: '/poster2.jpg',
                releaseDate: '2019-01-01',
                genres: ['Comedy'],
                popularity: 80,
                voteAverage: 6.5,
                voteCount: 800,
                adult: false,
                originalLanguage: 'en',
                mediaType: 'movie',
                cachedAt: new Date(),
                isPopular: false,
              },
            ];

            mockCircuitBreakerService.execute.mockImplementation(
              async (name, operation, fallback) => {
                if (testData.useCache) {
                  return fallback();
                } else {
                  return operation();
                }
              },
            );

            mockTMDBService.discoverContent.mockResolvedValue(mockResults);
            mockMultiTableService.searchCachedMovies.mockResolvedValue(
              mockResults,
            );
            mockMultiTableService.cacheMovie.mockResolvedValue(undefined);

            const result = await service.fetchMovies(testData.filters);

            // Verify circuit breaker was called with correct parameters
            expect(mockCircuitBreakerService.execute).toHaveBeenCalledWith(
              'tmdb-api',
              expect.any(Function),
              expect.any(Function),
            );

            // Verify filters are applied regardless of source
            if (testData.filters.genres) {
              // When using TMDB, filters should be passed to discoverContent
              if (!testData.useCache) {
                expect(mockTMDBService.discoverContent).toHaveBeenCalledWith(
                  expect.objectContaining({
                    genres: testData.filters.genres,
                  }),
                );
              }
            }

            // Results should be an array
            expect(Array.isArray(result)).toBe(true);

            // Each result should have required MediaItem properties
            result.forEach((item) => {
              expect(item).toEqual(
                expect.objectContaining({
                  tmdbId: expect.any(String),
                  title: expect.any(String),
                  overview: expect.any(String),
                  posterPath: expect.any(String),
                  releaseDate: expect.any(String),
                  genres: expect.any(Array),
                  popularity: expect.any(Number),
                  voteAverage: expect.any(Number),
                  mediaType: expect.stringMatching(/^(movie|tv)$/),
                }),
              );
            });
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should handle circuit breaker states correctly and provide appropriate fallbacks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            circuitState: fc.constantFrom(
              CircuitState.CLOSED,
              CircuitState.OPEN,
              CircuitState.HALF_OPEN,
            ),
            tmdbHealthy: fc.boolean(),
            cachedItemsCount: fc.integer({ min: 0, max: 50 }),
          }),
          async (testData) => {
            // Mock circuit breaker stats
            mockCircuitBreakerService.getCircuitStats.mockReturnValue({
              state: testData.circuitState,
              failureCount: testData.tmdbHealthy ? 0 : 5,
              successCount: testData.tmdbHealthy ? 10 : 0,
              lastFailureTime: testData.tmdbHealthy ? undefined : new Date(),
            });

            // Generate mock cached items
            const cachedItems = Array.from(
              { length: testData.cachedItemsCount },
              (_, i) => ({
                tmdbId: `cached-${i}`,
                title: `Cached Movie ${i}`,
                overview: `Cached overview ${i}`,
                posterPath: `/cached-poster-${i}.jpg`,
                releaseDate: '2023-01-01',
                genres: ['Action'],
                popularity: 50 + i,
                voteAverage: 7.0,
                voteCount: 100,
                adult: false,
                originalLanguage: 'en',
                mediaType: 'movie' as const,
                cachedAt: new Date(),
                isPopular: i < 10,
              }),
            );

            // Mock circuit breaker behavior
            mockCircuitBreakerService.execute.mockImplementation(
              async (name, operation, fallback) => {
                if (
                  testData.circuitState === CircuitState.OPEN ||
                  !testData.tmdbHealthy
                ) {
                  // Circuit is open or TMDB is unhealthy, use fallback
                  return fallback();
                } else {
                  // Circuit is closed or half-open and TMDB is healthy, try operation
                  try {
                    return await operation();
                  } catch (error) {
                    return fallback();
                  }
                }
              },
            );

            // Mock TMDB responses
            if (testData.tmdbHealthy) {
              mockTMDBService.discoverContent.mockResolvedValue([
                {
                  tmdbId: 'tmdb-1',
                  title: 'Fresh TMDB Movie',
                  overview: 'Fresh from TMDB',
                  posterPath: '/fresh-poster.jpg',
                  releaseDate: '2024-01-01',
                  genres: ['Action'],
                  popularity: 200,
                  voteAverage: 8.5,
                  voteCount: 2000,
                  adult: false,
                  originalLanguage: 'en',
                  mediaType: 'movie',
                  cachedAt: new Date(),
                  isPopular: true,
                },
              ]);
            } else {
              mockTMDBService.discoverContent.mockRejectedValue(
                new Error('TMDB API Error'),
              );
            }

            // Mock cached content
            mockMultiTableService.searchCachedMovies.mockResolvedValue(
              cachedItems,
            );
            mockMultiTableService.cacheMovie.mockResolvedValue(undefined);

            // Execute the operation
            const result = await service.fetchMovies({});

            // Verify circuit breaker was used
            expect(mockCircuitBreakerService.execute).toHaveBeenCalled();

            // Verify appropriate data source was used
            if (
              testData.circuitState === CircuitState.OPEN ||
              !testData.tmdbHealthy
            ) {
              // Should use cached content
              expect(result).toEqual(cachedItems);
            } else if (testData.tmdbHealthy) {
              // Should use TMDB content and cache it
              expect(result).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    tmdbId: 'tmdb-1',
                    title: 'Fresh TMDB Movie',
                  }),
                ]),
              );

              if (result.length > 0) {
                expect(mockMultiTableService.cacheMovie).toHaveBeenCalled();
              }
            }

            // Result should always be an array
            expect(Array.isArray(result)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain cache consistency and handle cache expiration correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tmdbId: fc
              .string({ minLength: 1, maxLength: 10 })
              .filter((s) => s.trim().length > 0),
            cacheExpired: fc.boolean(),
            tmdbAvailable: fc.boolean(),
          }),
          async (testData) => {
            const now = new Date();
            const expiredDate = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago
            const validDate = new Date(now.getTime() + 23 * 60 * 60 * 1000); // 23 hours from now

            const cachedItem = {
              tmdbId: testData.tmdbId,
              title: 'Cached Movie',
              overview: 'Cached overview',
              posterPath: '/cached.jpg',
              releaseDate: '2023-01-01',
              genres: ['Action'],
              popularity: 100,
              voteAverage: 7.5,
              voteCount: 1000,
              adult: false,
              originalLanguage: 'en',
              mediaType: 'movie' as const,
              cachedAt: new Date(),
              isPopular: true,
              expiresAt: testData.cacheExpired
                ? expiredDate.toISOString()
                : validDate.toISOString(),
            };

            const freshItem = {
              ...cachedItem,
              title: 'Fresh TMDB Movie',
              overview: 'Fresh from TMDB',
              cachedAt: now,
              expiresAt: new Date(
                now.getTime() + 24 * 60 * 60 * 1000,
              ).toISOString(),
            };

            // Mock cache lookup
            mockMultiTableService.getCachedMovie.mockResolvedValue(
              testData.cacheExpired ? null : cachedItem,
            );

            // Mock TMDB response
            if (testData.tmdbAvailable) {
              const tmdbMovieResponse = {
                id: parseInt(testData.tmdbId) || 1,
                title: 'Fresh TMDB Movie',
                overview: 'Fresh from TMDB',
                poster_path: '/cached.jpg',
                release_date: '2023-01-01',
                genre_ids: [28], // Action
                popularity: 100,
                vote_average: 7.5,
                vote_count: 1000,
                adult: false,
                original_language: 'en',
              };
              mockTMDBService.getMovieDetails.mockResolvedValue(
                tmdbMovieResponse,
              );
              mockTMDBService.convertToMediaItem.mockReturnValue(freshItem);
            } else {
              mockTMDBService.getMovieDetails.mockRejectedValue(
                new Error('TMDB Error'),
              );
            }

            mockMultiTableService.cacheMovie.mockResolvedValue(undefined);

            // Mock circuit breaker
            mockCircuitBreakerService.execute.mockImplementation(
              async (name, operation, fallback) => {
                if (testData.tmdbAvailable) {
                  return operation();
                } else {
                  return fallback();
                }
              },
            );

            // Execute the operation
            const result = await service.getMovieDetails(testData.tmdbId);

            // Verify circuit breaker was used
            expect(mockCircuitBreakerService.execute).toHaveBeenCalled();

            if (testData.tmdbAvailable) {
              // Should get fresh data from TMDB
              expect(result).toEqual(freshItem);
              expect(mockMultiTableService.cacheMovie).toHaveBeenCalled(); // Should cache fresh data
            } else {
              // Should use cached data if not expired, null if expired
              if (testData.cacheExpired) {
                expect(result).toBeNull();
              } else {
                expect(result).toEqual(cachedItem);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});
