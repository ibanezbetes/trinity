import { AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { AppSyncClient, PostToConnectionCommand } from '@aws-sdk/client-appsync';

/**
 * Simplified Realtime Handler
 * 
 * Maneja todas las operaciones de tiempo real: WebSockets, suscripciones,
 * y eventos de sincronización de estado.
 * 
 * **Valida: Requirements 8.1, 8.2, 8.4**
 */

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const appSyncClient = new AppSyncClient({});

const CORE_TABLE = process.env.CORE_TABLE!;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE!;
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE!;

interface ConnectionInfo {
  connectionId: string;
  userId: string;
  roomId?: string;
  connectedAt: string;
  lastActivity: string;
  userAgent?: string;
  status: 'connected' | 'disconnected' | 'reconnecting';
}

interface RealtimeEvent {
  id: string;
  timestamp: string;
  roomId: string;
  eventType: string;
  userId?: string;
  data: any;
}

/**
 * Main Lambda handler for realtime operations
 */
export const handler: AppSyncResolverHandler<any, any> = async (event) => {
  console.log('📡 Realtime Handler - Event:', JSON.stringify(event, null, 2));

  try {
    const { fieldName, arguments: args, identity, source } = event;
    const userId = identity?.sub || identity?.claims?.sub;

    switch (fieldName) {
      // Connection management
      case 'connect':
        return await handleConnect(args.roomId, userId, event);
      
      case 'disconnect':
        return await handleDisconnect(args.roomId, userId, event);

      // Publishing mutations (called by other services)
      case 'publishVoteUpdate':
        return await publishVoteUpdate(args.roomId, args.voteData);
      
      case 'publishMatchFound':
        return await publishMatchFound(args.roomId, args.matchData);
      
      case 'publishMemberUpdate':
        return await publishMemberUpdate(args.roomId, args.memberData);
      
      case 'publishVoteUpdateEnhanced':
        return await publishVoteUpdateEnhanced(args.roomId, args.voteData);
      
      case 'publishMatchFoundEnhanced':
        return await publishMatchFoundEnhanced(args.roomId, args.matchData);
      
      case 'publishConnectionStatusChange':
        return await publishConnectionStatusChange(args.roomId, args.statusData);
      
      case 'publishRoomStateSync':
        return await publishRoomStateSync(args.roomId, args.stateData);

      default:
        throw new Error(`Unknown field: ${fieldName}`);
    }
  } catch (error: any) {
    console.error('❌ Realtime Handler Error:', error);
    
    // Log error for analytics
    await logAnalyticsEvent('realtime_error', {
      error: error.message,
      fieldName: event.fieldName,
      userId: event.identity?.sub
    });
    
    throw error;
  }
};

// ========================================
// CONNECTION MANAGEMENT
// ========================================

/**
 * Handle WebSocket connection
 */
async function handleConnect(roomId: string, userId: string, event: any): Promise<string> {
  console.log('🔗 Handling connection:', { roomId, userId });

  if (!userId) {
    throw new Error('User not authenticated');
  }

  const connectionId = generateConnectionId();
  const now = new Date().toISOString();

  try {
    // Store connection info
    const connectionInfo: ConnectionInfo = {
      connectionId,
      userId,
      roomId,
      connectedAt: now,
      lastActivity: now,
      userAgent: event.requestContext?.userAgent,
      status: 'connected'
    };

    await storeConnectionInfo(connectionInfo);

    // Update user's last activity in room
    if (roomId) {
      await updateUserActivity(roomId, userId, now);
      
      // Publish connection status change
      await publishConnectionStatusChange(roomId, {
        userId,
        connectionStatus: 'connected',
        reconnectionAttempts: 0,
        lastSeenAt: now,
        userAgent: connectionInfo.userAgent
      });
    }

    // Log analytics
    await logAnalyticsEvent('connection_established', {
      connectionId,
      userId,
      roomId,
      userAgent: connectionInfo.userAgent
    });

    console.log('✅ Connection established:', connectionId);
    return connectionId;

  } catch (error: any) {
    console.error('❌ Error handling connection:', error);
    throw new Error(`Failed to establish connection: ${error.message}`);
  }
}

/**
 * Handle WebSocket disconnection
 */
async function handleDisconnect(roomId: string, userId: string, event: any): Promise<string> {
  console.log('🔌 Handling disconnection:', { roomId, userId });

  if (!userId) {
    throw new Error('User not authenticated');
  }

  const now = new Date().toISOString();

  try {
    // Update connection status
    await updateConnectionStatus(userId, 'disconnected');

    // Update user's last activity in room
    if (roomId) {
      await updateUserActivity(roomId, userId, now);
      
      // Publish connection status change
      await publishConnectionStatusChange(roomId, {
        userId,
        connectionStatus: 'disconnected',
        reconnectionAttempts: 0,
        lastSeenAt: now
      });
    }

    // Log analytics
    await logAnalyticsEvent('connection_closed', {
      userId,
      roomId
    });

    console.log('✅ Disconnection handled for user:', userId);
    return 'disconnected';

  } catch (error: any) {
    console.error('❌ Error handling disconnection:', error);
    throw new Error(`Failed to handle disconnection: ${error.message}`);
  }
}

// ========================================
// PUBLISHING FUNCTIONS
// ========================================

/**
 * Publish vote update event
 */
async function publishVoteUpdate(roomId: string, voteData: any): Promise<any> {
  console.log('📊 Publishing vote update:', { roomId, voteData });

  const event: RealtimeEvent = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'VOTE_UPDATE',
    userId: voteData.userId,
    data: voteData
  };

  try {
    // Store event in sessions table
    await storeRealtimeEvent(event);

    // Transform for compatibility
    const transformedEvent = {
      id: event.id,
      timestamp: event.timestamp,
      roomId: event.roomId,
      eventType: event.eventType,
      userId: voteData.userId,
      mediaId: voteData.movieId,
      voteType: voteData.voteType || 'LIKE',
      progress: voteData.progress || {
        totalVotes: 0,
        likesCount: 0,
        dislikesCount: 0,
        skipsCount: 0,
        remainingUsers: 0,
        percentage: 0,
        votingUsers: [],
        pendingUsers: []
      }
    };

    // Log analytics
    await logAnalyticsEvent('vote_update_published', {
      roomId,
      eventId: event.id,
      userId: voteData.userId
    });

    console.log('✅ Vote update published:', event.id);
    return transformedEvent;

  } catch (error: any) {
    console.error('❌ Error publishing vote update:', error);
    throw new Error(`Failed to publish vote update: ${error.message}`);
  }
}

