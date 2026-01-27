"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
// Import content filtering services
const content_filter_service_1 = require("./services/content-filter-service");
// Use AWS SDK v3 from Lambda runtime
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
// Use built-in fetch from Node.js 18+ runtime (no external dependency needed)
const fetch = globalThis.fetch || require('node-fetch');
// Simplified inline implementations to avoid dependency issues
const metrics = {
    recordMetric: (name, value, unit) => {
        console.log(`📊 Metric: ${name} = ${value} ${unit || ''}`);
    },
    recordLatency: (operation, startTime) => {
        const latency = Date.now() - startTime;
        console.log(`⏱️ ${operation} latency: ${latency}ms`);
    }
};
const movieCacheService = {
    getCachedMovies: async (cacheKey) => {
        // This functionality is already implemented inline in the handler
        return null;
    },
    cacheMovies: async (cacheKey, movies) => {
        // This functionality is already implemented inline in the handler
        console.log(`💾 Cache operation for ${cacheKey}: ${movies.length} movies`);
    }
};
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
// Initialize content filtering service
let contentFilterService = null;
function getContentFilterService() {
    if (!contentFilterService) {
        contentFilterService = new content_filter_service_1.ContentFilterService();
    }
    return contentFilterService;
}
/**
 * MovieHandler: Circuit Breaker + Cache
 * Implementa patrón Circuit Breaker para API TMDB con cache en DynamoDB
 */
const handler = async (event) => {
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
                return await getFilteredContent(args.mediaType, args.genreIds, args.limit || 30, args.excludeIds || []);
            case 'getAvailableGenres':
                return await getAvailableGenres(args.mediaType);
            default:
                throw new Error(`Operación no soportada: ${fieldName}`);
        }
    }
    catch (error) {
        console.error(`❌ Error en ${fieldName}:`, error);
        throw error;
    }
};
exports.handler = handler;
/**
 * Obtener películas - carga MÚLTIPLES PÁGINAS de TMDB para obtener todo el contenido
 */
/**
 * Obtener películas - carga MÚLTIPLES PÁGINAS de TMDB para obtener todo el contenido
 */
async function getMovies(genreParam, page = 1) {
    try {
        // 1. Decodificar genre y roomId (formato: "Action|roomId:123")
        let genre = genreParam;
        let roomId;
        if (genreParam && genreParam.includes('|roomId:')) {
            const parts = genreParam.split('|roomId:');
            genre = parts[0] || undefined; // Si es string vacío, undefined
            roomId = parts[1];
            console.log(`🔍 RoomID detectado: ${roomId}, Género real: ${genre || 'popular'}`);
        }
        // 2. Usar solo el género real para la cache global
        const cacheKey = `movies_all_${genre || 'popular'}`;
        // 3. Obtener películas (cache o API)
        let movies = [];
        // Intentar obtener desde cache
        const cachedMovies = await getCachedMovies(cacheKey);
        if (cachedMovies && cachedMovies.length > 100) {
            console.log(`💾 Películas obtenidas desde cache: ${cachedMovies.length}`);
            movies = cachedMovies;
        }
        else {
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
    }
    catch (apiError) {
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
async function getShownMovies(roomId) {
    try {
        const response = await docClient.send(new GetCommand({
            TableName: process.env.ROOMS_TABLE,
            Key: { id: roomId },
            ProjectionExpression: 'shownMovieIds'
        }));
        if (response.Item && response.Item.shownMovieIds) {
            // DynamoDB sets are returned as Set objects or Arrays depending on SDK version
            // Safe handle both
            return new Set(Array.from(response.Item.shownMovieIds));
        }
        return new Set();
    }
    catch (error) {
        console.warn(`⚠️ Error fetching shown movies for room ${roomId}:`, error);
        return new Set();
    }
}
/**
 * Obtener películas desde cache DynamoDB
 */
async function getCachedMovies(cacheKey, allowExpired = false) {
    try {
        const response = await docClient.send(new GetCommand({
            TableName: process.env.MOVIES_CACHE_TABLE,
            Key: { tmdbId: cacheKey },
        }));
        if (!response.Item) {
            return null;
        }
        const cached = response.Item;
        // Verificar si el cache ha expirado (a menos que allowExpired sea true)
        if (!allowExpired && cached.ttl < Math.floor(Date.now() / 1000)) {
            console.log('⏰ Cache expirado');
            return null;
        }
        return cached.movies || [];
    }
    catch (error) {
        console.warn('⚠️ Error leyendo cache:', error);
        return null;
    }
}
/**
 * Cachear películas en DynamoDB con TTL de 30 días
 */
async function cacheMovies(cacheKey, movies) {
    try {
        const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 días
        await docClient.send(new PutCommand({
            TableName: process.env.MOVIES_CACHE_TABLE,
            Item: {
                tmdbId: cacheKey,
                movies,
                cachedAt: new Date().toISOString(),
                ttl,
            },
        }));
        console.log(`💾 Películas cacheadas: ${cacheKey}`);
    }
    catch (error) {
        console.warn('⚠️ Error cacheando películas:', error);
        // No lanzar error, el cache es opcional
    }
}
/**
 * Cargar TODAS las películas de TMDB (múltiples páginas en paralelo)
 */
async function fetchAllMoviesFromTMDB(genre) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
        throw new Error('TMDB_API_KEY no configurada');
    }
    // Cargar 25 páginas en paralelo = ~500 películas
    const TOTAL_PAGES = 25;
    const pagePromises = [];
    for (let page = 1; page <= TOTAL_PAGES; page++) {
        pagePromises.push(fetchMoviesFromTMDBPage(apiKey, genre, page));
    }
    console.log(`📦 Cargando ${TOTAL_PAGES} páginas en paralelo...`);
    const results = await Promise.all(pagePromises);
    // Combinar todas las películas
    const allMovies = [];
    const seenIds = new Set();
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
async function fetchMoviesFromTMDBPage(apiKey, genre, page) {
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
        const data = await response.json();
        if (!data.results || !Array.isArray(data.results)) {
            return [];
        }
        return data.results.map((movie) => ({
            id: movie.id.toString(),
            title: movie.title || movie.original_title || 'Título no disponible',
            poster: movie.poster_path || null,
            overview: movie.overview || 'Descripción no disponible',
            vote_average: movie.vote_average || 0,
            release_date: movie.release_date || '',
        }));
    }
    catch (error) {
        console.warn(`⚠️ Error cargando página ${page}:`, error);
        return [];
    }
}
/**
 * Obtener películas desde API TMDB con soporte para paginación (legacy)
 */
async function fetchMoviesFromTMDB(genre, page = 1) {
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
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
        throw new Error('Formato de respuesta TMDB inválido');
    }
    console.log(`✅ TMDB returned ${data.results.length} movies for page ${page}`);
    // Transformar TODAS las películas de la página (no limitar a 20)
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
}
/**
 * Mapear nombres de géneros a IDs de TMDB
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
/**
 * Obtener detalles de una película específica
 */
