# Deployment Guide

This guide covers deploying the Trinity Backend Refactored application to AWS environments.

## Overview

Trinity uses a serverless-first architecture deployed on AWS with the following components:

- **AWS Lambda**: Application logic and API endpoints
- **DynamoDB**: Primary database for application data
- **API Gateway**: HTTP API management and routing
- **AppSync**: GraphQL API for mobile applications
- **CloudFront**: CDN for static assets and API caching
- **Cognito**: User authentication and authorization
- **CloudWatch**: Logging, monitoring, and alerting

## Environments

| Environment | Purpose | URL | Branch |
|-------------|---------|-----|--------|
| Development | Local development | http://localhost:3000 | feature/* |
| Staging | Pre-production testing | https://api-staging.trinity.example.com | develop |
| Production | Live application | https://api.trinity.example.com | main |

## Prerequisites

### Required Tools

```bash
# Install AWS CDK
npm install -g aws-cdk

# Install AWS CLI
# macOS
brew install awscli

# Windows
choco install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### AWS Account Setup

1. **Create AWS Account**: If you don't have one already
2. **Configure IAM User**: Create user with appropriate permissions
3. **Set up AWS CLI**: Configure credentials and default region

```bash
# Configure AWS CLI
aws configure

# Verify configuration
aws sts get-caller-identity
```

### Required AWS Permissions

The deployment user needs the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "apigateway:*",
        "dynamodb:*",
        "appsync:*",
        "cognito-idp:*",
        "cloudformation:*",
        "iam:*",
        "s3:*",
        "cloudwatch:*",
        "logs:*",
        "events:*",
        "sns:*",
        "sqs:*"
      ],
      "Resource": "*"
    }
  ]
}
```

## Deployment Methods

### 1. Automated Deployment (Recommended)

#### GitHub Actions CI/CD

The project includes automated deployment via GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Run quality checks
        run: npm run quality:gates
      
      - name: Deploy to staging
        if: github.ref == 'refs/heads/develop'
        run: npm run deploy:staging
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      
      - name: Deploy to production
        if: github.ref == 'refs/heads/main'
        run: npm run deploy:prod
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

#### Required GitHub Secrets

Configure these secrets in your GitHub repository:

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS access key for deployment |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for deployment |
| `TMDB_API_KEY` | The Movie Database API key |
| `JWT_SECRET` | JWT signing secret |

### 2. Manual Deployment

#### Development Environment

```bash
# Install dependencies
npm install

# Run quality checks
npm run quality:check

# Deploy to development
npm run deploy:dev
```

#### Staging Environment

```bash
# Set environment
export NODE_ENV=staging
export AWS_PROFILE=staging

# Deploy to staging
npm run deploy:staging

# Run smoke tests
npm run test:smoke:staging
```

#### Production Environment

```bash
# Set environment
export NODE_ENV=production
export AWS_PROFILE=production

# Deploy to production
npm run deploy:prod

# Run smoke tests
npm run test:smoke:prod
```

## Deployment Scripts

### Package.json Scripts

```json
{
  "scripts": {
    "deploy:dev": "cdk deploy --all --profile dev --require-approval never",
    "deploy:staging": "cdk deploy --all --profile staging --require-approval never",
    "deploy:prod": "cdk deploy --all --profile production --require-approval never",
    "deploy:rollback": "cdk deploy --rollback",
    "deploy:diff": "cdk diff --all",
    "deploy:synth": "cdk synth --all"
  }
}
```

### Custom Deployment Script

Create `scripts/deploy.sh`:

```bash
#!/bin/bash

set -e

ENVIRONMENT=${1:-development}
REGION=${2:-us-east-1}

echo "🚀 Deploying to $ENVIRONMENT environment in $REGION region"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
  echo "❌ Invalid environment. Use: development, staging, or production"
  exit 1
fi

# Set AWS profile based on environment
export AWS_PROFILE=$ENVIRONMENT
export AWS_DEFAULT_REGION=$REGION

# Run pre-deployment checks
echo "🔍 Running pre-deployment checks..."
npm run lint
npm run type-check
npm run test
npm run quality:gates

# Build the application
echo "🔨 Building application..."
npm run build

# Deploy infrastructure
echo "📦 Deploying infrastructure..."
cdk deploy --all --require-approval never

# Run post-deployment tests
echo "🧪 Running post-deployment tests..."
npm run test:smoke

echo "✅ Deployment completed successfully!"
```

