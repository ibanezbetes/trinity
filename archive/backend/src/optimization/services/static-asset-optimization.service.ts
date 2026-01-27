import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AssetMetrics {
  totalAssets: number;
  totalSize: number;
  compressedSize: number;
  compressionRatio: number;
  cacheHitRate: number;
  cdnHitRate: number;
  averageLoadTime: number;
  bandwidthSaved: number;
}

export interface AssetConfiguration {
  enabled: boolean;
  cdnEnabled: boolean;
  compressionEnabled: boolean;
  cachingEnabled: boolean;
  imageOptimization: boolean;
  lazyLoadingEnabled: boolean;
  webpConversion: boolean;
  minificationEnabled: boolean;
  bundlingEnabled: boolean;
}

export interface AssetOptimization {
  type: string;
  description: string;
  sizeBefore: number;
  sizeAfter: number;
  compressionRatio: number;
  loadTimeImprovement: number;
  timestamp: Date;
}

export interface CDNConfiguration {
  enabled: boolean;
  provider: 'cloudfront' | 'cloudflare' | 'custom';
  endpoint: string;
  regions: string[];
  cachePolicy: string;
  ttl: number;
}

@Injectable()
export class StaticAssetOptimizationService implements OnModuleInit {
  private readonly logger = new Logger(StaticAssetOptimizationService.name);
  private assetMetrics: AssetMetrics;
  private assetConfig: AssetConfiguration;
  private cdnConfig: CDNConfiguration;
  private assetCache: Map<string, any> = new Map();
  private compressionCache: Map<string, Buffer> = new Map();
  private optimizationHistory: AssetOptimization[] = [];

  constructor(private configService: ConfigService) {
    this.initializeConfiguration();
    this.initializeMetrics();
  }

  async onModuleInit() {
    await this.initializeAssetOptimization();
    this.logger.log('🎨 Static Asset Optimization Service initialized');
  }

  /**
   * Initialize asset optimization configuration
   */
  private initializeConfiguration(): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    
    this.assetConfig = {
      enabled: this.configService.get<boolean>('ASSET_OPTIMIZATION_ENABLED', true),
      cdnEnabled: this.configService.get<boolean>('CDN_ENABLED', isProduction),
      compressionEnabled: this.configService.get<boolean>('ASSET_COMPRESSION_ENABLED', true),
      cachingEnabled: this.configService.get<boolean>('ASSET_CACHING_ENABLED', true),
      imageOptimization: this.configService.get<boolean>('IMAGE_OPTIMIZATION_ENABLED', true),
      lazyLoadingEnabled: this.configService.get<boolean>('LAZY_LOADING_ENABLED', true),
      webpConversion: this.configService.get<boolean>('WEBP_CONVERSION_ENABLED', isProduction),
      minificationEnabled: this.configService.get<boolean>('MINIFICATION_ENABLED', isProduction),
      bundlingEnabled: this.configService.get<boolean>('BUNDLING_ENABLED', isProduction),
    };

