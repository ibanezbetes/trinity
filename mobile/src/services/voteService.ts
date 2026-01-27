// Servicio para gestionar votos/swipes conectando con el backend
import { apiClient } from './apiClient';
import { operationQueueService, OperationResult } from './operationQueueService';
import { errorLoggingService } from './errorLoggingService';
import { appSyncService } from './appSyncService';

// Flag para usar mock o backend real
const USE_MOCK = false; // Cambiar a false cuando el backend esté disponible

export type VoteType = 'like' | 'dislike';

export interface CreateVoteDto {
  mediaId: string;
  voteType: VoteType;
}

export interface VoteResponse {
  voteRegistered: boolean;
  nextMediaId: string | null;
  queueCompleted: boolean;
  currentProgress: {
    currentIndex: number;
    totalItems: number;
    remainingItems: number;
    progressPercentage: number;
  };
}

export interface QueueStatus {
  userId: string;
  roomId: string;
  currentMediaId: string | null;
  hasNext: boolean;
  isCompleted: boolean;
  progress: {
    currentIndex: number;
    totalItems: number;
    remainingItems: number;
    progressPercentage: number;
  };
}

export interface MediaVotes {
  mediaId: string;
  likes: number;
  dislikes: number;
  voters: string[];
}

export interface ConsensusResult {
  isUnanimous: boolean;
  voteType: VoteType | null;
  totalVotes: number;
  activeMembers: number;
}

export interface RoomVoteStats {
  roomId: string;
  totalVotes: number;
  likesCount: number;
  dislikesCount: number;
  uniqueVoters: number;
  completionRate: number;
  averageProgress: number;
}

export interface VoteHistoryItem {
  mediaId: string;
  voteType: VoteType;
  timestamp: string;
  sessionId?: string;
}

export interface SwipeSession {
  sessionId: string;
  startedAt: string;
  currentIndex: number;
  totalItems: number;
}

class VoteService {
  /**
   * Registrar un voto (swipe) con queue support para poor connectivity
   * Enhanced: Now uses GraphQL via AppSync with enhanced error handling
   */
  async registerVote(roomId: string, dto: CreateVoteDto): Promise<VoteResponse> {
    console.log('🗳️ VoteService.registerVote - Starting vote registration:', { roomId, mediaId: dto.mediaId, voteType: dto.voteType });
    
    const result = await operationQueueService.executeOrQueue(
      'VOTE',
      dto,
      async () => {
        if (USE_MOCK) {
          console.log('🗳️ VoteService.registerVote - Using MOCK mode');
          return this.mockRegisterVote(dto);
        }
        
        // Use GraphQL via AppSync for enhanced voting
        try {
          console.log('🗳️ VoteService.registerVote - Attempting AppSync vote...');
          const appSyncResult = await appSyncService.vote(roomId, dto.mediaId);
          console.log('🗳️ VoteService.registerVote - AppSync vote result:', appSyncResult);
          
          const room = appSyncResult.vote;
          
          // Transform AppSync result to VoteResponse interface
          const response: VoteResponse = {
            voteRegistered: true,
            nextMediaId: null, // Would need to be determined from room state
            queueCompleted: room.status === 'MATCHED',
            currentProgress: {
              currentIndex: 0, // Would need to be calculated
              totalItems: 20, // Would need to come from room data
              remainingItems: 20, // Would need to be calculated
              progressPercentage: 0 // Would need to be calculated
            }
          };
          
          console.log('✅ VoteService.registerVote - Vote registered successfully via AppSync');
          return response;
          
        } catch (appSyncError: any) {
          console.error('❌ VoteService.registerVote - AppSync vote failed:', appSyncError);
          
          // Enhanced error handling with context
          errorLoggingService.logError(appSyncError, {
            operation: 'registerVote',
            roomId,
            mediaId: dto.mediaId,
            metadata: { voteType: dto.voteType }
          });
          
          // Check if it's an authentication error
          if (appSyncError.message?.includes('Authentication') || 
              appSyncError.message?.includes('Unauthorized') ||
              appSyncError.message?.includes('not authenticated')) {
            throw new Error('Tu sesión ha expirado. Por favor, cierra y abre la app de nuevo.');
          }
          
          // Check if it's a network error
          if (appSyncError.message?.includes('Network') || 
              appSyncError.message?.includes('fetch') ||
              appSyncError.message?.includes('timeout')) {
            throw new Error('Error de conexión. Verifica tu internet e intenta de nuevo.');
          }
          
          // For other errors, try fallback to REST API
          console.log('🔄 VoteService.registerVote - Trying REST API fallback...');
          try {
            const restResult = await apiClient.post<VoteResponse>(`/rooms/${roomId}/interactions/vote`, dto);
            console.log('✅ VoteService.registerVote - Vote registered via REST API fallback');
            return restResult;
          } catch (restError: any) {
            console.error('❌ VoteService.registerVote - REST API fallback also failed:', restError);
            throw new Error('No se pudo registrar el voto. Verifica tu conexión e intenta de nuevo.');
          }
        }
      },
      {
        roomId,
        priority: 'HIGH', // Votes are high priority for user experience
        maxRetries: 3,
        expiresInMs: 5 * 60 * 1000 // 5 minutes expiration
      }
    );

    if (result.success) {
      console.log('✅ VoteService.registerVote - Final success:', result.data);
      return result.data;
    } else {
      // If queued, return optimistic response for better UX
      if (result.data?.queued) {
        console.log('📝 Vote queued for later execution');
        return this.mockRegisterVote(dto); // Optimistic response
      }
      
      console.error('❌ VoteService.registerVote - Final failure:', result.error);
      throw new Error(result.error || 'No se pudo registrar el voto');
    }
  }

