import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIController } from './ai.controller';
import { ALIAService } from './alia.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [ConfigModule, MediaModule],
  controllers: [AIController],
  providers: [ALIAService],
  exports: [ALIAService],
})
export class AIModule {}
