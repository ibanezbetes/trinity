/**
 * AWS AppSync Real-time Interface
 * Core interface for AppSync GraphQL subscriptions and mutations
 */

export interface AppSyncConnection {
  id: string;
  userId?: string;
  roomId?: string;
  participantId?: string;
  connectionId: string;
  isAuthenticated: boolean;
  connectedAt: Date;
  lastActiveAt: Date;
  metadata?: Record<string, any>;
}

export interface AppSyncMessage {
  type: string;
  roomId?: string;
  userId?: string;
  participantId?: string;
  data: any;
  timestamp: string;
  messageId: string;
}

export interface RoomSubscriptionPayload {
  roomId: string;
  message: AppSyncMessage;
  excludeUsers?: string[];
}

export interface VotingSubscriptionPayload {
  sessionId: string;
  roomId: string;
  message: AppSyncMessage;
}

export interface ConnectionEvent {
  eventType: 'CONNECT' | 'DISCONNECT';
  connectionId: string;
  userId?: string;
  roomId?: string;
  timestamp: string;
}

/**
 * Core AppSync Real-time Manager Interface
 * Handles AppSync GraphQL subscriptions and real-time broadcasting
 */
export interface IAppSyncManager {
  /**
   * Handle connection event from AppSync
   */
  handleConnectionEvent(event: ConnectionEvent): Promise<void>;

  /**
   * Publish room message via AppSync mutation
   */
  publishRoomMessage(roomId: string, message: AppSyncMessage, excludeUsers?: string[]): Promise<void>;

  /**
   * Publish voting update via AppSync mutation
   */
  publishVotingUpdate(sessionId: string, roomId: string, message: AppSyncMessage): Promise<void>;

  /**
   * Publish user-specific message via AppSync mutation
   */
  publishUserMessage(userId: string, message: AppSyncMessage): Promise<void>;

  /**
   * Broadcast to all connected users via AppSync mutation
   */
  broadcastToAll(message: AppSyncMessage, excludeUsers?: string[]): Promise<void>;

  /**
   * Get active connections for room
   */
  getRoomConnections(roomId: string): Promise<AppSyncConnection[]>;

  /**
   * Get active connections for user
   */
  getUserConnections(userId: string): Promise<AppSyncConnection[]>;

  /**
   * Get connection statistics
   */
  getConnectionStats(): Promise<{
    totalConnections: number;
    authenticatedConnections: number;
    roomConnections: Map<string, number>;
  }>;

  /**
   * Clean up inactive connections
   */
  cleanupInactiveConnections(): Promise<number>;
}

/**
 * AppSync GraphQL Operations Interface
 */
export interface IAppSyncGraphQL {
  /**
   * Execute GraphQL mutation
   */
  executeMutation(mutation: string, variables: Record<string, any>): Promise<any>;

  /**
   * Execute GraphQL query
   */
  executeQuery(query: string, variables: Record<string, any>): Promise<any>;

  /**
   * Get AppSync endpoint URL
   */
  getEndpointUrl(): string;

  /**
   * Get AppSync API key
   */
  getApiKey(): string;
}

/**
 * DynamoDB Connection Store Interface
 */
export interface IConnectionStore {
  /**
   * Store connection information
   */
  storeConnection(connection: AppSyncConnection): Promise<void>;

  /**
   * Remove connection
   */
  removeConnection(connectionId: string): Promise<void>;

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): Promise<AppSyncConnection | null>;

  /**
   * Get connections by user ID
   */
  getConnectionsByUser(userId: string): Promise<AppSyncConnection[]>;

  /**
   * Get connections by room ID
   */
  getConnectionsByRoom(roomId: string): Promise<AppSyncConnection[]>;

  /**
   * Update connection last active time
   */
  updateLastActive(connectionId: string): Promise<void>;

  /**
   * Clean up expired connections
   */
  cleanupExpiredConnections(expirationTime: Date): Promise<number>;
}