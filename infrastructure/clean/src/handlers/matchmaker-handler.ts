/**
 * Trinity Vote Consensus Matchmaker Lambda
 * Implements Vote-Based Matchmaking via DynamoDB Streams
 * 
 * Architecture: Vote → DynamoDB → Stream → Lambda → Check Consensus → AppSync Mutation → Subscription
 */

import { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { logger } from '../shared/logger';
import { getTrinityConfig } from '../shared/config';
import { createDatabase } from '../shared/database';
import { TrinityRoom, TrinityVote, TrinityConfig } from '../shared/types';
import { AppSyncClient, EvaluateCodeCommand } from '@aws-sdk/client-appsync';

interface StreamProcessResult {
  success: boolean;
  action: string;
  roomId?: string;
  movieId?: string;
  participantCount?: number;
  status?: string;
  reason?: string;
  error?: string;
}

interface ConsensusData {
  participants: TrinityVote[];
  consensusReachedAt: string;
  movieId: string;
  movieTitle: string;
  yesVoteCount: number;
  memberCount: number;
}

interface RoomMetadata {
  PK: string;
  SK: string;
  memberCount: number;
  status: string;
  [key: string]: any;
}

/**
 * Main Lambda handler for DynamoDB Streams
 * Detects vote consensus and triggers matchmaking
 */
export const handler = async (event: DynamoDBStreamEvent): Promise<{ processedRecords: number; results: StreamProcessResult[] }> => {
  logger.info('🗳️ Vote Consensus Matchmaker triggered', { recordCount: event.Records.length });
  
  const results: StreamProcessResult[] = [];
  
  for (const record of event.Records) {
    try {
      const result = await processStreamRecord(record);
      results.push(result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('❌ Error processing stream record', err);
      results.push({ success: false, action: 'error', error: err.message });
    }
  }
  
  logger.info('✅ Vote consensus processing complete', { processedRecords: results.length });
  return { processedRecords: results.length, results };
};

/**
 * Process individual DynamoDB Stream record
 * Detects when vote consensus is reached
 */
async function processStreamRecord(record: DynamoDBRecord): Promise<StreamProcessResult> {
  const { eventName, dynamodb } = record;
  
  logger.info(`📝 Processing ${eventName} event`);
  
  // Only process INSERT and MODIFY events for vote counts
  if (!eventName || !['INSERT', 'MODIFY'].includes(eventName)) {
    logger.info('⏭️ Skipping non-INSERT/MODIFY event');
    return { success: true, action: 'skipped', reason: 'not-insert-or-modify' };
  }
  
  const newImage = dynamodb?.NewImage;
  
  // Check if this is a movie vote count record
  if (!newImage?.PK?.S?.startsWith('ROOM#') || !newImage?.SK?.S?.startsWith('MOVIE_VOTES#')) {
    logger.info('⏭️ Skipping non-movie-vote-count record');
    return { success: true, action: 'skipped', reason: 'not-movie-vote-count' };
  }
  
  const roomId = newImage.PK.S.replace('ROOM#', '');
  const movieId = newImage.SK.S.replace('MOVIE_VOTES#', '');
  const yesVoteCount = parseInt(newImage.yesVoteCount?.N || '0');
  
  logger.info(`🎬 Room ${roomId}, Movie ${movieId}: ${yesVoteCount} YES votes`);
  
  // Get room metadata to check member count
  const config = await getTrinityConfig();
  const db = await createDatabase(config);
  
  const roomData = await getRoomMetadata(roomId, db, config);
  if (!roomData) {
    logger.warn(`⚠️ Room ${roomId} not found`);
    return { success: true, action: 'room-not-found', roomId };
  }
  
  const memberCount = roomData.memberCount || 0;
  logger.info(`🏠 Room ${roomId} has ${memberCount} members, ${yesVoteCount} YES votes for movie ${movieId}`);
  
  // Check if consensus is reached (all members voted YES for this movie)
  if (yesVoteCount >= memberCount && memberCount > 0) {
    logger.info(`🎯 CONSENSUS REACHED! Room ${roomId}, Movie ${movieId} - ${yesVoteCount}/${memberCount} YES votes`);
    
    return await triggerConsensusMatch(roomId, movieId, yesVoteCount, memberCount, db, config);
  }
  
  logger.info(`⏳ Consensus not yet reached for room ${roomId}, movie ${movieId} (${yesVoteCount}/${memberCount})`);
  return { 
    success: true, 
    action: 'consensus-pending', 
    roomId, 
    movieId, 
    participantCount: yesVoteCount
  };
}

/**
 * Get room metadata including member count
 */
async function getRoomMetadata(roomId: string, db: any, config: TrinityConfig): Promise<RoomMetadata | null> {
  try {
    const result = await db.get(
      config.tables.matchmaking,
      {
        PK: `ROOM#${roomId}`,
        SK: 'METADATA'
      }
    );
    
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ Error getting room metadata for ${roomId}`, err);
    return null;
  }
}

/**
 * Trigger consensus match when all members vote YES for the same movie
 */
async function triggerConsensusMatch(
  roomId: string, 
  movieId: string, 
  yesVoteCount: number, 
  memberCount: number,
  db: any,
  config: TrinityConfig
): Promise<StreamProcessResult> {
  const startTime = Date.now();
  
  try {
    logger.info(`🚀 Starting consensus match for room ${roomId}, movie ${movieId}`);
    
    // Step 1: Update room status to CONSENSUS_REACHED
    await db.update(
      config.tables.matchmaking,
      {
        PK: `ROOM#${roomId}`,
        SK: 'METADATA'
      },
      'SET #status = :consensusStatus, #currentMovieId = :movieId, #updatedAt = :now',
      {
        conditionExpression: '#status IN (:votingStatus, :waitingStatus)', // Only update if still voting
        expressionAttributeNames: {
          '#status': 'status',
          '#currentMovieId': 'currentMovieId',
          '#updatedAt': 'updatedAt'
        },
        expressionAttributeValues: {
          ':consensusStatus': 'CONSENSUS_REACHED',
          ':votingStatus': 'VOTING_IN_PROGRESS',
          ':waitingStatus': 'WAITING_FOR_MEMBERS',
          ':movieId': movieId,
          ':now': new Date().toISOString()
        }
      }
    );
    
    logger.info(`✅ Room ${roomId} status updated to CONSENSUS_REACHED for movie ${movieId}`);
    
    // Step 2: Get all participants who voted YES
    const participants = await getConsensusParticipants(roomId, movieId, db, config);
    
    // Step 3: Get movie details
    const movieTitle = await getMovieTitle(movieId);
    
    // Step 4: Trigger AppSync publishConsensusReached mutation
    const consensusData: ConsensusData = {
      participants: participants,
      consensusReachedAt: new Date().toISOString(),
      movieId: movieId,
      movieTitle: movieTitle,
      yesVoteCount: yesVoteCount,
      memberCount: memberCount
    };
    
    await publishConsensusReachedEvent(roomId, consensusData, config);
    
    const duration = Date.now() - startTime;
    logger.info(`⏱️ TriggerConsensusMatch: ${duration}ms (SUCCESS)`, { roomId, movieId, participantCount: participants.length });
    
    return {
      success: true,
      action: 'consensus-triggered',
      roomId,
      movieId,
      participantCount: participants.length,
      status: 'CONSENSUS_REACHED'
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ Consensus match failed for room ${roomId}, movie ${movieId}`, err);
    
    // If condition failed, room was already processed
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return {
        success: true,
        action: 'already-processed',
        roomId,
        movieId,
        reason: 'Room already reached consensus'
      };
    }
    
    throw error;
  }
}

/**
 * Get all participants who voted YES for the consensus movie
 */
async function getConsensusParticipants(
  roomId: string, 
  movieId: string, 
  db: any, 
  config: TrinityConfig
): Promise<TrinityVote[]> {
  try {
    const result = await db.query(
      config.tables.matchmaking,
      'PK = :roomPK AND begins_with(SK, :votePrefix)',
      {
        filterExpression: '#movieId = :movieId AND #voteType = :yesVote',
        expressionAttributeNames: {
          '#movieId': 'movieId',
          '#voteType': 'voteType'
        },
        expressionAttributeValues: {
          ':roomPK': `ROOM#${roomId}`,
          ':votePrefix': 'VOTE#',
          ':movieId': movieId,
          ':yesVote': 'YES'
        }
      }
    );
    
    return result.items || [];
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ Error getting consensus participants for room ${roomId}, movie ${movieId}`, err);
    return [];
  }
}

/**
 * Get movie title (integrate with existing Trinity movie service)
 */
async function getMovieTitle(movieId: string): Promise<string> {
  // TODO: Integrate with Trinity's existing movie service or TMDB API
  // For now, return a placeholder
  logger.info(`📽️ Getting movie title for ${movieId} (placeholder)`);
  return `Movie ${movieId}`;
}

/**
 * Publish consensus reached event via AppSync
 */
async function publishConsensusReachedEvent(
  roomId: string, 
  consensusData: ConsensusData, 
  config: TrinityConfig
): Promise<void> {
  const mutation = `
    mutation PublishConsensusReached($roomId: ID!, $consensusData: AWSJSON!) {
      publishConsensusReached(roomId: $roomId, consensusData: $consensusData) {
        roomId
        movieId
        movieTitle
        participants {
          userId
          votedAt
          voteType
        }
        consensusReachedAt
        eventType
      }
    }
  `;
  
  const variables = {
    roomId: roomId,
    consensusData: JSON.stringify(consensusData)
  };
  
  try {
    const appSyncClient = new AppSyncClient({ 
      region: config.region
    });

    // Use AppSync's EvaluateCode for GraphQL execution with IAM auth
    const result = await appSyncClient.send(new EvaluateCodeCommand({
      runtime: {
        name: 'APPSYNC_JS',
        runtimeVersion: '1.0.0'
      },
      code: `
        import { util } from '@aws-appsync/utils';
        
        export function request(ctx) {
          return {
            operation: 'Invoke',
            payload: {
              query: \`${mutation}\`,
              variables: ${JSON.stringify(variables)}
            }
          };
        }
        
        export function response(ctx) {
          return ctx.result;
        }
      `,
      context: JSON.stringify({
        arguments: variables
      })
    }));
    
    logger.info(`✅ Published consensus reached event for room ${roomId}`, { result });
    
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ Failed to publish consensus reached event for room ${roomId}`, err);
    throw error;
  }
}