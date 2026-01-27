import { AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';

/**
 * Simplified Core Handler
 * 
 * Maneja todas las operaciones principales: rooms, voting, movies, y AI.
 * Consolidado para mejor rendimiento y mantenimiento.
 * 
 * **Valida: Requirements 2.1, 2.2, 8.1, 8.2**
 */

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CORE_TABLE = process.env.CORE_TABLE!;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE!;
const CACHE_TABLE = process.env.CACHE_TABLE!;
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE!;

// External API configuration
const TMDB_API_KEY = process.env.TMDB_API_KEY!;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY!;

/**
 * Main Lambda handler for core operations
 */
export const handler: AppSyncResolverHandler<any, any> = async (event) => {
  console.log('🏠 Core Handler - Event:', JSON.stringify(event, null, 2));

  try {
    const { fieldName, arguments: args, identity } = event;
    const userId = identity?.sub || identity?.claims?.sub;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    switch (fieldName) {
      // Room operations
      case 'getUserRooms':
        return await getUserRooms(userId);
      case 'getRoom':
        return await getRoom(args.roomId, userId);
      case 'getRoomMembers':
        return await getRoomMembers(args.roomId, userId);
      case 'createRoom':
        return await createRoom(args.input, userId);
      case 'createRoomDebug':
        return await createRoomCompatibility(args.input, userId, 'debug');
      case 'createRoomSimple':
        return await createRoomCompatibility({ name: args.name }, userId, 'simple');
      case 'joinRoomByInvite':
        return await joinRoomByInvite(args.inviteCode, userId);
      case 'leaveRoom':
        return await leaveRoom(args.roomId, userId);
      case 'startVoting':
        return await startVoting(args.roomId, userId);

      // Voting operations
      case 'vote':
        return await vote(args.input, userId);
      case 'getRoomVotes':
        return await getRoomVotes(args.roomId, userId);

      // Movie operations
      case 'getMovies':
        return await getMovies(args.genre, args.page, args.limit);
      case 'getMovieDetails':
        return await getMovieDetails(args.movieId);

      // AI operations
      case 'getChatRecommendations':
        return await getChatRecommendations(args.text, userId);

      default:
        throw new Error(`Unknown field: ${fieldName}`);
    }
  } catch (error: any) {
    console.error('❌ Core Handler Error:', error);
    
    // Log error for analytics
    await logAnalyticsEvent('core_error', {
      error: error.message,
      fieldName: event.fieldName,
      userId: event.identity?.sub
    });
    
    throw error;
  }
};

// ========================================
// ROOM OPERATIONS
// ========================================

/**
 * Get user's rooms
 */
async function getUserRooms(userId: string): Promise<any[]> {
  console.log('🏠 Getting rooms for user:', userId);

  try {
    const result = await docClient.send(new QueryCommand({
      TableName: CORE_TABLE,
      IndexName: 'UserIndex',
      KeyConditionExpression: 'UserId = :userId AND EntityType = :entityType',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':entityType': 'ROOM_MEMBER'
      }
    }));

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    // Get room details for each membership
    const roomIds = result.Items.map(item => item.RoomId);
    const roomPromises = roomIds.map(roomId => getRoomById(roomId));
    const rooms = await Promise.all(roomPromises);

    return rooms.filter(room => room !== null);

  } catch (error: any) {
    console.error('❌ Error getting user rooms:', error);
    throw new Error(`Failed to get user rooms: ${error.message}`);
  }
}

/**
 * Get room by ID
 */
async function getRoom(roomId: string, userId: string): Promise<any> {
  console.log('🏠 Getting room:', roomId);

  try {
    const room = await getRoomById(roomId);
    
    if (!room) {
      throw new Error('Room not found');
    }

    // Check if user is a member
    const membership = await getRoomMembership(roomId, userId);
    if (!membership) {
      throw new Error('Access denied - not a room member');
    }

    return room;

  } catch (error: any) {
    console.error('❌ Error getting room:', error);
    throw error;
  }
}

/**
 * Create new room
 */
