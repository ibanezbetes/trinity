import { Injectable, Logger, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LogContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  roomId?: string;
  action?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

export interface StructuredLogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context: LogContext;
  service: string;
  environment: string;
  version: string;
  correlationId?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  performance?: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    responseTime?: number;
  };
}

export interface LoggingMetrics {
  totalLogs: number;
  logsByLevel: Record<LogLevel, number>;
  errorsPerMinute: number;
  warningsPerMinute: number;
  averageLogSize: number;
  logProcessingTime: number;
  bufferSize: number;
  droppedLogs: number;
}

@Injectable()
export class StructuredLoggingService {
  private readonly logger = new Logger(StructuredLoggingService.name);
  private readonly logBuffer: StructuredLogEntry[] = [];
  private readonly maxBufferSize: number;
  private readonly flushInterval: number;
  private readonly environment: string;
  private readonly version: string;
  private readonly enableConsoleOutput: boolean;
  private readonly enableFileOutput: boolean;
  private readonly enableRemoteLogging: boolean;
  
  private metrics: LoggingMetrics = {
    totalLogs: 0,
    logsByLevel: {
      'error': 0,
      'warn': 0,
      'log': 0,
      'debug': 0,
      'verbose': 0,
      'fatal': 0,
    },
    errorsPerMinute: 0,
    warningsPerMinute: 0,
    averageLogSize: 0,
    logProcessingTime: 0,
    bufferSize: 0,
    droppedLogs: 0,
  };

  private flushTimer: NodeJS.Timeout;
  private metricsTimer: NodeJS.Timeout;
  private errorCounts: { timestamp: number; count: number }[] = [];
  private warningCounts: { timestamp: number; count: number }[] = [];

  constructor(private readonly configService: ConfigService) {
    this.maxBufferSize = this.configService.get<number>('LOG_BUFFER_SIZE', 1000);
    this.flushInterval = this.configService.get<number>('LOG_FLUSH_INTERVAL', 5000);
    this.environment = this.configService.get<string>('NODE_ENV', 'development');
    this.version = this.configService.get<string>('APP_VERSION', '1.0.0');
    this.enableConsoleOutput = this.configService.get<boolean>('LOG_CONSOLE_ENABLED', true);
    this.enableFileOutput = this.configService.get<boolean>('LOG_FILE_ENABLED', false);
    this.enableRemoteLogging = this.configService.get<boolean>('LOG_REMOTE_ENABLED', false);

    this.initializeLogging();
    this.startMetricsCollection();
  }

  private initializeLogging(): void {
    // Configurar flush automático del buffer
    this.flushTimer = setInterval(() => {
      this.flushLogs();
    }, this.flushInterval);

    this.logger.log('StructuredLoggingService initialized', {
      maxBufferSize: this.maxBufferSize,
      flushInterval: this.flushInterval,
      environment: this.environment,
      consoleOutput: this.enableConsoleOutput,
      fileOutput: this.enableFileOutput,
      remoteLogging: this.enableRemoteLogging,
    });
  }

  private startMetricsCollection(): void {
    // Actualizar métricas cada minuto
    this.metricsTimer = setInterval(() => {
      this.updateMetrics();
    }, 60000);
  }

  private updateMetrics(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Limpiar contadores antiguos
    this.errorCounts = this.errorCounts.filter(entry => entry.timestamp > oneMinuteAgo);
    this.warningCounts = this.warningCounts.filter(entry => entry.timestamp > oneMinuteAgo);

    // Calcular errores y warnings por minuto
    this.metrics.errorsPerMinute = this.errorCounts.reduce((sum, entry) => sum + entry.count, 0);
    this.metrics.warningsPerMinute = this.warningCounts.reduce((sum, entry) => sum + entry.count, 0);
    this.metrics.bufferSize = this.logBuffer.length;
  }

  public log(message: string, context: LogContext = {}, level: LogLevel = 'log'): void {
    const startTime = process.hrtime.bigint();
    
    const logEntry: StructuredLogEntry = {
      timestamp: new Date(),
      level,
      message,
      context: {
        ...context,
        correlationId: context.requestId || this.generateCorrelationId(),
      },
      service: 'trinity-backend',
      environment: this.environment,
      version: this.version,
      performance: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
    };

    // Agregar al buffer
    this.addToBuffer(logEntry);

    // Actualizar métricas
    this.updateLogMetrics(logEntry, startTime);

    // Output inmediato para errores críticos
    if (level === 'error' && this.enableConsoleOutput) {
      console.error(JSON.stringify(logEntry, null, 2));
    }
  }

