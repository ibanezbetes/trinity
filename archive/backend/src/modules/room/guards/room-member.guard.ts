import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { RoomService } from '../room.service';

@Injectable()
export class RoomMemberGuard implements CanActivate {
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

    const canAccess = await this.roomService.canUserAccessRoom(userId, roomId);

    if (!canAccess) {
      throw new ForbiddenException('No tienes acceso a esta sala');
    }

    return true;
  }
}
