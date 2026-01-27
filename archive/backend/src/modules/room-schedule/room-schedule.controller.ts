import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomScheduleService } from './room-schedule.service';
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

@Controller('room-schedules')
@UseGuards(JwtAuthGuard)
export class RoomScheduleController {
  constructor(private readonly roomScheduleService: RoomScheduleService) {}

  /**
   * Crear una nueva programación de sala
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSchedule(
    @Request() req: any,
    @Body() createScheduleDto: CreateScheduleDto,
  ) {
    return this.roomScheduleService.createSchedule(
      req.user.userId,
      createScheduleDto,
    );
  }

  /**
   * Obtener programaciones de una sala específica
   */
  @Get('room/:roomId')
  async getRoomSchedules(
    @Param('roomId') roomId: string,
    @Query() filters: ScheduleFiltersDto,
  ) {
    return this.roomScheduleService.getRoomSchedules(roomId, filters);
  }

  /**
   * Obtener programaciones del usuario actual
   */
  @Get('my-schedules')
  async getMySchedules(
    @Request() req: any,
    @Query() filters: ScheduleFiltersDto,
  ) {
    return this.roomScheduleService.getUserSchedules(req.user.userId, filters);
  }

  /**
   * Obtener una programación específica
   */
  @Get(':scheduleId')
  async getSchedule(@Param('scheduleId') scheduleId: string) {
    return this.roomScheduleService.getSchedule(scheduleId);
  }

  /**
   * Actualizar una programación
   */
  @Put(':scheduleId')
  async updateSchedule(
    @Param('scheduleId') scheduleId: string,
    @Request() req: any,
    @Body() updateScheduleDto: UpdateScheduleDto,
  ) {
    return this.roomScheduleService.updateSchedule(
      scheduleId,
      req.user.userId,
      updateScheduleDto,
    );
  }

  /**
   * Eliminar una programación
   */
  @Delete(':scheduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSchedule(
    @Param('scheduleId') scheduleId: string,
    @Request() req: any,
  ) {
    // Implementar lógica de eliminación
    const schedule = await this.roomScheduleService.getSchedule(scheduleId);

    // Verificar permisos (solo el creador o admin de la sala puede eliminar)
    if (schedule.scheduledBy !== req.user.userId) {
      // Verificar si es admin de la sala (implementar según lógica de permisos)
      throw new Error('No tienes permisos para eliminar esta programación');
    }

    // Marcar como cancelada en lugar de eliminar
    return this.roomScheduleService.updateSchedule(
      scheduleId,
      req.user.userId,
      {
        status: 'cancelled' as any,
      },
    );
  }

  /**
   * Responder a una programación (asistir/declinar)
   */
  @Post(':scheduleId/respond')
  async respondToSchedule(
    @Param('scheduleId') scheduleId: string,
    @Request() req: any,
    @Body() responseDto: RespondToScheduleDto,
  ) {
    return this.roomScheduleService.respondToSchedule(
      scheduleId,
      req.user.userId,
      responseDto,
    );
  }

  /**
   * Obtener asistentes de una programación
   */
  @Get(':scheduleId/attendees')
  async getScheduleAttendees(@Param('scheduleId') scheduleId: string) {
    return this.roomScheduleService.getScheduleAttendees(scheduleId);
  }

  /**
   * Obtener sugerencias de horario
   */
  @Post('suggestions')
  async getScheduleSuggestions(
    @Body() getSuggestionsDto: GetScheduleSuggestionsDto,
  ) {
    return this.roomScheduleService.getScheduleSuggestions(getSuggestionsDto);
  }

  /**
   * Crear plantilla de programación
   */
  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  async createScheduleTemplate(
    @Request() req: any,
    @Body() createTemplateDto: CreateScheduleTemplateDto,
  ) {
    // Implementar creación de plantillas
    throw new Error('Funcionalidad de plantillas no implementada aún');
  }

