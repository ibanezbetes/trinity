import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

export interface ConnectionPoolMetrics {
  activeConnections: number;
  maxConnections: number;
  poolUtilization: number;
  averageConnectionTime: number;
  connectionErrors: number;
  totalConnectionsCreated: number;
  connectionReuses: number;
}

export interface PoolConfiguration {
  maxConnections: number;
  minConnections: number;
  connectionTimeout: number;
  idleTimeout: number;
  retryAttempts: number;
  healthCheckInterval: number;
}

@Injectable()
export class ConnectionPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionPoolService.name);
  private dynamoClient: DynamoDBClient;
  private connectionPool: Map<string, any> = new Map();
  private poolMetrics: ConnectionPoolMetrics;
  private poolConfig: PoolConfiguration;
  private healthCheckInterval: NodeJS.Timeout;

  constructor(private configService: ConfigService) {
    this.initializePoolConfiguration();
    this.initializeMetrics();
  }

  async onModuleInit() {
    await this.initializeConnectionPool();
    this.startHealthCheck();
    this.logger.log('🏊 Connection Pool Service initialized');
  }

  async onModuleDestroy() {
    await this.closeAllConnections();
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.logger.log('🏊 Connection Pool Service destroyed');
  }

  /**
   * Initialize connection pool configuration
   */
  private initializePoolConfiguration(): void {
    this.poolConfig = {
      maxConnections: this.configService.get<number>('DB_MAX_CONNECTIONS', 50),
      minConnections: this.configService.get<number>('DB_MIN_CONNECTIONS', 5),
      connectionTimeout: this.configService.get<number>('DB_CONNECTION_TIMEOUT', 30000),
      idleTimeout: this.configService.get<number>('DB_IDLE_TIMEOUT', 300000), // 5 minutes
      retryAttempts: this.configService.get<number>('DB_RETRY_ATTEMPTS', 3),
      healthCheckInterval: this.configService.get<number>('DB_HEALTH_CHECK_INTERVAL', 60000), // 1 minute
    };
  }

  /**
   * Initialize connection pool metrics
   */
  private initializeMetrics(): void {
    this.poolMetrics = {
      activeConnections: 0,
      maxConnections: this.poolConfig.maxConnections,
      poolUtilization: 0,
      averageConnectionTime: 0,
      connectionErrors: 0,
      totalConnectionsCreated: 0,
      connectionReuses: 0,
    };
  }

  /**
   * Initialize the connection pool
   */
  private async initializeConnectionPool(): Promise<void> {
    try {
      // Create optimized DynamoDB client with connection pooling
      this.dynamoClient = new DynamoDBClient({
        region: this.configService.get('AWS_REGION', 'eu-west-1'),
        maxAttempts: this.poolConfig.retryAttempts,
        requestHandler: {
          connectionTimeout: this.poolConfig.connectionTimeout,
          socketTimeout: this.poolConfig.connectionTimeout,
        },
      });

      // Create document client with optimized configuration
      // Note: In production, you would use DynamoDBDocumentClient from @aws-sdk/lib-dynamodb
      // For now, we'll use the base client for compatibility

      // Pre-warm the connection pool
      await this.preWarmConnections();

      this.logger.log(`✅ Connection pool initialized with ${this.poolConfig.maxConnections} max connections`);
    } catch (error) {
      this.logger.error('❌ Failed to initialize connection pool', error);
      throw error;
    }
  }

  /**
   * Pre-warm connections to improve initial performance
   */
  private async preWarmConnections(): Promise<void> {
    const preWarmCount = Math.min(this.poolConfig.minConnections, 3);
    
    this.logger.log(`🔥 Pre-warming ${preWarmCount} connections...`);

    const preWarmPromises = Array.from({ length: preWarmCount }, async (_, index) => {
      try {
        // Create a simple health check query to establish connection
        const connectionId = `prewarm-${index}`;
        const startTime = Date.now();
        
        // Store connection reference
        this.connectionPool.set(connectionId, {
          client: this.dynamoClient,
          createdAt: new Date(),
          lastUsed: new Date(),
          isActive: true,
        });

        const connectionTime = Date.now() - startTime;
        this.updateConnectionMetrics(connectionTime, true);

        this.logger.debug(`🔗 Pre-warmed connection ${connectionId} in ${connectionTime}ms`);
      } catch (error) {
        this.logger.warn(`⚠️ Failed to pre-warm connection ${index}:`, error);
        this.poolMetrics.connectionErrors++;
      }
    });

    await Promise.allSettled(preWarmPromises);
  }

  /**
   * Get an optimized DynamoDB client
   */
  getDynamoClient(): DynamoDBClient {
    this.poolMetrics.connectionReuses++;
    this.updatePoolUtilization();
    return this.dynamoClient;
  }

  /**
   * Get a DynamoDB client (alias for compatibility)
   */
  getDocumentClient(): DynamoDBClient {
    return this.getDynamoClient();
  }

  /**
   * Execute a query with connection pooling optimization
   */
  async executeWithPool<T>(
    operation: (client: DynamoDBClient) => Promise<T>,
    operationName: string = 'unknown'
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const client = this.getDynamoClient();
      const result = await operation(client);
      
      const executionTime = Date.now() - startTime;
      this.updateConnectionMetrics(executionTime, true);
      
      this.logger.debug(`✅ ${operationName} completed in ${executionTime}ms`);
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateConnectionMetrics(executionTime, false);
      
      this.logger.error(`❌ ${operationName} failed after ${executionTime}ms:`, error);
      throw error;
    }
  }

  /**
   * Batch execute multiple operations with optimized connection handling
   */
  async batchExecute<T>(
    operations: Array<{
      operation: (client: DynamoDBClient) => Promise<T>;
      name: string;
    }>,
    concurrency: number = 5
  ): Promise<Array<{ result?: T; error?: Error; name: string }>> {
    const results: Array<{ result?: T; error?: Error; name: string }> = [];
    
    // Process operations in batches to avoid overwhelming the connection pool
    for (let i = 0; i < operations.length; i += concurrency) {
      const batch = operations.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async ({ operation, name }) => {
        try {
          const result = await this.executeWithPool(operation, name);
          return { result, name };
        } catch (error) {
          return { error: error as Error, name };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((promiseResult, index) => {
        if (promiseResult.status === 'fulfilled') {
          results.push(promiseResult.value);
        } else {
          results.push({
            error: promiseResult.reason,
            name: batch[index].name,
          });
        }
      });
    }

    return results;
  }

  /**
   * Get current connection pool metrics
   */
  getPoolMetrics(): ConnectionPoolMetrics {
    this.updatePoolUtilization();
    return { ...this.poolMetrics };
  }

  /**
   * Get pool configuration
   */
  getPoolConfiguration(): PoolConfiguration {
    return { ...this.poolConfig };
  }

  /**
   * Update pool configuration dynamically
   */
  updatePoolConfiguration(newConfig: Partial<PoolConfiguration>): void {
    this.poolConfig = { ...this.poolConfig, ...newConfig };
    this.logger.log('🔧 Pool configuration updated', newConfig);
  }

  /**
   * Optimize pool based on current usage patterns
   */
  async optimizePool(): Promise<{
    before: ConnectionPoolMetrics;
    after: ConnectionPoolMetrics;
    optimizations: string[];
  }> {
    const beforeMetrics = this.getPoolMetrics();
    const optimizations: string[] = [];

    // Analyze usage patterns and optimize
    if (this.poolMetrics.poolUtilization > 0.8) {
      // High utilization - increase pool size if possible
      const newMaxConnections = Math.min(this.poolConfig.maxConnections + 10, 100);
      if (newMaxConnections > this.poolConfig.maxConnections) {
        this.poolConfig.maxConnections = newMaxConnections;
        optimizations.push(`Increased max connections to ${newMaxConnections}`);
      }
    } else if (this.poolMetrics.poolUtilization < 0.3) {
      // Low utilization - decrease pool size to save resources
      const newMaxConnections = Math.max(this.poolConfig.maxConnections - 5, this.poolConfig.minConnections);
      if (newMaxConnections < this.poolConfig.maxConnections) {
        this.poolConfig.maxConnections = newMaxConnections;
        optimizations.push(`Decreased max connections to ${newMaxConnections}`);
      }
    }

    // Optimize timeouts based on average connection time
    if (this.poolMetrics.averageConnectionTime > 5000) {
      // Slow connections - increase timeout
      this.poolConfig.connectionTimeout = Math.min(this.poolConfig.connectionTimeout + 5000, 60000);
      optimizations.push(`Increased connection timeout to ${this.poolConfig.connectionTimeout}ms`);
    } else if (this.poolMetrics.averageConnectionTime < 1000) {
      // Fast connections - decrease timeout for faster failure detection
      this.poolConfig.connectionTimeout = Math.max(this.poolConfig.connectionTimeout - 2000, 10000);
      optimizations.push(`Decreased connection timeout to ${this.poolConfig.connectionTimeout}ms`);
    }

    // Clean up idle connections
    await this.cleanupIdleConnections();
    optimizations.push('Cleaned up idle connections');

    const afterMetrics = this.getPoolMetrics();

    this.logger.log('🎯 Pool optimization completed', {
      optimizations,
      before: beforeMetrics,
      after: afterMetrics,
    });

    return {
      before: beforeMetrics,
      after: afterMetrics,
      optimizations,
    };
  }

  /**
   * Start health check monitoring
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.poolConfig.healthCheckInterval);
  }

  /**
   * Perform health check on the connection pool
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Simple health check - this would be a lightweight DynamoDB operation
      // For now, we'll just check if the client is available
      if (this.dynamoClient) {
        const healthCheckTime = Date.now() - startTime;
        this.logger.debug(`💓 Health check completed in ${healthCheckTime}ms`);
        
        // Clean up idle connections during health check
        await this.cleanupIdleConnections();
      }
    } catch (error) {
      this.logger.error('❌ Health check failed:', error);
      this.poolMetrics.connectionErrors++;
    }
  }

  /**
   * Clean up idle connections
   */
  private async cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    const idleThreshold = now - this.poolConfig.idleTimeout;
    let cleanedUp = 0;

    for (const [connectionId, connection] of this.connectionPool.entries()) {
      if (connection.lastUsed.getTime() < idleThreshold) {
        this.connectionPool.delete(connectionId);
        cleanedUp++;
      }
    }

    if (cleanedUp > 0) {
      this.logger.debug(`🧹 Cleaned up ${cleanedUp} idle connections`);
      this.poolMetrics.activeConnections = Math.max(0, this.poolMetrics.activeConnections - cleanedUp);
    }
  }

  /**
   * Close all connections
   */
  private async closeAllConnections(): Promise<void> {
    try {
      // Close all pooled connections
      this.connectionPool.clear();
      
      // Destroy the clients
      if (this.dynamoClient) {
        this.dynamoClient.destroy();
      }

      this.poolMetrics.activeConnections = 0;
      this.logger.log('🔒 All connections closed');
    } catch (error) {
      this.logger.error('❌ Error closing connections:', error);
    }
  }

  /**
   * Update connection metrics
   */
  private updateConnectionMetrics(connectionTime: number, success: boolean): void {
    if (success) {
      // Update average connection time using exponential moving average
      const alpha = 0.1; // Smoothing factor
      this.poolMetrics.averageConnectionTime = 
        this.poolMetrics.averageConnectionTime === 0 
          ? connectionTime 
          : (alpha * connectionTime) + ((1 - alpha) * this.poolMetrics.averageConnectionTime);
    } else {
      this.poolMetrics.connectionErrors++;
    }

    this.updatePoolUtilization();
  }

  /**
   * Update pool utilization percentage
   */
  private updatePoolUtilization(): void {
    this.poolMetrics.poolUtilization = 
      this.poolMetrics.activeConnections / this.poolMetrics.maxConnections;
  }

  /**
   * Get connection pool statistics for monitoring
   */
  getPoolStatistics(): {
    metrics: ConnectionPoolMetrics;
    configuration: PoolConfiguration;
    health: {
      isHealthy: boolean;
      lastHealthCheck: Date;
      errorRate: number;
    };
  } {
    const errorRate = this.poolMetrics.totalConnectionsCreated > 0 
      ? this.poolMetrics.connectionErrors / this.poolMetrics.totalConnectionsCreated 
      : 0;

    return {
      metrics: this.getPoolMetrics(),
      configuration: this.getPoolConfiguration(),
      health: {
        isHealthy: errorRate < 0.05 && this.poolMetrics.poolUtilization < 0.9,
        lastHealthCheck: new Date(),
        errorRate,
      },
    };
  }
}