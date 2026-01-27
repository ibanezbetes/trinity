import { Module, forwardRef } from '@nestjs/common';
import { RoomScheduleController } from './room-schedule.controller';
import { RoomScheduleService } from './room-schedule.service';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { RoomModule } from '../room/room.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    DatabaseModule,
    RoomModule,
    AnalyticsModule, // Para tracking de eventos
    forwardRef(() => RealtimeModule), // Para notificaciones en tiempo real
  ],
  controllers: [RoomScheduleController],
  providers: [RoomScheduleService],
  exports: [RoomScheduleService],
})
export class RoomScheduleModule {}
