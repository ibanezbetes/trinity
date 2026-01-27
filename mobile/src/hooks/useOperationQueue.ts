/**
 * React Hook for Operation Queue
 * Provides queue status and controls to React components
 */

import { useState, useEffect } from 'react';
import { operationQueueService, QueueStats, QueuedOperation } from '../services/operationQueueService';

export interface UseOperationQueueResult {
  stats: QueueStats;
  operations: QueuedOperation[];
  isProcessing: boolean;
  clearQueue: () => Promise<void>;
  removeOperation: (operationId: string) => Promise<boolean>;
  forceProcess: () => Promise<void>;
}

export function useOperationQueue(): UseOperationQueueResult {
  const [stats, setStats] = useState<QueueStats>({
    totalOperations: 0,
    pendingOperations: 0,
    failedOperations: 0,
    successfulOperations: 0,
    averageRetryCount: 0
  });
  
  const [operations, setOperations] = useState<QueuedOperation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Initial load
    updateOperations();
    
    // Subscribe to queue changes
    const unsubscribe = operationQueueService.addQueueListener((newStats) => {
      setStats(newStats);
      updateOperations();
    });

    return unsubscribe;
  }, []);

  const updateOperations = () => {
    const currentOperations = operationQueueService.getQueuedOperations();
    setOperations(currentOperations);
    setStats(operationQueueService.getQueueStats());
  };

  const clearQueue = async () => {
    await operationQueueService.clearQueue();
    updateOperations();
  };

  const removeOperation = async (operationId: string) => {
    return await operationQueueService.removeOperation(operationId);
  };

  const forceProcess = async () => {
    setIsProcessing(true);
    try {
      await operationQueueService.forceProcessQueue();
    } finally {
      setIsProcessing(false);
      updateOperations();
    }
  };

  return {
    stats,
    operations,
    isProcessing,
    clearQueue,
    removeOperation,
    forceProcess
  };
}