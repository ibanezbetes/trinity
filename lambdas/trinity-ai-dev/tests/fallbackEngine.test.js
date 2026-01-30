/**
 * FallbackEngine Tests
 * 
 * Tests for the fallback recommendation engine that provides deterministic
 * movie recommendations when AI or external services fail.
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */

const FallbackEngine = require('../services/fallbackEngine');

describe('FallbackEngine', () => {
    let fallbackEngine;

    beforeEach(() => {
        fallbackEngine = new FallbackEngine();
    });

    describe('Constructor and Initialization', () => {
        test('should initialize with static movies and persona messages', () => {
            expect(fallbackEngine.staticMovies).toBeDefined();
            expect(fallbackEngine.personaMessages).toBeDefined();
            expect(Array.isArray(fallbackEngine.staticMovies)).toBe(true);
            expect(typeof fallbackEngine.personaMessages).toBe('object');
        });

        test('should have exactly 10 static movies', () => {
            expect(fallbackEngine.staticMovies).toHaveLength(10);
        });

        test('should have all required persona message types', () => {
            const requiredTypes = [
                'ai_failure', 'tmdb_failure', 'network_error', 
                'rate_limit', 'timeout', 'general_error'
            ];
            
            requiredTypes.forEach(type => {
                expect(fallbackEngine.personaMessages[type]).toBeDefined();
                expect(typeof fallbackEngine.personaMessages[type]).toBe('string');
            });
        });
    });

    describe('getStaticRecommendations', () => {
        /**
         * **Validates: Requirement 5.1** - Deterministic recommendations when AI fails
         */
        test('should return deterministic movie recommendations', () => {
            const recommendations = fallbackEngine.getStaticRecommendations();
            
            expect(Array.isArray(recommendations)).toBe(true);
            expect(recommendations).toHaveLength(10);
            
            // Verify each movie has required properties
            recommendations.forEach(movie => {
                expect(movie).toHaveProperty('title');
                expect(movie).toHaveProperty('posterUrl');
                expect(movie).toHaveProperty('synopsis');
                expect(movie).toHaveProperty('releaseYear');
                expect(movie).toHaveProperty('tmdbId');
                expect(movie).toHaveProperty('genres');
                expect(movie).toHaveProperty('rating');
                
                expect(typeof movie.title).toBe('string');
                expect(typeof movie.synopsis).toBe('string');
                expect(typeof movie.releaseYear).toBe('string');
                expect(typeof movie.tmdbId).toBe('number');
                expect(Array.isArray(movie.genres)).toBe(true);
                expect(typeof movie.rating).toBe('number');
            });
        });

        test('should return consistent results across multiple calls', () => {
            const first = fallbackEngine.getStaticRecommendations();
            const second = fallbackEngine.getStaticRecommendations();
            
            expect(first).toEqual(second);
        });

        test('should include classic movies with proper metadata', () => {
            const recommendations = fallbackEngine.getStaticRecommendations();
            
            // Check for some expected classics
            const titles = recommendations.map(movie => movie.title);
            expect(titles).toContain('El Padrino');
            expect(titles).toContain('Pulp Fiction');
            expect(titles).toContain('Casablanca');
            
            // Verify ratings are reasonable (8.0 or above for classics)
            recommendations.forEach(movie => {
                expect(movie.rating).toBeGreaterThanOrEqual(8.0);
            });
        });
    });

    describe('getOfflineMessage', () => {
        /**
         * **Validates: Requirement 5.2** - Maintain "La Trini" persona in error messages
         */
        test('should return persona-consistent messages for different error types', () => {
            const errorTypes = [
                'ai_failure', 'tmdb_failure', 'network_error', 
                'rate_limit', 'timeout', 'general_error'
            ];
            
            errorTypes.forEach(errorType => {
                const message = fallbackEngine.getOfflineMessage(errorType);
                
                expect(typeof message).toBe('string');
                expect(message.length).toBeGreaterThan(0);
                
                // Should contain "La Trini" persona elements (Spanish terms of endearment)
                const personaTerms = ['cariño', 'mi amor', 'mi vida', 'amor'];
                const hasPersonaTerm = personaTerms.some(term => 
                    message.toLowerCase().includes(term)
                );
                expect(hasPersonaTerm).toBe(true);
            });
        });

        test('should default to network_error message for unknown error types', () => {
            const unknownMessage = fallbackEngine.getOfflineMessage('unknown_error');
            const networkMessage = fallbackEngine.getOfflineMessage('network_error');
            
            expect(unknownMessage).toBe(networkMessage);
        });

        test('should return different messages for different error types', () => {
            const aiMessage = fallbackEngine.getOfflineMessage('ai_failure');
            const tmdbMessage = fallbackEngine.getOfflineMessage('tmdb_failure');
            const networkMessage = fallbackEngine.getOfflineMessage('network_error');
            
            expect(aiMessage).not.toBe(tmdbMessage);
            expect(tmdbMessage).not.toBe(networkMessage);
            expect(networkMessage).not.toBe(aiMessage);
        });
    });

    describe('getFallbackResponse', () => {
        /**
         * **Validates: Requirement 5.3** - Graceful degradation for all service failures
         */
        test('should return complete LLMResponse object', () => {
            const response = fallbackEngine.getFallbackResponse('network_error');
            
            expect(response).toHaveProperty('intent');
            expect(response).toHaveProperty('titles');
            expect(response).toHaveProperty('reply');
            expect(response).toHaveProperty('movies');
            expect(response).toHaveProperty('fallback');
            expect(response).toHaveProperty('errorType');
            
            expect(response.intent).toBe('cinema');
            expect(Array.isArray(response.titles)).toBe(true);
            expect(typeof response.reply).toBe('string');
            expect(Array.isArray(response.movies)).toBe(true);
            expect(response.fallback).toBe(true);
            expect(response.errorType).toBe('network_error');
        });

        test('should include movie titles matching static recommendations', () => {
            const response = fallbackEngine.getFallbackResponse();
            const staticMovies = fallbackEngine.getStaticRecommendations();
            
            expect(response.titles).toHaveLength(staticMovies.length);
            expect(response.movies).toHaveLength(staticMovies.length);
            
            staticMovies.forEach((movie, index) => {
                expect(response.titles[index]).toBe(movie.title);
                expect(response.movies[index]).toEqual(movie);
            });
        });

        test('should use appropriate persona message for error type', () => {
            const response = fallbackEngine.getFallbackResponse('rate_limit');
            const directMessage = fallbackEngine.getOfflineMessage('rate_limit');
            
            expect(response.reply).toBe(directMessage);
        });
    });

    describe('shouldActivateFallback', () => {
        test('should activate fallback for network errors', () => {
            const networkError = new Error('Network error');
            networkError.code = 'ENOTFOUND';
            
            expect(fallbackEngine.shouldActivateFallback(networkError)).toBe(true);
            
            const connectionError = new Error('Connection refused');
            connectionError.code = 'ECONNREFUSED';
            
            expect(fallbackEngine.shouldActivateFallback(connectionError)).toBe(true);
        });

        test('should activate fallback for rate limiting', () => {
            const rateLimitError = new Error('Rate limited');
            rateLimitError.response = { status: 429 };
            
            expect(fallbackEngine.shouldActivateFallback(rateLimitError)).toBe(true);
        });

        test('should activate fallback for server errors', () => {
            const serverError = new Error('Internal server error');
            serverError.response = { status: 500 };
            
            expect(fallbackEngine.shouldActivateFallback(serverError)).toBe(true);
            
            const badGatewayError = new Error('Bad gateway');
            badGatewayError.response = { status: 502 };
            
            expect(fallbackEngine.shouldActivateFallback(badGatewayError)).toBe(true);
        });

        test('should activate fallback for timeout errors', () => {
            const timeoutError = new Error('Request timeout');
            timeoutError.code = 'ECONNABORTED';
            
            expect(fallbackEngine.shouldActivateFallback(timeoutError)).toBe(true);
            
            const timeoutMessageError = new Error('Request timeout occurred');
            expect(fallbackEngine.shouldActivateFallback(timeoutMessageError)).toBe(true);
        });

        test('should not activate fallback for client errors', () => {
            const clientError = new Error('Bad request');
            clientError.response = { status: 400 };
            
            expect(fallbackEngine.shouldActivateFallback(clientError)).toBe(false);
            
            const unauthorizedError = new Error('Unauthorized');
            unauthorizedError.response = { status: 401 };
            
            expect(fallbackEngine.shouldActivateFallback(unauthorizedError)).toBe(false);
        });

        test('should not activate fallback for null or undefined errors', () => {
            expect(fallbackEngine.shouldActivateFallback(null)).toBe(false);
            expect(fallbackEngine.shouldActivateFallback(undefined)).toBe(false);
        });
    });

    describe('getStats', () => {
        test('should return statistics about fallback configuration', () => {
            const stats = fallbackEngine.getStats();
            
            expect(stats).toHaveProperty('staticMoviesCount');
            expect(stats).toHaveProperty('personaMessagesCount');
            expect(stats).toHaveProperty('version');
            
            expect(stats.staticMoviesCount).toBe(10);
            expect(stats.personaMessagesCount).toBeGreaterThan(0);
            expect(typeof stats.version).toBe('string');
        });
    });

    describe('Persona Message Quality', () => {
        test('should have Spanish language persona messages', () => {
            const messages = Object.values(fallbackEngine.personaMessages);
            
            messages.forEach(message => {
                // Should contain Spanish words or phrases
                const spanishTerms = [
                    'cariño', 'mi amor', 'mi vida', 'amor', 'ay', 'uy',
                    'perdón', 'tranquilo', 'ratito', 'poquito'
                ];
                
                const hasSpanishTerm = spanishTerms.some(term => 
                    message.toLowerCase().includes(term)
                );
                expect(hasSpanishTerm).toBe(true);
            });
        });

        test('should have appropriate length messages', () => {
            const messages = Object.values(fallbackEngine.personaMessages);
            
            messages.forEach(message => {
                expect(message.length).toBeGreaterThan(20); // Not too short
                expect(message.length).toBeLessThan(200);   // Not too long
            });
        });
    });

    describe('Movie Data Quality', () => {
        test('should have valid TMDB IDs for all static movies', () => {
            const movies = fallbackEngine.getStaticRecommendations();
            
            movies.forEach(movie => {
                expect(movie.tmdbId).toBeGreaterThan(0);
                expect(Number.isInteger(movie.tmdbId)).toBe(true);
            });
        });

        test('should have proper poster URLs for all static movies', () => {
            const movies = fallbackEngine.getStaticRecommendations();
            
            movies.forEach(movie => {
                if (movie.posterUrl) {
                    expect(movie.posterUrl).toMatch(/^https:\/\/image\.tmdb\.org/);
                }
            });
        });

        test('should have meaningful synopses', () => {
            const movies = fallbackEngine.getStaticRecommendations();
            
            movies.forEach(movie => {
                expect(movie.synopsis.length).toBeGreaterThan(30);
                expect(movie.synopsis).not.toBe('');
            });
        });

        test('should have valid release years', () => {
            const movies = fallbackEngine.getStaticRecommendations();
            
            movies.forEach(movie => {
                const year = parseInt(movie.releaseYear);
                expect(year).toBeGreaterThan(1900);
                expect(year).toBeLessThan(2030);
            });
        });
    });
});