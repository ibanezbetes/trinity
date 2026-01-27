import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png' | 'auto';
  progressive?: boolean;
}

export interface CDNImageResponse {
  originalUrl: string;
  optimizedUrl: string;
  thumbnailUrl: string;
  placeholderUrl: string;
  sizes: {
    small: string;
    medium: string;
    large: string;
    original: string;
  };
  metadata: {
    format: string;
    estimatedSize: number;
    cacheStatus: 'hit' | 'miss' | 'stale';
  };
}

export interface ProgressiveLoadingConfig {
  enablePlaceholder: boolean;
  enableThumbnail: boolean;
  enableLazyLoading: boolean;
  qualitySteps: number[];
}

@Injectable()
export class CDNService {
  private readonly logger = new Logger(CDNService.name);
  private readonly cdnBaseUrl: string;
  private readonly cloudFrontDistribution: string;
  private readonly imageOptimizationEnabled: boolean;

  constructor(private configService: ConfigService) {
    this.cdnBaseUrl = this.configService.get(
      'CDN_BASE_URL',
      'https://image.tmdb.org/t/p/',
    );
    this.cloudFrontDistribution = this.configService.get(
      'CLOUDFRONT_DISTRIBUTION',
      '',
    );
    this.imageOptimizationEnabled =
      this.configService.get('IMAGE_OPTIMIZATION_ENABLED', 'true') === 'true';

    this.logger.log(
      `🌐 CDN Service initialized with base URL: ${this.cdnBaseUrl}`,
    );
    if (this.cloudFrontDistribution) {
      this.logger.log(
        `☁️ CloudFront distribution configured: ${this.cloudFrontDistribution}`,
      );
    }
  }

  /**
   * Optimizar imagen para entrega via CDN
   * Requisito 6.2: Servir pósters optimizados de alta calidad a través de CDN
   */
  async optimizeImage(
    originalImagePath: string,
    options: ImageOptimizationOptions = {},
  ): Promise<CDNImageResponse> {
    try {
      this.logger.debug(`🖼️ Optimizing image: ${originalImagePath}`);

      const {
        width = 500,
        height = 750,
        quality = 85,
        format = 'auto',
        progressive = true,
      } = options;

      // Validar y normalizar parámetros
      const validWidth = Math.max(1, Math.abs(width) || 500);
      const validHeight = Math.max(1, Math.abs(height) || 750);
      const validQuality = Math.max(1, Math.min(100, Math.abs(quality) || 85));

      // Construir URLs optimizadas
      const optimizedUrl = this.buildOptimizedUrl(originalImagePath, {
        width: validWidth,
        height: validHeight,
        quality: validQuality,
        format,
        progressive,
      });

      // Generar diferentes tamaños para responsive images
      const sizes = this.generateResponsiveSizes(originalImagePath);

      // Generar thumbnail y placeholder
      const thumbnailUrl = this.buildOptimizedUrl(originalImagePath, {
        width: 150,
        height: 225,
        quality: 70,
        format: 'webp',
      });

      const placeholderUrl = this.buildOptimizedUrl(originalImagePath, {
        width: 50,
        height: 75,
        quality: 30,
        format: 'webp',
      });

      const response: CDNImageResponse = {
        originalUrl: this.buildOriginalUrl(originalImagePath),
        optimizedUrl,
        thumbnailUrl,
        placeholderUrl,
        sizes,
        metadata: {
          format: format === 'auto' ? 'webp' : format,
          estimatedSize: this.estimateImageSize(
            validWidth,
            validHeight,
            validQuality,
          ),
          cacheStatus: 'miss', // En producción, esto vendría del CDN
        },
      };

      this.logger.debug(
        `✅ Image optimization complete: ${JSON.stringify(response.metadata)}`,
      );
      return response;
    } catch (error) {
      this.logger.error(
        `❌ Error optimizing image ${originalImagePath}: ${error.message}`,
      );

      // Fallback a imagen original
      return this.getFallbackImageResponse(originalImagePath);
    }
  }

