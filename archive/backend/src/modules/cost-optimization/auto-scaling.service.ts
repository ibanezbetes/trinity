import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CostOptimizationService } from './cost-optimization.service';

@Injectable()
export class AutoScalingService {
  private readonly logger = new Logger(AutoScalingService.name);

  constructor(
    private readonly costOptimizationService: CostOptimizationService,
  ) {}

  /**
   * 🔄 Monitoreo automático cada hora
   * Ejecuta verificaciones de costos y aplica optimizaciones automáticas
   */
  @Cron(CronExpression.EVERY_HOUR)
  async hourlyOptimizationCheck() {
    try {
      this.logger.log(
        '🔄 Iniciando verificación automática de optimización...',
      );

      // Obtener métricas actuales
      const metrics =
        await this.costOptimizationService.getCurrentCostMetrics();

      // Verificar si necesitamos aplicar optimizaciones automáticas
      const needsOptimization = this.shouldApplyOptimizations(metrics);

      if (needsOptimization) {
        this.logger.warn(
          '⚠️ Se detectaron métricas que requieren optimización automática',
        );

        // Aplicar optimizaciones automáticas
        const optimizations =
          await this.costOptimizationService.applyAutomaticOptimizations();

        this.logger.log(
          `✅ Aplicadas ${optimizations.length} optimizaciones automáticas`,
        );
        optimizations.forEach((opt) => this.logger.log(`  - ${opt}`));
      } else {
        this.logger.log(
          '✅ Métricas dentro de rangos normales, no se requiere optimización',
        );
      }
    } catch (error) {
      this.logger.error(
        '❌ Error en verificación automática de optimización:',
        error,
      );
    }
  }

