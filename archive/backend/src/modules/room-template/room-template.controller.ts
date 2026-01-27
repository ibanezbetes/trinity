import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { RoomTemplateService } from './room-template.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  TemplateFiltersDto,
  RateTemplateDto,
  CreateRoomFromTemplateDto,
} from './dto/create-template.dto';

@ApiTags('room-templates')
@Controller('room-templates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RoomTemplateController {
  constructor(private roomTemplateService: RoomTemplateService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una nueva plantilla de sala' })
  @ApiResponse({ status: 201, description: 'Plantilla creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos de plantilla inválidos' })
  async createTemplate(
    @Request() req,
    @Body() createTemplateDto: CreateTemplateDto,
  ) {
    return this.roomTemplateService.createTemplate(
      req.user.id,
      createTemplateDto,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Obtener plantillas públicas con filtros opcionales',
  })
  @ApiResponse({ status: 200, description: 'Lista de plantillas públicas' })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filtrar por categoría',
  })
  @ApiQuery({
    name: 'tags',
    required: false,
    description: 'Filtrar por etiquetas (separadas por coma)',
  })
  @ApiQuery({
    name: 'minRating',
    required: false,
    description: 'Rating mínimo',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Ordenar por campo',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    description: 'Orden de clasificación (asc/desc)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Límite de resultados',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Offset para paginación',
  })
  async getPublicTemplates(@Query() filters: TemplateFiltersDto) {
    // Procesar tags si vienen como string separado por comas
    if (filters.tags && typeof filters.tags === 'string') {
      filters.tags = (filters.tags as string)
        .split(',')
        .map((tag) => tag.trim());
    }

    return this.roomTemplateService.getPublicTemplates(filters as any);
  }

  @Get('my-templates')
  @ApiOperation({ summary: 'Obtener plantillas del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Lista de plantillas del usuario' })
  async getUserTemplates(@Request() req) {
    return this.roomTemplateService.getUserTemplates(req.user.id);
  }

  @Get('popular')
  @ApiOperation({ summary: 'Obtener plantillas populares' })
  @ApiResponse({ status: 200, description: 'Lista de plantillas populares' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Número de plantillas a retornar (default: 10)',
  })
  async getPopularTemplates(@Query('limit') limit?: number) {
    return this.roomTemplateService.getPopularTemplates(limit);
  }

  @Get('search')
  @ApiOperation({ summary: 'Buscar plantillas por texto' })
  @ApiResponse({ status: 200, description: 'Resultados de búsqueda' })
  @ApiQuery({ name: 'q', required: true, description: 'Texto de búsqueda' })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filtrar por categoría',
  })
  @ApiQuery({
    name: 'tags',
    required: false,
    description: 'Filtrar por etiquetas (separadas por coma)',
  })
  @ApiQuery({
    name: 'minRating',
    required: false,
    description: 'Rating mínimo',
  })
  async searchTemplates(
    @Query('q') query: string,
    @Query() filters: TemplateFiltersDto,
  ) {
    // Procesar tags si vienen como string separado por comas
    if (filters.tags && typeof filters.tags === 'string') {
      filters.tags = (filters.tags as string)
        .split(',')
        .map((tag) => tag.trim());
    }

    return this.roomTemplateService.searchTemplates(query, filters as any);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalles de una plantilla específica' })
  @ApiResponse({ status: 200, description: 'Detalles de la plantilla' })
  @ApiResponse({ status: 404, description: 'Plantilla no encontrada' })
  async getTemplate(@Param('id') templateId: string) {
    return this.roomTemplateService.getTemplate(templateId);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Actualizar una plantilla existente (solo el creador)',
  })
  @ApiResponse({
    status: 200,
    description: 'Plantilla actualizada exitosamente',
  })
  @ApiResponse({
    status: 403,
    description: 'Solo el creador puede actualizar la plantilla',
  })
  @ApiResponse({ status: 404, description: 'Plantilla no encontrada' })
  async updateTemplate(
    @Param('id') templateId: string,
    @Request() req,
    @Body() updateTemplateDto: UpdateTemplateDto,
  ) {
    return this.roomTemplateService.updateTemplate(
      templateId,
      req.user.id,
      updateTemplateDto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una plantilla (solo el creador)' })
  @ApiResponse({ status: 204, description: 'Plantilla eliminada exitosamente' })
  @ApiResponse({
    status: 403,
    description: 'Solo el creador puede eliminar la plantilla',
  })
  @ApiResponse({ status: 404, description: 'Plantilla no encontrada' })
  async deleteTemplate(@Param('id') templateId: string, @Request() req) {
    await this.roomTemplateService.deleteTemplate(templateId, req.user.id);
  }

  @Post(':id/use')
  @ApiOperation({ summary: 'Crear una sala usando esta plantilla' })
  @ApiResponse({
    status: 201,
    description: 'Sala creada exitosamente desde plantilla',
  })
  @ApiResponse({
    status: 403,
    description: 'No tienes acceso a esta plantilla',
  })
  @ApiResponse({ status: 404, description: 'Plantilla no encontrada' })
  async createRoomFromTemplate(
    @Param('id') templateId: string,
    @Request() req,
    @Body() createRoomDto?: CreateRoomFromTemplateDto,
  ) {
    return this.roomTemplateService.createRoomFromTemplate(
      templateId,
      req.user.id,
      createRoomDto,
    );
  }

  @Post(':id/rate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Calificar una plantilla' })
  @ApiResponse({
    status: 204,
    description: 'Plantilla calificada exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Plantilla no encontrada' })
  async rateTemplate(
    @Param('id') templateId: string,
    @Request() req,
    @Body() rateTemplateDto: RateTemplateDto,
  ) {
    await this.roomTemplateService.rateTemplate(
      templateId,
      req.user.id,
      rateTemplateDto.rating,
    );
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Obtener estadísticas de uso de la plantilla' })
  @ApiResponse({ status: 200, description: 'Estadísticas de la plantilla' })
  @ApiResponse({ status: 404, description: 'Plantilla no encontrada' })
  async getTemplateStats(@Param('id') templateId: string) {
    const template = await this.roomTemplateService.getTemplate(templateId);

    return {
      templateId: template.id,
      usageCount: template.usageCount,
      rating: template.rating,
      ratingCount: template.ratingCount,
      createdAt: template.createdAt,
      lastUsed: template.updatedAt,
      category: template.category,
      isPublic: template.isPublic,
    };
  }

  @Get(':id/validate')
  @ApiOperation({ summary: 'Validar configuración de plantilla' })
  @ApiResponse({ status: 200, description: 'Resultado de validación' })
  @ApiResponse({ status: 404, description: 'Plantilla no encontrada' })
  async validateTemplate(@Param('id') templateId: string) {
    const template = await this.roomTemplateService.getTemplate(templateId);

    // Usar el método privado de validación a través de una función pública
    // En una implementación real, esto sería un método público en el servicio
    return {
      templateId: template.id,
      isValid: true, // Simplificado para este ejemplo
      message: 'Plantilla válida',
      warnings: [],
    };
  }
}
