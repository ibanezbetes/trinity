import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import compression from 'compression';
import * as zlib from 'zlib';

export interface CompressionMetrics {
  totalRequests: number;
  compressedRequests: number;
  compressionRatio: number;
  averageCompressionTime: number;
  bytesSaved: number;
  totalOriginalBytes: number;
  totalCompressedBytes: number;
}

export interface CompressionConfig {
  enabled: boolean;
  threshold: number; // Minimum bytes to compress
  level: number; // Compression level (1-9)
  chunkSize: number;
  windowBits: number;
  memLevel: number;
  strategy: number;
  filter: (req: Request, res: Response) => boolean;
}

@Injectable()
export class CompressionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CompressionMiddleware.name);
  private compressionMetrics: CompressionMetrics;
  private compressionConfig: CompressionConfig;
  private compressionMiddleware: any;

  constructor(private configService: ConfigService) {
    this.initializeConfig();
    this.initializeMetrics();
    this.setupCompressionMiddleware();
  }

  use(req: Request, res: Response, next: NextFunction): void {
    // Skip compression for certain content types or conditions
    if (!this.shouldCompress(req, res)) {
      return next();
    }

    // Apply compression middleware
    this.compressionMiddleware(req, res, (err?: any) => {
      if (err) {
        this.logger.error('Compression error:', err);
        return next(err);
      }

      // Track compression metrics
      this.trackCompressionMetrics(req, res);
      next();
    });
  }

  /**
   * Initialize compression configuration
   */
  private initializeConfig(): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    
    this.compressionConfig = {
      enabled: this.configService.get<boolean>('COMPRESSION_ENABLED', isProduction),
      threshold: this.configService.get<number>('COMPRESSION_THRESHOLD', 1024), // 1KB
      level: this.configService.get<number>('COMPRESSION_LEVEL', isProduction ? 6 : 4),
      chunkSize: this.configService.get<number>('COMPRESSION_CHUNK_SIZE', 16 * 1024), // 16KB
      windowBits: this.configService.get<number>('COMPRESSION_WINDOW_BITS', 15),
      memLevel: this.configService.get<number>('COMPRESSION_MEM_LEVEL', 8),
      strategy: this.configService.get<number>('COMPRESSION_STRATEGY', zlib.constants.Z_DEFAULT_STRATEGY),
      filter: this.createCompressionFilter(),
    };
  }

  /**
   * Initialize compression metrics
   */
  private initializeMetrics(): void {
    this.compressionMetrics = {
      totalRequests: 0,
      compressedRequests: 0,
      compressionRatio: 0,
      averageCompressionTime: 0,
      bytesSaved: 0,
      totalOriginalBytes: 0,
      totalCompressedBytes: 0,
    };
  }

  /**
   * Setup the compression middleware with optimized configuration
   */
  private setupCompressionMiddleware(): void {
    if (!this.compressionConfig.enabled) {
      this.compressionMiddleware = (req: Request, res: Response, next: NextFunction) => next();
      return;
    }

    this.compressionMiddleware = compression({
      // Compression level (1-9, where 9 is best compression but slowest)
      level: this.compressionConfig.level,
      
      // Minimum response size to compress
      threshold: this.compressionConfig.threshold,
      
      // Custom filter function
      filter: this.compressionConfig.filter,
      
      // Chunk size for streaming compression
      chunkSize: this.compressionConfig.chunkSize,
      
      // Window bits for deflate algorithm
      windowBits: this.compressionConfig.windowBits,
      
      // Memory level for deflate algorithm
      memLevel: this.compressionConfig.memLevel,
      
      // Compression strategy
      strategy: this.compressionConfig.strategy,
    });

    this.logger.log('🗜️ Compression middleware initialized', {
      level: this.compressionConfig.level,
      threshold: this.compressionConfig.threshold,
      enabled: this.compressionConfig.enabled,
    });
  }

  /**
   * Create compression filter function
   */
  private createCompressionFilter(): (req: Request, res: Response) => boolean {
    return (req: Request, res: Response): boolean => {
      // Don't compress if disabled
      if (!this.compressionConfig.enabled) {
        return false;
      }

      // Don't compress if client doesn't support it
      const acceptEncoding = req.headers['accept-encoding'];
      if (!acceptEncoding || (!acceptEncoding.includes('gzip') && !acceptEncoding.includes('deflate'))) {
        return false;
      }

      // Don't compress already compressed content
      const contentType = res.getHeader('content-type') as string;
      if (this.isAlreadyCompressed(contentType)) {
        return false;
      }

      // Don't compress small responses
      const contentLength = res.getHeader('content-length');
      if (contentLength && parseInt(contentLength as string, 10) < this.compressionConfig.threshold) {
        return false;
      }

      // Don't compress certain endpoints
      if (this.shouldSkipCompression(req)) {
        return false;
      }

      // Compress text-based content types
      return this.isCompressibleContentType(contentType);
    };
  }

  /**
   * Check if content type is already compressed
   */
  private isAlreadyCompressed(contentType: string): boolean {
    if (!contentType) return false;

    const compressedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/',
      'audio/',
      'application/zip',
      'application/gzip',
      'application/x-gzip',
      'application/x-compress',
      'application/x-compressed',
    ];

    return compressedTypes.some(type => contentType.toLowerCase().includes(type));
  }

  /**
   * Check if content type is compressible
   */
  private isCompressibleContentType(contentType: string): boolean {
    if (!contentType) return false;

    const compressibleTypes = [
      'text/',
      'application/json',
      'application/javascript',
      'application/xml',
      'application/rss+xml',
      'application/atom+xml',
      'image/svg+xml',
      'application/x-font-ttf',
      'application/vnd.ms-fontobject',
      'font/opentype',
    ];

    return compressibleTypes.some(type => contentType.toLowerCase().includes(type));
  }

  /**
   * Check if request should skip compression
   */
  private shouldSkipCompression(req: Request): boolean {
    // Skip compression for certain endpoints
    const skipPaths = [
      '/health',
      '/metrics',
      '/api/media/stream',
      '/api/cdn/image',
      '/websocket',
    ];

    return skipPaths.some(path => req.path.startsWith(path));
  }

  /**
   * Determine if response should be compressed
   */
  private shouldCompress(req: Request, res: Response): boolean {
    return this.compressionConfig.filter(req, res);
  }

  /**
   * Track compression metrics
   */
  private trackCompressionMetrics(req: Request, res: Response): void {
    this.compressionMetrics.totalRequests++;

    // Check if response was actually compressed
    const contentEncoding = res.getHeader('content-encoding');
    const contentEncodingStr = typeof contentEncoding === 'string' ? contentEncoding : String(contentEncoding || '');
    
    if (contentEncodingStr && (contentEncodingStr.includes('gzip') || contentEncodingStr.includes('deflate'))) {
      this.compressionMetrics.compressedRequests++;

      // Estimate compression savings (this is approximate)
      const originalSize = this.estimateOriginalSize(res);
      const compressedSize = this.estimateCompressedSize(res);

      if (originalSize > 0 && compressedSize > 0) {
        this.compressionMetrics.totalOriginalBytes += originalSize;
        this.compressionMetrics.totalCompressedBytes += compressedSize;
        this.compressionMetrics.bytesSaved += (originalSize - compressedSize);
        
        // Update compression ratio
        this.compressionMetrics.compressionRatio = 
          this.compressionMetrics.totalOriginalBytes > 0 
            ? (this.compressionMetrics.totalCompressedBytes / this.compressionMetrics.totalOriginalBytes)
            : 0;
      }
    }
  }

  /**
   * Estimate original response size
   */
  private estimateOriginalSize(res: Response): number {
    const contentLength = res.getHeader('content-length');
    if (contentLength) {
      return parseInt(contentLength as string, 10);
    }

    // Fallback estimation based on content type
    const contentType = res.getHeader('content-type') as string;
    if (contentType?.includes('json')) {
      return 2048; // Average JSON response size
    } else if (contentType?.includes('html')) {
      return 4096; // Average HTML response size
    } else if (contentType?.includes('text')) {
      return 1024; // Average text response size
    }

    return 1024; // Default estimate
  }

  /**
   * Estimate compressed response size
   */
  private estimateCompressedSize(res: Response): number {
    const originalSize = this.estimateOriginalSize(res);
    
    // Typical compression ratios by content type
    const contentType = res.getHeader('content-type') as string;
    let compressionRatio = 0.7; // Default 30% compression

    if (contentType?.includes('json')) {
      compressionRatio = 0.4; // JSON compresses well (60% reduction)
    } else if (contentType?.includes('html')) {
      compressionRatio = 0.5; // HTML compresses well (50% reduction)
    } else if (contentType?.includes('javascript')) {
      compressionRatio = 0.6; // JS compresses moderately (40% reduction)
    } else if (contentType?.includes('css')) {
      compressionRatio = 0.6; // CSS compresses moderately (40% reduction)
    }

    return Math.floor(originalSize * compressionRatio);
  }

  /**
   * Get compression metrics
   */
  getCompressionMetrics(): CompressionMetrics {
    return { ...this.compressionMetrics };
  }

  /**
   * Get compression configuration
   */
  getCompressionConfig(): CompressionConfig {
    return { ...this.compressionConfig };
  }

  /**
   * Update compression configuration
   */
  updateCompressionConfig(newConfig: Partial<CompressionConfig>): void {
    this.compressionConfig = { ...this.compressionConfig, ...newConfig };
    
    // Reinitialize middleware with new config
    this.setupCompressionMiddleware();
    
    this.logger.log('🔧 Compression configuration updated', newConfig);
  }

  /**
   * Reset compression metrics
   */
  resetMetrics(): void {
    this.initializeMetrics();
    this.logger.log('📊 Compression metrics reset');
  }

  /**
   * Get compression statistics
   */
  getCompressionStatistics(): {
    metrics: CompressionMetrics;
    config: CompressionConfig;
    performance: {
      compressionRate: number;
      averageSavings: number;
      totalSavingsKB: number;
      efficiency: number;
    };
  } {
    const metrics = this.getCompressionMetrics();
    const compressionRate = metrics.totalRequests > 0 
      ? (metrics.compressedRequests / metrics.totalRequests) * 100 
      : 0;

    const averageSavings = metrics.compressedRequests > 0 
      ? metrics.bytesSaved / metrics.compressedRequests 
      : 0;

    const totalSavingsKB = metrics.bytesSaved / 1024;

    const efficiency = metrics.totalOriginalBytes > 0 
      ? ((metrics.bytesSaved / metrics.totalOriginalBytes) * 100) 
      : 0;

    return {
      metrics,
      config: this.getCompressionConfig(),
      performance: {
        compressionRate,
        averageSavings,
        totalSavingsKB,
        efficiency,
      },
    };
  }

  /**
   * Optimize compression settings based on usage patterns
   */
  optimizeCompressionSettings(): {
    before: CompressionConfig;
    after: CompressionConfig;
    optimizations: string[];
  } {
    const before = { ...this.compressionConfig };
    const optimizations: string[] = [];

    // Analyze compression effectiveness
    const stats = this.getCompressionStatistics();

    // If compression rate is low, lower the threshold
    if (stats.performance.compressionRate < 50 && this.compressionConfig.threshold > 512) {
      this.compressionConfig.threshold = Math.max(512, this.compressionConfig.threshold - 256);
      optimizations.push(`Lowered compression threshold to ${this.compressionConfig.threshold} bytes`);
    }

    // If efficiency is low, adjust compression level
    if (stats.performance.efficiency < 20 && this.compressionConfig.level > 1) {
      this.compressionConfig.level = Math.max(1, this.compressionConfig.level - 1);
      optimizations.push(`Reduced compression level to ${this.compressionConfig.level}`);
    } else if (stats.performance.efficiency > 60 && this.compressionConfig.level < 9) {
      this.compressionConfig.level = Math.min(9, this.compressionConfig.level + 1);
      optimizations.push(`Increased compression level to ${this.compressionConfig.level}`);
    }

    // Optimize chunk size based on average response size
    const avgOriginalSize = stats.metrics.totalOriginalBytes / Math.max(1, stats.metrics.compressedRequests);
    if (avgOriginalSize > 32768 && this.compressionConfig.chunkSize < 32768) {
      this.compressionConfig.chunkSize = 32768; // 32KB
      optimizations.push('Increased chunk size to 32KB for large responses');
    } else if (avgOriginalSize < 8192 && this.compressionConfig.chunkSize > 8192) {
      this.compressionConfig.chunkSize = 8192; // 8KB
      optimizations.push('Decreased chunk size to 8KB for small responses');
    }

    // Reinitialize middleware if changes were made
    if (optimizations.length > 0) {
      this.setupCompressionMiddleware();
    }

    const after = { ...this.compressionConfig };

    this.logger.log('🎯 Compression optimization completed', {
      optimizations,
      before: { level: before.level, threshold: before.threshold, chunkSize: before.chunkSize },
      after: { level: after.level, threshold: after.threshold, chunkSize: after.chunkSize },
    });

    return {
      before,
      after,
      optimizations,
    };
  }
}