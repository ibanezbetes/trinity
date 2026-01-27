import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoomModerationService } from '../../modules/room-moderation/room-moderation.service';
import { RoomPermission } from '../../domain/entities/room-moderation.entity';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Guard para verificar permisos de sala
 * Utiliza el decorador @RequirePermissions para determinar qué permisos son necesarios
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private reflector: Reflector,
    private roomModerationService: RoomModerationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      RoomPermission[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No se requieren permisos específicos
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const roomId = request.params.id || request.params.roomId || request.body.roomId;

    // 401 Unauthorized: Authentication required
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // 400 Bad Request: Missing required parameter
    if (!roomId) {
      throw new ForbiddenException('Room ID required for permission check');
    }

    try {
      // Verificar cada permiso requerido
      for (const permission of requiredPermissions) {
        await this.roomModerationService.checkPermission(
          roomId,
          user.sub,
          permission,
        );
      }

      this.logger.debug(
        `Permisos verificados para usuario ${user.sub} en sala ${roomId}: ${requiredPermissions.join(', ')}`,
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Acceso denegado para usuario ${user.sub} en sala ${roomId}: ${error.message}`,
      );
      // 403 Forbidden: Authenticated but insufficient permissions
      throw new ForbiddenException(`Insufficient permissions: ${error.message}`);
    }
  }
}
