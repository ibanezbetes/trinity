import { Injectable } from '@nestjs/common';
import { 
  ApiEndpoint, 
  ApiCompatibilityReport, 
  CompatibilityGap, 
  ApiVersionRequirement,
  GraphQLOperation,
  RestEndpoint,
  CompatibilityLevel,
  MigrationRecommendation
} from '../entities/api-compatibility.entity';

/**
 * API Compatibility Analysis Service
 * 
 * Analyzes existing mobile app API endpoints and maps them to new backend services.
 * Identifies compatibility gaps and provides migration recommendations.
 * 
 * **Validates: Requirements 4.1**
 */
@Injectable()
export class ApiCompatibilityAnalysisService {
  
  /**
   * Analyze existing mobile app API structure and create compatibility report
   */
  async analyzeApiCompatibility(
    existingApiStructure: {
      graphqlOperations: GraphQLOperation[];
      restEndpoints: RestEndpoint[];
      subscriptions: GraphQLOperation[];
    },
    newBackendServices: string[]
  ): Promise<ApiCompatibilityReport> {
    
    const compatibilityGaps: CompatibilityGap[] = [];
    const migrationRecommendations: MigrationRecommendation[] = [];
    const versionRequirements: ApiVersionRequirement[] = [];
    
    // Analyze GraphQL operations
    const graphqlAnalysis = await this.analyzeGraphQLOperations(
      existingApiStructure.graphqlOperations,
      newBackendServices
    );
    
    // Analyze REST endpoints
    const restAnalysis = await this.analyzeRestEndpoints(
      existingApiStructure.restEndpoints,
      newBackendServices
    );
    
    // Analyze real-time subscriptions
    const subscriptionAnalysis = await this.analyzeSubscriptions(
      existingApiStructure.subscriptions,
      newBackendServices
    );
    
    // Combine all analyses
    compatibilityGaps.push(
      ...graphqlAnalysis.gaps,
      ...restAnalysis.gaps,
      ...subscriptionAnalysis.gaps
    );
    
    migrationRecommendations.push(
      ...graphqlAnalysis.recommendations,
      ...restAnalysis.recommendations,
      ...subscriptionAnalysis.recommendations
    );
    
    versionRequirements.push(
      ...graphqlAnalysis.versionRequirements,
      ...restAnalysis.versionRequirements,
      ...subscriptionAnalysis.versionRequirements
    );
    
    // Calculate overall compatibility level
    const overallCompatibility = this.calculateOverallCompatibility(compatibilityGaps);
    
    return {
      id: `api-compat-${Date.now()}`,
      timestamp: new Date(),
      overallCompatibility,
      compatibilityGaps,
      migrationRecommendations,
      versionRequirements,
      analysisDetails: {
        totalOperations: existingApiStructure.graphqlOperations.length + 
                        existingApiStructure.restEndpoints.length + 
                        existingApiStructure.subscriptions.length,
        compatibleOperations: compatibilityGaps.filter(gap => gap.severity === 'low').length,
        incompatibleOperations: compatibilityGaps.filter(gap => gap.severity === 'high').length,
        requiresAdaptation: compatibilityGaps.filter(gap => gap.severity === 'medium').length
      }
    };
  }
  