/**
 * Publish enhanced vote update event
 */
async function publishVoteUpdateEnhanced(roomId: string, voteData: any): Promise<any> {
  console.log('📊 Publishing enhanced vote update:', { roomId, voteData });

  const event: RealtimeEvent = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'VOTE_UPDATE_ENHANCED',
    userId: voteData.userId,
    data: voteData
  };

  try {
    // Store event
    await storeRealtimeEvent(event);

    // Enhanced format with additional data
    const enhancedEvent = {
      id: event.id,
      timestamp: event.timestamp,
      roomId: event.roomId,
      eventType: event.eventType,
      progress: {
        totalVotes: voteData.progress?.totalVotes || 0,
        likesCount: voteData.progress?.likesCount || 0,
        dislikesCount: voteData.progress?.dislikesCount || 0,
        skipsCount: voteData.progress?.skipsCount || 0,
        remainingUsers: voteData.progress?.remainingUsers || 0,
        percentage: voteData.progress?.percentage || 0,
        votingUsers: voteData.progress?.votingUsers || [],
        pendingUsers: voteData.progress?.pendingUsers || [],
        estimatedTimeToCompletion: voteData.progress?.estimatedTimeToCompletion,
        currentMovieInfo: voteData.progress?.currentMovieInfo
      },
      movieInfo: voteData.movieInfo,
      votingDuration: voteData.votingDuration || 0
    };

    console.log('✅ Enhanced vote update published:', event.id);
    return enhancedEvent;

  } catch (error: any) {
    console.error('❌ Error publishing enhanced vote update:', error);
    throw new Error(`Failed to publish enhanced vote update: ${error.message}`);
  }
}

/**
 * Publish match found event
 */
