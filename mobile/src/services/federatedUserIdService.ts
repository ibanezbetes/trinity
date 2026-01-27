/**
 * Federated User ID Service
 * Ensures consistent user IDs across all federated sessions,
 * handles user ID mapping between Google and Cognito, and manages user profile consistency
 */

import { cognitoAuthService, CognitoUser, CognitoTokens } from './cognitoAuthService';
import { secureTokenStorage } from './secureTokenStorage';
import { loggingService } from './loggingService';

export interface FederatedUserMapping {
  cognitoSub: string; // Cognito user sub (primary identifier)
  googleId?: string; // Google user ID
  email: string; // Email (common identifier)
  federatedIdentities: Array<{
    provider: 'Google' | 'Cognito';
    providerId: string;
    dateLinked: number;
    isActive: boolean;
  }>;
  lastSyncTime: number;
  consistencyHash: string; // Hash to detect inconsistencies
}

export interface UserIdConsistencyCheck {
  isConsistent: boolean;
  cognitoSub: string;
  googleId?: string;
  email: string;
  inconsistencies: Array<{
    type: 'missing_google_id' | 'missing_cognito_sub' | 'email_mismatch' | 'provider_mismatch';
    description: string;
    expectedValue?: string;
    actualValue?: string;
  }>;
  recommendedAction: 'no_action' | 'update_mapping' | 'relink_account' | 'create_new_mapping';
}

export interface UserIdMappingConfig {
  enableAutoMapping: boolean;
  enableConsistencyChecks: boolean;
  checkIntervalMinutes: number;
  autoFixInconsistencies: boolean;
  preserveOriginalIds: boolean;
}

class FederatedUserIdService {
  private config: UserIdMappingConfig = {
    enableAutoMapping: true,
    enableConsistencyChecks: true,
    checkIntervalMinutes: 30,
    autoFixInconsistencies: true,
    preserveOriginalIds: true,
  };

  private consistencyCheckInterval: NodeJS.Timeout | null = null;
  private userMappingCache: Map<string, FederatedUserMapping> = new Map();
  private lastConsistencyCheck: number = 0;

  // Event listeners for mapping events
  private mappingEventListeners: Array<(event: { type: 'mapping_created' | 'mapping_updated' | 'inconsistency_detected' | 'inconsistency_resolved'; data?: any }) => void> = [];

  constructor() {
    loggingService.info('FederatedUserId', 'Federated user ID service initialized', {
      config: this.config,
    });
  }

  /**
   * Start federated user ID management
   */
  start(customConfig?: Partial<UserIdMappingConfig>): void {
    try {
      // Update config if provided
      if (customConfig) {
        this.config = { ...this.config, ...customConfig };
      }

      // Stop existing monitoring
      this.stop();

      loggingService.info('FederatedUserId', 'Starting federated user ID management', {
        enableAutoMapping: this.config.enableAutoMapping,
        enableConsistencyChecks: this.config.enableConsistencyChecks,
        checkIntervalMinutes: this.config.checkIntervalMinutes,
      });

      // Set up periodic consistency checks if enabled
      if (this.config.enableConsistencyChecks) {
        const intervalMs = this.config.checkIntervalMinutes * 60 * 1000;
        this.consistencyCheckInterval = setInterval(() => {
          this.performConsistencyCheck();
        }, intervalMs);

        // Perform initial check
        setTimeout(() => this.performConsistencyCheck(), 5000);
      }

    } catch (error: any) {
      console.error('Error starting federated user ID service:', error);
      loggingService.error('FederatedUserId', 'Failed to start service', { error: error.message });
    }
  }

  /**
   * Stop federated user ID management
   */
  stop(): void {
    try {
      loggingService.info('FederatedUserId', 'Stopping federated user ID management');

      if (this.consistencyCheckInterval) {
        clearInterval(this.consistencyCheckInterval);
        this.consistencyCheckInterval = null;
      }

      this.userMappingCache.clear();

    } catch (error: any) {
      console.error('Error stopping federated user ID service:', error);
      loggingService.error('FederatedUserId', 'Failed to stop service', { error: error.message });
    }
  }

