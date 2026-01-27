import { Injectable } from '@nestjs/common';
import { 
  GraphQLOperation, 
  RestEndpoint, 
  ServiceMapping, 
  ClientImpactAnalysis,
  ApiEvolutionPlan,
  ApiEvolutionPhase,
  CompatibilityLevel
} from '../entities/api-compatibility.entity';

/**
 * Mobile API Mapper Service
 * 
 * Maps existing mobile app API calls to new backend services.
 * Analyzes the current Trinity mobile app API structure and provides
 * detailed mapping to the new clean architecture backend.
 * 
 * **Validates: Requirements 4.1**
 */
@Injectable()
export class MobileApiMapperService {
  
  /**
   * Extract API structure from mobile app analysis
   */
  extractMobileApiStructure(): {
    graphqlOperations: GraphQLOperation[];
    restEndpoints: RestEndpoint[];
    subscriptions: GraphQLOperation[];
  } {
    
    // Based on analysis of mobile/src/services/appSyncService.ts
    const graphqlOperations: GraphQLOperation[] = [
      // Room Management Operations
      {
        name: 'getUserRooms',
        type: 'query',
        parameters: {},
        responseFields: ['id', 'name', 'description', 'isActive', 'memberCount', 'matchCount', 'createdAt', 'updatedAt'],
        deprecated: false
      },
      {
        name: 'createRoom',
        type: 'mutation',
        parameters: {
          input: {
            name: 'string',
            description: 'string?',
            isPrivate: 'boolean?',
            maxMembers: 'number?',
            genrePreferences: 'string[]?' // This field is problematic in current schema
          }
        },
        responseFields: ['id', 'name', 'description', 'status', 'hostId', 'inviteCode', 'isActive', 'isPrivate', 'memberCount', 'maxMembers', 'createdAt', 'updatedAt'],
        deprecated: false
      },
      {
        name: 'createRoomDebug',
        type: 'mutation',
        parameters: {
          input: {
            name: 'string'
          }
        },
        responseFields: ['id', 'name', 'description', 'isActive', 'isPrivate', 'memberCount', 'createdAt'],
        deprecated: true // Debug operation should be removed
      },
      {
        name: 'createRoomSimple',
        type: 'mutation',
        parameters: {
          name: 'string'
        },
        responseFields: ['id', 'name', 'description', 'isActive', 'isPrivate', 'memberCount', 'inviteCode', 'hostId', 'status', 'createdAt'],
        deprecated: true // Simplified operation should be consolidated
      },
      {
        name: 'joinRoomByInvite',
        type: 'mutation',
        parameters: {
          inviteCode: 'string'
        },
        responseFields: ['id', 'name', 'description', 'status', 'hostId', 'inviteCode', 'isActive', 'isPrivate', 'memberCount', 'maxMembers', 'createdAt', 'updatedAt'],
        deprecated: false
      },
      {
        name: 'getRoom',
        type: 'query',
        parameters: {
          roomId: 'ID'
        },
        responseFields: ['id', 'name', 'description', 'status', 'resultMovieId', 'hostId', 'inviteCode', 'isActive', 'isPrivate', 'memberCount', 'maxMembers', 'matchCount', 'createdAt', 'updatedAt'],
        deprecated: false
      },
      
      // Voting Operations
      {
        name: 'vote',
        type: 'mutation',
        parameters: {
          input: {
            roomId: 'ID',
            movieId: 'ID',
            voteType: 'VoteType' // Currently hardcoded to 'LIKE'
          }
        },
        responseFields: ['id', 'name', 'description', 'status', 'resultMovieId', 'hostId', 'inviteCode', 'isActive', 'isPrivate', 'memberCount', 'maxMembers', 'matchCount', 'createdAt', 'updatedAt'],
        deprecated: false
      },
      
      // Movie Operations
      {
        name: 'getMovieDetails',
        type: 'query',
        parameters: {
          movieId: 'string'
        },
        responseFields: ['id', 'title', 'overview', 'poster', 'vote_average', 'release_date', 'genres', 'runtime'],
        deprecated: false
      },
      {
        name: 'getMovies',
        type: 'query',
        parameters: {
          genre: 'string?'
        },
        responseFields: ['id', 'title', 'overview', 'poster', 'vote_average', 'release_date'],
        deprecated: false
      },
      {
        name: 'getAllMovies',
        type: 'query',
        parameters: {},
        responseFields: ['id', 'title', 'overview', 'poster', 'vote_average', 'release_date'],
        deprecated: true // Should use paginated getMovies instead
      },
      
      // AI Operations
      {
        name: 'getChatRecommendations',
        type: 'query',
        parameters: {
          text: 'string'
        },
        responseFields: ['chatResponse', 'recommendedGenres', 'confidence', 'reasoning', 'genreAlignment', 'fallbackUsed'],
        deprecated: false
      },
      
      // Health Check
      {
        name: 'healthCheck',
        type: 'query',
        parameters: {},
        responseFields: ['status', 'timestamp'],
        deprecated: false
      }
    ];
    
    // Real-time Subscriptions (from schema analysis)
    const subscriptions: GraphQLOperation[] = [
      {
        name: 'onRoomEvent',
        type: 'subscription',
        parameters: { roomId: 'ID' },
        responseFields: ['id', 'timestamp', 'roomId', 'eventType', 'data'],
        deprecated: false
      },
      {
        name: 'onVoteUpdate',
        type: 'subscription',
        parameters: { roomId: 'ID' },
        responseFields: ['id', 'timestamp', 'roomId', 'eventType', 'userId', 'mediaId', 'voteType', 'progress'],
        deprecated: false
      },
      {
        name: 'onMatchFound',
        type: 'subscription',
        parameters: { roomId: 'ID' },
        responseFields: ['id', 'timestamp', 'roomId', 'eventType', 'matchId', 'mediaId', 'mediaTitle', 'participants', 'consensusType'],
        deprecated: false
      },
      {
        name: 'onMemberUpdate',
        type: 'subscription',
        parameters: { roomId: 'ID' },
        responseFields: ['id', 'timestamp', 'roomId', 'eventType', 'userId', 'action', 'memberCount', 'memberData'],
        deprecated: false
      },
      
      // Enhanced Subscriptions (available but not used by mobile app yet)
      {
        name: 'onVoteUpdateEnhanced',
        type: 'subscription',
        parameters: { roomId: 'ID' },
        responseFields: ['id', 'timestamp', 'roomId', 'eventType', 'progress', 'movieInfo', 'votingDuration'],
        deprecated: false,
        enhancedVersion: 'onVoteUpdate'
      },
      {
        name: 'onMatchFoundEnhanced',
        type: 'subscription',
        parameters: { roomId: 'ID' },
        responseFields: ['id', 'timestamp', 'roomId', 'eventType', 'matchId', 'movieInfo', 'participants', 'votingDuration', 'consensusType'],
        deprecated: false,
        enhancedVersion: 'onMatchFound'
      },
      {
        name: 'onConnectionStatusChange',
        type: 'subscription',
        parameters: { roomId: 'ID' },
        responseFields: ['id', 'timestamp', 'roomId', 'eventType', 'userId', 'connectionStatus', 'reconnectionAttempts', 'lastSeenAt', 'userAgent'],
        deprecated: false
      },
      {
        name: 'onRoomStateSync',
        type: 'subscription',
        parameters: { roomId: 'ID' },
        responseFields: ['id', 'timestamp', 'roomId', 'eventType', 'roomState', 'syncReason'],
        deprecated: false
      }
    ];
    
    // REST Endpoints (from apiClient.ts analysis - fallback endpoints)
    const restEndpoints: RestEndpoint[] = [
      {
        path: '/api/rooms',
        method: 'GET',
        parameters: {},
        responseFormat: { rooms: 'Room[]' },
        deprecated: true,
        replacementGraphQL: 'getUserRooms'
      },
      {
        path: '/api/rooms',
        method: 'POST',
        parameters: { name: 'string', description: 'string?' },
        responseFormat: { room: 'Room' },
        deprecated: true,
        replacementGraphQL: 'createRoom'
      },
      {
        path: '/api/rooms/:id/join',
        method: 'POST',
        parameters: { inviteCode: 'string' },
        responseFormat: { room: 'Room' },
        deprecated: true,
        replacementGraphQL: 'joinRoomByInvite'
      },
      {
        path: '/api/rooms/:id/vote',
        method: 'POST',
        parameters: { movieId: 'string', voteType: 'string' },
        responseFormat: { room: 'Room' },
        deprecated: true,
        replacementGraphQL: 'vote'
      },
      {
        path: '/api/movies',
        method: 'GET',
        parameters: { genre: 'string?', page: 'number?' },
        responseFormat: { movies: 'Movie[]' },
        deprecated: true,
        replacementGraphQL: 'getMovies'
      }
    ];
    
    return {
      graphqlOperations,
      restEndpoints,
      subscriptions
    };
  }
  
