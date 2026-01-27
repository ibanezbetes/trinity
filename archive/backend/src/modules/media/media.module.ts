import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaCacheService } from './media-cache.service';
import { TMDBService } from '../../infrastructure/tmdb/tmdb.service';
import { CircuitBreakerService } from '../../infrastructure/circuit-breaker/circuit-breaker.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, MediaCacheService, TMDBService, CircuitBreakerService],
  exports: [MediaService, MediaCacheService, TMDBService],
})
export class MediaModule {}
