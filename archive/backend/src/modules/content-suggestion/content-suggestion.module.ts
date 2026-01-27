import { Module, forwardRef } from '@nestjs/common';
import { ContentSuggestionService } from './content-suggestion.service';
import { ContentSuggestionController } from './content-suggestion.controller';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PermissionModule } from '../permission/permission.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => RealtimeModule),
    forwardRef(() => PermissionModule),
  ],
  controllers: [ContentSuggestionController],
  providers: [ContentSuggestionService],
  exports: [ContentSuggestionService],
})
export class ContentSuggestionModule {}
