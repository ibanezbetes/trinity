/**
 * Analyze System Use Case
 * Application layer use case for performing comprehensive system analysis
 */

import { Injectable } from '@nestjs/common';
import { IAnalysisEngine, SystemAnalysis } from '../../domain/services/analysis-engine.interface';

export interface AnalyzeSystemRequest {
  rootPath: string;
  includeInfrastructure?: boolean;
  includeObsoleteComponents?: boolean;
}

export interface AnalyzeSystemResponse {
  analysis: SystemAnalysis;
  summary: {
    totalModules: number;
    totalFeatures: number;
    obsoleteComponentsCount: number;
    estimatedSavings: number;
  };
}

@Injectable()
export class AnalyzeSystemUseCase {
  constructor(private readonly analysisEngine: IAnalysisEngine) {}

  async execute(request: AnalyzeSystemRequest): Promise<AnalyzeSystemResponse> {
    // Perform comprehensive system analysis
    const analysis = await this.analysisEngine.analyzeSystem(request.rootPath);

    // Generate summary
    const summary = {
      totalModules: analysis.repository.modules.length,
      totalFeatures: analysis.features.features.length,
      obsoleteComponentsCount: analysis.obsoleteComponents.components.length,
      estimatedSavings: analysis.obsoleteComponents.potentialSavings.cost,
    };

    return {
      analysis,
      summary,
    };
  }
}