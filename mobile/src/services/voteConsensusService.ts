/**
 * Trinity Vote Consensus Service
 * Integrates with the new Vote Consensus Matchmaking system
 */

import { appSyncService } from './appSyncService';
import { errorLoggingService } from './errorLoggingService';

export type VoteConsensusType = 'YES' | 'NO' | 'SKIP';

export interface VoteConsensusInput {
  roomId: string;
  movieId: string;
  voteType: VoteConsensusType;
}

export interface VoteConsensusRoom {
  id: string;
  status: string;
  memberCount: number;
  currentMovieId?: string;
  consensusReachedAt?: string;
}

export interface VoteConsensusError {
  message: string;
  errorCode: string;
  roomId: string;
  movieId: string;
}

export interface ConsensusReachedEvent {
  roomId: string;
  movieId: string;
  movieTitle: string;
  participants: Array<{
    userId: string;
    votedAt: string;
    voteType: string;
  }>;
  consensusReachedAt: string;
  eventType: string;
}

export interface VoteUpdateEvent {
  roomId: string;
  movieId: string;
  userId: string;
  voteType: VoteConsensusType;
  yesVoteCount: number;
  memberCount: number;
  timestamp: string;
}

class VoteConsensusService {
  /**
   * Vote for a movie using the new consensus system
   */
  async voteForMovie(input: VoteConsensusInput): Promise<VoteConsensusRoom | VoteConsensusError> {
    console.log('🗳️ VoteConsensusService.voteForMovie - Starting consensus vote:', input);
    
    try {
      // Use GraphQL mutation for vote consensus
      const mutation = `
        mutation VoteForMovie($input: VoteMovieInput!) {
          voteForMovie(input: $input) {
            ... on VoteConsensusRoom {
              id
              status
              memberCount
              currentMovieId
              consensusReachedAt
            }
            ... on VoteError {
              message
              errorCode
              roomId
              movieId
            }
          }
        }
      `;

      const variables = {
        input: {
          roomId: input.roomId,
          movieId: input.movieId,
          voteType: input.voteType
        }
      };

      const result = await appSyncService.executeGraphQL(mutation, variables);
      
      if (result.data?.voteForMovie) {
        const response = result.data.voteForMovie;
        
        // Check if it's an error response
        if (response.errorCode) {
          console.error('❌ VoteConsensusService.voteForMovie - Vote error:', response);
          return response as VoteConsensusError;
        }
        
        // Success response
        console.log('✅ VoteConsensusService.voteForMovie - Vote successful:', response);
        return response as VoteConsensusRoom;
      }
      
      throw new Error('Invalid response from vote mutation');
      
    } catch (error: any) {
      console.error('❌ VoteConsensusService.voteForMovie - Failed:', error);
      
      errorLoggingService.logError(error, {
        operation: 'voteForMovie',
        roomId: input.roomId,
        movieId: input.movieId,
        metadata: { voteType: input.voteType }
      });
      
      // Return error in expected format
      return {
        message: error.message || 'Error al votar por la película',
        errorCode: 'VOTE_FAILED',
        roomId: input.roomId,
        movieId: input.movieId
      };
    }
  }

