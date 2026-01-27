import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { logBusinessMetric, logError, PerformanceTimer } from '../utils/metrics';

// For Node.js fetch support
declare global {
  function fetch(input: string, init?: any): Promise<any>;
}

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export interface CachedMovie {
  tmdbId: number;
  title: string;
  posterPath: string;
  overview: string;
  genres: string[];
  year?: number;
  rating?: number;
  cachedAt: string;
  ttl: number;
}

export interface MovieCache {
  cacheKey: string;     // PK: roomId or genre-based key
  movies: CachedMovie[];
  genreFilters: string[];
  cachedAt: string;
  ttl: number;          // 24-hour expiration
}

export interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string | null;
  overview: string;
  genre_ids: number[];
  release_date: string;
  vote_average: number;
}

export interface TMDBResponse {
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
}

// Genre ID to name mapping from TMDB
const GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

/**
 * Circuit Breaker States
 */
enum CircuitBreakerState {
  CLOSED = 'CLOSED',     // Normal operation, requests go through
  OPEN = 'OPEN',         // Circuit is open, requests fail fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service is back up
}

/**
 * Circuit Breaker for TMDB API
 */
class TMDBCircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;

  // Configuration
  private readonly FAILURE_THRESHOLD = 5;        // Open circuit after 5 failures
  private readonly SUCCESS_THRESHOLD = 3;        // Close circuit after 3 successes in HALF_OPEN
  private readonly TIMEOUT_MS = 30000;          // 30 seconds timeout before trying HALF_OPEN
  private readonly RESET_TIMEOUT_MS = 300000;   // 5 minutes to reset failure count

  /**
   * Execute a request through the circuit breaker
   */
  async execute<T>(operation: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    // Check if we should attempt the operation
    if (this.shouldAttemptRequest()) {
      try {
        const result = await operation();
        this.onSuccess();
        return result;
      } catch (error) {
        this.onFailure();
        console.warn('🔌 Circuit breaker: Operation failed, using fallback');
        return await fallback();
      }
    } else {
      console.warn('🔌 Circuit breaker: Circuit is OPEN, using fallback immediately');
      return await fallback();
    }
  }

  /**
   * Check if we should attempt the request based on circuit state
   */
  private shouldAttemptRequest(): boolean {
    const now = Date.now();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        // Reset failure count if enough time has passed
        if (now - this.lastFailureTime > this.RESET_TIMEOUT_MS) {
          this.failureCount = 0;
        }
        return true;

      case CircuitBreakerState.OPEN:
        // Check if timeout has passed to try HALF_OPEN
        if (now - this.lastFailureTime >= this.TIMEOUT_MS) {
          this.state = CircuitBreakerState.HALF_OPEN;
          this.successCount = 0;
          console.log('🔌 Circuit breaker: Transitioning to HALF_OPEN state');
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return true;

      default:
        return true;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        this.failureCount = 0;
        break;

      case CircuitBreakerState.HALF_OPEN:
        this.successCount++;
        if (this.successCount >= this.SUCCESS_THRESHOLD) {
          this.state = CircuitBreakerState.CLOSED;
          this.failureCount = 0;
          this.successCount = 0;
          console.log('🔌 Circuit breaker: Transitioning to CLOSED state (service recovered)');
        }
        break;
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        if (this.failureCount >= this.FAILURE_THRESHOLD) {
          this.state = CircuitBreakerState.OPEN;
          console.warn(`🔌 Circuit breaker: Transitioning to OPEN state (${this.failureCount} failures)`);
        }
        break;

      case CircuitBreakerState.HALF_OPEN:
        this.state = CircuitBreakerState.OPEN;
        this.successCount = 0;
        console.warn('🔌 Circuit breaker: Transitioning back to OPEN state (test failed)');
        break;
    }
  }

  /**
   * Get current circuit breaker status
   */
  getStatus(): {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Reset circuit breaker (for testing or manual recovery)
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    console.log('🔌 Circuit breaker: Manually reset to CLOSED state');
  }
}

/**
 * Movie Cache Service
 * Handles pre-caching of movies for instant loading during voting sessions
 */
export class MovieCacheService {
  private readonly CACHE_TTL_HOURS = 24;
  private readonly DEFAULT_CACHE_SIZE = 30;
  private readonly MAX_CACHE_SIZE = 50;
  private readonly MIN_CACHE_SIZE = 20;

  // Circuit breaker for TMDB API
  private readonly circuitBreaker = new TMDBCircuitBreaker();

