/**
 * Room Domain Module
 * Provides room management services and interfaces
 */

import { Module } from '@nestjs/common';
import { RoomService } from './services/room.service';

@Module({
  providers: [
    {
      provide: 'IRoomService',
      useClass: RoomService,
    },
    RoomService,
  ],
  exports: [
    'IRoomService',
    RoomService,
  ],
})
export class RoomModule {}