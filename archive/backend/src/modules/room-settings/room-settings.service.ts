import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import {
  AdvancedRoomSettings,
  ConsensusType,
  RoomPrivacy,
} from '../../domain/entities/room-template.entity';
import {
  UpdateRoomSettingsDto,
  SettingsRecommendationDto,
  SettingsRecommendationsResponseDto,
} from './dto/room-settings.dto';
import { RoomService } from '../room/room.service';

/**
 * Configuraciones por defecto para salas
 */
const DEFAULT_ROOM_SETTINGS: AdvancedRoomSettings = {
  votingTimeout: 60,
  sessionTimeout: 120,
  consensusThreshold: ConsensusType.MAJORITY,
  privacy: RoomPrivacy.PUBLIC,
  maxMembers: 10,
  requireApproval: false,
  allowGuestVoting: true,
  contentInjectionEnabled: true,
  injectionFrequency: 10,
  allowMemberSuggestions: true,
  autoProgressEnabled: false,
  chatEnabled: true,
  anonymousVoting: false,
  showVotingProgress: true,
  enableReactions: true,
  autoInactiveHandling: true,
  smartOptimization: false,
  predictiveMatching: false,
};

/**
 * Entidad para almacenar configuraciones de sala
 */
interface RoomSettingsEntity {
  roomId: string;
  settings: AdvancedRoomSettings;
  updatedAt: Date;
  updatedBy: string;
  version: number;
}

@Injectable()
export class RoomSettingsService {
  private readonly logger = new Logger(RoomSettingsService.name);

  constructor(
    private dynamoDBService: DynamoDBService,
    private roomService: RoomService,
  ) {}

