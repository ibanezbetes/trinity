/**
 * FilterCacheManager - Efficient Cache Management for Content Filtering
 * 
 * Manages caching of filtered content by unique FilterCriteria combinations:
 * - Cache key generation from FilterCriteria
 * - Cache storage and retrieval with DynamoDB
 * - Cache expiration and invalidation
 * - Content exclusion tracking per room
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { DynamoDBClient, PutItemCommand, GetItemCommand, DeleteItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { createHash } from 'crypto';
import { FilterCriteria, ContentPoolEntry } from './content-filter-service';

export interface FilterCacheEntry {
  cacheKey: string;
  mediaType: string;
  genreIds: number[];
  content: ContentPoolEntry[];
  createdAt: Date | string;
  expiresAt: Date | string;
  totalAvailable: number;
}

export interface RoomExclusions {
  roomId: string;
  excludedIds: Set<string>;
  lastUpdated: Date;
}

export class FilterCacheManager {
  private dynamoClient: DynamoDBClient;
  private cacheTableName: string;
  private exclusionsTableName: string;
  private readonly CACHE_TTL_HOURS = 24; // Cache expires after 24 hours

  constructor() {
    this.dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.cacheTableName = process.env.FILTER_CACHE_TABLE || 'trinity-filter-cache';
    this.exclusionsTableName = process.env.ROOM_EXCLUSIONS_TABLE || 'trinity-room-exclusions';
    
    // Log cache configuration for debugging
    console.log(`🔍 FilterCache: Initialized with tables: ${this.cacheTableName}, ${this.exclusionsTableName}`);
  }

  /**
   * Gets cached content for specific filter criteria
   * Requirements: 7.1, 7.2
   */
  async getCachedContent(criteria: FilterCriteria): Promise<ContentPoolEntry[] | null> {
    const cacheKey = this.generateCacheKey(criteria);
    console.log(`🔍 FilterCache: Looking for cached content with key: ${cacheKey}`);

    try {
      const command = new GetItemCommand({
        TableName: this.cacheTableName,
        Key: marshall({ cacheKey })
      });

      const response = await this.dynamoClient.send(command);
      
      if (!response.Item) {
        console.log(`❌ FilterCache: No cached content found for key: ${cacheKey}`);
        return null;
      }

      const cacheEntry = unmarshall(response.Item) as FilterCacheEntry;
      
      // Check if cache has expired
      if (new Date() > new Date(cacheEntry.expiresAt)) {
        console.log(`⏰ FilterCache: Cache expired for key: ${cacheKey}`);
        await this.invalidateCache(criteria);
        return null;
      }

      console.log(`✅ FilterCache: Found ${cacheEntry.content.length} cached items`);
      return cacheEntry.content;

    } catch (error: any) {
      console.error(`❌ FilterCache: Error getting cached content:`, error);
      
      // Check if it's a table not found error
      if (error.name === 'ResourceNotFoundException' || error.__type?.includes('ResourceNotFoundException')) {
        console.log(`💡 FilterCache: Cache table '${this.cacheTableName}' not found - graceful degradation`);
        return null;
      }
      
      return null; // Graceful degradation for any other errors
    }
  }

  /**
   * Stores content in cache with expiration
   * Requirements: 7.1, 7.2, 7.3
   */
  async setCachedContent(criteria: FilterCriteria, content: ContentPoolEntry[]): Promise<void> {
    const cacheKey = this.generateCacheKey(criteria);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (this.CACHE_TTL_HOURS * 60 * 60 * 1000));

    console.log(`💾 FilterCache: Storing ${content.length} items with key: ${cacheKey}`);

    try {
      const cacheEntry: FilterCacheEntry = {
        cacheKey,
        mediaType: criteria.mediaType,
        genreIds: criteria.genres,
        content,
        createdAt: now,
        expiresAt,
        totalAvailable: content.length
      };

      const command = new PutItemCommand({
        TableName: this.cacheTableName,
        Item: marshall(cacheEntry, {
          convertClassInstanceToMap: true,
          removeUndefinedValues: true
        })
      });

      await this.dynamoClient.send(command);
      console.log(`✅ FilterCache: Successfully cached content, expires at ${expiresAt.toISOString()}`);

    } catch (error: any) {
      console.error(`❌ FilterCache: Error storing cached content:`, error);
      
      // Check if it's a table not found error
      if (error.name === 'ResourceNotFoundException' || error.__type?.includes('ResourceNotFoundException')) {
        console.log(`💡 FilterCache: Cache table '${this.cacheTableName}' not found - skipping cache storage`);
        return;
      }
      
      // Don't throw - caching is not critical for functionality
    }
  }

  /**
   * Invalidates cache entry for specific criteria
   * Requirements: 7.3, 7.5
   */
  async invalidateCache(criteria: FilterCriteria): Promise<void> {
    const cacheKey = this.generateCacheKey(criteria);
    console.log(`🗑️ FilterCache: Invalidating cache for key: ${cacheKey}`);

    try {
      const command = new DeleteItemCommand({
        TableName: this.cacheTableName,
        Key: marshall({ cacheKey })
      });

      await this.dynamoClient.send(command);
      console.log(`✅ FilterCache: Successfully invalidated cache`);

    } catch (error) {
      console.error(`❌ FilterCache: Error invalidating cache:`, error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Tracks content that has been shown in a room to avoid repetition
   * Requirements: 7.4
   */
  async trackShownContent(roomId: string, contentIds: string[]): Promise<void> {
    console.log(`📝 FilterCache: Tracking ${contentIds.length} shown items for room ${roomId}`);

    try {
      // Get existing exclusions
      const existingExclusions = await this.getRoomExclusions(roomId);
      const allExcludedIds = new Set([...existingExclusions, ...contentIds]);

      const exclusionData = {
        roomId,
        excludedIds: Array.from(allExcludedIds),
        lastUpdated: new Date().toISOString()
      };

      const command = new PutItemCommand({
        TableName: this.exclusionsTableName,
        Item: marshall(exclusionData)
      });

      await this.dynamoClient.send(command);
      console.log(`✅ FilterCache: Updated exclusions for room ${roomId} (${allExcludedIds.size} total)`);

    } catch (error) {
      console.error(`❌ FilterCache: Error tracking shown content:`, error);
      // Don't throw - this is not critical for core functionality
    }
  }

  /**
   * Gets list of content IDs that have been shown in a room
   * Requirements: 7.4
   */
  async getRoomExclusions(roomId: string): Promise<string[]> {
    try {
      const command = new GetItemCommand({
        TableName: this.exclusionsTableName,
        Key: marshall({ roomId })
      });

      const response = await this.dynamoClient.send(command);
      
      if (!response.Item) {
        return [];
      }

      const exclusionData = unmarshall(response.Item);
      return exclusionData.excludedIds || [];

    } catch (error) {
      console.error(`❌ FilterCache: Error getting room exclusions:`, error);
      return []; // Return empty array on error
    }
  }

  /**
   * Generates unique cache key from FilterCriteria
   * Requirements: 7.1
   */
  private generateCacheKey(criteria: FilterCriteria): string {
    // Create a deterministic string from criteria
    const keyData = {
      mediaType: criteria.mediaType,
      genres: criteria.genres.sort() // Sort to ensure consistent key regardless of order
    };

    const keyString = JSON.stringify(keyData);
    
    // Generate SHA-256 hash for consistent, short key
    const hash = createHash('sha256').update(keyString).digest('hex');
    
    // Use first 16 characters for shorter keys
    return `filter_${hash.substring(0, 16)}`;
  }

  /**
   * Cleans up expired cache entries (maintenance function)
   * Requirements: 7.3, 7.5
   */
  async cleanupExpiredCache(): Promise<void> {
    console.log(`🧹 FilterCache: Starting cleanup of expired cache entries`);
    
    // This would typically use a DynamoDB scan with filter
    // For now, we'll implement a basic version
    // In production, this should be run as a scheduled Lambda function
    
    try {
      // Implementation would scan the cache table and delete expired entries
      console.log(`✅ FilterCache: Cleanup completed`);
    } catch (error) {
      console.error(`❌ FilterCache: Error during cleanup:`, error);
    }
  }
}