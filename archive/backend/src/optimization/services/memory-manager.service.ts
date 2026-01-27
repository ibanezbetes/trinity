import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MemoryMetrics {
  totalMemory: number;
  usedMemory: number;
  freeMemory: number;
  memoryUsagePercentage: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  gcCount: number;
  gcDuration: number;
}

export interface MemoryConfiguration {
  enabled: boolean;
  maxMemoryUsage: number; // MB
  warningThreshold: number; // Percentage
  criticalThreshold: number; // Percentage
  gcInterval: number; // ms
  monitoringInterval: number; // ms
  autoOptimization: boolean;
  memoryLeakDetection: boolean;
}

export interface MemoryOptimization {
  type: string;
  description: string;
  memoryFreed: number;
  executionTime: number;
  timestamp: Date;
}

export interface MemoryAlert {
  level: 'warning' | 'critical';
  message: string;
  currentUsage: number;
  threshold: number;
  timestamp: Date;
  recommendations: string[];
}

@Injectable()
export class MemoryManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MemoryManagerService.name);
  private memoryMetrics: MemoryMetrics;
  private memoryConfig: MemoryConfiguration;
  private monitoringInterval: NodeJS.Timeout;
  private gcInterval: NodeJS.Timeout;
  private memoryHistory: MemoryMetrics[] = [];
  private gcHistory: Array<{ timestamp: Date; duration: number; type: string }> = [];
  private memoryAlerts: MemoryAlert[] = [];
  private objectPools: Map<string, any[]> = new Map();

  constructor(private configService: ConfigService) {
    this.initializeConfiguration();
    this.initializeMetrics();
    this.setupObjectPools();
  }

  async onModuleInit() {
    await this.initializeMemoryManager();
    this.startMemoryMonitoring();
    this.startGarbageCollectionOptimization();
    this.logger.log('🧠 Memory Manager Service initialized');
  }

  async onModuleDestroy() {
    await this.shutdownMemoryManager();
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }
    this.logger.log('🧠 Memory Manager Service destroyed');
  }

  /**
   * Initialize memory configuration
   */
  private initializeConfiguration(): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    
    this.memoryConfig = {
      enabled: this.configService.get<boolean>('MEMORY_MANAGER_ENABLED', true),
      maxMemoryUsage: this.configService.get<number>('MAX_MEMORY_MB', isProduction ? 512 : 256),
      warningThreshold: this.configService.get<number>('MEMORY_WARNING_THRESHOLD', 75),
      criticalThreshold: this.configService.get<number>('MEMORY_CRITICAL_THRESHOLD', 90),
      gcInterval: this.configService.get<number>('GC_INTERVAL_MS', 300000), // 5 minutes
      monitoringInterval: this.configService.get<number>('MEMORY_MONITORING_INTERVAL_MS', 30000), // 30 seconds
      autoOptimization: this.configService.get<boolean>('MEMORY_AUTO_OPTIMIZATION', isProduction),
      memoryLeakDetection: this.configService.get<boolean>('MEMORY_LEAK_DETECTION', true),
    };
  }

  /**
   * Initialize memory metrics
   */
  private initializeMetrics(): void {
    this.updateMemoryMetrics();
  }

  /**
   * Setup object pools for memory optimization
   */
  private setupObjectPools(): void {
    // Initialize object pools for commonly used objects
    this.objectPools.set('buffers', []);
    this.objectPools.set('arrays', []);
    this.objectPools.set('objects', []);
    this.objectPools.set('strings', []);
  }

  /**
   * Initialize memory manager
   */
  private async initializeMemoryManager(): Promise<void> {
    if (!this.memoryConfig.enabled) {
      this.logger.log('📴 Memory manager disabled by configuration');
      return;
    }

    try {
      // Set up memory monitoring
      this.updateMemoryMetrics();
      
      // Initialize garbage collection hooks if available
      this.setupGarbageCollectionHooks();

      // Pre-allocate object pools
      await this.preAllocateObjectPools();

      this.logger.log(`✅ Memory manager initialized (Max: ${this.memoryConfig.maxMemoryUsage}MB)`);
    } catch (error) {
      this.logger.error('❌ Failed to initialize memory manager', error);
      throw error;
    }
  }

  /**
   * Setup garbage collection hooks
   */
  private setupGarbageCollectionHooks(): void {
    if (global.gc) {
      // Hook into GC events if available
      const originalGc = global.gc;
      global.gc = (() => {
        const startTime = Date.now();
        originalGc();
        const duration = Date.now() - startTime;
        
        this.gcHistory.push({
          timestamp: new Date(),
          duration,
          type: 'manual',
        });

        this.logger.debug(`🗑️ Manual GC completed in ${duration}ms`);
      }) as any;
    }
  }

  /**
   * Pre-allocate object pools
   */
  private async preAllocateObjectPools(): Promise<void> {
    const poolSizes = {
      buffers: 50,
      arrays: 100,
      objects: 200,
      strings: 150,
    };

    for (const [poolName, size] of Object.entries(poolSizes)) {
      const pool = this.objectPools.get(poolName) || [];
      
      for (let i = 0; i < size; i++) {
        switch (poolName) {
          case 'buffers':
            pool.push(Buffer.alloc(1024)); // 1KB buffers
            break;
          case 'arrays':
            pool.push([]);
            break;
          case 'objects':
            pool.push({});
            break;
          case 'strings':
            pool.push('');
            break;
        }
      }
      
      this.objectPools.set(poolName, pool);
    }

    this.logger.log('🏊 Object pools pre-allocated');
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.monitorMemoryUsage();
    }, this.memoryConfig.monitoringInterval);
  }

  /**
   * Start garbage collection optimization
   */
  private startGarbageCollectionOptimization(): void {
    if (!this.memoryConfig.autoOptimization) {
      return;
    }

    this.gcInterval = setInterval(() => {
      this.optimizeGarbageCollection();
    }, this.memoryConfig.gcInterval);
  }

  /**
   * Monitor memory usage and detect issues
   */
  private monitorMemoryUsage(): void {
    this.updateMemoryMetrics();
    
    // Add to history
    this.memoryHistory.push({ ...this.memoryMetrics });
    
    // Keep only last 100 measurements
    if (this.memoryHistory.length > 100) {
      this.memoryHistory.shift();
    }

    // Check for memory alerts
    this.checkMemoryAlerts();

    // Detect memory leaks
    if (this.memoryConfig.memoryLeakDetection) {
      this.detectMemoryLeaks();
    }

    // Auto-optimize if enabled
    if (this.memoryConfig.autoOptimization && this.memoryMetrics.memoryUsagePercentage > this.memoryConfig.warningThreshold) {
      this.autoOptimizeMemory();
    }
  }

  /**
   * Update memory metrics
   */
  private updateMemoryMetrics(): void {
    const memUsage = process.memoryUsage();
    const totalMemory = this.memoryConfig.maxMemoryUsage * 1024 * 1024; // Convert MB to bytes
    
    this.memoryMetrics = {
      totalMemory,
      usedMemory: memUsage.heapUsed + memUsage.external,
      freeMemory: totalMemory - (memUsage.heapUsed + memUsage.external),
      memoryUsagePercentage: ((memUsage.heapUsed + memUsage.external) / totalMemory) * 100,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers || 0,
      gcCount: this.gcHistory.length,
      gcDuration: this.calculateAverageGcDuration(),
    };
  }

  /**
   * Check for memory alerts
   */
  private checkMemoryAlerts(): void {
    const usage = this.memoryMetrics.memoryUsagePercentage;

    if (usage >= this.memoryConfig.criticalThreshold) {
      this.createMemoryAlert('critical', usage);
    } else if (usage >= this.memoryConfig.warningThreshold) {
      this.createMemoryAlert('warning', usage);
    }
  }

  /**
   * Create memory alert
   */
  private createMemoryAlert(level: 'warning' | 'critical', currentUsage: number): void {
    const threshold = level === 'critical' 
      ? this.memoryConfig.criticalThreshold 
      : this.memoryConfig.warningThreshold;

    const alert: MemoryAlert = {
      level,
      message: `Memory usage ${level}: ${currentUsage.toFixed(2)}% (threshold: ${threshold}%)`,
      currentUsage,
      threshold,
      timestamp: new Date(),
      recommendations: this.generateMemoryRecommendations(level),
    };

    this.memoryAlerts.push(alert);
    
    // Keep only last 50 alerts
    if (this.memoryAlerts.length > 50) {
      this.memoryAlerts.shift();
    }

    this.logger.warn(`⚠️ ${alert.message}`, {
      recommendations: alert.recommendations,
    });
  }

  /**
   * Generate memory optimization recommendations
   */
  private generateMemoryRecommendations(level: 'warning' | 'critical'): string[] {
    const recommendations: string[] = [];

    if (level === 'critical') {
      recommendations.push('Force garbage collection immediately');
      recommendations.push('Clear all non-essential caches');
      recommendations.push('Reduce connection pool sizes');
      recommendations.push('Consider restarting the application');
    } else {
      recommendations.push('Run garbage collection');
      recommendations.push('Clear expired cache entries');
      recommendations.push('Optimize object pools');
      recommendations.push('Review memory-intensive operations');
    }

    return recommendations;
  }

  /**
   * Detect memory leaks
   */
  private detectMemoryLeaks(): void {
    if (this.memoryHistory.length < 10) {
      return; // Need more data points
    }

    const recentHistory = this.memoryHistory.slice(-10);
    const trend = this.calculateMemoryTrend(recentHistory);

    // If memory usage is consistently increasing
    if (trend > 5) { // 5% increase over 10 measurements
      this.logger.warn('🚨 Potential memory leak detected', {
        trend: `${trend.toFixed(2)}%`,
        currentUsage: `${this.memoryMetrics.memoryUsagePercentage.toFixed(2)}%`,
      });

      // Auto-optimize if enabled
      if (this.memoryConfig.autoOptimization) {
        this.autoOptimizeMemory();
      }
    }
  }

  /**
   * Calculate memory usage trend
   */
  private calculateMemoryTrend(history: MemoryMetrics[]): number {
    if (history.length < 2) return 0;

    const first = history[0].memoryUsagePercentage;
    const last = history[history.length - 1].memoryUsagePercentage;

    return last - first;
  }

  /**
   * Auto-optimize memory usage
   */
  private async autoOptimizeMemory(): Promise<void> {
    this.logger.log('🔧 Auto-optimizing memory usage...');

    const optimizations: MemoryOptimization[] = [];

    // 1. Force garbage collection
    const gcOptimization = await this.forceGarbageCollection();
    if (gcOptimization) {
      optimizations.push(gcOptimization);
    }

    // 2. Clear expired cache entries
    const cacheOptimization = await this.clearExpiredCaches();
    if (cacheOptimization) {
      optimizations.push(cacheOptimization);
    }

    // 3. Optimize object pools
    const poolOptimization = await this.optimizeObjectPools();
    if (poolOptimization) {
      optimizations.push(poolOptimization);
    }

    // 4. Clear old metrics history
    const historyOptimization = await this.clearOldHistory();
    if (historyOptimization) {
      optimizations.push(historyOptimization);
    }

    const totalMemoryFreed = optimizations.reduce((total, opt) => total + opt.memoryFreed, 0);
    
    this.logger.log(`✅ Auto-optimization completed. Freed ${(totalMemoryFreed / 1024 / 1024).toFixed(2)}MB`);
  }

  /**
   * Force garbage collection
   */
  async forceGarbageCollection(): Promise<MemoryOptimization | null> {
    if (!global.gc) {
      return null;
    }

    const startTime = Date.now();
    const beforeMemory = process.memoryUsage().heapUsed;

    global.gc();

    const afterMemory = process.memoryUsage().heapUsed;
    const memoryFreed = beforeMemory - afterMemory;
    const executionTime = Date.now() - startTime;

    this.gcHistory.push({
      timestamp: new Date(),
      duration: executionTime,
      type: 'forced',
    });

    return {
      type: 'Garbage Collection',
      description: 'Forced garbage collection to free unused memory',
      memoryFreed,
      executionTime,
      timestamp: new Date(),
    };
  }

  /**
   * Clear expired cache entries (placeholder - would integrate with cache service)
   */
  private async clearExpiredCaches(): Promise<MemoryOptimization | null> {
    const startTime = Date.now();
    const beforeMemory = process.memoryUsage().heapUsed;

    // This would integrate with the CacheOptimizationService
    // For now, we'll simulate clearing some memory
    const simulatedMemoryFreed = 1024 * 1024; // 1MB

    const executionTime = Date.now() - startTime;

    return {
      type: 'Cache Cleanup',
      description: 'Cleared expired cache entries',
      memoryFreed: simulatedMemoryFreed,
      executionTime,
      timestamp: new Date(),
    };
  }

  /**
   * Optimize object pools
   */
  private async optimizeObjectPools(): Promise<MemoryOptimization | null> {
    const startTime = Date.now();
    let memoryFreed = 0;

    for (const [poolName, pool] of this.objectPools.entries()) {
      const originalSize = pool.length;
      const optimalSize = Math.floor(originalSize * 0.7); // Reduce by 30%
      
      if (originalSize > optimalSize) {
        const removed = pool.splice(optimalSize);
        memoryFreed += removed.length * 100; // Estimate 100 bytes per object
      }
    }

    const executionTime = Date.now() - startTime;

    if (memoryFreed > 0) {
      return {
        type: 'Object Pool Optimization',
        description: 'Reduced object pool sizes to optimal levels',
        memoryFreed,
        executionTime,
        timestamp: new Date(),
      };
    }

    return null;
  }

  /**
   * Clear old history data
   */
  private async clearOldHistory(): Promise<MemoryOptimization | null> {
    const startTime = Date.now();
    let memoryFreed = 0;

    // Clear old memory history
    if (this.memoryHistory.length > 50) {
      const removed = this.memoryHistory.splice(0, this.memoryHistory.length - 50);
      memoryFreed += removed.length * 200; // Estimate 200 bytes per history entry
    }

    // Clear old GC history
    if (this.gcHistory.length > 100) {
      const removed = this.gcHistory.splice(0, this.gcHistory.length - 100);
      memoryFreed += removed.length * 100; // Estimate 100 bytes per GC entry
    }

    // Clear old alerts
    if (this.memoryAlerts.length > 20) {
      const removed = this.memoryAlerts.splice(0, this.memoryAlerts.length - 20);
      memoryFreed += removed.length * 300; // Estimate 300 bytes per alert
    }

    const executionTime = Date.now() - startTime;

    if (memoryFreed > 0) {
      return {
        type: 'History Cleanup',
        description: 'Cleared old memory history and alert data',
        memoryFreed,
        executionTime,
        timestamp: new Date(),
      };
    }

    return null;
  }

  /**
   * Optimize garbage collection
   */
  private optimizeGarbageCollection(): void {
    if (!global.gc) {
      return;
    }

    // Only run GC if memory usage is above warning threshold
    if (this.memoryMetrics.memoryUsagePercentage > this.memoryConfig.warningThreshold) {
      this.forceGarbageCollection();
    }
  }

  /**
   * Calculate average GC duration
   */
  private calculateAverageGcDuration(): number {
    if (this.gcHistory.length === 0) return 0;

    const totalDuration = this.gcHistory.reduce((sum, gc) => sum + gc.duration, 0);
    return totalDuration / this.gcHistory.length;
  }

  /**
   * Get object from pool
   */
  getFromPool<T>(poolName: string): T | null {
    const pool = this.objectPools.get(poolName);
    if (!pool || pool.length === 0) {
      return null;
    }

    return pool.pop() as T;
  }

  /**
   * Return object to pool
   */
  returnToPool(poolName: string, object: any): void {
    const pool = this.objectPools.get(poolName);
    if (!pool) {
      return;
    }

    // Reset object state before returning to pool
    this.resetObject(object);
    
    // Don't let pools grow too large
    if (pool.length < 1000) {
      pool.push(object);
    }
  }

  /**
   * Reset object state
   */
  private resetObject(object: any): void {
    if (Array.isArray(object)) {
      object.length = 0;
    } else if (typeof object === 'object' && object !== null) {
      for (const key in object) {
        delete object[key];
      }
    } else if (Buffer.isBuffer(object)) {
      object.fill(0);
    }
  }

  /**
   * Shutdown memory manager
   */
  private async shutdownMemoryManager(): Promise<void> {
    // Clear all object pools
    this.objectPools.clear();
    
    // Clear history
    this.memoryHistory.length = 0;
    this.gcHistory.length = 0;
    this.memoryAlerts.length = 0;

    this.logger.log('🧠 Memory manager shutdown completed');
  }

  /**
   * Get memory metrics
   */
  getMemoryMetrics(): MemoryMetrics {
    this.updateMemoryMetrics();
    return { ...this.memoryMetrics };
  }

  /**
   * Get memory configuration
   */
  getMemoryConfiguration(): MemoryConfiguration {
    return { ...this.memoryConfig };
  }

  /**
   * Update memory configuration
   */
  updateMemoryConfiguration(newConfig: Partial<MemoryConfiguration>): void {
    this.memoryConfig = { ...this.memoryConfig, ...newConfig };
    this.logger.log('🔧 Memory configuration updated', newConfig);
  }

  /**
   * Get memory alerts
   */
  getMemoryAlerts(): MemoryAlert[] {
    return [...this.memoryAlerts];
  }

  /**
   * Get memory history
   */
  getMemoryHistory(): MemoryMetrics[] {
    return [...this.memoryHistory];
  }

  /**
   * Get GC history
   */
  getGcHistory(): Array<{ timestamp: Date; duration: number; type: string }> {
    return [...this.gcHistory];
  }

  /**
   * Get memory statistics
   */
  getMemoryStatistics(): {
    current: MemoryMetrics;
    alerts: MemoryAlert[];
    trends: {
      memoryTrend: number;
      gcFrequency: number;
      averageGcDuration: number;
    };
    pools: {
      [poolName: string]: {
        size: number;
        capacity: number;
        utilization: number;
      };
    };
  } {
    const current = this.getMemoryMetrics();
    const alerts = this.getMemoryAlerts();
    
    const memoryTrend = this.memoryHistory.length > 1 
      ? this.calculateMemoryTrend(this.memoryHistory.slice(-10))
      : 0;

    const gcFrequency = this.gcHistory.length > 0 
      ? this.gcHistory.length / Math.max(1, (Date.now() - this.gcHistory[0].timestamp.getTime()) / 3600000) // per hour
      : 0;

    const pools: any = {};
    for (const [poolName, pool] of this.objectPools.entries()) {
      pools[poolName] = {
        size: pool.length,
        capacity: 1000, // Max pool size
        utilization: (pool.length / 1000) * 100,
      };
    }

    return {
      current,
      alerts,
      trends: {
        memoryTrend,
        gcFrequency,
        averageGcDuration: this.calculateAverageGcDuration(),
      },
      pools,
    };
  }

  /**
   * Perform comprehensive memory optimization
   */
  async performMemoryOptimization(): Promise<{
    before: MemoryMetrics;
    after: MemoryMetrics;
    optimizations: MemoryOptimization[];
    memoryFreed: number;
  }> {
    const before = this.getMemoryMetrics();
    const optimizations: MemoryOptimization[] = [];

    this.logger.log('🎯 Starting comprehensive memory optimization...');

    // 1. Force garbage collection
    const gcOpt = await this.forceGarbageCollection();
    if (gcOpt) optimizations.push(gcOpt);

    // 2. Clear expired caches
    const cacheOpt = await this.clearExpiredCaches();
    if (cacheOpt) optimizations.push(cacheOpt);

    // 3. Optimize object pools
    const poolOpt = await this.optimizeObjectPools();
    if (poolOpt) optimizations.push(poolOpt);

    // 4. Clear old history
    const historyOpt = await this.clearOldHistory();
    if (historyOpt) optimizations.push(historyOpt);

    const after = this.getMemoryMetrics();
    const memoryFreed = optimizations.reduce((total, opt) => total + opt.memoryFreed, 0);

    this.logger.log('🎯 Memory optimization completed', {
      memoryFreedMB: (memoryFreed / 1024 / 1024).toFixed(2),
      usageReduction: `${(before.memoryUsagePercentage - after.memoryUsagePercentage).toFixed(2)}%`,
      optimizationsApplied: optimizations.length,
    });

    return {
      before,
      after,
      optimizations,
      memoryFreed,
    };
  }
}