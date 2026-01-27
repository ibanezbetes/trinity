# Implementation Plan: Trinity Authentication System Fixes

## Overview

This implementation plan addresses all authentication issues in Trinity through systematic fixes to AWS Cognito configuration, Google Sign-In integration, session management, and mobile app authentication flows. The plan prioritizes fixing critical configuration issues first, then implementing proper authentication flows, and finally adding comprehensive error handling and security measures.

## Tasks

- [ ] 1. Fix AWS Cognito Configuration Issues
- [x] 1.1 Update Cognito service configuration with correct credentials
  - Fix User Pool ID to use "eu-west-1_6UxioIj4z" in all configuration files
  - Fix App Client ID to use "59dpqsm580j14ulkcha19shl64" in all configuration files
  - Ensure region is consistently set to "eu-west-1" across all services
  - Update backend CognitoService to use correct configuration values
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 1.2 Write property test for Cognito configuration validation
  - **Property 1: Cognito Configuration Validation**
  - **Validates: Requirements 1.2**

- [x] 1.3 Implement configuration validation and error handling
  - Add startup configuration validation in backend CognitoService
  - Implement user-friendly error messages for configuration issues
  - Add configuration health check endpoint
  - _Requirements: 1.3, 1.4_

- [x] 1.4 Write unit tests for configuration error handling
  - Test missing configuration scenarios
  - Test invalid User Pool ID and Client ID formats
  - Test configuration validation error messages
  - _Requirements: 1.4_

- [ ] 2. Fix Google Authentication Integration
- [x] 2.1 Update Google OAuth configuration
  - Fix Google Client ID to use "230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com"
  - Update mobile app configuration (app.json, aws-config.ts)
  - Update backend Google authentication service configuration
  - _Requirements: 2.1_

- [x] 2.2 Implement proper Google token exchange with Cognito
  - Fix Google ID token validation in backend GoogleAuthService
  - Implement proper token exchange for Cognito JWT tokens
  - Update federated authentication flow to use correct Cognito integration
  - _Requirements: 2.2, 2.3_

- [x] 2.3 Write property test for Google authentication token exchange
  - **Property 2: Google Authentication Token Exchange**
  - **Validates: Requirements 2.3**

- [x] 2.4 Fix Google authentication error handling
  - Implement specific error messages for different Google auth failure types
  - Add fallback options for Google authentication failures
  - Update mobile app to handle Google auth errors gracefully
  - _Requirements: 2.4_

- [x] 2.5 Write property test for Google authentication error handling
  - **Property 5: Google Authentication Error Handling**
  - **Validates: Requirements 2.4, 7.2**

- [x] 2.6 Implement Google account linking for existing users
  - Fix account linking logic to handle existing Google accounts properly
  - Add automatic sign-in for previously linked Google accounts
  - Update user profile synchronization from Google data
  - _Requirements: 2.5_

- [x] 2.7 Write property test for federated user creation
  - **Property 3: Federated User Creation**
  - **Validates: Requirements 2.2, 6.1, 6.2**

- [ ] 3. Fix Backend Authentication Service
- [x] 3.1 Fix JWT token validation in AuthService
  - Update JWT validation to use correct Cognito User Pool configuration
  - Fix token validation middleware to properly validate against User Pool
  - Implement proper user context extraction from JWT tokens
  - _Requirements: 3.1, 3.4, 3.5_

- [x] 3.2 Write property test for JWT token validation
  - **Property 6: JWT Token Validation**
  - **Validates: Requirements 3.1**

- [x] 3.3 Implement automatic token refresh in backend
  - Add automatic token refresh logic for expired access tokens
  - Implement proper refresh token validation and exchange
  - Update authentication middleware to handle token refresh
  - _Requirements: 3.2_

- [x] 3.4 Write property test for automatic token refresh
  - **Property 7: Automatic Token Refresh**
  - **Validates: Requirements 3.2, 4.4**

- [x] 3.5 Fix authentication status code handling
  - Ensure proper HTTP status codes (401/403) for authentication failures
  - Update error responses to include appropriate status codes
  - Fix permission validation to return correct status codes
  - _Requirements: 3.3_

- [x] 3.6 Write property test for authentication status codes
  - **Property 8: Authentication Status Codes**
  - **Validates: Requirements 3.3**

- [x] 3.7 Fix user context injection in requests
  - Update authentication middleware to properly attach user context
  - Fix user permission validation from Cognito attributes
  - Ensure all authenticated requests have proper user context
  - _Requirements: 3.4, 3.5_

- [x] 3.8 Write property test for user context injection
  - **Property 9: User Context Injection**
  - **Validates: Requirements 3.5**

- [x] 4. Checkpoint - Ensure backend authentication tests pass
- Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Fix Mobile App Authentication Flow
- [x] 5.1 Fix mobile authentication context and state management
  - Update AuthContext to properly manage authentication state
  - Fix session restoration on app startup using stored tokens
  - Implement proper authentication state broadcasting to all components
  - Add periodic token refresh checks and automatic logout on expiration
  - Enhance network resilience and error handling for auth operations
  - _Requirements: 4.1, 8.1_

