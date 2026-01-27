import { Module, forwardRef } from '@nestjs/common';
import { RoomChatService } from './room-chat.service';
import { RoomChatController } from './room-chat.controller';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PermissionModule } from '../permission/permission.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => RealtimeModule),
    forwardRef(() => PermissionModule),
  ],
  controllers: [RoomChatController],
  providers: [RoomChatService],
  exports: [RoomChatService],
})
export class RoomChatModule {}
