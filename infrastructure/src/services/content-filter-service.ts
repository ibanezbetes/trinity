/**
 * ContentFilterService - Advanced Content Filtering System
 * 
 * Orchestrates the filtering and loading of content using:
 * - Priority Algorithm (3-tier system)
 * - TMDB API integration
 * - Cache management
 * - Content exclusion tracking
 * 
 * Requirements: 3.1, 5.1, 5.2, 5.3
 */

import { MediaType } from '../types/content-filtering-types';
import { EnhancedTMDBClient } from './enhanced-tmdb-client';
import { PriorityAlgorithmEngine } from './priority-algorithm';
import { FilterCacheManager } from './filter-cache-manager';

export interface FilterCriteria {
  mediaType: MediaType;
  genres: number[];  // Maximum 3 genres
  roomId: string;
}

export interface ContentPoolEntry {
  tmdbId: string;
  mediaType: MediaType;
  title: string;
  posterPath?: string;
  overview: string;
  genreIds: number[];
  voteAverage: number;
  releaseDate: string;
  priority: 1 | 2 | 3;
  addedAt: string; // ISO string for DynamoDB compatibility
}

export interface Room {
  id: string;
  name: string;
  filterCriteria?: FilterCriteria;
  contentPool: ContentPoolEntry[];
  excludedContentIds: string[];
  lastContentRefresh: Date;
  // ... other room fields
}

export class ContentFilterService {
  private tmdbClient: EnhancedTMDBClient;
  private priorityAlgorithm: PriorityAlgorithmEngine;
  private cacheManager: FilterCacheManager;

  constructor() {
    this.tmdbClient = new EnhancedTMDBClient();
    this.priorityAlgorithm = new PriorityAlgorithmEngine();
    this.cacheManager = new FilterCacheManager();
  }

  /**
   * Creates a filtered room with pre-loaded content pool
   * Requirements: 3.1, 3.5
   */
  async createFilteredRoom(criteria: FilterCriteria): Promise<ContentPoolEntry[]> {
    console.log(`🎬 ContentFilterService: Creating filtered room with criteria:`, criteria);

    try {
      // Check cache first
      const cachedContent = await this.cacheManager.getCachedContent(criteria);
      if (cachedContent && cachedContent.length >= 30) {
        console.log(`✅ ContentFilterService: Using cached content (${cachedContent.length} items)`);
        
        // ENHANCED: Validate cached content consistency (Requirement 6.4)
        const validCachedContent = this.validateCachedContentConsistency(cachedContent, criteria.mediaType);
        return validCachedContent.slice(0, 30);
      }

      // Generate new content using priority algorithm
      const contentPool = await this.generatePrioritizedContent(criteria, []);
      
      // Cache the results
      await this.cacheManager.setCachedContent(criteria, contentPool);
      
      console.log(`✅ ContentFilterService: Generated ${contentPool.length} items for room ${criteria.roomId}`);
      return contentPool;

    } catch (error) {
      console.error(`❌ ContentFilterService: Error creating filtered room:`, error);
      throw error;
    }
  }

  /**
   * Loads additional content for room when pool is low
   * Requirements: 5.1, 5.2
   */
  async loadContentPool(roomId: string, excludeIds: string[]): Promise<ContentPoolEntry[]> {
    console.log(`🔄 ContentFilterService: Loading content pool for room ${roomId}, excluding ${excludeIds.length} items`);

    // This would typically get the room's filter criteria from database
    // For now, we'll use a fallback approach
    const criteria: FilterCriteria = {
      mediaType: 'MOVIE',
      genres: [],
      roomId
    };

    try {
      const contentPool = await this.generatePrioritizedContent(criteria, excludeIds);
      console.log(`✅ ContentFilterService: Loaded ${contentPool.length} additional items`);
      return contentPool;

    } catch (error) {
      console.error(`❌ ContentFilterService: Error loading content pool:`, error);
      throw error;
    }
  }

  /**
   * Gets available genres for a media type
   * Requirements: 1.4, 2.1
   */
  async getAvailableGenres(mediaType: MediaType): Promise<Array<{id: number, name: string}>> {
    console.log(`🎭 ContentFilterService: Getting available genres for ${mediaType}`);

    try {
      const genres = await this.tmdbClient.getGenres(mediaType);
      console.log(`✅ ContentFilterService: Retrieved ${genres.length} genres for ${mediaType}`);
      return genres;

    } catch (error) {
      console.error(`❌ ContentFilterService: Error getting genres:`, error);
      throw error;
    }
  }