  /**
   * Map existing operations to new backend services
   */
  mapToNewBackendServices(): ServiceMapping[] {
    return [
      // Room Management Service Mappings
      {
        legacyEndpoint: 'getUserRooms',
        newService: 'RoomService',
        newMethod: 'getUserRooms',
        compatibilityLevel: CompatibilityLevel.FULLY_COMPATIBLE,
        migrationComplexity: 'simple',
        dataTransformationRequired: false,
        authenticationChanges: false
      },
      {
        legacyEndpoint: 'createRoom',
        newService: 'RoomService',
        newMethod: 'createRoom',
        compatibilityLevel: CompatibilityLevel.REQUIRES_ADAPTATION,
        migrationComplexity: 'moderate',
        dataTransformationRequired: true, // Remove genrePreferences field
        authenticationChanges: false
      },
      {
        legacyEndpoint: 'createRoomDebug',
        newService: 'RoomService',
        newMethod: 'createRoom',
        compatibilityLevel: CompatibilityLevel.DEPRECATED,
        migrationComplexity: 'simple',
        dataTransformationRequired: true,
        authenticationChanges: false
      },
      {
        legacyEndpoint: 'createRoomSimple',
        newService: 'RoomService',
        newMethod: 'createRoom',
        compatibilityLevel: CompatibilityLevel.DEPRECATED,
        migrationComplexity: 'simple',
        dataTransformationRequired: true,
        authenticationChanges: false
      },
      {
        legacyEndpoint: 'joinRoomByInvite',
        newService: 'RoomService',
        newMethod: 'joinRoom',
        compatibilityLevel: CompatibilityLevel.FULLY_COMPATIBLE,
        migrationComplexity: 'simple',
        dataTransformationRequired: false,
        authenticationChanges: false
      },
      {
        legacyEndpoint: 'getRoom',
        newService: 'RoomService',
        newMethod: 'getRoomById',
        compatibilityLevel: CompatibilityLevel.FULLY_COMPATIBLE,
        migrationComplexity: 'simple',
        dataTransformationRequired: false,
        authenticationChanges: false
      },
      
      // Voting Service Mappings
      {
        legacyEndpoint: 'vote',
        newService: 'VotingService',
        newMethod: 'castVote',
        compatibilityLevel: CompatibilityLevel.FULLY_COMPATIBLE,
        migrationComplexity: 'simple',
        dataTransformationRequired: false,
        authenticationChanges: false
      },
      
      // Media Service Mappings
      {
        legacyEndpoint: 'getMovieDetails',
        newService: 'MediaService',
        newMethod: 'getMovieById',
        compatibilityLevel: CompatibilityLevel.FULLY_COMPATIBLE,
        migrationComplexity: 'simple',
        dataTransformationRequired: false,
        authenticationChanges: false
      },
      {
        legacyEndpoint: 'getMovies',
        newService: 'MediaService',
        newMethod: 'getMovies',
        compatibilityLevel: CompatibilityLevel.REQUIRES_ADAPTATION,
        migrationComplexity: 'moderate',
        dataTransformationRequired: true, // Add pagination support
        authenticationChanges: false
      },
      {
        legacyEndpoint: 'getAllMovies',
        newService: 'MediaService',
        newMethod: 'getMovies',
        compatibilityLevel: CompatibilityLevel.DEPRECATED,
        migrationComplexity: 'simple',
        dataTransformationRequired: true,
        authenticationChanges: false
      },
      
      // AI Service Mappings
      {
        legacyEndpoint: 'getChatRecommendations',
        newService: 'AIService',
        newMethod: 'getRecommendations',
        compatibilityLevel: CompatibilityLevel.REQUIRES_ADAPTATION,
        migrationComplexity: 'moderate',
        dataTransformationRequired: true, // Enhanced response format
        authenticationChanges: false
      },
      
      // WebSocket Service Mappings
      {
        legacyEndpoint: 'onVoteUpdate',
        newService: 'WebSocketService',
        newMethod: 'subscribeToVoteUpdates',
        compatibilityLevel: CompatibilityLevel.FULLY_COMPATIBLE,
        migrationComplexity: 'simple',
        dataTransformationRequired: false,
        authenticationChanges: false
      },
      {
        legacyEndpoint: 'onMatchFound',
        newService: 'WebSocketService',
        newMethod: 'subscribeToMatchEvents',
        compatibilityLevel: CompatibilityLevel.FULLY_COMPATIBLE,
        migrationComplexity: 'simple',
        dataTransformationRequired: false,
        authenticationChanges: false
      },
      {
        legacyEndpoint: 'onRoomEvent',
        newService: 'WebSocketService',
        newMethod: 'subscribeToRoomEvents',
        compatibilityLevel: CompatibilityLevel.FULLY_COMPATIBLE,
        migrationComplexity: 'simple',
        dataTransformationRequired: false,
        authenticationChanges: false
      }
    ];
  }
  
