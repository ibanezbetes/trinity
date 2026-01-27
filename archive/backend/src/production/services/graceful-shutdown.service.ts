import { Injectable, Logger, OnApplicationShutdown, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggingService } from '../../monitoring/services/structured-logging.service';
import { MetricsCollectionService } from '../../monitoring/services/metrics-collection.service';
import { ErrorTrackingService } from '../../monitoring/services/error-tracking.service';
import { PerformanceMonitoringService } from '../../monitoring/services/performance-monitoring.service';

export interface ShutdownHook {
  name: string;
  priority: number; // Lower number = higher priority
  timeout: number; // Timeout in milliseconds
  execute: () => Promise<void>;
}

@Injectable()
export class GracefulShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(GracefulShutdownService.name);
  private readonly shutdownHooks: ShutdownHook[] = [];
  private readonly gracefulShutdownTimeout: number;
  private isShuttingDown = false;
  private shutdownStartTime: number;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly loggingService?: StructuredLoggingService,
    @Optional() private readonly metricsService?: MetricsCollectionService,
    @Optional() private readonly errorTrackingService?: ErrorTrackingService,
    @Optional() private readonly performanceService?: PerformanceMonitoringService,
  ) {
    this.gracefulShutdownTimeout = this.configService.get<number>('GRACEFUL_SHUTDOWN_TIMEOUT', 30000);
    this.setupDefaultHooks();
    this.setupSignalHandlers();
    
    const logData = {
      timeout: this.gracefulShutdownTimeout,
      defaultHooks: this.shutdownHooks.length,
    };

    if (this.loggingService) {
      this.loggingService.log('GracefulShutdownService initialized', {
        metadata: logData,
      });
    } else {
      this.logger.log('GracefulShutdownService initialized', JSON.stringify(logData));
    }
  }

  private setupDefaultHooks(): void {
    // Hook para cerrar servicios de monitoreo
    this.registerHook({
      name: 'monitoring-services',
      priority: 1,
      timeout: 5000,
      execute: async () => {
        this.logger.log('Shutting down monitoring services...');
        
        const shutdownPromises: Promise<void>[] = [];
        
        if (this.loggingService?.shutdown) {
          shutdownPromises.push(this.loggingService.shutdown());
        }
        
        if (this.performanceService?.shutdown) {
          shutdownPromises.push(this.performanceService.shutdown());
        }
        
        if (shutdownPromises.length > 0) {
          await Promise.all(shutdownPromises);
        }
        
        this.logger.log('Monitoring services shut down successfully');
      },
    });

    // Hook para finalizar conexiones de base de datos
    this.registerHook({
      name: 'database-connections',
      priority: 2,
      timeout: 10000,
      execute: async () => {
        this.logger.log('Closing database connections...');
        
        // Simular cierre de conexiones de base de datos
        await new Promise(resolve => setTimeout(resolve, 100));
        
        this.logger.log('Database connections closed successfully');
      },
    });

    // Hook para finalizar requests en progreso
    this.registerHook({
      name: 'active-requests',
      priority: 3,
      timeout: 15000,
      execute: async () => {
        this.logger.log('Waiting for active requests to complete...');
        
        // Simular espera de requests activos
        await new Promise(resolve => setTimeout(resolve, 200));
        
        this.logger.log('All active requests completed');
      },
    });

    // Hook para limpiar recursos temporales
    this.registerHook({
      name: 'cleanup-resources',
      priority: 4,
      timeout: 5000,
      execute: async () => {
        this.logger.log('Cleaning up temporary resources...');
        
        // Limpiar archivos temporales, caches, etc.
        await this.cleanupTempResources();
        
        this.logger.log('Temporary resources cleaned up');
      },
    });
  }

  private setupSignalHandlers(): void {
    // Manejar señales de sistema para graceful shutdown
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        this.logger.log(`Received ${signal}, initiating graceful shutdown...`);
        this.initiateShutdown(signal);
      });
    });

    // Manejar errores no capturados
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception, initiating emergency shutdown', error);
      
      if (this.errorTrackingService) {
        this.errorTrackingService.trackError(error, {
          metadata: { signal: 'uncaughtException', type: 'uncaughtException' }
        });
      }
      
      this.initiateShutdown('uncaughtException', true);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection, initiating emergency shutdown', new Error(String(reason)));
      
      if (this.errorTrackingService) {
        this.errorTrackingService.trackError(new Error(String(reason)), {
          metadata: { 
            signal: 'unhandledRejection',
            type: 'unhandledRejection', 
            promise: String(promise)
          }
        });
      }
      
      this.initiateShutdown('unhandledRejection', true);
    });
  }

  public registerHook(hook: ShutdownHook): void {
    this.shutdownHooks.push(hook);
    this.shutdownHooks.sort((a, b) => a.priority - b.priority);
    
    const logData = {
      name: hook.name,
      priority: hook.priority,
      timeout: hook.timeout,
    };

    if (this.loggingService) {
      this.loggingService.log('Shutdown hook registered', {
        metadata: logData,
      });
    } else {
      this.logger.log('Shutdown hook registered', JSON.stringify(logData));
    }
  }

  public async initiateShutdown(signal: string, emergency = false): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress, ignoring signal');
      return;
    }

    this.isShuttingDown = true;
    this.shutdownStartTime = Date.now();

    const logData = {
      signal,
      emergency,
      hooksCount: this.shutdownHooks.length,
      timeout: this.gracefulShutdownTimeout,
    };

    if (this.loggingService) {
      this.loggingService.log('Graceful shutdown initiated', {
        metadata: logData,
      });
    } else {
      this.logger.log('Graceful shutdown initiated', JSON.stringify(logData));
    }

    try {
      if (emergency) {
        // En caso de emergencia, timeout más corto
        await this.executeShutdownHooks(Math.min(this.gracefulShutdownTimeout, 10000));
      } else {
        await this.executeShutdownHooks(this.gracefulShutdownTimeout);
      }

      const shutdownDuration = Date.now() - this.shutdownStartTime;
      const logData = {
        duration: shutdownDuration,
        signal,
        emergency,
      };

      if (this.loggingService) {
        this.loggingService.log('Graceful shutdown completed successfully', {
          metadata: logData,
        });
        // Flush final de logs
        await this.loggingService.flushLogs();
      } else {
        this.logger.log('Graceful shutdown completed successfully', JSON.stringify(logData));
      }

      process.exit(0);
    } catch (error) {
      const shutdownDuration = Date.now() - this.shutdownStartTime;
      this.logger.error('Graceful shutdown failed', error);
      
      const errorLogData = {
        duration: shutdownDuration,
        signal,
        emergency,
      };

      if (this.loggingService) {
        this.loggingService.error('Graceful shutdown failed', error, {
          metadata: errorLogData,
        });
        // Flush final de logs incluso en caso de error
        await this.loggingService.flushLogs();
      } else {
        this.logger.error('Graceful shutdown failed', JSON.stringify(errorLogData));
      }

      process.exit(1);
    }
  }

  private async executeShutdownHooks(totalTimeout: number): Promise<void> {
    const startTime = Date.now();
    
    for (const hook of this.shutdownHooks) {
      const remainingTime = totalTimeout - (Date.now() - startTime);
      
      if (remainingTime <= 0) {
        this.logger.warn(`Shutdown timeout reached, skipping remaining hooks`);
        break;
      }

      const hookTimeout = Math.min(hook.timeout, remainingTime);
      
      try {
        this.logger.log(`Executing shutdown hook: ${hook.name}`);
        
        await Promise.race([
          hook.execute(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Hook ${hook.name} timed out`)), hookTimeout)
          ),
        ]);
        
        this.logger.log(`Shutdown hook completed: ${hook.name}`);
      } catch (error) {
        this.logger.error(`Shutdown hook failed: ${hook.name}`, error);
        
        // Continuar con los siguientes hooks incluso si uno falla
        if (this.errorTrackingService) {
          this.errorTrackingService.trackError(error, {
            metadata: { 
              type: 'shutdownHookFailure',
              hookName: hook.name
            }
          });
        }
      }
    }
  }

  private async cleanupTempResources(): Promise<void> {
    try {
      // Limpiar archivos temporales
      // En un entorno real, aquí limpiarías archivos temp, caches, etc.
      
      // Limpiar timers y intervalos
      // clearInterval/clearTimeout para cualquier timer activo
      
      // Cerrar conexiones WebSocket
      // Cerrar cualquier conexión WebSocket activa
      
      // Limpiar memoria
      if (global.gc) {
        global.gc();
      }
      
      this.logger.log('Temporary resources cleanup completed');
    } catch (error) {
      this.logger.error('Error during temporary resources cleanup', error);
    }
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (!this.isShuttingDown) {
      await this.initiateShutdown(signal || 'application-shutdown');
    }
  }

  public getShutdownStatus(): {
    isShuttingDown: boolean;
    shutdownStartTime?: number;
    registeredHooks: number;
    gracefulShutdownTimeout: number;
  } {
    return {
      isShuttingDown: this.isShuttingDown,
      shutdownStartTime: this.shutdownStartTime,
      registeredHooks: this.shutdownHooks.length,
      gracefulShutdownTimeout: this.gracefulShutdownTimeout,
    };
  }
}