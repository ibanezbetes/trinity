/**
 * FallbackEngine - Fallback Recommendation Engine for Trini AI Assistant
 * 
 * This module provides deterministic movie recommendations when AI or external 
 * services fail. It maintains "La Trini" persona consistency and ensures graceful 
 * degradation for all service failures.
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3**
 * 
 * @author Trinity AI Team
 * @version 1.0.0
 */

class FallbackEngine {
    constructor() {
        this.staticMovies = this._initializeStaticMovies();
        this.personaMessages = this._initializePersonaMessages();
    }

    /**
     * Get static movie recommendations when AI services fail
     * Provides a curated list of top 10 classic movies with complete metadata
     * 
     * **Validates: Requirement 5.1** - Deterministic recommendations when AI fails
     * 
     * @returns {MovieCard[]} Array of 10 classic movie recommendations
     */
    getStaticRecommendations() {
        console.log('[FallbackEngine] Providing static movie recommendations');
        return this.staticMovies;
    }

    /**
     * Get offline message with persona-consistent messaging
     * Returns appropriate "La Trini" persona message for different failure scenarios
     * 
     * **Validates: Requirement 5.2** - Maintain "La Trini" persona in error messages
     * 
     * @param {string} errorType - Type of error ('ai_failure', 'tmdb_failure', 'network_error', 'rate_limit')
     * @returns {string} Persona-consistent error message in Spanish
     */
    getOfflineMessage(errorType = 'network_error') {
        console.log(`[FallbackEngine] Generating offline message for error type: ${errorType}`);
        
        const message = this.personaMessages[errorType] || this.personaMessages.network_error;
        return message;
    }

    /**
     * Get intelligent fallback response based on user query analysis
     * Analyzes user query for keywords and provides targeted recommendations
     * 
     * **Validates: Requirement 5.1** - Intelligent fallback when AI fails
     * 
     * @param {string} userQuery - The user's original query
     * @param {string} errorType - Type of error that triggered fallback
     * @returns {Object} Complete LLMResponse with targeted recommendations
     */
    getIntelligentFallbackResponse(userQuery, errorType = 'network_error') {
        console.log(`[FallbackEngine] Generating intelligent fallback for query: "${userQuery}"`);
        
        // Analyze query for genre keywords
        const detectedGenres = this._analyzeQueryForGenres(userQuery);
        const targetedMovies = this._getMoviesByGenres(detectedGenres);
        
        // Generate contextual response
        const contextualMessage = this._generateContextualMessage(userQuery, detectedGenres, errorType);
        
        return {
            intent: 'cinema',
            titles: targetedMovies.map(movie => movie.title),
            reply: contextualMessage,
            movies: targetedMovies,
            fallback: true,
            errorType: errorType,
            detectedGenres: detectedGenres
        };
    }

    /**
     * Analyze user query for genre keywords and preferences
     * @private
     * @param {string} query - User query to analyze
     * @returns {string[]} Array of detected genres
     */
    _analyzeQueryForGenres(query) {
        if (!query) return [];
        
        const queryLower = query.toLowerCase();
        const detectedGenres = [];
        
        // Genre keyword mapping
        const genreKeywords = {
            'comedia': ['comedia', 'cómica', 'divertida', 'graciosa', 'humor', 'reír'],
            'drama': ['drama', 'dramática', 'emocional', 'llorar', 'triste'],
            'acción': ['acción', 'aventura', 'adrenalina', 'peleas', 'explosiones'],
            'romance': ['romance', 'romántica', 'amor', 'pareja', 'cita'],
            'thriller': ['thriller', 'suspense', 'misterio', 'tensión'],
            'terror': ['terror', 'miedo', 'horror', 'susto'],
            'ciencia ficción': ['ciencia ficción', 'sci-fi', 'futuro', 'espacio'],
            'fantasía': ['fantasía', 'magia', 'dragones', 'elfos'],
            'crimen': ['crimen', 'mafia', 'policía', 'detective'],
            'guerra': ['guerra', 'militar', 'batalla', 'soldados'],
            'musical': ['musical', 'música', 'cantando', 'baile'],
            'western': ['western', 'vaqueros', 'oeste'],
            'animación': ['animación', 'animada', 'dibujos'],
            'documental': ['documental', 'real', 'historia verdadera']
        };
        
        // Check for Spanish cinema keywords
        const spanishKeywords = ['española', 'español', 'españa', 'ibérica', 'peninsular'];
        const isSpanishQuery = spanishKeywords.some(keyword => queryLower.includes(keyword));
        
        // Detect genres based on keywords
        for (const [genre, keywords] of Object.entries(genreKeywords)) {
            if (keywords.some(keyword => queryLower.includes(keyword))) {
                detectedGenres.push(genre);
            }
        }
        
        // Add Spanish preference if detected
        if (isSpanishQuery) {
            detectedGenres.push('española');
        }
        
        return detectedGenres;
    }

