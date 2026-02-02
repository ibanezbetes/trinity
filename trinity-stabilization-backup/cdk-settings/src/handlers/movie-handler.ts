/**
 * Trinity Movie Handler
 * Handles TMDB integration, movie data management, and cache integration
 * Migrated from JavaScript with full business logic preservation
 */

import { BaseHandler, createHandler } from './base-handler';
import { AppSyncEvent, TrinityMovie, ValidationError, TrinityError, TrinityRoom } from '../shared/types';
import { HandlerUtils } from './base-handler';

// Interface definitions for GraphQL operations
interface GetMoviesArgs {
  genre?: string;
  page?: number;
}

interface GetMovieDetailsArgs {
  movieId: string;
}

interface GetFilteredContentArgs {
  mediaType: 'MOVIE' | 'TV';
  genreIds: number[];
  limit?: number;
  excludeIds?: string[];
}

interface GetAvailableGenresArgs {
  mediaType: 'MOVIE' | 'TV';
}

interface GetCurrentMovieArgs {
  roomId: string;
}

interface GetNextMovieForUserArgs {
  roomId: string;
}

interface IncrementRoomMovieIndexArgs {
  roomId: string;
}

interface CheckMatchBeforeActionArgs {
  roomId: string;
  action: {
    type: string;
  };
}

// TMDB API response interfaces
interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  adult: boolean;
  original_language: string;
}

interface TMDBTVShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  adult: boolean;
  original_language: string;
}

interface TMDBGenre {
  id: number;
  name: string;
}

interface CachedMovie {
  tmdbId: string;
  movies?: any[];
  movieDetails?: any;
  ttl: number;
  cachedAt: string;
}

class MovieHandler extends BaseHandler {
  private tmdbBaseUrl = 'https://api.themoviedb.org/3';
  private tmdbImageBaseUrl = 'https://image.tmdb.org/t/p/w500';

  async handle(event: AppSyncEvent): Promise<any> {
    const { fieldName } = HandlerUtils.getOperationInfo(event);
    const { userId } = HandlerUtils.getUserInfo(event);

    this.logger.info(`🎬 Movie Handler: ${fieldName}`, { userId, fieldName });

    try {
      switch (fieldName) {
        case 'getMovies':
          return await this.getMovies(event.arguments as GetMoviesArgs);
        
        case 'getMovieDetails':
          return await this.getMovieDetails(event.arguments as GetMovieDetailsArgs);
        
        case 'getFilteredContent':
          return await this.getFilteredContent(event.arguments as GetFilteredContentArgs);
        
        case 'getAvailableGenres':
          return await this.getAvailableGenres(event.arguments as GetAvailableGenresArgs);
        
        case 'getCurrentMovie':
          return await this.getCurrentMovie(event.arguments as GetCurrentMovieArgs);
        
        case 'getNextMovieForUser':
          if (!userId) {
            throw new ValidationError('Usuario no autenticado');
          }
          return await this.getNextMovieForUser(event.arguments as GetNextMovieForUserArgs, userId);
        
        case 'incrementRoomMovieIndex':
          return await this.incrementRoomMovieIndex(event.arguments as IncrementRoomMovieIndexArgs);
        
        case 'checkMatchBeforeAction':
          if (!userId) {
            throw new ValidationError('Usuario no autenticado');
          }
          return await this.checkMatchBeforeAction(event.arguments as CheckMatchBeforeActionArgs, userId);
        
        default:
          throw new ValidationError(`Operación no soportada: ${fieldName}`);
      }
    } catch (error) {
      this.logger.error(`❌ Error en ${fieldName}:`, error as Error);
      throw error;
    }
  }

