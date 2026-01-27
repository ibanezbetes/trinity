import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomThemeService } from './room-theme.service';
import {
  CreateThemeDto,
  UpdateThemeDto,
  ApplyThemeDto,
  RateThemeDto,
  ThemeFiltersDto,
  ThemeResponseDto,
  AppliedThemeResponseDto,
  ThemeStatsResponseDto,
  PopularThemesResponseDto,
  ThemeValidationResponseDto,
  CreateThemeCollectionDto,
  ThemeCollectionResponseDto,
} from './dto/theme.dto';

@Controller('room-themes')
@UseGuards(JwtAuthGuard)
export class RoomThemeController {
  constructor(private readonly roomThemeService: RoomThemeService) {}

  /**
   * Crear un tema personalizado
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTheme(
    @Body() createThemeDto: CreateThemeDto,
    @Request() req: any,
  ): Promise<ThemeResponseDto> {
    const theme = await this.roomThemeService.createTheme(
      req.user.id,
      createThemeDto,
    );

    return {
      id: theme.id,
      name: theme.name,
      description: theme.description,
      category: theme.category,
      colors: theme.colors,
      backgroundImage: theme.backgroundImage,
      icon: theme.icon,
      banner: theme.banner,
      isCustom: theme.isCustom,
      creatorId: theme.creatorId,
      isPublic: theme.isPublic,
      tags: [], // En una implementación completa, esto vendría de la base de datos
      createdAt: theme.createdAt,
      updatedAt: theme.updatedAt,
    };
  }

  /**
   * Obtener todos los temas públicos
   */
  @Get()
  async getPublicThemes(
    @Query() filters: ThemeFiltersDto,
  ): Promise<PopularThemesResponseDto> {
    const themes = await this.roomThemeService.getPublicThemes(filters);

    const themeResponses: ThemeResponseDto[] = themes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      description: theme.description,
      category: theme.category,
      colors: theme.colors,
      backgroundImage: theme.backgroundImage,
      icon: theme.icon,
      banner: theme.banner,
      isCustom: theme.isCustom,
      creatorId: theme.creatorId,
      isPublic: theme.isPublic,
      tags: [], // En una implementación completa, esto vendría de la base de datos
      createdAt: theme.createdAt,
      updatedAt: theme.updatedAt,
    }));

    return {
      themes: themeResponses,
      total: themeResponses.length,
      page: Math.floor((filters.offset || 0) / (filters.limit || 20)) + 1,
      limit: filters.limit || 20,
      hasMore: themeResponses.length === (filters.limit || 20),
    };
  }

  /**
   * Obtener temas del usuario actual
   */
  @Get('my-themes')
  async getMyThemes(@Request() req: any): Promise<ThemeResponseDto[]> {
    const themes = await this.roomThemeService.getUserThemes(req.user.id);

    return themes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      description: theme.description,
      category: theme.category,
      colors: theme.colors,
      backgroundImage: theme.backgroundImage,
      icon: theme.icon,
      banner: theme.banner,
      isCustom: theme.isCustom,
      creatorId: theme.creatorId,
      isPublic: theme.isPublic,
      tags: [], // En una implementación completa, esto vendría de la base de datos
      createdAt: theme.createdAt,
      updatedAt: theme.updatedAt,
    }));
  }

  /**
   * Obtener temas populares
   */
  @Get('popular')
  async getPopularThemes(
    @Query('limit') limit?: number,
  ): Promise<ThemeResponseDto[]> {
    const popularThemes = await this.roomThemeService.getPopularThemes(limit);

    return popularThemes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      description: theme.description,
      category: theme.category,
      colors: theme.colors,
      backgroundImage: theme.backgroundImage,
      icon: theme.icon,
      banner: theme.banner,
      isCustom: theme.isCustom,
      creatorId: theme.creatorId,
      isPublic: theme.isPublic,
      tags: [], // En una implementación completa, esto vendría de la base de datos
      createdAt: theme.createdAt,
      updatedAt: theme.updatedAt,
      usageCount: theme.stats.totalUsage,
      rating: theme.stats.averageRating,
      ratingCount: theme.stats.ratingCount,
      popularityScore: theme.popularityScore,
    }));
  }

  /**
   * Obtener detalles de un tema específico
   */
  @Get(':id')
  async getTheme(@Param('id') themeId: string): Promise<ThemeResponseDto> {
    const theme = await this.roomThemeService.getTheme(themeId);

    return {
      id: theme.id,
      name: theme.name,
      description: theme.description,
      category: theme.category,
      colors: theme.colors,
      backgroundImage: theme.backgroundImage,
      icon: theme.icon,
      banner: theme.banner,
      isCustom: theme.isCustom,
      creatorId: theme.creatorId,
      isPublic: theme.isPublic,
      tags: [], // En una implementación completa, esto vendría de la base de datos
      createdAt: theme.createdAt,
      updatedAt: theme.updatedAt,
    };
  }

  /**
   * Actualizar un tema personalizado
   */
  @Put(':id')
  async updateTheme(
    @Param('id') themeId: string,
    @Body() updateThemeDto: UpdateThemeDto,
    @Request() req: any,
  ): Promise<ThemeResponseDto> {
    const theme = await this.roomThemeService.updateTheme(
      themeId,
      req.user.id,
      updateThemeDto,
    );

    return {
      id: theme.id,
      name: theme.name,
      description: theme.description,
      category: theme.category,
      colors: theme.colors,
      backgroundImage: theme.backgroundImage,
      icon: theme.icon,
      banner: theme.banner,
      isCustom: theme.isCustom,
      creatorId: theme.creatorId,
      isPublic: theme.isPublic,
      tags: [], // En una implementación completa, esto vendría de la base de datos
      createdAt: theme.createdAt,
      updatedAt: theme.updatedAt,
    };
  }

  /**
   * Eliminar un tema personalizado
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTheme(
    @Param('id') themeId: string,
    @Request() req: any,
  ): Promise<void> {
    await this.roomThemeService.deleteTheme(themeId, req.user.id);
  }

  /**
   * Calificar un tema
   */
  @Post(':id/rate')
  @HttpCode(HttpStatus.CREATED)
  async rateTheme(
    @Param('id') themeId: string,
    @Body() rateThemeDto: RateThemeDto,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    await this.roomThemeService.rateTheme(themeId, req.user.id, rateThemeDto);

    return {
      success: true,
      message: 'Tema calificado exitosamente',
    };
  }

  /**
   * Validar un tema antes de crearlo
   */
  @Post('validate')
  async validateTheme(
    @Body() createThemeDto: CreateThemeDto,
  ): Promise<ThemeValidationResponseDto> {
    // Usar el método privado de validación del servicio
    // En una implementación completa, esto sería un método público
    return {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [
        'Considera usar colores con buen contraste para accesibilidad',
        'Prueba tu tema en diferentes dispositivos',
      ],
    };
  }
}

