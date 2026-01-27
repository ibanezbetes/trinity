import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import {
  RoomTheme,
  ThemeCategory,
} from '../../domain/entities/room-template.entity';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import {
  ThemeUsageStats,
  PopularTheme,
  RoomThemeApplication,
  ThemeCustomizations,
  ThemeRating,
  ThemeFilters,
  ThemeSortBy,
  ThemeValidationResult,
  ActiveRoomTheme,
  ThemeChangeHistory,
  ThemeCollection,
  ThemeRecommendation,
  AutoThemeConfig,
} from '../../domain/entities/room-theme.entity';
import {
  CreateThemeDto,
  UpdateThemeDto,
  ApplyThemeDto,
  RateThemeDto,
  ThemeFiltersDto,
  ThemeCustomizationsDto,
  CreateThemeCollectionDto,
  AutoThemeConfigDto,
} from './dto/theme.dto';
import { RoomService } from '../room/room.service';
import { EventTracker } from '../analytics/event-tracker.service';
import { EventType } from '../analytics/interfaces/analytics.interfaces';
import { v4 as uuidv4 } from 'uuid';

/**
 * Temas predefinidos del sistema
 */
const SYSTEM_THEMES: Partial<RoomTheme>[] = [
  {
    id: 'dark-cinema',
    name: 'Cine Oscuro',
    description: 'Tema oscuro perfecto para noches de película',
    category: ThemeCategory.MOVIE_GENRES,
    colors: {
      primary: '#1a1a1a',
      secondary: '#2d2d2d',
      accent: '#ff6b35',
      background: '#0f0f0f',
      text: '#ffffff',
    },
    isCustom: false,
    isPublic: true,
  },
  {
    id: 'cozy-autumn',
    name: 'Otoño Acogedor',
    description: 'Colores cálidos de otoño para una experiencia acogedora',
    category: ThemeCategory.SEASONAL,
    colors: {
      primary: '#8b4513',
      secondary: '#cd853f',
      accent: '#ff8c00',
      background: '#2f1b14',
      text: '#f5deb3',
    },
    isCustom: false,
    isPublic: true,
  },
  {
    id: 'minimal-clean',
    name: 'Minimalista Limpio',
    description: 'Diseño limpio y minimalista',
    category: ThemeCategory.MINIMAL,
    colors: {
      primary: '#ffffff',
      secondary: '#f8f9fa',
      accent: '#007bff',
      background: '#ffffff',
      text: '#212529',
    },
    isCustom: false,
    isPublic: true,
  },
  {
    id: 'vibrant-party',
    name: 'Fiesta Vibrante',
    description: 'Colores brillantes y energéticos',
    category: ThemeCategory.COLORFUL,
    colors: {
      primary: '#ff1744',
      secondary: '#ff5722',
      accent: '#ffeb3b',
      background: '#1a1a1a',
      text: '#ffffff',
    },
    isCustom: false,
    isPublic: true,
  },
  {
    id: 'horror-night',
    name: 'Noche de Terror',
    description: 'Tema tenebroso para películas de horror',
    category: ThemeCategory.MOVIE_GENRES,
    colors: {
      primary: '#8b0000',
      secondary: '#2f0000',
      accent: '#ff0000',
      background: '#000000',
      text: '#ffffff',
    },
    isCustom: false,
    isPublic: true,
  },
];

@Injectable()
export class RoomThemeService {
  private readonly logger = new Logger(RoomThemeService.name);

  constructor(
    private dynamoDBService: DynamoDBService,
    private roomService: RoomService,
    private eventTracker: EventTracker,
    private realtimeService: RealtimeCompatibilityService,
  ) {}

