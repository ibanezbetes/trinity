import { Module } from '@nestjs/common';
import { RoomSettingsController } from './room-settings.controller';
import { RoomSettingsService } from './room-settings.service';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { RoomModule } from '../room/room.module';

@Module({
  imports: [DatabaseModule, RoomModule],
  controllers: [RoomSettingsController],
  providers: [RoomSettingsService],
  exports: [RoomSettingsService],
})
export class RoomSettingsModule {}
