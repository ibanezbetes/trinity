import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { DynamoDBKeys } from '../../infrastructure/database/dynamodb.constants';
import { RoomService } from '../room/room.service';
import { EventTracker } from '../analytics/event-tracker.service';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import { EventType } from '../analytics/interfaces/analytics.interfaces';
import {
  RoomSchedule,
  ScheduleAttendee,
  ScheduleInstance,
  ScheduleNotification,
  ScheduleStats,
  ScheduleConflict,
  ScheduleTemplate,
  UserAvailability,
  ScheduleSuggestion,
  ScheduleSearchResult,
  AutoScheduleConfig,
  RecurrenceType,
  ScheduleStatus,
  AttendanceStatus,
  NotificationType,
  ReminderTiming,
} from '../../domain/entities/room-schedule.entity';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  RespondToScheduleDto,
  ScheduleFiltersDto,
  CreateScheduleTemplateDto,
  SetUserAvailabilityDto,
  GetScheduleSuggestionsDto,
  CreateAutoScheduleConfigDto,
  ModifyScheduleInstanceDto,
  ScheduleStatsQueryDto,
} from './dto/schedule.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RoomScheduleService {
  private readonly logger = new Logger(RoomScheduleService.name);

  constructor(
    private dynamoDBService: DynamoDBService,
    private roomService: RoomService,
    private eventTracker: EventTracker,
    private realtimeService: RealtimeCompatibilityService,
  ) {}

  /**
   * Crear una nueva programación de sala
   */
  async createSchedule(
    userId: string,
    createScheduleDto: CreateScheduleDto,
  ): Promise<RoomSchedule> {
    // Verificar que el usuario tiene permisos en la sala
    await this.verifyRoomAccess(createScheduleDto.roomId, userId);

    // Validar horarios
    const startTime = new Date(createScheduleDto.startTime);
    const endTime = new Date(createScheduleDto.endTime);

    if (startTime >= endTime) {
      throw new BadRequestException(
        'La hora de inicio debe ser anterior a la hora de finalización',
      );
    }

    if (startTime < new Date()) {
      throw new BadRequestException('No se puede programar en el pasado');
    }

    // Verificar conflictos
    const conflicts = await this.checkScheduleConflicts(
      createScheduleDto.roomId,
      startTime,
      endTime,
    );
    if (conflicts.length > 0) {
      throw new ConflictException(
        `Conflicto de programación: ${conflicts[0].suggestion || 'Horario no disponible'}`,
      );
    }

    const scheduleId = uuidv4();
    const now = new Date();

    const schedule: RoomSchedule = {
      id: scheduleId,
      roomId: createScheduleDto.roomId,
      title: createScheduleDto.title,
      description: createScheduleDto.description,
      scheduledBy: userId,
      startTime,
      endTime,
      timezone: createScheduleDto.timezone,
      status: ScheduleStatus.SCHEDULED,
      recurrence: createScheduleDto.recurrence
        ? {
            type: createScheduleDto.recurrence.type,
            interval: createScheduleDto.recurrence.interval,
            daysOfWeek: createScheduleDto.recurrence.daysOfWeek,
            dayOfMonth: createScheduleDto.recurrence.dayOfMonth,
            endDate: createScheduleDto.recurrence.endDate
              ? new Date(createScheduleDto.recurrence.endDate)
              : undefined,
            maxOccurrences: createScheduleDto.recurrence.maxOccurrences,
          }
        : undefined,
      reminders: {
        enabled: createScheduleDto.reminders.enabled,
        timings: createScheduleDto.reminders.timings,
        notificationTypes: createScheduleDto.reminders.notificationTypes,
        customMessage: createScheduleDto.reminders.customMessage,
      },
      maxAttendees: createScheduleDto.maxAttendees,
      isPublic: createScheduleDto.isPublic || false,
      requiresApproval: createScheduleDto.requiresApproval || false,
      tags: createScheduleDto.tags || [],
      metadata: createScheduleDto.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.schedulesPK(scheduleId),
        SK: DynamoDBKeys.schedulesSK(),
        GSI1PK: DynamoDBKeys.schedulesGSI1PK(createScheduleDto.roomId),
        GSI1SK: DynamoDBKeys.schedulesGSI1SK(startTime.toISOString()),
        GSI2PK: DynamoDBKeys.schedulesGSI2PK(userId),
        GSI2SK: DynamoDBKeys.schedulesGSI2SK(startTime.toISOString()),
        ...schedule,
      });

      // Crear instancias si es recurrente
      if (
        schedule.recurrence &&
        schedule.recurrence.type !== RecurrenceType.NONE
      ) {
        await this.createRecurringInstances(schedule);
      }

      // Programar recordatorios
      if (schedule.reminders.enabled) {
        await this.scheduleReminders(schedule);
      }

      // 📝 Track schedule creation event
      // await this.eventTracker.trackEvent(
      //   EventType.SCHEDULE_CREATED,
      //   userId,
      //   {
      //     scheduleId,
      //     roomId: createScheduleDto.roomId,
      //     title: createScheduleDto.title,
      //     recurrenceType: schedule.recurrence?.type || RecurrenceType.NONE,
      //     isRecurring: schedule.recurrence?.type !== RecurrenceType.NONE,
      //     hasReminders: schedule.reminders.enabled,
      //     reminderCount: schedule.reminders.timings?.length || 0,
      //     maxAttendees: createScheduleDto.maxAttendees,
      //     isPublic: createScheduleDto.isPublic || false,
      //     requiresApproval: createScheduleDto.requiresApproval || false,
      //     tagsCount: createScheduleDto.tags?.length || 0,
      //   },
      //   {
      //     source: 'room_schedule_service',
      //     userAgent: 'backend',
      //   },
      // );

      // 🔔 Notificar creación de programación en tiempo real
      await this.realtimeService.notifyScheduleEvent(createScheduleDto.roomId, {
        scheduleId,
        title: createScheduleDto.title,
        action: 'created',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        message: `Nueva programación: ${createScheduleDto.title}`,
      });

      this.logger.log(
        `Programación creada: ${scheduleId} para sala ${createScheduleDto.roomId}`,
      );
      return schedule;
    } catch (error) {
      this.logger.error(`Error creando programación: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener programaciones de una sala
   */
  async getRoomSchedules(
    roomId: string,
    filters: ScheduleFiltersDto = {},
  ): Promise<ScheduleSearchResult> {
    try {
      const queryParams: any = {
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :roomId',
        ExpressionAttributeValues: {
          ':roomId': DynamoDBKeys.schedulesGSI1PK(roomId),
        },
      };

      // Aplicar filtros
      const filterExpressions: string[] = [];
      const expressionValues: any = {
        ...queryParams.ExpressionAttributeValues,
      };

      if (filters.status) {
        filterExpressions.push('#status = :status');
        expressionValues[':status'] = filters.status;
        queryParams.ExpressionAttributeNames = { '#status': 'status' };
      }

      if (filters.startDate) {
        filterExpressions.push('startTime >= :startDate');
        expressionValues[':startDate'] = new Date(
          filters.startDate,
        ).toISOString();
      }

      if (filters.endDate) {
        filterExpressions.push('startTime <= :endDate');
        expressionValues[':endDate'] = new Date(filters.endDate).toISOString();
      }

      if (filters.isPublic !== undefined) {
        filterExpressions.push('isPublic = :isPublic');
        expressionValues[':isPublic'] = filters.isPublic;
      }

      if (filterExpressions.length > 0) {
        queryParams.FilterExpression = filterExpressions.join(' AND ');
        queryParams.ExpressionAttributeValues = expressionValues;
      }

      if (filters.limit) {
        queryParams.Limit = filters.limit;
      }

      const result = await this.dynamoDBService.query(queryParams);
      const schedules = (result as any).Items?.map((item: any) => item as RoomSchedule) || [];

      return {
        schedules,
        total: schedules.length,
        hasMore: !!(result as any).LastEvaluatedKey,
        nextOffset: filters.offset
          ? filters.offset + schedules.length
          : schedules.length,
      };
    } catch (error) {
      this.logger.error(
        `Error obteniendo programaciones de sala ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener programaciones de un usuario
   */
  async getUserSchedules(
    userId: string,
    filters: ScheduleFiltersDto = {},
  ): Promise<ScheduleSearchResult> {
    try {
      const queryParams: any = {
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :userId',
        ExpressionAttributeValues: {
          ':userId': DynamoDBKeys.schedulesGSI2PK(userId),
        },
      };

      // Aplicar filtros similares a getRoomSchedules
      const filterExpressions: string[] = [];
      const expressionValues: any = {
        ...queryParams.ExpressionAttributeValues,
      };

      if (filters.status) {
        filterExpressions.push('#status = :status');
        expressionValues[':status'] = filters.status;
        queryParams.ExpressionAttributeNames = { '#status': 'status' };
      }

      if (filterExpressions.length > 0) {
        queryParams.FilterExpression = filterExpressions.join(' AND ');
        queryParams.ExpressionAttributeValues = expressionValues;
      }

      const result = await this.dynamoDBService.query(queryParams);
      const schedules = (result as any).Items?.map((item: any) => item as RoomSchedule) || [];

      return {
        schedules,
        total: schedules.length,
        hasMore: !!(result as any).LastEvaluatedKey,
        nextOffset: filters.offset
          ? filters.offset + schedules.length
          : schedules.length,
      };
    } catch (error) {
      this.logger.error(
        `Error obteniendo programaciones de usuario ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener una programación específica
   */
  async getSchedule(scheduleId: string): Promise<RoomSchedule> {
    const result = await this.dynamoDBService.getItem(
      DynamoDBKeys.schedulesPK(scheduleId),
      DynamoDBKeys.schedulesSK(),
    );

    if (!result) {
      throw new NotFoundException('Programación no encontrada');
    }

    return result as unknown as RoomSchedule;
  }

  /**
   * Actualizar una programación
   */
  async updateSchedule(
    scheduleId: string,
    userId: string,
    updateScheduleDto: UpdateScheduleDto,
  ): Promise<RoomSchedule> {
    const schedule = await this.getSchedule(scheduleId);

    // Verificar permisos
    if (schedule.scheduledBy !== userId) {
      await this.verifyRoomAccess(schedule.roomId, userId, 'moderate');
    }

    // Validar cambios de horario
    if (updateScheduleDto.startTime || updateScheduleDto.endTime) {
      const startTime = updateScheduleDto.startTime
        ? new Date(updateScheduleDto.startTime)
        : schedule.startTime;
      const endTime = updateScheduleDto.endTime
        ? new Date(updateScheduleDto.endTime)
        : schedule.endTime;

      if (startTime >= endTime) {
        throw new BadRequestException(
          'La hora de inicio debe ser anterior a la hora de finalización',
        );
      }

      // Verificar conflictos solo si cambió el horario
      if (updateScheduleDto.startTime || updateScheduleDto.endTime) {
        const conflicts = await this.checkScheduleConflicts(
          schedule.roomId,
          startTime,
          endTime,
          scheduleId,
        );
        if (conflicts.length > 0) {
          throw new ConflictException(
            `Conflicto de programación: ${conflicts[0].suggestion || 'Horario no disponible'}`,
          );
        }
      }
    }

    const updatedSchedule: RoomSchedule = {
      ...schedule,
      updatedAt: new Date(),
    };

    // Solo actualizar propiedades que están definidas y no son undefined
    if (updateScheduleDto.title !== undefined) {
      updatedSchedule.title = updateScheduleDto.title;
    }
    if (updateScheduleDto.description !== undefined) {
      updatedSchedule.description = updateScheduleDto.description;
    }
    if (updateScheduleDto.startTime !== undefined) {
      updatedSchedule.startTime = new Date(updateScheduleDto.startTime);
    }
    if (updateScheduleDto.endTime !== undefined) {
      updatedSchedule.endTime = new Date(updateScheduleDto.endTime);
    }
    if (updateScheduleDto.timezone !== undefined) {
      updatedSchedule.timezone = updateScheduleDto.timezone;
    }
    if (updateScheduleDto.status !== undefined) {
      updatedSchedule.status = updateScheduleDto.status;
    }
    if (updateScheduleDto.recurrence !== undefined) {
      updatedSchedule.recurrence = {
        type: updateScheduleDto.recurrence.type,
        interval: updateScheduleDto.recurrence.interval,
        daysOfWeek: updateScheduleDto.recurrence.daysOfWeek,
        dayOfMonth: updateScheduleDto.recurrence.dayOfMonth,
        endDate: updateScheduleDto.recurrence.endDate
          ? new Date(updateScheduleDto.recurrence.endDate)
          : undefined,
        maxOccurrences: updateScheduleDto.recurrence.maxOccurrences,
      };
    }
    if (updateScheduleDto.reminders !== undefined) {
      updatedSchedule.reminders = {
        enabled: updateScheduleDto.reminders.enabled,
        timings: updateScheduleDto.reminders.timings,
        notificationTypes: updateScheduleDto.reminders.notificationTypes,
        customMessage: updateScheduleDto.reminders.customMessage,
      };
    }
    if (updateScheduleDto.maxAttendees !== undefined) {
      updatedSchedule.maxAttendees = updateScheduleDto.maxAttendees;
    }
    if (updateScheduleDto.isPublic !== undefined) {
      updatedSchedule.isPublic = updateScheduleDto.isPublic;
    }
    if (updateScheduleDto.requiresApproval !== undefined) {
      updatedSchedule.requiresApproval = updateScheduleDto.requiresApproval;
    }
    if (updateScheduleDto.tags !== undefined) {
      updatedSchedule.tags = updateScheduleDto.tags;
    }
    if (updateScheduleDto.metadata !== undefined) {
      updatedSchedule.metadata = updateScheduleDto.metadata;
    }

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.schedulesPK(scheduleId),
        SK: DynamoDBKeys.schedulesSK(),
        GSI1PK: DynamoDBKeys.schedulesGSI1PK(schedule.roomId),
        GSI1SK: DynamoDBKeys.schedulesGSI1SK(
          updatedSchedule.startTime.toISOString(),
        ),
        GSI2PK: DynamoDBKeys.schedulesGSI2PK(schedule.scheduledBy),
        GSI2SK: DynamoDBKeys.schedulesGSI2SK(
          updatedSchedule.startTime.toISOString(),
        ),
        ...updatedSchedule,
      });

      // 📝 Track schedule update event
      // await this.eventTracker.trackEvent(
      //   EventType.SCHEDULE_UPDATED,
      //   userId,
      //   {
      //     scheduleId,
      //     scheduleTitle: updatedSchedule.title,
      //     roomId: schedule.roomId,
      //     hasTimeChange: !!(
      //       updateScheduleDto.startTime || updateScheduleDto.endTime
      //     ),
      //     hasRecurrenceChange: !!updateScheduleDto.recurrence,
      //     hasReminderChange: !!updateScheduleDto.reminders,
      //     statusChange: updateScheduleDto.status,
      //     fieldsUpdated: Object.keys(updateScheduleDto).length,
      //   },
      //   {
      //     source: 'room_schedule_service',
      //     userAgent: 'backend',
      //   },
      // );

      // 🔔 Notificar actualización de programación en tiempo real
      await this.realtimeService.notifyScheduleEvent(schedule.roomId, {
        scheduleId,
        title: updatedSchedule.title,
        action: 'updated',
        startTime: updatedSchedule.startTime.toISOString(),
        endTime: updatedSchedule.endTime.toISOString(),
        message: `Programación actualizada: ${updatedSchedule.title}`,
      });

      this.logger.log(`Programación actualizada: ${scheduleId}`);
      return updatedSchedule;
    } catch (error) {
      this.logger.error(`Error actualizando programación: ${error.message}`);
      throw error;
    }
  }

  /**
   * Responder a una programación (asistir/declinar)
   */
  async respondToSchedule(
    scheduleId: string,
    userId: string,
    responseDto: RespondToScheduleDto,
  ): Promise<ScheduleAttendee> {
    const schedule = await this.getSchedule(scheduleId);

    // Verificar que la programación permite asistentes
    if (!schedule.isPublic && schedule.scheduledBy !== userId) {
      throw new ForbiddenException('Esta programación no es pública');
    }

    const attendeeId = uuidv4();
    const now = new Date();

    const attendee: ScheduleAttendee = {
      scheduleId,
      userId,
      status: responseDto.status,
      responseAt: now,
      notes: responseDto.notes,
      remindersSent: [],
    };

    try {
      await this.dynamoDBService.putItem({
        PK: DynamoDBKeys.scheduleAttendeesPK(scheduleId),
        SK: DynamoDBKeys.scheduleAttendeesSK(userId),
        GSI1PK: DynamoDBKeys.scheduleAttendeesGSI1PK(userId),
        GSI1SK: DynamoDBKeys.scheduleAttendeesGSI1SK(scheduleId),
        id: attendeeId,
        ...attendee,
      });

      // 📝 Track schedule attendance event
      // await this.eventTracker.trackEvent(
      //   responseDto.status === AttendanceStatus.ACCEPTED
      //     ? EventType.SCHEDULE_ATTENDED
      //     : EventType.SCHEDULE_MISSED,
      //   userId,
      //   {
      //     scheduleId,
      //     scheduleTitle: schedule.title,
      //     roomId: schedule.roomId,
      //     attendanceStatus: responseDto.status,
      //     hasNotes: !!responseDto.notes,
      //     notesLength: responseDto.notes?.length || 0,
      //   },
      //   {
      //     source: 'room_schedule_service',
      //     userAgent: 'backend',
      //   },
      // );

      this.logger.log(
        `Usuario ${userId} respondió a programación ${scheduleId}: ${responseDto.status}`,
      );
      return attendee;
    } catch (error) {
      this.logger.error(`Error respondiendo a programación: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener asistentes de una programación
   */
  async getScheduleAttendees(scheduleId: string): Promise<ScheduleAttendee[]> {
    try {
      const result = await this.dynamoDBService.query({
        KeyConditionExpression: 'PK = :scheduleId',
        ExpressionAttributeValues: {
          ':scheduleId': DynamoDBKeys.scheduleAttendeesPK(scheduleId),
        },
      });

      return (result as any).Items?.map((item: any) => item as ScheduleAttendee) || [];
    } catch (error) {
      this.logger.error(
        `Error obteniendo asistentes de programación ${scheduleId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener sugerencias de horario
   */
  async getScheduleSuggestions(
    getSuggestionsDto: GetScheduleSuggestionsDto,
  ): Promise<ScheduleSuggestion[]> {
    try {
      // Implementación simplificada - en producción usaría algoritmos más sofisticados
      const suggestions: ScheduleSuggestion[] = [];
      const now = new Date();
      const baseDate = getSuggestionsDto.preferredDate
        ? new Date(
            Math.max(
              new Date(getSuggestionsDto.preferredDate).getTime(),
              now.getTime() + 60000,
            ),
          ) // Al menos 1 minuto en el futuro
        : new Date(now.getTime() + 60000); // 1 minuto en el futuro

      // Generar sugerencias para los próximos 7 días
      for (let i = 0; i < 7; i++) {
        const suggestedDate = new Date(baseDate);
        suggestedDate.setDate(baseDate.getDate() + i);

        // Asegurar que la fecha sugerida sea en el futuro
        if (suggestedDate.getTime() < Date.now()) {
          continue;
        }

        // Sugerir horarios comunes (9 AM, 2 PM, 7 PM)
        const commonHours = [9, 14, 19];

        for (const hour of commonHours) {
          const suggestedTime = new Date(suggestedDate);
          suggestedTime.setHours(hour, 0, 0, 0);

          // Asegurar que el horario sugerido sea en el futuro
          if (suggestedTime.getTime() < Date.now()) {
            continue;
          }

          const endTime = new Date(suggestedTime);
          endTime.setMinutes(endTime.getMinutes() + getSuggestionsDto.duration);

          // Verificar disponibilidad (simplificado)
          const conflicts = await this.checkScheduleConflicts(
            getSuggestionsDto.roomId,
            suggestedTime,
            endTime,
          );

          if (conflicts.length === 0) {
            suggestions.push({
              suggestedTime,
              endTime,
              confidence: 85 + Math.random() * 15, // 85-100%
              availableAttendees: getSuggestionsDto.attendeeIds,
              unavailableAttendees: [],
              conflictingSchedules: [],
              reason: 'Horario disponible sin conflictos',
              alternativeTimes: [],
            });
          }
        }
      }

      return suggestions.slice(0, getSuggestionsDto.maxSuggestions || 5);
    } catch (error) {
      this.logger.error(
        `Error obteniendo sugerencias de horario: ${error.message}`,
      );
      throw error;
    }
  }

  // Métodos auxiliares privados

  private async verifyRoomAccess(
    roomId: string,
    userId: string,
    permission: string = 'member',
  ): Promise<void> {
    try {
      const room = await this.roomService.getRoom(roomId);

      // Verificar que el usuario es miembro de la sala
      const isMember = room && (room as any).members?.some((member: any) => member.userId === userId);
      if (!isMember) {
        throw new ForbiddenException('No tienes acceso a esta sala');
      }

      // Verificar permisos específicos si es necesario
      if (permission === 'moderate') {
        const member = room && (room as any).members?.find((member: any) => member.userId === userId);
        if (member?.role !== 'admin' && member?.role !== 'moderator') {
          throw new ForbiddenException(
            'No tienes permisos para moderar esta sala',
          );
        }
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Sala no encontrada');
      }
      throw error;
    }
  }

  private async checkScheduleConflicts(
    roomId: string,
    startTime: Date,
    endTime: Date,
    excludeScheduleId?: string,
  ): Promise<ScheduleConflict[]> {
    try {
      // Buscar programaciones existentes en el rango de tiempo
      const result = await this.dynamoDBService.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :roomId',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':roomId': DynamoDBKeys.schedulesGSI1PK(roomId),
          ':status': ScheduleStatus.SCHEDULED,
        },
      });

      const conflicts: ScheduleConflict[] = [];
      const existingSchedules =
        (result as any).Items?.map((item: any) => item as RoomSchedule) || [];

      for (const existing of existingSchedules) {
        if (excludeScheduleId && existing.id === excludeScheduleId) {
          continue;
        }

        // Verificar solapamiento
        if (
          this.timesOverlap(
            startTime,
            endTime,
            existing.startTime,
            existing.endTime,
          )
        ) {
          conflicts.push({
            scheduleId: existing.id,
            conflictingScheduleId: existing.id,
            conflictType: 'overlap',
            startTime: existing.startTime,
            endTime: existing.endTime,
            severity: 'high',
            suggestion: `Conflicto con "${existing.title}" (${existing.startTime.toLocaleString()} - ${existing.endTime.toLocaleString()})`,
          });
        }
      }

      return conflicts;
    } catch (error) {
      this.logger.error(`Error verificando conflictos: ${error.message}`);
      return [];
    }
  }

  private timesOverlap(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date,
  ): boolean {
    return start1 < end2 && end1 > start2;
  }

  private async createRecurringInstances(
    schedule: RoomSchedule,
  ): Promise<void> {
    if (
      !schedule.recurrence ||
      schedule.recurrence.type === RecurrenceType.NONE
    ) {
      return;
    }

    // Implementación simplificada - crear instancias para los próximos 3 meses
    const instances: ScheduleInstance[] = [];
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 3);

    let currentDate = new Date(schedule.startTime);
    let instanceCount = 0;

    while (
      currentDate <= maxDate &&
      instanceCount < (schedule.recurrence.maxOccurrences || 100)
    ) {
      if (currentDate > schedule.startTime) {
        const instanceId = uuidv4();
        const duration =
          schedule.endTime.getTime() - schedule.startTime.getTime();
        const instanceEndTime = new Date(currentDate.getTime() + duration);

        const instance: ScheduleInstance = {
          id: instanceId,
          scheduleId: schedule.id,
          instanceDate: new Date(currentDate),
          startTime: new Date(currentDate),
          endTime: instanceEndTime,
          status: ScheduleStatus.SCHEDULED,
          attendeeCount: 0,
          isModified: false,
        };

        instances.push(instance);
      }

      // Calcular siguiente fecha según el patrón
      currentDate = this.getNextRecurrenceDate(
        currentDate,
        schedule.recurrence,
      );
      instanceCount++;
    }

    // Guardar instancias en lotes
    for (const instance of instances) {
      try {
        await this.dynamoDBService.putItem({
          PK: DynamoDBKeys.scheduleInstancesPK(schedule.id),
          SK: DynamoDBKeys.scheduleInstancesSK(instance.id),
          GSI1PK: DynamoDBKeys.scheduleInstancesGSI1PK(
            instance.instanceDate.toISOString().split('T')[0],
          ),
          GSI1SK: DynamoDBKeys.scheduleInstancesGSI1SK(
            instance.startTime.toISOString(),
          ),
          ...instance,
        });
      } catch (error) {
        this.logger.error(
          `Error creando instancia recurrente: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Creadas ${instances.length} instancias recurrentes para programación ${schedule.id}`,
    );
  }

  private getNextRecurrenceDate(currentDate: Date, recurrence: any): Date {
    const nextDate = new Date(currentDate);

    switch (recurrence.type) {
      case RecurrenceType.DAILY:
        nextDate.setDate(nextDate.getDate() + recurrence.interval);
        break;
      case RecurrenceType.WEEKLY:
        nextDate.setDate(nextDate.getDate() + 7 * recurrence.interval);
        break;
      case RecurrenceType.MONTHLY:
        nextDate.setMonth(nextDate.getMonth() + recurrence.interval);
        break;
      default:
        nextDate.setDate(nextDate.getDate() + 1);
    }

    return nextDate;
  }

  private async scheduleReminders(schedule: RoomSchedule): Promise<void> {
    if (!schedule.reminders.enabled) {
      return;
    }

    const notifications: ScheduleNotification[] = [];

    for (const timing of schedule.reminders.timings) {
      const reminderTime = this.calculateReminderTime(
        schedule.startTime,
        timing,
      );

      if (reminderTime > new Date()) {
        const notificationId = uuidv4();

        for (const notificationType of schedule.reminders.notificationTypes) {
          const notification: ScheduleNotification = {
            id: notificationId,
            scheduleId: schedule.id,
            userId: schedule.scheduledBy,
            type: notificationType,
            timing,
            scheduledFor: reminderTime,
            status: 'pending',
            retryCount: 0,
            message:
              schedule.reminders.customMessage ||
              `Recordatorio: "${schedule.title}" comienza en ${this.getTimingDescription(timing)}`,
          };

          notifications.push(notification);
        }
      }
    }

    // Guardar notificaciones
    for (const notification of notifications) {
      try {
        await this.dynamoDBService.putItem({
          PK: DynamoDBKeys.scheduleNotificationsPK(notification.scheduleId),
          SK: DynamoDBKeys.scheduleNotificationsSK(notification.id),
          GSI1PK: DynamoDBKeys.scheduleNotificationsGSI1PK(
            notification.scheduledFor.toISOString().split('T')[0],
          ),
          GSI1SK: DynamoDBKeys.scheduleNotificationsGSI1SK(
            notification.scheduledFor.toISOString(),
          ),
          ...notification,
        });
      } catch (error) {
        this.logger.error(`Error programando recordatorio: ${error.message}`);
      }
    }

    this.logger.log(
      `Programados ${notifications.length} recordatorios para programación ${schedule.id}`,
    );
  }

  private calculateReminderTime(startTime: Date, timing: ReminderTiming): Date {
    const reminderTime = new Date(startTime);

    switch (timing) {
      case ReminderTiming.MINUTES_5:
        reminderTime.setMinutes(reminderTime.getMinutes() - 5);
        break;
      case ReminderTiming.MINUTES_15:
        reminderTime.setMinutes(reminderTime.getMinutes() - 15);
        break;
      case ReminderTiming.MINUTES_30:
        reminderTime.setMinutes(reminderTime.getMinutes() - 30);
        break;
      case ReminderTiming.HOUR_1:
        reminderTime.setHours(reminderTime.getHours() - 1);
        break;
      case ReminderTiming.HOURS_2:
        reminderTime.setHours(reminderTime.getHours() - 2);
        break;
      case ReminderTiming.HOURS_24:
        reminderTime.setDate(reminderTime.getDate() - 1);
        break;
      case ReminderTiming.DAYS_7:
        reminderTime.setDate(reminderTime.getDate() - 7);
        break;
    }

    return reminderTime;
  }

  private getTimingDescription(timing: ReminderTiming): string {
    const descriptions = {
      [ReminderTiming.MINUTES_5]: '5 minutos',
      [ReminderTiming.MINUTES_15]: '15 minutos',
      [ReminderTiming.MINUTES_30]: '30 minutos',
      [ReminderTiming.HOUR_1]: '1 hora',
      [ReminderTiming.HOURS_2]: '2 horas',
      [ReminderTiming.HOURS_24]: '24 horas',
      [ReminderTiming.DAYS_7]: '7 días',
    };

    return descriptions[timing] || 'un tiempo';
  }
}
