import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CostOptimizationService } from './cost-optimization.service';
import { CostOptimizationController } from './cost-optimization.controller';
import { AutoScalingService } from './auto-scaling.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [CostOptimizationService, AutoScalingService],
  controllers: [CostOptimizationController],
  exports: [CostOptimizationService, AutoScalingService],
})
export class CostOptimizationModule {}
