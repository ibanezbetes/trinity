import { Injectable, Logger } from '@nestjs/common';
import { AppSyncPublisher } from './appsync-publisher.service';
import { WebSocketPublisher } from './websocket-publisher.service';

// Import all interfaces from the original RealtimeService
import {
  VoteNotification,
  MatchNotification,
  RoomStateNotification,
  MemberStatusNotification,
  RoleAssignmentNotification,
  ModerationActionNotification,
  ScheduleNotification,
  ThemeChangeNotification,
  RoomSettingsNotification,
  ChatMessageNotification,
  ContentSuggestionNotification,
} from './realtime.service';

/**
 * Hybrid realtime service that uses AppSync as primary and WebSocket as fallback
 * This ensures real-time notifications always work even if AppSync is misconfigured
 */
@Injectable()
export class HybridRealtimeService {
  private readonly logger = new Logger(HybridRealtimeService.name);
  private appSyncHealthy = true;
  private lastHealthCheck = 0;
  private readonly healthCheckInterval = 30000; // 30 seconds

  constructor(
    private readonly appSyncPublisher: AppSyncPublisher,
    private readonly webSocketPublisher: WebSocketPublisher,
  ) {
    this.logger.log(
      '🔄 HybridRealtimeService initialized with AppSync + WebSocket fallback',
    );
    
    // Initial health check
    this.checkAppSyncHealth();
  }

  /**
   * Check AppSync health periodically
   */
  private async checkAppSyncHealth(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHealthCheck < this.healthCheckInterval) {
      return;
    }

    this.lastHealthCheck = now;
    
