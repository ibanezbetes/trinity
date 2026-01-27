/**
 * Feature Extractor Adapter
 * Infrastructure adapter for extracting features from codebase
 */

import { Injectable, Logger } from '@nestjs/common';
import { IFeatureExtractor } from '../../domain/services/analysis-engine.interface';
import {
  Codebase,
  RoomFeatures,
  VotingFeatures,
  AuthFeatures,
  MediaFeatures,
  FeatureImplementation,
  TestInfo,
  ImplementationIssue,
  DocumentationInfo,
} from '../../domain/entities/analysis.entity';

@Injectable()
export class FeatureExtractorAdapter implements IFeatureExtractor {
  private readonly logger = new Logger(FeatureExtractorAdapter.name);

  async extractRoomFeatures(codebase: Codebase): Promise<RoomFeatures> {
    this.logger.log('Extracting room management features');

    try {
      const roomCreation = await this.analyzeRoomCreationFeature(codebase);
      const roomManagement = await this.analyzeRoomManagementFeature(codebase);
      const participantManagement = await this.analyzeParticipantManagementFeature(codebase);
      const roomSettings = await this.analyzeRoomSettingsFeature(codebase);
      const roomPersistence = await this.analyzeRoomPersistenceFeature(codebase);

      const roomFeatures: RoomFeatures = {
        roomCreation,
        roomManagement,
        participantManagement,
        roomSettings,
        roomPersistence,
      };

      this.logger.log('Room features extraction completed');
      return roomFeatures;
    } catch (error) {
      this.logger.error(`Failed to extract room features: ${error.message}`, error.stack);
      throw new Error(`Failed to extract room features: ${error.message}`);
    }
  }

  async extractVotingFeatures(codebase: Codebase): Promise<VotingFeatures> {
    this.logger.log('Extracting voting system features');

    try {
      const votingSession = await this.analyzeVotingSessionFeature(codebase);
      const realTimeVoting = await this.analyzeRealTimeVotingFeature(codebase);
      const voteValidation = await this.analyzeVoteValidationFeature(codebase);
      const resultsCalculation = await this.analyzeResultsCalculationFeature(codebase);
      const votingHistory = await this.analyzeVotingHistoryFeature(codebase);

      const votingFeatures: VotingFeatures = {
        votingSession,
        realTimeVoting,
        voteValidation,
        resultsCalculation,
        votingHistory,
      };

      this.logger.log('Voting features extraction completed');
      return votingFeatures;
    } catch (error) {
      this.logger.error(`Failed to extract voting features: ${error.message}`, error.stack);
      throw new Error(`Failed to extract voting features: ${error.message}`);
    }
  }

  async extractAuthFeatures(codebase: Codebase): Promise<AuthFeatures> {
    this.logger.log('Extracting authentication features');

    try {
      const googleAuth = await this.analyzeGoogleAuthFeature(codebase);
      const cognitoAuth = await this.analyzeCognitoAuthFeature(codebase);
      const jwtTokens = await this.analyzeJwtTokensFeature(codebase);
      const sessionManagement = await this.analyzeSessionManagementFeature(codebase);
      const userProfiles = await this.analyzeUserProfilesFeature(codebase);

      const authFeatures: AuthFeatures = {
        googleAuth,
        cognitoAuth,
        jwtTokens,
        sessionManagement,
        userProfiles,
      };

      this.logger.log('Authentication features extraction completed');
      return authFeatures;
    } catch (error) {
      this.logger.error(`Failed to extract auth features: ${error.message}`, error.stack);
      throw new Error(`Failed to extract auth features: ${error.message}`);
    }
  }