  /**
   * Analyze client impact for mobile applications
   */
  analyzeClientImpact(): ClientImpactAnalysis[] {
    return [
      {
        clientType: 'mobile_ios',
        affectedOperations: [
          'createRoom', // genrePreferences field removal
          'createRoomDebug', // deprecated
          'createRoomSimple', // deprecated
          'getAllMovies', // deprecated
          'getMovies', // pagination changes
          'getChatRecommendations' // enhanced response
        ],
        impactLevel: 'medium',
        requiredChanges: [
          'Remove genrePreferences from createRoom input',
          'Replace createRoomDebug with createRoom',
          'Replace createRoomSimple with createRoom',
          'Replace getAllMovies with paginated getMovies',
          'Update getMovies to handle pagination',
          'Handle enhanced getChatRecommendations response'
        ],
        testingRequirements: [
          'Test room creation without genrePreferences',
          'Test deprecated operation replacements',
          'Test movie pagination',
          'Test AI recommendations with new response format',
          'Test real-time subscriptions compatibility'
        ],
        rolloutStrategy: 'gradual'
      },
      {
        clientType: 'mobile_android',
        affectedOperations: [
          'createRoom',
          'createRoomDebug',
          'createRoomSimple',
          'getAllMovies',
          'getMovies',
          'getChatRecommendations'
        ],
        impactLevel: 'medium',
        requiredChanges: [
          'Remove genrePreferences from createRoom input',
          'Replace createRoomDebug with createRoom',
          'Replace createRoomSimple with createRoom',
          'Replace getAllMovies with paginated getMovies',
          'Update getMovies to handle pagination',
          'Handle enhanced getChatRecommendations response'
        ],
        testingRequirements: [
          'Test room creation without genrePreferences',
          'Test deprecated operation replacements',
          'Test movie pagination',
          'Test AI recommendations with new response format',
          'Test real-time subscriptions compatibility'
        ],
        rolloutStrategy: 'gradual'
      }
    ];
  }
  
