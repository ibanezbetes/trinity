import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CDNService } from './cdn.service';
import { CDNController } from './cdn.controller';

@Module({
  imports: [ConfigModule],
  controllers: [CDNController],
  providers: [CDNService],
  exports: [CDNService],
})
export class CDNModule {}
