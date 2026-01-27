/**
 * Analysis Controller
 * REST API controller for the Analysis Engine
 */

import { Controller, Get, Post, Body, Param, Logger, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { IAnalysisEngine } from '../../domain/services/analysis-engine.interface';
import {
  RepositoryAnalysis,
  ReactNativeAnalysis,
  InfrastructureAnalysis,
  SystemAnalysis,
  FeatureMap,
  ObsoleteComponents,
} from '../../domain/entities/analysis.entity';

export class AnalyzeRepositoryDto {
  path: string;
}

export class AnalyzeInfrastructureDto {
  cdkPath: string;
}

export class AnalyzeSystemDto {
  projectPath: string;
}

export class AnalyzeReactNativeDto {
  path: string;
}

@Controller('analysis')
export class AnalysisController {
  private readonly logger = new Logger(AnalysisController.name);

  constructor(@Inject('IAnalysisEngine') private readonly analysisEngine: IAnalysisEngine) {}

  @Post('repository')
  async analyzeRepository(@Body() dto: AnalyzeRepositoryDto): Promise<RepositoryAnalysis> {
    this.logger.log(`Analyzing repository at path: ${dto.path}`);

    try {
      const analysis = await this.analysisEngine.scanRepository(dto.path);
      this.logger.log(`Repository analysis completed for: ${dto.path}`);
      return analysis;
    } catch (error) {
      this.logger.error(`Repository analysis failed: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to analyze repository: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('infrastructure')
  async analyzeInfrastructure(@Body() dto: AnalyzeInfrastructureDto): Promise<InfrastructureAnalysis> {
    this.logger.log(`Analyzing infrastructure at path: ${dto.cdkPath}`);

    try {
      const analysis = await this.analysisEngine.analyzeInfrastructure(dto.cdkPath);
      this.logger.log(`Infrastructure analysis completed for: ${dto.cdkPath}`);
      return analysis;
    } catch (error) {
      this.logger.error(`Infrastructure analysis failed: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to analyze infrastructure: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('react-native')
  async analyzeReactNative(@Body() dto: AnalyzeReactNativeDto): Promise<ReactNativeAnalysis> {
    this.logger.log(`Analyzing React Native app at path: ${dto.path}`);

    try {
      const analysis = await this.analysisEngine.analyzeReactNativeApp(dto.path);
      this.logger.log(`React Native analysis completed for: ${dto.path}`);
      return analysis;
    } catch (error) {
      this.logger.error(`React Native analysis failed: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to analyze React Native app: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('system')
  async analyzeSystem(@Body() dto: AnalyzeSystemDto): Promise<SystemAnalysis> {
    this.logger.log(`Analyzing complete system at path: ${dto.projectPath}`);

    try {
      const analysis = await this.analysisEngine.analyzeSystem(dto.projectPath);
      this.logger.log(`System analysis completed for: ${dto.projectPath}`);
      return analysis;
    } catch (error) {
      this.logger.error(`System analysis failed: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to analyze system: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('health')
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('capabilities')
  async getCapabilities(): Promise<{
    features: string[];
    supportedFileTypes: string[];
    supportedFrameworks: string[];
  }> {
    return {
      features: [
        'Repository Analysis',
        'Infrastructure Analysis',
        'React Native Analysis',
        'Feature Extraction',
        'Obsolete Component Detection',
        'System Analysis',
      ],
      supportedFileTypes: [
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.json',
        '.yml',
        '.yaml',
        '.md',
        'Dockerfile',
      ],
      supportedFrameworks: [
        'NestJS',
        'React Native',
        'Expo',
        'AWS CDK',
        'TypeScript',
        'JavaScript',
      ],
    };
  }
}