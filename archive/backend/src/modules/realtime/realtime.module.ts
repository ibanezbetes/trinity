import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { AppSyncPublisher } from './appsync-publisher.service';
import { RealtimeCompatibilityService } from './realtime-compatibility.service';

@Module({
  imports: [ConfigModule],
  providers: [
    RealtimeGateway,
    RealtimeService,
    AppSyncPublisher,
    RealtimeCompatibilityService,
    // Use AppSync as the main realtime service
    {
      provide: 'RealtimeServiceCompat',
      useExisting: RealtimeCompatibilityService,
    },
  ],
  exports: [
    RealtimeGateway,
    RealtimeService,
    AppSyncPublisher,
    RealtimeCompatibilityService,
    'RealtimeServiceCompat',
  ],
})
export class RealtimeModule {}
