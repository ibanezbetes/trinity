export enum VoteType {
  LIKE = 'like',
  DISLIKE = 'dislike',
}

export interface Vote {
  userId: string;
  roomId: string;
  mediaId: string;
  voteType: VoteType;
  timestamp: Date;
  // Campos adicionales para tracking
  sessionId?: string;
  deviceInfo?: string;
}

export interface SwipeSession {
  userId: string;
  roomId: string;
  sessionId: string;
  startedAt: Date;
  lastActivityAt: Date;
  currentIndex: number;
  totalItems: number;
  votesInSession: number;
}

export interface VoteResult {
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

export interface CreateVoteDto {
  mediaId: string;
  voteType: VoteType;
  sessionId?: string;
}

export interface VoteStats {
  roomId: string;
  totalVotes: number;
  likesCount: number;
  dislikesCount: number;
  uniqueVoters: number;
  completionRate: number; // Porcentaje de miembros que han completado su cola
  averageProgress: number;
}
