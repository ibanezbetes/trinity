/**
 * Trinity Cache Handler
 * Handles movie caching logic with deterministic ordering and business logic
 * Implements exactly 50 movies per room with western language filtering,
 * description requirements, and genre prioritization algorithm
 */

import { BaseHandler, createHandler } from './base-handler';
import { AppSyncEvent, TrinityMovieCache, CacheMetadata, FilterCriteria, TrinityMovie, TMDBDiscoverResponse, TMDBMovie, TMDBTVShow, ValidationError, TrinityError } from '../shared/types';
import { HandlerUtils } from './base-handler';

// Lambda event interfaces for direct invocation
interface LambdaEvent {
  action: string;
  roomId?: string;
  filterCriteria?: FilterCriteria;
  batchNumber?: number;
  delayHours?: number;
  userId?: string;
}

interface CreateCacheArgs {
  roomId: string;
  filterCriteria: FilterCriteria;
}

interface GetCacheArgs {
  roomId: string;
  sequenceIndex?: number;
}

interface RefreshCacheArgs {
  roomId: string;
}

interface GetCacheStatusArgs {
  roomId: string;
}

class CacheHandler extends BaseHandler {
  private tmdbBaseUrl = 'https://api.themoviedb.org/3';
  private tmdbImageBaseUrl = 'https://image.tmdb.org/t/p/w500';
  private moviesPerRoom = 50; // Business requirement: exactly 50 movies per room
  
  // Western languages (ISO 639-1 codes) - Business requirement
  private westernLanguages = new Set([
    'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi', 'is',
    'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sl', 'et', 'lv', 'lt',
    'mt', 'ga', 'cy', 'eu', 'ca', 'gl', 'oc', 'rm', 'lb', 'fo', 'kl'
  ]);

  async handle(event: AppSyncEvent | LambdaEvent): Promise<any> {
    // Handle direct Lambda invocation (from existing JavaScript Lambda)
    if ('action' in event) {
      return this.handleLambdaEvent(event as LambdaEvent);
    }

    // Handle AppSync GraphQL invocation
    const { fieldName } = HandlerUtils.getOperationInfo(event as AppSyncEvent);
    const { userId } = HandlerUtils.getUserInfo(event as AppSyncEvent);

    this.logger.info(`💾 Cache operation: ${fieldName}`, { userId, fieldName });

    switch (fieldName) {
      case 'createCache':
        return this.createCache((event as AppSyncEvent).arguments as CreateCacheArgs);
      
      case 'getCache':
        return this.getCache((event as AppSyncEvent).arguments as GetCacheArgs);
      
      case 'refreshCache':
        return this.refreshCache((event as AppSyncEvent).arguments as RefreshCacheArgs);
      
      case 'getCacheStatus':
        return this.getCacheStatus((event as AppSyncEvent).arguments as GetCacheStatusArgs);
      
      case 'getRoomMovies':
        return this.getRoomMovies((event as AppSyncEvent).arguments as { roomId: string });
      
      default:
        throw new ValidationError(`Unknown cache operation: ${fieldName}`);
    }
  }

