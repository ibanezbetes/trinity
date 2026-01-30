# trinity-ai-dev

## Configuración
- **Runtime**: nodejs18.x
- **Handler**: ai.handler
- **Timeout**: 30s
- **Memory**: 512MB
- **Última modificación**: 2026-01-26T22:58:51.000+0000

# Trinity AI Assistant (trinity-ai-dev)

## Overview

Trinity AI Assistant "Trini" is a sophisticated movie recommendation system powered by the Qwen2.5-1.5B-Instruct language model via OpenAI SDK + HuggingFace Serverless. This Lambda function provides intelligent, conversational movie recommendations with proper JSON parsing, OpenAI-compatible protocol implementation, TMDB verification, and persona guardrails.

## Architecture

### Current Enhanced Architecture (January 30, 2026)

The system implements a robust, multi-layered architecture designed for reliability and performance:

```
Mobile Client → GraphQL API → trinity-ai-dev Lambda
                                      ↓
                              ┌─────────────────┐
                              │   AI Service    │ ← OpenAI SDK + HF Serverless
                              │ (Qwen2.5-1.5B) │   + Structured Prompts
                              └─────────────────┘
                                      ↓
                              ┌─────────────────┐
                              │ Resilient JSON  │ ← Regex Fallback
                              │     Parser      │   + Error Recovery
                              └─────────────────┘
                                      ↓
                              ┌─────────────────┐
                              │ Intent Classifier│ ← Persona Guardrails
                              │ & Persona Logic │   + Off-topic Detection
                              └─────────────────┘
                                      ↓
                              ┌─────────────────┐
                              │ TMDB Verification│ ← Parallel Processing
                              │    Service      │   + Fuzzy Matching
                              └─────────────────┘
                                      ↓
                              ┌─────────────────┐
                              │ Fallback Engine │ ← Graceful Degradation
                              │ & Error Handler │   + Static Recommendations
                              └─────────────────┘
```

### Key Components

1. **AIService** (`services/aiService.js`)
   - Implements strict ChatML formatting for Salamandra-2b
   - Few-shot learning with 2-3 example interactions
   - Proper system/user/assistant message structure
   - Timeout handling (8 seconds max)

2. **ResilientJSONParser** (`utils/jsonParser.js`)
   - Direct JSON parsing with fallback strategies
   - Regex extraction for malformed responses
   - Safe fallback responses for parsing failures
   - Comprehensive error logging

3. **TMDBService** (`services/tmdbService.js`)
   - Parallel movie verification using Promise.all()
   - Fuzzy matching for AI-suggested titles
   - Silent filtering of non-existent movies
   - Metadata enrichment with posters and ratings

4. **FallbackEngine** (`services/fallbackEngine.js`)
   - Static movie recommendations for API failures
   - Persona-consistent error messages
   - Graceful degradation strategies
   - Comprehensive error recovery

5. **Monitoring & Observability**
   - Structured logging with request tracing
   - CloudWatch metrics (when permissions allow)
   - Performance timing and error tracking
   - Security compliance validation

## Configuration
- **Runtime**: nodejs18.x
- **Handler**: ai.handler
- **Timeout**: 30s
- **Memory**: 512MB
- **Last Updated**: 2026-01-29 (Phase 11 Deployment)
- **Architecture**: Enhanced with AI fixes and monitoring

## Environment Variables

### Required Variables
```json
{
  "Variables": {
    "ROOM_MATCHES_TABLE": "trinity-room-matches-dev",
    "ROOMS_TABLE": "trinity-rooms-dev-v2", 
    "MOVIES_CACHE_TABLE": "trinity-movies-cache-dev",
    "TMDB_API_KEY": "dc4dbcd2404c1ca852f8eb964add267d",
    "USERS_TABLE": "trinity-users-dev",
    "ROOM_INVITES_TABLE": "trinity-room-invites-dev-v2",
    "VOTES_TABLE": "trinity-votes-dev",
    "HUGGINGFACE_API_KEY": "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",
    "HF_API_TOKEN": "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",
    "USER_POOL_CLIENT_ID": "l08ofv6tef7dp8eorn022fqpj",
    "USER_POOL_ID": "eu-west-1_EtOx2swvP",
    "CONNECTIONS_TABLE": "trinity-connections-dev",
    "ROOM_MEMBERS_TABLE": "trinity-room-members-dev",
    "CHAT_SESSIONS_TABLE": "trinity-chat-sessions-dev"
  }
}
```

