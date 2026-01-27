import { Injectable, Logger } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

export interface VoteNotification {
  userId: string;
  mediaId: string;
  voteType: 'like' | 'dislike';
  progress: {
    totalVotes: number;
    requiredVotes: number;
    percentage: number;
  };
}

export interface MatchNotification {
  mediaId: string;
  mediaTitle: string;
  participants: string[];
  matchType: 'unanimous' | 'majority';
}

export interface RoomStateNotification {
  status: 'active' | 'paused' | 'finished';
  currentMediaId?: string;
  queueLength: number;
  activeMembers: number;
}

export interface MemberStatusNotification {
  userId: string;
  status: 'active' | 'inactive' | 'left';
  lastActivity?: string;
}

export interface RoleAssignmentNotification {
  targetUserId: string;
  roleId: string;
  roleName: string;
  assignedBy: string;
  action: 'assigned' | 'removed';
}

export interface ModerationActionNotification {
  targetUserId: string;
  moderatorId: string;
  actionType: string;
  reason: string;
  duration?: number;
  expiresAt?: string;
}

export interface ScheduleNotification {
  scheduleId: string;
  title: string;
  action: 'created' | 'updated' | 'cancelled' | 'reminder';
  startTime: string;
  endTime: string;
  message?: string;
}

export interface ThemeChangeNotification {
  themeId?: string;
  themeName?: string;
  action: 'applied' | 'removed' | 'updated';
  appliedBy: string;
  customizations?: any;
}

export interface RoomSettingsNotification {
  settingKey: string;
  oldValue: any;
  newValue: any;
  changedBy: string;
  category: 'privacy' | 'consensus' | 'capacity' | 'timeout' | 'other';
}

export interface ChatMessageNotification {
  type:
    | 'message'
    | 'edit'
    | 'delete'
    | 'reaction'
    | 'typing'
    | 'user_joined'
    | 'user_left';
  roomId: string;
  userId: string;
  username: string;
  messageId?: string;
  message?: any;
  data?: Record<string, any>;
  timestamp: Date;
}

