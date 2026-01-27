# Requirements Document - Trinity Voting System Fixes

## Introduction

Este documento especifica los requisitos para corregir los problemas críticos en el sistema de votación de Trinity, incluyendo errores de votación, gestión de enlaces de invitación, optimización de carga de películas y filtrado por géneros.

## Glossary

- **Trinity**: Sistema de votación colaborativa de películas
- **Vote_Handler**: Lambda function que procesa votos de usuarios
- **Room**: Sala virtual donde usuarios votan películas
- **TMDB_API**: The Movie Database API para obtener información de películas
- **Stop_on_Match**: Algoritmo que termina votación cuando todos votan "SI"
- **Circuit_Breaker**: Patrón para manejar fallos de APIs externas
- **Invite_Code**: Código único de 6 caracteres para unirse a salas
- **Deep_Link**: URL que abre directamente una sala en la aplicación

## Requirements

### Requirement 1: Fix Vote Processing Errors

**User Story:** As a user, I want to vote "YES" on movies successfully, so that I can participate in the collaborative selection process.

#### Acceptance Criteria

1. WHEN a user votes "YES" on a movie, THE Vote_Handler SHALL process the vote without DynamoDB key errors
2. WHEN the vote is processed successfully, THE Vote_Handler SHALL increment the vote counter atomically
3. WHEN all members vote "YES" for the same movie, THE Vote_Handler SHALL trigger the Stop_on_Match algorithm
4. WHEN a match is found, THE Vote_Handler SHALL update the room status to "MATCHED" and notify all participants
5. WHEN vote processing fails, THE Vote_Handler SHALL return descriptive error messages to users

### Requirement 2: Fix Premature Completion Messages

**User Story:** As a user, I want to see accurate progress feedback, so that I know when I've actually finished voting.

#### Acceptance Criteria

1. WHEN a user votes "NO" on a movie, THE System SHALL advance to the next movie without showing completion messages
2. WHEN a user reaches the actual end of the movie queue, THE System SHALL display the completion message
3. WHEN the completion message is shown, THE System SHALL provide options to view matches or return to room list
4. WHEN there are more movies to vote on, THE System SHALL show current progress (e.g., "5/20 movies")
5. WHEN loading the next movie fails, THE System SHALL skip to the following movie automatically

### Requirement 3: Implement Functional Invite Links

**User Story:** As a room creator, I want to share working invite links, so that friends can easily join my voting room.

#### Acceptance Criteria

1. WHEN a room is created, THE System SHALL generate a unique 6-character invite code
2. WHEN the invite code is generated, THE System SHALL create a functional deep link URL
3. WHEN a user clicks an invite link, THE System SHALL open the Trinity app and join the specified room
4. WHEN the app is not installed, THE System SHALL redirect to app store download pages
5. WHEN an invite code expires or is invalid, THE System SHALL show appropriate error messages

### Requirement 4: Implement Movie Pre-caching System

**User Story:** As a room creator, I want movies to load instantly during voting, so that the experience is smooth and competitive.

#### Acceptance Criteria

1. WHEN a room is created, THE System SHALL pre-fetch and cache 20-50 movie titles from TMDB_API
2. WHEN caching movies, THE System SHALL apply genre filters based on room preferences
3. WHEN the cache is populated, THE System SHALL store movie data with 24-hour TTL in DynamoDB
4. WHEN users start voting, THE System SHALL serve movies from cache for instant loading
5. WHEN cache expires or is empty, THE System SHALL fall back to real-time TMDB_API calls with Circuit_Breaker protection

### Requirement 5: Implement Genre-based Movie Filtering

**User Story:** As a room creator, I want to specify movie genres, so that only relevant movies appear in the voting queue.

#### Acceptance Criteria

1. WHEN creating a room, THE System SHALL allow selection of one or more movie genres
2. WHEN genres are selected, THE System SHALL fetch movies only from those categories via TMDB_API
3. WHEN no genres are specified, THE System SHALL default to popular movies across all genres
4. WHEN AI assistant provides recommendations, THE System SHALL consider the room's genre preferences
5. WHEN genre filtering fails, THE System SHALL fall back to popular movies with user notification

### Requirement 6: Enhance AI-powered Movie Recommendations

**User Story:** As a user, I want AI recommendations based on room preferences, so that I discover movies that match our group's taste.

#### Acceptance Criteria

1. WHEN a user interacts with the AI assistant, THE System SHALL analyze room genre preferences
2. WHEN generating recommendations, THE AI_Handler SHALL prioritize movies from selected genres
3. WHEN no genre preferences exist, THE AI_Handler SHALL ask users about their preferences
4. WHEN AI recommendations are provided, THE System SHALL include confidence scores and reasoning
5. WHEN AI service is unavailable, THE System SHALL fall back to genre-based TMDB_API recommendations

### Requirement 7: Implement Deep Link URL System

**User Story:** As a user, I want to join rooms via web links, so that I can easily access shared rooms from any platform.

#### Acceptance Criteria

1. WHEN generating invite links, THE System SHALL create URLs in format "https://trinity.app/room/{inviteCode}"
2. WHEN a web browser accesses the link, THE System SHALL display a landing page with app download options
3. WHEN the mobile app handles the deep link, THE System SHALL automatically join the specified room
4. WHEN the invite code is invalid, THE System SHALL show error page with option to browse public rooms
5. WHEN the user is not authenticated, THE System SHALL prompt for login before joining the room

### Requirement 8: Optimize Real-time Vote Updates

**User Story:** As a room participant, I want to see live vote counts, so that I know how close we are to finding a match.

#### Acceptance Criteria

1. WHEN any user votes, THE System SHALL broadcast vote updates to all room participants via AppSync subscriptions
2. WHEN vote updates are received, THE System SHALL update the UI with current vote counts and progress
3. WHEN a match is found, THE System SHALL immediately notify all participants with match details
4. WHEN connection is lost, THE System SHALL show offline indicator and attempt reconnection
5. WHEN reconnecting, THE System SHALL sync the latest room state and vote counts

### Requirement 9: Implement Robust Error Handling

**User Story:** As a user, I want clear error messages when things go wrong, so that I understand what happened and what to do next.

#### Acceptance Criteria

1. WHEN DynamoDB operations fail, THE System SHALL retry with exponential backoff up to 3 times
2. WHEN TMDB_API is unavailable, THE Circuit_Breaker SHALL activate and serve cached content
3. WHEN vote processing fails, THE System SHALL show user-friendly error messages with suggested actions
4. WHEN network connectivity is poor, THE System SHALL queue operations and retry when connection improves
5. WHEN critical errors occur, THE System SHALL log detailed information for debugging while showing simple messages to users

### Requirement 10: Enhance Movie Loading Performance

**User Story:** As a user, I want movies to appear instantly when voting, so that the experience feels responsive and engaging.

#### Acceptance Criteria

1. WHEN starting a voting session, THE System SHALL pre-load the next 3 movies in the background
2. WHEN a user votes, THE System SHALL immediately show the next pre-loaded movie
3. WHEN pre-loading fails, THE System SHALL fall back to on-demand loading with loading indicators
4. WHEN movie images are loaded, THE System SHALL cache them locally for offline viewing
5. WHEN switching between movies, THE System SHALL use smooth transitions and animations