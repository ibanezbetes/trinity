import { Module, forwardRef } from '@nestjs/common';
import { InteractionController } from './interaction.controller';
import { InteractionService } from './interaction.service';
import { RoomModule } from '../room/room.module';
import { MediaModule } from '../media/media.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    forwardRef(() => RoomModule),
    MediaModule,
    RealtimeModule,
    forwardRef(() => AnalyticsModule),
  ],
  controllers: [InteractionController],
  providers: [InteractionService],
  exports: [InteractionService],
})
export class InteractionModule {}
