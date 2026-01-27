/**
 * WebSocket Manager Interface
 * Core interface for real-time communication and Redis pub/sub
 */

export interface WebSocketConnection {
  id: string;
  userId?: string;
  roomId?: string;
  participantId?: string;
  socket: any; // WebSocket instance
  isAuthenticated: boolean;
  connectedAt: Date;
  lastActiveAt: Date;
  metadata?: Record<string, any>;
}

export interface WebSocketMessage {
  type: string;
  roomId?: string;
  userId?: string;
  participantId?: string;
  data: any;
  timestamp: Date;
  messageId: string;
}

export interface RoomBroadcastMessage {
  roomId: string;
  message: WebSocketMessage;
  excludeConnections?: string[];
}

export interface ConnectionStats {
  totalConnections: number;
  authenticatedConnections: number;
  roomConnections: Map<string, number>;
  averageConnectionDuration: number;
}

export interface RedisMessage {
  channel: string;
  pattern?: string;
  data: any;
  timestamp: Date;
}

/**
 * Core WebSocket Manager Interface
 * Handles WebSocket connections and Redis pub/sub coordination
 */
export interface IWebSocketManager {
  /**
   * Handle new WebSocket connection
   */
  handleConnection(socket: any): Promise<WebSocketConnection>;

  /**
   * Handle WebSocket disconnection
   */
  handleDisconnection(connectionId: string): Promise<void>;

  /**
   * Authenticate WebSocket connection
   */
  authenticateConnection(connectionId: string, token: string): Promise<void>;

  /**
   * Join room
   */
  joinRoom(connectionId: string, roomId: string, participantId?: string): Promise<void>;

  /**
   * Leave room
   */
  leaveRoom(connectionId: string, roomId: string): Promise<void>;

  /**
   * Send message to specific connection
   */
  sendToConnection(connectionId: string, message: WebSocketMessage): Promise<void>;

  /**
   * Send message to user (all their connections)
   */
  sendToUser(userId: string, message: WebSocketMessage): Promise<void>;

  /**
   * Broadcast message to room
   */
  broadcastToRoom(roomId: string, message: WebSocketMessage, excludeConnections?: string[]): Promise<void>;

  /**
   * Broadcast message to all connections
   */
  broadcastToAll(message: WebSocketMessage, excludeConnections?: string[]): Promise<void>;

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): Promise<WebSocketConnection | null>;

  /**
   * Get connections for user
   */
  getUserConnections(userId: string): Promise<WebSocketConnection[]>;

  /**
   * Get connections for room
   */
  getRoomConnections(roomId: string): Promise<WebSocketConnection[]>;

  /**
   * Get connection statistics
   */
  getConnectionStats(): Promise<ConnectionStats>;

  /**
   * Publish message to Redis channel
   */
  publishToRedis(channel: string, data: any): Promise<void>;

  /**
   * Subscribe to Redis channel
   */
  subscribeToRedis(channel: string, callback: (message: RedisMessage) => void): Promise<void>;

  /**
   * Unsubscribe from Redis channel
   */
  unsubscribeFromRedis(channel: string): Promise<void>;

  /**
   * Clean up inactive connections
   */
  cleanupInactiveConnections(): Promise<number>;
}

/**
 * Redis Pub/Sub Service Interface
 */
export interface IRedisService {
  /**
   * Publish message to channel
   */
  publish(channel: string, data: any): Promise<void>;

  /**
   * Subscribe to channel
   */
  subscribe(channel: string, callback: (message: RedisMessage) => void): Promise<void>;

  /**
   * Subscribe to pattern
   */
  psubscribe(pattern: string, callback: (message: RedisMessage) => void): Promise<void>;

  /**
   * Unsubscribe from channel
   */
  unsubscribe(channel: string): Promise<void>;

  /**
   * Unsubscribe from pattern
   */
  punsubscribe(pattern: string): Promise<void>;

  /**
   * Get Redis client status
   */
  getStatus(): Promise<'connected' | 'disconnected' | 'connecting'>;

  /**
   * Close Redis connection
   */
  close(): Promise<void>;
}