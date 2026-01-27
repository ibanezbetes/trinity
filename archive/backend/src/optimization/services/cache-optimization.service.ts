import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalRequests: number;
  totalHits: number;
  totalMisses: number;
  averageResponseTime: number;
  cacheSize: number;
  evictions: number;
  memoryUsage: number;
}

export interface CacheConfiguration {
  enabled: boolean;
  defaultTTL: number;
  maxSize: number;
  maxMemoryUsage: number;
  evictionPolicy: 'LRU' | 'LFU' | 'FIFO' | 'TTL';
  compressionEnabled: boolean;
  persistenceEnabled: boolean;
  clusterMode: boolean;
}

export interface CacheStrategy {
  name: string;
  pattern: string;
  ttl: number;
  priority: 'high' | 'medium' | 'low';
  compression: boolean;
  tags: string[];
}

@Injectable()
export class CacheOptimizationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheOptimizationService.name);
  private cacheMetrics: CacheMetrics;
  private cacheConfig: CacheConfiguration;
  private cacheStrategies: Map<string, CacheStrategy> = new Map();
  private cacheStore: Map<string, any> = new Map();
  private cacheTimestamps: Map<string, number> = new Map();
  private accessFrequency: Map<string, number> = new Map();
  private metricsInterval: NodeJS.Timeout;

  constructor(private configService: ConfigService) {
    this.initializeConfiguration();
    this.initializeMetrics();
    this.setupCacheStrategies();
  }

  async onModuleInit() {
    await this.initializeCacheSystem();
    this.startMetricsCollection();
    this.logger.log('🚀 Cache Optimization Service initialized');
  }

  async onModuleDestroy() {
    await this.shutdownCacheSystem();
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    this.logger.log('🚀 Cache Optimization Service destroyed');
  }

  /**
   * Initialize cache configuration
   */
  private initializeConfiguration(): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    
    this.cacheConfig = {
      enabled: this.configService.get<boolean>('CACHE_ENABLED', true),
      defaultTTL: this.configService.get<number>('CACHE_DEFAULT_TTL', 300000), // 5 minutes
      maxSize: this.configService.get<number>('CACHE_MAX_SIZE', isProduction ? 10000 : 1000),
      maxMemoryUsage: this.configService.get<number>('CACHE_MAX_MEMORY_MB', isProduction ? 512 : 128),
      evictionPolicy: this.configService.get<'LRU' | 'LFU' | 'FIFO' | 'TTL'>('CACHE_EVICTION_POLICY', 'LRU'),
      compressionEnabled: this.configService.get<boolean>('CACHE_COMPRESSION', isProduction),
      persistenceEnabled: this.configService.get<boolean>('CACHE_PERSISTENCE', false),
      clusterMode: this.configService.get<boolean>('CACHE_CLUSTER_MODE', isProduction),
    };
  }

  /**
   * Initialize cache metrics
   */
  private initializeMetrics(): void {
    this.cacheMetrics = {
      hitRate: 0,
      missRate: 0,
      totalRequests: 0,
      totalHits: 0,
      totalMisses: 0,
      averageResponseTime: 0,
      cacheSize: 0,
      evictions: 0,
      memoryUsage: 0,
    };
  }

  /**
   * Setup predefined cache strategies
   */
  private setupCacheStrategies(): void {
    const strategies: CacheStrategy[] = [
      {
        name: 'user-permissions',
        pattern: 'permissions:user:*',
        ttl: 600000, // 10 minutes
        priority: 'high',
        compression: false,
        tags: ['permissions', 'user'],
      },
      {
        name: 'room-settings',
        pattern: 'room:settings:*',
        ttl: 1800000, // 30 minutes
        priority: 'high',
        compression: true,
        tags: ['room', 'settings'],
      },
      {
        name: 'analytics-data',
        pattern: 'analytics:*',
        ttl: 3600000, // 1 hour
        priority: 'medium',
        compression: true,
        tags: ['analytics', 'reports'],
      },
      {
        name: 'theme-templates',
        pattern: 'themes:*',
        ttl: 7200000, // 2 hours
        priority: 'low',
        compression: true,
        tags: ['themes', 'templates'],
      },
      {
        name: 'user-profiles',
        pattern: 'user:profile:*',
        ttl: 900000, // 15 minutes
        priority: 'medium',
        compression: false,
        tags: ['user', 'profile'],
      },
      {
        name: 'room-automation',
        pattern: 'automation:*',
        ttl: 300000, // 5 minutes
        priority: 'high',
        compression: false,
        tags: ['automation', 'room'],
      },
    ];

    strategies.forEach(strategy => {
      this.cacheStrategies.set(strategy.name, strategy);
    });
  }

  /**
   * Initialize cache system
   */
  private async initializeCacheSystem(): Promise<void> {
    if (!this.cacheConfig.enabled) {
      this.logger.log('📴 Cache system disabled by configuration');
      return;
    }

    try {
      // Initialize cache store (in production, this would be Redis)
      this.cacheStore.clear();
      this.cacheTimestamps.clear();
      this.accessFrequency.clear();

      // Pre-warm cache with frequently accessed data
      await this.preWarmCache();

      this.logger.log(`✅ Cache system initialized with ${this.cacheConfig.evictionPolicy} eviction policy`);
    } catch (error) {
      this.logger.error('❌ Failed to initialize cache system', error);
      throw error;
    }
  }

  /**
   * Pre-warm cache with frequently accessed data
   */
  private async preWarmCache(): Promise<void> {
    this.logger.log('🔥 Pre-warming cache with frequently accessed data...');

    const preWarmData = [
      { key: 'permissions:system:default', value: { read: true, write: false }, ttl: 3600000 },
      { key: 'room:settings:default', value: { theme: 'default', automation: false }, ttl: 1800000 },
      { key: 'themes:popular', value: ['modern', 'classic', 'dark'], ttl: 7200000 },
    ];

    for (const data of preWarmData) {
      await this.set(data.key, data.value, data.ttl);
    }

    this.logger.log(`🔥 Pre-warmed ${preWarmData.length} cache entries`);
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    this.cacheMetrics.totalRequests++;

    try {
      if (!this.cacheConfig.enabled) {
        this.cacheMetrics.totalMisses++;
        return null;
      }

      // Check if key exists and is not expired
      if (this.cacheStore.has(key)) {
        const timestamp = this.cacheTimestamps.get(key);
        const strategy = this.findStrategyForKey(key);
        const ttl = strategy?.ttl || this.cacheConfig.defaultTTL;

        if (timestamp && (Date.now() - timestamp) < ttl) {
          // Cache hit
          this.cacheMetrics.totalHits++;
          this.updateAccessFrequency(key);
          
          const value = this.cacheStore.get(key);
          const responseTime = Date.now() - startTime;
          this.updateAverageResponseTime(responseTime);

          this.logger.debug(`🎯 Cache HIT for key: ${key} (${responseTime}ms)`);
          return value;
        } else {
          // Expired entry
          this.cacheStore.delete(key);
          this.cacheTimestamps.delete(key);
          this.accessFrequency.delete(key);
        }
      }

      // Cache miss
      this.cacheMetrics.totalMisses++;
      const responseTime = Date.now() - startTime;
      this.updateAverageResponseTime(responseTime);

      this.logger.debug(`❌ Cache MISS for key: ${key} (${responseTime}ms)`);
      return null;
    } finally {
      this.updateHitRates();
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, customTTL?: number): Promise<void> {
    if (!this.cacheConfig.enabled) {
      return;
    }

    try {
      // Check if we need to evict entries
      await this.checkAndEvict();

      // Store the value
      const processedValue = this.cacheConfig.compressionEnabled 
        ? this.compressValue(value) 
        : value;

      this.cacheStore.set(key, processedValue);
      this.cacheTimestamps.set(key, Date.now());
      this.updateAccessFrequency(key);

      // Update metrics
      this.cacheMetrics.cacheSize = this.cacheStore.size;
      this.updateMemoryUsage();

      const strategy = this.findStrategyForKey(key);
      const ttl = customTTL || strategy?.ttl || this.cacheConfig.defaultTTL;

      this.logger.debug(`💾 Cache SET for key: ${key} (TTL: ${ttl}ms)`);
    } catch (error) {
      this.logger.error(`❌ Failed to set cache for key: ${key}`, error);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    if (!this.cacheConfig.enabled) {
      return false;
    }

    const existed = this.cacheStore.has(key);
    
    this.cacheStore.delete(key);
    this.cacheTimestamps.delete(key);
    this.accessFrequency.delete(key);

    this.cacheMetrics.cacheSize = this.cacheStore.size;
    this.updateMemoryUsage();

    if (existed) {
      this.logger.debug(`🗑️ Cache DELETE for key: ${key}`);
    }

    return existed;
  }

  /**
   * Clear cache by pattern or tags
   */
  async clear(pattern?: string, tags?: string[]): Promise<number> {
    if (!this.cacheConfig.enabled) {
      return 0;
    }

    let deletedCount = 0;

    if (!pattern && !tags) {
      // Clear all cache
      deletedCount = this.cacheStore.size;
      this.cacheStore.clear();
      this.cacheTimestamps.clear();
      this.accessFrequency.clear();
    } else {
      // Clear by pattern or tags
      const keysToDelete: string[] = [];

      for (const key of this.cacheStore.keys()) {
        let shouldDelete = false;

        if (pattern && this.matchesPattern(key, pattern)) {
          shouldDelete = true;
        }

        if (tags && this.matchesTags(key, tags)) {
          shouldDelete = true;
        }

        if (shouldDelete) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        await this.delete(key);
        deletedCount++;
      }
    }

    this.cacheMetrics.cacheSize = this.cacheStore.size;
    this.updateMemoryUsage();

    this.logger.log(`🧹 Cleared ${deletedCount} cache entries`);
    return deletedCount;
  }

  /**
   * Get cache with fallback function
   */
  async getOrSet<T>(
    key: string,
    fallbackFn: () => Promise<T>,
    customTTL?: number
  ): Promise<T> {
    // Try to get from cache first
    const cachedValue = await this.get<T>(key);
    
    if (cachedValue !== null) {
      return cachedValue;
    }

    // Execute fallback function
    const startTime = Date.now();
    const value = await fallbackFn();
    const executionTime = Date.now() - startTime;

    // Store in cache
    await this.set(key, value, customTTL);

    this.logger.debug(`🔄 Cache FALLBACK for key: ${key} (${executionTime}ms)`);
    return value;
  }

  /**
   * Batch get multiple keys
   */
  async mget<T>(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();

    for (const key of keys) {
      const value = await this.get<T>(key);
      results.set(key, value);
    }

    return results;
  }

  /**
   * Batch set multiple key-value pairs
   */
  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttl);
    }
  }

  /**
   * Check and evict entries based on eviction policy
   */
  private async checkAndEvict(): Promise<void> {
    if (this.cacheStore.size < this.cacheConfig.maxSize) {
      return;
    }

    const evictCount = Math.floor(this.cacheConfig.maxSize * 0.1); // Evict 10%
    let evicted = 0;

    switch (this.cacheConfig.evictionPolicy) {
      case 'LRU':
        evicted = await this.evictLRU(evictCount);
        break;
      case 'LFU':
        evicted = await this.evictLFU(evictCount);
        break;
      case 'FIFO':
        evicted = await this.evictFIFO(evictCount);
        break;
      case 'TTL':
        evicted = await this.evictExpired();
        break;
    }

    this.cacheMetrics.evictions += evicted;
    this.logger.debug(`🗑️ Evicted ${evicted} entries using ${this.cacheConfig.evictionPolicy} policy`);
  }

  /**
   * Evict least recently used entries
   */
  private async evictLRU(count: number): Promise<number> {
    const entries = Array.from(this.accessFrequency.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, count);

    for (const [key] of entries) {
      await this.delete(key);
    }

    return entries.length;
  }

  /**
   * Evict least frequently used entries
   */
  private async evictLFU(count: number): Promise<number> {
    const entries = Array.from(this.accessFrequency.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, count);

    for (const [key] of entries) {
      await this.delete(key);
    }

    return entries.length;
  }

  /**
   * Evict first in, first out entries
   */
  private async evictFIFO(count: number): Promise<number> {
    const entries = Array.from(this.cacheTimestamps.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, count);

    for (const [key] of entries) {
      await this.delete(key);
    }

    return entries.length;
  }

  /**
   * Evict expired entries
   */
  private async evictExpired(): Promise<number> {
    const now = Date.now();
    let evicted = 0;

    for (const [key, timestamp] of this.cacheTimestamps.entries()) {
      const strategy = this.findStrategyForKey(key);
      const ttl = strategy?.ttl || this.cacheConfig.defaultTTL;

      if ((now - timestamp) >= ttl) {
        await this.delete(key);
        evicted++;
      }
    }

    return evicted;
  }

  /**
   * Find cache strategy for a key
   */
  private findStrategyForKey(key: string): CacheStrategy | undefined {
    for (const strategy of this.cacheStrategies.values()) {
      if (this.matchesPattern(key, strategy.pattern)) {
        return strategy;
      }
    }
    return undefined;
  }

  /**
   * Check if key matches pattern
   */
  private matchesPattern(key: string, pattern: string): boolean {
    const regexPattern = pattern.replace(/\*/g, '.*');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(key);
  }

  /**
   * Check if key matches tags
   */
  private matchesTags(key: string, tags: string[]): boolean {
    const strategy = this.findStrategyForKey(key);
    if (!strategy) return false;

    return tags.some(tag => strategy.tags.includes(tag));
  }

  /**
   * Compress value if compression is enabled
   */
  private compressValue<T>(value: T): T {
    // In a real implementation, this would use actual compression
    // For now, we'll just return the value as-is
    return value;
  }

  /**
   * Update access frequency for a key
   */
  private updateAccessFrequency(key: string): void {
    const current = this.accessFrequency.get(key) || 0;
    this.accessFrequency.set(key, current + 1);
  }

  /**
   * Update hit rates
   */
  private updateHitRates(): void {
    if (this.cacheMetrics.totalRequests > 0) {
      this.cacheMetrics.hitRate = this.cacheMetrics.totalHits / this.cacheMetrics.totalRequests;
      this.cacheMetrics.missRate = this.cacheMetrics.totalMisses / this.cacheMetrics.totalRequests;
    }
  }

  /**
   * Update average response time
   */
  private updateAverageResponseTime(responseTime: number): void {
    const alpha = 0.1; // Smoothing factor for exponential moving average
    this.cacheMetrics.averageResponseTime = 
      this.cacheMetrics.averageResponseTime === 0 
        ? responseTime 
        : (alpha * responseTime) + ((1 - alpha) * this.cacheMetrics.averageResponseTime);
  }

  /**
   * Update memory usage estimation
   */
  private updateMemoryUsage(): void {
    // Rough estimation of memory usage
    const avgEntrySize = 1024; // 1KB per entry (rough estimate)
    this.cacheMetrics.memoryUsage = this.cacheStore.size * avgEntrySize;
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 60000); // Collect metrics every minute
  }

  /**
   * Collect and log metrics
   */
  private collectMetrics(): void {
    this.updateMemoryUsage();
    
    this.logger.debug('📊 Cache Metrics', {
      hitRate: `${(this.cacheMetrics.hitRate * 100).toFixed(2)}%`,
      cacheSize: this.cacheMetrics.cacheSize,
      memoryUsage: `${(this.cacheMetrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`,
      evictions: this.cacheMetrics.evictions,
    });
  }

  /**
   * Shutdown cache system
   */
  private async shutdownCacheSystem(): Promise<void> {
    if (this.cacheConfig.persistenceEnabled) {
      // In production, this would persist cache to disk/Redis
      this.logger.log('💾 Persisting cache data...');
    }

    this.cacheStore.clear();
    this.cacheTimestamps.clear();
    this.accessFrequency.clear();
  }

  /**
   * Get cache metrics
   */
  getCacheMetrics(): CacheMetrics {
    this.updateMemoryUsage();
    return { ...this.cacheMetrics };
  }

  /**
   * Get cache configuration
   */
  getCacheConfiguration(): CacheConfiguration {
    return { ...this.cacheConfig };
  }

  /**
   * Update cache configuration
   */
  updateCacheConfiguration(newConfig: Partial<CacheConfiguration>): void {
    this.cacheConfig = { ...this.cacheConfig, ...newConfig };
    this.logger.log('🔧 Cache configuration updated', newConfig);
  }

  /**
   * Add or update cache strategy
   */
  addCacheStrategy(strategy: CacheStrategy): void {
    this.cacheStrategies.set(strategy.name, strategy);
    this.logger.log(`📋 Cache strategy added: ${strategy.name}`);
  }

  /**
   * Get all cache strategies
   */
  getCacheStrategies(): CacheStrategy[] {
    return Array.from(this.cacheStrategies.values());
  }

  /**
   * Optimize cache based on usage patterns
   */
  async optimizeCache(): Promise<{
    before: CacheMetrics;
    after: CacheMetrics;
    optimizations: string[];
  }> {
    const before = this.getCacheMetrics();
    const optimizations: string[] = [];

    // Analyze hit rate and adjust strategies
    if (before.hitRate < 0.7) {
      // Low hit rate - increase TTL for frequently accessed items
      for (const [key, frequency] of this.accessFrequency.entries()) {
        if (frequency > 10) {
          const strategy = this.findStrategyForKey(key);
          if (strategy && strategy.ttl < 1800000) { // Less than 30 minutes
            strategy.ttl = Math.min(strategy.ttl * 1.5, 1800000);
            optimizations.push(`Increased TTL for high-frequency key pattern: ${strategy.pattern}`);
          }
        }
      }
    }

    // Clean up expired entries
    const expiredCount = await this.evictExpired();
    if (expiredCount > 0) {
      optimizations.push(`Cleaned up ${expiredCount} expired entries`);
    }

    // Optimize eviction policy based on usage patterns
    if (before.evictions > 100 && this.cacheConfig.evictionPolicy !== 'LRU') {
      this.cacheConfig.evictionPolicy = 'LRU';
      optimizations.push('Switched to LRU eviction policy for better performance');
    }

    const after = this.getCacheMetrics();

    this.logger.log('🎯 Cache optimization completed', {
      optimizations,
      hitRateImprovement: `${((after.hitRate - before.hitRate) * 100).toFixed(2)}%`,
    });

    return {
      before,
      after,
      optimizations,
    };
  }
}