  /**
   * Obtener estado de la cola
   */
  async getQueueStatus(roomId: string): Promise<QueueStatus> {
    try {
      if (USE_MOCK) {
        return this.mockGetQueueStatus(roomId);
      }
      return await apiClient.get<QueueStatus>(`/rooms/${roomId}/interactions/queue/status`);
    } catch (error) {
      errorLoggingService.logError(
        error instanceof Error ? error : new Error('Failed to get queue status'),
        {
          operation: 'GET_QUEUE_STATUS',
          roomId,
          metadata: { useMock: USE_MOCK }
        },
        {
          message: 'Unable to check queue status',
          action: 'Status will update automatically',
          canRetry: false
        }
      );
      if (USE_MOCK) {
        return this.mockGetQueueStatus(roomId);
      }
      throw error;
    }
  }

  /**
   * Obtener contenido actual para votar
   */
  async getCurrentMedia(roomId: string): Promise<any> {
    try {
      if (USE_MOCK) {
        return this.mockGetCurrentMedia();
      }
      return await apiClient.get(`/rooms/${roomId}/interactions/current-media`);
    } catch (error) {
      errorLoggingService.logError(
        error instanceof Error ? error : new Error('Failed to get current media'),
        {
          operation: 'GET_CURRENT_MEDIA',
          roomId,
          metadata: { useMock: USE_MOCK }
        },
        {
          message: 'Having trouble loading content',
          action: 'We\'ll try loading the next item',
          canRetry: false
        }
      );
      if (USE_MOCK) {
        return this.mockGetCurrentMedia();
      }
      throw error;
    }
  }

  /**
   * Obtener historial de votos
   */
  async getVoteHistory(roomId: string, limit: number = 50): Promise<VoteHistoryItem[]> {
    try {
      if (USE_MOCK) {
        return this.mockGetVoteHistory();
      }
      return await apiClient.get<VoteHistoryItem[]>(`/rooms/${roomId}/interactions/votes/history?limit=${limit}`);
    } catch (error) {
      console.error('Error getting vote history:', error);
      if (USE_MOCK) {
        return this.mockGetVoteHistory();
      }
      throw error;
    }
  }

  /**
   * Obtener votos de un contenido específico
   */
  async getMediaVotes(roomId: string, mediaId: string): Promise<MediaVotes> {
    try {
      if (USE_MOCK) {
        return this.mockGetMediaVotes(mediaId);
      }
      return await apiClient.get<MediaVotes>(`/rooms/${roomId}/interactions/media/${mediaId}/votes`);
    } catch (error) {
      console.error('Error getting media votes:', error);
      if (USE_MOCK) {
        return this.mockGetMediaVotes(mediaId);
      }
      throw error;
    }
  }

