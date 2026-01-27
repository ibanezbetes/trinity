import { Injectable, Logger } from '@nestjs/common';
import { 
  DynamoDBClient, 
  ListTablesCommand,
  DescribeTableCommand 
} from '@aws-sdk/client-dynamodb';
import { 
  CognitoIdentityProviderClient, 
  DescribeUserPoolCommand 
} from '@aws-sdk/client-cognito-identity-provider';
import { 
  S3Client, 
  ListBucketsCommand 
} from '@aws-sdk/client-s3';
import { 
  CloudWatchClient, 
  ListMetricsCommand 
} from '@aws-sdk/client-cloudwatch';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

export interface ServiceHealthStatus {
  status: 'healthy' | 'unhealthy' | 'unknown';
  message: string;
  responseTime?: number;
  details?: any;
  error?: string;
}

export interface AwsHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    dynamodb: ServiceHealthStatus;
    cognito: ServiceHealthStatus;
    s3: ServiceHealthStatus;
    cloudwatch: ServiceHealthStatus;
    credentials: ServiceHealthStatus;
  };
  timestamp: string;
  region: string;
  accountId?: string;
}

@Injectable()
export class AwsHealthService {
  private readonly logger = new Logger(AwsHealthService.name);
  private readonly region = process.env.AWS_REGION || 'eu-west-1';
  
  private readonly dynamoClient: DynamoDBClient;
  private readonly cognitoClient: CognitoIdentityProviderClient;
  private readonly s3Client: S3Client;
  private readonly cloudWatchClient: CloudWatchClient;
  private readonly stsClient: STSClient;

  constructor() {
    const awsConfig = {
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    };

    this.dynamoClient = new DynamoDBClient(awsConfig);
    this.cognitoClient = new CognitoIdentityProviderClient(awsConfig);
    this.s3Client = new S3Client(awsConfig);
    this.cloudWatchClient = new CloudWatchClient(awsConfig);
    this.stsClient = new STSClient(awsConfig);
  }

  async checkAllServices(): Promise<AwsHealthReport> {
    this.logger.log('🔍 Iniciando verificación de servicios AWS...');
    
    const startTime = Date.now();
    
    const [dynamodb, cognito, s3, cloudwatch, credentials] = await Promise.allSettled([
      this.checkDynamoDB(),
      this.checkCognito(),
      this.checkS3(),
      this.checkCloudWatch(),
      this.checkCredentials(),
    ]);

    const services = {
      dynamodb: this.getResultFromPromise(dynamodb),
      cognito: this.getResultFromPromise(cognito),
      s3: this.getResultFromPromise(s3),
      cloudwatch: this.getResultFromPromise(cloudwatch),
      credentials: this.getResultFromPromise(credentials),
    };

    // Determinar estado general
    const healthyCount = Object.values(services).filter(s => s.status === 'healthy').length;
    const totalServices = Object.keys(services).length;
    
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyCount === totalServices) {
      overallStatus = 'healthy';
    } else if (healthyCount > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'unhealthy';
    }

    const report: AwsHealthReport = {
      status: overallStatus,
      services,
      timestamp: new Date().toISOString(),
      region: this.region,
      accountId: services.credentials.details?.accountId,
    };

    const totalTime = Date.now() - startTime;
    this.logger.log(`✅ Verificación completada en ${totalTime}ms - Estado: ${overallStatus}`);
    
