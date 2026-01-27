import { MediaItem } from './media.entity';

export interface Match {
  id: string;
  roomId: string;
  mediaId: string;
  participants: string[]; // Array de userIds que votaron positivamente
  createdAt: Date;
  mediaDetails: MediaItem;
  // Campos adicionales para tracking
  consensusType: ConsensusType;
  totalVotes: number;
  notificationsSent: boolean;
}

export enum ConsensusType {
  UNANIMOUS_LIKE = 'unanimous_like',
  MAJORITY_LIKE = 'majority_like', // Para futuras implementaciones
}

export interface MatchNotification {
  matchId: string;
  roomId: string;
  mediaId: string;
  recipients: string[];
  sentAt: Date;
  notificationType: NotificationType;
}

export enum NotificationType {
  MATCH_CREATED = 'match_created',
  MATCH_REMINDER = 'match_reminder',
}

export interface MatchSummary {
  id: string;
  roomId: string;
  mediaTitle: string;
  mediaPosterPath: string;
  participantCount: number;
  createdAt: Date;
  consensusType: ConsensusType;
}

export interface RoomMatchLibrary {
  roomId: string;
  totalMatches: number;
  recentMatches: MatchSummary[];
  matchesByGenre: { [genre: string]: number };
  averageMatchTime: number; // Tiempo promedio para conseguir un match
}

export interface MatchDetectionResult {
  hasMatch: boolean;
  matchId?: string;
  consensusType?: ConsensusType;
  participants: string[];
  totalVotes: number;
  requiredVotes: number;
}

export interface CreateMatchDto {
  roomId: string;
  mediaId: string;
  participants: string[];
  consensusType: ConsensusType;
}

export interface MatchStats {
  roomId: string;
  totalMatches: number;
  matchesThisWeek: number;
  averageParticipants: number;
  mostPopularGenre: string;
  fastestMatch: number; // En minutos
  slowestMatch: number; // En minutos
  matchRate: number; // Porcentaje de contenido que genera matches
}
