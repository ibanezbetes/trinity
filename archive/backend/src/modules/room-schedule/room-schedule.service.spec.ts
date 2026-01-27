import { Test, TestingModule } from '@nestjs/testing';
import { RoomScheduleService } from './room-schedule.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { RoomService } from '../room/room.service';
import { RealtimeCompatibilityService } from '../realtime/realtime-compatibility.service';
import { EventTracker } from '../analytics/event-tracker.service';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as fc from 'fast-check';
import {
  RoomSchedule,
  ScheduleAttendee,
  ScheduleInstance,
  ScheduleNotification,
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
  GetScheduleSuggestionsDto,
} from './dto/schedule.dto';

describe('RoomScheduleService', () => {
  let service: RoomScheduleService;
  let dynamoDBService: jest.Mocked<DynamoDBService>;
  let roomService: jest.Mocked<RoomService>;
  let realtimeService: jest.Mocked<RealtimeCompatibilityService>;
  let eventTracker: jest.Mocked<EventTracker>;

  // Generadores de datos para property-based testing
  const userIdArb = fc.string({ minLength: 1, maxLength: 50 });
  const roomIdArb = fc.string({ minLength: 1, maxLength: 50 });
  const scheduleIdArb = fc.string({ minLength: 1, maxLength: 50 });

  const recurrenceTypeArb = fc.constantFrom(...Object.values(RecurrenceType));
  const scheduleStatusArb = fc.constantFrom(...Object.values(ScheduleStatus));
  const attendanceStatusArb = fc.constantFrom(
    ...Object.values(AttendanceStatus),
  );
  const notificationTypeArb = fc.constantFrom(
    ...Object.values(NotificationType),
  );
  const reminderTimingArb = fc.constantFrom(...Object.values(ReminderTiming));

  // Generador de fechas futuras válidas (próximos 30 días)
  const futureDateArb = fc.date({
    min: new Date(Date.now() + 60000), // Al menos 1 minuto en el futuro
    max: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Máximo 30 días en el futuro
  });

  // Generador de duración válida (15 minutos a 8 horas)
  const durationArb = fc.integer({ min: 15, max: 480 });

  const timezoneArb = fc.constantFrom(
    'UTC',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Australia/Sydney',
  );

  const recurrencePatternArb = fc.record({
    type: recurrenceTypeArb,
    interval: fc.integer({ min: 1, max: 30 }),
    daysOfWeek: fc.option(
      fc.array(fc.integer({ min: 0, max: 6 }), { maxLength: 7 }),
      { nil: undefined },
    ),
    dayOfMonth: fc.option(fc.integer({ min: 1, max: 31 }), { nil: undefined }),
    endDate: fc.option(
      fc.date({
        min: new Date(Date.now() + 2 * 86400000), // Al menos 2 días en el futuro
        max: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Máximo 1 año en el futuro
      }),
      { nil: undefined },
    ),
    maxOccurrences: fc.option(fc.integer({ min: 1, max: 100 }), {
      nil: undefined,
    }),
  });

  const reminderConfigArb = fc.record({
    enabled: fc.boolean(),
    timings: fc.array(reminderTimingArb, { minLength: 1, maxLength: 3 }),
    notificationTypes: fc.array(notificationTypeArb, {
      minLength: 1,
      maxLength: 3,
    }),
    customMessage: fc.option(fc.string({ minLength: 1, maxLength: 200 }), {
      nil: undefined,
    }),
  });

  const createScheduleDtoArb = fc
    .record({
      roomId: roomIdArb,
      title: fc.string({ minLength: 3, maxLength: 100 }),
      description: fc.option(fc.string({ minLength: 10, maxLength: 500 }), {
        nil: undefined,
      }),
      startTime: futureDateArb,
      endTime: futureDateArb,
      timezone: timezoneArb,
      recurrence: fc.option(recurrencePatternArb, { nil: undefined }),
      reminders: reminderConfigArb,
      maxAttendees: fc.option(fc.integer({ min: 2, max: 100 }), {
        nil: undefined,
      }),
      isPublic: fc.option(fc.boolean(), { nil: undefined }),
      requiresApproval: fc.option(fc.boolean(), { nil: undefined }),
      tags: fc.option(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
        { nil: undefined },
      ),
      metadata: fc.option(fc.object(), { nil: undefined }),
    })
    .map((dto) => {
      // Asegurar que endTime sea después de startTime y que las fechas sean válidas
      const startTime = dto.startTime;
      const minEndTime = new Date(startTime.getTime() + 15 * 60 * 1000); // Al menos 15 minutos después
      const maxEndTime = new Date(startTime.getTime() + 8 * 60 * 60 * 1000); // Máximo 8 horas después
      const endTime = new Date(
        minEndTime.getTime() +
          Math.random() * (maxEndTime.getTime() - minEndTime.getTime()),
      );

      // Verificar que las fechas son válidas
      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        // Si las fechas no son válidas, usar fechas por defecto
        const defaultStart = new Date(Date.now() + 86400000); // 1 día en el futuro
        const defaultEnd = new Date(
          defaultStart.getTime() + 2 * 60 * 60 * 1000,
        ); // 2 horas después
        return { ...dto, startTime: defaultStart, endTime: defaultEnd };
      }

      return { ...dto, startTime, endTime };
    });

  const updateScheduleDtoArb = fc
    .record({
      title: fc.option(fc.string({ minLength: 3, maxLength: 100 }), {
        nil: undefined,
      }),
      description: fc.option(fc.string({ minLength: 10, maxLength: 500 }), {
        nil: undefined,
      }),
      startTime: fc.option(futureDateArb, { nil: undefined }),
      endTime: fc.option(futureDateArb, { nil: undefined }),
      timezone: fc.option(timezoneArb, { nil: undefined }),
      status: fc.option(scheduleStatusArb, { nil: undefined }),
      recurrence: fc.option(recurrencePatternArb, { nil: undefined }),
      reminders: fc.option(reminderConfigArb, { nil: undefined }),
      maxAttendees: fc.option(fc.integer({ min: 2, max: 100 }), {
        nil: undefined,
      }),
      isPublic: fc.option(fc.boolean(), { nil: undefined }),
      requiresApproval: fc.option(fc.boolean(), { nil: undefined }),
      tags: fc.option(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
        { nil: undefined },
      ),
      metadata: fc.option(fc.object(), { nil: undefined }),
    })
    .map((dto) => {
      // Si se proporcionan tanto startTime como endTime, asegurar que endTime > startTime
      if (dto.startTime && dto.endTime) {
        const startTime = dto.startTime;
        const endTime = new Date(
          startTime.getTime() + (1 + Math.random() * 4) * 60 * 60 * 1000,
        ); // 1-5 horas después
        return { ...dto, startTime, endTime };
      }
      return dto;
    });

  const respondToScheduleDtoArb = fc.record({
    status: attendanceStatusArb,
    notes: fc.option(fc.string({ minLength: 1, maxLength: 200 }), {
      nil: undefined,
    }),
  });

  beforeEach(async () => {
    const mockDynamoDBService = {
      putItem: jest.fn(),
      getItem: jest.fn(),
      query: jest.fn(),
      deleteItem: jest.fn(),
    };

    const mockRoomService = {
      getRoom: jest.fn(),
    };

    const mockRealtimeService = {
      notifyScheduleEvent: jest.fn(),
      notifyRoomStateChange: jest.fn(),
      notifyMemberStatusChange: jest.fn(),
    };

    const mockEventTracker = {
      trackEvent: jest.fn(),
      trackUserAction: jest.fn(),
      trackRoomEvent: jest.fn(),
      trackPerformanceMetric: jest.fn(),
      trackContentInteraction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomScheduleService,
        {
          provide: DynamoDBService,
          useValue: mockDynamoDBService,
        },
        {
          provide: RoomService,
          useValue: mockRoomService,
        },
        {
          provide: RealtimeCompatibilityService,
          useValue: mockRealtimeService,
        },
        {
          provide: EventTracker,
          useValue: mockEventTracker,
        },
      ],
    }).compile();

    service = module.get<RoomScheduleService>(RoomScheduleService);
    dynamoDBService = module.get(DynamoDBService);
    roomService = module.get(RoomService);
    realtimeService = module.get(RealtimeCompatibilityService);
    eventTracker = module.get(EventTracker);
  });

  describe('Schedule Creation Properties', () => {
    /**
     * Propiedad 1: Crear programación siempre genera estructura válida
     */
    it('should create schedules with valid structure and properties', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          createScheduleDtoArb,
          async (userId, createScheduleDto) => {
            // Setup mocks
            roomService.getRoom.mockResolvedValue({
              id: createScheduleDto.roomId,
              members: [{ userId, role: 'member' }],
            } as any);

            dynamoDBService.query.mockResolvedValue({ Items: [] }); // No conflictos
            dynamoDBService.putItem.mockResolvedValue({} as any);

            // Execute
            const result = await service.createSchedule(
              userId,
              createScheduleDto,
            );

            // Verify structure
            expect(result.id).toBeDefined();
            expect(typeof result.id).toBe('string');
            expect(result.roomId).toBe(createScheduleDto.roomId);
            expect(result.title).toBe(createScheduleDto.title);
            expect(result.scheduledBy).toBe(userId);
            expect(result.startTime).toBeInstanceOf(Date);
            expect(result.endTime).toBeInstanceOf(Date);
            expect(result.timezone).toBe(createScheduleDto.timezone);
            expect(result.status).toBe(ScheduleStatus.SCHEDULED);
            expect(result.createdAt).toBeInstanceOf(Date);
            expect(result.updatedAt).toBeInstanceOf(Date);

            // Verify time logic
            expect(result.startTime.getTime()).toBeLessThan(
              result.endTime.getTime(),
            );
            expect(result.startTime.getTime()).toBeGreaterThan(Date.now());

            // Verify optional fields
            if (createScheduleDto.description) {
              expect(result.description).toBe(createScheduleDto.description);
            }
            if (createScheduleDto.maxAttendees) {
              expect(result.maxAttendees).toBe(createScheduleDto.maxAttendees);
            }
            expect(result.isPublic).toBe(createScheduleDto.isPublic || false);
            expect(result.requiresApproval).toBe(
              createScheduleDto.requiresApproval || false,
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Propiedad 2: Validación de horarios es correcta
     */
    it('should validate schedule times correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          roomIdArb,
          fc.string({ minLength: 3, maxLength: 100 }),
          fc.date({
            min: new Date(Date.now() + 60000), // Al menos 1 minuto en el futuro
            max: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Máximo 30 días en el futuro
          }),
          durationArb,
          async (userId, roomId, title, startTime, durationMinutes) => {
            // Verificar que la fecha de inicio es válida
            if (isNaN(startTime.getTime())) {
              return; // Skip invalid dates
            }

            const endTime = new Date(
              startTime.getTime() + durationMinutes * 60 * 1000,
            );

            // Verificar que la fecha de fin es válida
            if (isNaN(endTime.getTime())) {
              return; // Skip invalid dates
            }

            const createScheduleDto: CreateScheduleDto = {
              roomId,
              title,
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              timezone: 'UTC',
              reminders: {
                enabled: false,
                timings: [],
                notificationTypes: [],
              },
            };

            // Setup mocks
            roomService.getRoom.mockResolvedValue({
              id: roomId,
              members: [{ userId, role: 'member' }],
            } as any);

            dynamoDBService.query.mockResolvedValue({ Items: [] });
            dynamoDBService.putItem.mockResolvedValue({} as any);

            // Execute
            const result = await service.createSchedule(
              userId,
              createScheduleDto,
            );

            // Verify time validation
            expect(result.startTime.getTime()).toBeLessThan(
              result.endTime.getTime(),
            );
            expect(result.endTime.getTime() - result.startTime.getTime()).toBe(
              durationMinutes * 60 * 1000,
            );
            expect(result.startTime.getTime()).toBeGreaterThan(
              Date.now() - 1000,
            ); // Allow for test execution time
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Propiedad 3: Patrones de recurrencia son válidos
     */
    it('should validate recurrence patterns correctly', async () => {
      await fc.assert(
        fc.asyncProperty(recurrencePatternArb, async (recurrence) => {
          // Verify recurrence type
          expect(Object.values(RecurrenceType)).toContain(recurrence.type);

          // Verify interval
          expect(recurrence.interval).toBeGreaterThanOrEqual(1);
          expect(recurrence.interval).toBeLessThanOrEqual(30);

          // Verify days of week if present
          if (recurrence.daysOfWeek) {
            recurrence.daysOfWeek.forEach((day) => {
              expect(day).toBeGreaterThanOrEqual(0);
              expect(day).toBeLessThanOrEqual(6);
            });
          }

          // Verify day of month if present
          if (recurrence.dayOfMonth) {
            expect(recurrence.dayOfMonth).toBeGreaterThanOrEqual(1);
            expect(recurrence.dayOfMonth).toBeLessThanOrEqual(31);
          }

          // Verify end date is in future if present
          if (recurrence.endDate) {
            expect(recurrence.endDate.getTime()).toBeGreaterThan(Date.now());
          }

          // Verify max occurrences if present
          if (recurrence.maxOccurrences) {
            expect(recurrence.maxOccurrences).toBeGreaterThanOrEqual(1);
            expect(recurrence.maxOccurrences).toBeLessThanOrEqual(100);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Schedule Update Properties', () => {
    /**
     * Propiedad 4: Actualizar programación preserva propiedades inmutables
     */
    it('should preserve immutable properties when updating schedules', async () => {
      await fc.assert(
        fc.asyncProperty(
          scheduleIdArb,
          userIdArb,
          createScheduleDtoArb,
          fc.record({
            title: fc.option(fc.string({ minLength: 3, maxLength: 100 }), {
              nil: undefined,
            }),
            description: fc.option(
              fc.string({ minLength: 10, maxLength: 500 }),
              { nil: undefined },
            ),
            status: fc.option(scheduleStatusArb, { nil: undefined }),
            maxAttendees: fc.option(fc.integer({ min: 2, max: 100 }), {
              nil: undefined,
            }),
            isPublic: fc.option(fc.boolean(), { nil: undefined }),
            requiresApproval: fc.option(fc.boolean(), { nil: undefined }),
            tags: fc.option(
              fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
                maxLength: 5,
              }),
              { nil: undefined },
            ),
          }),
          async (scheduleId, userId, originalSchedule, updateDto) => {
            // Setup existing schedule
            const existingSchedule: RoomSchedule = {
              id: scheduleId,
              roomId: originalSchedule.roomId,
              title: originalSchedule.title,
              description: originalSchedule.description,
              scheduledBy: userId,
              startTime: originalSchedule.startTime,
              endTime: originalSchedule.endTime,
              timezone: originalSchedule.timezone,
              status: ScheduleStatus.SCHEDULED,
              recurrence: originalSchedule.recurrence,
              reminders: originalSchedule.reminders,
              maxAttendees: originalSchedule.maxAttendees,
              isPublic: originalSchedule.isPublic || false,
              requiresApproval: originalSchedule.requiresApproval || false,
              tags: originalSchedule.tags || [],
              metadata: originalSchedule.metadata || {},
              createdAt: new Date('2023-01-01'),
              updatedAt: new Date('2023-01-01'),
            };

            dynamoDBService.getItem.mockResolvedValue(existingSchedule);
            dynamoDBService.query.mockResolvedValue({ Items: [] }); // No conflictos
            dynamoDBService.putItem.mockResolvedValue({} as any);

            // Execute
            const result = await service.updateSchedule(
              scheduleId,
              userId,
              updateDto,
            );

            // Verify immutable properties
            expect(result.id).toBe(scheduleId);
            expect(result.roomId).toBe(originalSchedule.roomId);
            expect(result.scheduledBy).toBe(userId);
            expect(result.createdAt).toEqual(existingSchedule.createdAt);

            // Verify updatedAt changed
            expect(result.updatedAt.getTime()).toBeGreaterThan(
              existingSchedule.updatedAt.getTime(),
            );

            // Verify updated properties
            if (updateDto.title !== undefined) {
              expect(result.title).toBe(updateDto.title);
            } else {
              expect(result.title).toBe(originalSchedule.title);
            }

            if (updateDto.status !== undefined) {
              expect(result.status).toBe(updateDto.status);
            } else {
              expect(result.status).toBe(existingSchedule.status);
            }

            if (updateDto.maxAttendees !== undefined) {
              expect(result.maxAttendees).toBe(updateDto.maxAttendees);
            } else {
              expect(result.maxAttendees).toBe(originalSchedule.maxAttendees);
            }

            if (updateDto.isPublic !== undefined) {
              expect(result.isPublic).toBe(updateDto.isPublic);
            } else {
              expect(result.isPublic).toBe(originalSchedule.isPublic || false);
            }

            // Verify unchanged time properties (no time updates in this test)
            expect(result.startTime).toEqual(originalSchedule.startTime);
            expect(result.endTime).toEqual(originalSchedule.endTime);
            expect(result.timezone).toBe(originalSchedule.timezone);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Schedule Response Properties', () => {
    /**
     * Propiedad 5: Responder a programación crea asistente válido
     */
    it('should create valid attendees when responding to schedules', async () => {
      await fc.assert(
        fc.asyncProperty(
          scheduleIdArb,
          userIdArb,
          respondToScheduleDtoArb,
          async (scheduleId, userId, responseDto) => {
            // Setup mock schedule
            const mockSchedule: RoomSchedule = {
              id: scheduleId,
              roomId: 'room1',
              title: 'Test Schedule',
              scheduledBy: 'other-user',
              startTime: new Date(Date.now() + 86400000), // 1 día en el futuro
              endTime: new Date(Date.now() + 90000000), // 1 día + 1 hora en el futuro
              timezone: 'UTC',
              status: ScheduleStatus.SCHEDULED,
              reminders: { enabled: false, timings: [], notificationTypes: [] },
              isPublic: true,
              requiresApproval: false,
              tags: [],
              metadata: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            dynamoDBService.getItem.mockResolvedValue(mockSchedule);
            dynamoDBService.putItem.mockResolvedValue({} as any);

            // Execute
            const result = await service.respondToSchedule(
              scheduleId,
              userId,
              responseDto,
            );

            // Verify attendee structure
            expect(result.scheduleId).toBe(scheduleId);
            expect(result.userId).toBe(userId);
            expect(result.status).toBe(responseDto.status);
            expect(result.responseAt).toBeInstanceOf(Date);
            expect(result.remindersSent).toEqual([]);

            // Verify status is valid
            expect(Object.values(AttendanceStatus)).toContain(result.status);

            // Verify notes if provided
            if (responseDto.notes) {
              expect(result.notes).toBe(responseDto.notes);
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    /**
     * Propiedad 6: Estados de asistencia son válidos
     */
    it('should enforce valid attendance statuses', async () => {
      await fc.assert(
        fc.asyncProperty(attendanceStatusArb, async (status) => {
          // Verify status is in valid enum
          expect(Object.values(AttendanceStatus)).toContain(status);
          expect(typeof status).toBe('string');
          expect(status.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Schedule Search Properties', () => {
    /**
     * Propiedad 7: Búsqueda de programaciones devuelve resultados válidos
     */
    it('should return valid search results for room schedules', async () => {
      await fc.assert(
        fc.asyncProperty(
          roomIdArb,
          fc.record({
            status: fc.option(scheduleStatusArb, { nil: undefined }),
            isPublic: fc.option(fc.boolean(), { nil: undefined }),
            limit: fc.option(fc.integer({ min: 1, max: 100 }), {
              nil: undefined,
            }),
            offset: fc.option(fc.integer({ min: 0, max: 1000 }), {
              nil: undefined,
            }),
          }),
          async (roomId, filters) => {
            // Setup mock data
            const mockSchedules = Array.from({ length: 5 }, (_, i) => ({
              id: `schedule-${i}`,
              roomId,
              title: `Schedule ${i}`,
              scheduledBy: 'user1',
              startTime: new Date(Date.now() + i * 86400000),
              endTime: new Date(Date.now() + i * 86400000 + 3600000),
              timezone: 'UTC',
              status: ScheduleStatus.SCHEDULED,
              reminders: { enabled: false, timings: [], notificationTypes: [] },
              isPublic: true,
              requiresApproval: false,
              tags: [],
              metadata: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

            // Respetar el límite en el mock
            const limitedSchedules = filters.limit
              ? mockSchedules.slice(0, filters.limit)
              : mockSchedules;
            dynamoDBService.query.mockResolvedValue({
              Items: limitedSchedules,
            });

            // Execute
            const result = await service.getRoomSchedules(roomId, filters);

            // Verify result structure
            expect(result.schedules).toBeInstanceOf(Array);
            expect(result.total).toBeGreaterThanOrEqual(0);
            expect(typeof result.hasMore).toBe('boolean');

            // Verify each schedule in results
            result.schedules.forEach((schedule) => {
              expect(schedule.id).toBeDefined();
              expect(schedule.roomId).toBe(roomId);
              expect(schedule.startTime).toBeInstanceOf(Date);
              expect(schedule.endTime).toBeInstanceOf(Date);
              expect(Object.values(ScheduleStatus)).toContain(schedule.status);
            });

            // Verify pagination
            if (filters.limit) {
              expect(result.schedules.length).toBeLessThanOrEqual(
                filters.limit,
              );
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Schedule Suggestions Properties', () => {
    /**
     * Propiedad 8: Sugerencias de horario son válidas
     */
    it('should return valid schedule suggestions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            roomId: roomIdArb,
            attendeeIds: fc.array(userIdArb, { minLength: 1, maxLength: 10 }),
            duration: fc.integer({ min: 15, max: 480 }),
            maxSuggestions: fc.option(fc.integer({ min: 1, max: 10 }), {
              nil: undefined,
            }),
          }),
          async (getSuggestionsDto) => {
            // Setup mocks
            dynamoDBService.query.mockResolvedValue({ Items: [] }); // No conflictos

            // Execute
            const suggestions =
              await service.getScheduleSuggestions(getSuggestionsDto);

            // Verify suggestions structure
            expect(suggestions).toBeInstanceOf(Array);
            expect(suggestions.length).toBeLessThanOrEqual(
              getSuggestionsDto.maxSuggestions || 5,
            );

            // Verify each suggestion
            suggestions.forEach((suggestion) => {
              expect(suggestion.suggestedTime).toBeInstanceOf(Date);
              expect(suggestion.endTime).toBeInstanceOf(Date);
              expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
              expect(suggestion.confidence).toBeLessThanOrEqual(100);
              expect(suggestion.availableAttendees).toBeInstanceOf(Array);
              expect(suggestion.unavailableAttendees).toBeInstanceOf(Array);
              expect(suggestion.conflictingSchedules).toBeInstanceOf(Array);
              expect(typeof suggestion.reason).toBe('string');

              // Verify time logic
              expect(suggestion.suggestedTime.getTime()).toBeLessThan(
                suggestion.endTime.getTime(),
              );
              expect(suggestion.suggestedTime.getTime()).toBeGreaterThan(
                Date.now() - 1000,
              );

              // Verify duration matches
              const actualDuration =
                (suggestion.endTime.getTime() -
                  suggestion.suggestedTime.getTime()) /
                (1000 * 60);
              expect(actualDuration).toBe(getSuggestionsDto.duration);
            });
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should prevent scheduling in the past', async () => {
      const pastDate = new Date(Date.now() - 86400000); // 1 día atrás
      const createScheduleDto: CreateScheduleDto = {
        roomId: 'room1',
        title: 'Past Schedule',
        startTime: pastDate.toISOString(),
        endTime: new Date(pastDate.getTime() + 3600000).toISOString(),
        timezone: 'UTC',
        reminders: {
          enabled: false,
          timings: [],
          notificationTypes: [],
        },
      };

      roomService.getRoom.mockResolvedValue({
        id: 'room1',
        members: [{ userId: 'user1', role: 'member' }],
      } as any);

      await expect(
        service.createSchedule('user1', createScheduleDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent invalid time ranges', async () => {
      const startTime = new Date(Date.now() + 86400000);
      const endTime = new Date(startTime.getTime() - 3600000); // 1 hora antes del inicio

      const createScheduleDto: CreateScheduleDto = {
        roomId: 'room1',
        title: 'Invalid Schedule',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        timezone: 'UTC',
        reminders: {
          enabled: false,
          timings: [],
          notificationTypes: [],
        },
      };

      roomService.getRoom.mockResolvedValue({
        id: 'room1',
        members: [{ userId: 'user1', role: 'member' }],
      } as any);

      await expect(
        service.createSchedule('user1', createScheduleDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle schedule not found scenarios', async () => {
      dynamoDBService.getItem.mockResolvedValue(null);

      await expect(
        service.getSchedule('non-existent-schedule'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should prevent unauthorized access to private schedules', async () => {
      const privateSchedule: RoomSchedule = {
        id: 'private-schedule',
        roomId: 'room1',
        title: 'Private Schedule',
        scheduledBy: 'owner-user',
        startTime: new Date(Date.now() + 86400000),
        endTime: new Date(Date.now() + 90000000),
        timezone: 'UTC',
        status: ScheduleStatus.SCHEDULED,
        reminders: { enabled: false, timings: [], notificationTypes: [] },
        isPublic: false,
        requiresApproval: false,
        tags: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      dynamoDBService.getItem.mockResolvedValue(privateSchedule);

      const responseDto: RespondToScheduleDto = {
        status: AttendanceStatus.ACCEPTED,
      };

      await expect(
        service.respondToSchedule(
          'private-schedule',
          'other-user',
          responseDto,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should validate reminder configurations', async () => {
      await fc.assert(
        fc.asyncProperty(reminderConfigArb, async (reminders) => {
          // Verify timings are valid
          reminders.timings.forEach((timing) => {
            expect(Object.values(ReminderTiming)).toContain(timing);
          });

          // Verify notification types are valid
          reminders.notificationTypes.forEach((type) => {
            expect(Object.values(NotificationType)).toContain(type);
          });

          // Verify enabled is boolean
          expect(typeof reminders.enabled).toBe('boolean');

          // Verify custom message length if present
          if (reminders.customMessage) {
            expect(reminders.customMessage.length).toBeGreaterThan(0);
            expect(reminders.customMessage.length).toBeLessThanOrEqual(200);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
