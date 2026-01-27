/**
 * Google Profile Synchronization Service
 * Handles Google profile data mapping to Cognito user attributes,
 * automatic profile sync when Google data changes, and conflict resolution
 */

import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { cognitoAuthService, CognitoUser } from './cognitoAuthService';
import { secureTokenStorage } from './secureTokenStorage';
import { loggingService } from './loggingService';

export interface GoogleProfile {
  id: string;
  email: string;
  name: string;
  givenName?: string;
  familyName?: string;
  photo?: string;
  locale?: string;
  verifiedEmail?: boolean;
}

export interface ProfileSyncConfig {
  enableAutoSync: boolean;
  syncIntervalMinutes: number;
  conflictResolutionStrategy: 'google_priority' | 'cognito_priority' | 'most_recent' | 'manual';
  syncFields: Array<'name' | 'email' | 'picture' | 'locale'>;
  enableConflictLogging: boolean;
}

export interface ProfileSyncResult {
  success: boolean;
  syncedFields: string[];
  conflicts: Array<{
    field: string;
    googleValue: any;
    cognitoValue: any;
    resolvedValue: any;
    strategy: string;
  }>;
  error?: string;
}

export interface ProfileConflict {
  field: string;
  googleValue: any;
  cognitoValue: any;
  lastGoogleUpdate?: number;
  lastCognitoUpdate?: number;
}

class GoogleProfileSyncService {
  private config: ProfileSyncConfig = {
    enableAutoSync: true,
    syncIntervalMinutes: 60, // Sync every hour
    conflictResolutionStrategy: 'most_recent',
    syncFields: ['name', 'picture', 'locale'],
    enableConflictLogging: true,
  };

  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime: number = 0;
  private lastGoogleProfile: GoogleProfile | null = null;

  // Event listeners for sync events
  private syncEventListeners: Array<(event: { type: 'sync_started' | 'sync_completed' | 'sync_failed' | 'conflict_detected'; data?: any }) => void> = [];

  constructor() {
    loggingService.info('GoogleProfileSync', 'Google profile sync service initialized', {
      config: this.config,
    });
  }

  /**
   * Start automatic profile synchronization
   */
  start(customConfig?: Partial<ProfileSyncConfig>): void {
    try {
      // Update config if provided
      if (customConfig) {
        this.config = { ...this.config, ...customConfig };
      }

      // Stop existing sync
      this.stop();

      loggingService.info('GoogleProfileSync', 'Starting profile synchronization', {
        enableAutoSync: this.config.enableAutoSync,
        syncIntervalMinutes: this.config.syncIntervalMinutes,
        syncFields: this.config.syncFields,
      });

      // Set up periodic sync if enabled
      if (this.config.enableAutoSync) {
        const intervalMs = this.config.syncIntervalMinutes * 60 * 1000;
        this.syncInterval = setInterval(() => {
          this.performProfileSync();
        }, intervalMs);

        // Perform initial sync
        setTimeout(() => this.performProfileSync(), 2000);
      }

    } catch (error: any) {
      console.error('Error starting Google profile sync:', error);
      loggingService.error('GoogleProfileSync', 'Failed to start sync', { error: error.message });
    }
  }

