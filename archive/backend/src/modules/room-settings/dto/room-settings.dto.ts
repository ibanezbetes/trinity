import {
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ConsensusType,
  RoomPrivacy,
} from '../../../domain/entities/room-template.entity';

/**
 * DTO para actualizar configuraciones avanzadas de sala
 */
export class UpdateRoomSettingsDto {
  @ApiPropertyOptional({
    description: 'Tiempo límite de votación por elemento en segundos',
    minimum: 30,
    maximum: 300,
    example: 60,
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
    example: 120,
  })
  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(480)
  sessionTimeout?: number;

  @ApiPropertyOptional({
    description: 'Tipo de consenso requerido',
    enum: ConsensusType,
    example: ConsensusType.MAJORITY,
  })
  @IsOptional()
  @IsEnum(ConsensusType)
  consensusThreshold?: ConsensusType;

  @ApiPropertyOptional({
    description:
      'Porcentaje personalizado para consenso (requerido si consensusThreshold es CUSTOM)',
    minimum: 50,
    maximum: 100,
    example: 75,
  })
  @IsOptional()
  @ValidateIf((o) => o.consensusThreshold === ConsensusType.CUSTOM)
  @IsNumber()
  @Min(50)
  @Max(100)
  customThreshold?: number;

  @ApiPropertyOptional({
    description: 'Nivel de privacidad de la sala',
    enum: RoomPrivacy,
    example: RoomPrivacy.PUBLIC,
  })
  @IsOptional()
  @IsEnum(RoomPrivacy)
  privacy?: RoomPrivacy;

  @ApiPropertyOptional({
    description: 'Número máximo de miembros',
    minimum: 2,
    maximum: 50,
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(50)
  maxMembers?: number;

  @ApiPropertyOptional({
    description: 'Requiere aprobación para unirse',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;

  @ApiPropertyOptional({
    description: 'Permite votación de invitados',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  allowGuestVoting?: boolean;

  @ApiPropertyOptional({
    description: 'Habilita inyección de contenido',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  contentInjectionEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Frecuencia de inyección (elementos entre inyecciones)',
    minimum: 5,
    maximum: 50,
    example: 10,
  })
  @IsOptional()
  @ValidateIf((o) => o.contentInjectionEnabled === true)
  @IsNumber()
  @Min(5)
  @Max(50)
  injectionFrequency?: number;

  @ApiPropertyOptional({
    description: 'Permite sugerencias de miembros',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  allowMemberSuggestions?: boolean;

  @ApiPropertyOptional({
    description: 'Progreso automático habilitado',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  autoProgressEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Chat habilitado',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Votación anónima',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  anonymousVoting?: boolean;

  @ApiPropertyOptional({
    description: 'Mostrar progreso de votación',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  showVotingProgress?: boolean;

  @ApiPropertyOptional({
    description: 'Habilitar reacciones',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enableReactions?: boolean;

  @ApiPropertyOptional({
    description: 'Manejo automático de miembros inactivos',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  autoInactiveHandling?: boolean;

  @ApiPropertyOptional({
    description: 'Optimización inteligente',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  smartOptimization?: boolean;

  @ApiPropertyOptional({
    description: 'Coincidencia predictiva',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  predictiveMatching?: boolean;
}

/**
 * DTO para respuesta de configuraciones de sala
 */
export class RoomSettingsResponseDto {
  @ApiProperty({ description: 'ID de la sala' })
  roomId: string;

  @ApiProperty({ description: 'Configuraciones avanzadas de la sala' })
  settings: UpdateRoomSettingsDto;

  @ApiProperty({ description: 'Fecha de última actualización' })
  updatedAt: Date;

  @ApiProperty({
    description: 'ID del usuario que actualizó las configuraciones',
  })
  updatedBy: string;
}

/**
 * DTO para recomendaciones de configuración
 */
export class SettingsRecommendationDto {
  @ApiProperty({ description: 'Configuración recomendada' })
  setting: string;

  @ApiProperty({ description: 'Valor recomendado' })
  recommendedValue: any;

  @ApiProperty({ description: 'Razón de la recomendación' })
  reason: string;

  @ApiProperty({ description: 'Prioridad de la recomendación (1-5)' })
  priority: number;

  @ApiProperty({ description: 'Impacto esperado' })
  expectedImpact: string;
}

/**
 * DTO para respuesta de recomendaciones
 */
export class SettingsRecommendationsResponseDto {
  @ApiProperty({ description: 'ID de la sala' })
  roomId: string;

  @ApiProperty({
    description: 'Lista de recomendaciones',
    type: [SettingsRecommendationDto],
  })
  recommendations: SettingsRecommendationDto[];

  @ApiProperty({ description: 'Puntuación de optimización actual (0-100)' })
  currentOptimizationScore: number;

  @ApiProperty({ description: 'Puntuación potencial con recomendaciones' })
  potentialScore: number;
}
