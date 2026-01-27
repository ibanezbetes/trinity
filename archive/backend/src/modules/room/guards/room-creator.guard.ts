import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { RoomService } from '../room.service';

@Injectable()
export class RoomCreatorGuard implements CanActivate {
  constructor(private roomService: RoomService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // Support both 'id' and 'sub' for user identification (Cognito uses 'sub')
    const userId = request.user?.sub || request.user?.id;
    // Support both 'id' and 'roomId' for room identification
    const roomId = request.params?.roomId || request.params?.id;

    if (!userId || !roomId) {
      throw new ForbiddenException('Usuario o sala no identificados');
    }

    const room = await this.roomService.getRoomById(roomId);

    if (!room) {
      throw new ForbiddenException('Sala no encontrada');
    }

    if (room.creatorId !== userId) {
      throw new ForbiddenException(
        'Solo el creador de la sala puede realizar esta acción',
      );
    }

    return true;
  }
}