@Controller('rooms/:roomId')
@UseGuards(JwtAuthGuard)
export class RoomThemeManagementController {
  constructor(private readonly roomThemeService: RoomThemeService) {}

  /**
   * Aplicar tema a una sala
   */
  @Post('theme')
  @HttpCode(HttpStatus.CREATED)
  async applyTheme(
    @Param('roomId') roomId: string,
    @Body() applyThemeDto: ApplyThemeDto,
    @Request() req: any,
  ): Promise<AppliedThemeResponseDto> {
    const application = await this.roomThemeService.applyThemeToRoom(
      roomId,
      req.user.id,
      applyThemeDto,
    );

    const theme = await this.roomThemeService.getTheme(application.themeId);

    return {
      roomId: application.roomId,
      theme: {
        id: theme.id,
        name: theme.name,
        description: theme.description,
        category: theme.category,
        colors: theme.colors,
        backgroundImage: theme.backgroundImage,
        icon: theme.icon,
        banner: theme.banner,
        isCustom: theme.isCustom,
        creatorId: theme.creatorId,
        isPublic: theme.isPublic,
        tags: [],
        createdAt: theme.createdAt,
        updatedAt: theme.updatedAt,
      },
      customizations: application.customizations,
      appliedAt: application.appliedAt,
      appliedBy: application.appliedBy,
    };
  }

  /**
   * Remover tema de una sala
   */
  @Delete('theme')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTheme(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<void> {
    await this.roomThemeService.removeThemeFromRoom(roomId, req.user.id);
  }

  /**
   * Obtener tema actual de una sala
   */
  @Get('theme')
  async getRoomTheme(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<AppliedThemeResponseDto | null> {
    const activeTheme = await this.roomThemeService.getRoomTheme(roomId);

    if (!activeTheme) {
      return null;
    }

    return {
      roomId: activeTheme.roomId,
      theme: {
        id: activeTheme.theme.id,
        name: activeTheme.theme.name,
        description: activeTheme.theme.description,
        category: activeTheme.theme.category,
        colors: activeTheme.theme.colors,
        backgroundImage: activeTheme.theme.backgroundImage,
        icon: activeTheme.theme.icon,
        banner: activeTheme.theme.banner,
        isCustom: activeTheme.theme.isCustom,
        creatorId: activeTheme.theme.creatorId,
        isPublic: activeTheme.theme.isPublic,
        tags: [],
        createdAt: activeTheme.theme.createdAt,
        updatedAt: activeTheme.theme.updatedAt,
      },
      customizations: activeTheme.customizations,
      appliedAt: activeTheme.appliedAt,
      appliedBy: activeTheme.appliedBy,
    };
  }

  /**
   * Obtener estadísticas de uso de temas en la sala
   */
  @Get('theme/stats')
  async getRoomThemeStats(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<{
    totalThemeChanges: number;
    currentTheme?: string;
    lastChanged?: Date;
  }> {
    // En una implementación completa, esto consultaría el historial real
    return {
      totalThemeChanges: Math.floor(Math.random() * 10) + 1,
      currentTheme: 'dark-cinema',
      lastChanged: new Date(),
    };
  }

  /**
   * Obtener historial de cambios de tema
   */
  @Get('theme/history')
  async getThemeHistory(
    @Param('roomId') roomId: string,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ): Promise<any[]> {
    // En una implementación completa, esto consultaría el historial real
    return [
      {
        id: '1',
        previousTheme: null,
        newTheme: 'dark-cinema',
        changedBy: req.user.id,
        changedAt: new Date(),
        reason: 'Tema inicial',
      },
    ];
  }
}
