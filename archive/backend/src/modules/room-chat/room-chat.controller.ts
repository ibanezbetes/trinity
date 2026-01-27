import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomChatService } from './room-chat.service';
import {
  SendMessageDto,
  EditMessageDto,
  ChatMessageFiltersDto,
  CreateChatConfigDto,
  UpdateChatConfigDto,
  CreateThreadDto,
  ChatModerationActionDto,
  UpdateAutoModerationDto,
  ChatNotificationConfigDto,
  TypingStatusDto,
} from './dto/room-chat.dto';
import {
  ChatMessage,
  ChatSearchResult,
  RoomChatConfig,
  RoomChatStats,
  ChatThread,
  ChatModerationAction,
  ChatAutoModerationConfig,
  ChatNotificationConfig,
  TypingStatus,
} from '../../domain/entities/room-chat.entity';

@ApiTags('Room Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rooms/:roomId/chat')
export class RoomChatController {
  constructor(private readonly roomChatService: RoomChatService) {}

  /**
   * Enviar mensaje de chat
   */
  @Post('messages')
  @ApiOperation({ summary: 'Enviar mensaje de chat' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 201,
    description: 'Mensaje enviado exitosamente',
    type: Object,
  })
  @ApiResponse({ status: 403, description: 'Sin permisos para chatear' })
  @ApiResponse({
    status: 400,
    description: 'Mensaje inválido o límites excedidos',
  })
  async sendMessage(
    @Param('roomId') roomId: string,
    @Body() sendMessageDto: SendMessageDto,
    @Request() req: any,
  ): Promise<ChatMessage> {
    const { userId, username } = req.user;
    return this.roomChatService.sendMessage(
      roomId,
      userId,
      username,
      sendMessageDto,
    );
  }

  /**
   * Obtener mensajes de chat con filtros
   */
  @Get('messages')
  @ApiOperation({ summary: 'Obtener mensajes de chat' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filtrar por usuario',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filtrar por tipo de mensaje',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filtrar por estado',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Fecha desde (ISO)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'Fecha hasta (ISO)',
  })
  @ApiQuery({
    name: 'searchText',
    required: false,
    description: 'Buscar en contenido',
  })
  @ApiQuery({
    name: 'hasAttachments',
    required: false,
    type: Boolean,
    description: 'Con adjuntos',
  })
  @ApiQuery({
    name: 'hasReactions',
    required: false,
    type: Boolean,
    description: 'Con reacciones',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de resultados',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Offset para paginación',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Campo para ordenar',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    description: 'Orden (asc/desc)',
  })
  @ApiResponse({
    status: 200,
    description: 'Mensajes obtenidos exitosamente',
    type: Object,
  })
  async getMessages(
    @Param('roomId') roomId: string,
    @Query() filters: ChatMessageFiltersDto,
    @Request() req: any,
  ): Promise<ChatSearchResult> {
    const { userId } = req.user;
    return this.roomChatService.getMessages(roomId, userId, filters);
  }

  /**
   * Editar mensaje de chat
   */
  @Put('messages/:messageId')
  @ApiOperation({ summary: 'Editar mensaje de chat' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'messageId', description: 'ID del mensaje' })
  @ApiResponse({
    status: 200,
    description: 'Mensaje editado exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: 403,
    description: 'Sin permisos para editar el mensaje',
  })
  @ApiResponse({ status: 404, description: 'Mensaje no encontrado' })
  async editMessage(
    @Param('roomId') roomId: string,
    @Param('messageId') messageId: string,
    @Body() editMessageDto: EditMessageDto,
    @Request() req: any,
  ): Promise<ChatMessage> {
    const { userId } = req.user;
    return this.roomChatService.editMessage(
      roomId,
      messageId,
      userId,
      editMessageDto,
    );
  }