  /**
   * Verificar consenso de un contenido
   */
  async checkConsensus(roomId: string, mediaId: string): Promise<ConsensusResult> {
    try {
      if (USE_MOCK) {
        return this.mockCheckConsensus();
      }
      return await apiClient.get<ConsensusResult>(`/rooms/${roomId}/interactions/media/${mediaId}/consensus`);
    } catch (error) {
      console.error('Error checking consensus:', error);
      if (USE_MOCK) {
        return this.mockCheckConsensus();
      }
      throw error;
    }
  }

  /**
   * Obtener estadísticas de votación de la sala
   */
  async getRoomStats(roomId: string): Promise<RoomVoteStats> {
    try {
      if (USE_MOCK) {
        return this.mockGetRoomStats(roomId);
      }
      return await apiClient.get<RoomVoteStats>(`/rooms/${roomId}/interactions/stats`);
    } catch (error) {
      console.error('Error getting room stats:', error);
      if (USE_MOCK) {
        return this.mockGetRoomStats(roomId);
      }
      throw error;
    }
  }

  /**
   * Iniciar sesión de swipe
   */
  async startSwipeSession(roomId: string): Promise<SwipeSession> {
    try {
      if (USE_MOCK) {
        return this.mockStartSwipeSession();
      }
      return await apiClient.post<SwipeSession>(`/rooms/${roomId}/interactions/session/start`);
    } catch (error) {
      console.error('Error starting swipe session:', error);
      if (USE_MOCK) {
        return this.mockStartSwipeSession();
      }
      throw error;
    }
  }

  // ============ MOCK DATA PARA DESARROLLO ============

  private mockCurrentIndex = 0;
  private mockTotalItems = 20;

  private mockRegisterVote(dto: CreateVoteDto): VoteResponse {
    this.mockCurrentIndex++;
    const completed = this.mockCurrentIndex >= this.mockTotalItems;
    
    return {
      voteRegistered: true,
      nextMediaId: completed ? null : `${550 + this.mockCurrentIndex}`,
      queueCompleted: completed,
      currentProgress: {
        currentIndex: this.mockCurrentIndex,
        totalItems: this.mockTotalItems,
        remainingItems: this.mockTotalItems - this.mockCurrentIndex,
        progressPercentage: Math.round((this.mockCurrentIndex / this.mockTotalItems) * 100),
      },
    };
  }

  private mockGetQueueStatus(roomId: string): QueueStatus {
    return {
      userId: 'mock-user-id',
      roomId,
      currentMediaId: `${550 + this.mockCurrentIndex}`,
      hasNext: this.mockCurrentIndex < this.mockTotalItems - 1,
      isCompleted: this.mockCurrentIndex >= this.mockTotalItems,
      progress: {
        currentIndex: this.mockCurrentIndex,
        totalItems: this.mockTotalItems,
        remainingItems: this.mockTotalItems - this.mockCurrentIndex,
        progressPercentage: Math.round((this.mockCurrentIndex / this.mockTotalItems) * 100),
      },
    };
  }

  private mockGetCurrentMedia(): any {
    // Devuelve un ID de película de TMDB para que el mediaService lo enriquezca
    return {
      mediaId: `${550 + this.mockCurrentIndex}`,
      position: this.mockCurrentIndex,
      totalItems: this.mockTotalItems,
    };
  }

  private mockGetVoteHistory(): VoteHistoryItem[] {
    return Array(Math.min(this.mockCurrentIndex, 10)).fill(null).map((_, i) => ({
      mediaId: `${550 + i}`,
      voteType: Math.random() > 0.5 ? 'like' : 'dislike',
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      sessionId: 'mock-session-1',
    }));
  }

  private mockGetMediaVotes(mediaId: string): MediaVotes {
    return {
      mediaId,
      likes: Math.floor(Math.random() * 3) + 1,
      dislikes: Math.floor(Math.random() * 2),
      voters: ['user-1', 'user-2', 'user-3'].slice(0, Math.floor(Math.random() * 3) + 1),
    };
  }

  private mockCheckConsensus(): ConsensusResult {
    const isUnanimous = Math.random() > 0.7;
    return {
      isUnanimous,
      voteType: isUnanimous ? 'like' : null,
      totalVotes: 3,
      activeMembers: 3,
    };
  }

