/**
 * Services Index
 * Central export point for all services to ensure proper module resolution
 * FIXED: Explicit file references for EAS Build compatibility
 */

// Core Services (no dependencies between them) - EXPLICIT EXPORTS
export * from './secureTokenStorage';
export * from './loggingService';
export * from './networkService';

// Authentication Services (may depend on core services)
export * from './cognitoAuthService';
export * from './migrationService';

// Advanced Services (depend on auth services)
export * from './dualAuthFlowService';
export * from './sessionExpirationService';

// Background Services (depend on everything else) - EXPORT LAST
export * from './backgroundTokenRefreshService';

// Re-export specific instances for direct import - EXPLICIT REFERENCES
export { secureTokenStorage } from './secureTokenStorage';
export { loggingService } from './loggingService';
export { networkService } from './networkService';
export { cognitoAuthService } from './cognitoAuthService';
export { migrationService } from './migrationService';
export { dualAuthFlowService } from './dualAuthFlowService';
export { sessionExpirationService } from './sessionExpirationService';
export { backgroundTokenRefreshService } from './backgroundTokenRefreshService';

// Re-export types that are needed
export type { CognitoUser, CognitoTokens } from './cognitoAuthService';
export type { AuthenticationResult } from './dualAuthFlowService';
export type { TokenRefreshResult } from './backgroundTokenRefreshService';
export type { ExpirationEvent } from './sessionExpirationService';