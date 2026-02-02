#!/usr/bin/env npx ts-node
"use strict";
/**
 * Trinity Monitoring Setup Script
 *
 * Configures and deploys comprehensive monitoring for Trinity infrastructure
 * including dashboards, alarms, and log management
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
exports.TrinityMonitoringManager = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const client_sns_1 = require("@aws-sdk/client-sns");
class TrinityMonitoringManager {
    constructor(config) {
        this.config = config;
        this.cloudWatchClient = new client_cloudwatch_1.CloudWatchClient({ region: config.region });
        this.snsClient = new client_sns_1.SNSClient({ region: config.region });
    }
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const icon = level === 'info' ? '📊' : level === 'warn' ? '⚠️' : '❌';
        console.log(`${icon} [${timestamp}] ${message}`);
    }
    /**
     * Deploy monitoring stack
     */
    async deployMonitoring() {
        this.log('🚀 Deploying Trinity monitoring stack...');
        try {
            // Build the CDK project
            this.log('🔨 Building CDK project...');
            (0, child_process_1.execSync)('npm run build', { stdio: 'inherit' });
            // Deploy monitoring stack
            const deployCommand = [
                'cdk', 'deploy', 'TrinityMonitoringStack',
                '--require-approval', 'never',
                '--outputs-file', 'monitoring-outputs.json'
            ];
            this.log(`📝 Executing: ${deployCommand.join(' ')}`);
            (0, child_process_1.execSync)(deployCommand.join(' '), { stdio: 'inherit' });
            this.log('✅ Monitoring stack deployed successfully');
            return true;
        }
        catch (error) {
            this.log(`❌ Failed to deploy monitoring stack: ${error}`, 'error');
            return false;
        }
    }
    /**
     * Validate existing monitoring setup
     */
    async validateMonitoring() {
        this.log('🔍 Validating existing monitoring setup...');
        const report = {
            timestamp: new Date().toISOString(),
            environment: this.config.environment,
            dashboards: [],
            alarms: [],
            alerting: {
                snsTopicExists: false,
                subscriptions: 0,
                emailConfigured: false,
            },
            recommendations: [],
        };
        try {
            // Check dashboards
            await this.validateDashboards(report);
            // Check SNS alerting
            await this.validateAlerting(report);
            // Generate recommendations
            this.generateRecommendations(report);
        }
        catch (error) {
            this.log(`❌ Monitoring validation failed: ${error}`, 'error');
            report.recommendations.push(`Fix monitoring validation error: ${error}`);
        }
        return report;
    }
    /**
     * Validate CloudWatch dashboards
     */
    async validateDashboards(report) {
        this.log('📊 Checking CloudWatch dashboards...');
        try {
            const dashboardsResponse = await this.cloudWatchClient.send(new client_cloudwatch_1.ListDashboardsCommand({}));
            const existingDashboards = dashboardsResponse.DashboardEntries || [];
            const expectedDashboards = [
                `trinity-${this.config.environment}-overview`,
                `trinity-${this.config.environment}-lambda-metrics`,
                `trinity-${this.config.environment}-dynamodb-metrics`,
                `trinity-${this.config.environment}-api-metrics`,
            ];
            for (const expectedDashboard of expectedDashboards) {
                const dashboard = existingDashboards.find((d) => d.DashboardName === expectedDashboard);
                if (dashboard) {
                    try {
                        const dashboardDetails = await this.cloudWatchClient.send(new client_cloudwatch_1.GetDashboardCommand({ DashboardName: expectedDashboard }));
                        const widgetCount = this.countDashboardWidgets(dashboardDetails.DashboardBody || '');
                        report.dashboards.push({
                            name: expectedDashboard,
                            status: 'exists',
                            widgets: widgetCount,
                        });
                        this.log(`✅ Dashboard found: ${expectedDashboard} (${widgetCount} widgets)`);
                    }
                    catch (error) {
                        report.dashboards.push({
                            name: expectedDashboard,
                            status: 'error',
                        });
                        this.log(`❌ Error accessing dashboard: ${expectedDashboard}`, 'error');
                    }
                }
                else {
                    report.dashboards.push({
                        name: expectedDashboard,
                        status: 'missing',
                    });
                    this.log(`⚠️ Missing dashboard: ${expectedDashboard}`, 'warn');
                }
            }
        }
        catch (error) {
            this.log(`❌ Failed to validate dashboards: ${error}`, 'error');
        }
    }
    /**
     * Count widgets in dashboard JSON
     */
    countDashboardWidgets(dashboardBody) {
        try {
            const dashboard = JSON.parse(dashboardBody);
            let widgetCount = 0;
            if (dashboard.widgets) {
                widgetCount = dashboard.widgets.length;
            }
            return widgetCount;
        }
        catch (error) {
            return 0;
        }
    }
    /**
     * Validate SNS alerting setup
     */
    async validateAlerting(report) {
        this.log('📧 Checking SNS alerting setup...');
        try {
            const topicsResponse = await this.snsClient.send(new client_sns_1.ListTopicsCommand({}));
            const topics = topicsResponse.Topics || [];
            const alertTopicArn = topics.find(topic => topic.TopicArn?.includes(`trinity-alerts-${this.config.environment}`));
            if (alertTopicArn) {
                report.alerting.snsTopicExists = true;
                try {
                    const topicAttributes = await this.snsClient.send(new client_sns_1.GetTopicAttributesCommand({ TopicArn: alertTopicArn.TopicArn }));
                    const subscriptionsConfirmed = parseInt(topicAttributes.Attributes?.SubscriptionsConfirmed || '0');
                    report.alerting.subscriptions = subscriptionsConfirmed;
                    report.alerting.emailConfigured = subscriptionsConfirmed > 0;
                    this.log(`✅ Alert topic found with ${subscriptionsConfirmed} subscriptions`);
                }
                catch (error) {
                    this.log(`⚠️ Could not get topic details: ${error}`, 'warn');
                }
            }
            else {
                this.log(`⚠️ Alert topic not found: trinity-alerts-${this.config.environment}`, 'warn');
            }
        }
        catch (error) {
            this.log(`❌ Failed to validate alerting: ${error}`, 'error');
        }
    }
    /**
     * Generate monitoring recommendations
     */
    generateRecommendations(report) {
        const recommendations = [];
        // Dashboard recommendations
        const missingDashboards = report.dashboards.filter(d => d.status === 'missing');
        if (missingDashboards.length > 0) {
            recommendations.push(`📊 Create missing dashboards: ${missingDashboards.map(d => d.name).join(', ')}`);
            recommendations.push('   Run: npm run deploy:monitoring');
        }
        const errorDashboards = report.dashboards.filter(d => d.status === 'error');
        if (errorDashboards.length > 0) {
            recommendations.push(`🔧 Fix dashboard errors: ${errorDashboards.map(d => d.name).join(', ')}`);
        }
        // Alerting recommendations
        if (!report.alerting.snsTopicExists) {
            recommendations.push('📧 Create SNS alert topic for notifications');
            recommendations.push('   Run: npm run deploy:monitoring');
        }
        if (report.alerting.snsTopicExists && !report.alerting.emailConfigured) {
            recommendations.push('📧 Configure email subscriptions for alerts');
            recommendations.push('   Add email to monitoring configuration');
        }
        // Environment-specific recommendations
        if (this.config.environment === 'production') {
            recommendations.push('🔒 Production monitoring recommendations:');
            recommendations.push('   - Enable detailed monitoring for all resources');
            recommendations.push('   - Set up PagerDuty or similar for critical alerts');
            recommendations.push('   - Configure log aggregation and analysis');
            recommendations.push('   - Set up synthetic monitoring for API endpoints');
        }
        if (this.config.environment === 'dev') {
            recommendations.push('🛠️ Development monitoring recommendations:');
            recommendations.push('   - Use relaxed alarm thresholds');
            recommendations.push('   - Enable debug logging for troubleshooting');
            recommendations.push('   - Set up local monitoring dashboard');
        }
        // Performance recommendations
        recommendations.push('⚡ Performance monitoring recommendations:');
        recommendations.push('   - Monitor Lambda cold starts and duration');
        recommendations.push('   - Track DynamoDB throttling and capacity utilization');
        recommendations.push('   - Set up API latency and error rate monitoring');
        recommendations.push('   - Monitor cache hit rates for movie data');
        report.recommendations = recommendations;
    }
    /**
     * Setup custom metrics
     */
    async setupCustomMetrics() {
        this.log('📈 Setting up custom metrics...');
        const customMetricsConfig = {
            namespace: 'Trinity/Application',
            metrics: [
                {
                    name: 'MovieCacheHitRate',
                    description: 'Cache hit rate for movie data',
                    unit: 'Percent',
                },
                {
                    name: 'RoomCreationRate',
                    description: 'Rate of room creation',
                    unit: 'Count/Second',
                },
                {
                    name: 'VoteProcessingTime',
                    description: 'Time to process votes',
                    unit: 'Milliseconds',
                },
                {
                    name: 'MatchDetectionTime',
                    description: 'Time to detect matches',
                    unit: 'Milliseconds',
                },
            ],
        };
        // Save custom metrics configuration
        const configPath = path.join('monitoring-config', 'custom-metrics.json');
        if (!fs.existsSync('monitoring-config')) {
            fs.mkdirSync('monitoring-config', { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(customMetricsConfig, null, 2));
        this.log(`✅ Custom metrics configuration saved: ${configPath}`);
    }
    /**
     * Generate monitoring report
     */
    generateReport(report) {
        const reportPath = path.join('monitoring-reports', `monitoring-${Date.now()}.json`);
        if (!fs.existsSync('monitoring-reports')) {
            fs.mkdirSync('monitoring-reports', { recursive: true });
        }
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        // Print summary
        console.log('\n📊 Monitoring Summary:');
        console.log(`   📊 Dashboards: ${report.dashboards.filter(d => d.status === 'exists').length}/${report.dashboards.length} exist`);
        console.log(`   📧 Alert Topic: ${report.alerting.snsTopicExists ? '✅' : '❌'}`);
        console.log(`   📧 Email Alerts: ${report.alerting.emailConfigured ? '✅' : '❌'}`);
        console.log(`   📋 Report: ${reportPath}`);
        // Print recommendations
        console.log('\n💡 Recommendations:');
        report.recommendations.forEach(rec => console.log(`   ${rec}`));
    }
    /**
     * Execute monitoring setup
     */
    async execute(action) {
        try {
            this.log(`🚀 Starting Trinity monitoring ${action}...`);
            switch (action) {
                case 'deploy':
                    const deploySuccess = await this.deployMonitoring();
                    if (deploySuccess) {
                        await this.setupCustomMetrics();
                    }
                    return deploySuccess;
                case 'validate':
                    const report = await this.validateMonitoring();
                    this.generateReport(report);
                    return report.dashboards.every(d => d.status === 'exists') && report.alerting.snsTopicExists;
                case 'setup':
                    await this.setupCustomMetrics();
                    const setupReport = await this.validateMonitoring();
                    this.generateReport(setupReport);
                    return true;
                default:
                    this.log(`❌ Unknown action: ${action}`, 'error');
                    return false;
            }
        }
        catch (error) {
            this.log(`❌ Monitoring ${action} failed: ${error}`, 'error');
            return false;
        }
    }
}
exports.TrinityMonitoringManager = TrinityMonitoringManager;
// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const config = {
        environment: args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev',
        region: args.find(arg => arg.startsWith('--region='))?.split('=')[1] || 'eu-west-1',
        alertEmail: args.find(arg => arg.startsWith('--email='))?.split('=')[1],
        enableDetailedMonitoring: args.includes('--detailed'),
        customMetrics: args.includes('--custom-metrics'),
    };
    const action = args[0] || 'validate';
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Trinity Monitoring Setup

