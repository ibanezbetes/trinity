import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { GracefulShutdownService } from './services/graceful-shutdown.service';
import { ProcessManagementService } from './services/process-management.service';
import { EnvironmentConfigService } from './services/environment-config.service';
import { LoadBalancerService } from './services/load-balancer.service';
import { ProductionController } from './controllers/production.controller';

@Module({
  imports: [
    ConfigModule,
    MonitoringModule,
  ],
  controllers: [ProductionController],
  providers: [
    EnvironmentConfigService, // Inicializar primero
    ProcessManagementService,
    LoadBalancerService,
    GracefulShutdownService, // Inicializar al final
  ],
  exports: [
    EnvironmentConfigService,
    ProcessManagementService,
    LoadBalancerService,
    GracefulShutdownService,
  ],
})
export class ProductionModule {
  constructor(
    private readonly environmentConfigService: EnvironmentConfigService,
    private readonly processManagementService: ProcessManagementService,
    private readonly loadBalancerService: LoadBalancerService,
    private readonly gracefulShutdownService: GracefulShutdownService,
  ) {
    // Log de inicialización del módulo de producción
    console.log('🏭 ProductionModule initialized');
    console.log(`📊 Environment: ${environmentConfigService.getConfig().name}`);
    console.log(`🔧 Instance ID: ${loadBalancerService.getLoadBalancerConfig().instanceId}`);
    console.log(`⚙️  Process ID: ${processManagementService.getProcessInfo().pid}`);
    console.log(`🛡️  Graceful shutdown: ${gracefulShutdownService.getShutdownStatus().registeredHooks} hooks registered`);
  }
}