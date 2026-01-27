import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  RecurrenceType,
  ScheduleStatus,
  AttendanceStatus,
  NotificationType,
  ReminderTiming,
  RecurrencePattern,
  ReminderConfig,
  ScheduleFilters,
} from '../../../domain/entities/room-schedule.entity';

/**
 * DTO para crear patrón de recurrencia
 */
export class CreateRecurrencePatternDto {
  @IsEnum(RecurrenceType)
  type: RecurrenceType;

  @IsNumber()
  @Min(1)
  @Max(365)
  interval: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  maxOccurrences?: number;
}

/**
 * DTO para configuración de recordatorios
 */
export class CreateReminderConfigDto implements Partial<ReminderConfig> {
  @IsBoolean()
  enabled: boolean;

  @IsArray()
  @IsEnum(ReminderTiming, { each: true })
  timings: ReminderTiming[];

  @IsArray()
  @IsEnum(NotificationType, { each: true })
  notificationTypes: NotificationType[];

  @IsOptional()
  @IsString()
  customMessage?: string;
}

/**
 * DTO para crear programación de sala
 */
export class CreateScheduleDto {
  @IsString()
  roomId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsString()
  timezone: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateRecurrencePatternDto)
  recurrence?: CreateRecurrencePatternDto;

  @ValidateNested()
  @Type(() => CreateReminderConfigDto)
  reminders: CreateReminderConfigDto;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  maxAttendees?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

/**
 * DTO para actualizar programación
 */
export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateRecurrencePatternDto)
  recurrence?: CreateRecurrencePatternDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateReminderConfigDto)
  reminders?: CreateReminderConfigDto;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  maxAttendees?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

/**
 * DTO para responder a una programación
 */
export class RespondToScheduleDto {
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO para filtros de búsqueda
 */
export class ScheduleFiltersDto {
  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hasRecurrence?: boolean;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value))
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  offset?: number;
}

/**
 * DTO para crear plantilla de programación
 */
export class CreateScheduleTemplateDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(15)
  @Max(1440) // máximo 24 horas
  duration: number;

  @ValidateNested()
  @Type(() => CreateRecurrencePatternDto)
  recurrence: CreateRecurrencePatternDto;

  @ValidateNested()
  @Type(() => CreateReminderConfigDto)
  reminders: CreateReminderConfigDto;

  @IsString()
  defaultTitle: string;

  @IsOptional()
  @IsString()
  defaultDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

/**
 * DTO para configurar disponibilidad de usuario
 */
export class SetUserAvailabilityDto {
  @IsNumber()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsString()
  startTime: string; // "HH:mm"

  @IsString()
  endTime: string; // "HH:mm"

  @IsString()
  timezone: string;

  @IsBoolean()
  isAvailable: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO para solicitar sugerencias de horario
 */
export class GetScheduleSuggestionsDto {
  @IsString()
  roomId: string;

  @IsArray()
  @IsString({ each: true })
  attendeeIds: string[];

  @IsNumber()
  @Min(15)
  @Max(1440)
  duration: number; // en minutos

  @IsOptional()
  @IsDateString()
  preferredDate?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxSuggestions?: number;
}

/**
 * DTO para configuración de auto-programación
 */
export class CreateAutoScheduleConfigDto {
  @IsString()
  roomId: string;

  @IsBoolean()
  enabled: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Object)
  preferredTimes: { dayOfWeek: number; hour: number }[];

  @IsNumber()
  @Min(15)
  @Max(1440)
  duration: number;

  @IsEnum(RecurrenceType)
  frequency: RecurrenceType;

  @IsNumber()
  @Min(1)
  @Max(365)
  maxAdvanceDays: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  minAttendees: number;

  @IsBoolean()
  autoCancel: boolean;
}

/**
 * DTO para modificar instancia específica de programación recurrente
 */
export class ModifyScheduleInstanceDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;

  @IsOptional()
  @IsString()
  cancellationReason?: string;
}

/**
 * DTO para estadísticas de programación
 */
export class ScheduleStatsQueryDto {
  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeRecurring?: boolean;
}