Usage:
  npx ts-node setup-monitoring.ts [action] [options]

Actions:
  deploy               Deploy monitoring stack with dashboards and alarms
  validate             Validate existing monitoring setup (default)
  setup                Setup custom metrics and configuration

Options:
  --env=<env>          Environment (dev|staging|production) [default: dev]
  --region=<region>    AWS region [default: eu-west-1]
  --email=<email>      Email address for alerts
  --detailed           Enable detailed monitoring
  --custom-metrics     Setup custom application metrics
  --help, -h          Show this help message

Examples:
  # Deploy monitoring for development
  npx ts-node setup-monitoring.ts deploy --env=dev --email=admin@example.com
  
  # Validate existing monitoring
  npx ts-node setup-monitoring.ts validate --env=production
  
  # Setup custom metrics
  npx ts-node setup-monitoring.ts setup --custom-metrics
`);
        process.exit(0);
    }
    const manager = new TrinityMonitoringManager(config);
    manager.execute(action).then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('❌ Monitoring setup failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dXAtbW9uaXRvcmluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNldHVwLW1vbml0b3JpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFFQTs7Ozs7R0FLRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsaURBQXlDO0FBQ3pDLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFDN0Isa0VBQTBHO0FBQzFHLG9EQUE4RjtBQWlDOUYsTUFBTSx3QkFBd0I7SUFLNUIsWUFBWSxNQUF3QjtRQUNsQyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxvQ0FBZ0IsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUN4RSxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUM1RCxDQUFDO0lBRU8sR0FBRyxDQUFDLE9BQWUsRUFBRSxRQUFtQyxNQUFNO1FBQ3BFLE1BQU0sU0FBUyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDM0MsTUFBTSxJQUFJLEdBQUcsS0FBSyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztRQUNyRSxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxLQUFLLFNBQVMsS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxnQkFBZ0I7UUFDcEIsSUFBSSxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO1FBRXJELElBQUksQ0FBQztZQUNILHdCQUF3QjtZ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LENBQUMsQ0FBb0MsSUFBSSxVQUFVLENBQUM7SUFFeEUsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUNuRCxPQUFPLENBQUMsR0FBRyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBNEJmLENBQUMsQ0FBQztRQUNDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQztJQUVELE1BQU0sT0FBTyxHQUFHLElBQUksd0JBQXdCLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDckQsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDckMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5weCB0cy1ub2RlXHJcblxyXG4vKipcclxuICogVHJpbml0eSBNb25pdG9yaW5nIFNldHVwIFNjcmlwdFxyXG4gKiBcclxuICogQ29uZmlndXJlcyBhbmQgZGVwbG95cyBjb21wcmVoZW5zaXZlIG1vbml0b3JpbmcgZm9yIFRyaW5pdHkgaW5mcmFzdHJ1Y3R1cmVcclxuICogaW5jbHVkaW5nIGRhc2hib2FyZHMsIGFsYXJtcywgYW5kIGxvZyBtYW5hZ2VtZW50XHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcclxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgeyBDbG91ZFdhdGNoQ2xpZW50LCBMaXN0RGFzaGJvYXJkc0NvbW1hbmQsIEdldERhc2hib2FyZENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtY2xvdWR3YXRjaCc7XHJcbmltcG9ydCB7IFNOU0NsaWVudCwgTGlzdFRvcGljc0NvbW1hbmQsIEdldFRvcGljQXR0cmlidXRlc0NvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc25zJztcclxuaW1wb3J0IHsgZ2V0RGVwbG95bWVudENvbmZpZyB9IGZyb20gJy4uL2NvbmZpZy9kZXBsb3ltZW50LWNvbmZpZ3MnO1xyXG5cclxuaW50ZXJmYWNlIE1vbml0b3JpbmdDb25maWcge1xyXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XHJcbiAgcmVnaW9uOiBzdHJpbmc7XHJcbiAgYWxlcnRFbWFpbD86IHN0cmluZztcclxuICBzbGFja1dlYmhvb2s/OiBzdHJpbmc7XHJcbiAgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiBib29sZWFuO1xyXG4gIGN1c3RvbU1ldHJpY3M6IGJvb2xlYW47XHJcbn1cclxuXHJcbmludGVyZmFjZSBNb25pdG9yaW5nUmVwb3J0IHtcclxuICB0aW1lc3RhbXA6IHN0cmluZztcclxuICBlbnZpcm9ubWVudDogc3RyaW5nO1xyXG4gIGRhc2hib2FyZHM6IEFycmF5PHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHN0YXR1czogJ2V4aXN0cycgfCAnbWlzc2luZycgfCAnZXJyb3InO1xyXG4gICAgd2lkZ2V0cz86IG51bWJlcjtcclxuICB9PjtcclxuICBhbGFybXM6IEFycmF5PHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHN0YXR1czogJ29rJyB8ICdhbGFybScgfCAnaW5zdWZmaWNpZW50X2RhdGEnIHwgJ21pc3NpbmcnO1xyXG4gICAgdGhyZXNob2xkPzogbnVtYmVyO1xyXG4gIH0+O1xyXG4gIGFsZXJ0aW5nOiB7XHJcbiAgICBzbnNUb3BpY0V4aXN0czogYm9vbGVhbjtcclxuICAgIHN1YnNjcmlwdGlvbnM6IG51bWJlcjtcclxuICAgIGVtYWlsQ29uZmlndXJlZDogYm9vbGVhbjtcclxuICB9O1xyXG4gIHJlY29tbWVuZGF0aW9uczogc3RyaW5nW107XHJcbn1cclxuXHJcbmNsYXNzIFRyaW5pdHlNb25pdG9yaW5nTWFuYWdlciB7XHJcbiAgcHJpdmF0ZSBjb25maWc6IE1vbml0b3JpbmdDb25maWc7XHJcbiAgcHJpdmF0ZSBjbG91ZFdhdGNoQ2xpZW50OiBDbG91ZFdhdGNoQ2xpZW50O1xyXG4gIHByaXZhdGUgc25zQ2xpZW50OiBTTlNDbGllbnQ7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogTW9uaXRvcmluZ0NvbmZpZykge1xyXG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XHJcbiAgICB0aGlzLmNsb3VkV2F0Y2hDbGllbnQgPSBuZXcgQ2xvdWRXYXRjaENsaWVudCh7IHJlZ2lvbjogY29uZmlnLnJlZ2lvbiB9KTtcclxuICAgIHRoaXMuc25zQ2xpZW50ID0gbmV3IFNOU0NsaWVudCh7IHJlZ2lvbjogY29uZmlnLnJlZ2lvbiB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgbG9nKG1lc3NhZ2U6IHN0cmluZywgbGV2ZWw6ICdpbmZvJyB8ICd3YXJuJyB8ICdlcnJvcicgPSAnaW5mbycpIHtcclxuICAgIGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICAgIGNvbnN0IGljb24gPSBsZXZlbCA9PT0gJ2luZm8nID8gJ/Cfk4onIDogbGV2ZWwgPT09ICd3YXJuJyA/ICfimqDvuI8nIDogJ+KdjCc7XHJcbiAgICBjb25zb2xlLmxvZyhgJHtpY29ufSBbJHt0aW1lc3RhbXB9XSAke21lc3NhZ2V9YCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBEZXBsb3kgbW9uaXRvcmluZyBzdGFja1xyXG4gICAqL1xyXG4gIGFzeW5jIGRlcGxveU1vbml0b3JpbmcoKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICB0aGlzLmxvZygn8J+agCBEZXBsb3lpbmcgVHJpbml0eSBtb25pdG9yaW5nIHN0YWNrLi4uJyk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gQnVpbGQgdGhlIENESyBwcm9qZWN0XHJcbiAgICAgIHRoaXMubG9nKCfwn5SoIEJ1aWxkaW5nIENESyBwcm9qZWN0Li4uJyk7XHJcbiAgICAgIGV4ZWNTeW5jKCducG0gcnVuIGJ1aWxkJywgeyBzdGRpbzogJ2luaGVyaXQnIH0pO1xyXG5cclxuICAgICAgLy8gRGVwbG95IG1vbml0b3Jpbmcgc3RhY2tcclxuICAgICAgY29uc3QgZGVwbG95Q29tbWFuZCA9IFtcclxuICAgICAgICAnY2RrJywgJ2RlcGxveScsICdUcmluaXR5TW9uaXRvcmluZ1N0YWNrJyxcclxuICAgICAgICAnLS1yZXF1aXJlLWFwcHJvdmFsJywgJ25ldmVyJyxcclxuICAgICAgICAnLS1vdXRwdXRzLWZpbGUnLCAnbW9uaXRvcmluZy1vdXRwdXRzLmpzb24nXHJcbiAgICAgIF07XHJcblxyXG4gICAgICB0aGlzLmxvZyhg8J+TnSBFeGVjdXRpbmc6ICR7ZGVwbG95Q29tbWFuZC5qb2luKCcgJyl9YCk7XHJcbiAgICAgIGV4ZWNTeW5jKGRlcGxveUNvbW1hbmQuam9pbignICcpLCB7IHN0ZGlvOiAnaW5oZXJpdCcgfSk7XHJcblxyXG4gICAgICB0aGlzLmxvZygn4pyFIE1vbml0b3Jpbmcgc3RhY2sgZGVwbG95ZWQgc3VjY2Vzc2Z1bGx5Jyk7XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMubG9nKGDinYwgRmFpbGVkIHRvIGRlcGxveSBtb25pdG9yaW5nIHN0YWNrOiAke2Vycm9yfWAsICdlcnJvcicpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBleGlzdGluZyBtb25pdG9yaW5nIHNldHVwXHJcbiAgICovXHJcbiAgYXN5bmMgdmFsaWRhdGVNb25pdG9yaW5nKCk6IFByb21pc2U8TW9uaXRvcmluZ1JlcG9ydD4ge1xyXG4gICAgdGhpcy5sb2coJ/CflI0gVmFsaWRhdGluZyBleGlzdGluZyBtb25pdG9yaW5nIHNldHVwLi4uJyk7XHJcblxyXG4gICAgY29uc3QgcmVwb3J0OiBNb25pdG9yaW5nUmVwb3J0ID0ge1xyXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHRoaXMuY29uZmlnLmVudmlyb25tZW50LFxyXG4gICAgICBkYXNoYm9hcmRzOiBbXSxcclxuICAgICAgYWxhcm1zOiBbXSxcclxuICAgICAgYWxlcnRpbmc6IHtcclxuICAgICAgICBzbnNUb3BpY0V4aXN0czogZmFsc2UsXHJcbiAgICAgICAgc3Vic2NyaXB0aW9uczogMCxcclxuICAgICAgICBlbWFpbENvbmZpZ3VyZWQ6IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgICByZWNvbW1lbmRhdGlvbnM6IFtdLFxyXG4gICAgfTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBDaGVjayBkYXNoYm9hcmRzXHJcbiAgICAgIGF3YWl0IHRoaXMudmFsaWRhdGVEYXNoYm9hcmRzKHJlcG9ydCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBDaGVjayBTTlMgYWxlcnRpbmdcclxuICAgICAgYXdhaXQgdGhpcy52YWxpZGF0ZUFsZXJ0aW5nKHJlcG9ydCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBHZW5lcmF0ZSByZWNvbW1lbmRhdGlvbnNcclxuICAgICAgdGhpcy5nZW5lcmF0ZVJlY29tbWVuZGF0aW9ucyhyZXBvcnQpO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMubG9nKGDinYwgTW9uaXRvcmluZyB2YWxpZGF0aW9uIGZhaWxlZDogJHtlcnJvcn1gLCAnZXJyb3InKTtcclxuICAgICAgcmVwb3J0LnJlY29tbWVuZGF0aW9ucy5wdXNoKGBGaXggbW9uaXRvcmluZyB2YWxpZGF0aW9uIGVycm9yOiAke2Vycm9yfWApO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXBvcnQ7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBDbG91ZFdhdGNoIGRhc2hib2FyZHNcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlRGFzaGJvYXJkcyhyZXBvcnQ6IE1vbml0b3JpbmdSZXBvcnQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHRoaXMubG9nKCfwn5OKIENoZWNraW5nIENsb3VkV2F0Y2ggZGFzaGJvYXJkcy4uLicpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGRhc2hib2FyZHNSZXNwb25zZSA9IGF3YWl0IHRoaXMuY2xvdWRXYXRjaENsaWVudC5zZW5kKG5ldyBMaXN0RGFzaGJvYXJkc0NvbW1hbmQoe30pKTtcclxuICAgICAgY29uc3QgZXhpc3RpbmdEYXNoYm9hcmRzID0gZGFzaGJvYXJkc1Jlc3BvbnNlLkRhc2hib2FyZEVudHJpZXMgfHwgW107XHJcblxyXG4gICAgICBjb25zdCBleHBlY3RlZERhc2hib2FyZHMgPSBbXHJcbiAgICAgICAgYHRyaW5pdHktJHt0aGlzLmNvbmZpZy5lbnZpcm9ubWVudH0tb3ZlcnZpZXdgLFxyXG4gICAgICAgIGB0cmluaXR5LSR7dGhpcy5jb25maWcuZW52aXJvbm1lbnR9LWxhbWJkYS1tZXRyaWNzYCxcclxuICAgICAgICBgdHJpbml0eS0ke3RoaXMuY29uZmlnLmVudmlyb25tZW50fS1keW5hbW9kYi1tZXRyaWNzYCxcclxuICAgICAgICBgdHJpbml0eS0ke3RoaXMuY29uZmlnLmVudmlyb25tZW50fS1hcGktbWV0cmljc2AsXHJcbiAgICAgIF07XHJcblxyXG4gICAgICBmb3IgKGNvbnN0IGV4cGVjdGVkRGFzaGJvYXJkIG9mIGV4cGVjdGVkRGFzaGJvYXJkcykge1xyXG4gICAgICAgIGNvbnN0IGRhc2hib2FyZCA9IGV4aXN0aW5nRGFzaGJvYXJkcy5maW5kKChkOiBhbnkpID0+IGQuRGFzaGJvYXJkTmFtZSA9PT0gZXhwZWN0ZWREYXNoYm9hcmQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChkYXNoYm9hcmQpIHtcclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRhc2hib2FyZERldGFpbHMgPSBhd2FpdCB0aGlzLmNsb3VkV2F0Y2hDbGllbnQuc2VuZChcclxuICAgICAgICAgICAgICBuZXcgR2V0RGFzaGJvYXJkQ29tbWFuZCh7IERhc2hib2FyZE5hbWU6IGV4cGVjdGVkRGFzaGJvYXJkIH0pXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCB3aWRnZXRDb3VudCA9IHRoaXMuY291bnREYXNoYm9hcmRXaWRnZXRzKGRhc2hib2FyZERldGFpbHMuRGFzaGJvYXJkQm9keSB8fCAnJyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXBvcnQuZGFzaGJvYXJkcy5wdXNoKHtcclxuICAgICAgICAgICAgICBuYW1lOiBleHBlY3RlZERhc2hib2FyZCxcclxuICAgICAgICAgICAgICBzdGF0dXM6ICdleGlzdHMnLFxyXG4gICAgICAgICAgICAgIHdpZGdldHM6IHdpZGdldENvdW50LFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRoaXMubG9nKGDinIUgRGFzaGJvYXJkIGZvdW5kOiAke2V4cGVjdGVkRGFzaGJvYXJkfSAoJHt3aWRnZXRDb3VudH0gd2lkZ2V0cylgKTtcclxuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIHJlcG9ydC5kYXNoYm9hcmRzLnB1c2goe1xyXG4gICAgICAgICAgICAgIG5hbWU6IGV4cGVjdGVkRGFzaGJvYXJkLFxyXG4gICAgICAgICAgICAgIHN0YXR1czogJ2Vycm9yJyxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRoaXMubG9nKGDinYwgRXJyb3IgYWNjZXNzaW5nIGRhc2hib2FyZDogJHtleHBlY3RlZERhc2hib2FyZH1gLCAnZXJyb3InKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgcmVwb3J0LmRhc2hib2FyZHMucHVzaCh7XHJcbiAgICAgICAgICAgIG5hbWU6IGV4cGVjdGVkRGFzaGJvYXJkLFxyXG4gICAgICAgICAgICBzdGF0dXM6ICdtaXNzaW5nJyxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgdGhpcy5sb2coYOKaoO+4jyBNaXNzaW5nIGRhc2hib2FyZDogJHtleHBlY3RlZERhc2hib2FyZH1gLCAnd2FybicpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMubG9nKGDinYwgRmFpbGVkIHRvIHZhbGlkYXRlIGRhc2hib2FyZHM6ICR7ZXJyb3J9YCwgJ2Vycm9yJyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDb3VudCB3aWRnZXRzIGluIGRhc2hib2FyZCBKU09OXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBjb3VudERhc2hib2FyZFdpZGdldHMoZGFzaGJvYXJkQm9keTogc3RyaW5nKTogbnVtYmVyIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGRhc2hib2FyZCA9IEpTT04ucGFyc2UoZGFzaGJvYXJkQm9keSk7XHJcbiAgICAgIGxldCB3aWRnZXRDb3VudCA9IDA7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZGFzaGJvYXJkLndpZGdldHMpIHtcclxuICAgICAgICB3aWRnZXRDb3VudCA9IGRhc2hib2FyZC53aWRnZXRzLmxlbmd0aDtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHdpZGdldENvdW50O1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgcmV0dXJuIDA7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSBTTlMgYWxlcnRpbmcgc2V0dXBcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlQWxlcnRpbmcocmVwb3J0OiBNb25pdG9yaW5nUmVwb3J0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLmxvZygn8J+TpyBDaGVja2luZyBTTlMgYWxlcnRpbmcgc2V0dXAuLi4nKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCB0b3BpY3NSZXNwb25zZSA9IGF3YWl0IHRoaXMuc25zQ2xpZW50LnNlbmQobmV3IExpc3RUb3BpY3NDb21tYW5kKHt9KSk7XHJcbiAgICAgIGNvbnN0IHRvcGljcyA9IHRvcGljc1Jlc3BvbnNlLlRvcGljcyB8fCBbXTtcclxuXHJcbiAgICAgIGNvbnN0IGFsZXJ0VG9waWNBcm4gPSB0b3BpY3MuZmluZCh0b3BpYyA9PiBcclxuICAgICAgICB0b3BpYy5Ub3BpY0Fybj8uaW5jbHVkZXMoYHRyaW5pdHktYWxlcnRzLSR7dGhpcy5jb25maWcuZW52aXJvbm1lbnR9YClcclxuICAgICAgKTtcclxuXHJcbiAgICAgIGlmIChhbGVydFRvcGljQXJuKSB7XHJcbiAgICAgICAgcmVwb3J0LmFsZXJ0aW5nLnNuc1RvcGljRXhpc3RzID0gdHJ1ZTtcclxuICAgICAgICBcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgY29uc3QgdG9waWNBdHRyaWJ1dGVzID0gYXdhaXQgdGhpcy5zbnNDbGllbnQuc2VuZChcclxuICAgICAgICAgICAgbmV3IEdldFRvcGljQXR0cmlidXRlc0NvbW1hbmQoeyBUb3BpY0FybjogYWxlcnRUb3BpY0Fybi5Ub3BpY0FybiB9KVxyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uc0NvbmZpcm1lZCA9IHBhcnNlSW50KFxyXG4gICAgICAgICAgICB0b3BpY0F0dHJpYnV0ZXMuQXR0cmlidXRlcz8uU3Vic2NyaXB0aW9uc0NvbmZpcm1lZCB8fCAnMCdcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIHJlcG9ydC5hbGVydGluZy5zdWJzY3JpcHRpb25zID0gc3Vic2NyaXB0aW9uc0NvbmZpcm1lZDtcclxuICAgICAgICAgIHJlcG9ydC5hbGVydGluZy5lbWFpbENvbmZpZ3VyZWQgPSBzdWJzY3JpcHRpb25zQ29uZmlybWVkID4gMDtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgdGhpcy5sb2coYOKchSBBbGVydCB0b3BpYyBmb3VuZCB3aXRoICR7c3Vic2NyaXB0aW9uc0NvbmZpcm1lZH0gc3Vic2NyaXB0aW9uc2ApO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICB0aGlzLmxvZyhg4pqg77iPIENvdWxkIG5vdCBnZXQgdG9waWMgZGV0YWlsczogJHtlcnJvcn1gLCAnd2FybicpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLmxvZyhg4pqg77iPIEFsZXJ0IHRvcGljIG5vdCBmb3VuZDogdHJpbml0eS1hbGVydHMtJHt0aGlzLmNvbmZpZy5lbnZpcm9ubWVudH1gLCAnd2FybicpO1xyXG4gICAgICB9XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5sb2coYOKdjCBGYWlsZWQgdG8gdmFsaWRhdGUgYWxlcnRpbmc6ICR7ZXJyb3J9YCwgJ2Vycm9yJyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmF0ZSBtb25pdG9yaW5nIHJlY29tbWVuZGF0aW9uc1xyXG4gICAqL1xyXG4gIHByaXZhdGUgZ2VuZXJhdGVSZWNvbW1lbmRhdGlvbnMocmVwb3J0OiBNb25pdG9yaW5nUmVwb3J0KTogdm9pZCB7XHJcbiAgICBjb25zdCByZWNvbW1lbmRhdGlvbnM6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgLy8gRGFzaGJvYXJkIHJlY29tbWVuZGF0aW9uc1xyXG4gICAgY29uc3QgbWlzc2luZ0Rhc2hib2FyZHMgPSByZXBvcnQuZGFzaGJvYXJkcy5maWx0ZXIoZCA9PiBkLnN0YXR1cyA9PT0gJ21pc3NpbmcnKTtcclxuICAgIGlmIChtaXNzaW5nRGFzaGJvYXJkcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKGDwn5OKIENyZWF0ZSBtaXNzaW5nIGRhc2hib2FyZHM6ICR7bWlzc2luZ0Rhc2hib2FyZHMubWFwKGQgPT4gZC5uYW1lKS5qb2luKCcsICcpfWApO1xyXG4gICAgICByZWNvbW1lbmRhdGlvbnMucHVzaCgnICAgUnVuOiBucG0gcnVuIGRlcGxveTptb25pdG9yaW5nJyk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZXJyb3JEYXNoYm9hcmRzID0gcmVwb3J0LmRhc2hib2FyZHMuZmlsdGVyKGQgPT4gZC5zdGF0dXMgPT09ICdlcnJvcicpO1xyXG4gICAgaWYgKGVycm9yRGFzaGJvYXJkcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKGDwn5SnIEZpeCBkYXNoYm9hcmQgZXJyb3JzOiAke2Vycm9yRGFzaGJvYXJkcy5tYXAoZCA9PiBkLm5hbWUpLmpvaW4oJywgJyl9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQWxlcnRpbmcgcmVjb21tZW5kYXRpb25zXHJcbiAgICBpZiAoIXJlcG9ydC5hbGVydGluZy5zbnNUb3BpY0V4aXN0cykge1xyXG4gICAgICByZWNvbW1lbmRhdGlvbnMucHVzaCgn8J+TpyBDcmVhdGUgU05TIGFsZXJ0IHRvcGljIGZvciBub3RpZmljYXRpb25zJyk7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCcgICBSdW46IG5wbSBydW4gZGVwbG95Om1vbml0b3JpbmcnKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAocmVwb3J0LmFsZXJ0aW5nLnNuc1RvcGljRXhpc3RzICYmICFyZXBvcnQuYWxlcnRpbmcuZW1haWxDb25maWd1cmVkKSB7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCfwn5OnIENvbmZpZ3VyZSBlbWFpbCBzdWJzY3JpcHRpb25zIGZvciBhbGVydHMnKTtcclxuICAgICAgcmVjb21tZW5kYXRpb25zLnB1c2goJyAgIEFkZCBlbWFpbCB0byBtb25pdG9yaW5nIGNvbmZpZ3VyYXRpb24nKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBFbnZpcm9ubWVudC1zcGVjaWZpYyByZWNvbW1lbmRhdGlvbnNcclxuICAgIGlmICh0aGlzLmNvbmZpZy5lbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nKSB7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCfwn5SSIFByb2R1Y3Rpb24gbW9uaXRvcmluZyByZWNvbW1lbmRhdGlvbnM6Jyk7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCcgICAtIEVuYWJsZSBkZXRhaWxlZCBtb25pdG9yaW5nIGZvciBhbGwgcmVzb3VyY2VzJyk7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCcgICAtIFNldCB1cCBQYWdlckR1dHkgb3Igc2ltaWxhciBmb3IgY3JpdGljYWwgYWxlcnRzJyk7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCcgICAtIENvbmZpZ3VyZSBsb2cgYWdncmVnYXRpb24gYW5kIGFuYWx5c2lzJyk7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCcgICAtIFNldCB1cCBzeW50aGV0aWMgbW9uaXRvcmluZyBmb3IgQVBJIGVuZHBvaW50cycpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLmNvbmZpZy5lbnZpcm9ubWVudCA9PT0gJ2RldicpIHtcclxuICAgICAgcmVjb21tZW5kYXRpb25zLnB1c2goJ/Cfm6DvuI8gRGV2ZWxvcG1lbnQgbW9uaXRvcmluZyByZWNvbW1lbmRhdGlvbnM6Jyk7XHJcbiAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCcgICAtIFVzZSByZWxheGVkIGFsYXJtIHRocmVzaG9sZHMnKTtcclxuICAgICAgcmVjb21tZW5kYXRpb25zLnB1c2goJyAgIC0gRW5hYmxlIGRlYnVnIGxvZ2dpbmcgZm9yIHRyb3VibGVzaG9vdGluZycpO1xyXG4gICAgICByZWNvbW1lbmRhdGlvbnMucHVzaCgnICAgLSBTZXQgdXAgbG9jYWwgbW9uaXRvcmluZyBkYXNoYm9hcmQnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBQZXJmb3JtYW5jZSByZWNvbW1lbmRhdGlvbnNcclxuICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCfimqEgUGVyZm9ybWFuY2UgbW9uaXRvcmluZyByZWNvbW1lbmRhdGlvbnM6Jyk7XHJcbiAgICByZWNvbW1lbmRhdGlvbnMucHVzaCgnICAgLSBNb25pdG9yIExhbWJkYSBjb2xkIHN0YXJ0cyBhbmQgZHVyYXRpb24nKTtcclxuICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKCcgICAtIFRyYWNrIER5bmFtb0RCIHRocm90dGxpbmcgYW5kIGNhcGFjaXR5IHV0aWxpemF0aW9uJyk7XHJcbiAgICByZWNvbW1lbmRhdGlvbnMucHVzaCgnICAgLSBTZXQgdXAgQVBJIGxhdGVuY3kgYW5kIGVycm9yIHJhdGUgbW9uaXRvcmluZycpO1xyXG4gICAgcmVjb21tZW5kYXRpb25zLnB1c2goJyAgIC0gTW9uaXRvciBjYWNoZSBoaXQgcmF0ZXMgZm9yIG1vdmllIGRhdGEnKTtcclxuXHJcbiAgICByZXBvcnQucmVjb21tZW5kYXRpb25zID0gcmVjb21tZW5kYXRpb25zO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU2V0dXAgY3VzdG9tIG1ldHJpY3NcclxuICAgKi9cclxuICBhc3luYyBzZXR1cEN1c3RvbU1ldHJpY3MoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLmxvZygn8J+TiCBTZXR0aW5nIHVwIGN1c3RvbSBtZXRyaWNzLi4uJyk7XHJcblxyXG4gICAgY29uc3QgY3VzdG9tTWV0cmljc0NvbmZpZyA9IHtcclxuICAgICAgbmFtZXNwYWNlOiAnVHJpbml0eS9BcHBsaWNhdGlvbicsXHJcbiAgICAgIG1ldHJpY3M6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBuYW1lOiAnTW92aWVDYWNoZUhpdFJhdGUnLFxyXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdDYWNoZSBoaXQgcmF0ZSBmb3IgbW92aWUgZGF0YScsXHJcbiAgICAgICAgICB1bml0OiAnUGVyY2VudCcsXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBuYW1lOiAnUm9vbUNyZWF0aW9uUmF0ZScsXHJcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JhdGUgb2Ygcm9vbSBjcmVhdGlvbicsXHJcbiAgICAgICAgICB1bml0OiAnQ291bnQvU2Vjb25kJyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIG5hbWU6ICdWb3RlUHJvY2Vzc2luZ1RpbWUnLFxyXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaW1lIHRvIHByb2Nlc3Mgdm90ZXMnLFxyXG4gICAgICAgICAgdW5pdDogJ01pbGxpc2Vjb25kcycsXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBuYW1lOiAnTWF0Y2hEZXRlY3Rpb25UaW1lJyxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGltZSB0byBkZXRlY3QgbWF0Y2hlcycsXHJcbiAgICAgICAgICB1bml0OiAnTWlsbGlzZWNvbmRzJyxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBTYXZlIGN1c3RvbSBtZXRyaWNzIGNvbmZpZ3VyYXRpb25cclxuICAgIGNvbnN0IGNvbmZpZ1BhdGggPSBwYXRoLmpvaW4oJ21vbml0b3JpbmctY29uZmlnJywgJ2N1c3RvbS1tZXRyaWNzLmpzb24nKTtcclxuICAgIFxyXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKCdtb25pdG9yaW5nLWNvbmZpZycpKSB7XHJcbiAgICAgIGZzLm1rZGlyU3luYygnbW9uaXRvcmluZy1jb25maWcnLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnMud3JpdGVGaWxlU3luYyhjb25maWdQYXRoLCBKU09OLnN0cmluZ2lmeShjdXN0b21NZXRyaWNzQ29uZmlnLCBudWxsLCAyKSk7XHJcbiAgICBcclxuICAgIHRoaXMubG9nKGDinIUgQ3VzdG9tIG1ldHJpY3MgY29uZmlndXJhdGlvbiBzYXZlZDogJHtjb25maWdQYXRofWApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJhdGUgbW9uaXRvcmluZyByZXBvcnRcclxuICAgKi9cclxuICBnZW5lcmF0ZVJlcG9ydChyZXBvcnQ6IE1vbml0b3JpbmdSZXBvcnQpOiB2b2lkIHtcclxuICAgIGNvbnN0IHJlcG9ydFBhdGggPSBwYXRoLmpvaW4oJ21vbml0b3JpbmctcmVwb3J0cycsIGBtb25pdG9yaW5nLSR7RGF0ZS5ub3coKX0uanNvbmApO1xyXG4gICAgXHJcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoJ21vbml0b3JpbmctcmVwb3J0cycpKSB7XHJcbiAgICAgIGZzLm1rZGlyU3luYygnbW9uaXRvcmluZy1yZXBvcnRzJywgeyByZWN1cnNpdmU6IHRydWUgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZzLndyaXRlRmlsZVN5bmMocmVwb3J0UGF0aCwgSlNPTi5zdHJpbmdpZnkocmVwb3J0LCBudWxsLCAyKSk7XHJcblxyXG4gICAgLy8gUHJpbnQgc3VtbWFyeVxyXG4gICAgY29uc29sZS5sb2coJ1xcbvCfk4ogTW9uaXRvcmluZyBTdW1tYXJ5OicpO1xyXG4gICAgY29uc29sZS5sb2coYCAgIPCfk4ogRGFzaGJvYXJkczogJHtyZXBvcnQuZGFzaGJvYXJkcy5maWx0ZXIoZCA9PiBkLnN0YXR1cyA9PT0gJ2V4aXN0cycpLmxlbmd0aH0vJHtyZXBvcnQuZGFzaGJvYXJkcy5sZW5ndGh9IGV4aXN0YCk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAg8J+TpyBBbGVydCBUb3BpYzogJHtyZXBvcnQuYWxlcnRpbmcuc25zVG9waWNFeGlzdHMgPyAn4pyFJyA6ICfinYwnfWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIPCfk6cgRW1haWwgQWxlcnRzOiAke3JlcG9ydC5hbGVydGluZy5lbWFpbENvbmZpZ3VyZWQgPyAn4pyFJyA6ICfinYwnfWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIPCfk4sgUmVwb3J0OiAke3JlcG9ydFBhdGh9YCk7XHJcblxyXG4gICAgLy8gUHJpbnQgcmVjb21tZW5kYXRpb25zXHJcbiAgICBjb25zb2xlLmxvZygnXFxu8J+SoSBSZWNvbW1lbmRhdGlvbnM6Jyk7XHJcbiAgICByZXBvcnQucmVjb21tZW5kYXRpb25zLmZvckVhY2gocmVjID0+IGNvbnNvbGUubG9nKGAgICAke3JlY31gKSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFeGVjdXRlIG1vbml0b3Jpbmcgc2V0dXBcclxuICAgKi9cclxuICBhc3luYyBleGVjdXRlKGFjdGlvbjogJ2RlcGxveScgfCAndmFsaWRhdGUnIHwgJ3NldHVwJyk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgdGhpcy5sb2coYPCfmoAgU3RhcnRpbmcgVHJpbml0eSBtb25pdG9yaW5nICR7YWN0aW9ufS4uLmApO1xyXG5cclxuICAgICAgc3dpdGNoIChhY3Rpb24pIHtcclxuICAgICAgICBjYXNlICdkZXBsb3knOlxyXG4gICAgICAgICAgY29uc3QgZGVwbG95U3VjY2VzcyA9IGF3YWl0IHRoaXMuZGVwbG95TW9uaXRvcmluZygpO1xyXG4gICAgICAgICAgaWYgKGRlcGxveVN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5zZXR1cEN1c3RvbU1ldHJpY3MoKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJldHVybiBkZXBsb3lTdWNjZXNzO1xyXG5cclxuICAgICAgICBjYXNlICd2YWxpZGF0ZSc6XHJcbiAgICAgICAgICBjb25zdCByZXBvcnQgPSBhd2FpdCB0aGlzLnZhbGlkYXRlTW9uaXRvcmluZygpO1xyXG4gICAgICAgICAgdGhpcy5nZW5lcmF0ZVJlcG9ydChyZXBvcnQpO1xyXG4gICAgICAgICAgcmV0dXJuIHJlcG9ydC5kYXNoYm9hcmRzLmV2ZXJ5KGQgPT4gZC5zdGF0dXMgPT09ICdleGlzdHMnKSAmJiByZXBvcnQuYWxlcnRpbmcuc25zVG9waWNFeGlzdHM7XHJcblxyXG4gICAgICAgIGNhc2UgJ3NldHVwJzpcclxuICAgICAgICAgIGF3YWl0IHRoaXMuc2V0dXBDdXN0b21NZXRyaWNzKCk7XHJcbiAgICAgICAgICBjb25zdCBzZXR1cFJlcG9ydCA9IGF3YWl0IHRoaXMudmFsaWRhdGVNb25pdG9yaW5nKCk7XHJcbiAgICAgICAgICB0aGlzLmdlbmVyYXRlUmVwb3J0KHNldHVwUmVwb3J0KTtcclxuICAgICAgICAgIHJldHVybiB0cnVlO1xyXG5cclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgdGhpcy5sb2coYOKdjCBVbmtub3duIGFjdGlvbjogJHthY3Rpb259YCwgJ2Vycm9yJyk7XHJcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZyhg4p2MIE1vbml0b3JpbmcgJHthY3Rpb259IGZhaWxlZDogJHtlcnJvcn1gLCAnZXJyb3InKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLy8gQ0xJIGludGVyZmFjZVxyXG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcclxuICBjb25zdCBhcmdzID0gcHJvY2Vzcy5hcmd2LnNsaWNlKDIpO1xyXG4gIFxyXG4gIGNvbnN0IGNvbmZpZzogTW9uaXRvcmluZ0NvbmZpZyA9IHtcclxuICAgIGVudmlyb25tZW50OiBhcmdzLmZpbmQoYXJnID0+IGFyZy5zdGFydHNXaXRoKCctLWVudj0nKSk/LnNwbGl0KCc9JylbMV0gfHwgJ2RldicsXHJcbiAgICByZWdpb246IGFyZ3MuZmluZChhcmcgPT4gYXJnLnN0YXJ0c1dpdGgoJy0tcmVnaW9uPScpKT8uc3BsaXQoJz0nKVsxXSB8fCAnZXUtd2VzdC0xJyxcclxuICAgIGFsZXJ0RW1haWw6IGFyZ3MuZmluZChhcmcgPT4gYXJnLnN0YXJ0c1dpdGgoJy0tZW1haWw9JykpPy5zcGxpdCgnPScpWzFdLFxyXG4gICAgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiBhcmdzLmluY2x1ZGVzKCctLWRldGFpbGVkJyksXHJcbiAgICBjdXN0b21NZXRyaWNzOiBhcmdzLmluY2x1ZGVzKCctLWN1c3RvbS1tZXRyaWNzJyksXHJcbiAgfTtcclxuICBcclxuICBjb25zdCBhY3Rpb24gPSBhcmdzWzBdIGFzICdkZXBsb3knIHwgJ3ZhbGlkYXRlJyB8ICdzZXR1cCcgfHwgJ3ZhbGlkYXRlJztcclxuICBcclxuICBpZiAoYXJncy5pbmNsdWRlcygnLS1oZWxwJykgfHwgYXJncy5pbmNsdWRlcygnLWgnKSkge1xyXG4gICAgY29uc29sZS5sb2coYFxyXG5UcmluaXR5IE1vbml0b3JpbmcgU2V0dXBcclxuXHJcblVzYWdlOlxyXG4gIG5weCB0cy1ub2RlIHNldHVwLW1vbml0b3JpbmcudHMgW2FjdGlvbl0gW29wdGlvbnNdXHJcblxyXG5BY3Rpb25zOlxyXG4gIGRlcGxveSAgICAgICAgICAgICAgIERlcGxveSBtb25pdG9yaW5nIHN0YWNrIHdpdGggZGFzaGJvYXJkcyBhbmQgYWxhcm1zXHJcbiAgdmFsaWRhdGUgICAgICAgICAgICAgVmFsaWRhdGUgZXhpc3RpbmcgbW9uaXRvcmluZyBzZXR1cCAoZGVmYXVsdClcclxuICBzZXR1cCAgICAgICAgICAgICAgICBTZXR1cCBjdXN0b20gbWV0cmljcyBhbmQgY29uZmlndXJhdGlvblxyXG5cclxuT3B0aW9uczpcclxuICAtLWVudj08ZW52PiAgICAgICAgICBFbnZpcm9ubWVudCAoZGV2fHN0YWdpbmd8cHJvZHVjdGlvbikgW2RlZmF1bHQ6IGRldl1cclxuICAtLXJlZ2lvbj08cmVnaW9uPiAgICBBV1MgcmVnaW9uIFtkZWZhdWx0OiBldS13ZXN0LTFdXHJcbiAgLS1lbWFpbD08ZW1haWw+ICAgICAgRW1haWwgYWRkcmVzcyBmb3IgYWxlcnRzXHJcbiAgLS1kZXRhaWxlZCAgICAgICAgICAgRW5hYmxlIGRldGFpbGVkIG1vbml0b3JpbmdcclxuICAtLWN1c3RvbS1tZXRyaWNzICAgICBTZXR1cCBjdXN0b20gYXBwbGljYXRpb24gbWV0cmljc1xyXG4gIC0taGVscCwgLWggICAgICAgICAgU2hvdyB0aGlzIGhlbHAgbWVzc2FnZVxyXG5cclxuRXhhbXBsZXM6XHJcbiAgIyBEZXBsb3kgbW9uaXRvcmluZyBmb3IgZGV2ZWxvcG1lbnRcclxuICBucHggdHMtbm9kZSBzZXR1cC1tb25pdG9yaW5nLnRzIGRlcGxveSAtLWVudj1kZXYgLS1lbWFpbD1hZG1pbkBleGFtcGxlLmNvbVxyXG4gIFxyXG4gICMgVmFsaWRhdGUgZXhpc3RpbmcgbW9uaXRvcmluZ1xyXG4gIG5weCB0cy1ub2RlIHNldHVwLW1vbml0b3JpbmcudHMgdmFsaWRhdGUgLS1lbnY9cHJvZHVjdGlvblxyXG4gIFxyXG4gICMgU2V0dXAgY3VzdG9tIG1ldHJpY3NcclxuICBucHggdHMtbm9kZSBzZXR1cC1tb25pdG9yaW5nLnRzIHNldHVwIC0tY3VzdG9tLW1ldHJpY3NcclxuYCk7XHJcbiAgICBwcm9jZXNzLmV4aXQoMCk7XHJcbiAgfVxyXG4gIFxyXG4gIGNvbnN0IG1hbmFnZXIgPSBuZXcgVHJpbml0eU1vbml0b3JpbmdNYW5hZ2VyKGNvbmZpZyk7XHJcbiAgbWFuYWdlci5leGVjdXRlKGFjdGlvbikudGhlbihzdWNjZXNzID0+IHtcclxuICAgIHByb2Nlc3MuZXhpdChzdWNjZXNzID8gMCA6IDEpO1xyXG4gIH0pLmNhdGNoKGVycm9yID0+IHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBNb25pdG9yaW5nIHNldHVwIGZhaWxlZDonLCBlcnJvcik7XHJcbiAgICBwcm9jZXNzLmV4aXQoMSk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCB7IFRyaW5pdHlNb25pdG9yaW5nTWFuYWdlciwgTW9uaXRvcmluZ0NvbmZpZywgTW9uaXRvcmluZ1JlcG9ydCB9OyJdfQ==