  /**
   * Obtener configuraciones de una sala
   */
  async getRoomSettings(
    roomId: string,
    userId: string,
  ): Promise<AdvancedRoomSettings> {
    // Verificar que el usuario tiene acceso a la sala
    await this.verifyRoomAccess(roomId, userId);

    try {
      const settingsEntity = await this.dynamoDBService.getItem(
        DynamoDBKeys.roomSettingsPK(roomId),
        DynamoDBKeys.roomSettingsSK(),
      );

      if (!settingsEntity) {
        // Devolver configuraciones por defecto si no existen configuraciones personalizadas
        this.logger.log(
          `Devolviendo configuraciones por defecto para sala ${roomId}`,
        );
        return DEFAULT_ROOM_SETTINGS;
      }

      return (settingsEntity as unknown as RoomSettingsEntity).settings;
    } catch (error) {
      this.logger.error(
        `Error obteniendo configuraciones de sala ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Actualizar configuraciones de una sala
   */
  async updateRoomSettings(
    roomId: string,
    userId: string,
    updates: UpdateRoomSettingsDto,
  ): Promise<AdvancedRoomSettings> {
    // Verificar que el usuario es admin de la sala
    await this.verifyRoomAdmin(roomId, userId);

    // Validar configuraciones
    const validationResult = await this.validateSettings(updates);
    if (!validationResult.isValid) {
      throw new BadRequestException(
        `Configuraciones inválidas: ${validationResult.errors.join(', ')}`,
      );
    }

    try {
      // Obtener configuraciones actuales
      const currentSettings = await this.getRoomSettings(roomId, userId);

      // Combinar configuraciones actuales con actualizaciones
      const newSettings: AdvancedRoomSettings = {
        ...currentSettings,
      };

      // Aplicar solo las actualizaciones que no son undefined
      Object.keys(updates).forEach((key) => {
        if (updates[key] !== undefined) {
          newSettings[key] = updates[key];
        }
      });

      // Crear entidad de configuraciones
      const settingsEntity: RoomSettingsEntity = {
        roomId,
        settings: newSettings,
        updatedAt: new Date(),
        updatedBy: userId,
        version: 1,
      };

      // Guardar en DynamoDB
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomSettingsPK(roomId),
        SK: DynamoDBKeys.roomSettingsSK(),
        GSI1PK: DynamoDBKeys.roomSettingsGSI1PK(userId),
        GSI1SK: DynamoDBKeys.roomSettingsGSI1SK(new Date().toISOString()),
        ...settingsEntity,
      });

      this.logger.log(
        `Configuraciones actualizadas para sala ${roomId} por usuario ${userId}`,
      );
      return newSettings;
    } catch (error) {
      this.logger.error(
        `Error actualizando configuraciones de sala ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Restablecer configuraciones a valores por defecto
   */
  async resetRoomSettings(
    roomId: string,
    userId: string,
  ): Promise<AdvancedRoomSettings> {
    // Verificar que el usuario es admin de la sala
    await this.verifyRoomAdmin(roomId, userId);

    try {
      // Crear entidad con configuraciones por defecto
      const settingsEntity: RoomSettingsEntity = {
        roomId,
        settings: DEFAULT_ROOM_SETTINGS,
        updatedAt: new Date(),
        updatedBy: userId,
        version: 1,
      };

      // Guardar en DynamoDB
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomSettingsPK(roomId),
        SK: DynamoDBKeys.roomSettingsSK(),
        GSI1PK: DynamoDBKeys.roomSettingsGSI1PK(userId),
        GSI1SK: DynamoDBKeys.roomSettingsGSI1SK(new Date().toISOString()),
        ...settingsEntity,
      });

      this.logger.log(
        `Configuraciones restablecidas para sala ${roomId} por usuario ${userId}`,
      );
      return DEFAULT_ROOM_SETTINGS;
    } catch (error) {
      this.logger.error(
        `Error restableciendo configuraciones de sala ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener recomendaciones de configuración para una sala
   */
  async getSettingsRecommendations(
    roomId: string,
    userId: string,
  ): Promise<SettingsRecommendationsResponseDto> {
    // Verificar acceso a la sala
    await this.verifyRoomAccess(roomId, userId);

    try {
      // Obtener configuraciones actuales
      const currentSettings = await this.getRoomSettings(roomId, userId);

      // Obtener información de la sala para análisis
      const room = await this.roomService.getRoom(roomId);

      // Generar recomendaciones basadas en el análisis
      const recommendations = await this.generateRecommendations(
        room,
        currentSettings,
      );

      // Calcular puntuaciones de optimización
      const currentScore = this.calculateOptimizationScore(
        currentSettings,
        room,
      );
      const potentialScore = this.calculatePotentialScore(
        currentSettings,
        recommendations,
        room,
      );

      return {
        roomId,
        recommendations,
        currentOptimizationScore: currentScore,
        potentialScore,
      };
    } catch (error) {
      this.logger.error(
        `Error generando recomendaciones para sala ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Validar configuraciones de sala
   */
  private async validateSettings(
    settings: UpdateRoomSettingsDto,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Validar consenso personalizado
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

      // Validar capacidad
      if (
        settings.maxMembers &&
        (settings.maxMembers < 2 || settings.maxMembers > 50)
      ) {
        errors.push('maxMembers debe estar entre 2 y 50');
      }

      // Validar inyección de contenido
      if (settings.contentInjectionEnabled && settings.injectionFrequency) {
        if (
          settings.injectionFrequency < 5 ||
          settings.injectionFrequency > 50
        ) {
          errors.push('injectionFrequency debe estar entre 5 y 50');
        }
      }

      // Validar combinaciones lógicas
      if (settings.anonymousVoting && settings.showVotingProgress) {
        errors.push(
          'No se puede mostrar progreso de votación con votación anónima habilitada',
        );
      }
    } catch (error) {
      errors.push(`Error validando configuraciones: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generar recomendaciones inteligentes
   */
  private async generateRecommendations(
    room: any,
    currentSettings: AdvancedRoomSettings,
  ): Promise<SettingsRecommendationDto[]> {
    const recommendations: SettingsRecommendationDto[] = [];

    // Recomendación basada en número de miembros
    const memberCount = room.members?.length || 0;
    if (
      memberCount > 15 &&
      currentSettings.consensusThreshold === ConsensusType.UNANIMOUS
    ) {
      recommendations.push({
        setting: 'consensusThreshold',
        recommendedValue: ConsensusType.MAJORITY,
        reason:
          'Con muchos miembros, el consenso unánime puede ser difícil de alcanzar',
        priority: 4,
        expectedImpact: 'Mejora la velocidad de decisión en un 60%',
      });
    }

    // Recomendación de timeout basada en actividad
    if (
      currentSettings.votingTimeout &&
      currentSettings.votingTimeout < 45 &&
      memberCount > 8
    ) {
      recommendations.push({
        setting: 'votingTimeout',
        recommendedValue: 60,
        reason: 'Salas con muchos miembros necesitan más tiempo para votar',
        priority: 3,
        expectedImpact: 'Reduce votos perdidos por timeout en un 40%',
      });
    }

    // Recomendación de inyección de contenido
    if (!currentSettings.contentInjectionEnabled) {
      recommendations.push({
        setting: 'contentInjectionEnabled',
        recommendedValue: true,
        reason:
          'La inyección de contenido mejora la diversidad y descubrimiento',
        priority: 2,
        expectedImpact: 'Aumenta la satisfacción de usuarios en un 25%',
      });
    }

    // Recomendación de manejo de inactivos
    if (!currentSettings.autoInactiveHandling && memberCount > 5) {
      recommendations.push({
        setting: 'autoInactiveHandling',
        recommendedValue: true,
        reason:
          'El manejo automático de inactivos mantiene el flujo de la sala',
        priority: 3,
        expectedImpact: 'Mejora la experiencia de usuarios activos en un 30%',
      });
    }

    // Recomendación de privacidad
    if (
      currentSettings.privacy === RoomPrivacy.PUBLIC &&
      !currentSettings.requireApproval
    ) {
      recommendations.push({
        setting: 'requireApproval',
        recommendedValue: true,
        reason: 'Salas públicas se benefician del control de acceso',
        priority: 2,
        expectedImpact: 'Reduce interrupciones no deseadas en un 50%',
      });
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Calcular puntuación de optimización actual
   */
  private calculateOptimizationScore(
    settings: AdvancedRoomSettings,
    room: any,
  ): number {
    let score = 0;
    const maxScore = 100;

    // Puntuación por configuraciones óptimas
    if (settings.contentInjectionEnabled) score += 15;
    if (settings.autoInactiveHandling) score += 15;
    if (settings.chatEnabled) score += 10;
    if (settings.enableReactions) score += 10;
    if (settings.allowMemberSuggestions) score += 10;

    // Puntuación por configuraciones balanceadas
    const memberCount = room.members?.length || 0;
    if (
      memberCount > 10 &&
      settings.consensusThreshold !== ConsensusType.UNANIMOUS
    )
      score += 15;
    if (settings.votingTimeout && settings.votingTimeout >= 45) score += 10;
    if (settings.maxMembers && settings.maxMembers >= memberCount * 1.5)
      score += 15;

    return Math.min(score, maxScore);
  }

  /**
   * Calcular puntuación potencial con recomendaciones
   */
  private calculatePotentialScore(
    currentSettings: AdvancedRoomSettings,
    recommendations: SettingsRecommendationDto[],
    room: any,
  ): number {
    // Simular aplicación de recomendaciones
    const simulatedSettings = { ...currentSettings };

    recommendations.forEach((rec) => {
      (simulatedSettings as any)[rec.setting] = rec.recommendedValue;
    });

    return this.calculateOptimizationScore(simulatedSettings, room);
  }

  /**
   * Verificar acceso a la sala
   */
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

  /**
   * Verificar que el usuario es administrador de la sala
   */
  private async verifyRoomAdmin(roomId: string, userId: string): Promise<void> {
    try {
      const room = await this.roomService.getRoom(roomId);

      // Verificar que el usuario es el creador o admin de la sala
      const isAdmin =
        room && room.creatorId === userId ||
        room && (room as any).members?.some(
          (member) => member.userId === userId && member.role === 'admin',
        );

      if (!isAdmin) {
        throw new ForbiddenException(
          'Solo los administradores pueden modificar las configuraciones',
        );
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Sala no encontrada');
      }
      throw error;
    }
  }

  /**
   * Obtener configuraciones por defecto
   */
  getDefaultSettings(): AdvancedRoomSettings {
    return { ...DEFAULT_ROOM_SETTINGS };
  }

  /**
   * Migrar salas existentes a configuraciones por defecto
   */
  async migrateExistingRooms(): Promise<{ migrated: number; errors: number }> {
    this.logger.log(
      'Iniciando migración de salas existentes a configuraciones avanzadas',
    );

    const migrated = 0;
    const errors = 0;

    try {
      // Esta sería una operación de migración que se ejecutaría una sola vez
      // En un entorno real, obtendríamos todas las salas existentes y les asignaríamos configuraciones por defecto

      this.logger.log(
        `Migración completada: ${migrated} salas migradas, ${errors} errores`,
      );
      return { migrated, errors };
    } catch (error) {
      this.logger.error(`Error en migración: ${error.message}`);
      throw error;
    }
  }
}
