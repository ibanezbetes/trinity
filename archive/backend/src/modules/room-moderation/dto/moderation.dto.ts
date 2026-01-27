import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsDateString,
  Min,
  Max,
  ArrayNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RoomPermission,
  ModerationActionType,
  SystemRole,
  RoleTemplateCategory,
} from '../../../domain/entities/room-moderation.entity';

/**
 * DTO para crear un rol personalizado
 */
export class CreateCustomRoleDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(RoomPermission, { each: true })
  permissions: RoomPermission[];

  @IsString()
  @IsOptional()
  color?: string = '#6B7280';

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  priority?: number = 10;
}

/**
 * DTO para actualizar un rol personalizado
 */
export class UpdateCustomRoleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsEnum(RoomPermission, { each: true })
  @IsOptional()
  permissions?: RoomPermission[];

  @IsString()
  @IsOptional()
  color?: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  priority?: number;
}

/**
 * DTO para asignar rol a miembro
 */
export class AssignRoleDto {
  @IsString()
  roleId: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string; // ISO string para roles temporales
}

/**
 * DTO para acción de moderación
 */
export class ModerationActionDto {
  @IsString()
  targetUserId: string;

  @IsEnum(ModerationActionType)
  actionType: ModerationActionType;

  @IsString()
  reason: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  duration?: number; // En minutos para acciones temporales

  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO para advertir a un miembro
 */
export class WarnMemberDto {
  @IsString()
  targetUserId: string;

  @IsString()
  reason: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO para silenciar a un miembro
 */
export class MuteMemberDto {
  @IsString()
  targetUserId: string;

  @IsString()
  reason: string;

  @IsNumber()
  @Min(1)
  @Max(10080) // Máximo 7 días
  @IsOptional()
  duration?: number = 60; // Por defecto 1 hora

  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO para banear a un miembro
 */
export class BanMemberDto {
  @IsString()
  targetUserId: string;

  @IsString()
  reason: string;

  @IsNumber()
  @Min(0) // 0 = permanente
  @Max(43200) // Máximo 30 días
  @IsOptional()
  duration?: number = 0; // Por defecto permanente

  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO para configuración de moderación automática
 */
export class AutoModerationConfigDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  maxWarningsBeforeAction?: number;

  @IsNumber()
  @Min(1)
  @Max(30)
  @IsOptional()
  warningResetDays?: number;

  @IsBoolean()
  @IsOptional()
  spamDetectionEnabled?: boolean;

  @IsNumber()
  @Min(1)
  @Max(60)
  @IsOptional()
  maxMessagesPerMinute?: number;

  @IsBoolean()
  @IsOptional()
  profanityFilterEnabled?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  customBannedWords?: string[];

  @IsBoolean()
  @IsOptional()
  autoMuteOnSpam?: boolean;

  @IsNumber()
  @Min(1)
  @Max(1440)
  @IsOptional()
  autoMuteDuration?: number;

  @IsBoolean()
  @IsOptional()
  autoBanOnExcessiveWarnings?: boolean;

  @IsNumber()
  @Min(0)
  @Max(43200)
  @IsOptional()
  autoBanDuration?: number;
}

/**
 * DTO para filtros de búsqueda de acciones de moderación
 */
export class ModerationActionFiltersDto {
  @IsString()
  @IsOptional()
  targetUserId?: string;

  @IsString()
  @IsOptional()
  moderatorId?: string;

  @IsEnum(ModerationActionType)
  @IsOptional()
  actionType?: ModerationActionType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @IsNumber()
  @Min(0)
  @IsOptional()
  offset?: number = 0;
}

/**
 * DTO de respuesta para rol personalizado
 */
export class CustomRoleResponseDto {
  id: string;
  name: string;
  description: string;
  roomId: string;
  permissions: RoomPermission[];
  color: string;
  priority: number;
  isSystemRole: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  memberCount?: number; // Número de miembros con este rol
}

/**
 * DTO de respuesta para acción de moderación
 */
export class ModerationActionResponseDto {
  id: string;
  roomId: string;
  targetUserId: string;
  targetUserName?: string;
  moderatorId: string;
  moderatorName?: string;
  actionType: ModerationActionType;
  reason: string;
  duration?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

/**
 * DTO de respuesta para estado de moderación de miembro
 */
export class MemberModerationStatusResponseDto {
  userId: string;
  userName?: string;
  roomId: string;
  isMuted: boolean;
  isBanned: boolean;
  muteExpiresAt?: Date;
  banExpiresAt?: Date;
  warningCount: number;
  lastWarningAt?: Date;
  totalModerationActions: number;
  roles: CustomRoleResponseDto[];
}

/**
 * DTO de respuesta para estadísticas de moderación
 */
export class RoomModerationStatsResponseDto {
  roomId: string;
  totalActions: number;
  actionsByType: Record<ModerationActionType, number>;
  activeMutes: number;
  activeBans: number;
  totalWarnings: number;
  mostActiveModeratorId?: string;
  mostActiveModeratorName?: string;
  averageActionsPerDay: number;
  lastActionAt?: Date;
}

/**
 * DTO de respuesta para verificación de permisos
 */
export class PermissionCheckResponseDto {
  hasPermission: boolean;
  reason?: string;
  requiredRole?: string;
  currentRoles: string[];
  permissions: RoomPermission[];
}

/**
 * DTO para crear plantilla de rol
 */
export class CreateRoleTemplateDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(RoomPermission, { each: true })
  permissions: RoomPermission[];

  @IsString()
  @IsOptional()
  color?: string = '#6B7280';

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  priority?: number = 10;

  @IsEnum(RoleTemplateCategory)
  @IsOptional()
  category?: RoleTemplateCategory = RoleTemplateCategory.CUSTOM;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean = false;
}

/**
 * DTO de respuesta para plantilla de rol
 */
export class RoleTemplateResponseDto {
  id: string;
  name: string;
  description: string;
  permissions: RoomPermission[];
  color: string;
  priority: number;
  category: RoleTemplateCategory;
  isPublic: boolean;
  usageCount: number;
  createdBy?: string;
  createdAt: Date;
}