    /**
     * Get movies filtered by detected genres
     * @private
     * @param {string[]} genres - Detected genres from query
     * @returns {Object[]} Array of movies matching the genres
     */
    _getMoviesByGenres(genres) {
        if (genres.length === 0) {
            return this.staticMovies.slice(0, 5); // Return top 5 classics
        }
        
        // Enhanced movie database with more variety
        const enhancedMovies = [
            ...this.staticMovies,
            // Spanish Cinema
            {
                title: 'Todo sobre mi madre',
                posterUrl: 'https://image.tmdb.org/t/p/w500/4q3q3q3q3q3q3q3q3q3q3q3q3q3q.jpg',
                synopsis: 'Una madre busca al padre de su hijo fallecido en esta obra maestra de Almodóvar.',
                releaseYear: '1999',
                tmdbId: 1267,
                genres: ['Drama', 'española'],
                rating: 8.1
            },
            {
                title: 'El laberinto del fauno',
                posterUrl: 'https://image.tmdb.org/t/p/w500/5q5q5q5q5q5q5q5q5q5q5q5q5q5q.jpg',
                synopsis: 'Una niña escapa a un mundo fantástico durante la Guerra Civil Española.',
                releaseYear: '2006',
                tmdbId: 1422,
                genres: ['Fantasy', 'Drama', 'española'],
                rating: 8.2
            },
            {
                title: 'Ocho apellidos vascos',
                posterUrl: 'https://image.tmdb.org/t/p/w500/6q6q6q6q6q6q6q6q6q6q6q6q6q6q.jpg',
                synopsis: 'Comedia romántica sobre las diferencias culturales entre Andalucía y el País Vasco.',
                releaseYear: '2014',
                tmdbId: 259016,
                genres: ['Comedy', 'Romance', 'española'],
                rating: 6.5
            },
            // Comedy
            {
                title: 'Algunos hombres buenos',
                posterUrl: 'https://image.tmdb.org/t/p/w500/7q7q7q7q7q7q7q7q7q7q7q7q7q7q.jpg',
                synopsis: 'Drama legal con toques de humor sobre un juicio militar.',
                releaseYear: '1992',
                tmdbId: 329,
                genres: ['Drama', 'Thriller'],
                rating: 7.7
            },
            {
                title: 'La vida es bella',
                posterUrl: 'https://image.tmdb.org/t/p/w500/8q8q8q8q8q8q8q8q8q8q8q8q8q8q.jpg',
                synopsis: 'Un padre usa su imaginación para proteger a su hijo en un campo de concentración.',
                releaseYear: '1997',
                tmdbId: 637,
                genres: ['Comedy', 'Drama', 'Romance'],
                rating: 8.6
            }
        ];
        
        // Filter movies by genres
        const matchingMovies = enhancedMovies.filter(movie => {
            return genres.some(genre => 
                movie.genres.some(movieGenre => 
                    movieGenre.toLowerCase().includes(genre.toLowerCase()) ||
                    genre.toLowerCase().includes(movieGenre.toLowerCase())
                )
            );
        });
        
        // If we have matches, return them, otherwise return classics
        if (matchingMovies.length > 0) {
            return matchingMovies.slice(0, 8); // Return up to 8 matching movies
        }
        
        return this.staticMovies.slice(0, 5);
    }

