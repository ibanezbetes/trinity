/**
 * Trinity Monitoring Stack
 * 
 * Comprehensive CloudWatch monitoring, dashboards, and alerting
 * for all Trinity infrastructure components
 */

import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { TrinityEnvironmentConfig } from '../config/environments';
import { generateResourceNames } from '../config/resource-naming';

interface TrinityMonitoringStackProps extends cdk.StackProps {
  config: TrinityEnvironmentConfig;
  lambdaFunctions: string[];
  dynamodbTables: string[];
  appSyncApis: string[];
}

export class TrinityMonitoringStack extends cdk.Stack {
  public readonly dashboards: { [key: string]: cloudwatch.Dashboard } = {};
  public readonly alarms: { [key: string]: cloudwatch.Alarm } = {};
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: TrinityMonitoringStackProps) {
    super(scope, id, props);

    const { config, lambdaFunctions, dynamodbTables, appSyncApis } = props;
    const resourceNames = generateResourceNames({
      project: 'trinity',
      environment: config.environment,
      region: config.region || 'eu-west-1'
    });

    // Create SNS topic for alerts
    this.alertTopic = this.createAlertTopic(config);

    // Create dashboards
    this.createOverviewDashboard(config, resourceNames);
    this.createLambdaDashboard(config, lambdaFunctions, resourceNames);
    this.createDynamoDBDashboard(config, dynamodbTables, resourceNames);
    this.createApiDashboard(config, appSyncApis, resourceNames);

    // Create alarms
    this.createLambdaAlarms(config, lambdaFunctions);
    this.createDynamoDBAlarms(config, dynamodbTables);
    this.createApiAlarms(config, appSyncApis);

    // Add stack-level tags
    cdk.Tags.of(this).add('Project', 'Trinity');
    cdk.Tags.of(this).add('Environment', config.environment);
    cdk.Tags.of(this).add('Stack', 'Monitoring');
  }

  /**
   * Create SNS topic for alerts
   */
  private createAlertTopic(config: TrinityEnvironmentConfig): sns.Topic {
    const topic = new sns.Topic(this, 'TrinityAlertTopic', {
      topicName: `trinity-alerts-${config.environment}`,
      displayName: `Trinity ${config.environment} Alerts`,
    });

    // Add email subscription if configured
    if (config.monitoring?.alertEmail) {
      topic.addSubscription(new snsSubscriptions.EmailSubscription(config.monitoring.alertEmail));
    }

    return topic;
  }

  /**
   * Create overview dashboard
   */
  private createOverviewDashboard(config: TrinityEnvironmentConfig, resourceNames: any): void {
    this.dashboards.overview = new cloudwatch.Dashboard(this, 'TrinityOverviewDashboard', {
      dashboardName: resourceNames.cloudWatch.dashboards.main,
      widgets: [
        [
          // System Health Overview
          new cloudwatch.TextWidget({
            markdown: `# Trinity ${config.environment.toUpperCase()} - System Overview\n\nReal-time monitoring of Trinity infrastructure components.`,
            width: 24,
            height: 2,
          }),
        ],
        [
          // Lambda Functions Health
          new cloudwatch.GraphWidget({
            title: 'Lambda Functions - Invocations',
            width: 12,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: 'Invocations',
                dimensionsMap: { FunctionName: 'trinity-auth-dev' },
                statistic: 'Sum',
                label: 'Auth Function',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: 'Invocations',
                dimensionsMap: { FunctionName: 'trinity-movie-dev' },
                statistic: 'Sum',
                label: 'Movie Function',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: 'Invocations',
                dimensionsMap: { FunctionName: 'trinity-room-dev' },
                statistic: 'Sum',
                label: 'Room Function',
              }),
            ],
          }),

          // Lambda Functions Errors
          new cloudwatch.GraphWidget({
            title: 'Lambda Functions - Errors',
            width: 12,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: 'Errors',
                dimensionsMap: { FunctionName: 'trinity-auth-dev' },
                statistic: 'Sum',
                label: 'Auth Errors',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: 'Errors',
                dimensionsMap: { FunctionName: 'trinity-movie-dev' },
                statistic: 'Sum',
                label: 'Movie Errors',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: 'Errors',
                dimensionsMap: { FunctionName: 'trinity-room-dev' },
                statistic: 'Sum',
                label: 'Room Errors',
              }),
            ],
          }),
        ],
        [
          // DynamoDB Operations
          new cloudwatch.GraphWidget({
            title: 'DynamoDB - Read/Write Operations',
            width: 12,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/DynamoDB',
                metricName: 'ConsumedReadCapacityUnits',
                dimensionsMap: { TableName: 'trinity-users-dev' },
                statistic: 'Sum',
                label: 'Users Read',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/DynamoDB',
                metricName: 'ConsumedWriteCapacityUnits',
                dimensionsMap: { TableName: 'trinity-users-dev' },
                statistic: 'Sum',
                label: 'Users Write',
              }),
            ],
          }),

          // API Gateway Requests
          new cloudwatch.GraphWidget({
            title: 'AppSync API - Requests',
            width: 12,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/AppSync',
                metricName: '4XXError',
                statistic: 'Sum',
                label: 'Client Errors',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/AppSync',
                metricName: '5XXError',
                statistic: 'Sum',
                label: 'Server Errors',
              }),
            ],
          }),
        ],
      ],
    });
  }

  /**
   * Create Lambda-specific dashboard
   */
  private createLambdaDashboard(config: TrinityEnvironmentConfig, lambdaFunctions: string[], resourceNames: any): void {
    const widgets: cloudwatch.IWidget[][] = [
      [
        new cloudwatch.TextWidget({
          markdown: `# Lambda Functions Monitoring\n\nDetailed metrics for all Trinity Lambda functions.`,
          width: 24,
          height: 2,
        }),
      ],
    ];

    // Create widgets for each Lambda function
    lambdaFunctions.forEach((functionName, index) => {
      if (index % 2 === 0) {
        widgets.push([]);
      }

      const currentRow = widgets[widgets.length - 1];

      // Duration and Invocations
      currentRow.push(
        new cloudwatch.GraphWidget({
          title: `${functionName} - Performance`,
          width: 12,
          height: 6,
          left: [
            new cloudwatch.Metric({
              namespace: 'AWS/Lambda',
              metricName: 'Duration',
              dimensionsMap: { FunctionName: functionName },
              statistic: 'Average',
              label: 'Avg Duration',
            }),
            new cloudwatch.Metric({
              namespace: 'AWS/Lambda',
              metricName: 'Duration',
              dimensionsMap: { FunctionName: functionName },
              statistic: 'Maximum',
              label: 'Max Duration',
            }),
          ],
          right: [
            new cloudwatch.Metric({
              namespace: 'AWS/Lambda',
              metricName: 'Invocations',
              dimensionsMap: { FunctionName: functionName },
              statistic: 'Sum',
              label: 'Invocations',
            }),
          ],
        })
      );

      // If this is an odd-indexed function or the last function, add error widget
      if (index % 2 === 1 || index === lambdaFunctions.length - 1) {
        if (currentRow.length === 1) {
          currentRow.push(
            new cloudwatch.GraphWidget({
              title: `${functionName} - Errors & Throttles`,
              width: 12,
              height: 6,
              left: [
                new cloudwatch.Metric({
                  namespace: 'AWS/Lambda',
                  metricName: 'Errors',
                  dimensionsMap: { FunctionName: functionName },
                  statistic: 'Sum',
                  label: 'Errors',
                }),
                new cloudwatch.Metric({
                  namespace: 'AWS/Lambda',
                  metricName: 'Throttles',
                  dimensionsMap: { FunctionName: functionName },
                  statistic: 'Sum',
                  label: 'Throttles',
                }),
              ],
            })
          );
        }
      }
    });

    this.dashboards.lambda = new cloudwatch.Dashboard(this, 'TrinityLambdaDashboard', {
      dashboardName: resourceNames.cloudWatch.dashboards.lambda,
      widgets,
    });
  }

  /**
   * Create DynamoDB-specific dashboard
   */
  private createDynamoDBDashboard(config: TrinityEnvironmentConfig, dynamodbTables: string[], resourceNames: any): void {
    const widgets: cloudwatch.IWidget[][] = [
      [
        new cloudwatch.TextWidget({
          markdown: `# DynamoDB Tables Monitoring\n\nCapacity utilization and performance metrics for all Trinity tables.`,
          width: 24,
          height: 2,
        }),
      ],
    ];

    // Create widgets for key tables
    const keyTables = ['trinity-users-dev', 'trinity-rooms-dev-v2', 'trinity-votes-dev'];
    
    keyTables.forEach((tableName, index) => {
      if (index % 2 === 0) {
        widgets.push([]);
      }

      const currentRow = widgets[widgets.length - 1];

      currentRow.push(
        new cloudwatch.GraphWidget({
          title: `${tableName} - Operations`,
          width: 12,
          height: 6,
          left: [
            new cloudwatch.Metric({
              namespace: 'AWS/DynamoDB',
              metricName: 'ConsumedReadCapacityUnits',
              dimensionsMap: { TableName: tableName },
              statistic: 'Sum',
              label: 'Read Capacity',
            }),
            new cloudwatch.Metric({
              namespace: 'AWS/DynamoDB',
              metricName: 'ConsumedWriteCapacityUnits',
              dimensionsMap: { TableName: tableName },
              statistic: 'Sum',
              label: 'Write Capacity',
            }),
          ],
        })
      );
    });

    this.dashboards.database = new cloudwatch.Dashboard(this, 'TrinityDynamoDBDashboard', {
      dashboardName: resourceNames.cloudWatch.dashboards.database,
      widgets,
    });
  }

  /**
   * Create API-specific dashboard
   */
  private createApiDashboard(config: TrinityEnvironmentConfig, appSyncApis: string[], resourceNames: any): void {
    this.dashboards.api = new cloudwatch.Dashboard(this, 'TrinityApiDashboard', {
      dashboardName: resourceNames.cloudWatch.dashboards.api,
      widgets: [
        [
          new cloudwatch.TextWidget({
            markdown: `# AppSync API Monitoring\n\nRequest rates, errors, and latency for Trinity GraphQL APIs.`,
            width: 24,
            height: 2,
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'API Requests',
            width: 12,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/AppSync',
                metricName: 'ConnectSuccess',
                statistic: 'Sum',
                label: 'Successful Connections',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/AppSync',
                metricName: 'ConnectClientError',
                statistic: 'Sum',
                label: 'Connection Client Errors',
              }),
            ],
          }),

          new cloudwatch.GraphWidget({
            title: 'API Errors',
            width: 12,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/AppSync',
                metricName: '4XXError',
                statistic: 'Sum',
                label: 'Client Errors (4XX)',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/AppSync',
                metricName: '5XXError',
                statistic: 'Sum',
                label: 'Server Errors (5XX)',
              }),
            ],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'API Latency',
            width: 24,
            height: 6,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/AppSync',
                metricName: 'Latency',
                statistic: 'Average',
                label: 'Average Latency',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/AppSync',
                metricName: 'Latency',
                statistic: 'p99',
                label: 'P99 Latency',
              }),
            ],
          }),
        ],
      ],
    });
  }

  /**
   * Create Lambda function alarms
   */
  private createLambdaAlarms(config: TrinityEnvironmentConfig, lambdaFunctions: string[]): void {
    lambdaFunctions.forEach(functionName => {
      // Error rate alarm
      this.alarms[`${functionName}-errors`] = new cloudwatch.Alarm(this, `${functionName}ErrorAlarm`, {
        alarmName: `${functionName}-error-rate`,
        alarmDescription: `High error rate for ${functionName}`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: functionName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: config.environment === 'production' ? 5 : 10,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      });

      // Duration alarm
      this.alarms[`${functionName}-duration`] = new cloudwatch.Alarm(this, `${functionName}DurationAlarm`, {
        alarmName: `${functionName}-high-duration`,
        alarmDescription: `High duration for ${functionName}`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: functionName },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
        threshold: config.environment === 'production' ? 10000 : 15000, // milliseconds
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      });

      // Add SNS actions to alarms
      this.alarms[`${functionName}-errors`].addAlarmAction(
        new cloudwatchActions.SnsAction(this.alertTopic)
      );
      this.alarms[`${functionName}-duration`].addAlarmAction(
        new cloudwatchActions.SnsAction(this.alertTopic)
      );
    });
  }

  /**
   * Create DynamoDB alarms
   */
  private createDynamoDBAlarms(config: TrinityEnvironmentConfig, dynamodbTables: string[]): void {
    dynamodbTables.forEach(tableName => {
      // Throttle alarm
      this.alarms[`${tableName}-throttles`] = new cloudwatch.Alarm(this, `${tableName}ThrottleAlarm`, {
        alarmName: `${tableName}-throttles`,
        alarmDescription: `Throttling detected for ${tableName}`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ReadThrottles',
          dimensionsMap: { TableName: tableName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      });

      // Add SNS action
      this.alarms[`${tableName}-throttles`].addAlarmAction(
        new cloudwatchActions.SnsAction(this.alertTopic)
      );
    });
  }

  /**
   * Create AppSync API alarms
   */
  private createApiAlarms(config: TrinityEnvironmentConfig, appSyncApis: string[]): void {
    // API Error rate alarm
    this.alarms['api-errors'] = new cloudwatch.Alarm(this, 'ApiErrorAlarm', {
      alarmName: 'trinity-api-error-rate',
      alarmDescription: 'High error rate for Trinity API',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/AppSync',
        metricName: '5XXError',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: config.environment === 'production' ? 10 : 20,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    // API Latency alarm
    this.alarms['api-latency'] = new cloudwatch.Alarm(this, 'ApiLatencyAlarm', {
      alarmName: 'trinity-api-high-latency',
      alarmDescription: 'High latency for Trinity API',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/AppSync',
        metricName: 'Latency',
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: config.environment === 'production' ? 2000 : 5000, // milliseconds
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // Add SNS actions
    this.alarms['api-errors'].addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
    this.alarms['api-latency'].addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
  }

  /**
   * Create log retention policies
   */
  createLogRetentionPolicies(lambdaFunctions: string[], config: TrinityEnvironmentConfig): void {
    const retentionDays = config.monitoring?.retentionDays || 
      (config.environment === 'production' ? 90 : 
       config.environment === 'staging' ? 30 : 7);

    lambdaFunctions.forEach(functionName => {
      new logs.LogGroup(this, `${functionName}LogGroup`, {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: this.getLogRetention(retentionDays),
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    });
  }

  /**
   * Convert days to CloudWatch log retention enum
   */
  private getLogRetention(days: number): logs.RetentionDays {
    if (days <= 1) return logs.RetentionDays.ONE_DAY;
    if (days <= 3) return logs.RetentionDays.THREE_DAYS;
    if (days <= 5) return logs.RetentionDays.FIVE_DAYS;
    if (days <= 7) return logs.RetentionDays.ONE_WEEK;
    if (days <= 14) return logs.RetentionDays.TWO_WEEKS;
    if (days <= 30) return logs.RetentionDays.ONE_MONTH;
    if (days <= 60) return logs.RetentionDays.TWO_MONTHS;
    if (days <= 90) return logs.RetentionDays.THREE_MONTHS;
    if (days <= 120) return logs.RetentionDays.FOUR_MONTHS;
    if (days <= 150) return logs.RetentionDays.FIVE_MONTHS;
    if (days <= 180) return logs.RetentionDays.SIX_MONTHS;
    if (days <= 365) return logs.RetentionDays.ONE_YEAR;
    return logs.RetentionDays.INFINITE;
  }
}