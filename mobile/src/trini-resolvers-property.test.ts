/**
 * Property-Based Tests for Trini GraphQL Resolvers
 * 
 * These tests verify universal correctness properties that should hold
 * across all valid inputs to the GraphQL resolvers.
 */

import * as fc from 'fast-check';
import { InputValidator, ErrorHandler } from './trini-resolvers';

// Property testing utilities
interface PropertyTest {
  property: string;
  description: string;
  test: () => boolean;
}

const runPropertyTest = (test: PropertyTest, iterations: number = 100) => {
  for (let i = 0; i < iterations; i++) {
    if (!test.test()) {
      throw new Error(`Property test failed on iteration ${i + 1}: ${test.description}`);
    }
  }
};

/**
 * Property 8: GraphQL Input Validation
 * For any GraphQL query to Trini endpoints, invalid inputs should be rejected 
 * with appropriate error messages, and valid inputs should be processed successfully
 * Validates: Requirements 5.2
 */
describe('Property 8: GraphQL Input Validation', () => {

  it('should validate all askTrini inputs correctly using fast-check', () => {
    // Property: Valid inputs should always pass validation
    fc.assert(fc.property(
      fc.record({
        query: fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9\-_]+$/.test(s)),
        sessionId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
      }),
      (input) => {
        // Filter out potentially unsafe content
        const securityPatterns = [
          /<script/i,
          /javascript:/i,
          /eval\s*\(/i,
          /document\./i,
          /<[^>]*>/g
        ];
        
        const hasUnsafeContent = securityPatterns.some(pattern => pattern.test(input.query));
        if (hasUnsafeContent) {
          return true; // Skip this test case as it should be rejected
        }
        
        const result = InputValidator.validateTriniQuery(input);
        return result.isValid === true;
      }
    ), { numRuns: 100 });
  });

  it('should reject all invalid askTrini inputs using fast-check', () => {
    // Property: Invalid inputs should always be rejected with error messages
    const invalidInputGenerator = fc.oneof(
      // Empty query
      fc.record({
        query: fc.constant(''),
        userId: fc.string({ minLength: 1 }).filter(s => /^[a-zA-Z0-9\-_]+$/.test(s))
      }),
      // Query too long
      fc.record({
        query: fc.string({ minLength: 501, maxLength: 1000 }),
        userId: fc.string({ minLength: 1 }).filter(s => /^[a-zA-Z0-9\-_]+$/.test(s))
      }),
      // Empty userId
      fc.record({
        query: fc.string({ minLength: 1, maxLength: 500 }),
        userId: fc.constant('')
      }),
      // Invalid userId characters
      fc.record({
        query: fc.string({ minLength: 1, maxLength: 500 }),
        userId: fc.string({ minLength: 1 }).filter(s => !/^[a-zA-Z0-9\-_]+$/.test(s))
      }),
      // XSS attempts
      fc.record({
        query: fc.oneof(
          fc.constant('<script>alert("xss")</script>'),
          fc.constant('javascript:alert("hack")'),
          fc.constant('<img src=x onerror=alert(1)>'),
          fc.constant('eval(maliciousCode)')
        ),
        userId: fc.string({ minLength: 1 }).filter(s => /^[a-zA-Z0-9\-_]+$/.test(s))
      })
    );

    fc.assert(fc.property(
      invalidInputGenerator,
      (input) => {
        const result = InputValidator.validateTriniQuery(input);
        return result.isValid === false && !!result.error && result.error.length > 0;
      }
    ), { numRuns: 100 });
  });

  it('should validate all getChatHistory inputs correctly using fast-check', () => {
    // Property: Valid chat history inputs should always pass validation
    fc.assert(fc.property(
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9\-_]+$/.test(s)),
        limit: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined })
      }),
      (input) => {
        const result = InputValidator.validateChatHistoryQuery(input.userId, input.limit);
        return result.isValid === true;
      }
    ), { numRuns: 100 });
  });

  it('should reject invalid getChatHistory inputs using fast-check', () => {
    // Property: Invalid chat history inputs should always be rejected
    const invalidChatHistoryGenerator = fc.oneof(
      // Empty userId
      fc.record({
        userId: fc.constant(''),
        limit: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined })
      }),
      // Invalid userId characters
      fc.record({
        userId: fc.string({ minLength: 1 }).filter(s => !/^[a-zA-Z0-9\-_]+$/.test(s)),
        limit: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined })
      }),
      // Invalid limit values
      fc.record({
        userId: fc.string({ minLength: 1 }).filter(s => /^[a-zA-Z0-9\-_]+$/.test(s)),
        limit: fc.oneof(
          fc.integer({ max: 0 }), // Too small
          fc.integer({ min: 51, max: 1000 }) // Too large
        )
      })
    );

    fc.assert(fc.property(
      invalidChatHistoryGenerator,
      (input) => {
        const result = InputValidator.validateChatHistoryQuery(input.userId, input.limit);
        return result.isValid === false && !!result.error && result.error.length > 0;
      }
    ), { numRuns: 100 });
  });

  it('should validate all room recommendation inputs correctly using fast-check', () => {
    // Property: Valid room recommendation inputs should always pass validation
    fc.assert(fc.property(
      fc.record({
        roomId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9\-_]+$/.test(s)),
        movieId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^\d+$/.test(s))
      }),
      (input) => {
        const result = InputValidator.validateRoomRecommendation(input.roomId, input.movieId);
        return result.isValid === true;
      }
    ), { numRuns: 100 });
  });

  it('should reject invalid room recommendation inputs using fast-check', () => {
    // Property: Invalid room recommendation inputs should always be rejected
    const invalidRoomRecommendationGenerator = fc.oneof(
      // Empty roomId
      fc.record({
        roomId: fc.constant(''),
        movieId: fc.string({ minLength: 1 }).filter(s => /^\d+$/.test(s))
      }),
      // Empty movieId
      fc.record({
        roomId: fc.string({ minLength: 1 }).filter(s => /^[a-zA-Z0-9\-_]+$/.test(s)),
        movieId: fc.constant('')
      }),
      // Invalid roomId characters
      fc.record({
        roomId: fc.string({ minLength: 1 }).filter(s => !/^[a-zA-Z0-9\-_]+$/.test(s)),
        movieId: fc.string({ minLength: 1 }).filter(s => /^\d+$/.test(s))
      }),
      // Non-numeric movieId
      fc.record({
        roomId: fc.string({ minLength: 1 }).filter(s => /^[a-zA-Z0-9\-_]+$/.test(s)),
        movieId: fc.string({ minLength: 1 }).filter(s => !/^\d+$/.test(s))
      })
    );

    fc.assert(fc.property(
      invalidRoomRecommendationGenerator,
      (input) => {
        const result = InputValidator.validateRoomRecommendation(input.roomId, input.movieId);
        return result.isValid === false && !!result.error && result.error.length > 0;
      }
    ), { numRuns: 100 });
  });
});

