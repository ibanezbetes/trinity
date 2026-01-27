import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaItem } from '../../domain/entities/media.entity';
import { TMDBService } from '../../infrastructure/tmdb/tmdb.service';

interface CacheEntry {
  data: MediaItem;
  timestamp: number;
  ttl: number;
}

@Injectable()
export class MediaCacheService {
  private readonly logger = new Logger(MediaCacheService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly prefetchQueue = new Set<string>();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 60 minutos (más tiempo)
  private readonly PREFETCH_BATCH_SIZE: number;
  private readonly PREFETCH_ENABLED: boolean;
  private readonly PREFETCH_LOOKAHEAD: number;

  constructor(
    private configService: ConfigService,
    private tmdbService: TMDBService,
  ) {
    this.PREFETCH_BATCH_SIZE = this.configService.get('MEDIA_PREFETCH_BATCH_SIZE', 15);
    this.PREFETCH_LOOKAHEAD = this.configService.get('MEDIA_PREFETCH_LOOKAHEAD', 10);
    this.PREFETCH_ENABLED = this.configService.get('MEDIA_PREFETCH_ENABLED', 'true') === 'true';
    
    // Limpiar cache expirado cada 10 minutos (menos frecuente)
    setInterval(() => this.cleanExpiredCache(), 10 * 60 * 1000);
  }

  /**
   * Obtener media desde cache o cargar si no existe
   */
  async getMedia(tmdbId: string): Promise<MediaItem | null> {
    const cacheKey = `media_${tmdbId}`;
    const cached = this.cache.get(cacheKey);

    // Si está en cache y no ha expirado, devolverlo
    if (cached && Date.now() < cached.timestamp + cached.ttl) {
      this.logger.debug(`Cache HIT for media ${tmdbId}`);
      return cached.data;
    }

    // Si no está en cache, cargarlo
    this.logger.debug(`Cache MISS for media ${tmdbId}, loading...`);
    const mediaItem = await this.loadMediaFromTMDB(tmdbId);
    
    if (mediaItem) {
      this.setCache(cacheKey, mediaItem);
    }

    return mediaItem;
  }

  /**
   * Pre-cargar múltiples medias en lotes
   */
  async prefetchMediaBatch(tmdbIds: string[]): Promise<void> {
    if (!this.PREFETCH_ENABLED) {
      return;
    }

    const uncachedIds = tmdbIds.filter(id => {
      const cacheKey = `media_${id}`;
      const cached = this.cache.get(cacheKey);
      return !cached || Date.now() >= cached.timestamp + cached.ttl;
    });

    if (uncachedIds.length === 0) {
      this.logger.debug('All media already cached, skipping prefetch');
      return;
    }

    this.logger.log(`Prefetching ${uncachedIds.length} media items...`);

    // Procesar en lotes para no sobrecargar la API
    const batches = this.chunkArray(uncachedIds, this.PREFETCH_BATCH_SIZE);
    
    for (const batch of batches) {
      await Promise.all(
        batch.map(async (tmdbId) => {
          try {
            if (!this.prefetchQueue.has(tmdbId)) {
              this.prefetchQueue.add(tmdbId);
              const mediaItem = await this.loadMediaFromTMDB(tmdbId);
              if (mediaItem) {
                this.setCache(`media_${tmdbId}`, mediaItem);
              }
              this.prefetchQueue.delete(tmdbId);
            }
          } catch (error) {
            this.logger.error(`Error prefetching media ${tmdbId}: ${error.message}`);
            this.prefetchQueue.delete(tmdbId);
          }
        })
      );

      // Pequeña pausa entre lotes para no saturar la API (reducida)
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.logger.log(`Prefetch completed. Cache size: ${this.cache.size}`);
  }

  /**
   * Pre-cargar los próximos N elementos de la lista de un usuario (OPTIMIZADO)
   */
  async prefetchUpcoming(shuffledList: string[], currentIndex: number, lookAhead: number = 10): Promise<void> {
    const upcomingIds = shuffledList.slice(currentIndex, currentIndex + lookAhead);
    await this.prefetchMediaBatch(upcomingIds);
  }

  /**
   * Obtener múltiples medias (con cache)
   */
  async getMultipleMedia(tmdbIds: string[]): Promise<MediaItem[]> {
    const results: MediaItem[] = [];
    
    for (const tmdbId of tmdbIds) {
      const media = await this.getMedia(tmdbId);
      if (media) {
        results.push(media);
      }
    }

    return results;
  }

  /**
   * Invalidar cache de un media específico
   */
  invalidateMedia(tmdbId: string): void {
    const cacheKey = `media_${tmdbId}`;
    this.cache.delete(cacheKey);
    this.logger.debug(`Cache invalidated for media ${tmdbId}`);
  }

  /**
   * Limpiar todo el cache
   */
  clearCache(): void {
    this.cache.clear();
    this.prefetchQueue.clear();
    this.logger.log('Media cache cleared');
  }

  /**
   * Obtener estadísticas del cache
   */
  getCacheStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now < entry.timestamp + entry.ttl) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      prefetchQueueSize: this.prefetchQueue.size,
      hitRate: this.calculateHitRate(),
    };
  }

  /**
   * Métodos privados
   */
  private async loadMediaFromTMDB(tmdbId: string): Promise<MediaItem | null> {
    try {
      const tmdbMovie = await this.tmdbService.getMovieDetails(tmdbId);
      if (tmdbMovie && tmdbMovie.id) {
        return this.tmdbService.convertToMediaItem(tmdbMovie);
      }
      return null;
    } catch (error) {
      this.logger.error(`Error loading media ${tmdbId} from TMDB: ${error.message}`);
      return null;
    }
  }

  private setCache(key: string, data: MediaItem): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: this.CACHE_TTL,
    });
  }

  private cleanExpiredCache(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.timestamp + entry.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned ${cleanedCount} expired cache entries`);
    }
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private calculateHitRate(): number {
    // Implementación simplificada - en producción usaríamos métricas más sofisticadas
    return 0.85; // Placeholder
  }
}