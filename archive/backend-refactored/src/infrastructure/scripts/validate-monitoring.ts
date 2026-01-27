#!/usr/bin/env ts-node

import * as AWS from 'aws-sdk';

/**
 * Script de validación de monitoreo para Trinity
 * 
 * Valida que todos los componentes de monitoreo estén
 * funcionando correctamente y reporta el estado.
 * 
 * **Valida: Requirements 6.6, 7.6**
 */

interface ValidationConfig {
  environment: string;
  region: string;
}

interface ValidationResult {
  component: string;
  status: 'OK' | 'WARNING' | 'ERROR';
  message: string;
  details?: any;
}

class MonitoringValidator {
  private cloudwatch: AWS.CloudWatch;
  private lambda: AWS.Lambda;
  private dynamodb: AWS.DynamoDB;
  private sns: AWS.SNS;
  private config: ValidationConfig;

  constructor(config: ValidationConfig) {
    this.config = config;
    AWS.config.update({ region: config.region });
    this.cloudwatch = new AWS.CloudWatch();
    this.lambda = new AWS.Lambda();
    this.dynamodb = new AWS.DynamoDB();
    this.sns = new AWS.SNS();
  }

  async validateMonitoring(): Promise<ValidationResult[]> {
    console.log('🔍 Validando configuración de monitoreo...');
    
    const results: ValidationResult[] = [];
    
    try {
      // 1. Validar Lambda functions
      results.push(...await this.validateLambdaFunctions());
      
      // 2. Validar DynamoDB tables
      results.push(...await this.validateDynamoDBTables());
      
      // 3. Validar CloudWatch dashboards
      results.push(...await this.validateDashboards());
      
      // 4. Validar alarmas
      results.push(...await this.validateAlarms());
      
      // 5. Validar métricas personalizadas
      results.push(...await this.validateCustomMetrics());
      
      // 6. Generar reporte
      this.generateReport(results);
      
      return results;
      
    } catch (error) {
      console.error('❌ Error durante validación:', error);
      throw error;
    }
  }

  private async validateLambdaFunctions(): Promise<ValidationResult[]> {
    console.log('⚡ Validando Lambda functions...');
    
    const results: ValidationResult[] = [];
    const expectedFunctions = [
      'trinity-auth-v2',
      'trinity-core-v2',
      'trinity-realtime-v2'
    ];

    for (const functionName of expectedFunctions) {
      try {
        const func = await this.lambda.getFunction({ FunctionName: functionName }).promise();
        
        // Verificar configuración
        const config = func.Configuration!;
        const isHealthy = config.State === 'Active' && config.LastUpdateStatus === 'Successful';
        
        results.push({
          component: `Lambda: ${functionName}`,
          status: isHealthy ? 'OK' : 'WARNING',
          message: isHealthy ? 'Function active and healthy' : `Function state: ${config.State}`,
          details: {
            runtime: config.Runtime,
            memorySize: config.MemorySize,
            timeout: config.Timeout,
            lastModified: config.LastModified
          }
        });
        
      } catch (error) {
        results.push({
          component: `Lambda: ${functionName}`,
          status: 'ERROR',
          message: `Function not found or inaccessible: ${error.message}`
        });
      }
    }

    return results;
  }

  private async validateDynamoDBTables(): Promise<ValidationResult[]> {
    console.log('🗄️ Validando DynamoDB tables...');
    
    const results: ValidationResult[] = [];
    const expectedTables = [
      'trinity-core-v2',
      'trinity-sessions-v2',
      'trinity-cache-v2',
      'trinity-analytics-v2'
    ];

    for (const tableName of expectedTables) {
      try {
        const table = await this.dynamodb.describeTable({ TableName: tableName }).promise();
        const tableStatus = table.Table!.TableStatus;
        
        results.push({
          component: `DynamoDB: ${tableName}`,
          status: tableStatus === 'ACTIVE' ? 'OK' : 'WARNING',
          message: `Table status: ${tableStatus}`,
          details: {
            itemCount: table.Table!.ItemCount,
            tableSize: table.Table!.TableSizeBytes,
            billingMode: table.Table!.BillingModeSummary?.BillingMode
          }
        });
        
      } catch (error) {
        results.push({
          component: `DynamoDB: ${tableName}`,
          status: 'ERROR',
          message: `Table not found or inaccessible: ${error.message}`
        });
      }
    }

    return results;
  }

  private async validateDashboards(): Promise<ValidationResult[]> {
    console.log('📈 Validando CloudWatch dashboards...');
    
    const results: ValidationResult[] = [];
    const expectedDashboard = `Trinity-${this.config.environment}`;

    try {
      const dashboards = await this.cloudwatch.listDashboards().promise();
      const dashboard = dashboards.DashboardEntries?.find(d => d.DashboardName === expectedDashboard);
      
      if (dashboard) {
        results.push({
          component: `Dashboard: ${expectedDashboard}`,
          status: 'OK',
          message: 'Dashboard exists and accessible',
          details: {
            lastModified: dashboard.LastModified,
            size: dashboard.Size
          }
        });
      } else {
        results.push({
          component: `Dashboard: ${expectedDashboard}`,
          status: 'WARNING',
          message: 'Dashboard not found'
        });
      }
      
    } catch (error) {
      results.push({
        component: `Dashboard: ${expectedDashboard}`,
        status: 'ERROR',
        message: `Error accessing dashboards: ${error.message}`
      });
    }

    return results;
  }