  /**
   * Analyze GraphQL operations compatibility
   */
  private async analyzeGraphQLOperations(
    operations: GraphQLOperation[],
    newBackendServices: string[]
  ): Promise<{
    gaps: CompatibilityGap[];
    recommendations: MigrationRecommendation[];
    versionRequirements: ApiVersionRequirement[];
  }> {
    
    const gaps: CompatibilityGap[] = [];
    const recommendations: MigrationRecommendation[] = [];
    const versionRequirements: ApiVersionRequirement[] = [];
    
    // Define known GraphQL operations from mobile app analysis
    const knownOperations = this.getKnownGraphQLOperations();
    
    for (const operation of operations) {
      const knownOp = knownOperations.find(known => known.name === operation.name);
      
      if (knownOp) {
        // Analyze compatibility for known operations
        const compatibility = await this.analyzeOperationCompatibility(operation, knownOp);
        
        if (compatibility.level !== CompatibilityLevel.FULLY_COMPATIBLE) {
          gaps.push({
            id: `gap-${operation.name}`,
            operationType: 'graphql',
            operationName: operation.name,
            severity: this.mapCompatibilityToSeverity(compatibility.level),
            description: compatibility.description,
            impact: compatibility.impact,
            suggestedFix: compatibility.suggestedFix
          });
        }
        
        // Add migration recommendations
        if (compatibility.migrationNeeded) {
          recommendations.push({
            id: `rec-${operation.name}`,
            operationName: operation.name,
            recommendationType: compatibility.recommendationType,
            description: compatibility.migrationDescription,
            priority: compatibility.priority,
            estimatedEffort: compatibility.estimatedEffort,
            implementationSteps: compatibility.implementationSteps
          });
        }
        
        // Add version requirements
        if (compatibility.versionRequirement) {
          versionRequirements.push(compatibility.versionRequirement);
        }
      } else {
        // Unknown operation - needs investigation
        gaps.push({
          id: `gap-unknown-${operation.name}`,
          operationType: 'graphql',
          operationName: operation.name,
          severity: 'medium',
          description: `Unknown GraphQL operation: ${operation.name}`,
          impact: 'Operation may not be supported in new backend',
          suggestedFix: 'Investigate operation usage and implement in new backend if needed'
        });
      }
    }
    
    return { gaps, recommendations, versionRequirements };
  }
  
