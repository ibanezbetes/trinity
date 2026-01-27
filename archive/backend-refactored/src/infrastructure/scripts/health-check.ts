#!/usr/bin/env ts-node

import * as AWS from 'aws-sdk';
import fetch from 'node-fetch';

/**
 * Script de health check para Trinity
 * 
 * Verifica el estado de salud de todos los componentes
 * de la infraestructura simplificada.
 * 
 * **Valida: Requirements 6.6, 7.6**
 */

interface HealthCheckConfig {
  environment: string;
  region: string;
  graphqlUrl?: string;
  apiKey?: string;
}

interface HealthStatus {
  component: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  responseTime?: number;
  message: string;
  timestamp: Date;
}

class HealthChecker {
  private lambda: AWS.Lambda;
  private dynamodb: AWS.DynamoDB;
  private cloudwatch: AWS.CloudWatch;
  private config: HealthCheckConfig;

  constructor(config: HealthCheckConfig) {
    this.config = config;
    AWS.config.update({ region: config.region });
    this.lambda = new AWS.Lambda();
    this.dynamodb = new AWS.DynamoDB();
    this.cloudwatch = new AWS.CloudWatch();
  }

  async performHealthCheck(): Promise<HealthStatus[]> {
    console.log('🏥 Iniciando health check de Trinity...');
    
    const results: HealthStatus[] = [];
    
    try {
      // 1. Check Lambda functions
      results.push(...await this.checkLambdaFunctions());
      
      // 2. Check DynamoDB tables
      results.push(...await this.checkDynamoDBTables());
      
      // 3. Check AppSync API
      if (this.config.graphqlUrl) {
        results.push(await this.checkAppSyncAPI());
      }
      
      // 4. Check CloudWatch metrics
      results.push(await this.checkCloudWatchMetrics());
      
      // 5. Generate summary
      this.generateHealthSummary(results);
      
      return results;
      
    } catch (error) {
      console.error('❌ Error durante health check:', error);
      throw error;
    }
  }

  private async checkLambdaFunctions(): Promise<HealthStatus[]> {
    console.log('⚡ Verificando Lambda functions...');
    
    const results: HealthStatus[] = [];
    const functions = ['trinity-auth-v2', 'trinity-core-v2', 'trinity-realtime-v2'];

    for (const functionName of functions) {
      const startTime = Date.now();
      
      try {
        // Test invocation with empty payload
        const response = await this.lambda.invoke({
          FunctionName: functionName,
          InvocationType: 'RequestResponse',
          Payload: JSON.stringify({ healthCheck: true })
        }).promise();
        
        const responseTime = Date.now() - startTime;
        const isHealthy = response.StatusCode === 200 && !response.FunctionError;
        
        results.push({
          component: `Lambda: ${functionName}`,
          status: isHealthy ? 'HEALTHY' : 'DEGRADED',
          responseTime,
          message: isHealthy ? 'Function responding normally' : `Error: ${response.FunctionError}`,
          timestamp: new Date()
        });
        
      } catch (error) {
        results.push({
          component: `Lambda: ${functionName}`,
          status: 'UNHEALTHY',
          responseTime: Date.now() - startTime,
          message: `Function invocation failed: ${error.message}`,
          timestamp: new Date()
        });
      }
    }

    return results;
  }

  private async checkDynamoDBTables(): Promise<HealthStatus[]> {
    console.log('🗄️ Verificando DynamoDB tables...');
    
    const results: HealthStatus[] = [];
    const tables = [
      'trinity-core-v2',
      'trinity-sessions-v2',
      'trinity-cache-v2',
      'trinity-analytics-v2'
    ];

    for (const tableName of tables) {
      const startTime = Date.now();
      
      try {
        // Test read operation
        await this.dynamodb.scan({
          TableName: tableName,
          Limit: 1
        }).promise();
        
        const responseTime = Date.now() - startTime;
        
        results.push({
          component: `DynamoDB: ${tableName}`,
          status: responseTime < 1000 ? 'HEALTHY' : 'DEGRADED',
          responseTime,
          message: `Table accessible, response time: ${responseTime}ms`,
          timestamp: new Date()
        });
        
      } catch (error) {
        results.push({
          component: `DynamoDB: ${tableName}`,
          status: 'UNHEALTHY',
          responseTime: Date.now() - startTime,
          message: `Table access failed: ${error.message}`,
          timestamp: new Date()
        });
      }
    }

    return results;
  }

  private async checkAppSyncAPI(): Promise<HealthStatus> {
    console.log('🔗 Verificando AppSync API...');
    
    const startTime = Date.now();
    
    try {
      // Simple introspection query
      const query = `
        query {
          __schema {
            queryType {
              name
            }
          }
        }
      `;
      
      const response = await fetch(this.config.graphqlUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey || ''
        },
        body: JSON.stringify({ query })
      });
      
      const responseTime = Date.now() - startTime;
      const isHealthy = response.ok;
      
