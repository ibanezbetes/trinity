/**
 * FilterCacheManager - Content Caching System (JavaScript version)
 * 
 * Manages caching of filtered content to improve performance:
 * - In-memory caching for frequently accessed content
 * - Cache invalidation and refresh logic
 * - Performance optimization for repeated requests
 */

class FilterCacheManager {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
    this.maxCacheSize = 100; // Maximum number of cached entries
    
    console.log('💾 FilterCacheManager initialized');
  }

  /**
   * Generates cache key from filter criteria
   * @param {Object} criteria - Filter criteria
   * @returns {string} Cache key
   */
  generateCacheKey(criteria) {
    const key = `${criteria.mediaType}_${(criteria.genres || []).sort().join(',')}_${criteria.roomId || 'global'}`;
    return key;
  }

  /**
   * Gets cached content for given criteria
   * @param {Object} criteria - Filter criteria
   * @returns {Array|null} Cached content or null if not found/expired
   */
  async getCachedContent(criteria) {
    const key = this.generateCacheKey(criteria);
    const cached = this.cache.get(key);
    
    if (!cached) {
      console.log(`💾 FilterCacheManager: Cache miss for key ${key}`);
      return null;
    }

    // Check if cache entry has expired
    const now = Date.now();
    if (now - cached.timestamp > this.cacheTimeout) {
      console.log(`💾 FilterCacheManager: Cache expired for key ${key}`);
      this.cache.delete(key);
      return null;
    }

    console.log(`✅ FilterCacheManager: Cache hit for key ${key} (${cached.content.length} items)`);
    return cached.content;
  }

  /**
   * Sets cached content for given criteria
   * @param {Object} criteria - Filter criteria
   * @param {Array} content - Content to cache
   */
  async setCachedContent(criteria, content) {
    const key = this.generateCacheKey(criteria);
    
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      console.log(`💾 FilterCacheManager: Evicted oldest cache entry ${oldestKey}`);
    }

    const cacheEntry = {
      content: content,
      timestamp: Date.now(),
      criteria: criteria
    };

    this.cache.set(key, cacheEntry);
    console.log(`💾 FilterCacheManager: Cached ${content.length} items for key ${key}`);
  }

  /**
   * Invalidates cache for specific criteria
   * @param {Object} criteria - Filter criteria
   */
  async invalidateCache(criteria) {
    const key = this.generateCacheKey(criteria);
    const deleted = this.cache.delete(key);
    
    if (deleted) {
      console.log(`💾 FilterCacheManager: Invalidated cache for key ${key}`);
    } else {
      console.log(`💾 FilterCacheManager: No cache found to invalidate for key ${key}`);
    }
  }

  /**
   * Clears all cached content
   */
  async clearAllCache() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`💾 FilterCacheManager: Cleared all cache (${size} entries)`);
  }

  /**
   * Gets cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const stats = {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      timeout: this.cacheTimeout,
      entries: []
    };

    for (const [key, entry] of this.cache.entries()) {
      const age = Date.now() - entry.timestamp;
      stats.entries.push({
        key,
        age,
        itemCount: entry.content.length,
        expired: age > this.cacheTimeout
      });
    }

    return stats;
  }

  /**
   * Performs cache maintenance (removes expired entries)
   */
  async performMaintenance() {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`💾 FilterCacheManager: Maintenance removed ${removedCount} expired entries`);
    }
  }

  /**
   * Preloads cache with popular content
   * @param {Array} popularCriteria - Array of popular filter criteria
   */
  async preloadCache(popularCriteria) {
    console.log(`💾 FilterCacheManager: Preloading cache for ${popularCriteria.length} criteria`);
    
    // This would typically fetch content for popular criteria
    // For now, we'll just log the intent
    for (const criteria of popularCriteria) {
      const key = this.generateCacheKey(criteria);
      console.log(`💾 FilterCacheManager: Would preload cache for ${key}`);
    }
  }
}

module.exports = { FilterCacheManager };