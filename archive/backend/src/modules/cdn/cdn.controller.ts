import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  Request,
  Logger,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CDNService,
  ImageOptimizationOptions,
  CDNImageResponse,
  ProgressiveLoadingConfig,
} from './cdn.service';

export class OptimizeImageDto {
  imagePath: string;
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png' | 'auto';
  progressive?: boolean;
}

export class ProgressiveLoadingDto {
  imagePath: string;
  enablePlaceholder?: boolean = true;
  enableThumbnail?: boolean = true;
  enableLazyLoading?: boolean = true;
  qualitySteps?: number[] = [30, 60, 85];
}

export class InvalidateCacheDto {
  imagePaths: string[];
}

@ApiTags('CDN & Image Optimization')
@ApiBearerAuth()
@Controller('cdn')
@UseGuards(JwtAuthGuard)
export class CDNController {
  private readonly logger = new Logger(CDNController.name);

  constructor(private cdnService: CDNService) {}

  @Post('optimize-image')
  @ApiOperation({
    summary: 'Optimizar imagen para entrega via CDN',
    description:
      'Genera URLs optimizadas para diferentes tamaños y formatos de imagen',
  })
  @ApiResponse({
    status: 200,
    description: 'Imagen optimizada exitosamente',
    schema: {
      type: 'object',
      properties: {
        originalUrl: { type: 'string' },
        optimizedUrl: { type: 'string' },
        thumbnailUrl: { type: 'string' },
        placeholderUrl: { type: 'string' },
        sizes: {
          type: 'object',
          properties: {
            small: { type: 'string' },
            medium: { type: 'string' },
            large: { type: 'string' },
            original: { type: 'string' },
          },
        },
        metadata: {
          type: 'object',
          properties: {
            format: { type: 'string' },
            estimatedSize: { type: 'number' },
            cacheStatus: { type: 'string' },
          },
        },
      },
    },
  })
  async optimizeImage(
    @Body() dto: OptimizeImageDto,
    @Request() req: any,
  ): Promise<CDNImageResponse> {
    this.logger.log(
      `🖼️ User ${req.user.sub} optimizing image: ${dto.imagePath}`,
    );

    const options: ImageOptimizationOptions = {
      width: dto.width,
      height: dto.height,
      quality: dto.quality,
      format: dto.format,
      progressive: dto.progressive,
    };

    return this.cdnService.optimizeImage(dto.imagePath, options);
  }

  @Post('progressive-loading')
  @ApiOperation({
    summary: 'Configurar carga progresiva de imagen',
    description:
      'Genera secuencia de carga progresiva para experiencia visual optimizada',
  })
  @ApiResponse({
    status: 200,
    description: 'Carga progresiva configurada',
    schema: {
      type: 'object',
      properties: {
        loadingStrategy: { type: 'string' },
        imageSequence: {
          type: 'array',
          items: { type: 'string' },
        },
        lazyLoadConfig: { type: 'object' },
      },
    },
  })
  async setupProgressiveLoading(
    @Body() dto: ProgressiveLoadingDto,
    @Request() req: any,
  ) {
    this.logger.log(
      `📈 User ${req.user.sub} setting up progressive loading for: ${dto.imagePath}`,
    );

    const config: ProgressiveLoadingConfig = {
      enablePlaceholder: dto.enablePlaceholder ?? true,
      enableThumbnail: dto.enableThumbnail ?? true,
      enableLazyLoading: dto.enableLazyLoading ?? true,
      qualitySteps: dto.qualitySteps ?? [30, 60, 85],
    };

    return this.cdnService.setupProgressiveLoading(dto.imagePath, config);
  }

  @Get('cache-stats')
  @ApiOperation({
    summary: 'Obtener estadísticas de caché del CDN',
    description: 'Proporciona métricas de rendimiento y uso del CDN',
  })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas de caché obtenidas',
    schema: {
      type: 'object',
      properties: {
        hitRate: { type: 'number' },
        totalRequests: { type: 'number' },
        bandwidthSaved: { type: 'number' },
        averageLoadTime: { type: 'number' },
        topImages: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  async getCacheStats(
    @Request() req: any,
    @Query('imagePath') imagePath?: string,
  ) {
    this.logger.log(`📊 User ${req.user.sub} requesting CDN cache stats`);

    return this.cdnService.getCacheStats(imagePath);
  }

  @Post('invalidate-cache')
  @ApiOperation({
    summary: 'Invalidar caché de CDN para imágenes específicas',
    description:
      'Fuerza la actualización de imágenes en el CDN (solo para administradores)',
  })
  @ApiResponse({
    status: 200,
    description: 'Invalidación de caché iniciada',
    schema: {
      type: 'object',
      properties: {
        invalidationId: { type: 'string' },
        status: { type: 'string' },
        estimatedTime: { type: 'number' },
      },
    },
  })
  async invalidateCache(@Body() dto: InvalidateCacheDto, @Request() req: any) {
    this.logger.log(
      `🔄 User ${req.user.sub} invalidating cache for ${dto.imagePaths.length} images`,
    );

    return this.cdnService.invalidateCache(dto.imagePaths);
  }

  @Get('image-info/:imagePath')
  @ApiOperation({
    summary: 'Obtener información detallada de una imagen',
    description:
      'Proporciona metadatos y URLs optimizadas para una imagen específica',
  })
  @ApiResponse({
    status: 200,
    description: 'Información de imagen obtenida',
  })
  async getImageInfo(
    @Param('imagePath') imagePath: string,
    @Query('optimize') optimize: boolean = true,
    @Request() req: any,
  ): Promise<CDNImageResponse> {
    this.logger.log(
      `ℹ️ User ${req.user.sub} requesting info for image: ${imagePath}`,
    );

    if (optimize) {
      return this.cdnService.optimizeImage(imagePath);
    } else {
      return this.cdnService.optimizeImage(imagePath, {
        width: undefined,
        height: undefined,
        quality: 100,
      });
    }
  }
}
