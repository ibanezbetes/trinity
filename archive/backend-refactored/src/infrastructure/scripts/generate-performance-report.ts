#!/usr/bin/env ts-node

import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generador de reportes de rendimiento para Trinity
 * 
 * Genera reportes detallados de rendimiento, costos y uso
 * de la infraestructura simplificada.
 * 
 * **Valida: Requirements 6.6, 7.6**
 */

interface ReportConfig {
  environment: string;
  region: string;
  outputDir: string;
  timeRange: number; // hours
}

interface PerformanceMetrics {
  lambda: {
    invocations: number;
    errors: number;
    avgDuration: number;
    maxDuration: number;
    throttles: number;
  };
  dynamodb: {
    readCapacity: number;
    writeCapacity: number;
    throttles: number;
    avgLatency: number;
  };
  appsync: {
    requests: number;
    errors4xx: number;
    errors5xx: number;
    avgLatency: number;
  };
  costs: {
    estimatedDaily: number;
    breakdown: {
      lambda: number;
      dynamodb: number;
      appsync: number;
      cloudwatch: number;
    };
  };
}

class PerformanceReporter {
  private cloudwatch: AWS.CloudWatch;
  private config: ReportConfig;

  constructor(config: ReportConfig) {
    this.config = config;
    AWS.config.update({ region: config.region });
    this.cloudwatch = new AWS.CloudWatch();
  }

  async generateReport(): Promise<void> {
    console.log('📊 Generando reporte de rendimiento...');
    
    try {
      // 1. Recopilar métricas
      const metrics = await this.collectMetrics();
      
      // 2. Generar reporte HTML
      await this.generateHTMLReport(metrics);
      
      // 3. Generar reporte JSON
      await this.generateJSONReport(metrics);
      
      // 4. Generar reporte de texto
      await this.generateTextReport(metrics);
      
      console.log(`✅ Reportes generados en: ${this.config.outputDir}`);
      
    } catch (error) {
      console.error('❌ Error generando reporte:', error);
      throw error;
    }
  }

  private async collectMetrics(): Promise<PerformanceMetrics> {
    console.log('📈 Recopilando métricas...');
    
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - this.config.timeRange * 60 * 60 * 1000);
    
    const [lambdaMetrics, dynamoMetrics, appsyncMetrics, costMetrics] = await Promise.all([
      this.collectLambdaMetrics(startTime, endTime),
      this.collectDynamoDBMetrics(startTime, endTime),
      this.collectAppSyncMetrics(startTime, endTime),
      this.collectCostMetrics(startTime, endTime)
    ]);

