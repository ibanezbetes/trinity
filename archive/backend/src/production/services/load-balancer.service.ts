import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggingService } from '../../monitoring/services/structured-logging.service';
import { MetricsCollectionService } from '../../monitoring/services/metrics-collection.service';

export interface LoadBalancerConfig {
  instanceId: string;
  instanceWeight: number;
  healthCheckPath: string;
  healthCheckInterval: number;
  maxConnections: number;
  sessionAffinity: boolean;
  stickySession: boolean;
}

export interface InstanceHealth {
  instanceId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastHealthCheck: Date;
  responseTime: number;
  activeConnections: number;
  cpuUsage: number;
  memoryUsage: number;
  errorRate: number;
}

@Injectable()
export class LoadBalancerService {
  private readonly logger = new Logger(LoadBalancerService.name);
  private readonly config: LoadBalancerConfig;
  private readonly instanceId: string;
  private activeConnections = 0;
  private readonly maxConnections: number;
  private readonly connectionQueue: Array<{ timestamp: Date; resolve: () => void; reject: (error: Error) => void }> = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly loggingService: StructuredLoggingService,
    private readonly metricsService: MetricsCollectionService,
  ) {
    this.instanceId = this.generateInstanceId();
    this.maxConnections = this.configService.get<number>('MAX_CONNECTIONS', 1000);
    
    this.config = {
      instanceId: this.instanceId,
      instanceWeight: this.configService.get<number>('INSTANCE_WEIGHT', 100),
      healthCheckPath: '/api/health/ready',
      healthCheckInterval: this.configService.get<number>('HEALTH_CHECK_INTERVAL', 30000),
      maxConnections: this.maxConnections,
      sessionAffinity: this.configService.get<boolean>('SESSION_AFFINITY', false),
      stickySession: this.configService.get<boolean>('STICKY_SESSION', false),
    };

    this.initializeLoadBalancerFeatures();
    
    this.loggingService.log('LoadBalancerService initialized', {
      metadata: {
        instanceId: this.instanceId,
        config: this.config,
      },
    });
  }

  private generateInstanceId(): string {
    const hostname = process.env.HOSTNAME || 'unknown';
    const pid = process.pid;
    const timestamp = Date.now();
    return `${hostname}-${pid}-${timestamp}`;
  }

  private initializeLoadBalancerFeatures(): void {
    // Configurar headers para load balancer
    this.setupLoadBalancerHeaders();
    
    // Inicializar monitoreo de conexiones
    this.startConnectionMonitoring();
    
    // Configurar graceful connection handling
    this.setupConnectionManagement();
  }

  private setupLoadBalancerHeaders(): void {
    // Headers que el load balancer puede usar para tomar decisiones
    process.env.LB_INSTANCE_ID = this.instanceId;
    process.env.LB_INSTANCE_WEIGHT = this.config.instanceWeight.toString();
    process.env.LB_MAX_CONNECTIONS = this.config.maxConnections.toString();
  }

  private startConnectionMonitoring(): void {
    setInterval(() => {
      this.logConnectionMetrics();
    }, 30000); // Log cada 30 segundos
  }

  private setupConnectionManagement(): void {
    // Procesar cola de conexiones cada segundo
    setInterval(() => {
      this.processConnectionQueue();
    }, 1000);
  }

  private logConnectionMetrics(): void {
    const metrics = {
      instanceId: this.instanceId,
      activeConnections: this.activeConnections,
      maxConnections: this.maxConnections,
      connectionUtilization: (this.activeConnections / this.maxConnections) * 100,
      queuedConnections: this.connectionQueue.length,
    };

    this.loggingService.log('Connection metrics', {
      metadata: metrics,
    });
  }

  private processConnectionQueue(): void {
    while (this.connectionQueue.length > 0 && this.activeConnections < this.maxConnections) {
      const connection = this.connectionQueue.shift();
      if (connection) {
        this.activeConnections++;
        connection.resolve();
      }
    }

    // Timeout conexiones en cola que han esperado demasiado
    const now = Date.now();
    const timeout = 30000; // 30 segundos
    
    for (let i = this.connectionQueue.length - 1; i >= 0; i--) {
      const connection = this.connectionQueue[i];
      if (now - connection.timestamp.getTime() > timeout) {
        this.connectionQueue.splice(i, 1);
        connection.reject(new Error('Connection timeout'));
      }
    }
  }

  public async acquireConnection(): Promise<void> {
    if (this.activeConnections < this.maxConnections) {
      this.activeConnections++;
      return Promise.resolve();
    }

    // Si no hay conexiones disponibles, agregar a la cola
    return new Promise((resolve, reject) => {
      this.connectionQueue.push({
        timestamp: new Date(),
        resolve,
        reject,
      });
    });
  }

  public releaseConnection(): void {
    if (this.activeConnections > 0) {
      this.activeConnections--;
    }
  }

  public getInstanceHealth(): InstanceHealth {
    const currentMetrics = this.metricsService.getCurrentMetrics();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = currentMetrics?.system.cpu.usage || 0;
    const memoryUsagePercent = ((memoryUsage.heapUsed + memoryUsage.external) / (memoryUsage.heapTotal + memoryUsage.external)) * 100;

    // Calcular estado de salud basado en métricas
    let status: 'healthy' | 'degraded' | 'unhealthy';
    const connectionUtilization = (this.activeConnections / this.maxConnections) * 100;
    
    if (cpuUsage > 90 || memoryUsagePercent > 90 || connectionUtilization > 95) {
      status = 'unhealthy';
    } else if (cpuUsage > 70 || memoryUsagePercent > 75 || connectionUtilization > 80) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      instanceId: this.instanceId,
      status,
      lastHealthCheck: new Date(),
      responseTime: currentMetrics?.application.responses.averageTime || 0,
      activeConnections: this.activeConnections,
      cpuUsage,
      memoryUsage: memoryUsagePercent,
      errorRate: 0, // Se obtendría del error tracking service
    };
  }

  public getLoadBalancerConfig(): LoadBalancerConfig {
    return { ...this.config };
  }

  public getConnectionStats(): {
    active: number;
    max: number;
    queued: number;
    utilization: number;
    averageWaitTime: number;
  } {
    const now = Date.now();
    const averageWaitTime = this.connectionQueue.length > 0
      ? this.connectionQueue.reduce((sum, conn) => sum + (now - conn.timestamp.getTime()), 0) / this.connectionQueue.length
      : 0;

    return {
      active: this.activeConnections,
      max: this.maxConnections,
      queued: this.connectionQueue.length,
      utilization: (this.activeConnections / this.maxConnections) * 100,
      averageWaitTime,
    };
  }

  public async performHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    instanceId: string;
    timestamp: Date;
    metrics: {
      connections: ReturnType<LoadBalancerService['getConnectionStats']>;
      health: InstanceHealth;
    };
    loadBalancerReady: boolean;
  }> {
    const health = this.getInstanceHealth();
    const connectionStats = this.getConnectionStats();
    
    // Determinar si la instancia está lista para recibir tráfico del load balancer
    const loadBalancerReady = health.status !== 'unhealthy' && 
                             connectionStats.utilization < 95 &&
                             connectionStats.queued < 100;

    return {
      status: health.status,
      instanceId: this.instanceId,
      timestamp: new Date(),
      metrics: {
        connections: connectionStats,
        health,
      },
      loadBalancerReady,
    };
  }

  public generateNginxConfig(): string {
    // Generar configuración de ejemplo para Nginx
    return `
# Nginx Load Balancer Configuration for Trinity API
upstream trinity_backend {
    least_conn;
    server 127.0.0.1:3002 weight=${this.config.instanceWeight} max_fails=3 fail_timeout=30s;
    # Add more servers here for horizontal scaling
    # server 127.0.0.1:3003 weight=100 max_fails=3 fail_timeout=30s;
    # server 127.0.0.1:3004 weight=100 max_fails=3 fail_timeout=30s;
    
    keepalive 32;
}

server {
    listen 80;
    server_name trinity-api.example.com;
    
    # Health check endpoint
    location ${this.config.healthCheckPath} {
        proxy_pass http://trinity_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Health check specific settings
        proxy_connect_timeout 5s;
        proxy_send_timeout 5s;
        proxy_read_timeout 5s;
    }
    
    # Main application
    location / {
        proxy_pass http://trinity_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Instance-ID $upstream_addr;
        
        # Connection settings
        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        
        # Keep alive
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        
        ${this.config.stickySession ? '# Sticky sessions\n        ip_hash;' : ''}
    }
}`;
  }

  public generateHAProxyConfig(): string {
    // Generar configuración de ejemplo para HAProxy
    return `
# HAProxy Load Balancer Configuration for Trinity API
global
    daemon
    maxconn 4096
    log stdout local0

defaults
    mode http
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 50000ms
    option httplog
    option dontlognull
    option redispatch
    retries 3

frontend trinity_frontend
    bind *:80
    default_backend trinity_backend
    
    # Health check
    acl health_check path ${this.config.healthCheckPath}
    use_backend trinity_health if health_check

backend trinity_backend
    balance leastconn
    option httpchk GET ${this.config.healthCheckPath}
    http-check expect status 200
    
    server instance1 127.0.0.1:3002 check weight ${this.config.instanceWeight} maxconn ${this.config.maxConnections}
    # Add more servers here for horizontal scaling
    # server instance2 127.0.0.1:3003 check weight 100 maxconn 1000
    # server instance3 127.0.0.1:3004 check weight 100 maxconn 1000

backend trinity_health
    server health 127.0.0.1:3002 check
`;
  }
}