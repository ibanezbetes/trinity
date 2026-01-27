import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RoomAutomationService } from './room-automation.service';
import { RoomAutomationController } from './room-automation.controller';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { RoomModule } from '../room/room.module';
import { InteractionModule } from '../interaction/interaction.module';
import { MediaModule } from '../media/media.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    forwardRef(() => AnalyticsModule),
    forwardRef(() => RoomModule),
    forwardRef(() => InteractionModule),
    forwardRef(() => MediaModule),
    forwardRef(() => RealtimeModule),
  ],
  controllers: [RoomAutomationController],
  providers: [RoomAutomationService],
  exports: [RoomAutomationService],
})
export class RoomAutomationModule {}