  /**
   * Analyze REST endpoints compatibility
   */
  private async analyzeRestEndpoints(
    endpoints: RestEndpoint[],
    newBackendServices: string[]
  ): Promise<{
    gaps: CompatibilityGap[];
    recommendations: MigrationRecommendation[];
    versionRequirements: ApiVersionRequirement[];
  }> {
    
    const gaps: CompatibilityGap[] = [];
    const recommendations: MigrationRecommendation[] = [];
    const versionRequirements: ApiVersionRequirement[] = [];
    
    // Most REST endpoints should be replaced with GraphQL
    for (const endpoint of endpoints) {
      gaps.push({
        id: `gap-rest-${endpoint.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
        operationType: 'rest',
        operationName: `${endpoint.method} ${endpoint.path}`,
        severity: 'medium',
        description: `REST endpoint should be migrated to GraphQL: ${endpoint.method} ${endpoint.path}`,
        impact: 'Endpoint will be deprecated in favor of GraphQL operations',
        suggestedFix: 'Migrate to equivalent GraphQL operation or create new GraphQL resolver'
      });
      
      recommendations.push({
        id: `rec-rest-${endpoint.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
        operationName: `${endpoint.method} ${endpoint.path}`,
        recommendationType: 'migrate_to_graphql',
        description: `Migrate REST endpoint to GraphQL operation`,
        priority: 'medium',
        estimatedEffort: 'low',
        implementationSteps: [
          'Identify equivalent GraphQL operation',
          'Update mobile app to use GraphQL',
          'Add compatibility layer if needed',
          'Remove REST endpoint after migration'
        ]
      });
    }
    
    return { gaps, recommendations, versionRequirements };
  }
  
  /**
   * Analyze real-time subscriptions compatibility
   */
  private async analyzeSubscriptions(
    subscriptions: GraphQLOperation[],
    newBackendServices: string[]
  ): Promise<{
    gaps: CompatibilityGap[];
    recommendations: MigrationRecommendation[];
    versionRequirements: ApiVersionRequirement[];
  }> {
    
    const gaps: CompatibilityGap[] = [];
    const recommendations: MigrationRecommendation[] = [];
    const versionRequirements: ApiVersionRequirement[] = [];
    
    // Define known subscriptions from schema analysis
    const knownSubscriptions = this.getKnownSubscriptions();
    
    for (const subscription of subscriptions) {
      const knownSub = knownSubscriptions.find(known => known.name === subscription.name);
      
      if (knownSub) {
        // Enhanced subscriptions are available - check compatibility
        if (knownSub.enhanced) {
          recommendations.push({
            id: `rec-sub-${subscription.name}`,
            operationName: subscription.name,
            recommendationType: 'upgrade_to_enhanced',
            description: `Upgrade to enhanced ${subscription.name} subscription for better performance`,
            priority: 'low',
            estimatedEffort: 'low',
            implementationSteps: [
              'Update subscription to use enhanced version',
              'Handle additional fields in response',
              'Test real-time functionality'
            ]
          });
        }
      } else {
        gaps.push({
          id: `gap-sub-${subscription.name}`,
          operationType: 'subscription',
          operationName: subscription.name,
          severity: 'high',
          description: `Unknown subscription: ${subscription.name}`,
          impact: 'Real-time functionality may be broken',
          suggestedFix: 'Implement subscription in new backend or find equivalent'
        });
      }
    }
    
    return { gaps, recommendations, versionRequirements };
  }
  
  /**
   * Get known GraphQL operations from mobile app analysis
   */
  private getKnownGraphQLOperations(): Array<{
    name: string;
    type: 'query' | 'mutation';
    compatibility: CompatibilityLevel;
    newServiceMapping: string;
    migrationNeeded: boolean;
  }> {
    return [
      // Room operations
      {
        name: 'getUserRooms',
        type: 'query',
        compatibility: CompatibilityLevel.FULLY_COMPATIBLE,
        newServiceMapping: 'RoomService',
        migrationNeeded: false
      },
      {
        name: 'createRoom',
        type: 'mutation',
        compatibility: CompatibilityLevel.REQUIRES_ADAPTATION,
        newServiceMapping: 'RoomService',
        migrationNeeded: true
      },
      {
        name: 'createRoomDebug',
        type: 'mutation',
        compatibility: CompatibilityLevel.DEPRECATED,
        newServiceMapping: 'RoomService',
        migrationNeeded: true
      },
      {
        name: 'createRoomSimple',
        type: 'mutation',
        compatibility: CompatibilityLevel.DEPRECATED,
        newServiceMapping: 'RoomService',
        migrationNeeded: true
      },
      {
        name: 'joinRoomByInvite',
        type: 'mutation',
        compatibility: CompatibilityLevel.FULLY_COMPATIBLE,
        newServiceMapping: 'RoomService',
        migrationNeeded: false
      },
      {
        name: 'getRoom',
        type: 'query',
        compatibility: CompatibilityLevel.FULLY_COMPATIBLE,
        newServiceMapping: 'RoomService',
        migrationNeeded: false
      },
      
      // Voting operations
      {
        name: 'vote',
        type: 'mutation',
        compatibility: CompatibilityLevel.FULLY_COMPATIBLE,
        newServiceMapping: 'VotingService',
        migrationNeeded: false
      },
      
      // Movie operations
      {
        name: 'getMovies',
        type: 'query',
        compatibility: CompatibilityLevel.REQUIRES_ADAPTATION,
        newServiceMapping: 'MediaService',
        migrationNeeded: true
      },
      {
        name: 'getMovieDetails',
        type: 'query',
        compatibility: CompatibilityLevel.FULLY_COMPATIBLE,
        newServiceMapping: 'MediaService',
        migrationNeeded: false
      },
      
      // AI operations
      {
        name: 'getChatRecommendations',
        type: 'query',
        compatibility: CompatibilityLevel.REQUIRES_ADAPTATION,
        newServiceMapping: 'AIService',
        migrationNeeded: true
      }
    ];
  }
  
  /**
   * Get known subscriptions from schema analysis
   */
  private getKnownSubscriptions(): Array<{
    name: string;
    enhanced: boolean;
    compatibility: CompatibilityLevel;
  }> {
    return [
      {
        name: 'onRoomEvent',
        enhanced: false,
        compatibility: CompatibilityLevel.FULLY_COMPATIBLE
      },
      {
        name: 'onVoteUpdate',
        enhanced: true,
        compatibility: CompatibilityLevel.FULLY_COMPATIBLE
      },
      {
        name: 'onMatchFound',
        enhanced: true,
        compatibility: CompatibilityLevel.FULLY_COMPATIBLE
      },
      {
        name: 'onMemberUpdate',
        enhanced: false,
        compatibility: CompatibilityLevel.FULLY_COMPATIBLE
      },
      {
        name: 'onVoteUpdateEnhanced',
        enhanced: true,
        compatibility: CompatibilityLevel.FULLY_COMPATIBLE
      },
      {
        name: 'onMatchFoundEnhanced',
        enhanced: true,
        compatibility: CompatibilityLevel.FULLY_COMPATIBLE
      },
      {
        name: 'onConnectionStatusChange',
        enhanced: true,
        compatibility: CompatibilityLevel.FULLY_COMPATIBLE
      },
      {
        name: 'onRoomStateSync',
        enhanced: true,
        compatibility: CompatibilityLevel.FULLY_COMPATIBLE
      }
    ];
  }
  
  /**
   * Analyze individual operation compatibility
   */
  private async analyzeOperationCompatibility(
    operation: GraphQLOperation,
    knownOperation: any
  ): Promise<{
    level: CompatibilityLevel;
    description: string;
    impact: string;
    suggestedFix: string;
    migrationNeeded: boolean;
    recommendationType?: string;
    migrationDescription?: string;
    priority?: string;
    estimatedEffort?: string;
    implementationSteps?: string[];
    versionRequirement?: ApiVersionRequirement;
  }> {
    
    switch (knownOperation.compatibility) {
      case CompatibilityLevel.FULLY_COMPATIBLE:
        return {
          level: CompatibilityLevel.FULLY_COMPATIBLE,
          description: `Operation ${operation.name} is fully compatible`,
          impact: 'No impact - operation works as expected',
          suggestedFix: 'No changes needed',
          migrationNeeded: false
        };
        
      case CompatibilityLevel.REQUIRES_ADAPTATION:
        return {
          level: CompatibilityLevel.REQUIRES_ADAPTATION,
          description: `Operation ${operation.name} requires minor adaptations`,
          impact: 'Minor changes needed to request/response format',
          suggestedFix: 'Update operation parameters or response handling',
          migrationNeeded: true,
          recommendationType: 'adapt_operation',
          migrationDescription: `Adapt ${operation.name} to new backend format`,
          priority: 'medium',
          estimatedEffort: 'low',
          implementationSteps: [
            'Analyze parameter differences',
            'Update request format if needed',
            'Handle response format changes',
            'Test operation functionality'
          ],
          versionRequirement: {
            operationName: operation.name,
            minimumVersion: '2.0.0',
            recommendedVersion: '2.1.0',
            deprecationDate: null,
            migrationDeadline: null
          }
        };
        
      case CompatibilityLevel.DEPRECATED:
        return {
          level: CompatibilityLevel.DEPRECATED,
          description: `Operation ${operation.name} is deprecated`,
          impact: 'Operation will be removed in future versions',
          suggestedFix: 'Migrate to new equivalent operation',
          migrationNeeded: true,
          recommendationType: 'migrate_to_new_operation',
          migrationDescription: `Migrate from deprecated ${operation.name} to new operation`,
          priority: 'high',
          estimatedEffort: 'medium',
          implementationSteps: [
            'Identify replacement operation',
            'Update mobile app code',
            'Test new operation',
            'Remove deprecated operation usage'
          ],
          versionRequirement: {
            operationName: operation.name,
            minimumVersion: '1.0.0',
            recommendedVersion: '2.0.0',
            deprecationDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
            migrationDeadline: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) // 180 days
          }
        };
        
      default:
        return {
          level: CompatibilityLevel.INCOMPATIBLE,
          description: `Operation ${operation.name} is not compatible`,
          impact: 'Operation will not work with new backend',
          suggestedFix: 'Implement new operation or find alternative',
          migrationNeeded: true,
          recommendationType: 'implement_new_operation',
          migrationDescription: `Implement new operation to replace ${operation.name}`,
          priority: 'high',
          estimatedEffort: 'high',
          implementationSteps: [
            'Design new operation',
            'Implement backend resolver',
            'Update mobile app',
            'Test functionality'
          ]
        };
    }
  }
  
