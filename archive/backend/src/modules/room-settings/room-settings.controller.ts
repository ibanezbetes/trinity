import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomSettingsService } from './room-settings.service';
import {
  UpdateRoomSettingsDto,
  RoomSettingsResponseDto,
  SettingsRecommendationsResponseDto,
} from './dto/room-settings.dto';

@ApiTags('Room Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rooms/:roomId/settings')
export class RoomSettingsController {
  constructor(private readonly roomSettingsService: RoomSettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Obtener configuraciones de sala',
    description: 'Obtiene las configuraciones avanzadas de una sala específica',
  })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 200,
    description: 'Configuraciones obtenidas exitosamente',
    type: RoomSettingsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  @ApiResponse({ status: 403, description: 'Sin acceso a la sala' })
  async getRoomSettings(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<RoomSettingsResponseDto> {
    const userId = req.user.sub;
    const settings = await this.roomSettingsService.getRoomSettings(
      roomId,
      userId,
    );

    return {
      roomId,
      settings,
      updatedAt: new Date(),
      updatedBy: userId,
    };
  }

  @Put()
  @ApiOperation({
    summary: 'Actualizar configuraciones de sala',
    description:
      'Actualiza las configuraciones avanzadas de una sala. Solo administradores pueden realizar esta acción.',
  })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 200,
    description: 'Configuraciones actualizadas exitosamente',
    type: RoomSettingsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Configuraciones inválidas' })
  @ApiResponse({ status: 403, description: 'Sin permisos de administrador' })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  async updateRoomSettings(
    @Param('roomId') roomId: string,
    @Body() updateDto: UpdateRoomSettingsDto,
    @Request() req: any,
  ): Promise<RoomSettingsResponseDto> {
    const userId = req.user.sub;
    const settings = await this.roomSettingsService.updateRoomSettings(
      roomId,
      userId,
      updateDto,
    );

    return {
      roomId,
      settings,
      updatedAt: new Date(),
      updatedBy: userId,
    };
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restablecer configuraciones por defecto',
    description:
      'Restablece las configuraciones de la sala a los valores por defecto. Solo administradores pueden realizar esta acción.',
  })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 200,
    description: 'Configuraciones restablecidas exitosamente',
    type: RoomSettingsResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Sin permisos de administrador' })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  async resetRoomSettings(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<RoomSettingsResponseDto> {
    const userId = req.user.sub;
    const settings = await this.roomSettingsService.resetRoomSettings(
      roomId,
      userId,
    );

    return {
      roomId,
      settings,
      updatedAt: new Date(),
      updatedBy: userId,
    };
  }

  @Get('recommendations')
  @ApiOperation({
    summary: 'Obtener recomendaciones de configuración',
    description:
      'Obtiene recomendaciones inteligentes para optimizar las configuraciones de la sala basadas en su uso y características',
  })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 200,
    description: 'Recomendaciones generadas exitosamente',
    type: SettingsRecommendationsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  @ApiResponse({ status: 403, description: 'Sin acceso a la sala' })
  async getSettingsRecommendations(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<SettingsRecommendationsResponseDto> {
    const userId = req.user.sub;
    return await this.roomSettingsService.getSettingsRecommendations(
      roomId,
      userId,
    );
  }

  @Get('defaults')
  @ApiOperation({
    summary: 'Obtener configuraciones por defecto',
    description:
      'Obtiene las configuraciones por defecto del sistema para referencia',
  })
  @ApiResponse({
    status: 200,
    description: 'Configuraciones por defecto obtenidas exitosamente',
  })
  async getDefaultSettings() {
    return {
      settings: this.roomSettingsService.getDefaultSettings(),
      description: 'Configuraciones por defecto del sistema',
    };
  }
}
