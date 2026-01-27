/**
 * Standalone Movie Handler with Poster Path Fix
 * This version includes all necessary code inline to avoid import issues
 */

// Use AWS SDK v3 from Lambda runtime
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

// Use built-in fetch from Node.js 18+ runtime
const fetch = globalThis.fetch || require('node-fetch');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
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
 * Get filtered content - simplified version with poster path fix
 */
async function getFilteredContent(mediaType, genreIds, limit = 30, excludeIds = []) {
  console.log(`🎯 Getting filtered content: ${mediaType}, genres: [${genreIds.join(', ')}], limit: ${limit}, excluding: ${excludeIds.length} movies`);
  console.log(`🔍 Detailed excludeIds received:`, JSON.stringify(excludeIds, null, 2));

  try {
    // Get movies from TMDB API (fetch more than needed to account for exclusions)
    const fetchLimit = Math.max(limit * 2, 50); // Fetch extra movies to account for exclusions
    const movies = await fetchMoviesFromTMDB(genreIds, fetchLimit);
    
    console.log(`📦 Fetched ${movies.length} movies from TMDB before exclusion`);
    
    // Create a set of excluded movie IDs for fast lookup
    const excludeSet = new Set(excludeIds.map(id => {
      // Handle different ID formats: "movie-123", "123", etc.
      if (typeof id === 'string' && id.startsWith('movie-')) {
        return id.replace('movie-', '');
      }
      return id.toString();
    }));

    console.log(`🔍 Processed excludeSet:`, Array.from(excludeSet));
    
    // Filter out excluded movies
    const filteredMovies = movies.filter(movie => {
      const movieId = movie.id.toString();
      const isExcluded = excludeSet.has(movieId);
      if (isExcluded) {
        console.log(`🚫 Excluding already shown movie: ${movie.title} (ID: ${movieId})`);
      }
      return !isExcluded;
    });

    console.log(`✅ After exclusion: ${filteredMovies.length} movies available (excluded ${movies.length - filteredMovies.length})`);
    
    // Limit to requested number
    const limitedMovies = filteredMovies.slice(0, limit);
    
    console.log(`📋 Final movie list (${limitedMovies.length} movies):`);
    limitedMovies.forEach((movie, index) => {
      console.log(`  ${index + 1}. ${movie.title} (ID: ${movie.id})`);
    });
    
    // Transform movies with proper poster URLs
    const transformedMovies = limitedMovies.map(movie => {
      // Construct full poster URL
      let fullPosterUrl = '';
      if (movie.poster_path) {
        fullPosterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
      } else {
        fullPosterUrl = 'https://via.placeholder.com/500x750?text=Sin+Poster';
      }

      return {
        id: `movie-${movie.id}`,
        remoteId: movie.id.toString(),
        tmdbId: movie.id,
        title: movie.title || movie.original_title || 'Título no disponible',
        originalTitle: movie.original_title || movie.title || 'Título no disponible',
        overview: movie.overview || 'Descripción no disponible',
        posterPath: fullPosterUrl,
        backdropPath: movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null,
        releaseDate: movie.release_date || '',
        year: movie.release_date ? new Date(movie.release_date).getFullYear().toString() : '',
        rating: movie.vote_average || 0,
        voteCount: movie.vote_count || 0,
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
        creator: null,
        // Compatibility fields
        mediaPosterPath: fullPosterUrl,
        mediaTitle: movie.title || movie.original_title || 'Título no disponible',
        mediaYear: movie.release_date ? new Date(movie.release_date).getFullYear().toString() : '',
        mediaOverview: movie.overview || 'Descripción no disponible',
        mediaRating: movie.vote_average || null,
        poster: fullPosterUrl,
        vote_average: movie.vote_average || 0
      };
    });

    console.log(`✅ Filtered content loaded: ${transformedMovies.length} items with poster URLs (after exclusions)`);
    return transformedMovies;

  } catch (error) {
    console.error('❌ Error getting filtered content:', error);
    
    // Fallback to default movies with proper poster URLs
    return getDefaultMoviesWithPosters();
  }
}

/**
 * Fetch movies from TMDB API based on genres
 */
