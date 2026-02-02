const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

/**
 * Service to integrate with the room movie cache system
 * Provides seamless fallback between cache and legacy TMDB system
 */
class CacheIntegrationService {
  constructor() {
    this.lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });
    this.CACHE_LAMBDA_NAME = 'trinity-cache-dev';
  }

  /**
   * Gets movies for a room, using cache if available
   * @param {string} roomId - Room identifier
   * @param {string} genre - Genre filter (legacy)
   * @param {number} page - Page number (legacy)
   * @returns {Promise<Object[]>} Array of movies
   */
  async getMoviesForRoom(roomId, genre, page) {
    console.log(`🎬 Getting movies for room ${roomId}, genre: ${genre}, page: ${page}`);

    try {
      // Check if room has active cache
      const cacheStatus = await this.checkRoomCacheStatus(roomId);
      
      if (cacheStatus.isActive) {
        console.log(`🎯 Using cache system for room ${roomId}`);
        return await this.getNextMovieFromCache(roomId);
      } else {
        console.log(`📡 No active cache for room ${roomId}, using legacy system`);
        return null; // Signal to use legacy system
      }

    } catch (error) {
      console.error(`❌ Error in cache integration for room ${roomId}:`, error);
      return null; // Signal to use legacy system
    }
  }

  /**
   * Checks for matches before any user action (CRITICAL BUSINESS LOGIC)
   * Implements match detection on every user action as per requirements
   * @param {string} roomId - Room identifier
   * @param {string} userId - User identifier
   * @param {Object} action - User action details
   * @returns {Promise<Object>} Match check result
   */
  async checkMatchBeforeAction(roomId, userId, action) {
    console.log(`🔍 Checking for matches before action ${action.type} by user ${userId} in room ${roomId}`);

    try {
      // Get room metadata to determine capacity and current status
      const roomInfo = await this.getRoomInfo(roomId);
      
      if (!roomInfo) {
        console.warn(`⚠️ No room info found for ${roomId}`);
        return { isMatch: false, error: 'Room not found' };
      }

      // If room already has a match, return it
      if (roomInfo.status === 'MATCHED' && roomInfo.resultMovieId) {
        console.log(`🎉 Room ${roomId} already has match: ${roomInfo.resultMovieId}`);
        
        const matchedMovie = await this.getMovieDetails(roomInfo.resultMovieId);
        return {
          isMatch: true,
          matchedMovie: {
            ...matchedMovie,
            isMatched: true,
            roomStatus: 'MATCHED'
          },
          message: `¡Match encontrado! Película: ${matchedMovie.title}`,
          canClose: true,
          roomId: roomId
        };
      }

      // Get room capacity for match detection
      const roomCapacity = roomInfo.capacity || roomInfo.maxMembers || 2;
      
      // Check current votes for potential matches
      const matchResult = await this.checkCurrentVotesForMatch(roomId, roomCapacity);
      
      if (matchResult.hasMatch) {
        console.log(`🎉 NEW MATCH DETECTED in room ${roomId}: ${matchResult.matchedMovie.title}`);
        
        // Update room status to MATCHED
        await this.updateRoomMatchStatus(roomId, matchResult.matchedMovie.id);
        
        return {
          isMatch: true,
          matchedMovie: {
            ...matchResult.matchedMovie,
            isMatched: true,
            roomStatus: 'MATCHED'
          },
          message: `¡Match encontrado! Película: ${matchResult.matchedMovie.title}`,
          canClose: true,
          roomId: roomId
        };
      }

      console.log(`✅ No matches detected for room ${roomId}`);
      return { isMatch: false, roomId: roomId };

    } catch (error) {
      console.error(`❌ Error checking matches for room ${roomId}:`, error);
      return { isMatch: false, error: error.message, roomId: roomId };
    }
  }

  /**
   * Creates cache for a new room
   * @param {string} roomId - Room identifier
   * @param {Object} filterCriteria - Filter criteria
   * @returns {Promise<Object>} Cache creation result
   */
  async createRoomCache(roomId, filterCriteria) {
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
   * @returns {Promise<void>}
   */
  async scheduleRoomCleanup(roomId) {
    try {
      const payload = {
        action: 'scheduleCleanup',
        roomId,
        delayHours: 1
      };

      await this.invokeCacheLambda(payload);
      console.log(`✅ Cleanup scheduled for room ${roomId}`);

    } catch (error) {
      console.error(`❌ Error scheduling cleanup for room ${roomId}:`, error);
      // Don't throw - cleanup scheduling failure shouldn't break main flow
    }
  }

  // Private methods

  /**
   * Checks if room has active cache
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object>} Cache status
   */
  async checkRoomCacheStatus(roomId) {
    try {
      const payload = {
        action: 'getCurrentIndex',
        roomId
      };

      const result = await this.invokeCacheLambda(payload);
      
      // Also check if metadata exists and is active
      const metadataPayload = {
        action: 'getCacheMetadata',
        roomId
      };
      
      let hasActiveMetadata = false;
      try {
        const metadataResult = await this.invokeCacheLambda(metadataPayload);
        hasActiveMetadata = metadataResult.success && metadataResult.result && metadataResult.result.status === 'ACTIVE';
      } catch (metadataError) {
        console.warn(`⚠️ Could not check metadata for room ${roomId}:`, metadataError.message);
      }
      
      return {
        isActive: result.success && hasActiveMetadata,
        currentIndex: result.success ? result.result : 0,
        hasMetadata: hasActiveMetadata
      };

    } catch (error) {
      console.error(`❌ Error checking cache status for room ${roomId}:`, error);
      return { isActive: false, currentIndex: 0, hasMetadata: false };
    }
  }

  /**
   * Gets next movie from cache
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object|Object[]>} Single movie, end-of-suggestions object, or array
   */
  async getNextMovieFromCache(roomId) {
    try {
      const payload = {
        action: 'getNextMovie',
        roomId
      };

      const result = await this.invokeCacheLambda(payload);
      
      if (result.success && result.result) {
        // Check if it's end of suggestions
        if (result.result.isEndOfSuggestions) {
          console.log(`🏁 End of suggestions for room ${roomId}: ${result.result.message}`);
          return {
            id: 'end-of-suggestions',
            title: 'Esa era mi última sugerencia',
            overview: 'Puedes crear otra sala para continuar descubriendo películas.',
            poster: null,
            vote_average: 0,
            release_date: '',
            isEndOfSuggestions: true,
            roomId: roomId,
            message: 'Esa era mi última sugerencia. Puedes crear otra sala para continuar.'
          };
        }
        
        // Convert cache format to legacy format
        const movie = this.convertCacheMovieToLegacyFormat(result.result);
        
        // Add warning message if present
        if (result.result.warningMessage) {
          movie.warningMessage = result.result.warningMessage;
        }
        
        return movie; // Return single movie object
      }

      console.log(`⚠️ No more movies in cache for room ${roomId}`);
      return {
        isEndOfSuggestions: true,
        message: "Esa era mi última sugerencia. Puedes crear otra sala para continuar.",
        roomId: roomId
      };

    } catch (error) {
      console.error(`❌ Error getting movie from cache for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Invokes the cache lambda
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
      id: cacheMovie.movieId,
      title: cacheMovie.title,
      poster: cacheMovie.posterPath || 'https://via.placeholder.com/500x750?text=Sin+Poster',
      overview: cacheMovie.overview || 'Descripción no disponible',
      vote_average: cacheMovie.voteAverage || 0,
      release_date: cacheMovie.releaseDate || '',
      
      // Additional fields for compatibility
      remoteId: cacheMovie.movieId,
      tmdbId: parseInt(cacheMovie.movieId),
      mediaTitle: cacheMovie.title,
      mediaPosterPath: cacheMovie.posterPath,
      mediaYear: cacheMovie.releaseDate ? new Date(cacheMovie.releaseDate).getFullYear() : null,
      mediaRating: cacheMovie.voteAverage,
      mediaOverview: cacheMovie.overview,
      mediaType: cacheMovie.mediaType
    };
  }

  /**
   * Converts genre string to filter criteria
   * @param {string} genre - Genre string
   * @param {string} mediaType - Media type (MOVIE or TV)
   * @returns {Object} Filter criteria
   */
  convertGenreToFilterCriteria(genre, mediaType = 'MOVIE') {
    // Map genre names to TMDB genre IDs
    const genreMap = {
      'action': 28,
      'adventure': 12,
      'animation': 16,
      'comedy': 35,
      'crime': 80,
      'documentary': 99,
      'drama': 18,
      'family': 10751,
      'fantasy': 14,
      'history': 36,
      'horror': 27,
      'music': 10402,
      'mystery': 9648,
      'romance': 10749,
      'science_fiction': 878,
      'thriller': 53,
      'war': 10752,
      'western': 37
    };

    const genreIds = [];
    if (genre && genre !== 'all' && genre !== 'popular') {
      const genreId = genreMap[genre.toLowerCase()];
      if (genreId) {
        genreIds.push(genreId);
      }
    }

    return {
      mediaType,
      genreIds
    };
  }

  // Helper methods for match detection

  /**
   * Gets room information for match detection
   * @param {string} roomId - Room identifier
   * @returns {Promise<Object|null>} Room information
   */
  async getRoomInfo(roomId) {
    try {
      const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
      const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
      
      const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
      const docClient = DynamoDBDocumentClient.from(dynamoClient);

      // Try the actual table structure first (PK + SK)
      const response = await docClient.send(new GetCommand({
        TableName: process.env.ROOMS_TABLE || 'trinity-rooms-dev-v2',
        Key: { PK: roomId, SK: 'ROOM' }
      }));
      
      if (response.Item) {
        return response.Item;
      }
      
      // Fallback: try simple id structure
      const fallbackResponse = await docClient.send(new GetCommand({
        TableName: process.env.ROOMS_TABLE || 'trinity-rooms-dev-v2',
        Key: { id: roomId }
      }));
      
      return fallbackResponse.Item || null;

    } catch (error) {
      console.error(`❌ Error getting room info for ${roomId}:`, error);
      return null;
    }
  }

  /**
   * Checks current votes for potential matches
   * @param {string} roomId - Room identifier
   * @param {number} roomCapacity - Required votes for match
   * @returns {Promise<Object>} Match check result
   */
  async checkCurrentVotesForMatch(roomId, roomCapacity) {
    try {
      const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
      const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
      
      const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
      const docClient = DynamoDBDocumentClient.from(dynamoClient);

      // Query all votes for this room
      const response = await docClient.send(new QueryCommand({
        TableName: process.env.VOTES_TABLE || 'trinity-votes-dev',
        KeyConditionExpression: 'roomId = :roomId',
        ExpressionAttributeValues: {
          ':roomId': roomId
        }
      }));

      if (!response.Items || response.Items.length === 0) {
        return { hasMatch: false };
      }

      // Count YES votes per movie
      const movieVotes = {};
      
      response.Items.forEach(vote => {
        if (vote.voteType === 'LIKE' || vote.voteType === 'YES') {
          const movieId = vote.movieId;
          if (!movieVotes[movieId]) {
            movieVotes[movieId] = 0;
          }
          movieVotes[movieId]++;
        }
      });

      // Check if any movie has enough votes for a match
      for (const [movieId, voteCount] of Object.entries(movieVotes)) {
        if (voteCount >= roomCapacity) {
          console.log(`🎉 Match found! Movie ${movieId} has ${voteCount}/${roomCapacity} votes`);
          
          // Get movie details
          const movieDetails = await this.getMovieDetails(movieId);
          
          return {
            hasMatch: true,
            matchedMovie: movieDetails,
            voteCount,
            requiredVotes: roomCapacity
          };
        }
      }

      return { hasMatch: false };

    } catch (error) {
      console.error(`❌ Error checking votes for matches in room ${roomId}:`, error);
      return { hasMatch: false, error: error.message };
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
      const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
      const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      
      const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
      const docClient = DynamoDBDocumentClient.from(dynamoClient);

      await docClient.send(new UpdateCommand({
        TableName: process.env.ROOMS_TABLE || 'trinity-rooms-dev-v2',
        Key: { PK: roomId, SK: 'ROOM' },
        UpdateExpression: 'SET #status = :status, resultMovieId = :movieId, matchedAt = :now',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'MATCHED',
          ':movieId': movieId,
          ':now': new Date().toISOString()
        }
      }));

      console.log(`✅ Room ${roomId} status updated to MATCHED with movie ${movieId}`);

    } catch (error) {
      console.error(`❌ Error updating room match status for ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Gets movie details for match display
   * @param {string} movieId - Movie identifier
   * @returns {Promise<Object>} Movie details
   */
  async getMovieDetails(movieId) {
    try {
      // Try to get from cache first
      const cachePayload = {
        action: 'getMovieDetails',
        movieId
      };

      try {
        const cacheResult = await this.invokeCacheLambda(cachePayload);
        if (cacheResult.success && cacheResult.result) {
          return this.convertCacheMovieToLegacyFormat(cacheResult.result);
        }
      } catch (cacheError) {
        console.warn(`⚠️ Could not get movie ${movieId} from cache:`, cacheError.message);
      }

      // Fallback to TMDB API
      const apiKey = process.env.TMDB_API_KEY;
      if (!apiKey) {
        throw new Error('TMDB_API_KEY not configured');
      }

      const url = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=es-ES`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status}`);
      }

      const movie = await response.json();
      
      return {
        id: movie.id.toString(),
        title: movie.title || movie.original_title || 'Título no disponible',
        poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
        overview: movie.overview || 'Descripción no disponible',
        vote_average: movie.vote_average || 0,
        release_date: movie.release_date || ''
      };

    } catch (error) {
      console.error(`❌ Error getting movie details for ${movieId}:`, error);
      
      // Return default movie details
      return {
        id: movieId,
        title: 'Película encontrada',
        poster: null,
        overview: 'Se ha encontrado una película que gusta a todos.',
        vote_average: 0,
        release_date: ''
      };
    }
  }
}

module.exports = CacheIntegrationService;