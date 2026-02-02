const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, GetCommand, UpdateCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * Seamlessly integrates with existing Trinity movie system
 * Provides cache detection, routing, fallback management, and match detection
 */
class IntegrationAdapter {
  constructor() {
    this.lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });
    this.dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
    this.docClient = DynamoDBDocumentClient.from(this.dynamoClient);
    this.CACHE_LAMBDA_NAME = 'trinity-cache-dev';
    this.MOVIE_LAMBDA_NAME = 'trinity-movie-dev';
    this.VOTES_TABLE = process.env.VOTES_TABLE || 'trinity-votes-dev';
    this.ROOMS_TABLE = process.env.ROOMS_TABLE || 'trinity-rooms-dev-v2';
    this.ROOM_MATCHES_TABLE = process.env.ROOM_MATCHES_TABLE || 'trinity-room-matches-dev';
  }

  /**
   * Checks for matches before any user action
   * @param {string} roomId - Room identifier
   * @param {string} userId - User identifier
   * @param {Object} action - User action details
   * @returns {Promise<Object|null>} Match notification or null
   */
  async checkMatchBeforeAction(roomId, userId, action) {
    console.log(`🔍 Checking for matches before action: ${action.type} by user ${userId} in room ${roomId}`);

    try {
      // Get room information to determine capacity
      const roomInfo = await this.getRoomInfo(roomId);
      if (!roomInfo) {
        console.log(`⚠️ Room ${roomId} not found, skipping match check`);
        return null;
      }

      // Check if room already has a match
      if (roomInfo.status === 'MATCHED') {
        console.log(`🎉 Room ${roomId} already has a match: ${roomInfo.resultMovieId}`);
        return await this.createMatchNotification(roomInfo.resultMovieId, roomId);
      }

      // Get room capacity for match threshold
      const roomCapacity = roomInfo.capacity || roomInfo.maxMembers || 2;
      console.log(`📊 Room ${roomId} capacity: ${roomCapacity}`);

      // Check for new matches based on current votes
      const matchResult = await this.detectNewMatches(roomId, roomCapacity);
      
      if (matchResult.hasMatch) {
        console.log(`🎉 NEW MATCH DETECTED in room ${roomId}: movie ${matchResult.movieId}`);
        
        // Update room status to MATCHED
        await this.updateRoomMatchStatus(roomId, matchResult.movieId);
        
        // Create match notification
        return await this.createMatchNotification(matchResult.movieId, roomId);
      }

      console.log(`✅ No matches found for room ${roomId}, action can proceed`);
      return null;

    } catch (error) {
      console.error(`❌ Error checking matches for room ${roomId}:`, error);
      // Don't block user actions on match check errors
      return null;
    }
  }

  /**
   * Detects new matches based on current votes
   * @param {string} roomId - Room identifier
   * @param {number} roomCapacity - Room capacity
   * @returns {Promise<Object>} Match detection result
   */
  async detectNewMatches(roomId, roomCapacity) {
    try {
      console.log(`🔍 Detecting matches for room ${roomId} with capacity ${roomCapacity}`);

      // Query all votes for this room
      const votesResponse = await this.docClient.send(new QueryCommand({
        TableName: this.VOTES_TABLE,
        KeyConditionExpression: 'roomId = :roomId',
        ExpressionAttributeValues: {
          ':roomId': roomId
        }
      }));

      const votes = votesResponse.Items || [];
      console.log(`📊 Found ${votes.length} total votes in room ${roomId}`);

      // Group votes by movie and count "YES" votes
      const movieVotes = {};
      votes.forEach(vote => {
        if (vote.vote === 'YES' || vote.vote === 'LIKE') {
          const movieId = vote.movieId;
          if (!movieVotes[movieId]) {
            movieVotes[movieId] = new Set();
          }
          movieVotes[movieId].add(vote.userId);
        }
      });

      // Check if any movie has enough YES votes to match
      for (const [movieId, userSet] of Object.entries(movieVotes)) {
        const yesVoteCount = userSet.size;
        console.log(`🎬 Movie ${movieId}: ${yesVoteCount}/${roomCapacity} YES votes`);
        
        if (yesVoteCount >= roomCapacity) {
          console.log(`🎉 MATCH FOUND: Movie ${movieId} has ${yesVoteCount}/${roomCapacity} YES votes`);
          return {
            hasMatch: true,
            movieId: movieId,
            voteCount: yesVoteCount,
            requiredVotes: roomCapacity
          };
        }
      }

      console.log(`✅ No matches found in room ${roomId}`);
      return { hasMatch: false };

    } catch (error) {
      console.error(`❌ Error detecting matches for room ${roomId}:`, error);
      return { hasMatch: false };
    }
  }

  /**
   * Creates a match notification object
   * @param {string} movieId - Matched movie ID
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object>} Match notification
   */
  async createMatchNotification(movieId, roomId) {
    try {
      // Get movie details for the notification
      const movieDetails = await this.getMovieDetails(movieId);
      
      return {
        matchedMovie: {
          movieId: movieId,
          title: movieDetails.title || 'Película encontrada',
          overview: movieDetails.overview || 'Se ha encontrado una película que gusta a todos',
          posterPath: movieDetails.poster_path || movieDetails.posterPath,
          voteAverage: movieDetails.vote_average || movieDetails.voteAverage
        },
        message: `¡Match encontrado! Película: ${movieDetails.title || 'Película encontrada'}`,
        canClose: true,
        roomId: roomId,
        isMatch: true
      };

    } catch (error) {
      console.error(`❌ Error creating match notification for movie ${movieId}:`, error);
      
      // Return basic notification even if movie details fail
      return {
        matchedMovie: {
          movieId: movieId,
          title: 'Película encontrada',
          overview: 'Se ha encontrado una película que gusta a todos',
          posterPath: null,
          voteAverage: 0
        },
        message: '¡Match encontrado!',
        canClose: true,
        roomId: roomId,
        isMatch: true
      };
    }
  }

  /**
   * Updates room status to MATCHED
   * @param {string} roomId - Room identifier
   * @param {string} movieId - Matched movie ID
   * @returns {Promise<void>}
   */
  async updateRoomMatchStatus(roomId, movieId) {
    try {
      console.log(`🎉 Updating room ${roomId} status to MATCHED with movie ${movieId}`);

      // Update room status in the rooms table
      await this.docClient.send(new UpdateCommand({
        TableName: this.ROOMS_TABLE,
        Key: { PK: roomId, SK: 'ROOM' },
        UpdateExpression: 'SET #status = :status, resultMovieId = :movieId, matchedAt = :timestamp',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'MATCHED',
          ':movieId': movieId,
          ':timestamp': new Date().toISOString()
        }
      }));

      // Also record the match in the matches table
      await this.docClient.send(new PutCommand({
        TableName: this.ROOM_MATCHES_TABLE,
        Item: {
          roomId: roomId,
          movieId: movieId,
          matchedAt: new Date().toISOString(),
          status: 'ACTIVE'
        }
      }));

      console.log(`✅ Room ${roomId} status updated to MATCHED`);

    } catch (error) {
      console.error(`❌ Error updating room match status for ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Gets room information
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object|null>} Room information
   */
  async getRoomInfo(roomId) {
    try {
      const response = await this.docClient.send(new GetCommand({
        TableName: this.ROOMS_TABLE,
        Key: { PK: roomId, SK: 'ROOM' }
      }));

      return response.Item || null;

    } catch (error) {
      console.error(`❌ Error getting room info for ${roomId}:`, error);
      return null;
    }
  }

  /**
   * Gets movie details from TMDB or cache
   * @param {string} movieId - Movie identifier
   * @returns {Promise<Object>} Movie details
   */
  async getMovieDetails(movieId) {
    try {
      // Try to invoke movie lambda to get details
      const payload = {
        info: { fieldName: 'getMovieDetails' },
        arguments: { movieId: movieId }
      };

      const command = new InvokeCommand({
        FunctionName: this.MOVIE_LAMBDA_NAME,
        Payload: JSON.stringify(payload)
      });

      const response = await this.lambdaClient.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.Payload));

      if (result && result.title) {
        return result;
      }

      // Fallback to basic movie info
      return {
        id: movieId,
        title: 'Película encontrada',
        overview: 'Se ha encontrado una película que gusta a todos',
        poster_path: null,
        vote_average: 0
      };

    } catch (error) {
      console.error(`❌ Error getting movie details for ${movieId}:`, error);
      
      // Return basic fallback
      return {
        id: movieId,
        title: 'Película encontrada',
        overview: 'Se ha encontrado una película que gusta a todos',
        poster_path: null,
        vote_average: 0
      };
    }
  }
   * @param {string} genre - Genre filter (legacy parameter)
   * @param {number} page - Page number (legacy parameter)
   * @param {string} roomId - Room ID (new parameter)
   * @returns {Promise<Object[]>} Array of movies
   */
  async adaptGetMoviesRequest(genre, page, roomId = null) {
    console.log(`🔄 Adapting getMovies request: genre=${genre}, page=${page}, roomId=${roomId}`);

    try {
      // If roomId is provided, try to use cache system
      if (roomId) {
        const shouldUseCache = await this.shouldUseCacheForRoom(roomId);
        
        if (shouldUseCache) {
          console.log(`🎯 Using cache system for room ${roomId}`);
          return await this.getMoviesFromCache(roomId);
        } else {
          console.log(`📡 Cache not available for room ${roomId}, using legacy system`);
        }
      }

      // Fallback to legacy system
      return await this.fallbackToLegacySystem(genre, page);

    } catch (error) {
      console.error(`❌ Error in adaptGetMoviesRequest:`, error);
      
      // Always fallback to legacy system on error
      return await this.handleCacheFailure(roomId, error, genre, page);
    }
  }

  /**
   * Checks if cache should be used for a room
   * @param {string} roomId - Room identifier
   * @returns {Promise<boolean>} Whether to use cache
   */
  async shouldUseCacheForRoom(roomId) {
    try {
      // Invoke cache lambda to check if cache exists and is active
      const payload = {
        action: 'checkCacheStatus',
        roomId
      };

      const result = await this.invokeCacheLambda(payload);
      
      if (result.success && result.result) {
        console.log(`✅ Cache is available for room ${roomId}`);
        return true;
      }

      console.log(`⚠️  Cache not available for room ${roomId}`);
      return false;

    } catch (error) {
      console.error(`❌ Error checking cache status for room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Gets movies from cache system
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object[]>} Array of cached movies
   */
  async getMoviesFromCache(roomId) {
    try {
      const payload = {
        action: 'getNextMovie',
        roomId
      };

      const result = await this.invokeCacheLambda(payload);
      
      if (result.success && result.result) {
        // Convert cache format to legacy format
        const movie = this.convertCacheMovieToLegacyFormat(result.result);
        return [movie]; // Return single movie as array for consistency
      }

      console.log(`⚠️  No more movies in cache for room ${roomId}`);
      return [];

    } catch (error) {
      console.error(`❌ Error getting movies from cache for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Falls back to legacy TMDB system
   * @param {string} genre - Genre filter
   * @param {number} page - Page number
   * @returns {Promise<Object[]>} Array of movies from legacy system
   */
  async fallbackToLegacySystem(genre, page) {
    console.log(`📡 Using legacy TMDB system: genre=${genre}, page=${page}`);

    try {
      // Invoke existing movie lambda with legacy parameters
      const payload = {
        httpMethod: 'GET',
        queryStringParameters: {
          genre: genre || 'all',
          page: page || 1
        },
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const command = new InvokeCommand({
        FunctionName: this.MOVIE_LAMBDA_NAME,
        Payload: JSON.stringify(payload)
      });

      const response = await this.lambdaClient.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.Payload));

      if (result.statusCode === 200) {
        const body = JSON.parse(result.body);
        return body.movies || [];
      } else {
        throw new Error(`Legacy system returned status ${result.statusCode}`);
      }

    } catch (error) {
      console.error(`❌ Error in legacy system fallback:`, error);
      
      // Return default movies as last resort
      return await this.getDefaultMovies();
    }
  }

  /**
   * Handles cache failure with graceful fallback
   * @param {string} roomId - Room identifier
   * @param {Error} error - Original error
   * @param {string} genre - Genre filter for fallback
   * @param {number} page - Page number for fallback
   * @returns {Promise<Object[]>} Array of movies
   */
  async handleCacheFailure(roomId, error, genre = 'all', page = 1) {
    console.log(`🚨 Handling cache failure for room ${roomId}:`, error.message);

    try {
      // Log the failure for monitoring
      console.error(`Cache failure details:`, {
        roomId,
        error: error.message,
        fallbackGenre: genre,
        fallbackPage: page,
        timestamp: new Date().toISOString()
      });

      // Fallback to legacy system
      return await this.fallbackToLegacySystem(genre, page);

    } catch (fallbackError) {
      console.error(`❌ Fallback also failed:`, fallbackError);
      
      // Last resort: return default movies
      return await this.getDefaultMovies();
    }
  }

  /**
   * Creates cache for a new room
   * @param {string} roomId - Room identifier
   * @param {Object} filterCriteria - Filter criteria
   * @returns {Promise<Object>} Cache creation result
   */
  async createCacheForRoom(roomId, filterCriteria) {
    console.log(`🎬 Creating cache for room ${roomId}`);

    try {
      const payload = {
        action: 'createCache',
        roomId,
        filterCriteria
      };

      const result = await this.invokeCacheLambda(payload);
      
      if (result.success) {
        console.log(`✅ Cache created successfully for room ${roomId}`);
        return result.result;
      } else {
        throw new Error(`Cache creation failed: ${result.error}`);
      }

    } catch (error) {
      console.error(`❌ Error creating cache for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Schedules cache cleanup for a room
   * @param {string} roomId - Room identifier
   * @param {number} delayHours - Delay in hours
   * @returns {Promise<void>}
   */
  async scheduleRoomCacheCleanup(roomId, delayHours = 1) {
    console.log(`⏰ Scheduling cache cleanup for room ${roomId}`);

    try {
      const payload = {
        action: 'scheduleCleanup',
        roomId,
        delayHours
      };

      await this.invokeCacheLambda(payload);
      console.log(`✅ Cleanup scheduled for room ${roomId}`);

    } catch (error) {
      console.error(`❌ Error scheduling cleanup for room ${roomId}:`, error);
      // Don't throw - cleanup scheduling failure shouldn't break main flow
    }
  }

  // Private helper methods

  /**
   * Invokes the cache lambda with payload
   * @param {Object} payload - Lambda payload
   * @returns {Promise<Object>} Lambda response
   */
  async invokeCacheLambda(payload) {
    try {
      const command = new InvokeCommand({
        FunctionName: this.CACHE_LAMBDA_NAME,
        Payload: JSON.stringify(payload)
      });

      const response = await this.lambdaClient.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.Payload));

      if (result.statusCode === 200) {
        return JSON.parse(result.body);
      } else {
        throw new Error(`Cache lambda returned status ${result.statusCode}: ${result.body}`);
      }

    } catch (error) {
      console.error(`❌ Error invoking cache lambda:`, error);
      throw error;
    }
  }

  /**
   * Converts cache movie format to legacy format
   * @param {Object} cacheMovie - Movie from cache
   * @returns {Object} Movie in legacy format
   */
  convertCacheMovieToLegacyFormat(cacheMovie) {
    return {
      id: parseInt(cacheMovie.movieId),
      title: cacheMovie.title,
      overview: cacheMovie.overview,
      poster_path: cacheMovie.posterPath ? cacheMovie.posterPath.replace('https://image.tmdb.org/t/p/w500', '') : null,
      release_date: cacheMovie.releaseDate,
      vote_average: cacheMovie.voteAverage,
      genre_ids: cacheMovie.genreIds,
      media_type: cacheMovie.mediaType.toLowerCase(),
      popularity: 100, // Default popularity for cached movies
      
      // Additional fields for Trinity compatibility
      remoteId: cacheMovie.movieId,
      tmdbId: parseInt(cacheMovie.movieId),
      mediaTitle: cacheMovie.title,
      mediaPosterPath: cacheMovie.posterPath ? cacheMovie.posterPath.replace('https://image.tmdb.org/t/p/w500', '') : null,
      mediaYear: cacheMovie.releaseDate ? new Date(cacheMovie.releaseDate).getFullYear() : null,
      mediaRating: cacheMovie.voteAverage,
      mediaOverview: cacheMovie.overview,
      mediaType: cacheMovie.mediaType
    };
  }

  /**
   * Gets default movies as last resort
   * @returns {Promise<Object[]>} Array of default movies
   */
  async getDefaultMovies() {
    console.log(`🎭 Returning default movies as last resort`);

    // Return a small set of popular, well-known movies
    return [
      {
        id: 550,
        title: "El Club de la Lucha",
        overview: "Un empleado de oficina insomne y un fabricante de jabón forman un club de lucha clandestino.",
        poster_path: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
        release_date: "1999-10-15",
        vote_average: 8.4,
        genre_ids: [18, 53],
        media_type: "movie",
        popularity: 100,
        remoteId: "550",
        tmdbId: 550,
        mediaTitle: "El Club de la Lucha",
        mediaPosterPath: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
        mediaYear: 1999,
        mediaRating: 8.4,
        mediaOverview: "Un empleado de oficina insomne y un fabricante de jabón forman un club de lucha clandestino.",
        mediaType: "MOVIE"
      }
    ];
  }

  /**
   * Checks cache status for a room
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object>} Cache status
   */
  async getCacheStatus(roomId) {
    try {
      const payload = {
        action: 'getCurrentIndex',
        roomId
      };

      const result = await this.invokeCacheLambda(payload);
      
      return {
        exists: result.success,
        currentIndex: result.success ? result.result : 0,
        isActive: result.success
      };

    } catch (error) {
      console.error(`❌ Error getting cache status for room ${roomId}:`, error);
      return {
        exists: false,
        currentIndex: 0,
        isActive: false
      };
    }
  }
}

module.exports = IntegrationAdapter;