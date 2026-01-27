/**
 * WebSocket Gateway
 * NestJS WebSocket gateway for handling real-time connections
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WebSocketService } from './websocket.service';
import { WebSocketMessage } from './websocket.interface';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class WebSocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGateway.name);

  constructor(private readonly webSocketService: WebSocketService) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const connection = await this.webSocketService.handleConnection(client);
      this.logger.debug(`Client connected: ${connection.id}`);
      
      // Send welcome message
      client.emit('connected', {
        connectionId: connection.id,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Error handling connection:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      // Find connection by socket
      const connectionId = await this.findConnectionIdBySocket(client);
      if (connectionId) {
        await this.webSocketService.handleDisconnection(connectionId);
        this.logger.debug(`Client disconnected: ${connectionId}`);
      }
    } catch (error) {
      this.logger.error('Error handling disconnection:', error);
    }
  }

  @SubscribeMessage('authenticate')
  async handleAuthenticate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { token: string }
  ) {
    try {
      const connectionId = await this.findConnectionIdBySocket(client);
      if (!connectionId) {
        client.emit('error', { message: 'Connection not found' });
        return;
      }

      await this.webSocketService.authenticateConnection(connectionId, data.token);
    } catch (error) {
      this.logger.error('Authentication error:', error);
      client.emit('authentication-failed', { message: 'Authentication failed' });
    }
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; participantId?: string }
  ) {
    try {
      const connectionId = await this.findConnectionIdBySocket(client);
      if (!connectionId) {
        client.emit('error', { message: 'Connection not found' });
        return;
      }

      await this.webSocketService.joinRoom(connectionId, data.roomId, data.participantId);
    } catch (error) {
      this.logger.error('Join room error:', error);
      client.emit('join-room-failed', { message: 'Failed to join room' });
    }
  }

  @SubscribeMessage('leave-room')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string }
  ) {
    try {
      const connectionId = await this.findConnectionIdBySocket(client);
      if (!connectionId) {
        client.emit('error', { message: 'Connection not found' });
        return;
      }

      await this.webSocketService.leaveRoom(connectionId, data.roomId);
    } catch (error) {
      this.logger.error('Leave room error:', error);
      client.emit('leave-room-failed', { message: 'Failed to leave room' });
    }
  }

  @SubscribeMessage('ping')
  async handlePing(@ConnectedSocket() client: Socket) {
    try {
      const connectionId = await this.findConnectionIdBySocket(client);
      if (connectionId) {
        const connection = await this.webSocketService.getConnection(connectionId);
        if (connection) {
          connection.lastActiveAt = new Date();
          client.emit('pong', { timestamp: new Date() });
        }
      }
    } catch (error) {
      this.logger.error('Ping error:', error);
    }
  }

  @SubscribeMessage('room-message')
  async handleRoomMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; message: any }
  ) {
    try {
      const connectionId = await this.findConnectionIdBySocket(client);
      if (!connectionId) {
        client.emit('error', { message: 'Connection not found' });
        return;
      }

      const connection = await this.webSocketService.getConnection(connectionId);
      if (!connection || !connection.isAuthenticated) {
        client.emit('error', { message: 'Not authenticated' });
        return;
      }

      if (connection.roomId !== data.roomId) {
        client.emit('error', { message: 'Not in specified room' });
        return;
      }

      // Broadcast message to room
      const message: WebSocketMessage = {
        type: 'room-message',
        roomId: data.roomId,
        userId: connection.userId,
        participantId: connection.participantId,
        data: data.message,
        timestamp: new Date(),
        messageId: this.generateMessageId(),
      };

      await this.webSocketService.broadcastToRoom(data.roomId, message, [connectionId]);
    } catch (error) {
      this.logger.error('Room message error:', error);
      client.emit('room-message-failed', { message: 'Failed to send room message' });
    }
  }

  @SubscribeMessage('vote-cast')
  async handleVoteCast(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; optionIds: string[] }
  ) {
    try {
      const connectionId = await this.findConnectionIdBySocket(client);
      if (!connectionId) {
        client.emit('error', { message: 'Connection not found' });
        return;
      }

      const connection = await this.webSocketService.getConnection(connectionId);
      if (!connection || !connection.isAuthenticated || !connection.roomId) {
        client.emit('error', { message: 'Not authenticated or not in room' });
        return;
      }

      // Broadcast vote cast to room
      const message: WebSocketMessage = {
        type: 'vote-cast',
        roomId: connection.roomId,
        userId: connection.userId,
        participantId: connection.participantId,
        data: {
          sessionId: data.sessionId,
          optionIds: data.optionIds,
        },
        timestamp: new Date(),
        messageId: this.generateMessageId(),
      };

      await this.webSocketService.broadcastToRoom(connection.roomId, message);
    } catch (error) {
      this.logger.error('Vote cast error:', error);
      client.emit('vote-cast-failed', { message: 'Failed to broadcast vote' });
    }
  }

  @SubscribeMessage('typing-start')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string }
  ) {
    try {
      const connectionId = await this.findConnectionIdBySocket(client);
      if (!connectionId) return;

      const connection = await this.webSocketService.getConnection(connectionId);
      if (!connection || !connection.isAuthenticated || connection.roomId !== data.roomId) {
        return;
      }

      const message: WebSocketMessage = {
        type: 'typing-start',
        roomId: data.roomId,
        userId: connection.userId,
        participantId: connection.participantId,
        data: {},
        timestamp: new Date(),
        messageId: this.generateMessageId(),
      };

      await this.webSocketService.broadcastToRoom(data.roomId, message, [connectionId]);
    } catch (error) {
      this.logger.error('Typing start error:', error);
    }
  }

  @SubscribeMessage('typing-stop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string }
  ) {
    try {
      const connectionId = await this.findConnectionIdBySocket(client);
      if (!connectionId) return;

      const connection = await this.webSocketService.getConnection(connectionId);
      if (!connection || !connection.isAuthenticated || connection.roomId !== data.roomId) {
        return;
      }

      const message: WebSocketMessage = {
        type: 'typing-stop',
        roomId: data.roomId,
        userId: connection.userId,
        participantId: connection.participantId,
        data: {},
        timestamp: new Date(),
        messageId: this.generateMessageId(),
      };

      await this.webSocketService.broadcastToRoom(data.roomId, message, [connectionId]);
    } catch (error) {
      this.logger.error('Typing stop error:', error);
    }
  }

  // Helper method to broadcast messages from external services
  async broadcastToRoom(roomId: string, message: WebSocketMessage, excludeConnections?: string[]) {
    await this.webSocketService.broadcastToRoom(roomId, message, excludeConnections);
  }

  async sendToUser(userId: string, message: WebSocketMessage) {
    await this.webSocketService.sendToUser(userId, message);
  }

  async broadcastToAll(message: WebSocketMessage, excludeConnections?: string[]) {
    await this.webSocketService.broadcastToAll(message, excludeConnections);
  }

  private async findConnectionIdBySocket(socket: Socket): Promise<string | null> {
    // In a real implementation, you might store the connection ID in socket metadata
    // For now, we'll search through connections
    const stats = await this.webSocketService.getConnectionStats();
    
    // This is inefficient but works for the mock implementation
    // In production, store connectionId in socket.data or use a Map
    for (const [connectionId, connection] of (this.webSocketService as any).connections) {
      if (connection.socket === socket) {
        return connectionId;
      }
    }
    
    return null;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}