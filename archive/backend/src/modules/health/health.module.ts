import { Module } from '@nestjs/common';
import { AwsHealthController } from './aws-health.controller';
import { AwsHealthService } from './aws-health.service';

@Module({
  controllers: [AwsHealthController],
  providers: [AwsHealthService],
  exports: [AwsHealthService],
})
export class HealthModule {}