/**
 * Trinity Vote Consensus Matchmaker Lambda
 * Implements Vote-Based Matchmaking via DynamoDB Streams
 * 
 * Architecture: Vote → DynamoDB → Stream → Lambda → Check Consensus → AppSync Mutation → Subscription
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { AppSyncClient, EvaluateCodeCommand } = require('@aws-sdk/client-appsync');
const { fromNodeProviderChain } = require('@aws-sdk/credential-providers');

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const appSyncClient = new AppSyncClient({ 
  region: process.env.AWS_REGION || 'eu-west-1',
  credentials: fromNodeProviderChain()
});

/**
 * Main Lambda handler for DynamoDB Streams
 * Detects vote consensus and triggers matchmaking
 */
exports.handler = async (event) => {
  console.log('🗳️ Vote Consensus Matchmaker triggered:', JSON.stringify(event, null, 2));
  
  const results = [];
  
  for (const record of event.Records) {
    try {
      const result = await processStreamRecord(record);
      results.push(result);
    } catch (error) {
      console.error('❌ Error processing stream record:', error);
      results.push({ success: false, error: error.message });
    }
  }
  
  console.log('✅ Vote consensus processing complete:', results);
  return { processedRecords: results.length, results };
};

/**
 * Process individual DynamoDB Stream record
 * Detects when vote consensus is reached
 */
async function processStreamRecord(record) {
  const { eventName, dynamodb } = record;
  
  console.log(`📝 Processing ${eventName} event`);
  
  // Only process INSERT and MODIFY events for vote counts
  if (!['INSERT', 'MODIFY'].includes(eventName)) {
    console.log('⏭️ Skipping non-INSERT/MODIFY event');
    return { success: true, action: 'skipped', reason: 'not-insert-or-modify' };
  }
  
  const newImage = dynamodb.NewImage;
  
  // Check if this is a movie vote count record
  if (!newImage?.PK?.S?.startsWith('ROOM#') || !newImage?.SK?.S?.startsWith('MOVIE_VOTES#')) {
    console.log('⏭️ Skipping non-movie-vote-count record');
    return { success: true, action: 'skipped', reason: 'not-movie-vote-count' };
  }
  
  const roomId = newImage.PK.S.replace('ROOM#', '');
  const movieId = newImage.SK.S.replace('MOVIE_VOTES#', '');
  const yesVoteCount = parseInt(newImage.yesVoteCount?.N || '0');
  
  console.log(`🎬 Room ${roomId}, Movie ${movieId}: ${yesVoteCount} YES votes`);
  
  // Get room metadata to check member count
  const roomData = await getRoomMetadata(roomId);
  if (!roomData) {
    console.log(`⚠️ Room ${roomId} not found`);
    return { success: true, action: 'room-not-found', roomId };
  }
  
  const memberCount = roomData.memberCount || 0;
  console.log(`🏠 Room ${roomId} has ${memberCount} members, ${yesVoteCount} YES votes for movie ${movieId}`);
  
  // Check if consensus is reached (all members voted YES for this movie)
  if (yesVoteCount >= memberCount && memberCount > 0) {
    console.log(`🎯 CONSENSUS REACHED! Room ${roomId}, Movie ${movieId} - ${yesVoteCount}/${memberCount} YES votes`);
    
    return await triggerConsensusMatch(roomId, movieId, yesVoteCount, memberCount);
  }
  
  console.log(`⏳ Consensus not yet reached for room ${roomId}, movie ${movieId} (${yesVoteCount}/${memberCount})`);
  return { 
    success: true, 
    action: 'consensus-pending', 
    roomId, 
    movieId, 
    yesVotes: yesVoteCount, 
    memberCount 
  };
}

/**
 * Get room metadata including member count
 */
async function getRoomMetadata(roomId) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: process.env.MATCHMAKING_TABLE_NAME || 'trinity-matchmaking-dev',
      Key: {
        PK: `ROOM#${roomId}`,
        SK: 'METADATA'
      }
    }));
    
    return result.Item;
  } catch (error) {
    console.error(`❌ Error getting room metadata for ${roomId}:`, error);
    return null;
  }
}

/**
 * Trigger consensus match when all members vote YES for the same movie
 */
