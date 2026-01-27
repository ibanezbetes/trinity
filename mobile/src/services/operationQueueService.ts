/**
 * Operation Queue Service
 * Handles queuing and retry logic for network-dependent operations during poor connectivity
 * Validates: Requirements 9.4
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { networkService } from './networkService';
import { errorLoggingService } from './errorLoggingService';

export interface QueuedOperation {
  id: string;
  type: 'VOTE' | 'JOIN_ROOM' | 'CREATE_ROOM' | 'LEAVE_ROOM' | 'UPDATE_FILTERS';
  payload: any;
  roomId?: string;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  expiresAt?: number;
}

export interface OperationResult {
  success: boolean;
  data?: any;
  error?: string;
  fromQueue?: boolean;
}

export interface QueueStats {
  totalOperations: number;
  pendingOperations: number;
  failedOperations: number;
  successfulOperations: number;
  averageRetryCount: number;
}

class OperationQueueService {
  private queue: QueuedOperation[] = [];
  private isProcessing = false;
  private listeners: ((stats: QueueStats) => void)[] = [];
  private storageKey = 'trinity_operation_queue';
  private maxQueueSize = 100;
  private defaultMaxRetries = 3;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeQueue();
    this.setupNetworkListener();
  }

  /**
   * Initialize queue from persistent storage
   */
  private async initializeQueue(): Promise<void> {
    try {
      const storedQueue = await AsyncStorage.getItem(this.storageKey);
      if (storedQueue) {
        this.queue = JSON.parse(storedQueue);
        // Remove expired operations
        this.queue = this.queue.filter(op => !op.expiresAt || op.expiresAt > Date.now());
        await this.persistQueue();
        console.log(`🔄 Operation queue initialized with ${this.queue.length} operations`);
      }
    } catch (error) {
      errorLoggingService.logError(
        error instanceof Error ? error : new Error('Failed to initialize operation queue'),
        {
          operation: 'QUEUE_INITIALIZATION',
          metadata: { queueLength: this.queue.length }
        },
        {
          message: 'Queue initialization failed',
          action: 'Operations will be processed when possible',
          canRetry: false
        }
      );
      this.queue = [];
    }
  }

  /**
   * Setup network listener to process queue when connection improves
   */
  private setupNetworkListener(): void {
    networkService.addNetworkListener((networkState) => {
      if (networkState.isConnected && networkState.isInternetReachable !== false) {
        console.log('🟢 Network restored, processing operation queue');
        this.processQueue();
      }
    });
  }

  /**
   * Add operation to queue
   */
  async queueOperation(
    type: QueuedOperation['type'],
    payload: any,
    options: {
      roomId?: string;
      priority?: QueuedOperation['priority'];
      maxRetries?: number;
      expiresInMs?: number;
    } = {}
  ): Promise<string> {
    const operation: QueuedOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      payload,
      roomId: options.roomId,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.defaultMaxRetries,
      priority: options.priority ?? 'MEDIUM',
      expiresAt: options.expiresInMs ? Date.now() + options.expiresInMs : undefined
    };

    // Check queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      // Remove oldest low priority operations
      this.queue = this.queue
        .filter(op => op.priority !== 'LOW')
        .slice(-(this.maxQueueSize - 1));
    }

    // Insert operation based on priority
    const insertIndex = this.findInsertIndex(operation);
    this.queue.splice(insertIndex, 0, operation);

    await this.persistQueue();
    this.notifyListeners();

    console.log(`📝 Queued ${type} operation (${operation.id}) - Priority: ${operation.priority}`);

    // Try to process immediately if online
    if (networkService.isConnected()) {
      this.processQueue();
    }

    return operation.id;
  }

  /**
   * Find correct insert index based on priority
   */
  private findInsertIndex(operation: QueuedOperation): number {
    const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const opPriority = priorityOrder[operation.priority];

    for (let i = 0; i < this.queue.length; i++) {
      const queuePriority = priorityOrder[this.queue[i].priority];
      if (opPriority < queuePriority) {
        return i;
      }
    }
    return this.queue.length;
  }

  /**
   * Execute operation with retry logic
   */
  async executeOperation(operation: QueuedOperation): Promise<OperationResult> {
    try {
      console.log(`🔄 Executing ${operation.type} operation (${operation.id})`);

      let result: any;
      
      switch (operation.type) {
        case 'VOTE':
          const { voteService } = await import('./voteService');
          result = await voteService.registerVote(
            operation.roomId!,
            operation.payload
          );
          break;

        case 'JOIN_ROOM':
          const { roomService: joinRoomService } = await import('./roomService');
          result = await joinRoomService.joinRoom(operation.payload.inviteCode);
          break;

        case 'CREATE_ROOM':
          const { roomService: createRoomService } = await import('./roomService');
          result = await createRoomService.createRoom(operation.payload);
          break;

        case 'LEAVE_ROOM':
          const { roomService: leaveRoomService } = await import('./roomService');
          await leaveRoomService.leaveRoom(operation.roomId!);
          result = { success: true };
          break;

        case 'UPDATE_FILTERS':
          const { roomService: updateRoomService } = await import('./roomService');
          result = await updateRoomService.updateRoomFilters(
            operation.roomId!,
            operation.payload.filters
          );
          break;

        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      console.log(`✅ Operation ${operation.id} executed successfully`);
      return { success: true, data: result, fromQueue: true };

    } catch (error) {
      errorLoggingService.logError(
        error instanceof Error ? error : new Error('Operation execution failed'),
        {
          operation: `EXECUTE_${operation.type}`,
          roomId: operation.roomId,
          metadata: {
            operationId: operation.id,
            retryCount: operation.retryCount,
            priority: operation.priority
          }
        },
        {
          message: 'Operation failed to complete',
          action: 'Will retry automatically if possible',
          canRetry: operation.retryCount < operation.maxRetries
        }
      );
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        fromQueue: true 
      };
    }
  }

  /**
   * Process all queued operations
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing || !networkService.isConnected()) {
      return;
    }

    this.isProcessing = true;
    console.log(`🔄 Processing operation queue (${this.queue.length} operations)`);

    const operationsToProcess = [...this.queue];
    const processedOperations: string[] = [];
    const failedOperations: QueuedOperation[] = [];

    for (const operation of operationsToProcess) {
      // Check if operation expired
      if (operation.expiresAt && operation.expiresAt < Date.now()) {
        console.log(`⏰ Operation ${operation.id} expired, removing from queue`);
        processedOperations.push(operation.id);
        continue;
      }

      // Check network before each operation
      if (!networkService.isConnected()) {
        console.log('🔴 Network lost during queue processing, stopping');
        break;
      }

      const result = await this.executeOperation(operation);

      if (result.success) {
        processedOperations.push(operation.id);
      } else {
        operation.retryCount++;
        
        if (operation.retryCount >= operation.maxRetries) {
          console.log(`❌ Operation ${operation.id} exceeded max retries, removing from queue`);
          processedOperations.push(operation.id);
        } else {
          console.log(`🔄 Operation ${operation.id} will retry (${operation.retryCount}/${operation.maxRetries})`);
          failedOperations.push(operation);
        }
      }

      // Small delay between operations to avoid overwhelming the server
      await this.delay(100);
    }

    // Update queue - remove processed operations, keep failed ones for retry
    this.queue = this.queue.filter(op => !processedOperations.includes(op.id));
    
    // Update retry counts for failed operations
    failedOperations.forEach(failedOp => {
      const queueIndex = this.queue.findIndex(op => op.id === failedOp.id);
      if (queueIndex !== -1) {
        this.queue[queueIndex] = failedOp;
      }
    });

    await this.persistQueue();
    this.notifyListeners();

    console.log(`✅ Queue processing complete. Processed: ${processedOperations.length}, Remaining: ${this.queue.length}`);
    
    this.isProcessing = false;

    // Schedule next processing if there are still operations and we're online
    if (this.queue.length > 0 && networkService.isConnected()) {
      this.scheduleNextProcessing();
    }
  }

  /**
   * Schedule next queue processing with exponential backoff
   */
  private scheduleNextProcessing(): void {
    if (this.processingInterval) {
      clearTimeout(this.processingInterval);
    }

    // Calculate delay based on average retry count
    const avgRetryCount = this.queue.reduce((sum, op) => sum + op.retryCount, 0) / this.queue.length;
    const baseDelay = 5000; // 5 seconds
    const delay = Math.min(baseDelay * Math.pow(2, avgRetryCount), 60000); // Max 1 minute

    this.processingInterval = setTimeout(() => {
      this.processQueue();
    }, delay);

    console.log(`⏰ Next queue processing scheduled in ${delay}ms`);
  }

  /**
   * Execute operation immediately or queue if offline
   */
  async executeOrQueue<T>(
    type: QueuedOperation['type'],
    payload: any,
    executor: () => Promise<T>,
    options: {
      roomId?: string;
      priority?: QueuedOperation['priority'];
      maxRetries?: number;
      expiresInMs?: number;
    } = {}
  ): Promise<OperationResult> {
    // Try immediate execution if online
    if (networkService.isConnected()) {
      try {
        const result = await executor();
        return { success: true, data: result, fromQueue: false };
      } catch (error) {
        errorLoggingService.logError(
          error instanceof Error ? error : new Error('Immediate execution failed'),
          {
            operation: `IMMEDIATE_${type}`,
            metadata: { payload }
          },
          {
            message: 'Action queued due to connection issues',
            action: 'Will complete when connection improves',
            canRetry: false
          }
        );
        // Fall through to queuing logic
      }
    }

    // Queue operation for later execution
    const operationId = await this.queueOperation(type, payload, options);
    
    return {
      success: false,
      error: 'Operation queued due to network issues',
      data: { operationId, queued: true },
      fromQueue: false
    };
  }

  /**
   * Remove operation from queue
   */
  async removeOperation(operationId: string): Promise<boolean> {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter(op => op.id !== operationId);
    
    if (this.queue.length < initialLength) {
      await this.persistQueue();
      this.notifyListeners();
      console.log(`🗑️ Removed operation ${operationId} from queue`);
      return true;
    }
    
    return false;
  }

  /**
   * Clear all operations from queue
   */
  async clearQueue(): Promise<void> {
    this.queue = [];
    await this.persistQueue();
    this.notifyListeners();
    console.log('🗑️ Operation queue cleared');
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): QueueStats {
    const totalOps = this.queue.length;
    const pendingOps = this.queue.filter(op => op.retryCount === 0).length;
    const failedOps = this.queue.filter(op => op.retryCount > 0).length;
    const avgRetryCount = totalOps > 0 
      ? this.queue.reduce((sum, op) => sum + op.retryCount, 0) / totalOps 
      : 0;

    return {
      totalOperations: totalOps,
      pendingOperations: pendingOps,
      failedOperations: failedOps,
      successfulOperations: 0, // This would need to be tracked separately
      averageRetryCount: avgRetryCount
    };
  }

  /**
   * Get all queued operations
   */
  getQueuedOperations(): QueuedOperation[] {
    return [...this.queue];
  }

  /**
   * Add queue stats listener
   */
  addQueueListener(listener: (stats: QueueStats) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Persist queue to storage
   */
  private async persistQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch (error) {
      errorLoggingService.logError(
        error instanceof Error ? error : new Error('Failed to persist operation queue'),
        {
          operation: 'QUEUE_PERSISTENCE',
          metadata: { queueLength: this.queue.length }
        },
        {
          message: 'Queue sync issue detected',
          action: 'Operations will still be processed',
          canRetry: false
        }
      );
    }
  }

  /**
   * Notify listeners of queue changes
   */
  private notifyListeners(): void {
    const stats = this.getQueueStats();
    this.listeners.forEach(listener => {
      try {
        listener(stats);
      } catch (error) {
        errorLoggingService.logError(
          error instanceof Error ? error : new Error('Queue stats listener error'),
          {
            operation: 'QUEUE_STATS_LISTENER',
            metadata: { listenerIndex: this.listeners.indexOf(listener) }
          }
        );
      }
    });
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Force process queue (for testing/debugging)
   */
  async forceProcessQueue(): Promise<void> {
    if (this.processingInterval) {
      clearTimeout(this.processingInterval);
      this.processingInterval = null;
    }
    await this.processQueue();
  }

  /**
   * Update queue configuration
   */
  updateConfig(config: {
    maxQueueSize?: number;
    defaultMaxRetries?: number;
  }): void {
    if (config.maxQueueSize !== undefined) {
      this.maxQueueSize = config.maxQueueSize;
    }
    if (config.defaultMaxRetries !== undefined) {
      this.defaultMaxRetries = config.defaultMaxRetries;
    }
    console.log('🔧 Operation queue configuration updated:', {
      maxQueueSize: this.maxQueueSize,
      defaultMaxRetries: this.defaultMaxRetries
    });
  }
}

export const operationQueueService = new OperationQueueService();
export default operationQueueService;