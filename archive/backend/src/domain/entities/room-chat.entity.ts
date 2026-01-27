/**
 * Entidades para el sistema de chat colaborativo en salas
 */

/**
 * Tipos de mensajes de chat
 */
export enum ChatMessageType {
  TEXT = 'text',
  SYSTEM = 'system',
  CONTENT_SUGGESTION = 'content_suggestion',
  POLL = 'poll',
  ANNOUNCEMENT = 'announcement',
  REACTION = 'reaction',
}

/**
 * Estados de mensaje de chat
 */
export enum ChatMessageStatus {
  ACTIVE = 'active',
  DELETED = 'deleted',
  MODERATED = 'moderated',
  EDITED = 'edited',
}

/**
 * Mensaje de chat en sala
 */
export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  userAvatar?: string;
  type: ChatMessageType;
  content: string;
  originalContent?: string; // Para mensajes editados
  status: ChatMessageStatus;
  metadata?: Record<string, any>; // Datos adicionales según el tipo
  replyToId?: string; // Para respuestas a otros mensajes
  mentions?: string[]; // IDs de usuarios mencionados
  attachments?: ChatAttachment[];
  reactions?: ChatReaction[];
  createdAt: Date;
  updatedAt: Date;
  editedAt?: Date;
  moderatedBy?: string;
  moderationReason?: string;
}

/**
 * Adjunto en mensaje de chat
 */
export interface ChatAttachment {
  id: string;
  type: 'image' | 'file' | 'link' | 'media';
  url: string;
  filename?: string;
  size?: number;
  mimeType?: string;
  thumbnail?: string;
}

/**
 * Reacción a mensaje de chat
 */
export interface ChatReaction {
  emoji: string;
  users: string[]; // IDs de usuarios que reaccionaron
  count: number;
}

/**
 * Configuración de chat de sala
 */
export interface RoomChatConfig {
  roomId: string;
  isEnabled: boolean;
  allowFileUploads: boolean;
  allowLinks: boolean;
  allowMentions: boolean;
  allowReactions: boolean;
  maxMessageLength: number;
  slowModeDelay: number; // Segundos entre mensajes
  retentionDays: number; // Días para mantener mensajes
  moderationEnabled: boolean;
  profanityFilterEnabled: boolean;
  customBannedWords: string[];
  allowedFileTypes: string[];
  maxFileSize: number; // En bytes
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Estadísticas de chat de sala
 */
export interface RoomChatStats {
  roomId: string;
  totalMessages: number;
  activeUsers: number;
  messagesLast24h: number;
  messagesLast7d: number;
  topUsers: Array<{
    userId: string;
    username: string;
    messageCount: number;
  }>;
  messagesByType: Record<ChatMessageType, number>;
  averageMessagesPerUser: number;
  peakActivityHour: number;
  lastActivityAt: Date;
}

/**
 * Filtros para búsqueda de mensajes
 */
export interface ChatMessageFilters {
  roomId: string;
  userId?: string;
  type?: ChatMessageType;
  status?: ChatMessageStatus;
  dateFrom?: Date;
  dateTo?: Date;
  searchText?: string;
  hasAttachments?: boolean;
  hasReactions?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Resultado de búsqueda de mensajes
 */
export interface ChatSearchResult {
  messages: ChatMessage[];
  totalCount: number;
  hasMore: boolean;
  nextOffset?: number;
}

/**
 * Evento de chat en tiempo real
 */
export interface ChatEvent {
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
  message?: ChatMessage;
  data?: Record<string, any>;
  timestamp: Date;
}

/**
 * Estado de escritura de usuario
 */
export interface TypingStatus {
  roomId: string;
  userId: string;
  username: string;
  isTyping: boolean;
  lastTypingAt: Date;
}

/**
 * Configuración de notificaciones de chat
 */
export interface ChatNotificationConfig {
  userId: string;
  roomId: string;
  enableMentions: boolean;
  enableReplies: boolean;
  enableReactions: boolean;
  enableSystemMessages: boolean;
  muteUntil?: Date;
  keywords: string[]; // Palabras clave para notificar
}

/**
 * Hilo de discusión
 */
export interface ChatThread {
  id: string;
  roomId: string;
  parentMessageId: string;
  title?: string;
  participantIds: string[];
  messageCount: number;
  lastMessageAt: Date;
  createdBy: string;
  createdAt: Date;
  isArchived: boolean;
}

/**
 * Moderación de chat
 */
export interface ChatModerationAction {
  id: string;
  roomId: string;
  messageId: string;
  moderatorId: string;
  action: 'delete' | 'edit' | 'warn' | 'timeout';
  reason: string;
  originalContent?: string;
  newContent?: string;
  timeoutDuration?: number; // En minutos
  createdAt: Date;
}

/**
 * Configuración de auto-moderación de chat
 */
export interface ChatAutoModerationConfig {
  roomId: string;
  enabled: boolean;
  spamDetection: {
    enabled: boolean;
    maxMessagesPerMinute: number;
    duplicateMessageThreshold: number;
  };
  profanityFilter: {
    enabled: boolean;
    action: 'delete' | 'moderate' | 'warn';
    customWords: string[];
  };
  linkFilter: {
    enabled: boolean;
    allowWhitelistedDomains: boolean;
    whitelistedDomains: string[];
  };
  capsFilter: {
    enabled: boolean;
    maxCapsPercentage: number;
  };
  updatedBy: string;
  updatedAt: Date;
}