  /**
   * Pre-cache movies for a room with optional genre filtering
   * Implements cache-first strategy with circuit breaker fallback
   */
  async preCacheMovies(roomId: string, genres?: string[]): Promise<CachedMovie[]> {
    const timer = new PerformanceTimer('PreCacheMovies');
    console.log(`🎬 Pre-caching movies for room ${roomId}`, genres ? `with genres: ${genres.join(', ')}` : 'all genres');

    try {
      // CACHE-FIRST STRATEGY: Check if cache already exists and is valid
      const existingCache = await this.getCachedMovies(roomId);
      if (existingCache.length > 0) {
        console.log(`✅ Using existing cache for room ${roomId}: ${existingCache.length} movies`);
        timer.finish(true, undefined, { source: 'existing_cache', movieCount: existingCache.length });
        return existingCache;
      }

      // Cache miss - try to fetch from TMDB API through circuit breaker
      console.log('📡 Cache miss - fetching from TMDB API through circuit breaker');
      
      const movies = await this.circuitBreaker.execute(
        // Primary operation: Fetch from TMDB API
        async () => {
          return await this.fetchMoviesFromTMDB(genres);
        },
        // Fallback operation: Use cached content or default movies
        async () => {
          console.log('🔄 Circuit breaker fallback: Trying cached content from other rooms');
          
          // Try to get cached movies from other rooms with similar genres
          const fallbackFromCache = await this.getFallbackFromCache(genres);
          if (fallbackFromCache.length > 0) {
            console.log(`✅ Found ${fallbackFromCache.length} movies from cache fallback`);
            return fallbackFromCache;
          }
          
          // Last resort: Use default fallback movies
          console.log('🎭 Using default fallback movies');
          return await this.getFallbackMovies();
        }
      );
      
      if (movies.length === 0) {
        console.warn('⚠️ No movies available from any source, using minimal fallback');
        const fallbackMovies = await this.getFallbackMovies();
        await this.storeCacheInDynamoDB(roomId, fallbackMovies, genres || []);
        timer.finish(true, undefined, { source: 'minimal_fallback', movieCount: fallbackMovies.length });
        return fallbackMovies;
      }

      // Store in cache
      await this.storeCacheInDynamoDB(roomId, movies, genres || []);

      // Log business metric with circuit breaker status
      const circuitStatus = this.circuitBreaker.getStatus();
      logBusinessMetric('MOVIES_CACHED', roomId, 'system', {
        movieCount: movies.length,
        genres: genres || [],
        cacheSize: movies.length,
        circuitBreakerState: circuitStatus.state,
        circuitBreakerFailures: circuitStatus.failureCount
      });

      console.log(`✅ Successfully cached ${movies.length} movies for room ${roomId}`);
      timer.finish(true, undefined, { 
        source: circuitStatus.state === CircuitBreakerState.CLOSED ? 'tmdb_api' : 'circuit_breaker_fallback', 
        movieCount: movies.length 
      });
      return movies;

    } catch (error) {
      logError('PreCacheMovies', error as Error, { roomId, genres });
      timer.finish(false, (error as Error).name);
      
      // Final fallback to default movies on any error
      console.log('🔄 Using final fallback movies due to error');
      const fallbackMovies = await this.getFallbackMovies();
      
      try {
        await this.storeCacheInDynamoDB(roomId, fallbackMovies, genres || []);
      } catch (storeError) {
        console.error('❌ Failed to store fallback cache:', storeError);
      }
      
      return fallbackMovies;
    }
  }

  /**
   * Get cached movies for a room
   */
  async getCachedMovies(roomId: string): Promise<CachedMovie[]> {
    try {
      const response = await docClient.send(new GetCommand({
        TableName: process.env.MOVIE_CACHE_TABLE!,
        Key: { cacheKey: roomId },
      }));

      if (!response.Item) {
        return [];
      }

      const cache = response.Item as MovieCache;
      
      // Check if cache is expired
      const now = Date.now();
      if (now > cache.ttl) {
        console.log(`⏰ Cache expired for room ${roomId}, removing`);
        // Could delete expired cache here, but for now just return empty
        return [];
      }

      console.log(`📦 Retrieved ${cache.movies.length} cached movies for room ${roomId}`);
      return cache.movies;

    } catch (error) {
      console.error('❌ Error retrieving cached movies:', error);
      return [];
    }
  }

  /**
   * Refresh cache for a room
   */
  async refreshCache(roomId: string, genres?: string[]): Promise<void> {
    console.log(`🔄 Refreshing cache for room ${roomId}`);
    
    try {
      // Delete existing cache
      await this.deleteCacheFromDynamoDB(roomId);
      
      // Create new cache
      await this.preCacheMovies(roomId, genres);
      
      console.log(`✅ Cache refreshed for room ${roomId}`);
    } catch (error) {
      console.error('❌ Error refreshing cache:', error);
      throw error;
    }
  }

