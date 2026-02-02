const CacheMetrics = require('../utils/CacheMetrics');

/**
 * Enhanced MovieSetLoader using IMMUTABLE BUSINESS LOGIC ContentFilterService
 * Implements exactly 50 movies per room with ZERO TOLERANCE quality gate
 */
class EnhancedMovieSetLoader {
  constructor() {
    // Import the corrected ContentFilterService
    const { ContentFilterService } = require('./content-filter-service');
    this.contentFilterService = new ContentFilterService();
    
    this.MOVIES_PER_SET = 50; // Business requirement: exactly 50 movies per room
    
    console.log('🎯 EnhancedMovieSetLoader initialized with IMMUTABLE BUSINESS LOGIC ContentFilterService');
  }

  /**
   * Creates a movie set with exactly 50 movies using IMMUTABLE BUSINESS LOGIC
   * @param {Object} filterCriteria - Filter criteria
   * @param {string} filterCriteria.mediaType - MOVIE or TV (exclusive)
   * @param {number[]} filterCriteria.genreIds - 1 or 2 genre IDs
   * @param {string} filterCriteria.roomId - Room identifier
   * @returns {Promise<Object>} Movie set with exactly 50 movies
   */
  async createMovieSet(filterCriteria) {
    console.log(`🎬 Creating movie set with IMMUTABLE BUSINESS LOGIC:`, filterCriteria);

    try {
      // Validate filter criteria
      this.validateFilterCriteria(filterCriteria);

      // Convert to ContentFilterService format
      const contentFilterCriteria = {
        mediaType: filterCriteria.mediaType,
        genres: filterCriteria.genreIds || [],
        roomId: filterCriteria.roomId
      };

      console.log(`🔄 Using IMMUTABLE BUSINESS LOGIC with criteria:`, contentFilterCriteria);

      // Use ContentFilterService to get exactly 50 filtered items
      const contentPool = await this.contentFilterService.createFilteredRoom(contentFilterCriteria);
      
      if (!contentPool || contentPool.length === 0) {
        throw new Error('No content found matching filter criteria with IMMUTABLE BUSINESS LOGIC');
      }

      if (contentPool.length !== this.MOVIES_PER_SET) {
        throw new Error(`BUSINESS LOGIC FAILURE: Expected exactly ${this.MOVIES_PER_SET} items, got ${contentPool.length}`);
      }

      console.log(`📦 IMMUTABLE BUSINESS LOGIC returned exactly ${contentPool.length} items`);

      // Convert ContentPoolEntry format to cache format with sequence indexing
      const cachedMovies = contentPool.map((item, index) => ({
        movieId: item.tmdbId,
        title: item.title,
        overview: item.overview || '',
        posterPath: item.posterPath || null,
        releaseDate: item.releaseDate || '',
        voteAverage: item.voteAverage || 0,
        genreIds: item.genreIds || [],
        originalLanguage: '', // Not provided by ContentFilterService
        mediaType: item.mediaType,
        priority: item.priority,
        sequenceIndex: index // 0-49 for exactly 50 movies
      }));

      console.log(`✅ Created movie set with IMMUTABLE BUSINESS LOGIC: ${cachedMovies.length} movies`);

      return {
        movies: cachedMovies,
        filterCriteria,
        createdAt: new Date().toISOString(),
        totalMovies: cachedMovies.length,
        businessLogicApplied: {
          immutableBusinessLogic: true,
          westernLanguagesOnly: true,
          descriptionRequired: true,
          genrePrioritization: true,
          exactlyFiftyMovies: true,
          zeroToleranceQualityGate: true
        }
      };

    } catch (error) {
      console.error(`❌ Error creating movie set with IMMUTABLE BUSINESS LOGIC:`, error);
      throw error;
    }
  }

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

    // Genre validation - must have 0, 1 or 2 genres
    if (filterCriteria.genreIds && !Array.isArray(filterCriteria.genreIds)) {
      throw new Error('Genre IDs must be provided as an array');
    }

    if (filterCriteria.genreIds && filterCriteria.genreIds.length > 2) {
      throw new Error('Must select 0, 1, or 2 genres maximum');
    }

    // Validate genre IDs are numbers
    if (filterCriteria.genreIds && !filterCriteria.genreIds.every(id => typeof id === 'number' && id > 0)) {
      throw new Error('Genre IDs must be positive numbers');
    }

    // Room ID validation
    if (!filterCriteria.roomId || typeof filterCriteria.roomId !== 'string') {
      throw new Error('Room ID is required and must be a string');
    }
  }
}

module.exports = EnhancedMovieSetLoader;