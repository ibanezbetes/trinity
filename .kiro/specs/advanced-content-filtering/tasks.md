# Implementation Plan: Advanced Content Filtering

## Overview

Este plan implementa el sistema de filtrado avanzado de contenido mediante una aproximación incremental que extiende la funcionalidad existente. La implementación se enfoca en integrar el nuevo sistema de filtros con la infraestructura actual (GraphQL, DynamoDB, TMDB API) manteniendo compatibilidad completa con salas legacy.

## Tasks

- [x] 1. Set up core interfaces and data models
  - Create TypeScript interfaces for FilterCriteria, ContentPoolEntry, and Genre models
  - Extend existing Room interface with optional filtering fields
  - Define TMDB API client interfaces for discover endpoints
  - _Requirements: 1.2, 2.5, 3.1_

- [x] 2. Implement TMDB API client enhancements
  - [x] 2.1 Create enhanced TMDB client with discover methods
    - Implement discoverMovies() and discoverTV() methods
    - Add support for with_genres parameter formatting (comma and pipe separated)
    - Handle genre list retrieval for movies and TV shows
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 1.4_

  - [x] 2.2 Write property test for API endpoint mapping
    - **Property 7: API Endpoint Mapping**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 2.3 Write property test for genre parameter formatting
    - **Property 8: Genre Parameter Formatting**
    - **Validates: Requirements 4.3, 4.4**

  - [x] 2.4 Write unit tests for TMDB client error handling
    - Test API failures, rate limiting, and network timeouts
    - Test response validation and malformed data handling
    - _Requirements: 4.6_

- [x] 3. Implement Priority Algorithm Engine
  - [x] 3.1 Create PriorityAlgorithm class with three-tier logic
    - Implement Priority 1: All genres matching (AND logic)
    - Implement Priority 2: Any genre matching (OR logic)  
    - Implement Priority 3: Popular content fallback
    - Add randomization within each priority level
    - _Requirements: 3.2, 3.3, 3.4_

  - [x] 3.2 Write property test for priority algorithm correctness
    - **Property 5: Priority Algorithm Correctness**
    - **Validates: Requirements 3.2**

  - [x] 3.3 Write property test for priority level randomization
    - **Property 6: Priority Level Randomization**
    - **Validates: Requirements 3.3**

  - [x] 3.4 Write unit tests for edge cases
    - Test zero genres selected scenario
    - Test insufficient content scenarios
    - _Requirements: 3.4, 3.5_

- [x] 4. Checkpoint - Ensure core algorithm tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Filter Cache Manager
  - [x] 5.1 Create FilterCacheManager with DynamoDB integration
    - Implement cache key generation from FilterCriteria
    - Add cache storage and retrieval methods
    - Implement cache expiration and invalidation logic
    - Add content exclusion tracking per room
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 5.2 Write property test for cache management
    - **Property 13: Cache Management by Filter Criteria**
    - **Validates: Requirements 7.1, 7.2**

  - [x] 5.3 Write property test for content exclusion tracking
    - **Property 14: Content Exclusion Tracking**
    - **Validates: Requirements 7.4**

  - [x] 5.4 Write unit tests for cache edge cases
    - Test cache expiration scenarios
    - Test cache corruption handling
    - _Requirements: 7.3, 7.5_

- [x] 6. Implement Content Filter Service
  - [x] 6.1 Create ContentFilterService orchestration layer
    - Implement createFilteredRoom() method
    - Implement loadContentPool() with exclusion logic
    - Add automatic content replenishment when pool is low
    - Integrate Priority Algorithm and Cache Manager
    - _Requirements: 3.1, 5.1, 5.2, 5.3_

  - [x] 6.2 Write property test for content pool size consistency
    - **Property 4: Content Pool Size Consistency**
    - **Validates: Requirements 3.1, 3.5**

  - [x] 6.3 Write property test for content pool replenishment
    - **Property 10: Content Pool Replenishment**
    - **Validates: Requirements 5.1, 5.2**

  - [x] 6.4 Write property test for filter criteria consistency
    - **Property 11: Filter Criteria Consistency**
    - **Validates: Requirements 5.3**