- [x] 5.2 Write property test for mobile session restoration
  - **Property 10: Mobile Session Restoration**
  - **Validates: Requirements 4.1, 5.2**

- [x] 5.3 Implement dual authentication flow support
  - Fix email/password authentication flow in mobile app
  - Fix Google Sign-In flow integration with Cognito
  - Ensure both authentication methods work seamlessly
  - Create comprehensive dual authentication flow service
  - Update authentication context to use dual flow service
  - Add automatic authentication with fallback support
  - _Requirements: 4.2_

- [x] 5.4 Write property test for dual authentication flow support
  - **Property 11: Dual Authentication Flow Support**
  - **Validates: Requirements 4.2**

- [x] 5.5 Fix secure token storage in mobile app
  - Update token storage to use device keychain/keystore properly
  - Fix token retrieval and validation on app startup
  - Implement proper token cleanup on sign out
  - Create comprehensive secure storage service with fallback mechanisms
  - Add encryption for non-keychain storage methods
  - Implement storage metadata and diagnostics
  - _Requirements: 4.3, 4.5, 5.1_

- [x] 5.6 Write property test for secure token storage
  - **Property 12: Secure Token Storage**
  - **Validates: Requirements 4.3, 5.1, 10.1**

- [x] 5.7 Implement automatic background token refresh
  - Add background token refresh logic in mobile app
  - Implement token refresh without user intervention
  - Update all services with new tokens after refresh
  - Create comprehensive background refresh service with retry logic
  - Integrate with authentication context for seamless token updates
  - Add app state monitoring for foreground refresh checks
  - _Requirements: 4.4, 8.2_

- [x] 5.8 Write property test for service credential updates
  - **Property 23: Service Credential Updates**
  - **Validates: Requirements 8.2**

- [ ] 6. Fix Session Management and Persistence
- [x] 6.1 Implement proper session cleanup on sign out
  - Fix sign out to clear all stored authentication data
  - Implement token revocation with Cognito
  - Ensure all app components are notified of sign out
  - Create comprehensive session cleanup service
  - Add emergency cleanup for failed sign out scenarios
  - Implement cleanup listeners and component notification
  - _Requirements: 4.5, 8.3_

- [x] 6.2 Write property test for session cleanup on sign out
  - **Property 13: Session Cleanup on Sign Out**
  - **Validates: Requirements 4.5**

- [x] 6.3 Write property test for sign out state propagation
  - **Property 24: Sign Out State Propagation**
  - **Validates: Requirements 8.3**

- [x] 6.4 Fix session expiration handling
  - Implement proper session expiration detection
  - Add clear re-authentication prompts for expired sessions
  - Update session validation logic
  - _Requirements: 5.3_

- [x] 6.5 Write property test for session expiration handling
  - **Property 14: Session Expiration Handling**
  - **Validates: Requirements 5.3**

- [x] 6.6 Implement network resilience for authentication
  - Add authentication state sync when network connectivity is restored
  - Implement offline authentication state management
  - Add retry logic for failed authentication operations
  - _Requirements: 5.5, 7.4_

- [x] 6.7 Write property test for network resilience authentication sync
  - **Property 15: Network Resilience Authentication Sync**
  - **Validates: Requirements 5.5**

- [ ] 7. Fix Federated User Management
- [x] 7.1 Implement proper Google profile synchronization
  - Fix Google profile data mapping to Cognito user attributes
  - Implement automatic profile sync when Google data changes
  - Add conflict resolution for user data discrepancies
  - _Requirements: 6.2, 6.3, 6.5_

- [x] 7.2 Write property test for Google profile synchronization
  - **Property 16: Google Profile Synchronization**
  - **Validates: Requirements 6.3**

- [x] 7.3 Fix federated user ID consistency
  - Ensure consistent user IDs across all federated sessions
  - Fix user ID mapping between Google and Cognito
  - Update user profile management for federated users
  - _Requirements: 6.4_

- [x] 7.4 Write property test for federated user ID consistency
  - **Property 17: Federated User ID Consistency**
  - **Validates: Requirements 6.4**

- [x] 7.5 Implement user data conflict resolution
  - Add logic to resolve conflicts between Google and Cognito user data
  - Implement authoritative source determination for user data
  - Update conflict resolution to use most recent data
  - _Requirements: 6.5_
  - _Note: Implemented as part of Google Profile Sync Service with configurable resolution strategies_

- [x] 7.6 Write property test for user data conflict resolution
  - **Property 18: User Data Conflict Resolution**
  - **Validates: Requirements 6.5**
  - _Note: Covered in Google Profile Synchronization property tests_

- [ ] 8. Implement Comprehensive Error Handling
- [x] 8.1 Fix Cognito error message translation
  - Implement user-friendly error message translation for all Cognito error codes
  - Update error handling to provide specific guidance for each error type
  - Add proper error logging while showing simple messages to users
  - _Requirements: 7.1, 7.5_

- [x] 8.2 Write property test for authentication error translation
  - **Property 4: Authentication Error Translation**
  - **Validates: Requirements 1.4, 7.1**