  /**
   * Generates prioritized content using the 3-tier algorithm
   * Private method that implements the core filtering logic
   */
  private async generatePrioritizedContent(
    criteria: FilterCriteria, 
    excludeIds: string[]
  ): Promise<ContentPoolEntry[]> {
    console.log(`🎯 ContentFilterService: Generating prioritized content`, { criteria, excludeCount: excludeIds.length });

    const results: ContentPoolEntry[] = [];
    const now = new Date();

    try {
      // Priority 1: All genres (AND logic) - up to 15 items
      if (criteria.genres.length > 0) {
        console.log(`🥇 Priority 1: Fetching content with ALL genres [${criteria.genres.join(',')}]`);
        const allGenresContent = await this.tmdbClient.discoverContent({
          mediaType: criteria.mediaType,
          withGenres: criteria.genres.join(','), // Comma-separated for AND logic
          sortBy: 'vote_average.desc',
          excludeIds
        });

        // ENHANCED: Post-processing content type validation (Requirement 6.4)
        const validatedContent = this.validateContentType(allGenresContent, criteria.mediaType);
        console.log(`🔍 Priority 1: Validated ${validatedContent.length}/${allGenresContent.length} items for ${criteria.mediaType}`);

        const priority1Items = this.priorityAlgorithm.randomizeContent(validatedContent)
          .slice(0, 15)
          .map(item => this.mapToContentPoolEntry(item, 1, now));
        
        results.push(...priority1Items);
        console.log(`✅ Priority 1: Added ${priority1Items.length} items`);
      }

      // Priority 2: Any genre (OR logic) - fill up to 30 items
      if (criteria.genres.length > 0 && results.length < 30) {
        console.log(`🥈 Priority 2: Fetching content with ANY genre [${criteria.genres.join('|')}]`);
        const currentExcludeIds = [...excludeIds, ...results.map(r => r.tmdbId)];
        
        const anyGenreContent = await this.tmdbClient.discoverContent({
          mediaType: criteria.mediaType,
          withGenres: criteria.genres.join('|'), // Pipe-separated for OR logic
          sortBy: 'popularity.desc',
          excludeIds: currentExcludeIds
        });

        // ENHANCED: Post-processing content type validation (Requirement 6.4)
        const validatedContent = this.validateContentType(anyGenreContent, criteria.mediaType);
        console.log(`🔍 Priority 2: Validated ${validatedContent.length}/${anyGenreContent.length} items for ${criteria.mediaType}`);

        const needed = 30 - results.length;
        const priority2Items = this.priorityAlgorithm.randomizeContent(validatedContent)
          .slice(0, needed)
          .map(item => this.mapToContentPoolEntry(item, 2, now));
        
        results.push(...priority2Items);
        console.log(`✅ Priority 2: Added ${priority2Items.length} items`);
      }

      // Priority 3: Popular fallback - fill remaining slots
      if (results.length < 30) {
        console.log(`🥉 Priority 3: Fetching popular ${criteria.mediaType} content`);
        const currentExcludeIds = [...excludeIds, ...results.map(r => r.tmdbId)];
        
        const popularContent = await this.tmdbClient.discoverContent({
          mediaType: criteria.mediaType,
          sortBy: 'popularity.desc',
          excludeIds: currentExcludeIds
        });

        // ENHANCED: Post-processing content type validation (Requirement 6.4)
        const validatedContent = this.validateContentType(popularContent, criteria.mediaType);
        console.log(`🔍 Priority 3: Validated ${validatedContent.length}/${popularContent.length} items for ${criteria.mediaType}`);

        const needed = 30 - results.length;
        const priority3Items = this.priorityAlgorithm.randomizeContent(validatedContent)
          .slice(0, needed)
          .map(item => this.mapToContentPoolEntry(item, 3, now));
        
        results.push(...priority3Items);
        console.log(`✅ Priority 3: Added ${priority3Items.length} items`);
      }

      console.log(`🎯 ContentFilterService: Generated ${results.length} total items`);
      return results;

    } catch (error) {
      console.error(`❌ ContentFilterService: Error in generatePrioritizedContent:`, error);
      throw error;
    }
  }

