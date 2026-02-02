import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';

// Import content filtering services
import { ContentFilterService } from '../services/content-filter-service';
import { MediaType } from '../types/content-filtering-types';

// Use AWS SDK v3 from Lambda runtime
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

// Use built-in fetch from Node.js 18+ runtime (no external dependency needed)
const fetch = globalThis.fetch || require('node-fetch');

// Simplified inline implementations to avoid dependency issues
const metrics = {
  recordMetric: (name: string, value: number, unit?: string) => {
    console.log(`📊 Metric: ${name} = ${value} ${unit || ''}`);
  },
  recordLatency: (operation: string, startTime: number) => {
    const latency = Date.now() - startTime;
    console.log(`⏱️ ${operation} latency: ${latency}ms`);
  }
};

const movieCacheService = {
  getCachedMovies: async (cacheKey: string) => {
    // This functionality is already implemented inline in the handler
    return null;
  },
  cacheMovies: async (cacheKey: string, movies: any[]) => {
    // This functionality is already implemented inline in the handler
    console.log(`💾 Cache operation for ${cacheKey}: ${movies.length} movies`);
  }
};

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Initialize content filtering service
let contentFilterService: ContentFilterService | null = null;

function getContentFilterService(): ContentFilterService {
  if (!contentFilterService) {
    contentFilterService = new ContentFilterService();
  }
  return contentFilterService;
}

interface Movie {
  id: string;
  title: string;
  poster: string;
  overview: string;
  vote_average?: number;
  release_date?: string;
}

interface CachedMovie extends Movie {
  tmdbId: string;
  cachedAt: string;
  ttl: number;
}

/**
 * MovieHandler: Circuit Breaker + Cache
 * Implementa patrón Circuit Breaker para API TMDB con cache en DynamoDB
 */