- [x] 8.3 Implement network error classification and handling
  - Add logic to distinguish between connectivity and service issues
  - Implement proper retry mechanisms with exponential backoff
  - Update error messages to provide appropriate guidance
  - _Requirements: 7.3, 7.4_

- [x] 8.4 Write property test for network error classification
  - **Property 19: Network Error Classification**
  - **Validates: Requirements 7.3**

- [x] 8.5 Write property test for authentication timeout retry
  - **Property 20: Authentication Timeout Retry**
  - **Validates: Requirements 7.4**

- [x] 8.6 Implement dual error logging system
  - Add detailed error logging for debugging purposes
  - Ensure sensitive data (passwords, tokens) is never logged in plain text
  - Implement user-friendly error messages separate from debug logs
  - _Requirements: 7.5, 10.3_

- [x] 8.7 Write property test for dual error logging
  - **Property 21: Dual Error Logging**
  - **Validates: Requirements 7.5**

- [ ] 9. Fix Authentication State Synchronization
- [x] 9.1 Implement authentication state broadcasting
  - Fix authentication state changes to broadcast to all app components
  - Update state management to ensure consistency across components
  - Add proper event handling for authentication state changes
  - _Requirements: 8.1_

- [x] 9.2 Write property test for authentication state broadcasting
  - **Property 22: Authentication State Broadcasting**
  - **Validates: Requirements 8.1**

- [x] 9.3 Fix coordinated error handling across services
  - Implement coordinated error handling for authentication errors
  - Ensure all services handle authentication errors consistently
  - Add proper error propagation and recovery mechanisms
  - _Requirements: 8.4_

- [x] 9.4 Write property test for coordinated error handling
  - **Property 25: Coordinated Error Handling**
  - **Validates: Requirements 8.4**

- [x] 9.5 Implement concurrency control for authentication operations
  - Add protection against race conditions in authentication operations
  - Implement proper locking for simultaneous authentication attempts
  - Fix state conflicts in concurrent authentication scenarios
  - _Requirements: 8.5_

- [x] 9.6 Write property test for concurrency control
  - **Property 26: Concurrency Control**
  - **Validates: Requirements 8.5**

- [ ] 10. Validate Test User Authentication
- [x] 10.1 Test authentication with provided test credentials
  - Verify authentication works with test user "paco@paco.com" and password "Contraseña!26"
  - Test session creation and token generation for test user
  - Verify test user can access protected resources
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 10.2 Write unit tests for test user authentication flows
  - Test successful authentication with test credentials
  - Test session token creation for test user
  - Test protected resource access for test user
  - Test sign out cleanup for test user
  - Test debug logging for test authentication flows
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 11. Implement Security Best Practices
- [x] 11.1 Ensure secure data transmission
  - Verify all authentication data is transmitted over HTTPS
  - Implement proper encryption for sensitive authentication data
  - Add certificate validation for secure connections
  - _Requirements: 10.2_

- [x] 11.2 Write property test for secure data transmission
  - **Property 27: Secure Data Transmission**
  - **Validates: Requirements 10.2**

- [x] 11.3 Implement sensitive data protection
  - Ensure passwords and tokens are never logged in plain text
  - Add data sanitization for all authentication logs
  - Implement proper secret management for configuration
  - _Requirements: 10.3_

- [x] 11.4 Write property test for sensitive data protection
  - **Property 28: Sensitive Data Protection**
  - **Validates: Requirements 10.3**

- [x] 11.5 Implement session timeout policies
  - Add proper session timeout configuration and enforcement
  - Implement automatic session cleanup for expired sessions
  - Add session timeout warnings for users
  - _Requirements: 10.4_

- [x] 11.6 Write property test for session timeout policy
  - **Property 29: Session Timeout Policy**
  - **Validates: Requirements 10.4**

- [x] 11.7 Implement security monitoring
  - Add detection for suspicious authentication activity
  - Implement appropriate security measures for detected threats
  - Add logging and alerting for security events
  - _Requirements: 10.5_

- [x] 11.8 Write property test for security monitoring
  - **Property 30: Security Monitoring**
  - **Validates: Requirements 10.5**

- [ ] 12. Integration and Final Testing
- [x] 12.1 Update authentication integration tests
  - Create end-to-end tests for complete authentication flows
  - Test integration between mobile app and backend authentication
  - Verify Google Sign-In integration works end-to-end
  - _Requirements: All requirements_

- [x] 12.2 Update mobile app authentication UI
  - Fix authentication screens to handle new error messages
  - Update loading states and user feedback for authentication flows
  - Ensure consistent user experience across authentication methods
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 12.3 Update backend API documentation
  - Document authentication endpoints and error responses
  - Update API documentation with new authentication requirements
  - Add examples for authentication flows and error handling
  - _Requirements: All requirements_

- [x] 13. Final checkpoint - Ensure all authentication tests pass
- Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation prioritizes fixing critical configuration issues first
- Authentication flows and error handling can be implemented in parallel after configuration fixes
- Security measures build upon the fixed authentication system
- All tests are required for comprehensive authentication reliability