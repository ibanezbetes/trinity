# Requirements Document

## Introduction

This specification addresses two critical bugs discovered during physical device testing of the Trinity movie voting application. These bugs prevent correct content filtering (TV Shows vs Movies) and cause user-facing blocking errors during concurrent voting scenarios. These issues must be resolved to ensure a stable release.

## Glossary

- **System**: The Trinity movie voting application backend
- **TMDB_API**: The Movie Database API service for content discovery
- **Cache_Service**: The trinity-cache-dev Lambda function managing room-based movie caching
- **Vote_Service**: The trinity-vote-dev Lambda function managing user voting
- **Room_Service**: The trinity-room-dev Lambda function managing room creation
- **Media_Type**: Content classification as either 'MOVIE' or 'TV' (exclusive selection)
- **Genre_Mapping**: The translation of Genre IDs between Movie and TV contexts (as TMDB uses different IDs for similar genres)
- **Match_Payload**: A specific success response structure containing match details instead of an error
- **Race_Condition**: Concurrent access scenario where multiple users attempt operations simultaneously

## Requirements

### Requirement 1: TV Shows Content Filtering & Genre Mapping

**User Story:** As a user, when I select "Series" and specific genres, I want to see only TV shows relevant to those genres, ensuring the system uses the correct TMDB metadata and IDs.

#### Acceptance Criteria

1. WHEN a user selects "Series" as content type, THE System SHALL query TMDB's /discover/tv endpoint exclusively
2. WHEN processing genre filters for TV, THE System SHALL validate or map Genre IDs to ensure they correspond to TV Genres (e.g., mapping Movie 'Action' ID 28 to TV 'Action & Adventure' ID 10759)
3. WHEN the Cache_Service generates content, THE System SHALL store exactly 50 items that are strictly of type 'TV'
4. WHEN the mediaType parameter is set to 'TV', THE System SHALL never return movie content in the same response
5. WHEN fallback content is needed (if filters are too strict), THE System SHALL ensure fallback items are also 'TV' type

### Requirement 2: Match Detection Response Handling

**User Story:** As a user in a multi-person room, if a match is found by someone else while I am voting, I want to be notified of that match immediately instead of seeing a blocking error message.

#### Acceptance Criteria

1. WHEN processing a voteMovie mutation, THE Vote_Service SHALL first check the Room Status
2. IF the Room Status is already 'MATCHED', THE Vote_Service SHALL NOT throw a GraphQL Error (preventing the "Room not available" popup)
3. INSTEAD, if the room is 'MATCHED', THE Vote_Service SHALL return a successful response that includes the match object details
4. WHEN concurrent votes occur, THE System SHALL process them atomically to ensure only one "winning vote" triggers the status change
5. The Mobile App SHALL be able to interpret this specific response payload as a trigger to display the Match Celebration screen immediately

### Requirement 3: TMDB API Endpoint Routing

**User Story:** As a system administrator, I want the API calls to use correct TMDB endpoints, so that content filtering works as designed.

#### Acceptance Criteria

1. WHEN mediaType is 'MOVIE', THE System SHALL use the /discover/movie TMDB endpoint exclusively
2. WHEN mediaType is 'TV', THE System SHALL use the /discover/tv TMDB endpoint exclusively
3. WHEN constructing TMDB API URLs, THE System SHALL validate mediaType parameter propagation
4. WHEN caching content, THE System SHALL verify endpoint selection matches the requested media type
5. WHEN genre parameters are used, THE System SHALL verify they exist in the target endpoint's genre list

### Requirement 4: Concurrent Vote Processing

**User Story:** As a developer, I want vote processing to handle concurrent access safely using atomic operations.

#### Acceptance Criteria

1. WHEN multiple users vote on the same movie simultaneously, THE Vote_Service SHALL process votes atomically using DynamoDB Conditional Writes
2. WHEN checking for existing matches, THE System SHALL use consistent read operations
3. WHEN updating room status to 'MATCHED', THE System SHALL use ConditionExpression to prevent overwriting existing states
4. WHEN vote counting occurs, THE System SHALL ensure accurate tallies despite concurrent operations
5. WHEN a race condition is detected, THE System SHALL prioritize returning the existing match over the new vote

### Requirement 5: Error Suppression & UX Improvement

**User Story:** As a user, I want to receive helpful feedback, so that I understand what happened when voting seems to fail due to a match.

#### Acceptance Criteria

1. WHEN a match has already been found, THE System SHALL suppress technical errors regarding room availability
2. WHEN a vote is rejected due to a Match, THE System SHALL return a structured payload indicating VOTE_IGNORED_MATCH_FOUND
3. WHEN concurrent operations conflict, THE System SHALL resolve the conflict internally without alerting the user
4. WHEN system errors occur (actual failures), THE System SHALL provide user-friendly messages
5. WHEN the room status is 'MATCHED', any subsequent vote attempt must return the match details successfully

### Requirement 6: Content Type Validation

**User Story:** As a system architect, I want strict content type validation, so that mixed content never appears in filtered rooms.

#### Acceptance Criteria

1. WHEN processing room creation requests, THE System SHALL validate mediaType is either 'MOVIE' or 'TV'
2. WHEN caching content for rooms, THE System SHALL verify all cached items match the specified mediaType
3. WHEN serving content to users, THE System SHALL ensure content type consistency throughout the user session
4. IF a 'movie' item is detected in a 'TV' cache generation, it MUST be discarded and replaced
5. WHEN content validation fails, THE System SHALL log detailed information for debugging

### Requirement 7: Cache System Integration

**User Story:** As a system designer, I want the cache system to work correctly with both content types, so that TV shows and movies are handled properly.

#### Acceptance Criteria

1. WHEN creating room caches for TV content, THE Cache_Service SHALL store only television series
2. WHEN creating room caches for movie content, THE Cache_Service SHALL store only movies
3. WHEN the cache system calls TMDB APIs, THE System SHALL use the correct discover endpoint and genre IDs for the mediaType
4. WHEN cache validation occurs, THE System SHALL verify content type consistency across all cached items

### Requirement 8: Vote Processing State Management

**User Story:** As a backend developer, I want vote processing to manage room state correctly, so that race conditions don't corrupt data.

#### Acceptance Criteria

1. WHEN checking room status before voting, THE Vote_Service SHALL use the most current room state from DynamoDB
2. WHEN updating vote counts, THE System SHALL use atomic increment operations
3. WHEN detecting matches, THE System SHALL verify match conditions atomically
4. WHEN updating room status to 'MATCHED', THE System SHALL prevent concurrent status changes
5. WHEN vote processing completes, THE System SHALL ensure all state changes are committed consistently