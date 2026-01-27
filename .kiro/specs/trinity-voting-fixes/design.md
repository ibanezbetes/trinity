# Design Document - Trinity Voting System Fixes

## Overview

This design document outlines the comprehensive solution for fixing critical issues in the Trinity voting system. The solution addresses vote processing errors, premature completion messages, non-functional invite links, missing movie pre-caching, and genre-based filtering. The design emphasizes reliability, performance, and user experience improvements while maintaining the existing serverless architecture.

## Architecture

The solution builds upon Trinity's existing AWS serverless architecture with the following key components:

### Core Components
- **Enhanced Vote Handler**: Fixed DynamoDB key structure and improved error handling
- **Movie Cache Service**: Pre-caching system for instant movie loading
- **Deep Link Service**: Functional invite link system with web landing pages
- **Genre Filter Engine**: TMDB API integration with genre-based movie filtering
- **Real-time Notification System**: Enhanced AppSync subscriptions for live updates

### Data Flow
```
User Vote → Vote Handler → DynamoDB (fixed keys) → Real-time Broadcast → UI Update
Room Creation → Movie Pre-cache → Genre Filtering → Cache Storage → Instant Loading
Invite Generation → Deep Link Creation → Web Landing Page → App Deep Link → Room Join
```

## Components and Interfaces

### 1. Enhanced Vote Handler (Lambda)

**Purpose**: Process votes with corrected DynamoDB operations and improved error handling

**Key Fixes**:
- Corrected DynamoDB key structure: `{ PK: roomId, SK: 'ROOM' }` instead of `{ roomId }`
- Atomic vote counting with retry logic
- Proper error message formatting for users
- Enhanced Stop-on-Match algorithm with real-time notifications

**Interface**:
```typescript
interface VoteInput {
  roomId: string;
  movieId: string;
  voteType: 'LIKE' | 'DISLIKE';
}

interface VoteResult {
  success: boolean;
  roomStatus: 'ACTIVE' | 'MATCHED';
  currentVotes: number;
  totalMembers: number;
  matchFound?: boolean;
  errorMessage?: string;
}
```

### 2. Movie Pre-caching Service

**Purpose**: Pre-fetch and cache movies when rooms are created for instant loading

**Components**:
- **Cache Manager**: Handles cache population and TTL management
- **Genre Filter**: Applies genre preferences to TMDB API calls
- **Circuit Breaker**: Protects against TMDB API failures

**Interface**:
```typescript
interface MovieCacheService {
  preCacheMovies(roomId: string, genres?: string[]): Promise<CachedMovie[]>;
  getCachedMovies(roomId: string): Promise<CachedMovie[]>;
  refreshCache(roomId: string): Promise<void>;
}

interface CachedMovie {
  tmdbId: number;
  title: string;
  posterPath: string;
  overview: string;
  genres: string[];
  cachedAt: string;
  ttl: number;
}
```

### 3. Deep Link Service

**Purpose**: Generate functional invite links and handle deep link routing

**Components**:
- **Link Generator**: Creates unique invite codes and URLs
- **Web Landing Page**: Handles browser access to invite links
- **Deep Link Router**: Processes app deep links for room joining

**Interface**:
```typescript
interface DeepLinkService {
  generateInviteLink(roomId: string): Promise<InviteLink>;
  validateInviteCode(code: string): Promise<RoomInfo | null>;
  handleDeepLink(url: string): Promise<DeepLinkAction>;
}

interface InviteLink {
  code: string;
  url: string;
  expiresAt: string;
}
```

### 4. Enhanced Room Handler

**Purpose**: Improved room creation with movie pre-caching and genre preferences

**Key Enhancements**:
- Trigger movie pre-caching on room creation
- Store genre preferences in room metadata
- Generate functional invite links
- Improved error handling and user feedback

### 5. Real-time Notification System

**Purpose**: Enhanced AppSync subscriptions for live vote updates and match notifications

**Components**:
- **Vote Update Publisher**: Broadcasts vote counts in real-time
- **Match Notification Publisher**: Immediately notifies all participants of matches
- **Connection Manager**: Handles subscription lifecycle and reconnection

## Data Models

