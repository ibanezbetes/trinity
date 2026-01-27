# API Reference

This document provides comprehensive API documentation for the Trinity Backend Refactored application.

## Base URLs

| Environment | Base URL |
|-------------|----------|
| Development | `http://localhost:3000` |
| Staging | `https://api-staging.trinity.example.com` |
| Production | `https://api.trinity.example.com` |

## Authentication

Trinity uses JWT-based authentication with AWS Cognito integration.

### Authentication Flow

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Cognito
    participant Google

    Client->>API: POST /auth/login (Google token)
    API->>Google: Verify token
    Google-->>API: User info
    API->>Cognito: Create/update user
    Cognito-->>API: Cognito user
    API-->>Client: JWT token + refresh token
```

### Headers

Include the JWT token in the Authorization header:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Error Handling

All API errors follow a consistent format:

```json
{
  "statusCode": 400,
  "message": "Detailed error message",
  "error": "Bad Request",
  "timestamp": "2024-01-25T12:00:00.000Z",
  "path": "/api/rooms",
  "correlationId": "req-123456789"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Unprocessable Entity |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

| Endpoint Category | Limit |
|-------------------|-------|
| Authentication | 5 requests/minute |
| Room Operations | 10 requests/minute |
| Voting Operations | 20 requests/minute |
| General Endpoints | 100 requests/minute |

Rate limit headers are included in responses:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Authentication Endpoints

### POST /auth/login

Authenticate user with Google OAuth token.

**Request:**
```http
POST /auth/login
Content-Type: application/json

{
  "googleToken": "ya29.a0AfH6SMC...",
  "deviceInfo": {
    "platform": "ios",
    "version": "1.0.0",
    "deviceId": "device-123"
  }
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "displayName": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg",
    "preferences": {
      "theme": "dark",
      "notifications": true,
      "language": "en"
    }
  }
}
```

### POST /auth/refresh

Refresh access token using refresh token.

**Request:**
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

### POST /auth/logout

Logout user and invalidate tokens.

**Request:**
```http
POST /auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "message": "Successfully logged out"
}
```

## User Endpoints

### GET /users/profile

Get current user profile.

**Request:**
```http
GET /users/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "id": "user-123",
  "email": "user@example.com",
  "displayName": "John Doe",
  "avatarUrl": "https://example.com/avatar.jpg",
  "preferences": {
    "theme": "dark",
    "notifications": true,
    "language": "en"
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-25T12:00:00.000Z",
  "lastActiveAt": "2024-01-25T12:00:00.000Z"
}
```

### PUT /users/profile

Update user profile.

**Request:**
```http
PUT /users/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "displayName": "John Smith",
  "preferences": {
    "theme": "light",
    "notifications": false,
    "language": "es"
  }
}
```

**Response:**
```json
{
  "id": "user-123",
  "email": "user@example.com",
  "displayName": "John Smith",
  "avatarUrl": "https://example.com/avatar.jpg",
  "preferences": {
    "theme": "light",
    "notifications": false,
    "language": "es"
  },
  "updatedAt": "2024-01-25T12:05:00.000Z"
}
```

## Room Endpoints

### POST /rooms

Create a new room.

**Request:**
```http
POST /rooms
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "name": "Movie Night",
  "description": "Let's pick a movie for tonight!",
  "isPrivate": false,
  "maxParticipants": 10,
  "settings": {
    "allowDuplicateVotes": false,
    "showResultsImmediately": true,
    "votingTimeLimit": 300
  }
}
```

**Response:**
```json
{
  "id": "room-123",
  "name": "Movie Night",
  "description": "Let's pick a movie for tonight!",
  "hostId": "user-123",
  "inviteCode": "ABC123",
  "isPrivate": false,
  "maxParticipants": 10,
  "currentParticipants": 1,
  "status": "waiting",
  "settings": {
    "allowDuplicateVotes": false,
    "showResultsImmediately": true,
    "votingTimeLimit": 300
  },
  "createdAt": "2024-01-25T12:00:00.000Z",
  "updatedAt": "2024-01-25T12:00:00.000Z"
}
```

### GET /rooms

Get user's rooms.

**Request:**
```http
GET /rooms?status=active&limit=20&offset=0
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Query Parameters:**
- `status` (optional): Filter by room status (`waiting`, `voting`, `completed`)
- `limit` (optional): Number of rooms to return (default: 20, max: 100)
- `offset` (optional): Number of rooms to skip (default: 0)

**Response:**
```json
{
  "rooms": [
    {
      "id": "room-123",
      "name": "Movie Night",
      "hostId": "user-123",
      "isHost": true,
      "status": "waiting",
      "currentParticipants": 3,
      "maxParticipants": 10,
      "createdAt": "2024-01-25T12:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

### GET /rooms/:id

Get room details.

**Request:**
```http
GET /rooms/room-123
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "id": "room-123",
  "name": "Movie Night",
  "description": "Let's pick a movie for tonight!",
  "hostId": "user-123",
  "inviteCode": "ABC123",
  "isPrivate": false,
  "maxParticipants": 10,
  "currentParticipants": 3,
  "status": "voting",
  "settings": {
    "allowDuplicateVotes": false,
    "showResultsImmediately": true,
    "votingTimeLimit": 300
  },
  "participants": [
    {
      "id": "user-123",
      "displayName": "John Doe",
      "avatarUrl": "https://example.com/avatar1.jpg",
      "isHost": true,
      "joinedAt": "2024-01-25T12:00:00.000Z"
    },
    {
      "id": "user-456",
      "displayName": "Jane Smith",
      "avatarUrl": "https://example.com/avatar2.jpg",
      "isHost": false,
      "joinedAt": "2024-01-25T12:05:00.000Z"
    }
  ],
  "movies": [
    {
      "id": "movie-789",
      "title": "The Matrix",
      "year": 1999,
      "posterUrl": "https://image.tmdb.org/t/p/w500/poster.jpg",
      "voteCount": 2
    }
  ],
  "createdAt": "2024-01-25T12:00:00.000Z",
  "updatedAt": "2024-01-25T12:10:00.000Z"
}
```

### POST /rooms/:id/join

Join a room.

**Request:**
```http
POST /rooms/room-123/join
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "inviteCode": "ABC123"
}
```

**Response:**
```json
{
  "message": "Successfully joined room",
  "room": {
    "id": "room-123",
    "name": "Movie Night",
    "status": "waiting",
    "currentParticipants": 4
  }
}
```

### POST /rooms/join-by-code

Join room by invite code.

**Request:**
```http
POST /rooms/join-by-code
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "inviteCode": "ABC123"
}
```

**Response:**
```json
{
  "message": "Successfully joined room",
  "room": {
    "id": "room-123",
    "name": "Movie Night",
    "hostId": "user-123",
    "status": "waiting",
    "currentParticipants": 4
  }
}
```

### DELETE /rooms/:id/leave

Leave a room.

**Request:**
```http
DELETE /rooms/room-123/leave
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "message": "Successfully left room"
}
```

## Movie Endpoints

### GET /movies/search

Search for movies.

**Request:**
```http
GET /movies/search?q=matrix&year=1999&limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Query Parameters:**
- `q` (required): Search query
- `year` (optional): Release year
- `genre` (optional): Genre filter
- `limit` (optional): Number of results (default: 20, max: 50)

**Response:**
```json
{
  "movies": [
    {
      "id": "movie-789",
      "title": "The Matrix",
      "originalTitle": "The Matrix",
      "year": 1999,
      "overview": "A computer hacker learns from mysterious rebels...",
      "posterUrl": "https://image.tmdb.org/t/p/w500/poster.jpg",
      "backdropUrl": "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
      "genres": ["Action", "Science Fiction"],
      "rating": 8.7,
      "runtime": 136,
      "releaseDate": "1999-03-30"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 20,
    "hasMore": false
  }
}
```

### GET /movies/:id

Get movie details.

**Request:**
```http
GET /movies/movie-789
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "id": "movie-789",
  "title": "The Matrix",
  "originalTitle": "The Matrix",
  "year": 1999,
  "overview": "A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.",
  "posterUrl": "https://image.tmdb.org/t/p/w500/poster.jpg",
  "backdropUrl": "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
  "genres": ["Action", "Science Fiction"],
  "rating": 8.7,
  "runtime": 136,
  "releaseDate": "1999-03-30",
  "director": "Lana Wachowski, Lilly Wachowski",
  "cast": [
    {
      "name": "Keanu Reeves",
      "character": "Neo",
      "profileUrl": "https://image.tmdb.org/t/p/w185/profile.jpg"
    }
  ],
  "budget": 63000000,
  "revenue": 467222824,
  "imdbId": "tt0133093",
  "tmdbId": 603
}
```

### POST /rooms/:id/movies

Add movie to room.

**Request:**
```http
POST /rooms/room-123/movies
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "movieId": "movie-789"
}
```

**Response:**
```json
{
  "message": "Movie added to room",
  "movie": {
    "id": "movie-789",
    "title": "The Matrix",
    "year": 1999,
    "posterUrl": "https://image.tmdb.org/t/p/w500/poster.jpg",
    "addedBy": "user-123",
    "addedAt": "2024-01-25T12:15:00.000Z"
  }
}
```

## Voting Endpoints

### POST /rooms/:id/start-voting

Start voting session in room.

**Request:**
```http
POST /rooms/room-123/start-voting
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "timeLimit": 300,
  "allowMultipleVotes": false
}
```

**Response:**
```json
{
  "message": "Voting session started",
  "session": {
    "id": "session-456",
    "roomId": "room-123",
    "status": "active",
    "timeLimit": 300,
    "allowMultipleVotes": false,
    "startedAt": "2024-01-25T12:20:00.000Z",
    "endsAt": "2024-01-25T12:25:00.000Z"
  }
}
```

### POST /rooms/:id/vote

Cast a vote.

**Request:**
```http
POST /rooms/room-123/vote
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "movieId": "movie-789",
  "sessionId": "session-456"
}
```

**Response:**
```json
{
  "message": "Vote cast successfully",
  "vote": {
    "id": "vote-789",
    "userId": "user-123",
    "movieId": "movie-789",
    "sessionId": "session-456",
    "castAt": "2024-01-25T12:22:00.000Z"
  }
}
```

### GET /rooms/:id/results

Get voting results.

**Request:**
```http
GET /rooms/room-123/results?sessionId=session-456
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "session": {
    "id": "session-456",
    "status": "completed",
    "totalVotes": 3,
    "totalParticipants": 3,
    "startedAt": "2024-01-25T12:20:00.000Z",
    "endedAt": "2024-01-25T12:25:00.000Z"
  },
  "results": [
    {
      "movie": {
        "id": "movie-789",
        "title": "The Matrix",
        "year": 1999,
        "posterUrl": "https://image.tmdb.org/t/p/w500/poster.jpg"
      },
      "voteCount": 2,
      "percentage": 66.67,
      "rank": 1
    },
    {
      "movie": {
        "id": "movie-456",
        "title": "Inception",
        "year": 2010,
        "posterUrl": "https://image.tmdb.org/t/p/w500/poster2.jpg"
      },
      "voteCount": 1,
      "percentage": 33.33,
      "rank": 2
    }
  ],
  "winner": {
    "id": "movie-789",
    "title": "The Matrix",
    "voteCount": 2
  }
}
```

## WebSocket Events

Trinity uses WebSocket for real-time communication. Connect to `/ws` endpoint with JWT token.

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000/ws', {
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});
```

