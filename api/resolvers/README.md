# Trini GraphQL Resolvers

This directory contains the GraphQL resolver implementations for the Trini AI chatbot integration in Trinity.

## Overview

The Trini GraphQL resolvers provide the interface between the Trinity mobile app and the `trinity-trini-dev` Lambda function. They handle:

- Natural language movie queries with AI processing
- Chat session history management
- Movie recommendations with relevance scoring
- Integration with Trinity's voting room system

## Files

### `trini-resolvers.ts`
Main resolver implementations with:
- **Input validation** for all GraphQL operations
- **Error handling** with graceful degradation
- **VTL mapping templates** for AppSync integration
- **Type definitions** for all Trini-related GraphQL types

### `trini-resolvers.test.ts`
Unit tests covering:
- Input validation for all resolver types
- Error handling scenarios
- Integration flow testing
- VTL template structure validation

### `trini-resolvers-property.test.ts`
Property-based tests verifying:
- **Property 8**: GraphQL Input Validation
- **Property 9**: GraphQL Response Schema Compliance  
- **Property 10**: Error Handling Graceful Degradation

### `validate-resolvers.js`
Standalone validation script for testing resolver logic without full test framework setup.

## GraphQL Operations

### Mutations

#### `askTrini(input: TriniQuery!): TriniResponse!`
Processes natural language movie queries using AI.

**Input Validation:**
- Query: Required string, 1-500 characters, XSS protection
- UserId: Required alphanumeric string with hyphens/underscores
- SessionId: Optional string

**Error Handling:**
- Rate limiting (429) → `RATE_LIMIT_EXCEEDED`
- Invalid input (400) → `BAD_REQUEST`
- AI service down (503) → `SERVICE_UNAVAILABLE`
- Other errors (5xx) → `INTERNAL_ERROR`

#### `addTriniRecommendationToRoom(roomId: ID!, movieId: ID!): AddToRoomResponse!`
Adds a Trini-recommended movie to a voting room.

**Input Validation:**
- RoomId: Required alphanumeric string
- MovieId: Required numeric string

**Error Handling:**
- Permission denied (403) → `Forbidden`
- Room/movie not found (404) → `NotFound`

### Queries

#### `getChatHistory(userId: ID!, limit: Int = 10): [ChatSession!]!`
Retrieves user's chat session history with pagination.

**Input Validation:**
- UserId: Required alphanumeric string
- Limit: Optional number, 1-50 range

#### `getTriniRecommendations(sessionId: ID!): [MovieRecommendation!]!`
Gets movie recommendations from a specific chat session.

## VTL Mapping Templates

All resolvers use Velocity Template Language (VTL) mapping templates for AppSync integration:

### Request Template Structure
```vtl
{
  "version": "2017-02-28",
  "operation": "Invoke",
  "payload": {
    "info": {
      "fieldName": "<operation_name>"
    },
    "arguments": $util.toJson($context.arguments),
    "identity": {
      "userId": "$context.identity.sub",
      "username": "$context.identity.username"
    }
  }
}
```

### Response Template Structure
```vtl
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
```

## Security Features

### Input Sanitization
- XSS protection with pattern matching
- SQL injection prevention
- Script tag filtering
- JavaScript protocol blocking

### Rate Limiting
- 5 queries per minute per user
- Graceful error messages with retry guidance
- Automatic rate limit reset

### Authentication
- Cognito JWT token validation
- User identity context in all operations
- Permission-based room access control

## Error Handling Strategy

### Graceful Degradation
1. **AI Service Failure** → Fallback to pattern-based keyword extraction
2. **TMDB API Failure** → Use cached movie data
3. **Rate Limiting** → Clear error message with retry guidance
4. **Invalid Input** → Specific validation error messages

### Error Response Format
```json
{
  "message": "Human-readable error message",
  "extensions": {
    "code": "ERROR_CODE",
    "timestamp": "2024-01-01T10:00:00Z",
    "retryAfter": 60
  }
}
```

## Integration with Trinity

### Lambda Function
- Connects to `trinity-trini-dev` Python Lambda
- Handles AI processing and movie search coordination
- Manages chat session persistence in DynamoDB

### Database Tables
- `trinity-chat-sessions-dev`: Chat history storage
- `trinity-movies-cache-dev`: Movie data caching
- `trinity-rooms-dev-v2`: Room integration

### Mobile App Integration
- Compatible with existing Trinity GraphQL client
- Supports real-time subscriptions for room updates
- Maintains consistent error handling patterns

## Testing

### Unit Tests
Run unit tests with:
```bash
npm test -- trini-resolvers.test.ts
```

### Property Tests
Run property-based tests with:
```bash
npm test -- trini-resolvers-property.test.ts
```

### Validation Script
Run standalone validation with:
```bash
node validate-resolvers.js
```

## Deployment

The resolvers are automatically deployed as part of the Trinity CDK stack:

1. **Lambda Stack**: Deploys `trinity-trini-dev` function
2. **API Stack**: Creates AppSync data sources and resolvers
3. **Database Stack**: Sets up required DynamoDB tables

Deploy with:
```bash
cd infrastructure/clean
npm run deploy
```

## Monitoring

### CloudWatch Metrics
- Resolver execution duration
- Error rates by operation type
- Rate limiting violations
- AI service response times

### X-Ray Tracing
- End-to-end request tracing
- Lambda function performance
- DynamoDB query optimization
- External API call monitoring

## Troubleshooting

### Common Issues

1. **Rate Limit Errors**
   - Check user request frequency
   - Verify rate limiter configuration
   - Monitor CloudWatch logs

2. **AI Service Timeouts**
   - Check Hugging Face API status
   - Verify API key configuration
   - Review Lambda timeout settings

3. **Schema Validation Errors**
   - Verify GraphQL schema deployment
   - Check resolver mapping templates
   - Validate response structure

### Debug Commands
```bash
# Check resolver configuration
aws appsync get-resolver --api-id <api-id> --type-name Mutation --field-name askTrini

# View Lambda logs
aws logs tail /aws/lambda/trinity-trini-dev --follow

# Test resolver directly
aws appsync evaluate-mapping-template --template <template> --context <context>
```

## Contributing

When modifying resolvers:

1. Update input validation logic
2. Add corresponding unit tests
3. Update property tests if needed
4. Run validation script
5. Update VTL mapping templates
6. Test with actual Lambda function
7. Update documentation

## Requirements Traceability

This implementation satisfies:
- **Requirement 5.2**: GraphQL input validation and Lambda integration
- **Requirement 5.4**: Error handling for AI and TMDB service failures
- **Property 8**: GraphQL Input Validation
- **Property 9**: GraphQL Response Schema Compliance
- **Property 10**: Error Handling Graceful Degradation