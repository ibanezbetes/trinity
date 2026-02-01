const { PutCommand, GetCommand, QueryCommand, DeleteCommand, UpdateCommand, BatchWriteCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * Manages DynamoDB operations for room movie cache
 * Handles storage, retrieval, metadata management, and cleanup
 * Implements 50-movie cache system with sequence consistency
 */
class CacheStorageManager {
  constructor(dynamoClient) {
    this.dynamoClient = dynamoClient;
    this.CACHE_TABLE = process.env.ROOM_MOVIE_CACHE_TABLE || 'trinity-room-movie-cache-dev';
    this.METADATA_TABLE = process.env.ROOM_CACHE_METADATA_TABLE || 'trinity-room-cache-metadata-dev';
    this.MOVIES_PER_ROOM = 50; // Exactly 50 movies per room
    this.TTL_DAYS = 7; // 7-day TTL for automatic cleanup
  }

  /**
   * Gets the next movie in sequence for a room (for independent user voting)
   * Note: This method is kept for backward compatibility but the 50-movie system
   * allows users to vote independently through all movies regardless of sequence
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object|null>} Next movie or null if no more movies
   */
  async getNextMovieAtomic(roomId) {
    console.log(`🎬 Getting next movie for room ${roomId} (50-movie system)`);

    try {
      // In the 50-movie system, users can vote independently
      // This method returns the first movie (index 0) for backward compatibility
      const movie = await this.retrieveMovieByIndex(roomId, 0);
      
      if (movie) {
        movie.isFromCache = true;
        movie.totalMoviesInCache = this.MOVIES_PER_ROOM;
        console.log(`✅ Retrieved first movie from 50-movie cache: ${movie.title}`);
      }
      
      return movie;

    } catch (error) {
      console.error(`❌ Error getting next movie for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Gets current sequence position for a room (deprecated in 50-movie system)
   * @param {string} roomId - Room identifier
   * @returns {Promise<number>} Always returns 0 (users vote independently)
   */
  async getCurrentSequenceIndex(roomId) {
    // In the 50-movie system, users vote independently through all movies
    // This method is kept for backward compatibility
    console.log(`ℹ️ getCurrentSequenceIndex called for room ${roomId} - returning 0 (50-movie system)`);
    return 0;
  }

  /**
   * Resets sequence position for a room (deprecated in 50-movie system)
   * @param {string} roomId - Room identifier
   * @param {number} newIndex - New sequence index (ignored)
   * @returns {Promise<void>}
   */
  async resetSequenceIndex(roomId, newIndex = 0) {
    // In the 50-movie system, users vote independently
    // This method is kept for backward compatibility but does nothing
    console.log(`ℹ️ resetSequenceIndex called for room ${roomId} - no-op in 50-movie system`);
  }

  /**
   * Checks if sequence is consistent across concurrent access (validates 50-movie system)
   * @param {string} roomId - Room identifier
   * @returns {Promise<boolean>} True if sequence is consistent
   */
  async checkSequenceConsistency(roomId) {
    try {
      const validationResult = await this.validateSequenceConsistency(roomId);
      return validationResult.isConsistent;
    } catch (error) {
      console.error(`❌ Error checking sequence consistency for room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Stores exactly 50 movies for a room with sequence indexes 0-49
   * @param {string} roomId - Room identifier
   * @param {Object} movieSet - Movie set containing exactly 50 movies
   * @param {number} ttl - TTL timestamp
   * @returns {Promise<void>}
   */
  async storeMovieSet(roomId, movieSet, ttl) {
    console.log(`💾 Storing movie set for room ${roomId} with ${movieSet.movies.length} movies`);

    if (movieSet.movies.length !== this.MOVIES_PER_ROOM) {
      throw new Error(`Movie set must contain exactly ${this.MOVIES_PER_ROOM} movies, got ${movieSet.movies.length}`);
    }

    try {
      const writeRequests = [];
      
      // Prepare batch write requests for exactly 50 movies
      movieSet.movies.forEach((movie, index) => {
        const sequenceIndex = index; // 0-49 sequence
        
        const item = {
          roomId,
          sequenceIndex,
          movieId: movie.movieId,
          title: movie.title,
          overview: movie.overview,
          posterPath: movie.posterPath,
          releaseDate: movie.releaseDate,
          voteAverage: movie.voteAverage,
          genreIds: movie.genreIds,
          originalLanguage: movie.originalLanguage,
          mediaType: movie.mediaType,
          addedAt: new Date().toISOString(),
          priority: movie.priority,
          ttl,
          isActive: true
        };

        writeRequests.push({
          PutRequest: {
            Item: item
          }
        });
      });

      // Write in batches of 25 (DynamoDB limit)
      const batchSize = 25;
      for (let i = 0; i < writeRequests.length; i += batchSize) {
        const batchChunk = writeRequests.slice(i, i + batchSize);
        
        const params = {
          RequestItems: {
            [this.CACHE_TABLE]: batchChunk
          }
        };

        await this.dynamoClient.send(new BatchWriteCommand(params));
        console.log(`📦 Stored chunk ${Math.floor(i / batchSize) + 1}/${Math.ceil(writeRequests.length / batchSize)}`);
      }

      console.log(`✅ Successfully stored ${this.MOVIES_PER_ROOM} movies for room ${roomId}`);

    } catch (error) {
      console.error(`❌ Error storing movie set for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieves all 50 cached movies for a room in sequence order
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object[]>} Array of all cached movies (0-49)
   */
  async retrieveAllMovies(roomId) {
    console.log(`📽️ Retrieving all movies for room ${roomId}`);

    try {
      const params = {
        TableName: this.CACHE_TABLE,
        KeyConditionExpression: 'roomId = :roomId',
        ExpressionAttributeValues: {
          ':roomId': roomId
        },
        ScanIndexForward: true // Sort by sequence index ascending (0-49)
      };

      const result = await this.dynamoClient.send(new QueryCommand(params));
      
      if (!result.Items || result.Items.length === 0) {
        console.log(`⚠️ No movies found for room ${roomId}`);
        return [];
      }

      // Convert to expected format and ensure proper ordering
      const movies = result.Items
        .map(item => ({
          movieId: item.movieId,
          title: item.title,
          overview: item.overview,
          posterPath: item.posterPath,
          releaseDate: item.releaseDate,
          voteAverage: item.voteAverage,
          genreIds: item.genreIds,
          originalLanguage: item.originalLanguage,
          mediaType: item.mediaType,
          priority: item.priority,
          sequenceIndex: item.sequenceIndex
        }))
        .sort((a, b) => a.sequenceIndex - b.sequenceIndex); // Ensure proper sequence order

      console.log(`📽️ Retrieved ${movies.length} movies for room ${roomId}`);
      
      // Validate we have exactly 50 movies if cache is complete
      const metadata = await this.getCacheMetadata(roomId);
      if (metadata && metadata.cacheComplete && movies.length !== this.MOVIES_PER_ROOM) {
        console.warn(`⚠️ Cache integrity issue: expected ${this.MOVIES_PER_ROOM} movies, got ${movies.length}`);
      }

      return movies;

    } catch (error) {
      console.error(`❌ Error retrieving all movies for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieves a movie by its sequence index (0-49)
   * @param {string} roomId - Room identifier
   * @param {number} index - Sequence index (0-49)
   * @returns {Promise<Object|null>} Cached movie or null
   */
  async retrieveMovieByIndex(roomId, index) {
    // Validate index range
    if (index < 0 || index >= this.MOVIES_PER_ROOM) {
      console.warn(`⚠️ Invalid sequence index ${index} for room ${roomId}. Must be 0-${this.MOVIES_PER_ROOM - 1}`);
      return null;
    }

    try {
      const params = {
        TableName: this.CACHE_TABLE,
        Key: {
          roomId,
          sequenceIndex: index
        }
      };

      const result = await this.dynamoClient.send(new GetCommand(params));
      
      if (!result.Item) {
        console.log(`⚠️ No movie found at index ${index} for room ${roomId}`);
        return null;
      }

      // Convert to expected format
      const movie = {
        movieId: result.Item.movieId,
        title: result.Item.title,
        overview: result.Item.overview,
        posterPath: result.Item.posterPath,
        releaseDate: result.Item.releaseDate,
        voteAverage: result.Item.voteAverage,
        genreIds: result.Item.genreIds,
        originalLanguage: result.Item.originalLanguage,
        mediaType: result.Item.mediaType,
        priority: result.Item.priority,
        sequenceIndex: result.Item.sequenceIndex
      };

      console.log(`📽️ Retrieved movie: ${movie.title} (index: ${index})`);
      return movie;

    } catch (error) {
      console.error(`❌ Error retrieving movie at index ${index} for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Updates cache metadata for a room with room capacity tracking
   * @param {string} roomId - Room identifier
   * @param {Object} metadata - Metadata to store
   * @returns {Promise<void>}
   */
  async updateCacheMetadata(roomId, metadata) {
    try {
      // Calculate TTL (7 days from now)
      const ttl = Math.floor(Date.now() / 1000) + (this.TTL_DAYS * 24 * 60 * 60);

      const params = {
        TableName: this.METADATA_TABLE,
        Item: {
          ...metadata,
          roomId, // Ensure roomId is set
          totalMovies: this.MOVIES_PER_ROOM, // Always 50 movies
          ttl, // Set TTL for automatic cleanup
          updatedAt: new Date().toISOString()
        }
      };

      await this.dynamoClient.send(new PutCommand(params));
      console.log(`📋 Updated metadata for room ${roomId} with TTL ${ttl}`);

    } catch (error) {
      console.error(`❌ Error updating metadata for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Gets cache metadata for a room
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object|null>} Cache metadata or null
   */
  async getCacheMetadata(roomId) {
    try {
      const params = {
        TableName: this.METADATA_TABLE,
        Key: { roomId }
      };

      const result = await this.dynamoClient.send(new GetCommand(params));
      
      if (!result.Item) {
        console.log(`⚠️ No metadata found for room ${roomId}`);
        return null;
      }

      console.log(`📋 Retrieved metadata for room ${roomId}, status: ${result.Item.status}`);
      return result.Item;

    } catch (error) {
      console.error(`❌ Error getting metadata for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Checks for match based on room capacity and user votes
   * @param {string} roomId - Room identifier
   * @param {string} movieId - Movie identifier
   * @returns {Promise<Object>} Match check result
   */
  async checkUserVotesForMatch(roomId, movieId) {
    console.log(`🎯 Checking for match on movie ${movieId} in room ${roomId}`);

    try {
      // Get room metadata to determine capacity
      const metadata = await this.getCacheMetadata(roomId);
      if (!metadata) {
        throw new Error(`No metadata found for room ${roomId}`);
      }

      const requiredVotes = metadata.roomCapacity || metadata.filterCriteria?.roomCapacity || 2;

      // Query votes table to count "YES" votes for this movie
      // Note: This would typically query the trinity-votes-dev table
      // For now, we'll return the structure needed for match detection
      const matchResult = {
        hasMatch: false,
        matchedMovie: null,
        requiredVotes,
        currentVotes: 0, // This would be populated from actual vote counting
        roomCapacity: requiredVotes
      };

      console.log(`🎯 Match check result for room ${roomId}, movie ${movieId}: ${matchResult.currentVotes}/${requiredVotes} votes`);
      return matchResult;

    } catch (error) {
      console.error(`❌ Error checking votes for match in room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Deletes all cache data for a room (cleanup operation)
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  async deleteRoomCache(roomId) {
    console.log(`🗑️ Deleting all cache data for room ${roomId}`);

    try {
      // First, get all cache entries for the room
      const cacheEntries = await this.getAllCacheEntries(roomId);
      
      if (cacheEntries.length === 0) {
        console.log(`ℹ️ No cache entries found for room ${roomId}`);
      } else {
        // Delete cache entries in batches
        await this.deleteCacheEntriesInBatches(cacheEntries);
        console.log(`🗑️ Deleted ${cacheEntries.length} cache entries for room ${roomId}`);
      }

      // Delete metadata
      await this.deleteCacheMetadata(roomId);
      console.log(`🗑️ Deleted metadata for room ${roomId}`);

      console.log(`✅ Successfully deleted all cache data for room ${roomId}`);

    } catch (error) {
      console.error(`❌ Error deleting cache for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Sets TTL for room cache entries (7-day default)
   * @param {string} roomId - Room identifier
   * @param {number} ttlSeconds - TTL in seconds from now (default: 7 days)
   * @returns {Promise<void>}
   */
  async setTTL(roomId, ttlSeconds = this.TTL_DAYS * 24 * 60 * 60) {
    try {
      const ttlTimestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
      
      // Update all cache entries with new TTL
      const cacheEntries = await this.getAllCacheEntries(roomId);
      
      if (cacheEntries.length > 0) {
        const updatePromises = cacheEntries.map(entry => {
          const params = {
            TableName: this.CACHE_TABLE,
            Key: {
              roomId: entry.roomId,
              sequenceIndex: entry.sequenceIndex
            },
            UpdateExpression: 'SET #ttl = :ttl',
            ExpressionAttributeNames: {
              '#ttl': 'ttl'
            },
            ExpressionAttributeValues: {
              ':ttl': ttlTimestamp
            }
          };

          return this.dynamoClient.send(new UpdateCommand(params));
        });

        await Promise.all(updatePromises);
        console.log(`⏰ Updated TTL for ${cacheEntries.length} cache entries`);
      }

      // Update metadata TTL
      const params = {
        TableName: this.METADATA_TABLE,
        Key: { roomId },
        UpdateExpression: 'SET #ttl = :ttl, updatedAt = :now',
        ExpressionAttributeNames: {
          '#ttl': 'ttl'
        },
        ExpressionAttributeValues: {
          ':ttl': ttlTimestamp,
          ':now': new Date().toISOString()
        }
      };

      await this.dynamoClient.send(new UpdateCommand(params));

      console.log(`⏰ Set TTL to ${ttlSeconds} seconds (${Math.round(ttlSeconds / 86400)} days) for room ${roomId}`);

    } catch (error) {
      console.error(`❌ Error setting TTL for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Validates sequence consistency for a room (ensures all 50 movies are present and in order)
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object>} Validation result
   */
  async validateSequenceConsistency(roomId) {
    console.log(`🔍 Validating sequence consistency for room ${roomId}`);

    try {
      const metadata = await this.getCacheMetadata(roomId);
      if (!metadata) {
        return {
          isConsistent: false,
          error: 'No metadata found',
          expectedMovies: this.MOVIES_PER_ROOM,
          actualMovies: 0
        };
      }

      // Get all movies for the room
      const movies = await this.retrieveAllMovies(roomId);
      
      // Check if we have exactly 50 movies
      if (movies.length !== this.MOVIES_PER_ROOM) {
        return {
          isConsistent: false,
          error: `Expected ${this.MOVIES_PER_ROOM} movies, found ${movies.length}`,
          expectedMovies: this.MOVIES_PER_ROOM,
          actualMovies: movies.length
        };
      }

      // Check sequence indexes are 0-49 without gaps
      const expectedIndexes = Array.from({ length: this.MOVIES_PER_ROOM }, (_, i) => i);
      const actualIndexes = movies.map(m => m.sequenceIndex).sort((a, b) => a - b);
      
      const missingIndexes = expectedIndexes.filter(i => !actualIndexes.includes(i));
      const duplicateIndexes = actualIndexes.filter((index, pos) => actualIndexes.indexOf(index) !== pos);

      if (missingIndexes.length > 0 || duplicateIndexes.length > 0) {
        return {
          isConsistent: false,
          error: 'Sequence gaps or duplicates detected',
          expectedMovies: this.MOVIES_PER_ROOM,
          actualMovies: movies.length,
          missingIndexes,
          duplicateIndexes
        };
      }

      // Validate all movies have required fields
      const invalidMovies = movies.filter(movie => 
        !movie.movieId || 
        !movie.title || 
        !movie.overview || 
        movie.overview.trim().length === 0 ||
        !movie.originalLanguage
      );

      if (invalidMovies.length > 0) {
        return {
          isConsistent: false,
          error: `${invalidMovies.length} movies have invalid data`,
          expectedMovies: this.MOVIES_PER_ROOM,
          actualMovies: movies.length,
          invalidMovies: invalidMovies.map(m => ({ sequenceIndex: m.sequenceIndex, movieId: m.movieId }))
        };
      }

      console.log(`✅ Sequence consistency validated for room ${roomId}: ${movies.length} movies in correct order`);
      
      return {
        isConsistent: true,
        expectedMovies: this.MOVIES_PER_ROOM,
        actualMovies: movies.length,
        sequenceRange: `0-${this.MOVIES_PER_ROOM - 1}`
      };

    } catch (error) {
      console.error(`❌ Error validating sequence consistency for room ${roomId}:`, error);
      return {
        isConsistent: false,
        error: error.message,
        expectedMovies: this.MOVIES_PER_ROOM,
        actualMovies: 0
      };
    }
  }

  // Private helper methods

  /**
   * Gets all cache entries for a room
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object[]>} Array of cache entries
   */
  async getAllCacheEntries(roomId) {
    try {
      const params = {
        TableName: this.CACHE_TABLE,
        KeyConditionExpression: 'roomId = :roomId',
        ExpressionAttributeValues: {
          ':roomId': roomId
        },
        ScanIndexForward: true // Ensure proper sequence order
      };

      const result = await this.dynamoClient.send(new QueryCommand(params));
      return result.Items || [];

    } catch (error) {
      console.error(`❌ Error getting cache entries for room ${roomId}:`, error);
      return [];
    }
  }

  /**
   * Deletes cache entries in batches
   * @param {Object[]} entries - Cache entries to delete
   * @returns {Promise<void>}
   */
  async deleteCacheEntriesInBatches(entries) {
    const batchSize = 25; // DynamoDB batch limit
    
    for (let i = 0; i < entries.length; i += batchSize) {
      const batchChunk = entries.slice(i, i + batchSize);
      
      const deleteRequests = batchChunk.map(entry => ({
        DeleteRequest: {
          Key: {
            roomId: entry.roomId,
            sequenceIndex: entry.sequenceIndex
          }
        }
      }));

      const params = {
        RequestItems: {
          [this.CACHE_TABLE]: deleteRequests
        }
      };

      await this.dynamoClient.send(new BatchWriteCommand(params));
      console.log(`🗑️ Deleted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(entries.length / batchSize)}`);
    }
  }

  /**
   * Deletes cache metadata for a room
   * @param {string} roomId - Room identifier
   * @returns {Promise<void>}
   */
  async deleteCacheMetadata(roomId) {
    try {
      const params = {
        TableName: this.METADATA_TABLE,
        Key: { roomId }
      };

      await this.dynamoClient.send(new DeleteCommand(params));
      console.log(`🗑️ Deleted metadata for room ${roomId}`);

    } catch (error) {
      console.error(`❌ Error deleting metadata for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Checks if room cache exists and is complete
   * @param {string} roomId - Room identifier
   * @returns {Promise<boolean>} Whether cache exists and is complete
   */
  async cacheExists(roomId) {
    try {
      const metadata = await this.getCacheMetadata(roomId);
      if (!metadata) {
        return false;
      }

      // Check if cache is active and complete
      if (metadata.status !== 'ACTIVE' || !metadata.cacheComplete) {
        return false;
      }

      // Verify we actually have 50 movies
      const movies = await this.retrieveAllMovies(roomId);
      return movies.length === this.MOVIES_PER_ROOM;

    } catch (error) {
      console.error(`❌ Error checking cache existence for room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Gets cache statistics for monitoring
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object>} Cache statistics
   */
  async getCacheStats(roomId) {
    try {
      const metadata = await this.getCacheMetadata(roomId);
      const movies = await this.retrieveAllMovies(roomId);
      
      return {
        roomId,
        totalMovies: movies.length,
        expectedMovies: this.MOVIES_PER_ROOM,
        isComplete: movies.length === this.MOVIES_PER_ROOM,
        status: metadata?.status || 'NOT_FOUND',
        cacheComplete: metadata?.cacheComplete || false,
        createdAt: metadata?.createdAt,
        updatedAt: metadata?.updatedAt,
        ttl: metadata?.ttl,
        roomCapacity: metadata?.roomCapacity || metadata?.filterCriteria?.roomCapacity,
        filterCriteria: metadata?.filterCriteria
      };

    } catch (error) {
      console.error(`❌ Error getting cache stats for room ${roomId}:`, error);
      return {
        roomId,
        totalMovies: 0,
        expectedMovies: this.MOVIES_PER_ROOM,
        isComplete: false,
        status: 'ERROR',
        error: error.message
      };
    }
  }

  /**
   * Ensures sequence consistency across user sessions and reconnections
   * Validates that all users see the same 50 movies in identical order
   * @param {string} roomId - Room identifier
   * @param {string} userId - User identifier (for logging)
   * @returns {Promise<Object>} Consistency check result
   */
  async ensureSequenceConsistency(roomId, userId = 'unknown') {
    console.log(`🔄 Ensuring sequence consistency for room ${roomId}, user ${userId}`);

    try {
      // Get cache metadata
      const metadata = await this.getCacheMetadata(roomId);
      if (!metadata) {
        return {
          isConsistent: false,
          error: 'No cache metadata found',
          action: 'CACHE_NOT_FOUND'
        };
      }

      // Check if cache is complete
      if (!metadata.cacheComplete || metadata.status !== 'ACTIVE') {
        return {
          isConsistent: false,
          error: `Cache not ready: status=${metadata.status}, complete=${metadata.cacheComplete}`,
          action: 'CACHE_NOT_READY'
        };
      }

      // Validate sequence consistency
      const validationResult = await this.validateSequenceConsistency(roomId);
      
      if (!validationResult.isConsistent) {
        console.error(`❌ Sequence inconsistency detected for room ${roomId}:`, validationResult.error);
        return {
          isConsistent: false,
          error: validationResult.error,
          action: 'SEQUENCE_REPAIR_NEEDED',
          details: validationResult
        };
      }

      console.log(`✅ Sequence consistency confirmed for room ${roomId}, user ${userId}`);
      
      return {
        isConsistent: true,
        totalMovies: validationResult.actualMovies,
        sequenceRange: validationResult.sequenceRange,
        action: 'CONSISTENT'
      };

    } catch (error) {
      console.error(`❌ Error ensuring sequence consistency for room ${roomId}:`, error);
      return {
        isConsistent: false,
        error: error.message,
        action: 'ERROR'
      };
    }
  }

  /**
   * Gets movies for independent user voting (allows users to vote through all 50 movies)
   * Each user can vote independently regardless of other users' progress
   * @param {string} roomId - Room identifier
   * @param {string} userId - User identifier
   * @param {number} userMovieIndex - User's current movie index (0-49)
   * @returns {Promise<Object|null>} Movie at user's current index
   */
  async getMovieForIndependentVoting(roomId, userId, userMovieIndex) {
    console.log(`🎬 Getting movie for independent voting: room ${roomId}, user ${userId}, index ${userMovieIndex}`);

    try {
      // Validate user movie index
      if (userMovieIndex < 0 || userMovieIndex >= this.MOVIES_PER_ROOM) {
        console.warn(`⚠️ Invalid user movie index ${userMovieIndex} for user ${userId} in room ${roomId}`);
        return null;
      }

      // Ensure sequence consistency first
      const consistencyCheck = await this.ensureSequenceConsistency(roomId, userId);
      if (!consistencyCheck.isConsistent) {
        console.error(`❌ Cannot provide movie due to sequence inconsistency: ${consistencyCheck.error}`);
        throw new Error(`Sequence inconsistency: ${consistencyCheck.error}`);
      }

      // Get the movie at the user's current index
      const movie = await this.retrieveMovieByIndex(roomId, userMovieIndex);
      
      if (movie) {
        // Add metadata for independent voting
        movie.isFromCache = true;
        movie.totalMoviesInCache = this.MOVIES_PER_ROOM;
        movie.userMovieIndex = userMovieIndex;
        movie.remainingMovies = this.MOVIES_PER_ROOM - userMovieIndex - 1;
        movie.votingProgress = `${userMovieIndex + 1}/${this.MOVIES_PER_ROOM}`;
        
        console.log(`✅ Retrieved movie for independent voting: ${movie.title} (${movie.votingProgress})`);
      }

      return movie;

    } catch (error) {
      console.error(`❌ Error getting movie for independent voting: room ${roomId}, user ${userId}, index ${userMovieIndex}:`, error);
      throw error;
    }
  }

  /**
   * Validates that all users see identical movie sequence
   * @param {string} roomId - Room identifier
   * @param {Array<string>} userIds - Array of user IDs to validate consistency for
   * @returns {Promise<Object>} Cross-user consistency validation result
   */
  async validateCrossUserConsistency(roomId, userIds = []) {
    console.log(`🔍 Validating cross-user consistency for room ${roomId} with ${userIds.length} users`);

    try {
      // Get the canonical movie sequence
      const canonicalMovies = await this.retrieveAllMovies(roomId);
      
      if (canonicalMovies.length !== this.MOVIES_PER_ROOM) {
        return {
          isConsistent: false,
          error: `Expected ${this.MOVIES_PER_ROOM} movies, found ${canonicalMovies.length}`,
          canonicalCount: canonicalMovies.length
        };
      }

      // Create a hash of the canonical sequence for comparison
      const canonicalHash = this.createSequenceHash(canonicalMovies);
      
      // For each user, verify they would see the same sequence
      const userConsistencyResults = [];
      
      for (const userId of userIds) {
        try {
          // Simulate getting the sequence this user would see
          const userSequenceCheck = await this.ensureSequenceConsistency(roomId, userId);
          
          userConsistencyResults.push({
            userId,
            isConsistent: userSequenceCheck.isConsistent,
            error: userSequenceCheck.error || null
          });
          
        } catch (error) {
          userConsistencyResults.push({
            userId,
            isConsistent: false,
            error: error.message
          });
        }
      }

      // Check if all users have consistent results
      const allUsersConsistent = userConsistencyResults.every(result => result.isConsistent);
      const inconsistentUsers = userConsistencyResults.filter(result => !result.isConsistent);

      console.log(`🔍 Cross-user consistency result: ${allUsersConsistent ? 'CONSISTENT' : 'INCONSISTENT'}`);

      return {
        isConsistent: allUsersConsistent,
        canonicalMovieCount: canonicalMovies.length,
        canonicalHash,
        userResults: userConsistencyResults,
        inconsistentUsers,
        totalUsersChecked: userIds.length
      };

    } catch (error) {
      console.error(`❌ Error validating cross-user consistency for room ${roomId}:`, error);
      return {
        isConsistent: false,
        error: error.message,
        totalUsersChecked: userIds.length
      };
    }
  }

  /**
   * Creates a hash of the movie sequence for consistency validation
   * @param {Array<Object>} movies - Array of movies in sequence order
   * @returns {string} Hash representing the sequence
   */
  createSequenceHash(movies) {
    // Create a simple hash based on movie IDs and sequence indexes
    const sequenceString = movies
      .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
      .map(movie => `${movie.sequenceIndex}:${movie.movieId}`)
      .join('|');
    
    // Simple hash function (for production, consider using crypto.createHash)
    let hash = 0;
    for (let i = 0; i < sequenceString.length; i++) {
      const char = sequenceString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString(36);
  }

  /**
   * Repairs sequence consistency if possible
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object>} Repair result
   */
  async repairSequenceConsistency(roomId) {
    console.log(`🔧 Attempting to repair sequence consistency for room ${roomId}`);

    try {
      // First, validate what's wrong
      const validationResult = await this.validateSequenceConsistency(roomId);
      
      if (validationResult.isConsistent) {
        return {
          success: true,
          message: 'Sequence is already consistent',
          action: 'NO_REPAIR_NEEDED'
        };
      }

      // Get all existing movies
      const existingMovies = await this.retrieveAllMovies(roomId);
      
      // Check for common issues and attempt repairs
      if (existingMovies.length === 0) {
        return {
          success: false,
          message: 'No movies found - cache needs to be recreated',
          action: 'RECREATE_CACHE_NEEDED'
        };
      }

      if (existingMovies.length < this.MOVIES_PER_ROOM) {
        return {
          success: false,
          message: `Incomplete cache: ${existingMovies.length}/${this.MOVIES_PER_ROOM} movies`,
          action: 'INCOMPLETE_CACHE',
          details: {
            foundMovies: existingMovies.length,
            expectedMovies: this.MOVIES_PER_ROOM,
            missingCount: this.MOVIES_PER_ROOM - existingMovies.length
          }
        };
      }

      if (existingMovies.length > this.MOVIES_PER_ROOM) {
        return {
          success: false,
          message: `Too many movies: ${existingMovies.length}/${this.MOVIES_PER_ROOM}`,
          action: 'EXCESS_MOVIES',
          details: {
            foundMovies: existingMovies.length,
            expectedMovies: this.MOVIES_PER_ROOM,
            excessCount: existingMovies.length - this.MOVIES_PER_ROOM
          }
        };
      }

      // If we have exactly 50 movies but sequence is inconsistent,
      // the issue might be with duplicate or missing indexes
      const sequenceIndexes = existingMovies.map(m => m.sequenceIndex).sort((a, b) => a - b);
      const expectedIndexes = Array.from({ length: this.MOVIES_PER_ROOM }, (_, i) => i);
      
      const missingIndexes = expectedIndexes.filter(i => !sequenceIndexes.includes(i));
      const duplicateIndexes = sequenceIndexes.filter((index, pos) => sequenceIndexes.indexOf(index) !== pos);

      return {
        success: false,
        message: 'Sequence index issues detected',
        action: 'SEQUENCE_INDEX_REPAIR_NEEDED',
        details: {
          missingIndexes,
          duplicateIndexes,
          totalMovies: existingMovies.length
        }
      };

    } catch (error) {
      console.error(`❌ Error repairing sequence consistency for room ${roomId}:`, error);
      return {
        success: false,
        message: error.message,
        action: 'REPAIR_ERROR'
      };
    }
  }
}

module.exports = CacheStorageManager;