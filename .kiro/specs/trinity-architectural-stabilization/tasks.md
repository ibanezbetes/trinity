# Implementation Plan: Trinity Architectural Stabilization

## Overview

This implementation plan transforms Trinity from its current chaotic state with duplicate code locations, broken CDK pipeline, and manual console fixes into a clean, maintainable architecture with a single source of truth and working deployment process. The approach prioritizes safety through comprehensive backups, destructive AWS cleanup for a fresh start, systematic code consolidation, and thorough testing at each phase.

## Tasks

- [x] 1. Pre-Migration Backup and Assessment
  - Create complete backup of all existing Lambda function code from AWS Console
  - Document current AWS resource inventory (Lambdas, DynamoDB tables, APIs, CloudFormation stacks)
  - Backup existing `.env` configuration and CDK settings
  - _Requirements: 8.1, 4.1_

- [x] 2. Destructive AWS Resource Cleanup
  - [x] 2.1 Create AWS resource cleanup script
    - Write TypeScript script to scan eu-west-1 region for all Trinity resources
    - Implement CloudFormation stack deletion for non-CDK stacks
    - Implement Lambda function deletion for all existing functions
    - _Requirements: 4.2, 4.5_
  
  - [x] 2.2 Execute complete AWS cleanup
    - Delete all existing DynamoDB tables not in documented 12-table list
    - Remove all API Gateway instances and orphaned APIs
    - Clean up IAM roles, policies, and S3 buckets from previous deployments
    - _Requirements: 4.2, 4.5_
  
  - [x] 2.3 Verify clean AWS state
    - Confirm zero Lambda functions exist in eu-west-1
    - Confirm zero DynamoDB tables exist in eu-west-1
    - Confirm zero API Gateway instances exist
    - _Requirements: 4.5_

- [x] 3. Code Consolidation and Migration
  - [x] 3.1 Extract critical logic from MONOLITH files
    - Extract EnhancedTMDBClient from MONOLITH-TRINITY-CACHE-FINAL.js
    - Extract ContentFilterService with western-only language filtering (en,es,fr,it,de,pt)
    - Extract genre mapping and business logic validation
    - _Requirements: 1.4, 3.1, 3.5_
  
  - [x] 3.2 Create unified TypeScript handlers in infrastructure/clean/src/handlers/
    - Migrate trinity-cache-dev logic to cache-handler.ts
    - Migrate trinity-room-dev logic to room-handler.ts  
    - Migrate trinity-vote-dev logic to vote-handler.ts
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 3.3 Implement shared services in infrastructure/clean/src/shared/
    - Create EnhancedTMDBClient with western-only language support
    - Create ContentFilterService with business logic validation
    - Create DynamoDBService for consistent database operations
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  
  - [x] 3.4 Write property test for code consolidation
    - **Property 1: Single Source of Truth Enforcement**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5**
  
  - [x] 3.5 Write property test for functionality preservation
    - **Property 2: Functionality Preservation During Migration**
    - **Validates: Requirements 1.4, 3.5**

- [x] 4. CDK Pipeline Repair and Dependency Management
  - [x] 4.1 Fix CDK build configuration
    - Update package.json to include node-fetch, axios, uuid dependencies
    - Configure esbuild bundling for Lambda deployment packages
    - Set up TypeScript compilation pipeline for handlers
    - _Requirements: 2.1, 2.3, 5.1, 5.5_
  
  - [x] 4.2 Implement environment variable injection
    - Configure CDK to read from root .env file
    - Set up environment variable propagation to all Lambda functions
    - Validate required environment variables before deployment
    - _Requirements: 6.1, 6.2, 6.4, 6.5_
  
  - [x] 4.3 Write property test for CDK build process
    - **Property 3: Successful CDK Build and Deployment**
    - **Validates: Requirements 2.1, 2.3, 2.4, 5.1, 5.5**
  
  - [x] 4.4 Write property test for dependency bundling
    - **Property 9: Dependency and Runtime Consistency**
    - **Validates: Requirements 5.3, 5.4**

- [x] 5. Checkpoint - Validate Build System
  - Ensure CDK build completes without errors, ask the user if questions arise.