  /**
   * Calculate overall compatibility level
   */
  private calculateOverallCompatibility(gaps: CompatibilityGap[]): CompatibilityLevel {
    const highSeverityGaps = gaps.filter(gap => gap.severity === 'high').length;
    const mediumSeverityGaps = gaps.filter(gap => gap.severity === 'medium').length;
    const totalGaps = gaps.length;
    
    if (highSeverityGaps > 0) {
      return CompatibilityLevel.INCOMPATIBLE;
    } else if (mediumSeverityGaps > totalGaps * 0.3) {
      return CompatibilityLevel.REQUIRES_ADAPTATION;
    } else if (totalGaps > 0) {
      return CompatibilityLevel.REQUIRES_ADAPTATION;
    } else {
      return CompatibilityLevel.FULLY_COMPATIBLE;
    }
  }
  
  /**
   * Map compatibility level to severity
   */
  private mapCompatibilityToSeverity(level: CompatibilityLevel): 'low' | 'medium' | 'high' {
    switch (level) {
      case CompatibilityLevel.FULLY_COMPATIBLE:
        return 'low';
      case CompatibilityLevel.REQUIRES_ADAPTATION:
        return 'medium';
      case CompatibilityLevel.DEPRECATED:
        return 'medium';
      case CompatibilityLevel.INCOMPATIBLE:
        return 'high';
      default:
        return 'high';
    }
  }
  
