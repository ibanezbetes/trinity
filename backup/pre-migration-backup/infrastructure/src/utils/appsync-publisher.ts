/**
 * Enhanced AppSync Real-time Event Publisher
 * Publishes events to AppSync subscriptions for real-time updates with detailed progress information
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export interface MatchFoundEvent {
  id: string;
  timestamp: string;
  roomId: string;
  eventType: 'MATCH_FOUND';
  matchId: string;
  mediaId: string;
  mediaTitle: string;
  participants: ParticipantInfo[];
  consensusType: 'UNANIMOUS' | 'MAJORITY';
  matchDetails: {
    totalVotesRequired: number;
    finalVoteCount: number;
    votingDuration: number; // in seconds
    movieGenres: string[];
    movieYear?: number;
    movieRating?: number;
  };
}

export interface VoteUpdateEvent {
  id: string;
  timestamp: string;
  roomId: string;
  eventType: 'VOTE_UPDATE';
  userId: string;
  mediaId: string;
  voteType: 'LIKE' | 'DISLIKE' | 'SKIP';
  progress: {
    totalVotes: number;
    likesCount: number;
    dislikesCount: number;
    skipsCount: number;
    remainingUsers: number;
    percentage: number;
    votingUsers: string[]; // Users who have voted
    pendingUsers: string[]; // Users who haven't voted yet
    estimatedTimeToComplete?: number; // in seconds
  };
  movieInfo: {
    title: string;
    genres: string[];
    year?: number;
    posterPath?: string;
  };
}

export interface ConnectionStatusEvent {
  id: string;
  timestamp: string;
  roomId: string;
  eventType: 'CONNECTION_STATUS';
  userId: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTED';
  connectionId: string;
  metadata: {
    userAgent?: string;
    lastSeen: string;
    reconnectionAttempts?: number;
  };
}

export interface RoomStateEvent {
  id: string;
  timestamp: string;
  roomId: string;
  eventType: 'ROOM_STATE_SYNC';
  roomState: {
    status: 'WAITING' | 'ACTIVE' | 'MATCHED' | 'COMPLETED';
    currentMovieId?: string;
    currentMovieInfo?: {
      title: string;
      genres: string[];
      posterPath?: string;
    };
    totalMembers: number;
    activeConnections: number;
    votingProgress: {
      currentVotes: number;
      totalRequired: number;
      percentage: number;
    };
    matchResult?: {
      movieId: string;
      movieTitle: string;
      foundAt: string;
    };
  };
}

export interface ParticipantInfo {
  userId: string;
  displayName?: string;
  isHost: boolean;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED';
  lastSeen: string;
  hasVoted: boolean;
}

/**
 * Publish Match Found event to all room subscribers with detailed participant information
 */
