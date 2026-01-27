/**
 * Entidades para el sistema de programación de salas
 * Permite programar sesiones de salas con patrones de recurrencia
 */

export enum RecurrenceType {
  NONE = 'none',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  CUSTOM = 'custom',
}

export enum ScheduleStatus {
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum AttendanceStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  MAYBE = 'maybe',
}

export enum NotificationType {
  EMAIL = 'email',
  PUSH = 'push',
  IN_APP = 'in_app',
}

export enum ReminderTiming {
  MINUTES_5 = '5_minutes',
  MINUTES_15 = '15_minutes',
  MINUTES_30 = '30_minutes',
  HOUR_1 = '1_hour',
  HOURS_2 = '2_hours',
  HOURS_24 = '24_hours',
  DAYS_7 = '7_days',
}

/**
 * Patrón de recurrencia para programaciones
 */
export interface RecurrencePattern {
  type: RecurrenceType;
  interval: number; // Cada cuántos días/semanas/meses
  daysOfWeek?: number[]; // 0-6 (domingo-sábado) para recurrencia semanal
  dayOfMonth?: number; // 1-31 para recurrencia mensual
  endDate?: Date; // Fecha de finalización de la recurrencia
  maxOccurrences?: number; // Máximo número de ocurrencias
}

/**
 * Configuración de recordatorios
 */
export interface ReminderConfig {
  enabled: boolean;
  timings: ReminderTiming[];
  notificationTypes: NotificationType[];
  customMessage?: string;
}

/**
 * Programación de sala
 */
export interface RoomSchedule {
  id: string;
  roomId: string;
  title: string;
  description?: string;
  scheduledBy: string; // userId
  startTime: Date;
  endTime: Date;
  timezone: string;
  status: ScheduleStatus;
  recurrence?: RecurrencePattern;
  reminders: ReminderConfig;
  maxAttendees?: number;
  isPublic: boolean;
  requiresApproval: boolean;
  tags?: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Asistente a una programación
 */
export interface ScheduleAttendee {
  scheduleId: string;
  userId: string;
  status: AttendanceStatus;
  responseAt?: Date;
  notes?: string;
  remindersSent: ReminderTiming[];
  joinedAt?: Date;
  leftAt?: Date;
}

/**
 * Instancia específica de una programación recurrente
 */
export interface ScheduleInstance {
  id: string;
  scheduleId: string; // ID de la programación padre
  instanceDate: Date; // Fecha específica de esta instancia
  startTime: Date;
  endTime: Date;
  status: ScheduleStatus;
  actualStartTime?: Date;
  actualEndTime?: Date;
  attendeeCount: number;
  isModified: boolean; // Si esta instancia fue modificada respecto al patrón
  modifiedBy?: string;
  modifiedAt?: Date;
  cancellationReason?: string;
}

/**
 * Notificación de recordatorio
 */
export interface ScheduleNotification {
  id: string;
  scheduleId: string;
  instanceId?: string;
  userId: string;
  type: NotificationType;
  timing: ReminderTiming;
  scheduledFor: Date;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'failed';
  retryCount: number;
  message: string;
  metadata?: Record<string, any>;
}

/**
 * Estadísticas de programación
 */
export interface ScheduleStats {
  scheduleId: string;
  totalInstances: number;
  completedInstances: number;
  cancelledInstances: number;
  averageAttendance: number;
  totalAttendees: number;
  averageDuration: number; // en minutos
  popularTimes: { hour: number; count: number }[];
  attendanceRate: number; // porcentaje
  lastUpdated: Date;
}

/**
 * Conflicto de programación
 */
export interface ScheduleConflict {
  scheduleId: string;
  conflictingScheduleId: string;
  conflictType: 'overlap' | 'room_unavailable' | 'user_busy';
  startTime: Date;
  endTime: Date;
  severity: 'low' | 'medium' | 'high';
  suggestion?: string;
}

/**
 * Configuración de zona horaria
 */
export interface TimezoneConfig {
  timezone: string;
  displayName: string;
  offset: string; // ej: "+02:00"
  isDST: boolean;
}

/**
 * Plantilla de programación
 */
export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  duration: number; // en minutos
  recurrence: RecurrencePattern;
  reminders: ReminderConfig;
  defaultTitle: string;
  defaultDescription?: string;
  tags: string[];
  isPublic: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Disponibilidad de usuario
 */
export interface UserAvailability {
  userId: string;
  dayOfWeek: number; // 0-6
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  timezone: string;
  isAvailable: boolean;
  notes?: string;
}

/**
 * Sugerencia de horario
 */
export interface ScheduleSuggestion {
  suggestedTime: Date;
  endTime: Date;
  confidence: number; // 0-100
  availableAttendees: string[]; // userIds
  unavailableAttendees: string[]; // userIds
  conflictingSchedules: string[]; // scheduleIds
  reason: string;
  alternativeTimes?: Date[];
}

/**
 * Filtros para búsqueda de programaciones
 */
export interface ScheduleFilters {
  roomId?: string;
  userId?: string;
  status?: ScheduleStatus;
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
  isPublic?: boolean;
  hasRecurrence?: boolean;
  timezone?: string;
  limit?: number;
  offset?: number;
}

/**
 * Resultado de búsqueda de programaciones
 */
export interface ScheduleSearchResult {
  schedules: RoomSchedule[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}

/**
 * Configuración de auto-programación
 */
export interface AutoScheduleConfig {
  roomId: string;
  enabled: boolean;
  preferredTimes: { dayOfWeek: number; hour: number }[];
  duration: number; // en minutos
  frequency: RecurrenceType;
  maxAdvanceDays: number; // cuántos días adelante programar
  minAttendees: number;
  autoCancel: boolean; // cancelar si no hay suficientes asistentes
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
