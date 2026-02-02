/**
 * Trinity Realtime Handler
 * Handles real-time notifications through AppSync subscriptions
 * Migrated from JavaScript lambdas/trinity-realtime-dev/
 */
import { AppSyncEvent } from '../shared/types';
export declare const handler: (event: AppSyncEvent) => Promise<any>;
