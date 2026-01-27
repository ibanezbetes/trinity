import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  IsEnum,
  IsDateString,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ChatMessageType,
  ChatMessageStatus,
  ChatAttachment,
} from '../../../domain/entities/room-chat.entity';

/**
 * DTO para configuración de detección de spam
 */
export class SpamDetectionConfigDto {
  @ApiPropertyOptional({
    description: 'Habilitar detección de spam',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Máximo mensajes por minuto',
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  maxMessagesPerMinute?: number;

  @ApiPropertyOptional({
    description: 'Umbral de mensajes duplicados',
    default: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  duplicateMessageThreshold?: number;
}

/**
 * DTO para configuración de filtro de profanidad
 */
export class ProfanityFilterConfigDto {
  @ApiPropertyOptional({
    description: 'Habilitar filtro de profanidad',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    enum: ['delete', 'moderate', 'warn'],
    description: 'Acción a tomar',
  })
  @IsOptional()
  @IsEnum(['delete', 'moderate', 'warn'])
  action?: 'delete' | 'moderate' | 'warn';

  @ApiPropertyOptional({
    description: 'Palabras personalizadas',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customWords?: string[];
}

/**
 * DTO para configuración de filtro de enlaces
 */
export class LinkFilterConfigDto {
  @ApiPropertyOptional({
    description: 'Habilitar filtro de enlaces',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Permitir dominios en lista blanca',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowWhitelistedDomains?: boolean;

  @ApiPropertyOptional({
    description: 'Dominios en lista blanca',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  whitelistedDomains?: string[];
}

/**
 * DTO para configuración de filtro de mayúsculas
 */
export class CapsFilterConfigDto {
  @ApiPropertyOptional({
    description: 'Habilitar filtro de mayúsculas',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Porcentaje máximo de mayúsculas',
    default: 70,
  })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(100)
  maxCapsPercentage?: number;
}

/**
 * DTO para configuración de notificaciones de chat
 */
export class ChatNotificationConfigDto {
  @ApiPropertyOptional({
    description: 'Habilitar notificaciones de menciones',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enableMentions?: boolean;

  @ApiPropertyOptional({
    description: 'Habilitar notificaciones de respuestas',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enableReplies?: boolean;

  @ApiPropertyOptional({
    description: 'Habilitar notificaciones de reacciones',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enableReactions?: boolean;

  @ApiPropertyOptional({
    description: 'Habilitar notificaciones de mensajes del sistema',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enableSystemMessages?: boolean;

  @ApiPropertyOptional({ description: 'Silenciar hasta (ISO string)' })
  @IsOptional()
  @IsDateString()
  muteUntil?: Date;

  @ApiPropertyOptional({
    description: 'Palabras clave para notificar',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];
}

/**
 * DTO para enviar mensaje de chat
 */
export class SendMessageDto {
  @ApiProperty({ description: 'Contenido del mensaje' })
  @IsString()
  content: string;

  @ApiPropertyOptional({
    enum: ChatMessageType,
    description: 'Tipo de mensaje',
  })
  @IsOptional()
  @IsEnum(ChatMessageType)
  type?: ChatMessageType;

  @ApiPropertyOptional({ description: 'Avatar del usuario' })
  @IsOptional()
  @IsString()
  userAvatar?: string;

  @ApiPropertyOptional({ description: 'ID del mensaje al que responde' })
  @IsOptional()
  @IsString()
  replyToId?: string;

  @ApiPropertyOptional({
    description: 'IDs de usuarios mencionados',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];

  @ApiPropertyOptional({ description: 'Adjuntos del mensaje', type: [Object] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachment[];

  @ApiPropertyOptional({ description: 'Metadatos adicionales' })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO para adjunto de chat
 */
export class ChatAttachmentDto {
  @ApiProperty({ description: 'Tipo de adjunto' })
  @IsEnum(['image', 'file', 'link', 'media'])
  type: 'image' | 'file' | 'link' | 'media';

  @ApiProperty({ description: 'URL del adjunto' })
  @IsString()
  url: string;

  @ApiPropertyOptional({ description: 'Nombre del archivo' })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiPropertyOptional({ description: 'Tamaño del archivo en bytes' })
  @IsOptional()
  @IsNumber()
  size?: number;

  @ApiPropertyOptional({ description: 'Tipo MIME' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ description: 'URL de miniatura' })
  @IsOptional()
  @IsString()
  thumbnail?: string;
}

/**
 * DTO para editar mensaje
 */
export class EditMessageDto {
  @ApiProperty({ description: 'Nuevo contenido del mensaje' })
  @IsString()
  content: string;
}

/**
 * DTO para filtros de búsqueda de mensajes
 */
export class ChatMessageFiltersDto {
  @ApiPropertyOptional({ description: 'ID del usuario' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    enum: ChatMessageType,
    description: 'Tipo de mensaje',
  })
  @IsOptional()
  @IsEnum(ChatMessageType)
  type?: ChatMessageType;

  @ApiPropertyOptional({
    enum: ChatMessageStatus,
    description: 'Estado del mensaje',
  })
  @IsOptional()
  @IsEnum(ChatMessageStatus)
  status?: ChatMessageStatus;

  @ApiPropertyOptional({ description: 'Fecha desde (ISO string)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: Date;

  @ApiPropertyOptional({ description: 'Fecha hasta (ISO string)' })
  @IsOptional()
  @IsDateString()
  dateTo?: Date;

  @ApiPropertyOptional({ description: 'Texto a buscar en el contenido' })
  @IsOptional()
  @IsString()
  searchText?: string;

  @ApiPropertyOptional({ description: 'Filtrar mensajes con adjuntos' })
  @IsOptional()
  @IsBoolean()
  hasAttachments?: boolean;

  @ApiPropertyOptional({ description: 'Filtrar mensajes con reacciones' })
  @IsOptional()
  @IsBoolean()
  hasReactions?: boolean;

  @ApiPropertyOptional({
    description: 'Límite de resultados',
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset para paginación' })
  @IsOptional()
  @IsString()
  offset?: string;

  @ApiPropertyOptional({
    enum: ['createdAt', 'updatedAt'],
    description: 'Campo para ordenar',
  })
  @IsOptional()
  @IsEnum(['createdAt', 'updatedAt'])
  sortBy?: 'createdAt' | 'updatedAt';

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    description: 'Orden de clasificación',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

/**
 * DTO para crear configuración de chat
 */
export class CreateChatConfigDto {
  @ApiPropertyOptional({
    description: 'Habilitar chat en la sala',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Permitir subida de archivos',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  allowFileUploads?: boolean;

  @ApiPropertyOptional({ description: 'Permitir enlaces', default: true })
  @IsOptional()
  @IsBoolean()
  allowLinks?: boolean;

  @ApiPropertyOptional({ description: 'Permitir menciones', default: true })
  @IsOptional()
  @IsBoolean()
  allowMentions?: boolean;

  @ApiPropertyOptional({ description: 'Permitir reacciones', default: true })
  @IsOptional()
  @IsBoolean()
  allowReactions?: boolean;

  @ApiPropertyOptional({
    description: 'Longitud máxima de mensaje',
    default: 1000,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5000)
  maxMessageLength?: number;

  @ApiPropertyOptional({
    description: 'Retraso en modo lento (segundos)',
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  slowModeDelay?: number;

  @ApiPropertyOptional({
    description: 'Días de retención de mensajes',
    default: 30,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  retentionDays?: number;

  @ApiPropertyOptional({ description: 'Habilitar moderación', default: true })
  @IsOptional()
  @IsBoolean()
  moderationEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Habilitar filtro de profanidad',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  profanityFilterEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Palabras prohibidas personalizadas',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customBannedWords?: string[];

  @ApiPropertyOptional({
    description: 'Tipos de archivo permitidos',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedFileTypes?: string[];

  @ApiPropertyOptional({
    description: 'Tamaño máximo de archivo en bytes',
    default: 5242880,
  })
  @IsOptional()
  @IsNumber()
  @Min(1024)
  @Max(50 * 1024 * 1024) // 50MB máximo
  maxFileSize?: number;
}

/**
 * DTO para actualizar configuración de chat
 */
export class UpdateChatConfigDto extends CreateChatConfigDto {}

/**
 * DTO para crear hilo de discusión
 */
export class CreateThreadDto {
  @ApiProperty({ description: 'ID del mensaje padre' })
  @IsString()
  parentMessageId: string;

  @ApiPropertyOptional({ description: 'Título del hilo' })
  @IsOptional()
  @IsString()
  title?: string;
}

/**
 * DTO para acción de moderación de chat
 */
export class ChatModerationActionDto {
  @ApiProperty({ description: 'ID del mensaje' })
  @IsString()
  messageId: string;

  @ApiProperty({
    enum: ['delete', 'edit', 'warn', 'timeout'],
    description: 'Tipo de acción',
  })
  @IsEnum(['delete', 'edit', 'warn', 'timeout'])
  action: 'delete' | 'edit' | 'warn' | 'timeout';

  @ApiProperty({ description: 'Razón de la acción' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Nuevo contenido (para edición)' })
  @IsOptional()
  @IsString()
  newContent?: string;

  @ApiPropertyOptional({ description: 'Duración del timeout en minutos' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10080) // 1 semana máximo
  timeoutDuration?: number;
}

/**
 * DTO para actualizar auto-moderación
 */
export class UpdateAutoModerationDto {
  @ApiPropertyOptional({
    description: 'Habilitar auto-moderación',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Configuración de detección de spam' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SpamDetectionConfigDto)
  spamDetection?: SpamDetectionConfigDto;

  @ApiPropertyOptional({ description: 'Configuración de filtro de profanidad' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProfanityFilterConfigDto)
  profanityFilter?: ProfanityFilterConfigDto;

  @ApiPropertyOptional({ description: 'Configuración de filtro de enlaces' })
  @IsOptional()
  @ValidateNested()
  @Type(() => LinkFilterConfigDto)
  linkFilter?: LinkFilterConfigDto;

  @ApiPropertyOptional({ description: 'Configuración de filtro de mayúsculas' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CapsFilterConfigDto)
  capsFilter?: CapsFilterConfigDto;
}

/**
 * DTO para estado de escritura
 */
export class TypingStatusDto {
  @ApiProperty({ description: 'Estado de escritura' })
  @IsBoolean()
  isTyping: boolean;
}
