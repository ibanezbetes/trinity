const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand, UpdateCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const MovieSetLoader = require('./MovieSetLoader');
const EnhancedMovieSetLoader = require('./EnhancedMovieSetLoader');
const CacheStorageManager = require('./CacheStorageManager');
const EndGameMessageService = require('./EndGameMessageService');
const CacheMetrics = require('../utils/CacheMetrics');

/**
 * Core service managing movie cache lifecycle for rooms with business logic
 * Implements exactly 50 movies per room with western language filtering,
 * description requirements, and genre prioritization algorithm
 */
class RoomMovieCacheService {
  constructor() {
    this.dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
    this.movieSetLoader = new MovieSetLoader();
    this.enhancedMovieSetLoader = new EnhancedMovieSetLoader();
    this.storageManager = new CacheStorageManager(this.dynamoClient);
    this.endGameService = new EndGameMessageService(this.dynamoClient);
    this.metrics = new CacheMetrics();
    
    this.CACHE_TABLE = process.env.ROOM_MOVIE_CACHE_TABLE;
    this.METADATA_TABLE = process.env.ROOM_CACHE_METADATA_TABLE;
    this.MOVIES_PER_ROOM = 50; // Business requirement: exactly 50 movies per room
    this.CACHE_TTL_DAYS = parseInt(process.env.CACHE_TTL_DAYS) || 7;
    
    // Feature flag for enhanced movie set loader
    this.USE_ENHANCED_LOADER = process.env.USE_ENHANCED_MOVIE_LOADER === 'true' || true; // Default to true for integration
    
    // Western languages (ISO 639-1 codes)
    this.WESTERN_LANGUAGES = new Set([
      'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi', 'is',
      'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sl', 'et', 'lv', 'lt',
      'mt', 'ga', 'cy', 'eu', 'ca', 'gl', 'oc', 'rm', 'lb', 'fo', 'kl'
    ]);
  }

  /**
   * Creates a new room cache with exactly 50 movies using business logic
   * @param {string} roomId - Room identifier
   * @param {Object} filterCriteria - Filter criteria for movies
   * @param {string} filterCriteria.mediaType - MOVIE or TV (exclusive)
   * @param {number[]} filterCriteria.genreIds - 1 or 2 genre IDs
   * @param {number} filterCriteria.roomCapacity - Room capacity for match detection
   * @returns {Promise<Object>} Cache creation result
   */
  async createRoomCache(roomId, filterCriteria) {
    const timer = this.metrics.createTimer('createRoomCache');
    this.metrics.log('info', 'createRoomCache', `Creating room cache for room ${roomId} with business logic`, { filterCriteria });
    
    try {
      // Validate filter criteria
      this.validateFilterCriteria(filterCriteria);
      
      // Check if cache already exists
      const existingMetadata = await this.storageManager.getCacheMetadata(roomId);
      if (existingMetadata && existingMetadata.status === 'ACTIVE') {
        this.metrics.log('info', 'createRoomCache', `Cache already exists for room ${roomId}`);
        await timer.finish(true, { cacheHit: true });
        return {
          success: true,
          message: 'Cache already exists',
          metadata: existingMetadata
        };
      }

      // Create movie set with exactly 50 movies using business logic
      const movieSetLoader = this.USE_ENHANCED_LOADER ? this.enhancedMovieSetLoader : this.movieSetLoader;
      const loaderType = this.USE_ENHANCED_LOADER ? 'Enhanced' : 'Legacy';
      
      console.log(`🎬 Using ${loaderType} MovieSetLoader for room ${roomId}`);
      const movieSet = await movieSetLoader.createMovieSet(filterCriteria);
      
      if (!movieSet || movieSet.movies.length === 0) {
        throw new Error('No movies found matching filter criteria with business logic requirements');
      }

      // Ensure exactly 50 movies
      if (movieSet.movies.length !== this.MOVIES_PER_ROOM) {
        throw new Error(`Business logic error: Expected exactly ${this.MOVIES_PER_ROOM} movies, got ${movieSet.movies.length}`);
      }

      this.metrics.log('info', 'createRoomCache', `Created movie set with ${movieSet.movies.length} movies using business logic`);

      // Calculate TTL (7 days from now)
      const ttl = Math.floor(Date.now() / 1000) + (this.CACHE_TTL_DAYS * 24 * 60 * 60);

      // Store movie set in cache table with sequence indexing (0-49)
      await this.storageManager.storeMovieSet(roomId, movieSet, ttl);

      // Create cache metadata with business logic tracking
      const metadata = {
        roomId,
        totalMovies: this.MOVIES_PER_ROOM, // Always 50
        cacheComplete: true,
        filterCriteria: {
          ...filterCriteria,
          roomId // Lock filter criteria to room
        },
        roomCapacity: filterCriteria.roomCapacity || 2,
        currentMembers: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'ACTIVE',
        ttl,
        businessLogicApplied: {
          westernLanguagesOnly: true,
          descriptionRequired: true,
          genrePrioritization: true,
          exactlyFiftyMovies: true,
          loaderType: loaderType,
          enhancedTMDBClient: this.USE_ENHANCED_LOADER,
          genreMappingForTV: this.USE_ENHANCED_LOADER
        }
      };

      await this.storageManager.updateCacheMetadata(roomId, metadata);

      this.metrics.log('info', 'createRoomCache', `Room cache created successfully for room ${roomId} with ${movieSet.movies.length} movies using business logic`);
      await timer.finish(true, { 
        movieCount: movieSet.movies.length,
        cacheHit: false,
        businessLogicApplied: true
      });
      
      return {
        success: true,
        message: 'Cache created successfully with business logic',
        metadata,
        movieCount: movieSet.movies.length,
        movieIds: movieSet.movies.map(movie => movie.movieId) // Use movieId property
      };

    } catch (error) {
      this.metrics.log('error', 'createRoomCache', `Error creating room cache for ${roomId}`, { error: error.message });
      await this.metrics.recordError('createRoomCache', error, { roomId, filterCriteria });
      await timer.finish(false);
      throw error;
    }
  }

