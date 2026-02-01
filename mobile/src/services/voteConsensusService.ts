/**
 * Trinity Vote Consensus Service
 * Updated for new VoteResponse structure and individual voting system
 */

import { appSyncService } from './appSyncService';
import { errorLoggingService } from './errorLoggingService';
import { VoteType, VoteInput, VoteResponse, VoteResponseEvent, UserVotingProgress } from '../types';

class VoteConsensusService {
  /**
   * Vote for a movie using the new individual voting system with VoteResponse
   */
  async voteForMovie(input: VoteInput): Promise<VoteResponse> {
    console.log('🗳️ VoteConsensusService.voteForMovie - Starting vote with new system:', input);
    
    try {
      // Use the updated AppSyncService vote method
      const result = await appSyncService.vote(input.roomId, input.movieId, input.voteType);
      
      if (result.vote) {
        const voteResponse: VoteResponse = result.vote;
        
        console.log('✅ VoteConsensusService.voteForMovie - Vote response:', voteResponse);
        
        // Handle different response types
        switch (voteResponse.responseType) {
          case 'VOTE_RECORDED':
            console.log('📝 Vote recorded successfully');
            break;
            
          case 'MATCH_FOUND':
            console.log('🎉 MATCH FOUND!', voteResponse.matchInfo);
            // The UI should handle this by showing match popup
            break;
            
          case 'VOTE_IGNORED_MATCH_FOUND':
            console.log('🎯 Vote ignored - match already found');
            break;
            
          case 'ERROR':
            console.error('❌ Vote error:', voteResponse.error);
            break;
        }
        
        return voteResponse;
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
      
      // Return error in VoteResponse format
      return {
        success: false,
        responseType: 'ERROR',
        error: error.message || 'Error al votar por la película',
        message: 'Vote failed'
      };
    }
  }

  /**
   * Subscribe to vote response events using the new VoteResponse subscription
   */
  async subscribeToVoteResponses(
    roomId: string,
    callback: (event: VoteResponseEvent) => void
  ): Promise<(() => void) | null> {
    console.log('🔔 VoteConsensusService.subscribeToVoteResponses - Setting up subscription for room:', roomId);
    
    try {
      const subscription = `
        subscription OnVoteResponse($roomId: ID!) {
          onVoteResponse(roomId: $roomId) {
            success
            responseType
            room {
              id
              status
              memberCount
              matchFound
              userFinished
              message
              currentVotes
              totalMembers
              userProgress
            }
            matchInfo {
              movieId
              movieTitle
              movieInfo {
                id
                title
                overview
                poster
                rating
                runtime
                year
                genres
              }
              matchedAt
              participants
              roomId
            }
            message
            error
          }
        }
      `;

      const variables = { roomId };

      return await appSyncService.subscribeToGraphQL(
        subscription,
        variables,
        (data) => {
          if (data.onVoteResponse) {
            console.log('📡 VoteConsensusService - Vote response event:', data.onVoteResponse);
            callback(data.onVoteResponse);
          }
        }
      );
      
    } catch (error: any) {
      console.error('❌ VoteConsensusService.subscribeToVoteResponses - Failed:', error);
      
      errorLoggingService.logError(error, {
        operation: 'subscribeToVoteResponses',
        roomId
      });
      
      return null;
    }
  }

  /**
   * Subscribe to match found events (enhanced version)
   */
  async subscribeToMatchFound(
    roomId: string,
    callback: (matchInfo: VoteResponse['matchInfo']) => void
  ): Promise<(() => void) | null> {
    console.log('🎉 VoteConsensusService.subscribeToMatchFound - Setting up match subscription for room:', roomId);
    
    try {
      const subscription = `
        subscription OnMatchFoundEnhanced($roomId: ID!) {
          onMatchFoundEnhanced(roomId: $roomId) {
            matchId
            movieInfo {
              id
              title
              overview
              poster
              rating
              runtime
              year
              genres
            }
            participants {
              userId
              displayName
              isHost
              votingStatus
              connectionStatus
              lastActivity
            }
            consensusType
            votingDuration
            timestamp
          }
        }
      `;

      const variables = { roomId };

      return await appSyncService.subscribeToGraphQL(
        subscription,
        variables,
        (data) => {
          if (data.onMatchFoundEnhanced) {
            console.log('🎉 VoteConsensusService - Enhanced match found event:', data.onMatchFoundEnhanced);
            
            // Transform to matchInfo format
            const matchInfo = {
              movieId: data.onMatchFoundEnhanced.movieInfo.id,
              movieTitle: data.onMatchFoundEnhanced.movieInfo.title,
              movieInfo: data.onMatchFoundEnhanced.movieInfo,
              matchedAt: data.onMatchFoundEnhanced.timestamp,
              participants: data.onMatchFoundEnhanced.participants.map((p: any) => p.userId),
              roomId: roomId
            };
            
            callback(matchInfo);
          }
        }
      );
      
    } catch (error: any) {
      console.error('❌ VoteConsensusService.subscribeToMatchFound - Failed:', error);
      
      errorLoggingService.logError(error, {
        operation: 'subscribeToMatchFound',
        roomId
      });
      
      return null;
    }
  }

  /**
   * Subscribe to all voting events for a room
   */
  async subscribeToAllVotingEvents(
    roomId: string,
    callbacks: {
      onVoteResponse?: (event: VoteResponseEvent) => void;
      onMatchFound?: (matchInfo: VoteResponse['matchInfo']) => void;
    }
  ): Promise<(() => void) | null> {
    console.log('🔔 VoteConsensusService.subscribeToAllVotingEvents - Setting up all subscriptions for room:', roomId);
    
    const cleanupFunctions: (() => void)[] = [];
    
    try {
      // Subscribe to vote responses
      if (callbacks.onVoteResponse) {
        const voteCleanup = await this.subscribeToVoteResponses(roomId, callbacks.onVoteResponse);
        if (voteCleanup) cleanupFunctions.push(voteCleanup);
      }
      
      // Subscribe to match found events
      if (callbacks.onMatchFound) {
        const matchCleanup = await this.subscribeToMatchFound(roomId, callbacks.onMatchFound);
        if (matchCleanup) cleanupFunctions.push(matchCleanup);
      }
      
      // Return master cleanup function
      return () => {
        console.log(`🧹 VoteConsensusService - Cleaning up all voting subscriptions for room ${roomId}`);
        cleanupFunctions.forEach(cleanup => cleanup());
      };
      
    } catch (error: any) {
      console.error('❌ VoteConsensusService.subscribeToAllVotingEvents - Failed:', error);
      
      // Cleanup any successful subscriptions
      cleanupFunctions.forEach(cleanup => cleanup());
      return null;
    }
  }

  /**
   * Get user voting progress using the new individual system
   */
  async getUserVotingProgress(roomId: string): Promise<UserVotingProgress | null> {
    console.log('📊 VoteConsensusService.getUserVotingProgress - Getting progress for room:', roomId);
    
    try {
      const result = await appSyncService.getUserVotingProgress(roomId);
      
      if (result.getUserVotingProgress) {
        console.log('✅ VoteConsensusService.getUserVotingProgress - Progress retrieved:', result.getUserVotingProgress);
        return result.getUserVotingProgress;
      }
      
      return null;
      
    } catch (error: any) {
      console.error('❌ VoteConsensusService.getUserVotingProgress - Failed:', error);
      
      errorLoggingService.logError(error, {
        operation: 'getUserVotingProgress',
        roomId
      });
      
      return null;
    }
  }

  /**
   * Get next movie for user using the new individual system
   */
  async getNextMovieForUser(roomId: string): Promise<any | null> {
    console.log('🎬 VoteConsensusService.getNextMovieForUser - Getting next movie for room:', roomId);
    
    try {
      const result = await appSyncService.getNextMovieForUser(roomId);
      
      if (result.getNextMovieForUser) {
        console.log('✅ VoteConsensusService.getNextMovieForUser - Movie retrieved:', result.getNextMovieForUser);
        return result.getNextMovieForUser;
      }
      
      return null;
      
    } catch (error: any) {
      console.error('❌ VoteConsensusService.getNextMovieForUser - Failed:', error);
      
      errorLoggingService.logError(error, {
        operation: 'getNextMovieForUser',
        roomId
      });
      
      return null;
    }
  }

  /**
   * Check if user has finished voting all movies
   */
  async hasUserFinishedVoting(roomId: string): Promise<boolean> {
    const progress = await this.getUserVotingProgress(roomId);
    return progress?.isFinished || false;
  }

  /**
   * Get vote progress as percentage
   */
  async getVoteProgressPercentage(roomId: string): Promise<number> {
    const progress = await this.getUserVotingProgress(roomId);
    if (!progress || progress.totalMovies === 0) return 0;
    
    return Math.round((progress.votedCount / progress.totalMovies) * 100);
  }

  /**
   * Check if a match has been found in the room
   */
  async checkForMatch(roomId: string): Promise<VoteResponse['matchInfo'] | null> {
    console.log('🔍 VoteConsensusService.checkForMatch - Checking for match in room:', roomId);
    
    try {
      // Use the checkMatchBeforeAction query
      const query = `
        query CheckMatchBeforeAction($roomId: ID!, $action: ActionInput!) {
          checkMatchBeforeAction(roomId: $roomId, action: $action) {
            isMatch
            matchedMovie {
              id
              title
              overview
              poster
              vote_average
              release_date
              runtime
              genres {
                id
                name
              }
            }
            message
            canClose
            roomStatus
            error
          }
        }
      `;

      const variables = {
        roomId,
        action: {
          type: 'CHECK_MATCH'
        }
      };

      const result = await appSyncService.graphqlRequest({ query, variables });
      
      if (result.checkMatchBeforeAction?.isMatch && result.checkMatchBeforeAction.matchedMovie) {
        const movie = result.checkMatchBeforeAction.matchedMovie;
        
        // Transform to matchInfo format
        const matchInfo = {
          movieId: movie.id,
          movieTitle: movie.title,
          movieInfo: {
            id: movie.id,
            title: movie.title,
            overview: movie.overview,
            poster: movie.poster,
            rating: movie.vote_average,
            runtime: movie.runtime,
            year: movie.release_date ? new Date(movie.release_date).getFullYear() : 0,
            genres: movie.genres?.map((g: any) => g.name) || []
          },
          matchedAt: new Date().toISOString(),
          participants: [], // Will be populated by subscription
          roomId: roomId
        };
        
        console.log('🎉 VoteConsensusService.checkForMatch - Match found:', matchInfo);
        return matchInfo;
      }
      
      return null;
      
    } catch (error: any) {
      console.error('❌ VoteConsensusService.checkForMatch - Failed:', error);
      return null;
    }
  }
}
}

export const voteConsensusService = new VoteConsensusService();