  private async validateAlarms(): Promise<ValidationResult[]> {
    console.log('🚨 Validando CloudWatch alarms...');
    
    const results: ValidationResult[] = [];
    
    try {
      const alarms = await this.cloudwatch.describeAlarms().promise();
      const trinityAlarms = alarms.MetricAlarms?.filter(alarm => 
        alarm.AlarmName?.includes(`Trinity-${this.config.environment}`)
      ) || [];
      
      if (trinityAlarms.length > 0) {
        const activeAlarms = trinityAlarms.filter(alarm => alarm.StateValue === 'ALARM');
        const okAlarms = trinityAlarms.filter(alarm => alarm.StateValue === 'OK');
        
        results.push({
          component: 'CloudWatch Alarms',
          status: activeAlarms.length > 0 ? 'WARNING' : 'OK',
          message: `${trinityAlarms.length} alarms configured, ${activeAlarms.length} active`,
          details: {
            total: trinityAlarms.length,
            ok: okAlarms.length,
            alarm: activeAlarms.length,
            activeAlarms: activeAlarms.map(a => a.AlarmName)
          }
        });
      } else {
        results.push({
          component: 'CloudWatch Alarms',
          status: 'WARNING',
          message: 'No Trinity alarms found'
        });
      }
      
    } catch (error) {
      results.push({
        component: 'CloudWatch Alarms',
        status: 'ERROR',
        message: `Error accessing alarms: ${error.message}`
      });
    }

    return results;
  }

  private async validateCustomMetrics(): Promise<ValidationResult[]> {
    console.log('📊 Validando métricas personalizadas...');
    
    const results: ValidationResult[] = [];
    const expectedNamespaces = ['Trinity/Business', 'Trinity/Realtime', 'Trinity/Cost'];
    
    try {
      const namespaces = await this.cloudwatch.listMetrics().promise();
      
      for (const expectedNs of expectedNamespaces) {
        const hasMetrics = namespaces.Metrics?.some(m => m.Namespace === expectedNs);
        
        results.push({
          component: `Custom Metrics: ${expectedNs}`,
          status: hasMetrics ? 'OK' : 'WARNING',
          message: hasMetrics ? 'Metrics namespace active' : 'No metrics found in namespace'
        });
      }
      
    } catch (error) {
      results.push({
        component: 'Custom Metrics',
        status: 'ERROR',
        message: `Error accessing metrics: ${error.message}`
      });
    }

    return results;
  }

  private generateReport(results: ValidationResult[]): void {
    console.log('\n📋 REPORTE DE VALIDACIÓN DE MONITOREO');
    console.log('=====================================');
    
    const okCount = results.filter(r => r.status === 'OK').length;
    const warningCount = results.filter(r => r.status === 'WARNING').length;
    const errorCount = results.filter(r => r.status === 'ERROR').length;
    
    console.log(`\n📊 RESUMEN:`);
    console.log(`✅ OK: ${okCount}`);
    console.log(`⚠️  WARNING: ${warningCount}`);
    console.log(`❌ ERROR: ${errorCount}`);
    
    console.log(`\n📝 DETALLES:`);
    
    results.forEach(result => {
      const icon = result.status === 'OK' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
      console.log(`${icon} ${result.component}: ${result.message}`);
      
      if (result.details && Object.keys(result.details).length > 0) {
        console.log(`   Detalles: ${JSON.stringify(result.details, null, 2)}`);
      }
    });
    
    const overallHealth = errorCount === 0 ? (warningCount === 0 ? 'HEALTHY' : 'DEGRADED') : 'UNHEALTHY';
    console.log(`\n🏥 ESTADO GENERAL: ${overallHealth}`);
    
    if (overallHealth !== 'HEALTHY') {
      console.log('\n💡 RECOMENDACIONES:');
      
      if (errorCount > 0) {
        console.log('- Revisar y corregir errores críticos antes de continuar');
      }
      
      if (warningCount > 0) {
        console.log('- Investigar warnings para optimizar el monitoreo');
      }
    }
  }
}

// Configuración por defecto
const defaultConfig: ValidationConfig = {
  environment: process.env.ENVIRONMENT || 'development',
  region: process.env.AWS_REGION || 'eu-west-1'
};

// Ejecutar validación si es llamado directamente
if (require.main === module) {
  const validator = new MonitoringValidator(defaultConfig);
  validator.validateMonitoring()
    .then((results) => {
      const hasErrors = results.some(r => r.status === 'ERROR');
      console.log('\n🎉 Validación completada');
      process.exit(hasErrors ? 1 : 0);
    })
    .catch((error) => {
      console.error('💥 Error en validación:', error);
      process.exit(1);
    });
}

export { MonitoringValidator, ValidationConfig, ValidationResult };