async function triggerConsensusMatch(roomId, movieId, yesVoteCount, memberCount) {
  const timer = new PerformanceTimer('TriggerConsensusMatch');
  
  try {
    console.log(`🚀 Starting consensus match for room ${roomId}, movie ${movieId}`);
    
    // Step 1: Update room status to CONSENSUS_REACHED
    const updateResult = await docClient.send(new UpdateCommand({
      TableName: process.env.MATCHMAKING_TABLE_NAME || 'trinity-matchmaking-dev',
      Key: {
        PK: `ROOM#${roomId}`,
        SK: 'METADATA'
      },
      UpdateExpression: 'SET #status = :consensusStatus, #currentMovieId = :movieId, #updatedAt = :now',
      ConditionExpression: '#status IN (:votingStatus, :waitingStatus)', // Only update if still voting
      ExpressionAttributeNames: {
        '#status': 'status',
        '#currentMovieId': 'currentMovieId',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':consensusStatus': 'CONSENSUS_REACHED',
        ':votingStatus': 'VOTING_IN_PROGRESS',
        ':waitingStatus': 'WAITING_FOR_MEMBERS',
        ':movieId': movieId,
        ':now': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));
    
    console.log(`✅ Room ${roomId} status updated to CONSENSUS_REACHED for movie ${movieId}`);
    
    // Step 2: Get all participants who voted YES
    const participants = await getConsensusParticipants(roomId, movieId);
    
    // Step 3: Get movie details (you might want to integrate with TMDB here)
    const movieTitle = await getMovieTitle(movieId);
    
    // Step 4: Trigger AppSync publishConsensusReached mutation
    const consensusData = {
      participants: participants,
      consensusReachedAt: new Date().toISOString(),
      movieId: movieId,
      movieTitle: movieTitle,
      yesVoteCount: yesVoteCount,
      memberCount: memberCount
    };
    
    await publishConsensusReachedEvent(roomId, consensusData);
    
    timer.finish(true, undefined, { roomId, movieId, participantCount: participants.length });
    
    return {
      success: true,
      action: 'consensus-triggered',
      roomId,
      movieId,
      participantCount: participants.length,
      status: 'CONSENSUS_REACHED'
    };
    
  } catch (error) {
    console.error(`❌ Consensus match failed for room ${roomId}, movie ${movieId}:`, error);
    timer.finish(false, error.name);
    
    // If condition failed, room was already processed
    if (error.name === 'ConditionalCheckFailedException') {
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
async function getConsensusParticipants(roomId, movieId) {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: process.env.MATCHMAKING_TABLE_NAME || 'trinity-matchmaking-dev',
      KeyConditionExpression: 'PK = :roomPK AND begins_with(SK, :votePrefix)',
      FilterExpression: '#movieId = :movieId AND #voteType = :yesVote',
      ExpressionAttributeNames: {
        '#movieId': 'movieId',
        '#voteType': 'voteType'
      },
      ExpressionAttributeValues: {
        ':roomPK': `ROOM#${roomId}`,
        ':votePrefix': 'VOTE#',
        ':movieId': movieId,
        ':yesVote': 'YES'
      }
    }));
    
    return result.Items || [];
  } catch (error) {
    console.error(`❌ Error getting consensus participants for room ${roomId}, movie ${movieId}:`, error);
    return [];
  }
}

/**
 * Get movie title (integrate with existing Trinity movie service)
 */
async function getMovieTitle(movieId) {
  // TODO: Integrate with Trinity's existing movie service or TMDB API
  // For now, return a placeholder
  return `Movie ${movieId}`;
}

/**
 * Publish consensus reached event via AppSync
 */
async function publishConsensusReachedEvent(roomId, consensusData) {
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
      context: {
        arguments: variables
      }
    }));
    
    console.log(`✅ Published consensus reached event for room ${roomId}:`, result);
    
  } catch (error) {
    console.error(`❌ Failed to publish consensus reached event for room ${roomId}:`, error);
    throw error;
  }
}

/**
 * Performance timer utility
 */
class PerformanceTimer {
  constructor(operation) {
    this.operation = operation;
    this.startTime = Date.now();
  }
  
  finish(success, errorType, data) {
    const duration = Date.now() - this.startTime;
    console.log(`⏱️ ${this.operation}: ${duration}ms (${success ? 'SUCCESS' : 'FAILED'})`, { errorType, data });
  }
}