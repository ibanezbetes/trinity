/**
 * AppSync JS Resolver for publishConsensusReached mutation
 * Backend-only mutation protected by IAM for vote consensus events
 */

import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const { roomId, consensusData } = ctx.arguments;
  const now = util.time.nowISO8601();
  
  console.log(`🎉 PublishConsensusReached: Room ${roomId} reached vote consensus`);
  
  // This is a pass-through resolver for publishing consensus events
  // The actual room status update happens in the Lambda
  return {
    operation: 'PutItem',
    key: util.dynamodb.toMapValues({
      PK: `EVENT#${roomId}`,
      SK: `CONSENSUS_REACHED#${now}`
    }),
    attributeValues: util.dynamodb.toMapValues({
      PK: `EVENT#${roomId}`,
      SK: `CONSENSUS_REACHED#${now}`,
      roomId: roomId,
      eventType: 'CONSENSUS_REACHED',
      consensusData: consensusData,
      publishedAt: now,
      entityType: 'CONSENSUS_EVENT',
      // TTL: 1 hour from now (events are ephemeral)
      ttl: Math.floor(Date.now() / 1000) + (60 * 60)
    })
  };
}

export function response(ctx) {
  const { error, result } = ctx;
  
  if (error) {
    console.error('❌ PublishConsensusReached Error:', JSON.stringify(error, null, 2));
    util.error(error.message, error.type);
  }
  
  console.log('✅ PublishConsensusReached Success:', JSON.stringify(result, null, 2));
  
  const consensusData = JSON.parse(ctx.arguments.consensusData);
  
  // Return VoteConsensusEvent for subscription
  return {
    roomId: ctx.arguments.roomId,
    movieId: consensusData.movieId,
    movieTitle: consensusData.movieTitle || `Movie ${consensusData.movieId}`,
    participants: consensusData.participants || [],
    consensusReachedAt: consensusData.consensusReachedAt || util.time.nowISO8601(),
    eventType: 'CONSENSUS_REACHED'
  };
}