  /**
   * Obtener plantillas de programación
   */
  @Get('templates')
  async getScheduleTemplates(@Request() req: any) {
    // Implementar obtención de plantillas
    throw new Error('Funcionalidad de plantillas no implementada aún');
  }

  /**
   * Configurar disponibilidad de usuario
   */
  @Post('availability')
  async setUserAvailability(
    @Request() req: any,
    @Body() availabilityDto: SetUserAvailabilityDto,
  ) {
    // Implementar configuración de disponibilidad
    throw new Error('Funcionalidad de disponibilidad no implementada aún');
  }

  /**
   * Obtener disponibilidad de usuario
   */
  @Get('availability/:userId')
  async getUserAvailability(@Param('userId') userId: string) {
    // Implementar obtención de disponibilidad
    throw new Error('Funcionalidad de disponibilidad no implementada aún');
  }

  /**
   * Configurar auto-programación
   */
  @Post('auto-schedule')
  @HttpCode(HttpStatus.CREATED)
  async createAutoScheduleConfig(
    @Request() req: any,
    @Body() autoScheduleDto: CreateAutoScheduleConfigDto,
  ) {
    // Implementar auto-programación
    throw new Error('Funcionalidad de auto-programación no implementada aún');
  }

  /**
   * Obtener estadísticas de programación
   */
  @Get('stats')
  async getScheduleStats(@Query() queryDto: ScheduleStatsQueryDto) {
    // Implementar estadísticas
    throw new Error('Funcionalidad de estadísticas no implementada aún');
  }

  /**
   * Modificar instancia específica de programación recurrente
   */
  @Put(':scheduleId/instances/:instanceId')
  async modifyScheduleInstance(
    @Param('scheduleId') scheduleId: string,
    @Param('instanceId') instanceId: string,
    @Request() req: any,
    @Body() modifyDto: ModifyScheduleInstanceDto,
  ) {
    // Implementar modificación de instancias
    throw new Error('Funcionalidad de instancias no implementada aún');
  }

  /**
   * Obtener instancias de una programación recurrente
   */
  @Get(':scheduleId/instances')
  async getScheduleInstances(
    @Param('scheduleId') scheduleId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Implementar obtención de instancias
    throw new Error('Funcionalidad de instancias no implementada aún');
  }

  /**
   * Obtener programaciones públicas
   */
  @Get('public/schedules')
  async getPublicSchedules(@Query() filters: ScheduleFiltersDto) {
    // Filtrar solo programaciones públicas
    const publicFilters = { ...filters, isPublic: true };

    // Implementar búsqueda global de programaciones públicas
    throw new Error(
      'Funcionalidad de programaciones públicas no implementada aún',
    );
  }

  /**
   * Buscar programaciones por texto
   */
  @Get('search')
  async searchSchedules(
    @Query('q') query: string,
    @Query() filters: ScheduleFiltersDto,
  ) {
    // Implementar búsqueda por texto
    throw new Error('Funcionalidad de búsqueda no implementada aún');
  }

  /**
   * Obtener programaciones próximas
   */
  @Get('upcoming')
  async getUpcomingSchedules(
    @Request() req: any,
    @Query('days') days: number = 7,
  ) {
    const filters: ScheduleFiltersDto = {
      userId: req.user.userId,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
      status: 'scheduled' as any,
      limit: 50,
    };

    return this.roomScheduleService.getUserSchedules(req.user.userId, filters);
  }

  /**
   * Marcar asistencia a una programación
   */
  @Post(':scheduleId/checkin')
  async checkInToSchedule(
    @Param('scheduleId') scheduleId: string,
    @Request() req: any,
  ) {
    // Implementar check-in
    throw new Error('Funcionalidad de check-in no implementada aún');
  }

  /**
   * Marcar salida de una programación
   */
  @Post(':scheduleId/checkout')
  async checkOutFromSchedule(
    @Param('scheduleId') scheduleId: string,
    @Request() req: any,
  ) {
    // Implementar check-out
    throw new Error('Funcionalidad de check-out no implementada aún');
  }
}
