import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * RealtimeHandler: AppSync Subscriptions
 * Maneja la publicación de eventos en tiempo real para subscriptions
 */
export const handler: AppSyncResolverHandler<any, any> = async (event: AppSyncResolverEvent<any>) => {
  console.log('📡 Realtime Handler:', JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const args = event.arguments;
  const { sub: userId } = event.identity as any; // Usuario autenticado

  try {
    switch (fieldName) {
      case 'publishRoomEvent':
        return await publishRoomEvent(userId, args.roomId, args.eventType, args.data);
      
      case 'publishVoteEvent':
        return await publishVoteEvent(userId, args.roomId, args.voteData);
      
      case 'publishMatchEvent':
        return await publishMatchEvent(userId, args.roomId, args.matchData);
      
      case 'publishMemberEvent':
        return await publishMemberEvent(userId, args.roomId, args.memberData);
      
      case 'publishRoleEvent':
        return await publishRoleEvent(userId, args.roomId, args.roleData);
      
      case 'publishModerationEvent':
        return await publishModerationEvent(userId, args.roomId, args.moderationData);
      
      case 'publishScheduleEvent':
        return await publishScheduleEvent(userId, args.roomId, args.scheduleData);
      
      case 'publishThemeEvent':
        return await publishThemeEvent(userId, args.roomId, args.themeData);
      
      case 'publishSettingsEvent':
        return await publishSettingsEvent(userId, args.roomId, args.settingsData);
      
      case 'publishChatEvent':
        return await publishChatEvent(userId, args.roomId, args.chatData);
      
      case 'publishSuggestionEvent':
        return await publishSuggestionEvent(userId, args.roomId, args.suggestionData);
      
      default:
        throw new Error(`Operación no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`❌ Error en ${fieldName}:`, error);
    throw error;
  }
};

/**
 * Validar que el usuario tiene acceso a la sala
 */
async function validateRoomAccess(userId: string, roomId: string): Promise<boolean> {
  try {
    const response = await docClient.send(new GetCommand({
      TableName: process.env.ROOM_MEMBERS_TABLE!,
      Key: { roomId, userId },
    }));

    return response.Item?.isActive === true;
  } catch (error) {
    console.warn('⚠️ Error validando acceso a sala:', error);
    return false;
  }
}

/**
 * Publicar evento general de sala
 */
async function publishRoomEvent(userId: string, roomId: string, eventType: string, data: any): Promise<any> {
  // Validar acceso
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Usuario no tiene acceso a esta sala');
  }

  const event = {
    id: `room_${roomId}_${Date.now()}`,
    timestamp: new Date().toISOString(),
    roomId,
    eventType,
    data: typeof data === 'string' ? data : JSON.stringify(data),
  };

  console.log(`📡 Publishing room event: ${eventType} for room ${roomId}`);
  return event;
}

/**
 * Publicar evento de voto
 */
async function publishVoteEvent(userId: string, roomId: string, voteData: any): Promise<any> {
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Usuario no tiene acceso a esta sala');
  }

  const parsedData = typeof voteData === 'string' ? JSON.parse(voteData) : voteData;
  
  const event = {
    id: `vote_${roomId}_${userId}_${Date.now()}`,
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'VOTE_UPDATE',
    userId,
    mediaId: parsedData.mediaId,
    voteType: parsedData.voteType || 'LIKE',
    progress: parsedData.progress || {
      totalVotes: 0,
      likesCount: 0,
      dislikesCount: 0,
      skipsCount: 0,
      remainingUsers: 0,
      percentage: 0
    }
  };

  console.log(`🗳️ Publishing vote event for room ${roomId}, user ${userId}`);
  return event;
}

/**
 * Publicar evento de match encontrado
 */
async function publishMatchEvent(userId: string, roomId: string, matchData: any): Promise<any> {
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Usuario no tiene acceso a esta sala');
  }

  const parsedData = typeof matchData === 'string' ? JSON.parse(matchData) : matchData;
  
  const event = {
    id: `match_${roomId}_${Date.now()}`,
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'MATCH_FOUND',
    matchId: parsedData.matchId || `match_${roomId}_${parsedData.mediaId}`,
    mediaId: parsedData.mediaId,
    mediaTitle: parsedData.mediaTitle || 'Unknown Movie',
    participants: parsedData.participants || [],
    consensusType: parsedData.consensusType || 'UNANIMOUS'
  };

  console.log(`🎉 Publishing match event for room ${roomId}: ${parsedData.mediaTitle}`);
  return event;
}

/**
 * Publicar evento de miembro
 */
async function publishMemberEvent(userId: string, roomId: string, memberData: any): Promise<any> {
  const hasAccess = await validateRoomAccess(userId, roomId);
  if (!hasAccess) {
    throw new Error('Usuario no tiene acceso a esta sala');
  }

  const parsedData = typeof memberData === 'string' ? JSON.parse(memberData) : memberData;
  
  const event = {
    id: `member_${roomId}_${userId}_${Date.now()}`,
    timestamp: new Date().toISOString(),
    roomId,
    eventType: 'MEMBER_UPDATE',
    userId: parsedData.userId || userId,
    action: parsedData.action || 'JOINED',
    memberCount: parsedData.memberCount || 1,
    memberData: parsedData.memberData || null
  };

  console.log(`👥 Publishing member event for room ${roomId}: ${parsedData.action}`);
  return event;
}

/**
 * Publicar eventos de características avanzadas (stubs para futuro)
 */
async function publishRoleEvent(userId: string, roomId: string, roleData: any): Promise<any> {
  console.log(`👑 Role event (future feature): ${roomId}`);
  return { id: `role_${Date.now()}`, timestamp: new Date().toISOString(), roomId, eventType: 'ROLE_UPDATE' };
}

async function publishModerationEvent(userId: string, roomId: string, moderationData: any): Promise<any> {
  console.log(`🛡️ Moderation event (future feature): ${roomId}`);
  return { id: `mod_${Date.now()}`, timestamp: new Date().toISOString(), roomId, eventType: 'MODERATION_ACTION' };
}

async function publishScheduleEvent(userId: string, roomId: string, scheduleData: any): Promise<any> {
  console.log(`📅 Schedule event (future feature): ${roomId}`);
  return { id: `schedule_${Date.now()}`, timestamp: new Date().toISOString(), roomId, eventType: 'SCHEDULE_UPDATE' };
}

async function publishThemeEvent(userId: string, roomId: string, themeData: any): Promise<any> {
  console.log(`🎨 Theme event (future feature): ${roomId}`);
  return { id: `theme_${Date.now()}`, timestamp: new Date().toISOString(), roomId, eventType: 'THEME_CHANGE' };
}

async function publishSettingsEvent(userId: string, roomId: string, settingsData: any): Promise<any> {
  console.log(`⚙️ Settings event (future feature): ${roomId}`);
  return { id: `settings_${Date.now()}`, timestamp: new Date().toISOString(), roomId, eventType: 'SETTINGS_CHANGE' };
}

async function publishChatEvent(userId: string, roomId: string, chatData: any): Promise<any> {
  console.log(`💬 Chat event (future feature): ${roomId}`);
  return { id: `chat_${Date.now()}`, timestamp: new Date().toISOString(), roomId, eventType: 'CHAT_MESSAGE' };
}

async function publishSuggestionEvent(userId: string, roomId: string, suggestionData: any): Promise<any> {
  console.log(`💡 Suggestion event (future feature): ${roomId}`);
  return { id: `suggestion_${Date.now()}`, timestamp: new Date().toISOString(), roomId, eventType: 'CONTENT_SUGGESTION' };
}