  /**
   * Fetch movies from TMDB API with genre filtering
   */
  private async fetchMoviesFromTMDB(genres?: string[]): Promise<CachedMovie[]> {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new Error('TMDB API key not configured');
    }

    try {
      let url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&sort_by=popularity.desc&include_adult=false&include_video=false&page=1`;
      
      // Add genre filtering if specified
      if (genres && genres.length > 0) {
        const genreIds = this.genreNamesToIds(genres);
        if (genreIds.length > 0) {
          url += `&with_genres=${genreIds.join(',')}`;
          console.log(`🎭 Applying genre filters: ${genres.join(', ')} (IDs: ${genreIds.join(', ')})`);
        } else {
          console.warn(`⚠️ No valid genre IDs found for: ${genres.join(', ')}, using popular movies`);
        }
      } else {
        console.log('🎬 No genre filters specified, fetching popular movies across all genres');
      }

      console.log('🌐 Fetching movies from TMDB:', url.replace(apiKey, '[API_KEY]'));

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as TMDBResponse;
      
      if (!data.results || data.results.length === 0) {
        console.warn('⚠️ No movies returned from TMDB API');
        throw new Error('No movies found from TMDB API');
      }
      
      // Convert TMDB format to our cached movie format
      const movies: CachedMovie[] = data.results.slice(0, this.DEFAULT_CACHE_SIZE).map(movie => ({
        tmdbId: movie.id,
        title: movie.title,
        posterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : '',
        overview: movie.overview,
        genres: movie.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean),
        year: movie.release_date ? new Date(movie.release_date).getFullYear() : undefined,
        rating: movie.vote_average,
        cachedAt: new Date().toISOString(),
        ttl: Date.now() + (this.CACHE_TTL_HOURS * 60 * 60 * 1000),
      }));

      console.log(`✅ Fetched ${movies.length} movies from TMDB`);
      
      // Validate genre filtering worked correctly
      if (genres && genres.length > 0) {
        const genreFilteredCount = movies.filter(movie => 
          movie.genres.some(movieGenre => 
            genres.some(requestedGenre => 
              movieGenre.toLowerCase() === requestedGenre.toLowerCase()
            )
          )
        ).length;
        
        console.log(`🎭 Genre filtering validation: ${genreFilteredCount}/${movies.length} movies match requested genres`);
      }
      
      return movies;

    } catch (error) {
      console.error('❌ Error fetching from TMDB:', error);
      throw error;
    }
  }

  /**
   * Convert genre names to TMDB genre IDs
   */
  private genreNamesToIds(genreNames: string[]): number[] {
    const genreIds: number[] = [];
    const unmatchedGenres: string[] = [];
    
    for (const name of genreNames) {
      const normalizedName = name.toLowerCase().trim();
      let found = false;
      
      for (const [id, genreName] of Object.entries(GENRE_MAP)) {
        if (genreName.toLowerCase() === normalizedName) {
          genreIds.push(parseInt(id));
          found = true;
          break;
        }
      }
      
      if (!found) {
        unmatchedGenres.push(name);
      }
    }
    
    if (unmatchedGenres.length > 0) {
      console.warn(`⚠️ Unknown genres ignored: ${unmatchedGenres.join(', ')}`);
      console.log(`📋 Available genres: ${Object.values(GENRE_MAP).join(', ')}`);
    }
    
    return genreIds;
  }

  /**
   * Get list of available genres
   */
  getAvailableGenres(): string[] {
    return Object.values(GENRE_MAP).sort();
  }

  /**
   * Validate genre names against available genres
   */
  validateGenres(genreNames: string[]): { valid: string[]; invalid: string[] } {
    const availableGenres = this.getAvailableGenres().map(g => g.toLowerCase());
    const valid: string[] = [];
    const invalid: string[] = [];
    
    for (const genre of genreNames) {
      const normalizedGenre = genre.toLowerCase().trim();
      if (availableGenres.includes(normalizedGenre)) {
        // Find the properly capitalized version
        const properGenre = Object.values(GENRE_MAP).find(g => g.toLowerCase() === normalizedGenre);
        if (properGenre) {
          valid.push(properGenre);
        }
      } else {
        invalid.push(genre);
      }
    }
    
    return { valid, invalid };
  }

  /**
   * Get fallback movies from cache of other rooms with similar genres
   */
  private async getFallbackFromCache(genres?: string[]): Promise<CachedMovie[]> {
    try {
      // If no genres specified, try to get any cached movies
      if (!genres || genres.length === 0) {
        console.log('🔍 Searching for any cached movies as fallback');
        // This is a simplified approach - in production you might want to scan the cache table
        return [];
      }

      // Try to find cached movies that match the requested genres
      console.log(`🔍 Searching for cached movies with genres: ${genres.join(', ')}`);
      
      // Create a genre-based cache key to look for similar content
      const genreKey = `genre_${genres.sort().join('_').toLowerCase()}`;
      
      const response = await docClient.send(new GetCommand({
        TableName: process.env.MOVIE_CACHE_TABLE!,
        Key: { cacheKey: genreKey },
      }));

      if (response.Item) {
        const cache = response.Item as MovieCache;
        
        // Check if cache is not expired
        const now = Date.now();
        if (now <= cache.ttl) {
          console.log(`✅ Found ${cache.movies.length} movies from genre-based cache fallback`);
          return cache.movies.slice(0, this.DEFAULT_CACHE_SIZE);
        }
      }

      return [];
    } catch (error) {
      console.error('❌ Error getting fallback from cache:', error);
      return [];
    }
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitBreakerStatus(): {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    return this.circuitBreaker.getStatus();
  }

  /**
   * Reset circuit breaker (for manual recovery or testing)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Check if TMDB API is available through circuit breaker
   */
  async isApiAvailable(): Promise<boolean> {
    const status = this.circuitBreaker.getStatus();
    return status.state !== CircuitBreakerState.OPEN;
  }

  /**
   * Get fallback movies when TMDB API fails
   */
  private async getFallbackMovies(): Promise<CachedMovie[]> {
    // Popular movie IDs as fallback
    const fallbackMovieIds = [
      550, 551, 552, 553, 554, 555, 556, 557, 558, 559,
      560, 561, 562, 563, 564, 565, 566, 567, 568, 569,
      570, 571, 572, 573, 574, 575, 576, 577, 578, 579
    ];

    return fallbackMovieIds.map((id, index) => ({
      tmdbId: id,
      title: `Película Popular ${index + 1}`,
      posterPath: `https://image.tmdb.org/t/p/w500/placeholder${id}.jpg`,
      overview: `Esta es una película popular con ID ${id}. Los detalles se cargarán desde TMDB cuando se acceda.`,
      genres: ['acción', 'drama'], // Use proper Spanish genres instead of 'Popular'
      year: 2023,
      rating: 7.5,
      cachedAt: new Date().toISOString(),
      ttl: Date.now() + (this.CACHE_TTL_HOURS * 60 * 60 * 1000),
    }));
  }

  /**
   * Store movie cache in DynamoDB
   */
  private async storeCacheInDynamoDB(roomId: string, movies: CachedMovie[], genres: string[]): Promise<void> {
    const cache: MovieCache = {
      cacheKey: roomId,
      movies,
      genreFilters: genres,
      cachedAt: new Date().toISOString(),
      ttl: Date.now() + (this.CACHE_TTL_HOURS * 60 * 60 * 1000),
    };

    await docClient.send(new PutCommand({
      TableName: process.env.MOVIE_CACHE_TABLE!,
      Item: cache,
    }));

    console.log(`💾 Stored cache for room ${roomId}: ${movies.length} movies`);
  }

  /**
   * Delete cache from DynamoDB
   */
  private async deleteCacheFromDynamoDB(roomId: string): Promise<void> {
    await docClient.send(new UpdateCommand({
      TableName: process.env.MOVIE_CACHE_TABLE!,
      Key: { cacheKey: roomId },
      UpdateExpression: 'REMOVE movies, genreFilters, cachedAt',
      ConditionExpression: 'attribute_exists(cacheKey)',
    }));
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats(roomId: string): Promise<{
    exists: boolean;
    movieCount: number;
    genres: string[];
    cachedAt?: string;
    expiresAt?: string;
    isExpired: boolean;
  }> {
    try {
      const response = await docClient.send(new GetCommand({
        TableName: process.env.MOVIE_CACHE_TABLE!,
        Key: { cacheKey: roomId },
      }));

      if (!response.Item) {
        return {
          exists: false,
          movieCount: 0,
          genres: [],
          isExpired: false,
        };
      }

      const cache = response.Item as MovieCache;
      const now = Date.now();
      const isExpired = now > cache.ttl;

      return {
        exists: true,
        movieCount: cache.movies.length,
        genres: cache.genreFilters,
        cachedAt: cache.cachedAt,
        expiresAt: new Date(cache.ttl).toISOString(),
        isExpired,
      };

    } catch (error) {
      console.error('❌ Error getting cache stats:', error);
      return {
        exists: false,
        movieCount: 0,
        genres: [],
        isExpired: false,
      };
    }
  }
}

// Export singleton instance
export const movieCacheService = new MovieCacheService();

// Export CircuitBreakerState for external use
export { CircuitBreakerState };