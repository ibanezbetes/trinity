import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemberService } from './member.service';
import { MediaService } from '../media/media.service';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import { EventTracker } from '../analytics/event-tracker.service';
import { EventType } from '../analytics/interfaces/analytics.interfaces';
import { ContentFilters } from '../../domain/entities/room.entity';

@Injectable()
export class RoomRefreshService {
  private readonly logger = new Logger(RoomRefreshService.name);
  private readonly AUTO_REFRESH_ENABLED: boolean;
  private readonly AUTO_REFRESH_THRESHOLD: number;
  private readonly MAX_MASTER_LIST_SIZE: number;

  constructor(
    private configService: ConfigService,
    private memberService: MemberService,
    private mediaService: MediaService,
    private realtimeService: RealtimeCompatibilityService,
    private eventTracker: EventTracker,
  ) {
    this.AUTO_REFRESH_ENABLED = this.configService.get('AUTO_REFRESH_ENABLED', 'true') === 'true';
    this.AUTO_REFRESH_THRESHOLD = parseFloat(this.configService.get('AUTO_REFRESH_THRESHOLD', '0.9'));
    this.MAX_MASTER_LIST_SIZE = parseInt(this.configService.get('MAX_MASTER_LIST_SIZE', '50'));
  }

  /**
   * Verificar si una sala necesita renovación automática
   */
  async checkAndRefreshIfNeeded(roomId: string, contentFilters: ContentFilters): Promise<boolean> {
    if (!this.AUTO_REFRESH_ENABLED) {
      return false;
    }

    const members = await this.memberService.getActiveMembers(roomId);
    if (members.length === 0) {
      return false;
    }

    // Calcular progreso promedio de los miembros activos
    let totalProgress = 0;
    let membersWithProgress = 0;

    for (const member of members) {
      const progress = await this.memberService.getMemberProgress(roomId, member.userId);
      totalProgress += progress.progressPercentage / 100; // Convertir a decimal
      membersWithProgress++;
    }

    const averageProgress = membersWithProgress > 0 ? totalProgress / membersWithProgress : 0;

    this.logger.debug(
      `Room ${roomId} average progress: ${(averageProgress * 100).toFixed(1)}% (threshold: ${(this.AUTO_REFRESH_THRESHOLD * 100)}%)`
    );

    // Si el progreso promedio supera el umbral, renovar
    if (averageProgress >= this.AUTO_REFRESH_THRESHOLD) {
      this.logger.log(
        `Room ${roomId} reached refresh threshold (${(averageProgress * 100).toFixed(1)}%), refreshing content...`
      );

      await this.refreshRoomContent(roomId, contentFilters);
      return true;
    }

    return false;
  }