export interface ContentSuggestionNotification {
  type:
    | 'created'
    | 'voted'
    | 'commented'
    | 'approved'
    | 'rejected'
    | 'implemented';
  roomId: string;
  suggestionId: string;
  userId: string;
  username: string;
  suggestion?: any;
  vote?: any;
  comment?: any;
  data?: Record<string, any>;
  timestamp: Date;
}

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly realtimeGateway: RealtimeGateway) {}

  /**
   * Notificar voto en tiempo real
   */
  async notifyVote(roomId: string, voteData: VoteNotification) {
    try {
      this.logger.log(
        `📡 Notifying vote for room ${roomId}: ${voteData.userId} voted ${voteData.voteType} on ${voteData.mediaId}`,
      );

      this.realtimeGateway.notifyVote(roomId, {
        type: 'vote',
        userId: voteData.userId,
        mediaId: voteData.mediaId,
        voteType: voteData.voteType,
        progress: voteData.progress,
      });
    } catch (error) {
      this.logger.error(`Error notifying vote: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Notificar match encontrado
   */
  async notifyMatch(roomId: string, matchData: MatchNotification) {
    try {
      this.logger.log(
        `🎯 Notifying match for room ${roomId}: ${matchData.mediaTitle}`,
      );

      this.realtimeGateway.notifyMatch(roomId, {
        type: 'match',
        mediaId: matchData.mediaId,
        mediaTitle: matchData.mediaTitle,
        participants: matchData.participants,
        matchType: matchData.matchType,
      });
    } catch (error) {
      this.logger.error(`Error notifying match: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Notificar cambio de estado de sala
   */
  async notifyRoomStateChange(
    roomId: string,
    stateData: RoomStateNotification,
  ) {
    try {
      this.logger.log(
        `🏠 Notifying room state change for ${roomId}: ${stateData.status}`,
      );

      this.realtimeGateway.notifyRoomStateChange(roomId, {
        type: 'roomState',
        status: stateData.status,
        currentMediaId: stateData.currentMediaId,
        queueLength: stateData.queueLength,
        activeMembers: stateData.activeMembers,
      });
    } catch (error) {
      this.logger.error(`Error notifying room state change: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Notificar cambio de estado de miembro
   */
  async notifyMemberStatusChange(
    roomId: string,
    memberData: MemberStatusNotification,
  ) {
    try {
      this.logger.log(
        `👤 Notifying member status change for room ${roomId}: ${memberData.userId} is ${memberData.status}`,
      );

      this.realtimeGateway.notifyMemberStatusChange(roomId, {
        type: 'memberStatus',
        userId: memberData.userId,
        status: memberData.status,
        lastActivity: memberData.lastActivity,
      });
    } catch (error) {
      this.logger.error(
        `Error notifying member status change: ${error.message}`,
      );
      // Don't throw - real-time notifications are not critical
    }
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

    this.realtimeGateway.notifyRoomStateChange(roomId, {
      type: 'queueProgress',
      currentPosition: progressData.currentPosition,
      totalItems: progressData.totalItems,
      currentMediaId: progressData.currentMediaId,
      nextMediaId: progressData.nextMediaId,
      percentage: Math.round(
        (progressData.currentPosition / progressData.totalItems) * 100,
      ),
    });
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

    this.realtimeGateway.notifyRoomStateChange(roomId, {
      type: 'aiRecommendation',
      mediaIds: recommendationData.mediaIds,
      reasoning: recommendationData.reasoning,
      emotionalState: recommendationData.emotionalState,
      confidence: recommendationData.confidence,
    });
  }

  /**
   * Notificar asignación/remoción de rol
   */
  async notifyRoleAssignment(
    roomId: string,
    roleData: RoleAssignmentNotification,
  ) {
    try {
      this.logger.log(
        `👑 Notifying role assignment for room ${roomId}: ${roleData.action} role ${roleData.roleName} to ${roleData.targetUserId}`,
      );

      this.realtimeGateway.notifyRoleAssignment(roomId, {
        type: 'roleAssignment',
        targetUserId: roleData.targetUserId,
        roleId: roleData.roleId,
        roleName: roleData.roleName,
        assignedBy: roleData.assignedBy,
        action: roleData.action,
      });
    } catch (error) {
      this.logger.error(`Error notifying role assignment: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Notificar acción de moderación
   */
  async notifyModerationAction(
    roomId: string,
    moderationData: ModerationActionNotification,
  ) {
    try {
      this.logger.log(
        `🛡️ Notifying moderation action for room ${roomId}: ${moderationData.actionType} on ${moderationData.targetUserId}`,
      );

      this.realtimeGateway.notifyModerationAction(roomId, {
        type: 'moderationAction',
        targetUserId: moderationData.targetUserId,
        moderatorId: moderationData.moderatorId,
        actionType: moderationData.actionType,
        reason: moderationData.reason,
        duration: moderationData.duration,
        expiresAt: moderationData.expiresAt,
      });
    } catch (error) {
      this.logger.error(`Error notifying moderation action: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Notificar evento de programación
   */
  async notifyScheduleEvent(
    roomId: string,
    scheduleData: ScheduleNotification,
  ) {
    try {
      this.logger.log(
        `📅 Notifying schedule event for room ${roomId}: ${scheduleData.action} - ${scheduleData.title}`,
      );

      this.realtimeGateway.notifyScheduleEvent(roomId, {
        type: 'scheduleEvent',
        scheduleId: scheduleData.scheduleId,
        title: scheduleData.title,
        action: scheduleData.action,
        startTime: scheduleData.startTime,
        endTime: scheduleData.endTime,
        message: scheduleData.message,
      });
    } catch (error) {
      this.logger.error(`Error notifying schedule event: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Notificar cambio de tema
   */
  async notifyThemeChange(roomId: string, themeData: ThemeChangeNotification) {
    try {
      this.logger.log(
        `🎨 Notifying theme change for room ${roomId}: ${themeData.action} - ${themeData.themeName || 'theme'}`,
      );

      this.realtimeGateway.notifyThemeChange(roomId, {
        type: 'themeChange',
        themeId: themeData.themeId,
        themeName: themeData.themeName,
        action: themeData.action,
        appliedBy: themeData.appliedBy,
        customizations: themeData.customizations,
      });
    } catch (error) {
      this.logger.error(`Error notifying theme change: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Notificar cambio de configuración de sala
   */
  async notifyRoomSettingsChange(
    roomId: string,
    settingsData: RoomSettingsNotification,
  ) {
    try {
      this.logger.log(
        `⚙️ Notifying room settings change for ${roomId}: ${settingsData.settingKey} changed by ${settingsData.changedBy}`,
      );

      this.realtimeGateway.notifyRoomSettingsChange(roomId, {
        type: 'roomSettingsChange',
        settingKey: settingsData.settingKey,
        oldValue: settingsData.oldValue,
        newValue: settingsData.newValue,
        changedBy: settingsData.changedBy,
        category: settingsData.category,
      });
    } catch (error) {
      this.logger.error(
        `Error notifying room settings change: ${error.message}`,
      );
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Notificar mensaje de chat
   */
  async notifyChatMessage(roomId: string, chatData: ChatMessageNotification) {
    try {
      this.logger.log(
        `💬 Notifying chat message for room ${roomId}: ${chatData.type} from ${chatData.username}`,
      );

      this.realtimeGateway.notifyChatMessage(roomId, {
        type: 'chatMessage',
        eventType: chatData.type,
        roomId: chatData.roomId,
        userId: chatData.userId,
        username: chatData.username,
        messageId: chatData.messageId,
        message: chatData.message,
        data: chatData.data,
        timestamp: chatData.timestamp.toISOString(),
      });
    } catch (error) {
      this.logger.error(`Error notifying chat message: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }

  /**
   * Notificar sugerencia de contenido
   */
  async notifyContentSuggestion(
    roomId: string,
    suggestionData: ContentSuggestionNotification,
  ) {
    try {
      this.logger.log(
        `💡 Notifying content suggestion for room ${roomId}: ${suggestionData.type} by ${suggestionData.username}`,
      );

      this.realtimeGateway.notifyContentSuggestion(roomId, {
        type: 'contentSuggestion',
        eventType: suggestionData.type,
        roomId: suggestionData.roomId,
        suggestionId: suggestionData.suggestionId,
        userId: suggestionData.userId,
        username: suggestionData.username,
        suggestion: suggestionData.suggestion,
        vote: suggestionData.vote,
        comment: suggestionData.comment,
        data: suggestionData.data,
        timestamp: suggestionData.timestamp.toISOString(),
      });
    } catch (error) {
      this.logger.error(`Error notifying content suggestion: ${error.message}`);
      // Don't throw - real-time notifications are not critical
    }
  }
  getConnectedMembers(roomId: string): string[] {
    return this.realtimeGateway.getConnectedMembers(roomId);
  }

  /**
   * Verificar si un usuario está conectado
   */
  isUserConnected(userId: string): boolean {
    return this.realtimeGateway.isUserConnected(userId);
  }

  /**
   * Obtener estadísticas de conexiones en tiempo real
   */
  getRealtimeStats() {
    const stats = this.realtimeGateway.getConnectionStats();

    return {
      ...stats,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Broadcast a todos los usuarios conectados (admin only)
   */
  async broadcastSystemMessage(
    message: string,
    type: 'info' | 'warning' | 'maintenance' = 'info',
  ) {
    this.logger.log(`📢 Broadcasting system message: ${message}`);

    // Esto enviaría a todos los usuarios conectados
    this.realtimeGateway.server.emit('systemMessage', {
      type,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Enviar mensaje privado a un usuario específico
   */
  async sendPrivateMessage(userId: string, message: any) {
    this.logger.log(`💬 Sending private message to user ${userId}`);

    // Buscar el socket del usuario y enviar mensaje privado
    const userSocket = this.realtimeGateway['connectedUsers'].get(userId);
    if (userSocket) {
      userSocket.emit('privateMessage', {
        ...message,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    return false; // Usuario no conectado
  }
}