  /**
   * Loads additional movie batch for a room
   * @param {string} roomId - Room identifier
   * @param {number} batchNumber - Batch number to load
   * @returns {Promise<Object>} Movie batch
   */
  async loadMovieBatch(roomId, batchNumber) {
    console.log(`📦 Loading batch ${batchNumber} for room ${roomId}`);

    try {
      const metadata = await this.storageManager.getCacheMetadata(roomId);
      if (!metadata) {
        throw new Error(`No cache metadata found for room ${roomId}`);
      }

      if (batchNumber > this.MAX_BATCHES) {
        throw new Error(`Maximum batches (${this.MAX_BATCHES}) exceeded`);
      }

      // Get existing movie IDs to prevent duplicates
      const existingMovieIds = await this.getExistingMovieIds(roomId);
      
      // Create new batch excluding existing movies
      const movieBatch = await this.movieBatchLoader.createMovieBatch(
        metadata.filterCriteria,
        existingMovieIds,
        this.BATCH_SIZE
      );

      if (!movieBatch || movieBatch.movies.length === 0) {
        console.log(`⚠️  No new movies available for batch ${batchNumber}`);
        return { movies: [], batchNumber, totalMovies: 0 };
      }

      // Calculate TTL
      const ttl = Math.floor(Date.now() / 1000) + (this.CACHE_TTL_DAYS * 24 * 60 * 60);

      // Store new batch
      await this.storageManager.storeBatch(roomId, movieBatch, batchNumber, ttl);

      // Update metadata
      const updatedMetadata = {
        ...metadata,
        totalMovies: metadata.totalMovies + movieBatch.movies.length,
        batchesLoaded: batchNumber,
        lastBatchLoadedAt: new Date().toISOString(),
        nextBatchThreshold: metadata.totalMovies + Math.floor(movieBatch.movies.length * 0.8),
        updatedAt: new Date().toISOString()
      };

      await this.storageManager.updateCacheMetadata(roomId, updatedMetadata);

      console.log(`✅ Batch ${batchNumber} loaded with ${movieBatch.movies.length} movies`);

      return movieBatch;

    } catch (error) {
      console.error(`❌ Error loading batch ${batchNumber} for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Gets the next movie for a room and handles end-game scenarios
   * @param {string} roomId - Room identifier
   * @param {string} userId - User identifier (optional, for end-game messaging)
   * @returns {Promise<Object|null>} Next cached movie or end-game message
   */
  async getNextMovieWithEndGameHandling(roomId, userId = null) {
    const timer = this.metrics.createTimer('getNextMovieWithEndGameHandling');
    this.metrics.log('info', 'getNextMovieWithEndGameHandling', `Getting next movie for room ${roomId}, user ${userId}`);

    try {
      // If userId is provided, check for end-game scenarios first
      if (userId) {
        const endGameResult = await this.endGameService.determineEndGameMessage(roomId, userId);
        
        if (endGameResult.isEndGame) {
          this.metrics.log('info', 'getNextMovieWithEndGameHandling', `End-game scenario for user ${userId}: ${endGameResult.messageType}`);
          
          await timer.finish(true, { endGame: true, messageType: endGameResult.messageType });
          
          return {
            isEndOfSuggestions: true,
            isEndGame: true,
            message: endGameResult.message,
            messageType: endGameResult.messageType,
            votedCount: endGameResult.votedCount,
            totalMovies: endGameResult.totalMovies,
            isLastUser: endGameResult.isLastUser,
            roomId: roomId,
            userId: userId
          };
        }
      }

      // Continue with normal movie retrieval
      const movie = await this.getNextMovie(roomId);
      
      await timer.finish(true, { endGame: false });
      return movie;

    } catch (error) {
      this.metrics.log('error', 'getNextMovieWithEndGameHandling', `Error getting next movie with end-game handling for room ${roomId}`, { error: error.message });
      await this.metrics.recordError('getNextMovieWithEndGameHandling', error, { roomId, userId });
      await timer.finish(false);
      throw error;
    }
  }

  /**
   * Gets the next movie for a room and increments sequence
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object|null>} Next cached movie or null with end-of-cache detection
   */
  async getNextMovie(roomId) {
    const timer = this.metrics.createTimer('getNextMovie');
    this.metrics.log('info', 'getNextMovie', `Getting next movie for room ${roomId} (atomic)`);

    try {
      // 🚨 TEMPORARY BYPASS: Force fresh TMDB fetch instead of cache
      console.log('🚨 CACHE BYPASS ACTIVE: Forcing fresh TMDB fetch instead of cache');
      
      // Get metadata to understand filter criteria
      const metadata = await this.storageManager.getCacheMetadata(roomId);
      if (!metadata) {
        throw new Error(`No cache metadata found for room ${roomId}`);
      }

      // Force fresh movie fetch from TMDB
      const movieSetLoader = this.USE_ENHANCED_LOADER ? this.enhancedMovieSetLoader : this.movieSetLoader;
      console.log('🚨 FORCING FRESH TMDB CALL WITH FILTER CRITERIA:', JSON.stringify(metadata.filterCriteria, null, 2));
      
      const freshMovieSet = await movieSetLoader.createMovieSet(metadata.filterCriteria);
      
      if (!freshMovieSet || freshMovieSet.movies.length === 0) {
        console.log('🚨 NO MOVIES RETURNED FROM FRESH TMDB CALL');
        return {
          isEndOfSuggestions: true,
          message: "No movies found with fresh TMDB call",
          roomId: roomId
        };
      }

      // Return first movie from fresh set
      const firstMovie = freshMovieSet.movies[0];
      console.log('🚨 RETURNING FRESH MOVIE FROM TMDB:', JSON.stringify(firstMovie, null, 2));
      
      await timer.finish(true, { 
        cacheHit: false, 
        freshTMDBCall: true,
        movieTitle: firstMovie.title
      });
      
      return firstMovie;

    } catch (error) {
      this.metrics.log('error', 'getNextMovie', `Error getting next movie for room ${roomId}`, { error: error.message });
      await this.metrics.recordError('getNextMovie', error, { roomId });
      await timer.finish(false);
      throw error;
    }
  }

  /**
   * Gets current sequence position for a room
   * @param {string} roomId - Room identifier
   * @returns {Promise<number>} Current sequence index
   */
  async getCurrentIndex(roomId) {
    console.log(`📍 Getting current index for room ${roomId}`);
    
    try {
      return await this.storageManager.getCurrentSequenceIndex(roomId);
    } catch (error) {
      console.error(`❌ Error getting current index for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Validates sequence consistency for a room
   * @param {string} roomId - Room identifier
   * @returns {Promise<boolean>} True if sequence is consistent
   */
  async validateSequenceConsistency(roomId) {
    console.log(`🔍 Validating sequence consistency for room ${roomId}`);
    
    try {
      return await this.storageManager.validateSequenceConsistency(roomId);
    } catch (error) {
      console.error(`❌ Error validating sequence consistency for room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Resets sequence position (for admin/testing purposes)
   * @param {string} roomId - Room identifier
   * @param {number} newIndex - New sequence index
   * @returns {Promise<void>}
   */
  async resetSequence(roomId, newIndex = 0) {
    console.log(`🔄 Resetting sequence for room ${roomId} to index ${newIndex}`);
    
    try {
      await this.storageManager.resetSequenceIndex(roomId, newIndex);
      console.log(`✅ Sequence reset completed for room ${roomId}`);
    } catch (error) {
      console.error(`❌ Error resetting sequence for room ${roomId}:`, error);
      throw error;
    }
  }
  async getCurrentMovieIndex(roomId) {
    try {
      const metadata = await this.storageManager.getCacheMetadata(roomId);
      return metadata ? metadata.currentIndex : 0;
    } catch (error) {
      console.error(`❌ Error getting current index for room ${roomId}:`, error);
      return 0;
    }
  }

  /**
   * Gets cache metadata for a room
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object|null>} Cache metadata
   */
  async getCacheMetadata(roomId) {
    try {
      const metadata = await this.storageManager.getCacheMetadata(roomId);
      return metadata;
    } catch (error) {
      console.error(`❌ Error getting cache metadata for room ${roomId}:`, error);
      return null;
    }
  }

  /**
   * Checks if batch refresh is needed
   * @param {string} roomId - Room identifier
   * @returns {Promise<boolean>} Whether batch refresh is needed
   */
  async checkBatchRefreshNeeded(roomId) {
    try {
      const metadata = await this.storageManager.getCacheMetadata(roomId);
      if (!metadata) return false;

      return metadata.currentIndex >= metadata.nextBatchThreshold && 
             metadata.batchesLoaded < this.MAX_BATCHES;
    } catch (error) {
      console.error(`❌ Error checking batch refresh for room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Preloads the next batch of movies
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  async preloadNextBatch(roomId) {
    try {
      const metadata = await this.storageManager.getCacheMetadata(roomId);
      if (!metadata) {
        throw new Error(`No metadata found for room ${roomId}`);
      }

      const nextBatchNumber = metadata.batchesLoaded + 1;
      
      if (nextBatchNumber > this.MAX_BATCHES) {
        console.log(`⚠️  Maximum batches reached for room ${roomId}`);
        return;
      }

      await this.loadMovieBatch(roomId, nextBatchNumber);
      console.log(`✅ Preloaded batch ${nextBatchNumber} for room ${roomId}`);

    } catch (error) {
      console.error(`❌ Error preloading next batch for room ${roomId}:`, error);
      // Don't throw - preloading failure shouldn't break current flow
    }
  }

  /**
   * Cleans up room cache
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  async cleanupRoomCache(roomId) {
    const timer = this.metrics.createTimer('cleanupRoomCache');
    this.metrics.log('info', 'cleanupRoomCache', `Cleaning up cache for room ${roomId}`);

    try {
      // Get cache size before cleanup for metrics
      const metadata = await this.storageManager.getCacheMetadata(roomId);
      const itemsToDelete = metadata ? metadata.totalMovies : 0;

      // Delete all cache entries for the room
      await this.storageManager.deleteRoomCache(roomId);
      
      this.metrics.log('info', 'cleanupRoomCache', `Cache cleanup completed for room ${roomId}`);
      
      // Record cleanup metrics
      await this.metrics.recordCleanupMetrics('MANUAL', itemsToDelete, true);
      await timer.finish(true, { itemsDeleted: itemsToDelete });

    } catch (error) {
      this.metrics.log('error', 'cleanupRoomCache', `Error cleaning up cache for room ${roomId}`, { error: error.message });
      await this.metrics.recordError('cleanupRoomCache', error, { roomId });
      await this.metrics.recordCleanupMetrics('MANUAL', 0, false);
      await timer.finish(false);
      throw error;
    }
  }

  /**
   * Schedules cache cleanup with delay
   * @param {string} roomId - Room identifier
   * @param {number} delayHours - Delay in hours
   * @returns {Promise<void>}
   */
  async scheduleCleanup(roomId, delayHours = 1) {
    console.log(`⏰ Scheduling cleanup for room ${roomId} in ${delayHours} hours`);

    try {
      const metadata = await this.storageManager.getCacheMetadata(roomId);
      if (!metadata) return;

      const cleanupTime = new Date(Date.now() + (delayHours * 60 * 60 * 1000)).toISOString();
      
      const updatedMetadata = {
        ...metadata,
        status: 'CLEANUP',
        cleanupScheduledAt: cleanupTime,
        updatedAt: new Date().toISOString()
      };

      await this.storageManager.updateCacheMetadata(roomId, updatedMetadata);
      
      console.log(`✅ Cleanup scheduled for room ${roomId} at ${cleanupTime}`);

    } catch (error) {
      console.error(`❌ Error scheduling cleanup for room ${roomId}:`, error);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Validates filter criteria according to business logic
   * @param {Object} filterCriteria - Filter criteria to validate
   * @throws {Error} If criteria don't meet business requirements
   */
  validateFilterCriteria(filterCriteria) {
    if (!filterCriteria) {
      throw new Error('Filter criteria is required');
    }

    // Media type validation - must be MOVIE or TV (exclusive)
    if (!filterCriteria.mediaType || !['MOVIE', 'TV'].includes(filterCriteria.mediaType)) {
      throw new Error('Media type must be either MOVIE or TV (exclusive selection)');
    }

    // Genre validation - must have 1 or 2 genres
    if (!filterCriteria.genreIds || !Array.isArray(filterCriteria.genreIds)) {
      throw new Error('Genre IDs must be provided as an array');
    }

    if (filterCriteria.genreIds.length < 0 || filterCriteria.genreIds.length > 2) {
      throw new Error('Must select 0, 1, or 2 genres (0 = popular movies, 1-2 = specific genres)');
    }

    // Validate genre IDs are numbers
    if (!filterCriteria.genreIds.every(id => typeof id === 'number' && id > 0)) {
      throw new Error('Genre IDs must be positive numbers');
    }

    // Room capacity validation
    if (filterCriteria.roomCapacity && (typeof filterCriteria.roomCapacity !== 'number' || filterCriteria.roomCapacity < 2)) {
      throw new Error('Room capacity must be a number >= 2');
    }
  }

  /**
   * Validates that a movie meets western language requirements
   * @param {Object} movie - Movie object to validate
   * @returns {boolean} True if movie has western language
   */
  isWesternLanguage(movie) {
    if (!movie.originalLanguage && !movie.original_language) {
      return false; // No language info = exclude
    }
    
    const language = movie.originalLanguage || movie.original_language;
    return this.WESTERN_LANGUAGES.has(language.toLowerCase());
  }

  /**
   * Validates that a movie has a non-empty description
   * @param {Object} movie - Movie object to validate
   * @returns {boolean} True if movie has valid description
   */
  hasValidDescription(movie) {
    const overview = movie.overview;
    return overview && typeof overview === 'string' && overview.trim().length > 0;
  }

  /**
   * Applies genre prioritization algorithm
   * Priority 1: Movies with ALL selected genres
   * Priority 2: Movies with ANY selected genres
   * @param {Object[]} movies - Array of movies
   * @param {number[]} selectedGenres - Selected genre IDs
   * @returns {Object[]} Movies sorted by genre priority
   */
  applyGenrePrioritization(movies, selectedGenres) {
    if (!selectedGenres || selectedGenres.length === 0) {
      return movies;
    }

    const moviesWithPriority = movies.map(movie => {
      const movieGenres = movie.genreIds || movie.genre_ids || [];
      
      // Check if movie has ALL selected genres
      const hasAllGenres = selectedGenres.every(genreId => movieGenres.includes(genreId));
      
      // Check if movie has ANY selected genres
      const hasAnyGenre = selectedGenres.some(genreId => movieGenres.includes(genreId));
      
      let priority;
      if (hasAllGenres) {
        priority = 1; // Highest priority - has all genres
      } else if (hasAnyGenre) {
        priority = 2; // Medium priority - has some genres
      } else {
        priority = 3; // Lowest priority - no matching genres
      }
      
      return {
        ...movie,
        genrePriority: priority
      };
    });

    // Sort by priority (1 = highest, 3 = lowest), then randomize within each priority
    return moviesWithPriority
      .sort((a, b) => {
        if (a.genrePriority !== b.genrePriority) {
          return a.genrePriority - b.genrePriority;
        }
        // Randomize within same priority
        return Math.random() - 0.5;
      });
  }

  /**
   * Schedules cache cleanup with delay
   * @param {string} roomId - Room identifier
   * @param {number} delayHours - Delay in hours
   * @returns {Promise<void>}
   */
  async scheduleCleanup(roomId, delayHours = 1) {
    console.log(`⏰ Scheduling cleanup for room ${roomId} in ${delayHours} hours`);

    try {
      const metadata = await this.storageManager.getCacheMetadata(roomId);
      if (!metadata) return;

      const cleanupTime = new Date(Date.now() + (delayHours * 60 * 60 * 1000)).toISOString();
      
      const updatedMetadata = {
        ...metadata,
        status: 'CLEANUP',
        cleanupScheduledAt: cleanupTime,
        updatedAt: new Date().toISOString()
      };

      await this.storageManager.updateCacheMetadata(roomId, updatedMetadata);
      
      console.log(`✅ Cleanup scheduled for room ${roomId} at ${cleanupTime}`);

    } catch (error) {
      console.error(`❌ Error scheduling cleanup for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Gets existing movie IDs for a room to prevent duplicates
   * @param {string} roomId - Room identifier
   * @returns {Promise<string[]>} Array of existing movie IDs
   */
  async getExistingMovieIds(roomId) {
    try {
      const params = {
        TableName: this.CACHE_TABLE,
        KeyConditionExpression: 'roomId = :roomId',
        ExpressionAttributeValues: {
          ':roomId': roomId
        },
        ProjectionExpression: 'movieId'
      };

      const result = await this.dynamoClient.send(new QueryCommand(params));
      return result.Items ? result.Items.map(item => item.movieId) : [];

    } catch (error) {
      console.error(`❌ Error getting existing movie IDs for room ${roomId}:`, error);
      return [];
    }
  }

  /**
   * Atomically increments current index for a room
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  async incrementCurrentIndex(roomId) {
    try {
      const params = {
        TableName: this.METADATA_TABLE,
        Key: { roomId },
        UpdateExpression: 'ADD currentIndex :inc SET updatedAt = :now',
        ExpressionAttributeValues: {
          ':inc': 1,
          ':now': new Date().toISOString()
        },
        ConditionExpression: 'attribute_exists(roomId)'
      };

      await this.dynamoClient.send(new UpdateCommand(params));

    } catch (error) {
      console.error(`❌ Error incrementing current index for room ${roomId}:`, error);
      throw error;
    }
  }
}

module.exports = RoomMovieCacheService;