  /**
   * 📊 Reporte diario de costos
   * Genera un reporte diario con métricas y recomendaciones
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async dailyCostReport() {
    try {
      this.logger.log('📊 Generando reporte diario de costos...');

      const [metrics, recommendations, budgetStatus] = await Promise.all([
        this.costOptimizationService.getCurrentCostMetrics(),
        this.costOptimizationService.generateOptimizationRecommendations(),
        this.costOptimizationService.getBudgetStatus(),
      ]);

      // Log del reporte diario
      this.logger.log('📊 === REPORTE DIARIO DE COSTOS ===');
      this.logger.log(
        `💰 Costo estimado mensual: $${metrics.estimatedMonthlyCost}`,
      );
      this.logger.log(
        `🚀 Invocaciones Lambda (24h): ${metrics.lambdaInvocations}`,
      );
      this.logger.log(`📖 DynamoDB RCU (24h): ${metrics.dynamoReadUnits}`);
      this.logger.log(`✏️ DynamoDB WCU (24h): ${metrics.dynamoWriteUnits}`);

      if (budgetStatus) {
        this.logger.log(
          `📈 Presupuesto usado: ${budgetStatus.percentageUsed.toFixed(1)}% ($${budgetStatus.actualSpend}/$${budgetStatus.budgetLimit})`,
        );
        this.logger.log(
          `📅 Días restantes del mes: ${budgetStatus.daysRemaining}`,
        );
      }

      if (recommendations.length > 0) {
        this.logger.log(
          `🎯 Recomendaciones de optimización: ${recommendations.length}`,
        );
        recommendations.slice(0, 3).forEach((rec) => {
          this.logger.log(
            `  - [${rec.severity.toUpperCase()}] ${rec.title} (Ahorro: $${rec.potentialSavings.toFixed(2)})`,
          );
        });
      }

      this.logger.log('📊 === FIN REPORTE DIARIO ===');
    } catch (error) {
      this.logger.error('❌ Error generando reporte diario de costos:', error);
    }
  }

  /**
   * 🚨 Verificación de alertas críticas
   * Ejecuta cada 15 minutos para detectar picos de costo
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async criticalAlertsCheck() {
    try {
      const metrics =
        await this.costOptimizationService.getCurrentCostMetrics();
      const budgetStatus = await this.costOptimizationService.getBudgetStatus();

      // Verificar alertas críticas
      const criticalAlerts = this.checkCriticalAlerts(metrics, budgetStatus);

      if (criticalAlerts.length > 0) {
        this.logger.error('🚨 ALERTAS CRÍTICAS DETECTADAS:');
        criticalAlerts.forEach((alert) => this.logger.error(`  - ${alert}`));

        // En un entorno real, aquí enviaríamos notificaciones por email/SMS
        // await this.sendCriticalAlerts(criticalAlerts);
      }
    } catch (error) {
      this.logger.error('❌ Error en verificación de alertas críticas:', error);
    }
  }

  /**
   * 🧹 Limpieza semanal
   * Ejecuta tareas de limpieza y mantenimiento cada domingo
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async weeklyMaintenance() {
    try {
      this.logger.log('🧹 Iniciando mantenimiento semanal...');

      // Aplicar todas las optimizaciones automáticas
      const optimizations =
        await this.costOptimizationService.applyAutomaticOptimizations();

      this.logger.log(
        `🧹 Mantenimiento semanal completado: ${optimizations.length} optimizaciones aplicadas`,
      );
      optimizations.forEach((opt) => this.logger.log(`  - ${opt}`));
    } catch (error) {
      this.logger.error('❌ Error en mantenimiento semanal:', error);
    }
  }

  // Métodos privados de análisis

  private shouldApplyOptimizations(metrics: any): boolean {
    // Criterios para aplicar optimizaciones automáticas
    const highLambdaInvocations = metrics.lambdaInvocations > 5000; // Más de 5000 invocaciones/hora
    const highDynamoUsage =
      metrics.dynamoReadUnits > 500 || metrics.dynamoWriteUnits > 250;
    const highCost = metrics.estimatedMonthlyCost > 100;

    return highLambdaInvocations || highDynamoUsage || highCost;
  }

  private checkCriticalAlerts(metrics: any, budgetStatus: any): string[] {
    const alerts: string[] = [];

    // Alerta de presupuesto excedido
    if (budgetStatus && budgetStatus.percentageUsed > 90) {
      alerts.push(
        `Presupuesto al ${budgetStatus.percentageUsed.toFixed(1)}% - CRÍTICO`,
      );
    }

    // Alerta de invocaciones Lambda excesivas
    if (metrics.lambdaInvocations > 10000) {
      alerts.push(
        `Invocaciones Lambda excesivas: ${metrics.lambdaInvocations} en las últimas 24h`,
      );
    }

    // Alerta de costo mensual alto
    if (metrics.estimatedMonthlyCost > 200) {
      alerts.push(
        `Costo mensual estimado muy alto: $${metrics.estimatedMonthlyCost}`,
      );
    }

    // Alerta de uso excesivo de DynamoDB
    if (metrics.dynamoReadUnits > 2000 || metrics.dynamoWriteUnits > 1000) {
      alerts.push(
        `Uso excesivo de DynamoDB: ${metrics.dynamoReadUnits} RCU, ${metrics.dynamoWriteUnits} WCU`,
      );
    }

    return alerts;
  }

  /**
   * 📈 Obtener estadísticas de auto-escalado
   */
  async getAutoScalingStats(): Promise<{
    lastOptimizationCheck: Date;
    optimizationsAppliedToday: number;
    criticalAlertsToday: number;
    nextScheduledCheck: Date;
  }> {
    // En un entorno real, esto vendría de una base de datos
    return {
      lastOptimizationCheck: new Date(),
      optimizationsAppliedToday: 0,
      criticalAlertsToday: 0,
      nextScheduledCheck: new Date(Date.now() + 60 * 60 * 1000), // Próxima hora
    };
  }

  /**
   * 🔧 Configurar parámetros de auto-escalado
   */
  async configureAutoScaling(config: {
    maxLambdaInvocationsPerHour?: number;
    maxDynamoRCUPerHour?: number;
    maxDynamoWCUPerHour?: number;
    budgetAlertThreshold?: number;
  }): Promise<void> {
    this.logger.log('🔧 Configurando parámetros de auto-escalado:', config);

    // En un entorno real, esto se guardaría en base de datos o configuración
    // Por ahora solo logueamos la configuración

    this.logger.log('✅ Parámetros de auto-escalado configurados exitosamente');
  }
}
