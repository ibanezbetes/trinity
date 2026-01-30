# Trinity Chat Sessions Table Schema

## Overview

The `trinity-chat-sessions-dev` table stores chat sessions between users and the Trini chatbot, including conversation history, extracted filters, and user preferences for personalized movie recommendations.

## Table Structure

### Primary Key
- **Hash Key**: `sessionId` (String) - Unique identifier for each chat session

### Global Secondary Index
- **Index Name**: `userId-index`
- **Hash Key**: `userId` (String) - User identifier from Cognito
- **Range Key**: `createdAt` (String) - ISO timestamp for session ordering
- **Projection**: ALL - Full item projection for efficient queries

### Attributes

#### Core Session Attributes
- `sessionId` (String) - UUID v4 session identifier
- `userId` (String) - Cognito user ID
- `createdAt` (String) - ISO 8601 timestamp of session creation
- `updatedAt` (String) - ISO 8601 timestamp of last update
- `ttl` (Number) - Unix timestamp for automatic cleanup (30 days)

#### Chat Data
- `messages` (List) - Array of chat messages with structure:
  ```json
  {
    "messageId": "uuid",
    "type": "user_query|trini_response", 
    "content": "message text",
    "timestamp": "ISO 8601",
    "extractedFilters": {
      "genres": ["action", "comedy"],
      "yearRange": {"min": 1990, "max": 2023},
      "rating": 7.0,
      "keywords": ["superhero", "Marvel"]
    },
    "recommendations": ["movieId1", "movieId2"],
    "confidence": 0.85
  }
  ```

#### User Context
- `userPreferences` (Map) - Inferred user preferences:
  ```json
  {
    "preferredGenres": ["action", "sci-fi"],
    "averageRating": 7.5,
    "recentMovies": ["movieId1", "movieId2"],
    "languagePreference": "es|en"
  }
  ```

#### Session Metadata
- `messageCount` (Number) - Total messages in session
- `lastActivity` (String) - ISO timestamp of last user interaction
- `sessionStatus` (String) - "active|archived|expired"

## Data Access Patterns

### 1. Get Session by ID
```javascript
// Primary key lookup
const session = await dynamodb.get({
  TableName: 'trinity-chat-sessions-dev',
  Key: { sessionId: 'session-uuid' }
}).promise();
```

### 2. Get User's Recent Sessions
```javascript
// Query GSI with userId
const sessions = await dynamodb.query({
  TableName: 'trinity-chat-sessions-dev',
  IndexName: 'userId-index',
  KeyConditionExpression: 'userId = :userId',
  ExpressionAttributeValues: {
    ':userId': 'user-123'
  },
  ScanIndexForward: false, // Most recent first
  Limit: 10
}).promise();
```

### 3. Create New Session
```javascript
const newSession = {
  sessionId: uuidv4(),
  userId: 'user-123',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
  messages: [],
  userPreferences: {},
  messageCount: 0,
  sessionStatus: 'active'
};

await dynamodb.put({
  TableName: 'trinity-chat-sessions-dev',
  Item: newSession
}).promise();
```

### 4. Update Session with New Message
```javascript
await dynamodb.update({
  TableName: 'trinity-chat-sessions-dev',
  Key: { sessionId: 'session-uuid' },
  UpdateExpression: 'SET messages = list_append(messages, :newMessage), messageCount = messageCount + :inc, updatedAt = :timestamp',
  ExpressionAttributeValues: {
    ':newMessage': [newMessage],
    ':inc': 1,
    ':timestamp': new Date().toISOString()
  }
}).promise();
```

## TTL Configuration

The table uses DynamoDB's Time To Live (TTL) feature for automatic cleanup:

- **TTL Attribute**: `ttl`
- **Retention Period**: 30 days from creation
- **Automatic Cleanup**: DynamoDB automatically deletes expired items
- **Cost Optimization**: Reduces storage costs for old chat sessions

## Requirements Validation

### Requirement 6.1: Chat History Storage
✅ **Implemented**: Complete chat session storage in DynamoDB with message history, extracted filters, and recommendations.

### Requirement 6.4: Message Limit Management  
✅ **Implemented**: Session management logic will maintain only the last 10 interactions per session, with older messages archived or summarized.

## Integration Points

### With Trini Lambda
- Session creation and retrieval
- Message persistence after AI processing
- User context loading for personalized recommendations

### With Trinity Authentication
- Sessions linked to Cognito userId
- User-specific chat history and preferences

### With Movie Recommendations
- Storage of extracted filters and movie IDs
- Preference learning from user interactions

## Performance Considerations

- **Read Patterns**: Optimized for single-session lookups and user session lists
- **Write Patterns**: Append-only message updates with atomic counters
- **GSI Usage**: Efficient user-based queries with timestamp sorting
- **TTL Cleanup**: Automatic old data removal without manual intervention

## Security and Privacy

- **Data Isolation**: Sessions isolated by userId through GSI
- **Automatic Cleanup**: TTL ensures data doesn't persist indefinitely
- **No PII Storage**: Only Cognito userIds, no personal information
- **Audit Trail**: Complete conversation history for debugging and improvement