async function publishMatchFound(roomId: string, matchData: any): Promise<any> {
  console.log('🎯 Publishing match found:', { roomId, matchData });

  const event: RealtimeEvent = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'MATCH_FOUND',
    data: matchData
  };

  try {
    // Store event
    await storeRealtimeEvent(event);

    const transformedEvent = {
      id: event.id,
      timestamp: event.timestamp,
      roomId: event.roomId,
      eventType: event.eventType,
      matchId: matchData.matchId || `match-${event.id}`,
      mediaId: matchData.movieId,
      mediaTitle: matchData.movieInfo?.title,
      participants: matchData.participants || [],
      consensusType: matchData.consensusType || 'MAJORITY',
      movieInfo: matchData.movieInfo
    };

    // Log analytics
    await logAnalyticsEvent('match_found_published', {
      roomId,
      eventId: event.id,
      movieId: matchData.movieId,
      participantCount: matchData.participants?.length || 0
    });

    console.log('✅ Match found published:', event.id);
    return transformedEvent;

  } catch (error: any) {
    console.error('❌ Error publishing match found:', error);
    throw new Error(`Failed to publish match found: ${error.message}`);
  }
}

/**
 * Publish enhanced match found event
 */
async function publishMatchFoundEnhanced(roomId: string, matchData: any): Promise<any> {
  console.log('🎯 Publishing enhanced match found:', { roomId, matchData });

  const event: RealtimeEvent = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'MATCH_FOUND_ENHANCED',
    data: matchData
  };

  try {
    // Store event
    await storeRealtimeEvent(event);

    const enhancedEvent = {
      id: event.id,
      timestamp: event.timestamp,
      roomId: event.roomId,
      eventType: event.eventType,
      matchId: matchData.matchId || `match-${event.id}`,
      movieInfo: matchData.movieInfo,
      participants: (matchData.participants || []).map((p: any) => ({
        userId: p.userId,
        displayName: p.displayName,
        isHost: p.isHost || false,
        connectionStatus: p.connectionStatus || 'connected',
        votingStatus: p.votingStatus || 'voted',
        lastActivity: p.lastActivity || event.timestamp
      })),
      votingDuration: matchData.votingDuration || 0,
      consensusType: matchData.consensusType || 'MAJORITY'
    };

    console.log('✅ Enhanced match found published:', event.id);
    return enhancedEvent;

  } catch (error: any) {
    console.error('❌ Error publishing enhanced match found:', error);
    throw new Error(`Failed to publish enhanced match found: ${error.message}`);
  }
}

/**
 * Publish member update event
 */
async function publishMemberUpdate(roomId: string, memberData: any): Promise<any> {
  console.log('👥 Publishing member update:', { roomId, memberData });

  const event: RealtimeEvent = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'MEMBER_UPDATE',
    userId: memberData.userId,
    data: memberData
  };

  try {
    // Store event
    await storeRealtimeEvent(event);

    const transformedEvent = {
      id: event.id,
      timestamp: event.timestamp,
      roomId: event.roomId,
      eventType: event.eventType,
      userId: memberData.userId,
      action: memberData.action || 'JOINED',
      memberCount: memberData.memberCount || 1,
      memberData: {
        role: memberData.role || 'member',
        status: memberData.status || 'active',
        permissions: memberData.permissions || ['vote'],
        lastActivity: event.timestamp
      }
    };

    console.log('✅ Member update published:', event.id);
    return transformedEvent;

  } catch (error: any) {
    console.error('❌ Error publishing member update:', error);
    throw new Error(`Failed to publish member update: ${error.message}`);
  }
}

/**
 * Publish connection status change event
 */
async function publishConnectionStatusChange(roomId: string, statusData: any): Promise<any> {
  console.log('🔗 Publishing connection status change:', { roomId, statusData });

  const event: RealtimeEvent = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'CONNECTION_STATUS_CHANGE',
    userId: statusData.userId,
    data: statusData
  };

  try {
    // Store event
    await storeRealtimeEvent(event);

    const transformedEvent = {
      id: event.id,
      timestamp: event.timestamp,
      roomId: event.roomId,
      eventType: event.eventType,
      userId: statusData.userId,
      connectionStatus: statusData.connectionStatus,
      reconnectionAttempts: statusData.reconnectionAttempts || 0,
      lastSeenAt: statusData.lastSeenAt || event.timestamp,
      userAgent: statusData.userAgent
    };

    console.log('✅ Connection status change published:', event.id);
    return transformedEvent;

  } catch (error: any) {
    console.error('❌ Error publishing connection status change:', error);
    throw new Error(`Failed to publish connection status change: ${error.message}`);
  }
}

/**
 * Publish room state sync event
 */
