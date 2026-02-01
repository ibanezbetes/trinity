# Design Document

## Overview

This design addresses two critical bugs in the Trinity movie voting application that were discovered during physical device testing. The bugs involve incorrect TV shows filtering (Bug 1) and race conditions in match detection (Bug 2). The solution involves fixing TMDB API endpoint routing, implementing proper genre mapping, and enhancing concurrent vote processing with atomic operations.

## Architecture

The fix involves modifications to three core Lambda functions:

1. **trinity-room-dev**: Fix mediaType parameter propagation during room creation
2. **trinity-cache-dev**: Ensure correct TMDB endpoint selection for content caching  
3. **trinity-vote-dev**: Implement atomic vote processing and graceful match handling

The architecture maintains the existing serverless design while adding robust error handling and data consistency mechanisms.

## Components and Interfaces

### Enhanced TMDB Client

**Location**: `lambdas/trinity-room-dev/services/enhanced-tmdb-client.js` and `lambdas/trinity-movie-dev/services/enhanced-tmdb-client.js`

**Current Issue**: The `discoverContent` method correctly constructs the endpoint path but the mediaType parameter may not be properly validated or propagated in all code paths.

**Enhanced Interface**:
```javascript
class EnhancedTMDBClient {
  async discoverContent(params) {
    // CRITICAL FIX: Strict mediaType validation
    if (!params.mediaType || !['MOVIE', 'TV'].includes(params.mediaType)) {
      throw new Error(`Invalid mediaType: ${params.mediaType}. Must be 'MOVIE' or 'TV'`);
    }
    
    // CRITICAL FIX: Correct endpoint selection
    const endpoint = params.mediaType === 'MOVIE' ? '/discover/movie' : '/discover/tv';
    
    // CRITICAL FIX: Genre validation for target endpoint
    if (params.withGenres) {
      await this.validateGenresForMediaType(params.withGenres, params.mediaType);
    }
    
    // Existing implementation continues...
  }
  
  async validateGenresForMediaType(genreIds, mediaType) {
    // Validate that genre IDs are appropriate for the target media type
    // Some genres exist in both movies and TV, others are specific
  }
}
```

### Content Filter Service

**Location**: `lambdas/trinity-room-dev/services/content-filter-service.js`

**Current Issue**: May not properly validate that returned content matches the requested mediaType.

**Enhanced Validation**:
```javascript
class ContentFilterService {
  async createFilteredRoom(criteria) {
    // CRITICAL FIX: Strict content type validation
    const results = await this.tmdbClient.discoverContent(criteria);
    
    // CRITICAL FIX: Post-processing validation
    const validatedResults = results.filter(item => {
      if (criteria.mediaType === 'MOVIE' && item.title) return true;
      if (criteria.mediaType === 'TV' && item.name) return true;
      
      console.warn(`Filtering out invalid ${criteria.mediaType} item:`, item.id);
      return false;
    });
    
    return validatedResults;
  }
}
```

### Vote Processing Service

**Location**: `lambdas/trinity-vote-dev/vote.js`

**Current Issue**: Race conditions occur when multiple users vote simultaneously, causing blocking errors instead of graceful match detection.

**Enhanced Vote Processing**:
```javascript
async function processVote(userId, roomId, movieId, voteType) {
  // CRITICAL FIX: Check room status FIRST with consistent read
  const roomStatus = await getRoomStatusConsistent(roomId);
  
  if (roomStatus === 'MATCHED') {
    // CRITICAL FIX: Return match info instead of throwing error
    const matchInfo = await getExistingMatchInfo(roomId);
    return {
      success: true,
      matchFound: true,
      matchInfo,
      message: `Match already found: ${matchInfo.movieTitle}`
    };
  }
  
  // CRITICAL FIX: Atomic vote recording with conditional writes
  await recordVoteAtomically(userId, roomId, movieId, voteType);
  
  // CRITICAL FIX: Atomic match detection
  const matchResult = await checkAndUpdateMatchAtomically(roomId, movieId);
  
  return matchResult;
}
```

## Data Models

### Room Status Management

**Enhanced Room Model**:
```javascript
{
  PK: roomId,
  SK: 'ROOM',
  status: 'WAITING' | 'ACTIVE' | 'MATCHED' | 'NO_CONSENSUS',
  mediaType: 'MOVIE' | 'TV', // CRITICAL: Strict validation
  genreIds: [number], // Validated for mediaType compatibility
  resultMovieId: string, // Set when status becomes 'MATCHED'
  matchedAt: string, // ISO timestamp when match occurred
  version: number // For optimistic locking
}
```

### Vote Tracking Model

**Enhanced Vote Model**:
```javascript
{
  roomId: string,
  'userId#movieId': string, // Composite sort key
  userId: string,
  movieId: string,
  voteType: 'LIKE' | 'DISLIKE',
  votedAt: string,
  version: number // For conflict detection
}
```

### Match Aggregation Model

**Enhanced Match Model**:
```javascript
{
  roomId: string,
  movieId: string,
  votes: number, // Atomic counter
  voterIds: Set<string>, // Track who voted
  createdAt: string,
  updatedAt: string,
  version: number // For atomic updates
}
```

## Error Handling

### TMDB API Error Handling

**Content Type Validation Errors**:
- Invalid mediaType parameters → Immediate validation error with clear message
- Mixed content in responses → Filter and log warnings, continue with valid items
- Genre ID mismatches → Map or validate genres, provide fallback options

