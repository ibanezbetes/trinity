import { Test, TestingModule } from '@nestjs/testing';
import * as fc from 'fast-check';
import {
  SemanticAnalysisService,
  PreferencePattern,
  SemanticSimilarity,
} from './semantic-analysis.service';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import { MediaService } from '../media/media.service';
import { InteractionService } from '../interaction/interaction.service';
import { MediaItem } from '../../domain/entities/media.entity';
import { Vote, VoteType } from '../../domain/entities/interaction.entity';

// Mock services
const mockMultiTableService = {
  putItem: jest.fn(),
  getItem: jest.fn(),
  query: jest.fn(),
  batchWrite: jest.fn(),
  cacheMovie: jest.fn(),
  getCachedMovie: jest.fn(),
  searchCachedMovies: jest.fn(),
};

const mockMediaService = {
  fetchMovies: jest.fn(),
  getMovieDetails: jest.fn(),
  searchMovies: jest.fn(),
  getCircuitBreakerStats: jest.fn(),
};

const mockInteractionService = {
  registerVote: jest.fn(),
  getVotingProgress: jest.fn(),
  getVoteHistory: jest.fn(),
};

describe('SemanticAnalysisService Property Tests', () => {
  let service: SemanticAnalysisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SemanticAnalysisService,
        {
          provide: MultiTableService,
          useValue: mockMultiTableService,
        },
        {
          provide: MediaService,
          useValue: mockMediaService,
        },
        {
          provide: InteractionService,
          useValue: mockInteractionService,
        },
      ],
    }).compile();

    service = module.get<SemanticAnalysisService>(SemanticAnalysisService);
  });

  /**
   * **Feature: trinity-mvp, Property 8: Inyección semántica de contenido**
   * **Valida: Requisitos 5.1, 5.2, 5.3, 5.4, 5.5**
   *
   * Para cualquier sala con patrones de votación, el sistema debe analizar preferencias,
   * calcular similitud semántica, e inyectar contenido relevante manteniendo aleatorización
   */
  describe('Property 8: Semantic content injection', () => {
    it('should analyze preference patterns consistently from positive votes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 20 }),
            positiveVotes: fc.array(
              fc.record({
                userId: fc.string({ minLength: 1, maxLength: 10 }),
                mediaId: fc.string({ minLength: 1, maxLength: 10 }),
                voteType: fc.constant(VoteType.POSITIVE),
                roomId: fc.string({ minLength: 1, maxLength: 20 }),
                timestamp: fc.date(),
              }),
              { minLength: 5, maxLength: 50 },
            ),
            mediaContent: fc.array(
              fc.record({
                tmdbId: fc.string({ minLength: 1, maxLength: 10 }),
                title: fc.string({ minLength: 1, maxLength: 100 }),
                overview: fc.string({ minLength: 10, maxLength: 500 }),
                genres: fc.array(
                  fc.constantFrom(
                    'Action',
                    'Comedy',
                    'Drama',
                    'Horror',
                    'Romance',
                    'Sci-Fi',
                  ),
                  { minLength: 1, maxLength: 3 },
                ),
                voteAverage: fc.float({ min: 1, max: 10 }),
                popularity: fc.float({ min: 1, max: 1000 }),
                releaseDate: fc
                  .date({
                    min: new Date('2000-01-01'),
                    max: new Date('2024-12-31'),
                  })
                  .map((d) => d.toISOString().split('T')[0]),
                posterPath: fc.string({ minLength: 1, maxLength: 100 }),
                voteCount: fc.integer({ min: 1, max: 10000 }),
                adult: fc.boolean(),
                originalLanguage: fc.constantFrom('en', 'es', 'fr'),
                mediaType: fc.constantFrom('movie', 'tv'),
                cachedAt: fc.date(),
                isPopular: fc.boolean(),
              }),
              { minLength: 5, maxLength: 50 },
            ),
          }),
          async (testData) => {
            // Mock the content details for votes
            mockMediaService.getMovieDetails.mockImplementation(
              async (mediaId: string) => {
                return (
                  testData.mediaContent.find(
                    (item) => item.tmdbId === mediaId,
                  ) || null
                );
              },
            );

            // Execute preference analysis
            const patterns = await service.analyzePreferencePatterns(
              testData.roomId,
            );

            // Verify patterns are consistent and valid
            expect(patterns).toBeDefined();
            expect(typeof patterns.averageRating).toBe('number');
            expect(patterns.averageRating).toBeGreaterThanOrEqual(0);
            expect(patterns.averageRating).toBeLessThanOrEqual(10);

            // Verify genre analysis
            expect(patterns.genres).toBeDefined();
            expect(typeof patterns.genres).toBe('object');

            // Verify popularity and year ranges are logical
            expect(patterns.popularityRange.min).toBeLessThanOrEqual(
              patterns.popularityRange.max,
            );
            expect(patterns.releaseYearRange.min).toBeLessThanOrEqual(
              patterns.releaseYearRange.max,
            );

            // Verify common keywords are strings
            expect(Array.isArray(patterns.commonKeywords)).toBe(true);
            patterns.commonKeywords.forEach((keyword) => {
              expect(typeof keyword).toBe('string');
              expect(keyword.length).toBeGreaterThan(0);
            });
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should calculate semantic similarity scores correctly and consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            targetContent: fc.record({
              tmdbId: fc.string({ minLength: 1, maxLength: 10 }),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              overview: fc.string({ minLength: 10, maxLength: 500 }),
              genres: fc.array(
                fc.constantFrom(
                  'Action',
                  'Comedy',
                  'Drama',
                  'Horror',
                  'Romance',
                ),
                { minLength: 1, maxLength: 3 },
              ),
              voteAverage: fc.float({ min: 1, max: 10 }),
              popularity: fc.float({ min: 1, max: 1000 }),
              releaseDate: fc
                .date({
                  min: new Date('2000-01-01'),
                  max: new Date('2024-12-31'),
                })
                .map((d) => d.toISOString().split('T')[0]),
              posterPath: fc.string(),
              voteCount: fc.integer({ min: 1, max: 10000 }),
              adult: fc.boolean(),
              originalLanguage: fc.string(),
              mediaType: fc.constantFrom('movie', 'tv'),
              cachedAt: fc.date(),
              isPopular: fc.boolean(),
            }),
            candidateContent: fc.array(
              fc.record({
                tmdbId: fc.string({ minLength: 1, maxLength: 10 }),
                title: fc.string({ minLength: 1, maxLength: 100 }),
                overview: fc.string({ minLength: 10, maxLength: 500 }),
                genres: fc.array(
                  fc.constantFrom(
                    'Action',
                    'Comedy',
                    'Drama',
                    'Horror',
                    'Romance',
                  ),
                  { minLength: 1, maxLength: 3 },
                ),
                voteAverage: fc.float({ min: 1, max: 10 }),
                popularity: fc.float({ min: 1, max: 1000 }),
                releaseDate: fc
                  .date({
                    min: new Date('2000-01-01'),
                    max: new Date('2024-12-31'),
                  })
                  .map((d) => d.toISOString().split('T')[0]),
                posterPath: fc.string(),
                voteCount: fc.integer({ min: 1, max: 10000 }),
                adult: fc.boolean(),
                originalLanguage: fc.string(),
                mediaType: fc.constantFrom('movie', 'tv'),
                cachedAt: fc.date(),
                isPopular: fc.boolean(),
              }),
              { minLength: 1, maxLength: 20 },
            ),
          }),
          async (testData) => {
            // Calculate semantic similarities
            const similarities = await service.calculateSemanticSimilarity(
              testData.targetContent,
              testData.candidateContent,
            );

            // Verify all similarity scores are valid
            similarities.forEach((similarity) => {
              expect(similarity.similarityScore).toBeGreaterThanOrEqual(0);
              expect(similarity.similarityScore).toBeLessThanOrEqual(1);
              expect(typeof similarity.mediaId).toBe('string');
              expect(similarity.mediaId.length).toBeGreaterThan(0);
              expect(Array.isArray(similarity.matchingFactors)).toBe(true);
            });

            // Verify results are sorted by similarity score (descending)
            for (let i = 1; i < similarities.length; i++) {
              expect(
                similarities[i - 1].similarityScore,
              ).toBeGreaterThanOrEqual(similarities[i].similarityScore);
            }

            // Verify identical content has maximum similarity
            const identicalSimilarity =
              await service.calculateSemanticSimilarity(
                testData.targetContent,
                [testData.targetContent],
              );

            if (identicalSimilarity.length > 0) {
              expect(identicalSimilarity[0].similarityScore).toBeGreaterThan(
                0.8,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should inject content maintaining room consistency and randomization', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc
              .string({ minLength: 1, maxLength: 20 })
              .filter((s) => s.trim().length > 0),
            maxInjections: fc.integer({ min: 1, max: 20 }),
            shouldInject: fc.boolean(),
            existingContent: fc
              .array(
                fc.record({
                  tmdbId: fc
                    .string({ minLength: 1, maxLength: 10 })
                    .filter((s) => s.trim().length > 0),
                  title: fc.string({ minLength: 1, maxLength: 100 }),
                  overview: fc.string({ minLength: 10, maxLength: 500 }),
                  genres: fc.array(
                    fc.constantFrom('Action', 'Comedy', 'Drama'),
                    { minLength: 1, maxLength: 2 },
                  ),
                  voteAverage: fc.float({ min: 7, max: 10 }), // High-rated content
                  popularity: fc.float({ min: 50, max: 500 }), // Moderate popularity
                  releaseDate: fc
                    .date({
                      min: new Date('2015-01-01'),
                      max: new Date('2024-12-31'),
                    })
                    .map((d) => d.toISOString().split('T')[0]),
                  posterPath: fc.string(),
                  voteCount: fc.integer({ min: 100, max: 10000 }),
                  adult: fc.boolean(),
                  originalLanguage: fc.string(),
                  mediaType: fc.constantFrom('movie', 'tv'),
                  cachedAt: fc.date(),
                  isPopular: fc.boolean(),
                }),
                { minLength: 10, maxLength: 50 },
              )
              .map((items) => {
                // Asegurar IDs únicos
                return items.map((item, index) => ({
                  ...item,
                  tmdbId: `movie-${index + 1}`,
                }));
              }),
          }),
          async (testData) => {
            // Mock should inject decision
            const shouldInjectSpy = jest
              .spyOn(service, 'shouldInjectContent')
              .mockResolvedValue(testData.shouldInject);

            // Mock content fetching
            mockMediaService.fetchMovies.mockResolvedValue(
              testData.existingContent,
            );

            // Execute content injection
            const result = await service.injectSemanticContent(
              testData.roomId,
              testData.maxInjections,
            );

            // Verify shouldInjectContent was called
            expect(shouldInjectSpy).toHaveBeenCalledWith(testData.roomId);

            // Verify result structure
            expect(result).toBeDefined();
            expect(Array.isArray(result.injectedContent)).toBe(true);
            expect(result.analysisMetadata).toBeDefined();
            expect(typeof result.analysisMetadata.totalPositiveVotes).toBe(
              'number',
            );
            expect(typeof result.analysisMetadata.injectionReason).toBe(
              'string',
            );

            if (testData.shouldInject) {
              // Verify injection respects max limit
              expect(result.injectedContent.length).toBeLessThanOrEqual(
                testData.maxInjections,
              );

              // Verify injected content meets quality criteria
              result.injectedContent.forEach((item) => {
                expect(item.genres.length).toBeGreaterThanOrEqual(2); // Multiple genres for bridge content
                expect(item.voteAverage).toBeGreaterThanOrEqual(7.0); // High rating
                expect(item.popularity).toBeGreaterThanOrEqual(50); // Moderate popularity
                expect(item.popularity).toBeLessThanOrEqual(500);
              });

              // Verify content diversity (no duplicates)
              const tmdbIds = result.injectedContent.map((item) => item.tmdbId);
              const uniqueIds = new Set(tmdbIds);
              expect(uniqueIds.size).toBe(tmdbIds.length);
            } else {
              // When injection criteria not met, should return empty array
              expect(result.injectedContent.length).toBe(0);
              expect(result.analysisMetadata.injectionReason).toContain(
                'does not meet',
              );
            }

            // Verify metadata consistency
            expect(result.analysisMetadata.patternsFound).toBeDefined();
            expect(result.analysisMetadata.patternsFound.genres).toBeDefined();
            expect(
              typeof result.analysisMetadata.patternsFound.averageRating,
            ).toBe('number');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain injection criteria consistency across multiple evaluations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 20 }),
            recentMatches: fc.integer({ min: 0, max: 10 }),
            totalVotes: fc.integer({ min: 0, max: 200 }),
          }),
          async (testData) => {
            // Mock metrics for injection criteria
            jest
              .spyOn(service as any, 'getRecentMatches')
              .mockResolvedValue(Array(testData.recentMatches).fill({}));
            jest
              .spyOn(service as any, 'countTotalVotes')
              .mockResolvedValue(testData.totalVotes);

            // Evaluate injection criteria multiple times
            const evaluation1 = await service.shouldInjectContent(
              testData.roomId,
            );
            const evaluation2 = await service.shouldInjectContent(
              testData.roomId,
            );
            const evaluation3 = await service.shouldInjectContent(
              testData.roomId,
            );

            // Verify consistency across evaluations
            expect(evaluation1).toBe(evaluation2);
            expect(evaluation2).toBe(evaluation3);

            // Verify injection logic follows expected criteria
            const expectedShouldInject =
              testData.recentMatches < 2 &&
              testData.totalVotes > 20 &&
              testData.recentMatches / Math.max(testData.totalVotes, 1) < 0.05;

            expect(evaluation1).toBe(expectedShouldInject);

            // Verify edge cases
            if (testData.totalVotes === 0) {
              expect(evaluation1).toBe(false); // No votes = no injection
            }

            if (testData.recentMatches >= 2) {
              expect(evaluation1).toBe(false); // Sufficient matches = no injection
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should preserve content quality and diversity in bridge content identification', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: fc.string({ minLength: 1, maxLength: 20 }),
            candidateContent: fc.array(
              fc.record({
                tmdbId: fc.string({ minLength: 1, maxLength: 10 }),
                title: fc.string({ minLength: 1, maxLength: 100 }),
                overview: fc.string({ minLength: 10, maxLength: 500 }),
                genres: fc.array(
                  fc.constantFrom(
                    'Action',
                    'Comedy',
                    'Drama',
                    'Romance',
                    'Thriller',
                  ),
                  { minLength: 1, maxLength: 4 },
                ),
                voteAverage: fc.float({ min: 1, max: 10 }),
                popularity: fc.float({ min: 1, max: 1000 }),
                releaseDate: fc
                  .date({
                    min: new Date('2000-01-01'),
                    max: new Date('2024-12-31'),
                  })
                  .map((d) => d.toISOString().split('T')[0]),
                posterPath: fc.string(),
                voteCount: fc.integer({ min: 1, max: 10000 }),
                adult: fc.boolean(),
                originalLanguage: fc.string(),
                mediaType: fc.constantFrom('movie', 'tv'),
                cachedAt: fc.date(),
                isPopular: fc.boolean(),
              }),
              { minLength: 20, maxLength: 100 },
            ),
          }),
          async (testData) => {
            // Use private method to test bridge content identification
            const bridgeContent = await (service as any).identifyBridgeContent(
              testData.roomId,
              testData.candidateContent,
            );

            // Verify bridge content meets quality criteria
            bridgeContent.forEach((item) => {
              expect(item.genres.length).toBeGreaterThanOrEqual(2); // Multiple genres
              expect(item.voteAverage).toBeGreaterThanOrEqual(7.0); // High rating
              expect(item.popularity).toBeGreaterThanOrEqual(50); // Not too niche
              expect(item.popularity).toBeLessThanOrEqual(500); // Not too mainstream
            });

            // Verify content is sorted by bridge potential (genre diversity * rating)
            for (let i = 1; i < bridgeContent.length; i++) {
              const scoreA =
                bridgeContent[i - 1].genres.length *
                bridgeContent[i - 1].voteAverage;
              const scoreB =
                bridgeContent[i].genres.length * bridgeContent[i].voteAverage;
              expect(scoreA).toBeGreaterThanOrEqual(scoreB);
            }

            // Verify no duplicates in bridge content
            const tmdbIds = bridgeContent.map((item) => item.tmdbId);
            const uniqueIds = new Set(tmdbIds);
            expect(uniqueIds.size).toBe(tmdbIds.length);

            // Verify bridge content is subset of candidates
            bridgeContent.forEach((bridgeItem) => {
              const found = testData.candidateContent.some(
                (candidate) => candidate.tmdbId === bridgeItem.tmdbId,
              );
              expect(found).toBe(true);
            });
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