### Environment Variable Descriptions

| Variable | Purpose | Required |
|----------|---------|----------|
| `TMDB_API_KEY` | The Movie Database API key for movie verification | ✅ |
| `HUGGINGFACE_API_KEY` / `HF_API_TOKEN` | Hugging Face API token for Salamandra-2b model | ✅ |
| `CHAT_SESSIONS_TABLE` | DynamoDB table for chat session persistence | ✅ |
| `USERS_TABLE` | DynamoDB table for user data | ✅ |
| `MOVIES_CACHE_TABLE` | DynamoDB table for movie caching | ✅ |
| Other tables | Various DynamoDB tables for Trinity ecosystem | ✅ |

## API Interface

### GraphQL Operations

#### getChatRecommendations
Main recommendation endpoint for mobile client integration.

**Input:**
```graphql
{
  text: String!           # User's query text
  roomGenres: [String]    # Optional room genre preferences  
  sessionId: String       # Optional existing session ID
  userId: String!         # User ID for session tracking
}
```

**Output:**
```graphql
{
  chatResponse: String!           # Trini's conversational response
  recommendedGenres: [String!]!   # Recommended genres (max 3)
  confidence: Float!              # Confidence score (0-1)
  reasoning: String!              # Explanation of recommendations
  _metadata: {                    # Internal metadata
    processingTime: Int!
    source: String!               # "ai_tmdb_verified" | "fallback_engine" | "persona_guardrail"
    movieCount: Int!
    sessionId: String
    requestId: String
  }
}
```

#### askTrini
GraphQL mutation for direct AI interaction.

**Input:**
```graphql
input TriniQuery {
  query: String!
  userId: String!
  sessionId: String
}
```

**Output:**
```graphql
type TriniResponse {
  sessionId: String!
  message: String!
  recommendations: [MovieRecommendation!]!
  extractedFilters: ExtractedFilters
  confidence: Float!
}
```

## Features

### 🎯 Core Capabilities

1. **Intelligent Movie Recommendations**
   - Powered by Salamandra-2b language model
   - Context-aware suggestions based on user preferences
   - Genre-specific recommendations with room alignment

2. **Persona Guardrails ("La Trini")**
   - Consistent female movie critic personality
   - Spanish language responses with casual tone
   - Off-topic query detection and polite refusal
   - Cinema-focused conversations only

3. **Robust Error Handling**
   - Resilient JSON parsing with regex fallbacks
   - Graceful degradation to static recommendations
   - Comprehensive error logging and recovery

4. **TMDB Integration**
   - Real-time movie verification against The Movie Database
   - Parallel processing for optimal performance
   - Fuzzy matching for AI-suggested titles
   - Metadata enrichment with posters and ratings

5. **Chat Session Persistence**
   - DynamoDB-backed conversation history
   - 30-day TTL with automatic cleanup
   - 10-message limit per session
   - User-specific session tracking

### 🔧 Technical Features

1. **ChatML Protocol Implementation**
   - Proper `<|im_start|>` and `<|im_end|>` tokens
   - System/user/assistant message structure
   - Few-shot learning with example interactions

2. **Performance Optimization**
   - Promise.all() for parallel TMDB searches
   - Connection pooling for external APIs
   - Cold start optimization strategies
   - Response time under 5-8 seconds

3. **Security & Compliance**
   - Environment variable-based credential management
   - No hardcoded API keys or tokens
   - Secure logging (no credential exposure)
   - Request tracing and audit trails

4. **Monitoring & Observability**
   - Structured JSON logging
   - CloudWatch metrics integration
   - Performance timing and error tracking
   - Request/response correlation

## Response Formats

### Success Response (Cinema Intent)
```json
{
  "chatResponse": "¡Perfecto! He encontrado 3 películas geniales para ti...",
  "recommendedGenres": ["acción", "aventura", "thriller"],
  "confidence": 0.85,
  "reasoning": "Procesé 3 sugerencias de IA y verifiqué 3 películas en TMDB.",
  "_metadata": {
    "processingTime": 2340,
    "source": "ai_tmdb_verified",
    "movieCount": 3,
    "sessionId": "uuid-session-id",
    "requestId": "uuid-request-id",
    "timestamp": "2026-01-29T22:15:51.501Z"
  }
}
```