### Event Types

#### room:joined
Emitted when a user joins a room.

```json
{
  "event": "room:joined",
  "data": {
    "roomId": "room-123",
    "user": {
      "id": "user-456",
      "displayName": "Jane Smith",
      "avatarUrl": "https://example.com/avatar.jpg"
    },
    "currentParticipants": 4
  }
}
```

#### room:left
Emitted when a user leaves a room.

```json
{
  "event": "room:left",
  "data": {
    "roomId": "room-123",
    "userId": "user-456",
    "currentParticipants": 3
  }
}
```

#### vote:cast
Emitted when a vote is cast.

```json
{
  "event": "vote:cast",
  "data": {
    "roomId": "room-123",
    "sessionId": "session-456",
    "movieId": "movie-789",
    "totalVotes": 2,
    "anonymous": true
  }
}
```

#### vote:results
Emitted when voting results are updated.

```json
{
  "event": "vote:results",
  "data": {
    "roomId": "room-123",
    "sessionId": "session-456",
    "results": [
      {
        "movieId": "movie-789",
        "voteCount": 2,
        "percentage": 66.67
      }
    ]
  }
}
```

#### room:message
Emitted for chat messages in room.

```json
{
  "event": "room:message",
  "data": {
    "roomId": "room-123",
    "message": {
      "id": "msg-123",
      "userId": "user-456",
      "displayName": "Jane Smith",
      "text": "Great movie choice!",
      "timestamp": "2024-01-25T12:30:00.000Z"
    }
  }
}
```

