import { Injectable } from '@nestjs/common';
import { ApiCompatibilityAnalysisService } from './api-compatibility-analysis.service';
import { MobileApiMapperService } from './mobile-api-mapper.service';
import { 
  ApiCompatibilityReport,
  CompatibilityMiddlewareConfig,
  BackwardCompatibilityStrategy,
  ApiTestingStrategy,
  ApiEvolutionPlan
} from '../entities/api-compatibility.entity';

/**
 * Comprehensive API Analysis Service
 * 
 * Orchestrates the complete API compatibility analysis process.
 * Combines mobile API mapping, compatibility analysis, and migration planning
 * to provide a complete picture of the API migration requirements.
 * 
 * **Validates: Requirements 4.1**
 */
@Injectable()
export class ComprehensiveApiAnalysisService {
  
  constructor(
    private readonly compatibilityAnalysisService: ApiCompatibilityAnalysisService,
    private readonly mobileApiMapperService: MobileApiMapperService
  ) {}
  
  /**
   * Perform complete API compatibility analysis
   */
  async performCompleteAnalysis(): Promise<{
    compatibilityReport: ApiCompatibilityReport;
    middlewareConfig: CompatibilityMiddlewareConfig;
    backwardCompatibilityStrategy: BackwardCompatibilityStrategy;
    testingStrategy: ApiTestingStrategy;
    evolutionPlan: ApiEvolutionPlan;
    implementationGuidance: string[];
  }> {
    
    // Extract current mobile API structure
    const mobileApiStructure = this.mobileApiMapperService.extractMobileApiStructure();
    
    // Define new backend services
    const newBackendServices = [
      'AuthService',
      'RoomService', 
      'VotingService',
      'MediaService',
      'AIService',
      'WebSocketService',
      'NotificationService'
    ];
    
    // Perform compatibility analysis
    const compatibilityReport = await this.compatibilityAnalysisService.analyzeApiCompatibility(
      mobileApiStructure,
      newBackendServices
    );
    
    // Create compatibility middleware configuration
    const middlewareResult = await this.compatibilityAnalysisService.createCompatibilityMiddleware(
      compatibilityReport
    );
    
    const middlewareConfig: CompatibilityMiddlewareConfig = {
      ...middlewareResult.middlewareConfig,
      allowedDeprecatedOperations: [
        'createRoomDebug',
        'createRoomSimple', 
        'getAllMovies'
      ],
      transformationRules: middlewareResult.transformationRules,
      deprecationWarnings: middlewareResult.deprecationWarnings
    };
    
    // Create backward compatibility strategy
    const backwardCompatibilityStrategy = this.createBackwardCompatibilityStrategy();
    
    // Create testing strategy
    const testingStrategy = this.createTestingStrategy();
    
    // Get evolution plan
    const evolutionPlan = this.mobileApiMapperService.createApiEvolutionPlan();
    
    // Generate implementation guidance
    const implementationGuidance = this.generateImplementationGuidance(
      compatibilityReport,
      evolutionPlan
    );
    
    return {
      compatibilityReport,
      middlewareConfig,
      backwardCompatibilityStrategy,
      testingStrategy,
      evolutionPlan,
      implementationGuidance
    };
  }
  