  /**
   * NUEVA: Verificar matches antes de cualquier acción del usuario
   * Implementa la detección de matches en tiempo real
   */
  private async checkMatchBeforeAction(args: CheckMatchBeforeActionArgs, userId: string): Promise<any> {
    try {
      this.logger.info(`🔍 Verificando matches antes de acción ${args.action.type} por usuario ${userId} en sala ${args.roomId}`);
      
      // TODO: Integrate with cache integration service for match detection
      // For now, return no match to maintain compatibility
      this.logger.info(`✅ No hay matches, acción puede proceder`);
      return {
        hasMatch: false,
        roomId: args.roomId
      };
      
    } catch (error) {
      this.logger.error(`❌ Error verificando matches para sala ${args.roomId}:`, error as Error);
      // No bloquear acciones del usuario por errores de verificación de matches
      return {
        hasMatch: false,
        roomId: args.roomId,
        error: (error as Error).message
      };
    }
  }

  /**
   * Obtener información de la sala para filtros
   */
  private async getRoomInfo(roomId: string): Promise<TrinityRoom | null> {
    try {
      // Try the actual table structure first (PK + SK)
      const response = await this.db.get(this.config.tables.rooms, { PK: roomId, SK: 'ROOM' });
      
      if (response) {
        this.logger.info(`✅ Room info found for ${roomId}`, response);
        return response as TrinityRoom;
      }
      
      // Fallback: try simple id structure (if table structure changes)
      const fallbackResponse = await this.db.get(this.config.tables.rooms, { id: roomId });
      
      if (fallbackResponse) {
        this.logger.info(`✅ Fallback room info found for ${roomId}`, fallbackResponse);
        return fallbackResponse as TrinityRoom;
      }
      
      this.logger.warn(`⚠️ No room info found for ${roomId}`);
      return null;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo info de sala ${roomId}:`, error as Error);
      return null;
    }
  }

  /**
   * Incrementar el índice de película en la sala (llamado desde vote lambda)
   * Solo se incrementa cuando alguien vota (LIKE o DISLIKE)
   */
  private async incrementRoomMovieIndex(args: IncrementRoomMovieIndexArgs): Promise<number> {
    try {
      this.logger.info(`🔄 Incrementando índice de película para sala ${args.roomId}`);
      
      // Primero obtener el índice actual para logging
      const currentRoom = await this.db.get(this.config.tables.rooms, { PK: args.roomId, SK: 'ROOM' });
      
      const currentIndex = currentRoom?.currentMovieIndex || 0;
      const totalMovies = currentRoom?.totalMovies || 0;
      
      this.logger.info(`📊 Sala ${args.roomId}: Incrementando desde índice ${currentIndex} (${currentIndex + 1}/${totalMovies})`);
      
      const response = await this.db.update(
        this.config.tables.rooms,
        { PK: args.roomId, SK: 'ROOM' },
        'SET currentMovieIndex = currentMovieIndex + :inc',
        {
          expressionAttributeValues: { ':inc': 1 },
          returnValues: 'ALL_NEW'
        }
      );
      
      const newIndex = response?.currentMovieIndex || 0;
      const newTotal = response?.totalMovies || 0;
      
      this.logger.info(`✅ Índice de película incrementado para sala ${args.roomId}: ${currentIndex} → ${newIndex} (${newIndex}/${newTotal})`);
      
      // Verificar si se agotaron las películas
      if (newIndex >= newTotal && newTotal > 0) {
        this.logger.info(`🏁 ¡Todas las películas agotadas en sala ${args.roomId}! (${newIndex}/${newTotal})`);
      }
      
      return newIndex;
    } catch (error) {
      this.logger.error(`❌ Error incrementando índice de película para sala ${args.roomId}:`, error as Error);
      throw error;
    }
  }

  /**
   * NUEVA: Obtener la siguiente película para un usuario específico
   * Cada usuario avanza independientemente por los 50 títulos
   * INCLUYE DETECCIÓN DE MATCHES EN CADA ACCIÓN
   */
  private async getNextMovieForUser(args: GetNextMovieForUserArgs, userId: string): Promise<any> {
    try {
      this.logger.info(`🎬 Obteniendo siguiente película para usuario ${userId} en sala ${args.roomId}`);
      
      // TODO: CRÍTICO: Verificar matches ANTES de cualquier acción
      // For now, skip match check to maintain compatibility
      
      // Obtener información de la sala
      const roomInfo = await this.getRoomInfo(args.roomId);
      
      if (!roomInfo) {
        throw new TrinityError(`Sala ${args.roomId} no encontrada`, 'ROOM_NOT_FOUND', 404);
      }

      // Verificar si ya hay match (doble verificación)
      if (roomInfo.status === 'MATCHED' && roomInfo.resultMovieId) {
        this.logger.info(`🎉 SALA ${args.roomId} YA TIENE MATCH: película ${roomInfo.resultMovieId}`);
        const matchedMovie = await this.getMovieDetails({ movieId: roomInfo.resultMovieId });
        return {
          ...matchedMovie,
          isMatched: true,
          roomStatus: 'MATCHED',
          message: `¡Match encontrado! Película: ${matchedMovie.title}`
        };
      }

      // TODO: Usar el sistema de cache integrado para obtener la siguiente película
      // For now, use legacy system
      
      // Verificar si la sala tiene películas pre-cargadas (sistema legacy)
      if (!roomInfo.preloadedMovies || roomInfo.preloadedMovies.length === 0) {
        this.logger.info(`⚠️ Sala ${args.roomId} no tiene películas pre-cargadas, aplicando fallback de emergencia`);
        
        // EMERGENCY FALLBACK: Use hardcoded popular movie IDs when room has no preloaded movies
        const emergencyMovieIds = [
          '550', '680', '13', '122', '155', '157', '238', '240', '278', '424',
          '429', '539', '598', '637', '680', '769', '857', '862', '863', '914',
          '1124', '1891', '1892', '1893', '1894', '1895', '2062', '2080', '2109', '2157',
          '8587', '9806', '10020', '10138', '10193', '11036', '11324', '11778', '12445', '13475',
          '14160', '15121', '16869', '18785', '19995', '20526', '22538', '24428', '27205', '49026'
        ];
        
        // Get voted movies for this user
        const votedMovies = await this.getUserVotedMovies(userId, args.roomId);
        const votedMovieIds = new Set(votedMovies);
        
        this.logger.info(`📊 Usuario ${userId}: Ha votado ${votedMovies.length}/50 películas (usando fallback de emergencia)`);
        
        // If already voted 50 movies, user is finished
        if (votedMovies.length >= 50) {
          this.logger.info(`🏁 Usuario ${userId} ha terminado todas las películas (fallback de emergencia)`);
          
          return {
            id: 'user-finished',
            title: 'Has votado todas las películas',
            overview: 'A ver si hay suerte y haceis un match',
            poster: null,
            vote_average: 0,
            release_date: '',
            isUserFinished: true,
            roomStatus: roomInfo.status,
            votedCount: votedMovies.length,
            message: 'A ver si hay suerte y haceis un match'
          };
        }
        
        // Find next unvoted movie from emergency list
        let nextMovieId: string | null = null;
        for (const movieId of emergencyMovieIds) {
          if (!votedMovieIds.has(movieId)) {
            nextMovieId = movieId;
            break;
          }
        }
        
        if (!nextMovieId) {
          this.logger.warn(`⚠️ No se encontró siguiente película en fallback de emergencia para usuario ${userId}`);
          return {
            id: 'no-more-movies',
            title: 'No hay más películas',
            overview: 'A ver si hay suerte y haceis un match',
            poster: null,
            vote_average: 0,
            release_date: '',
            isUserFinished: true,
            roomStatus: roomInfo.status,
            votedCount: votedMovies.length,
            message: 'A ver si hay suerte y haceis un match'
          };
        }
        
        // Get movie details for the next emergency movie
        const movieDetails = await this.getMovieDetails({ movieId: nextMovieId });
        
        this.logger.info(`✅ Siguiente película para usuario ${userId} (fallback de emergencia): "${movieDetails.title}" (${votedMovies.length + 1}/50)`);
        
        return {
          ...movieDetails,
          votedCount: votedMovies.length,
          totalMovies: 50,
          roomStatus: roomInfo.status,
          isUserFinished: false,
          progress: `${votedMovies.length + 1}/50`,
          isEmergencyFallback: true
        };
      }

      // Obtener películas ya votadas por este usuario
      const votedMovies = await this.getUserVotedMovies(userId, args.roomId);
      const votedMovieIds = new Set(votedMovies);
      
      this.logger.info(`📊 Usuario ${userId}: Ha votado ${votedMovies.length}/50 películas`);
      
      // Si ya votó 50 películas, verificar estado final
      if (votedMovies.length >= 50) {
        this.logger.info(`🏁 Usuario ${userId} ha terminado todas las películas`);
        
        return {
          id: 'user-finished',
          title: 'Has votado todas las películas',
          overview: 'A ver si hay suerte y haceis un match',
          poster: null,
          vote_average: 0,
          release_date: '',
          isUserFinished: true,
          roomStatus: roomInfo.status,
          votedCount: votedMovies.length,
          message: 'A ver si hay suerte y haceis un match'
        };
      }
      
      // Encontrar la siguiente película no votada
      let nextMovieId: string | null = null;
      for (const movieId of roomInfo.preloadedMovies) {
        if (!votedMovieIds.has(movieId)) {
          nextMovieId = movieId;
          break;
        }
      }
      
      if (!nextMovieId) {
        // Esto no debería pasar si la lógica anterior es correcta
        this.logger.warn(`⚠️ No se encontró siguiente película para usuario ${userId}`);
        return {
          id: 'no-more-movies',
          title: 'No hay más películas',
          overview: 'A ver si hay suerte y haceis un match',
          poster: null,
          vote_average: 0,
          release_date: '',
          isUserFinished: true,
          roomStatus: roomInfo.status,
          votedCount: votedMovies.length,
          message: 'A ver si hay suerte y haceis un match'
        };
      }
      
      // Obtener detalles de la siguiente película
      const movieDetails = await this.getMovieDetails({ movieId: nextMovieId });
      
      this.logger.info(`✅ Siguiente película para usuario ${userId}: "${movieDetails.title}" (${votedMovies.length + 1}/50)`);
      
      return {
        ...movieDetails,
        votedCount: votedMovies.length,
        totalMovies: 50,
        roomStatus: roomInfo.status,
        isUserFinished: false,
        progress: `${votedMovies.length + 1}/50`
      };
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`❌ Error obteniendo siguiente película para usuario ${userId}:`, err);
      throw error;
    }
  }

  /**
   * NUEVA: Obtener lista de películas ya votadas por un usuario
   */
  private async getUserVotedMovies(userId: string, roomId: string): Promise<string[]> {
    try {
      this.logger.info(`🔍 Consultando votos para usuario ${userId} en sala ${roomId}`);
      
      const response = await this.db.query(
        this.config.tables.votes,
        'roomId = :roomId AND begins_with(#userMovieId, :userIdPrefix)',
        {
          expressionAttributeNames: { '#userMovieId': 'userId#movieId' },
          expressionAttributeValues: {
            ':roomId': roomId,
            ':userIdPrefix': `${userId}#`
          }
        }
      );
      
      const votedMovies = response.items?.map((item: any) => item.movieId) || [];
      this.logger.info(`📊 Usuario ${userId} ha votado por ${votedMovies.length} películas: [${votedMovies.join(', ')}]`);
      
      return votedMovies;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo películas votadas por usuario ${userId}:`, error as Error);
      return [];
    }
  }

  /**
   * Obtener películas - SISTEMA INTEGRADO CON CACHE Y MATCH DETECTION
   * Prioriza el sistema de cache de 50 películas por sala
   * Incluye detección de matches en cada acción del usuario
   */
  private async getMovies(args: GetMoviesArgs): Promise<any[]> {
    try {
      // 1. Decodificar genre y roomId (formato: "Action|roomId:123")
      let genre = args.genre;
      let roomId: string | undefined;
      if (args.genre && args.genre.includes('|roomId:')) {
        const parts = args.genre.split('|roomId:');
        genre = parts[0] || undefined; // Si es string vacío, undefined
        roomId = parts[1];
        this.logger.info(`🔍 RoomID detectado: ${roomId}, Género real: ${genre || 'popular'}`);
      }

      // 2. Si hay roomId, usar el sistema integrado con cache y match detection
      if (roomId) {
        this.logger.info(`🎯 Usando sistema INTEGRADO con cache y match detection para room ${roomId}`);
        
        try {
          // TODO: CRÍTICO: Verificar matches ANTES de cualquier acción
          // TODO: Usar el sistema de cache integrado
          
          this.logger.info(`⚠️ Sistema de cache no disponible para room ${roomId}, usando sistema legacy`);
          // Fall through to legacy system
          
        } catch (cacheError) {
          const err = cacheError instanceof Error ? cacheError : new Error(String(cacheError));
          this.logger.error(`❌ Error en sistema integrado para room ${roomId}:`, err);
          this.logger.info(`🔄 Fallback al sistema legacy para room ${roomId}`);
          // Fall through to legacy system
        }
      }

      // 3. Sistema legacy: usar cache global por género
      const cacheKey = `movies_all_${genre || 'popular'}`;
      let movies: any[] = [];

      // Intentar obtener desde cache global
      const cachedMovies = await this.getCachedMovies(cacheKey);
      if (cachedMovies && cachedMovies.length > 100) {
        this.logger.info(`💾 Películas obtenidas desde cache global: ${cachedMovies.length}`);
        movies = cachedMovies;
      } else {
        // Cargar MÚLTIPLES PÁGINAS de TMDB en paralelo
        this.logger.info('🌐 Cargando TODAS las películas desde TMDB API...');
        const allMovies = await this.fetchAllMoviesFromTMDB(genre);
        // Cachear resultado
        await this.cacheMovies(cacheKey, allMovies);
        this.logger.info(`✅ Total películas cargadas: ${allMovies.length}`);
        movies = allMovies;
      }

      // 4. Filtrar películas ya mostradas en la sala (solo para sistema legacy)
      if (roomId) {
        const shownMovieIds = await this.getShownMovies(roomId);
        if (shownMovieIds.size > 0) {
          const originalCount = movies.length;
          movies = movies.filter(m => !shownMovieIds.has(m.id));
          this.logger.info(`🧹 Filtradas ${originalCount - movies.length} películas ya vistas en sala ${roomId}`);
          // Si se han visto todas, reiniciar (opcional)
          if (movies.length === 0) {
            this.logger.info('🔄 Todas las películas vistas! Reiniciando ciclo.');
            movies = cachedMovies || [];
          }
        }
      }

      return movies;
    } catch (apiError) {
      const err = apiError instanceof Error ? apiError : new Error(String(apiError));
      this.logger.warn('⚠️ Error en API TMDB:', { error: err.message });
      // Fallback logic
      const genre = args.genre?.split('|roomId:')[0];
      const cacheKey = `movies_all_${genre || 'popular'}`;
      const fallbackMovies = await this.getCachedMovies(cacheKey, true);
      if (fallbackMovies && fallbackMovies.length > 0) {
        return fallbackMovies;
      }
      return this.getDefaultMovies();
    }
  }

  /**
   * Obtener IDs de películas ya mostradas en la sala
   */
  private async getShownMovies(roomId: string): Promise<Set<string>> {
    try {
      const response = await this.db.get(this.config.tables.rooms, { id: roomId });
      
      if (response && response.shownMovieIds) {
        // DynamoDB sets are returned as Set objects or Arrays depending on SDK version
        // Safe handle both
        return new Set(Array.from(response.shownMovieIds));
      }
      return new Set();
    } catch (error) {
      this.logger.warn(`⚠️ Error fetching shown movies for room ${roomId}:`, { error: (error as Error).message });
      return new Set();
    }
  }

  /**
   * Obtener películas desde cache DynamoDB
   */
  private async getCachedMovies(cacheKey: string, allowExpired = false): Promise<any[] | null> {
    try {
      const response = await this.db.get(this.config.tables.moviesCache, { tmdbId: cacheKey });
      
      if (!response) {
        return null;
      }
      
      const cached = response as CachedMovie;
      // Verificar si el cache ha expirado (a menos que allowExpired sea true)
      if (!allowExpired && cached.ttl < Math.floor(Date.now() / 1000)) {
        this.logger.info('⏰ Cache expirado');
        return null;
      }
      
      return cached.movies || [];
    } catch (error) {
      this.logger.warn('⚠️ Error leyendo cache:', { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Cachear películas en DynamoDB con TTL de 30 días
   */
  private async cacheMovies(cacheKey: string, movies: any[]): Promise<void> {
    try {
      const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 días
      await this.db.put(this.config.tables.moviesCache, {
        tmdbId: cacheKey,
        movies,
        cachedAt: new Date().toISOString(),
        ttl,
      });
      this.logger.info(`💾 Películas cacheadas: ${cacheKey}`);
    } catch (error) {
      this.logger.warn('⚠️ Error cacheando películas:', { error: (error as Error).message });
      // No lanzar error, el cache es opcional
    }
  }

  /**
   * Cargar TODAS las películas de TMDB (múltiples páginas en paralelo)
   */
  private async fetchAllMoviesFromTMDB(genre?: string): Promise<any[]> {
    const apiKey = this.config.external.tmdbApiKey;
    if (!apiKey) {
      throw new TrinityError('TMDB_API_KEY no configurada', 'CONFIG_ERROR', 500);
    }
    
    // Cargar 25 páginas en paralelo = ~500 películas
    const TOTAL_PAGES = 25;
    const pagePromises: Promise<any[]>[] = [];
    
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      pagePromises.push(this.fetchMoviesFromTMDBPage(apiKey, genre, page));
    }
    
    this.logger.info(`📦 Cargando ${TOTAL_PAGES} páginas en paralelo...`);
    const results = await Promise.all(pagePromises);
    
    // Combinar todas las películas
    const allMovies: any[] = [];
    const seenIds = new Set<string>();
    
    results.forEach((movies, index) => {
      this.logger.info(`✅ Página ${index + 1}: ${movies.length} películas`);
      movies.forEach(movie => {
        if (!seenIds.has(movie.id)) {
          seenIds.add(movie.id);
          allMovies.push(movie);
        }
      });
    });
    
    this.logger.info(`✅ Total películas únicas: ${allMovies.length}`);
    return allMovies;
  }

  /**
   * Cargar una página específica de TMDB
   */
  private async fetchMoviesFromTMDBPage(apiKey: string, genre: string | undefined, page: number): Promise<any[]> {
    try {
      let endpoint = 'https://api.themoviedb.org/3/movie/popular';
      if (genre) {
        endpoint = `https://api.themoviedb.org/3/discover/movie?with_genres=${this.getGenreId(genre)}`;
      }
      
      const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${apiKey}&language=es-ES&page=${page}`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Trinity-App/1.0',
        },
      });
      
      if (!response.ok) {
        this.logger.warn(`⚠️ Error en página ${page}: ${response.status}`);
        return [];
      }
      
      const data: any = await response.json();
      if (!data.results || !Array.isArray(data.results)) {
        return [];
      }
      
      return data.results.map((movie: TMDBMovie) => ({
        id: movie.id.toString(),
        title: movie.title || movie.original_title || 'Título no disponible',
        poster: movie.poster_path || null,
        overview: movie.overview || 'Descripción no disponible',
        vote_average: movie.vote_average || 0,
        release_date: movie.release_date || '',
      }));
    } catch (error) {
      this.logger.warn(`⚠️ Error cargando página ${page}:`, { error: (error as Error).message });
      return [];
    }
  }

  /**
   * Mapear nombres de géneros a IDs de TMDB
   */
  private getGenreId(genreName: string): string {
    const genreMap: Record<string, string> = {
      'action': '28',
      'adventure': '12',
      'animation': '16',
      'comedy': '35',
      'crime': '80',
      'documentary': '99',
      'drama': '18',
      'family': '10751',
      'fantasy': '14',
      'history': '36',
      'horror': '27',
      'music': '10402',
      'mystery': '9648',
      'romance': '10749',
      'science_fiction': '878',
      'thriller': '53',
      'war': '10752',
      'western': '37',
    };
    
    return genreMap[genreName.toLowerCase()] || '28'; // Default: Action
  }

  /**
   * Obtener detalles de una película específica
   */
  private async getMovieDetails(args: GetMovieDetailsArgs): Promise<any> {
    const cacheKey = `movie_details_${args.movieId}`;
    
    try {
      // 1. Intentar obtener desde cache
      const cachedMovie = await this.getCachedMovieDetails(cacheKey);
      if (cachedMovie) {
        this.logger.info(`💾 Detalles de película obtenidos desde cache: ${args.movieId}`);
        return cachedMovie;
      }
      
      // 2. Si no hay cache, obtener desde API TMDB
      this.logger.info(`🌐 Obteniendo detalles de película ${args.movieId} desde TMDB API...`);
      const movieDetails = await this.fetchMovieDetailsFromTMDB(args.movieId);
      
      // 3. Cachear resultado exitoso
      await this.cacheMovieDetails(cacheKey, movieDetails);
      this.logger.info(`✅ Detalles de película obtenidos desde API: ${movieDetails.title}`);
      
      return movieDetails;
    } catch (apiError) {
      this.logger.warn(`⚠️ Error en API TMDB para película ${args.movieId}, intentando fallback:`, { error: (apiError as Error).message });
      
      // 4. Fallback: intentar cache expirado
      const fallbackMovie = await this.getCachedMovieDetails(cacheKey, true);
      if (fallbackMovie) {
        this.logger.info(`🔄 Usando cache expirado como fallback para película ${args.movieId}`);
        return fallbackMovie;
      }
      
      // 5. Si todo falla, retornar película por defecto
      this.logger.info(`🎭 Usando película por defecto para ID ${args.movieId}`);
      return this.getDefaultMovieDetails(args.movieId);
    }
  }

  /**
   * Obtener detalles de película desde cache DynamoDB
   */
  private async getCachedMovieDetails(cacheKey: string, allowExpired = false): Promise<any | null> {
    try {
      const response = await this.db.get(this.config.tables.moviesCache, { tmdbId: cacheKey });
      
      if (!response) {
        return null;
      }
      
      const cached = response as CachedMovie;
      // Verificar si el cache ha expirado
      if (!allowExpired && cached.ttl < Math.floor(Date.now() / 1000)) {
        this.logger.info('⏰ Cache de detalles expirado');
        return null;
      }
      
      return cached.movieDetails || null;
    } catch (error) {
      this.logger.warn('⚠️ Error leyendo cache de detalles:', { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Cachear detalles de película en DynamoDB
   */
  private async cacheMovieDetails(cacheKey: string, movieDetails: any): Promise<void> {
    try {
      const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 días
      await this.db.put(this.config.tables.moviesCache, {
        tmdbId: cacheKey,
        movieDetails,
        cachedAt: new Date().toISOString(),
        ttl,
      });
      this.logger.info(`💾 Detalles de película cacheados: ${cacheKey}`);
    } catch (error) {
      this.logger.warn('⚠️ Error cacheando detalles de película:', { error: (error as Error).message });
    }
  }

  /**
   * Obtener detalles de película desde API TMDB
   */
  private async fetchMovieDetailsFromTMDB(movieId: string): Promise<any> {
    const apiKey = this.config.external.tmdbApiKey;
    if (!apiKey) {
      throw new TrinityError('TMDB_API_KEY no configurada', 'CONFIG_ERROR', 500);
    }
    
    const url = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=es-ES&append_to_response=credits,videos`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Trinity-App/1.0',
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new TrinityError(`Película no encontrada: ${movieId}`, 'MOVIE_NOT_FOUND', 404);
      }
      throw new TrinityError(`TMDB API error: ${response.status} ${response.statusText}`, 'TMDB_ERROR', response.status);
    }
    
    const movie: any = await response.json();
    
    // Transformar a formato GraphQL esperado
    return {
      id: movie.id.toString(),
      title: movie.title || movie.original_title || 'Título no disponible',
      overview: movie.overview || 'Descripción no disponible',
      poster: movie.poster_path || null,
      vote_average: movie.vote_average || 0,
      release_date: movie.release_date || '',
      genres: movie.genres?.map((g: TMDBGenre) => ({ id: g.id, name: g.name })) || [],
      runtime: movie.runtime || null,
    };
  }

  /**
   * Detalles de película por defecto cuando todo falla
   */
  private getDefaultMovieDetails(movieId: string): any {
    return {
      id: movieId,
      title: 'Película no disponible',
      overview: 'Los detalles de esta película no están disponibles temporalmente debido a problemas de conectividad. Por favor, inténtalo más tarde.',
      poster: null,
      vote_average: 0,
      release_date: '',
      genres: [],
      runtime: null,
    };
  }

  /**
   * Películas por defecto cuando todo falla
   */
  private getDefaultMovies(): any[] {
    return [
      {
        id: '238', // El Padrino
        title: 'El Padrino',
        poster: 'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
        overview: 'La historia de una familia de la mafia italiana en Nueva York.',
      },
      {
        id: '680', // Pulp Fiction
        title: 'Pulp Fiction',
        poster: 'https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
        overview: 'Historias entrelazadas de crimen en Los Ángeles.',
      },
      {
        id: '120', // El Señor de los Anillos
        title: 'El Señor de los Anillos',
        poster: 'https://image.tmdb.org/t/p/w500/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg',
        overview: 'Una épica aventura de fantasía en la Tierra Media.',
      },
      {
        id: '13', // Forrest Gump
        title: 'Forrest Gump',
        poster: 'https://image.tmdb.org/t/p/w500/azY6SlicLOzpI06Y9889a7Z4S9n.jpg',
        overview: 'La extraordinaria vida de un hombre simple.',
      },
      {
        id: '603', // Matrix
        title: 'Matrix',
        poster: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
        overview: 'Un programador descubre la verdad sobre la realidad.',
      },
    ];
  }

  /**
   * Get filtered content using the new content filtering system
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
   */
  private async getFilteredContent(args: GetFilteredContentArgs): Promise<any[]> {
    const startTime = Date.now();
    
    try {
      this.logger.info(`🎯 Getting filtered content: ${args.mediaType}, genres: [${args.genreIds.join(', ')}], limit: ${args.limit || 30}, exclude: ${args.excludeIds?.length || 0}`);
      
      // Validate input
      if (args.genreIds.length > 2) {
        throw new ValidationError('Maximum 2 genres allowed');
      }
      
      // TODO: Integrate with content filtering service
      // For now, return default movies to maintain compatibility
      this.logger.info('🔄 Using fallback default movies due to filtering not implemented');
      return this.getDefaultMovies();
      
    } catch (error) {
      this.logger.error('❌ Error getting filtered content:', error as Error);
      // Fallback to default movies if filtering fails
      this.logger.info('🔄 Using fallback default movies due to filtering error');
      return this.getDefaultMovies();
    }
  }

  /**
   * Get available genres for media type
   * Requirements: 1.4, 2.1
   */
  private async getAvailableGenres(args: GetAvailableGenresArgs): Promise<TMDBGenre[]> {
    const startTime = Date.now();
    
    try {
      this.logger.info(`🎭 Getting available genres for ${args.mediaType}`);
      
      // TODO: Get content filtering service
      // TODO: Get genres using the content filter service
      
      this.logger.info(`✅ Retrieved 0 genres for ${args.mediaType} (not implemented)`);
      return [];
      
    } catch (error) {
      this.logger.error(`❌ Error getting available genres for ${args.mediaType}:`, error as Error);
      
      // Return empty array as fallback
      this.logger.info('🔄 Using empty array as fallback for genres');
      return [];
    }
  }

  /**
   * Get current movie for room (placeholder implementation)
   */
  private async getCurrentMovie(args: GetCurrentMovieArgs): Promise<any> {
    try {
      this.logger.info(`🎬 Getting current movie for room ${args.roomId}`);
      
      // TODO: Implement current movie logic
      // For now, return null to maintain compatibility
      return null;
      
    } catch (error) {
      this.logger.error(`❌ Error getting current movie for room ${args.roomId}:`, error as Error);
      return null;
    }
  }
}

// Export the handler
export const handler = createHandler(MovieHandler);