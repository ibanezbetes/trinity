/**
 * Image Cache Service
 * Implements local image caching for offline viewing capability
 * Manages cache with size limits and automatic cleanup
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loggingService } from './loggingService';

interface CachedImage {
  uri: string;
  localPath: string;
  cachedAt: Date;
  size: number; // Size in bytes
  lastAccessed: Date;
}

interface CacheStats {
  totalImages: number;
  totalSize: number; // Total size in bytes
  oldestImage: Date | null;
  newestImage: Date | null;
}

class ImageCacheService {
  private readonly CACHE_KEY_PREFIX = 'image_cache_';
  private readonly CACHE_INDEX_KEY = 'image_cache_index';
  private readonly MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB limit
  private readonly MAX_CACHE_ITEMS = 200; // Maximum number of cached images
  private readonly CACHE_EXPIRY_DAYS = 7; // Images expire after 7 days
  
  private cacheIndex: Map<string, CachedImage> = new Map();
  private isInitialized = false;

  /**
   * Initialize the cache service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🖼️ Initializing Image Cache Service...');
      
      // Load cache index from storage
      await this.loadCacheIndex();
      
      // Clean up expired images
      await this.cleanupExpiredImages();
      
      // Enforce size limits
      await this.enforceSizeLimits();
      
      this.isInitialized = true;
      
      const stats = this.getCacheStats();
      console.log(`✅ Image Cache initialized: ${stats.totalImages} images, ${this.formatBytes(stats.totalSize)}`);
      
      loggingService.info('ImageCacheService', 'Cache initialized', {
        totalImages: stats.totalImages,
        totalSize: stats.totalSize,
        maxSize: this.MAX_CACHE_SIZE,
      });
      
    } catch (error: any) {
      console.error('❌ Failed to initialize image cache:', error);
      loggingService.error('ImageCacheService', 'Initialization failed', { error: error.message });
    }
  }

  /**
   * Cache an image from a remote URL
   */
  async cacheImage(imageUri: string): Promise<string> {
    await this.ensureInitialized();
    
    if (!imageUri || imageUri.trim() === '') {
      throw new Error('Invalid image URI provided');
    }

    // Check if already cached
    const existing = this.cacheIndex.get(imageUri);
    if (existing) {
      // Update last accessed time
      existing.lastAccessed = new Date();
      await this.saveCacheIndex();
      
      console.log(`⚡ Serving cached image: ${imageUri}`);
      return existing.localPath;
    }

    try {
      console.log(`📥 Caching image: ${imageUri}`);
      
      // Download the image
      const response = await fetch(imageUri);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      
      const imageBlob = await response.blob();
      const imageSize = imageBlob.size;
      
      // Check if we have space (enforce limits before caching)
      await this.ensureSpaceAvailable(imageSize);
      
      // Convert blob to base64 for storage
      const base64Data = await this.blobToBase64(imageBlob);
      const localPath = `${this.CACHE_KEY_PREFIX}${this.generateImageKey(imageUri)}`;
      
      // Store the image data
      await AsyncStorage.setItem(localPath, base64Data);
      
      // Update cache index
      const cachedImage: CachedImage = {
        uri: imageUri,
        localPath,
        cachedAt: new Date(),
        size: imageSize,
        lastAccessed: new Date(),
      };
      
      this.cacheIndex.set(imageUri, cachedImage);
      await this.saveCacheIndex();
      
      console.log(`✅ Image cached successfully: ${this.formatBytes(imageSize)}`);
      
      loggingService.debug('ImageCacheService', 'Image cached', {
        uri: imageUri,
        size: imageSize,
        totalCached: this.cacheIndex.size,
      });
      
      return localPath;
      
    } catch (error: any) {
      console.error(`❌ Failed to cache image ${imageUri}:`, error);
      loggingService.error('ImageCacheService', 'Image caching failed', {
        uri: imageUri,
        error: error.message,
      });
      
      // Return original URI as fallback
      return imageUri;
    }
  }

  /**
   * Get cached image path or original URI if not cached
   */
  async getCachedImage(imageUri: string): Promise<string> {
    await this.ensureInitialized();
    
    if (!imageUri || imageUri.trim() === '') {
      return imageUri;
    }

    const cached = this.cacheIndex.get(imageUri);
    if (cached) {
      // Update last accessed time
      cached.lastAccessed = new Date();
      await this.saveCacheIndex();
      
      // Verify the cached data still exists
      try {
        const cachedData = await AsyncStorage.getItem(cached.localPath);
        if (cachedData) {
          console.log(`⚡ Serving cached image: ${imageUri}`);
          return `data:image/jpeg;base64,${cachedData}`;
        } else {
          // Cached data is missing, remove from index
          console.warn(`⚠️ Cached image data missing for: ${imageUri}`);
          this.cacheIndex.delete(imageUri);
          await this.saveCacheIndex();
        }
      } catch (error) {
        console.warn(`⚠️ Error accessing cached image: ${imageUri}`, error);
        this.cacheIndex.delete(imageUri);
        await this.saveCacheIndex();
      }
    }
    
    // Return original URI if not cached or cache is invalid
    return imageUri;
  }

  /**
   * Pre-cache multiple images in the background
   */
  async preCacheImages(imageUris: string[]): Promise<void> {
    await this.ensureInitialized();
    
    if (!imageUris || imageUris.length === 0) return;

    console.log(`🔄 Pre-caching ${imageUris.length} images...`);
    
    const cachePromises = imageUris.map(async (uri) => {
      try {
        await this.cacheImage(uri);
      } catch (error) {
        console.warn(`⚠️ Failed to pre-cache image: ${uri}`, error);
      }
    });
    
    await Promise.allSettled(cachePromises);
    
    const stats = this.getCacheStats();
    console.log(`✅ Pre-caching completed. Cache: ${stats.totalImages} images, ${this.formatBytes(stats.totalSize)}`);
    
    loggingService.info('ImageCacheService', 'Pre-caching completed', {
      requestedImages: imageUris.length,
      totalCached: stats.totalImages,
      totalSize: stats.totalSize,
    });
  }

  /**
   * Clear all cached images
   */
  async clearCache(): Promise<void> {
    await this.ensureInitialized();
    
    console.log('🧹 Clearing image cache...');
    
    try {
      // Remove all cached image data
      const removePromises = Array.from(this.cacheIndex.values()).map(cached =>
        AsyncStorage.removeItem(cached.localPath)
      );
      
      await Promise.allSettled(removePromises);
      
      // Clear the index
      this.cacheIndex.clear();
      await AsyncStorage.removeItem(this.CACHE_INDEX_KEY);
      
      console.log('✅ Image cache cleared successfully');
      
      loggingService.info('ImageCacheService', 'Cache cleared', {
        clearedImages: removePromises.length,
      });
      
    } catch (error: any) {
      console.error('❌ Error clearing cache:', error);
      loggingService.error('ImageCacheService', 'Cache clearing failed', { error: error.message });
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    const images = Array.from(this.cacheIndex.values());
    
    return {
      totalImages: images.length,
      totalSize: images.reduce((sum, img) => sum + img.size, 0),
      oldestImage: images.length > 0 ? new Date(Math.min(...images.map(img => img.cachedAt.getTime()))) : null,
      newestImage: images.length > 0 ? new Date(Math.max(...images.map(img => img.cachedAt.getTime()))) : null,
    };
  }

  /**
   * Remove expired images from cache
   */
  private async cleanupExpiredImages(): Promise<void> {
    const now = new Date();
    const expiryTime = this.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    
    const expiredImages: string[] = [];
    
    for (const [uri, cached] of this.cacheIndex.entries()) {
      const age = now.getTime() - cached.cachedAt.getTime();
      if (age > expiryTime) {
        expiredImages.push(uri);
      }
    }
    
    if (expiredImages.length > 0) {
      console.log(`🧹 Removing ${expiredImages.length} expired images...`);
      
      for (const uri of expiredImages) {
        await this.removeImageFromCache(uri);
      }
      
      loggingService.info('ImageCacheService', 'Expired images cleaned', {
        removedCount: expiredImages.length,
      });
    }
  }

  /**
   * Enforce cache size limits by removing least recently used images
   */
  private async enforceSizeLimits(): Promise<void> {
    const stats = this.getCacheStats();
    
    // Check if we exceed size or count limits
    if (stats.totalSize <= this.MAX_CACHE_SIZE && stats.totalImages <= this.MAX_CACHE_ITEMS) {
      return;
    }
    
    console.log(`📏 Enforcing cache limits. Current: ${stats.totalImages} images, ${this.formatBytes(stats.totalSize)}`);
    
    // Sort by last accessed time (least recently used first)
    const sortedImages = Array.from(this.cacheIndex.entries())
      .sort(([, a], [, b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime());
    
    let removedCount = 0;
    let removedSize = 0;
    
    // Remove images until we're under limits
    for (const [uri, cached] of sortedImages) {
      if (stats.totalSize - removedSize <= this.MAX_CACHE_SIZE && 
          stats.totalImages - removedCount <= this.MAX_CACHE_ITEMS) {
        break;
      }
      
      await this.removeImageFromCache(uri);
      removedCount++;
      removedSize += cached.size;
    }
    
    if (removedCount > 0) {
      console.log(`🧹 Removed ${removedCount} images (${this.formatBytes(removedSize)}) to enforce limits`);
      
      loggingService.info('ImageCacheService', 'Cache limits enforced', {
        removedCount,
        removedSize,
        remainingImages: this.cacheIndex.size,
        remainingSize: this.getCacheStats().totalSize,
      });
    }
  }

  /**
   * Ensure space is available for a new image
   */
  private async ensureSpaceAvailable(requiredSize: number): Promise<void> {
    const stats = this.getCacheStats();
    
    // Check if adding this image would exceed limits
    if (stats.totalSize + requiredSize > this.MAX_CACHE_SIZE || 
        stats.totalImages + 1 > this.MAX_CACHE_ITEMS) {
      
      // Remove least recently used images to make space
      const sortedImages = Array.from(this.cacheIndex.entries())
        .sort(([, a], [, b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime());
      
      let freedSize = 0;
      let removedCount = 0;
      
      for (const [uri, cached] of sortedImages) {
        await this.removeImageFromCache(uri);
        freedSize += cached.size;
        removedCount++;
        
        const newStats = this.getCacheStats();
        if (newStats.totalSize + requiredSize <= this.MAX_CACHE_SIZE && 
            newStats.totalImages + 1 <= this.MAX_CACHE_ITEMS) {
          break;
        }
      }
      
      if (removedCount > 0) {
        console.log(`🧹 Freed ${this.formatBytes(freedSize)} (${removedCount} images) for new image`);
      }
    }
  }

  /**
   * Remove a specific image from cache
   */
  private async removeImageFromCache(uri: string): Promise<void> {
    const cached = this.cacheIndex.get(uri);
    if (!cached) return;
    
    try {
      await AsyncStorage.removeItem(cached.localPath);
      this.cacheIndex.delete(uri);
      await this.saveCacheIndex();
    } catch (error) {
      console.warn(`⚠️ Error removing cached image: ${uri}`, error);
    }
  }

  /**
   * Load cache index from storage
   */
  private async loadCacheIndex(): Promise<void> {
    try {
      const indexData = await AsyncStorage.getItem(this.CACHE_INDEX_KEY);
      if (indexData) {
        const parsedIndex = JSON.parse(indexData);
        this.cacheIndex = new Map();
        
        for (const [uri, cached] of Object.entries(parsedIndex)) {
          const cachedImage = cached as any;
          this.cacheIndex.set(uri, {
            ...cachedImage,
            cachedAt: new Date(cachedImage.cachedAt),
            lastAccessed: new Date(cachedImage.lastAccessed),
          });
        }
        
        console.log(`📂 Loaded cache index: ${this.cacheIndex.size} images`);
      }
    } catch (error) {
      console.warn('⚠️ Error loading cache index:', error);
      this.cacheIndex = new Map();
    }
  }

  /**
   * Save cache index to storage
   */
  private async saveCacheIndex(): Promise<void> {
    try {
      const indexObject = Object.fromEntries(this.cacheIndex.entries());
      await AsyncStorage.setItem(this.CACHE_INDEX_KEY, JSON.stringify(indexObject));
    } catch (error) {
      console.warn('⚠️ Error saving cache index:', error);
    }
  }

  /**
   * Generate a unique key for an image URI
   */
  private generateImageKey(uri: string): string {
    // Create a simple hash of the URI
    let hash = 0;
    for (let i = 0; i < uri.length; i++) {
      const char = uri.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Convert blob to base64 string
   */
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix to get just the base64 data
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Ensure the service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }
}

// Export singleton instance
export const imageCacheService = new ImageCacheService();
export default imageCacheService;