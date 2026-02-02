"use strict";
/**
 * Trinity Cache Handler
 * Handles movie caching logic with deterministic ordering and business logic
 * Implements exactly 50 movies per room with western language filtering,
 * description requirements, and genre prioritization algorithm
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const base_handler_1 = require("./base-handler");
const types_1 = require("../shared/types");
const base_handler_2 = require("./base-handler");
class CacheHandler extends base_handler_1.BaseHandler {
    constructor() {
        super(...arguments);
        this.tmdbBaseUrl = 'https://api.themoviedb.org/3';
        this.tmdbImageBaseUrl = 'https://image.tmdb.org/t/p/w500';
        this.moviesPerRoom = 50; // Business requirement: exactly 50 movies per room
        // Western languages (ISO 639-1 codes) - Business requirement
        this.westernLanguages = new Set([
            'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi', 'is',
            'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sl', 'et', 'lv', 'lt',
            'mt', 'ga', 'cy', 'eu', 'ca', 'gl', 'oc', 'rm', 'lb', 'fo', 'kl'
        ]);
    }
    async handle(event) {
        // Handle direct Lambda invocation (from existing JavaScript Lambda)
        if ('action' in event) {
            return this.handleLambdaEvent(event);
        }
        // Handle AppSync GraphQL invocation
        const { fieldName } = base_handler_2.HandlerUtils.getOperationInfo(event);
        const { userId } = base_handler_2.HandlerUtils.getUserInfo(event);
        this.logger.info(`💾 Cache operation: ${fieldName}`, { userId, fieldName });
        switch (fieldName) {
            case 'createCache':
                return this.createCache(event.arguments);
            case 'getCache':
                return this.getCache(event.arguments);
            case 'refreshCache':
                return this.refreshCache(event.arguments);
            case 'getCacheStatus':
                return this.getCacheStatus(event.arguments);
            case 'getRoomMovies':
                return this.getRoomMovies(event.arguments);
            default:
                throw new types_1.ValidationError(`Unknown cache operation: ${fieldName}`);
        }
    }
    /**
     * Handle direct Lambda invocation (compatibility with existing JavaScript Lambda)
     */
    async handleLambdaEvent(event) {
        this.logger.info('🎬 Trinity Cache Lambda invoked:', event);
        try {
            const { action, roomId, filterCriteria, batchNumber, delayHours, userId } = event;
            let result;
            switch (action) {
                case 'createCache':
                    if (!roomId || !filterCriteria) {
                        throw new types_1.ValidationError('roomId and filterCriteria are required for createCache');
                    }
                    result = await this.createRoomCache(roomId, filterCriteria);
                    break;
                case 'getNextMovie':
                    if (!roomId) {
                        throw new types_1.ValidationError('roomId is required for getNextMovie');
                    }
                    result = await this.getNextMovie(roomId, userId);
                    break;
                case 'getCurrentIndex':
                    if (!roomId) {
                        throw new types_1.ValidationError('roomId is required for getCurrentIndex');
                    }
                    result = await this.getCurrentMovieIndex(roomId);
                    break;
                case 'getCacheMetadata':
                    if (!roomId) {
                        throw new types_1.ValidationError('roomId is required for getCacheMetadata');
                    }
                    result = await this.getCacheMetadata(roomId);
                    break;
                case 'loadBatch':
                    if (!roomId || !batchNumber) {
                        throw new types_1.ValidationError('roomId and batchNumber are required for loadBatch');
                    }
                    result = await this.loadMovieBatch(roomId, batchNumber);
                    break;
                case 'checkBatchRefresh':
                    if (!roomId) {
                        throw new types_1.ValidationError('roomId is required for checkBatchRefresh');
                    }
                    result = await this.checkBatchRefreshNeeded(roomId);
                    break;
                case 'preloadNextBatch':
                    if (!roomId) {
                        throw new types_1.ValidationError('roomId is required for preloadNextBatch');
                    }
                    result = await this.preloadNextBatch(roomId);
                    break;
                case 'cleanupCache':
                    if (!roomId) {
                        throw new types_1.ValidationError('roomId is required for cleanupCache');
                    }
                    result = await this.cleanupRoomCache(roomId);
                    break;
                case 'scheduleCleanup':
                    if (!roomId) {
                        throw new types_1.ValidationError('roomId is required for scheduleCleanup');
                    }
                    result = await this.scheduleCleanup(roomId, delayHours || 1);
                    break;
                default:
                    throw new types_1.ValidationError(`Unknown action: ${action}`);
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
        }
        catch (error) {
            this.logger.error(`❌ Error in Trinity Cache Lambda:`, error);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    success: false,
                    error: error.message,
                    action: event.action || 'unknown',
                    timestamp: new Date().toISOString()
                })
            };
        }
    }
    /**
     * Create room cache with exactly 50 movies using business logic (JavaScript Lambda compatibility)
     */
    async createRoomCache(roomId, filterCriteria) {
        this.logger.info('🎬 Creating room cache with business logic', { roomId, filterCriteria });
        try {
            // Validate filter criteria
            this.validateFilterCriteria(filterCriteria);
            // Check if cache already exists
            const existingMetadata = await this.db.get(this.config.tables.roomCacheMetadata, { roomId });
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
                throw new types_1.TrinityError('No movies found matching filter criteria with business logic requirements', 'NO_MOVIES_FOUND', 404);
            }
            // Ensure exactly 50 movies
            if (movieSet.movies.length !== this.moviesPerRoom) {
                throw new types_1.TrinityError(`Business logic error: Expected exactly ${this.moviesPerRoom} movies, got ${movieSet.movies.length}`, 'INVALID_MOVIE_COUNT', 500);
            }
            this.logger.info(`Created movie set with ${movieSet.movies.length} movies using business logic`);
            // Calculate TTL (7 days from now)
            const ttl = base_handler_2.HandlerUtils.calculateTTL(this.config.app.cache.ttlDays);
            const now = new Date().toISOString();
            // Store movie set in cache table with sequence indexing (0-49)
            const cacheItems = movieSet.movies.map((movie, index) => ({
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
                operation: 'PUT',
                item,
            }));
            await this.db.batchWrite(batchItems);
            // Create cache metadata with business logic tracking
            const metadata = {
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
                movieIds: movieSet.movies.map((movie) => movie.movieId)
            };
        }
        catch (error) {
            this.logger.error('❌ Failed to create room cache', error, { roomId });
            throw error;
        }
    }
    /**
     * Get next movie with end-game handling (JavaScript Lambda compatibility)
     */
    async getNextMovie(roomId, userId) {
        this.logger.info(`Getting next movie for room ${roomId}, user ${userId}`);
        try {
            // Get current metadata to check progress
            const metadata = await this.db.get(this.config.tables.roomCacheMetadata, { roomId });
            if (!metadata) {
                throw new types_1.TrinityError(`No cache metadata found for room ${roomId}`, 'CACHE_NOT_FOUND', 404);
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
            const movie = await this.db.get(this.config.tables.roomMovieCache, { roomId, sequenceIndex: currentIndex });
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
        }
        catch (error) {
            this.logger.error('❌ Error getting next movie', error, { roomId, userId });
            throw error;
        }
    }
    /**
     * Get current movie index (JavaScript Lambda compatibility)
     */
    async getCurrentMovieIndex(roomId) {
        try {
            return await this.getCurrentSequenceIndex(roomId);
        }
        catch (error) {
            this.logger.error(`❌ Error getting current index for room ${roomId}:`, error);
            return 0;
        }
    }
    /**
     * Get cache metadata (JavaScript Lambda compatibility)
     */
    async getCacheMetadata(roomId) {
        try {
            const metadata = await this.db.get(this.config.tables.roomCacheMetadata, { roomId });
            return metadata || null;
        }
        catch (error) {
            this.logger.error(`❌ Error getting cache metadata for room ${roomId}:`, error);
            return null;
        }
    }
    /**
     * Load movie batch (JavaScript Lambda compatibility)
     */
    async loadMovieBatch(roomId, batchNumber) {
        this.logger.info(`📦 Loading batch ${batchNumber} for room ${roomId}`);
        try {
            const metadata = await this.getCacheMetadata(roomId);
            if (!metadata) {
                throw new types_1.TrinityError(`No cache metadata found for room ${roomId}`, 'CACHE_NOT_FOUND', 404);
            }
            // For now, return empty batch as the main cache has 50 movies
            // This maintains compatibility with the existing JavaScript Lambda
            this.logger.info(`⚠️ No additional batches needed - room has ${this.moviesPerRoom} movies`);
            return { movies: [], batchNumber, totalMovies: 0 };
        }
        catch (error) {
            this.logger.error(`❌ Error loading batch ${batchNumber} for room ${roomId}:`, error);
            throw error;
        }
    }
    /**
     * Check if batch refresh is needed (JavaScript Lambda compatibility)
     */
    async checkBatchRefreshNeeded(roomId) {
        try {
            // With 50 movies per room, no additional batches are needed
            return false;
        }
        catch (error) {
            this.logger.error(`❌ Error checking batch refresh for room ${roomId}:`, error);
            return false;
        }
    }
    /**
     * Preload next batch (JavaScript Lambda compatibility)
     */
    async preloadNextBatch(roomId) {
        try {
            // With 50 movies per room, no additional batches are needed
            this.logger.info(`✅ No additional batches needed for room ${roomId}`);
        }
        catch (error) {
            this.logger.error(`❌ Error preloading next batch for room ${roomId}:`, error);
            // Don't throw - preloading failure shouldn't break current flow
        }
    }
    /**
     * Cleanup room cache (JavaScript Lambda compatibility)
     */
    async cleanupRoomCache(roomId) {
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
                    operation: 'DELETE',
                    key: { roomId: item.roomId, sequenceIndex: item.sequenceIndex },
                }));
                await this.db.batchWrite(deleteItems);
            }
            // Delete metadata
            await this.db.delete(this.config.tables.roomCacheMetadata, { roomId });
            this.logger.info(`Cache cleanup completed for room ${roomId}`);
        }
        catch (error) {
            this.logger.error(`❌ Error cleaning up cache for room ${roomId}`, error);
            throw error;
        }
    }
    /**
     * Schedule cleanup (JavaScript Lambda compatibility)
     */
    async scheduleCleanup(roomId, delayHours = 1) {
        this.logger.info(`⏰ Scheduling cleanup for room ${roomId} in ${delayHours} hours`);
        try {
            const metadata = await this.getCacheMetadata(roomId);
            if (!metadata)
                return;
            const cleanupTime = new Date(Date.now() + (delayHours * 60 * 60 * 1000)).toISOString();
            const updatedMetadata = {
                ...metadata,
                status: 'EXPIRED',
                updatedAt: new Date().toISOString()
            };
            await this.db.put(this.config.tables.roomCacheMetadata, updatedMetadata);
            this.logger.info(`✅ Cleanup scheduled for room ${roomId} at ${cleanupTime}`);
        }
        catch (error) {
            this.logger.error(`❌ Error scheduling cleanup for room ${roomId}:`, error);
            throw error;
        }
    }
    /**
     * Create movie cache for a room with 50 movies (AppSync GraphQL)
     */
    async createCache(args) {
        this.validateArgs(args, ['roomId', 'filterCriteria']);
        return this.createRoomCache(args.roomId, args.filterCriteria);
    }
    /**
     * Get cached movies for a room (AppSync GraphQL)
     */
    async getCache(args) {
        this.validateArgs(args, ['roomId']);
        if (args.sequenceIndex !== undefined) {
            // Get specific movie by sequence index
            const movie = await this.db.get(this.config.tables.roomMovieCache, { roomId: args.roomId, sequenceIndex: args.sequenceIndex });
            return movie ? [movie] : [];
        }
        else {
            // Get all cached movies for room
            const result = await this.db.query(this.config.tables.roomMovieCache, 'roomId = :roomId', {
                expressionAttributeValues: { ':roomId': args.roomId },
                scanIndexForward: true, // Ensure deterministic order
            });
            return result.items;
        }
    }
    /**
     * Refresh cache for a room (AppSync GraphQL)
     */
    async refreshCache(args) {
        this.validateArgs(args, ['roomId']);
        // Get existing cache metadata
        const existingMetadata = await this.db.get(this.config.tables.roomCacheMetadata, { roomId: args.roomId });
        if (!existingMetadata) {
            throw new types_1.ValidationError('Cache metadata not found for room');
        }
        // Clear existing cache
        const existingCache = await this.getCache({ roomId: args.roomId });
        if (existingCache.length > 0) {
            const deleteItems = existingCache.map(item => ({
                tableName: this.config.tables.roomMovieCache,
                operation: 'DELETE',
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
    async getCacheStatus(args) {
        this.validateArgs(args, ['roomId']);
        const metadata = await this.db.get(this.config.tables.roomCacheMetadata, { roomId: args.roomId });
        if (!metadata) {
            throw new types_1.ValidationError('Cache not found for room');
        }
        return metadata;
    }
    /**
     * Get all movies for a room (AppSync GraphQL convenience method)
     */
    async getRoomMovies(args) {
        const cacheItems = await this.getCache({ roomId: args.roomId });
        return cacheItems.map(item => item.movieData);
    }
    // Business Logic Methods
    /**
     * Create movie set with exactly 50 movies using business logic
     */
    async createMovieSetWithBusinessLogic(filterCriteria) {
        this.logger.info(`🎬 Creating movie set with business logic:`, filterCriteria);
        try {
            // Step 1: Fetch movies from TMDB with filters
            let allMovies = await this.fetchMoviesWithFilters(filterCriteria);
            if (allMovies.length === 0) {
                throw new types_1.TrinityError('No movies found matching filter criteria', 'NO_MOVIES_FOUND', 404);
            }
            this.logger.debug(`📦 Fetched ${allMovies.length} movies from TMDB`);
            // Step 2: Apply western language filter (business requirement)
            allMovies = this.applyWesternLanguageFilter(allMovies);
            this.logger.debug(`🌍 After western language filter: ${allMovies.length} movies`);
            // Step 3: Apply description requirement filter (business requirement)
            allMovies = this.applyDescriptionFilter(allMovies);
            this.logger.debug(`📝 After description filter: ${allMovies.length} movies`);
            if (allMovies.length === 0) {
                throw new types_1.TrinityError('No movies found after applying business logic filters (western languages + descriptions)', 'NO_MOVIES_FOUND', 404);
            }
            // Step 4: Apply genre prioritization algorithm (business requirement)
            allMovies = this.prioritizeByGenres(allMovies, filterCriteria.genreIds);
            this.logger.debug(`🎯 After genre prioritization: ${allMovies.length} movies`);
            // Step 5: Randomize within filter constraints and select exactly 50
            const selectedMovies = this.randomizeAndSelect(allMovies, this.moviesPerRoom);
            if (selectedMovies.length !== this.moviesPerRoom) {
                throw new types_1.TrinityError(`Business logic error: Expected exactly ${this.moviesPerRoom} movies, got ${selectedMovies.length}`, 'INVALID_MOVIE_COUNT', 500);
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
                priority: movie.genrePriority || 1,
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
        }
        catch (error) {
            this.logger.error(`❌ Error creating movie set with business logic:`, error);
            throw error;
        }
    }
    /**
     * Fetch movies from TMDB with media type and genre filters
     */
    async fetchMoviesWithFilters(filterCriteria) {
        try {
            const endpoint = filterCriteria.mediaType === 'MOVIE' ? 'movie' : 'tv';
            const movies = [];
            let page = 1;
            const maxPages = 10; // Fetch more pages to ensure we have enough after filtering
            const targetMovies = this.moviesPerRoom * 3; // Fetch 3x more to account for filtering
            while (movies.length < targetMovies && page <= maxPages) {
                const params = {
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
                if (page > (response.total_pages || 1))
                    break;
            }
            // Remove duplicates
            const uniqueMovies = this.removeDuplicates(movies);
            this.logger.debug(`📦 Fetched ${uniqueMovies.length} unique movies from TMDB`);
            return uniqueMovies;
        }
        catch (error) {
            this.logger.error(`❌ Error fetching movies from TMDB:`, error);
            throw error;
        }
    }
    /**
     * Apply western language filter (business requirement)
     */
    applyWesternLanguageFilter(movies) {
        const filtered = movies.filter(movie => {
            const language = movie.original_language;
            if (!language)
                return false;
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
    applyDescriptionFilter(movies) {
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
            }
            else if (hasAnyGenre) {
                priority = 2; // Medium priority - has some genres
            }
            else {
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
    randomizeAndSelect(movies, count) {
        if (movies.length <= count) {
            // If we have fewer movies than needed, return all and log warning
            this.logger.warn(`⚠️ Only ${movies.length} movies available, need ${count}. Returning all available.`);
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
        this.logger.debug(`🎲 Selected ${selected.length} movies: ${fromP1} from priority 1, ${Math.min(shuffledP2.length, remaining)} from priority 2, ${Math.min(shuffledP3.length, stillRemaining)} from priority 3`);
        return selected;
    }
    /**
     * Remove duplicate movies based on ID
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
        this.logger.debug(`🔄 Removed duplicates: ${movies.length} -> ${uniqueMovies.length} movies`);
        return uniqueMovies;
    }
    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    shuffleArray(array) {
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
    async getCurrentSequenceIndex(roomId) {
        try {
            const metadata = await this.db.get(this.config.tables.roomCacheMetadata, { roomId });
            return metadata?.currentIndex || 0;
        }
        catch (error) {
            this.logger.error(`❌ Error getting current sequence index for room ${roomId}:`, error);
            return 0;
        }
    }
    /**
     * Atomically increment current index for a room
     */
    async incrementCurrentIndex(roomId) {
        try {
            await this.db.update(this.config.tables.roomCacheMetadata, { roomId }, 'ADD currentIndex :inc SET updatedAt = :now', {
                expressionAttributeValues: {
                    ':inc': 1,
                    ':now': new Date().toISOString()
                },
                conditionExpression: 'attribute_exists(roomId)'
            });
        }
        catch (error) {
            this.logger.error(`❌ Error incrementing current index for room ${roomId}:`, error);
            throw error;
        }
    }
    /**
     * Validate filter criteria according to business logic
     */
    validateFilterCriteria(filterCriteria) {
        if (!filterCriteria) {
            throw new types_1.ValidationError('Filter criteria is required');
        }
        // Media type validation - must be MOVIE or TV (exclusive)
        if (!filterCriteria.mediaType || !['MOVIE', 'TV'].includes(filterCriteria.mediaType)) {
            throw new types_1.ValidationError('Media type must be either MOVIE or TV (exclusive selection)');
        }
        // Genre validation - must have 0, 1, or 2 genres
        if (!filterCriteria.genreIds || !Array.isArray(filterCriteria.genreIds)) {
            throw new types_1.ValidationError('Genre IDs must be provided as an array');
        }
        if (filterCriteria.genreIds.length > 2) {
            throw new types_1.ValidationError('Must select 0, 1, or 2 genres (0 = popular movies, 1-2 = specific genres)');
        }
        // Validate genre IDs are numbers
        if (!filterCriteria.genreIds.every(id => typeof id === 'number' && id > 0)) {
            throw new types_1.ValidationError('Genre IDs must be positive numbers');
        }
        // Room capacity validation
        if (filterCriteria.roomCapacity && (typeof filterCriteria.roomCapacity !== 'number' || filterCriteria.roomCapacity < 2)) {
            throw new types_1.ValidationError('Room capacity must be a number >= 2');
        }
    }
    /**
     * Make HTTP request to TMDB API
     */
    async makeRequest(endpoint, params = {}) {
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
                throw new types_1.TrinityError(`TMDB API error: ${response.status} ${response.statusText}`, 'TMDB_API_ERROR', response.status);
            }
            return await response.json();
        }
        catch (error) {
            this.logger.error('❌ TMDB API request failed', error, { endpoint, params });
            if (error.name === 'AbortError') {
                throw new types_1.TrinityError('TMDB API request timeout', 'TMDB_TIMEOUT', 408);
            }
            throw error;
        }
    }
    /**
     * Transform TMDB movie/TV show to Trinity format
     */
    transformToTrinityMovie(item, mediaType) {
        const isMovie = mediaType === 'MOVIE';
        const movieItem = item;
        const tvItem = item;
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
exports.handler = (0, base_handler_1.createHandler)(CacheHandler);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGUtaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNhY2hlLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7OztHQUtHOzs7QUFFSCxpREFBNEQ7QUFDNUQsMkNBQTJMO0FBQzNMLGlEQUE4QztBQThCOUMsTUFBTSxZQUFhLFNBQVEsMEJBQVc7SUFBdEM7O1FBQ1UsZ0JBQVcsR0FBRyw4QkFBOEIsQ0FBQztRQUM3QyxxQkFBZ0IsR0FBRyxpQ0FBaUMsQ0FBQztRQUNyRCxrQkFBYSxHQUFHLEVBQUUsQ0FBQyxDQUFDLG1EQUFtRDtRQUUvRSw2REFBNkQ7UUFDckQscUJBQWdCLEdBQUcsSUFBSSxHQUFHLENBQUM7WUFDakMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJO1lBQ3RFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJO1lBQ2hFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJO1NBQ2pFLENBQUMsQ0FBQztJQWsrQkwsQ0FBQztJQWgrQkMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFpQztRQUM1QyxvRUFBb0U7UUFDcEUsSUFBSSxRQUFRLElBQUksS0FBSyxFQUFFLENBQUM7WUFDdEIsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBb0IsQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFFRCxvQ0FBb0M7UUFDcEMsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLDJC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LENBQUMsTUFBTSxDQUFDLGNBQWM7WUFDckUsVUFBVSxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUztZQUN4RixZQUFZLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQzlGLFFBQVEsRUFBRSxJQUFJLENBQUMsU0FBUztZQUN4QixXQUFXLEVBQUUsSUFBSSxDQUFDLFlBQVk7WUFDOUIsU0FBUyxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQzFCLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMzQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLGlCQUFpQjtZQUN4QyxTQUFTO1NBQ1YsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQUVELHFCQUFxQjtBQUNSLFFBQUEsT0FBTyxHQUFHLElBQUEsNEJBQWEsRUFBQyxZQUFZLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBUcmluaXR5IENhY2hlIEhhbmRsZXJcclxuICogSGFuZGxlcyBtb3ZpZSBjYWNoaW5nIGxvZ2ljIHdpdGggZGV0ZXJtaW5pc3RpYyBvcmRlcmluZyBhbmQgYnVzaW5lc3MgbG9naWNcclxuICogSW1wbGVtZW50cyBleGFjdGx5IDUwIG1vdmllcyBwZXIgcm9vbSB3aXRoIHdlc3Rlcm4gbGFuZ3VhZ2UgZmlsdGVyaW5nLFxyXG4gKiBkZXNjcmlwdGlvbiByZXF1aXJlbWVudHMsIGFuZCBnZW5yZSBwcmlvcml0aXphdGlvbiBhbGdvcml0aG1cclxuICovXHJcblxyXG5pbXBvcnQgeyBCYXNlSGFuZGxlciwgY3JlYXRlSGFuZGxlciB9IGZyb20gJy4vYmFzZS1oYW5kbGVyJztcclxuaW1wb3J0IHsgQXBwU3luY0V2ZW50LCBUcmluaXR5TW92aWVDYWNoZSwgQ2FjaGVNZXRhZGF0YSwgRmlsdGVyQ3JpdGVyaWEsIFRyaW5pdHlNb3ZpZSwgVE1EQkRpc2NvdmVyUmVzcG9uc2UsIFRNREJNb3ZpZSwgVE1EQlRWU2hvdywgVmFsaWRhdGlvbkVycm9yLCBUcmluaXR5RXJyb3IgfSBmcm9tICcuLi9zaGFyZWQvdHlwZXMnO1xyXG5pbXBvcnQgeyBIYW5kbGVyVXRpbHMgfSBmcm9tICcuL2Jhc2UtaGFuZGxlcic7XHJcblxyXG4vLyBMYW1iZGEgZXZlbnQgaW50ZXJmYWNlcyBmb3IgZGlyZWN0IGludm9jYXRpb25cclxuaW50ZXJmYWNlIExhbWJkYUV2ZW50IHtcclxuICBhY3Rpb246IHN0cmluZztcclxuICByb29tSWQ/OiBzdHJpbmc7XHJcbiAgZmlsdGVyQ3JpdGVyaWE/OiBGaWx0ZXJDcml0ZXJpYTtcclxuICBiYXRjaE51bWJlcj86IG51bWJlcjtcclxuICBkZWxheUhvdXJzPzogbnVtYmVyO1xyXG4gIHVzZXJJZD86IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIENyZWF0ZUNhY2hlQXJncyB7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgZmlsdGVyQ3JpdGVyaWE6IEZpbHRlckNyaXRlcmlhO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2V0Q2FjaGVBcmdzIHtcclxuICByb29tSWQ6IHN0cmluZztcclxuICBzZXF1ZW5jZUluZGV4PzogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgUmVmcmVzaENhY2hlQXJncyB7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBHZXRDYWNoZVN0YXR1c0FyZ3Mge1xyXG4gIHJvb21JZDogc3RyaW5nO1xyXG59XHJcblxyXG5jbGFzcyBDYWNoZUhhbmRsZXIgZXh0ZW5kcyBCYXNlSGFuZGxlciB7XHJcbiAgcHJpdmF0ZSB0bWRiQmFzZVVybCA9ICdodHRwczovL2FwaS50aGVtb3ZpZWRiLm9yZy8zJztcclxuICBwcml2YXRlIHRtZGJJbWFnZUJhc2VVcmwgPSAnaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMCc7XHJcbiAgcHJpdmF0ZSBtb3ZpZXNQZXJSb29tID0gNTA7IC8vIEJ1c2luZXNzIHJlcXVpcmVtZW50OiBleGFjdGx5IDUwIG1vdmllcyBwZXIgcm9vbVxyXG4gIFxyXG4gIC8vIFdlc3Rlcm4gbGFuZ3VhZ2VzIChJU08gNjM5LTEgY29kZXMpIC0gQnVzaW5lc3MgcmVxdWlyZW1lbnRcclxuICBwcml2YXRlIHdlc3Rlcm5MYW5ndWFnZXMgPSBuZXcgU2V0KFtcclxuICAgICdlbicsICdlcycsICdmcicsICdkZScsICdpdCcsICdwdCcsICdubCcsICdzdicsICdubycsICdkYScsICdmaScsICdpcycsXHJcbiAgICAncGwnLCAnY3MnLCAnc2snLCAnaHUnLCAncm8nLCAnYmcnLCAnaHInLCAnc2wnLCAnZXQnLCAnbHYnLCAnbHQnLFxyXG4gICAgJ210JywgJ2dhJywgJ2N5JywgJ2V1JywgJ2NhJywgJ2dsJywgJ29jJywgJ3JtJywgJ2xiJywgJ2ZvJywgJ2tsJ1xyXG4gIF0pO1xyXG5cclxuICBhc3luYyBoYW5kbGUoZXZlbnQ6IEFwcFN5bmNFdmVudCB8IExhbWJkYUV2ZW50KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIC8vIEhhbmRsZSBkaXJlY3QgTGFtYmRhIGludm9jYXRpb24gKGZyb20gZXhpc3RpbmcgSmF2YVNjcmlwdCBMYW1iZGEpXHJcbiAgICBpZiAoJ2FjdGlvbicgaW4gZXZlbnQpIHtcclxuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTGFtYmRhRXZlbnQoZXZlbnQgYXMgTGFtYmRhRXZlbnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEhhbmRsZSBBcHBTeW5jIEdyYXBoUUwgaW52b2NhdGlvblxyXG4gICAgY29uc3QgeyBmaWVsZE5hbWUgfSA9IEhhbmRsZXJVdGlscy5nZXRPcGVyYXRpb25JbmZvKGV2ZW50IGFzIEFwcFN5bmNFdmVudCk7XHJcbiAgICBjb25zdCB7IHVzZXJJZCB9ID0gSGFuZGxlclV0aWxzLmdldFVzZXJJbmZvKGV2ZW50IGFzIEFwcFN5bmNFdmVudCk7XHJcblxyXG4gICAgdGhpcy5sb2dnZXIuaW5mbyhg8J+SviBDYWNoZSBvcGVyYXRpb246ICR7ZmllbGROYW1lfWAsIHsgdXNlcklkLCBmaWVsZE5hbWUgfSk7XHJcblxyXG4gICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcclxuICAgICAgY2FzZSAnY3JlYXRlQ2FjaGUnOlxyXG4gICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZUNhY2hlKChldmVudCBhcyBBcHBTeW5jRXZlbnQpLmFyZ3VtZW50cyBhcyBDcmVhdGVDYWNoZUFyZ3MpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnZ2V0Q2FjaGUnOlxyXG4gICAgICAgIHJldHVybiB0aGlzLmdldENhY2hlKChldmVudCBhcyBBcHBTeW5jRXZlbnQpLmFyZ3VtZW50cyBhcyBHZXRDYWNoZUFyZ3MpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAncmVmcmVzaENhY2hlJzpcclxuICAgICAgICByZXR1cm4gdGhpcy5yZWZyZXNoQ2FjaGUoKGV2ZW50IGFzIEFwcFN5bmNFdmVudCkuYXJndW1lbnRzIGFzIFJlZnJlc2hDYWNoZUFyZ3MpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnZ2V0Q2FjaGVTdGF0dXMnOlxyXG4gICAgICAgIHJldHVybiB0aGlzLmdldENhY2hlU3RhdHVzKChldmVudCBhcyBBcHBTeW5jRXZlbnQpLmFyZ3VtZW50cyBhcyBHZXRDYWNoZVN0YXR1c0FyZ3MpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnZ2V0Um9vbU1vdmllcyc6XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Um9vbU1vdmllcygoZXZlbnQgYXMgQXBwU3luY0V2ZW50KS5hcmd1bWVudHMgYXMgeyByb29tSWQ6IHN0cmluZyB9KTtcclxuICAgICAgXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcihgVW5rbm93biBjYWNoZSBvcGVyYXRpb246ICR7ZmllbGROYW1lfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSGFuZGxlIGRpcmVjdCBMYW1iZGEgaW52b2NhdGlvbiAoY29tcGF0aWJpbGl0eSB3aXRoIGV4aXN0aW5nIEphdmFTY3JpcHQgTGFtYmRhKVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlTGFtYmRhRXZlbnQoZXZlbnQ6IExhbWJkYUV2ZW50KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIHRoaXMubG9nZ2VyLmluZm8oJ/CfjqwgVHJpbml0eSBDYWNoZSBMYW1iZGEgaW52b2tlZDonLCBldmVudCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgeyBhY3Rpb24sIHJvb21JZCwgZmlsdGVyQ3JpdGVyaWEsIGJhdGNoTnVtYmVyLCBkZWxheUhvdXJzLCB1c2VySWQgfSA9IGV2ZW50O1xyXG4gICAgICBsZXQgcmVzdWx0O1xyXG5cclxuICAgICAgc3dpdGNoIChhY3Rpb24pIHtcclxuICAgICAgICBjYXNlICdjcmVhdGVDYWNoZSc6XHJcbiAgICAgICAgICBpZiAoIXJvb21JZCB8fCAhZmlsdGVyQ3JpdGVyaWEpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcigncm9vbUlkIGFuZCBmaWx0ZXJDcml0ZXJpYSBhcmUgcmVxdWlyZWQgZm9yIGNyZWF0ZUNhY2hlJyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmNyZWF0ZVJvb21DYWNoZShyb29tSWQsIGZpbHRlckNyaXRlcmlhKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICBjYXNlICdnZXROZXh0TW92aWUnOlxyXG4gICAgICAgICAgaWYgKCFyb29tSWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcigncm9vbUlkIGlzIHJlcXVpcmVkIGZvciBnZXROZXh0TW92aWUnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2V0TmV4dE1vdmllKHJvb21JZCwgdXNlcklkKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICBjYXNlICdnZXRDdXJyZW50SW5kZXgnOlxyXG4gICAgICAgICAgaWYgKCFyb29tSWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcigncm9vbUlkIGlzIHJlcXVpcmVkIGZvciBnZXRDdXJyZW50SW5kZXgnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2V0Q3VycmVudE1vdmllSW5kZXgocm9vbUlkKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICBjYXNlICdnZXRDYWNoZU1ldGFkYXRhJzpcclxuICAgICAgICAgIGlmICghcm9vbUlkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoJ3Jvb21JZCBpcyByZXF1aXJlZCBmb3IgZ2V0Q2FjaGVNZXRhZGF0YScpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRDYWNoZU1ldGFkYXRhKHJvb21JZCk7XHJcbiAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgY2FzZSAnbG9hZEJhdGNoJzpcclxuICAgICAgICAgIGlmICghcm9vbUlkIHx8ICFiYXRjaE51bWJlcikge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgVmFsaWRhdGlvbkVycm9yKCdyb29tSWQgYW5kIGJhdGNoTnVtYmVyIGFyZSByZXF1aXJlZCBmb3IgbG9hZEJhdGNoJyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmxvYWRNb3ZpZUJhdGNoKHJvb21JZCwgYmF0Y2hOdW1iZXIpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgIGNhc2UgJ2NoZWNrQmF0Y2hSZWZyZXNoJzpcclxuICAgICAgICAgIGlmICghcm9vbUlkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoJ3Jvb21JZCBpcyByZXF1aXJlZCBmb3IgY2hlY2tCYXRjaFJlZnJlc2gnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuY2hlY2tCYXRjaFJlZnJlc2hOZWVkZWQocm9vbUlkKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICBjYXNlICdwcmVsb2FkTmV4dEJhdGNoJzpcclxuICAgICAgICAgIGlmICghcm9vbUlkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoJ3Jvb21JZCBpcyByZXF1aXJlZCBmb3IgcHJlbG9hZE5leHRCYXRjaCcpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5wcmVsb2FkTmV4dEJhdGNoKHJvb21JZCk7XHJcbiAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgY2FzZSAnY2xlYW51cENhY2hlJzpcclxuICAgICAgICAgIGlmICghcm9vbUlkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoJ3Jvb21JZCBpcyByZXF1aXJlZCBmb3IgY2xlYW51cENhY2hlJyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmNsZWFudXBSb29tQ2FjaGUocm9vbUlkKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICBjYXNlICdzY2hlZHVsZUNsZWFudXAnOlxyXG4gICAgICAgICAgaWYgKCFyb29tSWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcigncm9vbUlkIGlzIHJlcXVpcmVkIGZvciBzY2hlZHVsZUNsZWFudXAnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZWR1bGVDbGVhbnVwKHJvb21JZCwgZGVsYXlIb3VycyB8fCAxKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcihgVW5rbm93biBhY3Rpb246ICR7YWN0aW9ufWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKGDinIUgQWN0aW9uICR7YWN0aW9ufSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5YCk7XHJcblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgICAgYWN0aW9uLFxyXG4gICAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgICB9KVxyXG4gICAgICB9O1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGDinYwgRXJyb3IgaW4gVHJpbml0eSBDYWNoZSBMYW1iZGE6YCwgZXJyb3IgYXMgRXJyb3IpO1xyXG5cclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgICBlcnJvcjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlLFxyXG4gICAgICAgICAgYWN0aW9uOiBldmVudC5hY3Rpb24gfHwgJ3Vua25vd24nLFxyXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgICB9KVxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIHJvb20gY2FjaGUgd2l0aCBleGFjdGx5IDUwIG1vdmllcyB1c2luZyBidXNpbmVzcyBsb2dpYyAoSmF2YVNjcmlwdCBMYW1iZGEgY29tcGF0aWJpbGl0eSlcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGNyZWF0ZVJvb21DYWNoZShyb29tSWQ6IHN0cmluZywgZmlsdGVyQ3JpdGVyaWE6IEZpbHRlckNyaXRlcmlhKTogUHJvbWlzZTxhbnk+IHtcclxuICAgIHRoaXMubG9nZ2VyLmluZm8oJ/CfjqwgQ3JlYXRpbmcgcm9vbSBjYWNoZSB3aXRoIGJ1c2luZXNzIGxvZ2ljJywgeyByb29tSWQsIGZpbHRlckNyaXRlcmlhIH0pO1xyXG4gICAgXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBWYWxpZGF0ZSBmaWx0ZXIgY3JpdGVyaWFcclxuICAgICAgdGhpcy52YWxpZGF0ZUZpbHRlckNyaXRlcmlhKGZpbHRlckNyaXRlcmlhKTtcclxuICAgICAgXHJcbiAgICAgIC8vIENoZWNrIGlmIGNhY2hlIGFscmVhZHkgZXhpc3RzXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nTWV0YWRhdGEgPSBhd2FpdCB0aGlzLmRiLmdldDxDYWNoZU1ldGFkYXRhPihcclxuICAgICAgICB0aGlzLmNvbmZpZy50YWJsZXMucm9vbUNhY2hlTWV0YWRhdGEsXHJcbiAgICAgICAgeyByb29tSWQgfVxyXG4gICAgICApO1xyXG4gICAgICBcclxuICAgICAgaWYgKGV4aXN0aW5nTWV0YWRhdGEgJiYgZXhpc3RpbmdNZXRhZGF0YS5zdGF0dXMgPT09ICdSRUFEWScpIHtcclxuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKGBDYWNoZSBhbHJlYWR5IGV4aXN0cyBmb3Igcm9vbSAke3Jvb21JZH1gKTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgICAgIG1lc3NhZ2U6ICdDYWNoZSBhbHJlYWR5IGV4aXN0cycsXHJcbiAgICAgICAgICBtZXRhZGF0YTogZXhpc3RpbmdNZXRhZGF0YVxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIENyZWF0ZSBtb3ZpZSBzZXQgd2l0aCBleGFjdGx5IDUwIG1vdmllcyB1c2luZyBidXNpbmVzcyBsb2dpY1xyXG4gICAgICBjb25zdCBtb3ZpZVNldCA9IGF3YWl0IHRoaXMuY3JlYXRlTW92aWVTZXRXaXRoQnVzaW5lc3NMb2dpYyhmaWx0ZXJDcml0ZXJpYSk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoIW1vdmllU2V0IHx8IG1vdmllU2V0Lm1vdmllcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgVHJpbml0eUVycm9yKCdObyBtb3ZpZXMgZm91bmQgbWF0Y2hpbmcgZmlsdGVyIGNyaXRlcmlhIHdpdGggYnVzaW5lc3MgbG9naWMgcmVxdWlyZW1lbnRzJywgJ05PX01PVklFU19GT1VORCcsIDQwNCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEVuc3VyZSBleGFjdGx5IDUwIG1vdmllc1xyXG4gICAgICBpZiAobW92aWVTZXQubW92aWVzLmxlbmd0aCAhPT0gdGhpcy5tb3ZpZXNQZXJSb29tKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IFRyaW5pdHlFcnJvcihgQnVzaW5lc3MgbG9naWMgZXJyb3I6IEV4cGVjdGVkIGV4YWN0bHkgJHt0aGlzLm1vdmllc1BlclJvb219IG1vdmllcywgZ290ICR7bW92aWVTZXQubW92aWVzLmxlbmd0aH1gLCAnSU5WQUxJRF9NT1ZJRV9DT1VOVCcsIDUwMCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMubG9nZ2VyLmluZm8oYENyZWF0ZWQgbW92aWUgc2V0IHdpdGggJHttb3ZpZVNldC5tb3ZpZXMubGVuZ3RofSBtb3ZpZXMgdXNpbmcgYnVzaW5lc3MgbG9naWNgKTtcclxuXHJcbiAgICAgIC8vIENhbGN1bGF0ZSBUVEwgKDcgZGF5cyBmcm9tIG5vdylcclxuICAgICAgY29uc3QgdHRsID0gSGFuZGxlclV0aWxzLmNhbGN1bGF0ZVRUTCh0aGlzLmNvbmZpZy5hcHAuY2FjaGUudHRsRGF5cyk7XHJcbiAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuXHJcbiAgICAgIC8vIFN0b3JlIG1vdmllIHNldCBpbiBjYWNoZSB0YWJsZSB3aXRoIHNlcXVlbmNlIGluZGV4aW5nICgwLTQ5KVxyXG4gICAgICBjb25zdCBjYWNoZUl0ZW1zOiBUcmluaXR5TW92aWVDYWNoZVtdID0gbW92aWVTZXQubW92aWVzLm1hcCgobW92aWU6IGFueSwgaW5kZXg6IG51bWJlcikgPT4gKHtcclxuICAgICAgICByb29tSWQsXHJcbiAgICAgICAgc2VxdWVuY2VJbmRleDogaW5kZXgsXHJcbiAgICAgICAgbW92aWVJZDogbW92aWUubW92aWVJZCxcclxuICAgICAgICBtb3ZpZURhdGE6IHtcclxuICAgICAgICAgIGlkOiBtb3ZpZS5tb3ZpZUlkLFxyXG4gICAgICAgICAgdGl0bGU6IG1vdmllLnRpdGxlLFxyXG4gICAgICAgICAgb3ZlcnZpZXc6IG1vdmllLm92ZXJ2aWV3LFxyXG4gICAgICAgICAgcmVsZWFzZURhdGU6IG1vdmllLnJlbGVhc2VEYXRlLFxyXG4gICAgICAgICAgcG9zdGVyUGF0aDogbW92aWUucG9zdGVyUGF0aCxcclxuICAgICAgICAgIGJhY2tkcm9wUGF0aDogbW92aWUuYmFja2Ryb3BQYXRoLFxyXG4gICAgICAgICAgZ2VucmVJZHM6IG1vdmllLmdlbnJlSWRzLFxyXG4gICAgICAgICAgdm90ZUF2ZXJhZ2U6IG1vdmllLnZvdGVBdmVyYWdlLFxyXG4gICAgICAgICAgdm90ZUNvdW50OiBtb3ZpZS52b3RlQ291bnQgfHwgMCxcclxuICAgICAgICAgIHBvcHVsYXJpdHk6IG1vdmllLnBvcHVsYXJpdHkgfHwgMCxcclxuICAgICAgICAgIGFkdWx0OiBtb3ZpZS5hZHVsdCB8fCBmYWxzZSxcclxuICAgICAgICAgIG9yaWdpbmFsTGFuZ3VhZ2U6IG1vdmllLm9yaWdpbmFsTGFuZ3VhZ2UsXHJcbiAgICAgICAgICBtZWRpYVR5cGU6IGZpbHRlckNyaXRlcmlhLm1lZGlhVHlwZSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIGJhdGNoTnVtYmVyOiBNYXRoLmZsb29yKGluZGV4IC8gdGhpcy5jb25maWcuYXBwLmNhY2hlLmJhdGNoU2l6ZSksXHJcbiAgICAgICAgY2FjaGVkQXQ6IG5vdyxcclxuICAgICAgICB0dGwsXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIC8vIEJhdGNoIHdyaXRlIGNhY2hlIGl0ZW1zXHJcbiAgICAgIGNvbnN0IGJhdGNoSXRlbXMgPSBjYWNoZUl0ZW1zLm1hcChpdGVtID0+ICh7XHJcbiAgICAgICAgdGFibGVOYW1lOiB0aGlzLmNvbmZpZy50YWJsZXMucm9vbU1vdmllQ2FjaGUsXHJcbiAgICAgICAgb3BlcmF0aW9uOiAnUFVUJyBhcyBjb25zdCxcclxuICAgICAgICBpdGVtLFxyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBhd2FpdCB0aGlzLmRiLmJhdGNoV3JpdGUoYmF0Y2hJdGVtcyk7XHJcblxyXG4gICAgICAvLyBDcmVhdGUgY2FjaGUgbWV0YWRhdGEgd2l0aCBidXNpbmVzcyBsb2dpYyB0cmFja2luZ1xyXG4gICAgICBjb25zdCBtZXRhZGF0YTogQ2FjaGVNZXRhZGF0YSA9IHtcclxuICAgICAgICByb29tSWQsXHJcbiAgICAgICAgc3RhdHVzOiAnUkVBRFknLFxyXG4gICAgICAgIG1vdmllQ291bnQ6IHRoaXMubW92aWVzUGVyUm9vbSxcclxuICAgICAgICBmaWx0ZXJDcml0ZXJpYToge1xyXG4gICAgICAgICAgLi4uZmlsdGVyQ3JpdGVyaWEsXHJcbiAgICAgICAgICByb29tSWQgLy8gTG9jayBmaWx0ZXIgY3JpdGVyaWEgdG8gcm9vbVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgY3JlYXRlZEF0OiBub3csXHJcbiAgICAgICAgdXBkYXRlZEF0OiBub3csXHJcbiAgICAgICAgdHRsLFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgYXdhaXQgdGhpcy5kYi5wdXQodGhpcy5jb25maWcudGFibGVzLnJvb21DYWNoZU1ldGFkYXRhLCBtZXRhZGF0YSk7XHJcblxyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKGBSb29tIGNhY2hlIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5IGZvciByb29tICR7cm9vbUlkfSB3aXRoICR7bW92aWVTZXQubW92aWVzLmxlbmd0aH0gbW92aWVzIHVzaW5nIGJ1c2luZXNzIGxvZ2ljYCk7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgICAgbWVzc2FnZTogJ0NhY2hlIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5IHdpdGggYnVzaW5lc3MgbG9naWMnLFxyXG4gICAgICAgIG1ldGFkYXRhLFxyXG4gICAgICAgIG1vdmllQ291bnQ6IG1vdmllU2V0Lm1vdmllcy5sZW5ndGgsXHJcbiAgICAgICAgbW92aWVJZHM6IG1vdmllU2V0Lm1vdmllcy5tYXAoKG1vdmllOiBhbnkpID0+IG1vdmllLm1vdmllSWQpXHJcbiAgICAgIH07XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gY3JlYXRlIHJvb20gY2FjaGUnLCBlcnJvciBhcyBFcnJvciwgeyByb29tSWQgfSk7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IG5leHQgbW92aWUgd2l0aCBlbmQtZ2FtZSBoYW5kbGluZyAoSmF2YVNjcmlwdCBMYW1iZGEgY29tcGF0aWJpbGl0eSlcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGdldE5leHRNb3ZpZShyb29tSWQ6IHN0cmluZywgdXNlcklkPzogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcclxuICAgIHRoaXMubG9nZ2VyLmluZm8oYEdldHRpbmcgbmV4dCBtb3ZpZSBmb3Igcm9vbSAke3Jvb21JZH0sIHVzZXIgJHt1c2VySWR9YCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gR2V0IGN1cnJlbnQgbWV0YWRhdGEgdG8gY2hlY2sgcHJvZ3Jlc3NcclxuICAgICAgY29uc3QgbWV0YWRhdGEgPSBhd2FpdCB0aGlzLmRiLmdldDxDYWNoZU1ldGFkYXRhPihcclxuICAgICAgICB0aGlzLmNvbmZpZy50YWJsZXMucm9vbUNhY2hlTWV0YWRhdGEsXHJcbiAgICAgICAgeyByb29tSWQgfVxyXG4gICAgICApO1xyXG4gICAgICBcclxuICAgICAgaWYgKCFtZXRhZGF0YSkge1xyXG4gICAgICAgIHRocm93IG5ldyBUcmluaXR5RXJyb3IoYE5vIGNhY2hlIG1ldGFkYXRhIGZvdW5kIGZvciByb29tICR7cm9vbUlkfWAsICdDQUNIRV9OT1RfRk9VTkQnLCA0MDQpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBHZXQgY3VycmVudCBpbmRleCBmcm9tIG1ldGFkYXRhIChzaW11bGF0aW5nIGF0b21pYyBpbmNyZW1lbnQpXHJcbiAgICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IGF3YWl0IHRoaXMuZ2V0Q3VycmVudFNlcXVlbmNlSW5kZXgocm9vbUlkKTtcclxuXHJcbiAgICAgIC8vIENoZWNrIGlmIHdlJ3ZlIHJlYWNoZWQgdGhlIGVuZFxyXG4gICAgICBpZiAoY3VycmVudEluZGV4ID49IHRoaXMubW92aWVzUGVyUm9vbSkge1xyXG4gICAgICAgIHRoaXMubG9nZ2VyLndhcm4oYEVuZCBvZiBzdWdnZXN0aW9ucyByZWFjaGVkIGZvciByb29tICR7cm9vbUlkfSAoJHtjdXJyZW50SW5kZXh9LyR7dGhpcy5tb3ZpZXNQZXJSb29tfSlgKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgaXNFbmRPZlN1Z2dlc3Rpb25zOiB0cnVlLFxyXG4gICAgICAgICAgbWVzc2FnZTogXCJFc2EgZXJhIG1pIMO6bHRpbWEgc3VnZXJlbmNpYS4gUHVlZGVzIGNyZWFyIG90cmEgc2FsYSBwYXJhIGNvbnRpbnVhci5cIixcclxuICAgICAgICAgIHRvdGFsTW92aWVzU2hvd246IGN1cnJlbnRJbmRleCxcclxuICAgICAgICAgIHRvdGFsTW92aWVzQXZhaWxhYmxlOiB0aGlzLm1vdmllc1BlclJvb20sXHJcbiAgICAgICAgICByb29tSWQ6IHJvb21JZFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEdldCBtb3ZpZSBhdCBjdXJyZW50IGluZGV4XHJcbiAgICAgIGNvbnN0IG1vdmllID0gYXdhaXQgdGhpcy5kYi5nZXQ8VHJpbml0eU1vdmllQ2FjaGU+KFxyXG4gICAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5yb29tTW92aWVDYWNoZSxcclxuICAgICAgICB7IHJvb21JZCwgc2VxdWVuY2VJbmRleDogY3VycmVudEluZGV4IH1cclxuICAgICAgKTtcclxuICAgICAgXHJcbiAgICAgIGlmICghbW92aWUpIHtcclxuICAgICAgICB0aGlzLmxvZ2dlci53YXJuKGBObyBtb3ZpZSBmb3VuZCBhdCBjdXJyZW50IGluZGV4ICR7Y3VycmVudEluZGV4fSBmb3Igcm9vbSAke3Jvb21JZH1gKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgaXNFbmRPZlN1Z2dlc3Rpb25zOiB0cnVlLFxyXG4gICAgICAgICAgbWVzc2FnZTogXCJFc2EgZXJhIG1pIMO6bHRpbWEgc3VnZXJlbmNpYS4gUHVlZGVzIGNyZWFyIG90cmEgc2FsYSBwYXJhIGNvbnRpbnVhci5cIixcclxuICAgICAgICAgIHRvdGFsTW92aWVzU2hvd246IGN1cnJlbnRJbmRleCxcclxuICAgICAgICAgIHRvdGFsTW92aWVzQXZhaWxhYmxlOiB0aGlzLm1vdmllc1BlclJvb20sXHJcbiAgICAgICAgICByb29tSWQ6IHJvb21JZFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEluY3JlbWVudCBjdXJyZW50IGluZGV4IGF0b21pY2FsbHlcclxuICAgICAgYXdhaXQgdGhpcy5pbmNyZW1lbnRDdXJyZW50SW5kZXgocm9vbUlkKTtcclxuXHJcbiAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYXBwcm9hY2hpbmcgdGhlIGVuZCAobGFzdCA1IG1vdmllcylcclxuICAgICAgY29uc3QgcmVtYWluaW5nTW92aWVzID0gdGhpcy5tb3ZpZXNQZXJSb29tIC0gKGN1cnJlbnRJbmRleCArIDEpO1xyXG4gICAgICBjb25zdCBpc05lYXJFbmQgPSByZW1haW5pbmdNb3ZpZXMgPD0gNSAmJiByZW1haW5pbmdNb3ZpZXMgPiAwO1xyXG5cclxuICAgICAgdGhpcy5sb2dnZXIuaW5mbyhgUmV0cmlldmVkIG1vdmllOiAke21vdmllLm1vdmllRGF0YS50aXRsZX0gKHNlcXVlbmNlOiAke21vdmllLnNlcXVlbmNlSW5kZXh9KSwgcmVtYWluaW5nOiAke3JlbWFpbmluZ01vdmllc31gKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHtcclxuICAgICAgICAuLi5tb3ZpZS5tb3ZpZURhdGEsXHJcbiAgICAgICAgc2VxdWVuY2VJbmRleDogbW92aWUuc2VxdWVuY2VJbmRleCxcclxuICAgICAgICB3YXJuaW5nTWVzc2FnZTogaXNOZWFyRW5kID8gYFF1ZWRhbiBzb2xvICR7cmVtYWluaW5nTW92aWVzfSBzdWdlcmVuY2lhcyBtw6FzLmAgOiB1bmRlZmluZWRcclxuICAgICAgfTtcclxuXHJcbiAgICAgIHJldHVybiByZXN1bHQ7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoJ+KdjCBFcnJvciBnZXR0aW5nIG5leHQgbW92aWUnLCBlcnJvciBhcyBFcnJvciwgeyByb29tSWQsIHVzZXJJZCB9KTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgY3VycmVudCBtb3ZpZSBpbmRleCAoSmF2YVNjcmlwdCBMYW1iZGEgY29tcGF0aWJpbGl0eSlcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGdldEN1cnJlbnRNb3ZpZUluZGV4KHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldEN1cnJlbnRTZXF1ZW5jZUluZGV4KHJvb21JZCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihg4p2MIEVycm9yIGdldHRpbmcgY3VycmVudCBpbmRleCBmb3Igcm9vbSAke3Jvb21JZH06YCwgZXJyb3IgYXMgRXJyb3IpO1xyXG4gICAgICByZXR1cm4gMDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBjYWNoZSBtZXRhZGF0YSAoSmF2YVNjcmlwdCBMYW1iZGEgY29tcGF0aWJpbGl0eSlcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGdldENhY2hlTWV0YWRhdGEocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPENhY2hlTWV0YWRhdGEgfCBudWxsPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHRoaXMuZGIuZ2V0PENhY2hlTWV0YWRhdGE+KFxyXG4gICAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5yb29tQ2FjaGVNZXRhZGF0YSxcclxuICAgICAgICB7IHJvb21JZCB9XHJcbiAgICAgICk7XHJcbiAgICAgIHJldHVybiBtZXRhZGF0YSB8fCBudWxsO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYOKdjCBFcnJvciBnZXR0aW5nIGNhY2hlIG1ldGFkYXRhIGZvciByb29tICR7cm9vbUlkfTpgLCBlcnJvciBhcyBFcnJvcik7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogTG9hZCBtb3ZpZSBiYXRjaCAoSmF2YVNjcmlwdCBMYW1iZGEgY29tcGF0aWJpbGl0eSlcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGxvYWRNb3ZpZUJhdGNoKHJvb21JZDogc3RyaW5nLCBiYXRjaE51bWJlcjogbnVtYmVyKTogUHJvbWlzZTxhbnk+IHtcclxuICAgIHRoaXMubG9nZ2VyLmluZm8oYPCfk6YgTG9hZGluZyBiYXRjaCAke2JhdGNoTnVtYmVyfSBmb3Igcm9vbSAke3Jvb21JZH1gKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHRoaXMuZ2V0Q2FjaGVNZXRhZGF0YShyb29tSWQpO1xyXG4gICAgICBpZiAoIW1ldGFkYXRhKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IFRyaW5pdHlFcnJvcihgTm8gY2FjaGUgbWV0YWRhdGEgZm91bmQgZm9yIHJvb20gJHtyb29tSWR9YCwgJ0NBQ0hFX05PVF9GT1VORCcsIDQwNCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEZvciBub3csIHJldHVybiBlbXB0eSBiYXRjaCBhcyB0aGUgbWFpbiBjYWNoZSBoYXMgNTAgbW92aWVzXHJcbiAgICAgIC8vIFRoaXMgbWFpbnRhaW5zIGNvbXBhdGliaWxpdHkgd2l0aCB0aGUgZXhpc3RpbmcgSmF2YVNjcmlwdCBMYW1iZGFcclxuICAgICAgdGhpcy5sb2dnZXIuaW5mbyhg4pqg77iPIE5vIGFkZGl0aW9uYWwgYmF0Y2hlcyBuZWVkZWQgLSByb29tIGhhcyAke3RoaXMubW92aWVzUGVyUm9vbX0gbW92aWVzYCk7XHJcbiAgICAgIHJldHVybiB7IG1vdmllczogW10sIGJhdGNoTnVtYmVyLCB0b3RhbE1vdmllczogMCB9O1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGDinYwgRXJyb3IgbG9hZGluZyBiYXRjaCAke2JhdGNoTnVtYmVyfSBmb3Igcm9vbSAke3Jvb21JZH06YCwgZXJyb3IgYXMgRXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrIGlmIGJhdGNoIHJlZnJlc2ggaXMgbmVlZGVkIChKYXZhU2NyaXB0IExhbWJkYSBjb21wYXRpYmlsaXR5KVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tCYXRjaFJlZnJlc2hOZWVkZWQocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIFdpdGggNTAgbW92aWVzIHBlciByb29tLCBubyBhZGRpdGlvbmFsIGJhdGNoZXMgYXJlIG5lZWRlZFxyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihg4p2MIEVycm9yIGNoZWNraW5nIGJhdGNoIHJlZnJlc2ggZm9yIHJvb20gJHtyb29tSWR9OmAsIGVycm9yIGFzIEVycm9yKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUHJlbG9hZCBuZXh0IGJhdGNoIChKYXZhU2NyaXB0IExhbWJkYSBjb21wYXRpYmlsaXR5KVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgcHJlbG9hZE5leHRCYXRjaChyb29tSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gV2l0aCA1MCBtb3ZpZXMgcGVyIHJvb20sIG5vIGFkZGl0aW9uYWwgYmF0Y2hlcyBhcmUgbmVlZGVkXHJcbiAgICAgIHRoaXMubG9nZ2VyLmluZm8oYOKchSBObyBhZGRpdGlvbmFsIGJhdGNoZXMgbmVlZGVkIGZvciByb29tICR7cm9vbUlkfWApO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoYOKdjCBFcnJvciBwcmVsb2FkaW5nIG5leHQgYmF0Y2ggZm9yIHJvb20gJHtyb29tSWR9OmAsIGVycm9yIGFzIEVycm9yKTtcclxuICAgICAgLy8gRG9uJ3QgdGhyb3cgLSBwcmVsb2FkaW5nIGZhaWx1cmUgc2hvdWxkbid0IGJyZWFrIGN1cnJlbnQgZmxvd1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2xlYW51cCByb29tIGNhY2hlIChKYXZhU2NyaXB0IExhbWJkYSBjb21wYXRpYmlsaXR5KVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgY2xlYW51cFJvb21DYWNoZShyb29tSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdGhpcy5sb2dnZXIuaW5mbyhgQ2xlYW5pbmcgdXAgY2FjaGUgZm9yIHJvb20gJHtyb29tSWR9YCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gR2V0IGNhY2hlIHNpemUgYmVmb3JlIGNsZWFudXAgZm9yIG1ldHJpY3NcclxuICAgICAgY29uc3QgbWV0YWRhdGEgPSBhd2FpdCB0aGlzLmdldENhY2hlTWV0YWRhdGEocm9vbUlkKTtcclxuICAgICAgY29uc3QgaXRlbXNUb0RlbGV0ZSA9IG1ldGFkYXRhID8gbWV0YWRhdGEubW92aWVDb3VudCA6IDA7XHJcblxyXG4gICAgICAvLyBEZWxldGUgYWxsIGNhY2hlIGVudHJpZXMgZm9yIHRoZSByb29tXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nQ2FjaGUgPSBhd2FpdCB0aGlzLmdldENhY2hlKHsgcm9vbUlkIH0pO1xyXG4gICAgICBcclxuICAgICAgaWYgKGV4aXN0aW5nQ2FjaGUubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGNvbnN0IGRlbGV0ZUl0ZW1zID0gZXhpc3RpbmdDYWNoZS5tYXAoaXRlbSA9PiAoe1xyXG4gICAgICAgICAgdGFibGVOYW1lOiB0aGlzLmNvbmZpZy50YWJsZXMucm9vbU1vdmllQ2FjaGUsXHJcbiAgICAgICAgICBvcGVyYXRpb246ICdERUxFVEUnIGFzIGNvbnN0LFxyXG4gICAgICAgICAga2V5OiB7IHJvb21JZDogaXRlbS5yb29tSWQsIHNlcXVlbmNlSW5kZXg6IGl0ZW0uc2VxdWVuY2VJbmRleCB9LFxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgYXdhaXQgdGhpcy5kYi5iYXRjaFdyaXRlKGRlbGV0ZUl0ZW1zKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRGVsZXRlIG1ldGFkYXRhXHJcbiAgICAgIGF3YWl0IHRoaXMuZGIuZGVsZXRlKHRoaXMuY29uZmlnLnRhYmxlcy5yb29tQ2FjaGVNZXRhZGF0YSwgeyByb29tSWQgfSk7XHJcbiAgICAgIFxyXG4gICAgICB0aGlzLmxvZ2dlci5pbmZvKGBDYWNoZSBjbGVhbnVwIGNvbXBsZXRlZCBmb3Igcm9vbSAke3Jvb21JZH1gKTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihg4p2MIEVycm9yIGNsZWFuaW5nIHVwIGNhY2hlIGZvciByb29tICR7cm9vbUlkfWAsIGVycm9yIGFzIEVycm9yKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTY2hlZHVsZSBjbGVhbnVwIChKYXZhU2NyaXB0IExhbWJkYSBjb21wYXRpYmlsaXR5KVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgc2NoZWR1bGVDbGVhbnVwKHJvb21JZDogc3RyaW5nLCBkZWxheUhvdXJzOiBudW1iZXIgPSAxKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLmxvZ2dlci5pbmZvKGDij7AgU2NoZWR1bGluZyBjbGVhbnVwIGZvciByb29tICR7cm9vbUlkfSBpbiAke2RlbGF5SG91cnN9IGhvdXJzYCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgbWV0YWRhdGEgPSBhd2FpdCB0aGlzLmdldENhY2hlTWV0YWRhdGEocm9vbUlkKTtcclxuICAgICAgaWYgKCFtZXRhZGF0YSkgcmV0dXJuO1xyXG5cclxuICAgICAgY29uc3QgY2xlYW51cFRpbWUgPSBuZXcgRGF0ZShEYXRlLm5vdygpICsgKGRlbGF5SG91cnMgKiA2MCAqIDYwICogMTAwMCkpLnRvSVNPU3RyaW5nKCk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCB1cGRhdGVkTWV0YWRhdGEgPSB7XHJcbiAgICAgICAgLi4ubWV0YWRhdGEsXHJcbiAgICAgICAgc3RhdHVzOiAnRVhQSVJFRCcgYXMgY29uc3QsXHJcbiAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgfTtcclxuXHJcbiAgICAgIGF3YWl0IHRoaXMuZGIucHV0KHRoaXMuY29uZmlnLnRhYmxlcy5yb29tQ2FjaGVNZXRhZGF0YSwgdXBkYXRlZE1ldGFkYXRhKTtcclxuICAgICAgXHJcbiAgICAgIHRoaXMubG9nZ2VyLmluZm8oYOKchSBDbGVhbnVwIHNjaGVkdWxlZCBmb3Igcm9vbSAke3Jvb21JZH0gYXQgJHtjbGVhbnVwVGltZX1gKTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihg4p2MIEVycm9yIHNjaGVkdWxpbmcgY2xlYW51cCBmb3Igcm9vbSAke3Jvb21JZH06YCwgZXJyb3IgYXMgRXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBtb3ZpZSBjYWNoZSBmb3IgYSByb29tIHdpdGggNTAgbW92aWVzIChBcHBTeW5jIEdyYXBoUUwpXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBjcmVhdGVDYWNoZShhcmdzOiBDcmVhdGVDYWNoZUFyZ3MpOiBQcm9taXNlPENhY2hlTWV0YWRhdGE+IHtcclxuICAgIHRoaXMudmFsaWRhdGVBcmdzPENyZWF0ZUNhY2hlQXJncz4oYXJncywgWydyb29tSWQnLCAnZmlsdGVyQ3JpdGVyaWEnXSk7XHJcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVSb29tQ2FjaGUoYXJncy5yb29tSWQsIGFyZ3MuZmlsdGVyQ3JpdGVyaWEpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGNhY2hlZCBtb3ZpZXMgZm9yIGEgcm9vbSAoQXBwU3luYyBHcmFwaFFMKVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZ2V0Q2FjaGUoYXJnczogR2V0Q2FjaGVBcmdzKTogUHJvbWlzZTxUcmluaXR5TW92aWVDYWNoZVtdPiB7XHJcbiAgICB0aGlzLnZhbGlkYXRlQXJnczxHZXRDYWNoZUFyZ3M+KGFyZ3MsIFsncm9vbUlkJ10pO1xyXG5cclxuICAgIGlmIChhcmdzLnNlcXVlbmNlSW5kZXggIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAvLyBHZXQgc3BlY2lmaWMgbW92aWUgYnkgc2VxdWVuY2UgaW5kZXhcclxuICAgICAgY29uc3QgbW92aWUgPSBhd2FpdCB0aGlzLmRiLmdldDxUcmluaXR5TW92aWVDYWNoZT4oXHJcbiAgICAgICAgdGhpcy5jb25maWcudGFibGVzLnJvb21Nb3ZpZUNhY2hlLFxyXG4gICAgICAgIHsgcm9vbUlkOiBhcmdzLnJvb21JZCwgc2VxdWVuY2VJbmRleDogYXJncy5zZXF1ZW5jZUluZGV4IH1cclxuICAgICAgKTtcclxuXHJcbiAgICAgIHJldHVybiBtb3ZpZSA/IFttb3ZpZV0gOiBbXTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIEdldCBhbGwgY2FjaGVkIG1vdmllcyBmb3Igcm9vbVxyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRiLnF1ZXJ5PFRyaW5pdHlNb3ZpZUNhY2hlPihcclxuICAgICAgICB0aGlzLmNvbmZpZy50YWJsZXMucm9vbU1vdmllQ2FjaGUsXHJcbiAgICAgICAgJ3Jvb21JZCA9IDpyb29tSWQnLFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgJzpyb29tSWQnOiBhcmdzLnJvb21JZCB9LFxyXG4gICAgICAgICAgc2NhbkluZGV4Rm9yd2FyZDogdHJ1ZSwgLy8gRW5zdXJlIGRldGVybWluaXN0aWMgb3JkZXJcclxuICAgICAgICB9XHJcbiAgICAgICk7XHJcblxyXG4gICAgICByZXR1cm4gcmVzdWx0Lml0ZW1zO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVmcmVzaCBjYWNoZSBmb3IgYSByb29tIChBcHBTeW5jIEdyYXBoUUwpXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyByZWZyZXNoQ2FjaGUoYXJnczogUmVmcmVzaENhY2hlQXJncyk6IFByb21pc2U8Q2FjaGVNZXRhZGF0YT4ge1xyXG4gICAgdGhpcy52YWxpZGF0ZUFyZ3M8UmVmcmVzaENhY2hlQXJncz4oYXJncywgWydyb29tSWQnXSk7XHJcblxyXG4gICAgLy8gR2V0IGV4aXN0aW5nIGNhY2hlIG1ldGFkYXRhXHJcbiAgICBjb25zdCBleGlzdGluZ01ldGFkYXRhID0gYXdhaXQgdGhpcy5kYi5nZXQ8Q2FjaGVNZXRhZGF0YT4oXHJcbiAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5yb29tQ2FjaGVNZXRhZGF0YSxcclxuICAgICAgeyByb29tSWQ6IGFyZ3Mucm9vbUlkIH1cclxuICAgICk7XHJcblxyXG4gICAgaWYgKCFleGlzdGluZ01ldGFkYXRhKSB7XHJcbiAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoJ0NhY2hlIG1ldGFkYXRhIG5vdCBmb3VuZCBmb3Igcm9vbScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENsZWFyIGV4aXN0aW5nIGNhY2hlXHJcbiAgICBjb25zdCBleGlzdGluZ0NhY2hlID0gYXdhaXQgdGhpcy5nZXRDYWNoZSh7IHJvb21JZDogYXJncy5yb29tSWQgfSk7XHJcbiAgICBcclxuICAgIGlmIChleGlzdGluZ0NhY2hlLmxlbmd0aCA+IDApIHtcclxuICAgICAgY29uc3QgZGVsZXRlSXRlbXMgPSBleGlzdGluZ0NhY2hlLm1hcChpdGVtID0+ICh7XHJcbiAgICAgICAgdGFibGVOYW1lOiB0aGlzLmNvbmZpZy50YWJsZXMucm9vbU1vdmllQ2FjaGUsXHJcbiAgICAgICAgb3BlcmF0aW9uOiAnREVMRVRFJyBhcyBjb25zdCxcclxuICAgICAgICBrZXk6IHsgcm9vbUlkOiBpdGVtLnJvb21JZCwgc2VxdWVuY2VJbmRleDogaXRlbS5zZXF1ZW5jZUluZGV4IH0sXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIGF3YWl0IHRoaXMuZGIuYmF0Y2hXcml0ZShkZWxldGVJdGVtcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmVjcmVhdGUgY2FjaGVcclxuICAgIHJldHVybiB0aGlzLmNyZWF0ZVJvb21DYWNoZShhcmdzLnJvb21JZCwgZXhpc3RpbmdNZXRhZGF0YS5maWx0ZXJDcml0ZXJpYSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgY2FjaGUgc3RhdHVzIGZvciBhIHJvb20gKEFwcFN5bmMgR3JhcGhRTClcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGdldENhY2hlU3RhdHVzKGFyZ3M6IEdldENhY2hlU3RhdHVzQXJncyk6IFByb21pc2U8Q2FjaGVNZXRhZGF0YT4ge1xyXG4gICAgdGhpcy52YWxpZGF0ZUFyZ3M8R2V0Q2FjaGVTdGF0dXNBcmdzPihhcmdzLCBbJ3Jvb21JZCddKTtcclxuXHJcbiAgICBjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHRoaXMuZGIuZ2V0PENhY2hlTWV0YWRhdGE+KFxyXG4gICAgICB0aGlzLmNvbmZpZy50YWJsZXMucm9vbUNhY2hlTWV0YWRhdGEsXHJcbiAgICAgIHsgcm9vbUlkOiBhcmdzLnJvb21JZCB9XHJcbiAgICApO1xyXG5cclxuICAgIGlmICghbWV0YWRhdGEpIHtcclxuICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcignQ2FjaGUgbm90IGZvdW5kIGZvciByb29tJyk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG1ldGFkYXRhO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGFsbCBtb3ZpZXMgZm9yIGEgcm9vbSAoQXBwU3luYyBHcmFwaFFMIGNvbnZlbmllbmNlIG1ldGhvZClcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGdldFJvb21Nb3ZpZXMoYXJnczogeyByb29tSWQ6IHN0cmluZyB9KTogUHJvbWlzZTxUcmluaXR5TW92aWVbXT4ge1xyXG4gICAgY29uc3QgY2FjaGVJdGVtcyA9IGF3YWl0IHRoaXMuZ2V0Q2FjaGUoeyByb29tSWQ6IGFyZ3Mucm9vbUlkIH0pO1xyXG4gICAgcmV0dXJuIGNhY2hlSXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5tb3ZpZURhdGEpO1xyXG4gIH1cclxuXHJcbiAgLy8gQnVzaW5lc3MgTG9naWMgTWV0aG9kc1xyXG5cclxuICAvKipcclxuICAgKiBDcmVhdGUgbW92aWUgc2V0IHdpdGggZXhhY3RseSA1MCBtb3ZpZXMgdXNpbmcgYnVzaW5lc3MgbG9naWNcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGNyZWF0ZU1vdmllU2V0V2l0aEJ1c2luZXNzTG9naWMoZmlsdGVyQ3JpdGVyaWE6IEZpbHRlckNyaXRlcmlhKTogUHJvbWlzZTxhbnk+IHtcclxuICAgIHRoaXMubG9nZ2VyLmluZm8oYPCfjqwgQ3JlYXRpbmcgbW92aWUgc2V0IHdpdGggYnVzaW5lc3MgbG9naWM6YCwgZmlsdGVyQ3JpdGVyaWEpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIFN0ZXAgMTogRmV0Y2ggbW92aWVzIGZyb20gVE1EQiB3aXRoIGZpbHRlcnNcclxuICAgICAgbGV0IGFsbE1vdmllcyA9IGF3YWl0IHRoaXMuZmV0Y2hNb3ZpZXNXaXRoRmlsdGVycyhmaWx0ZXJDcml0ZXJpYSk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoYWxsTW92aWVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBUcmluaXR5RXJyb3IoJ05vIG1vdmllcyBmb3VuZCBtYXRjaGluZyBmaWx0ZXIgY3JpdGVyaWEnLCAnTk9fTU9WSUVTX0ZPVU5EJywgNDA0KTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGhpcy5sb2dnZXIuZGVidWcoYPCfk6YgRmV0Y2hlZCAke2FsbE1vdmllcy5sZW5ndGh9IG1vdmllcyBmcm9tIFRNREJgKTtcclxuXHJcbiAgICAgIC8vIFN0ZXAgMjogQXBwbHkgd2VzdGVybiBsYW5ndWFnZSBmaWx0ZXIgKGJ1c2luZXNzIHJlcXVpcmVtZW50KVxyXG4gICAgICBhbGxNb3ZpZXMgPSB0aGlzLmFwcGx5V2VzdGVybkxhbmd1YWdlRmlsdGVyKGFsbE1vdmllcyk7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKGDwn4yNIEFmdGVyIHdlc3Rlcm4gbGFuZ3VhZ2UgZmlsdGVyOiAke2FsbE1vdmllcy5sZW5ndGh9IG1vdmllc2ApO1xyXG5cclxuICAgICAgLy8gU3RlcCAzOiBBcHBseSBkZXNjcmlwdGlvbiByZXF1aXJlbWVudCBmaWx0ZXIgKGJ1c2luZXNzIHJlcXVpcmVtZW50KVxyXG4gICAgICBhbGxNb3ZpZXMgPSB0aGlzLmFwcGx5RGVzY3JpcHRpb25GaWx0ZXIoYWxsTW92aWVzKTtcclxuICAgICAgdGhpcy5sb2dnZXIuZGVidWcoYPCfk50gQWZ0ZXIgZGVzY3JpcHRpb24gZmlsdGVyOiAke2FsbE1vdmllcy5sZW5ndGh9IG1vdmllc2ApO1xyXG5cclxuICAgICAgaWYgKGFsbE1vdmllcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgVHJpbml0eUVycm9yKCdObyBtb3ZpZXMgZm91bmQgYWZ0ZXIgYXBwbHlpbmcgYnVzaW5lc3MgbG9naWMgZmlsdGVycyAod2VzdGVybiBsYW5ndWFnZXMgKyBkZXNjcmlwdGlvbnMpJywgJ05PX01PVklFU19GT1VORCcsIDQwNCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFN0ZXAgNDogQXBwbHkgZ2VucmUgcHJpb3JpdGl6YXRpb24gYWxnb3JpdGhtIChidXNpbmVzcyByZXF1aXJlbWVudClcclxuICAgICAgYWxsTW92aWVzID0gdGhpcy5wcmlvcml0aXplQnlHZW5yZXMoYWxsTW92aWVzLCBmaWx0ZXJDcml0ZXJpYS5nZW5yZUlkcyk7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKGDwn46vIEFmdGVyIGdlbnJlIHByaW9yaXRpemF0aW9uOiAke2FsbE1vdmllcy5sZW5ndGh9IG1vdmllc2ApO1xyXG5cclxuICAgICAgLy8gU3RlcCA1OiBSYW5kb21pemUgd2l0aGluIGZpbHRlciBjb25zdHJhaW50cyBhbmQgc2VsZWN0IGV4YWN0bHkgNTBcclxuICAgICAgY29uc3Qgc2VsZWN0ZWRNb3ZpZXMgPSB0aGlzLnJhbmRvbWl6ZUFuZFNlbGVjdChhbGxNb3ZpZXMsIHRoaXMubW92aWVzUGVyUm9vbSk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoc2VsZWN0ZWRNb3ZpZXMubGVuZ3RoICE9PSB0aGlzLm1vdmllc1BlclJvb20pIHtcclxuICAgICAgICB0aHJvdyBuZXcgVHJpbml0eUVycm9yKGBCdXNpbmVzcyBsb2dpYyBlcnJvcjogRXhwZWN0ZWQgZXhhY3RseSAke3RoaXMubW92aWVzUGVyUm9vbX0gbW92aWVzLCBnb3QgJHtzZWxlY3RlZE1vdmllcy5sZW5ndGh9YCwgJ0lOVkFMSURfTU9WSUVfQ09VTlQnLCA1MDApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBTdGVwIDY6IENvbnZlcnQgdG8gY2FjaGUgZm9ybWF0IHdpdGggc2VxdWVuY2UgaW5kZXhpbmdcclxuICAgICAgY29uc3QgY2FjaGVkTW92aWVzID0gc2VsZWN0ZWRNb3ZpZXMubWFwKChtb3ZpZSwgaW5kZXgpID0+ICh7XHJcbiAgICAgICAgbW92aWVJZDogbW92aWUuaWQudG9TdHJpbmcoKSxcclxuICAgICAgICB0aXRsZTogbW92aWUudGl0bGUgfHwgbW92aWUubmFtZSxcclxuICAgICAgICBvdmVydmlldzogbW92aWUub3ZlcnZpZXcgfHwgJycsXHJcbiAgICAgICAgcG9zdGVyUGF0aDogbW92aWUucG9zdGVyX3BhdGggPyBgJHt0aGlzLnRtZGJJbWFnZUJhc2VVcmx9JHttb3ZpZS5wb3N0ZXJfcGF0aH1gIDogbnVsbCxcclxuICAgICAgICBiYWNrZHJvcFBhdGg6IG1vdmllLmJhY2tkcm9wX3BhdGggPyBgJHt0aGlzLnRtZGJJbWFnZUJhc2VVcmx9JHttb3ZpZS5iYWNrZHJvcF9wYXRofWAgOiBudWxsLFxyXG4gICAgICAgIHJlbGVhc2VEYXRlOiBtb3ZpZS5yZWxlYXNlX2RhdGUgfHwgbW92aWUuZmlyc3RfYWlyX2RhdGUgfHwgJycsXHJcbiAgICAgICAgdm90ZUF2ZXJhZ2U6IG1vdmllLnZvdGVfYXZlcmFnZSB8fCAwLFxyXG4gICAgICAgIHZvdGVDb3VudDogbW92aWUudm90ZV9jb3VudCB8fCAwLFxyXG4gICAgICAgIHBvcHVsYXJpdHk6IG1vdmllLnBvcHVsYXJpdHkgfHwgMCxcclxuICAgICAgICBhZHVsdDogbW92aWUuYWR1bHQgfHwgZmFsc2UsXHJcbiAgICAgICAgZ2VucmVJZHM6IG1vdmllLmdlbnJlX2lkcyB8fCBbXSxcclxuICAgICAgICBvcmlnaW5hbExhbmd1YWdlOiBtb3ZpZS5vcmlnaW5hbF9sYW5ndWFnZSB8fCAnJyxcclxuICAgICAgICBtZWRpYVR5cGU6IGZpbHRlckNyaXRlcmlhLm1lZGlhVHlwZSxcclxuICAgICAgICBwcmlvcml0eTogKG1vdmllIGFzIGFueSkuZ2VucmVQcmlvcml0eSB8fCAxLFxyXG4gICAgICAgIHNlcXVlbmNlSW5kZXg6IGluZGV4IC8vIDAtNDkgZm9yIGV4YWN0bHkgNTAgbW92aWVzXHJcbiAgICAgIH0pKTtcclxuXHJcbiAgICAgIHRoaXMubG9nZ2VyLmluZm8oYOKchSBDcmVhdGVkIG1vdmllIHNldCB3aXRoICR7Y2FjaGVkTW92aWVzLmxlbmd0aH0gbW92aWVzIHVzaW5nIGJ1c2luZXNzIGxvZ2ljYCk7XHJcblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIG1vdmllczogY2FjaGVkTW92aWVzLFxyXG4gICAgICAgIGZpbHRlckNyaXRlcmlhLFxyXG4gICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIHRvdGFsTW92aWVzOiBjYWNoZWRNb3ZpZXMubGVuZ3RoLFxyXG4gICAgICAgIGJ1c2luZXNzTG9naWNBcHBsaWVkOiB7XHJcbiAgICAgICAgICB3ZXN0ZXJuTGFuZ3VhZ2VzT25seTogdHJ1ZSxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uUmVxdWlyZWQ6IHRydWUsXHJcbiAgICAgICAgICBnZW5yZVByaW9yaXRpemF0aW9uOiB0cnVlLFxyXG4gICAgICAgICAgZXhhY3RseUZpZnR5TW92aWVzOiB0cnVlXHJcbiAgICAgICAgfVxyXG4gICAgICB9O1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGDinYwgRXJyb3IgY3JlYXRpbmcgbW92aWUgc2V0IHdpdGggYnVzaW5lc3MgbG9naWM6YCwgZXJyb3IgYXMgRXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIG1vdmllcyBmcm9tIFRNREIgd2l0aCBtZWRpYSB0eXBlIGFuZCBnZW5yZSBmaWx0ZXJzXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBmZXRjaE1vdmllc1dpdGhGaWx0ZXJzKGZpbHRlckNyaXRlcmlhOiBGaWx0ZXJDcml0ZXJpYSk6IFByb21pc2U8YW55W10+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGVuZHBvaW50ID0gZmlsdGVyQ3JpdGVyaWEubWVkaWFUeXBlID09PSAnTU9WSUUnID8gJ21vdmllJyA6ICd0dic7XHJcbiAgICAgIGNvbnN0IG1vdmllczogYW55W10gPSBbXTtcclxuICAgICAgbGV0IHBhZ2UgPSAxO1xyXG4gICAgICBjb25zdCBtYXhQYWdlcyA9IDEwOyAvLyBGZXRjaCBtb3JlIHBhZ2VzIHRvIGVuc3VyZSB3ZSBoYXZlIGVub3VnaCBhZnRlciBmaWx0ZXJpbmdcclxuICAgICAgY29uc3QgdGFyZ2V0TW92aWVzID0gdGhpcy5tb3ZpZXNQZXJSb29tICogMzsgLy8gRmV0Y2ggM3ggbW9yZSB0byBhY2NvdW50IGZvciBmaWx0ZXJpbmdcclxuXHJcbiAgICAgIHdoaWxlIChtb3ZpZXMubGVuZ3RoIDwgdGFyZ2V0TW92aWVzICYmIHBhZ2UgPD0gbWF4UGFnZXMpIHtcclxuICAgICAgICBjb25zdCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XHJcbiAgICAgICAgICBwYWdlOiBwYWdlLnRvU3RyaW5nKCksXHJcbiAgICAgICAgICBzb3J0X2J5OiAncG9wdWxhcml0eS5kZXNjJyxcclxuICAgICAgICAgICd2b3RlX2NvdW50Lmd0ZSc6ICcxMCcsIC8vIE1pbmltdW0gdm90ZSBjb3VudCBmb3IgcXVhbGl0eVxyXG4gICAgICAgICAgbGFuZ3VhZ2U6ICdlbi1VUycsIC8vIFVzZSBFbmdsaXNoIGZvciBicm9hZGVyIHJlc3VsdHMsIGZpbHRlciBsYW5ndWFnZXMgbGF0ZXJcclxuICAgICAgICAgIGluY2x1ZGVfYWR1bHQ6ICdmYWxzZSdcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBPbmx5IGFkZCBnZW5yZSBmaWx0ZXIgaWYgZ2VucmVzIGFyZSBzcGVjaWZpZWRcclxuICAgICAgICBpZiAoZmlsdGVyQ3JpdGVyaWEuZ2VucmVJZHMgJiYgZmlsdGVyQ3JpdGVyaWEuZ2VucmVJZHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgcGFyYW1zLndpdGhfZ2VucmVzID0gZmlsdGVyQ3JpdGVyaWEuZ2VucmVJZHMuam9pbignLCcpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoYPCfk6EgRmV0Y2hpbmcgJHtlbmRwb2ludH0gcGFnZSAke3BhZ2V9IHdpdGggZ2VucmVzICR7ZmlsdGVyQ3JpdGVyaWEuZ2VucmVJZHMgJiYgZmlsdGVyQ3JpdGVyaWEuZ2VucmVJZHMubGVuZ3RoID4gMCA/IGZpbHRlckNyaXRlcmlhLmdlbnJlSWRzLmpvaW4oJywnKSA6ICdhbGwgZ2VucmVzJ31gKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMubWFrZVJlcXVlc3QoYC9kaXNjb3Zlci8ke2VuZHBvaW50fWAsIHBhcmFtcyk7XHJcbiAgICAgICAgY29uc3QgcGFnZU1vdmllcyA9IHJlc3BvbnNlLnJlc3VsdHMgfHwgW107XHJcblxyXG4gICAgICAgIG1vdmllcy5wdXNoKC4uLnBhZ2VNb3ZpZXMpO1xyXG4gICAgICAgIHBhZ2UrKztcclxuXHJcbiAgICAgICAgLy8gQnJlYWsgaWYgbm8gbW9yZSBwYWdlc1xyXG4gICAgICAgIGlmIChwYWdlID4gKHJlc3BvbnNlLnRvdGFsX3BhZ2VzIHx8IDEpKSBicmVhaztcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gUmVtb3ZlIGR1cGxpY2F0ZXNcclxuICAgICAgY29uc3QgdW5pcXVlTW92aWVzID0gdGhpcy5yZW1vdmVEdXBsaWNhdGVzKG1vdmllcyk7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKGDwn5OmIEZldGNoZWQgJHt1bmlxdWVNb3ZpZXMubGVuZ3RofSB1bmlxdWUgbW92aWVzIGZyb20gVE1EQmApO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHVuaXF1ZU1vdmllcztcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihg4p2MIEVycm9yIGZldGNoaW5nIG1vdmllcyBmcm9tIFRNREI6YCwgZXJyb3IgYXMgRXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEFwcGx5IHdlc3Rlcm4gbGFuZ3VhZ2UgZmlsdGVyIChidXNpbmVzcyByZXF1aXJlbWVudClcclxuICAgKi9cclxuICBwcml2YXRlIGFwcGx5V2VzdGVybkxhbmd1YWdlRmlsdGVyKG1vdmllczogYW55W10pOiBhbnlbXSB7XHJcbiAgICBjb25zdCBmaWx0ZXJlZCA9IG1vdmllcy5maWx0ZXIobW92aWUgPT4ge1xyXG4gICAgICBjb25zdCBsYW5ndWFnZSA9IG1vdmllLm9yaWdpbmFsX2xhbmd1YWdlO1xyXG4gICAgICBpZiAoIWxhbmd1YWdlKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBpc1dlc3Rlcm4gPSB0aGlzLndlc3Rlcm5MYW5ndWFnZXMuaGFzKGxhbmd1YWdlLnRvTG93ZXJDYXNlKCkpO1xyXG4gICAgICBpZiAoIWlzV2VzdGVybikge1xyXG4gICAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKGDwn5qrIEV4Y2x1ZGluZyBub24td2VzdGVybiBsYW5ndWFnZTogJHttb3ZpZS50aXRsZSB8fCBtb3ZpZS5uYW1lfSAoJHtsYW5ndWFnZX0pYCk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIGlzV2VzdGVybjtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKGDwn4yNIFdlc3Rlcm4gbGFuZ3VhZ2UgZmlsdGVyOiAke21vdmllcy5sZW5ndGh9IC0+ICR7ZmlsdGVyZWQubGVuZ3RofSBtb3ZpZXNgKTtcclxuICAgIHJldHVybiBmaWx0ZXJlZDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEFwcGx5IGRlc2NyaXB0aW9uIHJlcXVpcmVtZW50IGZpbHRlciAoYnVzaW5lc3MgcmVxdWlyZW1lbnQpXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhcHBseURlc2NyaXB0aW9uRmlsdGVyKG1vdmllczogYW55W10pOiBhbnlbXSB7XHJcbiAgICBjb25zdCBmaWx0ZXJlZCA9IG1vdmllcy5maWx0ZXIobW92aWUgPT4ge1xyXG4gICAgICBjb25zdCBvdmVydmlldyA9IG1vdmllLm92ZXJ2aWV3O1xyXG4gICAgICBjb25zdCBoYXNEZXNjcmlwdGlvbiA9IG92ZXJ2aWV3ICYmIHR5cGVvZiBvdmVydmlldyA9PT0gJ3N0cmluZycgJiYgb3ZlcnZpZXcudHJpbSgpLmxlbmd0aCA+IDA7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoIWhhc0Rlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoYPCfmqsgRXhjbHVkaW5nIG1vdmllIHdpdGhvdXQgZGVzY3JpcHRpb246ICR7bW92aWUudGl0bGUgfHwgbW92aWUubmFtZX1gKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gaGFzRGVzY3JpcHRpb247XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmxvZ2dlci5kZWJ1Zyhg8J+TnSBEZXNjcmlwdGlvbiBmaWx0ZXI6ICR7bW92aWVzLmxlbmd0aH0gLT4gJHtmaWx0ZXJlZC5sZW5ndGh9IG1vdmllc2ApO1xyXG4gICAgcmV0dXJuIGZpbHRlcmVkO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQXBwbHkgZ2VucmUgcHJpb3JpdGl6YXRpb24gYWxnb3JpdGhtIChidXNpbmVzcyByZXF1aXJlbWVudClcclxuICAgKiBQcmlvcml0eSAxOiBNb3ZpZXMgd2l0aCBBTEwgc2VsZWN0ZWQgZ2VucmVzXHJcbiAgICogUHJpb3JpdHkgMjogTW92aWVzIHdpdGggQU5ZIHNlbGVjdGVkIGdlbnJlc1xyXG4gICAqL1xyXG4gIHByaXZhdGUgcHJpb3JpdGl6ZUJ5R2VucmVzKG1vdmllczogYW55W10sIHNlbGVjdGVkR2VucmVzOiBudW1iZXJbXSk6IGFueVtdIHtcclxuICAgIGlmICghc2VsZWN0ZWRHZW5yZXMgfHwgc2VsZWN0ZWRHZW5yZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIC8vIFdoZW4gbm8gZ2VucmVzIGFyZSBzcGVjaWZpZWQsIGFzc2lnbiBhbGwgbW92aWVzIHRoZSBzYW1lIHByaW9yaXR5XHJcbiAgICAgIHJldHVybiBtb3ZpZXMubWFwKG1vdmllID0+ICh7XHJcbiAgICAgICAgLi4ubW92aWUsXHJcbiAgICAgICAgZ2VucmVQcmlvcml0eTogMSAvLyBBbGwgbW92aWVzIGhhdmUgZXF1YWwgcHJpb3JpdHkgd2hlbiBubyBnZW5yZXMgc3BlY2lmaWVkXHJcbiAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBtb3ZpZXNXaXRoUHJpb3JpdHkgPSBtb3ZpZXMubWFwKG1vdmllID0+IHtcclxuICAgICAgY29uc3QgbW92aWVHZW5yZXMgPSBtb3ZpZS5nZW5yZV9pZHMgfHwgW107XHJcbiAgICAgIFxyXG4gICAgICAvLyBDaGVjayBpZiBtb3ZpZSBoYXMgQUxMIHNlbGVjdGVkIGdlbnJlcyAoaGlnaGVzdCBwcmlvcml0eSlcclxuICAgICAgY29uc3QgaGFzQWxsR2VucmVzID0gc2VsZWN0ZWRHZW5yZXMuZXZlcnkoZ2VucmVJZCA9PiBtb3ZpZUdlbnJlcy5pbmNsdWRlcyhnZW5yZUlkKSk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBDaGVjayBpZiBtb3ZpZSBoYXMgQU5ZIHNlbGVjdGVkIGdlbnJlcyAobWVkaXVtIHByaW9yaXR5KVxyXG4gICAgICBjb25zdCBoYXNBbnlHZW5yZSA9IHNlbGVjdGVkR2VucmVzLnNvbWUoZ2VucmVJZCA9PiBtb3ZpZUdlbnJlcy5pbmNsdWRlcyhnZW5yZUlkKSk7XHJcbiAgICAgIFxyXG4gICAgICBsZXQgcHJpb3JpdHk7XHJcbiAgICAgIGlmIChoYXNBbGxHZW5yZXMpIHtcclxuICAgICAgICBwcmlvcml0eSA9IDE7IC8vIEhpZ2hlc3QgcHJpb3JpdHkgLSBoYXMgYWxsIGdlbnJlc1xyXG4gICAgICB9IGVsc2UgaWYgKGhhc0FueUdlbnJlKSB7XHJcbiAgICAgICAgcHJpb3JpdHkgPSAyOyAvLyBNZWRpdW0gcHJpb3JpdHkgLSBoYXMgc29tZSBnZW5yZXNcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBwcmlvcml0eSA9IDM7IC8vIExvd2VzdCBwcmlvcml0eSAtIG5vIG1hdGNoaW5nIGdlbnJlcyAoZmFsbGJhY2spXHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgLi4ubW92aWUsXHJcbiAgICAgICAgZ2VucmVQcmlvcml0eTogcHJpb3JpdHlcclxuICAgICAgfTtcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFNvcnQgYnkgcHJpb3JpdHkgKDEgPSBoaWdoZXN0LCAzID0gbG93ZXN0KVxyXG4gICAgY29uc3Qgc29ydGVkID0gbW92aWVzV2l0aFByaW9yaXR5LnNvcnQoKGEsIGIpID0+IGEuZ2VucmVQcmlvcml0eSAtIGIuZ2VucmVQcmlvcml0eSk7XHJcbiAgICBcclxuICAgIGNvbnN0IHByaW9yaXR5Q291bnRzID0ge1xyXG4gICAgICAxOiBzb3J0ZWQuZmlsdGVyKG0gPT4gbS5nZW5yZVByaW9yaXR5ID09PSAxKS5sZW5ndGgsXHJcbiAgICAgIDI6IHNvcnRlZC5maWx0ZXIobSA9PiBtLmdlbnJlUHJpb3JpdHkgPT09IDIpLmxlbmd0aCxcclxuICAgICAgMzogc29ydGVkLmZpbHRlcihtID0+IG0uZ2VucmVQcmlvcml0eSA9PT0gMykubGVuZ3RoXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmxvZ2dlci5kZWJ1Zyhg8J+OryBHZW5yZSBwcmlvcml0aXphdGlvbjogUHJpb3JpdHkgMSAoYWxsIGdlbnJlcyk6ICR7cHJpb3JpdHlDb3VudHNbMV19LCBQcmlvcml0eSAyIChhbnkgZ2VucmUpOiAke3ByaW9yaXR5Q291bnRzWzJdfSwgUHJpb3JpdHkgMyAoZmFsbGJhY2spOiAke3ByaW9yaXR5Q291bnRzWzNdfWApO1xyXG4gICAgXHJcbiAgICByZXR1cm4gc29ydGVkO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmFuZG9taXplIG1vdmllcyB3aXRoaW4gZmlsdGVyIGNvbnN0cmFpbnRzIGFuZCBzZWxlY3QgZXhhY3RseSBOIG1vdmllc1xyXG4gICAqL1xyXG4gIHByaXZhdGUgcmFuZG9taXplQW5kU2VsZWN0KG1vdmllczogYW55W10sIGNvdW50OiBudW1iZXIpOiBhbnlbXSB7XHJcbiAgICBpZiAobW92aWVzLmxlbmd0aCA8PSBjb3VudCkge1xyXG4gICAgICAvLyBJZiB3ZSBoYXZlIGZld2VyIG1vdmllcyB0aGFuIG5lZWRlZCwgcmV0dXJuIGFsbCBhbmQgbG9nIHdhcm5pbmdcclxuICAgICAgdGhpcy5sb2dnZXIud2Fybihg4pqg77iPIE9ubHkgJHttb3ZpZXMubGVuZ3RofSBtb3ZpZXMgYXZhaWxhYmxlLCBuZWVkICR7Y291bnR9LiBSZXR1cm5pbmcgYWxsIGF2YWlsYWJsZS5gKTtcclxuICAgICAgcmV0dXJuIHRoaXMuc2h1ZmZsZUFycmF5KG1vdmllcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR3JvdXAgYnkgcHJpb3JpdHkgZm9yIGNvbnRyb2xsZWQgcmFuZG9taXphdGlvblxyXG4gICAgY29uc3QgcHJpb3JpdHkxID0gbW92aWVzLmZpbHRlcihtID0+IChtIGFzIGFueSkuZ2VucmVQcmlvcml0eSA9PT0gMSk7XHJcbiAgICBjb25zdCBwcmlvcml0eTIgPSBtb3ZpZXMuZmlsdGVyKG0gPT4gKG0gYXMgYW55KS5nZW5yZVByaW9yaXR5ID09PSAyKTtcclxuICAgIGNvbnN0IHByaW9yaXR5MyA9IG1vdmllcy5maWx0ZXIobSA9PiAobSBhcyBhbnkpLmdlbnJlUHJpb3JpdHkgPT09IDMpO1xyXG5cclxuICAgIC8vIFNodWZmbGUgZWFjaCBwcmlvcml0eSBncm91cFxyXG4gICAgY29uc3Qgc2h1ZmZsZWRQMSA9IHRoaXMuc2h1ZmZsZUFycmF5KHByaW9yaXR5MSk7XHJcbiAgICBjb25zdCBzaHVmZmxlZFAyID0gdGhpcy5zaHVmZmxlQXJyYXkocHJpb3JpdHkyKTtcclxuICAgIGNvbnN0IHNodWZmbGVkUDMgPSB0aGlzLnNodWZmbGVBcnJheShwcmlvcml0eTMpO1xyXG5cclxuICAgIC8vIFNlbGVjdCBtb3ZpZXMgcHJpb3JpdGl6aW5nIGhpZ2hlciBwcmlvcml0eSBncm91cHNcclxuICAgIGNvbnN0IHNlbGVjdGVkOiBhbnlbXSA9IFtdO1xyXG4gICAgXHJcbiAgICAvLyBUYWtlIGFzIG1hbnkgYXMgcG9zc2libGUgZnJvbSBwcmlvcml0eSAxXHJcbiAgICBjb25zdCBmcm9tUDEgPSBNYXRoLm1pbihzaHVmZmxlZFAxLmxlbmd0aCwgY291bnQpO1xyXG4gICAgc2VsZWN0ZWQucHVzaCguLi5zaHVmZmxlZFAxLnNsaWNlKDAsIGZyb21QMSkpO1xyXG4gICAgXHJcbiAgICAvLyBGaWxsIHJlbWFpbmluZyBmcm9tIHByaW9yaXR5IDJcclxuICAgIGNvbnN0IHJlbWFpbmluZyA9IGNvdW50IC0gc2VsZWN0ZWQubGVuZ3RoO1xyXG4gICAgaWYgKHJlbWFpbmluZyA+IDApIHtcclxuICAgICAgY29uc3QgZnJvbVAyID0gTWF0aC5taW4oc2h1ZmZsZWRQMi5sZW5ndGgsIHJlbWFpbmluZyk7XHJcbiAgICAgIHNlbGVjdGVkLnB1c2goLi4uc2h1ZmZsZWRQMi5zbGljZSgwLCBmcm9tUDIpKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRmlsbCBhbnkgcmVtYWluaW5nIGZyb20gcHJpb3JpdHkgM1xyXG4gICAgY29uc3Qgc3RpbGxSZW1haW5pbmcgPSBjb3VudCAtIHNlbGVjdGVkLmxlbmd0aDtcclxuICAgIGlmIChzdGlsbFJlbWFpbmluZyA+IDApIHtcclxuICAgICAgY29uc3QgZnJvbVAzID0gTWF0aC5taW4oc2h1ZmZsZWRQMy5sZW5ndGgsIHN0aWxsUmVtYWluaW5nKTtcclxuICAgICAgc2VsZWN0ZWQucHVzaCguLi5zaHVmZmxlZFAzLnNsaWNlKDAsIGZyb21QMykpO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKGDwn46yIFNlbGVjdGVkICR7c2VsZWN0ZWQubGVuZ3RofSBtb3ZpZXM6ICR7ZnJvbVAxfSBmcm9tIHByaW9yaXR5IDEsICR7TWF0aC5taW4oc2h1ZmZsZWRQMi5sZW5ndGgsIHJlbWFpbmluZyl9IGZyb20gcHJpb3JpdHkgMiwgJHtNYXRoLm1pbihzaHVmZmxlZFAzLmxlbmd0aCwgc3RpbGxSZW1haW5pbmcpfSBmcm9tIHByaW9yaXR5IDNgKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHNlbGVjdGVkO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVtb3ZlIGR1cGxpY2F0ZSBtb3ZpZXMgYmFzZWQgb24gSURcclxuICAgKi9cclxuICBwcml2YXRlIHJlbW92ZUR1cGxpY2F0ZXMobW92aWVzOiBhbnlbXSk6IGFueVtdIHtcclxuICAgIGNvbnN0IHNlZW5JZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcclxuICAgIGNvbnN0IHVuaXF1ZU1vdmllczogYW55W10gPSBbXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IG1vdmllIG9mIG1vdmllcykge1xyXG4gICAgICBjb25zdCBtb3ZpZUlkID0gbW92aWUuaWQudG9TdHJpbmcoKTtcclxuICAgICAgaWYgKCFzZWVuSWRzLmhhcyhtb3ZpZUlkKSkge1xyXG4gICAgICAgIHNlZW5JZHMuYWRkKG1vdmllSWQpO1xyXG4gICAgICAgIHVuaXF1ZU1vdmllcy5wdXNoKG1vdmllKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKGDwn5SEIFJlbW92ZWQgZHVwbGljYXRlczogJHttb3ZpZXMubGVuZ3RofSAtPiAke3VuaXF1ZU1vdmllcy5sZW5ndGh9IG1vdmllc2ApO1xyXG4gICAgcmV0dXJuIHVuaXF1ZU1vdmllcztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFNodWZmbGUgYXJyYXkgdXNpbmcgRmlzaGVyLVlhdGVzIGFsZ29yaXRobVxyXG4gICAqL1xyXG4gIHByaXZhdGUgc2h1ZmZsZUFycmF5PFQ+KGFycmF5OiBUW10pOiBUW10ge1xyXG4gICAgY29uc3Qgc2h1ZmZsZWQgPSBbLi4uYXJyYXldO1xyXG4gICAgZm9yIChsZXQgaSA9IHNodWZmbGVkLmxlbmd0aCAtIDE7IGkgPiAwOyBpLS0pIHtcclxuICAgICAgY29uc3QgaiA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChpICsgMSkpO1xyXG4gICAgICBbc2h1ZmZsZWRbaV0sIHNodWZmbGVkW2pdXSA9IFtzaHVmZmxlZFtqXSwgc2h1ZmZsZWRbaV1dO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHNodWZmbGVkO1xyXG4gIH1cclxuXHJcbiAgLy8gSGVscGVyIE1ldGhvZHNcclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGN1cnJlbnQgc2VxdWVuY2UgaW5kZXggZm9yIGEgcm9vbVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZ2V0Q3VycmVudFNlcXVlbmNlSW5kZXgocm9vbUlkOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgbWV0YWRhdGEgPSBhd2FpdCB0aGlzLmRiLmdldDxhbnk+KFxyXG4gICAgICAgIHRoaXMuY29uZmlnLnRhYmxlcy5yb29tQ2FjaGVNZXRhZGF0YSxcclxuICAgICAgICB7IHJvb21JZCB9XHJcbiAgICAgICk7XHJcbiAgICAgIHJldHVybiBtZXRhZGF0YT8uY3VycmVudEluZGV4IHx8IDA7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihg4p2MIEVycm9yIGdldHRpbmcgY3VycmVudCBzZXF1ZW5jZSBpbmRleCBmb3Igcm9vbSAke3Jvb21JZH06YCwgZXJyb3IgYXMgRXJyb3IpO1xyXG4gICAgICByZXR1cm4gMDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEF0b21pY2FsbHkgaW5jcmVtZW50IGN1cnJlbnQgaW5kZXggZm9yIGEgcm9vbVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgaW5jcmVtZW50Q3VycmVudEluZGV4KHJvb21JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCB0aGlzLmRiLnVwZGF0ZShcclxuICAgICAgICB0aGlzLmNvbmZpZy50YWJsZXMucm9vbUNhY2hlTWV0YWRhdGEsXHJcbiAgICAgICAgeyByb29tSWQgfSxcclxuICAgICAgICAnQUREIGN1cnJlbnRJbmRleCA6aW5jIFNFVCB1cGRhdGVkQXQgPSA6bm93JyxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAgICc6aW5jJzogMSxcclxuICAgICAgICAgICAgJzpub3cnOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBjb25kaXRpb25FeHByZXNzaW9uOiAnYXR0cmlidXRlX2V4aXN0cyhyb29tSWQpJ1xyXG4gICAgICAgIH1cclxuICAgICAgKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGDinYwgRXJyb3IgaW5jcmVtZW50aW5nIGN1cnJlbnQgaW5kZXggZm9yIHJvb20gJHtyb29tSWR9OmAsIGVycm9yIGFzIEVycm9yKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBmaWx0ZXIgY3JpdGVyaWEgYWNjb3JkaW5nIHRvIGJ1c2luZXNzIGxvZ2ljXHJcbiAgICovXHJcbiAgcHJpdmF0ZSB2YWxpZGF0ZUZpbHRlckNyaXRlcmlhKGZpbHRlckNyaXRlcmlhOiBGaWx0ZXJDcml0ZXJpYSk6IHZvaWQge1xyXG4gICAgaWYgKCFmaWx0ZXJDcml0ZXJpYSkge1xyXG4gICAgICB0aHJvdyBuZXcgVmFsaWRhdGlvbkVycm9yKCdGaWx0ZXIgY3JpdGVyaWEgaXMgcmVxdWlyZWQnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBNZWRpYSB0eXBlIHZhbGlkYXRpb24gLSBtdXN0IGJlIE1PVklFIG9yIFRWIChleGNsdXNpdmUpXHJcbiAgICBpZiAoIWZpbHRlckNyaXRlcmlhLm1lZGlhVHlwZSB8fCAhWydNT1ZJRScsICdUViddLmluY2x1ZGVzKGZpbHRlckNyaXRlcmlhLm1lZGlhVHlwZSkpIHtcclxuICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcignTWVkaWEgdHlwZSBtdXN0IGJlIGVpdGhlciBNT1ZJRSBvciBUViAoZXhjbHVzaXZlIHNlbGVjdGlvbiknKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZW5yZSB2YWxpZGF0aW9uIC0gbXVzdCBoYXZlIDAsIDEsIG9yIDIgZ2VucmVzXHJcbiAgICBpZiAoIWZpbHRlckNyaXRlcmlhLmdlbnJlSWRzIHx8ICFBcnJheS5pc0FycmF5KGZpbHRlckNyaXRlcmlhLmdlbnJlSWRzKSkge1xyXG4gICAgICB0aHJvdyBuZXcgVmFsaWRhdGlvbkVycm9yKCdHZW5yZSBJRHMgbXVzdCBiZSBwcm92aWRlZCBhcyBhbiBhcnJheScpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChmaWx0ZXJDcml0ZXJpYS5nZW5yZUlkcy5sZW5ndGggPiAyKSB7XHJcbiAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoJ011c3Qgc2VsZWN0IDAsIDEsIG9yIDIgZ2VucmVzICgwID0gcG9wdWxhciBtb3ZpZXMsIDEtMiA9IHNwZWNpZmljIGdlbnJlcyknKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBWYWxpZGF0ZSBnZW5yZSBJRHMgYXJlIG51bWJlcnNcclxuICAgIGlmICghZmlsdGVyQ3JpdGVyaWEuZ2VucmVJZHMuZXZlcnkoaWQgPT4gdHlwZW9mIGlkID09PSAnbnVtYmVyJyAmJiBpZCA+IDApKSB7XHJcbiAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoJ0dlbnJlIElEcyBtdXN0IGJlIHBvc2l0aXZlIG51bWJlcnMnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBSb29tIGNhcGFjaXR5IHZhbGlkYXRpb25cclxuICAgIGlmIChmaWx0ZXJDcml0ZXJpYS5yb29tQ2FwYWNpdHkgJiYgKHR5cGVvZiBmaWx0ZXJDcml0ZXJpYS5yb29tQ2FwYWNpdHkgIT09ICdudW1iZXInIHx8IGZpbHRlckNyaXRlcmlhLnJvb21DYXBhY2l0eSA8IDIpKSB7XHJcbiAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoJ1Jvb20gY2FwYWNpdHkgbXVzdCBiZSBhIG51bWJlciA+PSAyJyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBNYWtlIEhUVFAgcmVxdWVzdCB0byBUTURCIEFQSVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgbWFrZVJlcXVlc3QoZW5kcG9pbnQ6IHN0cmluZywgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge30pOiBQcm9taXNlPGFueT4ge1xyXG4gICAgY29uc3QgdXJsID0gbmV3IFVSTChgJHt0aGlzLnRtZGJCYXNlVXJsfSR7ZW5kcG9pbnR9YCk7XHJcbiAgICBcclxuICAgIC8vIEFkZCBBUEkga2V5XHJcbiAgICB1cmwuc2VhcmNoUGFyYW1zLmFwcGVuZCgnYXBpX2tleScsIHRoaXMuY29uZmlnLmV4dGVybmFsLnRtZGJBcGlLZXkpO1xyXG4gICAgXHJcbiAgICAvLyBBZGQgb3RoZXIgcGFyYW1ldGVyc1xyXG4gICAgT2JqZWN0LmVudHJpZXMocGFyYW1zKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcclxuICAgICAgdXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoa2V5LCB2YWx1ZSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybC50b1N0cmluZygpLCB7XHJcbiAgICAgICAgbWV0aG9kOiAnR0VUJyxcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgJ1VzZXItQWdlbnQnOiAnVHJpbml0eS1DYWNoZS1TeXN0ZW0vMS4wJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy8gQWRkIHRpbWVvdXRcclxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMTAwMDApIC8vIDEwIHNlY29uZCB0aW1lb3V0XHJcbiAgICAgIH0pO1xyXG4gICAgICBcclxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgIHRocm93IG5ldyBUcmluaXR5RXJyb3IoYFRNREIgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWAsICdUTURCX0FQSV9FUlJPUicsIHJlc3BvbnNlLnN0YXR1cyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcign4p2MIFRNREIgQVBJIHJlcXVlc3QgZmFpbGVkJywgZXJyb3IgYXMgRXJyb3IsIHsgZW5kcG9pbnQsIHBhcmFtcyB9KTtcclxuICAgICAgXHJcbiAgICAgIGlmICgoZXJyb3IgYXMgYW55KS5uYW1lID09PSAnQWJvcnRFcnJvcicpIHtcclxuICAgICAgICB0aHJvdyBuZXcgVHJpbml0eUVycm9yKCdUTURCIEFQSSByZXF1ZXN0IHRpbWVvdXQnLCAnVE1EQl9USU1FT1VUJywgNDA4KTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBUcmFuc2Zvcm0gVE1EQiBtb3ZpZS9UViBzaG93IHRvIFRyaW5pdHkgZm9ybWF0XHJcbiAgICovXHJcbiAgcHJpdmF0ZSB0cmFuc2Zvcm1Ub1RyaW5pdHlNb3ZpZShpdGVtOiBUTURCTW92aWUgfCBUTURCVFZTaG93LCBtZWRpYVR5cGU6ICdNT1ZJRScgfCAnVFYnKTogVHJpbml0eU1vdmllIHtcclxuICAgIGNvbnN0IGlzTW92aWUgPSBtZWRpYVR5cGUgPT09ICdNT1ZJRSc7XHJcbiAgICBjb25zdCBtb3ZpZUl0ZW0gPSBpdGVtIGFzIFRNREJNb3ZpZTtcclxuICAgIGNvbnN0IHR2SXRlbSA9IGl0ZW0gYXMgVE1EQlRWU2hvdztcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBpZDogaXRlbS5pZC50b1N0cmluZygpLFxyXG4gICAgICB0aXRsZTogaXNNb3ZpZSA/IG1vdmllSXRlbS50aXRsZSA6IHR2SXRlbS5uYW1lLFxyXG4gICAgICBvdmVydmlldzogaXRlbS5vdmVydmlldyxcclxuICAgICAgcmVsZWFzZURhdGU6IGlzTW92aWUgPyBtb3ZpZUl0ZW0ucmVsZWFzZV9kYXRlIDogdHZJdGVtLmZpcnN0X2Fpcl9kYXRlLFxyXG4gICAgICBwb3N0ZXJQYXRoOiBpdGVtLnBvc3Rlcl9wYXRoID8gYCR7dGhpcy50bWRiSW1hZ2VCYXNlVXJsfSR7aXRlbS5wb3N0ZXJfcGF0aH1gIDogdW5kZWZpbmVkLFxyXG4gICAgICBiYWNrZHJvcFBhdGg6IGl0ZW0uYmFja2Ryb3BfcGF0aCA/IGAke3RoaXMudG1kYkltYWdlQmFzZVVybH0ke2l0ZW0uYmFja2Ryb3BfcGF0aH1gIDogdW5kZWZpbmVkLFxyXG4gICAgICBnZW5yZUlkczogaXRlbS5nZW5yZV9pZHMsXHJcbiAgICAgIHZvdGVBdmVyYWdlOiBpdGVtLnZvdGVfYXZlcmFnZSxcclxuICAgICAgdm90ZUNvdW50OiBpdGVtLnZvdGVfY291bnQsXHJcbiAgICAgIHBvcHVsYXJpdHk6IGl0ZW0ucG9wdWxhcml0eSxcclxuICAgICAgYWR1bHQ6IGl0ZW0uYWR1bHQsXHJcbiAgICAgIG9yaWdpbmFsTGFuZ3VhZ2U6IGl0ZW0ub3JpZ2luYWxfbGFuZ3VhZ2UsXHJcbiAgICAgIG1lZGlhVHlwZSxcclxuICAgIH07XHJcbiAgfVxyXG59XHJcblxyXG4vLyBFeHBvcnQgdGhlIGhhbmRsZXJcclxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKENhY2hlSGFuZGxlcik7Il19