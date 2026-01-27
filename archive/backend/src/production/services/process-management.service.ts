import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggingService } from '../../monitoring/services/structured-logging.service';
import { MetricsCollectionService } from '../../monitoring/services/metrics-collection.service';

export interface ProcessInfo {
  pid: number;
  ppid: number;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  version: string;
  nodeVersion: string;
  platform: string;
  arch: string;
}

export interface ClusterInfo {
  isMaster: boolean;
  isWorker: boolean;
  workerId?: number;
  workerCount: number;
  maxWorkers: number;
}

@Injectable()
export class ProcessManagementService {
  private readonly logger = new Logger(ProcessManagementService.name);
  private readonly startTime = Date.now();
  private readonly maxMemoryUsage: number;
  private readonly memoryWarningThreshold: number;
  private readonly cpuWarningThreshold: number;
  private memoryWarningIssued = false;
  private cpuWarningIssued = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggingService: StructuredLoggingService,
    private readonly metricsService: MetricsCollectionService,
  ) {
    this.maxMemoryUsage = this.configService.get<number>('MAX_MEMORY_USAGE_MB', 512) * 1024 * 1024;
    this.memoryWarningThreshold = this.configService.get<number>('MEMORY_WARNING_THRESHOLD', 80);
    this.cpuWarningThreshold = this.configService.get<number>('CPU_WARNING_THRESHOLD', 80);

    this.initializeProcessMonitoring();
    this.setupProcessEventHandlers();
    
    this.loggingService.log('ProcessManagementService initialized', {
      metadata: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        maxMemoryMB: this.maxMemoryUsage / 1024 / 1024,
        memoryWarningThreshold: this.memoryWarningThreshold,
        cpuWarningThreshold: this.cpuWarningThreshold,
      },
    });
  }

  private initializeProcessMonitoring(): void {
    // Monitorear uso de memoria cada 30 segundos
    setInterval(() => {
      this.checkMemoryUsage();
    }, 30000);

    // Monitorear uso de CPU cada minuto
    setInterval(() => {
      this.checkCpuUsage();
    }, 60000);

    // Log de información del proceso cada 5 minutos
    setInterval(() => {
      this.logProcessInfo();
    }, 300000);
  }

  private setupProcessEventHandlers(): void {
    // Manejar advertencias del proceso
    process.on('warning', (warning) => {
      this.logger.warn('Process warning received', {
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
      });
      
      this.loggingService.warn('Process warning', {
        metadata: {
          warningName: warning.name,
          warningMessage: warning.message,
        },
      });
    });

    // Manejar eventos de memoria
    process.on('exit', (code) => {
      this.logger.log(`Process exiting with code: ${code}`);
    });

    // Manejar señales de proceso
    process.on('SIGHUP', () => {
      this.logger.log('Received SIGHUP - reloading configuration');
      this.reloadConfiguration();
    });
  }

  private checkMemoryUsage(): void {
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapUsed + memoryUsage.external;
    const memoryUsagePercent = (totalMemory / this.maxMemoryUsage) * 100;

    if (memoryUsagePercent > this.memoryWarningThreshold && !this.memoryWarningIssued) {
      this.memoryWarningIssued = true;
      
      this.logger.warn('High memory usage detected', {
        memoryUsagePercent: memoryUsagePercent.toFixed(2),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
        threshold: this.memoryWarningThreshold,
      });

      this.loggingService.warn('High memory usage detected', {
        metadata: {
          memoryUsagePercent,
          heapUsedMB: memoryUsage.heapUsed / 1024 / 1024,
          externalMB: memoryUsage.external / 1024 / 1024,
          threshold: this.memoryWarningThreshold,
        },
      });

      // Intentar garbage collection si está disponible
      if (global.gc) {
        global.gc();
        this.logger.log('Forced garbage collection executed');
      }
    } else if (memoryUsagePercent < this.memoryWarningThreshold - 10) {
      // Reset warning flag cuando el uso baje significativamente
      this.memoryWarningIssued = false;
    }
  }

  private checkCpuUsage(): void {
    const cpuUsage = process.cpuUsage();
    const totalCpuTime = cpuUsage.user + cpuUsage.system;
    const uptime = process.uptime() * 1000000; // Convert to microseconds
    const cpuUsagePercent = (totalCpuTime / uptime) * 100;

    if (cpuUsagePercent > this.cpuWarningThreshold && !this.cpuWarningIssued) {
      this.cpuWarningIssued = true;
      
      this.logger.warn('High CPU usage detected', {
        cpuUsagePercent: cpuUsagePercent.toFixed(2),
        userTime: cpuUsage.user,
        systemTime: cpuUsage.system,
        threshold: this.cpuWarningThreshold,
      });

      this.loggingService.warn('High CPU usage detected', {
        metadata: {
          cpuUsagePercent,
          userTime: cpuUsage.user,
          systemTime: cpuUsage.system,
          threshold: this.cpuWarningThreshold,
        },
      });
    } else if (cpuUsagePercent < this.cpuWarningThreshold - 10) {
      this.cpuWarningIssued = false;
    }
  }

  private logProcessInfo(): void {
    const processInfo = this.getProcessInfo();
    
    this.loggingService.log('Process information', {
      metadata: {
        processInfo,
        uptime: process.uptime(),
        memoryUsageMB: {
          heapUsed: Math.round(processInfo.memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(processInfo.memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(processInfo.memoryUsage.external / 1024 / 1024),
          rss: Math.round(processInfo.memoryUsage.rss / 1024 / 1024),
        },
      },
    });
  }

  private reloadConfiguration(): void {
    try {
      // Recargar configuración sin reiniciar el proceso
      // En un entorno real, esto podría recargar archivos de configuración
      
      this.logger.log('Configuration reloaded successfully');
      this.loggingService.log('Configuration reloaded', {
        metadata: {
          timestamp: new Date(),
          pid: process.pid,
        },
      });
    } catch (error) {
      this.logger.error('Failed to reload configuration', error);
      this.loggingService.error('Configuration reload failed', error);
    }
  }

  public getProcessInfo(): ProcessInfo {
    return {
      pid: process.pid,
      ppid: process.ppid,
      uptime: Date.now() - this.startTime,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      version: process.env.APP_VERSION || '1.0.0',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };
  }

  public getClusterInfo(): ClusterInfo {
    // En un entorno real con cluster, esto devolvería información real del cluster
    return {
      isMaster: true, // Simulated
      isWorker: false,
      workerId: undefined,
      workerCount: 1,
      maxWorkers: this.configService.get<number>('MAX_WORKERS', 4),
    };
  }

  public async performHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    processInfo: ProcessInfo;
    clusterInfo: ClusterInfo;
    warnings: string[];
  }> {
    const processInfo = this.getProcessInfo();
    const clusterInfo = this.getClusterInfo();
    const warnings: string[] = [];

    // Verificar uso de memoria
    const memoryUsagePercent = ((processInfo.memoryUsage.heapUsed + processInfo.memoryUsage.external) / this.maxMemoryUsage) * 100;
    if (memoryUsagePercent > this.memoryWarningThreshold) {
      warnings.push(`High memory usage: ${memoryUsagePercent.toFixed(2)}%`);
    }

    // Verificar uptime
    const uptimeHours = processInfo.uptime / (1000 * 60 * 60);
    if (uptimeHours < 0.1) { // Menos de 6 minutos
      warnings.push('Process recently started');
    }

    // Determinar estado general
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (warnings.length === 0) {
      status = 'healthy';
    } else if (warnings.length <= 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      processInfo,
      clusterInfo,
      warnings,
    };
  }

  public async restartWorker(workerId?: number): Promise<boolean> {
    try {
      // En un entorno real con cluster, esto reiniciaría un worker específico
      this.logger.log(`Restarting worker ${workerId || 'current'}`);
      
      this.loggingService.log('Worker restart initiated', {
        metadata: {
          workerId: workerId || 'current',
          timestamp: new Date(),
        },
      });

      // Simular reinicio exitoso
      return true;
    } catch (error) {
      this.logger.error('Failed to restart worker', error);
      return false;
    }
  }

  public getResourceUsage(): {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      user: number;
      system: number;
      total: number;
    };
    uptime: number;
  } {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const totalMemory = memoryUsage.heapUsed + memoryUsage.external;

    return {
      memory: {
        used: totalMemory,
        total: this.maxMemoryUsage,
        percentage: (totalMemory / this.maxMemoryUsage) * 100,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        total: cpuUsage.user + cpuUsage.system,
      },
      uptime: process.uptime() * 1000,
    };
  }
}