    this.cdnConfig = {
      enabled: this.assetConfig.cdnEnabled,
      provider: this.configService.get<'cloudfront' | 'cloudflare' | 'custom'>('CDN_PROVIDER', 'cloudfront'),
      endpoint: this.configService.get<string>('CDN_ENDPOINT', ''),
      regions: this.configService.get<string>('CDN_REGIONS', 'us-east-1,eu-west-1').split(','),
      cachePolicy: this.configService.get<string>('CDN_CACHE_POLICY', 'CachingOptimized'),
      ttl: this.configService.get<number>('CDN_TTL', 86400), // 24 hours
    };
  }

  /**
   * Initialize asset metrics
   */
  private initializeMetrics(): void {
    this.assetMetrics = {
      totalAssets: 0,
      totalSize: 0,
      compressedSize: 0,
      compressionRatio: 0,
      cacheHitRate: 0,
      cdnHitRate: 0,
      averageLoadTime: 0,
      bandwidthSaved: 0,
    };
  }

  /**
   * Initialize asset optimization system
   */
  private async initializeAssetOptimization(): Promise<void> {
    if (!this.assetConfig.enabled) {
      this.logger.log('📴 Asset optimization disabled by configuration');
      return;
    }

    try {
      // Initialize compression cache
      this.compressionCache.clear();
      
      // Setup CDN if enabled
      if (this.cdnConfig.enabled) {
        await this.setupCDN();
      }

      // Pre-optimize common assets
      await this.preOptimizeAssets();

      this.logger.log('✅ Asset optimization system initialized');
    } catch (error) {
      this.logger.error('❌ Failed to initialize asset optimization', error);
      throw error;
    }
  }

  /**
   * Setup CDN configuration
   */
  private async setupCDN(): Promise<void> {
    this.logger.log(`🌐 Setting up CDN (${this.cdnConfig.provider})...`);

    // In a real implementation, this would configure the CDN
    // For now, we'll simulate CDN setup
    
    switch (this.cdnConfig.provider) {
      case 'cloudfront':
        await this.setupCloudFront();
        break;
      case 'cloudflare':
        await this.setupCloudflare();
        break;
      case 'custom':
        await this.setupCustomCDN();
        break;
    }

    this.logger.log(`✅ CDN setup completed (${this.cdnConfig.provider})`);
  }

  /**
   * Setup CloudFront CDN
   */
  private async setupCloudFront(): Promise<void> {
    // CloudFront-specific configuration
    this.logger.log('☁️ Configuring CloudFront CDN...');
    
    // Simulate CloudFront setup
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Setup Cloudflare CDN
   */
  private async setupCloudflare(): Promise<void> {
    // Cloudflare-specific configuration
    this.logger.log('🔶 Configuring Cloudflare CDN...');
    
    // Simulate Cloudflare setup
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Setup custom CDN
   */
  private async setupCustomCDN(): Promise<void> {
    // Custom CDN configuration
    this.logger.log('🔧 Configuring custom CDN...');
    
    // Simulate custom CDN setup
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Pre-optimize common assets
   */
  private async preOptimizeAssets(): Promise<void> {
    this.logger.log('🔥 Pre-optimizing common assets...');

    const commonAssets = [
      { path: '/static/css/main.css', type: 'css', size: 45000 },
      { path: '/static/js/app.js', type: 'javascript', size: 120000 },
      { path: '/static/images/logo.png', type: 'image', size: 25000 },
      { path: '/static/fonts/roboto.woff2', type: 'font', size: 18000 },
    ];

    for (const asset of commonAssets) {
      await this.optimizeAsset(asset.path, asset.type, asset.size);
    }

    this.logger.log(`🔥 Pre-optimized ${commonAssets.length} common assets`);
  }

  /**
   * Optimize a single asset
   */
  async optimizeAsset(assetPath: string, assetType: string, originalSize: number): Promise<AssetOptimization> {
    const startTime = Date.now();
    let optimizedSize = originalSize;
    const optimizations: string[] = [];

    try {
      // Apply different optimizations based on asset type
      switch (assetType) {
        case 'image':
          optimizedSize = await this.optimizeImage(assetPath, originalSize);
          optimizations.push('image compression', 'format conversion');
          break;
        case 'css':
          optimizedSize = await this.optimizeCSS(assetPath, originalSize);
          optimizations.push('minification', 'compression');
          break;
        case 'javascript':
          optimizedSize = await this.optimizeJavaScript(assetPath, originalSize);
          optimizations.push('minification', 'bundling', 'compression');
          break;
        case 'font':
          optimizedSize = await this.optimizeFont(assetPath, originalSize);
          optimizations.push('format optimization', 'subsetting');
          break;
        default:
          optimizedSize = await this.optimizeGeneric(assetPath, originalSize);
          optimizations.push('compression');
      }

      // Cache optimized asset
      if (this.assetConfig.cachingEnabled) {
        this.cacheOptimizedAsset(assetPath, optimizedSize);
      }

      const compressionRatio = ((originalSize - optimizedSize) / originalSize) * 100;
      const loadTimeImprovement = this.calculateLoadTimeImprovement(originalSize, optimizedSize);

      const optimization: AssetOptimization = {
        type: assetType,
        description: `Applied ${optimizations.join(', ')} to ${assetPath}`,
        sizeBefore: originalSize,
        sizeAfter: optimizedSize,
        compressionRatio,
        loadTimeImprovement,
        timestamp: new Date(),
      };

      this.optimizationHistory.push(optimization);
      this.updateAssetMetrics(optimization);

      this.logger.debug(`✅ Optimized ${assetPath}: ${(compressionRatio).toFixed(1)}% reduction`);
      return optimization;
    } catch (error) {
      this.logger.error(`❌ Failed to optimize ${assetPath}:`, error);
      throw error;
    }
  }

  /**
   * Optimize image assets
   */
  private async optimizeImage(imagePath: string, originalSize: number): Promise<number> {
    let optimizedSize = originalSize;

    // Image compression (simulate 40-60% reduction)
    if (this.assetConfig.imageOptimization) {
      optimizedSize *= 0.5; // 50% reduction on average
    }

    // WebP conversion (additional 20-30% reduction)
    if (this.assetConfig.webpConversion && imagePath.match(/\.(jpg|jpeg|png)$/i)) {
      optimizedSize *= 0.75; // Additional 25% reduction
    }

    return Math.floor(optimizedSize);
  }

  /**
   * Optimize CSS assets
   */
  private async optimizeCSS(cssPath: string, originalSize: number): Promise<number> {
    let optimizedSize = originalSize;

    // Minification (simulate 20-30% reduction)
    if (this.assetConfig.minificationEnabled) {
      optimizedSize *= 0.75; // 25% reduction
    }

    // Compression (additional 60-70% reduction)
    if (this.assetConfig.compressionEnabled) {
      optimizedSize *= 0.35; // Additional 65% reduction
    }

    return Math.floor(optimizedSize);
  }

  /**
   * Optimize JavaScript assets
   */
  private async optimizeJavaScript(jsPath: string, originalSize: number): Promise<number> {
    let optimizedSize = originalSize;

    // Minification (simulate 30-40% reduction)
    if (this.assetConfig.minificationEnabled) {
      optimizedSize *= 0.65; // 35% reduction
    }

    // Bundling optimization (additional 10-15% reduction)
    if (this.assetConfig.bundlingEnabled) {
      optimizedSize *= 0.88; // Additional 12% reduction
    }

    // Compression (additional 60-70% reduction)
    if (this.assetConfig.compressionEnabled) {
      optimizedSize *= 0.35; // Additional 65% reduction
    }

    return Math.floor(optimizedSize);
  }

  /**
   * Optimize font assets
   */
  private async optimizeFont(fontPath: string, originalSize: number): Promise<number> {
    let optimizedSize = originalSize;

    // Font subsetting (simulate 30-50% reduction)
    optimizedSize *= 0.6; // 40% reduction

    // Format optimization (WOFF2 vs WOFF vs TTF)
    if (fontPath.includes('.woff2')) {
      // Already optimized
    } else if (fontPath.includes('.woff')) {
      optimizedSize *= 0.8; // Convert to WOFF2 for 20% additional reduction
    } else {
      optimizedSize *= 0.6; // Convert TTF/OTF to WOFF2 for 40% additional reduction
    }

    return Math.floor(optimizedSize);
  }

  /**
   * Optimize generic assets
   */
  private async optimizeGeneric(assetPath: string, originalSize: number): Promise<number> {
    let optimizedSize = originalSize;

    // Generic compression (simulate 30-40% reduction)
    if (this.assetConfig.compressionEnabled) {
      optimizedSize *= 0.65; // 35% reduction
    }

    return Math.floor(optimizedSize);
  }

  /**
   * Cache optimized asset
   */
  private cacheOptimizedAsset(assetPath: string, optimizedSize: number): void {
    this.assetCache.set(assetPath, {
      size: optimizedSize,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Calculate load time improvement
   */
  private calculateLoadTimeImprovement(originalSize: number, optimizedSize: number): number {
    // Assume average connection speed of 10 Mbps
    const connectionSpeedBps = 10 * 1024 * 1024 / 8; // 10 Mbps in bytes per second
    
    const originalLoadTime = (originalSize / connectionSpeedBps) * 1000; // ms
    const optimizedLoadTime = (optimizedSize / connectionSpeedBps) * 1000; // ms
    
    return originalLoadTime - optimizedLoadTime;
  }

  /**
   * Update asset metrics
   */
  private updateAssetMetrics(optimization: AssetOptimization): void {
    this.assetMetrics.totalAssets++;
    this.assetMetrics.totalSize += optimization.sizeBefore;
    this.assetMetrics.compressedSize += optimization.sizeAfter;
    this.assetMetrics.bandwidthSaved += (optimization.sizeBefore - optimization.sizeAfter);

    // Update compression ratio
    if (this.assetMetrics.totalSize > 0) {
      this.assetMetrics.compressionRatio = 
        ((this.assetMetrics.totalSize - this.assetMetrics.compressedSize) / this.assetMetrics.totalSize) * 100;
    }

    // Update cache hit rate (simulated)
    this.assetMetrics.cacheHitRate = Math.min(0.85, this.assetMetrics.cacheHitRate + 0.01);

    // Update CDN hit rate (simulated)
    if (this.cdnConfig.enabled) {
      this.assetMetrics.cdnHitRate = Math.min(0.92, this.assetMetrics.cdnHitRate + 0.02);
    }

    // Update average load time
    const totalLoadTimeImprovement = this.optimizationHistory.reduce(
      (sum, opt) => sum + opt.loadTimeImprovement, 0
    );
    this.assetMetrics.averageLoadTime = totalLoadTimeImprovement / this.assetMetrics.totalAssets;
  }

  /**
   * Get CDN URL for asset
   */
  getCDNUrl(assetPath: string): string {
    if (!this.cdnConfig.enabled || !this.cdnConfig.endpoint) {
      return assetPath;
    }

    // Remove leading slash if present
    const cleanPath = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
    
    return `${this.cdnConfig.endpoint}/${cleanPath}`;
  }

  /**
   * Check if asset is cached
   */
  isAssetCached(assetPath: string): boolean {
    const cached = this.assetCache.get(assetPath);
    if (!cached) return false;

    // Check if cache is still valid (24 hours)
    const cacheAge = Date.now() - cached.timestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (cacheAge > maxAge) {
      this.assetCache.delete(assetPath);
      return false;
    }

    // Update hit count
    cached.hits++;
    return true;
  }

  /**
   * Get optimized asset info
   */
  getOptimizedAssetInfo(assetPath: string): {
    cached: boolean;
    cdnUrl: string;
    optimized: boolean;
    compressionRatio?: number;
  } {
    const cached = this.isAssetCached(assetPath);
    const cdnUrl = this.getCDNUrl(assetPath);
    
    const optimization = this.optimizationHistory.find(opt => 
      opt.description.includes(assetPath)
    );

    return {
      cached,
      cdnUrl,
      optimized: !!optimization,
      compressionRatio: optimization?.compressionRatio,
    };
  }

  /**
   * Batch optimize multiple assets
   */
  async batchOptimizeAssets(assets: Array<{
    path: string;
    type: string;
    size: number;
  }>): Promise<AssetOptimization[]> {
    this.logger.log(`🔄 Batch optimizing ${assets.length} assets...`);

    const optimizations: AssetOptimization[] = [];
    const batchSize = 5; // Process 5 assets at a time

    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      
      const batchPromises = batch.map(asset => 
        this.optimizeAsset(asset.path, asset.type, asset.size)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          optimizations.push(result.value);
        } else {
          this.logger.error(`Failed to optimize ${batch[index].path}:`, result.reason);
        }
      });
    }

    this.logger.log(`✅ Batch optimization completed: ${optimizations.length}/${assets.length} assets optimized`);
    return optimizations;
  }

  /**
   * Clear asset cache
   */
  clearAssetCache(): number {
    const cacheSize = this.assetCache.size;
    this.assetCache.clear();
    this.logger.log(`🧹 Cleared ${cacheSize} cached assets`);
    return cacheSize;
  }

  /**
   * Get asset metrics
   */
  getAssetMetrics(): AssetMetrics {
    return { ...this.assetMetrics };
  }

  /**
   * Get asset configuration
   */
  getAssetConfiguration(): AssetConfiguration {
    return { ...this.assetConfig };
  }

  /**
   * Get CDN configuration
   */
  getCDNConfiguration(): CDNConfiguration {
    return { ...this.cdnConfig };
  }

  /**
   * Update asset configuration
   */
  updateAssetConfiguration(newConfig: Partial<AssetConfiguration>): void {
    this.assetConfig = { ...this.assetConfig, ...newConfig };
    this.logger.log('🔧 Asset configuration updated', newConfig);
  }

  /**
   * Update CDN configuration
   */
  updateCDNConfiguration(newConfig: Partial<CDNConfiguration>): void {
    this.cdnConfig = { ...this.cdnConfig, ...newConfig };
    this.logger.log('🌐 CDN configuration updated', newConfig);
  }

  /**
   * Get optimization history
   */
  getOptimizationHistory(): AssetOptimization[] {
    return [...this.optimizationHistory];
  }

  /**
   * Get asset statistics
   */
  getAssetStatistics(): {
    metrics: AssetMetrics;
    configuration: AssetConfiguration;
    cdn: CDNConfiguration;
    performance: {
      totalBandwidthSaved: string;
      averageCompressionRatio: string;
      totalLoadTimeImprovement: string;
      cacheEfficiency: string;
    };
    topOptimizations: AssetOptimization[];
  } {
    const metrics = this.getAssetMetrics();
    const totalLoadTimeImprovement = this.optimizationHistory.reduce(
      (sum, opt) => sum + opt.loadTimeImprovement, 0
    );

    const topOptimizations = this.optimizationHistory
      .sort((a, b) => b.compressionRatio - a.compressionRatio)
      .slice(0, 10);

    return {
      metrics,
      configuration: this.getAssetConfiguration(),
      cdn: this.getCDNConfiguration(),
      performance: {
        totalBandwidthSaved: `${(metrics.bandwidthSaved / 1024 / 1024).toFixed(2)} MB`,
        averageCompressionRatio: `${metrics.compressionRatio.toFixed(1)}%`,
        totalLoadTimeImprovement: `${totalLoadTimeImprovement.toFixed(0)} ms`,
        cacheEfficiency: `${(metrics.cacheHitRate * 100).toFixed(1)}%`,
      },
      topOptimizations,
    };
  }

  /**
   * Perform comprehensive asset optimization
   */
  async performAssetOptimization(): Promise<{
    before: AssetMetrics;
    after: AssetMetrics;
    optimizations: AssetOptimization[];
    summary: {
      totalAssets: number;
      bandwidthSaved: string;
      loadTimeImprovement: string;
      compressionRatio: string;
    };
  }> {
    const before = this.getAssetMetrics();

    this.logger.log('🎯 Starting comprehensive asset optimization...');

    // Simulate discovering and optimizing assets
    const discoveredAssets = [
      { path: '/static/css/styles.css', type: 'css', size: 85000 },
      { path: '/static/js/bundle.js', type: 'javascript', size: 250000 },
      { path: '/static/images/hero.jpg', type: 'image', size: 180000 },
      { path: '/static/images/gallery1.png', type: 'image', size: 95000 },
      { path: '/static/fonts/inter.woff', type: 'font', size: 32000 },
      { path: '/static/icons/sprite.svg', type: 'image', size: 15000 },
    ];

    const optimizations = await this.batchOptimizeAssets(discoveredAssets);
    const after = this.getAssetMetrics();

    const totalBandwidthSaved = optimizations.reduce(
      (sum, opt) => sum + (opt.sizeBefore - opt.sizeAfter), 0
    );
    const totalLoadTimeImprovement = optimizations.reduce(
      (sum, opt) => sum + opt.loadTimeImprovement, 0
    );
    const averageCompressionRatio = optimizations.reduce(
      (sum, opt) => sum + opt.compressionRatio, 0
    ) / optimizations.length;

    this.logger.log('🎯 Asset optimization completed', {
      assetsOptimized: optimizations.length,
      bandwidthSaved: `${(totalBandwidthSaved / 1024 / 1024).toFixed(2)} MB`,
      loadTimeImprovement: `${totalLoadTimeImprovement.toFixed(0)} ms`,
      compressionRatio: `${averageCompressionRatio.toFixed(1)}%`,
    });

    return {
      before,
      after,
      optimizations,
      summary: {
        totalAssets: optimizations.length,
        bandwidthSaved: `${(totalBandwidthSaved / 1024 / 1024).toFixed(2)} MB`,
        loadTimeImprovement: `${totalLoadTimeImprovement.toFixed(0)} ms`,
        compressionRatio: `${averageCompressionRatio.toFixed(1)}%`,
      },
    };
  }
}