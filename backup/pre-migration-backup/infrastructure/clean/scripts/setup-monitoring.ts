#!/usr/bin/env npx ts-node

/**
 * Trinity Monitoring Setup Script
 * 
 * Configures and deploys comprehensive monitoring for Trinity infrastructure
 * including dashboards, alarms, and log management
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { CloudWatchClient, ListDashboardsCommand, GetDashboardCommand } from '@aws-sdk/client-cloudwatch';
import { SNSClient, ListTopicsCommand, GetTopicAttributesCommand } from '@aws-sdk/client-sns';
import { getDeploymentConfig } from '../config/deployment-configs';

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

class TrinityMonitoringManager {
  private config: MonitoringConfig;
  private cloudWatchClient: CloudWatchClient;
  private snsClient: SNSClient;

  constructor(config: MonitoringConfig) {
    this.config = config;
    this.cloudWatchClient = new CloudWatchClient({ region: config.region });
    this.snsClient = new SNSClient({ region: config.region });
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const timestamp = new Date().toISOString();
    const icon = level === 'info' ? '📊' : level === 'warn' ? '⚠️' : '❌';
    console.log(`${icon} [${timestamp}] ${message}`);
  }

  /**
   * Deploy monitoring stack
   */
  async deployMonitoring(): Promise<boolean> {
    this.log('🚀 Deploying Trinity monitoring stack...');

    try {
      // Build the CDK project
      this.log('🔨 Building CDK project...');
      execSync('npm run build', { stdio: 'inherit' });

      // Deploy monitoring stack
      const deployCommand = [
        'cdk', 'deploy', 'TrinityMonitoringStack',
        '--require-approval', 'never',
        '--outputs-file', 'monitoring-outputs.json'
      ];

      this.log(`📝 Executing: ${deployCommand.join(' ')}`);
      execSync(deployCommand.join(' '), { stdio: 'inherit' });

      this.log('✅ Monitoring stack deployed successfully');
      return true;

    } catch (error) {
      this.log(`❌ Failed to deploy monitoring stack: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Validate existing monitoring setup
   */
  async validateMonitoring(): Promise<MonitoringReport> {
    this.log('🔍 Validating existing monitoring setup...');

    const report: MonitoringReport = {
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

    } catch (error) {
      this.log(`❌ Monitoring validation failed: ${error}`, 'error');
      report.recommendations.push(`Fix monitoring validation error: ${error}`);
    }

    return report;
  }

  /**
   * Validate CloudWatch dashboards
   */
  private async validateDashboards(report: MonitoringReport): Promise<void> {
    this.log('📊 Checking CloudWatch dashboards...');

    try {
      const dashboardsResponse = await this.cloudWatchClient.send(new ListDashboardsCommand({}));
      const existingDashboards = dashboardsResponse.DashboardEntries || [];

      const expectedDashboards = [
        `trinity-${this.config.environment}-overview`,
        `trinity-${this.config.environment}-lambda-metrics`,
        `trinity-${this.config.environment}-dynamodb-metrics`,
        `trinity-${this.config.environment}-api-metrics`,
      ];

      for (const expectedDashboard of expectedDashboards) {
        const dashboard = existingDashboards.find((d: any) => d.DashboardName === expectedDashboard);
        
        if (dashboard) {
          try {
            const dashboardDetails = await this.cloudWatchClient.send(
              new GetDashboardCommand({ DashboardName: expectedDashboard })
            );
            
            const widgetCount = this.countDashboardWidgets(dashboardDetails.DashboardBody || '');
            
            report.dashboards.push({
              name: expectedDashboard,
              status: 'exists',
              widgets: widgetCount,
            });
            
            this.log(`✅ Dashboard found: ${expectedDashboard} (${widgetCount} widgets)`);
          } catch (error) {
            report.dashboards.push({
              name: expectedDashboard,
              status: 'error',
            });
            this.log(`❌ Error accessing dashboard: ${expectedDashboard}`, 'error');
          }
        } else {
          report.dashboards.push({
            name: expectedDashboard,
            status: 'missing',
          });
          this.log(`⚠️ Missing dashboard: ${expectedDashboard}`, 'warn');
        }
      }

    } catch (error) {
      this.log(`❌ Failed to validate dashboards: ${error}`, 'error');
    }
  }

  /**
   * Count widgets in dashboard JSON
   */
  private countDashboardWidgets(dashboardBody: string): number {
    try {
      const dashboard = JSON.parse(dashboardBody);
      let widgetCount = 0;
      
      if (dashboard.widgets) {
        widgetCount = dashboard.widgets.length;
      }
      
      return widgetCount;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Validate SNS alerting setup
   */
  private async validateAlerting(report: MonitoringReport): Promise<void> {
    this.log('📧 Checking SNS alerting setup...');

    try {
      const topicsResponse = await this.snsClient.send(new ListTopicsCommand({}));
      const topics = topicsResponse.Topics || [];

      const alertTopicArn = topics.find(topic => 
        topic.TopicArn?.includes(`trinity-alerts-${this.config.environment}`)
      );

      if (alertTopicArn) {
        report.alerting.snsTopicExists = true;
        
        try {
          const topicAttributes = await this.snsClient.send(
            new GetTopicAttributesCommand({ TopicArn: alertTopicArn.TopicArn })
          );
          
          const subscriptionsConfirmed = parseInt(
            topicAttributes.Attributes?.SubscriptionsConfirmed || '0'
          );
          
          report.alerting.subscriptions = subscriptionsConfirmed;
          report.alerting.emailConfigured = subscriptionsConfirmed > 0;
          
          this.log(`✅ Alert topic found with ${subscriptionsConfirmed} subscriptions`);
        } catch (error) {
          this.log(`⚠️ Could not get topic details: ${error}`, 'warn');
        }
      } else {
        this.log(`⚠️ Alert topic not found: trinity-alerts-${this.config.environment}`, 'warn');
      }

    } catch (error) {
      this.log(`❌ Failed to validate alerting: ${error}`, 'error');
    }
  }

  /**
   * Generate monitoring recommendations
   */
  private generateRecommendations(report: MonitoringReport): void {
    const recommendations: string[] = [];

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
  async setupCustomMetrics(): Promise<void> {
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
  generateReport(report: MonitoringReport): void {
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
  async execute(action: 'deploy' | 'validate' | 'setup'): Promise<boolean> {
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

    } catch (error) {
      this.log(`❌ Monitoring ${action} failed: ${error}`, 'error');
      return false;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const config: MonitoringConfig = {
    environment: args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev',
    region: args.find(arg => arg.startsWith('--region='))?.split('=')[1] || 'eu-west-1',
    alertEmail: args.find(arg => arg.startsWith('--email='))?.split('=')[1],
    enableDetailedMonitoring: args.includes('--detailed'),
    customMetrics: args.includes('--custom-metrics'),
  };
  
  const action = args[0] as 'deploy' | 'validate' | 'setup' || 'validate';
  
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

export { TrinityMonitoringManager, MonitoringConfig, MonitoringReport };