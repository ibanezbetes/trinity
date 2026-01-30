// Servicio para obtener películas y series usando AppSync con Circuit Breaker
import { appSyncService } from './appSyncService';
import { imageCacheService } from './imageCacheService';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export interface StreamingProvider {
  id: number;
  name: string;
  logoPath: string;
}

export interface MediaItem {
  id: string;
  title: string;
  overview: string;
  poster: string | null;
  release_date: string;
  runtime: number;
  vote_average: number;
  genres: Array<{ id: number; name: string }>;
  rating: number;
  voteCount: number;
  mediaType: 'movie' | 'tv';
  platform?: string;
  streamingProviders?: StreamingProvider[];
  isNew?: boolean;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
}

export interface WatchProvider {
  id: number;
  name: string;
  logoPath: string;
  type: 'streaming' | 'rent' | 'buy';
}

export interface MediaItemDetails extends MediaItem {
  // Properties expected by room screen
  mediaPosterPath?: string | null;
  mediaTitle?: string;
  mediaYear?: string;
  mediaOverview?: string;
  mediaRating?: number | null;
  remoteId?: string; // ID original from AppSync (can be UUID)
}

export interface MediaResponse {
  results: MediaItem[];
  page: number;
  totalPages: number;
  totalResults: number;
}

// Mapeo de géneros de TMDB
const genreMap: Record<number, string> = {
  28: 'Acción',
  12: 'Aventura',
  16: 'Animación',
  35: 'Comedia',
  80: 'Crimen',
  99: 'Documental',
  18: 'Drama',
  10751: 'Familia',
  14: 'Fantasía',
  36: 'Historia',
  27: 'Terror',
  10402: 'Música',
  9648: 'Misterio',
  10749: 'Romance',
  878: 'Ciencia ficción',
  10770: 'Película de TV',
  53: 'Suspense',
  10752: 'Bélica',
  37: 'Western',
  // TV genres
  10759: 'Acción y Aventura',
  10762: 'Infantil',
  10763: 'Noticias',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Telenovela',
  10767: 'Talk Show',
  10768: 'Guerra y Política',
};

// Plataformas ficticias para mostrar
const platforms = ['Netflix', 'Prime Video', 'Disney+', 'HBO Max', 'Apple TV+'];

const getRandomPlatform = () => platforms[Math.floor(Math.random() * platforms.length)];