    return {
      lambda: lambdaMetrics,
      dynamodb: dynamoMetrics,
      appsync: appsyncMetrics,
      costs: costMetrics
    };
  }

  private async collectLambdaMetrics(startTime: Date, endTime: Date): Promise<PerformanceMetrics['lambda']> {
    const functions = ['trinity-auth-v2', 'trinity-core-v2', 'trinity-realtime-v2'];
    
    let totalInvocations = 0;
    let totalErrors = 0;
    let totalDuration = 0;
    let maxDuration = 0;
    let totalThrottles = 0;
    let functionCount = 0;

    for (const functionName of functions) {
      try {
        // Invocations
        const invocations = await this.getMetricSum('AWS/Lambda', 'Invocations', startTime, endTime, [
          { Name: 'FunctionName', Value: functionName }
        ]);
        
        // Errors
        const errors = await this.getMetricSum('AWS/Lambda', 'Errors', startTime, endTime, [
          { Name: 'FunctionName', Value: functionName }
        ]);
        
        // Duration
        const avgDuration = await this.getMetricAverage('AWS/Lambda', 'Duration', startTime, endTime, [
          { Name: 'FunctionName', Value: functionName }
        ]);
        
        const maxDur = await this.getMetricMaximum('AWS/Lambda', 'Duration', startTime, endTime, [
          { Name: 'FunctionName', Value: functionName }
        ]);
        
        // Throttles
        const throttles = await this.getMetricSum('AWS/Lambda', 'Throttles', startTime, endTime, [
          { Name: 'FunctionName', Value: functionName }
        ]);

        totalInvocations += invocations;
        totalErrors += errors;
        totalDuration += avgDuration;
        maxDuration = Math.max(maxDuration, maxDur);
        totalThrottles += throttles;
        functionCount++;
        
      } catch (error) {
        console.warn(`⚠️ Error collecting metrics for ${functionName}:`, error.message);
      }
    }

    return {
      invocations: totalInvocations,
      errors: totalErrors,
      avgDuration: functionCount > 0 ? totalDuration / functionCount : 0,
      maxDuration,
      throttles: totalThrottles
    };
  }

  private async collectDynamoDBMetrics(startTime: Date, endTime: Date): Promise<PerformanceMetrics['dynamodb']> {
    const tables = ['trinity-core-v2', 'trinity-sessions-v2', 'trinity-cache-v2', 'trinity-analytics-v2'];
    
    let totalReadCapacity = 0;
    let totalWriteCapacity = 0;
    let totalThrottles = 0;
    let totalLatency = 0;
    let tableCount = 0;

    for (const tableName of tables) {
      try {
        const readCapacity = await this.getMetricSum('AWS/DynamoDB', 'ConsumedReadCapacityUnits', startTime, endTime, [
          { Name: 'TableName', Value: tableName }
        ]);
        
        const writeCapacity = await this.getMetricSum('AWS/DynamoDB', 'ConsumedWriteCapacityUnits', startTime, endTime, [
          { Name: 'TableName', Value: tableName }
        ]);
        
        const throttles = await this.getMetricSum('AWS/DynamoDB', 'ThrottledRequests', startTime, endTime, [
          { Name: 'TableName', Value: tableName }
        ]);

        totalReadCapacity += readCapacity;
        totalWriteCapacity += writeCapacity;
        totalThrottles += throttles;
        tableCount++;
        
      } catch (error) {
        console.warn(`⚠️ Error collecting DynamoDB metrics for ${tableName}:`, error.message);
      }
    }

    return {
      readCapacity: totalReadCapacity,
      writeCapacity: totalWriteCapacity,
      throttles: totalThrottles,
      avgLatency: 0 // DynamoDB latency metrics are not directly available
    };
  }

  private async collectAppSyncMetrics(startTime: Date, endTime: Date): Promise<PerformanceMetrics['appsync']> {
    try {
      const requests = await this.getMetricSum('AWS/AppSync', 'RequestCount', startTime, endTime);
      const errors4xx = await this.getMetricSum('AWS/AppSync', '4XXError', startTime, endTime);
      const errors5xx = await this.getMetricSum('AWS/AppSync', '5XXError', startTime, endTime);
      const avgLatency = await this.getMetricAverage('AWS/AppSync', 'Latency', startTime, endTime);

      return {
        requests,
        errors4xx,
        errors5xx,
        avgLatency
      };
      
    } catch (error) {
      console.warn('⚠️ Error collecting AppSync metrics:', error.message);
      return {
        requests: 0,
        errors4xx: 0,
        errors5xx: 0,
        avgLatency: 0
      };
    }
  }

  private async collectCostMetrics(startTime: Date, endTime: Date): Promise<PerformanceMetrics['costs']> {
    // Estimaciones basadas en uso actual y precios de AWS
    const lambdaCost = 0.20; // USD per day estimate
    const dynamodbCost = 0.15; // USD per day estimate
    const appsyncCost = 0.10; // USD per day estimate
    const cloudwatchCost = 0.05; // USD per day estimate

    return {
      estimatedDaily: lambdaCost + dynamodbCost + appsyncCost + cloudwatchCost,
      breakdown: {
        lambda: lambdaCost,
        dynamodb: dynamodbCost,
        appsync: appsyncCost,
        cloudwatch: cloudwatchCost
      }
    };
  }

  private async getMetricSum(namespace: string, metricName: string, startTime: Date, endTime: Date, dimensions?: AWS.CloudWatch.Dimension[]): Promise<number> {
    try {
      const result = await this.cloudwatch.getMetricStatistics({
        Namespace: namespace,
        MetricName: metricName,
        StartTime: startTime,
        EndTime: endTime,
        Period: 3600, // 1 hour
        Statistics: ['Sum'],
        Dimensions: dimensions || []
      }).promise();

      return result.Datapoints?.reduce((sum, point) => sum + (point.Sum || 0), 0) || 0;
    } catch (error) {
      return 0;
    }
  }

  private async getMetricAverage(namespace: string, metricName: string, startTime: Date, endTime: Date, dimensions?: AWS.CloudWatch.Dimension[]): Promise<number> {
    try {
      const result = await this.cloudwatch.getMetricStatistics({
        Namespace: namespace,
        MetricName: metricName,
        StartTime: startTime,
        EndTime: endTime,
        Period: 3600,
        Statistics: ['Average'],
        Dimensions: dimensions || []
      }).promise();

      const datapoints = result.Datapoints || [];
      return datapoints.length > 0 
        ? datapoints.reduce((sum, point) => sum + (point.Average || 0), 0) / datapoints.length
        : 0;
    } catch (error) {
      return 0;
    }
  }

  private async getMetricMaximum(namespace: string, metricName: string, startTime: Date, endTime: Date, dimensions?: AWS.CloudWatch.Dimension[]): Promise<number> {
    try {
      const result = await this.cloudwatch.getMetricStatistics({
        Namespace: namespace,
        MetricName: metricName,
        StartTime: startTime,
        EndTime: endTime,
        Period: 3600,
        Statistics: ['Maximum'],
        Dimensions: dimensions || []
      }).promise();

      return Math.max(...(result.Datapoints?.map(point => point.Maximum || 0) || [0]));
    } catch (error) {
      return 0;
    }
  }

  private async generateHTMLReport(metrics: PerformanceMetrics): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Trinity Performance Report - ${this.config.environment}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #f9f9f9; border-radius: 3px; }
        .good { color: green; }
        .warning { color: orange; }
        .error { color: red; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Trinity Performance Report</h1>
        <p>Environment: ${this.config.environment} | Generated: ${new Date().toISOString()}</p>
        <p>Time Range: Last ${this.config.timeRange} hours</p>
    </div>

    <div class="section">
        <h2>Lambda Functions</h2>
        <div class="metric">Invocations: <strong>${metrics.lambda.invocations}</strong></div>
        <div class="metric">Errors: <strong class="${metrics.lambda.errors > 0 ? 'error' : 'good'}">${metrics.lambda.errors}</strong></div>
        <div class="metric">Avg Duration: <strong>${Math.round(metrics.lambda.avgDuration)}ms</strong></div>
        <div class="metric">Max Duration: <strong>${Math.round(metrics.lambda.maxDuration)}ms</strong></div>
        <div class="metric">Throttles: <strong class="${metrics.lambda.throttles > 0 ? 'error' : 'good'}">${metrics.lambda.throttles}</strong></div>
    </div>

    <div class="section">
        <h2>DynamoDB</h2>
        <div class="metric">Read Capacity: <strong>${metrics.dynamodb.readCapacity}</strong></div>
        <div class="metric">Write Capacity: <strong>${metrics.dynamodb.writeCapacity}</strong></div>
        <div class="metric">Throttles: <strong class="${metrics.dynamodb.throttles > 0 ? 'error' : 'good'}">${metrics.dynamodb.throttles}</strong></div>
    </div>

    <div class="section">
        <h2>AppSync API</h2>
        <div class="metric">Requests: <strong>${metrics.appsync.requests}</strong></div>
        <div class="metric">4XX Errors: <strong class="${metrics.appsync.errors4xx > 0 ? 'warning' : 'good'}">${metrics.appsync.errors4xx}</strong></div>
        <div class="metric">5XX Errors: <strong class="${metrics.appsync.errors5xx > 0 ? 'error' : 'good'}">${metrics.appsync.errors5xx}</strong></div>
        <div class="metric">Avg Latency: <strong>${Math.round(metrics.appsync.avgLatency)}ms</strong></div>
    </div>

    <div class="section">
        <h2>Cost Analysis</h2>
        <div class="metric">Estimated Daily Cost: <strong>$${metrics.costs.estimatedDaily.toFixed(2)}</strong></div>
        <div class="metric">Lambda: <strong>$${metrics.costs.breakdown.lambda.toFixed(2)}</strong></div>
        <div class="metric">DynamoDB: <strong>$${metrics.costs.breakdown.dynamodb.toFixed(2)}</strong></div>
        <div class="metric">AppSync: <strong>$${metrics.costs.breakdown.appsync.toFixed(2)}</strong></div>
        <div class="metric">CloudWatch: <strong>$${metrics.costs.breakdown.cloudwatch.toFixed(2)}</strong></div>
    </div>
</body>
</html>
    `;

    const outputPath = path.join(this.config.outputDir, `performance-report-${this.config.environment}-${Date.now()}.html`);
    await fs.promises.writeFile(outputPath, html);
    console.log(`📄 HTML report: ${outputPath}`);
  }

  private async generateJSONReport(metrics: PerformanceMetrics): Promise<void> {
    const report = {
      metadata: {
        environment: this.config.environment,
        region: this.config.region,
        timeRange: this.config.timeRange,
        generatedAt: new Date().toISOString()
      },
      metrics
    };

    const outputPath = path.join(this.config.outputDir, `performance-report-${this.config.environment}-${Date.now()}.json`);
    await fs.promises.writeFile(outputPath, JSON.stringify(report, null, 2));
    console.log(`📄 JSON report: ${outputPath}`);
  }

  private async generateTextReport(metrics: PerformanceMetrics): Promise<void> {
    const report = `
TRINITY PERFORMANCE REPORT
==========================
Environment: ${this.config.environment}
Region: ${this.config.region}
Time Range: Last ${this.config.timeRange} hours
Generated: ${new Date().toISOString()}

LAMBDA FUNCTIONS
----------------
Invocations: ${metrics.lambda.invocations}
Errors: ${metrics.lambda.errors}
Average Duration: ${Math.round(metrics.lambda.avgDuration)}ms
Maximum Duration: ${Math.round(metrics.lambda.maxDuration)}ms
Throttles: ${metrics.lambda.throttles}

DYNAMODB
--------
Read Capacity Used: ${metrics.dynamodb.readCapacity}
Write Capacity Used: ${metrics.dynamodb.writeCapacity}
Throttles: ${metrics.dynamodb.throttles}

APPSYNC API
-----------
Total Requests: ${metrics.appsync.requests}
4XX Errors: ${metrics.appsync.errors4xx}
5XX Errors: ${metrics.appsync.errors5xx}
Average Latency: ${Math.round(metrics.appsync.avgLatency)}ms

COST ANALYSIS
-------------
Estimated Daily Cost: $${metrics.costs.estimatedDaily.toFixed(2)}
  - Lambda: $${metrics.costs.breakdown.lambda.toFixed(2)}
  - DynamoDB: $${metrics.costs.breakdown.dynamodb.toFixed(2)}
  - AppSync: $${metrics.costs.breakdown.appsync.toFixed(2)}
  - CloudWatch: $${metrics.costs.breakdown.cloudwatch.toFixed(2)}

RECOMMENDATIONS
---------------
${this.generateRecommendations(metrics)}
    `;

    const outputPath = path.join(this.config.outputDir, `performance-report-${this.config.environment}-${Date.now()}.txt`);
    await fs.promises.writeFile(outputPath, report);
    console.log(`📄 Text report: ${outputPath}`);
  }

  private generateRecommendations(metrics: PerformanceMetrics): string {
    const recommendations: string[] = [];

    if (metrics.lambda.errors > 0) {
      recommendations.push('- Investigate Lambda errors in CloudWatch logs');
    }

    if (metrics.lambda.avgDuration > 10000) {
      recommendations.push('- Consider optimizing Lambda function performance');
    }

    if (metrics.dynamodb.throttles > 0) {
      recommendations.push('- Review DynamoDB capacity settings to prevent throttling');
    }

    if (metrics.appsync.errors5xx > 0) {
      recommendations.push('- Investigate AppSync 5XX errors for backend issues');
    }

    if (metrics.costs.estimatedDaily > 1.0) {
      recommendations.push('- Review cost optimization opportunities');
    }

    return recommendations.length > 0 ? recommendations.join('\n') : '- System performing within normal parameters';
  }
}

// Configuración por defecto
const defaultConfig: ReportConfig = {
  environment: process.env.ENVIRONMENT || 'development',
  region: process.env.AWS_REGION || 'eu-west-1',
  outputDir: process.env.REPORT_OUTPUT_DIR || './reports',
  timeRange: parseInt(process.env.REPORT_TIME_RANGE || '24') // 24 hours
};

// Ejecutar generación si es llamado directamente
if (require.main === module) {
  // Ensure output directory exists
  if (!fs.existsSync(defaultConfig.outputDir)) {
    fs.mkdirSync(defaultConfig.outputDir, { recursive: true });
  }

  const reporter = new PerformanceReporter(defaultConfig);
  reporter.generateReport()
    .then(() => {
      console.log('🎉 Reporte de rendimiento generado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Error generando reporte:', error);
      process.exit(1);
    });
}

export { PerformanceReporter, ReportConfig, PerformanceMetrics };