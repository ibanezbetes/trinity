export enum MemberRole {
  CREATOR = 'creator',
  MEMBER = 'member',
}

export enum MemberStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export interface ContentFilters {
  genres?: string[];
  releaseYearFrom?: number;
  releaseYearTo?: number;
  minRating?: number;
  contentTypes?: ('movie' | 'tv')[];
}

export interface Room {
  id: string;
  name: string;
  creatorId: string;
  filters: ContentFilters;
  masterList: string[]; // Array de mediaIds
  inviteCode: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Member {
  userId: string;
  roomId: string;
  role: MemberRole;
  status: MemberStatus;
  shuffledList: string[]; // Array de mediaIds en orden aleatorio
  currentIndex: number;
  lastActivityAt: Date;
  joinedAt: Date;
}

export interface CreateRoomDto {
  name: string;
  filters: ContentFilters;
}

export interface JoinRoomDto {
  inviteCode: string;
}

export interface RoomSummary {
  id: string;
  name: string;
  creatorId: string;
  memberCount: number;
  matchCount: number;
  isActive: boolean;
  createdAt: Date;
}
