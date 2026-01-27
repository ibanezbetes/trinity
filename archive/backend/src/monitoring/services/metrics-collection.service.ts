import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggingService } from './structured-logging.service';

export interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercentage: number;
    heap: NodeJS.MemoryUsage;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercentage: number;
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  };
}

export interface ApplicationMetrics {
  requests: {
    total: number;
    perSecond: number;
    perMinute: number;
    perHour: number;
    byStatus: Record<number, number>;
    byEndpoint: Record<string, number>;
  };
  responses: {
    averageTime: number;
    p50: number;
    p95: number;
    p99: number;
    slowest: number;
    fastest: number;
  };
  database: {
    connections: number;
    queries: number;
    averageQueryTime: number;
    slowQueries: number;
    errors: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
    evictions: number;
  };
  websockets: {
    connections: number;
    messagesReceived: number;
    messagesSent: number;
    errors: number;
  };
}

export interface BusinessMetrics {
  users: {
    active: number;
    registered: number;
    online: number;
    newRegistrations: number;
  };
  rooms: {
    active: number;
    total: number;
    averageParticipants: number;
    totalParticipants: number;
  };
  interactions: {
    votes: number;
    matches: number;
    messages: number;
    mediaUploads: number;
  };
  performance: {
    matchingAccuracy: number;
    averageSessionDuration: number;
    userSatisfaction: number;
  };
}

export interface MetricsSnapshot {
  timestamp: Date;
  system: SystemMetrics;
  application: ApplicationMetrics;
  business: BusinessMetrics;
  custom: Record<string, any>;
}

export interface MetricsCollectionConfig {
  enabled: boolean;
  collectionInterval: number;
  retentionPeriod: number;
  maxSnapshots: number;
  enableSystemMetrics: boolean;
  enableApplicationMetrics: boolean;
  enableBusinessMetrics: boolean;
  enableCustomMetrics: boolean;
}

@Injectable()
export class MetricsCollectionService {
  private readonly logger = new Logger(MetricsCollectionService.name);
  private readonly config: MetricsCollectionConfig;
  private readonly metricsHistory: MetricsSnapshot[] = [];
  private collectionTimer: NodeJS.Timeout;
  private cleanupTimer: NodeJS.Timeout;

  // Contadores para métricas de aplicación
  private requestCounts: { timestamp: number; count: number; endpoint: string; status: number }[] = [];
  private responseTimes: { timestamp: number; duration: number; endpoint: string }[] = [];
  private databaseQueries: { timestamp: number; duration: number; type: string }[] = [];
  private cacheOperations: { timestamp: number; operation: 'hit' | 'miss' | 'eviction' }[] = [];
  private websocketEvents: { timestamp: number; event: 'connect' | 'disconnect' | 'message' | 'error' }[] = [];

  // Contadores para métricas de negocio
  private userActivities: { timestamp: number; userId: string; activity: string }[] = [];
  private roomActivities: { timestamp: number; roomId: string; activity: string; participants?: number }[] = [];
  private interactions: { timestamp: number; type: string; userId: string; roomId?: string }[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly loggingService: StructuredLoggingService,
  ) {
    this.config = {
      enabled: this.configService.get<boolean>('METRICS_ENABLED', true),
      collectionInterval: this.configService.get<number>('METRICS_COLLECTION_INTERVAL', 30000),
      retentionPeriod: this.configService.get<number>('METRICS_RETENTION_PERIOD', 86400000), // 24 hours
      maxSnapshots: this.configService.get<number>('METRICS_MAX_SNAPSHOTS', 2880), // 24h at 30s intervals
      enableSystemMetrics: this.configService.get<boolean>('METRICS_SYSTEM_ENABLED', true),
      enableApplicationMetrics: this.configService.get<boolean>('METRICS_APPLICATION_ENABLED', true),
      enableBusinessMetrics: this.configService.get<boolean>('METRICS_BUSINESS_ENABLED', true),
      enableCustomMetrics: this.configService.get<boolean>('METRICS_CUSTOM_ENABLED', true),
    };

    if (this.config.enabled) {
      this.initializeCollection();
    }
  }

