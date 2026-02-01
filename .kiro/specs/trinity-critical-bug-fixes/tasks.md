# Implementation Plan: Trinity Critical Bug Fixes

## Overview

This implementation plan addresses two critical bugs in the Trinity movie voting application: TV shows filtering failure and race conditions in match detection. The plan follows a sequential approach to ensure each component is properly tested before integration.

## Tasks

- [x] 1. Enhanced TMDB Client Implementation
  - Implement strict mediaType validation in EnhancedTMDBClient
  - Add genre validation for target media types
  - **Implement genre ID mapping logic between Movies and TV** (Action 28 → Action&Adventure 10759)
  - Enhance endpoint selection logic with validation
  - _Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 3.5_

- [x] 1.1 Write property test for TMDB endpoint selection
  - **Property 1: TMDB Endpoint Selection Consistency**
  - **Validates: Requirements 1.1, 3.1, 3.2, 3.4**

- [x] 2. Content Filter Service Enhancement
  - Add post-processing content type validation
  - Implement content filtering for mixed responses
  - Add fallback content type preservation
  - _Requirements: 1.3, 1.4, 6.2, 6.4_

- [x] 2.1 Write property test for content type validation
  - **Property 2: Content Type Validation Integrity**
  - **Validates: Requirements 1.3, 1.4, 6.2, 6.4, 7.1, 7.2, 7.4**

- [x] 2.2 Write property test for genre mapping
  - **Property 3: Genre Mapping Correctness**
  - **Validates: Requirements 1.2, 3.5, 7.3**

- [x] 3. GraphQL Schema Update
  - Update AppSync GraphQL schema to support new VoteResponse type
  - Add matchFound and matchInfo fields to vote mutation response
  - Deploy schema changes via CDK infrastructure
  - _Requirements: 2.3, 5.2_

- [x] 4. Checkpoint - Ensure content filtering tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Vote Processing Service Refactoring
  - Implement atomic vote processing with conditional writes
  - Add room status checking with consistent reads
  - Implement graceful match response handling
  - _Requirements: 2.1, 2.2, 2.3, 4.1, 4.2, 4.3_

- [x] 5.1 Write property test for match response structure
  - **Property 4: Match Response Structure Consistency**
  - **Validates: Requirements 2.2, 2.3, 5.2, 5.5**

- [x] 5.2 Write property test for atomic state management
  - **Property 5: Atomic State Management**
  - **Validates: Requirements 4.1, 4.3, 8.2, 8.4, 8.5**

- [x] 5.3 Write property test for concurrent vote processing
  - **Property 6: Concurrent Vote Processing**
  - **Validates: Requirements 2.4, 4.4, 4.5**

- [x] 6. Room Status Management Enhancement
  - Implement consistent room status checking
  - Add atomic match detection logic
  - Enhance error suppression for matched rooms
  - _Requirements: 2.1, 8.1, 5.1, 5.3_

- [x] 6.1 Write property test for room status check priority
  - **Property 7: Room Status Check Priority**
  - **Validates: Requirements 2.1, 8.1**

- [x] 6.2 Write property test for error suppression
  - **Property 8: Error Suppression for Matched Rooms**
  - **Validates: Requirements 5.1, 5.3**

- [x] 7. Cache Service Integration
  - Update cache service to use enhanced TMDB client
  - Add content type validation in cache operations
  - Implement cache consistency checks
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 7.1 Write property test for cache content validation
  - **Property 2: Content Type Validation Integrity** (shared with 2.1)
  - **Validates: Requirements 7.1, 7.2, 7.4**

- [x] 8. Input Validation Enhancement
  - Add strict mediaType validation in room creation
  - Implement session-level content consistency
  - Add fallback content type preservation
  - _Requirements: 6.1, 6.3, 1.5_

- [x] 8.1 Write property test for mediaType validation
  - **Property 9: MediaType Validation**
  - **Validates: Requirements 6.1**

- [x] 8.2 Write property test for session content consistency
  - **Property 10: Content Consistency Throughout Session**
  - **Validates: Requirements 6.3**

- [x] 8.3 Write property test for fallback content preservation
  - **Property 11: Fallback Content Type Preservation**
  - **Validates: Requirements 1.5**

- [x] 9. Match Detection Atomicity
  - Implement atomic match condition verification
  - Add concurrent match detection handling
  - Enhance match state consistency
  - _Requirements: 8.3_

- [x] 9.1 Write property test for match detection atomicity
  - **Property 12: Match Detection Atomicity**
  - **Validates: Requirements 8.3**

- [x] 10. Integration Testing and Validation
  - Test end-to-end TV shows filtering workflow
  - Test concurrent voting scenarios with match detection
  - Validate GraphQL response structures
  - _Requirements: All requirements integration_

- [x] 10.1 Write integration tests for bug scenarios
  - Test the specific bug scenarios reported
  - Validate fixes work in realistic conditions

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive bug fixes
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties with 100+ iterations
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end bug fix scenarios
- Genre mapping logic is critical for TV shows filtering to work correctly
- GraphQL schema updates are required for new vote response structure