  /**
   * Configurar carga progresiva de imágenes
   * Requisito 6.4: Implementar carga progresiva para experiencia visual consistente
   */
  async setupProgressiveLoading(
    imagePath: string,
    config: ProgressiveLoadingConfig = {
      enablePlaceholder: true,
      enableThumbnail: true,
      enableLazyLoading: true,
      qualitySteps: [30, 60, 85],
    },
  ): Promise<{
    loadingStrategy: string;
    imageSequence: string[];
    lazyLoadConfig: object;
  }> {
    try {
      this.logger.debug(`📈 Setting up progressive loading for: ${imagePath}`);

      const imageSequence: string[] = [];

      // 1. Placeholder ultra-comprimido (si está habilitado)
      if (config.enablePlaceholder) {
        const placeholderUrl = this.buildOptimizedUrl(imagePath, {
          width: 50,
          height: 75,
          quality: 20,
          format: 'webp',
        });
        imageSequence.push(placeholderUrl);
      }

      // 2. Thumbnail de baja calidad (si está habilitado)
      if (config.enableThumbnail) {
        const thumbnailUrl = this.buildOptimizedUrl(imagePath, {
          width: 150,
          height: 225,
          quality: config.qualitySteps[0],
          format: 'webp',
        });
        imageSequence.push(thumbnailUrl);
      }

      // 3. Secuencia de calidad progresiva
      for (let i = 1; i < config.qualitySteps.length; i++) {
        const progressiveUrl = this.buildOptimizedUrl(imagePath, {
          width: 300 + i * 100, // Incrementar resolución gradualmente
          height: 450 + i * 150,
          quality: config.qualitySteps[i],
          format: 'webp',
        });
        imageSequence.push(progressiveUrl);
      }

      // 4. Imagen final de alta calidad
      const finalUrl = this.buildOptimizedUrl(imagePath, {
        width: 500,
        height: 750,
        quality: 90,
        format: 'webp',
        progressive: true,
      });
      imageSequence.push(finalUrl);

      const lazyLoadConfig = {
        threshold: 0.1, // Cargar cuando esté 10% visible
        rootMargin: '50px', // Precargar 50px antes de ser visible
        enableIntersectionObserver: true,
        fallbackToScroll: true,
      };

      this.logger.debug(
        `✅ Progressive loading configured with ${imageSequence.length} steps`,
      );

      return {
        loadingStrategy: 'progressive-quality',
        imageSequence,
        lazyLoadConfig,
      };
    } catch (error) {
      this.logger.error(
        `❌ Error setting up progressive loading: ${error.message}`,
      );

      // Fallback a carga simple
      return {
        loadingStrategy: 'simple',
        imageSequence: [this.buildOriginalUrl(imagePath)],
        lazyLoadConfig: { threshold: 0.1 },
      };
    }
  }

  /**
   * Obtener estadísticas de caché del CDN
   */
  async getCacheStats(imagePath?: string): Promise<{
    hitRate: number;
    totalRequests: number;
    bandwidthSaved: number;
    averageLoadTime: number;
    topImages: string[];
  }> {
    try {
      // En producción, esto consultaría CloudWatch o la API de CloudFront
      // Por ahora, simulamos estadísticas

      const stats = {
        hitRate: 0.85, // 85% cache hit rate
        totalRequests: 10000,
        bandwidthSaved: 2.5 * 1024 * 1024 * 1024, // 2.5 GB ahorrados
        averageLoadTime: 150, // 150ms promedio
        topImages: [
          '/w500/poster1.jpg',
          '/w500/poster2.jpg',
          '/w500/poster3.jpg',
        ],
      };

      this.logger.debug(`📊 CDN Cache stats: ${JSON.stringify(stats)}`);
      return stats;
    } catch (error) {
      this.logger.error(`❌ Error getting cache stats: ${error.message}`);
      return {
        hitRate: 0,
        totalRequests: 0,
        bandwidthSaved: 0,
        averageLoadTime: 0,
        topImages: [],
      };
    }
  }