## GraphQL API

Trinity also provides a GraphQL API for mobile applications via AWS AppSync.

### Endpoint
```
https://your-appsync-endpoint.appsync-api.us-east-1.amazonaws.com/graphql
```

### Schema Overview

```graphql
type User {
  id: ID!
  email: String!
  displayName: String!
  avatarUrl: String
  preferences: UserPreferences
  createdAt: AWSDateTime!
  updatedAt: AWSDateTime!
}

type Room {
  id: ID!
  name: String!
  description: String
  hostId: ID!
  inviteCode: String!
  status: RoomStatus!
  participants: [User!]!
  movies: [Movie!]!
  currentSession: VotingSession
  createdAt: AWSDateTime!
  updatedAt: AWSDateTime!
}

type Movie {
  id: ID!
  title: String!
  year: Int!
  overview: String
  posterUrl: String
  genres: [String!]!
  rating: Float
  runtime: Int
}

type Query {
  getUser(id: ID!): User
  getRoom(id: ID!): Room
  getUserRooms(status: RoomStatus): [Room!]!
  searchMovies(query: String!, limit: Int): [Movie!]!
}

type Mutation {
  createRoom(input: CreateRoomInput!): Room!
  joinRoom(roomId: ID!, inviteCode: String): Room!
  addMovieToRoom(roomId: ID!, movieId: ID!): Room!
  startVoting(roomId: ID!, timeLimit: Int): VotingSession!
  castVote(roomId: ID!, movieId: ID!): Vote!
}

type Subscription {
  onRoomUpdated(roomId: ID!): Room
    @aws_subscribe(mutations: ["joinRoom", "addMovieToRoom"])
  onVoteCast(roomId: ID!): Vote
    @aws_subscribe(mutations: ["castVote"])
}
```