const transformTMDBItem = (item: any, mediaType: 'movie' | 'tv'): MediaItem => {
  const releaseDate = item.release_date || item.first_air_date || '';

  return {
    id: `${mediaType}-${item.id}`,
    title: item.title || item.name,
    overview: item.overview,
    poster: item.poster_path
      ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}`
      : null,
    release_date: releaseDate,
    runtime: item.runtime || 0,
    vote_average: Math.round(item.vote_average * 10) / 10,
    genres: (item.genre_ids || []).map((id: number) => ({ 
      id, 
      name: genreMap[id] || 'Otro' 
    })),
  };
};

class MediaService {
  private providersCache: Map<string, StreamingProvider[]> = new Map();

  /**
   * Obtener detalles de película usando AppSync con Circuit Breaker
   */
  async getMovieDetails(tmdbId: number): Promise<MediaItemDetails | null> {
    try {
      console.log(`🎬 Fetching movie details for ID: ${tmdbId} via AppSync`);

      const result = await appSyncService.getMovieDetails(tmdbId.toString());

      if (!result.getMovieDetails) {
        console.warn(`⚠️ No movie details found for ID: ${tmdbId}`);
        return null;
      }

      const details = result.getMovieDetails;

      // Transformar respuesta de GraphQL al formato esperado
      const movieDetails: MediaItemDetails = {
        id: `movie-${details.id}`,
        remoteId: details.id,
        title: details.title,
        overview: details.overview || '',
        poster: details.poster || null,
        release_date: details.release_date || '',
        runtime: details.runtime || 0,
        vote_average: Math.round((details.vote_average || 0) * 10) / 10,
        genres: details.genres || [],
        // Properties expected by room screen
        mediaTitle: details.title,
        mediaYear: details.release_date ? details.release_date.split('-')[0] : '',
        mediaOverview: details.overview || '',
        mediaRating: details.vote_average || null,
        mediaPosterPath: details.poster || null,
      };

      // Get cached poster image if available
      if (movieDetails.poster) {
        try {
          const cachedPosterPath = await imageCacheService.getCachedImage(movieDetails.poster);
          movieDetails.poster = cachedPosterPath;
          movieDetails.mediaPosterPath = cachedPosterPath;
        } catch (error) {
          console.warn(`⚠️ Failed to get cached poster for ${movieDetails.title}:`, error);
          // Keep original poster as fallback
        }
      }

      console.log(`✅ Movie details loaded successfully: ${movieDetails.title}`);
      return movieDetails;

    } catch (error: any) {
      console.error('❌ Error fetching movie details via AppSync:', error);

      // Manejar errores específicos del Circuit Breaker
      if (error.message?.includes('Circuit breaker is OPEN')) {
        console.warn('⚡ Circuit breaker is open, service temporarily unavailable');
        // Podrías devolver datos en caché o un fallback aquí
        return this.getFallbackMovieDetails(tmdbId);
      }

      if (error.message?.includes('Service temporarily unavailable')) {
        console.warn('🔧 External service unavailable, using fallback');
        return this.getFallbackMovieDetails(tmdbId);
      }

      // Para otros errores, devolver null
      return null;
    }
  }

  /**
   * Obtener detalles de serie usando AppSync con Circuit Breaker
   */
  async getTVDetails(tmdbId: number): Promise<MediaItemDetails | null> {
    try {
      console.log(`📺 Fetching TV details for ID: ${tmdbId} via AppSync`);

      // Por ahora, usar el mismo endpoint que movies
      // En una implementación real, habría un endpoint separado para TV
      const result = await appSyncService.getMovieDetails(tmdbId.toString());

      if (!result.getMovieDetails) {
        console.warn(`⚠️ No TV details found for ID: ${tmdbId}`);
        return null;
      }

      const details = result.getMovieDetails;

      // Transformar respuesta de GraphQL al formato esperado para TV
      const tvDetails: MediaItemDetails = {
        id: `tv-${details.id}`,
        remoteId: details.id,
        title: details.title,
        overview: details.overview || '',
        poster: details.poster || null,
        release_date: details.release_date || '',
        runtime: details.runtime || 0,
        vote_average: Math.round((details.vote_average || 0) * 10) / 10,
        genres: details.genres || [],
        // Properties expected by room screen
        mediaTitle: details.title,
        mediaYear: details.release_date ? details.release_date.split('-')[0] : '',
        mediaOverview: details.overview || '',
        mediaRating: details.vote_average || null,
        mediaPosterPath: details.poster || null,
      };

      // Get cached poster image if available
      if (tvDetails.poster) {
        try {
          const cachedPosterPath = await imageCacheService.getCachedImage(tvDetails.poster);
          tvDetails.poster = cachedPosterPath;
          tvDetails.mediaPosterPath = cachedPosterPath;
        } catch (error) {
          console.warn(`⚠️ Failed to get cached poster for ${tvDetails.title}:`, error);
          // Keep original poster as fallback
        }
      }

      console.log(`✅ TV details loaded successfully: ${tvDetails.title}`);
      return tvDetails;

    } catch (error: any) {
      console.error('❌ Error fetching TV details via AppSync:', error);

      // Manejar errores del Circuit Breaker
      if (error.message?.includes('Circuit breaker is OPEN')) {
        console.warn('⚡ Circuit breaker is open for TV service');
        return this.getFallbackTVDetails(tmdbId);
      }

      return null;
    }
  }

  /**
   * Datos de fallback cuando el Circuit Breaker está abierto
   */
  private getFallbackMovieDetails(tmdbId: number): MediaItemDetails {
    console.log(`🔄 Using fallback data for movie ID: ${tmdbId}`);

    return {
      id: `movie-${tmdbId}`,
      remoteId: tmdbId.toString(),
      title: 'Película no disponible',
      overview: 'Los detalles de esta película no están disponibles temporalmente debido a problemas de conectividad. Por favor, inténtalo más tarde.',
      poster: null,
      release_date: '',
      runtime: 0,
      vote_average: 0,
      genres: [{ id: 0, name: 'No disponible' }],
      // Properties expected by room screen
      mediaTitle: 'Película no disponible',
      mediaYear: '',
      mediaOverview: 'Los detalles de esta película no están disponibles temporalmente.',
      mediaRating: null,
      mediaPosterPath: null,
    };
  }

  /**
   * Datos de fallback para series cuando el Circuit Breaker está abierto
   */
  private getFallbackTVDetails(tmdbId: number): MediaItemDetails {
    console.log(`🔄 Using fallback data for TV ID: ${tmdbId}`);

    return {
      id: `tv-${tmdbId}`,
      remoteId: tmdbId.toString(),
      title: 'Serie no disponible',
      overview: 'Los detalles de esta serie no están disponibles temporalmente debido a problemas de conectividad. Por favor, inténtalo más tarde.',
      poster: null,
      release_date: '',
      runtime: 0,
      vote_average: 0,
      genres: [{ id: 0, name: 'No disponible' }],
      // Properties expected by room screen
      mediaTitle: 'Serie no disponible',
      mediaYear: '',
      mediaOverview: 'Los detalles de esta serie no están disponibles temporalmente.',
      mediaRating: null,
      mediaPosterPath: null,
    };
  }

  // Métodos legacy mantenidos para compatibilidad (ahora usan fallback local)
  async getPopularMovies(page = 1): Promise<MediaResponse> {
    console.warn('⚠️ getPopularMovies: Using legacy fallback data');
    return this.getLegacyFallbackResponse();
  }

  async getPopularTV(page = 1): Promise<MediaResponse> {
    console.warn('⚠️ getPopularTV: Using legacy fallback data');
    return this.getLegacyFallbackResponse();
  }

  async getTrending(timeWindow: 'day' | 'week' = 'week', page = 1): Promise<MediaResponse> {
    console.warn('⚠️ getTrending: Using legacy fallback data');
    return this.getLegacyFallbackResponse();
  }

  async searchContent(query: string, page = 1): Promise<MediaResponse> {
    console.warn('⚠️ searchContent: Using legacy fallback data');
    return this.getLegacyFallbackResponse();
  }

  async discoverMovies(filters: any = {}): Promise<MediaResponse> {
    console.warn('⚠️ discoverMovies: Using legacy fallback data');
    return this.getLegacyFallbackResponse();
  }

  async discoverTV(filters: any = {}): Promise<MediaResponse> {
    console.warn('⚠️ discoverTV: Using legacy fallback data');
    return this.getLegacyFallbackResponse();
  }

  private getLegacyFallbackResponse(): MediaResponse {
    return {
      results: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    };
  }

  // Métodos de utilidad mantenidos
  async getStreamingProviders(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<StreamingProvider[]> {
    // Devolver array vacío ya que no tenemos esta funcionalidad en AppSync aún
    return [];
  }

  /**
   * Pre-cache images for offline viewing
   */
  async preCacheImages(imageUris: string[]): Promise<void> {
    if (!imageUris || imageUris.length === 0) return;

    console.log(`🖼️ Pre-caching ${imageUris.length} images via MediaService`);

    try {
      await imageCacheService.preCacheImages(imageUris);
      console.log(`✅ Successfully pre-cached ${imageUris.length} images`);
    } catch (error) {
      console.error('❌ Error pre-caching images:', error);
    }
  }

  /**
   * Get cached image or original URI
   */
  async getCachedImageUri(originalUri: string): Promise<string> {
    if (!originalUri) return originalUri;

    try {
      return await imageCacheService.getCachedImage(originalUri);
    } catch (error) {
      console.warn(`⚠️ Failed to get cached image for ${originalUri}:`, error);
      return originalUri;
    }
  }

  /**
   * Clear image cache
   */
  async clearImageCache(): Promise<void> {
    try {
      await imageCacheService.clearCache();
      console.log('✅ Image cache cleared successfully');
    } catch (error) {
      console.error('❌ Error clearing image cache:', error);
    }
  }

  /**
   * Get image cache statistics
   */
  getImageCacheStats() {
    return imageCacheService.getCacheStats();
  }

  /**
   * Get current media for a room (required by room screen)
   * Now uses the advanced content filtering system when available
   */
  async getCurrentMedia(roomId: string, excludeIds: string[] = []): Promise<MediaItemDetails | null> {
    try {
      console.log(`🎬 Getting current media for room: ${roomId}, excluding ${excludeIds.length} items`);

      // First, get room details to check if it has filter criteria
      let useFilteredContent = false;
      let mediaType: 'MOVIE' | 'TV' = 'MOVIE';
      let genreIds: number[] = [];

      try {
        console.log('🔍 Checking if room uses advanced filtering...');
        
        // Get room details to extract filter criteria with retry logic
        let room = null;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts && (!room || !room.mediaType)) {
          attempts++;
          console.log(`🔍 Attempt ${attempts}/${maxAttempts} - Getting room details...`);
          
          const roomResult = await appSyncService.getRoom(roomId);
          room = roomResult?.getRoom;
          
          // DEBUG: Log the actual room response to see what we're getting
          console.log('🔍 DEBUG - Room response from getRoom:', JSON.stringify(room, null, 2));
          console.log('🔍 DEBUG - Room mediaType:', room?.mediaType);
          console.log('🔍 DEBUG - Room genreIds:', room?.genreIds);
          console.log('🔍 DEBUG - Room genreIds length:', room?.genreIds?.length);
          
          if (room && room.mediaType && room.genreIds && room.genreIds.length > 0) {
            break; // Success, exit retry loop
          }
          
          if (attempts < maxAttempts) {
            console.log(`⏳ Room data incomplete, waiting 1s before retry...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        if (room && room.mediaType && room.genreIds && room.genreIds.length > 0) {
          mediaType = room.mediaType;
          genreIds = room.genreIds;
          useFilteredContent = true;
          console.log(`🎯 Room has filtering: ${mediaType}, genres: [${genreIds.join(', ')}]`);
        } else {
          console.log('🔄 Room has no filtering criteria, using legacy system');
        }
        
        // Try the new filtered content approach if room has filters
        if (useFilteredContent) {
          const filteredResult = await appSyncService.getFilteredContent(
            mediaType,
            genreIds,
            30,
            excludeIds
          );

          if (filteredResult.getFilteredContent && filteredResult.getFilteredContent.length > 0) {
            console.log(`✅ Using advanced filtering system: ${filteredResult.getFilteredContent.length} items available`);
            
            // Get a random movie from filtered results
            const randomIndex = Math.floor(Math.random() * filteredResult.getFilteredContent.length);
            const movie = filteredResult.getFilteredContent[randomIndex];

            const currentMedia: MediaItemDetails = {
              id: movie.id || `movie-unknown`,
              remoteId: movie.id || 'unknown',
              title: movie.title || 'Título no disponible',
              overview: movie.overview || '',
              poster: movie.poster || null,
              release_date: movie.release_date || '',
              runtime: movie.runtime || 0,
              vote_average: movie.vote_average || 0,
              genres: movie.genres || [],
              // Add properties expected by room screen
              mediaPosterPath: movie.poster || null,
              mediaTitle: movie.title || 'Título no disponible',
              mediaYear: movie.release_date ? movie.release_date.split('-')[0] : '',
              mediaOverview: movie.overview || '',
              mediaRating: movie.vote_average || null,
            };

            console.log(`✅ Current media loaded via filtering: ${currentMedia.title}`);
            return currentMedia;
          } else {
            console.log('🔄 No filtered content available, falling back to legacy system');
          }
        }
      } catch (filterError) {
        console.warn('⚠️ Advanced filtering not available, falling back to legacy system:', filterError);
      }

      // Fallback to legacy system if filtering fails or is not available
      console.log('🔄 Using legacy content loading system...');
      const result = await appSyncService.getMovies(undefined, undefined, undefined, roomId);

      if (!result.getMovies || result.getMovies.length === 0) {
        console.warn(`⚠️ No movies found for room: ${roomId}`);
        return null;
      }

      // Filter out excluded movies
      let availableMovies = result.getMovies;
      if (excludeIds.length > 0) {
        availableMovies = result.getMovies.filter(movie =>
          !excludeIds.includes(movie.id) && !excludeIds.includes(movie.id.toString())
        );

        if (availableMovies.length === 0) {
          console.warn(`⚠️ All movies filtered out by exclusion list for room: ${roomId}`);
          return null;
        }
      }

      // Get a random movie from available ones
      const randomIndex = Math.floor(Math.random() * availableMovies.length);
      const movie = availableMovies[randomIndex];

      const currentMedia: MediaItemDetails = {
        id: `movie-${movie.id}`,
        remoteId: movie.id, // Ensure remoteId is preserved
        title: movie.title,
        overview: movie.overview || '',
        poster: movie.poster
          ? `${TMDB_IMAGE_BASE}/w500${movie.poster}`
          : null,
        release_date: movie.release_date || '',
        runtime: movie.runtime || 0,
        vote_average: Math.round((movie.vote_average || 0) * 10) / 10,
        genres: movie.genres || [],
        rating: Math.round((movie.vote_average || 0) * 10) / 10,
        voteCount: 0,
        mediaType: 'movie' as const,
        // Add properties expected by room screen
        mediaPosterPath: movie.poster,
        mediaTitle: movie.title,
        mediaYear: movie.release_date ? movie.release_date.split('-')[0] : '',
        mediaOverview: movie.overview || '',
        mediaRating: movie.vote_average ? Math.round(movie.vote_average * 10) / 10 : null,
      };

      console.log(`✅ Current media loaded via legacy: ${currentMedia.title}`);
      return currentMedia;

    } catch (error: any) {
      console.error('❌ Error getting current media:', error);

      // Return fallback media to prevent crashes
      return this.getFallbackCurrentMedia(roomId);
    }
  }

  /**
   * Get next media for a room (required by room screen)
   * Now uses the advanced content filtering system when available
   */
  async getNextMedia(roomId: string, excludeIds: string[] = []): Promise<MediaItemDetails | null> {
    try {
      console.log(`🎬 Getting next media for room: ${roomId}, excluding ${excludeIds.length} items`);

      // Get room details to check if it has filter criteria
      let useFilteredContent = false;
      let mediaType: 'MOVIE' | 'TV' = 'MOVIE';
      let genreIds: number[] = [];

      try {
        console.log('🔍 Attempting to use advanced filtering for next media...');
        
        // Get room details to extract filter criteria with retry logic
        let room = null;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts && (!room || !room.mediaType)) {
          attempts++;
          console.log(`🔍 Next media attempt ${attempts}/${maxAttempts} - Getting room details...`);
          
          const roomResult = await appSyncService.getRoom(roomId);
          room = roomResult?.getRoom;
          
          // DEBUG: Log the actual room response to see what we're getting
          console.log('🔍 DEBUG - Next media room response:', JSON.stringify(room, null, 2));
          console.log('🔍 DEBUG - Next media room mediaType:', room?.mediaType);
          console.log('🔍 DEBUG - Next media room genreIds:', room?.genreIds);
          
          if (room && room.mediaType && room.genreIds && room.genreIds.length > 0) {
            break; // Success, exit retry loop
          }
          
          if (attempts < maxAttempts) {
            console.log(`⏳ Next media room data incomplete, waiting 1s before retry...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        if (room && room.mediaType && room.genreIds && room.genreIds.length > 0) {
          mediaType = room.mediaType;
          genreIds = room.genreIds;
          useFilteredContent = true;
          console.log(`🎯 Room has filtering: ${mediaType}, genres: [${genreIds.join(', ')}]`);
        } else {
          console.log('🔄 Room has no filtering criteria, using legacy system');
        }
        
        // Try the new filtered content approach if room has filters
        if (useFilteredContent) {
          const filteredResult = await appSyncService.getFilteredContent(
            mediaType,
            genreIds,
            30,
            excludeIds
          );

          if (filteredResult.getFilteredContent && filteredResult.getFilteredContent.length > 0) {
            console.log(`✅ Using advanced filtering for next media: ${filteredResult.getFilteredContent.length} items available`);
            
            // Get a random movie from filtered results
            const randomIndex = Math.floor(Math.random() * filteredResult.getFilteredContent.length);
            const movie = filteredResult.getFilteredContent[randomIndex];

            const nextMedia: MediaItemDetails = {
              id: movie.id || `movie-unknown`,
              remoteId: movie.id || 'unknown',
              title: movie.title || 'Título no disponible',
              overview: movie.overview || '',
              poster: movie.poster || null,
              release_date: movie.release_date || '',
              runtime: movie.runtime || 0,
              vote_average: movie.vote_average || 0,
              genres: movie.genres || [],
              // Add properties expected by room screen
              mediaPosterPath: movie.poster || null,
              mediaTitle: movie.title || 'Título no disponible',
              mediaYear: movie.release_date ? movie.release_date.split('-')[0] : '',
              mediaOverview: movie.overview || '',
              mediaRating: movie.vote_average || null,
            };

            console.log(`✅ Next media loaded via filtering: ${nextMedia.title}`);
            return nextMedia;
          } else {
            console.log('🔄 No filtered content available, falling back to legacy system');
          }
        }
      } catch (filterError) {
        console.warn('⚠️ Advanced filtering not available for next media, falling back to legacy system:', filterError);
      }

      // Fallback to legacy system
      console.log('🔄 Using legacy system for next media...');
      const result = await appSyncService.getMovies(undefined, undefined, undefined, roomId);

      if (!result.getMovies || result.getMovies.length === 0) {
        console.warn(`⚠️ No more movies found for room: ${roomId}`);
        return null;
      }

      // Filter out excluded movies
      let availableMovies = result.getMovies;
      if (excludeIds.length > 0) {
        availableMovies = result.getMovies.filter(movie =>
          !excludeIds.includes(movie.id) && !excludeIds.includes(movie.id.toString())
        );

        if (availableMovies.length === 0) {
          console.warn(`⚠️ All next movies filtered out for room: ${roomId}`);
          return null;
        }
      }

      // Get a random movie from available ones
      const randomIndex = Math.floor(Math.random() * availableMovies.length);
      const movie = availableMovies[randomIndex];

      const nextMedia: MediaItemDetails = {
        id: `movie-${movie.id}`,
        remoteId: movie.id, // Ensure remoteId is preserved
        title: movie.title,
        overview: movie.overview || '',
        poster: movie.poster
          ? `${TMDB_IMAGE_BASE}/w500${movie.poster}`
          : null,
        release_date: movie.release_date || '',
        runtime: movie.runtime || 0,
        vote_average: Math.round((movie.vote_average || 0) * 10) / 10,
        genres: movie.genres || [],
        rating: Math.round((movie.vote_average || 0) * 10) / 10,
        voteCount: 0,
        mediaType: 'movie' as const,
        // Add properties expected by room screen
        mediaPosterPath: movie.poster,
        mediaTitle: movie.title,
        mediaYear: movie.release_date ? movie.release_date.split('-')[0] : '',
        mediaOverview: movie.overview || '',
        mediaRating: movie.vote_average ? Math.round(movie.vote_average * 10) / 10 : null,
      };

      console.log(`✅ Next media loaded via legacy: ${nextMedia.title}`);
      return nextMedia;

    } catch (error: any) {
      console.error('❌ Error getting next media:', error);

      // Return fallback media to prevent crashes
      return this.getFallbackCurrentMedia(roomId);
    }
  }

  /**
   * Fallback current media when API fails
   */
  private getFallbackCurrentMedia(roomId: string): MediaItemDetails {
    console.log(`🔄 Using fallback current media for room: ${roomId}`);

    return {
      id: `fallback-movie-${Date.now()}`,
      remoteId: '12345',
      title: 'Película de ejemplo',
      overview: 'Esta es una película de ejemplo que se muestra cuando no se pueden cargar los datos reales. Por favor, verifica tu conexión a internet.',
      poster: null,
      release_date: '2024-01-01',
      runtime: 120,
      vote_average: 7.5,
      genres: [{ id: 18, name: 'Drama' }, { id: 28, name: 'Acción' }],
      rating: 7.5,
      voteCount: 1000,
      mediaType: 'movie' as const,
      // Add properties expected by room screen
      mediaPosterPath: null,
      mediaTitle: 'Película de ejemplo',
      mediaYear: '2024',
      mediaOverview: 'Esta es una película de ejemplo que se muestra cuando no se pueden cargar los datos reales.',
      mediaRating: 7.5,
    };
  }
}

// Extraer proveedores de streaming
function extractWatchProviders(results: any): WatchProvider[] {
  // Priorizar España (ES), luego US
  const region = results?.ES || results?.US || null;
  if (!region) return [];

  const providers: WatchProvider[] = [];

  // Flatrate = streaming incluido en suscripción
  if (region.flatrate) {
    region.flatrate.forEach((p: any) => {
      providers.push({
        id: p.provider_id,
        name: p.provider_name,
        logoPath: `${TMDB_IMAGE_BASE}/w92${p.logo_path}`,
        type: 'streaming',
      });
    });
  }

  // Rent = alquiler
  if (region.rent) {
    region.rent.slice(0, 3).forEach((p: any) => {
      if (!providers.find(pr => pr.id === p.provider_id)) {
        providers.push({
          id: p.provider_id,
          name: p.provider_name,
          logoPath: `${TMDB_IMAGE_BASE}/w92${p.logo_path}`,
          type: 'rent',
        });
      }
    });
  }

  // Buy = compra
  if (region.buy) {
    region.buy.slice(0, 3).forEach((p: any) => {
      if (!providers.find(pr => pr.id === p.provider_id)) {
        providers.push({
          id: p.provider_id,
          name: p.provider_name,
          logoPath: `${TMDB_IMAGE_BASE}/w92${p.logo_path}`,
          type: 'buy',
        });
      }
    });
  }

  return providers;
}

export const mediaService = new MediaService();
