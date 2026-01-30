/**
 * Movie Pre-loading Service
 * Implements background pre-loading of next 3 movies during voting sessions
 * Provides instant movie display and fallback to on-demand loading
 */

import { mediaService, MediaItemDetails } from './mediaService';
import { loggingService } from './loggingService';
import { imageCacheService } from './imageCacheService';

interface PreloadedMovie {
  movieId: string;
  details: MediaItemDetails | null;
  loadedAt: Date;
  error?: string;
}

interface PreloadQueue {
  roomId: string;
  currentIndex: number;
  moviesList: any[];
  preloadedMovies: Map<string, PreloadedMovie>;
  isPreloading: boolean;
  preloadPromises: Map<string, Promise<void>>;
}

class MoviePreloadService {
  private preloadQueues: Map<string, PreloadQueue> = new Map();
  private readonly PRELOAD_COUNT = 3; // Pre-load next 3 movies
  private readonly PRELOAD_TIMEOUT = 10000; // 10 seconds timeout per movie
  private readonly MAX_CONCURRENT_PRELOADS = 2; // Limit concurrent requests

  /**
   * Initialize pre-loading for a room
   */
  async initializePreloading(
    roomId: string,
    moviesList: any[],
    currentIndex: number = 0
  ): Promise<void> {
    console.log(`🎬 Initializing movie pre-loading for room ${roomId}`);
    
    const queue: PreloadQueue = {
      roomId,
      currentIndex,
      moviesList,
      preloadedMovies: new Map(),
      isPreloading: false,
      preloadPromises: new Map(),
    };
    
    this.preloadQueues.set(roomId, queue);
    
    // Start pre-loading immediately
    await this.startPreloading(roomId);
    
    loggingService.info('MoviePreloadService', 'Pre-loading initialized', {
      roomId,
      moviesCount: moviesList.length,
      currentIndex,
      preloadCount: this.PRELOAD_COUNT,
    });
  }

  /**
   * Start background pre-loading of next movies
   */
  private async startPreloading(roomId: string): Promise<void> {
    const queue = this.preloadQueues.get(roomId);
    if (!queue || queue.isPreloading) return;

    queue.isPreloading = true;
    
    try {
      const preloadPromises: Promise<void>[] = [];
      let concurrentCount = 0;
      
      // Pre-load next PRELOAD_COUNT movies
      for (let i = 1; i <= this.PRELOAD_COUNT; i++) {
        const targetIndex = queue.currentIndex + i;
        
        if (targetIndex >= queue.moviesList.length) {
          break; // No more movies to pre-load
        }
        
        const movie = queue.moviesList[targetIndex];
        const movieId = movie.id || movie.tmdbId || movie.toString();
        
        // Skip if already pre-loaded or currently loading
        if (queue.preloadedMovies.has(movieId) || queue.preloadPromises.has(movieId)) {
          continue;
        }
        
        // Limit concurrent pre-loads
        if (concurrentCount >= this.MAX_CONCURRENT_PRELOADS) {
          break;
        }
        
        const preloadPromise = this.preloadSingleMovie(roomId, movieId, targetIndex);
        queue.preloadPromises.set(movieId, preloadPromise);
        preloadPromises.push(preloadPromise);
        concurrentCount++;
      }
      
      // Wait for all pre-loads to complete (or timeout)
      if (preloadPromises.length > 0) {
        console.log(`🔄 Pre-loading ${preloadPromises.length} movies for room ${roomId}`);
        await Promise.allSettled(preloadPromises);
      }
      
    } catch (error) {
      console.error('❌ Error in pre-loading process:', error);
      loggingService.error('MoviePreloadService', 'Pre-loading failed', { roomId, error });
    } finally {
      queue.isPreloading = false;
    }
  }

  /**
   * Pre-load a single movie with timeout and error handling
   */
  private async preloadSingleMovie(
    roomId: string,
    movieId: string,
    index: number
  ): Promise<void> {
    const queue = this.preloadQueues.get(roomId);
    if (!queue) return;

    try {
      console.log(`🎬 Pre-loading movie ${movieId} (index ${index}) for room ${roomId}`);
      
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Pre-load timeout')), this.PRELOAD_TIMEOUT);
      });
      
      // Race between movie loading and timeout
      const movieDetails = await Promise.race([
        mediaService.getMovieDetails(parseInt(movieId)),
        timeoutPromise,
      ]);
      
      // Pre-cache movie images if details are available
      if (movieDetails?.poster) {
        try {
          console.log(`🖼️ Pre-caching poster image for ${movieDetails.title}`);
          await imageCacheService.cacheImage(movieDetails.poster);
        } catch (imageError) {
          console.warn(`⚠️ Failed to cache poster for ${movieDetails.title}:`, imageError);
          // Don't fail the entire pre-load for image caching errors
        }
      }
      
      // Store pre-loaded movie
      queue.preloadedMovies.set(movieId, {
        movieId,
        details: movieDetails,
        loadedAt: new Date(),
      });
      
