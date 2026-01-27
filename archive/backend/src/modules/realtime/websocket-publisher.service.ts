import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

// Import interfaces from the original RealtimeService
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

@Injectable()
@WebSocketGateway({
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  namespace: '/realtime'
})
export class WebSocketPublisher implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketPublisher.name);
  private roomConnections = new Map<string, Set<string>>(); // roomId -> Set of socketIds

  handleConnection(client: Socket) {
    this.logger.log(`🔌 Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`🔌 Client disconnected: ${client.id}`);
    
    // Remove client from all rooms
    for (const [roomId, clients] of this.roomConnections.entries()) {
      if (clients.has(client.id)) {
        clients.delete(client.id);
        if (clients.size === 0) {
          this.roomConnections.delete(roomId);
        }
      }
    }
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(client: Socket, roomId: string) {
    this.logger.log(`👥 Client ${client.id} joining room ${roomId}`);
    
    client.join(`room-${roomId}`);
    
    if (!this.roomConnections.has(roomId)) {
      this.roomConnections.set(roomId, new Set());
    }
    this.roomConnections.get(roomId)!.add(client.id);
    
    client.emit('room-joined', { roomId, status: 'connected' });
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(client: Socket, roomId: string) {
    this.logger.log(`👥 Client ${client.id} leaving room ${roomId}`);
    
    client.leave(`room-${roomId}`);
    
    const roomClients = this.roomConnections.get(roomId);
    if (roomClients) {
      roomClients.delete(client.id);
      if (roomClients.size === 0) {
        this.roomConnections.delete(roomId);
      }
    }
    
    client.emit('room-left', { roomId, status: 'disconnected' });
  }

  /**
   * Publish vote update event
   */
  async publishVoteUpdate(
    roomId: string,
    voteData: VoteNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `🗳️ Publishing vote update to room ${roomId}: ${voteData.userId} voted ${voteData.voteType} on ${voteData.mediaId}`,
      );

      const event = {
        id: this.generateEventId(),
        timestamp: new Date().toISOString(),
        roomId,
        eventType: 'VOTE_UPDATE',
        userId: voteData.userId,
        mediaId: voteData.mediaId,
        voteType: voteData.voteType.toUpperCase(),
        progress: voteData.progress,
      };

      this.server.to(`room-${roomId}`).emit('vote-update', event);
      this.logger.log(`✅ Vote update published successfully`);
    } catch (error) {
      this.logger.error(`Failed to publish vote update: ${error.message}`);
    }
  }

  /**
   * Publish match found event
   */
  async publishMatchFound(
    roomId: string,
    matchData: MatchNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `🎯 Publishing match found to room ${roomId}: ${matchData.mediaTitle}`,
      );

      const event = {
        id: this.generateEventId(),
        timestamp: new Date().toISOString(),
        roomId,
        eventType: 'MATCH_FOUND',
        matchId: this.generateEventId(),
        mediaId: matchData.mediaId,
        mediaTitle: matchData.mediaTitle,
        participants: matchData.participants,
        consensusType: matchData.matchType.toUpperCase(),
      };

      this.server.to(`room-${roomId}`).emit('match-found', event);
      this.logger.log(`✅ Match found published successfully`);
    } catch (error) {
      this.logger.error(`Failed to publish match found: ${error.message}`);
    }
  }

  /**
   * Publish room state change event
   */
  async publishRoomStateChange(
    roomId: string,
    stateData: RoomStateNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `🏠 Publishing room state change for ${roomId}: ${stateData.status}`,
      );

      const event = {
        id: this.generateEventId(),
        timestamp: new Date().toISOString(),
        roomId,
        eventType: 'ROOM_STATE_CHANGE',
        data: {
          status: stateData.status,
          currentMediaId: stateData.currentMediaId,
          queueLength: stateData.queueLength,
          activeMembers: stateData.activeMembers,
        },
      };

      this.server.to(`room-${roomId}`).emit('room-update', event);
      this.logger.log(`✅ Room state change published successfully`);
    } catch (error) {
      this.logger.error(`Failed to publish room state change: ${error.message}`);
    }
  }

  /**
   * Publish member status change event
   */
  async publishMemberStatusChange(
    roomId: string,
    memberData: MemberStatusNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `👤 Publishing member status change for room ${roomId}: ${memberData.userId} is ${memberData.status}`,
      );

      const event = {
        id: this.generateEventId(),
        timestamp: new Date().toISOString(),
        roomId,
        eventType: 'MEMBER_STATUS_CHANGE',
        userId: memberData.userId,
        action: memberData.status === 'left' ? 'LEFT' : 'STATUS_CHANGED',
        memberData: {
          status: memberData.status,
          lastActivity: memberData.lastActivity,
        },
      };

      this.server.to(`room-${roomId}`).emit('member-update', event);
      this.logger.log(`✅ Member status change published successfully`);
    } catch (error) {
      this.logger.error(`Failed to publish member status change: ${error.message}`);
    }
  }

  /**
   * Publish chat message event
   */
  async publishChatMessage(
    roomId: string,
    chatData: ChatMessageNotification,
  ): Promise<void> {
    try {
      this.logger.log(
        `💬 Publishing chat message for room ${roomId}: ${chatData.type} from ${chatData.username}`,
      );

      const event = {
        id: this.generateEventId(),
        timestamp: new Date().toISOString(),
        roomId,
        eventType: 'CHAT_MESSAGE',
        messageId: chatData.messageId,
        userId: chatData.userId,
        username: chatData.username,
        content: chatData.message?.content || chatData.data?.content,
        messageType: 'TEXT',
        action: chatData.type.toUpperCase(),
        metadata: chatData.data,
      };

      this.server.to(`room-${roomId}`).emit('chat-message', event);
      this.logger.log(`✅ Chat message published successfully`);
    } catch (error) {
      this.logger.error(`Failed to publish chat message: ${error.message}`);
    }
  }

  /**
   * Health check for WebSocket connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      return this.server && this.server.engine && this.server.engine.clientsCount >= 0;
    } catch (error) {
      this.logger.error(`WebSocket health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    const totalConnections = this.server?.engine?.clientsCount || 0;
    const totalRooms = this.roomConnections.size;
    
    return {
      type: 'WebSocket',
      totalConnections,
      totalRooms,
      roomConnections: Array.from(this.roomConnections.entries()).map(([roomId, clients]) => ({
        roomId,
        clientCount: clients.size
      })),
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Placeholder methods for compatibility with AppSyncPublisher interface
  async publishRoleAssignment(roomId: string, roleData: RoleAssignmentNotification): Promise<void> {
    this.logger.debug(`Role assignment event for room ${roomId} (WebSocket implementation)`);
  }

  async publishModerationAction(roomId: string, moderationData: ModerationActionNotification): Promise<void> {
    this.logger.debug(`Moderation action event for room ${roomId} (WebSocket implementation)`);
  }

  async publishScheduleEvent(roomId: string, scheduleData: ScheduleNotification): Promise<void> {
    this.logger.debug(`Schedule event for room ${roomId} (WebSocket implementation)`);
  }

  async publishThemeChange(roomId: string, themeData: ThemeChangeNotification): Promise<void> {
    this.logger.debug(`Theme change event for room ${roomId} (WebSocket implementation)`);
  }

  async publishRoomSettingsChange(roomId: string, settingsData: RoomSettingsNotification): Promise<void> {
    this.logger.debug(`Room settings change event for room ${roomId} (WebSocket implementation)`);
  }

  async publishContentSuggestion(roomId: string, suggestionData: ContentSuggestionNotification): Promise<void> {
    this.logger.debug(`Content suggestion event for room ${roomId} (WebSocket implementation)`);
  }
}