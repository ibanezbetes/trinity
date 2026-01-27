import { RoomTheme, ThemeCategory } from './room-template.entity';

/**
 * Estadísticas de uso de tema
 */
export interface ThemeUsageStats {
  themeId: string;
  totalUsage: number;
  recentUsage: number; // últimos 30 días
  averageRating: number;
  ratingCount: number;
  activeRooms: number; // salas que actualmente usan el tema
  popularityScore: number; // calculado basado en uso y rating
}

/**
 * Tema popular con estadísticas
 */
export interface PopularTheme extends RoomTheme {
  stats: ThemeUsageStats;
  isRecommended: boolean;
  popularityScore: number;
}

/**
 * Aplicación de tema a sala
 */
export interface RoomThemeApplication {
  roomId: string;
  themeId: string;
  appliedBy: string;
  appliedAt: Date;
  customizations?: ThemeCustomizations;
  isActive: boolean;
}

/**
 * Personalizaciones específicas de tema por sala
 */
export interface ThemeCustomizations {
  // Sobrescribir colores específicos
  colorOverrides?: Partial<{
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  }>;

  // Assets personalizados
  customBackgroundImage?: string;
  customIcon?: string;
  customBanner?: string;

  // Configuraciones adicionales
  opacity?: number; // 0-100
  borderRadius?: number; // 0-20
  fontSize?: 'small' | 'medium' | 'large';
  animation?: boolean;
}

/**
 * Rating de tema por usuario
 */
export interface ThemeRating {
  themeId: string;
  userId: string;
  roomId?: string; // opcional, para ratings específicos por sala
  rating: number; // 1-5
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Filtros para búsqueda de temas
 */
export interface ThemeFilters {
  category?: ThemeCategory;
  isPublic?: boolean;
  creatorId?: string;
  minRating?: number;
  tags?: string[];
  sortBy?: ThemeSortBy;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Opciones de ordenamiento para temas
 */
export enum ThemeSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  USAGE_COUNT = 'usageCount',
  RATING = 'rating',
  POPULARITY = 'popularity',
  NAME = 'name',
}

/**
 * Resultado de validación de tema
 */
export interface ThemeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Plantilla de tema predefinida
 */
export interface ThemeTemplate {
  id: string;
  name: string;
  description: string;
  category: ThemeCategory;
  colors: RoomTheme['colors'];
  backgroundImage?: string;
  icon?: string;
  tags: string[];
  isSystemTemplate: boolean;
}

/**
 * Configuración de tema de sala activa
 */
export interface ActiveRoomTheme {
  roomId: string;
  theme: RoomTheme;
  customizations?: ThemeCustomizations;
  appliedAt: Date;
  appliedBy: string;
}

/**
 * Historial de cambios de tema
 */
export interface ThemeChangeHistory {
  id: string;
  roomId: string;
  previousThemeId?: string;
  newThemeId: string;
  changedBy: string;
  changedAt: Date;
  reason?: string;
  customizations?: ThemeCustomizations;
}

/**
 * Métricas de rendimiento de tema
 */
export interface ThemePerformanceMetrics {
  themeId: string;
  averageLoadTime: number; // en ms
  errorRate: number; // porcentaje
  userSatisfaction: number; // 1-5
  retentionRate: number; // porcentaje de salas que mantienen el tema
  conversionRate: number; // porcentaje de vistas que resultan en aplicación
}

/**
 * Colección de temas curada
 */
export interface ThemeCollection {
  id: string;
  name: string;
  description: string;
  curatorId: string;
  themeIds: string[];
  isPublic: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Recomendación de tema personalizada
 */
export interface ThemeRecommendation {
  themeId: string;
  score: number; // 0-100
  reason: string;
  basedOn:
    | 'usage_history'
    | 'room_content'
    | 'user_preferences'
    | 'similar_users';
  metadata?: Record<string, any>;
}

/**
 * Configuración de tema automático
 */
export interface AutoThemeConfig {
  roomId: string;
  enabled: boolean;

  // Reglas de aplicación automática
  rules: {
    // Cambiar tema basado en contenido
    contentBasedThemes?: {
      genreThemeMapping: Record<string, string>; // género -> themeId
      moodThemeMapping: Record<string, string>; // mood -> themeId
    };

    // Cambiar tema basado en tiempo
    timeBasedThemes?: {
      seasonalThemes: boolean;
      holidayThemes: boolean;
      timeOfDayThemes: boolean;
    };

    // Cambiar tema basado en eventos
    eventBasedThemes?: {
      memberMilestones: boolean; // cumpleaños, aniversarios
      roomMilestones: boolean; // número de matches, etc.
    };
  };

  // Configuración de cambios
  changeFrequency: 'never' | 'daily' | 'weekly' | 'monthly' | 'event_based';
  requireApproval: boolean;
  notifyMembers: boolean;

  updatedBy: string;
  updatedAt: Date;
}
