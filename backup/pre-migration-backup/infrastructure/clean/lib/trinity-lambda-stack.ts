/**
 * Trinity Lambda Stack
 * Defines all Lambda functions with TypeScript source code
 * Using regular Lambda functions to avoid Windows bundling issues
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { TrinityEnvironmentConfig } from '../config/environments';

export interface TrinityLambdaStackProps extends cdk.StackProps {
  config: TrinityEnvironmentConfig;
  tables: Record<string, cdk.aws_dynamodb.Table>;
  parameterStore: any;
}

export class TrinityLambdaStack extends cdk.Stack {
  public readonly functions: Record<string, lambda.Function>;

  constructor(scope: Construct, id: string, props: TrinityLambdaStackProps) {
    super(scope, id, props);

    const { config, tables } = props;

    // Initialize functions object
    this.functions = {};

    // Common Lambda configuration
    const commonEnvironment = {
      NODE_ENV: config.environment,
      TRINITY_ENV: config.environment,
      LOG_LEVEL: config.api.logLevel,
      
      // DynamoDB table names
      USERS_TABLE: tables.users.tableName,
      ROOMS_TABLE: tables.rooms.tableName,
      ROOM_MEMBERS_TABLE: tables.roomMembers.tableName,
      ROOM_INVITES_TABLE: tables.roomInvites.tableName,
      VOTES_TABLE: tables.votes.tableName,
      MOVIES_CACHE_TABLE: tables.moviesCache.tableName,
      ROOM_MATCHES_TABLE: tables.roomMatches.tableName,
      CONNECTIONS_TABLE: tables.connections.tableName,
      ROOM_MOVIE_CACHE_TABLE: tables.roomMovieCache.tableName,
      ROOM_CACHE_METADATA_TABLE: tables.roomCacheMetadata.tableName,
      MATCHMAKING_TABLE: tables.matchmaking.tableName,
      FILTER_CACHE_TABLE: tables.filterCache.tableName,
    };

    // Create Lambda functions using pre-built code (avoiding bundling issues)
    this.functions.auth = new lambda.Function(this, 'AuthFunction', {
      functionName: `trinity-auth-${config.environment}`,
      description: 'Trinity user authentication and authorization',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'auth-handler.handler',
      code: lambda.Code.fromAsset('src/handlers'), // Use compiled JS in src/handlers
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: commonEnvironment,
    });

    this.functions.room = new lambda.Function(this, 'RoomFunction', {
      functionName: `trinity-room-${config.environment}`,
      description: 'Trinity room management and movie cache integration',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'room-handler.handler',
      code: lambda.Code.fromAsset('src/handlers'),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: commonEnvironment,
    });

    this.functions.vote = new lambda.Function(this, 'VoteFunction', {
      functionName: `trinity-vote-${config.environment}`,
      description: 'Trinity individual voting and match detection',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'vote-handler.handler',
      code: lambda.Code.fromAsset('src/handlers'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: commonEnvironment,
    });

    this.functions.movie = new lambda.Function(this, 'MovieFunction', {
      functionName: `trinity-movie-${config.environment}`,
      description: 'Trinity TMDB integration and movie data management',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'movie-handler.handler',
      code: lambda.Code.fromAsset('src/handlers'),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: commonEnvironment,
    });

    this.functions.cache = new lambda.Function(this, 'CacheFunction', {
      functionName: `trinity-cache-${config.environment}`,
      description: 'Trinity movie caching with deterministic ordering',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'cache-handler.handler',
      code: lambda.Code.fromAsset('src/handlers'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: commonEnvironment,
    });

    this.functions.realtime = new lambda.Function(this, 'RealtimeFunction', {
      functionName: `trinity-realtime-${config.environment}`,
      description: 'Trinity real-time notifications and WebSocket management',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'realtime-handler.handler',
      code: lambda.Code.fromAsset('src/handlers'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: commonEnvironment,
    });

    this.functions.matchmaker = new lambda.Function(this, 'MatchmakerFunction', {
      // NOTE: This function is deployed as trinity-vote-consensus-dev in AWS (naming discrepancy)
      functionName: `trinity-vote-consensus-${config.environment}`,
      description: 'Trinity vote consensus detection via DynamoDB Streams',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'matchmaker-handler.handler',
      code: lambda.Code.fromAsset('src/handlers'),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: commonEnvironment,
    });

    // Create IAM role for Lambda functions
    const lambdaRole = new iam.Role(this, 'TrinityLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Add DynamoDB permissions (including Streams for matchmaker)
    const dynamoDbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:BatchGetItem',
        'dynamodb:BatchWriteItem',
        'dynamodb:TransactWriteItems',
        'dynamodb:TransactGetItems',
        'dynamodb:DescribeStream',
        'dynamodb:GetRecords',
        'dynamodb:GetShardIterator',
        'dynamodb:ListStreams',
      ],
      resources: [
        `arn:aws:dynamodb:${config.region}:${this.account}:table/trinity-*`,
        `arn:aws:dynamodb:${config.region}:${this.account}:table/trinity-*/index/*`,
        `arn:aws:dynamodb:${config.region}:${this.account}:table/trinity-*/stream/*`,
      ],
    });

    // Add AppSync permissions for real-time notifications
    const appSyncPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'appsync:GraphQL',
        'appsync:EvaluateCode',
        'appsync:EvaluateMappingTemplate',
      ],
      resources: [
        `arn:aws:appsync:${config.region}:${this.account}:apis/*`,
        `arn:aws:appsync:${config.region}:${this.account}:apis/*/types/*`,
        `arn:aws:appsync:${config.region}:${this.account}:apis/*/fields/*`,
      ],
    });

    // Add Systems Manager Parameter Store permissions
    const ssmPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:GetParametersByPath',
      ],
      resources: [
        `arn:aws:ssm:${config.region}:${this.account}:parameter/trinity/${config.environment}/*`,
      ],
    });

    // Add CloudWatch Logs permissions
    const logsPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: [
        `arn:aws:logs:${config.region}:${this.account}:log-group:/aws/lambda/trinity-*`,
      ],
    });

    // Attach policies to role
    lambdaRole.addToPolicy(dynamoDbPolicy);
    lambdaRole.addToPolicy(appSyncPolicy);
    lambdaRole.addToPolicy(ssmPolicy);
    lambdaRole.addToPolicy(logsPolicy);

    // Apply role to all functions
    const functionList = Object.values(this.functions);

    functionList.forEach(func => {
      // Override the default role
      const cfnFunction = func.node.defaultChild as lambda.CfnFunction;
      cfnFunction.role = lambdaRole.roleArn;
    });

    // Add tags to all functions
    functionList.forEach(func => {
      cdk.Tags.of(func).add('Project', 'Trinity');
      cdk.Tags.of(func).add('Environment', config.environment);
      cdk.Tags.of(func).add('ManagedBy', 'CDK');
    });

    // Output function ARNs
    Object.entries(this.functions).forEach(([name, func]) => {
      new cdk.CfnOutput(this, `${name.charAt(0).toUpperCase() + name.slice(1)}FunctionArn`, {
        value: func.functionArn,
        description: `Trinity ${name.charAt(0).toUpperCase() + name.slice(1)} Function ARN`,
      });
    });
  }
}