  /**
   * Eliminar mensaje de chat
   */
  @Delete('messages/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar mensaje de chat' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'messageId', description: 'ID del mensaje' })
  @ApiResponse({ status: 204, description: 'Mensaje eliminado exitosamente' })
  @ApiResponse({
    status: 403,
    description: 'Sin permisos para eliminar el mensaje',
  })
  @ApiResponse({ status: 404, description: 'Mensaje no encontrado' })
  async deleteMessage(
    @Param('roomId') roomId: string,
    @Param('messageId') messageId: string,
    @Request() req: any,
  ): Promise<void> {
    const { userId } = req.user;
    return this.roomChatService.deleteMessage(roomId, messageId, userId);
  }

  /**
   * Agregar reacción a mensaje
   */
  @Post('messages/:messageId/reactions')
  @ApiOperation({ summary: 'Agregar reacción a mensaje' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'messageId', description: 'ID del mensaje' })
  @ApiResponse({
    status: 201,
    description: 'Reacción agregada exitosamente',
    type: Object,
  })
  @ApiResponse({ status: 403, description: 'Sin permisos para reaccionar' })
  async addReaction(
    @Param('roomId') roomId: string,
    @Param('messageId') messageId: string,
    @Body('emoji') emoji: string,
    @Request() req: any,
  ): Promise<ChatMessage> {
    const { userId } = req.user;
    return this.roomChatService.addReaction(roomId, messageId, userId, emoji);
  }

  /**
   * Configurar chat de sala
   */
  @Post('config')
  @ApiOperation({ summary: 'Configurar chat de sala' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 201,
    description: 'Configuración creada exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: 403,
    description: 'Sin permisos para configurar chat',
  })
  async createChatConfig(
    @Param('roomId') roomId: string,
    @Body() configDto: CreateChatConfigDto,
    @Request() req: any,
  ): Promise<RoomChatConfig> {
    const { userId } = req.user;
    return this.roomChatService.configureChatConfig(roomId, userId, configDto);
  }

  /**
   * Actualizar configuración de chat
   */
  @Put('config')
  @ApiOperation({ summary: 'Actualizar configuración de chat' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 200,
    description: 'Configuración actualizada exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: 403,
    description: 'Sin permisos para configurar chat',
  })
  async updateChatConfig(
    @Param('roomId') roomId: string,
    @Body() configDto: UpdateChatConfigDto,
    @Request() req: any,
  ): Promise<RoomChatConfig> {
    const { userId } = req.user;
    return this.roomChatService.configureChatConfig(roomId, userId, configDto);
  }

  /**
   * Obtener configuración de chat
   */
  @Get('config')
  @ApiOperation({ summary: 'Obtener configuración de chat' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 200,
    description: 'Configuración obtenida exitosamente',
    type: Object,
  })
  async getChatConfig(
    @Param('roomId') roomId: string,
  ): Promise<RoomChatConfig> {
    return this.roomChatService.getChatConfig(roomId);
  }

  /**
   * Obtener estadísticas de chat
   */
  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de chat' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas obtenidas exitosamente',
    type: Object,
  })
  async getChatStats(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<RoomChatStats> {
    const { userId } = req.user;
    return this.roomChatService.getChatStats(roomId, userId);
  }

  /**
   * Buscar mensajes
   */
  @Get('search')
  @ApiOperation({ summary: 'Buscar mensajes en el chat' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiQuery({ name: 'q', description: 'Término de búsqueda' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de resultados',
  })
  @ApiResponse({
    status: 200,
    description: 'Búsqueda completada exitosamente',
    type: Object,
  })
  async searchMessages(
    @Param('roomId') roomId: string,
    @Query('q') searchText: string,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ): Promise<ChatSearchResult> {
    const { userId } = req.user;
    const filters: ChatMessageFiltersDto = {
      searchText,
      limit: limit || 20,
      sortOrder: 'desc',
    };
    return this.roomChatService.getMessages(roomId, userId, filters);
  }

  /**
   * Obtener mensajes recientes
   */
  @Get('recent')
  @ApiOperation({ summary: 'Obtener mensajes recientes' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de resultados',
  })
  @ApiResponse({
    status: 200,
    description: 'Mensajes recientes obtenidos exitosamente',
    type: Object,
  })
  async getRecentMessages(
    @Param('roomId') roomId: string,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ): Promise<ChatSearchResult> {
    const { userId } = req.user;
    const filters: ChatMessageFiltersDto = {
      limit: limit || 50,
      sortOrder: 'desc',
    };
    return this.roomChatService.getMessages(roomId, userId, filters);
  }

  /**
   * Obtener mensajes de un usuario específico
   */
  @Get('users/:targetUserId/messages')
  @ApiOperation({ summary: 'Obtener mensajes de un usuario específico' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'targetUserId', description: 'ID del usuario objetivo' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de resultados',
  })
  @ApiResponse({
    status: 200,
    description: 'Mensajes del usuario obtenidos exitosamente',
    type: Object,
  })
  async getUserMessages(
    @Param('roomId') roomId: string,
    @Param('targetUserId') targetUserId: string,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ): Promise<ChatSearchResult> {
    const { userId } = req.user;
    const filters: ChatMessageFiltersDto = {
      userId: targetUserId,
      limit: limit || 20,
      sortOrder: 'desc',
    };
    return this.roomChatService.getMessages(roomId, userId, filters);
  }

  /**
   * Marcar como leído hasta un mensaje específico
   */
  @Post('read/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Marcar mensajes como leídos hasta un punto específico',
  })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'messageId', description: 'ID del último mensaje leído' })
  @ApiResponse({ status: 204, description: 'Mensajes marcados como leídos' })
  async markAsRead(
    @Param('roomId') roomId: string,
    @Param('messageId') messageId: string,
    @Request() req: any,
  ): Promise<void> {
    // Esta funcionalidad se puede implementar más adelante
    // Por ahora solo retornamos éxito
    return;
  }

  /**
   * Obtener conteo de mensajes no leídos
   */
  @Get('unread-count')
  @ApiOperation({ summary: 'Obtener conteo de mensajes no leídos' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiResponse({
    status: 200,
    description: 'Conteo obtenido exitosamente',
    type: Object,
  })
  async getUnreadCount(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<{ count: number }> {
    // Esta funcionalidad se puede implementar más adelante
    // Por ahora retornamos 0
    return { count: 0 };
  }

  /**
   * Reportar mensaje
   */
  @Post('messages/:messageId/report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reportar mensaje inapropiado' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'messageId', description: 'ID del mensaje' })
  @ApiResponse({ status: 204, description: 'Mensaje reportado exitosamente' })
  async reportMessage(
    @Param('roomId') roomId: string,
    @Param('messageId') messageId: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ): Promise<void> {
    // Esta funcionalidad se puede implementar más adelante
    // Por ahora solo retornamos éxito
    return;
  }

  /**
   * Obtener historial de ediciones de un mensaje
   */
  @Get('messages/:messageId/history')
  @ApiOperation({ summary: 'Obtener historial de ediciones de un mensaje' })
  @ApiParam({ name: 'roomId', description: 'ID de la sala' })
  @ApiParam({ name: 'messageId', description: 'ID del mensaje' })
  @ApiResponse({
    status: 200,
    description: 'Historial obtenido exitosamente',
    type: Array,
  })
  async getMessageHistory(
    @Param('roomId') roomId: string,
    @Param('messageId') messageId: string,
    @Request() req: any,
  ): Promise<any[]> {
    // Esta funcionalidad se puede implementar más adelante
    // Por ahora retornamos array vacío
    return [];
  }
}