- [x] 6. Deploy and Test Core Lambda Functions
  - [x] 6.1 Deploy authentication and room management functions
    - Deploy trinity-auth-dev and trinity-room-dev handlers
    - Verify functions are operational with correct Node.js 18.x runtime
    - Test basic functionality with sample payloads
    - _Requirements: 2.4, 2.5, 5.4_
  
  - [x] 6.2 Deploy movie and caching functions
    - Deploy trinity-movie-dev and trinity-cache-dev handlers
    - Verify TMDB API integration with western-only language filtering
    - Test 50-movie caching system with genre prioritization
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [x] 6.3 Deploy voting and real-time functions
    - Deploy trinity-vote-dev, trinity-matchmaker-dev, and trinity-realtime-dev handlers
    - Test individual voting system and match detection logic
    - Verify WebSocket functionality for real-time notifications
    - _Requirements: 3.4, 2.5_
  
  - [x] 6.4 Write property test for post-deployment validation
    - **Property 4: Post-Deployment Function Validation**
    - **Validates: Requirements 2.5, 7.5**

- [x] 7. Business Logic Validation and Testing
  - [x] 7.1 Test TMDB integration with corrected language filtering
    - Verify western-only language filtering (en,es,fr,it,de,pt) excludes Asian content
    - Test genre mapping between Movie and TV endpoints
    - Validate vote count minimums and adult content exclusion
    - _Requirements: 3.1, 3.3_
  
  - [x] 7.2 Test movie caching system integrity
    - Verify exactly 50 movies returned when available, graceful shortage handling when not
    - Test genre prioritization logic (both genres > either genre)
    - Ensure no mixing of Movie/TV types within single cache
    - _Requirements: 3.2_
  
  - [x] 7.3 Test voting and match detection system
    - Verify individual voting functionality across all 7 Lambda functions
    - Test match detection based on room capacity requirements
    - Validate voting state consistency and error handling
    - _Requirements: 3.4_
  
  - [x] 7.4 Write property test for western languages preservation
    - **Property 5: Western Languages Preservation**
    - **Validates: Requirements 3.1**
  
  - [x] 7.5 Write property test for caching system integrity
    - **Property 6: Movie Caching System Integrity**
    - **Validates: Requirements 3.2, 3.3**
  
  - [x] 7.6 Write property test for voting system functionality
    - **Property 7: Voting System Functionality**
    - **Validates: Requirements 3.4**

- [x] 8. Configuration and Resource Management
  - [x] 8.1 Validate configuration management
    - Confirm all configuration exists only in root .env file
    - Test environment variable propagation to deployed functions
    - Verify preservation of TMDB API keys and AWS credentials
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 8.2 Verify resource management compliance
    - Confirm exactly 7 Lambda functions, 12 DynamoDB tables, 2 GraphQL APIs deployed
    - Validate all resources are managed by CDK infrastructure as code
    - Ensure no zombie resources remain outside CDK management
    - _Requirements: 4.3, 4.4_
  
  - [x] 8.3 Write property test for configuration management
    - **Property 10: Configuration Management Integrity**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
  
  - [x] 8.4 Write property test for resource management
    - **Property 8: Comprehensive Resource Management**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

- [x] 9. End-to-End System Validation
  - [x] 9.1 Execute comprehensive functionality tests
    - Run existing end-to-end test suite against stabilized system
    - Test complete user flow: room creation, movie caching, voting, match detection
    - Verify real-time notifications and WebSocket functionality
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [x] 9.2 Performance and reliability validation
    - Test TMDB API rate limiting and error handling
    - Validate DynamoDB operations and TTL functionality
    - Confirm Lambda function cold start performance
    - _Requirements: 7.5_
  
  - [x] 9.3 Write property test for comprehensive functionality
    - **Property 12: Comprehensive Functionality Testing**
    - **Validates: Requirements 7.2, 7.3, 7.4**

- [x] 10. Final Cleanup and Documentation
  - [x] 10.1 Remove duplicate code locations
    - Delete obsolete code in lambdas/ directory
    - Remove legacy handlers in infrastructure/src/
    - Clean up MONOLITH-*-FINAL.js files after successful migration
    - _Requirements: 1.3_
  
  - [x] 10.2 Update deployment documentation
    - Update README.md with new CDK deployment procedures
    - Document the single source of truth architecture
    - Create rollback procedures documentation
    - _Requirements: 8.4_
  
  - [x] 10.3 Validate rollback procedures
    - Test rollback capability using backup locations
    - Verify rollback procedures are clear and accessible
    - Document recovery steps for common failure scenarios
    - _Requirements: 8.2, 8.4_

- [x] 11. Final Checkpoint - Complete System Validation
  - Ensure all tests pass, all 7 Lambda functions operational, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive stabilization with full validation
- Each task references specific requirements for traceability
- Destructive AWS cleanup ensures completely fresh start with no conflicts
- Western-only language filtering (en,es,fr,it,de,pt) excludes Asian content
- Graceful handling of fewer than 50 movies when western-only filtering limits results
- Property tests validate universal correctness properties with 100+ iterations
- Unit tests validate specific scenarios and edge cases
- Checkpoints ensure incremental validation and safe progression