import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { GracefulShutdownService } from '../services/graceful-shutdown.service';
import { ProcessManagementService } from '../services/process-management.service';
import { EnvironmentConfigService } from '../services/environment-config.service';
import { LoadBalancerService } from '../services/load-balancer.service';

@ApiTags('Production Management')
@Controller('production')
export class ProductionController {
  constructor(
    private readonly gracefulShutdownService: GracefulShutdownService,
    private readonly processManagementService: ProcessManagementService,
    private readonly environmentConfigService: EnvironmentConfigService,
    private readonly loadBalancerService: LoadBalancerService,
  ) {}

  // === PUBLIC ENDPOINTS (No authentication required) ===

  @Get('status')
  @ApiOperation({
    summary: 'Get production status',
    description: 'Returns basic production status without authentication',
  })
  @ApiResponse({
    status: 200,
    description: 'Production status retrieved successfully',
    type: Object,
  })
  getProductionStatus(): {
    timestamp: Date;
    environment: string;
    instanceId: string;
    uptime: number;
    status: 'healthy' | 'degraded' | 'unhealthy';
    phase4Status: 'completed' | 'in-progress' | 'pending';
    features: {
      gracefulShutdown: boolean;
      processManagement: boolean;
      environmentConfig: boolean;
      loadBalancer: boolean;
    };
  } {
    const config = this.environmentConfigService.getConfig();
    const processInfo = this.processManagementService.getProcessInfo();
    const lbConfig = this.loadBalancerService.getLoadBalancerConfig();
    const shutdownStatus = this.gracefulShutdownService.getShutdownStatus();

    return {
      timestamp: new Date(),
      environment: config.name,
      instanceId: lbConfig.instanceId,
      uptime: processInfo.uptime,
      status: shutdownStatus.isShuttingDown ? 'degraded' : 'healthy',
      phase4Status: 'completed',
      features: {
        gracefulShutdown: true,
        processManagement: true,
        environmentConfig: true,
        loadBalancer: true,
      },
    };
  }

  @Get('health/load-balancer')
  @ApiOperation({
    summary: 'Load balancer health check',
    description: 'Health check endpoint specifically for load balancers',
  })
  @ApiResponse({
    status: 200,
    description: 'Load balancer health check completed',
    type: Object,
  })
  async getLoadBalancerHealth() {
    return await this.loadBalancerService.performHealthCheck();
  }