  /**
   * ENHANCED: Validates cached content consistency (Requirement 6.4)
   * Ensures cached content matches the expected mediaType
   */
  private validateCachedContentConsistency(cachedContent: ContentPoolEntry[], expectedMediaType: MediaType): ContentPoolEntry[] {
    console.log(`🔍 ContentFilterService: Validating cached content consistency for ${expectedMediaType}`);
    
    const validContent = cachedContent.filter(item => {
      // Check if cached item matches expected media type
      if (item.mediaType !== expectedMediaType) {
        console.warn(`⚠️ Discarding cached item with wrong mediaType: expected ${expectedMediaType}, got ${item.mediaType}`, item.tmdbId);
        return false;
      }

      // Additional validation for required fields
      if (!item.title || !item.releaseDate || !item.overview) {
        console.warn(`⚠️ Discarding cached item with missing required fields:`, item.tmdbId);
        return false;
      }

      return true;
    });

    const discardedCount = cachedContent.length - validContent.length;
    if (discardedCount > 0) {
      console.log(`🔍 ContentFilterService: Discarded ${discardedCount} inconsistent cached items, kept ${validContent.length} valid items`);
    }

    return validContent;
  }

  /**
   * ENHANCED: Post-processing content type validation (Requirement 6.4)
   * Ensures 100% pure cache by discarding items that don't match expected mediaType
   */
  private validateContentType(items: any[], expectedMediaType: MediaType): any[] {
    console.log(`🔍 ContentFilterService: Validating content type for ${expectedMediaType}`);
    
    const validItems = items.filter(item => {
      // ENHANCED: Handle null/undefined items gracefully
      if (!item || typeof item !== 'object') {
        console.warn(`⚠️ Discarding null/undefined/invalid item`);
        return false;
      }

      // Check required fields based on media type
      if (expectedMediaType === 'MOVIE') {
        const hasMovieFields = !!(item.title && item.release_date);
        if (!hasMovieFields) {
          console.warn(`⚠️ Discarding invalid MOVIE item (missing title/release_date):`, item.id);
          return false;
        }
      } else if (expectedMediaType === 'TV') {
        const hasTVFields = !!(item.name && item.first_air_date);
        if (!hasTVFields) {
          console.warn(`⚠️ Discarding invalid TV item (missing name/first_air_date):`, item.id);
          return false;
        }
      }

      // Check common required fields
      const hasCommonFields = !!(
        item.id && 
        item.overview && 
        item.genre_ids && 
        Array.isArray(item.genre_ids) &&
        typeof item.vote_average === 'number'
      );

      if (!hasCommonFields) {
        console.warn(`⚠️ Discarding item with missing common fields:`, item.id);
        return false;
      }

      // Additional validation: overview should not be empty
      if (typeof item.overview === 'string' && item.overview.trim().length === 0) {
        console.warn(`⚠️ Discarding item with empty overview:`, item.id);
        return false;
      }

      return true;
    });

    const discardedCount = items.length - validItems.length;
    if (discardedCount > 0) {
      console.log(`🔍 ContentFilterService: Discarded ${discardedCount} invalid items, kept ${validItems.length} valid items`);
    }

    return validItems;
  }

  /**
   * Maps TMDB content to ContentPoolEntry format
   * ENHANCED: Preserves correct mediaType and adds fallback content type preservation
   */
  private mapToContentPoolEntry(
    tmdbItem: any, 
    priority: 1 | 2 | 3, 
    addedAt: Date
  ): ContentPoolEntry {
    // ENHANCED: Determine mediaType based on available fields (Requirement 1.5)
    let mediaType: MediaType;
    let title: string;
    let releaseDate: string;

    if (tmdbItem.title && tmdbItem.release_date) {
      mediaType = 'MOVIE';
      title = tmdbItem.title;
      releaseDate = tmdbItem.release_date;
    } else if (tmdbItem.name && tmdbItem.first_air_date) {
      mediaType = 'TV';
      title = tmdbItem.name;
      releaseDate = tmdbItem.first_air_date;
    } else {
      // Fallback content type preservation
      mediaType = tmdbItem.media_type === 'tv' ? 'TV' : 'MOVIE';
      title = tmdbItem.title || tmdbItem.name || '';
      releaseDate = tmdbItem.release_date || tmdbItem.first_air_date || '';
      console.warn(`⚠️ Using fallback mediaType detection for item ${tmdbItem.id}: ${mediaType}`);
    }

    return {
      tmdbId: tmdbItem.id.toString(),
      mediaType,
      title,
      posterPath: tmdbItem.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}` : undefined,
      overview: tmdbItem.overview || '',
      genreIds: tmdbItem.genre_ids || [],
      voteAverage: tmdbItem.vote_average || 0,
      releaseDate,
      priority,
      addedAt: addedAt.toISOString() // Store as ISO string for DynamoDB compatibility
    };
  }
}