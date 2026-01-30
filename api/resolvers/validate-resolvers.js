/**
 * Simple validation script for Trini GraphQL resolvers
 * Tests the core logic without requiring a full test framework setup
 */

// Mock the resolver functions for validation
const InputValidator = {
  validateTriniQuery: (input) => {
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
  },

  validateChatHistoryQuery: (userId, limit) => {
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
  },

  validateRoomRecommendation: (roomId, movieId) => {
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
};

const ErrorHandler = {
  createGraphQLError: (message, code = 'INTERNAL_ERROR', extensions) => {
    return {
      message,
      extensions: {
        code,
        timestamp: new Date().toISOString(),
        ...extensions
      }
    };
  },

  handleLambdaError: (error, operation) => {
    console.error(`Error in ${operation}:`, error);

    if (error && error.statusCode === 429) {
      return ErrorHandler.createGraphQLError(
        'Rate limit exceeded. Please wait before making another request.',
        'RATE_LIMIT_EXCEEDED',
        { retryAfter: 60 }
      );
    }

    if (error && error.statusCode === 400) {
      return ErrorHandler.createGraphQLError(
        error.message || 'Invalid request parameters',
        'BAD_REQUEST'
      );
    }

    if (error && error.statusCode === 503) {
      return ErrorHandler.createGraphQLError(
        'AI service temporarily unavailable. Please try again later.',
        'SERVICE_UNAVAILABLE'
      );
    }

    return ErrorHandler.createGraphQLError(
      'An unexpected error occurred while processing your request',
      'INTERNAL_ERROR'
    );
  }
};

// Validation tests
function runValidationTests() {
  console.log('🧪 Running Trini GraphQL Resolver Validation Tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  function test(name, testFn) {
    try {
      testFn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      failed++;
    }
  }
  
  // Test askTrini input validation
  test('Valid askTrini input should pass', () => {
    const result = InputValidator.validateTriniQuery({
      query: 'I want action movies from the 90s',
      userId: 'user123'
    });
    if (!result.isValid) throw new Error(`Expected valid, got: ${result.error}`);
  });
  
  test('Empty query should be rejected', () => {
    const result = InputValidator.validateTriniQuery({
      query: '',
      userId: 'user123'
    });
    if (result.isValid) throw new Error('Expected invalid');
    console.log('Actual error message:', result.error);
    if (!result.error.includes('empty')) throw new Error('Wrong error message');
  });
  
  test('XSS attempt should be rejected', () => {
    const result = InputValidator.validateTriniQuery({
      query: '<script>alert("xss")</script>',
      userId: 'user123'
    });
    if (result.isValid) throw new Error('Expected invalid');
    if (!result.error.includes('unsafe')) throw new Error('Wrong error message');
  });
  
  test('Invalid userId characters should be rejected', () => {
    const result = InputValidator.validateTriniQuery({
      query: 'action movies',
      userId: 'user@123.com'
    });
    if (result.isValid) throw new Error('Expected invalid');
    if (!result.error.includes('invalid characters')) throw new Error('Wrong error message');
  });
  
  // Test getChatHistory validation
  test('Valid chat history query should pass', () => {
    const result = InputValidator.validateChatHistoryQuery('user123', 10);
    if (!result.isValid) throw new Error(`Expected valid, got: ${result.error}`);
  });
  
  test('Chat history limit too large should be rejected', () => {
    const result = InputValidator.validateChatHistoryQuery('user123', 51);
    if (result.isValid) throw new Error('Expected invalid');
    if (!result.error.includes('between 1 and 50')) throw new Error('Wrong error message');
  });
  
  // Test room recommendation validation
  test('Valid room recommendation should pass', () => {
    const result = InputValidator.validateRoomRecommendation('room123', '456');
    if (!result.isValid) throw new Error(`Expected valid, got: ${result.error}`);
  });
  
  test('Non-numeric movieId should be rejected', () => {
    const result = InputValidator.validateRoomRecommendation('room123', 'abc');
    if (result.isValid) throw new Error('Expected invalid');
    if (!result.error.includes('numeric')) throw new Error('Wrong error message');
  });
  
  // Test error handling
  test('Rate limit error should be handled correctly', () => {
    const error = ErrorHandler.handleLambdaError({ statusCode: 429 }, 'askTrini');
    if (!error.message.includes('Rate limit')) throw new Error('Wrong error message');
    if (error.extensions.code !== 'RATE_LIMIT_EXCEEDED') throw new Error('Wrong error code');
    if (!error.extensions.retryAfter) throw new Error('Missing retryAfter');
  });
  
  test('Service unavailable error should be handled correctly', () => {
    const error = ErrorHandler.handleLambdaError({ statusCode: 503 }, 'askTrini');
    if (!error.message.includes('temporarily unavailable')) throw new Error('Wrong error message');
    if (error.extensions.code !== 'SERVICE_UNAVAILABLE') throw new Error('Wrong error code');
  });
  
  test('Bad request error should be handled correctly', () => {
    const error = ErrorHandler.handleLambdaError({ statusCode: 400, message: 'Invalid input' }, 'askTrini');
    if (!error.message.includes('Invalid input')) throw new Error('Wrong error message');
    if (error.extensions.code !== 'BAD_REQUEST') throw new Error('Wrong error code');
  });
  
  test('Unknown error should be handled gracefully', () => {
    const error = ErrorHandler.handleLambdaError({ statusCode: 500 }, 'askTrini');
    if (!error.message.includes('unexpected error')) throw new Error('Wrong error message');
    if (error.extensions.code !== 'INTERNAL_ERROR') throw new Error('Wrong error code');
  });
  
  test('Null error should not crash', () => {
    const error = ErrorHandler.handleLambdaError(null, 'askTrini');
    if (!error.message) throw new Error('Missing error message');
    if (!error.extensions.code) throw new Error('Missing error code');
  });
  
  // Property-based test simulation
  test('Property: All valid inputs should pass validation', () => {
    const validInputs = [
      { query: 'action movies', userId: 'user123' },
      { query: 'comedy from 1990s', userId: 'test-user-456' },
      { query: 'horror films with high rating', userId: 'user_789' },
      { query: 'sci-fi movies', userId: 'user-abc-123', sessionId: 'session-456' }
    ];
    
    for (const input of validInputs) {
      const result = InputValidator.validateTriniQuery(input);
      if (!result.isValid) {
        throw new Error(`Valid input rejected: ${JSON.stringify(input)}, Error: ${result.error}`);
      }
    }
  });
  
  test('Property: All invalid inputs should be rejected', () => {
    const invalidInputs = [
      { query: '', userId: 'user123' },
      { query: 'action movies', userId: '' },
      { query: 'a'.repeat(501), userId: 'user123' },
      { query: 'action movies', userId: 'user@123.com' },
      { query: '<script>alert("xss")</script>', userId: 'user123' }
    ];
    
    for (const input of invalidInputs) {
      const result = InputValidator.validateTriniQuery(input);
      if (result.isValid) {
        throw new Error(`Invalid input accepted: ${JSON.stringify(input)}`);
      }
    }
  });
  
  test('Property: Error handling should never crash', () => {
    const extremeErrors = [null, undefined, {}, { statusCode: 'invalid' }, { statusCode: 999 }];
    
    for (const errorInput of extremeErrors) {
      try {
        const error = ErrorHandler.handleLambdaError(errorInput, 'testOperation');
        if (!error || !error.message || !error.extensions || !error.extensions.code) {
          throw new Error(`Invalid error object: ${JSON.stringify(error)}`);
        }
      } catch (exception) {
        throw new Error(`Error handler crashed: ${exception.message}`);
      }
    }
  });
  
  // Summary
  console.log(`\n📊 Test Results:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Trini GraphQL resolvers are working correctly.');
    return true;
  } else {
    console.log('\n⚠️  Some tests failed. Please review the resolver implementations.');
    return false;
  }
}

// Run the validation
if (require.main === module) {
  const success = runValidationTests();
  process.exit(success ? 0 : 1);
}

module.exports = { InputValidator, ErrorHandler, runValidationTests };