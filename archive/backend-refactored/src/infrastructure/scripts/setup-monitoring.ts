#!/usr/bin/env ts-node

import * as AWS from 'aws-sdk';
import { TrinityMonitoringStack } from '../monitoring/cloudwatch-dashboard';
import * as cdk from 'aws-cdk-lib';

/**
 * Script de configuración de monitoreo para Trinity
 * 
 * Configura dashboards, alertas y métricas personalizadas
 * para la infraestructura simplificada de Trinity.
 * 
 * **Valida: Requirements 6.6, 7.6**
 */

interface MonitoringConfig {
  environment: string;
  region: string;
  alertEmail?: string;
  slackWebhookUrl?: string;
  stackName: string;
}

class MonitoringSetup {
  private cloudwatch: AWS.CloudWatch;
  private lambda: AWS.Lambda;
  private config: MonitoringConfig;

  constructor(config: MonitoringConfig) {
    this.config = config;
    AWS.config.update({ region: config.region });
    this.cloudwatch = new AWS.CloudWatch();
    this.lambda = new AWS.Lambda();
  }

  async setupMonitoring(): Promise<void> {
    console.log('🚀 Configurando monitoreo para Trinity...');
    
    try {
      // 1. Verificar recursos existentes
      await this.verifyResources();
      
      // 2. Configurar métricas personalizadas
      await this.setupCustomMetrics();
      
      // 3. Crear dashboards
      await this.createDashboards();
      
      // 4. Configurar alertas
      await this.setupAlerts();
      
      console.log('✅ Monitoreo configurado exitosamente');
      
    } catch (error) {
      console.error('❌ Error configurando monitoreo:', error);
      throw error;
    }
  }

  private async verifyResources(): Promise<void> {
    console.log('🔍 Verificando recursos AWS...');
    
    const functions = [
      'trinity-auth-v2',
      'trinity-core-v2', 
      'trinity-realtime-v2'
    ];
    
    for (const functionName of functions) {
      try {
        await this.lambda.getFunction({ FunctionName: functionName }).promise();
        console.log(`✓ Lambda function encontrada: ${functionName}`);
      } catch (error) {
        console.warn(`⚠️  Lambda function no encontrada: ${functionName}`);
      }
    }
  }

  private async setupCustomMetrics(): Promise<void> {
    console.log('📊 Configurando métricas personalizadas...');
    
    const metrics = [
      {
        namespace: 'Trinity/Business',
        metricName: 'RoomsCreated',
        value: 0,
        unit: 'Count'
      },
      {
        namespace: 'Trinity/Business', 
        metricName: 'VotesProcessed',
        value: 0,
        unit: 'Count'
      },
      {
        namespace: 'Trinity/Realtime',
        metricName: 'ActiveConnections',
        value: 0,
        unit: 'Count'
      }
    ];

    for (const metric of metrics) {
      await this.cloudwatch.putMetricData({
        Namespace: metric.namespace,
        MetricData: [{
          MetricName: metric.metricName,
          Value: metric.value,
          Unit: metric.unit,
          Timestamp: new Date()
        }]
      }).promise();
      
      console.log(`✓ Métrica inicializada: ${metric.namespace}/${metric.metricName}`);
    }
  }
  private async createDashboards(): Promise<void> {
    console.log('📈 Creando dashboards...');
    
    const dashboardBody = {
      widgets: [
        {
          type: "metric",
          properties: {
            metrics: [
              ["AWS/Lambda", "Invocations", "FunctionName", "trinity-auth-v2"],
              [".", ".", ".", "trinity-core-v2"],
              [".", ".", ".", "trinity-realtime-v2"]
            ],
            period: 300,
            stat: "Sum",
            region: this.config.region,
            title: "Lambda Invocations"
          }
        },
        {
          type: "metric",
          properties: {
            metrics: [
              ["AWS/Lambda", "Errors", "FunctionName", "trinity-auth-v2"],
              [".", ".", ".", "trinity-core-v2"],
              [".", ".", ".", "trinity-realtime-v2"]
            ],
            period: 300,
            stat: "Sum",
            region: this.config.region,
            title: "Lambda Errors"
          }
        }
      ]
    };

    await this.cloudwatch.putDashboard({
      DashboardName: `Trinity-${this.config.environment}`,
      DashboardBody: JSON.stringify(dashboardBody)
    }).promise();
    
    console.log(`✓ Dashboard creado: Trinity-${this.config.environment}`);
  }

  private async setupAlerts(): Promise<void> {
    console.log('🚨 Configurando alertas...');
    
    // Crear alarma para errores de Lambda
    await this.cloudwatch.putMetricAlarm({
      AlarmName: `Trinity-${this.config.environment}-Lambda-Errors`,
      AlarmDescription: 'High error rate in Trinity Lambda functions',
      MetricName: 'Errors',
      Namespace: 'AWS/Lambda',
      Statistic: 'Sum',
      Period: 300,
      EvaluationPeriods: 2,
      Threshold: 5,
      ComparisonOperator: 'GreaterThanThreshold',
      Dimensions: [
        {
          Name: 'FunctionName',
          Value: 'trinity-core-v2'
        }
      ]
    }).promise();
    
    console.log('✓ Alertas configuradas');
  }
}

// Configuración por defecto
const defaultConfig: MonitoringConfig = {
  environment: process.env.ENVIRONMENT || 'development',
  region: process.env.AWS_REGION || 'eu-west-1',
  alertEmail: process.env.ALERT_EMAIL,
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  stackName: `trinity-monitoring-${process.env.ENVIRONMENT || 'dev'}`
};

// Ejecutar setup si es llamado directamente
if (require.main === module) {
  const setup = new MonitoringSetup(defaultConfig);
  setup.setupMonitoring()
    .then(() => {
      console.log('🎉 Setup de monitoreo completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Error en setup:', error);
      process.exit(1);
    });
}

export { MonitoringSetup, MonitoringConfig };