async function fetchMoviesFromTMDB(genreIds, limit) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY no configurada');
  }

  try {
    const allMovies = [];
    const maxPages = Math.ceil(limit / 20); // TMDB returns ~20 movies per page
    
    // If genres are specified, use discover endpoint
    let baseUrl;
    if (genreIds && genreIds.length > 0) {
      const genreString = genreIds.join(',');
      baseUrl = `https://api.themoviedb.org/3/discover/movie?with_genres=${genreString}&api_key=${apiKey}&language=es-ES&sort_by=popularity.desc`;
    } else {
      // Fallback to popular movies
      baseUrl = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=es-ES`;
    }

    console.log(`🔍 Fetching ${maxPages} pages from TMDB to get ${limit} movies`);

    // Fetch multiple pages to get enough movies
    for (let page = 1; page <= maxPages && allMovies.length < limit; page++) {
      const url = `${baseUrl}&page=${page}`;
      
      console.log(`📄 Fetching page ${page}: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Trinity-App/1.0',
        },
      });

      if (!response.ok) {
        console.warn(`⚠️ Error fetching page ${page}: ${response.status} ${response.statusText}`);
        break; // Continue with what we have
      }

      const data = await response.json();

      if (!data.results || !Array.isArray(data.results)) {
        console.warn(`⚠️ Invalid response format for page ${page}`);
        break;
      }

      console.log(`✅ Page ${page} returned ${data.results.length} movies`);
      allMovies.push(...data.results);

      // Stop if we have enough movies or if this page returned fewer than 20 (last page)
      if (data.results.length < 20) {
        break;
      }
    }

    console.log(`✅ TMDB total: ${allMovies.length} movies from ${Math.min(maxPages, Math.ceil(allMovies.length / 20))} pages`);
    
    // Return up to the requested limit
    return allMovies.slice(0, limit);

  } catch (error) {
    console.error('❌ Error fetching from TMDB:', error);
    throw error;
  }
}

/**
 * Default movies with proper poster URLs as fallback
 */
function getDefaultMoviesWithPosters() {
  return [
    {
      id: 'movie-238',
      remoteId: '238',
      tmdbId: 238,
      title: 'El Padrino',
      originalTitle: 'The Godfather',
      overview: 'La historia de una familia de la mafia italiana en Nueva York.',
      posterPath: 'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
      backdropPath: null,
      releaseDate: '1972-03-14',
      year: '1972',
      rating: 8.7,
      voteCount: 15000,
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
      creator: null,
      mediaPosterPath: 'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
      mediaTitle: 'El Padrino',
      mediaYear: '1972',
      mediaOverview: 'La historia de una familia de la mafia italiana en Nueva York.',
      mediaRating: 8.7,
      poster: 'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
      vote_average: 8.7
    },
    {
      id: 'movie-680',
      remoteId: '680',
      tmdbId: 680,
      title: 'Pulp Fiction',
      originalTitle: 'Pulp Fiction',
      overview: 'Historias entrelazadas de crimen en Los Ángeles.',
      posterPath: 'https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
      backdropPath: null,
      releaseDate: '1994-09-10',
      year: '1994',
      rating: 8.9,
      voteCount: 20000,
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
      creator: null,
      mediaPosterPath: 'https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
      mediaTitle: 'Pulp Fiction',
      mediaYear: '1994',
      mediaOverview: 'Historias entrelazadas de crimen en Los Ángeles.',
      mediaRating: 8.9,
      poster: 'https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
      vote_average: 8.9
    }
  ];
}

/**
 * Legacy getMovies function for backward compatibility
 */
async function getMovies(genre, page = 1) {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new Error('TMDB_API_KEY no configurada');
    }

    let endpoint = 'https://api.themoviedb.org/3/movie/popular';
    if (genre) {
      endpoint = `https://api.themoviedb.org/3/discover/movie?with_genres=${getGenreId(genre)}`;
    }

    const url = `${endpoint}?api_key=${apiKey}&language=es-ES&page=${page}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Trinity-App/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.results || !Array.isArray(data.results)) {
      throw new Error('Formato de respuesta TMDB inválido');
    }

    return data.results.map((movie) => ({
      id: movie.id.toString(),
      title: movie.title || movie.original_title || 'Título no disponible',
      poster: movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : 'https://via.placeholder.com/500x750?text=Sin+Poster',
      overview: movie.overview || 'Descripción no disponible',
      vote_average: movie.vote_average || 0,
      release_date: movie.release_date || '',
    }));

  } catch (error) {
    console.error('❌ Error in getMovies:', error);
    return getDefaultMoviesWithPosters();
  }
}

/**
 * Get movie details
 */
async function getMovieDetails(movieId) {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new Error('TMDB_API_KEY no configurada');
    }

    const url = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=es-ES`;

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

    const movie = await response.json();

    return {
      id: movie.id.toString(),
      title: movie.title || movie.original_title || 'Título no disponible',
      overview: movie.overview || 'Descripción no disponible',
      poster: movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : 'https://via.placeholder.com/500x750?text=Sin+Poster',
      vote_average: movie.vote_average || 0,
      release_date: movie.release_date || '',
      genres: movie.genres?.map((g) => ({ id: g.id, name: g.name })) || [],
      runtime: movie.runtime || null,
    };

  } catch (error) {
    console.error('❌ Error in getMovieDetails:', error);
    return {
      id: movieId,
      title: 'Película no disponible',
      overview: 'Los detalles de esta película no están disponibles temporalmente.',
      poster: 'https://via.placeholder.com/500x750?text=Sin+Poster',
      vote_average: 0,
      release_date: '',
      genres: [],
      runtime: null,
    };
  }
}

/**
 * Map genre names to TMDB IDs
 */
function getGenreId(genreName) {
  const genreMap = {
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