- [x] 7. Extend GraphQL schema and resolvers
  - [x] 7.1 Add filtering fields to Room type and CreateRoom mutation
    - Extend Room type with filterCriteria and contentPool fields
    - Add FilterCriteria input type to CreateRoom mutation
    - Implement getAvailableGenres query for media types
    - _Requirements: 1.1, 1.2, 2.1, 9.4_

  - [x] 7.2 Write property test for schema compatibility
    - **Property 17: Schema Compatibility**
    - **Validates: Requirements 9.4**

  - [x] 7.3 Implement room creation resolver with filtering
    - Add media type and genre validation logic
    - Integrate ContentFilterService for filtered room creation
    - Maintain backward compatibility with legacy room creation
    - _Requirements: 1.3, 2.2, 2.3, 2.4, 9.1_

  - [x] 7.4 Write property test for room creation validation
    - **Property 2: Room Creation Validation**
    - **Validates: Requirements 1.3, 2.4**

  - [x] 7.5 Write property test for genre selection limits
    - **Property 3: Genre Selection Limits**
    - **Validates: Requirements 2.2, 2.3**

- [x] 8. Checkpoint - Ensure backend integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement UI components for filter selection
  - [x] 9.1 Create MediaTypeSelector component
    - Build React component with MOVIE/TV selection options
    - Add visual indicators and state management
    - Integrate with genre loading on selection
    - _Requirements: 1.1, 1.2, 8.1_

  - [x] 9.2 Write property test for media type selection flow
    - **Property 1: Media Type Selection Flow**
    - **Validates: Requirements 1.2, 1.4**

  - [x] 9.3 Create GenreSelector component
    - Build multi-select component with 3-genre limit
    - Add selection counter and validation feedback
    - Implement disable logic when limit reached
    - _Requirements: 2.1, 2.2, 2.3, 8.2, 8.3_

  - [x] 9.4 Write property test for UI state management
    - **Property 15: UI State Management**
    - **Validates: Requirements 8.2, 8.3**

  - [x] 9.5 Create FilterSummary component
    - Display selected criteria and estimated content count
    - Show applied filters in room interface
    - Add visual feedback during loading operations
    - _Requirements: 8.4, 8.5, 6.4_

- [x] 10. Implement filter immutability and legacy compatibility
  - [x] 10.1 Add filter immutability enforcement
    - Prevent modification of FilterCriteria after room creation
    - Add validation to reject filter change attempts
    - Implement redirect to new room creation for filter changes
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

  - [x] 10.2 Write property test for filter immutability
    - **Property 12: Filter Immutability**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x] 10.3 Ensure legacy room compatibility
    - Maintain original content loading for rooms without FilterCriteria
    - Prevent new filtering logic from affecting existing rooms
    - Handle data structure migration gracefully
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [x] 10.4 Write property test for legacy room compatibility
    - **Property 16: Legacy Room Compatibility**
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 11. Integration and end-to-end wiring
  - [x] 11.1 Wire all components together
    - Connect UI components to GraphQL mutations
    - Integrate ContentFilterService with room creation flow
    - Add error handling and user feedback throughout the flow
    - _Requirements: All requirements integration_

  - [x] 11.2 Write integration tests for complete flow
    - Test end-to-end room creation with filters
    - Test content loading and replenishment scenarios
    - Test error handling and edge cases
    - _Requirements: Complete feature integration_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Critical Bug Fix - getRoom resolver filtering fields
  - [x] 13.1 Fix getRoom resolver to return filtering fields
    - Update room.ts handler to include mediaType, genreIds, genreNames in response
    - Ensure all filtering criteria fields are properly returned to frontend
    - Deploy backend changes to AWS infrastructure
    - _Requirements: All filtering requirements depend on this data flow_

  - [x] 13.2 Fix frontend mediaService to use room filtering data
    - Update mediaService.ts to call getRoom() before filtering content
    - Extract mediaType and genreIds from room data for filtering calls
    - Replace hardcoded empty genre arrays with actual room criteria
    - _Requirements: 3.1, 3.2, 5.3_

  - [x] 13.3 Fix frontend GraphQL query to include filtering fields
    - Update appSyncService.ts getRoom query to include mediaType, genreIds, genreNames
    - Ensure frontend can receive all necessary filtering data from backend
    - _Requirements: 1.2, 2.5, 6.4_

  - [x] 13.4 Verify end-to-end filtering functionality
    - Test complete flow from room creation to content filtering
    - Confirm logs show "Room has filtering" instead of "no filtering criteria"
    - Validate that filtered content is loaded instead of legacy fallback
    - _Requirements: Complete system integration_

## Notes

- Tasks were originally marked with `*` as optional but have been made required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation maintains full backward compatibility with existing rooms