export const handler: AppSyncResolverHandler<any, any> = async (event: AppSyncResolverEvent<any>) => {
  console.log('🎬 Movie Handler:', JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const args = event.arguments;

  try {
    switch (fieldName) {
      case 'getMovies':
        return await getMovies(args.genre, args.page);

      case 'getMovieDetails':
        return await getMovieDetails(args.movieId);

      case 'getFilteredContent':
        return await getFilteredContent(
          args.mediaType,
          args.genreIds,
          args.limit || 30,
          args.excludeIds || []
        );

      default:
        throw new Error(`Operación no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`❌ Error en ${fieldName}:`, error);
    throw error;
  }
};

/**
 * Obtener películas - carga MÚLTIPLES PÁGINAS de TMDB para obtener todo el contenido
 */
/**
 * Obtener películas - carga MÚLTIPLES PÁGINAS de TMDB para obtener todo el contenido
 */
async function getMovies(genreParam?: string, page: number = 1): Promise<Movie[]> {
  try {
    // 1. Decodificar genre y roomId (formato: "Action|roomId:123")
    let genre = genreParam;
    let roomId: string | undefined;

    if (genreParam && genreParam.includes('|roomId:')) {
      const parts = genreParam.split('|roomId:');
      genre = parts[0] || undefined; // Si es string vacío, undefined
      roomId = parts[1];
      console.log(`🔍 RoomID detectado: ${roomId}, Género real: ${genre || 'popular'}`);
    }

    // 2. Usar solo el género real para la cache global
    const cacheKey = `movies_all_${genre || 'popular'}`;

    // 3. Obtener películas (cache o API)
    let movies: Movie[] = [];

    // Intentar obtener desde cache
    const cachedMovies = await getCachedMovies(cacheKey);
    if (cachedMovies && cachedMovies.length > 100) {
      console.log(`💾 Películas obtenidas desde cache: ${cachedMovies.length}`);
      movies = cachedMovies;
    } else {
      // Cargar MÚLTIPLES PÁGINAS de TMDB en paralelo
      console.log('🌐 Cargando TODAS las películas desde TMDB API...');
      const allMovies = await fetchAllMoviesFromTMDB(genre);

      // Cachear resultado
      await cacheMovies(cacheKey, allMovies);
      console.log(`✅ Total películas cargadas: ${allMovies.length}`);
      movies = allMovies;
    }

    // 4. Filtrar películas ya mostrada en la sala
    if (roomId) {
      const shownMovieIds = await getShownMovies(roomId);
      if (shownMovieIds.size > 0) {
        const originalCount = movies.length;
        movies = movies.filter(m => !shownMovieIds.has(m.id));
        console.log(`🧹 Filtradas ${originalCount - movies.length} películas ya vistas en sala ${roomId}`);

        // Si se han visto todas, reiniciar (opcional)
        if (movies.length === 0) {
          console.log('🔄 Todas las películas vistas! Reiniciando ciclo.');
          movies = cachedMovies || [];
        }
      }
    }

    return movies;

  } catch (apiError) {
    console.warn('⚠️ Error en API TMDB:', apiError);

    // Fallback logic
    const genre = genreParam?.split('|roomId:')[0];
    const cacheKey = `movies_all_${genre || 'popular'}`;
    const fallbackMovies = await getCachedMovies(cacheKey, true);
    if (fallbackMovies && fallbackMovies.length > 0) {
      return fallbackMovies;
    }

    return getDefaultMovies();
  }
}

/**
 * Obtener IDs de películas ya mostradas en la sala
 */
async function getShownMovies(roomId: string): Promise<Set<string>> {
  try {
    const response = await docClient.send(new GetCommand({
      TableName: process.env.ROOMS_TABLE!,
      Key: { id: roomId },
      ProjectionExpression: 'shownMovieIds'
    }));

    if (response.Item && response.Item.shownMovieIds) {
      // DynamoDB sets are returned as Set objects or Arrays depending on SDK version
      // Safe handle both
      return new Set(Array.from(response.Item.shownMovieIds));
    }
    return new Set();
  } catch (error) {
    console.warn(`⚠️ Error fetching shown movies for room ${roomId}:`, error);
    return new Set();
  }
}

/**
 * Obtener películas desde cache DynamoDB
 */
async function getCachedMovies(cacheKey: string, allowExpired = false): Promise<Movie[] | null> {
  try {
    const response = await docClient.send(new GetCommand({
      TableName: process.env.MOVIES_CACHE_TABLE!,
      Key: { tmdbId: cacheKey },
    }));

    if (!response.Item) {
      return null;
    }

    const cached = response.Item as any;

    // Verificar si el cache ha expirado (a menos que allowExpired sea true)
    if (!allowExpired && cached.ttl < Math.floor(Date.now() / 1000)) {
      console.log('⏰ Cache expirado');
      return null;
    }

    return cached.movies || [];
  } catch (error) {
    console.warn('⚠️ Error leyendo cache:', error);
    return null;
  }
}

/**
 * Cachear películas en DynamoDB con TTL de 30 días
 */
async function cacheMovies(cacheKey: string, movies: Movie[]): Promise<void> {
  try {
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 días

    await docClient.send(new PutCommand({
      TableName: process.env.MOVIES_CACHE_TABLE!,
      Item: {
        tmdbId: cacheKey,
        movies,
        cachedAt: new Date().toISOString(),
        ttl,
      },
    }));

    console.log(`💾 Películas cacheadas: ${cacheKey}`);
  } catch (error) {
    console.warn('⚠️ Error cacheando películas:', error);
    // No lanzar error, el cache es opcional
  }
}

/**
 * Cargar TODAS las películas de TMDB (múltiples páginas en paralelo)
 */
async function fetchAllMoviesFromTMDB(genre?: string): Promise<Movie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY no configurada');
  }

  // Cargar 25 páginas en paralelo = ~500 películas
  const TOTAL_PAGES = 25;
  const pagePromises: Promise<Movie[]>[] = [];

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    pagePromises.push(fetchMoviesFromTMDBPage(apiKey, genre, page));
  }

  console.log(`📦 Cargando ${TOTAL_PAGES} páginas en paralelo...`);
  const results = await Promise.all(pagePromises);

  // Combinar todas las películas
  const allMovies: Movie[] = [];
  const seenIds = new Set<string>();

  results.forEach((movies, index) => {
    console.log(`✅ Página ${index + 1}: ${movies.length} películas`);
    movies.forEach(movie => {
      if (!seenIds.has(movie.id)) {
        seenIds.add(movie.id);
        allMovies.push(movie);
      }
    });
  });

  console.log(`✅ Total películas únicas: ${allMovies.length}`);
  return allMovies;
}

/**
 * Cargar una página específica de TMDB
 */
async function fetchMoviesFromTMDBPage(apiKey: string, genre: string | undefined, page: number): Promise<Movie[]> {
  try {
    let endpoint = 'https://api.themoviedb.org/3/movie/popular';
    if (genre) {
      endpoint = `https://api.themoviedb.org/3/discover/movie?with_genres=${getGenreId(genre)}`;
    }

    const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${apiKey}&language=es-ES&page=${page}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Trinity-App/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ Error en página ${page}: ${response.status}`);
      return [];
    }

    const data: any = await response.json();

    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((movie: any) => ({
      id: movie.id.toString(),
      title: movie.title || movie.original_title || 'Título no disponible',
      poster: movie.poster_path || null,
      overview: movie.overview || 'Descripción no disponible',
      vote_average: movie.vote_average || 0,
      release_date: movie.release_date || '',
    }));
  } catch (error) {
    console.warn(`⚠️ Error cargando página ${page}:`, error);
    return [];
  }
}

/**
 * Obtener películas desde API TMDB con soporte para paginación (legacy)
 */
async function fetchMoviesFromTMDB(genre?: string, page: number = 1): Promise<Movie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY no configurada');
  }

  // Determinar endpoint según género
  let endpoint = 'https://api.themoviedb.org/3/movie/popular';
  if (genre) {
    // Para géneros específicos, usar discover
    endpoint = `https://api.themoviedb.org/3/discover/movie?with_genres=${getGenreId(genre)}`;
  }

  const url = `${endpoint}?api_key=${apiKey}&language=es-ES&page=${page}`;

  console.log(`🔍 Fetching from TMDB: ${url}`);

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Trinity-App/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();

  if (!data.results || !Array.isArray(data.results)) {
    throw new Error('Formato de respuesta TMDB inválido');
  }

  console.log(`✅ TMDB returned ${data.results.length} movies for page ${page}`);

  // Transformar TODAS las películas de la página (no limitar a 20)
  return data.results.map((movie: any) => ({
    id: movie.id.toString(),
    title: movie.title || movie.original_title || 'Título no disponible',
    poster: movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : 'https://via.placeholder.com/500x750?text=Sin+Poster',
    overview: movie.overview || 'Descripción no disponible',
    vote_average: movie.vote_average || 0,
    release_date: movie.release_date || '',
  }));
}

/**
 * Mapear nombres de géneros a IDs de TMDB
 */
function getGenreId(genreName: string): string {
  const genreMap: { [key: string]: string } = {
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
async function getMovieDetails(movieId: string): Promise<any> {
  const cacheKey = `movie_details_${movieId}`;

  try {
    // 1. Intentar obtener desde cache
    const cachedMovie = await getCachedMovieDetails(cacheKey);
    if (cachedMovie) {
      console.log(`💾 Detalles de película obtenidos desde cache: ${movieId}`);
      return cachedMovie;
    }

    // 2. Si no hay cache, obtener desde API TMDB
    console.log(`🌐 Obteniendo detalles de película ${movieId} desde TMDB API...`);
    const movieDetails = await fetchMovieDetailsFromTMDB(movieId);

    // 3. Cachear resultado exitoso
    await cacheMovieDetails(cacheKey, movieDetails);

    console.log(`✅ Detalles de película obtenidos desde API: ${movieDetails.title}`);
    return movieDetails;

  } catch (apiError) {
    console.warn(`⚠️ Error en API TMDB para película ${movieId}, intentando fallback:`, apiError);

    // 4. Fallback: intentar cache expirado
    const fallbackMovie = await getCachedMovieDetails(cacheKey, true);
    if (fallbackMovie) {
      console.log(`🔄 Usando cache expirado como fallback para película ${movieId}`);
      return fallbackMovie;
    }

    // 5. Si todo falla, retornar película por defecto
    console.log(`🎭 Usando película por defecto para ID ${movieId}`);
    return getDefaultMovieDetails(movieId);
  }
}

/**
 * Obtener detalles de película desde cache DynamoDB
 */
async function getCachedMovieDetails(cacheKey: string, allowExpired = false): Promise<any | null> {
  try {
    const response = await docClient.send(new GetCommand({
      TableName: process.env.MOVIES_CACHE_TABLE!,
      Key: { tmdbId: cacheKey },
    }));

    if (!response.Item) {
      return null;
    }

    const cached = response.Item as any;

    // Verificar si el cache ha expirado
    if (!allowExpired && cached.ttl < Math.floor(Date.now() / 1000)) {
      console.log('⏰ Cache de detalles expirado');
      return null;
    }

    return cached.movieDetails || null;
  } catch (error) {
    console.warn('⚠️ Error leyendo cache de detalles:', error);
    return null;
  }
}

/**
 * Cachear detalles de película en DynamoDB
 */
async function cacheMovieDetails(cacheKey: string, movieDetails: any): Promise<void> {
  try {
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 días

    await docClient.send(new PutCommand({
      TableName: process.env.MOVIES_CACHE_TABLE!,
      Item: {
        tmdbId: cacheKey,
        movieDetails,
        cachedAt: new Date().toISOString(),
        ttl,
      },
    }));

    console.log(`💾 Detalles de película cacheados: ${cacheKey}`);
  } catch (error) {
    console.warn('⚠️ Error cacheando detalles de película:', error);
  }
}

/**
 * Obtener detalles de película desde API TMDB
 */
async function fetchMovieDetailsFromTMDB(movieId: string): Promise<any> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY no configurada');
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
      throw new Error(`Película no encontrada: ${movieId}`);
    }
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
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
    genres: movie.genres?.map((g: any) => ({ id: g.id, name: g.name })) || [],
    runtime: movie.runtime || null,
  };
}

/**
 * Detalles de película por defecto cuando todo falla
 */
function getDefaultMovieDetails(movieId: string): any {
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
function getDefaultMovies(): Movie[] {
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
 * ========================================
 * NUEVO: Sistema de Filtrado de Contenido
 * ========================================
 */

/**
 * Get filtered content using the new content filtering system
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
async function getFilteredContent(
  mediaType: MediaType,
  genreIds: number[],
  limit: number = 30,
  excludeIds: string[] = []
): Promise<Movie[]> {
  const startTime = Date.now();
  
  try {
    console.log(`🎯 Getting filtered content: ${mediaType}, genres: [${genreIds.join(', ')}], limit: ${limit}, exclude: ${excludeIds.length}`);

    // Validate input
    if (genreIds.length > 3) {
      throw new Error('Maximum 3 genres allowed');
    }

    // Create filter criteria
    const filterCriteria = {
      mediaType,
      genres: genreIds,
      roomId: 'temp-' + Date.now() // Temporary room ID for filtering
    };

    // Get content filtering service
    const contentService = getContentFilterService();

    // Load filtered content using the priority algorithm
    const contentPool = await contentService.createFilteredRoom(filterCriteria);

    // Filter out excluded IDs
    const filteredContent = contentPool.filter(item => 
      !excludeIds.includes(item.tmdbId)
    );

    // Limit results
    const limitedContent = filteredContent.slice(0, limit);

    // Transform to Movie format expected by GraphQL
    const movies: Movie[] = limitedContent.map(item => {
      // Construct full poster URL from available poster path
      let fullPosterUrl = '';
      if (item.posterPath) {
        // If posterPath is already a full URL, use it
        if (item.posterPath.startsWith('http')) {
          fullPosterUrl = item.posterPath;
        } else {
          // If it's a partial path, construct full TMDB URL
          fullPosterUrl = `https://image.tmdb.org/t/p/w500${item.posterPath}`;
        }
      }

      return {
        id: `movie-${item.tmdbId}`,
        remoteId: item.tmdbId,
        tmdbId: parseInt(item.tmdbId),
        title: item.title,
        originalTitle: item.title,
        overview: item.overview,
        posterPath: fullPosterUrl,
        backdropPath: null,
        releaseDate: item.releaseDate,
        year: item.releaseDate ? new Date(item.releaseDate).getFullYear().toString() : '',
        rating: item.voteAverage,
        voteCount: 0,
        genres: [],
        mediaType: 'movie',
        runtime: null,
        tagline: '',
        budget: 0,
        revenue: 0,
        trailerKey: null,
        watchProviders: [],
        cast: [],
        director: null,
        // Compatibility fields
        mediaPosterPath: fullPosterUrl,
        mediaTitle: item.title,
        mediaYear: item.releaseDate ? new Date(item.releaseDate).getFullYear().toString() : '',
        mediaOverview: item.overview,
        mediaRating: item.voteAverage || null,
        poster: fullPosterUrl,
        vote_average: item.voteAverage
      };
    });

    metrics.recordLatency('GetFilteredContent', startTime);
    metrics.recordMetric('FilteredContentCount', movies.length);

    console.log(`✅ Filtered content loaded: ${movies.length} items (Priority algorithm applied)`);
    return movies;

  } catch (error) {
    console.error('❌ Error getting filtered content:', error);
    metrics.recordLatency('GetFilteredContent_Error', startTime);

    // Fallback to default movies if filtering fails
    console.log('🔄 Using fallback default movies due to filtering error');
    return getDefaultMovies();
  }
}

/**
 * Obtener títulos con TODOS los géneros especificados (AND)
 */
async function fetchWithAllGenres(endpoint: string, genreIds: number[], excludeSet: Set<string> = new Set()): Promise<Movie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY no configurada');
  }

  const genreString = genreIds.join(',');
  const allMovies: Movie[] = [];
  const seenIds = new Set<string>();

  // Cargar múltiples páginas para obtener más resultados
  const PAGES_TO_FETCH = 10;

  for (let page = 1; page <= PAGES_TO_FETCH; page++) {
    try {
      const url = `https://api.themoviedb.org/3/discover/${endpoint}?with_genres=${genreString}&api_key=${apiKey}&language=es-ES&page=${page}&sort_by=popularity.desc`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Trinity-App/1.0',
        },
      });

      if (!response.ok) {
        console.warn(`⚠️ Error en página ${page}: ${response.status}`);
        break;
      }

      const data: any = await response.json();

      if (!data.results || data.results.length === 0) {
        break; // No más resultados
      }

      // Filtrar títulos que tengan TODOS los géneros
      data.results.forEach((item: any) => {
        const itemGenreIds = item.genre_ids || [];
        const hasAllGenres = genreIds.every(genreId => itemGenreIds.includes(genreId));

        if (hasAllGenres && !seenIds.has(item.id.toString()) && !excludeSet.has(item.id.toString())) {
          seenIds.add(item.id.toString());
          allMovies.push({
            id: item.id.toString(),
            title: item.title || item.name || 'Título no disponible',
            poster: item.poster_path || null,
            overview: item.overview || 'Descripción no disponible',
            vote_average: item.vote_average || 0,
            release_date: item.release_date || item.first_air_date || '',
          });
        }
      });

    } catch (error) {
      console.warn(`⚠️ Error cargando página ${page}:`, error);
      break;
    }
  }

  return allMovies;
}