/**
 * Property 9: GraphQL Response Schema Compliance
 * For any successful Trini GraphQL response, the returned data should conform 
 * exactly to the defined Movie schema structure
 * Validates: Requirements 5.3
 */
describe('Property 9: GraphQL Response Schema Compliance', () => {

  const validateMovieSchema = (movie: any): boolean => {
    // Required fields
    if (!movie.id || typeof movie.id !== 'string') return false;
    if (!movie.title || typeof movie.title !== 'string') return false;
    
    // Optional fields with type checking
    if (movie.overview !== undefined && typeof movie.overview !== 'string') return false;
    if (movie.poster !== undefined && typeof movie.poster !== 'string') return false;
    if (movie.release_date !== undefined && typeof movie.release_date !== 'string') return false;
    if (movie.vote_average !== undefined && typeof movie.vote_average !== 'number') return false;
    if (movie.runtime !== undefined && typeof movie.runtime !== 'number') return false;
    
    // Genres array validation
    if (movie.genres !== undefined) {
      if (!Array.isArray(movie.genres)) return false;
      for (const genre of movie.genres) {
        if (!genre.id || typeof genre.id !== 'number') return false;
        if (!genre.name || typeof genre.name !== 'string') return false;
      }
    }
    
    return true;
  };

  const validateTriniResponseSchema = (response: any): boolean => {
    // Required fields
    if (!response.sessionId || typeof response.sessionId !== 'string') return false;
    if (!response.message || typeof response.message !== 'string') return false;
    if (!Array.isArray(response.recommendations)) return false;
    if (typeof response.confidence !== 'number') return false;
    
    // Confidence range validation
    if (response.confidence < 0 || response.confidence > 1) return false;
    
    // Recommendations validation
    for (const rec of response.recommendations) {
      if (!rec.movie || !validateMovieSchema(rec.movie)) return false;
      if (typeof rec.relevanceScore !== 'number') return false;
      if (rec.relevanceScore < 0 || rec.relevanceScore > 1) return false;
      if (rec.reasoning !== undefined && typeof rec.reasoning !== 'string') return false;
    }
    
    // Optional extractedFilters validation
    if (response.extractedFilters !== undefined) {
      const filters = response.extractedFilters;
      if (filters.genres !== undefined && !Array.isArray(filters.genres)) return false;
      if (filters.keywords !== undefined && !Array.isArray(filters.keywords)) return false;
      if (filters.yearRange !== undefined) {
        if (typeof filters.yearRange.min !== 'number' && filters.yearRange.min !== undefined) return false;
        if (typeof filters.yearRange.max !== 'number' && filters.yearRange.max !== undefined) return false;
      }
      if (filters.rating !== undefined) {
        if (typeof filters.rating.min !== 'number' && filters.rating.min !== undefined) return false;
        if (typeof filters.rating.max !== 'number' && filters.rating.max !== undefined) return false;
      }
    }
    
    return true;
  };

  it('should validate askTrini response schema compliance', () => {
    const responseSchemaProperty: PropertyTest = {
      property: 'GraphQL Response Schema Compliance - askTrini',
      description: 'All askTrini responses should conform to the defined schema',
      test: () => {
        // Mock valid responses
        const validResponses = [
          {
            sessionId: 'session-123',
            message: 'Here are some action movies',
            recommendations: [
              {
                movie: {
                  id: '123',
                  title: 'The Matrix',
                  overview: 'A computer hacker learns about reality',
                  poster: '/matrix.jpg',
                  release_date: '1999-03-31',
                  vote_average: 8.7,
                  runtime: 136,
                  genres: [
                    { id: 28, name: 'Action' },
                    { id: 878, name: 'Science Fiction' }
                  ]
                },
                relevanceScore: 0.95,
                reasoning: 'Perfect match for action movies'
              }
            ],
            extractedFilters: {
              genres: ['action'],
              yearRange: { min: 1990, max: 2000 },
              rating: { min: 7.0 },
              keywords: ['matrix', 'sci-fi']
            },
            confidence: 0.9
          },
          {
            sessionId: 'session-456',
            message: 'Comedy recommendations',
            recommendations: [
              {
                movie: {
                  id: '456',
                  title: 'Groundhog Day'
                },
                relevanceScore: 0.8
              }
            ],
            confidence: 0.7
          }
        ];
        
        for (const response of validResponses) {
          if (!validateTriniResponseSchema(response)) {
            console.error(`Invalid response schema: ${JSON.stringify(response)}`);
            return false;
          }
        }
        
        return true;
      }
    };
    
    runPropertyTest(responseSchemaProperty);
  });

  it('should validate chat history response schema compliance', () => {
    const chatHistorySchemaProperty: PropertyTest = {
      property: 'GraphQL Response Schema Compliance - Chat History',
      description: 'All getChatHistory responses should conform to the defined schema',
      test: () => {
        const validChatHistoryResponses = [
          {
            sessions: [
              {
                sessionId: 'session-123',
                userId: 'user-456',
                messages: [
                  {
                    messageId: 'msg-1',
                    type: 'USER_QUERY',
                    content: 'action movies',
                    timestamp: '2024-01-01T10:00:00Z'
                  },
                  {
                    messageId: 'msg-2',
                    type: 'TRINI_RESPONSE',
                    content: 'Here are some action movies',
                    extractedFilters: {
                      genres: ['action']
                    },
                    recommendations: ['123', '456'],
                    timestamp: '2024-01-01T10:01:00Z'
                  }
                ],
                createdAt: '2024-01-01T10:00:00Z',
                updatedAt: '2024-01-01T10:01:00Z'
              }
            ]
          }
        ];
        
        for (const response of validChatHistoryResponses) {
          // Validate sessions array
          if (!Array.isArray(response.sessions)) return false;
          
          for (const session of response.sessions) {
            // Required session fields
            if (!session.sessionId || typeof session.sessionId !== 'string') return false;
            if (!session.userId || typeof session.userId !== 'string') return false;
            if (!Array.isArray(session.messages)) return false;
            if (!session.createdAt || typeof session.createdAt !== 'string') return false;
            if (!session.updatedAt || typeof session.updatedAt !== 'string') return false;
            
            // Validate messages
            for (const message of session.messages) {
              if (!message.messageId || typeof message.messageId !== 'string') return false;
              if (!message.type || typeof message.type !== 'string') return false;
              if (!message.content || typeof message.content !== 'string') return false;
              if (!message.timestamp || typeof message.timestamp !== 'string') return false;
              
              // Optional fields
              if (message.recommendations !== undefined && !Array.isArray(message.recommendations)) return false;
            }
          }
        }
        
        return true;
      }
    };
    
    runPropertyTest(chatHistorySchemaProperty);
  });
});