async function createRoom(input: any, userId: string): Promise<any> {
  console.log('🏠 Creating room:', input);

  // Compatibility: Remove genrePreferences if present
  const { genrePreferences, ...sanitizedInput } = input;
  if (genrePreferences) {
    console.log('🔄 Compatibility: Removed genrePreferences:', genrePreferences);
  }

  const roomId = `room_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const inviteCode = generateInviteCode();
  const now = new Date().toISOString();

  const room = {
    id: roomId,
    name: sanitizedInput.name,
    description: sanitizedInput.description || '',
    status: 'WAITING',
    resultMovieId: null,
    hostId: userId,
    inviteCode,
    isActive: true,
    isPrivate: sanitizedInput.isPrivate || false,
    memberCount: 1,
    maxMembers: sanitizedInput.maxMembers || 10,
    matchCount: 0,
    createdAt: now,
    updatedAt: now
  };

  try {
    // Create room in Core table
    await docClient.send(new PutCommand({
      TableName: CORE_TABLE,
      Item: {
        PK: `ROOM#${roomId}`,
        SK: 'DETAILS',
        RoomId: roomId,
        Name: room.name,
        Description: room.description,
        Status: room.status,
        ResultMovieId: room.resultMovieId,
        HostId: room.hostId,
        InviteCode: room.inviteCode,
        IsActive: room.isActive,
        IsPrivate: room.isPrivate,
        MemberCount: room.memberCount,
        MaxMembers: room.maxMembers,
        MatchCount: room.matchCount,
        CreatedAt: room.createdAt,
        UpdatedAt: room.updatedAt,
        EntityType: 'ROOM'
      }
    }));

    // Add invite code index
    await docClient.send(new PutCommand({
      TableName: CORE_TABLE,
      Item: {
        PK: `INVITE#${inviteCode}`,
        SK: 'ROOM',
        InviteCode: inviteCode,
        RoomId: roomId,
        CreatedAt: now,
        EntityType: 'INVITE'
      }
    }));

    // Add host as first member
    await addRoomMember(roomId, userId, true);

    // Log analytics
    await logAnalyticsEvent('room_created', {
      roomId,
      hostId: userId,
      isPrivate: room.isPrivate,
      maxMembers: room.maxMembers
    });

    console.log('✅ Room created successfully:', roomId);
    return room;

  } catch (error: any) {
    console.error('❌ Error creating room:', error);
    throw new Error(`Failed to create room: ${error.message}`);
  }
}

/**
 * Create room with compatibility transformations
 */
async function createRoomCompatibility(input: any, userId: string, type: 'debug' | 'simple'): Promise<any> {
  console.log(`🔄 Creating ${type} room (compatibility):`, input);

  let transformedInput: any = {};

  if (type === 'debug') {
    const roomName = input?.name || 'Debug Room';
    transformedInput = {
      name: roomName,
      description: `Debug room - ${roomName}`,
      isPrivate: false,
      maxMembers: 10
    };
  } else if (type === 'simple') {
    const roomName = input?.name || 'Simple Room';
    transformedInput = {
      name: roomName,
      description: `Simple room - ${roomName}`,
      isPrivate: false,
      maxMembers: 10
    };
  }

  // Ensure valid name
  if (!transformedInput.name || transformedInput.name.trim() === '') {
    transformedInput.name = `${type} Room - ${Date.now()}`;
    transformedInput.description = `Auto-generated ${type} room`;
  }

  console.log(`🔄 Transformed ${type} room input:`, transformedInput);
  return await createRoom(transformedInput, userId);
}

/**
 * Join room by invite code
 */