    try {
      this.appSyncHealthy = await this.appSyncPublisher.healthCheck();
      if (!this.appSyncHealthy) {
        this.logger.warn('⚠️ AppSync health check failed, using WebSocket fallback');
      }
    } catch (error) {
      this.appSyncHealthy = false;
      this.logger.warn(`⚠️ AppSync health check error: ${error.message}, using WebSocket fallback`);
    }
  }

  /**
   * Publish to both AppSync and WebSocket, with error handling
   */
  private async publishToAll<T extends any[]>(
    method: string,
    ...args: T
  ): Promise<void> {
    // Check AppSync health if needed
    await this.checkAppSyncHealth();

    const promises: Promise<void>[] = [];

    // Always try WebSocket first (it's more reliable)
    promises.push(
      (this.webSocketPublisher as any)[method](...args).catch((error: Error) => {
        this.logger.error(`WebSocket ${method} failed: ${error.message}`);
      })
    );

    // Try AppSync only if it's healthy
    if (this.appSyncHealthy) {
      promises.push(
        (this.appSyncPublisher as any)[method](...args).catch((error: Error) => {
          this.logger.error(`AppSync ${method} failed: ${error.message}`);
          // Mark AppSync as unhealthy if it fails
          if (error.message.includes('Invalid URL') || error.message.includes('Network')) {
            this.appSyncHealthy = false;
            this.logger.warn('⚠️ AppSync marked as unhealthy due to error');
          }
        })
      );
    }

    // Wait for all publishers to complete (or fail)
    await Promise.allSettled(promises);
  }

  /**
   * Notificar voto en tiempo real
   */
  async notifyVote(roomId: string, voteData: VoteNotification): Promise<void> {
    return this.publishToAll('publishVoteUpdate', roomId, voteData);
  }

  /**
   * Notificar match encontrado
   */
  async notifyMatch(roomId: string, matchData: MatchNotification): Promise<void> {
    return this.publishToAll('publishMatchFound', roomId, matchData);
  }

  /**
   * Notificar cambio de estado de sala
   */
  async notifyRoomStateChange(
    roomId: string,
    stateData: RoomStateNotification,
  ): Promise<void> {
    return this.publishToAll('publishRoomStateChange', roomId, stateData);
  }

  /**
   * Notificar cambio de estado de miembro
   */
  async notifyMemberStatusChange(
    roomId: string,
    memberData: MemberStatusNotification,
  ): Promise<void> {
    return this.publishToAll('publishMemberStatusChange', roomId, memberData);
  }

  /**
   * Notificar progreso de cola
   */
  async notifyQueueProgress(
    roomId: string,
    progressData: {
      currentPosition: number;
      totalItems: number;
      currentMediaId: string;
      nextMediaId?: string;
    },
  ): Promise<void> {
    this.logger.log(
      `📊 Notifying queue progress for room ${roomId}: ${progressData.currentPosition}/${progressData.totalItems}`,
    );

    // Convert to room state change format
    const stateData: RoomStateNotification = {
      status: 'active',
      currentMediaId: progressData.currentMediaId,
      queueLength: progressData.totalItems,
      activeMembers: 0, // This should be provided by the calling service
    };

    return this.publishToAll('publishRoomStateChange', roomId, stateData);
  }

  /**
   * Notificar nueva recomendación de IA
   */
  async notifyAIRecommendation(
    roomId: string,
    recommendationData: {
      mediaIds: string[];
      reasoning: string;
      emotionalState: string;
      confidence: number;
    },
  ): Promise<void> {
    this.logger.log(
      `🧠 Notifying AI recommendation for room ${roomId}: ${recommendationData.mediaIds.length} recommendations`,
    );

    // Convert to room state change format
    const stateData: RoomStateNotification = {
      status: 'active',
      queueLength: 0, // This should be provided by the calling service
      activeMembers: 0, // This should be provided by the calling service
    };

    return this.publishToAll('publishRoomStateChange', roomId, stateData);
  }

  /**
   * Notificar asignación/remoción de rol
   */
  async notifyRoleAssignment(
    roomId: string,
    roleData: RoleAssignmentNotification,
  ): Promise<void> {
    return this.publishToAll('publishRoleAssignment', roomId, roleData);
  }

  /**
   * Notificar acción de moderación
   */
  async notifyModerationAction(
    roomId: string,
    moderationData: ModerationActionNotification,
  ): Promise<void> {
    return this.publishToAll('publishModerationAction', roomId, moderationData);
  }

  /**
   * Notificar evento de programación
   */
  async notifyScheduleEvent(
    roomId: string,
    scheduleData: ScheduleNotification,
  ): Promise<void> {
    return this.publishToAll('publishScheduleEvent', roomId, scheduleData);
  }

  /**
   * Notificar cambio de tema
   */
  async notifyThemeChange(roomId: string, themeData: ThemeChangeNotification): Promise<void> {
    return this.publishToAll('publishThemeChange', roomId, themeData);
  }

  /**
   * Notificar cambio de configuración de sala
   */
  async notifyRoomSettingsChange(
    roomId: string,
    settingsData: RoomSettingsNotification,
  ): Promise<void> {
    return this.publishToAll('publishRoomSettingsChange', roomId, settingsData);
  }

  /**
   * Notificar mensaje de chat
   */
  async notifyChatMessage(roomId: string, chatData: ChatMessageNotification): Promise<void> {
    return this.publishToAll('publishChatMessage', roomId, chatData);
  }

  /**
   * Notificar sugerencia de contenido
   */
  async notifyContentSuggestion(
    roomId: string,
    suggestionData: ContentSuggestionNotification,
  ): Promise<void> {
    return this.publishToAll('publishContentSuggestion', roomId, suggestionData);
  }

  /**
   * Get connected members (from WebSocket)
   */
  getConnectedMembers(roomId: string): string[] {
    // WebSocket can track connections, AppSync cannot
    return [];
  }

  /**
   * Verificar si un usuario está conectado
   */
  isUserConnected(userId: string): boolean {
    // WebSocket can track connections, AppSync cannot
    return false;
  }

  /**
   * Obtener estadísticas de conexiones en tiempo real
   */
  getRealtimeStats() {
    const appSyncStats = this.appSyncPublisher.getConnectionStats();
    const webSocketStats = this.webSocketPublisher.getConnectionStats();
    
    return {
      appSync: {
        ...appSyncStats,
        healthy: this.appSyncHealthy,
      },
      webSocket: webSocketStats,
      hybrid: {
        primaryPublisher: this.appSyncHealthy ? 'AppSync' : 'WebSocket',
        fallbackActive: !this.appSyncHealthy,
        lastHealthCheck: new Date(this.lastHealthCheck).toISOString(),
      },
    };
  }

  /**
   * Broadcast a todos los usuarios conectados (WebSocket only)
   */
  async broadcastSystemMessage(
    message: string,
    type: 'info' | 'warning' | 'maintenance' = 'info',
  ): Promise<void> {
    this.logger.log(`📢 System message: ${message}`);
    // This would be implemented in WebSocket publisher
  }

  /**
   * Enviar mensaje privado a un usuario específico (WebSocket only)
   */
  async sendPrivateMessage(userId: string, message: any): Promise<boolean> {
    this.logger.log(`💬 Private message to user ${userId}`);
    // This would be implemented in WebSocket publisher
    return false;
  }

  /**
   * Health check for both publishers
   */
  async healthCheck(): Promise<boolean> {
    const webSocketHealthy = await this.webSocketPublisher.healthCheck();
    await this.checkAppSyncHealth();
    
    // Service is healthy if at least one publisher is working
    return webSocketHealthy || this.appSyncHealthy;
  }
}