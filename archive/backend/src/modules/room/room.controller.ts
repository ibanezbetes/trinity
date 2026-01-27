import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RoomService } from './room.service';
import { MemberService } from './member.service';
import { ShuffleSyncService } from './shuffle-sync.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  RequirePermissions,
  RequireOwner,
  RequireAdmin,
  RequireMember,
} from '../../common/decorators/permissions.decorator';
import { RoomMemberGuard } from './guards/room-member.guard';
import { RoomCreatorGuard } from './guards/room-creator.guard';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { UpdateFiltersDto } from './dto/update-filters.dto';
import { RoomPermission } from '../../domain/entities/room-moderation.entity';

@ApiTags('rooms')
@Controller('rooms')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RoomController {
  constructor(
    private roomService: RoomService,
    private memberService: MemberService,
    private shuffleSyncService: ShuffleSyncService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear una nueva sala' })
  @ApiResponse({ status: 201, description: 'Sala creada exitosamente' })
  async createRoom(@Request() req, @Body() createRoomDto: CreateRoomDto) {
    // 1. Crear la sala
    const room = await this.roomService.createRoom(req.user.sub, createRoomDto);
    
    // 2. Generar la lista de películas basada en los filtros
    try {
      await this.shuffleSyncService.generateMasterListAndShuffledLists(room.id);
    } catch (error) {
      // Log el error pero no fallar la creación de la sala
      console.error('Error generando lista de películas:', error.message);
    }
    
    // 3. Devolver la sala actualizada con la lista
    const updatedRoom = await this.roomService.getRoomById(room.id);
    return updatedRoom || room;
  }

  @Get()
  @ApiOperation({ summary: 'Obtener salas del usuario' })
  @ApiResponse({ status: 200, description: 'Lista de salas del usuario' })
  async getUserRooms(@Request() req) {
    return this.roomService.getUserRooms(req.user.sub);
  }

  @Get(':id')
  @RequireMember()
  @UseGuards(PermissionGuard)
  @ApiOperation({ summary: 'Obtener detalles completos de una sala' })
  @ApiResponse({ status: 200, description: 'Detalles de la sala' })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  @ApiResponse({ status: 403, description: 'No tienes acceso a esta sala' })
  async getRoomDetails(@Request() req, @Param('id') roomId: string) {
    return this.roomService.getRoomDetails(roomId, req.user.sub);
  }

  @Get(':id/stats')
  @RequirePermissions(RoomPermission.VIEW_ANALYTICS)
  @UseGuards(PermissionGuard)
  @ApiOperation({ summary: 'Obtener estadísticas de la sala' })
  @ApiResponse({ status: 200, description: 'Estadísticas de la sala' })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  @ApiResponse({
    status: 403,
    description: 'No tienes permisos para ver estadísticas',
  })
  async getRoomStats(@Request() req, @Param('id') roomId: string) {
    return this.roomService.getRoomStats(roomId);
  }

  @Get(':id/my-progress')
  @RequireMember()
  @UseGuards(PermissionGuard)
  @ApiOperation({ summary: 'Obtener mi progreso en la sala' })
  @ApiResponse({ status: 200, description: 'Progreso del usuario en la sala' })
  async getMyProgress(@Request() req, @Param('id') roomId: string) {
    return this.memberService.getMemberProgress(roomId, req.user.sub);
  }

  @Get(':id/next-media')
  @RequireMember()
  @UseGuards(PermissionGuard)
  @ApiOperation({ summary: 'Obtener siguiente elemento multimedia para votar' })
  @ApiResponse({ status: 200, description: 'Siguiente elemento multimedia' })
  @ApiResponse({ status: 204, description: 'No hay más elementos' })
  async getNextMedia(@Request() req, @Param('id') roomId: string) {
    const nextMediaId = await this.memberService.getNextMediaForMember(
      roomId,
      req.user.sub,
    );

    if (!nextMediaId) {
      return { message: 'No hay más elementos para votar', completed: true };
    }

    return { mediaId: nextMediaId, completed: false };
  }

  @Post('join')
  @ApiOperation({ summary: 'Unirse a una sala usando código de invitación' })
  @ApiResponse({ status: 200, description: 'Unido a la sala exitosamente' })
  @ApiResponse({ status: 404, description: 'Código de invitación inválido' })
  @ApiResponse({ status: 403, description: 'No se puede unir a la sala' })
  async joinRoom(@Request() req, @Body() joinRoomDto: JoinRoomDto) {
    return this.roomService.joinRoom(req.user.sub, joinRoomDto.inviteCode);
  }

  @Delete(':id/leave')
  @RequireMember()
  @UseGuards(PermissionGuard)
  @ApiOperation({ summary: 'Abandonar una sala' })
  @ApiResponse({ status: 200, description: 'Sala abandonada exitosamente' })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  async leaveRoom(@Request() req, @Param('id') roomId: string) {
    await this.roomService.leaveRoom(req.user.sub, roomId);
    return { message: 'Sala abandonada exitosamente' };
  }

  @Put(':id/filters')
  @RequirePermissions(RoomPermission.MODIFY_SETTINGS)
  @UseGuards(PermissionGuard)
  @ApiOperation({ summary: 'Actualizar filtros de la sala' })
  @ApiResponse({
    status: 200,
    description: 'Filtros actualizados exitosamente',
  })
  @ApiResponse({
    status: 403,
    description: 'No tienes permisos para modificar configuración',
  })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  async updateRoomFilters(
    @Request() req,
    @Param('id') roomId: string,
    @Body() updateFiltersDto: UpdateFiltersDto,
  ) {
    return this.roomService.updateRoomFilters(
      req.user.sub,
      roomId,
      updateFiltersDto.filters,
    );
  }

  @Post(':id/regenerate-invite')
  @RequirePermissions(RoomPermission.INVITE_MEMBERS)
  @UseGuards(PermissionGuard)
  @ApiOperation({ summary: 'Regenerar código de invitación' })
  @ApiResponse({ status: 200, description: 'Código regenerado exitosamente' })
  @ApiResponse({
    status: 403,
    description: 'No tienes permisos para gestionar invitaciones',
  })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  async regenerateInviteCode(@Request() req, @Param('id') roomId: string) {
    const newCode = await this.roomService.regenerateInviteCode(
      req.user.sub,
      roomId,
    );
    return { inviteCode: newCode, message: 'Código de invitación regenerado' };
  }

  @Delete(':id')
  @RequireOwner()
  @UseGuards(PermissionGuard)
  @ApiOperation({ summary: 'Eliminar sala (solo propietario)' })
  @ApiResponse({ status: 200, description: 'Sala eliminada exitosamente' })
  @ApiResponse({
    status: 403,
    description: 'Solo el propietario puede eliminar la sala',
  })
  @ApiResponse({ status: 404, description: 'Sala no encontrada' })
  async deleteRoom(@Request() req, @Param('id') roomId: string) {
    await this.roomService.deleteRoom(req.user.sub, roomId);
    return { message: 'Sala eliminada exitosamente' };
  }
}
