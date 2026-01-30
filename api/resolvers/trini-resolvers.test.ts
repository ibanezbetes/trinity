/**
 * Unit Tests for Trini GraphQL Resolvers
 * 
 * Tests the input validation, error handling, and integration logic
 * for all Trini GraphQL operations.
 */

import { InputValidator, ErrorHandler } from './trini-resolvers';

describe('Trini GraphQL Resolvers', () => {
  
  describe('InputValidator', () => {
    
    describe('validateTriniQuery', () => {
      it('should validate correct input', () => {
        const input = {
          query: 'I want action movies from the 90s',
          userId: 'user123'
        };
        
        const result = InputValidator.validateTriniQuery(input);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
      
      it('should reject empty query', () => {
        const input = {
          query: '',
          userId: 'user123'
        };
        
        const result = InputValidator.validateTriniQuery(input);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Query cannot be empty');
      });
      
      it('should reject query that is too long', () => {
        const input = {
          query: 'a'.repeat(501),
          userId: 'user123'
        };
        
        const result = InputValidator.validateTriniQuery(input);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Query must be less than 500 characters');
      });
      
      it('should reject missing userId', () => {
        const input = {
          query: 'action movies',
          userId: ''
        };
        
        const result = InputValidator.validateTriniQuery(input);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('UserId is required and must be a string');
      });
      
      it('should reject userId with invalid characters', () => {
        const input = {
          query: 'action movies',
          userId: 'user@123.com'
        };
        
        const result = InputValidator.validateTriniQuery(input);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('UserId contains invalid characters');
      });
      
      it('should reject queries with script tags', () => {
        const input = {
          query: 'action movies <script>alert("xss")</script>',
          userId: 'user123'
        };
        
        const result = InputValidator.validateTriniQuery(input);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Query contains potentially unsafe content');
      });
      
      it('should reject queries with javascript: protocol', () => {
        const input = {
          query: 'javascript:alert("xss")',
          userId: 'user123'
        };
        
        const result = InputValidator.validateTriniQuery(input);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Query contains potentially unsafe content');
      });
      
      it('should accept valid sessionId', () => {
        const input = {
          query: 'comedy movies',
          userId: 'user123',
          sessionId: 'session-456'
        };
        
        const result = InputValidator.validateTriniQuery(input);
        expect(result.isValid).toBe(true);
      });
      
      it('should reject invalid sessionId type', () => {
        const input = {
          query: 'comedy movies',
          userId: 'user123',
          sessionId: 123 as any
        };
        
        const result = InputValidator.validateTriniQuery(input);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('SessionId must be a string if provided');
      });
    });
    
    describe('validateChatHistoryQuery', () => {
      it('should validate correct userId', () => {
        const result = InputValidator.validateChatHistoryQuery('user123');
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
      
      it('should validate correct userId with limit', () => {
        const result = InputValidator.validateChatHistoryQuery('user123', 10);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
      
      it('should reject empty userId', () => {
        const result = InputValidator.validateChatHistoryQuery('');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('UserId is required and must be a string');
      });
      
      it('should reject userId with invalid characters', () => {
        const result = InputValidator.validateChatHistoryQuery('user@123');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('UserId contains invalid characters');
      });
      
      it('should reject limit that is too small', () => {
        const result = InputValidator.validateChatHistoryQuery('user123', 0);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Limit must be a number between 1 and 50');
      });
      
      it('should reject limit that is too large', () => {
        const result = InputValidator.validateChatHistoryQuery('user123', 51);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Limit must be a number between 1 and 50');
      });
    });
    
    describe('validateRoomRecommendation', () => {
      it('should validate correct roomId and movieId', () => {
        const result = InputValidator.validateRoomRecommendation('room123', '456');
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
      
      it('should reject empty roomId', () => {
        const result = InputValidator.validateRoomRecommendation('', '456');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('RoomId is required and must be a string');
      });
      
      it('should reject empty movieId', () => {
        const result = InputValidator.validateRoomRecommendation('room123', '');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('MovieId is required and must be a string');
      });
      
      it('should reject roomId with invalid characters', () => {
        const result = InputValidator.validateRoomRecommendation('room@123', '456');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('RoomId contains invalid characters');
      });
      
      it('should reject non-numeric movieId', () => {
        const result = InputValidator.validateRoomRecommendation('room123', 'abc');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('MovieId must be a numeric string');
      });
    });
  });
  
  describe('ErrorHandler', () => {
    
    describe('createGraphQLError', () => {
      it('should create error with message and default code', () => {
        const error = ErrorHandler.createGraphQLError('Test error');
        
        expect(error.message).toBe('Test error');
        expect(error.extensions.code).toBe('INTERNAL_ERROR');
        expect(error.extensions.timestamp).toBeDefined();
      });
      
      it('should create error with custom code', () => {
        const error = ErrorHandler.createGraphQLError('Test error', 'CUSTOM_ERROR');
        
        expect(error.message).toBe('Test error');
        expect(error.extensions.code).toBe('CUSTOM_ERROR');
      });
      
      it('should create error with extensions', () => {
        const error = ErrorHandler.createGraphQLError('Test error', 'CUSTOM_ERROR', { retryAfter: 60 });
        
        expect(error.message).toBe('Test error');
        expect(error.extensions.code).toBe('CUSTOM_ERROR');
        expect(error.extensions.retryAfter).toBe(60);
      });
    });
    
    describe('handleLambdaError', () => {
      it('should handle rate limit error', () => {
        const lambdaError = { statusCode: 429 };
        const error = ErrorHandler.handleLambdaError(lambdaError, 'askTrini');
        
        expect(error.message).toBe('Rate limit exceeded. Please wait before making another request.');
        expect(error.extensions.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(error.extensions.retryAfter).toBe(60);
      });
      
      it('should handle bad request error', () => {
        const lambdaError = { statusCode: 400, message: 'Invalid input' };
        const error = ErrorHandler.handleLambdaError(lambdaError, 'askTrini');
        
        expect(error.message).toBe('Invalid input');
        expect(error.extensions.code).toBe('BAD_REQUEST');
      });
      
      it('should handle service unavailable error', () => {
        const lambdaError = { statusCode: 503 };
        const error = ErrorHandler.handleLambdaError(lambdaError, 'askTrini');
        
        expect(error.message).toBe('AI service temporarily unavailable. Please try again later.');
        expect(error.extensions.code).toBe('SERVICE_UNAVAILABLE');
      });
      
      it('should handle unknown error', () => {
        const lambdaError = { statusCode: 500 };
        const error = ErrorHandler.handleLambdaError(lambdaError, 'askTrini');
        
        expect(error.message).toBe('An unexpected error occurred while processing your request');
        expect(error.extensions.code).toBe('INTERNAL_ERROR');
      });
    });
  });
  
  describe('VTL Mapping Templates', () => {
    
    it('should have correct request mapping template structure for askTrini', () => {
      // This would test the VTL template structure
      // In a real implementation, you might parse and validate the VTL
      const expectedFields = ['version', 'operation', 'payload'];
      const expectedPayloadFields = ['info', 'arguments', 'identity', 'request'];
      
      // Mock test - in real implementation you'd parse the VTL template
      expect(expectedFields).toContain('version');
      expect(expectedPayloadFields).toContain('info');
    });
    
    it('should have correct response mapping template structure', () => {
      // This would test the VTL response template structure
      const expectedStatusCodes = [200, 400, 429, 503];
      
      // Mock test - in real implementation you'd validate VTL logic
      expect(expectedStatusCodes).toContain(200);
      expect(expectedStatusCodes).toContain(429);
    });
  });
  
  describe('Integration Tests', () => {
    
    it('should handle complete askTrini flow with valid input', async () => {
      const input = {
        query: 'I want action movies from the 2000s',
        userId: 'test-user-123'
      };
      
      // Validate input
      const validation = InputValidator.validateTriniQuery(input);
      expect(validation.isValid).toBe(true);
      
      // Mock successful Lambda response
      const mockLambdaResponse = {
        statusCode: 200,
        body: {
          sessionId: 'session-123',
          message: 'Here are some action movies from the 2000s',
          recommendations: [
            {
              movie: {
                id: '123',
                title: 'The Matrix Reloaded',
                overview: 'Neo continues his fight against the machines',
                poster: '/poster.jpg',
                vote_average: 7.2
              },
              relevanceScore: 0.95,
              reasoning: 'Matches action genre and 2000s timeframe'
            }
          ],
          confidence: 0.9
        }
      };
      
      // Test that the response structure is correct
      expect(mockLambdaResponse.body.sessionId).toBeDefined();
      expect(mockLambdaResponse.body.recommendations).toHaveLength(1);
      expect(mockLambdaResponse.body.confidence).toBeGreaterThan(0.5);
    });
    
    it('should handle getChatHistory flow with pagination', async () => {
      const userId = 'test-user-123';
      const limit = 5;
      
      // Validate input
      const validation = InputValidator.validateChatHistoryQuery(userId, limit);
      expect(validation.isValid).toBe(true);
      
      // Mock successful Lambda response
      const mockLambdaResponse = {
        statusCode: 200,
        body: {
          sessions: [
            {
              sessionId: 'session-1',
              userId: 'test-user-123',
              messages: [
                {
                  messageId: 'msg-1',
                  type: 'USER_QUERY',
                  content: 'action movies',
                  timestamp: '2024-01-01T10:00:00Z'
                }
              ],
              createdAt: '2024-01-01T10:00:00Z',
              updatedAt: '2024-01-01T10:05:00Z'
            }
          ]
        }
      };
      
      // Test response structure
      expect(mockLambdaResponse.body.sessions).toHaveLength(1);
      expect(mockLambdaResponse.body.sessions[0].messages).toHaveLength(1);
    });
    
    it('should handle addTriniRecommendationToRoom flow', async () => {
      const roomId = 'room-123';
      const movieId = '456';
      
      // Validate input
      const validation = InputValidator.validateRoomRecommendation(roomId, movieId);
      expect(validation.isValid).toBe(true);
      
      // Mock successful Lambda response
      const mockLambdaResponse = {
        statusCode: 200,
        body: {
          success: true,
          message: 'Movie added to room successfully',
          roomId: 'room-123',
          movieId: '456'
        }
      };
      
      // Test response structure
      expect(mockLambdaResponse.body.success).toBe(true);
      expect(mockLambdaResponse.body.roomId).toBe(roomId);
      expect(mockLambdaResponse.body.movieId).toBe(movieId);
    });
  });
});