### Enhanced Room Model
```typescript
interface Room {
  PK: string;           // roomId (fixed key structure)
  SK: string;           // 'ROOM' (fixed key structure)
  roomId: string;       // Backward compatibility
  name: string;
  hostId: string;
  status: 'WAITING' | 'ACTIVE' | 'MATCHED' | 'COMPLETED';
  genrePreferences: string[];  // New field
  movieCacheKey: string;       // New field
  inviteCode: string;
  inviteUrl: string;           // New field
  resultMovieId?: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}
```

### Movie Cache Model
```typescript
interface MovieCache {
  cacheKey: string;     // PK: roomId or genre-based key
  movies: CachedMovie[];
  genreFilters: string[];
  cachedAt: string;
  ttl: number;          // 24-hour expiration
}
```

### Vote Model (Fixed Keys)
```typescript
interface Vote {
  roomId: string;       // PK (fixed)
  movieId: string;      // SK (fixed)
  votes: number;
  createdAt: string;
  updatedAt: string;
}
```

### User Vote Tracking (Duplicate Prevention)
```typescript
interface UserVote {
  userId: string;       // PK
  roomMovieId: string;  // SK: `${roomId}_${movieId}`
  roomId: string;
  movieId: string;
  voteType: 'LIKE';
  votedAt: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Vote Processing Reliability
*For any* valid room and movie combination, when a user submits a vote, the system should process it without DynamoDB key errors and increment the vote counter atomically
**Validates: Requirements 1.1, 1.2**

### Property 2: Stop-on-Match Algorithm Correctness
*For any* room with known member count, when all members vote "YES" for the same movie, the system should trigger the Stop-on-Match algorithm and update room status to "MATCHED"
**Validates: Requirements 1.3, 1.4**

### Property 3: Progress Tracking Accuracy
*For any* voting session, when a user votes "NO" on a movie, the system should advance to the next movie without showing completion messages, and progress indicators should reflect actual position in the queue
**Validates: Requirements 2.1, 2.4**

### Property 4: Completion Detection Correctness
*For any* movie queue, when a user reaches the actual end of the queue, the system should display the completion message exactly once
**Validates: Requirements 2.2**

### Property 5: Error Recovery Behavior
*For any* movie loading failure, the system should automatically skip to the next movie and continue the voting process
**Validates: Requirements 2.5**

### Property 6: Invite Code Uniqueness
*For any* set of generated invite codes, all codes should be unique, exactly 6 characters long, and follow the specified format
**Validates: Requirements 3.1**

### Property 7: Deep Link URL Format
*For any* generated invite link, the URL should follow the format "https://trinity.app/room/{inviteCode}" and be functional
**Validates: Requirements 3.2, 7.1**

### Property 8: Movie Pre-caching Behavior
*For any* newly created room, the system should pre-fetch and cache 20-50 movie titles from TMDB API within 30 seconds
**Validates: Requirements 4.1**

### Property 9: Genre Filtering Consistency
*For any* room with specified genres, all cached movies should belong to at least one of the specified genres
**Validates: Requirements 4.2, 5.2**

### Property 10: Cache TTL Management
*For any* cached movie data, the TTL should be set to exactly 24 hours from cache creation time
**Validates: Requirements 4.3**

### Property 11: Cache Utilization
*For any* voting session with populated cache, the system should serve movies from cache rather than making real-time API calls
**Validates: Requirements 4.4**

### Property 12: Circuit Breaker Fallback
*For any* TMDB API failure, the circuit breaker should activate and the system should serve cached content or default movies
**Validates: Requirements 4.5, 9.2**

### Property 13: Default Genre Behavior
*For any* room with no specified genres, the system should default to popular movies across all genres
**Validates: Requirements 5.3**

### Property 14: AI Genre Integration
*For any* AI recommendation request, the system should include room genre preferences in the AI context
**Validates: Requirements 6.1, 6.2**

### Property 15: AI Response Completeness
*For any* AI recommendation response, the system should include confidence scores and reasoning metadata
**Validates: Requirements 6.4**

### Property 16: AI Fallback Behavior
*For any* AI service failure, the system should fall back to genre-based TMDB API recommendations
**Validates: Requirements 6.5**

### Property 17: Real-time Vote Broadcasting
*For any* vote submission, the system should broadcast vote updates to all room participants via AppSync subscriptions within 2 seconds
**Validates: Requirements 8.1**

### Property 18: Match Notification Delivery
*For any* match found event, the system should immediately notify all participants with complete match details
**Validates: Requirements 8.3**

### Property 19: State Synchronization
*For any* reconnection event, the system should sync the latest room state and vote counts accurately
**Validates: Requirements 8.5**

### Property 20: Retry Logic Compliance
*For any* DynamoDB operation failure, the system should retry with exponential backoff up to exactly 3 times
**Validates: Requirements 9.1**

### Property 21: Operation Queuing
*For any* poor network conditions, the system should queue operations and retry them when connection improves
**Validates: Requirements 9.4**

### Property 22: Error Logging Dual Behavior
*For any* critical error, the system should log detailed debugging information while showing simple, user-friendly messages
**Validates: Requirements 9.5**

### Property 23: Movie Pre-loading
*For any* voting session start, the system should pre-load the next 3 movies in the background
**Validates: Requirements 10.1**

### Property 24: Pre-loaded Content Utilization
*For any* user vote, the system should immediately show the next pre-loaded movie without loading delays
**Validates: Requirements 10.2**

### Property 25: Pre-loading Fallback
*For any* pre-loading failure, the system should fall back to on-demand loading with appropriate loading indicators
**Validates: Requirements 10.3**

### Property 26: Image Caching
*For any* loaded movie image, the system should cache it locally for offline viewing
**Validates: Requirements 10.4**

## Error Handling

### DynamoDB Error Recovery
- **Key Structure Errors**: Fixed by using correct `{ PK, SK }` format
- **Atomic Operation Failures**: Retry with exponential backoff (100ms, 200ms, 400ms)
- **Conditional Check Failures**: Handle race conditions gracefully with re-attempts

### TMDB API Error Handling
- **Circuit Breaker States**: CLOSED → OPEN → HALF_OPEN with 30-second timeout
- **Rate Limiting**: Respect API limits with request queuing
- **Fallback Strategy**: Cached content → Default movies → Error message

### Real-time Connection Errors
- **Subscription Failures**: Automatic reconnection with exponential backoff
- **Message Delivery Failures**: Queue messages and retry on reconnection
- **State Synchronization**: Full state refresh on reconnection

### User-Facing Error Messages
- **Vote Errors**: "Unable to register vote. Please try again."
- **Loading Errors**: "Having trouble loading movies. Using cached content."
- **Connection Errors**: "Connection lost. Attempting to reconnect..."

## Testing Strategy

### Dual Testing Approach
The testing strategy combines unit tests for specific scenarios with property-based tests for comprehensive coverage:

**Unit Tests**:
- Specific error scenarios (invalid invite codes, expired caches)
- Edge cases (empty movie lists, single-member rooms)
- Integration points (TMDB API responses, AppSync subscriptions)
- User interface interactions (completion messages, error displays)

**Property-Based Tests**:
- Universal properties across all inputs (vote processing, cache behavior)
- Comprehensive input coverage through randomization (room configurations, movie data)
- Concurrency testing (simultaneous votes, cache operations)
- Error injection testing (API failures, network issues)

**Property Test Configuration**:
- Minimum 100 iterations per property test
- Each property test references its design document property
- Tag format: **Feature: trinity-voting-fixes, Property {number}: {property_text}**

**Testing Libraries**:
- **Jest** for unit testing framework
- **fast-check** for property-based testing in TypeScript
- **AWS SDK mocks** for DynamoDB and AppSync testing
- **MSW** for TMDB API mocking

### Key Test Scenarios

**Vote Processing Tests**:
- Concurrent votes from multiple users
- Vote processing with various room states
- DynamoDB key structure validation
- Stop-on-Match algorithm triggering

**Caching Tests**:
- Cache population on room creation
- Genre filtering accuracy
- TTL expiration behavior
- Cache fallback scenarios

**Deep Link Tests**:
- Invite code generation uniqueness
- URL format validation
- Deep link routing accuracy
- Error handling for invalid codes

**Real-time Tests**:
- Subscription message delivery
- Connection loss and recovery
- State synchronization accuracy
- Match notification broadcasting

The comprehensive testing approach ensures reliability across all system components while maintaining the performance and user experience improvements.