    /**
     * Generate contextual message based on query analysis
     * @private
     * @param {string} query - Original user query
     * @param {string[]} genres - Detected genres
     * @param {string} errorType - Error type
     * @returns {string} Contextual response message
     */
    _generateContextualMessage(query, genres, errorType) {
        const baseMessage = this.getOfflineMessage(errorType);
        
        if (genres.length === 0) {
            return baseMessage + ' Te doy mis clásicos de siempre que nunca fallan.';
        }
        
        let contextualPart = '';
        
        if (genres.includes('española')) {
            contextualPart = ' Veo que buscas cine español, ¡qué buen gusto! Aquí tienes algunas joyas de nuestra cinematografía.';
        } else if (genres.includes('comedia')) {
            contextualPart = ' ¿Ganas de reír? Perfecto, aquí tienes comedias que te van a alegrar el día.';
        } else if (genres.includes('drama')) {
            contextualPart = ' Veo que quieres algo emotivo. Estas películas te van a llegar al corazón.';
        } else if (genres.includes('acción')) {
            contextualPart = ' ¿Buscas adrenalina? Estas películas te van a tener al borde del asiento.';
        } else if (genres.includes('romance')) {
            contextualPart = ' ¿Una noche romántica? Estas películas son perfectas para enamorarse.';
        } else {
            contextualPart = ` Veo que buscas ${genres.join(' y ')}, aquí tienes algunas opciones geniales.`;
        }
        
        return baseMessage + contextualPart;
    }

    /**
     * Check if fallback should be activated based on error conditions
     * Determines when to use fallback vs retry strategies
     * 
     * @param {Error} error - The error that occurred
     * @returns {boolean} True if fallback should be activated
     */
    shouldActivateFallback(error) {
        if (!error) return false;

        // Network errors - activate fallback
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return true;
        }

        // Rate limiting - activate fallback after multiple attempts
        if (error.response && error.response.status === 429) {
            return true;
        }

        // Service unavailable
        if (error.response && error.response.status >= 500) {
            return true;
        }

        // API deprecated or gone (410) - activate fallback
        if (error.response && error.response.status === 410) {
            return true;
        }

        // API errors (4xx) - activate fallback for most client errors
        if (error.response && error.response.status >= 400) {
            return true;
        }