      return {
        component: 'AppSync API',
        status: isHealthy ? 'HEALTHY' : 'DEGRADED',
        responseTime,
        message: isHealthy ? 'API responding normally' : `HTTP ${response.status}: ${response.statusText}`,
        timestamp: new Date()
      };
      
    } catch (error) {
      return {
        component: 'AppSync API',
        status: 'UNHEALTHY',
        responseTime: Date.now() - startTime,
        message: `API request failed: ${error.message}`,
        timestamp: new Date()
      };
    }
  }

  private async checkCloudWatchMetrics(): Promise<HealthStatus> {
    console.log('📊 Verificando CloudWatch metrics...');
    
    const startTime = Date.now();
    
    try {
      // Check if we can retrieve recent metrics
      const endTime = new Date();
      const startTimeMetrics = new Date(endTime.getTime() - 5 * 60 * 1000); // 5 minutes ago
      
      await this.cloudwatch.getMetricStatistics({
        Namespace: 'AWS/Lambda',
        MetricName: 'Invocations',
        StartTime: startTimeMetrics,
        EndTime: endTime,
        Period: 300,
        Statistics: ['Sum']
      }).promise();
      
      const responseTime = Date.now() - startTime;
      
      return {
        component: 'CloudWatch Metrics',
        status: 'HEALTHY',
        responseTime,
        message: 'Metrics accessible and current',
        timestamp: new Date()
      };
      
    } catch (error) {
      return {
        component: 'CloudWatch Metrics',
        status: 'UNHEALTHY',
        responseTime: Date.now() - startTime,
        message: `Metrics access failed: ${error.message}`,
        timestamp: new Date()
      };
    }
  }

  private generateHealthSummary(results: HealthStatus[]): void {
    console.log('\n🏥 REPORTE DE HEALTH CHECK');
    console.log('==========================');
    
    const healthy = results.filter(r => r.status === 'HEALTHY').length;
    const degraded = results.filter(r => r.status === 'DEGRADED').length;
    const unhealthy = results.filter(r => r.status === 'UNHEALTHY').length;
    
    console.log(`\n📊 RESUMEN:`);
    console.log(`🟢 HEALTHY: ${healthy}`);
    console.log(`🟡 DEGRADED: ${degraded}`);
    console.log(`🔴 UNHEALTHY: ${unhealthy}`);
    
    const overallStatus = unhealthy > 0 ? 'UNHEALTHY' : degraded > 0 ? 'DEGRADED' : 'HEALTHY';
    const statusIcon = overallStatus === 'HEALTHY' ? '🟢' : overallStatus === 'DEGRADED' ? '🟡' : '🔴';
    
    console.log(`\n${statusIcon} ESTADO GENERAL: ${overallStatus}`);
    
    console.log(`\n📝 DETALLES POR COMPONENTE:`);
    
    results.forEach(result => {
      const icon = result.status === 'HEALTHY' ? '🟢' : result.status === 'DEGRADED' ? '🟡' : '🔴';
      const responseInfo = result.responseTime ? ` (${result.responseTime}ms)` : '';
      console.log(`${icon} ${result.component}${responseInfo}: ${result.message}`);
    });
    
    if (overallStatus !== 'HEALTHY') {
      console.log(`\n⚠️  ACCIONES RECOMENDADAS:`);
      
      if (unhealthy > 0) {
        console.log('- Investigar y resolver componentes UNHEALTHY inmediatamente');
        console.log('- Verificar logs de CloudWatch para más detalles');
      }
      
      if (degraded > 0) {
        console.log('- Monitorear componentes DEGRADED para posible escalación');
        console.log('- Considerar optimizaciones de rendimiento');
      }
    }
    
    // Performance summary
    const avgResponseTime = results
      .filter(r => r.responseTime)
      .reduce((sum, r) => sum + r.responseTime!, 0) / results.filter(r => r.responseTime).length;
    
    if (avgResponseTime) {
      console.log(`\n⚡ RENDIMIENTO PROMEDIO: ${Math.round(avgResponseTime)}ms`);
    }
  }
}

// Configuración por defecto
const defaultConfig: HealthCheckConfig = {
  environment: process.env.ENVIRONMENT || 'development',
  region: process.env.AWS_REGION || 'eu-west-1',
  graphqlUrl: process.env.GRAPHQL_URL,
  apiKey: process.env.GRAPHQL_API_KEY
};

// Ejecutar health check si es llamado directamente
if (require.main === module) {
  const checker = new HealthChecker(defaultConfig);
  checker.performHealthCheck()
    .then((results) => {
      const hasUnhealthy = results.some(r => r.status === 'UNHEALTHY');
      console.log('\n🎉 Health check completado');
      process.exit(hasUnhealthy ? 1 : 0);
    })
    .catch((error) => {
      console.error('💥 Error en health check:', error);
      process.exit(1);
    });
}

export { HealthChecker, HealthCheckConfig, HealthStatus };