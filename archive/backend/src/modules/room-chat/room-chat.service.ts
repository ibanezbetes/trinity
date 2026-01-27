import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import { PermissionService } from '../permission/permission.service';
import {
  ChatMessage,
  ChatMessageType,
  ChatMessageStatus,
  RoomChatConfig,
  RoomChatStats,
  ChatMessageFilters,
  ChatSearchResult,
  ChatEvent,
  TypingStatus,
  ChatNotificationConfig,
  ChatThread,
  ChatModerationAction,
  ChatAutoModerationConfig,
} from '../../domain/entities/room-chat.entity';
import { RoomPermission } from '../../domain/entities/room-moderation.entity';
import {
  SendMessageDto,
  EditMessageDto,
  CreateChatConfigDto,
  UpdateChatConfigDto,
  ChatMessageFiltersDto,
  CreateThreadDto,
  ChatModerationActionDto,
  UpdateAutoModerationDto,
} from './dto/room-chat.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RoomChatService {
  private readonly logger = new Logger(RoomChatService.name);

  constructor(
    private dynamoDBService: DynamoDBService,
    private realtimeService: RealtimeCompatibilityService,
    private permissionService: PermissionService,
  ) {}

  /**
   * Enviar mensaje de chat
   */
  async sendMessage(
    roomId: string,
    userId: string,
    username: string,
    sendMessageDto: SendMessageDto,
  ): Promise<ChatMessage> {
    // Verificar permisos de chat
    await this.permissionService.checkPermission(
      roomId,
      userId,
      RoomPermission.CHAT,
    );

    // Verificar configuración de chat
    const config = await this.getChatConfig(roomId);
    if (!config.isEnabled) {
      throw new ForbiddenException('El chat está deshabilitado en esta sala');
    }

    // Verificar límites de mensaje
    if (sendMessageDto.content.length > config.maxMessageLength) {
      throw new BadRequestException(
        `El mensaje excede el límite de ${config.maxMessageLength} caracteres`,
      );
    }

    // Verificar slow mode
    await this.checkSlowMode(roomId, userId, config.slowModeDelay);

    // Verificar auto-moderación
    await this.checkAutoModeration(roomId, sendMessageDto.content);

    const messageId = uuidv4();
    const now = new Date();

    const message: ChatMessage = {
      id: messageId,
      roomId,
      userId,
      username,
      userAvatar: sendMessageDto.userAvatar,
      type: sendMessageDto.type || ChatMessageType.TEXT,
      content: sendMessageDto.content,
      status: ChatMessageStatus.ACTIVE,
      metadata: sendMessageDto.metadata,
      replyToId: sendMessageDto.replyToId,
      mentions: sendMessageDto.mentions || [],
      attachments: sendMessageDto.attachments || [],
      reactions: [],
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: `CHAT_MESSAGE#${messageId}`,
        GSI1PK: `CHAT#${roomId}`,
        GSI1SK: now.toISOString(),
        GSI2PK: `USER_CHAT#${userId}`,
        GSI2SK: `${roomId}#${now.toISOString()}`,
        ...message,
      });

      // Actualizar estadísticas de chat
      await this.updateChatStats(roomId, userId, username);

      // Notificar en tiempo real
      await this.realtimeService.notifyChatMessage(roomId, {
        type: 'message',
        roomId,
        userId,
        username,
        messageId,
        message,
        timestamp: now,
      });

      this.logger.log(
        `Mensaje de chat enviado: ${messageId} en sala ${roomId} por usuario ${userId}`,
      );
      return message;
    } catch (error) {
      this.logger.error(`Error enviando mensaje de chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Editar mensaje de chat
   */
  async editMessage(
    roomId: string,
    messageId: string,
    userId: string,
    editMessageDto: EditMessageDto,
  ): Promise<ChatMessage> {
    const message = await this.getMessage(roomId, messageId);

    // Verificar que el usuario es el autor del mensaje
    if (message.userId !== userId) {
      throw new ForbiddenException('Solo puedes editar tus propios mensajes');
    }

    // Verificar que el mensaje no está moderado
    if (message.status === ChatMessageStatus.MODERATED) {
      throw new ForbiddenException('No puedes editar un mensaje moderado');
    }

    const now = new Date();
    const updatedMessage: ChatMessage = {
      ...message,
      originalContent: message.originalContent || message.content,
      content: editMessageDto.content,
      status: ChatMessageStatus.EDITED,
      updatedAt: now,
      editedAt: now,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: `CHAT_MESSAGE#${messageId}`,
        GSI1PK: `CHAT#${roomId}`,
        GSI1SK: message.createdAt.toISOString(),
        GSI2PK: `USER_CHAT#${userId}`,
        GSI2SK: `${roomId}#${message.createdAt.toISOString()}`,
        ...updatedMessage,
      });

      // Notificar edición en tiempo real
      await this.realtimeService.notifyChatMessage(roomId, {
        type: 'edit',
        roomId,
        userId,
        username: message.username,
        messageId,
        message: updatedMessage,
        timestamp: now,
      });

      this.logger.log(`Mensaje editado: ${messageId} en sala ${roomId}`);
      return updatedMessage;
    } catch (error) {
      this.logger.error(`Error editando mensaje: ${error.message}`);
      throw error;
    }
  }

  /**
   * Eliminar mensaje de chat
   */
  async deleteMessage(
    roomId: string,
    messageId: string,
    userId: string,
  ): Promise<void> {
    const message = await this.getMessage(roomId, messageId);

    // Verificar permisos (autor del mensaje o moderador)
    const canDelete =
      message.userId === userId ||
      (await this.permissionService.hasPermission(
        roomId,
        userId,
        RoomPermission.MUTE_MEMBERS,
      ));

    if (!canDelete) {
      throw new ForbiddenException(
        'No tienes permisos para eliminar este mensaje',
      );
    }

    const now = new Date();
    const deletedMessage: ChatMessage = {
      ...message,
      status: ChatMessageStatus.DELETED,
      updatedAt: now,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: `CHAT_MESSAGE#${messageId}`,
        GSI1PK: `CHAT#${roomId}`,
        GSI1SK: message.createdAt.toISOString(),
        GSI2PK: `USER_CHAT#${message.userId}`,
        GSI2SK: `${roomId}#${message.createdAt.toISOString()}`,
        ...deletedMessage,
      });

      // Notificar eliminación en tiempo real
      await this.realtimeService.notifyChatMessage(roomId, {
        type: 'delete',
        roomId,
        userId,
        username: message.username,
        messageId,
        timestamp: now,
      });

      this.logger.log(`Mensaje eliminado: ${messageId} en sala ${roomId}`);
    } catch (error) {
      this.logger.error(`Error eliminando mensaje: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener mensajes de chat con filtros
   */
  async getMessages(
    roomId: string,
    userId: string,
    filters: ChatMessageFiltersDto,
  ): Promise<ChatSearchResult> {
    // Verificar permisos de visualización
    await this.permissionService.checkPermission(
      roomId,
      userId,
      RoomPermission.VIEW_ROOM,
    );

    try {
      const limit = Math.min(filters.limit || 50, 100);
      const queryParams: any = {
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `CHAT#${roomId}`,
        },
        IndexName: 'GSI1',
        ScanIndexForward: filters.sortOrder !== 'desc',
        Limit: limit,
      };

      // Aplicar filtros
      const filterExpressions: string[] = [];

      if (filters.userId) {
        queryParams.ExpressionAttributeValues[':userId'] = filters.userId;
        filterExpressions.push('userId = :userId');
      }

      if (filters.type) {
        queryParams.ExpressionAttributeValues[':type'] = filters.type;
        filterExpressions.push('#type = :type');
        queryParams.ExpressionAttributeNames = { '#type': 'type' };
      }

      if (filters.status) {
        queryParams.ExpressionAttributeValues[':status'] = filters.status;
        filterExpressions.push('#status = :status');
        queryParams.ExpressionAttributeNames = {
          ...queryParams.ExpressionAttributeNames,
          '#status': 'status',
        };
      }

      if (filters.dateFrom) {
        queryParams.ExpressionAttributeValues[':dateFrom'] =
          filters.dateFrom.toISOString();
        filterExpressions.push('createdAt >= :dateFrom');
      }

      if (filters.dateTo) {
        queryParams.ExpressionAttributeValues[':dateTo'] =
          filters.dateTo.toISOString();
        filterExpressions.push('createdAt <= :dateTo');
      }

      if (filters.searchText) {
        queryParams.ExpressionAttributeValues[':searchText'] =
          filters.searchText;
        filterExpressions.push('contains(content, :searchText)');
      }

      if (filters.hasAttachments !== undefined) {
        if (filters.hasAttachments) {
          filterExpressions.push(
            'attribute_exists(attachments) AND size(attachments) > :zero',
          );
          queryParams.ExpressionAttributeValues[':zero'] = 0;
        } else {
          filterExpressions.push(
            '(attribute_not_exists(attachments) OR size(attachments) = :zero)',
          );
          queryParams.ExpressionAttributeValues[':zero'] = 0;
        }
      }

      if (filterExpressions.length > 0) {
        queryParams.FilterExpression = filterExpressions.join(' AND ');
      }

      if (filters.offset) {
        queryParams.ExclusiveStartKey = {
          GSI1PK: `CHAT#${roomId}`,
          GSI1SK: filters.offset,
        };
      }

      const result = await this.dynamoDBService.query(queryParams);
      const messages = (result as any).Items?.map((item: any) => item as ChatMessage) || [];

      // Filtrar mensajes eliminados para usuarios normales
      const canViewDeleted = await this.permissionService.hasPermission(
        roomId,
        userId,
        RoomPermission.VIEW_MODERATION_LOG,
      );

      const filteredMessages = canViewDeleted
        ? messages
        : messages.filter((msg) => msg.status !== ChatMessageStatus.DELETED);

      return {
        messages: filteredMessages,
        totalCount: filteredMessages.length,
        hasMore: !!(result as any).LastEvaluatedKey,
        nextOffset: (result as any).LastEvaluatedKey?.GSI1SK,
      };
    } catch (error) {
      this.logger.error(`Error obteniendo mensajes de chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Agregar reacción a mensaje
   */
  async addReaction(
    roomId: string,
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<ChatMessage> {
    // Verificar permisos
    await this.permissionService.checkPermission(
      roomId,
      userId,
      RoomPermission.REACT,
    );

    const message = await this.getMessage(roomId, messageId);

    // Verificar configuración de reacciones
    const config = await this.getChatConfig(roomId);
    if (!config.allowReactions) {
      throw new ForbiddenException(
        'Las reacciones están deshabilitadas en esta sala',
      );
    }

    const reactions = [...(message.reactions || [])];
    const existingReaction = reactions.find((r) => r.emoji === emoji);

    if (existingReaction) {
      // Agregar usuario a reacción existente si no está ya
      if (!existingReaction.users.includes(userId)) {
        existingReaction.users.push(userId);
        existingReaction.count = existingReaction.users.length;
      }
    } else {
      // Crear nueva reacción
      reactions.push({
        emoji,
        users: [userId],
        count: 1,
      });
    }

    const updatedMessage: ChatMessage = {
      ...message,
      reactions,
      updatedAt: new Date(),
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: `CHAT_MESSAGE#${messageId}`,
        GSI1PK: `CHAT#${roomId}`,
        GSI1SK: message.createdAt.toISOString(),
        GSI2PK: `USER_CHAT#${message.userId}`,
        GSI2SK: `${roomId}#${message.createdAt.toISOString()}`,
        ...updatedMessage,
      });

      // Notificar reacción en tiempo real
      await this.realtimeService.notifyChatMessage(roomId, {
        type: 'reaction',
        roomId,
        userId,
        username: '', // Se puede obtener del contexto
        messageId,
        data: { emoji, action: 'add' },
        timestamp: new Date(),
      });

      return updatedMessage;
    } catch (error) {
      this.logger.error(`Error agregando reacción: ${error.message}`);
      throw error;
    }
  }

  /**
   * Configurar chat de sala
   */
  async configureChatConfig(
    roomId: string,
    userId: string,
    configDto: CreateChatConfigDto | UpdateChatConfigDto,
  ): Promise<RoomChatConfig> {
    // Verificar permisos de configuración
    await this.permissionService.checkPermission(
      roomId,
      userId,
      RoomPermission.MODIFY_SETTINGS,
    );

    const now = new Date();
    const config: RoomChatConfig = {
      roomId,
      isEnabled: configDto.isEnabled ?? true,
      allowFileUploads: configDto.allowFileUploads ?? true,
      allowLinks: configDto.allowLinks ?? true,
      allowMentions: configDto.allowMentions ?? true,
      allowReactions: configDto.allowReactions ?? true,
      maxMessageLength: configDto.maxMessageLength ?? 1000,
      slowModeDelay: configDto.slowModeDelay ?? 0,
      retentionDays: configDto.retentionDays ?? 30,
      moderationEnabled: configDto.moderationEnabled ?? true,
      profanityFilterEnabled: configDto.profanityFilterEnabled ?? false,
      customBannedWords: configDto.customBannedWords || [],
      allowedFileTypes: configDto.allowedFileTypes || [
        'image/jpeg',
        'image/png',
        'image/gif',
      ],
      maxFileSize: configDto.maxFileSize ?? 5 * 1024 * 1024, // 5MB
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: 'CHAT_CONFIG',
        ...config,
      });

      this.logger.log(`Configuración de chat actualizada para sala ${roomId}`);
      return config;
    } catch (error) {
      this.logger.error(`Error configurando chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener configuración de chat
   */
  async getChatConfig(roomId: string): Promise<RoomChatConfig> {
    try {
      const result = await this.dynamoDBService.getItem(
        DynamoDBKeys.roomPK(roomId),
        'CHAT_CONFIG',
      );

      if (!result) {
        // Retornar configuración por defecto
        return {
          roomId,
          isEnabled: true,
          allowFileUploads: true,
          allowLinks: true,
          allowMentions: true,
          allowReactions: true,
          maxMessageLength: 1000,
          slowModeDelay: 0,
          retentionDays: 30,
          moderationEnabled: true,
          profanityFilterEnabled: false,
          customBannedWords: [],
          allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif'],
          maxFileSize: 5 * 1024 * 1024,
          createdBy: 'system',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      return result as unknown as RoomChatConfig;
    } catch (error) {
      this.logger.error(
        `Error obteniendo configuración de chat: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener estadísticas de chat
   */
  async getChatStats(roomId: string, userId: string): Promise<RoomChatStats> {
    // Verificar permisos
    await this.permissionService.checkPermission(
      roomId,
      userId,
      RoomPermission.VIEW_ROOM,
    );

    try {
      const result = await this.dynamoDBService.getItem(
        DynamoDBKeys.roomPK(roomId),
        'CHAT_STATS',
      );

      if (!result) {
        // Calcular estadísticas si no existen
        return this.calculateChatStats(roomId);
      }

      return result as unknown as RoomChatStats;
    } catch (error) {
      this.logger.error(
        `Error obteniendo estadísticas de chat: ${error.message}`,
      );
      throw error;
    }
  }

  // Métodos auxiliares privados

  private async getMessage(
    roomId: string,
    messageId: string,
  ): Promise<ChatMessage> {
    const result = await this.dynamoDBService.getItem(
      DynamoDBKeys.roomPK(roomId),
      `CHAT_MESSAGE#${messageId}`,
    );

    if (!result) {
      throw new NotFoundException('Mensaje no encontrado');
    }

    return result as unknown as ChatMessage;
  }

  private async checkSlowMode(
    roomId: string,
    userId: string,
    slowModeDelay: number,
  ): Promise<void> {
    if (slowModeDelay === 0) return;

    // Obtener último mensaje del usuario
    const result = await this.dynamoDBService.query({
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `USER_CHAT#${userId}`,
      },
      ScanIndexForward: false,
      Limit: 1,
    });

    if ((result as any).Items && (result as any).Items.length > 0) {
      const lastMessage = (result as any).Items[0] as ChatMessage;
      const timeSinceLastMessage = Date.now() - lastMessage.createdAt.getTime();
      const requiredDelay = slowModeDelay * 1000;

      if (timeSinceLastMessage < requiredDelay) {
        const remainingTime = Math.ceil(
          (requiredDelay - timeSinceLastMessage) / 1000,
        );
        throw new BadRequestException(
          `Debes esperar ${remainingTime} segundos antes de enviar otro mensaje`,
        );
      }
    }
  }

  private async checkAutoModeration(
    roomId: string,
    content: string,
  ): Promise<void> {
    const autoModConfig = await this.getAutoModerationConfig(roomId);

    if (!autoModConfig.enabled) return;

    // Verificar filtro de profanidad
    if (autoModConfig.profanityFilter.enabled) {
      const bannedWords = [...autoModConfig.profanityFilter.customWords];
      const containsBannedWord = bannedWords.some((word) =>
        content.toLowerCase().includes(word.toLowerCase()),
      );

      if (containsBannedWord) {
        throw new BadRequestException(
          'El mensaje contiene contenido no permitido',
        );
      }
    }

    // Verificar filtro de mayúsculas
    if (autoModConfig.capsFilter.enabled) {
      const capsCount = (content.match(/[A-Z]/g) || []).length;
      const capsPercentage = (capsCount / content.length) * 100;

      if (capsPercentage > autoModConfig.capsFilter.maxCapsPercentage) {
        throw new BadRequestException(
          'El mensaje contiene demasiadas mayúsculas',
        );
      }
    }
  }

  private async getAutoModerationConfig(
    roomId: string,
  ): Promise<ChatAutoModerationConfig> {
    try {
      const result = await this.dynamoDBService.getItem(
        DynamoDBKeys.roomPK(roomId),
        'CHAT_AUTO_MODERATION',
      );

      if (!result) {
        // Configuración por defecto
        return {
          roomId,
          enabled: false,
          spamDetection: {
            enabled: false,
            maxMessagesPerMinute: 10,
            duplicateMessageThreshold: 3,
          },
          profanityFilter: {
            enabled: false,
            action: 'delete',
            customWords: [],
          },
          linkFilter: {
            enabled: false,
            allowWhitelistedDomains: false,
            whitelistedDomains: [],
          },
          capsFilter: {
            enabled: false,
            maxCapsPercentage: 70,
          },
          updatedBy: 'system',
          updatedAt: new Date(),
        };
      }

      return result as unknown as ChatAutoModerationConfig;
    } catch (error) {
      this.logger.error(
        `Error obteniendo configuración de auto-moderación: ${error.message}`,
      );
      throw error;
    }
  }

  private async updateChatStats(
    roomId: string,
    userId: string,
    username: string,
  ): Promise<void> {
    try {
      // Esta es una implementación simplificada
      // En producción, se podría usar un sistema más sofisticado de agregación
      const now = new Date();

      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.roomPK(roomId),
        SK: 'CHAT_STATS',
        roomId,
        lastActivityAt: now,
        lastMessageBy: userId,
        lastMessageByUsername: username,
        updatedAt: now,
      });
    } catch (error) {
      this.logger.warn(
        `Error actualizando estadísticas de chat: ${error.message}`,
      );
      // No lanzar error para no afectar el envío del mensaje
    }
  }

  private async calculateChatStats(roomId: string): Promise<RoomChatStats> {
    // Implementación simplificada para calcular estadísticas
    // En producción, esto se haría de forma más eficiente
    return {
      roomId,
      totalMessages: 0,
      activeUsers: 0,
      messagesLast24h: 0,
      messagesLast7d: 0,
      topUsers: [],
      messagesByType: {
        [ChatMessageType.TEXT]: 0,
        [ChatMessageType.SYSTEM]: 0,
        [ChatMessageType.CONTENT_SUGGESTION]: 0,
        [ChatMessageType.POLL]: 0,
        [ChatMessageType.ANNOUNCEMENT]: 0,
        [ChatMessageType.REACTION]: 0,
      },
      averageMessagesPerUser: 0,
      peakActivityHour: 0,
      lastActivityAt: new Date(),
    };
  }
}