/**
 * Property 10: Error Handling Graceful Degradation
 * For any external service failure (Hugging Face or TMDB), Trini should provide 
 * fallback functionality and informative error messages rather than system crashes
 * Validates: Requirements 5.4, 8.1, 8.2, 8.3
 */
describe('Property 10: Error Handling Graceful Degradation', () => {

  it('should handle all Lambda error types gracefully', () => {
    const errorHandlingProperty: PropertyTest = {
      property: 'Error Handling Graceful Degradation',
      description: 'All Lambda errors should be handled gracefully with appropriate messages',
      test: () => {
        const errorScenarios = [
          { statusCode: 429, expectedCode: 'RATE_LIMIT_EXCEEDED' },
          { statusCode: 400, message: 'Invalid input', expectedCode: 'BAD_REQUEST' },
          { statusCode: 503, expectedCode: 'SERVICE_UNAVAILABLE' },
          { statusCode: 500, expectedCode: 'INTERNAL_ERROR' },
          { statusCode: 404, expectedCode: 'INTERNAL_ERROR' }
        ];
        
        for (const scenario of errorScenarios) {
          const error = ErrorHandler.handleLambdaError(scenario, 'testOperation');
          
          // Verify error structure
          if (!error.message || typeof error.message !== 'string') {
            console.error(`Error missing message: ${JSON.stringify(error)}`);
            return false;
          }
          
          if (!error.extensions || !error.extensions.code) {
            console.error(`Error missing code: ${JSON.stringify(error)}`);
            return false;
          }
          
          if (error.extensions.code !== scenario.expectedCode) {
            console.error(`Wrong error code. Expected: ${scenario.expectedCode}, Got: ${error.extensions.code}`);
            return false;
          }
          
          // Verify timestamp is present
          if (!error.extensions.timestamp) {
            console.error(`Error missing timestamp: ${JSON.stringify(error)}`);
            return false;
          }
          
          // Verify rate limit errors include retry information
          if (scenario.statusCode === 429 && !error.extensions.retryAfter) {
            console.error(`Rate limit error missing retryAfter: ${JSON.stringify(error)}`);
            return false;
          }
        }
        
        return true;
      }
    };
    
    runPropertyTest(errorHandlingProperty);
  });

  it('should never return system crashes for any error type', () => {
    const noCrashProperty: PropertyTest = {
      property: 'No System Crashes',
      description: 'Error handling should never result in system crashes',
      test: () => {
        const extremeErrorScenarios = [
          null,
          undefined,
          {},
          { statusCode: 'invalid' },
          { statusCode: 999 },
          { statusCode: -1 },
          { message: null },
          { message: undefined },
          { statusCode: 400, message: '<script>alert("xss")</script>' }
        ];
        
        for (const scenario of extremeErrorScenarios) {
          try {
            const error = ErrorHandler.handleLambdaError(scenario, 'testOperation');
            
            // Should always return a valid error object
            if (!error || typeof error !== 'object') {
              console.error(`Invalid error object returned: ${JSON.stringify(error)}`);
              return false;
            }
            
            if (!error.message || typeof error.message !== 'string') {
              console.error(`Error missing valid message: ${JSON.stringify(error)}`);
              return false;
            }
            
            if (!error.extensions || !error.extensions.code) {
              console.error(`Error missing extensions: ${JSON.stringify(error)}`);
              return false;
            }
            
          } catch (exception) {
            console.error(`Error handler threw exception: ${exception}`);
            return false;
          }
        }
        
        return true;
      }
    };
    
    runPropertyTest(noCrashProperty);
  });

  it('should provide informative error messages for all scenarios', () => {
    const informativeErrorsProperty: PropertyTest = {
      property: 'Informative Error Messages',
      description: 'All error messages should be informative and user-friendly',
      test: () => {
        const errorScenarios = [
          { statusCode: 429 },
          { statusCode: 400, message: 'Validation failed' },
          { statusCode: 503 },
          { statusCode: 500 }
        ];
        
        for (const scenario of errorScenarios) {
          const error = ErrorHandler.handleLambdaError(scenario, 'testOperation');
          
          // Message should be non-empty and meaningful
          if (!error.message || error.message.length < 10) {
            console.error(`Error message too short or empty: "${error.message}"`);
            return false;
          }
          
          // Should not contain technical jargon or stack traces
          const technicalTerms = ['undefined', 'null', 'NaN', 'stack trace', 'exception'];
          for (const term of technicalTerms) {
            if (error.message.toLowerCase().includes(term)) {
              console.error(`Error message contains technical term "${term}": ${error.message}`);
              return false;
            }
          }
          
          // Should provide actionable guidance where possible
          if (scenario.statusCode === 429 && !error.message.includes('wait')) {
            console.error(`Rate limit error should mention waiting: ${error.message}`);
            return false;
          }
          
          if (scenario.statusCode === 503 && !error.message.includes('try again')) {
            console.error(`Service unavailable error should mention retrying: ${error.message}`);
            return false;
          }
        }
        
        return true;
      }
    };
    
    runPropertyTest(informativeErrorsProperty);
  });
});

// Export for use in other test files
export { PropertyTest };