**Rate Limiting and Network Errors**:
- Implement exponential backoff for TMDB API calls
- Provide cached fallback content when API is unavailable
- Log detailed error information for debugging

### Vote Processing Error Handling

**Race Condition Handling**:
```javascript
try {
  await updateRoomStatusAtomically(roomId, 'MATCHED', movieId);
} catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    // Another user already triggered the match
    const existingMatch = await getExistingMatchInfo(roomId);
    return {
      success: true,
      matchFound: true,
      matchInfo: existingMatch,
      message: `Match found by another user: ${existingMatch.movieTitle}`
    };
  }
  throw error; // Re-throw unexpected errors
}
```

**Concurrent Vote Handling**:
- Use DynamoDB conditional writes to prevent duplicate votes
- Implement atomic counters for vote tallying
- Return existing match information instead of errors when room is already matched

## Testing Strategy

### Unit Testing

**TMDB Client Testing**:
- Test endpoint selection for different mediaType values
- Test genre validation for movies vs TV shows
- Test error handling for invalid parameters
- Test content type validation in responses

**Vote Processing Testing**:
- Test atomic vote recording with concurrent operations
- Test match detection with simultaneous votes
- Test error handling for already-matched rooms
- Test vote counting accuracy under load

### Property-Based Testing

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, I've identified the following correctness properties after eliminating redundancy:

**Property 1: TMDB Endpoint Selection Consistency**
*For any* room creation or content caching request with a specified mediaType, the system should use the corresponding TMDB discover endpoint (/discover/movie for 'MOVIE', /discover/tv for 'TV') and never mix endpoints within the same operation
**Validates: Requirements 1.1, 3.1, 3.2, 3.4**

**Property 2: Content Type Validation Integrity**  
*For any* content returned by the system, all items should match the requested mediaType (TV shows have 'name' field, movies have 'title' field) and any mismatched content should be filtered out and replaced
**Validates: Requirements 1.3, 1.4, 6.2, 6.4, 7.1, 7.2, 7.4**

**Property 3: Genre Mapping Correctness**
*For any* genre IDs used with a specific mediaType, the system should validate or map the genre IDs to ensure they are appropriate for the target TMDB endpoint
**Validates: Requirements 1.2, 3.5, 7.3**

**Property 4: Match Response Structure Consistency**
*For any* vote operation against a room with status 'MATCHED', the system should return a successful response containing match details and never throw GraphQL errors
**Validates: Requirements 2.2, 2.3, 5.2, 5.5**

**Property 5: Atomic State Management**
*For any* concurrent operations that modify room state or vote counts, the system should use atomic operations (conditional writes, atomic counters) to ensure data consistency and prevent race conditions
**Validates: Requirements 4.1, 4.3, 8.2, 8.4, 8.5**

**Property 6: Concurrent Vote Processing**
*For any* set of concurrent votes on the same content, the system should process them atomically such that vote counts are accurate and only one operation can trigger a room status change to 'MATCHED'
**Validates: Requirements 2.4, 4.4, 4.5**

**Property 7: Room Status Check Priority**
*For any* vote processing operation, the system should check room status before processing the vote and use consistent reads to ensure current state
**Validates: Requirements 2.1, 8.1**

**Property 8: Error Suppression for Matched Rooms**
*For any* operation against a room with 'MATCHED' status, the system should suppress technical errors and resolve conflicts internally without user-facing errors
**Validates: Requirements 5.1, 5.3**

**Property 9: MediaType Validation**
*For any* room creation request, the system should validate that mediaType is exactly 'MOVIE' or 'TV' and reject any other values
**Validates: Requirements 6.1**

**Property 10: Content Consistency Throughout Session**
*For any* user session within a room, all content served should maintain the same mediaType as specified during room creation
**Validates: Requirements 6.3**

**Property 11: Fallback Content Type Preservation**
*For any* fallback scenario where primary content loading fails, all fallback content should maintain the same mediaType as originally requested
**Validates: Requirements 1.5**

**Property 12: Match Detection Atomicity**
*For any* match detection operation, the system should verify match conditions and update room status atomically to prevent inconsistent states
**Validates: Requirements 8.3**

### Dual Testing Approach

**Unit Tests**: Focus on specific examples, edge cases, and error conditions:
- Test specific TMDB API endpoint calls with known mediaType values
- Test genre ID validation with known valid/invalid combinations  
- Test vote processing with pre-configured room states
- Test error handling with specific failure scenarios
- Test integration points between Lambda functions

**Property Tests**: Verify universal properties across all inputs:
- Generate random mediaType values and verify endpoint selection
- Generate random content responses and verify type consistency
- Generate concurrent vote scenarios and verify atomic processing
- Generate random room states and verify consistent behavior
- Run minimum 100 iterations per property test

**Property Test Configuration**:
- Use appropriate property-based testing library (fast-check for JavaScript)
- Configure each test to run minimum 100 iterations due to randomization
- Tag each property test with format: **Feature: trinity-critical-bug-fixes, Property {number}: {property_text}**
- Each correctness property must be implemented by a single property-based test
- Property tests should focus on comprehensive input coverage through randomization
- Unit tests should focus on specific examples that demonstrate correct behavior

The combination of unit tests and property tests provides comprehensive coverage where unit tests catch concrete bugs and property tests verify general correctness across the input space.