  /**
   * Invalidar caché de CDN para una imagen específica
   */
  async invalidateCache(imagePaths: string[]): Promise<{
    invalidationId: string;
    status: 'pending' | 'completed' | 'failed';
    estimatedTime: number;
  }> {
    try {
      this.logger.log(
        `🔄 Invalidating CDN cache for ${imagePaths.length} images`,
      );

      // En producción, esto usaría la API de CloudFront
      const invalidationId = `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Simular invalidación
      const result = {
        invalidationId,
        status: 'pending' as const,
        estimatedTime: 300, // 5 minutos estimados
      };

      this.logger.log(`✅ Cache invalidation initiated: ${invalidationId}`);
      return result;
    } catch (error) {
      this.logger.error(`❌ Error invalidating cache: ${error.message}`);
      return {
        invalidationId: '',
        status: 'failed',
        estimatedTime: 0,
      };
    }
  }

  /**
   * Métodos privados para construcción de URLs
   */
  private buildOptimizedUrl(
    imagePath: string,
    options: ImageOptimizationOptions,
  ): string {
    if (!this.imageOptimizationEnabled) {
      return this.buildOriginalUrl(imagePath);
    }

    // Si tenemos CloudFront configurado, usar transformaciones de imagen
    if (this.cloudFrontDistribution) {
      const params = new URLSearchParams();

      if (options.width) params.append('w', options.width.toString());
      if (options.height) params.append('h', options.height.toString());
      if (options.quality) params.append('q', options.quality.toString());
      if (options.format && options.format !== 'auto')
        params.append('f', options.format);
      if (options.progressive) params.append('p', '1');

      return `https://${this.cloudFrontDistribution}${imagePath}?${params.toString()}`;
    }

    // Fallback a TMDB con tamaño optimizado
    const sizePrefix = this.getSizePrefix(options.width || 500);
    return `${this.cdnBaseUrl}${sizePrefix}${imagePath}`;
  }

  private buildOriginalUrl(imagePath: string): string {
    return `${this.cdnBaseUrl}original${imagePath}`;
  }

  private generateResponsiveSizes(
    imagePath: string,
  ): CDNImageResponse['sizes'] {
    return {
      small: this.buildOptimizedUrl(imagePath, {
        width: 200,
        height: 300,
        quality: 75,
      }),
      medium: this.buildOptimizedUrl(imagePath, {
        width: 350,
        height: 525,
        quality: 80,
      }),
      large: this.buildOptimizedUrl(imagePath, {
        width: 500,
        height: 750,
        quality: 85,
      }),
      original: this.buildOriginalUrl(imagePath),
    };
  }

  private getSizePrefix(width: number): string {
    if (width <= 92) return 'w92';
    if (width <= 154) return 'w154';
    if (width <= 185) return 'w185';
    if (width <= 342) return 'w342';
    if (width <= 500) return 'w500';
    if (width <= 780) return 'w780';
    return 'w1280';
  }

  private estimateImageSize(
    width: number,
    height: number,
    quality: number,
  ): number {
    // Validar parámetros de entrada - usar valores por defecto para casos inválidos
    const validWidth = Math.max(1, Math.abs(width) || 500);
    const validHeight = Math.max(1, Math.abs(height) || 750);
    const validQuality = Math.max(1, Math.min(100, Math.abs(quality) || 85));

    // Estimación aproximada del tamaño de archivo en bytes
    const pixels = validWidth * validHeight;
    const compressionFactor = validQuality / 100;
    const baseSize = pixels * 3; // 3 bytes por pixel (RGB)
    const compressedSize = baseSize * compressionFactor * 0.1; // Factor de compresión JPEG/WebP

    return Math.round(Math.max(0, compressedSize));
  }

  private getFallbackImageResponse(imagePath: string): CDNImageResponse {
    const originalUrl = this.buildOriginalUrl(imagePath);

    return {
      originalUrl,
      optimizedUrl: originalUrl,
      thumbnailUrl: originalUrl,
      placeholderUrl: originalUrl,
      sizes: {
        small: originalUrl,
        medium: originalUrl,
        large: originalUrl,
        original: originalUrl,
      },
      metadata: {
        format: 'jpeg',
        estimatedSize: 500000, // 500KB estimado
        cacheStatus: 'miss',
      },
    };
  }
}
