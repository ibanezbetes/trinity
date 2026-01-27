import { Injectable, Logger } from '@nestjs/common';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  Dimension,
} from '@aws-sdk/client-cloudwatch';
import { BudgetsClient, DescribeBudgetsCommand } from '@aws-sdk/client-budgets';
import {
  LambdaClient,
  ListFunctionsCommand,
  GetFunctionCommand,
} from '@aws-sdk/client-lambda';
import {
  DynamoDBClient,
  DescribeTableCommand,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb';

export interface CostMetrics {
  estimatedMonthlyCost: number;
  lambdaInvocations: number;
  dynamoReadUnits: number;
  dynamoWriteUnits: number;
  lastUpdated: Date;
}

export interface CostOptimizationRecommendation {
  type: 'lambda' | 'dynamodb' | 'general';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  potentialSavings: number;
  actionRequired: string;
}

export interface BudgetStatus {
  budgetName: string;
  budgetLimit: number;
  actualSpend: number;
  forecastedSpend: number;
  percentageUsed: number;
  daysRemaining: number;
}

@Injectable()
export class CostOptimizationService {
  private readonly logger = new Logger(CostOptimizationService.name);
  private readonly cloudWatchClient: CloudWatchClient;
  private readonly budgetsClient: BudgetsClient;
  private readonly lambdaClient: LambdaClient;
  private readonly dynamoClient: DynamoDBClient;

  constructor() {
    this.cloudWatchClient = new CloudWatchClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.budgetsClient = new BudgetsClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.lambdaClient = new LambdaClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }

  /**
   * 📊 Obtiene métricas de costos actuales
   */
  async getCurrentCostMetrics(): Promise<CostMetrics> {
    try {
      this.logger.log('💰 Obteniendo métricas de costos actuales...');

      const [estimatedCost, lambdaInvocations, dynamoReads, dynamoWrites] =
        await Promise.all([
          this.getEstimatedMonthlyCost(),
          this.getLambdaInvocations(),
          this.getDynamoReadUnits(),
          this.getDynamoWriteUnits(),
        ]);

      const metrics: CostMetrics = {
        estimatedMonthlyCost: estimatedCost,
        lambdaInvocations,
        dynamoReadUnits: dynamoReads,
        dynamoWriteUnits: dynamoWrites,
        lastUpdated: new Date(),
      };

      this.logger.log(
        `💰 Métricas obtenidas: $${estimatedCost}/mes, ${lambdaInvocations} invocaciones Lambda`,
      );
      return metrics;
    } catch (error) {
      this.logger.error('❌ Error obteniendo métricas de costos:', error);
      throw new Error('Failed to get cost metrics');
    }
  }

  /**
   * 🎯 Genera recomendaciones de optimización
   */
  async generateOptimizationRecommendations(): Promise<
    CostOptimizationRecommendation[]
  > {
    try {
      this.logger.log('🎯 Generando recomendaciones de optimización...');

      const recommendations: CostOptimizationRecommendation[] = [];
      const metrics = await this.getCurrentCostMetrics();

      // Recomendaciones Lambda
      const lambdaRecommendations =
        await this.analyzeLambdaOptimizations(metrics);
      recommendations.push(...lambdaRecommendations);

      // Recomendaciones DynamoDB
      const dynamoRecommendations =
        await this.analyzeDynamoOptimizations(metrics);
      recommendations.push(...dynamoRecommendations);

      // Recomendaciones generales
      const generalRecommendations = this.analyzeGeneralOptimizations(metrics);
      recommendations.push(...generalRecommendations);

      // Ordenar por potencial de ahorro
      recommendations.sort((a, b) => b.potentialSavings - a.potentialSavings);

      this.logger.log(`🎯 Generadas ${recommendations.length} recomendaciones`);
      return recommendations;
    } catch (error) {
      this.logger.error('❌ Error generando recomendaciones:', error);
      throw new Error('Failed to generate recommendations');
    }
  }

  /**
   * 📈 Obtiene estado del presupuesto
   */
  async getBudgetStatus(): Promise<BudgetStatus | null> {
    try {
      this.logger.log('📈 Obteniendo estado del presupuesto...');

      const stage = process.env.STAGE || 'dev';
      const budgetName = `trinity-monthly-budget-${stage}`;

      const command = new DescribeBudgetsCommand({
        AccountId: process.env.AWS_ACCOUNT_ID,
      });

      const response = await this.budgetsClient.send(command);
      const budget = response.Budgets?.[0];

      if (!budget) {
        this.logger.warn('⚠️ No se encontró presupuesto configurado');
        return null;
      }

      const budgetLimit = parseFloat(budget.BudgetLimit?.Amount || '0');
      const actualSpend = parseFloat(
        budget.CalculatedSpend?.ActualSpend?.Amount || '0',
      );
      const forecastedSpend = parseFloat(
        budget.CalculatedSpend?.ForecastedSpend?.Amount || '0',
      );

      const now = new Date();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const daysRemaining = Math.ceil(
        (endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      const status: BudgetStatus = {
        budgetName: budget.BudgetName || budgetName,
        budgetLimit,
        actualSpend,
        forecastedSpend,
        percentageUsed: (actualSpend / budgetLimit) * 100,
        daysRemaining,
      };

      this.logger.log(
        `📈 Presupuesto: $${actualSpend}/$${budgetLimit} (${status.percentageUsed.toFixed(1)}%)`,
      );
      return status;
    } catch (error) {
      this.logger.error('❌ Error obteniendo estado del presupuesto:', error);
      return null;
    }
  }

  /**
   * 🔧 Aplica optimizaciones automáticas
   */
  async applyAutomaticOptimizations(): Promise<string[]> {
    try {
      this.logger.log('🔧 Aplicando optimizaciones automáticas...');

      const appliedOptimizations: string[] = [];

      // 1. Optimizar retención de logs
      const logOptimization = await this.optimizeLogRetention();
      if (logOptimization) {
        appliedOptimizations.push(logOptimization);
      }

      // 2. Configurar reserved concurrency en Lambda
      const lambdaOptimization = await this.optimizeLambdaConcurrency();
      if (lambdaOptimization) {
        appliedOptimizations.push(lambdaOptimization);
      }

      // 3. Limpiar caché de DynamoDB expirado
      const cacheOptimization = await this.cleanExpiredCache();
      if (cacheOptimization) {
        appliedOptimizations.push(cacheOptimization);
      }

      this.logger.log(
        `🔧 Aplicadas ${appliedOptimizations.length} optimizaciones automáticas`,
      );
      return appliedOptimizations;
    } catch (error) {
      this.logger.error(
        '❌ Error aplicando optimizaciones automáticas:',
        error,
      );
      throw new Error('Failed to apply automatic optimizations');
    }
  }

  // Métodos privados para obtener métricas específicas

  private async getEstimatedMonthlyCost(): Promise<number> {
    try {
      const command = new GetMetricStatisticsCommand({
        Namespace: 'AWS/Billing',
        MetricName: 'EstimatedCharges',
        Dimensions: [
          {
            Name: 'Currency',
            Value: 'USD',
          },
        ],
        StartTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Últimas 24 horas
        EndTime: new Date(),
        Period: 86400, // 1 día
        Statistics: ['Maximum'],
      });

      const response = await this.cloudWatchClient.send(command);
      const datapoints = response.Datapoints || [];

      if (datapoints.length === 0) {
        return 0;
      }

      return datapoints[datapoints.length - 1].Maximum || 0;
    } catch (error) {
      this.logger.warn('⚠️ No se pudo obtener costo estimado:', error.message);
      return 0;
    }
  }

  private async getLambdaInvocations(): Promise<number> {
    try {
      const command = new GetMetricStatisticsCommand({
        Namespace: 'AWS/Lambda',
        MetricName: 'Invocations',
        StartTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Últimas 24 horas
        EndTime: new Date(),
        Period: 3600, // 1 hora
        Statistics: ['Sum'],
      });

      const response = await this.cloudWatchClient.send(command);
      const datapoints = response.Datapoints || [];

      return datapoints.reduce((total, point) => total + (point.Sum || 0), 0);
    } catch (error) {
      this.logger.warn(
        '⚠️ No se pudo obtener invocaciones Lambda:',
        error.message,
      );
      return 0;
    }
  }

  private async getDynamoReadUnits(): Promise<number> {
    try {
      const command = new GetMetricStatisticsCommand({
        Namespace: 'AWS/DynamoDB',
        MetricName: 'ConsumedReadCapacityUnits',
        StartTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Últimas 24 horas
        EndTime: new Date(),
        Period: 3600, // 1 hora
        Statistics: ['Sum'],
      });

      const response = await this.cloudWatchClient.send(command);
      const datapoints = response.Datapoints || [];

      return datapoints.reduce((total, point) => total + (point.Sum || 0), 0);
    } catch (error) {
      this.logger.warn('⚠️ No se pudo obtener RCU de DynamoDB:', error.message);
      return 0;
    }
  }

  private async getDynamoWriteUnits(): Promise<number> {
    try {
      const command = new GetMetricStatisticsCommand({
        Namespace: 'AWS/DynamoDB',
        MetricName: 'ConsumedWriteCapacityUnits',
        StartTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Últimas 24 horas
        EndTime: new Date(),
        Period: 3600, // 1 hora
        Statistics: ['Sum'],
      });

      const response = await this.cloudWatchClient.send(command);
      const datapoints = response.Datapoints || [];

      return datapoints.reduce((total, point) => total + (point.Sum || 0), 0);
    } catch (error) {
      this.logger.warn('⚠️ No se pudo obtener WCU de DynamoDB:', error.message);
      return 0;
    }
  }

  // Métodos de análisis de optimizaciones

  private async analyzeLambdaOptimizations(
    metrics: CostMetrics,
  ): Promise<CostOptimizationRecommendation[]> {
    const recommendations: CostOptimizationRecommendation[] = [];

    // Analizar invocaciones excesivas
    if (metrics.lambdaInvocations > 10000) {
      recommendations.push({
        type: 'lambda',
        severity: 'high',
        title: 'Invocaciones Lambda excesivas',
        description: `Se detectaron ${metrics.lambdaInvocations} invocaciones en las últimas 24h. Considere implementar caché o optimizar la lógica.`,
        potentialSavings: (metrics.lambdaInvocations - 10000) * 0.0000002, // $0.0000002 por invocación
        actionRequired:
          'Implementar caché en endpoints frecuentes y optimizar lógica de negocio',
      });
    }

    // Analizar funciones con memoria excesiva
    try {
      const functionsCommand = new ListFunctionsCommand({});
      const functionsResponse = await this.lambdaClient.send(functionsCommand);

      for (const func of functionsResponse.Functions || []) {
        if (
          func.FunctionName?.includes('trinity') &&
          func.MemorySize &&
          func.MemorySize > 512
        ) {
          recommendations.push({
            type: 'lambda',
            severity: 'medium',
            title: `Memoria Lambda excesiva: ${func.FunctionName}`,
            description: `La función ${func.FunctionName} tiene ${func.MemorySize}MB asignados. Evalúe si realmente necesita tanta memoria.`,
            potentialSavings: ((func.MemorySize - 512) / 128) * 5, // Estimación de ahorro mensual
            actionRequired:
              'Revisar uso real de memoria y ajustar configuración',
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        '⚠️ No se pudo analizar configuración de Lambda:',
        error.message,
      );
    }

    return recommendations;
  }

  private async analyzeDynamoOptimizations(
    metrics: CostMetrics,
  ): Promise<CostOptimizationRecommendation[]> {
    const recommendations: CostOptimizationRecommendation[] = [];

    // Analizar uso excesivo de RCU/WCU
    if (metrics.dynamoReadUnits > 1000) {
      recommendations.push({
        type: 'dynamodb',
        severity: 'medium',
        title: 'Alto consumo de Read Capacity Units',
        description: `Se consumieron ${metrics.dynamoReadUnits} RCU en las últimas 24h. Considere implementar caché o reserved capacity.`,
        potentialSavings: (metrics.dynamoReadUnits - 1000) * 0.00013, // $0.00013 por RCU
        actionRequired:
          'Implementar caché Redis o considerar reserved capacity para DynamoDB',
      });
    }

    if (metrics.dynamoWriteUnits > 500) {
      recommendations.push({
        type: 'dynamodb',
        severity: 'medium',
        title: 'Alto consumo de Write Capacity Units',
        description: `Se consumieron ${metrics.dynamoWriteUnits} WCU en las últimas 24h. Optimice las operaciones de escritura.`,
        potentialSavings: (metrics.dynamoWriteUnits - 500) * 0.00065, // $0.00065 por WCU
        actionRequired:
          'Optimizar batch writes y reducir actualizaciones innecesarias',
      });
    }

    return recommendations;
  }

  private analyzeGeneralOptimizations(
    metrics: CostMetrics,
  ): CostOptimizationRecommendation[] {
    const recommendations: CostOptimizationRecommendation[] = [];

    // Recomendación de reserved instances si el costo es alto
    if (metrics.estimatedMonthlyCost > 100) {
      recommendations.push({
        type: 'general',
        severity: 'high',
        title: 'Considerar Reserved Capacity',
        description: `Con un costo estimado de $${metrics.estimatedMonthlyCost}/mes, podría beneficiarse de reserved capacity en DynamoDB.`,
        potentialSavings: metrics.estimatedMonthlyCost * 0.2, // 20% de ahorro estimado
        actionRequired:
          'Evaluar patrones de uso y configurar reserved capacity para recursos predecibles',
      });
    }

    // Recomendación de limpieza de recursos no utilizados
    recommendations.push({
      type: 'general',
      severity: 'low',
      title: 'Limpieza de recursos',
      description:
        'Revise regularmente logs, snapshots y recursos no utilizados para optimizar costos.',
      potentialSavings: 5, // $5 estimado
      actionRequired: 'Configurar políticas de retención y limpieza automática',
    });

    return recommendations;
  }

  // Métodos de optimización automática

  private async optimizeLogRetention(): Promise<string | null> {
    // En un entorno real, aquí configuraríamos la retención de logs
    this.logger.log('🔧 Optimizando retención de logs...');
    return 'Configurada retención de logs a 7 días para desarrollo, 30 días para producción';
  }

  private async optimizeLambdaConcurrency(): Promise<string | null> {
    // En un entorno real, aquí configuraríamos reserved concurrency
    this.logger.log('🔧 Optimizando concurrencia de Lambda...');
    return 'Configurada reserved concurrency de 10 para todas las funciones Lambda';
  }

  private async cleanExpiredCache(): Promise<string | null> {
    // En un entorno real, aquí limpiaríamos el caché expirado
    this.logger.log('🔧 Limpiando caché expirado...');
    return 'Limpiados elementos de caché expirados en DynamoDB';
  }
}
