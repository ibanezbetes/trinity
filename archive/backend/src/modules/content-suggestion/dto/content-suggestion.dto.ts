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
  ContentSuggestionType,
  ContentSuggestionStatus,
} from '../../../domain/entities/content-suggestion.entity';

/**
 * DTO para crear sugerencia de contenido
 */
export class CreateSuggestionDto {
  @ApiProperty({ description: 'Título del contenido' })
  @IsString()
  title: string;

  @ApiProperty({
    enum: ContentSuggestionType,
    description: 'Tipo de contenido',
  })
  @IsEnum(ContentSuggestionType)
  type: ContentSuggestionType;

  @ApiPropertyOptional({ description: 'Descripción del contenido' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'ID de TMDB' })
  @IsOptional()
  @IsString()
  tmdbId?: string;

  @ApiPropertyOptional({ description: 'ID de IMDB' })
  @IsOptional()
  @IsString()
  imdbId?: string;

  @ApiPropertyOptional({ description: 'Año de lanzamiento' })
  @IsOptional()
  @IsNumber()
  @Min(1900)
  @Max(2030)
  year?: number;

  @ApiPropertyOptional({ description: 'Géneros', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genre?: string[];

  @ApiPropertyOptional({ description: 'Calificación (1-10)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  rating?: number;

  @ApiPropertyOptional({ description: 'Duración en minutos' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ description: 'URL del póster' })
  @IsOptional()
  @IsString()
  posterUrl?: string;

  @ApiPropertyOptional({ description: 'URL del tráiler' })
  @IsOptional()
  @IsString()
  trailerUrl?: string;

  @ApiPropertyOptional({ description: 'Razón de la sugerencia' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Etiquetas', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Prioridad (1-5)',
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  priority?: number;

  @ApiPropertyOptional({ description: 'Metadatos adicionales' })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO para actualizar sugerencia de contenido
 */
export class UpdateSuggestionDto {
  @ApiPropertyOptional({ description: 'Título del contenido' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Descripción del contenido' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Razón de la sugerencia' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Etiquetas', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Prioridad (1-5)',
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  priority?: number;

  @ApiPropertyOptional({ description: 'Metadatos adicionales' })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO para votar en sugerencia
 */
export class VoteSuggestionDto {
  @ApiProperty({ enum: ['up', 'down'], description: 'Tipo de voto' })
  @IsEnum(['up', 'down'])
  vote: 'up' | 'down';

  @ApiPropertyOptional({ description: 'Razón del voto' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * DTO para comentar en sugerencia
 */
export class CommentSuggestionDto {
  @ApiProperty({ description: 'Contenido del comentario' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Avatar del usuario' })
  @IsOptional()
  @IsString()
  userAvatar?: string;

  @ApiPropertyOptional({ description: 'ID del comentario al que responde' })
  @IsOptional()
  @IsString()
  replyToId?: string;
}

/**
 * DTO para revisar sugerencia
 */
export class ReviewSuggestionDto {
  @ApiProperty({
    enum: [ContentSuggestionStatus.APPROVED, ContentSuggestionStatus.REJECTED],
    description: 'Estado de revisión',
  })
  @IsEnum([ContentSuggestionStatus.APPROVED, ContentSuggestionStatus.REJECTED])
  status: ContentSuggestionStatus.APPROVED | ContentSuggestionStatus.REJECTED;

  @ApiPropertyOptional({ description: 'Notas de revisión' })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO para filtros de búsqueda de sugerencias
 */
export class SuggestionFiltersDto {
  @ApiPropertyOptional({ description: 'ID del usuario que sugirió' })
  @IsOptional()
  @IsString()
  suggestedBy?: string;

  @ApiPropertyOptional({
    enum: ContentSuggestionType,
    description: 'Tipo de contenido',
  })
  @IsOptional()
  @IsEnum(ContentSuggestionType)
  type?: ContentSuggestionType;

  @ApiPropertyOptional({
    enum: ContentSuggestionStatus,
    description: 'Estado de la sugerencia',
  })
  @IsOptional()
  @IsEnum(ContentSuggestionStatus)
  status?: ContentSuggestionStatus;

  @ApiPropertyOptional({ description: 'Género' })
  @IsOptional()
  @IsString()
  genre?: string;

  @ApiPropertyOptional({ description: 'Puntuación mínima' })
  @IsOptional()
  @IsNumber()
  minScore?: number;

  @ApiPropertyOptional({ description: 'Puntuación máxima' })
  @IsOptional()
  @IsNumber()
  maxScore?: number;

  @ApiPropertyOptional({ description: 'Fecha desde (ISO string)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: Date;

  @ApiPropertyOptional({ description: 'Fecha hasta (ISO string)' })
  @IsOptional()
  @IsDateString()
  dateTo?: Date;

  @ApiPropertyOptional({ description: 'Texto a buscar' })
  @IsOptional()
  @IsString()
  searchText?: string;

  @ApiPropertyOptional({ description: 'Filtrar sugerencias con comentarios' })
  @IsOptional()
  @IsBoolean()
  hasComments?: boolean;

  @ApiPropertyOptional({ description: 'Número mínimo de votos' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minVotes?: number;

  @ApiPropertyOptional({
    enum: ['createdAt', 'voteScore', 'totalVotes', 'priority'],
    description: 'Campo para ordenar',
  })
  @IsOptional()
  @IsEnum(['createdAt', 'voteScore', 'totalVotes', 'priority'])
  sortBy?: 'createdAt' | 'voteScore' | 'totalVotes' | 'priority';

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    description: 'Orden de clasificación',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

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
}

/**
 * DTO para crear configuración de sugerencias
 */
export class CreateSuggestionConfigDto {
  @ApiPropertyOptional({
    description: 'Habilitar sugerencias en la sala',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Requerir aprobación para sugerencias',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;

  @ApiPropertyOptional({
    description: 'Permitir votación en sugerencias',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  allowVoting?: boolean;

  @ApiPropertyOptional({
    description: 'Permitir comentarios en sugerencias',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  allowComments?: boolean;

  @ApiPropertyOptional({
    description: 'Votos mínimos para aprobación',
    default: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  minVotesToApprove?: number;

  @ApiPropertyOptional({
    description: 'Puntuación mínima para aprobación',
    default: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  minScoreToApprove?: number;

  @ApiPropertyOptional({
    description: 'Máximo sugerencias por usuario por día',
    default: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxSuggestionsPerUser?: number;

  @ApiPropertyOptional({
    description: 'Máximo sugerencias pendientes en sala',
    default: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(100)
  maxPendingSuggestions?: number;

  @ApiPropertyOptional({
    description: 'Auto-implementar sugerencias con alta puntuación',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  autoImplementHighScored?: boolean;

  @ApiPropertyOptional({
    description: 'Umbral para auto-implementación',
    default: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  autoImplementThreshold?: number;

  @ApiPropertyOptional({
    enum: ContentSuggestionType,
    isArray: true,
    description: 'Tipos de contenido permitidos',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ContentSuggestionType, { each: true })
  allowedTypes?: ContentSuggestionType[];

  @ApiPropertyOptional({
    description: 'Requerir razón para sugerencias',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  requireReason?: boolean;

  @ApiPropertyOptional({ description: 'Habilitar moderación', default: true })
  @IsOptional()
  @IsBoolean()
  moderationEnabled?: boolean;
}

/**
 * DTO para actualizar configuración de sugerencias
 */
export class UpdateSuggestionConfigDto extends CreateSuggestionConfigDto {}

/**
 * DTO para crear plantilla de sugerencia
 */
export class CreateSuggestionTemplateDto {
  @ApiProperty({ description: 'Nombre de la plantilla' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Descripción de la plantilla' })
  @IsString()
  description: string;

  @ApiProperty({
    enum: ContentSuggestionType,
    description: 'Tipo de contenido',
  })
  @IsEnum(ContentSuggestionType)
  type: ContentSuggestionType;

  @ApiProperty({ description: 'Campos de la plantilla', type: [Object] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  fields: TemplateFieldDto[];

  @ApiPropertyOptional({ description: 'Plantilla pública', default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

/**
 * DTO para campo de plantilla
 */
export class TemplateFieldDto {
  @ApiProperty({ description: 'Nombre del campo' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Etiqueta del campo' })
  @IsString()
  label: string;

  @ApiProperty({
    enum: ['text', 'number', 'select', 'multiselect', 'textarea'],
    description: 'Tipo de campo',
  })
  @IsEnum(['text', 'number', 'select', 'multiselect', 'textarea'])
  type: 'text' | 'number' | 'select' | 'multiselect' | 'textarea';

  @ApiProperty({ description: 'Campo requerido' })
  @IsBoolean()
  required: boolean;

  @ApiPropertyOptional({
    description: 'Opciones para select/multiselect',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ description: 'Placeholder del campo' })
  @IsOptional()
  @IsString()
  placeholder?: string;
}

/**
 * DTO para actualizar configuración de notificaciones
 */
export class UpdateNotificationConfigDto {
  @ApiPropertyOptional({
    description: 'Notificar nuevas sugerencias',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  notifyOnNewSuggestion?: boolean;

  @ApiPropertyOptional({ description: 'Notificar votos', default: true })
  @IsOptional()
  @IsBoolean()
  notifyOnVote?: boolean;

  @ApiPropertyOptional({ description: 'Notificar comentarios', default: true })
  @IsOptional()
  @IsBoolean()
  notifyOnComment?: boolean;

  @ApiPropertyOptional({ description: 'Notificar aprobaciones', default: true })
  @IsOptional()
  @IsBoolean()
  notifyOnApproval?: boolean;

  @ApiPropertyOptional({
    description: 'Notificar implementaciones',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  notifyOnImplementation?: boolean;

  @ApiPropertyOptional({
    description: 'Notificar solo mis sugerencias',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  notifyOnMySuggestions?: boolean;

  @ApiPropertyOptional({
    description: 'Notificaciones por email',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional({ description: 'Notificaciones push', default: true })
  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;
}

/**
 * DTO para crear workflow de aprobación
 */
export class CreateApprovalWorkflowDto {
  @ApiProperty({ description: 'Nombre del workflow' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Pasos del workflow', type: [Object] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps: WorkflowStepDto[];

  @ApiPropertyOptional({ description: 'Workflow activo', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO para paso de workflow
 */
export class WorkflowStepDto {
  @ApiProperty({ description: 'Orden del paso' })
  @IsNumber()
  @Min(1)
  order: number;

  @ApiProperty({
    enum: ['vote', 'review', 'automatic'],
    description: 'Tipo de paso',
  })
  @IsEnum(['vote', 'review', 'automatic'])
  type: 'vote' | 'review' | 'automatic';

  @ApiPropertyOptional({ description: 'Rol requerido' })
  @IsOptional()
  @IsString()
  requiredRole?: string;

  @ApiPropertyOptional({ description: 'Votos requeridos' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  requiredVotes?: number;

  @ApiPropertyOptional({ description: 'Puntuación requerida' })
  @IsOptional()
  @IsNumber()
  requiredScore?: number;

  @ApiPropertyOptional({ description: 'Timeout en horas' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(168) // 1 semana máximo
  timeoutHours?: number;
}

/**
 * DTO para estadísticas de sugerencias
 */
export class SuggestionStatsQueryDto {
  @ApiPropertyOptional({ description: 'Fecha desde (ISO string)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: Date;

  @ApiPropertyOptional({ description: 'Fecha hasta (ISO string)' })
  @IsOptional()
  @IsDateString()
  dateTo?: Date;

  @ApiPropertyOptional({
    description: 'Incluir detalles por usuario',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includeUserDetails?: boolean;

  @ApiPropertyOptional({
    description: 'Incluir tendencias por género',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includeGenreTrends?: boolean;
}