## Infrastructure as Code

### CDK Stack Configuration

The main CDK stack is defined in `lib/trinity-stack.ts`:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class TrinityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Tables
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: `trinity-users-${this.stage}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Lambda Functions
    const authFunction = new lambda.Function(this, 'AuthFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'auth.handler',
      code: lambda.Code.fromAsset('dist'),
      environment: {
        USERS_TABLE_NAME: usersTable.tableName,
        JWT_SECRET: process.env.JWT_SECRET!,
      },
    });

    // API Gateway
    const api = new apigateway.RestApi(this, 'TrinityApi', {
      restApiName: `trinity-api-${this.stage}`,
      description: 'Trinity Backend API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Grant permissions
    usersTable.grantReadWriteData(authFunction);
  }

  private get stage(): string {
    return this.node.tryGetContext('stage') || 'dev';
  }
}
```

### Environment-Specific Configuration

Create `cdk.context.json`:

```json
{
  "development": {
    "region": "us-east-1",
    "account": "123456789012",
    "stage": "dev",
    "domainName": "api-dev.trinity.example.com"
  },
  "staging": {
    "region": "us-east-1",
    "account": "123456789012",
    "stage": "staging",
    "domainName": "api-staging.trinity.example.com"
  },
  "production": {
    "region": "us-east-1",
    "account": "987654321098",
    "stage": "prod",
    "domainName": "api.trinity.example.com"
  }
}
```

## Database Migration

### DynamoDB Table Management

```bash
# Create tables
npm run db:create

# Migrate data
npm run db:migrate

# Seed test data (non-production only)
npm run db:seed
```

### Migration Scripts

Create `scripts/migrate-data.ts`:

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

export class DataMigration {
  private readonly client: DynamoDBDocumentClient;

  constructor() {
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  async migrateUsers(): Promise<void> {
    console.log('🔄 Migrating users...');
    
    // Scan old table
    const oldUsers = await this.client.send(new ScanCommand({
      TableName: 'trinity-users-old',
    }));

    // Transform and insert into new table
    for (const user of oldUsers.Items || []) {
      const transformedUser = this.transformUser(user);
      await this.client.send(new PutCommand({
        TableName: 'trinity-users-new',
        Item: transformedUser,
      }));
    }

    console.log(`✅ Migrated ${oldUsers.Items?.length} users`);
  }

  private transformUser(oldUser: any): any {
    return {
      id: oldUser.user_id,
      email: oldUser.email_address,
      displayName: oldUser.display_name,
      createdAt: oldUser.created_at,
      updatedAt: new Date().toISOString(),
    };
  }
}
```

## Monitoring and Observability

### CloudWatch Setup

The deployment automatically sets up:

- **Log Groups**: For Lambda function logs
- **Metrics**: Custom application metrics
- **Alarms**: For error rates and performance
- **Dashboards**: Application monitoring dashboard

### Custom Metrics

```typescript
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

export class MetricsService {
  private readonly cloudWatch = new CloudWatchClient({});