  private mockGetRoomStats(roomId: string): RoomVoteStats {
    return {
      roomId,
      totalVotes: this.mockCurrentIndex * 3,
      likesCount: Math.floor(this.mockCurrentIndex * 1.8),
      dislikesCount: Math.floor(this.mockCurrentIndex * 1.2),
      uniqueVoters: 3,
      completionRate: Math.round((this.mockCurrentIndex / this.mockTotalItems) * 100),
      averageProgress: Math.round((this.mockCurrentIndex / this.mockTotalItems) * 100),
    };
  }

  private mockStartSwipeSession(): SwipeSession {
    this.mockCurrentIndex = 0; // Reset al iniciar nueva sesión
    return {
      sessionId: `session-${Date.now()}`,
      startedAt: new Date().toISOString(),
      currentIndex: 0,
      totalItems: this.mockTotalItems,
    };
  }

  /**
   * Subscribe to real-time vote updates for a room
   * Enhanced: Uses new GraphQL subscriptions with detailed progress information
   */
  async subscribeToVoteUpdates(
    roomId: string, 
    callback: (voteUpdate: any) => void
  ): Promise<(() => void) | null> {
    try {
      // Use enhanced vote updates subscription for detailed progress
      return await appSyncService.subscribeToVoteUpdatesEnhanced(roomId, (voteUpdate) => {
        console.log('📊 Enhanced vote update received:', voteUpdate);
        
        // Transform to expected format and call callback
        callback({
          roomId: voteUpdate.roomId,
          progress: voteUpdate.progress,
          movieInfo: voteUpdate.movieInfo,
          votingDuration: voteUpdate.votingDuration,
          timestamp: voteUpdate.timestamp
        });
      });
    } catch (error: any) {
      errorLoggingService.logError(error, {
        operation: 'subscribeToVoteUpdates',
        roomId
      }, {
        message: 'Unable to connect to live updates',
        action: 'Updates will sync when connection improves',
        canRetry: false
      });
      
      return null;
    }
  }

  /**
   * Subscribe to match found events for a room
   * Enhanced: Uses new GraphQL subscriptions with participant details
   */
  async subscribeToMatchFound(
    roomId: string, 
    callback: (matchData: any) => void
  ): Promise<(() => void) | null> {
    try {
      // Use enhanced match found subscription for detailed participant info
      return await appSyncService.subscribeToMatchFoundEnhanced(roomId, (matchData) => {
        console.log('🎉 Enhanced match found:', matchData);
        
        // Transform to expected format and call callback
        callback({
          roomId: matchData.roomId,
          matchId: matchData.matchId,
          movieInfo: matchData.movieInfo,
          participants: matchData.participants,
          votingDuration: matchData.votingDuration,
          consensusType: matchData.consensusType,
          timestamp: matchData.timestamp
        });
      });
    } catch (error: any) {
      errorLoggingService.logError(error, {
        operation: 'subscribeToMatchFound',
        roomId
      }, {
        message: 'Unable to connect to match notifications',
        action: 'You\'ll be notified when connection improves',
        canRetry: false
      });
      
      return null;
    }
  }

  /**
   * Subscribe to connection status changes for a room
   * Enhanced: Monitor connection status and reconnection attempts
   */
  async subscribeToConnectionStatus(
    roomId: string, 
    callback: (statusData: any) => void
  ): Promise<(() => void) | null> {
    try {
      return await appSyncService.subscribeToConnectionStatusChange(roomId, (statusData) => {
        console.log('🔄 Connection status update:', statusData);
        
        // Transform to expected format and call callback
        callback({
          roomId: statusData.roomId,
          userId: statusData.userId,
          connectionStatus: statusData.connectionStatus,
          reconnectionAttempts: statusData.reconnectionAttempts,
          lastSeenAt: statusData.lastSeenAt,
          timestamp: statusData.timestamp
        });
      });
    } catch (error: any) {
      errorLoggingService.logError(error, {
        operation: 'subscribeToConnectionStatus',
        roomId
      });
      
      return null;
    }
  }