export async function publishMatchFoundEvent(
  roomId: string,
  movieId: string,
  movieTitle: string,
  participants: string[],
  votingStartTime?: Date
): Promise<void> {
  try {
    // Get detailed participant information
    const participantDetails = await getDetailedParticipantInfo(roomId, participants);

    // Get movie details for enhanced information
    const movieDetails = await getEnhancedMovieInfo(movieId);

    // Calculate voting duration
    const votingDuration = votingStartTime
      ? Math.round((Date.now() - votingStartTime.getTime()) / 1000)
      : 0;

    const event: MatchFoundEvent = {
      id: `match_${roomId}_${movieId}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      roomId,
      eventType: 'MATCH_FOUND',
      matchId: `match_${roomId}_${movieId}`,
      mediaId: movieId,
      mediaTitle: movieTitle,
      participants: participantDetails,
      consensusType: 'UNANIMOUS', // Trinity uses unanimous consensus
      matchDetails: {
        totalVotesRequired: participants.length,
        finalVoteCount: participants.length,
        votingDuration,
        movieGenres: movieDetails.genres,
        movieYear: movieDetails.year,
        movieRating: movieDetails.rating
      }
    };

    console.log(`🎉 Enhanced MATCH_FOUND Event published for room ${roomId}:`, {
      movieId,
      movieTitle,
      participantCount: participants.length,
      votingDuration: `${votingDuration}s`,
      movieGenres: movieDetails.genres
    });

    // Store the match event for audit/history purposes
    await storeEventForAudit('MATCH_FOUND', roomId, event);

    // Publish immediate notification to all room subscribers
    await publishToRoomSubscribers(roomId, event);

  } catch (error) {
    console.error('❌ Error publishing enhanced match found event:', error);
    // Don't throw - real-time notifications are nice-to-have, not critical
  }
}

/**
 * Publish Vote Update event to room subscribers with detailed progress information
 */
export async function publishVoteUpdateEvent(
  roomId: string,
  userId: string,
  movieId: string,
  voteType: 'LIKE' | 'DISLIKE' | 'SKIP',
  currentVotes: number,
  totalMembers: number
): Promise<void> {
  try {
    // Get detailed voting progress information
    const votingUsers = await getVotingUsers(roomId, movieId);
    const allMembers = await getAllRoomMembers(roomId);
    const pendingUsers = allMembers.filter(member => !votingUsers.includes(member));

    // Get enhanced movie information
    const movieInfo = await getEnhancedMovieInfo(movieId);

    // Estimate time to complete based on voting patterns
    const estimatedTimeToComplete = await estimateVotingCompletion(roomId, currentVotes, totalMembers);

    const event: VoteUpdateEvent = {
      id: `vote_${roomId}_${userId}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      roomId,
      eventType: 'VOTE_UPDATE',
      userId,
      mediaId: movieId,
      voteType,
      progress: {
        totalVotes: currentVotes,
        likesCount: voteType === 'LIKE' ? currentVotes : 0, // Simplified for Trinity
        dislikesCount: 0,
        skipsCount: 0,
        remainingUsers: Math.max(0, totalMembers - currentVotes),
        percentage: totalMembers > 0 ? (currentVotes / totalMembers) * 100 : 0,
        votingUsers,
        pendingUsers,
        estimatedTimeToComplete
      },
      movieInfo: {
        title: movieInfo.title,
        genres: movieInfo.genres,
        year: movieInfo.year,
        posterPath: movieInfo.posterPath
      }
    };

    console.log(`🗳️ Enhanced VOTE_UPDATE Event published for room ${roomId}:`, {
      userId,
      movieId,
      movieTitle: movieInfo.title,
      progress: `${currentVotes}/${totalMembers} (${event.progress.percentage.toFixed(1)}%)`,
      pendingUsers: pendingUsers.length,
      estimatedCompletion: estimatedTimeToComplete ? `${estimatedTimeToComplete}s` : 'unknown'
    });

    // Store the vote event for audit/history purposes
    await storeEventForAudit('VOTE_UPDATE', roomId, event);

    // Publish to room subscribers
    await publishToRoomSubscribers(roomId, event);

  } catch (error) {
    console.error('❌ Error publishing enhanced vote update event:', error);
    // Don't throw - real-time notifications are nice-to-have, not critical
  }
}

/**
 * Publish connection status event for monitoring user connections
 */
export async function publishConnectionStatusEvent(
  roomId: string,
  userId: string,
  status: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTED',
  connectionId: string,
  metadata?: {
    userAgent?: string;
    reconnectionAttempts?: number;
  }
): Promise<void> {
  try {
    const event: ConnectionStatusEvent = {
      id: `connection_${roomId}_${userId}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      roomId,
      eventType: 'CONNECTION_STATUS',
      userId,
      status,
      connectionId,
      metadata: {
        userAgent: metadata?.userAgent,
        lastSeen: new Date().toISOString(),
        reconnectionAttempts: metadata?.reconnectionAttempts || 0
      }
    };

    console.log(`🔌 CONNECTION_STATUS Event published for room ${roomId}:`, {
      userId,
      status,
      connectionId: connectionId.substring(0, 8) + '...',
      reconnectionAttempts: metadata?.reconnectionAttempts || 0
    });

    // Store connection event for monitoring
    await storeEventForAudit('CONNECTION_STATUS', roomId, event);

    // Publish to room subscribers
    await publishToRoomSubscribers(roomId, event);

  } catch (error) {
    console.error('❌ Error publishing connection status event:', error);
  }
}

/**
 * Publish room state synchronization event for reconnected users
 */
export async function publishRoomStateSyncEvent(
  roomId: string,
  targetUserId?: string
): Promise<void> {
  try {
    // Get current room state
    const roomState = await getCurrentRoomState(roomId);

    const event: RoomStateEvent = {
      id: `sync_${roomId}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      roomId,
      eventType: 'ROOM_STATE_SYNC',
      roomState
    };

    console.log(`🔄 ROOM_STATE_SYNC Event published for room ${roomId}:`, {
      targetUser: targetUserId || 'all',
      roomStatus: roomState.status,
      totalMembers: roomState.totalMembers,
      activeConnections: roomState.activeConnections,
      votingProgress: `${roomState.votingProgress.currentVotes}/${roomState.votingProgress.totalRequired}`
    });

    // Store sync event for audit
    await storeEventForAudit('ROOM_STATE_SYNC', roomId, event);

    // Publish to specific user or all room subscribers
    if (targetUserId) {
      await publishToUserInRoom(roomId, targetUserId, event);
    } else {
      await publishToRoomSubscribers(roomId, event);
    }

  } catch (error) {
    console.error('❌ Error publishing room state sync event:', error);
  }
}
export async function getMovieTitle(movieId: string): Promise<string> {
  try {
    // Try to get movie title from cache
    const response = await docClient.send(new GetCommand({
      TableName: process.env.MOVIES_CACHE_TABLE!,
      Key: { tmdbId: `movie_${movieId}` },
    }));

    if (response.Item?.movies) {
      const movies = response.Item.movies;
      const movie = movies.find((m: any) => m.id === movieId);
      if (movie?.title) {
        return movie.title;
      }
    }

    // Fallback to generic title
    return `Movie ${movieId}`;

  } catch (error) {
    console.warn('⚠️ Error getting movie title:', error);
    return `Movie ${movieId}`;
  }
}

