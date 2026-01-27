"use strict";
/**
 * Connection Handler for AppSync WebSocket Events
 * Handles user connections, disconnections, and state synchronization
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.websocketHandler = exports.handler = void 0;
const stateSyncService_1 = require("../services/stateSyncService");
const metrics_1 = require("../utils/metrics");
/**
 * Connection Handler: Manages WebSocket connections for real-time updates
 * Handles connection lifecycle and triggers state synchronization
 */
const handler = async (event) => {
    console.log('🔌 Connection Handler:', JSON.stringify(event, null, 2));
    const fieldName = event.info?.fieldName;
    const args = event.arguments;
    const { sub: userId } = event.identity;
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
    }
    catch (error) {
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
exports.handler = handler;
/**
 * Handle user connection to a room
 */
async function handleConnection(input, userId) {
    const timer = new metrics_1.PerformanceTimer('HandleConnection');
    const { roomId, connectionId, userAgent } = input;
    console.log(`🔌 Handling connection: User ${userId} connecting to room ${roomId}`);
    try {
        // Validate input
        if (!roomId || !connectionId) {
            throw new Error('Room ID and connection ID are required');
        }
        // Handle the connection through state sync service
        await stateSyncService_1.stateSyncService.handleUserConnection(roomId, userId, connectionId, userAgent);
        // Log business metric
        (0, metrics_1.logBusinessMetric)('CONNECTION_HANDLED', roomId, userId, {
            connectionId: connectionId.substring(0, 8),
            userAgent: userAgent || 'unknown'
        });
        timer.finish(true, undefined, { roomId, connectionId: connectionId.substring(0, 8) });
        return {
            success: true,
            message: 'Conectado exitosamente a la sala',
            connectionId
        };
    }
    catch (error) {
        (0, metrics_1.logError)('HandleConnection', error, { roomId, userId, connectionId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Handle user disconnection from a room
 */
async function handleDisconnection(input, userId) {
    const timer = new metrics_1.PerformanceTimer('HandleDisconnection');
    const { roomId, connectionId } = input;
    console.log(`🔌 Handling disconnection: User ${userId} disconnecting from room ${roomId}`);
    try {
        // Validate input
        if (!roomId || !connectionId) {
            throw new Error('Room ID and connection ID are required');
        }
        // Handle the disconnection through state sync service
        await stateSyncService_1.stateSyncService.handleUserDisconnection(roomId, userId, connectionId);
        // Log business metric
        (0, metrics_1.logBusinessMetric)('DISCONNECTION_HANDLED', roomId, userId, {
            connectionId: connectionId.substring(0, 8)
        });
        timer.finish(true, undefined, { roomId, connectionId: connectionId.substring(0, 8) });
        return {
            success: true,
            message: 'Desconectado exitosamente de la sala'
        };
    }
    catch (error) {
        (0, metrics_1.logError)('HandleDisconnection', error, { roomId, userId, connectionId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Request manual state synchronization
 */
async function requestStateSync(input, userId) {
    const timer = new metrics_1.PerformanceTimer('RequestStateSync');
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
        await stateSyncService_1.stateSyncService.triggerRoomStateSync(roomId, userId);
        // Log business metric
        (0, metrics_1.logBusinessMetric)('STATE_SYNC_REQUESTED', roomId, userId, {
            syncId,
            forceSync: forceSync || false
        });
        timer.finish(true, undefined, { roomId, syncId });
        return {
            success: true,
            message: 'Sincronización de estado iniciada',
            syncId
        };
    }
    catch (error) {
        (0, metrics_1.logError)('RequestStateSync', error, { roomId, userId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * Get connection status for a user in a room
 */
async function getConnectionStatus(input, userId) {
    const timer = new metrics_1.PerformanceTimer('GetConnectionStatus');
    const { roomId } = input;
    console.log(`📊 Getting connection status: User ${userId} in room ${roomId}`);
    try {
        // Validate input
        if (!roomId) {
            throw new Error('Room ID is required');
        }
        // Get connection statistics
        const roomStats = stateSyncService_1.stateSyncService.getConnectionStats(roomId);
        // For now, return basic status (in production, would check actual connection state)
        const connected = true; // Simplified - would check actual connection
        const reconnectionAttempts = 0; // Would get from connection tracking
        // Log business metric
        (0, metrics_1.logBusinessMetric)('CONNECTION_STATUS_CHECKED', roomId, userId, {
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
    }
    catch (error) {
        (0, metrics_1.logError)('GetConnectionStatus', error, { roomId, userId });
        timer.finish(false, error.name);
        throw error;
    }
}
/**
 * WebSocket connection event handler (for API Gateway WebSocket)
 * This would be used if implementing with API Gateway WebSocket instead of AppSync
 */
const websocketHandler = async (event) => {
    console.log('🌐 WebSocket Event:', JSON.stringify(event, null, 2));
    const { eventType, connectionId, routeKey } = event.requestContext;
    const { roomId, userId } = event.queryStringParameters || {};
    try {
        switch (routeKey) {
            case '$connect':
                if (roomId && userId) {
                    await stateSyncService_1.stateSyncService.handleUserConnection(roomId, userId, connectionId);
                    return { statusCode: 200, body: 'Connected' };
                }
                return { statusCode: 400, body: 'Missing roomId or userId' };
            case '$disconnect':
                if (roomId && userId) {
                    await stateSyncService_1.stateSyncService.handleUserDisconnection(roomId, userId, connectionId);
                    return { statusCode: 200, body: 'Disconnected' };
                }
                return { statusCode: 200, body: 'Disconnected' }; // Allow disconnect even without params
            case 'syncState':
                if (roomId && userId) {
                    await stateSyncService_1.stateSyncService.triggerRoomStateSync(roomId, userId);
                    return { statusCode: 200, body: 'State sync triggered' };
                }
                return { statusCode: 400, body: 'Missing roomId or userId' };
            default:
                return { statusCode: 400, body: 'Unknown route' };
        }
    }
    catch (error) {
        console.error('❌ WebSocket handler error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
exports.websocketHandler = websocketHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29ubmVjdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvbm5lY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBR0gsbUVBQWdFO0FBQ2hFLDhDQUFpRjtBQVdqRjs7O0dBR0c7QUFDSSxNQUFNLE9BQU8sR0FBcUMsS0FBSyxFQUFFLEtBQWdDLEVBQUUsRUFBRTtJQUNsRyxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXRFLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDO0lBQ3hDLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7SUFDN0IsTUFBTSxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsUUFBZSxDQUFDO0lBRTlDLElBQUksQ0FBQztRQUNILFFBQVEsU0FBUyxFQUFFLENBQUM7WUFDbEIsS0FBSyxrQkFBa0I7Z0JBQ3JCLE9BQU8sTUFBTSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBRXBELEtBQUsscUJBQXFCO2dCQUN4QixPQUFPLE1BQU0sbUJBQW1CLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztZQUV2RCxLQUFLLGtCQUFrQjtnQkFDckIsT0FBTyxNQUFNLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFFcEQsS0FBSyxxQkFBcUI7Z0JBQ3hCLE9BQU8sTUFBTSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBRXZEO2dCQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDNUQsQ0FBQztJQUNILENB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QkFBdUIsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLFlBQVksQ0FBQyxDQUFDO29CQUM3RSxPQUFPLEVBQUUsVUFBVSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLENBQUM7Z0JBQ25ELENBQUM7Z0JBQ0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUMsdUNBQXVDO1lBRTNGLEtBQUssV0FBVztnQkFDZCxJQUFJLE1BQU0sSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDckIsTUFBTSxtQ0FBZ0IsQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7b0JBQzVELE9BQU8sRUFBRSxVQUFVLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxzQkFBc0IsRUFBRSxDQUFDO2dCQUMzRCxDQUFDO2dCQUNELE9BQU8sRUFBRSxVQUFVLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSwwQkFBMEIsRUFBRSxDQUFDO1lBRS9EO2dCQUNFLE9BQU8sRUFBRSxVQUFVLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsQ0FBQztRQUN0RCxDQUFDO0lBQ0gsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUM7U0FDekQsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUF2Q1csUUFBQSxnQkFBZ0Isb0JBdUMzQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBDb25uZWN0aW9uIEhhbmRsZXIgZm9yIEFwcFN5bmMgV2ViU29ja2V0IEV2ZW50c1xyXG4gKiBIYW5kbGVzIHVzZXIgY29ubmVjdGlvbnMsIGRpc2Nvbm5lY3Rpb25zLCBhbmQgc3RhdGUgc3luY2hyb25pemF0aW9uXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgQXBwU3luY1Jlc29sdmVyRXZlbnQsIEFwcFN5bmNSZXNvbHZlckhhbmRsZXIgfSBmcm9tICdhd3MtbGFtYmRhJztcclxuaW1wb3J0IHsgc3RhdGVTeW5jU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL3N0YXRlU3luY1NlcnZpY2UnO1xyXG5pbXBvcnQgeyBsb2dCdXNpbmVzc01ldHJpYywgbG9nRXJyb3IsIFBlcmZvcm1hbmNlVGltZXIgfSBmcm9tICcuLi91dGlscy9tZXRyaWNzJztcclxuXHJcbmludGVyZmFjZSBDb25uZWN0aW9uRXZlbnQge1xyXG4gIGV2ZW50VHlwZTogJ0NPTk5FQ1QnIHwgJ0RJU0NPTk5FQ1QnIHwgJ1JFQ09OTkVDVCc7XHJcbiAgY29ubmVjdGlvbklkOiBzdHJpbmc7XHJcbiAgcm9vbUlkOiBzdHJpbmc7XHJcbiAgdXNlcklkOiBzdHJpbmc7XHJcbiAgdXNlckFnZW50Pzogc3RyaW5nO1xyXG4gIHRpbWVzdGFtcDogc3RyaW5nO1xyXG59XHJcblxyXG4vKipcclxuICogQ29ubmVjdGlvbiBIYW5kbGVyOiBNYW5hZ2VzIFdlYlNvY2tldCBjb25uZWN0aW9ucyBmb3IgcmVhbC10aW1lIHVwZGF0ZXNcclxuICogSGFuZGxlcyBjb25uZWN0aW9uIGxpZmVjeWNsZSBhbmQgdHJpZ2dlcnMgc3RhdGUgc3luY2hyb25pemF0aW9uXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgaGFuZGxlcjogQXBwU3luY1Jlc29sdmVySGFuZGxlcjxhbnksIGFueT4gPSBhc3luYyAoZXZlbnQ6IEFwcFN5bmNSZXNvbHZlckV2ZW50PGFueT4pID0+IHtcclxuICBjb25zb2xlLmxvZygn8J+UjCBDb25uZWN0aW9uIEhhbmRsZXI6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuXHJcbiAgY29uc3QgZmllbGROYW1lID0gZXZlbnQuaW5mbz8uZmllbGROYW1lO1xyXG4gIGNvbnN0IGFyZ3MgPSBldmVudC5hcmd1bWVudHM7XHJcbiAgY29uc3QgeyBzdWI6IHVzZXJJZCB9ID0gZXZlbnQuaWRlbnRpdHkgYXMgYW55O1xyXG5cclxuICB0cnkge1xyXG4gICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcclxuICAgICAgY2FzZSAnaGFuZGxlQ29ubmVjdGlvbic6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGhhbmRsZUNvbm5lY3Rpb24oYXJncy5pbnB1dCwgdXNlcklkKTtcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ2hhbmRsZURpc2Nvbm5lY3Rpb24nOlxyXG4gICAgICAgIHJldHVybiBhd2FpdCBoYW5kbGVEaXNjb25uZWN0aW9uKGFyZ3MuaW5wdXQsIHVzZXJJZCk7XHJcbiAgICAgIFxyXG4gICAgICBjYXNlICdyZXF1ZXN0U3RhdGVTeW5jJzpcclxuICAgICAgICByZXR1cm4gYXdhaXQgcmVxdWVzdFN0YXRlU3luYyhhcmdzLmlucHV0LCB1c2VySWQpO1xyXG4gICAgICBcclxuICAgICAgY2FzZSAnZ2V0Q29ubmVjdGlvblN0YXR1cyc6XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IGdldENvbm5lY3Rpb25TdGF0dXMoYXJncy5pbnB1dCwgdXNlcklkKTtcclxuICAgICAgXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcGVyYWNpw7NuIG5vIHNvcG9ydGFkYTogJHtmaWVsZE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBlbiAke2ZpZWxkTmFtZX06YCwgZXJyb3IpO1xyXG4gICAgXHJcbiAgICAvLyBQcm92aWRlIHVzZXItZnJpZW5kbHkgZXJyb3IgbWVzc2FnZXNcclxuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdSb29tIG5vdCBmb3VuZCcpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMYSBzYWxhIGVzcGVjaWZpY2FkYSBubyBleGlzdGUgbyBubyB0aWVuZXMgYWNjZXNvIGEgZWxsYS4nKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ0Nvbm5lY3Rpb24gbm90IGZvdW5kJykpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHNlIGVuY29udHLDsyB1bmEgY29uZXhpw7NuIGFjdGl2YSBwYXJhIGVzdGUgdXN1YXJpby4nKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ1N5bmMgaW4gcHJvZ3Jlc3MnKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignWWEgaGF5IHVuYSBzaW5jcm9uaXphY2nDs24gZW4gcHJvZ3Jlc28uIFBvciBmYXZvciwgZXNwZXJhIHVuIG1vbWVudG8uJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIEdlbmVyaWMgZXJyb3IgZm9yIHVuZXhwZWN0ZWQgY2FzZXNcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciBkZSBjb25leGnDs24uIFBvciBmYXZvciwgaW50w6ludGFsbyBkZSBudWV2by4nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIEhhbmRsZSB1c2VyIGNvbm5lY3Rpb24gdG8gYSByb29tXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVDb25uZWN0aW9uKGlucHV0OiBhbnksIHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IG1lc3NhZ2U6IHN0cmluZzsgY29ubmVjdGlvbklkOiBzdHJpbmcgfT4ge1xyXG4gIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ0hhbmRsZUNvbm5lY3Rpb24nKTtcclxuICBjb25zdCB7IHJvb21JZCwgY29ubmVjdGlvbklkLCB1c2VyQWdlbnQgfSA9IGlucHV0O1xyXG4gIFxyXG4gIGNvbnNvbGUubG9nKGDwn5SMIEhhbmRsaW5nIGNvbm5lY3Rpb246IFVzZXIgJHt1c2VySWR9IGNvbm5lY3RpbmcgdG8gcm9vbSAke3Jvb21JZH1gKTtcclxuXHJcbiAgdHJ5IHtcclxuICAgIC8vIFZhbGlkYXRlIGlucHV0XHJcbiAgICBpZiAoIXJvb21JZCB8fCAhY29ubmVjdGlvbklkKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignUm9vbSBJRCBhbmQgY29ubmVjdGlvbiBJRCBhcmUgcmVxdWlyZWQnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBIYW5kbGUgdGhlIGNvbm5lY3Rpb24gdGhyb3VnaCBzdGF0ZSBzeW5jIHNlcnZpY2VcclxuICAgIGF3YWl0IHN0YXRlU3luY1NlcnZpY2UuaGFuZGxlVXNlckNvbm5lY3Rpb24ocm9vbUlkLCB1c2VySWQsIGNvbm5lY3Rpb25JZCwgdXNlckFnZW50KTtcclxuXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICBsb2dCdXNpbmVzc01ldHJpYygnQ09OTkVDVElPTl9IQU5ETEVEJywgcm9vbUlkLCB1c2VySWQsIHtcclxuICAgICAgY29ubmVjdGlvbklkOiBjb25uZWN0aW9uSWQuc3Vic3RyaW5nKDAsIDgpLFxyXG4gICAgICB1c2VyQWdlbnQ6IHVzZXJBZ2VudCB8fCAndW5rbm93bidcclxuICAgIH0pO1xyXG5cclxuICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgcm9vbUlkLCBjb25uZWN0aW9uSWQ6IGNvbm5lY3Rpb25JZC5zdWJzdHJpbmcoMCwgOCkgfSk7XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgbWVzc2FnZTogJ0NvbmVjdGFkbyBleGl0b3NhbWVudGUgYSBsYSBzYWxhJyxcclxuICAgICAgY29ubmVjdGlvbklkXHJcbiAgICB9O1xyXG5cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgbG9nRXJyb3IoJ0hhbmRsZUNvbm5lY3Rpb24nLCBlcnJvciBhcyBFcnJvciwgeyByb29tSWQsIHVzZXJJZCwgY29ubmVjdGlvbklkIH0pO1xyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogSGFuZGxlIHVzZXIgZGlzY29ubmVjdGlvbiBmcm9tIGEgcm9vbVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlRGlzY29ubmVjdGlvbihpbnB1dDogYW55LCB1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBtZXNzYWdlOiBzdHJpbmcgfT4ge1xyXG4gIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ0hhbmRsZURpc2Nvbm5lY3Rpb24nKTtcclxuICBjb25zdCB7IHJvb21JZCwgY29ubmVjdGlvbklkIH0gPSBpbnB1dDtcclxuICBcclxuICBjb25zb2xlLmxvZyhg8J+UjCBIYW5kbGluZyBkaXNjb25uZWN0aW9uOiBVc2VyICR7dXNlcklkfSBkaXNjb25uZWN0aW5nIGZyb20gcm9vbSAke3Jvb21JZH1gKTtcclxuXHJcbiAgdHJ5IHtcclxuICAgIC8vIFZhbGlkYXRlIGlucHV0XHJcbiAgICBpZiAoIXJvb21JZCB8fCAhY29ubmVjdGlvbklkKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignUm9vbSBJRCBhbmQgY29ubmVjdGlvbiBJRCBhcmUgcmVxdWlyZWQnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBIYW5kbGUgdGhlIGRpc2Nvbm5lY3Rpb24gdGhyb3VnaCBzdGF0ZSBzeW5jIHNlcnZpY2VcclxuICAgIGF3YWl0IHN0YXRlU3luY1NlcnZpY2UuaGFuZGxlVXNlckRpc2Nvbm5lY3Rpb24ocm9vbUlkLCB1c2VySWQsIGNvbm5lY3Rpb25JZCk7XHJcblxyXG4gICAgLy8gTG9nIGJ1c2luZXNzIG1ldHJpY1xyXG4gICAgbG9nQnVzaW5lc3NNZXRyaWMoJ0RJU0NPTk5FQ1RJT05fSEFORExFRCcsIHJvb21JZCwgdXNlcklkLCB7XHJcbiAgICAgIGNvbm5lY3Rpb25JZDogY29ubmVjdGlvbklkLnN1YnN0cmluZygwLCA4KVxyXG4gICAgfSk7XHJcblxyXG4gICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByb29tSWQsIGNvbm5lY3Rpb25JZDogY29ubmVjdGlvbklkLnN1YnN0cmluZygwLCA4KSB9KTtcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICBtZXNzYWdlOiAnRGVzY29uZWN0YWRvIGV4aXRvc2FtZW50ZSBkZSBsYSBzYWxhJ1xyXG4gICAgfTtcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGxvZ0Vycm9yKCdIYW5kbGVEaXNjb25uZWN0aW9uJywgZXJyb3IgYXMgRXJyb3IsIHsgcm9vbUlkLCB1c2VySWQsIGNvbm5lY3Rpb25JZCB9KTtcclxuICAgIHRpbWVyLmZpbmlzaChmYWxzZSwgKGVycm9yIGFzIEVycm9yKS5uYW1lKTtcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFJlcXVlc3QgbWFudWFsIHN0YXRlIHN5bmNocm9uaXphdGlvblxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gcmVxdWVzdFN0YXRlU3luYyhpbnB1dDogYW55LCB1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBtZXNzYWdlOiBzdHJpbmc7IHN5bmNJZDogc3RyaW5nIH0+IHtcclxuICBjb25zdCB0aW1lciA9IG5ldyBQZXJmb3JtYW5jZVRpbWVyKCdSZXF1ZXN0U3RhdGVTeW5jJyk7XHJcbiAgY29uc3QgeyByb29tSWQsIGZvcmNlU3luYyB9ID0gaW5wdXQ7XHJcbiAgXHJcbiAgY29uc29sZS5sb2coYPCflIQgUmVxdWVzdGluZyBzdGF0ZSBzeW5jOiBVc2VyICR7dXNlcklkfSBmb3Igcm9vbSAke3Jvb21JZH0ke2ZvcmNlU3luYyA/ICcgKGZvcmNlZCknIDogJyd9YCk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyBWYWxpZGF0ZSBpbnB1dFxyXG4gICAgaWYgKCFyb29tSWQpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdSb29tIElEIGlzIHJlcXVpcmVkJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2VuZXJhdGUgc3luYyBJRCBmb3IgdHJhY2tpbmdcclxuICAgIGNvbnN0IHN5bmNJZCA9IGBzeW5jXyR7cm9vbUlkfV8ke3VzZXJJZH1fJHtEYXRlLm5vdygpfWA7XHJcblxyXG4gICAgLy8gVHJpZ2dlciBzdGF0ZSBzeW5jaHJvbml6YXRpb25cclxuICAgIGF3YWl0IHN0YXRlU3luY1NlcnZpY2UudHJpZ2dlclJvb21TdGF0ZVN5bmMocm9vbUlkLCB1c2VySWQpO1xyXG5cclxuICAgIC8vIExvZyBidXNpbmVzcyBtZXRyaWNcclxuICAgIGxvZ0J1c2luZXNzTWV0cmljKCdTVEFURV9TWU5DX1JFUVVFU1RFRCcsIHJvb21JZCwgdXNlcklkLCB7XHJcbiAgICAgIHN5bmNJZCxcclxuICAgICAgZm9yY2VTeW5jOiBmb3JjZVN5bmMgfHwgZmFsc2VcclxuICAgIH0pO1xyXG5cclxuICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgcm9vbUlkLCBzeW5jSWQgfSk7XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgbWVzc2FnZTogJ1NpbmNyb25pemFjacOzbiBkZSBlc3RhZG8gaW5pY2lhZGEnLFxyXG4gICAgICBzeW5jSWRcclxuICAgIH07XHJcblxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBsb2dFcnJvcignUmVxdWVzdFN0YXRlU3luYycsIGVycm9yIGFzIEVycm9yLCB7IHJvb21JZCwgdXNlcklkIH0pO1xyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogR2V0IGNvbm5lY3Rpb24gc3RhdHVzIGZvciBhIHVzZXIgaW4gYSByb29tXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRDb25uZWN0aW9uU3RhdHVzKGlucHV0OiBhbnksIHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTx7XHJcbiAgY29ubmVjdGVkOiBib29sZWFuO1xyXG4gIGNvbm5lY3Rpb25JZD86IHN0cmluZztcclxuICBsYXN0U2Vlbj86IHN0cmluZztcclxuICByZWNvbm5lY3Rpb25BdHRlbXB0czogbnVtYmVyO1xyXG4gIHJvb21TdGF0czoge1xyXG4gICAgdG90YWxDb25uZWN0aW9uczogbnVtYmVyO1xyXG4gICAgYWN0aXZlQ29ubmVjdGlvbnM6IG51bWJlcjtcclxuICAgIGRpc2Nvbm5lY3RlZENvbm5lY3Rpb25zOiBudW1iZXI7XHJcbiAgfTtcclxufT4ge1xyXG4gIGNvbnN0IHRpbWVyID0gbmV3IFBlcmZvcm1hbmNlVGltZXIoJ0dldENvbm5lY3Rpb25TdGF0dXMnKTtcclxuICBjb25zdCB7IHJvb21JZCB9ID0gaW5wdXQ7XHJcbiAgXHJcbiAgY29uc29sZS5sb2coYPCfk4ogR2V0dGluZyBjb25uZWN0aW9uIHN0YXR1czogVXNlciAke3VzZXJJZH0gaW4gcm9vbSAke3Jvb21JZH1gKTtcclxuXHJcbiAgdHJ5IHtcclxuICAgIC8vIFZhbGlkYXRlIGlucHV0XHJcbiAgICBpZiAoIXJvb21JZCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Jvb20gSUQgaXMgcmVxdWlyZWQnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgY29ubmVjdGlvbiBzdGF0aXN0aWNzXHJcbiAgICBjb25zdCByb29tU3RhdHMgPSBzdGF0ZVN5bmNTZXJ2aWNlLmdldENvbm5lY3Rpb25TdGF0cyhyb29tSWQpO1xyXG5cclxuICAgIC8vIEZvciBub3csIHJldHVybiBiYXNpYyBzdGF0dXMgKGluIHByb2R1Y3Rpb24sIHdvdWxkIGNoZWNrIGFjdHVhbCBjb25uZWN0aW9uIHN0YXRlKVxyXG4gICAgY29uc3QgY29ubmVjdGVkID0gdHJ1ZTsgLy8gU2ltcGxpZmllZCAtIHdvdWxkIGNoZWNrIGFjdHVhbCBjb25uZWN0aW9uXHJcbiAgICBjb25zdCByZWNvbm5lY3Rpb25BdHRlbXB0cyA9IDA7IC8vIFdvdWxkIGdldCBmcm9tIGNvbm5lY3Rpb24gdHJhY2tpbmdcclxuXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICBsb2dCdXNpbmVzc01ldHJpYygnQ09OTkVDVElPTl9TVEFUVVNfQ0hFQ0tFRCcsIHJvb21JZCwgdXNlcklkLCB7XHJcbiAgICAgIGNvbm5lY3RlZCxcclxuICAgICAgYWN0aXZlQ29ubmVjdGlvbnM6IHJvb21TdGF0cy5hY3RpdmVDb25uZWN0aW9uc1xyXG4gICAgfSk7XHJcblxyXG4gICAgdGltZXIuZmluaXNoKHRydWUsIHVuZGVmaW5lZCwgeyByb29tSWQsIGNvbm5lY3RlZCB9KTtcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBjb25uZWN0ZWQsXHJcbiAgICAgIHJlY29ubmVjdGlvbkF0dGVtcHRzLFxyXG4gICAgICByb29tU3RhdHMsXHJcbiAgICAgIGxhc3RTZWVuOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgIH07XHJcblxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBsb2dFcnJvcignR2V0Q29ubmVjdGlvblN0YXR1cycsIGVycm9yIGFzIEVycm9yLCB7IHJvb21JZCwgdXNlcklkIH0pO1xyXG4gICAgdGltZXIuZmluaXNoKGZhbHNlLCAoZXJyb3IgYXMgRXJyb3IpLm5hbWUpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogV2ViU29ja2V0IGNvbm5lY3Rpb24gZXZlbnQgaGFuZGxlciAoZm9yIEFQSSBHYXRld2F5IFdlYlNvY2tldClcclxuICogVGhpcyB3b3VsZCBiZSB1c2VkIGlmIGltcGxlbWVudGluZyB3aXRoIEFQSSBHYXRld2F5IFdlYlNvY2tldCBpbnN0ZWFkIG9mIEFwcFN5bmNcclxuICovXHJcbmV4cG9ydCBjb25zdCB3ZWJzb2NrZXRIYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBhbnkpID0+IHtcclxuICBjb25zb2xlLmxvZygn8J+MkCBXZWJTb2NrZXQgRXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuICBcclxuICBjb25zdCB7IGV2ZW50VHlwZSwgY29ubmVjdGlvbklkLCByb3V0ZUtleSB9ID0gZXZlbnQucmVxdWVzdENvbnRleHQ7XHJcbiAgY29uc3QgeyByb29tSWQsIHVzZXJJZCB9ID0gZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzIHx8IHt9O1xyXG5cclxuICB0cnkge1xyXG4gICAgc3dpdGNoIChyb3V0ZUtleSkge1xyXG4gICAgICBjYXNlICckY29ubmVjdCc6XHJcbiAgICAgICAgaWYgKHJvb21JZCAmJiB1c2VySWQpIHtcclxuICAgICAgICAgIGF3YWl0IHN0YXRlU3luY1NlcnZpY2UuaGFuZGxlVXNlckNvbm5lY3Rpb24ocm9vbUlkLCB1c2VySWQsIGNvbm5lY3Rpb25JZCk7XHJcbiAgICAgICAgICByZXR1cm4geyBzdGF0dXNDb2RlOiAyMDAsIGJvZHk6ICdDb25uZWN0ZWQnIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB7IHN0YXR1c0NvZGU6IDQwMCwgYm9keTogJ01pc3Npbmcgcm9vbUlkIG9yIHVzZXJJZCcgfTtcclxuXHJcbiAgICAgIGNhc2UgJyRkaXNjb25uZWN0JzpcclxuICAgICAgICBpZiAocm9vbUlkICYmIHVzZXJJZCkge1xyXG4gICAgICAgICAgYXdhaXQgc3RhdGVTeW5jU2VydmljZS5oYW5kbGVVc2VyRGlzY29ubmVjdGlvbihyb29tSWQsIHVzZXJJZCwgY29ubmVjdGlvbklkKTtcclxuICAgICAgICAgIHJldHVybiB7IHN0YXR1c0NvZGU6IDIwMCwgYm9keTogJ0Rpc2Nvbm5lY3RlZCcgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHsgc3RhdHVzQ29kZTogMjAwLCBib2R5OiAnRGlzY29ubmVjdGVkJyB9OyAvLyBBbGxvdyBkaXNjb25uZWN0IGV2ZW4gd2l0aG91dCBwYXJhbXNcclxuXHJcbiAgICAgIGNhc2UgJ3N5bmNTdGF0ZSc6XHJcbiAgICAgICAgaWYgKHJvb21JZCAmJiB1c2VySWQpIHtcclxuICAgICAgICAgIGF3YWl0IHN0YXRlU3luY1NlcnZpY2UudHJpZ2dlclJvb21TdGF0ZVN5bmMocm9vbUlkLCB1c2VySWQpO1xyXG4gICAgICAgICAgcmV0dXJuIHsgc3RhdHVzQ29kZTogMjAwLCBib2R5OiAnU3RhdGUgc3luYyB0cmlnZ2VyZWQnIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB7IHN0YXR1c0NvZGU6IDQwMCwgYm9keTogJ01pc3Npbmcgcm9vbUlkIG9yIHVzZXJJZCcgfTtcclxuXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgcmV0dXJuIHsgc3RhdHVzQ29kZTogNDAwLCBib2R5OiAnVW5rbm93biByb3V0ZScgfTtcclxuICAgIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcign4p2MIFdlYlNvY2tldCBoYW5kbGVyIGVycm9yOicsIGVycm9yKTtcclxuICAgIHJldHVybiB7IFxyXG4gICAgICBzdGF0dXNDb2RlOiA1MDAsIFxyXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KVxyXG4gICAgfTtcclxuICB9XHJcbn07Il19