      console.log(`✅ Successfully pre-loaded movie: ${movieDetails?.title || movieId}`);
      
      loggingService.debug('MoviePreloadService', 'Movie pre-loaded', {
        roomId,
        movieId,
        title: movieDetails?.title,
        index,
        posterCached: !!movieDetails?.poster,
      });
      
    } catch (error: any) {
      console.warn(`⚠️ Failed to pre-load movie ${movieId}:`, error.message);
      
      // Store error for fallback handling
      queue.preloadedMovies.set(movieId, {
        movieId,
        details: null,
        loadedAt: new Date(),
        error: error.message,
      });
      
      loggingService.warn('MoviePreloadService', 'Movie pre-load failed', {
        roomId,
        movieId,
        error: error.message,
        index,
      });
      
    } finally {
      // Clean up promise reference
      queue.preloadPromises.delete(movieId);
    }
  }

  /**
   * Get pre-loaded movie (instant if available, fallback to on-demand)
   */
  async getMovie(roomId: string, movieId: string): Promise<MediaItemDetails | null> {
    const queue = this.preloadQueues.get(roomId);
    if (!queue) {
      console.warn(`⚠️ No pre-load queue found for room ${roomId}, falling back to on-demand`);
      return this.fallbackToOnDemand(movieId);
    }

    const preloaded = queue.preloadedMovies.get(movieId);
    
    if (preloaded) {
      if (preloaded.details) {
        console.log(`⚡ Serving pre-loaded movie: ${preloaded.details.title}`);
        
        loggingService.info('MoviePreloadService', 'Pre-loaded movie served', {
          roomId,
          movieId,
          title: preloaded.details.title,
          preloadedAt: preloaded.loadedAt,
          servedAt: new Date(),
        });
        
        return preloaded.details;
      } else if (preloaded.error) {
        console.warn(`⚠️ Pre-loaded movie ${movieId} had error: ${preloaded.error}, falling back`);
        return this.fallbackToOnDemand(movieId);
      }
    }
    
    // Check if currently being pre-loaded
    const preloadPromise = queue.preloadPromises.get(movieId);
    if (preloadPromise) {
      console.log(`⏳ Movie ${movieId} is being pre-loaded, waiting...`);
      
      try {
        await preloadPromise;
        const nowPreloaded = queue.preloadedMovies.get(movieId);
        if (nowPreloaded?.details) {
          console.log(`✅ Pre-load completed, serving: ${nowPreloaded.details.title}`);
          return nowPreloaded.details;
        }
      } catch (error) {
        console.warn(`⚠️ Pre-load wait failed for ${movieId}:`, error);
      }
    }
    
    // Fallback to on-demand loading
    console.log(`🔄 No pre-loaded data for ${movieId}, falling back to on-demand loading`);
    return this.fallbackToOnDemand(movieId);
  }

  /**
   * Fallback to on-demand loading with loading indicators
   */
  private async fallbackToOnDemand(movieId: string): Promise<MediaItemDetails | null> {
    try {
      console.log(`📡 Loading movie ${movieId} on-demand...`);
      
      loggingService.info('MoviePreloadService', 'Fallback to on-demand loading', {
        movieId,
        reason: 'not_preloaded',
      });
      
      const movieDetails = await mediaService.getMovieDetails(parseInt(movieId));
      
      if (movieDetails) {
        console.log(`✅ On-demand loading successful: ${movieDetails.title}`);
      }
      
      return movieDetails;
      
    } catch (error: any) {
      console.error(`❌ On-demand loading failed for ${movieId}:`, error);
      
      loggingService.error('MoviePreloadService', 'On-demand loading failed', {
        movieId,
        error: error.message,
      });
      
      return null;
    }
  }

  /**
   * Advance to next movie and trigger new pre-loads
   */
  async advanceToNext(roomId: string): Promise<void> {
    const queue = this.preloadQueues.get(roomId);
    if (!queue) return;

    queue.currentIndex++;
    
    console.log(`➡️ Advanced to index ${queue.currentIndex} in room ${roomId}`);
    
    // Clean up old pre-loaded movies (keep only current and next few)
    this.cleanupOldPreloads(queue);
    
    // Start pre-loading new movies if needed
    if (!queue.isPreloading) {
      await this.startPreloading(roomId);
    }
    
    loggingService.debug('MoviePreloadService', 'Advanced to next movie', {
      roomId,
      newIndex: queue.currentIndex,
      remainingMovies: queue.moviesList.length - queue.currentIndex,
    });
  }

  /**
   * Clean up old pre-loaded movies to save memory
   */
  private cleanupOldPreloads(queue: PreloadQueue): void {
    const currentIndex = queue.currentIndex;
    const moviesToKeep = new Set<string>();
    
    // Keep current and next PRELOAD_COUNT movies
    for (let i = 0; i <= this.PRELOAD_COUNT; i++) {
      const index = currentIndex + i;
      if (index < queue.moviesList.length) {
        const movie = queue.moviesList[index];
        const movieId = movie.id || movie.tmdbId || movie.toString();
        moviesToKeep.add(movieId);
      }
    }
    
    // Remove old pre-loads
    const toRemove: string[] = [];
    queue.preloadedMovies.forEach((_, movieId) => {
      if (!moviesToKeep.has(movieId)) {
        toRemove.push(movieId);
      }
    });
    
    toRemove.forEach(movieId => {
      queue.preloadedMovies.delete(movieId);
      console.log(`🧹 Cleaned up old pre-load: ${movieId}`);
    });
    
    if (toRemove.length > 0) {
      loggingService.debug('MoviePreloadService', 'Cleaned up old pre-loads', {
        roomId: queue.roomId,
        removedCount: toRemove.length,
        remainingCount: queue.preloadedMovies.size,
      });
    }
  }

  /**
   * Get pre-loading status for UI indicators
   */
  getPreloadStatus(roomId: string): {
    isPreloading: boolean;
    preloadedCount: number;
    totalMovies: number;
    currentIndex: number;
    nextMoviesReady: number;
  } {
    const queue = this.preloadQueues.get(roomId);
    
    if (!queue) {
      return {
        isPreloading: false,
        preloadedCount: 0,
        totalMovies: 0,
        currentIndex: 0,
        nextMoviesReady: 0,
      };
    }
    
    // Count successfully pre-loaded movies
    let nextMoviesReady = 0;
    for (let i = 1; i <= this.PRELOAD_COUNT; i++) {
      const targetIndex = queue.currentIndex + i;
      if (targetIndex >= queue.moviesList.length) break;
      
      const movie = queue.moviesList[targetIndex];
      const movieId = movie.id || movie.tmdbId || movie.toString();
      const preloaded = queue.preloadedMovies.get(movieId);
      
      if (preloaded?.details) {
        nextMoviesReady++;
      }
    }
    
    return {
      isPreloading: queue.isPreloading,
      preloadedCount: queue.preloadedMovies.size,
      totalMovies: queue.moviesList.length,
      currentIndex: queue.currentIndex,
      nextMoviesReady,
    };
  }

  /**
   * Force pre-load specific movies (for manual optimization)
   */
  async forcePreload(roomId: string, movieIds: string[]): Promise<void> {
    const queue = this.preloadQueues.get(roomId);
    if (!queue) return;

    console.log(`🚀 Force pre-loading ${movieIds.length} movies for room ${roomId}`);
    
    const preloadPromises = movieIds.map(movieId => 
      this.preloadSingleMovie(roomId, movieId, -1) // Use -1 for manual preloads
    );
    
    await Promise.allSettled(preloadPromises);
    
    loggingService.info('MoviePreloadService', 'Force pre-load completed', {
      roomId,
      movieIds,
      requestedCount: movieIds.length,
    });
  }

  /**
   * Pre-cache images for a list of movies
   */
  async preCacheMovieImages(movies: MediaItemDetails[]): Promise<void> {
    if (!movies || movies.length === 0) return;

    console.log(`🖼️ Pre-caching images for ${movies.length} movies`);
    
    const imageUris = movies
      .map(movie => movie.poster)
      .filter(path => path && path.trim() !== '');
    
    if (imageUris.length > 0) {
      await imageCacheService.preCacheImages(imageUris);
      
      loggingService.info('MoviePreloadService', 'Movie images pre-cached', {
        totalMovies: movies.length,
        cachedImages: imageUris.length,
      });
    }
  }

  /**
   * Clear all pre-loaded data for a room
   */
  clearPreloads(roomId: string): void {
    const queue = this.preloadQueues.get(roomId);
    if (!queue) return;

    console.log(`🧹 Clearing all pre-loads for room ${roomId}`);
    
    // Cancel any ongoing pre-loads
    queue.preloadPromises.clear();
    queue.preloadedMovies.clear();
    queue.isPreloading = false;
    
    this.preloadQueues.delete(roomId);
    
    loggingService.info('MoviePreloadService', 'Pre-loads cleared', { roomId });
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    totalRooms: number;
    totalPreloadedMovies: number;
    totalMemoryUsage: number; // Rough estimate in bytes
  } {
    let totalPreloadedMovies = 0;
    let totalMemoryUsage = 0;
    
    this.preloadQueues.forEach(queue => {
      totalPreloadedMovies += queue.preloadedMovies.size;
      
      // Rough estimate: each movie details object ~5KB
      queue.preloadedMovies.forEach(preloaded => {
        if (preloaded.details) {
          totalMemoryUsage += 5000; // 5KB estimate per movie
        }
      });
    });
    
    return {
      totalRooms: this.preloadQueues.size,
      totalPreloadedMovies,
      totalMemoryUsage,
    };
  }
}

// Export singleton instance
export const moviePreloadService = new MoviePreloadService();
export default moviePreloadService;