### Example Queries

#### Get User Rooms
```graphql
query GetUserRooms {
  getUserRooms(status: ACTIVE) {
    id
    name
    status
    currentParticipants: participants {
      id
    }
    host {
      id
      displayName
    }
    createdAt
  }
}
```

#### Create Room
```graphql
mutation CreateRoom($input: CreateRoomInput!) {
  createRoom(input: $input) {
    id
    name
    inviteCode
    status
    host {
      id
      displayName
    }
  }
}
```

#### Subscribe to Room Updates
```graphql
subscription OnRoomUpdated($roomId: ID!) {
  onRoomUpdated(roomId: $roomId) {
    id
    status
    participants {
      id
      displayName
      avatarUrl
    }
    movies {
      id
      title
      voteCount
    }
  }
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import axios from 'axios';

class TrinityAPI {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    
    return headers;
  }

  async login(googleToken: string): Promise<AuthResponse> {
    const response = await axios.post(`${this.baseURL}/auth/login`, {
      googleToken,
    });
    
    this.setToken(response.data.accessToken);
    return response.data;
  }

  async createRoom(roomData: CreateRoomRequest): Promise<Room> {
    const response = await axios.post(
      `${this.baseURL}/rooms`,
      roomData,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async joinRoom(roomId: string, inviteCode?: string): Promise<void> {
    await axios.post(
      `${this.baseURL}/rooms/${roomId}/join`,
      { inviteCode },
      { headers: this.getHeaders() }
    );
  }

  async castVote(roomId: string, movieId: string): Promise<Vote> {
    const response = await axios.post(
      `${this.baseURL}/rooms/${roomId}/vote`,
      { movieId },
      { headers: this.getHeaders() }
    );
    return response.data;
  }
}

// Usage
const api = new TrinityAPI('https://api.trinity.example.com');

// Login
const authResponse = await api.login('google-token-here');
console.log('Logged in as:', authResponse.user.displayName);

// Create room
const room = await api.createRoom({
  name: 'Movie Night',
  description: 'Let\'s pick a movie!',
  isPrivate: false,
  maxParticipants: 10
});
console.log('Room created:', room.inviteCode);
```

