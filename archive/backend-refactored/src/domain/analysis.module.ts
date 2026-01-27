/**
 * Analysis Module
 * Domain module for the Analysis Engine
 */

import { Module } from '@nestjs/common';
import { AnalysisEngineService } from './services/analysis-engine.service';
import { RepositoryScannerAdapter } from '../infrastructure/adapters/repository-scanner.adapter';
import { ReactNativeScannerAdapter } from '../infrastructure/adapters/react-native-scanner.adapter';
import { InfrastructureAnalyzerAdapter } from '../infrastructure/adapters/infrastructure-analyzer.adapter';
import { FeatureExtractorAdapter } from '../infrastructure/adapters/feature-extractor.adapter';
import { ObsoleteComponentDetectorAdapter } from '../infrastructure/adapters/obsolete-component-detector.adapter';
import {
  IAnalysisEngine,
  IRepositoryScanner,
  IReactNativeScanner,
  IInfrastructureAnalyzer,
  IFeatureExtractor,
  IObsoleteComponentDetector,
} from './services/analysis-engine.interface';

@Module({
  providers: [
    // Core Analysis Engine Service
    {
      provide: 'IAnalysisEngine',
      useClass: AnalysisEngineService,
    },
    
    // Infrastructure Adapters
    {
      provide: 'IRepositoryScanner',
      useClass: RepositoryScannerAdapter,
    },
    {
      provide: 'IReactNativeScanner',
      useClass: ReactNativeScannerAdapter,
    },
    {
      provide: 'IInfrastructureAnalyzer',
      useClass: InfrastructureAnalyzerAdapter,
    },
    {
      provide: 'IFeatureExtractor',
      useClass: FeatureExtractorAdapter,
    },
    {
      provide: 'IObsoleteComponentDetector',
      useClass: ObsoleteComponentDetectorAdapter,
    },

    // Concrete implementations for injection
    AnalysisEngineService,
    RepositoryScannerAdapter,
    ReactNativeScannerAdapter,
    InfrastructureAnalyzerAdapter,
    FeatureExtractorAdapter,
    ObsoleteComponentDetectorAdapter,
  ],
  exports: [
    'IAnalysisEngine',
    'IRepositoryScanner',
    'IReactNativeScanner',
    'IInfrastructureAnalyzer',
    'IFeatureExtractor',
    'IObsoleteComponentDetector',
    AnalysisEngineService,
  ],
})
export class AnalysisModule {}