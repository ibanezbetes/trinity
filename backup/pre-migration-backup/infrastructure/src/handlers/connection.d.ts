/**
 * Connection Handler for AppSync WebSocket Events
 * Handles user connections, disconnections, and state synchronization
 */
import { AppSyncResolverHandler } from 'aws-lambda';
/**
 * Connection Handler: Manages WebSocket connections for real-time updates
 * Handles connection lifecycle and triggers state synchronization
 */
export declare const handler: AppSyncResolverHandler<any, any>;
/**
 * WebSocket connection event handler (for API Gateway WebSocket)
 * This would be used if implementing with API Gateway WebSocket instead of AppSync
 */
export declare const websocketHandler: (event: any) => Promise<{
    statusCode: number;
    body: string;
}>;