### React Native Example

```typescript
import { TrinityAPI } from './trinity-api';
import { WebSocketService } from './websocket-service';

export class TrinityService {
  private api: TrinityAPI;
  private ws: WebSocketService;

  constructor() {
    this.api = new TrinityAPI(process.env.API_BASE_URL!);
    this.ws = new WebSocketService(process.env.WS_BASE_URL!);
  }

  async initialize(googleToken: string): Promise<void> {
    // Login
    const authResponse = await this.api.login(googleToken);
    
    // Connect WebSocket
    await this.ws.connect(authResponse.accessToken);
    
    // Set up event listeners
    this.ws.on('room:joined', this.handleRoomJoined.bind(this));
    this.ws.on('vote:cast', this.handleVoteCast.bind(this));
  }

  async createAndJoinRoom(roomData: CreateRoomRequest): Promise<Room> {
    const room = await this.api.createRoom(roomData);
    await this.ws.joinRoom(room.id);
    return room;
  }

  private handleRoomJoined(data: any): void {
    console.log('User joined room:', data);
    // Update UI
  }

  private handleVoteCast(data: any): void {
    console.log('Vote cast:', data);
    // Update vote counts in UI
  }
}
```

## Testing

### Postman Collection

Import the Postman collection for easy API testing:

```json
{
  "info": {
    "name": "Trinity API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{accessToken}}",
        "type": "string"
      }
    ]
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000"
    },
    {
      "key": "accessToken",
      "value": ""
    }
  ]
}
```

### cURL Examples

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"googleToken": "your-google-token"}'

# Create room
curl -X POST http://localhost:3000/rooms \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{"name": "Movie Night", "isPrivate": false}'

# Search movies
curl -X GET "http://localhost:3000/movies/search?q=matrix" \
  -H "Authorization: Bearer your-jwt-token"
```

## Changelog

### v2.0.0 (2024-01-25)
- Complete API redesign with clean architecture
- Added GraphQL support via AppSync
- Enhanced real-time features with WebSocket
- Improved authentication with Cognito integration
- Added comprehensive error handling
- Implemented rate limiting
- Added API versioning support

### v1.0.0 (2023-12-01)
- Initial API release
- Basic room and voting functionality
- Google OAuth authentication
- TMDB movie integration