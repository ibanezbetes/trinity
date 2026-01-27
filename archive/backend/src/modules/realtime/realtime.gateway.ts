import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  roomId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private connectedUsers = new Map<string, AuthenticatedSocket>();
  private roomMembers = new Map<string, Set<string>>(); // roomId -> Set<userId>

  async handleConnection(client: AuthenticatedSocket) {
    try {
      this.logger.log(`🔌 Client attempting to connect: ${client.id}`);

      // En producción, aquí validarías el JWT token
      // const token = client.handshake.auth.token;
      // const user = await this.validateToken(token);

      // Por ahora, simulamos autenticación
      const userId = client.handshake.query.userId as string;
      if (!userId) {
        this.logger.warn(`❌ Connection rejected - no userId: ${client.id}`);
        client.disconnect();
        return;
      }

      client.userId = userId;
      this.connectedUsers.set(userId, client);

      this.logger.log(`✅ User connected: ${userId} (socket: ${client.id})`);

      // Notificar al cliente que está conectado
      client.emit('connected', {
        userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`❌ Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.userId;
    const roomId = client.roomId;

    if (userId) {
      this.connectedUsers.delete(userId);

      // Remover de la sala si estaba en una
      if (roomId) {
        this.leaveRoom(userId, roomId);
      }

      this.logger.log(`👋 User disconnected: ${userId} (socket: ${client.id})`);
    }
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { roomId } = data;
    const userId = client.userId;

    if (!userId || !roomId) {
      client.emit('error', { message: 'Missing userId or roomId' });
      return;
    }

    try {
      // Salir de la sala anterior si estaba en una
      if (client.roomId) {
        this.leaveRoom(userId, client.roomId);
      }

      // Unirse a la nueva sala
      client.join(roomId);
      client.roomId = roomId;

      // Actualizar tracking de miembros
      if (!this.roomMembers.has(roomId)) {
        this.roomMembers.set(roomId, new Set());
      }
      this.roomMembers.get(roomId)!.add(userId);

      this.logger.log(`🏠 User ${userId} joined room ${roomId}`);

      // Notificar al usuario
      client.emit('roomJoined', {
        roomId,
        userId,
        timestamp: new Date().toISOString(),
      });

      // Notificar a otros miembros de la sala
      client.to(roomId).emit('memberJoined', {
        roomId,
        userId,
        timestamp: new Date().toISOString(),
      });

      // Enviar lista de miembros conectados
      const connectedMembers = Array.from(this.roomMembers.get(roomId) || []);
      client.emit('roomMembers', {
        roomId,
        members: connectedMembers,
        count: connectedMembers.length,
      });
    } catch (error) {
      this.logger.error(`❌ Error joining room: ${error.message}`);
      client.emit('error', { message: 'Failed to join room' });
    }
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { roomId } = data;
    const userId = client.userId;

    if (!userId || !roomId) {
      return;
    }

    this.leaveRoom(userId, roomId);
    client.emit('roomLeft', { roomId, userId });
  }

  private leaveRoom(userId: string, roomId: string) {
    const client = this.connectedUsers.get(userId);
    if (client) {
      client.leave(roomId);
      client.roomId = undefined;
    }

    // Actualizar tracking de miembros
    const roomMemberSet = this.roomMembers.get(roomId);
    if (roomMemberSet) {
      roomMemberSet.delete(userId);
      if (roomMemberSet.size === 0) {
        this.roomMembers.delete(roomId);
      }
    }

    this.logger.log(`🚪 User ${userId} left room ${roomId}`);

    // Notificar a otros miembros
    if (client) {
      client.to(roomId).emit('memberLeft', {
        roomId,
        userId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Métodos públicos para ser llamados desde otros servicios

  /**
   * Notificar voto en tiempo real
   */
  notifyVote(roomId: string, voteData: any) {
    this.logger.log(`🗳️ Broadcasting vote to room ${roomId}`);
    this.server.to(roomId).emit('voteUpdate', {
      roomId,
      ...voteData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notificar match encontrado
   */
  notifyMatch(roomId: string, matchData: any) {
    this.logger.log(`🎯 Broadcasting match to room ${roomId}`);
    this.server.to(roomId).emit('matchFound', {
      roomId,
      ...matchData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notificar cambio de estado de sala
   */
  notifyRoomStateChange(roomId: string, stateData: any) {
    this.logger.log(`🏠 Broadcasting room state change to room ${roomId}`);
    this.server.to(roomId).emit('roomStateChanged', {
      roomId,
      ...stateData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notificar cambio de estado de miembro
   */
  notifyMemberStatusChange(roomId: string, memberData: any) {
    this.logger.log(`👤 Broadcasting member status change to room ${roomId}`);
    this.server.to(roomId).emit('memberStatusChanged', {
      roomId,
      ...memberData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notificar asignación de rol
   */
  notifyRoleAssignment(roomId: string, roleData: any) {
    this.logger.log(`👑 Broadcasting role assignment to room ${roomId}`);
    this.server.to(roomId).emit('roleAssignment', {
      roomId,
      ...roleData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notificar acción de moderación
   */
  notifyModerationAction(roomId: string, moderationData: any) {
    this.logger.log(`🛡️ Broadcasting moderation action to room ${roomId}`);
    this.server.to(roomId).emit('moderationAction', {
      roomId,
      ...moderationData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notificar evento de programación
   */
  notifyScheduleEvent(roomId: string, scheduleData: any) {
    this.logger.log(`📅 Broadcasting schedule event to room ${roomId}`);
    this.server.to(roomId).emit('scheduleEvent', {
      roomId,
      ...scheduleData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notificar cambio de tema
   */
  notifyThemeChange(roomId: string, themeData: any) {
    this.logger.log(`🎨 Broadcasting theme change to room ${roomId}`);
    this.server.to(roomId).emit('themeChange', {
      roomId,
      ...themeData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notificar cambio de configuración de sala
   */
  notifyRoomSettingsChange(roomId: string, settingsData: any) {
    this.logger.log(`⚙️ Broadcasting room settings change to room ${roomId}`);
    this.server.to(roomId).emit('roomSettingsChange', {
      roomId,
      ...settingsData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notificar mensaje de chat
   */
  notifyChatMessage(roomId: string, chatData: any) {
    this.logger.log(
      `💬 Broadcasting chat message to room ${roomId}: ${chatData.eventType}`,
    );
    this.server.to(roomId).emit('chatMessage', {
      roomId,
      ...chatData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notificar sugerencia de contenido
   */
  notifyContentSuggestion(roomId: string, suggestionData: any) {
    this.logger.log(
      `💡 Broadcasting content suggestion to room ${roomId}: ${suggestionData.eventType}`,
    );
    this.server.to(roomId).emit('contentSuggestion', {
      roomId,
      ...suggestionData,
      timestamp: new Date().toISOString(),
    });
  }
  getConnectedMembers(roomId: string): string[] {
    return Array.from(this.roomMembers.get(roomId) || []);
  }

  /**
   * Verificar si un usuario está conectado
   */
  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  /**
   * Obtener estadísticas de conexiones
   */
  getConnectionStats() {
    return {
      totalConnections: this.connectedUsers.size,
      activeRooms: this.roomMembers.size,
      roomStats: Array.from(this.roomMembers.entries()).map(
        ([roomId, members]) => ({
          roomId,
          memberCount: members.size,
          members: Array.from(members),
        }),
      ),
    };
  }
}
