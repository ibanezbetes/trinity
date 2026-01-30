/**
 * AppSync JS Subscription Resolver for onVoteUpdate
 * Enhanced Subscription Filtering for vote-based updates
 */

import { util } from '@aws-appsync/utils';

export function request(ctx) {
  // This is a subscription resolver - no request to data source needed
  return {};
}

export function response(ctx) {
  const { roomId } = ctx.arguments;
  const payload = ctx.result;
  
  console.log(`🔔 Vote Subscription Filter Check: Room ${roomId}, Payload:`, JSON.stringify(payload, null, 2));
  
  // Enhanced Subscription Filtering for vote updates
  // Only send updates to clients subscribed to this specific roomId
  if (payload && payload.roomId === roomId) {
    console.log(`✅ Vote Subscription Filter PASS: Sending update for room ${roomId}`);
    
    // Set subscription filter for server-side filtering
    util.extensions.setSubscriptionFilter({
      roomId: { eq: roomId }
    });
    
    return payload;
  }
  
  console.log(`❌ Vote Subscription Filter BLOCK: Room mismatch (expected: ${roomId}, got: ${payload?.roomId})`);
  return null; // Block this update
}