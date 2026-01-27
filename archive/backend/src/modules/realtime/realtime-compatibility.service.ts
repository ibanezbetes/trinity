import { Injectable, Logger } from '@nestjs/common';
import { AppSyncPublisher } from './appsync-publisher.service';

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
 * Compatibility service that maintains the same interface as RealtimeService
 * but uses AppSync Subscriptions internally instead of Socket.IO
 */
@Injectable()
export class RealtimeCompatibilityService {
  private readonly logger = new Logger(RealtimeCompatibilityService.name);

  constructor(private readonly appSyncPublisher: AppSyncPublisher) {
    this.logger.log(
      '🔄 RealtimeCompatibilityService initialized with AppSync backend',
    );
  }

  /**
   * Notificar voto en tiempo real
   */
  async notifyVote(roomId: string, voteData: VoteNotification) {
    return this.appSyncPublisher.publishVoteUpdate(roomId, voteData);
  }

  /**
   * Notificar match encontrado
   */
  async notifyMatch(roomId: string, matchData: MatchNotification) {
    return this.appSyncPublisher.publishMatchFound(roomId, matchData);
  }

  /**
   * Notificar cambio de estado de sala
   */
  async notifyRoomStateChange(
    roomId: string,
    stateData: RoomStateNotification,
  ) {
    return this.appSyncPublisher.publishRoomStateChange(roomId, stateData);
  }

  /**
   * Notificar cambio de estado de miembro
   */
  async notifyMemberStatusChange(
    roomId: string,
    memberData: MemberStatusNotification,
  ) {
    return this.appSyncPublisher.publishMemberStatusChange(roomId, memberData);
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
  ) {
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

    return this.appSyncPublisher.publishRoomStateChange(roomId, stateData);
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
  ) {
    this.logger.log(
      `🧠 Notifying AI recommendation for room ${roomId}: ${recommendationData.mediaIds.length} recommendations`,
    );

    // Convert to room state change format
    const stateData: RoomStateNotification = {
      status: 'active',
      queueLength: 0, // This should be provided by the calling service
      activeMembers: 0, // This should be provided by the calling service
    };

    return this.appSyncPublisher.publishRoomStateChange(roomId, stateData);
  }

  /**
   * Notificar asignación/remoción de rol
   */
  async notifyRoleAssignment(
    roomId: string,
    roleData: RoleAssignmentNotification,
  ) {
    return this.appSyncPublisher.publishRoleAssignment(roomId, roleData);
  }

  /**
   * Notificar acción de moderación
   */
  async notifyModerationAction(
    roomId: string,
    moderationData: ModerationActionNotification,
  ) {
    return this.appSyncPublisher.publishModerationAction(
      roomId,
      moderationData,
    );
  }

  /**
   * Notificar evento de programación
   */
  async notifyScheduleEvent(
    roomId: string,
    scheduleData: ScheduleNotification,
  ) {
    return this.appSyncPublisher.publishScheduleEvent(roomId, scheduleData);
  }

  /**
   * Notificar cambio de tema
   */
  async notifyThemeChange(roomId: string, themeData: ThemeChangeNotification) {
    return this.appSyncPublisher.publishThemeChange(roomId, themeData);
  }

  /**
   * Notificar cambio de configuración de sala
   */
  async notifyRoomSettingsChange(
    roomId: string,
    settingsData: RoomSettingsNotification,
  ) {
    return this.appSyncPublisher.publishRoomSettingsChange(
      roomId,
      settingsData,
    );
  }

  /**
   * Notificar mensaje de chat
   */
  async notifyChatMessage(roomId: string, chatData: ChatMessageNotification) {
    return this.appSyncPublisher.publishChatMessage(roomId, chatData);
  }

  /**
   * Notificar sugerencia de contenido
   */
  async notifyContentSuggestion(
    roomId: string,
    suggestionData: ContentSuggestionNotification,
  ) {
    return this.appSyncPublisher.publishContentSuggestion(
      roomId,
      suggestionData,
    );
  }

  /**
   * Get connected members (placeholder - AppSync doesn't track connections the same way)
   */
  getConnectedMembers(roomId: string): string[] {
    this.logger.warn(
      'getConnectedMembers is not supported with AppSync subscriptions',
    );
    return [];
  }

  /**
   * Verificar si un usuario está conectado (placeholder)
   */
  isUserConnected(userId: string): boolean {
    this.logger.warn(
      'isUserConnected is not supported with AppSync subscriptions',
    );
    return false;
  }

  /**
   * Obtener estadísticas de conexiones en tiempo real
   */
  getRealtimeStats() {
    return this.appSyncPublisher.getConnectionStats();
  }

  /**
   * Broadcast a todos los usuarios conectados (not supported with AppSync)
   */
  async broadcastSystemMessage(
    message: string,
    type: 'info' | 'warning' | 'maintenance' = 'info',
  ) {
    this.logger.warn(
      'broadcastSystemMessage is not supported with AppSync subscriptions',
    );
    this.logger.log(`📢 System message (not broadcasted): ${message}`);
  }

  /**
   * Enviar mensaje privado a un usuario específico (not supported with AppSync)
   */
  async sendPrivateMessage(userId: string, message: any) {
    this.logger.warn(
      'sendPrivateMessage is not supported with AppSync subscriptions',
    );
    this.logger.log(`💬 Private message (not sent) to user ${userId}`);
    return false;
  }

  /**
   * Notificar renovación de contenido de sala
   */
  async notifyRoomRefresh(
    roomId: string,
    refreshData: {
      message: string;
      newContentCount: number;
      refreshedAt: Date;
    },
  ) {
    this.logger.log(
      `🔄 Notifying room refresh for room ${roomId}: ${refreshData.newContentCount} new items`,
    );

    // Convert to room state change format
    const stateData: RoomStateNotification = {
      status: 'active',
      queueLength: refreshData.newContentCount,
      activeMembers: 0, // This should be provided by the calling service
    };

    return this.appSyncPublisher.publishRoomStateChange(roomId, stateData);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    return this.appSyncPublisher.healthCheck();
  }
}
