#!/usr/bin/env ts-node

import * as AWS from 'aws-sdk';

/**
 * Script de configuración de alertas para Trinity
 * 
 * Configura alertas avanzadas de CloudWatch con SNS
 * para monitoreo proactivo de la infraestructura.
 * 
 * **Valida: Requirements 6.6, 7.6**
 */

interface AlertConfig {
  environment: string;
  region: string;
  alertEmail?: string;
  snsTopicArn?: string;
}

class AlertsSetup {
  private cloudwatch: AWS.CloudWatch;
  private sns: AWS.SNS;
  private config: AlertConfig;

  constructor(config: AlertConfig) {
    this.config = config;
    AWS.config.update({ region: config.region });
    this.cloudwatch = new AWS.CloudWatch();
    this.sns = new AWS.SNS();
  }

  async setupAlerts(): Promise<void> {
    console.log('🚨 Configurando alertas avanzadas para Trinity...');
    
    try {
      // 1. Crear SNS topic si no existe
      const topicArn = await this.ensureSNSTopic();
      
      // 2. Configurar alertas de Lambda
      await this.setupLambdaAlerts(topicArn);
      
      // 3. Configurar alertas de DynamoDB
      await this.setupDynamoDBAlerts(topicArn);
      
      // 4. Configurar alertas de AppSync
      await this.setupAppSyncAlerts(topicArn);
      
      // 5. Configurar alertas de negocio
      await this.setupBusinessAlerts(topicArn);
      
      console.log('✅ Alertas configuradas exitosamente');
      
    } catch (error) {
      console.error('❌ Error configurando alertas:', error);
      throw error;
    }
  }

  private async ensureSNSTopic(): Promise<string> {
    if (this.config.snsTopicArn) {
      return this.config.snsTopicArn;
    }

    console.log('📢 Creando SNS topic para alertas...');
    
    const topicName = `trinity-alerts-${this.config.environment}`;
    const result = await this.sns.createTopic({ Name: topicName }).promise();
    
    if (this.config.alertEmail) {
      await this.sns.subscribe({
        TopicArn: result.TopicArn!,
        Protocol: 'email',
        Endpoint: this.config.alertEmail
      }).promise();
      
      console.log(`✓ Suscripción de email configurada: ${this.config.alertEmail}`);
    }
    
    console.log(`✓ SNS topic creado: ${result.TopicArn}`);
    return result.TopicArn!;
  }

  private async setupLambdaAlerts(topicArn: string): Promise<void> {
    console.log('⚡ Configurando alertas de Lambda...');
    
    const functions = ['trinity-auth-v2', 'trinity-core-v2', 'trinity-realtime-v2'];
    
    for (const functionName of functions) {
      // Alarma de errores
      await this.cloudwatch.putMetricAlarm({
        AlarmName: `Trinity-${this.config.environment}-${functionName}-Errors`,
        AlarmDescription: `High error rate for ${functionName}`,
        MetricName: 'Errors',
        Namespace: 'AWS/Lambda',
        Statistic: 'Sum',
        Period: 300,
        EvaluationPeriods: 2,
        Threshold: this.config.environment === 'production' ? 5 : 10,
        ComparisonOperator: 'GreaterThanThreshold',
        AlarmActions: [topicArn],
        Dimensions: [{ Name: 'FunctionName', Value: functionName }]
      }).promise();

      // Alarma de duración
      await this.cloudwatch.putMetricAlarm({
        AlarmName: `Trinity-${this.config.environment}-${functionName}-Duration`,
        AlarmDescription: `High duration for ${functionName}`,
        MetricName: 'Duration',
        Namespace: 'AWS/Lambda',
        Statistic: 'Average',
        Period: 300,
        EvaluationPeriods: 3,
        Threshold: 30000, // 30 segundos
        ComparisonOperator: 'GreaterThanThreshold',
        AlarmActions: [topicArn],
        Dimensions: [{ Name: 'FunctionName', Value: functionName }]
      }).promise();
      
      console.log(`✓ Alertas configuradas para ${functionName}`);
    }
  }