  /**
   * Renovar el contenido de una sala
   */
  async refreshRoomContent(roomId: string, contentFilters: ContentFilters): Promise<void> {
    try {
      this.logger.log(`Starting content refresh for room ${roomId}`);

      // 1. Generar nueva lista maestra con contenido fresco
      const newMasterList = await this.generateFreshMasterList(contentFilters);

      if (newMasterList.length === 0) {
        this.logger.warn(`No new content found for room ${roomId}, skipping refresh`);
        return;
      }

      // 2. Pre-cargar los primeros elementos para optimizar rendimiento
      await this.mediaService.prefetchMovieDetails(newMasterList.slice(0, 10));

      // 3. Generar nuevas listas desordenadas para todos los miembros
      await this.memberService.generateShuffledListsForAllMembers(roomId, newMasterList);

      // 4. Notificar a todos los miembros sobre la renovación
      await this.notifyRoomRefresh(roomId, newMasterList.length);

      // 5. Track refresh event
      await this.eventTracker.trackRoomEvent(
        roomId,
        EventType.ROOM_STARTED, // Usar un evento existente
        'system',
        {
          refreshType: 'auto',
          newContentCount: newMasterList.length,
          reason: 'completion_threshold_reached',
        },
        {
          source: 'room_refresh_service',
          userAgent: 'backend',
        },
      );

      this.logger.log(
        `Room ${roomId} content refreshed successfully with ${newMasterList.length} new items`
      );

    } catch (error) {
      this.logger.error(`Error refreshing room ${roomId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Renovación manual de una sala
   */
  async manualRefresh(roomId: string, contentFilters: ContentFilters, userId: string): Promise<void> {
    this.logger.log(`Manual refresh requested for room ${roomId} by user ${userId}`);

    await this.refreshRoomContent(roomId, contentFilters);

    // Track manual refresh
    await this.eventTracker.trackRoomEvent(
      roomId,
      EventType.ROOM_STARTED, // Usar un evento existente
      userId,
      {
        refreshType: 'manual',
        reason: 'user_requested',
      },
      {
        source: 'room_refresh_service',
        userAgent: 'backend',
      },
    );
  }

  /**
   * Generar nueva lista maestra con contenido fresco
   */
  private async generateFreshMasterList(contentFilters: ContentFilters): Promise<string[]> {
    try {
      // Obtener contenido con filtros ligeramente modificados para variedad
      const modifiedFilters = this.diversifyFilters(contentFilters);
      
      // Obtener múltiples páginas para más variedad
      const allMovies: any[] = [];
      
      for (let page = 1; page <= 3; page++) {
        const movies = await this.mediaService.fetchMovies(modifiedFilters);
        allMovies.push(...movies);
      }

      // Mezclar y tomar los primeros MAX_MASTER_LIST_SIZE
      const shuffled = this.shuffleArray(allMovies);
      const selected = shuffled.slice(0, this.MAX_MASTER_LIST_SIZE);

      return selected.map(movie => movie.id.toString());

    } catch (error) {
      this.logger.error(`Error generating fresh master list: ${error.message}`);
      return [];
    }
  }

  /**
   * Diversificar filtros para obtener contenido variado
   */
  private diversifyFilters(originalFilters: ContentFilters): ContentFilters {
    const currentYear = new Date().getFullYear();
    
    return {
      ...originalFilters,
      // Expandir rango de años ligeramente
      releaseYearFrom: Math.max(1990, (originalFilters.releaseYearFrom || currentYear - 10) - 2),
      releaseYearTo: Math.min(currentYear, (originalFilters.releaseYearTo || currentYear) + 1),
      // Reducir rating mínimo ligeramente para más variedad
      minRating: Math.max(5.0, (originalFilters.minRating || 7.0) - 0.5),
    };
  }

  /**
   * Notificar renovación de sala a todos los miembros
   */
  private async notifyRoomRefresh(roomId: string, newContentCount: number): Promise<void> {
    try {
      await this.realtimeService.notifyRoomRefresh(roomId, {
        message: "¡Parece que os está costando poneros de acuerdo... os propongo otros títulos mejores!",
        newContentCount,
        refreshedAt: new Date(),
      });

      this.logger.debug(`Room refresh notification sent to room ${roomId}`);
    } catch (error) {
      this.logger.error(`Error sending room refresh notification: ${error.message}`);
      // No lanzar error, las notificaciones son secundarias
    }
  }

  /**
   * Obtener estadísticas de renovación de una sala
   */
  async getRoomRefreshStats(roomId: string): Promise<{
    averageProgress: number;
    needsRefresh: boolean;
    threshold: number;
    autoRefreshEnabled: boolean;
  }> {
    const members = await this.memberService.getActiveMembers(roomId);
    
    if (members.length === 0) {
      return {
        averageProgress: 0,
        needsRefresh: false,
        threshold: this.AUTO_REFRESH_THRESHOLD * 100,
        autoRefreshEnabled: this.AUTO_REFRESH_ENABLED,
      };
    }

    let totalProgress = 0;
    for (const member of members) {
      const progress = await this.memberService.getMemberProgress(roomId, member.userId);
      totalProgress += progress.progressPercentage;
    }

    const averageProgress = totalProgress / members.length;
    const needsRefresh = averageProgress >= (this.AUTO_REFRESH_THRESHOLD * 100);

    return {
      averageProgress: Math.round(averageProgress),
      needsRefresh,
      threshold: this.AUTO_REFRESH_THRESHOLD * 100,
      autoRefreshEnabled: this.AUTO_REFRESH_ENABLED,
    };
  }

  /**
   * Utilidad para mezclar array
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}