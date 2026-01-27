import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  Logger,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  SemanticAnalysisService,
  ContentInjectionResult,
  PreferencePattern,
} from './semantic-analysis.service';

export class InjectContentDto {
  maxInjections?: number = 10;
}

export class AnalyzePreferencesDto {
  includeMetadata?: boolean = true;
}

@ApiTags('Semantic Analysis')
@ApiBearerAuth()
@Controller('semantic')
@UseGuards(JwtAuthGuard)
export class SemanticAnalysisController {
  private readonly logger = new Logger(SemanticAnalysisController.name);

  constructor(private semanticAnalysisService: SemanticAnalysisService) {}

  @Post('rooms/:roomId/inject-content')
  @ApiOperation({
    summary: 'Inyectar contenido semánticamente similar en una sala',
    description:
      'Analiza patrones de preferencias y añade contenido relevante cuando hay pocos matches',
  })
  @ApiResponse({
    status: 200,
    description: 'Contenido inyectado exitosamente',
    schema: {
      type: 'object',
      properties: {
        injectedContent: {
          type: 'array',
          items: { type: 'object' },
        },
        analysisMetadata: {
          type: 'object',
          properties: {
            patternsFound: { type: 'object' },
            totalPositiveVotes: { type: 'number' },
            injectionReason: { type: 'string' },
          },
        },
      },
    },
  })
  async injectSemanticContent(
    @Param('roomId') roomId: string,
    @Body() dto: InjectContentDto,
    @Request() req: any,
  ): Promise<ContentInjectionResult> {
    this.logger.log(
      `🎯 User ${req.user.sub} requesting content injection for room ${roomId}`,
    );

    // Verificar si la sala necesita inyección de contenido
    const shouldInject =
      await this.semanticAnalysisService.shouldInjectContent(roomId);

    if (!shouldInject) {
      this.logger.log(
        `❌ Room ${roomId} does not meet criteria for content injection`,
      );
      return {
        injectedContent: [],
        analysisMetadata: {
          patternsFound:
            await this.semanticAnalysisService.analyzePreferencePatterns(
              roomId,
            ),
          totalPositiveVotes: 0,
          injectionReason:
            'Room does not meet injection criteria (sufficient recent matches or insufficient voting data)',
        },
      };
    }

    return this.semanticAnalysisService.injectSemanticContent(
      roomId,
      dto.maxInjections,
    );
  }

  @Get('rooms/:roomId/preferences')
  @ApiOperation({
    summary: 'Analizar patrones de preferencias de una sala',
    description:
      'Obtiene análisis detallado de los patrones de votación positiva de los miembros',
  })
  @ApiResponse({
    status: 200,
    description: 'Patrones de preferencias analizados',
    schema: {
      type: 'object',
      properties: {
        genres: { type: 'object' },
        averageRating: { type: 'number' },
        popularityRange: {
          type: 'object',
          properties: {
            min: { type: 'number' },
            max: { type: 'number' },
          },
        },
        releaseYearRange: {
          type: 'object',
          properties: {
            min: { type: 'number' },
            max: { type: 'number' },
          },
        },
        commonKeywords: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  async analyzePreferences(
    @Param('roomId') roomId: string,
    @Query() dto: AnalyzePreferencesDto,
    @Request() req: any,
  ): Promise<PreferencePattern> {
    this.logger.log(
      `📊 User ${req.user.sub} analyzing preferences for room ${roomId}`,
    );

    return this.semanticAnalysisService.analyzePreferencePatterns(roomId);
  }

  @Get('rooms/:roomId/injection-status')
  @ApiOperation({
    summary: 'Verificar si una sala necesita inyección de contenido',
    description:
      'Evalúa criterios para determinar si se debe inyectar contenido semántico',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de inyección evaluado',
    schema: {
      type: 'object',
      properties: {
        shouldInject: { type: 'boolean' },
        reason: { type: 'string' },
        metrics: {
          type: 'object',
          properties: {
            recentMatches: { type: 'number' },
            totalVotes: { type: 'number' },
            matchRatio: { type: 'number' },
          },
        },
      },
    },
  })
  async getInjectionStatus(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ) {
    this.logger.log(
      `🔍 User ${req.user.sub} checking injection status for room ${roomId}`,
    );

    const shouldInject =
      await this.semanticAnalysisService.shouldInjectContent(roomId);

    return {
      shouldInject,
      reason: shouldInject
        ? 'Room meets criteria for semantic content injection'
        : 'Room has sufficient matches or insufficient voting data',
      metrics: {
        recentMatches: 0, // TODO: Implementar métricas reales
        totalVotes: 0,
        matchRatio: 0,
      },
    };
  }

  @Post('rooms/:roomId/force-inject')
  @ApiOperation({
    summary: 'Forzar inyección de contenido (solo para testing/admin)',
    description:
      'Inyecta contenido semántico sin verificar criterios automáticos',
  })
  @ApiResponse({
    status: 200,
    description: 'Inyección forzada completada',
  })
  async forceInjectContent(
    @Param('roomId') roomId: string,
    @Body() dto: InjectContentDto,
    @Request() req: any,
  ): Promise<ContentInjectionResult> {
    this.logger.log(
      `⚡ User ${req.user.sub} forcing content injection for room ${roomId}`,
    );

    return this.semanticAnalysisService.injectSemanticContent(
      roomId,
      dto.maxInjections,
    );
  }
}