  /**
   * Create or update user ID mapping for federated user
   */
  async createUserMapping(cognitoUser: CognitoUser, googleId?: string): Promise<{ success: boolean; mapping?: FederatedUserMapping; error?: string }> {
    try {
      loggingService.info('FederatedUserId', 'Creating user mapping', {
        cognitoSub: cognitoUser.sub,
        email: cognitoUser.email,
        hasGoogleId: !!googleId,
      });

      // Build federated identities list
      const federatedIdentities: FederatedUserMapping['federatedIdentities'] = [
        {
          provider: 'Cognito',
          providerId: cognitoUser.sub,
          dateLinked: Date.now(),
          isActive: true,
        },
      ];

      if (googleId) {
        federatedIdentities.push({
          provider: 'Google',
          providerId: googleId,
          dateLinked: Date.now(),
          isActive: true,
        });
      }

      // Create mapping
      const mapping: FederatedUserMapping = {
        cognitoSub: cognitoUser.sub,
        googleId,
        email: cognitoUser.email,
        federatedIdentities,
        lastSyncTime: Date.now(),
        consistencyHash: this.generateConsistencyHash(cognitoUser.sub, googleId, cognitoUser.email),
      };

      // Store in cache and persistent storage
      this.userMappingCache.set(cognitoUser.sub, mapping);
      await this.persistUserMapping(mapping);

      loggingService.info('FederatedUserId', 'User mapping created successfully', {
        cognitoSub: mapping.cognitoSub,
        googleId: mapping.googleId,
        email: mapping.email,
      });

      this.notifyMappingEventListeners({ type: 'mapping_created', data: { mapping } });

      return { success: true, mapping };

    } catch (error: any) {
      console.error('Error creating user mapping:', error);
      loggingService.error('FederatedUserId', 'Failed to create user mapping', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user mapping by Cognito sub
   */
  async getUserMapping(cognitoSub: string): Promise<FederatedUserMapping | null> {
    try {
      // Check cache first
      if (this.userMappingCache.has(cognitoSub)) {
        return this.userMappingCache.get(cognitoSub)!;
      }

      // Load from persistent storage
      const mapping = await this.loadUserMapping(cognitoSub);
      if (mapping) {
        this.userMappingCache.set(cognitoSub, mapping);
      }

      return mapping;

    } catch (error: any) {
      console.error('Error getting user mapping:', error);
      loggingService.error('FederatedUserId', 'Failed to get user mapping', { error: error.message });
      return null;
    }
  }

  /**
   * Find user mapping by Google ID
   */
  async getUserMappingByGoogleId(googleId: string): Promise<FederatedUserMapping | null> {
    try {
      // Search cache first
      for (const [, mapping] of this.userMappingCache) {
        if (mapping.googleId === googleId) {
          return mapping;
        }
      }

      // Search persistent storage
      const mapping = await this.loadUserMappingByGoogleId(googleId);
      if (mapping) {
        this.userMappingCache.set(mapping.cognitoSub, mapping);
      }

      return mapping;

    } catch (error: any) {
      console.error('Error finding user mapping by Google ID:', error);
      loggingService.error('FederatedUserId', 'Failed to find user mapping by Google ID', { error: error.message });
      return null;
    }
  }

  /**
   * Check user ID consistency for current user
   */
  async checkUserIdConsistency(): Promise<UserIdConsistencyCheck> {
    try {
      // Get current authentication state
      const authState = await cognitoAuthService.checkStoredAuth();
      if (!authState.isAuthenticated || !authState.user) {
        return {
          isConsistent: false,
          cognitoSub: '',
          email: '',
          inconsistencies: [{
            type: 'missing_cognito_sub',
            description: 'No authenticated Cognito user found',
          }],
          recommendedAction: 'relink_account',
        };
      }

      const cognitoUser = authState.user;
      
      // Get user mapping
      const mapping = await this.getUserMapping(cognitoUser.sub);
      
      return await this.performUserIdConsistencyCheck(cognitoUser, mapping);

    } catch (error: any) {
      console.error('Error checking user ID consistency:', error);
      loggingService.error('FederatedUserId', 'Failed to check consistency', { error: error.message });
      
      return {
        isConsistent: false,
        cognitoSub: '',
        email: '',
        inconsistencies: [{
          type: 'missing_cognito_sub',
          description: `Consistency check failed: ${error.message}`,
        }],
        recommendedAction: 'relink_account',
      };
    }
  }

  /**
   * Fix user ID inconsistencies
   */
  async fixUserIdInconsistencies(consistencyCheck: UserIdConsistencyCheck): Promise<{ success: boolean; fixedInconsistencies: string[]; error?: string }> {
    try {
      if (consistencyCheck.isConsistent) {
        return { success: true, fixedInconsistencies: [] };
      }

      loggingService.info('FederatedUserId', 'Fixing user ID inconsistencies', {
        cognitoSub: consistencyCheck.cognitoSub,
        inconsistencyCount: consistencyCheck.inconsistencies.length,
        recommendedAction: consistencyCheck.recommendedAction,
      });

      const fixedInconsistencies: string[] = [];

      switch (consistencyCheck.recommendedAction) {
        case 'update_mapping':
          // Update existing mapping with correct information
          const authState = await cognitoAuthService.checkStoredAuth();
          if (authState.isAuthenticated && authState.user) {
            const updateResult = await this.createUserMapping(authState.user, consistencyCheck.googleId);
            if (updateResult.success) {
              fixedInconsistencies.push('updated_user_mapping');
            }
          }
          break;

        case 'create_new_mapping':
          // Create new mapping for user
          const newAuthState = await cognitoAuthService.checkStoredAuth();
          if (newAuthState.isAuthenticated && newAuthState.user) {
            const createResult = await this.createUserMapping(newAuthState.user);
            if (createResult.success) {
              fixedInconsistencies.push('created_user_mapping');
            }
          }
          break;

        case 'relink_account':
          // This requires user intervention, log the need for manual action
          loggingService.warn('FederatedUserId', 'Account relinking required - manual user action needed', {
            cognitoSub: consistencyCheck.cognitoSub,
            email: consistencyCheck.email,
          });
          fixedInconsistencies.push('marked_for_manual_relink');
          break;

        case 'no_action':
        default:
          // No action needed
          break;
      }

      if (fixedInconsistencies.length > 0) {
        this.notifyMappingEventListeners({ 
          type: 'inconsistency_resolved', 
          data: { 
            cognitoSub: consistencyCheck.cognitoSub,
            fixedInconsistencies,
          } 
        });
      }

      loggingService.info('FederatedUserId', 'Inconsistency fix completed', {
        fixedCount: fixedInconsistencies.length,
        fixedInconsistencies,
      });

      return { success: true, fixedInconsistencies };

    } catch (error: any) {
      console.error('Error fixing user ID inconsistencies:', error);
      loggingService.error('FederatedUserId', 'Failed to fix inconsistencies', { error: error.message });
      return { success: false, fixedInconsistencies: [], error: error.message };
    }
  }

  /**
   * Link Google account to existing Cognito user
   */
  async linkGoogleAccount(cognitoSub: string, googleId: string): Promise<{ success: boolean; mapping?: FederatedUserMapping; error?: string }> {
    try {
      loggingService.info('FederatedUserId', 'Linking Google account', {
        cognitoSub,
        googleId,
      });

      // Get existing mapping or create new one
      let mapping = await this.getUserMapping(cognitoSub);
      
      if (mapping) {
        // Update existing mapping
        mapping.googleId = googleId;
        mapping.federatedIdentities.push({
          provider: 'Google',
          providerId: googleId,
          dateLinked: Date.now(),
          isActive: true,
        });
        mapping.lastSyncTime = Date.now();
        mapping.consistencyHash = this.generateConsistencyHash(mapping.cognitoSub, googleId, mapping.email);
        
        this.notifyMappingEventListeners({ type: 'mapping_updated', data: { mapping } });
      } else {
        // Get Cognito user info to create new mapping
        const authState = await cognitoAuthService.checkStoredAuth();
        if (!authState.isAuthenticated || !authState.user || authState.user.sub !== cognitoSub) {
          throw new Error('Cannot link account: user not authenticated or sub mismatch');
        }

        const createResult = await this.createUserMapping(authState.user, googleId);
        if (!createResult.success) {
          throw new Error(createResult.error || 'Failed to create mapping');
        }
        mapping = createResult.mapping!;
      }

      // Persist updated mapping
      await this.persistUserMapping(mapping);
      this.userMappingCache.set(cognitoSub, mapping);

      loggingService.info('FederatedUserId', 'Google account linked successfully', {
        cognitoSub: mapping.cognitoSub,
        googleId: mapping.googleId,
      });

      return { success: true, mapping };

    } catch (error: any) {
      console.error('Error linking Google account:', error);
      loggingService.error('FederatedUserId', 'Failed to link Google account', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Add mapping event listener
   */
  addMappingEventListener(listener: (event: { type: 'mapping_created' | 'mapping_updated' | 'inconsistency_detected' | 'inconsistency_resolved'; data?: any }) => void): void {
    this.mappingEventListeners.push(listener);
  }

  /**
   * Remove mapping event listener
   */
  removeMappingEventListener(listener: (event: { type: 'mapping_created' | 'mapping_updated' | 'inconsistency_detected' | 'inconsistency_resolved'; data?: any }) => void): void {
    const index = this.mappingEventListeners.indexOf(listener);
    if (index > -1) {
      this.mappingEventListeners.splice(index, 1);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<UserIdMappingConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    loggingService.info('FederatedUserId', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });

    // Restart if interval changed and service is running
    if (this.consistencyCheckInterval && oldConfig.checkIntervalMinutes !== this.config.checkIntervalMinutes) {
      this.start();
    }
  }

  /**
   * Get service status
   */
  getServiceStatus(): {
    isActive: boolean;
    config: UserIdMappingConfig;
    lastConsistencyCheck: number;
    cachedMappingsCount: number;
    listenerCount: number;
  } {
    return {
      isActive: !!this.consistencyCheckInterval,
      config: { ...this.config },
      lastConsistencyCheck: this.lastConsistencyCheck,
      cachedMappingsCount: this.userMappingCache.size,
      listenerCount: this.mappingEventListeners.length,
    };
  }

  // Private helper methods

  private async performConsistencyCheck(): Promise<void> {
    try {
      loggingService.debug('FederatedUserId', 'Performing consistency check');
      
      const consistencyCheck = await this.checkUserIdConsistency();
      this.lastConsistencyCheck = Date.now();

      if (!consistencyCheck.isConsistent) {
        loggingService.warn('FederatedUserId', 'User ID inconsistencies detected', {
          cognitoSub: consistencyCheck.cognitoSub,
          inconsistencyCount: consistencyCheck.inconsistencies.length,
          recommendedAction: consistencyCheck.recommendedAction,
        });

        this.notifyMappingEventListeners({ 
          type: 'inconsistency_detected', 
          data: { consistencyCheck } 
        });

        // Auto-fix if enabled
        if (this.config.autoFixInconsistencies) {
          await this.fixUserIdInconsistencies(consistencyCheck);
        }
      }

    } catch (error: any) {
      console.error('Error during consistency check:', error);
      loggingService.error('FederatedUserId', 'Consistency check failed', { error: error.message });
    }
  }

  private async performUserIdConsistencyCheck(cognitoUser: CognitoUser, mapping: FederatedUserMapping | null): Promise<UserIdConsistencyCheck> {
    const inconsistencies: UserIdConsistencyCheck['inconsistencies'] = [];

    // Check if mapping exists
    if (!mapping) {
      inconsistencies.push({
        type: 'missing_cognito_sub',
        description: 'No user mapping found for Cognito user',
      });
      
      return {
        isConsistent: false,
        cognitoSub: cognitoUser.sub,
        email: cognitoUser.email,
        inconsistencies,
        recommendedAction: 'create_new_mapping',
      };
    }

    // Check Cognito sub consistency
    if (mapping.cognitoSub !== cognitoUser.sub) {
      inconsistencies.push({
        type: 'missing_cognito_sub',
        description: 'Cognito sub mismatch in mapping',
        expectedValue: cognitoUser.sub,
        actualValue: mapping.cognitoSub,
      });
    }

    // Check email consistency
    if (mapping.email !== cognitoUser.email) {
      inconsistencies.push({
        type: 'email_mismatch',
        description: 'Email mismatch between Cognito user and mapping',
        expectedValue: cognitoUser.email,
        actualValue: mapping.email,
      });
    }

    // Check provider consistency
    const cognitoProvider = mapping.federatedIdentities.find(fi => fi.provider === 'Cognito');
    if (!cognitoProvider || cognitoProvider.providerId !== cognitoUser.sub) {
      inconsistencies.push({
        type: 'provider_mismatch',
        description: 'Cognito provider identity missing or incorrect',
        expectedValue: cognitoUser.sub,
        actualValue: cognitoProvider?.providerId,
      });
    }

    // Determine recommended action
    let recommendedAction: UserIdConsistencyCheck['recommendedAction'] = 'no_action';
    
    if (inconsistencies.length > 0) {
      if (inconsistencies.some(i => i.type === 'missing_cognito_sub' || i.type === 'provider_mismatch')) {
        recommendedAction = 'relink_account';
      } else {
        recommendedAction = 'update_mapping';
      }
    }

    return {
      isConsistent: inconsistencies.length === 0,
      cognitoSub: cognitoUser.sub,
      googleId: mapping.googleId,
      email: cognitoUser.email,
      inconsistencies,
      recommendedAction,
    };
  }

  private generateConsistencyHash(cognitoSub: string, googleId?: string, email?: string): string {
    const data = `${cognitoSub}|${googleId || ''}|${email || ''}`;
    // Simple hash function (in production, use a proper crypto hash)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private async persistUserMapping(mapping: FederatedUserMapping): Promise<void> {
    try {
      // Store mapping in secure storage with a key based on Cognito sub
      const mappingKey = `user_mapping_${mapping.cognitoSub}`;
      await secureTokenStorage.storeData(mappingKey, JSON.stringify(mapping));
      
      loggingService.debug('FederatedUserId', 'User mapping persisted', {
        cognitoSub: mapping.cognitoSub,
        mappingKey,
      });

    } catch (error: any) {
      console.error('Error persisting user mapping:', error);
      throw new Error(`Failed to persist user mapping: ${error.message}`);
    }
  }

  private async loadUserMapping(cognitoSub: string): Promise<FederatedUserMapping | null> {
    try {
      const mappingKey = `user_mapping_${cognitoSub}`;
      const mappingData = await secureTokenStorage.retrieveData(mappingKey);
      
      if (mappingData) {
        return JSON.parse(mappingData) as FederatedUserMapping;
      }
      
      return null;

    } catch (error: any) {
      console.error('Error loading user mapping:', error);
      return null;
    }
  }

  private async loadUserMappingByGoogleId(googleId: string): Promise<FederatedUserMapping | null> {
    try {
      // This is a simplified implementation - in production, you'd want a proper index
      // For now, we'll search through stored mappings (not efficient for large datasets)
      
      // Get all stored mapping keys (this would need to be implemented in secureTokenStorage)
      // For this implementation, we'll return null and rely on cache
      return null;

    } catch (error: any) {
      console.error('Error loading user mapping by Google ID:', error);
      return null;
    }
  }

  private notifyMappingEventListeners(event: { type: 'mapping_created' | 'mapping_updated' | 'inconsistency_detected' | 'inconsistency_resolved'; data?: any }): void {
    try {
      this.mappingEventListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in mapping event listener:', error);
        }
      });
    } catch (error) {
      console.error('Error notifying mapping event listeners:', error);
    }
  }
}

export const federatedUserIdService = new FederatedUserIdService();
export type { FederatedUserMapping, UserIdConsistencyCheck, UserIdMappingConfig };