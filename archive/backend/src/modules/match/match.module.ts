import { Module, forwardRef } from '@nestjs/common';
import { MatchController, UserMatchController } from './match.controller';
import { MatchService } from './match.service';
import { RoomModule } from '../room/room.module';
import { MediaModule } from '../media/media.module';
import { InteractionModule } from '../interaction/interaction.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    RoomModule,
    MediaModule,
    InteractionModule,
    RealtimeModule,
    forwardRef(() => AnalyticsModule),
  ],
  controllers: [MatchController, UserMatchController],
  providers: [MatchService],
  exports: [MatchService],
})
export class MatchModule {}
