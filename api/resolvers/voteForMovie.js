/**
 * AppSync JS Resolver for voteForMovie mutation
 * Implements Vote Consensus Matchmaking with TransactWriteItems
 * Triggers match when all room members vote YES for the same movie
 */

import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const { roomId, movieId, voteType } = ctx.arguments.input;
  const userId = ctx.identity.sub; // Get user ID from Cognito JWT
  const now = util.time.nowISO8601();
  
  // Single Table Design keys
  const roomPK = `ROOM#${roomId}`;
  const roomSK = 'METADATA';
  const votePK = `ROOM#${roomId}`;
  const voteSK = `VOTE#${movieId}#${userId}`;
  const movieVoteCountPK = `ROOM#${roomId}`;
  const movieVoteCountSK = `MOVIE_VOTES#${movieId}`;
  
  console.log(`🗳️ VoteForMovie Request: User ${userId} voting ${voteType} for movie ${movieId} in room ${roomId}`);
  
  return {
    operation: 'TransactWriteItems',
    transactItems: [
      // 1. Verify room exists and is in voting state
      {
        table: util.dynamodb.toMapValues({
          TableName: 'trinity-matchmaking-dev'
        }),
        operation: 'Update',
        key: util.dynamodb.toMapValues({
          PK: roomPK,
          SK: roomSK
        }),
        condition: {
          expression: '#status IN (:waitingStatus, :votingStatus) AND attribute_exists(PK)',
          expressionNames: {
            '#status': 'status'
          },
          expressionValues: util.dynamodb.toMapValues({
            ':waitingStatus': 'WAITING_FOR_MEMBERS',
            ':votingStatus': 'VOTING_IN_PROGRESS'
          })
        },
        update: {
          expression: 'SET #status = :votingStatus, #updatedAt = :now',
          expressionNames: {
            '#status': 'status',
            '#updatedAt': 'updatedAt'
          },
          expressionValues: util.dynamodb.toMapValues({
            ':votingStatus': 'VOTING_IN_PROGRESS',
            ':now': now
          })
        }
      },
      // 2. Create or update user's vote
      {
        table: util.dynamodb.toMapValues({
          TableName: 'trinity-matchmaking-dev'
        }),
        operation: 'Put',
        key: util.dynamodb.toMapValues({
          PK: votePK,
          SK: voteSK
        }),
        attributeValues: util.dynamodb.toMapValues({
          PK: votePK,
          SK: voteSK,
          roomId: roomId,
          movieId: movieId,
          userId: userId,
          voteType: voteType,
          votedAt: now,
          entityType: 'USER_VOTE',
          GSI1PK: `USER#${userId}`,
          GSI1SK: `VOTE#${roomId}#${movieId}`,
          // TTL: 24 hours from now
          ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
        })
      },
      // 3. Update movie vote count (only for YES votes)
      ...(voteType === 'YES' ? [{
        table: util.dynamodb.toMapValues({
          TableName: 'trinity-matchmaking-dev'
        }),
        operation: 'Update',
        key: util.dynamodb.toMapValues({
          PK: movieVoteCountPK,
          SK: movieVoteCountSK
        }),
        update: {
          expression: 'ADD #yesCount :increment SET #movieId = :movieId, #updatedAt = :now, #entityType = :entityType',
          expressionNames: {
            '#yesCount': 'yesVoteCount',
            '#movieId': 'movieId',
            '#updatedAt': 'updatedAt',
            '#entityType': 'entityType'
          },
          expressionValues: util.dynamodb.toMapValues({
            ':increment': 1,
            ':movieId': movieId,
            ':now': now,
            ':entityType': 'MOVIE_VOTE_COUNT'
          })
        }
      }] : [])
    ]
  };
}

export function response(ctx) {
  const { error, result } = ctx;
  
  if (error) {
    console.error('❌ VoteForMovie TransactWriteItems Error:', JSON.stringify(error, null, 2));
    
    // Handle TransactionCanceledException
    if (error.type === 'DynamoDB:TransactionCanceledException') {
      const cancellationReasons = error.cancellationReasons || [];
      
      // Check if room doesn't exist or is not in voting state
      if (cancellationReasons.some(reason => 
          reason.code === 'ConditionalCheckFailed' && 
          reason.item && reason.item.PK && reason.item.PK.S.startsWith('ROOM#'))) {
        
        return {
          __typename: 'VoteError',
          message: 'Room is not available for voting or does not exist',
          errorCode: 'ROOM_NOT_AVAILABLE',
          roomId: ctx.arguments.input.roomId,
          movieId: ctx.arguments.input.movieId
        };
      }
    }
    
    // Re-throw other errors
    util.error(error.message, error.type);
  }
  
  console.log('✅ VoteForMovie Success:', JSON.stringify(result, null, 2));
  
  // Transaction succeeded - return success indicator for pipeline
  return {
    success: true,
    roomId: ctx.arguments.input.roomId,
    movieId: ctx.arguments.input.movieId,
    userId: ctx.identity.sub,
    voteType: ctx.arguments.input.voteType
  };
}