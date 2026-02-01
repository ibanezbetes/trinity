const axios = require('axios');
const CircuitBreaker = require('../utils/CircuitBreaker');
const RetryManager = require('../utils/RetryManager');
const CacheMetrics = require('../utils/CacheMetrics');

/**
 * Handles TMDB API integration for single movie set loading with business logic
 * Implements exactly 50 movies per room with western language filtering,
 * description requirements, and genre prioritization algorithm
 */
class MovieSetLoader {
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

    // Western languages (ISO 639-1 codes) - Business requirement
    this.WESTERN_LANGUAGES = new Set([
      'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi', 'is',
      'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sl', 'et', 'lv', 'lt',
      'mt', 'ga', 'cy', 'eu', 'ca', 'gl', 'oc', 'rm', 'lb', 'fo', 'kl'
    ]);

    this.MOVIES_PER_SET = 50; // Business requirement: exactly 50 movies per room

    this.metrics.log('info', 'MovieSetLoader', 'MovieSetLoader initialized with business logic');
  }

  /**
   * Creates a movie set with exactly 50 movies using business logic
   * @param {Object} filterCriteria - Filter criteria
   * @param {string} filterCriteria.mediaType - MOVIE or TV (exclusive)
   * @param {number[]} filterCriteria.genreIds - 1 or 2 genre IDs
   * @returns {Promise<Object>} Movie set with exactly 50 movies
   */
  async createMovieSet(filterCriteria) {
    console.log(`🎬 Creating movie set with business logic:`, filterCriteria);

    try {
      // Step 1: Fetch movies from TMDB with filters
      let allMovies = await this.fetchMoviesWithFilters(filterCriteria);
      
      if (allMovies.length === 0) {
        throw new Error('No movies found matching filter criteria');
      }

      console.log(`📦 Fetched ${allMovies.length} movies from TMDB`);

      // Step 2: Apply western language filter (business requirement)
      allMovies = this.applyWesternLanguageFilter(allMovies);
      console.log(`🌍 After western language filter: ${allMovies.length} movies`);

      // Step 3: Apply description requirement filter (business requirement)
      allMovies = this.applyDescriptionFilter(allMovies);
      console.log(`📝 After description filter: ${allMovies.length} movies`);

      if (allMovies.length === 0) {
        throw new Error('No movies found after applying business logic filters (western languages + descriptions)');
      }

      // Step 4: Apply genre prioritization algorithm (business requirement)
      allMovies = this.prioritizeByGenres(allMovies, filterCriteria.genreIds);
      console.log(`🎯 After genre prioritization: ${allMovies.length} movies`);

      // Step 5: Randomize within filter constraints and select exactly 50
      const selectedMovies = this.randomizeAndSelect(allMovies, this.MOVIES_PER_SET);
      
      if (selectedMovies.length !== this.MOVIES_PER_SET) {
        throw new Error(`Business logic error: Expected exactly ${this.MOVIES_PER_SET} movies, got ${selectedMovies.length}`);
      }

      // Step 6: Convert to cache format with sequence indexing
      const cachedMovies = selectedMovies.map((movie, index) => ({
        movieId: movie.id.toString(),
        title: movie.title || movie.name,
        overview: movie.overview || '',
        posterPath: movie.poster_path ? `${this.imageBaseUrl}${movie.poster_path}` : null,
        releaseDate: movie.release_date || movie.first_air_date || '',
        voteAverage: movie.vote_average || 0,
        genreIds: movie.genre_ids || [],
        originalLanguage: movie.original_language || '',
        mediaType: filterCriteria.mediaType,
        priority: movie.genrePriority || 1,
        sequenceIndex: index // 0-49 for exactly 50 movies
      }));

      console.log(`✅ Created movie set with ${cachedMovies.length} movies using business logic`);

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
      console.error(`❌ Error creating movie set with business logic:`, error);
      throw error;
    }
  }

  /**
   * Fetches movies from TMDB with media type and genre filters
   * @param {Object} filterCriteria - Filter criteria
   * @returns {Promise<Object[]>} Array of TMDB movies
   */
  async fetchMoviesWithFilters(filterCriteria) {
    try {
      const endpoint = filterCriteria.mediaType === 'MOVIE' ? 'movie' : 'tv';
      const movies = [];
      let page = 1;
      const maxPages = 10; // Fetch more pages to ensure we have enough after filtering
      const targetMovies = this.MOVIES_PER_SET * 3; // Fetch 3x more to account for filtering

      while (movies.length < targetMovies && page <= maxPages) {
        const url = `${this.tmdbBaseUrl}/discover/${endpoint}`;
        const params = {
          api_key: this.tmdbApiKey,
          sort_by: 'popularity.desc',
          page: page,
          'vote_count.gte': 10, // Minimum vote count for quality
          language: 'en-US', // Use English for broader results, filter languages later
          include_adult: false
        };

        // Only add genre filter if genres are specified
        if (filterCriteria.genreIds && filterCriteria.genreIds.length > 0) {
          params.with_genres = filterCriteria.genreIds.join(',');
        }

        console.log(`📡 Fetching ${endpoint} page ${page} with genres ${filterCriteria.genreIds && filterCriteria.genreIds.length > 0 ? filterCriteria.genreIds.join(',') : 'all genres'}`);
        
        const response = await this.makeResilientRequest(url, params);
        const pageMovies = response.results || [];

        movies.push(...pageMovies);
        page++;

        // Break if no more pages
        if (page > (response.total_pages || 1)) break;
      }

      // Remove duplicates
      const uniqueMovies = this.removeDuplicates(movies);
      console.log(`📦 Fetched ${uniqueMovies.length} unique movies from TMDB`);
      
      return uniqueMovies;

    } catch (error) {
      console.error(`❌ Error fetching movies from TMDB:`, error);
      throw error;
    }
  }

  /**
   * Applies western language filter (business requirement)
   * @param {Object[]} movies - Array of TMDB movies
   * @returns {Object[]} Filtered movies
   */
  applyWesternLanguageFilter(movies) {
    const filtered = movies.filter(movie => {
      const language = movie.original_language;
      if (!language) return false;
      
      const isWestern = this.WESTERN_LANGUAGES.has(language.toLowerCase());
      if (!isWestern) {
        console.log(`🚫 Excluding non-western language: ${movie.title || movie.name} (${language})`);
      }
      return isWestern;
    });

    console.log(`🌍 Western language filter: ${movies.length} -> ${filtered.length} movies`);
    return filtered;
  }

  /**
   * Applies description requirement filter (business requirement)
   * @param {Object[]} movies - Array of TMDB movies
   * @returns {Object[]} Filtered movies
   */
  applyDescriptionFilter(movies) {
    const filtered = movies.filter(movie => {
      const overview = movie.overview;
      const hasDescription = overview && typeof overview === 'string' && overview.trim().length > 0;
      
      if (!hasDescription) {
        console.log(`🚫 Excluding movie without description: ${movie.title || movie.name}`);
      }
      return hasDescription;
    });

    console.log(`📝 Description filter: ${movies.length} -> ${filtered.length} movies`);
    return filtered;
  }

  /**
   * Applies genre prioritization algorithm (business requirement)
   * Priority 1: Movies with ALL selected genres
   * Priority 2: Movies with ANY selected genres
   * @param {Object[]} movies - Array of movies
   * @param {number[]} selectedGenres - Selected genre IDs
   * @returns {Object[]} Movies sorted by genre priority
   */
  prioritizeByGenres(movies, selectedGenres) {
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
    
    console.log(`🎯 Genre prioritization: Priority 1 (all genres): ${priorityCounts[1]}, Priority 2 (any genre): ${priorityCounts[2]}, Priority 3 (fallback): ${priorityCounts[3]}`);
    
    return sorted;
  }

  /**
   * Randomizes movies within filter constraints and selects exactly N movies
   * @param {Object[]} movies - Array of movies
   * @param {number} count - Number of movies to select
   * @returns {Object[]} Selected movies
   */
  randomizeAndSelect(movies, count) {
    if (movies.length <= count) {
      // If we have fewer movies than needed, return all and log warning
      console.warn(`⚠️ Only ${movies.length} movies available, need ${count}. Returning all available.`);
      return this.shuffleArray(movies);
    }

    // Group by priority for controlled randomization
    const priority1 = movies.filter(m => m.genrePriority === 1);
    const priority2 = movies.filter(m => m.genrePriority === 2);
    const priority3 = movies.filter(m => m.genrePriority === 3);

    // Shuffle each priority group
    const shuffledP1 = this.shuffleArray(priority1);
    const shuffledP2 = this.shuffleArray(priority2);
    const shuffledP3 = this.shuffleArray(priority3);

    // Select movies prioritizing higher priority groups
    const selected = [];
    
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

    console.log(`🎲 Selected ${selected.length} movies: ${fromP1} from priority 1, ${Math.min(shuffledP2.length, remaining)} from priority 2, ${Math.min(shuffledP3.length, stillRemaining)} from priority 3`);
    
    return selected;
  }

  /**
   * Removes duplicate movies based on ID
   * @param {Object[]} movies - Array of movies
   * @returns {Object[]} Unique movies
   */
  removeDuplicates(movies) {
    const seenIds = new Set();
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
      
      throw error;
    }
  }
}

module.exports = MovieSetLoader;