  /**
   * Crear un tema personalizado
   */
  async createTheme(
    userId: string,
    createThemeDto: CreateThemeDto,
  ): Promise<RoomTheme> {
    // Validar el tema
    const validationResult = await this.validateTheme(createThemeDto);
    if (!validationResult.isValid) {
      throw new BadRequestException(
        `Tema inválido: ${validationResult.errors.join(', ')}`,
      );
    }

    // Verificar que el nombre no exista para el usuario
    const existingThemes = await this.getUserThemes(userId);
    const nameExists = existingThemes.some(
      (theme) => theme.name.toLowerCase() === createThemeDto.name.toLowerCase(),
    );

    if (nameExists) {
      throw new ConflictException('Ya tienes un tema con ese nombre');
    }

    const themeId = uuidv4();
    const now = new Date();

    const theme: RoomTheme = {
      id: themeId,
      name: createThemeDto.name,
      description: createThemeDto.description,
      category: createThemeDto.category,
      colors: createThemeDto.colors,
      backgroundImage: createThemeDto.backgroundImage,
      icon: createThemeDto.icon,
      banner: createThemeDto.banner,
      isCustom: true,
      creatorId: userId,
      isPublic: createThemeDto.isPublic || false,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.themePK(themeId),
        SK: DynamoDBKeys.themeSK(),
        GSI1PK: DynamoDBKeys.themeGSI1PK(userId),
        GSI1SK: DynamoDBKeys.themeGSI1SK(now.toISOString()),
        GSI2PK: DynamoDBKeys.themeGSI2PK(createThemeDto.category),
        GSI2SK: DynamoDBKeys.themeGSI2SK(0, themeId), // 0 usage initially
        tags: createThemeDto.tags || [],
        ...theme,
      });

      // 📝 Track theme creation event
      // await this.eventTracker.trackEvent(
      //   EventType.THEME_CREATED,
      //   userId,
      //   {
      //     themeId,
      //     themeName: createThemeDto.name,
      //     category: createThemeDto.category,
      //     isPublic: createThemeDto.isPublic || false,
      //     isCustom: true,
      //     colorsCount: Object.keys(createThemeDto.colors).length,
      //     hasCustomizations: !!(createThemeDto as any).customizations,
      //   },
      //   {
      //     source: 'room_theme_service',
      //     userAgent: 'backend',
      //   },
      // );

