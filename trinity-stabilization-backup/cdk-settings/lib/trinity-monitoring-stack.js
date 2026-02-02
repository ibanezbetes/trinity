"use strict";
/**
 * Trinity Monitoring Stack
 *
 * Comprehensive CloudWatch monitoring, dashboards, and alerting
 * for all Trinity infrastructure components
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrinityMonitoringStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const cloudwatchActions = __importStar(require("aws-cdk-lib/aws-cloudwatch-actions"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const snsSubscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const resource_naming_1 = require("../config/resource-naming");
class TrinityMonitoringStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        this.dashboards = {};
        this.alarms = {};
        const { config, lambdaFunctions, dynamodbTables, appSyncApis } = props;
        const resourceNames = (0, resource_naming_1.generateResourceNames)({
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
    createAlertTopic(config) {
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
    createOverviewDashboard(config, resourceNames) {
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
    createLambdaDashboard(config, lambdaFunctions, resourceNames) {
        const widgets = [
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
            currentRow.push(new cloudwatch.GraphWidget({
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
            }));
            // If this is an odd-indexed function or the last function, add error widget
            if (index % 2 === 1 || index === lambdaFunctions.length - 1) {
                if (currentRow.length === 1) {
                    currentRow.push(new cloudwatch.GraphWidget({
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
                    }));
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
    createDynamoDBDashboard(config, dynamodbTables, resourceNames) {
        const widgets = [
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
            currentRow.push(new cloudwatch.GraphWidget({
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
            }));
        });
        this.dashboards.database = new cloudwatch.Dashboard(this, 'TrinityDynamoDBDashboard', {
            dashboardName: resourceNames.cloudWatch.dashboards.database,
            widgets,
        });
    }
    /**
     * Create API-specific dashboard
     */
    createApiDashboard(config, appSyncApis, resourceNames) {
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
    createLambdaAlarms(config, lambdaFunctions) {
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
            this.alarms[`${functionName}-errors`].addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
            this.alarms[`${functionName}-duration`].addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
        });
    }
    /**
     * Create DynamoDB alarms
     */
    createDynamoDBAlarms(config, dynamodbTables) {
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
            this.alarms[`${tableName}-throttles`].addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
        });
    }
    /**
     * Create AppSync API alarms
     */
    createApiAlarms(config, appSyncApis) {
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
    createLogRetentionPolicies(lambdaFunctions, config) {
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
    getLogRetention(days) {
        if (days <= 1)
            return logs.RetentionDays.ONE_DAY;
        if (days <= 3)
            return logs.RetentionDays.THREE_DAYS;
        if (days <= 5)
            return logs.RetentionDays.FIVE_DAYS;
        if (days <= 7)
            return logs.RetentionDays.ONE_WEEK;
        if (days <= 14)
            return logs.RetentionDays.TWO_WEEKS;
        if (days <= 30)
            return logs.RetentionDays.ONE_MONTH;
        if (days <= 60)
            return logs.RetentionDays.TWO_MONTHS;
        if (days <= 90)
            return logs.RetentionDays.THREE_MONTHS;
        if (days <= 120)
            return logs.RetentionDays.FOUR_MONTHS;
        if (days <= 150)
            return logs.RetentionDays.FIVE_MONTHS;
        if (days <= 180)
            return logs.RetentionDays.SIX_MONTHS;
        if (days <= 365)
            return logs.RetentionDays.ONE_YEAR;
        return logs.RetentionDays.INFINITE;
    }
}
exports.TrinityMonitoringStack = TrinityMonitoringStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpbml0eS1tb25pdG9yaW5nLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidHJpbml0eS1tb25pdG9yaW5nLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7R0FLRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCxzRkFBd0U7QUFDeEUseURBQTJDO0FBQzNDLG9GQUFzRTtBQUN0RSwyREFBNkM7QUFHN0MsK0RBQWtFO0FBU2xFLE1BQWEsc0JBQXVCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFLbkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFrQztRQUMxRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUxWLGVBQVUsR0FBNEMsRUFBRSxDQUFDO1FBQ3pELFdBQU0sR0FBd0MsRUFBRSxDQUFDO1FBTS9ELE1BQU0sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFDdkUsTUFBTSxhQUFhLEdBQUcsSUFBQSx1Q0FBcUIsRUFBQztZQUMxQyxPQUFPLEVBQUUsU0FBUztZQUNsQixXQUFXLEVBQUUsTUFBTSxDQUFDLFdBQVc7WUFDL0IsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNLElBQUksV0FBVztTQUNyQyxDQUFDLENBQUM7UUFFSCw4QkFBOEI7UUFDOUIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFaEQsb0JBQW9CO1FBQ3BCLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE1BQU0sRUFBRSxlQUFlLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDbkUsSUFBSSxDQUFDLHVCQUF1QixDQUFD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QUFPLENBQUM7UUFDakQsSUFBSSxJQUFJLElBQUksQ0FBQztZQUFFLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUM7UUFDcEQsSUFBSSxJQUFJLElBQUksQ0FBQztZQUFFLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUM7UUFDbkQsSUFBSSxJQUFJLElBQUksQ0FBQztZQUFFLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUM7UUFDbEQsSUFBSSxJQUFJLElBQUksRUFBRTtZQUFFLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUM7UUFDcEQsSUFBSSxJQUFJLElBQUksRUFBRTtZQUFFLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUM7UUFDcEQsSUFBSSxJQUFJLElBQUksRUFBRTtZQUFFLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUM7UUFDckQsSUFBSSxJQUFJLElBQUksRUFBRTtZQUFFLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUM7UUFDdkQsSUFBSSxJQUFJLElBQUksR0FBRztZQUFFLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUM7UUFDdkQsSUFBSSxJQUFJLElBQUksR0FBRztZQUFFLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUM7UUFDdkQsSUFBSSxJQUFJLElBQUksR0FBRztZQUFFLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUM7UUFDdEQsSUFBSSxJQUFJLElBQUksR0FBRztZQUFFLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUM7UUFDcEQsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQztJQUNyQyxDQUFDO0NBQ0Y7QUF6aUJELHdEQXlpQkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogVHJpbml0eSBNb25pdG9yaW5nIFN0YWNrXHJcbiAqIFxyXG4gKiBDb21wcmVoZW5zaXZlIENsb3VkV2F0Y2ggbW9uaXRvcmluZywgZGFzaGJvYXJkcywgYW5kIGFsZXJ0aW5nXHJcbiAqIGZvciBhbGwgVHJpbml0eSBpbmZyYXN0cnVjdHVyZSBjb21wb25lbnRzXHJcbiAqL1xyXG5cclxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XHJcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2hBY3Rpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoLWFjdGlvbnMnO1xyXG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XHJcbmltcG9ydCAqIGFzIHNuc1N1YnNjcmlwdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucy1zdWJzY3JpcHRpb25zJztcclxuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5pbXBvcnQgeyBUcmluaXR5RW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9jb25maWcvZW52aXJvbm1lbnRzJztcclxuaW1wb3J0IHsgZ2VuZXJhdGVSZXNvdXJjZU5hbWVzIH0gZnJvbSAnLi4vY29uZmlnL3Jlc291cmNlLW5hbWluZyc7XHJcblxyXG5pbnRlcmZhY2UgVHJpbml0eU1vbml0b3JpbmdTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xyXG4gIGNvbmZpZzogVHJpbml0eUVudmlyb25tZW50Q29uZmlnO1xyXG4gIGxhbWJkYUZ1bmN0aW9uczogc3RyaW5nW107XHJcbiAgZHluYW1vZGJUYWJsZXM6IHN0cmluZ1tdO1xyXG4gIGFwcFN5bmNBcGlzOiBzdHJpbmdbXTtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFRyaW5pdHlNb25pdG9yaW5nU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIHB1YmxpYyByZWFkb25seSBkYXNoYm9hcmRzOiB7IFtrZXk6IHN0cmluZ106IGNsb3Vkd2F0Y2guRGFzaGJvYXJkIH0gPSB7fTtcclxuICBwdWJsaWMgcmVhZG9ubHkgYWxhcm1zOiB7IFtrZXk6IHN0cmluZ106IGNsb3Vkd2F0Y2guQWxhcm0gfSA9IHt9O1xyXG4gIHB1YmxpYyByZWFkb25seSBhbGVydFRvcGljOiBzbnMuVG9waWM7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBUcmluaXR5TW9uaXRvcmluZ1N0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIGNvbnN0IHsgY29uZmlnLCBsYW1iZGFGdW5jdGlvbnMsIGR5bmFtb2RiVGFibGVzLCBhcHBTeW5jQXBpcyB9ID0gcHJvcHM7XHJcbiAgICBjb25zdCByZXNvdXJjZU5hbWVzID0gZ2VuZXJhdGVSZXNvdXJjZU5hbWVzKHtcclxuICAgICAgcHJvamVjdDogJ3RyaW5pdHknLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29uZmlnLmVudmlyb25tZW50LFxyXG4gICAgICByZWdpb246IGNvbmZpZy5yZWdpb24gfHwgJ2V1LXdlc3QtMSdcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBTTlMgdG9waWMgZm9yIGFsZXJ0c1xyXG4gICAgdGhpcy5hbGVydFRvcGljID0gdGhpcy5jcmVhdGVBbGVydFRvcGljKGNvbmZpZyk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIGRhc2hib2FyZHNcclxuICAgIHRoaXMuY3JlYXRlT3ZlcnZpZXdEYXNoYm9hcmQoY29uZmlnLCByZXNvdXJjZU5hbWVzKTtcclxuICAgIHRoaXMuY3JlYXRlTGFtYmRhRGFzaGJvYXJkKGNvbmZpZywgbGFtYmRhRnVuY3Rpb25zLCByZXNvdXJjZU5hbWVzKTtcclxuICAgIHRoaXMuY3JlYXRlRHluYW1vREJEYXNoYm9hcmQoY29uZmlnLCBkeW5hbW9kYlRhYmxlcywgcmVzb3VyY2VOYW1lcyk7XHJcbiAgICB0aGlzLmNyZWF0ZUFwaURhc2hib2FyZChjb25maWcsIGFwcFN5bmNBcGlzLCByZXNvdXJjZU5hbWVzKTtcclxuXHJcbiAgICAvLyBDcmVhdGUgYWxhcm1zXHJcbiAgICB0aGlzLmNyZWF0ZUxhbWJkYUFsYXJtcyhjb25maWcsIGxhbWJkYUZ1bmN0aW9ucyk7XHJcbiAgICB0aGlzLmNyZWF0ZUR5bmFtb0RCQWxhcm1zKGNvbmZpZywgZHluYW1vZGJUYWJsZXMpO1xyXG4gICAgdGhpcy5jcmVhdGVBcGlBbGFybXMoY29uZmlnLCBhcHBTeW5jQXBpcyk7XHJcblxyXG4gICAgLy8gQWRkIHN0YWNrLWxldmVsIHRhZ3NcclxuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnUHJvamVjdCcsICdUcmluaXR5Jyk7XHJcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0Vudmlyb25tZW50JywgY29uZmlnLmVudmlyb25tZW50KTtcclxuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnU3RhY2snLCAnTW9uaXRvcmluZycpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIFNOUyB0b3BpYyBmb3IgYWxlcnRzXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBjcmVhdGVBbGVydFRvcGljKGNvbmZpZzogVHJpbml0eUVudmlyb25tZW50Q29uZmlnKTogc25zLlRvcGljIHtcclxuICAgIGNvbnN0IHRvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnVHJpbml0eUFsZXJ0VG9waWMnLCB7XHJcbiAgICAgIHRvcGljTmFtZTogYHRyaW5pdHktYWxlcnRzLSR7Y29uZmlnLmVudmlyb25tZW50fWAsXHJcbiAgICAgIGRpc3BsYXlOYW1lOiBgVHJpbml0eSAke2NvbmZpZy5lbnZpcm9ubWVudH0gQWxlcnRzYCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBlbWFpbCBzdWJzY3JpcHRpb24gaWYgY29uZmlndXJlZFxyXG4gICAgaWYgKGNvbmZpZy5tb25pdG9yaW5nPy5hbGVydEVtYWlsKSB7XHJcbiAgICAgIHRvcGljLmFkZFN1YnNjcmlwdGlvbihuZXcgc25zU3Vic2NyaXB0aW9ucy5FbWFpbFN1YnNjcmlwdGlvbihjb25maWcubW9uaXRvcmluZy5hbGVydEVtYWlsKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRvcGljO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIG92ZXJ2aWV3IGRhc2hib2FyZFxyXG4gICAqL1xyXG4gIHByaXZhdGUgY3JlYXRlT3ZlcnZpZXdEYXNoYm9hcmQoY29uZmlnOiBUcmluaXR5RW52aXJvbm1lbnRDb25maWcsIHJlc291cmNlTmFtZXM6IGFueSk6IHZvaWQge1xyXG4gICAgdGhpcy5kYXNoYm9hcmRzLm92ZXJ2aWV3ID0gbmV3IGNsb3Vkd2F0Y2guRGFzaGJvYXJkKHRoaXMsICdUcmluaXR5T3ZlcnZpZXdEYXNoYm9hcmQnLCB7XHJcbiAgICAgIGRhc2hib2FyZE5hbWU6IHJlc291cmNlTmFtZXMuY2xvdWRXYXRjaC5kYXNoYm9hcmRzLm1haW4sXHJcbiAgICAgIHdpZGdldHM6IFtcclxuICAgICAgICBbXHJcbiAgICAgICAgICAvLyBTeXN0ZW0gSGVhbHRoIE92ZXJ2aWV3XHJcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5UZXh0V2lkZ2V0KHtcclxuICAgICAgICAgICAgbWFya2Rvd246IGAjIFRyaW5pdHkgJHtjb25maWcuZW52aXJvbm1lbnQudG9VcHBlckNhc2UoKX0gLSBTeXN0ZW0gT3ZlcnZpZXdcXG5cXG5SZWFsLXRpbWUgbW9uaXRvcmluZyBvZiBUcmluaXR5IGluZnJhc3RydWN0dXJlIGNvbXBvbmVudHMuYCxcclxuICAgICAgICAgICAgd2lkdGg6IDI0LFxyXG4gICAgICAgICAgICBoZWlnaHQ6IDIsXHJcbiAgICAgICAgICB9KSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIFtcclxuICAgICAgICAgIC8vIExhbWJkYSBGdW5jdGlvbnMgSGVhbHRoXHJcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XHJcbiAgICAgICAgICAgIHRpdGxlOiAnTGFtYmRhIEZ1bmN0aW9ucyAtIEludm9jYXRpb25zJyxcclxuICAgICAgICAgICAgd2lkdGg6IDEyLFxyXG4gICAgICAgICAgICBoZWlnaHQ6IDYsXHJcbiAgICAgICAgICAgIGxlZnQ6IFtcclxuICAgICAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xyXG4gICAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0xhbWJkYScsXHJcbiAgICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnSW52b2NhdGlvbnMnLFxyXG4gICAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBGdW5jdGlvbk5hbWU6ICd0cmluaXR5LWF1dGgtZGV2JyB9LFxyXG4gICAgICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgICAgICAgICAgIGxhYmVsOiAnQXV0aCBGdW5jdGlvbicsXHJcbiAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcclxuICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9MYW1iZGEnLFxyXG4gICAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0ludm9jYXRpb25zJyxcclxuICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgRnVuY3Rpb25OYW1lOiAndHJpbml0eS1tb3ZpZS1kZXYnIH0sXHJcbiAgICAgICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxyXG4gICAgICAgICAgICAgICAgbGFiZWw6ICdNb3ZpZSBGdW5jdGlvbicsXHJcbiAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcclxuICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9MYW1iZGEnLFxyXG4gICAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0ludm9jYXRpb25zJyxcclxuICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgRnVuY3Rpb25OYW1lOiAndHJpbml0eS1yb29tLWRldicgfSxcclxuICAgICAgICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXHJcbiAgICAgICAgICAgICAgICBsYWJlbDogJ1Jvb20gRnVuY3Rpb24nLFxyXG4gICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgfSksXHJcblxyXG4gICAgICAgICAgLy8gTGFtYmRhIEZ1bmN0aW9ucyBFcnJvcnNcclxuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcclxuICAgICAgICAgICAgdGl0bGU6ICdMYW1iZGEgRnVuY3Rpb25zIC0gRXJyb3JzJyxcclxuICAgICAgICAgICAgd2lkdGg6IDEyLFxyXG4gICAgICAgICAgICBoZWlnaHQ6IDYsXHJcbiAgICAgICAgICAgIGxlZnQ6IFtcclxuICAgICAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xyXG4gICAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0xhbWJkYScsXHJcbiAgICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnRXJyb3JzJyxcclxuICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgRnVuY3Rpb25OYW1lOiAndHJpbml0eS1hdXRoLWRldicgfSxcclxuICAgICAgICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXHJcbiAgICAgICAgICAgICAgICBsYWJlbDogJ0F1dGggRXJyb3JzJyxcclxuICAgICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xyXG4gICAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0xhbWJkYScsXHJcbiAgICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnRXJyb3JzJyxcclxuICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgRnVuY3Rpb25OYW1lOiAndHJpbml0eS1tb3ZpZS1kZXYnIH0sXHJcbiAgICAgICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxyXG4gICAgICAgICAgICAgICAgbGFiZWw6ICdNb3ZpZSBFcnJvcnMnLFxyXG4gICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XHJcbiAgICAgICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcclxuICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6ICdFcnJvcnMnLFxyXG4gICAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBGdW5jdGlvbk5hbWU6ICd0cmluaXR5LXJvb20tZGV2JyB9LFxyXG4gICAgICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgICAgICAgICAgIGxhYmVsOiAnUm9vbSBFcnJvcnMnLFxyXG4gICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgfSksXHJcbiAgICAgICAgXSxcclxuICAgICAgICBbXHJcbiAgICAgICAgICAvLyBEeW5hbW9EQiBPcGVyYXRpb25zXHJcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XHJcbiAgICAgICAgICAgIHRpdGxlOiAnRHluYW1vREIgLSBSZWFkL1dyaXRlIE9wZXJhdGlvbnMnLFxyXG4gICAgICAgICAgICB3aWR0aDogMTIsXHJcbiAgICAgICAgICAgIGhlaWdodDogNixcclxuICAgICAgICAgICAgbGVmdDogW1xyXG4gICAgICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XHJcbiAgICAgICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvRHluYW1vREInLFxyXG4gICAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0NvbnN1bWVkUmVhZENhcGFjaXR5VW5pdHMnLFxyXG4gICAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBUYWJsZU5hbWU6ICd0cmluaXR5LXVzZXJzLWRldicgfSxcclxuICAgICAgICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXHJcbiAgICAgICAgICAgICAgICBsYWJlbDogJ1VzZXJzIFJlYWQnLFxyXG4gICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XHJcbiAgICAgICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvRHluYW1vREInLFxyXG4gICAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0NvbnN1bWVkV3JpdGVDYXBhY2l0eVVuaXRzJyxcclxuICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgVGFibGVOYW1lOiAndHJpbml0eS11c2Vycy1kZXYnIH0sXHJcbiAgICAgICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxyXG4gICAgICAgICAgICAgICAgbGFiZWw6ICdVc2VycyBXcml0ZScsXHJcbiAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICB9KSxcclxuXHJcbiAgICAgICAgICAvLyBBUEkgR2F0ZXdheSBSZXF1ZXN0c1xyXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xyXG4gICAgICAgICAgICB0aXRsZTogJ0FwcFN5bmMgQVBJIC0gUmVxdWVzdHMnLFxyXG4gICAgICAgICAgICB3aWR0aDogMTIsXHJcbiAgICAgICAgICAgIGhlaWdodDogNixcclxuICAgICAgICAgICAgbGVmdDogW1xyXG4gICAgICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XHJcbiAgICAgICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvQXBwU3luYycsXHJcbiAgICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnNFhYRXJyb3InLFxyXG4gICAgICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgICAgICAgICAgIGxhYmVsOiAnQ2xpZW50IEVycm9ycycsXHJcbiAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcclxuICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcHBTeW5jJyxcclxuICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6ICc1WFhFcnJvcicsXHJcbiAgICAgICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxyXG4gICAgICAgICAgICAgICAgbGFiZWw6ICdTZXJ2ZXIgRXJyb3JzJyxcclxuICAgICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgIH0pLFxyXG4gICAgICAgIF0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBMYW1iZGEtc3BlY2lmaWMgZGFzaGJvYXJkXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBjcmVhdGVMYW1iZGFEYXNoYm9hcmQoY29uZmlnOiBUcmluaXR5RW52aXJvbm1lbnRDb25maWcsIGxhbWJkYUZ1bmN0aW9uczogc3RyaW5nW10sIHJlc291cmNlTmFtZXM6IGFueSk6IHZvaWQge1xyXG4gICAgY29uc3Qgd2lkZ2V0czogY2xvdWR3YXRjaC5JV2lkZ2V0W11bXSA9IFtcclxuICAgICAgW1xyXG4gICAgICAgIG5ldyBjbG91ZHdhdGNoLlRleHRXaWRnZXQoe1xyXG4gICAgICAgICAgbWFya2Rvd246IGAjIExhbWJkYSBGdW5jdGlvbnMgTW9uaXRvcmluZ1xcblxcbkRldGFpbGVkIG1ldHJpY3MgZm9yIGFsbCBUcmluaXR5IExhbWJkYSBmdW5jdGlvbnMuYCxcclxuICAgICAgICAgIHdpZHRoOiAyNCxcclxuICAgICAgICAgIGhlaWdodDogMixcclxuICAgICAgICB9KSxcclxuICAgICAgXSxcclxuICAgIF07XHJcblxyXG4gICAgLy8gQ3JlYXRlIHdpZGdldHMgZm9yIGVhY2ggTGFtYmRhIGZ1bmN0aW9uXHJcbiAgICBsYW1iZGFGdW5jdGlvbnMuZm9yRWFjaCgoZnVuY3Rpb25OYW1lLCBpbmRleCkgPT4ge1xyXG4gICAgICBpZiAoaW5kZXggJSAyID09PSAwKSB7XHJcbiAgICAgICAgd2lkZ2V0cy5wdXNoKFtdKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgY3VycmVudFJvdyA9IHdpZGdldHNbd2lkZ2V0cy5sZW5ndGggLSAxXTtcclxuXHJcbiAgICAgIC8vIER1cmF0aW9uIGFuZCBJbnZvY2F0aW9uc1xyXG4gICAgICBjdXJyZW50Um93LnB1c2goXHJcbiAgICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xyXG4gICAgICAgICAgdGl0bGU6IGAke2Z1bmN0aW9uTmFtZX0gLSBQZXJmb3JtYW5jZWAsXHJcbiAgICAgICAgICB3aWR0aDogMTIsXHJcbiAgICAgICAgICBoZWlnaHQ6IDYsXHJcbiAgICAgICAgICBsZWZ0OiBbXHJcbiAgICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XHJcbiAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0xhbWJkYScsXHJcbiAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0R1cmF0aW9uJyxcclxuICAgICAgICAgICAgICBkaW1lbnNpb25zTWFwOiB7IEZ1bmN0aW9uTmFtZTogZnVuY3Rpb25OYW1lIH0sXHJcbiAgICAgICAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXHJcbiAgICAgICAgICAgICAgbGFiZWw6ICdBdmcgRHVyYXRpb24nLFxyXG4gICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcclxuICAgICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcclxuICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnRHVyYXRpb24nLFxyXG4gICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgRnVuY3Rpb25OYW1lOiBmdW5jdGlvbk5hbWUgfSxcclxuICAgICAgICAgICAgICBzdGF0aXN0aWM6ICdNYXhpbXVtJyxcclxuICAgICAgICAgICAgICBsYWJlbDogJ01heCBEdXJhdGlvbicsXHJcbiAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgXSxcclxuICAgICAgICAgIHJpZ2h0OiBbXHJcbiAgICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XHJcbiAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0xhbWJkYScsXHJcbiAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0ludm9jYXRpb25zJyxcclxuICAgICAgICAgICAgICBkaW1lbnNpb25zTWFwOiB7IEZ1bmN0aW9uTmFtZTogZnVuY3Rpb25OYW1lIH0sXHJcbiAgICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgICAgICAgICBsYWJlbDogJ0ludm9jYXRpb25zJyxcclxuICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgICAvLyBJZiB0aGlzIGlzIGFuIG9kZC1pbmRleGVkIGZ1bmN0aW9uIG9yIHRoZSBsYXN0IGZ1bmN0aW9uLCBhZGQgZXJyb3Igd2lkZ2V0XHJcbiAgICAgIGlmIChpbmRleCAlIDIgPT09IDEgfHwgaW5kZXggPT09IGxhbWJkYUZ1bmN0aW9ucy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgaWYgKGN1cnJlbnRSb3cubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgICAgICBjdXJyZW50Um93LnB1c2goXHJcbiAgICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcclxuICAgICAgICAgICAgICB0aXRsZTogYCR7ZnVuY3Rpb25OYW1lfSAtIEVycm9ycyAmIFRocm90dGxlc2AsXHJcbiAgICAgICAgICAgICAgd2lkdGg6IDEyLFxyXG4gICAgICAgICAgICAgIGhlaWdodDogNixcclxuICAgICAgICAgICAgICBsZWZ0OiBbXHJcbiAgICAgICAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xyXG4gICAgICAgICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcclxuICAgICAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0Vycm9ycycsXHJcbiAgICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgRnVuY3Rpb25OYW1lOiBmdW5jdGlvbk5hbWUgfSxcclxuICAgICAgICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgICAgICAgICAgICAgbGFiZWw6ICdFcnJvcnMnLFxyXG4gICAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xyXG4gICAgICAgICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcclxuICAgICAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ1Rocm90dGxlcycsXHJcbiAgICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgRnVuY3Rpb25OYW1lOiBmdW5jdGlvbk5hbWUgfSxcclxuICAgICAgICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgICAgICAgICAgICAgbGFiZWw6ICdUaHJvdHRsZXMnLFxyXG4gICAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmRhc2hib2FyZHMubGFtYmRhID0gbmV3IGNsb3Vkd2F0Y2guRGFzaGJvYXJkKHRoaXMsICdUcmluaXR5TGFtYmRhRGFzaGJvYXJkJywge1xyXG4gICAgICBkYXNoYm9hcmROYW1lOiByZXNvdXJjZU5hbWVzLmNsb3VkV2F0Y2guZGFzaGJvYXJkcy5sYW1iZGEsXHJcbiAgICAgIHdpZGdldHMsXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBEeW5hbW9EQi1zcGVjaWZpYyBkYXNoYm9hcmRcclxuICAgKi9cclxuICBwcml2YXRlIGNyZWF0ZUR5bmFtb0RCRGFzaGJvYXJkKGNvbmZpZzogVHJpbml0eUVudmlyb25tZW50Q29uZmlnLCBkeW5hbW9kYlRhYmxlczogc3RyaW5nW10sIHJlc291cmNlTmFtZXM6IGFueSk6IHZvaWQge1xyXG4gICAgY29uc3Qgd2lkZ2V0czogY2xvdWR3YXRjaC5JV2lkZ2V0W11bXSA9IFtcclxuICAgICAgW1xyXG4gICAgICAgIG5ldyBjbG91ZHdhdGNoLlRleHRXaWRnZXQoe1xyXG4gICAgICAgICAgbWFya2Rvd246IGAjIER5bmFtb0RCIFRhYmxlcyBNb25pdG9yaW5nXFxuXFxuQ2FwYWNpdHkgdXRpbGl6YXRpb24gYW5kIHBlcmZvcm1hbmNlIG1ldHJpY3MgZm9yIGFsbCBUcmluaXR5IHRhYmxlcy5gLFxyXG4gICAgICAgICAgd2lkdGg6IDI0LFxyXG4gICAgICAgICAgaGVpZ2h0OiAyLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICBdLFxyXG4gICAgXTtcclxuXHJcbiAgICAvLyBDcmVhdGUgd2lkZ2V0cyBmb3Iga2V5IHRhYmxlc1xyXG4gICAgY29uc3Qga2V5VGFibGVzID0gWyd0cmluaXR5LXVzZXJzLWRldicsICd0cmluaXR5LXJvb21zLWRldi12MicsICd0cmluaXR5LXZvdGVzLWRldiddO1xyXG4gICAgXHJcbiAgICBrZXlUYWJsZXMuZm9yRWFjaCgodGFibGVOYW1lLCBpbmRleCkgPT4ge1xyXG4gICAgICBpZiAoaW5kZXggJSAyID09PSAwKSB7XHJcbiAgICAgICAgd2lkZ2V0cy5wdXNoKFtdKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgY3VycmVudFJvdyA9IHdpZGdldHNbd2lkZ2V0cy5sZW5ndGggLSAxXTtcclxuXHJcbiAgICAgIGN1cnJlbnRSb3cucHVzaChcclxuICAgICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XHJcbiAgICAgICAgICB0aXRsZTogYCR7dGFibGVOYW1lfSAtIE9wZXJhdGlvbnNgLFxyXG4gICAgICAgICAgd2lkdGg6IDEyLFxyXG4gICAgICAgICAgaGVpZ2h0OiA2LFxyXG4gICAgICAgICAgbGVmdDogW1xyXG4gICAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xyXG4gICAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9EeW5hbW9EQicsXHJcbiAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0NvbnN1bWVkUmVhZENhcGFjaXR5VW5pdHMnLFxyXG4gICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgVGFibGVOYW1lOiB0YWJsZU5hbWUgfSxcclxuICAgICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxyXG4gICAgICAgICAgICAgIGxhYmVsOiAnUmVhZCBDYXBhY2l0eScsXHJcbiAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xyXG4gICAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9EeW5hbW9EQicsXHJcbiAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0NvbnN1bWVkV3JpdGVDYXBhY2l0eVVuaXRzJyxcclxuICAgICAgICAgICAgICBkaW1lbnNpb25zTWFwOiB7IFRhYmxlTmFtZTogdGFibGVOYW1lIH0sXHJcbiAgICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgICAgICAgICBsYWJlbDogJ1dyaXRlIENhcGFjaXR5JyxcclxuICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmRhc2hib2FyZHMuZGF0YWJhc2UgPSBuZXcgY2xvdWR3YXRjaC5EYXNoYm9hcmQodGhpcywgJ1RyaW5pdHlEeW5hbW9EQkRhc2hib2FyZCcsIHtcclxuICAgICAgZGFzaGJvYXJkTmFtZTogcmVzb3VyY2VOYW1lcy5jbG91ZFdhdGNoLmRhc2hib2FyZHMuZGF0YWJhc2UsXHJcbiAgICAgIHdpZGdldHMsXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBBUEktc3BlY2lmaWMgZGFzaGJvYXJkXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBjcmVhdGVBcGlEYXNoYm9hcmQoY29uZmlnOiBUcmluaXR5RW52aXJvbm1lbnRDb25maWcsIGFwcFN5bmNBcGlzOiBzdHJpbmdbXSwgcmVzb3VyY2VOYW1lczogYW55KTogdm9pZCB7XHJcbiAgICB0aGlzLmRhc2hib2FyZHMuYXBpID0gbmV3IGNsb3Vkd2F0Y2guRGFzaGJvYXJkKHRoaXMsICdUcmluaXR5QXBpRGFzaGJvYXJkJywge1xyXG4gICAgICBkYXNoYm9hcmROYW1lOiByZXNvdXJjZU5hbWVzLmNsb3VkV2F0Y2guZGFzaGJvYXJkcy5hcGksXHJcbiAgICAgIHdpZGdldHM6IFtcclxuICAgICAgICBbXHJcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5UZXh0V2lkZ2V0KHtcclxuICAgICAgICAgICAgbWFya2Rvd246IGAjIEFwcFN5bmMgQVBJIE1vbml0b3JpbmdcXG5cXG5SZXF1ZXN0IHJhdGVzLCBlcnJvcnMsIGFuZCBsYXRlbmN5IGZvciBUcmluaXR5IEdyYXBoUUwgQVBJcy5gLFxyXG4gICAgICAgICAgICB3aWR0aDogMjQsXHJcbiAgICAgICAgICAgIGhlaWdodDogMixcclxuICAgICAgICAgIH0pLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgW1xyXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xyXG4gICAgICAgICAgICB0aXRsZTogJ0FQSSBSZXF1ZXN0cycsXHJcbiAgICAgICAgICAgIHdpZHRoOiAxMixcclxuICAgICAgICAgICAgaGVpZ2h0OiA2LFxyXG4gICAgICAgICAgICBsZWZ0OiBbXHJcbiAgICAgICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcclxuICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcHBTeW5jJyxcclxuICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6ICdDb25uZWN0U3VjY2VzcycsXHJcbiAgICAgICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxyXG4gICAgICAgICAgICAgICAgbGFiZWw6ICdTdWNjZXNzZnVsIENvbm5lY3Rpb25zJyxcclxuICAgICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xyXG4gICAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0FwcFN5bmMnLFxyXG4gICAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0Nvbm5lY3RDbGllbnRFcnJvcicsXHJcbiAgICAgICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxyXG4gICAgICAgICAgICAgICAgbGFiZWw6ICdDb25uZWN0aW9uIENsaWVudCBFcnJvcnMnLFxyXG4gICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgfSksXHJcblxyXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xyXG4gICAgICAgICAgICB0aXRsZTogJ0FQSSBFcnJvcnMnLFxyXG4gICAgICAgICAgICB3aWR0aDogMTIsXHJcbiAgICAgICAgICAgIGhlaWdodDogNixcclxuICAgICAgICAgICAgbGVmdDogW1xyXG4gICAgICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XHJcbiAgICAgICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvQXBwU3luYycsXHJcbiAgICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnNFhYRXJyb3InLFxyXG4gICAgICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgICAgICAgICAgIGxhYmVsOiAnQ2xpZW50IEVycm9ycyAoNFhYKScsXHJcbiAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcclxuICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcHBTeW5jJyxcclxuICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6ICc1WFhFcnJvcicsXHJcbiAgICAgICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxyXG4gICAgICAgICAgICAgICAgbGFiZWw6ICdTZXJ2ZXIgRXJyb3JzICg1WFgpJyxcclxuICAgICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgIH0pLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgW1xyXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xyXG4gICAgICAgICAgICB0aXRsZTogJ0FQSSBMYXRlbmN5JyxcclxuICAgICAgICAgICAgd2lkdGg6IDI0LFxyXG4gICAgICAgICAgICBoZWlnaHQ6IDYsXHJcbiAgICAgICAgICAgIGxlZnQ6IFtcclxuICAgICAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xyXG4gICAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0FwcFN5bmMnLFxyXG4gICAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0xhdGVuY3knLFxyXG4gICAgICAgICAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXHJcbiAgICAgICAgICAgICAgICBsYWJlbDogJ0F2ZXJhZ2UgTGF0ZW5jeScsXHJcbiAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcclxuICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcHBTeW5jJyxcclxuICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6ICdMYXRlbmN5JyxcclxuICAgICAgICAgICAgICAgIHN0YXRpc3RpYzogJ3A5OScsXHJcbiAgICAgICAgICAgICAgICBsYWJlbDogJ1A5OSBMYXRlbmN5JyxcclxuICAgICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgIH0pLFxyXG4gICAgICAgIF0sXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBMYW1iZGEgZnVuY3Rpb24gYWxhcm1zXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBjcmVhdGVMYW1iZGFBbGFybXMoY29uZmlnOiBUcmluaXR5RW52aXJvbm1lbnRDb25maWcsIGxhbWJkYUZ1bmN0aW9uczogc3RyaW5nW10pOiB2b2lkIHtcclxuICAgIGxhbWJkYUZ1bmN0aW9ucy5mb3JFYWNoKGZ1bmN0aW9uTmFtZSA9PiB7XHJcbiAgICAgIC8vIEVycm9yIHJhdGUgYWxhcm1cclxuICAgICAgdGhpcy5hbGFybXNbYCR7ZnVuY3Rpb25OYW1lfS1lcnJvcnNgXSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIGAke2Z1bmN0aW9uTmFtZX1FcnJvckFsYXJtYCwge1xyXG4gICAgICAgIGFsYXJtTmFtZTogYCR7ZnVuY3Rpb25OYW1lfS1lcnJvci1yYXRlYCxcclxuICAgICAgICBhbGFybURlc2NyaXB0aW9uOiBgSGlnaCBlcnJvciByYXRlIGZvciAke2Z1bmN0aW9uTmFtZX1gLFxyXG4gICAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcclxuICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9MYW1iZGEnLFxyXG4gICAgICAgICAgbWV0cmljTmFtZTogJ0Vycm9ycycsXHJcbiAgICAgICAgICBkaW1lbnNpb25zTWFwOiB7IEZ1bmN0aW9uTmFtZTogZnVuY3Rpb25OYW1lIH0sXHJcbiAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxyXG4gICAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcclxuICAgICAgICB9KSxcclxuICAgICAgICB0aHJlc2hvbGQ6IGNvbmZpZy5lbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gNSA6IDEwLFxyXG4gICAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxyXG4gICAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBEdXJhdGlvbiBhbGFybVxyXG4gICAgICB0aGlzLmFsYXJtc1tgJHtmdW5jdGlvbk5hbWV9LWR1cmF0aW9uYF0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBgJHtmdW5jdGlvbk5hbWV9RHVyYXRpb25BbGFybWAsIHtcclxuICAgICAgICBhbGFybU5hbWU6IGAke2Z1bmN0aW9uTmFtZX0taGlnaC1kdXJhdGlvbmAsXHJcbiAgICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYEhpZ2ggZHVyYXRpb24gZm9yICR7ZnVuY3Rpb25OYW1lfWAsXHJcbiAgICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xyXG4gICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0xhbWJkYScsXHJcbiAgICAgICAgICBtZXRyaWNOYW1lOiAnRHVyYXRpb24nLFxyXG4gICAgICAgICAgZGltZW5zaW9uc01hcDogeyBGdW5jdGlvbk5hbWU6IGZ1bmN0aW9uTmFtZSB9LFxyXG4gICAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXHJcbiAgICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICAgIHRocmVzaG9sZDogY29uZmlnLmVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicgPyAxMDAwMCA6IDE1MDAwLCAvLyBtaWxsaXNlY29uZHNcclxuICAgICAgICBldmFsdWF0aW9uUGVyaW9kczogMyxcclxuICAgICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9USFJFU0hPTEQsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gQWRkIFNOUyBhY3Rpb25zIHRvIGFsYXJtc1xyXG4gICAgICB0aGlzLmFsYXJtc1tgJHtmdW5jdGlvbk5hbWV9LWVycm9yc2BdLmFkZEFsYXJtQWN0aW9uKFxyXG4gICAgICAgIG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24odGhpcy5hbGVydFRvcGljKVxyXG4gICAgICApO1xyXG4gICAgICB0aGlzLmFsYXJtc1tgJHtmdW5jdGlvbk5hbWV9LWR1cmF0aW9uYF0uYWRkQWxhcm1BY3Rpb24oXHJcbiAgICAgICAgbmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbih0aGlzLmFsZXJ0VG9waWMpXHJcbiAgICAgICk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBEeW5hbW9EQiBhbGFybXNcclxuICAgKi9cclxuICBwcml2YXRlIGNyZWF0ZUR5bmFtb0RCQWxhcm1zKGNvbmZpZzogVHJpbml0eUVudmlyb25tZW50Q29uZmlnLCBkeW5hbW9kYlRhYmxlczogc3RyaW5nW10pOiB2b2lkIHtcclxuICAgIGR5bmFtb2RiVGFibGVzLmZvckVhY2godGFibGVOYW1lID0+IHtcclxuICAgICAgLy8gVGhyb3R0bGUgYWxhcm1cclxuICAgICAgdGhpcy5hbGFybXNbYCR7dGFibGVOYW1lfS10aHJvdHRsZXNgXSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIGAke3RhYmxlTmFtZX1UaHJvdHRsZUFsYXJtYCwge1xyXG4gICAgICAgIGFsYXJtTmFtZTogYCR7dGFibGVOYW1lfS10aHJvdHRsZXNgLFxyXG4gICAgICAgIGFsYXJtRGVzY3JpcHRpb246IGBUaHJvdHRsaW5nIGRldGVjdGVkIGZvciAke3RhYmxlTmFtZX1gLFxyXG4gICAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcclxuICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9EeW5hbW9EQicsXHJcbiAgICAgICAgICBtZXRyaWNOYW1lOiAnUmVhZFRocm90dGxlcycsXHJcbiAgICAgICAgICBkaW1lbnNpb25zTWFwOiB7IFRhYmxlTmFtZTogdGFibGVOYW1lIH0sXHJcbiAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxyXG4gICAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcclxuICAgICAgICB9KSxcclxuICAgICAgICB0aHJlc2hvbGQ6IDEsXHJcbiAgICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXHJcbiAgICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIEFkZCBTTlMgYWN0aW9uXHJcbiAgICAgIHRoaXMuYWxhcm1zW2Ake3RhYmxlTmFtZX0tdGhyb3R0bGVzYF0uYWRkQWxhcm1BY3Rpb24oXHJcbiAgICAgICAgbmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbih0aGlzLmFsZXJ0VG9waWMpXHJcbiAgICAgICk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBBcHBTeW5jIEFQSSBhbGFybXNcclxuICAgKi9cclxuICBwcml2YXRlIGNyZWF0ZUFwaUFsYXJtcyhjb25maWc6IFRyaW5pdHlFbnZpcm9ubWVudENvbmZpZywgYXBwU3luY0FwaXM6IHN0cmluZ1tdKTogdm9pZCB7XHJcbiAgICAvLyBBUEkgRXJyb3IgcmF0ZSBhbGFybVxyXG4gICAgdGhpcy5hbGFybXNbJ2FwaS1lcnJvcnMnXSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdBcGlFcnJvckFsYXJtJywge1xyXG4gICAgICBhbGFybU5hbWU6ICd0cmluaXR5LWFwaS1lcnJvci1yYXRlJyxcclxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0hpZ2ggZXJyb3IgcmF0ZSBmb3IgVHJpbml0eSBBUEknLFxyXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XHJcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0FwcFN5bmMnLFxyXG4gICAgICAgIG1ldHJpY05hbWU6ICc1WFhFcnJvcicsXHJcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcclxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgICB9KSxcclxuICAgICAgdGhyZXNob2xkOiBjb25maWcuZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJyA/IDEwIDogMjAsXHJcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxyXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBUEkgTGF0ZW5jeSBhbGFybVxyXG4gICAgdGhpcy5hbGFybXNbJ2FwaS1sYXRlbmN5J10gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQXBpTGF0ZW5jeUFsYXJtJywge1xyXG4gICAgICBhbGFybU5hbWU6ICd0cmluaXR5LWFwaS1oaWdoLWxhdGVuY3knLFxyXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnSGlnaCBsYXRlbmN5IGZvciBUcmluaXR5IEFQSScsXHJcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcclxuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvQXBwU3luYycsXHJcbiAgICAgICAgbWV0cmljTmFtZTogJ0xhdGVuY3knLFxyXG4gICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxyXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXHJcbiAgICAgIH0pLFxyXG4gICAgICB0aHJlc2hvbGQ6IGNvbmZpZy5lbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gMjAwMCA6IDUwMDAsIC8vIG1pbGxpc2Vjb25kc1xyXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMyxcclxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fVEhSRVNIT0xELFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIFNOUyBhY3Rpb25zXHJcbiAgICB0aGlzLmFsYXJtc1snYXBpLWVycm9ycyddLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24odGhpcy5hbGVydFRvcGljKSk7XHJcbiAgICB0aGlzLmFsYXJtc1snYXBpLWxhdGVuY3knXS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRoaXMuYWxlcnRUb3BpYykpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIGxvZyByZXRlbnRpb24gcG9saWNpZXNcclxuICAgKi9cclxuICBjcmVhdGVMb2dSZXRlbnRpb25Qb2xpY2llcyhsYW1iZGFGdW5jdGlvbnM6IHN0cmluZ1tdLCBjb25maWc6IFRyaW5pdHlFbnZpcm9ubWVudENvbmZpZyk6IHZvaWQge1xyXG4gICAgY29uc3QgcmV0ZW50aW9uRGF5cyA9IGNvbmZpZy5tb25pdG9yaW5nPy5yZXRlbnRpb25EYXlzIHx8IFxyXG4gICAgICAoY29uZmlnLmVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicgPyA5MCA6IFxyXG4gICAgICAgY29uZmlnLmVudmlyb25tZW50ID09PSAnc3RhZ2luZycgPyAzMCA6IDcpO1xyXG5cclxuICAgIGxhbWJkYUZ1bmN0aW9ucy5mb3JFYWNoKGZ1bmN0aW9uTmFtZSA9PiB7XHJcbiAgICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsIGAke2Z1bmN0aW9uTmFtZX1Mb2dHcm91cGAsIHtcclxuICAgICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2xhbWJkYS8ke2Z1bmN0aW9uTmFtZX1gLFxyXG4gICAgICAgIHJldGVudGlvbjogdGhpcy5nZXRMb2dSZXRlbnRpb24ocmV0ZW50aW9uRGF5cyksXHJcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENvbnZlcnQgZGF5cyB0byBDbG91ZFdhdGNoIGxvZyByZXRlbnRpb24gZW51bVxyXG4gICAqL1xyXG4gIHByaXZhdGUgZ2V0TG9nUmV0ZW50aW9uKGRheXM6IG51bWJlcik6IGxvZ3MuUmV0ZW50aW9uRGF5cyB7XHJcbiAgICBpZiAoZGF5cyA8PSAxKSByZXR1cm4gbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9EQVk7XHJcbiAgICBpZiAoZGF5cyA8PSAzKSByZXR1cm4gbG9ncy5SZXRlbnRpb25EYXlzLlRIUkVFX0RBWVM7XHJcbiAgICBpZiAoZGF5cyA8PSA1KSByZXR1cm4gbG9ncy5SZXRlbnRpb25EYXlzLkZJVkVfREFZUztcclxuICAgIGlmIChkYXlzIDw9IDcpIHJldHVybiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUs7XHJcbiAgICBpZiAoZGF5cyA8PSAxNCkgcmV0dXJuIGxvZ3MuUmV0ZW50aW9uRGF5cy5UV09fV0VFS1M7XHJcbiAgICBpZiAoZGF5cyA8PSAzMCkgcmV0dXJuIGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEg7XHJcbiAgICBpZiAoZGF5cyA8PSA2MCkgcmV0dXJuIGxvZ3MuUmV0ZW50aW9uRGF5cy5UV09fTU9OVEhTO1xyXG4gICAgaWYgKGRheXMgPD0gOTApIHJldHVybiBsb2dzLlJldGVudGlvbkRheXMuVEhSRUVfTU9OVEhTO1xyXG4gICAgaWYgKGRheXMgPD0gMTIwKSByZXR1cm4gbG9ncy5SZXRlbnRpb25EYXlzLkZPVVJfTU9OVEhTO1xyXG4gICAgaWYgKGRheXMgPD0gMTUwKSByZXR1cm4gbG9ncy5SZXRlbnRpb25EYXlzLkZJVkVfTU9OVEhTO1xyXG4gICAgaWYgKGRheXMgPD0gMTgwKSByZXR1cm4gbG9ncy5SZXRlbnRpb25EYXlzLlNJWF9NT05USFM7XHJcbiAgICBpZiAoZGF5cyA8PSAzNjUpIHJldHVybiBsb2dzLlJldGVudGlvbkRheXMuT05FX1lFQVI7XHJcbiAgICByZXR1cm4gbG9ncy5SZXRlbnRpb25EYXlzLklORklOSVRFO1xyXG4gIH1cclxufSJdfQ==