### Off-Topic Response (Persona Guardrail)
```json
{
  "chatResponse": "Cariño, yo de eso no entiendo, solo sé de cine. ¿Te puedo recomendar alguna película?",
  "recommendedGenres": [],
  "confidence": 0.9,
  "reasoning": "Consulta fuera del tema cinematográfico - respuesta de La Trini",
  "_metadata": {
    "processingTime": 150,
    "source": "persona_guardrail",
    "movieCount": 0,
    "sessionId": "uuid-session-id",
    "requestId": "uuid-request-id"
  }
}
```

### Fallback Response (Error Recovery)
```json
{
  "chatResponse": "Ay cariño, mi conexión neuronal va lenta hoy. ¿Me lo puedes repetir?",
  "recommendedGenres": ["drama", "comedia", "aventura"],
  "confidence": 0.6,
  "reasoning": "Fallback activado debido a: network_error",
  "_metadata": {
    "processingTime": 8000,
    "source": "fallback_engine",
    "error": "network_error",
    "movieCount": 0
  }
}
```

## Deployment
### Quick Deployment
```bash
# Using Trinity's deployment script (recommended)
node scripts/update-lambda-and-deploy/update-lambda-and-deploy.js

# Manual deployment
cd lambdas/trinity-ai-dev
zip -r function.zip . -x "*.git*" "README.md" "lambda-config.json" "PHASE*.md" "coverage/*" "tests/*"
aws lambda update-function-code --function-name trinity-ai-dev --zip-file fileb://function.zip --region eu-west-1
rm function.zip
```

### Environment Variable Update
```bash
aws lambda update-function-configuration --function-name trinity-ai-dev \
  --environment Variables="{
    TMDB_API_KEY=your_tmdb_key,
    HUGGINGFACE_API_KEY=your_hf_token,
    HF_API_TOKEN=your_hf_token,
    CHAT_SESSIONS_TABLE=trinity-chat-sessions-dev,
    USERS_TABLE=trinity-users-dev,
    MOVIES_CACHE_TABLE=trinity-movies-cache-dev
  }" --region eu-west-1
```

## Testing

### Local Testing
```bash
# Run unit tests
npm test

# Run property-based tests
npm run test:property

# Run coverage report
npm run test:coverage
```

### AWS Testing
```bash
# Test with sample event
aws lambda invoke --function-name trinity-ai-dev \
  --cli-binary-format raw-in-base64-out \
  --payload file://test-event.json \
  --region eu-west-1 response.json
```

### Sample Test Event
```json
{
  "info": {
    "fieldName": "getChatRecommendations"
  },
  "arguments": {
    "text": "Recommend me action movies",
    "roomGenres": ["action", "adventure"],
    "sessionId": null,
    "userId": "test-user-123"
  },
  "requestContext": {
    "requestId": "test-request-123"
  }
}
```

## Monitoring

### CloudWatch Logs
```bash
# View real-time logs
aws logs tail /aws/lambda/trinity-ai-dev --follow --region eu-west-1

# Filter for errors
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "ERROR" --region eu-west-1

# Filter for specific request
aws logs filter-log-events --log-group-name /aws/lambda/trinity-ai-dev \
  --filter-pattern "test-request-123" --region eu-west-1
```

### Key Metrics to Monitor
- **Trini.JSONParseFailures**: Count of regex fallback activations
- **Trini.Intent.Cinema vs Trini.Intent.Other**: Usage statistics
- **Trini.TMDB.Latency**: Time taken for parallel movie searches
- **Trini.FallbackActivated**: Count of static responses returned
- **Lambda Duration**: Overall function execution time
- **Lambda Errors**: Function-level errors and timeouts

## Troubleshooting

### Common Issues

#### 1. Empty Response Array
**Symptom**: Function returns `[]` instead of expected response
**Cause**: Wrong GraphQL field name mapping
**Solution**: Check field name in event.info.fieldName matches handler switch cases

#### 2. Environment Validation Failed
**Symptom**: "Configuration Error" response
**Cause**: Missing or invalid environment variables
**Solution**: 
```bash
# Verify environment variables
aws lambda get-function-configuration --function-name trinity-ai-dev --region eu-west-1
# Update missing variables using deployment commands above
```

