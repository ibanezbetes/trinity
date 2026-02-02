/**
 * Trinity Monitoring Stack
 *
 * Comprehensive CloudWatch monitoring, dashboards, and alerting
 * for all Trinity infrastructure components
 */
import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { TrinityEnvironmentConfig } from '../config/environments';
interface TrinityMonitoringStackProps extends cdk.StackProps {
    config: TrinityEnvironmentConfig;
    lambdaFunctions: string[];
    dynamodbTables: string[];
    appSyncApis: string[];
}
export declare class TrinityMonitoringStack extends cdk.Stack {
    readonly dashboards: {
        [key: string]: cloudwatch.Dashboard;
    };
    readonly alarms: {
        [key: string]: cloudwatch.Alarm;
    };
    readonly alertTopic: sns.Topic;
    constructor(scope: Construct, id: string, props: TrinityMonitoringStackProps);
    /**
     * Create SNS topic for alerts
     */
    private createAlertTopic;
    /**
     * Create overview dashboard
     */
    private createOverviewDashboard;
    /**
     * Create Lambda-specific dashboard
     */
    private createLambdaDashboard;
    /**
     * Create DynamoDB-specific dashboard
     */
    private createDynamoDBDashboard;
    /**
     * Create API-specific dashboard
     */
    private createApiDashboard;
    /**
     * Create Lambda function alarms
     */
    private createLambdaAlarms;
    /**
     * Create DynamoDB alarms
     */
    private createDynamoDBAlarms;
    /**
     * Create AppSync API alarms
     */
    private createApiAlarms;
    /**
     * Create log retention policies
     */
    createLogRetentionPolicies(lambdaFunctions: string[], config: TrinityEnvironmentConfig): void;
    /**
     * Convert days to CloudWatch log retention enum
     */
    private getLogRetention;
}
export {};