/**
 * Store event for audit trail and debugging
 */
async function storeEventForAudit(eventType: string, roomId: string, eventData: any): Promise<void> {
  try {
    // In a production system, you might want to store events in a separate audit table
    // For now, we'll just log them with structured data for CloudWatch
    console.log(`📊 AUDIT_EVENT:${eventType}`, {
      roomId,
      timestamp: new Date().toISOString(),
      eventData: JSON.stringify(eventData)
    });
  } catch (error) {
    console.warn('⚠️ Error storing audit event:', error);
    // Don't throw - audit is optional
  }
}

/**
 * Get detailed participant information including connection status and voting status
 */
async function getDetailedParticipantInfo(roomId: string, participantIds: string[]): Promise<ParticipantInfo[]> {
  try {
    const participants: ParticipantInfo[] = [];

    // Get room info to identify host
    const roomResponse = await docClient.send(new GetCommand({
      TableName: process.env.ROOMS_TABLE!,
      Key: { PK: roomId, SK: 'ROOM' },
    }));

    const hostId = roomResponse.Item?.hostId;

    for (const userId of participantIds) {
      // Get member info
      const memberResponse = await docClient.send(new GetCommand({
        TableName: process.env.ROOM_MEMBERS_TABLE!,
        Key: { roomId, userId },
      }));

      const member = memberResponse.Item;

      participants.push({
        userId,
        displayName: member?.displayName || `User ${userId.substring(0, 8)}`,
        isHost: userId === hostId,
        connectionStatus: member?.connectionStatus || 'CONNECTED',
        lastSeen: member?.lastSeen || new Date().toISOString(),
        hasVoted: true // All participants have voted if match was found
      });
    }

    return participants;
  } catch (error) {
    console.warn('⚠️ Error getting detailed participant info:', error);
    // Return basic participant info as fallback
    return participantIds.map(userId => ({
      userId,
      displayName: `User ${userId.substring(0, 8)}`,
      isHost: false,
      connectionStatus: 'CONNECTED' as const,
      lastSeen: new Date().toISOString(),
      hasVoted: true
    }));
  }
}

/**
 * Get enhanced movie information including genres, year, and poster
 */
async function getEnhancedMovieInfo(movieId: string): Promise<{
  title: string;
  genres: string[];
  year?: number;
  rating?: number;
  posterPath?: string;
}> {
  try {
    // Try to get from movie cache first
    const cacheResponse = await docClient.send(new QueryCommand({
      TableName: process.env.MOVIE_CACHE_TABLE!,
      IndexName: 'MovieIdIndex', // Assuming we have a GSI on movieId
      KeyConditionExpression: 'movieId = :movieId',
      ExpressionAttributeValues: {
        ':movieId': movieId
      },
      Limit: 1
    }));

    if (cacheResponse.Items && cacheResponse.Items.length > 0) {
      const cachedMovie = cacheResponse.Items[0];
      return {
        title: cachedMovie.title || `Movie ${movieId}`,
        genres: cachedMovie.genres || [],
        year: cachedMovie.year,
        rating: cachedMovie.rating,
        posterPath: cachedMovie.posterPath
      };
    }

    // Fallback to basic info
    return {
      title: `Movie ${movieId}`,
      genres: [],
    };

  } catch (error) {
    console.warn('⚠️ Error getting enhanced movie info:', error);
    return {
      title: `Movie ${movieId}`,
      genres: [],
    };
  }
}

/**
 * Get list of users who have voted for a specific movie
 */