    return report;
  }

  async checkDynamoDB(): Promise<ServiceHealthStatus> {
    const startTime = Date.now();
    
    try {
      this.logger.log('🔍 Verificando DynamoDB...');
      
      // Verificar conectividad listando tablas
      const listCommand = new ListTablesCommand({});
      const listResult = await this.dynamoClient.send(listCommand);
      
      const responseTime = Date.now() - startTime;
      const tableCount = listResult.TableNames?.length || 0;
      
      // Si hay tablas, verificar una específica
      let tableDetails: any = null;
      const mainTable = process.env.DYNAMODB_TABLE_NAME;
      
      if (mainTable && listResult.TableNames?.includes(mainTable)) {
        try {
          const describeCommand = new DescribeTableCommand({ TableName: mainTable });
          const describeResult = await this.dynamoClient.send(describeCommand);
          tableDetails = {
            tableName: mainTable,
            status: describeResult.Table?.TableStatus,
            itemCount: describeResult.Table?.ItemCount,
            provisionedThroughput: describeResult.Table?.ProvisionedThroughput,
          };
        } catch (error) {
          this.logger.warn(`⚠️ No se pudo describir la tabla ${mainTable}: ${error.message}`);
        }
      }

      return {
        status: 'healthy',
        message: `DynamoDB conectado exitosamente. ${tableCount} tabla(s) encontrada(s)`,
        responseTime,
        details: {
          tableCount,
          tables: listResult.TableNames,
          mainTable: tableDetails,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error(`❌ Error conectando a DynamoDB: ${error.message}`);
      
      return {
        status: 'unhealthy',
        message: 'Error conectando a DynamoDB',
        responseTime,
        error: error.message,
      };
    }
  }

  async checkCognito(): Promise<ServiceHealthStatus> {
    const startTime = Date.now();
    
    try {
      this.logger.log('🔍 Verificando Cognito...');
      
      const userPoolId = process.env.COGNITO_USER_POOL_ID;
      
      if (!userPoolId || userPoolId === 'your-cognito-user-pool-id') {
        return {
          status: 'unknown',
          message: 'User Pool ID no configurado',
          responseTime: Date.now() - startTime,
        };
      }

      const command = new DescribeUserPoolCommand({ UserPoolId: userPoolId });
      const result = await this.cognitoClient.send(command);
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        message: 'Cognito conectado exitosamente',
        responseTime,
        details: {
          userPoolId,
          userPoolName: result.UserPool?.Name,
          status: result.UserPool?.Status,
          creationDate: result.UserPool?.CreationDate,
          estimatedNumberOfUsers: result.UserPool?.EstimatedNumberOfUsers,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error(`❌ Error conectando a Cognito: ${error.message}`);
      
      return {
        status: 'unhealthy',
        message: 'Error conectando a Cognito',
        responseTime,
        error: error.message,
      };
    }
  }

  async checkS3(): Promise<ServiceHealthStatus> {
    const startTime = Date.now();
    
    try {
      this.logger.log('🔍 Verificando S3...');
      
      const command = new ListBucketsCommand({});
      const result = await this.s3Client.send(command);
      
      const responseTime = Date.now() - startTime;
      const bucketCount = result.Buckets?.length || 0;
      
      return {
        status: 'healthy',
        message: `S3 conectado exitosamente. ${bucketCount} bucket(s) encontrado(s)`,
        responseTime,
        details: {
          bucketCount,
          buckets: result.Buckets?.map(b => ({
            name: b.Name,
            creationDate: b.CreationDate,
          })),
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error(`❌ Error conectando a S3: ${error.message}`);
      
      return {
        status: 'unhealthy',
        message: 'Error conectando a S3',
        responseTime,
        error: error.message,
      };
    }
  }

  async checkCloudWatch(): Promise<ServiceHealthStatus> {
    const startTime = Date.now();
    
    try {
      this.logger.log('🔍 Verificando CloudWatch...');
      
      const command = new ListMetricsCommand({
        Namespace: 'AWS/DynamoDB',
      });
      const result = await this.cloudWatchClient.send(command);
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        message: 'CloudWatch conectado exitosamente',
        responseTime,
        details: {
          metricsAvailable: result.Metrics?.length || 0,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error(`❌ Error conectando a CloudWatch: ${error.message}`);
      
      return {
        status: 'unhealthy',
        message: 'Error conectando a CloudWatch',
        responseTime,
        error: error.message,
      };
    }
  }

  async checkCredentials(): Promise<ServiceHealthStatus> {
    const startTime = Date.now();
    
    try {
      this.logger.log('🔍 Verificando credenciales AWS...');
      
      const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
      
      if (!accessKeyId || !secretAccessKey || 
          accessKeyId === 'your-aws-access-key-id' || 
          secretAccessKey === 'your-aws-secret-access-key') {
        return {
          status: 'unhealthy',
          message: 'Credenciales AWS no configuradas correctamente',
          responseTime: Date.now() - startTime,
          details: {
            accessKeyConfigured: !!accessKeyId && accessKeyId !== 'your-aws-access-key-id',
            secretKeyConfigured: !!secretAccessKey && secretAccessKey !== 'your-aws-secret-access-key',
            region: this.region,
          },
        };
      }

      // Verificar credenciales usando STS
      const command = new GetCallerIdentityCommand({});
      const result = await this.stsClient.send(command);
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        message: 'Credenciales AWS válidas',
        responseTime,
        details: {
          accountId: result.Account,
          userId: result.UserId,
          arn: result.Arn,
          region: this.region,
          accessKeyId: accessKeyId?.substring(0, 8) + '***', // Solo mostrar primeros 8 caracteres
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error(`❌ Error verificando credenciales: ${error.message}`);
      
      return {
        status: 'unhealthy',
        message: 'Credenciales AWS inválidas o sin permisos',
        responseTime,
        error: error.message,
      };
    }
  }

  private getResultFromPromise(promiseResult: PromiseSettledResult<ServiceHealthStatus>): ServiceHealthStatus {
    if (promiseResult.status === 'fulfilled') {
      return promiseResult.value;
    } else {
      return {
        status: 'unhealthy',
        message: 'Error interno durante la verificación',
        error: promiseResult.reason?.message || 'Unknown error',
      };
    }
  }
}