  public error(message: string, error: Error, context: LogContext = {}): void {
    const logEntry: StructuredLogEntry = {
      timestamp: new Date(),
      level: 'error',
      message,
      context: {
        ...context,
        correlationId: context.requestId || this.generateCorrelationId(),
      },
      service: 'trinity-backend',
      environment: this.environment,
      version: this.version,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      },
      performance: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
    };

    this.addToBuffer(logEntry);
    this.updateErrorCount();

    // Output inmediato para errores
    if (this.enableConsoleOutput) {
      console.error(JSON.stringify(logEntry, null, 2));
    }
  }

  public warn(message: string, context: LogContext = {}): void {
    this.log(message, context, 'warn');
    this.updateWarningCount();
  }

  public debug(message: string, context: LogContext = {}): void {
    if (this.environment === 'development') {
      this.log(message, context, 'debug');
    }
  }

  public performance(message: string, duration: number, context: LogContext = {}): void {
    const logEntry: StructuredLogEntry = {
      timestamp: new Date(),
      level: 'log',
      message,
      context: {
        ...context,
        correlationId: context.requestId || this.generateCorrelationId(),
      },
      service: 'trinity-backend',
      environment: this.environment,
      version: this.version,
      duration,
      performance: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        responseTime: duration,
      },
    };

    this.addToBuffer(logEntry);
  }

  private addToBuffer(logEntry: StructuredLogEntry): void {
    if (this.logBuffer.length >= this.maxBufferSize) {
      // Buffer lleno, eliminar entrada más antigua
      this.logBuffer.shift();
      this.metrics.droppedLogs++;
    }

    this.logBuffer.push(logEntry);
  }

  private updateLogMetrics(logEntry: StructuredLogEntry, startTime: bigint): void {
    const endTime = process.hrtime.bigint();
    const processingTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

    this.metrics.totalLogs++;
    this.metrics.logsByLevel[logEntry.level]++;
    this.metrics.logProcessingTime = processingTime;
    
    // Calcular tamaño promedio de log
    const logSize = JSON.stringify(logEntry).length;
    this.metrics.averageLogSize = (
      (this.metrics.averageLogSize * (this.metrics.totalLogs - 1) + logSize) / 
      this.metrics.totalLogs
    );
  }

  private updateErrorCount(): void {
    const now = Date.now();
    this.errorCounts.push({ timestamp: now, count: 1 });
  }

  private updateWarningCount(): void {
    const now = Date.now();
    this.warningCounts.push({ timestamp: now, count: 1 });
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const logsToFlush = [...this.logBuffer];
    this.logBuffer.length = 0; // Clear buffer

    try {
      // Console output
      if (this.enableConsoleOutput) {
        logsToFlush.forEach(log => {
          const output = JSON.stringify(log);
          switch (log.level) {
            case 'error':
              console.error(output);
              break;
            case 'warn':
              console.warn(output);
              break;
            case 'debug':
              console.debug(output);
              break;
            default:
              console.log(output);
          }
        });
      }

      // File output (si está habilitado)
      if (this.enableFileOutput) {
        await this.writeToFile(logsToFlush);
      }

      // Remote logging (si está habilitado)
      if (this.enableRemoteLogging) {
        await this.sendToRemoteLogger(logsToFlush);
      }

    } catch (error) {
      this.logger.error('Error flushing logs', error);
      // Re-agregar logs al buffer si falló el flush
      this.logBuffer.unshift(...logsToFlush);
    }
  }

  private async writeToFile(logs: StructuredLogEntry[]): Promise<void> {
    // Implementación de escritura a archivo
    // Por ahora solo simulamos
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  private async sendToRemoteLogger(logs: StructuredLogEntry[]): Promise<void> {
    // Implementación de envío a servicio remoto (CloudWatch, ELK, etc.)
    // Por ahora solo simulamos
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  public getMetrics(): LoggingMetrics {
    return { ...this.metrics };
  }

  public getLogs(limit: number = 100, level?: LogLevel): StructuredLogEntry[] {
    let logs = [...this.logBuffer];
    
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    
    return logs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  public searchLogs(query: string, limit: number = 100): StructuredLogEntry[] {
    const searchTerm = query.toLowerCase();
    
    return this.logBuffer
      .filter(log => 
        log.message.toLowerCase().includes(searchTerm) ||
        JSON.stringify(log.context).toLowerCase().includes(searchTerm)
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  public clearLogs(): void {
    this.logBuffer.length = 0;
    this.logger.log('Log buffer cleared');
  }

  public async shutdown(): Promise<void> {
    // Limpiar timers
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    // Flush final de logs
    await this.flushLogs();
    
    this.logger.log('StructuredLoggingService shutdown completed');
  }
}