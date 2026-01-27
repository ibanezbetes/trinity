import { Module, forwardRef } from '@nestjs/common';
import { RoomModerationService } from './room-moderation.service';
import { RoomModerationController } from './room-moderation.controller';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { RoomModule } from '../room/room.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => RoomModule), // Para verificar membresía y acceso a salas
    forwardRef(() => RealtimeModule), // Para notificaciones en tiempo real
  ],
  controllers: [RoomModerationController],
  providers: [RoomModerationService],
  exports: [RoomModerationService], // Exportar para uso en otros módulos
})
export class RoomModerationModule {}