  private initializeCollection(): void {
    // Iniciar colección de métricas
    this.collectionTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.collectionInterval);

    // Iniciar limpieza periódica
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldMetrics();
    }, 300000); // Cada 5 minutos

    this.loggingService.log('MetricsCollectionService initialized', {
      metadata: { config: this.config },
    });
  }

  private async collectMetrics(): Promise<void> {
    try {
      const snapshot: MetricsSnapshot = {
        timestamp: new Date(),
        system: this.config.enableSystemMetrics ? await this.collectSystemMetrics() : {} as SystemMetrics,
        application: this.config.enableApplicationMetrics ? this.collectApplicationMetrics() : {} as ApplicationMetrics,
        business: this.config.enableBusinessMetrics ? this.collectBusinessMetrics() : {} as BusinessMetrics,
        custom: this.config.enableCustomMetrics ? this.collectCustomMetrics() : {},
      };

      this.addSnapshot(snapshot);

      this.loggingService.debug('Metrics collected', {
        metadata: {
          timestamp: snapshot.timestamp,
          systemCpu: snapshot.system.cpu?.usage,
          systemMemory: snapshot.system.memory?.usagePercentage,
          appRequests: snapshot.application.requests?.perSecond,
          appResponseTime: snapshot.application.responses?.averageTime,
        },
      });

    } catch (error) {
      this.loggingService.error('Error collecting metrics', error);
    }
  }

  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Simular métricas del sistema (en producción usar librerías como 'systeminformation')
    return {
      cpu: {
        usage: Math.random() * 100, // Simulated
        loadAverage: [1.2, 1.5, 1.8], // Simulated
        cores: 4, // Simulated
      },
      memory: {
        total: 8589934592, // 8GB simulated
        used: memoryUsage.heapUsed + memoryUsage.external,
        free: 8589934592 - (memoryUsage.heapUsed + memoryUsage.external),
        usagePercentage: ((memoryUsage.heapUsed + memoryUsage.external) / 8589934592) * 100,
        heap: memoryUsage,
      },
      disk: {
        total: 107374182400, // 100GB simulated
        used: 53687091200, // 50GB simulated
        free: 53687091200,
        usagePercentage: 50,
      },
      network: {
        bytesReceived: Math.floor(Math.random() * 1000000),
        bytesSent: Math.floor(Math.random() * 1000000),
        packetsReceived: Math.floor(Math.random() * 10000),
        packetsSent: Math.floor(Math.random() * 10000),
      },
    };
  }

  private collectApplicationMetrics(): ApplicationMetrics {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;

    // Filtrar datos por tiempo
    const recentRequests = this.requestCounts.filter(r => r.timestamp > oneMinuteAgo);
    const recentResponses = this.responseTimes.filter(r => r.timestamp > oneMinuteAgo);
    const recentQueries = this.databaseQueries.filter(q => q.timestamp > oneMinuteAgo);
    const recentCacheOps = this.cacheOperations.filter(c => c.timestamp > oneMinuteAgo);
    const recentWsEvents = this.websocketEvents.filter(w => w.timestamp > oneMinuteAgo);

    // Calcular métricas de requests
    const requestsPerSecond = this.requestCounts.filter(r => r.timestamp > oneSecondAgo).length;
    const requestsPerMinute = recentRequests.length;
    const requestsPerHour = this.requestCounts.filter(r => r.timestamp > oneHourAgo).length;

    // Agrupar por status y endpoint
    const byStatus: Record<number, number> = {};
    const byEndpoint: Record<string, number> = {};
    
    recentRequests.forEach(req => {
      byStatus[req.status] = (byStatus[req.status] || 0) + 1;
      byEndpoint[req.endpoint] = (byEndpoint[req.endpoint] || 0) + 1;
    });

    // Calcular métricas de respuesta
    const responseDurations = recentResponses.map(r => r.duration).sort((a, b) => a - b);
    const averageTime = responseDurations.length > 0 
      ? responseDurations.reduce((sum, d) => sum + d, 0) / responseDurations.length 
      : 0;

    const p50 = responseDurations.length > 0 
      ? responseDurations[Math.floor(responseDurations.length * 0.5)] 
      : 0;
    const p95 = responseDurations.length > 0 
      ? responseDurations[Math.floor(responseDurations.length * 0.95)] 
      : 0;
    const p99 = responseDurations.length > 0 
      ? responseDurations[Math.floor(responseDurations.length * 0.99)] 
      : 0;

    // Métricas de base de datos
    const queryDurations = recentQueries.map(q => q.duration);
    const averageQueryTime = queryDurations.length > 0 
      ? queryDurations.reduce((sum, d) => sum + d, 0) / queryDurations.length 
      : 0;
    const slowQueries = queryDurations.filter(d => d > 1000).length;

    // Métricas de cache
    const cacheHits = recentCacheOps.filter(op => op.operation === 'hit').length;
    const cacheMisses = recentCacheOps.filter(op => op.operation === 'miss').length;
    const cacheEvictions = recentCacheOps.filter(op => op.operation === 'eviction').length;
    const hitRate = (cacheHits + cacheMisses) > 0 ? (cacheHits / (cacheHits + cacheMisses)) * 100 : 0;

    // Métricas de WebSocket
    const wsConnections = recentWsEvents.filter(e => e.event === 'connect').length;
    const wsDisconnections = recentWsEvents.filter(e => e.event === 'disconnect').length;
    const wsMessages = recentWsEvents.filter(e => e.event === 'message').length;
    const wsErrors = recentWsEvents.filter(e => e.event === 'error').length;

    return {
      requests: {
        total: this.requestCounts.length,
        perSecond: requestsPerSecond,
        perMinute: requestsPerMinute,
        perHour: requestsPerHour,
        byStatus,
        byEndpoint,
      },
      responses: {
        averageTime,
        p50,
        p95,
        p99,
        slowest: responseDurations.length > 0 ? Math.max(...responseDurations) : 0,
        fastest: responseDurations.length > 0 ? Math.min(...responseDurations) : 0,
      },
      database: {
        connections: 10, // Simulated active connections
        queries: recentQueries.length,
        averageQueryTime,
        slowQueries,
        errors: 0, // Simulated
      },
      cache: {
        hits: cacheHits,
        misses: cacheMisses,
        hitRate,
        size: 1000, // Simulated cache size
        evictions: cacheEvictions,
      },
      websockets: {
        connections: wsConnections - wsDisconnections,
        messagesReceived: wsMessages,
        messagesSent: wsMessages, // Simulated
        errors: wsErrors,
      },
    };
  }

  private collectBusinessMetrics(): BusinessMetrics {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    // Filtrar actividades recientes
    const recentUserActivities = this.userActivities.filter(a => a.timestamp > oneHourAgo);
    const recentRoomActivities = this.roomActivities.filter(a => a.timestamp > oneHourAgo);
    const recentInteractions = this.interactions.filter(i => i.timestamp > oneHourAgo);
    const dailyUserActivities = this.userActivities.filter(a => a.timestamp > oneDayAgo);

    // Métricas de usuarios
    const activeUsers = new Set(recentUserActivities.map(a => a.userId)).size;
    const onlineUsers = new Set(
      recentUserActivities
        .filter(a => a.activity === 'online')
        .map(a => a.userId)
    ).size;
    const newRegistrations = dailyUserActivities.filter(a => a.activity === 'register').length;

    // Métricas de salas
    const activeRooms = new Set(recentRoomActivities.map(a => a.roomId)).size;
    const roomsWithParticipants = recentRoomActivities.filter(a => a.participants && a.participants > 0);
    const totalParticipants = roomsWithParticipants.reduce((sum, a) => sum + (a.participants || 0), 0);
    const averageParticipants = roomsWithParticipants.length > 0 
      ? totalParticipants / roomsWithParticipants.length 
      : 0;

    // Métricas de interacciones
    const votes = recentInteractions.filter(i => i.type === 'vote').length;
    const matches = recentInteractions.filter(i => i.type === 'match').length;
    const messages = recentInteractions.filter(i => i.type === 'message').length;
    const mediaUploads = recentInteractions.filter(i => i.type === 'media_upload').length;

    return {
      users: {
        active: activeUsers,
        registered: 1000, // Simulated total registered users
        online: onlineUsers,
        newRegistrations,
      },
      rooms: {
        active: activeRooms,
        total: 50, // Simulated total rooms
        averageParticipants,
        totalParticipants,
      },
      interactions: {
        votes,
        matches,
        messages,
        mediaUploads,
      },
      performance: {
        matchingAccuracy: 85.5, // Simulated matching accuracy percentage
        averageSessionDuration: 1800, // Simulated 30 minutes average
        userSatisfaction: 4.2, // Simulated rating out of 5
      },
    };
  }

  private collectCustomMetrics(): Record<string, any> {
    // Métricas personalizadas específicas de Trinity
    return {
      trinitySpecific: {
        averageVotingTime: 45, // seconds
        matchSuccessRate: 78.5, // percentage
        roomEngagementScore: 8.2, // out of 10
        contentQualityScore: 7.8, // out of 10
        moderationActions: 5, // per hour
        reportedContent: 2, // per hour
      },
      performance: {
        imageProcessingTime: 250, // milliseconds
        semanticAnalysisTime: 180, // milliseconds
        realtimeLatency: 45, // milliseconds
        cacheEfficiency: 92.3, // percentage
      },
      security: {
        blockedRequests: 12, // per hour
        suspiciousActivities: 3, // per hour
        rateLimitHits: 8, // per hour
        authenticationFailures: 1, // per hour
      },
    };
  }

  private addSnapshot(snapshot: MetricsSnapshot): void {
    this.metricsHistory.push(snapshot);

    // Mantener solo el número máximo de snapshots
    if (this.metricsHistory.length > this.config.maxSnapshots) {
      this.metricsHistory.shift();
    }
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - this.config.retentionPeriod;

    // Limpiar datos antiguos
    this.requestCounts = this.requestCounts.filter(r => r.timestamp > cutoffTime);
    this.responseTimes = this.responseTimes.filter(r => r.timestamp > cutoffTime);
    this.databaseQueries = this.databaseQueries.filter(q => q.timestamp > cutoffTime);
    this.cacheOperations = this.cacheOperations.filter(c => c.timestamp > cutoffTime);
    this.websocketEvents = this.websocketEvents.filter(w => w.timestamp > cutoffTime);
    this.userActivities = this.userActivities.filter(a => a.timestamp > cutoffTime);
    this.roomActivities = this.roomActivities.filter(a => a.timestamp > cutoffTime);
    this.interactions = this.interactions.filter(i => i.timestamp > cutoffTime);

    this.loggingService.debug('Old metrics cleaned up', {
      metadata: {
        cutoffTime: new Date(cutoffTime),
        remainingSnapshots: this.metricsHistory.length,
      },
    });
  }

  // Métodos públicos para registrar eventos
  public recordRequest(endpoint: string, status: number): void {
    this.requestCounts.push({
      timestamp: Date.now(),
      count: 1,
      endpoint,
      status,
    });
  }

  public recordResponseTime(endpoint: string, duration: number): void {
    this.responseTimes.push({
      timestamp: Date.now(),
      duration,
      endpoint,
    });
  }

  public recordDatabaseQuery(type: string, duration: number): void {
    this.databaseQueries.push({
      timestamp: Date.now(),
      duration,
      type,
    });
  }

  public recordCacheOperation(operation: 'hit' | 'miss' | 'eviction'): void {
    this.cacheOperations.push({
      timestamp: Date.now(),
      operation,
    });
  }

  public recordWebSocketEvent(event: 'connect' | 'disconnect' | 'message' | 'error'): void {
    this.websocketEvents.push({
      timestamp: Date.now(),
      event,
    });
  }

  public recordUserActivity(userId: string, activity: string): void {
    this.userActivities.push({
      timestamp: Date.now(),
      userId,
      activity,
    });
  }

  public recordRoomActivity(roomId: string, activity: string, participants?: number): void {
    this.roomActivities.push({
      timestamp: Date.now(),
      roomId,
      activity,
      participants,
    });
  }

  public recordInteraction(type: string, userId: string, roomId?: string): void {
    this.interactions.push({
      timestamp: Date.now(),
      type,
      userId,
      roomId,
    });
  }

  // Métodos públicos para obtener métricas
  public getCurrentMetrics(): MetricsSnapshot | null {
    return this.metricsHistory.length > 0 
      ? this.metricsHistory[this.metricsHistory.length - 1] 
      : null;
  }

  public getMetricsHistory(limit: number = 100): MetricsSnapshot[] {
    return this.metricsHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  public getMetricsTrend(metric: string, timeRange: number = 3600000): any[] {
    const cutoffTime = Date.now() - timeRange;
    
    return this.metricsHistory
      .filter(snapshot => snapshot.timestamp.getTime() > cutoffTime)
      .map(snapshot => ({
        timestamp: snapshot.timestamp,
        value: this.getNestedValue(snapshot, metric),
      }));
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  public getAggregatedMetrics(timeRange: number = 3600000): any {
    const cutoffTime = Date.now() - timeRange;
    const relevantSnapshots = this.metricsHistory.filter(
      snapshot => snapshot.timestamp.getTime() > cutoffTime
    );

    if (relevantSnapshots.length === 0) return null;

    // Calcular promedios y agregaciones
    const aggregated = {
      timeRange: timeRange / 1000 / 60, // minutes
      snapshots: relevantSnapshots.length,
      averages: {
        cpuUsage: this.calculateAverage(relevantSnapshots, 'system.cpu.usage'),
        memoryUsage: this.calculateAverage(relevantSnapshots, 'system.memory.usagePercentage'),
        responseTime: this.calculateAverage(relevantSnapshots, 'application.responses.averageTime'),
        requestsPerSecond: this.calculateAverage(relevantSnapshots, 'application.requests.perSecond'),
        cacheHitRate: this.calculateAverage(relevantSnapshots, 'application.cache.hitRate'),
        activeUsers: this.calculateAverage(relevantSnapshots, 'business.users.active'),
      },
      totals: {
        requests: this.calculateSum(relevantSnapshots, 'application.requests.perMinute'),
        databaseQueries: this.calculateSum(relevantSnapshots, 'application.database.queries'),
        interactions: this.calculateSum(relevantSnapshots, 'business.interactions.votes'),
      },
    };

    return aggregated;
  }

  private calculateAverage(snapshots: MetricsSnapshot[], path: string): number {
    const values = snapshots
      .map(snapshot => this.getNestedValue(snapshot, path))
      .filter(value => typeof value === 'number' && !isNaN(value));
    
    return values.length > 0 
      ? values.reduce((sum, value) => sum + value, 0) / values.length 
      : 0;
  }

  private calculateSum(snapshots: MetricsSnapshot[], path: string): number {
    const values = snapshots
      .map(snapshot => this.getNestedValue(snapshot, path))
      .filter(value => typeof value === 'number' && !isNaN(value));
    
    return values.reduce((sum, value) => sum + value, 0);
  }

  public async shutdown(): Promise<void> {
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.loggingService.log('MetricsCollectionService shutdown completed');
  }
}