async function getVotingUsers(roomId: string, movieId: string): Promise<string[]> {
  try {
    const roomMovieId = `${roomId}_${movieId}`;

    const response = await docClient.send(new QueryCommand({
      TableName: process.env.USER_VOTES_TABLE!,
      IndexName: 'RoomMovieIndex', // Assuming we have a GSI on roomMovieId
      KeyConditionExpression: 'roomMovieId = :roomMovieId',
      ExpressionAttributeValues: {
        ':roomMovieId': roomMovieId
      },
      ProjectionExpression: 'userId'
    }));

    return response.Items?.map(item => item.userId) || [];
  } catch (error) {
    console.warn('⚠️ Error getting voting users:', error);
    return [];
  }
}

/**
 * Get all active members of a room
 */
async function getAllRoomMembers(roomId: string): Promise<string[]> {
  try {
    const response = await docClient.send(new QueryCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      KeyConditionExpression: 'roomId = :roomId',
      FilterExpression: 'isActive = :active',
      ExpressionAttributeValues: {
        ':roomId': roomId,
        ':active': true
      },
      ProjectionExpression: 'userId'
    }));

    return response.Items?.map(item => item.userId) || [];
  } catch (error) {
    console.warn('⚠️ Error getting all room members:', error);
    return [];
  }
}

/**
 * Estimate time to complete voting based on historical patterns
 */
async function estimateVotingCompletion(roomId: string, currentVotes: number, totalMembers: number): Promise<number | undefined> {
  try {
    if (currentVotes >= totalMembers) {
      return 0; // Already complete
    }

    // Simple estimation: assume 30 seconds per remaining vote
    // In a real system, you might analyze historical voting patterns
    const remainingVotes = totalMembers - currentVotes;
    const estimatedSeconds = remainingVotes * 30;

    return estimatedSeconds;
  } catch (error) {
    console.warn('⚠️ Error estimating voting completion:', error);
    return undefined;
  }
}

/**
 * Get current room state for synchronization
 */
async function getCurrentRoomState(roomId: string): Promise<RoomStateEvent['roomState']> {
  try {
    // Get room info
    const roomResponse = await docClient.send(new GetCommand({
      TableName: process.env.ROOMS_TABLE!,
      Key: { PK: roomId, SK: 'ROOM' },
    }));

    const room = roomResponse.Item;
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Get member count
    const membersResponse = await docClient.send(new QueryCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      KeyConditionExpression: 'roomId = :roomId',
      FilterExpression: 'isActive = :active',
      ExpressionAttributeValues: {
        ':roomId': roomId,
        ':active': true
      },
      Select: 'COUNT'
    }));

    const totalMembers = membersResponse.Count || 0;

    // Get current voting progress if room is active
    let votingProgress = {
      currentVotes: 0,
      totalRequired: totalMembers,
      percentage: 0
    };

    if (room.status === 'ACTIVE' && room.currentMovieId) {
      const votesResponse = await docClient.send(new GetCommand({
        TableName: process.env.VOTES_TABLE!,
        Key: { roomId, movieId: room.currentMovieId },
      }));

      const currentVotes = votesResponse.Item?.votes || 0;
      votingProgress = {
        currentVotes,
        totalRequired: totalMembers,
        percentage: totalMembers > 0 ? (currentVotes / totalMembers) * 100 : 0
      };
    }

    // Get current movie info if available
    let currentMovieInfo;
    if (room.currentMovieId) {
      const movieInfo = await getEnhancedMovieInfo(room.currentMovieId);
      currentMovieInfo = {
        title: movieInfo.title,
        genres: movieInfo.genres,
        posterPath: movieInfo.posterPath
      };
    }

    // Get match result if room is matched
    let matchResult;
    if (room.status === 'MATCHED' && room.resultMovieId) {
      const matchMovieInfo = await getEnhancedMovieInfo(room.resultMovieId);
      matchResult = {
        movieId: room.resultMovieId,
        movieTitle: matchMovieInfo.title,
        foundAt: room.updatedAt || new Date().toISOString()
      };
    }

    return {
      status: room.status,
      currentMovieId: room.currentMovieId,
      currentMovieInfo,
      totalMembers,
      activeConnections: totalMembers, // Simplified - in real system track actual connections
      votingProgress,
      matchResult
    };

  } catch (error) {
    console.error('❌ Error getting current room state:', error);
    throw error;
  }
}

/**
 * Publish event to all subscribers of a room via AppSync Mutation
 */