  private async setupDynamoDBAlerts(topicArn: string): Promise<void> {
    console.log('🗄️ Configurando alertas de DynamoDB...');
    
    const tables = [
      'trinity-core-v2',
      'trinity-sessions-v2', 
      'trinity-cache-v2',
      'trinity-analytics-v2'
    ];
    
    for (const tableName of tables) {
      // Alarma de throttling
      await this.cloudwatch.putMetricAlarm({
        AlarmName: `Trinity-${this.config.environment}-${tableName}-Throttling`,
        AlarmDescription: `DynamoDB throttling detected for ${tableName}`,
        MetricName: 'ThrottledRequests',
        Namespace: 'AWS/DynamoDB',
        Statistic: 'Sum',
        Period: 300,
        EvaluationPeriods: 1,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        AlarmActions: [topicArn],
        Dimensions: [{ Name: 'TableName', Value: tableName }]
      }).promise();
      
      console.log(`✓ Alertas configuradas para tabla ${tableName}`);
    }
  }

  private async setupAppSyncAlerts(topicArn: string): Promise<void> {
    console.log('🔗 Configurando alertas de AppSync...');
    
    // Alarma de errores 4XX
    await this.cloudwatch.putMetricAlarm({
      AlarmName: `Trinity-${this.config.environment}-AppSync-4XX-Errors`,
      AlarmDescription: 'High 4XX error rate for AppSync API',
      MetricName: '4XXError',
      Namespace: 'AWS/AppSync',
      Statistic: 'Sum',
      Period: 300,
      EvaluationPeriods: 2,
      Threshold: 20,
      ComparisonOperator: 'GreaterThanThreshold',
      AlarmActions: [topicArn]
    }).promise();

    // Alarma de errores 5XX
    await this.cloudwatch.putMetricAlarm({
      AlarmName: `Trinity-${this.config.environment}-AppSync-5XX-Errors`,
      AlarmDescription: 'High 5XX error rate for AppSync API',
      MetricName: '5XXError',
      Namespace: 'AWS/AppSync',
      Statistic: 'Sum',
      Period: 300,
      EvaluationPeriods: 1,
      Threshold: 5,
      ComparisonOperator: 'GreaterThanThreshold',
      AlarmActions: [topicArn]
    }).promise();
    
    console.log('✓ Alertas de AppSync configuradas');
  }

  private async setupBusinessAlerts(topicArn: string): Promise<void> {
    console.log('📊 Configurando alertas de negocio...');
    
    // Alarma de baja creación de salas
    await this.cloudwatch.putMetricAlarm({
      AlarmName: `Trinity-${this.config.environment}-Low-Room-Creation`,
      AlarmDescription: 'Unusually low room creation rate',
      MetricName: 'RoomsCreated',
      Namespace: 'Trinity/Business',
      Statistic: 'Sum',
      Period: 3600, // 1 hora
      EvaluationPeriods: 2,
      Threshold: this.config.environment === 'production' ? 5 : 1,
      ComparisonOperator: 'LessThanThreshold',
      AlarmActions: [topicArn],
      TreatMissingData: 'breaching'
    }).promise();

    // Alarma de costo alto
    await this.cloudwatch.putMetricAlarm({
      AlarmName: `Trinity-${this.config.environment}-High-Cost`,
      AlarmDescription: 'Daily cost exceeds expected threshold',
      MetricName: 'DailyCost',
      Namespace: 'Trinity/Cost',
      Statistic: 'Sum',
      Period: 86400, // 24 horas
      EvaluationPeriods: 1,
      Threshold: this.config.environment === 'production' ? 15 : 5,
      ComparisonOperator: 'GreaterThanThreshold',
      AlarmActions: [topicArn]
    }).promise();
    
    console.log('✓ Alertas de negocio configuradas');
  }
}

// Configuración por defecto
const defaultConfig: AlertConfig = {
  environment: process.env.ENVIRONMENT || 'development',
  region: process.env.AWS_REGION || 'eu-west-1',
  alertEmail: process.env.ALERT_EMAIL,
  snsTopicArn: process.env.SNS_TOPIC_ARN
};

// Ejecutar setup si es llamado directamente
if (require.main === module) {
  const setup = new AlertsSetup(defaultConfig);
  setup.setupAlerts()
    .then(() => {
      console.log('🎉 Setup de alertas completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Error en setup:', error);
      process.exit(1);
    });
}

export { AlertsSetup, AlertConfig };