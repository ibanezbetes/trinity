import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class TrinityMatchmakingStack extends cdk.Stack {
  public readonly matchmakingFunction: lambda.Function;
  public readonly matchmakingTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Matchmaking DynamoDB Table
    this.matchmakingTable = new dynamodb.Table(this, 'trinity-matchmaking-dev', {
      tableName: 'trinity-matchmaking-dev',
      partitionKey: { name: 'matchId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl',
    });

    // Add GSI for room-based queries
    this.matchmakingTable.addGlobalSecondaryIndex({
      indexName: 'roomId-index',
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Matchmaking Lambda Function
    this.matchmakingFunction = new lambda.Function(this, 'trinity-matchmaker-dev', {
      functionName: 'trinity-matchmaker-dev',
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset('../../lambdas/trinity-matchmaker-dev'),
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      description: 'Trinity vote consensus matchmaking system',
      environment: {
        TRINITY_AWS_REGION: 'eu-west-1', // Use custom name to avoid reserved AWS_REGION
        NODE_OPTIONS: '--enable-source-maps',
        MATCHMAKING_TABLE: this.matchmakingTable.tableName,
      },
    });

    // Grant DynamoDB permissions
    this.matchmakingTable.grantReadWriteData(this.matchmakingFunction);

    // Grant CloudWatch Logs permissions
    this.matchmakingFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'cloudwatch:PutMetricData',
      ],
      resources: ['*'],
    }));

    // EventBridge rule for periodic matchmaking (every 5 minutes)
    const matchmakingRule = new events.Rule(this, 'MatchmakingScheduleRule', {
      ruleName: 'trinity-matchmaking-schedule',
      description: 'Trigger matchmaking process every 5 minutes',
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      enabled: true,
    });

    // Add Lambda as target for the rule
    matchmakingRule.addTarget(new targets.LambdaFunction(this.matchmakingFunction, {
      event: events.RuleTargetInput.fromObject({
        source: 'eventbridge.schedule',
        action: 'processMatches',
        timestamp: events.EventField.fromPath('$.time'),
      }),
    }));

    // Output important values
    new cdk.CfnOutput(this, 'MatchmakingTableName', {
      description: 'Matchmaking table name',
      value: this.matchmakingTable.tableName,
      exportName: `${this.stackName}:MatchmakingTableName`,
    });

    new cdk.CfnOutput(this, 'MatchmakingFunctionName', {
      description: 'Matchmaking function name',
      value: this.matchmakingFunction.functionName,
      exportName: `${this.stackName}:MatchmakingFunctionName`,
    });

    // Add tags
    cdk.Tags.of(this).add('Project', 'Trinity');
    cdk.Tags.of(this).add('Environment', 'dev');
    cdk.Tags.of(this).add('Stack', 'Matchmaking');
  }
}