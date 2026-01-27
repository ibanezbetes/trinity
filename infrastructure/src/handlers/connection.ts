/**
 * Connection Handler for AppSync WebSocket Events
 * Handles user connections, disconnections, and state synchronization
 */

import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';
import { stateSyncService } from '../services/stateSyncService';
import { logBusinessMetric, logError, PerformanceTimer } from '../utils/metrics';

interface ConnectionEvent {
  eventType: 'CONNECT' | 'DISCONNECT' | 'RECONNECT';
  connectionId: string;
  roomId: string;
  userId: string;
  userAgent?: string;
  timestamp: string;
}

/**
 * Connection Handler: Manages WebSocket connections for real-time updates
 * Handles connection lifecycle and triggers state synchronization
 */
export const handler: AppSyncResolverHandler<any, any> = async (event: AppSyncResolverEvent<any>) => {
  console.log('🔌 Connection Handler:', JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const args = event.arguments;
  const { sub: userId } = event.identity as any;

  try {
    switch (fieldName) {
      case 'handleConnection':
        return await handleConnection(args.input, userId);
      
      case 'handleDisconnection':
        return await handleDisconnection(args.input, userId);
      
      case 'requestStateSync':
        return await requestStateSync(args.input, userId);
      
      case 'getConnectionStatus':
        return await getConnectionStatus(args.input, userId);
      
      default:
        throw new Error(`Operación no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`❌ Error en ${fieldName}:`, error);
    
    // Provide user-friendly error messages
    if (error instanceof Error) {
      if (error.message.includes('Room not found')) {
        throw new Error('La sala especificada no existe o no tienes acceso a ella.');
      }
      
      if (error.message.includes('Connection not found')) {
        throw new Error('No se encontró una conexión activa para este usuario.');
      }
      
      if (error.message.includes('Sync in progress')) {
        throw new Error('Ya hay una sincronización en progreso. Por favor, espera un momento.');
      }
      
      // Generic error for unexpected cases
      throw new Error('Error de conexión. Por favor, inténtalo de nuevo.');
    }
    
    throw error;
  }
};

/**
 * Handle user connection to a room
 */
async function handleConnection(input: any, userId: string): Promise<{ success: boolean; message: string; connectionId: string }> {
  const timer = new PerformanceTimer('HandleConnection');
  const { roomId, connectionId, userAgent } = input;
  
  console.log(`🔌 Handling connection: User ${userId} connecting to room ${roomId}`);

  try {
    // Validate input
    if (!roomId || !connectionId) {
      throw new Error('Room ID and connection ID are required');
    }

    // Handle the connection through state sync service
    await stateSyncService.handleUserConnection(roomId, userId, connectionId, userAgent);

    // Log business metric
    logBusinessMetric('CONNECTION_HANDLED', roomId, userId, {
      connectionId: connectionId.substring(0, 8),
      userAgent: userAgent || 'unknown'
    });

    timer.finish(true, undefined, { roomId, connectionId: connectionId.substring(0, 8) });

    return {
      success: true,
      message: 'Conectado exitosamente a la sala',
      connectionId
    };

  } catch (error) {
    logError('HandleConnection', error as Error, { roomId, userId, connectionId });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * Handle user disconnection from a room
 */
async function handleDisconnection(input: any, userId: string): Promise<{ success: boolean; message: string }> {
  const timer = new PerformanceTimer('HandleDisconnection');
  const { roomId, connectionId } = input;
  
  console.log(`🔌 Handling disconnection: User ${userId} disconnecting from room ${roomId}`);

  try {
    // Validate input
    if (!roomId || !connectionId) {
      throw new Error('Room ID and connection ID are required');
    }

    // Handle the disconnection through state sync service
    await stateSyncService.handleUserDisconnection(roomId, userId, connectionId);

    // Log business metric
    logBusinessMetric('DISCONNECTION_HANDLED', roomId, userId, {
      connectionId: connectionId.substring(0, 8)
    });

    timer.finish(true, undefined, { roomId, connectionId: connectionId.substring(0, 8) });

    return {
      success: true,
      message: 'Desconectado exitosamente de la sala'
    };

  } catch (error) {
    logError('HandleDisconnection', error as Error, { roomId, userId, connectionId });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * Request manual state synchronization
 */
async function requestStateSync(input: any, userId: string): Promise<{ success: boolean; message: string; syncId: string }> {
  const timer = new PerformanceTimer('RequestStateSync');
  const { roomId, forceSync } = input;
  
  console.log(`🔄 Requesting state sync: User ${userId} for room ${roomId}${forceSync ? ' (forced)' : ''}`);

  try {
    // Validate input
    if (!roomId) {
      throw new Error('Room ID is required');
    }

    // Generate sync ID for tracking
    const syncId = `sync_${roomId}_${userId}_${Date.now()}`;

    // Trigger state synchronization
    await stateSyncService.triggerRoomStateSync(roomId, userId);

    // Log business metric
    logBusinessMetric('STATE_SYNC_REQUESTED', roomId, userId, {
      syncId,
      forceSync: forceSync || false
    });

    timer.finish(true, undefined, { roomId, syncId });

    return {
      success: true,
      message: 'Sincronización de estado iniciada',
      syncId
    };

  } catch (error) {
    logError('RequestStateSync', error as Error, { roomId, userId });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * Get connection status for a user in a room
 */
async function getConnectionStatus(input: any, userId: string): Promise<{
  connected: boolean;
  connectionId?: string;
  lastSeen?: string;
  reconnectionAttempts: number;
  roomStats: {
    totalConnections: number;
    activeConnections: number;
    disconnectedConnections: number;
  };
}> {
  const timer = new PerformanceTimer('GetConnectionStatus');
  const { roomId } = input;
  
  console.log(`📊 Getting connection status: User ${userId} in room ${roomId}`);

  try {
    // Validate input
    if (!roomId) {
      throw new Error('Room ID is required');
    }

    // Get connection statistics
    const roomStats = stateSyncService.getConnectionStats(roomId);

    // For now, return basic status (in production, would check actual connection state)
    const connected = true; // Simplified - would check actual connection
    const reconnectionAttempts = 0; // Would get from connection tracking

    // Log business metric
    logBusinessMetric('CONNECTION_STATUS_CHECKED', roomId, userId, {
      connected,
      activeConnections: roomStats.activeConnections
    });

    timer.finish(true, undefined, { roomId, connected });

    return {
      connected,
      reconnectionAttempts,
      roomStats,
      lastSeen: new Date().toISOString()
    };

  } catch (error) {
    logError('GetConnectionStatus', error as Error, { roomId, userId });
    timer.finish(false, (error as Error).name);
    throw error;
  }
}

/**
 * WebSocket connection event handler (for API Gateway WebSocket)
 * This would be used if implementing with API Gateway WebSocket instead of AppSync
 */
export const websocketHandler = async (event: any) => {
  console.log('🌐 WebSocket Event:', JSON.stringify(event, null, 2));
  
  const { eventType, connectionId, routeKey } = event.requestContext;
  const { roomId, userId } = event.queryStringParameters || {};

  try {
    switch (routeKey) {
      case '$connect':
        if (roomId && userId) {
          await stateSyncService.handleUserConnection(roomId, userId, connectionId);
          return { statusCode: 200, body: 'Connected' };
        }
        return { statusCode: 400, body: 'Missing roomId or userId' };

      case '$disconnect':
        if (roomId && userId) {
          await stateSyncService.handleUserDisconnection(roomId, userId, connectionId);
          return { statusCode: 200, body: 'Disconnected' };
        }
        return { statusCode: 200, body: 'Disconnected' }; // Allow disconnect even without params

      case 'syncState':
        if (roomId && userId) {
          await stateSyncService.triggerRoomStateSync(roomId, userId);
          return { statusCode: 200, body: 'State sync triggered' };
        }
        return { statusCode: 400, body: 'Missing roomId or userId' };

      default:
        return { statusCode: 400, body: 'Unknown route' };
    }
  } catch (error) {
    console.error('❌ WebSocket handler error:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};