async function publishRoomStateSync(roomId: string, stateData: any): Promise<any> {
  console.log('🔄 Publishing room state sync:', { roomId, stateData });

  const event: RealtimeEvent = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'ROOM_STATE_SYNC',
    data: stateData
  };

  try {
    // Store event
    await storeRealtimeEvent(event);

    const transformedEvent = {
      id: event.id,
      timestamp: event.timestamp,
      roomId: event.roomId,
      eventType: event.eventType,
      roomState: {
        currentMovieId: stateData.currentMovieId,
        currentMovieInfo: stateData.currentMovieInfo,
        progress: stateData.progress || {
          totalVotes: 0,
          likesCount: 0,
          dislikesCount: 0,
          skipsCount: 0,
          remainingUsers: 0,
          percentage: 0,
          votingUsers: [],
          pendingUsers: []
        },
        participants: stateData.participants || [],
        roomStatus: stateData.roomStatus || 'WAITING',
        matchFound: stateData.matchFound || false
      },
      syncReason: stateData.syncReason || 'periodic_sync'
    };

    console.log('✅ Room state sync published:', event.id);
    return transformedEvent;

  } catch (error: any) {
    console.error('❌ Error publishing room state sync:', error);
    throw new Error(`Failed to publish room state sync: ${error.message}`);
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Store connection information
 */
async function storeConnectionInfo(connectionInfo: ConnectionInfo): Promise<void> {
  const timestamp = Date.now();
  
  await docClient.send(new PutCommand({
    TableName: SESSIONS_TABLE,
    Item: {
      SessionId: `CONNECTION#${connectionInfo.userId}`,
      Timestamp: timestamp,
      EventType: 'CONNECTION',
      ConnectionId: connectionInfo.connectionId,
      UserId: connectionInfo.userId,
      RoomId: connectionInfo.roomId,
      ConnectedAt: connectionInfo.connectedAt,
      LastActivity: connectionInfo.lastActivity,
      UserAgent: connectionInfo.userAgent,
      Status: connectionInfo.status,
      ExpiresAt: Math.floor(timestamp / 1000) + (24 * 60 * 60) // 24 hours TTL
    }
  }));
}

/**
 * Store realtime event
 */
async function storeRealtimeEvent(event: RealtimeEvent): Promise<void> {
  const timestamp = Date.now();
  
  await docClient.send(new PutCommand({
    TableName: SESSIONS_TABLE,
    Item: {
      SessionId: event.roomId,
      Timestamp: timestamp,
      EventType: event.eventType,
      EventId: event.id,
      UserId: event.userId,
      RoomId: event.roomId,
      Data: event.data,
      CreatedAt: event.timestamp,
      ExpiresAt: Math.floor(timestamp / 1000) + (7 * 24 * 60 * 60) // 7 days TTL
    }
  }));
}

/**
 * Update user activity in room
 */
async function updateUserActivity(roomId: string, userId: string, timestamp: string): Promise<void> {
  try {
    await docClient.send(new UpdateCommand({
      TableName: CORE_TABLE,
      Key: {
        PK: `ROOM#${roomId}`,
        SK: `MEMBER#${userId}`
      },
      UpdateExpression: 'SET LastActivity = :timestamp',
      ExpressionAttributeValues: {
        ':timestamp': timestamp
      },
      ConditionExpression: 'attribute_exists(PK)'
    }));
  } catch (error) {
    console.warn('Failed to update user activity:', error);
  }
}

/**
 * Update connection status
 */
async function updateConnectionStatus(userId: string, status: string): Promise<void> {
  try {
    const timestamp = Date.now();
    
    await docClient.send(new UpdateCommand({
      TableName: SESSIONS_TABLE,
      Key: {
        SessionId: `CONNECTION#${userId}`,
        Timestamp: timestamp
      },
      UpdateExpression: 'SET #status = :status, LastActivity = :timestamp',
      ExpressionAttributeNames: {
        '#status': 'Status'
      },
      ExpressionAttributeValues: {
        ':status': status,
        ':timestamp': new Date().toISOString()
      }
    }));
  } catch (error) {
    console.warn('Failed to update connection status:', error);
  }
}

/**
 * Generate unique connection ID
 */
function generateConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Generate unique event ID
 */
function generateEventId(): string {
  return `event_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Log analytics event
 */
async function logAnalyticsEvent(eventType: string, data: any): Promise<void> {
  try {
    const timestamp = Date.now();
    
    await docClient.send(new PutCommand({
      TableName: ANALYTICS_TABLE,
      Item: {
        MetricType: `realtime_${eventType}`,
        Timestamp: timestamp,
        Data: data,
        ExpiresAt: Math.floor(timestamp / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
      }
    }));
  } catch (error) {
    console.warn('Analytics logging error:', error);
  }
}