  async recordMetric(name: string, value: number, unit: string = 'Count'): Promise<void> {
    await this.cloudWatch.send(new PutMetricDataCommand({
      Namespace: 'Trinity/Application',
      MetricData: [{
        MetricName: name,
        Value: value,
        Unit: unit,
        Timestamp: new Date(),
      }],
    }));
  }
}
```

## Security Configuration

### Environment Variables

Sensitive configuration is managed through AWS Systems Manager Parameter Store:

```bash
# Store secrets
aws ssm put-parameter \
  --name "/trinity/prod/jwt-secret" \
  --value "your-jwt-secret" \
  --type "SecureString"

aws ssm put-parameter \
  --name "/trinity/prod/tmdb-api-key" \
  --value "your-tmdb-key" \
  --type "SecureString"
```

### IAM Roles and Policies

Lambda functions use least-privilege IAM roles:

```typescript
const lambdaRole = new iam.Role(this, 'LambdaRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
  ],
  inlinePolicies: {
    DynamoDBAccess: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
          resources: [usersTable.tableArn],
        }),
      ],
    }),
  },
});
```

## Rollback Procedures

### Automatic Rollback

CloudFormation provides automatic rollback on deployment failures.

### Manual Rollback

```bash
# List stack events to identify issues
aws cloudformation describe-stack-events --stack-name trinity-prod

# Rollback to previous version
cdk deploy --rollback

# Or rollback specific stack
aws cloudformation cancel-update-stack --stack-name trinity-prod
```

### Database Rollback

```bash
# Restore from point-in-time backup
aws dynamodb restore-table-from-backup \
  --target-table-name trinity-users-prod \
  --backup-arn arn:aws:dynamodb:us-east-1:123456789012:table/trinity-users-prod/backup/01234567890123-abcdefgh
```

## Performance Optimization

### Lambda Optimization

- **Memory Allocation**: Right-size based on profiling
- **Provisioned Concurrency**: For critical functions
- **Connection Pooling**: Reuse database connections
- **Bundle Size**: Minimize deployment packages

### DynamoDB Optimization

- **Partition Key Design**: Distribute load evenly
- **Global Secondary Indexes**: Optimize query patterns
- **Auto Scaling**: Enable for variable workloads
- **DAX**: Add caching for read-heavy workloads

## Cost Optimization

### Monitoring Costs

```bash
# Get cost and usage data
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```

### Cost Optimization Strategies

1. **Right-size Lambda functions**: Monitor memory usage
2. **Use DynamoDB On-Demand**: For variable workloads
3. **Enable S3 Intelligent Tiering**: For storage optimization
4. **Set up billing alerts**: Monitor spending
5. **Regular cost reviews**: Identify optimization opportunities

## Troubleshooting

### Common Deployment Issues

#### CDK Bootstrap Issues
```bash
# Bootstrap CDK in your account/region
cdk bootstrap aws://ACCOUNT-NUMBER/REGION
```

#### Permission Errors
```bash
# Check IAM permissions
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:user/deployment-user \
  --action-names lambda:CreateFunction \
  --resource-arns "*"
```

#### Lambda Function Errors
```bash
# Check function logs
aws logs tail /aws/lambda/trinity-auth-prod --follow

# Get function configuration
aws lambda get-function --function-name trinity-auth-prod
```

### Health Checks

Create health check endpoints:

```typescript
@Get('health')
async healthCheck(): Promise<{ status: string; timestamp: string }> {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
  };
}
```

### Monitoring Deployment

```bash
# Monitor stack deployment
aws cloudformation describe-stacks --stack-name trinity-prod

# Watch stack events
aws cloudformation describe-stack-events --stack-name trinity-prod
```

## Best Practices

### Deployment Best Practices

1. **Use Infrastructure as Code**: All infrastructure in CDK
2. **Environment Parity**: Keep environments similar
3. **Automated Testing**: Test before deployment
4. **Gradual Rollouts**: Use blue-green or canary deployments
5. **Monitor Everything**: Comprehensive observability

### Security Best Practices

1. **Least Privilege**: Minimal IAM permissions
2. **Secrets Management**: Use Parameter Store/Secrets Manager
3. **Encryption**: Encrypt data at rest and in transit
4. **Network Security**: Use VPCs and security groups
5. **Regular Updates**: Keep dependencies updated

### Operational Best Practices

1. **Monitoring**: Set up alerts and dashboards
2. **Logging**: Structured logging with correlation IDs
3. **Backup**: Regular backups and tested restore procedures
4. **Documentation**: Keep deployment docs updated
5. **Runbooks**: Document common operational procedures