import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  MediaItem,
  TMDBSearchFilters,
  TMDBResponse,
  TMDBMovie,
  TMDBGenre,
} from '../../domain/entities/media.entity';

export interface TMDBConfiguration {
  images: {
    base_url: string;
    secure_base_url: string;
    backdrop_sizes: string[];
    logo_sizes: string[];
    poster_sizes: string[];
    profile_sizes: string[];
    still_sizes: string[];
  };
}

@Injectable()
export class TMDBService {
  private readonly logger = new Logger(TMDBService.name);
  private readonly httpClient: AxiosInstance;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private configuration: TMDBConfiguration | null = null;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('TMDB_API_KEY') || 'default-api-key';
    this.baseUrl = this.configService.get(
      'TMDB_BASE_URL',
      'https://api.themoviedb.org/3',
    );

    if (!this.apiKey) {
      throw new Error('TMDB_API_KEY is required');
    }

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000, // 10 segundos
      params: {
        api_key: this.apiKey,
      },
    });

    // Interceptor para logging
    this.httpClient.interceptors.request.use((config) => {
      this.logger.debug(
        `TMDB Request: ${config.method?.toUpperCase()} ${config.url}`,
      );
      return config;
    });

    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.debug(
          `TMDB Response: ${response.status} ${response.config.url}`,
        );
        return response;
      },
      (error) => {
        this.logger.error(
          `TMDB Error: ${error.response?.status} ${error.config?.url} - ${error.message}`,
        );
        return Promise.reject(error);
      },
    );
  }

  /**
   * Inicializar configuración de TMDB
   */
  async initialize(): Promise<void> {
    try {
      const response = await this.httpClient.get('/configuration');
      this.configuration = response.data;
      this.logger.log('TMDB configuration loaded successfully');
    } catch (error) {
      this.logger.error(`Failed to load TMDB configuration: ${error.message}`);
      // Usar configuración por defecto
      this.configuration = {
        images: {
          base_url: 'http://image.tmdb.org/',
          secure_base_url: 'https://image.tmdb.org/',
          backdrop_sizes: ['w300', 'w780', 'w1280', 'original'],
          poster_sizes: [
            'w92',
            'w154',
            'w185',
            'w342',
            'w500',
            'w780',
            'original',
          ],
          logo_sizes: [
            'w45',
            'w92',
            'w154',
            'w185',
            'w300',
            'w500',
            'original',
          ],
          profile_sizes: ['w45', 'w185', 'h632', 'original'],
          still_sizes: ['w92', 'w185', 'w300', 'original'],
        },
      };
    }
  }

  /**
   * Obtener detalles de una película específica
   */
  async getMovieDetails(movieId: string): Promise<TMDBMovie | null> {
    try {
      const response = await this.httpClient.get(`/movie/${movieId}`, {
        params: {
          api_key: this.apiKey,
          language: 'es-ES',
        },
      });

      const movie = response.data;
      return {
        id: movie.id,
        title: movie.title,
        overview: movie.overview,
        poster_path: movie.poster_path,
        backdrop_path: movie.backdrop_path,
        release_date: movie.release_date,
        genre_ids: movie.genres?.map((g: any) => g.id) || [],
        popularity: movie.popularity,
        vote_average: movie.vote_average,
        vote_count: movie.vote_count,
        adult: movie.adult,
        original_language: movie.original_language,
      };
    } catch (error) {
      this.logger.error(
        `Error getting movie details ${movieId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Buscar películas populares
   */
  async getPopularMovies(page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    const response = await this.httpClient.get('/movie/popular', {
      params: { page },
    });
    return response.data;
  }

  /**
   * Buscar películas por filtros
   */
  async searchMovies(
    filters: TMDBSearchFilters,
  ): Promise<TMDBResponse<TMDBMovie>> {
    const params: any = {
      page: filters.page || 1,
      sort_by: filters.sortBy || 'popularity.desc',
    };

    // Aplicar filtros
    if (filters.query) {
      // Búsqueda por texto
      const response = await this.httpClient.get('/search/movie', {
        params: { ...params, query: filters.query },
      });
      return response.data;
    } else {
      // Descubrimiento con filtros
      if (filters.genres && filters.genres.length > 0) {
        const genreIds = await this.getGenreIds(filters.genres);
        if (genreIds.length > 0) {
          params.with_genres = genreIds.join(',');
        }
      }

      if (filters.releaseYearFrom) {
        params['primary_release_date.gte'] = `${filters.releaseYearFrom}-01-01`;
      }

      if (filters.releaseYearTo) {
        params['primary_release_date.lte'] = `${filters.releaseYearTo}-12-31`;
      }

      if (filters.minRating) {
        params['vote_average.gte'] = filters.minRating;
      }

      const response = await this.httpClient.get('/discover/movie', { params });
      return response.data;
    }
  }

  /**
   * Obtener géneros de películas
   */
  async getMovieGenres(): Promise<TMDBGenre[]> {
    const response = await this.httpClient.get('/genre/movie/list');
    return response.data.genres;
  }

  /**
   * Buscar series de TV populares
   */
  async getPopularTVShows(page: number = 1): Promise<TMDBResponse<any>> {
    const response = await this.httpClient.get('/tv/popular', {
      params: { page },
    });
    return response.data;
  }

  /**
   * Buscar contenido mixto (películas y series)
   */
  async searchMulti(
    query: string,
    page: number = 1,
  ): Promise<TMDBResponse<any>> {
    const response = await this.httpClient.get('/search/multi', {
      params: { query, page },
    });
    return response.data;
  }

  /**
   * Convertir respuesta TMDB a MediaItem
   */
  convertToMediaItem(
    tmdbItem: TMDBMovie,
    mediaType: 'movie' | 'tv' = 'movie',
  ): MediaItem {
    return {
      tmdbId: tmdbItem.id.toString(),
      title: tmdbItem.title || (tmdbItem as any).name, // TV shows use 'name'
      overview: tmdbItem.overview,
      posterPath: this.getImageUrl(tmdbItem.poster_path, 'poster', 'w500'),
      backdropPath: tmdbItem.backdrop_path
        ? this.getImageUrl(tmdbItem.backdrop_path, 'backdrop', 'w1280')
        : undefined,
      releaseDate:
        tmdbItem.release_date || (tmdbItem as any).first_air_date || '',
      genres: [], // Se llenará con los IDs de género
      popularity: tmdbItem.popularity,
      voteAverage: tmdbItem.vote_average,
      voteCount: tmdbItem.vote_count,
      adult: tmdbItem.adult || false,
      originalLanguage: tmdbItem.original_language,
      mediaType,
      cachedAt: new Date(),
      isPopular: tmdbItem.popularity > 100, // Umbral configurable
    };
  }

  /**
   * Obtener URL completa de imagen
   */
  getImageUrl(
    imagePath: string | null,
    type: 'poster' | 'backdrop' | 'profile',
    size: string = 'original',
  ): string {
    if (!imagePath || !this.configuration) {
      return '';
    }

    const baseUrl = this.configuration.images.secure_base_url;
    return `${baseUrl}${size}${imagePath}`;
  }

  /**
   * Obtener IDs de géneros por nombres o IDs
   */
  private async getGenreIds(genreInputs: string[]): Promise<number[]> {
    try {
      // Primero verificar si ya son IDs numéricos
      const numericIds = genreInputs
        .map((input) => parseInt(input, 10))
        .filter((id) => !isNaN(id));

      // Si todos son numéricos, devolverlos directamente
      if (numericIds.length === genreInputs.length) {
        return numericIds;
      }

      // Si no, buscar por nombre
      const genres = await this.getMovieGenres();
      const genreMap = new Map(genres.map((g) => [g.name.toLowerCase(), g.id]));

      return genreInputs
        .map((input) => {
          // Intentar como número primero
          const numericId = parseInt(input, 10);
          if (!isNaN(numericId)) {
            return numericId;
          }
          // Si no es número, buscar por nombre
          return genreMap.get(input.toLowerCase());
        })
        .filter((id): id is number => id !== undefined);
    } catch (error) {
      this.logger.error(`Error getting genre IDs: ${error.message}`);
      return [];
    }
  }

  /**
   * Verificar salud del servicio TMDB
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.httpClient.get('/configuration', { timeout: 5000 });
      return true;
    } catch (error) {
      this.logger.error(`TMDB health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Obtener trending content
   */
  async getTrending(
    mediaType: 'movie' | 'tv' | 'all' = 'movie',
    timeWindow: 'day' | 'week' = 'week',
  ): Promise<TMDBResponse<any>> {
    const response = await this.httpClient.get(
      `/trending/${mediaType}/${timeWindow}`,
    );
    return response.data;
  }

  /**
   * Buscar contenido por múltiples filtros avanzados
   */
  async discoverContent(
    filters: TMDBSearchFilters & {
      mediaType?: 'movie' | 'tv';
      includeAdult?: boolean;
      voteCountMin?: number;
    },
  ): Promise<MediaItem[]> {
    const mediaType = filters.mediaType || 'movie';
    const endpoint = `/discover/${mediaType}`;

    // Usar página aleatoria para variar resultados (TMDB tiene muchas páginas)
    const randomPage = Math.floor(Math.random() * 5) + 1; // Páginas 1-5

    const params: any = {
      page: filters.page || randomPage,
      sort_by: filters.sortBy || 'popularity.desc',
      include_adult: filters.includeAdult || false,
      language: 'es-ES', // Resultados en español
    };

    // Aplicar filtros específicos
    if (filters.genres && filters.genres.length > 0) {
      const genreIds = await this.getGenreIds(filters.genres);
      if (genreIds.length > 0) {
        params.with_genres = genreIds.join(',');
      }
    }

    if (filters.releaseYearFrom) {
      const dateField =
        mediaType === 'movie' ? 'primary_release_date' : 'first_air_date';
      params[`${dateField}.gte`] = `${filters.releaseYearFrom}-01-01`;
    }

    if (filters.releaseYearTo) {
      const dateField =
        mediaType === 'movie' ? 'primary_release_date' : 'first_air_date';
      params[`${dateField}.lte`] = `${filters.releaseYearTo}-12-31`;
    }

    if (filters.minRating) {
      params['vote_average.gte'] = filters.minRating;
    }

    if (filters.voteCountMin) {
      params['vote_count.gte'] = filters.voteCountMin;
    }

    const response = await this.httpClient.get(endpoint, { params });

    // Convertir resultados a MediaItem
    const mediaItems = response.data.results.map((item: any) =>
      this.convertToMediaItem(item, mediaType),
    );

    // Mezclar aleatoriamente los resultados para variar el orden
    return this.shuffleArray(mediaItems);
  }

  /**
   * Mezclar array aleatoriamente (Fisher-Yates shuffle)
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
