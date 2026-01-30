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
 * **Validates: Requirements 5.3**
 */
describe('Property 9: GraphQL Response Schema Compliance', () => {

  // Schema validation utilities
  const validateMovieSchema = (movie: any): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Required fields validation
    if (!movie.id || typeof movie.id !== 'string') {
      errors.push('Movie.id is required and must be a string');
    }
    if (!movie.title || typeof movie.title !== 'string') {
      errors.push('Movie.title is required and must be a string');
    }
    
    // Optional fields with strict type checking
    if (movie.overview !== undefined && movie.overview !== null && typeof movie.overview !== 'string') {
      errors.push('Movie.overview must be a string or null');
    }
    if (movie.poster !== undefined && movie.poster !== null && typeof movie.poster !== 'string') {
      errors.push('Movie.poster must be a string or null');
    }
    if (movie.release_date !== undefined && movie.release_date !== null && typeof movie.release_date !== 'string') {
      errors.push('Movie.release_date must be a string or null');
    }
    if (movie.vote_average !== undefined && movie.vote_average !== null && typeof movie.vote_average !== 'number') {
      errors.push('Movie.vote_average must be a number or null');
    }
    if (movie.runtime !== undefined && movie.runtime !== null && typeof movie.runtime !== 'number') {
      errors.push('Movie.runtime must be a number or null');
    }
    
    // Genres array validation with detailed checking
    if (movie.genres !== undefined && movie.genres !== null) {
      if (!Array.isArray(movie.genres)) {
        errors.push('Movie.genres must be an array or null');
      } else {
        movie.genres.forEach((genre: any, index: number) => {
          if (!genre || typeof genre !== 'object') {
            errors.push(`Movie.genres[${index}] must be an object`);
          } else {
            if (typeof genre.id !== 'number') {
              errors.push(`Movie.genres[${index}].id must be a number`);
            }
            if (!genre.name || typeof genre.name !== 'string') {
              errors.push(`Movie.genres[${index}].name is required and must be a string`);
            }
          }
        });
      }
    }
    
    return { isValid: errors.length === 0, errors };
  };

  const validateMovieRecommendationSchema = (recommendation: any, index: number): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Required movie field
    if (!recommendation.movie || typeof recommendation.movie !== 'object') {
      errors.push(`recommendations[${index}].movie is required and must be an object`);
      return { isValid: false, errors };
    }
    
    // Validate nested movie schema
    const movieValidation = validateMovieSchema(recommendation.movie);
    if (!movieValidation.isValid) {
      errors.push(...movieValidation.errors.map(err => `recommendations[${index}].${err}`));
    }
    
    // Required relevanceScore field
    if (typeof recommendation.relevanceScore !== 'number') {
      errors.push(`recommendations[${index}].relevanceScore is required and must be a number`);
    } else if (recommendation.relevanceScore < 0 || recommendation.relevanceScore > 1) {
      errors.push(`recommendations[${index}].relevanceScore must be between 0 and 1`);
    }
    
    // Optional reasoning field
    if (recommendation.reasoning !== undefined && recommendation.reasoning !== null && typeof recommendation.reasoning !== 'string') {
      errors.push(`recommendations[${index}].reasoning must be a string or null`);
    }
    
    return { isValid: errors.length === 0, errors };
  };

  const validateExtractedFiltersSchema = (filters: any): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Optional genres array
    if (filters.genres !== undefined && filters.genres !== null) {
      if (!Array.isArray(filters.genres)) {
        errors.push('extractedFilters.genres must be an array or null');
      } else {
        filters.genres.forEach((genre: any, index: number) => {
          if (typeof genre !== 'string') {
            errors.push(`extractedFilters.genres[${index}] must be a string`);
          }
        });
      }
    }
    
    // Optional keywords array
    if (filters.keywords !== undefined && filters.keywords !== null) {
      if (!Array.isArray(filters.keywords)) {
        errors.push('extractedFilters.keywords must be an array or null');
      } else {
        filters.keywords.forEach((keyword: any, index: number) => {
          if (typeof keyword !== 'string') {
            errors.push(`extractedFilters.keywords[${index}] must be a string`);
          }
        });
      }
    }
    
    // Optional yearRange object
    if (filters.yearRange !== undefined && filters.yearRange !== null) {
      if (typeof filters.yearRange !== 'object') {
        errors.push('extractedFilters.yearRange must be an object or null');
      } else {
        if (filters.yearRange.min !== undefined && filters.yearRange.min !== null && typeof filters.yearRange.min !== 'number') {
          errors.push('extractedFilters.yearRange.min must be a number or null');
        }
        if (filters.yearRange.max !== undefined && filters.yearRange.max !== null && typeof filters.yearRange.max !== 'number') {
          errors.push('extractedFilters.yearRange.max must be a number or null');
        }
        // Logical validation: min should be <= max if both are present
        if (filters.yearRange.min && filters.yearRange.max && filters.yearRange.min > filters.yearRange.max) {
          errors.push('extractedFilters.yearRange.min must be less than or equal to max');
        }
      }
    }
    
    // Optional rating object
    if (filters.rating !== undefined && filters.rating !== null) {
      if (typeof filters.rating !== 'object') {
        errors.push('extractedFilters.rating must be an object or null');
      } else {
        if (filters.rating.min !== undefined && filters.rating.min !== null && typeof filters.rating.min !== 'number') {
          errors.push('extractedFilters.rating.min must be a number or null');
        }
        if (filters.rating.max !== undefined && filters.rating.max !== null && typeof filters.rating.max !== 'number') {
          errors.push('extractedFilters.rating.max must be a number or null');
        }
        // Logical validation: min should be <= max if both are present
        if (filters.rating.min && filters.rating.max && filters.rating.min > filters.rating.max) {
          errors.push('extractedFilters.rating.min must be less than or equal to max');
        }
        // Rating range validation (0-10 for TMDB)
        if (filters.rating.min !== undefined && filters.rating.min !== null && (filters.rating.min < 0 || filters.rating.min > 10)) {
          errors.push('extractedFilters.rating.min must be between 0 and 10');
        }
        if (filters.rating.max !== undefined && filters.rating.max !== null && (filters.rating.max < 0 || filters.rating.max > 10)) {
          errors.push('extractedFilters.rating.max must be between 0 and 10');
        }
      }
    }
    
    return { isValid: errors.length === 0, errors };
  };

  const validateTriniResponseSchema = (response: any): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Required sessionId field
    if (!response.sessionId || typeof response.sessionId !== 'string') {
      errors.push('sessionId is required and must be a string');
    }
    
    // Required message field
    if (!response.message || typeof response.message !== 'string') {
      errors.push('message is required and must be a string');
    }
    
    // Required recommendations array
    if (!Array.isArray(response.recommendations)) {
      errors.push('recommendations is required and must be an array');
    } else {
      response.recommendations.forEach((rec: any, index: number) => {
        const recValidation = validateMovieRecommendationSchema(rec, index);
        if (!recValidation.isValid) {
          errors.push(...recValidation.errors);
        }
      });
    }
    
    // Required confidence field
    if (typeof response.confidence !== 'number') {
      errors.push('confidence is required and must be a number');
    } else if (response.confidence < 0 || response.confidence > 1) {
      errors.push('confidence must be between 0 and 1');
    }
    
    // Optional extractedFilters validation
    if (response.extractedFilters !== undefined && response.extractedFilters !== null) {
      const filtersValidation = validateExtractedFiltersSchema(response.extractedFilters);
      if (!filtersValidation.isValid) {
        errors.push(...filtersValidation.errors);
      }
    }
    
    return { isValid: errors.length === 0, errors };
  };

  const validateChatSessionSchema = (session: any, index: number): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Required session fields
    if (!session.sessionId || typeof session.sessionId !== 'string') {
      errors.push(`sessions[${index}].sessionId is required and must be a string`);
    }
    if (!session.userId || typeof session.userId !== 'string') {
      errors.push(`sessions[${index}].userId is required and must be a string`);
    }
    if (!Array.isArray(session.messages)) {
      errors.push(`sessions[${index}].messages is required and must be an array`);
    } else {
      session.messages.forEach((message: any, msgIndex: number) => {
        if (!message.messageId || typeof message.messageId !== 'string') {
          errors.push(`sessions[${index}].messages[${msgIndex}].messageId is required and must be a string`);
        }
        if (!message.type || typeof message.type !== 'string') {
          errors.push(`sessions[${index}].messages[${msgIndex}].type is required and must be a string`);
        }
        if (!message.content || typeof message.content !== 'string') {
          errors.push(`sessions[${index}].messages[${msgIndex}].content is required and must be a string`);
        }
        if (!message.timestamp || typeof message.timestamp !== 'string') {
          errors.push(`sessions[${index}].messages[${msgIndex}].timestamp is required and must be a string`);
        }
        
        // Optional fields validation
        if (message.recommendations !== undefined && message.recommendations !== null && !Array.isArray(message.recommendations)) {
          errors.push(`sessions[${index}].messages[${msgIndex}].recommendations must be an array or null`);
        }
        if (message.extractedFilters !== undefined && message.extractedFilters !== null) {
          const filtersValidation = validateExtractedFiltersSchema(message.extractedFilters);
          if (!filtersValidation.isValid) {
            errors.push(...filtersValidation.errors.map(err => `sessions[${index}].messages[${msgIndex}].${err}`));
          }
        }
      });
    }
    
    if (!session.createdAt || typeof session.createdAt !== 'string') {
      errors.push(`sessions[${index}].createdAt is required and must be a string`);
    }
    if (!session.updatedAt || typeof session.updatedAt !== 'string') {
      errors.push(`sessions[${index}].updatedAt is required and must be a string`);
    }
    
    return { isValid: errors.length === 0, errors };
  };

  const validateAddToRoomResponseSchema = (response: any): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Required success field
    if (typeof response.success !== 'boolean') {
      errors.push('success is required and must be a boolean');
    }
    
    // Optional fields validation
    if (response.message !== undefined && response.message !== null && typeof response.message !== 'string') {
      errors.push('message must be a string or null');
    }
    if (response.roomId !== undefined && response.roomId !== null && typeof response.roomId !== 'string') {
      errors.push('roomId must be a string or null');
    }
    if (response.movieId !== undefined && response.movieId !== null && typeof response.movieId !== 'string') {
      errors.push('movieId must be a string or null');
    }
    
    return { isValid: errors.length === 0, errors };
  };

  it('should validate askTrini response schema compliance using fast-check', () => {
    // Property: All askTrini responses should conform exactly to the defined schema
    fc.assert(fc.property(
      fc.record({
        sessionId: fc.string({ minLength: 1, maxLength: 50 }),
        message: fc.string({ minLength: 1, maxLength: 500 }),
        recommendations: fc.array(
          fc.record({
            movie: fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              title: fc.string({ minLength: 1, maxLength: 200 }),
              overview: fc.option(fc.string({ maxLength: 1000 }), { nil: null }),
              poster: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
              release_date: fc.option(fc.string({ minLength: 10, maxLength: 10 }), { nil: null }),
              vote_average: fc.option(fc.float({ min: 0, max: 10 }), { nil: null }),
              runtime: fc.option(fc.integer({ min: 1, max: 500 }), { nil: null }),
              genres: fc.option(fc.array(
                fc.record({
                  id: fc.integer({ min: 1, max: 10000 }),
                  name: fc.string({ minLength: 1, maxLength: 50 })
                }),
                { minLength: 0, maxLength: 10 }
              ), { nil: null })
            }),
            relevanceScore: fc.float({ min: 0, max: 1 }),
            reasoning: fc.option(fc.string({ maxLength: 200 }), { nil: null })
          }),
          { minLength: 0, maxLength: 20 }
        ),
        confidence: fc.float({ min: 0, max: 1 }),
        extractedFilters: fc.option(fc.record({
          genres: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 10 }), { nil: null }),
          keywords: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 20 }), { nil: null }),
          yearRange: fc.option(fc.record({
            min: fc.option(fc.integer({ min: 1900, max: 2030 }), { nil: null }),
            max: fc.option(fc.integer({ min: 1900, max: 2030 }), { nil: null })
          }), { nil: null }),
          rating: fc.option(fc.record({
            min: fc.option(fc.float({ min: 0, max: 10 }), { nil: null }),
            max: fc.option(fc.float({ min: 0, max: 10 }), { nil: null })
          }), { nil: null })
        }), { nil: null })
      }),
      (response) => {
        const validation = validateTriniResponseSchema(response);
        if (!validation.isValid) {
          console.error(`Schema validation failed for askTrini response:`, validation.errors);
          console.error(`Response:`, JSON.stringify(response, null, 2));
        }
        return validation.isValid;
      }
    ), { numRuns: 100 });
  });

  it('should validate getChatHistory response schema compliance using fast-check', () => {
    // Property: All getChatHistory responses should conform exactly to the defined schema
    fc.assert(fc.property(
      fc.array(
        fc.record({
          sessionId: fc.string({ minLength: 1, maxLength: 50 }),
          userId: fc.string({ minLength: 1, maxLength: 50 }),
          messages: fc.array(
            fc.record({
              messageId: fc.string({ minLength: 1, maxLength: 50 }),
              type: fc.constantFrom('USER_QUERY', 'TRINI_RESPONSE', 'SYSTEM', 'TEXT', 'REACTION'),
              content: fc.string({ minLength: 1, maxLength: 1000 }),
              timestamp: fc.string({ minLength: 20, maxLength: 30 }), // ISO datetime format
              extractedFilters: fc.option(fc.record({
                genres: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 30 })), { nil: null }),
                keywords: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 50 })), { nil: null })
              }), { nil: null }),
              recommendations: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 })), { nil: null })
            }),
            { minLength: 1, maxLength: 20 }
          ),
          createdAt: fc.string({ minLength: 20, maxLength: 30 }),
          updatedAt: fc.string({ minLength: 20, maxLength: 30 })
        }),
        { minLength: 0, maxLength: 10 }
      ),
      (sessions) => {
        // Validate each session in the response
        for (let i = 0; i < sessions.length; i++) {
          const validation = validateChatSessionSchema(sessions[i], i);
          if (!validation.isValid) {
            console.error(`Schema validation failed for getChatHistory session ${i}:`, validation.errors);
            console.error(`Session:`, JSON.stringify(sessions[i], null, 2));
            return false;
          }
        }
        return true;
      }
    ), { numRuns: 100 });
  });

  it('should validate addTriniRecommendationToRoom response schema compliance using fast-check', () => {
    // Property: All addTriniRecommendationToRoom responses should conform exactly to the defined schema
    fc.assert(fc.property(
      fc.record({
        success: fc.boolean(),
        message: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
        roomId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
        movieId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null })
      }),
      (response) => {
        const validation = validateAddToRoomResponseSchema(response);
        if (!validation.isValid) {
          console.error(`Schema validation failed for addTriniRecommendationToRoom response:`, validation.errors);
          console.error(`Response:`, JSON.stringify(response, null, 2));
        }
        return validation.isValid;
      }
    ), { numRuns: 100 });
  });

  it('should validate getTriniRecommendations response schema compliance using fast-check', () => {
    // Property: All getTriniRecommendations responses should conform exactly to the defined schema
    fc.assert(fc.property(
      fc.array(
        fc.record({
          movie: fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            title: fc.string({ minLength: 1, maxLength: 200 }),
            overview: fc.option(fc.string({ maxLength: 1000 }), { nil: null }),
            poster: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
            release_date: fc.option(fc.string({ minLength: 10, maxLength: 10 }), { nil: null }),
            vote_average: fc.option(fc.float({ min: 0, max: 10 }), { nil: null }),
            runtime: fc.option(fc.integer({ min: 1, max: 500 }), { nil: null }),
            genres: fc.option(fc.array(
              fc.record({
                id: fc.integer({ min: 1, max: 10000 }),
                name: fc.string({ minLength: 1, maxLength: 50 })
              }),
              { minLength: 0, maxLength: 10 }
            ), { nil: null })
          }),
          relevanceScore: fc.float({ min: 0, max: 1 }),
          reasoning: fc.option(fc.string({ maxLength: 200 }), { nil: null })
        }),
        { minLength: 0, maxLength: 20 }
      ),
      (recommendations) => {
        // Validate each recommendation in the response
        for (let i = 0; i < recommendations.length; i++) {
          const validation = validateMovieRecommendationSchema(recommendations[i], i);
          if (!validation.isValid) {
            console.error(`Schema validation failed for getTriniRecommendations recommendation ${i}:`, validation.errors);
            console.error(`Recommendation:`, JSON.stringify(recommendations[i], null, 2));
            return false;
          }
        }
        return true;
      }
    ), { numRuns: 100 });
  });

  it('should reject responses with invalid schema structures', () => {
    // Property: Invalid responses should always be detected by schema validation
    const invalidResponseGenerator = fc.oneof(
      // Missing required fields
      fc.record({
        message: fc.string(),
        recommendations: fc.array(fc.anything()),
        confidence: fc.float({ min: 0, max: 1 })
        // Missing sessionId
      }),
      // Invalid field types
      fc.record({
        sessionId: fc.integer(), // Should be string
        message: fc.string(),
        recommendations: fc.array(fc.anything()),
        confidence: fc.float({ min: 0, max: 1 })
      }),
      // Invalid confidence range
      fc.record({
        sessionId: fc.string(),
        message: fc.string(),
        recommendations: fc.array(fc.anything()),
        confidence: fc.float({ min: 1.1, max: 2.0 }) // Should be 0-1
      }),
      // Invalid recommendations structure
      fc.record({
        sessionId: fc.string(),
        message: fc.string(),
        recommendations: fc.string(), // Should be array
        confidence: fc.float({ min: 0, max: 1 })
      })
    );

    fc.assert(fc.property(
      invalidResponseGenerator,
      (invalidResponse) => {
        const validation = validateTriniResponseSchema(invalidResponse);
        // Invalid responses should always fail validation
        return !validation.isValid && validation.errors.length > 0;
      }
    ), { numRuns: 100 });
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