async function joinRoomByInvite(inviteCode: string, userId: string): Promise<any> {
  console.log('🚪 Joining room by invite:', inviteCode);

  try {
    // Find room by invite code
    const inviteResult = await docClient.send(new GetCommand({
      TableName: CORE_TABLE,
      Key: {
        PK: `INVITE#${inviteCode}`,
        SK: 'ROOM'
      }
    }));

    if (!inviteResult.Item) {
      throw new Error('Invalid or expired invite code');
    }

    const roomId = inviteResult.Item.RoomId;
    
    // Get room details
    const room = await getRoomById(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (!room.isActive) {
      throw new Error('Room is no longer active');
    }

    // Check if already a member
    const existingMembership = await getRoomMembership(roomId, userId);
    if (existingMembership) {
      console.log('👤 User already a member, returning room');
      return room;
    }

    // Check room capacity
    if (room.memberCount >= room.maxMembers) {
      throw new Error('Room is full');
    }

    // Add user as member
    await addRoomMember(roomId, userId, false);

    // Update room member count
    await updateRoomMemberCount(roomId, 1);

    // Get updated room
    const updatedRoom = await getRoomById(roomId);

    // Log analytics
    await logAnalyticsEvent('room_joined', {
      roomId,
      userId,
      inviteCode,
      memberCount: updatedRoom?.memberCount || 0
    });

    console.log('✅ Successfully joined room:', roomId);
    return updatedRoom;

  } catch (error: any) {
    console.error('❌ Error joining room:', error);
    throw error;
  }
}

// ========================================
// VOTING OPERATIONS
// ========================================

/**
 * Vote on a movie
 */
async function vote(input: any, userId: string): Promise<any> {
  console.log('🗳️ Processing vote:', input);

  const { roomId, movieId, voteType = 'LIKE' } = input;
  const timestamp = Date.now();

  try {
    // Verify room membership
    const membership = await getRoomMembership(roomId, userId);
    if (!membership) {
      throw new Error('Access denied - not a room member');
    }

    // Check if already voted on this movie
    const existingVote = await getExistingVote(roomId, userId, movieId);
    if (existingVote) {
      throw new Error('You have already voted on this movie');
    }

    // Store vote in Sessions table
    await docClient.send(new PutCommand({
      TableName: SESSIONS_TABLE,
      Item: {
        SessionId: roomId,
        Timestamp: timestamp,
        EventType: 'VOTE',
        UserId: userId,
        MovieId: movieId,
        VoteType: voteType,
        RoomId: roomId,
        ExpiresAt: Math.floor(timestamp / 1000) + (7 * 24 * 60 * 60) // 7 days TTL
      }
    }));

    // Check for match (simplified Stop-on-Match logic)
    const matchFound = await checkForMatch(roomId, movieId);
    
    if (matchFound) {
      // Update room status to MATCHED
      await updateRoomStatus(roomId, 'MATCHED', movieId);
      
      // Log match event
      await logAnalyticsEvent('match_found', {
        roomId,
        movieId,
        userId,
        voteType
      });
    }

    // Get updated room
    const updatedRoom = await getRoomById(roomId);

    // Log vote event
    await logAnalyticsEvent('vote_cast', {
      roomId,
      userId,
      movieId,
      voteType,
      matchFound
    });

    console.log('✅ Vote processed successfully');
    return updatedRoom;

  } catch (error: any) {
    console.error('❌ Error processing vote:', error);
    throw error;
  }
}

// ========================================
// MOVIE OPERATIONS
// ========================================

/**
 * Get movies with caching
 */
async function getMovies(genre?: string, page: number = 1, limit: number = 20): Promise<any[]> {
  console.log('🎬 Getting movies:', { genre, page, limit });

  const cacheKey = `movies_${genre || 'all'}_${page}_${limit}`;

  try {
    // Try cache first
    const cachedResult = await getCachedData(cacheKey);
    if (cachedResult) {
      console.log('✅ Returning cached movies');
      return cachedResult;
    }

    // Fetch from TMDB API
    const movies = await fetchMoviesFromTMDB(genre, page, limit);

    // Cache for 1 hour
    await setCachedData(cacheKey, movies, 3600);

    console.log(`✅ Fetched ${movies.length} movies from TMDB`);
    return movies;

  } catch (error: any) {
    console.error('❌ Error getting movies:', error);
    
    // Return fallback data if available
    const fallbackMovies = await getFallbackMovies();
    return fallbackMovies;
  }
}

/**
 * Get movie details
 */
async function getMovieDetails(movieId: string): Promise<any> {
  console.log('🎬 Getting movie details:', movieId);

  const cacheKey = `movie_details_${movieId}`;

  try {
    // Try cache first
    const cachedResult = await getCachedData(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // Fetch from TMDB API
    const movieDetails = await fetchMovieDetailsFromTMDB(movieId);

    // Cache for 24 hours
    await setCachedData(cacheKey, movieDetails, 86400);

    return movieDetails;

  } catch (error: any) {
    console.error('❌ Error getting movie details:', error);
    throw new Error(`Failed to get movie details: ${error.message}`);
  }
}

// ========================================
// AI OPERATIONS
// ========================================

/**
 * Get AI chat recommendations
 */
async function getChatRecommendations(text: string, userId: string): Promise<any> {
  console.log('🤖 Getting AI recommendations for:', text);

  const cacheKey = `ai_recommendations_${Buffer.from(text).toString('base64').substring(0, 32)}`;

  try {
    // Try cache first
    const cachedResult = await getCachedData(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // Call AI service (simplified)
    const aiResponse = await callAIService(text);

    // Cache for 30 minutes
    await setCachedData(cacheKey, aiResponse, 1800);

    // Log analytics
    await logAnalyticsEvent('ai_recommendation_requested', {
      userId,
      textLength: text.length,
      cached: false
    });

    return aiResponse;

  } catch (error: any) {
    console.error('❌ Error getting AI recommendations:', error);
    
    // Return fallback response
    return {
      chatResponse: 'I\'m having trouble generating recommendations right now. Try browsing popular movies instead.',
      recommendedGenres: [],
      confidence: 0.0,
      reasoning: 'AI service unavailable, using fallback response',
      genreAlignment: 0.0,
      fallbackUsed: true
    };
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

async function getRoomById(roomId: string): Promise<any> {
  const result = await docClient.send(new GetCommand({
    TableName: CORE_TABLE,
    Key: {
      PK: `ROOM#${roomId}`,
      SK: 'DETAILS'
    }
  }));

  if (!result.Item) return null;

  return {
    id: result.Item.RoomId,
    name: result.Item.Name,
    description: result.Item.Description,
    status: result.Item.Status,
    resultMovieId: result.Item.ResultMovieId,
    hostId: result.Item.HostId,
    inviteCode: result.Item.InviteCode,
    isActive: result.Item.IsActive,
    isPrivate: result.Item.IsPrivate,
    memberCount: result.Item.MemberCount,
    maxMembers: result.Item.MaxMembers,
    matchCount: result.Item.MatchCount,
    createdAt: result.Item.CreatedAt,
    updatedAt: result.Item.UpdatedAt
  };
}

async function getRoomMembership(roomId: string, userId: string): Promise<any> {
  const result = await docClient.send(new GetCommand({
    TableName: CORE_TABLE,
    Key: {
      PK: `ROOM#${roomId}`,
      SK: `MEMBER#${userId}`
    }
  }));

  return result.Item || null;
}

async function addRoomMember(roomId: string, userId: string, isHost: boolean): Promise<void> {
  const now = new Date().toISOString();

  await docClient.send(new PutCommand({
    TableName: CORE_TABLE,
    Item: {
      PK: `ROOM#${roomId}`,
      SK: `MEMBER#${userId}`,
      RoomId: roomId,
      UserId: userId,
      IsHost: isHost,
      JoinedAt: now,
      LastActivity: now,
      Status: 'ACTIVE',
      EntityType: 'ROOM_MEMBER'
    }
  }));
}

function generateInviteCode(): string {
  return randomBytes(3).toString('hex').toUpperCase();
}

async function getCachedData(key: string): Promise<any> {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: CACHE_TABLE,
      Key: { CacheKey: key }
    }));

    if (result.Item && result.Item.TTL > Math.floor(Date.now() / 1000)) {
      return result.Item.Data;
    }
  } catch (error) {
    console.warn('Cache read error:', error);
  }
  return null;
}

async function setCachedData(key: string, data: any, ttlSeconds: number): Promise<void> {
  try {
    await docClient.send(new PutCommand({
      TableName: CACHE_TABLE,
      Item: {
        CacheKey: key,
        Data: data,
        TTL: Math.floor(Date.now() / 1000) + ttlSeconds
      }
    }));
  } catch (error) {
    console.warn('Cache write error:', error);
  }
}

async function logAnalyticsEvent(eventType: string, data: any): Promise<void> {
  try {
    const timestamp = Date.now();
    
    await docClient.send(new PutCommand({
      TableName: ANALYTICS_TABLE,
      Item: {
        MetricType: `core_${eventType}`,
        Timestamp: timestamp,
        Data: data,
        ExpiresAt: Math.floor(timestamp / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
      }
    }));
  } catch (error) {
    console.warn('Analytics logging error:', error);
  }
}

// Placeholder implementations for external services
async function fetchMoviesFromTMDB(genre?: string, page: number = 1, limit: number = 20): Promise<any[]> {
  // Implementation would call TMDB API
  return [];
}

async function fetchMovieDetailsFromTMDB(movieId: string): Promise<any> {
  // Implementation would call TMDB API
  return null;
}

async function callAIService(text: string): Promise<any> {
  // Implementation would call Hugging Face or other AI service
  return {
    chatResponse: 'AI service not implemented yet',
    recommendedGenres: [],
    confidence: 0.5,
    reasoning: 'Placeholder response',
    genreAlignment: 0.5,
    fallbackUsed: true
  };
}

async function getFallbackMovies(): Promise<any[]> {
  return [];
}

async function getRoomMembers(roomId: string, userId: string): Promise<any[]> {
  // Implementation for getting room members
  return [];
}

async function leaveRoom(roomId: string, userId: string): Promise<any> {
  // Implementation for leaving room
  return null;
}

async function startVoting(roomId: string, userId: string): Promise<any> {
  // Implementation for starting voting
  return null;
}

async function getRoomVotes(roomId: string, userId: string): Promise<any[]> {
  // Implementation for getting room votes
  return [];
}

async function getExistingVote(roomId: string, userId: string, movieId: string): Promise<any> {
  // Implementation for checking existing vote
  return null;
}

async function checkForMatch(roomId: string, movieId: string): Promise<boolean> {
  // Implementation for checking match
  return false;
}

async function updateRoomStatus(roomId: string, status: string, resultMovieId?: string): Promise<void> {
  // Implementation for updating room status
}

async function updateRoomMemberCount(roomId: string, delta: number): Promise<void> {
  // Implementation for updating member count
}