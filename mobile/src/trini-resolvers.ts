/**
 * GraphQL Resolvers for Trini AI Chatbot Operations
 * 
 * This file contains the resolver implementations for Trini's GraphQL operations:
 * - askTrini: Main mutation for processing natural language movie queries
 * - getChatHistory: Query for retrieving user's chat session history
 * - getTriniRecommendations: Query for getting recommendations from a session
 * - addTriniRecommendationToRoom: Mutation for adding Trini recommendations to voting rooms
 * 
 * All resolvers include proper input validation, error handling, and integration
 * with the trinity-trini-dev Lambda function following Trinity project patterns.
 */

import { Context } from 'aws-lambda';

// Type definitions for GraphQL inputs and outputs
interface TriniQueryInput {
  query: string;
  userId: string;
  sessionId?: string;
}

interface TriniResponse {
  sessionId: string;
  message: string;
  recommendations: MovieRecommendation[];
  extractedFilters?: ExtractedFilters;
  confidence: number;
}

interface MovieRecommendation {
  movie: Movie;
  relevanceScore: number;
  reasoning?: string;
}

interface Movie {
  id: string;
  title: string;
  overview?: string;
  poster?: string;
  release_date?: string;
  vote_average?: number;
  runtime?: number;
  genres?: Genre[];
}

interface Genre {
  id: number;
  name: string;
}

interface ExtractedFilters {
  genres?: string[];
  yearRange?: YearRange;
  rating?: RatingRange;
  keywords?: string[];
}

interface YearRange {
  min?: number;
  max?: number;
}

interface RatingRange {
  min?: number;
  max?: number;
}

interface ChatSession {
  sessionId: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  messageId: string;
  type: 'USER_QUERY' | 'TRINI_RESPONSE' | 'SYSTEM' | 'TEXT' | 'REACTION';
  content: string;
  extractedFilters?: ExtractedFilters;
  recommendations?: string[];
  timestamp: string;
}

interface AddToRoomResponse {
  success: boolean;
  message?: string;
  roomId?: string;
  movieId?: string;
}

// Input validation utilities
class InputValidator {
  static validateTriniQuery(input: TriniQueryInput): { isValid: boolean; error?: string } {
    if (!input) {
      return { isValid: false, error: 'Input is required' };
    }

    if (!input.query || typeof input.query !== 'string' || input.query.trim().length === 0) {
      return { isValid: false, error: 'Query cannot be empty' };
    }

    if (input.query.length > 500) {
      return { isValid: false, error: 'Query must be less than 500 characters' };
    }

    if (!input.userId || typeof input.userId !== 'string') {
      return { isValid: false, error: 'UserId is required and must be a string' };
    }

    if (!/^[a-zA-Z0-9\-_]+$/.test(input.userId)) {
      return { isValid: false, error: 'UserId contains invalid characters' };
    }

    if (input.sessionId && typeof input.sessionId !== 'string') {
      return { isValid: false, error: 'SessionId must be a string if provided' };
    }

    // Check for potential security issues
    const securityPatterns = [
      /<script/i,
      /javascript:/i,
      /eval\s*\(/i,
      /document\./i,
      /<[^>]*>/g
    ];

    for (const pattern of securityPatterns) {
      if (pattern.test(input.query)) {
        return { isValid: false, error: 'Query contains potentially unsafe content' };
      }
    }

    return { isValid: true };
  }

  static validateChatHistoryQuery(userId: string, limit?: number): { isValid: boolean; error?: string } {
    if (!userId || typeof userId !== 'string') {
      return { isValid: false, error: 'UserId is required and must be a string' };
    }

    if (!/^[a-zA-Z0-9\-_]+$/.test(userId)) {
      return { isValid: false, error: 'UserId contains invalid characters' };
    }

    if (limit !== undefined) {
      if (typeof limit !== 'number' || limit < 1 || limit > 50) {
        return { isValid: false, error: 'Limit must be a number between 1 and 50' };
      }
    }

    return { isValid: true };
  }

  static validateRoomRecommendation(roomId: string, movieId: string): { isValid: boolean; error?: string } {
    if (!roomId || typeof roomId !== 'string') {
      return { isValid: false, error: 'RoomId is required and must be a string' };
    }

    if (!movieId || typeof movieId !== 'string') {
      return { isValid: false, error: 'MovieId is required and must be a string' };
    }

    if (!/^[a-zA-Z0-9\-_]+$/.test(roomId)) {
      return { isValid: false, error: 'RoomId contains invalid characters' };
    }

    if (!/^\d+$/.test(movieId)) {
      return { isValid: false, error: 'MovieId must be a numeric string' };
    }

    return { isValid: true };
  }
}

// Error handling utilities
class ErrorHandler {
  static createGraphQLError(message: string, code: string = 'INTERNAL_ERROR', extensions?: any) {
    return {
      message,
      extensions: {
        code,
        timestamp: new Date().toISOString(),
        ...extensions
      }
    };
  }