  /**
   * Handle direct Lambda invocation (compatibility with existing JavaScript Lambda)
   */
  private async handleLambdaEvent(event: LambdaEvent): Promise<any> {
    this.logger.info('🎬 Trinity Cache Lambda invoked:', event);

    try {
      const { action, roomId, filterCriteria, batchNumber, delayHours, userId } = event;
      let result;

      switch (action) {
        case 'createCache':
          if (!roomId || !filterCriteria) {
            throw new ValidationError('roomId and filterCriteria are required for createCache');
          }
          result = await this.createRoomCache(roomId, filterCriteria);
          break;

        case 'getNextMovie':
          if (!roomId) {
            throw new ValidationError('roomId is required for getNextMovie');
          }
          result = await this.getNextMovie(roomId, userId);
          break;

        case 'getCurrentIndex':
          if (!roomId) {
            throw new ValidationError('roomId is required for getCurrentIndex');
          }
          result = await this.getCurrentMovieIndex(roomId);
          break;

        case 'getCacheMetadata':
          if (!roomId) {
            throw new ValidationError('roomId is required for getCacheMetadata');
          }
          result = await this.getCacheMetadata(roomId);
          break;

        case 'loadBatch':
          if (!roomId || !batchNumber) {
            throw new ValidationError('roomId and batchNumber are required for loadBatch');
          }
          result = await this.loadMovieBatch(roomId, batchNumber);
          break;

        case 'checkBatchRefresh':
          if (!roomId) {
            throw new ValidationError('roomId is required for checkBatchRefresh');
          }
          result = await this.checkBatchRefreshNeeded(roomId);
          break;

        case 'preloadNextBatch':
          if (!roomId) {
            throw new ValidationError('roomId is required for preloadNextBatch');
          }
          result = await this.preloadNextBatch(roomId);
          break;

        case 'cleanupCache':
          if (!roomId) {
            throw new ValidationError('roomId is required for cleanupCache');
          }
          result = await this.cleanupRoomCache(roomId);
          break;

        case 'scheduleCleanup':
          if (!roomId) {
            throw new ValidationError('roomId is required for scheduleCleanup');
          }
          result = await this.scheduleCleanup(roomId, delayHours || 1);
          break;

        default:
          throw new ValidationError(`Unknown action: ${action}`);
      }

      this.logger.info(`✅ Action ${action} completed successfully`);

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          action,
          result,
          timestamp: new Date().toISOString()
        })
      };

    } catch (error) {
      this.logger.error(`❌ Error in Trinity Cache Lambda:`, error as Error);

      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: (error as Error).message,
          action: event.action || 'unknown',
          timestamp: new Date().toISOString()
        })
      };
    }
  }

  /**
   * Create room cache with exactly 50 movies using business logic (JavaScript Lambda compatibility)
   */
  private async createRoomCache(roomId: string, filterCriteria: FilterCriteria): Promise<any> {
    this.logger.info('🎬 Creating room cache with business logic', { roomId, filterCriteria });
    
    try {
      // Validate filter criteria
      this.validateFilterCriteria(filterCriteria);
      
      // Check if cache already exists
      const existingMetadata = await this.db.get<CacheMetadata>(
        this.config.tables.roomCacheMetadata,
        { roomId }
      );
      
      if (existingMetadata && existingMetadata.status === 'READY') {
        this.logger.info(`Cache already exists for room ${roomId}`);
        return {
          success: true,
          message: 'Cache already exists',
          metadata: existingMetadata
        };
      }

      // Create movie set with exactly 50 movies using business logic
      const movieSet = await this.createMovieSetWithBusinessLogic(filterCriteria);
      
      if (!movieSet || movieSet.movies.length === 0) {
        throw new TrinityError('No movies found matching filter criteria with business logic requirements', 'NO_MOVIES_FOUND', 404);
      }

      // Ensure exactly 50 movies
      if (movieSet.movies.length !== this.moviesPerRoom) {
        throw new TrinityError(`Business logic error: Expected exactly ${this.moviesPerRoom} movies, got ${movieSet.movies.length}`, 'INVALID_MOVIE_COUNT', 500);
      }

      this.logger.info(`Created movie set with ${movieSet.movies.length} movies using business logic`);

      // Calculate TTL (7 days from now)
      const ttl = HandlerUtils.calculateTTL(this.config.app.cache.ttlDays);
      const now = new Date().toISOString();

      // Store movie set in cache table with sequence indexing (0-49)
      const cacheItems: TrinityMovieCache[] = movieSet.movies.map((movie: any, index: number) => ({
        roomId,
        sequenceIndex: index,
        movieId: movie.movieId,
        movieData: {
          id: movie.movieId,
          title: movie.title,
          overview: movie.overview,
          releaseDate: movie.releaseDate,
          posterPath: movie.posterPath,
          backdropPath: movie.backdropPath,
          genreIds: movie.genreIds,
          voteAverage: movie.voteAverage,
          voteCount: movie.voteCount || 0,
          popularity: movie.popularity || 0,
          adult: movie.adult || false,
          originalLanguage: movie.originalLanguage,
          mediaType: filterCriteria.mediaType,
        },
        batchNumber: Math.floor(index / this.config.app.cache.batchSize),
        cachedAt: now,
        ttl,
      }));

      // Batch write cache items
      const batchItems = cacheItems.map(item => ({
        tableName: this.config.tables.roomMovieCache,
        operation: 'PUT' as const,
        item,
      }));

      await this.db.batchWrite(batchItems);

      // Create cache metadata with business logic tracking
      const metadata: CacheMetadata = {
        roomId,
        status: 'READY',
        movieCount: this.moviesPerRoom,
        filterCriteria: {
          ...filterCriteria,
          roomId // Lock filter criteria to room
        },
        createdAt: now,
        updatedAt: now,
        ttl,
      };

      await this.db.put(this.config.tables.roomCacheMetadata, metadata);

      this.logger.info(`Room cache created successfully for room ${roomId} with ${movieSet.movies.length} movies using business logic`);
      
      return {
        success: true,
        message: 'Cache created successfully with business logic',
        metadata,
        movieCount: movieSet.movies.length,
        movieIds: movieSet.movies.map((movie: any) => movie.movieId)
      };

    } catch (error) {
      this.logger.error('❌ Failed to create room cache', error as Error, { roomId });
      throw error;
    }
  }

  /**
   * Get next movie with end-game handling (JavaScript Lambda compatibility)
   */
  private async getNextMovie(roomId: string, userId?: string): Promise<any> {
    this.logger.info(`Getting next movie for room ${roomId}, user ${userId}`);

    try {
      // Get current metadata to check progress
      const metadata = await this.db.get<CacheMetadata>(
        this.config.tables.roomCacheMetadata,
        { roomId }
      );
      
      if (!metadata) {
        throw new TrinityError(`No cache metadata found for room ${roomId}`, 'CACHE_NOT_FOUND', 404);
      }

      // Get current index from metadata (simulating atomic increment)
      const currentIndex = await this.getCurrentSequenceIndex(roomId);

      // Check if we've reached the end
      if (currentIndex >= this.moviesPerRoom) {
        this.logger.warn(`End of suggestions reached for room ${roomId} (${currentIndex}/${this.moviesPerRoom})`);
        
        return {
          isEndOfSuggestions: true,
          message: "Esa era mi última sugerencia. Puedes crear otra sala para continuar.",
          totalMoviesShown: currentIndex,
          totalMoviesAvailable: this.moviesPerRoom,
          roomId: roomId
        };
      }

      // Get movie at current index
      const movie = await this.db.get<TrinityMovieCache>(
        this.config.tables.roomMovieCache,
        { roomId, sequenceIndex: currentIndex }
      );
      
      if (!movie) {
        this.logger.warn(`No movie found at current index ${currentIndex} for room ${roomId}`);
        
        return {
          isEndOfSuggestions: true,
          message: "Esa era mi última sugerencia. Puedes crear otra sala para continuar.",
          totalMoviesShown: currentIndex,
          totalMoviesAvailable: this.moviesPerRoom,
          roomId: roomId
        };
      }

      // Increment current index atomically
      await this.incrementCurrentIndex(roomId);

      // Check if this is approaching the end (last 5 movies)
      const remainingMovies = this.moviesPerRoom - (currentIndex + 1);
      const isNearEnd = remainingMovies <= 5 && remainingMovies > 0;

      this.logger.info(`Retrieved movie: ${movie.movieData.title} (sequence: ${movie.sequenceIndex}), remaining: ${remainingMovies}`);
      
      const result = {
        ...movie.movieData,
        sequenceIndex: movie.sequenceIndex,
        warningMessage: isNearEnd ? `Quedan solo ${remainingMovies} sugerencias más.` : undefined
      };

      return result;

    } catch (error) {
      this.logger.error('❌ Error getting next movie', error as Error, { roomId, userId });
      throw error;
    }
  }

  /**
   * Get current movie index (JavaScript Lambda compatibility)
   */
  private async getCurrentMovieIndex(roomId: string): Promise<number> {
    try {
      return await this.getCurrentSequenceIndex(roomId);
    } catch (error) {
      this.logger.error(`❌ Error getting current index for room ${roomId}:`, error as Error);
      return 0;
    }
  }

  /**
   * Get cache metadata (JavaScript Lambda compatibility)
   */
  private async getCacheMetadata(roomId: string): Promise<CacheMetadata | null> {
    try {
      const metadata = await this.db.get<CacheMetadata>(
        this.config.tables.roomCacheMetadata,
        { roomId }
      );
      return metadata || null;
    } catch (error) {
      this.logger.error(`❌ Error getting cache metadata for room ${roomId}:`, error as Error);
      return null;
    }
  }

  /**
   * Load movie batch (JavaScript Lambda compatibility)
   */
  private async loadMovieBatch(roomId: string, batchNumber: number): Promise<any> {
    this.logger.info(`📦 Loading batch ${batchNumber} for room ${roomId}`);

    try {
      const metadata = await this.getCacheMetadata(roomId);
      if (!metadata) {
        throw new TrinityError(`No cache metadata found for room ${roomId}`, 'CACHE_NOT_FOUND', 404);
      }

      // For now, return empty batch as the main cache has 50 movies
      // This maintains compatibility with the existing JavaScript Lambda
      this.logger.info(`⚠️ No additional batches needed - room has ${this.moviesPerRoom} movies`);
      return { movies: [], batchNumber, totalMovies: 0 };

    } catch (error) {
      this.logger.error(`❌ Error loading batch ${batchNumber} for room ${roomId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Check if batch refresh is needed (JavaScript Lambda compatibility)
   */
  private async checkBatchRefreshNeeded(roomId: string): Promise<boolean> {
    try {
      // With 50 movies per room, no additional batches are needed
      return false;
    } catch (error) {
      this.logger.error(`❌ Error checking batch refresh for room ${roomId}:`, error as Error);
      return false;
    }
  }

  /**
   * Preload next batch (JavaScript Lambda compatibility)
   */
  private async preloadNextBatch(roomId: string): Promise<void> {
    try {
      // With 50 movies per room, no additional batches are needed
      this.logger.info(`✅ No additional batches needed for room ${roomId}`);
    } catch (error) {
      this.logger.error(`❌ Error preloading next batch for room ${roomId}:`, error as Error);
      // Don't throw - preloading failure shouldn't break current flow
    }
  }

  /**
   * Cleanup room cache (JavaScript Lambda compatibility)
   */
  private async cleanupRoomCache(roomId: string): Promise<void> {
    this.logger.info(`Cleaning up cache for room ${roomId}`);

    try {
      // Get cache size before cleanup for metrics
      const metadata = await this.getCacheMetadata(roomId);
      const itemsToDelete = metadata ? metadata.movieCount : 0;

      // Delete all cache entries for the room
      const existingCache = await this.getCache({ roomId });
      
      if (existingCache.length > 0) {
        const deleteItems = existingCache.map(item => ({
          tableName: this.config.tables.roomMovieCache,
          operation: 'DELETE' as const,
          key: { roomId: item.roomId, sequenceIndex: item.sequenceIndex },
        }));

        await this.db.batchWrite(deleteItems);
      }

      // Delete metadata
      await this.db.delete(this.config.tables.roomCacheMetadata, { roomId });
      
      this.logger.info(`Cache cleanup completed for room ${roomId}`);

    } catch (error) {
      this.logger.error(`❌ Error cleaning up cache for room ${roomId}`, error as Error);
      throw error;
    }
  }

  /**
   * Schedule cleanup (JavaScript Lambda compatibility)
   */
  private async scheduleCleanup(roomId: string, delayHours: number = 1): Promise<void> {
    this.logger.info(`⏰ Scheduling cleanup for room ${roomId} in ${delayHours} hours`);

    try {
      const metadata = await this.getCacheMetadata(roomId);
      if (!metadata) return;

      const cleanupTime = new Date(Date.now() + (delayHours * 60 * 60 * 1000)).toISOString();
      
      const updatedMetadata = {
        ...metadata,
        status: 'EXPIRED' as const,
        updatedAt: new Date().toISOString()
      };

      await this.db.put(this.config.tables.roomCacheMetadata, updatedMetadata);
      
      this.logger.info(`✅ Cleanup scheduled for room ${roomId} at ${cleanupTime}`);

    } catch (error) {
      this.logger.error(`❌ Error scheduling cleanup for room ${roomId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Create movie cache for a room with 50 movies (AppSync GraphQL)
   */
  private async createCache(args: CreateCacheArgs): Promise<CacheMetadata> {
    this.validateArgs<CreateCacheArgs>(args, ['roomId', 'filterCriteria']);
    return this.createRoomCache(args.roomId, args.filterCriteria);
  }

  /**
   * Get cached movies for a room (AppSync GraphQL)
   */
  private async getCache(args: GetCacheArgs): Promise<TrinityMovieCache[]> {
    this.validateArgs<GetCacheArgs>(args, ['roomId']);

    if (args.sequenceIndex !== undefined) {
      // Get specific movie by sequence index
      const movie = await this.db.get<TrinityMovieCache>(
        this.config.tables.roomMovieCache,
        { roomId: args.roomId, sequenceIndex: args.sequenceIndex }
      );

      return movie ? [movie] : [];
    } else {
      // Get all cached movies for room
      const result = await this.db.query<TrinityMovieCache>(
        this.config.tables.roomMovieCache,
        'roomId = :roomId',
        {
          expressionAttributeValues: { ':roomId': args.roomId },
          scanIndexForward: true, // Ensure deterministic order
        }
      );

      return result.items;
    }
  }

  /**
   * Refresh cache for a room (AppSync GraphQL)
   */
  private async refreshCache(args: RefreshCacheArgs): Promise<CacheMetadata> {
    this.validateArgs<RefreshCacheArgs>(args, ['roomId']);

    // Get existing cache metadata
    const existingMetadata = await this.db.get<CacheMetadata>(
      this.config.tables.roomCacheMetadata,
      { roomId: args.roomId }
    );

    if (!existingMetadata) {
      throw new ValidationError('Cache metadata not found for room');
    }

    // Clear existing cache
    const existingCache = await this.getCache({ roomId: args.roomId });
    
    if (existingCache.length > 0) {
      const deleteItems = existingCache.map(item => ({
        tableName: this.config.tables.roomMovieCache,
        operation: 'DELETE' as const,
        key: { roomId: item.roomId, sequenceIndex: item.sequenceIndex },
      }));

      await this.db.batchWrite(deleteItems);
    }

    // Recreate cache
    return this.createRoomCache(args.roomId, existingMetadata.filterCriteria);
  }

  /**
   * Get cache status for a room (AppSync GraphQL)
   */
  private async getCacheStatus(args: GetCacheStatusArgs): Promise<CacheMetadata> {
    this.validateArgs<GetCacheStatusArgs>(args, ['roomId']);

    const metadata = await this.db.get<CacheMetadata>(
      this.config.tables.roomCacheMetadata,
      { roomId: args.roomId }
    );

    if (!metadata) {
      throw new ValidationError('Cache not found for room');
    }

    return metadata;
  }

  /**
   * Get all movies for a room (AppSync GraphQL convenience method)
   */
  private async getRoomMovies(args: { roomId: string }): Promise<TrinityMovie[]> {
    const cacheItems = await this.getCache({ roomId: args.roomId });
    return cacheItems.map(item => item.movieData);
  }

  // Business Logic Methods

  /**
   * Create movie set with exactly 50 movies using business logic
   */
  private async createMovieSetWithBusinessLogic(filterCriteria: FilterCriteria): Promise<any> {
    this.logger.info(`🎬 Creating movie set with business logic:`, filterCriteria);

    try {
      // Step 1: Fetch movies from TMDB with filters
      let allMovies = await this.fetchMoviesWithFilters(filterCriteria);
      
      if (allMovies.length === 0) {
        throw new TrinityError('No movies found matching filter criteria', 'NO_MOVIES_FOUND', 404);
      }

      this.logger.debug(`📦 Fetched ${allMovies.length} movies from TMDB`);

      // Step 2: Apply western language filter (business requirement)
      allMovies = this.applyWesternLanguageFilter(allMovies);
      this.logger.debug(`🌍 After western language filter: ${allMovies.length} movies`);

      // Step 3: Apply description requirement filter (business requirement)
      allMovies = this.applyDescriptionFilter(allMovies);
      this.logger.debug(`📝 After description filter: ${allMovies.length} movies`);

      if (allMovies.length === 0) {
        throw new TrinityError('No movies found after applying business logic filters (western languages + descriptions)', 'NO_MOVIES_FOUND', 404);
      }

      // Step 4: Apply genre prioritization algorithm (business requirement)
      allMovies = this.prioritizeByGenres(allMovies, filterCriteria.genreIds);
      this.logger.debug(`🎯 After genre prioritization: ${allMovies.length} movies`);

      // Step 5: Randomize within filter constraints and select exactly 50
      const selectedMovies = this.randomizeAndSelect(allMovies, this.moviesPerRoom);
      
      if (selectedMovies.length !== this.moviesPerRoom) {
        throw new TrinityError(`Business logic error: Expected exactly ${this.moviesPerRoom} movies, got ${selectedMovies.length}`, 'INVALID_MOVIE_COUNT', 500);
      }

      // Step 6: Convert to cache format with sequence indexing
      const cachedMovies = selectedMovies.map((movie, index) => ({
        movieId: movie.id.toString(),
        title: movie.title || movie.name,
        overview: movie.overview || '',
        posterPath: movie.poster_path ? `${this.tmdbImageBaseUrl}${movie.poster_path}` : null,
        backdropPath: movie.backdrop_path ? `${this.tmdbImageBaseUrl}${movie.backdrop_path}` : null,
        releaseDate: movie.release_date || movie.first_air_date || '',
        voteAverage: movie.vote_average || 0,
        voteCount: movie.vote_count || 0,
        popularity: movie.popularity || 0,
        adult: movie.adult || false,
        genreIds: movie.genre_ids || [],
        originalLanguage: movie.original_language || '',
        mediaType: filterCriteria.mediaType,
        priority: (movie as any).genrePriority || 1,
        sequenceIndex: index // 0-49 for exactly 50 movies
      }));

      this.logger.info(`✅ Created movie set with ${cachedMovies.length} movies using business logic`);

      return {
        movies: cachedMovies,
        filterCriteria,
        createdAt: new Date().toISOString(),
        totalMovies: cachedMovies.length,
        businessLogicApplied: {
          westernLanguagesOnly: true,
          descriptionRequired: true,
          genrePrioritization: true,
          exactlyFiftyMovies: true
        }
      };

    } catch (error) {
      this.logger.error(`❌ Error creating movie set with business logic:`, error as Error);
      throw error;
    }
  }

  /**
   * Fetch movies from TMDB with media type and genre filters
   */
  private async fetchMoviesWithFilters(filterCriteria: FilterCriteria): Promise<any[]> {
    try {
      const endpoint = filterCriteria.mediaType === 'MOVIE' ? 'movie' : 'tv';
      const movies: any[] = [];
      let page = 1;
      const maxPages = 10; // Fetch more pages to ensure we have enough after filtering
      const targetMovies = this.moviesPerRoom * 3; // Fetch 3x more to account for filtering

      while (movies.length < targetMovies && page <= maxPages) {
        const params: Record<string, string> = {
          page: page.toString(),
          sort_by: 'popularity.desc',
          'vote_count.gte': '10', // Minimum vote count for quality
          language: 'en-US', // Use English for broader results, filter languages later
          include_adult: 'false'
        };

        // Only add genre filter if genres are specified
        if (filterCriteria.genreIds && filterCriteria.genreIds.length > 0) {
          params.with_genres = filterCriteria.genreIds.join(',');
        }

        this.logger.debug(`📡 Fetching ${endpoint} page ${page} with genres ${filterCriteria.genreIds && filterCriteria.genreIds.length > 0 ? filterCriteria.genreIds.join(',') : 'all genres'}`);
        
        const response = await this.makeRequest(`/discover/${endpoint}`, params);
        const pageMovies = response.results || [];

        movies.push(...pageMovies);
        page++;

        // Break if no more pages
        if (page > (response.total_pages || 1)) break;
      }

      // Remove duplicates
      const uniqueMovies = this.removeDuplicates(movies);
      this.logger.debug(`📦 Fetched ${uniqueMovies.length} unique movies from TMDB`);
      
      return uniqueMovies;

    } catch (error) {
      this.logger.error(`❌ Error fetching movies from TMDB:`, error as Error);
      throw error;
    }
  }

  /**
   * Apply western language filter (business requirement)
   */
  private applyWesternLanguageFilter(movies: any[]): any[] {
    const filtered = movies.filter(movie => {
      const language = movie.original_language;
      if (!language) return false;
      
      const isWestern = this.westernLanguages.has(language.toLowerCase());
      if (!isWestern) {
        this.logger.debug(`🚫 Excluding non-western language: ${movie.title || movie.name} (${language})`);
      }
      return isWestern;
    });

    this.logger.debug(`🌍 Western language filter: ${movies.length} -> ${filtered.length} movies`);
    return filtered;
  }

  /**
   * Apply description requirement filter (business requirement)
   */
  private applyDescriptionFilter(movies: any[]): any[] {
    const filtered = movies.filter(movie => {
      const overview = movie.overview;
      const hasDescription = overview && typeof overview === 'string' && overview.trim().length > 0;
      
      if (!hasDescription) {
        this.logger.debug(`🚫 Excluding movie without description: ${movie.title || movie.name}`);
      }
      return hasDescription;
    });

    this.logger.debug(`📝 Description filter: ${movies.length} -> ${filtered.length} movies`);
    return filtered;
  }

  /**
   * Apply genre prioritization algorithm (business requirement)
   * Priority 1: Movies with ALL selected genres
   * Priority 2: Movies with ANY selected genres
   */
  private prioritizeByGenres(movies: any[], selectedGenres: number[]): any[] {
    if (!selectedGenres || selectedGenres.length === 0) {
      // When no genres are specified, assign all movies the same priority
      return movies.map(movie => ({
        ...movie,
        genrePriority: 1 // All movies have equal priority when no genres specified
      }));
    }

    const moviesWithPriority = movies.map(movie => {
      const movieGenres = movie.genre_ids || [];
      
      // Check if movie has ALL selected genres (highest priority)
      const hasAllGenres = selectedGenres.every(genreId => movieGenres.includes(genreId));
      
      // Check if movie has ANY selected genres (medium priority)
      const hasAnyGenre = selectedGenres.some(genreId => movieGenres.includes(genreId));
      
      let priority;
      if (hasAllGenres) {
        priority = 1; // Highest priority - has all genres
      } else if (hasAnyGenre) {
        priority = 2; // Medium priority - has some genres
      } else {
        priority = 3; // Lowest priority - no matching genres (fallback)
      }
      
      return {
        ...movie,
        genrePriority: priority
      };
    });

    // Sort by priority (1 = highest, 3 = lowest)
    const sorted = moviesWithPriority.sort((a, b) => a.genrePriority - b.genrePriority);
    
    const priorityCounts = {
      1: sorted.filter(m => m.genrePriority === 1).length,
      2: sorted.filter(m => m.genrePriority === 2).length,
      3: sorted.filter(m => m.genrePriority === 3).length
    };
    
    this.logger.debug(`🎯 Genre prioritization: Priority 1 (all genres): ${priorityCounts[1]}, Priority 2 (any genre): ${priorityCounts[2]}, Priority 3 (fallback): ${priorityCounts[3]}`);
    
    return sorted;
  }

  /**
   * Randomize movies within filter constraints and select exactly N movies
   */
  private randomizeAndSelect(movies: any[], count: number): any[] {
    if (movies.length <= count) {
      // If we have fewer movies than needed, return all and log warning
      this.logger.warn(`⚠️ Only ${movies.length} movies available, need ${count}. Returning all available.`);
      return this.shuffleArray(movies);
    }

    // Group by priority for controlled randomization
    const priority1 = movies.filter(m => (m as any).genrePriority === 1);
    const priority2 = movies.filter(m => (m as any).genrePriority === 2);
    const priority3 = movies.filter(m => (m as any).genrePriority === 3);

    // Shuffle each priority group
    const shuffledP1 = this.shuffleArray(priority1);
    const shuffledP2 = this.shuffleArray(priority2);
    const shuffledP3 = this.shuffleArray(priority3);

    // Select movies prioritizing higher priority groups
    const selected: any[] = [];
    
    // Take as many as possible from priority 1
    const fromP1 = Math.min(shuffledP1.length, count);
    selected.push(...shuffledP1.slice(0, fromP1));
    
    // Fill remaining from priority 2
    const remaining = count - selected.length;
    if (remaining > 0) {
      const fromP2 = Math.min(shuffledP2.length, remaining);
      selected.push(...shuffledP2.slice(0, fromP2));
    }
    
    // Fill any remaining from priority 3
    const stillRemaining = count - selected.length;
    if (stillRemaining > 0) {
      const fromP3 = Math.min(shuffledP3.length, stillRemaining);
      selected.push(...shuffledP3.slice(0, fromP3));
    }

    this.logger.debug(`🎲 Selected ${selected.length} movies: ${fromP1} from priority 1, ${Math.min(shuffledP2.length, remaining)} from priority 2, ${Math.min(shuffledP3.length, stillRemaining)} from priority 3`);
    
    return selected;
  }

  /**
   * Remove duplicate movies based on ID
   */
  private removeDuplicates(movies: any[]): any[] {
    const seenIds = new Set<string>();
    const uniqueMovies: any[] = [];

    for (const movie of movies) {
      const movieId = movie.id.toString();
      if (!seenIds.has(movieId)) {
        seenIds.add(movieId);
        uniqueMovies.push(movie);
      }
    }

    this.logger.debug(`🔄 Removed duplicates: ${movies.length} -> ${uniqueMovies.length} movies`);
    return uniqueMovies;
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Helper Methods

  /**
   * Get current sequence index for a room
   */
  private async getCurrentSequenceIndex(roomId: string): Promise<number> {
    try {
      const metadata = await this.db.get<any>(
        this.config.tables.roomCacheMetadata,
        { roomId }
      );
      return metadata?.currentIndex || 0;
    } catch (error) {
      this.logger.error(`❌ Error getting current sequence index for room ${roomId}:`, error as Error);
      return 0;
    }
  }

  /**
   * Atomically increment current index for a room
   */
  private async incrementCurrentIndex(roomId: string): Promise<void> {
    try {
      await this.db.update(
        this.config.tables.roomCacheMetadata,
        { roomId },
        'ADD currentIndex :inc SET updatedAt = :now',
        {
          expressionAttributeValues: {
            ':inc': 1,
            ':now': new Date().toISOString()
          },
          conditionExpression: 'attribute_exists(roomId)'
        }
      );
    } catch (error) {
      this.logger.error(`❌ Error incrementing current index for room ${roomId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Validate filter criteria according to business logic
   */
  private validateFilterCriteria(filterCriteria: FilterCriteria): void {
    if (!filterCriteria) {
      throw new ValidationError('Filter criteria is required');
    }

    // Media type validation - must be MOVIE or TV (exclusive)
    if (!filterCriteria.mediaType || !['MOVIE', 'TV'].includes(filterCriteria.mediaType)) {
      throw new ValidationError('Media type must be either MOVIE or TV (exclusive selection)');
    }

    // Genre validation - must have 0, 1, or 2 genres
    if (!filterCriteria.genreIds || !Array.isArray(filterCriteria.genreIds)) {
      throw new ValidationError('Genre IDs must be provided as an array');
    }

    if (filterCriteria.genreIds.length > 2) {
      throw new ValidationError('Must select 0, 1, or 2 genres (0 = popular movies, 1-2 = specific genres)');
    }

    // Validate genre IDs are numbers
    if (!filterCriteria.genreIds.every(id => typeof id === 'number' && id > 0)) {
      throw new ValidationError('Genre IDs must be positive numbers');
    }

    // Room capacity validation
    if (filterCriteria.roomCapacity && (typeof filterCriteria.roomCapacity !== 'number' || filterCriteria.roomCapacity < 2)) {
      throw new ValidationError('Room capacity must be a number >= 2');
    }
  }

  /**
   * Make HTTP request to TMDB API
   */
  private async makeRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    const url = new URL(`${this.tmdbBaseUrl}${endpoint}`);
    
    // Add API key
    url.searchParams.append('api_key', this.config.external.tmdbApiKey);
    
    // Add other parameters
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Trinity-Cache-System/1.0'
        },
        // Add timeout
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (!response.ok) {
        throw new TrinityError(`TMDB API error: ${response.status} ${response.statusText}`, 'TMDB_API_ERROR', response.status);
      }

      return await response.json();
    } catch (error) {
      this.logger.error('❌ TMDB API request failed', error as Error, { endpoint, params });
      
      if ((error as any).name === 'AbortError') {
        throw new TrinityError('TMDB API request timeout', 'TMDB_TIMEOUT', 408);
      }
      
      throw error;
    }
  }

  /**
   * Transform TMDB movie/TV show to Trinity format
   */
  private transformToTrinityMovie(item: TMDBMovie | TMDBTVShow, mediaType: 'MOVIE' | 'TV'): TrinityMovie {
    const isMovie = mediaType === 'MOVIE';
    const movieItem = item as TMDBMovie;
    const tvItem = item as TMDBTVShow;

    return {
      id: item.id.toString(),
      title: isMovie ? movieItem.title : tvItem.name,
      overview: item.overview,
      releaseDate: isMovie ? movieItem.release_date : tvItem.first_air_date,
      posterPath: item.poster_path ? `${this.tmdbImageBaseUrl}${item.poster_path}` : undefined,
      backdropPath: item.backdrop_path ? `${this.tmdbImageBaseUrl}${item.backdrop_path}` : undefined,
      genreIds: item.genre_ids,
      voteAverage: item.vote_average,
      voteCount: item.vote_count,
      popularity: item.popularity,
      adult: item.adult,
      originalLanguage: item.original_language,
      mediaType,
    };
  }
}

// Export the handler
export const handler = createHandler(CacheHandler);