async function getMovieDetails(movieId) {
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
    }
    catch (apiError) {
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
async function getCachedMovieDetails(cacheKey, allowExpired = false) {
    try {
        const response = await docClient.send(new GetCommand({
            TableName: process.env.MOVIES_CACHE_TABLE,
            Key: { tmdbId: cacheKey },
        }));
        if (!response.Item) {
            return null;
        }
        const cached = response.Item;
        // Verificar si el cache ha expirado
        if (!allowExpired && cached.ttl < Math.floor(Date.now() / 1000)) {
            console.log('⏰ Cache de detalles expirado');
            return null;
        }
        return cached.movieDetails || null;
    }
    catch (error) {
        console.warn('⚠️ Error leyendo cache de detalles:', error);
        return null;
    }
}
/**
 * Cachear detalles de película en DynamoDB
 */
async function cacheMovieDetails(cacheKey, movieDetails) {
    try {
        const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 días
        await docClient.send(new PutCommand({
            TableName: process.env.MOVIES_CACHE_TABLE,
            Item: {
                tmdbId: cacheKey,
                movieDetails,
                cachedAt: new Date().toISOString(),
                ttl,
            },
        }));
        console.log(`💾 Detalles de película cacheados: ${cacheKey}`);
    }
    catch (error) {
        console.warn('⚠️ Error cacheando detalles de película:', error);
    }
}
/**
 * Obtener detalles de película desde API TMDB
 */
async function fetchMovieDetailsFromTMDB(movieId) {
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
    const movie = await response.json();
    // Transformar a formato GraphQL esperado
    return {
        id: movie.id.toString(),
        title: movie.title || movie.original_title || 'Título no disponible',
        overview: movie.overview || 'Descripción no disponible',
        poster: movie.poster_path || null,
        vote_average: movie.vote_average || 0,
        release_date: movie.release_date || '',
        genres: movie.genres?.map((g) => ({ id: g.id, name: g.name })) || [],
        runtime: movie.runtime || null,
    };
}
/**
 * Detalles de película por defecto cuando todo falla
 */
function getDefaultMovieDetails(movieId) {
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
function getDefaultMovies() {
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
async function getFilteredContent(mediaType, genreIds, limit = 30, excludeIds = []) {
    const startTime = Date.now();
    try {
        console.log(`🎯 Getting filtered content: ${mediaType}, genres: [${genreIds.join(', ')}], limit: ${limit}, exclude: ${excludeIds.length}`);
        console.log(`🚫 Excluding IDs: [${excludeIds.join(', ')}]`);
        
        // Validate input
        if (genreIds.length > 2) {
            throw new Error('Maximum 2 genres allowed');
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
        // Filter out excluded IDs - handle both string and numeric formats
        const filteredContent = contentPool.filter(item => {
            const itemId = item.tmdbId.toString();
            const prefixedId = `${mediaType.toLowerCase()}-${itemId}`;
            
            // Check if the item is in excludeIds (supports both formats)
            return !excludeIds.includes(itemId) && !excludeIds.includes(prefixedId);
        });
        
        console.log(`🧹 Filtered out duplicates: ${contentPool.length} -> ${filteredContent.length} items`);
        
        // Limit results
        const limitedContent = filteredContent.slice(0, limit);
        // Transform to Movie format expected by GraphQL
        const movies = limitedContent.map(item => {
            // Construct full poster URL from available poster path
            let fullPosterUrl = '';
            if (item.posterPath) {
                // If posterPath is already a full URL, use it
                if (item.posterPath.startsWith('http')) {
                    fullPosterUrl = item.posterPath;
                }
                else {
                    // If it's a partial path, construct full TMDB URL
                    fullPosterUrl = `https://image.tmdb.org/t/p/w500${item.posterPath}`;
                }
            }
            return {
                id: `${mediaType.toLowerCase()}-${item.tmdbId}`, // ✅ Dynamic ID based on mediaType
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
                mediaType: mediaType.toLowerCase(), // ✅ Use dynamic mediaType
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
    }
    catch (error) {
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
async function fetchWithAllGenres(endpoint, genreIds, excludeSet = new Set()) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
        throw new Error('TMDB_API_KEY no configurada');
    }
    const genreString = genreIds.join(',');
    const allMovies = [];
    const seenIds = new Set();
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
            const data = await response.json();
            if (!data.results || data.results.length === 0) {
                break; // No más resultados
            }
            // Filtrar títulos que tengan TODOS los géneros
            data.results.forEach((item) => {
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
        }
        catch (error) {
            console.warn(`⚠️ Error cargando página ${page}:`, error);
            break;
        }
    }
    return allMovies;
}
/**
 * Obtener títulos con AL MENOS UN género (OR)
 */
async function fetchWithAnyGenre(endpoint, genreIds, excludeMovies, excludeSet = new Set()) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
        throw new Error('TMDB_API_KEY no configurada');
    }
    const excludeIds = new Set(excludeMovies.map(m => m.id));
    const allMovies = [];
    const seenIds = new Set();
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
            const data = await response.json();
            if (!data.results) {
                continue;
            }
            data.results.forEach((item) => {
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
        }
        catch (error) {
            console.warn(`⚠️ Error cargando género ${genreId}:`, error);
        }
    }
    return allMovies;
}
/**
 * Obtener contenido popular del mismo tipo (fallback)
 */
async function fetchPopularContent(endpoint, limit, excludeSet = new Set()) {
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
        const data = await response.json();
        if (!data.results) {
            return [];
        }
        return data.results
            .filter((item) => !excludeSet.has(item.id.toString()))
            .slice(0, limit)
            .map((item) => ({
            id: item.id.toString(),
            title: item.title || item.name || 'Título no disponible',
            poster: item.poster_path || null,
            overview: item.overview || 'Descripción no disponible',
            vote_average: item.vote_average || 0,
            release_date: item.release_date || item.first_air_date || '',
        }));
    }
    catch (error) {
        console.warn('⚠️ Error cargando contenido popular:', error);
        return [];
    }
}
/**
 * Aleatorizar array usando algoritmo Fisher-Yates
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Get available genres for media type
 * Requirements: 1.4, 2.1
 */
async function getAvailableGenres(mediaType) {
    const startTime = Date.now();
    
    try {
        console.log(`🎭 Getting available genres for ${mediaType}`);
        
        // Get content filtering service
        const contentService = getContentFilterService();
        
        // Get genres using the content filter service
        const genres = await contentService.getAvailableGenres(mediaType);
        
        metrics.recordLatency('GetAvailableGenres', startTime);
        metrics.recordMetric('GenresCount', genres.length);
        
        console.log(`✅ Retrieved ${genres.length} genres for ${mediaType}`);
        return genres;
        
    } catch (error) {
        console.error(`❌ Error getting available genres for ${mediaType}:`, error);
        metrics.recordLatency('GetAvailableGenres_Error', startTime);
        
        // Return empty array as fallback
        console.log('🔄 Using empty array as fallback for genres');
        return [];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW92aWUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtb3ZpZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSxvQ0FBb0M7QUFDcEMsK0VBQTBFO0FBRzFFLHFDQUFxQztBQUNyQyxNQUFNLEVBQUUsY0FBYyxFQUFFLEdBQUcsT0FBTyxDQUFDLDBCQUEwQixDQUFDLENBQUM7QUFDL0QsTUFBTSxFQUFFLHNCQUFzQixFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsR0FBRyxPQUFPLENBQUMsdUJBQXVCLENBQUMsQ0FBQztBQUU1Riw4RUFBOEU7QUFDOUUsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLEtBQUssSUFBSSxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7QUFFeEQsK0RBQStEO0FBQy9ELE1BQU0sT0FBTyxHQUFHO0lBQ2QsWUFBWSxFQUFFLENBQUMsSUFBWSxFQUFFLEtBQWEsRUFBRSxJQUFhLEVBQUUsRUFBRTtRQUMzRCxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsSUFBSSxNQUFNLEtBQUssSUFBSSxJQUFJLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBQ0QsYUFBYSxFQUFFLENBQUMsU0FBaUIsRUFBRSxTQUFpQixFQUFFLEVBQUU7UUFDdEQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLFNBQVMsQ0FBQztRQUN2QyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sU0FBUyxhQUFhLE9BQU8sSUFBSSxDQUFDLENBQUM7SUFDdkQsQ0FBQztDQUNGLENBQUM7QUFFRixNQUFNLGlCQUFpQixHQUFHO0lBQ3hCLGVBQWUsRUFBRSxLQUFLLEVBQUUsUUFBZ0IsRUFBRSxFQUFFO1FBQzFDLGtFQUFrRTtRQUNsRSxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFDRCxXQUFXLEVBQUUsS0FBSyxFQUFFLFFBQWdCLEVBQUUsTUFBYSxFQUFFLEVBQUU7UUFDckQsa0VBQWtFO1FBQ2xFLE9BQU8s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O0dBRUc7QUFDSCxTQUFTLFlBQVksQ0FBSSxLQUFVO0lBQ2pDLE1BQU0sUUFBUSxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQztJQUM1QixLQUFLLElBQUksQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUM3QyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFDRCxPQUFPLFFBQVEsQ0FBQztBQUNsQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwU3luY1Jlc29sdmVyRXZlbnQsIEFwcFN5bmNSZXNvbHZlckhhbmRsZXIgfSBmcm9tICdhd3MtbGFtYmRhJztcclxuXHJcbi8vIEltcG9ydCBjb250ZW50IGZpbHRlcmluZyBzZXJ2aWNlc1xyXG5pbXBvcnQgeyBDb250ZW50RmlsdGVyU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2NvbnRlbnQtZmlsdGVyLXNlcnZpY2UnO1xyXG5pbXBvcnQgeyBNZWRpYVR5cGUgfSBmcm9tICcuLi90eXBlcy9jb250ZW50LWZpbHRlcmluZy10eXBlcyc7XHJcblxyXG4vLyBVc2UgQVdTIFNESyB2MyBmcm9tIExhbWJkYSBydW50aW1lXHJcbmNvbnN0IHsgRHluYW1vREJDbGllbnQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYicpO1xyXG5jb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIEdldENvbW1hbmQsIFB1dENvbW1hbmQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xyXG5cclxuLy8gVXNlIGJ1aWx0LWluIGZldGNoIGZyb20gTm9kZS5qcyAxOCsgcnVudGltZSAobm8gZXh0ZXJuYWwgZGVwZW5kZW5jeSBuZWVkZWQpXHJcbmNvbnN0IGZldGNoID0gZ2xvYmFsVGhpcy5mZXRjaCB8fCByZXF1aXJlKCdub2RlLWZldGNoJyk7XHJcblxyXG4vLyBTaW1wbGlmaWVkIGlubGluZSBpbXBsZW1lbnRhdGlvbnMgdG8gYXZvaWQgZGVwZW5kZW5jeSBpc3N1ZXNcclxuY29uc3QgbWV0cmljcyA9IHtcclxuICByZWNvcmRNZXRyaWM6IChuYW1lOiBzdHJpbmcsIHZhbHVlOiBudW1iZXIsIHVuaXQ/OiBzdHJpbmcpID0+IHtcclxuICAgIGNvbnNvbGUubG9nKGDwn5OKIE1ldHJpYzogJHtuYW1lfSA9ICR7dmFsdWV9ICR7dW5pdCB8fCAnJ31gKTtcclxuICB9LFxyXG4gIHJlY29yZExhdGVuY3k6IChvcGVyYXRpb246IHN0cmluZywgc3RhcnRUaW1lOiBudW1iZXIpID0+IHtcclxuICAgIGNvbnN0IGxhdGVuY3kgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xyXG4gICAgY29uc29sZS5sb2coYOKPse+4jyAke29wZXJhdGlvbn0gbGF0ZW5jeTogJHtsYXRlbmN5fW1zYCk7XHJcbiAgfVxyXG59O1xyXG5cclxuY29uc3QgbW92aWVDYWNoZVNlcnZpY2UgPSB7XHJcbiAgZ2V0Q2FjaGVkTW92aWVzOiBhc3luYyAoY2FjaGVLZXk6IHN0cmluZykgPT4ge1xyXG4gICAgLy8gVGhpcyBmdW5jdGlvbmFsaXR5IGlzIGFscmVhZHkgaW1wbGVtZW50ZWQgaW5saW5lIGluIHRoZSBoYW5kbGVyXHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9LFxyXG4gIGNhY2hlTW92aWVzOiBhc3luYyAoY2FjaGVLZXk6IHN0cmluZywgbW92aWVzOiBhbnlbXSkgPT4ge1xyXG4gICAgLy8gVGhpcyBmdW5jdGlvbmFsaXR5IGlzIGFscmVhZHkgaW1wbGVtZW50ZWQgaW5saW5lIGluIHRoZSBoYW5kbGVyXHJcbiAgICBjb25zb2xlLmxvZyhg8J+SviBDYWNoZSBvcGVyYXRpb24gZm9yICR7Y2FjaGVLZXl9OiAke21vdmllcy5sZW5ndGh9IG1vdmllc2ApO1xyXG4gIH1cclxufTtcclxuXHJcbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XHJcbmNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xyXG5cclxuLy8gSW5pdGlhbGl6ZSBjb250ZW50IGZpbHRlcmluZyBzZXJ2aWNlXHJcbmxldCBjb250ZW50RmlsdGVyU2VydmljZTogQ29udGVudEZpbHRlclNlcnZpY2UgfCBudWxsID0gbnVsbDtcclxuXHJcbmZ1bmN0aW9uIGdldENvbnRlbnRGaWx0ZXJTZXJ2aWNlKCk6IENvbnRlbnRGaWx0ZXJTZXJ2aWNlIHtcclxuICBpZiAoIWNvbnRlbnRGaWx0ZXJTZXJ2aWNlKSB7XHJcbiAgICBjb250ZW50RmlsdGVyU2VydmljZSA9IG5ldyBDb250ZW50RmlsdGVyU2VydmljZSgpO1xyXG4gIH1cclxuICByZXR1cm4gY29udGVudEZpbHRlclNlcnZpY2U7XHJcbn1cclxuXHJcbmludGVyZmFjZSBNb3ZpZSB7XHJcbiAgaWQ6IHN0cmluZztcclxuICB0aXRsZTogc3RyaW5nO1xyXG4gIHBvc3Rlcjogc3RyaW5nO1xyXG4gIG92ZXJ2aWV3OiBzdHJpbmc7XHJcbiAgdm90ZV9hdmVyYWdlPzogbnVtYmVyO1xyXG4gIHJlbGVhc2VfZGF0ZT86IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIENhY2hlZE1vdmllIGV4dGVuZHMgTW92aWUge1xyXG4gIHRtZGJJZDogc3RyaW5nO1xyXG4gIGNhY2hlZEF0OiBzdHJpbmc7XHJcbiAgdHRsOiBudW1iZXI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNb3ZpZUhhbmRsZXI6IENpcmN1aXQgQnJlYWtlciArIENhY2hlXHJcbiAqIEltcGxlbWVudGEgcGF0csOzbiBDaXJjdWl0IEJyZWFrZXIgcGFyYSBBUEkgVE1EQiBjb24gY2FjaGUgZW4gRHluYW1vREJcclxuICovXHJcbmV4cG9ydCBjb25zdCBoYW5kbGVyOiBBcHBTeW5jUmVzb2x2ZXJIYW5kbGVyPGFueSwgYW55PiA9IGFzeW5jIChldmVudDogQXBwU3luY1Jlc29sdmVyRXZlbnQ8YW55PikgPT4ge1xyXG4gIGNvbnNvbGUubG9nKCfwn46sIE1vdmllIEhhbmRsZXI6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuXHJcbiAgY29uc3QgZmllbGROYW1lID0gZXZlbnQuaW5mbz8uZmllbGROYW1lO1xyXG4gIGNvbnN0IGFyZ3MgPSBldmVudC5hcmd1bWVudHM7XHJcblxyXG4gIHRyeSB7XHJcbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xyXG4gICAgICBjYXNlICdnZXRNb3ZpZXMnOlxyXG4gICAgICAgIHJldHVybiBhd2FpdCBnZXRNb3ZpZXMoYXJncy5nZW5yZSwgYXJncy5wYWdlKTtcclxuXHJcbiAgICAgIGNhc2UgJ2dldE1vdmllRGV0YWlscyc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGdldE1vdmllRGV0YWlscyhhcmdzLm1vdmllSWQpO1xyXG5cclxuICAgICAgY2FzZSAnZ2V0RmlsdGVyZWRDb250ZW50JzpcclxuICAgICAgICByZXR1cm4gYXdhaXQgZ2V0RmlsdGVyZWRDb250ZW50KFxyXG4gICAgICAgICAgYXJncy5tZWRpYVR5cGUsXHJcbiAgICAgICAgICBhcmdzLmdlbnJlSWRzLFxyXG4gICAgICAgICAgYXJncy5saW1pdCB8fCAzMCxcclxuICAgICAgICAgIGFyZ3MuZXhjbHVkZUlkcyB8fCBbXVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgT3BlcmFjacOzbiBubyBzb3BvcnRhZGE6ICR7ZmllbGROYW1lfWApO1xyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKGDinYwgRXJyb3IgZW4gJHtmaWVsZE5hbWV9OmAsIGVycm9yKTtcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIHBlbMOtY3VsYXMgLSBjYXJnYSBNw5pMVElQTEVTIFDDgUdJTkFTIGRlIFRNREIgcGFyYSBvYnRlbmVyIHRvZG8gZWwgY29udGVuaWRvXHJcbiAqL1xyXG4vKipcclxuICogT2J0ZW5lciBwZWzDrWN1bGFzIC0gY2FyZ2EgTcOaTFRJUExFUyBQw4FHSU5BUyBkZSBUTURCIHBhcmEgb2J0ZW5lciB0b2RvIGVsIGNvbnRlbmlkb1xyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0TW92aWVzKGdlbnJlUGFyYW0/OiBzdHJpbmcsIHBhZ2U6IG51bWJlciA9IDEpOiBQcm9taXNlPE1vdmllW10+IHtcclxuICB0cnkge1xyXG4gICAgLy8gMS4gRGVjb2RpZmljYXIgZ2VucmUgeSByb29tSWQgKGZvcm1hdG86IFwiQWN0aW9ufHJvb21JZDoxMjNcIilcclxuICAgIGxldCBnZW5yZSA9IGdlbnJlUGFyYW07XHJcbiAgICBsZXQgcm9vbUlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgaWYgKGdlbnJlUGFyYW0gJiYgZ2VucmVQYXJhbS5pbmNsdWRlcygnfHJvb21JZDonKSkge1xyXG4gICAgICBjb25zdCBwYXJ0cyA9IGdlbnJlUGFyYW0uc3BsaXQoJ3xyb29tSWQ6Jyk7XHJcbiAgICAgIGdlbnJlID0gcGFydHNbMF0gfHwgdW5kZWZpbmVkOyAvLyBTaSBlcyBzdHJpbmcgdmFjw61vLCB1bmRlZmluZWRcclxuICAgICAgcm9vbUlkID0gcGFydHNbMV07XHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SNIFJvb21JRCBkZXRlY3RhZG86ICR7cm9vbUlkfSwgR8OpbmVybyByZWFsOiAke2dlbnJlIHx8ICdwb3B1bGFyJ31gKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyAyLiBVc2FyIHNvbG8gZWwgZ8OpbmVybyByZWFsIHBhcmEgbGEgY2FjaGUgZ2xvYmFsXHJcbiAgICBjb25zdCBjYWNoZUtleSA9IGBtb3ZpZXNfYWxsXyR7Z2VucmUgfHwgJ3BvcHVsYXInfWA7XHJcblxyXG4gICAgLy8gMy4gT2J0ZW5lciBwZWzDrWN1bGFzIChjYWNoZSBvIEFQSSlcclxuICAgIGxldCBtb3ZpZXM6IE1vdmllW10gPSBbXTtcclxuXHJcbiAgICAvLyBJbnRlbnRhciBvYnRlbmVyIGRlc2RlIGNhY2hlXHJcbiAgICBjb25zdCBjYWNoZWRNb3ZpZXMgPSBhd2FpdCBnZXRDYWNoZWRNb3ZpZXMoY2FjaGVLZXkpO1xyXG4gICAgaWYgKGNhY2hlZE1vdmllcyAmJiBjYWNoZWRNb3ZpZXMubGVuZ3RoID4gMTAwKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5K+IFBlbMOtY3VsYXMgb2J0ZW5pZGFzIGRlc2RlIGNhY2hlOiAke2NhY2hlZE1vdmllcy5sZW5ndGh9YCk7XHJcbiAgICAgIG1vdmllcyA9IGNhY2hlZE1vdmllcztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIENhcmdhciBNw5pMVElQTEVTIFDDgUdJTkFTIGRlIFRNREIgZW4gcGFyYWxlbG9cclxuICAgICAgY29uc29sZS5sb2coJ/CfjJAgQ2FyZ2FuZG8gVE9EQVMgbGFzIHBlbMOtY3VsYXMgZGVzZGUgVE1EQiBBUEkuLi4nKTtcclxuICAgICAgY29uc3QgYWxsTW92aWVzID0gYXdhaXQgZmV0Y2hBbGxNb3ZpZXNGcm9tVE1EQihnZW5yZSk7XHJcblxyXG4gICAgICAvLyBDYWNoZWFyIHJlc3VsdGFkb1xyXG4gICAgICBhd2FpdCBjYWNoZU1vdmllcyhjYWNoZUtleSwgYWxsTW92aWVzKTtcclxuICAgICAgY29uc29sZS5sb2coYOKchSBUb3RhbCBwZWzDrWN1bGFzIGNhcmdhZGFzOiAke2FsbE1vdmllcy5sZW5ndGh9YCk7XHJcbiAgICAgIG1vdmllcyA9IGFsbE1vdmllcztcclxuICAgIH1cclxuXHJcbiAgICAvLyA0LiBGaWx0cmFyIHBlbMOtY3VsYXMgeWEgbW9zdHJhZGEgZW4gbGEgc2FsYVxyXG4gICAgaWYgKHJvb21JZCkge1xyXG4gICAgICBjb25zdCBzaG93bk1vdmllSWRzID0gYXdhaXQgZ2V0U2hvd25Nb3ZpZXMocm9vbUlkKTtcclxuICAgICAgaWYgKHNob3duTW92aWVJZHMuc2l6ZSA+IDApIHtcclxuICAgICAgICBjb25zdCBvcmlnaW5hbENvdW50ID0gbW92aWVzLmxlbmd0aDtcclxuICAgICAgICBtb3ZpZXMgPSBtb3ZpZXMuZmlsdGVyKG0gPT4gIXNob3duTW92aWVJZHMuaGFzKG0uaWQpKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+nuSBGaWx0cmFkYXMgJHtvcmlnaW5hbENvdW50IC0gbW92aWVzLmxlbmd0aH0gcGVsw61jdWxhcyB5YSB2aXN0YXMgZW4gc2FsYSAke3Jvb21JZH1gKTtcclxuXHJcbiAgICAgICAgLy8gU2kgc2UgaGFuIHZpc3RvIHRvZGFzLCByZWluaWNpYXIgKG9wY2lvbmFsKVxyXG4gICAgICAgIGlmIChtb3ZpZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZygn8J+UhCBUb2RhcyBsYXMgcGVsw61jdWxhcyB2aXN0YXMhIFJlaW5pY2lhbmRvIGNpY2xvLicpO1xyXG4gICAgICAgICAgbW92aWVzID0gY2FjaGVkTW92aWVzIHx8IFtdO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBtb3ZpZXM7XHJcblxyXG4gIH0gY2F0Y2ggKGFwaUVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBlbiBBUEkgVE1EQjonLCBhcGlFcnJvcik7XHJcblxyXG4gICAgLy8gRmFsbGJhY2sgbG9naWNcclxuICAgIGNvbnN0IGdlbnJlID0gZ2VucmVQYXJhbT8uc3BsaXQoJ3xyb29tSWQ6JylbMF07XHJcbiAgICBjb25zdCBjYWNoZUtleSA9IGBtb3ZpZXNfYWxsXyR7Z2VucmUgfHwgJ3BvcHVsYXInfWA7XHJcbiAgICBjb25zdCBmYWxsYmFja01vdmllcyA9IGF3YWl0IGdldENhY2hlZE1vdmllcyhjYWNoZUtleSwgdHJ1ZSk7XHJcbiAgICBpZiAoZmFsbGJhY2tNb3ZpZXMgJiYgZmFsbGJhY2tNb3ZpZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICByZXR1cm4gZmFsbGJhY2tNb3ZpZXM7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGdldERlZmF1bHRNb3ZpZXMoKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIElEcyBkZSBwZWzDrWN1bGFzIHlhIG1vc3RyYWRhcyBlbiBsYSBzYWxhXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRTaG93bk1vdmllcyhyb29tSWQ6IHN0cmluZyk6IFByb21pc2U8U2V0PHN0cmluZz4+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgaWQ6IHJvb21JZCB9LFxyXG4gICAgICBQcm9qZWN0aW9uRXhwcmVzc2lvbjogJ3Nob3duTW92aWVJZHMnXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaWYgKHJlc3BvbnNlLkl0ZW0gJiYgcmVzcG9uc2UuSXRlbS5zaG93bk1vdmllSWRzKSB7XHJcbiAgICAgIC8vIER5bmFtb0RCIHNldHMgYXJlIHJldHVybmVkIGFzIFNldCBvYmplY3RzIG9yIEFycmF5cyBkZXBlbmRpbmcgb24gU0RLIHZlcnNpb25cclxuICAgICAgLy8gU2FmZSBoYW5kbGUgYm90aFxyXG4gICAgICByZXR1cm4gbmV3IFNldChBcnJheS5mcm9tKHJlc3BvbnNlLkl0ZW0uc2hvd25Nb3ZpZUlkcykpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG5ldyBTZXQoKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKGDimqDvuI8gRXJyb3IgZmV0Y2hpbmcgc2hvd24gbW92aWVzIGZvciByb29tICR7cm9vbUlkfTpgLCBlcnJvcik7XHJcbiAgICByZXR1cm4gbmV3IFNldCgpO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgcGVsw61jdWxhcyBkZXNkZSBjYWNoZSBEeW5hbW9EQlxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0Q2FjaGVkTW92aWVzKGNhY2hlS2V5OiBzdHJpbmcsIGFsbG93RXhwaXJlZCA9IGZhbHNlKTogUHJvbWlzZTxNb3ZpZVtdIHwgbnVsbD4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5NT1ZJRVNfQ0FDSEVfVEFCTEUhLFxyXG4gICAgICBLZXk6IHsgdG1kYklkOiBjYWNoZUtleSB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmICghcmVzcG9uc2UuSXRlbSkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjYWNoZWQgPSByZXNwb25zZS5JdGVtIGFzIGFueTtcclxuXHJcbiAgICAvLyBWZXJpZmljYXIgc2kgZWwgY2FjaGUgaGEgZXhwaXJhZG8gKGEgbWVub3MgcXVlIGFsbG93RXhwaXJlZCBzZWEgdHJ1ZSlcclxuICAgIGlmICghYWxsb3dFeHBpcmVkICYmIGNhY2hlZC50dGwgPCBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSkge1xyXG4gICAgICBjb25zb2xlLmxvZygn4o+wIENhY2hlIGV4cGlyYWRvJyk7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjYWNoZWQubW92aWVzIHx8IFtdO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBsZXllbmRvIGNhY2hlOicsIGVycm9yKTtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENhY2hlYXIgcGVsw61jdWxhcyBlbiBEeW5hbW9EQiBjb24gVFRMIGRlIDMwIGTDrWFzXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBjYWNoZU1vdmllcyhjYWNoZUtleTogc3RyaW5nLCBtb3ZpZXM6IE1vdmllW10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgdHRsID0gTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkgKyAoMzAgKiAyNCAqIDYwICogNjApOyAvLyAzMCBkw61hc1xyXG5cclxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5NT1ZJRVNfQ0FDSEVfVEFCTEUhLFxyXG4gICAgICBJdGVtOiB7XHJcbiAgICAgICAgdG1kYklkOiBjYWNoZUtleSxcclxuICAgICAgICBtb3ZpZXMsXHJcbiAgICAgICAgY2FjaGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICB0dGwsXHJcbiAgICAgIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coYPCfkr4gUGVsw61jdWxhcyBjYWNoZWFkYXM6ICR7Y2FjaGVLZXl9YCk7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUud2Fybign4pqg77iPIEVycm9yIGNhY2hlYW5kbyBwZWzDrWN1bGFzOicsIGVycm9yKTtcclxuICAgIC8vIE5vIGxhbnphciBlcnJvciwgZWwgY2FjaGUgZXMgb3BjaW9uYWxcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDYXJnYXIgVE9EQVMgbGFzIHBlbMOtY3VsYXMgZGUgVE1EQiAobcO6bHRpcGxlcyBww6FnaW5hcyBlbiBwYXJhbGVsbylcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGZldGNoQWxsTW92aWVzRnJvbVRNREIoZ2VucmU/OiBzdHJpbmcpOiBQcm9taXNlPE1vdmllW10+IHtcclxuICBjb25zdCBhcGlLZXkgPSBwcm9jZXNzLmVudi5UTURCX0FQSV9LRVk7XHJcbiAgaWYgKCFhcGlLZXkpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignVE1EQl9BUElfS0VZIG5vIGNvbmZpZ3VyYWRhJyk7XHJcbiAgfVxyXG5cclxuICAvLyBDYXJnYXIgMjUgcMOhZ2luYXMgZW4gcGFyYWxlbG8gPSB+NTAwIHBlbMOtY3VsYXNcclxuICBjb25zdCBUT1RBTF9QQUdFUyA9IDI1O1xyXG4gIGNvbnN0IHBhZ2VQcm9taXNlczogUHJvbWlzZTxNb3ZpZVtdPltdID0gW107XHJcblxyXG4gIGZvciAobGV0IHBhZ2UgPSAxOyBwYWdlIDw9IFRPVEFMX1BBR0VTOyBwYWdlKyspIHtcclxuICAgIHBhZ2VQcm9taXNlcy5wdXNoKGZldGNoTW92aWVzRnJvbVRNREJQYWdlKGFwaUtleSwgZ2VucmUsIHBhZ2UpKTtcclxuICB9XHJcblxyXG4gIGNvbnNvbGUubG9nKGDwn5OmIENhcmdhbmRvICR7VE9UQUxfUEFHRVN9IHDDoWdpbmFzIGVuIHBhcmFsZWxvLi4uYCk7XHJcbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHBhZ2VQcm9taXNlcyk7XHJcblxyXG4gIC8vIENvbWJpbmFyIHRvZGFzIGxhcyBwZWzDrWN1bGFzXHJcbiAgY29uc3QgYWxsTW92aWVzOiBNb3ZpZVtdID0gW107XHJcbiAgY29uc3Qgc2VlbklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xyXG5cclxuICByZXN1bHRzLmZvckVhY2goKG1vdmllcywgaW5kZXgpID0+IHtcclxuICAgIGNvbnNvbGUubG9nKGDinIUgUMOhZ2luYSAke2luZGV4ICsgMX06ICR7bW92aWVzLmxlbmd0aH0gcGVsw61jdWxhc2ApO1xyXG4gICAgbW92aWVzLmZvckVhY2gobW92aWUgPT4ge1xyXG4gICAgICBpZiAoIXNlZW5JZHMuaGFzKG1vdmllLmlkKSkge1xyXG4gICAgICAgIHNlZW5JZHMuYWRkKG1vdmllLmlkKTtcclxuICAgICAgICBhbGxNb3ZpZXMucHVzaChtb3ZpZSk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH0pO1xyXG5cclxuICBjb25zb2xlLmxvZyhg4pyFIFRvdGFsIHBlbMOtY3VsYXMgw7puaWNhczogJHthbGxNb3ZpZXMubGVuZ3RofWApO1xyXG4gIHJldHVybiBhbGxNb3ZpZXM7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDYXJnYXIgdW5hIHDDoWdpbmEgZXNwZWPDrWZpY2EgZGUgVE1EQlxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hNb3ZpZXNGcm9tVE1EQlBhZ2UoYXBpS2V5OiBzdHJpbmcsIGdlbnJlOiBzdHJpbmcgfCB1bmRlZmluZWQsIHBhZ2U6IG51bWJlcik6IFByb21pc2U8TW92aWVbXT4ge1xyXG4gIHRyeSB7XHJcbiAgICBsZXQgZW5kcG9pbnQgPSAnaHR0cHM6Ly9hcGkudGhlbW92aWVkYi5vcmcvMy9tb3ZpZS9wb3B1bGFyJztcclxuICAgIGlmIChnZW5yZSkge1xyXG4gICAgICBlbmRwb2ludCA9IGBodHRwczovL2FwaS50aGVtb3ZpZWRiLm9yZy8zL2Rpc2NvdmVyL21vdmllP3dpdGhfZ2VucmVzPSR7Z2V0R2VucmVJZChnZW5yZSl9YDtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB1cmwgPSBgJHtlbmRwb2ludH0ke2VuZHBvaW50LmluY2x1ZGVzKCc/JykgPyAnJicgOiAnPyd9YXBpX2tleT0ke2FwaUtleX0mbGFuZ3VhZ2U9ZXMtRVMmcGFnZT0ke3BhZ2V9YDtcclxuXHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwge1xyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAnVXNlci1BZ2VudCc6ICdUcmluaXR5LUFwcC8xLjAnLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBFcnJvciBlbiBww6FnaW5hICR7cGFnZX06ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZGF0YTogYW55ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG5cclxuICAgIGlmICghZGF0YS5yZXN1bHRzIHx8ICFBcnJheS5pc0FycmF5KGRhdGEucmVzdWx0cykpIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBkYXRhLnJlc3VsdHMubWFwKChtb3ZpZTogYW55KSA9PiAoe1xyXG4gICAgICBpZDogbW92aWUuaWQudG9TdHJpbmcoKSxcclxuICAgICAgdGl0bGU6IG1vdmllLnRpdGxlIHx8IG1vdmllLm9yaWdpbmFsX3RpdGxlIHx8ICdUw610dWxvIG5vIGRpc3BvbmlibGUnLFxyXG4gICAgICBwb3N0ZXI6IG1vdmllLnBvc3Rlcl9wYXRoIHx8IG51bGwsXHJcbiAgICAgIG92ZXJ2aWV3OiBtb3ZpZS5vdmVydmlldyB8fCAnRGVzY3JpcGNpw7NuIG5vIGRpc3BvbmlibGUnLFxyXG4gICAgICB2b3RlX2F2ZXJhZ2U6IG1vdmllLnZvdGVfYXZlcmFnZSB8fCAwLFxyXG4gICAgICByZWxlYXNlX2RhdGU6IG1vdmllLnJlbGVhc2VfZGF0ZSB8fCAnJyxcclxuICAgIH0pKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKGDimqDvuI8gRXJyb3IgY2FyZ2FuZG8gcMOhZ2luYSAke3BhZ2V9OmAsIGVycm9yKTtcclxuICAgIHJldHVybiBbXTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIHBlbMOtY3VsYXMgZGVzZGUgQVBJIFRNREIgY29uIHNvcG9ydGUgcGFyYSBwYWdpbmFjacOzbiAobGVnYWN5KVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hNb3ZpZXNGcm9tVE1EQihnZW5yZT86IHN0cmluZywgcGFnZTogbnVtYmVyID0gMSk6IFByb21pc2U8TW92aWVbXT4ge1xyXG4gIGNvbnN0IGFwaUtleSA9IHByb2Nlc3MuZW52LlRNREJfQVBJX0tFWTtcclxuICBpZiAoIWFwaUtleSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdUTURCX0FQSV9LRVkgbm8gY29uZmlndXJhZGEnKTtcclxuICB9XHJcblxyXG4gIC8vIERldGVybWluYXIgZW5kcG9pbnQgc2Vnw7puIGfDqW5lcm9cclxuICBsZXQgZW5kcG9pbnQgPSAnaHR0cHM6Ly9hcGkudGhlbW92aWVkYi5vcmcvMy9tb3ZpZS9wb3B1bGFyJztcclxuICBpZiAoZ2VucmUpIHtcclxuICAgIC8vIFBhcmEgZ8OpbmVyb3MgZXNwZWPDrWZpY29zLCB1c2FyIGRpc2NvdmVyXHJcbiAgICBlbmRwb2ludCA9IGBodHRwczovL2FwaS50aGVtb3ZpZWRiLm9yZy8zL2Rpc2NvdmVyL21vdmllP3dpdGhfZ2VucmVzPSR7Z2V0R2VucmVJZChnZW5yZSl9YDtcclxuICB9XHJcblxyXG4gIGNvbnN0IHVybCA9IGAke2VuZHBvaW50fT9hcGlfa2V5PSR7YXBpS2V5fSZsYW5ndWFnZT1lcy1FUyZwYWdlPSR7cGFnZX1gO1xyXG5cclxuICBjb25zb2xlLmxvZyhg8J+UjSBGZXRjaGluZyBmcm9tIFRNREI6ICR7dXJsfWApO1xyXG5cclxuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwge1xyXG4gICAgaGVhZGVyczoge1xyXG4gICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAnVXNlci1BZ2VudCc6ICdUcmluaXR5LUFwcC8xLjAnLFxyXG4gICAgfSxcclxuICB9KTtcclxuXHJcbiAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBUTURCIEFQSSBlcnJvcjogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGRhdGE6IGFueSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuXHJcbiAgaWYgKCFkYXRhLnJlc3VsdHMgfHwgIUFycmF5LmlzQXJyYXkoZGF0YS5yZXN1bHRzKSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGb3JtYXRvIGRlIHJlc3B1ZXN0YSBUTURCIGludsOhbGlkbycpO1xyXG4gIH1cclxuXHJcbiAgY29uc29sZS5sb2coYOKchSBUTURCIHJldHVybmVkICR7ZGF0YS5yZXN1bHRzLmxlbmd0aH0gbW92aWVzIGZvciBwYWdlICR7cGFnZX1gKTtcclxuXHJcbiAgLy8gVHJhbnNmb3JtYXIgVE9EQVMgbGFzIHBlbMOtY3VsYXMgZGUgbGEgcMOhZ2luYSAobm8gbGltaXRhciBhIDIwKVxyXG4gIHJldHVybiBkYXRhLnJlc3VsdHMubWFwKChtb3ZpZTogYW55KSA9PiAoe1xyXG4gICAgaWQ6IG1vdmllLmlkLnRvU3RyaW5nKCksXHJcbiAgICB0aXRsZTogbW92aWUudGl0bGUgfHwgbW92aWUub3JpZ2luYWxfdGl0bGUgfHwgJ1TDrXR1bG8gbm8gZGlzcG9uaWJsZScsXHJcbiAgICBwb3N0ZXI6IG1vdmllLnBvc3Rlcl9wYXRoXHJcbiAgICAgID8gYGh0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAke21vdmllLnBvc3Rlcl9wYXRofWBcclxuICAgICAgOiAnaHR0cHM6Ly92aWEucGxhY2Vob2xkZXIuY29tLzUwMHg3NTA/dGV4dD1TaW4rUG9zdGVyJyxcclxuICAgIG92ZXJ2aWV3OiBtb3ZpZS5vdmVydmlldyB8fCAnRGVzY3JpcGNpw7NuIG5vIGRpc3BvbmlibGUnLFxyXG4gICAgdm90ZV9hdmVyYWdlOiBtb3ZpZS52b3RlX2F2ZXJhZ2UgfHwgMCxcclxuICAgIHJlbGVhc2VfZGF0ZTogbW92aWUucmVsZWFzZV9kYXRlIHx8ICcnLFxyXG4gIH0pKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1hcGVhciBub21icmVzIGRlIGfDqW5lcm9zIGEgSURzIGRlIFRNREJcclxuICovXHJcbmZ1bmN0aW9uIGdldEdlbnJlSWQoZ2VucmVOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGNvbnN0IGdlbnJlTWFwOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0ge1xyXG4gICAgJ2FjdGlvbic6ICcyOCcsXHJcbiAgICAnYWR2ZW50dXJlJzogJzEyJyxcclxuICAgICdhbmltYXRpb24nOiAnMTYnLFxyXG4gICAgJ2NvbWVkeSc6ICczNScsXHJcbiAgICAnY3JpbWUnOiAnODAnLFxyXG4gICAgJ2RvY3VtZW50YXJ5JzogJzk5JyxcclxuICAgICdkcmFtYSc6ICcxOCcsXHJcbiAgICAnZmFtaWx5JzogJzEwNzUxJyxcclxuICAgICdmYW50YXN5JzogJzE0JyxcclxuICAgICdoaXN0b3J5JzogJzM2JyxcclxuICAgICdob3Jyb3InOiAnMjcnLFxyXG4gICAgJ211c2ljJzogJzEwNDAyJyxcclxuICAgICdteXN0ZXJ5JzogJzk2NDgnLFxyXG4gICAgJ3JvbWFuY2UnOiAnMTA3NDknLFxyXG4gICAgJ3NjaWVuY2VfZmljdGlvbic6ICc4NzgnLFxyXG4gICAgJ3RocmlsbGVyJzogJzUzJyxcclxuICAgICd3YXInOiAnMTA3NTInLFxyXG4gICAgJ3dlc3Rlcm4nOiAnMzcnLFxyXG4gIH07XHJcblxyXG4gIHJldHVybiBnZW5yZU1hcFtnZW5yZU5hbWUudG9Mb3dlckNhc2UoKV0gfHwgJzI4JzsgLy8gRGVmYXVsdDogQWN0aW9uXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIGRldGFsbGVzIGRlIHVuYSBwZWzDrWN1bGEgZXNwZWPDrWZpY2FcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldE1vdmllRGV0YWlscyhtb3ZpZUlkOiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xyXG4gIGNvbnN0IGNhY2hlS2V5ID0gYG1vdmllX2RldGFpbHNfJHttb3ZpZUlkfWA7XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyAxLiBJbnRlbnRhciBvYnRlbmVyIGRlc2RlIGNhY2hlXHJcbiAgICBjb25zdCBjYWNoZWRNb3ZpZSA9IGF3YWl0IGdldENhY2hlZE1vdmllRGV0YWlscyhjYWNoZUtleSk7XHJcbiAgICBpZiAoY2FjaGVkTW92aWUpIHtcclxuICAgICAgY29uc29sZS5sb2coYPCfkr4gRGV0YWxsZXMgZGUgcGVsw61jdWxhIG9idGVuaWRvcyBkZXNkZSBjYWNoZTogJHttb3ZpZUlkfWApO1xyXG4gICAgICByZXR1cm4gY2FjaGVkTW92aWU7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gMi4gU2kgbm8gaGF5IGNhY2hlLCBvYnRlbmVyIGRlc2RlIEFQSSBUTURCXHJcbiAgICBjb25zb2xlLmxvZyhg8J+MkCBPYnRlbmllbmRvIGRldGFsbGVzIGRlIHBlbMOtY3VsYSAke21vdmllSWR9IGRlc2RlIFRNREIgQVBJLi4uYCk7XHJcbiAgICBjb25zdCBtb3ZpZURldGFpbHMgPSBhd2FpdCBmZXRjaE1vdmllRGV0YWlsc0Zyb21UTURCKG1vdmllSWQpO1xyXG5cclxuICAgIC8vIDMuIENhY2hlYXIgcmVzdWx0YWRvIGV4aXRvc29cclxuICAgIGF3YWl0IGNhY2hlTW92aWVEZXRhaWxzKGNhY2hlS2V5LCBtb3ZpZURldGFpbHMpO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgRGV0YWxsZXMgZGUgcGVsw61jdWxhIG9idGVuaWRvcyBkZXNkZSBBUEk6ICR7bW92aWVEZXRhaWxzLnRpdGxlfWApO1xyXG4gICAgcmV0dXJuIG1vdmllRGV0YWlscztcclxuXHJcbiAgfSBjYXRjaCAoYXBpRXJyb3IpIHtcclxuICAgIGNvbnNvbGUud2Fybihg4pqg77iPIEVycm9yIGVuIEFQSSBUTURCIHBhcmEgcGVsw61jdWxhICR7bW92aWVJZH0sIGludGVudGFuZG8gZmFsbGJhY2s6YCwgYXBpRXJyb3IpO1xyXG5cclxuICAgIC8vIDQuIEZhbGxiYWNrOiBpbnRlbnRhciBjYWNoZSBleHBpcmFkb1xyXG4gICAgY29uc3QgZmFsbGJhY2tNb3ZpZSA9IGF3YWl0IGdldENhY2hlZE1vdmllRGV0YWlscyhjYWNoZUtleSwgdHJ1ZSk7XHJcbiAgICBpZiAoZmFsbGJhY2tNb3ZpZSkge1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+UhCBVc2FuZG8gY2FjaGUgZXhwaXJhZG8gY29tbyBmYWxsYmFjayBwYXJhIHBlbMOtY3VsYSAke21vdmllSWR9YCk7XHJcbiAgICAgIHJldHVybiBmYWxsYmFja01vdmllO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIDUuIFNpIHRvZG8gZmFsbGEsIHJldG9ybmFyIHBlbMOtY3VsYSBwb3IgZGVmZWN0b1xyXG4gICAgY29uc29sZS5sb2coYPCfjq0gVXNhbmRvIHBlbMOtY3VsYSBwb3IgZGVmZWN0byBwYXJhIElEICR7bW92aWVJZH1gKTtcclxuICAgIHJldHVybiBnZXREZWZhdWx0TW92aWVEZXRhaWxzKG1vdmllSWQpO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgZGV0YWxsZXMgZGUgcGVsw61jdWxhIGRlc2RlIGNhY2hlIER5bmFtb0RCXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRDYWNoZWRNb3ZpZURldGFpbHMoY2FjaGVLZXk6IHN0cmluZywgYWxsb3dFeHBpcmVkID0gZmFsc2UpOiBQcm9taXNlPGFueSB8IG51bGw+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuTU9WSUVTX0NBQ0hFX1RBQkxFISxcclxuICAgICAgS2V5OiB7IHRtZGJJZDogY2FjaGVLZXkgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICBpZiAoIXJlc3BvbnNlLkl0ZW0pIHtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgY2FjaGVkID0gcmVzcG9uc2UuSXRlbSBhcyBhbnk7XHJcblxyXG4gICAgLy8gVmVyaWZpY2FyIHNpIGVsIGNhY2hlIGhhIGV4cGlyYWRvXHJcbiAgICBpZiAoIWFsbG93RXhwaXJlZCAmJiBjYWNoZWQudHRsIDwgTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkpIHtcclxuICAgICAgY29uc29sZS5sb2coJ+KPsCBDYWNoZSBkZSBkZXRhbGxlcyBleHBpcmFkbycpO1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gY2FjaGVkLm1vdmllRGV0YWlscyB8fCBudWxsO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBsZXllbmRvIGNhY2hlIGRlIGRldGFsbGVzOicsIGVycm9yKTtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENhY2hlYXIgZGV0YWxsZXMgZGUgcGVsw61jdWxhIGVuIER5bmFtb0RCXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBjYWNoZU1vdmllRGV0YWlscyhjYWNoZUtleTogc3RyaW5nLCBtb3ZpZURldGFpbHM6IGFueSk6IFByb21pc2U8dm9pZD4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCB0dGwgPSBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSArICgzMCAqIDI0ICogNjAgKiA2MCk7IC8vIDMwIGTDrWFzXHJcblxyXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52Lk1PVklFU19DQUNIRV9UQUJMRSEsXHJcbiAgICAgIEl0ZW06IHtcclxuICAgICAgICB0bWRiSWQ6IGNhY2hlS2V5LFxyXG4gICAgICAgIG1vdmllRGV0YWlscyxcclxuICAgICAgICBjYWNoZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIHR0bCxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg8J+SviBEZXRhbGxlcyBkZSBwZWzDrWN1bGEgY2FjaGVhZG9zOiAke2NhY2hlS2V5fWApO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBjYWNoZWFuZG8gZGV0YWxsZXMgZGUgcGVsw61jdWxhOicsIGVycm9yKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIGRldGFsbGVzIGRlIHBlbMOtY3VsYSBkZXNkZSBBUEkgVE1EQlxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hNb3ZpZURldGFpbHNGcm9tVE1EQihtb3ZpZUlkOiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xyXG4gIGNvbnN0IGFwaUtleSA9IHByb2Nlc3MuZW52LlRNREJfQVBJX0tFWTtcclxuICBpZiAoIWFwaUtleSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdUTURCX0FQSV9LRVkgbm8gY29uZmlndXJhZGEnKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHVybCA9IGBodHRwczovL2FwaS50aGVtb3ZpZWRiLm9yZy8zL21vdmllLyR7bW92aWVJZH0/YXBpX2tleT0ke2FwaUtleX0mbGFuZ3VhZ2U9ZXMtRVMmYXBwZW5kX3RvX3Jlc3BvbnNlPWNyZWRpdHMsdmlkZW9zYDtcclxuXHJcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcclxuICAgIGhlYWRlcnM6IHtcclxuICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgJ1VzZXItQWdlbnQnOiAnVHJpbml0eS1BcHAvMS4wJyxcclxuICAgIH0sXHJcbiAgfSk7XHJcblxyXG4gIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwNCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFBlbMOtY3VsYSBubyBlbmNvbnRyYWRhOiAke21vdmllSWR9YCk7XHJcbiAgICB9XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFRNREIgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgbW92aWU6IGFueSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuXHJcbiAgLy8gVHJhbnNmb3JtYXIgYSBmb3JtYXRvIEdyYXBoUUwgZXNwZXJhZG9cclxuICByZXR1cm4ge1xyXG4gICAgaWQ6IG1vdmllLmlkLnRvU3RyaW5nKCksXHJcbiAgICB0aXRsZTogbW92aWUudGl0bGUgfHwgbW92aWUub3JpZ2luYWxfdGl0bGUgfHwgJ1TDrXR1bG8gbm8gZGlzcG9uaWJsZScsXHJcbiAgICBvdmVydmlldzogbW92aWUub3ZlcnZpZXcgfHwgJ0Rlc2NyaXBjacOzbiBubyBkaXNwb25pYmxlJyxcclxuICAgIHBvc3RlcjogbW92aWUucG9zdGVyX3BhdGggfHwgbnVsbCxcclxuICAgIHZvdGVfYXZlcmFnZTogbW92aWUudm90ZV9hdmVyYWdlIHx8IDAsXHJcbiAgICByZWxlYXNlX2RhdGU6IG1vdmllLnJlbGVhc2VfZGF0ZSB8fCAnJyxcclxuICAgIGdlbnJlczogbW92aWUuZ2VucmVzPy5tYXAoKGc6IGFueSkgPT4gKHsgaWQ6IGcuaWQsIG5hbWU6IGcubmFtZSB9KSkgfHwgW10sXHJcbiAgICBydW50aW1lOiBtb3ZpZS5ydW50aW1lIHx8IG51bGwsXHJcbiAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIERldGFsbGVzIGRlIHBlbMOtY3VsYSBwb3IgZGVmZWN0byBjdWFuZG8gdG9kbyBmYWxsYVxyXG4gKi9cclxuZnVuY3Rpb24gZ2V0RGVmYXVsdE1vdmllRGV0YWlscyhtb3ZpZUlkOiBzdHJpbmcpOiBhbnkge1xyXG4gIHJldHVybiB7XHJcbiAgICBpZDogbW92aWVJZCxcclxuICAgIHRpdGxlOiAnUGVsw61jdWxhIG5vIGRpc3BvbmlibGUnLFxyXG4gICAgb3ZlcnZpZXc6ICdMb3MgZGV0YWxsZXMgZGUgZXN0YSBwZWzDrWN1bGEgbm8gZXN0w6FuIGRpc3BvbmlibGVzIHRlbXBvcmFsbWVudGUgZGViaWRvIGEgcHJvYmxlbWFzIGRlIGNvbmVjdGl2aWRhZC4gUG9yIGZhdm9yLCBpbnTDqW50YWxvIG3DoXMgdGFyZGUuJyxcclxuICAgIHBvc3RlcjogbnVsbCxcclxuICAgIHZvdGVfYXZlcmFnZTogMCxcclxuICAgIHJlbGVhc2VfZGF0ZTogJycsXHJcbiAgICBnZW5yZXM6IFtdLFxyXG4gICAgcnVudGltZTogbnVsbCxcclxuICB9O1xyXG59XHJcblxyXG4vKipcclxuICogUGVsw61jdWxhcyBwb3IgZGVmZWN0byBjdWFuZG8gdG9kbyBmYWxsYVxyXG4gKi9cclxuZnVuY3Rpb24gZ2V0RGVmYXVsdE1vdmllcygpOiBNb3ZpZVtdIHtcclxuICByZXR1cm4gW1xyXG4gICAge1xyXG4gICAgICBpZDogJzIzOCcsIC8vIEVsIFBhZHJpbm9cclxuICAgICAgdGl0bGU6ICdFbCBQYWRyaW5vJyxcclxuICAgICAgcG9zdGVyOiAnaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMC8zYmhrcmo1OFZ0dTdlbllzUm9sRDFmWmRqYTEuanBnJyxcclxuICAgICAgb3ZlcnZpZXc6ICdMYSBoaXN0b3JpYSBkZSB1bmEgZmFtaWxpYSBkZSBsYSBtYWZpYSBpdGFsaWFuYSBlbiBOdWV2YSBZb3JrLicsXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBpZDogJzY4MCcsIC8vIFB1bHAgRmljdGlvblxyXG4gICAgICB0aXRsZTogJ1B1bHAgRmljdGlvbicsXHJcbiAgICAgIHBvc3RlcjogJ2h0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAvZDVpSWxGbjVzMEltc3pZekJQYjhKUElmYlhELmpwZycsXHJcbiAgICAgIG92ZXJ2aWV3OiAnSGlzdG9yaWFzIGVudHJlbGF6YWRhcyBkZSBjcmltZW4gZW4gTG9zIMOBbmdlbGVzLicsXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBpZDogJzEyMCcsIC8vIEVsIFNlw7FvciBkZSBsb3MgQW5pbGxvc1xyXG4gICAgICB0aXRsZTogJ0VsIFNlw7FvciBkZSBsb3MgQW5pbGxvcycsXHJcbiAgICAgIHBvc3RlcjogJ2h0dHBzOi8vaW1hZ2UudG1kYi5vcmcvdC9wL3c1MDAvNm9vbTVRWVEyeVFUTUpJYm52YmtCTDljSG82LmpwZycsXHJcbiAgICAgIG92ZXJ2aWV3OiAnVW5hIMOpcGljYSBhdmVudHVyYSBkZSBmYW50YXPDrWEgZW4gbGEgVGllcnJhIE1lZGlhLicsXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBpZDogJzEzJywgLy8gRm9ycmVzdCBHdW1wXHJcbiAgICAgIHRpdGxlOiAnRm9ycmVzdCBHdW1wJyxcclxuICAgICAgcG9zdGVyOiAnaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMC9helk2U2xpY0xPenBJMDZZOTg4OWE3WjRTOW4uanBnJyxcclxuICAgICAgb3ZlcnZpZXc6ICdMYSBleHRyYW9yZGluYXJpYSB2aWRhIGRlIHVuIGhvbWJyZSBzaW1wbGUuJyxcclxuICAgIH0sXHJcbiAgICB7XHJcbiAgICAgIGlkOiAnNjAzJywgLy8gTWF0cml4XHJcbiAgICAgIHRpdGxlOiAnTWF0cml4JyxcclxuICAgICAgcG9zdGVyOiAnaHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3AvdzUwMC9mODlVM0FEcjFvaUIxczlHa2RQT0VwWFVrNUguanBnJyxcclxuICAgICAgb3ZlcnZpZXc6ICdVbiBwcm9ncmFtYWRvciBkZXNjdWJyZSBsYSB2ZXJkYWQgc29icmUgbGEgcmVhbGlkYWQuJyxcclxuICAgIH0sXHJcbiAgXTtcclxufVxyXG5cclxuLyoqXHJcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICogTlVFVk86IFNpc3RlbWEgZGUgRmlsdHJhZG8gZGUgQ29udGVuaWRvXHJcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICovXHJcblxyXG4vKipcclxuICogR2V0IGZpbHRlcmVkIGNvbnRlbnQgdXNpbmcgdGhlIG5ldyBjb250ZW50IGZpbHRlcmluZyBzeXN0ZW1cclxuICogUmVxdWlyZW1lbnRzOiAzLjEsIDMuMiwgMy4zLCAzLjQsIDMuNVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0RmlsdGVyZWRDb250ZW50KFxyXG4gIG1lZGlhVHlwZTogTWVkaWFUeXBlLFxyXG4gIGdlbnJlSWRzOiBudW1iZXJbXSxcclxuICBsaW1pdDogbnVtYmVyID0gMzAsXHJcbiAgZXhjbHVkZUlkczogc3RyaW5nW10gPSBbXVxyXG4pOiBQcm9taXNlPE1vdmllW10+IHtcclxuICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gIFxyXG4gIHRyeSB7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+OryBHZXR0aW5nIGZpbHRlcmVkIGNvbnRlbnQ6ICR7bWVkaWFUeXBlfSwgZ2VucmVzOiBbJHtnZW5yZUlkcy5qb2luKCcsICcpfV0sIGxpbWl0OiAke2xpbWl0fSwgZXhjbHVkZTogJHtleGNsdWRlSWRzLmxlbmd0aH1gKTtcclxuXHJcbiAgICAvLyBWYWxpZGF0ZSBpbnB1dFxyXG4gICAgaWYgKGdlbnJlSWRzLmxlbmd0aCA+IDMpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXhpbXVtIDMgZ2VucmVzIGFsbG93ZWQnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDcmVhdGUgZmlsdGVyIGNyaXRlcmlhXHJcbiAgICBjb25zdCBmaWx0ZXJDcml0ZXJpYSA9IHtcclxuICAgICAgbWVkaWFUeXBlLFxyXG4gICAgICBnZW5yZXM6IGdlbnJlSWRzLFxyXG4gICAgICByb29tSWQ6ICd0ZW1wLScgKyBEYXRlLm5vdygpIC8vIFRlbXBvcmFyeSByb29tIElEIGZvciBmaWx0ZXJpbmdcclxuICAgIH07XHJcblxyXG4gICAgLy8gR2V0IGNvbnRlbnQgZmlsdGVyaW5nIHNlcnZpY2VcclxuICAgIGNvbnN0IGNvbnRlbnRTZXJ2aWNlID0gZ2V0Q29udGVudEZpbHRlclNlcnZpY2UoKTtcclxuXHJcbiAgICAvLyBMb2FkIGZpbHRlcmVkIGNvbnRlbnQgdXNpbmcgdGhlIHByaW9yaXR5IGFsZ29yaXRobVxyXG4gICAgY29uc3QgY29udGVudFBvb2wgPSBhd2FpdCBjb250ZW50U2VydmljZS5jcmVhdGVGaWx0ZXJlZFJvb20oZmlsdGVyQ3JpdGVyaWEpO1xyXG5cclxuICAgIC8vIEZpbHRlciBvdXQgZXhjbHVkZWQgSURzXHJcbiAgICBjb25zdCBmaWx0ZXJlZENvbnRlbnQgPSBjb250ZW50UG9vbC5maWx0ZXIoaXRlbSA9PiBcclxuICAgICAgIWV4Y2x1ZGVJZHMuaW5jbHVkZXMoaXRlbS50bWRiSWQpXHJcbiAgICApO1xyXG5cclxuICAgIC8vIExpbWl0IHJlc3VsdHNcclxuICAgIGNvbnN0IGxpbWl0ZWRDb250ZW50ID0gZmlsdGVyZWRDb250ZW50LnNsaWNlKDAsIGxpbWl0KTtcclxuXHJcbiAgICAvLyBUcmFuc2Zvcm0gdG8gTW92aWUgZm9ybWF0IGV4cGVjdGVkIGJ5IEdyYXBoUUxcclxuICAgIGNvbnN0IG1vdmllczogTW92aWVbXSA9IGxpbWl0ZWRDb250ZW50Lm1hcChpdGVtID0+IHtcclxuICAgICAgLy8gQ29uc3RydWN0IGZ1bGwgcG9zdGVyIFVSTCBmcm9tIGF2YWlsYWJsZSBwb3N0ZXIgcGF0aFxyXG4gICAgICBsZXQgZnVsbFBvc3RlclVybCA9ICcnO1xyXG4gICAgICBpZiAoaXRlbS5wb3N0ZXJQYXRoKSB7XHJcbiAgICAgICAgLy8gSWYgcG9zdGVyUGF0aCBpcyBhbHJlYWR5IGEgZnVsbCBVUkwsIHVzZSBpdFxyXG4gICAgICAgIGlmIChpdGVtLnBvc3RlclBhdGguc3RhcnRzV2l0aCgnaHR0cCcpKSB7XHJcbiAgICAgICAgICBmdWxsUG9zdGVyVXJsID0gaXRlbS5wb3N0ZXJQYXRoO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAvLyBJZiBpdCdzIGEgcGFydGlhbCBwYXRoLCBjb25zdHJ1Y3QgZnVsbCBUTURCIFVSTFxyXG4gICAgICAgICAgZnVsbFBvc3RlclVybCA9IGBodHRwczovL2ltYWdlLnRtZGIub3JnL3QvcC93NTAwJHtpdGVtLnBvc3RlclBhdGh9YDtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgaWQ6IGBtb3ZpZS0ke2l0ZW0udG1kYklkfWAsXHJcbiAgICAgICAgcmVtb3RlSWQ6IGl0ZW0udG1kYklkLFxyXG4gICAgICAgIHRtZGJJZDogcGFyc2VJbnQoaXRlbS50bWRiSWQpLFxyXG4gICAgICAgIHRpdGxlOiBpdGVtLnRpdGxlLFxyXG4gICAgICAgIG9yaWdpbmFsVGl0bGU6IGl0ZW0udGl0bGUsXHJcbiAgICAgICAgb3ZlcnZpZXc6IGl0ZW0ub3ZlcnZpZXcsXHJcbiAgICAgICAgcG9zdGVyUGF0aDogZnVsbFBvc3RlclVybCxcclxuICAgICAgICBiYWNrZHJvcFBhdGg6IG51bGwsXHJcbiAgICAgICAgcmVsZWFzZURhdGU6IGl0ZW0ucmVsZWFzZURhdGUsXHJcbiAgICAgICAgeWVhcjogaXRlbS5yZWxlYXNlRGF0ZSA/IG5ldyBEYXRlKGl0ZW0ucmVsZWFzZURhdGUpLmdldEZ1bGxZZWFyKCkudG9TdHJpbmcoKSA6ICcnLFxyXG4gICAgICAgIHJhdGluZzogaXRlbS52b3RlQXZlcmFnZSxcclxuICAgICAgICB2b3RlQ291bnQ6IDAsXHJcbiAgICAgICAgZ2VucmVzOiBbXSxcclxuICAgICAgICBtZWRpYVR5cGU6ICdtb3ZpZScsXHJcbiAgICAgICAgcnVudGltZTogbnVsbCxcclxuICAgICAgICB0YWdsaW5lOiAnJyxcclxuICAgICAgICBidWRnZXQ6IDAsXHJcbiAgICAgICAgcmV2ZW51ZTogMCxcclxuICAgICAgICB0cmFpbGVyS2V5OiBudWxsLFxyXG4gICAgICAgIHdhdGNoUHJvdmlkZXJzOiBbXSxcclxuICAgICAgICBjYXN0OiBbXSxcclxuICAgICAgICBkaXJlY3RvcjogbnVsbCxcclxuICAgICAgICAvLyBDb21wYXRpYmlsaXR5IGZpZWxkc1xyXG4gICAgICAgIG1lZGlhUG9zdGVyUGF0aDogZnVsbFBvc3RlclVybCxcclxuICAgICAgICBtZWRpYVRpdGxlOiBpdGVtLnRpdGxlLFxyXG4gICAgICAgIG1lZGlhWWVhcjogaXRlbS5yZWxlYXNlRGF0ZSA/IG5ldyBEYXRlKGl0ZW0ucmVsZWFzZURhdGUpLmdldEZ1bGxZZWFyKCkudG9TdHJpbmcoKSA6ICcnLFxyXG4gICAgICAgIG1lZGlhT3ZlcnZpZXc6IGl0ZW0ub3ZlcnZpZXcsXHJcbiAgICAgICAgbWVkaWFSYXRpbmc6IGl0ZW0udm90ZUF2ZXJhZ2UgfHwgbnVsbCxcclxuICAgICAgICBwb3N0ZXI6IGZ1bGxQb3N0ZXJVcmwsXHJcbiAgICAgICAgdm90ZV9hdmVyYWdlOiBpdGVtLnZvdGVBdmVyYWdlXHJcbiAgICAgIH07XHJcbiAgICB9KTtcclxuXHJcbiAgICBtZXRyaWNzLnJlY29yZExhdGVuY3koJ0dldEZpbHRlcmVkQ29udGVudCcsIHN0YXJ0VGltZSk7XHJcbiAgICBtZXRyaWNzLnJlY29yZE1ldHJpYygnRmlsdGVyZWRDb250ZW50Q291bnQnLCBtb3ZpZXMubGVuZ3RoKTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIEZpbHRlcmVkIGNvbnRlbnQgbG9hZGVkOiAke21vdmllcy5sZW5ndGh9IGl0ZW1zIChQcmlvcml0eSBhbGdvcml0aG0gYXBwbGllZClgKTtcclxuICAgIHJldHVybiBtb3ZpZXM7XHJcblxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZ2V0dGluZyBmaWx0ZXJlZCBjb250ZW50OicsIGVycm9yKTtcclxuICAgIG1ldHJpY3MucmVjb3JkTGF0ZW5jeSgnR2V0RmlsdGVyZWRDb250ZW50X0Vycm9yJywgc3RhcnRUaW1lKTtcclxuXHJcbiAgICAvLyBGYWxsYmFjayB0byBkZWZhdWx0IG1vdmllcyBpZiBmaWx0ZXJpbmcgZmFpbHNcclxuICAgIGNvbnNvbGUubG9nKCfwn5SEIFVzaW5nIGZhbGxiYWNrIGRlZmF1bHQgbW92aWVzIGR1ZSB0byBmaWx0ZXJpbmcgZXJyb3InKTtcclxuICAgIHJldHVybiBnZXREZWZhdWx0TW92aWVzKCk7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciB0w610dWxvcyBjb24gVE9ET1MgbG9zIGfDqW5lcm9zIGVzcGVjaWZpY2Fkb3MgKEFORClcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGZldGNoV2l0aEFsbEdlbnJlcyhlbmRwb2ludDogc3RyaW5nLCBnZW5yZUlkczogbnVtYmVyW10sIGV4Y2x1ZGVTZXQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpKTogUHJvbWlzZTxNb3ZpZVtdPiB7XHJcbiAgY29uc3QgYXBpS2V5ID0gcHJvY2Vzcy5lbnYuVE1EQl9BUElfS0VZO1xyXG4gIGlmICghYXBpS2V5KSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1RNREJfQVBJX0tFWSBubyBjb25maWd1cmFkYScpO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgZ2VucmVTdHJpbmcgPSBnZW5yZUlkcy5qb2luKCcsJyk7XHJcbiAgY29uc3QgYWxsTW92aWVzOiBNb3ZpZVtdID0gW107XHJcbiAgY29uc3Qgc2VlbklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xyXG5cclxuICAvLyBDYXJnYXIgbcO6bHRpcGxlcyBww6FnaW5hcyBwYXJhIG9idGVuZXIgbcOhcyByZXN1bHRhZG9zXHJcbiAgY29uc3QgUEFHRVNfVE9fRkVUQ0ggPSAxMDtcclxuXHJcbiAgZm9yIChsZXQgcGFnZSA9IDE7IHBhZ2UgPD0gUEFHRVNfVE9fRkVUQ0g7IHBhZ2UrKykge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgdXJsID0gYGh0dHBzOi8vYXBpLnRoZW1vdmllZGIub3JnLzMvZGlzY292ZXIvJHtlbmRwb2ludH0/d2l0aF9nZW5yZXM9JHtnZW5yZVN0cmluZ30mYXBpX2tleT0ke2FwaUtleX0mbGFuZ3VhZ2U9ZXMtRVMmcGFnZT0ke3BhZ2V9JnNvcnRfYnk9cG9wdWxhcml0eS5kZXNjYDtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XHJcbiAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAgICdVc2VyLUFnZW50JzogJ1RyaW5pdHktQXBwLzEuMCcsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gRXJyb3IgZW4gcMOhZ2luYSAke3BhZ2V9OiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZGF0YTogYW55ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG5cclxuICAgICAgaWYgKCFkYXRhLnJlc3VsdHMgfHwgZGF0YS5yZXN1bHRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGJyZWFrOyAvLyBObyBtw6FzIHJlc3VsdGFkb3NcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRmlsdHJhciB0w610dWxvcyBxdWUgdGVuZ2FuIFRPRE9TIGxvcyBnw6luZXJvc1xyXG4gICAgICBkYXRhLnJlc3VsdHMuZm9yRWFjaCgoaXRlbTogYW55KSA9PiB7XHJcbiAgICAgICAgY29uc3QgaXRlbUdlbnJlSWRzID0gaXRlbS5nZW5yZV9pZHMgfHwgW107XHJcbiAgICAgICAgY29uc3QgaGFzQWxsR2VucmVzID0gZ2VucmVJZHMuZXZlcnkoZ2VucmVJZCA9PiBpdGVtR2VucmVJZHMuaW5jbHVkZXMoZ2VucmVJZCkpO1xyXG5cclxuICAgICAgICBpZiAoaGFzQWxsR2VucmVzICYmICFzZWVuSWRzLmhhcyhpdGVtLmlkLnRvU3RyaW5nKCkpICYmICFleGNsdWRlU2V0LmhhcyhpdGVtLmlkLnRvU3RyaW5nKCkpKSB7XHJcbiAgICAgICAgICBzZWVuSWRzLmFkZChpdGVtLmlkLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgYWxsTW92aWVzLnB1c2goe1xyXG4gICAgICAgICAgICBpZDogaXRlbS5pZC50b1N0cmluZygpLFxyXG4gICAgICAgICAgICB0aXRsZTogaXRlbS50aXRsZSB8fCBpdGVtLm5hbWUgfHwgJ1TDrXR1bG8gbm8gZGlzcG9uaWJsZScsXHJcbiAgICAgICAgICAgIHBvc3RlcjogaXRlbS5wb3N0ZXJfcGF0aCB8fCBudWxsLFxyXG4gICAgICAgICAgICBvdmVydmlldzogaXRlbS5vdmVydmlldyB8fCAnRGVzY3JpcGNpw7NuIG5vIGRpc3BvbmlibGUnLFxyXG4gICAgICAgICAgICB2b3RlX2F2ZXJhZ2U6IGl0ZW0udm90ZV9hdmVyYWdlIHx8IDAsXHJcbiAgICAgICAgICAgIHJlbGVhc2VfZGF0ZTogaXRlbS5yZWxlYXNlX2RhdGUgfHwgaXRlbS5maXJzdF9haXJfZGF0ZSB8fCAnJyxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gRXJyb3IgY2FyZ2FuZG8gcMOhZ2luYSAke3BhZ2V9OmAsIGVycm9yKTtcclxuICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gYWxsTW92aWVzO1xyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciB0w610dWxvcyBjb24gQUwgTUVOT1MgVU4gZ8OpbmVybyAoT1IpXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBmZXRjaFdpdGhBbnlHZW5yZShcclxuICBlbmRwb2ludDogc3RyaW5nLFxyXG4gIGdlbnJlSWRzOiBudW1iZXJbXSxcclxuICBleGNsdWRlTW92aWVzOiBNb3ZpZVtdLFxyXG4gIGV4Y2x1ZGVTZXQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpXHJcbik6IFByb21pc2U8TW92aWVbXT4ge1xyXG4gIGNvbnN0IGFwaUtleSA9IHByb2Nlc3MuZW52LlRNREJfQVBJX0tFWTtcclxuICBpZiAoIWFwaUtleSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdUTURCX0FQSV9LRVkgbm8gY29uZmlndXJhZGEnKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGV4Y2x1ZGVJZHMgPSBuZXcgU2V0KGV4Y2x1ZGVNb3ZpZXMubWFwKG0gPT4gbS5pZCkpO1xyXG4gIGNvbnN0IGFsbE1vdmllczogTW92aWVbXSA9IFtdO1xyXG4gIGNvbnN0IHNlZW5JZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcclxuXHJcbiAgLy8gSGFjZXIgdW5hIGxsYW1hZGEgcG9yIGNhZGEgZ8OpbmVyb1xyXG4gIGZvciAoY29uc3QgZ2VucmVJZCBvZiBnZW5yZUlkcykge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgdXJsID0gYGh0dHBzOi8vYXBpLnRoZW1vdmllZGIub3JnLzMvZGlzY292ZXIvJHtlbmRwb2ludH0/d2l0aF9nZW5yZXM9JHtnZW5yZUlkfSZhcGlfa2V5PSR7YXBpS2V5fSZsYW5ndWFnZT1lcy1FUyZwYWdlPTEmc29ydF9ieT1wb3B1bGFyaXR5LmRlc2NgO1xyXG5cclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgJ1VzZXItQWdlbnQnOiAnVHJpbml0eS1BcHAvMS4wJyxcclxuICAgICAgICB9LFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBFcnJvciBvYnRlbmllbmRvIGfDqW5lcm8gJHtnZW5yZUlkfTogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGRhdGE6IGFueSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuXHJcbiAgICAgIGlmICghZGF0YS5yZXN1bHRzKSB7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGRhdGEucmVzdWx0cy5mb3JFYWNoKChpdGVtOiBhbnkpID0+IHtcclxuICAgICAgICBjb25zdCBpdGVtSWQgPSBpdGVtLmlkLnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIC8vIEV2aXRhciBkdXBsaWNhZG9zIHkgdMOtdHVsb3MgeWEgaW5jbHVpZG9zIGVuIGV4YWN0TWF0Y2hlcyBvIGV4Y2x1ZGVTZXRcclxuICAgICAgICBpZiAoIXNlZW5JZHMuaGFzKGl0ZW1JZCkgJiYgIWV4Y2x1ZGVJZHMuaGFzKGl0ZW1JZCkgJiYgIWV4Y2x1ZGVTZXQuaGFzKGl0ZW1JZCkpIHtcclxuICAgICAgICAgIHNlZW5JZHMuYWRkKGl0ZW1JZCk7XHJcbiAgICAgICAgICBhbGxNb3ZpZXMucHVzaCh7XHJcbiAgICAgICAgICAgIGlkOiBpdGVtSWQsXHJcbiAgICAgICAgICAgIHRpdGxlOiBpdGVtLnRpdGxlIHx8IGl0ZW0ubmFtZSB8fCAnVMOtdHVsbyBubyBkaXNwb25pYmxlJyxcclxuICAgICAgICAgICAgcG9zdGVyOiBpdGVtLnBvc3Rlcl9wYXRoIHx8IG51bGwsXHJcbiAgICAgICAgICAgIG92ZXJ2aWV3OiBpdGVtLm92ZXJ2aWV3IHx8ICdEZXNjcmlwY2nDs24gbm8gZGlzcG9uaWJsZScsXHJcbiAgICAgICAgICAgIHZvdGVfYXZlcmFnZTogaXRlbS52b3RlX2F2ZXJhZ2UgfHwgMCxcclxuICAgICAgICAgICAgcmVsZWFzZV9kYXRlOiBpdGVtLnJlbGVhc2VfZGF0ZSB8fCBpdGVtLmZpcnN0X2Fpcl9kYXRlIHx8ICcnLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBFcnJvciBjYXJnYW5kbyBnw6luZXJvICR7Z2VucmVJZH06YCwgZXJyb3IpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGFsbE1vdmllcztcclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgY29udGVuaWRvIHBvcHVsYXIgZGVsIG1pc21vIHRpcG8gKGZhbGxiYWNrKVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hQb3B1bGFyQ29udGVudChlbmRwb2ludDogc3RyaW5nLCBsaW1pdDogbnVtYmVyLCBleGNsdWRlU2V0OiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKSk6IFByb21pc2U8TW92aWVbXT4ge1xyXG4gIGNvbnN0IGFwaUtleSA9IHByb2Nlc3MuZW52LlRNREJfQVBJX0tFWTtcclxuICBpZiAoIWFwaUtleSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdUTURCX0FQSV9LRVkgbm8gY29uZmlndXJhZGEnKTtcclxuICB9XHJcblxyXG4gIHRyeSB7XHJcbiAgICBjb25zdCB1cmwgPSBgaHR0cHM6Ly9hcGkudGhlbW92aWVkYi5vcmcvMy8ke2VuZHBvaW50fS9wb3B1bGFyP2FwaV9rZXk9JHthcGlLZXl9Jmxhbmd1YWdlPWVzLUVTJnBhZ2U9MWA7XHJcblxyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcclxuICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgJ1VzZXItQWdlbnQnOiAnVHJpbml0eS1BcHAvMS4wJyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gRXJyb3Igb2J0ZW5pZW5kbyBjb250ZW5pZG8gcG9wdWxhcjogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkYXRhOiBhbnkgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcblxyXG4gICAgaWYgKCFkYXRhLnJlc3VsdHMpIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBkYXRhLnJlc3VsdHNcclxuICAgICAgLmZpbHRlcigoaXRlbTogYW55KSA9PiAhZXhjbHVkZVNldC5oYXMoaXRlbS5pZC50b1N0cmluZygpKSlcclxuICAgICAgLnNsaWNlKDAsIGxpbWl0KVxyXG4gICAgICAubWFwKChpdGVtOiBhbnkpID0+ICh7XHJcbiAgICAgICAgaWQ6IGl0ZW0uaWQudG9TdHJpbmcoKSxcclxuICAgICAgICB0aXRsZTogaXRlbS50aXRsZSB8fCBpdGVtLm5hbWUgfHwgJ1TDrXR1bG8gbm8gZGlzcG9uaWJsZScsXHJcbiAgICAgICAgcG9zdGVyOiBpdGVtLnBvc3Rlcl9wYXRoIHx8IG51bGwsXHJcbiAgICAgICAgb3ZlcnZpZXc6IGl0ZW0ub3ZlcnZpZXcgfHwgJ0Rlc2NyaXBjacOzbiBubyBkaXNwb25pYmxlJyxcclxuICAgICAgICB2b3RlX2F2ZXJhZ2U6IGl0ZW0udm90ZV9hdmVyYWdlIHx8IDAsXHJcbiAgICAgICAgcmVsZWFzZV9kYXRlOiBpdGVtLnJlbGVhc2VfZGF0ZSB8fCBpdGVtLmZpcnN0X2Fpcl9kYXRlIHx8ICcnLFxyXG4gICAgICB9KSk7XHJcblxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBFcnJvciBjYXJnYW5kbyBjb250ZW5pZG8gcG9wdWxhcjonLCBlcnJvcik7XHJcbiAgICByZXR1cm4gW107XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogQWxlYXRvcml6YXIgYXJyYXkgdXNhbmRvIGFsZ29yaXRtbyBGaXNoZXItWWF0ZXNcclxuICovXHJcbmZ1bmN0aW9uIHNodWZmbGVBcnJheTxUPihhcnJheTogVFtdKTogVFtdIHtcclxuICBjb25zdCBzaHVmZmxlZCA9IFsuLi5hcnJheV07XHJcbiAgZm9yIChsZXQgaSA9IHNodWZmbGVkLmxlbmd0aCAtIDE7IGkgPiAwOyBpLS0pIHtcclxuICAgIGNvbnN0IGogPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAoaSArIDEpKTtcclxuICAgIFtzaHVmZmxlZFtpXSwgc2h1ZmZsZWRbal1dID0gW3NodWZmbGVkW2pdLCBzaHVmZmxlZFtpXV07XHJcbiAgfVxyXG4gIHJldHVybiBzaHVmZmxlZDtcclxufVxyXG4iXX0=