#!/usr/bin/env npx ts-node
/**
 * Trinity Monitoring Setup Script
 *
 * Configures and deploys comprehensive monitoring for Trinity infrastructure
 * including dashboards, alarms, and log management
 */
interface MonitoringConfig {
    environment: string;
    region: string;
    alertEmail?: string;
    slackWebhook?: string;
    enableDetailedMonitoring: boolean;
    customMetrics: boolean;
}
interface MonitoringReport {
    timestamp: string;
    environment: string;
    dashboards: Array<{
        name: string;
        status: 'exists' | 'missing' | 'error';
        widgets?: number;
    }>;
    alarms: Array<{
        name: string;
        status: 'ok' | 'alarm' | 'insufficient_data' | 'missing';
        threshold?: number;
    }>;
    alerting: {
        snsTopicExists: boolean;
        subscriptions: number;
        emailConfigured: boolean;
    };
    recommendations: string[];
}
declare class TrinityMonitoringManager {
    private config;
    private cloudWatchClient;
    private snsClient;
    constructor(config: MonitoringConfig);
    private log;
    /**
     * Deploy monitoring stack
     */
    deployMonitoring(): Promise<boolean>;
    /**
     * Validate existing monitoring setup
     */
    validateMonitoring(): Promise<MonitoringReport>;
    /**
     * Validate CloudWatch dashboards
     */
    private validateDashboards;
    /**
     * Count widgets in dashboard JSON
     */
    private countDashboardWidgets;
    /**
     * Validate SNS alerting setup
     */
    private validateAlerting;
    /**
     * Generate monitoring recommendations
     */
    private generateRecommendations;
    /**
     * Setup custom metrics
     */
    setupCustomMetrics(): Promise<void>;
    /**
     * Generate monitoring report
     */
    generateReport(report: MonitoringReport): void;
    /**
     * Execute monitoring setup
     */
    execute(action: 'deploy' | 'validate' | 'setup'): Promise<boolean>;
}
export { TrinityMonitoringManager, MonitoringConfig, MonitoringReport };