  /**
   * Create compatibility middleware configuration
   */
  async createCompatibilityMiddleware(
    compatibilityReport: ApiCompatibilityReport
  ): Promise<{
    middlewareConfig: any;
    transformationRules: any[];
    deprecationWarnings: any[];
  }> {
    
    const middlewareConfig = {
      enableCompatibilityLayer: true,
      strictMode: false,
      logDeprecationWarnings: true,
      transformationEnabled: true
    };
    
    const transformationRules: any[] = [];
    const deprecationWarnings: any[] = [];
    
    // Create transformation rules for operations that require adaptation
    for (const gap of compatibilityReport.compatibilityGaps) {
      if (gap.severity === 'medium' && gap.operationType === 'graphql') {
        transformationRules.push({
          operationName: gap.operationName,
          transformationType: 'parameter_mapping',
          rules: {
            // Add specific transformation rules based on operation
            inputTransformation: this.getInputTransformation(gap.operationName),
            outputTransformation: this.getOutputTransformation(gap.operationName)
          }
        });
      }
    }
    
    // Create deprecation warnings
    for (const recommendation of compatibilityReport.migrationRecommendations) {
      if (recommendation.recommendationType === 'migrate_to_new_operation') {
        deprecationWarnings.push({
          operationName: recommendation.operationName,
          message: `Operation ${recommendation.operationName} is deprecated. ${recommendation.description}`,
          severity: 'warning',
          migrationDeadline: compatibilityReport.versionRequirements
            .find(req => req.operationName === recommendation.operationName)?.migrationDeadline
        });
      }
    }
    
    return {
      middlewareConfig,
      transformationRules,
      deprecationWarnings
    };
  }
  
  /**
   * Get input transformation rules for specific operations
   */
  private getInputTransformation(operationName: string): any {
    const transformations: Record<string, any> = {
      'createRoom': {
        // Remove genrePreferences field that's not supported in new schema
        removeFields: ['genrePreferences'],
        // Map old field names to new ones if needed
        fieldMappings: {}
      },
      'getMovies': {
        // Add pagination parameters
        addDefaults: {
          page: 1,
          limit: 20
        }
      },
      'getChatRecommendations': {
        // Enhance input with additional context
        addDefaults: {
          includeGenreAnalysis: true,
          maxRecommendations: 10
        }
      }
    };
    
    return transformations[operationName] || {};
  }
  
  /**
   * Get output transformation rules for specific operations
   */
  private getOutputTransformation(operationName: string): any {
    const transformations: Record<string, any> = {
      'createRoom': {
        // Add missing fields for backward compatibility
        addFields: {
          genrePreferences: []
        }
      },
      'getMovies': {
        // Transform new movie format to old format if needed
        fieldMappings: {
          'vote_average': 'rating',
          'release_date': 'year'
        }
      }
    };
    
    return transformations[operationName] || {};
  }
}