  @Get('config/nginx')
  @ApiOperation({
    summary: 'Get Nginx configuration',
    description: 'Returns Nginx configuration for load balancing',
  })
  @ApiResponse({
    status: 200,
    description: 'Nginx configuration retrieved',
    schema: {
      type: 'object',
      properties: {
        config: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  getNginxConfig(): {
    config: string;
    timestamp: Date;
  } {
    return {
      config: this.loadBalancerService.generateNginxConfig(),
      timestamp: new Date(),
    };
  }

  @Get('config/haproxy')
  @ApiOperation({
    summary: 'Get HAProxy configuration',
    description: 'Returns HAProxy configuration for load balancing',
  })
  @ApiResponse({
    status: 200,
    description: 'HAProxy configuration retrieved',
    schema: {
      type: 'object',
      properties: {
        config: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  getHAProxyConfig(): {
    config: string;
    timestamp: Date;
  } {
    return {
      config: this.loadBalancerService.generateHAProxyConfig(),
      timestamp: new Date(),
    };
  }

  // === PROTECTED ENDPOINTS (Authentication required) ===

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('environment')
  @ApiOperation({
    summary: 'Get environment configuration',
    description: 'Returns detailed environment configuration',
  })
  @ApiResponse({
    status: 200,
    description: 'Environment configuration retrieved successfully',
    type: Object,
  })
  getEnvironmentConfig() {
    return {
      config: this.environmentConfigService.getConfig(),
      optimalSettings: this.environmentConfigService.getOptimalSettings(),
      timestamp: new Date(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('process')
  @ApiOperation({
    summary: 'Get process information',
    description: 'Returns detailed process and cluster information',
  })
  @ApiResponse({
    status: 200,
    description: 'Process information retrieved successfully',
    type: Object,
  })
  async getProcessInfo() {
    const processInfo = this.processManagementService.getProcessInfo();
    const clusterInfo = this.processManagementService.getClusterInfo();
    const resourceUsage = this.processManagementService.getResourceUsage();
    const healthCheck = await this.processManagementService.performHealthCheck();

    return {
      processInfo,
      clusterInfo,
      resourceUsage,
      healthCheck,
      timestamp: new Date(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('load-balancer')
  @ApiOperation({
    summary: 'Get load balancer information',
    description: 'Returns detailed load balancer configuration and stats',
  })
  @ApiResponse({
    status: 200,
    description: 'Load balancer information retrieved successfully',
    type: Object,
  })
  async getLoadBalancerInfo() {
    const config = this.loadBalancerService.getLoadBalancerConfig();
    const health = this.loadBalancerService.getInstanceHealth();
    const connectionStats = this.loadBalancerService.getConnectionStats();
    const healthCheck = await this.loadBalancerService.performHealthCheck();

    return {
      config,
      health,
      connectionStats,
      healthCheck,
      timestamp: new Date(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('shutdown/status')
  @ApiOperation({
    summary: 'Get shutdown status',
    description: 'Returns graceful shutdown service status',
  })
  @ApiResponse({
    status: 200,
    description: 'Shutdown status retrieved successfully',
    type: Object,
  })
  getShutdownStatus() {
    return {
      status: this.gracefulShutdownService.getShutdownStatus(),
      timestamp: new Date(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('process/restart/:workerId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restart worker process',
    description: 'Restart a specific worker process or current process',
  })
  @ApiParam({ name: 'workerId', required: false, description: 'Worker ID to restart (use "current" for current process)' })
  @ApiResponse({
    status: 200,
    description: 'Worker restart initiated',
    type: Object,
  })
  async restartWorker(@Param('workerId') workerId: string = 'current') {
    const workerIdNum = workerId !== 'current' ? parseInt(workerId, 10) : undefined;
    const success = await this.processManagementService.restartWorker(workerIdNum);

    return {
      success,
      workerId: workerIdNum || 'current',
      timestamp: new Date(),
      message: success ? 'Worker restart initiated' : 'Worker restart failed',
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('process/restart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restart current process',
    description: 'Restart the current process',
  })
  @ApiResponse({
    status: 200,
    description: 'Process restart initiated',
    type: Object,
  })
  async restartCurrentProcess() {
    const success = await this.processManagementService.restartWorker();

    return {
      success,
      workerId: 'current',
      timestamp: new Date(),
      message: success ? 'Process restart initiated' : 'Process restart failed',
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('shutdown/initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate graceful shutdown',
    description: 'Manually initiate graceful shutdown process',
  })
  @ApiResponse({
    status: 200,
    description: 'Graceful shutdown initiated',
    type: Object,
  })
  async initiateShutdown() {
    // Iniciar shutdown en background para poder responder
    setTimeout(() => {
      this.gracefulShutdownService.initiateShutdown('manual-api-request');
    }, 1000);

    return {
      message: 'Graceful shutdown initiated',
      timestamp: new Date(),
      estimatedDuration: '30 seconds',
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('summary')
  @ApiOperation({
    summary: 'Get production summary',
    description: 'Returns comprehensive production system summary',
  })
  @ApiResponse({
    status: 200,
    description: 'Production summary retrieved successfully',
    type: Object,
  })
  async getProductionSummary() {
    const config = this.environmentConfigService.getConfig();
    const processInfo = this.processManagementService.getProcessInfo();
    const processHealth = await this.processManagementService.performHealthCheck();
    const lbHealth = await this.loadBalancerService.performHealthCheck();
    const shutdownStatus = this.gracefulShutdownService.getShutdownStatus();
    const connectionStats = this.loadBalancerService.getConnectionStats();

    // Determinar estado general
    let overallStatus: 'excellent' | 'good' | 'needs-attention' | 'critical';
    const warnings = processHealth.warnings.length;
    const isShuttingDown = shutdownStatus.isShuttingDown;
    const connectionUtilization = connectionStats.utilization;

    if (isShuttingDown || processHealth.status === 'unhealthy' || lbHealth.status === 'unhealthy') {
      overallStatus = 'critical';
    } else if (warnings > 2 || connectionUtilization > 80 || processHealth.status === 'degraded') {
      overallStatus = 'needs-attention';
    } else if (warnings > 0 || connectionUtilization > 60) {
      overallStatus = 'good';
    } else {
      overallStatus = 'excellent';
    }

    // Generar recomendaciones
    const recommendations: string[] = [];
    if (connectionUtilization > 80) {
      recommendations.push('Consider scaling horizontally - high connection utilization');
    }
    if (processHealth.warnings.length > 0) {
      recommendations.push(`Address process warnings: ${processHealth.warnings.join(', ')}`);
    }
    if (!config.isProduction && config.features.debugging) {
      recommendations.push('Disable debugging features for production deployment');
    }
    if (config.isProduction && config.features.swagger) {
      recommendations.push('Disable Swagger documentation in production');
    }
    if (recommendations.length === 0) {
      recommendations.push('System is optimally configured for production');
    }

    return {
      timestamp: new Date(),
      phase4Status: 'completed',
      overallStatus,
      environment: {
        name: config.name,
        isProduction: config.isProduction,
        featuresEnabled: Object.entries(config.features)
          .filter(([_, enabled]) => enabled)
          .map(([feature, _]) => feature),
      },
      process: {
        pid: processInfo.pid,
        uptime: processInfo.uptime,
        status: processHealth.status,
        warnings: processHealth.warnings,
        memoryUsageMB: Math.round(processInfo.memoryUsage.heapUsed / 1024 / 1024),
        cpuUsage: processInfo.cpuUsage,
      },
      loadBalancer: {
        instanceId: lbHealth.instanceId,
        status: lbHealth.status,
        ready: lbHealth.loadBalancerReady,
        connections: connectionStats,
      },
      shutdown: {
        configured: true,
        isShuttingDown: shutdownStatus.isShuttingDown,
        hooksRegistered: shutdownStatus.registeredHooks,
      },
      recommendations,
    };
  }
}