      this.logger.log(`Tema creado: ${themeId} por usuario ${userId}`);
      return theme;
    } catch (error) {
      this.logger.error(`Error creando tema: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener todos los temas públicos
   */
  async getPublicThemes(filters: ThemeFiltersDto = {}): Promise<RoomTheme[]> {
    try {
      let themes: RoomTheme[] = [];

      // Obtener temas del sistema
      const systemThemes = SYSTEM_THEMES.map((theme) => ({
        ...theme,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as RoomTheme[];

      // Filtrar temas del sistema por categoría si se especifica
      if (filters.category) {
        themes = systemThemes.filter(
          (theme) => theme.category === filters.category,
        );
      } else {
        themes = [...systemThemes];
      }

      // Obtener temas personalizados públicos
      const baseExpressionValues = filters.category
        ? { ':category': DynamoDBKeys.themeGSI2PK(filters.category) }
        : { ':prefix': 'CATEGORY#' };

      const queryParams: any = {
        IndexName: 'GSI2',
        KeyConditionExpression: filters.category
          ? 'GSI2PK = :category'
          : 'begins_with(GSI2PK, :prefix)',
        ExpressionAttributeValues: {
          ...baseExpressionValues,
          ':isPublic': true,
          ':isCustom': true,
        },
        FilterExpression: 'isPublic = :isPublic AND isCustom = :isCustom',
      };

      const result = await this.dynamoDBService.query(queryParams);
      const customThemes = (result as any).Items?.map((item: any) => item as RoomTheme) || [];

      themes.push(...customThemes);

      // Aplicar filtros adicionales
      themes = await this.applyThemeFilters(themes, filters);

      // Ordenar y paginar
      themes = this.sortAndPaginateThemes(themes, filters);

      return themes;
    } catch (error) {
      this.logger.error(`Error obteniendo temas públicos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener temas de un usuario
   */
  async getUserThemes(userId: string): Promise<RoomTheme[]> {
    try {
      const result = await this.dynamoDBService.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :userId',
        ExpressionAttributeValues: {
          ':userId': DynamoDBKeys.themeGSI1PK(userId),
        },
      });

      return (result as any).Items?.map((item: any) => item as RoomTheme) || [];
    } catch (error) {
      this.logger.error(
        `Error obteniendo temas de usuario ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener un tema por ID
   */
  async getTheme(themeId: string): Promise<RoomTheme> {
    // Verificar si es un tema del sistema
    const systemTheme = SYSTEM_THEMES.find((theme) => theme.id === themeId);
    if (systemTheme) {
      return {
        ...systemTheme,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as RoomTheme;
    }

    // Buscar en temas personalizados
    const result = await this.dynamoDBService.getItem(
      DynamoDBKeys.themePK(themeId),
      DynamoDBKeys.themeSK(),
    );

    if (!result) {
      throw new NotFoundException('Tema no encontrado');
    }

    return result as unknown as RoomTheme;
  }

  /**
   * Actualizar un tema personalizado
   */
  async updateTheme(
    themeId: string,
    userId: string,
    updateThemeDto: UpdateThemeDto,
  ): Promise<RoomTheme> {
    // Verificar que el tema existe y pertenece al usuario
    const theme = await this.getTheme(themeId);

    if (!theme.isCustom) {
      throw new ForbiddenException('No se pueden modificar temas del sistema');
    }

    if (theme.creatorId !== userId) {
      throw new ForbiddenException('Solo puedes modificar tus propios temas');
    }

    // Validar actualizaciones solo si hay cambios en campos críticos
    if (
      updateThemeDto.colors ||
      (updateThemeDto.name !== undefined &&
        updateThemeDto.name.trim() !== '') ||
      (updateThemeDto.description !== undefined &&
        updateThemeDto.description.trim() !== '')
    ) {
      // Crear datos de validación con valores actualizados
      const validationData = { ...theme };

      if (
        updateThemeDto.name !== undefined &&
        updateThemeDto.name.trim() !== ''
      ) {
        validationData.name = updateThemeDto.name;
      }
      if (
        updateThemeDto.description !== undefined &&
        updateThemeDto.description.trim() !== ''
      ) {
        validationData.description = updateThemeDto.description;
      }
      if (updateThemeDto.colors !== undefined) {
        validationData.colors = updateThemeDto.colors;
      }

      const validationResult = await this.validateTheme(validationData);
      if (!validationResult.isValid) {
        throw new BadRequestException(
          `Tema inválido: ${validationResult.errors.join(', ')}`,
        );
      }
    }

    // Crear objeto actualizado solo con propiedades definidas
    const updatedTheme: RoomTheme = {
      ...theme,
      updatedAt: new Date(),
    };

    // Solo actualizar propiedades que están definidas y no vacías
    if (
      updateThemeDto.name !== undefined &&
      updateThemeDto.name.trim() !== ''
    ) {
      updatedTheme.name = updateThemeDto.name;
    }
    if (
      updateThemeDto.description !== undefined &&
      updateThemeDto.description.trim() !== ''
    ) {
      updatedTheme.description = updateThemeDto.description;
    }
    if (updateThemeDto.category !== undefined) {
      updatedTheme.category = updateThemeDto.category;
    }
    if (updateThemeDto.colors !== undefined) {
      updatedTheme.colors = updateThemeDto.colors;
    }
    if (updateThemeDto.backgroundImage !== undefined) {
      updatedTheme.backgroundImage = updateThemeDto.backgroundImage;
    }
    if (updateThemeDto.icon !== undefined) {
      updatedTheme.icon = updateThemeDto.icon;
    }
    if (updateThemeDto.banner !== undefined) {
      updatedTheme.banner = updateThemeDto.banner;
    }
    if (updateThemeDto.isPublic !== undefined) {
      updatedTheme.isPublic = updateThemeDto.isPublic;
    }

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.themePK(themeId),
        SK: DynamoDBKeys.themeSK(),
        GSI1PK: DynamoDBKeys.themeGSI1PK(userId),
        GSI1SK: DynamoDBKeys.themeGSI1SK(theme.createdAt.toISOString()),
        GSI2PK: DynamoDBKeys.themeGSI2PK(updatedTheme.category),
        GSI2SK: DynamoDBKeys.themeGSI2SK(0, themeId), // Mantener usage count
        ...updatedTheme,
      });

      this.logger.log(`Tema actualizado: ${themeId} por usuario ${userId}`);
      return updatedTheme;
    } catch (error) {
      this.logger.error(`Error actualizando tema: ${error.message}`);
      throw error;
    }
  }

  /**
   * Eliminar un tema personalizado
   */
  async deleteTheme(themeId: string, userId: string): Promise<void> {
    // Verificar que el tema existe y pertenece al usuario
    const theme = await this.getTheme(themeId);

    if (!theme.isCustom) {
      throw new ForbiddenException('No se pueden eliminar temas del sistema');
    }

    if (theme.creatorId !== userId) {
      throw new ForbiddenException('Solo puedes eliminar tus propios temas');
    }

    // Verificar que no hay salas usando el tema
    const activeApplications = await this.getThemeApplications(themeId);
    if (activeApplications.length > 0) {
      throw new ConflictException(
        'No se puede eliminar un tema que está siendo usado por salas',
      );
    }

    try {
      await this.dynamoDBService.deleteItem(
        DynamoDBKeys.themePK(themeId),
        DynamoDBKeys.themeSK(),
      );

      this.logger.log(`Tema eliminado: ${themeId} por usuario ${userId}`);
    } catch (error) {
      this.logger.error(`Error eliminando tema: ${error.message}`);
      throw error;
    }
  }

  /**
   * Aplicar tema a una sala
   */
  async applyThemeToRoom(
    roomId: string,
    userId: string,
    applyThemeDto: ApplyThemeDto,
  ): Promise<RoomThemeApplication> {
    // Verificar que el usuario tiene permisos en la sala
    await this.verifyRoomAccess(roomId, userId);

    // Verificar que el tema existe
    const theme = await this.getTheme(applyThemeDto.themeId);

    // Verificar acceso al tema (si es privado)
    if (theme.isCustom && !theme.isPublic && theme.creatorId !== userId) {
      throw new ForbiddenException('No tienes acceso a este tema');
    }

    const applicationId = uuidv4();
    const now = new Date();

    // Desactivar aplicación anterior si existe
    await this.deactivatePreviousTheme(roomId);

    const application: RoomThemeApplication = {
      roomId,
      themeId: applyThemeDto.themeId,
      appliedBy: userId,
      appliedAt: now,
      customizations: applyThemeDto.customizations,
      isActive: true,
    };

    try {
      // Guardar aplicación de tema
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomThemeApplicationPK(roomId),
        SK: DynamoDBKeys.roomThemeApplicationSK(applyThemeDto.themeId),
        GSI1PK: DynamoDBKeys.themeApplicationGSI1PK(applyThemeDto.themeId),
        GSI1SK: DynamoDBKeys.themeApplicationGSI1SK(now.toISOString()),
        id: applicationId,
        ...application,
      });

      // Incrementar contador de uso del tema
      await this.incrementThemeUsage(applyThemeDto.themeId);

      // Registrar en historial
      await this.recordThemeChange(
        roomId,
        undefined,
        applyThemeDto.themeId,
        userId,
        applyThemeDto.reason,
      );

      // 📝 Track theme application event
      // await this.eventTracker.trackEvent(
      //   EventType.THEME_APPLIED,
      //   userId,
      //   {
      //     themeId: applyThemeDto.themeId,
      //     themeName: theme.name,
      //     roomId,
      //     hasCustomizations: !!applyThemeDto.customizations,
      //     reason: applyThemeDto.reason,
      //     isSystemTheme: !theme.isCustom,
      //   },
      //   {
      //     source: 'room_theme_service',
      //     userAgent: 'backend',
      //   },
      // );

      // 🔔 Notificar cambio de tema en tiempo real
      await this.realtimeService.notifyThemeChange(roomId, {
        themeId: applyThemeDto.themeId,
        themeName: theme.name,
        action: 'applied',
        appliedBy: userId,
        customizations: applyThemeDto.customizations,
      });

      this.logger.log(
        `Tema ${applyThemeDto.themeId} aplicado a sala ${roomId} por usuario ${userId}`,
      );
      return application;
    } catch (error) {
      this.logger.error(`Error aplicando tema: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remover tema de una sala
   */
  async removeThemeFromRoom(roomId: string, userId: string): Promise<void> {
    // Verificar que el usuario tiene permisos en la sala
    await this.verifyRoomAccess(roomId, userId);

    // Obtener tema actual
    const currentTheme = await this.getRoomTheme(roomId);
    if (!currentTheme) {
      throw new NotFoundException('La sala no tiene tema aplicado');
    }

    try {
      // Desactivar aplicación actual
      await this.deactivatePreviousTheme(roomId);

      // Registrar en historial
      await this.recordThemeChange(
        roomId,
        currentTheme.theme.id,
        undefined,
        userId,
        'Tema removido',
      );

      // 📝 Track theme removal event
      // await this.eventTracker.trackEvent(
      //   EventType.THEME_REMOVED,
      //   userId,
      //   {
      //     themeId: currentTheme.theme.id,
      //     themeName: currentTheme.theme.name,
      //     roomId,
      //     reason: 'Tema removido',
      //   },
      //   {
      //     source: 'room_theme_service',
      //     userAgent: 'backend',
      //   },
      // );

      // 🔔 Notificar remoción de tema en tiempo real
      await this.realtimeService.notifyThemeChange(roomId, {
        themeId: currentTheme.theme.id,
        themeName: currentTheme.theme.name,
        action: 'removed',
        appliedBy: userId,
      });

      this.logger.log(`Tema removido de sala ${roomId} por usuario ${userId}`);
    } catch (error) {
      this.logger.error(`Error removiendo tema: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener tema actual de una sala
   */
  async getRoomTheme(roomId: string): Promise<ActiveRoomTheme | null> {
    try {
      const result = await this.dynamoDBService.query({
        KeyConditionExpression: 'PK = :pk',
        FilterExpression: 'isActive = :isActive',
        ExpressionAttributeValues: {
          ':pk': DynamoDBKeys.roomThemeApplicationPK(roomId),
          ':isActive': true,
        },
      });

      const application = (result as any).Items?.[0] as RoomThemeApplication;
      if (!application) {
        return null;
      }

      const theme = await this.getTheme(application.themeId);

      return {
        roomId: application.roomId,
        theme,
        customizations: application.customizations,
        appliedAt: application.appliedAt,
        appliedBy: application.appliedBy,
      };
    } catch (error) {
      this.logger.error(
        `Error obteniendo tema de sala ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Calificar un tema
   */
  async rateTheme(
    themeId: string,
    userId: string,
    rateThemeDto: RateThemeDto,
  ): Promise<ThemeRating> {
    // Verificar que el tema existe
    await this.getTheme(themeId);

    const ratingId = uuidv4();
    const now = new Date();

    const rating: ThemeRating = {
      themeId,
      userId,
      rating: rateThemeDto.rating,
      comment: rateThemeDto.comment,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.themeRatingPK(themeId),
        SK: DynamoDBKeys.themeRatingSK(userId),
        GSI1PK: DynamoDBKeys.themeRatingGSI1PK(userId),
        GSI1SK: DynamoDBKeys.themeRatingGSI1SK(now.toISOString()),
        id: ratingId,
        ...rating,
      });

      // 📝 Track theme rating event
      // await this.eventTracker.trackEvent(
      //   EventType.THEME_RATED,
      //   userId,
      //   {
      //     themeId,
      //     rating: rateThemeDto.rating,
      //     hasComment: !!rateThemeDto.comment,
      //     commentLength: rateThemeDto.comment?.length || 0,
      //   },
      //   {
      //     source: 'room_theme_service',
      //     userAgent: 'backend',
      //   },
      // );

      this.logger.log(
        `Tema ${themeId} calificado por usuario ${userId}: ${rateThemeDto.rating}/5`,
      );
      return rating;
    } catch (error) {
      this.logger.error(`Error calificando tema: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener temas populares
   */
  async getPopularThemes(limit: number = 10): Promise<PopularTheme[]> {
    try {
      // Para esta implementación, devolvemos los temas del sistema como populares
      // En una implementación completa, esto calcularía popularidad basada en uso y ratings
      const systemThemes = SYSTEM_THEMES.map((theme) => ({
        ...theme,
        createdAt: new Date(),
        updatedAt: new Date(),
        stats: {
          themeId: theme.id!,
          totalUsage: Math.floor(Math.random() * 1000) + 100,
          recentUsage: Math.floor(Math.random() * 100) + 10,
          averageRating: 4 + Math.random(),
          ratingCount: Math.floor(Math.random() * 50) + 10,
          activeRooms: Math.floor(Math.random() * 20) + 5,
          popularityScore: Math.floor(Math.random() * 50) + 50, // Limitado a 50-100
        },
        isRecommended: true,
        popularityScore: Math.floor(Math.random() * 50) + 50, // Limitado a 50-100
      })) as PopularTheme[];

      return systemThemes.slice(0, limit);
    } catch (error) {
      this.logger.error(`Error obteniendo temas populares: ${error.message}`);
      throw error;
    }
  }

  // Métodos auxiliares privados

  private async validateTheme(themeData: any): Promise<ThemeValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validar nombre
      if (!themeData.name || themeData.name.trim().length < 3) {
        errors.push('El nombre debe tener al menos 3 caracteres');
      }

      // Validar descripción
      if (!themeData.description || themeData.description.trim().length < 10) {
        errors.push('La descripción debe tener al menos 10 caracteres');
      }

      // Validar colores
      if (themeData.colors) {
        const colorFields = [
          'primary',
          'secondary',
          'accent',
          'background',
          'text',
        ];
        for (const field of colorFields) {
          const color = themeData.colors[field];
          if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
            errors.push(`Color ${field} debe ser un código hexadecimal válido`);
          }
        }

        // Verificar contraste
        if (
          this.calculateContrast(
            themeData.colors.background,
            themeData.colors.text,
          ) < 4.5
        ) {
          warnings.push(
            'El contraste entre fondo y texto puede ser insuficiente para accesibilidad',
          );
        }
      }

      // Validar URLs si están presentes
      const urlFields = ['backgroundImage', 'icon', 'banner'];
      for (const field of urlFields) {
        if (themeData[field] && !this.isValidUrl(themeData[field])) {
          errors.push(`${field} debe ser una URL válida`);
        }
      }
    } catch (error) {
      errors.push(`Error validando tema: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private async applyThemeFilters(
    themes: RoomTheme[],
    filters: ThemeFiltersDto,
  ): Promise<RoomTheme[]> {
    let filteredThemes = [...themes];

    // Filtrar por rating mínimo
    if (filters.minRating) {
      // En una implementación completa, esto consultaría ratings reales
      filteredThemes = filteredThemes.filter(() => Math.random() > 0.3); // Simulación
    }

    // Filtrar por tags
    if (filters.tags && filters.tags.length > 0) {
      // En una implementación completa, esto filtrarían por tags reales
      filteredThemes = filteredThemes.filter(() => Math.random() > 0.2); // Simulación
    }

    // Filtrar por creador
    if (filters.creatorId) {
      filteredThemes = filteredThemes.filter(
        (theme) => theme.creatorId === filters.creatorId,
      );
    }

    return filteredThemes;
  }

  private sortAndPaginateThemes(
    themes: RoomTheme[],
    filters: ThemeFiltersDto,
  ): RoomTheme[] {
    // Ordenar
    themes.sort((a, b) => {
      switch (filters.sortBy) {
        case ThemeSortBy.NAME:
          return filters.sortOrder === 'asc'
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        case ThemeSortBy.CREATED_AT:
          return filters.sortOrder === 'asc'
            ? a.createdAt.getTime() - b.createdAt.getTime()
            : b.createdAt.getTime() - a.createdAt.getTime();
        default:
          // Por defecto ordenar por popularidad (simulado)
          return Math.random() - 0.5;
      }
    });

    // Paginar
    const offset = filters.offset || 0;
    const limit = filters.limit || 20;
    return themes.slice(offset, offset + limit);
  }

  private async verifyRoomAccess(
    roomId: string,
    userId: string,
  ): Promise<void> {
    try {
      const room = await this.roomService.getRoom(roomId);

      // Verificar que el usuario es miembro de la sala
      const isMember = room && (room as any).members?.some((member: any) => member.userId === userId);
      if (!isMember) {
        throw new ForbiddenException('No tienes acceso a esta sala');
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Sala no encontrada');
      }
      throw error;
    }
  }

  private async deactivatePreviousTheme(roomId: string): Promise<void> {
    // En una implementación completa, esto desactivaría el tema anterior
    // Por ahora, simplemente registramos la acción
    this.logger.log(`Desactivando tema anterior para sala ${roomId}`);
  }

  private async incrementThemeUsage(themeId: string): Promise<void> {
    // En una implementación completa, esto incrementaría el contador de uso
    this.logger.log(`Incrementando uso del tema ${themeId}`);
  }

  private async recordThemeChange(
    roomId: string,
    previousThemeId: string | undefined,
    newThemeId: string | undefined,
    userId: string,
    reason?: string,
  ): Promise<void> {
    const changeId = uuidv4();
    const now = new Date();

    const change: ThemeChangeHistory = {
      id: changeId,
      roomId,
      previousThemeId,
      newThemeId: newThemeId || '',
      changedBy: userId,
      changedAt: now,
      reason,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.themeChangeHistoryPK(roomId),
        SK: DynamoDBKeys.themeChangeHistorySK(changeId),
        GSI1PK: DynamoDBKeys.themeChangeHistoryGSI1PK(userId),
        GSI1SK: DynamoDBKeys.themeChangeHistoryGSI1SK(now.toISOString()),
        ...change,
      });
    } catch (error) {
      this.logger.error(`Error registrando cambio de tema: ${error.message}`);
      // No lanzar error para no interrumpir el flujo principal
    }
  }

  private async getThemeApplications(
    themeId: string,
  ): Promise<RoomThemeApplication[]> {
    try {
      const result = await this.dynamoDBService.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :themeId',
        FilterExpression: 'isActive = :isActive',
        ExpressionAttributeValues: {
          ':themeId': DynamoDBKeys.themeApplicationGSI1PK(themeId),
          ':isActive': true,
        },
      });

      return (result as any).Items?.map((item: any) => item as RoomThemeApplication) || [];
    } catch (error) {
      this.logger.error(
        `Error obteniendo aplicaciones de tema ${themeId}: ${error.message}`,
      );
      return [];
    }
  }

  private calculateContrast(color1: string, color2: string): number {
    // Implementación simplificada del cálculo de contraste
    // En una implementación real, esto usaría la fórmula WCAG
    return 4.5; // Simulación
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
