import {
  IsString,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  Max,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TemplateCategory,
  TemplateConfiguration,
  AdvancedRoomSettings,
  ConsensusType,
  RoomPrivacy,
} from '../../../domain/entities/room-template.entity';
import type { ContentFilters } from '../../../domain/entities/room.entity';

/**
 * DTO para configuración avanzada de sala
 */
export class AdvancedRoomSettingsDto implements AdvancedRoomSettings {
  @ApiPropertyOptional({
    description: 'Tiempo límite de votación por elemento en segundos',
    minimum: 30,
    maximum: 300,
  })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(300)
  votingTimeout?: number;

  @ApiPropertyOptional({
    description: 'Tiempo límite de sesión en minutos',
    minimum: 15,
    maximum: 480,
  })
  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(480)
  sessionTimeout?: number;

  @ApiProperty({
    description: 'Tipo de consenso requerido',
    enum: ConsensusType,
  })
  @IsEnum(ConsensusType)
  consensusThreshold: ConsensusType;

  @ApiPropertyOptional({
    description:
      'Porcentaje personalizado para consenso (solo si consensusThreshold es CUSTOM)',
    minimum: 50,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(100)
  customThreshold?: number;

  @ApiProperty({
    description: 'Nivel de privacidad de la sala',
    enum: RoomPrivacy,
  })
  @IsEnum(RoomPrivacy)
  privacy: RoomPrivacy;

  @ApiPropertyOptional({
    description: 'Número máximo de miembros',
    minimum: 2,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(50)
  maxMembers?: number;

  @ApiProperty({ description: 'Requiere aprobación para unirse' })
  @IsBoolean()
  requireApproval: boolean;

  @ApiProperty({ description: 'Permite votación de invitados' })
  @IsBoolean()
  allowGuestVoting: boolean;

  @ApiProperty({ description: 'Inyección de contenido habilitada' })
  @IsBoolean()
  contentInjectionEnabled: boolean;

  @ApiPropertyOptional({
    description: 'Frecuencia de inyección (elementos entre inyecciones)',
    minimum: 5,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(50)
  injectionFrequency?: number;

  @ApiProperty({ description: 'Permite sugerencias de miembros' })
  @IsBoolean()
  allowMemberSuggestions: boolean;

  @ApiProperty({ description: 'Progresión automática habilitada' })
  @IsBoolean()
  autoProgressEnabled: boolean;

  @ApiProperty({ description: 'Chat habilitado' })
  @IsBoolean()
  chatEnabled: boolean;

  @ApiProperty({ description: 'Votación anónima' })
  @IsBoolean()
  anonymousVoting: boolean;

  @ApiProperty({ description: 'Mostrar progreso de votación' })
  @IsBoolean()
  showVotingProgress: boolean;

  @ApiProperty({ description: 'Habilitar reacciones' })
  @IsBoolean()
  enableReactions: boolean;

  @ApiProperty({ description: 'Manejo automático de miembros inactivos' })
  @IsBoolean()
  autoInactiveHandling: boolean;

  @ApiProperty({ description: 'Optimización inteligente' })
  @IsBoolean()
  smartOptimization: boolean;

  @ApiProperty({ description: 'Matching predictivo' })
  @IsBoolean()
  predictiveMatching: boolean;
}

/**
 * DTO para configuración de plantilla
 */
export class TemplateConfigurationDto implements TemplateConfiguration {
  @ApiProperty({ description: 'Filtros de contenido' })
  @ValidateNested()
  @Type(() => Object)
  filters: ContentFilters;

  @ApiProperty({ description: 'Configuración avanzada de sala' })
  @ValidateNested()
  @Type(() => AdvancedRoomSettingsDto)
  settings: AdvancedRoomSettingsDto;

  @ApiPropertyOptional({ description: 'Tema de la sala (opcional)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  theme?: any; // Se definirá cuando implementemos RoomTheme
}

/**
 * DTO para crear una nueva plantilla de sala
 */
export class CreateTemplateDto {
  @ApiProperty({
    description: 'Nombre de la plantilla',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @Length(3, 50)
  name: string;

  @ApiProperty({
    description: 'Descripción de la plantilla',
    minLength: 10,
    maxLength: 500,
  })
  @IsString()
  @Length(10, 500)
  description: string;

  @ApiProperty({ description: 'Si la plantilla es pública', default: false })
  @IsBoolean()
  isPublic: boolean;

  @ApiProperty({
    description: 'Categoría de la plantilla',
    enum: TemplateCategory,
  })
  @IsEnum(TemplateCategory)
  category: TemplateCategory;

  @ApiProperty({ description: 'Configuración completa de la plantilla' })
  @ValidateNested()
  @Type(() => TemplateConfigurationDto)
  configuration: TemplateConfigurationDto;

  @ApiPropertyOptional({
    description: 'Etiquetas para la plantilla',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(2, 20, { each: true })
  tags?: string[];
}

/**
 * DTO para actualizar una plantilla existente
 */
export class UpdateTemplateDto {
  @ApiPropertyOptional({
    description: 'Nombre de la plantilla',
    minLength: 3,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @Length(3, 50)
  name?: string;

  @ApiPropertyOptional({
    description: 'Descripción de la plantilla',
    minLength: 10,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @Length(10, 500)
  description?: string;

  @ApiPropertyOptional({ description: 'Si la plantilla es pública' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({
    description: 'Categoría de la plantilla',
    enum: TemplateCategory,
  })
  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @ApiPropertyOptional({
    description: 'Configuración completa de la plantilla',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateConfigurationDto)
  configuration?: TemplateConfigurationDto;

  @ApiPropertyOptional({
    description: 'Etiquetas para la plantilla',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(2, 20, { each: true })
  tags?: string[];
}

/**
 * DTO para filtros de búsqueda de plantillas
 */
export class TemplateFiltersDto {
  @ApiPropertyOptional({
    description: 'Categoría de plantilla',
    enum: TemplateCategory,
  })
  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @ApiPropertyOptional({ description: 'Etiquetas a buscar', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Rating mínimo', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ description: 'Solo plantillas públicas' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'ID del creador' })
  @IsOptional()
  @IsString()
  creatorId?: string;

  @ApiPropertyOptional({
    description: 'Ordenar por',
    enum: ['createdAt', 'updatedAt', 'usageCount', 'rating', 'name'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Orden de clasificación',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsString()
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

  @ApiPropertyOptional({ description: 'Offset para paginación', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number;
}

/**
 * DTO para calificar una plantilla
 */
export class RateTemplateDto {
  @ApiProperty({ description: 'Calificación de 1 a 5', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({
    description: 'Comentario opcional sobre la plantilla',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  comment?: string;
}

/**
 * DTO para crear sala desde plantilla con overrides
 */
export class CreateRoomFromTemplateDto {
  @ApiPropertyOptional({
    description: 'Nombre personalizado para la sala',
    minLength: 3,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @Length(3, 50)
  roomName?: string;

  @ApiPropertyOptional({
    description: 'Configuración personalizada que sobrescribe la plantilla',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateConfigurationDto)
  configurationOverrides?: Partial<TemplateConfigurationDto>;

  @ApiPropertyOptional({
    description: 'Si se debe iniciar la sala inmediatamente',
  })
  @IsOptional()
  @IsBoolean()
  startImmediately?: boolean;
}
