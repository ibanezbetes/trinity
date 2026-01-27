import { Module, Global } from '@nestjs/common';
import { DynamoDBService } from './dynamodb.service';
import { MultiTableService } from './multi-table.service';

@Global()
@Module({
  providers: [DynamoDBService, MultiTableService],
  exports: [DynamoDBService, MultiTableService],
})
export class DatabaseModule {}
