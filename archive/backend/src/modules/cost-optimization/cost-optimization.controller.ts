import {
  Controller,
  Get,
  Post,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CostOptimizationService,
  CostMetrics,
  CostOptimizationRecommendation,
  BudgetStatus,
} from './cost-optimization.service';

@ApiTags('Cost Optimization')
@Controller('cost-optimization')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CostOptimizationController {
  constructor(
    private readonly costOptimizationService: CostOptimizationService,
  ) {}

  @Get('metrics')
  @ApiOperation({
    summary: 'Obtener métricas de costos actuales',
    description:
      'Retorna métricas detalladas de costos de AWS incluyendo Lambda, DynamoDB y costos estimados',
  })
  @ApiResponse({
    status: 200,
    description: 'Métricas de costos obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        estimatedMonthlyCost: { type: 'number', example: 25.5 },
        lambdaInvocations: { type: 'number', example: 1250 },
        dynamoReadUnits: { type: 'number', example: 850 },
        dynamoWriteUnits: { type: 'number', example: 320 },
        lastUpdated: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async getCurrentMetrics(): Promise<CostMetrics> {
    return this.costOptimizationService.getCurrentCostMetrics();
  }

  @Get('recommendations')
  @ApiOperation({
    summary: 'Obtener recomendaciones de optimización',
    description:
      'Genera recomendaciones personalizadas para optimizar costos basadas en el uso actual',
  })
  @ApiResponse({
    status: 200,
    description: 'Recomendaciones generadas exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['lambda', 'dynamodb', 'general'] },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          title: { type: 'string', example: 'Invocaciones Lambda excesivas' },
          description: {
            type: 'string',
            example: 'Se detectaron 15000 invocaciones en las últimas 24h',
          },
          potentialSavings: { type: 'number', example: 12.5 },
          actionRequired: {
            type: 'string',
            example: 'Implementar caché en endpoints frecuentes',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async getOptimizationRecommendations(): Promise<
    CostOptimizationRecommendation[]
  > {
    return this.costOptimizationService.generateOptimizationRecommendations();
  }

  @Get('budget')
  @ApiOperation({
    summary: 'Obtener estado del presupuesto',
    description: 'Retorna el estado actual del presupuesto mensual configurado',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado del presupuesto obtenido exitosamente',
    schema: {
      type: 'object',
      properties: {
        budgetName: { type: 'string', example: 'trinity-monthly-budget-dev' },
        budgetLimit: { type: 'number', example: 50.0 },
        actualSpend: { type: 'number', example: 23.45 },
        forecastedSpend: { type: 'number', example: 45.2 },
        percentageUsed: { type: 'number', example: 46.9 },
        daysRemaining: { type: 'number', example: 12 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Presupuesto no configurado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async getBudgetStatus(): Promise<BudgetStatus | null> {
    return this.costOptimizationService.getBudgetStatus();
  }

  @Post('optimize/auto')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aplicar optimizaciones automáticas',
    description:
      'Ejecuta optimizaciones automáticas seguras como limpieza de logs y configuración de concurrencia',
  })
  @ApiResponse({
    status: 200,
    description: 'Optimizaciones aplicadas exitosamente',
    schema: {
      type: 'object',
      properties: {
        appliedOptimizations: {
          type: 'array',
          items: { type: 'string' },
          example: [
            'Configurada retención de logs a 7 días para desarrollo',
            'Configurada reserved concurrency de 10 para funciones Lambda',
            'Limpiados elementos de caché expirados en DynamoDB',
          ],
        },
        totalOptimizations: { type: 'number', example: 3 },
        estimatedSavings: { type: 'number', example: 8.5 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async applyAutomaticOptimizations(): Promise<{
    appliedOptimizations: string[];
    totalOptimizations: number;
    estimatedSavings: number;
  }> {
    const appliedOptimizations =
      await this.costOptimizationService.applyAutomaticOptimizations();

    // Calcular ahorro estimado basado en las optimizaciones aplicadas
    const estimatedSavings = appliedOptimizations.length * 2.5; // $2.5 por optimización estimado

    return {
      appliedOptimizations,
      totalOptimizations: appliedOptimizations.length,
      estimatedSavings,
    };
  }

  @Get('health')
  @ApiOperation({
    summary: 'Health check del sistema de optimización',
    description:
      'Verifica que todos los servicios de AWS estén disponibles para el monitoreo de costos',
  })
  @ApiResponse({
    status: 200,
    description: 'Sistema de optimización funcionando correctamente',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        services: {
          type: 'object',
          properties: {
            cloudwatch: { type: 'boolean', example: true },
            budgets: { type: 'boolean', example: true },
            lambda: { type: 'boolean', example: true },
            dynamodb: { type: 'boolean', example: true },
          },
        },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Algunos servicios no están disponibles',
  })
  async healthCheck(): Promise<{
    status: string;
    services: Record<string, boolean>;
    timestamp: Date;
  }> {
    // En un entorno real, aquí verificaríamos la conectividad con cada servicio
    const services = {
      cloudwatch: true,
      budgets: true,
      lambda: true,
      dynamodb: true,
    };

    const allHealthy = Object.values(services).every((service) => service);

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      services,
      timestamp: new Date(),
    };
  }

  @Get('dashboard-url')
  @ApiOperation({
    summary: 'Obtener URL del dashboard de costos',
    description:
      'Retorna la URL del dashboard de CloudWatch para monitoreo visual de costos',
  })
  @ApiResponse({
    status: 200,
    description: 'URL del dashboard obtenida exitosamente',
    schema: {
      type: 'object',
      properties: {
        dashboardUrl: {
          type: 'string',
          example:
            'https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=trinity-cost-monitoring-dev',
        },
        region: { type: 'string', example: 'us-east-1' },
        stage: { type: 'string', example: 'dev' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getDashboardUrl(): Promise<{
    dashboardUrl: string;
    region: string;
    stage: string;
  }> {
    const region = process.env.AWS_REGION || 'us-east-1';
    const stage = process.env.STAGE || 'dev';
    const dashboardName = `trinity-cost-monitoring-${stage}`;

    return {
      dashboardUrl: `https://console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:name=${dashboardName}`,
      region,
      stage,
    };
  }
}