  /**
   * Stop automatic profile synchronization
   */
  stop(): void {
    try {
      loggingService.info('GoogleProfileSync', 'Stopping profile synchronization');

      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
      }

    } catch (error: any) {
      console.error('Error stopping Google profile sync:', error);
      loggingService.error('GoogleProfileSync', 'Failed to stop sync', { error: error.message });
    }
  }

  /**
   * Manually trigger profile synchronization
   */
  async syncProfile(): Promise<ProfileSyncResult> {
    return await this.performProfileSync();
  }

  /**
   * Get current Google profile data
   */
  async getCurrentGoogleProfile(): Promise<GoogleProfile | null> {
    try {
      // Check if user is signed in to Google
      const isSignedIn = await GoogleSignin.isSignedIn();
      if (!isSignedIn) {
        return null;
      }

      // Get current user info
      const userInfo = await GoogleSignin.getCurrentUser();
      if (!userInfo || !userInfo.user) {
        return null;
      }

      const googleProfile: GoogleProfile = {
        id: userInfo.user.id,
        email: userInfo.user.email,
        name: userInfo.user.name || '',
        givenName: userInfo.user.givenName,
        familyName: userInfo.user.familyName,
        photo: userInfo.user.photo,
        locale: 'en', // Default locale, could be enhanced
        verifiedEmail: true, // Google emails are verified
      };

      loggingService.debug('GoogleProfileSync', 'Retrieved Google profile', {
        hasProfile: true,
        email: googleProfile.email,
        name: googleProfile.name,
      });

      return googleProfile;

    } catch (error: any) {
      console.error('Error getting Google profile:', error);
      loggingService.error('GoogleProfileSync', 'Failed to get Google profile', { error: error.message });
      return null;
    }
  }

  /**
   * Detect conflicts between Google and Cognito profiles
   */
  async detectProfileConflicts(googleProfile: GoogleProfile, cognitoUser: CognitoUser): Promise<ProfileConflict[]> {
    const conflicts: ProfileConflict[] = [];

    try {
      // Check each configured sync field for conflicts
      for (const field of this.config.syncFields) {
        let googleValue: any;
        let cognitoValue: any;

        switch (field) {
          case 'name':
            googleValue = googleProfile.name;
            cognitoValue = cognitoUser.name || cognitoUser.preferred_username;
            break;
          case 'email':
            googleValue = googleProfile.email;
            cognitoValue = cognitoUser.email;
            break;
          case 'picture':
            googleValue = googleProfile.photo;
            cognitoValue = cognitoUser.picture;
            break;
          case 'locale':
            googleValue = googleProfile.locale;
            cognitoValue = cognitoUser.locale;
            break;
          default:
            continue;
        }

        // Check if values are different (normalize for comparison)
        const normalizedGoogleValue = this.normalizeValue(googleValue);
        const normalizedCognitoValue = this.normalizeValue(cognitoValue);

        if (normalizedGoogleValue !== normalizedCognitoValue) {
          conflicts.push({
            field,
            googleValue: normalizedGoogleValue,
            cognitoValue: normalizedCognitoValue,
            lastGoogleUpdate: Date.now(), // In real implementation, this would come from Google API
            lastCognitoUpdate: cognitoUser.updated_at ? new Date(cognitoUser.updated_at).getTime() : undefined,
          });
        }
      }

      if (conflicts.length > 0 && this.config.enableConflictLogging) {
        loggingService.info('GoogleProfileSync', 'Profile conflicts detected', {
          conflictCount: conflicts.length,
          conflicts: conflicts.map(c => ({ field: c.field, googleValue: c.googleValue, cognitoValue: c.cognitoValue })),
        });
      }

      return conflicts;

    } catch (error: any) {
      console.error('Error detecting profile conflicts:', error);
      loggingService.error('GoogleProfileSync', 'Failed to detect conflicts', { error: error.message });
      return [];
    }
  }

  /**
   * Resolve profile conflicts based on configured strategy
   */
  resolveProfileConflicts(conflicts: ProfileConflict[]): Array<{
    field: string;
    resolvedValue: any;
    strategy: string;
    googleValue: any;
    cognitoValue: any;
  }> {
    const resolutions: Array<{
      field: string;
      resolvedValue: any;
      strategy: string;
      googleValue: any;
      cognitoValue: any;
    }> = [];

    try {
      for (const conflict of conflicts) {
        let resolvedValue: any;
        let strategy = this.config.conflictResolutionStrategy;

        switch (this.config.conflictResolutionStrategy) {
          case 'google_priority':
            resolvedValue = conflict.googleValue;
            break;

          case 'cognito_priority':
            resolvedValue = conflict.cognitoValue;
            break;

          case 'most_recent':
            // Use most recently updated value
            if (conflict.lastGoogleUpdate && conflict.lastCognitoUpdate) {
              resolvedValue = conflict.lastGoogleUpdate > conflict.lastCognitoUpdate 
                ? conflict.googleValue 
                : conflict.cognitoValue;
            } else if (conflict.lastGoogleUpdate) {
              resolvedValue = conflict.googleValue;
            } else if (conflict.lastCognitoUpdate) {
              resolvedValue = conflict.cognitoValue;
            } else {
              // Default to Google if no timestamps available
              resolvedValue = conflict.googleValue;
              strategy = 'google_priority';
            }
            break;

          case 'manual':
            // For manual resolution, prefer non-empty values
            if (conflict.googleValue && !conflict.cognitoValue) {
              resolvedValue = conflict.googleValue;
              strategy = 'google_priority';
            } else if (conflict.cognitoValue && !conflict.googleValue) {
              resolvedValue = conflict.cognitoValue;
              strategy = 'cognito_priority';
            } else {
              // Both have values, prefer Google for now (could be enhanced with user prompt)
              resolvedValue = conflict.googleValue;
              strategy = 'google_priority';
            }
            break;

          default:
            resolvedValue = conflict.googleValue;
            strategy = 'google_priority';
        }

        resolutions.push({
          field: conflict.field,
          resolvedValue,
          strategy,
          googleValue: conflict.googleValue,
          cognitoValue: conflict.cognitoValue,
        });
      }

      loggingService.debug('GoogleProfileSync', 'Resolved profile conflicts', {
        resolutionCount: resolutions.length,
        strategy: this.config.conflictResolutionStrategy,
      });

      return resolutions;

    } catch (error: any) {
      console.error('Error resolving profile conflicts:', error);
      loggingService.error('GoogleProfileSync', 'Failed to resolve conflicts', { error: error.message });
      return [];
    }
  }

  /**
   * Apply profile updates to Cognito
   */
  async applyProfileUpdates(updates: Array<{ field: string; value: any }>): Promise<{ success: boolean; updatedFields: string[]; error?: string }> {
    try {
      // Get current tokens
      const authState = await cognitoAuthService.checkStoredAuth();
      if (!authState.isAuthenticated || !authState.tokens) {
        throw new Error('User not authenticated');
      }

      // Build update attributes
      const updateAttributes: { [key: string]: string } = {};
      const updatedFields: string[] = [];

      for (const update of updates) {
        if (update.value !== null && update.value !== undefined && update.value !== '') {
          switch (update.field) {
            case 'name':
              updateAttributes.name = String(update.value);
              updateAttributes.preferred_username = String(update.value);
              updatedFields.push('name');
              break;
            case 'picture':
              updateAttributes.picture = String(update.value);
              updatedFields.push('picture');
              break;
            case 'locale':
              updateAttributes.locale = String(update.value);
              updatedFields.push('locale');
              break;
            // Note: Email updates require special handling in Cognito
          }
        }
      }

      if (Object.keys(updateAttributes).length === 0) {
        return { success: true, updatedFields: [] };
      }

      // Apply updates to Cognito
      const updateResult = await cognitoAuthService.updateUserAttributes(
        authState.tokens.accessToken,
        updateAttributes
      );

      if (updateResult.success) {
        loggingService.info('GoogleProfileSync', 'Profile updates applied successfully', {
          updatedFields,
          updateAttributes,
        });

        return { success: true, updatedFields };
      } else {
        throw new Error(updateResult.error || 'Failed to update profile');
      }

    } catch (error: any) {
      console.error('Error applying profile updates:', error);
      loggingService.error('GoogleProfileSync', 'Failed to apply profile updates', { error: error.message });
      return { success: false, updatedFields: [], error: error.message };
    }
  }

  /**
   * Add sync event listener
   */
  addSyncEventListener(listener: (event: { type: 'sync_started' | 'sync_completed' | 'sync_failed' | 'conflict_detected'; data?: any }) => void): void {
    this.syncEventListeners.push(listener);
  }

  /**
   * Remove sync event listener
   */
  removeSyncEventListener(listener: (event: { type: 'sync_started' | 'sync_completed' | 'sync_failed' | 'conflict_detected'; data?: any }) => void): void {
    const index = this.syncEventListeners.indexOf(listener);
    if (index > -1) {
      this.syncEventListeners.splice(index, 1);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ProfileSyncConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    loggingService.info('GoogleProfileSync', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });

    // Restart if interval changed and service is running
    if (this.syncInterval && oldConfig.syncIntervalMinutes !== this.config.syncIntervalMinutes) {
      this.start();
    }
  }

  /**
   * Get sync status and statistics
   */
  getSyncStatus(): {
    isActive: boolean;
    config: ProfileSyncConfig;
    lastSyncTime: number;
    lastGoogleProfile: GoogleProfile | null;
    listenerCount: number;
  } {
    return {
      isActive: !!this.syncInterval,
      config: { ...this.config },
      lastSyncTime: this.lastSyncTime,
      lastGoogleProfile: this.lastGoogleProfile ? { ...this.lastGoogleProfile } : null,
      listenerCount: this.syncEventListeners.length,
    };
  }

  // Private helper methods

  private async performProfileSync(): Promise<ProfileSyncResult> {
    try {
      loggingService.debug('GoogleProfileSync', 'Starting profile sync');
      
      this.notifySyncEventListeners({ type: 'sync_started' });

      // Get current Google profile
      const googleProfile = await this.getCurrentGoogleProfile();
      if (!googleProfile) {
        const result: ProfileSyncResult = {
          success: false,
          syncedFields: [],
          conflicts: [],
          error: 'No Google profile available',
        };
        
        this.notifySyncEventListeners({ type: 'sync_failed', data: result });
        return result;
      }

      // Get current Cognito user
      const authState = await cognitoAuthService.checkStoredAuth();
      if (!authState.isAuthenticated || !authState.user) {
        const result: ProfileSyncResult = {
          success: false,
          syncedFields: [],
          conflicts: [],
          error: 'User not authenticated',
        };
        
        this.notifySyncEventListeners({ type: 'sync_failed', data: result });
        return result;
      }

      // Detect conflicts
      const conflicts = await this.detectProfileConflicts(googleProfile, authState.user);
      
      if (conflicts.length > 0) {
        this.notifySyncEventListeners({ type: 'conflict_detected', data: { conflicts } });
      }

      // Resolve conflicts
      const resolutions = this.resolveProfileConflicts(conflicts);

      // Apply updates
      const updates = resolutions.map(r => ({ field: r.field, value: r.resolvedValue }));
      const applyResult = await this.applyProfileUpdates(updates);

      // Update tracking
      this.lastSyncTime = Date.now();
      this.lastGoogleProfile = googleProfile;

      const result: ProfileSyncResult = {
        success: applyResult.success,
        syncedFields: applyResult.updatedFields,
        conflicts: resolutions.map(r => ({
          field: r.field,
          googleValue: r.googleValue,
          cognitoValue: r.cognitoValue,
          resolvedValue: r.resolvedValue,
          strategy: r.strategy,
        })),
        error: applyResult.error,
      };

      loggingService.info('GoogleProfileSync', 'Profile sync completed', {
        success: result.success,
        syncedFieldsCount: result.syncedFields.length,
        conflictsCount: result.conflicts.length,
      });

      this.notifySyncEventListeners({ type: 'sync_completed', data: result });
      return result;

    } catch (error: any) {
      console.error('Error during profile sync:', error);
      
      const result: ProfileSyncResult = {
        success: false,
        syncedFields: [],
        conflicts: [],
        error: error.message,
      };

      loggingService.error('GoogleProfileSync', 'Profile sync failed', { error: error.message });
      this.notifySyncEventListeners({ type: 'sync_failed', data: result });
      return result;
    }
  }

  private normalizeValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim().toLowerCase();
  }

  private notifySyncEventListeners(event: { type: 'sync_started' | 'sync_completed' | 'sync_failed' | 'conflict_detected'; data?: any }): void {
    try {
      this.syncEventListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in sync event listener:', error);
        }
      });
    } catch (error) {
      console.error('Error notifying sync event listeners:', error);
    }
  }
}

export const googleProfileSyncService = new GoogleProfileSyncService();
export type { GoogleProfile, ProfileSyncConfig, ProfileSyncResult, ProfileConflict };