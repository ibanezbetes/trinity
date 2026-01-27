import { Module } from '@nestjs/common';
import { SemanticAnalysisService } from './semantic-analysis.service';
import { SemanticAnalysisController } from './semantic-analysis.controller';
import { MediaModule } from '../media/media.module';
import { InteractionModule } from '../interaction/interaction.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';

@Module({
  imports: [DatabaseModule, MediaModule, InteractionModule],
  providers: [SemanticAnalysisService],
  controllers: [SemanticAnalysisController],
  exports: [SemanticAnalysisService],
})
export class SemanticAnalysisModule {}
