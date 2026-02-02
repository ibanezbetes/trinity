const axios = require('axios');
const CircuitBreaker = require('../utils/CircuitBreaker');
const RetryManager = require('../utils/RetryManager');
const CacheMetrics = require('../utils/CacheMetrics');

/**
 * Handles TMDB API integration and movie batch creation
 * Implements priority algorithm for genre-based movie selection with resilience
 */
class MovieBatchLoader {
  constructor() {
    this.tmdbApiKey = process.env.TMDB_API_KEY;
    this.tmdbBaseUrl = 'https://api.themoviedb.org/3';
    this.imageBaseUrl = 'https://image.tmdb.org/t/p/w500';
    this.metrics = new CacheMetrics();
    
    if (!this.tmdbApiKey) {
      throw new Error('TMDB_API_KEY environment variable is required');
    }

    // Initialize circuit breaker and retry manager
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 10000 // 10 seconds
    });

    this.retryManager = new RetryManager({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    });

    this.metrics.log('info', 'MovieBatchLoader', 'MovieBatchLoader initialized with resilience features');
  }

  /**
   * Makes a resilient HTTP request to TMDB API
   * @param {string} url - API endpoint URL
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>} API response data
   */
  async makeResilientRequest(url, params = {}) {
    const startTime = Date.now();
    const endpoint = url.split('/').pop();
    
    const requestFn = async () => {
      try {
        const response = await axios.get(url, { 
          params,
          timeout: 10000, // 10 second timeout
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Trinity-Cache-System/1.0'
          }
        });
        
        if (response.status !== 200) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response.data;
      } catch (error) {
        // Transform axios errors to standard format
        if (error.code === 'ECONNABORTED') {
          const timeoutError = new Error('Request timeout');
          timeoutError.name = 'TimeoutError';
          throw timeoutError;
        }
        
        if (error.response) {
          // HTTP error response
          const httpError = new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
          httpError.name = error.response.status >= 500 ? 'ServiceException' : 'ClientError';
          throw httpError;
        }
        
        if (error.request) {
          // Network error
          const networkError = new Error('Network error - no response received');
          networkError.name = 'NetworkError';
          throw networkError;
        }
        
        throw error;
      }
    };

    try {
      // Use circuit breaker and retry logic
      const result = await this.circuitBreaker.execute(async () => {
        return await this.retryManager.executeWithRetry(requestFn, {
          retryableErrors: ['NetworkError', 'TimeoutError', 'ServiceException']
        });
      });

      // Record successful API call metrics
      const duration = Date.now() - startTime;
      await this.metrics.recordTMDBApiMetrics(endpoint, duration, true);
      
      return result;

    } catch (error) {
      // Record failed API call metrics
      const duration = Date.now() - startTime;
      await this.metrics.recordTMDBApiMetrics(endpoint, duration, false, {
        rateLimited: error.message.includes('rate limit')
      });
      
      // Record circuit breaker state
      await this.metrics.recordCircuitBreakerMetrics(
        this.circuitBreaker.getState(),
        this.circuitBreaker.getFailureCount()
      );
      
      throw error;
    }
  }

  /**
   * Fallback method when TMDB API is unavailable
   * @param {Object} criteria - Filter criteria
   * @param {number} batchSize - Number of movies needed
   * @returns {Promise<Object[]>} Default movie list
   */
  async getFallbackMovies(criteria, batchSize = 30) {
    console.log(`🔄 Using fallback movies for ${criteria.mediaType}`);
    
    // Return a curated list of popular movies as fallback
    const fallbackMovies = [
      {
        id: '238',
        title: 'The Godfather',
        overview: 'The aging patriarch of an organized crime dynasty transfers control to his reluctant son.',
        poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
        release_date: '1972-03-14',
        vote_average: 8.7,
        genre_ids: [18, 80] // Drama, Crime
      },
      {
        id: '680',
        title: 'Pulp Fiction',
        overview: 'A burger-loving hit man, his philosophical partner, and a drug-addled gangster\'s moll.',
        poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
        release_date: '1994-09-10',
        vote_average: 8.5,
        genre_ids: [80, 18] // Crime, Drama
      },
      {
        id: '13',
        title: 'Forrest Gump',
        overview: 'A man with a low IQ has accomplished great things in his life.',
        poster_path: '/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg',
        release_date: '1994-06-23',
        vote_average: 8.5,
        genre_ids: [35, 18, 10749] // Comedy, Drama, Romance
      },
      {
        id: '120',
        title: 'The Lord of the Rings: The Fellowship of the Ring',
        overview: 'A meek Hobbit from the Shire and eight companions set out on a journey.',
        poster_path: '/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg',
        release_date: '2001-12-18',
        vote_average: 8.4,
        genre_ids: [12, 14, 28] // Adventure, Fantasy, Action
      },
      {
        id: '155',
        title: 'The Dark Knight',
        overview: 'Batman raises the stakes in his war on crime.',
        poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
        release_date: '2008-07-16',
        vote_average: 8.5,
        genre_ids: [18, 28, 80, 53] // Drama, Action, Crime, Thriller
      }
    ];

    // Transform to our format and limit to requested size
    return fallbackMovies.slice(0, batchSize).map(movie => ({
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      posterPath: movie.poster_path ? `${this.imageBaseUrl}${movie.poster_path}` : null,
      releaseDate: movie.release_date,
      voteAverage: movie.vote_average,
      genreIds: movie.genre_ids,
      mediaType: criteria.mediaType,
      priority: 1 // Default priority
    }));
  }

  /**
   * Creates a movie batch with specified criteria (with resilience)
   * @param {Object} criteria - Filter criteria
   * @param {string[]} excludeIds - Movie IDs to exclude
   * @param {number} batchSize - Number of movies to fetch
   * @returns {Promise<Object>} Movie batch
   */
  async createMovieBatch(criteria, excludeIds = [], batchSize = 30) {
    console.log(`🎬 Creating resilient movie batch with criteria:`, criteria);
    console.log(`📋 Excluding ${excludeIds.length} movies`);

    try {
      let movies = [];
      
      // Strategy 1: Try to get movies with exact genre matches
      if (criteria.genreIds && criteria.genreIds.length > 0) {
        console.log(`🎯 Fetching movies with genres: ${criteria.genreIds.join(', ')}`);
        try {
          movies = await this.fetchMoviesWithGenres(
            criteria.genreIds, 
            criteria.mediaType, 
            excludeIds,
            batchSize * 2 // Fetch more to account for filtering
          );
        } catch (error) {
          console.warn(`⚠️ Genre-based fetch failed, continuing with fallback:`, error.message);
        }
      }

      // Strategy 2: If not enough movies, get popular movies of the media type
      if (movies.length < batchSize) {
        console.log(`📈 Fetching popular ${criteria.mediaType} movies to fill batch`);
        try {
          const popularMovies = await this.fetchPopularMovies(
            criteria.mediaType,
            excludeIds.concat(movies.map(m => m.id.toString())),
            batchSize * 2
          );
          movies = movies.concat(popularMovies);
        } catch (error) {
          console.warn(`⚠️ Popular movies fetch failed:`, error.message);
        }
      }

      // Strategy 3: If still not enough movies, use fallback
      if (movies.length < batchSize) {
        console.log(`🔄 Using fallback movies - API unavailable`);
        const fallbackMovies = await this.getFallbackMovies(criteria, batchSize);
        movies = movies.concat(fallbackMovies);
      }

      // Remove duplicates and apply priority algorithm
      movies = this.removeDuplicates(movies, excludeIds);
      movies = await this.applyPriorityAlgorithm(movies, criteria);

      // Limit to requested batch size
      movies = movies.slice(0, batchSize);

      // Convert to cache format
      const cachedMovies = movies.map((movie, index) => ({
        movieId: movie.id.toString(),
        title: movie.title || movie.name,
        overview: movie.overview || '',
        posterPath: movie.poster_path ? `${this.imageBaseUrl}${movie.poster_path}` : null,
        releaseDate: movie.release_date || movie.first_air_date || '',
        voteAverage: movie.vote_average || 0,
        genreIds: movie.genre_ids || [],
        mediaType: criteria.mediaType,
        priority: this.calculatePriority(movie, criteria),
        sequenceIndex: index
      }));

      console.log(`✅ Created resilient movie batch with ${cachedMovies.length} movies`);

      return {
        movies: cachedMovies,
        batchNumber: 1,
        filterCriteria: criteria,
        createdAt: new Date().toISOString(),
        totalMovies: cachedMovies.length,
        source: cachedMovies.length === batchSize ? 'api' : 'mixed_with_fallback'
      };

    } catch (error) {
      console.error(`❌ Critical error creating movie batch:`, error);
      
      // Last resort: return fallback movies
      console.log(`🆘 Using emergency fallback movies`);
      const emergencyMovies = await this.getFallbackMovies(criteria, batchSize);
      
      // Convert to cache format
      const cachedEmergencyMovies = emergencyMovies.map((movie, index) => ({
        movieId: movie.id.toString(),
        title: movie.title,
        overview: movie.overview,
        posterPath: movie.posterPath,
        releaseDate: movie.releaseDate,
        voteAverage: movie.voteAverage,
        genreIds: movie.genreIds,
        mediaType: movie.mediaType,
        priority: movie.priority,
        sequenceIndex: index
      }));
      
      return {
        movies: cachedEmergencyMovies,
        batchNumber: 1,
        filterCriteria: criteria,
        createdAt: new Date().toISOString(),
        totalMovies: cachedEmergencyMovies.length,
        source: 'emergency_fallback'
      };
    }
  }

  /**
   * Fetches movies with specific genres from TMDB
   * @param {number[]} genreIds - Genre IDs to filter by
   * @param {string} mediaType - MOVIE or TV
   * @param {string[]} excludeIds - Movie IDs to exclude
   * @param {number} limit - Maximum movies to fetch
   * @returns {Promise<Object[]>} Array of TMDB movies
   */
  async fetchMoviesWithGenres(genreIds, mediaType, excludeIds = [], limit = 60) {
    try {
      const endpoint = mediaType === 'MOVIE' ? 'movie' : 'tv';
      const movies = [];
      let page = 1;
      const maxPages = 5; // Limit to prevent excessive API calls

      while (movies.length < limit && page <= maxPages) {
        const url = `${this.tmdbBaseUrl}/discover/${endpoint}`;
        const params = {
          api_key: this.tmdbApiKey,
          with_genres: genreIds.join(','),
          sort_by: 'popularity.desc',
          page: page,
          'vote_count.gte': 10, // Minimum vote count for quality
          language: 'es-ES'
        };

        console.log(`📡 Fetching ${endpoint} page ${page} with genres ${genreIds.join(',')}`);
        
        const response = await this.makeResilientRequest(url, params);
        const pageMovies = response.results || [];

        // Filter out excluded movies
        const filteredMovies = pageMovies.filter(movie => 
          !excludeIds.includes(movie.id.toString())
        );

        movies.push(...filteredMovies);
        page++;

        // Break if no more pages
        if (page > (response.total_pages || 1)) break;
      }

      console.log(`📦 Fetched ${movies.length} movies with genres ${genreIds.join(',')}`);
      return movies;

    } catch (error) {
      console.error(`❌ Error fetching movies with genres:`, error);
      return [];
    }
  }

  /**
   * Fetches popular movies of specified media type
   * @param {string} mediaType - MOVIE or TV
   * @param {string[]} excludeIds - Movie IDs to exclude
   * @param {number} limit - Maximum movies to fetch
   * @returns {Promise<Object[]>} Array of TMDB movies
   */
  async fetchPopularMovies(mediaType, excludeIds = [], limit = 60) {
    try {
      const endpoint = mediaType === 'MOVIE' ? 'movie' : 'tv';
      const movies = [];
      let page = 1;
      const maxPages = 3;

      while (movies.length < limit && page <= maxPages) {
        const url = `${this.tmdbBaseUrl}/${endpoint}/popular`;
        const params = {
          api_key: this.tmdbApiKey,
          page: page,
          language: 'es-ES'
        };

        console.log(`📡 Fetching popular ${endpoint} page ${page}`);
        
        const response = await this.makeResilientRequest(url, params);
        const pageMovies = response.results || [];

        // Filter out excluded movies
        const filteredMovies = pageMovies.filter(movie => 
          !excludeIds.includes(movie.id.toString())
        );

        movies.push(...filteredMovies);
        page++;

        if (page > (response.total_pages || 1)) break;
      }

      console.log(`📦 Fetched ${movies.length} popular ${mediaType} movies`);
      return movies;

    } catch (error) {
      console.error(`❌ Error fetching popular movies:`, error);
      return [];
    }
  }

  /**
   * Applies priority algorithm to sort movies
   * @param {Object[]} movies - Array of TMDB movies
   * @param {Object} criteria - Filter criteria
   * @returns {Promise<Object[]>} Sorted movies
   */
  async applyPriorityAlgorithm(movies, criteria) {
    console.log(`🎯 Applying priority algorithm to ${movies.length} movies`);

    try {
      // Calculate priority score for each movie
      const moviesWithPriority = movies.map(movie => ({
        ...movie,
        priorityScore: this.calculatePriority(movie, criteria)
      }));

      // Sort by priority score (higher is better)
      moviesWithPriority.sort((a, b) => b.priorityScore - a.priorityScore);

      // Add some randomization within priority tiers to avoid always same order
      const result = this.randomizeWithinTiers(moviesWithPriority);

      console.log(`✅ Applied priority algorithm, top movie: ${result[0]?.title || result[0]?.name}`);
      return result;

    } catch (error) {
      console.error(`❌ Error applying priority algorithm:`, error);
      return movies;
    }
  }

  /**
   * Removes duplicate movies
   * @param {Object[]} movies - Array of movies
   * @param {string[]} existingIds - Existing movie IDs to exclude
   * @returns {Object[]} Filtered movies
   */
  removeDuplicates(movies, existingIds) {
    const seenIds = new Set(existingIds);
    const uniqueMovies = [];

    for (const movie of movies) {
      const movieId = movie.id.toString();
      if (!seenIds.has(movieId)) {
        seenIds.add(movieId);
        uniqueMovies.push(movie);
      }
    }

    console.log(`🔄 Removed duplicates: ${movies.length} -> ${uniqueMovies.length} movies`);
    return uniqueMovies;
  }

  /**
   * Calculates priority score for a movie
   * @param {Object} movie - TMDB movie object
   * @param {Object} criteria - Filter criteria
   * @returns {number} Priority score (1-3)
   */
  calculatePriority(movie, criteria) {
    let score = 1; // Base priority

    // Boost score for genre matches
    if (criteria.genreIds && criteria.genreIds.length > 0 && movie.genre_ids) {
      const genreMatches = criteria.genreIds.filter(id => 
        movie.genre_ids.includes(id)
      ).length;
      
      if (genreMatches === criteria.genreIds.length) {
        score = 3; // Perfect genre match
      } else if (genreMatches > 0) {
        score = 2; // Partial genre match
      }
    }

    // Boost for high ratings
    if (movie.vote_average >= 7.5) {
      score += 0.5;
    } else if (movie.vote_average >= 6.0) {
      score += 0.2;
    }

    // Boost for popularity
    if (movie.popularity >= 100) {
      score += 0.3;
    } else if (movie.popularity >= 50) {
      score += 0.1;
    }

    // Boost for recent releases (within last 5 years)
    const releaseYear = new Date(movie.release_date || movie.first_air_date).getFullYear();
    const currentYear = new Date().getFullYear();
    if (currentYear - releaseYear <= 5) {
      score += 0.2;
    }

    return Math.min(score, 3); // Cap at 3
  }

  /**
   * Randomizes movies within priority tiers
   * @param {Object[]} movies - Movies with priority scores
   * @returns {Object[]} Randomized movies
   */
  randomizeWithinTiers(movies) {
    const tiers = {
      high: movies.filter(m => m.priorityScore >= 2.5),
      medium: movies.filter(m => m.priorityScore >= 1.5 && m.priorityScore < 2.5),
      low: movies.filter(m => m.priorityScore < 1.5)
    };

    // Shuffle within each tier
    Object.keys(tiers).forEach(tier => {
      tiers[tier] = this.shuffleArray(tiers[tier]);
    });

    // Combine tiers maintaining priority order
    return [...tiers.high, ...tiers.medium, ...tiers.low];
  }

  /**
   * Shuffles array using Fisher-Yates algorithm
   * @param {Array} array - Array to shuffle
   * @returns {Array} Shuffled array
   */
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

module.exports = MovieBatchLoader;