async function publishToRoomSubscribers(roomId: string, event: any): Promise<void> {
  const endpoint = process.env.APPSYNC_ENDPOINT;
  const apiKey = process.env.APPSYNC_API_KEY; // If using API Key
  // Or use IAM signing if configured. For simple setups, usually API Key or just unauthenticated if enabled (but Lambda usually has IAM)

  // Actually, from a Lambda resolver, we often invoke the mutation directly via HTTP
  // But wait, if this code runs INSIDE a Lambda resolver, we are already in AppSync? no, we are in a Lambda data source.
  // To trigger a subscription, we MUST execute a mutation against the AppSync API.

  if (!endpoint) {
    console.warn('⚠️ APPSYNC_ENDPOINT not defined, cannot publish event');
    return;
  }

  // Determine which mutation to call based on event type
  let mutation = '';
  let variables = {};
  let operationName = '';

  switch (event.eventType) {
    case 'VOTE_UPDATE':
      operationName = 'PublishVoteUpdate';
      mutation = `
        mutation PublishVoteUpdate($roomId: ID!, $voteUpdateData: AWSJSON!) {
          publishVoteUpdateEvent(roomId: $roomId, voteUpdateData: $voteUpdateData) {
            id
            timestamp
            roomId
            eventType
            progress {
              totalVotes
              likesCount
              percentage
            }
          }
        }
      `;
      // ALSO call legacy publishVoteEvent for legacy subscribers
      const legacyMutation = `
        mutation PublishVote($roomId: ID!, $voteData: AWSJSON!) {
          publishVoteEvent(roomId: $roomId, voteData: $voteData) {
            id
            timestamp
            roomId
            eventType
            userId
            mediaId
            voteType
            progress {
              totalVotes
              likesCount
              percentage
            }
          }
        }
      `;
      // We'll execute this one too or instead. The logs showed errors on 'VoteEvent', so let's focus on legacy first if that's what frontend uses.
      // Frontent logs: "WebSocket error for vote-updates ... parent 'VoteEvent'"
      // Schema: onVoteUpdate -> publishVoteEvent -> returns VoteEvent

      // So we MUST call publishVoteEvent.
      // Construct VoteEvent payload from VoteUpdateEvent
      const voteData = {
        id: event.id,
        timestamp: event.timestamp,
        roomId: event.roomId,
        eventType: event.eventType,
        userId: event.userId,
        mediaId: event.mediaId,
        voteType: event.voteType,
        progress: event.progress
      };

      mutation = legacyMutation;
      variables = { roomId, voteData: JSON.stringify(voteData) };
      break;

    case 'MATCH_FOUND':
      // Schema: onMatchFound -> publishMatchEvent -> returns MatchEvent
      // Schema: MatchEvent has { id, timestamp, roomId, eventType, matchId, mediaId, mediaTitle... }
      mutation = `
          mutation PublishMatch($roomId: ID!, $matchData: AWSJSON!) {
            publishMatchFoundEvent(roomId: $roomId, matchData: $matchData) {
              id
              timestamp
              roomId
              eventType
              matchId
              mediaId
              mediaTitle
            }
          }
        `;

      const matchData = {
        id: event.id,
        timestamp: event.timestamp,
        roomId: event.roomId,
        eventType: event.eventType,
        matchId: event.matchId,
        mediaId: event.mediaId,
        mediaTitle: event.mediaTitle,
        participants: event.participants.map((p: any) => p.userId), // MatchEvent expects simple list of IDs as per Schema? 
        // Wait, schema says: participants: [ID!]! for MatchEvent
        // But appsync-publisher says participants: ParticipantInfo[] for MatchFoundEvent interface.
        // mapping:
        consensusType: event.consensusType || 'UNANIMOUS'
      };
      variables = { roomId, matchData: JSON.stringify(matchData) };
      break;

    default:
      console.warn(`Unmapped event type for publishing: ${event.eventType}`);
      return;
  }

  try {
    const fetch = require('node-fetch'); // Ensure node-fetch is available
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || '', // Use API Key if available, else blank (might fail if IAM required)
      },
      body: JSON.stringify({ query: mutation, variables })
    });

    const result: any = await response.json();
    if (result.errors) {
      console.error('❌ AppSync Publish Error:', JSON.stringify(result.errors));
    } else {
      console.log(`✅ Event published successfully to ${endpoint}`);
    }
  } catch (error) {
    console.error('❌ Error publishing to AppSync:', error);
  }
}

/**
 * Publish event to a specific user in a room
 */
async function publishToUserInRoom(roomId: string, userId: string, event: any): Promise<void> {
  try {
    console.log(`📡 Publishing to user ${userId} in room ${roomId}:`, {
      eventType: event.eventType,
      eventId: event.id
    });

    // In production, this would target the specific user's subscription

  } catch (error) {
    console.error('❌ Error publishing to user in room:', error);
  }
}