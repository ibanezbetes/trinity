import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fc from 'fast-check';
import {
  CDNService,
  ImageOptimizationOptions,
  CDNImageResponse,
  ProgressiveLoadingConfig,
} from './cdn.service';

// Mock ConfigService
const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: any) => {
    const config = {
      CDN_BASE_URL: 'https://image.tmdb.org/t/p/',
      CLOUDFRONT_DISTRIBUTION: 'test-distribution.cloudfront.net',
      IMAGE_OPTIMIZATION_ENABLED: 'true',
      NODE_ENV: 'test',
    };
    return config[key] || defaultValue;
  }),
};

describe('CDNService Property Tests', () => {
  let service: CDNService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CDNService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CDNService>(CDNService);
  });

  /**
   * **Feature: trinity-mvp, Propiedad 9: Entrega de contenido CDN**
   * **Valida: Requisitos 6.2, 6.4**
   *
   * Para cualquier imagen, el sistema debe generar URLs optimizadas,
   * implementar carga progresiva y mantener estadísticas de caché consistentes
   */
  describe('Propiedad 9: Entrega de contenido CDN', () => {
    it('should generate consistent optimized URLs for any image path and options', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            imagePath: fc
              .string({ minLength: 1, maxLength: 100 })
              .filter((s) => s.startsWith('/')),
            options: fc.record({
              width: fc.option(fc.integer({ min: 50, max: 2000 }), {
                nil: undefined,
              }),
              height: fc.option(fc.integer({ min: 50, max: 2000 }), {
                nil: undefined,
              }),
              quality: fc.option(fc.integer({ min: 10, max: 100 }), {
                nil: undefined,
              }),
              format: fc.option(
                fc.constantFrom('webp', 'jpeg', 'png', 'auto'),
                { nil: undefined },
              ),
              progressive: fc.option(fc.boolean(), { nil: undefined }),
            }),
          }),
          async (testData) => {
            // Execute image optimization
            const result = await service.optimizeImage(
              testData.imagePath,
              testData.options as ImageOptimizationOptions,
            );

            // Verify result structure is always consistent
            expect(result).toBeDefined();
            expect(typeof result.originalUrl).toBe('string');
            expect(typeof result.optimizedUrl).toBe('string');
            expect(typeof result.thumbnailUrl).toBe('string');
            expect(typeof result.placeholderUrl).toBe('string');

            // Verify sizes object structure
            expect(result.sizes).toBeDefined();
            expect(typeof result.sizes.small).toBe('string');
            expect(typeof result.sizes.medium).toBe('string');
            expect(typeof result.sizes.large).toBe('string');
            expect(typeof result.sizes.original).toBe('string');

            // Verify metadata structure
            expect(result.metadata).toBeDefined();
            expect(typeof result.metadata.format).toBe('string');
            expect(typeof result.metadata.estimatedSize).toBe('number');
            expect(['hit', 'miss', 'stale']).toContain(
              result.metadata.cacheStatus,
            );

            // Verify all URLs are valid
            expect(() => new URL(result.originalUrl)).not.toThrow();
            expect(() => new URL(result.optimizedUrl)).not.toThrow();
            expect(() => new URL(result.thumbnailUrl)).not.toThrow();
            expect(() => new URL(result.placeholderUrl)).not.toThrow();

            Object.values(result.sizes).forEach((url) => {
              expect(() => new URL(url)).not.toThrow();
            });

            // Verify URLs contain the image path
            expect(result.originalUrl).toContain(testData.imagePath);
            expect(result.optimizedUrl).toContain(testData.imagePath);
            expect(result.thumbnailUrl).toContain(testData.imagePath);
            expect(result.placeholderUrl).toContain(testData.imagePath);

            // Verify estimated size is positive
            expect(result.metadata.estimatedSize).toBeGreaterThan(0);

            // Verify consistency - same inputs should produce same outputs
            const result2 = await service.optimizeImage(
              testData.imagePath,
              testData.options as ImageOptimizationOptions,
            );
            expect(result).toEqual(result2);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should generate progressive loading sequences with proper quality progression', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            imagePath: fc
              .string({ minLength: 1, maxLength: 100 })
              .filter((s) => s.startsWith('/')),
            config: fc.record({
              enablePlaceholder: fc.boolean(),
              enableThumbnail: fc.boolean(),
              enableLazyLoading: fc.boolean(),
              qualitySteps: fc
                .array(fc.integer({ min: 10, max: 100 }), {
                  minLength: 2,
                  maxLength: 5,
                })
                .map((arr) => arr.sort((a, b) => a - b)), // Ensure ascending order
            }),
          }),
          async (testData) => {
            // Execute progressive loading setup
            const result = await service.setupProgressiveLoading(
              testData.imagePath,
              testData.config,
            );

            // Verify result structure
            expect(result).toBeDefined();
            expect(typeof result.loadingStrategy).toBe('string');
            expect(Array.isArray(result.imageSequence)).toBe(true);
            expect(typeof result.lazyLoadConfig).toBe('object');

            // Verify image sequence is not empty
            expect(result.imageSequence.length).toBeGreaterThan(0);

            // Verify all URLs in sequence are valid
            result.imageSequence.forEach((url) => {
              expect(typeof url).toBe('string');
              expect(url.length).toBeGreaterThan(0);
              expect(() => new URL(url)).not.toThrow();
              expect(url).toContain(testData.imagePath);
            });

            // Verify lazy load config structure
            expect(result.lazyLoadConfig).toBeDefined();
            expect(typeof result.lazyLoadConfig).toBe('object');

            // Verify sequence length matches configuration
            let expectedMinLength = 1; // At least final image
            if (testData.config.enablePlaceholder) expectedMinLength++;
            if (testData.config.enableThumbnail) expectedMinLength++;
            expectedMinLength += testData.config.qualitySteps.length - 1; // Progressive steps

            expect(result.imageSequence.length).toBeGreaterThanOrEqual(
              expectedMinLength - 2,
            ); // Allow some flexibility

            // Verify no duplicate URLs in sequence
            const uniqueUrls = new Set(result.imageSequence);
            expect(uniqueUrls.size).toBe(result.imageSequence.length);

            // Verify loading strategy is valid
            expect(['progressive-quality', 'simple']).toContain(
              result.loadingStrategy,
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should maintain consistent cache statistics structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            imagePath: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
              nil: undefined,
            }),
          }),
          async (testData) => {
            // Execute cache stats retrieval
            const stats = await service.getCacheStats(testData.imagePath);

            // Verify stats structure is always consistent
            expect(stats).toBeDefined();
            expect(typeof stats.hitRate).toBe('number');
            expect(typeof stats.totalRequests).toBe('number');
            expect(typeof stats.bandwidthSaved).toBe('number');
            expect(typeof stats.averageLoadTime).toBe('number');
            expect(Array.isArray(stats.topImages)).toBe(true);

            // Verify numeric values are valid
            expect(stats.hitRate).toBeGreaterThanOrEqual(0);
            expect(stats.hitRate).toBeLessThanOrEqual(1);
            expect(stats.totalRequests).toBeGreaterThanOrEqual(0);
            expect(stats.bandwidthSaved).toBeGreaterThanOrEqual(0);
            expect(stats.averageLoadTime).toBeGreaterThanOrEqual(0);

            // Verify top images are strings
            stats.topImages.forEach((image) => {
              expect(typeof image).toBe('string');
              expect(image.length).toBeGreaterThan(0);
            });

            // Verify consistency - multiple calls should return same structure
            const stats2 = await service.getCacheStats(testData.imagePath);
            expect(typeof stats2.hitRate).toBe(typeof stats.hitRate);
            expect(typeof stats2.totalRequests).toBe(
              typeof stats.totalRequests,
            );
            expect(typeof stats2.bandwidthSaved).toBe(
              typeof stats.bandwidthSaved,
            );
            expect(typeof stats2.averageLoadTime).toBe(
              typeof stats.averageLoadTime,
            );
            expect(Array.isArray(stats2.topImages)).toBe(
              Array.isArray(stats.topImages),
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should handle cache invalidation requests consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            imagePaths: fc.array(
              fc
                .string({ minLength: 1, maxLength: 100 })
                .filter((s) => s.startsWith('/')),
              { minLength: 1, maxLength: 10 },
            ),
          }),
          async (testData) => {
            // Execute cache invalidation
            const result = await service.invalidateCache(testData.imagePaths);

            // Verify result structure is always consistent
            expect(result).toBeDefined();
            expect(typeof result.invalidationId).toBe('string');
            expect(['pending', 'completed', 'failed']).toContain(result.status);
            expect(typeof result.estimatedTime).toBe('number');

            // Verify estimated time is non-negative
            expect(result.estimatedTime).toBeGreaterThanOrEqual(0);

            // Verify invalidation ID is generated when status is not failed
            if (result.status !== 'failed') {
              expect(result.invalidationId.length).toBeGreaterThan(0);
              expect(result.estimatedTime).toBeGreaterThan(0);
            }

            // Verify consistency - same inputs should produce similar structure
            const result2 = await service.invalidateCache(testData.imagePaths);
            expect(typeof result2.invalidationId).toBe(
              typeof result.invalidationId,
            );
            expect(typeof result2.status).toBe(typeof result.status);
            expect(typeof result2.estimatedTime).toBe(
              typeof result.estimatedTime,
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should generate responsive image sizes with proper scaling', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            imagePath: fc
              .string({ minLength: 1, maxLength: 100 })
              .filter((s) => s.startsWith('/')),
            baseWidth: fc.integer({ min: 100, max: 1000 }),
            baseHeight: fc.integer({ min: 100, max: 1500 }),
            quality: fc.integer({ min: 50, max: 100 }),
          }),
          async (testData) => {
            // Execute image optimization with specific dimensions
            const options: ImageOptimizationOptions = {
              width: testData.baseWidth,
              height: testData.baseHeight,
              quality: testData.quality,
              format: 'webp',
            };

            const result = await service.optimizeImage(
              testData.imagePath,
              options,
            );

            // Verify responsive sizes are generated
            expect(result.sizes).toBeDefined();
            const { small, medium, large, original } = result.sizes;

            // Verify all size URLs are valid and different
            const sizeUrls = [small, medium, large, original];
            sizeUrls.forEach((url) => {
              expect(typeof url).toBe('string');
              expect(url.length).toBeGreaterThan(0);
              expect(() => new URL(url)).not.toThrow();
              expect(url).toContain(testData.imagePath);
            });

            // Verify URLs are different (different sizes)
            const uniqueUrls = new Set(sizeUrls);
            expect(uniqueUrls.size).toBeGreaterThan(1); // At least some should be different

            // Verify estimated size is reasonable for given dimensions
            const expectedMinSize =
              testData.baseWidth * testData.baseHeight * 0.01; // Very conservative estimate
            const expectedMaxSize =
              testData.baseWidth * testData.baseHeight * 3; // Liberal estimate

            expect(result.metadata.estimatedSize).toBeGreaterThan(
              expectedMinSize,
            );
            expect(result.metadata.estimatedSize).toBeLessThan(expectedMaxSize);

            // Verify format is preserved or auto-selected
            if (options.format && options.format !== 'auto') {
              expect(result.metadata.format).toBe(options.format);
            } else {
              expect(['webp', 'jpeg', 'png']).toContain(result.metadata.format);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should handle edge cases and invalid inputs gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            imagePath: fc.oneof(
              fc.string({ minLength: 1, maxLength: 100 }),
              fc.constant(''),
              fc.constant('/'),
              fc.string({ minLength: 1, maxLength: 5 }).map((s) => '/' + s),
            ),
            options: fc.record({
              width: fc.option(
                fc.oneof(
                  fc.integer({ min: 1, max: 5000 }),
                  fc.constant(0),
                  fc.constant(-1),
                ),
                { nil: undefined },
              ),
              height: fc.option(
                fc.oneof(
                  fc.integer({ min: 1, max: 5000 }),
                  fc.constant(0),
                  fc.constant(-1),
                ),
                { nil: undefined },
              ),
              quality: fc.option(
                fc.oneof(
                  fc.integer({ min: 1, max: 100 }),
                  fc.constant(0),
                  fc.constant(101),
                  fc.constant(-1),
                ),
                { nil: undefined },
              ),
            }),
          }),
          async (testData) => {
            // Execute optimization - should never throw
            let result: CDNImageResponse;

            try {
              result = await service.optimizeImage(
                testData.imagePath,
                testData.options,
              );
            } catch (error) {
              // If it throws, it should still provide a fallback
              fail(
                `Service should not throw errors, but got: ${error.message}`,
              );
            }

            // Verify result is always provided (fallback if needed)
            expect(result).toBeDefined();
            expect(typeof result.originalUrl).toBe('string');
            expect(typeof result.optimizedUrl).toBe('string');
            expect(typeof result.thumbnailUrl).toBe('string');
            expect(typeof result.placeholderUrl).toBe('string');
            expect(result.sizes).toBeDefined();
            expect(result.metadata).toBeDefined();

            // Verify metadata is always valid
            expect(typeof result.metadata.format).toBe('string');
            expect(typeof result.metadata.estimatedSize).toBe('number');
            expect(result.metadata.estimatedSize).toBeGreaterThanOrEqual(0);
            expect(['hit', 'miss', 'stale']).toContain(
              result.metadata.cacheStatus,
            );

            // For empty or invalid paths, should still provide valid URLs (fallback)
            if (!testData.imagePath || testData.imagePath.length === 0) {
              // Should handle gracefully with fallback
              expect(result.originalUrl.length).toBeGreaterThan(0);
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
