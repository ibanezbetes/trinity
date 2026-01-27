import { Module } from '@nestjs/common';
import { RoomTemplateService } from './room-template.service';
import { RoomTemplateController } from './room-template.controller';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { RoomModule } from '../room/room.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [DatabaseModule, RoomModule, AnalyticsModule],
  controllers: [RoomTemplateController],
  providers: [RoomTemplateService],
  exports: [RoomTemplateService],
})
export class RoomTemplateModule {}