/**
 * Obtener títulos con AL MENOS UN género (OR)
 */
async function fetchWithAnyGenre(
  endpoint: string,
  genreIds: number[],
  excludeMovies: Movie[],
  excludeSet: Set<string> = new Set()
): Promise<Movie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY no configurada');
  }

  const excludeIds = new Set(excludeMovies.map(m => m.id));
  const allMovies: Movie[] = [];
  const seenIds = new Set<string>();

  // Hacer una llamada por cada género
  for (const genreId of genreIds) {
    try {
      const url = `https://api.themoviedb.org/3/discover/${endpoint}?with_genres=${genreId}&api_key=${apiKey}&language=es-ES&page=1&sort_by=popularity.desc`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Trinity-App/1.0',
        },
      });

      if (!response.ok) {
        console.warn(`⚠️ Error obteniendo género ${genreId}: ${response.status}`);
        continue;
      }

      const data: any = await response.json();

      if (!data.results) {
        continue;
      }

      data.results.forEach((item: any) => {
        const itemId = item.id.toString();

        // Evitar duplicados y títulos ya incluidos en exactMatches o excludeSet
        if (!seenIds.has(itemId) && !excludeIds.has(itemId) && !excludeSet.has(itemId)) {
          seenIds.add(itemId);
          allMovies.push({
            id: itemId,
            title: item.title || item.name || 'Título no disponible',
            poster: item.poster_path || null,
            overview: item.overview || 'Descripción no disponible',
            vote_average: item.vote_average || 0,
            release_date: item.release_date || item.first_air_date || '',
          });
        }
      });

    } catch (error) {
      console.warn(`⚠️ Error cargando género ${genreId}:`, error);
    }
  }

  return allMovies;
}

/**
 * Obtener contenido popular del mismo tipo (fallback)
 */
async function fetchPopularContent(endpoint: string, limit: number, excludeSet: Set<string> = new Set()): Promise<Movie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY no configurada');
  }

  try {
    const url = `https://api.themoviedb.org/3/${endpoint}/popular?api_key=${apiKey}&language=es-ES&page=1`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Trinity-App/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ Error obteniendo contenido popular: ${response.status}`);
      return [];
    }

    const data: any = await response.json();

    if (!data.results) {
      return [];
    }

    return data.results
      .filter((item: any) => !excludeSet.has(item.id.toString()))
      .slice(0, limit)
      .map((item: any) => ({
        id: item.id.toString(),
        title: item.title || item.name || 'Título no disponible',
        poster: item.poster_path || null,
        overview: item.overview || 'Descripción no disponible',
        vote_average: item.vote_average || 0,
        release_date: item.release_date || item.first_air_date || '',
      }));

  } catch (error) {
    console.warn('⚠️ Error cargando contenido popular:', error);
    return [];
  }
}

/**
 * Aleatorizar array usando algoritmo Fisher-Yates
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