  /**
   * Subscribe to consensus reached events
   */
  async subscribeToConsensusReached(
    roomId: string,
    callback: (event: ConsensusReachedEvent) => void
  ): Promise<(() => void) | null> {
    console.log('🔔 VoteConsensusService.subscribeToConsensusReached - Setting up subscription for room:', roomId);
    
    try {
      const subscription = `
        subscription OnConsensusReached($roomId: ID!) {
          onConsensusReached(roomId: $roomId) {
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

      const variables = { roomId };

      return await appSyncService.subscribeToGraphQL(
        subscription,
        variables,
        (data) => {
          if (data.onConsensusReached) {
            console.log('🎉 VoteConsensusService - Consensus reached event:', data.onConsensusReached);
            callback(data.onConsensusReached);
          }
        }
      );
      
    } catch (error: any) {
      console.error('❌ VoteConsensusService.subscribeToConsensusReached - Failed:', error);
      
      errorLoggingService.logError(error, {
        operation: 'subscribeToConsensusReached',
        roomId
      });
      
      return null;
    }
  }

  /**
   * Subscribe to vote updates for real-time progress
   */
  async subscribeToVoteUpdates(
    roomId: string,
    callback: (event: VoteUpdateEvent) => void
  ): Promise<(() => void) | null> {
    console.log('📊 VoteConsensusService.subscribeToVoteUpdates - Setting up subscription for room:', roomId);
    
    try {
      const subscription = `
        subscription OnVoteUpdate($roomId: ID!) {
          onVoteUpdate(roomId: $roomId) {
            roomId
            movieId
            userId
            voteType
            yesVoteCount
            memberCount
            timestamp
          }
        }
      `;

      const variables = { roomId };

      return await appSyncService.subscribeToGraphQL(
        subscription,
        variables,
        (data) => {
          if (data.onVoteUpdate) {
            console.log('📊 VoteConsensusService - Vote update event:', data.onVoteUpdate);
            callback(data.onVoteUpdate);
          }
        }
      );
      
    } catch (error: any) {
      console.error('❌ VoteConsensusService.subscribeToVoteUpdates - Failed:', error);
      
      errorLoggingService.logError(error, {
        operation: 'subscribeToVoteUpdates',
        roomId
      });
      
      return null;
    }
  }

  /**
   * Subscribe to all consensus events for a room
   */
  async subscribeToAllConsensusEvents(
    roomId: string,
    callbacks: {
      onConsensusReached?: (event: ConsensusReachedEvent) => void;
      onVoteUpdate?: (event: VoteUpdateEvent) => void;
    }
  ): Promise<(() => void) | null> {
    console.log('🔔 VoteConsensusService.subscribeToAllConsensusEvents - Setting up all subscriptions for room:', roomId);
    
    const cleanupFunctions: (() => void)[] = [];
    
    try {
      // Subscribe to consensus reached events
      if (callbacks.onConsensusReached) {
        const consensusCleanup = await this.subscribeToConsensusReached(roomId, callbacks.onConsensusReached);
        if (consensusCleanup) cleanupFunctions.push(consensusCleanup);
      }
      
      // Subscribe to vote updates
      if (callbacks.onVoteUpdate) {
        const voteCleanup = await this.subscribeToVoteUpdates(roomId, callbacks.onVoteUpdate);
        if (voteCleanup) cleanupFunctions.push(voteCleanup);
      }
      
      // Return master cleanup function
      return () => {
        console.log(`🧹 VoteConsensusService - Cleaning up all consensus subscriptions for room ${roomId}`);
        cleanupFunctions.forEach(cleanup => cleanup());
      };
      
    } catch (error: any) {
      console.error('❌ VoteConsensusService.subscribeToAllConsensusEvents - Failed:', error);
      
      // Cleanup any successful subscriptions
      cleanupFunctions.forEach(cleanup => cleanup());
      return null;
    }
  }

  /**
   * Get current vote status for a room and movie
   */
  async getVoteStatus(roomId: string, movieId: string): Promise<{
    yesVoteCount: number;
    memberCount: number;
    consensusReached: boolean;
    participants: string[];
  } | null> {
    console.log('📊 VoteConsensusService.getVoteStatus - Getting vote status:', { roomId, movieId });
    
    try {
      const query = `
        query GetVoteStatus($roomId: ID!, $movieId: ID!) {
          getVoteStatus(roomId: $roomId, movieId: $movieId) {
            yesVoteCount
            memberCount
            consensusReached
            participants
          }
        }
      `;

      const variables = { roomId, movieId };

      const result = await appSyncService.executeGraphQL(query, variables);
      
      if (result.data?.getVoteStatus) {
        console.log('✅ VoteConsensusService.getVoteStatus - Status retrieved:', result.data.getVoteStatus);
        return result.data.getVoteStatus;
      }
      
      return null;
      
    } catch (error: any) {
      console.error('❌ VoteConsensusService.getVoteStatus - Failed:', error);
      
      errorLoggingService.logError(error, {
        operation: 'getVoteStatus',
        roomId,
        movieId
      });
      
      return null;
    }
  }

  /**
   * Check if consensus has been reached for a specific movie
   */
  async checkConsensusStatus(roomId: string, movieId: string): Promise<boolean> {
    const status = await this.getVoteStatus(roomId, movieId);
    return status?.consensusReached || false;
  }

  /**
   * Get vote progress as percentage
   */
  async getVoteProgress(roomId: string, movieId: string): Promise<number> {
    const status = await this.getVoteStatus(roomId, movieId);
    if (!status || status.memberCount === 0) return 0;
    
    return Math.round((status.yesVoteCount / status.memberCount) * 100);
  }
}

export const voteConsensusService = new VoteConsensusService();