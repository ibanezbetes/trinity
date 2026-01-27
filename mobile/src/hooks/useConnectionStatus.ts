/**
 * useConnectionStatus Hook
 * 
 * React hook for managing connection status and room subscriptions.
 * Handles network connectivity, WebSocket connections, and real-time updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { appSyncService } from '../services/appSyncService';

export interface ConnectionStatus {
  isConnected: boolean;
  isOnline: boolean;
  connectionType: string | null;
  isReconnecting: boolean;
  lastConnected: Date | null;
}

export interface RoomSubscription {
  roomId: string;
  isSubscribed: boolean;
  lastUpdate: Date | null;
  error?: string;
}

interface UseConnectionStatusResult {
  connectionStatus: ConnectionStatus;
  subscriptions: Map<string, RoomSubscription>;
  subscribeToRoom: (roomId: string) => Promise<void>;
  unsubscribeFromRoom: (roomId: string) => void;
  reconnect: () => Promise<void>;
  isRoomSubscribed: (roomId: string) => boolean;
}

export const useConnectionStatus = (): UseConnectionStatusResult => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: false,
    isOnline: false,
    connectionType: null,
    isReconnecting: false,
    lastConnected: null
  });

  const [subscriptions, setSubscriptions] = useState<Map<string, RoomSubscription>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscriptionRefs = useRef<Map<string, any>>(new Map());

  // Monitor network connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setConnectionStatus(prev => ({
        ...prev,
        isConnected: state.isConnected ?? false,
        isOnline: state.isInternetReachable ?? false,
        connectionType: state.type,
        lastConnected: state.isConnected ? new Date() : prev.lastConnected
      }));
    });

    return unsubscribe;
  }, []);

  // Auto-reconnect logic
  useEffect(() => {
    if (!connectionStatus.isConnected && !connectionStatus.isReconnecting) {
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnect();
      }, 5000);
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectionStatus.isConnected, connectionStatus.isReconnecting]);

  const reconnect = useCallback(async () => {
    if (connectionStatus.isReconnecting) return;

    setConnectionStatus(prev => ({ ...prev, isReconnecting: true }));

    try {
      // Attempt to reconnect AppSync
      await appSyncService.forceReconnection();
      
      // Re-establish room subscriptions
      const roomIds = Array.from(subscriptions.keys());
      for (const roomId of roomIds) {
        try {
          await subscribeToRoom(roomId);
        } catch (error) {
          console.warn(`Failed to resubscribe to room ${roomId}:`, error);
        }
      }
    } catch (error) {
      console.error('Reconnection failed:', error);
    } finally {
      setConnectionStatus(prev => ({ ...prev, isReconnecting: false }));
    }
  }, [connectionStatus.isReconnecting, subscriptions]);

  const subscribeToRoom = useCallback(async (roomId: string) => {
    try {
      // Unsubscribe if already subscribed
      if (subscriptionRefs.current.has(roomId)) {
        const existingSubscription = subscriptionRefs.current.get(roomId);
        existingSubscription?.();
      }

      // Create new subscription using available methods
      const subscription = await appSyncService.subscribeWithReconnection(
        roomId, 
        'room-state', 
        (data: any) => {
          console.log('Room update received:', data);
          setSubscriptions(prev => new Map(prev).set(roomId, {
            ...prev.get(roomId)!,
            lastUpdate: new Date()
          }));
        }
      );
      
      subscriptionRefs.current.set(roomId, subscription);

      setSubscriptions(prev => new Map(prev).set(roomId, {
        roomId,
        isSubscribed: true,
        lastUpdate: new Date(),
        error: undefined
      }));

    } catch (error) {
      console.error(`Failed to subscribe to room ${roomId}:`, error);
      setSubscriptions(prev => new Map(prev).set(roomId, {
        roomId,
        isSubscribed: false,
        lastUpdate: null,
        error: error instanceof Error ? error.message : 'Subscription failed'
      }));
      throw error;
    }
  }, []);

  const unsubscribeFromRoom = useCallback((roomId: string) => {
    const subscription = subscriptionRefs.current.get(roomId);
    if (subscription) {
      subscription();
      subscriptionRefs.current.delete(roomId);
    }

    setSubscriptions(prev => {
      const newMap = new Map(prev);
      newMap.delete(roomId);
      return newMap;
    });
  }, []);

  const isRoomSubscribed = useCallback((roomId: string) => {
    return subscriptions.get(roomId)?.isSubscribed ?? false;
  }, [subscriptions]);

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      subscriptionRefs.current.forEach(subscription => {
        subscription?.();
      });
      subscriptionRefs.current.clear();
    };
  }, []);

  return {
    connectionStatus,
    subscriptions,
    subscribeToRoom,
    unsubscribeFromRoom,
    reconnect,
    isRoomSubscribed
  };
};

/**
 * Hook for room-specific subscriptions
 */
export const useRoomSubscriptions = (roomId: string) => {
  const { subscribeToRoom, unsubscribeFromRoom, isRoomSubscribed, connectionStatus } = useConnectionStatus();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const subscribe = async () => {
      try {
        await subscribeToRoom(roomId);
        setIsSubscribed(true);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Subscription failed');
        setIsSubscribed(false);
      }
    };

    subscribe();

    return () => {
      unsubscribeFromRoom(roomId);
      setIsSubscribed(false);
    };
  }, [roomId, subscribeToRoom, unsubscribeFromRoom]);

  useEffect(() => {
    setIsSubscribed(isRoomSubscribed(roomId));
  }, [roomId, isRoomSubscribed]);

  return {
    isSubscribed,
    error,
    connectionStatus,
    retry: () => subscribeToRoom(roomId)
  };
};

export default useConnectionStatus;