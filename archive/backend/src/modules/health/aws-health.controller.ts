import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AwsHealthService } from './aws-health.service';

@ApiTags('health')
@Controller('health/aws')
export class AwsHealthController {
  constructor(private readonly awsHealthService: AwsHealthService) {}

  @Get()
  @ApiOperation({ summary: 'Verificar conectividad con servicios AWS' })
  @ApiResponse({ 
    status: 200, 
    description: 'Estado de conectividad con servicios AWS',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        services: {
          type: 'object',
          properties: {
            dynamodb: { type: 'object' },
            cognito: { type: 'object' },
            s3: { type: 'object' },
            cloudwatch: { type: 'object' }
          }
        },
        timestamp: { type: 'string' },
        region: { type: 'string' }
      }
    }
  })
  async checkAwsHealth() {
    return this.awsHealthService.checkAllServices();
  }

  @Get('dynamodb')
  @ApiOperation({ summary: 'Verificar conectividad con DynamoDB' })
  async checkDynamoDB() {
    return this.awsHealthService.checkDynamoDB();
  }

  @Get('cognito')
  @ApiOperation({ summary: 'Verificar conectividad con Cognito' })
  async checkCognito() {
    return this.awsHealthService.checkCognito();
  }

  @Get('s3')
  @ApiOperation({ summary: 'Verificar conectividad con S3' })
  async checkS3() {
    return this.awsHealthService.checkS3();
  }

  @Get('cloudwatch')
  @ApiOperation({ summary: 'Verificar conectividad con CloudWatch' })
  async checkCloudWatch() {
    return this.awsHealthService.checkCloudWatch();
  }

  @Get('credentials')
  @ApiOperation({ summary: 'Verificar credenciales AWS (sin exponer valores)' })
  async checkCredentials() {
    return this.awsHealthService.checkCredentials();
  }
}