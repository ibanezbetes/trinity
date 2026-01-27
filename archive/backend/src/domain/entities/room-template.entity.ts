import { ContentFilters } from './room.entity';

/**
 * Categorías de plantillas de sala
 */
export enum TemplateCategory {
  MOVIE_NIGHT = 'movie_night',
  SERIES_MARATHON = 'series_marathon',
  FAMILY_FRIENDLY = 'family_friendly',
  HORROR_NIGHT = 'horror_night',
  COMEDY_SPECIAL = 'comedy_special',
  DOCUMENTARY = 'documentary',
  CUSTOM = 'custom',
}

/**
 * Configuración avanzada de sala para plantillas
 */
export interface AdvancedRoomSettings {
  // Configuración de votación
  votingTimeout?: number; // segundos por elemento
  sessionTimeout?: number; // minutos por sesión
  consensusThreshold: ConsensusType;
  customThreshold?: number; // porcentaje para consenso personalizado

  // Privacidad y acceso
  privacy: RoomPrivacy;
  maxMembers?: number;
  requireApproval: boolean;
  allowGuestVoting: boolean;

  // Gestión de contenido
  contentInjectionEnabled: boolean;
  injectionFrequency?: number; // elementos entre inyecciones
  allowMemberSuggestions: boolean;
  autoProgressEnabled: boolean;

  // Características
  chatEnabled: boolean;
  anonymousVoting: boolean;
  showVotingProgress: boolean;
  enableReactions: boolean;

  // Automatización
  autoInactiveHandling: boolean;
  smartOptimization: boolean;
  predictiveMatching: boolean;
}

/**
 * Tipos de consenso disponibles
 */
export enum ConsensusType {
  UNANIMOUS = 'unanimous',
  MAJORITY = 'majority',
  SUPER_MAJORITY = 'super_majority', // 75%
  CUSTOM = 'custom',
}

/**
 * Niveles de privacidad de sala
 */
export enum RoomPrivacy {
  PUBLIC = 'public',
  PRIVATE = 'private',
  INVITE_ONLY = 'invite_only',
}

/**
 * Tema de sala para plantillas
 */
export interface RoomTheme {
  id: string;
  name: string;
  description: string;
  category: ThemeCategory;

  // Elementos visuales
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };

  // Assets
  backgroundImage?: string;
  icon?: string;
  banner?: string;

  // Personalización
  isCustom: boolean;
  creatorId?: string;
  isPublic: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Categorías de temas
 */
export enum ThemeCategory {
  MOVIE_GENRES = 'movie_genres',
  SEASONAL = 'seasonal',
  EVENTS = 'events',
  MINIMAL = 'minimal',
  COLORFUL = 'colorful',
  CUSTOM = 'custom',
}

/**
 * Configuración completa de plantilla
 */
export interface TemplateConfiguration {
  filters: ContentFilters;
  settings: AdvancedRoomSettings;
  theme?: RoomTheme;
}

/**
 * Entidad principal de plantilla de sala
 */
export interface RoomTemplate {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  isPublic: boolean;
  category: TemplateCategory;
  configuration: TemplateConfiguration;
  usageCount: number;
  rating: number;
  ratingCount: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Filtros para búsqueda de plantillas
 */
export interface TemplateFilters {
  category?: TemplateCategory;
  tags?: string[];
  minRating?: number;
  isPublic?: boolean;
  creatorId?: string;
  sortBy?: TemplateSortBy;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Opciones de ordenamiento para plantillas
 */
export enum TemplateSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  USAGE_COUNT = 'usageCount',
  RATING = 'rating',
  NAME = 'name',
}

/**
 * Resultado de validación de plantilla
 */
export interface TemplateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Estadísticas de uso de plantilla
 */
export interface TemplateUsageStats {
  templateId: string;
  totalUsage: number;
  recentUsage: number; // últimos 30 días
  averageRating: number;
  successfulRooms: number; // salas que encontraron matches
  averageRoomDuration: number; // en minutos
}

/**
 * Plantilla popular con estadísticas
 */
export interface PopularTemplate extends RoomTemplate {
  stats: TemplateUsageStats;
  isRecommended: boolean;
  popularityScore: number;
}