  /**
   * Create API evolution plan
   */
  createApiEvolutionPlan(): ApiEvolutionPlan {
    const phases: ApiEvolutionPhase[] = [
      {
        id: 'phase-1-compatibility-layer',
        name: 'Compatibility Layer Implementation',
        description: 'Implement compatibility middleware to support existing mobile apps',
        duration: 14, // 2 weeks
        operations: [
          'createRoom',
          'getMovies',
          'getChatRecommendations'
        ],
        dependencies: [],
        deliverables: [
          'Compatibility middleware implementation',
          'Parameter transformation rules',
          'Response format adapters',
          'Deprecation warning system'
        ],
        successCriteria: [
          'All existing mobile operations work without changes',
          'Deprecation warnings are properly logged',
          'Performance impact is minimal (<10ms overhead)'
        ],
        rollbackPlan: [
          'Disable compatibility middleware',
          'Revert to original API endpoints',
          'Restore original response formats'
        ]
      },
      {
        id: 'phase-2-deprecated-operations',
        name: 'Deprecated Operations Migration',
        description: 'Migrate deprecated operations to new equivalents',
        duration: 21, // 3 weeks
        operations: [
          'createRoomDebug',
          'createRoomSimple',
          'getAllMovies'
        ],
        dependencies: ['phase-1-compatibility-layer'],
        deliverables: [
          'Mobile app updates for deprecated operations',
          'Testing suite for new operations',
          'Documentation updates',
          'Migration guides'
        ],
        successCriteria: [
          'All deprecated operations replaced in mobile apps',
          'No functionality regression',
          'Performance improvements achieved'
        ],
        rollbackPlan: [
          'Re-enable deprecated operations',
          'Revert mobile app changes',
          'Restore original operation mappings'
        ]
      },
      {
        id: 'phase-3-enhanced-features',
        name: 'Enhanced Features Adoption',
        description: 'Adopt enhanced subscriptions and improved API features',
        duration: 28, // 4 weeks
        operations: [
          'onVoteUpdateEnhanced',
          'onMatchFoundEnhanced',
          'onConnectionStatusChange',
          'onRoomStateSync'
        ],
        dependencies: ['phase-2-deprecated-operations'],
        deliverables: [
          'Enhanced subscription implementations',
          'Improved real-time performance',
          'Better error handling',
          'Enhanced user experience features'
        ],
        successCriteria: [
          'Enhanced subscriptions provide better performance',
          'Real-time latency improved by >20%',
          'Connection reliability improved',
          'User experience metrics improved'
        ],
        rollbackPlan: [
          'Revert to basic subscriptions',
          'Disable enhanced features',
          'Restore original real-time implementation'
        ]
      },
      {
        id: 'phase-4-cleanup',
        name: 'Legacy API Cleanup',
        description: 'Remove compatibility layer and finalize migration',
        duration: 14, // 2 weeks
        operations: [],
        dependencies: ['phase-3-enhanced-features'],
        deliverables: [
          'Compatibility layer removal',
          'Clean API documentation',
          'Performance optimization',
          'Final testing and validation'
        ],
        successCriteria: [
          'All legacy operations removed',
          'API performance optimized',
          'Documentation complete and accurate',
          'All tests passing'
        ],
        rollbackPlan: [
          'Re-enable compatibility layer',
          'Restore deprecated operations',
          'Revert to previous API version'
        ]
      }
    ];
    
    return {
      id: 'trinity-api-evolution-2024',
      name: 'Trinity API Evolution Plan',
      description: 'Systematic migration from legacy API to clean architecture backend',
      phases,
      totalDuration: phases.reduce((sum, phase) => sum + phase.duration, 0),
      riskAssessment: {
        overallRisk: 'medium',
        riskFactors: [
          'Mobile app compatibility during transition',
          'Real-time functionality disruption',
          'User experience impact during migration',
          'Potential data inconsistencies'
        ],
        mitigationStrategies: [
          'Gradual rollout with feature flags',
          'Comprehensive testing at each phase',
          'Rollback procedures for each phase',
          'Monitoring and alerting for issues',
          'User communication about changes'
        ]
      }
    };
  }
  