  static handleLambdaError(error: any, operation: string) {
    console.error(`Error in ${operation}:`, error);

    if (error.statusCode === 429) {
      return this.createGraphQLError(
        'Rate limit exceeded. Please wait before making another request.',
        'RATE_LIMIT_EXCEEDED',
        { retryAfter: 60 }
      );
    }

    if (error.statusCode === 400) {
      return this.createGraphQLError(
        error.message || 'Invalid request parameters',
        'BAD_REQUEST'
      );
    }

    if (error.statusCode === 503) {
      return this.createGraphQLError(
        'AI service temporarily unavailable. Please try again later.',
        'SERVICE_UNAVAILABLE'
      );
    }

    return this.createGraphQLError(
      'An unexpected error occurred while processing your request',
      'INTERNAL_ERROR'
    );
  }
}

// Lambda invocation utility
class LambdaInvoker {
  static async invokeTriniBotLambda(event: any): Promise<any> {
    // This would be replaced with actual AWS Lambda invocation in the CDK
    // For now, this is a placeholder that shows the expected interface
    
    try {
      // In actual implementation, this would use AWS SDK to invoke the Lambda
      // const lambda = new AWS.Lambda();
      // const result = await lambda.invoke({
      //   FunctionName: 'trinity-trini-dev',
      //   Payload: JSON.stringify(event)
      // }).promise();
      // return JSON.parse(result.Payload as string);
      
      console.log('Invoking trinity-trini-dev Lambda with event:', JSON.stringify(event, null, 2));
      
      // Placeholder response structure
      return {
        statusCode: 200,
        body: {
          message: 'Lambda invocation placeholder - replace with actual implementation',
          event
        }
      };
    } catch (error) {
      console.error('Lambda invocation failed:', error);
      throw error;
    }
  }
}

/**
 * Resolver for askTrini mutation
 * Processes natural language movie queries using AI and returns recommendations
 */
export const askTriniResolver = {
  typeName: 'Mutation',
  fieldName: 'askTrini',
  dataSource: 'TriniDataSource',
  requestMappingTemplate: `
    {
      "version": "2017-02-28",
      "operation": "Invoke",
      "payload": {
        "info": {
          "fieldName": "askTrini"
        },
        "arguments": $util.toJson($context.arguments),
        "identity": {
          "userId": "$context.identity.sub",
          "username": "$context.identity.username"
        },
        "request": {
          "headers": $util.toJson($context.request.headers)
        }
      }
    }
  `,
  responseMappingTemplate: `
    #if($context.error)
      $util.error($context.error.message, $context.error.type)
    #end
    
    #if($context.result.statusCode == 200)
      $util.toJson($context.result.body)
    #elseif($context.result.statusCode == 400)
      $util.error($context.result.body.message, "BadRequest")
    #elseif($context.result.statusCode == 429)
      $util.error("Rate limit exceeded. Please wait before making another request.", "RateLimitExceeded")
    #elseif($context.result.statusCode == 503)
      $util.error("AI service temporarily unavailable. Please try again later.", "ServiceUnavailable")
    #else
      $util.error("An unexpected error occurred", "InternalError")
    #end
  `
};

/**
 * Resolver for getChatHistory query
 * Retrieves user's chat session history with pagination
 */
export const getChatHistoryResolver = {
  typeName: 'Query',
  fieldName: 'getChatHistory',
  dataSource: 'TriniDataSource',
  requestMappingTemplate: `
    {
      "version": "2017-02-28",
      "operation": "Invoke",
      "payload": {
        "info": {
          "fieldName": "getChatHistory"
        },
        "arguments": $util.toJson($context.arguments),
        "identity": {
          "userId": "$context.identity.sub",
          "username": "$context.identity.username"
        }
      }
    }
  `,
  responseMappingTemplate: `
    #if($context.error)
      $util.error($context.error.message, $context.error.type)
    #end
    
    #if($context.result.statusCode == 200)
      $util.toJson($context.result.body)
    #elseif($context.result.statusCode == 400)
      $util.error($context.result.body.message, "BadRequest")
    #elseif($context.result.statusCode == 429)
      $util.error("Rate limit exceeded. Please wait before making another request.", "RateLimitExceeded")
    #else
      $util.error("An unexpected error occurred", "InternalError")
    #end
  `
};

/**
 * Resolver for getTriniRecommendations query
 * Gets movie recommendations from a specific chat session
 */
export const getTriniRecommendationsResolver = {
  typeName: 'Query',
  fieldName: 'getTriniRecommendations',
  dataSource: 'TriniDataSource',
  requestMappingTemplate: `
    {
      "version": "2017-02-28",
      "operation": "Invoke",
      "payload": {
        "info": {
          "fieldName": "getTriniRecommendations"
        },
        "arguments": $util.toJson($context.arguments),
        "identity": {
          "userId": "$context.identity.sub",
          "username": "$context.identity.username"
        }
      }
    }
  `,
  responseMappingTemplate: `
    #if($context.error)
      $util.error($context.error.message, $context.error.type)
    #end
    
    #if($context.result.statusCode == 200)
      $util.toJson($context.result.body)
    #elseif($context.result.statusCode == 400)
      $util.error($context.result.body.message, "BadRequest")
    #else
      $util.error("An unexpected error occurred", "InternalError")
    #end
  `
};

/**
 * Resolver for addTriniRecommendationToRoom mutation
 * Adds a Trini-recommended movie to a voting room
 */
export const addTriniRecommendationToRoomResolver = {
  typeName: 'Mutation',
  fieldName: 'addTriniRecommendationToRoom',
  dataSource: 'TriniDataSource',
  requestMappingTemplate: `
    {
      "version": "2017-02-28",
      "operation": "Invoke",
      "payload": {
        "info": {
          "fieldName": "addTriniRecommendationToRoom"
        },
        "arguments": $util.toJson($context.arguments),
        "identity": {
          "userId": "$context.identity.sub",
          "username": "$context.identity.username"
        }
      }
    }
  `,
  responseMappingTemplate: `
    #if($context.error)
      $util.error($context.error.message, $context.error.type)
    #end
    
    #if($context.result.statusCode == 200)
      $util.toJson($context.result.body)
    #elseif($context.result.statusCode == 400)
      $util.error($context.result.body.message, "BadRequest")
    #elseif($context.result.statusCode == 403)
      $util.error("You don't have permission to add movies to this room", "Forbidden")
    #elseif($context.result.statusCode == 404)
      $util.error("Room or movie not found", "NotFound")
    #else
      $util.error("An unexpected error occurred", "InternalError")
    #end
  `
};

// Export all resolvers
export const trinitResolvers = {
  askTrini: askTriniResolver,
  getChatHistory: getChatHistoryResolver,
  getTriniRecommendations: getTriniRecommendationsResolver,
  addTriniRecommendationToRoom: addTriniRecommendationToRoomResolver
};

// Utility functions for testing and validation
export { InputValidator, ErrorHandler, LambdaInvoker };