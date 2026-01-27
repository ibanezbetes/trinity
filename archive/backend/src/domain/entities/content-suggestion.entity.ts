/**
 * Entidades para el sistema de sugerencias de contenido colaborativo
 */

/**
 * Estados de sugerencia de contenido
 */
export enum ContentSuggestionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  UNDER_REVIEW = 'under_review',
  IMPLEMENTED = 'implemented',
}

/**
 * Tipos de sugerencia de contenido
 */
export enum ContentSuggestionType {
  MOVIE = 'movie',
  TV_SHOW = 'tv_show',
  DOCUMENTARY = 'documentary',
  ANIME = 'anime',
  CUSTOM = 'custom',
}

/**
 * Sugerencia de contenido
 */
export interface ContentSuggestion {
  id: string;
  roomId: string;
  suggestedBy: string;
  suggestedByUsername: string;
  type: ContentSuggestionType;
  status: ContentSuggestionStatus;

  // Información del contenido
  title: string;
  description?: string;
  tmdbId?: string; // ID de TMDB si aplica
  imdbId?: string; // ID de IMDB si aplica
  year?: number;
  genre?: string[];
  rating?: number;
  duration?: number; // En minutos
  posterUrl?: string;
  trailerUrl?: string;

  // Información de la sugerencia
  reason?: string; // Por qué sugiere este contenido
  tags?: string[];
  priority: number; // 1-5, donde 5 es alta prioridad

  // Votación y aprobación
  votes: ContentSuggestionVote[];
  totalVotes: number;
  positiveVotes: number;
  negativeVotes: number;
  voteScore: number; // Puntuación calculada

  // Comentarios y discusión
  comments: ContentSuggestionComment[];
  commentCount: number;

  // Moderación
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  moderationFlags?: string[];

  // Implementación
  implementedAt?: Date;
  implementedBy?: string;
  addedToQueueAt?: Date;

  // Metadatos
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Voto en sugerencia de contenido
 */
export interface ContentSuggestionVote {
  userId: string;
  username: string;
  vote: 'up' | 'down';
  reason?: string;
  createdAt: Date;
}

/**
 * Comentario en sugerencia de contenido
 */
export interface ContentSuggestionComment {
  id: string;
  userId: string;
  username: string;
  userAvatar?: string;
  content: string;
  replyToId?: string; // Para respuestas a otros comentarios
  reactions?: Array<{
    emoji: string;
    users: string[];
    count: number;
  }>;
  isEdited: boolean;
  editedAt?: Date;
  createdAt: Date;
}

/**
 * Configuración de sugerencias de sala
 */
export interface RoomSuggestionConfig {
  roomId: string;
  isEnabled: boolean;
  requireApproval: boolean;
  allowVoting: boolean;
  allowComments: boolean;
  minVotesToApprove: number;
  minScoreToApprove: number; // Puntuación mínima para aprobación automática
  maxSuggestionsPerUser: number; // Por día
  maxPendingSuggestions: number;
  autoImplementHighScored: boolean;
  autoImplementThreshold: number;
  allowedTypes: ContentSuggestionType[];
  requireReason: boolean;
  moderationEnabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Estadísticas de sugerencias de sala
 */
export interface RoomSuggestionStats {
  roomId: string;
  totalSuggestions: number;
  pendingSuggestions: number;
  approvedSuggestions: number;
  rejectedSuggestions: number;
  implementedSuggestions: number;

  suggestionsByType: Record<ContentSuggestionType, number>;
  suggestionsByStatus: Record<ContentSuggestionStatus, number>;

  topSuggesters: Array<{
    userId: string;
    username: string;
    suggestionCount: number;
    approvalRate: number;
  }>;

  averageVotesPerSuggestion: number;
  averageScorePerSuggestion: number;
  averageTimeToApproval: number; // En horas

  lastSuggestionAt: Date;
  mostPopularGenres: Array<{
    genre: string;
    count: number;
  }>;
}

/**
 * Filtros para búsqueda de sugerencias
 */
export interface ContentSuggestionFilters {
  roomId: string;
  suggestedBy?: string;
  type?: ContentSuggestionType;
  status?: ContentSuggestionStatus;
  genre?: string;
  minScore?: number;
  maxScore?: number;
  dateFrom?: Date;
  dateTo?: Date;
  searchText?: string;
  hasComments?: boolean;
  minVotes?: number;
  sortBy?: 'createdAt' | 'voteScore' | 'totalVotes' | 'priority';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Resultado de búsqueda de sugerencias
 */
export interface SuggestionSearchResult {
  suggestions: ContentSuggestion[];
  totalCount: number;
  hasMore: boolean;
  nextOffset?: number;
  aggregations?: {
    byStatus: Record<ContentSuggestionStatus, number>;
    byType: Record<ContentSuggestionType, number>;
    byGenre: Record<string, number>;
  };
}

/**
 * Evento de sugerencia en tiempo real
 */
export interface SuggestionEvent {
  type:
    | 'created'
    | 'voted'
    | 'commented'
    | 'approved'
    | 'rejected'
    | 'implemented';
  roomId: string;
  suggestionId: string;
  userId: string;
  username: string;
  suggestion?: ContentSuggestion;
  vote?: ContentSuggestionVote;
  comment?: ContentSuggestionComment;
  data?: Record<string, any>;
  timestamp: Date;
}

/**
 * Plantilla de sugerencia
 */
export interface SuggestionTemplate {
  id: string;
  name: string;
  description: string;
  type: ContentSuggestionType;
  fields: Array<{
    name: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'multiselect' | 'textarea';
    required: boolean;
    options?: string[];
    placeholder?: string;
  }>;
  isPublic: boolean;
  usageCount: number;
  createdBy: string;
  createdAt: Date;
}

/**
 * Configuración de notificaciones de sugerencias
 */
export interface SuggestionNotificationConfig {
  userId: string;
  roomId: string;
  notifyOnNewSuggestion: boolean;
  notifyOnVote: boolean;
  notifyOnComment: boolean;
  notifyOnApproval: boolean;
  notifyOnImplementation: boolean;
  notifyOnMySuggestions: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

/**
 * Workflow de aprobación de sugerencias
 */
export interface SuggestionApprovalWorkflow {
  id: string;
  roomId: string;
  name: string;
  steps: Array<{
    order: number;
    type: 'vote' | 'review' | 'automatic';
    requiredRole?: string;
    requiredVotes?: number;
    requiredScore?: number;
    timeoutHours?: number;
  }>;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Historial de cambios de sugerencia
 */
export interface SuggestionChangeHistory {
  id: string;
  suggestionId: string;
  changedBy: string;
  changeType: 'status' | 'content' | 'vote' | 'comment' | 'moderation';
  oldValue?: any;
  newValue?: any;
  reason?: string;
  createdAt: Date;
}
