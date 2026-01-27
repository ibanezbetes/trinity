import { Controller, Get, Query, Param, UseGuards, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchContentDto } from './dto/search-content.dto';
import { ContentFiltersDto } from './dto/content-filters.dto';

@ApiTags('media')
@Controller('media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MediaController {
  constructor(private mediaService: MediaService) {}

  @Get('discover')
  @ApiOperation({ summary: 'Descubrir contenido con filtros' })
  @ApiResponse({ status: 200, description: 'Lista de contenido multimedia' })
  @ApiQuery({
    name: 'genres',
    required: false,
    type: [String],
    description: 'Géneros de contenido',
  })
  @ApiQuery({
    name: 'releaseYearFrom',
    required: false,
    type: Number,
    description: 'Año de lanzamiento desde',
  })
  @ApiQuery({
    name: 'releaseYearTo',
    required: false,
    type: Number,
    description: 'Año de lanzamiento hasta',
  })
  @ApiQuery({
    name: 'minRating',
    required: false,
    type: Number,
    description: 'Calificación mínima',
  })
  @ApiQuery({
    name: 'contentTypes',
    required: false,
    type: [String],
    description: 'Tipos de contenido (movie, tv)',
  })
  async discoverContent(@Query() filters: ContentFiltersDto) {
    return this.mediaService.fetchMovies(filters);
  }

  @Get('popular')
  @ApiOperation({ summary: 'Obtener contenido popular' })
  @ApiResponse({ status: 200, description: 'Lista de contenido popular' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número de página',
  })
  async getPopularContent(@Query('page') page?: number) {
    return this.mediaService.getPopularContent(page || 1);
  }

  @Get('search')
  @ApiOperation({ summary: 'Buscar contenido por texto' })
  @ApiResponse({ status: 200, description: 'Resultados de búsqueda' })
  @ApiQuery({
    name: 'q',
    required: true,
    type: String,
    description: 'Texto de búsqueda',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número de página',
  })
  async searchContent(@Query() searchDto: SearchContentDto) {
    return this.mediaService.searchContent(searchDto.q, searchDto.page || 1);
  }

  @Get('details/:tmdbId')
  @ApiOperation({ summary: 'Obtener detalles de un elemento multimedia' })
  @ApiResponse({ status: 200, description: 'Detalles del elemento multimedia' })
  @ApiResponse({ status: 404, description: 'Elemento no encontrado' })
  async getMediaDetails(@Param('tmdbId') tmdbId: string) {
    const mediaItem = await this.mediaService.getMediaDetails(tmdbId);

    if (!mediaItem) {
      return { error: 'Elemento multimedia no encontrado' };
    }

    return mediaItem;
  }

  @Get('circuit-breaker/stats')
  @ApiOperation({ summary: 'Obtener estadísticas del Circuit Breaker' })
  @ApiResponse({ status: 200, description: 'Estadísticas del Circuit Breaker' })
  async getCircuitBreakerStats() {
    return this.mediaService.getCircuitBreakerStats();
  }

  @Post('cache/cleanup')
  @ApiOperation({ summary: 'Limpiar caché expirado (admin)' })
  @ApiResponse({ status: 200, description: 'Caché limpiado exitosamente' })
  async cleanupCache() {
    await this.mediaService.cleanExpiredCache();
    return { message: 'Cache cleanup initiated' };
  }
}