        // Timeout errors
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            return true;
        }

        // API error messages - activate fallback
        if (error.message && (
            error.message.includes('API_ERROR') ||
            error.message.includes('API_TIMEOUT') ||
            error.message.includes('NETWORK_ERROR') ||
            error.message.includes('API_RATE_LIMIT')
        )) {
            return true;
        }

        return false;
    }

    /**
     * Initialize static movie recommendations
     * Curated list of 10 classic movies with complete metadata
     * 
     * @private
     * @returns {MovieCard[]} Array of static movie recommendations
     */
    _initializeStaticMovies() {
        return [
            {
                title: 'El Padrino',
                posterUrl: 'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
                synopsis: 'La historia épica de una familia de la mafia italiana en Nueva York, dirigida por Don Vito Corleone.',
                releaseYear: '1972',
                tmdbId: 238,
                genres: ['Drama', 'Crime'],
                rating: 9.2
            },
            {
                title: 'Pulp Fiction',
                posterUrl: 'https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
                synopsis: 'Historias entrelazadas de crimen y redención en Los Ángeles, contadas de forma no lineal.',
                releaseYear: '1994',
                tmdbId: 680,
                genres: ['Crime', 'Drama'],
                rating: 8.9
            },
            {
                title: 'El Señor de los Anillos: La Comunidad del Anillo',
                posterUrl: 'https://image.tmdb.org/t/p/w500/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg',
                synopsis: 'Un hobbit emprende una épica aventura para destruir un anillo mágico y salvar la Tierra Media.',
                releaseYear: '2001',
                tmdbId: 120,
                genres: ['Adventure', 'Fantasy', 'Drama'],
                rating: 8.8
            },
            {
                title: 'Casablanca',
                posterUrl: 'https://image.tmdb.org/t/p/w500/5K7cOHoay2mZusSLezBOY0Qxh8a.jpg',
                synopsis: 'Un romance clásico ambientado durante la Segunda Guerra Mundial en el Marruecos francés.',
                releaseYear: '1942',
                tmdbId: 289,
                genres: ['Drama', 'Romance'],
                rating: 8.5
            },
            {
                title: 'Ciudadano Kane',
                posterUrl: 'https://image.tmdb.org/t/p/w500/sav0jxhqiH0bPr2vZFU0Kjt2nZL.jpg',
                synopsis: 'La vida y muerte de un magnate de los medios, contada a través de flashbacks.',
                releaseYear: '1941',
                tmdbId: 15,
                genres: ['Drama', 'Mystery'],
                rating: 8.3
            },
            {
                title: 'Schindler\'s List',
                posterUrl: 'https://image.tmdb.org/t/p/w500/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg',
                synopsis: 'La historia real de Oskar Schindler, quien salvó más de mil judíos durante el Holocausto.',
                releaseYear: '1993',
                tmdbId: 424,
                genres: ['Drama', 'History'],
                rating: 9.0
            },
            {
                title: 'Vertigo',
                posterUrl: 'https://image.tmdb.org/t/p/w500/15uOEfqBNTVtDUT7hGBVzka0RCB.jpg',
                synopsis: 'Un detective retirado con acrofobia se obsesiona con una mujer misteriosa.',
                releaseYear: '1958',
                tmdbId: 110,
                genres: ['Mystery', 'Romance', 'Thriller'],
                rating: 8.3
            },
            {
                title: 'Cantando bajo la lluvia',
                posterUrl: 'https://image.tmdb.org/t/p/w500/w03EiJVHP8Un77boQeE7hg9DVdU.jpg',
                synopsis: 'Un musical clásico sobre la transición del cine mudo al sonoro en Hollywood.',
                releaseYear: '1952',
                tmdbId: 872,
                genres: ['Comedy', 'Music', 'Romance'],
                rating: 8.3
            },
            {
                title: 'La Dolce Vita',
                posterUrl: 'https://image.tmdb.org/t/p/w500/3dYgM3dktTlCkuy6HjzjdnDGGWG.jpg',
                synopsis: 'Un periodista busca amor y felicidad en la Roma de los años 60.',
                releaseYear: '1960',
                tmdbId: 783,
                genres: ['Comedy', 'Drama'],
                rating: 8.1
            },
            {
                title: '8½',
                posterUrl: 'https://image.tmdb.org/t/p/w500/aq31K5jAZaXIgOOUOsEYNpZNgoz.jpg',
                synopsis: 'Un director de cine en crisis creativa reflexiona sobre su vida y arte.',
                releaseYear: '1963',
                tmdbId: 81,
                genres: ['Drama'],
                rating: 8.0
            }
        ];
    }

    /**
     * Initialize persona-consistent error messages
     * Messages maintain "La Trini" character voice and personality
     * 
     * @private
     * @returns {Object} Map of error types to persona messages
     */
    _initializePersonaMessages() {
        return {
            ai_failure: 'Ay cariño, mi cerebrito cinematográfico está un poco lento hoy. Pero no te preocupes, aquí tienes mis clásicos favoritos de siempre.',
            
            tmdb_failure: 'Mi amor, parece que mi conexión con la base de datos de películas está fallando. Pero tranquilo, te doy mis recomendaciones de oro.',
            
            network_error: 'Uy cariño, mi conexión neuronal va lenta hoy. ¿Me lo puedes repetir en un ratito? Mientras tanto, aquí tienes mis joyas del cine.',
            
            rate_limit: 'Ay mi vida, estoy un poquito saturada ahora mismo. Dame un respiro y mientras tanto disfruta estos clásicos que nunca fallan.',
            
            timeout: 'Perdón mi amor, me quedé pensando demasiado tiempo. Aquí tienes mis recomendaciones express para que no esperes más.',
            
            general_error: 'Cariño, algo raro pasó por aquí, pero no te preocupes. Siempre tengo mis películas de cabecera para salvarte el día.'
        };
    }

    /**
     * Get statistics about fallback usage
     * Useful for monitoring and debugging
     * 
     * @returns {Object} Statistics about fallback activations
     */
    getStats() {
        return {
            staticMoviesCount: this.staticMovies.length,
            personaMessagesCount: Object.keys(this.personaMessages).length,
            version: '1.0.0'
        };
    }
}

module.exports = FallbackEngine;