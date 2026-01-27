/**
 * Entidades para el sistema de moderación y gestión avanzada de miembros
 */

/**
 * Permisos disponibles en una sala
 */
export enum RoomPermission {
  // Permisos básicos
  VIEW_ROOM = 'view_room',
  VOTE = 'vote',
  CHAT = 'chat',
  REACT = 'react',

  // Permisos de contenido
  SUGGEST_CONTENT = 'suggest_content',
  INJECT_CONTENT = 'inject_content',
  REMOVE_CONTENT = 'remove_content',

  // Permisos de gestión
  INVITE_MEMBERS = 'invite_members',
  REMOVE_MEMBERS = 'remove_members',
  MANAGE_ROLES = 'manage_roles',
  MODIFY_SETTINGS = 'modify_settings',

  // Permisos de moderación
  MUTE_MEMBERS = 'mute_members',
  WARN_MEMBERS = 'warn_members',
  BAN_MEMBERS = 'ban_members',
  VIEW_MODERATION_LOG = 'view_moderation_log',

  // Permisos administrativos
  DELETE_ROOM = 'delete_room',
  TRANSFER_OWNERSHIP = 'transfer_ownership',
  MANAGE_TEMPLATES = 'manage_templates',
  MANAGE_THEMES = 'manage_themes',
  MANAGE_SCHEDULES = 'manage_schedules',
  VIEW_ANALYTICS = 'view_analytics',
  EXPORT_DATA = 'export_data',
  MANAGE_INTEGRATIONS = 'manage_integrations',
  VIEW_AUDIT_LOG = 'view_audit_log',
}

/**
 * Roles predefinidos del sistema
 */
export enum SystemRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  MEMBER = 'member',
  GUEST = 'guest',
}

/**
 * Definición de rol personalizado
 */
export interface CustomRole {
  id: string;
  name: string;
  description: string;
  roomId: string;
  permissions: RoomPermission[];
  color: string; // Color hex para UI
  priority: number; // Para jerarquía (mayor número = mayor prioridad)
  isSystemRole: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Asignación de rol a miembro
 */
export interface MemberRoleAssignment {
  userId: string;
  roomId: string;
  roleId: string;
  assignedBy: string;
  assignedAt: Date;
  expiresAt?: Date; // Para roles temporales
}

/**
 * Tipos de acciones de moderación
 */
export enum ModerationActionType {
  WARN = 'warn',
  MUTE = 'mute',
  TEMPORARY_BAN = 'temporary_ban',
  PERMANENT_BAN = 'permanent_ban',
  KICK = 'kick',
  ROLE_CHANGE = 'role_change',
  UNMUTE = 'unmute',
  UNBAN = 'unban',
}

/**
 * Acción de moderación
 */
export interface ModerationAction {
  id: string;
  roomId: string;
  targetUserId: string;
  moderatorId: string;
  actionType: ModerationActionType;
  reason: string;
  duration?: number; // En minutos para acciones temporales
  metadata?: Record<string, any>; // Datos adicionales específicos de la acción
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

/**
 * Estado de moderación de un miembro
 */
export interface MemberModerationStatus {
  userId: string;
  roomId: string;
  isMuted: boolean;
  isBanned: boolean;
  muteExpiresAt?: Date;
  banExpiresAt?: Date;
  warningCount: number;
  lastWarningAt?: Date;
  totalModerationActions: number;
}

/**
 * Configuración de moderación automática
 */
export interface AutoModerationConfig {
  roomId: string;
  enabled: boolean;

  // Configuración de advertencias
  maxWarningsBeforeAction: number;
  warningResetDays: number;

  // Configuración de spam
  spamDetectionEnabled: boolean;
  maxMessagesPerMinute: number;

  // Configuración de contenido
  profanityFilterEnabled: boolean;
  customBannedWords: string[];

  // Acciones automáticas
  autoMuteOnSpam: boolean;
  autoMuteDuration: number; // minutos
  autoBanOnExcessiveWarnings: boolean;
  autoBanDuration: number; // minutos, 0 = permanente

  updatedBy: string;
  updatedAt: Date;
}

/**
 * Jerarquía de roles para verificación de permisos
 */
export interface RoleHierarchy {
  roomId: string;
  hierarchy: {
    roleId: string;
    priority: number;
    canManageRoles: string[]; // IDs de roles que puede gestionar
  }[];
  updatedAt: Date;
}

/**
 * Resultado de verificación de permisos
 */
export interface PermissionCheckResult {
  hasPermission: boolean;
  reason?: string;
  requiredRole?: string;
  currentRoles: string[];
}

/**
 * Filtros para búsqueda de acciones de moderación
 */
export interface ModerationActionFilters {
  roomId?: string;
  targetUserId?: string;
  moderatorId?: string;
  actionType?: ModerationActionType;
  isActive?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Estadísticas de moderación de una sala
 */
export interface RoomModerationStats {
  roomId: string;
  totalActions: number;
  actionsByType: Record<ModerationActionType, number>;
  activeMutes: number;
  activeBans: number;
  totalWarnings: number;
  mostActiveModeratorId?: string;
  averageActionsPerDay: number;
  lastActionAt?: Date;
}

/**
 * Plantilla de rol para creación rápida
 */
export interface RoleTemplate {
  id: string;
  name: string;
  description: string;
  permissions: RoomPermission[];
  color: string;
  priority: number;
  category: RoleTemplateCategory;
  isPublic: boolean;
  usageCount: number;
}

/**
 * Categorías de plantillas de roles
 */
export enum RoleTemplateCategory {
  MODERATION = 'moderation',
  CONTENT_MANAGEMENT = 'content_management',
  COMMUNITY = 'community',
  TECHNICAL = 'technical',
  CUSTOM = 'custom',
}

// Nuevas interfaces para el sistema de permisos avanzado

/**
 * Caché de permisos para optimización de rendimiento
 */
export interface PermissionCache {
  permissions: Map<RoomPermission, PermissionCheckResult>;
  expiresAt: Date;
  lastAccessed: Date;
  hits: number;
  misses: number;
}

/**
 * Conflicto de permisos detectado
 */
export interface PermissionConflict {
  type: 'hierarchy' | 'contradictory' | 'inheritance';
  description: string;
  roles?: string[];
  permissions?: RoomPermission[];
  severity: 'low' | 'medium' | 'high';
  recommendation: string;
}

/**
 * Herencia de permisos desde fuentes externas
 */
export interface PermissionInheritance {
  sourceType: 'group' | 'organization' | 'parent_room';
  sourceId: string;
  inheritedPermissions: RoomPermission[];
  canOverride: boolean;
  priority: number;
}