#### 3. CloudWatch Permissions Error
**Symptom**: `AccessDenied: cloudwatch:PutMetricData`
**Cause**: Lambda execution role lacks CloudWatch permissions
**Solution**: Add CloudWatch permissions to Lambda execution role or disable metrics

#### 4. Hugging Face API Errors
**Symptom**: AI service failures or timeouts
**Cause**: Invalid API token or model unavailability
**Solution**:
```bash
# Test API token
curl -H "Authorization: Bearer your_token" \
  https://api-inference.huggingface.co/models/BSC-LT/salamandra-2b-instruct
```

#### 5. TMDB API Failures
**Symptom**: Movie verification failures
**Cause**: Invalid TMDB API key or rate limiting
**Solution**:
```bash
# Test TMDB API
curl "https://api.themoviedb.org/3/search/movie?api_key=your_key&query=matrix"
```

#### 6. DynamoDB Chat Session Errors
**Symptom**: Session persistence failures
**Cause**: Missing table or insufficient permissions
**Solution**: Verify table exists and Lambda has DynamoDB permissions

### Debug Mode
Enable verbose logging by setting environment variable:
```bash
aws lambda update-function-configuration --function-name trinity-ai-dev \
  --environment Variables="{...,DEBUG_MODE=true,VERBOSE_LOGGING=true}" \
  --region eu-west-1
```

### Performance Optimization

#### Cold Start Reduction
- Keep dependencies minimal
- Use connection pooling for external APIs
- Implement service initialization at module level

#### Response Time Optimization
- Use Promise.all() for parallel operations
- Implement proper timeout handling
- Cache frequently accessed data

#### Memory Usage
- Monitor max memory usage in CloudWatch
- Adjust memory allocation if needed (current: 512MB)
- Clean up large objects after use

## Security Considerations

### Credential Management
- ✅ All API keys stored in environment variables
- ✅ No hardcoded credentials in source code
- ✅ Secure logging (credentials never logged)
- ✅ Environment variable validation on startup

### Data Privacy
- Chat sessions have 30-day TTL for automatic cleanup
- No sensitive user data stored permanently
- Request/response logging excludes personal information
- Proper error handling prevents data leakage

### API Security
- Rate limiting handled by external services
- Timeout protection against hanging requests
- Input validation and sanitization
- Proper error responses without internal details

## Development

### Project Structure
```
lambdas/trinity-ai-dev/
├── ai.js                 # Main handler
├── services/             # Core services
│   ├── aiService.js      # Salamandra-2b integration
│   ├── tmdbService.js    # Movie verification
│   ├── fallbackEngine.js # Error recovery
│   ├── metricsService.js # CloudWatch metrics
│   └── loggingService.js # Structured logging
├── utils/                # Utilities
│   ├── jsonParser.js     # Resilient JSON parsing
│   └── envValidator.js   # Environment validation
├── types/                # Type definitions
│   └── interfaces.js     # Common interfaces
├── tests/                # Test suites
│   ├── *.test.js         # Unit tests
│   └── property-*.test.js # Property-based tests
└── package.json          # Dependencies
```

### Adding New Features
1. Follow existing service patterns
2. Add comprehensive error handling
3. Include unit and property-based tests
4. Update documentation
5. Test in AWS environment before deployment

### Code Quality
- ESLint configuration for consistent style
- Jest for unit testing
- fast-check for property-based testing
- Comprehensive error handling
- Structured logging throughout

## Version History

### Phase 11 (January 2026) - Current
- ✅ Enhanced AI architecture with Salamandra-2b
- ✅ Resilient JSON parsing with regex fallbacks
- ✅ ChatML protocol implementation
- ✅ TMDB verification with parallel processing
- ✅ Persona guardrails ("La Trini")
- ✅ Comprehensive monitoring and observability
- ✅ Chat session persistence
- ✅ Property-based testing implementation

### Previous Versions
- Phase 1-10: Core development and testing phases
- Legacy implementation with basic AI integration

## Support

For issues or questions:
1. Check CloudWatch logs for detailed error information
2. Verify environment variables are properly configured
3. Test external API connectivity (TMDB, Hugging Face)
4. Review troubleshooting section above
5. Check Trinity project documentation in repository root

---

**Last Updated**: January 29, 2026 - Phase 11 Deployment
**Maintainer**: Trinity Development Team
**Environment**: Development (trinity-ai-dev)
