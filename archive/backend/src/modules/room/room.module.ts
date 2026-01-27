import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RoomController } from './room.controller';
import { ShuffleSyncController } from './shuffle-sync.controller';
import { RoomPerformanceController } from './room-performance.controller';
import {
  InactiveMemberController,
  InactivityConfigController,
} from './inactive-member.controller';
import { RoomService } from './room.service';
import { MemberService } from './member.service';
import { ShuffleSyncService } from './shuffle-sync.service';
import { InactiveMemberService } from './inactive-member.service';
import { RoomRefreshService } from './room-refresh.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MediaModule } from '../media/media.module';
import { InteractionModule } from '../interaction/interaction.module';
import { RoomModerationModule } from '../room-moderation/room-moderation.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    forwardRef(() => RealtimeModule),
    forwardRef(() => AnalyticsModule),
    forwardRef(() => InteractionModule),
    MediaModule,
    forwardRef(() => RoomModerationModule), // Para PermissionGuard
  ],
  controllers: [
    RoomController,
    ShuffleSyncController,
    RoomPerformanceController,
    InactiveMemberController,
    InactivityConfigController,
  ],
  providers: [
    RoomService,
    MemberService,
    ShuffleSyncService,
    InactiveMemberService,
    RoomRefreshService,
  ],
  exports: [
    RoomService,
    MemberService,
    ShuffleSyncService,
    InactiveMemberService,
    RoomRefreshService,
  ],
})
export class RoomModule {}