  /**
   * Create backward compatibility strategy
   */
  private createBackwardCompatibilityStrategy(): BackwardCompatibilityStrategy {
    return {
      maintainLegacyEndpoints: true,
      legacyEndpointTimeout: 180, // 6 months
      versioningStrategy: 'header_versioning',
      deprecationNoticeStrategy: 'gradual',
      clientMigrationSupport: {
        documentationProvided: true,
        migrationToolsAvailable: true,
        supportChannelAvailable: true,
        migrationDeadline: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) // 6 months from now
      }
    };
  }
  
  /**
   * Create comprehensive testing strategy
   */
  private createTestingStrategy(): ApiTestingStrategy {
    return {
      compatibilityTestSuite: {
        unitTests: [
          'test-room-creation-compatibility',
          'test-deprecated-operations-handling',
          'test-parameter-transformation',
          'test-response-format-adaptation',
          'test-error-handling-compatibility'
        ],
        integrationTests: [
          'test-mobile-app-room-flow',
          'test-voting-session-compatibility',
          'test-real-time-subscription-compatibility',
          'test-authentication-flow-compatibility',
          'test-movie-browsing-compatibility'
        ],
        endToEndTests: [
          'test-complete-room-session-e2e',
          'test-mobile-app-compatibility-e2e',
          'test-real-time-voting-e2e',
          'test-ai-recommendations-e2e',
          'test-error-recovery-e2e'
        ]
      },
      performanceTestingRequired: true,
      loadTestingScenarios: [
        'concurrent-room-creation-with-compatibility-layer',
        'high-frequency-voting-with-transformations',
        'multiple-subscription-connections',
        'deprecated-operation-load-testing'
      ],
      securityTestingRequired: true,
      clientCompatibilityTesting: {
        mobileAppTesting: true,
        webAppTesting: false, // No web app in current system
        apiConsumerTesting: true
      }
    };
  }
  
  /**
   * Generate implementation guidance
   */
  private generateImplementationGuidance(
    compatibilityReport: ApiCompatibilityReport,
    evolutionPlan: ApiEvolutionPlan
  ): string[] {
    const guidance: string[] = [
      '# Trinity API Compatibility Implementation Guide',
      '',
      '## Overview',
      `This guide provides step-by-step instructions for implementing API compatibility during the Trinity refactoring process. The analysis identified ${compatibilityReport.compatibilityGaps.length} compatibility gaps that need to be addressed.`,
      '',
      '## Phase 1: Compatibility Layer Implementation (Weeks 1-2)',
      '',
      '### 1.1 Create Compatibility Middleware',
      '```typescript',
      '// Implement in backend-refactored/src/infrastructure/middleware/compatibility.middleware.ts',
      '@Injectable()',
      'export class CompatibilityMiddleware implements NestMiddleware {',
      '  use(req: Request, res: Response, next: NextFunction) {',
      '    // Handle deprecated operations',
      '    // Transform request parameters',
      '    // Add deprecation warnings',
      '    next();',
      '  }',
      '}',
      '```',
      '',
      '### 1.2 Parameter Transformation Rules',
      '- Remove `genrePreferences` field from `createRoom` input',
      '- Add default pagination to `getMovies` operations',
      '- Transform deprecated operation calls to new equivalents',
      '',
      '### 1.3 Response Format Adapters',
      '- Ensure response formats match mobile app expectations',
      '- Add backward compatibility fields where needed',
      '- Handle enhanced response formats gracefully',
      '',
      '## Phase 2: Mobile App Updates (Weeks 3-5)',
      '',
      '### 2.1 Update Room Creation',
      '```typescript',
      '// In mobile/src/services/appSyncService.ts',
      'async createRoom(input: {',
      '  name: string;',
      '  description?: string;',
      '  isPrivate?: boolean;',
      '  maxMembers?: number;',
      '  // Remove genrePreferences - no longer supported',
      '}): Promise<{ createRoom: any }> {',
      '  // Updated implementation',
      '}',
      '```',
      '',
      '### 2.2 Replace Deprecated Operations',
      '- Replace `createRoomDebug` calls with `createRoom`',
      '- Replace `createRoomSimple` calls with `createRoom`',
      '- Replace `getAllMovies` calls with paginated `getMovies`',
      '',
      '### 2.3 Handle Enhanced Subscriptions',
      '```typescript',
      '// Upgrade to enhanced subscriptions for better performance',
      'await this.subscribeToVoteUpdatesEnhanced(roomId, callback);',
      'await this.subscribeToMatchFoundEnhanced(roomId, callback);',
      '```',
      '',
      '## Phase 3: Testing and Validation (Weeks 6-7)',
      '',
      '### 3.1 Compatibility Testing',
      '- Test all existing mobile app flows',
      '- Verify deprecated operations still work with warnings',
      '- Test real-time functionality compatibility',
      '- Validate error handling and edge cases',
      '',
      '### 3.2 Performance Testing',
      '- Measure compatibility layer overhead (<10ms target)',
      '- Test concurrent operations with transformations',
      '- Validate real-time subscription performance',
      '',
      '## Phase 4: Enhanced Features (Weeks 8-11)',
      '',
      '### 4.1 Implement Enhanced Subscriptions',
      '- Deploy enhanced subscription support',
      '- Update mobile apps to use enhanced versions',
      '- Monitor performance improvements',
      '',
      '### 4.2 Optimize API Performance',
      '- Remove unnecessary compatibility transformations',
      '- Optimize database queries for new operations',
      '- Implement caching for frequently accessed data',
      '',
      '## Phase 5: Legacy Cleanup (Weeks 12-13)',
      '',
      '### 5.1 Remove Compatibility Layer',
      '- Verify all mobile apps are updated',
      '- Remove deprecated operation support',
      '- Clean up transformation middleware',
      '',
      '### 5.2 Final Validation',
      '- Run complete test suite',
      '- Validate performance improvements',
      '- Update documentation',
      '',
      '## Critical Success Factors',
      '',
      '1. **Gradual Migration**: Never break existing mobile apps',
      '2. **Comprehensive Testing**: Test every operation and edge case',
      '3. **Performance Monitoring**: Ensure compatibility layer doesn\'t degrade performance',
      '4. **Clear Communication**: Keep stakeholders informed of progress',
      '5. **Rollback Readiness**: Have rollback plans for each phase',
      '',
      '## Risk Mitigation',
      '',
      '- **Mobile App Compatibility**: Maintain compatibility layer until all apps are updated',
      '- **Real-time Functionality**: Test WebSocket connections thoroughly',
      '- **Data Consistency**: Validate data integrity during transformations',
      '- **Performance Impact**: Monitor and optimize compatibility layer performance',
      '',
      '## Monitoring and Alerting',
      '',
      '- Set up alerts for deprecated operation usage',
      '- Monitor compatibility layer performance metrics',
      '- Track mobile app update adoption rates',
      '- Alert on any API compatibility issues',
      '',
      '## Documentation Updates',
      '',
      '- Update API documentation with compatibility notes',
      '- Create migration guides for mobile developers',
      '- Document new enhanced subscription features',
      '- Maintain changelog of API changes'
    ];
    
    // Add specific guidance based on compatibility gaps
    if (compatibilityReport.compatibilityGaps.length > 0) {
      guidance.push('', '## Specific Compatibility Issues', '');
      
      compatibilityReport.compatibilityGaps.forEach((gap, index) => {
        guidance.push(`### ${index + 1}. ${gap.operationName}`);
        guidance.push(`**Severity**: ${gap.severity}`);
        guidance.push(`**Issue**: ${gap.description}`);
        guidance.push(`**Impact**: ${gap.impact}`);
        guidance.push(`**Solution**: ${gap.suggestedFix}`);
        guidance.push('');
      });
    }
    
    // Add migration recommendations
    if (compatibilityReport.migrationRecommendations.length > 0) {
      guidance.push('## Migration Recommendations', '');
      
      compatibilityReport.migrationRecommendations.forEach((rec, index) => {
        guidance.push(`### ${index + 1}. ${rec.operationName}`);
        guidance.push(`**Type**: ${rec.recommendationType}`);
        guidance.push(`**Priority**: ${rec.priority}`);
        guidance.push(`**Effort**: ${rec.estimatedEffort}`);
        guidance.push(`**Description**: ${rec.description}`);
        guidance.push('**Steps**:');
        rec.implementationSteps.forEach(step => {
          guidance.push(`- ${step}`);
        });
        guidance.push('');
      });
    }
    
    return guidance;
  }
  
  /**
   * Generate compatibility report summary
   */
  generateCompatibilityReportSummary(report: ApiCompatibilityReport): string {
    const summary = [
      `# Trinity API Compatibility Analysis Summary`,
      ``,
      `**Analysis Date**: ${report.timestamp.toISOString()}`,
      `**Overall Compatibility**: ${report.overallCompatibility}`,
      ``,
      `## Statistics`,
      `- Total Operations Analyzed: ${report.analysisDetails.totalOperations}`,
      `- Fully Compatible: ${report.analysisDetails.compatibleOperations}`,
      `- Requires Adaptation: ${report.analysisDetails.requiresAdaptation}`,
      `- Incompatible: ${report.analysisDetails.incompatibleOperations}`,
      ``,
      `## Key Findings`,
      `- ${report.compatibilityGaps.filter(g => g.severity === 'high').length} high-severity compatibility issues`,
      `- ${report.compatibilityGaps.filter(g => g.severity === 'medium').length} medium-severity compatibility issues`,
      `- ${report.compatibilityGaps.filter(g => g.severity === 'low').length} low-severity compatibility issues`,
      ``,
      `## Migration Recommendations`,
      `- ${report.migrationRecommendations.filter(r => r.priority === 'high').length} high-priority migrations`,
      `- ${report.migrationRecommendations.filter(r => r.priority === 'medium').length} medium-priority migrations`,
      `- ${report.migrationRecommendations.filter(r => r.priority === 'low').length} low-priority migrations`,
      ``,
      `## Next Steps`,
      `1. Implement compatibility middleware for seamless transition`,
      `2. Update mobile applications to remove deprecated operations`,
      `3. Adopt enhanced subscription features for better performance`,
      `4. Remove compatibility layer after mobile app updates`,
      ``,
      `## Risk Assessment`,
      `The migration has been assessed as **medium risk** with proper mitigation strategies in place.`
    ].join('\n');
    
    return summary;
  }
}