  /**
   * Generate compatibility test scenarios
   */
  generateCompatibilityTestScenarios(): Array<{
    name: string;
    description: string;
    operations: string[];
    expectedBehavior: string;
    testSteps: string[];
  }> {
    return [
      {
        name: 'Room Creation Compatibility',
        description: 'Test that room creation works with and without genrePreferences',
        operations: ['createRoom'],
        expectedBehavior: 'Room should be created successfully, genrePreferences should be ignored gracefully',
        testSteps: [
          'Create room with genrePreferences field',
          'Verify room is created without errors',
          'Verify genrePreferences field is not stored',
          'Create room without genrePreferences field',
          'Verify room is created successfully'
        ]
      },
      {
        name: 'Deprecated Operations Handling',
        description: 'Test that deprecated operations still work but log warnings',
        operations: ['createRoomDebug', 'createRoomSimple', 'getAllMovies'],
        expectedBehavior: 'Operations should work but log deprecation warnings',
        testSteps: [
          'Call deprecated operation',
          'Verify operation completes successfully',
          'Verify deprecation warning is logged',
          'Verify warning includes migration guidance'
        ]
      },
      {
        name: 'Real-time Subscription Compatibility',
        description: 'Test that existing subscriptions continue to work',
        operations: ['onVoteUpdate', 'onMatchFound', 'onRoomEvent'],
        expectedBehavior: 'Subscriptions should receive events in expected format',
        testSteps: [
          'Subscribe to room events',
          'Trigger events in room',
          'Verify events are received',
          'Verify event format matches expectations'
        ]
      },
      {
        name: 'Enhanced Subscription Upgrade',
        description: 'Test upgrading to enhanced subscriptions',
        operations: ['onVoteUpdateEnhanced', 'onMatchFoundEnhanced'],
        expectedBehavior: 'Enhanced subscriptions should provide additional data',
        testSteps: [
          'Subscribe to enhanced events',
          'Trigger events in room',
          'Verify enhanced data is included',
          'Verify backward compatibility maintained'
        ]
      },
      {
        name: 'Movie API Pagination',
        description: 'Test movie API with pagination parameters',
        operations: ['getMovies'],
        expectedBehavior: 'API should handle pagination parameters correctly',
        testSteps: [
          'Call getMovies without pagination',
          'Verify default pagination is applied',
          'Call getMovies with pagination parameters',
          'Verify correct page is returned',
          'Verify total count is accurate'
        ]
      }
    ];
  }
}