  async extractMediaFeatures(codebase: Codebase): Promise<MediaFeatures> {
    this.logger.log('Extracting media handling features');

    try {
      const mediaUpload = await this.analyzeMediaUploadFeature(codebase);
      const mediaStorage = await this.analyzeMediaStorageFeature(codebase);
      const mediaStreaming = await this.analyzeMediaStreamingFeature(codebase);
      const mediaProcessing = await this.analyzeMediaProcessingFeature(codebase);
      const mediaMetadata = await this.analyzeMediaMetadataFeature(codebase);

      const mediaFeatures: MediaFeatures = {
        mediaUpload,
        mediaStorage,
        mediaStreaming,
        mediaProcessing,
        mediaMetadata,
      };

      this.logger.log('Media features extraction completed');
      return mediaFeatures;
    } catch (error) {
      this.logger.error(`Failed to extract media features: ${error.message}`, error.stack);
      throw new Error(`Failed to extract media features: ${error.message}`);
    }
  }

  // Room Feature Analysis Methods
  private async analyzeRoomCreationFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['room', 'create', 'new']);
    const tests = this.findTestsByKeywords(codebase, ['room', 'create']);
    const documentation = this.findDocumentationByKeywords(codebase, ['room', 'creation']);
    const issues = this.findIssuesByKeywords(codebase, ['room', 'create']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeRoomManagementFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['room', 'manage', 'update', 'delete']);
    const tests = this.findTestsByKeywords(codebase, ['room', 'manage']);
    const documentation = this.findDocumentationByKeywords(codebase, ['room', 'management']);
    const issues = this.findIssuesByKeywords(codebase, ['room', 'manage']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeParticipantManagementFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['participant', 'user', 'join', 'leave']);
    const tests = this.findTestsByKeywords(codebase, ['participant', 'join']);
    const documentation = this.findDocumentationByKeywords(codebase, ['participant', 'user']);
    const issues = this.findIssuesByKeywords(codebase, ['participant', 'user']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeRoomSettingsFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['room', 'settings', 'config']);
    const tests = this.findTestsByKeywords(codebase, ['room', 'settings']);
    const documentation = this.findDocumentationByKeywords(codebase, ['room', 'settings']);
    const issues = this.findIssuesByKeywords(codebase, ['room', 'settings']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeRoomPersistenceFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['room', 'save', 'persist', 'database']);
    const tests = this.findTestsByKeywords(codebase, ['room', 'persist']);
    const documentation = this.findDocumentationByKeywords(codebase, ['room', 'persistence']);
    const issues = this.findIssuesByKeywords(codebase, ['room', 'persist']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  // Voting Feature Analysis Methods
  private async analyzeVotingSessionFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['voting', 'session', 'poll']);
    const tests = this.findTestsByKeywords(codebase, ['voting', 'session']);
    const documentation = this.findDocumentationByKeywords(codebase, ['voting', 'session']);
    const issues = this.findIssuesByKeywords(codebase, ['voting', 'session']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeRealTimeVotingFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['voting', 'realtime', 'websocket', 'socket']);
    const tests = this.findTestsByKeywords(codebase, ['voting', 'realtime']);
    const documentation = this.findDocumentationByKeywords(codebase, ['realtime', 'voting']);
    const issues = this.findIssuesByKeywords(codebase, ['realtime', 'voting']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeVoteValidationFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['vote', 'validation', 'validate']);
    const tests = this.findTestsByKeywords(codebase, ['vote', 'validation']);
    const documentation = this.findDocumentationByKeywords(codebase, ['vote', 'validation']);
    const issues = this.findIssuesByKeywords(codebase, ['vote', 'validation']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeResultsCalculationFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['results', 'calculate', 'tally']);
    const tests = this.findTestsByKeywords(codebase, ['results', 'calculate']);
    const documentation = this.findDocumentationByKeywords(codebase, ['results', 'calculation']);
    const issues = this.findIssuesByKeywords(codebase, ['results', 'calculate']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeVotingHistoryFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['voting', 'history', 'log']);
    const tests = this.findTestsByKeywords(codebase, ['voting', 'history']);
    const documentation = this.findDocumentationByKeywords(codebase, ['voting', 'history']);
    const issues = this.findIssuesByKeywords(codebase, ['voting', 'history']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  // Auth Feature Analysis Methods
  private async analyzeGoogleAuthFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['google', 'auth', 'oauth']);
    const tests = this.findTestsByKeywords(codebase, ['google', 'auth']);
    const documentation = this.findDocumentationByKeywords(codebase, ['google', 'authentication']);
    const issues = this.findIssuesByKeywords(codebase, ['google', 'auth']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeCognitoAuthFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['cognito', 'aws', 'auth']);
    const tests = this.findTestsByKeywords(codebase, ['cognito', 'auth']);
    const documentation = this.findDocumentationByKeywords(codebase, ['cognito', 'authentication']);
    const issues = this.findIssuesByKeywords(codebase, ['cognito', 'auth']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeJwtTokensFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['jwt', 'token', 'bearer']);
    const tests = this.findTestsByKeywords(codebase, ['jwt', 'token']);
    const documentation = this.findDocumentationByKeywords(codebase, ['jwt', 'token']);
    const issues = this.findIssuesByKeywords(codebase, ['jwt', 'token']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeSessionManagementFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['session', 'manage', 'login']);
    const tests = this.findTestsByKeywords(codebase, ['session', 'manage']);
    const documentation = this.findDocumentationByKeywords(codebase, ['session', 'management']);
    const issues = this.findIssuesByKeywords(codebase, ['session', 'manage']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeUserProfilesFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['user', 'profile', 'account']);
    const tests = this.findTestsByKeywords(codebase, ['user', 'profile']);
    const documentation = this.findDocumentationByKeywords(codebase, ['user', 'profile']);
    const issues = this.findIssuesByKeywords(codebase, ['user', 'profile']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  // Media Feature Analysis Methods
  private async analyzeMediaUploadFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['media', 'upload', 'file']);
    const tests = this.findTestsByKeywords(codebase, ['media', 'upload']);
    const documentation = this.findDocumentationByKeywords(codebase, ['media', 'upload']);
    const issues = this.findIssuesByKeywords(codebase, ['media', 'upload']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeMediaStorageFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['media', 'storage', 's3']);
    const tests = this.findTestsByKeywords(codebase, ['media', 'storage']);
    const documentation = this.findDocumentationByKeywords(codebase, ['media', 'storage']);
    const issues = this.findIssuesByKeywords(codebase, ['media', 'storage']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeMediaStreamingFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['media', 'stream', 'video']);
    const tests = this.findTestsByKeywords(codebase, ['media', 'stream']);
    const documentation = this.findDocumentationByKeywords(codebase, ['media', 'streaming']);
    const issues = this.findIssuesByKeywords(codebase, ['media', 'stream']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeMediaProcessingFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['media', 'process', 'convert']);
    const tests = this.findTestsByKeywords(codebase, ['media', 'process']);
    const documentation = this.findDocumentationByKeywords(codebase, ['media', 'processing']);
    const issues = this.findIssuesByKeywords(codebase, ['media', 'process']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  private async analyzeMediaMetadataFeature(codebase: Codebase): Promise<FeatureImplementation> {
    const components = this.findComponentsByKeywords(codebase, ['media', 'metadata', 'info']);
    const tests = this.findTestsByKeywords(codebase, ['media', 'metadata']);
    const documentation = this.findDocumentationByKeywords(codebase, ['media', 'metadata']);
    const issues = this.findIssuesByKeywords(codebase, ['media', 'metadata']);

    return {
      isImplemented: components.length > 0,
      completeness: this.calculateCompleteness(components, tests, documentation),
      quality: this.assessQuality(components, tests, issues),
      components,
      tests,
      documentation,
      issues,
    };
  }

  // Helper Methods
  private findComponentsByKeywords(codebase: Codebase, keywords: string[]): string[] {
    const components: string[] = [];

    // Search in modules
    for (const module of codebase.modules) {
      if (this.matchesKeywords(module.name, keywords) || 
          this.matchesKeywords(module.path, keywords)) {
        components.push(module.path);
      }
    }

    // Search in React Native components
    for (const component of codebase.components) {
      if (this.matchesKeywords(component.name, keywords) || 
          this.matchesKeywords(component.path, keywords)) {
        components.push(component.path);
      }
    }

    return components;
  }

  private findTestsByKeywords(codebase: Codebase, keywords: string[]): TestInfo[] {
    const tests: TestInfo[] = [];

    // This is a simplified implementation
    // In reality, you would scan test files and analyze their content
    for (const module of codebase.modules) {
      if (module.testCoverage && module.testCoverage > 0) {
        if (this.matchesKeywords(module.name, keywords)) {
          tests.push({
            path: module.path.replace('.ts', '.spec.ts'),
            type: 'unit',
            coverage: module.testCoverage,
            passing: true,
            lastRun: new Date(),
          });
        }
      }
    }

    return tests;
  }

  private findDocumentationByKeywords(codebase: Codebase, keywords: string[]): DocumentationInfo {
    // This is a simplified implementation
    // In reality, you would scan documentation files
    const hasDocumentation = codebase.modules.some(module => 
      this.matchesKeywords(module.name, keywords)
    );

    return {
      exists: hasDocumentation,
      quality: hasDocumentation ? 'fair' : 'missing',
      completeness: hasDocumentation ? 50 : 0,
    };
  }

  private findIssuesByKeywords(codebase: Codebase, keywords: string[]): ImplementationIssue[] {
    const issues: ImplementationIssue[] = [];

    // This is a simplified implementation
    // In reality, you would analyze code quality, security issues, etc.
    for (const module of codebase.modules) {
      if (this.matchesKeywords(module.name, keywords)) {
        if (module.complexity > 10) {
          issues.push({
            type: 'maintainability',
            severity: 'medium',
            description: 'High complexity detected',
            file: module.path,
          });
        }

        if (module.isDeprecated) {
          issues.push({
            type: 'maintainability',
            severity: 'high',
            description: 'Uses deprecated patterns',
            file: module.path,
          });
        }
      }
    }

    return issues;
  }

  private matchesKeywords(text: string, keywords: string[]): boolean {
    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  }

  private calculateCompleteness(components: string[], tests: TestInfo[], documentation: DocumentationInfo): number {
    let completeness = 0;

    // Components weight: 50%
    if (components.length > 0) {
      completeness += 50;
    }

    // Tests weight: 30%
    if (tests.length > 0) {
      const avgCoverage = tests.reduce((sum, test) => sum + test.coverage, 0) / tests.length;
      completeness += (avgCoverage / 100) * 30;
    }

    // Documentation weight: 20%
    if (documentation.exists) {
      completeness += (documentation.completeness / 100) * 20;
    }

    return Math.round(completeness);
  }

  private assessQuality(components: string[], tests: TestInfo[], issues: ImplementationIssue[]): FeatureImplementation['quality'] {
    if (components.length === 0) return 'poor';

    let qualityScore = 100;

    // Deduct points for issues
    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical':
          qualityScore -= 30;
          break;
        case 'high':
          qualityScore -= 20;
          break;
        case 'medium':
          qualityScore -= 10;
          break;
        case 'low':
          qualityScore -= 5;
          break;
      }
    }

    // Deduct points for lack of tests
    if (tests.length === 0) {
      qualityScore -= 25;
    } else {
      const avgCoverage = tests.reduce((sum, test) => sum + test.coverage, 0) / tests.length;
      if (avgCoverage < 50) {
        qualityScore -= 15;
      }
    }

    if (qualityScore >= 90) return 'excellent';
    if (qualityScore >= 70) return 'good';
    if (qualityScore >= 50) return 'fair';
    return 'poor';
  }
}