  /**
   * Subscribe to room state synchronization events
   * Enhanced: Get full room state updates for reconnection scenarios
   */
  async subscribeToRoomStateSync(
    roomId: string, 
    callback: (stateData: any) => void
  ): Promise<(() => void) | null> {
    try {
      return await appSyncService.subscribeToRoomStateSync(roomId, (stateData) => {
        console.log('🏠 Room state sync update:', stateData);
        
        // Transform to expected format and call callback
        callback({
          roomId: stateData.roomId,
          roomState: stateData.roomState,
          syncReason: stateData.syncReason,
          timestamp: stateData.timestamp
        });
      });
    } catch (error: any) {
      errorLoggingService.logError(error, {
        operation: 'subscribeToRoomStateSync',
        roomId
      });
      
      return null;
    }
  }

  /**
   * Subscribe to all room events with automatic reconnection
   * Enhanced: Comprehensive subscription management with reconnection logic
   */
  async subscribeToAllRoomEvents(
    roomId: string,
    callbacks: {
      onVoteUpdate?: (voteUpdate: any) => void;
      onMatchFound?: (matchData: any) => void;
      onConnectionStatus?: (statusData: any) => void;
      onRoomStateSync?: (stateData: any) => void;
    }
  ): Promise<(() => void) | null> {
    const cleanupFunctions: (() => void)[] = [];
    
    try {
      // Subscribe to vote updates if callback provided
      if (callbacks.onVoteUpdate) {
        const voteCleanup = await appSyncService.subscribeWithReconnection(
          roomId, 
          'enhanced-votes', 
          callbacks.onVoteUpdate
        );
        if (voteCleanup) cleanupFunctions.push(voteCleanup);
      }
      
      // Subscribe to match found events if callback provided
      if (callbacks.onMatchFound) {
        const matchCleanup = await appSyncService.subscribeWithReconnection(
          roomId, 
          'enhanced-matches', 
          callbacks.onMatchFound
        );
        if (matchCleanup) cleanupFunctions.push(matchCleanup);
      }
      
      // Subscribe to connection status if callback provided
      if (callbacks.onConnectionStatus) {
        const connectionCleanup = await appSyncService.subscribeWithReconnection(
          roomId, 
          'connection-status', 
          callbacks.onConnectionStatus
        );
        if (connectionCleanup) cleanupFunctions.push(connectionCleanup);
      }
      
      // Subscribe to room state sync if callback provided
      if (callbacks.onRoomStateSync) {
        const stateCleanup = await appSyncService.subscribeWithReconnection(
          roomId, 
          'room-state', 
          callbacks.onRoomStateSync
        );
        if (stateCleanup) cleanupFunctions.push(stateCleanup);
      }
      
      // Return master cleanup function
      return () => {
        console.log(`🧹 Cleaning up all room subscriptions for room ${roomId}`);
        cleanupFunctions.forEach(cleanup => cleanup());
      };
    } catch (error: any) {
      errorLoggingService.logError(error, {
        operation: 'subscribeToAllRoomEvents',
        roomId
      }, {
        message: 'Unable to connect to live updates',
        action: 'Updates will sync when connection improves',
        canRetry: false
      });
      
      // Cleanup any successful subscriptions
      cleanupFunctions.forEach(cleanup => cleanup());
      return null;
    }
  }

  /**
   * Reset mock state (útil para testing)
   */
  resetMockState(): void {
    this.mockCurrentIndex = 0;
  }

  /**
   * Sincronizar índice del miembro (útil cuando hay desincronización)
   * Enhanced: Better error handling and logging
   */
  async syncMemberIndex(roomId: string): Promise<{
    previousIndex: number;
    newIndex: number;
    votesFound: number;
    synced: boolean;
  }> {
    try {
      return await apiClient.post(`/rooms/${roomId}/shuffle-sync/sync-index`);
    } catch (error) {
      errorLoggingService.logError(
        error instanceof Error ? error : new Error('Failed to sync member index'),
        {
          operation: 'SYNC_MEMBER_INDEX',
          roomId,
          metadata: { useMock: USE_MOCK }
        },
        {
          message: 'Sync issue detected',
          action: 'Your progress will sync automatically',
          canRetry: true
        }
      );
      throw error;
    }
  }
}

export const voteService = new VoteService();
