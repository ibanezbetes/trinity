import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import {
  RoomTemplate,
  TemplateCategory,
  TemplateFilters,
  TemplateSortBy,
  TemplateValidationResult,
  TemplateUsageStats,
  PopularTemplate,
  AdvancedRoomSettings,
  ConsensusType,
  RoomPrivacy,
} from '../../domain/entities/room-template.entity';
import { Room, CreateRoomDto } from '../../domain/entities/room.entity';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  RateTemplateDto,
  CreateRoomFromTemplateDto,
} from './dto/create-template.dto';
import { RoomService } from '../room/room.service';
import { EventTracker } from '../analytics/event-tracker.service';
import { EventType } from '../analytics/interfaces/analytics.interfaces';

@Injectable()
export class RoomTemplateService {
  private readonly logger = new Logger(RoomTemplateService.name);

  constructor(
    private dynamoDBService: DynamoDBService,
    private roomService: RoomService,
    private eventTracker: EventTracker,
  ) {}

  /**
   * Crear una nueva plantilla de sala
   */
  async createTemplate(
    creatorId: string,
    templateData: CreateTemplateDto,
  ): Promise<RoomTemplate> {
    // Validar configuración de plantilla
    const validationResult = await this.validateTemplateConfiguration(
      templateData.configuration,
    );
    if (!validationResult.isValid) {
      throw new BadRequestException(
        `Configuración de plantilla inválida: ${validationResult.errors.join(', ')}`,
      );
    }

    const templateId = uuidv4();
    const now = new Date();

    const template: RoomTemplate = {
      id: templateId,
      name: templateData.name,
      description: templateData.description,
      creatorId,
      isPublic: templateData.isPublic,
      category: templateData.category,
      configuration: templateData.configuration,
      usageCount: 0,
      rating: 0,
      ratingCount: 0,
      tags: templateData.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    // Guardar plantilla en DynamoDB
    await this.dynamoDBService.putItem({
      PK: DynamoDBKeys.templatePK(templateId),
      SK: DynamoDBKeys.templateSK(),
      GSI1PK: DynamoDBKeys.templateGSI1PK(creatorId),
      GSI1SK: DynamoDBKeys.templateGSI1SK(now.toISOString()),
      GSI2PK: DynamoDBKeys.templateGSI2PK(templateData.category),
      GSI2SK: DynamoDBKeys.templateGSI2SK(0, templateId), // usageCount inicial 0
      ...template,
    });

    // 📝 Track template creation event
    // await this.eventTracker.trackEvent(
    //   EventType.TEMPLATE_CREATED,
    //   creatorId,
    //   {
    //     templateId,
    //     templateName: templateData.name,
    //     category: templateData.category,
    //     isPublic: templateData.isPublic,
    //     tagsCount: templateData.tags?.length || 0,
    //   },
    //   {
    //     source: 'room_template_service',
    //     userAgent: 'backend',
    //   },
    // );

    this.logger.log(`Plantilla creada: ${templateId} por usuario ${creatorId}`);
    return template;
  }

  /**
   * Obtener plantilla por ID
   */
  async getTemplate(templateId: string): Promise<RoomTemplate> {
    try {
      const item = await this.dynamoDBService.getItem(
        DynamoDBKeys.templatePK(templateId),
        DynamoDBKeys.templateSK(),
      );

      if (!item) {
        throw new NotFoundException('Plantilla no encontrada');
      }

      return item as unknown as RoomTemplate;
    } catch (error) {
      this.logger.error(
        `Error getting template ${templateId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Actualizar plantilla existente
   */
  async updateTemplate(
    templateId: string,
    userId: string,
    updates: UpdateTemplateDto,
  ): Promise<RoomTemplate> {
    const template = await this.getTemplate(templateId);

    if (template.creatorId !== userId) {
      throw new ForbiddenException(
        'Solo el creador puede actualizar la plantilla',
      );
    }

    // Validar nueva configuración si se proporciona
    if (updates.configuration) {
      const validationResult = await this.validateTemplateConfiguration(
        updates.configuration,
      );
      if (!validationResult.isValid) {
        throw new BadRequestException(
          `Configuración inválida: ${validationResult.errors.join(', ')}`,
        );
      }
    }

    const updatedTemplate: RoomTemplate = {
      ...template,
      ...updates,
      updatedAt: new Date(),
    };

    // Actualizar en DynamoDB
    await this.dynamoDBService.putItem({
      PK: DynamoDBKeys.templatePK(templateId),
      SK: DynamoDBKeys.templateSK(),
      GSI1PK: DynamoDBKeys.templateGSI1PK(template.creatorId),
      GSI1SK: DynamoDBKeys.templateGSI1SK(template.createdAt.toISOString()),
      GSI2PK: DynamoDBKeys.templateGSI2PK(updatedTemplate.category),
      GSI2SK: DynamoDBKeys.templateGSI2SK(template.usageCount, templateId),
      ...updatedTemplate,
    });

    this.logger.log(`Plantilla actualizada: ${templateId}`);
    return updatedTemplate;
  }

  /**
   * Eliminar plantilla
   */
  async deleteTemplate(templateId: string, userId: string): Promise<void> {
    const template = await this.getTemplate(templateId);

    if (template.creatorId !== userId) {
      throw new ForbiddenException(
        'Solo el creador puede eliminar la plantilla',
      );
    }

    await this.dynamoDBService.deleteItem(
      DynamoDBKeys.templatePK(templateId),
      DynamoDBKeys.templateSK(),
    );

    this.logger.log(`Plantilla eliminada: ${templateId}`);
  }

  /**
   * Obtener plantillas públicas con filtros
   */
  async getPublicTemplates(filters?: TemplateFilters): Promise<RoomTemplate[]> {
    try {
      const queryParams: any = {
        FilterExpression: 'isPublic = :isPublic',
        ExpressionAttributeValues: {
          ':isPublic': true,
        },
      };

      // Aplicar filtros adicionales
      if (filters?.category) {
        queryParams.IndexName = 'GSI2';
        queryParams.KeyConditionExpression = 'GSI2PK = :gsi2pk';
        queryParams.ExpressionAttributeValues[':gsi2pk'] =
          DynamoDBKeys.templateGSI2PK(filters.category);
      }

      if (filters?.minRating) {
        queryParams.FilterExpression += ' AND rating >= :minRating';
        queryParams.ExpressionAttributeValues[':minRating'] = filters.minRating;
      }

      if (filters?.tags && filters.tags.length > 0) {
        const tagConditions = filters.tags
          .map((_, index) => `contains(tags, :tag${index})`)
          .join(' OR ');
        queryParams.FilterExpression += ` AND (${tagConditions})`;
        filters.tags.forEach((tag, index) => {
          queryParams.ExpressionAttributeValues[`:tag${index}`] = tag;
        });
      }

      const items = await this.dynamoDBService.query(queryParams);
      let templates = items as unknown as RoomTemplate[];

      // Aplicar ordenamiento
      if (filters?.sortBy) {
        templates = this.sortTemplates(
          templates,
          filters.sortBy,
          filters.sortOrder || 'desc',
        );
      }

      // Aplicar paginación
      if ((filters as any)?.limit || (filters as any)?.offset) {
        const offset = (filters as any)?.offset || 0;
        const limit = (filters as any)?.limit || 20;
        templates = templates.slice(offset, offset + limit);
      }

      return templates;
    } catch (error) {
      this.logger.error(`Error getting public templates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener plantillas del usuario
   */
  async getUserTemplates(userId: string): Promise<RoomTemplate[]> {
    try {
      const items = await this.dynamoDBService.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk',
        ExpressionAttributeValues: {
          ':gsi1pk': DynamoDBKeys.templateGSI1PK(userId),
        },
      });

      return items as unknown as RoomTemplate[];
    } catch (error) {
      this.logger.error(
        `Error getting user templates for ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener plantillas populares
   */
  async getPopularTemplates(limit: number = 10): Promise<PopularTemplate[]> {
    try {
      const items = await this.dynamoDBService.query({
        IndexName: 'GSI2',
        KeyConditionExpression: 'begins_with(GSI2PK, :prefix)',
        FilterExpression: 'isPublic = :isPublic',
        ExpressionAttributeValues: {
          ':prefix': 'CATEGORY#',
          ':isPublic': true,
        },
        ScanIndexForward: false, // Ordenar por usageCount descendente
        Limit: limit * 2, // Obtener más para filtrar después
      });

      let templates = items as unknown as RoomTemplate[];

      // Ordenar por popularidad (usageCount + rating)
      templates = templates
        .map((template) => ({
          ...template,
          stats: this.calculateTemplateStats(template),
          isRecommended: this.isTemplateRecommended(template),
          popularityScore: this.calculatePopularityScore(template),
        }))
        .sort((a, b) => b.popularityScore - a.popularityScore)
        .slice(0, limit);

      return templates as PopularTemplate[];
    } catch (error) {
      this.logger.error(`Error getting popular templates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Buscar plantillas por texto
   */
  async searchTemplates(
    query: string,
    filters?: TemplateFilters,
  ): Promise<RoomTemplate[]> {
    try {
      // Obtener todas las plantillas públicas primero
      const allTemplates = await this.getPublicTemplates(filters);

      // Filtrar por texto de búsqueda
      const searchTerms = query.toLowerCase().split(' ');
      const filteredTemplates = allTemplates.filter((template) => {
        const searchableText =
          `${template.name} ${template.description} ${template.tags.join(' ')}`.toLowerCase();
        return searchTerms.every((term) => searchableText.includes(term));
      });

      return filteredTemplates;
    } catch (error) {
      this.logger.error(`Error searching templates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crear sala desde plantilla
   */
  async createRoomFromTemplate(
    templateId: string,
    userId: string,
    overrides?: CreateRoomFromTemplateDto,
  ): Promise<Room> {
    const template = await this.getTemplate(templateId);

    // Verificar que el usuario puede usar la plantilla
    if (!template.isPublic && template.creatorId !== userId) {
      throw new ForbiddenException('No tienes acceso a esta plantilla');
    }

    // Preparar datos para crear sala
    const roomData: CreateRoomDto = {
      name:
        overrides?.roomName ||
        `${template.name} - ${new Date().toLocaleDateString()}`,
      filters:
        overrides?.configurationOverrides?.filters ||
        template.configuration.filters,
    };

    // Crear la sala usando el RoomService existente
    const room = await this.roomService.createRoom(userId, roomData);

    // Incrementar contador de uso
    await this.incrementUsageCount(templateId);

    // 📝 Track template usage event
    // await this.eventTracker.trackEvent(
    //   EventType.TEMPLATE_USED,
    //   userId,
    //   {
    //     templateId,
    //     templateName: template.name,
    //     roomId: room.id,
    //     roomName: room.name,
    //     hasOverrides: !!overrides?.configurationOverrides,
    //   },
    //   {
    //     source: 'room_template_service',
    //     userAgent: 'backend',
    //   },
    // );

    this.logger.log(
      `Sala creada desde plantilla: ${room.id} desde plantilla ${templateId}`,
    );
    return room;
  }

  /**
   * Incrementar contador de uso de plantilla
   */
  async incrementUsageCount(templateId: string): Promise<void> {
    try {
      await this.dynamoDBService.conditionalUpdate(
        DynamoDBKeys.templatePK(templateId),
        DynamoDBKeys.templateSK(),
        'SET usageCount = usageCount + :inc, updatedAt = :updatedAt',
        'attribute_exists(PK)',
        undefined,
        {
          ':inc': 1,
          ':updatedAt': new Date().toISOString(),
        },
      );
    } catch (error) {
      this.logger.error(
        `Error incrementing usage count for template ${templateId}: ${error.message}`,
      );
      // No lanzar error, es una operación de background
    }
  }

  /**
   * Calificar plantilla
   */
  async rateTemplate(
    templateId: string,
    userId: string,
    rating: number,
  ): Promise<void> {
    const template = await this.getTemplate(templateId);

    // Calcular nueva calificación promedio
    const newRatingCount = template.ratingCount + 1;
    const newRating =
      (template.rating * template.ratingCount + rating) / newRatingCount;

    await this.dynamoDBService.conditionalUpdate(
      DynamoDBKeys.templatePK(templateId),
      DynamoDBKeys.templateSK(),
      'SET rating = :rating, ratingCount = :ratingCount, updatedAt = :updatedAt',
      'attribute_exists(PK)',
      undefined,
      {
        ':rating': Math.round(newRating * 100) / 100, // Redondear a 2 decimales
        ':ratingCount': newRatingCount,
        ':updatedAt': new Date().toISOString(),
      },
    );

    // 📝 Track template rating event
    // await this.eventTracker.trackEvent(
    //   EventType.TEMPLATE_RATED,
    //   userId,
    //   {
    //     templateId,
    //     templateName: template.name,
    //     rating,
    //     newAverageRating: Math.round(newRating * 100) / 100,
    //     totalRatings: newRatingCount,
    //   },
    //   {
    //     source: 'room_template_service',
    //     userAgent: 'backend',
    //   },
    // );

    this.logger.log(
      `Plantilla calificada: ${templateId} con ${rating} estrellas por usuario ${userId}`,
    );
  }

  /**
   * Validar configuración de plantilla
   */
  private async validateTemplateConfiguration(
    configuration: any,
  ): Promise<TemplateValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const settings = configuration.settings as AdvancedRoomSettings;

      // Validar configuración de consenso
      if (
        settings.consensusThreshold === ConsensusType.CUSTOM &&
        !settings.customThreshold
      ) {
        errors.push(
          'customThreshold es requerido cuando consensusThreshold es CUSTOM',
        );
      }

      if (
        settings.customThreshold &&
        (settings.customThreshold < 50 || settings.customThreshold > 100)
      ) {
        errors.push('customThreshold debe estar entre 50 y 100');
      }

      // Validar timeouts
      if (
        settings.votingTimeout &&
        (settings.votingTimeout < 30 || settings.votingTimeout > 300)
      ) {
        errors.push('votingTimeout debe estar entre 30 y 300 segundos');
      }

      if (
        settings.sessionTimeout &&
        (settings.sessionTimeout < 15 || settings.sessionTimeout > 480)
      ) {
        errors.push('sessionTimeout debe estar entre 15 y 480 minutos');
      }

      // Validar capacidad de sala
      if (
        settings.maxMembers &&
        (settings.maxMembers < 2 || settings.maxMembers > 50)
      ) {
        errors.push('maxMembers debe estar entre 2 y 50');
      }

      // Validar frecuencia de inyección
      if (settings.contentInjectionEnabled && settings.injectionFrequency) {
        if (
          settings.injectionFrequency < 5 ||
          settings.injectionFrequency > 50
        ) {
          errors.push('injectionFrequency debe estar entre 5 y 50');
        }
      }

      // Advertencias para configuraciones subóptimas
      if (settings.votingTimeout && settings.votingTimeout < 60) {
        warnings.push(
          'Un timeout de votación muy corto puede afectar la experiencia del usuario',
        );
      }

      if (settings.maxMembers && settings.maxMembers > 20) {
        warnings.push(
          'Salas con muchos miembros pueden tener dificultades para encontrar consenso',
        );
      }

      if (settings.anonymousVoting && settings.showVotingProgress) {
        warnings.push(
          'Mostrar progreso de votación puede comprometer el anonimato',
        );
      }
    } catch (error) {
      errors.push(`Error validando configuración: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Ordenar plantillas por criterio
   */
  private sortTemplates(
    templates: RoomTemplate[],
    sortBy: TemplateSortBy,
    sortOrder: 'asc' | 'desc',
  ): RoomTemplate[] {
    return templates.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case TemplateSortBy.CREATED_AT:
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case TemplateSortBy.UPDATED_AT:
          comparison =
            new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case TemplateSortBy.USAGE_COUNT:
          comparison = a.usageCount - b.usageCount;
          break;
        case TemplateSortBy.RATING:
          const aRating = isNaN(a.rating) ? 0 : a.rating;
          const bRating = isNaN(b.rating) ? 0 : b.rating;
          comparison = aRating - bRating;
          break;
        case TemplateSortBy.NAME:
          comparison = a.name.localeCompare(b.name);
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Calcular estadísticas de plantilla
   */
  private calculateTemplateStats(template: RoomTemplate): TemplateUsageStats {
    // En una implementación real, esto consultaría datos históricos
    return {
      templateId: template.id,
      totalUsage: template.usageCount,
      recentUsage: Math.floor(template.usageCount * 0.3), // Aproximación
      averageRating: template.rating,
      successfulRooms: Math.floor(template.usageCount * 0.7), // Aproximación
      averageRoomDuration: 45, // Aproximación en minutos
    };
  }

  /**
   * Determinar si una plantilla es recomendada
   */
  private isTemplateRecommended(template: RoomTemplate): boolean {
    return template.rating >= 4.0 && template.usageCount >= 10;
  }

  /**
   * Calcular puntuación de popularidad
   */
  private calculatePopularityScore(template: RoomTemplate): number {
    // Fórmula: (usageCount * 0.7) + (rating * ratingCount * 0.3)
    const usageScore = template.usageCount * 0.7;
    const templateRating = isNaN(template.rating) ? 0 : template.rating;
    const ratingScore = templateRating * template.ratingCount * 0.3;
    return usageScore + ratingScore;
  }
}
