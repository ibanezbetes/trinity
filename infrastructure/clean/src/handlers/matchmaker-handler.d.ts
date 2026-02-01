/**
 * Trinity Vote Consensus Matchmaker Lambda
 * Implements Vote-Based Matchmaking via DynamoDB Streams
 *
 * Architecture: Vote → DynamoDB → Stream → Lambda → Check Consensus → AppSync Mutation → Subscription
 */
import { DynamoDBStreamEvent } from 'aws-lambda';
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
/**
 * Main Lambda handler for DynamoDB Streams
 * Detects vote consensus and triggers matchmaking
 */
export declare const handler: (event: DynamoDBStreamEvent) => Promise<{
    processedRecords: number;
    results: StreamProcessResult[];
}>;
export {};
